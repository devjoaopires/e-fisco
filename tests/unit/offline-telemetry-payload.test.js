'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  OFFLINE_TELEMETRY_SCHEMA_VERSION,
  buildTelemetryRefs,
  buildOfflineTelemetryPayload
} = require('../../offline/telemetry/payload');

function diagnosticReport() {
  return {
    schemaVersion: 1,
    generatedAt:
      '2026-09-28T20:00:00.000Z',
    runtime: {
      appVersion: '1.0.41',
      platform: 'win32',
      arch: 'x64',
      osRelease: '10.0.26100',
      electronVersion: '43.4.1',
      chromeVersion: '142.0',
      nodeVersion: '22.0.0',
      packaged: true,
      hostname:
        'HOST-NAO-DEVE-SAIR'
    },
    summary: {
      ready: false,
      status:
        'OFFLINE_SELF_TEST_NOT_READY',
      codes: [
        'OFFLINE-AUTH-003',
        'OFFLINE-UI-011'
      ],
      primaryDiagnostic: {
        code:
          'OFFLINE-AUTH-003',
        category: 'AUTH',
        severity: 'ERROR',
        message:
          'mensagem interna'
      }
    },
    selfTest: {
      durationMs: 123,
      empresaId:
        'EMPRESA-RAW',
      operadorId:
        'OPERADOR-RAW',
      deviceToken:
        'TOKEN-RAW',
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
          empresaId:
            'EMPRESA-RAW',
          diagnostic: null
        },
        safeStorage: {
          ok: true,
          reason:
            'SAFE_STORAGE_READY',
          diagnostic: null
        },
        credential: {
          ok: false,
          reason:
            'CREDENTIAL_NOT_USABLE',
          activeCount: 1,
          usableCount: 0,
          operadorId:
            'OPERADOR-RAW',
          verifier:
            'VERIFIER-RAW',
          diagnostic: {
            code:
              'OFFLINE-AUTH-003',
            category:
              'AUTH',
            severity:
              'ERROR',
            message:
              'nao enviar'
          }
        },
        server: {
          ok: true,
          reason:
            'SERVER_READY',
          host:
            '127.0.0.1',
          port: 43123,
          origin:
            'http://127.0.0.1:43123',
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
          rawHtml:
            '<secret>',
          diagnostic: {
            code:
              'OFFLINE-UI-011',
            category:
              'UI',
            severity:
              'ERROR'
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
        pdvScriptReady: false,
        rawHtml:
          '<renderer-secret>'
      }
    },
    autoRepair: {
      status:
        'OFFLINE_AUTO_REPAIR_INCOMPLETE',
      repaired: false,
      actions: [
        {
          action:
            'RENDERER_RECOVERY',
          attempted: true,
          success: false,
          reason:
            'BUDGET_EXHAUSTED',
          codes: [
            'OFFLINE-UI-011'
          ],
          rawError:
            'erro bruto'
        }
      ],
      unresolved: [
        {
          code:
            'OFFLINE-AUTH-003',
          classification:
            'ONLINE_REPROVISION_REQUIRED',
          password:
            'senha'
        }
      ],
      remainingCodes: [
        'OFFLINE-AUTH-003'
      ]
    },
    history: [
      {
        at:
          '2026-09-28T19:59:00.000Z',
        type:
          'READINESS_CHANGE',
        data: {
          status:
            'OFFLINE_NOT_READY',
          source: 'runtime',
          codes: [
            'OFFLINE-AUTH-003'
          ],
          primaryCode:
            'OFFLINE-AUTH-003',
          token:
            'TOKEN-HISTORY'
        }
      },
      {
        at:
          '2026-09-28T19:59:30.000Z',
        type:
          'RENDERER_FAILURE',
        data: {
          code:
            'OFFLINE-UI-011',
          failureType:
            'HEALTHCHECK_FAILED',
          severity:
            'ERROR',
          error:
            'stack secreto'
        }
      }
    ],
    path:
      'C:\\Users\\JOAO\\secret\\report.json',
    password:
      'SENHA-ROOT'
  };
}

test('telemetria pseudonimiza identidade sem incluir ids brutos', () => {
  const refs =
    buildTelemetryRefs({
      deviceId:
        'DEVICE-RAW-123',
      empresaId:
        'EMPRESA-RAW-456',
      deviceToken:
        'TOKEN-RAW'
    });

  assert.match(
    refs.deviceRef,
    /^sha256:[a-f0-9]{64}$/
  );

  assert.match(
    refs.companyRef,
    /^hmac-sha256:[a-f0-9]{64}$/
  );

  const serialized =
    JSON.stringify(
      refs
    );

  assert.equal(
    serialized.includes(
      'DEVICE-RAW-123'
    ),
    false
  );

  assert.equal(
    serialized.includes(
      'EMPRESA-RAW-456'
    ),
    false
  );

  assert.equal(
    serialized.includes(
      'TOKEN-RAW'
    ),
    false
  );
});

test('payload de telemetria usa allowlist e não vaza segredos do relatório', () => {
  const built =
    buildOfflineTelemetryPayload({
      report:
        diagnosticReport(),
      identity: {
        deviceId:
          'DEVICE-RAW-123',
        empresaId:
          'EMPRESA-RAW-456',
        deviceToken:
          'DEVICE-TOKEN-RAW'
      },
      now() {
        return Date.parse(
          '2026-09-28T20:01:00.000Z'
        );
      },
      randomUUID() {
        return '11111111-2222-4333-8444-555555555555';
      }
    });

  assert.equal(
    built.payload.schemaVersion,
    OFFLINE_TELEMETRY_SCHEMA_VERSION
  );

  assert.equal(
    built.payload.eventId,
    '11111111-2222-4333-8444-555555555555'
  );

  assert.equal(
    built.payload.state.ready,
    false
  );

  assert.deepEqual(
    built.payload.state.codes,
    [
      'OFFLINE-AUTH-003',
      'OFFLINE-UI-011'
    ]
  );

  assert.equal(
    built.payload.state
      .checks.credential
      .activeCount,
    1
  );

  assert.equal(
    built.payload.state
      .checks.server
      .listening,
    true
  );

  const serialized =
    JSON.stringify(
      built.payload
    );

  for (const forbidden of [
    'DEVICE-RAW-123',
    'EMPRESA-RAW-456',
    'DEVICE-TOKEN-RAW',
    'TOKEN-RAW',
    'VERIFIER-RAW',
    'OPERADOR-RAW',
    'SENHA-ROOT',
    'TOKEN-HISTORY',
    'stack secreto',
    'erro bruto',
    '<secret>',
    '<renderer-secret>',
    'C:\\Users\\JOAO\\secret',
    '"origin"',
    '"host"',
    '"port"',
    '"nodeVersion"'
  ]) {
    assert.equal(
      serialized.includes(
        forbidden
      ),
      false,
      forbidden
    );
  }
});

test('dedupeKey permanece estável quando muda eventId e horário', () => {
  const first =
    buildOfflineTelemetryPayload({
      report:
        diagnosticReport(),
      identity: {
        deviceId:
          'DEVICE-1',
        empresaId:
          'EMPRESA-1'
      },
      now() {
        return 1000;
      },
      randomUUID() {
        return 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      }
    });

  const second =
    buildOfflineTelemetryPayload({
      report:
        diagnosticReport(),
      identity: {
        deviceId:
          'DEVICE-1',
        empresaId:
          'EMPRESA-1'
      },
      now() {
        return 2000;
      },
      randomUUID() {
        return 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      }
    });

  assert.equal(
    first.payload.dedupeKey,
    second.payload.dedupeKey
  );

  assert.notEqual(
    first.payload.integrity
      .payloadHash,
    second.payload.integrity
      .payloadHash
  );
});

test('payloadHash corresponde ao conteúdo sem o bloco integrity', () => {
  const built =
    buildOfflineTelemetryPayload({
      report:
        diagnosticReport(),
      identity: {
        deviceId:
          'DEVICE-1',
        empresaId:
          'EMPRESA-1'
      },
      now() {
        return 1234;
      },
      randomUUID() {
        return 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      }
    });

  const {
    integrity,
    ...unsigned
  } = built.payload;

  const expected =
    'sha256:' +
    crypto
      .createHash(
        'sha256'
      )
      .update(
        JSON.stringify(
          unsigned
        ),
        'utf8'
      )
      .digest(
        'hex'
      );

  assert.equal(
    integrity.algorithm,
    'SHA-256'
  );

  assert.equal(
    integrity.payloadHash,
    expected
  );
});

test('limite de bytes reduz histórico sem remover estado diagnóstico', () => {
  const report =
    diagnosticReport();

  report.history =
    Array.from(
      {
        length: 40
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
            'OFFLINE_SELF_TEST_NOT_READY_' +
            'X'.repeat(
              80
            ),
          ready: false,
          codes: [
            'OFFLINE-AUTH-003',
            'OFFLINE-UI-011'
          ],
          primaryCode:
            'OFFLINE-AUTH-003',
          durationMs:
            100 + index
        }
      })
    );

  const built =
    buildOfflineTelemetryPayload({
      report,
      identity: {
        deviceId:
          'DEVICE-1',
        empresaId:
          'EMPRESA-1'
      },
      now() {
        return 5000;
      },
      randomUUID() {
        return 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
      },
      maxPayloadBytes:
        4096,
      maxHistoryEvents:
        20
    });

  assert.ok(
    built.sizeBytes <=
      4096
  );

  assert.ok(
    built.historyDropped >
      0
  );

  assert.deepEqual(
    built.payload.state.codes,
    [
      'OFFLINE-AUTH-003',
      'OFFLINE-UI-011'
    ]
  );
});

test('maxHistoryEvents zero realmente remove histórico', () => {
  const built =
    buildOfflineTelemetryPayload({
      report:
        diagnosticReport(),
      maxHistoryEvents: 0,
      randomUUID() {
        return 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
      }
    });

  assert.deepEqual(
    built.payload.history,
    []
  );

  assert.equal(
    built.historyIncluded,
    0
  );
});
