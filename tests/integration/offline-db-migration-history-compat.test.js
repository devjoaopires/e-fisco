'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DatabaseSync
} = require('node:sqlite');

const {
  OFFLINE_DB_MIGRATIONS,
  migrateOfflineDatabase
} = require('../../offline-db/migrations');

function createHistoricalDatabase(
  v8Name
) {
  const db =
    new DatabaseSync(
      ':memory:'
    );

  db.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE offline_meta (
      singleton_id INTEGER PRIMARY KEY,
      schema_version INTEGER NOT NULL
    ) STRICT;

    INSERT INTO offline_meta (
      singleton_id,
      schema_version
    ) VALUES (1, 13);
  `);

  const insert =
    db.prepare(`
      INSERT INTO schema_migrations (
        version,
        name,
        applied_at
      ) VALUES (?, ?, ?)
    `);

  for (
    const migration of
      OFFLINE_DB_MIGRATIONS
  ) {
    insert.run(
      migration.version,
      migration.version === 8
        ? v8Name
        : migration.name,
      '2026-01-01T00:00:00.000Z'
    );
  }

  return db;
}

test(
  'aceita V8 histórica single-owner-nfce-number-reservations',
  () => {
    const db =
      createHistoricalDatabase(
        'single-owner-nfce-number-reservations'
      );

    try {
      assert.doesNotThrow(
        () =>
          migrateOfflineDatabase(
            db
          )
      );
    } finally {
      db.close();
    }
  }
);

test(
  'aceita alias V8 criado por versões recentes sem reescrever o histórico',
  () => {
    const db =
      createHistoricalDatabase(
        'single-owner-nfce-numbering-legacy'
      );

    try {
      assert.doesNotThrow(
        () =>
          migrateOfflineDatabase(
            db
          )
      );

      const row =
        db.prepare(
          'SELECT name FROM schema_migrations WHERE version = 8'
        )
          .get();

      assert.equal(
        row.name,
        'single-owner-nfce-numbering-legacy'
      );
    } finally {
      db.close();
    }
  }
);

test(
  'continua rejeitando nome V8 desconhecido',
  () => {
    const db =
      createHistoricalDatabase(
        'v8-tampered'
      );

    try {
      assert.throws(
        () =>
          migrateOfflineDatabase(
            db
          ),
        /Histórico de migrations SQLite incompatível na V8/
      );
    } finally {
      db.close();
    }
  }
);

test(
  'instalação nova grava o nome histórico canônico da V8',
  () => {
    const db =
      new DatabaseSync(
        ':memory:'
      );

    try {
      migrateOfflineDatabase(
        db
      );

      const row =
        db.prepare(
          'SELECT name FROM schema_migrations WHERE version = 8'
        )
          .get();

      assert.equal(
        row.name,
        'single-owner-nfce-number-reservations'
      );
    } finally {
      db.close();
    }
  }
);
