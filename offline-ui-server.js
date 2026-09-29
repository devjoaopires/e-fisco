'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const LOOPBACK_HOST = '127.0.0.1';
const PDV_ASSET_ROUTE_PREFIX = '/pdv/';
const PDV_ASSET_CONTENT_TYPES = Object.freeze({
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
});

function resolveOfflineUiFiles(options = {}) {
  const rootDir = path.resolve(
    options.rootDir || path.join(__dirname, 'offline-ui')
  );

  return {
    rootDir,
    shellPath: path.resolve(
      options.shellPath ||
        path.join(rootDir, 'offline-shell.html')
    ),
    pdvPath: path.resolve(
      options.pdvPath ||
        path.join(rootDir, 'pdv.html')
    ),
    pdvAssetsRoot: path.resolve(
      options.pdvAssetsRoot ||
        path.join(rootDir, 'pdv')
    ),
    html2canvasPath: path.resolve(
      options.html2canvasPath ||
        path.join(
          rootDir,
          'vendor',
          'html2canvas-1.4.1.min.js'
        )
    ),
    qrcodePath: path.resolve(
      options.qrcodePath ||
        path.join(
          rootDir,
          'vendor',
          'qrcodejs-1.0.0.min.js'
        )
    )
  };
}

function pathIsInsideRoot(rootDir, candidatePath) {
  const relative = path.relative(
    path.resolve(rootDir),
    path.resolve(candidatePath)
  );

  return (
    relative === '' ||
    (
      !relative.startsWith('..') &&
      !path.isAbsolute(relative)
    )
  );
}

function assertPathInsideRoot(rootDir, candidatePath, label) {
  if (!pathIsInsideRoot(rootDir, candidatePath)) {
    throw new Error(
      `${label} precisa ficar dentro do diretório offline-ui.`
    );
  }
}

function assertFileInsideRoot(rootDir, filePath, label) {
  assertPathInsideRoot(rootDir, filePath, label);

  if (
    !fs.existsSync(filePath) ||
    !fs.statSync(filePath).isFile()
  ) {
    throw new Error(
      `${label} não encontrado: ${filePath}`
    );
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
  res.setHeader(
    'Cache-Control',
    'no-store, max-age=0'
  );
  res.setHeader('Pragma', 'no-cache');
  res.setHeader(
    'X-Content-Type-Options',
    'nosniff'
  );
  res.setHeader(
    'Referrer-Policy',
    'no-referrer'
  );
  res.setHeader(
    'Content-Length',
    String(body.length)
  );

  if (method === 'HEAD') {
    res.end();
    return;
  }

  res.end(body);
}

function resolvePdvAsset(
  files,
  pathname
) {
  if (
    typeof pathname !== 'string' ||
    !pathname.startsWith(
      PDV_ASSET_ROUTE_PREFIX
    )
  ) {
    return null;
  }

  let decodedPathname;
  try {
    decodedPathname =
      decodeURIComponent(pathname);
  } catch (_) {
    return null;
  }

  if (
    !decodedPathname.startsWith(
      PDV_ASSET_ROUTE_PREFIX
    ) ||
    decodedPathname.includes('\0') ||
    decodedPathname.includes('\\')
  ) {
    return null;
  }

  const relativeUrlPath =
    decodedPathname.slice(
      PDV_ASSET_ROUTE_PREFIX.length
    );

  if (!relativeUrlPath) {
    return null;
  }

  const segments =
    relativeUrlPath.split('/');

  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..'
    )
  ) {
    return null;
  }

  const extension =
    path.extname(
      segments[segments.length - 1]
    ).toLowerCase();

  const contentType =
    PDV_ASSET_CONTENT_TYPES[extension];

  if (!contentType) {
    return null;
  }

  const candidatePath =
    path.resolve(
      files.pdvAssetsRoot,
      ...segments
    );

  if (
    !pathIsInsideRoot(
      files.pdvAssetsRoot,
      candidatePath
    )
  ) {
    return null;
  }

  if (
    !fs.existsSync(candidatePath) ||
    !fs.statSync(candidatePath).isFile()
  ) {
    return null;
  }

  if (
    !fs.existsSync(files.pdvAssetsRoot) ||
    !fs.statSync(files.pdvAssetsRoot)
      .isDirectory()
  ) {
    return null;
  }

  const realOfflineUiRoot =
    fs.realpathSync(
      files.rootDir
    );
  const realAssetsRoot =
    fs.realpathSync(
      files.pdvAssetsRoot
    );
  const realCandidatePath =
    fs.realpathSync(candidatePath);

  if (
    !pathIsInsideRoot(
      realOfflineUiRoot,
      realAssetsRoot
    ) ||
    !pathIsInsideRoot(
      realAssetsRoot,
      realCandidatePath
    )
  ) {
    return null;
  }

  return {
    filePath: realCandidatePath,
    contentType
  };
}

function startOfflineUiServer(options = {}) {
  const files = resolveOfflineUiFiles(options);

  assertFileInsideRoot(
    files.rootDir,
    files.shellPath,
    'offline-shell.html'
  );
  assertFileInsideRoot(
    files.rootDir,
    files.pdvPath,
    'pdv.html'
  );
  assertPathInsideRoot(
    files.rootDir,
    files.pdvAssetsRoot,
    'pdv assets root'
  );
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

  const server =
    http.createServer((req, res) => {
      const method =
        String(
          req.method || 'GET'
        ).toUpperCase();

      if (
        method !== 'GET' &&
        method !== 'HEAD'
      ) {
        res.statusCode = 405;
        res.setHeader(
          'Allow',
          'GET, HEAD'
        );
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

      if (
        pathname === '/' ||
        pathname === '/offline-shell.html'
      ) {
        writeStaticResponse(
          res,
          files.shellPath,
          method
        );
        return;
      }

      if (pathname === '/pdv.html') {
        writeStaticResponse(
          res,
          files.pdvPath,
          method
        );
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

      const pdvAsset =
        resolvePdvAsset(
          files,
          pathname
        );

      if (pdvAsset) {
        writeStaticResponse(
          res,
          pdvAsset.filePath,
          method,
          pdvAsset.contentType
        );
        return;
      }

      res.statusCode = 404;
      res.setHeader(
        'Cache-Control',
        'no-store'
      );
      res.end('Not Found');
    });

  return new Promise(
    (resolve, reject) => {
      const onError = (error) => {
        server.removeListener(
          'listening',
          onListening
        );
        reject(error);
      };

      const onListening = () => {
        server.removeListener(
          'error',
          onError
        );

        const address =
          server.address();

        if (
          !address ||
          typeof address === 'string'
        ) {
          server.close();
          reject(
            new Error(
              'Servidor offline não retornou porta TCP válida.'
            )
          );
          return;
        }

        const origin =
          `http://${LOOPBACK_HOST}:${address.port}`;

        resolve({
          host: LOOPBACK_HOST,
          port: address.port,
          origin,
          shellUrl:
            `${origin}/offline-shell.html`,
          pdvUrl:
            `${origin}/pdv.html`,
          isListening() {
            return (
              server.listening ===
              true
            );
          },
          close: () =>
            new Promise(
              (
                closeResolve,
                closeReject
              ) => {
                server.close(
                  (error) => {
                    if (error) {
                      closeReject(error);
                    } else {
                      closeResolve();
                    }
                  }
                );
              }
            )
        });
      };

      server.once(
        'error',
        onError
      );
      server.once(
        'listening',
        onListening
      );
      server.listen(
        0,
        LOOPBACK_HOST
      );
    }
  );
}

module.exports = {
  LOOPBACK_HOST,
  PDV_ASSET_ROUTE_PREFIX,
  PDV_ASSET_CONTENT_TYPES,
  resolveOfflineUiFiles,
  startOfflineUiServer
};
