'use strict';

const http = require('http');

const LOOPBACK_HOST = '127.0.0.1';

function readRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Corpo HTTP de teste excedeu o limite.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function startLoopbackHttpServer(handler, options = {}) {
  if (typeof handler !== 'function') {
    throw new Error('handler HTTP de teste é obrigatório.');
  }

  const maxRequestBytes = Number(options.maxRequestBytes) > 0
    ? Number(options.maxRequestBytes)
    : 1024 * 1024;

  const server = http.createServer(async (req, res) => {
    try {
      const body = await readRequestBody(req, maxRequestBytes);
      await handler({ req, res, body });
    } catch (error) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json; charset=utf-8');
      }
      if (!res.writableEnded) {
        res.end(JSON.stringify({
          error: 'TEST_SERVER_ERROR',
          message: String(error && error.message || error)
        }));
      }
    }
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, LOOPBACK_HOST);
  });

  const address = server.address();
  const origin = `http://${LOOPBACK_HOST}:${address.port}`;

  return {
    server,
    host: LOOPBACK_HOST,
    port: address.port,
    origin,
    url(pathname = '/') {
      const suffix = String(pathname || '/');
      return origin + (suffix.startsWith('/') ? suffix : '/' + suffix);
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  };
}

module.exports = {
  LOOPBACK_HOST,
  startLoopbackHttpServer
};
