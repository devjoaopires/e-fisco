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

function booleanInt(value, defaultValue = true) {
  if (value == null) return defaultValue ? 1 : 0;
  return value === false || value === 0 || value === '0' ? 0 : 1;
}

function decimalMoneyToCents(value, fieldName) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${fieldName} deve ser um valor monetário maior ou igual a zero.`);
  }
  const cents = Math.round(number * 100);
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`${fieldName} excede o limite monetário seguro.`);
  }
  return cents;
}

function mapCrediarioCacheRow(row) {
  if (!row) return null;
  const money = (value) => value == null ? null : Number(value) / 100;
  return {
    empresaId: String(row.empresa_id),
    contaReceberId: String(row.conta_receber_id),
    crediarioId: String(row.crediario_id),
    clienteId: row.cliente_id == null ? null : String(row.cliente_id),
    clienteNome: row.cliente_nome == null ? null : String(row.cliente_nome),
    nome: row.cliente_nome == null ? null : String(row.cliente_nome),
    cpf: row.cpf == null ? null : String(row.cpf),
    whatsapp: row.whatsapp == null ? null : String(row.whatsapp),
    valor: money(row.valor_centavos),
    valorOriginal: money(row.valor_original_centavos),
    valorRecebido: money(row.valor_recebido_centavos),
    saldoReceber: money(row.saldo_receber_centavos),
    vencimento: row.vencimento == null ? null : String(row.vencimento),
    status: String(row.status),
    pago: Number(row.pago) === 1,
    pagoEm: row.pago_em == null ? null : String(row.pago_em),
    formaPagamento: row.forma_pagamento == null ? null : String(row.forma_pagamento),
    abertoEm: row.aberto_em == null ? null : String(row.aberto_em),
    cancelado: Number(row.cancelado) === 1,
    canceladoEm: row.cancelado_em == null ? null : String(row.cancelado_em),
    situacaoVersao: row.situacao_versao == null ? null : Number(row.situacao_versao),
    revision: row.revision == null ? null : String(row.revision),
    sourceUpdatedAt: row.source_updated_at == null ? null : String(row.source_updated_at),
    cachedAt: String(row.cached_at),
    payload: parseJsonText(row.payload_json)
  };
}

function upsertCrediarioCache(db, input) {
  const empresaId = requiredText(input && input.empresaId, 'empresaId');
  const contaReceberId = requiredText(input && input.contaReceberId, 'contaReceberId');
  const crediarioId = requiredText(input && input.crediarioId, 'crediarioId');
  const status = requiredText(input && input.status, 'status');
  const snapshotToken = requiredText(input && input.snapshotToken, 'snapshotToken');
  const cachedAt = nowIso();

  db.prepare(`
    INSERT INTO crediarios_cache (
      empresa_id, conta_receber_id, crediario_id, cliente_id, cliente_nome,
      cpf, whatsapp, valor_centavos, valor_original_centavos,
      valor_recebido_centavos, saldo_receber_centavos, vencimento, status,
      pago, pago_em, forma_pagamento, aberto_em, cancelado, cancelado_em,
      situacao_versao, revision, source_updated_at, snapshot_token,
      cached_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(empresa_id, conta_receber_id) DO UPDATE SET
      crediario_id = excluded.crediario_id,
      cliente_id = excluded.cliente_id,
      cliente_nome = excluded.cliente_nome,
      cpf = excluded.cpf,
      whatsapp = excluded.whatsapp,
      valor_centavos = excluded.valor_centavos,
      valor_original_centavos = excluded.valor_original_centavos,
      valor_recebido_centavos = excluded.valor_recebido_centavos,
      saldo_receber_centavos = excluded.saldo_receber_centavos,
      vencimento = excluded.vencimento,
      status = excluded.status,
      pago = excluded.pago,
      pago_em = excluded.pago_em,
      forma_pagamento = excluded.forma_pagamento,
      aberto_em = excluded.aberto_em,
      cancelado = excluded.cancelado,
      cancelado_em = excluded.cancelado_em,
      situacao_versao = excluded.situacao_versao,
      revision = excluded.revision,
      source_updated_at = excluded.source_updated_at,
      snapshot_token = excluded.snapshot_token,
      cached_at = excluded.cached_at,
      payload_json = excluded.payload_json
  `).run(
    empresaId,
    contaReceberId,
    crediarioId,
    optionalText(input.clienteId),
    optionalText(input.clienteNome || input.nome),
    optionalText(input.cpf),
    optionalText(input.whatsapp),
    decimalMoneyToCents(input.valor, 'valor'),
    decimalMoneyToCents(input.valorOriginal, 'valorOriginal'),
    decimalMoneyToCents(input.valorRecebido, 'valorRecebido'),
    decimalMoneyToCents(input.saldoReceber, 'saldoReceber'),
    optionalText(input.vencimento),
    status,
    booleanInt(input.pago, false),
    optionalText(input.pagoEm),
    optionalText(input.formaPagamento),
    optionalText(input.abertoEm),
    booleanInt(input.cancelado, false),
    optionalText(input.canceladoEm),
    input.situacaoVersao == null ? null : Number(input.situacaoVersao),
    optionalText(input.revision),
    optionalText(input.sourceUpdatedAt),
    snapshotToken,
    cachedAt,
    jsonText(input.payload == null ? input : input.payload)
  );

  return mapCrediarioCacheRow(db.prepare(`
    SELECT *
      FROM crediarios_cache
     WHERE empresa_id = ? AND conta_receber_id = ?
  `).get(empresaId, contaReceberId));
}

function finalizeCrediariosSnapshot(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const snapshotToken = requiredText(input.snapshotToken, 'snapshotToken');
  const result = db.prepare(`
    DELETE FROM crediarios_cache
     WHERE empresa_id = ?
       AND snapshot_token <> ?
       AND snapshot_token NOT LIKE 'local:%'
  `).run(empresaId, snapshotToken);
  return Number(result.changes || 0);
}

function getCrediarioCacheById(db, empresaIdValue, crediarioIdValue) {
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const crediarioId = requiredText(crediarioIdValue, 'crediarioId');
  const row = db.prepare(`
    SELECT *
      FROM crediarios_cache
     WHERE empresa_id = ?
       AND (crediario_id = ? OR conta_receber_id = ?)
     LIMIT 1
  `).get(empresaId, crediarioId, crediarioId);
  return mapCrediarioCacheRow(row);
}

module.exports = {
  mapCrediarioCacheRow,
  upsertCrediarioCache,
  finalizeCrediariosSnapshot,
  getCrediarioCacheById
};
