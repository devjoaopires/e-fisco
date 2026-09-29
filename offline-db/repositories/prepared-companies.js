'use strict';

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

function mapPreparedOfflineCompanyRow(row) {
  if (!row) return null;

  return {
    empresaId:
      String(row.empresa_id),
    razaoSocial:
      String(row.razao_social),
    cnpj:
      String(row.cnpj),
    ambiente:
      String(row.ambiente),
    preparedAt:
      String(row.prepared_at),
    lastPreparedAt:
      String(row.last_prepared_at)
  };
}

function upsertPreparedOfflineCompany(db, input = {}) {
  const empresaId =
    requiredText(
      input.empresaId,
      'empresaId'
    );
  const razaoSocial =
    requiredText(
      input.razaoSocial,
      'razaoSocial'
    );
  const cnpj =
    requiredText(
      input.cnpj,
      'cnpj'
    );
  const ambiente =
    requiredText(
      input.ambiente,
      'ambiente'
    )
      .toUpperCase();

  const preparedAt =
    optionalText(
      input.preparedAt
    ) ||
    nowIso();

  db.prepare(`
    INSERT INTO offline_prepared_companies (
      empresa_id,
      razao_social,
      cnpj,
      ambiente,
      prepared_at,
      last_prepared_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(empresa_id) DO UPDATE SET
      razao_social = excluded.razao_social,
      cnpj = excluded.cnpj,
      ambiente = excluded.ambiente,
      last_prepared_at = excluded.last_prepared_at
  `).run(
    empresaId,
    razaoSocial,
    cnpj,
    ambiente,
    preparedAt,
    preparedAt
  );

  return getPreparedOfflineCompany(
    db,
    empresaId
  );
}

function getPreparedOfflineCompany(db, empresaIdValue) {
  const empresaId =
    requiredText(
      empresaIdValue,
      'empresaId'
    );

  const row = db.prepare(`
    SELECT
      empresa_id,
      razao_social,
      cnpj,
      ambiente,
      prepared_at,
      last_prepared_at
    FROM offline_prepared_companies
    WHERE empresa_id = ?
    LIMIT 1
  `).get(empresaId);

  return mapPreparedOfflineCompanyRow(
    row
  );
}

function listPreparedOfflineCompanies(db) {

  return db.prepare(`
    SELECT
      empresa_id,
      razao_social,
      cnpj,
      ambiente,
      prepared_at,
      last_prepared_at
    FROM offline_prepared_companies
    ORDER BY
      razao_social COLLATE NOCASE,
      empresa_id
  `)
    .all()
    .map(
      mapPreparedOfflineCompanyRow
    );
}

module.exports = {
  upsertPreparedOfflineCompany,
  getPreparedOfflineCompany,
  listPreparedOfflineCompanies
};
