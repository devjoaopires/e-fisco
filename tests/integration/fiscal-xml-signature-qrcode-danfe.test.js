'use strict';

const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const forge = require('node-forge');
const { DOMParser } = require('@xmldom/xmldom');

const {
  initializeOfflineDatabase,
  closeOfflineDatabase,
  upsertProductCache,
  upsertCustomerCache,
  upsertFiscalProfileCache,
  upsertFiscalNumberLease,
  registerOfflineSaleAtomic,
  getNfceDocumentBySaleId,
  persistSignedNfceContingency
} = require('../../offline-db');

const {
  generateUnsignedNfceXml
} = require('../../offline-fiscal-nfce-xml');

const {
  extractPkcs12SigningMaterial,
  verifySignedNfeXml,
  signNfeXmlWithPkcs12
} = require('../../offline-fiscal-xml-signer');

const {
  storeFiscalA1Bundle
} = require('../../offline-fiscal-certificate-store');

const {
  parseSignedNfceDocument,
  validateQrTextAgainstSignedXml,
  buildNfceXmlWithSupplement,
  finalizeNfceContingencyQrCode
} = require('../../offline-fiscal-nfce-qrcode');

const {
  buildDanfeContingencyModels,
  generateDanfeContingencyForSale
} = require('../../offline-fiscal-nfce-danfe');

const {
  withTempDir
} = require('../helpers/temp-dir');

const EMPRESA_ID = 'empresa-step63';
const DEVICE_ID = 'device-step63';
const SALE_ID = 'sale-step63';
const OPERATION_ID = 'op-sale-step63';
const FISCAL_ID = 'nfce:sale-step63';
const LEASE_ID = 'lease-step63';

function makeSafeStorageFake() {
  return {
    isEncryptionAvailable() {
      return true;
    },
    encryptString(value) {
      return Buffer.from(
        `step63:${Buffer.from(String(value), 'utf8').toString('base64')}`,
        'utf8'
      );
    },
    decryptString(buffer) {
      const text = Buffer.from(buffer).toString('utf8');
      assert.match(text, /^step63:/);
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
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date('2026-01-01T00:00:00.000Z');
  cert.validity.notAfter = new Date('2027-12-31T23:59:59.000Z');

  const attrs = [{
    name: 'commonName',
    value: 'E-Fisco Step63 Test Certificate'
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

  const passphrase = 'step63-password';
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
    keys.privateKey,
    [cert],
    passphrase,
    {
      algorithm: '3des',
      friendlyName: 'step63-a1'
    }
  );

  const pfxBuffer = Buffer.from(
    forge.asn1.toDer(p12Asn1).getBytes(),
    'binary'
  );

  return {
    pfxBuffer,
    passphrase
  };
}

async function withFiscalFixture(callback) {
  return withTempDir(async (userDataDir) => {
    const certificate = createTestPkcs12();
    const safeStorage = makeSafeStorageFake();

    try {
      initializeOfflineDatabase({ userDataDir });

      upsertProductCache({
        empresaId: EMPRESA_ID,
        produtoId: 'produto-step63',
        codigo: 'P63',
        descricao: 'Produto XML Step63',
        unidade: 'UN',
        precoCentavos: 1234,
        ativo: true,
        payload: {
          quantidadeEstoque: 100
        }
      });

      upsertCustomerCache({
        empresaId: EMPRESA_ID,
        clienteId: 'cliente-step63',
        nome: 'Consumidor Step63',
        documento: '12345678901',
        telefone: '94999990000',
        ativo: true,
        payload: {
          source: 'step63'
        }
      });

      upsertFiscalProfileCache({
        empresaId: EMPRESA_ID,
        cnpj: '12345678000195',
        inscricaoEstadual: '123456789',
        razaoSocial: 'Empresa XML Step63 Ltda',
        nomeFantasia: 'Step63',
        cep: '68525000',
        logradouro: 'Rua de Teste',
        numero: '63',
        complemento: 'Sala 1',
        bairro: 'Centro',
        municipio: 'Marabá',
        codigoMunicipio: '1504208',
        uf: 'PA',
        serieNfce: '1',
        ambiente: 'PRODUCAO',
        crt: '1',
        urlQrCode: 'https://sefaz.example/qrcode',
        urlConsultaChave: 'https://sefaz.example/consulta',
        revision: 'profile-step63',
        payload: {
          source: 'step63'
        }
      });

      upsertFiscalNumberLease({
        empresaId: EMPRESA_ID,
        leaseId: LEASE_ID,
        requestId: 'request-step63',
        deviceId: DEVICE_ID,
        ambiente: 'PRODUCAO',
        modelo: 65,
        serie: '1',
        numeroInicial: 630,
        numeroFinal: 639,
        proximoNumero: 630,
        status: 'ACTIVE',
        reservadoEm: '2026-09-25T10:00:00.000Z',
        expiraEm: '2027-09-25T10:00:00.000Z',
        payload: {
          source: 'step63'
        }
      });

      const sale = registerOfflineSaleAtomic({
        empresaId: EMPRESA_ID,
        saleId: SALE_ID,
        operationId: OPERATION_ID,
        clienteId: 'cliente-step63',
        status: 'PAID_OFFLINE_PENDING_SYNC',
        totalCentavos: 1234,
        occurredAt: '2026-09-25T12:34:56-03:00',
        paymentMethod: 'PIX',
        paymentParts: [{
          method: 'PIX',
          amount: 12.34
        }],
        items: [{
          itemId: 'item-step63',
          produtoId: 'produto-step63',
          quantidade: '1',
          unitPriceCentavos: 1234,
          totalCentavos: 1234,
          payload: {
            productCode: 'P63',
            name: 'Produto XML Step63',
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
        fiscalAllocation: {
          leaseId: LEASE_ID,
          deviceId: DEVICE_ID,
          fiscalId: FISCAL_ID,
          operationId: `${OPERATION_ID}:nfce`,
          xJust: 'Emissão offline controlada para teste fiscal completo step63.'
        },
        payload: {
          source: 'step63',
          saleNumber: '63',
          operatorId: 'operador-step63'
        }
      });

      assert.equal(sale.applied, true);
      assert.equal(sale.fiscal.state, 'ALLOCATED');

      await callback({
        userDataDir,
        safeStorage,
        pfxBuffer: certificate.pfxBuffer,
        passphrase: certificate.passphrase
      });
    } finally {
      try {
        closeOfflineDatabase();
      } catch (_) {}
      certificate.pfxBuffer.fill(0);
    }
  }, 'efisco-step63-chain-');
}

function directChildren(node) {
  const result = [];
  for (let i = 0; i < node.childNodes.length; i += 1) {
    const item = node.childNodes[i];
    if (item && item.nodeType === 1) result.push(item);
  }
  return result;
}

test('XML NFC-e gerado do snapshot possui identidade, item, pagamento e contingência esperados', async () => {
  await withFiscalFixture(async () => {
    const document = getNfceDocumentBySaleId(
      EMPRESA_ID,
      SALE_ID
    );

    const generated = generateUnsignedNfceXml(document);

    assert.equal(generated.accessKey, document.chaveAcesso);
    assert.equal(generated.infNFeId, `NFe${document.chaveAcesso}`);
    assert.equal(generated.itemCount, 1);
    assert.equal(generated.totals.vNF, '12.34');
    assert.equal(generated.totals.rtcIncluded, false);

    const parsed = new DOMParser().parseFromString(
      generated.xml,
      'application/xml'
    );

    const root = parsed.documentElement;
    const children = directChildren(root);

    assert.equal(root.localName, 'NFe');
    assert.equal(children[0].localName, 'infNFe');
    assert.equal(children.length, 1);

    assert.match(generated.xml, /<mod>65<\/mod>/);
    assert.match(generated.xml, /<tpEmis>9<\/tpEmis>/);
    assert.match(generated.xml, /<tpAmb>1<\/tpAmb>/);
    assert.match(generated.xml, /<CPF>12345678901<\/CPF>/);
    assert.match(generated.xml, /<tPag>17<\/tPag>/);
    assert.match(generated.xml, /<vPag>12\.34<\/vPag>/);
    assert.match(generated.xml, /<xJust>Emissão offline controlada/);
    assert.doesNotMatch(generated.xml, /Signature/);
    assert.doesNotMatch(generated.xml, /infNFeSupl/);
  });
});

test('XMLDSig com PFX de teste é verificável e detecta adulteração do infNFe', async () => {
  await withFiscalFixture(async ({ pfxBuffer, passphrase }) => {
    const document = getNfceDocumentBySaleId(
      EMPRESA_ID,
      SALE_ID
    );
    const generated = generateUnsignedNfceXml(document);

    const signed = signNfeXmlWithPkcs12({
      xml: generated.xml,
      pfxBuffer,
      passphrase,
      now: new Date('2026-09-25T12:40:00.000Z')
    });

    assert.equal(signed.accessKey, document.chaveAcesso);
    assert.match(
      signed.certificateFingerprintSha256,
      /^[0-9A-F]{64}$/
    );
    assert.equal(
      signed.signatureAlgorithm,
      'http://www.w3.org/2000/09/xmldsig#rsa-sha1'
    );
    assert.equal(
      signed.digestAlgorithm,
      'http://www.w3.org/2000/09/xmldsig#sha1'
    );

    const material = extractPkcs12SigningMaterial({
      pfxBuffer,
      passphrase,
      now: new Date('2026-09-25T12:40:00.000Z')
    });

    try {
      assert.equal(
        verifySignedNfeXml({
          xml: signed.signedXml,
          publicCert: material.certificatePem
        }),
        true
      );

      const tampered = signed.signedXml.replace(
        '<vNF>12.34</vNF>',
        '<vNF>12.35</vNF>'
      );

      assert.notEqual(tampered, signed.signedXml);
      assert.equal(
        verifySignedNfeXml({
          xml: tampered,
          publicCert: material.certificatePem
        }),
        false
      );
    } finally {
      material.privateKeyPem.fill(0);
      material.certificatePem.fill(0);
    }
  });
});

test('QR Code v3 usa o mesmo A1 da XMLDSig e XML final mantém assinatura válida', async () => {
  await withFiscalFixture(async ({
    userDataDir,
    safeStorage,
    pfxBuffer,
    passphrase
  }) => {
    const allocated = getNfceDocumentBySaleId(
      EMPRESA_ID,
      SALE_ID
    );
    const generated = generateUnsignedNfceXml(allocated);
    const signed = signNfeXmlWithPkcs12({
      xml: generated.xml,
      pfxBuffer,
      passphrase,
      now: new Date('2026-09-25T12:40:00.000Z')
    });

    const persisted = persistSignedNfceContingency({
      empresaId: EMPRESA_ID,
      saleId: SALE_ID,
      signedXml: signed.signedXml
    });

    assert.equal(persisted.state, 'CONTINGENCIA_PENDENTE');

    storeFiscalA1Bundle({
      userDataDir,
      safeStorage,
      empresaId: EMPRESA_ID,
      deviceId: DEVICE_ID,
      certificateId: 'cert-step63',
      pfxBuffer,
      passphrase,
      fingerprintSha256: signed.certificateFingerprintSha256,
      validFrom: signed.certificateValidFrom,
      validTo: signed.certificateValidTo,
      storedAt: '2026-09-25T12:40:01.000Z'
    });

    const finalized = finalizeNfceContingencyQrCode({
      empresaId: EMPRESA_ID,
      saleId: SALE_ID,
      deviceId: DEVICE_ID,
      userDataDir,
      safeStorage,
      now: new Date('2026-09-25T12:40:02.000Z')
    });

    assert.equal(finalized.applied, true);
    assert.equal(finalized.duplicate, false);
    assert.equal(finalized.state, 'CONTINGENCIA_PENDENTE');
    assert.equal(
      finalized.certificateFingerprintSha256,
      signed.certificateFingerprintSha256
    );
    assert.match(finalized.qrCodeText, /\?p=/);
    assert.match(finalized.finalXmlSha256, /^[0-9A-F]{64}$/);

    const refreshed = getNfceDocumentBySaleId(
      EMPRESA_ID,
      SALE_ID
    );
    const parsedSigned = parseSignedNfceDocument(refreshed);

    assert.doesNotThrow(() => {
      validateQrTextAgainstSignedXml(
        refreshed.qrCodeText,
        parsedSigned
      );
    });

    const final = buildNfceXmlWithSupplement(refreshed);

    assert.equal(final.xml, finalized.finalXml);
    assert.equal(final.sha256, finalized.finalXmlSha256);

    const finalDoc = new DOMParser().parseFromString(
      final.xml,
      'application/xml'
    );

    assert.deepEqual(
      directChildren(finalDoc.documentElement).map((node) => node.localName),
      ['infNFe', 'infNFeSupl', 'Signature']
    );

    assert.equal(
      verifySignedNfeXml({
        xml: final.xml,
        publicCert: parsedSigned.publicCertPem
      }),
      true
    );

    const duplicate = finalizeNfceContingencyQrCode({
      empresaId: EMPRESA_ID,
      saleId: SALE_ID,
      deviceId: DEVICE_ID,
      userDataDir,
      safeStorage,
      now: new Date('2026-09-25T12:40:03.000Z')
    });

    assert.equal(duplicate.applied, false);
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.qrCodeText, finalized.qrCodeText);
    assert.equal(
      duplicate.finalXmlSha256,
      finalized.finalXmlSha256
    );
  });
});

test('QR adulterado é recusado criptograficamente antes de montar XML final', async () => {
  await withFiscalFixture(async ({
    userDataDir,
    safeStorage,
    pfxBuffer,
    passphrase
  }) => {
    const allocated = getNfceDocumentBySaleId(
      EMPRESA_ID,
      SALE_ID
    );
    const generated = generateUnsignedNfceXml(allocated);
    const signed = signNfeXmlWithPkcs12({
      xml: generated.xml,
      pfxBuffer,
      passphrase,
      now: new Date('2026-09-25T12:40:00.000Z')
    });

    persistSignedNfceContingency({
      empresaId: EMPRESA_ID,
      saleId: SALE_ID,
      signedXml: signed.signedXml
    });

    storeFiscalA1Bundle({
      userDataDir,
      safeStorage,
      empresaId: EMPRESA_ID,
      deviceId: DEVICE_ID,
      certificateId: 'cert-step63',
      pfxBuffer,
      passphrase,
      fingerprintSha256: signed.certificateFingerprintSha256,
      validFrom: signed.certificateValidFrom,
      validTo: signed.certificateValidTo
    });

    finalizeNfceContingencyQrCode({
      empresaId: EMPRESA_ID,
      saleId: SALE_ID,
      deviceId: DEVICE_ID,
      userDataDir,
      safeStorage,
      now: new Date('2026-09-25T12:40:02.000Z')
    });

    const document = getNfceDocumentBySaleId(
      EMPRESA_ID,
      SALE_ID
    );
    const parsed = parseSignedNfceDocument(document);

    const parts = document.qrCodeText.split('|');
    assert.equal(parts.length, 8);

    const signature = Buffer.from(parts[7], 'base64');
    signature[0] ^= 0x01;
    const tampered = [
      ...parts.slice(0, 7),
      signature.toString('base64')
    ].join('|');
    signature.fill(0);

    assert.throws(
      () => validateQrTextAgainstSignedXml(tampered, parsed),
      /Assinatura RSA-SHA1 do QR Code não confere/
    );
  });
});

test('DANFE de contingência deriva duas vias consistentes somente do XML final', async () => {
  await withFiscalFixture(async ({
    userDataDir,
    safeStorage,
    pfxBuffer,
    passphrase
  }) => {
    const allocated = getNfceDocumentBySaleId(
      EMPRESA_ID,
      SALE_ID
    );
    const generated = generateUnsignedNfceXml(allocated);
    const signed = signNfeXmlWithPkcs12({
      xml: generated.xml,
      pfxBuffer,
      passphrase,
      now: new Date('2026-09-25T12:40:00.000Z')
    });

    persistSignedNfceContingency({
      empresaId: EMPRESA_ID,
      saleId: SALE_ID,
      signedXml: signed.signedXml
    });

    storeFiscalA1Bundle({
      userDataDir,
      safeStorage,
      empresaId: EMPRESA_ID,
      deviceId: DEVICE_ID,
      certificateId: 'cert-step63',
      pfxBuffer,
      passphrase,
      fingerprintSha256: signed.certificateFingerprintSha256,
      validFrom: signed.certificateValidFrom,
      validTo: signed.certificateValidTo
    });

    const finalized = finalizeNfceContingencyQrCode({
      empresaId: EMPRESA_ID,
      saleId: SALE_ID,
      deviceId: DEVICE_ID,
      userDataDir,
      safeStorage,
      now: new Date('2026-09-25T12:40:02.000Z')
    });

    const document = getNfceDocumentBySaleId(
      EMPRESA_ID,
      SALE_ID
    );

    const models = buildDanfeContingencyModels(document);
    const fromSale = generateDanfeContingencyForSale({
      empresaId: EMPRESA_ID,
      saleId: SALE_ID
    });

    assert.deepEqual(fromSale, models);
    assert.equal(models.chaveAcesso, document.chaveAcesso);
    assert.equal(models.finalXmlSha256, finalized.finalXmlSha256);
    assert.equal(models.consumer.via, 'CONSUMIDOR');
    assert.equal(
      models.establishment.via,
      'ESTABELECIMENTO'
    );
    assert.equal(
      models.consumer.mensagemFiscalContingencia.linha1,
      'EMITIDA EM CONTINGÊNCIA'
    );
    assert.equal(
      models.consumer.mensagemFiscalContingencia.linha2,
      'Pendente de autorização'
    );
    assert.equal(models.consumer.nfce.protocolo, null);
    assert.equal(models.consumer.nfce.tipoEmissao, 9);
    assert.equal(models.consumer.consumidor.identified, true);
    assert.equal(models.consumer.consumidor.type, 'CPF');
    assert.equal(
      models.consumer.consumidor.document,
      '12345678901'
    );
    assert.equal(models.consumer.itens.length, 1);
    assert.equal(models.consumer.itens[0].productCode, 'P63');
    assert.equal(models.consumer.venda.totalValue, 12.34);
    assert.equal(
      models.consumer.venda.paymentMethod,
      'PIX'
    );
    assert.equal(
      models.consumer.nfce.urlQrCode,
      document.qrCodeText
    );
    assert.equal(
      models.establishment.guardaAteAutorizacao,
      true
    );

    const modelHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(models), 'utf8')
      .digest('hex');

    assert.match(modelHash, /^[0-9a-f]{64}$/);
  });
});
