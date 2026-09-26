'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..', '..');
const MAIN_SOURCE = fs.readFileSync(
  path.join(ROOT, 'main.js'),
  'utf8'
);

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Marcador inicial não encontrado: ${startMarker}`);

  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Marcador final não encontrado: ${endMarker}`);

  return source.slice(start, end);
}

function commonBlocks() {
  return (
    sliceBetween(
      MAIN_SOURCE,
      'const URL_E_FISCO =',
      'const PRINTER_NAME ='
    ) +
    '\n' +
    sliceBetween(
      MAIN_SOURCE,
      'let offlineUiServer = null;',
      'let timerOfflineRuntime = null;'
    )
  );
}

function mainWindowOpenBlock() {
  return sliceBetween(
    MAIN_SOURCE,
    'mainWindow.webContents.setWindowOpenHandler(',
    'mainWindow.maximize();'
  );
}

function offlineSecurityBlock() {
  const ensureStart = MAIN_SOURCE.indexOf(
    'async function ensureOfflineView()'
  );
  assert.notEqual(
    ensureStart,
    -1,
    'ensureOfflineView não encontrado'
  );

  const start = MAIN_SOURCE.indexOf(
    'instalarCanalDiretoDoFrame(offlineView.webContents);',
    ensureStart
  );
  assert.notEqual(
    start,
    -1,
    'início da segurança da offlineView não encontrado'
  );

  const end = MAIN_SOURCE.indexOf(
    "offlineView.webContents.on('context-menu'",
    start
  );
  assert.notEqual(
    end,
    -1,
    'fim da segurança da offlineView não encontrado'
  );

  return MAIN_SOURCE.slice(start, end);
}

function buildHarness() {
  const main = {
    openHandler: null
  };
  const offline = {
    openHandler: null,
    handlers: {}
  };
  const logs = [];

  const sandbox = {
    URL,
    Object,
    String,
    log(...args) {
      logs.push(args);
    },
    mainWindow: {
      webContents: {
        setWindowOpenHandler(callback) {
          main.openHandler = callback;
        }
      }
    },
    offlineView: {
      webContents: {
        setWindowOpenHandler(callback) {
          offline.openHandler = callback;
        },
        on(name, callback) {
          offline.handlers[name] = callback;
        }
      }
    },
    instalarCanalDiretoDoFrame() {}
  };

  vm.createContext(sandbox);

  vm.runInContext(
    commonBlocks() +
      '\n' +
      'offlineUiServer = { origin: "http://127.0.0.1:54321" };\n' +
      mainWindowOpenBlock() +
      '\n' +
      offlineSecurityBlock() +
      '\n' +
      `globalThis.__api = {
        classifyRendererWindowOpen,
        classifyOfflineViewNavigation,
        popupPolicy: RENDERER_WINDOW_OPEN_POLICY,
        offlinePolicy: OFFLINE_VIEW_NAVIGATION_POLICY
      };`,
    sandbox
  );

  return {
    api: sandbox.__api,
    main,
    offline,
    logs
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

test('política de popup é deny-by-default nas duas superfícies', () => {
  const { api } = buildHarness();

  assert.equal(api.popupPolicy.defaultAction, 'deny');
  assert.equal(api.popupPolicy.allowMainWindowPopups, false);
  assert.equal(api.popupPolicy.allowOfflineViewPopups, false);
  assert.equal(api.popupPolicy.allowExternalOpen, false);
  assert.equal(api.popupPolicy.allowInternalCommandPopup, false);

  for (const source of ['mainWindow', 'offlineView']) {
    for (const url of [
      'https://jpiresoficial.wixstudio.com/e-fisco',
      'http://127.0.0.1:54321/pdv.html',
      'https://example.com/',
      'efisco-update://start',
      'data:text/html,hello',
      'file:///C:/Windows/win.ini',
      'not a url'
    ]) {
      assert.equal(
        api.classifyRendererWindowOpen({
          source,
          url
        }).action,
        'deny',
        `${source} | ${url}`
      );
    }
  }
});

test('setWindowOpenHandler da mainWindow bloqueia e registra com sanitização', () => {
  const { main, logs } = buildHarness();

  assert.equal(typeof main.openHandler, 'function');

  const result = main.openHandler({
    url: 'https://evil.example/private?token=TOPSECRET#frag'
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    { action: 'deny' }
  );
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], 'RENDERER WINDOW OPEN DENIED');
  assert.equal(logs[0][1].source, 'mainWindow');
  assert.equal(
    logs[0][1].target,
    'https://evil.example/<path-redacted>'
  );
  assert.equal(
    JSON.stringify(logs).includes('TOPSECRET'),
    false
  );
  assert.equal(
    JSON.stringify(logs).includes('private'),
    false
  );
});

test('setWindowOpenHandler da offlineView bloqueia inclusive same-origin', () => {
  const { offline, logs } = buildHarness();

  assert.equal(typeof offline.openHandler, 'function');

  const result = offline.openHandler({
    url: 'http://127.0.0.1:54321/pdv.html'
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    { action: 'deny' }
  );
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], 'RENDERER WINDOW OPEN DENIED');
  assert.equal(logs[0][1].source, 'offlineView');
  assert.equal(logs[0][1].reason, 'OFFLINE_POPUP_DENIED');
});

test('offlineView permite somente origin runtime exato no main frame', () => {
  const { offline, logs } = buildHarness();
  const handler = offline.handlers['will-navigate'];

  assert.equal(typeof handler, 'function');

  assert.equal(
    runNavigate(
      handler,
      'http://127.0.0.1:54321/offline-shell.html'
    ),
    0
  );
  assert.equal(logs.length, 0);

  assert.equal(
    runNavigate(
      handler,
      'http://127.0.0.1:54321/pdv.html?x=1#hash'
    ),
    0
  );
  assert.equal(logs.length, 0);

  for (const url of [
    'http://127.0.0.1:54322/pdv.html',
    'http://localhost:54321/pdv.html',
    'https://jpiresoficial.wixstudio.com/e-fisco',
    'https://evil.example/',
    'efisco-update://start',
    'data:text/html,hello',
    'file:///C:/Windows/win.ini',
    'not a url'
  ]) {
    logs.length = 0;

    assert.equal(
      runNavigate(handler, url),
      1,
      url
    );
    assert.equal(logs.length, 1, url);
    assert.equal(
      logs[0][0],
      'OFFLINE VIEW NAVIGATION DENIED',
      url
    );
  }
});

test('offlineView usa event.url moderno e preserva subframes', () => {
  const { offline, logs } = buildHarness();
  const handler = offline.handlers['will-navigate'];

  assert.equal(
    runNavigate(
      handler,
      'http://127.0.0.1:54321/pdv.html',
      {
        url: 'https://evil.example/',
        isMainFrame: true
      }
    ),
    1
  );
  assert.equal(logs.length, 1);
  assert.equal(
    logs[0][1].target,
    'https://evil.example/'
  );

  logs.length = 0;

  assert.equal(
    runNavigate(
      handler,
      'https://third-party.example/frame',
      {
        url: 'https://third-party.example/frame',
        isMainFrame: false
      }
    ),
    0
  );
  assert.equal(logs.length, 0);
});

test('will-redirect da offlineView protege main frame e preserva subframes', () => {
  const { offline, logs } = buildHarness();
  const handler = offline.handlers['will-redirect'];

  assert.equal(typeof handler, 'function');

  assert.equal(
    runRedirect(
      handler,
      'http://127.0.0.1:54321/pdv.html',
      true,
      {
        url: 'http://127.0.0.1:54321/pdv.html',
        isMainFrame: true
      }
    ),
    0
  );
  assert.equal(logs.length, 0);

  assert.equal(
    runRedirect(
      handler,
      'https://evil.example/',
      true,
      {
        url: 'https://evil.example/',
        isMainFrame: true
      }
    ),
    1
  );
  assert.equal(logs.length, 1);
  assert.equal(logs[0][1].eventType, 'will-redirect');

  logs.length = 0;

  assert.equal(
    runRedirect(
      handler,
      'https://third-party.example/frame',
      false,
      {
        url: 'https://third-party.example/frame',
        isMainFrame: false
      }
    ),
    0
  );
  assert.equal(logs.length, 0);
});

test('logs de segurança da offlineView não vazam conteúdo sensível', () => {
  const { offline, logs } = buildHarness();

  runNavigate(
    offline.handlers['will-navigate'],
    'data:text/html,<script>TOPSECRET</script>'
  );

  assert.equal(logs.length, 1);
  assert.equal(logs[0][1].target, 'data:<redacted>');
  assert.equal(
    JSON.stringify(logs).includes('TOPSECRET'),
    false
  );

  logs.length = 0;

  offline.openHandler({
    url: 'https://evil.example/private?token=TOPSECRET#frag'
  });

  assert.equal(logs.length, 1);
  assert.equal(
    logs[0][1].target,
    'https://evil.example/<path-redacted>'
  );
  assert.equal(
    JSON.stringify(logs).includes('TOPSECRET'),
    false
  );
  assert.equal(
    JSON.stringify(logs).includes('private'),
    false
  );
});

test('handlers da offlineView são instalados antes do loadURL', () => {
  const ensureStart = MAIN_SOURCE.indexOf(
    'async function ensureOfflineView()'
  );
  const popupPos = MAIN_SOURCE.indexOf(
    'offlineView.webContents.setWindowOpenHandler(',
    ensureStart
  );
  const navPos = MAIN_SOURCE.indexOf(
    "'will-navigate'",
    popupPos
  );
  const redirectPos = MAIN_SOURCE.indexOf(
    "'will-redirect'",
    navPos
  );
  const loadPos = MAIN_SOURCE.indexOf(
    'offlineView.webContents.loadURL(',
    ensureStart
  );

  assert.ok(popupPos > ensureStart);
  assert.ok(navPos > popupPos);
  assert.ok(redirectPos > navPos);
  assert.ok(loadPos > redirectPos);
});

test('existem exatamente dois setWindowOpenHandler ativos no main.js', () => {
  const matches =
    MAIN_SOURCE.match(/\.setWindowOpenHandler\s*\(/g) || [];

  assert.equal(matches.length, 2);
  assert.match(
    MAIN_SOURCE,
    /mainWindow\.webContents\.setWindowOpenHandler\s*\(/
  );
  assert.match(
    MAIN_SOURCE,
    /offlineView\.webContents\.setWindowOpenHandler\s*\(/
  );
});
