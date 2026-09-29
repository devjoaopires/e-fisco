'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  mainWindowOptions,
  createMainWindow,
  bindMainWindowLifecycle,
  bindMainWindowReadyToShow
} = require('../../desktop/windows/main-window');

const {
  offlineViewOptions,
  createOfflineView,
  loadOfflineView,
  checkOfflineViewHealth,
  bindOfflineViewDiagnostics,
  attachOfflineView,
  closeOfflineView
} = require('../../desktop/windows/offline-view');

const {
  offlineDiagnosticViewOptions,
  createOfflineDiagnosticView,
  buildOfflineDiagnosticHtml,
  loadOfflineDiagnosticView,
  attachOfflineDiagnosticView,
  closeOfflineDiagnosticView
} = require('../../desktop/windows/offline-diagnostic-view');

test('mainWindow preserva opções visuais, paths injetados e hardening do renderer', () => {
  const options = mainWindowOptions({
    iconPath: 'C:\\app\\icone_app.ico',
    preloadPath: 'C:\\app\\preload.js'
  });

  assert.equal(options.width, 1280);
  assert.equal(options.height, 800);
  assert.equal(options.show, false);
  assert.equal(options.icon, 'C:\\app\\icone_app.ico');
  assert.equal(options.frame, true);
  assert.equal(options.skipTaskbar, false);
  assert.equal(options.closable, true);
  assert.equal(options.minimizable, true);
  assert.equal(options.maximizable, true);
  assert.equal(options.fullscreenable, false);
  assert.equal(options.autoHideMenuBar, true);
  assert.deepEqual(
    options.webPreferences,
    {
      preload: 'C:\\app\\preload.js',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false
    }
  );

  let captured = null;

  class FakeBrowserWindow {
    constructor(received) {
      captured = received;
    }
  }

  createMainWindow({
    iconPath: 'C:\\app\\icone_app.ico',
    preloadPath: 'C:\\app\\preload.js',
    BrowserWindowImpl: FakeBrowserWindow
  });

  assert.deepEqual(captured, options);
});

test('lifecycle da mainWindow preserva eventos e ready-to-show', () => {
  const handlers = new Map();
  const onceHandlers = new Map();
  const calls = [];

  const mainWindow = {
    on(name, callback) {
      handlers.set(name, callback);
    },
    once(name, callback) {
      onceHandlers.set(name, callback);
    },
    show() {
      calls.push('show');
    },
    maximize() {
      calls.push('maximize');
    }
  };

  const callbacks = {
    onResize() {},
    onMaximize() {},
    onUnmaximize() {},
    onFocus() {},
    onBlur() {},
    onClosed() {}
  };

  bindMainWindowLifecycle({
    mainWindow,
    ...callbacks
  });

  assert.deepEqual(
    [...handlers.keys()],
    [
      'resize',
      'maximize',
      'unmaximize',
      'focus',
      'blur',
      'closed'
    ]
  );
  assert.equal(handlers.get('resize'), callbacks.onResize);
  assert.equal(handlers.get('maximize'), callbacks.onMaximize);
  assert.equal(handlers.get('unmaximize'), callbacks.onUnmaximize);
  assert.equal(handlers.get('focus'), callbacks.onFocus);
  assert.equal(handlers.get('blur'), callbacks.onBlur);
  assert.equal(handlers.get('closed'), callbacks.onClosed);

  bindMainWindowReadyToShow(mainWindow);
  assert.equal(onceHandlers.has('ready-to-show'), true);

  onceHandlers.get('ready-to-show')();

  assert.deepEqual(
    calls,
    ['show', 'maximize']
  );
});

test('offlineView preserva WebPreferences, transparência, user-agent e background throttling', () => {
  const options = offlineViewOptions({
    preloadPath: 'C:\\app\\preload.js'
  });

  assert.deepEqual(
    options,
    {
      webPreferences: {
        preload: 'C:\\app\\preload.js',
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        devTools: false
      }
    }
  );

  let captured = null;
  const calls = [];

  class FakeWebContentsView {
    constructor(received) {
      captured = received;
      this.webContents = {
        setUserAgent(value) {
          calls.push(['ua', value]);
        },
        setBackgroundThrottling(value) {
          calls.push(['throttle', value]);
        }
      };
    }

    setBackgroundColor(value) {
      calls.push(['background', value]);
    }
  }

  const view = createOfflineView({
    preloadPath: 'C:\\app\\preload.js',
    userAgent: 'UA-TEST',
    WebContentsViewImpl: FakeWebContentsView
  });

  assert.ok(view instanceof FakeWebContentsView);
  assert.deepEqual(captured, options);
  assert.deepEqual(
    calls,
    [
      ['background', '#00000000'],
      ['ua', 'UA-TEST'],
      ['throttle', false]
    ]
  );
});

test('offlineView mantém load, attach e close como operações únicas de lifecycle', async () => {
  const calls = [];

  const view = {
    webContents: {
      async loadURL(url, options) {
        calls.push(['load', url, options]);
      },
      isDestroyed() {
        return false;
      },
      close() {
        calls.push(['close']);
      }
    }
  };

  const mainWindow = {
    contentView: {
      addChildView(received) {
        calls.push(['attach', received]);
      }
    }
  };

  await loadOfflineView({
    offlineView: view,
    shellUrl: 'http://127.0.0.1:54321/offline-shell.html',
    userAgent: 'UA-TEST'
  });

  attachOfflineView({
    mainWindow,
    offlineView: view
  });

  closeOfflineView(view);

  assert.deepEqual(
    calls,
    [
      [
        'load',
        'http://127.0.0.1:54321/offline-shell.html',
        { userAgent: 'UA-TEST' }
      ],
      ['attach', view],
      ['close']
    ]
  );
});

test('offlineView health-check exige shell, preload e PDV prontos', async () => {
  const view = {
    webContents: {
      isDestroyed() {
        return false;
      },
      async executeJavaScript() {
        return {
          shellReady: true,
          preloadReady: true,
          preloadVersion: '1.0.44',
          pdvFramePresent: true,
          pdvReady: true,
          pdvMarkerReady: true,
          pdvScriptReady: true
        };
      }
    }
  };

  const health =
    await checkOfflineViewHealth({
      offlineView: view,
      expectedVersion: '1.0.44',
      timeoutMs: 500
    });

  assert.equal(
    health.ok,
    true
  );
  assert.equal(
    health.reason,
    'HEALTHY'
  );
  assert.equal(
    health.preloadVersion,
    '1.0.44'
  );
  assert.equal(
    health.pdvMarkerReady,
    true
  );
  assert.equal(
    health.pdvScriptReady,
    true
  );
});

test('offlineView diagnostics detecta falha, crash e travamento do renderer', () => {
  const handlers =
    new Map();
  const failures = [];
  const responsive = [];

  const view = {
    webContents: {
      on(
        event,
        listener
      ) {
        handlers.set(
          event,
          listener
        );
      }
    }
  };

  assert.equal(
    bindOfflineViewDiagnostics({
      offlineView: view,
      onFailure(
        diagnostic
      ) {
        failures.push(
          diagnostic
        );
      },
      onResponsive(
        diagnostic
      ) {
        responsive.push(
          diagnostic
        );
      }
    }),
    true
  );

  assert.deepEqual(
    [...handlers.keys()],
    [
      'did-fail-load',
      'preload-error',
      'render-process-gone',
      'unresponsive',
      'responsive',
      'destroyed'
    ]
  );

  handlers.get(
    'did-fail-load'
  )(
    {},
    -3,
    'ERR_ABORTED',
    'http://127.0.0.1/abort',
    true,
    1,
    2
  );

  assert.equal(
    failures.length,
    0
  );

  handlers.get(
    'did-fail-load'
  )(
    {},
    -105,
    'ERR_NAME_NOT_RESOLVED',
    'http://127.0.0.1/pdv.html',
    false,
    10,
    20
  );

  handlers.get(
    'preload-error'
  )(
    {},
    'C:\\app\\preload.js',
    new Error(
      'preload quebrado'
    )
  );

  handlers.get(
    'render-process-gone'
  )(
    {},
    {
      reason: 'crashed',
      exitCode: 9
    }
  );

  handlers.get(
    'unresponsive'
  )();

  handlers.get(
    'responsive'
  )();

  handlers.get(
    'destroyed'
  )();

  assert.deepEqual(
    failures.map(
      (entry) =>
        entry.type
    ),
    [
      'DID_FAIL_LOAD',
      'PRELOAD_ERROR',
      'RENDER_PROCESS_GONE',
      'UNRESPONSIVE',
      'DESTROYED'
    ]
  );

  assert.equal(
    failures[0].errorCode,
    -105
  );
  assert.equal(
    failures[1].error,
    'preload quebrado'
  );
  assert.equal(
    failures[2].reason,
    'crashed'
  );
  assert.deepEqual(
    responsive,
    [
      {
        type: 'RESPONSIVE'
      }
    ]
  );
});

test('offline diagnostic view é isolada e renderiza código sem conteúdo executável', async () => {
  assert.deepEqual(
    offlineDiagnosticViewOptions(),
    {
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        devTools: false
      }
    }
  );

  const calls = [];
  let capturedOptions = null;

  class FakeDiagnosticView {
    constructor(options) {
      capturedOptions = options;
      this.webContents = {
        setUserAgent(value) {
          calls.push([
            'ua',
            value
          ]);
        },
        isDestroyed() {
          return false;
        },
        async loadURL(
          url,
          options
        ) {
          calls.push([
            'load',
            url,
            options
          ]);
        },
        close() {
          calls.push([
            'close'
          ]);
        }
      };
    }

    setBackgroundColor(value) {
      calls.push([
        'background',
        value
      ]);
    }
  }

  const view =
    createOfflineDiagnosticView({
      userAgent: 'UA-DIAG',
      WebContentsViewImpl:
        FakeDiagnosticView
    });

  assert.deepEqual(
    capturedOptions,
    offlineDiagnosticViewOptions()
  );

  const html =
    buildOfflineDiagnosticHtml({
      code: 'OFFLINE-UI-003',
      type:
        '<script>alert(1)</script>',
      version: '1.0.41',
      detectedAt:
        '2026-09-28T16:00:00.000Z'
    });

  assert.equal(
    html.includes(
      'OFFLINE-UI-003'
    ),
    true
  );
  assert.equal(
    html.includes(
      '<script>alert(1)</script>'
    ),
    false
  );
  assert.equal(
    html.includes(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    ),
    true
  );

  await loadOfflineDiagnosticView({
    diagnosticView: view,
    userAgent: 'UA-DIAG',
    diagnostic: {
      code:
        'OFFLINE-UI-003',
      type:
        'RENDER_PROCESS_GONE',
      version:
        '1.0.41'
    }
  });

  const mainWindow = {
    contentView: {
      addChildView(received) {
        calls.push([
          'attach',
          received
        ]);
      }
    }
  };

  attachOfflineDiagnosticView({
    mainWindow,
    diagnosticView: view
  });

  closeOfflineDiagnosticView(
    view
  );

  assert.equal(
    calls.some(
      (entry) =>
        entry[0] ===
          'load' &&
        String(
          entry[1]
        ).startsWith(
          'data:text/html;charset=utf-8,'
        )
    ),
    true
  );

  assert.equal(
    calls.some(
      (entry) =>
        entry[0] ===
          'attach' &&
        entry[1] ===
          view
    ),
    true
  );

  assert.equal(
    calls.some(
      (entry) =>
        entry[0] ===
          'close'
    ),
    true
  );
});

test('módulos de janela não recalculam recursos da raiz com __dirname', () => {
  const root = path.resolve(__dirname, '..', '..');

  for (const relative of [
    'desktop/windows/main-window.js',
    'desktop/windows/offline-view.js'
  ]) {
    const source = fs.readFileSync(
      path.join(root, relative),
      'utf8'
    );

    assert.equal(
      source.includes('__dirname'),
      false,
      relative + ' deve receber paths resolvidos pelo composition root'
    );
  }
});


const {
  offlineOverlayBounds: step52OfflineOverlayBounds,
  offlineParkedBounds: step52OfflineParkedBounds,
  offlineStagingBounds: step52OfflineStagingBounds,
  resizeOfflineOverlay: step52ResizeOfflineOverlay
} = require('../../desktop/windows/window-layout');

test('window layout calcula overlay, parked e staging a partir do content bounds real', () => {
  const mainWindow = {
    isDestroyed() {
      return false;
    },
    getContentBounds() {
      return {
        x: 100,
        y: 200,
        width: 1280,
        height: 720
      };
    }
  };

  assert.deepEqual(
    step52OfflineOverlayBounds(mainWindow),
    {
      x: 0,
      y: 0,
      width: 1280,
      height: 720
    }
  );

  assert.deepEqual(
    step52OfflineParkedBounds(mainWindow),
    {
      x: 0,
      y: 736,
      width: 1,
      height: 1
    }
  );

  assert.deepEqual(
    step52OfflineStagingBounds(mainWindow),
    {
      x: 0,
      y: 736,
      width: 1280,
      height: 720
    }
  );
});

test('window layout falha fechado para mainWindow ausente ou destruída', () => {
  const destroyed = {
    isDestroyed() {
      return true;
    }
  };

  for (const mainWindow of [null, destroyed]) {
    assert.deepEqual(
      step52OfflineOverlayBounds(mainWindow),
      {
        x: 0,
        y: 0,
        width: 1,
        height: 1
      }
    );

    assert.deepEqual(
      step52OfflineParkedBounds(mainWindow),
      {
        x: 0,
        y: 2,
        width: 1,
        height: 1
      }
    );

    assert.deepEqual(
      step52OfflineStagingBounds(mainWindow),
      {
        x: 0,
        y: 2,
        width: 1,
        height: 1
      }
    );
  }
});

test('resizeOfflineOverlay alterna somente entre bounds visíveis e parked', () => {
  const applied = [];
  const mainWindow = {
    isDestroyed() {
      return false;
    },
    getContentBounds() {
      return {
        width: 900,
        height: 600
      };
    }
  };
  const offlineView = {
    setBounds(value) {
      applied.push(value);
    }
  };

  for (const offlineUiMode of [
    'OFFLINE',
    'SWITCHING_OFFLINE',
    'ONLINE'
  ]) {
    step52ResizeOfflineOverlay({
      mainWindow,
      offlineView,
      offlineViewReady: true,
      offlineUiMode
    });
  }

  assert.deepEqual(
    applied,
    [
      {
        x: 0,
        y: 0,
        width: 900,
        height: 600
      },
      {
        x: 0,
        y: 0,
        width: 900,
        height: 600
      },
      {
        x: 0,
        y: 616,
        width: 1,
        height: 1
      }
    ]
  );

  step52ResizeOfflineOverlay({
    mainWindow,
    offlineView,
    offlineViewReady: false,
    offlineUiMode: 'OFFLINE'
  });

  step52ResizeOfflineOverlay({
    mainWindow,
    offlineView: null,
    offlineViewReady: true,
    offlineUiMode: 'OFFLINE'
  });

  assert.equal(
    applied.length,
    3
  );
});

test('lifecycle de janelas permanece com owner único no composition root', () => {
  const root = path.resolve(__dirname, '..', '..');
  const source = fs.readFileSync(
    path.join(root, 'main.js'),
    'utf8'
  );

  assert.equal(
    (source.match(/createMainWindow\(\{/g) || []).length,
    1
  );
  assert.equal(
    (source.match(/createOfflineView\(\{/g) || []).length,
    1
  );
  assert.equal(
    (source.match(/loadOfflineView\(\{/g) || []).length,
    1
  );
  assert.equal(
    (source.match(/bindMainWindowLifecycle\(\{/g) || []).length,
    1
  );
  assert.equal(
    (source.match(/bindMainWindowReadyToShow\(/g) || []).length,
    1
  );
  assert.match(
    source,
    /offlineView\.setBounds\(offlineParkedBounds\(\)\);/
  );
});
