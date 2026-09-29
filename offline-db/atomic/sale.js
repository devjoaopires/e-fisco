'use strict';

const { createHash } = require('crypto');
const {
  beginImmediateTransaction
} = require('../transaction');
const productsRepository =
  require('../repositories/products');
const stockRepository =
  require('../repositories/stock');
const financeReadModel =
  require('../read-models/finance');
const fiscalReadModel =
  require('../read-models/fiscal');
const crediarioReadModel =
  require('../read-models/crediario');
const syncOutbox =
  require('../outbox/sync-outbox');

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

function normalizeSaleCashMovements(input, empresaId, saleId, occurredAt) {
  const rows = Array.isArray(input.cashMovements) ? input.cashMovements : [];
  return rows.map((movement, index) => ({
    movementId: requiredText(movement && movement.movementId, `cashMovements[${index}].movementId`),
    operationId: requiredText(movement && movement.operationId, `cashMovements[${index}].operationId`),
    sessionId: requiredText(movement && movement.sessionId, `cashMovements[${index}].sessionId`),
    direction: ledgerDirection(movement && movement.direction, `cashMovements[${index}].direction`),
    amountCentavos: positiveMoneyCents(movement && movement.amountCentavos, `cashMovements[${index}].amountCentavos`),
    movementType: requiredText(movement && movement.movementType, `cashMovements[${index}].movementType`),
    sourceId: optionalText(movement && movement.sourceId) || saleId,
    occurredAt: optionalText(movement && movement.occurredAt) || occurredAt,
    payload: movement && movement.payload
  }));
}

function normalizeSaleFinancialMovements(input, empresaId, saleId, occurredAt) {
  const rows = Array.isArray(input.financialMovements) ? input.financialMovements : [];
  return rows.map((movement, index) => ({
    movementId: requiredText(movement && movement.movementId, `financialMovements[${index}].movementId`),
    operationId: requiredText(movement && movement.operationId, `financialMovements[${index}].operationId`),
    accountId: optionalText(movement && movement.accountId),
    direction: ledgerDirection(movement && movement.direction, `financialMovements[${index}].direction`),
    amountCentavos: positiveMoneyCents(movement && movement.amountCentavos, `financialMovements[${index}].amountCentavos`),
    movementType: requiredText(movement && movement.movementType, `financialMovements[${index}].movementType`),
    sourceId: optionalText(movement && movement.sourceId) || saleId,
    occurredAt: optionalText(movement && movement.occurredAt) || occurredAt,
    payload: movement && movement.payload
  }));
}

function normalizeSalePaymentSnapshot(input = {}) {
  const payload = input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
    ? input.payload
    : {};
  const sourceParts = Array.isArray(input.paymentParts)
    ? input.paymentParts
    : (Array.isArray(payload.paymentParts) ? payload.paymentParts : []);
  const paymentParts = sourceParts
    .filter((part) => part && typeof part === 'object' && !Array.isArray(part))
    .map((part) => ({ ...part }));
  const methods = [];
  for (const part of paymentParts) {
    const method = optionalText(part.method || part.metodo || part.paymentMethod);
    if (method) {
      const normalized = method.toUpperCase();
      if (!methods.includes(normalized)) methods.push(normalized);
    }
  }

  const explicitMethod = optionalText(input.paymentMethod) || optionalText(payload.paymentMethod);
  const paymentMethod = explicitMethod ? explicitMethod.toUpperCase() : methods.join(' + ');

  let paymentTotalValue = input.paymentTotalValue != null
    ? Number(input.paymentTotalValue)
    : (payload.paymentTotalValue != null ? Number(payload.paymentTotalValue) : NaN);
  if (!Number.isFinite(paymentTotalValue)) {
    const sum = paymentParts.reduce((total, part) => {
      const amount = Number(part.amount != null ? part.amount : part.valor);
      return total + (Number.isFinite(amount) && amount > 0 ? amount : 0);
    }, 0);
    paymentTotalValue = Math.round((sum + Number.EPSILON) * 100) / 100;
  }

  const explicitSplit = typeof input.paymentSplit === 'boolean'
    ? input.paymentSplit
    : (typeof payload.paymentSplit === 'boolean' ? payload.paymentSplit : null);
  const paymentSplit = explicitSplit == null ? paymentParts.length > 1 : explicitSplit;

  return {
    paymentMethod: paymentMethod || '',
    paymentParts,
    paymentSplit,
    paymentPartsCount: paymentParts.length,
    paymentMethodsCount: methods.length,
    paymentTotalValue
  };
}

const NFCE_CUF_BY_UF = Object.freeze({
  AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53',
  ES: '32', GO: '52', MA: '21', MT: '51', MS: '50', MG: '31', PA: '15',
  PB: '25', PR: '41', PE: '26', PI: '22', RJ: '33', RN: '24', RS: '43',
  RO: '11', RR: '14', SC: '42', SP: '35', SE: '28', TO: '17'
});

function normalizeFiscalAllocationInput(value, saleId, operationId) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('fiscalAllocation deve ser um objeto quando informado.');
  }
  const leaseId = requiredText(value.leaseId, 'fiscalAllocation.leaseId');
  const deviceId = requiredText(value.deviceId, 'fiscalAllocation.deviceId');
  const fiscalId = optionalText(value.fiscalId) || `nfce:${saleId}`;
  const fiscalOperationId = optionalText(value.operationId) || `${operationId}:nfce`;
  const xJust = optionalText(value.xJust) ||
    'Emissão em contingência por indisponibilidade de conexão com a SEFAZ.';
  if (xJust.length < 15 || xJust.length > 256) {
    throw new Error('fiscalAllocation.xJust deve ter entre 15 e 256 caracteres.');
  }
  return { leaseId, deviceId, fiscalId, fiscalOperationId, xJust };
}

function fiscalAammFromDateTime(value) {
  const text = requiredText(value, 'dhEmi');
  const match = text.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[1].slice(-2)}${match[2]}`;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error('dhEmi inválido para a chave NFC-e.');
  return `${String(date.getUTCFullYear()).slice(-2)}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function nfceAccessKeyDv(base43) {
  const digits = String(base43 || '');
  if (!/^\d{43}$/.test(digits)) {
    throw new Error('Base da chave NFC-e deve conter 43 dígitos nesta etapa.');
  }
  let weight = 2;
  let sum = 0;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += Number(digits[index]) * weight;
    weight += 1;
    if (weight > 9) weight = 2;
  }
  const remainder = sum % 11;
  const candidate = 11 - remainder;
  return String(candidate === 10 || candidate === 11 ? 0 : candidate);
}

function deterministicFiscalCnf(input) {
  const source = [
    input.empresaId,
    input.saleId,
    input.operationId,
    input.leaseId,
    String(input.numero)
  ].join('|');
  const digest = createHash('sha256').update(source, 'utf8').digest();
  const value = digest.readUInt32BE(0) % 100000000;
  return String(value).padStart(8, '0');
}

function buildNfceAccessKey(input) {
  const uf = requiredText(input.uf, 'uf').toUpperCase();
  const cuf = NFCE_CUF_BY_UF[uf];
  if (!cuf) throw new Error(`UF sem cUF configurado para NFC-e: ${uf}.`);
  const cnpj = requiredText(input.cnpj, 'cnpj').replace(/\D/g, '');
  if (!/^\d{14}$/.test(cnpj)) {
    throw new Error('CNPJ alfanumérico ainda não é suportado pelo gerador local desta etapa.');
  }
  const modelo = Number(input.modelo);
  if (modelo !== 65) throw new Error('modelo NFC-e deve ser 65.');
  const serieNumber = Number(input.serie);
  if (!Number.isSafeInteger(serieNumber) || serieNumber < 0 || serieNumber > 889) {
    throw new Error('Série NFC-e inválida para composição da chave.');
  }
  const numero = Number(input.numero);
  if (!Number.isSafeInteger(numero) || numero < 1 || numero > 999999999) {
    throw new Error('Número NFC-e inválido para composição da chave.');
  }
  const tpEmis = Number(input.tpEmis);
  if (tpEmis !== 9) throw new Error('tpEmis deve ser 9 nesta etapa.');
  const cnf = requiredText(input.cnf, 'cNF');
  if (!/^\d{8}$/.test(cnf)) throw new Error('cNF deve conter 8 dígitos.');
  const base43 = [
    cuf,
    fiscalAammFromDateTime(input.dhEmi),
    cnpj,
    String(modelo).padStart(2, '0'),
    String(serieNumber).padStart(3, '0'),
    String(numero).padStart(9, '0'),
    String(tpEmis),
    cnf
  ].join('');
  const cdv = nfceAccessKeyDv(base43);
  return { chaveAcesso: `${base43}${cdv}`, cdv, cuf };
}

function applyCrediarioSettlementInTransaction(
  db,
  empresaId,
  settlement,
  paymentSnapshot,
  totalCentavos,
  saleId,
  occurredAt
) {
  if (!settlement || typeof settlement !== 'object') return null;

  const crediarioId = requiredText(settlement.crediarioId, 'crediarioSettlement.crediarioId');
  const baseSituacaoVersao = Number(settlement.baseSituacaoVersao);
  if (!Number.isSafeInteger(baseSituacaoVersao) || baseSituacaoVersao < 0) {
    throw new Error('Versão base do crediário é inválida.');
  }

  const itemIds = [...new Set(
    (Array.isArray(settlement.itemIds) ? settlement.itemIds : [])
      .map((value) => optionalText(value))
      .filter(Boolean)
  )];
  if (!itemIds.length) {
    throw new Error('A liquidação do crediário não possui itens selecionados.');
  }

  const row = db.prepare(`
    SELECT *
      FROM crediarios_cache
     WHERE empresa_id = ?
       AND crediario_id = ?
     LIMIT 1
  `).get(empresaId, crediarioId);

  if (!row) throw new Error('Crediário não encontrado no cache local para liquidação.');
  if (Number(row.pago) === 1 || Number(row.cancelado) === 1) {
    throw new Error('O crediário não está aberto para liquidação.');
  }
  if (Number(row.situacao_versao || 0) !== baseSituacaoVersao) {
    throw new Error(
      'O crediário mudou desde a abertura do detalhe. Reabra a conta antes de pagar.'
    );
  }

  const payload = parseJsonText(row.payload_json) || {};
  const items = (Array.isArray(payload.itens) ? payload.itens : [])
    .map(crediarioReadModel.normalizeCrediarioDetailItem);
  const openById = new Map(
    items
      .filter(crediarioReadModel.crediarioItemIsOpen)
      .map((item) => [String(item.crediarioItemId), item])
  );

  const selected = itemIds.map((itemId) => {
    const item = openById.get(itemId);
    if (!item) {
      throw new Error('Um item selecionado para pagamento não está mais aberto no crediário.');
    }
    return item;
  });

  const selectedTotalCentavos = selected.reduce(
    (sum, item) => sum + decimalMoneyToCents(item.totalValue, 'total do item do crediário'),
    0
  );
  if (selectedTotalCentavos !== totalCentavos) {
    throw new Error(
      'O valor do pagamento não corresponde aos itens selecionados do crediário.'
    );
  }

  const paymentMethod = optionalText(paymentSnapshot.paymentMethod);
  const selectedIds = new Set(itemIds);
  const updatedItems = items.map((item) => {
    if (!selectedIds.has(String(item.crediarioItemId || ''))) return item;
    return {
      ...item,
      pago: true,
      pagoEm: occurredAt,
      formaPagamento: paymentMethod,
      fiscalSaleId: saleId,
      fiscalStatus: 'CONTINGENCIA_PENDENTE',
      liquidacaoId: saleId,
      sourceUpdatedAt: occurredAt
    };
  });

  const remainingOpen = updatedItems.filter(crediarioReadModel.crediarioItemIsOpen);
  const saldoReceberCentavos = remainingOpen.reduce(
    (sum, item) => sum + decimalMoneyToCents(item.totalValue, 'saldo do crediário'),
    0
  );
  const valorRecebidoAnterior = Number(row.valor_recebido_centavos || 0);
  const valorRecebidoCentavos = valorRecebidoAnterior + totalCentavos;
  const valorOriginalCentavos = valorRecebidoCentavos + saldoReceberCentavos;
  const pago = saldoReceberCentavos === 0;
  const novaSituacaoVersao = baseSituacaoVersao + 1;

  const updatedPayload = {
    ...payload,
    valor: saldoReceberCentavos / 100,
    valorOriginal: valorOriginalCentavos / 100,
    valorRecebido: valorRecebidoCentavos / 100,
    saldoReceber: saldoReceberCentavos / 100,
    status: pago ? 'RECEBIDO' : 'A_RECEBER',
    pago,
    pagoEm: pago ? occurredAt : null,
    formaPagamento: paymentMethod,
    situacaoVersao: novaSituacaoVersao,
    itens: updatedItems
  };

  const result = db.prepare(`
    UPDATE crediarios_cache
       SET valor_centavos = ?,
           valor_original_centavos = ?,
           valor_recebido_centavos = ?,
           saldo_receber_centavos = ?,
           status = ?,
           pago = ?,
           pago_em = ?,
           forma_pagamento = ?,
           situacao_versao = ?,
           cached_at = ?,
           payload_json = ?
     WHERE empresa_id = ?
       AND crediario_id = ?
       AND situacao_versao = ?
       AND pago = 0
       AND cancelado = 0
  `).run(
    saldoReceberCentavos,
    valorOriginalCentavos,
    valorRecebidoCentavos,
    saldoReceberCentavos,
    pago ? 'RECEBIDO' : 'A_RECEBER',
    pago ? 1 : 0,
    pago ? occurredAt : null,
    paymentMethod,
    novaSituacaoVersao,
    occurredAt,
    jsonText(updatedPayload),
    empresaId,
    crediarioId,
    baseSituacaoVersao
  );

  if (Number(result.changes || 0) !== 1) {
    throw new Error('O crediário mudou durante a liquidação local; operação cancelada.');
  }

  return {
    crediarioId,
    itemIds,
    baseSituacaoVersao,
    novaSituacaoVersao,
    valorPagoCentavos: totalCentavos,
    valorRecebidoCentavos,
    saldoReceberCentavos,
    pago
  };
}

function assertNormalSaleStockAvailableInTransaction(
  db,
  empresaId,
  normalizedItems
) {
  const requestedByProduct = new Map();

  for (const item of normalizedItems) {
    const produtoId = String(item.produtoId);
    const requested =
      Number(requestedByProduct.get(produtoId) || 0) +
      Number(item.quantityMicrounits || 0);

    if (!Number.isSafeInteger(requested) || requested <= 0) {
      throw new Error(
        'Quantidade agregada inválida para revalidação de estoque da venda.'
      );
    }

    requestedByProduct.set(produtoId, requested);
  }

  const pendingDeltaMap = new Map(
    stockRepository.listPendingStockDeltasByProduct(db, empresaId)
      .map((item) => [
        String(item.produtoId),
        Number(item.deltaMicrounits || 0)
      ])
  );

  for (const [produtoId, requestedMicros] of requestedByProduct) {
    const cachedProduct = productsRepository.getProductCacheById(
      db,
      empresaId,
      produtoId
    );

    if (!cachedProduct || cachedProduct.ativo !== true) {
      throw new Error(
        'Produto da venda não está ativo no cache offline autenticado.'
      );
    }

    const productPayload =
      cachedProduct.payload &&
      typeof cachedProduct.payload === 'object' &&
      !Array.isArray(cachedProduct.payload)
        ? cachedProduct.payload
        : {};

    const baseQuantity = Number(
      productPayload.quantidadeEstoque || 0
    );
    const baseMicros = Number.isFinite(baseQuantity)
      ? Math.round(
          Math.max(0, baseQuantity) *
          stockRepository.STOCK_QUANTITY_SCALE
        )
      : 0;

    if (!Number.isSafeInteger(baseMicros)) {
      throw new Error(
        'Estoque base do produto excede o limite seguro para a venda.'
      );
    }

    const pendingDeltaMicros = Number(
      pendingDeltaMap.get(produtoId) || 0
    );
    const availableMicros = Math.max(
      0,
      baseMicros + (
        Number.isSafeInteger(pendingDeltaMicros)
          ? pendingDeltaMicros
          : 0
      )
    );

    if (requestedMicros > availableMicros) {
      throw new Error(
        'Estoque insuficiente para vender ' +
        (cachedProduct.descricao || produtoId) +
        '.'
      );
    }
  }
}

function registerOfflineSaleAtomic(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const saleId = requiredText(input.saleId, 'saleId');
  const operationId = requiredText(input.operationId, 'operationId');
  const dependencies =
    syncOutbox.normalizeOutboxDependencies(
      input.dependencies,
      operationId
    );
  const clienteId = optionalText(input.clienteId);
  const status = optionalText(input.status) || 'PAID';
  const occurredAt = optionalText(input.occurredAt) || nowIso();
  const createdAt = nowIso();
  const items = Array.isArray(input.items) ? input.items : [];
  const cashMovements = normalizeSaleCashMovements(input, empresaId, saleId, occurredAt);
  const financialMovements = normalizeSaleFinancialMovements(input, empresaId, saleId, occurredAt);
  const paymentSnapshot = normalizeSalePaymentSnapshot(input);
  const salePayloadBase = input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
    ? input.payload
    : {};
  const salePayload = {
    ...salePayloadBase,
    ...paymentSnapshot
  };
  const fiscalAllocation = normalizeFiscalAllocationInput(
    input.fiscalAllocation,
    saleId,
    operationId
  );
  const crediarioSettlement =
    input.crediarioSettlement &&
    typeof input.crediarioSettlement === 'object' &&
    !Array.isArray(input.crediarioSettlement)
      ? { ...input.crediarioSettlement }
      : null;
  const skipStockMovements =
    input.skipStockMovements === true ||
    Boolean(crediarioSettlement);

  if (!items.length) {
    throw new Error('A venda offline precisa ter pelo menos um item.');
  }

  const normalizedItems = items.map((item, index) => {
    const itemId = requiredText(item && item.itemId, `items[${index}].itemId`);
    const produtoId = requiredText(item && item.produtoId, `items[${index}].produtoId`);
    const quantityMicrounits = stockRepository.decimalToMicrounits(item && item.quantidade, `items[${index}].quantidade`);
    const unitPriceCentavos = moneyCents(item && item.unitPriceCentavos, `items[${index}].unitPriceCentavos`);
    const totalCentavos = item && item.totalCentavos != null
      ? moneyCents(item.totalCentavos, `items[${index}].totalCentavos`)
      : Number((BigInt(quantityMicrounits) * BigInt(unitPriceCentavos)) / BigInt(stockRepository.STOCK_QUANTITY_SCALE));
    return {
      itemId,
      produtoId,
      quantityMicrounits,
      unitPriceCentavos,
      totalCentavos,
      payload: item && item.payload
    };
  });

  const duplicateItemIds = new Set();
  for (const item of normalizedItems) {
    if (duplicateItemIds.has(item.itemId)) {
      throw new Error(`itemId duplicado na venda: ${item.itemId}`);
    }
    duplicateItemIds.add(item.itemId);
  }

  const calculatedTotal = normalizedItems.reduce((sum, item) => sum + item.totalCentavos, 0);
  if (!Number.isSafeInteger(calculatedTotal)) {
    throw new Error('Total da venda excede o limite de inteiro seguro.');
  }
  const totalCentavos = input.totalCentavos == null
    ? calculatedTotal
    : moneyCents(input.totalCentavos, 'totalCentavos');
  if (totalCentavos !== calculatedTotal) {
    throw new Error(`totalCentavos (${totalCentavos}) difere da soma dos itens (${calculatedTotal}).`);
  }

  const existingBySale = db.prepare(`
    SELECT sale_id, operation_id FROM sales
     WHERE empresa_id = ? AND sale_id = ?
  `).get(empresaId, saleId);
  if (existingBySale) {
    if (String(existingBySale.operation_id) !== operationId) {
      throw new Error(`saleId ${saleId} já existe com outro operationId.`);
    }
    const existingFiscal = fiscalReadModel.getNfceDocumentBySaleId(db, empresaId, saleId);
    if (fiscalAllocation && !existingFiscal) {
      throw new Error('Venda já existe sem alocação fiscal atômica; revisão manual necessária.');
    }
    return { applied: false, duplicate: true, sale: financeReadModel.getSaleById(db, empresaId, saleId), fiscal: existingFiscal };
  }

  const existingByOperation = db.prepare(`
    SELECT sale_id FROM sales
     WHERE empresa_id = ? AND operation_id = ?
  `).get(empresaId, operationId);
  if (existingByOperation) {
    if (String(existingByOperation.sale_id) !== saleId) {
      throw new Error(`operationId ${operationId} já pertence à venda ${existingByOperation.sale_id}.`);
    }
    const existingFiscal = fiscalReadModel.getNfceDocumentBySaleId(db, empresaId, saleId);
    if (fiscalAllocation && !existingFiscal) {
      throw new Error('Venda já existe sem alocação fiscal atômica; revisão manual necessária.');
    }
    return { applied: false, duplicate: true, sale: financeReadModel.getSaleById(db, empresaId, saleId), fiscal: existingFiscal };
  }

  let crediarioSettlementResult = null;

  const transaction = beginImmediateTransaction(db);
  try {
    if (!skipStockMovements) {
      assertNormalSaleStockAvailableInTransaction(
        db,
        empresaId,
        normalizedItems
      );
    }

    db.prepare(`
      INSERT INTO sales (
        empresa_id, sale_id, operation_id, cliente_id, status,
        total_centavos, occurred_at, created_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      empresaId,
      saleId,
      operationId,
      clienteId,
      status,
      totalCentavos,
      occurredAt,
      createdAt,
      jsonText(salePayload)
    );

    let allocatedFiscal = null;
    if (fiscalAllocation) {
      const lease = db.prepare(`
        SELECT * FROM fiscal_number_leases
         WHERE empresa_id = ? AND lease_id = ?
         LIMIT 1
      `).get(empresaId, fiscalAllocation.leaseId);
      if (!lease) throw new Error('Contador fiscal local não encontrado para a venda.');
      if (String(lease.device_id) !== fiscalAllocation.deviceId) {
        throw new Error('Contador fiscal local pertence a outro dispositivo.');
      }
      const leaseAmbiente = normalizeFiscalEnvironment(lease.ambiente);
      if (
        String(lease.status) !== 'ACTIVE' ||
        !leaseAmbiente ||
        Number(lease.modelo) !== 65
      ) {
        throw new Error('Contador fiscal local não está ativo para NFC-e no ambiente informado.');
      }
      if (
        lease.expira_em &&
        !Number.isNaN(Date.parse(String(lease.expira_em))) &&
        Date.parse(String(lease.expira_em)) <= Date.now()
      ) {
        throw new Error('Contador fiscal local está expirado.');
      }

      const numero = Number(lease.proximo_numero);
      const numeroFinal = Number(lease.numero_final);
      if (!Number.isSafeInteger(numero) || numero < 1 || numero > numeroFinal) {
        throw new Error('Contador fiscal local sem numeração disponível.');
      }

      const profile = db.prepare(`
        SELECT * FROM fiscal_profile_cache
         WHERE empresa_id = ?
         LIMIT 1
      `).get(empresaId);
      if (!profile) throw new Error('Perfil fiscal não encontrado para alocação NFC-e.');
      const profileAmbiente = normalizeFiscalEnvironment(profile.ambiente);
      if (!profileAmbiente || profileAmbiente !== leaseAmbiente) {
        throw new Error('Ambiente do perfil fiscal diverge do contador local.');
      }
      if (String(profile.serie_nfce) !== String(lease.serie)) {
        throw new Error('Série do perfil fiscal diverge do contador local.');
      }

      const dhEmi = occurredAt;
      const dhCont = occurredAt;
      const cnf = deterministicFiscalCnf({
        empresaId,
        saleId,
        operationId,
        leaseId: fiscalAllocation.leaseId,
        numero
      });
      const key = buildNfceAccessKey({
        uf: profile.uf,
        cnpj: profile.cnpj,
        dhEmi,
        modelo: 65,
        serie: lease.serie,
        numero,
        tpEmis: 9,
        cnf
      });

      const customerSnapshot = clienteId
        ? db.prepare(`
            SELECT cliente_id, nome, documento, telefone, email,
                   revision, source_updated_at, payload_json
              FROM customers_cache
             WHERE empresa_id = ? AND cliente_id = ?
             LIMIT 1
          `).get(empresaId, clienteId)
        : null;

      const fiscalSnapshot = {
        schemaVersion: 1,
        sale: {
          saleId,
          operationId,
          clienteId,
          status,
          totalCentavos,
          occurredAt,
          payload: salePayload
        },
        issuer: {
          cnpj: String(profile.cnpj),
          inscricaoEstadual: String(profile.inscricao_estadual),
          razaoSocial: String(profile.razao_social),
          nomeFantasia: profile.nome_fantasia == null ? null : String(profile.nome_fantasia),
          cep: profile.cep == null ? null : String(profile.cep),
          logradouro: String(profile.logradouro),
          numero: String(profile.numero),
          complemento: profile.complemento == null ? null : String(profile.complemento),
          bairro: String(profile.bairro),
          municipio: String(profile.municipio),
          codigoMunicipio: String(profile.codigo_municipio),
          uf: String(profile.uf),
          crt: String(profile.crt),
          regimeTributario: profile.regime_tributario == null ? null : String(profile.regime_tributario),
          urlQrCode: String(profile.url_qr_code),
          urlConsultaChave: String(profile.url_consulta_chave),
          revision: String(profile.revision)
        },
        customer: customerSnapshot
          ? {
              clienteId: String(customerSnapshot.cliente_id),
              nome: String(customerSnapshot.nome),
              documento: customerSnapshot.documento == null ? null : String(customerSnapshot.documento),
              telefone: customerSnapshot.telefone == null ? null : String(customerSnapshot.telefone),
              email: customerSnapshot.email == null ? null : String(customerSnapshot.email),
              revision: customerSnapshot.revision == null ? null : String(customerSnapshot.revision),
              sourceUpdatedAt: customerSnapshot.source_updated_at == null ? null : String(customerSnapshot.source_updated_at),
              payload: parseJsonText(customerSnapshot.payload_json)
            }
          : null,
        items: normalizedItems.map((item) => ({
          itemId: item.itemId,
          produtoId: item.produtoId,
          quantidade: stockRepository.microunitsToDecimalString(item.quantityMicrounits),
          unitPriceCentavos: item.unitPriceCentavos,
          totalCentavos: item.totalCentavos,
          payload: item.payload == null ? {} : item.payload
        })),
        payment: paymentSnapshot,
        fiscalIdentity: {
          ambiente: leaseAmbiente,
          modelo: 65,
          serie: String(lease.serie),
          numero,
          cnf,
          cdv: key.cdv,
          chaveAcesso: key.chaveAcesso,
          tpEmis: 9,
          dhEmi,
          dhCont,
          xJust: fiscalAllocation.xJust
        }
      };

      db.prepare(`
        INSERT INTO nfce_documents (
          empresa_id, fiscal_id, sale_id, operation_id, lease_id,
          ambiente, modelo, serie, numero, cnf, cdv, chave_acesso,
          tp_emis, dh_emi, dh_cont, x_just, profile_revision,
          input_snapshot_json, state, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 65, ?, ?, ?, ?, ?, 9, ?, ?, ?, ?, ?, 'ALLOCATED', ?, ?)
      `).run(
        empresaId,
        fiscalAllocation.fiscalId,
        saleId,
        fiscalAllocation.fiscalOperationId,
        fiscalAllocation.leaseId,
        leaseAmbiente,
        String(lease.serie),
        numero,
        cnf,
        key.cdv,
        key.chaveAcesso,
        dhEmi,
        dhCont,
        fiscalAllocation.xJust,
        String(profile.revision),
        JSON.stringify(fiscalSnapshot),
        createdAt,
        createdAt
      );

      const nextNumber = numero + 1;
      const nextStatus = nextNumber > numeroFinal ? 'EXHAUSTED' : 'ACTIVE';
      const consumed = db.prepare(`
        UPDATE fiscal_number_leases
           SET proximo_numero = ?, status = ?, updated_at = ?
         WHERE empresa_id = ?
           AND lease_id = ?
           AND status = 'ACTIVE'
           AND proximo_numero = ?
      `).run(
        nextNumber,
        nextStatus,
        createdAt,
        empresaId,
        fiscalAllocation.leaseId,
        numero
      );
      if (Number(consumed.changes || 0) !== 1) {
        throw new Error('Contador fiscal mudou durante a criação do documento; operação cancelada.');
      }

      allocatedFiscal = {
        fiscalId: fiscalAllocation.fiscalId,
        state: 'ALLOCATED',
        leaseId: fiscalAllocation.leaseId,
        ambiente: leaseAmbiente,
        modelo: 65,
        serie: String(lease.serie),
        numero,
        cnf,
        cdv: key.cdv,
        chaveAcesso: key.chaveAcesso,
        dhEmi,
        dhCont
      };
    }

    for (const item of normalizedItems) {
      db.prepare(`
        INSERT INTO sale_items (
          empresa_id, sale_id, item_id, produto_id, quantity_microunits,
          unit_price_centavos, total_centavos, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        empresaId,
        saleId,
        item.itemId,
        item.produtoId,
        item.quantityMicrounits,
        item.unitPriceCentavos,
        item.totalCentavos,
        jsonText(item.payload)
      );

      if (!skipStockMovements) {
        const stockOperationId = `${operationId}:stock:${item.itemId}`;
        const stockMovementId = `${saleId}:stock:${item.itemId}`;
        db.prepare(`
          INSERT INTO stock_movements (
            empresa_id, movement_id, operation_id, produto_id, direction,
            quantity_microunits, movement_type, source_id, occurred_at,
            created_at, payload_json
          ) VALUES (?, ?, ?, ?, -1, ?, 'VENDA_OFFLINE', ?, ?, ?, ?)
        `).run(
          empresaId,
          stockMovementId,
          stockOperationId,
          item.produtoId,
          item.quantityMicrounits,
          saleId,
          occurredAt,
          createdAt,
          jsonText({ saleId, itemId: item.itemId })
        );

        db.prepare(`
          INSERT INTO stock_projection (
            empresa_id, produto_id, quantity_microunits, updated_at
          ) VALUES (?, ?, ?, ?)
          ON CONFLICT(empresa_id, produto_id) DO UPDATE SET
            quantity_microunits = stock_projection.quantity_microunits + excluded.quantity_microunits,
            updated_at = excluded.updated_at
        `).run(empresaId, item.produtoId, -item.quantityMicrounits, createdAt);
      }
    }


    for (const movement of cashMovements) {
      const cashSession = db.prepare(`
        SELECT status FROM cash_sessions
         WHERE empresa_id = ? AND session_id = ?
      `).get(empresaId, movement.sessionId);
      if (!cashSession || String(cashSession.status) !== 'OPEN') {
        throw new Error(`Caixa ${movement.sessionId} não está aberto para a empresa.`);
      }

      db.prepare(`
        INSERT INTO cash_movements (
          empresa_id, movement_id, operation_id, session_id, direction,
          amount_centavos, movement_type, source_id, occurred_at, created_at, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        empresaId,
        movement.movementId,
        movement.operationId,
        movement.sessionId,
        movement.direction,
        movement.amountCentavos,
        movement.movementType,
        movement.sourceId,
        movement.occurredAt,
        createdAt,
        jsonText(movement.payload)
      );
    }

    for (const movement of financialMovements) {
      db.prepare(`
        INSERT INTO financial_movements (
          empresa_id, movement_id, operation_id, account_id, direction,
          amount_centavos, movement_type, source_id, occurred_at, created_at, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        empresaId,
        movement.movementId,
        movement.operationId,
        movement.accountId,
        movement.direction,
        movement.amountCentavos,
        movement.movementType,
        movement.sourceId,
        movement.occurredAt,
        createdAt,
        jsonText(movement.payload)
      );
    }

    if (crediarioSettlement) {
      crediarioSettlementResult = applyCrediarioSettlementInTransaction(
        db,
        empresaId,
        crediarioSettlement,
        paymentSnapshot,
        totalCentavos,
        saleId,
        occurredAt
      );
    }

    const outboxPayload = {
      saleId,
      clienteId,
      status,
      totalCentavos,
      occurredAt,
      paymentMethod: paymentSnapshot.paymentMethod,
      paymentParts: paymentSnapshot.paymentParts,
      paymentSplit: paymentSnapshot.paymentSplit,
      paymentPartsCount: paymentSnapshot.paymentPartsCount,
      paymentMethodsCount: paymentSnapshot.paymentMethodsCount,
      paymentTotalValue: paymentSnapshot.paymentTotalValue,
      skipStockMovements,
      crediarioSettlement:
        crediarioSettlementResult == null
          ? null
          : { ...crediarioSettlementResult },
      items: normalizedItems.map((item) => ({
        itemId: item.itemId,
        produtoId: item.produtoId,
        quantidade: stockRepository.microunitsToDecimalString(item.quantityMicrounits),
        unitPriceCentavos: item.unitPriceCentavos,
        totalCentavos: item.totalCentavos,
        payload: item.payload == null ? {} : item.payload
      })),
      cashMovements: cashMovements.map((movement) => ({
        movementId: movement.movementId,
        operationId: movement.operationId,
        sessionId: movement.sessionId,
        direction: movement.direction,
        amountCentavos: movement.amountCentavos,
        movementType: movement.movementType,
        sourceId: movement.sourceId,
        occurredAt: movement.occurredAt,
        payload: movement.payload == null ? {} : movement.payload
      })),
      /*
       * VENDA_PAGA permanece no livro financeiro LOCAL para compor os
       * totais do caixa, mas não deve ser enviada ao extrato financeiro
       * remoto no SALE_PAID. O servidor recebe somente movimentos que
       * realmente pertencem ao FINANCEIRO (ex.: CREDIARIO_RECEBIMENTO).
       */
      financialMovements:
        financialMovements
          .filter(
            (movement) =>
              String(
                movement &&
                movement.movementType ||
                ''
              )
                .trim()
                .toUpperCase() !==
                  'VENDA_PAGA'
          )
          .map((movement) => ({
            movementId: movement.movementId,
            operationId: movement.operationId,
            accountId: movement.accountId,
            direction: movement.direction,
            amountCentavos: movement.amountCentavos,
            movementType: movement.movementType,
            sourceId: movement.sourceId,
            occurredAt: movement.occurredAt,
            payload: movement.payload == null ? {} : movement.payload
          })),
      payload: salePayload
    };

    db.prepare(`
      INSERT INTO sync_outbox (
        empresa_id, operation_id, type, entity_id, payload_json, status,
        attempts, dependencies_json, created_at, updated_at, last_error
      ) VALUES (?, ?, 'SALE_PAID', ?, ?, 'PENDING', 0, ?, ?, ?, NULL)
    `).run(
      empresaId,
      operationId,
      saleId,
      JSON.stringify(outboxPayload),
      JSON.stringify(dependencies),
      createdAt,
      createdAt
    );

    transaction.commit();
  } catch (error) {
    transaction.rollback();
    throw error;
  }

  return {
    applied: true,
    duplicate: false,
    sale: financeReadModel.getSaleById(db, empresaId, saleId),
    outbox: syncOutbox.getOutboxOperation(db, empresaId, operationId),
    fiscal: fiscalReadModel.getNfceDocumentBySaleId(db, empresaId, saleId),
    crediarioSettlement: crediarioSettlementResult
  };
}

module.exports = {
  registerOfflineSaleAtomic
};
