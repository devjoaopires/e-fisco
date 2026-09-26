'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_RETRY_DELAYS_MS,
  retryDelayForAttempt,
  retryAtForOperation,
  normalizeTransportResult
} = require('../../offline-outbox-worker');

const {
  normalizeServerResult
} = require('../../offline-sync-http-transport');

test('retryDelayForAttempt segue a escala padrão e limita tentativas acima da tabela', () => {
  assert.deepEqual(DEFAULT_RETRY_DELAYS_MS, [
    5000,
    15000,
    60000,
    300000,
    900000
  ]);

  assert.equal(retryDelayForAttempt(1), 5000);
  assert.equal(retryDelayForAttempt(2), 15000);
  assert.equal(retryDelayForAttempt(3), 60000);
  assert.equal(retryDelayForAttempt(4), 300000);
  assert.equal(retryDelayForAttempt(5), 900000);
  assert.equal(retryDelayForAttempt(6), 900000);
  assert.equal(retryDelayForAttempt(999), 900000);
});

test('retryDelayForAttempt normaliza tentativa inválida ou fracionária antes de indexar', () => {
  const delays = [500, 2000, 3000];

  assert.equal(retryDelayForAttempt(undefined, delays), 1000);
  assert.equal(retryDelayForAttempt(null, delays), 1000);
  assert.equal(retryDelayForAttempt(0, delays), 1000);
  assert.equal(retryDelayForAttempt(-4, delays), 1000);
  assert.equal(retryDelayForAttempt('abc', delays), 1000);
  assert.equal(retryDelayForAttempt(2.9, delays), 2000);
  assert.equal(retryDelayForAttempt(50, delays), 3000);
});

test('retryAtForOperation usa a tentativa atual quando não existe retryAfter explícito', () => {
  assert.equal(
    retryAtForOperation(
      { attempts: 2 },
      '2026-09-25T10:00:00.000Z',
      null
    ),
    '2026-09-25T10:00:15.000Z'
  );
});

test('retryAtForOperation respeita retryAfter explícito inclusive zero', () => {
  assert.equal(
    retryAtForOperation(
      { attempts: 5 },
      '2026-09-25T10:00:00.000Z',
      2500
    ),
    '2026-09-25T10:00:02.500Z'
  );

  assert.equal(
    retryAtForOperation(
      { attempts: 5 },
      '2026-09-25T10:00:00.000Z',
      0
    ),
    '2026-09-25T10:00:00.000Z'
  );
});

test('retryAtForOperation cai no backoff padrão para retryAfter inválido e rejeita data inválida', () => {
  assert.equal(
    retryAtForOperation(
      { attempts: 3 },
      '2026-09-25T10:00:00.000Z',
      'não-numérico'
    ),
    '2026-09-25T10:01:00.000Z'
  );

  assert.throws(
    () => retryAtForOperation({ attempts: 1 }, 'data-inválida', null),
    /referenceDate inválido/
  );
});

test('normalizeTransportResult trata ausência de resultado como confirmação vazia', () => {
  assert.deepEqual(normalizeTransportResult(null), {
    status: 'CONFIRMED',
    ack: {}
  });
});

test('normalizeTransportResult normaliza status e preserva ack, erro e retryAfter', () => {
  assert.deepEqual(
    normalizeTransportResult({
      status: ' retry ',
      ack: { requestId: 'ack-1' },
      error: 503,
      retryAfterMs: 7000
    }),
    {
      status: 'RETRY',
      ack: { requestId: 'ack-1' },
      error: '503',
      retryAfterMs: 7000
    }
  );
});

test('normalizeTransportResult rejeita retorno primitivo e status desconhecido', () => {
  assert.throws(
    () => normalizeTransportResult('ok'),
    /resultado inválido/
  );
  assert.throws(
    () => normalizeTransportResult({ status: 'IGNORAR' }),
    /Status de transporte não suportado/
  );
});

test('normalizeServerResult confirma respostas HTTP 2xx sem status explícito', () => {
  assert.deepEqual(
    normalizeServerResult(201, { remoteId: 'r-1' }, {}),
    {
      status: 'CONFIRMED',
      ack: { remoteId: 'r-1' },
      httpStatus: 201,
      authFailure: false
    }
  );

  assert.deepEqual(
    normalizeServerResult(200, { ack: { remoteId: 'r-2' } }, {}),
    {
      status: 'CONFIRMED',
      ack: { remoteId: 'r-2' },
      httpStatus: 200,
      authFailure: false
    }
  );
});

test('normalizeServerResult separa conflito e revisão manual de falhas temporárias', () => {
  assert.equal(normalizeServerResult(409, {}, {}).status, 'CONFLICT');

  const unauthorized = normalizeServerResult(401, {}, {});
  assert.equal(unauthorized.status, 'MANUAL_REVIEW');
  assert.equal(unauthorized.authFailure, true);

  const forbidden = normalizeServerResult(403, {}, {});
  assert.equal(forbidden.status, 'MANUAL_REVIEW');
  assert.equal(forbidden.authFailure, true);

  const invalidPayload = normalizeServerResult(422, {}, {});
  assert.equal(invalidPayload.status, 'MANUAL_REVIEW');
  assert.equal(invalidPayload.authFailure, false);
});

test('normalizeServerResult classifica timeouts, throttling e erros de servidor como RETRY', () => {
  for (const statusCode of [408, 425, 429, 500, 503]) {
    const result = normalizeServerResult(statusCode, {}, {});
    assert.equal(result.status, 'RETRY');
    assert.equal(result.httpStatus, statusCode);
    assert.equal(result.authFailure, false);
  }
});

test('normalizeServerResult converte Retry-After em segundos para milissegundos', () => {
  const result = normalizeServerResult(
    429,
    { error: 'Muitas requisições' },
    { 'retry-after': '2.5' }
  );

  assert.equal(result.status, 'RETRY');
  assert.equal(result.error, 'Muitas requisições');
  assert.equal(result.retryAfterMs, 2500);
});

test('normalizeServerResult respeita status explícito e retryAfterMs retornados pelo servidor', () => {
  const result = normalizeServerResult(
    503,
    {
      status: 'retry',
      ack: { token: 'a1' },
      error: 'temporário',
      retryAfterMs: '7500'
    },
    {}
  );

  assert.deepEqual(result, {
    status: 'RETRY',
    ack: { token: 'a1' },
    error: 'temporário',
    retryAfterMs: 7500,
    httpStatus: 503,
    authFailure: false
  });
});
