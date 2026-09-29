'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  initializeOfflineDatabase,
  closeOfflineDatabase,
  registerStockMovement,
  getStockProjection,
  listStockMovements,
  listPendingStockDeltasByProduct,
  enqueueOutboxOperation,
  claimOutboxOperation,
  markOutboxConfirmed
} = require('../../offline-db');

const {
  withTempDir
} = require('../helpers/temp-dir');

test('D10 repository de estoque preserva projeção e idempotência', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });

      const first = registerStockMovement({
        empresaId: 'empresa-d10',
        movementId: 'stock-d10-1',
        operationId: 'op-d10-1',
        produtoId: 'produto-d10',
        direction: 'ENTRADA',
        quantidade: '2.500001',
        movementType: 'AJUSTE_ENTRADA',
        sourceId: 'source-d10',
        occurredAt: '2026-09-27T17:25:00.000Z',
        payload: { source: 'd10' }
      });

      assert.equal(first.applied, true);
      assert.equal(first.duplicate, false);
      assert.equal(first.quantidade, '2.500001');
      assert.equal(first.saldoProjetado, '2.500001');

      const duplicate = registerStockMovement({
        empresaId: 'empresa-d10',
        movementId: 'stock-d10-1',
        operationId: 'op-d10-1',
        produtoId: 'produto-d10',
        direction: 'ENTRADA',
        quantidade: '2.500001',
        movementType: 'AJUSTE_ENTRADA',
        sourceId: 'source-d10',
        occurredAt: '2026-09-27T17:25:00.000Z',
        payload: { source: 'd10' }
      });

      assert.equal(duplicate.applied, false);
      assert.equal(duplicate.duplicate, true);

      const projection =
        getStockProjection(
          'empresa-d10',
          'produto-d10'
        );

      assert.equal(
        projection.quantityMicrounits,
        2500001
      );
      assert.equal(
        projection.quantidade,
        '2.500001'
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-d10-stock-idempotency-');
});

test('D10 listStockMovements preserva filtro, direção e payload', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });

      registerStockMovement({
        empresaId: 'empresa-d10-list',
        movementId: 'stock-list-in',
        operationId: 'stock-list-op-in',
        produtoId: 'produto-a',
        direction: 1,
        quantidade: '3',
        movementType: 'ENTRADA',
        occurredAt: '2026-09-27T17:26:00.000Z',
        payload: { kind: 'in' }
      });

      registerStockMovement({
        empresaId: 'empresa-d10-list',
        movementId: 'stock-list-out',
        operationId: 'stock-list-op-out',
        produtoId: 'produto-a',
        direction: 'SAIDA',
        quantidade: '1.25',
        movementType: 'SAIDA',
        occurredAt: '2026-09-27T17:27:00.000Z',
        payload: { kind: 'out' }
      });

      registerStockMovement({
        empresaId: 'empresa-d10-list',
        movementId: 'stock-list-other',
        operationId: 'stock-list-op-other',
        produtoId: 'produto-b',
        direction: 'ENTRADA',
        quantidade: '7',
        movementType: 'ENTRADA',
        payload: {}
      });

      const rows = listStockMovements({
        empresaId: 'empresa-d10-list',
        produtoId: 'produto-a',
        limit: 10
      });

      assert.equal(rows.length, 2);
      assert.equal(rows[0].direction, 1);
      assert.equal(rows[0].quantidade, '3');
      assert.deepEqual(
        rows[0].payload,
        { kind: 'in' }
      );
      assert.equal(rows[1].direction, -1);
      assert.equal(rows[1].quantidade, '1.25');

      assert.equal(
        getStockProjection(
          'empresa-d10-list',
          'produto-a'
        ).quantidade,
        '1.75'
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-d10-stock-list-');
});

test('D10 pending stock deltas seguem status da sync_outbox sem misturar owners', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });

      enqueueOutboxOperation({
        empresaId: 'empresa-d10-pending',
        operationId: 'sale-op-d10',
        type: 'SALE_PAID',
        entityId: 'sale-d10',
        payload: { saleId: 'sale-d10' },
        createdAt: '2026-09-27T17:28:00.000Z'
      });

      registerStockMovement({
        empresaId: 'empresa-d10-pending',
        movementId: 'stock-pending-d10',
        operationId: 'sale-op-d10:stock:item-1',
        produtoId: 'produto-d10-pending',
        direction: 'SAIDA',
        quantidade: '1.5',
        movementType: 'VENDA',
        occurredAt: '2026-09-27T17:28:01.000Z',
        payload: {}
      });

      assert.deepEqual(
        listPendingStockDeltasByProduct(
          'empresa-d10-pending'
        ),
        [{
          produtoId: 'produto-d10-pending',
          deltaMicrounits: -1500000
        }]
      );

      assert.equal(
        claimOutboxOperation({
          empresaId: 'empresa-d10-pending',
          operationId: 'sale-op-d10',
          startedAt: '2026-09-27T17:29:00.000Z'
        }).claimed,
        true
      );

      assert.equal(
        markOutboxConfirmed({
          empresaId: 'empresa-d10-pending',
          operationId: 'sale-op-d10',
          confirmedAt: '2026-09-27T17:29:01.000Z'
        }).changed,
        true
      );

      assert.deepEqual(
        listPendingStockDeltasByProduct(
          'empresa-d10-pending'
        ),
        []
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-d10-stock-pending-');
});
