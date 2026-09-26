'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  initializeOfflineDatabase,
  getOfflineDatabase,
  closeOfflineDatabase,
  upsertProductCache,
  upsertCustomerCache,
  registerStockMovement,
  getStockProjection,
  listStockMovements,
  openCashSession,
  getCashSession,
  getOpenCashSession,
  registerCashMovement,
  listCashMovements,
  listFinancialMovements,
  openCrediarioOfflineAtomic,
  getCrediarioDetailCache,
  registerOfflineSaleAtomic,
  getSaleById,
  enqueueOutboxOperation,
  getOutboxOperation,
  claimOutboxOperation,
  markOutboxRetry
} = require('../../offline-db');

const {
  withTempDir
} = require('../helpers/temp-dir');

const EMPRESA_ID = 'empresa-persist';

function seedReferenceData() {
  const products = [
    ['produto-stock', 'Produto estoque', 2500],
    ['produto-sale', 'Produto venda', 400],
    ['produto-cred', 'Produto crediário', 500]
  ];

  for (const [produtoId, descricao, precoCentavos] of products) {
    upsertProductCache({
      empresaId: EMPRESA_ID,
      produtoId,
      codigo: produtoId.toUpperCase(),
      descricao,
      unidade: 'UN',
      precoCentavos,
      ativo: true,
      payload: {
        quantidadeEstoque: 100,
        source: 'step54'
      }
    });
  }

  upsertCustomerCache({
    empresaId: EMPRESA_ID,
    clienteId: 'cliente-persist',
    nome: 'Cliente Persistência',
    documento: '12345678901',
    telefone: '94999990000',
    ativo: true,
    payload: {
      source: 'step54'
    }
  });
}

function writePersistentScenario() {
  seedReferenceData();

  const stock = registerStockMovement({
    empresaId: EMPRESA_ID,
    movementId: 'stock-movement-persist',
    operationId: 'op-stock-persist',
    produtoId: 'produto-stock',
    direction: 'ENTRADA',
    quantidade: '2.5',
    movementType: 'AJUSTE_ENTRADA',
    sourceId: 'source-stock-persist',
    occurredAt: '2026-09-25T09:00:00.000Z',
    payload: {
      reason: 'step54'
    }
  });
  assert.equal(stock.applied, true);
  assert.equal(stock.saldoProjetado, '2.5');

  const cash = openCashSession({
    empresaId: EMPRESA_ID,
    sessionId: 'cash-persist',
    operationId: 'op-cash-open-persist',
    openingBalanceCentavos: 2500,
    openedAt: '2026-09-25T09:10:00.000Z',
    payload: {
      source: 'step54'
    }
  });
  assert.equal(cash.applied, true);

  const supply = registerCashMovement({
    empresaId: EMPRESA_ID,
    movementId: 'cash-supply-persist',
    operationId: 'op-cash-supply-persist',
    sessionId: 'cash-persist',
    direction: 1,
    amountCentavos: 700,
    movementType: 'SUPRIMENTO',
    sourceId: 'source-cash-persist',
    occurredAt: '2026-09-25T09:15:00.000Z',
    payload: {
      source: 'step54'
    }
  });
  assert.equal(supply.applied, true);

  const crediario = openCrediarioOfflineAtomic({
    empresaId: EMPRESA_ID,
    crediarioId: 'cred-persist',
    contaReceberId: 'conta-persist',
    operationId: 'op-cred-open-persist',
    clienteId: 'cliente-persist',
    clienteNome: 'Cliente Persistência',
    cpf: '12345678901',
    whatsapp: '94999990000',
    vencimento: '2026-12-31',
    occurredAt: '2026-09-25T09:20:00.000Z',
    totalCentavos: 1000,
    items: [{
      crediarioItemId: 'cred-item-persist',
      produtoId: 'produto-cred',
      quantity: 2,
      unitValue: 5,
      totalValue: 10,
      description: 'Produto crediário',
      unit: 'UN'
    }],
    payload: {
      source: 'step54'
    }
  });
  assert.equal(crediario.applied, true);

  const sale = registerOfflineSaleAtomic({
    empresaId: EMPRESA_ID,
    saleId: 'sale-persist',
    operationId: 'op-sale-persist',
    clienteId: 'cliente-persist',
    status: 'PAID_OFFLINE_PENDING_SYNC',
    totalCentavos: 600,
    occurredAt: '2026-09-25T09:30:00.000Z',
    paymentMethod: 'DINHEIRO',
    paymentParts: [{
      method: 'DINHEIRO',
      amount: 6
    }],
    items: [{
      itemId: 'sale-item-persist',
      produtoId: 'produto-sale',
      quantidade: '1.5',
      unitPriceCentavos: 400,
      totalCentavos: 600,
      payload: {
        source: 'step54'
      }
    }],
    cashMovements: [{
      movementId: 'cash-sale-persist',
      operationId: 'op-cash-sale-persist',
      sessionId: 'cash-persist',
      direction: 1,
      amountCentavos: 600,
      movementType: 'VENDA_PAGA',
      sourceId: 'sale-persist',
      occurredAt: '2026-09-25T09:30:00.000Z',
      payload: {
        paymentMethod: 'DINHEIRO'
      }
    }],
    financialMovements: [{
      movementId: 'financial-sale-persist',
      operationId: 'op-financial-sale-persist',
      accountId: 'DINHEIRO',
      direction: 1,
      amountCentavos: 600,
      movementType: 'VENDA_PAGA',
      sourceId: 'sale-persist',
      occurredAt: '2026-09-25T09:30:00.000Z',
      payload: {
        source: 'step54'
      }
    }],
    dependencies: [],
    payload: {
      source: 'step54'
    }
  });
  assert.equal(sale.applied, true);

  const genericOutbox = enqueueOutboxOperation({
    empresaId: EMPRESA_ID,
    operationId: 'op-generic-retry-persist',
    type: 'PERSISTENCE_TEST',
    entityId: 'entity-persist',
    payload: {
      nested: {
        ok: true
      }
    },
    dependencies: [],
    createdAt: '2026-09-25T09:40:00.000Z'
  });
  assert.equal(genericOutbox.applied, true);

  const claimed = claimOutboxOperation({
    empresaId: EMPRESA_ID,
    operationId: 'op-generic-retry-persist',
    startedAt: '2026-09-25T09:41:00.000Z',
    referenceAt: '2026-09-25T09:41:00.000Z'
  });
  assert.equal(claimed.claimed, true);

  const retry = markOutboxRetry({
    empresaId: EMPRESA_ID,
    operationId: 'op-generic-retry-persist',
    error: 'falha temporária step54',
    nextAttemptAt: '2026-09-25T09:50:00.000Z',
    updatedAt: '2026-09-25T09:42:00.000Z'
  });
  assert.equal(retry.changed, true);
}

function captureDomainSnapshot() {
  return {
    stock: {
      directProjection: getStockProjection(
        EMPRESA_ID,
        'produto-stock'
      ),
      saleProjection: getStockProjection(
        EMPRESA_ID,
        'produto-sale'
      ),
      crediarioProjection: getStockProjection(
        EMPRESA_ID,
        'produto-cred'
      ),
      movements: listStockMovements({
        empresaId: EMPRESA_ID,
        limit: 50
      })
    },
    cash: {
      session: getCashSession(
        EMPRESA_ID,
        'cash-persist'
      ),
      openSession: getOpenCashSession(EMPRESA_ID),
      movements: listCashMovements({
        empresaId: EMPRESA_ID,
        sessionId: 'cash-persist',
        limit: 50
      })
    },
    financial: listFinancialMovements({
      empresaId: EMPRESA_ID,
      limit: 50
    }),
    sale: getSaleById(
      EMPRESA_ID,
      'sale-persist'
    ),
    crediario: getCrediarioDetailCache({
      empresaId: EMPRESA_ID,
      crediarioId: 'cred-persist'
    }),
    outbox: {
      sale: getOutboxOperation(
        EMPRESA_ID,
        'op-sale-persist'
      ),
      crediario: getOutboxOperation(
        EMPRESA_ID,
        'op-cred-open-persist'
      ),
      retry: getOutboxOperation(
        EMPRESA_ID,
        'op-generic-retry-persist'
      )
    }
  };
}

test('estoque, caixa, venda, crediário e outbox persistem após close e reopen', async () => {
  await withTempDir(async (userDataDir) => {
    let beforeClose;

    try {
      const first = initializeOfflineDatabase({ userDataDir });
      assert.equal(first.reused, false);

      writePersistentScenario();
      beforeClose = captureDomainSnapshot();

      assert.equal(
        beforeClose.stock.directProjection.quantidade,
        '2.5'
      );
      assert.equal(
        beforeClose.stock.saleProjection.quantidade,
        '-1.5'
      );
      assert.equal(
        beforeClose.stock.crediarioProjection.quantidade,
        '-2'
      );

      assert.equal(beforeClose.cash.session.status, 'OPEN');
      assert.equal(beforeClose.cash.movements.length, 2);
      assert.equal(beforeClose.financial.length, 1);

      assert.equal(beforeClose.sale.totalCentavos, 600);
      assert.equal(beforeClose.sale.items.length, 1);
      assert.equal(beforeClose.sale.items[0].quantidade, '1.5');

      assert.equal(beforeClose.crediario.conta.crediarioId, 'cred-persist');
      assert.equal(beforeClose.crediario.itens.length, 1);

      assert.equal(beforeClose.outbox.sale.status, 'PENDING');
      assert.equal(beforeClose.outbox.crediario.status, 'PENDING');
      assert.equal(beforeClose.outbox.retry.status, 'RETRY');
      assert.equal(beforeClose.outbox.retry.attempts, 1);
      assert.equal(
        beforeClose.outbox.retry.nextAttemptAt,
        '2026-09-25T09:50:00.000Z'
      );
      assert.equal(
        beforeClose.outbox.retry.lastError,
        'falha temporária step54'
      );
    } finally {
      closeOfflineDatabase();
    }

    try {
      const reopened = initializeOfflineDatabase({ userDataDir });
      assert.equal(reopened.reused, false);

      const afterReopen = captureDomainSnapshot();

      assert.deepEqual(afterReopen, beforeClose);

      const integrity = getOfflineDatabase()
        .prepare('PRAGMA integrity_check')
        .get();

      assert.equal(
        String(Object.values(integrity)[0]).toLowerCase(),
        'ok'
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-step54-persistence-');
});

test('chaves de idempotência persistem e continuam bloqueando duplicação após reopen', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });
      writePersistentScenario();
    } finally {
      closeOfflineDatabase();
    }

    try {
      initializeOfflineDatabase({ userDataDir });

      const stockDuplicate = registerStockMovement({
        empresaId: EMPRESA_ID,
        movementId: 'stock-movement-persist',
        operationId: 'op-stock-persist',
        produtoId: 'produto-stock',
        direction: 'ENTRADA',
        quantidade: '2.5',
        movementType: 'AJUSTE_ENTRADA',
        sourceId: 'source-stock-persist',
        occurredAt: '2026-09-25T09:00:00.000Z',
        payload: {
          reason: 'step54'
        }
      });
      assert.equal(stockDuplicate.applied, false);
      assert.equal(stockDuplicate.duplicate, true);

      const cashDuplicate = registerCashMovement({
        empresaId: EMPRESA_ID,
        movementId: 'cash-supply-persist',
        operationId: 'op-cash-supply-persist',
        sessionId: 'cash-persist',
        direction: 1,
        amountCentavos: 700,
        movementType: 'SUPRIMENTO',
        sourceId: 'source-cash-persist',
        occurredAt: '2026-09-25T09:15:00.000Z',
        payload: {
          source: 'step54'
        }
      });
      assert.equal(cashDuplicate.applied, false);
      assert.equal(cashDuplicate.duplicate, true);

      const crediarioDuplicate = openCrediarioOfflineAtomic({
        empresaId: EMPRESA_ID,
        crediarioId: 'cred-persist',
        contaReceberId: 'conta-persist',
        operationId: 'op-cred-open-persist',
        clienteId: 'cliente-persist',
        clienteNome: 'Cliente Persistência',
        cpf: '12345678901',
        whatsapp: '94999990000',
        vencimento: '2026-12-31',
        occurredAt: '2026-09-25T09:20:00.000Z',
        totalCentavos: 1000,
        items: [{
          crediarioItemId: 'cred-item-persist',
          produtoId: 'produto-cred',
          quantity: 2,
          unitValue: 5,
          totalValue: 10,
          description: 'Produto crediário',
          unit: 'UN'
        }],
        payload: {
          source: 'step54'
        }
      });
      assert.equal(crediarioDuplicate.applied, false);
      assert.equal(crediarioDuplicate.duplicate, true);

      const saleDuplicate = registerOfflineSaleAtomic({
        empresaId: EMPRESA_ID,
        saleId: 'sale-persist',
        operationId: 'op-sale-persist',
        clienteId: 'cliente-persist',
        status: 'PAID_OFFLINE_PENDING_SYNC',
        totalCentavos: 600,
        occurredAt: '2026-09-25T09:30:00.000Z',
        paymentMethod: 'DINHEIRO',
        paymentParts: [{
          method: 'DINHEIRO',
          amount: 6
        }],
        items: [{
          itemId: 'sale-item-persist',
          produtoId: 'produto-sale',
          quantidade: '1.5',
          unitPriceCentavos: 400,
          totalCentavos: 600,
          payload: {
            source: 'step54'
          }
        }],
        payload: {
          source: 'step54'
        }
      });
      assert.equal(saleDuplicate.applied, false);
      assert.equal(saleDuplicate.duplicate, true);

      const genericDuplicate = enqueueOutboxOperation({
        empresaId: EMPRESA_ID,
        operationId: 'op-generic-retry-persist',
        type: 'PERSISTENCE_TEST',
        entityId: 'entity-persist',
        payload: {
          nested: {
            ok: true
          }
        },
        dependencies: [],
        createdAt: '2026-09-25T09:40:00.000Z'
      });
      assert.equal(genericDuplicate.applied, false);
      assert.equal(genericDuplicate.duplicate, true);

      assert.equal(
        getStockProjection(
          EMPRESA_ID,
          'produto-stock'
        ).quantidade,
        '2.5'
      );

      assert.equal(
        listCashMovements({
          empresaId: EMPRESA_ID,
          sessionId: 'cash-persist',
          limit: 50
        }).length,
        2
      );

      assert.equal(
        getOutboxOperation(
          EMPRESA_ID,
          'op-generic-retry-persist'
        ).status,
        'RETRY'
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-step54-idempotency-');
});
