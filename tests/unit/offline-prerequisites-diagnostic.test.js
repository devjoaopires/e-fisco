'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveLoopbackServerState,
  collectOfflinePrerequisiteDiagnostics
} = require('../../offline/diagnostics/prerequisites');

function readyFixture(
  overrides = {}
) {
  const credential = {
    ativo: true,
    operadorId: 'op-1'
  };

  const view = {
    webContents: {
      isDestroyed() {
        return false;
      }
    }
  };

  const base = {
    getDatabase() {
      return {
        prepare() {
          return {
            get() {
              return {
                ok: 1
              };
            }
          };
        }
      };
    },
    probeDatabase(
      db
    ) {
      const row =
        db.prepare(
          'SELECT 1 AS ok'
        ).get();

      return (
        row &&
        row.ok === 1
      );
    },
    empresaIdValue:
      'empresa-1',
    resolveEmpresaId() {
      return 'empresa-1';
    },
    getPreparedCompany() {
      return {
        empresaId:
          'empresa-1'
      };
    },
    listActiveCredentials() {
      return [
        credential
      ];
    },
    verifyCredential(
      received
    ) {
      return (
        received ===
        credential
      );
    },
    safeStorage: {
      isEncryptionAvailable() {
        return true;
      }
    },
    offlineUiServer: {
      host: '127.0.0.1',
      port: 43123,
      origin:
        'http://127.0.0.1:43123',
      shellUrl:
        'http://127.0.0.1:43123/offline-shell.html',
      isListening() {
        return true;
      }
    },
    offlineView:
      view,
    offlineViewReady:
      true,
    rendererHealth: {
      healthy: true,
      fresh: true
    },
    rendererRecoveryRunning:
      false,
    now() {
      return Date.parse(
        '2026-09-28T19:00:00.000Z'
      );
    }
  };

  return {
    ...base,
    ...overrides
  };
}

test('diagnóstico de pré-requisitos aprova ambiente offline completo', () => {
  const report =
    collectOfflinePrerequisiteDiagnostics(
      readyFixture()
    );

  assert.equal(
    report.ready,
    true
  );
  assert.equal(
    report.status,
    'OFFLINE_PREREQUISITES_READY'
  );
  assert.deepEqual(
    report.failed,
    []
  );
  assert.equal(
    report.catalogVersion,
    1
  );
  assert.deepEqual(
    report.issues,
    []
  );
  assert.equal(
    report.primaryIssue,
    null
  );
  assert.equal(
    report.checks.database.ok,
    true
  );
  assert.equal(
    report.checks.company.ok,
    true
  );
  assert.equal(
    report.checks.safeStorage.ok,
    true
  );
  assert.equal(
    report.checks.credential.ok,
    true
  );
  assert.equal(
    report.checks.server.ok,
    true
  );
  assert.equal(
    report.checks.renderer.ok,
    true
  );
  assert.equal(
    report.checks.credential
      .activeCount,
    1
  );
  assert.equal(
    report.checks.credential
      .usableCount,
    1
  );
});

test('diagnóstico distingue safeStorage indisponível de credencial ausente', () => {
  const fixture =
    readyFixture({
      safeStorage: {
        isEncryptionAvailable() {
          return false;
        }
      }
    });

  const report =
    collectOfflinePrerequisiteDiagnostics(
      fixture
    );

  assert.equal(
    report.ready,
    false
  );
  assert.equal(
    report.checks.safeStorage.reason,
    'SAFE_STORAGE_UNAVAILABLE'
  );
  assert.equal(
    report.checks.credential.reason,
    'SAFE_STORAGE_UNAVAILABLE'
  );
  assert.equal(
    report.checks.credential
      .activeCount,
    1
  );
  assert.equal(
    report.checks.credential
      .usableCount,
    0
  );
  assert.equal(
    report.failed.includes(
      'safeStorage'
    ),
    true
  );
  assert.equal(
    report.failed.includes(
      'credential'
    ),
    true
  );
  assert.equal(
    report.checks.safeStorage
      .diagnostic.code,
    'OFFLINE-AUTH-001'
  );
  assert.equal(
    report.checks.credential
      .diagnostic.code,
    'OFFLINE-AUTH-001'
  );
  assert.equal(
    report.primaryIssue.code,
    'OFFLINE-AUTH-001'
  );
  assert.deepEqual(
    report.issues.map(
      (issue) => [
        issue.check,
        issue.code
      ]
    ),
    [
      [
        'safeStorage',
        'OFFLINE-AUTH-001'
      ],
      [
        'credential',
        'OFFLINE-AUTH-001'
      ]
    ]
  );
});

test('diagnóstico detecta servidor loopback que deixou de escutar', () => {
  const fixture =
    readyFixture();

  fixture.offlineUiServer = {
    ...fixture.offlineUiServer,
    isListening() {
      return false;
    }
  };

  const server =
    resolveLoopbackServerState(
      fixture.offlineUiServer
    );

  assert.equal(
    server.ok,
    false
  );
  assert.equal(
    server.reason,
    'SERVER_NOT_LISTENING'
  );

  const report =
    collectOfflinePrerequisiteDiagnostics(
      fixture
    );

  assert.equal(
    report.ready,
    false
  );
  assert.equal(
    report.checks.server.reason,
    'SERVER_NOT_LISTENING'
  );
  assert.equal(
    report.failed.includes(
      'server'
    ),
    true
  );
});

test('diagnóstico detecta renderer stale e recuperação em andamento', () => {
  const stale =
    collectOfflinePrerequisiteDiagnostics(
      readyFixture({
        rendererHealth: {
          healthy: true,
          fresh: false
        }
      })
    );

  assert.equal(
    stale.checks.renderer.ok,
    false
  );
  assert.equal(
    stale.checks.renderer.reason,
    'RENDERER_HEALTH_STALE'
  );

  const recovering =
    collectOfflinePrerequisiteDiagnostics(
      readyFixture({
        rendererRecoveryRunning:
          true
      })
    );

  assert.equal(
    recovering.checks.renderer.ok,
    false
  );
  assert.equal(
    recovering.checks.renderer.reason,
    'RENDERER_RECOVERY_IN_PROGRESS'
  );
});

test('diagnóstico executa probe real do banco e acusa falha', () => {
  const report =
    collectOfflinePrerequisiteDiagnostics(
      readyFixture({
        probeDatabase() {
          return false;
        }
      })
    );

  assert.equal(
    report.checks.database.ok,
    false
  );
  assert.equal(
    report.checks.database.reason,
    'DATABASE_PROBE_FAILED'
  );
  assert.equal(
    report.failed.includes(
      'database'
    ),
    true
  );
});
