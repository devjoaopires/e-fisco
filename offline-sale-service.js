'use strict';

const {

  getOfflineDatabase,

  getProductCacheById,

  getCustomerCacheById,

  getOpenCashSession,

  getCrediarioDetailCache,

  getCrediarioPendingDependencies,

  getFiscalProfileCache,

  registerOfflineSaleAtomic

} = require('./offline-db');

const {
  getSyncEmpresaId
} = require('./offline-device-auth');

function runOfflinePaidSaleFiscalPipeline(...args) {
  return require('./offline-fiscal-sale-pipeline')
    .runOfflinePaidSaleFiscalPipeline(...args);
}



const {

  moneyCentsFromDecimal,

  quantitySnapshot,

  roundedLineTotalCentavos

} = require('./offline-sale-values');



function text(value) {
  return String(value == null ? '' : value).trim();
}

function fiscalContingencyReasonMessage(reason) {
  const code = text(reason).toUpperCase();
  const itemMatch = code.match(/^ITEM_(\d+)_(.+)$/);
  const item = itemMatch ? `ITEM ${itemMatch[1]}` : 'ITEM';
  const detail = itemMatch ? itemMatch[2] : code;
  const map = {
    NCM: `${item} SEM NCM FISCAL VÁLIDO.`,
    CFOP: `${item} SEM CFOP FISCAL VÁLIDO.`,
    ORIGEM: `${item} SEM ORIGEM FISCAL VÁLIDA.`,
    CSOSN: `${item} COM CSOSN NÃO SUPORTADO PARA A CONTINGÊNCIA.`,
    PIS: `${item} COM CST PIS NÃO SUPORTADO.`,
    PIS_ALIQUOTA: `${item} SEM ALÍQUOTA PIS CADASTRADA PARA A EMISSÃO.`,
    COFINS: `${item} COM CST COFINS NÃO SUPORTADO.`,
    COFINS_ALIQUOTA: `${item} SEM ALÍQUOTA COFINS CADASTRADA PARA A EMISSÃO.`,
    RTC_CLASSIFICACAO: `${item} SEM CLASSIFICAÇÃO IBS/CBS EXIGIDA PARA O PERÍODO.`,
    RTC_IBS_UF: `${item} COM ALÍQUOTA IBS UF INVÁLIDA.`,
    RTC_IBS_MUN: `${item} COM ALÍQUOTA IBS MUNICIPAL INVÁLIDA.`,
    RTC_CBS: `${item} COM ALÍQUOTA CBS INVÁLIDA.`,
    QUANTIDADE_PRECISAO: `${item} COM QUANTIDADE FORA DA PRECISÃO FISCAL SUPORTADA.`
  };
  if (itemMatch && map[detail]) return map[detail];
  const generic = {
    SALE_INPUT_INVALID: 'DADOS DA VENDA INVÁLIDOS PARA EMISSÃO FISCAL.',
    CONSUMIDOR_IDENTIFICADO_AINDA_NAO_SUPORTADO: 'CONSUMIDOR IDENTIFICADO AINDA NÃO É SUPORTADO NESTA ETAPA FISCAL.',
    PAGAMENTO_FORA_DO_SUBCONJUNTO: 'FORMA DE PAGAMENTO NÃO SUPORTADA PARA A NFC-E OFFLINE. USE PIX, DÉBITO, CRÉDITO OU DINHEIRO.',
    QUANTIDADE_ITENS_FORA_DO_SUBCONJUNTO: 'QUANTIDADE DE ITENS FORA DO LIMITE FISCAL SUPORTADO.',
    FISCAL_PROFILE_AUSENTE: 'PERFIL FISCAL LOCAL NÃO ESTÁ DISPONÍVEL.',
    AMBIENTE_NAO_PRODUCAO: 'AMBIENTE FISCAL LOCAL NÃO ESTÁ EM PRODUÇÃO.',
    UF_NAO_PA: 'UF DO PERFIL FISCAL LOCAL NÃO É PARÁ.',
    CRT_NAO_SUPORTADO: 'CRT DO PERFIL FISCAL LOCAL NÃO É SUPORTADO.',
    A1_CONTEXT_AUSENTE: 'CONTEXTO LOCAL DO CERTIFICADO A1 NÃO ESTÁ DISPONÍVEL.',
    A1_AUSENTE: 'CERTIFICADO A1 LOCAL NÃO ESTÁ DISPONÍVEL.',
    A1_INDISPONIVEL: 'CERTIFICADO A1 LOCAL NÃO PÔDE SER ABERTO.',
    A1_AINDA_NAO_VALIDO: 'CERTIFICADO A1 AINDA NÃO ESTÁ VÁLIDO.',
    A1_EXPIRADO: 'CERTIFICADO A1 ESTÁ EXPIRADO.',
    LEASE_FISCAL_ATIVO_AUSENTE: 'FAIXA DE NUMERAÇÃO NFC-E LOCAL NÃO ESTÁ DISPONÍVEL.',
    VENDA_EXISTENTE_SEM_DOCUMENTO_FISCAL: 'A VENDA JÁ EXISTE SEM DOCUMENTO FISCAL E EXIGE REVISÃO MANUAL.'
  };
  return generic[code] || `EMISSÃO FISCAL OFFLINE NÃO LIBERADA (${code || 'MOTIVO_DESCONHECIDO'}).`;
}

function validIsoOrNull(value) {
  const candidate = text(value);
  if (!candidate) return null;
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseReferenceTaxEstimate(value) {
  let source = value;
  if (typeof source === 'string') {
    const raw = source.trim();
    if (!raw) return null;
    try {
      source = JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return null;
  }

  const percentages =
    source.percentuais &&
    typeof source.percentuais === 'object' &&
    !Array.isArray(source.percentuais)
      ? source.percentuais
      : null;

  if (!percentages) return null;

  const normalizePercentage = (input) => {
    if (input == null || input === '') return null;
    const raw = String(input).trim().replace(',', '.');
    if (!/^\d+(?:\.\d{1,4})?$/.test(raw)) return null;
    const number = Number(raw);
    if (!Number.isFinite(number) || number < 0 || number > 100) return null;
    return number.toFixed(4);
  };

  const icms = normalizePercentage(percentages.icms);
  const pis = normalizePercentage(percentages.pis);
  const cofins = normalizePercentage(percentages.cofins);

  if (icms == null && pis == null && cofins == null) return null;

  return {
    icms,
    pis,
    cofins,
    fonte: text(source.fonte) || 'TRIBUTOS_REFERENCIA_JSON',
    metodologia: text(source.metodologia),
    confianca:
      source.confianca == null || source.confianca === ''
        ? null
        : Number(source.confianca),
    calculadoEm: validIsoOrNull(source.calculadoEm),
    ajustadoPeloOperador: source.ajustadoPeloOperador === true
  };
}

function resolveTaxRatesFromCache(payloadValue) {
  const payload =
    payloadValue &&
    typeof payloadValue === 'object' &&
    !Array.isArray(payloadValue)
      ? payloadValue
      : {};

  const estimate = parseReferenceTaxEstimate(
    payload.tributosReferenciaJson
  );

  const explicitIcms =
    payload.aliquotaIcms != null &&
    payload.aliquotaIcms !== ''
      ? payload.aliquotaIcms
      : null;

  const explicitPis =
    payload.aliquotaPis != null &&
    payload.aliquotaPis !== ''
      ? payload.aliquotaPis
      : null;

  const explicitCofins =
    payload.aliquotaCofins != null &&
    payload.aliquotaCofins !== ''
      ? payload.aliquotaCofins
      : null;

  const aliquotaIcms =
    explicitIcms != null
      ? explicitIcms
      : estimate && estimate.icms != null
        ? estimate.icms
        : null;

  const aliquotaPis =
    explicitPis != null
      ? explicitPis
      : estimate && estimate.pis != null
        ? estimate.pis
        : null;

  const aliquotaCofins =
    explicitCofins != null
      ? explicitCofins
      : estimate && estimate.cofins != null
        ? estimate.cofins
        : null;

  const estimatedFields = [];
  if (explicitIcms == null && estimate && estimate.icms != null) {
    estimatedFields.push('ICMS');
  }
  if (explicitPis == null && estimate && estimate.pis != null) {
    estimatedFields.push('PIS');
  }
  if (explicitCofins == null && estimate && estimate.cofins != null) {
    estimatedFields.push('COFINS');
  }

  return {
    aliquotaIcms,
    aliquotaPis,
    aliquotaCofins,
    tributacaoEstimativaAplicada:
      estimatedFields.length > 0
        ? {
            aplicada: true,
            campos: estimatedFields,
            origem: 'TRIBUTOS_REFERENCIA_JSON',
            fonte: estimate.fonte,
            metodologia: estimate.metodologia,
            confianca:
              Number.isFinite(estimate.confianca)
                ? estimate.confianca
                : null,
            calculadoEm: estimate.calculadoEm,
            ajustadoPeloOperador: estimate.ajustadoPeloOperador,
            percentuais: {
              icms: estimate.icms,
              pis: estimate.pis,
              cofins: estimate.cofins
            }
          }
        : null
  };
}

function normalizePaymentParts(sale, totalCentavos) {
  const source = Array.isArray(sale.paymentParts)
    ? sale.paymentParts
    : [];

  let parts = source
    .filter((part) => part && typeof part === 'object' && !Array.isArray(part))
    .map((part) => {
      const method = text(
        part.method ||
        part.metodo ||
        part.paymentMethod
      ).toUpperCase();

      if (!method) {
        throw new Error('Forma de pagamento ausente em paymentParts.');
      }

      const amountCentavos = moneyCentsFromDecimal(
        part.amount != null ? part.amount : part.valor,
        `Pagamento ${method}`
      );

      if (amountCentavos <= 0) {
        throw new Error(`Pagamento ${method} deve ser maior que zero.`);
      }

      return {
        ...part,
        method,
        amount: amountCentavos / 100,
        amountCentavos
      };
    });

  if (!parts.length) {
    const fallbackMethod = text(sale.paymentMethod).toUpperCase();
    if (!fallbackMethod) {
      throw new Error('A venda paga não possui forma de pagamento.');
    }
    parts = [{
      method: fallbackMethod,
      amount: totalCentavos / 100,
      amountCentavos: totalCentavos
    }];
  }

  const paymentTotalCentavos = parts.reduce(
    (sum, part) => sum + part.amountCentavos,
    0
  );

  if (!Number.isSafeInteger(paymentTotalCentavos)) {
    throw new Error('Total dos pagamentos excede o limite seguro.');
  }

  if (paymentTotalCentavos !== totalCentavos) {
    throw new Error(
      `Total dos pagamentos (${paymentTotalCentavos}) difere do total da venda (${totalCentavos}) em centavos.`
    );
  }

  return parts;
}

function resolveEmpresaId() {
  const db = getOfflineDatabase();
  const empresaId = getSyncEmpresaId({ db });
  if (!empresaId) {
    throw new Error('Empresa autenticada ainda não está disponível para venda offline.');
  }
  return empresaId;
}

function buildOfflineSaleAtomicInput(saleValue, options = {}) {
  const sale =
    saleValue && typeof saleValue === 'object' && !Array.isArray(saleValue)
      ? saleValue
      : null;

  if (!sale) {
    throw new Error('Venda offline inválida.');
  }

  const productLookup =
    typeof options.getProductCacheById === 'function'
      ? options.getProductCacheById
      : getProductCacheById;
  const customerLookup =
    typeof options.getCustomerCacheById === 'function'
      ? options.getCustomerCacheById
      : getCustomerCacheById;
  const crediarioDetailLookup =
    typeof options.getCrediarioDetailCache === 'function'
      ? options.getCrediarioDetailCache
      : getCrediarioDetailCache;
  const crediarioDependenciesLookup =
    typeof options.getCrediarioPendingDependencies === 'function'
      ? options.getCrediarioPendingDependencies
      : getCrediarioPendingDependencies;

  const isCrediarioLiquidacao =
    sale.crediarioLiquidacao === true;

  const empresaId = text(options.empresaId) || resolveEmpresaId();
  const saleId = text(sale.saleId);
  if (!saleId) {
    throw new Error('saleId é obrigatório para a venda offline.');
  }

  const operationId = `sale-paid:${saleId}`;
  const sourceItems = Array.isArray(sale.products)
    ? sale.products.filter((item) => !(item && item.cancelled === true))
    : [];

  if (!sourceItems.length) {
    throw new Error('A venda offline precisa ter pelo menos um produto ativo.');
  }

  const items = sourceItems.map((item, index) => {
    const produtoId = text(
      item && (
        item.productFiscalId ||
        item.produtoId ||
        item.productId
      )
    );

    if (!produtoId) {
      throw new Error(`Produto ${index + 1} não possui productFiscalId.`);
    }

    const cached = productLookup(empresaId, produtoId);
    if (!cached || cached.ativo !== true) {
      throw new Error(
        `Produto ${index + 1} não está ativo no cache offline autenticado.`
      );
    }

    const quantity = quantitySnapshot(
      item.quantidade != null ? item.quantidade : item.quantity,
      `Produto ${index + 1}: quantidade`
    );

    const unitPriceCentavos = moneyCentsFromDecimal(
      item.unitValue != null ? item.unitValue : item.valorUnitario,
      `Produto ${index + 1}: valor unitário`
    );

    if (unitPriceCentavos <= 0) {
      throw new Error(`Produto ${index + 1}: valor unitário deve ser maior que zero.`);
    }

    const expectedTotalCentavos = roundedLineTotalCentavos(
      quantity.micros,
      unitPriceCentavos
    );

    const providedTotalValue =
      item.total != null
        ? item.total
        : item.totalValue;

    const totalCentavos =
      providedTotalValue == null || providedTotalValue === ''
        ? expectedTotalCentavos
        : moneyCentsFromDecimal(
            providedTotalValue,
            `Produto ${index + 1}: total`
          );

    if (totalCentavos !== expectedTotalCentavos) {
      throw new Error(
        `Produto ${index + 1}: total (${totalCentavos}) difere de quantidade × valor unitário (${expectedTotalCentavos}) em centavos.`
      );
    }

    const taxRates = resolveTaxRatesFromCache(
      cached.payload
    );

    return {
      itemId: `${saleId}:item:${index + 1}`,
      produtoId,
      quantidade: quantity.text,
      unitPriceCentavos,
      totalCentavos,
      payload: {
        name: text(item.name) || cached.descricao,
        productCode: cached.codigo,
        gtin: cached.gtin,
        barcode: text(item.barcode),
        unit: text(item.unit).toUpperCase() || cached.unidade,
        ncm: cached.payload && cached.payload.ncm || text(item.ncm),
        cest: cached.payload && cached.payload.cest || '',
        cfop: cached.payload && cached.payload.cfop || text(item.cfop),
        origem: cached.payload && cached.payload.origem || '',
        csosn: cached.payload && cached.payload.csosn || '',
        cstIcms: cached.payload && cached.payload.cstIcms || '',
        cstPis: cached.payload && cached.payload.cstPis || '',
        cstCofins: cached.payload && cached.payload.cstCofins || '',
        aliquotaIcms: taxRates.aliquotaIcms,
        aliquotaPis: taxRates.aliquotaPis,
        aliquotaCofins: taxRates.aliquotaCofins,
        tributacaoEstimativaAplicada:
          taxRates.tributacaoEstimativaAplicada,
        rtc: cached.payload && cached.payload.rtc && typeof cached.payload.rtc === 'object'
          ? { ...cached.payload.rtc }
          : null,
        cstIbsCbs: cached.payload && cached.payload.cstIbsCbs || '',
        cClassTrib: cached.payload && cached.payload.cClassTrib || '',
        pIBSUF: cached.payload && cached.payload.pIBSUF != null ? cached.payload.pIBSUF : null,
        pIBSMun: cached.payload && cached.payload.pIBSMun != null ? cached.payload.pIBSMun : null,
        pCBS: cached.payload && cached.payload.pCBS != null ? cached.payload.pCBS : null,
        tributosReferenciaJson: cached.payload && cached.payload.tributosReferenciaJson || '',
        imageUrl: text(item.imageUrl),
        crediarioItemId: text(item.crediarioItemId),
        itemNumber: index + 1
      }
    };
  });

  let crediarioSettlement = null;
  let crediarioDependencies = [];

  if (isCrediarioLiquidacao) {
    const crediarioId = text(sale.crediarioId);
    if (!crediarioId) {
      throw new Error('crediarioId é obrigatório para liquidação offline.');
    }

    const detalheCrediario = crediarioDetailLookup({
      empresaId,
      crediarioId
    });
    const itemIds = sourceItems.map((item, index) => {
      const itemId = text(item && item.crediarioItemId);
      if (!itemId) {
        throw new Error(
          `Item ${index + 1} do crediário não possui crediarioItemId para liquidação.`
        );
      }
      return itemId;
    });

    const availableIds = new Set(
      detalheCrediario.itens.map((item) => String(item.crediarioItemId || ''))
    );
    const missingItemIds = itemIds.filter((itemId) => !availableIds.has(itemId));
    if (missingItemIds.length > 0) {
      throw new Error(
        'Um ou mais itens selecionados não estão mais abertos no crediário offline.'
      );
    }

    crediarioDependencies =
      crediarioDependenciesLookup(empresaId, crediarioId);

    crediarioSettlement = {
      crediarioId,
      itemIds,
      baseSituacaoVersao:
        Number(detalheCrediario.conta.situacaoVersao || 0),
      pagamentoParcial:
        sale.crediarioPagamentoParcial === true
    };
  }

  const itemTotalCentavos = items.reduce(
    (sum, item) => sum + item.totalCentavos,
    0
  );

  if (!Number.isSafeInteger(itemTotalCentavos)) {
    throw new Error('Total da venda excede o limite monetário seguro.');
  }

  const declaredTotalValue =
    sale.totalValue != null && sale.totalValue !== ''
      ? sale.totalValue
      : itemTotalCentavos / 100;

  const totalCentavos = moneyCentsFromDecimal(
    declaredTotalValue,
    'Total da venda'
  );

  if (totalCentavos !== itemTotalCentavos) {
    throw new Error(
      `Total da venda (${totalCentavos}) difere da soma dos itens (${itemTotalCentavos}) em centavos.`
    );
  }

  const paymentParts = normalizePaymentParts(sale, totalCentavos);
  const openCashSession = options.openCashSession === undefined
    ? getOpenCashSession(empresaId)
    : options.openCashSession;

  const hasCash = paymentParts.some(
    (part) => part.method === 'DINHEIRO'
  );

  /*
   * Mesma regra do PDV online: toda venda normal nasce vinculada ao
   * caixa aberto, independentemente de ser DINHEIRO, PIX, DÉBITO ou
   * CRÉDITO. A única exceção operacional é a liquidação de crediário
   * sem dinheiro físico; quando houver DINHEIRO até ela exige caixa.
   */
  const exigeCaixaAberto =
    !isCrediarioLiquidacao ||
    hasCash;

  if (exigeCaixaAberto && !openCashSession) {
    throw new Error(
      'Não existe caixa aberto para registrar a venda no modo offline.'
    );
  }

  const occurredAt =
    validIsoOrNull(sale.paidAt) ||
    validIsoOrNull(sale.savedAt) ||
    new Date().toISOString();

  const cashMovements = [];
  const financialMovements = [];

  paymentParts.forEach((part, index) => {
    const movementIndex = index + 1;
    const movementPayload = {
      meio: part.method,
      paymentPart: {
        ...part
      },
      operadorId: text(
        sale.operadorId ||
        sale.operatorId
      ),
      operatorId: text(
        sale.operadorId ||
        sale.operatorId
      ),
      operadorNome: text(
        sale.operadorNome ||
        sale.nomeOperador ||
        sale.operatorName
      ),
      nomeOperador: text(
        sale.operadorNome ||
        sale.nomeOperador ||
        sale.operatorName
      ),
      operatorName: text(
        sale.operadorNome ||
        sale.nomeOperador ||
        sale.operatorName
      ),
      operadorPerfil: text(
        sale.operadorPerfil ||
        sale.perfilOperador
      ),
      perfilOperador: text(
        sale.operadorPerfil ||
        sale.perfilOperador
      ),
      caixaSessaoId:
        openCashSession
          ? text(openCashSession.sessionId)
          : '',
      fiscalEnvironment:
        openCashSession &&
        openCashSession.payload &&
        typeof openCashSession.payload === 'object'
          ? text(openCashSession.payload.fiscalEnvironment)
          : ''
    };

    financialMovements.push({
      movementId: `${saleId}:financial:${movementIndex}`,
      operationId: `${operationId}:financial:${movementIndex}`,
      accountId:
        isCrediarioLiquidacao
          ? text(sale.crediarioId)
          : null,
      direction: 'ENTRADA',
      amountCentavos: part.amountCentavos,
      movementType:
        isCrediarioLiquidacao
          ? 'CREDIARIO_RECEBIMENTO'
          : 'VENDA_PAGA',
      sourceId: saleId,
      occurredAt,
      payload: movementPayload
    });

    if (part.method === 'DINHEIRO') {
      cashMovements.push({
        movementId: `${saleId}:cash:${movementIndex}`,
        operationId: `${operationId}:cash:${movementIndex}`,
        sessionId: text(openCashSession && openCashSession.sessionId),
        direction: 'ENTRADA',
        amountCentavos: part.amountCentavos,
        movementType:
          isCrediarioLiquidacao
            ? 'CREDIARIO_RECEBIMENTO'
            : 'VENDA_PAGA',
        sourceId: saleId,
        occurredAt,
        payload: movementPayload
      });
    }
  });

  const clienteId = text(sale.clienteId) || null;
  if (clienteId) {
    const customer = customerLookup(empresaId, clienteId);
    if (!customer || customer.ativo !== true) {
      throw new Error(
        'O cliente informado não está ativo no cache offline autenticado.'
      );
    }
  }

  const vendaInterna =
    sale.vendaInterna === true ||
    ['VENDA_INTERNA', 'INTERNA'].includes(
      text(sale.origemVenda).toUpperCase()
    );

  const payload = {
    ...sale,
    empresaId: undefined,
    deviceToken: undefined,
    token: undefined,
    status:
      vendaInterna
        ? 'PAGA_INTERNA_OFFLINE'
        : (
            isCrediarioLiquidacao
              ? 'CREDIARIO_RECEBIMENTO_OFFLINE_PENDENTE_SYNC'
              : 'PAGA_OFFLINE_PENDENTE_SYNC'
          ),
    paymentStatus: 'PAGO',
    fiscalStatus:
      vendaInterna
        ? 'VENDA_INTERNA'
        : 'NAO_EMITIDA',
    vendaInterna,
    offline: true,
    documentoFiscalEmitido: false,
    transmissaoFiscalExecutada: false,
    caixaSessaoId:
      openCashSession
        ? text(openCashSession.sessionId)
        : null,
    paymentParts: paymentParts.map((part) => {
      const copy = { ...part };
      delete copy.amountCentavos;
      return copy;
    }),
    paymentSplit: paymentParts.length > 1,
    paymentPartsCount: paymentParts.length,
    paymentMethodsCount:
      new Set(paymentParts.map((part) => part.method)).size,
    paymentTotalValue: totalCentavos / 100,
    crediarioSettlement:
      crediarioSettlement == null
        ? null
        : { ...crediarioSettlement }
  };

  const dependencies = [...crediarioDependencies];
  if (
    exigeCaixaAberto &&
    openCashSession &&
    openCashSession.operationId &&
    !(openCashSession.payload && openCashSession.payload.remoteSynced === true)
  ) {
    dependencies.push(text(openCashSession.operationId));
  }

  return {
    empresaId,
    saleId,
    operationId,
    dependencies: [...new Set(dependencies.filter(Boolean))],
    clienteId,
    status:
      vendaInterna
        ? 'PAID_INTERNAL_OFFLINE'
        : (
            isCrediarioLiquidacao
              ? 'CREDIARIO_RECEBIMENTO_OFFLINE_PENDING_SYNC'
              : 'PAID_OFFLINE_PENDING_SYNC'
          ),
    occurredAt,
    items,
    totalCentavos,
    paymentMethod:
      text(sale.paymentMethod).toUpperCase() ||
      [...new Set(paymentParts.map((part) => part.method))].join(' + '),
    paymentParts: payload.paymentParts,
    paymentSplit: payload.paymentSplit,
    paymentPartsCount: payload.paymentPartsCount,
    paymentMethodsCount: payload.paymentMethodsCount,
    paymentTotalValue: payload.paymentTotalValue,
    cashMovements,
    financialMovements,
    skipStockMovements: isCrediarioLiquidacao,
    crediarioSettlement,
    payload
  };
}


function parseBrazilDateToIsoDate(value, fieldName) {
  const raw = text(value);
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (!match) {
    throw new Error(`${fieldName} deve estar em DD/MM/AAAA.`);
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${fieldName} é inválida.`);
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function buildOfflineCrediarioAtomicInput(saleValue, options = {}) {
  const sale =
    saleValue && typeof saleValue === 'object' && !Array.isArray(saleValue)
      ? saleValue
      : null;

  if (!sale) {
    throw new Error('Venda em crediário offline inválida.');
  }

  const productLookup =
    typeof options.getProductCacheById === 'function'
      ? options.getProductCacheById
      : getProductCacheById;
  const customerLookup =
    typeof options.getCustomerCacheById === 'function'
      ? options.getCustomerCacheById
      : getCustomerCacheById;

  const empresaId = text(options.empresaId) || resolveEmpresaId();
  const crediarioId = text(sale.crediarioId || sale.saleId);
  if (!crediarioId) {
    throw new Error('crediarioId é obrigatório para abrir o crediário offline.');
  }

  const clienteId = text(sale.clienteId);
  if (!clienteId) {
    throw new Error('clienteId é obrigatório para abrir o crediário offline.');
  }

  const customer = customerLookup(empresaId, clienteId);
  if (!customer || customer.ativo !== true) {
    throw new Error(
      'O cliente informado não está ativo no cache offline autenticado.'
    );
  }

  const customerPayload =
    customer.payload &&
    typeof customer.payload === 'object' &&
    !Array.isArray(customer.payload)
      ? customer.payload
      : {};

  const clienteNome = text(
    sale.clienteNome ||
    customer.nome ||
    customerPayload.nomeCompleto ||
    customerPayload.razaoSocial
  );
  if (!clienteNome) {
    throw new Error('Nome do cliente não está disponível no cache offline.');
  }

  const cpf = text(
    sale.cpfCliente ||
    customerPayload.cpf ||
    customer.documento
  ).replace(/\D/g, '');

  if (cpf.length !== 11) {
    throw new Error('O cliente do crediário precisa possuir CPF válido no cache offline.');
  }

  const whatsapp = text(
    sale.whatsappCliente ||
    customerPayload.whatsapp ||
    customer.telefone
  ).replace(/\D/g, '');

  const vencimento = parseBrazilDateToIsoDate(
    sale.crediarioPagamentoEm || sale.vencimento,
    'Vencimento do crediário'
  );

  const sourceItems = Array.isArray(sale.products)
    ? sale.products.filter((item) => !(item && item.cancelled === true))
    : [];

  if (!sourceItems.length) {
    throw new Error('O crediário offline precisa ter pelo menos um produto ativo.');
  }

  const items = sourceItems.map((item, index) => {
    const produtoId = text(
      item && (
        item.productFiscalId ||
        item.produtoId ||
        item.productId
      )
    );

    if (!produtoId) {
      throw new Error(`Produto ${index + 1} não possui productFiscalId.`);
    }

    const cached = productLookup(empresaId, produtoId);
    if (!cached || cached.ativo !== true) {
      throw new Error(
        `Produto ${index + 1} não está ativo no cache offline autenticado.`
      );
    }

    const quantity = quantitySnapshot(
      item.quantidade != null ? item.quantidade : item.quantity,
      `Produto ${index + 1}: quantidade`
    );

    const unitPriceCentavos = moneyCentsFromDecimal(
      item.unitValue != null ? item.unitValue : item.valorUnitario,
      `Produto ${index + 1}: valor unitário`
    );

    if (unitPriceCentavos <= 0) {
      throw new Error(`Produto ${index + 1}: valor unitário deve ser maior que zero.`);
    }

    const totalCentavos = roundedLineTotalCentavos(
      quantity.micros,
      unitPriceCentavos
    );

    const declaredTotal =
      item.total != null
        ? item.total
        : item.totalValue;

    if (
      declaredTotal != null &&
      declaredTotal !== '' &&
      moneyCentsFromDecimal(
        declaredTotal,
        `Produto ${index + 1}: total`
      ) !== totalCentavos
    ) {
      throw new Error(
        `Produto ${index + 1}: total difere de quantidade × valor unitário.`
      );
    }

    const cachedPayload =
      cached.payload &&
      typeof cached.payload === 'object' &&
      !Array.isArray(cached.payload)
        ? cached.payload
        : {};

    return {
      crediarioItemId:
        text(item.crediarioItemId) ||
        `${crediarioId}:item:${index + 1}`,
      itemNumber: index + 1,
      produtoId,
      productCode: text(cached.codigo),
      description: text(item.name) || text(cached.descricao),
      ncm: text(cachedPayload.ncm || item.ncm),
      cest: text(cachedPayload.cest || item.cest),
      cfop: text(cachedPayload.cfop || item.cfop),
      unit: text(item.unit).toUpperCase() || text(cached.unidade).toUpperCase() || 'UN',
      quantity: quantity.text,
      unitValue: unitPriceCentavos / 100,
      totalValue: totalCentavos / 100,
      taxCode: text(
        item.taxCode ||
        cachedPayload.taxCode ||
        cachedPayload.cstIcms ||
        cachedPayload.csosn
      ),
      tributosReferenciaJson:
        cachedPayload.tributosReferenciaJson == null
          ? null
          : cachedPayload.tributosReferenciaJson
    };
  });

  const totalCentavos = items.reduce(
    (sum, item) => sum + moneyCentsFromDecimal(item.totalValue, 'Total do item'),
    0
  );

  const declaredTotal =
    sale.totalValue != null && sale.totalValue !== ''
      ? moneyCentsFromDecimal(sale.totalValue, 'Total do crediário')
      : totalCentavos;

  if (declaredTotal !== totalCentavos) {
    throw new Error(
      `Total do crediário (${declaredTotal}) difere da soma dos itens (${totalCentavos}) em centavos.`
    );
  }

  const occurredAt =
    validIsoOrNull(sale.savedAt) ||
    validIsoOrNull(sale.createdAt) ||
    new Date().toISOString();

  return {
    empresaId,
    crediarioId,
    contaReceberId: crediarioId,
    operationId: `crediario-open:${crediarioId}`,
    clienteId,
    clienteNome,
    cpf,
    whatsapp,
    vencimento,
    occurredAt,
    totalCentavos,
    items,
    payload: {
      crediarioId,
      clienteId,
      clienteNome,
      cpf,
      whatsapp,
      vencimento,
      valor: totalCentavos / 100,
      status: 'A_RECEBER',
      offline: true
    }
  };
}

function listOfflineSalesForFinance(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = text(input.empresaId) || resolveEmpresaId();
  const offset = Math.max(0, Math.trunc(Number(input.offset || 0)));
  const requestedLimit = Math.trunc(Number(input.limit || 50));
  const limit = Math.min(
    100,
    Math.max(
      1,
      Number.isFinite(requestedLimit) ? requestedLimit : 50
    )
  );

  const totalRow = db.prepare(
    'SELECT COUNT(*) AS total FROM sales WHERE empresa_id = ?'
  ).get(empresaId);

  const rows = db.prepare(
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
        text(payload.paidAt || payload.saleDate) ||
        String(row.occurred_at),
      status: String(row.status || ''),
      paymentStatus: text(payload.paymentStatus) || 'PAGO',
      paymentMethod: text(payload.paymentMethod),
      totalValue: Number(row.total_centavos || 0) / 100,
      operatorId: text(payload.operatorId || payload.operadorId),
      operadorNome: text(
        payload.operadorNome ||
        payload.nomeOperador ||
        payload.operatorName
      ),
      operadorPerfil: text(
        payload.operadorPerfil ||
        payload.perfilOperador
      ),
      caixaSessaoId: text(payload.caixaSessaoId),
      vendaInterna: payload.vendaInterna === true,
      origemVenda: text(payload.origemVenda),
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

function buildOfflineInternalSaleReceipt(input) {
  const profile =
    getFiscalProfileCache(input.empresaId) ||
    {};

  const itens = (
    Array.isArray(input.items)
      ? input.items
      : []
  ).map((item, index) => {
    const payload =
      item && item.payload && typeof item.payload === 'object'
        ? item.payload
        : {};

    return {
      itemNumber: Number(payload.itemNumber || index + 1),
      productCode: text(payload.productCode || payload.gtin || payload.barcode),
      description: text(payload.name),
      quantity: Number(item.quantidade || 0),
      unit: text(payload.unit).toUpperCase() || 'UN',
      unitValue: Number(item.unitPriceCentavos || 0) / 100,
      totalValue: Number(item.totalCentavos || 0) / 100
    };
  });

  const tributos = (
    Array.isArray(input.items)
      ? input.items
      : []
  ).reduce(
    (totais, item) => {
      const payload =
        item && item.payload && typeof item.payload === 'object'
          ? item.payload
          : {};
      const base = Number(item && item.totalCentavos || 0) / 100;
      totais.icms += base * Number(payload.aliquotaIcms || 0) / 100;
      totais.pis += base * Number(payload.aliquotaPis || 0) / 100;
      totais.cofins += base * Number(payload.aliquotaCofins || 0) / 100;
      return totais;
    },
    { icms: 0, pis: 0, cofins: 0 }
  );

  tributos.icms = Math.round(tributos.icms * 100) / 100;
  tributos.pis = Math.round(tributos.pis * 100) / 100;
  tributos.cofins = Math.round(tributos.cofins * 100) / 100;
  tributos.total =
    Math.round(
      (tributos.icms + tributos.pis + tributos.cofins) * 100
    ) / 100;

  const venda =
    input.payload && typeof input.payload === 'object'
      ? input.payload
      : {};

  const pagamentos = (
    Array.isArray(input.paymentParts)
      ? input.paymentParts
      : []
  )
    .map((part) => ({
      metodo: text(part && part.method).toUpperCase() || 'PAGAMENTO',
      valor: Number(part && part.amount || 0)
    }))
    .filter((part) => Number.isFinite(part.valor) && part.valor > 0);

  return {
    success: true,
    autorizado: false,
    vendaInterna: true,
    saleId: input.saleId,
    emitente: {
      nomeFantasia: profile.nomeFantasia || '',
      razaoSocial: profile.razaoSocial || '',
      cnpj: profile.cnpj || '',
      inscricaoEstadual: profile.inscricaoEstadual || '',
      logradouro: profile.logradouro || '',
      numero: profile.numero || '',
      complemento: profile.complemento || '',
      bairro: profile.bairro || '',
      municipio: profile.municipio || '',
      uf: profile.uf || '',
      cep: profile.cep || ''
    },
    venda: {
      saleId: input.saleId,
      saleNumber: text(venda.saleNumber),
      saleDate: text(venda.paidAt) || text(input.occurredAt),
      totalValue: Number(input.totalCentavos || 0) / 100,
      paymentMethod: text(input.paymentMethod || venda.paymentMethod),
      operatorId: text(venda.operatorId),
      cpfCliente: text(venda.cpfCliente),
      cnpjCliente: text(venda.cnpjCliente),
      documentoClienteTipo: text(venda.documentoClienteTipo)
    },
    itens,
    nfce: {},
    pagamentoFiscal: {
      disponivel: pagamentos.length > 0,
      pagamentos,
      valorTroco: Number(venda.changeAmount || 0)
    },
    tributosAproximados: tributos,
    valorTotalTributos: tributos.total,
    informacoesComplementares: ''
  };
}

function registerPaidSaleOffline(sale, options = {}) {
  const input = buildOfflineSaleAtomicInput(sale, {
    empresaId: options.empresaId
  });

  if (input.payload.vendaInterna === true) {
    const result = registerOfflineSaleAtomic(input);
    return {
      ...result,
      saleId: input.saleId,
      operationId: input.operationId,
      empresaId: input.empresaId,
      vendaInterna: true,
      fiscalStatus: 'VENDA_INTERNA',
      documentoFiscalEmitido: false,
      transmissaoFiscalExecutada: false,
      contingenciaOffline: false,
      pendenteTransmissao: false,
      fiscalContingencyReady: false,
      comprovante: buildOfflineInternalSaleReceipt(input)
    };
  }

  const fiscal = runOfflinePaidSaleFiscalPipeline(input, {
    deviceId: options.deviceId,
    userDataDir: options.userDataDir,
    safeStorage: options.safeStorage,
    now: options.now
  });

  if (!fiscal.enabled) {
    if (options.requireFiscalContingency === true) {
      throw new Error(
        `EMISSÃO FISCAL EM CONTINGÊNCIA NÃO LIBERADA: ${fiscalContingencyReasonMessage(fiscal.reason)} A VENDA NÃO FOI REGISTRADA.`
      );
    }
    const result = registerOfflineSaleAtomic(input);
    return {
      ...result,
      saleId: input.saleId,
      operationId: input.operationId,
      empresaId: input.empresaId,
      vendaInterna: false,
      fiscalStatus: 'NAO_EMITIDA',
      documentoFiscalEmitido: false,
      transmissaoFiscalExecutada: false,
      contingenciaOffline: false,
      pendenteTransmissao: false,
      fiscalContingencyReady: false,
      fiscalFallbackReason: fiscal.reason
    };
  }

  const document = fiscal.document;
  return {
    ...fiscal.saleResult,
    saleId: input.saleId,
    operationId: input.operationId,
    empresaId: input.empresaId,
    vendaInterna: false,
    fiscalStatus: 'CONTINGENCIA_PENDENTE',
    documentoFiscalEmitido: true,
    transmissaoFiscalExecutada: false,
    contingenciaOffline: true,
    pendenteTransmissao: true,
    tipoEmissao: 9,
    chaveAcesso: document.chaveAcesso,
    numeroNfce: document.numero,
    serie: document.serie,
    fiscalId: document.fiscalId,
    fiscalContingencyReady: fiscal.danfeReady === true,
    fiscalPipelineResumed: fiscal.resumed === true,
    leaseStatus: fiscal.leaseStatus,
    proximoNumeroLease: fiscal.nextLeaseNumber
  };
}

module.exports = {
  moneyCentsFromDecimal,
  quantitySnapshot,
  roundedLineTotalCentavos,
  normalizePaymentParts,
  buildOfflineSaleAtomicInput,
  buildOfflineCrediarioAtomicInput,
  listOfflineSalesForFinance,
  registerPaidSaleOffline
};
