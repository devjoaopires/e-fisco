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
  registerOfflineSaleAtomic,
  getCrediarioDetailCache,
  getSaleById,
  getOutboxOperation
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
  }, 'efisco-step53-atomic-');
}

function seedProductAndCustomer() {
  upsertProductCache({
    empresaId: 'empresa-1',
    produtoId: 'produto-1',
    codigo: 'P001',
    descricao: 'Produto teste',
    unidade: 'UN',
    precoCentavos: 1000,
    ativo: true,
    payload: {
      quantidadeEstoque: 100
    }
  });

  upsertCustomerCache({
    empresaId: 'empresa-1',
    clienteId: 'cliente-1',
    nome: 'Cliente teste',
    documento: '12345678901',
    ativo: true,
    payload: {}
  });
}

function createOutboxAbortTrigger(db, name, type) {
  db.exec(`
    CREATE TEMP TRIGGER ${name}
    BEFORE INSERT ON main.sync_outbox
    WHEN NEW.type = '${type}'
    BEGIN
      SELECT RAISE(ABORT, 'step53-forced-outbox-failure');
    END;
  `);
}

function scalarCount(db, sql, ...params) {
  return Number(db.prepare(sql).get(...params).count);
}

test('abertura de crediário reverte conta, estoque, projeção e outbox quando o último write falha', async () => {
  await withFreshDatabase((db) => {
    seedProductAndCustomer();

    createOutboxAbortTrigger(
      db,
      'step53_fail_crediario_open',
      'CREDIARIO_OPEN'
    );

    assert.throws(
      () => openCrediarioOfflineAtomic({
        empresaId: 'empresa-1',
        crediarioId: 'cred-rollback-open',
        contaReceberId: 'conta-rollback-open',
        operationId: 'op-cred-rollback-open',
        clienteId: 'cliente-1',
        clienteNome: 'Cliente teste',
        cpf: '12345678901',
        whatsapp: '94999990000',
        vencimento: '2026-12-31',
        occurredAt: '2026-09-25T10:00:00.000Z',
        totalCentavos: 1000,
        items: [{
          crediarioItemId: 'cred-item-1',
          produtoId: 'produto-1',
          quantity: 1,
          unitValue: 10,
          totalValue: 10,
          description: 'Produto teste',
          unit: 'UN'
        }]
      }),
      /step53-forced-outbox-failure/
    );

    assert.equal(
      scalarCount(
        db,
        'SELECT COUNT(*) AS count FROM crediarios_cache WHERE empresa_id = ? AND crediario_id = ?',
        'empresa-1',
        'cred-rollback-open'
      ),
      0
    );

    assert.equal(
      scalarCount(
        db,
        'SELECT COUNT(*) AS count FROM stock_movements WHERE empresa_id = ? AND source_id = ?',
        'empresa-1',
        'cred-rollback-open'
      ),
      0
    );

    assert.equal(
      scalarCount(
        db,
        'SELECT COUNT(*) AS count FROM stock_projection WHERE empresa_id = ? AND produto_id = ?',
        'empresa-1',
        'produto-1'
      ),
      0
    );

    assert.equal(
      scalarCount(
        db,
        'SELECT COUNT(*) AS count FROM sync_outbox WHERE empresa_id = ? AND operation_id = ?',
        'empresa-1',
        'op-cred-rollback-open'
      ),
      0
    );

    assert.throws(
      () => getCrediarioDetailCache({
        empresaId: 'empresa-1',
        crediarioId: 'cred-rollback-open'
      }),
      /Crediário não encontrado no cache offline/
    );
  });
});

test('edição de crediário reverte versão, payload e deltas de estoque quando a outbox falha', async () => {
  await withFreshDatabase((db) => {
    seedProductAndCustomer();

    const opened = openCrediarioOfflineAtomic({
      empresaId: 'empresa-1',
      crediarioId: 'cred-rollback-update',
      contaReceberId: 'conta-rollback-update',
      operationId: 'op-cred-open-base',
      clienteId: 'cliente-1',
      clienteNome: 'Cliente teste',
      vencimento: '2026-12-31',
      occurredAt: '2026-09-25T10:00:00.000Z',
      totalCentavos: 1000,
      items: [{
        crediarioItemId: 'cred-item-existing',
        produtoId: 'produto-1',
        quantity: 1,
        unitValue: 10,
        totalValue: 10,
        description: 'Produto teste',
        unit: 'UN'
      }]
    });

    assert.equal(opened.applied, true);

    const beforeAccount = db.prepare(`
      SELECT valor_centavos, valor_original_centavos,
             saldo_receber_centavos, situacao_versao, payload_json
        FROM crediarios_cache
       WHERE empresa_id = ?
         AND crediario_id = ?
    `).get('empresa-1', 'cred-rollback-update');

    const beforeStockCount = scalarCount(
      db,
      'SELECT COUNT(*) AS count FROM stock_movements WHERE empresa_id = ? AND source_id = ?',
      'empresa-1',
      'cred-rollback-update'
    );

    const beforeProjection = db.prepare(`
      SELECT quantity_microunits
        FROM stock_projection
       WHERE empresa_id = ?
         AND produto_id = ?
    `).get('empresa-1', 'produto-1');

    createOutboxAbortTrigger(
      db,
      'step53_fail_crediario_update',
      'CREDIARIO_ITEMS_UPDATE'
    );

    assert.throws(
      () => updateCrediarioItemsOfflineAtomic({
        empresaId: 'empresa-1',
        crediarioId: 'cred-rollback-update',
        operationId: 'op-cred-update-fail',
        occurredAt: '2026-09-25T10:05:00.000Z',
        produtos: [{
          crediarioItemId: 'cred-item-existing',
          productFiscalId: 'produto-1',
          quantity: 2,
          unitValue: 10,
          name: 'Produto teste'
        }]
      }),
      /step53-forced-outbox-failure/
    );

    const afterAccount = db.prepare(`
      SELECT valor_centavos, valor_original_centavos,
             saldo_receber_centavos, situacao_versao, payload_json
        FROM crediarios_cache
       WHERE empresa_id = ?
         AND crediario_id = ?
    `).get('empresa-1', 'cred-rollback-update');

    assert.deepEqual(afterAccount, beforeAccount);

    assert.equal(
      scalarCount(
        db,
        'SELECT COUNT(*) AS count FROM stock_movements WHERE empresa_id = ? AND source_id = ?',
        'empresa-1',
        'cred-rollback-update'
      ),
      beforeStockCount
    );

    const afterProjection = db.prepare(`
      SELECT quantity_microunits
        FROM stock_projection
       WHERE empresa_id = ?
         AND produto_id = ?
    `).get('empresa-1', 'produto-1');

    assert.deepEqual(afterProjection, beforeProjection);

    assert.equal(
      getOutboxOperation(
        'empresa-1',
        'op-cred-update-fail'
      ),
      null
    );
  });
});

test('venda reverte venda, item, estoque, projeção e financeiro quando a outbox final falha', async () => {
  await withFreshDatabase((db) => {
    upsertProductCache({
      empresaId: 'empresa-1',
      produtoId: 'produto-1',
      codigo: 'P001',
      descricao: 'Produto teste',
      unidade: 'UN',
      precoCentavos: 1000,
      ativo: true,
      payload: {
        quantidadeEstoque: 100
      }
    });

    createOutboxAbortTrigger(
      db,
      'step53_fail_sale_paid',
      'SALE_PAID'
    );

    const input = {
      empresaId: 'empresa-1',
      saleId: 'sale-rollback',
      operationId: 'op-sale-rollback',
      status: 'PAID_OFFLINE_PENDING_SYNC',
      totalCentavos: 1000,
      occurredAt: '2026-09-25T11:00:00.000Z',
      paymentMethod: 'PIX',
      paymentParts: [{
        method: 'PIX',
        amount: 10
      }],
      items: [{
        itemId: 'sale-item-rollback',
        produtoId: 'produto-1',
        quantidade: '1',
        unitPriceCentavos: 1000,
        totalCentavos: 1000,
        payload: {}
      }],
      financialMovements: [{
        movementId: 'financial-sale-rollback',
        operationId: 'op-financial-sale-rollback',
        accountId: 'PIX',
        direction: 1,
        amountCentavos: 1000,
        movementType: 'VENDA_PAGA',
        sourceId: 'sale-rollback',
        occurredAt: '2026-09-25T11:00:00.000Z',
        payload: {}
      }],
      dependencies: [],
      payload: {
        source: 'step53'
      }
    };

    assert.throws(
      () => registerOfflineSaleAtomic(input),
      /step53-forced-outbox-failure/
    );

    assert.equal(
      getSaleById('empresa-1', 'sale-rollback'),
      null
    );

    assert.equal(
      scalarCount(
        db,
        'SELECT COUNT(*) AS count FROM sale_items WHERE empresa_id = ? AND sale_id = ?',
        'empresa-1',
        'sale-rollback'
      ),
      0
    );

    assert.equal(
      scalarCount(
        db,
        'SELECT COUNT(*) AS count FROM stock_movements WHERE empresa_id = ? AND source_id = ?',
        'empresa-1',
        'sale-rollback'
      ),
      0
    );

    assert.equal(
      scalarCount(
        db,
        'SELECT COUNT(*) AS count FROM stock_projection WHERE empresa_id = ? AND produto_id = ?',
        'empresa-1',
        'produto-1'
      ),
      0
    );

    assert.equal(
      scalarCount(
        db,
        'SELECT COUNT(*) AS count FROM financial_movements WHERE empresa_id = ? AND source_id = ?',
        'empresa-1',
        'sale-rollback'
      ),
      0
    );

    assert.equal(
      getOutboxOperation(
        'empresa-1',
        'op-sale-rollback'
      ),
      null
    );

    db.exec('DROP TRIGGER step53_fail_sale_paid;');

    const retry = registerOfflineSaleAtomic(input);

    assert.equal(retry.applied, true);
    assert.equal(retry.duplicate, false);
    assert.equal(retry.sale.saleId, 'sale-rollback');
    assert.equal(retry.outbox.status, 'PENDING');
  });
});
