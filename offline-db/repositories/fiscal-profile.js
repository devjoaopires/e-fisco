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

function jsonText(value) {
  return JSON.stringify(value == null ? {} : value);
}

function parseJsonText(value) {
  if (value == null || value === '') return null;
  try { return JSON.parse(String(value)); } catch (_) { return null; }
}

function normalizeFiscalEnvironment(value) {
  const text = String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  if (['1', 'PRODUCAO', 'PROD'].includes(text)) return 'PRODUCAO';
  if (['2', 'HOMOLOGACAO', 'HOMOLOG', 'HOM'].includes(text)) return 'HOMOLOGACAO';
  return '';
}

function mapFiscalProfileCacheRow(row) {
  if (!row) return null;
  return {
    empresaId: String(row.empresa_id),
    cnpj: String(row.cnpj),
    inscricaoEstadual: String(row.inscricao_estadual),
    razaoSocial: String(row.razao_social),
    nomeFantasia: row.nome_fantasia == null ? null : String(row.nome_fantasia),
    cep: row.cep == null ? null : String(row.cep),
    logradouro: String(row.logradouro),
    numero: String(row.numero),
    complemento: row.complemento == null ? null : String(row.complemento),
    bairro: String(row.bairro),
    municipio: String(row.municipio),
    codigoMunicipio: String(row.codigo_municipio),
    uf: String(row.uf),
    serieNfce: String(row.serie_nfce),
    ambiente: String(row.ambiente),
    crt: String(row.crt),
    regimeTributario: row.regime_tributario == null ? null : String(row.regime_tributario),
    urlQrCode: String(row.url_qr_code),
    urlConsultaChave: String(row.url_consulta_chave),
    revision: String(row.revision),
    sourceUpdatedAt: row.source_updated_at == null ? null : String(row.source_updated_at),
    cachedAt: String(row.cached_at),
    payload: parseJsonText(row.payload_json)
  };
}

function upsertFiscalProfileCache(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const ambiente = normalizeFiscalEnvironment(input.ambiente);
  if (!ambiente) {
    throw new Error('ambiente fiscal inválido para o cache offline.');
  }

  const schemaVersion = Number(input.schemaVersion == null ? 1 : input.schemaVersion);
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1) {
    throw new Error('schemaVersion fiscal inválido para o cache offline.');
  }

  const cachedAt = nowIso();
  const payloadBase =
    input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
      ? input.payload
      : {};

  db.prepare(`
    INSERT INTO fiscal_profile_cache (
      empresa_id, cnpj, inscricao_estadual, razao_social, nome_fantasia,
      cep, logradouro, numero, complemento, bairro, municipio,
      codigo_municipio, uf, serie_nfce, ambiente, crt, regime_tributario,
      url_qr_code, url_consulta_chave, revision, source_updated_at,
      cached_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(empresa_id) DO UPDATE SET
      cnpj = excluded.cnpj,
      inscricao_estadual = excluded.inscricao_estadual,
      razao_social = excluded.razao_social,
      nome_fantasia = excluded.nome_fantasia,
      cep = excluded.cep,
      logradouro = excluded.logradouro,
      numero = excluded.numero,
      complemento = excluded.complemento,
      bairro = excluded.bairro,
      municipio = excluded.municipio,
      codigo_municipio = excluded.codigo_municipio,
      uf = excluded.uf,
      serie_nfce = excluded.serie_nfce,
      ambiente = excluded.ambiente,
      crt = excluded.crt,
      regime_tributario = excluded.regime_tributario,
      url_qr_code = excluded.url_qr_code,
      url_consulta_chave = excluded.url_consulta_chave,
      revision = excluded.revision,
      source_updated_at = excluded.source_updated_at,
      cached_at = excluded.cached_at,
      payload_json = excluded.payload_json
  `).run(
    empresaId,
    requiredText(input.cnpj, 'cnpj'),
    requiredText(input.inscricaoEstadual, 'inscricaoEstadual'),
    requiredText(input.razaoSocial, 'razaoSocial'),
    optionalText(input.nomeFantasia),
    optionalText(input.cep),
    requiredText(input.logradouro, 'logradouro'),
    requiredText(input.numero, 'numero'),
    optionalText(input.complemento),
    requiredText(input.bairro, 'bairro'),
    requiredText(input.municipio, 'municipio'),
    requiredText(input.codigoMunicipio, 'codigoMunicipio'),
    requiredText(input.uf, 'uf').toUpperCase(),
    requiredText(input.serieNfce, 'serieNfce'),
    ambiente,
    requiredText(input.crt, 'crt'),
    optionalText(input.regimeTributario),
    requiredText(input.urlQrCode, 'urlQrCode'),
    requiredText(input.urlConsultaChave, 'urlConsultaChave'),
    requiredText(input.revision, 'revision'),
    optionalText(input.sourceUpdatedAt),
    cachedAt,
    jsonText({ ...payloadBase, schemaVersion })
  );

  return getFiscalProfileCache(db, empresaId);
}

function getFiscalProfileCache(db, empresaIdValue) {
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const row = db.prepare(`
    SELECT empresa_id, cnpj, inscricao_estadual, razao_social, nome_fantasia,
           cep, logradouro, numero, complemento, bairro, municipio,
           codigo_municipio, uf, serie_nfce, ambiente, crt, regime_tributario,
           url_qr_code, url_consulta_chave, revision, source_updated_at,
           cached_at, payload_json
      FROM fiscal_profile_cache
     WHERE empresa_id = ?
     LIMIT 1
  `).get(empresaId);
  return mapFiscalProfileCacheRow(row);
}

module.exports = {
  upsertFiscalProfileCache,
  getFiscalProfileCache
};
