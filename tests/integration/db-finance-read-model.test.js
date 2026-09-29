'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  initializeOfflineDatabase,
  closeOfflineDatabase,
  getOfflineDatabase,
  upsertProductCache,
  getSaleById,
  registerFinancialMovement,
  listFinancialMovements
} = require('../../offline-db');

const {
  listOfflineSalesForFinance
} = require('../../offline-sale-service');

const {
  withTempDir
} = require('../helpers/temp-dir');

function insertSaleFixture(db, input = {}) {
  const empresaId = input.empresaId || 'empresa-d06';
  const saleId = input.saleId || 'sale-d06';
  const operationId =
    input.operationId || 'sale-paid:sale-d06';
  const occurredAt =
    input.occurredAt ||
    '2026-09-27T15:30:00.000Z';
  const payload = {
    saleNumber: 'V-006',
    paidAt: occurredAt,
    paymentStatus: 'PAGO',
    paymentMethod: 'PIX',
    operatorId: 'op-d06',
    operadorNome: 'Operador D06',
    operadorPerfil: 'CAIXA',
    caixaSessaoId: 'caixa-d06',
    origemVenda: 'PDV',
    ...(input.payload || {})
  };

  upsertProductCache({
    empresaId,
    produtoId: 'produto-d06',
    descricao: 'Produto D06',
    precoCentavos: 1234,
    ativo: true
  });

  db.prepare(`
    INSERT INTO sales (
      empresa_id,
      sale_id,
      operation_id,
      cliente_id,
      status,
      total_centavos,
      occurred_at,
      created_at,
      payload_json
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)
  `).run(
    empresaId,
    saleId,
    operationId,
    input.status || 'PAID',
    1234,
    occurredAt,
    occurredAt,
    JSON.stringify(payload)
  );

  db.prepare(`
    INSERT INTO sale_items (
      empresa_id,
      sale_id,
      item_id,
      produto_id,
      quantity_microunits,
      unit_price_centavos,
      total_centavos,
      payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    empresaId,
    saleId,
    'item-d06',
    'produto-d06',
    1500000,
    823,
    1234,
    JSON.stringify({
      name: 'Produto D06'
    })
  );

  return {
    empresaId,
    saleId,
    occurredAt
  };
}

test('D06 getSaleById preserva shape e conversão de quantidade', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });
      const db = getOfflineDatabase();
      const fixture = insertSaleFixture(db);

      const sale = getSaleById(
        fixture.empresaId,
        fixture.saleId
      );

      assert.equal(sale.saleId, 'sale-d06');
      assert.equal(sale.totalCentavos, 1234);
      assert.equal(sale.items.length, 1);
      assert.equal(
        sale.items[0].quantidade,
        '1.5'
      );
      assert.equal(
        sale.items[0].unitPriceCentavos,
        823
      );
      assert.deepEqual(
        sale.items[0].payload,
        { name: 'Produto D06' }
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-d06-sale-by-id-');
});

test('D06 listFinancialMovements preserva filtro e mapping', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });

      registerFinancialMovement({
        empresaId: 'empresa-d06',
        movementId: 'finance-d06-1',
        operationId: 'finance-op-d06-1',
        accountId: 'account-d06',
        direction: 1,
        amountCentavos: 2500,
        movementType: 'CREDIARIO_RECEBIMENTO',
        sourceId: 'source-d06',
        occurredAt: '2026-09-27T15:31:00.000Z',
        payload: { meio: 'PIX' }
      });

      const rows = listFinancialMovements({
        empresaId: 'empresa-d06',
        accountId: 'account-d06'
      });

      assert.equal(rows.length, 1);
      assert.equal(
        rows[0].movementId,
        'finance-d06-1'
      );
      assert.equal(rows[0].amountCentavos, 2500);
      assert.deepEqual(
        rows[0].payload,
        { meio: 'PIX' }
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-d06-financial-');
});

test('D06 listOfflineSalesForFinance usa read-model DB sem SQL no service', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });
      const db = getOfflineDatabase();
      insertSaleFixture(db);

      const page = listOfflineSalesForFinance({
        empresaId: 'empresa-d06',
        limit: 10,
        offset: 0
      });

      assert.equal(page.success, true);
      assert.equal(page.empresaId, 'empresa-d06');
      assert.equal(page.totalCount, 1);
      assert.equal(page.nextOffset, 1);
      assert.equal(page.hasMore, false);
      assert.equal(page.vendas.length, 1);
      assert.equal(page.vendas[0].saleId, 'sale-d06');
      assert.equal(page.vendas[0].saleNumber, 'V-006');
      assert.equal(page.vendas[0].paymentMethod, 'PIX');
      assert.equal(page.vendas[0].totalValue, 12.34);
      assert.equal(page.vendas[0].offline, true);
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-d06-finance-page-');
});
