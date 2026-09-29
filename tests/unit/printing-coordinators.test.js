'use strict';

const { EventEmitter } = require('node:events');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createWindowsPrintDriver
} = require('../../printing/windows-driver');

const {
  createPrintQueue
} = require('../../printing/print-queue');

const {
  createFramePrintBridge
} = require('../../printing/frame-print-bridge');

function fakeProcess({
  stdout = '',
  stderr = '',
  code = 0
} = {}) {
  const child =
    new EventEmitter();

  child.stdout =
    new EventEmitter();

  child.stderr =
    new EventEmitter();

  queueMicrotask(() => {
    if (stdout) {
      child.stdout.emit(
        'data',
        stdout
      );
    }

    if (stderr) {
      child.stderr.emit(
        'data',
        stderr
      );
    }

    child.emit(
      'close',
      code
    );
  });

  return child;
}

test('windows driver preserva recibo estruturado e imagem fallback', () => {
  const driver =
    createWindowsPrintDriver({
      fs: {},
      path: {},
      crypto: {},
      spawn() {},
      printerName:
        'IMPRESSORA FISCAL',
      helperPath:
        'C:\\app\\print-driver-nfce.ps1',
      tempDir:
        'C:\\temp'
    });

  const native =
    driver.validatePayload({
      origem: 'NFCE',
      saleId: 'S-1',
      nativeReceipt: {
        lines: [
          'A',
          'B'
        ]
      }
    });

  assert.equal(
    native.mode,
    'NATIVE_TEXT_QR'
  );
  assert.equal(
    native.extension,
    'json'
  );
  assert.equal(
    native.buffer.toString('utf8'),
    JSON.stringify({
      lines: [
        'A',
        'B'
      ]
    })
  );

  const image =
    driver.validatePayload({
      imageBase64:
        'data:image/png;base64,SGVsbG8='
    });

  assert.equal(
    image.mode,
    'IMAGE_FALLBACK'
  );
  assert.equal(
    image.extension,
    'png'
  );
  assert.equal(
    image.buffer.toString('utf8'),
    'Hello'
  );
});

test('windows driver rejeita payload sem recibo nem imagem válida', () => {
  const driver =
    createWindowsPrintDriver({
      fs: {},
      path: {},
      crypto: {},
      spawn() {},
      printerName: 'P',
      helperPath: 'H',
      tempDir: 'T'
    });

  assert.throws(
    () =>
      driver.validatePayload({
        imageBase64:
          'javascript:alert(1)'
      }),
    /Payload sem recibo estruturado/
  );
});

test('windows driver usa helper injetado, impressora fixa e DataPath no modo nativo', async () => {
  const spawns = [];

  const driver =
    createWindowsPrintDriver({
      fs: {},
      path: {},
      crypto: {},
      spawn(command, args, options) {
        spawns.push({
          command,
          args,
          options
        });

        return fakeProcess({
          stdout: 'PRINTED\r\n'
        });
      },
      printerName:
        'IMPRESSORA FISCAL',
      helperPath:
        'C:\\resolved\\print-driver-nfce.ps1',
      tempDir:
        'C:\\temp'
    });

  const result =
    await driver.executePowerShell(
      'C:\\temp\\cupom.json',
      'NATIVE_TEXT_QR'
    );

  assert.equal(
    result,
    'PRINTED'
  );

  assert.deepEqual(
    spawns[0].args,
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      'C:\\resolved\\print-driver-nfce.ps1',
      '-PrinterName',
      'IMPRESSORA FISCAL',
      '-DataPath',
      'C:\\temp\\cupom.json'
    ]
  );

  assert.equal(
    spawns[0].options
      .windowsHide,
    true
  );
});

test('windows driver remove arquivo temporário mesmo após erro do PowerShell', async () => {
  const writes = [];
  const deletes = [];

  const driver =
    createWindowsPrintDriver({
      fs: {
        writeFileSync(
          file,
          buffer
        ) {
          writes.push({
            file,
            buffer:
              Buffer.from(buffer)
          });
        },
        unlinkSync(file) {
          deletes.push(file);
        }
      },
      path: {
        join(...parts) {
          return parts.join('/');
        }
      },
      crypto: {
        randomBytes() {
          return Buffer.from(
            '01020304',
            'hex'
          );
        }
      },
      spawn() {
        return fakeProcess({
          stderr:
            'driver falhou',
          code: 1
        });
      },
      printerName:
        'IMPRESSORA FISCAL',
      helperPath:
        'C:/app/driver.ps1',
      tempDir:
        'C:/temp',
      now() {
        return 123;
      }
    });

  await assert.rejects(
    driver.print({
      nativeReceipt: {
        lines: ['cupom']
      }
    }),
    /driver falhou/
  );

  assert.equal(
    writes.length,
    1
  );
  assert.deepEqual(
    deletes,
    [
      writes[0].file
    ]
  );
});

test('print queue serializa jobs e inicia o segundo somente após o primeiro', async () => {
  const started = [];
  const resolvers = [];

  const queue =
    createPrintQueue({
      print(payload) {
        started.push(
          payload.id
        );

        return new Promise(
          (resolve) => {
            resolvers.push(
              resolve
            );
          }
        );
      }
    });

  const first =
    queue.enqueue({
      id: 'A'
    });

  const second =
    queue.enqueue({
      id: 'B'
    });

  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(
    started,
    ['A']
  );

  resolvers.shift()({
    ok: true,
    id: 'A'
  });

  assert.equal(
    (await first).id,
    'A'
  );

  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(
    started,
    ['A', 'B']
  );

  resolvers.shift()({
    ok: true,
    id: 'B'
  });

  assert.equal(
    (await second).id,
    'B'
  );
});

test('print queue continua após falha anterior e registra erro uma vez', async () => {
  const logs = [];
  let call = 0;

  const queue =
    createPrintQueue({
      async print(payload) {
        call += 1;

        if (call === 1) {
          throw new Error(
            'falha A'
          );
        }

        return {
          ok: true,
          payload
        };
      },
      log(...args) {
        logs.push(args);
      }
    });

  await assert.rejects(
    queue.enqueue({
      id: 'A'
    }),
    /falha A/
  );

  const second =
    await queue.enqueue({
      id: 'B'
    });

  assert.equal(
    second.ok,
    true
  );
  assert.equal(
    logs.filter(
      item =>
        item[0] === 'ERRO'
    ).length,
    1
  );
});

function frameBridgeHarness({
  trusted = true,
  offline = false
} = {}) {
  const listeners = new Map();
  const enqueued = [];
  const logs = [];
  const fiscal = [];
  const fiscalErrors = [];
  const scripts = [];

  const frame = {
    url:
      'https://pdv.example.test/pdv',
    origin:
      'https://pdv.example.test',
    isDestroyed() {
      return false;
    },
    async executeJavaScript(
      code
    ) {
      scripts.push(code);

      return {
        nativeReceipt: {
          lines: [
            'teste'
          ]
        },
        imageBase64: '',
        origem: 'NFCE',
        saleId: 'SALE-1'
      };
    }
  };

  const contents = {
    isDestroyed() {
      return false;
    },
    on(type, callback) {
      listeners.set(
        type,
        callback
      );
    },
    async executeJavaScript(
      code
    ) {
      scripts.push(code);

      return {
        nativeReceipt: {
          lines: [
            'offline'
          ]
        },
        imageBase64: '',
        origem: 'NFCE',
        saleId: 'SALE-OFF'
      };
    }
  };

  const mainWindow = {
    isDestroyed() {
      return false;
    },
    webContents:
      offline
        ? {
            isDestroyed() {
              return false;
            }
          }
        : contents
  };

  const offlineView =
    offline
      ? {
          webContents:
            contents
        }
      : null;

  const bridge =
    createFramePrintBridge({
      markers: {
        onlineNfceNumberResponse:
          '__ONLINE__',
        nfceCounter:
          '__COUNTER__',
        contingencyPrintDiag:
          '__DIAG__',
        print:
          '__PRINT__'
      },
      getMainWindow() {
        return mainWindow;
      },
      getOfflineView() {
        return offlineView;
      },
      async findTrustedPdvFrame() {
        return frame;
      },
      async isTrustedPdvFrameForContents() {
        return trusted;
      },
      sanitizeNavigationUrlForLog(value) {
        return String(value || '')
          .split('?')[0];
      },
      async processFiscalCounterRequest(
        actualFrame,
        requestId
      ) {
        fiscal.push({
          actualFrame,
          requestId
        });
      },
      async respondFiscalCounterError(
        actualFrame,
        requestId,
        error
      ) {
        fiscalErrors.push({
          actualFrame,
          requestId,
          error
        });
      },
      async enqueuePrint(payload) {
        enqueued.push(payload);
        return {
          ok: true
        };
      },
      log(...args) {
        logs.push(args);
      }
    });

  bridge.installConsoleFrameChannel(
    offline
      ? contents
      : null
  );

  return {
    listener:
      listeners.get(
        'console-message'
      ),
    frame,
    contents,
    enqueued,
    logs,
    fiscal,
    fiscalErrors,
    scripts
  };
}

test('frame print bridge nega marker privilegiado antes de obter payload', async () => {
  const h =
    frameBridgeHarness({
      trusted: false
    });

  await h.listener({
    message:
      '__PRINT__REQ-1',
    frame:
      h.frame,
    sourceId:
      'pdv'
  });

  assert.equal(
    h.enqueued.length,
    0
  );
  assert.equal(
    h.scripts.length,
    0
  );
  assert.equal(
    h.logs.some(
      item =>
        item[0] ===
          'FRAME BRIDGE DENIED'
    ),
    true
  );
});

test('frame print bridge online obtém payload one-shot antes de enfileirar', async () => {
  const h =
    frameBridgeHarness();

  await h.listener({
    message:
      '__PRINT__REQ-2',
    frame:
      h.frame,
    sourceId:
      'pdv'
  });

  assert.equal(
    h.enqueued.length,
    1
  );
  assert.equal(
    h.enqueued[0].saleId,
    'SALE-1'
  );

  const source =
    h.scripts[0];

  const clearAt =
    source.indexOf(
      'janelaPayload.__scfElectronPendingPrintPayload'
    );

  const nullAt =
    source.indexOf(
      '=\n              null'
    );

  assert.ok(
    clearAt >= 0
  );
  assert.ok(
    nullAt > clearAt
  );
});

test('frame print bridge offline usa WebContents da offlineView e mantém o mesmo owner de fila', async () => {
  const h =
    frameBridgeHarness({
      offline: true
    });

  await h.listener({
    message:
      '__PRINT__REQ-OFF',
    frame:
      h.frame,
    sourceId:
      'offline'
  });

  assert.equal(
    h.enqueued.length,
    1
  );
  assert.equal(
    h.enqueued[0].saleId,
    'SALE-OFF'
  );
});

test('frame bridge delega contador fiscal pelo mesmo listener privilegiado', async () => {
  const h =
    frameBridgeHarness();

  await h.listener({
    message:
      '__COUNTER__REQ-FISCAL',
    frame:
      h.frame
  });

  assert.equal(
    h.fiscal.length,
    1
  );
  assert.equal(
    h.fiscal[0].requestId,
    'REQ-FISCAL'
  );
  assert.equal(
    h.enqueued.length,
    0
  );
});


test('composition root mantém owner único de driver, fila e frame bridge com helper path injetado', () => {
  const fs =
    require('node:fs');
  const path =
    require('node:path');
  const root =
    path.resolve(
      __dirname,
      '..',
      '..'
    );
  const source =
    fs.readFileSync(
      path.join(root, 'main.js'),
      'utf8'
    );

  assert.equal(
    (source.match(/createWindowsPrintDriver\(\{/g) || []).length,
    1
  );
  assert.equal(
    (source.match(/createPrintQueue\(\{/g) || []).length,
    1
  );
  assert.equal(
    (source.match(/createFramePrintBridge\(\{/g) || []).length,
    1
  );
  assert.match(
    source,
    /helperPath:\s*RUNTIME_PATHS\.printDriverPath/
  );
});

test('frame bridge contém dedupe explícito de 60 segundos e payload one-shot antes da fila', () => {
  const fs =
    require('node:fs');
  const path =
    require('node:path');
  const source =
    fs.readFileSync(
      path.resolve(
        __dirname,
        '..',
        '..',
        'printing',
        'frame-print-bridge.js'
      ),
      'utf8'
    );

  assert.match(
    source,
    /processados\.set\([\s\S]*Date\.now\(\)[\s\S]*window\.setTimeout\([\s\S]*processados\.delete\([\s\S]*60000/
  );

  const clearAt =
    source.indexOf(
      'janelaPayload.__scfElectronPendingPrintPayload ='
    );
  const enqueueAt =
    source.indexOf(
      'await enqueuePrint('
    );

  assert.ok(clearAt >= 0);
  assert.ok(enqueueAt > clearAt);
});
