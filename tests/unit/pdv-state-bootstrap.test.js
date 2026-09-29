'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(
  __dirname,
  '..',
  '..'
);

function read(relativePath) {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    'utf8'
  );
}

const CONTRACT_FILES = [
  'offline-ui/pdv/contracts/messages.js',
  'offline-ui/pdv/contracts/events.js',
  'offline-ui/pdv/contracts/storage-keys.js'
];

const INFRA_FILES = [
  'offline-ui/pdv/infra/shell-bridge.js',
  'offline-ui/pdv/infra/event-bus.js',
  'offline-ui/pdv/infra/storage.js',
  'offline-ui/pdv/infra/dom.js',
  'offline-ui/pdv/infra/browser-network.js'
];

const STATE_FILES = [
  'offline-ui/pdv/state/session-state.js',
  'offline-ui/pdv/state/runtime-state.js',
  'offline-ui/pdv/state/navigation-state.js'
];

const SHARED_FILES = [
  'offline-ui/pdv/shared/values/ui-values.js',
  'offline-ui/pdv/shared/helpers/text-format.js'
];

const COMPAT_FILE =
  'offline-ui/pdv/compat/legacy-globals.js';

const BOOTSTRAP_FILE =
  'offline-ui/pdv/bootstrap.js';

function createWindow() {
  return {
    parent: {
      postMessage() {}
    },
    addEventListener() {},
    removeEventListener() {},
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
      clear() {},
      key() {
        return null;
      },
      length: 0
    },
    sessionStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
      clear() {},
      key() {
        return null;
      },
      length: 0
    },
    navigator: {
      onLine: true
    },
    setTimeout,
    clearTimeout,
    AbortController:
      global.AbortController,
    CustomEvent:
      class CustomEvent {
        constructor(type, init) {
          this.type = type;
          this.detail =
            init && init.detail;
        }
      }
  };
}

function runFile(
  context,
  relativePath
) {
  vm.runInContext(
    read(relativePath),
    context,
    {
      filename: relativePath
    }
  );
}

function loadP04(options = {}) {
  const windowRef =
    createWindow();

  const context =
    vm.createContext({
      window: windowRef
    });

  for (
    const relativePath of
      CONTRACT_FILES
  ) {
    runFile(
      context,
      relativePath
    );
  }

  for (
    const relativePath of
      INFRA_FILES
  ) {
    runFile(
      context,
      relativePath
    );
  }

  for (
    const relativePath of
      STATE_FILES
  ) {
    runFile(
      context,
      relativePath
    );
  }

  for (
    const relativePath of
      SHARED_FILES
  ) {
    runFile(
      context,
      relativePath
    );
  }

  runFile(
    context,
    COMPAT_FILE
  );

  if (
    options.beforeBootstrap
  ) {
    options.beforeBootstrap(
      windowRef
    );
  }

  runFile(
    context,
    BOOTSTRAP_FILE
  );

  return windowRef;
}

test('P04 bootstrap valida contracts/infra/state/compat sem agregado global debug', () => {
  const windowRef =
    loadP04();

  assert.ok(
    windowRef.__scfPdvContracts
  );
  assert.ok(
    windowRef.__scfPdvInfra
  );
  assert.ok(
    windowRef.__scfPdvState
  );
  assert.ok(
    windowRef.__scfPdvShared
  );
  assert.ok(
    windowRef.__scfPdvCompat
  );

  assert.equal(
    windowRef
      .__scfPdvCompat
      .legacyGlobals
      .isInstalled(),
    true
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      windowRef,
      '__scfPdvApp'
    ),
    false
  );

  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        windowRef.__scfPdvState.session.snapshot()
      )
    ),
    {
      profile: 'PENDENTE',
      accessOnlyPdv: true
    }
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        windowRef.__scfPdvState.runtime.snapshot()
      )
    ),
    {
      connectivityReady: false
    }
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        windowRef.__scfPdvState.navigation.snapshot()
      )
    ),
    {
      productLookupOpen: false
    }
  );
});

test('P04 session state é fonte da verdade dos globals de perfil/acesso', () => {
  const windowRef =
    loadP04();
  const session =
    windowRef
      .__scfPdvState
      .session;

  assert.equal(
    windowRef.__scfPerfilSessao,
    'PENDENTE'
  );
  assert.equal(
    windowRef.__scfAcessoSomentePdv,
    true
  );

  windowRef.__scfPerfilSessao =
    'ADMINISTRADOR';
  windowRef.__scfAcessoSomentePdv =
    false;

  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        session.snapshot()
      )
    ),
    {
      profile: 'ADMINISTRADOR',
      accessOnlyPdv: false
    }
  );

  session.setProfile('CAIXA');
  session.setAccessOnlyPdv(true);

  assert.equal(
    windowRef.__scfPerfilSessao,
    'CAIXA'
  );
  assert.equal(
    windowRef.__scfAcessoSomentePdv,
    true
  );
});

test('P04 runtime state mantem somente global online ainda consumido', () => {
  const windowRef =
    loadP04();
  const runtime =
    windowRef
      .__scfPdvState
      .runtime;

  assert.equal(
    windowRef.__scfSistemaOnlineAtual,
    undefined
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      windowRef,
      '__scfStatusConexaoInternetReady'
    ),
    false
  );

  windowRef.__scfSistemaOnlineAtual =
    true;
  runtime.setConnectivityReady(
    true
  );

  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        runtime.snapshot()
      )
    ),
    {
      systemOnlineCurrent: true,
      connectivityReady: true
    }
  );

  runtime.setSystemOnlineCurrent(
    false
  );
  runtime.setConnectivityReady(
    false
  );

  assert.equal(
    windowRef.__scfSistemaOnlineAtual,
    false
  );
  assert.equal(
    runtime.getConnectivityReady(),
    false
  );
});

test('P04 navigation state permanece owner sem global de consulta removido no cleanup', () => {
  const windowRef =
    loadP04();
  const navigation =
    windowRef
      .__scfPdvState
      .navigation;

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      windowRef,
      '__scfPdvConsultaProdutoAtiva'
    ),
    false
  );

  navigation
    .setProductLookupOpen(true);

  assert.equal(
    navigation
      .getProductLookupOpen(),
    true
  );

  navigation
    .setProductLookupOpen(false);

  assert.equal(
    navigation
      .getProductLookupOpen(),
    false
  );

  assert.equal(
    Object.prototype
      .hasOwnProperty.call(
        windowRef,
        '__scfPdvVendaInternaAtiva'
      ),
    false
  );
  assert.equal(
    Object.prototype
      .hasOwnProperty.call(
        windowRef,
        '__scfHistoryInlineReceiptPendingSaleId'
      ),
    false
  );
});

test('P04 legacy-globals preserva somente valores preexistentes dos bindings ainda consumidos', () => {
  const windowRef =
    loadP04({
      beforeBootstrap(target) {
        target.__scfPerfilSessao =
          'SUPERVISOR';
        target
          .__scfAcessoSomentePdv =
            true;
        target
          .__scfSistemaOnlineAtual =
            false;
        target
          .__scfPdvConsultaProdutoAtiva =
            true;
      }
    });

  assert.equal(
    windowRef
      .__scfPdvState
      .session
      .getProfile(),
    'SUPERVISOR'
  );
  assert.equal(
    windowRef
      .__scfPdvState
      .runtime
      .getSystemOnlineCurrent(),
    false
  );
  assert.equal(
    windowRef
      .__scfPdvState
      .navigation
      .getProductLookupOpen(),
    false
  );
  assert.equal(
    windowRef.__scfPdvConsultaProdutoAtiva,
    true
  );
});

test('P04 bindings legados são accessors e não armazenam valor próprio', () => {
  const windowRef =
    loadP04();

  const bindings = [
    ...windowRef
      .__scfPdvCompat
      .legacyGlobals
      .bindings
  ];

  assert.deepEqual(
    bindings,
    [
      '__scfPerfilSessao',
      '__scfAcessoSomentePdv',
      '__scfSistemaOnlineAtual'
    ]
  );

  for (const name of bindings) {
    const descriptor =
      Object.getOwnPropertyDescriptor(
        windowRef,
        name
      );

    assert.equal(
      typeof descriptor.get,
      'function',
      name
    );
    assert.equal(
      typeof descriptor.set,
      'function',
      name
    );
    assert.equal(
      Object.prototype
        .hasOwnProperty.call(
          descriptor,
          'value'
        ),
      false,
      name
    );
  }
});

test('P04 load order põe bootstrap antes do primeiro consumidor inline de segurança', () => {
  const pdv = read(
    'offline-ui/pdv.html'
  );

  const expected = [
    '/pdv/contracts/messages.js',
    '/pdv/contracts/events.js',
    '/pdv/contracts/storage-keys.js',
    '/pdv/infra/shell-bridge.js',
    '/pdv/infra/event-bus.js',
    '/pdv/infra/storage.js',
    '/pdv/infra/dom.js',
    '/pdv/infra/browser-network.js',
    '/pdv/state/session-state.js',
    '/pdv/state/runtime-state.js',
    '/pdv/state/navigation-state.js',
    '/pdv/shared/values/ui-values.js',
    '/pdv/shared/helpers/text-format.js',
    '/pdv/compat/legacy-globals.js',
    '/pdv/bootstrap.js'
  ];

  const actual = [
    ...pdv.matchAll(
      /<script src="(\/pdv\/[^"]+)"><\/script>/g
    )
  ].map(
    (match) => match[1]
  );

  assert.deepEqual(
    actual.slice(
      0,
      expected.length
    ),
    expected
  );

  const bootstrapIndex =
    pdv.indexOf(
      '<script src="/pdv/bootstrap.js"></script>'
    );
  const firstInlineIndex =
    pdv.indexOf(
      '<script id="scf-seguranca-p0-guarda-entrada-postmessage-v1">'
    );

  assert.ok(
    bootstrapIndex >= 0
  );
  assert.ok(
    firstInlineIndex >
      bootstrapIndex
  );

  assert.doesNotMatch(
    pdv.slice(
      0,
      firstInlineIndex
    ),
    /type\s*=\s*["']module["']/i
  );
});

test('P04 state owners não introduzem persistência, regra de domínio, ESM ou dependência de compat', () => {
  for (
    const relativePath of
      STATE_FILES
  ) {
    const source =
      read(relativePath);

    assert.doesNotMatch(
      source,
      /localStorage|sessionStorage/
    );
    assert.doesNotMatch(
      source,
      /__scfPdvCompat/
    );
    assert.doesNotMatch(
      source,
      /\brequire\s*\(/
    );
    assert.doesNotMatch(
      source,
      /\bimport\s+|\bexport\s+/
    );
  }

  const compat =
    read(COMPAT_FILE);

  assert.match(
    compat,
    /__scfPdvState/
  );
  assert.doesNotMatch(
    compat,
    /localStorage|sessionStorage|fetch\s*\(|postMessage\s*\(/
  );
});
