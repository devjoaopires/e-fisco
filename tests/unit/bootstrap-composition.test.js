'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createAppLifecycle
} = require('../../desktop/bootstrap/app-lifecycle');

const {
  resolveRuntimePaths,
  createRuntimeBootstrap
} = require('../../desktop/bootstrap/runtime-bootstrap');

function createAppHarness({
  gotLock = true,
  blockForUpdate = false,
  windows = []
} = {}) {
  const handlers =
    new Map();

  const calls = {
    quit: 0,
    installIpc: 0,
    bootstrap: 0,
    createWindow: 0,
    unregisterShortcuts: 0,
    stopStandby: 0,
    stopRuntime: 0,
    stopContinuity: 0,
    closeDb: 0,
    clearServer: 0,
    restore: 0,
    show: 0,
    focus: 0,
    serverClose: 0
  };

  let mainWindow = {
    isMinimized() {
      return true;
    },
    restore() {
      calls.restore += 1;
    },
    show() {
      calls.show += 1;
    },
    focus() {
      calls.focus += 1;
    }
  };

  let offlineUiServer = {
    async close() {
      calls.serverClose += 1;
    }
  };

  const app = {
    requestSingleInstanceLock() {
      return gotLock;
    },
    quit() {
      calls.quit += 1;
    },
    whenReady() {
      return Promise.resolve();
    },
    on(
      name,
      handler
    ) {
      handlers.set(
        name,
        handler
      );
    }
  };

  const lifecycle =
    createAppLifecycle({
      app,
      getAllWindows() {
        return windows;
      },
      installIpc() {
        calls.installIpc += 1;
      },
      shouldBlockStartForUpdate() {
        return blockForUpdate;
      },
      async bootstrapRuntime() {
        calls.bootstrap += 1;
      },
      async createWindow() {
        calls.createWindow += 1;
      },
      getMainWindow() {
        return mainWindow;
      },
      unregisterOfflineFunctionShortcuts() {
        calls.unregisterShortcuts += 1;
      },
      stopStandbyMonitor() {
        calls.stopStandby += 1;
      },
      stopOfflineRuntimeMonitor() {
        calls.stopRuntime += 1;
      },
      stopContinuityMirror() {
        calls.stopContinuity += 1;
      },
      getOfflineUiServer() {
        return offlineUiServer;
      },
      clearOfflineUiServer() {
        calls.clearServer += 1;
        offlineUiServer = null;
      },
      closeOfflineDatabase() {
        calls.closeDb += 1;
      }
    });

  return {
    lifecycle,
    handlers,
    calls,
    setMainWindow(
      value
    ) {
      mainWindow = value;
    }
  };
}

test('app lifecycle sai imediatamente quando single-instance lock falha', async () => {
  const h =
    createAppHarness({
      gotLock: false
    });

  assert.equal(
    h.lifecycle.start(),
    false
  );

  await Promise.resolve();

  assert.equal(
    h.calls.quit,
    1
  );

  assert.equal(
    h.calls.installIpc,
    0
  );

  assert.equal(
    h.handlers.size,
    0
  );
});

test('app lifecycle registra IPC uma vez e faz bootstrap antes de criar janela', async () => {
  const order = [];
  const handlers =
    new Map();

  const app = {
    requestSingleInstanceLock() {
      return true;
    },
    quit() {},
    whenReady() {
      return Promise.resolve();
    },
    on(
      name,
      handler
    ) {
      handlers.set(
        name,
        handler
      );
    }
  };

  const lifecycle =
    createAppLifecycle({
      app,
      getAllWindows() {
        return [];
      },
      installIpc() {
        order.push(
          'ipc'
        );
      },
      shouldBlockStartForUpdate() {
        order.push(
          'update-gate'
        );
        return false;
      },
      async bootstrapRuntime() {
        order.push(
          'bootstrap'
        );
      },
      async createWindow() {
        order.push(
          'window'
        );
      },
      getMainWindow() {
        return null;
      },
      unregisterOfflineFunctionShortcuts() {},
      stopStandbyMonitor() {},
      stopOfflineRuntimeMonitor() {},
      stopContinuityMirror() {},
      getOfflineUiServer() {
        return null;
      },
      clearOfflineUiServer() {},
      closeOfflineDatabase() {}
    });

  assert.equal(
    lifecycle.start(),
    true
  );

  assert.equal(
    lifecycle.start(),
    false
  );

  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(
    order,
    [
      'ipc',
      'update-gate',
      'bootstrap',
      'window'
    ]
  );

  assert.equal(
    handlers.size,
    4
  );
});

test('app lifecycle bloqueia startup por update antes de bootstrap/janela', async () => {
  const h =
    createAppHarness({
      blockForUpdate: true
    });

  assert.equal(
    h.lifecycle.start(),
    true
  );

  await Promise.resolve();
  await Promise.resolve();

  assert.equal(
    h.calls.quit,
    1
  );

  assert.equal(
    h.calls.bootstrap,
    0
  );

  assert.equal(
    h.calls.createWindow,
    0
  );
});

test('second-instance restaura e foca a janela existente', () => {
  const h =
    createAppHarness();

  h.lifecycle.start();

  h.handlers
    .get('second-instance')();

  assert.deepEqual(
    {
      restore:
        h.calls.restore,
      show:
        h.calls.show,
      focus:
        h.calls.focus
    },
    {
      restore: 1,
      show: 1,
      focus: 1
    }
  );
});

test('before-quit para owners, fecha server e banco sem duplicar executores', async () => {
  const h =
    createAppHarness();

  h.lifecycle.start();

  h.handlers
    .get('before-quit')();

  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(
    {
      unregister:
        h.calls.unregisterShortcuts,
      standby:
        h.calls.stopStandby,
      runtime:
        h.calls.stopRuntime,
      continuity:
        h.calls.stopContinuity,
      serverClose:
        h.calls.serverClose,
      clearServer:
        h.calls.clearServer,
      closeDb:
        h.calls.closeDb
    },
    {
      unregister: 1,
      standby: 1,
      runtime: 1,
      continuity: 1,
      serverClose: 1,
      clearServer: 1,
      closeDb: 1
    }
  );
});

test('window-all-closed encerra o app pelo owner único de lifecycle', () => {
  const h =
    createAppHarness();

  h.lifecycle.start();

  h.handlers
    .get('window-all-closed')();

  assert.equal(
    h.calls.quit,
    1
  );
});

test('falha isolada do bootstrap offline não impede a criação da janela', async () => {
  const handlers =
    new Map();
  const order = [];

  const lifecycle =
    createAppLifecycle({
      app: {
        requestSingleInstanceLock() {
          return true;
        },
        quit() {},
        whenReady() {
          return Promise.resolve();
        },
        on(name, handler) {
          handlers.set(name, handler);
        }
      },
      getAllWindows() { return []; },
      installIpc() { order.push('ipc'); },
      shouldBlockStartForUpdate() { return false; },
      async bootstrapRuntime() {
        order.push('bootstrap-failed-isolated');
        return { ok: false };
      },
      async createWindow() { order.push('window'); },
      getMainWindow() { return null; },
      unregisterOfflineFunctionShortcuts() {},
      stopStandbyMonitor() {},
      stopOfflineRuntimeMonitor() {},
      stopContinuityMirror() {},
      getOfflineUiServer() { return null; },
      clearOfflineUiServer() {},
      closeOfflineDatabase() {}
    });

  lifecycle.start();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(
    order,
    ['ipc', 'bootstrap-failed-isolated', 'window']
  );
});

test('activate recria janela somente quando Electron não possui janelas', async () => {
  const empty =
    createAppHarness({
      windows: []
    });

  empty.lifecycle.start();

  empty.handlers
    .get('activate')();

  await Promise.resolve();

  assert.equal(
    empty.calls.createWindow,
    1
  );

  const existing =
    createAppHarness({
      windows: [{}]
    });

  existing.lifecycle.start();

  existing.handlers
    .get('activate')();

  await Promise.resolve();

  assert.equal(
    existing.calls.createWindow,
    0
  );
});

test('runtime paths preservam raiz do app e usam app.asar.unpacked apenas para helpers no pacote', () => {
  const dev =
    resolveRuntimePaths({
      appRoot:
        'C:\\app',
      isPackaged:
        false,
      resourcesPath:
        'C:\\resources'
    });

  assert.equal(
    dev.preloadPath,
    path.join(
      'C:\\app',
      'preload.js'
    )
  );

  assert.equal(
    dev.iconPath,
    path.join(
      'C:\\app',
      'icone_app.ico'
    )
  );

  assert.equal(
    dev.adjustmentCssPath,
    path.join(
      'C:\\app',
      'ajuste.css'
    )
  );

  assert.equal(
    dev.printDriverPath,
    path.join(
      'C:\\app',
      'print-driver-nfce.ps1'
    )
  );

  assert.equal(
    dev.updaterHelperPath,
    path.join(
      'C:\\app',
      'EFISCO-UPDATER.exe'
    )
  );

  const packaged =
    resolveRuntimePaths({
      appRoot:
        'C:\\resources\\app.asar',
      isPackaged:
        true,
      resourcesPath:
        'C:\\resources'
    });

  assert.equal(
    packaged.preloadPath,
    path.join(
      'C:\\resources\\app.asar',
      'preload.js'
    )
  );

  assert.equal(
    packaged.iconPath,
    path.join(
      'C:\\resources\\app.asar',
      'icone_app.ico'
    )
  );

  assert.equal(
    packaged.adjustmentCssPath,
    path.join(
      'C:\\resources\\app.asar',
      'ajuste.css'
    )
  );

  assert.equal(
    packaged.printDriverPath,
    path.join(
      'C:\\resources',
      'app.asar.unpacked',
      'print-driver-nfce.ps1'
    )
  );

  assert.equal(
    packaged.updaterHelperPath,
    path.join(
      'C:\\resources',
      'app.asar.unpacked',
      'EFISCO-UPDATER.exe'
    )
  );
});

test('composition root mantém um único lifecycle e um único runtime bootstrap', () => {
  const root =
    path.resolve(
      __dirname,
      '..',
      '..'
    );
  const source =
    fs.readFileSync(
      path.join(root, 'main.js'),
      'utf8'
    );

  assert.equal(
    (source.match(/createRuntimeBootstrap\(\{/g) || []).length,
    1
  );
  assert.equal(
    (source.match(/createAppLifecycle\(\{/g) || []).length,
    1
  );
  assert.equal(
    (source.match(/appLifecycle\.start\(\);/g) || []).length,
    1
  );
});

test('módulos extraídos recebem paths da raiz sem reconstruir recursos por __dirname', () => {
  const root =
    path.resolve(
      __dirname,
      '..',
      '..'
    );

  for (const relative of [
    'desktop/bootstrap/app-lifecycle.js',
    'desktop/bootstrap/runtime-bootstrap.js',
    'desktop/windows/main-window.js',
    'desktop/windows/offline-view.js',
    'updater/update-controller.js',
    'updater/standby-controller.js',
    'printing/windows-driver.js',
    'printing/frame-print-bridge.js'
  ]) {
    const source =
      fs.readFileSync(
        path.join(root, relative),
        'utf8'
      );

    assert.equal(
      source.includes('__dirname'),
      false,
      relative + ' deve receber paths resolvidos pelo composition root'
    );
  }
});

function createRuntimeHarness({
  databaseError = null,
  companyToken = false,
  legacyToken = false,
  pingError = null,
  repairPayload = null
} = {}) {
  const calls = {
    logs: [],
    states: [],
    identities: [],
    cashMirror: [],
    recoverOutbox: 0,
    pairing: 0,
    repairMarkerRemoved: 0,
    storedCompanyToken: 0,
    storedLegacyToken: 0,
    fiscalProvision: 0,
    multiCompanyProvision: 0
  };

  let identity = null;

  const runtime =
    createRuntimeBootstrap({
      getUserDataDir() {
        return 'C:\\user-data';
      },
      fs: {
        existsSync() {
          return repairPayload !== null;
        },
        readFileSync() {
          return JSON.stringify(
            repairPayload
          );
        },
        unlinkSync() {
          calls.repairMarkerRemoved += 1;
        }
      },
      safeStorage: {
        isEncryptionAvailable() {
          return true;
        }
      },
      initializeOfflineDatabase() {
        if (databaseError) {
          throw databaseError;
        }

        return {
          databasePath:
            'db.sqlite'
        };
      },
      getOfflineDatabase() {
        return {
          kind: 'db'
        };
      },
      getOrCreateSyncDeviceId() {
        return 'DEV-1';
      },
      hasStoredSyncDeviceTokenForCompany() {
        return companyToken;
      },
      hasStoredSyncDeviceToken() {
        return legacyToken;
      },
      getSyncEmpresaId() {
        return 'EMP-1';
      },
      storeSyncEmpresaId({
        empresaId
      }) {
        return empresaId;
      },
      storeSyncDeviceTokenForCompany() {
        calls.storedCompanyToken += 1;
      },
      storeSyncDeviceToken() {
        calls.storedLegacyToken += 1;
      },
      loadSyncDeviceTokenForCompany() {
        return 'TOKEN-COMPANY';
      },
      loadSyncDeviceToken() {
        return 'TOKEN-LEGACY';
      },
      async requestDevicePairing() {
        calls.pairing += 1;
        return {
          empresaId:
            'EMP-1',
          deviceToken:
            'TOKEN-REPAIRED',
          expiresAt:
            '2026-10-01T00:00:00.000Z'
        };
      },
      async pingSyncDevice() {
        if (pingError) {
          throw pingError;
        }

        return {
          empresaId:
            'EMP-1'
        };
      },
      registerPreparedOfflineCompanyFromLocalState() {
        return null;
      },
      async pullSyncCashSummary() {
        return {
          aberto: true
        };
      },
      async pullSyncCashState() {
        return {
          aberto: true
        };
      },
      mirrorRemoteCashState(
        value
      ) {
        calls.cashMirror.push(
          value
        );
      },
      isOfflineAuthFailure(
        error
      ) {
        return Boolean(
          error &&
          error.authFailure
        );
      },
      markOfflineAuthInvalid() {
        calls.states.push(
          'INVALID'
        );
      },
      recoverInterruptedOutbox() {
        calls.recoverOutbox += 1;
      },
      async provisionFiscalA1FromServer() {
        calls.fiscalProvision += 1;
        return {
          available: false,
          stored: false
        };
      },
      async provisionOfflineMultiCompany() {
        calls.multiCompanyProvision += 1;
        return {
          ok: true
        };
      },
      async syncRootReferenceFallback() {
        return {
          ok: true
        };
      },
      setAuthorizationState(
        value
      ) {
        calls.states.push(
          value
        );
      },
      setOfflineSyncIdentity(
        value
      ) {
        identity = value;

        calls.identities.push(
          value
        );
      },
      getOfflineSyncIdentity() {
        return identity;
      },
      log(
        ...args
      ) {
        calls.logs.push(
          args
        );
      },
      now() {
        return Date.parse(
          '2026-09-26T22:00:00.000Z'
        );
      }
    });

  return {
    runtime,
    calls,
    getIdentity() {
      return identity;
    }
  };
}

test('runtime bootstrap isola falha SQLite e não lança para o lifecycle', async () => {
  const failure =
    new Error(
      'sqlite unavailable'
    );

  const h =
    createRuntimeHarness({
      databaseError:
        failure
    });

  const result =
    await h.runtime.bootstrap();

  assert.equal(
    result.ok,
    false
  );

  assert.equal(
    result.error,
    failure
  );

  assert.equal(
    h.calls.logs.some(
      item =>
        item[0] ===
          'ERRO ISOLADO AO INICIALIZAR SQLITE OFFLINE'
    ),
    true
  );
});

test('runtime bootstrap sem token mantém autorização UNAVAILABLE e identidade local', async () => {
  const h =
    createRuntimeHarness();

  const result =
    await h.runtime.bootstrap();

  assert.equal(
    result.ok,
    true
  );

  assert.equal(
    result.tokenConfigured,
    false
  );

  assert.deepEqual(
    h.calls.states,
    ['UNAVAILABLE']
  );

  assert.deepEqual(
    h.getIdentity(),
    {
      deviceId:
        'DEV-1',
      deviceToken:
        null,
      empresaId:
        'EMP-1'
    }
  );
});

test('runtime bootstrap autentica token por empresa, espelha caixa e recupera outbox', async () => {
  const h =
    createRuntimeHarness({
      companyToken: true
    });

  const result =
    await h.runtime.bootstrap();

  await Promise.resolve();
  await Promise.resolve();

  assert.equal(
    result.ok,
    true
  );

  assert.equal(
    result.tokenConfigured,
    true
  );

  assert.deepEqual(
    h.calls.states,
    [
      'TRUSTED_LOCAL',
      'VALID'
    ]
  );

  assert.equal(
    h.getIdentity()
      .deviceToken,
    'TOKEN-COMPANY'
  );

  assert.equal(
    h.calls.cashMirror.length,
    1
  );

  assert.equal(
    h.calls.recoverOutbox,
    1
  );
  assert.equal(
    h.calls.fiscalProvision,
    1
  );
  assert.equal(
    h.calls.multiCompanyProvision,
    1
  );
});

test('runtime bootstrap conserva TRUSTED_LOCAL quando ping falha sem erro de auth', async () => {
  const h =
    createRuntimeHarness({
      legacyToken: true,
      pingError:
        new Error(
          'network unavailable'
        )
    });

  const result =
    await h.runtime.bootstrap();

  assert.equal(
    result.ok,
    true
  );

  assert.deepEqual(
    h.calls.states,
    [
      'TRUSTED_LOCAL',
      'TRUSTED_LOCAL'
    ]
  );

  assert.equal(
    h.getIdentity()
      .deviceToken,
    'TOKEN-LEGACY'
  );
});

test('runtime bootstrap marca INVALID quando o ping falha por autenticação', async () => {
  const authError =
    new Error(
      'device auth rejected'
    );
  authError.authFailure = true;

  const h =
    createRuntimeHarness({
      companyToken: true,
      pingError:
        authError
    });

  const result =
    await h.runtime.bootstrap();

  assert.equal(
    result.ok,
    true
  );
  assert.deepEqual(
    h.calls.states,
    [
      'TRUSTED_LOCAL',
      'INVALID'
    ]
  );
});

test('runtime bootstrap consome marcador de reparo uma única vez', async () => {
  const h =
    createRuntimeHarness({
      companyToken: true,
      repairPayload: {
        pairingCode:
          'PAIRING-CODE-1234567890'
      }
    });

  const result =
    await h.runtime.bootstrap();

  await Promise.resolve();
  await Promise.resolve();

  assert.equal(
    result.ok,
    true
  );
  assert.equal(
    h.calls.pairing,
    1
  );
  assert.equal(
    h.calls.repairMarkerRemoved,
    1
  );
  assert.equal(
    h.calls.storedLegacyToken,
    1
  );
  assert.ok(
    h.calls.storedCompanyToken >= 1
  );
});
