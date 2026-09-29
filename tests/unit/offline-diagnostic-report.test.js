'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  sanitizeSelfTest,
  sanitizeAutoRepair,
  createOfflineDiagnosticReportService
} = require('../../offline/diagnostics/report');

function readySelfTest() {
  return {
    schemaVersion: 1,
    catalogVersion: 1,
    status:
      'OFFLINE_SELF_TEST_READY',
    ready: true,
    source:
      'diagnostic-report',
    startedAt:
      '2026-09-28T20:00:00.000Z',
    completedAt:
      '2026-09-28T20:00:00.100Z',
    durationMs: 100,
    empresaId:
      'EMPRESA-SENSIVEL',
    operadorId:
      'OPERADOR-SENSIVEL',
    deviceToken:
      'TOKEN-NAO-PODE-SAIR',
    password:
      'SENHA-NAO-PODE-SAIR',
    codes: [],
    primaryDiagnostic: null,
    checks: {
      database: {
        ok: true,
        reason:
          'DATABASE_READY'
      },
      company: {
        ok: true,
        reason:
          'COMPANY_READY',
        empresaId:
          'EMPRESA-SENSIVEL'
      },
      safeStorage: {
        ok: true,
        reason:
          'SAFE_STORAGE_READY'
      },
      credential: {
        ok: true,
        reason:
          'CREDENTIAL_READY',
        activeCount: 2,
        usableCount: 1,
        operadorId:
          'OPERADOR-SENSIVEL',
        verifier:
          'VERIFIER-NAO-PODE-SAIR'
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
        listening: true
      },
      renderer: {
        ok: true,
        reason:
          'RENDERER_READY',
        readyFlag: true,
        healthFresh: true,
        healthHealthy: true,
        recoveryRunning: false
      }
    },
    rendererProbe: {
      attempted: true,
      ok: true,
      reason: 'HEALTHY',
      shellReady: true,
      preloadReady: true,
      pdvReady: true,
      pdvMarkerReady: true,
      pdvScriptReady: true,
      rawHtml:
        '<secret>'
    }
  };
}

test('relatório sanitiza self-test sem identificadores e segredos', () => {
  const sanitized =
    sanitizeSelfTest(
      readySelfTest()
    );

  const serialized =
    JSON.stringify(
      sanitized
    );

  for (const forbidden of [
    'EMPRESA-SENSIVEL',
    'OPERADOR-SENSIVEL',
    'TOKEN-NAO-PODE-SAIR',
    'SENHA-NAO-PODE-SAIR',
    'VERIFIER-NAO-PODE-SAIR',
    '<secret>',
    '"origin"',
    '"host"',
    '"port"'
  ]) {
    assert.equal(
      serialized.includes(
        forbidden
      ),
      false,
      forbidden
    );
  }

  assert.equal(
    sanitized.checks.credential
      .activeCount,
    2
  );
  assert.equal(
    sanitized.checks.credential
      .usableCount,
    1
  );
  assert.equal(
    sanitized.checks.server
      .listening,
    true
  );
});

test('relatório sanitiza auto-reparo e mantém apenas ações/códigos', () => {
  const sanitized =
    sanitizeAutoRepair({
      schemaVersion: 1,
      status:
        'OFFLINE_AUTO_REPAIR_INCOMPLETE',
      repaired: false,
      secretToken:
        'TOKEN-SECRETO',
      actions: [
        {
          action:
            'SERVER_RESTART',
          attempted: true,
          success: true,
          reason:
            'SERVER_AND_RENDERER_RESTARTED',
          codes: [
            'OFFLINE-SERVER-002'
          ],
          rawError:
            'erro interno'
        }
      ],
      unresolved: [
        {
          code:
            'OFFLINE-AUTH-003',
          classification:
            'ONLINE_REPROVISION_REQUIRED',
          password:
            'segredo'
        }
      ],
      after: {
        codes: [
          'OFFLINE-AUTH-003'
        ],
        credential:
          'nao-sair'
      }
    });

  assert.deepEqual(
    sanitized.actions,
    [
      {
        action:
          'SERVER_RESTART',
        attempted: true,
        success: true,
        reason:
          'SERVER_AND_RENDERER_RESTARTED',
        codes: [
          'OFFLINE-SERVER-002'
        ]
      }
    ]
  );

  assert.deepEqual(
    sanitized.remainingCodes,
    [
      'OFFLINE-AUTH-003'
    ]
  );

  const serialized =
    JSON.stringify(
      sanitized
    );

  assert.equal(
    serialized.includes(
      'TOKEN-SECRETO'
    ),
    false
  );
  assert.equal(
    serialized.includes(
      'erro interno'
    ),
    false
  );
  assert.equal(
    serialized.includes(
      'nao-sair'
    ),
    false
  );
});

test('serviço persiste relatório local e limita histórico sanitizado', () => {
  const temp =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        'efisco-diagnostic-report-'
      )
    );

  let clock =
    Date.parse(
      '2026-09-28T20:00:00.000Z'
    );

  try {
    const service =
      createOfflineDiagnosticReportService({
        fs,
        path,
        getUserDataDir() {
          return temp;
        },
        getRuntimeInfo() {
          return {
            appVersion:
              '1.0.41',
            platform:
              'win32',
            arch:
              'x64',
            osRelease:
              '10.0.26100',
            electronVersion:
              '43.4.1',
            chromeVersion:
              '142',
            nodeVersion:
              '22',
            packaged: true,
            hostname:
              'NAO-DEVE-SAIR'
          };
        },
        now() {
          return clock;
        },
        maxHistory: 5
      });

    for (
      let index = 0;
      index < 7;
      index += 1
    ) {
      service.record(
        'READINESS_CHANGE',
        {
          status:
            index % 2
              ? 'OFFLINE_READY'
              : 'OFFLINE_NOT_READY',
          source:
            'test',
          codes:
            index % 2
              ? []
              : [
                  'OFFLINE-UI-012'
                ],
          primaryCode:
            index % 2
              ? null
              : 'OFFLINE-UI-012',
          token:
            'NAO-SAIR'
        }
      );

      clock += 1000;
    }

    const persisted =
      service.persist({
        readiness: {
          status:
            'OFFLINE_READY',
          checkedAt:
            '2026-09-28T20:00:07.000Z',
          source:
            'test',
          diagnosticCodes: [],
          primaryDiagnostic: null,
          empresaId:
            'NAO-DEVE-SAIR',
          checks: {
            database: true,
            preparedCompany: true,
            safeStorage: true,
            credential: true,
            server: true,
            renderer: true
          }
        },
        selfTest:
          readySelfTest(),
        autoRepair: null
      });

    assert.equal(
      persisted.path,
      path.join(
        temp,
        'offline-diagnostics',
        'offline-diagnostic-report.json'
      )
    );

    const disk =
      JSON.parse(
        fs.readFileSync(
          persisted.path,
          'utf8'
        )
      );

    assert.equal(
      disk.schemaVersion,
      1
    );
    assert.equal(
      disk.runtime.appVersion,
      '1.0.41'
    );
    assert.equal(
      disk.summary.ready,
      true
    );
    assert.equal(
      disk.history.length,
      5
    );

    const serialized =
      JSON.stringify(
        disk
      );

    for (const forbidden of [
      'NAO-DEVE-SAIR',
      'NAO-SAIR',
      'EMPRESA-SENSIVEL',
      'OPERADOR-SENSIVEL',
      'TOKEN-NAO-PODE-SAIR'
    ]) {
      assert.equal(
        serialized.includes(
          forbidden
        ),
        false,
        forbidden
      );
    }

    const reloaded =
      createOfflineDiagnosticReportService({
        fs,
        path,
        getUserDataDir() {
          return temp;
        },
        getRuntimeInfo() {
          return {};
        },
        maxHistory: 5
      });

    assert.equal(
      reloaded.getHistory()
        .length,
      5
    );
  } finally {
    fs.rmSync(
      temp,
      {
        recursive: true,
        force: true
      }
    );
  }
});

test('histórico rejeita eventos desconhecidos em vez de persistir payload arbitrário', () => {
  const temp =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        'efisco-diagnostic-history-'
      )
    );

  try {
    const service =
      createOfflineDiagnosticReportService({
        fs,
        path,
        getUserDataDir() {
          return temp;
        }
      });

    const event =
      service.record(
        'EVENTO_ARBITRARIO',
        {
          token:
            'SEGREDO'
        }
      );

    assert.equal(
      event,
      null
    );
    assert.deepEqual(
      service.getHistory(),
      []
    );
  } finally {
    fs.rmSync(
      temp,
      {
        recursive: true,
        force: true
      }
    );
  }
});
