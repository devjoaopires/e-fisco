'use strict';

const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  initializeOfflineDatabase,
  closeOfflineDatabase,
  upsertProductCache,
  upsertFiscalProfileCache,
  upsertFiscalNumberLease,
  registerOfflineSaleAtomic,
  persistSignedNfceContingency,
  persistNfceQrCode,
  ensureFiscalOutboxForPendingNfce,
  getFiscalOutboxByFiscalId,
  getNfceDocumentByFiscalId,
  claimFiscalOutboxOperation,
  recoverStaleFiscalOutbox
} = require('../../offline-db');

const {
  processFiscalOutboxOnce
} = require('../../offline-fiscal-outbox-worker');

const {
  AUTH_ACTION,
  CONSULT_ACTION,
  parseAuthorizationResponse,
  parseConsultationResponse
} = require('../../offline-fiscal-svrs-transport');

const {
  withTempDir
} = require('../helpers/temp-dir');

const EMPRESA_ID = 'empresa-step64';
const DEVICE_ID = 'device-step64';
const LEASE_ID = 'lease-step64';

async function withFreshDatabase(callback) {
  return withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });
      return await callback();
    } finally {
      try {
        closeOfflineDatabase();
      } catch (_) {}
    }
  }, 'efisco-step64-outbox-');
}

function seedFiscalBase() {
  upsertProductCache({
    empresaId: EMPRESA_ID,
    produtoId: 'produto-step64',
    codigo: 'P64',
    descricao: 'Produto Step64',
    unidade: 'UN',
    precoCentavos: 1000,
    ativo: true,
    payload: {
      quantidadeEstoque: 100
    }
  });

  upsertFiscalProfileCache({
    empresaId: EMPRESA_ID,
    cnpj: '12345678000195',
    inscricaoEstadual: '123456789',
    razaoSocial: 'Empresa Step64',
    nomeFantasia: 'Step64',
    cep: '68525000',
    logradouro: 'Rua Teste',
    numero: '64',
    bairro: 'Centro',
    municipio: 'Marabá',
    codigoMunicipio: '1504208',
    uf: 'PA',
    serieNfce: '1',
    ambiente: 'PRODUCAO',
    crt: '1',
    urlQrCode: 'https://sefaz.example/qrcode',
    urlConsultaChave: 'https://sefaz.example/consulta',
    revision: 'profile-step64',
    payload: {
      source: 'step64'
    }
  });

  upsertFiscalNumberLease({
    empresaId: EMPRESA_ID,
    leaseId: LEASE_ID,
    requestId: 'request-step64',
    deviceId: DEVICE_ID,
    ambiente: 'PRODUCAO',
    modelo: 65,
    serie: '1',
    numeroInicial: 640,
    numeroFinal: 699,
    proximoNumero: 640,
    status: 'ACTIVE',
    reservadoEm: '2026-09-25T10:00:00.000Z',
    expiraEm: '2027-09-25T10:00:00.000Z',
    payload: {
      source: 'step64'
    }
  });
}

function createPendingFiscalDocument(suffix) {
  const saleId = `sale-step64-${suffix}`;
  const fiscalId = `nfce:${saleId}`;
  const operationId = `op-step64-${suffix}`;

  const sale = registerOfflineSaleAtomic({
    empresaId: EMPRESA_ID,
    saleId,
    operationId,
    status: 'PAID_OFFLINE_PENDING_SYNC',
    totalCentavos: 1000,
    occurredAt: '2026-09-25T12:00:00-03:00',
    paymentMethod: 'PIX',
    paymentParts: [{
      method: 'PIX',
      amount: 10
    }],
    items: [{
      itemId: `item-step64-${suffix}`,
      produtoId: 'produto-step64',
      quantidade: '1',
      unitPriceCentavos: 1000,
      totalCentavos: 1000,
      payload: {
        ncm: '12345678',
        cfop: '5102',
        origem: '0',
        csosn: '102',
        cstPis: '04',
        cstCofins: '04'
      }
    }],
    dependencies: [],
    fiscalAllocation: {
      leaseId: LEASE_ID,
      deviceId: DEVICE_ID,
      fiscalId,
      operationId: `${operationId}:nfce`,
      xJust: 'Contingência offline controlada para teste step64.'
    },
    payload: {
      source: 'step64'
    }
  });

  assert.equal(sale.applied, true);

  persistSignedNfceContingency({
    empresaId: EMPRESA_ID,
    saleId,
    signedXml: `<signed fiscal="${fiscalId}">step64</signed>`
  });

  persistNfceQrCode({
    empresaId: EMPRESA_ID,
    saleId,
    qrCodeText:
      `https://sefaz.example/qrcode?p=${suffix}-${'Q'.repeat(160)}`
  });

  const outbox = ensureFiscalOutboxForPendingNfce({
    empresaId: EMPRESA_ID,
    saleId,
    createdAt: '2026-09-25T15:00:00.000Z'
  });

  assert.equal(outbox.action, 'TRANSMIT');
  assert.equal(outbox.status, 'PENDING');

  return {
    saleId,
    fiscalId,
    operationId,
    chaveAcesso: sale.fiscal.chaveAcesso
  };
}

function buildFinalXml(document) {
  const xml =
    `<final fiscal="${document.fiscalId}" chave="${document.chaveAcesso}">step64</final>`;
  return {
    xml,
    sha256: crypto
      .createHash('sha256')
      .update(xml, 'utf8')
      .digest('hex')
      .toUpperCase()
  };
}

function authorizedResult(suffix = '001') {
  return {
    kind: 'AUTHORIZED',
    protocolo: `150260000000${suffix}`,
    cStat: '100',
    xMotivo: 'Autorizado o uso da NF-e',
    autorizadoEm: '2026-09-25T12:01:00-03:00',
    processedXml: `<nfeProc>authorized-${suffix}</nfeProc>`
  };
}

test('NOT_SENT mantém TRANSMIT em retry e depois autoriza o mesmo XML fixado', async () => {
  await withFreshDatabase(async () => {
    seedFiscalBase();
    const fixture = createPendingFiscalDocument('not-sent');

    const hashes = [];
    let transmitCalls = 0;
    const transport = {
      async transmit(input) {
        transmitCalls += 1;
        hashes.push(input.xmlSha256);
        if (transmitCalls === 1) {
          return {
            kind: 'NOT_SENT',
            error: 'serviço indisponível antes do envio'
          };
        }
        return authorizedResult('101');
      },
      async reconcileByKey() {
        throw new Error('reconcile não deveria ser chamado');
      }
    };

    const first = await processFiscalOutboxOnce({
      empresaId: EMPRESA_ID,
      transport,
      buildFinalXml,
      now: '2026-09-25T15:00:00.000Z',
      retryDelayMs: 1000
    });

    assert.equal(first.retry, 1);
    assert.equal(first.claimed, 1);
    assert.equal(transmitCalls, 1);

    const retry = getFiscalOutboxByFiscalId(
      EMPRESA_ID,
      fixture.fiscalId
    );

    assert.equal(retry.status, 'RETRY');
    assert.equal(retry.action, 'TRANSMIT');
    assert.equal(retry.attempts, 1);
    assert.equal(
      retry.nextAttemptAt,
      '2026-09-25T15:00:01.000Z'
    );
    assert.equal(
      getNfceDocumentByFiscalId(
        EMPRESA_ID,
        fixture.fiscalId
      ).state,
      'CONTINGENCIA_PENDENTE'
    );

    const early = await processFiscalOutboxOnce({
      empresaId: EMPRESA_ID,
      transport,
      buildFinalXml,
      now: '2026-09-25T15:00:00.999Z',
      retryDelayMs: 1000
    });

    assert.equal(early.considered, 0);
    assert.equal(transmitCalls, 1);

    const second = await processFiscalOutboxOnce({
      empresaId: EMPRESA_ID,
      transport,
      buildFinalXml,
      now: '2026-09-25T15:00:01.000Z',
      retryDelayMs: 1000
    });

    assert.equal(second.authorized, 1);
    assert.equal(transmitCalls, 2);
    assert.equal(hashes.length, 2);
    assert.equal(hashes[0], hashes[1]);

    const confirmed = getFiscalOutboxByFiscalId(
      EMPRESA_ID,
      fixture.fiscalId
    );

    assert.equal(confirmed.status, 'CONFIRMED');
    assert.equal(confirmed.attempts, 2);
    assert.equal(
      getNfceDocumentByFiscalId(
        EMPRESA_ID,
        fixture.fiscalId
      ).state,
      'AUTHORIZED'
    );
  });
});

test('erro ambíguo transmite -> reconcilia -> NOT_FOUND seguro -> retransmite', async () => {
  await withFreshDatabase(async () => {
    seedFiscalBase();
    const fixture = createPendingFiscalDocument('safe-retransmit');

    let transmitCalls = 0;
    let reconcileCalls = 0;
    const hashes = [];

    const transport = {
      async transmit(input) {
        transmitCalls += 1;
        hashes.push(input.xmlSha256);
        if (transmitCalls === 1) {
          throw new Error('conexão caiu após envio');
        }
        return authorizedResult('102');
      },
      async reconcileByKey(input) {
        reconcileCalls += 1;
        hashes.push(input.xmlSha256);
        return {
          kind: 'NOT_FOUND',
          safeToRetransmit: true,
          error: 'chave não localizada'
        };
      }
    };

    const ambiguous = await processFiscalOutboxOnce({
      empresaId: EMPRESA_ID,
      transport,
      buildFinalXml,
      now: '2026-09-25T15:10:00.000Z',
      reconcileDelayMs: 1000,
      retryDelayMs: 1000
    });

    assert.equal(ambiguous.reconcile, 1);

    let operation = getFiscalOutboxByFiscalId(
      EMPRESA_ID,
      fixture.fiscalId
    );

    assert.equal(operation.status, 'RETRY');
    assert.equal(operation.action, 'RECONCILE_BY_KEY');
    assert.equal(
      getNfceDocumentByFiscalId(
        EMPRESA_ID,
        fixture.fiscalId
      ).state,
      'RECONCILE_BY_KEY'
    );

    const reconciled = await processFiscalOutboxOnce({
      empresaId: EMPRESA_ID,
      transport,
      buildFinalXml,
      now: '2026-09-25T15:10:01.000Z',
      reconcileDelayMs: 1000,
      retryDelayMs: 1000
    });

    assert.equal(reconciled.retry, 1);
    assert.equal(reconcileCalls, 1);

    operation = getFiscalOutboxByFiscalId(
      EMPRESA_ID,
      fixture.fiscalId
    );

    assert.equal(operation.status, 'RETRY');
    assert.equal(operation.action, 'TRANSMIT');
    assert.equal(
      getNfceDocumentByFiscalId(
        EMPRESA_ID,
        fixture.fiscalId
      ).state,
      'CONTINGENCIA_PENDENTE'
    );

    const final = await processFiscalOutboxOnce({
      empresaId: EMPRESA_ID,
      transport,
      buildFinalXml,
      now: '2026-09-25T15:10:02.000Z',
      retryDelayMs: 1000
    });

    assert.equal(final.authorized, 1);
    assert.equal(transmitCalls, 2);
    assert.equal(reconcileCalls, 1);
    assert.equal(new Set(hashes).size, 1);

    operation = getFiscalOutboxByFiscalId(
      EMPRESA_ID,
      fixture.fiscalId
    );

    assert.equal(operation.status, 'CONFIRMED');
    assert.equal(operation.attempts, 3);
  });
});

test('reconciliação por chave pode confirmar documento já autorizado sem retransmitir', async () => {
  await withFreshDatabase(async () => {
    seedFiscalBase();
    const fixture = createPendingFiscalDocument('reconcile-authorized');

    let transmitCalls = 0;
    let reconcileCalls = 0;

    const transport = {
      async transmit() {
        transmitCalls += 1;
        return {
          kind: 'AMBIGUOUS',
          error: 'duplicidade; consultar chave'
        };
      },
      async reconcileByKey() {
        reconcileCalls += 1;
        return authorizedResult('103');
      }
    };

    await processFiscalOutboxOnce({
      empresaId: EMPRESA_ID,
      transport,
      buildFinalXml,
      now: '2026-09-25T15:20:00.000Z',
      reconcileDelayMs: 1000
    });

    const result = await processFiscalOutboxOnce({
      empresaId: EMPRESA_ID,
      transport,
      buildFinalXml,
      now: '2026-09-25T15:20:01.000Z',
      reconcileDelayMs: 1000
    });

    assert.equal(result.authorized, 1);
    assert.equal(transmitCalls, 1);
    assert.equal(reconcileCalls, 1);

    const operation = getFiscalOutboxByFiscalId(
      EMPRESA_ID,
      fixture.fiscalId
    );
    const document = getNfceDocumentByFiscalId(
      EMPRESA_ID,
      fixture.fiscalId
    );

    assert.equal(operation.status, 'CONFIRMED');
    assert.equal(operation.action, 'RECONCILE_BY_KEY');
    assert.equal(operation.remoteAck.kind, 'AUTHORIZED');
    assert.equal(document.state, 'AUTHORIZED');
    assert.equal(document.protocolo, '150260000000103');
  });
});

test('CONFLICT trava outbox e documento para revisão manual', async () => {
  await withFreshDatabase(async () => {
    seedFiscalBase();
    const fixture = createPendingFiscalDocument('conflict');

    const transport = {
      async transmit() {
        return {
          kind: 'CONFLICT',
          cStat: '539',
          xMotivo: 'Duplicidade com diferença na chave',
          error: 'conflito fiscal controlado'
        };
      },
      async reconcileByKey() {
        throw new Error('não deveria reconciliar');
      }
    };

    const summary = await processFiscalOutboxOnce({
      empresaId: EMPRESA_ID,
      transport,
      buildFinalXml,
      now: '2026-09-25T15:30:00.000Z'
    });

    assert.equal(summary.manualReview, 1);

    const operation = getFiscalOutboxByFiscalId(
      EMPRESA_ID,
      fixture.fiscalId
    );
    const document = getNfceDocumentByFiscalId(
      EMPRESA_ID,
      fixture.fiscalId
    );

    assert.equal(operation.status, 'CONFLICT');
    assert.equal(operation.action, 'TRANSMIT');
    assert.equal(operation.nextAttemptAt, null);
    assert.equal(operation.remoteAck.kind, 'CONFLICT');
    assert.equal(operation.remoteAck.cStat, '539');
    assert.equal(document.state, 'MANUAL_REVIEW');

    const again = await processFiscalOutboxOnce({
      empresaId: EMPRESA_ID,
      transport,
      buildFinalXml,
      now: '2026-09-25T16:30:00.000Z'
    });

    assert.equal(again.considered, 0);
  });
});

test('limite de tentativas bloqueia novas chamadas automáticas', async () => {
  await withFreshDatabase(async () => {
    seedFiscalBase();
    const fixture = createPendingFiscalDocument('max-attempts');

    let calls = 0;
    const transport = {
      async transmit() {
        calls += 1;
        return {
          kind: 'NOT_SENT',
          error: 'indisponível'
        };
      },
      async reconcileByKey() {
        throw new Error('não deveria reconciliar');
      }
    };

    await processFiscalOutboxOnce({
      empresaId: EMPRESA_ID,
      transport,
      buildFinalXml,
      now: '2026-09-25T15:40:00.000Z',
      retryDelayMs: 1000,
      maxAttempts: 2
    });

    await processFiscalOutboxOnce({
      empresaId: EMPRESA_ID,
      transport,
      buildFinalXml,
      now: '2026-09-25T15:40:01.000Z',
      retryDelayMs: 1000,
      maxAttempts: 2
    });

    assert.equal(calls, 2);

    const blocked = await processFiscalOutboxOnce({
      empresaId: EMPRESA_ID,
      transport,
      buildFinalXml,
      now: '2026-09-25T15:40:02.000Z',
      retryDelayMs: 1000,
      maxAttempts: 2
    });

    assert.equal(blocked.manualReview, 1);
    assert.equal(blocked.claimed, 0);
    assert.equal(calls, 2);

    const operation = getFiscalOutboxByFiscalId(
      EMPRESA_ID,
      fixture.fiscalId
    );

    assert.equal(operation.status, 'MANUAL_REVIEW');
    assert.match(operation.lastError, /Limite de 2 tentativas/);
    assert.equal(
      getNfceDocumentByFiscalId(
        EMPRESA_ID,
        fixture.fiscalId
      ).state,
      'MANUAL_REVIEW'
    );
  });
});

test('SENDING abandonado é recuperado sempre por reconciliação antes de reenvio', async () => {
  await withFreshDatabase(async () => {
    seedFiscalBase();
    const fixture = createPendingFiscalDocument('stale');

    const final = buildFinalXml(
      getNfceDocumentByFiscalId(
        EMPRESA_ID,
        fixture.fiscalId
      )
    );

    const claim = claimFiscalOutboxOperation({
      empresaId: EMPRESA_ID,
      fiscalId: fixture.fiscalId,
      finalXmlSha256: final.sha256,
      now: '2026-09-25T15:50:00.000Z'
    });

    assert.equal(claim.claimed, true);
    assert.equal(claim.operation.status, 'SENDING');
    assert.equal(claim.operation.action, 'TRANSMIT');

    const recovered = recoverStaleFiscalOutbox({
      empresaId: EMPRESA_ID,
      staleBefore: '2026-09-25T15:50:00.000Z',
      now: '2026-09-25T16:00:00.000Z',
      nextAttemptAt: '2026-09-25T16:00:00.000Z'
    });

    assert.equal(recovered, 1);

    const operation = getFiscalOutboxByFiscalId(
      EMPRESA_ID,
      fixture.fiscalId
    );

    assert.equal(operation.status, 'RETRY');
    assert.equal(operation.action, 'RECONCILE_BY_KEY');
    assert.equal(operation.sendingStartedAt, null);
    assert.equal(
      operation.nextAttemptAt,
      '2026-09-25T16:00:00.000Z'
    );
    assert.match(operation.lastError, /reconciliar por chave/);
    assert.equal(
      getNfceDocumentByFiscalId(
        EMPRESA_ID,
        fixture.fiscalId
      ).state,
      'RECONCILE_BY_KEY'
    );
  });
});

function soapResult(wsdlNamespace, payload) {
  return [
    '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">',
    '<soap12:Body>',
    `<nfeResultMsg xmlns="${wsdlNamespace}">`,
    payload,
    '</nfeResultMsg>',
    '</soap12:Body>',
    '</soap12:Envelope>'
  ].join('');
}

test('parser SVRS separa não enviado, ambíguo e ausência segura por chave', () => {
  const key = '1'.repeat(44);
  const originalXml =
    `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${key}" versao="4.00"/></NFe>`;

  const unavailable = parseAuthorizationResponse(
    soapResult(
      AUTH_ACTION.replace('/nfeAutorizacaoLote', ''),
      [
        '<retEnviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">',
        '<tpAmb>1</tpAmb><cStat>108</cStat>',
        '<xMotivo>Serviço Paralisado Momentaneamente</xMotivo>',
        '</retEnviNFe>'
      ].join('')
    ),
    key,
    originalXml
  );

  assert.equal(unavailable.kind, 'NOT_SENT');
  assert.equal(unavailable.cStat, '108');

  const duplicate = parseAuthorizationResponse(
    soapResult(
      AUTH_ACTION.replace('/nfeAutorizacaoLote', ''),
      [
        '<retEnviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">',
        '<tpAmb>1</tpAmb><cStat>204</cStat>',
        '<xMotivo>Duplicidade de NF-e</xMotivo>',
        '</retEnviNFe>'
      ].join('')
    ),
    key,
    originalXml
  );

  assert.equal(duplicate.kind, 'AMBIGUOUS');
  assert.equal(duplicate.cStat, '204');

  const missing = parseConsultationResponse(
    soapResult(
      CONSULT_ACTION.replace('/nfeConsultaNF', ''),
      [
        '<retConsSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">',
        '<tpAmb>1</tpAmb><cStat>217</cStat>',
        '<xMotivo>NF-e não consta na base de dados</xMotivo>',
        '</retConsSitNFe>'
      ].join('')
    ),
    key,
    originalXml
  );

  assert.equal(missing.kind, 'NOT_FOUND');
  assert.equal(missing.safeToRetransmit, true);
  assert.equal(missing.cStat, '217');
});

test('consulta SVRS autorizada reconstrói nfeProc do mesmo XML e mesma chave', () => {
  const key = '2'.repeat(44);
  const originalXml =
    `<?xml version="1.0" encoding="UTF-8"?><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${key}" versao="4.00"/></NFe>`;

  const body = soapResult(
    CONSULT_ACTION.replace('/nfeConsultaNF', ''),
    [
      '<retConsSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">',
      '<tpAmb>1</tpAmb><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo>',
      '<protNFe versao="4.00"><infProt>',
      '<tpAmb>1</tpAmb>',
      '<verAplic>SVRS</verAplic>',
      `<chNFe>${key}</chNFe>`,
      '<dhRecbto>2026-09-25T12:01:00-03:00</dhRecbto>',
      '<nProt>150260000000104</nProt>',
      '<digVal>AA==</digVal>',
      '<cStat>100</cStat>',
      '<xMotivo>Autorizado o uso da NF-e</xMotivo>',
      '</infProt></protNFe>',
      '</retConsSitNFe>'
    ].join('')
  );

  const result = parseConsultationResponse(
    body,
    key,
    originalXml
  );

  assert.equal(result.kind, 'AUTHORIZED');
  assert.equal(result.protocolo, '150260000000104');
  assert.equal(result.cStat, '100');
  assert.match(result.processedXml, /<nfeProc/);
  assert.match(result.processedXml, new RegExp(`NFe${key}`));
  assert.match(result.processedXml, /150260000000104/);
});
