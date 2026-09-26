'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  OFFLINE_DB_SCHEMA_VERSION,
  OFFLINE_DB_MIGRATIONS,
  initializeOfflineDatabase,
  getOfflineDatabase,
  closeOfflineDatabase
} = require('../../offline-db');

const {
  withTempDir
} = require('../helpers/temp-dir');

const EXPECTED_TABLES = Object.freeze([
  'cash_movements',
  'cash_sessions',
  'crediarios_cache',
  'customers_cache',
  'financial_movements',
  'fiscal_number_leases',
  'fiscal_outbox',
  'fiscal_profile_cache',
  'local_config',
  'nfce_documents',
  'offline_meta',
  'offline_operator_credentials',
  'offline_prepared_companies',
  'offline_provisioned_credentials',
  'products_cache',
  'sale_items',
  'sales',
  'schema_migrations',
  'stock_movements',
  'stock_projection',
  'suppliers_cache',
  'sync_outbox'
]);

async function withFreshDatabase(callback) {
  return withTempDir(async (userDataDir) => {
    try {
      const info = initializeOfflineDatabase({ userDataDir });
      return await callback({
        userDataDir,
        info,
        db: getOfflineDatabase()
      });
    } finally {
      try {
        closeOfflineDatabase();
      } catch (_) {}
    }
  }, 'efisco-step51-schema-');
}

test('manifesto de migrations é contíguo e termina na versão atual do schema', () => {
  assert.equal(OFFLINE_DB_SCHEMA_VERSION, 13);
  assert.equal(Object.isFrozen(OFFLINE_DB_MIGRATIONS), true);
  assert.equal(OFFLINE_DB_MIGRATIONS.length, OFFLINE_DB_SCHEMA_VERSION);

  assert.deepEqual(
    OFFLINE_DB_MIGRATIONS.map((migration) => migration.version),
    Array.from(
      { length: OFFLINE_DB_SCHEMA_VERSION },
      (_, index) => index + 1
    )
  );

  for (const migration of OFFLINE_DB_MIGRATIONS) {
    assert.equal(Object.isFrozen(migration), true);
    assert.match(migration.name, /^[a-z0-9-]+$/);
  }
});

test('banco novo aplica exatamente o manifesto V1 a V13', async () => {
  await withFreshDatabase(({ info, db }) => {
    assert.equal(info.ok, true);
    assert.equal(info.reused, false);
    assert.equal(info.schemaVersion, OFFLINE_DB_SCHEMA_VERSION);

    assert.deepEqual(
      info.migrations.map(({ version, name }) => ({ version, name })),
      OFFLINE_DB_MIGRATIONS.map(({ version, name }) => ({ version, name }))
    );

    const rows = db.prepare(
      'SELECT version, name, applied_at FROM schema_migrations ORDER BY version'
    ).all();

    assert.equal(rows.length, OFFLINE_DB_SCHEMA_VERSION);

    assert.deepEqual(
      rows.map(({ version, name }) => ({
        version: Number(version),
        name: String(name)
      })),
      OFFLINE_DB_MIGRATIONS.map(({ version, name }) => ({ version, name }))
    );

    for (const row of rows) {
      assert.equal(
        Number.isNaN(new Date(String(row.applied_at)).getTime()),
        false
      );
    }
  });
});

test('offline_meta termina sincronizado com a versão 13', async () => {
  await withFreshDatabase(({ db }) => {
    const rows = db.prepare(
      'SELECT singleton_id, schema_version, created_at, last_open_at FROM offline_meta'
    ).all();

    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].singleton_id), 1);
    assert.equal(
      Number(rows[0].schema_version),
      OFFLINE_DB_SCHEMA_VERSION
    );
    assert.equal(
      Number.isNaN(new Date(String(rows[0].created_at)).getTime()),
      false
    );
    assert.equal(
      Number.isNaN(new Date(String(rows[0].last_open_at)).getTime()),
      false
    );
  });
});

test('schema V13 contém exatamente as 22 tabelas de aplicação esperadas', async () => {
  await withFreshDatabase(({ db }) => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all().map((row) => String(row.name));

    assert.deepEqual(tables, EXPECTED_TABLES);
  });
});

test('todas as tabelas de aplicação do schema V13 usam STRICT', async () => {
  await withFreshDatabase(({ db }) => {
    const tableList = db.prepare('PRAGMA table_list').all();
    const byName = new Map(
      tableList.map((row) => [String(row.name), Number(row.strict)])
    );

    for (const table of EXPECTED_TABLES) {
      assert.equal(
        byName.get(table),
        1,
        `Tabela ${table} deve permanecer STRICT.`
      );
    }
  });
});
