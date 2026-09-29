'use strict';

const {
  OFFLINE_DIAGNOSTIC_CATALOG_VERSION,
  resolveOfflinePrerequisiteDiagnostic
} = require('./codes');

function safeBooleanCall(
  fn,
  fallback = false
) {
  try {
    return fn() === true;
  } catch (_) {
    return fallback;
  }
}

function resolveLoopbackServerState(
  server
) {
  if (
    !server ||
    typeof server !== 'object'
  ) {
    return Object.freeze({
      ok: false,
      reason:
        'SERVER_UNAVAILABLE',
      host: null,
      port: null,
      origin: null,
      listening: false
    });
  }

  const host =
    String(
      server.host || ''
    ).trim();

  const port =
    Number(
      server.port
    );

  const origin =
    String(
      server.origin || ''
    ).trim();

  const shellUrl =
    String(
      server.shellUrl || ''
    ).trim();

  const hostOk =
    host === '127.0.0.1' ||
    host === 'localhost';

  const portOk =
    Number.isInteger(port) &&
    port > 0 &&
    port <= 65535;

  let originOk = false;
  let shellUrlOk = false;

  try {
    const parsedOrigin =
      new URL(
        origin
      );

    originOk =
      parsedOrigin.protocol ===
        'http:' &&
      (
        parsedOrigin.hostname ===
          '127.0.0.1' ||
        parsedOrigin.hostname ===
          'localhost'
      ) &&
      Number(
        parsedOrigin.port
      ) === port;

    const parsedShell =
      new URL(
        shellUrl
      );

    shellUrlOk =
      parsedShell.origin ===
        parsedOrigin.origin &&
      parsedShell.pathname ===
        '/offline-shell.html';
  } catch (_) {}

  const listening =
    typeof server.isListening ===
      'function'
      ? safeBooleanCall(
          () =>
            server.isListening()
        )
      : true;

  const ok =
    hostOk &&
    portOk &&
    originOk &&
    shellUrlOk &&
    listening;

  return Object.freeze({
    ok,
    reason:
      ok
        ? 'SERVER_READY'
        : !listening
          ? 'SERVER_NOT_LISTENING'
          : 'SERVER_CONFIGURATION_INVALID',
    host:
      host || null,
    port:
      portOk
        ? port
        : null,
    origin:
      originOk
        ? origin
        : null,
    listening
  });
}

function collectOfflinePrerequisiteDiagnostics({
  getDatabase,
  probeDatabase,
  empresaIdValue,
  resolveEmpresaId,
  getPreparedCompany,
  listActiveCredentials,
  verifyCredential,
  safeStorage,
  offlineUiServer,
  offlineView,
  offlineViewReady = false,
  rendererHealth,
  rendererRecoveryRunning = false,
  now = () => Date.now()
} = {}) {
  const checks = {
    database: {
      ok: false,
      reason:
        'DATABASE_UNAVAILABLE'
    },
    company: {
      ok: false,
      reason:
        'EMPRESA_UNAVAILABLE',
      empresaId: null
    },
    safeStorage: {
      ok: false,
      reason:
        'SAFE_STORAGE_UNAVAILABLE'
    },
    credential: {
      ok: false,
      reason:
        'CREDENTIAL_NOT_USABLE',
      activeCount: 0,
      usableCount: 0,
      operadorId: null
    },
    server: resolveLoopbackServerState(
      offlineUiServer
    ),
    renderer: {
      ok: false,
      reason:
        'RENDERER_NOT_READY',
      readyFlag:
        offlineViewReady === true,
      healthFresh:
        Boolean(
          rendererHealth &&
          rendererHealth.fresh ===
            true
        ),
      healthHealthy:
        Boolean(
          rendererHealth &&
          rendererHealth.healthy ===
            true
        ),
      recoveryRunning:
        rendererRecoveryRunning ===
          true
    }
  };

  let db = null;

  try {
    db =
      typeof getDatabase ===
        'function'
        ? getDatabase()
        : null;

    if (db) {
      let probeOk = true;

      if (
        typeof probeDatabase ===
        'function'
      ) {
        probeOk =
          probeDatabase(
            db
          ) === true;
      }

      checks.database = {
        ok:
          probeOk === true,
        reason:
          probeOk === true
            ? 'DATABASE_READY'
            : 'DATABASE_PROBE_FAILED'
      };
    }
  } catch (_) {
    db = null;
    checks.database = {
      ok: false,
      reason:
        'DATABASE_UNAVAILABLE'
    };
  }

  let empresaId =
    String(
      empresaIdValue || ''
    ).trim();

  if (
    !empresaId &&
    db &&
    typeof resolveEmpresaId ===
      'function'
  ) {
    try {
      empresaId =
        String(
          resolveEmpresaId(
            db
          ) || ''
        ).trim();
    } catch (_) {}
  }

  let preparedCompany = null;

  if (
    empresaId &&
    db &&
    typeof getPreparedCompany ===
      'function'
  ) {
    try {
      preparedCompany =
        getPreparedCompany(
          empresaId
        );
    } catch (_) {
      preparedCompany = null;
    }
  }

  checks.company = {
    ok:
      Boolean(
        empresaId &&
        preparedCompany
      ),
    reason:
      !empresaId
        ? 'EMPRESA_UNAVAILABLE'
        : preparedCompany
          ? 'COMPANY_READY'
          : 'COMPANY_NOT_PREPARED',
    empresaId:
      empresaId || null
  };

  const safeStorageReady =
    Boolean(
      safeStorage &&
      typeof safeStorage
        .isEncryptionAvailable ===
          'function' &&
      safeBooleanCall(
        () =>
          safeStorage
            .isEncryptionAvailable()
      )
    );

  checks.safeStorage = {
    ok:
      safeStorageReady,
    reason:
      safeStorageReady
        ? 'SAFE_STORAGE_READY'
        : 'SAFE_STORAGE_UNAVAILABLE'
  };

  let credentials = [];

  if (
    empresaId &&
    typeof listActiveCredentials ===
      'function'
  ) {
    try {
      const listed =
        listActiveCredentials(
          empresaId
        );

      if (
        Array.isArray(
          listed
        )
      ) {
        credentials =
          listed.filter(
            (credential) =>
              credential &&
              credential.ativo === true
          );
      }
    } catch (_) {
      credentials = [];
    }
  }

  let usableCount = 0;
  let operadorId = null;

  if (
    safeStorageReady &&
    typeof verifyCredential ===
      'function'
  ) {
    for (const credential of credentials) {
      try {
        const verified =
          verifyCredential(
            credential
          );

        if (
          verified === true
        ) {
          usableCount += 1;

          if (!operadorId) {
            operadorId =
              String(
                credential.operadorId ||
                ''
              ).trim() ||
              null;
          }
        }
      } catch (_) {}
    }
  }

  checks.credential = {
    ok:
      usableCount > 0,
    reason:
      !safeStorageReady
        ? 'SAFE_STORAGE_UNAVAILABLE'
        : credentials.length < 1
          ? 'CREDENTIAL_NOT_PROVISIONED'
          : usableCount > 0
            ? 'CREDENTIAL_READY'
            : 'CREDENTIAL_NOT_USABLE',
    activeCount:
      credentials.length,
    usableCount,
    operadorId
  };

  const rendererViewAvailable =
    Boolean(
      offlineView &&
      offlineView.webContents &&
      typeof offlineView.webContents
        .isDestroyed ===
          'function' &&
      !offlineView.webContents
        .isDestroyed()
    );

  const rendererFresh =
    Boolean(
      rendererHealth &&
      rendererHealth.fresh === true
    );

  const rendererHealthy =
    Boolean(
      rendererHealth &&
      rendererHealth.healthy === true
    );

  const rendererOk =
    Boolean(
      rendererViewAvailable &&
      offlineViewReady === true &&
      rendererHealthy &&
      rendererFresh &&
      rendererRecoveryRunning !== true
    );

  checks.renderer = {
    ok:
      rendererOk,
    reason:
      rendererOk
        ? 'RENDERER_READY'
        : rendererRecoveryRunning
          ? 'RENDERER_RECOVERY_IN_PROGRESS'
          : !rendererViewAvailable
            ? 'RENDERER_UNAVAILABLE'
            : offlineViewReady !== true
              ? 'RENDERER_NOT_READY'
              : !rendererHealthy
                ? 'RENDERER_HEALTH_UNHEALTHY'
                : 'RENDERER_HEALTH_STALE',
    readyFlag:
      offlineViewReady === true,
    healthFresh:
      rendererFresh,
    healthHealthy:
      rendererHealthy,
    recoveryRunning:
      rendererRecoveryRunning ===
        true
  };

  const requiredChecks = [
    'database',
    'company',
    'safeStorage',
    'credential',
    'server',
    'renderer'
  ];

  const failed =
    requiredChecks.filter(
      (name) =>
        !checks[name] ||
        checks[name].ok !== true
    );

  const ready =
    failed.length === 0;

  const issues =
    failed.map(
      (name) => {
        const check =
          checks[name] || {};

        const diagnostic =
          resolveOfflinePrerequisiteDiagnostic(
            check.reason,
            {
              fallback: true
            }
          );

        return Object.freeze({
          check: name,
          ...diagnostic
        });
      }
    );

  function freezeCheck(
    check
  ) {
    const diagnostic =
      resolveOfflinePrerequisiteDiagnostic(
        check &&
        check.reason,
        {
          fallback:
            Boolean(
              check &&
              check.ok !== true
            )
        }
      );

    return Object.freeze({
      ...check,
      diagnostic
    });
  }

  return Object.freeze({
    catalogVersion:
      OFFLINE_DIAGNOSTIC_CATALOG_VERSION,
    status:
      ready
        ? 'OFFLINE_PREREQUISITES_READY'
        : 'OFFLINE_PREREQUISITES_NOT_READY',
    ready,
    checkedAt:
      new Date(
        now()
      ).toISOString(),
    empresaId:
      checks.company.empresaId,
    operadorId:
      checks.credential.operadorId,
    failed:
      Object.freeze([
        ...failed
      ]),
    issues:
      Object.freeze([
        ...issues
      ]),
    primaryIssue:
      issues[0] ||
      null,
    checks:
      Object.freeze({
        database:
          freezeCheck(
            checks.database
          ),
        company:
          freezeCheck(
            checks.company
          ),
        safeStorage:
          freezeCheck(
            checks.safeStorage
          ),
        credential:
          freezeCheck(
            checks.credential
          ),
        server:
          freezeCheck(
            checks.server
          ),
        renderer:
          freezeCheck(
            checks.renderer
          )
      })
  });
}

module.exports = {
  resolveLoopbackServerState,
  collectOfflinePrerequisiteDiagnostics
};
