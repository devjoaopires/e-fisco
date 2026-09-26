'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  QR_VERSION,
  INTENT_KEY_PREFIX,
  FISCAL_NUMBER_INTENT_VERSION,
  DEFAULT_REFILL_THRESHOLD,
  DEFAULT_RESERVE_QUANTITY,
  DEFAULT_RETRY_INTERVAL_MS,
  normalizePaymentMethodName,
  moneyFromCents,
  decimalMoneyToCents,
  quantity4,
  percentage4,
  assertPercent,
  rtcRequiredForIssuerDate,
  percentOfCents,
  formatPaDateTime,
  aammFromFiscalDate,
  buildQrUrl,
  qrPayloadParts,
  fiscalNumberNamespaceKey,
  normalizeFiscalNumberPolicy,
  normalizeFiscalNumberIntent
} = require('../../offline-fiscal-values');

test('normalizePaymentMethodName remove acentos, espaços e normaliza para maiúsculas', () => {
  assert.equal(normalizePaymentMethodName('  crédito  '), 'CREDITO');
  assert.equal(normalizePaymentMethodName('débito'), 'DEBITO');
  assert.equal(normalizePaymentMethodName(' pix '), 'PIX');
  assert.equal(normalizePaymentMethodName(null), '');
});

test('moneyFromCents formata centavos sem ponto flutuante', () => {
  assert.equal(moneyFromCents(0), '0.00');
  assert.equal(moneyFromCents(1), '0.01');
  assert.equal(moneyFromCents(1234), '12.34');
  assert.equal(moneyFromCents(100000001), '1000000.01');

  assert.throws(
    () => moneyFromCents(-1),
    /centavos inteiros não negativos/
  );
  assert.throws(
    () => moneyFromCents(1.5),
    /centavos inteiros não negativos/
  );
});

test('decimalMoneyToCents aceita ponto ou vírgula e rejeita precisão silenciosa', () => {
  assert.equal(decimalMoneyToCents('12.34', 'valor'), 1234);
  assert.equal(decimalMoneyToCents('12,34', 'valor'), 1234);
  assert.equal(decimalMoneyToCents('7.5', 'valor'), 750);
  assert.equal(decimalMoneyToCents('0', 'valor'), 0);

  assert.throws(
    () => decimalMoneyToCents('1.234', 'valor'),
    /no máximo duas casas decimais/
  );
  assert.throws(
    () => decimalMoneyToCents('-1', 'valor'),
    /no máximo duas casas decimais/
  );
});

test('quantity4 remove zeros finais e não arredonda mais de quatro casas significativas', () => {
  assert.equal(quantity4('1', 'quantidade'), '1');
  assert.equal(quantity4('1.2300', 'quantidade'), '1.23');
  assert.equal(quantity4('1,2500', 'quantidade'), '1.25');
  assert.equal(quantity4('1.00000', 'quantidade'), '1');

  assert.throws(
    () => quantity4('1.23456', 'quantidade'),
    /mais de quatro casas significativas/
  );
  assert.throws(
    () => quantity4('0', 'quantidade'),
    /maior que zero/
  );
});

test('percentage4 e assertPercent produzem percentuais fiscais determinísticos', () => {
  assert.equal(percentage4('0.1', 'alíquota'), '0.1000');
  assert.equal(percentage4('0,9', 'alíquota'), '0.9000');
  assert.equal(percentage4('100', 'alíquota'), '100.0000');
  assert.equal(assertPercent('0.1000', 0.1, 'pIBSUF'), '0.1000');

  assert.throws(
    () => percentage4('100.0001', 'alíquota'),
    /inválido/
  );
  assert.throws(
    () => assertPercent('0.2000', 0.1, 'pIBSUF'),
    /deve ser 0.1000%/
  );
});

test('rtcRequiredForIssuerDate respeita a transição do CRT 1 em 2027', () => {
  assert.equal(
    rtcRequiredForIssuerDate({ crt: '1' }, '2026-12-31T23:59:59-03:00'),
    false
  );
  assert.equal(
    rtcRequiredForIssuerDate({ crt: '1' }, '2027-01-01T00:00:00-03:00'),
    true
  );
  assert.equal(
    rtcRequiredForIssuerDate({ crt: '2' }, '2026-01-01T00:00:00-03:00'),
    true
  );

  assert.throws(
    () => rtcRequiredForIssuerDate({ crt: '1' }, 'sem-data'),
    /ano fiscal válido/
  );
});

test('percentOfCents calcula tributo com inteiros e arredonda meio centavo para cima', () => {
  assert.equal(percentOfCents(10000, '0.1000'), 10);
  assert.equal(percentOfCents(10000, '0.9000'), 90);
  assert.equal(percentOfCents(1, '50.0000'), 1);
  assert.equal(percentOfCents(1, '0.0000'), 0);
});

test('formatPaDateTime converte instantes para -03:00 de forma determinística', () => {
  assert.equal(
    formatPaDateTime('2026-09-25T15:00:00Z', 'dhEmi'),
    '2026-09-25T12:00:00-03:00'
  );
  assert.equal(
    formatPaDateTime('2026-09-25T12:00:00-03:00', 'dhEmi'),
    '2026-09-25T12:00:00-03:00'
  );
  assert.equal(
    formatPaDateTime('2026-01-01T01:30:00Z', 'dhEmi'),
    '2025-12-31T22:30:00-03:00'
  );

  assert.throws(
    () => formatPaDateTime('2026-09-25T12:00:00', 'dhEmi'),
    /fuso horário explícito/
  );
  assert.throws(
    () => formatPaDateTime('data-inválidaZ', 'dhEmi'),
    /dhEmi inválido/
  );
});

test('aammFromFiscalDate deriva AAMM usado na chave fiscal', () => {
  assert.equal(aammFromFiscalDate('2026-09-25T12:00:00-03:00'), '2609');
  assert.equal(aammFromFiscalDate('2030-01'), '3001');

  assert.throws(
    () => aammFromFiscalDate('25/09/2026'),
    /não contém AAAA-MM/
  );
});

test('buildQrUrl adiciona p sem destruir query existente', () => {
  const payload = 'CHAVE|3|1|25|10.00|||ASSINATURA';

  assert.equal(
    buildQrUrl('https://sefaz.example/qrcode', payload),
    `https://sefaz.example/qrcode?p=${payload}`
  );
  assert.equal(
    buildQrUrl('https://sefaz.example/qrcode?token=abc', payload),
    `https://sefaz.example/qrcode?token=abc&p=${payload}`
  );
  assert.equal(
    buildQrUrl('https://sefaz.example/qrcode?p=', payload),
    `https://sefaz.example/qrcode?p=${payload}`
  );
  assert.equal(
    buildQrUrl('https://sefaz.example/qrcode?token=abc&', payload),
    `https://sefaz.example/qrcode?token=abc&p=${payload}`
  );
});

test('buildQrUrl rejeita p já preenchido e sequência insegura para CDATA', () => {
  assert.throws(
    () => buildQrUrl(
      'https://sefaz.example/qrcode?p=existente',
      'novo'
    ),
    /parâmetro p preenchido/
  );

  assert.throws(
    () => buildQrUrl('https://sefaz.example/]]>/qrcode', 'novo'),
    /sequência inválida para CDATA/
  );
});

test('qrPayloadParts fixa versão 3 e preserva a ordem dos sete campos', () => {
  assert.equal(QR_VERSION, '3');

  assert.deepEqual(
    qrPayloadParts({
      accessKey: '12345678901234567890123456789012345678901234',
      tpAmb: '1',
      day: '25',
      vNF: '10.00',
      recipientType: '2',
      recipientId: '12345678901'
    }),
    [
      '12345678901234567890123456789012345678901234',
      '3',
      '1',
      '25',
      '10.00',
      '2',
      '12345678901'
    ]
  );
});

test('fiscalNumberNamespaceKey é estável, versionado e isolado por namespace', () => {
  const input = {
    empresaId: 'empresa-1',
    deviceId: 'device-1',
    serie: '1'
  };
  const first = fiscalNumberNamespaceKey(input);
  const second = fiscalNumberNamespaceKey({ ...input });

  assert.equal(first, second);
  assert.match(
    first,
    /^fiscal\.numberLease\.intent\.v1:[0-9a-f]{32}$/
  );
  assert.equal(first.startsWith(INTENT_KEY_PREFIX), true);

  assert.notEqual(
    first,
    fiscalNumberNamespaceKey({ ...input, deviceId: 'device-2' })
  );
  assert.notEqual(
    first,
    fiscalNumberNamespaceKey({ ...input, serie: '2' })
  );
});

test('normalizeFiscalNumberPolicy aplica defaults e valida limites', () => {
  assert.deepEqual(normalizeFiscalNumberPolicy(), {
    threshold: DEFAULT_REFILL_THRESHOLD,
    quantity: DEFAULT_RESERVE_QUANTITY,
    retryIntervalMs: DEFAULT_RETRY_INTERVAL_MS
  });

  assert.deepEqual(
    normalizeFiscalNumberPolicy({
      refillThreshold: 0,
      reserveQuantity: 10,
      retryIntervalMs: 0
    }),
    {
      threshold: 0,
      quantity: 10,
      retryIntervalMs: 0
    }
  );

  assert.throws(
    () => normalizeFiscalNumberPolicy({
      refillThreshold: 10,
      reserveQuantity: 10
    }),
    /menor que reserveQuantity/
  );

  assert.throws(
    () => normalizeFiscalNumberPolicy({ reserveQuantity: 201 }),
    /inteiro entre 1 e 200/
  );

  assert.throws(
    () => normalizeFiscalNumberPolicy({
      retryIntervalMs: 24 * 60 * 60 * 1000 + 1
    }),
    /retryIntervalMs inválido/
  );
});

test('normalizeFiscalNumberIntent aceita somente versão, namespace e quantidade esperados', () => {
  const key = fiscalNumberNamespaceKey({
    empresaId: 'empresa-1',
    deviceId: 'device-1',
    serie: '1'
  });

  assert.equal(FISCAL_NUMBER_INTENT_VERSION, 1);

  assert.deepEqual(
    normalizeFiscalNumberIntent({
      version: 1,
      namespaceKey: key,
      requestId: 'lease-auto-abc12345',
      quantity: '50',
      createdAt: '2026-09-25T10:00:00.000Z',
      attempts: '2',
      lastAttemptAt: '2026-09-25T10:01:00.000Z'
    }, key, 50),
    {
      version: 1,
      namespaceKey: key,
      requestId: 'lease-auto-abc12345',
      quantity: 50,
      createdAt: '2026-09-25T10:00:00.000Z',
      attempts: 2,
      lastAttemptAt: '2026-09-25T10:01:00.000Z'
    }
  );

  const invalidAttempts = normalizeFiscalNumberIntent({
    version: 1,
    namespaceKey: key,
    requestId: 'lease-auto-abc12345',
    quantity: 50,
    createdAt: '2026-09-25T10:00:00.000Z',
    attempts: -1
  }, key, 50);

  assert.equal(invalidAttempts.attempts, 0);
  assert.equal(invalidAttempts.lastAttemptAt, null);
});

test('normalizeFiscalNumberIntent rejeita versão, namespace, requestId e política divergentes', () => {
  const key = fiscalNumberNamespaceKey({
    empresaId: 'empresa-1',
    deviceId: 'device-1',
    serie: '1'
  });

  const base = {
    version: 1,
    namespaceKey: key,
    requestId: 'lease-auto-abc12345',
    quantity: 50,
    createdAt: '2026-09-25T10:00:00.000Z'
  };

  assert.throws(
    () => normalizeFiscalNumberIntent({ ...base, version: 2 }, key, 50),
    /outro namespace/
  );
  assert.throws(
    () => normalizeFiscalNumberIntent(
      { ...base, namespaceKey: `${key}-outro` },
      key,
      50
    ),
    /outro namespace/
  );
  assert.throws(
    () => normalizeFiscalNumberIntent(
      { ...base, requestId: 'curto' },
      key,
      50
    ),
    /requestId da intenção fiscal é inválido/
  );
  assert.throws(
    () => normalizeFiscalNumberIntent(base, key, 40),
    /Política de quantidade mudou/
  );
});
