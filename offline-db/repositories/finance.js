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

function moneyCents(value, fieldName) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${fieldName} deve ser um inteiro seguro maior ou igual a zero.`);
  }
  return number;
}

function ledgerDirection(value, fieldName = 'direction') {
  const text = String(value == null ? '' : value).trim().toUpperCase();
  if (value === 1 || text === '1' || text === 'ENTRADA' || text === 'IN' || text === 'CREDITO' || text === 'CREDIT') return 1;
  if (value === -1 || text === '-1' || text === 'SAIDA' || text === 'OUT' || text === 'DEBITO' || text === 'DEBIT') return -1;
  throw new Error(`${fieldName} deve ser ENTRADA/SAIDA (ou 1/-1).`);
}

function positiveMoneyCents(value, fieldName) {
  const amount = moneyCents(value, fieldName);
  if (amount <= 0) {
    throw new Error(`${fieldName} deve ser maior que zero.`);
  }
  return amount;
}

function registerFinancialMovement(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const movementId = requiredText(input.movementId, 'movementId');
  const operationId = requiredText(input.operationId, 'operationId');
  const accountId = optionalText(input.accountId);
  const direction = ledgerDirection(input.direction);
  const amountCentavos = positiveMoneyCents(input.amountCentavos, 'amountCentavos');
  const movementType = requiredText(input.movementType, 'movementType');
  const sourceId = optionalText(input.sourceId);
  const occurredAt = optionalText(input.occurredAt) || nowIso();
  const createdAt = nowIso();

  const result = db.prepare(`
    INSERT INTO financial_movements (
      empresa_id, movement_id, operation_id, account_id, direction,
      amount_centavos, movement_type, source_id, occurred_at, created_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT DO NOTHING
  `).run(
    empresaId,
    movementId,
    operationId,
    accountId,
    direction,
    amountCentavos,
    movementType,
    sourceId,
    occurredAt,
    createdAt,
    jsonText(input.payload)
  );

  return {
    applied: Number(result.changes || 0) === 1,
    duplicate: Number(result.changes || 0) !== 1,
    movementId,
    operationId
  };
}

module.exports = {
  registerFinancialMovement
};
