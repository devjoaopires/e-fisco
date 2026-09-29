'use strict';

const FINANCE_READ_MODEL_CONTEXT_PROPERTY =
  '__efiscoFinanceReadModel';
const STOCK_QUANTITY_SCALE = 1000000;

function requiredDatabase(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error(
      'SQLite offline válido é obrigatório para o read-model financeiro.'
    );
  }
  return db;
}

function text(value) {
  return String(value == null ? '' : value).trim();
}

function requiredText(value, fieldName) {
  const normalized = text(value);
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
  return Math.min(Math.trunc(number), maxValue);
}

function microunitsToDecimalString(value) {
  const total = BigInt(value);
  const sign = total < 0n ? '-' : '';
  const absolute = total < 0n ? -total : total;
  const whole =
    absolute / BigInt(STOCK_QUANTITY_SCALE);
  const fraction = String(
    absolute % BigInt(STOCK_QUANTITY_SCALE)
  )
    .padStart(6, '0')
    .replace(/0+$/, '');

  return fraction
    ? `${sign}${whole}.${fraction}`
    : `${sign}${whole}`;
}

function mapFinancialMovementRow(row) {
  if (!row) return null;

  return {
    empresaId: String(row.empresa_id),
    movementId: String(row.movement_id),
    operationId: String(row.operation_id),
    accountId:
      row.account_id == null
        ? null
        : String(row.account_id),
    direction: Number(row.direction),
    amountCentavos: Number(row.amount_centavos),
    movementType: String(row.movement_type),
    sourceId:
      row.source_id == null
        ? null
        : String(row.source_id),
    occurredAt: String(row.occurred_at),
    createdAt: String(row.created_at),
    payload: parseJsonText(row.payload_json)
  };
}

function listFinancialMovements(db, input = {}) {
  const database = requiredDatabase(db);
  const empresaId =
    requiredText(input.empresaId, 'empresaId');
  const accountId =
    optionalText(input.accountId);
  const limit =
    normalizeLimit(input.limit, 100, 500);

  const rows = database.prepare(`
    SELECT empresa_id, movement_id, operation_id, account_id, direction,
           amount_centavos, movement_type, source_id, occurred_at, created_at, payload_json
      FROM financial_movements
     WHERE empresa_id = ?
       AND (? IS NULL OR account_id = ?)
     ORDER BY occurred_at, movement_id
     LIMIT ?
  `).all(
    empresaId,
    accountId,
    accountId,
    limit
  );

  return rows.map(mapFinancialMovementRow);
}

function getSaleById(
  db,
  empresaIdValue,
  saleIdValue
) {
  const database = requiredDatabase(db);
  const empresaId =
    requiredText(empresaIdValue, 'empresaId');
  const saleId =
    requiredText(saleIdValue, 'saleId');

  const sale = database.prepare(`
    SELECT empresa_id, sale_id, operation_id, cliente_id, status,
           total_centavos, occurred_at, created_at, payload_json
      FROM sales
     WHERE empresa_id = ? AND sale_id = ?
  `).get(empresaId, saleId);

  if (!sale) return null;

  const items = database.prepare(`
    SELECT item_id, produto_id, quantity_microunits, unit_price_centavos,
           total_centavos, payload_json
      FROM sale_items
     WHERE empresa_id = ? AND sale_id = ?
     ORDER BY item_id
  `).all(empresaId, saleId);

  return {
    empresaId: String(sale.empresa_id),
    saleId: String(sale.sale_id),
    operationId: String(sale.operation_id),
    clienteId:
      sale.cliente_id == null
        ? null
        : String(sale.cliente_id),
    status: String(sale.status),
    totalCentavos: Number(sale.total_centavos),
    occurredAt: String(sale.occurred_at),
    createdAt: String(sale.created_at),
    payload: parseJsonText(sale.payload_json),
    items: items.map((item) => ({
      itemId: String(item.item_id),
      produtoId: String(item.produto_id),
      quantidade:
        microunitsToDecimalString(
          Number(item.quantity_microunits)
        ),
      unitPriceCentavos:
        Number(item.unit_price_centavos),
      totalCentavos:
        Number(item.total_centavos),
      payload:
        parseJsonText(item.payload_json)
    }))
  };
}

function listOfflineSalesForFinance(
  db,
  input = {}
) {
  const database = requiredDatabase(db);
  const empresaId =
    requiredText(input.empresaId, 'empresaId');
  const offset = Math.max(
    0,
    Math.trunc(Number(input.offset || 0))
  );
  const requestedLimit =
    Math.trunc(Number(input.limit || 50));
  const limit = Math.min(
    100,
    Math.max(
      1,
      Number.isFinite(requestedLimit)
        ? requestedLimit
        : 50
    )
  );

  const totalRow = database.prepare(
    'SELECT COUNT(*) AS total FROM sales WHERE empresa_id = ?'
  ).get(empresaId);

  const rows = database.prepare(
    'SELECT sale_id, status, total_centavos, occurred_at, payload_json ' +
    'FROM sales WHERE empresa_id = ? ' +
    'ORDER BY occurred_at DESC, sale_id DESC LIMIT ? OFFSET ?'
  ).all(empresaId, limit, offset);

  const vendas = rows.map((row) => {
    let payload = {};

    try {
      payload = row.payload_json
        ? JSON.parse(String(row.payload_json))
        : {};
    } catch (_) {
      payload = {};
    }

    return {
      saleId: String(row.sale_id),
      saleNumber: text(payload.saleNumber),
      saleDate:
        text(
          payload.paidAt ||
          payload.saleDate
        ) ||
        String(row.occurred_at),
      status: String(row.status || ''),
      paymentStatus:
        text(payload.paymentStatus) ||
        'PAGO',
      paymentMethod:
        text(payload.paymentMethod),
      totalValue:
        Number(row.total_centavos || 0) / 100,
      operatorId:
        text(
          payload.operatorId ||
          payload.operadorId
        ),
      operadorNome:
        text(
          payload.operadorNome ||
          payload.nomeOperador ||
          payload.operatorName
        ),
      operadorPerfil:
        text(
          payload.operadorPerfil ||
          payload.perfilOperador
        ),
      caixaSessaoId:
        text(payload.caixaSessaoId),
      vendaInterna:
        payload.vendaInterna === true,
      origemVenda:
        text(payload.origemVenda),
      crediarioLiquidacao:
        payload.crediarioLiquidacao === true,
      offline: true
    };
  });

  const totalCount =
    Number(totalRow && totalRow.total || 0);
  const nextOffset =
    offset + vendas.length;

  return {
    success: true,
    empresaId,
    vendas,
    offset,
    limit,
    totalCount,
    nextOffset,
    hasMore: nextOffset < totalCount
  };
}

function createFinanceReadModel(db) {
  const database = requiredDatabase(db);

  return Object.freeze({
    listOfflineSalesForFinance(input = {}) {
      return listOfflineSalesForFinance(
        database,
        input
      );
    }
  });
}

function attachFinanceReadModel(db) {
  const database = requiredDatabase(db);
  const current =
    database[FINANCE_READ_MODEL_CONTEXT_PROPERTY];

  if (current) return current;

  const readModel =
    createFinanceReadModel(database);

  Object.defineProperty(
    database,
    FINANCE_READ_MODEL_CONTEXT_PROPERTY,
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
  FINANCE_READ_MODEL_CONTEXT_PROPERTY,
  attachFinanceReadModel,
  getSaleById,
  listFinancialMovements,
  listOfflineSalesForFinance
};
