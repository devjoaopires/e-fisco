'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const navigationPolicyModule =
  require('../../desktop/security/navigation-policy');

const ROOT = path.resolve(__dirname, '..', '..');
const MAIN_PATH = path.join(ROOT, 'main.js');
const MAIN_SOURCE = fs.readFileSync(MAIN_PATH, 'utf8');

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Marcador inicial não encontrado: ${startMarker}`);

  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Marcador final não encontrado: ${endMarker}`);

  return source.slice(start, end);
}

function navigationHandlersBlock(source) {
  const start = source.indexOf(
    "mainWindow.webContents.on('will-navigate'"
  );
  assert.notEqual(start, -1, 'will-navigate não encontrado');

  const lf = source.indexOf(
    "mainWindow.webContents.on(\n    'context-menu'",
    start
  );
  const crlf = source.indexOf(
    "mainWindow.webContents.on(\r\n    'context-menu'",
    start
  );
  const end = lf >= 0 ? lf : crlf;

  assert.notEqual(end, -1, 'fim do bloco de navegação não encontrado');

  return source.slice(start, end);
}

function buildHarness() {
  const parserBlock = sliceBetween(
    MAIN_SOURCE,
    'const URL_E_FISCO =',
    'const PRINTER_NAME ='
  );

  const policyBlock =
    sliceBetween(
      MAIN_SOURCE,
      'let offlineUiServer = null;',
      'const offlineRendererRecoveryController ='
    ) +
    '\n' +
    sliceBetween(
      MAIN_SOURCE,
      'const NAVIGATION_POLICY_CONTEXT =',
      "let offlineUiMode = 'ONLINE';"
    );

  const handlersBlock =
    navigationHandlersBlock(MAIN_SOURCE);

  const handlers = {};
  const logs = [];
  let updaterCalls = 0;
  let loadUrlCalls = 0;

  const sandbox = {
    URL,
    navigationPolicyModule,
    Object,
    String,
    Promise,
    console,
    log(...args) {
      logs.push(args);
    },
    mainWindow: {
      webContents: {
        on(name, callback) {
          handlers[name] = callback;
        }
      },
      isDestroyed() {
        return false;
      },
      loadURL() {
        loadUrlCalls += 1;
        return Promise.resolve();
      }
    },
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
  vm.runInContext(
    parserBlock +
      '\n' +
      policyBlock +
      '\n' +
      handlersBlock +
      '\n' +
      `globalThis.__api = {
        parseUrlSegura,
        isOnlineOriginAllowed,
        isOfflineOriginAllowed,
        isInternalNavigationAllowed,
        classifyMainWindowNavigation,
        sanitizeNavigationUrlForLog,
        resolveNavigationEventUrl,
        resolveNavigationEventIsMainFrame,
        policy: MAIN_WINDOW_NAVIGATION_POLICY,
        setOfflineOrigin(origin) {
          offlineUiServer = origin ? { origin } : null;
        }
      };`,
    sandbox
  );

  return {
    api: sandbox.__api,
    handlers,
    logs,
    counters() {
      return {
        updaterCalls,
        loadUrlCalls
      };
    }
  };
}

function runWillNavigate(handler, url, eventProps = {}) {
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

function runWillRedirect(
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

test('política da BrowserWindow permite somente os origins online confiáveis', () => {
  const { api } = buildHarness();

  assert.equal(
    api.policy.onlineOrigin,
    'https://plataforma.e-fisco.app'
  );

  assert.deepEqual(
    Array.from(api.policy.onlineOrigins),
    [
      'https://plataforma.e-fisco.app'
    ]
  );

  for (const url of [
    'https://plataforma.e-fisco.app/app-home',
    'https://plataforma.e-fisco.app/outra-rota',
    'https://plataforma.e-fisco.app/a?x=1#hash',
    'https://plataforma.e-fisco.app/',
    'https://plataforma.e-fisco.app/login',
    'https://plataforma.e-fisco.app/app?x=1#hash'
  ]) {
    assert.equal(
      api.classifyMainWindowNavigation(url).decision,
      'ALLOW',
      url
    );
  }

  for (const url of [
    'https://jpiresoficial.wixstudio.com/e-fisco',
    'http://jpiresoficial.wixstudio.com/e-fisco',
    'https://jpiresoficial.wixstudio.com:444/e-fisco',
    'https://jpiresoficial.wixstudio.com.evil.example/e-fisco',
    'https://user:pass@jpiresoficial.wixstudio.com/e-fisco',
    'http://plataforma.e-fisco.app/',
    'https://plataforma.e-fisco.app:444/',
    'https://plataforma.e-fisco.app.evil.example/',
    'https://user:pass@plataforma.e-fisco.app/',
    'https://example.com/',
    'about:blank',
    'javascript:alert(1)',
    'file:///C:/Windows/win.ini',
    'data:text/html,hello',
    'not a url'
  ]) {
    assert.equal(
      api.classifyMainWindowNavigation(url).decision,
      'BLOCK',
      url
    );
  }
});

test('origin offline é exclusivo da WebContentsView', () => {
  const { api } = buildHarness();

  api.setOfflineOrigin('http://127.0.0.1:54321');

  const result = api.classifyMainWindowNavigation(
    'http://127.0.0.1:54321/offline-shell.html'
  );

  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reason, 'OFFLINE_VIEW_ONLY');

  assert.equal(
    api.classifyMainWindowNavigation(
      'http://localhost:54321/offline-shell.html'
    ).decision,
    'BLOCK'
  );

  assert.equal(
    api.classifyMainWindowNavigation(
      'http://127.0.0.1:54322/offline-shell.html'
    ).decision,
    'BLOCK'
  );
});

test('will-navigate permite same-origin e bloqueia destinos não confiáveis', () => {
  const { handlers, logs, counters } = buildHarness();

  const handler = handlers['will-navigate'];
  assert.equal(typeof handler, 'function');

  assert.equal(
    runWillNavigate(
      handler,
      'https://plataforma.e-fisco.app/'
    ),
    0
  );

  assert.equal(
    runWillNavigate(
      handler,
      'https://plataforma.e-fisco.app/'
    ),
    0
  );

  assert.equal(logs.length, 0);
  assert.equal(counters().updaterCalls, 0);

  assert.equal(
    runWillNavigate(
      handler,
      'https://evil.example/secret?token=TOPSECRET#fragment'
    ),
    1
  );
  assert.equal(logs.length, 1);
  assert.equal(counters().updaterCalls, 0);

  const payload = logs[0][1];
  assert.equal(payload.eventType, 'will-navigate');
  assert.equal(payload.decision, 'BLOCK');
  assert.equal(
    payload.reason,
    'UNTRUSTED_NAVIGATION_TARGET'
  );
  assert.equal(
    payload.target,
    'https://evil.example/<path-redacted>'
  );
});

test('will-navigate intercepta somente o comando exato de atualização', () => {
  const { handlers, logs, counters } = buildHarness();

  const handler = handlers['will-navigate'];

  assert.equal(
    runWillNavigate(handler, 'efisco-update://start'),
    1
  );
  assert.equal(counters().updaterCalls, 1);
  assert.equal(logs.length, 1);
  assert.equal(logs[0][1].decision, 'INTERCEPT');
  assert.equal(
    logs[0][1].reason,
    'INTERNAL_UPDATE_COMMAND'
  );

  assert.equal(
    runWillNavigate(
      handler,
      'efisco-update://start?unexpected=1'
    ),
    1
  );
  assert.equal(
    counters().updaterCalls,
    1,
    'variação do comando não pode acionar updater'
  );
});

test('event.url moderno tem precedência sobre argumento legado', () => {
  const { handlers, logs } = buildHarness();

  const prevented = runWillNavigate(
    handlers['will-navigate'],
    'https://plataforma.e-fisco.app/',
    {
      url: 'https://evil.example/'
    }
  );

  assert.equal(prevented, 1);
  assert.equal(logs.length, 1);
  assert.equal(
    logs[0][1].target,
    'https://evil.example/'
  );
});

test('will-redirect protege main frame sem bloquear subframes', () => {
  const { handlers, logs, counters } = buildHarness();

  const handler = handlers['will-redirect'];
  assert.equal(typeof handler, 'function');

  assert.equal(
    runWillRedirect(
      handler,
      'https://plataforma.e-fisco.app/',
      true,
      {
        url: 'https://plataforma.e-fisco.app/',
        isMainFrame: true
      }
    ),
    0
  );
  assert.equal(logs.length, 0);

  assert.equal(
    runWillRedirect(
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
  assert.equal(counters().updaterCalls, 0);

  logs.length = 0;

  assert.equal(
    runWillRedirect(
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
  assert.equal(
    logs.length,
    0,
    'subframe preservado não deve gerar log de bloqueio'
  );
});

test('redirect não pode transformar comando interno em acionamento do updater', () => {
  const { handlers, logs, counters } = buildHarness();

  assert.equal(
    runWillRedirect(
      handlers['will-redirect'],
      'efisco-update://start',
      true,
      {
        url: 'efisco-update://start',
        isMainFrame: true
      }
    ),
    1
  );

  assert.equal(counters().updaterCalls, 0);
  assert.equal(logs.length, 1);
  assert.equal(logs[0][1].decision, 'INTERCEPT');
});

test('logging de navegação não vaza dados sensíveis', () => {
  const { api } = buildHarness();

  const cases = [
    [
      'https://user:pass@example.com/private/customer?token=TOPSECRET#fragment',
      'https://example.com/<path-redacted>'
    ],
    [
      'https://example.com/?token=TOPSECRET#fragment',
      'https://example.com/'
    ],
    [
      'data:text/html,<script>TOPSECRET</script>',
      'data:<redacted>'
    ],
    [
      'javascript:alert("TOPSECRET")',
      'javascript:<redacted>'
    ],
    [
      'file:///C:/Users/TESTUSER/Documents/TOPSECRET.txt',
      'file:<redacted>'
    ],
    [
      'TOPSECRET invalid url',
      '<invalid-url>'
    ]
  ];

  for (const [input, expected] of cases) {
    const sanitized =
      api.sanitizeNavigationUrlForLog(input);

    assert.equal(sanitized, expected);
    assert.equal(
      sanitized.includes('TOPSECRET'),
      false,
      input
    );
    assert.equal(
      sanitized.includes('user:pass'),
      false,
      input
    );
  }
});

test('regressão estática não reintroduz validação loopback por prefixo', () => {
  assert.equal(
    MAIN_SOURCE.includes(
      "startsWith('http://127.0.0.1"
    ),
    false
  );

  assert.equal(
    MAIN_SOURCE.includes(
      "startsWith('http://localhost"
    ),
    false
  );

  assert.match(
    MAIN_SOURCE,
    /mainWindow\.webContents\.on\(\s*['"]will-redirect['"]/
  );

  assert.match(
    MAIN_SOURCE,
    /classifyMainWindowNavigation\(/
  );

  assert.match(
    MAIN_SOURCE,
    /logBlockedMainWindowNavigation\(/
  );
});


test('frame moderno tem precedência sobre flag legada e fallback permanece conservador', () => {
  const resolve =
    navigationPolicyModule.resolveNavigationEventIsMainFrame;

  assert.equal(
    resolve(
      {
        isMainFrame: false
      },
      true
    ),
    false
  );

  assert.equal(
    resolve(
      {
        isMainFrame: true
      },
      false
    ),
    true
  );

  assert.equal(
    resolve(
      {},
      false
    ),
    false
  );

  assert.equal(
    resolve(
      {},
      undefined
    ),
    true
  );
});

test('origin offline acompanha a porta runtime atual e invalida origin antigo', () => {
  let offlineOrigin =
    'http://127.0.0.1:54321';

  const context =
    navigationPolicyModule.createNavigationPolicyContext({
      onlineUrl:
        'https://plataforma.e-fisco.app/',
      internalUpdateNavigationUrl:
        'efisco-update://start',
      getOfflineOrigin() {
        return offlineOrigin;
      }
    });

  assert.equal(
    navigationPolicyModule
      .classifyOfflineViewNavigation(
        'http://127.0.0.1:54321/pdv.html',
        context
      )
      .decision,
    'ALLOW'
  );

  offlineOrigin =
    'http://127.0.0.1:65432';

  assert.equal(
    navigationPolicyModule
      .classifyOfflineViewNavigation(
        'http://127.0.0.1:54321/pdv.html',
        context
      )
      .decision,
    'BLOCK'
  );

  assert.equal(
    navigationPolicyModule
      .classifyOfflineViewNavigation(
        'http://127.0.0.1:65432/pdv.html',
        context
      )
      .decision,
    'ALLOW'
  );
});

test('sanitização preserva somente marcador seguro do comando interno e de schemes desconhecidos', () => {
  const context =
    navigationPolicyModule.createNavigationPolicyContext({
      onlineUrl:
        'https://plataforma.e-fisco.app/',
      internalUpdateNavigationUrl:
        'efisco-update://start',
      getOfflineOrigin() {
        return 'http://127.0.0.1:54321';
      }
    });

  assert.equal(
    navigationPolicyModule
      .sanitizeNavigationUrlForLog(
        'efisco-update://start',
        context
      ),
    'efisco-update://start'
  );

  assert.equal(
    navigationPolicyModule
      .sanitizeNavigationUrlForLog(
        'mailto:secret@example.com?subject=TOPSECRET',
        context
      ),
    'mailto:'
  );
});

test('popup mantém deny com razão determinística por superfície e target', () => {
  const context =
    navigationPolicyModule.createNavigationPolicyContext({
      onlineUrl:
        'https://plataforma.e-fisco.app/',
      internalUpdateNavigationUrl:
        'efisco-update://start',
      getOfflineOrigin() {
        return 'http://127.0.0.1:54321';
      }
    });

  const cases = [
    [
      {
        source: 'mainWindow',
        url: 'https://plataforma.e-fisco.app/'
      },
      'ONLINE_POPUP_DENIED'
    ],
    [
      {
        source: 'offlineView',
        url: 'http://127.0.0.1:54321/pdv.html'
      },
      'OFFLINE_POPUP_DENIED'
    ],
    [
      {
        source: 'mainWindow',
        url: 'efisco-update://start'
      },
      'INTERNAL_COMMAND_POPUP_DENIED'
    ],
    [
      {
        source: 'unknown-surface',
        url: 'https://evil.example/'
      },
      'UNTRUSTED_WINDOW_TARGET'
    ]
  ];

  for (const [input, reason] of cases) {
    const result =
      navigationPolicyModule
        .classifyRendererWindowOpen(
          input,
          context
        );

    assert.equal(
      result.action,
      'deny'
    );

    assert.equal(
      result.reason,
      reason
    );
  }
});
