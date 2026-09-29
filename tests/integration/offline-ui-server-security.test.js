'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  startOfflineUiServer
} = require('../../offline-ui-server');

const {
  withTempDir
} = require('../helpers/temp-dir');

function writeFixture(rootDir) {
  fs.mkdirSync(
    path.join(rootDir, 'vendor'),
    { recursive: true }
  );
  fs.mkdirSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'products'
    ),
    { recursive: true }
  );
  fs.mkdirSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'customer'
    ),
    { recursive: true }
  );
  fs.mkdirSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'suppliers'
    ),
    { recursive: true }
  );
  fs.mkdirSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'history'
    ),
    { recursive: true }
  );
  fs.mkdirSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'inventory'
    ),
    { recursive: true }
  );
  fs.mkdirSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'finance'
    ),
    { recursive: true }
  );
  fs.mkdirSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'cash'
    ),
    { recursive: true }
  );
  fs.mkdirSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'crediario'
    ),
    { recursive: true }
  );
  fs.mkdirSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'sale-payment'
    ),
    { recursive: true }
  );
  fs.mkdirSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'continuity'
    ),
    { recursive: true }
  );
  fs.mkdirSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'fiscal'
    ),
    { recursive: true }
  );
  fs.mkdirSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'superadmin'
    ),
    { recursive: true }
  );
  fs.mkdirSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'printing'
    ),
    { recursive: true }
  );
  fs.mkdirSync(
    path.join(
      rootDir,
      'pdv',
      'styles',
      'base'
    ),
    { recursive: true }
  );

  fs.writeFileSync(
    path.join(
      rootDir,
      'offline-shell.html'
    ),
    '<!doctype html><title>shell</title>',
    'utf8'
  );
  fs.writeFileSync(
    path.join(rootDir, 'pdv.html'),
    '<!doctype html><title>pdv</title>',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'vendor',
      'html2canvas-1.4.1.min.js'
    ),
    'globalThis.__html2canvasFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'vendor',
      'qrcodejs-1.0.0.min.js'
    ),
    'globalThis.__qrcodeFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'bootstrap.js'
    ),
    'globalThis.__pdvBootstrapFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'products',
      'search.js'
    ),
    'globalThis.__pdvSearchFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'customer',
      'domain.js'
    ),
    'globalThis.__pdvCustomerDomainFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'customer',
      'list.js'
    ),
    'globalThis.__pdvCustomerListFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'suppliers',
      'domain.js'
    ),
    'globalThis.__pdvSuppliersDomainFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'suppliers',
      'crud.js'
    ),
    'globalThis.__pdvSuppliersCrudFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'history',
      'domain.js'
    ),
    'globalThis.__pdvHistoryDomainFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'history',
      'core.js'
    ),
    'globalThis.__pdvHistoryCoreFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'inventory',
      'domain.js'
    ),
    'globalThis.__pdvInventoryDomainFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'inventory',
      'core.js'
    ),
    'globalThis.__pdvInventoryCoreFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'finance',
      'domain.js'
    ),
    'globalThis.__pdvFinanceDomainFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'finance',
      'core.js'
    ),
    'globalThis.__pdvFinanceCoreFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'cash',
      'domain.js'
    ),
    'globalThis.__pdvCashDomainFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'cash',
      'core.js'
    ),
    'globalThis.__pdvCashCoreFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'crediario',
      'domain.js'
    ),
    'globalThis.__pdvCrediarioDomainFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'crediario',
      'core.js'
    ),
    'globalThis.__pdvCrediarioCoreFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'sale-payment',
      'domain.js'
    ),
    'globalThis.__pdvSalePaymentDomainFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'sale-payment',
      'sale-core.js'
    ),
    'globalThis.__pdvSalePaymentCoreFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'continuity',
      'domain.js'
    ),
    'globalThis.__pdvContinuityDomainFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'continuity',
      'core.js'
    ),
    'globalThis.__pdvContinuityCoreFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'fiscal',
      'domain.js'
    ),
    'globalThis.__pdvFiscalDomainFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'fiscal',
      'receipt.js'
    ),
    'globalThis.__pdvFiscalReceiptFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'superadmin',
      'domain.js'
    ),
    'globalThis.__pdvSuperadminDomainFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'superadmin',
      'certificate-a1.js'
    ),
    'globalThis.__pdvSuperadminA1Fixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'printing',
      'domain.js'
    ),
    'globalThis.__pdvPrintingDomainFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'domains',
      'printing',
      'frame-controller.js'
    ),
    'globalThis.__pdvPrintingFrameFixture = true;',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'styles',
      'base',
      'layout.css'
    ),
    'html { box-sizing: border-box; }',
    'utf8'
  );
  fs.writeFileSync(
    path.join(
      rootDir,
      'pdv',
      'blocked.json'
    ),
    '{"blocked":true}',
    'utf8'
  );
}

function request(
  origin,
  requestPath,
  method = 'GET'
) {
  return new Promise(
    (resolve, reject) => {
      const target =
        new URL(
          requestPath,
          origin
        );

      const req =
        http.request(
          {
            hostname:
              target.hostname,
            port:
              target.port,
            path:
              target.pathname +
              target.search,
            method
          },
          (res) => {
            const chunks = [];

            res.on(
              'data',
              (chunk) =>
                chunks.push(chunk)
            );
            res.on(
              'end',
              () => {
                resolve({
                  statusCode:
                    res.statusCode,
                  headers:
                    res.headers,
                  body:
                    Buffer.concat(
                      chunks
                    )
                });
              }
            );
          }
        );

      req.once(
        'error',
        reject
      );
      req.end();
    }
  );
}

test('servidor offline escuta somente em loopback e serve allowlist fixa + subtree modular /pdv/**', async () => {
  await withTempDir(
    async (rootDir) => {
      writeFixture(rootDir);

      const server =
        await startOfflineUiServer({
          rootDir
        });

      try {
        assert.equal(
          server.host,
          '127.0.0.1'
        );
        assert.match(
          server.origin,
          /^http:\/\/127\.0\.0\.1:\d+$/
        );

        const cases = [
          {
            path:
              '/offline-shell.html',
            contentType:
              'text/html; charset=utf-8'
          },
          {
            path:
              '/pdv.html',
            contentType:
              'text/html; charset=utf-8'
          },
          {
            path:
              '/vendor/html2canvas-1.4.1.min.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/vendor/qrcodejs-1.0.0.min.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/bootstrap.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/products/search.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/customer/domain.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/customer/list.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/suppliers/domain.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/suppliers/crud.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/history/domain.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/history/core.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/inventory/domain.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/inventory/core.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/finance/domain.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/finance/core.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/cash/domain.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/cash/core.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/crediario/domain.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/crediario/core.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/sale-payment/domain.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/sale-payment/sale-core.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/continuity/domain.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/continuity/core.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/fiscal/domain.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/fiscal/receipt.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/superadmin/domain.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/superadmin/certificate-a1.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/printing/domain.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/domains/printing/frame-controller.js',
            contentType:
              'application/javascript; charset=utf-8'
          },
          {
            path:
              '/pdv/styles/base/layout.css',
            contentType:
              'text/css; charset=utf-8'
          }
        ];

        for (const item of cases) {
          const response =
            await request(
              server.origin,
              item.path
            );

          assert.equal(
            response.statusCode,
            200,
            item.path
          );
          assert.equal(
            String(
              response.headers[
                'content-type'
              ]
            ),
            item.contentType,
            item.path
          );
          assert.equal(
            response.headers[
              'x-content-type-options'
            ],
            'nosniff',
            item.path
          );
          assert.equal(
            response.headers[
              'referrer-policy'
            ],
            'no-referrer',
            item.path
          );
          assert.equal(
            response.headers[
              'cache-control'
            ],
            'no-store, max-age=0',
            item.path
          );
        }
      } finally {
        await server.close();
      }
    },
    'efisco-p01-ui-server-'
  );
});

test('HEAD preserva metadados sem corpo também nos assets modulares e método não permitido retorna 405', async () => {
  await withTempDir(
    async (rootDir) => {
      writeFixture(rootDir);

      const server =
        await startOfflineUiServer({
          rootDir
        });

      try {
        for (const requestPath of [
          '/pdv.html',
          '/pdv/bootstrap.js',
          '/pdv/styles/base/layout.css'
        ]) {
          const head =
            await request(
              server.origin,
              requestPath,
              'HEAD'
            );

          assert.equal(
            head.statusCode,
            200
          );
          assert.equal(
            head.body.length,
            0
          );
          assert.ok(
            Number(
              head.headers[
                'content-length'
              ]
            ) > 0
          );
        }

        const post =
          await request(
            server.origin,
            '/pdv/bootstrap.js',
            'POST'
          );

        assert.equal(
          post.statusCode,
          405
        );
        assert.equal(
          post.headers.allow,
          'GET, HEAD'
        );
      } finally {
        await server.close();
      }
    },
    'efisco-p01-ui-server-head-'
  );
});

test('subtree modular aceita somente JS/CSS existentes e traversal/encoding perigoso falham fechado', async () => {
  await withTempDir(
    async (rootDir) => {
      writeFixture(rootDir);

      const outsideSecret =
        path.join(
          path.dirname(rootDir),
          'outside-secret.js'
        );

      fs.writeFileSync(
        outsideSecret,
        'globalThis.__secret = true;',
        'utf8'
      );

      const server =
        await startOfflineUiServer({
          rootDir
        });

      try {
        const cases = [
          '/not-found.js',
          '/pdv/',
          '/pdv/not-found.js',
          '/pdv/blocked.json',
          '/pdv/offline-shell.html',
          '/../outside-secret.js',
          '/%2e%2e/outside-secret.js',
          '/pdv/../outside-secret.js',
          '/pdv/%2e%2e/outside-secret.js',
          '/pdv/%2e%2e%2foutside-secret.js',
          '/pdv/%2foutside-secret.js',
          '/pdv/%5coutside-secret.js',
          '/pdv/%00bootstrap.js'
        ];

        for (
          const requestPath of cases
        ) {
          const response =
            await request(
              server.origin,
              requestPath
            );

          assert.equal(
            response.statusCode,
            404,
            requestPath
          );
          assert.notEqual(
            response.body.toString(
              'utf8'
            ),
            'globalThis.__secret = true;',
            requestPath
          );
        }
      } finally {
        await server.close();
        fs.rmSync(
          outsideSecret,
          { force: true }
        );
      }
    },
    'efisco-p01-ui-server-traversal-'
  );
});

test('arquivo ou root modular configurado fora de offline-ui é recusado antes de abrir o servidor', async () => {
  await withTempDir(
    async (rootDir) => {
      writeFixture(rootDir);

      const outsideShell =
        path.join(
          path.dirname(rootDir),
          'outside-shell.html'
        );
      const outsideAssets =
        path.join(
          path.dirname(rootDir),
          'outside-pdv-assets'
        );

      fs.writeFileSync(
        outsideShell,
        '<title>outside</title>',
        'utf8'
      );
      fs.mkdirSync(
        outsideAssets,
        { recursive: true }
      );

      try {
        assert.throws(
          () =>
            startOfflineUiServer({
              rootDir,
              shellPath:
                outsideShell
            }),
          /precisa ficar dentro do diretório offline-ui/
        );

        assert.throws(
          () =>
            startOfflineUiServer({
              rootDir,
              pdvAssetsRoot:
                outsideAssets
            }),
          /precisa ficar dentro do diretório offline-ui/
        );
      } finally {
        fs.rmSync(
          outsideShell,
          { force: true }
        );
        fs.rmSync(
          outsideAssets,
          {
            recursive: true,
            force: true
          }
        );
      }
    },
    'efisco-p01-ui-server-root-'
  );
});

test('symlink modular que escapa do root real não é servido', async (t) => {
  await withTempDir(
    async (rootDir) => {
      writeFixture(rootDir);

      const outsideSecret =
        path.join(
          path.dirname(rootDir),
          'outside-symlink-secret.js'
        );
      const linkPath =
        path.join(
          rootDir,
          'pdv',
          'linked-secret.js'
        );

      fs.writeFileSync(
        outsideSecret,
        'globalThis.__symlinkSecret = true;',
        'utf8'
      );

      try {
        try {
          fs.symlinkSync(
            outsideSecret,
            linkPath,
            'file'
          );
        } catch (error) {
          if (
            error &&
            (
              error.code === 'EPERM' ||
              error.code === 'EACCES'
            )
          ) {
            t.skip(
              'symlink de arquivo não permitido neste Windows'
            );
            return;
          }
          throw error;
        }

        const server =
          await startOfflineUiServer({
            rootDir
          });

        try {
          const response =
            await request(
              server.origin,
              '/pdv/linked-secret.js'
            );

          assert.equal(
            response.statusCode,
            404
          );
          assert.notEqual(
            response.body.toString(
              'utf8'
            ),
            'globalThis.__symlinkSecret = true;'
          );
        } finally {
          await server.close();
        }
      } finally {
        fs.rmSync(
          linkPath,
          { force: true }
        );
        fs.rmSync(
          outsideSecret,
          { force: true }
        );
      }
    },
    'efisco-p01-ui-server-symlink-'
  );
});


test('root modular inteiro em symlink/junction para fora de offline-ui também falha fechado', async (t) => {
  await withTempDir(
    async (rootDir) => {
      writeFixture(rootDir);

      const pdvRoot =
        path.join(
          rootDir,
          'pdv'
        );
      const outsideAssets =
        path.join(
          path.dirname(rootDir),
          'outside-pdv-root'
        );

      fs.rmSync(
        pdvRoot,
        {
          recursive: true,
          force: true
        }
      );
      fs.mkdirSync(
        outsideAssets,
        { recursive: true }
      );
      fs.writeFileSync(
        path.join(
          outsideAssets,
          'bootstrap.js'
        ),
        'globalThis.__outsideRoot = true;',
        'utf8'
      );

      try {
        try {
          fs.symlinkSync(
            outsideAssets,
            pdvRoot,
            process.platform === 'win32'
              ? 'junction'
              : 'dir'
          );
        } catch (error) {
          if (
            error &&
            (
              error.code === 'EPERM' ||
              error.code === 'EACCES'
            )
          ) {
            t.skip(
              'junction/symlink de diretório não permitido neste host'
            );
            return;
          }
          throw error;
        }

        const server =
          await startOfflineUiServer({
            rootDir
          });

        try {
          const response =
            await request(
              server.origin,
              '/pdv/bootstrap.js'
            );

          assert.equal(
            response.statusCode,
            404
          );
          assert.notEqual(
            response.body.toString(
              'utf8'
            ),
            'globalThis.__outsideRoot = true;'
          );
        } finally {
          await server.close();
        }
      } finally {
        fs.rmSync(
          pdvRoot,
          {
            recursive: true,
            force: true
          }
        );
        fs.rmSync(
          outsideAssets,
          {
            recursive: true,
            force: true
          }
        );
      }
    },
    'efisco-p01-ui-server-root-symlink-'
  );
});


test('P02 assets reais de contracts são servidos como JavaScript classic same-origin', async () => {
  const server =
    await startOfflineUiServer();

  try {
    for (const requestPath of [
      '/pdv/contracts/messages.js',
      '/pdv/contracts/events.js',
      '/pdv/contracts/storage-keys.js'
    ]) {
      const response =
        await request(
          server.origin,
          requestPath
        );

      assert.equal(
        response.statusCode,
        200,
        requestPath
      );
      assert.equal(
        String(
          response.headers[
            'content-type'
          ]
        ),
        'application/javascript; charset=utf-8',
        requestPath
      );
      assert.equal(
        response.headers[
          'x-content-type-options'
        ],
        'nosniff',
        requestPath
      );
    }
  } finally {
    await server.close();
  }
});


test('P03 assets reais de infra são servidos como JavaScript classic same-origin', async () => {
  const server =
    await startOfflineUiServer();

  try {
    for (const requestPath of [
      '/pdv/infra/shell-bridge.js',
      '/pdv/infra/event-bus.js',
      '/pdv/infra/storage.js',
      '/pdv/infra/dom.js',
      '/pdv/infra/browser-network.js'
    ]) {
      const response =
        await request(
          server.origin,
          requestPath
        );

      assert.equal(
        response.statusCode,
        200,
        requestPath
      );
      assert.equal(
        String(
          response.headers[
            'content-type'
          ]
        ),
        'application/javascript; charset=utf-8',
        requestPath
      );
      assert.equal(
        response.headers[
          'x-content-type-options'
        ],
        'nosniff',
        requestPath
      );
      assert.equal(
        response.headers[
          'cache-control'
        ],
        'no-store, max-age=0',
        requestPath
      );
    }
  } finally {
    await server.close();
  }
});


test('P04 assets de state/compat/bootstrap são servidos como JavaScript classic same-origin', async () => {
  const server =
    await startOfflineUiServer();

  try {
    for (const requestPath of [
      '/pdv/state/session-state.js',
      '/pdv/state/runtime-state.js',
      '/pdv/state/navigation-state.js',
      '/pdv/compat/legacy-globals.js',
      '/pdv/bootstrap.js'
    ]) {
      const response =
        await request(
          server.origin,
          requestPath
        );

      assert.equal(
        response.statusCode,
        200,
        requestPath
      );
      assert.equal(
        String(
          response.headers[
            'content-type'
          ]
        ),
        'application/javascript; charset=utf-8',
        requestPath
      );
      assert.equal(
        response.headers[
          'x-content-type-options'
        ],
        'nosniff',
        requestPath
      );
      assert.equal(
        response.headers[
          'cache-control'
        ],
        'no-store, max-age=0',
        requestPath
      );
    }
  } finally {
    await server.close();
  }
});


test('P05 assets shared/ui/styles são servidos com MIME correto e no-store', async () => {
  const server =
    await startOfflineUiServer();

  try {
    const cases = [
      [
        '/pdv/shared/values/ui-values.js',
        'application/javascript; charset=utf-8'
      ],
      [
        '/pdv/shared/helpers/text-format.js',
        'application/javascript; charset=utf-8'
      ],
      [
        '/pdv/ui/components/company-header.js',
        'application/javascript; charset=utf-8'
      ],
      [
        '/pdv/ui/components/connectivity-indicator.js',
        'application/javascript; charset=utf-8'
      ],
      [
        '/pdv/ui/navigation/access-guard.js',
        'application/javascript; charset=utf-8'
      ],
      [
        '/pdv/styles/base/layout-settle.css',
        'text/css; charset=utf-8'
      ],
      [
        '/pdv/styles/components/header-status.css',
        'text/css; charset=utf-8'
      ],
      [
        '/pdv/styles/components/access-menu.css',
        'text/css; charset=utf-8'
      ]
    ];

    for (const [
      requestPath,
      contentType
    ] of cases) {
      const response =
        await request(
          server.origin,
          requestPath
        );

      assert.equal(
        response.statusCode,
        200,
        requestPath
      );
      assert.equal(
        String(
          response.headers[
            'content-type'
          ]
        ),
        contentType,
        requestPath
      );
      assert.equal(
        response.headers[
          'cache-control'
        ],
        'no-store, max-age=0',
        requestPath
      );
      assert.equal(
        response.headers[
          'x-content-type-options'
        ],
        'nosniff',
        requestPath
      );
    }
  } finally {
    await server.close();
  }
});
