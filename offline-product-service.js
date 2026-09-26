'use strict';

const {
  getOfflineDatabase,
  findProductCacheByCodeOrGtin,
  searchProductsCache,
  listPendingStockDeltasByProduct
} = require('./offline-db');

const {
  getSyncEmpresaId
} = require('./offline-device-auth');

function text(value) {
  return String(value == null ? '' : value).trim();
}

function digits(value) {
  return text(value).replace(/\D/g, '');
}

function normalizeSearch(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function mapProductForSale(product) {
  if (!product) return null;

  const payload =
    product.payload && typeof product.payload === 'object'
      ? product.payload
      : {};

  const image = text(payload.imagem);

  return {
    id: text(product.produtoId),
    nome: text(product.descricao),
    codigo: text(product.codigo),
    gtin: text(product.gtin),
    ncm: text(payload.ncm),
    cfop: text(payload.cfop),
    unidade: text(product.unidade).toUpperCase(),
    valorUnitario:
      product.precoCentavos == null
        ? null
        : Number(product.precoCentavos) / 100,
    imagem: image,
    imagemUrl: image,
    ativo: product.ativo === true
  };
}

function resolveOfflineEmpresaId(input = {}) {
  const empresaId =
    text(input.empresaId) ||
    getSyncEmpresaId({
      db: getOfflineDatabase()
    });

  if (!empresaId) {
    throw new Error(
      'Empresa autenticada ainda não está disponível para consulta offline.'
    );
  }

  return empresaId;
}

function productAvailableQuantity(product, pendingDeltaMicrounits = 0) {
  const payload =
    product && product.payload && typeof product.payload === 'object'
      ? product.payload
      : {};

  const base = Number(payload.quantidadeEstoque);
  const safeBase = Number.isFinite(base) && base > 0 ? base : 0;
  const delta = Number(pendingDeltaMicrounits || 0) / 1000000;
  const quantity = safeBase + (Number.isFinite(delta) ? delta : 0);

  return Math.max(0, Math.round(quantity * 1000000) / 1000000);
}

function listOfflineProductsForSale(options = {}) {
  const empresaId = resolveOfflineEmpresaId(options);
  const pendingDeltas = new Map(
    listPendingStockDeltasByProduct(empresaId)
      .map((item) => [String(item.produtoId), Number(item.deltaMicrounits || 0)])
  );

  return searchProductsCache({
    empresaId,
    term: '',
    limit: 5000,
    onlyActive: true
  }).map((product) => {
    const mapped = mapProductForSale(product);
    const quantidade = productAvailableQuantity(
      product,
      pendingDeltas.get(String(product.produtoId)) || 0
    );

    return {
      produtoId: mapped.id,
      id: mapped.id,
      codigo: mapped.codigo,
      codigoBarras: mapped.gtin || mapped.codigo,
      barcode: mapped.gtin || mapped.codigo,
      gtin: mapped.gtin,
      nome: mapped.nome,
      descricao: mapped.nome,
      unidade: mapped.unidade,
      valorUnitario: mapped.valorUnitario,
      precoVenda: mapped.valorUnitario,
      ncm: mapped.ncm,
      cfop: mapped.cfop,
      quantidade,
      estoque: quantidade,
      ativo: mapped.ativo,
      aptoVenda: quantidade > 0,
      fiscalPendente: false,
      pendenciasVenda: quantidade > 0 ? [] : ['SEM_ESTOQUE']
    };
  });
}

function findOfflineProductForSale(criteria = {}) {
  const input =
    criteria && typeof criteria === 'object'
      ? criteria
      : {};

  const codigo = text(
    input.productCode ||
    input.codigo ||
    input.code
  );

  const gtin = digits(
    input.gtin ||
    input.barcode ||
    input.productBarcode ||
    input.codigoBarras
  );

  const descricao = text(
    input.descricao ||
    input.nome ||
    input.title
  );

  if (!codigo && !gtin && !descricao) {
    return {
      success: true,
      found: false,
      transmissaoExecutada: false,
      cmsAlterado: false,
      produto: null,
      message:
        'Informe o código de barras, o código interno ou a descrição do produto.'
    };
  }

  const empresaId = resolveOfflineEmpresaId(input);
  let product = null;

  if (gtin) {
    product = findProductCacheByCodeOrGtin(
      empresaId,
      gtin
    );
  } else if (codigo) {
    product = findProductCacheByCodeOrGtin(
      empresaId,
      codigo
    );
  } else {
    const normalizedDescription = normalizeSearch(descricao);
    const exactMatches = searchProductsCache({
      empresaId,
      term: descricao,
      limit: 200,
      onlyActive: true
    }).filter(
      (item) =>
        normalizeSearch(item.descricao) ===
        normalizedDescription
    );

    if (exactMatches.length > 1) {
      throw new Error(
        `A descrição "${descricao}" corresponde a mais de um cadastro fiscal offline.`
      );
    }

    product = exactMatches[0] || null;
  }

  if (!product) {
    return {
      success: true,
      found: false,
      transmissaoExecutada: false,
      cmsAlterado: false,
      produto: null,
      message:
        'Produto não cadastrado, inativo ou ausente do cache offline.'
    };
  }

  const mapped = mapProductForSale(product);

  if (!mapped.unidade) {
    throw new Error(
      'O produto foi encontrado no cache offline, mas não possui unidade cadastrada.'
    );
  }

  if (!mapped.nome) {
    throw new Error(
      'O produto foi encontrado no cache offline, mas não possui descrição cadastrada.'
    );
  }

  return {
    success: true,
    found: true,
    transmissaoExecutada: false,
    cmsAlterado: false,
    produto: mapped,
    message:
      'Produto fiscal localizado no cache offline.'
  };
}
                                                                                                                                                                                   
module.exports = {
  normalizeSearch,
  mapProductForSale,
  productAvailableQuantity,
  listOfflineProductsForSale,
  findOfflineProductForSale
};
