'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..', '..');
const MAIN = fs.readFileSync(
  path.join(ROOT, 'main.js'),
  'utf8'
);
const SHELL = fs.readFileSync(
  path.join(ROOT, 'offline-ui', 'offline-shell.html'),
  'utf8'
);
const PDV = fs.readFileSync(
  path.join(ROOT, 'offline-ui', 'pdv.html'),
  'utf8'
);

function pdvProtocolSurface() {
  const pdvRoot =
    path.join(
      ROOT,
      'offline-ui',
      'pdv'
    );
  const sources = [PDV];

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

      if (
        entry.isDirectory()
      ) {
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

const PDV_PROTOCOL_SURFACE =
  pdvProtocolSurface();
const FRAME_PRINT_BRIDGE_SOURCE = fs.readFileSync(
  path.join(
    ROOT,
    'printing',
    'frame-print-bridge.js'
  ),
  'utf8'
);
const {
  createFramePrintBridge
} = require('../../printing/frame-print-bridge');

const OFFLINE_SHELL_SCF_CONTRACT = Object.freeze([
  'SCF_CAIXA_ABERTO',
  'SCF_CAIXA_ABERTURA_ERRO',
  'SCF_CAIXA_CONSULTA_ERRO',
  'SCF_CAIXA_CONSULTA_RESULTADO',
  'SCF_CAIXA_FECHADO',
  'SCF_CAIXA_FECHAMENTO_ERRO',
  'SCF_CAIXA_MOVIMENTO_ERRO',
  'SCF_CAIXA_MOVIMENTO_REGISTRADO',
  'SCF_CLIENTES_LISTA_ERRO',
  'SCF_CLIENTES_LISTA_RESULTADO',
  'SCF_CLIENTES_LISTAR',
  'SCF_CREDIARIO_ABERTO',
  'SCF_CREDIARIO_ABERTURA_ERRO',
  'SCF_CREDIARIO_ABRIR',
  'SCF_CREDIARIO_ATUALIZAR_ITENS',
  'SCF_CREDIARIO_DETALHE_ERRO',
  'SCF_CREDIARIO_DETALHE_RESULTADO',
  'SCF_CREDIARIO_ITENS_ATUALIZACAO_ERRO',
  'SCF_CREDIARIO_ITENS_ATUALIZADOS',
  'SCF_CREDIARIO_LISTA_ERRO',
  'SCF_CREDIARIO_LISTA_RESULTADO',
  'SCF_CREDIARIO_LISTAR',
  'SCF_CREDIARIO_OBTER',
  'SCF_EMPRESA_CABECALHO_RESULTADO',
  'SCF_EMPRESA_CABECALHO_SOLICITAR',
  'SCF_ESTOQUE_LISTAR_RESULTADO',
  'SCF_ESTOQUE_LISTAR_SOLICITAR',
  'SCF_FINANCEIRO_SALDO_DADOS_ERRO',
  'SCF_FINANCEIRO_SALDO_DADOS_RESULTADO',
  'SCF_FINANCEIRO_SALDO_DADOS_SOLICITAR',
  'SCF_HTML_READY',
  'SCF_NFCE_COMPROVANTE_CONTINGENCIA',
  'SCF_NFCE_COMPROVANTE_CONTINGENCIA_ERRO',
  'SCF_NFCE_COMPROVANTE_CONTINGENCIA_SOLICITAR',
  'SCF_NFCE_EMISSAO_CONTINGENCIA',
  'SCF_NFCE_NUMERACAO_ERRO',
  'SCF_NFCE_NUMERACAO_RESULTADO',
  'SCF_NFCE_NUMERACAO_SOLICITAR',
  'SCF_PRODUTO_FISCAL_VENDA_BUSCAR',
  'SCF_PRODUTO_FISCAL_VENDA_ERRO',
  'SCF_PRODUTO_FISCAL_VENDA_RESULTADO',
  'SCF_VENDA_ERRO',
  'SCF_VENDA_INTERNA_REGISTRADA',
  'SCF_VENDA_OFFLINE_REGISTRADA',
  'SCF_VENDA_PAGA'
]);

function quotedScfNames(source) {
  const names = new Set();
  const pattern = /['"`](SCF_[A-Z0-9_]+)['"`]/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    names.add(match[1]);
  }

  return [...names].sort();
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(
    start,
    -1,
    'Marcador inicial não encontrado: ' + startMarker
  );

  const end = source.indexOf(endMarker, start);
  assert.notEqual(
    end,
    -1,
    'Marcador final não encontrado: ' + endMarker
  );

  return source.slice(start, end);
}

async function buildTopPrintBridgeHarness() {
  const generated = [];
  const logs = [];

  const mainWindow = {
    isDestroyed() {
      return false;
    },
    webContents: {
      async executeJavaScript(code) {
        generated.push(code);
        return true;
      }
    }
  };

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
        return null;
      },
      async findTrustedPdvFrame() {
        return {
          origin:
            'https://pdv.example.test'
        };
      },
      async isTrustedPdvFrameForContents() {
        return true;
      },
      sanitizeNavigationUrlForLog(value) {
        return String(value || '');
      },
      async processFiscalCounterRequest() {},
      async respondFiscalCounterError() {},
      async enqueuePrint() {
        return {
          ok: true
        };
      },
      log(...args) {
        logs.push(args);
      }
    });

  await bridge.installTopPrintBridge();
  assert.equal(generated.length, 1);

  const listeners = new Map();
  const printCalls = [];
  const timerCallbacks = [];
  const timerDelays = [];

  const runtimeWindow = {
    __efiscoTopPrintBridgeInstalled: false,
    efiscoDesktop: {
      async printNfce80(payload) {
        printCalls.push(payload);
        return {
          ok: true,
          printed: true
        };
      }
    },
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
    setTimeout(callback, delay) {
      timerCallbacks.push(callback);
      timerDelays.push(delay);
      return timerCallbacks.length;
    }
  };

  const runtimeSandbox = {
    window: runtimeWindow,
    Date,
    String,
    Object,
    Promise,
    Map,
    console
  };

  vm.createContext(runtimeSandbox);
  vm.runInContext(
    generated[0],
    runtimeSandbox
  );

  return {
    listener:
      listeners.get('message'),
    printCalls,
    timerCallbacks,
    timerDelays,
    trustedOrigin:
      'https://pdv.example.test'
  };
}

test('protocolo SCF do shell offline permanece exatamente com os 45 nomes congelados', () => {
  assert.deepEqual(
    quotedScfNames(SHELL),
    [...OFFLINE_SHELL_SCF_CONTRACT].sort()
  );
});

test('44 mensagens SCF do shell continuam compartilhadas com o PDV e o único shell-only é erro de numeração', () => {
  const shellNames = quotedScfNames(SHELL);
  const pdvNames = new Set(
    quotedScfNames(
      PDV_PROTOCOL_SURFACE
    )
  );
  const shared = shellNames.filter((name) => pdvNames.has(name));
  const shellOnly = shellNames.filter((name) => !pdvNames.has(name));

  assert.equal(shared.length, 44);
  assert.deepEqual(
    shellOnly,
    ['SCF_NFCE_NUMERACAO_ERRO']
  );
});

test('shell aceita mensagens do PDV somente com source e origin exatos', () => {
  const guard = sliceBetween(
    SHELL,
    'function isPdvMessage(event)',
    'function focarPdvOffline()'
  );
  const listener = sliceBetween(
    SHELL,
    "window.addEventListener('message', async function (event) {",
    '/* Mensagens desconhecidas não são encaminhadas por padrão. */'
  );

  assert.match(
    guard,
    /event\.source\s*===\s*iframe\.contentWindow/
  );
  assert.match(
    guard,
    /event\.origin\s*===\s*origin/
  );
  assert.match(
    listener,
    /if \(!isPdvMessage\(event\)\) return;/
  );
});

test('respostas críticas SCF preservam requestId e shapes fiscais essenciais', () => {
  assert.match(
    SHELL,
    /SCF_PRODUTO_FISCAL_VENDA_RESULTADO['"][\s\S]{0,180}requestId/
  );
  assert.match(
    SHELL,
    /SCF_CREDIARIO_DETALHE_RESULTADO['"][\s\S]{0,220}requestId/
  );
  assert.match(
    SHELL,
    /SCF_FINANCEIRO_SALDO_DADOS_RESULTADO['"][\s\S]{0,180}requestId/
  );
  assert.match(
    SHELL,
    /SCF_NFCE_NUMERACAO_RESULTADO['"][\s\S]{0,700}proximoNumeroNfceProducao/
  );
  assert.match(
    SHELL,
    /SCF_VENDA_OFFLINE_REGISTRADA['"][\s\S]{0,700}syncPendente/
  );
  assert.match(
    SHELL,
    /SCF_NFCE_EMISSAO_CONTINGENCIA['"][\s\S]{0,900}numeroIncrementado/
  );
});

test('ponte TOP de impressão deduplica requestId e responde somente ao origin pinado', async () => {
  const harness = await buildTopPrintBridgeHarness();
  assert.equal(typeof harness.listener, 'function');

  const replies = [];
  const source = {
    postMessage(message, targetOrigin) {
      replies.push({
        message,
        targetOrigin
      });
    }
  };

  const payload = {
    nativeReceipt: {
      lines: ['teste']
    }
  };

  await harness.listener({
    origin: harness.trustedOrigin,
    source,
    data: {
      type: 'SCF_EFISCO_IMPRIMIR_NFCE_LOCAL',
      requestId: 'print-1',
      payload
    }
  });

  await harness.listener({
    origin: harness.trustedOrigin,
    source,
    data: {
      type: 'SCF_EFISCO_IMPRIMIR_NFCE_LOCAL',
      requestId: 'print-1',
      payload
    }
  });

  await harness.listener({
    origin: 'https://evil.example.test',
    source,
    data: {
      type: 'SCF_EFISCO_IMPRIMIR_NFCE_LOCAL',
      requestId: 'print-evil',
      payload
    }
  });

  await harness.listener({
    origin: harness.trustedOrigin,
    source,
    data: {
      type: 'SCF_EFISCO_IMPRIMIR_NFCE_LOCAL',
      requestId: 'print-2',
      payload
    }
  });

  assert.equal(harness.printCalls.length, 2);
  assert.equal(replies.length, 2);
  assert.deepEqual(
    replies.map((item) => item.targetOrigin),
    [
      harness.trustedOrigin,
      harness.trustedOrigin
    ]
  );
  assert.deepEqual(
    replies.map((item) => item.message.requestId),
    ['print-1', 'print-2']
  );
  assert.equal(harness.timerCallbacks.length, 2);
  assert.deepEqual(
    harness.timerDelays,
    [60000, 60000]
  );

  harness.timerCallbacks[0]();

  await harness.listener({
    origin: harness.trustedOrigin,
    source,
    data: {
      type: 'SCF_EFISCO_IMPRIMIR_NFCE_LOCAL',
      requestId: 'print-1',
      payload
    }
  });

  assert.equal(harness.printCalls.length, 3);
  assert.equal(replies.length, 3);
});

test('canal console-frame exige frame confiável e consome payload de impressão uma única vez', () => {
  const block =
    FRAME_PRINT_BRIDGE_SOURCE;

  assert.match(
    block,
    /await isTrustedPdvFrameForContents\(/
  );
  assert.match(
    block,
    /FRAME BRIDGE DENIED/
  );
  assert.match(
    block,
    /__scfElectronPendingPrintPayload/
  );
  assert.match(
    block,
    /janelaPayload\.__scfElectronPendingPrintPayload\s*=\s*null/
  );

  const clearAt = block.indexOf(
    'janelaPayload.__scfElectronPendingPrintPayload'
  );
  const enqueueAt = block.indexOf(
    'await enqueuePrint('
  );

  assert.ok(clearAt >= 0);
  assert.ok(enqueueAt > clearAt);
});
