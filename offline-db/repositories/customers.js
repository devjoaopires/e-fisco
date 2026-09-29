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

function booleanInt(value, defaultValue = true) {
  if (value == null) return defaultValue ? 1 : 0;
  return value === false || value === 0 || value === '0' ? 0 : 1;
}

function jsonText(value) {
  return JSON.stringify(value == null ? {} : value);
}

function parseJsonText(value) {
  if (value == null || value === '') return null;
  try { return JSON.parse(String(value)); } catch (_) { return null; }
}

function normalizeLimit(value, defaultValue = 50, maxValue = 200) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return defaultValue;
  return Math.min(Math.trunc(number), maxValue);
}

function escapeLike(value) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/[\\%_]/g, (char) => `\\${char}`);
}

function mapPartyCacheRow(row, idField, outputIdField) {
  if (!row) return null;
  return {
    empresaId: String(row.empresa_id),
    [outputIdField]: String(row[idField]),
    nome: String(row.nome),
    documento: row.documento == null ? null : String(row.documento),
    telefone: row.telefone == null ? null : String(row.telefone),
    email: row.email == null ? null : String(row.email),
    ativo: Number(row.ativo) === 1,
    revision: row.revision == null ? null : String(row.revision),
    sourceUpdatedAt: row.source_updated_at == null ? null : String(row.source_updated_at),
    cachedAt: String(row.cached_at),
    payload: parseJsonText(row.payload_json)
  };
}

function upsertCustomerCache(db, input) {
  const empresaId = requiredText(input && input.empresaId, 'empresaId');
  const clienteId = requiredText(input && input.clienteId, 'clienteId');
  const nome = requiredText(input && input.nome, 'nome');
  const cachedAt = nowIso();

  db.prepare(`
    INSERT INTO customers_cache (
      empresa_id, cliente_id, nome, documento, telefone, email,
      ativo, revision, source_updated_at, cached_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(empresa_id, cliente_id) DO UPDATE SET
      nome = excluded.nome,
      documento = excluded.documento,
      telefone = excluded.telefone,
      email = excluded.email,
      ativo = excluded.ativo,
      revision = excluded.revision,
      source_updated_at = excluded.source_updated_at,
      cached_at = excluded.cached_at,
      payload_json = excluded.payload_json
  `).run(
    empresaId,
    clienteId,
    nome,
    optionalText(input.documento),
    optionalText(input.telefone),
    optionalText(input.email),
    booleanInt(input.ativo, true),
    optionalText(input.revision),
    optionalText(input.sourceUpdatedAt),
    cachedAt,
    jsonText(input.payload)
  );

  return db.prepare(`
    SELECT empresa_id, cliente_id, nome, documento, telefone, email,
           ativo, revision, source_updated_at, cached_at, payload_json
      FROM customers_cache
     WHERE empresa_id = ? AND cliente_id = ?
  `).get(empresaId, clienteId);
}

function getCustomerCacheById(db, empresaIdValue, clienteIdValue) {
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const clienteId = requiredText(clienteIdValue, 'clienteId');
  const row = db.prepare(`
    SELECT empresa_id, cliente_id, nome, documento, telefone, email,
           ativo, revision, source_updated_at, cached_at, payload_json
      FROM customers_cache
     WHERE empresa_id = ? AND cliente_id = ?
  `).get(empresaId, clienteId);
  return mapPartyCacheRow(row, 'cliente_id', 'clienteId');
}

function searchCustomersCache(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const term = escapeLike(input.term);
  const limit = normalizeLimit(input.limit, 200, 5000);
  const onlyActive = input.onlyActive !== false;
  const like = `%${term}%`;
  const rows = db.prepare(`
    SELECT empresa_id, cliente_id, nome, documento, telefone, email,
           ativo, revision, source_updated_at, cached_at, payload_json
      FROM customers_cache
     WHERE empresa_id = ?
       AND (? = 0 OR ativo = 1)
       AND (? = '' OR nome LIKE ? ESCAPE '\\' COLLATE NOCASE
                    OR COALESCE(documento, '') LIKE ? ESCAPE '\\' COLLATE NOCASE)
     ORDER BY ativo DESC, nome COLLATE NOCASE, cliente_id
     LIMIT ?
  `).all(empresaId, onlyActive ? 1 : 0, term, like, like, limit);
  return rows.map((row) => mapPartyCacheRow(row, 'cliente_id', 'clienteId'));
}

module.exports = {
  upsertCustomerCache,
  getCustomerCacheById,
  searchCustomersCache
};
