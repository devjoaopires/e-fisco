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
const PRELOAD_SOURCE = fs.readFileSync(
  path.join(ROOT, 'preload.js'),
  'utf8'
);
const OFFLINE_READ_HANDLERS_SOURCE = fs.readFileSync(
  path.join(
    ROOT,
    'desktop',
    'ipc',
    'offline-handlers.js'
  ),
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

function makeFrame({
  url,
  origin,
  processId,
  routingId,
  detached = false,
  destroyed = false
}) {
  const frame = {
    url,
    origin,
    processId,
    routingId,
    detached,
    parent: null,
    top: null,
    isDestroyed() {
      return destroyed;
    }
  };

  frame.top = frame;

  return frame;
}

function buildHarness() {
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
    mainWindow: {
      webContents: mainWebContents,
      isDestroyed() {
        return false;
      }
    },
    offlineView: {
      webContents: offlineWebContents
    }
  };

  vm.createContext(sandbox);

  vm.runInContext(
    sliceBetween(
      MAIN_SOURCE,
      'const URL_E_FISCO =',
      'const PRINTER_NAME ='
    ) +
      '\n' +
      'let offlineUiServer = null;\n' +
      sliceBetween(
        MAIN_SOURCE,
        'const NAVIGATION_POLICY_CONTEXT =',
        'const MAIN_WINDOW_NAVIGATION_POLICY'
      ) +
      '\n' +
      sliceBetween(
        MAIN_SOURCE,
        'const IPC_SENDER_SCOPE =',
        'function instalarIpc()'
      ) +
      '\n' +
      'offlineUiServer = { origin: "http://127.0.0.1:54321" };\n' +
      sliceBetween(
        MAIN_SOURCE,
        'function resolveAuthorizedIpcSender(event)',
        'function offlineOverlayBounds()'
      ) +
      '\n' +
      `globalThis.__api = {
        resolveAuthorizedIpcSender,
        isAuthorizedAppSender,
        isMainWindowSender,
        isIpcChannelAuthorized,
        policy: IPC_CHANNEL_AUTHORIZATION_POLICY,
        scopes: IPC_SENDER_SCOPE,
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

function collectRegisteredChannels() {
  const map = new Map();

  for (const source of [
    MAIN_SOURCE,
    OFFLINE_READ_HANDLERS_SOURCE
  ]) {
    let match;

    const direct =
      /ipcMain\.(handle|on)\s*\(\s*['"]([^'"]+)['"]/g;

    while ((match = direct.exec(source)) !== null) {
      map.set(
        match[2],
        match[1] === 'on'
          ? 'send'
          : 'invoke'
      );
    }

    const wrapped =
      /(?:instalarOfflineHandler|registerOfflineReadHandler|registerOfflineMutationHandler)\s*\(\s*['"]([^'"]+)['"]/g;

    while ((match = wrapped.exec(source)) !== null) {
      map.set(match[1], 'invoke');
    }
  }

  return map;
}

function collectPreloadChannels() {
  const map = new Map();
  let match;

  for (const [regex, transport] of [
    [/invokeChecked\s*\(\s*['"]([^'"]+)['"]/g, 'invoke'],
    [/ipcRenderer\.invoke\s*\(\s*['"]([^'"]+)['"]/g, 'invoke'],
    [/ipcRenderer\.send\s*\(\s*['"]([^'"]+)['"]/g, 'send']
  ]) {
    while ((match = regex.exec(PRELOAD_SOURCE)) !== null) {
      map.set(match[1], transport);
    }
  }

  return map;
}

test('política IPC cobre exatamente os 25 canais registrados e expostos', () => {
  const { api } = buildHarness();
  const policyChannels = Object.keys(api.policy).sort();
  const registered = collectRegisteredChannels();
  const preload = collectPreloadChannels();

  assert.equal(policyChannels.length, 25);
  assert.deepEqual(
    policyChannels,
    [...registered.keys()].sort()
  );
  assert.deepEqual(
    policyChannels,
    [...preload.keys()].sort()
  );

  for (const channel of policyChannels) {
    assert.equal(
      api.policy[channel].transport,
      registered.get(channel),
      channel
    );
    assert.equal(
      api.policy[channel].transport,
      preload.get(channel),
      channel
    );
  }
});

test('matriz mantém 4 canais online e 21 canais offline sem escopo compartilhado', () => {
  const { api } = buildHarness();

  const entries = Object.values(api.policy);

  assert.equal(
    entries.filter(
      entry =>
        entry.senderScope ===
        api.scopes.MAIN_WINDOW_TOP
    ).length,
    4
  );

  assert.equal(
    entries.filter(
      entry =>
        entry.senderScope ===
        api.scopes.OFFLINE_VIEW_TOP
    ).length,
    21
  );

  for (const entry of entries) {
    assert.ok(
      entry.senderScope ===
        api.scopes.MAIN_WINDOW_TOP ||
      entry.senderScope ===
        api.scopes.OFFLINE_VIEW_TOP
    );

    if (
      entry.senderScope ===
      api.scopes.MAIN_WINDOW_TOP
    ) {
      assert.equal(
        entry.originScope,
        'ONLINE_EXACT'
      );
    } else {
      assert.equal(
        entry.originScope,
        'OFFLINE_RUNTIME_EXACT'
      );
    }
  }
});

test('os 25 canais aceitam apenas superfície e transporte declarados', () => {
  const {
    api,
    mainEvent,
    offlineEvent
  } = buildHarness();

  for (
    const [channel, policy] of
    Object.entries(api.policy)
  ) {
    const goodEvent =
      policy.senderScope ===
      api.scopes.MAIN_WINDOW_TOP
        ? mainEvent
        : offlineEvent;

    const wrongEvent =
      policy.senderScope ===
      api.scopes.MAIN_WINDOW_TOP
        ? offlineEvent
        : mainEvent;

    assert.equal(
      api.isIpcChannelAuthorized(
        goodEvent,
        channel,
        policy.transport
      ),
      true,
      channel
    );

    assert.equal(
      api.isIpcChannelAuthorized(
        wrongEvent,
        channel,
        policy.transport
      ),
      false,
      channel
    );

    assert.equal(
      api.isIpcChannelAuthorized(
        goodEvent,
        channel,
        policy.transport === 'send'
          ? 'invoke'
          : 'send'
      ),
      false,
      channel
    );
  }
});

test('canal desconhecido e transporte ausente falham fechado', () => {
  const { api, mainEvent } = buildHarness();

  assert.equal(
    api.isIpcChannelAuthorized(
      mainEvent,
      'efisco:unknown-channel',
      'invoke'
    ),
    false
  );

  assert.equal(
    api.isIpcChannelAuthorized(
      mainEvent,
      'efisco:print-nfce-windows-driver',
      ''
    ),
    false
  );
});

test('resolvedor exige objeto sender real, mainFrame real e IDs de evento coerentes', () => {
  const {
    api,
    mainEvent,
    mainFrame,
    mainWebContents
  } = buildHarness();

  assert.equal(
    api.resolveAuthorizedIpcSender(
      mainEvent
    ).surface,
    api.scopes.MAIN_WINDOW_TOP
  );

  assert.equal(
    api.resolveAuthorizedIpcSender({
      ...mainEvent,
      sender: {
        id: mainWebContents.id,
        mainFrame,
        isDestroyed() {
          return false;
        }
      }
    }),
    null
  );

  const cloneFrame = makeFrame({
    url: mainFrame.url,
    origin: mainFrame.origin,
    processId: mainFrame.processId,
    routingId: mainFrame.routingId
  });

  assert.equal(
    api.resolveAuthorizedIpcSender({
      sender: mainWebContents,
      senderFrame: cloneFrame,
      processId: cloneFrame.processId,
      frameId: cloneFrame.routingId
    }),
    null
  );

  assert.equal(
    api.resolveAuthorizedIpcSender({
      ...mainEvent,
      processId: 999
    }),
    null
  );

  assert.equal(
    api.resolveAuthorizedIpcSender({
      ...mainEvent,
      frameId: 999
    }),
    null
  );

  assert.equal(
    api.resolveAuthorizedIpcSender({
      ...mainEvent,
      processId: undefined
    }),
    null
  );

  assert.equal(
    api.resolveAuthorizedIpcSender({
      ...mainEvent,
      frameId: undefined
    }),
    null
  );
});

test('subframes same-origin não herdam capacidades IPC privilegiadas', () => {
  const {
    api,
    mainFrame,
    offlineFrame,
    mainWebContents,
    offlineWebContents
  } = buildHarness();

  const mainChild = makeFrame({
    url: 'https://plataforma.e-fisco.app/frame',
    origin: 'https://plataforma.e-fisco.app',
    processId: 101,
    routingId: 301
  });
  mainChild.parent = mainFrame;
  mainChild.top = mainFrame;

  assert.equal(
    api.resolveAuthorizedIpcSender({
      sender: mainWebContents,
      senderFrame: mainChild,
      processId: mainChild.processId,
      frameId: mainChild.routingId
    }),
    null
  );

  const offlineChild = makeFrame({
    url: 'http://127.0.0.1:54321/pdv.html',
    origin: 'http://127.0.0.1:54321',
    processId: 102,
    routingId: 302
  });
  offlineChild.parent = offlineFrame;
  offlineChild.top = offlineFrame;

  assert.equal(
    api.resolveAuthorizedIpcSender({
      sender: offlineWebContents,
      senderFrame: offlineChild,
      processId: offlineChild.processId,
      frameId: offlineChild.routingId
    }),
    null
  );
});

test('frame detached, destruído ou com topologia inconsistente falha fechado', () => {
  const {
    api,
    mainFrame,
    mainWebContents
  } = buildHarness();

  for (const variant of [
    { detached: true },
    { destroyed: true },
    { badTop: true },
    { badParent: true }
  ]) {
    const frame = makeFrame({
      url: mainFrame.url,
      origin: mainFrame.origin,
      processId: mainFrame.processId,
      routingId: mainFrame.routingId,
      detached: variant.detached === true,
      destroyed: variant.destroyed === true
    });

    if (variant.badTop) {
      frame.top = {};
    }

    if (variant.badParent) {
      frame.parent = {};
    }

    mainWebContents.mainFrame = frame;

    assert.equal(
      api.resolveAuthorizedIpcSender({
        sender: mainWebContents,
        senderFrame: frame,
        processId: frame.processId,
        frameId: frame.routingId
      }),
      null
    );
  }
});

test('navegação para outro documento revoga IPC da mainWindow imediatamente', () => {
  const {
    api,
    mainEvent,
    mainFrame
  } = buildHarness();

  assert.equal(
    api.isIpcChannelAuthorized(
      mainEvent,
      'efisco:print-nfce-windows-driver',
      'invoke'
    ),
    true
  );

  for (const [url, origin] of [
    ['https://evil.example/', 'https://evil.example'],
    ['about:blank', 'https://plataforma.e-fisco.app'],
    ['data:text/html,update', 'null']
  ]) {
    mainFrame.url = url;
    mainFrame.origin = origin;

    assert.equal(
      api.isIpcChannelAuthorized(
        mainEvent,
        'efisco:print-nfce-windows-driver',
        'invoke'
      ),
      false,
      url
    );
  }
});

test('offlineView perde IPC ao sair do origin runtime ou quando a porta muda', () => {
  const {
    api,
    offlineEvent,
    offlineFrame
  } = buildHarness();

  assert.equal(
    api.isIpcChannelAuthorized(
      offlineEvent,
      'efisco:offline-sale-paid',
      'invoke'
    ),
    true
  );

  offlineFrame.url = 'https://evil.example/';
  offlineFrame.origin = 'https://evil.example';

  assert.equal(
    api.isIpcChannelAuthorized(
      offlineEvent,
      'efisco:offline-sale-paid',
      'invoke'
    ),
    false
  );

  offlineFrame.url =
    'http://127.0.0.1:54321/offline-shell.html';
  offlineFrame.origin =
    'http://127.0.0.1:54321';

  api.setOfflineOrigin(
    'http://127.0.0.1:65432'
  );

  assert.equal(
    api.isIpcChannelAuthorized(
      offlineEvent,
      'efisco:offline-sale-paid',
      'invoke'
    ),
    false
  );
});

test('handlers IPC usam somente autorização específica por canal', () => {
  const start = MAIN_SOURCE.indexOf(
    'function instalarIpc()'
  );
  assert.notEqual(start, -1);

  const end = MAIN_SOURCE.indexOf(
    '\nfunction ',
    start + 1
  );

  const mainBlock =
    end > start
      ? MAIN_SOURCE.slice(start, end)
      : MAIN_SOURCE.slice(start);

  const handlerSources =
    mainBlock +
    '\n' +
    OFFLINE_READ_HANDLERS_SOURCE;

  assert.equal(
    handlerSources.includes(
      'isAuthorizedAppSender(event)'
    ),
    false
  );

  assert.equal(
    handlerSources.includes(
      'isOfflineViewSender(event)'
    ),
    false
  );

  assert.equal(
    (
      handlerSources.match(
        /!isIpcChannelAuthorized\s*\(/g
      ) || []
    ).length,
    19
  );

  assert.match(
    mainBlock,
    /isIpcChannelAuthorized\(\s*event,\s*channel,\s*['"]invoke['"]/
  );

  assert.match(
    OFFLINE_READ_HANDLERS_SOURCE,
    /isIpcChannelAuthorized\(\s*event,\s*channel,\s*['"]invoke['"]/
  );
});


test('matriz de transporte permanece exatamente 23 invoke e 2 send', () => {
  const { api } = buildHarness();

  const invokeChannels =
    Object.entries(api.policy)
      .filter(([, policy]) => policy.transport === 'invoke')
      .map(([channel]) => channel)
      .sort();

  const sendChannels =
    Object.entries(api.policy)
      .filter(([, policy]) => policy.transport === 'send')
      .map(([channel]) => channel)
      .sort();

  assert.equal(invokeChannels.length, 23);
  assert.equal(sendChannels.length, 2);

  assert.deepEqual(
    sendChannels,
    [
      'efisco:offline-operator-bridge-probe',
      'efisco:offline-operator-verifier-candidate'
    ]
  );
});

test('capabilities IPC permanecem explícitas e com cardinalidade congelada', () => {
  const { api } = buildHarness();

  const counts =
    Object.values(api.policy)
      .reduce(
        (acc, policy) => {
          assert.equal(
            typeof policy.capability,
            'string'
          );
          assert.notEqual(
            policy.capability.trim(),
            ''
          );

          acc[policy.capability] =
            (acc[policy.capability] || 0) + 1;

          return acc;
        },
        {}
      );

  assert.deepEqual(
    JSON.parse(JSON.stringify(counts)),
    {
      OFFLINE_CREDENTIAL_BRIDGE: 2,
      OFFLINE_CREDENTIAL_PROVISION: 1,
      PRINT: 1,
      OFFLINE_DIAGNOSTIC: 2,
      OFFLINE_REPAIR: 1,
      OFFLINE_LOGIN: 1,
      OFFLINE_READ: 8,
      OFFLINE_MUTATION: 6,
      FISCAL_SENSITIVE: 2,
      DEVICE_IDENTITY_SENSITIVE: 1
    }
  );
});

test('cada canal IPC congelado possui um único owner de registro no processo main', () => {
  const counts = new Map();

  const add = (channel) => {
    counts.set(
      channel,
      (counts.get(channel) || 0) + 1
    );
  };

  for (const source of [
    MAIN_SOURCE,
    OFFLINE_READ_HANDLERS_SOURCE
  ]) {
    let match;

    const direct =
      /ipcMain\.(?:handle|on)\s*\(\s*['"]([^'"]+)['"]/g;

    while ((match = direct.exec(source)) !== null) {
      add(match[1]);
    }

    const wrapped =
      /(?:instalarOfflineHandler|registerOfflineReadHandler|registerOfflineMutationHandler)\s*\(\s*['"]([^'"]+)['"]/g;

    while ((match = wrapped.exec(source)) !== null) {
      add(match[1]);
    }
  }

  const { api } = buildHarness();
  const frozenChannels =
    Object.keys(api.policy).sort();

  assert.deepEqual(
    [...counts.keys()].sort(),
    frozenChannels
  );

  for (const channel of frozenChannels) {
    assert.equal(
      counts.get(channel),
      1,
      'owner IPC duplicado: ' + channel
    );
  }
});

test('política IPC é imutável no container e nas entradas por canal', () => {
  const { api } = buildHarness();

  assert.equal(
    Object.isFrozen(api.policy),
    true
  );

  for (const policy of Object.values(api.policy)) {
    assert.equal(
      Object.isFrozen(policy),
      true
    );
  }
});


test('nomes dos 25 canais permanecem iguais ao contrato congelado', () => {
  const { api } = buildHarness();

  const frozen = [
    'efisco:nfce-number-peek',
    'efisco:offline-auto-repair',
    'efisco:offline-diagnostic-report',
    'efisco:offline-cash-close',
    'efisco:offline-cash-consult',
    'efisco:offline-cash-movement',
    'efisco:offline-cash-open',
    'efisco:offline-company-header',
    'efisco:offline-credential-provision',
    'efisco:offline-crediario-detail',
    'efisco:offline-crediario-items-update',
    'efisco:offline-crediario-open',
    'efisco:offline-crediarios-list',
    'efisco:offline-customers-list',
    'efisco:offline-finance-snapshot',
    'efisco:offline-nfce-contingency-danfe-preview',
    'efisco:offline-operator-bridge-probe',
    'efisco:offline-operator-login',
    'efisco:offline-operator-verifier-candidate',
    'efisco:offline-product-find',
    'efisco:offline-products-list',
    'efisco:offline-sale-paid',
    'efisco:offline-self-test',
    'efisco:print-nfce-windows-driver',
    'efisco:superadmin-a1-mirror'
  ].sort();

  assert.deepEqual(
    Object.keys(api.policy).sort(),
    frozen
  );
});


test('redirect oficial para plataforma mantém IPC online exato sem aceitar lookalike', () => {
  const {
    api,
    mainFrame,
    mainEvent
  } = buildHarness();

  mainFrame.url =
    'https://plataforma.e-fisco.app/';
  mainFrame.origin =
    'https://plataforma.e-fisco.app';

  const sender =
    api.resolveAuthorizedIpcSender(
      mainEvent
    );

  assert.ok(sender);
  assert.equal(
    sender.surface,
    api.scopes.MAIN_WINDOW_TOP
  );
  assert.equal(
    sender.frameOrigin,
    'https://plataforma.e-fisco.app'
  );

  assert.equal(
    api.isIpcChannelAuthorized(
      mainEvent,
      'efisco:offline-credential-provision',
      'invoke'
    ),
    true
  );

  assert.equal(
    api.isIpcChannelAuthorized(
      mainEvent,
      'efisco:print-nfce-windows-driver',
      'invoke'
    ),
    true
  );

  mainFrame.url =
    'https://plataforma.e-fisco.app.evil.example/';
  mainFrame.origin =
    'https://plataforma.e-fisco.app.evil.example';

  assert.equal(
    api.resolveAuthorizedIpcSender(
      mainEvent
    ),
    null
  );

  assert.equal(
    api.isIpcChannelAuthorized(
      mainEvent,
      'efisco:offline-credential-provision',
      'invoke'
    ),
    false
  );
});
