'use strict';

function requiredText(value, fieldName) {
  const normalized =
    String(value == null ? '' : value).trim();

  if (!normalized) {
    throw new Error(
      `${fieldName} é obrigatório para o cache offline.`
    );
  }

  return normalized;
}

function getOutboxStatusSummary(
  db,
  empresaIdValue
) {
  const empresaId =
    requiredText(empresaIdValue, 'empresaId');

  const rows = db.prepare(`
    SELECT status, COUNT(*) AS total
      FROM sync_outbox
     WHERE empresa_id = ?
     GROUP BY status
  `).all(empresaId);

  const summary = {};

  for (const row of rows) {
    summary[String(row.status)] =
      Number(row.total || 0);
  }

  return summary;
}

module.exports = {
  getOutboxStatusSummary
};
