'use strict';

const crypto = require('node:crypto');
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
  getActiveFiscalNumberLease,
  reconcileLocalNfceCounter,
  registerOfflineSaleAtomic,
  getSaleById,
  getNfceDocumentBySaleId,
  getNfceDocumentByFiscalId,
  persistSignedNfceContingency,
  persistNfceQrCode,
  ensureFiscalOutboxForPendingNfce,
  claimFiscalOutboxOperation,
  markFiscalOutboxAuthorized,
  getFiscalOutboxByFiscalId,
  listAuthorizedNfcePendingSync,
  enqueueOutboxOperation,
  getOutboxOperation
} = require('../../offline-db');

const {
  withTempDir
} = require('../helpers/temp-dir');

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(String(value), 'utf8')
    .digest('hex')
    .toUpperCase();
}

async function withFreshDatabase(callback, prefix) {
  return withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });
      return await callback(userDataDir);
    } finally {
      try {
        closeOfflineDatabase();
      } catch (_) {}
    }
  }, prefix || 'efisco-stage7-fiscal-');
}

function seedProduct({
  empresaId,
  produtoId = 'produto-s77'
}) {
  upsertProductCache({
    empresaId,
    produtoId,
    codigo: 'P-S77',
    descricao: 'Produto Stage 7.7',
    unidade: 'UN',
    precoCentavos: 1000,
    ativo: true,
    payload: {
      quantidadeEstoque: 100
    }
  });

  return produtoId;
}

function seedProfile({
  empresaId,
  serie = '1',
  ambiente = 'PRODUCAO',
  revision = 'profile-s77-v1',
  razaoSocial = 'Empresa Stage 7.7'
}) {
  return upsertFiscalProfileCache({
    empresaId,
    cnpj: '12345678000195',
    inscricaoEstadual: '123456789',
    razaoSocial,
    nomeFantasia: 'S77',
    cep: '68525000',
    logradouro: 'Rua Stage 7.7',
    numero: '77',
    complemento: null,
    bairro: 'Centro',
    municipio: 'Marabá',
    codigoMunicipio: '1504208',
    uf: 'PA',
    serieNfce: serie,
    ambiente,
    crt: '1',
    regimeTributario: null,
    urlQrCode: 'https://sefaz.example/qrcode',
    urlConsultaChave: 'https://sefaz.example/consulta',
    revision,
    sourceUpdatedAt: '2026-09-27T20:00:00.000Z',
    payload: {
      source: 'stage7-fiscal',
      revision
    }
  });
}

function seedLease({
  empresaId,
  leaseId = 'lease-s77',
  requestId = 'request-s77',
  deviceId = 'device-s77',
  serie = '1',
  numeroInicial = 770,
  numeroFinal = 799,
  proximoNumero = 770,
  expiraEm = null
}) {
  return upsertFiscalNumberLease({
    empresaId,
    leaseId,
    requestId,
    deviceId,
    ambiente: 'PRODUCAO',
    modelo: 65,
    serie,
    numeroInicial,
    numeroFinal,
    proximoNumero,
    status: 'ACTIVE',
    reservadoEm:
      '2026-09-27T20:00:00.000Z',
    expiraEm,
    payload: {
      source: 'stage7-fiscal'
    }
  });
}

function saleInput({
  empresaId,
  produtoId,
  saleId,
  operationId,
  leaseId = 'lease-s77',
  deviceId = 'device-s77',
  occurredAt = '2026-09-27T20:05:00-03:00'
}) {
  return {
    empresaId,
    saleId,
    operationId,
    status: 'PAID_OFFLINE_PENDING_SYNC',
    totalCentavos: 1000,
    occurredAt,
    paymentMethod: 'PIX',
    paymentParts: [{
      method: 'PIX',
      amount: 10
    }],
    items: [{
      itemId: 'item-' + saleId,
      produtoId,
      quantidade: '1',
      unitPriceCentavos: 1000,
      totalCentavos: 1000,
      payload: {
        productCode: 'P-S77',
        name: 'Produto Stage 7.7',
        unit: 'UN',
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
      fiscalId: 'nfce:' + saleId,
      operationId: operationId + ':nfce',
      xJust:
        'Emissão em contingência controlada para validação fiscal da etapa 7.7.'
    },
    payload: {
      source: 'stage7-fiscal'
    }
  };
}

function persistPendingFiscal({
  empresaId,
  saleId
}) {
  const document =
    getNfceDocumentBySaleId(
      empresaId,
      saleId
    );

  const signedXml =
    '<NFe xmlns="http://www.portalfiscal.inf.br/nfe">' +
    '<infNFe Id="NFe' +
    document.chaveAcesso +
    '">stage7-fiscal</infNFe></NFe>';

  persistSignedNfceContingency({
    empresaId,
    saleId,
    signedXml
  });

  persistNfceQrCode({
    empresaId,
    saleId,
    qrCodeText:
      'https://sefaz.example/qrcode?p=' +
      document.chaveAcesso +
      '-' +
      'Q'.repeat(96)
  });

  return ensureFiscalOutboxForPendingNfce({
    empresaId,
    saleId,
    createdAt:
      '2026-09-27T20:10:00.000Z'
  });
}

test('7.7 contador NFC-e não regride após reopen e vendas seguintes mantêm número/chave únicos', async () => {
  await withTempDir(async (userDataDir) => {
    const empresaId =
      'empresa-s77-counter';
    const produtoId =
      'produto-s77-counter';
    const leaseId =
      'lease-s77-counter';
    const deviceId =
      'device-s77-counter';

    let firstDocument;

    try {
      initializeOfflineDatabase({ userDataDir });
      seedProduct({
        empresaId,
        produtoId
      });
      seedProfile({ empresaId });
      seedLease({
        empresaId,
        leaseId,
        requestId:
          'request-s77-counter',
        deviceId,
        numeroInicial: 770,
        numeroFinal: 799,
        proximoNumero: 770
      });

      const first =
        registerOfflineSaleAtomic(
          saleInput({
            empresaId,
            produtoId,
            saleId: 'sale-s77-770',
            operationId: 'op-s77-770',
            leaseId,
            deviceId
          })
        );

      assert.equal(first.applied, true);
      assert.equal(first.fiscal.numero, 770);

      firstDocument =
        getNfceDocumentBySaleId(
          empresaId,
          'sale-s77-770'
        );

      assert.equal(
        getFiscalNumberLeaseById(
          empresaId,
          leaseId
        ).proximoNumero,
        771
      );
    } finally {
      closeOfflineDatabase();
    }

    try {
      initializeOfflineDatabase({ userDataDir });

      const staleReference =
        reconcileLocalNfceCounter({
          empresaId,
          deviceId,
          ambiente: 'PRODUCAO',
          modelo: 65,
          serie: '1',
          proximoNumero: 770,
          now:
            '2026-09-27T20:06:00.000Z'
        });

      assert.equal(
        staleReference.previousNext,
        771
      );
      assert.equal(
        staleReference.proximoNumero,
        771
      );
      assert.equal(
        staleReference.advanced,
        false
      );

      const second =
        registerOfflineSaleAtomic(
          saleInput({
            empresaId,
            produtoId,
            saleId: 'sale-s77-771',
            operationId: 'op-s77-771',
            leaseId,
            deviceId,
            occurredAt:
              '2026-09-27T20:07:00-03:00'
          })
        );

      assert.equal(second.fiscal.numero, 771);
      assert.notEqual(
        second.fiscal.chaveAcesso,
        firstDocument.chaveAcesso
      );

      const advancedReference =
        reconcileLocalNfceCounter({
          empresaId,
          deviceId,
          ambiente: 'PRODUCAO',
          modelo: 65,
          serie: '1',
          proximoNumero: 775,
          now:
            '2026-09-27T20:08:00.000Z'
        });

      assert.equal(
        advancedReference.previousNext,
        772
      );
      assert.equal(
        advancedReference.proximoNumero,
        775
      );
      assert.equal(
        advancedReference.advanced,
        true
      );

      const active =
        getActiveFiscalNumberLease({
          empresaId,
          deviceId,
          ambiente: 'PRODUCAO',
          modelo: 65,
          serie: '1',
          now:
            '2026-09-27T20:08:01.000Z'
        });

      assert.equal(active.proximoNumero, 775);

      const third =
        registerOfflineSaleAtomic(
          saleInput({
            empresaId,
            produtoId,
            saleId: 'sale-s77-775',
            operationId: 'op-s77-775',
            leaseId,
            deviceId,
            occurredAt:
              '2026-09-27T20:09:00-03:00'
          })
        );

      assert.equal(third.fiscal.numero, 775);

      const db = getOfflineDatabase();

      assert.equal(
        Number(
          db.prepare(
            'SELECT COUNT(DISTINCT numero) AS count FROM nfce_documents WHERE empresa_id = ?'
          ).get(empresaId).count
        ),
        3
      );

      assert.equal(
        Number(
          db.prepare(
            'SELECT COUNT(DISTINCT chave_acesso) AS count FROM nfce_documents WHERE empresa_id = ?'
          ).get(empresaId).count
        ),
        3
      );

      assert.equal(
        getFiscalNumberLeaseById(
          empresaId,
          leaseId
        ).proximoNumero,
        776
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-stage7-fiscal-counter-');
});

test('7.7 divergência série perfil/lease aborta venda fiscal sem consumir contador', async () => {
  await withFreshDatabase(() => {
    const empresaId =
      'empresa-s77-series-mismatch';
    const produtoId =
      'produto-s77-series-mismatch';
    const leaseId =
      'lease-s77-series-mismatch';
    const deviceId =
      'device-s77-series-mismatch';

    seedProduct({
      empresaId,
      produtoId
    });
    seedProfile({
      empresaId,
      serie: '1'
    });
    seedLease({
      empresaId,
      leaseId,
      requestId:
        'request-s77-series-mismatch',
      deviceId,
      serie: '2',
      numeroInicial: 780,
      numeroFinal: 789,
      proximoNumero: 780
    });

    const before =
      getFiscalNumberLeaseById(
        empresaId,
        leaseId
      );

    assert.throws(
      () => registerOfflineSaleAtomic(
        saleInput({
          empresaId,
          produtoId,
          saleId:
            'sale-s77-series-mismatch',
          operationId:
            'op-s77-series-mismatch',
          leaseId,
          deviceId
        })
      ),
      /Série do perfil fiscal diverge/
    );

    assert.equal(
      getSaleById(
        empresaId,
        'sale-s77-series-mismatch'
      ),
      null
    );

    assert.equal(
      getNfceDocumentBySaleId(
        empresaId,
        'sale-s77-series-mismatch'
      ),
      null
    );

    const after =
      getFiscalNumberLeaseById(
        empresaId,
        leaseId
      );

    assert.equal(
      after.proximoNumero,
      before.proximoNumero
    );
    assert.equal(
      after.status,
      before.status
    );
  }, 'efisco-stage7-fiscal-mismatch-');
});

test('7.7 snapshot fiscal da venda permanece imutável após atualização do perfil cache', async () => {
  await withFreshDatabase(() => {
    const empresaId =
      'empresa-s77-snapshot';
    const produtoId =
      'produto-s77-snapshot';
    const leaseId =
      'lease-s77-snapshot';
    const deviceId =
      'device-s77-snapshot';

    seedProduct({
      empresaId,
      produtoId
    });
    seedProfile({
      empresaId,
      revision: 'profile-s77-old',
      razaoSocial:
        'Empresa Stage 7.7 Original'
    });
    seedLease({
      empresaId,
      leaseId,
      requestId:
        'request-s77-snapshot',
      deviceId,
      numeroInicial: 790,
      numeroFinal: 799,
      proximoNumero: 790
    });

    registerOfflineSaleAtomic(
      saleInput({
        empresaId,
        produtoId,
        saleId: 'sale-s77-snapshot',
        operationId: 'op-s77-snapshot',
        leaseId,
        deviceId
      })
    );

    const before =
      getNfceDocumentBySaleId(
        empresaId,
        'sale-s77-snapshot'
      );

    assert.equal(
      before.profileRevision,
      'profile-s77-old'
    );
    assert.equal(
      before.inputSnapshot.issuer.revision,
      'profile-s77-old'
    );
    assert.equal(
      before.inputSnapshot.issuer.razaoSocial,
      'Empresa Stage 7.7 Original'
    );

    seedProfile({
      empresaId,
      revision: 'profile-s77-new',
      razaoSocial:
        'Empresa Stage 7.7 Atualizada'
    });

    const after =
      getNfceDocumentBySaleId(
        empresaId,
        'sale-s77-snapshot'
      );

    assert.equal(
      after.profileRevision,
      'profile-s77-old'
    );
    assert.equal(
      after.inputSnapshot.issuer.revision,
      'profile-s77-old'
    );
    assert.equal(
      after.inputSnapshot.issuer.razaoSocial,
      'Empresa Stage 7.7 Original'
    );
  }, 'efisco-stage7-fiscal-snapshot-');
});

test('7.7 AUTHORIZED persiste após reopen e bridge NFCE_AUTHORIZED é entregue uma única vez', async () => {
  await withTempDir(async (userDataDir) => {
    const empresaId =
      'empresa-s77-authorized';
    const produtoId =
      'produto-s77-authorized';
    const leaseId =
      'lease-s77-authorized';
    const deviceId =
      'device-s77-authorized';
    const saleId =
      'sale-s77-authorized';
    const saleOperationId =
      'op-s77-authorized';
    const fiscalId =
      'nfce:' + saleId;

    try {
      initializeOfflineDatabase({ userDataDir });
      seedProduct({
        empresaId,
        produtoId
      });
      seedProfile({ empresaId });
      seedLease({
        empresaId,
        leaseId,
        requestId:
          'request-s77-authorized',
        deviceId,
        numeroInicial: 795,
        numeroFinal: 799,
        proximoNumero: 795
      });

      registerOfflineSaleAtomic(
        saleInput({
          empresaId,
          produtoId,
          saleId,
          operationId:
            saleOperationId,
          leaseId,
          deviceId
        })
      );

      persistPendingFiscal({
        empresaId,
        saleId
      });

      const finalHash =
        sha256('final-xml-s77-authorized');

      const claim =
        claimFiscalOutboxOperation({
          empresaId,
          fiscalId,
          finalXmlSha256: finalHash,
          now:
            '2026-09-27T20:15:00.000Z'
        });

      assert.equal(claim.claimed, true);

      markFiscalOutboxAuthorized({
        empresaId,
        fiscalId,
        protocolo: '150260000000777',
        cStat: '100',
        xMotivo: 'Autorizado o uso da NF-e',
        autorizadoEm:
          '2026-09-27T20:15:05-03:00',
        processedXml:
          '<nfeProc>stage7-7-authorized</nfeProc>',
        now:
          '2026-09-27T20:15:05.000Z'
      });

      const pending =
        listAuthorizedNfcePendingSync({
          empresaId,
          limit: 10
        });

      assert.equal(pending.length, 1);
      assert.equal(pending[0].fiscalId, fiscalId);
      assert.equal(
        pending[0].saleSyncOperationId,
        saleOperationId
      );
    } finally {
      closeOfflineDatabase();
    }

    try {
      initializeOfflineDatabase({ userDataDir });

      const document =
        getNfceDocumentByFiscalId(
          empresaId,
          fiscalId
        );
      const fiscalOutbox =
        getFiscalOutboxByFiscalId(
          empresaId,
          fiscalId
        );

      assert.equal(document.state, 'AUTHORIZED');
      assert.equal(
        document.protocolo,
        '150260000000777'
      );
      assert.equal(
        fiscalOutbox.status,
        'CONFIRMED'
      );

      const pending =
        listAuthorizedNfcePendingSync({
          empresaId,
          limit: 10
        });

      assert.equal(pending.length, 1);

      const syncOperationId =
        'nfce-auth:' + fiscalId;

      enqueueOutboxOperation({
        empresaId,
        operationId: syncOperationId,
        type: 'NFCE_AUTHORIZED',
        entityId: saleId,
        payload: {
          fiscalId,
          saleId,
          protocolo:
            pending[0].protocolo,
          cStat: pending[0].cStat
        },
        dependencies: [
          saleOperationId
        ],
        createdAt:
          '2026-09-27T20:16:00.000Z'
      });

      assert.equal(
        getOutboxOperation(
          empresaId,
          syncOperationId
        ).type,
        'NFCE_AUTHORIZED'
      );

      assert.deepEqual(
        listAuthorizedNfcePendingSync({
          empresaId,
          limit: 10
        }),
        []
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-stage7-fiscal-authorized-');
});
