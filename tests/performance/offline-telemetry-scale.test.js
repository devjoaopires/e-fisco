'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  performance
} = require('node:perf_hooks');

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
    path.join(
      os.tmpdir(),
      prefix
    )
  );
}

function report(code) {
  return {
    runtime: {
      appVersion: '1.0.41',
      platform: 'win32',
      arch: 'x64',
      osRelease: 'scale',
      electronVersion: '43.4.1',
      chromeVersion: '142',
      packaged: true
    },
    summary: {
      ready: false,
      status:
        'OFFLINE_SELF_TEST_NOT_READY',
      codes: [code],
      primaryDiagnostic: {
        code,
        category: 'UI',
        severity: 'ERROR'
      }
    },
    selfTest: {
      durationMs: 25,
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

function makePayload({
  eventId,
  code,
  nowMs
}) {
  return buildOfflineTelemetryPayload({
    report:
      report(code),
    identity: {
      deviceId:
        'SCALE-DEVICE',
      empresaId:
        'SCALE-COMPANY'
    },
    now() {
      return nowMs;
    },
    randomUUID() {
      return eventId;
    }
  }).payload;
}

function metric(name, value) {
  console.log(
    'SCALE_METRIC ' +
    name +
    '=' +
    String(value)
  );
}

test(
  'fila no limite de produção mantém 100 eventos, recarrega e drena em batches',
  async () => {
    const dir =
      tempDir(
        'efisco-scale-queue-'
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
          },
          maxItems: 100,
          maxBytes:
            4 * 1024 * 1024
        });

      const enqueueStarted =
        performance.now();

      for (
        let index = 0;
        index < 100;
        index += 1
      ) {
        clock += 1;

        const result =
          queue.enqueue(
            makePayload({
              eventId:
                crypto.randomUUID(),
              code:
                'OFFLINE-SCALE-' +
                String(index)
                  .padStart(
                    3,
                    '0'
                  ),
              nowMs:
                clock
            })
          );

        assert.equal(
          result.ok,
          true
        );
      }

      const enqueueMs =
        performance.now() -
        enqueueStarted;

      const stats =
        queue.getStats();

      assert.equal(
        stats.pendingCount,
        100
      );

      assert.ok(
        stats.queueSizeBytes <=
          4 * 1024 * 1024
      );

      const reloadStarted =
        performance.now();

      const reloaded =
        createOfflineTelemetryQueue({
          fs,
          path,
          getUserDataDir() {
            return dir;
          },
          now() {
            return clock;
          },
          maxItems: 100,
          maxBytes:
            4 * 1024 * 1024
        });

      const reloadMs =
        performance.now() -
        reloadStarted;

      assert.equal(
        reloaded.getStats()
          .pendingCount,
        100
      );

      let networkCalls = 0;
      let maxBatchSeen = 0;

      const sender =
        createOfflineTelemetrySender({
          queue:
            reloaded,
          batchSize: 25,
          maxBatchesPerFlush: 10,
          now() {
            return clock;
          },
          async postAuthenticatedDeviceJson({
            payload
          }) {
            networkCalls += 1;
            maxBatchSeen =
              Math.max(
                maxBatchSeen,
                payload.events.length
              );

            return {
              status: 'OK',
              acceptedEventIds:
                payload.events.map(
                  (event) =>
                    event.eventId
                )
            };
          }
        });

      const drainStarted =
        performance.now();

      const summary =
        await sender.flush({
          deviceId:
            'SCALE-DEVICE',
          deviceToken:
            'SCALE-TOKEN'
        });

      const drainMs =
        performance.now() -
        drainStarted;

      assert.equal(
        summary.accepted,
        100
      );

      assert.equal(
        reloaded.getStats()
          .pendingCount,
        0
      );

      assert.equal(
        networkCalls,
        4
      );

      assert.equal(
        maxBatchSeen,
        25
      );

      metric(
        'desktop_queue_100_enqueue_ms',
        Math.round(enqueueMs)
      );

      metric(
        'desktop_queue_100_reload_ms',
        Math.round(reloadMs)
      );

      metric(
        'desktop_queue_100_drain_ms',
        Math.round(drainMs)
      );

      metric(
        'desktop_queue_100_bytes',
        stats.queueSizeBytes
      );

      assert.ok(
        enqueueMs < 30000,
        'enqueue de 100 itens excedeu 30s'
      );

      assert.ok(
        reloadMs < 10000,
        'reload da fila excedeu 10s'
      );

      assert.ok(
        drainMs < 10000,
        'drain local simulado excedeu 10s'
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
  }
);

test(
  '1000 atualizações do mesmo estado são coalescidas em um único item',
  () => {
    const dir =
      tempDir(
        'efisco-scale-coalesce-'
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
          },
          maxItems: 100,
          maxBytes:
            4 * 1024 * 1024
        });

      const started =
        performance.now();

      for (
        let index = 0;
        index < 1000;
        index += 1
      ) {
        clock += 1;

        const result =
          queue.enqueue(
            makePayload({
              eventId:
                crypto.randomUUID(),
              code:
                'OFFLINE-UI-011',
              nowMs:
                clock
            })
          );

        assert.equal(
          result.ok,
          true
        );
      }

      const elapsedMs =
        performance.now() -
        started;

      assert.equal(
        queue.getStats()
          .pendingCount,
        1
      );

      metric(
        'desktop_coalesce_1000_ms',
        Math.round(elapsedMs)
      );

      assert.ok(
        elapsedMs < 30000,
        'coalescência de 1000 eventos excedeu 30s'
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
  }
);

test(
  '20 flushes concorrentes compartilham uma única drenagem de 100 eventos',
  async () => {
    const dir =
      tempDir(
        'efisco-scale-concurrent-'
      );

    let clock =
      Date.parse(
        '2026-09-28T22:00:00.000Z'
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
          },
          maxItems: 100,
          maxBytes:
            4 * 1024 * 1024
        });

      for (
        let index = 0;
        index < 100;
        index += 1
      ) {
        clock += 1;

        queue.enqueue(
          makePayload({
            eventId:
              crypto.randomUUID(),
            code:
              'OFFLINE-CONCURRENT-' +
              String(index)
                .padStart(
                  3,
                  '0'
                ),
            nowMs:
              clock
          })
        );
      }

      let networkCalls = 0;

      const sender =
        createOfflineTelemetrySender({
          queue,
          batchSize: 25,
          maxBatchesPerFlush: 10,
          now() {
            return clock;
          },
          async postAuthenticatedDeviceJson({
            payload
          }) {
            networkCalls += 1;

            await new Promise(
              (resolve) =>
                setTimeout(
                  resolve,
                  2
                )
            );

            return {
              status: 'OK',
              acceptedEventIds:
                payload.events.map(
                  (event) =>
                    event.eventId
                )
            };
          }
        });

      const started =
        performance.now();

      const results =
        await Promise.all(
          Array.from(
            {
              length: 20
            },
            () =>
              sender.flush({
                deviceId:
                  'SCALE-DEVICE',
                deviceToken:
                  'SCALE-TOKEN'
              })
          )
        );

      const elapsedMs =
        performance.now() -
        started;

      assert.equal(
        networkCalls,
        4
      );

      assert.equal(
        queue.getStats()
          .pendingCount,
        0
      );

      for (
        const result of
          results
      ) {
        assert.equal(
          result.accepted,
          100
        );
      }

      metric(
        'desktop_concurrent_20_flushes_ms',
        Math.round(elapsedMs)
      );

      metric(
        'desktop_concurrent_network_batches',
        networkCalls
      );

      assert.ok(
        elapsedMs < 10000,
        'flushes concorrentes excederam 10s'
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
  }
);
