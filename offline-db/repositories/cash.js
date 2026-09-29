'use strict';

const {
  beginImmediateTransaction: beginTransaction
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

function jsonText(value) {
  return JSON.stringify(value == null ? {} : value);
}

function parseJsonText(value) {
  if (value == null || value === '') return null;
  try { return JSON.parse(String(value)); } catch (_) { return null; }
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

function getCashSession(db, empresaIdValue, sessionIdValue) {
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const sessionId = requiredText(sessionIdValue, 'sessionId');
  const row = db.prepare(`
    SELECT empresa_id, session_id, operation_id, status,
           opening_balance_centavos, opened_at, closed_at, created_at, payload_json
      FROM cash_sessions
     WHERE empresa_id = ? AND session_id = ?
  `).get(empresaId, sessionId);
  if (!row) return null;
  return {
    empresaId: String(row.empresa_id),
    sessionId: String(row.session_id),
    operationId: String(row.operation_id),
    status: String(row.status),
    openingBalanceCentavos: Number(row.opening_balance_centavos),
    openedAt: String(row.opened_at),
    closedAt: row.closed_at == null ? null : String(row.closed_at),
    createdAt: String(row.created_at),
    payload: parseJsonText(row.payload_json)
  };
}

function getOpenCashSession(db, empresaIdValue) {
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const rows = db.prepare(`
    SELECT empresa_id, session_id, operation_id, status,
           opening_balance_centavos, opened_at, closed_at, created_at, payload_json
      FROM cash_sessions
     WHERE empresa_id = ?
       AND status = 'OPEN'
     ORDER BY opened_at DESC, session_id DESC
     LIMIT 2
  `).all(empresaId);

  if (rows.length > 1) {
    throw new Error(
      'Mais de uma sessão de caixa está aberta para a empresa; operação offline bloqueada.'
    );
  }

  if (!rows.length) return null;

  const row = rows[0];
  return {
    empresaId: String(row.empresa_id),
    sessionId: String(row.session_id),
    operationId: String(row.operation_id),
    status: String(row.status),
    openingBalanceCentavos: Number(row.opening_balance_centavos),
    openedAt: String(row.opened_at),
    closedAt: row.closed_at == null ? null : String(row.closed_at),
    createdAt: String(row.created_at),
    payload: parseJsonText(row.payload_json)
  };
}

function openCashSession(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const sessionId = requiredText(input.sessionId, 'sessionId');
  const operationId = requiredText(input.operationId, 'operationId');
  const openingBalanceCentavos = moneyCents(
    input.openingBalanceCentavos == null ? 0 : input.openingBalanceCentavos,
    'openingBalanceCentavos'
  );
  const openedAt = optionalText(input.openedAt) || nowIso();
  const createdAt = nowIso();

  const existingSession = db.prepare(`
    SELECT session_id, operation_id FROM cash_sessions
     WHERE empresa_id = ? AND session_id = ?
  `).get(empresaId, sessionId);
  if (existingSession) {
    if (String(existingSession.operation_id) !== operationId) {
      throw new Error(`sessionId ${sessionId} já existe com outro operationId.`);
    }
    return { applied: false, duplicate: true, session: getCashSession(db, empresaId, sessionId) };
  }

  const existingOperation = db.prepare(`
    SELECT session_id FROM cash_sessions
     WHERE empresa_id = ? AND operation_id = ?
  `).get(empresaId, operationId);
  if (existingOperation) {
    if (String(existingOperation.session_id) !== sessionId) {
      throw new Error(`operationId ${operationId} já pertence ao caixa ${existingOperation.session_id}.`);
    }
    return { applied: false, duplicate: true, session: getCashSession(db, empresaId, sessionId) };
  }

  const existingOpenSession = db.prepare(`
    SELECT session_id
      FROM cash_sessions
     WHERE empresa_id = ?
       AND status = 'OPEN'
     LIMIT 1
  `).get(empresaId);

  if (existingOpenSession) {
    throw new Error(
      `A empresa já possui uma sessão de caixa aberta: ${existingOpenSession.session_id}.`
    );
  }

  db.prepare(`
    INSERT INTO cash_sessions (
      empresa_id, session_id, operation_id, status, opening_balance_centavos,
      opened_at, closed_at, created_at, payload_json
    ) VALUES (?, ?, ?, 'OPEN', ?, ?, NULL, ?, ?)
  `).run(
    empresaId,
    sessionId,
    operationId,
    openingBalanceCentavos,
    openedAt,
    createdAt,
    jsonText(input.payload)
  );

  return { applied: true, duplicate: false, session: getCashSession(db, empresaId, sessionId) };
}

function closeCashSession(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const sessionId = requiredText(input.sessionId, 'sessionId');
  const closedAt = optionalText(input.closedAt) || nowIso();
  const session = getCashSession(db, empresaId, sessionId);

  if (!session) {
    throw new Error(`Caixa ${sessionId} não existe para a empresa.`);
  }

  if (session.status === 'CLOSED') {
    return {
      applied: false,
      duplicate: true,
      session
    };
  }

  const nextPayload = {
    ...(session.payload && typeof session.payload === 'object' && !Array.isArray(session.payload)
      ? session.payload
      : {}),
    ...(input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
      ? input.payload
      : {})
  };

  const result = db.prepare(`
    UPDATE cash_sessions
       SET status = 'CLOSED',
           closed_at = ?,
           payload_json = ?
     WHERE empresa_id = ?
       AND session_id = ?
       AND status = 'OPEN'
  `).run(
    closedAt,
    jsonText(nextPayload),
    empresaId,
    sessionId
  );

  if (Number(result.changes || 0) !== 1) {
    throw new Error(`Caixa ${sessionId} não pôde ser fechado de forma atômica.`);
  }

  return {
    applied: true,
    duplicate: false,
    session: getCashSession(db, empresaId, sessionId)
  };
}

function registerCashMovement(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const movementId = requiredText(input.movementId, 'movementId');
  const operationId = requiredText(input.operationId, 'operationId');
  const sessionId = requiredText(input.sessionId, 'sessionId');
  const direction = ledgerDirection(input.direction);
  const amountCentavos = positiveMoneyCents(input.amountCentavos, 'amountCentavos');
  const movementType = requiredText(input.movementType, 'movementType');
  const sourceId = optionalText(input.sourceId);
  const occurredAt = optionalText(input.occurredAt) || nowIso();
  const createdAt = nowIso();

  const session = getCashSession(db, empresaId, sessionId);
  if (!session || session.status !== 'OPEN') {
    throw new Error(`Caixa ${sessionId} não está aberto para a empresa.`);
  }

  const result = db.prepare(`
    INSERT INTO cash_movements (
      empresa_id, movement_id, operation_id, session_id, direction,
      amount_centavos, movement_type, source_id, occurred_at, created_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT DO NOTHING
  `).run(
    empresaId,
    movementId,
    operationId,
    sessionId,
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

const CASH_REPOSITORY_CONTEXT_PROPERTY =
  '__efiscoCashRepository';

function updateCashSessionPayload(
  db,
  empresaIdValue,
  sessionIdValue,
  payload
) {
  const empresaId =
    requiredText(empresaIdValue, 'empresaId');
  const sessionId =
    requiredText(sessionIdValue, 'sessionId');

  const result = db.prepare(`
    UPDATE cash_sessions
       SET payload_json = ?
     WHERE empresa_id = ?
       AND session_id = ?
  `).run(
    jsonText(payload),
    empresaId,
    sessionId
  );

  return Number(result.changes || 0) === 1;
}

function createCashRepository(db) {
  return Object.freeze({
    beginImmediateTransaction() {
      return beginTransaction(db);
    },
    updateCashSessionPayload(
      empresaId,
      sessionId,
      payload
    ) {
      return updateCashSessionPayload(
        db,
        empresaId,
        sessionId,
        payload
      );
    }
  });
}

function attachCashRepository(db) {
  const current =
    db[CASH_REPOSITORY_CONTEXT_PROPERTY];

  if (current) return current;

  const repository =
    createCashRepository(db);

  Object.defineProperty(
    db,
    CASH_REPOSITORY_CONTEXT_PROPERTY,
    {
      value: repository,
      enumerable: false,
      configurable: false,
      writable: false
    }
  );

  return repository;
}

module.exports = {
  CASH_REPOSITORY_CONTEXT_PROPERTY,
  attachCashRepository,
  getCashSession,
  getOpenCashSession,
  openCashSession,
  closeCashSession,
  registerCashMovement,
  updateCashSessionPayload
};
