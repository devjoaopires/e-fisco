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
    path.join(ROOT, relativePath),
    'utf8'
  );
}

function quotedScfNames(source) {
  const names = new Set();
  const pattern =
    /['"`](SCF_[A-Z0-9_]+)['"`]/g;
  let match;

  while (
    (match = pattern.exec(source)) !==
    null
  ) {
    names.add(match[1]);
  }

  return [...names].sort();
}

function quotedScfEvents(source) {
  const names = new Set();
  const pattern =
    /['"`](scf:[A-Za-z0-9:_-]+)['"`]/g;
  let match;

  while (
    (match = pattern.exec(source)) !==
    null
  ) {
    names.add(match[1]);
  }

  return [...names].sort();
}

function pdvRuntimeSurface() {
  const pdvRoot =
    path.join(
      ROOT,
      'offline-ui',
      'pdv'
    );
  const sources = [
    read('offline-ui/pdv.html')
  ];

  function walk(directory) {
    for (
      const entry of
        fs.readdirSync(
          directory,
          {
            withFileTypes: true
          }
        )
    ) {
      const fullPath =
        path.join(
          directory,
          entry.name
        );
      const relative =
        path.relative(
          pdvRoot,
          fullPath
        ).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (
          relative === 'contracts' ||
          relative.startsWith(
            'contracts/'
          )
        ) {
          continue;
        }

        walk(fullPath);
        continue;
      }

      if (
        entry.isFile() &&
        entry.name.endsWith('.js') &&
        !entry.name.includes('.bak.')
      ) {
        sources.push(
          fs.readFileSync(
            fullPath,
            'utf8'
          )
        );
      }
    }
  }

  walk(pdvRoot);

  return sources.join('\n');
}

function loadContracts() {
  const runtimeWindow = {};

  const context = vm.createContext({
    window: runtimeWindow
  });

  for (const relativePath of [
    'offline-ui/pdv/contracts/messages.js',
    'offline-ui/pdv/contracts/events.js',
    'offline-ui/pdv/contracts/storage-keys.js'
  ]) {
    vm.runInContext(
      read(relativePath),
      context,
      {
        filename: relativePath
      }
    );
  }

  return runtimeWindow.__scfPdvContracts;
}

test('P02 externaliza manifests de mensagens/eventos sem alterar os nomes observados', () => {
  const pdv =
    pdvRuntimeSurface();
  const shell = read(
    'offline-ui/offline-shell.html'
  );
  const contracts = loadContracts();

  const pdvMessages =
    quotedScfNames(pdv);
  const shellMessages =
    quotedScfNames(shell);
  const shared =
    shellMessages.filter(
      (name) =>
        pdvMessages.includes(name)
    );
  const shellOnly =
    shellMessages.filter(
      (name) =>
        !pdvMessages.includes(name)
    );

  assert.equal(
    pdvMessages.length,
    265
  );
  assert.deepEqual(
    Array.from(
      contracts.messages.pdv
    ),
    pdvMessages
  );

  assert.equal(
    shellMessages.length,
    45
  );
  assert.deepEqual(
    Array.from(
      contracts.messages
        .offlineBridgeShared
    ),
    shared
  );
  assert.equal(
    shared.length,
    44
  );
  assert.deepEqual(
    Array.from(
      contracts.messages
        .offlineShellOnly
    ),
    shellOnly
  );
  assert.deepEqual(
    shellOnly,
    [
      'SCF_NFCE_NUMERACAO_ERRO'
    ]
  );

  const events =
    quotedScfEvents(pdv);

  assert.equal(events.length, 33);
  assert.deepEqual(
    Array.from(
      contracts.events.names
    ),
    events
  );

  assert.equal(
    contracts.messages.has(
      'SCF_VENDA_PAGA'
    ),
    true
  );
  assert.equal(
    contracts.events.has(
      'scf:venda-paga'
    ),
    true
  );
});

test('P02 preserva storage key/prefix/separador/TTL/backend e shape documentados', () => {
  const contracts = loadContracts();
  const storage = contracts.storage;

  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        storage.local.keys
      )
    ),
    {
      learnedNcmCatalog:
        'scfProductNcmCatalogV2',
      fiscalDraft:
        'scfFiscalDraft',
      fiscalSales:
        'scfFiscalSales',
      lastFinalizedSale:
        'scfLastFinalizedSale',
      financeExitPaid:
        'scf.financeiro.saida.situacao.pago.v1'
    }
  );

  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        storage.local.prefixes
      )
    ),
    {
      companyByCnpj:
        'scf_cnpjws_cnpj_',
      companyIeByCnpjUf:
        'scf_cnpjws_ie_',
      financeSangriaHistory:
        'scf.financeiro.saida.sangrias.historico.v1|',
      financeSangriaReversed:
        'scf.financeiro.saida.sangrias.anuladas.v1|'
    }
  );

  assert.equal(
    storage.session.keys
      .stockAnnualSalesDashboardHtml,
    'scf_stock_copy_annual_sales_dashboard_html_v1'
  );
  assert.equal(
    storage.separators.financeTenant,
    '|'
  );
  assert.equal(
    storage.separators
      .financeMovementIdentity,
    '|'
  );
  assert.equal(
    storage.separators.companyIeParts,
    '_'
  );
  assert.equal(
    storage.defaults.financeTenant,
    'EMPRESA_ATUAL'
  );
  assert.equal(
    storage.ttlMs
      .companyRegistryLookup,
    604800000
  );

  assert.match(
    storage.jsonShapes
      .companyRegistryLookup,
    /__salvoEm/
  );
  assert.match(
    storage.jsonShapes
      .stockAnnualSalesDashboardHtml,
    /sessionStorage/
  );
});

test('P02 carrega contratos como scripts clássicos same-origin antes dos consumidores inline', () => {
  const pdv = read(
    'offline-ui/pdv.html'
  );

  const tags = [
    '<script src="/pdv/contracts/messages.js"></script>',
    '<script src="/pdv/contracts/events.js"></script>',
    '<script src="/pdv/contracts/storage-keys.js"></script>'
  ];

  let previous = -1;

  for (const tag of tags) {
    const index =
      pdv.indexOf(tag);

    assert.ok(
      index > previous,
      tag
    );
    previous = index;
  }

  const firstConsumer =
    pdv.indexOf(
      'id="scf-layout-settle-head"'
    );

  assert.ok(
    previous < firstConsumer
  );

  const contractTags =
    pdv.match(
      /<script[^>]+src="\/pdv\/contracts\/[^"]+"[^>]*><\/script>/g
    ) || [];

  assert.equal(
    contractTags.length,
    3
  );

  for (const tag of contractTags) {
    assert.doesNotMatch(
      tag,
      /type\s*=\s*["']module["']/i
    );
    assert.doesNotMatch(
      tag,
      /\basync\b/i
    );
    assert.doesNotMatch(
      tag,
      /\bdefer\b/i
    );
  }
});

test('P02-P18 renderer consome os contratos de storage sem reintroduzir os literais removidos', () => {
  const pdv = read(
    'offline-ui/pdv.html'
  );
  const rendererRuntime = [
    pdv,
    read(
      'offline-ui/pdv/domains/products/domain.js'
    ),
    read(
      'offline-ui/pdv/domains/products/search.js'
    ),
    read(
      'offline-ui/pdv/domains/inventory/annual-sales-dashboard.js'
    ),
    read(
      'offline-ui/pdv/domains/finance/core.js'
    ),
    read(
      'offline-ui/pdv/domains/sale-payment/sale-core.js'
    ),
    read(
      'offline-ui/pdv/domains/sale-payment/payment-core.js'
    )
  ].join('\n');

  assert.match(
    rendererRuntime,
    /__scfPdvContracts\.storage\.local\.keys\.learnedNcmCatalog/
  );
  assert.match(
    pdv,
    /__scfPdvContracts\.storage\.ttlMs\.companyRegistryLookup/
  );
  assert.match(
    rendererRuntime,
    /__scfPdvContracts\.storage\.session\.keys\.stockAnnualSalesDashboardHtml/
  );
  assert.match(
    rendererRuntime,
    /__scfPdvContracts\.storage\.local\.keys\.financeExitPaid/
  );

  for (const literal of [
    'scfProductNcmCatalogV2',
    'scfFiscalDraft',
    'scfFiscalSales',
    'scfLastFinalizedSale',
    'scf_stock_copy_annual_sales_dashboard_html_v1',
    'scf_cnpjws_cnpj_',
    'scf_cnpjws_ie_',
    'scf.financeiro.saida.sangrias.historico.v1|',
    'scf.financeiro.saida.sangrias.anuladas.v1|',
    'scf.financeiro.saida.situacao.pago.v1'
  ]) {
    assert.equal(
      rendererRuntime.includes(literal),
      false,
      literal
    );
  }
});
