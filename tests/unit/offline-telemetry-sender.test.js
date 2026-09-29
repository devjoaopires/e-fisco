'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildOfflineTelemetryPayload
} = require('../../offline/telemetry/payload');

const {
  createOfflineTelemetryQueue
} = require('../../offline/telemetry/queue');

const {
  DEFAULT_OFFLINE_TELEMETRY_ENDPOINT,
  computeTelemetryBackoffMs,
  classifyTelemetrySendError,
  normalizeAckEventIds,
  createOfflineTelemetrySender
} = require('../../offline/telemetry/sender');

function tempDir(
  prefix
) {
  return fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      prefix
    )
  );
}

function report(
  code
) {
  return {
    runtime: {
      appVersion: '1.0.41',
      platform: 'win32',
      arch: 'x64',
      osRelease: '10.0.26100',
      electronVersion: '43.4.1',
      chromeVersion: '142',
      packaged: true
    },
    summary: {
      ready: false,
      status:
        'OFFLINE_SELF_TEST_NOT_READY',
      codes: [
        code
      ],
      primaryDiagnostic: {
        code,
        category: 'UI',
        severity: 'ERROR'
      }
    },
    selfTest: {
      durationMs: 100,
      checks: {
        database: {
          ok: true,
          reason:
            'DATABASE_READY',
          diagnostic: null
        },
        company: {
          ok: true,
          reason:
            'COMPANY_READY',
          diagnostic: null
        },
        safeStorage: {
          ok: true,
          reason:
            'SAFE_STORAGE_READY',
          diagnostic: null
        },
        credential: {
          ok: true,
          reason:
            'CREDENTIAL_READY',
          activeCount: 1,
          usableCount: 1,
          diagnostic: null
        },
        server: {
          ok: true,
          reason:
            'SERVER_READY',
          listening: true,
          diagnostic: null
        },
        renderer: {
          ok: false,
          reason:
            'RENDERER_HEALTH_UNHEALTHY',
          readyFlag: true,
          healthFresh: true,
          healthHealthy: false,
          recoveryRunning: false,
          diagnostic: {
            code,
            category: 'UI',
            severity: 'ERROR'
          }
        }
      },
      rendererProbe: {
        attempted: true,
        ok: false,
        reason:
          'HEALTHCHECK_FAILED',
        shellReady: true,
        preloadReady: true,
        pdvReady: true,
        pdvMarkerReady: true,
        pdvScriptReady: false
      }
    },
    autoRepair: null,
    history: []
  };
}

function payload(
  eventId,
  code,
  nowMs
) {
  return buildOfflineTelemetryPayload({
    report:
      report(
        code
      ),
    identity: {
      deviceId:
        'DEVICE-1',
      empresaId:
        'EMPRESA-1'
    },
    now() {
      return nowMs;
    },
    randomUUID() {
      return eventId;
    }
  }).payload;
}

function makeQueue(
  dir,
  now
) {
  return createOfflineTelemetryQueue({
    fs,
    path,
    getUserDataDir() {
      return dir;
    },
    now
  });
}

test('backoff cresce exponencialmente, aplica jitter e respeita teto', () => {
  assert.equal(
    computeTelemetryBackoffMs(
      0,
      {
        baseMs: 1000,
        maxMs: 10000,
        jitterRatio: 0,
        random: () => 0.5
      }
    ),
    1000
  );

  assert.equal(
    computeTelemetryBackoffMs(
      3,
      {
        baseMs: 1000,
        maxMs: 10000,
        jitterRatio: 0,
        random: () => 0.5
      }
    ),
    8000
  );

  assert.equal(
    computeTelemetryBackoffMs(
      10,
      {
        baseMs: 1000,
        maxMs: 10000,
        jitterRatio: 0,
        random: () => 0.5
      }
    ),
    10000
  );

  assert.equal(
    computeTelemetryBackoffMs(
      0,
      {
        baseMs: 10000,
        maxMs: 20000,
        jitterRatio: 0.2,
        random: () => 0
      }
    ),
    8000
  );

  assert.equal(
    computeTelemetryBackoffMs(
      0,
      {
        baseMs: 10000,
        maxMs: 20000,
        jitterRatio: 0.2,
        random: () => 1
      }
    ),
    12000
  );
});

test('classificação separa autenticação, HTTP e rede sem mensagem bruta', () => {
  assert.deepEqual(
    classifyTelemetrySendError({
      code:
        'SYNC_DEVICE_AUTH_FAILED',
      httpStatus: 401,
      message:
        'token secreto'
    }),
    {
      code:
        'AUTH_INVALID',
      authInvalid: true
    }
  );

  assert.deepEqual(
    classifyTelemetrySendError({
      httpStatus: 503,
      message:
        'conteudo servidor'
    }),
    {
      code:
        'HTTP_503',
      authInvalid: false
    }
  );

  assert.deepEqual(
    classifyTelemetrySendError(
      new Error(
        'erro de rede bruto'
      )
    ),
    {
      code:
        'NETWORK_ERROR',
      authInvalid: false
    }
  );
});

test('ACK aceita acceptedEventIds e duplicateEventIds somente com status válido', () => {
  assert.deepEqual(
    normalizeAckEventIds({
      status: 'OK',
      acceptedEventIds: [
        'A',
        'A',
        'B'
      ],
      duplicateEventIds: [
        'C'
      ]
    }),
    [
      'A',
      'B',
      'C'
    ]
  );

  assert.deepEqual(
    normalizeAckEventIds({
      status: 'ERROR',
      acceptedEventIds: [
        'A'
      ]
    }),
    []
  );
});

test('flush autenticado envia batch e remove somente eventos explicitamente aceitos', async () => {
  const dir =
    tempDir(
      'efisco-telemetry-sender-ack-'
    );

  let clock = 1000;

  try {
    const queue =
      makeQueue(
        dir,
        () => clock
      );

    const first =
      payload(
        '11111111-1111-4111-8111-111111111111',
        'OFFLINE-UI-011',
        clock
      );

    const second =
      payload(
        '22222222-2222-4222-8222-222222222222',
        'OFFLINE-UI-012',
        clock
      );

    queue.enqueue(
      first
    );
    queue.enqueue(
      second
    );

    const calls = [];

    const sender =
      createOfflineTelemetrySender({
        queue,
        now() {
          return clock;
        },
        random() {
          return 0.5;
        },
        randomUUID() {
          return 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        },
        async postAuthenticatedDeviceJson(
          options
        ) {
          calls.push(
            options
          );

          return {
            status: 'OK',
            acceptedEventIds: [
              first.eventId
            ]
          };
        }
      });

    const summary =
      await sender.flush({
        deviceId:
          'DEVICE-1',
        deviceToken:
          'TOKEN-1'
      });

    assert.equal(
      calls.length,
      1
    );

    assert.equal(
      calls[0].endpoint,
      DEFAULT_OFFLINE_TELEMETRY_ENDPOINT
    );

    assert.equal(
      calls[0].deviceId,
      'DEVICE-1'
    );

    assert.equal(
      calls[0].deviceToken,
      'TOKEN-1'
    );

    assert.equal(
      calls[0].payload
        .events.length,
      2
    );

    assert.equal(
      summary.accepted,
      1
    );

    assert.equal(
      summary.deferred,
      1
    );

    assert.equal(
      queue.getStats()
        .pendingCount,
      1
    );

    assert.equal(
      queue.peekPending({
        nowMs:
          clock
      }).length,
      0
    );

    clock +=
      15000;

    const pending =
      queue.peekPending({
        nowMs:
          clock
      });

    assert.equal(
      pending.length,
      1
    );

    assert.equal(
      pending[0].eventId,
      second.eventId
    );

    assert.equal(
      pending[0].lastErrorCode,
      'ACK_MISSING_EVENT'
    );
  } finally {
    fs.rmSync(
      dir,
      {
        recursive: true,
        force: true
      }
    );
  }
});

test('erro HTTP preserva fila e agenda retry sem lançar', async () => {
  const dir =
    tempDir(
      'efisco-telemetry-sender-503-'
    );

  let clock = 5000;

  try {
    const queue =
      makeQueue(
        dir,
        () => clock
      );

    queue.enqueue(
      payload(
        '33333333-3333-4333-8333-333333333333',
        'OFFLINE-UI-011',
        clock
      )
    );

    const sender =
      createOfflineTelemetrySender({
        queue,
        now() {
          return clock;
        },
        random() {
          return 0.5;
        },
        async postAuthenticatedDeviceJson() {
          const error =
            new Error(
              'resposta interna'
            );

          error.code =
            'SYNC_DEVICE_POST_FAILED';

          error.httpStatus =
            503;

          throw error;
        }
      });

    const summary =
      await sender.flush({
        deviceId:
          'DEVICE-1',
        deviceToken:
          'TOKEN-1'
      });

    assert.equal(
      summary.status,
      'PARTIAL_OR_DEFERRED'
    );

    assert.equal(
      summary.accepted,
      0
    );

    assert.equal(
      summary.deferred,
      1
    );

    const all =
      queue.peekPending({
        nowMs:
          clock +
          15000
      });

    assert.equal(
      all.length,
      1
    );

    assert.equal(
      all[0].attemptCount,
      1
    );

    assert.equal(
      all[0].lastErrorCode,
      'HTTP_503'
    );
  } finally {
    fs.rmSync(
      dir,
      {
        recursive: true,
        force: true
      }
    );
  }
});

test('falha de autenticação mantém fila, registra retry e relança erro reconhecível', async () => {
  const dir =
    tempDir(
      'efisco-telemetry-sender-auth-'
    );

  let clock = 9000;

  try {
    const queue =
      makeQueue(
        dir,
        () => clock
      );

    queue.enqueue(
      payload(
        '44444444-4444-4444-8444-444444444444',
        'OFFLINE-AUTH-003',
        clock
      )
    );

    const sender =
      createOfflineTelemetrySender({
        queue,
        now() {
          return clock;
        },
        random() {
          return 0.5;
        },
        async postAuthenticatedDeviceJson() {
          const error =
            new Error(
              'token inválido bruto'
            );

          error.code =
            'SYNC_DEVICE_AUTH_FAILED';

          error.httpStatus =
            401;

          throw error;
        }
      });

    await assert.rejects(
      () =>
        sender.flush({
          deviceId:
            'DEVICE-1',
          deviceToken:
            'TOKEN-1'
        }),
      (error) =>
        error &&
        error.code ===
          'SYNC_DEVICE_AUTH_FAILED'
    );

    assert.equal(
      queue.getStats()
        .pendingCount,
      1
    );

    const pending =
      queue.peekPending({
        nowMs:
          clock +
          15000
      });

    assert.equal(
      pending.length,
      1
    );

    assert.equal(
      pending[0].lastErrorCode,
      'AUTH_INVALID'
    );
  } finally {
    fs.rmSync(
      dir,
      {
        recursive: true,
        force: true
      }
    );
  }
});

test('flush sem identidade não chama rede nem altera fila', async () => {
  const dir =
    tempDir(
      'efisco-telemetry-sender-no-id-'
    );

  try {
    const queue =
      makeQueue(
        dir,
        () => 1000
      );

    queue.enqueue(
      payload(
        '55555555-5555-4555-8555-555555555555',
        'OFFLINE-UI-011',
        1000
      )
    );

    let calls = 0;

    const sender =
      createOfflineTelemetrySender({
        queue,
        async postAuthenticatedDeviceJson() {
          calls += 1;
          return {};
        }
      });

    const summary =
      await sender.flush({});

    assert.equal(
      summary.status,
      'SKIPPED_IDENTITY_UNAVAILABLE'
    );

    assert.equal(
      calls,
      0
    );

    assert.equal(
      queue.getStats()
        .pendingCount,
      1
    );
  } finally {
    fs.rmSync(
      dir,
      {
        recursive: true,
        force: true
      }
    );
  }
});

test('flush concorrente compartilha a mesma execução de rede', async () => {
  const dir =
    tempDir(
      'efisco-telemetry-sender-concurrent-'
    );

  try {
    const queue =
      makeQueue(
        dir,
        () => 1000
      );

    const created =
      payload(
        '66666666-6666-4666-8666-666666666666',
        'OFFLINE-UI-011',
        1000
      );

    queue.enqueue(
      created
    );

    let calls = 0;
    let release;

    const gate =
      new Promise(
        (resolve) => {
          release =
            resolve;
        }
      );

    const sender =
      createOfflineTelemetrySender({
        queue,
        async postAuthenticatedDeviceJson() {
          calls += 1;

          await gate;

          return {
            status: 'OK',
            acceptedEventIds: [
              created.eventId
            ]
          };
        }
      });

    const first =
      sender.flush({
        deviceId:
          'DEVICE-1',
        deviceToken:
          'TOKEN-1'
      });

    const second =
      sender.flush({
        deviceId:
          'DEVICE-1',
        deviceToken:
          'TOKEN-1'
      });

    await Promise.resolve();

    assert.equal(
      sender.isRunning(),
      true
    );

    assert.equal(
      calls,
      1
    );

    release();

    const [
      firstResult,
      secondResult
    ] =
      await Promise.all([
        first,
        second
      ]);

    assert.deepEqual(
      firstResult,
      secondResult
    );

    assert.equal(
      queue.getStats()
        .pendingCount,
      0
    );

    assert.equal(
      sender.isRunning(),
      false
    );
  } finally {
    fs.rmSync(
      dir,
      {
        recursive: true,
        force: true
      }
    );
  }
});
