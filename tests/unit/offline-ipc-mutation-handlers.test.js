'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  IPC_CHANNEL_AUTHORIZATION_POLICY
} = require('../../desktop/security/ipc-authorization');

const {
  OFFLINE_MUTATION_CHANNELS,
  registerOfflineMutationHandlers
} = require('../../desktop/ipc/offline-handlers');

function buildHarness({
  authorized = true,
  syncIdentity = {
    deviceId: 'DEV-1',
    deviceToken: 'TOKEN-1',
    empresaId: 'EMP-1'
  }
} = {}) {
  const handlers = new Map();
  const logs = [];
  const db = {
    tag: 'offline-db'
  };
  const safeStorage = {
    tag: 'safe-storage'
  };
  const calls = {
    auth: [],
    assertMutation: 0,
    buildCrediario: [],
    openCrediario: [],
    updateCrediario: [],
    withOperator: [],
    cashOpen: [],
    cashMovement: [],
    cashClose: [],
    getOfflineDatabase: 0,
    getSyncIdentity: 0,
    getOrCreateDeviceId: [],
    salePaid: [],
    resolveEmpresa: 0,
    getUserDataDir: 0
  };

  registerOfflineMutationHandlers({
    ipcMain: {
      handle(channel, handler) {
        assert.equal(
          handlers.has(channel),
          false,
          'canal registrado mais de uma vez: ' +
            channel
        );
        handlers.set(
          channel,
          handler
        );
      }
    },
    isIpcChannelAuthorized(
      event,
      channel,
      transport
    ) {
      calls.auth.push({
        event,
        channel,
        transport
      });
      return authorized;
    },
    log(...args) {
      logs.push(args);
    },
    assertOfflineMutationAuthorized() {
      calls.assertMutation += 1;
    },
    buildOfflineCrediarioAtomicInput(
      input
    ) {
      calls.buildCrediario.push(
        input
      );

      return {
        ...input,
        crediarioId: 'CR-1',
        contaReceberId: 'AR-1'
      };
    },
    openCrediarioOfflineAtomic(
      input
    ) {
      calls.openCrediario.push(
        input
      );

      return {
        transactionId: 'TX-1'
      };
    },
    updateOfflineCrediarioItemsForF5(
      input
    ) {
      calls.updateCrediario.push(
        input
      );

      return {
        updated: true,
        input
      };
    },
    openCashOffline(input) {
      calls.cashOpen.push(input);

      return {
        opened: true,
        input
      };
    },
    registerCashMovementOffline(
      input
    ) {
      calls.cashMovement.push(
        input
      );

      return {
        moved: true,
        input
      };
    },
    closeCashOffline(input) {
      calls.cashClose.push(input);

      return {
        closed: true,
        input
      };
    },
    withAuthenticatedOfflineOperator(
      input
    ) {
      calls.withOperator.push(
        input
      );

      return {
        ...(input || {}),
        operadorId: 'OP-1',
        operadorNome: 'Operador'
      };
    },
    getOfflineDatabase() {
      calls.getOfflineDatabase += 1;
      return db;
    },
    getOfflineSyncIdentity() {
      calls.getSyncIdentity += 1;
      return syncIdentity;
    },
    getOrCreateSyncDeviceId(input) {
      calls.getOrCreateDeviceId.push(
        input
      );
      return 'DEV-FALLBACK';
    },
    registerPaidSaleOffline(
      sale,
      options
    ) {
      calls.salePaid.push({
        sale,
        options
      });

      return {
        saleId: 'SALE-1',
        queued: true
      };
    },
    resolveOfflineReferenceEmpresaId() {
      calls.resolveEmpresa += 1;
      return 'EMP-1';
    },
    getUserDataDir() {
      calls.getUserDataDir += 1;
      return 'C:\\efisco\\user-data';
    },
    safeStorage
  });

  return {
    handlers,
    logs,
    calls,
    db,
    safeStorage
  };
}

test('M08 cobre exatamente os seis canais OFFLINE_MUTATION', () => {
  const expected =
    Object.entries(
      IPC_CHANNEL_AUTHORIZATION_POLICY
    )
      .filter(
        ([, value]) =>
          value.capability ===
            'OFFLINE_MUTATION'
      )
      .map(([channel]) => channel)
      .sort();

  assert.deepEqual(
    [...OFFLINE_MUTATION_CHANNELS]
      .sort(),
    expected
  );

  const h = buildHarness();

  assert.deepEqual(
    [...h.handlers.keys()]
      .sort(),
    expected
  );
});

test('mutation handlers falham fechado antes de autorização de domínio ou persistência', async () => {
  const h = buildHarness({
    authorized: false
  });

  for (
    const channel of
    OFFLINE_MUTATION_CHANNELS
  ) {
    const result =
      await h.handlers.get(channel)(
        { id: 'event' },
        {
          sale: {
            saleId: 'SALE-X'
          }
        }
      );

    assert.equal(
      result.ok,
      false,
      channel
    );
  }

  assert.equal(
    h.calls.auth.length,
    OFFLINE_MUTATION_CHANNELS.length
  );

  assert.equal(
    h.calls.auth.every(
      item =>
        item.transport === 'invoke'
    ),
    true
  );

  assert.equal(
    h.calls.assertMutation,
    0
  );
  assert.equal(
    h.calls.openCrediario.length,
    0
  );
  assert.equal(
    h.calls.updateCrediario.length,
    0
  );
  assert.equal(
    h.calls.cashOpen.length,
    0
  );
  assert.equal(
    h.calls.cashMovement.length,
    0
  );
  assert.equal(
    h.calls.cashClose.length,
    0
  );
  assert.equal(
    h.calls.salePaid.length,
    0
  );
});

test('crediario-open preserva input atômico e envelope de sincronização pendente', async () => {
  const h = buildHarness();

  const result =
    await h.handlers
      .get('efisco:offline-crediario-open')(
        {},
        {
          sale: {
            saleId: 'SALE-10',
            total: 42
          }
        }
      );

  assert.deepEqual(
    h.calls.buildCrediario,
    [
      {
        saleId: 'SALE-10',
        total: 42
      }
    ]
  );

  assert.equal(
    h.calls.openCrediario.length,
    1
  );

  assert.equal(
    result.ok,
    true
  );
  assert.deepEqual(
    result.result,
    {
      transactionId: 'TX-1',
      crediarioId: 'CR-1',
      contaReceberId: 'AR-1',
      offline: true,
      syncPendente: true
    }
  );

  assert.equal(
    h.calls.assertMutation,
    1
  );
});

test('crediario-items-update preserva payload e autorização de mutação', async () => {
  const h = buildHarness();

  const payload = {
    crediarioId: 'CR-7',
    items: [
      {
        produtoId: 'P-1',
        quantidade: 2
      }
    ]
  };

  const result =
    await h.handlers
      .get(
        'efisco:offline-crediario-items-update'
      )(
        {},
        payload
      );

  assert.equal(result.ok, true);
  assert.deepEqual(
    h.calls.updateCrediario,
    [payload]
  );
  assert.equal(
    h.calls.assertMutation,
    1
  );
});

test('caixa open/movement/close continuam vinculando operador autenticado antes do serviço', async () => {
  const h = buildHarness();

  const cases = [
    [
      'efisco:offline-cash-open',
      'cashOpen'
    ],
    [
      'efisco:offline-cash-movement',
      'cashMovement'
    ],
    [
      'efisco:offline-cash-close',
      'cashClose'
    ]
  ];

  for (const [channel, callKey] of cases) {
    const payload = {
      valor: 10,
      empresaId: 'IGNORAR'
    };

    const result =
      await h.handlers.get(channel)(
        {},
        payload
      );

    assert.equal(
      result.ok,
      true,
      channel
    );

    assert.equal(
      h.calls[callKey].at(-1)
        .operadorId,
      'OP-1',
      channel
    );
  }

  assert.equal(
    h.calls.withOperator.length,
    3
  );
  assert.equal(
    h.calls.assertMutation,
    3
  );
});

test('venda paga preserva device atual, empresa, userDataDir, safeStorage e contingência fiscal obrigatória', async () => {
  const h = buildHarness();

  const result =
    await h.handlers
      .get('efisco:offline-sale-paid')(
        {},
        {
          sale: {
            saleId: 'SALE-20',
            total: 100
          }
        }
      );

  assert.equal(result.ok, true);
  assert.equal(
    h.calls.salePaid.length,
    1
  );

  const call =
    h.calls.salePaid[0];

  assert.equal(
    call.sale.saleId,
    'SALE-20'
  );
  assert.equal(
    call.sale.operadorId,
    'OP-1'
  );
  assert.deepEqual(
    call.options,
    {
      empresaId: 'EMP-1',
      deviceId: 'DEV-1',
      userDataDir:
        'C:\\efisco\\user-data',
      safeStorage:
        h.safeStorage,
      requireFiscalContingency:
        true
    }
  );

  assert.equal(
    h.calls.getOrCreateDeviceId.length,
    0
  );
});

test('venda paga mantém fallback do deviceId no banco e envelope de erro/log', async () => {
  const h = buildHarness({
    syncIdentity: null
  });

  const ok =
    await h.handlers
      .get('efisco:offline-sale-paid')(
        {},
        {
          sale: {
            saleId: 'SALE-30'
          }
        }
      );

  assert.equal(ok.ok, true);
  assert.equal(
    h.calls.getOrCreateDeviceId.length,
    1
  );
  assert.equal(
    h.calls.getOrCreateDeviceId[0].db,
    h.db
  );
  assert.equal(
    h.calls.salePaid[0]
      .options
      .deviceId,
    'DEV-FALLBACK'
  );

  const handlers = new Map();
  const logs = [];

  registerOfflineMutationHandlers({
    ipcMain: {
      handle(channel, handler) {
        handlers.set(
          channel,
          handler
        );
      }
    },
    isIpcChannelAuthorized() {
      return true;
    },
    log(...args) {
      logs.push(args);
    },
    assertOfflineMutationAuthorized() {
      throw new Error(
        'mutação bloqueada'
      );
    },
    buildOfflineCrediarioAtomicInput() {},
    openCrediarioOfflineAtomic() {},
    updateOfflineCrediarioItemsForF5() {},
    openCashOffline() {},
    registerCashMovementOffline() {},
    closeCashOffline() {},
    withAuthenticatedOfflineOperator() {},
    getOfflineDatabase() {
      return {};
    },
    getOfflineSyncIdentity() {
      return null;
    },
    getOrCreateSyncDeviceId() {
      return 'DEV-X';
    },
    registerPaidSaleOffline() {},
    resolveOfflineReferenceEmpresaId() {
      return 'EMP-1';
    },
    getUserDataDir() {
      return 'C:\\tmp';
    },
    safeStorage: {}
  });

  const denied =
    await handlers
      .get('efisco:offline-cash-open')(
        {},
        {}
      );

  assert.deepEqual(
    denied,
    {
      ok: false,
      error:
        'mutação bloqueada'
    }
  );

  assert.equal(
    logs[0][0],
    'ERRO IPC OFFLINE CASH OPEN'
  );
});
