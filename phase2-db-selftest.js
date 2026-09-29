'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const {
  OFFLINE_DB_SCHEMA_VERSION,
  initializeOfflineDatabase,
  closeOfflineDatabase,
  getOfflineDatabase,
  openCashSession,
  getCashSession,
  getOpenCashSession,
  registerCashMovement,
  listCashMovements,
  enqueueOutboxOperation,
  getOutboxOperation,
  listOutboxReady,
  upsertProductCache,
  registerOfflineSaleAtomic,
  getSaleById
} = require('./offline-db');

const {
  withTempDir
} = require('./tests/helpers/temp-dir');

function assertMigrationChain(info) {
  assert.equal(info.schemaVersion, OFFLINE_DB_SCHEMA_VERSION);
  assert.equal(info.migrations.length, OFFLINE_DB_SCHEMA_VERSION);

  const versions = info.migrations.map((item) => item.version);
  assert.deepEqual(
    versions,
    Array.from({ length: OFFLINE_DB_SCHEMA_VERSION }, (_, index) => index + 1)
  );
}

async function runPhase2DbSelfTest() {
  assert.equal(OFFLINE_DB_SCHEMA_VERSION, 13);

  await withTempDir(async (userDataDir) => {
    let closed = false;

    try {
      const firstOpen = initializeOfflineDatabase({ userDataDir });

      assert.equal(firstOpen.ok, true);
      assert.equal(firstOpen.reused, false);
      assert.equal(firstOpen.journalMode.toLowerCase(), 'wal');
      assert.equal(firstOpen.foreignKeysEnabled, true);
      assert.equal(firstOpen.busyTimeout, 5000);
      assertMigrationChain(firstOpen);

      const expectedDbPath = path.join(
        userDataDir,
        'offline-data',
        'e-fisco-offline.db'
      );

      assert.equal(path.resolve(firstOpen.path), path.resolve(expectedDbPath));
      assert.equal(fs.existsSync(expectedDbPath), true);

      const rawDb = getOfflineDatabase();

      const migrationCount = Number(
        rawDb.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count
      );
      assert.equal(migrationCount, 13);

      const meta = rawDb.prepare(
        'SELECT schema_version FROM offline_meta WHERE singleton_id = 1'
      ).get();
      assert.equal(Number(meta.schema_version), 13);

      const reused = initializeOfflineDatabase({ userDataDir });
      assert.equal(reused.ok, true);
      assert.equal(reused.reused, true);
      assert.equal(path.resolve(reused.path), path.resolve(expectedDbPath));

      const empresaId = 'empresa-selftest';
      const sessionId = 'cash-selftest';
      const cashOperationId = 'op-cash-open-selftest';

      const opened = openCashSession({
        empresaId,
        sessionId,
        operationId: cashOperationId,
        openingBalanceCentavos: 2500,
        openedAt: '2026-09-25T10:00:00.000Z',
        payload: { source: 'phase2-db-selftest' }
      });

      assert.equal(opened.applied, true);
      assert.equal(opened.duplicate, false);
      assert.equal(opened.session.status, 'OPEN');
      assert.equal(opened.session.openingBalanceCentavos, 2500);

      const duplicateOpen = openCashSession({
        empresaId,
        sessionId,
        operationId: cashOperationId,
        openingBalanceCentavos: 2500,
        openedAt: '2026-09-25T10:00:00.000Z',
        payload: { source: 'phase2-db-selftest' }
      });

      assert.equal(duplicateOpen.applied, false);
      assert.equal(duplicateOpen.duplicate, true);

      const movement = registerCashMovement({
        empresaId,
        movementId: 'cash-movement-selftest',
        operationId: 'op-cash-movement-selftest',
        sessionId,
        direction: 1,
        amountCentavos: 700,
        movementType: 'SUPRIMENTO',
        occurredAt: '2026-09-25T10:01:00.000Z',
        payload: { source: 'phase2-db-selftest' }
      });

      assert.equal(movement.applied, true);
      assert.equal(movement.duplicate, false);

      const duplicateMovement = registerCashMovement({
        empresaId,
        movementId: 'cash-movement-selftest',
        operationId: 'op-cash-movement-selftest',
        sessionId,
        direction: 1,
        amountCentavos: 700,
        movementType: 'SUPRIMENTO',
        occurredAt: '2026-09-25T10:01:00.000Z',
        payload: { source: 'phase2-db-selftest' }
      });

      assert.equal(duplicateMovement.applied, false);
      assert.equal(duplicateMovement.duplicate, true);

      const outbox = enqueueOutboxOperation({
        empresaId,
        operationId: 'op-outbox-selftest',
        type: 'SELFTEST',
        entityId: 'entity-selftest',
        payload: { ok: true },
        dependencies: [],
        createdAt: '2026-09-25T10:02:00.000Z'
      });

      assert.equal(outbox.applied, true);
      assert.equal(outbox.operation.status, 'PENDING');

      const duplicateOutbox = enqueueOutboxOperation({
        empresaId,
        operationId: 'op-outbox-selftest',
        type: 'SELFTEST',
        entityId: 'entity-selftest',
        payload: { ok: true },
        dependencies: [],
        createdAt: '2026-09-25T10:02:00.000Z'
      });

      assert.equal(duplicateOutbox.applied, false);
      assert.equal(duplicateOutbox.duplicate, true);

      const readyBeforeReopen = listOutboxReady({
        empresaId,
        referenceAt: '2026-09-25T10:03:00.000Z'
      });

      assert.equal(
        readyBeforeReopen.some(
          (item) => item.operationId === 'op-outbox-selftest'
        ),
        true
      );

      upsertProductCache({
        empresaId,
        produtoId: 'product-selftest',
        codigo: 'P-SELFTEST',
        descricao: 'Produto do self-test',
        unidade: 'UN',
        precoCentavos: 1000,
        ativo: true,
        payload: {
          quantidadeEstoque: 10
        }
      });

      const saleId = 'sale-rollback-selftest';
      const saleOperationId = 'op-sale-rollback-selftest';

      assert.throws(
        () => registerOfflineSaleAtomic({
          empresaId,
          saleId,
          operationId: saleOperationId,
          status: 'PAID_OFFLINE_PENDING_SYNC',
          totalCentavos: 1000,
          occurredAt: '2026-09-25T10:04:00.000Z',
          items: [
            {
              itemId: 'sale-item-rollback-selftest',
              produtoId: 'product-selftest',
              quantidade: '1',
              unitPriceCentavos: 1000,
              totalCentavos: 1000,
              payload: {}
            }
          ],
          fiscalAllocation: {
            leaseId: 'missing-lease-selftest',
            deviceId: 'device-selftest'
          },
          payload: { source: 'phase2-db-selftest' }
        }),
        /Contador fiscal local não encontrado/
      );

      assert.equal(getSaleById(empresaId, saleId), null);
      assert.equal(getOutboxOperation(empresaId, saleOperationId), null);

      const saleCount = Number(
        rawDb.prepare(
          'SELECT COUNT(*) AS count FROM sales WHERE empresa_id = ? AND sale_id = ?'
        ).get(empresaId, saleId).count
      );
      assert.equal(saleCount, 0);

      closeOfflineDatabase();
      closed = true;

      const reopened = initializeOfflineDatabase({ userDataDir });
      closed = false;

      assert.equal(reopened.ok, true);
      assert.equal(reopened.reused, false);
      assertMigrationChain(reopened);

      const persistedSession = getCashSession(empresaId, sessionId);
      assert.equal(persistedSession.status, 'OPEN');
      assert.equal(persistedSession.openingBalanceCentavos, 2500);

      const currentOpen = getOpenCashSession(empresaId);
      assert.equal(currentOpen.sessionId, sessionId);

      const movements = listCashMovements({
        empresaId,
        sessionId,
        limit: 10
      });
      assert.equal(movements.length, 1);
      assert.equal(movements[0].movementId, 'cash-movement-selftest');
      assert.equal(movements[0].amountCentavos, 700);

      const persistedOutbox = getOutboxOperation(
        empresaId,
        'op-outbox-selftest'
      );
      assert.equal(persistedOutbox.status, 'PENDING');
      assert.deepEqual(persistedOutbox.payload, { ok: true });

      assert.equal(getSaleById(empresaId, saleId), null);
      assert.equal(getOutboxOperation(empresaId, saleOperationId), null);

      const reopenedDb = getOfflineDatabase();
      const integrity = reopenedDb.prepare('PRAGMA integrity_check').get();
      assert.equal(String(Object.values(integrity)[0]).toLowerCase(), 'ok');

      closeOfflineDatabase();
      closed = true;
    } finally {
      if (!closed) {
        try { closeOfflineDatabase(); } catch (_) {}
      }
    }
  }, 'efisco-phase2-db-selftest-');

  console.log('phase2-db-selftest: OK');
}

if (require.main === module) {
  runPhase2DbSelfTest().catch((error) => {
    try { closeOfflineDatabase(); } catch (_) {}
    console.error('phase2-db-selftest: FAILED');
    console.error(error && error.stack || error);
    process.exitCode = 1;
  });
}

module.exports = {
  runPhase2DbSelfTest
};
