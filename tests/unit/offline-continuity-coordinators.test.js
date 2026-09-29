'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeContinuityText,
  createContinuityMirrorController
} = require('../../offline/continuity/continuity-mirror');

const {
  createContinuityRecoveryController
} = require('../../offline/continuity/continuity-recovery');

function createMirrorHarness({
  browserOnline = true,
  catalog = [],
  captureDraft = null
} = {}) {
  const calls = {
    scripts: [],
    failover: 0,
    refreshIdentity: 0,
    persistCredential: 0,
    logs: []
  };

  const draft =
    captureDraft || {
      version: 1,
      products: [],
      currentProduct: null,
      browserOnline
    };

  const frame = {
    async executeJavaScript(script) {
      calls.scripts.push(script);

      return JSON.stringify({
        mode: 'native',
        draft
      });
    }
  };

  const controller =
    createContinuityMirrorController({
      getMainWindow() {
        return {
          webContents: {
            kind: 'online'
          },
          isDestroyed() {
            return false;
          }
        };
      },
      async findPdvContinuityFrame() {
        return frame;
      },
      getOfflineUiMode() {
        return 'ONLINE';
      },
      getPendingUpdateVersion() {
        return false;
      },
      getPendingVerifierCandidate() {
        return false;
      },
      async persistPendingCredential() {
        calls.persistCredential += 1;
      },
      async refreshConfirmedOnlineIdentity() {
        calls.refreshIdentity += 1;
      },
      getAuthenticatedOperator() {
        return {
          empresaId: 'EMP-1'
        };
      },
      getFailoverOnlineOperatorIdentity() {
        return null;
      },
      getLastConfirmedOnlineOperatorIdentity() {
        return null;
      },
      listOfflineProductsForSale() {
        return catalog;
      },
      requestNavigatorOfflineFailover() {
        calls.failover += 1;
      },
      log(...args) {
        calls.logs.push(args);
      }
    });

  return {
    controller,
    calls
  };
}

test('normalizeContinuityText remove acentos, normaliza espaços e caixa', () => {
  assert.equal(
    normalizeContinuityText(
      '  AÇÚCAR   Cristal  '
    ),
    'acucar cristal'
  );
});

test('continuity mirror enriquece produto por código sem sobrescrever contrato do draft', () => {
  const {
    controller
  } =
    createMirrorHarness({
      catalog: [
        {
          produtoId: 'PROD-1',
          codigo: '001',
          gtin: '789',
          nome: 'Produto Teste',
          unidade: 'UN',
          valorUnitario: 4.5,
          ncm: '12345678',
          cfop: '5102'
        }
      ]
    });

  const enriched =
    controller
      .enrichDraftWithOfflineReferences({
        products: [
          {
            productCode: '001',
            name: 'Produto Teste',
            quantity: 2,
            unitValue: 4.5
          }
        ],
        currentProduct: null
      });

  assert.equal(
    enriched.products[0]
      .productFiscalId,
    'PROD-1'
  );
  assert.equal(
    enriched.products[0].gtin,
    '789'
  );
  assert.equal(
    enriched.products[0].total,
    9
  );
});

test('continuity mirror resolve fallback por nome normalizado e valor somente quando match é único', () => {
  const {
    controller
  } =
    createMirrorHarness({
      catalog: [
        {
          produtoId: 'PROD-2',
          nome: 'Café Premium',
          unidade: 'UN',
          valorUnitario: 12.5
        }
      ]
    });

  const enriched =
    controller
      .enrichDraftWithOfflineReferences({
        products: [
          {
            name: ' cafe   premium ',
            quantity: 1,
            unitValue: 12.5
          }
        ]
      });

  assert.equal(
    enriched.products[0]
      .productFiscalId,
    'PROD-2'
  );
});

test('continuity mirror é owner único do draft e dispara failover somente quando navigator está offline', async () => {
  const offline =
    createMirrorHarness({
      browserOnline: false
    });

  assert.equal(
    await offline.controller
      .mirrorOnlineDraft(),
    true
  );

  assert.equal(
    offline.calls.failover,
    1
  );
  assert.equal(
    offline.calls.refreshIdentity,
    0
  );
  assert.equal(
    offline.controller
      .getDraft()
      .browserOnline,
    false
  );

  offline.controller
    .clearDraft();

  assert.equal(
    offline.controller
      .getDraft(),
    null
  );

  const online =
    createMirrorHarness({
      browserOnline: true
    });

  await online.controller
    .mirrorOnlineDraft();

  assert.equal(
    online.calls.failover,
    0
  );
  assert.equal(
    online.calls.refreshIdentity,
    1
  );
});

test('continuity mirror start/stop mantém um timer único, unref e captura inicial', async () => {
  const intervals = [];
  const timeouts = [];
  const cleared = [];
  let captures = 0;

  const frame = {
    async executeJavaScript() {
      captures += 1;
      return JSON.stringify({
        mode: 'native',
        draft: {
          browserOnline: true,
          products: []
        }
      });
    }
  };

  const timer = {
    unrefCalls: 0,
    unref() {
      this.unrefCalls += 1;
    }
  };

  const controller =
    createContinuityMirrorController({
      intervalMs: 500,
      getMainWindow() {
        return {
          webContents: {},
          isDestroyed() {
            return false;
          }
        };
      },
      async findPdvContinuityFrame() {
        return frame;
      },
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
        return null;
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
      setIntervalFn(callback, ms) {
        intervals.push({
          callback,
          ms
        });
        return timer;
      },
      clearIntervalFn(value) {
        cleared.push(value);
      },
      setTimeoutFn(callback, ms) {
        timeouts.push({
          callback,
          ms
        });
        return 1;
      }
    });

  controller.start();
  controller.start();

  assert.equal(
    intervals.length,
    1
  );
  assert.equal(
    intervals[0].ms,
    500
  );
  assert.equal(
    timer.unrefCalls,
    1
  );
  assert.equal(
    timeouts.length,
    1
  );
  assert.equal(
    timeouts[0].ms,
    100
  );

  timeouts[0].callback();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(
    captures,
    1
  );

  controller.stop();
  controller.stop();

  assert.deepEqual(
    cleared,
    [timer]
  );
});

function createRecoveryHarness({
  offlineReady = true,
  activeSale = true,
  clearResult = 'RESTORED'
} = {}) {
  const calls = {
    onlineScripts: [],
    offlineScripts: [],
    logs: []
  };

  const onlineFrame = {
    async executeJavaScript(script) {
      calls.onlineScripts.push(script);
      return clearResult;
    }
  };

  const offlineFrame = {
    async executeJavaScript(script) {
      calls.offlineScripts.push(script);

      if (
        script.includes(
          '__scfPdvHasActiveContinuitySale'
        )
      ) {
        return activeSale;
      }

      return true;
    }
  };

  const onlineWindow = {
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

  const controller =
    createContinuityRecoveryController({
      getMainWindow() {
        return onlineWindow;
      },
      getOfflineView() {
        return offlineView;
      },
      isOfflineViewReady() {
        return offlineReady;
      },
      async findPdvContinuityFrame(
        webContents
      ) {
        return webContents.kind ===
          'online'
          ? onlineFrame
          : offlineFrame;
      },
      log(...args) {
        calls.logs.push(args);
      }
    });

  return {
    controller,
    calls
  };
}

test('continuity recovery restaura exatamente o draft no renderer offline', async () => {
  const h =
    createRecoveryHarness();

  const draft = {
    version: 1,
    saleNumber: '77',
    products: [
      {
        productFiscalId: 'P-1',
        quantity: 2
      }
    ],
    paymentContinuity: {
      selectedMethod: 'PIX'
    }
  };

  assert.equal(
    await h.controller
      .restoreOfflineDraft(
        draft
      ),
    true
  );

  assert.equal(
    h.calls.offlineScripts
      .length,
    1
  );

  assert.match(
    h.calls.offlineScripts[0],
    /__scfPdvRestoreContinuityDraft/
  );

  assert.match(
    h.calls.offlineScripts[0],
    /"saleNumber":"77"/
  );
});

test('continuity recovery consulta venda ativa apenas no frame offline pronto', async () => {
  const ready =
    createRecoveryHarness({
      activeSale: true
    });

  assert.equal(
    await ready.controller
      .hasActiveOfflineSale(),
    true
  );

  const notReady =
    createRecoveryHarness({
      offlineReady: false
    });

  assert.equal(
    await notReady.controller
      .hasActiveOfflineSale(),
    false
  );

  assert.equal(
    notReady.calls.offlineScripts
      .length,
    0
  );
});

test('continuity recovery limpa carrinho online pelo restore nativo e preserva fallback CANCELLED', async () => {
  const restored =
    createRecoveryHarness({
      clearResult: 'RESTORED'
    });

  assert.equal(
    await restored.controller
      .clearOnlineDraft(),
    true
  );

  assert.match(
    restored.calls.onlineScripts[0],
    /__scfPdvRestoreContinuityDraft/
  );

  const cancelled =
    createRecoveryHarness({
      clearResult: 'CANCELLED'
    });

  assert.equal(
    await cancelled.controller
      .clearOnlineDraft(),
    true
  );

  assert.equal(
    cancelled.calls.logs.some(
      item =>
        item[0] ===
          'OFFLINE CONTINUITY ONLINE CLEAR FALLBACK'
    ),
    true
  );
});


test('enriquecimento preserva paymentContinuity e não muta o draft de entrada', () => {
  const {
    controller
  } =
    createMirrorHarness({
      catalog: [
        {
          produtoId: 'PROD-9',
          codigo: '009',
          nome: 'Produto Nove',
          unidade: 'UN',
          valorUnitario: 9
        }
      ]
    });

  const paymentContinuity = {
    selectedMethod: 'PIX',
    editingMethod: 'PIX',
    flowMode: 'METHOD',
    methodAmount: 9,
    cashReceived: 0,
    paymentParts: [
      {
        method: 'PIX',
        amount: 9
      }
    ]
  };

  const input = {
    products: [
      {
        productCode: '009',
        name: 'Produto Nove',
        quantity: 1,
        unitValue: 9
      }
    ],
    currentProduct: null,
    paymentContinuity
  };

  const enriched =
    controller
      .enrichDraftWithOfflineReferences(
        input
      );

  assert.notEqual(
    enriched,
    input
  );

  assert.equal(
    input.products[0].productFiscalId,
    undefined
  );

  assert.deepEqual(
    enriched.paymentContinuity,
    paymentContinuity
  );

  assert.equal(
    enriched.products[0].productFiscalId,
    'PROD-9'
  );
});

test('continuity recovery falha fechado quando restore local não está pronto ou clear online é unsupported', async () => {
  const notReady =
    createRecoveryHarness({
      offlineReady: false
    });

  assert.equal(
    await notReady.controller
      .restoreOfflineDraft({
        version: 1,
        products: []
      }),
    false
  );

  assert.equal(
    notReady.calls.offlineScripts.length,
    0
  );

  const unsupported =
    createRecoveryHarness({
      clearResult: 'UNSUPPORTED'
    });

  assert.equal(
    await unsupported.controller
      .clearOnlineDraft(),
    false
  );
});
