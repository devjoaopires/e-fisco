'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createContinuityMirrorController
} = require('../../offline/continuity/continuity-mirror');
const {
  createContinuityRecoveryController
} = require('../../offline/continuity/continuity-recovery');
const {
  createOfflineRuntimeController
} = require('../../offline/runtime/runtime-controller');

const ROOT = path.resolve(__dirname, '..', '..');
const MAIN_SOURCE = fs.readFileSync(
  path.join(ROOT, 'main.js'),
  'utf8'
);
const PDV_SOURCE = fs.readFileSync(
  path.join(ROOT, 'offline-ui', 'pdv.html'),
  'utf8'
);
const PDV_SALE_PAYMENT_SOURCE = fs.readFileSync(
  path.join(
    ROOT,
    'offline-ui',
    'pdv',
    'domains',
    'sale-payment',
    'sale-core.js'
  ),
  'utf8'
);
const PDV_CONTINUITY_DOMAIN_SOURCE = fs.readFileSync(
  path.join(
    ROOT,
    'offline-ui',
    'pdv',
    'domains',
    'continuity',
    'domain.js'
  ),
  'utf8'
);
const PDV_CONTINUITY_CORE_SOURCE = fs.readFileSync(
  path.join(
    ROOT,
    'offline-ui',
    'pdv',
    'domains',
    'continuity',
    'core.js'
  ),
  'utf8'
);
const PDV_CONTINUITY_RUNTIME_SOURCE =
  PDV_SOURCE +
  '\n' +
  PDV_SALE_PAYMENT_SOURCE +
  '\n' +
  PDV_CONTINUITY_DOMAIN_SOURCE +
  '\n' +
  PDV_CONTINUITY_CORE_SOURCE;

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(
    start,
    -1,
    'Marcador inicial não encontrado: ' + startMarker
  );

  const end = source.indexOf(endMarker, start);
  assert.notEqual(
    end,
    -1,
    'Marcador final não encontrado: ' + endMarker
  );

  return source.slice(start, end);
}

function buildContinuityHarness() {
  const calls = {
    onlineScripts: [],
    offlineScripts: []
  };

  const onlineFrame = {
    async executeJavaScript(script) {
      calls.onlineScripts.push(script);
      return JSON.stringify({
        mode: 'native',
        draft: {
          version: 1,
          saleNumber: '42',
          saleId: 'sale-continuity-1',
          products: [{
            productFiscalId: 'prod-1',
            name: 'Produto 1',
            quantity: 2,
            unit: 'UN',
            unitValue: 5,
            total: 10,
            cancelled: false
          }],
          currentProduct: {
            productFiscalId: 'prod-2',
            name: 'Produto 2',
            quantity: 1,
            unit: 'UN',
            unitValue: 7,
            total: 7
          },
          totalValue: 10,
          activeProducts: 1,
          paymentStageOpen: true,
          paymentStageKind: 'FINALIZE',
          paymentContinuity: {
            selectedMethod: 'PIX',
            editingMethod: 'PIX',
            flowMode: 'METHOD',
            methodAmount: 10,
            cashReceived: 0,
            paymentParts: [{
              method: 'PIX',
              amount: 10
            }]
          },
          browserOnline: false,
          operatorName: 'Operador Teste',
          capturedAt: '2026-09-26T15:00:00.000Z'
        }
      });
    }
  };

  const offlineFrame = {
    async executeJavaScript(script) {
      calls.offlineScripts.push(script);
      return true;
    }
  };

  const mainWindow = {
    webContents: {
      kind: 'online'
    },
    isDestroyed() {
      return false;
    }
  };

  const offlineView = {
    webContents: {
      kind: 'offline'
    }
  };

  async function findPdvContinuityFrame(
    webContents
  ) {
    return webContents.kind === 'online'
      ? onlineFrame
      : offlineFrame;
  }

  const mirror =
    createContinuityMirrorController({
      getMainWindow() {
        return mainWindow;
      },
      findPdvContinuityFrame,
      getOfflineUiMode() {
        return 'ONLINE';
      },
      getPendingUpdateVersion() {
        return false;
      },
      getPendingVerifierCandidate() {
        return false;
      },
      async persistPendingCredential() {},
      async refreshConfirmedOnlineIdentity() {},
      getAuthenticatedOperator() {
        return {
          empresaId: 'empresa-1'
        };
      },
      getFailoverOnlineOperatorIdentity() {
        return null;
      },
      getLastConfirmedOnlineOperatorIdentity() {
        return null;
      },
      listOfflineProductsForSale() {
        return [];
      },
      requestNavigatorOfflineFailover() {},
      log() {}
    });

  const recovery =
    createContinuityRecoveryController({
      getMainWindow() {
        return mainWindow;
      },
      getOfflineView() {
        return offlineView;
      },
      isOfflineViewReady() {
        return true;
      },
      findPdvContinuityFrame,
      log() {}
    });

  return {
    api: {
      captureOnlineContinuityDraft:
        mirror.captureOnlineDraft,
      restoreOfflineContinuityDraft:
        recovery.restoreOfflineDraft
    },
    calls
  };
}

function restoredPayloadFromScript(script) {
  const marker = 'window.__scfPdvRestoreContinuityDraft(';
  const start = script.indexOf(marker);
  assert.notEqual(start, -1);

  const payloadStart = start + marker.length;
  const payloadEnd = script.indexOf(');', payloadStart);
  assert.notEqual(payloadEnd, -1);

  return JSON.parse(
    script.slice(payloadStart, payloadEnd)
  );
}

function buildRuntimeThresholdHarness() {
  const cfg = {
    healthy: false,
    authenticated: false,
    authInvalid: false,
    activeOutbox: 0,
    activeOutboxSequence: null,
    syncOutboxCalls: 0,
    offlineSwitches: 0,
    onlineSwitches: 0
  };

  let uiMode =
    'ONLINE';

  let failoverFailureCount =
    0;

  const failoverController = {
    resetFailures() {
      failoverFailureCount = 0;
    },
    recordMonitorFailure() {
      failoverFailureCount += 1;

      return {
        failureCount:
          failoverFailureCount,
        shouldFailover:
          failoverFailureCount >= 3
      };
    },
    getFailureCount() {
      return failoverFailureCount;
    }
  };

  const runtime =
    createOfflineRuntimeController({
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
        if (
          uiMode !== 'ONLINE' &&
          value === 'ONLINE'
        ) {
          cfg.onlineSwitches += 1;
        }

        uiMode = value;
      },
      getPendingUpdateVersion() {
        return false;
      },
      async probeWixReachable() {
        return cfg.healthy;
      },
      async probeSyncReachable() {
        return {
          reachable:
            cfg.healthy,
          authenticated:
            cfg.authenticated,
          authInvalid:
            cfg.authInvalid
        };
      },
      getSyncIdentity() {
        return {
          deviceId:
            'device-1',
          deviceToken:
            'token-1',
          empresaId:
            'empresa-1'
        };
      },
      failoverController,
      async switchToOfflineUi() {
        cfg.offlineSwitches += 1;
        uiMode = 'OFFLINE';
        return true;
      },
      async refreshRemoteCashState() {},
      async syncOutboxPending() {
        cfg.syncOutboxCalls += 1;

        const active =
          Array.isArray(
            cfg.activeOutboxSequence
          ) &&
          cfg.activeOutboxSequence.length
            ? cfg.activeOutboxSequence.shift()
            : cfg.activeOutbox;

        return {
          active
        };
      },
      activeOutboxCount(
        summary
      ) {
        return Number(
          summary &&
          summary.active ||
          0
        );
      },
      async syncOfflineProductCacheCoalesced() {
        return {
          ok: true
        };
      },
      async syncOfflineF5ReferenceCacheCoalesced() {
        return {
          ok: true
        };
      },
      async maintainOfflineFiscalLeaseInventory() {
        return {
          ok: true
        };
      },
      logFiscalLeaseMaintenance() {},
      async maintainOfflineFiscalTransmission() {
        return {
          ok: true
        };
      },
      logFiscalTransmissionSummary() {},
      isOfflineAuthFailure() {
        return false;
      },
      markOfflineAuthInvalid() {},
      resolveOfflineOperationSyncIdentity() {
        return {
          deviceId:
            'device-1',
          deviceToken:
            'token-1',
          empresaId:
            'empresa-1'
        };
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
          ambiente:
            'HOMOLOGACAO'
        };
      },
      async captureOnlineOperatorIdentity() {
        return {
          empresaId:
            'empresa-1',
          operadorId:
            'operador-1',
          perfil:
            'CAIXA'
        };
      },
      getOfflineAuthenticatedOperator() {
        return {
          empresaId:
            'empresa-1',
          operadorId:
            'operador-1',
          perfil:
            'CAIXA'
        };
      },
      getFailoverOnlineOperatorIdentity() {
        return null;
      },
      async reloadOnlinePage() {},
      buildFiscalCounterSyncPayload() {
        return {
          proximoNumero:
            10
        };
      },
      async primeOnlineNfceNumberDisplay() {},
      async queryOnlineNfceNumberForRecovery() {
        return {
          ok: true,
          proximoNumero:
            10,
          reason:
            'OK'
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
      async delay() {}
    });

  return {
    api: {
      tick:
        runtime.tick,
      setMode(value) {
        uiMode = value;
        failoverController
          .resetFailures();
        runtime
          .resetRecoverySuccessCount();
      },
      state() {
        return {
          mode:
            uiMode,
          failures:
            failoverController
              .getFailureCount(),
          successes:
            runtime
              .getRecoverySuccessCount(),
          offlineSwitches:
            cfg.offlineSwitches,
          onlineSwitches:
            cfg.onlineSwitches
        };
      }
    },
    cfg
  };
}

function buildRecoveryHarness(overrides = {}) {
  const config = {
    activeSale: false,
    transferredSale: false,
    onlineCleared: true,
    recoveryIdentity: {
      empresaId:
        'empresa-1',
      deviceId:
        'device-1',
      deviceToken:
        'token-1'
    },
    fiscalEnvironment:
      'HOMOLOGACAO',
    onlineIdentity: {
      empresaId:
        'empresa-1',
      operadorId:
        'operador-1',
      perfil:
        'CAIXA'
    },
    localNext: 10,
    remoteNext: 10,
    remoteReason: 'OK',
    hideOverlay: true,
    ...overrides
  };

  let uiMode =
    'OFFLINE';

  let continuityDraft =
    config.transferredSale
      ? {
          products: [
            {
              productFiscalId:
                'prod-1',
              cancelled: false
            }
          ],
          currentProduct: null
        }
      : null;

  let authenticatedOperator = {
    empresaId:
      'empresa-1',
    operadorId:
      'operador-1',
    perfil:
      'CAIXA'
  };

  let failoverOnlineIdentity =
    null;

  let failoverFailureCount =
    0;

  const calls = {
    clearOnline: 0,
    syncShortcuts: 0,
    hideOverlay: 0,
    showOverlay: 0,
    clearSession: 0,
    shellAuth: 0,
    prime: [],
    refreshNumber: 0,
    normalizeHeader: 0
  };

  const failoverController = {
    resetFailures() {
      failoverFailureCount =
        0;
    },
    getFailureCount() {
      return failoverFailureCount;
    }
  };

  const runtime =
    createOfflineRuntimeController({
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
        return {
          reachable: true,
          authenticated: true
        };
      },
      getSyncIdentity() {
        return config
          .recoveryIdentity;
      },
      failoverController,
      async switchToOfflineUi() {
        uiMode =
          'OFFLINE';
        return true;
      },
      async refreshRemoteCashState() {},
      async syncOutboxPending() {
        return {
          active: 0
        };
      },
      activeOutboxCount(
        summary
      ) {
        return Number(
          summary &&
          summary.active ||
          0
        );
      },
      async syncOfflineProductCacheCoalesced() {
        return {
          ok: true
        };
      },
      async syncOfflineF5ReferenceCacheCoalesced() {
        return {
          ok: true
        };
      },
      async maintainOfflineFiscalLeaseInventory() {
        return {
          ok: true
        };
      },
      logFiscalLeaseMaintenance() {},
      async maintainOfflineFiscalTransmission() {
        return {
          ok: true
        };
      },
      logFiscalTransmissionSummary() {},
      isOfflineAuthFailure() {
        return false;
      },
      markOfflineAuthInvalid() {},
      resolveOfflineOperationSyncIdentity() {
        return config
          .recoveryIdentity;
      },
      async offlineHasActiveContinuitySale() {
        return config
          .activeSale;
      },
      unregisterOfflineFunctionShortcuts() {},
      syncOfflineFunctionShortcuts() {
        calls.syncShortcuts += 1;
      },
      getOfflineContinuityDraft() {
        return continuityDraft;
      },
      async clearOnlineContinuityDraft() {
        calls.clearOnline += 1;
        return config
          .onlineCleared;
      },
      getFiscalProfileCache() {
        return {
          ambiente:
            config
              .fiscalEnvironment
        };
      },
      async captureOnlineOperatorIdentity() {
        return config
          .onlineIdentity;
      },
      getOfflineAuthenticatedOperator() {
        return authenticatedOperator;
      },
      getFailoverOnlineOperatorIdentity() {
        return failoverOnlineIdentity;
      },
      async reloadOnlinePage() {
        return true;
      },
      buildFiscalCounterSyncPayload() {
        return config
          .localNext == null
            ? null
            : {
                proximoNumero:
                  config.localNext
              };
      },
      async primeOnlineNfceNumberDisplay(
        number
      ) {
        calls.prime.push(
          number
        );
        return true;
      },
      async queryOnlineNfceNumberForRecovery() {
        return config
          .remoteNext == null
            ? {
                ok: false,
                reason:
                  config
                    .remoteReason
              }
            : {
                ok: true,
                proximoNumero:
                  config
                    .remoteNext,
                reason:
                  config
                    .remoteReason
              };
      },
      async normalizeOnlinePdvUnitValueHeader() {
        calls.normalizeHeader += 1;
        return true;
      },
      clearOfflineContinuityDraftState() {
        continuityDraft =
          null;
      },
      async refreshOnlineNfceNumberDisplay() {
        calls.refreshNumber += 1;
        return true;
      },
      hideOfflineOverlay() {
        calls.hideOverlay += 1;
        return config
          .hideOverlay;
      },
      showOfflineOverlay() {
        calls.showOverlay += 1;
        return true;
      },
      clearOfflineAuthenticatedOperator() {
        calls.clearSession += 1;
        authenticatedOperator =
          null;
      },
      clearFailoverOnlineOperatorIdentity() {
        failoverOnlineIdentity =
          null;
      },
      async setOfflineShellAuthenticationState() {
        calls.shellAuth += 1;
      },
      log() {},
      async delay() {}
    });

  runtime
    .resetRecoverySuccessCount();

  return {
    api: {
      switchToOnlineUi:
        runtime
          .switchToOnlineUi,
      state() {
        return {
          mode:
            uiMode,
          failures:
            failoverController
              .getFailureCount(),
          successes:
            runtime
              .getRecoverySuccessCount(),
          continuityDraft,
          authenticatedOperator
        };
      }
    },
    cfg:
      config,
    calls
  };
}

test('continuidade captura o draft online e restaura o mesmo payload no renderer offline', async () => {
  const harness = buildContinuityHarness();

  const captured =
    await harness.api.captureOnlineContinuityDraft({
      silent: true,
      timeoutMs: 100
    });

  assert.equal(captured.saleId, 'sale-continuity-1');
  assert.equal(captured.saleNumber, '42');
  assert.equal(captured.products.length, 1);
  assert.equal(
    captured.currentProduct.productFiscalId,
    'prod-2'
  );
  assert.equal(captured.paymentStageOpen, true);
  assert.equal(
    captured.paymentContinuity.selectedMethod,
    'PIX'
  );
  assert.equal(captured.operatorName, 'Operador Teste');

  assert.equal(
    await harness.api.restoreOfflineContinuityDraft(captured),
    true
  );

  assert.equal(harness.calls.onlineScripts.length, 1);
  assert.equal(harness.calls.offlineScripts.length, 1);

  const restored = restoredPayloadFromScript(
    harness.calls.offlineScripts[0]
  );

  assert.deepEqual(
    JSON.parse(JSON.stringify(restored)),
    JSON.parse(JSON.stringify(captured))
  );

  assert.match(
    harness.calls.onlineScripts[0],
    /__scfPdvExportContinuityDraft/
  );
  assert.match(
    harness.calls.offlineScripts[0],
    /__scfPdvRestoreContinuityDraft/
  );
});

test('PDV mantém export, restore e detector de venda ativa como contrato de continuidade', () => {
  assert.match(
    PDV_CONTINUITY_CORE_SOURCE,
    /global\.__scfPdvExportContinuityDraft\s*=/
  );
  assert.match(
    PDV_CONTINUITY_CORE_SOURCE,
    /global\.__scfPdvRestoreContinuityDraft\s*=/
  );
  assert.match(
    PDV_CONTINUITY_CORE_SOURCE,
    /global\.__scfPdvHasActiveContinuitySale\s*=/
  );
  assert.match(
    PDV_CONTINUITY_DOMAIN_SOURCE,
    /restoreDraft/
  );
  assert.match(
    PDV_SALE_PAYMENT_SOURCE,
    /continuityDomain\.registerSalePort/
  );
  assert.match(
    PDV_CONTINUITY_RUNTIME_SOURCE,
    /paymentContinuity/
  );
  assert.match(
    PDV_CONTINUITY_RUNTIME_SOURCE,
    /paymentStageKind/
  );
});

test('monitor exige três falhas consecutivas antes do failover normal', async () => {
  const harness = buildRuntimeThresholdHarness();

  harness.cfg.healthy = false;

  await harness.api.tick();
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.api.state())),
    {
      mode: 'ONLINE',
      failures: 1,
      successes: 0,
      offlineSwitches: 0,
      onlineSwitches: 0
    }
  );

  await harness.api.tick();
  assert.equal(harness.api.state().failures, 2);
  assert.equal(harness.api.state().offlineSwitches, 0);

  await harness.api.tick();
  assert.equal(harness.api.state().offlineSwitches, 1);
  assert.equal(harness.api.state().mode, 'OFFLINE');
});

test('monitor exige três sucessos consecutivos antes de iniciar recovery', async () => {
  const harness = buildRuntimeThresholdHarness();

  harness.api.setMode('OFFLINE');
  harness.cfg.healthy = true;
  harness.cfg.authenticated = true;

  await harness.api.tick();
  assert.equal(harness.api.state().successes, 1);
  assert.equal(harness.api.state().onlineSwitches, 0);

  await harness.api.tick();
  assert.equal(harness.api.state().successes, 2);
  assert.equal(harness.api.state().onlineSwitches, 0);

  await harness.api.tick();
  assert.equal(harness.api.state().onlineSwitches, 1);
  assert.equal(harness.api.state().mode, 'ONLINE');
});

test('sucesso saudável zera a sequência de falhas do monitor', async () => {
  const harness = buildRuntimeThresholdHarness();

  harness.cfg.healthy = false;
  await harness.api.tick();
  assert.equal(harness.api.state().failures, 1);

  harness.cfg.healthy = true;
  await harness.api.tick();

  assert.equal(harness.api.state().failures, 0);
  assert.equal(harness.api.state().successes, 1);
  assert.equal(harness.api.state().offlineSwitches, 0);
});

test('recovery não avança com autenticação de sync inválida', async () => {
  const harness = buildRuntimeThresholdHarness();

  harness.api.setMode('OFFLINE');
  harness.cfg.healthy = true;
  harness.cfg.authInvalid = true;

  await harness.api.tick();
  await harness.api.tick();
  await harness.api.tick();

  assert.equal(harness.api.state().successes, 3);
  assert.equal(harness.api.state().onlineSwitches, 0);
  assert.equal(harness.api.state().mode, 'OFFLINE');
});

test('recovery não avança enquanto a outbox ainda possui operações ativas', async () => {
  const harness = buildRuntimeThresholdHarness();

  harness.api.setMode('OFFLINE');
  harness.cfg.healthy = true;
  harness.cfg.authenticated = true;
  harness.cfg.activeOutbox = 1;

  await harness.api.tick();
  await harness.api.tick();
  await harness.api.tick();

  assert.equal(harness.api.state().successes, 3);
  assert.equal(harness.api.state().onlineSwitches, 0);
  assert.equal(harness.api.state().mode, 'OFFLINE');
});

test('recovery não retorna online enquanto existe venda ativa no offline', async () => {
  const harness = buildRecoveryHarness({
    activeSale: true
  });

  assert.equal(
    await harness.api.switchToOnlineUi('test'),
    false
  );
  assert.equal(harness.api.state().mode, 'OFFLINE');
  assert.equal(harness.calls.clearOnline, 0);
  assert.equal(harness.calls.hideOverlay, 0);
});

test('recovery exige limpar o carrinho online quando houve venda transferida', async () => {
  const harness = buildRecoveryHarness({
    transferredSale: true,
    onlineCleared: false
  });

  assert.equal(
    await harness.api.switchToOnlineUi('test'),
    false
  );
  assert.equal(harness.api.state().mode, 'OFFLINE');
  assert.equal(harness.calls.clearOnline, 1);
  assert.equal(harness.calls.hideOverlay, 0);
});

test('recovery bloqueia retorno quando a identidade de sync está ausente', async () => {
  const harness = buildRecoveryHarness({
    recoveryIdentity: null
  });

  assert.equal(
    await harness.api.switchToOnlineUi('test'),
    false
  );
  assert.equal(harness.api.state().mode, 'OFFLINE');
  assert.equal(harness.calls.hideOverlay, 0);
});

test('recovery bloqueia tenant online diferente da empresa offline', async () => {
  const harness = buildRecoveryHarness({
    onlineIdentity: {
      empresaId: 'empresa-2',
      operadorId: 'operador-2',
      perfil: 'CAIXA'
    }
  });

  assert.equal(
    await harness.api.switchToOnlineUi('test'),
    false
  );
  assert.equal(harness.api.state().mode, 'OFFLINE');
  assert.equal(harness.calls.hideOverlay, 0);
});

test('recovery bloqueia retorno quando contador NFC-e remoto está atrás do local', async () => {
  const harness = buildRecoveryHarness({
    localNext: 10,
    remoteNext: 9
  });

  assert.equal(
    await harness.api.switchToOnlineUi('test'),
    false
  );
  assert.equal(harness.api.state().mode, 'OFFLINE');
  assert.equal(harness.calls.hideOverlay, 0);
});

test('recovery entra online somente após invariantes de identidade e contador', async () => {
  const harness = buildRecoveryHarness({
    localNext: 10,
    remoteNext: 10
  });

  assert.equal(
    await harness.api.switchToOnlineUi('test'),
    true
  );

  const state = harness.api.state();

  assert.equal(state.mode, 'ONLINE');
  assert.equal(state.failures, 0);
  assert.equal(state.successes, 0);
  assert.equal(state.continuityDraft, null);
  assert.equal(state.authenticatedOperator, null);
  assert.equal(harness.calls.hideOverlay, 1);
  assert.equal(harness.calls.clearSession, 1);
  assert.equal(harness.calls.shellAuth, 1);
  assert.deepEqual(
    Array.from(harness.calls.prime),
    [10, 10]
  );
  assert.equal(harness.calls.normalizeHeader, 1);
  assert.equal(harness.calls.refreshNumber, 1);
});


test('capture mantém paymentContinuity completo nos caminhos native e DOM fallback', () => {
  const source =
    fs.readFileSync(
      path.join(
        ROOT,
        'offline',
        'continuity',
        'continuity-mirror.js'
      ),
      'utf8'
    );

  assert.match(
    source,
    /const capturePaymentContinuity = \(\) =>/
  );

  for (const field of [
    'selectedMethod',
    'editingMethod',
    'flowMode',
    'methodAmount',
    'cashReceived',
    'paymentParts'
  ]) {
    assert.match(
      source,
      new RegExp(
        '\\b' + field + '\\b'
      )
    );
  }

  assert.equal(
    (source.match(/capturePaymentContinuity\(\)/g) || []).length,
    2
  );

  assert.match(
    source,
    /nativeDraft\.paymentContinuity\s*=\s*\r?\n\s*capturePaymentContinuity\(\)/
  );

  assert.match(
    source,
    /paymentContinuity:\s*\r?\n\s*capturePaymentContinuity\(\)/
  );
});

test('PDV restaura paymentContinuity por partes, método e modo sem criar segundo owner', () => {
  const restoreBlock =
    sliceBetween(
      PDV_SALE_PAYMENT_SOURCE,
      'function restoreContinuityDraft(draft, onPaymentStageReady){',
      'function hasActiveContinuitySale(){'
    );

  assert.match(
    restoreBlock,
    /onPaymentStageReady\(/
  );

  const paymentCore =
    fs.readFileSync(
      path.join(
        ROOT,
        'offline-ui',
        'pdv',
        'domains',
        'sale-payment',
        'payment-core.js'
      ),
      'utf8'
    );

  assert.match(
    paymentCore,
    /paymentParts\s*=\s*\r?\n\s*restoredParts/
  );
  assert.match(
    paymentCore,
    /selectedPaymentMethod\s*=\s*\r?\n\s*restoredMethod/
  );
  assert.match(
    paymentCore,
    /flowMode === 'METHOD'/
  );
  assert.match(
    paymentCore,
    /flowMode === 'CASH'/
  );
  assert.match(
    paymentCore,
    /methodAmountInput\.value/
  );

  assert.match(
    paymentCore,
    /cashReceivedInput\.value/
  );
});

test('composition root mantém um mirror owner e um recovery owner para continuity', () => {
  assert.equal(
    (MAIN_SOURCE.match(/createContinuityMirrorController\(\{/g) || []).length,
    1
  );

  assert.equal(
    (MAIN_SOURCE.match(/createContinuityRecoveryController\(\{/g) || []).length,
    1
  );

  assert.match(
    MAIN_SOURCE,
    /function getOfflineContinuityDraft\(\) \{[\s\S]*?continuityMirrorController[\s\S]*?\.getDraft\(\)/
  );

  assert.match(
    MAIN_SOURCE,
    /function setOfflineContinuityDraft\([\s\S]*?continuityMirrorController[\s\S]*?\.setDraft\(/
  );

  assert.match(
    MAIN_SOURCE,
    /function clearOfflineContinuityDraftState\(\) \{[\s\S]*?continuityMirrorController[\s\S]*?\.clearDraft\(\)/
  );

  assert.match(
    MAIN_SOURCE,
    /function restoreOfflineContinuityDraft\([\s\S]*?continuityRecoveryController[\s\S]*?\.restoreOfflineDraft\(/
  );

  assert.match(
    MAIN_SOURCE,
    /function clearOnlineContinuityDraft\(\) \{[\s\S]*?continuityRecoveryController[\s\S]*?\.clearOnlineDraft\(\)/
  );
});


test('recovery exige três sucessos realmente consecutivos após qualquer quebra de saúde', async () => {
  const harness =
    buildRuntimeThresholdHarness();

  harness.api.setMode('OFFLINE');
  harness.cfg.authenticated = true;
  harness.cfg.healthy = true;

  await harness.api.tick();
  await harness.api.tick();

  assert.equal(
    harness.api.state().successes,
    2
  );

  harness.cfg.healthy = false;
  await harness.api.tick();

  assert.equal(
    harness.api.state().successes,
    0
  );
  assert.equal(
    harness.api.state().onlineSwitches,
    0
  );

  harness.cfg.healthy = true;
  await harness.api.tick();
  await harness.api.tick();

  assert.equal(
    harness.api.state().successes,
    2
  );
  assert.equal(
    harness.api.state().onlineSwitches,
    0
  );

  await harness.api.tick();

  assert.equal(
    harness.api.state().onlineSwitches,
    1
  );
  assert.equal(
    harness.api.state().mode,
    'ONLINE'
  );
});

test('recovery revalida outbox após manutenção fiscal antes de voltar online', async () => {
  const harness =
    buildRuntimeThresholdHarness();

  harness.api.setMode('OFFLINE');
  harness.cfg.authenticated = true;
  harness.cfg.healthy = true;
  harness.cfg.activeOutboxSequence =
    [0, 1];

  await harness.api.tick();
  await harness.api.tick();
  await harness.api.tick();

  assert.equal(
    harness.cfg.syncOutboxCalls,
    2
  );
  assert.equal(
    harness.api.state().successes,
    3
  );
  assert.equal(
    harness.api.state().onlineSwitches,
    0
  );
  assert.equal(
    harness.api.state().mode,
    'OFFLINE'
  );
});

test('composition root mantém owner único do runtime recovery e threshold congelado em três', () => {
  assert.equal(
    (MAIN_SOURCE.match(/createOfflineRuntimeController\(\{/g) || []).length,
    1
  );

  assert.equal(
    (MAIN_SOURCE.match(/const OFFLINE_RECOVERY_THRESHOLD = 3;/g) || []).length,
    1
  );

  assert.equal(
    (MAIN_SOURCE.match(/recoveryThreshold:\s*\r?\n\s*OFFLINE_RECOVERY_THRESHOLD/g) || []).length,
    1
  );

  assert.match(
    MAIN_SOURCE,
    /async function switchToOnlineUi\(reason\) \{[\s\S]*?runtimeController[\s\S]*?\.switchToOnlineUi\(/
  );
});
