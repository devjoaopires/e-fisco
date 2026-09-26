'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const LOOPBACK_HOST = '127.0.0.1';

function resolveOfflineUiFiles(options = {}) {
  const rootDir = path.resolve(
    options.rootDir || path.join(__dirname, 'offline-ui')
  );

  return {

    rootDir,

    shellPath: path.resolve(

      options.shellPath || path.join(rootDir, 'offline-shell.html')

    ),

    pdvPath: path.resolve(

      options.pdvPath || path.join(rootDir, 'pdv.html')

    ),

    html2canvasPath: path.resolve(

      options.html2canvasPath ||

      path.join(rootDir, 'vendor', 'html2canvas-1.4.1.min.js')

    ),

    qrcodePath: path.resolve(

      options.qrcodePath ||

      path.join(rootDir, 'vendor', 'qrcodejs-1.0.0.min.js')

    )

  };
}

function assertFileInsideRoot(rootDir, filePath, label) {
  const relative = path.relative(rootDir, filePath);
  if (
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${label} precisa ficar dentro do diretório offline-ui.`);
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${label} não encontrado: ${filePath}`);
  }
}

function writeStaticResponse(

  res,

  filePath,

  method,

  contentType = 'text/html; charset=utf-8'

) {

  const body = fs.readFileSync(filePath);

  res.statusCode = 200;

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Length', String(body.length));

  if (method === 'HEAD') {
    res.end();
    return;
  }

  res.end(body);
}

function startOfflineUiServer(options = {}) {
  const files = resolveOfflineUiFiles(options);
  assertFileInsideRoot(files.rootDir, files.shellPath, 'offline-shell.html');

  assertFileInsideRoot(files.rootDir, files.pdvPath, 'pdv.html');

  assertFileInsideRoot(

    files.rootDir,

    files.html2canvasPath,

    'vendor/html2canvas-1.4.1.min.js'

  );

  assertFileInsideRoot(

    files.rootDir,

    files.qrcodePath,

    'vendor/qrcodejs-1.0.0.min.js'

  );

  const server = http.createServer((req, res) => {
    const method = String(req.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, HEAD');
      res.end('Method Not Allowed');
      return;
    }

    let pathname = '/';
    try {
      pathname = new URL(
        req.url || '/',
        `http://${LOOPBACK_HOST}`
      ).pathname;
    } catch (_) {
      res.statusCode = 400;
      res.end('Bad Request');
      return;
    }

    if (pathname === '/' || pathname === '/offline-shell.html') {
      writeStaticResponse(res, files.shellPath, method);
      return;
    }

    if (pathname === '/pdv.html') {

      writeStaticResponse(res, files.pdvPath, method);

      return;

    }



    if (

      pathname ===

        '/vendor/html2canvas-1.4.1.min.js'

    ) {

      writeStaticResponse(

        res,

        files.html2canvasPath,

        method,

        'application/javascript; charset=utf-8'

      );

      return;

    }

    if (

      pathname ===

        '/vendor/qrcodejs-1.0.0.min.js'

    ) {

      writeStaticResponse(

        res,

        files.qrcodePath,

        method,

        'application/javascript; charset=utf-8'

      );

      return;

    }



    res.statusCode = 404;
    res.setHeader('Cache-Control', 'no-store');
    res.end('Not Found');
  });

  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener('listening', onListening);
      reject(error);
    };

    const onListening = () => {
      server.removeListener('error', onError);
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Servidor offline não retornou porta TCP válida.'));
        return;
      }

      const origin = `http://${LOOPBACK_HOST}:${address.port}`;
      resolve({
        host: LOOPBACK_HOST,
        port: address.port,
        origin,
        shellUrl: `${origin}/offline-shell.html`,
        pdvUrl: `${origin}/pdv.html`,
        close: () => new Promise((closeResolve, closeReject) => {
          server.close((error) => {
            if (error) closeReject(error);
            else closeResolve();
          });
        })
      });
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, LOOPBACK_HOST);
  });
}

module.exports = {
  LOOPBACK_HOST,
  resolveOfflineUiFiles,
  startOfflineUiServer
};
