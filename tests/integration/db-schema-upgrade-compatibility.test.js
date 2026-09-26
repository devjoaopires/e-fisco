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
  closeOfflineDatabase,
  upsertProductCache,
  openCashSession,
  registerCashMovement,
  registerOfflineSaleAtomic,
  getSaleById,
  getCashSession,
  listCashMovements,
  listFinancialMovements,
  getStockProjection,
  getOutboxOperation
} = require('../../offline-db');

const {
  withTempDir
} = require('../helpers/temp-dir');

function databasePathFor(userDataDir) {
  return path.join(
    userDataDir,
    'offline-data',
    'e-fisco-offline.db'
  );
}

function openRawDatabase(userDataDir) {
  return new DatabaseSync(databasePathFor(userDataDir));
}

function migrationRows(db) {
  return db.prepare(
    'SELECT version, name, applied_at FROM schema_migrations ORDER BY version'
  ).all().map((row) => ({
    version: Number(row.version),
    name: String(row.name),
    appliedAt: String(row.applied_at)
  }));
}

function tableExists(db, tableName) {
  return Boolean(
    db.prepare(
      "SELECT 1 AS ok FROM sqlite_schema WHERE type = 'table' AND name = ?"
    ).get(tableName)
  );
}

function columnNames(db, tableName) {
  return db.prepare(
    `PRAGMA table_info(${tableName})`
  ).all().map((row) => String(row.name));
}

function createCurrentDatabase(userDataDir) {
  const info = initializeOfflineDatabase({ userDataDir });
  assert.equal(info.schemaVersion, OFFLINE_DB_SCHEMA_VERSION);
  return info;
}

function seedV5CompatibleData() {
  upsertProductCache({
    empresaId: 'empresa-v5',
    produtoId: 'produto-v5',
    codigo: 'P-V5',
    descricao: 'Produto legado V5',
    unidade: 'UN',
    precoCentavos: 1000,
    ativo: true,
    payload: {
      quantidadeEstoque: 100
    }
  });

  openCashSession({
    empresaId: 'empresa-v5',
    sessionId: 'cash-v5',
    operationId: 'op-cash-open-v5',
    openingBalanceCentavos: 5000,
    openedAt: '2026-01-05T10:00:00.000Z',
    payload: {
      source: 'fixture-v5'
    }
  });

  registerCashMovement({
    empresaId: 'empresa-v5',
    movementId: 'cash-movement-v5',
    operationId: 'op-cash-movement-v5',
    sessionId: 'cash-v5',
    direction: 1,
    amountCentavos: 800,
    movementType: 'SUPRIMENTO',
    sourceId: 'source-v5',
    occurredAt: '2026-01-05T10:01:00.000Z',
    payload: {
      source: 'fixture-v5'
    }
  });

  const sale = registerOfflineSaleAtomic({
    empresaId: 'empresa-v5',
    saleId: 'sale-v5',
    operationId: 'op-sale-v5',
    status: 'PAID_OFFLINE_PENDING_SYNC',
    totalCentavos: 1000,
    occurredAt: '2026-01-05T10:02:00.000Z',
    paymentMethod: 'PIX',
    paymentParts: [{
      method: 'PIX',
      amount: 10
    }],
    items: [{
      itemId: 'sale-item-v5',
      produtoId: 'produto-v5',
      quantidade: '1',
      unitPriceCentavos: 1000,
      totalCentavos: 1000,
      payload: {
        source: 'fixture-v5'
      }
    }],
    financialMovements: [{
      movementId: 'financial-v5',
      operationId: 'op-financial-v5',
      accountId: 'PIX',
      direction: 1,
      amountCentavos: 1000,
      movementType: 'VENDA_PAGA',
      sourceId: 'sale-v5',
      occurredAt: '2026-01-05T10:02:00.000Z',
      payload: {
        source: 'fixture-v5'
      }
    }],
    dependencies: [],
    payload: {
      source: 'fixture-v5'
    }
  });

  assert.equal(sale.applied, true);
}

function downgradeCurrentDatabaseToV5(userDataDir) {
  const db = openRawDatabase(userDataDir);
  try {
    db.exec('PRAGMA foreign_keys = OFF;');

    db.exec(`
      DROP TABLE IF EXISTS fiscal_outbox;
      DROP TABLE IF EXISTS nfce_documents;
      DROP TABLE IF EXISTS fiscal_number_leases;
      DROP TABLE IF EXISTS fiscal_profile_cache;
      DROP TABLE IF EXISTS crediarios_cache;
      DROP TABLE IF EXISTS offline_operator_credentials;
      DROP TABLE IF EXISTS offline_prepared_companies;
      DROP TABLE IF EXISTS offline_provisioned_credentials;

      DROP INDEX IF EXISTS idx_sync_outbox_empresa_ready;

      ALTER TABLE sync_outbox DROP COLUMN remote_ack_json;
      ALTER TABLE sync_outbox DROP COLUMN confirmed_at;
      ALTER TABLE sync_outbox DROP COLUMN sending_started_at;
      ALTER TABLE sync_outbox DROP COLUMN next_attempt_at;
    `);

    db.prepare(
      'DELETE FROM schema_migrations WHERE version > 5'
    ).run();

    db.prepare(
      'UPDATE offline_meta SET schema_version = 5 WHERE singleton_id = 1'
    ).run();

    assert.deepEqual(
      columnNames(db, 'sync_outbox'),
      [
        'empresa_id',
        'operation_id',
        'type',
        'entity_id',
        'payload_json',
        'status',
        'attempts',
        'dependencies_json',
        'created_at',
        'updated_at',
        'last_error'
      ]
    );
  } finally {
    db.close();
  }
}

function downgradeCurrentDatabaseToV9(userDataDir) {
  const db = openRawDatabase(userDataDir);
  try {
    db.exec('PRAGMA foreign_keys = OFF;');

    db.exec(`
      DROP TABLE IF EXISTS offline_operator_credentials;
      DROP TABLE IF EXISTS offline_prepared_companies;
      DROP TABLE IF EXISTS offline_provisioned_credentials;

      CREATE TABLE fiscal_number_reservations (
        reservation_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
      ) STRICT;
    `);

    db.prepare(`
      INSERT INTO fiscal_number_reservations (
        reservation_id,
        created_at
      ) VALUES (?, ?)
    `).run(
      'legacy-reservation-v9',
      '2026-01-09T10:00:00.000Z'
    );

    db.prepare(`
      INSERT INTO local_config (
        config_key,
        value_json,
        updated_at
      ) VALUES (?, ?, ?)
    `).run(
      'fiscal.numberLease.intent.v1:legacy-step55',
      '{"legacy":true}',
      '2026-01-09T10:00:00.000Z'
    );

    db.prepare(`
      INSERT INTO sales (
        empresa_id,
        sale_id,
        operation_id,
        cliente_id,
        status,
        total_centavos,
        occurred_at,
        created_at,
        payload_json
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)
    `).run(
      'empresa-v9',
      'sale-v9',
      'op-sale-v9',
      'PAID',
      100,
      '2026-01-09T10:00:00.000Z',
      '2026-01-09T10:00:00.000Z',
      '{}'
    );

    db.prepare(`
      INSERT INTO fiscal_number_leases (
        empresa_id,
        lease_id,
        request_id,
        device_id,
        ambiente,
        modelo,
        serie,
        numero_inicial,
        numero_final,
        proximo_numero,
        status,
        reservado_em,
        expira_em,
        updated_at,
        payload_json
      ) VALUES (
        ?, ?, ?, ?, 'PRODUCAO', 65, ?,
        ?, ?, ?, 'ACTIVE', ?, NULL, ?, '{}'
      )
    `).run(
      'empresa-v9',
      'lease-v9',
      'request-v9',
      'device-v9',
      '1',
      1,
      100,
      2,
      '2026-01-09T10:00:00.000Z',
      '2026-01-09T10:00:00.000Z'
    );

    db.prepare(`
      INSERT INTO nfce_documents (
        empresa_id,
        fiscal_id,
        sale_id,
        operation_id,
        lease_id,
        ambiente,
        modelo,
        serie,
        numero,
        cnf,
        cdv,
        chave_acesso,
        tp_emis,
        dh_emi,
        dh_cont,
        x_just,
        profile_revision,
        input_snapshot_json,
        state,
        created_at,
        updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        'PRODUCAO', 65, ?, ?,
        ?, ?, ?, 9, ?, ?, ?, ?, '{}',
        'ALLOCATED', ?, ?
      )
    `).run(
      'empresa-v9',
      'fiscal-v9',
      'sale-v9',
      'op-fiscal-v9',
      'lease-v9',
      '1',
      7,
      '12345678',
      '0',
      '15000000000000000000000000000000000000000000',
      '2026-01-09T10:00:00-03:00',
      '2026-01-09T10:00:00-03:00',
      'Contingência offline',
      'profile-v9',
      '2026-01-09T10:00:00.000Z',
      '2026-01-09T10:00:00.000Z'
    );

    db.prepare(
      'DELETE FROM schema_migrations WHERE version > 9'
    ).run();

    db.prepare(
      'UPDATE offline_meta SET schema_version = 9 WHERE singleton_id = 1'
    ).run();
  } finally {
    db.close();
  }
}

function downgradeCurrentDatabaseToV12(userDataDir) {
  const db = openRawDatabase(userDataDir);
  try {
    db.exec('DROP TABLE IF EXISTS offline_provisioned_credentials;');

    db.prepare(
      'DELETE FROM schema_migrations WHERE version > 12'
    ).run();

    db.prepare(
      'UPDATE offline_meta SET schema_version = 12 WHERE singleton_id = 1'
    ).run();
  } finally {
    db.close();
  }
}

test('upgrade V5 -> V13 preserva dados e aplica apenas migrations pendentes', async () => {
  await withTempDir(async (userDataDir) => {
    let firstFive;

    try {
      createCurrentDatabase(userDataDir);
      seedV5CompatibleData();
      firstFive = migrationRows(getOfflineDatabase()).slice(0, 5);
    } finally {
      closeOfflineDatabase();
    }

    downgradeCurrentDatabaseToV5(userDataDir);

    try {
      const upgraded = initializeOfflineDatabase({ userDataDir });

      assert.equal(upgraded.schemaVersion, 13);
      assert.equal(upgraded.migrations.length, 13);

      assert.deepEqual(
        upgraded.migrations.slice(0, 5).map((row) => ({
          version: row.version,
          name: row.name,
          appliedAt: row.appliedAt
        })),
        firstFive
      );

      assert.deepEqual(
        upgraded.migrations.slice(5).map((row) => ({
          version: row.version,
          name: row.name
        })),
        OFFLINE_DB_MIGRATIONS.slice(5)
      );

      const sale = getSaleById('empresa-v5', 'sale-v5');
      assert.equal(sale.totalCentavos, 1000);
      assert.equal(sale.items.length, 1);
      assert.equal(sale.items[0].produtoId, 'produto-v5');

      const outbox = getOutboxOperation(
        'empresa-v5',
        'op-sale-v5'
      );
      assert.equal(outbox.status, 'PENDING');
      assert.equal(outbox.nextAttemptAt, null);
      assert.equal(outbox.sendingStartedAt, null);
      assert.equal(outbox.confirmedAt, null);
      assert.equal(outbox.remoteAck, null);

      assert.equal(
        getCashSession(
          'empresa-v5',
          'cash-v5'
        ).openingBalanceCentavos,
        5000
      );

      assert.equal(
        listCashMovements({
          empresaId: 'empresa-v5',
          sessionId: 'cash-v5',
          limit: 10
        }).length,
        1
      );

      assert.equal(
        listFinancialMovements({
          empresaId: 'empresa-v5',
          limit: 10
        }).length,
        1
      );

      assert.equal(
        getStockProjection(
          'empresa-v5',
          'produto-v5'
        ).quantidade,
        '-1'
      );

      const db = getOfflineDatabase();
      const columns = columnNames(db, 'sync_outbox');
      for (const expected of [
        'next_attempt_at',
        'sending_started_at',
        'confirmed_at',
        'remote_ack_json'
      ]) {
        assert.equal(columns.includes(expected), true);
      }

      for (const tableName of [
        'fiscal_profile_cache',
        'fiscal_number_leases',
        'nfce_documents',
        'fiscal_outbox',
        'crediarios_cache',
        'offline_operator_credentials',
        'offline_prepared_companies',
        'offline_provisioned_credentials'
      ]) {
        assert.equal(tableExists(db, tableName), true);
      }
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-step55-v5-');
});

test('upgrade V9 -> V13 executa reconciliação da V10 e preserva documento fiscal', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      createCurrentDatabase(userDataDir);
    } finally {
      closeOfflineDatabase();
    }

    downgradeCurrentDatabaseToV9(userDataDir);

    try {
      const upgraded = initializeOfflineDatabase({ userDataDir });
      const db = getOfflineDatabase();

      assert.equal(upgraded.schemaVersion, 13);

      const lease = db.prepare(`
        SELECT proximo_numero, status
          FROM fiscal_number_leases
         WHERE empresa_id = ?
           AND lease_id = ?
      `).get('empresa-v9', 'lease-v9');

      assert.equal(Number(lease.proximo_numero), 8);
      assert.equal(String(lease.status), 'ACTIVE');

      assert.equal(
        tableExists(db, 'fiscal_number_reservations'),
        false
      );

      const legacyIntent = db.prepare(`
        SELECT config_key
          FROM local_config
         WHERE config_key = ?
      `).get(
        'fiscal.numberLease.intent.v1:legacy-step55'
      );

      assert.equal(legacyIntent, undefined);

      const document = db.prepare(`
        SELECT fiscal_id, numero, chave_acesso
          FROM nfce_documents
         WHERE empresa_id = ?
           AND fiscal_id = ?
      `).get('empresa-v9', 'fiscal-v9');

      assert.equal(String(document.fiscal_id), 'fiscal-v9');
      assert.equal(Number(document.numero), 7);
      assert.equal(String(document.chave_acesso).length, 44);

      assert.equal(
        tableExists(db, 'offline_operator_credentials'),
        true
      );
      assert.equal(
        tableExists(db, 'offline_prepared_companies'),
        true
      );
      assert.equal(
        tableExists(db, 'offline_provisioned_credentials'),
        true
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-step55-v9-');
});

test('upgrade V12 -> V13 preserva registro V12 e cria somente a tabela V13', async () => {
  await withTempDir(async (userDataDir) => {
    let firstTwelve;

    try {
      createCurrentDatabase(userDataDir);
      const db = getOfflineDatabase();

      db.prepare(`
        INSERT INTO offline_prepared_companies (
          empresa_id,
          razao_social,
          cnpj,
          ambiente,
          prepared_at,
          last_prepared_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'empresa-v12',
        'Empresa Histórica V12',
        '12345678000195',
        'PRODUCAO',
        '2026-01-12T10:00:00.000Z',
        '2026-01-12T10:00:00.000Z'
      );

      firstTwelve = migrationRows(db).slice(0, 12);
    } finally {
      closeOfflineDatabase();
    }

    downgradeCurrentDatabaseToV12(userDataDir);

    try {
      const upgraded = initializeOfflineDatabase({ userDataDir });
      const db = getOfflineDatabase();

      assert.equal(upgraded.schemaVersion, 13);

      assert.deepEqual(
        upgraded.migrations.slice(0, 12).map((row) => ({
          version: row.version,
          name: row.name,
          appliedAt: row.appliedAt
        })),
        firstTwelve
      );

      assert.deepEqual(
        {
          version: upgraded.migrations[12].version,
          name: upgraded.migrations[12].name
        },
        OFFLINE_DB_MIGRATIONS[12]
      );

      const company = db.prepare(`
        SELECT empresa_id, razao_social, cnpj, ambiente
          FROM offline_prepared_companies
         WHERE empresa_id = ?
      `).get('empresa-v12');

      assert.deepEqual({ ...company }, {
        empresa_id: 'empresa-v12',
        razao_social: 'Empresa Histórica V12',
        cnpj: '12345678000195',
        ambiente: 'PRODUCAO'
      });

      assert.equal(
        tableExists(db, 'offline_provisioned_credentials'),
        true
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-step55-v12-');
});

test('schema futuro V14 é rejeitado sem downgrade silencioso de metadados', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      createCurrentDatabase(userDataDir);
    } finally {
      closeOfflineDatabase();
    }

    {
      const db = openRawDatabase(userDataDir);
      try {
        db.exec(`
          CREATE TABLE future_v14_marker (
            marker TEXT PRIMARY KEY
          ) STRICT;
        `);

        db.prepare(`
          INSERT INTO future_v14_marker (marker)
          VALUES ('preserve-me')
        `).run();

        db.prepare(`
          INSERT INTO schema_migrations (
            version,
            name,
            applied_at
          ) VALUES (14, 'future-schema-v14', ?)
        `).run('2026-01-14T10:00:00.000Z');

        db.prepare(`
          UPDATE offline_meta
             SET schema_version = 14
           WHERE singleton_id = 1
        `).run();
      } finally {
        db.close();
      }
    }

    assert.throws(
      () => initializeOfflineDatabase({ userDataDir }),
      /Schema SQLite mais novo que este aplicativo/
    );

    assert.throws(
      () => getOfflineDatabase(),
      /ainda não foi inicializado/
    );

    const db = openRawDatabase(userDataDir);
    try {
      const meta = db.prepare(`
        SELECT schema_version
          FROM offline_meta
         WHERE singleton_id = 1
      `).get();

      assert.equal(Number(meta.schema_version), 14);

      const future = db.prepare(`
        SELECT name
          FROM schema_migrations
         WHERE version = 14
      `).get();

      assert.equal(
        String(future.name),
        'future-schema-v14'
      );

      const marker = db.prepare(`
        SELECT marker
          FROM future_v14_marker
      `).get();

      assert.equal(String(marker.marker), 'preserve-me');
    } finally {
      db.close();
    }
  }, 'efisco-step55-future-');
});

test('histórico de migration adulterado é rejeitado antes de novas migrations', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      createCurrentDatabase(userDataDir);
    } finally {
      closeOfflineDatabase();
    }

    {
      const db = openRawDatabase(userDataDir);
      try {
        db.prepare(`
          UPDATE schema_migrations
             SET name = 'nome-adulterado'
           WHERE version = 12
        `).run();
      } finally {
        db.close();
      }
    }

    assert.throws(
      () => initializeOfflineDatabase({ userDataDir }),
      /Histórico de migrations SQLite incompatível na V12/
    );

    const db = openRawDatabase(userDataDir);
    try {
      const row = db.prepare(`
        SELECT name
          FROM schema_migrations
         WHERE version = 12
      `).get();

      assert.equal(String(row.name), 'nome-adulterado');

      const meta = db.prepare(`
        SELECT schema_version
          FROM offline_meta
         WHERE singleton_id = 1
      `).get();

      assert.equal(
        Number(meta.schema_version),
        OFFLINE_DB_SCHEMA_VERSION
      );
    } finally {
      db.close();
    }
  }, 'efisco-step55-history-');
});
