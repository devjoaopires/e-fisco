'use strict';

const {
  beginImmediateTransaction
} = require('../transaction');

const STOCK_QUANTITY_SCALE = 1000000;

function nowIso() {
  return new Date().toISOString();
}

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

function optionalText(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function jsonText(value) {
  if (value == null) return null;
  return JSON.stringify(value);
}

function parseJsonText(value) {
  if (value == null || value === '') return null;

  try {
    return JSON.parse(String(value));
  } catch (_) {
    return null;
  }
}

function normalizeLimit(
  value,
  defaultValue = 50,
  maxValue = 200
) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return defaultValue;
  }

  return Math.min(
    Math.trunc(number),
    maxValue
  );
}

function decimalToMicrounits(
  value,
  fieldName = 'quantidade'
) {
  if (typeof value === 'bigint') {
    if (
      value <= 0n ||
      value > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      throw new Error(
        `${fieldName} deve ser maior que zero e caber em inteiro seguro.`
      );
    }

    return Number(value);
  }

  const raw =
    String(value == null ? '' : value)
      .trim()
      .replace(',', '.');

  if (!/^\d+(?:\.\d{1,6})?$/.test(raw)) {
    throw new Error(
      `${fieldName} deve ser decimal positivo com no máximo 6 casas.`
    );
  }

  const [whole, fraction = ''] =
    raw.split('.');
  const microsBig =
    (
      BigInt(whole) *
      BigInt(STOCK_QUANTITY_SCALE)
    ) +
    BigInt(
      (fraction + '000000').slice(0, 6)
    );

  if (
    microsBig <= 0n ||
    microsBig >
      BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new Error(
      `${fieldName} deve ser maior que zero e caber em inteiro seguro.`
    );
  }

  return Number(microsBig);
}

function microunitsToDecimalString(value) {
  const total = BigInt(value);
  const sign = total < 0n ? '-' : '';
  const absolute =
    total < 0n ? -total : total;
  const whole =
    absolute /
    BigInt(STOCK_QUANTITY_SCALE);
  const fraction =
    String(
      absolute %
      BigInt(STOCK_QUANTITY_SCALE)
    )
      .padStart(6, '0')
      .replace(/0+$/, '');

  return fraction
    ? `${sign}${whole}.${fraction}`
    : `${sign}${whole}`;
}

function stockDirection(value) {
  const text =
    String(value == null ? '' : value)
      .trim()
      .toUpperCase();

  if (
    value === 1 ||
    text === '1' ||
    text === 'ENTRADA' ||
    text === 'IN'
  ) {
    return 1;
  }

  if (
    value === -1 ||
    text === '-1' ||
    text === 'SAIDA' ||
    text === 'OUT'
  ) {
    return -1;
  }

  throw new Error(
    'direction deve ser ENTRADA/SAIDA ou 1/-1.'
  );
}

function getStockProjection(
  db,
  empresaIdValue,
  produtoIdValue
) {
  const empresaId =
    requiredText(empresaIdValue, 'empresaId');
  const produtoId =
    requiredText(produtoIdValue, 'produtoId');

  const row = db.prepare(`
    SELECT quantity_microunits, updated_at
      FROM stock_projection
     WHERE empresa_id = ? AND produto_id = ?
  `).get(empresaId, produtoId);

  const quantityMicrounits =
    row
      ? Number(row.quantity_microunits)
      : 0;

  return {
    empresaId,
    produtoId,
    quantityMicrounits,
    quantidade:
      microunitsToDecimalString(
        quantityMicrounits
      ),
    updatedAt:
      row
        ? String(row.updated_at)
        : null
  };
}

function registerStockMovement(
  db,
  input
) {
  const empresaId =
    requiredText(
      input && input.empresaId,
      'empresaId'
    );
  const movementId =
    requiredText(
      input && input.movementId,
      'movementId'
    );
  const operationId =
    requiredText(
      input && input.operationId,
      'operationId'
    );
  const produtoId =
    requiredText(
      input && input.produtoId,
      'produtoId'
    );
  const direction =
    stockDirection(
      input && input.direction
    );
  const quantityMicrounits =
    decimalToMicrounits(
      input && input.quantidade,
      'quantidade'
    );
  const movementType =
    requiredText(
      input && input.movementType,
      'movementType'
    );
  const sourceId =
    optionalText(
      input && input.sourceId
    );
  const occurredAt =
    optionalText(
      input && input.occurredAt
    ) || nowIso();
  const createdAt = nowIso();

  const transaction =
    beginImmediateTransaction(db);

  try {
    const result = db.prepare(`
      INSERT INTO stock_movements (
        empresa_id, movement_id, operation_id, produto_id, direction,
        quantity_microunits, movement_type, source_id, occurred_at,
        created_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `).run(
      empresaId,
      movementId,
      operationId,
      produtoId,
      direction,
      quantityMicrounits,
      movementType,
      sourceId,
      occurredAt,
      createdAt,
      jsonText(input && input.payload)
    );

    const applied =
      Number(result.changes || 0) === 1;

    if (applied) {
      const delta =
        direction *
        quantityMicrounits;

      db.prepare(`
        INSERT INTO stock_projection (
          empresa_id, produto_id, quantity_microunits, updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(empresa_id, produto_id) DO UPDATE SET
          quantity_microunits = stock_projection.quantity_microunits + excluded.quantity_microunits,
          updated_at = excluded.updated_at
      `).run(
        empresaId,
        produtoId,
        delta,
        createdAt
      );
    }

    transaction.commit();

    return {
      applied,
      duplicate: !applied,
      movementId,
      operationId,
      empresaId,
      produtoId,
      direction,
      quantidade:
        microunitsToDecimalString(
          quantityMicrounits
        ),
      saldoProjetado:
        getStockProjection(
          db,
          empresaId,
          produtoId
        ).quantidade
    };
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}

function listPendingStockDeltasByProduct(
  db,
  empresaIdValue
) {
  const empresaId =
    requiredText(empresaIdValue, 'empresaId');

  const rows = db.prepare(`
    SELECT sm.produto_id,
           COALESCE(SUM(sm.direction * sm.quantity_microunits), 0) AS delta_microunits
      FROM stock_movements sm
      JOIN sync_outbox o
        ON o.empresa_id = sm.empresa_id
       AND substr(
             sm.operation_id,
             1,
             length(o.operation_id) + 1
           ) = o.operation_id || ':'
     WHERE sm.empresa_id = ?
       AND o.status <> 'CONFIRMED'
     GROUP BY sm.produto_id
  `).all(empresaId);

  return rows.map((row) => ({
    produtoId:
      String(row.produto_id),
    deltaMicrounits:
      Number(
        row.delta_microunits || 0
      )
  }));
}

function listStockMovements(
  db,
  input = {}
) {
  const empresaId =
    requiredText(
      input.empresaId,
      'empresaId'
    );
  const produtoId =
    optionalText(input.produtoId);
  const limit =
    normalizeLimit(
      input.limit,
      100,
      500
    );

  const rows = db.prepare(`
    SELECT empresa_id, movement_id, operation_id, produto_id, direction,
           quantity_microunits, movement_type, source_id, occurred_at,
           created_at, payload_json
      FROM stock_movements
     WHERE empresa_id = ?
       AND (? IS NULL OR produto_id = ?)
     ORDER BY occurred_at, movement_id
     LIMIT ?
  `).all(
    empresaId,
    produtoId,
    produtoId,
    limit
  );

  return rows.map((row) => ({
    empresaId:
      String(row.empresa_id),
    movementId:
      String(row.movement_id),
    operationId:
      String(row.operation_id),
    produtoId:
      String(row.produto_id),
    direction:
      Number(row.direction),
    quantidade:
      microunitsToDecimalString(
        Number(
          row.quantity_microunits
        )
      ),
    movementType:
      String(row.movement_type),
    sourceId:
      row.source_id == null
        ? null
        : String(row.source_id),
    occurredAt:
      String(row.occurred_at),
    createdAt:
      String(row.created_at),
    payload:
      parseJsonText(
        row.payload_json
      )
  }));
}

module.exports = {
  STOCK_QUANTITY_SCALE,
  decimalToMicrounits,
  microunitsToDecimalString,
  stockDirection,
  registerStockMovement,
  getStockProjection,
  listPendingStockDeltasByProduct,
  listStockMovements
};
