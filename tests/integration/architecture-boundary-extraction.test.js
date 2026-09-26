'use strict';

const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  initializeOfflineDatabase,
  closeOfflineDatabase,
  upsertProductCache,
  upsertFiscalProfileCache,
  upsertFiscalNumberLease,
  registerOfflineSaleAtomic,
  persistSignedNfceContingency,
  persistNfceQrCode,
  ensureFiscalOutboxForPendingNfce,
  claimFiscalOutboxOperation,
  markFiscalOutboxAuthorized,
  listAuthorizedNfcePendingSync,
  getOutboxStatusSummary,
  enqueueOutboxOperation,
  claimOutboxOperation,
  markOutboxConfirmed
} = require('../../offline-db');

const {
  withTempDir
} = require('../helpers/temp-dir');

async function withFreshDatabase(callback) {
  return withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });
      return await callback();
    } finally {
      try {
        closeOfflineDatabase();
      } catch (_) {}
    }
  }, 'efisco-step74-boundary-');
}

test('getOutboxStatusSummary agrega status por empresa sem expor SQL ao chamador', async () => {
  await withFreshDatabase(() => {
    enqueueOutboxOperation({
      empresaId: 'empresa-step74-a',
      operationId: 'op-step74-pending',
      type: 'GENERIC',
      entityId: 'entity-pending',
      payload: {
        source: 'step74'
      },
      createdAt: '2026-09-25T14:00:00.000Z'
    });

    enqueueOutboxOperation({
      empresaId: 'empresa-step74-a',
      operationId: 'op-step74-confirmed',
      type: 'GENERIC',
      entityId: 'entity-confirmed',
      payload: {
        source: 'step74'
      },
      createdAt: '2026-09-25T14:00:01.000Z'
    });

    enqueueOutboxOperation({
      empresaId: 'empresa-step74-b',
      operationId: 'op-step74-other-company',
      type: 'GENERIC',
      entityId: 'entity-other-company',
      payload: {
        source: 'step74'
      },
      createdAt: '2026-09-25T14:00:02.000Z'
    });

    const claimed = claimOutboxOperation({
      empresaId: 'empresa-step74-a',
      operationId: 'op-step74-confirmed',
      startedAt: '2026-09-25T14:01:00.000Z'
    });

    assert.equal(claimed.claimed, true);

    const confirmed = markOutboxConfirmed({
      empresaId: 'empresa-step74-a',
      operationId: 'op-step74-confirmed',
      confirmedAt: '2026-09-25T14:01:01.000Z',
      ack: {
        source: 'step74'
      }
    });

    assert.equal(confirmed.changed, true);

    assert.deepEqual(
      getOutboxStatusSummary('empresa-step74-a'),
      {
        CONFIRMED: 1,
        PENDING: 1
      }
    );

    assert.deepEqual(
      getOutboxStatusSummary('empresa-step74-b'),
      {
        PENDING: 1
      }
    );
  });
});

test('listAuthorizedNfcePendingSync entrega read model e some após enfileirar NFCE_AUTHORIZED', async () => {
  await withFreshDatabase(() => {
    const empresaId = 'empresa-step74-fiscal';
    const deviceId = 'device-step74';
    const saleId = 'sale-step74';
    const fiscalId = `nfce:${saleId}`;
    const saleOperationId = 'op-sale-step74';

    upsertProductCache({
      empresaId,
      produtoId: 'produto-step74',
      codigo: 'P74',
      descricao: 'Produto Step74',
      unidade: 'UN',
      precoCentavos: 1500,
      ativo: true,
      payload: {
        quantidadeEstoque: 100
      }
    });

    upsertFiscalProfileCache({
      empresaId,
      cnpj: '12345678000195',
      inscricaoEstadual: '123456789',
      razaoSocial: 'Empresa Step74',
      nomeFantasia: 'Step74',
      cep: '68525000',
      logradouro: 'Rua Teste',
      numero: '74',
      bairro: 'Centro',
      municipio: 'Marabá',
      codigoMunicipio: '1504208',
      uf: 'PA',
      serieNfce: '1',
      ambiente: 'PRODUCAO',
      crt: '1',
      urlQrCode: 'https://sefaz.example/qrcode',
      urlConsultaChave: 'https://sefaz.example/consulta',
      revision: 'profile-step74',
      payload: {
        source: 'step74'
      }
    });

    upsertFiscalNumberLease({
      empresaId,
      leaseId: 'lease-step74',
      requestId: 'request-step74',
      deviceId,
      ambiente: 'PRODUCAO',
      modelo: 65,
      serie: '1',
      numeroInicial: 740,
      numeroFinal: 749,
      proximoNumero: 740,
      status: 'ACTIVE',
      reservadoEm: '2026-09-25T13:00:00.000Z',
      expiraEm: '2027-09-25T13:00:00.000Z',
      payload: {
        source: 'step74'
      }
    });

    const sale = registerOfflineSaleAtomic({
      empresaId,
      saleId,
      operationId: saleOperationId,
      status: 'PAID_OFFLINE_PENDING_SYNC',
      totalCentavos: 1500,
      occurredAt: '2026-09-25T14:00:00-03:00',
      paymentMethod: 'PIX',
      paymentParts: [{
        method: 'PIX',
        amount: 15
      }],
      items: [{
        itemId: 'item-step74',
        produtoId: 'produto-step74',
        quantidade: '1',
        unitPriceCentavos: 1500,
        totalCentavos: 1500,
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
        leaseId: 'lease-step74',
        deviceId,
        fiscalId,
        operationId: `${saleOperationId}:nfce`,
        xJust: 'Contingência controlada para extração arquitetural step74.'
      },
      payload: {
        source: 'step74'
      }
    });

    assert.equal(sale.applied, true);

    persistSignedNfceContingency({
      empresaId,
      saleId,
      signedXml:
        `<signed fiscal="${fiscalId}">step74</signed>`
    });

    persistNfceQrCode({
      empresaId,
      saleId,
      qrCodeText:
        `https://sefaz.example/qrcode?p=step74-${'Q'.repeat(160)}`
    });

    ensureFiscalOutboxForPendingNfce({
      empresaId,
      saleId,
      createdAt: '2026-09-25T17:01:00.000Z'
    });

    const finalXmlSha256 = crypto
      .createHash('sha256')
      .update('step74-final-xml', 'utf8')
      .digest('hex')
      .toUpperCase();

    const claim = claimFiscalOutboxOperation({
      empresaId,
      fiscalId,
      finalXmlSha256,
      now: '2026-09-25T17:02:00.000Z'
    });

    assert.equal(claim.claimed, true);

    markFiscalOutboxAuthorized({
      empresaId,
      fiscalId,
      protocolo: '150260000000740',
      cStat: '100',
      xMotivo: 'Autorizado o uso da NF-e',
      autorizadoEm: '2026-09-25T14:02:05-03:00',
      processedXml: '<nfeProc>step74</nfeProc>',
      now: '2026-09-25T17:02:05.000Z'
    });

    const pending = listAuthorizedNfcePendingSync({
      empresaId,
      limit: 50
    });

    assert.equal(pending.length, 1);
    assert.equal(pending[0].fiscalId, fiscalId);
    assert.equal(pending[0].saleId, saleId);
    assert.equal(pending[0].ambiente, 'PRODUCAO');
    assert.equal(pending[0].modelo, 65);
    assert.equal(pending[0].serie, '1');
    assert.equal(pending[0].numero, 740);
    assert.equal(pending[0].tipoEmissao, 9);
    assert.equal(pending[0].protocolo, '150260000000740');
    assert.equal(pending[0].cStat, '100');
    assert.equal(
      pending[0].saleSyncOperationId,
      saleOperationId
    );
    assert.equal(Buffer.isBuffer(pending[0].processedXml), true);
    assert.equal(
      pending[0].processedXml.toString('utf8'),
      '<nfeProc>step74</nfeProc>'
    );

    enqueueOutboxOperation({
      empresaId,
      operationId: `nfce-auth:${fiscalId}`,
      type: 'NFCE_AUTHORIZED',
      entityId: saleId,
      payload: {
        source: 'step74'
      },
      dependencies: [
        saleOperationId
      ],
      createdAt: '2026-09-25T17:03:00.000Z'
    });

    assert.deepEqual(
      listAuthorizedNfcePendingSync({
        empresaId,
        limit: 50
      }),
      []
    );
  });
});
