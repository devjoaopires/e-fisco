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

const EXCLUDED_PRODUCTION_DIRS = new Set([
  '.git',
  '.github',
  'architecture',
  'ci',
  'dist',
  'node_modules',
  'tests'
]);

const BASELINE_RAW_SQL_DEBT = Object.freeze({
  'offline-cash-service.js': 5,
  'offline-device-auth.js': 2,
  'offline-fiscal-number-maintenance.js': 3,
  'offline-sale-service.js': 2
});

function repoRelative(absolutePath) {
  return path.relative(ROOT, absolutePath)
    .split(path.sep)
    .join('/');
}

function isExcludedProductionPath(relativePath) {
  const normalized = String(relativePath).replace(/\\/g, '/');
  const firstSegment = normalized.split('/')[0];

  return (
    EXCLUDED_PRODUCTION_DIRS.has(firstSegment) ||
    normalized === 'offline-ui/vendor' ||
    normalized.startsWith('offline-ui/vendor/')
  );
}

function productionJsFiles() {
  const files = [];

  function walk(directory) {
    const entries = fs.readdirSync(directory, {
      withFileTypes: true
    });

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = repoRelative(absolutePath);

      if (isExcludedProductionPath(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      if (
        entry.isFile() &&
        entry.name.endsWith('.js') &&
        !entry.name.includes('.bak.') &&
        !/(^|\/)phase[12]-.*selftest\.js$/.test(relativePath)
      ) {
        files.push(relativePath);
      }
    }
  }

  walk(ROOT);
  return files.sort();
}

function resolveLocalJsDependency(fromFile, specifier) {
  if (!specifier.startsWith('.')) {
    return null;
  }

  const fromAbsolute = path.join(ROOT, fromFile);
  const base = path.resolve(
    path.dirname(fromAbsolute),
    specifier
  );
  const extension = path.extname(base);

  if (extension && extension !== '.js') {
    return null;
  }

  const candidates = extension
    ? [base]
    : [
        base + '.js',
        path.join(base, 'index.js')
      ];

  for (const candidate of candidates) {
    if (
      fs.existsSync(candidate) &&
      fs.statSync(candidate).isFile()
    ) {
      const relative = repoRelative(candidate);
      assert.equal(
        relative.startsWith('../'),
        false,
        'Dependência local escapa da raiz do projeto: ' +
          fromFile + ' -> ' + specifier
      );
      return relative;
    }
  }

  throw new Error(
    'Require local JavaScript não resolvido: ' +
      fromFile + ' -> ' + specifier
  );
}

function localDependencies(source, fromFile) {
  const dependencies = [];
  const pattern = /require\(\s*['"]((?:\.\.?\/)[^'"]+)['"]\s*\)/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const target = resolveLocalJsDependency(
      fromFile,
      String(match[1])
    );

    if (target) {
      dependencies.push(target);
    }
  }

  return [...new Set(dependencies)].sort();
}

function actualDependencyMap(files) {
  const result = {};
  for (const file of files) {
    const dependencies = localDependencies(
      readText(file),
      file
    );
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
    /(?:instalarOfflineHandler|registerOfflineReadHandler|registerOfflineMutationHandler)\(\s*['"]([^'"]+)['"]/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      channels.push(match[1]);
    }
  }

  return [...new Set(channels)].sort();
}

function isOfflineDbOwnedFile(file) {
  return (
    file === 'offline-db.js' ||
    file.startsWith('offline-db/')
  );
}

function rawSqlOutsideDb(files) {
  const result = {};

  for (const file of files) {
    if (isOfflineDbOwnedFile(file)) continue;

    const count = (
      readText(file).match(/\.prepare\(/g) || []
    ).length;

    if (count > 0) {
      result[file] = count;
    }
  }

  return result;
}

function buildFilePatternMatches(relativePath, pattern) {
  const normalizedPath = String(relativePath)
    .replace(/\\/g, '/');
  const normalizedPattern = String(pattern)
    .replace(/\\/g, '/');

  const regexSource = normalizedPattern
    .replace(/[.+?^$(){}|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__DOUBLE_STAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLE_STAR__/g, '.*');

  return new RegExp('^' + regexSource + '$')
    .test(normalizedPath);
}

function expectedSqliteOwner(files) {
  return files.includes('offline-db/connection.js')
    ? 'offline-db/connection.js'
    : 'offline-db.js';
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

test('ownership de SQLite acompanha a conexão dedicada e main não executa SQL bruto', () => {
  const files = productionJsFiles();
  const sqliteImporters = files.filter((file) => (
    /require\(\s*['"]node:sqlite['"]\s*\)/.test(
      readText(file)
    )
  ));

  assert.deepEqual(
    sqliteImporters,
    [expectedSqliteOwner(files)]
  );

  assert.equal(
    (readText('main.js').match(/\.prepare\(/g) || [])
      .length,
    0,
    'main.js não pode voltar a conhecer SQL/schema diretamente.'
  );
});

test('migrations V1-V13 têm owner dedicado sem vazar para a fachada', () => {
  const facade = readText('offline-db.js');
  const manifest = readText(
    'offline-db/migrations/index.js'
  );
  const versions = readText(
    'offline-db/migrations/versions/index.js'
  );

  assert.doesNotMatch(
    facade,
    /function applyMigrationV\d+\s*\(/
  );
  assert.match(
    facade,
    /migrateOfflineDatabase\(db\)/
  );
  assert.match(
    manifest,
    /const OFFLINE_DB_SCHEMA_VERSION = 13;/
  );
  assert.match(
    manifest,
    /require\(['"]\.\/versions['"]\)/
  );

  const implementations = (
    versions.match(
      /function applyMigrationV\d+\s*\(db\)/g
    ) || []
  );

  assert.equal(implementations.length, 13);

  for (let version = 1; version <= 13; version += 1) {
    assert.match(
      versions,
      new RegExp(
        'function applyMigrationV' + version + '\\s*\\(db\\)'
      )
    );
  }

  assert.doesNotMatch(
    manifest + versions,
    /require\(\s*['"]node:sqlite['"]\s*\)/
  );
});

test('transaction context é o owner dos comandos transacionais do kernel DB', () => {
  const files = productionJsFiles()
    .filter(isOfflineDbOwnedFile);

  const rawTransactionOwners = files.filter((file) => (
    /BEGIN IMMEDIATE|COMMIT;|ROLLBACK;/.test(
      readText(file)
    )
  ));

  assert.deepEqual(
    rawTransactionOwners,
    ['offline-db/transaction.js']
  );

  const facade = readText('offline-db.js');
  const versions = readText(
    'offline-db/migrations/versions/index.js'
  );
  const syncOutbox = readText(
    'offline-db/outbox/sync-outbox.js'
  );
  const fiscalOutbox = readText(
    'offline-db/outbox/fiscal-outbox.js'
  );
  const stockRepository = readText(
    'offline-db/repositories/stock.js'
  );
  const fiscalNumberingRepository = readText(
    'offline-db/repositories/fiscal-numbering.js'
  );
  const crediarioAtomic = readText(
    'offline-db/atomic/crediario.js'
  );
  const salesRepository = readText(
    'offline-db/repositories/sales.js'
  );
  const saleAtomic = readText(
    'offline-db/atomic/sale.js'
  );
  const transaction = readText(
    'offline-db/transaction.js'
  );

  assert.equal(
    (facade.match(
      /beginImmediateTransaction\(db\)/g
    ) || []).length,
    3
  );
  assert.equal(
    (versions.match(
      /beginImmediateTransaction\(db\)/g
    ) || []).length,
    13
  );
  assert.equal(
    (syncOutbox.match(
      /beginImmediateTransaction\(db\)/g
    ) || []).length,
    2
  );
  assert.equal(
    (fiscalOutbox.match(
      /beginImmediateTransaction\(db\)/g
    ) || []).length,
    7
  );
  assert.equal(
    (stockRepository.match(
      /beginImmediateTransaction\(db\)/g
    ) || []).length,
    1
  );
  assert.equal(
    (fiscalNumberingRepository.match(
      /beginImmediateTransaction\(db\)/g
    ) || []).length,
    2
  );
  assert.equal(
    (crediarioAtomic.match(
      /beginImmediateTransaction\(db\)/g
    ) || []).length,
    2
  );
  assert.equal(
    (salesRepository.match(
      /beginImmediateTransaction\(db\)/g
    ) || []).length,
    1
  );
  assert.equal(
    (saleAtomic.match(
      /beginImmediateTransaction\(db\)/g
    ) || []).length,
    1
  );

  assert.match(
    transaction,
    /function beginImmediateTransaction\(db\)/
  );
  assert.equal(
    (transaction.match(/BEGIN IMMEDIATE/g) || []).length,
    1
  );
  assert.equal(
    (transaction.match(/COMMIT;/g) || []).length,
    1
  );
  assert.equal(
    (transaction.match(/ROLLBACK;/g) || []).length,
    1
  );
});

test('D04 encapsula local_config, credenciais e empresas preparadas no boundary DB', () => {
  const facade = readText('offline-db.js');
  const connection = readText(
    'offline-db/connection.js'
  );
  const localConfig = readText(
    'offline-db/repositories/local-config.js'
  );
  const operatorCredentials = readText(
    'offline-db/repositories/operator-credentials.js'
  );
  const preparedCompanies = readText(
    'offline-db/repositories/prepared-companies.js'
  );
  const deviceAuth = readText(
    'offline-device-auth.js'
  );

  assert.doesNotMatch(
    facade,
    /offline_operator_credentials|offline_provisioned_credentials|offline_prepared_companies/
  );
  assert.match(
    facade,
    /repositories\/operator-credentials/
  );
  assert.match(
    facade,
    /repositories\/prepared-companies/
  );

  assert.match(
    connection,
    /repositories\/local-config/
  );
  assert.match(
    localConfig,
    /FROM local_config|INSERT INTO local_config/
  );

  assert.match(
    operatorCredentials,
    /offline_operator_credentials/
  );
  assert.match(
    operatorCredentials,
    /offline_provisioned_credentials/
  );
  assert.match(
    preparedCompanies,
    /offline_prepared_companies/
  );

  assert.doesNotMatch(
    deviceAuth,
    /\.prepare\(/
  );
  assert.match(
    deviceAuth,
    /__efiscoLocalConfigRepository/
  );
});

test('D05 delega referências de produtos, clientes e fornecedores aos repositories', () => {
  const facade = readText('offline-db.js');
  const products = readText(
    'offline-db/repositories/products.js'
  );
  const customers = readText(
    'offline-db/repositories/customers.js'
  );
  const suppliers = readText(
    'offline-db/repositories/suppliers.js'
  );

  assert.match(
    facade,
    /repositories\/products/
  );
  assert.match(
    facade,
    /repositories\/customers/
  );
  assert.match(
    facade,
    /repositories\/suppliers/
  );

  assert.doesNotMatch(
    facade,
    /INSERT INTO products_cache/
  );
  assert.doesNotMatch(
    facade,
    /INSERT INTO customers_cache/
  );
  assert.doesNotMatch(
    facade,
    /INSERT INTO suppliers_cache/
  );

  assert.match(products, /products_cache/);
  assert.match(customers, /customers_cache/);
  assert.match(suppliers, /suppliers_cache/);

  assert.match(
    facade,
    /function upsertReferenceBatch\(input = \{\}\)/
  );
  assert.match(
    facade,
    /const transaction = beginImmediateTransaction\(db\)/
  );
});

test('D06 move finance/sales read-model para offline-db sem SQL no sale service', () => {
  const facade = readText('offline-db.js');
  const connection = readText(
    'offline-db/connection.js'
  );
  const finance = readText(
    'offline-db/read-models/finance.js'
  );
  const saleService = readText(
    'offline-sale-service.js'
  );

  assert.match(
    facade,
    /read-models\/finance/
  );
  assert.match(
    facade,
    /financeReadModel\.listFinancialMovements/
  );
  assert.match(
    facade,
    /financeReadModel\.getSaleById/
  );

  assert.match(
    connection,
    /attachFinanceReadModel/
  );
  assert.match(
    finance,
    /FROM financial_movements/
  );
  assert.match(
    finance,
    /FROM sales/
  );
  assert.match(
    finance,
    /FROM sale_items/
  );
  assert.match(
    finance,
    /function listOfflineSalesForFinance/
  );

  assert.doesNotMatch(
    saleService,
    /\.prepare\(/
  );
  assert.match(
    saleService,
    /__efiscoFinanceReadModel/
  );
});

test('D07 move ciclo genérico sync_outbox e status summary para owners internos', () => {
  const facade = readText('offline-db.js');
  const syncOutbox = readText(
    'offline-db/outbox/sync-outbox.js'
  );
  const statusReadModel = readText(
    'offline-db/read-models/outbox-status.js'
  );

  assert.match(
    facade,
    /outbox\/sync-outbox/
  );
  assert.match(
    facade,
    /read-models\/outbox-status/
  );

  assert.doesNotMatch(
    facade,
    /const OUTBOX_SELECT/
  );
  assert.doesNotMatch(
    facade,
    /function transitionOutboxFromSending/
  );

  for (const name of [
    'getOutboxOperation',
    'enqueueOutboxOperation',
    'listOutboxReady',
    'claimOutboxOperation',
    'markOutboxRetry',
    'markOutboxConfirmed',
    'markOutboxConflict',
    'markOutboxManualReview',
    'recoverStaleOutbox'
  ]) {
    assert.match(
      syncOutbox,
      new RegExp(
        'function ' + name + '\\s*\\('
      )
    );
  }

  assert.match(
    syncOutbox,
    /FROM sync_outbox|INSERT INTO sync_outbox|UPDATE sync_outbox/
  );
  assert.match(
    statusReadModel,
    /SELECT status, COUNT\(\*\) AS total/
  );
  assert.match(
    facade,
    /onConfirmed:\s*salesRepository\.applyConfirmedSaleSyncStatus/
  );
});

test('7.6 claim da sync_outbox repete barreira de dependências e fiscal continua separado', () => {
  const syncOutbox = readText(
    'offline-db/outbox/sync-outbox.js'
  );
  const fiscalOutbox = readText(
    'offline-db/outbox/fiscal-outbox.js'
  );

  assert.equal(
    (
      syncOutbox.match(
        /FROM json_each\(/g
      ) || []
    ).length,
    2
  );
  assert.equal(
    (
      syncOutbox.match(
        /d\.status <> 'CONFIRMED'/g
      ) || []
    ).length,
    2
  );

  assert.doesNotMatch(
    syncOutbox,
    /fiscal_outbox/
  );
  assert.doesNotMatch(
    fiscalOutbox,
    /sync_outbox/
  );
  assert.match(
    fiscalOutbox,
    /RECONCILE_BY_KEY/
  );
});

test('D08 move cash/financial para repositories/read-model sem SQL no cash service', () => {
  const facade = readText('offline-db.js');
  const connection = readText(
    'offline-db/connection.js'
  );
  const cashRepository = readText(
    'offline-db/repositories/cash.js'
  );
  const financeRepository = readText(
    'offline-db/repositories/finance.js'
  );
  const cashReadModel = readText(
    'offline-db/read-models/cash.js'
  );
  const cashService = readText(
    'offline-cash-service.js'
  );

  assert.match(
    facade,
    /repositories\/cash/
  );
  assert.match(
    facade,
    /repositories\/finance/
  );
  assert.match(
    facade,
    /read-models\/cash/
  );

  assert.match(
    connection,
    /attachCashRepository/
  );
  assert.match(
    connection,
    /attachCashReadModel/
  );

  assert.match(
    cashRepository,
    /INSERT INTO cash_sessions/
  );
  assert.match(
    cashRepository,
    /INSERT INTO cash_movements/
  );
  assert.match(
    financeRepository,
    /INSERT INTO financial_movements/
  );
  assert.match(
    cashReadModel,
    /FROM cash_movements/
  );
  assert.match(
    cashReadModel,
    /FROM financial_movements/
  );

  assert.doesNotMatch(
    cashService,
    /\.prepare\(/
  );
  assert.doesNotMatch(
    cashService,
    /BEGIN IMMEDIATE|COMMIT;|ROLLBACK;/
  );
  assert.match(
    cashService,
    /__efiscoCashRepository/
  );
  assert.match(
    cashService,
    /__efiscoCashReadModel/
  );
});

test('D09 move fiscal_outbox, fiscal profile e reads fiscais para owners internos', () => {
  const facade = readText('offline-db.js');
  const fiscalProfile = readText(
    'offline-db/repositories/fiscal-profile.js'
  );
  const fiscalReadModel = readText(
    'offline-db/read-models/fiscal.js'
  );
  const fiscalOutbox = readText(
    'offline-db/outbox/fiscal-outbox.js'
  );

  assert.match(
    facade,
    /repositories\/fiscal-profile/
  );
  assert.match(
    facade,
    /read-models\/fiscal/
  );
  assert.match(
    facade,
    /outbox\/fiscal-outbox/
  );

  assert.doesNotMatch(
    facade,
    /INSERT INTO fiscal_outbox/
  );
  assert.doesNotMatch(
    facade,
    /SELECT \* FROM fiscal_outbox/
  );
  assert.doesNotMatch(
    facade,
    /INSERT INTO fiscal_profile_cache/
  );

  assert.match(
    fiscalProfile,
    /INSERT INTO fiscal_profile_cache/
  );
  assert.match(
    fiscalProfile,
    /FROM fiscal_profile_cache/
  );

  assert.match(
    fiscalReadModel,
    /FROM nfce_documents/
  );
  assert.match(
    fiscalReadModel,
    /JOIN fiscal_outbox/
  );

  assert.match(
    fiscalOutbox,
    /INSERT INTO fiscal_outbox/
  );
  assert.match(
    fiscalOutbox,
    /UPDATE fiscal_outbox/
  );
  assert.match(
    fiscalOutbox,
    /UPDATE nfce_documents/
  );
});

test('D10 move estoque genérico e conversões para repository dedicado', () => {
  const facade = readText('offline-db.js');
  const stock = readText(
    'offline-db/repositories/stock.js'
  );

  assert.match(
    facade,
    /repositories\/stock/
  );
  assert.match(
    facade,
    /stockRepository\s*\.registerStockMovement/
  );
  assert.match(
    facade,
    /stockRepository\s*\.getStockProjection/
  );
  assert.match(
    facade,
    /stockRepository\s*\.listPendingStockDeltasByProduct/
  );
  assert.match(
    facade,
    /stockRepository\s*\.listStockMovements/
  );

  assert.match(
    stock,
    /INSERT INTO stock_movements/
  );
  assert.match(
    stock,
    /INSERT INTO stock_projection/
  );
  assert.match(
    stock,
    /FROM stock_projection/
  );
  assert.match(
    stock,
    /JOIN sync_outbox/
  );

  assert.match(
    facade,
    /const STOCK_QUANTITY_SCALE =\s*stockRepository\.STOCK_QUANTITY_SCALE/
  );
  assert.match(
    facade,
    /stockRepository\s*\.decimalToMicrounits/
  );
  assert.match(
    facade,
    /stockRepository\s*\.microunitsToDecimalString/
  );

  assert.match(
    facade,
    /function openCrediarioOfflineAtomic/
  );
  assert.match(
    facade,
    /function updateCrediarioItemsOfflineAtomic/
  );
  assert.match(
    facade,
    /function registerOfflineSaleAtomic/
  );
});

test('D11 move leases/contador fiscal e zera SQL externo da manutenção', () => {
  const facade = readText('offline-db.js');
  const fiscalNumbering = readText(
    'offline-db/repositories/fiscal-numbering.js'
  );
  const localConfig = readText(
    'offline-db/repositories/local-config.js'
  );
  const maintenance = readText(
    'offline-fiscal-number-maintenance.js'
  );

  assert.match(
    facade,
    /repositories\/fiscal-numbering/
  );

  for (const name of [
    'upsertFiscalNumberLease',
    'getFiscalNumberLeaseById',
    'getFiscalNumberLeaseByRequestId',
    'getActiveFiscalNumberLease',
    'getFiscalNumberLeaseInventory',
    'peekNextNfceNumber',
    'reconcileLocalNfceCounter',
    'consumeNextNfceNumber'
  ]) {
    assert.match(
      fiscalNumbering,
      new RegExp(
        'function ' + name + '\\s*\\('
      )
    );
  }

  assert.match(
    fiscalNumbering,
    /FROM fiscal_number_leases|INSERT INTO fiscal_number_leases|UPDATE fiscal_number_leases/
  );
  assert.match(
    fiscalNumbering,
    /Math\.max\(currentNext, remoteNext\)/
  );
  assert.match(
    fiscalNumbering,
    /AND proximo_numero = \?/
  );

  assert.doesNotMatch(
    maintenance,
    /\.prepare\(/
  );
  assert.match(
    maintenance,
    /__efiscoLocalConfigRepository/
  );
  assert.match(
    localConfig,
    /readRaw\(key\)/
  );
  assert.match(
    localConfig,
    /delete\(key\)/
  );

  assert.match(
    facade,
    /function registerOfflineSaleAtomic/
  );
  assert.doesNotMatch(
    facade,
    /fiscal_number_leases/
  );
  assert.match(
    readText('offline-db/atomic/sale.js'),
    /fiscal_number_leases/
  );
});

test('D12 move crediário cache/read-models e atomics para owners internos', () => {
  const facade = readText('offline-db.js');
  const repository = readText(
    'offline-db/repositories/crediario.js'
  );
  const readModel = readText(
    'offline-db/read-models/crediario.js'
  );
  const atomic = readText(
    'offline-db/atomic/crediario.js'
  );

  assert.match(
    facade,
    /repositories\/crediario/
  );
  assert.match(
    facade,
    /read-models\/crediario/
  );
  assert.match(
    facade,
    /atomic\/crediario/
  );

  assert.match(
    repository,
    /INSERT INTO crediarios_cache/
  );
  assert.match(
    repository,
    /DELETE FROM crediarios_cache/
  );
  assert.match(
    readModel,
    /FROM crediarios_cache/
  );
  assert.match(
    readModel,
    /FROM sync_outbox/
  );

  assert.match(
    atomic,
    /function openCrediarioOfflineAtomic/
  );
  assert.match(
    atomic,
    /function updateCrediarioItemsOfflineAtomic/
  );
  assert.match(
    atomic,
    /INSERT INTO stock_movements/
  );
  assert.match(
    atomic,
    /INSERT INTO sync_outbox/
  );

  assert.doesNotMatch(
    facade,
    /CREDIARIO_ABERTURA_OFFLINE/
  );
  assert.doesNotMatch(
    facade,
    /CREDIARIO_AJUSTE_OFFLINE/
  );

  assert.match(
    facade,
    /function registerOfflineSaleAtomic/
  );
  assert.doesNotMatch(
    facade,
    /function applyCrediarioSettlementInTransaction/
  );
  assert.match(
    readText('offline-db/atomic/sale.js'),
    /function applyCrediarioSettlementInTransaction/
  );
});

test('D13 move registerOfflineSaleAtomic e reconciliação de vendas para owners finais', () => {
  const facade = readText('offline-db.js');
  const sales = readText(
    'offline-db/repositories/sales.js'
  );
  const atomic = readText(
    'offline-db/atomic/sale.js'
  );

  assert.match(
    facade,
    /repositories\/sales/
  );
  assert.match(
    facade,
    /atomic\/sale/
  );
  assert.match(
    facade,
    /saleAtomic\.registerOfflineSaleAtomic/
  );
  assert.match(
    facade,
    /salesRepository\.reconcileConfirmedSaleSyncStatuses/
  );
  assert.match(
    facade,
    /salesRepository\.applyConfirmedSaleSyncStatus/
  );

  assert.match(
    sales,
    /UPDATE sales/
  );
  assert.match(
    sales,
    /JOIN sync_outbox/
  );

  for (const table of [
    'INSERT INTO sales',
    'INSERT INTO sale_items',
    'INSERT INTO stock_movements',
    'INSERT INTO stock_projection',
    'INSERT INTO cash_movements',
    'INSERT INTO financial_movements',
    'INSERT INTO nfce_documents',
    'UPDATE fiscal_number_leases',
    'INSERT INTO sync_outbox'
  ]) {
    assert.match(
      atomic,
      new RegExp(table)
    );
  }

  assert.match(
    atomic,
    /function applyCrediarioSettlementInTransaction/
  );
  assert.match(
    atomic,
    /function assertNormalSaleStockAvailableInTransaction/
  );

  assert.doesNotMatch(
    facade,
    /INSERT INTO sales/
  );
  assert.doesNotMatch(
    facade,
    /INSERT INTO sale_items/
  );
  assert.doesNotMatch(
    facade,
    /INSERT INTO stock_movements/
  );
  assert.doesNotMatch(
    facade,
    /INSERT INTO cash_movements/
  );
  assert.doesNotMatch(
    facade,
    /INSERT INTO financial_movements/
  );
  assert.doesNotMatch(
    facade,
    /INSERT INTO sync_outbox/
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

  for (const [file, prepareCalls] of Object.entries(actual)) {
    assert.equal(
      Object.hasOwn(BASELINE_RAW_SQL_DEBT, file),
      true,
      'Novo consumidor de SQL bruto fora de offline-db/**: ' + file
    );
    assert.ok(
      prepareCalls <= BASELINE_RAW_SQL_DEBT[file],
      'Dívida SQL aumentou em ' + file
    );
  }

  assert.ok(
    total <= 12,
    'A dívida SQL externa total só pode diminuir.'
  );
  assert.ok(
    Object.keys(actual).length <= 4,
    'A quantidade de módulos com SQL externo só pode diminuir.'
  );
});

test('scanner arquitetural resolve requires relativos aninhados', () => {
  assert.equal(
    resolveLocalJsDependency(
      'desktop/security/fake.js',
      '../../offline-db'
    ),
    'offline-db.js'
  );
  assert.equal(
    resolveLocalJsDependency(
      'offline/failover/fake.js',
      '../../offline-ui-server'
    ),
    'offline-ui-server.js'
  );
});

test('offline-db interno não vaza para consumidores e não depende da própria fachada', () => {
  const files = productionJsFiles();
  const dependencies = actualDependencyMap(files);

  for (const [from, targets] of Object.entries(dependencies)) {
    if (from.startsWith('offline-db/')) {
      assert.equal(
        targets.includes('offline-db.js'),
        false,
        'Módulo interno do DB não pode importar a fachada: ' + from
      );
    }

    if (!isOfflineDbOwnedFile(from)) {
      const deepImports = targets.filter(
        (target) => target.startsWith('offline-db/')
      );
      assert.deepEqual(
        deepImports,
        [],
        'Consumidor externo não pode importar internals de offline-db/**: ' + from
      );
    }
  }
});

test('P01-P18 restringe /pdv/** e externaliza contracts/infra/state/shared/ui + todos os domains da Etapa 9', () => {
  const server = readText(
    'offline-ui-server.js'
  );
  const pdv = readText(
    'offline-ui/pdv.html'
  );
  const packageJson = readJson(
    'package.json'
  );

  assert.match(
    server,
    /PDV_ASSET_ROUTE_PREFIX\s*=\s*['"]\/pdv\/['"]/
  );
  assert.match(
    server,
    /['"]\.js['"]:\s*['"]application\/javascript; charset=utf-8['"]/
  );
  assert.match(
    server,
    /['"]\.css['"]:\s*['"]text\/css; charset=utf-8['"]/
  );
  assert.match(
    server,
    /decodeURIComponent\(pathname\)/
  );
  assert.match(
    server,
    /fs\.realpathSync\(/
  );
  assert.match(
    server,
    /pathIsInsideRoot\(/
  );

  const pdvScriptSources = [
    ...pdv.matchAll(
      /<script[^>]+\bsrc\s*=\s*['"]([^'"]+)['"][^>]*>/gi
    )
  ]
    .map((match) => match[1])
    .filter((source) =>
      source.startsWith('/pdv/')
    );

  assert.deepEqual(
    pdvScriptSources,
    [
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
      '/pdv/bootstrap.js',
      '/pdv/ui/components/company-header.js',
      '/pdv/ui/components/connectivity-indicator.js',
      '/pdv/domains/products/domain.js',
      '/pdv/domains/sale-payment/domain.js',
      '/pdv/domains/continuity/domain.js',
      '/pdv/domains/sale-payment/sale-core.js',
      '/pdv/domains/sale-payment/payment-core.js',
      '/pdv/domains/continuity/core.js',
      '/pdv/domains/history/domain.js',
      '/pdv/domains/history/core.js',
      '/pdv/domains/fiscal/domain.js',
      '/pdv/domains/printing/domain.js',
      '/pdv/domains/fiscal/receipt.js',
      '/pdv/domains/history/title.js',
      '/pdv/domains/history/compact-card.js',
      '/pdv/domains/history/compact-card-fix.js',
      '/pdv/domains/history/inline-receipt.js',
      '/pdv/domains/history/aligned-card.js',
      '/pdv/domains/history/table-layout.js',
      '/pdv/domains/history/second-copy-click.js',
      '/pdv/domains/history/receipt-close-menu.js',
      '/pdv/domains/history/calendar.js',
      '/pdv/domains/history/embedded-view.js',
      '/pdv/domains/history/calendar-photo.js',
      '/pdv/domains/history/second-copy-state.js',
      '/pdv/domains/suppliers/registration-ui.js',
      '/pdv/domains/customer/domain.js',
      '/pdv/domains/customer/create-update.js',
      '/pdv/domains/customer/list.js',
      '/pdv/domains/customer/edit.js',
      '/pdv/domains/customer/delete.js',
      '/pdv/domains/suppliers/domain.js',
      '/pdv/domains/suppliers/crud.js',
      '/pdv/ui/navigation/access-guard.js',
      '/pdv/domains/history/close-restore-dock.js',
      '/pdv/domains/history/close-document-reset.js',
      '/pdv/domains/cash/domain.js',
      '/pdv/domains/cash/core.js',
      '/pdv/domains/cash/receipt.js',
      '/pdv/domains/history/monthly-dashboard.js',
      '/pdv/domains/inventory/domain.js',
      '/pdv/domains/inventory/core.js',
      '/pdv/domains/products/search.js',
      '/pdv/domains/sale-payment/finalize-standby.js',
      '/pdv/domains/sale-payment/finalize-menu.js',
      '/pdv/domains/sale-payment/finalize-back.js',
      '/pdv/domains/sale-payment/identification-back.js',
      '/pdv/domains/sale-payment/identification-person-nav.js',
      '/pdv/domains/sale-payment/identification-fields-nav.js',
      '/pdv/domains/sale-payment/identification-autofocus.js',
      '/pdv/domains/sale-payment/identification-optional.js',
      '/pdv/domains/fiscal/completed-footer.js',
      '/pdv/domains/fiscal/processing-footer.js',
      '/pdv/domains/cash/back-label.js',
      '/pdv/domains/history/filters.js',
      '/pdv/domains/history/annual-dashboard.js',
      '/pdv/domains/inventory/decor.js',
      '/pdv/domains/inventory/dashboard-decision.js',
      '/pdv/domains/inventory/dashboard-v3.js',
      '/pdv/domains/inventory/dashboard-v4.js',
      '/pdv/domains/inventory/dashboard-v5.js',
      '/pdv/domains/inventory/dashboard-cleanup.js',
      '/pdv/domains/inventory/right-panel.js',
      '/pdv/domains/inventory/annual-sales-dashboard.js',
      '/pdv/domains/suppliers/coordinator.js',
      '/pdv/domains/history/reset-month-on-exit.js',
      '/pdv/domains/printing/history-receipt-view.js',
      '/pdv/domains/printing/frame-controller.js',
      '/pdv/domains/finance/domain.js',
      '/pdv/domains/finance/core.js',
      '/pdv/domains/finance/decor-grid.js',
      '/pdv/domains/finance/summary.js',
      '/pdv/domains/sale-payment/auto-payment.js',
      '/pdv/domains/superadmin/domain.js',
      '/pdv/domains/superadmin/customer-shell.js',
      '/pdv/domains/superadmin/company-form.js',
      '/pdv/domains/superadmin/fiscal-certificate-selector.js',
      '/pdv/domains/superadmin/contact-fields.js',
      '/pdv/domains/superadmin/company-fiscal-tabs.js',
      '/pdv/domains/superadmin/certificate-a1.js',
      '/pdv/domains/superadmin/companies-panel.js',
      '/pdv/domains/superadmin/company-edit.js',
      '/pdv/domains/superadmin/primary-action.js',
      '/pdv/domains/superadmin/form-state.js',
      '/pdv/domains/superadmin/company-details.js',
      '/pdv/domains/superadmin/details-cleanup.js',
      '/pdv/domains/superadmin/residual-arrow-cleanup.js',
      '/pdv/domains/cash/closing-term-back.js',
      '/pdv/domains/crediario/domain.js',
      '/pdv/domains/crediario/offline-confirm-visibility.js',
      '/pdv/domains/inventory/keyboard-navigation.js',
      '/pdv/domains/finance/exit-calendar.js',
      '/pdv/domains/finance/exit-form.js',
      '/pdv/domains/finance/payable-status-reload.js',
      '/pdv/domains/cash/return-to-pdv.js',
      '/pdv/domains/finance/entry-calendar-form.js',
      '/pdv/domains/finance/entry-cash-sync.js',
      '/pdv/domains/cash/receipt-close-on-leave.js',
      '/pdv/domains/finance/entry-label.js',
      '/pdv/domains/crediario/core.js',
      '/pdv/domains/finance/receivable-status.js',
      '/pdv/domains/crediario/focus-protection.js',
      '/pdv/domains/crediario/back.js',
      '/pdv/domains/crediario/side-menu-lock.js',
      '/pdv/domains/crediario/shortcut-legend.js',
      '/pdv/domains/crediario/list-inputs-lock.js',
      '/pdv/domains/crediario/return-to-pdv.js',
      '/pdv/domains/crediario/detail-pdv-close.js',
      '/pdv/domains/crediario/list-top-back.js',
      '/pdv/domains/crediario/list-keyboard.js',
      '/pdv/domains/sale-payment/normal-sale-f11-lock.js',
      '/pdv/domains/finance/calendar-toggle.js',
      '/pdv/domains/finance/entry-month-calendar.js',
      '/pdv/domains/sale-payment/internal-sale-toggle.js'
    ]
  );

  const pdvStyleHrefs = [
    ...pdv.matchAll(
      /<link[^>]+\bhref\s*=\s*['"]([^'"]+)['"][^>]*>/gi
    )
  ]
    .map((match) => match[1])
    .filter((href) =>
      href.startsWith('/pdv/')
    );

  assert.deepEqual(
    pdvStyleHrefs,
    [
      '/pdv/styles/base/layout-settle.css',
      '/pdv/styles/components/header-status.css',
      '/pdv/styles/components/access-menu.css'
    ]
  );
  assert.doesNotMatch(
    pdv,
    /<script[^>]+\btype\s*=\s*['"]module['"]/i
  );

  assert.ok(
    packageJson.build.files.includes(
      'offline-ui/**'
    )
  );
});

test('P03 concentra bridge/event-bus/storage/network do PDV principal nos adapters previstos', () => {
  const pdv = readText(
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

  for (const file of [
    'offline-ui/pdv/infra/shell-bridge.js',
    'offline-ui/pdv/infra/event-bus.js',
    'offline-ui/pdv/infra/storage.js',
    'offline-ui/pdv/infra/dom.js',
    'offline-ui/pdv/infra/browser-network.js'
  ]) {
    assert.ok(
      fs.existsSync(
        path.join(ROOT, file)
      ),
      file
    );
  }
});

test('P04 fixa bootstrap/state ownership e mantém compat somente como adapter', () => {
  const session = readText(
    'offline-ui/pdv/state/session-state.js'
  );
  const runtime = readText(
    'offline-ui/pdv/state/runtime-state.js'
  );
  const navigation = readText(
    'offline-ui/pdv/state/navigation-state.js'
  );
  const compat = readText(
    'offline-ui/pdv/compat/legacy-globals.js'
  );
  const bootstrap = readText(
    'offline-ui/pdv/bootstrap.js'
  );

  for (const source of [
    session,
    runtime,
    navigation
  ]) {
    assert.doesNotMatch(
      source,
      /__scfPdvCompat/
    );
    assert.doesNotMatch(
      source,
      /localStorage|sessionStorage/
    );
  }

  assert.match(
    compat,
    /__scfPdvState/
  );
  assert.match(
    compat,
    /Object\.defineProperty\(/
  );
  assert.match(
    bootstrap,
    /compat\.legacyGlobals\.install\(\)/
  );
  assert.doesNotMatch(
    bootstrap,
    /__scfPdvApp/
  );
  assert.doesNotMatch(
    bootstrap,
    /\brequire\s*\(|\bimport\s+|\bexport\s+/
  );
});

test('todo JavaScript de produção é incluído pelo build.files', () => {
  const packageJson = readJson('package.json');
  const files = productionJsFiles();
  const buildFiles = packageJson.build.files;

  assert.ok(Array.isArray(buildFiles));

  const missing = files.filter((file) => (
    !buildFiles.some((pattern) => (
      typeof pattern === 'string' &&
      buildFilePatternMatches(file, pattern)
    ))
  ));

  assert.deepEqual(
    missing,
    [],
    'Módulos de produção ausentes do pacote Electron: ' +
      missing.join(', ')
  );
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

  const rendererHostConfig = [
    main,
    readText('desktop/windows/main-window.js'),
    readText('desktop/windows/offline-view.js')
  ].join('\n');

  assert.match(
    rendererHostConfig,
    /contextIsolation:\s*true/
  );
  assert.match(
    rendererHostConfig,
    /nodeIntegration:\s*false/
  );
  assert.match(
    rendererHostConfig,
    /sandbox:\s*true/
  );

  assert.doesNotMatch(ui, /\brequire\s*\(/);
  assert.doesNotMatch(ui, /\bipcRenderer\b/);

  const preloadChannels = extractPreloadChannels(preload);
  const mainChannels = extractMainChannels(
    [
      main,
      readText('desktop/ipc/offline-handlers.js')
    ].join('\n')
  );

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
  const architectureDir = path.join(ROOT, 'architecture');
  const files = fs.readdirSync(architectureDir, {
    withFileTypes: true
  })
    .filter((entry) => (
      entry.isFile() &&
      entry.name.endsWith('.json')
    ))
    .map((entry) => 'architecture/' + entry.name)
    .sort();

  assert.ok(
    files.length >= 3,
    'A pasta architecture deve manter os snapshots obrigatórios.'
  );

  for (const file of files) {
    const artifact = readJson(file);
    assert.equal(
      artifact.release,
      packageJson.version,
      file + ' deve acompanhar a versão do package.'
    );
    assert.equal(
      artifact.schemaVersion,
      1,
      file + ' deve usar schemaVersion 1.'
    );
  }
});
