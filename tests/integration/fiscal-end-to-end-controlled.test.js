'use strict';

const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');
const forge = require('node-forge');

const {
  initializeOfflineDatabase,
  closeOfflineDatabase,
  upsertProductCache,
  upsertCustomerCache,
  upsertFiscalProfileCache,
  upsertFiscalNumberLease,
  getFiscalNumberLeaseById,
  getNfceDocumentBySaleId,
  getFiscalOutboxByFiscalId,
  getSaleById
} = require('../../offline-db');

const {
  storeFiscalA1Bundle
} = require('../../offline-fiscal-certificate-store');

const {
  extractPkcs12SigningMaterial
} = require('../../offline-fiscal-xml-signer');

const {
  runOfflinePaidSaleFiscalPipeline
} = require('../../offline-fiscal-sale-pipeline');

const {
  runFiscalReconnectCycle
} = require('../../offline-fiscal-runtime');

const {
  createSvrsProductionTransport,
  AUTH_ACTION,
  CONSULT_ACTION
} = require('../../offline-fiscal-svrs-transport');

const {
  withTempDir
} = require('../helpers/temp-dir');

const EMPRESA_ID = 'empresa-step65';
const DEVICE_ID = 'device-step65';
const LEASE_ID = 'lease-step65';

function makeSafeStorageFake() {
  return {
    isEncryptionAvailable() {
      return true;
    },
    encryptString(value) {
      return Buffer.from(
        `step65:${Buffer.from(String(value), 'utf8').toString('base64')}`,
        'utf8'
      );
    },
    decryptString(buffer) {
      const text = Buffer.from(buffer).toString('utf8');
      assert.match(text, /^step65:/);
      return Buffer.from(text.slice(7), 'base64').toString('utf8');
    }
  };
}

function createTestPkcs12() {
  const keys = forge.pki.rsa.generateKeyPair({
    bits: 1024,
    e: 0x10001
  });

  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '65';
  cert.validity.notBefore = new Date('2026-01-01T00:00:00.000Z');
  cert.validity.notAfter = new Date('2027-12-31T23:59:59.000Z');

  const attrs = [{
    name: 'commonName',
    value: 'E-Fisco Step65 Controlled Test'
  }, {
    name: 'organizationName',
    value: 'E-Fisco Tests'
  }, {
    shortName: 'C',
    value: 'BR'
  }];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([{
    name: 'basicConstraints',
    cA: false
  }, {
    name: 'keyUsage',
    digitalSignature: true,
    keyEncipherment: true
  }]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  const passphrase = 'step65-password';
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
    keys.privateKey,
    [cert],
    passphrase,
    {
      algorithm: '3des',
      friendlyName: 'step65-a1'
    }
  );

  return {
    pfxBuffer: Buffer.from(
      forge.asn1.toDer(p12Asn1).getBytes(),
      'binary'
    ),
    passphrase
  };
}

function seedFiscalEnvironment({
  userDataDir,
  safeStorage,
  pfxBuffer,
  passphrase
}) {
  upsertProductCache({
    empresaId: EMPRESA_ID,
    produtoId: 'produto-step65',
    codigo: 'P65',
    descricao: 'Produto E2E Step65',
    unidade: 'UN',
    precoCentavos: 1990,
    ativo: true,
    payload: {
      quantidadeEstoque: 100
    }
  });

  upsertCustomerCache({
    empresaId: EMPRESA_ID,
    clienteId: 'cliente-step65',
    nome: 'Consumidor E2E Step65',
    documento: '12345678901',
    telefone: '94999990000',
    ativo: true,
    payload: {
      source: 'step65'
    }
  });

  upsertFiscalProfileCache({
    empresaId: EMPRESA_ID,
    cnpj: '12345678000195',
    inscricaoEstadual: '123456789',
    razaoSocial: 'Empresa E2E Step65 Ltda',
    nomeFantasia: 'Step65',
    cep: '68525000',
    logradouro: 'Rua Controlada',
    numero: '65',
    bairro: 'Centro',
    municipio: 'Marabá',
    codigoMunicipio: '1504208',
    uf: 'PA',
    serieNfce: '1',
    ambiente: 'PRODUCAO',
    crt: '1',
    urlQrCode: 'https://sefaz.example/qrcode',
    urlConsultaChave: 'https://sefaz.example/consulta',
    revision: 'profile-step65',
    payload: {
      source: 'step65'
    }
  });

  upsertFiscalNumberLease({
    empresaId: EMPRESA_ID,
    leaseId: LEASE_ID,
    requestId: 'request-step65',
    deviceId: DEVICE_ID,
    ambiente: 'PRODUCAO',
    modelo: 65,
    serie: '1',
    numeroInicial: 650,
    numeroFinal: 659,
    proximoNumero: 650,
    status: 'ACTIVE',
    reservadoEm: '2026-09-25T10:00:00.000Z',
    expiraEm: '2027-09-25T10:00:00.000Z',
    payload: {
      source: 'step65'
    }
  });

  const material = extractPkcs12SigningMaterial({
    pfxBuffer,
    passphrase,
    now: new Date('2026-09-25T15:00:00.000Z')
  });

  try {
    storeFiscalA1Bundle({
      userDataDir,
      safeStorage,
      empresaId: EMPRESA_ID,
      deviceId: DEVICE_ID,
      certificateId: 'cert-step65',
      pfxBuffer,
      passphrase,
      fingerprintSha256: material.fingerprintSha256,
      validFrom: material.validFrom,
      validTo: material.validTo,
      storedAt: '2026-09-25T15:00:00.000Z'
    });
  } finally {
    material.privateKeyPem.fill(0);
    material.certificatePem.fill(0);
  }
}

function saleInput(suffix) {
  return {
    empresaId: EMPRESA_ID,
    saleId: `sale-step65-${suffix}`,
    operationId: `op-sale-step65-${suffix}`,
    clienteId: 'cliente-step65',
    status: 'PAID_OFFLINE_PENDING_SYNC',
    totalCentavos: 1990,
    occurredAt: '2026-09-25T12:00:00-03:00',
    paymentMethod: 'PIX',
    paymentParts: [{
      method: 'PIX',
      amount: 19.90
    }],
    items: [{
      itemId: `item-step65-${suffix}`,
      produtoId: 'produto-step65',
      quantidade: '1',
      unitPriceCentavos: 1990,
      totalCentavos: 1990,
      payload: {
        productCode: 'P65',
        name: 'Produto E2E Step65',
        unit: 'UN',
        ncm: '12345678',
        cfop: '5102',
        origem: '0',
        csosn: '102',
        cstPis: '04',
        cstCofins: '04'
      }
    }],
    dependencies: [],
    payload: {
      source: 'step65',
      saleNumber: suffix,
      operatorId: 'operador-step65',
      cpfCliente: '12345678901'
    }
  };
}

function protocolXml(key, protocol) {
  return [
    '<protNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">',
    '<infProt>',
    '<tpAmb>1</tpAmb>',
    '<verAplic>STEP65</verAplic>',
    `<chNFe>${key}</chNFe>`,
    '<dhRecbto>2026-09-25T12:05:00-03:00</dhRecbto>',
    `<nProt>${protocol}</nProt>`,
    '<digVal>AA==</digVal>',
    '<cStat>100</cStat>',
    '<xMotivo>Autorizado o uso da NF-e</xMotivo>',
    '</infProt>',
    '</protNFe>'
  ].join('');
}

function authorizationSoap(key, protocol) {
  const ns = AUTH_ACTION.replace('/nfeAutorizacaoLote', '');
  return [
    '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">',
    '<soap12:Body>',
    `<nfeResultMsg xmlns="${ns}">`,
    '<retEnviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">',
    '<tpAmb>1</tpAmb>',
    '<verAplic>STEP65</verAplic>',
    '<cStat>104</cStat>',
    '<xMotivo>Lote processado</xMotivo>',
    protocolXml(key, protocol),
    '</retEnviNFe>',
    '</nfeResultMsg>',
    '</soap12:Body>',
    '</soap12:Envelope>'
  ].join('');
}

function ambiguousAuthorizationSoap() {
  const ns = AUTH_ACTION.replace('/nfeAutorizacaoLote', '');
  return [
    '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">',
    '<soap12:Body>',
    `<nfeResultMsg xmlns="${ns}">`,
    '<retEnviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">',
    '<tpAmb>1</tpAmb>',
    '<verAplic>STEP65</verAplic>',
    '<cStat>204</cStat>',
    '<xMotivo>Duplicidade de NF-e</xMotivo>',
    '</retEnviNFe>',
    '</nfeResultMsg>',
    '</soap12:Body>',
    '</soap12:Envelope>'
  ].join('');
}

function consultationAuthorizedSoap(key, protocol) {
  const ns = CONSULT_ACTION.replace('/nfeConsultaNF', '');
  return [
    '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">',
    '<soap12:Body>',
    `<nfeResultMsg xmlns="${ns}">`,
    '<retConsSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">',
    '<tpAmb>1</tpAmb>',
    '<verAplic>STEP65</verAplic>',
    '<cStat>100</cStat>',
    '<xMotivo>Autorizado o uso da NF-e</xMotivo>',
    protocolXml(key, protocol),
    '</retConsSitNFe>',
    '</nfeResultMsg>',
    '</soap12:Body>',
    '</soap12:Envelope>'
  ].join('');
}

async function startControlledSvrs(handler) {
  const requests = [];

  const server = http.createServer((req, res) => {
    const chunks = [];

    req.on('data', (chunk) => {
      chunks.push(Buffer.from(chunk));
    });

    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      for (const chunk of chunks) chunk.fill(0);

      const record = {
        method: req.method,
        url: req.url,
        contentType: String(req.headers['content-type'] || ''),
        body
      };
      requests.push(record);

      try {
        const responseBody = handler(record, requests);
        res.statusCode = 200;
        res.setHeader(
          'content-type',
          'application/soap+xml; charset=utf-8'
        );
        res.end(responseBody);
      } catch (error) {
        res.statusCode = 500;
        res.end(String(error && error.message || error));
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  return {
    server,
    requests,
    authorizationUrl: `${base}/auth`,
    consultationUrl: `${base}/consult`
  };
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

function assertFinalXmlRequest(record, key) {
  assert.equal(record.method, 'POST');
  assert.match(record.contentType, /application\/soap\+xml/);
  assert.match(record.body, /<enviNFe/);
  assert.match(record.body, new RegExp(`NFe${key}`));
  assert.match(record.body, /<infNFeSupl>/);
  assert.match(record.body, /<qrCode>/);
  assert.match(record.body, /<Signature/);
}

test('pipeline completo -> SOAP local -> AUTHORIZED persiste após restart', async () => {
  await withTempDir(async (userDataDir) => {
    const safeStorage = makeSafeStorageFake();
    const certificate = createTestPkcs12();
    let svrs = null;
    let pipeline;

    try {
      initializeOfflineDatabase({ userDataDir });

      seedFiscalEnvironment({
        userDataDir,
        safeStorage,
        pfxBuffer: certificate.pfxBuffer,
        passphrase: certificate.passphrase
      });

      pipeline = runOfflinePaidSaleFiscalPipeline(
        saleInput('direct'),
        {
          deviceId: DEVICE_ID,
          userDataDir,
          safeStorage,
          now: '2026-09-25T15:00:00.000Z'
        }
      );

      assert.equal(pipeline.enabled, true);
      assert.equal(pipeline.resumed, false);
      assert.equal(pipeline.danfeReady, true);
      assert.equal(pipeline.document.state, 'CONTINGENCIA_PENDENTE');
      assert.match(
        pipeline.document.signedXmlSha256,
        /^[0-9A-F]{64}$/
      );
      assert.match(pipeline.document.qrCodeText, /\?p=/);
      assert.equal(pipeline.fiscalOutbox.status, 'PENDING');
      assert.equal(pipeline.fiscalOutbox.action, 'TRANSMIT');
      assert.equal(pipeline.nextLeaseNumber, 651);

      const key = pipeline.document.chaveAcesso;

      svrs = await startControlledSvrs((record) => {
        assert.equal(record.url, '/auth');
        assertFinalXmlRequest(record, key);
        return authorizationSoap(
          key,
          '150260000000651'
        );
      });

      const transport = createSvrsProductionTransport({
        empresaId: EMPRESA_ID,
        deviceId: DEVICE_ID,
        authorizationUrl: svrs.authorizationUrl,
        consultationUrl: svrs.consultationUrl,
        allowInsecureLocalhost: true,
        timeoutMs: 5000
      });

      const cycle = await runFiscalReconnectCycle({
        enabled: true,
        empresaId: EMPRESA_ID,
        deviceId: DEVICE_ID,
        transport,
        now: '2026-09-25T15:01:00.000Z',
        retryDelayMs: 1000,
        reconcileDelayMs: 1000
      });

      assert.equal(cycle.enabled, true);
      assert.equal(cycle.locked, false);
      assert.equal(cycle.recoveredStale, 0);
      assert.equal(cycle.summary.considered, 1);
      assert.equal(cycle.summary.claimed, 1);
      assert.equal(cycle.summary.authorized, 1);
      assert.equal(svrs.requests.length, 1);

      const document = getNfceDocumentBySaleId(
        EMPRESA_ID,
        pipeline.document.saleId
      );
      const outbox = getFiscalOutboxByFiscalId(
        EMPRESA_ID,
        pipeline.document.fiscalId
      );

      assert.equal(document.state, 'AUTHORIZED');
      assert.equal(document.protocolo, '150260000000651');
      assert.equal(document.sefazCStat, '100');
      assert.equal(Buffer.isBuffer(document.processedXml), true);
      assert.match(
        document.processedXml.toString('utf8'),
        /<nfeProc/
      );

      assert.equal(outbox.status, 'CONFIRMED');
      assert.equal(outbox.attempts, 1);
      assert.equal(outbox.remoteAck.kind, 'AUTHORIZED');

      const lease = getFiscalNumberLeaseById(
        EMPRESA_ID,
        LEASE_ID
      );
      assert.equal(lease.proximoNumero, 651);

      closeOfflineDatabase();

      const reopened = initializeOfflineDatabase({ userDataDir });
      assert.equal(reopened.reused, false);

      const persistedDocument = getNfceDocumentBySaleId(
        EMPRESA_ID,
        pipeline.document.saleId
      );
      const persistedOutbox = getFiscalOutboxByFiscalId(
        EMPRESA_ID,
        pipeline.document.fiscalId
      );
      const persistedSale = getSaleById(
        EMPRESA_ID,
        pipeline.document.saleId
      );

      assert.equal(persistedDocument.state, 'AUTHORIZED');
      assert.equal(
        persistedDocument.protocolo,
        '150260000000651'
      );
      assert.equal(persistedOutbox.status, 'CONFIRMED');
      assert.equal(persistedOutbox.attempts, 1);
      assert.equal(persistedSale.totalCentavos, 1990);
      assert.equal(persistedSale.items.length, 1);
    } finally {
      if (svrs) {
        await closeServer(svrs.server);
      }
      try {
        closeOfflineDatabase();
      } catch (_) {}
      certificate.pfxBuffer.fill(0);
    }
  }, 'efisco-step65-direct-');
});

test('pipeline completo -> SOAP ambíguo -> consulta por chave -> AUTHORIZED sem retransmitir', async () => {
  await withTempDir(async (userDataDir) => {
    const safeStorage = makeSafeStorageFake();
    const certificate = createTestPkcs12();
    let svrs = null;

    try {
      initializeOfflineDatabase({ userDataDir });

      seedFiscalEnvironment({
        userDataDir,
        safeStorage,
        pfxBuffer: certificate.pfxBuffer,
        passphrase: certificate.passphrase
      });

      const pipeline = runOfflinePaidSaleFiscalPipeline(
        saleInput('reconcile'),
        {
          deviceId: DEVICE_ID,
          userDataDir,
          safeStorage,
          now: '2026-09-25T15:10:00.000Z'
        }
      );

      const key = pipeline.document.chaveAcesso;
      let authCalls = 0;
      let consultCalls = 0;

      svrs = await startControlledSvrs((record) => {
        if (record.url === '/auth') {
          authCalls += 1;
          assertFinalXmlRequest(record, key);
          return ambiguousAuthorizationSoap();
        }

        if (record.url === '/consult') {
          consultCalls += 1;
          assert.match(record.body, /<consSitNFe/);
          assert.match(record.body, new RegExp(key));
          assert.doesNotMatch(record.body, /<enviNFe/);
          return consultationAuthorizedSoap(
            key,
            '150260000000652'
          );
        }

        throw new Error(`Endpoint inesperado: ${record.url}`);
      });

      const transport = createSvrsProductionTransport({
        empresaId: EMPRESA_ID,
        deviceId: DEVICE_ID,
        authorizationUrl: svrs.authorizationUrl,
        consultationUrl: svrs.consultationUrl,
        allowInsecureLocalhost: true,
        timeoutMs: 5000
      });

      const first = await runFiscalReconnectCycle({
        enabled: true,
        empresaId: EMPRESA_ID,
        deviceId: DEVICE_ID,
        transport,
        now: '2026-09-25T15:11:00.000Z',
        retryDelayMs: 1000,
        reconcileDelayMs: 1000
      });

      assert.equal(first.summary.claimed, 1);
      assert.equal(first.summary.reconcile, 1);
      assert.equal(first.summary.authorized, 0);
      assert.equal(authCalls, 1);
      assert.equal(consultCalls, 0);

      let outbox = getFiscalOutboxByFiscalId(
        EMPRESA_ID,
        pipeline.document.fiscalId
      );
      let document = getNfceDocumentBySaleId(
        EMPRESA_ID,
        pipeline.document.saleId
      );

      assert.equal(outbox.status, 'RETRY');
      assert.equal(outbox.action, 'RECONCILE_BY_KEY');
      assert.equal(outbox.attempts, 1);
      assert.equal(document.state, 'RECONCILE_BY_KEY');

      const second = await runFiscalReconnectCycle({
        enabled: true,
        empresaId: EMPRESA_ID,
        deviceId: DEVICE_ID,
        transport,
        now: '2026-09-25T15:11:01.000Z',
        retryDelayMs: 1000,
        reconcileDelayMs: 1000
      });

      assert.equal(second.summary.claimed, 1);
      assert.equal(second.summary.authorized, 1);
      assert.equal(authCalls, 1);
      assert.equal(consultCalls, 1);
      assert.equal(svrs.requests.length, 2);

      outbox = getFiscalOutboxByFiscalId(
        EMPRESA_ID,
        pipeline.document.fiscalId
      );
      document = getNfceDocumentBySaleId(
        EMPRESA_ID,
        pipeline.document.saleId
      );

      assert.equal(outbox.status, 'CONFIRMED');
      assert.equal(outbox.action, 'RECONCILE_BY_KEY');
      assert.equal(outbox.attempts, 2);
      assert.equal(outbox.remoteAck.kind, 'AUTHORIZED');

      assert.equal(document.state, 'AUTHORIZED');
      assert.equal(document.protocolo, '150260000000652');
      assert.equal(document.sefazCStat, '100');

      const third = await runFiscalReconnectCycle({
        enabled: true,
        empresaId: EMPRESA_ID,
        deviceId: DEVICE_ID,
        transport,
        now: '2026-09-25T15:12:00.000Z',
        retryDelayMs: 1000,
        reconcileDelayMs: 1000
      });

      assert.equal(third.summary.considered, 0);
      assert.equal(authCalls, 1);
      assert.equal(consultCalls, 1);
    } finally {
      if (svrs) {
        await closeServer(svrs.server);
      }
      try {
        closeOfflineDatabase();
      } catch (_) {}
      certificate.pfxBuffer.fill(0);
    }
  }, 'efisco-step65-reconcile-');
});
