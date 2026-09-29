'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  initializeOfflineDatabase,
  closeOfflineDatabase,
  enqueueOutboxOperation,
  getOutboxOperation,
  listOutboxReady,
  claimOutboxOperation,
  markOutboxConfirmed,
  markOutboxRetry,
  markOutboxConflict,
  markOutboxManualReview,
  recoverStaleOutbox,
  getOutboxStatusSummary
} = require('../../offline-db');

const {
  withTempDir
} = require('../helpers/temp-dir');

test('D07 respeita dependências antes de liberar operação pronta', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });

      enqueueOutboxOperation({
        empresaId: 'empresa-d07',
        operationId: 'dep-d07',
        type: 'GENERIC',
        entityId: 'dep',
        createdAt: '2026-09-27T15:45:00.000Z'
      });

      enqueueOutboxOperation({
        empresaId: 'empresa-d07',
        operationId: 'child-d07',
        type: 'GENERIC',
        entityId: 'child',
        dependencies: ['dep-d07'],
        createdAt: '2026-09-27T15:45:01.000Z'
      });

      assert.deepEqual(
        listOutboxReady({
          empresaId: 'empresa-d07',
          referenceAt:
            '2026-09-27T15:46:00.000Z',
          limit: 10
        }).map((row) => row.operationId),
        ['dep-d07']
      );

      assert.equal(
        claimOutboxOperation({
          empresaId: 'empresa-d07',
          operationId: 'dep-d07',
          startedAt:
            '2026-09-27T15:46:01.000Z'
        }).claimed,
        true
      );

      assert.equal(
        markOutboxConfirmed({
          empresaId: 'empresa-d07',
          operationId: 'dep-d07',
          confirmedAt:
            '2026-09-27T15:46:02.000Z',
          ack: { ok: true }
        }).changed,
        true
      );

      assert.deepEqual(
        listOutboxReady({
          empresaId: 'empresa-d07',
          referenceAt:
            '2026-09-27T15:46:03.000Z',
          limit: 10
        }).map((row) => row.operationId),
        ['child-d07']
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-d07-dependencies-');
});

test('D07 retry e recovery preservam estado e janela de reenvio', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });

      enqueueOutboxOperation({
        empresaId: 'empresa-d07',
        operationId: 'retry-d07',
        type: 'GENERIC',
        entityId: 'retry'
      });

      claimOutboxOperation({
        empresaId: 'empresa-d07',
        operationId: 'retry-d07',
        startedAt:
          '2026-09-27T15:47:00.000Z'
      });

      assert.equal(
        markOutboxRetry({
          empresaId: 'empresa-d07',
          operationId: 'retry-d07',
          error: 'temporário',
          nextAttemptAt:
            '2026-09-27T15:50:00.000Z',
          updatedAt:
            '2026-09-27T15:47:01.000Z'
        }).changed,
        true
      );

      assert.equal(
        listOutboxReady({
          empresaId: 'empresa-d07',
          referenceAt:
            '2026-09-27T15:49:59.000Z'
        }).length,
        0
      );

      assert.equal(
        listOutboxReady({
          empresaId: 'empresa-d07',
          referenceAt:
            '2026-09-27T15:50:00.000Z'
        }).length,
        1
      );

      claimOutboxOperation({
        empresaId: 'empresa-d07',
        operationId: 'retry-d07',
        startedAt:
          '2026-09-27T15:51:00.000Z'
      });

      assert.equal(
        recoverStaleOutbox({
          empresaId: 'empresa-d07',
          staleBefore:
            '2026-09-27T15:51:01.000Z',
          updatedAt:
            '2026-09-27T15:52:00.000Z',
          nextAttemptAt:
            '2026-09-27T15:53:00.000Z'
        }),
        1
      );

      const operation =
        getOutboxOperation(
          'empresa-d07',
          'retry-d07'
        );

      assert.equal(operation.status, 'RETRY');
      assert.equal(
        operation.nextAttemptAt,
        '2026-09-27T15:53:00.000Z'
      );
      assert.equal(operation.sendingStartedAt, null);
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-d07-retry-');
});

test('D07 conflict/manual-review e resumo continuam compatíveis', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });

      for (const operationId of [
        'conflict-d07',
        'manual-d07'
      ]) {
        enqueueOutboxOperation({
          empresaId: 'empresa-d07',
          operationId,
          type: 'GENERIC',
          entityId: operationId
        });

        claimOutboxOperation({
          empresaId: 'empresa-d07',
          operationId,
          startedAt:
            '2026-09-27T15:54:00.000Z'
        });
      }

      assert.equal(
        markOutboxConflict({
          empresaId: 'empresa-d07',
          operationId: 'conflict-d07',
          error: 'conflito D07'
        }).changed,
        true
      );

      assert.equal(
        markOutboxManualReview({
          empresaId: 'empresa-d07',
          operationId: 'manual-d07',
          error: 'revisão D07'
        }).changed,
        true
      );

      assert.deepEqual(
        getOutboxStatusSummary('empresa-d07'),
        {
          CONFLICT: 1,
          MANUAL_REVIEW: 1
        }
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-d07-terminal-');
});
