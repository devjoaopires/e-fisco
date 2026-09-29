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

function makeStorage() {
  const values = new Map();

  return {
    get length() {
      return values.size;
    },
    getItem(key) {
      const normalized =
        String(key);
      return values.has(normalized)
        ? values.get(normalized)
        : null;
    },
    setItem(key, value) {
      values.set(
        String(key),
        String(value)
      );
    },
    removeItem(key) {
      values.delete(String(key));
    },
    clear() {
      values.clear();
    },
    key(index) {
      return (
        [...values.keys()][index] ??
        null
      );
    }
  };
}

function createHarness(options = {}) {
  const windowListeners =
    new Map();
  const documentListeners =
    new Map();
  const posted = [];
  const fetchCalls = [];

  const localStorage =
    makeStorage();
  const sessionStorage =
    makeStorage();

  const nodes = {
    alpha: {
      id: 'alpha'
    }
  };

  const documentRef = {
    addEventListener(
      name,
      listener
    ) {
      const list =
        documentListeners.get(name) ||
        [];
      list.push(listener);
      documentListeners.set(
        name,
        list
      );
    },
    removeEventListener(
      name,
      listener
    ) {
      const list =
        documentListeners.get(name) ||
        [];
      documentListeners.set(
        name,
        list.filter(
          (item) =>
            item !== listener
        )
      );
    },
    dispatchEvent(event) {
      const list =
        documentListeners.get(
          event.type
        ) || [];

      for (const listener of list) {
        listener(event);
      }

      return true;
    },
    getElementById(id) {
      return nodes[id] || null;
    },
    querySelector(selector) {
      return {
        selector
      };
    },
    querySelectorAll(selector) {
      return [
        {
          selector,
          index: 0
        },
        {
          selector,
          index: 1
        }
      ];
    }
  };

  class FakeCustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail =
        init && init.detail;
    }
  }

  const windowRef = {
    document: documentRef,
    navigator: {
      onLine:
        options.online !== false
    },
    localStorage,
    sessionStorage,
    CustomEvent:
      FakeCustomEvent,
    AbortController:
      global.AbortController,
    setTimeout,
    clearTimeout,
    parent: {
      postMessage(
        message,
        targetOrigin
      ) {
        posted.push({
          message,
          targetOrigin
        });
      }
    },
    addEventListener(
      name,
      listener
    ) {
      const list =
        windowListeners.get(name) ||
        [];
      list.push(listener);
      windowListeners.set(
        name,
        list
      );
    },
    removeEventListener(
      name,
      listener
    ) {
      const list =
        windowListeners.get(name) ||
        [];
      windowListeners.set(
        name,
        list.filter(
          (item) =>
            item !== listener
        )
      );
    },
    async fetch(url, settings) {
      fetchCalls.push({
        url,
        settings
      });

      if (
        options.fetchError === true
      ) {
        throw new Error(
          'network failed'
        );
      }

      const status =
        options.status || 200;

      return {
        ok:
          status >= 200 &&
          status < 300,
        status,
        async json() {
          return {
            ok: true,
            url
          };
        }
      };
    }
  };

  const context = vm.createContext({
    window: windowRef
  });

  for (const file of [
    'shell-bridge.js',
    'event-bus.js',
    'storage.js',
    'dom.js',
    'browser-network.js'
  ]) {
    vm.runInContext(
      read(
        'offline-ui/pdv/infra/' +
          file
      ),
      context,
      {
        filename:
          'offline-ui/pdv/infra/' +
          file
      }
    );
  }

  return {
    windowRef,
    infra:
      windowRef.__scfPdvInfra,
    posted,
    fetchCalls,
    windowListeners,
    documentListeners
  };
}

test('P03 shell bridge preserva payload/targetOrigin e subscription de message', () => {
  const harness =
    createHarness();

  harness.infra.shellBridge.post(
    {
      type: 'SCF_TESTE'
    },
    'https://example.test'
  );

  harness.infra.shellBridge.post(
    {
      type: 'SCF_DEFAULT'
    }
  );

  assert.deepEqual(
    harness.posted,
    [
      {
        message: {
          type: 'SCF_TESTE'
        },
        targetOrigin:
          'https://example.test'
      },
      {
        message: {
          type: 'SCF_DEFAULT'
        },
        targetOrigin: '*'
      }
    ]
  );

  const seen = [];
  const unsubscribe =
    harness.infra
      .shellBridge
      .onMessage(
        (event) =>
          seen.push(event.data)
      );

  const listener =
    harness.windowListeners
      .get('message')[0];

  listener({
    data: {
      type: 'SCF_RESULT'
    }
  });

  assert.deepEqual(
    seen,
    [
      {
        type: 'SCF_RESULT'
      }
    ]
  );

  unsubscribe();

  assert.equal(
    harness.windowListeners
      .get('message').length,
    0
  );
});

test('P03 event bus preserva CustomEvent/detail e unsubscribe', () => {
  const harness =
    createHarness();
  const seen = [];

  const unsubscribe =
    harness.infra.eventBus.on(
      'scf:venda-paga',
      (event) =>
        seen.push(event.detail)
    );

  assert.equal(
    harness.infra.eventBus.emit(
      'scf:venda-paga',
      {
        saleId: 'sale-p03'
      }
    ),
    true
  );

  assert.deepEqual(
    seen,
    [
      {
        saleId: 'sale-p03'
      }
    ]
  );

  const event =
    new harness.windowRef.CustomEvent(
      'scf:nova-venda-pronta',
      {
        detail: {
          source: 'dispatch'
        }
      }
    );

  assert.equal(
    harness.infra.eventBus
      .dispatch(event),
    true
  );

  unsubscribe();

  assert.equal(
    harness.documentListeners
      .get('scf:venda-paga')
      .length,
    0
  );
});

test('P03 storage adapter preserva localStorage/sessionStorage sem mudar strings', () => {
  const harness =
    createHarness();
  const storage =
    harness.infra.storage;

  storage.local.setItem(
    'scfFiscalDraft',
    '{"version":1}'
  );
  storage.session.setItem(
    'scf_stock_copy_annual_sales_dashboard_html_v1',
    '<div>ok</div>'
  );

  assert.equal(
    storage.local.getItem(
      'scfFiscalDraft'
    ),
    '{"version":1}'
  );
  assert.equal(
    storage.session.getItem(
      'scf_stock_copy_annual_sales_dashboard_html_v1'
    ),
    '<div>ok</div>'
  );
  assert.equal(
    storage.local.length(),
    1
  );
  assert.equal(
    storage.session.length(),
    1
  );

  storage.local.removeItem(
    'scfFiscalDraft'
  );

  assert.equal(
    storage.local.getItem(
      'scfFiscalDraft'
    ),
    null
  );
});

test('P03 dom adapter mantém lookup/query no document ou root injetado', () => {
  const harness =
    createHarness();
  const dom =
    harness.infra.dom;

  assert.deepEqual(
    dom.byId('alpha'),
    {
      id: 'alpha'
    }
  );
  assert.deepEqual(
    dom.query('.x'),
    {
      selector: '.x'
    }
  );
  assert.equal(
    dom.queryAll('.x').length,
    2
  );

  const customRoot = {
    getElementById(id) {
      return 'id:' + id;
    },
    querySelector(selector) {
      return 'q:' + selector;
    },
    querySelectorAll(selector) {
      return [
        'qa:' + selector
      ];
    }
  };

  assert.equal(
    dom.byId(
      'beta',
      customRoot
    ),
    'id:beta'
  );
  assert.equal(
    dom.query(
      '.y',
      customRoot
    ),
    'q:.y'
  );
  assert.deepEqual(
    Array.from(
      dom.queryAll(
        '.z',
        customRoot
      )
    ),
    [
      'qa:.z'
    ]
  );
});

test('P03 browser network preserva online, fetch JSON e probe no-cors', async () => {
  const harness =
    createHarness();
  const network =
    harness.infra.browserNetwork;

  assert.equal(
    network.isNavigatorOnline(),
    true
  );
  assert.equal(
    network.hasFetch(),
    true
  );

  const json =
    await network.fetchJson(
      'https://example.test/data',
      {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        headers: {
          Accept:
            'application/json'
        }
      },
      1000
    );

  assert.deepEqual(
    json,
    {
      ok: true,
      url:
        'https://example.test/data'
    }
  );

  assert.equal(
    await network.probeNoCors(
      'https://www.gstatic.com/generate_204',
      1000
    ),
    true
  );

  assert.equal(
    harness.fetchCalls[0]
      .settings.mode,
    'cors'
  );
  assert.equal(
    harness.fetchCalls[1]
      .settings.mode,
    'no-cors'
  );
  assert.equal(
    harness.fetchCalls[1]
      .settings.credentials,
    'omit'
  );

  const offline =
    createHarness({
      online: false
    });

  assert.equal(
    offline.infra
      .browserNetwork
      .isNavigatorOnline(),
    false
  );

  const failed =
    createHarness({
      fetchError: true
    });

  assert.equal(
    await failed.infra
      .browserNetwork
      .probeNoCors(
        'https://example.test/probe',
        1000
      ),
    false
  );
});

test('P03 top-level PDV usa adapters; srcdoc isolado mantém bridge nativa própria', () => {
  const pdv = read(
    'offline-ui/pdv.html'
  );

  const templatePattern =
    /<template\b[^>]*\bid=["']__htmlStatusSrcdoc["'][^>]*>[\s\S]*?<\/template>/i;

  const templateMatch =
    pdv.match(templatePattern);

  assert.ok(templateMatch);

  const top =
    pdv.replace(
      templatePattern,
      ''
    );
  const child =
    templateMatch[0];

  assert.equal(
    (
      top.match(
        /window\.parent\.postMessage\s*\(/g
      ) || []
    ).length,
    0
  );
  assert.equal(
    (
      top.match(
        /window\.addEventListener\s*\(\s*["']message["']/g
      ) || []
    ).length,
    0
  );
  assert.equal(
    (
      top.match(
        /document\.dispatchEvent\s*\(/g
      ) || []
    ).length,
    0
  );
  assert.equal(
    (
      top.match(
        /document\.addEventListener\s*\(\s*["']scf:/g
      ) || []
    ).length,
    0
  );
  assert.equal(
    (
      top.match(
        /(?:window\.)?localStorage\./g
      ) || []
    ).length,
    0
  );
  assert.equal(
    (
      top.match(
        /(?:window\.)?sessionStorage\./g
      ) || []
    ).length,
    0
  );
  assert.equal(
    (
      top.match(
        /(?:window\.)?fetch\s*\(/g
      ) || []
    ).length,
    0
  );
  assert.equal(
    (
      top.match(
        /navigator\.onLine/g
      ) || []
    ).length,
    0
  );

  assert.equal(
    (
      child.match(
        /window\.parent\.postMessage\s*\(/g
      ) || []
    ).length,
    9
  );
  assert.equal(
    (
      child.match(
        /window\.addEventListener\s*\(\s*["']message["']/g
      ) || []
    ).length,
    6
  );
  assert.doesNotMatch(
    child,
    /__scfPdvInfra/
  );
});

test('P03 carrega os cinco infra adapters depois dos contracts e antes dos consumidores inline', () => {
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
    '/pdv/infra/browser-network.js'
  ];

  const actual = [
    ...pdv.matchAll(
      /<script src="(\/pdv\/(?:contracts|infra)\/[^"]+)"><\/script>/g
    )
  ].map(
    (match) => match[1]
  );

  assert.deepEqual(
    actual,
    expected
  );

  const firstInlineConsumer =
    pdv.indexOf(
      'id="scf-layout-settle-head"'
    );

  const lastInfra =
    pdv.indexOf(
      '<script src="/pdv/infra/browser-network.js"></script>'
    );

  assert.ok(
    lastInfra >= 0 &&
    lastInfra <
      firstInlineConsumer
  );

  assert.doesNotMatch(
    pdv,
    /<script[^>]+\btype\s*=\s*["']module["']/i
  );
});
