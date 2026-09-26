'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeSearch,
  mapProductForSale,
  productAvailableQuantity
} = require('../../offline-product-service');

test('normalizeSearch remove acentos, normaliza espaços e converte para minúsculas', () => {
  assert.equal(
    normalizeSearch('  CAFÉ   com   AÇÚCAR  '),
    'cafe com acucar'
  );
  assert.equal(
    normalizeSearch('ÁÉÍÓÚ Ç ÃÕ'),
    'aeiou c ao'
  );
});

test('normalizeSearch trata valores vazios e não-string de forma determinística', () => {
  assert.equal(normalizeSearch(null), '');
  assert.equal(normalizeSearch(undefined), '');
  assert.equal(normalizeSearch('   '), '');
  assert.equal(normalizeSearch(12345), '12345');
});

test('normalizeSearch preserva pontuação e dígitos usados em código ou descrição', () => {
  assert.equal(normalizeSearch(' ABC-123 / 45 '), 'abc-123 / 45');
  assert.equal(normalizeSearch('Produto 001'), 'produto 001');
});

test('mapProductForSale retorna null para produto ausente', () => {
  assert.equal(mapProductForSale(null), null);
  assert.equal(mapProductForSale(undefined), null);
});

test('mapProductForSale normaliza campos do cache para o contrato de venda', () => {
  const mapped = mapProductForSale({
    produtoId: ' prod-1 ',
    descricao: ' Café Premium ',
    codigo: ' INT-01 ',
    gtin: ' 7891234567890 ',
    unidade: ' un ',
    precoCentavos: 1234,
    ativo: true,
    payload: {
      ncm: ' 09012100 ',
      cfop: ' 5102 ',
      imagem: ' https://example.invalid/product.png '
    }
  });

  assert.deepEqual(mapped, {
    id: 'prod-1',
    nome: 'Café Premium',
    codigo: 'INT-01',
    gtin: '7891234567890',
    ncm: '09012100',
    cfop: '5102',
    unidade: 'UN',
    valorUnitario: 12.34,
    imagem: 'https://example.invalid/product.png',
    imagemUrl: 'https://example.invalid/product.png',
    ativo: true
  });
});

test('mapProductForSale tolera payload ausente e mantém preço null quando não informado', () => {
  const mapped = mapProductForSale({
    produtoId: 'prod-2',
    descricao: 'Produto sem fiscal',
    codigo: null,
    gtin: null,
    unidade: 'kg',
    precoCentavos: null,
    ativo: false
  });

  assert.equal(mapped.id, 'prod-2');
  assert.equal(mapped.codigo, '');
  assert.equal(mapped.gtin, '');
  assert.equal(mapped.ncm, '');
  assert.equal(mapped.cfop, '');
  assert.equal(mapped.unidade, 'KG');
  assert.equal(mapped.valorUnitario, null);
  assert.equal(mapped.imagem, '');
  assert.equal(mapped.imagemUrl, '');
  assert.equal(mapped.ativo, false);
});

test('mapProductForSale só considera ativo quando o cache contém boolean true', () => {
  assert.equal(mapProductForSale({ ativo: true }).ativo, true);
  assert.equal(mapProductForSale({ ativo: 1 }).ativo, false);
  assert.equal(mapProductForSale({ ativo: 'true' }).ativo, false);
  assert.equal(mapProductForSale({ ativo: false }).ativo, false);
});

test('productAvailableQuantity retorna estoque base com precisão de seis casas', () => {
  assert.equal(
    productAvailableQuantity({
      payload: { quantidadeEstoque: 10 }
    }),
    10
  );
  assert.equal(
    productAvailableQuantity({
      payload: { quantidadeEstoque: '1.2345674' }
    }),
    1.234567
  );
  assert.equal(
    productAvailableQuantity({
      payload: { quantidadeEstoque: '1.2345675' }
    }),
    1.234568
  );
});

test('productAvailableQuantity soma deltas pendentes em microunidades', () => {
  const product = {
    payload: { quantidadeEstoque: 10.5 }
  };

  assert.equal(productAvailableQuantity(product, 500000), 11);
  assert.equal(productAvailableQuantity(product, -250000), 10.25);
  assert.equal(productAvailableQuantity(product, 1), 10.500001);
});

test('productAvailableQuantity nunca retorna estoque negativo', () => {
  assert.equal(
    productAvailableQuantity(
      { payload: { quantidadeEstoque: 1 } },
      -2000000
    ),
    0
  );
  assert.equal(
    productAvailableQuantity(
      { payload: { quantidadeEstoque: -5 } },
      0
    ),
    0
  );
});

test('productAvailableQuantity trata base e delta inválidos como zero', () => {
  assert.equal(productAvailableQuantity(null), 0);
  assert.equal(
    productAvailableQuantity({
      payload: { quantidadeEstoque: 'não-numérico' }
    }),
    0
  );
  assert.equal(
    productAvailableQuantity(
      { payload: { quantidadeEstoque: 2 } },
      Number.POSITIVE_INFINITY
    ),
    2
  );
});

test('productAvailableQuantity não altera o produto recebido', () => {
  const product = {
    produtoId: 'prod-imutavel',
    payload: { quantidadeEstoque: 3.25 }
  };
  const snapshot = JSON.parse(JSON.stringify(product));

  assert.equal(productAvailableQuantity(product, -250000), 3);
  assert.deepEqual(product, snapshot);
});
