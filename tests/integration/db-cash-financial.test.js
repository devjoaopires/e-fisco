'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  initializeOfflineDatabase,
  closeOfflineDatabase,
  getCashSession,
  getOpenCashSession,
  openCashSession,
  closeCashSession,
  registerCashMovement,
  listCashMovements,
  aggregateCashSessionActivity,
  registerFinancialMovement,
  listFinancialMovements,
  enqueueOutboxOperation,
  getOutboxOperation
} = require('../../offline-db');

const {
  openCashOffline,
  registerCashMovementOffline,
  closeCashOffline,
  mirrorRemoteCashState
} = require('../../offline-cash-service');

const {
  withTempDir
} = require('../helpers/temp-dir');

test('D08 repositories/read-models preservam caixa e financeiro pela fachada', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });

      const opened = openCashSession({
        empresaId: 'empresa-d08',
        sessionId: 'cash-d08',
        operationId: 'cash-open-d08',
        openingBalanceCentavos: 1000,
        openedAt: '2026-09-27T16:10:00.000Z',
        payload: { source: 'd08' }
      });

      assert.equal(opened.applied, true);
      assert.equal(
        getOpenCashSession('empresa-d08').sessionId,
        'cash-d08'
      );

      const movement = registerCashMovement({
        empresaId: 'empresa-d08',
        movementId: 'cash-movement-d08',
        operationId: 'cash-movement-op-d08',
        sessionId: 'cash-d08',
        direction: 'ENTRADA',
        amountCentavos: 250,
        movementType: 'SUPRIMENTO',
        occurredAt: '2026-09-27T16:11:00.000Z',
        payload: { motivo: 'troco' }
      });

      assert.equal(movement.applied, true);
      assert.equal(
        listCashMovements({
          empresaId: 'empresa-d08',
          sessionId: 'cash-d08'
        }).length,
        1
      );

      registerFinancialMovement({
        empresaId: 'empresa-d08',
        movementId: 'financial-d08',
        operationId: 'financial-op-d08',
        accountId: 'PIX',
        direction: 1,
        amountCentavos: 500,
        movementType: 'VENDA_PAGA',
        sourceId: 'sale-d08',
        occurredAt: '2026-09-27T16:12:00.000Z',
        payload: {
          meio: 'PIX',
          caixaSessaoId: 'cash-d08'
        }
      });

      assert.equal(
        listFinancialMovements({
          empresaId: 'empresa-d08',
          accountId: 'PIX'
        }).length,
        1
      );

      const summary = aggregateCashSessionActivity({
        empresaId: 'empresa-d08',
        sessionId: 'cash-d08'
      });

      assert.equal(summary.suprimentosCentavos, 250);
      assert.equal(summary.signedCashCentavos, 250);

      const closed = closeCashSession({
        empresaId: 'empresa-d08',
        sessionId: 'cash-d08',
        closedAt: '2026-09-27T16:13:00.000Z'
      });

      assert.equal(closed.applied, true);
      assert.equal(
        getCashSession(
          'empresa-d08',
          'cash-d08'
        ).status,
        'CLOSED'
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-d08-repositories-');
});

test('D08 cash service mantém abertura/movimento/fechamento atômicos com outbox', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });

      const opened = openCashOffline({
        empresaId: 'empresa-d08-service',
        requestId: 'open-1',
        saldoInicial: 10,
        fiscalEnvironment: 'HOMOLOGACAO',
        operadorId: 'op-d08'
      });

      assert.equal(opened.success, true);
      assert.equal(opened.aberto, true);

      const sessionId =
        opened.caixa &&
        opened.caixa.id;

      assert.ok(sessionId);

      const movement = registerCashMovementOffline({
        empresaId: 'empresa-d08-service',
        caixaSessaoId: sessionId,
        requestId: 'movement-1',
        tipo: 'SUPRIMENTO',
        valor: 5,
        motivo: 'troco'
      });

      assert.equal(movement.success, true);
      assert.equal(movement.idempotente, false);

      const close = closeCashOffline({
        empresaId: 'empresa-d08-service',
        caixaSessaoId: sessionId,
        saldoContado: 15,
        operadorId: 'op-d08'
      });

      assert.equal(close.success, true);
      assert.equal(close.aberto, false);

      const closeAgain = closeCashOffline({
        empresaId: 'empresa-d08-service',
        caixaSessaoId: sessionId,
        saldoContado: 15,
        operadorId: 'op-d08'
      });

      assert.equal(closeAgain.success, true);
      assert.match(
        closeAgain.message,
        /já estava fechado/
      );

      assert.equal(
        getOutboxOperation(
          'empresa-d08-service',
          'cash-open:' + sessionId
        ).type,
        'CASH_OPEN'
      );
      assert.equal(
        getOutboxOperation(
          'empresa-d08-service',
          'cash-close:' + sessionId
        ).type,
        'CASH_CLOSE'
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-d08-service-');
});

test('D08 cash service faz rollback quando enqueue da abertura falha', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });

      const empresaId = 'empresa-d08-rollback';
      const requestId = 'request-rollback';
      const sessionId =
        'offline-cash:' +
        empresaId +
        ':' +
        requestId;
      const operationId =
        'cash-open:' +
        sessionId;

      enqueueOutboxOperation({
        empresaId,
        operationId,
        type: 'CONFLICTING_TYPE',
        entityId: 'different-entity',
        payload: {},
        createdAt: '2026-09-27T16:20:00.000Z'
      });

      assert.throws(
        () => openCashOffline({
          empresaId,
          requestId,
          saldoInicial: 25
        }),
        /já existe com outro tipo ou entidade/
      );

      assert.equal(
        getCashSession(
          empresaId,
          sessionId
        ),
        null
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-d08-rollback-');
});

test('D08 mirror remoto atualiza payload sem SQL no application service', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });

      mirrorRemoteCashState({
        empresaId: 'empresa-d08-mirror',
        aberto: true,
        caixa: {
          sessionId: 'remote-cash-d08',
          openingBalanceCentavos: 2000,
          openedAt: '2026-09-27T16:30:00.000Z',
          fiscalEnvironment: 'PRODUCAO',
          remoteSummary: {
            snapshotAt:
              '2026-09-27T16:29:00.000Z',
            saldoEsperadoCentavos: 2000
          }
        }
      });

      mirrorRemoteCashState({
        empresaId: 'empresa-d08-mirror',
        aberto: true,
        caixa: {
          sessionId: 'remote-cash-d08',
          openingBalanceCentavos: 2000,
          openedAt: '2026-09-27T16:30:00.000Z',
          fiscalEnvironment: 'PRODUCAO',
          remoteSummary: {
            snapshotAt:
              '2026-09-27T16:31:00.000Z',
            saldoEsperadoCentavos: 2500
          }
        }
      });

      const session = getCashSession(
        'empresa-d08-mirror',
        'remote-cash-d08'
      );

      assert.equal(
        session.payload.remoteSynced,
        true
      );
      assert.equal(
        session.payload.remoteSummaryBase
          .saldoEsperadoCentavos,
        2500
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-d08-mirror-');
});
