'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  initializeOfflineDatabase,
  getOfflineDatabase,
  closeOfflineDatabase,
  upsertProductCache,
  upsertCustomerCache,
  openCrediarioOfflineAtomic,
  updateCrediarioItemsOfflineAtomic,
  getCrediarioDetailCache,
  getStockProjection,
  registerOfflineSaleAtomic,
  getSaleById,
  listFinancialMovements,
  enqueueOutboxOperation,
  getOutboxOperation,
  claimOutboxOperation,
  markOutboxRetry
} = require('../../offline-db');

const {
  openCashOffline,
  registerCashMovementOffline
} = require('../../offline-cash-service');

const {
  withTempDir
} = require('../helpers/temp-dir');

function scalarCount(db, sql, ...params) {
  return Number(
    db.prepare(sql).get(...params).count
  );
}

function seedProduct({
  empresaId,
  produtoId,
  quantidadeEstoque = 100
}) {
  upsertProductCache({
    empresaId,
    produtoId,
    codigo: produtoId,
    descricao: 'Produto idempotência',
    unidade: 'UN',
    precoCentavos: 1000,
    ativo: true,
    payload: {
      quantidadeEstoque
    }
  });
}

test('7.5 abertura de caixa repete requestId sem duplicar sessão/outbox e rejeita payload divergente', async () => {
  await withTempDir(async (userDataDir) => {
    const input = {
      empresaId: 'empresa-s75-cash-open',
      requestId: 'open-1',
      saldoInicial: 25,
      fiscalEnvironment: 'HOMOLOGACAO',
      observacao: 'abertura idempotente',
      operadorId: 'op-1'
    };

    let firstOperation;

    try {
      initializeOfflineDatabase({ userDataDir });

      const first = openCashOffline(input);
      assert.equal(first.success, true);
      assert.equal(first.aberto, true);

      const retry = openCashOffline(input);
      assert.equal(retry.success, true);
      assert.equal(retry.aberto, true);
      assert.match(retry.message, /já estava aberto/);

      const db = getOfflineDatabase();
      const sessionId = first.caixa.id;
      const operationId = 'cash-open:' + sessionId;

      assert.equal(
        scalarCount(
          db,
          'SELECT COUNT(*) AS count FROM cash_sessions WHERE empresa_id = ? AND session_id = ?',
          input.empresaId,
          sessionId
        ),
        1
      );
      assert.equal(
        scalarCount(
          db,
          'SELECT COUNT(*) AS count FROM sync_outbox WHERE empresa_id = ? AND operation_id = ?',
          input.empresaId,
          operationId
        ),
        1
      );

      firstOperation =
        getOutboxOperation(
          input.empresaId,
          operationId
        );

      assert.throws(
        () => openCashOffline({
          ...input,
          saldoInicial: 30
        }),
        /outro payload ou dependências/
      );
    } finally {
      closeOfflineDatabase();
    }

    try {
      initializeOfflineDatabase({ userDataDir });

      const retryAfterReopen =
        openCashOffline(input);

      assert.equal(
        retryAfterReopen.success,
        true
      );
      assert.equal(
        retryAfterReopen.aberto,
        true
      );

      const operationId =
        'cash-open:' +
        retryAfterReopen.caixa.id;

      assert.deepEqual(
        getOutboxOperation(
          input.empresaId,
          operationId
        ),
        firstOperation
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-stage7-idem-cash-open-');
});

test('7.5 movimento de caixa repete requestId antes/depois do reopen sem duplicar ledger/outbox', async () => {
  await withTempDir(async (userDataDir) => {
    const empresaId =
      'empresa-s75-cash-movement';
    const openInput = {
      empresaId,
      requestId: 'open-movement',
      saldoInicial: 40
    };
    const movementInput = {
      empresaId,
      caixaSessaoId: '',
      requestId: 'move-1',
      tipo: 'SUPRIMENTO',
      valor: 5,
      motivo: 'troco idempotente'
    };

    let movementId;
    let operationId;
    let firstOperation;

    try {
      initializeOfflineDatabase({ userDataDir });

      const opened =
        openCashOffline(openInput);

      movementInput.caixaSessaoId =
        opened.caixa.id;

      const first =
        registerCashMovementOffline(
          movementInput
        );
      assert.equal(first.idempotente, false);

      const retry =
        registerCashMovementOffline(
          movementInput
        );
      assert.equal(retry.idempotente, true);

      movementId =
        'cash-movement:' +
        opened.caixa.id +
        ':move-1';
      operationId =
        'cash-movement-op:' +
        opened.caixa.id +
        ':move-1';

      const db = getOfflineDatabase();

      assert.equal(
        scalarCount(
          db,
          'SELECT COUNT(*) AS count FROM cash_movements WHERE empresa_id = ? AND movement_id = ?',
          empresaId,
          movementId
        ),
        1
      );
      assert.equal(
        scalarCount(
          db,
          'SELECT COUNT(*) AS count FROM sync_outbox WHERE empresa_id = ? AND operation_id = ?',
          empresaId,
          operationId
        ),
        1
      );

      firstOperation =
        getOutboxOperation(
          empresaId,
          operationId
        );

      assert.throws(
        () => registerCashMovementOffline({
          ...movementInput,
          valor: 7
        }),
        /outro payload ou dependências/
      );
    } finally {
      closeOfflineDatabase();
    }

    try {
      initializeOfflineDatabase({ userDataDir });

      const retryAfterReopen =
        registerCashMovementOffline(
          movementInput
        );

      assert.equal(
        retryAfterReopen.idempotente,
        true
      );

      const db = getOfflineDatabase();

      assert.equal(
        scalarCount(
          db,
          'SELECT COUNT(*) AS count FROM cash_movements WHERE empresa_id = ? AND movement_id = ?',
          empresaId,
          movementId
        ),
        1
      );
      assert.deepEqual(
        getOutboxOperation(
          empresaId,
          operationId
        ),
        firstOperation
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-stage7-idem-cash-movement-');
});

test('7.5 crediário open/update preserva versão, estoque e outbox em retry após reopen', async () => {
  await withTempDir(async (userDataDir) => {
    const empresaId = 'empresa-s75-cred';
    const produtoId = 'produto-s75-cred';
    const clienteId = 'cliente-s75-cred';

    const openInput = {
      empresaId,
      crediarioId: 'cred-s75',
      contaReceberId: 'conta-s75',
      operationId: 'op-cred-s75-open',
      clienteId,
      clienteNome: 'Cliente S75',
      vencimento: '2026-12-31',
      occurredAt: '2026-09-27T19:10:00.000Z',
      totalCentavos: 1000,
      items: [{
        crediarioItemId: 'cred-item-s75',
        produtoId,
        quantity: 1,
        unitValue: 10,
        totalValue: 10,
        description: 'Produto S75',
        unit: 'UN'
      }]
    };

    const updateInput = {
      empresaId,
      crediarioId: 'cred-s75',
      operationId: 'op-cred-s75-update',
      occurredAt: '2026-09-27T19:11:00.000Z',
      produtos: [{
        crediarioItemId: 'cred-item-s75',
        productFiscalId: produtoId,
        quantity: 2,
        unitValue: 10,
        name: 'Produto S75'
      }]
    };

    let beforeClose;
    let stockBeforeClose;

    try {
      initializeOfflineDatabase({ userDataDir });

      seedProduct({
        empresaId,
        produtoId
      });

      upsertCustomerCache({
        empresaId,
        clienteId,
        nome: 'Cliente S75',
        documento: '12345678901',
        ativo: true,
        payload: {}
      });

      assert.equal(
        openCrediarioOfflineAtomic(
          openInput
        ).applied,
        true
      );

      assert.equal(
        updateCrediarioItemsOfflineAtomic(
          updateInput
        ).applied,
        true
      );

      beforeClose =
        getCrediarioDetailCache({
          empresaId,
          crediarioId: 'cred-s75'
        });
      stockBeforeClose =
        getStockProjection(
          empresaId,
          produtoId
        );

      assert.equal(
        getOutboxOperation(
          empresaId,
          openInput.operationId
        ).type,
        'CREDIARIO_OPEN'
      );
      assert.equal(
        getOutboxOperation(
          empresaId,
          updateInput.operationId
        ).type,
        'CREDIARIO_ITEMS_UPDATE'
      );
    } finally {
      closeOfflineDatabase();
    }

    try {
      initializeOfflineDatabase({ userDataDir });

      const openRetry =
        openCrediarioOfflineAtomic(
          openInput
        );
      const updateRetry =
        updateCrediarioItemsOfflineAtomic(
          updateInput
        );

      assert.equal(openRetry.duplicate, true);
      assert.equal(updateRetry.duplicate, true);

      assert.deepEqual(
        getCrediarioDetailCache({
          empresaId,
          crediarioId: 'cred-s75'
        }),
        beforeClose
      );
      assert.deepEqual(
        getStockProjection(
          empresaId,
          produtoId
        ),
        stockBeforeClose
      );

      const db = getOfflineDatabase();
      assert.equal(
        scalarCount(
          db,
          'SELECT COUNT(*) AS count FROM sync_outbox WHERE empresa_id = ? AND operation_id IN (?, ?)',
          empresaId,
          openInput.operationId,
          updateInput.operationId
        ),
        2
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-stage7-idem-crediario-');
});

test('7.5 venda repete saleId/operationId após reopen sem duplicar efeitos e rejeita colisões', async () => {
  await withTempDir(async (userDataDir) => {
    const empresaId = 'empresa-s75-sale';
    const produtoId = 'produto-s75-sale';
    const saleInput = {
      empresaId,
      saleId: 'sale-s75',
      operationId: 'op-sale-s75',
      status: 'PAID_OFFLINE_PENDING_SYNC',
      totalCentavos: 1000,
      occurredAt: '2026-09-27T19:20:00.000Z',
      paymentMethod: 'PIX',
      paymentParts: [{
        method: 'PIX',
        amount: 10
      }],
      items: [{
        itemId: 'sale-item-s75',
        produtoId,
        quantidade: '1',
        unitPriceCentavos: 1000,
        totalCentavos: 1000,
        payload: {}
      }],
      financialMovements: [{
        movementId: 'financial-s75',
        operationId: 'financial-op-s75',
        accountId: 'PIX',
        direction: 1,
        amountCentavos: 1000,
        movementType: 'VENDA_PAGA',
        sourceId: 'sale-s75',
        occurredAt: '2026-09-27T19:20:00.000Z',
        payload: {}
      }],
      dependencies: [],
      payload: {
        source: 'stage7-idempotency'
      }
    };

    let snapshot;

    try {
      initializeOfflineDatabase({ userDataDir });

      seedProduct({
        empresaId,
        produtoId
      });

      const first =
        registerOfflineSaleAtomic(
          saleInput
        );
      assert.equal(first.applied, true);

      const retry =
        registerOfflineSaleAtomic(
          saleInput
        );
      assert.equal(retry.duplicate, true);

      const db = getOfflineDatabase();
      snapshot = {
        sale:
          getSaleById(
            empresaId,
            saleInput.saleId
          ),
        stock:
          getStockProjection(
            empresaId,
            produtoId
          ),
        financial:
          listFinancialMovements({
            empresaId,
            accountId: 'PIX'
          }),
        saleItems:
          scalarCount(
            db,
            'SELECT COUNT(*) AS count FROM sale_items WHERE empresa_id = ? AND sale_id = ?',
            empresaId,
            saleInput.saleId
          ),
        stockMovements:
          scalarCount(
            db,
            'SELECT COUNT(*) AS count FROM stock_movements WHERE empresa_id = ? AND source_id = ?',
            empresaId,
            saleInput.saleId
          ),
        outbox:
          getOutboxOperation(
            empresaId,
            saleInput.operationId
          )
      };

      assert.throws(
        () => registerOfflineSaleAtomic({
          ...saleInput,
          operationId: 'op-sale-s75-other'
        }),
        /já existe com outro operationId/
      );

      assert.throws(
        () => registerOfflineSaleAtomic({
          ...saleInput,
          saleId: 'sale-s75-other',
          items: [{
            ...saleInput.items[0],
            itemId: 'sale-item-s75-other'
          }]
        }),
        /já pertence à venda/
      );
    } finally {
      closeOfflineDatabase();
    }

    try {
      initializeOfflineDatabase({ userDataDir });

      const retryAfterReopen =
        registerOfflineSaleAtomic(
          saleInput
        );

      assert.equal(
        retryAfterReopen.duplicate,
        true
      );

      const db = getOfflineDatabase();

      assert.deepEqual(
        getSaleById(
          empresaId,
          saleInput.saleId
        ),
        snapshot.sale
      );
      assert.deepEqual(
        getStockProjection(
          empresaId,
          produtoId
        ),
        snapshot.stock
      );
      assert.deepEqual(
        listFinancialMovements({
          empresaId,
          accountId: 'PIX'
        }),
        snapshot.financial
      );
      assert.equal(
        scalarCount(
          db,
          'SELECT COUNT(*) AS count FROM sale_items WHERE empresa_id = ? AND sale_id = ?',
          empresaId,
          saleInput.saleId
        ),
        snapshot.saleItems
      );
      assert.equal(
        scalarCount(
          db,
          'SELECT COUNT(*) AS count FROM stock_movements WHERE empresa_id = ? AND source_id = ?',
          empresaId,
          saleInput.saleId
        ),
        snapshot.stockMovements
      );
      assert.deepEqual(
        getOutboxOperation(
          empresaId,
          saleInput.operationId
        ),
        snapshot.outbox
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-stage7-idem-sale-');
});

test('7.5 enqueue repetido não ressuscita RETRY nem aceita payload divergente', async () => {
  await withTempDir(async (userDataDir) => {
    const empresaId = 'empresa-s75-outbox';
    const operationId = 'op-s75-outbox';
    const input = {
      empresaId,
      operationId,
      type: 'STAGE7_IDEMPOTENCY',
      entityId: 'entity-s75',
      payload: {
        value: 1,
        nested: {
          ok: true
        }
      },
      dependencies: [],
      createdAt: '2026-09-27T19:30:00.000Z'
    };

    try {
      initializeOfflineDatabase({ userDataDir });

      const first =
        enqueueOutboxOperation(input);
      assert.equal(first.applied, true);

      const claim =
        claimOutboxOperation({
          empresaId,
          operationId,
          startedAt:
            '2026-09-27T19:31:00.000Z'
        });
      assert.equal(claim.claimed, true);

      const retry =
        markOutboxRetry({
          empresaId,
          operationId,
          nextAttemptAt:
            '2026-09-27T19:40:00.000Z',
          error: 'falha transitória s75',
          updatedAt:
            '2026-09-27T19:32:00.000Z'
        });
      assert.equal(retry.changed, true);
      assert.equal(
        retry.operation.status,
        'RETRY'
      );
      assert.equal(
        retry.operation.attempts,
        1
      );

      const duplicate =
        enqueueOutboxOperation(input);

      assert.equal(duplicate.applied, false);
      assert.equal(duplicate.duplicate, true);
      assert.equal(
        duplicate.operation.status,
        'RETRY'
      );
      assert.equal(
        duplicate.operation.attempts,
        1
      );
      assert.equal(
        duplicate.operation.nextAttemptAt,
        '2026-09-27T19:40:00.000Z'
      );

      assert.throws(
        () => enqueueOutboxOperation({
          ...input,
          payload: {
            value: 2
          }
        }),
        /outro payload ou dependências/
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-stage7-idem-outbox-');
});
