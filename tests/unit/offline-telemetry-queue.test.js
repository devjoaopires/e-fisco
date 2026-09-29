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
  validateOfflineTelemetryPayload,
  createOfflineTelemetryQueue
} = require('../../offline/telemetry/queue');

function report({
  code = 'OFFLINE-UI-011',
  status = 'OFFLINE_SELF_TEST_NOT_READY',
  ready = false,
  historySize = 4
} = {}) {
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
      ready,
      status,
      codes:
        code
          ? [code]
          : [],
      primaryDiagnostic:
        code
          ? {
              code,
              category: 'UI',
              severity: 'ERROR'
            }
          : null
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
          ok: ready,
          reason:
            ready
              ? 'RENDERER_READY'
              : 'RENDERER_HEALTH_UNHEALTHY',
          readyFlag: true,
          healthFresh: true,
          healthHealthy: ready,
          recoveryRunning: false,
          diagnostic:
            code
              ? {
                  code,
                  category: 'UI',
                  severity: 'ERROR'
                }
              : null
        }
      },
      rendererProbe: {
        attempted: true,
        ok: ready,
        reason:
          ready
            ? 'HEALTHY'
            : 'HEALTHCHECK_FAILED',
        shellReady: true,
        preloadReady: true,
        pdvReady: true,
        pdvMarkerReady: true,
        pdvScriptReady: ready
      }
    },
    autoRepair: null,
    history:
      Array.from(
        {
          length:
            historySize
        },
        (_, index) => ({
          at:
            new Date(
              1000 + index
            ).toISOString(),
          type:
            'SELF_TEST',
          data: {
            status:
              status +
              '-' +
              String(index) +
              '-' +
              'X'.repeat(
                80
              ),
            ready,
            codes:
              code
                ? [code]
                : [],
            primaryCode:
              code,
            durationMs:
              100 + index
          }
        })
      )
  };
}

function payload({
  eventId,
  nowMs,
  code =
    'OFFLINE-UI-011',
  ready = false,
  historySize = 4
}) {
  return buildOfflineTelemetryPayload({
    report:
      report({
        code,
        ready,
        historySize
      }),
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

test('fila persiste payload válido e recupera após reinício', () => {
  const dir =
    tempDir(
      'efisco-telemetry-queue-'
    );

  let clock =
    Date.parse(
      '2026-09-28T20:00:00.000Z'
    );

  try {
    const queue =
      createOfflineTelemetryQueue({
        fs,
        path,
        getUserDataDir() {
          return dir;
        },
        now() {
          return clock;
        }
      });

    const created =
      payload({
        eventId:
          '11111111-1111-4111-8111-111111111111',
        nowMs:
          clock
      });

    const result =
      queue.enqueue(
        created
      );

    assert.equal(
      result.ok,
      true
    );

    assert.equal(
      result.action,
      'ENQUEUED'
    );

    assert.equal(
      result.pendingCount,
      1
    );

    const stats =
      queue.getStats();

    assert.equal(
      fs.existsSync(
        stats.path
      ),
      true
    );

    const reloaded =
      createOfflineTelemetryQueue({
        fs,
        path,
        getUserDataDir() {
          return dir;
        },
        now() {
          return clock;
        }
      });

    const pending =
      reloaded.peekPending({
        limit: 10,
        nowMs:
          clock
      });

    assert.equal(
      pending.length,
      1
    );

    assert.equal(
      pending[0].payload
        .eventId,
      created.eventId
    );

    assert.equal(
      validateOfflineTelemetryPayload(
        pending[0].payload
      ).ok,
      true
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

test('dedupeKey coalesce estado repetido preservando queueId e tentativas', () => {
  const dir =
    tempDir(
      'efisco-telemetry-dedupe-'
    );

  let clock = 1000;

  try {
    const queue =
      createOfflineTelemetryQueue({
        fs,
        path,
        getUserDataDir() {
          return dir;
        },
        now() {
          return clock;
        }
      });

    const first =
      payload({
        eventId:
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        nowMs:
          1000
      });

    const firstResult =
      queue.enqueue(
        first
      );

    queue.markAttempt(
      firstResult.queueId,
      {
        attemptedAtMs:
          1100,
        nextAttemptAtMs:
          5000,
        errorCode:
          'NETWORK_OFFLINE'
      }
    );

    clock = 2000;

    const second =
      payload({
        eventId:
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        nowMs:
          2000
      });

    assert.equal(
      first.dedupeKey,
      second.dedupeKey
    );

    const secondResult =
      queue.enqueue(
        second
      );

    assert.equal(
      secondResult.action,
      'COALESCED'
    );

    assert.equal(
      secondResult.queueId,
      firstResult.queueId
    );

    assert.equal(
      secondResult.pendingCount,
      1
    );

    const hiddenByBackoff =
      queue.peekPending({
        nowMs: 3000
      });

    assert.equal(
      hiddenByBackoff.length,
      0
    );

    const pending =
      queue.peekPending({
        nowMs: 6000
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
      pending[0].attemptCount,
      1
    );

    assert.equal(
      pending[0].lastErrorCode,
      'NETWORK_OFFLINE'
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

test('fila rejeita payload adulterado por hash divergente', () => {
  const dir =
    tempDir(
      'efisco-telemetry-tamper-'
    );

  try {
    const queue =
      createOfflineTelemetryQueue({
        fs,
        path,
        getUserDataDir() {
          return dir;
        }
      });

    const original =
      payload({
        eventId:
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        nowMs: 1000
      });

    const tampered = {
      ...original,
      state: {
        ...original.state,
        status:
          'ALTERADO'
      }
    };

    const validation =
      validateOfflineTelemetryPayload(
        tampered
      );

    assert.equal(
      validation.ok,
      false
    );

    assert.equal(
      validation.reason,
      'PAYLOAD_HASH_MISMATCH'
    );

    const result =
      queue.enqueue(
        tampered
      );

    assert.equal(
      result.queued,
      false
    );

    assert.equal(
      queue.getStats()
        .pendingCount,
      0
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

test('fila respeita retenção e limite de itens removendo os mais antigos', () => {
  const dir =
    tempDir(
      'efisco-telemetry-retention-'
    );

  let clock = 0;

  try {
    const queue =
      createOfflineTelemetryQueue({
        fs,
        path,
        getUserDataDir() {
          return dir;
        },
        now() {
          return clock;
        },
        maxItems: 5,
        retentionMs:
          60 * 60 * 1000
      });

    const ids = [
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000005',
      '10000000-0000-4000-8000-000000000006'
    ];

    ids.forEach(
      (eventId, index) => {
        clock =
          index * 1000;

        queue.enqueue(
          payload({
            eventId,
            nowMs:
              clock,
            code:
              'OFFLINE-UI-' +
              String(
                20 + index
              )
                .padStart(
                  3,
                  '0'
                )
          })
        );
      }
    );

    assert.equal(
      queue.getStats()
        .pendingCount,
      5
    );

    const pending =
      queue.peekPending({
        limit: 10,
        nowMs:
          clock
      });

    assert.equal(
      pending.some(
        (item) =>
          item.eventId ===
          ids[0]
      ),
      false
    );

    clock =
      2 *
      60 *
      60 *
      1000;

    const compacted =
      queue.compact();

    assert.equal(
      compacted.pendingCount,
      0
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

test('markAttempt controla elegibilidade e acknowledge remove confirmação enviada', () => {
  const dir =
    tempDir(
      'efisco-telemetry-attempt-'
    );

  let clock = 1000;

  try {
    const queue =
      createOfflineTelemetryQueue({
        fs,
        path,
        getUserDataDir() {
          return dir;
        },
        now() {
          return clock;
        }
      });

    const result =
      queue.enqueue(
        payload({
          eventId:
            'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          nowMs:
            clock
        })
      );

    assert.equal(
      queue.markAttempt(
        result.queueId,
        {
          attemptedAtMs:
            1200,
          nextAttemptAtMs:
            10000,
          errorCode:
            'HTTP_503'
        }
      ),
      true
    );

    assert.equal(
      queue.peekPending({
        nowMs: 9000
      }).length,
      0
    );

    assert.equal(
      queue.peekPending({
        nowMs: 10000
      }).length,
      1
    );

    const ack =
      queue.acknowledge(
        result.queueId
      );

    assert.equal(
      ack.removed,
      1
    );

    assert.equal(
      ack.pendingCount,
      0
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

test('arquivo corrompido é colocado em quarentena e fila reinicia vazia', () => {
  const dir =
    tempDir(
      'efisco-telemetry-corrupt-'
    );

  let clock = 5000;

  try {
    const queueDir =
      path.join(
        dir,
        'offline-telemetry'
      );

    fs.mkdirSync(
      queueDir,
      {
        recursive: true
      }
    );

    const queueFile =
      path.join(
        queueDir,
        'pending-queue.json'
      );

    fs.writeFileSync(
      queueFile,
      '{arquivo-quebrado',
      'utf8'
    );

    const logs = [];

    const queue =
      createOfflineTelemetryQueue({
        fs,
        path,
        getUserDataDir() {
          return dir;
        },
        now() {
          return clock;
        },
        log(...args) {
          logs.push(
            args
          );
        }
      });

    assert.equal(
      queue.getStats()
        .pendingCount,
      0
    );

    const names =
      fs.readdirSync(
        queueDir
      );

    assert.equal(
      names.some(
        (name) =>
          name.startsWith(
            'pending-queue.json.corrupt-'
          )
      ),
      true
    );

    assert.equal(
      logs.some(
        (entry) =>
          entry[0] ===
          'OFFLINE TELEMETRY QUEUE LOAD FAILED'
      ),
      true
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

test('limite total de bytes elimina os itens mais antigos antes de exceder o teto', () => {
  const dir =
    tempDir(
      'efisco-telemetry-bytes-'
    );

  let clock = 1000;

  try {
    const queue =
      createOfflineTelemetryQueue({
        fs,
        path,
        getUserDataDir() {
          return dir;
        },
        now() {
          return clock;
        },
        maxItems: 200,
        maxBytes:
          256 * 1024
      });

    let enqueued = 0;

    for (
      let index = 0;
      index < 120;
      index += 1
    ) {
      clock += 1000;

      const result =
        queue.enqueue(
          payload({
            eventId:
              '20000000-0000-4000-8000-' +
              String(
                index
              )
                .padStart(
                  12,
                  '0'
                ),
            nowMs:
              clock,
            code:
              'OFFLINE-TEST-' +
              String(
                index
              )
                .padStart(
                  3,
                  '0'
                ),
            historySize:
              20
          })
        );

      if (
        result.queued
      ) {
        enqueued += 1;
      }
    }

    const stats =
      queue.getStats();

    assert.ok(
      enqueued >
      0
    );

    assert.ok(
      stats.queueSizeBytes <=
        256 * 1024
    );

    assert.ok(
      stats.pendingCount <
        120
    );

    const firstPending =
      queue.peekPending({
        limit: 50,
        nowMs:
          clock
      })[0];

    assert.notEqual(
      firstPending &&
      firstPending.eventId,
      '20000000-0000-4000-8000-000000000000'
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
