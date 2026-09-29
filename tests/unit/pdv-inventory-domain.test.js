'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(
  __dirname,
  '..',
  '..'
);

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      ROOT,
      relativePath
    ),
    'utf8'
  );
}

function loadInventoryDomain() {
  const windowRef = {};

  const context =
    vm.createContext({
      window: windowRef
    });

  vm.runInContext(
    read(
      'offline-ui/pdv/domains/inventory/domain.js'
    ),
    context,
    {
      filename:
        'offline-ui/pdv/domains/inventory/domain.js'
    }
  );

  return windowRef
    .__scfPdvDomains
    .inventory;
}

test('P10 inventory permanece estavel apos P18 printing', () => {
  const pdv =
    read('offline-ui/pdv.html');

  const files = [
    'domain.js',
    'core.js',
    'decor.js',
    'dashboard-decision.js',
    'dashboard-v3.js',
    'dashboard-v4.js',
    'dashboard-v5.js',
    'dashboard-cleanup.js',
    'right-panel.js',
    'annual-sales-dashboard.js',
    'keyboard-navigation.js'
  ];

  for (const file of files) {
    const source =
      '/pdv/domains/inventory/' +
      file;

    assert.equal(
      pdv.split(source).length - 1,
      1,
      source
    );

    assert.equal(
      fs.existsSync(
        path.join(
          ROOT,
          'offline-ui/pdv/domains/inventory',
          file
        )
      ),
      true,
      file
    );
  }

  assert.ok(
    pdv.indexOf(
      '/pdv/domains/inventory/domain.js'
    ) <
      pdv.indexOf(
        '/pdv/domains/inventory/core.js'
      )
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/finance\/domain\.js/
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/cash\/domain\.js/
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/crediario\/domain\.js/
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/sale-payment\/domain\.js/
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/continuity\/domain\.js/
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/fiscal\/domain\.js/
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/superadmin\/domain\.js/
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/printing\/domain\.js/
  );
});

test('P10 inventory domain e owner canonico da colecao e metricas de estoque', () => {
  const domain =
    loadInventoryDomain();

  const products = [
    {
      produtoId: 'a',
      nome: 'Produto A',
      quantidade: 2,
      custo: 5,
      precoVenda: 10,
      unidade: 'un'
    },
    {
      id: 'b',
      descricao: 'Produto B',
      estoque: 0,
      cost: 1,
      price: 0,
      ncm: '1234.56.78'
    }
  ];

  const stored =
    domain.setProducts(products);

  assert.notEqual(
    stored,
    products
  );

  assert.equal(
    domain.products.length,
    2
  );

  assert.deepEqual(
    {
      produtoId:
        domain.normalizeProduct(
          products[1]
        ).produtoId,
      nome:
        domain.normalizeProduct(
          products[1]
        ).nome,
      quantidade:
        domain.normalizeProduct(
          products[1]
        ).quantidade,
      ncm:
        domain.normalizeProduct(
          products[1]
        ).ncm
    },
    {
      produtoId: 'b',
      nome: 'Produto B',
      quantidade: 0,
      ncm: '12345678'
    }
  );

  assert.equal(
    domain.getEstimatedValue(),
    20
  );
  assert.equal(
    domain.getRegisteredProducts(),
    2
  );
  assert.equal(
    domain.getPotentialMargin(),
    10
  );

  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        domain.getIndicators()
      )
    ),
    {
      total: 2,
      saudavel: 0,
      baixo: 1,
      semEstoque: 1,
      semPreco: 1,
      margemNegativa: 0
    }
  );
});

test('P10 core usa inventory owner e preserva protocolos/eventos/public adapters', () => {
  const source =
    read(
      'offline-ui/pdv/domains/inventory/core.js'
    );

  assert.match(
    source,
    /inventoryDomain/
  );

  assert.doesNotMatch(
    source,
    /\blet\s+produtos\s*=/
  );

  assert.match(
    source,
    /inventoryDomain\.setProducts/
  );
  assert.match(
    source,
    /inventoryDomain\.products/
  );

  for (const protocol of [
    'SCF_ESTOQUE_LISTAR_SOLICITAR',
    'SCF_ESTOQUE_LISTAR_RESULTADO',
    'SCF_ESTOQUE_ATUALIZADO',
    'SCF_ESTOQUE_PRODUTO_CADASTRAR_SOLICITAR',
    'SCF_ESTOQUE_PRODUTO_CADASTRADO',
    'SCF_ESTOQUE_PRODUTO_ATUALIZAR_SOLICITAR',
    'SCF_ESTOQUE_PRODUTO_ATUALIZADO',
    'SCF_ESTOQUE_PRODUTO_EXCLUIR_SOLICITAR',
    'SCF_ESTOQUE_PRODUTO_EXCLUIDO',
    'SCF_ESTOQUE_XML_FORNECEDOR_IMPORTAR_SOLICITAR',
    'SCF_ESTOQUE_XML_ITENS_PROCESSAR_SOLICITAR',
    'SCF_ESTOQUE_XML_PRODUTO_FINALIZAR_SOLICITAR',
    'SCF_PRODUTO_GTIN_PESQUISAR',
    'SCF_PRODUTO_GTIN_RESULTADO'
  ]) {
    assert.equal(
      source.includes(protocol),
      true,
      protocol
    );
  }

  for (const eventName of [
    'scf:estoque-produto-cadastrar',
    'scf:estoque-produtos-atualizados',
    'scf:estoque-xml-selecionado'
  ]) {
    assert.equal(
      source.includes(eventName),
      true,
      eventName
    );
  }

  for (const adapter of [
    'window.scfAbrirEstoque',
    'window.scfFecharEstoque',
    'window.scfAtualizarEstoque',
    'window.scfObterValorEstimadoEstoque',
    'window.scfObterQuantidadeProdutosCadastrados',
    'window.scfObterMargemPotencialEstoque',
    'window.scfObterIndicadoresEstoque'
  ]) {
    assert.equal(
      source.includes(adapter),
      true,
      adapter
    );
  }

  assert.doesNotMatch(
    source,
    /\blocalStorage\b|\bsessionStorage\b/
  );
  assert.doesNotMatch(
    source,
    /(?<![.\w])fetch\s*\(/
  );
});

test('P10 dashboards usam owner e storage contracts sem estado global paralelo', () => {
  const decision =
    read(
      'offline-ui/pdv/domains/inventory/dashboard-decision.js'
    );

  const annual =
    read(
      'offline-ui/pdv/domains/inventory/annual-sales-dashboard.js'
    );

  assert.match(
    decision,
    /inventoryDomain\.products/
  );
  assert.doesNotMatch(
    decision,
    /window\.produtos/
  );

  for (const method of [
    'getEstimatedValue',
    'getRegisteredProducts',
    'getPotentialMargin',
    'getIndicators'
  ]) {
    assert.equal(
      annual.includes(
        'inventoryDomain.' + method
      ),
      true,
      method
    );
  }

  assert.equal(
    annual.includes(
      'window.__scfPdvContracts.storage.session.keys.stockAnnualSalesDashboardHtml'
    ),
    true
  );
  assert.equal(
    annual.includes(
      'window.__scfPdvContracts.storage.local.keys.fiscalSales'
    ),
    true
  );
  assert.equal(
    annual.includes(
      'window.__scfPdvInfra.storage.session'
    ),
    true
  );
  assert.equal(
    annual.includes(
      'window.__scfPdvInfra.storage.local'
    ),
    true
  );

  assert.doesNotMatch(
    annual,
    /window\.scfObter/
  );
  assert.doesNotMatch(
    annual,
    /\blocalStorage\b|\bsessionStorage\b/
  );
  assert.doesNotMatch(
    annual,
    /(?<![.\w])fetch\s*\(/
  );

  for (const eventName of [
    'scf:estoque-produtos-atualizados',
    'scf:historico-vendas-ano-dados',
    'scf:historico-vendas-renderizado'
  ]) {
    assert.equal(
      annual.includes(eventName),
      true,
      eventName
    );
  }
});

test('P10 preserva bridge stock do iframe filho inline e externaliza apenas a navegacao top-level', () => {
  const pdv =
    read('offline-ui/pdv.html');

  const navigation =
    read(
      'offline-ui/pdv/domains/inventory/keyboard-navigation.js'
    );

  assert.match(
    pdv,
    /<script id="scf-stock-keyboard-menu-bridge-final">/
  );
  assert.match(
    pdv,
    /<script id="scf-menu-estoque-blur-foco-visual-final">/
  );
  assert.doesNotMatch(
    pdv,
    /\/pdv\/domains\/inventory\/keyboard-menu-bridge\.js/
  );
  assert.doesNotMatch(
    pdv,
    /\/pdv\/domains\/inventory\/menu-focus\.js/
  );

  assert.equal(
    pdv.includes(
      'SCF_STOCK_KEYBOARD_FROM_MENU'
    ),
    true
  );
  assert.equal(
    navigation.includes(
      'SCF_STOCK_KEYBOARD_FROM_MENU'
    ),
    true
  );

  assert.doesNotMatch(
    navigation,
    /\blocalStorage\b|\bsessionStorage\b/
  );
});
