'use strict';

const { applyMigrations } = require('./versions');

const OFFLINE_DB_SCHEMA_VERSION = 13;

const OFFLINE_DB_MIGRATIONS = Object.freeze([
  Object.freeze({ version: 1, name: 'offline-foundation' }),
  Object.freeze({ version: 2, name: 'offline-reference-cache' }),
  Object.freeze({ version: 3, name: 'offline-stock-ledger' }),
  Object.freeze({ version: 4, name: 'offline-sales-outbox' }),
  Object.freeze({ version: 5, name: 'offline-cash-financial-ledgers' }),
  Object.freeze({ version: 6, name: 'offline-outbox-state-machine' }),
  Object.freeze({ version: 7, name: 'offline-nfce-fiscal-foundation' }),
  Object.freeze({
    version: 8,
    name: 'single-owner-nfce-number-reservations'
  }),
  Object.freeze({ version: 9, name: 'offline-crediario-reference-cache' }),
  Object.freeze({ version: 10, name: 'single-cashier-next-number-no-reservations' }),
  Object.freeze({ version: 11, name: 'offline-operator-credentials-cache' }),
  Object.freeze({ version: 12, name: 'offline-prepared-companies-registry' }),
  Object.freeze({ version: 13, name: 'offline-multi-company-provisioned-credentials' })
]);

const OFFLINE_DB_MIGRATION_ACCEPTED_NAMES =
  Object.freeze({
    8: Object.freeze([
      'single-owner-nfce-number-reservations',
      'single-owner-nfce-numbering-legacy'
    ])
  });

function ensureMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);
}

function inspectExistingMigrationState(db) {
  const migrationRows = db.prepare(
    'SELECT version, name FROM schema_migrations ORDER BY version'
  ).all();

  const migrations = migrationRows.map((row) => ({
    version: Number(row.version),
    name: String(row.name)
  }));

  const metaTable = db.prepare(
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'offline_meta'"
  ).get();

  const meta = metaTable
    ? db.prepare(
        'SELECT schema_version FROM offline_meta WHERE singleton_id = 1'
      ).get()
    : null;

  return {
    migrations,
    metaSchemaVersion:
      meta && Number.isSafeInteger(Number(meta.schema_version))
        ? Number(meta.schema_version)
        : null
  };
}

function assertCompatibleExistingSchema(db) {
  const state = inspectExistingMigrationState(db);
  const { migrations, metaSchemaVersion } = state;

  if (!migrations.length) {
    if (
      metaSchemaVersion != null &&
      metaSchemaVersion > OFFLINE_DB_SCHEMA_VERSION
    ) {
      throw new Error(
        `Schema SQLite mais novo que este aplicativo: ${metaSchemaVersion} > ${OFFLINE_DB_SCHEMA_VERSION}.`
      );
    }
    return state;
  }

  for (let index = 0; index < migrations.length; index += 1) {
    const migration = migrations[index];
    const expectedVersion = index + 1;

    if (
      !Number.isSafeInteger(migration.version) ||
      migration.version !== expectedVersion
    ) {
      throw new Error(
        'Histórico de migrations SQLite inválido: versões ausentes, duplicadas ou fora de ordem.'
      );
    }

    if (migration.version > OFFLINE_DB_SCHEMA_VERSION) {
      throw new Error(
        `Schema SQLite mais novo que este aplicativo: migration V${migration.version} > V${OFFLINE_DB_SCHEMA_VERSION}.`
      );
    }

    const expected = OFFLINE_DB_MIGRATIONS[migration.version - 1];
    const acceptedNames =
      expected
        ? (
            OFFLINE_DB_MIGRATION_ACCEPTED_NAMES[
              migration.version
            ] ||
            [expected.name]
          )
        : [];

    if (
      !expected ||
      !acceptedNames.includes(migration.name)
    ) {
      throw new Error(
        `Histórico de migrations SQLite incompatível na V${migration.version}: ${migration.name}.`
      );
    }
  }

  const latestMigrationVersion = migrations[migrations.length - 1].version;

  if (
    metaSchemaVersion != null &&
    metaSchemaVersion > OFFLINE_DB_SCHEMA_VERSION
  ) {
    throw new Error(
      `Schema SQLite mais novo que este aplicativo: ${metaSchemaVersion} > ${OFFLINE_DB_SCHEMA_VERSION}.`
    );
  }

  if (
    metaSchemaVersion == null ||
    metaSchemaVersion !== latestMigrationVersion
  ) {
    throw new Error(
      `Metadados SQLite incompatíveis: offline_meta=${metaSchemaVersion == null ? 'ausente' : metaSchemaVersion}, migrations=${latestMigrationVersion}.`
    );
  }

  return state;
}

function migrateOfflineDatabase(db) {
  ensureMigrationTable(db);
  assertCompatibleExistingSchema(db);
  applyMigrations(db);
}

module.exports = {
  OFFLINE_DB_SCHEMA_VERSION,
  OFFLINE_DB_MIGRATIONS,
  migrateOfflineDatabase
};
