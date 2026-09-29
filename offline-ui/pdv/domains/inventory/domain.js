(function (global) {
  'use strict';

  var domains =
    global.__scfPdvDomains ||
    (global.__scfPdvDomains = {});

  var state = {
    products: []
  };

  function text(value) {
    return String(
      value == null
        ? ''
        : value
    )
      .replace(/\s+/g, ' ')
      .trim();
  }

  function digits(value) {
    return text(value)
      .replace(/\D/g, '');
  }

  function normalizeProduct(item) {
    var product =
      item &&
      typeof item === 'object'
        ? item
        : {};

    return {
      produtoId:
        text(
          product.produtoId != null
            ? product.produtoId
            : product.id != null
                ? product.id
                : product._id
        ),
      codigo:
        text(
          product.codigoBarras != null
            ? product.codigoBarras
            : product.barcode != null
                ? product.barcode
                : product.codigo != null
                    ? product.codigo
                    : product.sku
        ),
      nome:
        text(
          product.nome != null
            ? product.nome
            : product.name != null
                ? product.name
                : product.descricao != null
                    ? product.descricao
                    : product.description
        ),
      quantidade:
        Number(
          product.quantidade != null
            ? product.quantidade
            : product.estoque != null
                ? product.estoque
                : product.stock != null
                    ? product.stock
                    : 0
        ) || 0,
      custo:
        Number(
          product.custo != null
            ? product.custo
            : product.cost != null
                ? product.cost
                : product.valorCusto != null
                    ? product.valorCusto
                    : 0
        ) || 0,
      venda:
        Number(
          product.precoVenda != null
            ? product.precoVenda
            : product.price != null
                ? product.price
                : product.valorVenda != null
                    ? product.valorVenda
                    : product.valorUnitario != null
                        ? product.valorUnitario
                        : 0
        ) || 0,
      ncm:
        digits(
          product.ncm != null
            ? product.ncm
            : product.codigoNcm != null
                ? product.codigoNcm
                : product.NCM != null
                    ? product.NCM
                    : ''
        ).slice(0, 8),
      unidade:
        text(
          product.unidade != null
            ? product.unidade
            : product.unit != null
                ? product.unit
                : product.un != null
                    ? product.un
                    : 'UN'
        ).toUpperCase(),
      somenteCadastroFiscal:
        product.somenteCadastroFiscal === true,
      aptoVenda:
        product.aptoVenda === true,
      fiscalPendente:
        product.fiscalPendente === true,
      pendenciasVenda:
        Array.isArray(
          product.pendenciasVenda
        )
          ? product.pendenciasVenda
          : []
    };
  }

  function getProducts() {
    return state.products;
  }

  function setProducts(value) {
    state.products =
      Array.isArray(value)
        ? value.slice()
        : [];
    return state.products;
  }

  function estimatedValue() {
    return state.products
      .map(normalizeProduct)
      .reduce(
        function(total, item) {
          var quantity =
            Math.max(
              0,
              Number(item.quantidade) || 0
            );

          var salePrice =
            Math.max(
              0,
              Number(item.venda) || 0
            );

          return total +
            (quantity * salePrice);
        },
        0
      );
  }

  function registeredProducts() {
    return state.products.length;
  }

  function potentialMargin() {
    return state.products
      .map(normalizeProduct)
      .reduce(
        function(total, item) {
          var quantity =
            Math.max(
              0,
              Number(item.quantidade) || 0
            );

          var cost =
            Math.max(
              0,
              Number(item.custo) || 0
            );

          var salePrice =
            Math.max(
              0,
              Number(item.venda) || 0
            );

          return total +
            (
              quantity *
              (salePrice - cost)
            );
        },
        0
      );
  }

  function indicators() {
    var total =
      state.products.length;

    return state.products
      .map(normalizeProduct)
      .reduce(
        function(acc, item) {
          var quantity =
            Math.max(
              0,
              Number(item.quantidade) || 0
            );

          var cost =
            Math.max(
              0,
              Number(item.custo) || 0
            );

          var salePrice =
            Math.max(
              0,
              Number(item.venda) || 0
            );

          var noPrice =
            salePrice <= 0;

          var noStock =
            quantity <= 0;

          var low =
            !noStock &&
            quantity <= 3;

          var negativeMargin =
            !noPrice &&
            (salePrice - cost) < 0;

          var positiveMargin =
            salePrice > cost;

          var healthy =
            !noStock &&
            !low &&
            !noPrice &&
            !negativeMargin &&
            positiveMargin;

          if(healthy) {
            acc.saudavel += 1;
          }
          if(low) {
            acc.baixo += 1;
          }
          if(noStock) {
            acc.semEstoque += 1;
          }
          if(noPrice) {
            acc.semPreco += 1;
          }
          if(negativeMargin) {
            acc.margemNegativa += 1;
          }

          return acc;
        },
        {
          total: total,
          saudavel: 0,
          baixo: 0,
          semEstoque: 0,
          semPreco: 0,
          margemNegativa: 0
        }
      );
  }

  var api = {
    getProducts: getProducts,
    setProducts: setProducts,
    normalizeProduct: normalizeProduct,
    getEstimatedValue: estimatedValue,
    getRegisteredProducts: registeredProducts,
    getPotentialMargin: potentialMargin,
    getIndicators: indicators,
    snapshot: function() {
      return Object.freeze({
        productCount:
          state.products.length,
        estimatedValue:
          estimatedValue(),
        potentialMargin:
          potentialMargin()
      });
    }
  };

  Object.defineProperty(
    api,
    'products',
    {
      enumerable: true,
      get: getProducts,
      set: setProducts
    }
  );

  domains.inventory =
    Object.freeze(api);
})(window);
