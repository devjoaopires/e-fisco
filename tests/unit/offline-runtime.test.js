'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createOfflineUiRuntime
} = require('../../offline/runtime/ui-runtime');

const {
  createOfflineShortcutController
} = require('../../offline/runtime/shortcuts');

const {
  createOfflineRuntimeController
} = require('../../offline/runtime/runtime-controller');

test('ui runtime anexa view uma única vez, redimensiona e foca no show', () => {
  const calls = {
    attach: 0,
    resize: 0,
    focus: 0
  };

  let attached = false;

  const offlineView = {
    webContents: {
      focus() {
        calls.focus += 1;
      }
    }
  };

  const runtime =
    createOfflineUiRuntime({
      getMainWindow() {
        return {
          isDestroyed() {
            return false;
          }
        };
      },
      getOfflineView() {
        return offlineView;
      },
      isOfflineViewReady() {
        return true;
      },
      isOfflineViewAttached() {
        return attached;
      },
      setOfflineViewAttached(
        value
      ) {
        attached = value;
      },
      attachOfflineView() {
        calls.attach += 1;
      },
      resizeOfflineOverlay() {
        calls.resize += 1;
      },
      offlineParkedBounds() {
        return {};
      }
    });

  assert.equal(
    runtime.showOverlay(),
    true
  );

  assert.equal(
    runtime.showOverlay(),
    true
  );

  assert.equal(
    calls.attach,
    1
  );

  assert.equal(
    calls.resize,
    2
  );

  assert.equal(
    calls.focus,
    2
  );
});

test('ui runtime estaciona view e devolve foco ao online no hide', () => {
  const bounds = [];
  let mainFocus = 0;

  const runtime =
    createOfflineUiRuntime({
      getMainWindow() {
        return {
          isDestroyed() {
            return false;
          },
          webContents: {
            focus() {
              mainFocus += 1;
            }
          }
        };
      },
      getOfflineView() {
        return {
          setBounds(
            value
          ) {
            bounds.push(
              value
            );
          }
        };
      },
      isOfflineViewReady() {
        return true;
      },
      isOfflineViewAttached() {
        return true;
      },
      setOfflineViewAttached() {},
      attachOfflineView() {},
      resizeOfflineOverlay() {},
      offlineParkedBounds() {
        return {
          x: -32000,
          y: -32000,
          width: 1200,
          height: 800
        };
      }
    });

  assert.equal(
    runtime.hideOverlay(),
    true
  );

  assert.deepEqual(
    bounds,
    [
      {
        x: -32000,
        y: -32000,
        width: 1200,
        height: 800
      }
    ]
  );

  assert.equal(
    mainFocus,
    1
  );
});

test('ui runtime pré-reveal força layout sem depender de requestAnimationFrame', async () => {
  const scripts = [];
  const delays = [];

  const runtime =
    createOfflineUiRuntime({
      getMainWindow() {
        return null;
      },
      getOfflineView() {
        return {
          webContents: {
            isDestroyed() {
              return false;
            },
            async executeJavaScript(
              script,
              userGesture
            ) {
              scripts.push({
                script,
                userGesture
              });

              return true;
            }
          }
        };
      },
      isOfflineViewReady() {
        return true;
      },
      isOfflineViewAttached() {
        return true;
      },
      setOfflineViewAttached() {},
      attachOfflineView() {},
      resizeOfflineOverlay() {},
      offlineParkedBounds() {
        return {};
      },
      async delay(ms) {
        delays.push(ms);
      }
    });

  assert.equal(
    await runtime
      .settleBeforeReveal(),
    true
  );

  assert.deepEqual(
    delays,
    [20]
  );

  assert.match(
    scripts[0].script,
    /document\.body\.offsetHeight/
  );

  assert.equal(
    scripts[0].userGesture,
    true
  );
});

function shortcutHarness() {
  const handlers =
    new Map();

  const registered =
    new Set();

  const scripts = [];

  const state = {
    mode: 'OFFLINE',
    focused: true,
    operator: {
      operadorId: 'OP-1'
    }
  };

  const controller =
    createOfflineShortcutController({
      globalShortcut: {
        register(
          key,
          callback
        ) {
          registered.add(
            key
          );

          handlers.set(
            key,
            callback
          );

          return true;
        },
        isRegistered(
          key
        ) {
          return registered.has(
            key
          );
        },
        unregister(
          key
        ) {
          registered.delete(
            key
          );

          handlers.delete(
            key
          );
        }
      },
      getUiMode() {
        return state.mode;
      },
      getMainWindow() {
        return {
          isDestroyed() {
            return false;
          },
          isFocused() {
            return state.focused;
          }
        };
      },
      getOfflineView() {
        return {
          webContents: {
            isDestroyed() {
              return false;
            },
            focus() {},
            async executeJavaScript(
              script
            ) {
              scripts.push(
                script
              );

              return true;
            }
          }
        };
      },
      getAuthenticatedOperator() {
        return state.operator;
      }
    });

  return {
    controller,
    handlers,
    registered,
    scripts,
    state
  };
}

test('shortcuts runtime registra somente F4/F5 e mantém owner único', () => {
  const h =
    shortcutHarness();

  assert.equal(
    h.controller.sync(),
    true
  );

  assert.deepEqual(
    Array.from(
      h.registered
    ).sort(),
    ['F4', 'F5']
  );

  assert.equal(
    h.controller.sync(),
    true
  );

  assert.equal(
    h.registered.size,
    2
  );

  h.controller
    .unregister();

  assert.equal(
    h.registered.size,
    0
  );

  assert.equal(
    h.controller
      .isRegistered(),
    false
  );
});

test('shortcut F4 é encaminhado ao iframe apenas em modo offline focado', async () => {
  const h =
    shortcutHarness();

  h.controller.sync();

  h.handlers
    .get('F4')();

  await Promise.resolve();
  await Promise.resolve();

  assert.equal(
    h.scripts.length,
    1
  );

  assert.match(
    h.scripts[0],
    /key: 'F4'/
  );

  h.state.mode =
    'ONLINE';

  assert.equal(
    h.controller
      .dispatch('F5'),
    false
  );

  assert.equal(
    h.scripts.length,
    1
  );
});

function runtimeMonitorHarness(
  options = {}
) {
  const intervals = [];
  const timeouts = [];
  const cleared = [];
  const calls = {
    healthChecks: 0,
    telemetryFlushes: 0,
    authInvalid: 0
  };

  let uiMode =
    options.uiMode ||
    'ONLINE';

  const failoverController = {
    resetFailures() {},
    recordMonitorFailure() {
      return {
        failureCount: 1,
        shouldFailover: false
      };
    }
  };

  const runtime =
    createOfflineRuntimeController({
      runtimeIntervalMs: 5000,
      recoveryThreshold: 3,
      getMainWindow() {
        return {
          isDestroyed() {
            return false;
          }
        };
      },
      getUiMode() {
        return uiMode;
      },
      setUiMode(
        value
      ) {
        uiMode = value;
      },
      getPendingUpdateVersion() {
        return false;
      },
      async probeWixReachable() {
        return true;
      },
      async probeSyncReachable() {
        return (
          options.syncProbe ||
          {
            reachable: true,
            authenticated: false
          }
        );
      },
      async checkOfflineRendererHealth() {
        calls.healthChecks += 1;
      },
      getSyncIdentity() {
        return null;
      },
      async flushOfflineTelemetryPending() {
        calls.telemetryFlushes += 1;

        if (
          options.telemetryAuthError
        ) {
          const error =
            new Error(
              'auth'
            );

          error.code =
            'SYNC_DEVICE_AUTH_FAILED';

          throw error;
        }

        return {
          status:
            'NO_PENDING'
        };
      },
      failoverController,
      async switchToOfflineUi() {},
      async refreshRemoteCashState() {},
      async syncOutboxPending() {
        return {};
      },
      activeOutboxCount() {
        return 0;
      },
      async syncOfflineProductCacheCoalesced() {},
      async syncOfflineF5ReferenceCacheCoalesced() {},
      async maintainOfflineFiscalLeaseInventory() {},
      logFiscalLeaseMaintenance() {},
      async maintainOfflineFiscalTransmission() {},
      logFiscalTransmissionSummary() {},
      isOfflineAuthFailure(
        error
      ) {
        return Boolean(
          error &&
          error.code ===
            'SYNC_DEVICE_AUTH_FAILED'
        );
      },
      markOfflineAuthInvalid() {
        calls.authInvalid += 1;
      },
      resolveOfflineOperationSyncIdentity() {
        return null;
      },
      async offlineHasActiveContinuitySale() {
        return false;
      },
      unregisterOfflineFunctionShortcuts() {},
      syncOfflineFunctionShortcuts() {},
      getOfflineContinuityDraft() {
        return null;
      },
      async clearOnlineContinuityDraft() {
        return true;
      },
      getFiscalProfileCache() {
        return {
          ambiente: 'HOMOLOGACAO'
        };
      },
      async captureOnlineOperatorIdentity() {
        return null;
      },
      getOfflineAuthenticatedOperator() {
        return null;
      },
      getFailoverOnlineOperatorIdentity() {
        return null;
      },
      async reloadOnlinePage() {},
      buildFiscalCounterSyncPayload() {
        return null;
      },
      async primeOnlineNfceNumberDisplay() {},
      async queryOnlineNfceNumberForRecovery() {
        return {
          ok: false
        };
      },
      async normalizeOnlinePdvUnitValueHeader() {},
      clearOfflineContinuityDraftState() {},
      async refreshOnlineNfceNumberDisplay() {},
      hideOfflineOverlay() {
        return true;
      },
      showOfflineOverlay() {
        return true;
      },
      clearOfflineAuthenticatedOperator() {},
      clearFailoverOnlineOperatorIdentity() {},
      async setOfflineShellAuthenticationState() {},
      log() {},
      setIntervalFn(
        callback,
        ms
      ) {
        const timer = {
          callback,
          ms,
          unrefCalls: 0,
          unref() {
            this.unrefCalls += 1;
          }
        };

        intervals.push(
          timer
        );

        return timer;
      },
      clearIntervalFn(
        timer
      ) {
        cleared.push(
          timer
        );
      },
      setTimeoutFn(
        callback,
        ms
      ) {
        timeouts.push({
          callback,
          ms
        });

        return 1;
      }
    });

  return {
    runtime,
    intervals,
    timeouts,
    cleared,
    calls
  };
}

test('runtime monitor tem timer único, unref, tick inicial e stop idempotente', () => {
  const h =
    runtimeMonitorHarness();

  h.runtime.start();
  h.runtime.start();

  assert.equal(
    h.intervals.length,
    1
  );

  assert.equal(
    h.intervals[0].ms,
    5000
  );

  assert.equal(
    h.intervals[0]
      .unrefCalls,
    1
  );

  assert.equal(
    h.timeouts.length,
    1
  );

  assert.equal(
    h.timeouts[0].ms,
    1000
  );

  h.runtime.stop();
  h.runtime.stop();

  assert.deepEqual(
    h.cleared,
    [h.intervals[0]]
  );
});

test('runtime tick executa health-check contínuo do renderer', async () => {
  const h =
    runtimeMonitorHarness();

  await h.runtime.tick();

  assert.equal(
    h.calls.healthChecks,
    1
  );
});

test('runtime tick ignora execução concorrente enquanto probe anterior está em voo', async () => {
  let releaseProbe;

  let probeCalls = 0;

  const gate =
    new Promise(
      (resolve) => {
        releaseProbe =
          resolve;
      }
    );

  const h =
    runtimeMonitorHarness();

  const base =
    h.runtime;

  const original =
    base.tick;

  const runtime =
    createOfflineRuntimeController({
      runtimeIntervalMs: 5000,
      recoveryThreshold: 3,
      getMainWindow() {
        return {
          isDestroyed() {
            return false;
          }
        };
      },
      getUiMode() {
        return 'ONLINE';
      },
      setUiMode() {},
      getPendingUpdateVersion() {
        return false;
      },
      async probeWixReachable() {
        probeCalls += 1;
        await gate;
        return true;
      },
      async probeSyncReachable() {
        return {
          reachable: true,
          authenticated: false
        };
      },
      getSyncIdentity() {
        return null;
      },
      failoverController: {
        resetFailures() {},
        recordMonitorFailure() {
          return {
            shouldFailover: false
          };
        }
      },
      async switchToOfflineUi() {},
      async refreshRemoteCashState() {},
      async syncOutboxPending() {
        return {};
      },
      activeOutboxCount() {
        return 0;
      },
      async syncOfflineProductCacheCoalesced() {},
      async syncOfflineF5ReferenceCacheCoalesced() {},
      async maintainOfflineFiscalLeaseInventory() {},
      logFiscalLeaseMaintenance() {},
      async maintainOfflineFiscalTransmission() {},
      logFiscalTransmissionSummary() {},
      isOfflineAuthFailure() {
        return false;
      },
      markOfflineAuthInvalid() {},
      resolveOfflineOperationSyncIdentity() {
        return null;
      },
      async offlineHasActiveContinuitySale() {
        return false;
      },
      unregisterOfflineFunctionShortcuts() {},
      syncOfflineFunctionShortcuts() {},
      getOfflineContinuityDraft() {
        return null;
      },
      async clearOnlineContinuityDraft() {
        return true;
      },
      getFiscalProfileCache() {
        return {
          ambiente: 'HOMOLOGACAO'
        };
      },
      async captureOnlineOperatorIdentity() {
        return null;
      },
      getOfflineAuthenticatedOperator() {
        return null;
      },
      getFailoverOnlineOperatorIdentity() {
        return null;
      },
      async reloadOnlinePage() {},
      buildFiscalCounterSyncPayload() {
        return null;
      },
      async primeOnlineNfceNumberDisplay() {},
      async queryOnlineNfceNumberForRecovery() {
        return {
          ok: false
        };
      },
      async normalizeOnlinePdvUnitValueHeader() {},
      clearOfflineContinuityDraftState() {},
      async refreshOnlineNfceNumberDisplay() {},
      hideOfflineOverlay() {
        return true;
      },
      showOfflineOverlay() {
        return true;
      },
      clearOfflineAuthenticatedOperator() {},
      clearFailoverOnlineOperatorIdentity() {},
      async setOfflineShellAuthenticationState() {},
      log() {}
    });

  const first =
    runtime.tick();

  await Promise.resolve();

  const second =
    runtime.tick();

  assert.equal(
    runtime.isBusy(),
    true
  );

  releaseProbe();

  await first;
  await second;

  assert.equal(
    probeCalls,
    1
  );

  assert.equal(
    runtime.isBusy(),
    false
  );

  assert.equal(
    typeof original,
    'function'
  );
});


test('runtime online envia telemetria somente quando sync está autenticado', async () => {
  const unauthenticated =
    runtimeMonitorHarness({
      syncProbe: {
        reachable: true,
        authenticated: false
      }
    });

  await unauthenticated
    .runtime
    .tick();

  assert.equal(
    unauthenticated.calls
      .telemetryFlushes,
    0
  );

  const authenticated =
    runtimeMonitorHarness({
      syncProbe: {
        reachable: true,
        authenticated: true
      }
    });

  await authenticated
    .runtime
    .tick();

  assert.equal(
    authenticated.calls
      .telemetryFlushes,
    1
  );
});

test('falha de autenticação na telemetria invalida auth sem apagar fila no runtime', async () => {
  const h =
    runtimeMonitorHarness({
      syncProbe: {
        reachable: true,
        authenticated: true
      },
      telemetryAuthError: true
    });

  await h.runtime.tick();

  assert.equal(
    h.calls.telemetryFlushes,
    1
  );

  assert.equal(
    h.calls.authInvalid,
    1
  );
});

test('reconexão offline tenta telemetria somente após limiar saudável', async () => {
  const h =
    runtimeMonitorHarness({
      uiMode: 'OFFLINE',
      syncProbe: {
        reachable: true,
        authenticated: true,
        authInvalid: false
      }
    });

  await h.runtime.tick();
  await h.runtime.tick();

  assert.equal(
    h.calls.telemetryFlushes,
    0
  );

  await h.runtime.tick();

  assert.equal(
    h.calls.telemetryFlushes,
    1
  );
});
