'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

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
      assert.equal(info.synchronous, 1);
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


test('close é idempotente antes e depois de uma conexão aberta', async () => {
  closeOfflineDatabase();
  closeOfflineDatabase();

  assert.throws(
    () => getOfflineDatabase(),
    /ainda não foi inicializado/
  );

  await withTempDir(async (userDataDir) => {
    initializeOfflineDatabase({ userDataDir });

    closeOfflineDatabase();
    closeOfflineDatabase();

    assert.throws(
      () => getOfflineDatabase(),
      /ainda não foi inicializado/
    );
  }, 'efisco-stage7-close-idempotent-');
});

test('caminho equivalente com segmentos relativos reutiliza o mesmo singleton', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      const first = initializeOfflineDatabase({ userDataDir });
      const firstDb = getOfflineDatabase();

      const aliasDir = path.join(
        userDataDir,
        'alias-segment',
        '..'
      );

      const second = initializeOfflineDatabase({
        userDataDir: aliasDir
      });

      assert.equal(second.reused, true);
      assert.equal(getOfflineDatabase(), firstDb);
      assert.equal(
        path.resolve(second.path),
        path.resolve(first.path)
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-stage7-path-alias-');
});

test('reopen cria nova conexão, reaplica PRAGMAs e reanexa adapters do boundary DB', async () => {
  await withTempDir(async (userDataDir) => {
    let firstDb;
    let firstAdapters;

    try {
      initializeOfflineDatabase({ userDataDir });
      firstDb = getOfflineDatabase();

      firstAdapters = {
        localConfig:
          firstDb.__efiscoLocalConfigRepository,
        finance:
          firstDb.__efiscoFinanceReadModel,
        cashRepository:
          firstDb.__efiscoCashRepository,
        cashReadModel:
          firstDb.__efiscoCashReadModel
      };

      for (const adapter of Object.values(firstAdapters)) {
        assert.equal(
          typeof adapter,
          'object'
        );
      }
    } finally {
      closeOfflineDatabase();
    }

    try {
      const reopened = initializeOfflineDatabase({ userDataDir });
      const secondDb = getOfflineDatabase();

      assert.equal(reopened.reused, false);
      assert.notEqual(secondDb, firstDb);

      const secondAdapters = {
        localConfig:
          secondDb.__efiscoLocalConfigRepository,
        finance:
          secondDb.__efiscoFinanceReadModel,
        cashRepository:
          secondDb.__efiscoCashRepository,
        cashReadModel:
          secondDb.__efiscoCashReadModel
      };

      for (const key of Object.keys(secondAdapters)) {
        assert.equal(
          typeof secondAdapters[key],
          'object'
        );
        assert.notEqual(
          secondAdapters[key],
          firstAdapters[key]
        );
      }

      assert.equal(
        String(
          Object.values(
            secondDb.prepare('PRAGMA journal_mode').get()
          )[0]
        ).toLowerCase(),
        'wal'
      );
      assert.equal(
        Number(
          Object.values(
            secondDb.prepare('PRAGMA foreign_keys').get()
          )[0]
        ),
        1
      );
      assert.equal(
        Number(
          Object.values(
            secondDb.prepare('PRAGMA synchronous').get()
          )[0]
        ),
        1
      );
      assert.equal(
        Number(
          Object.values(
            secondDb.prepare('PRAGMA busy_timeout').get()
          )[0]
        ),
        5000
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-stage7-reopen-adapters-');
});


test('falha de inicialização fecha o singleton e não bloqueia outro userDataDir', async () => {
  await withTempDir(async (brokenUserDataDir) => {
    await withTempDir(async (healthyUserDataDir) => {
      try {
        initializeOfflineDatabase({
          userDataDir: brokenUserDataDir
        });
      } finally {
        closeOfflineDatabase();
      }

      {
        const raw = new DatabaseSync(
          expectedDbPath(brokenUserDataDir)
        );
        try {
          raw.prepare(
            'UPDATE offline_meta SET schema_version = 14 WHERE singleton_id = 1'
          ).run();
        } finally {
          raw.close();
        }
      }

      assert.throws(
        () => initializeOfflineDatabase({
          userDataDir: brokenUserDataDir
        }),
        /Schema SQLite mais novo que este aplicativo/
      );

      assert.throws(
        () => getOfflineDatabase(),
        /ainda não foi inicializado/
      );

      try {
        const healthy = initializeOfflineDatabase({
          userDataDir: healthyUserDataDir
        });

        assert.equal(healthy.reused, false);
        assert.equal(
          path.resolve(healthy.path),
          path.resolve(
            expectedDbPath(healthyUserDataDir)
          )
        );
      } finally {
        closeOfflineDatabase();
      }
    }, 'efisco-stage7-init-recovery-b-');
  }, 'efisco-stage7-init-recovery-a-');
});
