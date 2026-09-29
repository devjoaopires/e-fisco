'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  compareVersions,
  updatingPage,
  mandatoryUpdatePage,
  createUpdateController
} = require('../../updater/update-controller');

const {
  DEFAULT_MANIFEST_INTERVAL_MS,
  createStandbyController
} = require('../../updater/standby-controller');

function fakeApp(version = '1.0.41') {
  return {
    getVersion() {
      return version;
    },
    getPath(name) {
      return name === 'temp'
        ? 'C:\\temp'
        : 'C:\\user-data';
    }
  };
}

function fakeAutoUpdater() {
  return {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    async checkForUpdates() {
      return {
        updateInfo: {
          version: '1.0.42'
        }
      };
    },
    async downloadUpdate() {},
    quitAndInstall() {}
  };
}

test('update controller preserva comparação e páginas do fluxo obrigatório', () => {
  assert.equal(compareVersions('1.0.42', '1.0.41'), 1);
  assert.equal(compareVersions('1.0.41', '1.0.41'), 0);
  assert.equal(compareVersions('1.0.40', '1.0.41'), -1);

  const updating = decodeURIComponent(
    updatingPage().split(',', 2)[1]
  );
  const mandatory = decodeURIComponent(
    mandatoryUpdatePage('1.0.42').split(',', 2)[1]
  );

  assert.match(updating, /Baixando e instalando a nova versão/);
  assert.match(mandatory, /Nova versão: 1\.0\.42/);
  assert.match(mandatory, /href="efisco-update:\/\/start"/);
});

test('verificação obrigatória mantém flags do electron-updater e só aceita versão maior', async () => {
  const autoUpdater = fakeAutoUpdater();
  const controller = createUpdateController({
    app: fakeApp(),
    autoUpdater,
    updateHelperSourcePath: 'C:\\app\\EFISCO-UPDATER.exe'
  });

  assert.equal(
    await controller.verificarAtualizacaoObrigatoria(),
    '1.0.42'
  );
  assert.equal(autoUpdater.autoDownload, false);
  assert.equal(autoUpdater.autoInstallOnAppQuit, false);

  autoUpdater.checkForUpdates = async () => ({
    updateInfo: {
      version: '1.0.41'
    }
  });

  assert.equal(
    await controller.verificarAtualizacaoObrigatoria(),
    null
  );
});

test('estado lock/ready continua bloqueando versão antiga e sinalizando a versão alvo', () => {
  const files = new Map();
  const logs = [];
  const fakeFs = {
    existsSync(file) {
      return files.has(file);
    },
    readFileSync(file) {
      return files.get(file);
    },
    unlinkSync(file) {
      files.delete(file);
    },
    mkdirSync() {},
    writeFileSync(file, data) {
      files.set(file, data);
    },
    copyFileSync() {}
  };

  const controller = createUpdateController({
    app: fakeApp(),
    autoUpdater: fakeAutoUpdater(),
    updateHelperSourcePath: 'C:\\app\\EFISCO-UPDATER.exe',
    fsImpl: fakeFs,
    log(...args) {
      logs.push(args);
    }
  });

  const lockPath =
    path.win32.join(
      'C:\\user-data',
      'update-state',
      'update.lock'
    );

  files.set(
    lockPath,
    JSON.stringify({
      targetVersion: '1.0.42',
      startedAtUtc: new Date().toISOString()
    })
  );

  assert.equal(
    controller.deveBloquearInicioPorAtualizacao(),
    true
  );

  files.set(
    lockPath,
    JSON.stringify({
      targetVersion: '1.0.41',
      startedAtUtc: new Date().toISOString()
    })
  );

  assert.equal(
    controller.deveBloquearInicioPorAtualizacao(),
    false
  );

  controller.sinalizarNovaVersaoProntaSeNecessario();

  const readyPath =
    path.win32.join(
      'C:\\user-data',
      'update-state',
      'ready.flag'
    );

  assert.equal(files.has(readyPath), true);
  assert.equal(
    JSON.parse(files.get(readyPath)).version,
    '1.0.41'
  );
  assert.equal(
    logs.some(
      entry =>
        entry[0] === 'NOVA VERSAO SINALIZOU READY'
    ),
    true
  );
});

test('update obrigatório mantém ordem load -> download -> helper -> quit e usa path injetado', async () => {
  const calls = [];
  const files = new Set([
    'C:\\app\\EFISCO-UPDATER.exe'
  ]);

  const fakeFs = {
    existsSync(file) {
      return files.has(file);
    },
    readFileSync() {
      return '';
    },
    unlinkSync(file) {
      files.delete(file);
    },
    mkdirSync(dir) {
      calls.push(['mkdir', dir]);
    },
    writeFileSync() {},
    copyFileSync(source, target) {
      calls.push(['copy', source, target]);
    }
  };

  const autoUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    async checkForUpdates() {
      return null;
    },
    async downloadUpdate() {
      calls.push(['download']);
    },
    quitAndInstall(a, b) {
      calls.push(['quit', a, b]);
    }
  };

  let spawnedArgs = null;

  const controller = createUpdateController({
    app: fakeApp(),
    autoUpdater,
    updateHelperSourcePath:
      'C:\\app\\EFISCO-UPDATER.exe',
    fsImpl: fakeFs,
    getMainWindow() {
      return {
        isDestroyed() {
          return false;
        },
        async loadURL(url) {
          calls.push(['load', url]);
        }
      };
    },
    spawnImpl(file, args, options) {
      spawnedArgs = {
        file,
        args,
        options
      };

      const lockIndex =
        args.indexOf('--lock');
      files.add(args[lockIndex + 1]);

      return {
        pid: 321,
        unref() {
          calls.push(['unref']);
        }
      };
    },
    setIntervalFn(callback) {
      const token = {};
      Promise.resolve().then(callback);
      return token;
    },
    clearIntervalFn() {}
  });

  controller.setVersaoAtualizacaoPendente(
    '1.0.42'
  );

  await controller.iniciarAtualizacaoObrigatoria();

  assert.equal(calls[0][0], 'load');
  assert.equal(calls[1][0], 'download');
  assert.equal(
    spawnedArgs.args[
      spawnedArgs.args.indexOf('--version') + 1
    ],
    '1.0.42'
  );
  assert.equal(
    spawnedArgs.file.endsWith('EFISCO-UPDATER.exe'),
    true
  );
  assert.deepEqual(
    calls.at(-1),
    ['quit', true, true]
  );
});

test('standby remoto prepara somente o pacote anunciado e isola falhas', async () => {
  const checks = [];
  const prepares = [];
  const logs = [];

  const controller = createStandbyController({
    app: fakeApp(),
    getUserAgent() {
      return 'UA-TEST';
    },
    log(...args) {
      logs.push(args);
    },
    async checkDesktopManifestImpl(options) {
      checks.push(options);
      return {
        source: 'REMOTE',
        ok: true,
        compatibility: {
          compatible: true
        },
        manifest: {
          offlinePackage: {
            version: '1'
          }
        }
      };
    },
    async prepareOfflinePackageImpl(options) {
      prepares.push(options);
      return {
        prepared: true
      };
    }
  });

  await controller.verificarManifestoStandby();

  assert.equal(checks.length, 1);
  assert.equal(checks[0].timeoutMs, 4000);
  assert.equal(prepares.length, 1);
  assert.equal(prepares[0].timeoutMs, 15000);
  assert.equal(prepares[0].manifest.offlinePackage.version, '1');
  assert.equal(
    logs.some(
      entry =>
        entry[0] === 'STANDBY PACKAGE PREPARE'
    ),
    true
  );
});

test('monitor standby preserva delay inicial, intervalo de cinco minutos, unref e stop idempotente', () => {
  const scheduled = [];
  const cleared = [];
  const intervalToken = {
    unrefCalls: 0,
    unref() {
      this.unrefCalls += 1;
    }
  };

  const controller = createStandbyController({
    app: fakeApp(),
    getUserAgent() {
      return 'UA-TEST';
    },
    async checkDesktopManifestImpl() {
      return {
        source: 'CACHE',
        ok: true
      };
    },
    async prepareOfflinePackageImpl() {},
    setTimeoutFn(callback, delay) {
      scheduled.push(['timeout', delay, callback]);
      return {};
    },
    setIntervalFn(callback, delay) {
      scheduled.push(['interval', delay, callback]);
      return intervalToken;
    },
    clearIntervalFn(token) {
      cleared.push(token);
    }
  });

  controller.iniciarMonitorManifestoStandby();
  controller.iniciarMonitorManifestoStandby();

  assert.equal(
    scheduled.filter(item => item[0] === 'timeout').length,
    1
  );
  assert.equal(
    scheduled.find(item => item[0] === 'timeout')[1],
    1000
  );
  assert.equal(
    scheduled.filter(item => item[0] === 'interval').length,
    1
  );
  assert.equal(
    scheduled.find(item => item[0] === 'interval')[1],
    DEFAULT_MANIFEST_INTERVAL_MS
  );
  assert.equal(intervalToken.unrefCalls, 1);

  controller.pararMonitorManifestoStandby();
  controller.pararMonitorManifestoStandby();

  assert.deepEqual(cleared, [intervalToken]);

  const updateSource = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      'updater',
      'update-controller.js'
    ),
    'utf8'
  );

  assert.equal(
    updateSource.includes('__dirname'),
    false
  );
});


test('composition root mantém owner único dos controllers e helper path injetado pela raiz', () => {
  const root =
    path.resolve(
      __dirname,
      '..',
      '..'
    );
  const source =
    fs.readFileSync(
      path.join(root, 'main.js'),
      'utf8'
    );

  assert.equal(
    (source.match(/createUpdateController\(\{/g) || []).length,
    1
  );
  assert.equal(
    (source.match(/createStandbyController\(\{/g) || []).length,
    1
  );
  assert.match(
    source,
    /updateHelperSourcePath:\s*RUNTIME_PATHS\.updaterHelperPath/
  );
});

test('update obrigatório coalesce chamadas concorrentes e executa download/helper/quit uma vez', async () => {
  const calls = [];
  const files =
    new Set([
      'C:\\app\\EFISCO-UPDATER.exe'
    ]);
  let releaseDownload;

  const controller =
    createUpdateController({
      app: fakeApp(),
      autoUpdater: {
        async checkForUpdates() {
          return null;
        },
        async downloadUpdate() {
          calls.push('download');
          await new Promise((resolve) => {
            releaseDownload = resolve;
          });
        },
        quitAndInstall() {
          calls.push('quit');
        }
      },
      updateHelperSourcePath:
        'C:\\app\\EFISCO-UPDATER.exe',
      fsImpl: {
        existsSync(file) {
          return files.has(file);
        },
        readFileSync() {
          return '';
        },
        unlinkSync(file) {
          files.delete(file);
        },
        mkdirSync() {},
        writeFileSync() {},
        copyFileSync() {}
      },
      spawnImpl(_file, args) {
        calls.push('spawn');
        const lockIndex =
          args.indexOf('--lock');
        files.add(args[lockIndex + 1]);
        return {
          pid: 42,
          unref() {}
        };
      },
      setIntervalFn(callback) {
        Promise.resolve().then(callback);
        return {};
      },
      clearIntervalFn() {}
    });

  controller.setVersaoAtualizacaoPendente(
    '1.0.42'
  );

  const first =
    controller.iniciarAtualizacaoObrigatoria();
  const second =
    controller.iniciarAtualizacaoObrigatoria();

  await Promise.resolve();

  assert.deepEqual(
    calls,
    ['download']
  );

  releaseDownload();

  await first;
  await second;

  assert.deepEqual(
    calls,
    [
      'download',
      'spawn',
      'quit'
    ]
  );
});

test('lock expirado ou inválido é limpo e não bloqueia startup', () => {
  const files = new Map();
  const deleted = [];
  const lockPath =
    path.win32.join(
      'C:\\user-data',
      'update-state',
      'update.lock'
    );
  const readyPath =
    path.win32.join(
      'C:\\user-data',
      'update-state',
      'ready.flag'
    );
  const now =
    Date.parse(
      '2026-09-27T12:00:00.000Z'
    );

  const controller =
    createUpdateController({
      app: fakeApp(),
      autoUpdater: fakeAutoUpdater(),
      updateHelperSourcePath:
        'C:\\app\\EFISCO-UPDATER.exe',
      now() {
        return now;
      },
      fsImpl: {
        existsSync(file) {
          return files.has(file);
        },
        readFileSync(file) {
          return files.get(file);
        },
        unlinkSync(file) {
          deleted.push(file);
          files.delete(file);
        },
        mkdirSync() {},
        writeFileSync() {},
        copyFileSync() {}
      }
    });

  files.set(
    lockPath,
    JSON.stringify({
      targetVersion: '1.0.42',
      startedAtUtc:
        '2026-09-27T11:20:00.000Z'
    })
  );
  files.set(readyPath, 'stale');

  assert.equal(
    controller.deveBloquearInicioPorAtualizacao(),
    false
  );
  assert.equal(files.has(lockPath), false);
  assert.equal(files.has(readyPath), false);

  files.set(lockPath, '{invalid-json');
  files.set(readyPath, 'stale');

  assert.equal(
    controller.deveBloquearInicioPorAtualizacao(),
    false
  );
  assert.equal(files.has(lockPath), false);
  assert.equal(files.has(readyPath), false);
  assert.ok(deleted.length >= 4);
});

test('stop do standby cancela timeout inicial e intervalo sem deixar timer órfão', () => {
  const clearedTimeouts = [];
  const clearedIntervals = [];
  const timeoutToken = {
    unrefCalls: 0,
    unref() {
      this.unrefCalls += 1;
    }
  };
  const intervalToken = {
    unrefCalls: 0,
    unref() {
      this.unrefCalls += 1;
    }
  };

  const controller =
    createStandbyController({
      app: fakeApp(),
      getUserAgent() {
        return 'UA-TEST';
      },
      async checkDesktopManifestImpl() {
        return {
          source: 'CACHE',
          ok: true
        };
      },
      async prepareOfflinePackageImpl() {},
      setTimeoutFn() {
        return timeoutToken;
      },
      clearTimeoutFn(token) {
        clearedTimeouts.push(token);
      },
      setIntervalFn() {
        return intervalToken;
      },
      clearIntervalFn(token) {
        clearedIntervals.push(token);
      }
    });

  controller.iniciarMonitorManifestoStandby();
  controller.pararMonitorManifestoStandby();
  controller.pararMonitorManifestoStandby();

  assert.deepEqual(
    clearedTimeouts,
    [timeoutToken]
  );
  assert.deepEqual(
    clearedIntervals,
    [intervalToken]
  );
  assert.equal(
    timeoutToken.unrefCalls,
    1
  );
  assert.equal(
    intervalToken.unrefCalls,
    1
  );
});
