'use strict';

const crypto = require('crypto');
const {
  getNfceDocumentByFiscalId,
  listFiscalOutboxReady,
  claimFiscalOutboxOperation,
  markFiscalOutboxRetry,
  markFiscalOutboxAmbiguous,
  markFiscalOutboxSafeRetransmit,
  markFiscalOutboxAuthorized,
  markFiscalOutboxRejected,
  markFiscalOutboxManualReview,
  markFiscalOutboxManualReviewReady,
  recoverStaleFiscalOutbox
} = require('./offline-db');
const { buildNfceXmlWithSupplement } = require('./offline-fiscal-nfce-qrcode');

function text(value, name) {
  const out = String(value == null ? '' : value).trim();
  if (!out) throw new Error(`${name} é obrigatório.`);
  return out;
}

function later(now, ms) {
  const base = Date.parse(String(now));
  if (!Number.isFinite(base)) throw new Error('now inválido.');
  return new Date(base + ms).toISOString();
}

function assertTransport(transport) {
  if (!transport || typeof transport.transmit !== 'function' || typeof transport.reconcileByKey !== 'function') {
    throw new Error('Transporte fiscal incompleto.');
  }
  return transport;
}

function prepareFinalXml(document, builder) {
  const final = builder(document);
  if (!final || typeof final.xml !== 'string' || !final.xml.trim()) throw new Error('XML final inválido.');
  const bytes = Buffer.from(final.xml, 'utf8');
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
  if (final.sha256 && String(final.sha256).toUpperCase() !== sha256) {
    bytes.fill(0);
    throw new Error('Hash do XML final diverge antes do envio.');
  }
  return { xml: final.xml, sha256, bytes };
}

async function processFiscalOutboxOnce(options = {}) {
  const empresaId = text(options.empresaId, 'empresaId');
  const transport = assertTransport(options.transport);
  const now = options.now ? String(options.now) : new Date().toISOString();
  const retryMs = Math.max(1000, Number(options.retryDelayMs || 60000));
  const reconcileMs = Math.max(1000, Number(options.reconcileDelayMs || 30000));
  const requestedMaxAttempts = Number(options.maxAttempts == null ? 8 : options.maxAttempts);
  const maxAttempts = Number.isSafeInteger(requestedMaxAttempts) && requestedMaxAttempts >= 1 && requestedMaxAttempts <= 100
    ? requestedMaxAttempts
    : 8;
  const builder = typeof options.buildFinalXml === 'function' ? options.buildFinalXml : buildNfceXmlWithSupplement;
  const ready = listFiscalOutboxReady({ empresaId, now, limit: options.limit || 20 });
  const summary = { considered: ready.length, claimed: 0, authorized: 0, rejected: 0, retry: 0, reconcile: 0, manualReview: 0 };

  for (const operation of ready) {
    const document = getNfceDocumentByFiscalId(empresaId, operation.fiscalId);
    if (!document) throw new Error('Documento fiscal do outbox não encontrado.');
    if (operation.attempts >= maxAttempts) {
      markFiscalOutboxManualReviewReady({
        empresaId,
        fiscalId: operation.fiscalId,
        now,
        error: `Limite de ${maxAttempts} tentativas fiscais atingido; nenhuma nova chamada automática será feita.`
      });
      summary.manualReview += 1;
      continue;
    }
    let prepared = null;
    try {
      prepared = prepareFinalXml(document, builder);
      const claim = claimFiscalOutboxOperation({ empresaId, fiscalId: operation.fiscalId, finalXmlSha256: prepared.sha256, now });
      if (!claim.claimed) continue;
      summary.claimed += 1;

      let result;
      try {
        result = operation.action === 'TRANSMIT'
          ? await transport.transmit({
              empresaId,
              fiscalId: operation.fiscalId,
              chaveAcesso: document.chaveAcesso,
              ambiente: document.ambiente,
              modelo: document.modelo,
              serie: document.serie,
              numero: document.numero,
              xml: prepared.xml,
              xmlSha256: prepared.sha256
            })
          : await transport.reconcileByKey({
              empresaId,
              fiscalId: operation.fiscalId,
              chaveAcesso: document.chaveAcesso,
              ambiente: document.ambiente,
              modelo: document.modelo,
              serie: document.serie,
              numero: document.numero,
              xml: prepared.xml,
              xmlSha256: prepared.sha256
            });
      } catch (error) {
        if (operation.action === 'TRANSMIT') {
          markFiscalOutboxAmbiguous({ empresaId, fiscalId: operation.fiscalId, now, nextAttemptAt: later(now, reconcileMs), error: String(error && error.message || error) });
          summary.reconcile += 1;
        } else {
          markFiscalOutboxRetry({ empresaId, fiscalId: operation.fiscalId, action: 'RECONCILE_BY_KEY', now, nextAttemptAt: later(now, retryMs), error: String(error && error.message || error) });
          summary.retry += 1;
        }
        continue;
      }

      const kind = String(result && result.kind || '').trim().toUpperCase();
      if (kind === 'AUTHORIZED') {
        markFiscalOutboxAuthorized({ empresaId, fiscalId: operation.fiscalId, protocolo: result.protocolo, cStat: result.cStat, xMotivo: result.xMotivo, autorizadoEm: result.autorizadoEm, processedXml: result.processedXml, now });
        summary.authorized += 1;
      } else if (kind === 'REJECTED') {
        markFiscalOutboxRejected({ empresaId, fiscalId: operation.fiscalId, cStat: result.cStat, xMotivo: result.xMotivo, now });
        summary.rejected += 1;
      } else if (operation.action === 'TRANSMIT' && kind === 'NOT_SENT') {
        markFiscalOutboxRetry({ empresaId, fiscalId: operation.fiscalId, action: 'TRANSMIT', now, nextAttemptAt: result.nextAttemptAt || later(now, retryMs), error: result.error || 'Transporte confirmou que a requisição não foi enviada.' });
        summary.retry += 1;
      } else if (operation.action === 'TRANSMIT' && (kind === 'AMBIGUOUS' || !kind)) {
        markFiscalOutboxAmbiguous({ empresaId, fiscalId: operation.fiscalId, now, nextAttemptAt: result && result.nextAttemptAt || later(now, reconcileMs), error: result && result.error || 'Resultado da transmissão não conclusivo.' });
        summary.reconcile += 1;
      } else if (operation.action === 'RECONCILE_BY_KEY' && kind === 'NOT_FOUND') {
        if (result.safeToRetransmit === true) {
          markFiscalOutboxSafeRetransmit({ empresaId, fiscalId: operation.fiscalId, now, nextAttemptAt: result.nextAttemptAt || later(now, retryMs), error: result.error || 'Ausência confirmada para retransmissão do mesmo XML.' });
        } else {
          markFiscalOutboxRetry({ empresaId, fiscalId: operation.fiscalId, action: 'RECONCILE_BY_KEY', now, nextAttemptAt: result.nextAttemptAt || later(now, retryMs), error: result.error || 'Chave ainda não localizada; manter reconciliação.' });
        }
        summary.retry += 1;
      } else if (kind === 'RETRY') {
        const action = operation.action === 'RECONCILE_BY_KEY' ? 'RECONCILE_BY_KEY' : 'TRANSMIT';
        markFiscalOutboxRetry({ empresaId, fiscalId: operation.fiscalId, action, now, nextAttemptAt: result.nextAttemptAt || later(now, retryMs), error: result.error || 'Falha fiscal temporária.' });
        summary.retry += 1;
      } else {
        markFiscalOutboxManualReview({ empresaId, fiscalId: operation.fiscalId, action: operation.action, conflict: kind === 'CONFLICT', now, error: result && (result.error || result.xMotivo) || `Resultado fiscal não suportado: ${kind || '(vazio)'}.`, remoteAck: result && typeof result === 'object' ? { kind, cStat: result.cStat || null, xMotivo: result.xMotivo || null } : null });
        summary.manualReview += 1;
      }
    } finally {
      if (prepared && prepared.bytes) prepared.bytes.fill(0);
    }
  }
  return summary;
}

module.exports = { processFiscalOutboxOnce, recoverStaleFiscalOutbox };
