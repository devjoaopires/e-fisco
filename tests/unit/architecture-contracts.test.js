'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..', '..');

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function productionJsFiles() {
  return fs.readdirSync(ROOT, {
    withFileTypes: true
  })
    .filter((entry) => (
      entry.isFile() &&
      entry.name.endsWith('.js') &&
      !/^phase[12]-.*selftest\.js$/.test(entry.name)
    ))
    .map((entry) => entry.name)
    .sort();
}

function localDependencies(source) {
  const dependencies = [];
  const pattern = /require\(\s*['"]\.\/([^'"]+)['"]\s*\)/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    let target = String(match[1]);
    if (!target.endsWith('.js')) {
      target += '.js';
    }
    dependencies.push(target);
  }

  return [...new Set(dependencies)].sort();
}

function actualDependencyMap(files) {
  const result = {};
  for (const file of files) {
    const dependencies = localDependencies(readText(file));
    if (dependencies.length > 0) {
      result[file] = dependencies;
    }
  }
  return result;
}

function edgeList(dependencyMap) {
  const edges = [];
  for (const [from, targets] of Object.entries(dependencyMap)) {
    for (const to of targets) {
      edges.push(`${from} -> ${to}`);
    }
  }
  return edges.sort();
}

function countExportedModules(files) {
  return files.reduce(
    (total, file) => (
      /module\.exports\s*=/.test(readText(file))
        ? total + 1
        : total
    ),
    0
  );
}

function hasCycle(files, dependencyMap) {
  const indegree = new Map(
    files.map((file) => [file, 0])
  );

  for (const targets of Object.values(dependencyMap)) {
    for (const target of targets) {
      assert.equal(
        indegree.has(target),
        true,
        `Dependência local aponta para módulo fora do inventário: ${target}`
      );
      indegree.set(
        target,
        indegree.get(target) + 1
      );
    }
  }

  const queue = files.filter(
    (file) => indegree.get(file) === 0
  );
  let visited = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    visited += 1;

    for (const target of dependencyMap[current] || []) {
      const next = indegree.get(target) - 1;
      indegree.set(target, next);
      if (next === 0) {
        queue.push(target);
      }
    }
  }

  return visited !== files.length;
}

function extractPreloadChannels(source) {
  const channels = [];
  const patterns = [
    /ipcRenderer\.(?:invoke|send)\(\s*['"]([^'"]+)['"]/g,
    /invokeChecked\(\s*['"]([^'"]+)['"]/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      channels.push(match[1]);
    }
  }

  return [...new Set(channels)].sort();
}

function extractMainChannels(source) {
  const channels = [];
  const patterns = [
    /ipcMain\.(?:handle|on)\(\s*['"]([^'"]+)['"]/g,
    /instalarOfflineHandler\(\s*['"]([^'"]+)['"]/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      channels.push(match[1]);
    }
  }

  return [...new Set(channels)].sort();
}

function rawSqlOutsideDb(files) {
  const result = {};

  for (const file of files) {
    if (file === 'offline-db.js') continue;

    const count = (
      readText(file).match(/\.prepare\(/g) || []
    ).length;

    if (count > 0) {
      result[file] = count;
    }
  }

  return result;
}

test('mapa arquitetural cobre exatamente os módulos JavaScript de produção', () => {
  const map = readJson(
    'architecture/module-responsibilities.json'
  );
  const files = productionJsFiles();
  const mappedModules = Object.keys(map.modules).sort();

  const layerAssignments = map.layers
    .flatMap((layer) => layer.modules)
    .slice()
    .sort();

  assert.deepEqual(mappedModules, files);
  assert.deepEqual(layerAssignments, files);
  assert.equal(
    new Set(layerAssignments).size,
    files.length,
    'Cada módulo deve pertencer a exatamente uma camada.'
  );

  assert.equal(
    map.counts.productionJsFiles,
    files.length
  );
  assert.equal(
    map.counts.exportedModules,
    countExportedModules(files)
  );
});

test('snapshot de dependências locais é exato e permanece acíclico', () => {
  const map = readJson(
    'architecture/module-responsibilities.json'
  );
  const analysis = readJson(
    'architecture/dependency-analysis.json'
  );
  const files = productionJsFiles();
  const actual = actualDependencyMap(files);

  assert.deepEqual(
    edgeList(actual),
    edgeList(map.directDependencies)
  );

  const edges = edgeList(actual);

  assert.equal(
    edges.length,
    map.counts.internalRequireEdges
  );
  assert.equal(
    analysis.graph.nodes,
    files.length
  );
  assert.equal(
    analysis.graph.edges,
    edges.length
  );
  assert.equal(
    hasCycle(files, actual),
    false,
    'O grafo CommonJS local não pode introduzir ciclo.'
  );
  assert.equal(analysis.graph.acyclic, true);
  assert.equal(analysis.graph.cycleComponents, 0);
});

test('offline-db mantém ownership de SQLite e main não executa SQL bruto', () => {
  const files = productionJsFiles();
  const sqliteImporters = files.filter((file) => (
    /require\(\s*['"]node:sqlite['"]\s*\)/.test(
      readText(file)
    )
  ));

  assert.deepEqual(
    sqliteImporters,
    ['offline-db.js']
  );

  assert.equal(
    (readText('main.js').match(/\.prepare\(/g) || [])
      .length,
    0,
    'main.js não pode voltar a conhecer SQL/schema diretamente.'
  );
});

test('dívida SQL fora do kernel é explícita e não cresce silenciosamente', () => {
  const contracts = readJson(
    'architecture/boundary-contracts.json'
  );
  const files = productionJsFiles();
  const actual = rawSqlOutsideDb(files);

  const boundary = contracts.boundaries.find(
    (item) => item.id === 'raw-sql-access'
  );

  assert.ok(boundary);

  const documented = Object.fromEntries(
    boundary.currentExceptions.map((item) => [
      item.module,
      item.prepareCalls
    ])
  );

  assert.deepEqual(actual, documented);

  const total = Object.values(actual)
    .reduce((sum, value) => sum + value, 0);

  assert.equal(
    total,
    boundary.totalPrepareCallsOutsideOwner
  );
  assert.equal(total, 12);
  assert.equal(Object.keys(actual).length, 4);
});

test('renderer permanece isolado e todos os canais do preload existem no main', () => {
  const contracts = readJson(
    'architecture/boundary-contracts.json'
  );
  const main = readText('main.js');
  const preload = readText('preload.js');
  const ui = [
    readText('offline-ui/offline-shell.html'),
    readText('offline-ui/pdv.html')
  ].join('\n');

  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);

  assert.doesNotMatch(ui, /\brequire\s*\(/);
  assert.doesNotMatch(ui, /\bipcRenderer\b/);

  const preloadChannels = extractPreloadChannels(preload);
  const mainChannels = extractMainChannels(main);

  assert.deepEqual(preloadChannels, mainChannels);

  const boundary = contracts.boundaries.find(
    (item) => item.id === 'preload-to-main-ipc'
  );

  assert.ok(boundary);
  assert.equal(
    preloadChannels.length,
    boundary.preloadChannels
  );
  assert.equal(
    mainChannels.length,
    boundary.mainRegisteredChannels
  );
  assert.equal(boundary.preloadWithoutMain, 0);
  assert.equal(boundary.mainWithoutPreload, 0);
});

test('venda, documento fiscal e outboxes não atravessam as fronteiras de transporte', () => {
  const sale = readText('offline-sale-service.js');

  assert.match(
    sale,
    /require\(\s*['"]\.\/offline-fiscal-sale-pipeline['"]\s*\)/
  );
  assert.doesNotMatch(
    sale,
    /require\(\s*['"]\.\/offline-fiscal-svrs-transport/
  );
  assert.doesNotMatch(
    sale,
    /require\(\s*['"]\.\/offline-fiscal-nfce-(?:xml|qrcode)/
  );

  const documentModules = [
    'offline-fiscal-contingency-service.js',
    'offline-fiscal-nfce-xml.js',
    'offline-fiscal-nfce-qrcode.js',
    'offline-fiscal-nfce-danfe.js',
    'offline-fiscal-xml-signer.js'
  ];

  for (const file of documentModules) {
    const source = readText(file);
    assert.doesNotMatch(
      source,
      /require\(\s*['"]\.\/offline-fiscal-svrs-transport/
    );
    assert.doesNotMatch(
      source,
      /require\(\s*['"]\.\/offline-sync-http-transport/
    );
  }

  assert.doesNotMatch(
    readText('offline-outbox-worker.js'),
    /require\(\s*['"]\.\/offline-sync-http-transport/
  );
});

test('artefatos arquiteturais permanecem alinhados com a release do package', () => {
  const packageJson = readJson('package.json');
  const files = [
    'architecture/module-responsibilities.json',
    'architecture/dependency-analysis.json',
    'architecture/boundary-contracts.json'
  ];

  for (const file of files) {
    const artifact = readJson(file);
    assert.equal(
      artifact.release,
      packageJson.version,
      `${file} deve acompanhar a versão do package.`
    );
    assert.equal(artifact.schemaVersion, 1);
  }
});
