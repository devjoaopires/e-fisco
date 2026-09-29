'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createConnectivityProbes
} = require('../../offline/failover/connectivity-probes');

const {
  CONNECTIVITY_ERRORS,
  createFailoverController
} = require('../../offline/failover/failover-controller');

function httpsHarness({
  statusCode = 204,
  error = null
} = {}) {
  const calls = [];

  return {
    calls,
    api: {
      request(
        url,
        options,
        onResponse
      ) {
        const req =
          new EventEmitter();

        const call = {
          url,
          options,
          timeoutMs: null,
          destroyedWith: null
        };

        calls.push(call);

        req.setTimeout =
          (timeoutMs, callback) => {
            call.timeoutMs =
              timeoutMs;

            call.timeoutCallback =
              callback;
          };

        req.destroy =
          (reason) => {
            call.destroyedWith =
              reason;

            queueMicrotask(
              () =>
                req.emit(
                  'error',
                  reason
                )
            );
          };

        req.end = () => {
          queueMicrotask(
            () => {
              if (error) {
                req.emit(
                  'error',
                  error
                );

                return;
              }

              onResponse({
                statusCode,
                resume() {
                  call.resumed =
                    true;
                }
              });
            }
          );
        };

        return req;
      }
    }
  };
}

test('startup probe falha imediatamente quando Electron net já informa offline', async () => {
  const http =
    httpsHarness();

  const probes =
    createConnectivityProbes({
      net: {
        isOnline() {
          return false;
        }
      },
      https:
        http.api,
      onlineUrl:
        'https://example.test/app',
      userAgent() {
        return 'ua';
      },
      pingSyncDevice() {},
      getSyncIdentity() {
        return null;
      },
      setSyncEmpresaId() {},
      setAuthorizationValid() {},
      isOfflineAuthFailure() {
        return false;
      },
      markOfflineAuthInvalid() {}
    });

  assert.equal(
    await probes
      .probeWixReachableStartup(),
    false
  );

  assert.equal(
    http.calls.length,
    0
  );
});

test('Wix probes preservam HEAD, user-agent, status 2xx/3xx e timeouts distintos', async () => {
  const http =
    httpsHarness({
      statusCode: 302
    });

  const probes =
    createConnectivityProbes({
      net: {
        isOnline() {
          return true;
        }
      },
      https:
        http.api,
      onlineUrl:
        'https://example.test/app',
      userAgent() {
        return 'e-fisco-test';
      },
      pingSyncDevice() {},
      getSyncIdentity() {
        return null;
      },
      setSyncEmpresaId() {},
      setAuthorizationValid() {},
      isOfflineAuthFailure() {
        return false;
      },
      markOfflineAuthInvalid() {},
      wixProbeTimeoutMs:
        7000,
      startupProbeTimeoutMs:
        900
    });

  assert.equal(
    await probes
      .probeWixReachableStartup(),
    true
  );

  assert.equal(
    await probes
      .probeWixReachable(),
    true
  );

  assert.equal(
    http.calls.length,
    2
  );

  assert.equal(
    http.calls[0]
      .options.method,
    'HEAD'
  );

  assert.equal(
    http.calls[0]
      .options.headers[
        'user-agent'
      ],
    'e-fisco-test'
  );

  assert.equal(
    http.calls[0]
      .timeoutMs,
    900
  );

  assert.equal(
    http.calls[1]
      .timeoutMs,
    7000
  );

  assert.equal(
    http.calls.every(
      item =>
        item.resumed === true
    ),
    true
  );
});

test('sync probe preserva identidade, timeout e autorização válida', async () => {
  const identity = {
    deviceId: 'DEV-1',
    deviceToken: 'TOKEN-1',
    empresaId: ''
  };

  const pingCalls = [];
  const empresas = [];
  let validCount = 0;

  const probes =
    createConnectivityProbes({
      net: {
        isOnline() {
          return true;
        }
      },
      https:
        httpsHarness().api,
      onlineUrl:
        'https://example.test',
      userAgent() {
        return 'ua';
      },
      async pingSyncDevice(
        input
      ) {
        pingCalls.push(
          input
        );

        return {
          empresaId:
            'EMP-1'
        };
      },
      getSyncIdentity() {
        return identity;
      },
      setSyncEmpresaId(
        empresaId
      ) {
        empresas.push(
          empresaId
        );
      },
      setAuthorizationValid() {
        validCount += 1;
      },
      isOfflineAuthFailure() {
        return false;
      },
      markOfflineAuthInvalid() {},
      syncProbeTimeoutMs:
        10000
    });

  assert.deepEqual(
    await probes
      .probeSyncReachable(),
    {
      reachable: true,
      authenticated: true
    }
  );

  assert.deepEqual(
    pingCalls,
    [
      {
        deviceId:
          'DEV-1',
        deviceToken:
          'TOKEN-1',
        timeoutMs:
          10000
      }
    ]
  );

  assert.deepEqual(
    empresas,
    ['EMP-1']
  );

  assert.equal(
    validCount,
    1
  );
});

test('sync probe falha fechado em tenant divergente e marca auth inválida', async () => {
  const marked = [];

  const probes =
    createConnectivityProbes({
      net: {
        isOnline() {
          return true;
        }
      },
      https:
        httpsHarness().api,
      onlineUrl:
        'https://example.test',
      userAgent() {
        return 'ua';
      },
      async pingSyncDevice() {
        return {
          empresaId:
            'EMP-2'
        };
      },
      getSyncIdentity() {
        return {
          deviceId:
            'DEV-1',
          deviceToken:
            'TOKEN-1',
          empresaId:
            'EMP-1'
        };
      },
      setSyncEmpresaId() {},
      setAuthorizationValid() {
        throw new Error(
          'não deve validar'
        );
      },
      isOfflineAuthFailure(
        error
      ) {
        return (
          error &&
          error.code ===
            'SYNC_DEVICE_AUTH_FAILED'
        );
      },
      markOfflineAuthInvalid(
        error
      ) {
        marked.push(
          error
        );
      }
    });

  const result =
    await probes
      .probeSyncReachable();

  assert.equal(
    result.reachable,
    true
  );

  assert.equal(
    result.authenticated,
    false
  );

  assert.equal(
    result.authInvalid,
    true
  );

  assert.equal(
    marked.length,
    1
  );

  assert.equal(
    marked[0].code,
    'SYNC_DEVICE_AUTH_FAILED'
  );
});

function failoverHarness({
  onlineIdentity = {
    empresaId: 'EMP-1',
    operadorId: 'OP-1',
    perfil: 'CAIXA'
  },
  freshDraft = {
    version: 1,
    products: [
      {
        productFiscalId:
          'P-1',
        cancelled: false
      }
    ],
    currentProduct: null,
    paymentStageOpen: false
  },
  authorizationInvalid = false,
  nowValue = 100_000
} = {}) {
  const state = {
    uiMode: 'ONLINE',
    offlineViewReady: true,
    offlineViewAttached: true,
    continuityDraft: null,
    authenticatedOperator: null,
    shellAuth: null,
    successCount: 2,
    overlayShown: false,
    overlayHidden: false,
    restoredDraft: null,
    stagingBounds: null,
    logs: [],
    refreshCalls: 0,
    settleCalls: 0,
    syncShortcuts: 0,
    unregisterShortcuts: 0
  };

  const webRequest = {
    handler: null,
    filter: null,
    onErrorOccurred(
      filter,
      handler
    ) {
      this.filter =
        filter;
      this.handler =
        handler;
    }
  };

  const offlineView = {
    setBounds(bounds) {
      state.stagingBounds =
        bounds;
    }
  };

  const controller =
    createFailoverController({
      session: {
        defaultSession: {
          webRequest
        }
      },
      failureThreshold: 3,
      now() {
        return nowValue;
      },
      getOfflineUiServer() {
        return {
          origin:
            'http://127.0.0.1:40123'
        };
      },
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
        return state
          .offlineViewReady;
      },
      isOfflineViewAttached() {
        return state
          .offlineViewAttached;
      },
      getOfflineUiMode() {
        return state.uiMode;
      },
      setOfflineUiMode(
        value
      ) {
        state.uiMode =
          value;
      },
      isAuthorizationInvalid() {
        return authorizationInvalid;
      },
      assertOfflineMutationAuthorized() {},
      async ensureOfflineView() {},
      offlineStagingBounds() {
        return {
          x: -32000,
          y: -32000,
          width: 1200,
          height: 800
        };
      },
      async captureOnlineContinuityDraft() {
        return freshDraft;
      },
      setOfflineContinuityDraft(
        draft
      ) {
        state.continuityDraft =
          draft;
      },
      getOfflineContinuityDraft() {
        return state
          .continuityDraft;
      },
      recentConfirmedOnlineOperatorIdentity() {
        return onlineIdentity;
      },
      async captureOnlineOperatorIdentity() {
        return null;
      },
      rememberConfirmedOnlineOperatorIdentity(
        identity
      ) {
        return identity;
      },
      async captureOnlineOperatorProfile() {
        return null;
      },
      resolveOfflineOperatorProfileForSession(
        profile
      ) {
        return profile;
      },
      normalizeOfflineAuthenticatedOperator(
        profile
      ) {
        return profile;
      },
      async applyOfflineOperatorProfile() {
        return true;
      },
      setOfflineAuthenticatedOperator(
        profile
      ) {
        state
          .authenticatedOperator =
          profile;

        return profile;
      },
      clearOfflineAuthenticatedOperator() {
        state
          .authenticatedOperator =
          null;
      },
      async setOfflineShellAuthenticationState(
        profile
      ) {
        state.shellAuth =
          profile;
      },
      async restoreOfflineContinuityDraft(
        draft
      ) {
        state.restoredDraft =
          draft;

        return true;
      },
      async refreshOfflineNfceNumberDisplay() {
        state.refreshCalls += 1;
        return true;
      },
      async settleOfflineRendererBeforeReveal() {
        state.settleCalls += 1;
        return true;
      },
      showOfflineOverlay() {
        state.overlayShown =
          true;

        return true;
      },
      hideOfflineOverlay() {
        state.overlayHidden =
          true;

        return true;
      },
      resetRecoverySuccessCount() {
        state.successCount =
          0;
      },
      syncOfflineFunctionShortcuts() {
        state.syncShortcuts += 1;
      },
      unregisterOfflineFunctionShortcuts() {
        state.unregisterShortcuts += 1;
      },
      log(...args) {
        state.logs.push(
          args
        );
      }
    });

  return {
    controller,
    state,
    webRequest
  };
}

test('failover threshold exige três falhas normais consecutivas', () => {
  const h =
    failoverHarness();

  assert.deepEqual(
    h.controller
      .recordMonitorFailure(),
    {
      failureCount: 1,
      threshold: 3,
      shouldFailover: false
    }
  );

  assert.equal(
    h.controller
      .recordMonitorFailure()
      .shouldFailover,
    false
  );

  assert.equal(
    h.controller
      .recordMonitorFailure()
      .shouldFailover,
    true
  );

  assert.equal(
    h.controller
      .getFailureCount(),
    3
  );

  h.controller
    .resetFailures();

  assert.equal(
    h.controller
      .getFailureCount(),
    0
  );
});

test('falha recente do main frame promove a próxima falha do monitor ao threshold', () => {
  let current =
    100_000;

  const h =
    failoverHarness({
      nowValue: current
    });

  h.controller
    .noteMainFrameFailure();

  current += 100;

  const controller =
    createFailoverController({
      session: {
        defaultSession: {
          webRequest: {
            onErrorOccurred() {}
          }
        }
      },
      failureThreshold: 3,
      now() {
        return current;
      },
      getOfflineUiServer() {
        return null;
      },
      getMainWindow() {
        return null;
      },
      getOfflineView() {
        return null;
      },
      isOfflineViewReady() {
        return false;
      },
      isOfflineViewAttached() {
        return false;
      },
      getOfflineUiMode() {
        return 'ONLINE';
      },
      setOfflineUiMode() {},
      isAuthorizationInvalid() {
        return false;
      },
      assertOfflineMutationAuthorized() {},
      async ensureOfflineView() {},
      offlineStagingBounds() {
        return {};
      },
      async captureOnlineContinuityDraft() {
        return null;
      },
      setOfflineContinuityDraft() {},
      getOfflineContinuityDraft() {
        return null;
      },
      recentConfirmedOnlineOperatorIdentity() {
        return null;
      },
      async captureOnlineOperatorIdentity() {
        return null;
      },
      rememberConfirmedOnlineOperatorIdentity() {
        return null;
      },
      async captureOnlineOperatorProfile() {
        return null;
      },
      resolveOfflineOperatorProfileForSession() {
        return null;
      },
      normalizeOfflineAuthenticatedOperator() {
        return null;
      },
      async applyOfflineOperatorProfile() {
        return false;
      },
      setOfflineAuthenticatedOperator() {
        return null;
      },
      clearOfflineAuthenticatedOperator() {},
      async setOfflineShellAuthenticationState() {},
      async restoreOfflineContinuityDraft() {},
      async refreshOfflineNfceNumberDisplay() {},
      async settleOfflineRendererBeforeReveal() {},
      showOfflineOverlay() {
        return false;
      },
      hideOfflineOverlay() {},
      resetRecoverySuccessCount() {},
      syncOfflineFunctionShortcuts() {},
      unregisterOfflineFunctionShortcuts() {},
      log() {}
    });

  controller
    .noteMainFrameFailure();

  current += 100;

  const state =
    controller
      .recordMonitorFailure();

  assert.equal(
    state.failureCount,
    3
  );

  assert.equal(
    state.shouldFailover,
    true
  );
});

test('switchToOfflineUi preserva sessão, draft, staging e reseta thresholds', async () => {
  const h =
    failoverHarness();

  h.controller
    .recordMonitorFailure();
  h.controller
    .recordMonitorFailure();

  assert.equal(
    await h.controller
      .switchToOfflineUi(
        'online-unreachable'
      ),
    true
  );

  assert.equal(
    h.state.uiMode,
    'OFFLINE'
  );

  assert.equal(
    h.controller
      .getFailureCount(),
    0
  );

  assert.equal(
    h.state.successCount,
    0
  );

  assert.equal(
    h.state
      .authenticatedOperator
      .operadorId,
    'OP-1'
  );

  assert.equal(
    h.controller
      .getOnlineOperatorIdentity()
      .empresaId,
    'EMP-1'
  );

  assert.deepEqual(
    h.state.restoredDraft,
    h.state.continuityDraft
  );

  assert.equal(
    h.state.overlayShown,
    true
  );

  assert.equal(
    h.state.refreshCalls,
    1
  );

  assert.equal(
    h.state.settleCalls,
    1
  );
});

test('network hook aceita somente tipos e erros de conectividade congelados', async () => {
  const h =
    failoverHarness();

  assert.equal(
    h.controller
      .installNetworkFailoverHook(),
    true
  );

  assert.deepEqual(
    h.webRequest.filter,
    {
      urls:
        ['https://*/*']
    }
  );

  h.webRequest.handler({
    resourceType:
      'image',
    error:
      CONNECTIVITY_ERRORS[0],
    url:
      'https://example.test/a.png'
  });

  await new Promise(
    (resolve) =>
      setImmediate(resolve)
  );

  assert.equal(
    h.state.uiMode,
    'ONLINE'
  );

  h.webRequest.handler({
    resourceType:
      'fetch',
    error:
      'ERR_ABORTED',
    url:
      'https://example.test/api'
  });

  await new Promise(
    (resolve) =>
      setImmediate(resolve)
  );

  assert.equal(
    h.state.uiMode,
    'ONLINE'
  );

  h.webRequest.handler({
    resourceType:
      'fetch',
    error:
      'net::ERR_INTERNET_DISCONNECTED',
    url:
      'https://example.test/api'
  });

  await new Promise(
    (resolve) =>
      setImmediate(resolve)
  );

  assert.equal(
    h.state.uiMode,
    'OFFLINE'
  );

  assert.equal(
    h.state.logs.some(
      entry =>
        entry[0] ===
          'ONLINE NETWORK REQUEST FAILED'
    ),
    true
  );
});

test('main-frame load failure registra falha e dispara failover imediato somente para URL online', async () => {
  const h =
    failoverHarness();

  assert.equal(
    h.controller
      .handleMainFrameLoadFailure({
        errorCode: -106,
        errorDescription:
          'ERR_INTERNET_DISCONNECTED',
        validatedURL:
          'https://example.test/app',
        isMainFrame: true,
        isOfflineOriginAllowed() {
          return false;
        }
      }),
    true
  );

  await new Promise(
    (resolve) =>
      setImmediate(resolve)
  );

  assert.equal(
    h.state.uiMode,
    'OFFLINE'
  );

  assert.equal(
    h.state.logs.some(
      entry =>
        entry[0] ===
          'ONLINE MAIN FRAME LOAD FAILED'
    ),
    true
  );
});


test('navigator offline dispara failover apenas quando a fronteira imediata está apta', async () => {
  const healthy =
    failoverHarness();

  assert.equal(
    healthy.controller
      .requestNavigatorOfflineFailover(),
    true
  );

  await new Promise(
    (resolve) =>
      setImmediate(resolve)
  );

  assert.equal(
    healthy.state.uiMode,
    'OFFLINE'
  );

  assert.equal(
    healthy.state.logs.some(
      entry =>
        entry[0] ===
          'ONLINE NAVIGATOR OFFLINE DETECTED'
    ),
    true
  );

  const invalidAuth =
    failoverHarness({
      authorizationInvalid: true
    });

  assert.equal(
    invalidAuth.controller
      .requestNavigatorOfflineFailover(),
    false
  );

  await new Promise(
    (resolve) =>
      setImmediate(resolve)
  );

  assert.equal(
    invalidAuth.state.uiMode,
    'ONLINE'
  );
});

test('network failover hook tem owner único e instalação idempotente', () => {
  const h =
    failoverHarness();

  assert.equal(
    h.controller
      .installNetworkFailoverHook(),
    true
  );

  const firstHandler =
    h.webRequest.handler;

  assert.equal(
    h.controller
      .installNetworkFailoverHook(),
    false
  );

  assert.equal(
    h.webRequest.handler,
    firstHandler
  );
});

test('did-fail-load ignora subframe e origin offline permitido', async () => {
  const h =
    failoverHarness();

  assert.equal(
    h.controller
      .handleMainFrameLoadFailure({
        errorCode: -106,
        errorDescription:
          'ERR_INTERNET_DISCONNECTED',
        validatedURL:
          'https://example.test/frame',
        isMainFrame: false,
        isOfflineOriginAllowed() {
          return false;
        }
      }),
    false
  );

  assert.equal(
    h.controller
      .handleMainFrameLoadFailure({
        errorCode: -106,
        errorDescription:
          'ERR_INTERNET_DISCONNECTED',
        validatedURL:
          'http://127.0.0.1:40123/pdv.html',
        isMainFrame: true,
        isOfflineOriginAllowed() {
          return true;
        }
      }),
    false
  );

  await new Promise(
    (resolve) =>
      setImmediate(resolve)
  );

  assert.equal(
    h.state.uiMode,
    'ONLINE'
  );
});

test('failover sem sessão preservável mantém o draft e cai para login offline', async () => {
  const h =
    failoverHarness({
      onlineIdentity: null
    });

  assert.equal(
    await h.controller
      .switchToOfflineUi(
        'online-unreachable'
      ),
    true
  );

  assert.equal(
    h.state.uiMode,
    'OFFLINE'
  );

  assert.equal(
    h.state.authenticatedOperator,
    null
  );

  assert.equal(
    h.state.shellAuth,
    null
  );

  assert.deepEqual(
    h.state.restoredDraft,
    h.state.continuityDraft
  );

  assert.equal(
    h.state.logs.some(
      entry =>
        entry[0] ===
          'OFFLINE FAILOVER LOGIN FALLBACK'
    ),
    true
  );
});

test('composition root mantém owners únicos e liga webRequest/did-fail-load ao failover extraído', () => {
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
    (source.match(/createConnectivityProbes\(\{/g) || []).length,
    1
  );

  assert.equal(
    (source.match(/createFailoverController\(\{/g) || []).length,
    1
  );

  assert.equal(
    (source.match(/\.installNetworkFailoverHook\(\)/g) || []).length,
    1
  );

  assert.equal(
    (source.match(/['"]did-fail-load['"]/g) || []).length,
    1
  );

  assert.equal(
    (source.match(/\.handleMainFrameLoadFailure\(\{/g) || []).length,
    1
  );

  assert.match(
    source,
    /const OFFLINE_FAILURE_THRESHOLD = 3;/
  );
});
