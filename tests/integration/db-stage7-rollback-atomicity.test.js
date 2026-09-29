'use strict';

const { createHash } = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  initializeOfflineDatabase,
  getOfflineDatabase,
  closeOfflineDatabase,
  upsertProductCache,
  upsertFiscalProfileCache,
  upsertFiscalNumberLease,
  getFiscalNumberLeaseById,
  openCashSession,
  getCashSession,
  listCashMovements,
  listFinancialMovements,
  registerOfflineSaleAtomic,
  getSaleById,
  getStockProjection,
  getNfceDocumentBySaleId,
  getNfceDocumentByFiscalId,
  persistSignedNfceContingency,
  persistNfceQrCode,
  ensureFiscalOutboxForPendingNfce,
  getFiscalOutboxByFiscalId,
  claimFiscalOutboxOperation,
  markFiscalOutboxAuthorized,
  getOutboxOperation
} = require('../../offline-db');

const {
  openCashOffline,
  registerCashMovementOffline,
  closeCashOffline
} = require('../../offline-cash-service');

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
  }, 'efisco-stage7-rollback-');
}

function createOutboxAbortTrigger(db, name, type) {
  db.exec(`
    CREATE TEMP TRIGGER ${name}
    BEFORE INSERT ON main.sync_outbox
    WHEN NEW.type = '${type}'
    BEGIN
      SELECT RAISE(ABORT, 'stage7-forced-outbox-failure');
    END;
  `);
}

function seedFiscalPrerequisites({
  empresaId = 'empresa-stage7-fiscal',
  produtoId = 'produto-stage7-fiscal',
  leaseId = 'lease-stage7-fiscal',
  deviceId = 'device-stage7-fiscal'
} = {}) {
  upsertProductCache({
    empresaId,
    produtoId,
    codigo: 'P-STAGE7',
    descricao: 'Produto Stage 7',
    unidade: 'UN',
    precoCentavos: 1000,
    ativo: true,
    payload: {
      quantidadeEstoque: 100
    }
  });

  upsertFiscalProfileCache({
    empresaId,
    cnpj: '12345678000195',
    inscricaoEstadual: '123456789',
    razaoSocial: 'Empresa Stage 7',
    nomeFantasia: 'Stage 7',
    cep: '68525000',
    logradouro: 'Rua Teste',
    numero: '100',
    bairro: 'Centro',
    municipio: 'Marabá',
    codigoMunicipio: '1504208',
    uf: 'PA',
    serieNfce: '1',
    ambiente: 'PRODUCAO',
    crt: '1',
    urlQrCode: 'https://sefaz.example/qrcode',
    urlConsultaChave: 'https://sefaz.example/consulta',
    revision: 'profile-stage7',
    payload: {
      source: 'stage7-rollback'
    }
  });

  upsertFiscalNumberLease({
    empresaId,
    leaseId,
    requestId: 'request-' + leaseId,
    deviceId,
    ambiente: 'PRODUCAO',
    modelo: 65,
    serie: '1',
    numeroInicial: 500,
    numeroFinal: 599,
    proximoNumero: 500,
    status: 'ACTIVE',
    reservadoEm: '2026-09-27T18:50:00.000Z',
    expiraEm: '2027-09-27T18:50:00.000Z',
    payload: {
      source: 'stage7-rollback'
    }
  });

  return {
    empresaId,
    produtoId,
    leaseId,
    deviceId
  };
}

function fiscalSaleInput(seed, suffix, extras = {}) {
  const saleId = 'sale-stage7-' + suffix;
  const operationId = 'op-sale-stage7-' + suffix;
  const fiscalId = 'nfce:' + saleId;

  return {
    empresaId: seed.empresaId,
    saleId,
    operationId,
    status: 'PAID_OFFLINE_PENDING_SYNC',
    totalCentavos: 1000,
    occurredAt: '2026-09-27T18:55:00-03:00',
    paymentMethod: 'PIX',
    paymentParts: [{
      method: 'PIX',
      amount: 10
    }],
    items: [{
      itemId: 'item-stage7-' + suffix,
      produtoId: seed.produtoId,
      quantidade: '1',
      unitPriceCentavos: 1000,
      totalCentavos: 1000,
      payload: {
        ncm: '12345678',
        cfop: '5102',
        origem: '0',
        csosn: '102',
        cstPis: '04',
        cstCofins: '04'
      }
    }],
    financialMovements: [{
      movementId: 'financial-stage7-' + suffix,
      operationId: 'financial-op-stage7-' + suffix,
      accountId: 'PIX',
      direction: 1,
      amountCentavos: 1000,
      movementType: 'VENDA_PAGA',
      sourceId: saleId,
      occurredAt: '2026-09-27T18:55:00.000Z',
      payload: {
        source: 'stage7-rollback'
      }
    }],
    dependencies: [],
    fiscalAllocation: {
      leaseId: seed.leaseId,
      deviceId: seed.deviceId,
      fiscalId,
      operationId: operationId + ':nfce',
      xJust:
        'Emissão em contingência para validação de rollback atômico.'
    },
    payload: {
      source: 'stage7-rollback'
    },
    ...extras
  };
}

function finalHashFor(value) {
  return createHash('sha256')
    .update(String(value), 'utf8')
    .digest('hex')
    .toUpperCase();
}

test('7.4 movimento de caixa reverte ledger e outbox quando o enqueue final falha', async () => {
  await withFreshDatabase((db) => {
    const empresaId = 'empresa-stage7-cash-movement';

    const opened = openCashOffline({
      empresaId,
      requestId: 'open-stage7',
      saldoInicial: 20,
      fiscalEnvironment: 'HOMOLOGACAO'
    });

    const sessionId = opened.caixa.id;
    const before = listCashMovements({
      empresaId,
      sessionId
    });

    createOutboxAbortTrigger(
      db,
      'stage7_fail_cash_movement',
      'CASH_MOVEMENT'
    );

    assert.throws(
      () => registerCashMovementOffline({
        empresaId,
        caixaSessaoId: sessionId,
        requestId: 'movement-stage7-fail',
        tipo: 'SUPRIMENTO',
        valor: 5,
        motivo: 'rollback stage7'
      }),
      /stage7-forced-outbox-failure/
    );

    assert.deepEqual(
      listCashMovements({
        empresaId,
        sessionId
      }),
      before
    );

    assert.equal(
      getOutboxOperation(
        empresaId,
        'cash-movement-op:' +
          sessionId +
          ':movement-stage7-fail'
      ),
      null
    );
  });
});

test('7.4 fechamento de caixa reverte status/payload quando a outbox final falha', async () => {
  await withFreshDatabase((db) => {
    const empresaId = 'empresa-stage7-cash-close';

    const opened = openCashOffline({
      empresaId,
      requestId: 'open-stage7-close',
      saldoInicial: 30
    });
    const sessionId = opened.caixa.id;
    const before = getCashSession(
      empresaId,
      sessionId
    );

    createOutboxAbortTrigger(
      db,
      'stage7_fail_cash_close',
      'CASH_CLOSE'
    );

    assert.throws(
      () => closeCashOffline({
        empresaId,
        caixaSessaoId: sessionId,
        saldoContado: 30
      }),
      /stage7-forced-outbox-failure/
    );

    const after = getCashSession(
      empresaId,
      sessionId
    );

    assert.equal(after.status, 'OPEN');
    assert.equal(after.closedAt, null);
    assert.deepEqual(after.payload, before.payload);

    assert.equal(
      getOutboxOperation(
        empresaId,
        'cash-close:' + sessionId
      ),
      null
    );
  });
});

test('7.4 venda fiscal reverte venda, estoque, caixa, financeiro, NFC-e e contador quando o último write falha', async () => {
  await withFreshDatabase((db) => {
    const seed = seedFiscalPrerequisites({
      empresaId: 'empresa-stage7-sale-fiscal',
      produtoId: 'produto-stage7-sale-fiscal',
      leaseId: 'lease-stage7-sale-fiscal',
      deviceId: 'device-stage7-sale-fiscal'
    });

    openCashSession({
      empresaId: seed.empresaId,
      sessionId: 'cash-stage7-sale-fiscal',
      operationId: 'cash-open-stage7-sale-fiscal',
      openingBalanceCentavos: 1000,
      openedAt: '2026-09-27T18:54:00.000Z',
      payload: {
        source: 'stage7-rollback'
      }
    });

    const input = fiscalSaleInput(
      seed,
      'fiscal-rollback',
      {
        cashMovements: [{
          movementId:
            'cash-movement-stage7-fiscal-rollback',
          operationId:
            'cash-movement-op-stage7-fiscal-rollback',
          sessionId:
            'cash-stage7-sale-fiscal',
          direction: 1,
          amountCentavos: 1000,
          movementType: 'SALE_CASH',
          sourceId:
            'sale-stage7-fiscal-rollback',
          occurredAt:
            '2026-09-27T18:55:00.000Z',
          payload: {
            source: 'stage7-rollback'
          }
        }]
      }
    );

    const leaseBefore =
      getFiscalNumberLeaseById(
        seed.empresaId,
        seed.leaseId
      );

    createOutboxAbortTrigger(
      db,
      'stage7_fail_sale_paid_fiscal',
      'SALE_PAID'
    );

    assert.throws(
      () => registerOfflineSaleAtomic(input),
      /stage7-forced-outbox-failure/
    );

    assert.equal(
      getSaleById(
        seed.empresaId,
        input.saleId
      ),
      null
    );

    assert.equal(
      getStockProjection(
        seed.empresaId,
        seed.produtoId
      ).quantityMicrounits,
      0
    );

    assert.equal(
      listCashMovements({
        empresaId: seed.empresaId,
        sessionId: 'cash-stage7-sale-fiscal'
      }).length,
      0
    );

    assert.equal(
      listFinancialMovements({
        empresaId: seed.empresaId,
        accountId: 'PIX'
      }).length,
      0
    );

    assert.equal(
      getNfceDocumentBySaleId(
        seed.empresaId,
        input.saleId
      ),
      null
    );

    const leaseAfter =
      getFiscalNumberLeaseById(
        seed.empresaId,
        seed.leaseId
      );

    assert.equal(
      leaseAfter.proximoNumero,
      leaseBefore.proximoNumero
    );
    assert.equal(
      leaseAfter.status,
      leaseBefore.status
    );

    assert.equal(
      getOutboxOperation(
        seed.empresaId,
        input.operationId
      ),
      null
    );
  });
});

test('7.4 autorização fiscal reverte documento se a confirmação da fiscal_outbox falhar', async () => {
  await withFreshDatabase((db) => {
    const seed = seedFiscalPrerequisites({
      empresaId: 'empresa-stage7-fiscal-outbox',
      produtoId: 'produto-stage7-fiscal-outbox',
      leaseId: 'lease-stage7-fiscal-outbox',
      deviceId: 'device-stage7-fiscal-outbox'
    });

    const input =
      fiscalSaleInput(
        seed,
        'fiscal-outbox-rollback'
      );

    const sale =
      registerOfflineSaleAtomic(input);

    assert.equal(sale.applied, true);

    const signedXml =
      '<NFe xmlns="http://www.portalfiscal.inf.br/nfe">' +
      '<infNFe Id="' +
      input.fiscalAllocation.fiscalId +
      '">stage7</infNFe></NFe>';

    persistSignedNfceContingency({
      empresaId: seed.empresaId,
      saleId: input.saleId,
      signedXml
    });

    persistNfceQrCode({
      empresaId: seed.empresaId,
      saleId: input.saleId,
      qrCodeText:
        'https://sefaz.example/qrcode?p=stage7-' +
        'A'.repeat(140)
    });

    ensureFiscalOutboxForPendingNfce({
      empresaId: seed.empresaId,
      saleId: input.saleId,
      createdAt: '2026-09-27T19:00:00.000Z'
    });

    claimFiscalOutboxOperation({
      empresaId: seed.empresaId,
      fiscalId: input.fiscalAllocation.fiscalId,
      finalXmlSha256:
        finalHashFor('stage7-final-xml'),
      now: '2026-09-27T19:01:00.000Z'
    });

    const beforeDocument =
      getNfceDocumentByFiscalId(
        seed.empresaId,
        input.fiscalAllocation.fiscalId
      );
    const beforeOutbox =
      getFiscalOutboxByFiscalId(
        seed.empresaId,
        input.fiscalAllocation.fiscalId
      );

    assert.equal(beforeDocument.state, 'SENDING');
    assert.equal(beforeOutbox.status, 'SENDING');

    db.exec(`
      CREATE TEMP TRIGGER stage7_fail_fiscal_confirm
      BEFORE UPDATE ON main.fiscal_outbox
      WHEN OLD.status = 'SENDING'
       AND NEW.status = 'CONFIRMED'
      BEGIN
        SELECT RAISE(
          ABORT,
          'stage7-forced-fiscal-confirm-failure'
        );
      END;
    `);

    assert.throws(
      () => markFiscalOutboxAuthorized({
        empresaId: seed.empresaId,
        fiscalId:
          input.fiscalAllocation.fiscalId,
        protocolo: '150260000000777',
        cStat: '100',
        xMotivo: 'Autorizado o uso da NF-e',
        autorizadoEm:
          '2026-09-27T19:01:05-03:00',
        processedXml:
          '<nfeProc>stage7-authorized</nfeProc>',
        now: '2026-09-27T19:01:05.000Z'
      }),
      /stage7-forced-fiscal-confirm-failure/
    );

    const afterDocument =
      getNfceDocumentByFiscalId(
        seed.empresaId,
        input.fiscalAllocation.fiscalId
      );
    const afterOutbox =
      getFiscalOutboxByFiscalId(
        seed.empresaId,
        input.fiscalAllocation.fiscalId
      );

    assert.equal(afterDocument.state, 'SENDING');
    assert.equal(afterDocument.protocolo, null);
    assert.equal(afterDocument.processedXml, null);
    assert.equal(afterOutbox.status, 'SENDING');
    assert.equal(afterOutbox.confirmedAt, null);

    db.exec(
      'DROP TRIGGER stage7_fail_fiscal_confirm;'
    );

    const confirmed =
      markFiscalOutboxAuthorized({
        empresaId: seed.empresaId,
        fiscalId:
          input.fiscalAllocation.fiscalId,
        protocolo: '150260000000777',
        cStat: '100',
        xMotivo: 'Autorizado o uso da NF-e',
        autorizadoEm:
          '2026-09-27T19:01:05-03:00',
        processedXml:
          '<nfeProc>stage7-authorized</nfeProc>',
        now: '2026-09-27T19:01:05.000Z'
      });

    assert.equal(confirmed.status, 'CONFIRMED');
    assert.equal(
      getNfceDocumentByFiscalId(
        seed.empresaId,
        input.fiscalAllocation.fiscalId
      ).state,
      'AUTHORIZED'
    );
  });
});
