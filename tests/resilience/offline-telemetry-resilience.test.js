'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  buildOfflineTelemetryPayload
} = require('../../offline/telemetry/payload');

const {
  createOfflineTelemetryQueue
} = require('../../offline/telemetry/queue');

const {
  createOfflineTelemetrySender
} = require('../../offline/telemetry/sender');

function tempDir(prefix) {
  return fs.mkdtempSync(
    path.join(os.tmpdir(), prefix)
  );
}

function report(code) {
  return {
    runtime: {
      appVersion: '1.0.41',
      platform: 'win32',
      arch: 'x64',
      osRelease: 'resilience',
      electronVersion: '43.4.1',
      chromeVersion: '142',
      packaged: true
    },
    summary: {
      ready: false,
      status: 'OFFLINE_SELF_TEST_NOT_READY',
      codes: [code],
      primaryDiagnostic: {
        code,
        category: 'UI',
        severity: 'ERROR'
      }
    },
    selfTest: {
      durationMs: 10,
      checks: {
        database: { ok: true, reason: 'DATABASE_READY', diagnostic: null },
        company: { ok: true, reason: 'COMPANY_READY', diagnostic: null },
        safeStorage: { ok: true, reason: 'SAFE_STORAGE_READY', diagnostic: null },
        credential: {
          ok: true,
          reason: 'CREDENTIAL_READY',
          activeCount: 1,
          usableCount: 1,
          diagnostic: null
        },
        server: {
          ok: true,
          reason: 'SERVER_READY',
          listening: true,
          diagnostic: null
        },
        renderer: {
          ok: false,
          reason: 'RENDERER_HEALTH_UNHEALTHY',
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
        reason: 'HEALTHCHECK_FAILED',
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

function payload(eventId, code, nowMs) {
  return buildOfflineTelemetryPayload({
    report: report(code),
    identity: {
      deviceId: 'RESILIENCE-DEVICE',
      empresaId: 'RESILIENCE-COMPANY'
    },
    now() {
      return nowMs;
    },
    randomUUID() {
      return eventId;
    }
  }).payload;
}

test('falha dupla no replace preserva o último arquivo durável', () => {
  const dir =
    tempDir(
      'efisco-resilience-rename-'
    );

  let clock =
    Date.parse(
      '2026-09-28T20:00:00.000Z'
    );

  try {
    const firstQueue =
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

    const firstPayload =
      payload(
        '11111111-1111-4111-8111-111111111111',
        'OFFLINE-UI-011',
        clock
      );

    firstQueue.enqueue(
      firstPayload
    );

    const queueFile =
      firstQueue.getStats().path;

    assert.equal(
      fs.existsSync(queueFile),
      true
    );

    const faultFs =
      Object.create(fs);

    let replaceRenameCalls = 0;

    faultFs.renameSync =
      function renameSync(
        source,
        destination
      ) {
        if (
          destination === queueFile &&
          String(source)
            .includes(
              'pending-queue.json.tmp-'
            )
        ) {
          replaceRenameCalls += 1;

          if (
            replaceRenameCalls <= 2
          ) {
            const error =
              new Error(
                'simulated rename failure'
              );

            error.code =
              replaceRenameCalls === 1
                ? 'EPERM'
                : 'EIO';

            throw error;
          }
        }

        return fs.renameSync(
          source,
          destination
        );
      };

    clock += 1000;

    const faultQueue =
      createOfflineTelemetryQueue({
        fs: faultFs,
        path,
        getUserDataDir() {
          return dir;
        },
        now() {
          return clock;
        }
      });

    assert.throws(
      () =>
        faultQueue.enqueue(
          payload(
            '22222222-2222-4222-8222-222222222222',
            'OFFLINE-UI-012',
            clock
          )
        ),
      /simulated rename failure/
    );

    const recovered =
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
      recovered.peekPending({
        limit: 10,
        nowMs: clock
      });

    assert.equal(
      pending.length,
      1
    );

    assert.equal(
      pending[0].eventId,
      firstPayload.eventId
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


test('timeout preserva item, respeita backoff e drena quando a API volta', async () => {
  const dir =
    tempDir(
      'efisco-resilience-network-'
    );

  let clock =
    Date.parse(
      '2026-09-28T21:00:00.000Z'
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
      payload(
        crypto.randomUUID(),
        'OFFLINE-SERVER-002',
        clock
      );

    queue.enqueue(
      created
    );

    let networkUp = false;
    let calls = 0;

    const sender =
      createOfflineTelemetrySender({
        queue,
        now() {
          return clock;
        },
        random() {
          return 0.5;
        },
        async postAuthenticatedDeviceJson({
          payload: body
        }) {
          calls += 1;

          if (!networkUp) {
            const error =
              new Error(
                'simulated timeout'
              );

            error.code =
              'ETIMEDOUT';

            throw error;
          }

          return {
            status: 'OK',
            acceptedEventIds:
              body.events.map(
                (event) =>
                  event.eventId
              )
          };
        }
      });

    const failed =
      await sender.flush({
        deviceId:
          'RESILIENCE-DEVICE',
        deviceToken:
          'RESILIENCE-TOKEN'
      });

    assert.equal(
      failed.status,
      'PARTIAL_OR_DEFERRED'
    );

    assert.equal(
      failed.accepted,
      0
    );

    assert.equal(
      queue.getStats()
        .pendingCount,
      1
    );

    assert.equal(
      calls,
      1
    );

    const duringBackoff =
      await sender.flush({
        deviceId:
          'RESILIENCE-DEVICE',
        deviceToken:
          'RESILIENCE-TOKEN'
      });

    assert.equal(
      duringBackoff.status,
      'NO_PENDING'
    );

    assert.equal(
      calls,
      1
    );

    clock +=
      15 * 1000;

    networkUp = true;

    const recovered =
      await sender.flush({
        deviceId:
          'RESILIENCE-DEVICE',
        deviceToken:
          'RESILIENCE-TOKEN'
      });

    assert.equal(
      recovered.status,
      'FLUSHED'
    );

    assert.equal(
      recovered.accepted,
      1
    );

    assert.equal(
      queue.getStats()
        .pendingCount,
      0
    );

    assert.equal(
      calls,
      2
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

test('evento permanece durável após 20 dias offline e envia no retorno', async () => {
  const dir =
    tempDir(
      'efisco-resilience-long-offline-'
    );

  let clock =
    Date.parse(
      '2026-09-01T12:00:00.000Z'
    );

  try {
    const initial =
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

    initial.enqueue(
      payload(
        crypto.randomUUID(),
        'OFFLINE-UI-011',
        clock
      )
    );

    clock +=
      20 *
      24 *
      60 *
      60 *
      1000;

    const afterTwentyDays =
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

    assert.equal(
      afterTwentyDays
        .getStats()
        .pendingCount,
      1
    );

    const sender =
      createOfflineTelemetrySender({
        queue:
          afterTwentyDays,
        now() {
          return clock;
        },
        async postAuthenticatedDeviceJson({
          payload: body
        }) {
          return {
            status: 'OK',
            acceptedEventIds:
              body.events.map(
                (event) =>
                  event.eventId
              )
          };
        }
      });

    const result =
      await sender.flush({
        deviceId:
          'RESILIENCE-DEVICE',
        deviceToken:
          'RESILIENCE-TOKEN'
      });

    assert.equal(
      result.accepted,
      1
    );

    assert.equal(
      afterTwentyDays
        .getStats()
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

test('retenção local descarta evento somente após ultrapassar 30 dias', () => {
  const dir =
    tempDir(
      'efisco-resilience-retention-'
    );

  let clock =
    Date.parse(
      '2026-08-01T00:00:00.000Z'
    );

  try {
    const initial =
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

    initial.enqueue(
      payload(
        crypto.randomUUID(),
        'OFFLINE-UI-011',
        clock
      )
    );

    clock +=
      29 *
      24 *
      60 *
      60 *
      1000;

    const day29 =
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

    assert.equal(
      day29.getStats()
        .pendingCount,
      1
    );

    clock +=
      2 *
      24 *
      60 *
      60 *
      1000;

    const day31 =
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

    assert.equal(
      day31.getStats()
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

test('falha de disco antes do rename mantém o arquivo durável anterior', () => {
  const dir =
    tempDir(
      'efisco-resilience-disk-'
    );

  let clock =
    Date.parse(
      '2026-09-28T22:00:00.000Z'
    );

  try {
    const stable =
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

    const stablePayload =
      payload(
        crypto.randomUUID(),
        'OFFLINE-UI-011',
        clock
      );

    stable.enqueue(
      stablePayload
    );

    const faultFs =
      Object.create(fs);

    faultFs.writeFileSync =
      function writeFileSync(
        file,
        content,
        encoding
      ) {
        if (
          String(file)
            .includes(
              'pending-queue.json.tmp-'
            )
        ) {
          const error =
            new Error(
              'simulated disk full'
            );

          error.code =
            'ENOSPC';

          throw error;
        }

        return fs.writeFileSync(
          file,
          content,
          encoding
        );
      };

    clock += 1000;

    const faultQueue =
      createOfflineTelemetryQueue({
        fs: faultFs,
        path,
        getUserDataDir() {
          return dir;
        },
        now() {
          return clock;
        }
      });

    assert.throws(
      () =>
        faultQueue.enqueue(
          payload(
            crypto.randomUUID(),
            'OFFLINE-UI-012',
            clock
          )
        ),
      /simulated disk full/
    );

    const recovered =
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
      recovered.peekPending({
        limit: 10,
        nowMs: clock
      });

    assert.equal(
      pending.length,
      1
    );

    assert.equal(
      pending[0].eventId,
      stablePayload.eventId
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

test('startup restaura .previous após interrupção entre os dois renames', () => {
  const dir =
    tempDir(
      'efisco-resilience-previous-'
    );

  const clock =
    Date.parse(
      '2026-09-28T23:00:00.000Z'
    );

  try {
    const stable =
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

    const stablePayload =
      payload(
        crypto.randomUUID(),
        'OFFLINE-UI-011',
        clock
      );

    stable.enqueue(
      stablePayload
    );

    const queueFile =
      stable.getStats().path;

    const previousFile =
      queueFile +
      '.previous';

    fs.renameSync(
      queueFile,
      previousFile
    );

    fs.writeFileSync(
      queueFile +
      '.tmp-crash',
      '{"partial":',
      'utf8'
    );

    const logs = [];

    const recovered =
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
      recovered.getStats()
        .pendingCount,
      1
    );

    assert.equal(
      recovered.peekPending({
        limit: 10,
        nowMs: clock
      })[0].eventId,
      stablePayload.eventId
    );

    assert.equal(
      logs.some(
        (entry) =>
          entry[0] ===
          'OFFLINE TELEMETRY QUEUE RECOVERED'
      ),
      true
    );

    assert.equal(
      fs.existsSync(
        previousFile
      ),
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

test('fila corrompida é quarentenada e volta a aceitar novos eventos', () => {
  const dir =
    tempDir(
      'efisco-resilience-corrupt-'
    );

  const clock =
    Date.parse(
      '2026-09-29T00:00:00.000Z'
    );

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
      '{"broken"',
      'utf8'
    );

    const recovered =
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

    assert.equal(
      recovered.getStats()
        .pendingCount,
      0
    );

    const newPayload =
      payload(
        crypto.randomUUID(),
        'OFFLINE-UI-011',
        clock
      );

    const result =
      recovered.enqueue(
        newPayload
      );

    assert.equal(
      result.queued,
      true
    );

    const restarted =
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

    assert.equal(
      restarted.getStats()
        .pendingCount,
      1
    );

    assert.equal(
      fs.readdirSync(
        queueDir
      ).some(
        (name) =>
          name.startsWith(
            'pending-queue.json.corrupt-'
          )
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


test('fallback Windows substitui com sucesso quando apenas o primeiro rename falha', () => {
  const dir =
    tempDir(
      'efisco-resilience-windows-replace-'
    );

  let clock =
    Date.parse(
      '2026-09-29T01:00:00.000Z'
    );

  try {
    const stable =
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
      payload(
        crypto.randomUUID(),
        'OFFLINE-UI-011',
        clock
      );

    stable.enqueue(
      first
    );

    const queueFile =
      stable.getStats().path;

    const faultFs =
      Object.create(fs);

    let failedOnce = false;

    faultFs.renameSync =
      function renameSync(
        source,
        destination
      ) {
        if (
          !failedOnce &&
          destination === queueFile &&
          String(source)
            .includes(
              'pending-queue.json.tmp-'
            )
        ) {
          failedOnce = true;

          const error =
            new Error(
              'simulated Windows destination busy'
            );

          error.code =
            'EPERM';

          throw error;
        }

        return fs.renameSync(
          source,
          destination
        );
      };

    clock += 1000;

    const windowsQueue =
      createOfflineTelemetryQueue({
        fs: faultFs,
        path,
        getUserDataDir() {
          return dir;
        },
        now() {
          return clock;
        }
      });

    const second =
      payload(
        crypto.randomUUID(),
        'OFFLINE-UI-012',
        clock
      );

    const result =
      windowsQueue.enqueue(
        second
      );

    assert.equal(
      result.queued,
      true
    );

    const restarted =
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

    const ids =
      restarted
        .peekPending({
          limit: 10,
          nowMs: clock
        })
        .map(
          (item) =>
            item.eventId
        );

    assert.equal(
      ids.length,
      2
    );

    assert.equal(
      ids.includes(
        first.eventId
      ),
      true
    );

    assert.equal(
      ids.includes(
        second.eventId
      ),
      true
    );

    assert.equal(
      fs.existsSync(
        queueFile +
        '.previous'
      ),
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
