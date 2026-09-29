'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const navigationPolicyModule =
  require('../../desktop/security/navigation-policy');
const ipcAuthorizationModule =
  require('../../desktop/security/ipc-authorization');

const ROOT = path.resolve(__dirname, '..', '..');
const MAIN_SOURCE = fs.readFileSync(
  path.join(ROOT, 'main.js'),
  'utf8'
);

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(
    start,
    -1,
    `Marcador inicial não encontrado: ${startMarker}`
  );

  const end = source.indexOf(endMarker, start);
  assert.notEqual(
    end,
    -1,
    `Marcador final não encontrado: ${endMarker}`
  );

  return source.slice(start, end);
}

function ipcHandleBlock(
  channel,
  nextChannel,
  options = {}
) {
  const channelMarker =
    "'" + channel + "'";

  const installStart =
    MAIN_SOURCE.indexOf(
      'function instalarIpc()'
    );

  assert.notEqual(
    installStart,
    -1,
    'instalarIpc não encontrado'
  );

  const channelPos =
    MAIN_SOURCE.indexOf(
      channelMarker,
      installStart
    );

  assert.notEqual(
    channelPos,
    -1,
    'Canal IPC não encontrado: ' + channel
  );

  const start =
    MAIN_SOURCE.lastIndexOf(
      'ipcMain.handle(',
      channelPos
    );

  assert.notEqual(
    start,
    -1,
    'ipcMain.handle não encontrado: ' + channel
  );

  const nextMarker =
    options.rawNextMarker === true
      ? nextChannel
      : "'" + nextChannel + "'";

  const nextPos =
    MAIN_SOURCE.indexOf(
      nextMarker,
      channelPos + channelMarker.length
    );

  assert.notEqual(
    nextPos,
    -1,
    'Próximo marcador IPC não encontrado: ' + nextChannel
  );

  const end =
    options.rawNextMarker === true
      ? nextPos
      : MAIN_SOURCE.lastIndexOf(
          'ipcMain.handle(',
          nextPos
        );

  assert.ok(
    end > start,
    'Fim do bloco IPC inválido: ' + channel
  );

  return MAIN_SOURCE.slice(start, end);
}

function makeFrame({
  url,
  origin,
  processId,
  routingId
}) {
  const frame = {
    url,
    origin,
    processId,
    routingId,
    detached: false,
    parent: null,
    top: null,
    isDestroyed() {
      return false;
    }
  };

  frame.top = frame;
  return frame;
}

function buildHarness() {
  const handlers = new Map();
  const logs = [];
  const calls = {
    enqueue: [],
    validateLogin: [],
    applyProfile: [],
    setSession: [],
    setShellAuth: [],
    resize: 0,
    shortcuts: 0
  };

  const mainFrame = makeFrame({
    url: 'https://plataforma.e-fisco.app/',
    origin: 'https://plataforma.e-fisco.app',
    processId: 101,
    routingId: 201
  });

  const offlineFrame = makeFrame({
    url: 'http://127.0.0.1:54321/offline-shell.html',
    origin: 'http://127.0.0.1:54321',
    processId: 102,
    routingId: 202
  });

  const mainWebContents = {
    id: 11,
    mainFrame,
    isDestroyed() {
      return false;
    }
  };

  const offlineWebContents = {
    id: 22,
    mainFrame: offlineFrame,
    isDestroyed() {
      return false;
    }
  };

  const sandbox = {
    URL,
    navigationPolicyModule,
    ipcAuthorizationModule,
    Object,
    String,
    Number,
    Promise,

    mainWindow: {
      webContents: mainWebContents,
      isDestroyed() {
        return false;
      }
    },

    offlineView: {
      webContents: offlineWebContents
    },

    ipcMain: {
      handle(channel, callback) {
        handlers.set(channel, callback);
      }
    },

    offlineUiMode: 'OFFLINE',

    log(...args) {
      logs.push(args);
    },

    offlineLoginRetryAfterMs() {
      return 0;
    },

    registerOfflineLoginFailure() {
      return 1000;
    },

    resetOfflineLoginBackoff() {},

    validateOfflineOperatorPasswordAcrossPreparedCompanies(payload) {
      calls.validateLogin.push(payload);

      return {
        success: true,
        empresaId: 'empresa-1',
        operadorId: 'operador-1',
        nomeOperador: 'Operador Teste',
        perfil: 'CAIXA',
        acessoTotal: false
      };
    },

    async applyOfflineOperatorProfile(validated) {
      calls.applyProfile.push(validated);
      return true;
    },

    setOfflineAuthenticatedOperator(validated) {
      calls.setSession.push(validated);

      return {
        empresaId: validated.empresaId,
        operadorId: validated.operadorId,
        nomeOperador: validated.nomeOperador,
        perfil: validated.perfil,
        acessoTotal: validated.acessoTotal === true
      };
    },

    async setOfflineShellAuthenticationState(session) {
      calls.setShellAuth.push(session);
    },

    resizeOfflineOverlay() {
      calls.resize += 1;
    },

    syncOfflineFunctionShortcuts() {
      calls.shortcuts += 1;
    },

    async enfileirar(payload) {
      calls.enqueue.push(payload);

      return {
        ok: true,
        queued: true,
        payload
      };
    }
  };

  vm.createContext(sandbox);

  const parserBlock = sliceBetween(
    MAIN_SOURCE,
    'const URL_E_FISCO =',
    'const PRINTER_NAME ='
  );

  const originBlock =
    'let offlineUiServer = null;\n' +
    sliceBetween(
      MAIN_SOURCE,
      'const NAVIGATION_POLICY_CONTEXT =',
      'const MAIN_WINDOW_NAVIGATION_POLICY'
    );

  const ipcPolicyBlock = sliceBetween(
    MAIN_SOURCE,
    'const IPC_SENDER_SCOPE =',
    'function instalarIpc()'
  );

  const authBlock = sliceBetween(
    MAIN_SOURCE,
    'function resolveAuthorizedIpcSender(event)',
    'function offlineOverlayBounds()'
  );

  const loginBlock =
    ipcHandleBlock(
      'efisco:offline-operator-login',
      'efisco:print-nfce-windows-driver'
    );

  const printBlock =
    ipcHandleBlock(
      'efisco:print-nfce-windows-driver',
      'registerOfflineReadHandlers({',
      {
        rawNextMarker: true
      }
    );

  vm.runInContext(
    parserBlock +
      '\n' +
      originBlock +
      '\n' +
      ipcPolicyBlock +
      '\n' +
      'offlineUiServer = { origin: "http://127.0.0.1:54321" };\n' +
      authBlock +
      '\n' +
      loginBlock +
      '\n' +
      printBlock +
      '\n' +
      `globalThis.__api = {
        isIpcChannelAuthorized,
        isOnlineOriginAllowed,
        isOfflineOriginAllowed
      };`,
    sandbox
  );

  return {
    api: sandbox.__api,
    handlers,
    calls,
    logs,
    mainFrame,
    offlineFrame,
    mainWebContents,
    offlineWebContents,
    mainEvent: {
      sender: mainWebContents,
      senderFrame: mainFrame,
      processId: mainFrame.processId,
      frameId: mainFrame.routingId
    },
    offlineEvent: {
      sender: offlineWebContents,
      senderFrame: offlineFrame,
      processId: offlineFrame.processId,
      frameId: offlineFrame.routingId
    }
  };
}

test('fluxo online legítimo mantém origin confiável e impressão chega à fila', async () => {
  const h = buildHarness();

  assert.equal(
    h.api.isOnlineOriginAllowed(
      'https://jpiresoficial.wixstudio.com/e-fisco'
    ),
    false
  );

  assert.equal(
    h.api.isOnlineOriginAllowed(
      'https://plataforma.e-fisco.app/'
    ),
    true
  );

  assert.equal(
    h.api.isOnlineOriginAllowed(
      'https://plataforma.e-fisco.app.evil.example/'
    ),
    false
  );

  const handler =
    h.handlers.get(
      'efisco:print-nfce-windows-driver'
    );

  assert.equal(typeof handler, 'function');

  const payload = {
    vendaId: 'sale-online-functional',
    html: '<html>NFC-e</html>'
  };

  const result =
    await handler(
      h.mainEvent,
      payload
    );

  assert.equal(result.ok, true);
  assert.equal(result.queued, true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(h.calls.enqueue)),
    [payload]
  );
});

test('impressão online legítima continua isolada da offlineView', async () => {
  const h = buildHarness();

  const handler =
    h.handlers.get(
      'efisco:print-nfce-windows-driver'
    );

  const result =
    await handler(
      h.offlineEvent,
      { vendaId: 'should-not-print' }
    );

  assert.equal(result.ok, false);
  assert.equal(h.calls.enqueue.length, 0);
});

test('login offline legítimo atravessa autorização e cria sessão local', async () => {
  const h = buildHarness();

  assert.equal(
    h.api.isOfflineOriginAllowed(
      'http://127.0.0.1:54321/offline-shell.html'
    ),
    true
  );

  const handler =
    h.handlers.get(
      'efisco:offline-operator-login'
    );

  assert.equal(typeof handler, 'function');

  const result =
    await handler(
      h.offlineEvent,
      { senha: 'senha-teste' }
    );

  assert.equal(result.ok, true);
  assert.equal(result.result.success, true);
  assert.equal(
    result.result.empresaId,
    'empresa-1'
  );
  assert.equal(
    result.result.operadorId,
    'operador-1'
  );
  assert.equal(
    result.result.mensagem,
    'ACESSO AUTORIZADO'
  );

  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        h.calls.validateLogin
      )
    ),
    [{ senha: 'senha-teste' }]
  );

  assert.equal(
    h.calls.applyProfile.length,
    1
  );
  assert.equal(
    h.calls.setSession.length,
    1
  );
  assert.equal(
    h.calls.setShellAuth.length,
    1
  );
  assert.equal(h.calls.resize, 1);
  assert.equal(h.calls.shortcuts, 1);
});

test('login offline legítimo continua isolado da mainWindow online', async () => {
  const h = buildHarness();

  const handler =
    h.handlers.get(
      'efisco:offline-operator-login'
    );

  const result =
    await handler(
      h.mainEvent,
      { senha: 'senha-teste' }
    );

  assert.equal(result.ok, false);
  assert.equal(
    h.calls.validateLogin.length,
    0
  );
  assert.equal(
    h.calls.setSession.length,
    0
  );
});

test('PDV offline mantém autorização dos fluxos legítimos de caixa, venda e crediário', () => {
  const h = buildHarness();

  for (const channel of [
    'efisco:offline-cash-consult',
    'efisco:offline-cash-open',
    'efisco:offline-cash-movement',
    'efisco:offline-cash-close',
    'efisco:offline-sale-paid',
    'efisco:offline-crediarios-list',
    'efisco:offline-crediario-detail',
    'efisco:offline-crediario-open',
    'efisco:offline-crediario-items-update'
  ]) {
    assert.equal(
      h.api.isIpcChannelAuthorized(
        h.offlineEvent,
        channel,
        'invoke'
      ),
      true,
      channel
    );
  }
});
