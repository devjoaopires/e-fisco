'use strict';

const { createHash } = require('crypto');
const {
  beginImmediateTransaction
} = require('../transaction');

function nowIso() {
  return new Date().toISOString();
}

function requiredText(value, fieldName) {
  const text = String(value == null ? '' : value).trim();
  if (!text) {
    throw new Error(`${fieldName} é obrigatório para o cache offline.`);
  }
  return text;
}

function optionalText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function parseJsonText(value) {
  if (value == null || value === '') return null;
  try { return JSON.parse(String(value)); } catch (_) { return null; }
}

function mapFiscalOutboxRow(row) {
  if (!row) return null;
  return {
    empresaId: String(row.empresa_id),
    fiscalId: String(row.fiscal_id),
    operationId: String(row.operation_id),
    action: String(row.action),
    status: String(row.status),
    attempts: Number(row.attempts),
    payload: parseJsonText(row.payload_json) || {},
    nextAttemptAt: row.next_attempt_at == null ? null : String(row.next_attempt_at),
    sendingStartedAt: row.sending_started_at == null ? null : String(row.sending_started_at),
    confirmedAt: row.confirmed_at == null ? null : String(row.confirmed_at),
    lastError: row.last_error == null ? null : String(row.last_error),
    remoteAck: parseJsonText(row.remote_ack_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function getFiscalOutboxByFiscalId(db, empresaIdValue, fiscalIdValue) {
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const fiscalId = requiredText(fiscalIdValue, 'fiscalId');
  return mapFiscalOutboxRow(db.prepare(`
    SELECT * FROM fiscal_outbox
     WHERE empresa_id = ? AND fiscal_id = ?
     LIMIT 1
  `).get(empresaId, fiscalId));
}

function ensureFiscalOutboxForPendingNfce(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const saleId = requiredText(input.saleId, 'saleId');
  const createdAt = optionalText(input.createdAt) || nowIso();

  const transaction = beginImmediateTransaction(db);
  try {
    const doc = db.prepare(`
      SELECT fiscal_id, sale_id, chave_acesso, state,
             signed_xml, signed_xml_sha256, qr_code_text
        FROM nfce_documents
       WHERE empresa_id = ? AND sale_id = ?
       LIMIT 1
    `).get(empresaId, saleId);
    if (!doc) throw new Error('Documento NFC-e não encontrado para fiscal outbox.');
    if (String(doc.state) !== 'CONTINGENCIA_PENDENTE') {
      throw new Error(`Fiscal outbox exige CONTINGENCIA_PENDENTE; recebido ${String(doc.state)}.`);
    }
    if (doc.signed_xml == null || doc.signed_xml_sha256 == null || doc.qr_code_text == null) {
      throw new Error('Documento fiscal ainda não possui XML assinado + hash + QR persistidos.');
    }
    const xmlBuffer = Buffer.from(doc.signed_xml);
    try {
      const recomputed = createHash('sha256').update(xmlBuffer).digest('hex').toUpperCase();
      const stored = String(doc.signed_xml_sha256).trim().toUpperCase();
      if (!/^[0-9A-F]{64}$/.test(stored) || stored !== recomputed) {
        throw new Error('Hash do signed_xml diverge antes de criar fiscal outbox.');
      }
    } finally {
      xmlBuffer.fill(0);
    }

    const fiscalId = String(doc.fiscal_id);
    const operationId = `nfce-transmit:${fiscalId}`;
    const payload = {
      schemaVersion: 1,
      saleId: String(doc.sale_id),
      chaveAcesso: String(doc.chave_acesso),
      signedXmlSha256: String(doc.signed_xml_sha256).toUpperCase()
    };
    db.prepare(`
      INSERT INTO fiscal_outbox (
        empresa_id, fiscal_id, operation_id, action, status, attempts,
        payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, 'TRANSMIT', 'PENDING', 0, ?, ?, ?)
      ON CONFLICT(empresa_id, fiscal_id) DO NOTHING
    `).run(empresaId, fiscalId, operationId, JSON.stringify(payload), createdAt, createdAt);

    const existing = db.prepare(`SELECT * FROM fiscal_outbox WHERE empresa_id = ? AND fiscal_id = ? LIMIT 1`)
      .get(empresaId, fiscalId);
    if (!existing) throw new Error('Fiscal outbox não pôde ser criado.');
    if (String(existing.operation_id) !== operationId) {
      throw new Error('Fiscal outbox existente usa operationId incompatível.');
    }
    transaction.commit();
    return mapFiscalOutboxRow(existing);
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}

function listFiscalOutboxReady(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const now = optionalText(input.now) || nowIso();
  const limitValue = Number(input.limit == null ? 20 : input.limit);
  const limit = Number.isSafeInteger(limitValue) && limitValue > 0 ? Math.min(limitValue, 100) : 20;
  return db.prepare(`
    SELECT * FROM fiscal_outbox
     WHERE empresa_id = ?
       AND status IN ('PENDING', 'RETRY')
       AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
     ORDER BY created_at ASC, fiscal_id ASC
     LIMIT ?
  `).all(empresaId, now, limit).map(mapFiscalOutboxRow);
}

function claimFiscalOutboxOperation(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const fiscalId = requiredText(input.fiscalId, 'fiscalId');
  const finalXmlSha256 = requiredText(input.finalXmlSha256, 'finalXmlSha256').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(finalXmlSha256)) {
    throw new Error('finalXmlSha256 inválido para claim fiscal.');
  }
  const now = optionalText(input.now) || nowIso();
  const transaction = beginImmediateTransaction(db);
  try {
    const row = db.prepare(`SELECT * FROM fiscal_outbox WHERE empresa_id = ? AND fiscal_id = ? LIMIT 1`)
      .get(empresaId, fiscalId);
    if (!row) throw new Error('Fiscal outbox não encontrado para claim.');
    if (!['PENDING', 'RETRY'].includes(String(row.status)) || (row.next_attempt_at && String(row.next_attempt_at) > now)) {
      transaction.commit();
      return { claimed: false, operation: mapFiscalOutboxRow(row) };
    }
    const rawPayload = parseJsonText(row.payload_json);
    const payload = rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
      ? { ...rawPayload }
      : {};
    const pinnedHash = String(payload.finalXmlSha256 || '').trim().toUpperCase();
    if (pinnedHash && pinnedHash !== finalXmlSha256) {
      throw new Error('Hash do XML final diverge do hash fixado na primeira tentativa fiscal.');
    }
    if (!pinnedHash) {
      payload.finalXmlSha256 = finalXmlSha256;
      payload.finalXmlPinnedAt = now;
    }
    const doc = db.prepare(`SELECT state FROM nfce_documents WHERE empresa_id = ? AND fiscal_id = ? LIMIT 1`)
      .get(empresaId, fiscalId);
    if (!doc) throw new Error('Documento fiscal do outbox não encontrado.');
    const action = String(row.action);
    const expectedState = action === 'TRANSMIT' ? 'CONTINGENCIA_PENDENTE' : 'RECONCILE_BY_KEY';
    if (String(doc.state) !== expectedState) {
      throw new Error(`Documento fiscal em estado ${String(doc.state)} incompatível com ação ${action}.`);
    }
    const updated = db.prepare(`
      UPDATE fiscal_outbox
         SET status='SENDING', attempts=attempts+1, sending_started_at=?,
             next_attempt_at=NULL, last_error=NULL, payload_json=?, updated_at=?
       WHERE empresa_id=? AND fiscal_id=? AND status IN ('PENDING','RETRY')
    `).run(now, JSON.stringify(payload), now, empresaId, fiscalId);
    if (Number(updated.changes || 0) !== 1) throw new Error('Fiscal outbox mudou durante o claim.');
    if (action === 'TRANSMIT') {
      db.prepare(`UPDATE nfce_documents SET state='SENDING', updated_at=? WHERE empresa_id=? AND fiscal_id=? AND state='CONTINGENCIA_PENDENTE'`)
        .run(now, empresaId, fiscalId);
    }
    transaction.commit();
    return { claimed: true, operation: getFiscalOutboxByFiscalId(db, empresaId, fiscalId) };
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}

function transitionFiscalOutboxSending(db, input, options = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const fiscalId = requiredText(input.fiscalId, 'fiscalId');
  const now = optionalText(input.now) || nowIso();
  const outboxStatus = requiredText(options.outboxStatus, 'outboxStatus');
  const action = requiredText(options.action, 'action');
  const docState = requiredText(options.docState, 'docState');
  const nextAttemptAt = options.nextAttemptAt == null ? null : String(options.nextAttemptAt);
  const lastError = options.lastError == null ? null : String(options.lastError).slice(0, 2000);
  const confirmedAt = options.confirmedAt == null ? null : String(options.confirmedAt);
  const remoteAck = options.remoteAck == null ? null : JSON.stringify(options.remoteAck);
  const transaction = beginImmediateTransaction(db);
  try {
    const row = db.prepare(`SELECT action,status FROM fiscal_outbox WHERE empresa_id=? AND fiscal_id=? LIMIT 1`)
      .get(empresaId, fiscalId);
    if (!row || String(row.status) !== 'SENDING') throw new Error('Fiscal outbox não está SENDING.');
    db.prepare(`
      UPDATE fiscal_outbox
         SET action=?, status=?, next_attempt_at=?, sending_started_at=NULL,
             confirmed_at=?, last_error=?, remote_ack_json=?, updated_at=?
       WHERE empresa_id=? AND fiscal_id=? AND status='SENDING'
    `).run(action, outboxStatus, nextAttemptAt, confirmedAt, lastError, remoteAck, now, empresaId, fiscalId);
    db.prepare(`UPDATE nfce_documents SET state=?, updated_at=? WHERE empresa_id=? AND fiscal_id=?`)
      .run(docState, now, empresaId, fiscalId);
    transaction.commit();
    return getFiscalOutboxByFiscalId(db, empresaId, fiscalId);
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}

function markFiscalOutboxRetry(db, input = {}) {
  const action = input.action === 'RECONCILE_BY_KEY' ? 'RECONCILE_BY_KEY' : 'TRANSMIT';
  return transitionFiscalOutboxSending(db, input, {
    outboxStatus: 'RETRY',
    action,
    docState: action === 'TRANSMIT' ? 'CONTINGENCIA_PENDENTE' : 'RECONCILE_BY_KEY',
    nextAttemptAt: requiredText(input.nextAttemptAt, 'nextAttemptAt'),
    lastError: optionalText(input.error) || 'Falha temporária fiscal.'
  });
}

function markFiscalOutboxAmbiguous(db, input = {}) {
  return transitionFiscalOutboxSending(db, input, {
    outboxStatus: 'RETRY',
    action: 'RECONCILE_BY_KEY',
    docState: 'RECONCILE_BY_KEY',
    nextAttemptAt: requiredText(input.nextAttemptAt, 'nextAttemptAt'),
    lastError: optionalText(input.error) || 'Resultado de transmissão ambíguo; reconciliar pela chave.'
  });
}

function markFiscalOutboxSafeRetransmit(db, input = {}) {
  return transitionFiscalOutboxSending(db, input, {
    outboxStatus: 'RETRY',
    action: 'TRANSMIT',
    docState: 'CONTINGENCIA_PENDENTE',
    nextAttemptAt: requiredText(input.nextAttemptAt, 'nextAttemptAt'),
    lastError: optionalText(input.error) || 'Reconciliação confirmou ausência segura; retransmitir o mesmo XML.'
  });
}

function markFiscalOutboxAuthorized(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const fiscalId = requiredText(input.fiscalId, 'fiscalId');
  const protocolo = requiredText(input.protocolo, 'protocolo');
  const cStat = requiredText(input.cStat, 'cStat');
  const xMotivo = requiredText(input.xMotivo, 'xMotivo');
  const autorizadoEm = requiredText(input.autorizadoEm, 'autorizadoEm');
  if (typeof input.processedXml !== 'string' || !input.processedXml.trim()) throw new Error('processedXml autorizado é obrigatório.');
  const processed = Buffer.from(input.processedXml, 'utf8');
  const now = optionalText(input.now) || nowIso();
  const transaction = beginImmediateTransaction(db);
  try {
    const row = db.prepare(`SELECT status FROM fiscal_outbox WHERE empresa_id=? AND fiscal_id=? LIMIT 1`).get(empresaId,fiscalId);
    if (!row || String(row.status) !== 'SENDING') throw new Error('Fiscal outbox não está SENDING para autorização.');
    db.prepare(`
      UPDATE nfce_documents
         SET state='AUTHORIZED', protocolo=?, sefaz_cstat=?, sefaz_xmotivo=?, autorizado_em=?, processed_xml=?, updated_at=?
       WHERE empresa_id=? AND fiscal_id=?
    `).run(protocolo,cStat,xMotivo,autorizadoEm,processed,now,empresaId,fiscalId);
    db.prepare(`
      UPDATE fiscal_outbox
         SET status='CONFIRMED', sending_started_at=NULL, next_attempt_at=NULL,
             confirmed_at=?, last_error=NULL, remote_ack_json=?, updated_at=?
       WHERE empresa_id=? AND fiscal_id=? AND status='SENDING'
    `).run(now, JSON.stringify({ kind:'AUTHORIZED', cStat, xMotivo, protocolo, autorizadoEm }), now, empresaId, fiscalId);
    transaction.commit();
    return getFiscalOutboxByFiscalId(db, empresaId, fiscalId);
  } catch (error) {
    transaction.rollback();
    throw error;
  } finally { processed.fill(0); }
}

function markFiscalOutboxRejected(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const fiscalId = requiredText(input.fiscalId, 'fiscalId');
  const cStat = requiredText(input.cStat, 'cStat');
  const xMotivo = requiredText(input.xMotivo, 'xMotivo');
  const now = optionalText(input.now) || nowIso();
  const transaction = beginImmediateTransaction(db);
  try {
    const row = db.prepare(`SELECT status FROM fiscal_outbox WHERE empresa_id=? AND fiscal_id=? LIMIT 1`).get(empresaId,fiscalId);
    if (!row || String(row.status) !== 'SENDING') throw new Error('Fiscal outbox não está SENDING para rejeição.');
    db.prepare(`UPDATE nfce_documents SET state='REJECTED', sefaz_cstat=?, sefaz_xmotivo=?, updated_at=? WHERE empresa_id=? AND fiscal_id=?`)
      .run(cStat,xMotivo,now,empresaId,fiscalId);
    db.prepare(`UPDATE fiscal_outbox SET status='CONFIRMED', sending_started_at=NULL, next_attempt_at=NULL, confirmed_at=?, last_error=NULL, remote_ack_json=?, updated_at=? WHERE empresa_id=? AND fiscal_id=? AND status='SENDING'`)
      .run(now,JSON.stringify({kind:'REJECTED',cStat,xMotivo}),now,empresaId,fiscalId);
    transaction.commit();
    return getFiscalOutboxByFiscalId(db, empresaId, fiscalId);
  } catch(error) { transaction.rollback(); throw error; }
}

function markFiscalOutboxManualReview(db, input = {}) {
  const status = input.conflict === true ? 'CONFLICT' : 'MANUAL_REVIEW';
  return transitionFiscalOutboxSending(db, input, {
    outboxStatus: status,
    action: input.action === 'RECONCILE_BY_KEY' ? 'RECONCILE_BY_KEY' : 'TRANSMIT',
    docState: 'MANUAL_REVIEW',
    lastError: optionalText(input.error) || 'Documento fiscal requer revisão manual.',
    remoteAck: input.remoteAck || null
  });
}

function markFiscalOutboxManualReviewReady(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const fiscalId = requiredText(input.fiscalId, 'fiscalId');
  const now = optionalText(input.now) || nowIso();
  const error = (optionalText(input.error) || 'Limite de tentativas fiscais atingido; revisão manual necessária.').slice(0, 2000);
  const transaction = beginImmediateTransaction(db);
  try {
    const row = db.prepare(`SELECT status FROM fiscal_outbox WHERE empresa_id=? AND fiscal_id=? LIMIT 1`)
      .get(empresaId, fiscalId);
    if (!row || !['PENDING', 'RETRY'].includes(String(row.status))) {
      throw new Error('Fiscal outbox não está pronto para revisão manual preventiva.');
    }
    const updated = db.prepare(`
      UPDATE fiscal_outbox
         SET status='MANUAL_REVIEW', next_attempt_at=NULL, sending_started_at=NULL,
             last_error=?, updated_at=?
       WHERE empresa_id=? AND fiscal_id=? AND status IN ('PENDING','RETRY')
    `).run(error, now, empresaId, fiscalId);
    if (Number(updated.changes || 0) !== 1) throw new Error('Fiscal outbox mudou durante a trava por limite de tentativas.');
    db.prepare(`UPDATE nfce_documents SET state='MANUAL_REVIEW', updated_at=? WHERE empresa_id=? AND fiscal_id=?`)
      .run(now, empresaId, fiscalId);
    transaction.commit();
    return getFiscalOutboxByFiscalId(db, empresaId, fiscalId);
  } catch (errorValue) {
    transaction.rollback();
    throw errorValue;
  }
}

function recoverStaleFiscalOutbox(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const staleBefore = requiredText(input.staleBefore, 'staleBefore');
  const now = optionalText(input.now) || nowIso();
  const nextAttemptAt = optionalText(input.nextAttemptAt) || now;
  const transaction = beginImmediateTransaction(db);
  try {
    const rows = db.prepare(`
      SELECT fiscal_id, action FROM fiscal_outbox
       WHERE empresa_id=? AND status='SENDING' AND sending_started_at IS NOT NULL AND sending_started_at <= ?
    `).all(empresaId, staleBefore);
    for (const row of rows) {
      const previousAction = String(row.action);
      const nextAction = previousAction === 'TRANSMIT' ? 'RECONCILE_BY_KEY' : previousAction;
      db.prepare(`UPDATE fiscal_outbox SET action=?, status='RETRY', next_attempt_at=?, sending_started_at=NULL, last_error=?, updated_at=? WHERE empresa_id=? AND fiscal_id=? AND status='SENDING'`)
        .run(nextAction,nextAttemptAt,previousAction === 'TRANSMIT' ? 'Transmissão interrompida; reconciliar por chave antes de qualquer reenvio.' : 'Reconciliação interrompida; repetir consulta por chave.',now,empresaId,String(row.fiscal_id));
      db.prepare(`UPDATE nfce_documents SET state='RECONCILE_BY_KEY', updated_at=? WHERE empresa_id=? AND fiscal_id=?`)
        .run(now,empresaId,String(row.fiscal_id));
    }
    transaction.commit();
    return rows.length;
  } catch(error) { transaction.rollback(); throw error; }
}

module.exports = {
  getFiscalOutboxByFiscalId,
  ensureFiscalOutboxForPendingNfce,
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
};
