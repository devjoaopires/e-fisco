'use strict';

const fs = require('fs');
const path = require('path');
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

function expectedDbPath(userDataDir) {
  return path.join(
    userDataDir,
    'offline-data',
    'e-fisco-offline.db'
  );
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

test('primeira abertura cria o SQLite no caminho temporário esperado', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      const info = initializeOfflineDatabase({ userDataDir });
      const dbPath = expectedDbPath(userDataDir);

      assert.equal(info.ok, true);
      assert.equal(info.reused, false);
      assert.equal(path.resolve(info.path), path.resolve(dbPath));
      assert.equal(fs.existsSync(dbPath), true);
      assert.equal(fs.statSync(dbPath).isFile(), true);

      assert.equal(info.schemaVersion, OFFLINE_DB_SCHEMA_VERSION);
      assert.equal(info.journalMode.toLowerCase(), 'wal');
      assert.equal(info.foreignKeysEnabled, true);
      assert.equal(info.busyTimeout, 5000);
      assert.equal(info.migrations.length, OFFLINE_DB_MIGRATIONS.length);
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-step52-create-');
});

test('segunda inicialização do mesmo caminho reutiliza a conexão aberta', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      const first = initializeOfflineDatabase({ userDataDir });
      const firstDb = getOfflineDatabase();

      const second = initializeOfflineDatabase({
        userDataDir: path.join(userDataDir, '.')
      });
      const secondDb = getOfflineDatabase();

      assert.equal(first.reused, false);
      assert.equal(second.reused, true);
      assert.equal(firstDb, secondDb);
      assert.equal(
        path.resolve(second.path),
        path.resolve(first.path)
      );
      assert.equal(second.createdAt, first.createdAt);
      assert.deepEqual(
        second.migrations.map(({ version, name }) => ({ version, name })),
        first.migrations.map(({ version, name }) => ({ version, name }))
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-step52-reuse-');
});

test('close encerra o singleton e permite reabrir o mesmo arquivo sem reaplicar migrations', async () => {
  await withTempDir(async (userDataDir) => {
    let first = null;
    let firstMigrationTimes = null;

    try {
      first = initializeOfflineDatabase({ userDataDir });
      firstMigrationTimes = first.migrations.map((item) => item.appliedAt);
    } finally {
      closeOfflineDatabase();
    }

    assert.throws(
      () => getOfflineDatabase(),
      /ainda não foi inicializado/
    );

    await wait(10);

    try {
      const reopened = initializeOfflineDatabase({ userDataDir });

      assert.equal(reopened.ok, true);
      assert.equal(reopened.reused, false);
      assert.equal(
        path.resolve(reopened.path),
        path.resolve(first.path)
      );
      assert.equal(reopened.createdAt, first.createdAt);
      assert.notEqual(reopened.lastOpenAt, first.lastOpenAt);
      assert.deepEqual(
        reopened.migrations.map((item) => item.appliedAt),
        firstMigrationTimes
      );

      const integrity = getOfflineDatabase()
        .prepare('PRAGMA integrity_check')
        .get();

      assert.equal(
        String(Object.values(integrity)[0]).toLowerCase(),
        'ok'
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-step52-reopen-');
});

test('banco aberto recusa userDataDir diferente e permite a troca somente após close', async () => {
  await withTempDir(async (firstUserDataDir) => {
    await withTempDir(async (secondUserDataDir) => {
      try {
        const first = initializeOfflineDatabase({
          userDataDir: firstUserDataDir
        });

        assert.equal(first.reused, false);

        assert.throws(
          () => initializeOfflineDatabase({
            userDataDir: secondUserDataDir
          }),
          /já está aberto para outro userDataDir/
        );

        assert.equal(
          fs.existsSync(
            path.join(secondUserDataDir, 'offline-data')
          ),
          false
        );
      } finally {
        closeOfflineDatabase();
      }

      try {
        const second = initializeOfflineDatabase({
          userDataDir: secondUserDataDir
        });

        assert.equal(second.reused, false);
        assert.equal(
          path.resolve(second.path),
          path.resolve(expectedDbPath(secondUserDataDir))
        );
        assert.equal(fs.existsSync(second.path), true);
      } finally {
        closeOfflineDatabase();
      }
    }, 'efisco-step52-switch-b-');
  }, 'efisco-step52-switch-a-');
});
