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

function navigationHandlersBlock() {
  const start = MAIN_SOURCE.indexOf(
    "mainWindow.webContents.on('will-navigate'"
  );
  assert.notEqual(start, -1);

  const lf = MAIN_SOURCE.indexOf(
    "mainWindow.webContents.on(\n    'context-menu'",
    start
  );
  const crlf = MAIN_SOURCE.indexOf(
    "mainWindow.webContents.on(\r\n    'context-menu'",
    start
  );
  const end = lf >= 0 ? lf : crlf;

  assert.notEqual(end, -1);

  return MAIN_SOURCE.slice(start, end);
}

function offlineSecurityBlock() {
  const ensureStart = MAIN_SOURCE.indexOf(
    'async function ensureOfflineView()'
  );
  assert.notEqual(ensureStart, -1);

  const start = MAIN_SOURCE.indexOf(
    'instalarCanalDiretoDoFrame(offlineView.webContents);',
    ensureStart
  );
  assert.notEqual(start, -1);

  const end = MAIN_SOURCE.indexOf(
    "offlineView.webContents.on('context-menu'",
    start
  );
  assert.notEqual(end, -1);

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
  const mainHandlers = {};
  const offlineHandlers = {};
  const logs = [];

  let mainPopup = null;
  let offlinePopup = null;
  let updaterCalls = 0;

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
    },
    setWindowOpenHandler(callback) {
      mainPopup = callback;
    },
    on(name, callback) {
      mainHandlers[name] = callback;
    }
  };

  const offlineWebContents = {
    id: 22,
    mainFrame: offlineFrame,
    isDestroyed() {
      return false;
    },
    setWindowOpenHandler(callback) {
      offlinePopup = callback;
    },
    on(name, callback) {
      offlineHandlers[name] = callback;
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
    console,
    log(...args) {
      logs.push(args);
    },
    mainWindow: {
      webContents: mainWebContents,
      isDestroyed() {
        return false;
      },
      loadURL() {
        return Promise.resolve();
      }
    },
    offlineView: {
      webContents: offlineWebContents
    },
    instalarCanalDiretoDoFrame() {},
    iniciarAtualizacaoObrigatoria() {
      updaterCalls += 1;
      return Promise.resolve();
    },
    getVersaoAtualizacaoPendente() {
      return null;
    },
    paginaAtualizacaoObrigatoria() {
      return 'data:text/html,update';
    }
  };

  vm.createContext(sandbox);

  const parserBlock = sliceBetween(
    MAIN_SOURCE,
    'const URL_E_FISCO =',
    'const PRINTER_NAME ='
  );

  const securityPolicyBlock =
    'let offlineUiServer = null;\n' +
    sliceBetween(
      MAIN_SOURCE,
      'const NAVIGATION_POLICY_CONTEXT =',
      "let offlineUiMode = 'ONLINE';"
    );

  const ipcPolicyBlock = sliceBetween(
    MAIN_SOURCE,
    'const IPC_SENDER_SCOPE =',
    'function instalarIpc()'
  );

  const ipcAuthBlock = sliceBetween(
    MAIN_SOURCE,
    'function resolveAuthorizedIpcSender(event)',
    'function offlineOverlayBounds()'
  );

  const mainPopupBlock = sliceBetween(
    MAIN_SOURCE,
    'mainWindow.webContents.setWindowOpenHandler(',
    'mainWindow.maximize();'
  );

  vm.runInContext(
    parserBlock +
      '\n' +
      securityPolicyBlock +
      '\n' +
      ipcPolicyBlock +
      '\n' +
      'offlineUiServer = { origin: "http://127.0.0.1:54321" };\n' +
      ipcAuthBlock +
      '\n' +
      mainPopupBlock +
      '\n' +
      navigationHandlersBlock() +
      '\n' +
      offlineSecurityBlock() +
      '\n' +
      `globalThis.__api = {
        isIpcChannelAuthorized,
        setOfflineOrigin(origin) {
          offlineUiServer = { origin };
        }
      };`,
    sandbox
  );

  return {
    api: sandbox.__api,
    mainFrame,
    offlineFrame,
    mainWebContents,
    offlineWebContents,
    mainHandlers,
    offlineHandlers,
    mainPopup: () => mainPopup,
    offlinePopup: () => offlinePopup,
    logs,
    updaterCalls: () => updaterCalls
  };
}

function eventFor(sender, frame, extras = {}) {
  return {
    sender,
    senderFrame: frame,
    processId: frame.processId,
    frameId: frame.routingId,
    ...extras
  };
}

function runNavigate(handler, url, eventProps = {}) {
  let prevented = 0;

  handler(
    {
      ...eventProps,
      preventDefault() {
        prevented += 1;
      }
    },
    url
  );

  return prevented;
}

function runRedirect(
  handler,
  url,
  isMainFrame,
  eventProps = {}
) {
  let prevented = 0;

  handler(
    {
      ...eventProps,
      preventDefault() {
        prevented += 1;
      }
    },
    url,
    false,
    isMainFrame
  );

  return prevented;
}

test('mainWindow confiável permite navegação e IPC, mas nunca popup', () => {
  const h = buildHarness();

  assert.equal(
    runNavigate(
      h.mainHandlers['will-navigate'],
      'https://plataforma.e-fisco.app/outra-rota'
    ),
    0
  );

  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        h.mainPopup()({
          url: 'https://plataforma.e-fisco.app/outra-rota'
        })
      )
    ),
    { action: 'deny' }
  );

  assert.equal(
    h.api.isIpcChannelAuthorized(
      eventFor(
        h.mainWebContents,
        h.mainFrame
      ),
      'efisco:print-nfce-windows-driver',
      'invoke'
    ),
    true
  );

  assert.equal(
    h.api.isIpcChannelAuthorized(
      eventFor(
        h.mainWebContents,
        h.mainFrame
      ),
      'efisco:offline-sale-paid',
      'invoke'
    ),
    false
  );
});

test('destino externo falha em navegação, popup e IPC após escape forçado', () => {
  const h = buildHarness();
  const evilUrl =
    'https://evil.example/private?token=TOPSECRET#frag';

  assert.equal(
    runNavigate(
      h.mainHandlers['will-navigate'],
      evilUrl
    ),
    1
  );

  assert.equal(
    h.mainPopup()({ url: evilUrl }).action,
    'deny'
  );

  h.mainFrame.url = 'https://evil.example/';
  h.mainFrame.origin = 'https://evil.example';

  assert.equal(
    h.api.isIpcChannelAuthorized(
      eventFor(
        h.mainWebContents,
        h.mainFrame
      ),
      'efisco:print-nfce-windows-driver',
      'invoke'
    ),
    false
  );

  assert.equal(
    JSON.stringify(h.logs).includes('TOPSECRET'),
    false
  );
});

test('event.url malicioso vence argumento seguro e não deixa IPC residual', () => {
  const h = buildHarness();

  assert.equal(
    runNavigate(
      h.mainHandlers['will-navigate'],
      'https://plataforma.e-fisco.app/',
      {
        url: 'https://evil.example/',
        isMainFrame: true
      }
    ),
    1
  );

  h.mainFrame.url = 'https://evil.example/';
  h.mainFrame.origin = 'https://evil.example';

  assert.equal(
    h.api.isIpcChannelAuthorized(
      eventFor(
        h.mainWebContents,
        h.mainFrame
      ),
      'efisco:offline-credential-provision',
      'invoke'
    ),
    false
  );
});

test('comando interno só intercepta navegação; popup e página data não recebem IPC', () => {
  const h = buildHarness();

  assert.equal(
    runNavigate(
      h.mainHandlers['will-navigate'],
      'efisco-update://start'
    ),
    1
  );
  assert.equal(h.updaterCalls(), 1);

  assert.equal(
    h.mainPopup()({
      url: 'efisco-update://start'
    }).action,
    'deny'
  );

  h.mainFrame.url = 'data:text/html,update';
  h.mainFrame.origin = 'null';

  assert.equal(
    h.api.isIpcChannelAuthorized(
      eventFor(
        h.mainWebContents,
        h.mainFrame
      ),
      'efisco:offline-credential-provision',
      'invoke'
    ),
    false
  );
});

test('offlineView confiável permite navegação e IPC offline, mas nunca popup', () => {
  const h = buildHarness();

  assert.equal(
    runNavigate(
      h.offlineHandlers['will-navigate'],
      'http://127.0.0.1:54321/pdv.html'
    ),
    0
  );

  assert.equal(
    h.offlinePopup()({
      url: 'http://127.0.0.1:54321/pdv.html'
    }).action,
    'deny'
  );

  assert.equal(
    h.api.isIpcChannelAuthorized(
      eventFor(
        h.offlineWebContents,
        h.offlineFrame
      ),
      'efisco:offline-sale-paid',
      'invoke'
    ),
    true
  );

  assert.equal(
    h.api.isIpcChannelAuthorized(
      eventFor(
        h.offlineWebContents,
        h.offlineFrame
      ),
      'efisco:print-nfce-windows-driver',
      'invoke'
    ),
    false
  );
});

test('escape externo da offlineView falha em navegação, popup e IPC após escape forçado', () => {
  const h = buildHarness();

  assert.equal(
    runNavigate(
      h.offlineHandlers['will-navigate'],
      'https://evil.example/'
    ),
    1
  );

  assert.equal(
    h.offlinePopup()({
      url: 'https://evil.example/'
    }).action,
    'deny'
  );

  h.offlineFrame.url = 'https://evil.example/';
  h.offlineFrame.origin = 'https://evil.example';

  assert.equal(
    h.api.isIpcChannelAuthorized(
      eventFor(
        h.offlineWebContents,
        h.offlineFrame
      ),
      'efisco:offline-sale-paid',
      'invoke'
    ),
    false
  );
});

test('localhost e porta offline errada são negados pelas três camadas', () => {
  for (const [url, origin] of [
    [
      'http://localhost:54321/pdv.html',
      'http://localhost:54321'
    ],
    [
      'http://127.0.0.1:54322/pdv.html',
      'http://127.0.0.1:54322'
    ]
  ]) {
    const h = buildHarness();

    assert.equal(
      runNavigate(
        h.offlineHandlers['will-navigate'],
        url
      ),
      1,
      url
    );

    assert.equal(
      h.offlinePopup()({ url }).action,
      'deny',
      url
    );

    h.offlineFrame.url = url;
    h.offlineFrame.origin = origin;

    assert.equal(
      h.api.isIpcChannelAuthorized(
        eventFor(
          h.offlineWebContents,
          h.offlineFrame
        ),
        'efisco:offline-sale-paid',
        'invoke'
      ),
      false,
      url
    );
  }
});

test('subframe same-origin pode manter redirect funcional, mas não ganha popup ou IPC', () => {
  const h = buildHarness();

  const child = makeFrame({
    url: 'http://127.0.0.1:54321/pdv.html',
    origin: 'http://127.0.0.1:54321',
    processId: 102,
    routingId: 302
  });
  child.parent = h.offlineFrame;
  child.top = h.offlineFrame;

  assert.equal(
    runRedirect(
      h.offlineHandlers['will-redirect'],
      'https://third-party.example/frame',
      false,
      {
        url: 'https://third-party.example/frame',
        isMainFrame: false
      }
    ),
    0
  );

  assert.equal(
    h.offlinePopup()({
      url: 'https://third-party.example/popup'
    }).action,
    'deny'
  );

  assert.equal(
    h.api.isIpcChannelAuthorized(
      eventFor(
        h.offlineWebContents,
        child
      ),
      'efisco:offline-sale-paid',
      'invoke'
    ),
    false
  );
});

test('mudança da porta runtime invalida simultaneamente navegação futura e IPC antigo', () => {
  const h = buildHarness();

  h.api.setOfflineOrigin(
    'http://127.0.0.1:65432'
  );

  assert.equal(
    runNavigate(
      h.offlineHandlers['will-navigate'],
      'http://127.0.0.1:54321/pdv.html'
    ),
    1
  );

  assert.equal(
    h.api.isIpcChannelAuthorized(
      eventFor(
        h.offlineWebContents,
        h.offlineFrame
      ),
      'efisco:offline-sale-paid',
      'invoke'
    ),
    false
  );

  assert.equal(
    h.offlinePopup()({
      url: 'http://127.0.0.1:54321/pdv.html'
    }).action,
    'deny'
  );
});
