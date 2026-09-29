'use strict';

const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  initializeOfflineDatabase,
  getOfflineDatabase,
  closeOfflineDatabase,
  enqueueOutboxOperation,
  getOutboxOperation,
  listOutboxReady,
  claimOutboxOperation,
  markOutboxConfirmed,
  markOutboxRetry,
  recoverStaleOutbox,
  getOutboxStatusSummary,
  upsertProductCache,
  upsertFiscalProfileCache,
  upsertFiscalNumberLease,
  registerOfflineSaleAtomic,
  persistSignedNfceContingency,
  persistNfceQrCode,
  ensureFiscalOutboxForPendingNfce,
  getFiscalOutboxByFiscalId,
  listFiscalOutboxReady,
  claimFiscalOutboxOperation,
  markFiscalOutboxAmbiguous,
  recoverStaleFiscalOutbox,
  getNfceDocumentByFiscalId
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
  }, 'efisco-stage7-outbox-');
}

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(String(value), 'utf8')
    .digest('hex')
    .toUpperCase();
}

function seedPendingFiscalDocument(
  suffix
) {
  const empresaId =
    'empresa-s76-' + suffix;
  const produtoId =
    'produto-s76-' + suffix;
  const leaseId =
    'lease-s76-' + suffix;
  const deviceId =
    'device-s76-' + suffix;
  const saleId =
    'sale-s76-' + suffix;
  const fiscalId =
    'nfce:' + saleId;
  const saleOperationId =
    'op-sale-s76-' + suffix;

  upsertProductCache({
    empresaId,
    produtoId,
    codigo: 'P-S76-' + suffix,
    descricao: 'Produto S76',
    unidade: 'UN',
    precoCentavos: 1000,
    ativo: true,
    payload: {
      quantidadeEstoque: 50
    }
  });

  upsertFiscalProfileCache({
    empresaId,
    cnpj: '12345678000195',
    inscricaoEstadual: '123456789',
    razaoSocial: 'Empresa S76',
    nomeFantasia: 'S76',
    cep: '68525000',
    logradouro: 'Rua S76',
    numero: '76',
    bairro: 'Centro',
    municipio: 'Marabá',
    codigoMunicipio: '1504208',
    uf: 'PA',
    serieNfce: '1',
    ambiente: 'PRODUCAO',
    crt: '1',
    urlQrCode:
      'https://sefaz.example/qrcode',
    urlConsultaChave:
      'https://sefaz.example/consulta',
    revision: 'profile-s76-' + suffix,
    payload: {
      source: 'stage7-outbox'
    }
  });

  upsertFiscalNumberLease({
    empresaId,
    leaseId,
    requestId:
      'request-s76-' + suffix,
    deviceId,
    ambiente: 'PRODUCAO',
    modelo: 65,
    serie: '1',
    numeroInicial: 760,
    numeroFinal: 799,
    proximoNumero: 760,
    status: 'ACTIVE',
    reservadoEm:
      '2026-09-27T19:40:00.000Z',
    expiraEm:
      '2027-09-27T19:40:00.000Z',
    payload: {
      source: 'stage7-outbox'
    }
  });

  const sale =
    registerOfflineSaleAtomic({
      empresaId,
      saleId,
      operationId: saleOperationId,
      status:
        'PAID_OFFLINE_PENDING_SYNC',
      totalCentavos: 1000,
      occurredAt:
        '2026-09-27T19:41:00-03:00',
      paymentMethod: 'PIX',
      paymentParts: [{
        method: 'PIX',
        amount: 10
      }],
      items: [{
        itemId:
          'item-s76-' + suffix,
        produtoId,
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
      dependencies: [],
      fiscalAllocation: {
        leaseId,
        deviceId,
        fiscalId,
        operationId:
          saleOperationId + ':nfce',
        xJust:
          'Contingência controlada para etapa 7.6.'
      },
      payload: {
        source: 'stage7-outbox'
      }
    });

  assert.equal(sale.applied, true);

  persistSignedNfceContingency({
    empresaId,
    saleId,
    signedXml:
      '<signed fiscal="' +
      fiscalId +
      '">s76</signed>'
  });

  persistNfceQrCode({
    empresaId,
    saleId,
    qrCodeText:
      'https://sefaz.example/qrcode?p=' +
      suffix +
      '-' +
      'Q'.repeat(160)
  });

  const outbox =
    ensureFiscalOutboxForPendingNfce({
      empresaId,
      saleId,
      createdAt:
        '2026-09-27T19:42:00.000Z'
    });

  return {
    empresaId,
    saleId,
    fiscalId,
    saleOperationId,
    fiscalOperationId:
      outbox.operationId
  };
}

test('7.6 claim direto respeita dependências e não incrementa attempts enquanto bloqueado', async () => {
  await withFreshDatabase(() => {
    const empresaId =
      'empresa-s76-dependencies';

    enqueueOutboxOperation({
      empresaId,
      operationId: 'parent-s76',
      type: 'GENERIC',
      entityId: 'parent',
      createdAt:
        '2026-09-27T19:45:00.000Z'
    });

    enqueueOutboxOperation({
      empresaId,
      operationId: 'child-s76',
      type: 'GENERIC',
      entityId: 'child',
      dependencies: [
        'parent-s76'
      ],
      createdAt:
        '2026-09-27T19:45:01.000Z'
    });

    enqueueOutboxOperation({
      empresaId,
      operationId:
        'missing-dependency-s76',
      type: 'GENERIC',
      entityId: 'missing',
      dependencies: [
        'never-created-s76'
      ],
      createdAt:
        '2026-09-27T19:45:02.000Z'
    });

    const blocked =
      claimOutboxOperation({
        empresaId,
        operationId: 'child-s76',
        startedAt:
          '2026-09-27T19:46:00.000Z'
      });

    assert.equal(blocked.claimed, false);
    assert.equal(
      blocked.operation.status,
      'PENDING'
    );
    assert.equal(
      blocked.operation.attempts,
      0
    );

    const missingBlocked =
      claimOutboxOperation({
        empresaId,
        operationId:
          'missing-dependency-s76',
        startedAt:
          '2026-09-27T19:46:00.000Z'
      });

    assert.equal(
      missingBlocked.claimed,
      false
    );
    assert.equal(
      missingBlocked.operation.attempts,
      0
    );

    const parentClaim =
      claimOutboxOperation({
        empresaId,
        operationId: 'parent-s76',
        startedAt:
          '2026-09-27T19:46:01.000Z'
      });

    assert.equal(parentClaim.claimed, true);

    assert.equal(
      markOutboxConfirmed({
        empresaId,
        operationId: 'parent-s76',
        confirmedAt:
          '2026-09-27T19:46:02.000Z'
      }).changed,
      true
    );

    const childClaim =
      claimOutboxOperation({
        empresaId,
        operationId: 'child-s76',
        startedAt:
          '2026-09-27T19:46:03.000Z'
      });

    assert.equal(childClaim.claimed, true);
    assert.equal(
      childClaim.operation.attempts,
      1
    );

    const secondClaim =
      claimOutboxOperation({
        empresaId,
        operationId: 'child-s76',
        startedAt:
          '2026-09-27T19:46:04.000Z'
      });

    assert.equal(secondClaim.claimed, false);
    assert.equal(
      secondClaim.operation.attempts,
      1
    );
  });
});

test('7.6 retry/claim respeita janela e recovery stale é isolado por empresa e cutoff', async () => {
  await withFreshDatabase(() => {
    const empresaId = 'empresa-s76-retry';
    const otherEmpresaId =
      'empresa-s76-retry-other';

    enqueueOutboxOperation({
      empresaId,
      operationId: 'retry-window-s76',
      type: 'GENERIC',
      entityId: 'retry'
    });

    assert.equal(
      claimOutboxOperation({
        empresaId,
        operationId: 'retry-window-s76',
        startedAt:
          '2026-09-27T19:50:00.000Z'
      }).claimed,
      true
    );

    assert.equal(
      markOutboxRetry({
        empresaId,
        operationId: 'retry-window-s76',
        nextAttemptAt:
          '2026-09-27T19:55:00.000Z',
        updatedAt:
          '2026-09-27T19:50:01.000Z',
        error: 'retry s76'
      }).changed,
      true
    );

    const early =
      claimOutboxOperation({
        empresaId,
        operationId: 'retry-window-s76',
        startedAt:
          '2026-09-27T19:54:59.000Z'
      });

    assert.equal(early.claimed, false);
    assert.equal(early.operation.attempts, 1);

    const due =
      claimOutboxOperation({
        empresaId,
        operationId: 'retry-window-s76',
        startedAt:
          '2026-09-27T19:55:00.000Z'
      });

    assert.equal(due.claimed, true);
    assert.equal(due.operation.attempts, 2);

    enqueueOutboxOperation({
      empresaId,
      operationId: 'stale-s76',
      type: 'GENERIC',
      entityId: 'stale'
    });
    enqueueOutboxOperation({
      empresaId: otherEmpresaId,
      operationId: 'stale-other-s76',
      type: 'GENERIC',
      entityId: 'stale-other'
    });

    claimOutboxOperation({
      empresaId,
      operationId: 'stale-s76',
      startedAt:
        '2026-09-27T19:40:00.000Z'
    });
    claimOutboxOperation({
      empresaId: otherEmpresaId,
      operationId: 'stale-other-s76',
      startedAt:
        '2026-09-27T19:40:00.000Z'
    });

    const recovered =
      recoverStaleOutbox({
        empresaId,
        staleBefore:
          '2026-09-27T19:45:00.000Z',
        updatedAt:
          '2026-09-27T19:56:00.000Z',
        nextAttemptAt:
          '2026-09-27T19:57:00.000Z'
      });

    assert.equal(recovered, 1);

    assert.equal(
      getOutboxOperation(
        empresaId,
        'stale-s76'
      ).status,
      'RETRY'
    );

    assert.equal(
      getOutboxOperation(
        empresaId,
        'retry-window-s76'
      ).status,
      'SENDING'
    );

    assert.equal(
      getOutboxOperation(
        otherEmpresaId,
        'stale-other-s76'
      ).status,
      'SENDING'
    );
  });
});

test('7.6 sync_outbox e fiscal_outbox permanecem separados inclusive nos read-models', async () => {
  await withFreshDatabase((db) => {
    const fixture =
      seedPendingFiscalDocument(
        'separation'
      );

    enqueueOutboxOperation({
      empresaId: fixture.empresaId,
      operationId: 'sync-s76',
      type: 'GENERIC',
      entityId: 'sync-entity',
      createdAt:
        '2026-09-27T19:43:00.000Z'
    });

    assert.equal(
      getOutboxOperation(
        fixture.empresaId,
        fixture.fiscalOperationId
      ),
      null
    );

    assert.equal(
      getFiscalOutboxByFiscalId(
        fixture.empresaId,
        fixture.fiscalId
      ).operationId,
      fixture.fiscalOperationId
    );

    assert.deepEqual(
      listOutboxReady({
        empresaId: fixture.empresaId,
        referenceAt:
          '2026-09-27T20:00:00.000Z'
      }).map(
        (row) => row.operationId
      ).sort(),
      [
        fixture.saleOperationId,
        'sync-s76'
      ].sort()
    );

    assert.deepEqual(
      listFiscalOutboxReady({
        empresaId: fixture.empresaId,
        now:
          '2026-09-27T20:00:00.000Z'
      }).map(
        (row) => row.operationId
      ),
      [fixture.fiscalOperationId]
    );

    assert.deepEqual(
      getOutboxStatusSummary(
        fixture.empresaId
      ),
      {
        PENDING: 2
      }
    );

    const secondEnsure =
      ensureFiscalOutboxForPendingNfce({
        empresaId: fixture.empresaId,
        saleId: fixture.saleId,
        createdAt:
          '2026-09-27T20:01:00.000Z'
      });

    assert.equal(
      secondEnsure.operationId,
      fixture.fiscalOperationId
    );

    assert.equal(
      Number(
        db.prepare(
          'SELECT COUNT(*) AS count FROM fiscal_outbox WHERE empresa_id = ?'
        ).get(
          fixture.empresaId
        ).count
      ),
      1
    );

    assert.equal(
      Number(
        db.prepare(
          'SELECT COUNT(*) AS count FROM sync_outbox WHERE empresa_id = ? AND operation_id = ?'
        ).get(
          fixture.empresaId,
          fixture.fiscalOperationId
        ).count
      ),
      0
    );
  });
});

test('7.6 fiscal stale em RECONCILE mantém reconciliação e hash fixado antes de qualquer reenvio', async () => {
  await withFreshDatabase(() => {
    const fixture =
      seedPendingFiscalDocument(
        'reconcile-stale'
      );

    const hash =
      sha256('final-xml-s76');
    const otherHash =
      sha256('other-final-xml-s76');

    const first =
      claimFiscalOutboxOperation({
        empresaId: fixture.empresaId,
        fiscalId: fixture.fiscalId,
        finalXmlSha256: hash,
        now:
          '2026-09-27T20:10:00.000Z'
      });

    assert.equal(first.claimed, true);
    assert.equal(first.operation.attempts, 1);

    const ambiguous =
      markFiscalOutboxAmbiguous({
        empresaId: fixture.empresaId,
        fiscalId: fixture.fiscalId,
        nextAttemptAt:
          '2026-09-27T20:10:01.000Z',
        error: 'resultado ambíguo s76',
        now:
          '2026-09-27T20:10:00.500Z'
      });

    assert.equal(
      ambiguous.action,
      'RECONCILE_BY_KEY'
    );
    assert.equal(ambiguous.status, 'RETRY');

    assert.equal(
      claimFiscalOutboxOperation({
        empresaId: fixture.empresaId,
        fiscalId: fixture.fiscalId,
        finalXmlSha256: hash,
        now:
          '2026-09-27T20:10:00.999Z'
      }).claimed,
      false
    );

    const reconcileClaim =
      claimFiscalOutboxOperation({
        empresaId: fixture.empresaId,
        fiscalId: fixture.fiscalId,
        finalXmlSha256: hash,
        now:
          '2026-09-27T20:10:01.000Z'
      });

    assert.equal(
      reconcileClaim.claimed,
      true
    );
    assert.equal(
      reconcileClaim.operation.action,
      'RECONCILE_BY_KEY'
    );
    assert.equal(
      reconcileClaim.operation.attempts,
      2
    );

    assert.equal(
      recoverStaleFiscalOutbox({
        empresaId: fixture.empresaId,
        staleBefore:
          '2026-09-27T20:10:01.000Z',
        now:
          '2026-09-27T20:11:00.000Z',
        nextAttemptAt:
          '2026-09-27T20:11:00.000Z'
      }),
      1
    );

    const recovered =
      getFiscalOutboxByFiscalId(
        fixture.empresaId,
        fixture.fiscalId
      );

    assert.equal(recovered.status, 'RETRY');
    assert.equal(
      recovered.action,
      'RECONCILE_BY_KEY'
    );
    assert.equal(
      getNfceDocumentByFiscalId(
        fixture.empresaId,
        fixture.fiscalId
      ).state,
      'RECONCILE_BY_KEY'
    );

    assert.throws(
      () => claimFiscalOutboxOperation({
        empresaId: fixture.empresaId,
        fiscalId: fixture.fiscalId,
        finalXmlSha256: otherHash,
        now:
          '2026-09-27T20:11:00.000Z'
      }),
      /Hash do XML final diverge/
    );

    const retrySameHash =
      claimFiscalOutboxOperation({
        empresaId: fixture.empresaId,
        fiscalId: fixture.fiscalId,
        finalXmlSha256: hash,
        now:
          '2026-09-27T20:11:00.000Z'
      });

    assert.equal(
      retrySameHash.claimed,
      true
    );
    assert.equal(
      retrySameHash.operation.action,
      'RECONCILE_BY_KEY'
    );
    assert.equal(
      retrySameHash.operation.attempts,
      3
    );
  });
});
