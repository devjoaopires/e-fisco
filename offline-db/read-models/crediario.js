'use strict';

const crediarioRepository =
  require('../repositories/crediario');

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

function crediarioItemIsOpen(item) {
  if (!item || typeof item !== 'object') return false;
  const quantity = Number(item.quantity == null ? item.quantidade : item.quantity);
  return (
    item.pago !== true &&
    item.cancelado !== true &&
    item.cancelled !== true &&
    Number.isFinite(quantity) &&
    quantity > 0
  );
}

function normalizeCrediarioDetailItem(item, index = 0) {
  const source = item && typeof item === 'object' ? item : {};
  const quantity = Number(source.quantity == null ? source.quantidade : source.quantity);
  const unitValue = Number(source.unitValue == null ? source.valorUnitario : source.unitValue);
  const totalValue = Number(
    source.totalValue == null
      ? (source.total == null ? quantity * unitValue : source.total)
      : source.totalValue
  );

  return {
    crediarioItemId: optionalText(
      source.crediarioItemId || source.id || source._id || source.wixId
    ),
    id: optionalText(
      source.crediarioItemId || source.id || source._id || source.wixId
    ),
    itemNumber: Number(source.itemNumber || source.item_number || index + 1),
    produtoId: optionalText(
      source.produtoId || source.productFiscalId || source.productId
    ),
    productFiscalId: optionalText(
      source.produtoId || source.productFiscalId || source.productId
    ),
    productCode: optionalText(
      source.productCode || source.codigoProduto || source.codigo || source.barcode
    ),
    description: optionalText(
      source.description || source.descricao || source.name || source.nome
    ),
    name: optionalText(
      source.description || source.descricao || source.name || source.nome
    ),
    ncm: optionalText(source.ncm),
    cest: optionalText(source.cest),
    cfop: optionalText(source.cfop),
    unit: optionalText(source.unit || source.unidade) || 'UN',
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unitValue: Number.isFinite(unitValue) ? unitValue : 0,
    totalValue: Number.isFinite(totalValue) ? totalValue : 0,
    total: Number.isFinite(totalValue) ? totalValue : 0,
    taxCode: optionalText(source.taxCode),
    tributosReferenciaJson:
      source.tributosReferenciaJson == null
        ? ''
        : source.tributosReferenciaJson,
    cancelled: source.cancelled === true || source.cancelado === true,
    cancelado: source.cancelled === true || source.cancelado === true,
    canceladoEm: optionalText(source.canceladoEm),
    pago: source.pago === true,
    pagoEm: optionalText(source.pagoEm),
    formaPagamento: optionalText(source.formaPagamento),
    fiscalSaleId: optionalText(source.fiscalSaleId),
    fiscalStatus: optionalText(source.fiscalStatus),
    liquidacaoId: optionalText(source.liquidacaoId),
    sourceUpdatedAt: optionalText(source.sourceUpdatedAt)
  };
}

function listCrediariosCache(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const limit = normalizeLimit(input.limit, 500, 5000);
  const rows = db.prepare(`
    SELECT *
      FROM crediarios_cache
     WHERE empresa_id = ?
       AND pago = 0
       AND cancelado = 0
       AND COALESCE(saldo_receber_centavos, valor_centavos, 0) > 0
     ORDER BY cliente_nome COLLATE NOCASE, vencimento, conta_receber_id
     LIMIT ?
  `).all(empresaId, limit);
  return rows.map(crediarioRepository.mapCrediarioCacheRow);
}

function getCrediarioDetailCache(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const crediarioId = requiredText(
    input.crediarioId || input.contaReceberId,
    'crediarioId'
  );
  const conta = crediarioRepository.getCrediarioCacheById(db, empresaId, crediarioId);
  if (!conta) {
    throw new Error('Crediário não encontrado no cache offline.');
  }
  if (conta.pago === true || conta.cancelado === true) {
    throw new Error('O crediário não está aberto para operação offline.');
  }

  const payload =
    conta.payload && typeof conta.payload === 'object' && !Array.isArray(conta.payload)
      ? conta.payload
      : {};
  const rawItems = Array.isArray(payload.itens) ? payload.itens : [];
  const itens = rawItems
    .map(normalizeCrediarioDetailItem)
    .filter(crediarioItemIsOpen)
    .sort((a, b) => {
      const numberDiff = Number(a.itemNumber || 0) - Number(b.itemNumber || 0);
      if (numberDiff !== 0) return numberDiff;
      return String(a.crediarioItemId || '').localeCompare(String(b.crediarioItemId || ''));
    });

  return {
    conta: {
      ...conta,
      _id: conta.contaReceberId,
      saleId: conta.crediarioId,
      valor: conta.saldoReceber == null ? conta.valor : conta.saldoReceber
    },
    itens,
    offline: true
  };
}

function crediarioOutboxDependencies(db, empresaId, crediarioId) {
  const rows = db.prepare(`
    SELECT operation_id, status
      FROM sync_outbox
     WHERE empresa_id = ?
       AND entity_id = ?
       AND type IN ('CREDIARIO_OPEN', 'CREDIARIO_ITEMS_UPDATE')
       AND status <> 'CONFIRMED'
     ORDER BY created_at, operation_id
  `).all(empresaId, crediarioId);

  const blocked = rows.find((row) =>
    ['CONFLICT', 'MANUAL_REVIEW'].includes(String(row.status || '').toUpperCase())
  );
  if (blocked) {
    throw new Error(
      'O crediário possui uma atualização offline em conflito e precisa sincronizar antes de nova operação.'
    );
  }

  return rows
    .filter((row) =>
      ['PENDING', 'SENDING', 'RETRY'].includes(String(row.status || '').toUpperCase())
    )
    .map((row) => String(row.operation_id));
}

function getCrediarioPendingDependencies(db, empresaIdValue, crediarioIdValue) {
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const crediarioId = requiredText(crediarioIdValue, 'crediarioId');
  return crediarioOutboxDependencies(
    db,
    empresaId,
    crediarioId
  );
}

module.exports = {
  crediarioItemIsOpen,
  normalizeCrediarioDetailItem,
  listCrediariosCache,
  getCrediarioDetailCache,
  crediarioOutboxDependencies,
  getCrediarioPendingDependencies
};
