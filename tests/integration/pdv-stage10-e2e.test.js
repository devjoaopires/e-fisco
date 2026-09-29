'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  startOfflineUiServer
} = require('../../offline-ui-server');

const ROOT = path.resolve(
  __dirname,
  '..',
  '..'
);

const OFFLINE_UI =
  path.join(
    ROOT,
    'offline-ui'
  );

function request(origin, requestPath) {
  return new Promise(
    (resolve, reject) => {
      const req =
        http.get(
          origin + requestPath,
          (response) => {
            const chunks = [];

            response.on(
              'data',
              (chunk) => {
                chunks.push(chunk);
              }
            );

            response.on(
              'end',
              () => {
                resolve({
                  statusCode:
                    response.statusCode,
                  headers:
                    response.headers,
                  body:
                    Buffer.concat(chunks)
                      .toString('utf8')
                });
              }
            );
          }
        );

      req.on(
        'error',
        reject
      );
    }
  );
}

function extractScriptSources(html) {
  return [
    ...html.matchAll(
      /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi
    )
  ].map(
    (match) =>
      match[1]
  );
}

function extractStylesheetHrefs(html) {
  return [
    ...html.matchAll(
      /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>|<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']stylesheet["'][^>]*>/gi
    )
  ].map(
    (match) =>
      match[1] ||
      match[2]
  );
}

function listProductionDomainJs() {
  const domainsRoot =
    path.join(
      OFFLINE_UI,
      'pdv',
      'domains'
    );

  const result = [];

  function visit(dir) {
    for (
      const entry
      of fs.readdirSync(
        dir,
        {
          withFileTypes: true
        }
      )
    ) {
      const absolute =
        path.join(
          dir,
          entry.name
        );

      if(entry.isDirectory()) {
        visit(absolute);
        continue;
      }

      if(
        !entry.isFile() ||
        !entry.name.endsWith('.js') ||
        entry.name.includes('.bak.')
      ) {
        continue;
      }

      result.push(
        path.relative(
          path.join(
            OFFLINE_UI,
            'pdv'
          ),
          absolute
        )
          .replace(
            /\\/g,
            '/'
          )
      );
    }
  }

  visit(domainsRoot);

  return result.sort();
}

test('10.1 produção real: offline server entrega pdv e todos os assets referenciados sem 404', async () => {
  const server =
    await startOfflineUiServer();

  try {
    const pdv =
      await request(
        server.origin,
        '/pdv.html'
      );

    assert.equal(
      pdv.statusCode,
      200
    );
    assert.equal(
      pdv.headers[
        'x-content-type-options'
      ],
      'nosniff'
    );
    assert.equal(
      pdv.headers[
        'referrer-policy'
      ],
      'no-referrer'
    );
    assert.equal(
      pdv.headers[
        'cache-control'
      ],
      'no-store, max-age=0'
    );

    const assets = [
      ...extractScriptSources(
        pdv.body
      ),
      ...extractStylesheetHrefs(
        pdv.body
      )
    ]
      .filter(
        (asset) =>
          asset.startsWith(
            '/pdv/'
          ) ||
          asset.startsWith(
            '/vendor/'
          )
      );

    assert.ok(
      assets.length > 100
    );

    assert.equal(
      new Set(assets).size,
      assets.length,
      'nenhum asset runtime deve ser carregado duas vezes'
    );

    const responses =
      await Promise.all(
        assets.map(
          async (asset) => ({
            asset,
            response:
              await request(
                server.origin,
                asset
              )
          })
        )
      );

    for (
      const {
        asset,
        response
      }
      of responses
    ) {
      assert.equal(
        response.statusCode,
        200,
        asset
      );

      assert.equal(
        response.headers[
          'x-content-type-options'
        ],
        'nosniff',
        asset
      );

      assert.equal(
        response.headers[
          'cache-control'
        ],
        'no-store, max-age=0',
        asset
      );

      if(
        asset.endsWith('.js')
      ) {
        assert.equal(
          response.headers[
            'content-type'
          ],
          'application/javascript; charset=utf-8',
          asset
        );
      }

      if(
        asset.endsWith('.css')
      ) {
        assert.equal(
          response.headers[
            'content-type'
          ],
          'text/css; charset=utf-8',
          asset
        );
      }
    }
  } finally {
    await server.close();
  }
});

test('10.1 fechamento Etapa 9: todos os JS de domínio estão carregados uma vez e não há módulo órfão', () => {
  const pdv =
    fs.readFileSync(
      path.join(
        OFFLINE_UI,
        'pdv.html'
      ),
      'utf8'
    );

  const scripts =
    extractScriptSources(pdv)
      .filter(
        (source) =>
          source.startsWith(
            '/pdv/domains/'
          )
      );

  const loaded =
    scripts.map(
      (source) =>
        source.slice(
          '/pdv/'.length
        )
    );

  const files =
    listProductionDomainJs();

  assert.deepEqual(
    [
      ...new Set(loaded)
    ].sort(),
    files
  );

  assert.equal(
    loaded.length,
    files.length
  );

  const domainDirs =
    fs.readdirSync(
      path.join(
        OFFLINE_UI,
        'pdv',
        'domains'
      ),
      {
        withFileTypes: true
      }
    )
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.name.includes(
            '.bak.'
          )
      )
      .map(
        (entry) =>
          entry.name
      )
      .sort();

  assert.deepEqual(
    domainDirs,
    [
      'cash',
      'continuity',
      'crediario',
      'customer',
      'finance',
      'fiscal',
      'history',
      'inventory',
      'printing',
      'products',
      'sale-payment',
      'superadmin',
      'suppliers'
    ]
  );
});

test('10.1 load order: dependências eager entre domains têm owner carregado antes do consumidor', () => {
  const pdv =
    fs.readFileSync(
      path.join(
        OFFLINE_UI,
        'pdv.html'
      ),
      'utf8'
    );

  const scripts =
    extractScriptSources(pdv)
      .filter(
        (source) =>
          source.startsWith(
            '/pdv/'
          )
      );

  const position =
    new Map(
      scripts.map(
        (source, index) => [
          source,
          index
        ]
      )
    );

  const ownerByProperty = {
    products:
      '/pdv/domains/products/domain.js',
    customer:
      '/pdv/domains/customer/domain.js',
    suppliers:
      '/pdv/domains/suppliers/domain.js',
    history:
      '/pdv/domains/history/domain.js',
    inventory:
      '/pdv/domains/inventory/domain.js',
    finance:
      '/pdv/domains/finance/domain.js',
    cash:
      '/pdv/domains/cash/domain.js',
    crediario:
      '/pdv/domains/crediario/domain.js',
    salePayment:
      '/pdv/domains/sale-payment/domain.js',
    continuity:
      '/pdv/domains/continuity/domain.js',
    fiscal:
      '/pdv/domains/fiscal/domain.js',
    superadmin:
      '/pdv/domains/superadmin/domain.js',
    printing:
      '/pdv/domains/printing/domain.js'
  };

  const eagerDependency =
    /^  const\s+[A-Za-z0-9_$]+Domain\s*=\s*\r?\n\s*window\.__scfPdvDomains\s*&&\s*\r?\n\s*window\.__scfPdvDomains\.([A-Za-z0-9_$]+)/gm;

  const violations = [];

  for (const source of scripts) {
    if(
      !source.startsWith(
        '/pdv/domains/'
      )
    ) {
      continue;
    }

    const absolute =
      path.join(
        OFFLINE_UI,
        'pdv',
        ...source
          .slice(
            '/pdv/'.length
          )
          .split('/')
      );

    const runtime =
      fs.readFileSync(
        absolute,
        'utf8'
      );

    const prelude =
      runtime
        .split(/\r?\n/)
        .slice(0, 60)
        .join('\n');

    for (
      const match
      of prelude.matchAll(
        eagerDependency
      )
    ) {
      const property =
        match[1];

      const owner =
        ownerByProperty[
          property
        ];

      if(!owner) {
        continue;
      }

      if(
        source !== owner &&
        (
          !position.has(owner) ||
          position.get(owner) >=
            position.get(source)
        )
      ) {
        violations.push({
          source,
          property,
          owner,
          sourceIndex:
            position.get(source),
          ownerIndex:
            position.get(owner)
        });
      }
    }
  }

  assert.deepEqual(
    violations,
    []
  );

  const cashReceipt =
    fs.readFileSync(
      path.join(
        OFFLINE_UI,
        'pdv',
        'domains',
        'cash',
        'receipt.js'
      ),
      'utf8'
    );

  assert.match(
    cashReceipt,
    /function requireFinanceDomain\(\)/
  );
  assert.match(
    cashReceipt,
    /const financeDomain\s*=\s*\r?\n\s*requireFinanceDomain\(\);/
  );
  assert.doesNotMatch(
    cashReceipt
      .split(/\r?\n/)
      .slice(0, 30)
      .join('\n'),
    /^  const financeDomain\s*=/m
  );
});

test('10.1 shell final preserva fundação P02-P05 antes dos domains e scripts classic same-origin', () => {
  const pdv =
    fs.readFileSync(
      path.join(
        OFFLINE_UI,
        'pdv.html'
      ),
      'utf8'
    );

  const sources =
    extractScriptSources(pdv)
      .filter(
        (source) =>
          source.startsWith(
            '/pdv/'
          )
      );

  assert.deepEqual(
    sources.slice(
      0,
      15
    ),
    [
      '/pdv/contracts/messages.js',
      '/pdv/contracts/events.js',
      '/pdv/contracts/storage-keys.js',
      '/pdv/infra/shell-bridge.js',
      '/pdv/infra/event-bus.js',
      '/pdv/infra/storage.js',
      '/pdv/infra/dom.js',
      '/pdv/infra/browser-network.js',
      '/pdv/state/session-state.js',
      '/pdv/state/runtime-state.js',
      '/pdv/state/navigation-state.js',
      '/pdv/shared/values/ui-values.js',
      '/pdv/shared/helpers/text-format.js',
      '/pdv/compat/legacy-globals.js',
      '/pdv/bootstrap.js'
    ]
  );

  assert.doesNotMatch(
    pdv,
    /<script[^>]+\btype\s*=\s*["']module["']/i
  );

  assert.equal(
    new Set(sources).size,
    sources.length
  );
});
