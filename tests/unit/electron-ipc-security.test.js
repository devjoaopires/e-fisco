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
const PRELOAD_SOURCE = fs.readFileSync(
  path.join(ROOT, 'preload.js'),
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
    url: 'https://jpiresoficial.wixstudio.com/e-fisco',
    origin: 'https://jpiresoficial.wixstudio.com',
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
      sliceBetween(
        MAIN_SOURCE,
        'let offlineUiServer = null;',
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
  let match;

  const direct =
    /ipcMain\.(handle|on)\s*\(\s*['"]([^'"]+)['"]/g;

  while ((match = direct.exec(MAIN_SOURCE)) !== null) {
    map.set(
      match[2],
      match[1] === 'on'
        ? 'send'
        : 'invoke'
    );
  }

  const wrapped =
    /instalarOfflineHandler\s*\(\s*['"]([^'"]+)['"]/g;

  while ((match = wrapped.exec(MAIN_SOURCE)) !== null) {
    map.set(match[1], 'invoke');
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

test('política IPC cobre exatamente os 22 canais registrados e expostos', () => {
  const { api } = buildHarness();
  const policyChannels = Object.keys(api.policy).sort();
  const registered = collectRegisteredChannels();
  const preload = collectPreloadChannels();

  assert.equal(policyChannels.length, 22);
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

test('matriz mantém 4 canais online e 18 canais offline sem escopo compartilhado', () => {
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
    18
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

test('os 22 canais aceitam apenas superfície e transporte declarados', () => {
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
    url: 'https://jpiresoficial.wixstudio.com/frame',
    origin: 'https://jpiresoficial.wixstudio.com',
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
    ['about:blank', 'https://jpiresoficial.wixstudio.com'],
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

test('instalarIpc usa somente autorização específica por canal', () => {
  const start = MAIN_SOURCE.indexOf(
    'function instalarIpc()'
  );
  assert.notEqual(start, -1);

  const end = MAIN_SOURCE.indexOf(
    '\nfunction ',
    start + 1
  );

  const block =
    end > start
      ? MAIN_SOURCE.slice(start, end)
      : MAIN_SOURCE.slice(start);

  assert.equal(
    block.includes(
      'isAuthorizedAppSender(event)'
    ),
    false
  );

  assert.equal(
    block.includes(
      'isOfflineViewSender(event)'
    ),
    false
  );

  assert.equal(
    (
      block.match(
        /!isIpcChannelAuthorized\s*\(/g
      ) || []
    ).length,
    14
  );

  assert.match(
    block,
    /isIpcChannelAuthorized\(\s*event,\s*channel,\s*['"]invoke['"]/
  );
});
