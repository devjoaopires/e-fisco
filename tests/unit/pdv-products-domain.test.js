'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    'utf8'
  );
}

function loadProductsDomain(overrides = {}) {
  const storageData = new Map();
  const networkCalls = [];
  const nodes = overrides.nodes || {};

  const windowRef = {
    __scfPdvInfra: {
      browserNetwork: {
        async fetchJson(url, options, timeoutMs) {
          networkCalls.push({
            url,
            options,
            timeoutMs
          });
          return (
            overrides.networkPayload ||
            []
          );
        }
      },
      storage: {
        local: {
          getItem(key) {
            return storageData.has(key)
              ? storageData.get(key)
              : null;
          },
          setItem(key, value) {
            storageData.set(
              key,
              String(value)
            );
          }
        }
      },
      dom: {
        byId(id) {
          return nodes[id] || null;
        }
      }
    },
    __scfPdvContracts: {
      storage: {
        local: {
          keys: {
            learnedNcmCatalog:
              'scfProductNcmCatalogV2'
          }
        }
      }
    },
    __scfPdvShared: {
      helpers: {
        digits(value) {
          return String(
            value == null ? '' : value
          ).replace(/\D/g, '');
        }
      }
    },
    setTimeout,
    clearTimeout
  };

  const context = vm.createContext({
    window: windowRef,
    console
  });

  vm.runInContext(
    read(
      'offline-ui/pdv/domains/products/domain.js'
    ),
    context,
    {
      filename:
        'offline-ui/pdv/domains/products/domain.js'
    }
  );

  return {
    windowRef,
    domain:
      windowRef.__scfPdvDomains.products,
    storageData,
    networkCalls
  };
}

test('P06 externaliza products/search no mesmo timing sem ESM ou CSS de dominio artificial', () => {
  const pdv = read('offline-ui/pdv.html');

  const domainSource =
    '/pdv/domains/products/domain.js';
  const searchSource =
    '/pdv/domains/products/search.js';

  assert.equal(
    fs.existsSync(
      path.join(
        ROOT,
        'offline-ui/pdv/domains/products/domain.js'
      )
    ),
    true
  );
  assert.equal(
    fs.existsSync(
      path.join(
        ROOT,
        'offline-ui/pdv/domains/products/search.js'
      )
    ),
    true
  );

  assert.match(
    pdv,
    /<script src="\/pdv\/domains\/products\/domain\.js"><\/script>/
  );
  assert.match(
    pdv,
    /<script id="scf-pdv-f5-consulta-produto-script-final" src="\/pdv\/domains\/products\/search\.js"><\/script>/
  );

  assert.ok(
    pdv.indexOf(domainSource) <
      pdv.indexOf(
        '/pdv/domains/sale-payment/sale-core.js'
      )
  );
  assert.ok(
    pdv.indexOf(searchSource) > 0
  );

  assert.doesNotMatch(
    pdv,
    /BUSINESS_NCM_CATALOG|productNcmRequestVersion|productNcmTimer|\blet ncmOrigin\b/
  );
  assert.doesNotMatch(
    pdv,
    /<script[^>]+\btype\s*=\s*["']module["']/i
  );

  assert.equal(
    fs.existsSync(
      path.join(
        ROOT,
        'offline-ui/pdv/styles/domains'
      )
    ),
    false
  );
});

test('P06 products domain e owner de cache, preview e estado NCM sem adapters fiscais mortos', () => {
  const {
    windowRef,
    domain
  } = loadProductsDomain();

  assert.ok(domain);
  assert.equal(
    domain.isInternalScaleCode('0001'),
    true
  );
  assert.equal(
    domain.isInternalScaleCode('0999'),
    true
  );
  assert.equal(
    domain.isInternalScaleCode('0000'),
    false
  );
  assert.equal(
    domain.isInternalScaleCode('001'),
    false
  );

  const cached =
    domain.cacheFiscalProduct({
      id: 'p1',
      codigo: '123',
      gtin: '7891234567890',
      unidade: 'un',
      valorUnitario: 7.5,
      nome: 'Produto P06',
      ncm: '22021000'
    });

  assert.ok(cached);
  assert.equal(
    domain.findCachedFiscalProduct({
      barcode: '7891234567890'
    }).id,
    'p1'
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      windowRef,
      '__scfPdvFindCachedProductFiscal'
    ),
    false
  );

  assert.equal(
    domain.cacheFiscalProduct({
      id: 'inativo',
      gtin: '7891234567890',
      unidade: 'UN',
      valorUnitario: 1,
      nome: 'Inativo',
      ativo: false
    }),
    null
  );

  domain.preparedPreview = {
    id: 'preview'
  };
  assert.equal(
    windowRef
      .__scfPdvProdutoConsultaPreview.id,
    'preview'
  );

  windowRef.__scfPdvProdutoConsultaPreview =
    null;
  assert.equal(
    domain.getPreparedPreview(),
    null
  );

  domain.setNcmOrigin('manual');
  assert.equal(
    domain.getNcmOrigin(),
    'manual'
  );
  domain.resetNcmLookup();
  assert.equal(
    domain.getNcmOrigin(),
    ''
  );
});

test('P06 NCM preserva catalogo aprendido/local e rede oficial somente via browser-network', async () => {
  const {
    domain,
    storageData,
    networkCalls
  } = loadProductsDomain({
    networkPayload: [
      {
        codigo: '22021000',
        descricao:
          'Águas com adição de açúcar ou aromatizadas'
      }
    ]
  });

  domain.saveLearnedProductNcm(
    'Produto Teste 1kg',
    '22021000'
  );

  const learned =
    domain.findLocalProductNcm(
      'Produto Teste 1kg'
    );
  assert.equal(
    learned.code,
    '22021000'
  );
  assert.equal(
    storageData.has(
      'scfProductNcmCatalogV2'
    ),
    true
  );

  const local =
    domain.findLocalProductNcm(
      'Coca Cola 2L'
    );
  assert.equal(
    local.code,
    '22021000'
  );

  const parser =
    (payload) => payload.map(
      (item) => ({
        code: item.codigo,
        description: item.descricao,
        search:
          String(
            item.codigo +
            ' ' +
            item.descricao
          )
            .normalize('NFD')
            .replace(
              /[\u0300-\u036f]/g,
              ''
            )
            .toLowerCase()
      })
    );

  const result =
    await domain.searchOfficialNcm(
      '2202',
      parser
    );

  assert.equal(
    result.rows[0].code,
    '22021000'
  );
  assert.equal(
    networkCalls.length,
    1
  );
  assert.match(
    networkCalls[0].url,
    /portalunico\.siscomex\.gov\.br/
  );
  assert.equal(
    networkCalls[0].timeoutMs,
    30000
  );

  const source = read(
    'offline-ui/pdv/domains/products/domain.js'
  );
  assert.match(
    source,
    /browserNetwork\.fetchJson/
  );
  assert.doesNotMatch(
    source,
    /\bglobal\.fetch\s*\(|\bwindow\.fetch\s*\(|(?<![.\w])fetch\s*\(/
  );
});

test('P06 F4 usa owner products + navigation-state e preserva protocolos/timers observados', () => {
  const search = read(
    'offline-ui/pdv/domains/products/search.js'
  );

  assert.match(
    search,
    /productsDomain\.cacheFiscalProduct/
  );
  assert.match(
    search,
    /productsDomain\.findCachedFiscalProduct/
  );
  assert.match(
    search,
    /navigationState\.setProductLookupOpen/
  );
  assert.doesNotMatch(
    search,
    /window\.__scfPdvConsultaProdutoAtiva/
  );
  assert.doesNotMatch(
    search,
    /window\.__scfPdvProdutoConsultaPreview/
  );

  for (const protocol of [
    'SCF_ESTOQUE_LISTAR_SOLICITAR',
    'SCF_ESTOQUE_LISTAR_RESULTADO',
    'SCF_ESTOQUE_ATUALIZADO',
    'SCF_PRODUTO_FISCAL_VENDA_BUSCAR',
    'SCF_PRODUTO_FISCAL_VENDA_RESULTADO',
    'SCF_PRODUTO_FISCAL_VENDA_ERRO',
    'scf:pdv-render-current-product-preview',
    'scf:pdv-cancelar-produto-preparado-consulta',
    'scf:nova-venda-pronta'
  ]) {
    assert.equal(
      search.includes(protocol),
      true,
      protocol
    );
  }

  for (const delay of [
    '0',
    '120',
    '500',
    '900'
  ]) {
    assert.match(
      search,
      new RegExp(
        '[,\\n\\r\\s]' +
        delay +
        '\\s*\\)'
      )
    );
  }

  assert.match(
    search,
    /window\.__scfPdvDesativarBuscaF4\s*=/
  );
  assert.match(
    search,
    /window\.__scfPdvConfirmarProdutoSelecionadoF4/
  );
});
