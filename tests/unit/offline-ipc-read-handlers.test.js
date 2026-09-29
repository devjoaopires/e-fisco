'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  IPC_CHANNEL_AUTHORIZATION_POLICY
} = require('../../desktop/security/ipc-authorization');

const {
  OFFLINE_READ_CHANNELS,
  registerOfflineReadHandlers
} = require('../../desktop/ipc/offline-handlers');

function buildHarness({
  authorized = true
} = {}) {
  const handlers = new Map();
  const calls = {
    auth: [],
    productFind: [],
    companyHeader: 0,
    productsList: [],
    customersList: [],
    crediariosList: [],
    crediarioDetail: [],
    cashConsult: [],
    salesFinance: [],
    cashMovements: []
  };
  const logs = [];

  const ipcMain = {
    handle(channel, handler) {
      assert.equal(
        handlers.has(channel),
        false,
        'canal registrado mais de uma vez: ' + channel
      );
      handlers.set(channel, handler);
    }
  };

  registerOfflineReadHandlers({
    ipcMain,
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
    resolveOfflineReferenceEmpresaId() {
      return 'EMP-1';
    },
    findOfflineProductForSale(input) {
      calls.productFind.push(input);
      return {
        id: 'PROD-1',
        ...input
      };
    },
    getOfflineCompanyHeader() {
      calls.companyHeader += 1;
      return {
        empresaId: 'EMP-1',
        nome: 'Empresa Teste'
      };
    },
    listOfflineProductsForSale(input) {
      calls.productsList.push(input);
      return [
        {
          id: 'PROD-1'
        }
      ];
    },
    listOfflineCustomersForCrediario(input) {
      calls.customersList.push(input);
      return [
        {
          id: 'CLI-1'
        }
      ];
    },
    listOfflineCrediariosForF5(input) {
      calls.crediariosList.push(input);
      return [
        {
          id: 'CR-1'
        }
      ];
    },
    getOfflineCrediarioDetailForF5(input) {
      calls.crediarioDetail.push(input);
      return {
        id: input.crediarioId || 'CR-1'
      };
    },
    consultCashOffline(input) {
      calls.cashConsult.push(input);
      return {
        caixa: {
          resumo: {
            movimentos: [
              {
                tipo: 'SUPRIMENTO',
                valor: 10
              },
              {
                tipo: 'VENDA_PAGA',
                valor: 20
              },
              {
                tipo:
                  'CREDIARIO_RECEBIMENTO',
                valor: 30
              }
            ]
          }
        }
      };
    },
    listOfflineSalesForFinance(input) {
      calls.salesFinance.push(input);
      return {
        items: [
          {
            saleId: 'SALE-1'
          }
        ],
        total: 1
      };
    },
    listCashMovements(input) {
      calls.cashMovements.push(input);
      return [
        {
          movementId: 'M-1',
          sessionId: 'CX-1',
          movementType: 'SUPRIMENTO',
          direction: 1,
          amountCentavos: 1000,
          payload: {
            motivo: 'Troco',
            operadorNome: 'Operador 1',
            operadorId: 'OP-1'
          },
          occurredAt:
            '2026-09-26T12:00:00.000Z'
        },
        {
          movementId: 'M-2',
          sessionId: 'CX-1',
          movementType: 'VENDA_PAGA',
          direction: 1,
          amountCentavos: 2000,
          payload: {},
          occurredAt:
            '2026-09-26T12:05:00.000Z'
        },
        {
          movementId: 'M-3',
          sessionId: 'CX-1',
          movementType:
            'CREDIARIO_RECEBIMENTO',
          direction: 1,
          amountCentavos: 3000,
          payload: {},
          occurredAt:
            '2026-09-26T12:10:00.000Z'
        }
      ];
    }
  });

  return {
    handlers,
    calls,
    logs
  };
}

test('M07 cobre exatamente os oito canais com capability OFFLINE_READ', () => {
  const expected =
    Object.entries(
      IPC_CHANNEL_AUTHORIZATION_POLICY
    )
      .filter(
        ([, value]) =>
          value.capability ===
            'OFFLINE_READ'
      )
      .map(([channel]) => channel)
      .sort();

  assert.deepEqual(
    [...OFFLINE_READ_CHANNELS]
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

test('todos os read handlers falham fechado antes de tocar dependências', async () => {
  const h = buildHarness({
    authorized: false
  });

  for (const channel of OFFLINE_READ_CHANNELS) {
    const result =
      await h.handlers.get(channel)(
        { id: 'event' },
        {
          query: 'teste'
        }
      );

    assert.equal(
      result.ok,
      false,
      channel
    );
  }

  assert.equal(
    h.calls.productFind.length,
    0
  );
  assert.equal(
    h.calls.companyHeader,
    0
  );
  assert.equal(
    h.calls.productsList.length,
    0
  );
  assert.equal(
    h.calls.customersList.length,
    0
  );
  assert.equal(
    h.calls.crediariosList.length,
    0
  );
  assert.equal(
    h.calls.crediarioDetail.length,
    0
  );
  assert.equal(
    h.calls.cashConsult.length,
    0
  );
  assert.equal(
    h.calls.salesFinance.length,
    0
  );
  assert.equal(
    h.calls.cashMovements.length,
    0
  );

  assert.equal(
    h.calls.auth.length,
    OFFLINE_READ_CHANNELS.length
  );

  assert.equal(
    h.calls.auth.every(
      item =>
        item.transport === 'invoke'
    ),
    true
  );
});

test('consultas de referência preservam empresa autenticada e envelopes', async () => {
  const h = buildHarness();

  assert.deepEqual(
    await h.handlers
      .get('efisco:offline-product-find')(
        {},
        {
          codigo: '123'
        }
      ),
    {
      ok: true,
      result: {
        id: 'PROD-1',
        codigo: '123',
        empresaId: 'EMP-1'
      }
    }
  );

  assert.deepEqual(
    h.calls.productFind,
    [
      {
        codigo: '123',
        empresaId: 'EMP-1'
      }
    ]
  );

  const header =
    await h.handlers
      .get('efisco:offline-company-header')(
        {}
      );

  assert.equal(
    header.result.empresaId,
    'EMP-1'
  );

  await h.handlers
    .get('efisco:offline-products-list')(
      {}
    );

  assert.deepEqual(
    h.calls.productsList,
    [
      {
        empresaId: 'EMP-1'
      }
    ]
  );

  await h.handlers
    .get('efisco:offline-customers-list')(
      {},
      {
        query: 'Maria'
      }
    );

  await h.handlers
    .get('efisco:offline-crediarios-list')(
      {},
      {
        page: 2
      }
    );

  await h.handlers
    .get('efisco:offline-crediario-detail')(
      {},
      {
        crediarioId: 'CR-99'
      }
    );

  assert.deepEqual(
    h.calls.customersList,
    [
      {
        query: 'Maria'
      }
    ]
  );
  assert.deepEqual(
    h.calls.crediariosList,
    [
      {
        page: 2
      }
    ]
  );
  assert.deepEqual(
    h.calls.crediarioDetail,
    [
      {
        crediarioId: 'CR-99'
      }
    ]
  );
});

test('cash-consult preserva payload e força empresa autenticada', async () => {
  const h = buildHarness();

  const result =
    await h.handlers
      .get('efisco:offline-cash-consult')(
        {},
        {
          incluirResumo: false,
          empresaId: 'IGNORAR'
        }
      );

  assert.equal(
    result.ok,
    true
  );
  assert.deepEqual(
    h.calls.cashConsult,
    [
      {
        incluirResumo: false,
        empresaId: 'EMP-1'
      }
    ]
  );
});

test('finance snapshot preserva shape e remove venda/crediário dos movimentos de caixa', async () => {
  const h = buildHarness();

  const result =
    await h.handlers
      .get('efisco:offline-finance-snapshot')(
        {},
        {
          limit: 50
        }
      );

  assert.equal(
    result.ok,
    true
  );

  assert.deepEqual(
    h.calls.salesFinance,
    [
      {
        limit: 50,
        empresaId: 'EMP-1'
      }
    ]
  );

  assert.deepEqual(
    h.calls.cashMovements,
    [
      {
        empresaId: 'EMP-1',
        limit: 5000
      }
    ]
  );

  assert.deepEqual(
    result.result.items,
    [
      {
        saleId: 'SALE-1'
      }
    ]
  );

  assert.deepEqual(
    result.result.movimentosCaixa,
    [
      {
        tipo: 'SUPRIMENTO',
        valor: 10
      }
    ]
  );

  assert.equal(
    result.result
      .movimentosCaixaHistoricoFinanceiro
      .length,
    1
  );

  assert.equal(
    result.result
      .movimentosCaixaHistoricoFinanceiro[0]
      .tipo,
    'SUPRIMENTO'
  );

  assert.deepEqual(
    result.result.evolucaoSaldo7Dias,
    {
      pontos: []
    }
  );
});

test('erro de read handler mantém envelope e log do canal', async () => {
  const handlers = new Map();
  const logs = [];

  registerOfflineReadHandlers({
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    isIpcChannelAuthorized() {
      return true;
    },
    log(...args) {
      logs.push(args);
    },
    resolveOfflineReferenceEmpresaId() {
      throw new Error('empresa indisponível');
    },
    findOfflineProductForSale() {},
    getOfflineCompanyHeader() {},
    listOfflineProductsForSale() {},
    listOfflineCustomersForCrediario() {},
    listOfflineCrediariosForF5() {},
    getOfflineCrediarioDetailForF5() {},
    consultCashOffline() {},
    listOfflineSalesForFinance() {},
    listCashMovements() {}
  });

  const result =
    await handlers
      .get('efisco:offline-product-find')(
        {},
        {}
      );

  assert.deepEqual(
    result,
    {
      ok: false,
      error:
        'empresa indisponível'
    }
  );

  assert.equal(
    logs[0][0],
    'ERRO IPC OFFLINE PRODUCT'
  );
});
