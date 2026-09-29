'use strict';

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

function normalizeLimit(value, defaultValue = 50, maxValue = 200) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return defaultValue;
  return Math.min(Math.trunc(number), maxValue);
}

function mapCashMovementRow(row) {
  if (!row) return null;
  return {
    empresaId: String(row.empresa_id),
    movementId: String(row.movement_id),
    operationId: String(row.operation_id),
    sessionId: String(row.session_id),
    direction: Number(row.direction),
    amountCentavos: Number(row.amount_centavos),
    movementType: String(row.movement_type),
    sourceId: row.source_id == null ? null : String(row.source_id),
    occurredAt: String(row.occurred_at),
    createdAt: String(row.created_at),
    payload: parseJsonText(row.payload_json)
  };
}

function listCashMovements(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const sessionId = optionalText(input.sessionId);
  const limit = normalizeLimit(input.limit, 100, 5000);
  const offset = Math.max(0, Math.trunc(Number(input.offset) || 0));
  const rows = db.prepare(`
    SELECT empresa_id, movement_id, operation_id, session_id, direction,
           amount_centavos, movement_type, source_id, occurred_at, created_at, payload_json
      FROM cash_movements
     WHERE empresa_id = ?
       AND (? IS NULL OR session_id = ?)
     ORDER BY occurred_at, movement_id
     LIMIT ? OFFSET ?
  `).all(empresaId, sessionId, sessionId, limit, offset);
  return rows.map(mapCashMovementRow);
}


/*
 * Resumo do caixa sem limite de linhas.
 *
 * Quando existe um snapshot confirmado da VPS, snapshotAt representa
 * o instante até o qual os totais remotos já foram consolidados. Somamos
 * somente movimentos locais posteriores a esse instante OU operações cujo
 * outbox foi atualizado depois do snapshot.
 */

function aggregateCashSessionActivity(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const sessionId = requiredText(input.sessionId, 'sessionId');
  const snapshotAt = optionalText(input.snapshotAt);

  const cutoffClauseCash = snapshotAt
    ? `AND (
         cm.occurred_at > ?
         OR COALESCE(oc.updated_at, '') > ?
         OR COALESCE(os.updated_at, '') > ?
       )`
    : '';

  const cashParams = snapshotAt
    ? [empresaId, sessionId, snapshotAt, snapshotAt, snapshotAt]
    : [empresaId, sessionId];

  const cash = db.prepare(`
    SELECT
      COALESCE(SUM(cm.direction * cm.amount_centavos), 0) AS signed_cash_centavos,
      COALESCE(SUM(CASE WHEN UPPER(TRIM(cm.movement_type)) = 'VENDA_PAGA' THEN cm.direction * cm.amount_centavos ELSE 0 END), 0) AS vendas_dinheiro_centavos,
      COALESCE(SUM(CASE WHEN UPPER(TRIM(cm.movement_type)) = 'SANGRIA' THEN ABS(cm.amount_centavos) ELSE 0 END), 0) AS sangrias_centavos,
      COALESCE(SUM(CASE WHEN UPPER(TRIM(cm.movement_type)) = 'SUPRIMENTO' THEN ABS(cm.amount_centavos) ELSE 0 END), 0) AS suprimentos_centavos,
      COALESCE(SUM(CASE WHEN UPPER(TRIM(cm.movement_type)) = 'AJUSTE' THEN cm.direction * cm.amount_centavos ELSE 0 END), 0) AS ajustes_centavos,
      COALESCE(SUM(CASE WHEN UPPER(TRIM(cm.movement_type)) IN ('SANGRIA', 'SUPRIMENTO', 'AJUSTE') THEN 1 ELSE 0 END), 0) AS quantidade_movimentos
    FROM cash_movements AS cm
    LEFT JOIN sync_outbox AS oc
      ON oc.empresa_id = cm.empresa_id
     AND oc.operation_id = cm.operation_id
    LEFT JOIN sales AS s
      ON s.empresa_id = cm.empresa_id
     AND s.sale_id = cm.source_id
    LEFT JOIN sync_outbox AS os
      ON os.empresa_id = s.empresa_id
     AND os.operation_id = s.operation_id
    WHERE cm.empresa_id = ?
      AND cm.session_id = ?
      ${cutoffClauseCash}
  `).get(...cashParams) || {};

  const cutoffClauseFinancial = snapshotAt
    ? `AND (fm.occurred_at > ? OR COALESCE(os.updated_at, '') > ?)`
    : '';

  const financialParams = snapshotAt
    ? [empresaId, sessionId, sessionId, snapshotAt, snapshotAt]
    : [empresaId, sessionId, sessionId];

  const financial = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN UPPER(TRIM(COALESCE(json_extract(fm.payload_json, '$.meio'), json_extract(fm.payload_json, '$.paymentMethod'), json_extract(fm.payload_json, '$.paymentPart.method'), ''))) = 'PIX' THEN fm.amount_centavos ELSE 0 END), 0) AS pix_centavos,
      COALESCE(SUM(CASE WHEN UPPER(TRIM(COALESCE(json_extract(fm.payload_json, '$.meio'), json_extract(fm.payload_json, '$.paymentMethod'), json_extract(fm.payload_json, '$.paymentPart.method'), ''))) IN ('DEBITO', 'DÉBITO') THEN fm.amount_centavos ELSE 0 END), 0) AS debito_centavos,
      COALESCE(SUM(CASE WHEN UPPER(TRIM(COALESCE(json_extract(fm.payload_json, '$.meio'), json_extract(fm.payload_json, '$.paymentMethod'), json_extract(fm.payload_json, '$.paymentPart.method'), ''))) IN ('CREDITO', 'CRÉDITO') THEN fm.amount_centavos ELSE 0 END), 0) AS credito_centavos
    FROM financial_movements AS fm
    LEFT JOIN sales AS s
      ON s.empresa_id = fm.empresa_id
     AND s.sale_id = fm.source_id
    LEFT JOIN sync_outbox AS os
      ON os.empresa_id = s.empresa_id
     AND os.operation_id = s.operation_id
    WHERE fm.empresa_id = ?
      AND fm.direction = 1
      AND UPPER(TRIM(fm.movement_type)) = 'VENDA_PAGA'
      AND (
        json_extract(fm.payload_json, '$.caixaSessaoId') = ?
        OR json_extract(s.payload_json, '$.caixaSessaoId') = ?
      )
      ${cutoffClauseFinancial}
  `).get(...financialParams) || {};

  const cutoffClauseSales = snapshotAt
    ? `AND (local_event_at > ? OR COALESCE(outbox_updated_at, '') > ?)`
    : '';

  const saleParams = snapshotAt
    ? [empresaId, sessionId, empresaId, sessionId, sessionId, snapshotAt, snapshotAt]
    : [empresaId, sessionId, empresaId, sessionId, sessionId];

  const saleCounter = db.prepare(`
    WITH local_sale_sources AS (
      SELECT cm.source_id AS sale_id,
             cm.occurred_at AS local_event_at,
             os.updated_at AS outbox_updated_at
        FROM cash_movements AS cm
        LEFT JOIN sales AS s
          ON s.empresa_id = cm.empresa_id
         AND s.sale_id = cm.source_id
        LEFT JOIN sync_outbox AS os
          ON os.empresa_id = s.empresa_id
         AND os.operation_id = s.operation_id
       WHERE cm.empresa_id = ?
         AND cm.session_id = ?
         AND UPPER(TRIM(cm.movement_type)) = 'VENDA_PAGA'
         AND cm.source_id IS NOT NULL

      UNION ALL

      SELECT fm.source_id AS sale_id,
             fm.occurred_at AS local_event_at,
             os.updated_at AS outbox_updated_at
        FROM financial_movements AS fm
        LEFT JOIN sales AS s
          ON s.empresa_id = fm.empresa_id
         AND s.sale_id = fm.source_id
        LEFT JOIN sync_outbox AS os
          ON os.empresa_id = s.empresa_id
         AND os.operation_id = s.operation_id
       WHERE fm.empresa_id = ?
         AND fm.direction = 1
         AND UPPER(TRIM(fm.movement_type)) = 'VENDA_PAGA'
         AND fm.source_id IS NOT NULL
         AND (
           json_extract(fm.payload_json, '$.caixaSessaoId') = ?
           OR json_extract(s.payload_json, '$.caixaSessaoId') = ?
         )
    )
    SELECT COUNT(DISTINCT sale_id) AS quantidade_vendas
      FROM local_sale_sources
     WHERE sale_id IS NOT NULL
       ${cutoffClauseSales}
  `).get(...saleParams) || {};

  const detailLimit = normalizeLimit(input.movementLimit, 5000, 5000);
  const detailOffset = Math.max(0, Math.trunc(Number(input.movementOffset) || 0));
  const detailCutoff = snapshotAt
    ? `AND (
         cm.occurred_at > ?
         OR COALESCE(oc.updated_at, '') > ?
         OR COALESCE(os.updated_at, '') > ?
       )`
    : '';
  const detailParams = snapshotAt
    ? [empresaId, sessionId, snapshotAt, snapshotAt, snapshotAt, detailLimit, detailOffset]
    : [empresaId, sessionId, detailLimit, detailOffset];

  const movements = db.prepare(`
    SELECT cm.empresa_id, cm.movement_id, cm.operation_id, cm.session_id,
           cm.direction, cm.amount_centavos, cm.movement_type, cm.source_id,
           cm.occurred_at, cm.created_at, cm.payload_json
      FROM cash_movements AS cm
      LEFT JOIN sync_outbox AS oc
        ON oc.empresa_id = cm.empresa_id
       AND oc.operation_id = cm.operation_id
      LEFT JOIN sales AS s
        ON s.empresa_id = cm.empresa_id
       AND s.sale_id = cm.source_id
      LEFT JOIN sync_outbox AS os
        ON os.empresa_id = s.empresa_id
       AND os.operation_id = s.operation_id
     WHERE cm.empresa_id = ?
       AND cm.session_id = ?
       AND UPPER(TRIM(cm.movement_type)) IN ('SANGRIA', 'SUPRIMENTO', 'AJUSTE')
       ${detailCutoff}
     ORDER BY cm.occurred_at, cm.movement_id
     LIMIT ? OFFSET ?
  `).all(...detailParams).map(mapCashMovementRow);

  return {
    signedCashCentavos: Number(cash.signed_cash_centavos || 0),
    vendasDinheiroCentavos: Number(cash.vendas_dinheiro_centavos || 0),
    recebimentosPixCentavos: Number(financial.pix_centavos || 0),
    recebimentosDebitoCentavos: Number(financial.debito_centavos || 0),
    recebimentosCreditoCentavos: Number(financial.credito_centavos || 0),
    sangriasCentavos: Number(cash.sangrias_centavos || 0),
    suprimentosCentavos: Number(cash.suprimentos_centavos || 0),
    ajustesCentavos: Number(cash.ajustes_centavos || 0),
    quantidadeVendas: Number(saleCounter.quantidade_vendas || 0),
    quantidadeMovimentos: Number(cash.quantidade_movimentos || 0),
    movimentos: movements
  };
}

const CASH_READ_MODEL_CONTEXT_PROPERTY =
  '__efiscoCashReadModel';

function latestCloseDependency(
  db,
  empresaIdValue
) {
  const empresaId =
    requiredText(empresaIdValue, 'empresaId');
  const row = db.prepare(`
    SELECT operation_id
      FROM sync_outbox
     WHERE empresa_id = ?
       AND type = 'CASH_CLOSE'
     ORDER BY created_at DESC, operation_id DESC
     LIMIT 1
  `).get(empresaId);

  return row
    ? [String(row.operation_id)]
    : [];
}

function sessionDependencies(
  db,
  empresaIdValue,
  sessionIdValue
) {
  const empresaId =
    requiredText(empresaIdValue, 'empresaId');
  const sessionId =
    requiredText(sessionIdValue, 'sessionId');
  const rows = db.prepare(`
    SELECT operation_id, type, entity_id, payload_json
      FROM sync_outbox
     WHERE empresa_id = ?
       AND type IN ('CASH_OPEN', 'CASH_MOVEMENT', 'SALE_PAID')
     ORDER BY created_at, operation_id
  `).all(empresaId);

  const dependencies = [];

  for (const row of rows) {
    const payload =
      parseJsonText(row.payload_json) || {};
    let belongs = false;

    if (row.type === 'CASH_OPEN') {
      belongs =
        String(row.entity_id) === sessionId;
    } else if (row.type === 'CASH_MOVEMENT') {
      belongs =
        String(payload.sessionId || '').trim() ===
        sessionId;
    } else if (row.type === 'SALE_PAID') {
      belongs =
        Array.isArray(payload.cashMovements) &&
        payload.cashMovements.some(
          (movement) => (
            String(
              movement && movement.sessionId || ''
            ).trim() === sessionId
          )
        );
    }

    if (belongs) {
      dependencies.push(
        String(row.operation_id)
      );
    }
  }

  return [...new Set(dependencies)];
}

function findCashCloseOperationId(
  db,
  empresaIdValue,
  sessionIdValue
) {
  const empresaId =
    requiredText(empresaIdValue, 'empresaId');
  const sessionId =
    requiredText(sessionIdValue, 'sessionId');
  const row = db.prepare(`
    SELECT operation_id
      FROM sync_outbox
     WHERE empresa_id = ?
       AND type = 'CASH_CLOSE'
       AND entity_id = ?
     ORDER BY created_at DESC
     LIMIT 1
  `).get(empresaId, sessionId);

  return row
    ? String(row.operation_id)
    : null;
}

function createCashReadModel(db) {
  return Object.freeze({
    latestCloseDependency(empresaId) {
      return latestCloseDependency(
        db,
        empresaId
      );
    },
    sessionDependencies(
      empresaId,
      sessionId
    ) {
      return sessionDependencies(
        db,
        empresaId,
        sessionId
      );
    },
    findCashCloseOperationId(
      empresaId,
      sessionId
    ) {
      return findCashCloseOperationId(
        db,
        empresaId,
        sessionId
      );
    }
  });
}

function attachCashReadModel(db) {
  const current =
    db[CASH_READ_MODEL_CONTEXT_PROPERTY];

  if (current) return current;

  const readModel =
    createCashReadModel(db);

  Object.defineProperty(
    db,
    CASH_READ_MODEL_CONTEXT_PROPERTY,
    {
      value: readModel,
      enumerable: false,
      configurable: false,
      writable: false
    }
  );

  return readModel;
}

module.exports = {
  CASH_READ_MODEL_CONTEXT_PROPERTY,
  attachCashReadModel,
  listCashMovements,
  aggregateCashSessionActivity,
  latestCloseDependency,
  sessionDependencies,
  findCashCloseOperationId
};
