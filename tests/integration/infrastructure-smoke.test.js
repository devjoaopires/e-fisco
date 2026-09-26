'use strict';

const fs = require('fs');
const http = require('http');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  withTempDir
} = require('../helpers/temp-dir');

const {
  createFakeSafeStorage
} = require('../helpers/fake-safe-storage');

const {
  LOOPBACK_HOST,
  startLoopbackHttpServer
} = require('../helpers/loopback-http-server');

function getText(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      const chunks = [];

      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });

    request.on('error', reject);
  });
}

test('helpers de integração funcionam sem acessar recursos reais do usuário', async () => {
  await withTempDir(async (dir) => {
    assert.equal(fs.existsSync(dir), true);

    const marker = dir + '\\smoke.txt';
    fs.writeFileSync(marker, 'ok', 'utf8');
    assert.equal(fs.readFileSync(marker, 'utf8'), 'ok');
  }, 'efisco-smoke-');

  const safeStorage = createFakeSafeStorage();
  const encrypted = safeStorage.encryptString('smoke-secret');

  assert.equal(Buffer.isBuffer(encrypted), true);
  assert.equal(safeStorage.decryptString(encrypted), 'smoke-secret');

  const server = await startLoopbackHttpServer(async ({ req, res }) => {
    assert.equal(req.method, 'GET');
    res.statusCode = 200;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end('loopback-ok');
  });

  try {
    assert.equal(server.host, LOOPBACK_HOST);
    assert.equal(server.host, '127.0.0.1');

    const response = await getText(server.url('/smoke'));

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, 'loopback-ok');
  } finally {
    await server.close();
  }
});
