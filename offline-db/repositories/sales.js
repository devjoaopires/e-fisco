'use strict';

const {
  beginImmediateTransaction
} = require('../transaction');

function nowIso() {
  return new Date().toISOString();
}

function optionalText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function syncedSaleStatusMapping(statusValue) {
  const status = String(statusValue || '').trim().toUpperCase();
  if (status === 'PAID_OFFLINE_PENDING_SYNC') {
    return {
      localStatus: 'PAID_OFFLINE_SYNCED',
      payloadStatus: 'PAGA_OFFLINE_SINCRONIZADA'
    };
  }
  if (status === 'PAID_INTERNAL_OFFLINE') {
    return {
      localStatus: 'PAID_INTERNAL_SYNCED',
      payloadStatus: 'PAGA_INTERNA_SINCRONIZADA'
    };
  }
  if (status === 'CREDIARIO_RECEBIMENTO_OFFLINE_PENDING_SYNC') {
    return {
      localStatus: 'CREDIARIO_RECEBIMENTO_OFFLINE_SYNCED',
      payloadStatus: 'CREDIARIO_RECEBIMENTO_OFFLINE_SINCRONIZADO'
    };
  }
  return null;
}

function applyConfirmedSaleSyncStatus(db, empresaId, operationId, confirmedAt) {
  const row = db.prepare(`
    SELECT s.sale_id, s.status, s.payload_json
      FROM sales AS s
     WHERE s.empresa_id = ?
       AND s.operation_id = ?
     LIMIT 1
  `).get(empresaId, operationId);
  if (!row) return false;

  const mapping = syncedSaleStatusMapping(row.status);
  if (!mapping) return false;

  let payloadText = String(row.payload_json || '{}');
  try {
    const parsed = JSON.parse(payloadText);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      parsed.status = mapping.payloadStatus;
      parsed.syncStatus = 'CONFIRMED';
      parsed.syncedAt = confirmedAt;
      payloadText = JSON.stringify(parsed);
    }
  } catch (_) {}

  const result = db.prepare(`
    UPDATE sales
       SET status = ?, payload_json = ?
     WHERE empresa_id = ?
       AND operation_id = ?
       AND status = ?
  `).run(mapping.localStatus, payloadText, empresaId, operationId, String(row.status));
  return Number(result.changes || 0) === 1;
}

function reconcileConfirmedSaleSyncStatuses(db) {
  const rows = db.prepare(`
    SELECT s.empresa_id, s.operation_id, o.confirmed_at
      FROM sales AS s
      JOIN sync_outbox AS o
        ON o.empresa_id = s.empresa_id
       AND o.operation_id = s.operation_id
     WHERE o.type = 'SALE_PAID'
       AND o.status = 'CONFIRMED'
       AND s.status IN ('PAID_OFFLINE_PENDING_SYNC', 'PAID_INTERNAL_OFFLINE')
  `).all();
  if (!rows.length) return 0;

  const transaction = beginImmediateTransaction(db);
  try {
    let changed = 0;
    for (const row of rows) {
      const confirmedAt = optionalText(row.confirmed_at) || nowIso();
      if (applyConfirmedSaleSyncStatus(db, String(row.empresa_id), String(row.operation_id), confirmedAt)) {
        changed += 1;
      }
    }
    transaction.commit();
    return changed;
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}

module.exports = {
  applyConfirmedSaleSyncStatus,
  reconcileConfirmedSaleSyncStatuses
};
