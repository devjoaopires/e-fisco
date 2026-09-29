'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  initializeOfflineDatabase,
  getOfflineDatabase,
  closeOfflineDatabase,
  upsertProductCache,
  registerOfflineSaleAtomic,
  getSaleById,
  getOutboxOperation,
  listPendingStockDeltasByProduct
} = require('../../offline-db');

const {
  withTempDir
} = require('../helpers/temp-dir');

async function withFreshDatabase(callback) {
  return withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });
      return await callback(getOfflineDatabase());
    } finally {
      try {
        closeOfflineDatabase();
      } catch (_) {}
    }
  }, 'efisco-step35-sale-stock-');
}

function seedProduct(quantity) {
  upsertProductCache({
    empresaId: 'empresa-1',
    produtoId: 'produto-1',
    codigo: 'P001',
    descricao: 'Produto estoque crítico',
    unidade: 'UN',
    precoCentavos: 1000,
    ativo: true,
    payload: {
      quantidadeEstoque: quantity
    }
  });
}

function saleInput({
  saleId,
  lines,
  occurredAt = '2026-09-26T15:00:00.000Z'
}) {
  const items = lines.map((line, index) => {
    const quantity = Number(line.quantity);
    const totalCentavos = Math.round(quantity * 1000);

    return {
      itemId: saleId + ':item:' + (index + 1),
      produtoId: 'produto-1',
      quantidade: String(line.quantity),
      unitPriceCentavos: 1000,
      totalCentavos,
      payload: {}
    };
  });

  const totalCentavos = items.reduce(
    (sum, item) => sum + item.totalCentavos,
    0
  );

  return {
    empresaId: 'empresa-1',
    saleId,
    operationId: 'sale-paid:' + saleId,
    status: 'PAID_OFFLINE_PENDING_SYNC',
    totalCentavos,
    occurredAt,
    paymentMethod: 'PIX',
    paymentParts: [{
      method: 'PIX',
      amount: totalCentavos / 100
    }],
    items,
    financialMovements: [],
    cashMovements: [],
    dependencies: [],
    payload: {
      source: 'stage-3.5-stock-revalidation'
    }
  };
}

function countRows(db, sql, ...params) {
  return Number(db.prepare(sql).get(...params).count);
}

test('venda normal revalida no backend o estoque após deltas locais pendentes', async () => {
  await withFreshDatabase((db) => {
    seedProduct(1);

    const first = registerOfflineSaleAtomic(saleInput({
      saleId: 'sale-stock-first',
      lines: [{ quantity: '0.75' }]
    }));

    assert.equal(first.applied, true);
    assert.deepEqual(
      listPendingStockDeltasByProduct('empresa-1'),
      [{
        produtoId: 'produto-1',
        deltaMicrounits: -750000
      }]
    );

    assert.throws(
      () => registerOfflineSaleAtomic(saleInput({
        saleId: 'sale-stock-over',
        lines: [{ quantity: '0.5' }],
        occurredAt: '2026-09-26T15:01:00.000Z'
      })),
      /Estoque insuficiente/
    );

    assert.equal(
      getSaleById('empresa-1', 'sale-stock-over'),
      null
    );
    assert.equal(
      getOutboxOperation(
        'empresa-1',
        'sale-paid:sale-stock-over'
      ),
      null
    );
    assert.equal(
      countRows(
        db,
        'SELECT COUNT(*) AS count FROM stock_movements WHERE empresa_id = ? AND source_id = ?',
        'empresa-1',
        'sale-stock-over'
      ),
      0
    );
  });
});

test('venda normal agrega linhas do mesmo produto antes de validar disponibilidade', async () => {
  await withFreshDatabase((db) => {
    seedProduct(1);

    assert.throws(
      () => registerOfflineSaleAtomic(saleInput({
        saleId: 'sale-stock-same-product',
        lines: [
          { quantity: '0.6' },
          { quantity: '0.6' }
        ]
      })),
      /Estoque insuficiente/
    );

    assert.equal(
      getSaleById('empresa-1', 'sale-stock-same-product'),
      null
    );
    assert.equal(
      countRows(
        db,
        'SELECT COUNT(*) AS count FROM sale_items WHERE empresa_id = ? AND sale_id = ?',
        'empresa-1',
        'sale-stock-same-product'
      ),
      0
    );
  });
});

test('venda normal aceita exatamente o saldo backend disponível', async () => {
  await withFreshDatabase(() => {
    seedProduct(1);

    registerOfflineSaleAtomic(saleInput({
      saleId: 'sale-stock-reserve',
      lines: [{ quantity: '0.25' }]
    }));

    const exact = registerOfflineSaleAtomic(saleInput({
      saleId: 'sale-stock-exact',
      lines: [{ quantity: '0.75' }],
      occurredAt: '2026-09-26T15:02:00.000Z'
    }));

    assert.equal(exact.applied, true);
    assert.equal(exact.duplicate, false);
    assert.deepEqual(
      listPendingStockDeltasByProduct('empresa-1'),
      [{
        produtoId: 'produto-1',
        deltaMicrounits: -1000000
      }]
    );
  });
});
