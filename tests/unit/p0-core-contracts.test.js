'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeDeviceId,
  normalizeEmpresaId,
  normalizeDeviceToken
} = require('../../offline-device-auth');

const {
  normalizePairingCode
} = require('../../offline-device-pairing');

const {
  operationEnvelope,
  referencePullPayload
} = require('../../offline-sync-http-transport');

const {
  MANIFEST_FORMAT_VERSION,
  compareVersions,
  validateManifest,
  validateStandbyPackageManifest,
  evaluateCompatibility
} = require('../../offline-standby');

const {
  validateCurrentSupportedSubset,
  validateProfile
} = require('../../offline-fiscal-sale-pipeline');

function validFiscalItem(overrides = {}) {
  return {
    quantidade: '1.25',
    payload: {
      ncm: '12345678',
      cfop: '5102',
      origem: '0',
      csosn: '102',
      cstPis: '04',
      cstCofins: '04',
      ...overrides
    }
  };
}

function validFiscalProfile(overrides = {}) {
  return {
    ambiente: 'PRODUCAO',
    uf: 'PA',
    crt: '1',
    cnpj: '12.345.678/0001-95',
    serieNfce: 1,
    codigoMunicipio: '1501402',
    urlQrCode: 'https://sefaz.example/qrcode',
    urlConsultaChave: 'https://sefaz.example/consulta',
    ...overrides
  };
}

test('normalizadores de identidade aceitam limites válidos e removem espaços externos', () => {
  assert.equal(
    normalizeDeviceId('  desktop-device_01  '),
    'desktop-device_01'
  );
  assert.equal(
    normalizeEmpresaId('  empresa-123  '),
    'empresa-123'
  );

  const token = 'x'.repeat(32);
  assert.equal(
    normalizeDeviceToken(`  ${token}  `),
    token
  );
});

test('normalizadores de identidade rejeitam device, empresa e token fora do contrato', () => {
  assert.throws(
    () => normalizeDeviceId('curto'),
    /deviceId inválido/
  );
  assert.throws(
    () => normalizeDeviceId('device com espaço'),
    /deviceId inválido/
  );
  assert.throws(
    () => normalizeEmpresaId(''),
    /empresaId inválido/
  );
  assert.throws(
    () => normalizeEmpresaId('e'.repeat(129)),
    /empresaId inválido/
  );
  assert.throws(
    () => normalizeDeviceToken('t'.repeat(31)),
    /entre 32 e 512/
  );
  assert.throws(
    () => normalizeDeviceToken('t'.repeat(513)),
    /entre 32 e 512/
  );
});

test('normalizePairingCode preserva código válido e aplica limites de 16 a 128 caracteres', () => {
  assert.equal(
    normalizePairingCode('  1234567890ABCDEF  '),
    '1234567890ABCDEF'
  );

  assert.throws(
    () => normalizePairingCode('1234567890ABCDE'),
    /Código de pareamento inválido/
  );
  assert.throws(
    () => normalizePairingCode('x'.repeat(129)),
    /Código de pareamento inválido/
  );
});

test('operationEnvelope monta contrato de sync versionado sem inventar dependências', () => {
  const operation = {
    empresaId: 'empresa-1',
    operationId: 'sale-paid:sale-1',
    type: 'SALE_PAID',
    entityId: 'sale-1',
    payload: { totalCentavos: 1000 },
    dependencies: ['cash-open:cash-1'],
    attempts: 2,
    createdAt: '2026-09-25T10:00:00.000Z'
  };

  assert.deepEqual(
    operationEnvelope(operation, { deviceId: 'desktop-device-1' }),
    {
      protocolVersion: 1,
      empresaId: 'empresa-1',
      operationId: 'sale-paid:sale-1',
      type: 'SALE_PAID',
      entityId: 'sale-1',
      payload: { totalCentavos: 1000 },
      dependencies: ['cash-open:cash-1'],
      attempts: 2,
      createdAt: '2026-09-25T10:00:00.000Z',
      deviceId: 'desktop-device-1'
    }
  );
});

test('operationEnvelope aplica defaults seguros e rejeita campos obrigatórios ausentes', () => {
  const envelope = operationEnvelope({
    empresaId: 'empresa-1',
    operationId: 'op-1',
    type: 'TEST',
    entityId: 'entity-1'
  });

  assert.equal(envelope.protocolVersion, 1);
  assert.deepEqual(envelope.payload, {});
  assert.deepEqual(envelope.dependencies, []);
  assert.equal(envelope.attempts, 0);
  assert.equal(envelope.createdAt, null);
  assert.equal(envelope.deviceId, null);

  assert.throws(
    () => operationEnvelope({
      empresaId: 'empresa-1',
      operationId: '',
      type: 'TEST',
      entityId: 'entity-1'
    }),
    /operation\.operationId é obrigatório/
  );
});

test('referencePullPayload normaliza limite, cursores e flags completed', () => {
  assert.deepEqual(
    referencePullPayload({
      limit: 999,
      cursors: {
        products: ' prod-cursor ',
        customers: '',
        suppliers: null,
        crediarios: 'cred-cursor'
      },
      completed: {
        products: true,
        customers: 1,
        suppliers: false,
        crediarios: true
      }
    }),
    {
      limit: 250,
      fiscalCounter: null,
      cursors: {
        products: 'prod-cursor',
        customers: null,
        suppliers: null,
        crediarios: 'cred-cursor'
      },
      completed: {
        products: true,
        customers: false,
        suppliers: false,
        crediarios: true
      }
    }
  );
});

test('referencePullPayload inclui contador fiscal somente quando o contrato é válido', () => {
  const valid = referencePullPayload({
    fiscalCounter: {
      modelo: 65,
      serie: ' 3 ',
      proximoNumero: 42
    }
  });

  assert.deepEqual(valid.fiscalCounter, {
    ambiente: 'PRODUCAO',
    modelo: 65,
    serie: '3',
    proximoNumero: 42
  });

  assert.equal(
    referencePullPayload({
      fiscalCounter: {
        modelo: 55,
        serie: '3',
        proximoNumero: 42
      }
    }).fiscalCounter,
    null
  );

  assert.throws(
    () => referencePullPayload({
      cursors: {
        products: 'x'.repeat(257)
      }
    }),
    /excede o limite seguro de 256 caracteres/
  );
});

test('compareVersions compara segmentos numéricos de forma determinística', () => {
  assert.equal(compareVersions('1.0.41', '1.0.41'), 0);
  assert.equal(compareVersions('1.0.42', '1.0.41'), 1);
  assert.equal(compareVersions('1.0.40', '1.0.41'), -1);
  assert.equal(compareVersions('43.4.1', '43.4.0'), 1);
  assert.equal(compareVersions('1.0.41+build.2', '1.0.41+build.1'), 1);
});

test('validateManifest normaliza o manifesto desktop e pacote offline', () => {
  const sha = 'AB'.repeat(32);

  assert.deepEqual(
    validateManifest({
      manifestVersion: 1,
      uiVersion: '1.0.41',
      offlineCoreVersion: '1.0.41',
      schemaVersion: 13,
      minimumElectronVersion: '43.4.0',
      minimumOfflineCoreVersion: '1.0.40',
      publishedAt: '2026-09-25T10:00:00Z',
      offlinePackage: {
        url: 'https://example.invalid/standby.zip',
        sha256: sha,
        signature: 'sig',
        sizeBytes: 1234
      }
    }),
    {
      manifestVersion: MANIFEST_FORMAT_VERSION,
      uiVersion: '1.0.41',
      offlineCoreVersion: '1.0.41',
      schemaVersion: 13,
      minimumElectronVersion: '43.4.0',
      minimumOfflineCoreVersion: '1.0.40',
      publishedAt: '2026-09-25T10:00:00Z',
      offlinePackage: {
        url: 'https://example.invalid/standby.zip',
        sha256: sha.toLowerCase(),
        signature: 'sig',
        sizeBytes: 1234
      }
    }
  );
});

test('validateManifest rejeita formato, schema e hash inválidos', () => {
  const base = {
    manifestVersion: 1,
    uiVersion: '1.0.41',
    offlineCoreVersion: '1.0.41',
    schemaVersion: 13,
    minimumElectronVersion: '43.4.0',
    minimumOfflineCoreVersion: '1.0.40'
  };

  assert.throws(
    () => validateManifest({ ...base, manifestVersion: 2 }),
    /formato do manifesto não suportada/
  );
  assert.throws(
    () => validateManifest({ ...base, schemaVersion: 0 }),
    /schemaVersion deve ser um inteiro positivo/
  );
  assert.throws(
    () => validateManifest({
      ...base,
      offlinePackage: {
        url: 'https://example.invalid/a.zip',
        sha256: 'abc'
      }
    }),
    /SHA-256 hexadecimal válido/
  );
});

test('validateStandbyPackageManifest valida tipo, versões e compatibilidade esperada', () => {
  const manifest = validateStandbyPackageManifest({
    packageType: 'e-fisco-offline-standby',
    packageVersion: '1',
    uiVersion: '1.0.41',
    offlineCoreVersion: '1.0.41',
    schemaVersion: 13,
    activationAllowed: true,
    purpose: 'rollback'
  }, {
    uiVersion: '1.0.41',
    offlineCoreVersion: '1.0.41',
    schemaVersion: 13
  });

  assert.equal(manifest.packageType, 'e-fisco-offline-standby');
  assert.equal(manifest.activationAllowed, true);
  assert.equal(manifest.purpose, 'rollback');

  assert.throws(
    () => validateStandbyPackageManifest({
      ...manifest,
      uiVersion: '1.0.40'
    }, {
      uiVersion: '1.0.41'
    }),
    /uiVersion interno divergente/
  );
});

test('evaluateCompatibility exige Electron e core offline mínimos', () => {
  const manifest = validateManifest({
    manifestVersion: 1,
    uiVersion: '1.0.42',
    offlineCoreVersion: '1.0.42',
    schemaVersion: 13,
    minimumElectronVersion: '43.4.0',
    minimumOfflineCoreVersion: '1.0.40'
  });

  const ready = evaluateCompatibility(
    manifest,
    '43.4.1',
    {
      activeSlot: 'A',
      slots: {
        A: { offlineCoreVersion: '1.0.41' },
        B: null
      }
    }
  );

  assert.equal(ready.electronCompatible, true);
  assert.equal(ready.offlineCoreCompatible, true);
  assert.equal(ready.standbyReady, true);

  const noCore = evaluateCompatibility(
    manifest,
    '43.4.1',
    {
      activeSlot: null,
      slots: { A: null, B: null }
    }
  );

  assert.equal(noCore.offlineCoreCompatible, false);
  assert.equal(noCore.standbyReady, false);

  const oldElectron = evaluateCompatibility(
    manifest,
    '43.3.9',
    {
      activeSlot: 'A',
      slots: {
        A: { offlineCoreVersion: '1.0.41' },
        B: null
      }
    }
  );

  assert.equal(oldElectron.electronCompatible, false);
  assert.equal(oldElectron.standbyReady, false);
});

test('validateCurrentSupportedSubset aceita venda fiscal suportada antes da obrigatoriedade RTC', () => {
  assert.deepEqual(
    validateCurrentSupportedSubset({
      occurredAt: '2026-09-25T12:00:00-03:00',
      payload: {},
      paymentParts: [
        { method: 'pix' },
        { method: 'crédito' }
      ],
      items: [
        validFiscalItem()
      ]
    }),
    {
      eligible: true,
      reason: null
    }
  );
});

test('validateCurrentSupportedSubset retorna razão determinística para contrato fiscal inválido', () => {
  assert.deepEqual(
    validateCurrentSupportedSubset({
      occurredAt: '2026-09-25T12:00:00-03:00',
      paymentParts: [{ method: 'BOLETO' }],
      items: [validFiscalItem()]
    }),
    {
      eligible: false,
      reason: 'PAGAMENTO_FORA_DO_SUBCONJUNTO'
    }
  );

  assert.deepEqual(
    validateCurrentSupportedSubset({
      occurredAt: '2026-09-25T12:00:00-03:00',
      paymentParts: [{ method: 'PIX' }],
      items: [validFiscalItem({ ncm: '123' })]
    }),
    {
      eligible: false,
      reason: 'ITEM_1_NCM'
    }
  );
});

test('validateCurrentSupportedSubset exige classificação RTC suportada a partir de 2027', () => {
  assert.deepEqual(
    validateCurrentSupportedSubset({
      occurredAt: '2027-01-01T00:00:00-03:00',
      paymentParts: [{ method: 'PIX' }],
      items: [validFiscalItem()]
    }),
    {
      eligible: false,
      reason: 'ITEM_1_RTC_CLASSIFICACAO'
    }
  );

  const item = validFiscalItem({
    rtc: {
      cst: '000',
      cClassTrib: '000001',
      pIBSUF: 0.1,
      pIBSMun: 0,
      pCBS: 0.9
    }
  });

  assert.deepEqual(
    validateCurrentSupportedSubset({
      occurredAt: '2027-01-01T00:00:00-03:00',
      paymentParts: [{ method: 'PIX' }],
      items: [item]
    }),
    {
      eligible: true,
      reason: null
    }
  );
});

test('validateProfile aceita perfil PA/produção/CRT1 e retorna razões estáveis para desvios', () => {
  assert.deepEqual(
    validateProfile(validFiscalProfile()),
    {
      ready: true,
      reason: null
    }
  );

  assert.deepEqual(
    validateProfile(validFiscalProfile({ ambiente: 'HOMOLOGACAO' })),
    {
      ready: false,
      reason: 'AMBIENTE_NAO_PRODUCAO'
    }
  );

  assert.deepEqual(
    validateProfile(validFiscalProfile({ uf: 'SP' })),
    {
      ready: false,
      reason: 'UF_NAO_PA'
    }
  );

  assert.deepEqual(
    validateProfile(validFiscalProfile({ serieNfce: 890 })),
    {
      ready: false,
      reason: 'SERIE_INVALIDA'
    }
  );
});
