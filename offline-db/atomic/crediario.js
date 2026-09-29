'use strict';

const { randomUUID } = require('crypto');
const {
  beginImmediateTransaction
} = require('../transaction');
const productsRepository =
  require('../repositories/products');
const customersRepository =
  require('../repositories/customers');
const stockRepository =
  require('../repositories/stock');
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

function moneyCents(value, fieldName) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${fieldName} deve ser um inteiro seguro maior ou igual a zero.`);
  }
  return number;
}

function roundedCrediarioLineTotalCentavos(quantityMicrounits, unitPriceCentavos) {
  const numerator = BigInt(quantityMicrounits) * BigInt(unitPriceCentavos);
  const scale = BigInt(stockRepository.STOCK_QUANTITY_SCALE);
  const rounded = (numerator + (scale / 2n)) / scale;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Total do item do crediário excede o limite monetário seguro.');
  }
  return Number(rounded);
}

function openCrediarioOfflineAtomic(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const crediarioId = requiredText(input.crediarioId, 'crediarioId');
  const contaReceberId = optionalText(input.contaReceberId) || crediarioId;
  const operationId = requiredText(input.operationId, 'operationId');
  const clienteId = requiredText(input.clienteId, 'clienteId');
  const clienteNome = requiredText(input.clienteNome, 'clienteNome');
  const cpf = optionalText(input.cpf);
  const whatsapp = optionalText(input.whatsapp);
  const vencimento = requiredText(input.vencimento, 'vencimento');
  const occurredAt = optionalText(input.occurredAt) || nowIso();
  const createdAt = nowIso();
  const items = Array.isArray(input.items) ? input.items : [];

  if (!items.length) {
    throw new Error('O crediário offline precisa ter pelo menos um item.');
  }

  const existingOperation = db.prepare(`
    SELECT type, entity_id
      FROM sync_outbox
     WHERE empresa_id = ?
       AND operation_id = ?
     LIMIT 1
  `).get(empresaId, operationId);

  if (existingOperation) {
    if (
      String(existingOperation.type) !== 'CREDIARIO_OPEN' ||
      String(existingOperation.entity_id) !== crediarioId
    ) {
      throw new Error('operationId do crediário já foi usado por outra operação.');
    }

    return {
      applied: false,
      duplicate: true,
      operation: syncOutbox.getOutboxOperation(db, empresaId, operationId),
      detalhe: crediarioReadModel.getCrediarioDetailCache(db, { empresaId, crediarioId })
    };
  }

  const existingAccount = db.prepare(`
    SELECT conta_receber_id
      FROM crediarios_cache
     WHERE empresa_id = ?
       AND crediario_id = ?
     LIMIT 1
  `).get(empresaId, crediarioId);

  if (existingAccount) {
    throw new Error('O crediário já existe localmente com outra operação.');
  }

  const customer =
    customersRepository.getCustomerCacheById(
      db,
      empresaId,
      clienteId
    );

  if (!customer || customer.ativo !== true) {
    throw new Error('O cliente do crediário não está ativo no cache offline.');
  }

  const normalizedItems = items.map((item, index) => {
    const crediarioItemId = requiredText(
      item && (item.crediarioItemId || item.id),
      `items[${index}].crediarioItemId`
    );
    const produtoId = requiredText(
      item && (item.produtoId || item.productFiscalId),
      `items[${index}].produtoId`
    );
    const quantityMicrounits = stockRepository.decimalToMicrounits(
      item && item.quantity,
      `items[${index}].quantity`
    );
    const unitValueCentavos = decimalMoneyToCents(
      item && item.unitValue,
      `items[${index}].unitValue`
    );
    const totalValueCentavos = decimalMoneyToCents(
      item && item.totalValue,
      `items[${index}].totalValue`
    );
    const expected = roundedCrediarioLineTotalCentavos(
      quantityMicrounits,
      unitValueCentavos
    );

    if (unitValueCentavos <= 0 || totalValueCentavos <= 0) {
      throw new Error(`Item ${index + 1} do crediário possui valor inválido.`);
    }
    if (expected !== totalValueCentavos) {
      throw new Error(
        `Item ${index + 1} do crediário possui total divergente da quantidade × valor unitário.`
      );
    }

    return {
      crediarioItemId,
      itemNumber:
        Number.isSafeInteger(Number(item.itemNumber)) && Number(item.itemNumber) > 0
          ? Number(item.itemNumber)
          : index + 1,
      produtoId,
      productCode: optionalText(item.productCode),
      description: optionalText(item.description || item.name),
      ncm: optionalText(item.ncm),
      cest: optionalText(item.cest),
      cfop: optionalText(item.cfop),
      unit: optionalText(item.unit) || 'UN',
      quantityMicrounits,
      unitValueCentavos,
      totalValueCentavos,
      taxCode: optionalText(item.taxCode),
      tributosReferenciaJson:
        item && item.tributosReferenciaJson != null
          ? item.tributosReferenciaJson
          : null
    };
  });

  const ids = new Set();
  for (const item of normalizedItems) {
    if (ids.has(item.crediarioItemId)) {
      throw new Error('crediarioItemId duplicado na abertura do crediário.');
    }
    ids.add(item.crediarioItemId);
  }

  const calculatedTotal = normalizedItems.reduce(
    (sum, item) => sum + item.totalValueCentavos,
    0
  );
  const totalCentavos =
    input.totalCentavos == null
      ? calculatedTotal
      : moneyCents(input.totalCentavos, 'totalCentavos');

  if (totalCentavos !== calculatedTotal) {
    throw new Error('Total do crediário difere da soma dos itens.');
  }

  const serverItems = normalizedItems.map((item) => ({
    crediarioItemId: item.crediarioItemId,
    id: item.crediarioItemId,
    itemNumber: item.itemNumber,
    produtoId: item.produtoId,
    productFiscalId: item.produtoId,
    productCode: item.productCode,
    description: item.description,
    ncm: item.ncm,
    cest: item.cest,
    cfop: item.cfop,
    unit: item.unit,
    quantity: stockRepository.microunitsToDecimalString(item.quantityMicrounits),
    unitValue: item.unitValueCentavos / 100,
    totalValue: item.totalValueCentavos / 100,
    taxCode: item.taxCode,
    tributosReferenciaJson: item.tributosReferenciaJson,
    cancelled: false,
    cancelado: false,
    pago: false,
    formaPagamento: '',
    fiscalSaleId: '',
    fiscalStatus: 'NAO_EMITIDA',
    liquidacaoId: ''
  }));

  const accountPayload = {
    ...(input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
      ? input.payload
      : {}),
    crediarioId,
    clienteId,
    clienteNome,
    cpf,
    whatsapp,
    valor: totalCentavos / 100,
    valorOriginal: totalCentavos / 100,
    valorRecebido: 0,
    saldoReceber: totalCentavos / 100,
    vencimento,
    status: 'A_RECEBER',
    pago: false,
    cancelado: false,
    situacaoVersao: 0,
    abertoEm: occurredAt,
    offline: true,
    syncPendente: true,
    itens: serverItems
  };

  const outboxPayload = {
    crediarioId,
    contaReceberId,
    clienteId,
    clienteNome,
    cpf,
    whatsapp,
    valor: totalCentavos / 100,
    valorOriginal: totalCentavos / 100,
    valorRecebido: 0,
    saldoReceber: totalCentavos / 100,
    vencimento,
    status: 'A_RECEBER',
    situacaoVersao: 0,
    occurredAt,
    itens: serverItems
  };

  const transaction = beginImmediateTransaction(db);
  try {
    db.prepare(`
      INSERT INTO crediarios_cache (
        empresa_id, conta_receber_id, crediario_id, cliente_id, cliente_nome,
        cpf, whatsapp, valor_centavos, valor_original_centavos,
        valor_recebido_centavos, saldo_receber_centavos, vencimento, status,
        pago, pago_em, forma_pagamento, aberto_em, cancelado, cancelado_em,
        situacao_versao, revision, source_updated_at, snapshot_token,
        cached_at, payload_json
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        0, ?, ?, 'A_RECEBER',
        0, NULL, NULL, ?, 0, NULL,
        0, NULL, ?, ?,
        ?, ?
      )
    `).run(
      empresaId,
      contaReceberId,
      crediarioId,
      clienteId,
      clienteNome,
      cpf,
      whatsapp,
      totalCentavos,
      totalCentavos,
      totalCentavos,
      vencimento,
      occurredAt,
      occurredAt,
      `local:${operationId}`,
      createdAt,
      JSON.stringify(accountPayload)
    );

    for (const item of normalizedItems) {
      const stockOperationId =
        `${operationId}:stock:${item.crediarioItemId}`;
      const stockMovementId =
        `${crediarioId}:open-stock:${item.crediarioItemId}`;

      db.prepare(`
        INSERT INTO stock_movements (
          empresa_id, movement_id, operation_id, produto_id, direction,
          quantity_microunits, movement_type, source_id, occurred_at,
          created_at, payload_json
        ) VALUES (?, ?, ?, ?, -1, ?, 'CREDIARIO_ABERTURA_OFFLINE', ?, ?, ?, ?)
      `).run(
        empresaId,
        stockMovementId,
        stockOperationId,
        item.produtoId,
        item.quantityMicrounits,
        crediarioId,
        occurredAt,
        createdAt,
        JSON.stringify({
          crediarioId,
          crediarioItemId: item.crediarioItemId
        })
      );

      db.prepare(`
        INSERT INTO stock_projection (
          empresa_id, produto_id, quantity_microunits, updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(empresa_id, produto_id) DO UPDATE SET
          quantity_microunits =
            stock_projection.quantity_microunits + excluded.quantity_microunits,
          updated_at = excluded.updated_at
      `).run(
        empresaId,
        item.produtoId,
        -item.quantityMicrounits,
        createdAt
      );
    }

    db.prepare(`
      INSERT INTO sync_outbox (
        empresa_id, operation_id, type, entity_id, payload_json, status,
        attempts, dependencies_json, created_at, updated_at, last_error
      ) VALUES (?, ?, 'CREDIARIO_OPEN', ?, ?, 'PENDING', 0, '[]', ?, ?, NULL)
    `).run(
      empresaId,
      operationId,
      crediarioId,
      JSON.stringify(outboxPayload),
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
    operation: syncOutbox.getOutboxOperation(db, empresaId, operationId),
    detalhe: crediarioReadModel.getCrediarioDetailCache(db, { empresaId, crediarioId })
  };
}

function updateCrediarioItemsOfflineAtomic(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const crediarioId = requiredText(input.crediarioId, 'crediarioId');
  const operationId = optionalText(input.operationId) ||
    `crediario-items:${crediarioId}:${randomUUID()}`;
  const occurredAt = optionalText(input.occurredAt) || nowIso();
  const produtos = Array.isArray(input.produtos) ? input.produtos : [];

  const existingOperation = syncOutbox.getOutboxOperation(db, empresaId, operationId);
  if (existingOperation) {
    if (
      existingOperation.type !== 'CREDIARIO_ITEMS_UPDATE' ||
      existingOperation.entityId !== crediarioId
    ) {
      throw new Error('operationId do crediário já pertence a outra operação.');
    }
    return {
      applied: false,
      duplicate: true,
      operation: existingOperation,
      detalhe: crediarioReadModel.getCrediarioDetailCache(db, { empresaId, crediarioId })
    };
  }

  const transaction = beginImmediateTransaction(db);
  try {
    const row = db.prepare(`
      SELECT *
        FROM crediarios_cache
       WHERE empresa_id = ?
         AND crediario_id = ?
       LIMIT 1
    `).get(empresaId, crediarioId);

    if (!row) throw new Error('Crediário não encontrado no cache offline.');
    if (Number(row.pago) === 1 || Number(row.cancelado) === 1) {
      throw new Error('O crediário não está aberto para alteração.');
    }

    const payload = parseJsonText(row.payload_json) || {};
    const rawItems = Array.isArray(payload.itens) ? payload.itens : [];
    const normalizedExisting = rawItems.map(crediarioReadModel.normalizeCrediarioDetailItem);
    const existingById = new Map(
      normalizedExisting
        .filter((item) => item.crediarioItemId)
        .map((item) => [String(item.crediarioItemId), item])
    );
    const originalOpen = normalizedExisting.filter(crediarioReadModel.crediarioItemIsOpen);
    const originalOpenById = new Map(
      originalOpen.map((item) => [String(item.crediarioItemId), item])
    );

    const maxItemNumber = normalizedExisting.reduce(
      (max, item) => Math.max(max, Number(item.itemNumber || 0)),
      0
    );
    let nextItemNumber = maxItemNumber + 1;
    const requestedExistingIds = new Set();
    const desiredOpen = [];

    for (let index = 0; index < produtos.length; index += 1) {
      const product = produtos[index] && typeof produtos[index] === 'object'
        ? produtos[index]
        : {};
      if (product.cancelled === true || product.cancelado === true) {
        const cancelledId = optionalText(product.crediarioItemId || product.id);
        if (cancelledId) requestedExistingIds.add(cancelledId);
        continue;
      }

      const produtoId = requiredText(
        product.productFiscalId || product.produtoId || product.productId,
        `produtos[${index}].produtoId`
      );
      const cachedProduct = productsRepository.getProductCacheById(db, empresaId, produtoId);
      if (!cachedProduct || cachedProduct.ativo !== true) {
        throw new Error(`Produto ${index + 1} não está ativo no cache offline.`);
      }

      const quantityMicrounits = stockRepository.decimalToMicrounits(
        product.quantity == null ? product.quantidade : product.quantity,
        `produtos[${index}].quantidade`
      );
      const unitPriceCentavos = decimalMoneyToCents(
        product.unitValue == null ? product.valorUnitario : product.unitValue,
        `produtos[${index}].valorUnitario`
      );
      if (unitPriceCentavos == null || unitPriceCentavos <= 0) {
        throw new Error(`Produto ${index + 1} possui valor unitário inválido.`);
      }
      const totalCentavos = roundedCrediarioLineTotalCentavos(
        quantityMicrounits,
        unitPriceCentavos
      );

      let itemId = optionalText(product.crediarioItemId || product.id);
      let itemNumber = Number(product.itemNumber || 0);
      if (itemId) {
        const current = existingById.get(itemId);
        if (!current || !crediarioReadModel.crediarioItemIsOpen(current)) {
          throw new Error('Item do crediário não está mais aberto para edição.');
        }
        if (
          current.produtoId &&
          String(current.produtoId) !== produtoId
        ) {
          throw new Error('Não é permitido trocar o produto de um item já existente.');
        }
        requestedExistingIds.add(itemId);
        itemNumber = Number(current.itemNumber || itemNumber || index + 1);
      } else {
        itemId = randomUUID();
        itemNumber = nextItemNumber;
        nextItemNumber += 1;
      }

      const sourcePayload =
        cachedProduct.payload &&
        typeof cachedProduct.payload === 'object' &&
        !Array.isArray(cachedProduct.payload)
          ? cachedProduct.payload
          : {};

      desiredOpen.push({
        crediarioItemId: itemId,
        id: itemId,
        itemNumber,
        produtoId,
        productFiscalId: produtoId,
        productCode: optionalText(
          product.productCode ||
          product.codigoProduto ||
          product.barcode ||
          cachedProduct.codigo ||
          cachedProduct.gtin
        ),
        description: optionalText(product.name || product.description) || cachedProduct.descricao,
        name: optionalText(product.name || product.description) || cachedProduct.descricao,
        ncm: optionalText(product.ncm || sourcePayload.ncm),
        cest: optionalText(product.cest || sourcePayload.cest),
        cfop: optionalText(product.cfop || sourcePayload.cfop),
        unit: optionalText(product.unit || product.unidade || cachedProduct.unidade) || 'UN',
        quantity: Number(quantityMicrounits) / stockRepository.STOCK_QUANTITY_SCALE,
        unitValue: unitPriceCentavos / 100,
        totalValue: totalCentavos / 100,
        total: totalCentavos / 100,
        taxCode: optionalText(product.taxCode),
        tributosReferenciaJson:
          product.tributosReferenciaJson == null
            ? (sourcePayload.tributosReferenciaJson || '')
            : product.tributosReferenciaJson,
        cancelled: false,
        cancelado: false,
        canceladoEm: null,
        pago: false,
        pagoEm: null,
        formaPagamento: '',
        fiscalSaleId: '',
        fiscalStatus: 'NAO_EMITIDA',
        liquidacaoId: '',
        sourceUpdatedAt: occurredAt
      });
    }

    if (!desiredOpen.length) {
      throw new Error(
        'O crediário precisa manter pelo menos um item ativo. Para encerrar a conta use o fluxo próprio de cancelamento.'
      );
    }

    const desiredById = new Map(
      desiredOpen.map((item) => [String(item.crediarioItemId), item])
    );
    const finalItems = [];

    for (const item of normalizedExisting) {
      const itemId = String(item.crediarioItemId || '');
      if (item.pago === true || item.cancelado === true || item.cancelled === true) {
        finalItems.push(item);
        continue;
      }
      const desired = itemId ? desiredById.get(itemId) : null;
      if (desired) {
        finalItems.push(desired);
      } else {
        finalItems.push({
          ...item,
          quantity: 0,
          totalValue: 0,
          total: 0,
          cancelled: true,
          cancelado: true,
          canceladoEm: occurredAt,
          sourceUpdatedAt: occurredAt
        });
      }
    }

    for (const desired of desiredOpen) {
      if (!existingById.has(String(desired.crediarioItemId))) {
        finalItems.push(desired);
      }
    }

    const originalByProduct = new Map();
    const desiredByProduct = new Map();
    for (const item of originalOpen) {
      const key = String(item.produtoId || '');
      const micros = stockRepository.decimalToMicrounits(item.quantity, 'quantidade atual');
      originalByProduct.set(key, (originalByProduct.get(key) || 0) + micros);
    }
    for (const item of desiredOpen) {
      const key = String(item.produtoId || '');
      const micros = stockRepository.decimalToMicrounits(item.quantity, 'quantidade desejada');
      desiredByProduct.set(key, (desiredByProduct.get(key) || 0) + micros);
    }

    const pendingDeltaMap = new Map(
      stockRepository.listPendingStockDeltasByProduct(db, empresaId)
        .map((item) => [String(item.produtoId), Number(item.deltaMicrounits || 0)])
    );
    const stockDeltas = [];
    const productIds = new Set([
      ...originalByProduct.keys(),
      ...desiredByProduct.keys()
    ]);

    for (const produtoId of productIds) {
      const beforeMicros = Number(originalByProduct.get(produtoId) || 0);
      const afterMicros = Number(desiredByProduct.get(produtoId) || 0);
      const diffMicros = afterMicros - beforeMicros;
      if (!diffMicros) continue;

      if (diffMicros > 0) {
        const cachedProduct = productsRepository.getProductCacheById(db, empresaId, produtoId);
        if (!cachedProduct) {
          throw new Error('Produto do crediário não existe no cache local.');
        }
        const productPayload =
          cachedProduct.payload && typeof cachedProduct.payload === 'object'
            ? cachedProduct.payload
            : {};
        const baseQuantity = Number(productPayload.quantidadeEstoque || 0);
        const baseMicros = Number.isFinite(baseQuantity)
          ? Math.round(Math.max(0, baseQuantity) * stockRepository.STOCK_QUANTITY_SCALE)
          : 0;
        const availableMicros = Math.max(
          0,
          baseMicros + Number(pendingDeltaMap.get(produtoId) || 0)
        );
        if (diffMicros > availableMicros) {
          throw new Error(
            `Estoque insuficiente para acrescentar ${cachedProduct.descricao || produtoId} ao crediário.`
          );
        }
      }

      stockDeltas.push({
        produtoId,
        diffMicros
      });
    }

    const baseSituacaoVersao = Number(row.situacao_versao || 0);
    const novaSituacaoVersao = baseSituacaoVersao + 1;
    const valorRecebidoCentavos = Number(row.valor_recebido_centavos || 0);
    const saldoReceberCentavos = desiredOpen.reduce(
      (sum, item) => sum + decimalMoneyToCents(item.totalValue, 'total do item'),
      0
    );
    const valorOriginalCentavos =
      valorRecebidoCentavos + saldoReceberCentavos;

    const dependencies = crediarioReadModel.crediarioOutboxDependencies(
      db,
      empresaId,
      crediarioId
    );

    for (const delta of stockDeltas) {
      const direction = delta.diffMicros > 0 ? -1 : 1;
      const quantityMicrounits = Math.abs(delta.diffMicros);
      const stockOperationId =
        `${operationId}:stock:${delta.produtoId}`;
      const stockMovementId =
        `${operationId}:movement:${delta.produtoId}`;

      db.prepare(`
        INSERT INTO stock_movements (
          empresa_id, movement_id, operation_id, produto_id, direction,
          quantity_microunits, movement_type, source_id, occurred_at,
          created_at, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, 'CREDIARIO_AJUSTE_OFFLINE', ?, ?, ?, ?)
      `).run(
        empresaId,
        stockMovementId,
        stockOperationId,
        delta.produtoId,
        direction,
        quantityMicrounits,
        crediarioId,
        occurredAt,
        occurredAt,
        jsonText({
          crediarioId,
          operationId,
          deltaMicrounits: delta.diffMicros
        })
      );

      db.prepare(`
        INSERT INTO stock_projection (
          empresa_id, produto_id, quantity_microunits, updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(empresa_id, produto_id) DO UPDATE SET
          quantity_microunits =
            stock_projection.quantity_microunits + excluded.quantity_microunits,
          updated_at = excluded.updated_at
      `).run(
        empresaId,
        delta.produtoId,
        direction * quantityMicrounits,
        occurredAt
      );
    }

    const updatedPayload = {
      ...payload,
      valor: saldoReceberCentavos / 100,
      valorOriginal: valorOriginalCentavos / 100,
      valorRecebido: valorRecebidoCentavos / 100,
      saldoReceber: saldoReceberCentavos / 100,
      situacaoVersao: novaSituacaoVersao,
      itens: finalItems
    };

    db.prepare(`
      UPDATE crediarios_cache
         SET valor_centavos = ?,
             valor_original_centavos = ?,
             saldo_receber_centavos = ?,
             situacao_versao = ?,
             cached_at = ?,
             payload_json = ?
       WHERE empresa_id = ?
         AND crediario_id = ?
         AND pago = 0
         AND cancelado = 0
    `).run(
      saldoReceberCentavos,
      valorOriginalCentavos,
      saldoReceberCentavos,
      novaSituacaoVersao,
      occurredAt,
      jsonText(updatedPayload),
      empresaId,
      crediarioId
    );

    const outboxPayload = {
      crediarioId,
      contaReceberId: String(row.conta_receber_id),
      baseSituacaoVersao,
      novaSituacaoVersao,
      valor: saldoReceberCentavos / 100,
      valorOriginal: valorOriginalCentavos / 100,
      valorRecebido: valorRecebidoCentavos / 100,
      saldoReceber: saldoReceberCentavos / 100,
      occurredAt,
      itens: desiredOpen,
      stockDeltas: stockDeltas.map((delta) => ({
        produtoId: delta.produtoId,
        quantidadeDelta:
          Number(delta.diffMicros) / stockRepository.STOCK_QUANTITY_SCALE
      }))
    };

    db.prepare(`
      INSERT INTO sync_outbox (
        empresa_id, operation_id, type, entity_id, payload_json, status,
        attempts, dependencies_json, created_at, updated_at, last_error
      ) VALUES (?, ?, 'CREDIARIO_ITEMS_UPDATE', ?, ?, 'PENDING', 0, ?, ?, ?, NULL)
    `).run(
      empresaId,
      operationId,
      crediarioId,
      jsonText(outboxPayload),
      JSON.stringify(dependencies),
      occurredAt,
      occurredAt
    );

    transaction.commit();

    return {
      applied: true,
      duplicate: false,
      operation: syncOutbox.getOutboxOperation(db, empresaId, operationId),
      detalhe: crediarioReadModel.getCrediarioDetailCache(db, { empresaId, crediarioId })
    };
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}

module.exports = {
  roundedCrediarioLineTotalCentavos,
  openCrediarioOfflineAtomic,
  updateCrediarioItemsOfflineAtomic
};
