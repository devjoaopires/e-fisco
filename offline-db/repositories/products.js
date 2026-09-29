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

function mapProductCacheRow(row) {
  if (!row) return null;
  return {
    empresaId: String(row.empresa_id),
    produtoId: String(row.produto_id),
    codigo: row.codigo == null ? null : String(row.codigo),
    gtin: row.gtin == null ? null : String(row.gtin),
    descricao: String(row.descricao),
    unidade: row.unidade == null ? null : String(row.unidade),
    precoCentavos: row.preco_centavos == null ? null : Number(row.preco_centavos),
    ativo: Number(row.ativo) === 1,
    revision: row.revision == null ? null : String(row.revision),
    sourceUpdatedAt: row.source_updated_at == null ? null : String(row.source_updated_at),
    cachedAt: String(row.cached_at),
    payload: parseJsonText(row.payload_json)
  };
}

function upsertProductCache(db, input) {
  const empresaId = requiredText(input && input.empresaId, 'empresaId');
  const produtoId = requiredText(input && input.produtoId, 'produtoId');
  const descricao = requiredText(input && input.descricao, 'descricao');
  const cachedAt = nowIso();
  const preco = input && input.precoCentavos != null
    ? Number(input.precoCentavos)
    : null;

  if (preco != null && (!Number.isSafeInteger(preco) || preco < 0)) {
    throw new Error('precoCentavos deve ser um inteiro seguro maior ou igual a zero.');
  }

  db.prepare(`
    INSERT INTO products_cache (
      empresa_id, produto_id, codigo, gtin, descricao, unidade,
      preco_centavos, ativo, revision, source_updated_at, cached_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(empresa_id, produto_id) DO UPDATE SET
      codigo = excluded.codigo,
      gtin = excluded.gtin,
      descricao = excluded.descricao,
      unidade = excluded.unidade,
      preco_centavos = excluded.preco_centavos,
      ativo = excluded.ativo,
      revision = excluded.revision,
      source_updated_at = excluded.source_updated_at,
      cached_at = excluded.cached_at,
      payload_json = excluded.payload_json
  `).run(
    empresaId,
    produtoId,
    optionalText(input.codigo),
    optionalText(input.gtin),
    descricao,
    optionalText(input.unidade),
    preco,
    booleanInt(input.ativo, true),
    optionalText(input.revision),
    optionalText(input.sourceUpdatedAt),
    cachedAt,
    jsonText(input.payload)
  );

  return db.prepare(`
    SELECT empresa_id, produto_id, codigo, gtin, descricao, unidade,
           preco_centavos, ativo, revision, source_updated_at, cached_at, payload_json
      FROM products_cache
     WHERE empresa_id = ? AND produto_id = ?
  `).get(empresaId, produtoId);
}

function getProductCacheById(db, empresaIdValue, produtoIdValue) {
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const produtoId = requiredText(produtoIdValue, 'produtoId');
  const row = db.prepare(`
    SELECT empresa_id, produto_id, codigo, gtin, descricao, unidade,
           preco_centavos, ativo, revision, source_updated_at, cached_at, payload_json
      FROM products_cache
     WHERE empresa_id = ? AND produto_id = ?
  `).get(empresaId, produtoId);
  return mapProductCacheRow(row);
}

function findProductCacheByCodeOrGtin(db, empresaIdValue, value) {
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const needle = requiredText(value, 'codigoOuGtin');
  const row = db.prepare(`
    SELECT empresa_id, produto_id, codigo, gtin, descricao, unidade,
           preco_centavos, ativo, revision, source_updated_at, cached_at, payload_json
      FROM products_cache
     WHERE empresa_id = ?
       AND ativo = 1
       AND (codigo = ? OR gtin = ?)
     ORDER BY CASE WHEN codigo = ? THEN 0 ELSE 1 END, produto_id
     LIMIT 1
  `).get(empresaId, needle, needle, needle);
  return mapProductCacheRow(row);
}

function searchProductsCache(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const term = escapeLike(input.term);
  const limit = normalizeLimit(input.limit, 50, 5000);
  const onlyActive = input.onlyActive !== false;
  const like = `%${term}%`;
  const rows = db.prepare(`
    SELECT empresa_id, produto_id, codigo, gtin, descricao, unidade,
           preco_centavos, ativo, revision, source_updated_at, cached_at, payload_json
      FROM products_cache
     WHERE empresa_id = ?
       AND (? = 0 OR ativo = 1)
       AND (? = '' OR descricao LIKE ? ESCAPE '\\' COLLATE NOCASE
                    OR COALESCE(codigo, '') LIKE ? ESCAPE '\\' COLLATE NOCASE
                    OR COALESCE(gtin, '') LIKE ? ESCAPE '\\' COLLATE NOCASE)
     ORDER BY ativo DESC, descricao COLLATE NOCASE, produto_id
     LIMIT ?
  `).all(empresaId, onlyActive ? 1 : 0, term, like, like, like, limit);
  return rows.map(mapProductCacheRow);
}

module.exports = {
  upsertProductCache,
  getProductCacheById,
  findProductCacheByCodeOrGtin,
  searchProductsCache
};
