'use strict';

const { createHash } = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  initializeOfflineDatabase,
  closeOfflineDatabase,
  upsertProductCache,
  upsertFiscalProfileCache,
  upsertFiscalNumberLease,
  registerOfflineSaleAtomic,
  getNfceDocumentBySaleId,
  getNfceDocumentByFiscalId,
  persistSignedNfceContingency,
  persistNfceQrCode,
  ensureFiscalOutboxForPendingNfce,
  getFiscalOutboxByFiscalId,
  claimFiscalOutboxOperation,
  markFiscalOutboxRetry,
  markFiscalOutboxAuthorized,
  markFiscalOutboxRejected,
  markFiscalOutboxManualReview,
  markFiscalOutboxManualReviewReady
} = require('../../offline-db');

const {
  withTempDir
} = require('../helpers/temp-dir');

const EMPRESA_ID = 'empresa-step61';
const DEVICE_ID = 'device-step61';
const LEASE_ID = 'lease-step61';
const PROFILE_REVISION = 'profile-step61';

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
  }, 'efisco-step61-state-');
}

function seedFiscalPrerequisites() {
  upsertProductCache({
    empresaId: EMPRESA_ID,
    produtoId: 'produto-step61',
    codigo: 'P61',
    descricao: 'Produto fiscal step61',
    unidade: 'UN',
    precoCentavos: 1000,
    ativo: true,
    payload: {
      quantidadeEstoque: 100
    }
  });

  upsertFiscalProfileCache({
    empresaId: EMPRESA_ID,
    cnpj: '12345678000195',
    inscricaoEstadual: '123456789',
    razaoSocial: 'Empresa Fiscal Step61',
    nomeFantasia: 'Step61',
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
    revision: PROFILE_REVISION,
    payload: {
      source: 'step61'
    }
  });

  upsertFiscalNumberLease({
    empresaId: EMPRESA_ID,
    leaseId: LEASE_ID,
    requestId: 'request-step61',
    deviceId: DEVICE_ID,
    ambiente: 'PRODUCAO',
    modelo: 65,
    serie: '1',
    numeroInicial: 100,
    numeroFinal: 199,
    proximoNumero: 100,
    status: 'ACTIVE',
    reservadoEm: '2026-09-25T12:00:00.000Z',
    expiraEm: '2027-09-25T12:00:00.000Z',
    payload: {
      source: 'step61'
    }
  });
}

function allocateFiscalSale(suffix) {
  const saleId = `sale-step61-${suffix}`;
  const operationId = `op-sale-step61-${suffix}`;
  const fiscalId = `nfce:${saleId}`;

  const result = registerOfflineSaleAtomic({
    empresaId: EMPRESA_ID,
    saleId,
    operationId,
    status: 'PAID_OFFLINE_PENDING_SYNC',
    totalCentavos: 1000,
    occurredAt: '2026-09-25T12:10:00-03:00',
    paymentMethod: 'PIX',
    paymentParts: [{
      method: 'PIX',
      amount: 10
    }],
    items: [{
      itemId: `item-step61-${suffix}`,
      produtoId: 'produto-step61',
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
      leaseId: LEASE_ID,
      deviceId: DEVICE_ID,
      fiscalId,
      operationId: `${operationId}:nfce`,
      xJust: 'Emissão em contingência para teste controlado da máquina fiscal.'
    },
    payload: {
      source: 'step61'
    }
  });

  assert.equal(result.applied, true);
  assert.equal(result.fiscal.state, 'ALLOCATED');
  assert.equal(result.fiscal.fiscalId, fiscalId);

  return {
    saleId,
    operationId,
    fiscalId,
    document: result.fiscal
  };
}

function signedXmlFor(fiscalId) {
  return `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="${fiscalId}">step61</infNFe></NFe>`;
}

function qrCodeFor(suffix) {
  return `https://sefaz.example/qrcode?p=${suffix}-${'A'.repeat(140)}`;
}

function finalHashFor(value) {
  return createHash('sha256')
    .update(String(value), 'utf8')
    .digest('hex')
    .toUpperCase();
}

function makePendingDocument(suffix) {
  const allocated = allocateFiscalSale(suffix);
  const signedXml = signedXmlFor(allocated.fiscalId);

  const signed = persistSignedNfceContingency({
    empresaId: EMPRESA_ID,
    saleId: allocated.saleId,
    signedXml
  });

  assert.equal(signed.applied, true);
  assert.equal(signed.state, 'CONTINGENCIA_PENDENTE');

  const qrCodeText = qrCodeFor(suffix);
  const qr = persistNfceQrCode({
    empresaId: EMPRESA_ID,
    saleId: allocated.saleId,
    qrCodeText
  });

  assert.equal(qr.applied, true);

  const outbox = ensureFiscalOutboxForPendingNfce({
    empresaId: EMPRESA_ID,
    saleId: allocated.saleId,
    createdAt: '2026-09-25T12:11:00.000Z'
  });

  assert.equal(outbox.action, 'TRANSMIT');
  assert.equal(outbox.status, 'PENDING');
  assert.equal(outbox.attempts, 0);

  return {
    ...allocated,
    signedXml,
    qrCodeText,
    outbox
  };
}

test('pipeline local cria ALLOCATED e só libera outbox após XML assinado + QR', async () => {
  await withFreshDatabase(() => {
    seedFiscalPrerequisites();
    const allocated = allocateFiscalSale('allocated');

    const initial = getNfceDocumentBySaleId(
      EMPRESA_ID,
      allocated.saleId
    );

    assert.equal(initial.state, 'ALLOCATED');
    assert.equal(initial.signedXml, null);
    assert.equal(initial.signedXmlSha256, null);
    assert.equal(initial.qrCodeText, null);
    assert.equal(
      getFiscalOutboxByFiscalId(
        EMPRESA_ID,
        allocated.fiscalId
      ),
      null
    );

    assert.throws(
      () => persistNfceQrCode({
        empresaId: EMPRESA_ID,
        saleId: allocated.saleId,
        qrCodeText: qrCodeFor('too-early')
      }),
      /deve estar CONTINGENCIA_PENDENTE/
    );

    assert.throws(
      () => ensureFiscalOutboxForPendingNfce({
        empresaId: EMPRESA_ID,
        saleId: allocated.saleId
      }),
      /exige CONTINGENCIA_PENDENTE/
    );

    const signedXml = signedXmlFor(allocated.fiscalId);
    const signed = persistSignedNfceContingency({
      empresaId: EMPRESA_ID,
      saleId: allocated.saleId,
      signedXml
    });

    assert.equal(signed.applied, true);
    assert.equal(signed.duplicate, false);
    assert.equal(signed.state, 'CONTINGENCIA_PENDENTE');
    assert.match(signed.signedXmlSha256, /^[0-9A-F]{64}$/);

    const sameSigned = persistSignedNfceContingency({
      empresaId: EMPRESA_ID,
      saleId: allocated.saleId,
      signedXml
    });

    assert.equal(sameSigned.applied, false);
    assert.equal(sameSigned.duplicate, true);

    assert.throws(
      () => persistSignedNfceContingency({
        empresaId: EMPRESA_ID,
        saleId: allocated.saleId,
        signedXml: `${signedXml}<!--different-->`
      }),
      /outro XML assinado persistido/
    );

    assert.throws(
      () => ensureFiscalOutboxForPendingNfce({
        empresaId: EMPRESA_ID,
        saleId: allocated.saleId
      }),
      /XML assinado \+ hash \+ QR/
    );

    const qrText = qrCodeFor('allocated');
    const qr = persistNfceQrCode({
      empresaId: EMPRESA_ID,
      saleId: allocated.saleId,
      qrCodeText: qrText
    });

    assert.equal(qr.applied, true);
    assert.equal(qr.state, 'CONTINGENCIA_PENDENTE');

    const sameQr = persistNfceQrCode({
      empresaId: EMPRESA_ID,
      saleId: allocated.saleId,
      qrCodeText: qrText
    });

    assert.equal(sameQr.applied, false);
    assert.equal(sameQr.duplicate, true);

    assert.throws(
      () => persistNfceQrCode({
        empresaId: EMPRESA_ID,
        saleId: allocated.saleId,
        qrCodeText: qrCodeFor('different')
      }),
      /outro QR Code persistido/
    );

    const outbox = ensureFiscalOutboxForPendingNfce({
      empresaId: EMPRESA_ID,
      saleId: allocated.saleId,
      createdAt: '2026-09-25T12:12:00.000Z'
    });

    assert.equal(outbox.status, 'PENDING');
    assert.equal(outbox.action, 'TRANSMIT');

    const sameOutbox = ensureFiscalOutboxForPendingNfce({
      empresaId: EMPRESA_ID,
      saleId: allocated.saleId,
      createdAt: '2026-09-25T12:13:00.000Z'
    });

    assert.equal(sameOutbox.operationId, outbox.operationId);
    assert.equal(sameOutbox.createdAt, outbox.createdAt);
  });
});

test('claim fiscal faz CONTINGENCIA_PENDENTE -> SENDING e retry volta ao estado pendente', async () => {
  await withFreshDatabase(() => {
    seedFiscalPrerequisites();
    const pending = makePendingDocument('retry');
    const finalXmlSha256 = finalHashFor('final-xml-step61-retry');

    const claimed = claimFiscalOutboxOperation({
      empresaId: EMPRESA_ID,
      fiscalId: pending.fiscalId,
      finalXmlSha256,
      now: '2026-09-25T12:20:00.000Z'
    });

    assert.equal(claimed.claimed, true);
    assert.equal(claimed.operation.status, 'SENDING');
    assert.equal(claimed.operation.attempts, 1);
    assert.equal(
      claimed.operation.payload.finalXmlSha256,
      finalXmlSha256
    );

    assert.equal(
      getNfceDocumentByFiscalId(
        EMPRESA_ID,
        pending.fiscalId
      ).state,
      'SENDING'
    );

    const retry = markFiscalOutboxRetry({
      empresaId: EMPRESA_ID,
      fiscalId: pending.fiscalId,
      action: 'TRANSMIT',
      nextAttemptAt: '2026-09-25T12:30:00.000Z',
      error: 'falha temporária step61',
      now: '2026-09-25T12:21:00.000Z'
    });

    assert.equal(retry.status, 'RETRY');
    assert.equal(retry.action, 'TRANSMIT');
    assert.equal(retry.lastError, 'falha temporária step61');

    assert.equal(
      getNfceDocumentByFiscalId(
        EMPRESA_ID,
        pending.fiscalId
      ).state,
      'CONTINGENCIA_PENDENTE'
    );

    const early = claimFiscalOutboxOperation({
      empresaId: EMPRESA_ID,
      fiscalId: pending.fiscalId,
      finalXmlSha256,
      now: '2026-09-25T12:29:59.000Z'
    });

    assert.equal(early.claimed, false);
    assert.equal(early.operation.status, 'RETRY');

    assert.throws(
      () => claimFiscalOutboxOperation({
        empresaId: EMPRESA_ID,
        fiscalId: pending.fiscalId,
        finalXmlSha256: finalHashFor('different-final-xml'),
        now: '2026-09-25T12:30:00.000Z'
      }),
      /Hash do XML final diverge/
    );

    const reclaimed = claimFiscalOutboxOperation({
      empresaId: EMPRESA_ID,
      fiscalId: pending.fiscalId,
      finalXmlSha256,
      now: '2026-09-25T12:30:00.000Z'
    });

    assert.equal(reclaimed.claimed, true);
    assert.equal(reclaimed.operation.status, 'SENDING');
    assert.equal(reclaimed.operation.attempts, 2);
  });
});

test('autorização fecha documento em AUTHORIZED e torna estado terminal', async () => {
  await withFreshDatabase(() => {
    seedFiscalPrerequisites();
    const pending = makePendingDocument('authorized');
    const finalXmlSha256 = finalHashFor('final-xml-authorized');

    claimFiscalOutboxOperation({
      empresaId: EMPRESA_ID,
      fiscalId: pending.fiscalId,
      finalXmlSha256,
      now: '2026-09-25T12:40:00.000Z'
    });

    const confirmed = markFiscalOutboxAuthorized({
      empresaId: EMPRESA_ID,
      fiscalId: pending.fiscalId,
      protocolo: '150260000000001',
      cStat: '100',
      xMotivo: 'Autorizado o uso da NF-e',
      autorizadoEm: '2026-09-25T12:40:05-03:00',
      processedXml: '<nfeProc>authorized-step61</nfeProc>',
      now: '2026-09-25T12:40:05.000Z'
    });

    assert.equal(confirmed.status, 'CONFIRMED');
    assert.equal(confirmed.confirmedAt, '2026-09-25T12:40:05.000Z');
    assert.equal(confirmed.remoteAck.kind, 'AUTHORIZED');

    const document = getNfceDocumentByFiscalId(
      EMPRESA_ID,
      pending.fiscalId
    );

    assert.equal(document.state, 'AUTHORIZED');
    assert.equal(document.protocolo, '150260000000001');
    assert.equal(document.sefazCStat, '100');
    assert.equal(document.sefazXMotivo, 'Autorizado o uso da NF-e');
    assert.equal(document.autorizadoEm, '2026-09-25T12:40:05-03:00');
    assert.equal(Buffer.isBuffer(document.processedXml), true);

    assert.throws(
      () => markFiscalOutboxAuthorized({
        empresaId: EMPRESA_ID,
        fiscalId: pending.fiscalId,
        protocolo: '150260000000001',
        cStat: '100',
        xMotivo: 'Autorizado o uso da NF-e',
        autorizadoEm: '2026-09-25T12:40:05-03:00',
        processedXml: '<nfeProc>authorized-step61</nfeProc>'
      }),
      /não está SENDING para autorização/
    );

    assert.throws(
      () => ensureFiscalOutboxForPendingNfce({
        empresaId: EMPRESA_ID,
        saleId: pending.saleId
      }),
      /exige CONTINGENCIA_PENDENTE/
    );
  });
});

test('rejeição fecha documento em REJECTED e registra retorno SEFAZ', async () => {
  await withFreshDatabase(() => {
    seedFiscalPrerequisites();
    const pending = makePendingDocument('rejected');

    claimFiscalOutboxOperation({
      empresaId: EMPRESA_ID,
      fiscalId: pending.fiscalId,
      finalXmlSha256: finalHashFor('final-xml-rejected'),
      now: '2026-09-25T12:50:00.000Z'
    });

    const rejected = markFiscalOutboxRejected({
      empresaId: EMPRESA_ID,
      fiscalId: pending.fiscalId,
      cStat: '539',
      xMotivo: 'Duplicidade de NF-e',
      now: '2026-09-25T12:50:05.000Z'
    });

    assert.equal(rejected.status, 'CONFIRMED');
    assert.equal(rejected.remoteAck.kind, 'REJECTED');

    const document = getNfceDocumentByFiscalId(
      EMPRESA_ID,
      pending.fiscalId
    );

    assert.equal(document.state, 'REJECTED');
    assert.equal(document.sefazCStat, '539');
    assert.equal(document.sefazXMotivo, 'Duplicidade de NF-e');
    assert.equal(document.protocolo, null);
  });
});

test('revisão manual pode ocorrer antes do claim ou a partir de SENDING', async () => {
  await withFreshDatabase(() => {
    seedFiscalPrerequisites();

    const preventive = makePendingDocument('manual-ready');

    const readyReview = markFiscalOutboxManualReviewReady({
      empresaId: EMPRESA_ID,
      fiscalId: preventive.fiscalId,
      error: 'limite preventivo step61',
      now: '2026-09-25T13:00:00.000Z'
    });

    assert.equal(readyReview.status, 'MANUAL_REVIEW');
    assert.equal(readyReview.lastError, 'limite preventivo step61');

    assert.equal(
      getNfceDocumentByFiscalId(
        EMPRESA_ID,
        preventive.fiscalId
      ).state,
      'MANUAL_REVIEW'
    );

    const blockedClaim = claimFiscalOutboxOperation({
      empresaId: EMPRESA_ID,
      fiscalId: preventive.fiscalId,
      finalXmlSha256: finalHashFor('manual-ready'),
      now: '2026-09-25T13:01:00.000Z'
    });

    assert.equal(blockedClaim.claimed, false);
    assert.equal(blockedClaim.operation.status, 'MANUAL_REVIEW');

    const sending = makePendingDocument('manual-sending');

    claimFiscalOutboxOperation({
      empresaId: EMPRESA_ID,
      fiscalId: sending.fiscalId,
      finalXmlSha256: finalHashFor('manual-sending'),
      now: '2026-09-25T13:05:00.000Z'
    });

    const review = markFiscalOutboxManualReview({
      empresaId: EMPRESA_ID,
      fiscalId: sending.fiscalId,
      action: 'TRANSMIT',
      error: 'revisão manual step61',
      remoteAck: {
        source: 'controlled-test'
      },
      now: '2026-09-25T13:05:05.000Z'
    });

    assert.equal(review.status, 'MANUAL_REVIEW');
    assert.equal(review.lastError, 'revisão manual step61');
    assert.deepEqual(review.remoteAck, {
      source: 'controlled-test'
    });

    assert.equal(
      getNfceDocumentByFiscalId(
        EMPRESA_ID,
        sending.fiscalId
      ).state,
      'MANUAL_REVIEW'
    );
  });
});
