'use strict';

const fs = require('fs');
const path = require('path');
const { createHash, randomUUID } = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const OFFLINE_DB_SCHEMA_VERSION = 13;

const OFFLINE_DB_MIGRATIONS = Object.freeze([
  Object.freeze({ version: 1, name: 'offline-foundation' }),
  Object.freeze({ version: 2, name: 'offline-reference-cache' }),
  Object.freeze({ version: 3, name: 'offline-stock-ledger' }),
  Object.freeze({ version: 4, name: 'offline-sales-outbox' }),
  Object.freeze({ version: 5, name: 'offline-cash-financial-ledgers' }),
  Object.freeze({ version: 6, name: 'offline-outbox-state-machine' }),
  Object.freeze({ version: 7, name: 'offline-nfce-fiscal-foundation' }),
  Object.freeze({ version: 8, name: 'single-owner-nfce-numbering-legacy' }),
  Object.freeze({ version: 9, name: 'offline-crediario-reference-cache' }),
  Object.freeze({ version: 10, name: 'single-cashier-next-number-no-reservations' }),
  Object.freeze({ version: 11, name: 'offline-operator-credentials-cache' }),
  Object.freeze({ version: 12, name: 'offline-prepared-companies-registry' }),
  Object.freeze({ version: 13, name: 'offline-multi-company-provisioned-credentials' })
]);

let database = null;
let databasePath = '';

function nowIso() {
  return new Date().toISOString();
}

function ensureDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function scalarRowValue(row) {
  if (!row || typeof row !== 'object') return null;
  const keys = Object.keys(row);
  return keys.length ? row[keys[0]] : null;
}

function configureDatabase(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
  `);
}

function ensureMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);
}

function hasMigration(db, version) {
  const row = db
    .prepare('SELECT version FROM schema_migrations WHERE version = ?')
    .get(version);
  return Boolean(row);
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
    if (!expected || migration.name !== expected.name) {
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


function applyMigrationV1(db) {
  if (hasMigration(db, 1)) return false;

  const appliedAt = nowIso();
  db.exec('BEGIN IMMEDIATE;');

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS offline_meta (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        schema_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        last_open_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS local_config (
        config_key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `);

    db.prepare(`
      INSERT INTO offline_meta (
        singleton_id,
        schema_version,
        created_at,
        last_open_at
      ) VALUES (1, ?, ?, ?)
      ON CONFLICT(singleton_id) DO UPDATE SET
        schema_version = excluded.schema_version,
        last_open_at = excluded.last_open_at
    `).run(1, appliedAt, appliedAt);

    db.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, ?)
    `).run(1, 'offline-foundation', appliedAt);

    db.exec('COMMIT;');
    return true;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

function applyMigrationV2(db) {
  if (hasMigration(db, 2)) return false;

  const appliedAt = nowIso();
  db.exec('BEGIN IMMEDIATE;');

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS products_cache (
        empresa_id TEXT NOT NULL,
        produto_id TEXT NOT NULL,
        codigo TEXT,
        gtin TEXT,
        descricao TEXT NOT NULL,
        unidade TEXT,
        preco_centavos INTEGER,
        ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
        revision TEXT,
        source_updated_at TEXT,
        cached_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (empresa_id, produto_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_products_cache_empresa_codigo
        ON products_cache (empresa_id, codigo);

      CREATE INDEX IF NOT EXISTS idx_products_cache_empresa_gtin
        ON products_cache (empresa_id, gtin);

      CREATE INDEX IF NOT EXISTS idx_products_cache_empresa_descricao
        ON products_cache (empresa_id, descricao);

      CREATE TABLE IF NOT EXISTS customers_cache (
        empresa_id TEXT NOT NULL,
        cliente_id TEXT NOT NULL,
        nome TEXT NOT NULL,
        documento TEXT,
        telefone TEXT,
        email TEXT,
        ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
        revision TEXT,
        source_updated_at TEXT,
        cached_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (empresa_id, cliente_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_customers_cache_empresa_documento
        ON customers_cache (empresa_id, documento);

      CREATE INDEX IF NOT EXISTS idx_customers_cache_empresa_nome
        ON customers_cache (empresa_id, nome);

      CREATE TABLE IF NOT EXISTS suppliers_cache (
        empresa_id TEXT NOT NULL,
        fornecedor_id TEXT NOT NULL,
        nome TEXT NOT NULL,
        documento TEXT,
        telefone TEXT,
        email TEXT,
        ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
        revision TEXT,
        source_updated_at TEXT,
        cached_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (empresa_id, fornecedor_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_suppliers_cache_empresa_documento
        ON suppliers_cache (empresa_id, documento);

      CREATE INDEX IF NOT EXISTS idx_suppliers_cache_empresa_nome
        ON suppliers_cache (empresa_id, nome);
    `);

    db.prepare(`
      UPDATE offline_meta
         SET schema_version = ?,
             last_open_at = ?
       WHERE singleton_id = 1
    `).run(2, appliedAt);

    db.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, ?)
    `).run(2, 'offline-reference-cache', appliedAt);

    db.exec('COMMIT;');
    return true;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

function applyMigrationV3(db) {
  if (hasMigration(db, 3)) return false;

  const appliedAt = nowIso();
  db.exec('BEGIN IMMEDIATE;');

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        empresa_id TEXT NOT NULL,
        movement_id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        produto_id TEXT NOT NULL,
        direction INTEGER NOT NULL CHECK (direction IN (-1, 1)),
        quantity_microunits INTEGER NOT NULL CHECK (quantity_microunits > 0),
        movement_type TEXT NOT NULL,
        source_id TEXT,
        occurred_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (empresa_id, movement_id),
        UNIQUE (empresa_id, operation_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_stock_movements_empresa_produto_data
        ON stock_movements (empresa_id, produto_id, occurred_at, movement_id);

      CREATE INDEX IF NOT EXISTS idx_stock_movements_empresa_source
        ON stock_movements (empresa_id, source_id);

      CREATE TABLE IF NOT EXISTS stock_projection (
        empresa_id TEXT NOT NULL,
        produto_id TEXT NOT NULL,
        quantity_microunits INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (empresa_id, produto_id)
      ) STRICT;
    `);

    db.prepare(`
      UPDATE offline_meta
         SET schema_version = ?,
             last_open_at = ?
       WHERE singleton_id = 1
    `).run(3, appliedAt);

    db.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, ?)
    `).run(3, 'offline-stock-ledger', appliedAt);

    db.exec('COMMIT;');
    return true;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}


function applyMigrationV4(db) {
  if (hasMigration(db, 4)) return false;

  const appliedAt = nowIso();
  db.exec('BEGIN IMMEDIATE;');

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sales (
        empresa_id TEXT NOT NULL,
        sale_id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        cliente_id TEXT,
        status TEXT NOT NULL DEFAULT 'PAID',
        total_centavos INTEGER NOT NULL CHECK (total_centavos >= 0),
        occurred_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (empresa_id, sale_id),
        UNIQUE (empresa_id, operation_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_sales_empresa_occurred
        ON sales (empresa_id, occurred_at, sale_id);

      CREATE TABLE IF NOT EXISTS sale_items (
        empresa_id TEXT NOT NULL,
        sale_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        produto_id TEXT NOT NULL,
        quantity_microunits INTEGER NOT NULL CHECK (quantity_microunits > 0),
        unit_price_centavos INTEGER NOT NULL CHECK (unit_price_centavos >= 0),
        total_centavos INTEGER NOT NULL CHECK (total_centavos >= 0),
        payload_json TEXT NOT NULL,
        PRIMARY KEY (empresa_id, sale_id, item_id),
        FOREIGN KEY (empresa_id, sale_id)
          REFERENCES sales (empresa_id, sale_id) ON DELETE CASCADE,
        FOREIGN KEY (empresa_id, produto_id)
          REFERENCES products_cache (empresa_id, produto_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_sale_items_empresa_produto
        ON sale_items (empresa_id, produto_id, sale_id);

      CREATE TABLE IF NOT EXISTS sync_outbox (
        empresa_id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING'
          CHECK (status IN ('PENDING', 'SENDING', 'CONFIRMED', 'RETRY', 'CONFLICT', 'MANUAL_REVIEW')),
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        dependencies_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_error TEXT,
        PRIMARY KEY (empresa_id, operation_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_sync_outbox_empresa_status_created
        ON sync_outbox (empresa_id, status, created_at, operation_id);
    `);

    db.prepare(`
      UPDATE offline_meta
         SET schema_version = ?,
             last_open_at = ?
       WHERE singleton_id = 1
    `).run(4, appliedAt);

    db.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, ?)
    `).run(4, 'offline-sales-outbox', appliedAt);

    db.exec('COMMIT;');
    return true;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}


function applyMigrationV5(db) {
  if (hasMigration(db, 5)) return false;

  const appliedAt = nowIso();
  db.exec('BEGIN IMMEDIATE;');

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cash_sessions (
        empresa_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'OPEN'
          CHECK (status IN ('OPEN', 'CLOSED')),
        opening_balance_centavos INTEGER NOT NULL DEFAULT 0
          CHECK (opening_balance_centavos >= 0),
        opened_at TEXT NOT NULL,
        closed_at TEXT,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (empresa_id, session_id),
        UNIQUE (empresa_id, operation_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_cash_sessions_empresa_status_opened
        ON cash_sessions (empresa_id, status, opened_at, session_id);

      CREATE TABLE IF NOT EXISTS cash_movements (
        empresa_id TEXT NOT NULL,
        movement_id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        direction INTEGER NOT NULL CHECK (direction IN (-1, 1)),
        amount_centavos INTEGER NOT NULL CHECK (amount_centavos > 0),
        movement_type TEXT NOT NULL,
        source_id TEXT,
        occurred_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (empresa_id, movement_id),
        UNIQUE (empresa_id, operation_id),
        FOREIGN KEY (empresa_id, session_id)
          REFERENCES cash_sessions (empresa_id, session_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_cash_movements_empresa_session_data
        ON cash_movements (empresa_id, session_id, occurred_at, movement_id);

      CREATE INDEX IF NOT EXISTS idx_cash_movements_empresa_source
        ON cash_movements (empresa_id, source_id);

      CREATE TABLE IF NOT EXISTS financial_movements (
        empresa_id TEXT NOT NULL,
        movement_id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        account_id TEXT,
        direction INTEGER NOT NULL CHECK (direction IN (-1, 1)),
        amount_centavos INTEGER NOT NULL CHECK (amount_centavos > 0),
        movement_type TEXT NOT NULL,
        source_id TEXT,
        occurred_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (empresa_id, movement_id),
        UNIQUE (empresa_id, operation_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_financial_movements_empresa_account_data
        ON financial_movements (empresa_id, account_id, occurred_at, movement_id);

      CREATE INDEX IF NOT EXISTS idx_financial_movements_empresa_source
        ON financial_movements (empresa_id, source_id);
    `);

    db.prepare(`
      UPDATE offline_meta
         SET schema_version = ?,
             last_open_at = ?
       WHERE singleton_id = 1
    `).run(5, appliedAt);

    db.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, ?)
    `).run(5, 'offline-cash-financial-ledgers', appliedAt);

    db.exec('COMMIT;');
    return true;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}


function applyMigrationV6(db) {
  if (hasMigration(db, 6)) return false;

  const appliedAt = nowIso();
  db.exec('BEGIN IMMEDIATE;');

  try {
    db.exec(`
      ALTER TABLE sync_outbox ADD COLUMN next_attempt_at TEXT;
      ALTER TABLE sync_outbox ADD COLUMN sending_started_at TEXT;
      ALTER TABLE sync_outbox ADD COLUMN confirmed_at TEXT;
      ALTER TABLE sync_outbox ADD COLUMN remote_ack_json TEXT;

      CREATE INDEX IF NOT EXISTS idx_sync_outbox_empresa_ready
        ON sync_outbox (empresa_id, status, next_attempt_at, created_at, operation_id);
    `);

    db.prepare(`
      UPDATE offline_meta
         SET schema_version = ?,
             last_open_at = ?
       WHERE singleton_id = 1
    `).run(6, appliedAt);

    db.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, ?)
    `).run(6, 'offline-outbox-state-machine', appliedAt);

    db.exec('COMMIT;');
    return true;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

function applyMigrationV7(db) {
  if (hasMigration(db, 7)) return false;

  const appliedAt = nowIso();
  db.exec('BEGIN IMMEDIATE;');

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS fiscal_profile_cache (
        empresa_id TEXT PRIMARY KEY,
        cnpj TEXT NOT NULL,
        inscricao_estadual TEXT NOT NULL,
        razao_social TEXT NOT NULL,
        nome_fantasia TEXT,
        cep TEXT,
        logradouro TEXT NOT NULL,
        numero TEXT NOT NULL,
        complemento TEXT,
        bairro TEXT NOT NULL,
        municipio TEXT NOT NULL,
        codigo_municipio TEXT NOT NULL,
        uf TEXT NOT NULL,
        serie_nfce TEXT NOT NULL,
        ambiente TEXT NOT NULL
          CHECK (ambiente IN ('HOMOLOGACAO', 'PRODUCAO')),
        crt TEXT NOT NULL,
        regime_tributario TEXT,
        url_qr_code TEXT NOT NULL,
        url_consulta_chave TEXT NOT NULL,
        revision TEXT NOT NULL,
        source_updated_at TEXT,
        cached_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS fiscal_number_leases (
        empresa_id TEXT NOT NULL,
        lease_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        ambiente TEXT NOT NULL
          CHECK (ambiente IN ('HOMOLOGACAO', 'PRODUCAO')),
        modelo INTEGER NOT NULL CHECK (modelo = 65),
        serie TEXT NOT NULL,
        numero_inicial INTEGER NOT NULL CHECK (numero_inicial > 0),
        numero_final INTEGER NOT NULL CHECK (numero_final >= numero_inicial),
        proximo_numero INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE'
          CHECK (status IN ('ACTIVE', 'EXHAUSTED', 'EXPIRED', 'REVOKED')),
        reservado_em TEXT NOT NULL,
        expira_em TEXT,
        updated_at TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (empresa_id, lease_id),
        UNIQUE (empresa_id, request_id),
        CHECK (proximo_numero >= numero_inicial AND proximo_numero <= numero_final + 1)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_fiscal_number_leases_namespace_status
        ON fiscal_number_leases (
          empresa_id, ambiente, modelo, serie, status, numero_inicial
        );

      CREATE TABLE IF NOT EXISTS nfce_documents (
        empresa_id TEXT NOT NULL,
        fiscal_id TEXT NOT NULL,
        sale_id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        lease_id TEXT NOT NULL,
        ambiente TEXT NOT NULL
          CHECK (ambiente IN ('HOMOLOGACAO', 'PRODUCAO')),
        modelo INTEGER NOT NULL DEFAULT 65 CHECK (modelo = 65),
        serie TEXT NOT NULL,
        numero INTEGER NOT NULL CHECK (numero > 0),
        cnf TEXT NOT NULL,
        cdv TEXT NOT NULL,
        chave_acesso TEXT NOT NULL CHECK (length(chave_acesso) = 44),
        tp_emis INTEGER NOT NULL DEFAULT 9 CHECK (tp_emis = 9),
        dh_emi TEXT NOT NULL,
        dh_cont TEXT NOT NULL,
        x_just TEXT NOT NULL,
        profile_revision TEXT NOT NULL,
        input_snapshot_json TEXT NOT NULL,
        signed_xml BLOB,
        signed_xml_sha256 TEXT,
        qr_code_text TEXT,
        state TEXT NOT NULL DEFAULT 'ALLOCATED'
          CHECK (state IN (
            'ALLOCATED',
            'SIGNING_FAILED',
            'CONTINGENCIA_PENDENTE',
            'SENDING',
            'RECONCILE_BY_KEY',
            'AUTHORIZED',
            'REJECTED',
            'MANUAL_REVIEW'
          )),
        protocolo TEXT,
        sefaz_cstat TEXT,
        sefaz_xmotivo TEXT,
        autorizado_em TEXT,
        processed_xml BLOB,
        consumer_copy_printed_at TEXT,
        establishment_copy_printed_at TEXT,
        consumer_print_count INTEGER NOT NULL DEFAULT 0
          CHECK (consumer_print_count >= 0),
        establishment_print_count INTEGER NOT NULL DEFAULT 0
          CHECK (establishment_print_count >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (empresa_id, fiscal_id),
        UNIQUE (empresa_id, sale_id),
        UNIQUE (empresa_id, operation_id),
        UNIQUE (empresa_id, ambiente, modelo, serie, numero),
        UNIQUE (empresa_id, chave_acesso),
        FOREIGN KEY (empresa_id, sale_id)
          REFERENCES sales (empresa_id, sale_id),
        FOREIGN KEY (empresa_id, lease_id)
          REFERENCES fiscal_number_leases (empresa_id, lease_id),
        CHECK (
          (signed_xml IS NULL AND signed_xml_sha256 IS NULL) OR
          (signed_xml IS NOT NULL AND signed_xml_sha256 IS NOT NULL)
        )
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_nfce_documents_empresa_state_updated
        ON nfce_documents (empresa_id, state, updated_at, fiscal_id);

      CREATE INDEX IF NOT EXISTS idx_nfce_documents_empresa_chave
        ON nfce_documents (empresa_id, chave_acesso);

      CREATE TABLE IF NOT EXISTS fiscal_outbox (
        empresa_id TEXT NOT NULL,
        fiscal_id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        action TEXT NOT NULL DEFAULT 'TRANSMIT'
          CHECK (action IN ('TRANSMIT', 'RECONCILE_BY_KEY')),
        status TEXT NOT NULL DEFAULT 'PENDING'
          CHECK (status IN ('PENDING', 'SENDING', 'RETRY', 'CONFIRMED', 'CONFLICT', 'MANUAL_REVIEW')),
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        payload_json TEXT NOT NULL DEFAULT '{}',
        next_attempt_at TEXT,
        sending_started_at TEXT,
        confirmed_at TEXT,
        last_error TEXT,
        remote_ack_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (empresa_id, fiscal_id),
        UNIQUE (empresa_id, operation_id),
        FOREIGN KEY (empresa_id, fiscal_id)
          REFERENCES nfce_documents (empresa_id, fiscal_id) ON DELETE CASCADE
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_fiscal_outbox_empresa_ready
        ON fiscal_outbox (
          empresa_id, status, next_attempt_at, created_at, fiscal_id
        );
    `);

    db.prepare(`
      UPDATE offline_meta
         SET schema_version = ?,
             last_open_at = ?
       WHERE singleton_id = 1
    `).run(7, appliedAt);

    db.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, ?)
    `).run(7, 'offline-nfce-fiscal-foundation', appliedAt);

    db.exec('COMMIT;');
    return true;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

function applyMigrationV8(db) {
  if (hasMigration(db, 8)) return false;

  const appliedAt = nowIso();
  db.exec('BEGIN IMMEDIATE;');

  try {
    /*
     * A versão 8 existiu historicamente durante a implantação do caixa único.
     * A estratégia de reserva por venda foi removida. Em instalações novas,
     * esta migração apenas preserva a sequência histórica de versões.
     */

    db.prepare(`
      UPDATE offline_meta
         SET schema_version = ?,
             last_open_at = ?
       WHERE singleton_id = 1
    `).run(8, appliedAt);

    db.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, ?)
    `).run(8, 'single-owner-nfce-numbering-legacy', appliedAt);

    db.exec('COMMIT;');
    return true;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

function applyMigrationV9(db) {
  if (hasMigration(db, 9)) return false;

  const appliedAt = nowIso();
  db.exec('BEGIN IMMEDIATE;');

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS crediarios_cache (
        empresa_id TEXT NOT NULL,
        conta_receber_id TEXT NOT NULL,
        crediario_id TEXT NOT NULL,
        cliente_id TEXT,
        cliente_nome TEXT,
        cpf TEXT,
        whatsapp TEXT,
        valor_centavos INTEGER,
        valor_original_centavos INTEGER,
        valor_recebido_centavos INTEGER,
        saldo_receber_centavos INTEGER,
        vencimento TEXT,
        status TEXT NOT NULL,
        pago INTEGER NOT NULL DEFAULT 0 CHECK (pago IN (0, 1)),
        pago_em TEXT,
        forma_pagamento TEXT,
        aberto_em TEXT,
        cancelado INTEGER NOT NULL DEFAULT 0 CHECK (cancelado IN (0, 1)),
        cancelado_em TEXT,
        situacao_versao INTEGER,
        revision TEXT,
        source_updated_at TEXT,
        snapshot_token TEXT NOT NULL,
        cached_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (empresa_id, conta_receber_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_crediarios_cache_empresa_crediario
        ON crediarios_cache (empresa_id, crediario_id);

      CREATE INDEX IF NOT EXISTS idx_crediarios_cache_empresa_cliente
        ON crediarios_cache (empresa_id, cliente_id);

      CREATE INDEX IF NOT EXISTS idx_crediarios_cache_empresa_status
        ON crediarios_cache (empresa_id, pago, cancelado, status, cliente_nome);
    `);

    db.prepare(`
      UPDATE offline_meta
         SET schema_version = ?,
             last_open_at = ?
       WHERE singleton_id = 1
    `).run(9, appliedAt);

    db.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, ?)
    `).run(9, 'offline-crediario-reference-cache', appliedAt);

    db.exec('COMMIT;');
    return true;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

function applyMigrationV10(db) {
  if (hasMigration(db, 10)) return false;

  const appliedAt = nowIso();
  db.exec('BEGIN IMMEDIATE;');

  try {
    /*
     * Caixa único: não existe reserva por venda.
     * O próximo número é derivado do último documento fiscal local real.
     */
    const leases = db.prepare(`
      SELECT empresa_id, lease_id, ambiente, modelo, serie,
             numero_inicial, numero_final, proximo_numero, status
        FROM fiscal_number_leases
    `).all();

    for (const lease of leases) {
      const lastDocument = db.prepare(`
        SELECT MAX(numero) AS ultimo_numero
          FROM nfce_documents
         WHERE empresa_id = ?
           AND ambiente = ?
           AND modelo = ?
           AND serie = ?
      `).get(
        String(lease.empresa_id),
        String(lease.ambiente),
        Number(lease.modelo),
        String(lease.serie)
      );

      if (
        lastDocument &&
        lastDocument.ultimo_numero != null
      ) {
        const ultimoNumero =
          Number(lastDocument.ultimo_numero);
        const numeroInicial =
          Number(lease.numero_inicial);
        const numeroFinal =
          Number(lease.numero_final);
        const proximoNumero =
          Math.max(
            numeroInicial,
            Math.min(
              numeroFinal + 1,
              ultimoNumero + 1
            )
          );
        const status =
          proximoNumero > numeroFinal
            ? 'EXHAUSTED'
            : 'ACTIVE';

        db.prepare(`
          UPDATE fiscal_number_leases
             SET proximo_numero = ?,
                 status = ?,
                 updated_at = ?
           WHERE empresa_id = ?
             AND lease_id = ?
        `).run(
          proximoNumero,
          status,
          appliedAt,
          String(lease.empresa_id),
          String(lease.lease_id)
        );
      }
    }

    db.exec(
      'DROP TABLE IF EXISTS fiscal_number_reservations;'
    );

    db.prepare(`
      DELETE FROM local_config
       WHERE config_key LIKE 'fiscal.numberLease.intent.v1:%'
    `).run();

    db.prepare(`
      UPDATE offline_meta
         SET schema_version = ?,
             last_open_at = ?
       WHERE singleton_id = 1
    `).run(10, appliedAt);

    db.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, ?)
    `).run(
      10,
      'single-cashier-next-number-no-reservations',
      appliedAt
    );

    db.exec('COMMIT;');
    return true;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

function applyMigrationV11(db) {
  if (hasMigration(db, 11)) return false;

  const appliedAt = nowIso();
  db.exec('BEGIN IMMEDIATE;');

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS offline_operator_credentials (
        empresa_id TEXT NOT NULL,
        operador_id TEXT NOT NULL,
        nome TEXT NOT NULL,
        perfil TEXT NOT NULL CHECK (
          perfil IN ('ADMINISTRADOR', 'SUPERVISOR', 'CAIXA')
        ),
        acesso_total INTEGER NOT NULL DEFAULT 0
          CHECK (acesso_total IN (0, 1)),
        ativo INTEGER NOT NULL DEFAULT 1
          CHECK (ativo IN (0, 1)),
        credential_kdf TEXT NOT NULL,
        credential_salt TEXT NOT NULL,
        credential_verifier TEXT NOT NULL,
        credential_params_json TEXT NOT NULL,
        credential_revision TEXT,
        source_updated_at TEXT,
        cached_at TEXT NOT NULL,
        PRIMARY KEY (empresa_id, operador_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_offline_operator_credentials_empresa_ativo
        ON offline_operator_credentials (empresa_id, ativo);

      CREATE INDEX IF NOT EXISTS idx_offline_operator_credentials_empresa_nome
        ON offline_operator_credentials (empresa_id, nome);
    `);

    db.prepare(`
      UPDATE offline_meta
         SET schema_version = ?,
             last_open_at = ?
       WHERE singleton_id = 1
    `).run(11, appliedAt);

    db.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, ?)
    `).run(
      11,
      'offline-operator-credentials-cache',
      appliedAt
    );

    db.exec('COMMIT;');
    return true;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

function applyMigrationV12(db) {
  if (hasMigration(db, 12)) return false;

  const appliedAt = nowIso();
  db.exec('BEGIN IMMEDIATE;');

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS offline_prepared_companies (
        empresa_id TEXT PRIMARY KEY,
        razao_social TEXT NOT NULL,
        cnpj TEXT NOT NULL,
        ambiente TEXT NOT NULL,
        prepared_at TEXT NOT NULL,
        last_prepared_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_offline_prepared_companies_razao
        ON offline_prepared_companies (razao_social);

      CREATE INDEX IF NOT EXISTS idx_offline_prepared_companies_cnpj
        ON offline_prepared_companies (cnpj);
    `);

    db.prepare(`
      UPDATE offline_meta
         SET schema_version = ?,
             last_open_at = ?
       WHERE singleton_id = 1
    `).run(12, appliedAt);

    db.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, ?)
    `).run(
      12,
      'offline-prepared-companies-registry',
      appliedAt
    );

    db.exec('COMMIT;');
    return true;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

function applyMigrationV13(db) {
  if (hasMigration(db, 13)) return false;

  const appliedAt = nowIso();
  db.exec('BEGIN IMMEDIATE;');

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS offline_provisioned_credentials (
        empresa_id TEXT NOT NULL,
        operador_id TEXT NOT NULL,
        nome TEXT NOT NULL,
        perfil TEXT NOT NULL CHECK (
          perfil IN ('ADMINISTRADOR', 'SUPERVISOR', 'CAIXA')
        ),
        acesso_total INTEGER NOT NULL DEFAULT 0
          CHECK (acesso_total IN (0, 1)),
        ativo INTEGER NOT NULL DEFAULT 1
          CHECK (ativo IN (0, 1)),
        lookup_scheme TEXT NOT NULL,
        lookup_verifier TEXT NOT NULL,
        source_updated_at TEXT,
        cached_at TEXT NOT NULL,
        PRIMARY KEY (empresa_id, operador_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_offline_provisioned_credentials_empresa_ativo
        ON offline_provisioned_credentials (empresa_id, ativo);
    `);

    db.prepare(`
      UPDATE offline_meta
         SET schema_version = ?,
             last_open_at = ?
       WHERE singleton_id = 1
    `).run(13, appliedAt);

    db.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, ?)
    `).run(
      13,
      'offline-multi-company-provisioned-credentials',
      appliedAt
    );

    db.exec('COMMIT;');
    return true;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

function touchOpenMetadata(db) {
  const openedAt = nowIso();
  db.prepare(`
    UPDATE offline_meta
       SET schema_version = ?,
           last_open_at = ?
     WHERE singleton_id = 1
  `).run(OFFLINE_DB_SCHEMA_VERSION, openedAt);
}

function inspectDatabase(db) {
  const journalMode = scalarRowValue(db.prepare('PRAGMA journal_mode').get());
  const foreignKeys = Number(scalarRowValue(db.prepare('PRAGMA foreign_keys').get()));
  const synchronous = Number(scalarRowValue(db.prepare('PRAGMA synchronous').get()));
  const busyTimeout = Number(scalarRowValue(db.prepare('PRAGMA busy_timeout').get()));
  const migrationRows = db.prepare(
    'SELECT version, name, applied_at FROM schema_migrations ORDER BY version'
  ).all();
  const meta = db.prepare(
    'SELECT schema_version, created_at, last_open_at FROM offline_meta WHERE singleton_id = 1'
  ).get();

  return {
    schemaVersion: meta ? Number(meta.schema_version) : 0,
    journalMode: String(journalMode || ''),
    foreignKeysEnabled: foreignKeys === 1,
    synchronous,
    busyTimeout,
    migrations: migrationRows.map((row) => ({
      version: Number(row.version),
      name: String(row.name),
      appliedAt: String(row.applied_at)
    })),
    createdAt: meta ? String(meta.created_at) : null,
    lastOpenAt: meta ? String(meta.last_open_at) : null
  };
}

function syncedSaleStatusMapping(statusValue) {
  const status = String(statusValue || '').trim().toUpperCase();
  if (status === 'PAID_OFFLINE_PENDING_SYNC') {
    return {
      localStatus: 'PAID_OFFLINE_SYNCED',
      payloadStatus: 'PAGA_OFFLINE_SINCRONIZADA'
    };
  }
  if (status === 'PAID_INTERNAL_OFFLINE') {
    return {
      localStatus: 'PAID_INTERNAL_SYNCED',
      payloadStatus: 'PAGA_INTERNA_SINCRONIZADA'
    };
  }
  if (status === 'CREDIARIO_RECEBIMENTO_OFFLINE_PENDING_SYNC') {
    return {
      localStatus: 'CREDIARIO_RECEBIMENTO_OFFLINE_SYNCED',
      payloadStatus: 'CREDIARIO_RECEBIMENTO_OFFLINE_SINCRONIZADO'
    };
  }
  return null;
}

function applyConfirmedSaleSyncStatus(db, empresaId, operationId, confirmedAt) {
  const row = db.prepare(`
    SELECT s.sale_id, s.status, s.payload_json
      FROM sales AS s
     WHERE s.empresa_id = ?
       AND s.operation_id = ?
     LIMIT 1
  `).get(empresaId, operationId);
  if (!row) return false;

  const mapping = syncedSaleStatusMapping(row.status);
  if (!mapping) return false;

  let payloadText = String(row.payload_json || '{}');
  try {
    const parsed = JSON.parse(payloadText);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      parsed.status = mapping.payloadStatus;
      parsed.syncStatus = 'CONFIRMED';
      parsed.syncedAt = confirmedAt;
      payloadText = JSON.stringify(parsed);
    }
  } catch (_) {}

  const result = db.prepare(`
    UPDATE sales
       SET status = ?, payload_json = ?
     WHERE empresa_id = ?
       AND operation_id = ?
       AND status = ?
  `).run(mapping.localStatus, payloadText, empresaId, operationId, String(row.status));
  return Number(result.changes || 0) === 1;
}

function reconcileConfirmedSaleSyncStatuses(db) {
  const rows = db.prepare(`
    SELECT s.empresa_id, s.operation_id, o.confirmed_at
      FROM sales AS s
      JOIN sync_outbox AS o
        ON o.empresa_id = s.empresa_id
       AND o.operation_id = s.operation_id
     WHERE o.type = 'SALE_PAID'
       AND o.status = 'CONFIRMED'
       AND s.status IN ('PAID_OFFLINE_PENDING_SYNC', 'PAID_INTERNAL_OFFLINE')
  `).all();
  if (!rows.length) return 0;

  db.exec('BEGIN IMMEDIATE;');
  try {
    let changed = 0;
    for (const row of rows) {
      const confirmedAt = optionalText(row.confirmed_at) || nowIso();
      if (applyConfirmedSaleSyncStatus(db, String(row.empresa_id), String(row.operation_id), confirmedAt)) {
        changed += 1;
      }
    }
    db.exec('COMMIT;');
    return changed;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

function initializeOfflineDatabase(options = {}) {
  const userDataDir = String(options.userDataDir || '').trim();
  if (!userDataDir) {
    throw new Error('userDataDir é obrigatório para inicializar o SQLite offline.');
  }

  const dataDir = path.join(userDataDir, 'offline-data');
  const requestedDatabasePath = path.join(dataDir, 'e-fisco-offline.db');

  if (database) {
    const normalizePathForComparison = (value) => {
      const resolved = path.resolve(String(value || ''));
      return process.platform === 'win32'
        ? resolved.toLowerCase()
        : resolved;
    };

    if (
      normalizePathForComparison(requestedDatabasePath) !==
      normalizePathForComparison(databasePath)
    ) {
      throw new Error(
        'SQLite offline já está aberto para outro userDataDir; feche o banco antes de trocar o diretório.'
      );
    }

    return {
      ok: true,
      reused: true,
      path: databasePath,
      ...inspectDatabase(database)
    };
  }

  ensureDirectory(dataDir);
  databasePath = requestedDatabasePath;

  const db = new DatabaseSync(databasePath);

  try {
    configureDatabase(db);
    ensureMigrationTable(db);
    assertCompatibleExistingSchema(db);
    applyMigrationV1(db);
    applyMigrationV2(db);
    applyMigrationV3(db);
    applyMigrationV4(db);
    applyMigrationV5(db);
    applyMigrationV6(db);
    applyMigrationV7(db);
    applyMigrationV8(db);
    applyMigrationV9(db);
    applyMigrationV10(db);
    applyMigrationV11(db);
    applyMigrationV12(db);
    applyMigrationV13(db);
    reconcileConfirmedSaleSyncStatuses(db);
    touchOpenMetadata(db);

    const info = inspectDatabase(db);

    if (info.journalMode.toLowerCase() !== 'wal') {
      throw new Error(`SQLite não entrou em WAL (modo atual: ${info.journalMode}).`);
    }

    if (!info.foreignKeysEnabled) {
      throw new Error('SQLite não habilitou foreign_keys.');
    }

    if (info.schemaVersion !== OFFLINE_DB_SCHEMA_VERSION) {
      throw new Error(
        `Schema SQLite incompatível: ${info.schemaVersion} != ${OFFLINE_DB_SCHEMA_VERSION}.`
      );
    }

    database = db;

    return {
      ok: true,
      reused: false,
      path: databasePath,
      ...info
    };
  } catch (error) {
    try { db.close(); } catch (_) {}
    databasePath = '';
    throw error;
  }
}


function requiredText(value, fieldName) {
  const text = String(value == null ? '' : value).trim();
  if (!text) {
    throw new Error(`${fieldName} é obrigatório para o cache offline.`);
  }
  return text;
}

function optionalText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function booleanInt(value, defaultValue = true) {
  if (value == null) return defaultValue ? 1 : 0;
  return value === false || value === 0 || value === '0' ? 0 : 1;
}

function jsonText(value) {
  return JSON.stringify(value == null ? {} : value);
}

function upsertOfflineOperatorCredential(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const operadorId = requiredText(input.operadorId, 'operadorId');
  const nome = requiredText(input.nome, 'nome');
  const perfil = requiredText(input.perfil, 'perfil')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z]/gi, '')
    .toUpperCase();

  if (!['ADMINISTRADOR', 'SUPERVISOR', 'CAIXA'].includes(perfil)) {
    throw new Error('perfil do operador offline é inválido.');
  }

  const credentialKdf = requiredText(
    input.credentialKdf,
    'credentialKdf'
  );
  const credentialSalt = requiredText(
    input.credentialSalt,
    'credentialSalt'
  );
  const credentialVerifier = requiredText(
    input.credentialVerifier,
    'credentialVerifier'
  );

  const credentialParams =
    input.credentialParams &&
    typeof input.credentialParams === 'object' &&
    !Array.isArray(input.credentialParams)
      ? input.credentialParams
      : {};

  const credentialRevision =
    optionalText(input.credentialRevision);
  const sourceUpdatedAt =
    optionalText(input.sourceUpdatedAt);
  const cachedAt = nowIso();

  db.prepare(`
    INSERT INTO offline_operator_credentials (
      empresa_id,
      operador_id,
      nome,
      perfil,
      acesso_total,
      ativo,
      credential_kdf,
      credential_salt,
      credential_verifier,
      credential_params_json,
      credential_revision,
      source_updated_at,
      cached_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(empresa_id, operador_id) DO UPDATE SET
      nome = excluded.nome,
      perfil = excluded.perfil,
      acesso_total = excluded.acesso_total,
      ativo = excluded.ativo,
      credential_kdf = excluded.credential_kdf,
      credential_salt = excluded.credential_salt,
      credential_verifier = excluded.credential_verifier,
      credential_params_json = excluded.credential_params_json,
      credential_revision = excluded.credential_revision,
      source_updated_at = excluded.source_updated_at,
      cached_at = excluded.cached_at
  `).run(
    empresaId,
    operadorId,
    nome,
    perfil,
    booleanInt(input.acessoTotal, false),
    booleanInt(input.ativo, true),
    credentialKdf,
    credentialSalt,
    credentialVerifier,
    jsonText(credentialParams),
    credentialRevision,
    sourceUpdatedAt,
    cachedAt
  );

  return {
    empresaId,
    operadorId,
    nome,
    perfil,
    acessoTotal: booleanInt(input.acessoTotal, false) === 1,
    ativo: booleanInt(input.ativo, true) === 1,
    credentialKdf,
    credentialRevision,
    sourceUpdatedAt,
    cachedAt
  };
}

function deactivateOfflineOperatorCredentialsExcept(
  input = {}
) {
  const db =
    getOfflineDatabase();

  const empresaId =
    requiredText(
      input.empresaId,
      'empresaId'
    );

  const operadorIds =
    Array.isArray(
      input.operadorIds
    )
      ? [
          ...new Set(
            input.operadorIds
              .map(
                (value) =>
                  String(
                    value || ''
                  ).trim()
              )
              .filter(Boolean)
          )
        ]
      : [];

  if (operadorIds.length < 1) {
    const result =
      db.prepare(
        'UPDATE offline_operator_credentials ' +
        'SET ativo = 0 ' +
        'WHERE empresa_id = ? ' +
        'AND ativo = 1'
      ).run(
        empresaId
      );

    return Number(
      result.changes || 0
    );
  }

  const placeholders =
    operadorIds
      .map(() => '?')
      .join(',');

  const result =
    db.prepare(
      'UPDATE offline_operator_credentials ' +
      'SET ativo = 0 ' +
      'WHERE empresa_id = ? ' +
      'AND ativo = 1 ' +
      'AND operador_id NOT IN (' +
      placeholders +
      ')'
    ).run(
      empresaId,
      ...operadorIds
    );

  return Number(
    result.changes || 0
  );
}

function deactivateOfflineOperatorCredentialsOutsideCompanies(
  empresaIdsValue = []
) {
  const db =
    getOfflineDatabase();

  const empresaIds =
    Array.isArray(
      empresaIdsValue
    )
      ? [
          ...new Set(
            empresaIdsValue
              .map(
                (value) =>
                  String(
                    value || ''
                  ).trim()
              )
              .filter(Boolean)
          )
        ]
      : [];

  if (empresaIds.length < 1) {
    const result =
      db.prepare(
        'UPDATE offline_operator_credentials ' +
        'SET ativo = 0 ' +
        'WHERE ativo = 1'
      ).run();

    return Number(
      result.changes || 0
    );
  }

  const placeholders =
    empresaIds
      .map(() => '?')
      .join(',');

  const result =
    db.prepare(
      'UPDATE offline_operator_credentials ' +
      'SET ativo = 0 ' +
      'WHERE ativo = 1 ' +
      'AND empresa_id NOT IN (' +
      placeholders +
      ')'
    ).run(
      ...empresaIds
    );

  return Number(
    result.changes || 0
  );
}

function mapProvisionedCredentialRow(row) {
  if (!row) return null;

  return {
    empresaId:
      String(row.empresa_id),
    operadorId:
      String(row.operador_id),
    nome:
      String(row.nome),
    perfil:
      String(row.perfil),
    acessoTotal:
      Number(row.acesso_total) === 1,
    ativo:
      Number(row.ativo) === 1,
    lookupScheme:
      String(row.lookup_scheme),
    lookupVerifier:
      String(row.lookup_verifier),
    sourceUpdatedAt:
      row.source_updated_at == null
        ? null
        : String(row.source_updated_at),
    cachedAt:
      String(row.cached_at)
  };
}

function upsertProvisionedOfflineCredential(input = {}) {
  const db = getOfflineDatabase();
  const empresaId =
    requiredText(
      input.empresaId,
      'empresaId'
    );
  const operadorId =
    requiredText(
      input.operadorId,
      'operadorId'
    );
  const nome =
    requiredText(
      input.nome,
      'nome'
    );
  const perfil =
    requiredText(
      input.perfil,
      'perfil'
    )
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z]/gi, '')
      .toUpperCase();

  if (
    ![
      'ADMINISTRADOR',
      'SUPERVISOR',
      'CAIXA'
    ].includes(perfil)
  ) {
    throw new Error(
      'perfil provisionado offline é inválido.'
    );
  }

  const lookupScheme =
    requiredText(
      input.lookupScheme,
      'lookupScheme'
    );
  const lookupVerifier =
    requiredText(
      input.lookupVerifier,
      'lookupVerifier'
    );
  const sourceUpdatedAt =
    optionalText(
      input.sourceUpdatedAt
    );
  const cachedAt =
    nowIso();

  db.prepare(`
    INSERT INTO offline_provisioned_credentials (
      empresa_id,
      operador_id,
      nome,
      perfil,
      acesso_total,
      ativo,
      lookup_scheme,
      lookup_verifier,
      source_updated_at,
      cached_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (
      empresa_id,
      operador_id
    ) DO UPDATE SET
      nome = excluded.nome,
      perfil = excluded.perfil,
      acesso_total =
        excluded.acesso_total,
      ativo = excluded.ativo,
      lookup_scheme =
        excluded.lookup_scheme,
      lookup_verifier =
        excluded.lookup_verifier,
      source_updated_at =
        excluded.source_updated_at,
      cached_at =
        excluded.cached_at
  `).run(
    empresaId,
    operadorId,
    nome,
    perfil,
    booleanInt(
      input.acessoTotal,
      false
    ),
    booleanInt(
      input.ativo,
      true
    ),
    lookupScheme,
    lookupVerifier,
    sourceUpdatedAt,
    cachedAt
  );

  return {
    empresaId,
    operadorId,
    nome,
    perfil,
    acessoTotal:
      booleanInt(
        input.acessoTotal,
        false
      ) === 1,
    ativo:
      booleanInt(
        input.ativo,
        true
      ) === 1,
    lookupScheme,
    sourceUpdatedAt,
    cachedAt
  };
}

function listActiveProvisionedOfflineCredentials(
  empresaIdValue = null
) {
  const db =
    getOfflineDatabase();

  const empresaId =
    empresaIdValue == null
      ? null
      : requiredText(
          empresaIdValue,
          'empresaId'
        );

  const rows =
    empresaId
      ? db.prepare(`
          SELECT
            empresa_id,
            operador_id,
            nome,
            perfil,
            acesso_total,
            ativo,
            lookup_scheme,
            lookup_verifier,
            source_updated_at,
            cached_at
          FROM offline_provisioned_credentials
          WHERE empresa_id = ?
            AND ativo = 1
          ORDER BY
            nome COLLATE NOCASE,
            operador_id
        `).all(empresaId)
      : db.prepare(`
          SELECT
            empresa_id,
            operador_id,
            nome,
            perfil,
            acesso_total,
            ativo,
            lookup_scheme,
            lookup_verifier,
            source_updated_at,
            cached_at
          FROM offline_provisioned_credentials
          WHERE ativo = 1
          ORDER BY
            empresa_id,
            nome COLLATE NOCASE,
            operador_id
        `).all();

  return rows.map(
    mapProvisionedCredentialRow
  );
}

function deactivateProvisionedOfflineCredentialsExcept(
  input = {}
) {
  const db =
    getOfflineDatabase();
  const empresaId =
    requiredText(
      input.empresaId,
      'empresaId'
    );
  const operadorIds =
    Array.isArray(
      input.operadorIds
    )
      ? [
          ...new Set(
            input.operadorIds
              .map(
                (value) =>
                  String(
                    value || ''
                  ).trim()
              )
              .filter(Boolean)
          )
        ]
      : [];

  if (operadorIds.length < 1) {
    const result =
      db.prepare(`
        UPDATE offline_provisioned_credentials
           SET ativo = 0
         WHERE empresa_id = ?
           AND ativo = 1
      `).run(
        empresaId
      );

    return Number(
      result.changes || 0
    );
  }

  const placeholders =
    operadorIds
      .map(() => '?')
      .join(',');

  const result =
    db.prepare(`
      UPDATE offline_provisioned_credentials
         SET ativo = 0
       WHERE empresa_id = ?
         AND ativo = 1
         AND operador_id NOT IN (
           ${placeholders}
         )
    `).run(
      empresaId,
      ...operadorIds
    );

  return Number(
    result.changes || 0
  );
}

function deactivateProvisionedOfflineCredentialsOutsideCompanies(
  empresaIdsValue = []
) {
  const db =
    getOfflineDatabase();
  const empresaIds =
    Array.isArray(
      empresaIdsValue
    )
      ? [
          ...new Set(
            empresaIdsValue
              .map(
                (value) =>
                  String(
                    value || ''
                  ).trim()
              )
              .filter(Boolean)
          )
        ]
      : [];

  if (empresaIds.length < 1) {
    const result =
      db.prepare(`
        UPDATE offline_provisioned_credentials
           SET ativo = 0
         WHERE ativo = 1
      `).run();

    return Number(
      result.changes || 0
    );
  }

  const placeholders =
    empresaIds
      .map(() => '?')
      .join(',');

  const result =
    db.prepare(`
      UPDATE offline_provisioned_credentials
         SET ativo = 0
       WHERE ativo = 1
         AND empresa_id NOT IN (
           ${placeholders}
         )
    `).run(
      ...empresaIds
    );

  return Number(
    result.changes || 0
  );
}

function decimalMoneyToCents(value, fieldName) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${fieldName} deve ser um valor monetário maior ou igual a zero.`);
  }
  const cents = Math.round(number * 100);
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`${fieldName} excede o limite monetário seguro.`);
  }
  return cents;
}

function upsertProductCache(input) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input && input.empresaId, 'empresaId');
  const produtoId = requiredText(input && input.produtoId, 'produtoId');
  const descricao = requiredText(input && input.descricao, 'descricao');
  const cachedAt = nowIso();
  const preco = input && input.precoCentavos != null
    ? Number(input.precoCentavos)
    : null;

  if (preco != null && (!Number.isSafeInteger(preco) || preco < 0)) {
    throw new Error('precoCentavos deve ser um inteiro seguro maior ou igual a zero.');
  }

  db.prepare(`
    INSERT INTO products_cache (
      empresa_id, produto_id, codigo, gtin, descricao, unidade,
      preco_centavos, ativo, revision, source_updated_at, cached_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(empresa_id, produto_id) DO UPDATE SET
      codigo = excluded.codigo,
      gtin = excluded.gtin,
      descricao = excluded.descricao,
      unidade = excluded.unidade,
      preco_centavos = excluded.preco_centavos,
      ativo = excluded.ativo,
      revision = excluded.revision,
      source_updated_at = excluded.source_updated_at,
      cached_at = excluded.cached_at,
      payload_json = excluded.payload_json
  `).run(
    empresaId,
    produtoId,
    optionalText(input.codigo),
    optionalText(input.gtin),
    descricao,
    optionalText(input.unidade),
    preco,
    booleanInt(input.ativo, true),
    optionalText(input.revision),
    optionalText(input.sourceUpdatedAt),
    cachedAt,
    jsonText(input.payload)
  );

  return db.prepare(`
    SELECT empresa_id, produto_id, codigo, gtin, descricao, unidade,
           preco_centavos, ativo, revision, source_updated_at, cached_at, payload_json
      FROM products_cache
     WHERE empresa_id = ? AND produto_id = ?
  `).get(empresaId, produtoId);
}

function upsertCustomerCache(input) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input && input.empresaId, 'empresaId');
  const clienteId = requiredText(input && input.clienteId, 'clienteId');
  const nome = requiredText(input && input.nome, 'nome');
  const cachedAt = nowIso();

  db.prepare(`
    INSERT INTO customers_cache (
      empresa_id, cliente_id, nome, documento, telefone, email,
      ativo, revision, source_updated_at, cached_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(empresa_id, cliente_id) DO UPDATE SET
      nome = excluded.nome,
      documento = excluded.documento,
      telefone = excluded.telefone,
      email = excluded.email,
      ativo = excluded.ativo,
      revision = excluded.revision,
      source_updated_at = excluded.source_updated_at,
      cached_at = excluded.cached_at,
      payload_json = excluded.payload_json
  `).run(
    empresaId,
    clienteId,
    nome,
    optionalText(input.documento),
    optionalText(input.telefone),
    optionalText(input.email),
    booleanInt(input.ativo, true),
    optionalText(input.revision),
    optionalText(input.sourceUpdatedAt),
    cachedAt,
    jsonText(input.payload)
  );

  return db.prepare(`
    SELECT empresa_id, cliente_id, nome, documento, telefone, email,
           ativo, revision, source_updated_at, cached_at, payload_json
      FROM customers_cache
     WHERE empresa_id = ? AND cliente_id = ?
  `).get(empresaId, clienteId);
}

function mapCrediarioCacheRow(row) {
  if (!row) return null;
  const money = (value) => value == null ? null : Number(value) / 100;
  return {
    empresaId: String(row.empresa_id),
    contaReceberId: String(row.conta_receber_id),
    crediarioId: String(row.crediario_id),
    clienteId: row.cliente_id == null ? null : String(row.cliente_id),
    clienteNome: row.cliente_nome == null ? null : String(row.cliente_nome),
    nome: row.cliente_nome == null ? null : String(row.cliente_nome),
    cpf: row.cpf == null ? null : String(row.cpf),
    whatsapp: row.whatsapp == null ? null : String(row.whatsapp),
    valor: money(row.valor_centavos),
    valorOriginal: money(row.valor_original_centavos),
    valorRecebido: money(row.valor_recebido_centavos),
    saldoReceber: money(row.saldo_receber_centavos),
    vencimento: row.vencimento == null ? null : String(row.vencimento),
    status: String(row.status),
    pago: Number(row.pago) === 1,
    pagoEm: row.pago_em == null ? null : String(row.pago_em),
    formaPagamento: row.forma_pagamento == null ? null : String(row.forma_pagamento),
    abertoEm: row.aberto_em == null ? null : String(row.aberto_em),
    cancelado: Number(row.cancelado) === 1,
    canceladoEm: row.cancelado_em == null ? null : String(row.cancelado_em),
    situacaoVersao: row.situacao_versao == null ? null : Number(row.situacao_versao),
    revision: row.revision == null ? null : String(row.revision),
    sourceUpdatedAt: row.source_updated_at == null ? null : String(row.source_updated_at),
    cachedAt: String(row.cached_at),
    payload: parseJsonText(row.payload_json)
  };
}

function upsertCrediarioCache(input) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input && input.empresaId, 'empresaId');
  const contaReceberId = requiredText(input && input.contaReceberId, 'contaReceberId');
  const crediarioId = requiredText(input && input.crediarioId, 'crediarioId');
  const status = requiredText(input && input.status, 'status');
  const snapshotToken = requiredText(input && input.snapshotToken, 'snapshotToken');
  const cachedAt = nowIso();

  db.prepare(`
    INSERT INTO crediarios_cache (
      empresa_id, conta_receber_id, crediario_id, cliente_id, cliente_nome,
      cpf, whatsapp, valor_centavos, valor_original_centavos,
      valor_recebido_centavos, saldo_receber_centavos, vencimento, status,
      pago, pago_em, forma_pagamento, aberto_em, cancelado, cancelado_em,
      situacao_versao, revision, source_updated_at, snapshot_token,
      cached_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(empresa_id, conta_receber_id) DO UPDATE SET
      crediario_id = excluded.crediario_id,
      cliente_id = excluded.cliente_id,
      cliente_nome = excluded.cliente_nome,
      cpf = excluded.cpf,
      whatsapp = excluded.whatsapp,
      valor_centavos = excluded.valor_centavos,
      valor_original_centavos = excluded.valor_original_centavos,
      valor_recebido_centavos = excluded.valor_recebido_centavos,
      saldo_receber_centavos = excluded.saldo_receber_centavos,
      vencimento = excluded.vencimento,
      status = excluded.status,
      pago = excluded.pago,
      pago_em = excluded.pago_em,
      forma_pagamento = excluded.forma_pagamento,
      aberto_em = excluded.aberto_em,
      cancelado = excluded.cancelado,
      cancelado_em = excluded.cancelado_em,
      situacao_versao = excluded.situacao_versao,
      revision = excluded.revision,
      source_updated_at = excluded.source_updated_at,
      snapshot_token = excluded.snapshot_token,
      cached_at = excluded.cached_at,
      payload_json = excluded.payload_json
  `).run(
    empresaId,
    contaReceberId,
    crediarioId,
    optionalText(input.clienteId),
    optionalText(input.clienteNome || input.nome),
    optionalText(input.cpf),
    optionalText(input.whatsapp),
    decimalMoneyToCents(input.valor, 'valor'),
    decimalMoneyToCents(input.valorOriginal, 'valorOriginal'),
    decimalMoneyToCents(input.valorRecebido, 'valorRecebido'),
    decimalMoneyToCents(input.saldoReceber, 'saldoReceber'),
    optionalText(input.vencimento),
    status,
    booleanInt(input.pago, false),
    optionalText(input.pagoEm),
    optionalText(input.formaPagamento),
    optionalText(input.abertoEm),
    booleanInt(input.cancelado, false),
    optionalText(input.canceladoEm),
    input.situacaoVersao == null ? null : Number(input.situacaoVersao),
    optionalText(input.revision),
    optionalText(input.sourceUpdatedAt),
    snapshotToken,
    cachedAt,
    jsonText(input.payload == null ? input : input.payload)
  );

  return mapCrediarioCacheRow(db.prepare(`
    SELECT *
      FROM crediarios_cache
     WHERE empresa_id = ? AND conta_receber_id = ?
  `).get(empresaId, contaReceberId));
}

function finalizeCrediariosSnapshot(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const snapshotToken = requiredText(input.snapshotToken, 'snapshotToken');
  const result = db.prepare(`
    DELETE FROM crediarios_cache
     WHERE empresa_id = ?
       AND snapshot_token <> ?
       AND snapshot_token NOT LIKE 'local:%'
  `).run(empresaId, snapshotToken);
  return Number(result.changes || 0);
}

function listCrediariosCache(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const limit = normalizeLimit(input.limit, 500, 5000);
  const rows = db.prepare(`
    SELECT *
      FROM crediarios_cache
     WHERE empresa_id = ?
       AND pago = 0
       AND cancelado = 0
       AND COALESCE(saldo_receber_centavos, valor_centavos, 0) > 0
     ORDER BY cliente_nome COLLATE NOCASE, vencimento, conta_receber_id
     LIMIT ?
  `).all(empresaId, limit);
  return rows.map(mapCrediarioCacheRow);
}

function crediarioItemIsOpen(item) {
  if (!item || typeof item !== 'object') return false;
  const quantity = Number(item.quantity == null ? item.quantidade : item.quantity);
  return (
    item.pago !== true &&
    item.cancelado !== true &&
    item.cancelled !== true &&
    Number.isFinite(quantity) &&
    quantity > 0
  );
}

function normalizeCrediarioDetailItem(item, index = 0) {
  const source = item && typeof item === 'object' ? item : {};
  const quantity = Number(source.quantity == null ? source.quantidade : source.quantity);
  const unitValue = Number(source.unitValue == null ? source.valorUnitario : source.unitValue);
  const totalValue = Number(
    source.totalValue == null
      ? (source.total == null ? quantity * unitValue : source.total)
      : source.totalValue
  );

  return {
    crediarioItemId: optionalText(
      source.crediarioItemId || source.id || source._id || source.wixId
    ),
    id: optionalText(
      source.crediarioItemId || source.id || source._id || source.wixId
    ),
    itemNumber: Number(source.itemNumber || source.item_number || index + 1),
    produtoId: optionalText(
      source.produtoId || source.productFiscalId || source.productId
    ),
    productFiscalId: optionalText(
      source.produtoId || source.productFiscalId || source.productId
    ),
    productCode: optionalText(
      source.productCode || source.codigoProduto || source.codigo || source.barcode
    ),
    description: optionalText(
      source.description || source.descricao || source.name || source.nome
    ),
    name: optionalText(
      source.description || source.descricao || source.name || source.nome
    ),
    ncm: optionalText(source.ncm),
    cest: optionalText(source.cest),
    cfop: optionalText(source.cfop),
    unit: optionalText(source.unit || source.unidade) || 'UN',
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unitValue: Number.isFinite(unitValue) ? unitValue : 0,
    totalValue: Number.isFinite(totalValue) ? totalValue : 0,
    total: Number.isFinite(totalValue) ? totalValue : 0,
    taxCode: optionalText(source.taxCode),
    tributosReferenciaJson:
      source.tributosReferenciaJson == null
        ? ''
        : source.tributosReferenciaJson,
    cancelled: source.cancelled === true || source.cancelado === true,
    cancelado: source.cancelled === true || source.cancelado === true,
    canceladoEm: optionalText(source.canceladoEm),
    pago: source.pago === true,
    pagoEm: optionalText(source.pagoEm),
    formaPagamento: optionalText(source.formaPagamento),
    fiscalSaleId: optionalText(source.fiscalSaleId),
    fiscalStatus: optionalText(source.fiscalStatus),
    liquidacaoId: optionalText(source.liquidacaoId),
    sourceUpdatedAt: optionalText(source.sourceUpdatedAt)
  };
}

function getCrediarioCacheById(empresaIdValue, crediarioIdValue) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const crediarioId = requiredText(crediarioIdValue, 'crediarioId');
  const row = db.prepare(`
    SELECT *
      FROM crediarios_cache
     WHERE empresa_id = ?
       AND (crediario_id = ? OR conta_receber_id = ?)
     LIMIT 1
  `).get(empresaId, crediarioId, crediarioId);
  return mapCrediarioCacheRow(row);
}

function getCrediarioDetailCache(input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const crediarioId = requiredText(
    input.crediarioId || input.contaReceberId,
    'crediarioId'
  );
  const conta = getCrediarioCacheById(empresaId, crediarioId);
  if (!conta) {
    throw new Error('Crediário não encontrado no cache offline.');
  }
  if (conta.pago === true || conta.cancelado === true) {
    throw new Error('O crediário não está aberto para operação offline.');
  }

  const payload =
    conta.payload && typeof conta.payload === 'object' && !Array.isArray(conta.payload)
      ? conta.payload
      : {};
  const rawItems = Array.isArray(payload.itens) ? payload.itens : [];
  const itens = rawItems
    .map(normalizeCrediarioDetailItem)
    .filter(crediarioItemIsOpen)
    .sort((a, b) => {
      const numberDiff = Number(a.itemNumber || 0) - Number(b.itemNumber || 0);
      if (numberDiff !== 0) return numberDiff;
      return String(a.crediarioItemId || '').localeCompare(String(b.crediarioItemId || ''));
    });

  return {
    conta: {
      ...conta,
      _id: conta.contaReceberId,
      saleId: conta.crediarioId,
      valor: conta.saldoReceber == null ? conta.valor : conta.saldoReceber
    },
    itens,
    offline: true
  };
}


function openCrediarioOfflineAtomic(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const crediarioId = requiredText(input.crediarioId, 'crediarioId');
  const contaReceberId = optionalText(input.contaReceberId) || crediarioId;
  const operationId = requiredText(input.operationId, 'operationId');
  const clienteId = requiredText(input.clienteId, 'clienteId');
  const clienteNome = requiredText(input.clienteNome, 'clienteNome');
  const cpf = optionalText(input.cpf);
  const whatsapp = optionalText(input.whatsapp);
  const vencimento = requiredText(input.vencimento, 'vencimento');
  const occurredAt = optionalText(input.occurredAt) || nowIso();
  const createdAt = nowIso();
  const items = Array.isArray(input.items) ? input.items : [];

  if (!items.length) {
    throw new Error('O crediário offline precisa ter pelo menos um item.');
  }

  const existingOperation = db.prepare(`
    SELECT type, entity_id
      FROM sync_outbox
     WHERE empresa_id = ?
       AND operation_id = ?
     LIMIT 1
  `).get(empresaId, operationId);

  if (existingOperation) {
    if (
      String(existingOperation.type) !== 'CREDIARIO_OPEN' ||
      String(existingOperation.entity_id) !== crediarioId
    ) {
      throw new Error('operationId do crediário já foi usado por outra operação.');
    }

    return {
      applied: false,
      duplicate: true,
      operation: getOutboxOperation(empresaId, operationId),
      detalhe: getCrediarioDetailCache({ empresaId, crediarioId })
    };
  }

  const existingAccount = db.prepare(`
    SELECT conta_receber_id
      FROM crediarios_cache
     WHERE empresa_id = ?
       AND crediario_id = ?
     LIMIT 1
  `).get(empresaId, crediarioId);

  if (existingAccount) {
    throw new Error('O crediário já existe localmente com outra operação.');
  }

  const customer = db.prepare(`
    SELECT cliente_id, ativo
      FROM customers_cache
     WHERE empresa_id = ?
       AND cliente_id = ?
     LIMIT 1
  `).get(empresaId, clienteId);

  if (!customer || Number(customer.ativo) !== 1) {
    throw new Error('O cliente do crediário não está ativo no cache offline.');
  }

  const normalizedItems = items.map((item, index) => {
    const crediarioItemId = requiredText(
      item && (item.crediarioItemId || item.id),
      `items[${index}].crediarioItemId`
    );
    const produtoId = requiredText(
      item && (item.produtoId || item.productFiscalId),
      `items[${index}].produtoId`
    );
    const quantityMicrounits = decimalToMicrounits(
      item && item.quantity,
      `items[${index}].quantity`
    );
    const unitValueCentavos = decimalMoneyToCents(
      item && item.unitValue,
      `items[${index}].unitValue`
    );
    const totalValueCentavos = decimalMoneyToCents(
      item && item.totalValue,
      `items[${index}].totalValue`
    );
    const expected = roundedCrediarioLineTotalCentavos(
      quantityMicrounits,
      unitValueCentavos
    );

    if (unitValueCentavos <= 0 || totalValueCentavos <= 0) {
      throw new Error(`Item ${index + 1} do crediário possui valor inválido.`);
    }
    if (expected !== totalValueCentavos) {
      throw new Error(
        `Item ${index + 1} do crediário possui total divergente da quantidade × valor unitário.`
      );
    }

    return {
      crediarioItemId,
      itemNumber:
        Number.isSafeInteger(Number(item.itemNumber)) && Number(item.itemNumber) > 0
          ? Number(item.itemNumber)
          : index + 1,
      produtoId,
      productCode: optionalText(item.productCode),
      description: optionalText(item.description || item.name),
      ncm: optionalText(item.ncm),
      cest: optionalText(item.cest),
      cfop: optionalText(item.cfop),
      unit: optionalText(item.unit) || 'UN',
      quantityMicrounits,
      unitValueCentavos,
      totalValueCentavos,
      taxCode: optionalText(item.taxCode),
      tributosReferenciaJson:
        item && item.tributosReferenciaJson != null
          ? item.tributosReferenciaJson
          : null
    };
  });

  const ids = new Set();
  for (const item of normalizedItems) {
    if (ids.has(item.crediarioItemId)) {
      throw new Error('crediarioItemId duplicado na abertura do crediário.');
    }
    ids.add(item.crediarioItemId);
  }

  const calculatedTotal = normalizedItems.reduce(
    (sum, item) => sum + item.totalValueCentavos,
    0
  );
  const totalCentavos =
    input.totalCentavos == null
      ? calculatedTotal
      : moneyCents(input.totalCentavos, 'totalCentavos');

  if (totalCentavos !== calculatedTotal) {
    throw new Error('Total do crediário difere da soma dos itens.');
  }

  const serverItems = normalizedItems.map((item) => ({
    crediarioItemId: item.crediarioItemId,
    id: item.crediarioItemId,
    itemNumber: item.itemNumber,
    produtoId: item.produtoId,
    productFiscalId: item.produtoId,
    productCode: item.productCode,
    description: item.description,
    ncm: item.ncm,
    cest: item.cest,
    cfop: item.cfop,
    unit: item.unit,
    quantity: microunitsToDecimalString(item.quantityMicrounits),
    unitValue: item.unitValueCentavos / 100,
    totalValue: item.totalValueCentavos / 100,
    taxCode: item.taxCode,
    tributosReferenciaJson: item.tributosReferenciaJson,
    cancelled: false,
    cancelado: false,
    pago: false,
    formaPagamento: '',
    fiscalSaleId: '',
    fiscalStatus: 'NAO_EMITIDA',
    liquidacaoId: ''
  }));

  const accountPayload = {
    ...(input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
      ? input.payload
      : {}),
    crediarioId,
    clienteId,
    clienteNome,
    cpf,
    whatsapp,
    valor: totalCentavos / 100,
    valorOriginal: totalCentavos / 100,
    valorRecebido: 0,
    saldoReceber: totalCentavos / 100,
    vencimento,
    status: 'A_RECEBER',
    pago: false,
    cancelado: false,
    situacaoVersao: 0,
    abertoEm: occurredAt,
    offline: true,
    syncPendente: true,
    itens: serverItems
  };

  const outboxPayload = {
    crediarioId,
    contaReceberId,
    clienteId,
    clienteNome,
    cpf,
    whatsapp,
    valor: totalCentavos / 100,
    valorOriginal: totalCentavos / 100,
    valorRecebido: 0,
    saldoReceber: totalCentavos / 100,
    vencimento,
    status: 'A_RECEBER',
    situacaoVersao: 0,
    occurredAt,
    itens: serverItems
  };

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(`
      INSERT INTO crediarios_cache (
        empresa_id, conta_receber_id, crediario_id, cliente_id, cliente_nome,
        cpf, whatsapp, valor_centavos, valor_original_centavos,
        valor_recebido_centavos, saldo_receber_centavos, vencimento, status,
        pago, pago_em, forma_pagamento, aberto_em, cancelado, cancelado_em,
        situacao_versao, revision, source_updated_at, snapshot_token,
        cached_at, payload_json
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        0, ?, ?, 'A_RECEBER',
        0, NULL, NULL, ?, 0, NULL,
        0, NULL, ?, ?,
        ?, ?
      )
    `).run(
      empresaId,
      contaReceberId,
      crediarioId,
      clienteId,
      clienteNome,
      cpf,
      whatsapp,
      totalCentavos,
      totalCentavos,
      totalCentavos,
      vencimento,
      occurredAt,
      occurredAt,
      `local:${operationId}`,
      createdAt,
      JSON.stringify(accountPayload)
    );

    for (const item of normalizedItems) {
      const stockOperationId =
        `${operationId}:stock:${item.crediarioItemId}`;
      const stockMovementId =
        `${crediarioId}:open-stock:${item.crediarioItemId}`;

      db.prepare(`
        INSERT INTO stock_movements (
          empresa_id, movement_id, operation_id, produto_id, direction,
          quantity_microunits, movement_type, source_id, occurred_at,
          created_at, payload_json
        ) VALUES (?, ?, ?, ?, -1, ?, 'CREDIARIO_ABERTURA_OFFLINE', ?, ?, ?, ?)
      `).run(
        empresaId,
        stockMovementId,
        stockOperationId,
        item.produtoId,
        item.quantityMicrounits,
        crediarioId,
        occurredAt,
        createdAt,
        JSON.stringify({
          crediarioId,
          crediarioItemId: item.crediarioItemId
        })
      );

      db.prepare(`
        INSERT INTO stock_projection (
          empresa_id, produto_id, quantity_microunits, updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(empresa_id, produto_id) DO UPDATE SET
          quantity_microunits =
            stock_projection.quantity_microunits + excluded.quantity_microunits,
          updated_at = excluded.updated_at
      `).run(
        empresaId,
        item.produtoId,
        -item.quantityMicrounits,
        createdAt
      );
    }

    db.prepare(`
      INSERT INTO sync_outbox (
        empresa_id, operation_id, type, entity_id, payload_json, status,
        attempts, dependencies_json, created_at, updated_at, last_error
      ) VALUES (?, ?, 'CREDIARIO_OPEN', ?, ?, 'PENDING', 0, '[]', ?, ?, NULL)
    `).run(
      empresaId,
      operationId,
      crediarioId,
      JSON.stringify(outboxPayload),
      createdAt,
      createdAt
    );

    db.exec('COMMIT;');
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }

  return {
    applied: true,
    duplicate: false,
    operation: getOutboxOperation(empresaId, operationId),
    detalhe: getCrediarioDetailCache({ empresaId, crediarioId })
  };
}

function crediarioOutboxDependencies(db, empresaId, crediarioId) {
  const rows = db.prepare(`
    SELECT operation_id, status
      FROM sync_outbox
     WHERE empresa_id = ?
       AND entity_id = ?
       AND type IN ('CREDIARIO_OPEN', 'CREDIARIO_ITEMS_UPDATE')
       AND status <> 'CONFIRMED'
     ORDER BY created_at, operation_id
  `).all(empresaId, crediarioId);

  const blocked = rows.find((row) =>
    ['CONFLICT', 'MANUAL_REVIEW'].includes(String(row.status || '').toUpperCase())
  );
  if (blocked) {
    throw new Error(
      'O crediário possui uma atualização offline em conflito e precisa sincronizar antes de nova operação.'
    );
  }

  return rows
    .filter((row) =>
      ['PENDING', 'SENDING', 'RETRY'].includes(String(row.status || '').toUpperCase())
    )
    .map((row) => String(row.operation_id));
}

function getCrediarioPendingDependencies(empresaIdValue, crediarioIdValue) {
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const crediarioId = requiredText(crediarioIdValue, 'crediarioId');
  return crediarioOutboxDependencies(
    getOfflineDatabase(),
    empresaId,
    crediarioId
  );
}

function roundedCrediarioLineTotalCentavos(quantityMicrounits, unitPriceCentavos) {
  const numerator = BigInt(quantityMicrounits) * BigInt(unitPriceCentavos);
  const scale = BigInt(STOCK_QUANTITY_SCALE);
  const rounded = (numerator + (scale / 2n)) / scale;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Total do item do crediário excede o limite monetário seguro.');
  }
  return Number(rounded);
}

function updateCrediarioItemsOfflineAtomic(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const crediarioId = requiredText(input.crediarioId, 'crediarioId');
  const operationId = optionalText(input.operationId) ||
    `crediario-items:${crediarioId}:${randomUUID()}`;
  const occurredAt = optionalText(input.occurredAt) || nowIso();
  const produtos = Array.isArray(input.produtos) ? input.produtos : [];

  const existingOperation = getOutboxOperation(empresaId, operationId);
  if (existingOperation) {
    if (
      existingOperation.type !== 'CREDIARIO_ITEMS_UPDATE' ||
      existingOperation.entityId !== crediarioId
    ) {
      throw new Error('operationId do crediário já pertence a outra operação.');
    }
    return {
      applied: false,
      duplicate: true,
      operation: existingOperation,
      detalhe: getCrediarioDetailCache({ empresaId, crediarioId })
    };
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    const row = db.prepare(`
      SELECT *
        FROM crediarios_cache
       WHERE empresa_id = ?
         AND crediario_id = ?
       LIMIT 1
    `).get(empresaId, crediarioId);

    if (!row) throw new Error('Crediário não encontrado no cache offline.');
    if (Number(row.pago) === 1 || Number(row.cancelado) === 1) {
      throw new Error('O crediário não está aberto para alteração.');
    }

    const payload = parseJsonText(row.payload_json) || {};
    const rawItems = Array.isArray(payload.itens) ? payload.itens : [];
    const normalizedExisting = rawItems.map(normalizeCrediarioDetailItem);
    const existingById = new Map(
      normalizedExisting
        .filter((item) => item.crediarioItemId)
        .map((item) => [String(item.crediarioItemId), item])
    );
    const originalOpen = normalizedExisting.filter(crediarioItemIsOpen);
    const originalOpenById = new Map(
      originalOpen.map((item) => [String(item.crediarioItemId), item])
    );

    const maxItemNumber = normalizedExisting.reduce(
      (max, item) => Math.max(max, Number(item.itemNumber || 0)),
      0
    );
    let nextItemNumber = maxItemNumber + 1;
    const requestedExistingIds = new Set();
    const desiredOpen = [];

    for (let index = 0; index < produtos.length; index += 1) {
      const product = produtos[index] && typeof produtos[index] === 'object'
        ? produtos[index]
        : {};
      if (product.cancelled === true || product.cancelado === true) {
        const cancelledId = optionalText(product.crediarioItemId || product.id);
        if (cancelledId) requestedExistingIds.add(cancelledId);
        continue;
      }

      const produtoId = requiredText(
        product.productFiscalId || product.produtoId || product.productId,
        `produtos[${index}].produtoId`
      );
      const cachedProduct = getProductCacheById(empresaId, produtoId);
      if (!cachedProduct || cachedProduct.ativo !== true) {
        throw new Error(`Produto ${index + 1} não está ativo no cache offline.`);
      }

      const quantityMicrounits = decimalToMicrounits(
        product.quantity == null ? product.quantidade : product.quantity,
        `produtos[${index}].quantidade`
      );
      const unitPriceCentavos = decimalMoneyToCents(
        product.unitValue == null ? product.valorUnitario : product.unitValue,
        `produtos[${index}].valorUnitario`
      );
      if (unitPriceCentavos == null || unitPriceCentavos <= 0) {
        throw new Error(`Produto ${index + 1} possui valor unitário inválido.`);
      }
      const totalCentavos = roundedCrediarioLineTotalCentavos(
        quantityMicrounits,
        unitPriceCentavos
      );

      let itemId = optionalText(product.crediarioItemId || product.id);
      let itemNumber = Number(product.itemNumber || 0);
      if (itemId) {
        const current = existingById.get(itemId);
        if (!current || !crediarioItemIsOpen(current)) {
          throw new Error('Item do crediário não está mais aberto para edição.');
        }
        if (
          current.produtoId &&
          String(current.produtoId) !== produtoId
        ) {
          throw new Error('Não é permitido trocar o produto de um item já existente.');
        }
        requestedExistingIds.add(itemId);
        itemNumber = Number(current.itemNumber || itemNumber || index + 1);
      } else {
        itemId = randomUUID();
        itemNumber = nextItemNumber;
        nextItemNumber += 1;
      }

      const sourcePayload =
        cachedProduct.payload &&
        typeof cachedProduct.payload === 'object' &&
        !Array.isArray(cachedProduct.payload)
          ? cachedProduct.payload
          : {};

      desiredOpen.push({
        crediarioItemId: itemId,
        id: itemId,
        itemNumber,
        produtoId,
        productFiscalId: produtoId,
        productCode: optionalText(
          product.productCode ||
          product.codigoProduto ||
          product.barcode ||
          cachedProduct.codigo ||
          cachedProduct.gtin
        ),
        description: optionalText(product.name || product.description) || cachedProduct.descricao,
        name: optionalText(product.name || product.description) || cachedProduct.descricao,
        ncm: optionalText(product.ncm || sourcePayload.ncm),
        cest: optionalText(product.cest || sourcePayload.cest),
        cfop: optionalText(product.cfop || sourcePayload.cfop),
        unit: optionalText(product.unit || product.unidade || cachedProduct.unidade) || 'UN',
        quantity: Number(quantityMicrounits) / STOCK_QUANTITY_SCALE,
        unitValue: unitPriceCentavos / 100,
        totalValue: totalCentavos / 100,
        total: totalCentavos / 100,
        taxCode: optionalText(product.taxCode),
        tributosReferenciaJson:
          product.tributosReferenciaJson == null
            ? (sourcePayload.tributosReferenciaJson || '')
            : product.tributosReferenciaJson,
        cancelled: false,
        cancelado: false,
        canceladoEm: null,
        pago: false,
        pagoEm: null,
        formaPagamento: '',
        fiscalSaleId: '',
        fiscalStatus: 'NAO_EMITIDA',
        liquidacaoId: '',
        sourceUpdatedAt: occurredAt
      });
    }

    if (!desiredOpen.length) {
      throw new Error(
        'O crediário precisa manter pelo menos um item ativo. Para encerrar a conta use o fluxo próprio de cancelamento.'
      );
    }

    const desiredById = new Map(
      desiredOpen.map((item) => [String(item.crediarioItemId), item])
    );
    const finalItems = [];

    for (const item of normalizedExisting) {
      const itemId = String(item.crediarioItemId || '');
      if (item.pago === true || item.cancelado === true || item.cancelled === true) {
        finalItems.push(item);
        continue;
      }
      const desired = itemId ? desiredById.get(itemId) : null;
      if (desired) {
        finalItems.push(desired);
      } else {
        finalItems.push({
          ...item,
          quantity: 0,
          totalValue: 0,
          total: 0,
          cancelled: true,
          cancelado: true,
          canceladoEm: occurredAt,
          sourceUpdatedAt: occurredAt
        });
      }
    }

    for (const desired of desiredOpen) {
      if (!existingById.has(String(desired.crediarioItemId))) {
        finalItems.push(desired);
      }
    }

    const originalByProduct = new Map();
    const desiredByProduct = new Map();
    for (const item of originalOpen) {
      const key = String(item.produtoId || '');
      const micros = decimalToMicrounits(item.quantity, 'quantidade atual');
      originalByProduct.set(key, (originalByProduct.get(key) || 0) + micros);
    }
    for (const item of desiredOpen) {
      const key = String(item.produtoId || '');
      const micros = decimalToMicrounits(item.quantity, 'quantidade desejada');
      desiredByProduct.set(key, (desiredByProduct.get(key) || 0) + micros);
    }

    const pendingDeltaMap = new Map(
      listPendingStockDeltasByProduct(empresaId)
        .map((item) => [String(item.produtoId), Number(item.deltaMicrounits || 0)])
    );
    const stockDeltas = [];
    const productIds = new Set([
      ...originalByProduct.keys(),
      ...desiredByProduct.keys()
    ]);

    for (const produtoId of productIds) {
      const beforeMicros = Number(originalByProduct.get(produtoId) || 0);
      const afterMicros = Number(desiredByProduct.get(produtoId) || 0);
      const diffMicros = afterMicros - beforeMicros;
      if (!diffMicros) continue;

      if (diffMicros > 0) {
        const cachedProduct = getProductCacheById(empresaId, produtoId);
        if (!cachedProduct) {
          throw new Error('Produto do crediário não existe no cache local.');
        }
        const productPayload =
          cachedProduct.payload && typeof cachedProduct.payload === 'object'
            ? cachedProduct.payload
            : {};
        const baseQuantity = Number(productPayload.quantidadeEstoque || 0);
        const baseMicros = Number.isFinite(baseQuantity)
          ? Math.round(Math.max(0, baseQuantity) * STOCK_QUANTITY_SCALE)
          : 0;
        const availableMicros = Math.max(
          0,
          baseMicros + Number(pendingDeltaMap.get(produtoId) || 0)
        );
        if (diffMicros > availableMicros) {
          throw new Error(
            `Estoque insuficiente para acrescentar ${cachedProduct.descricao || produtoId} ao crediário.`
          );
        }
      }

      stockDeltas.push({
        produtoId,
        diffMicros
      });
    }

    const baseSituacaoVersao = Number(row.situacao_versao || 0);
    const novaSituacaoVersao = baseSituacaoVersao + 1;
    const valorRecebidoCentavos = Number(row.valor_recebido_centavos || 0);
    const saldoReceberCentavos = desiredOpen.reduce(
      (sum, item) => sum + decimalMoneyToCents(item.totalValue, 'total do item'),
      0
    );
    const valorOriginalCentavos =
      valorRecebidoCentavos + saldoReceberCentavos;

    const dependencies = crediarioOutboxDependencies(
      db,
      empresaId,
      crediarioId
    );

    for (const delta of stockDeltas) {
      const direction = delta.diffMicros > 0 ? -1 : 1;
      const quantityMicrounits = Math.abs(delta.diffMicros);
      const stockOperationId =
        `${operationId}:stock:${delta.produtoId}`;
      const stockMovementId =
        `${operationId}:movement:${delta.produtoId}`;

      db.prepare(`
        INSERT INTO stock_movements (
          empresa_id, movement_id, operation_id, produto_id, direction,
          quantity_microunits, movement_type, source_id, occurred_at,
          created_at, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, 'CREDIARIO_AJUSTE_OFFLINE', ?, ?, ?, ?)
      `).run(
        empresaId,
        stockMovementId,
        stockOperationId,
        delta.produtoId,
        direction,
        quantityMicrounits,
        crediarioId,
        occurredAt,
        occurredAt,
        jsonText({
          crediarioId,
          operationId,
          deltaMicrounits: delta.diffMicros
        })
      );

      db.prepare(`
        INSERT INTO stock_projection (
          empresa_id, produto_id, quantity_microunits, updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(empresa_id, produto_id) DO UPDATE SET
          quantity_microunits =
            stock_projection.quantity_microunits + excluded.quantity_microunits,
          updated_at = excluded.updated_at
      `).run(
        empresaId,
        delta.produtoId,
        direction * quantityMicrounits,
        occurredAt
      );
    }

    const updatedPayload = {
      ...payload,
      valor: saldoReceberCentavos / 100,
      valorOriginal: valorOriginalCentavos / 100,
      valorRecebido: valorRecebidoCentavos / 100,
      saldoReceber: saldoReceberCentavos / 100,
      situacaoVersao: novaSituacaoVersao,
      itens: finalItems
    };

    db.prepare(`
      UPDATE crediarios_cache
         SET valor_centavos = ?,
             valor_original_centavos = ?,
             saldo_receber_centavos = ?,
             situacao_versao = ?,
             cached_at = ?,
             payload_json = ?
       WHERE empresa_id = ?
         AND crediario_id = ?
         AND pago = 0
         AND cancelado = 0
    `).run(
      saldoReceberCentavos,
      valorOriginalCentavos,
      saldoReceberCentavos,
      novaSituacaoVersao,
      occurredAt,
      jsonText(updatedPayload),
      empresaId,
      crediarioId
    );

    const outboxPayload = {
      crediarioId,
      contaReceberId: String(row.conta_receber_id),
      baseSituacaoVersao,
      novaSituacaoVersao,
      valor: saldoReceberCentavos / 100,
      valorOriginal: valorOriginalCentavos / 100,
      valorRecebido: valorRecebidoCentavos / 100,
      saldoReceber: saldoReceberCentavos / 100,
      occurredAt,
      itens: desiredOpen,
      stockDeltas: stockDeltas.map((delta) => ({
        produtoId: delta.produtoId,
        quantidadeDelta:
          Number(delta.diffMicros) / STOCK_QUANTITY_SCALE
      }))
    };

    db.prepare(`
      INSERT INTO sync_outbox (
        empresa_id, operation_id, type, entity_id, payload_json, status,
        attempts, dependencies_json, created_at, updated_at, last_error
      ) VALUES (?, ?, 'CREDIARIO_ITEMS_UPDATE', ?, ?, 'PENDING', 0, ?, ?, ?, NULL)
    `).run(
      empresaId,
      operationId,
      crediarioId,
      jsonText(outboxPayload),
      JSON.stringify(dependencies),
      occurredAt,
      occurredAt
    );

    db.exec('COMMIT;');

    return {
      applied: true,
      duplicate: false,
      operation: getOutboxOperation(empresaId, operationId),
      detalhe: getCrediarioDetailCache({ empresaId, crediarioId })
    };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

function upsertSupplierCache(input) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input && input.empresaId, 'empresaId');
  const fornecedorId = requiredText(input && input.fornecedorId, 'fornecedorId');
  const nome = requiredText(input && input.nome, 'nome');
  const cachedAt = nowIso();

  db.prepare(`
    INSERT INTO suppliers_cache (
      empresa_id, fornecedor_id, nome, documento, telefone, email,
      ativo, revision, source_updated_at, cached_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(empresa_id, fornecedor_id) DO UPDATE SET
      nome = excluded.nome,
      documento = excluded.documento,
      telefone = excluded.telefone,
      email = excluded.email,
      ativo = excluded.ativo,
      revision = excluded.revision,
      source_updated_at = excluded.source_updated_at,
      cached_at = excluded.cached_at,
      payload_json = excluded.payload_json
  `).run(
    empresaId,
    fornecedorId,
    nome,
    optionalText(input.documento),
    optionalText(input.telefone),
    optionalText(input.email),
    booleanInt(input.ativo, true),
    optionalText(input.revision),
    optionalText(input.sourceUpdatedAt),
    cachedAt,
    jsonText(input.payload)
  );

  return db.prepare(`
    SELECT empresa_id, fornecedor_id, nome, documento, telefone, email,
           ativo, revision, source_updated_at, cached_at, payload_json
      FROM suppliers_cache
     WHERE empresa_id = ? AND fornecedor_id = ?
  `).get(empresaId, fornecedorId);
}

function normalizeFiscalEnvironment(value) {
  const text = String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  if (['1', 'PRODUCAO', 'PROD'].includes(text)) return 'PRODUCAO';
  if (['2', 'HOMOLOGACAO', 'HOMOLOG', 'HOM'].includes(text)) return 'HOMOLOGACAO';
  return '';
}

function mapFiscalProfileCacheRow(row) {
  if (!row) return null;
  return {
    empresaId: String(row.empresa_id),
    cnpj: String(row.cnpj),
    inscricaoEstadual: String(row.inscricao_estadual),
    razaoSocial: String(row.razao_social),
    nomeFantasia: row.nome_fantasia == null ? null : String(row.nome_fantasia),
    cep: row.cep == null ? null : String(row.cep),
    logradouro: String(row.logradouro),
    numero: String(row.numero),
    complemento: row.complemento == null ? null : String(row.complemento),
    bairro: String(row.bairro),
    municipio: String(row.municipio),
    codigoMunicipio: String(row.codigo_municipio),
    uf: String(row.uf),
    serieNfce: String(row.serie_nfce),
    ambiente: String(row.ambiente),
    crt: String(row.crt),
    regimeTributario: row.regime_tributario == null ? null : String(row.regime_tributario),
    urlQrCode: String(row.url_qr_code),
    urlConsultaChave: String(row.url_consulta_chave),
    revision: String(row.revision),
    sourceUpdatedAt: row.source_updated_at == null ? null : String(row.source_updated_at),
    cachedAt: String(row.cached_at),
    payload: parseJsonText(row.payload_json)
  };
}

function upsertFiscalProfileCache(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const ambiente = normalizeFiscalEnvironment(input.ambiente);
  if (!ambiente) {
    throw new Error('ambiente fiscal inválido para o cache offline.');
  }

  const schemaVersion = Number(input.schemaVersion == null ? 1 : input.schemaVersion);
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1) {
    throw new Error('schemaVersion fiscal inválido para o cache offline.');
  }

  const cachedAt = nowIso();
  const payloadBase =
    input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
      ? input.payload
      : {};

  db.prepare(`
    INSERT INTO fiscal_profile_cache (
      empresa_id, cnpj, inscricao_estadual, razao_social, nome_fantasia,
      cep, logradouro, numero, complemento, bairro, municipio,
      codigo_municipio, uf, serie_nfce, ambiente, crt, regime_tributario,
      url_qr_code, url_consulta_chave, revision, source_updated_at,
      cached_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(empresa_id) DO UPDATE SET
      cnpj = excluded.cnpj,
      inscricao_estadual = excluded.inscricao_estadual,
      razao_social = excluded.razao_social,
      nome_fantasia = excluded.nome_fantasia,
      cep = excluded.cep,
      logradouro = excluded.logradouro,
      numero = excluded.numero,
      complemento = excluded.complemento,
      bairro = excluded.bairro,
      municipio = excluded.municipio,
      codigo_municipio = excluded.codigo_municipio,
      uf = excluded.uf,
      serie_nfce = excluded.serie_nfce,
      ambiente = excluded.ambiente,
      crt = excluded.crt,
      regime_tributario = excluded.regime_tributario,
      url_qr_code = excluded.url_qr_code,
      url_consulta_chave = excluded.url_consulta_chave,
      revision = excluded.revision,
      source_updated_at = excluded.source_updated_at,
      cached_at = excluded.cached_at,
      payload_json = excluded.payload_json
  `).run(
    empresaId,
    requiredText(input.cnpj, 'cnpj'),
    requiredText(input.inscricaoEstadual, 'inscricaoEstadual'),
    requiredText(input.razaoSocial, 'razaoSocial'),
    optionalText(input.nomeFantasia),
    optionalText(input.cep),
    requiredText(input.logradouro, 'logradouro'),
    requiredText(input.numero, 'numero'),
    optionalText(input.complemento),
    requiredText(input.bairro, 'bairro'),
    requiredText(input.municipio, 'municipio'),
    requiredText(input.codigoMunicipio, 'codigoMunicipio'),
    requiredText(input.uf, 'uf').toUpperCase(),
    requiredText(input.serieNfce, 'serieNfce'),
    ambiente,
    requiredText(input.crt, 'crt'),
    optionalText(input.regimeTributario),
    requiredText(input.urlQrCode, 'urlQrCode'),
    requiredText(input.urlConsultaChave, 'urlConsultaChave'),
    requiredText(input.revision, 'revision'),
    optionalText(input.sourceUpdatedAt),
    cachedAt,
    jsonText({ ...payloadBase, schemaVersion })
  );

  return getFiscalProfileCache(empresaId);
}

function getFiscalProfileCache(empresaIdValue) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const row = db.prepare(`
    SELECT empresa_id, cnpj, inscricao_estadual, razao_social, nome_fantasia,
           cep, logradouro, numero, complemento, bairro, municipio,
           codigo_municipio, uf, serie_nfce, ambiente, crt, regime_tributario,
           url_qr_code, url_consulta_chave, revision, source_updated_at,
           cached_at, payload_json
      FROM fiscal_profile_cache
     WHERE empresa_id = ?
     LIMIT 1
  `).get(empresaId);
  return mapFiscalProfileCacheRow(row);
}

function mapFiscalNumberLeaseRow(row) {
  if (!row) return null;
  return {
    empresaId: String(row.empresa_id),
    leaseId: String(row.lease_id),
    requestId: String(row.request_id),
    deviceId: String(row.device_id),
    ambiente: String(row.ambiente),
    modelo: Number(row.modelo),
    serie: String(row.serie),
    numeroInicial: Number(row.numero_inicial),
    numeroFinal: Number(row.numero_final),
    proximoNumero: Number(row.proximo_numero),
    status: String(row.status),
    reservadoEm: String(row.reservado_em),
    expiraEm: row.expira_em == null ? null : String(row.expira_em),
    updatedAt: String(row.updated_at),
    payload: parseJsonText(row.payload_json)
  };
}

function validateFiscalNumberLeaseInput(input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const leaseId = requiredText(input.leaseId, 'leaseId');
  const requestId = requiredText(input.requestId, 'requestId');
  const deviceId = requiredText(input.deviceId, 'deviceId');
  const ambiente = normalizeFiscalEnvironment(input.ambiente);
  if (!ambiente) {
    throw new Error('Ambiente fiscal inválido para o lease local.');
  }
  const modelo = Number(input.modelo);
  if (modelo !== 65) throw new Error('modelo do lease fiscal deve ser 65.');
  const serie = requiredText(input.serie, 'serie');
  const numeroInicial = Number(input.numeroInicial);
  const numeroFinal = Number(input.numeroFinal);
  if (!Number.isSafeInteger(numeroInicial) || numeroInicial < 1) {
    throw new Error('numeroInicial do lease fiscal inválido.');
  }
  if (!Number.isSafeInteger(numeroFinal) || numeroFinal < numeroInicial) {
    throw new Error('numeroFinal do lease fiscal inválido.');
  }
  const proximoNumero = input.proximoNumero == null
    ? numeroInicial
    : Number(input.proximoNumero);
  if (
    !Number.isSafeInteger(proximoNumero) ||
    proximoNumero < numeroInicial ||
    proximoNumero > numeroFinal + 1
  ) {
    throw new Error('proximoNumero do lease fiscal inválido.');
  }
  const status = String(input.status || 'ACTIVE').trim().toUpperCase();
  if (!['ACTIVE', 'EXHAUSTED', 'EXPIRED', 'REVOKED'].includes(status)) {
    throw new Error('status do lease fiscal inválido.');
  }
  return {
    empresaId,
    leaseId,
    requestId,
    deviceId,
    ambiente,
    modelo,
    serie,
    numeroInicial,
    numeroFinal,
    proximoNumero,
    status,
    reservadoEm: requiredText(input.reservadoEm, 'reservadoEm'),
    expiraEm: optionalText(input.expiraEm),
    payload: input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
      ? input.payload
      : {}
  };
}

function assertSameFiscalLease(existing, incoming) {
  const same =
    String(existing.lease_id) === incoming.leaseId &&
    String(existing.request_id) === incoming.requestId &&
    String(existing.device_id) === incoming.deviceId &&
    String(existing.ambiente) === incoming.ambiente &&
    Number(existing.modelo) === incoming.modelo &&
    String(existing.serie) === incoming.serie &&
    Number(existing.numero_inicial) === incoming.numeroInicial &&
    Number(existing.numero_final) === incoming.numeroFinal;
  if (!same) {
    throw new Error('Lease fiscal existente diverge da reserva recebida; revisão manual necessária.');
  }
}

function upsertFiscalNumberLease(input = {}) {
  const db = getOfflineDatabase();
  const lease = validateFiscalNumberLeaseInput(input);

  const existingByRequest = db.prepare(`
    SELECT * FROM fiscal_number_leases
     WHERE empresa_id = ? AND request_id = ?
     LIMIT 1
  `).get(lease.empresaId, lease.requestId);
  if (existingByRequest) {
    assertSameFiscalLease(existingByRequest, lease);
    return mapFiscalNumberLeaseRow(existingByRequest);
  }

  const existingByLease = db.prepare(`
    SELECT * FROM fiscal_number_leases
     WHERE empresa_id = ? AND lease_id = ?
     LIMIT 1
  `).get(lease.empresaId, lease.leaseId);
  if (existingByLease) {
    assertSameFiscalLease(existingByLease, lease);
    return mapFiscalNumberLeaseRow(existingByLease);
  }

  const namespaceConflict = db.prepare(`
    SELECT lease_id
      FROM fiscal_number_leases
     WHERE empresa_id = ?
       AND ambiente = ?
       AND modelo = ?
       AND serie = ?
       AND NOT (numero_final < ? OR numero_inicial > ?)
     LIMIT 1
  `).get(
    lease.empresaId,
    lease.ambiente,
    lease.modelo,
    lease.serie,
    lease.numeroInicial,
    lease.numeroFinal
  );
  if (namespaceConflict) {
    throw new Error('Faixa fiscal recebida sobrepõe um lease local já existente.');
  }

  const updatedAt = nowIso();
  db.prepare(`
    INSERT INTO fiscal_number_leases (
      empresa_id, lease_id, request_id, device_id, ambiente, modelo, serie,
      numero_inicial, numero_final, proximo_numero, status,
      reservado_em, expira_em, updated_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    lease.empresaId,
    lease.leaseId,
    lease.requestId,
    lease.deviceId,
    lease.ambiente,
    lease.modelo,
    lease.serie,
    lease.numeroInicial,
    lease.numeroFinal,
    lease.proximoNumero,
    lease.status,
    lease.reservadoEm,
    lease.expiraEm,
    updatedAt,
    jsonText(lease.payload)
  );

  return getFiscalNumberLeaseById(lease.empresaId, lease.leaseId);
}

function getFiscalNumberLeaseById(empresaIdValue, leaseIdValue) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const leaseId = requiredText(leaseIdValue, 'leaseId');
  const row = db.prepare(`
    SELECT * FROM fiscal_number_leases
     WHERE empresa_id = ? AND lease_id = ?
     LIMIT 1
  `).get(empresaId, leaseId);
  return mapFiscalNumberLeaseRow(row);
}

function getFiscalNumberLeaseByRequestId(empresaIdValue, requestIdValue) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const requestId = requiredText(requestIdValue, 'requestId');
  const row = db.prepare(`
    SELECT * FROM fiscal_number_leases
     WHERE empresa_id = ? AND request_id = ?
     LIMIT 1
  `).get(empresaId, requestId);
  return mapFiscalNumberLeaseRow(row);
}

function selectFiscalCounterLeaseRow(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const deviceId = requiredText(input.deviceId, 'deviceId');
  const ambiente = normalizeFiscalEnvironment(input.ambiente || 'PRODUCAO');
  if (!ambiente) {
    throw new Error('Ambiente fiscal inválido para seleção do contador local.');
  }
  const modelo = Number(input.modelo == null ? 65 : input.modelo);
  if (modelo !== 65) {
    throw new Error('modelo do contador local deve ser 65.');
  }
  const serie = requiredText(input.serie, 'serie');
  const nowMs = input.now
    ? Date.parse(String(input.now))
    : Date.now();
  if (!Number.isFinite(nowMs)) {
    throw new Error('now inválido para seleção do contador local.');
  }

  const rows = db.prepare(`
    SELECT *
      FROM fiscal_number_leases
     WHERE empresa_id = ?
       AND device_id = ?
       AND ambiente = ?
       AND modelo = ?
       AND serie = ?
     ORDER BY numero_inicial ASC, reservado_em ASC, lease_id ASC
  `).all(
    empresaId,
    deviceId,
    ambiente,
    modelo,
    serie
  );

  const active = rows.find((row) => {
    if (String(row.status) !== 'ACTIVE') return false;
    if (Number(row.proximo_numero) > Number(row.numero_final)) return false;
    if (!row.expira_em) return true;
    const expiresAt = Date.parse(String(row.expira_em));
    return Number.isNaN(expiresAt) || expiresAt > nowMs;
  });

  return active || rows[0] || null;
}

function getActiveFiscalNumberLease(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const deviceId = requiredText(input.deviceId, 'deviceId');
  const ambiente = normalizeFiscalEnvironment(input.ambiente || 'PRODUCAO');
  if (!ambiente) {
    throw new Error('Ambiente fiscal inválido para seleção do lease ativo.');
  }
  const modelo = Number(input.modelo == null ? 65 : input.modelo);
  if (modelo !== 65) throw new Error('modelo do lease fiscal ativo deve ser 65.');
  const serie = requiredText(input.serie, 'serie');
  const nowMs = input.now ? Date.parse(String(input.now)) : Date.now();
  if (!Number.isFinite(nowMs)) throw new Error('now inválido para seleção do lease fiscal.');

  const rows = db.prepare(`
    SELECT * FROM fiscal_number_leases
     WHERE empresa_id = ?
       AND device_id = ?
       AND ambiente = ?
       AND modelo = ?
       AND serie = ?
       AND status = 'ACTIVE'
       AND proximo_numero <= numero_final
     ORDER BY numero_inicial ASC, reservado_em ASC, lease_id ASC
  `).all(empresaId, deviceId, ambiente, modelo, serie);

  for (const row of rows) {
    if (row.expira_em) {
      const expiresAt = Date.parse(String(row.expira_em));
      if (!Number.isNaN(expiresAt) && expiresAt <= nowMs) continue;
    }
    return mapFiscalNumberLeaseRow(row);
  }
  return null;
}

function getFiscalNumberLeaseInventory(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const deviceId = requiredText(input.deviceId, 'deviceId');
  const ambiente = normalizeFiscalEnvironment(input.ambiente || 'PRODUCAO');
  if (!ambiente) {
    throw new Error('Ambiente fiscal inválido para inventário de lease.');
  }
  const modelo = Number(input.modelo == null ? 65 : input.modelo);
  if (modelo !== 65) throw new Error('modelo do inventário fiscal deve ser 65.');
  const serie = requiredText(input.serie, 'serie');
  const nowMs = input.now ? Date.parse(String(input.now)) : Date.now();
  if (!Number.isFinite(nowMs)) throw new Error('now inválido para inventário fiscal.');

  const rows = db.prepare(`
    SELECT status, numero_inicial, numero_final, proximo_numero, expira_em
      FROM fiscal_number_leases
     WHERE empresa_id = ?
       AND device_id = ?
       AND ambiente = ?
       AND modelo = ?
       AND serie = ?
  `).all(empresaId, deviceId, ambiente, modelo, serie);

  let activeLeases = 0;
  let remainingNumbers = 0;
  let expiredLeases = 0;
  let exhaustedLeases = 0;
  for (const row of rows) {
    const status = String(row.status || '').toUpperCase();
    if (status !== 'ACTIVE') {
      if (status === 'EXHAUSTED') exhaustedLeases += 1;
      continue;
    }
    if (row.expira_em) {
      const expiresAt = Date.parse(String(row.expira_em));
      if (!Number.isNaN(expiresAt) && expiresAt <= nowMs) {
        expiredLeases += 1;
        continue;
      }
    }
    const next = Number(row.proximo_numero);
    const end = Number(row.numero_final);
    const remaining = Number.isSafeInteger(next) && Number.isSafeInteger(end) && next <= end
      ? end - next + 1
      : 0;
    if (remaining > 0) {
      activeLeases += 1;
      remainingNumbers += remaining;
    }
  }
  if (!Number.isSafeInteger(remainingNumbers)) {
    throw new Error('Inventário fiscal excedeu o limite inteiro seguro.');
  }
  return {
    activeLeases,
    remainingNumbers,
    expiredLeases,
    exhaustedLeases,
    totalLeases: rows.length
  };
}

function peekNextNfceNumber(input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const deviceId = requiredText(input.deviceId, 'deviceId');
  const ambiente = normalizeFiscalEnvironment(
    input.ambiente || 'PRODUCAO'
  );
  if (!ambiente) {
    throw new Error(
      'Ambiente fiscal inválido para o contador único do caixa.'
    );
  }

  const modelo =
    Number(input.modelo == null ? 65 : input.modelo);
  if (modelo !== 65) {
    throw new Error(
      'modelo do contador único deve ser 65.'
    );
  }

  const serie = requiredText(
    input.serie,
    'serie'
  );

  const lease = getActiveFiscalNumberLease({
    empresaId,
    deviceId,
    ambiente,
    modelo,
    serie,
    now: input.now
  });

  if (!lease) {
    throw new Error(
      'Contador fiscal único do caixa não está disponível.'
    );
  }

  return {
    ownerMode: 'SINGLE_CASHIER',
    ambiente,
    modelo,
    serie: String(lease.serie),
    proximoNumero: Number(lease.proximoNumero),
    counterId: String(lease.leaseId),
    status: String(lease.status)
  };
}

function reconcileLocalNfceCounter(input = {}) {
  const db = getOfflineDatabase();
  const empresaId =
    requiredText(input.empresaId, 'empresaId');
  const deviceId =
    requiredText(input.deviceId, 'deviceId');
  const ambiente = normalizeFiscalEnvironment(
    input.ambiente || 'PRODUCAO'
  );
  const modelo =
    Number(input.modelo == null ? 65 : input.modelo);
  const serie =
    requiredText(input.serie, 'serie');
  const remoteNext =
    Number(input.proximoNumero);

  if (!ambiente) {
    throw new Error(
      'Ambiente fiscal inválido para sincronização do contador único.'
    );
  }
  if (modelo !== 65) {
    throw new Error(
      'modelo do contador único deve ser 65.'
    );
  }
  if (
    !Number.isSafeInteger(remoteNext) ||
    remoteNext < 1
  ) {
    throw new Error(
      'Próximo número fiscal remoto é inválido.'
    );
  }

  const updatedAt = nowIso();

  db.exec('BEGIN IMMEDIATE;');
  try {
    const row = selectFiscalCounterLeaseRow(db, {
      empresaId,
      deviceId,
      ambiente,
      modelo,
      serie,
      now: input.now
    });

    if (!row) {
      const namespaceSource = [
        empresaId,
        deviceId,
        ambiente,
        String(modelo),
        serie
      ].join('|');
      const namespaceHash = createHash('sha256')
        .update(namespaceSource, 'utf8')
        .digest('hex')
        .slice(0, 32);
      const initialized = upsertFiscalNumberLease({
        empresaId,
        leaseId: `single-cashier-${namespaceHash}`,
        requestId: `single-cashier-init-${namespaceHash}`,
        deviceId,
        ambiente,
        modelo,
        serie,
        numeroInicial: remoteNext,
        numeroFinal: 999999999,
        proximoNumero: remoteNext,
        status: 'ACTIVE',
        reservadoEm: updatedAt,
        expiraEm: null,
        payload: {
          source: 'SYNC_REFERENCE_COUNTER_INIT',
          ownerMode: 'SINGLE_CASHIER'
        }
      });

      db.exec('COMMIT;');
      return {
        ownerMode: 'SINGLE_CASHIER',
        empresaId,
        deviceId,
        ambiente,
        modelo,
        serie,
        previousNext: null,
        remoteNext,
        proximoNumero: Number(initialized.proximoNumero),
        advanced: false,
        initialized: true
      };
    }

    const currentNext =
      Number(row.proximo_numero);
    const numeroFinal =
      Number(row.numero_final);

    if (
      !Number.isSafeInteger(currentNext) ||
      currentNext < 1 ||
      !Number.isSafeInteger(numeroFinal) ||
      numeroFinal < 1
    ) {
      throw new Error(
        'Contador fiscal local está inválido.'
      );
    }

    /*
     * Enquanto ONLINE, servidor e desktop convergem sempre para o
     * maior próximo número conhecido. Isso impede regressão depois
     * de uma venda OFFLINE ainda não refletida no servidor.
     */
    const mergedNext =
      Math.max(currentNext, remoteNext);

    if (mergedNext > numeroFinal + 1) {
      throw new Error(
        'Próximo número fiscal excede o limite do contador local.'
      );
    }

    const status =
      mergedNext > numeroFinal
        ? 'EXHAUSTED'
        : 'ACTIVE';

    db.prepare(`
      UPDATE fiscal_number_leases
         SET proximo_numero = ?,
             status = ?,
             updated_at = ?
       WHERE empresa_id = ?
         AND lease_id = ?
    `).run(
      mergedNext,
      status,
      updatedAt,
      empresaId,
      String(row.lease_id)
    );

    db.exec('COMMIT;');

    return {
      ownerMode: 'SINGLE_CASHIER',
      empresaId,
      deviceId,
      ambiente,
      modelo,
      serie,
      previousNext: currentNext,
      remoteNext,
      proximoNumero: mergedNext,
      advanced:
        mergedNext > currentNext
    };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}


function consumeNextNfceNumber(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const deviceId = requiredText(input.deviceId, 'deviceId');
  const ambiente = normalizeFiscalEnvironment(
    input.ambiente || 'PRODUCAO'
  );
  const modelo = Number(input.modelo == null ? 65 : input.modelo);
  const serie = requiredText(input.serie, 'serie');
  const numero = Number(input.numero);
  const updatedAt = nowIso();

  if (!ambiente) {
    throw new Error(
      'Ambiente fiscal inválido para consumo do contador único.'
    );
  }
  if (modelo !== 65) {
    throw new Error('modelo do contador único deve ser 65.');
  }
  if (!Number.isSafeInteger(numero) || numero < 1) {
    throw new Error('numero NFC-e inválido para avançar o contador.');
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    const row = selectFiscalCounterLeaseRow(db, {
      empresaId,
      deviceId,
      ambiente,
      modelo,
      serie,
      now: input.now
    });

    if (!row) {
      throw new Error(
        'Contador fiscal local do caixa não foi encontrado.'
      );
    }

    const currentNext = Number(row.proximo_numero);
    const numeroFinal = Number(row.numero_final);

    if (
      !Number.isSafeInteger(currentNext) ||
      currentNext < 1 ||
      !Number.isSafeInteger(numeroFinal) ||
      numeroFinal < 1
    ) {
      throw new Error('Contador fiscal local está inválido.');
    }

    if (currentNext > numero) {
      db.exec('COMMIT;');
      return {
        duplicate: true,
        ownerMode: 'SINGLE_CASHIER',
        numero,
        proximoNumero: currentNext
      };
    }

    if (currentNext !== numero) {
      throw new Error(
        `Sequência fiscal divergente: próximo local ${currentNext}, documento concluído ${numero}.`
      );
    }

    const nextNumber = numero + 1;
    const nextStatus =
      nextNumber > numeroFinal
        ? 'EXHAUSTED'
        : 'ACTIVE';

    const changed = db.prepare(`
      UPDATE fiscal_number_leases
         SET proximo_numero = ?,
             status = ?,
             updated_at = ?
       WHERE empresa_id = ?
         AND lease_id = ?
         AND proximo_numero = ?
    `).run(
      nextNumber,
      nextStatus,
      updatedAt,
      empresaId,
      String(row.lease_id),
      numero
    );

    if (Number(changed.changes || 0) !== 1) {
      throw new Error(
        'Contador fiscal mudou durante o avanço da sequência.'
      );
    }

    db.exec('COMMIT;');
    return {
      duplicate: false,
      ownerMode: 'SINGLE_CASHIER',
      numero,
      proximoNumero: nextNumber
    };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

function upsertReferenceBatch(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const products = Array.isArray(input.products) ? input.products : [];
  const customers = Array.isArray(input.customers) ? input.customers : [];
  const suppliers = Array.isArray(input.suppliers) ? input.suppliers : [];
  const crediarios = Array.isArray(input.crediarios) ? input.crediarios : [];
  const crediariosSnapshotToken = input.crediariosSnapshotToken == null
    ? null
    : requiredText(input.crediariosSnapshotToken, 'crediariosSnapshotToken');
  if (crediarios.length > 0 && !crediariosSnapshotToken) {
    throw new Error('crediariosSnapshotToken é obrigatório quando houver crediários.');
  }

  let fiscalProfile = null;
  if (input.fiscalProfile != null) {
    if (typeof input.fiscalProfile !== 'object' || Array.isArray(input.fiscalProfile)) {
      throw new Error('fiscalProfile deve ser um objeto quando informado.');
    }
    fiscalProfile = input.fiscalProfile;
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    for (const item of products) {
      upsertProductCache({ ...item, empresaId });
    }
    for (const item of customers) {
      upsertCustomerCache({ ...item, empresaId });
    }
    for (const item of suppliers) {
      upsertSupplierCache({ ...item, empresaId });
    }
    for (const item of crediarios) {
      upsertCrediarioCache({
        ...item,
        empresaId,
        snapshotToken: crediariosSnapshotToken
      });
    }
    if (fiscalProfile) {
      upsertFiscalProfileCache({ ...fiscalProfile, empresaId });
    }
    db.exec('COMMIT;');
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }

  return {
    empresaId,
    products: products.length,
    customers: customers.length,
    suppliers: suppliers.length,
    crediarios: crediarios.length,
    fiscalProfile: Boolean(fiscalProfile)
  };
}

function mapPreparedOfflineCompanyRow(row) {
  if (!row) return null;

  return {
    empresaId:
      String(row.empresa_id),
    razaoSocial:
      String(row.razao_social),
    cnpj:
      String(row.cnpj),
    ambiente:
      String(row.ambiente),
    preparedAt:
      String(row.prepared_at),
    lastPreparedAt:
      String(row.last_prepared_at)
  };
}

function upsertPreparedOfflineCompany(input = {}) {
  const db = getOfflineDatabase();
  const empresaId =
    requiredText(
      input.empresaId,
      'empresaId'
    );
  const razaoSocial =
    requiredText(
      input.razaoSocial,
      'razaoSocial'
    );
  const cnpj =
    requiredText(
      input.cnpj,
      'cnpj'
    );
  const ambiente =
    requiredText(
      input.ambiente,
      'ambiente'
    )
      .toUpperCase();

  const preparedAt =
    optionalText(
      input.preparedAt
    ) ||
    nowIso();

  db.prepare(`
    INSERT INTO offline_prepared_companies (
      empresa_id,
      razao_social,
      cnpj,
      ambiente,
      prepared_at,
      last_prepared_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(empresa_id) DO UPDATE SET
      razao_social = excluded.razao_social,
      cnpj = excluded.cnpj,
      ambiente = excluded.ambiente,
      last_prepared_at = excluded.last_prepared_at
  `).run(
    empresaId,
    razaoSocial,
    cnpj,
    ambiente,
    preparedAt,
    preparedAt
  );

  return getPreparedOfflineCompany(
    empresaId
  );
}

function getPreparedOfflineCompany(empresaIdValue) {
  const db = getOfflineDatabase();
  const empresaId =
    requiredText(
      empresaIdValue,
      'empresaId'
    );

  const row = db.prepare(`
    SELECT
      empresa_id,
      razao_social,
      cnpj,
      ambiente,
      prepared_at,
      last_prepared_at
    FROM offline_prepared_companies
    WHERE empresa_id = ?
    LIMIT 1
  `).get(empresaId);

  return mapPreparedOfflineCompanyRow(
    row
  );
}

function listPreparedOfflineCompanies() {
  const db = getOfflineDatabase();

  return db.prepare(`
    SELECT
      empresa_id,
      razao_social,
      cnpj,
      ambiente,
      prepared_at,
      last_prepared_at
    FROM offline_prepared_companies
    ORDER BY
      razao_social COLLATE NOCASE,
      empresa_id
  `)
    .all()
    .map(
      mapPreparedOfflineCompanyRow
    );
}

function parseJsonText(value) {
  if (value == null || value === '') return null;
  try { return JSON.parse(String(value)); } catch (_) { return null; }
}

function normalizeLimit(value, defaultValue = 50, maxValue = 200) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return defaultValue;
  return Math.min(Math.trunc(number), maxValue);
}

function escapeLike(value) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/[\\%_]/g, (char) => `\\${char}`);
}

function listActiveOfflineOperatorCredentials(empresaIdValue) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(
    empresaIdValue,
    'empresaId'
  );

  const rows = db.prepare(`
    SELECT
      empresa_id,
      operador_id,
      nome,
      perfil,
      acesso_total,
      ativo,
      credential_kdf,
      credential_salt,
      credential_verifier,
      credential_params_json,
      credential_revision,
      source_updated_at,
      cached_at
    FROM offline_operator_credentials
    WHERE empresa_id = ?
      AND ativo = 1
    ORDER BY operador_id
  `).all(empresaId);

  return rows.map((row) => ({
    empresaId:
      String(row.empresa_id),
    operadorId:
      String(row.operador_id),
    nome:
      String(row.nome),
    perfil:
      String(row.perfil),
    acessoTotal:
      Number(row.acesso_total) === 1,
    ativo:
      Number(row.ativo) === 1,
    credentialKdf:
      String(row.credential_kdf),
    credentialSalt:
      String(row.credential_salt),
    credentialVerifier:
      String(row.credential_verifier),
    credentialParams:
      parseJsonText(
        row.credential_params_json
      ) || {},
    credentialRevision:
      row.credential_revision == null
        ? null
        : String(row.credential_revision),
    sourceUpdatedAt:
      row.source_updated_at == null
        ? null
        : String(row.source_updated_at),
    cachedAt:
      String(row.cached_at)
  }));
}

function mapProductCacheRow(row) {
  if (!row) return null;
  return {
    empresaId: String(row.empresa_id),
    produtoId: String(row.produto_id),
    codigo: row.codigo == null ? null : String(row.codigo),
    gtin: row.gtin == null ? null : String(row.gtin),
    descricao: String(row.descricao),
    unidade: row.unidade == null ? null : String(row.unidade),
    precoCentavos: row.preco_centavos == null ? null : Number(row.preco_centavos),
    ativo: Number(row.ativo) === 1,
    revision: row.revision == null ? null : String(row.revision),
    sourceUpdatedAt: row.source_updated_at == null ? null : String(row.source_updated_at),
    cachedAt: String(row.cached_at),
    payload: parseJsonText(row.payload_json)
  };
}

function mapPartyCacheRow(row, idField, outputIdField) {
  if (!row) return null;
  return {
    empresaId: String(row.empresa_id),
    [outputIdField]: String(row[idField]),
    nome: String(row.nome),
    documento: row.documento == null ? null : String(row.documento),
    telefone: row.telefone == null ? null : String(row.telefone),
    email: row.email == null ? null : String(row.email),
    ativo: Number(row.ativo) === 1,
    revision: row.revision == null ? null : String(row.revision),
    sourceUpdatedAt: row.source_updated_at == null ? null : String(row.source_updated_at),
    cachedAt: String(row.cached_at),
    payload: parseJsonText(row.payload_json)
  };
}

function getProductCacheById(empresaIdValue, produtoIdValue) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const produtoId = requiredText(produtoIdValue, 'produtoId');
  const row = db.prepare(`
    SELECT empresa_id, produto_id, codigo, gtin, descricao, unidade,
           preco_centavos, ativo, revision, source_updated_at, cached_at, payload_json
      FROM products_cache
     WHERE empresa_id = ? AND produto_id = ?
  `).get(empresaId, produtoId);
  return mapProductCacheRow(row);
}

function findProductCacheByCodeOrGtin(empresaIdValue, value) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const needle = requiredText(value, 'codigoOuGtin');
  const row = db.prepare(`
    SELECT empresa_id, produto_id, codigo, gtin, descricao, unidade,
           preco_centavos, ativo, revision, source_updated_at, cached_at, payload_json
      FROM products_cache
     WHERE empresa_id = ?
       AND ativo = 1
       AND (codigo = ? OR gtin = ?)
     ORDER BY CASE WHEN codigo = ? THEN 0 ELSE 1 END, produto_id
     LIMIT 1
  `).get(empresaId, needle, needle, needle);
  return mapProductCacheRow(row);
}

function searchProductsCache(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const term = escapeLike(input.term);
  const limit = normalizeLimit(input.limit, 50, 5000);
  const onlyActive = input.onlyActive !== false;
  const like = `%${term}%`;
  const rows = db.prepare(`
    SELECT empresa_id, produto_id, codigo, gtin, descricao, unidade,
           preco_centavos, ativo, revision, source_updated_at, cached_at, payload_json
      FROM products_cache
     WHERE empresa_id = ?
       AND (? = 0 OR ativo = 1)
       AND (? = '' OR descricao LIKE ? ESCAPE '\\' COLLATE NOCASE
                    OR COALESCE(codigo, '') LIKE ? ESCAPE '\\' COLLATE NOCASE
                    OR COALESCE(gtin, '') LIKE ? ESCAPE '\\' COLLATE NOCASE)
     ORDER BY ativo DESC, descricao COLLATE NOCASE, produto_id
     LIMIT ?
  `).all(empresaId, onlyActive ? 1 : 0, term, like, like, like, limit);
  return rows.map(mapProductCacheRow);
}

function getCustomerCacheById(empresaIdValue, clienteIdValue) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const clienteId = requiredText(clienteIdValue, 'clienteId');
  const row = db.prepare(`
    SELECT empresa_id, cliente_id, nome, documento, telefone, email,
           ativo, revision, source_updated_at, cached_at, payload_json
      FROM customers_cache
     WHERE empresa_id = ? AND cliente_id = ?
  `).get(empresaId, clienteId);
  return mapPartyCacheRow(row, 'cliente_id', 'clienteId');
}

function searchCustomersCache(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const term = escapeLike(input.term);
  const limit = normalizeLimit(input.limit, 200, 5000);
  const onlyActive = input.onlyActive !== false;
  const like = `%${term}%`;
  const rows = db.prepare(`
    SELECT empresa_id, cliente_id, nome, documento, telefone, email,
           ativo, revision, source_updated_at, cached_at, payload_json
      FROM customers_cache
     WHERE empresa_id = ?
       AND (? = 0 OR ativo = 1)
       AND (? = '' OR nome LIKE ? ESCAPE '\\' COLLATE NOCASE
                    OR COALESCE(documento, '') LIKE ? ESCAPE '\\' COLLATE NOCASE)
     ORDER BY ativo DESC, nome COLLATE NOCASE, cliente_id
     LIMIT ?
  `).all(empresaId, onlyActive ? 1 : 0, term, like, like, limit);
  return rows.map((row) => mapPartyCacheRow(row, 'cliente_id', 'clienteId'));
}

function getSupplierCacheById(empresaIdValue, fornecedorIdValue) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const fornecedorId = requiredText(fornecedorIdValue, 'fornecedorId');
  const row = db.prepare(`
    SELECT empresa_id, fornecedor_id, nome, documento, telefone, email,
           ativo, revision, source_updated_at, cached_at, payload_json
      FROM suppliers_cache
     WHERE empresa_id = ? AND fornecedor_id = ?
  `).get(empresaId, fornecedorId);
  return mapPartyCacheRow(row, 'fornecedor_id', 'fornecedorId');
}

function searchSuppliersCache(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const term = escapeLike(input.term);
  const limit = normalizeLimit(input.limit);
  const onlyActive = input.onlyActive !== false;
  const like = `%${term}%`;
  const rows = db.prepare(`
    SELECT empresa_id, fornecedor_id, nome, documento, telefone, email,
           ativo, revision, source_updated_at, cached_at, payload_json
      FROM suppliers_cache
     WHERE empresa_id = ?
       AND (? = 0 OR ativo = 1)
       AND (? = '' OR nome LIKE ? ESCAPE '\\' COLLATE NOCASE
                    OR COALESCE(documento, '') LIKE ? ESCAPE '\\' COLLATE NOCASE)
     ORDER BY ativo DESC, nome COLLATE NOCASE, fornecedor_id
     LIMIT ?
  `).all(empresaId, onlyActive ? 1 : 0, term, like, like, limit);
  return rows.map((row) => mapPartyCacheRow(row, 'fornecedor_id', 'fornecedorId'));
}

const STOCK_QUANTITY_SCALE = 1000000;

function decimalToMicrounits(value, fieldName = 'quantidade') {
  if (typeof value === 'bigint') {
    if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`${fieldName} deve ser maior que zero e caber em inteiro seguro.`);
    }
    return Number(value);
  }

  const raw = String(value == null ? '' : value).trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,6})?$/.test(raw)) {
    throw new Error(`${fieldName} deve ser decimal positivo com no máximo 6 casas.`);
  }

  const [whole, fraction = ''] = raw.split('.');
  const microsBig = (BigInt(whole) * BigInt(STOCK_QUANTITY_SCALE)) +
    BigInt((fraction + '000000').slice(0, 6));

  if (microsBig <= 0n || microsBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${fieldName} deve ser maior que zero e caber em inteiro seguro.`);
  }

  return Number(microsBig);
}

function microunitsToDecimalString(value) {
  const total = BigInt(value);
  const sign = total < 0n ? '-' : '';
  const absolute = total < 0n ? -total : total;
  const whole = absolute / BigInt(STOCK_QUANTITY_SCALE);
  const fraction = String(absolute % BigInt(STOCK_QUANTITY_SCALE)).padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

function stockDirection(value) {
  const text = String(value == null ? '' : value).trim().toUpperCase();
  if (value === 1 || text === '1' || text === 'ENTRADA' || text === 'IN') return 1;
  if (value === -1 || text === '-1' || text === 'SAIDA' || text === 'OUT') return -1;
  throw new Error('direction deve ser ENTRADA/SAIDA ou 1/-1.');
}

function registerStockMovement(input) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input && input.empresaId, 'empresaId');
  const movementId = requiredText(input && input.movementId, 'movementId');
  const operationId = requiredText(input && input.operationId, 'operationId');
  const produtoId = requiredText(input && input.produtoId, 'produtoId');
  const direction = stockDirection(input && input.direction);
  const quantityMicrounits = decimalToMicrounits(input && input.quantidade, 'quantidade');
  const movementType = requiredText(input && input.movementType, 'movementType');
  const sourceId = optionalText(input && input.sourceId);
  const occurredAt = optionalText(input && input.occurredAt) || nowIso();
  const createdAt = nowIso();

  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = db.prepare(`
      INSERT INTO stock_movements (
        empresa_id, movement_id, operation_id, produto_id, direction,
        quantity_microunits, movement_type, source_id, occurred_at,
        created_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `).run(
      empresaId,
      movementId,
      operationId,
      produtoId,
      direction,
      quantityMicrounits,
      movementType,
      sourceId,
      occurredAt,
      createdAt,
      jsonText(input && input.payload)
    );

    const applied = Number(result.changes || 0) === 1;

    if (applied) {
      const delta = direction * quantityMicrounits;
      db.prepare(`
        INSERT INTO stock_projection (
          empresa_id, produto_id, quantity_microunits, updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(empresa_id, produto_id) DO UPDATE SET
          quantity_microunits = stock_projection.quantity_microunits + excluded.quantity_microunits,
          updated_at = excluded.updated_at
      `).run(empresaId, produtoId, delta, createdAt);
    }

    db.exec('COMMIT;');

    return {
      applied,
      duplicate: !applied,
      movementId,
      operationId,
      empresaId,
      produtoId,
      direction,
      quantidade: microunitsToDecimalString(quantityMicrounits),
      saldoProjetado: getStockProjection(empresaId, produtoId).quantidade
    };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

function getStockProjection(empresaIdValue, produtoIdValue) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const produtoId = requiredText(produtoIdValue, 'produtoId');
  const row = db.prepare(`
    SELECT quantity_microunits, updated_at
      FROM stock_projection
     WHERE empresa_id = ? AND produto_id = ?
  `).get(empresaId, produtoId);

  const quantityMicrounits = row ? Number(row.quantity_microunits) : 0;
  return {
    empresaId,
    produtoId,
    quantityMicrounits,
    quantidade: microunitsToDecimalString(quantityMicrounits),
    updatedAt: row ? String(row.updated_at) : null
  };
}

function listPendingStockDeltasByProduct(empresaIdValue) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const rows = db.prepare(`
    SELECT sm.produto_id,
           COALESCE(SUM(sm.direction * sm.quantity_microunits), 0) AS delta_microunits
      FROM stock_movements sm
      JOIN sync_outbox o
        ON o.empresa_id = sm.empresa_id
       AND substr(
             sm.operation_id,
             1,
             length(o.operation_id) + 1
           ) = o.operation_id || ':'
     WHERE sm.empresa_id = ?
       AND o.status <> 'CONFIRMED'
     GROUP BY sm.produto_id
  `).all(empresaId);

  return rows.map((row) => ({
    produtoId: String(row.produto_id),
    deltaMicrounits: Number(row.delta_microunits || 0)
  }));
}

function listStockMovements(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const produtoId = optionalText(input.produtoId);
  const limit = normalizeLimit(input.limit, 100, 500);
  const rows = db.prepare(`
    SELECT empresa_id, movement_id, operation_id, produto_id, direction,
           quantity_microunits, movement_type, source_id, occurred_at,
           created_at, payload_json
      FROM stock_movements
     WHERE empresa_id = ?
       AND (? IS NULL OR produto_id = ?)
     ORDER BY occurred_at, movement_id
     LIMIT ?
  `).all(empresaId, produtoId, produtoId, limit);

  return rows.map((row) => ({
    empresaId: String(row.empresa_id),
    movementId: String(row.movement_id),
    operationId: String(row.operation_id),
    produtoId: String(row.produto_id),
    direction: Number(row.direction),
    quantidade: microunitsToDecimalString(Number(row.quantity_microunits)),
    movementType: String(row.movement_type),
    sourceId: row.source_id == null ? null : String(row.source_id),
    occurredAt: String(row.occurred_at),
    createdAt: String(row.created_at),
    payload: parseJsonText(row.payload_json)
  }));
}

function moneyCents(value, fieldName) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${fieldName} deve ser um inteiro seguro maior ou igual a zero.`);
  }
  return number;
}


function ledgerDirection(value, fieldName = 'direction') {
  const text = String(value == null ? '' : value).trim().toUpperCase();
  if (value === 1 || text === '1' || text === 'ENTRADA' || text === 'IN' || text === 'CREDITO' || text === 'CREDIT') return 1;
  if (value === -1 || text === '-1' || text === 'SAIDA' || text === 'OUT' || text === 'DEBITO' || text === 'DEBIT') return -1;
  throw new Error(`${fieldName} deve ser ENTRADA/SAIDA (ou 1/-1).`);
}

function positiveMoneyCents(value, fieldName) {
  const amount = moneyCents(value, fieldName);
  if (amount <= 0) {
    throw new Error(`${fieldName} deve ser maior que zero.`);
  }
  return amount;
}

function getCashSession(empresaIdValue, sessionIdValue) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const sessionId = requiredText(sessionIdValue, 'sessionId');
  const row = db.prepare(`
    SELECT empresa_id, session_id, operation_id, status,
           opening_balance_centavos, opened_at, closed_at, created_at, payload_json
      FROM cash_sessions
     WHERE empresa_id = ? AND session_id = ?
  `).get(empresaId, sessionId);
  if (!row) return null;
  return {
    empresaId: String(row.empresa_id),
    sessionId: String(row.session_id),
    operationId: String(row.operation_id),
    status: String(row.status),
    openingBalanceCentavos: Number(row.opening_balance_centavos),
    openedAt: String(row.opened_at),
    closedAt: row.closed_at == null ? null : String(row.closed_at),
    createdAt: String(row.created_at),
    payload: parseJsonText(row.payload_json)
  };
}

function getOpenCashSession(empresaIdValue) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const rows = db.prepare(`
    SELECT empresa_id, session_id, operation_id, status,
           opening_balance_centavos, opened_at, closed_at, created_at, payload_json
      FROM cash_sessions
     WHERE empresa_id = ?
       AND status = 'OPEN'
     ORDER BY opened_at DESC, session_id DESC
     LIMIT 2
  `).all(empresaId);

  if (rows.length > 1) {
    throw new Error(
      'Mais de uma sessão de caixa está aberta para a empresa; operação offline bloqueada.'
    );
  }

  if (!rows.length) return null;

  const row = rows[0];
  return {
    empresaId: String(row.empresa_id),
    sessionId: String(row.session_id),
    operationId: String(row.operation_id),
    status: String(row.status),
    openingBalanceCentavos: Number(row.opening_balance_centavos),
    openedAt: String(row.opened_at),
    closedAt: row.closed_at == null ? null : String(row.closed_at),
    createdAt: String(row.created_at),
    payload: parseJsonText(row.payload_json)
  };
}

function openCashSession(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const sessionId = requiredText(input.sessionId, 'sessionId');
  const operationId = requiredText(input.operationId, 'operationId');
  const openingBalanceCentavos = moneyCents(
    input.openingBalanceCentavos == null ? 0 : input.openingBalanceCentavos,
    'openingBalanceCentavos'
  );
  const openedAt = optionalText(input.openedAt) || nowIso();
  const createdAt = nowIso();

  const existingSession = db.prepare(`
    SELECT session_id, operation_id FROM cash_sessions
     WHERE empresa_id = ? AND session_id = ?
  `).get(empresaId, sessionId);
  if (existingSession) {
    if (String(existingSession.operation_id) !== operationId) {
      throw new Error(`sessionId ${sessionId} já existe com outro operationId.`);
    }
    return { applied: false, duplicate: true, session: getCashSession(empresaId, sessionId) };
  }

  const existingOperation = db.prepare(`
    SELECT session_id FROM cash_sessions
     WHERE empresa_id = ? AND operation_id = ?
  `).get(empresaId, operationId);
  if (existingOperation) {
    if (String(existingOperation.session_id) !== sessionId) {
      throw new Error(`operationId ${operationId} já pertence ao caixa ${existingOperation.session_id}.`);
    }
    return { applied: false, duplicate: true, session: getCashSession(empresaId, sessionId) };
  }

  const existingOpenSession = db.prepare(`
    SELECT session_id
      FROM cash_sessions
     WHERE empresa_id = ?
       AND status = 'OPEN'
     LIMIT 1
  `).get(empresaId);

  if (existingOpenSession) {
    throw new Error(
      `A empresa já possui uma sessão de caixa aberta: ${existingOpenSession.session_id}.`
    );
  }

  db.prepare(`
    INSERT INTO cash_sessions (
      empresa_id, session_id, operation_id, status, opening_balance_centavos,
      opened_at, closed_at, created_at, payload_json
    ) VALUES (?, ?, ?, 'OPEN', ?, ?, NULL, ?, ?)
  `).run(
    empresaId,
    sessionId,
    operationId,
    openingBalanceCentavos,
    openedAt,
    createdAt,
    jsonText(input.payload)
  );

  return { applied: true, duplicate: false, session: getCashSession(empresaId, sessionId) };
}

function closeCashSession(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const sessionId = requiredText(input.sessionId, 'sessionId');
  const closedAt = optionalText(input.closedAt) || nowIso();
  const session = getCashSession(empresaId, sessionId);

  if (!session) {
    throw new Error(`Caixa ${sessionId} não existe para a empresa.`);
  }

  if (session.status === 'CLOSED') {
    return {
      applied: false,
      duplicate: true,
      session
    };
  }

  const nextPayload = {
    ...(session.payload && typeof session.payload === 'object' && !Array.isArray(session.payload)
      ? session.payload
      : {}),
    ...(input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
      ? input.payload
      : {})
  };

  const result = db.prepare(`
    UPDATE cash_sessions
       SET status = 'CLOSED',
           closed_at = ?,
           payload_json = ?
     WHERE empresa_id = ?
       AND session_id = ?
       AND status = 'OPEN'
  `).run(
    closedAt,
    jsonText(nextPayload),
    empresaId,
    sessionId
  );

  if (Number(result.changes || 0) !== 1) {
    throw new Error(`Caixa ${sessionId} não pôde ser fechado de forma atômica.`);
  }

  return {
    applied: true,
    duplicate: false,
    session: getCashSession(empresaId, sessionId)
  };
}

function mapCashMovementRow(row) {
  if (!row) return null;
  return {
    empresaId: String(row.empresa_id),
    movementId: String(row.movement_id),
    operationId: String(row.operation_id),
    sessionId: String(row.session_id),
    direction: Number(row.direction),
    amountCentavos: Number(row.amount_centavos),
    movementType: String(row.movement_type),
    sourceId: row.source_id == null ? null : String(row.source_id),
    occurredAt: String(row.occurred_at),
    createdAt: String(row.created_at),
    payload: parseJsonText(row.payload_json)
  };
}

function registerCashMovement(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const movementId = requiredText(input.movementId, 'movementId');
  const operationId = requiredText(input.operationId, 'operationId');
  const sessionId = requiredText(input.sessionId, 'sessionId');
  const direction = ledgerDirection(input.direction);
  const amountCentavos = positiveMoneyCents(input.amountCentavos, 'amountCentavos');
  const movementType = requiredText(input.movementType, 'movementType');
  const sourceId = optionalText(input.sourceId);
  const occurredAt = optionalText(input.occurredAt) || nowIso();
  const createdAt = nowIso();

  const session = getCashSession(empresaId, sessionId);
  if (!session || session.status !== 'OPEN') {
    throw new Error(`Caixa ${sessionId} não está aberto para a empresa.`);
  }

  const result = db.prepare(`
    INSERT INTO cash_movements (
      empresa_id, movement_id, operation_id, session_id, direction,
      amount_centavos, movement_type, source_id, occurred_at, created_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT DO NOTHING
  `).run(
    empresaId,
    movementId,
    operationId,
    sessionId,
    direction,
    amountCentavos,
    movementType,
    sourceId,
    occurredAt,
    createdAt,
    jsonText(input.payload)
  );

  return {
    applied: Number(result.changes || 0) === 1,
    duplicate: Number(result.changes || 0) !== 1,
    movementId,
    operationId
  };
}

function listCashMovements(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const sessionId = optionalText(input.sessionId);
  const limit = normalizeLimit(input.limit, 100, 5000);
  const offset = Math.max(0, Math.trunc(Number(input.offset) || 0));
  const rows = db.prepare(`
    SELECT empresa_id, movement_id, operation_id, session_id, direction,
           amount_centavos, movement_type, source_id, occurred_at, created_at, payload_json
      FROM cash_movements
     WHERE empresa_id = ?
       AND (? IS NULL OR session_id = ?)
     ORDER BY occurred_at, movement_id
     LIMIT ? OFFSET ?
  `).all(empresaId, sessionId, sessionId, limit, offset);
  return rows.map(mapCashMovementRow);
}


/*
 * Resumo do caixa sem limite de linhas.
 *
 * Quando existe um snapshot confirmado da VPS, snapshotAt representa
 * o instante até o qual os totais remotos já foram consolidados. Somamos
 * somente movimentos locais posteriores a esse instante OU operações cujo
 * outbox foi atualizado depois do snapshot.
 */
function aggregateCashSessionActivity(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const sessionId = requiredText(input.sessionId, 'sessionId');
  const snapshotAt = optionalText(input.snapshotAt);

  const cutoffClauseCash = snapshotAt
    ? `AND (
         cm.occurred_at > ?
         OR COALESCE(oc.updated_at, '') > ?
         OR COALESCE(os.updated_at, '') > ?
       )`
    : '';

  const cashParams = snapshotAt
    ? [empresaId, sessionId, snapshotAt, snapshotAt, snapshotAt]
    : [empresaId, sessionId];

  const cash = db.prepare(`
    SELECT
      COALESCE(SUM(cm.direction * cm.amount_centavos), 0) AS signed_cash_centavos,
      COALESCE(SUM(CASE WHEN UPPER(TRIM(cm.movement_type)) = 'VENDA_PAGA' THEN cm.direction * cm.amount_centavos ELSE 0 END), 0) AS vendas_dinheiro_centavos,
      COALESCE(SUM(CASE WHEN UPPER(TRIM(cm.movement_type)) = 'SANGRIA' THEN ABS(cm.amount_centavos) ELSE 0 END), 0) AS sangrias_centavos,
      COALESCE(SUM(CASE WHEN UPPER(TRIM(cm.movement_type)) = 'SUPRIMENTO' THEN ABS(cm.amount_centavos) ELSE 0 END), 0) AS suprimentos_centavos,
      COALESCE(SUM(CASE WHEN UPPER(TRIM(cm.movement_type)) = 'AJUSTE' THEN cm.direction * cm.amount_centavos ELSE 0 END), 0) AS ajustes_centavos,
      COALESCE(SUM(CASE WHEN UPPER(TRIM(cm.movement_type)) IN ('SANGRIA', 'SUPRIMENTO', 'AJUSTE') THEN 1 ELSE 0 END), 0) AS quantidade_movimentos
    FROM cash_movements AS cm
    LEFT JOIN sync_outbox AS oc
      ON oc.empresa_id = cm.empresa_id
     AND oc.operation_id = cm.operation_id
    LEFT JOIN sales AS s
      ON s.empresa_id = cm.empresa_id
     AND s.sale_id = cm.source_id
    LEFT JOIN sync_outbox AS os
      ON os.empresa_id = s.empresa_id
     AND os.operation_id = s.operation_id
    WHERE cm.empresa_id = ?
      AND cm.session_id = ?
      ${cutoffClauseCash}
  `).get(...cashParams) || {};

  const cutoffClauseFinancial = snapshotAt
    ? `AND (fm.occurred_at > ? OR COALESCE(os.updated_at, '') > ?)`
    : '';

  const financialParams = snapshotAt
    ? [empresaId, sessionId, sessionId, snapshotAt, snapshotAt]
    : [empresaId, sessionId, sessionId];

  const financial = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN UPPER(TRIM(COALESCE(json_extract(fm.payload_json, '$.meio'), json_extract(fm.payload_json, '$.paymentMethod'), json_extract(fm.payload_json, '$.paymentPart.method'), ''))) = 'PIX' THEN fm.amount_centavos ELSE 0 END), 0) AS pix_centavos,
      COALESCE(SUM(CASE WHEN UPPER(TRIM(COALESCE(json_extract(fm.payload_json, '$.meio'), json_extract(fm.payload_json, '$.paymentMethod'), json_extract(fm.payload_json, '$.paymentPart.method'), ''))) IN ('DEBITO', 'DÉBITO') THEN fm.amount_centavos ELSE 0 END), 0) AS debito_centavos,
      COALESCE(SUM(CASE WHEN UPPER(TRIM(COALESCE(json_extract(fm.payload_json, '$.meio'), json_extract(fm.payload_json, '$.paymentMethod'), json_extract(fm.payload_json, '$.paymentPart.method'), ''))) IN ('CREDITO', 'CRÉDITO') THEN fm.amount_centavos ELSE 0 END), 0) AS credito_centavos
    FROM financial_movements AS fm
    LEFT JOIN sales AS s
      ON s.empresa_id = fm.empresa_id
     AND s.sale_id = fm.source_id
    LEFT JOIN sync_outbox AS os
      ON os.empresa_id = s.empresa_id
     AND os.operation_id = s.operation_id
    WHERE fm.empresa_id = ?
      AND fm.direction = 1
      AND UPPER(TRIM(fm.movement_type)) = 'VENDA_PAGA'
      AND (
        json_extract(fm.payload_json, '$.caixaSessaoId') = ?
        OR json_extract(s.payload_json, '$.caixaSessaoId') = ?
      )
      ${cutoffClauseFinancial}
  `).get(...financialParams) || {};

  const cutoffClauseSales = snapshotAt
    ? `AND (local_event_at > ? OR COALESCE(outbox_updated_at, '') > ?)`
    : '';

  const saleParams = snapshotAt
    ? [empresaId, sessionId, empresaId, sessionId, sessionId, snapshotAt, snapshotAt]
    : [empresaId, sessionId, empresaId, sessionId, sessionId];

  const saleCounter = db.prepare(`
    WITH local_sale_sources AS (
      SELECT cm.source_id AS sale_id,
             cm.occurred_at AS local_event_at,
             os.updated_at AS outbox_updated_at
        FROM cash_movements AS cm
        LEFT JOIN sales AS s
          ON s.empresa_id = cm.empresa_id
         AND s.sale_id = cm.source_id
        LEFT JOIN sync_outbox AS os
          ON os.empresa_id = s.empresa_id
         AND os.operation_id = s.operation_id
       WHERE cm.empresa_id = ?
         AND cm.session_id = ?
         AND UPPER(TRIM(cm.movement_type)) = 'VENDA_PAGA'
         AND cm.source_id IS NOT NULL

      UNION ALL

      SELECT fm.source_id AS sale_id,
             fm.occurred_at AS local_event_at,
             os.updated_at AS outbox_updated_at
        FROM financial_movements AS fm
        LEFT JOIN sales AS s
          ON s.empresa_id = fm.empresa_id
         AND s.sale_id = fm.source_id
        LEFT JOIN sync_outbox AS os
          ON os.empresa_id = s.empresa_id
         AND os.operation_id = s.operation_id
       WHERE fm.empresa_id = ?
         AND fm.direction = 1
         AND UPPER(TRIM(fm.movement_type)) = 'VENDA_PAGA'
         AND fm.source_id IS NOT NULL
         AND (
           json_extract(fm.payload_json, '$.caixaSessaoId') = ?
           OR json_extract(s.payload_json, '$.caixaSessaoId') = ?
         )
    )
    SELECT COUNT(DISTINCT sale_id) AS quantidade_vendas
      FROM local_sale_sources
     WHERE sale_id IS NOT NULL
       ${cutoffClauseSales}
  `).get(...saleParams) || {};

  const detailLimit = normalizeLimit(input.movementLimit, 5000, 5000);
  const detailOffset = Math.max(0, Math.trunc(Number(input.movementOffset) || 0));
  const detailCutoff = snapshotAt
    ? `AND (
         cm.occurred_at > ?
         OR COALESCE(oc.updated_at, '') > ?
         OR COALESCE(os.updated_at, '') > ?
       )`
    : '';
  const detailParams = snapshotAt
    ? [empresaId, sessionId, snapshotAt, snapshotAt, snapshotAt, detailLimit, detailOffset]
    : [empresaId, sessionId, detailLimit, detailOffset];

  const movements = db.prepare(`
    SELECT cm.empresa_id, cm.movement_id, cm.operation_id, cm.session_id,
           cm.direction, cm.amount_centavos, cm.movement_type, cm.source_id,
           cm.occurred_at, cm.created_at, cm.payload_json
      FROM cash_movements AS cm
      LEFT JOIN sync_outbox AS oc
        ON oc.empresa_id = cm.empresa_id
       AND oc.operation_id = cm.operation_id
      LEFT JOIN sales AS s
        ON s.empresa_id = cm.empresa_id
       AND s.sale_id = cm.source_id
      LEFT JOIN sync_outbox AS os
        ON os.empresa_id = s.empresa_id
       AND os.operation_id = s.operation_id
     WHERE cm.empresa_id = ?
       AND cm.session_id = ?
       AND UPPER(TRIM(cm.movement_type)) IN ('SANGRIA', 'SUPRIMENTO', 'AJUSTE')
       ${detailCutoff}
     ORDER BY cm.occurred_at, cm.movement_id
     LIMIT ? OFFSET ?
  `).all(...detailParams).map(mapCashMovementRow);

  return {
    signedCashCentavos: Number(cash.signed_cash_centavos || 0),
    vendasDinheiroCentavos: Number(cash.vendas_dinheiro_centavos || 0),
    recebimentosPixCentavos: Number(financial.pix_centavos || 0),
    recebimentosDebitoCentavos: Number(financial.debito_centavos || 0),
    recebimentosCreditoCentavos: Number(financial.credito_centavos || 0),
    sangriasCentavos: Number(cash.sangrias_centavos || 0),
    suprimentosCentavos: Number(cash.suprimentos_centavos || 0),
    ajustesCentavos: Number(cash.ajustes_centavos || 0),
    quantidadeVendas: Number(saleCounter.quantidade_vendas || 0),
    quantidadeMovimentos: Number(cash.quantidade_movimentos || 0),
    movimentos: movements
  };
}

function mapFinancialMovementRow(row) {
  if (!row) return null;
  return {
    empresaId: String(row.empresa_id),
    movementId: String(row.movement_id),
    operationId: String(row.operation_id),
    accountId: row.account_id == null ? null : String(row.account_id),
    direction: Number(row.direction),
    amountCentavos: Number(row.amount_centavos),
    movementType: String(row.movement_type),
    sourceId: row.source_id == null ? null : String(row.source_id),
    occurredAt: String(row.occurred_at),
    createdAt: String(row.created_at),
    payload: parseJsonText(row.payload_json)
  };
}

function registerFinancialMovement(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const movementId = requiredText(input.movementId, 'movementId');
  const operationId = requiredText(input.operationId, 'operationId');
  const accountId = optionalText(input.accountId);
  const direction = ledgerDirection(input.direction);
  const amountCentavos = positiveMoneyCents(input.amountCentavos, 'amountCentavos');
  const movementType = requiredText(input.movementType, 'movementType');
  const sourceId = optionalText(input.sourceId);
  const occurredAt = optionalText(input.occurredAt) || nowIso();
  const createdAt = nowIso();

  const result = db.prepare(`
    INSERT INTO financial_movements (
      empresa_id, movement_id, operation_id, account_id, direction,
      amount_centavos, movement_type, source_id, occurred_at, created_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT DO NOTHING
  `).run(
    empresaId,
    movementId,
    operationId,
    accountId,
    direction,
    amountCentavos,
    movementType,
    sourceId,
    occurredAt,
    createdAt,
    jsonText(input.payload)
  );

  return {
    applied: Number(result.changes || 0) === 1,
    duplicate: Number(result.changes || 0) !== 1,
    movementId,
    operationId
  };
}

function listFinancialMovements(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const accountId = optionalText(input.accountId);
  const limit = normalizeLimit(input.limit, 100, 500);
  const rows = db.prepare(`
    SELECT empresa_id, movement_id, operation_id, account_id, direction,
           amount_centavos, movement_type, source_id, occurred_at, created_at, payload_json
      FROM financial_movements
     WHERE empresa_id = ?
       AND (? IS NULL OR account_id = ?)
     ORDER BY occurred_at, movement_id
     LIMIT ?
  `).all(empresaId, accountId, accountId, limit);
  return rows.map(mapFinancialMovementRow);
}

function normalizeSaleCashMovements(input, empresaId, saleId, occurredAt) {
  const rows = Array.isArray(input.cashMovements) ? input.cashMovements : [];
  return rows.map((movement, index) => ({
    movementId: requiredText(movement && movement.movementId, `cashMovements[${index}].movementId`),
    operationId: requiredText(movement && movement.operationId, `cashMovements[${index}].operationId`),
    sessionId: requiredText(movement && movement.sessionId, `cashMovements[${index}].sessionId`),
    direction: ledgerDirection(movement && movement.direction, `cashMovements[${index}].direction`),
    amountCentavos: positiveMoneyCents(movement && movement.amountCentavos, `cashMovements[${index}].amountCentavos`),
    movementType: requiredText(movement && movement.movementType, `cashMovements[${index}].movementType`),
    sourceId: optionalText(movement && movement.sourceId) || saleId,
    occurredAt: optionalText(movement && movement.occurredAt) || occurredAt,
    payload: movement && movement.payload
  }));
}

function normalizeSaleFinancialMovements(input, empresaId, saleId, occurredAt) {
  const rows = Array.isArray(input.financialMovements) ? input.financialMovements : [];
  return rows.map((movement, index) => ({
    movementId: requiredText(movement && movement.movementId, `financialMovements[${index}].movementId`),
    operationId: requiredText(movement && movement.operationId, `financialMovements[${index}].operationId`),
    accountId: optionalText(movement && movement.accountId),
    direction: ledgerDirection(movement && movement.direction, `financialMovements[${index}].direction`),
    amountCentavos: positiveMoneyCents(movement && movement.amountCentavos, `financialMovements[${index}].amountCentavos`),
    movementType: requiredText(movement && movement.movementType, `financialMovements[${index}].movementType`),
    sourceId: optionalText(movement && movement.sourceId) || saleId,
    occurredAt: optionalText(movement && movement.occurredAt) || occurredAt,
    payload: movement && movement.payload
  }));
}

function normalizeSalePaymentSnapshot(input = {}) {
  const payload = input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
    ? input.payload
    : {};
  const sourceParts = Array.isArray(input.paymentParts)
    ? input.paymentParts
    : (Array.isArray(payload.paymentParts) ? payload.paymentParts : []);
  const paymentParts = sourceParts
    .filter((part) => part && typeof part === 'object' && !Array.isArray(part))
    .map((part) => ({ ...part }));
  const methods = [];
  for (const part of paymentParts) {
    const method = optionalText(part.method || part.metodo || part.paymentMethod);
    if (method) {
      const normalized = method.toUpperCase();
      if (!methods.includes(normalized)) methods.push(normalized);
    }
  }

  const explicitMethod = optionalText(input.paymentMethod) || optionalText(payload.paymentMethod);
  const paymentMethod = explicitMethod ? explicitMethod.toUpperCase() : methods.join(' + ');

  let paymentTotalValue = input.paymentTotalValue != null
    ? Number(input.paymentTotalValue)
    : (payload.paymentTotalValue != null ? Number(payload.paymentTotalValue) : NaN);
  if (!Number.isFinite(paymentTotalValue)) {
    const sum = paymentParts.reduce((total, part) => {
      const amount = Number(part.amount != null ? part.amount : part.valor);
      return total + (Number.isFinite(amount) && amount > 0 ? amount : 0);
    }, 0);
    paymentTotalValue = Math.round((sum + Number.EPSILON) * 100) / 100;
  }

  const explicitSplit = typeof input.paymentSplit === 'boolean'
    ? input.paymentSplit
    : (typeof payload.paymentSplit === 'boolean' ? payload.paymentSplit : null);
  const paymentSplit = explicitSplit == null ? paymentParts.length > 1 : explicitSplit;

  return {
    paymentMethod: paymentMethod || '',
    paymentParts,
    paymentSplit,
    paymentPartsCount: paymentParts.length,
    paymentMethodsCount: methods.length,
    paymentTotalValue
  };
}

function getSaleById(empresaIdValue, saleIdValue) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const saleId = requiredText(saleIdValue, 'saleId');
  const sale = db.prepare(`
    SELECT empresa_id, sale_id, operation_id, cliente_id, status,
           total_centavos, occurred_at, created_at, payload_json
      FROM sales
     WHERE empresa_id = ? AND sale_id = ?
  `).get(empresaId, saleId);
  if (!sale) return null;

  const items = db.prepare(`
    SELECT item_id, produto_id, quantity_microunits, unit_price_centavos,
           total_centavos, payload_json
      FROM sale_items
     WHERE empresa_id = ? AND sale_id = ?
     ORDER BY item_id
  `).all(empresaId, saleId);

  return {
    empresaId: String(sale.empresa_id),
    saleId: String(sale.sale_id),
    operationId: String(sale.operation_id),
    clienteId: sale.cliente_id == null ? null : String(sale.cliente_id),
    status: String(sale.status),
    totalCentavos: Number(sale.total_centavos),
    occurredAt: String(sale.occurred_at),
    createdAt: String(sale.created_at),
    payload: parseJsonText(sale.payload_json),
    items: items.map((item) => ({
      itemId: String(item.item_id),
      produtoId: String(item.produto_id),
      quantidade: microunitsToDecimalString(Number(item.quantity_microunits)),
      unitPriceCentavos: Number(item.unit_price_centavos),
      totalCentavos: Number(item.total_centavos),
      payload: parseJsonText(item.payload_json)
    }))
  };
}

function mapOutboxRow(row) {
  if (!row) return null;
  return {
    empresaId: String(row.empresa_id),
    operationId: String(row.operation_id),
    type: String(row.type),
    entityId: String(row.entity_id),
    payload: parseJsonText(row.payload_json),
    status: String(row.status),
    attempts: Number(row.attempts),
    dependencies: parseJsonText(row.dependencies_json) || [],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastError: row.last_error == null ? null : String(row.last_error),
    nextAttemptAt: row.next_attempt_at == null ? null : String(row.next_attempt_at),
    sendingStartedAt: row.sending_started_at == null ? null : String(row.sending_started_at),
    confirmedAt: row.confirmed_at == null ? null : String(row.confirmed_at),
    remoteAck: row.remote_ack_json == null ? null : parseJsonText(row.remote_ack_json)
  };
}

const OUTBOX_SELECT = `
  SELECT empresa_id, operation_id, type, entity_id, payload_json, status,
         attempts, dependencies_json, created_at, updated_at, last_error,
         next_attempt_at, sending_started_at, confirmed_at, remote_ack_json
    FROM sync_outbox
`;

function getOutboxStatusSummary(empresaIdValue) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS total
      FROM sync_outbox
     WHERE empresa_id = ?
     GROUP BY status
  `).all(empresaId);

  const summary = {};
  for (const row of rows) {
    summary[String(row.status)] = Number(row.total || 0);
  }
  return summary;
}

function getOutboxOperation(empresaIdValue, operationIdValue) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const operationId = requiredText(operationIdValue, 'operationId');
  const row = db.prepare(`${OUTBOX_SELECT}
     WHERE empresa_id = ? AND operation_id = ?
  `).get(empresaId, operationId);
  return mapOutboxRow(row);
}

function normalizeOutboxDependencies(value, operationId = '') {
  const source = Array.isArray(value) ? value : [];
  const unique = [];
  for (const item of source) {
    const dependency = optionalText(item);
    if (!dependency || dependency === operationId || unique.includes(dependency)) continue;
    unique.push(dependency);
  }
  return unique;
}

function enqueueOutboxOperation(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const operationId = requiredText(input.operationId, 'operationId');
  const type = requiredText(input.type, 'type').toUpperCase();
  const entityId = requiredText(input.entityId, 'entityId');
  const payload = input.payload == null ? {} : input.payload;
  const dependencies = normalizeOutboxDependencies(input.dependencies, operationId);
  const createdAt = optionalText(input.createdAt) || nowIso();

  const existing = getOutboxOperation(empresaId, operationId);
  if (existing) {
    if (existing.type !== type || existing.entityId !== entityId) {
      throw new Error(`operationId ${operationId} já existe com outro tipo ou entidade.`);
    }
    if (JSON.stringify(existing.payload) !== JSON.stringify(payload) ||
        JSON.stringify(existing.dependencies) !== JSON.stringify(dependencies)) {
      throw new Error(`operationId ${operationId} já existe com outro payload ou dependências.`);
    }
    return { applied: false, duplicate: true, operation: existing };
  }

  db.prepare(`
    INSERT INTO sync_outbox (
      empresa_id, operation_id, type, entity_id, payload_json, status,
      attempts, dependencies_json, created_at, updated_at, last_error
    ) VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?, ?, ?, NULL)
  `).run(
    empresaId,
    operationId,
    type,
    entityId,
    JSON.stringify(payload),
    JSON.stringify(dependencies),
    createdAt,
    createdAt
  );

  return {
    applied: true,
    duplicate: false,
    operation: getOutboxOperation(empresaId, operationId)
  };
}

function listOutboxReady(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const limit = normalizeLimit(input.limit, 50, 200);
  const referenceAt = optionalText(input.referenceAt) || nowIso();
  const rows = db.prepare(`
    SELECT o.empresa_id, o.operation_id, o.type, o.entity_id, o.payload_json, o.status,
           o.attempts, o.dependencies_json, o.created_at, o.updated_at, o.last_error,
           o.next_attempt_at, o.sending_started_at, o.confirmed_at, o.remote_ack_json
      FROM sync_outbox AS o
     WHERE o.empresa_id = ?
       AND (
         o.status = 'PENDING'
         OR (o.status = 'RETRY' AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= ?))
       )
       AND NOT EXISTS (
         SELECT 1
           FROM json_each(o.dependencies_json) AS dep
           LEFT JOIN sync_outbox AS d
             ON d.empresa_id = o.empresa_id
            AND d.operation_id = dep.value
          WHERE d.operation_id IS NULL
             OR d.status <> 'CONFIRMED'
       )
     ORDER BY o.created_at, o.operation_id
     LIMIT ?
  `).all(empresaId, referenceAt, limit);
  return rows.map(mapOutboxRow);
}

function claimOutboxOperation(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const operationId = requiredText(input.operationId, 'operationId');
  const startedAt = optionalText(input.startedAt) || nowIso();
  const referenceAt = optionalText(input.referenceAt) || startedAt;

  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = db.prepare(`
      UPDATE sync_outbox
         SET status = 'SENDING',
             attempts = attempts + 1,
             updated_at = ?,
             last_error = NULL,
             next_attempt_at = NULL,
             sending_started_at = ?,
             confirmed_at = NULL,
             remote_ack_json = NULL
       WHERE empresa_id = ?
         AND operation_id = ?
         AND (
           status = 'PENDING'
           OR (status = 'RETRY' AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
         )
    `).run(startedAt, startedAt, empresaId, operationId, referenceAt);
    db.exec('COMMIT;');
    return {
      claimed: Number(result.changes || 0) === 1,
      operation: getOutboxOperation(empresaId, operationId)
    };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

function transitionOutboxFromSending(input, targetStatus, fields = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const operationId = requiredText(input.operationId, 'operationId');
  const updatedAt = optionalText(input.updatedAt) || nowIso();
  const result = db.prepare(`
    UPDATE sync_outbox
       SET status = ?,
           updated_at = ?,
           last_error = ?,
           next_attempt_at = ?,
           sending_started_at = NULL,
           confirmed_at = ?,
           remote_ack_json = ?
     WHERE empresa_id = ?
       AND operation_id = ?
       AND status = 'SENDING'
  `).run(
    targetStatus,
    updatedAt,
    fields.lastError == null ? null : String(fields.lastError),
    fields.nextAttemptAt == null ? null : String(fields.nextAttemptAt),
    fields.confirmedAt == null ? null : String(fields.confirmedAt),
    fields.remoteAck == null ? null : JSON.stringify(fields.remoteAck),
    empresaId,
    operationId
  );
  return {
    changed: Number(result.changes || 0) === 1,
    operation: getOutboxOperation(empresaId, operationId)
  };
}

function markOutboxRetry(input = {}) {
  const nextAttemptAt = requiredText(input.nextAttemptAt, 'nextAttemptAt');
  return transitionOutboxFromSending(input, 'RETRY', {
    lastError: optionalText(input.error) || 'Falha temporária no envio.',
    nextAttemptAt
  });
}

function markOutboxConfirmed(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const operationId = requiredText(input.operationId, 'operationId');
  const confirmedAt = optionalText(input.confirmedAt) || nowIso();

  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = transitionOutboxFromSending({
      ...input,
      empresaId,
      operationId
    }, 'CONFIRMED', {
      confirmedAt,
      remoteAck: input.ack == null ? {} : input.ack
    });

    if (result.changed) {
      applyConfirmedSaleSyncStatus(db, empresaId, operationId, confirmedAt);
    }

    db.exec('COMMIT;');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

function markOutboxConflict(input = {}) {
  return transitionOutboxFromSending(input, 'CONFLICT', {
    lastError: optionalText(input.error) || 'Conflito detectado na sincronização.'
  });
}

function markOutboxManualReview(input = {}) {
  return transitionOutboxFromSending(input, 'MANUAL_REVIEW', {
    lastError: optionalText(input.error) || 'Operação requer revisão manual.'
  });
}

function recoverStaleOutbox(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const staleBefore = requiredText(input.staleBefore, 'staleBefore');
  const updatedAt = optionalText(input.updatedAt) || nowIso();
  const nextAttemptAt = optionalText(input.nextAttemptAt) || updatedAt;
  const result = db.prepare(`
    UPDATE sync_outbox
       SET status = 'RETRY',
           updated_at = ?,
           last_error = COALESCE(last_error, 'Envio interrompido antes da confirmação.'),
           next_attempt_at = ?,
           sending_started_at = NULL,
           confirmed_at = NULL,
           remote_ack_json = NULL
     WHERE empresa_id = ?
       AND status = 'SENDING'
       AND sending_started_at IS NOT NULL
       AND sending_started_at <= ?
  `).run(updatedAt, nextAttemptAt, empresaId, staleBefore);
  return Number(result.changes || 0);
}

const NFCE_CUF_BY_UF = Object.freeze({
  AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53',
  ES: '32', GO: '52', MA: '21', MT: '51', MS: '50', MG: '31', PA: '15',
  PB: '25', PR: '41', PE: '26', PI: '22', RJ: '33', RN: '24', RS: '43',
  RO: '11', RR: '14', SC: '42', SP: '35', SE: '28', TO: '17'
});

function normalizeFiscalAllocationInput(value, saleId, operationId) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('fiscalAllocation deve ser um objeto quando informado.');
  }
  const leaseId = requiredText(value.leaseId, 'fiscalAllocation.leaseId');
  const deviceId = requiredText(value.deviceId, 'fiscalAllocation.deviceId');
  const fiscalId = optionalText(value.fiscalId) || `nfce:${saleId}`;
  const fiscalOperationId = optionalText(value.operationId) || `${operationId}:nfce`;
  const xJust = optionalText(value.xJust) ||
    'Emissão em contingência por indisponibilidade de conexão com a SEFAZ.';
  if (xJust.length < 15 || xJust.length > 256) {
    throw new Error('fiscalAllocation.xJust deve ter entre 15 e 256 caracteres.');
  }
  return { leaseId, deviceId, fiscalId, fiscalOperationId, xJust };
}

function fiscalAammFromDateTime(value) {
  const text = requiredText(value, 'dhEmi');
  const match = text.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[1].slice(-2)}${match[2]}`;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error('dhEmi inválido para a chave NFC-e.');
  return `${String(date.getUTCFullYear()).slice(-2)}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function nfceAccessKeyDv(base43) {
  const digits = String(base43 || '');
  if (!/^\d{43}$/.test(digits)) {
    throw new Error('Base da chave NFC-e deve conter 43 dígitos nesta etapa.');
  }
  let weight = 2;
  let sum = 0;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += Number(digits[index]) * weight;
    weight += 1;
    if (weight > 9) weight = 2;
  }
  const remainder = sum % 11;
  const candidate = 11 - remainder;
  return String(candidate === 10 || candidate === 11 ? 0 : candidate);
}

function deterministicFiscalCnf(input) {
  const source = [
    input.empresaId,
    input.saleId,
    input.operationId,
    input.leaseId,
    String(input.numero)
  ].join('|');
  const digest = createHash('sha256').update(source, 'utf8').digest();
  const value = digest.readUInt32BE(0) % 100000000;
  return String(value).padStart(8, '0');
}

function buildNfceAccessKey(input) {
  const uf = requiredText(input.uf, 'uf').toUpperCase();
  const cuf = NFCE_CUF_BY_UF[uf];
  if (!cuf) throw new Error(`UF sem cUF configurado para NFC-e: ${uf}.`);
  const cnpj = requiredText(input.cnpj, 'cnpj').replace(/\D/g, '');
  if (!/^\d{14}$/.test(cnpj)) {
    throw new Error('CNPJ alfanumérico ainda não é suportado pelo gerador local desta etapa.');
  }
  const modelo = Number(input.modelo);
  if (modelo !== 65) throw new Error('modelo NFC-e deve ser 65.');
  const serieNumber = Number(input.serie);
  if (!Number.isSafeInteger(serieNumber) || serieNumber < 0 || serieNumber > 889) {
    throw new Error('Série NFC-e inválida para composição da chave.');
  }
  const numero = Number(input.numero);
  if (!Number.isSafeInteger(numero) || numero < 1 || numero > 999999999) {
    throw new Error('Número NFC-e inválido para composição da chave.');
  }
  const tpEmis = Number(input.tpEmis);
  if (tpEmis !== 9) throw new Error('tpEmis deve ser 9 nesta etapa.');
  const cnf = requiredText(input.cnf, 'cNF');
  if (!/^\d{8}$/.test(cnf)) throw new Error('cNF deve conter 8 dígitos.');
  const base43 = [
    cuf,
    fiscalAammFromDateTime(input.dhEmi),
    cnpj,
    String(modelo).padStart(2, '0'),
    String(serieNumber).padStart(3, '0'),
    String(numero).padStart(9, '0'),
    String(tpEmis),
    cnf
  ].join('');
  const cdv = nfceAccessKeyDv(base43);
  return { chaveAcesso: `${base43}${cdv}`, cdv, cuf };
}

function mapNfceDocumentRow(row) {
  if (!row) return null;
  return {
    empresaId: String(row.empresa_id),
    fiscalId: String(row.fiscal_id),
    saleId: String(row.sale_id),
    operationId: String(row.operation_id),
    leaseId: String(row.lease_id),
    ambiente: String(row.ambiente),
    modelo: Number(row.modelo),
    serie: String(row.serie),
    numero: Number(row.numero),
    cnf: String(row.cnf),
    cdv: String(row.cdv),
    chaveAcesso: String(row.chave_acesso),
    tpEmis: Number(row.tp_emis),
    dhEmi: String(row.dh_emi),
    dhCont: String(row.dh_cont),
    xJust: String(row.x_just),
    profileRevision: String(row.profile_revision),

    inputSnapshot: parseJsonText(row.input_snapshot_json),

    signedXml: row.signed_xml == null ? null : Buffer.from(row.signed_xml),

    signedXmlSha256: row.signed_xml_sha256 == null ? null : String(row.signed_xml_sha256),

    qrCodeText: row.qr_code_text == null ? null : String(row.qr_code_text),

    state: String(row.state),
    protocolo: row.protocolo == null ? null : String(row.protocolo),
    sefazCStat: row.sefaz_cstat == null ? null : String(row.sefaz_cstat),
    sefazXMotivo: row.sefaz_xmotivo == null ? null : String(row.sefaz_xmotivo),
    autorizadoEm: row.autorizado_em == null ? null : String(row.autorizado_em),
    processedXml: row.processed_xml == null ? null : Buffer.from(row.processed_xml),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function getNfceDocumentBySaleId(empresaIdValue, saleIdValue) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const saleId = requiredText(saleIdValue, 'saleId');
  const row = db.prepare(`
    SELECT empresa_id, fiscal_id, sale_id, operation_id, lease_id,
           ambiente, modelo, serie, numero, cnf, cdv, chave_acesso,
           tp_emis, dh_emi, dh_cont, x_just, profile_revision,
           input_snapshot_json, signed_xml, signed_xml_sha256, qr_code_text,
           state, protocolo, sefaz_cstat, sefaz_xmotivo, autorizado_em, processed_xml,
           created_at, updated_at
      FROM nfce_documents
     WHERE empresa_id = ? AND sale_id = ?
     LIMIT 1
  `).get(empresaId, saleId);
  return mapNfceDocumentRow(row);
}

function persistSignedNfceContingency(input = {}) {

  const db = getOfflineDatabase();

  const empresaId = requiredText(input.empresaId, 'empresaId');

  const saleId = requiredText(input.saleId, 'saleId');

  if (typeof input.signedXml !== 'string') {

    throw new Error('signedXml deve ser uma string UTF-8.');

  }

  const signedXmlText = input.signedXml;

  const signedXmlBuffer = Buffer.from(signedXmlText, 'utf8');

  if (signedXmlBuffer.length < 1 || signedXmlBuffer.length > 4 * 1024 * 1024) {

    signedXmlBuffer.fill(0);

    throw new Error('signedXml vazio ou acima do limite seguro.');

  }

  const signedXmlSha256 = createHash('sha256')

    .update(signedXmlBuffer)

    .digest('hex')

    .toUpperCase();

  const updatedAt = nowIso();



  db.exec('BEGIN IMMEDIATE;');

  try {

    const row = db.prepare(`

      SELECT fiscal_id, state, chave_acesso,

             signed_xml, signed_xml_sha256, qr_code_text

        FROM nfce_documents

       WHERE empresa_id = ? AND sale_id = ?

       LIMIT 1

    `).get(empresaId, saleId);



    if (!row) {

      throw new Error('Documento NFC-e não encontrado para persistir XML assinado.');

    }



    if (row.signed_xml != null || row.signed_xml_sha256 != null) {

      if (row.signed_xml == null || row.signed_xml_sha256 == null) {

        throw new Error('Documento NFC-e possui estado de integridade inválido para XML assinado.');

      }

      const existingBuffer = Buffer.from(row.signed_xml);

      try {

        const recomputed = createHash('sha256').update(existingBuffer).digest('hex').toUpperCase();

        const stored = String(row.signed_xml_sha256).trim().toUpperCase();

        if (!/^[0-9A-F]{64}$/.test(stored) || stored !== recomputed) {

          throw new Error('Hash do XML assinado persistido não confere; revisão manual necessária.');

        }

        if (String(row.state) !== 'CONTINGENCIA_PENDENTE') {

          throw new Error(`Documento já possui XML assinado em estado incompatível: ${String(row.state)}.`);

        }

        if (recomputed !== signedXmlSha256 || !existingBuffer.equals(signedXmlBuffer)) {

          throw new Error('Documento já possui outro XML assinado persistido; re-assinatura recusada.');

        }

        db.exec('COMMIT;');

        return {

          applied: false,

          duplicate: true,

          fiscalId: String(row.fiscal_id),

          state: 'CONTINGENCIA_PENDENTE',

          chaveAcesso: String(row.chave_acesso),

          signedXmlSha256: stored

        };

      } finally {

        existingBuffer.fill(0);

      }

    }



    if (String(row.state) !== 'ALLOCATED') {

      throw new Error(`Documento NFC-e não está ALLOCATED; recebido ${String(row.state)}.`);

    }

    if (row.qr_code_text != null) {

      throw new Error('Documento ALLOCATED já possui QR Code inesperado; revisão manual necessária.');

    }



    const result = db.prepare(`

      UPDATE nfce_documents

         SET signed_xml = ?,

             signed_xml_sha256 = ?,

             state = 'CONTINGENCIA_PENDENTE',

             updated_at = ?

       WHERE empresa_id = ?

         AND sale_id = ?

         AND state = 'ALLOCATED'

         AND signed_xml IS NULL

         AND signed_xml_sha256 IS NULL

    `).run(

      signedXmlBuffer,

      signedXmlSha256,

      updatedAt,

      empresaId,

      saleId

    );



    if (Number(result.changes || 0) !== 1) {

      throw new Error('Documento NFC-e mudou durante a persistência do XML assinado; operação cancelada.');

    }



    db.exec('COMMIT;');

    return {

      applied: true,

      duplicate: false,

      fiscalId: String(row.fiscal_id),

      state: 'CONTINGENCIA_PENDENTE',

      chaveAcesso: String(row.chave_acesso),

      signedXmlSha256

    };

  } catch (error) {

    try { db.exec('ROLLBACK;'); } catch (_) {}

    throw error;

  } finally {

    signedXmlBuffer.fill(0);

  }

}



function persistNfceQrCode(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const saleId = requiredText(input.saleId, 'saleId');
  const qrCodeText = requiredText(input.qrCodeText, 'qrCodeText');
  if (qrCodeText.length < 100 || qrCodeText.length > 600) {
    throw new Error('qrCodeText deve conter entre 100 e 600 caracteres.');
  }
  const updatedAt = nowIso();

  db.exec('BEGIN IMMEDIATE;');
  try {
    const row = db.prepare(`
      SELECT fiscal_id, state, chave_acesso, signed_xml, signed_xml_sha256, qr_code_text
        FROM nfce_documents
       WHERE empresa_id = ? AND sale_id = ?
       LIMIT 1
    `).get(empresaId, saleId);
    if (!row) throw new Error('Documento NFC-e não encontrado para persistir QR Code.');
    if (String(row.state) !== 'CONTINGENCIA_PENDENTE') {
      throw new Error(`Documento NFC-e deve estar CONTINGENCIA_PENDENTE; recebido ${String(row.state)}.`);
    }
    if (row.signed_xml == null || row.signed_xml_sha256 == null) {
      throw new Error('Documento NFC-e não possui XML assinado íntegro para gerar QR Code.');
    }
    const signedBuffer = Buffer.from(row.signed_xml);
    try {
      const recomputed = createHash('sha256').update(signedBuffer).digest('hex').toUpperCase();
      const stored = String(row.signed_xml_sha256).trim().toUpperCase();
      if (!/^[0-9A-F]{64}$/.test(stored) || stored !== recomputed) {
        throw new Error('Hash do XML assinado persistido não confere; revisão manual necessária.');
      }
    } finally {
      signedBuffer.fill(0);
    }

    if (row.qr_code_text != null) {
      const existing = String(row.qr_code_text);
      if (existing !== qrCodeText) {
        throw new Error('Documento já possui outro QR Code persistido; substituição recusada.');
      }
      db.exec('COMMIT;');
      return {
        applied: false,
        duplicate: true,
        fiscalId: String(row.fiscal_id),
        state: 'CONTINGENCIA_PENDENTE',
        chaveAcesso: String(row.chave_acesso),
        qrCodeText: existing
      };
    }

    const result = db.prepare(`
      UPDATE nfce_documents
         SET qr_code_text = ?, updated_at = ?
       WHERE empresa_id = ?
         AND sale_id = ?
         AND state = 'CONTINGENCIA_PENDENTE'
         AND qr_code_text IS NULL
    `).run(qrCodeText, updatedAt, empresaId, saleId);
    if (Number(result.changes || 0) !== 1) {
      throw new Error('Documento NFC-e mudou durante a persistência do QR Code; operação cancelada.');
    }
    db.exec('COMMIT;');
    return {
      applied: true,
      duplicate: false,
      fiscalId: String(row.fiscal_id),
      state: 'CONTINGENCIA_PENDENTE',
      chaveAcesso: String(row.chave_acesso),
      qrCodeText
    };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}


function applyCrediarioSettlementInTransaction(
  db,
  empresaId,
  settlement,
  paymentSnapshot,
  totalCentavos,
  saleId,
  occurredAt
) {
  if (!settlement || typeof settlement !== 'object') return null;

  const crediarioId = requiredText(settlement.crediarioId, 'crediarioSettlement.crediarioId');
  const baseSituacaoVersao = Number(settlement.baseSituacaoVersao);
  if (!Number.isSafeInteger(baseSituacaoVersao) || baseSituacaoVersao < 0) {
    throw new Error('Versão base do crediário é inválida.');
  }

  const itemIds = [...new Set(
    (Array.isArray(settlement.itemIds) ? settlement.itemIds : [])
      .map((value) => optionalText(value))
      .filter(Boolean)
  )];
  if (!itemIds.length) {
    throw new Error('A liquidação do crediário não possui itens selecionados.');
  }

  const row = db.prepare(`
    SELECT *
      FROM crediarios_cache
     WHERE empresa_id = ?
       AND crediario_id = ?
     LIMIT 1
  `).get(empresaId, crediarioId);

  if (!row) throw new Error('Crediário não encontrado no cache local para liquidação.');
  if (Number(row.pago) === 1 || Number(row.cancelado) === 1) {
    throw new Error('O crediário não está aberto para liquidação.');
  }
  if (Number(row.situacao_versao || 0) !== baseSituacaoVersao) {
    throw new Error(
      'O crediário mudou desde a abertura do detalhe. Reabra a conta antes de pagar.'
    );
  }

  const payload = parseJsonText(row.payload_json) || {};
  const items = (Array.isArray(payload.itens) ? payload.itens : [])
    .map(normalizeCrediarioDetailItem);
  const openById = new Map(
    items
      .filter(crediarioItemIsOpen)
      .map((item) => [String(item.crediarioItemId), item])
  );

  const selected = itemIds.map((itemId) => {
    const item = openById.get(itemId);
    if (!item) {
      throw new Error('Um item selecionado para pagamento não está mais aberto no crediário.');
    }
    return item;
  });

  const selectedTotalCentavos = selected.reduce(
    (sum, item) => sum + decimalMoneyToCents(item.totalValue, 'total do item do crediário'),
    0
  );
  if (selectedTotalCentavos !== totalCentavos) {
    throw new Error(
      'O valor do pagamento não corresponde aos itens selecionados do crediário.'
    );
  }

  const paymentMethod = optionalText(paymentSnapshot.paymentMethod);
  const selectedIds = new Set(itemIds);
  const updatedItems = items.map((item) => {
    if (!selectedIds.has(String(item.crediarioItemId || ''))) return item;
    return {
      ...item,
      pago: true,
      pagoEm: occurredAt,
      formaPagamento: paymentMethod,
      fiscalSaleId: saleId,
      fiscalStatus: 'CONTINGENCIA_PENDENTE',
      liquidacaoId: saleId,
      sourceUpdatedAt: occurredAt
    };
  });

  const remainingOpen = updatedItems.filter(crediarioItemIsOpen);
  const saldoReceberCentavos = remainingOpen.reduce(
    (sum, item) => sum + decimalMoneyToCents(item.totalValue, 'saldo do crediário'),
    0
  );
  const valorRecebidoAnterior = Number(row.valor_recebido_centavos || 0);
  const valorRecebidoCentavos = valorRecebidoAnterior + totalCentavos;
  const valorOriginalCentavos = valorRecebidoCentavos + saldoReceberCentavos;
  const pago = saldoReceberCentavos === 0;
  const novaSituacaoVersao = baseSituacaoVersao + 1;

  const updatedPayload = {
    ...payload,
    valor: saldoReceberCentavos / 100,
    valorOriginal: valorOriginalCentavos / 100,
    valorRecebido: valorRecebidoCentavos / 100,
    saldoReceber: saldoReceberCentavos / 100,
    status: pago ? 'RECEBIDO' : 'A_RECEBER',
    pago,
    pagoEm: pago ? occurredAt : null,
    formaPagamento: paymentMethod,
    situacaoVersao: novaSituacaoVersao,
    itens: updatedItems
  };

  const result = db.prepare(`
    UPDATE crediarios_cache
       SET valor_centavos = ?,
           valor_original_centavos = ?,
           valor_recebido_centavos = ?,
           saldo_receber_centavos = ?,
           status = ?,
           pago = ?,
           pago_em = ?,
           forma_pagamento = ?,
           situacao_versao = ?,
           cached_at = ?,
           payload_json = ?
     WHERE empresa_id = ?
       AND crediario_id = ?
       AND situacao_versao = ?
       AND pago = 0
       AND cancelado = 0
  `).run(
    saldoReceberCentavos,
    valorOriginalCentavos,
    valorRecebidoCentavos,
    saldoReceberCentavos,
    pago ? 'RECEBIDO' : 'A_RECEBER',
    pago ? 1 : 0,
    pago ? occurredAt : null,
    paymentMethod,
    novaSituacaoVersao,
    occurredAt,
    jsonText(updatedPayload),
    empresaId,
    crediarioId,
    baseSituacaoVersao
  );

  if (Number(result.changes || 0) !== 1) {
    throw new Error('O crediário mudou durante a liquidação local; operação cancelada.');
  }

  return {
    crediarioId,
    itemIds,
    baseSituacaoVersao,
    novaSituacaoVersao,
    valorPagoCentavos: totalCentavos,
    valorRecebidoCentavos,
    saldoReceberCentavos,
    pago
  };
}

function registerOfflineSaleAtomic(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const saleId = requiredText(input.saleId, 'saleId');
  const operationId = requiredText(input.operationId, 'operationId');
  const dependencies = normalizeOutboxDependencies(input.dependencies, operationId);
  const clienteId = optionalText(input.clienteId);
  const status = optionalText(input.status) || 'PAID';
  const occurredAt = optionalText(input.occurredAt) || nowIso();
  const createdAt = nowIso();
  const items = Array.isArray(input.items) ? input.items : [];
  const cashMovements = normalizeSaleCashMovements(input, empresaId, saleId, occurredAt);
  const financialMovements = normalizeSaleFinancialMovements(input, empresaId, saleId, occurredAt);
  const paymentSnapshot = normalizeSalePaymentSnapshot(input);
  const salePayloadBase = input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
    ? input.payload
    : {};
  const salePayload = {
    ...salePayloadBase,
    ...paymentSnapshot
  };
  const fiscalAllocation = normalizeFiscalAllocationInput(
    input.fiscalAllocation,
    saleId,
    operationId
  );
  const crediarioSettlement =
    input.crediarioSettlement &&
    typeof input.crediarioSettlement === 'object' &&
    !Array.isArray(input.crediarioSettlement)
      ? { ...input.crediarioSettlement }
      : null;
  const skipStockMovements =
    input.skipStockMovements === true ||
    Boolean(crediarioSettlement);

  if (!items.length) {
    throw new Error('A venda offline precisa ter pelo menos um item.');
  }

  const normalizedItems = items.map((item, index) => {
    const itemId = requiredText(item && item.itemId, `items[${index}].itemId`);
    const produtoId = requiredText(item && item.produtoId, `items[${index}].produtoId`);
    const quantityMicrounits = decimalToMicrounits(item && item.quantidade, `items[${index}].quantidade`);
    const unitPriceCentavos = moneyCents(item && item.unitPriceCentavos, `items[${index}].unitPriceCentavos`);
    const totalCentavos = item && item.totalCentavos != null
      ? moneyCents(item.totalCentavos, `items[${index}].totalCentavos`)
      : Number((BigInt(quantityMicrounits) * BigInt(unitPriceCentavos)) / BigInt(STOCK_QUANTITY_SCALE));
    return {
      itemId,
      produtoId,
      quantityMicrounits,
      unitPriceCentavos,
      totalCentavos,
      payload: item && item.payload
    };
  });

  const duplicateItemIds = new Set();
  for (const item of normalizedItems) {
    if (duplicateItemIds.has(item.itemId)) {
      throw new Error(`itemId duplicado na venda: ${item.itemId}`);
    }
    duplicateItemIds.add(item.itemId);
  }

  const calculatedTotal = normalizedItems.reduce((sum, item) => sum + item.totalCentavos, 0);
  if (!Number.isSafeInteger(calculatedTotal)) {
    throw new Error('Total da venda excede o limite de inteiro seguro.');
  }
  const totalCentavos = input.totalCentavos == null
    ? calculatedTotal
    : moneyCents(input.totalCentavos, 'totalCentavos');
  if (totalCentavos !== calculatedTotal) {
    throw new Error(`totalCentavos (${totalCentavos}) difere da soma dos itens (${calculatedTotal}).`);
  }

  const existingBySale = db.prepare(`
    SELECT sale_id, operation_id FROM sales
     WHERE empresa_id = ? AND sale_id = ?
  `).get(empresaId, saleId);
  if (existingBySale) {
    if (String(existingBySale.operation_id) !== operationId) {
      throw new Error(`saleId ${saleId} já existe com outro operationId.`);
    }
    const existingFiscal = getNfceDocumentBySaleId(empresaId, saleId);
    if (fiscalAllocation && !existingFiscal) {
      throw new Error('Venda já existe sem alocação fiscal atômica; revisão manual necessária.');
    }
    return { applied: false, duplicate: true, sale: getSaleById(empresaId, saleId), fiscal: existingFiscal };
  }

  const existingByOperation = db.prepare(`
    SELECT sale_id FROM sales
     WHERE empresa_id = ? AND operation_id = ?
  `).get(empresaId, operationId);
  if (existingByOperation) {
    if (String(existingByOperation.sale_id) !== saleId) {
      throw new Error(`operationId ${operationId} já pertence à venda ${existingByOperation.sale_id}.`);
    }
    const existingFiscal = getNfceDocumentBySaleId(empresaId, saleId);
    if (fiscalAllocation && !existingFiscal) {
      throw new Error('Venda já existe sem alocação fiscal atômica; revisão manual necessária.');
    }
    return { applied: false, duplicate: true, sale: getSaleById(empresaId, saleId), fiscal: existingFiscal };
  }

  let crediarioSettlementResult = null;

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(`
      INSERT INTO sales (
        empresa_id, sale_id, operation_id, cliente_id, status,
        total_centavos, occurred_at, created_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      empresaId,
      saleId,
      operationId,
      clienteId,
      status,
      totalCentavos,
      occurredAt,
      createdAt,
      jsonText(salePayload)
    );

    let allocatedFiscal = null;
    if (fiscalAllocation) {
      const lease = db.prepare(`
        SELECT * FROM fiscal_number_leases
         WHERE empresa_id = ? AND lease_id = ?
         LIMIT 1
      `).get(empresaId, fiscalAllocation.leaseId);
      if (!lease) throw new Error('Contador fiscal local não encontrado para a venda.');
      if (String(lease.device_id) !== fiscalAllocation.deviceId) {
        throw new Error('Contador fiscal local pertence a outro dispositivo.');
      }
      const leaseAmbiente = normalizeFiscalEnvironment(lease.ambiente);
      if (
        String(lease.status) !== 'ACTIVE' ||
        !leaseAmbiente ||
        Number(lease.modelo) !== 65
      ) {
        throw new Error('Contador fiscal local não está ativo para NFC-e no ambiente informado.');
      }
      if (
        lease.expira_em &&
        !Number.isNaN(Date.parse(String(lease.expira_em))) &&
        Date.parse(String(lease.expira_em)) <= Date.now()
      ) {
        throw new Error('Contador fiscal local está expirado.');
      }

      const numero = Number(lease.proximo_numero);
      const numeroFinal = Number(lease.numero_final);
      if (!Number.isSafeInteger(numero) || numero < 1 || numero > numeroFinal) {
        throw new Error('Contador fiscal local sem numeração disponível.');
      }

      const profile = db.prepare(`
        SELECT * FROM fiscal_profile_cache
         WHERE empresa_id = ?
         LIMIT 1
      `).get(empresaId);
      if (!profile) throw new Error('Perfil fiscal não encontrado para alocação NFC-e.');
      const profileAmbiente = normalizeFiscalEnvironment(profile.ambiente);
      if (!profileAmbiente || profileAmbiente !== leaseAmbiente) {
        throw new Error('Ambiente do perfil fiscal diverge do contador local.');
      }
      if (String(profile.serie_nfce) !== String(lease.serie)) {
        throw new Error('Série do perfil fiscal diverge do contador local.');
      }

      const dhEmi = occurredAt;
      const dhCont = occurredAt;
      const cnf = deterministicFiscalCnf({
        empresaId,
        saleId,
        operationId,
        leaseId: fiscalAllocation.leaseId,
        numero
      });
      const key = buildNfceAccessKey({
        uf: profile.uf,
        cnpj: profile.cnpj,
        dhEmi,
        modelo: 65,
        serie: lease.serie,
        numero,
        tpEmis: 9,
        cnf
      });

      const customerSnapshot = clienteId
        ? db.prepare(`
            SELECT cliente_id, nome, documento, telefone, email,
                   revision, source_updated_at, payload_json
              FROM customers_cache
             WHERE empresa_id = ? AND cliente_id = ?
             LIMIT 1
          `).get(empresaId, clienteId)
        : null;

      const fiscalSnapshot = {
        schemaVersion: 1,
        sale: {
          saleId,
          operationId,
          clienteId,
          status,
          totalCentavos,
          occurredAt,
          payload: salePayload
        },
        issuer: {
          cnpj: String(profile.cnpj),
          inscricaoEstadual: String(profile.inscricao_estadual),
          razaoSocial: String(profile.razao_social),
          nomeFantasia: profile.nome_fantasia == null ? null : String(profile.nome_fantasia),
          cep: profile.cep == null ? null : String(profile.cep),
          logradouro: String(profile.logradouro),
          numero: String(profile.numero),
          complemento: profile.complemento == null ? null : String(profile.complemento),
          bairro: String(profile.bairro),
          municipio: String(profile.municipio),
          codigoMunicipio: String(profile.codigo_municipio),
          uf: String(profile.uf),
          crt: String(profile.crt),
          regimeTributario: profile.regime_tributario == null ? null : String(profile.regime_tributario),
          urlQrCode: String(profile.url_qr_code),
          urlConsultaChave: String(profile.url_consulta_chave),
          revision: String(profile.revision)
        },
        customer: customerSnapshot
          ? {
              clienteId: String(customerSnapshot.cliente_id),
              nome: String(customerSnapshot.nome),
              documento: customerSnapshot.documento == null ? null : String(customerSnapshot.documento),
              telefone: customerSnapshot.telefone == null ? null : String(customerSnapshot.telefone),
              email: customerSnapshot.email == null ? null : String(customerSnapshot.email),
              revision: customerSnapshot.revision == null ? null : String(customerSnapshot.revision),
              sourceUpdatedAt: customerSnapshot.source_updated_at == null ? null : String(customerSnapshot.source_updated_at),
              payload: parseJsonText(customerSnapshot.payload_json)
            }
          : null,
        items: normalizedItems.map((item) => ({
          itemId: item.itemId,
          produtoId: item.produtoId,
          quantidade: microunitsToDecimalString(item.quantityMicrounits),
          unitPriceCentavos: item.unitPriceCentavos,
          totalCentavos: item.totalCentavos,
          payload: item.payload == null ? {} : item.payload
        })),
        payment: paymentSnapshot,
        fiscalIdentity: {
          ambiente: leaseAmbiente,
          modelo: 65,
          serie: String(lease.serie),
          numero,
          cnf,
          cdv: key.cdv,
          chaveAcesso: key.chaveAcesso,
          tpEmis: 9,
          dhEmi,
          dhCont,
          xJust: fiscalAllocation.xJust
        }
      };

      db.prepare(`
        INSERT INTO nfce_documents (
          empresa_id, fiscal_id, sale_id, operation_id, lease_id,
          ambiente, modelo, serie, numero, cnf, cdv, chave_acesso,
          tp_emis, dh_emi, dh_cont, x_just, profile_revision,
          input_snapshot_json, state, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 65, ?, ?, ?, ?, ?, 9, ?, ?, ?, ?, ?, 'ALLOCATED', ?, ?)
      `).run(
        empresaId,
        fiscalAllocation.fiscalId,
        saleId,
        fiscalAllocation.fiscalOperationId,
        fiscalAllocation.leaseId,
        leaseAmbiente,
        String(lease.serie),
        numero,
        cnf,
        key.cdv,
        key.chaveAcesso,
        dhEmi,
        dhCont,
        fiscalAllocation.xJust,
        String(profile.revision),
        JSON.stringify(fiscalSnapshot),
        createdAt,
        createdAt
      );

      const nextNumber = numero + 1;
      const nextStatus = nextNumber > numeroFinal ? 'EXHAUSTED' : 'ACTIVE';
      const consumed = db.prepare(`
        UPDATE fiscal_number_leases
           SET proximo_numero = ?, status = ?, updated_at = ?
         WHERE empresa_id = ?
           AND lease_id = ?
           AND status = 'ACTIVE'
           AND proximo_numero = ?
      `).run(
        nextNumber,
        nextStatus,
        createdAt,
        empresaId,
        fiscalAllocation.leaseId,
        numero
      );
      if (Number(consumed.changes || 0) !== 1) {
        throw new Error('Contador fiscal mudou durante a criação do documento; operação cancelada.');
      }

      allocatedFiscal = {
        fiscalId: fiscalAllocation.fiscalId,
        state: 'ALLOCATED',
        leaseId: fiscalAllocation.leaseId,
        ambiente: leaseAmbiente,
        modelo: 65,
        serie: String(lease.serie),
        numero,
        cnf,
        cdv: key.cdv,
        chaveAcesso: key.chaveAcesso,
        dhEmi,
        dhCont
      };
    }

    for (const item of normalizedItems) {
      db.prepare(`
        INSERT INTO sale_items (
          empresa_id, sale_id, item_id, produto_id, quantity_microunits,
          unit_price_centavos, total_centavos, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        empresaId,
        saleId,
        item.itemId,
        item.produtoId,
        item.quantityMicrounits,
        item.unitPriceCentavos,
        item.totalCentavos,
        jsonText(item.payload)
      );

      if (!skipStockMovements) {
        const stockOperationId = `${operationId}:stock:${item.itemId}`;
        const stockMovementId = `${saleId}:stock:${item.itemId}`;
        db.prepare(`
          INSERT INTO stock_movements (
            empresa_id, movement_id, operation_id, produto_id, direction,
            quantity_microunits, movement_type, source_id, occurred_at,
            created_at, payload_json
          ) VALUES (?, ?, ?, ?, -1, ?, 'VENDA_OFFLINE', ?, ?, ?, ?)
        `).run(
          empresaId,
          stockMovementId,
          stockOperationId,
          item.produtoId,
          item.quantityMicrounits,
          saleId,
          occurredAt,
          createdAt,
          jsonText({ saleId, itemId: item.itemId })
        );

        db.prepare(`
          INSERT INTO stock_projection (
            empresa_id, produto_id, quantity_microunits, updated_at
          ) VALUES (?, ?, ?, ?)
          ON CONFLICT(empresa_id, produto_id) DO UPDATE SET
            quantity_microunits = stock_projection.quantity_microunits + excluded.quantity_microunits,
            updated_at = excluded.updated_at
        `).run(empresaId, item.produtoId, -item.quantityMicrounits, createdAt);
      }
    }


    for (const movement of cashMovements) {
      const cashSession = db.prepare(`
        SELECT status FROM cash_sessions
         WHERE empresa_id = ? AND session_id = ?
      `).get(empresaId, movement.sessionId);
      if (!cashSession || String(cashSession.status) !== 'OPEN') {
        throw new Error(`Caixa ${movement.sessionId} não está aberto para a empresa.`);
      }

      db.prepare(`
        INSERT INTO cash_movements (
          empresa_id, movement_id, operation_id, session_id, direction,
          amount_centavos, movement_type, source_id, occurred_at, created_at, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        empresaId,
        movement.movementId,
        movement.operationId,
        movement.sessionId,
        movement.direction,
        movement.amountCentavos,
        movement.movementType,
        movement.sourceId,
        movement.occurredAt,
        createdAt,
        jsonText(movement.payload)
      );
    }

    for (const movement of financialMovements) {
      db.prepare(`
        INSERT INTO financial_movements (
          empresa_id, movement_id, operation_id, account_id, direction,
          amount_centavos, movement_type, source_id, occurred_at, created_at, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        empresaId,
        movement.movementId,
        movement.operationId,
        movement.accountId,
        movement.direction,
        movement.amountCentavos,
        movement.movementType,
        movement.sourceId,
        movement.occurredAt,
        createdAt,
        jsonText(movement.payload)
      );
    }

    if (crediarioSettlement) {
      crediarioSettlementResult = applyCrediarioSettlementInTransaction(
        db,
        empresaId,
        crediarioSettlement,
        paymentSnapshot,
        totalCentavos,
        saleId,
        occurredAt
      );
    }

    const outboxPayload = {
      saleId,
      clienteId,
      status,
      totalCentavos,
      occurredAt,
      paymentMethod: paymentSnapshot.paymentMethod,
      paymentParts: paymentSnapshot.paymentParts,
      paymentSplit: paymentSnapshot.paymentSplit,
      paymentPartsCount: paymentSnapshot.paymentPartsCount,
      paymentMethodsCount: paymentSnapshot.paymentMethodsCount,
      paymentTotalValue: paymentSnapshot.paymentTotalValue,
      skipStockMovements,
      crediarioSettlement:
        crediarioSettlementResult == null
          ? null
          : { ...crediarioSettlementResult },
      items: normalizedItems.map((item) => ({
        itemId: item.itemId,
        produtoId: item.produtoId,
        quantidade: microunitsToDecimalString(item.quantityMicrounits),
        unitPriceCentavos: item.unitPriceCentavos,
        totalCentavos: item.totalCentavos,
        payload: item.payload == null ? {} : item.payload
      })),
      cashMovements: cashMovements.map((movement) => ({
        movementId: movement.movementId,
        operationId: movement.operationId,
        sessionId: movement.sessionId,
        direction: movement.direction,
        amountCentavos: movement.amountCentavos,
        movementType: movement.movementType,
        sourceId: movement.sourceId,
        occurredAt: movement.occurredAt,
        payload: movement.payload == null ? {} : movement.payload
      })),
      /*
       * VENDA_PAGA permanece no livro financeiro LOCAL para compor os
       * totais do caixa, mas não deve ser enviada ao extrato financeiro
       * remoto no SALE_PAID. O servidor recebe somente movimentos que
       * realmente pertencem ao FINANCEIRO (ex.: CREDIARIO_RECEBIMENTO).
       */
      financialMovements:
        financialMovements
          .filter(
            (movement) =>
              String(
                movement &&
                movement.movementType ||
                ''
              )
                .trim()
                .toUpperCase() !==
                  'VENDA_PAGA'
          )
          .map((movement) => ({
            movementId: movement.movementId,
            operationId: movement.operationId,
            accountId: movement.accountId,
            direction: movement.direction,
            amountCentavos: movement.amountCentavos,
            movementType: movement.movementType,
            sourceId: movement.sourceId,
            occurredAt: movement.occurredAt,
            payload: movement.payload == null ? {} : movement.payload
          })),
      payload: salePayload
    };

    db.prepare(`
      INSERT INTO sync_outbox (
        empresa_id, operation_id, type, entity_id, payload_json, status,
        attempts, dependencies_json, created_at, updated_at, last_error
      ) VALUES (?, ?, 'SALE_PAID', ?, ?, 'PENDING', 0, ?, ?, ?, NULL)
    `).run(
      empresaId,
      operationId,
      saleId,
      JSON.stringify(outboxPayload),
      JSON.stringify(dependencies),
      createdAt,
      createdAt
    );

    db.exec('COMMIT;');
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }

  return {
    applied: true,
    duplicate: false,
    sale: getSaleById(empresaId, saleId),
    outbox: getOutboxOperation(empresaId, operationId),
    fiscal: getNfceDocumentBySaleId(empresaId, saleId),
    crediarioSettlement: crediarioSettlementResult
  };
}


function mapFiscalOutboxRow(row) {
  if (!row) return null;
  return {
    empresaId: String(row.empresa_id),
    fiscalId: String(row.fiscal_id),
    operationId: String(row.operation_id),
    action: String(row.action),
    status: String(row.status),
    attempts: Number(row.attempts),
    payload: parseJsonText(row.payload_json) || {},
    nextAttemptAt: row.next_attempt_at == null ? null : String(row.next_attempt_at),
    sendingStartedAt: row.sending_started_at == null ? null : String(row.sending_started_at),
    confirmedAt: row.confirmed_at == null ? null : String(row.confirmed_at),
    lastError: row.last_error == null ? null : String(row.last_error),
    remoteAck: parseJsonText(row.remote_ack_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function getNfceDocumentByFiscalId(empresaIdValue, fiscalIdValue) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const fiscalId = requiredText(fiscalIdValue, 'fiscalId');
  const row = db.prepare(`
    SELECT empresa_id, fiscal_id, sale_id, operation_id, lease_id,
           ambiente, modelo, serie, numero, cnf, cdv, chave_acesso,
           tp_emis, dh_emi, dh_cont, x_just, profile_revision,
           input_snapshot_json, signed_xml, signed_xml_sha256, qr_code_text,
           state, protocolo, sefaz_cstat, sefaz_xmotivo, autorizado_em,
           processed_xml, created_at, updated_at
      FROM nfce_documents
     WHERE empresa_id = ? AND fiscal_id = ?
     LIMIT 1
  `).get(empresaId, fiscalId);
  return mapNfceDocumentRow(row);
}

function getFiscalOutboxByFiscalId(empresaIdValue, fiscalIdValue) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const fiscalId = requiredText(fiscalIdValue, 'fiscalId');
  return mapFiscalOutboxRow(db.prepare(`
    SELECT * FROM fiscal_outbox
     WHERE empresa_id = ? AND fiscal_id = ?
     LIMIT 1
  `).get(empresaId, fiscalId));
}

function ensureFiscalOutboxForPendingNfce(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const saleId = requiredText(input.saleId, 'saleId');
  const createdAt = optionalText(input.createdAt) || nowIso();

  db.exec('BEGIN IMMEDIATE;');
  try {
    const doc = db.prepare(`
      SELECT fiscal_id, sale_id, chave_acesso, state,
             signed_xml, signed_xml_sha256, qr_code_text
        FROM nfce_documents
       WHERE empresa_id = ? AND sale_id = ?
       LIMIT 1
    `).get(empresaId, saleId);
    if (!doc) throw new Error('Documento NFC-e não encontrado para fiscal outbox.');
    if (String(doc.state) !== 'CONTINGENCIA_PENDENTE') {
      throw new Error(`Fiscal outbox exige CONTINGENCIA_PENDENTE; recebido ${String(doc.state)}.`);
    }
    if (doc.signed_xml == null || doc.signed_xml_sha256 == null || doc.qr_code_text == null) {
      throw new Error('Documento fiscal ainda não possui XML assinado + hash + QR persistidos.');
    }
    const xmlBuffer = Buffer.from(doc.signed_xml);
    try {
      const recomputed = createHash('sha256').update(xmlBuffer).digest('hex').toUpperCase();
      const stored = String(doc.signed_xml_sha256).trim().toUpperCase();
      if (!/^[0-9A-F]{64}$/.test(stored) || stored !== recomputed) {
        throw new Error('Hash do signed_xml diverge antes de criar fiscal outbox.');
      }
    } finally {
      xmlBuffer.fill(0);
    }

    const fiscalId = String(doc.fiscal_id);
    const operationId = `nfce-transmit:${fiscalId}`;
    const payload = {
      schemaVersion: 1,
      saleId: String(doc.sale_id),
      chaveAcesso: String(doc.chave_acesso),
      signedXmlSha256: String(doc.signed_xml_sha256).toUpperCase()
    };
    db.prepare(`
      INSERT INTO fiscal_outbox (
        empresa_id, fiscal_id, operation_id, action, status, attempts,
        payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, 'TRANSMIT', 'PENDING', 0, ?, ?, ?)
      ON CONFLICT(empresa_id, fiscal_id) DO NOTHING
    `).run(empresaId, fiscalId, operationId, JSON.stringify(payload), createdAt, createdAt);

    const existing = db.prepare(`SELECT * FROM fiscal_outbox WHERE empresa_id = ? AND fiscal_id = ? LIMIT 1`)
      .get(empresaId, fiscalId);
    if (!existing) throw new Error('Fiscal outbox não pôde ser criado.');
    if (String(existing.operation_id) !== operationId) {
      throw new Error('Fiscal outbox existente usa operationId incompatível.');
    }
    db.exec('COMMIT;');
    return mapFiscalOutboxRow(existing);
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

function listFiscalOutboxReady(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const now = optionalText(input.now) || nowIso();
  const limitValue = Number(input.limit == null ? 20 : input.limit);
  const limit = Number.isSafeInteger(limitValue) && limitValue > 0 ? Math.min(limitValue, 100) : 20;
  return db.prepare(`
    SELECT * FROM fiscal_outbox
     WHERE empresa_id = ?
       AND status IN ('PENDING', 'RETRY')
       AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
     ORDER BY created_at ASC, fiscal_id ASC
     LIMIT ?
  `).all(empresaId, now, limit).map(mapFiscalOutboxRow);
}

function claimFiscalOutboxOperation(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const fiscalId = requiredText(input.fiscalId, 'fiscalId');
  const finalXmlSha256 = requiredText(input.finalXmlSha256, 'finalXmlSha256').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(finalXmlSha256)) {
    throw new Error('finalXmlSha256 inválido para claim fiscal.');
  }
  const now = optionalText(input.now) || nowIso();
  db.exec('BEGIN IMMEDIATE;');
  try {
    const row = db.prepare(`SELECT * FROM fiscal_outbox WHERE empresa_id = ? AND fiscal_id = ? LIMIT 1`)
      .get(empresaId, fiscalId);
    if (!row) throw new Error('Fiscal outbox não encontrado para claim.');
    if (!['PENDING', 'RETRY'].includes(String(row.status)) || (row.next_attempt_at && String(row.next_attempt_at) > now)) {
      db.exec('COMMIT;');
      return { claimed: false, operation: mapFiscalOutboxRow(row) };
    }
    const rawPayload = parseJsonText(row.payload_json);
    const payload = rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
      ? { ...rawPayload }
      : {};
    const pinnedHash = String(payload.finalXmlSha256 || '').trim().toUpperCase();
    if (pinnedHash && pinnedHash !== finalXmlSha256) {
      throw new Error('Hash do XML final diverge do hash fixado na primeira tentativa fiscal.');
    }
    if (!pinnedHash) {
      payload.finalXmlSha256 = finalXmlSha256;
      payload.finalXmlPinnedAt = now;
    }
    const doc = db.prepare(`SELECT state FROM nfce_documents WHERE empresa_id = ? AND fiscal_id = ? LIMIT 1`)
      .get(empresaId, fiscalId);
    if (!doc) throw new Error('Documento fiscal do outbox não encontrado.');
    const action = String(row.action);
    const expectedState = action === 'TRANSMIT' ? 'CONTINGENCIA_PENDENTE' : 'RECONCILE_BY_KEY';
    if (String(doc.state) !== expectedState) {
      throw new Error(`Documento fiscal em estado ${String(doc.state)} incompatível com ação ${action}.`);
    }
    const updated = db.prepare(`
      UPDATE fiscal_outbox
         SET status='SENDING', attempts=attempts+1, sending_started_at=?,
             next_attempt_at=NULL, last_error=NULL, payload_json=?, updated_at=?
       WHERE empresa_id=? AND fiscal_id=? AND status IN ('PENDING','RETRY')
    `).run(now, JSON.stringify(payload), now, empresaId, fiscalId);
    if (Number(updated.changes || 0) !== 1) throw new Error('Fiscal outbox mudou durante o claim.');
    if (action === 'TRANSMIT') {
      db.prepare(`UPDATE nfce_documents SET state='SENDING', updated_at=? WHERE empresa_id=? AND fiscal_id=? AND state='CONTINGENCIA_PENDENTE'`)
        .run(now, empresaId, fiscalId);
    }
    db.exec('COMMIT;');
    return { claimed: true, operation: getFiscalOutboxByFiscalId(empresaId, fiscalId) };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

function transitionFiscalOutboxSending(input, options = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const fiscalId = requiredText(input.fiscalId, 'fiscalId');
  const now = optionalText(input.now) || nowIso();
  const outboxStatus = requiredText(options.outboxStatus, 'outboxStatus');
  const action = requiredText(options.action, 'action');
  const docState = requiredText(options.docState, 'docState');
  const nextAttemptAt = options.nextAttemptAt == null ? null : String(options.nextAttemptAt);
  const lastError = options.lastError == null ? null : String(options.lastError).slice(0, 2000);
  const confirmedAt = options.confirmedAt == null ? null : String(options.confirmedAt);
  const remoteAck = options.remoteAck == null ? null : JSON.stringify(options.remoteAck);
  db.exec('BEGIN IMMEDIATE;');
  try {
    const row = db.prepare(`SELECT action,status FROM fiscal_outbox WHERE empresa_id=? AND fiscal_id=? LIMIT 1`)
      .get(empresaId, fiscalId);
    if (!row || String(row.status) !== 'SENDING') throw new Error('Fiscal outbox não está SENDING.');
    db.prepare(`
      UPDATE fiscal_outbox
         SET action=?, status=?, next_attempt_at=?, sending_started_at=NULL,
             confirmed_at=?, last_error=?, remote_ack_json=?, updated_at=?
       WHERE empresa_id=? AND fiscal_id=? AND status='SENDING'
    `).run(action, outboxStatus, nextAttemptAt, confirmedAt, lastError, remoteAck, now, empresaId, fiscalId);
    db.prepare(`UPDATE nfce_documents SET state=?, updated_at=? WHERE empresa_id=? AND fiscal_id=?`)
      .run(docState, now, empresaId, fiscalId);
    db.exec('COMMIT;');
    return getFiscalOutboxByFiscalId(empresaId, fiscalId);
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

function markFiscalOutboxRetry(input = {}) {
  const action = input.action === 'RECONCILE_BY_KEY' ? 'RECONCILE_BY_KEY' : 'TRANSMIT';
  return transitionFiscalOutboxSending(input, {
    outboxStatus: 'RETRY',
    action,
    docState: action === 'TRANSMIT' ? 'CONTINGENCIA_PENDENTE' : 'RECONCILE_BY_KEY',
    nextAttemptAt: requiredText(input.nextAttemptAt, 'nextAttemptAt'),
    lastError: optionalText(input.error) || 'Falha temporária fiscal.'
  });
}

function markFiscalOutboxAmbiguous(input = {}) {
  return transitionFiscalOutboxSending(input, {
    outboxStatus: 'RETRY',
    action: 'RECONCILE_BY_KEY',
    docState: 'RECONCILE_BY_KEY',
    nextAttemptAt: requiredText(input.nextAttemptAt, 'nextAttemptAt'),
    lastError: optionalText(input.error) || 'Resultado de transmissão ambíguo; reconciliar pela chave.'
  });
}

function markFiscalOutboxSafeRetransmit(input = {}) {
  return transitionFiscalOutboxSending(input, {
    outboxStatus: 'RETRY',
    action: 'TRANSMIT',
    docState: 'CONTINGENCIA_PENDENTE',
    nextAttemptAt: requiredText(input.nextAttemptAt, 'nextAttemptAt'),
    lastError: optionalText(input.error) || 'Reconciliação confirmou ausência segura; retransmitir o mesmo XML.'
  });
}

function markFiscalOutboxAuthorized(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const fiscalId = requiredText(input.fiscalId, 'fiscalId');
  const protocolo = requiredText(input.protocolo, 'protocolo');
  const cStat = requiredText(input.cStat, 'cStat');
  const xMotivo = requiredText(input.xMotivo, 'xMotivo');
  const autorizadoEm = requiredText(input.autorizadoEm, 'autorizadoEm');
  if (typeof input.processedXml !== 'string' || !input.processedXml.trim()) throw new Error('processedXml autorizado é obrigatório.');
  const processed = Buffer.from(input.processedXml, 'utf8');
  const now = optionalText(input.now) || nowIso();
  db.exec('BEGIN IMMEDIATE;');
  try {
    const row = db.prepare(`SELECT status FROM fiscal_outbox WHERE empresa_id=? AND fiscal_id=? LIMIT 1`).get(empresaId,fiscalId);
    if (!row || String(row.status) !== 'SENDING') throw new Error('Fiscal outbox não está SENDING para autorização.');
    db.prepare(`
      UPDATE nfce_documents
         SET state='AUTHORIZED', protocolo=?, sefaz_cstat=?, sefaz_xmotivo=?, autorizado_em=?, processed_xml=?, updated_at=?
       WHERE empresa_id=? AND fiscal_id=?
    `).run(protocolo,cStat,xMotivo,autorizadoEm,processed,now,empresaId,fiscalId);
    db.prepare(`
      UPDATE fiscal_outbox
         SET status='CONFIRMED', sending_started_at=NULL, next_attempt_at=NULL,
             confirmed_at=?, last_error=NULL, remote_ack_json=?, updated_at=?
       WHERE empresa_id=? AND fiscal_id=? AND status='SENDING'
    `).run(now, JSON.stringify({ kind:'AUTHORIZED', cStat, xMotivo, protocolo, autorizadoEm }), now, empresaId, fiscalId);
    db.exec('COMMIT;');
    return getFiscalOutboxByFiscalId(empresaId, fiscalId);
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  } finally { processed.fill(0); }
}

function markFiscalOutboxRejected(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const fiscalId = requiredText(input.fiscalId, 'fiscalId');
  const cStat = requiredText(input.cStat, 'cStat');
  const xMotivo = requiredText(input.xMotivo, 'xMotivo');
  const now = optionalText(input.now) || nowIso();
  db.exec('BEGIN IMMEDIATE;');
  try {
    const row = db.prepare(`SELECT status FROM fiscal_outbox WHERE empresa_id=? AND fiscal_id=? LIMIT 1`).get(empresaId,fiscalId);
    if (!row || String(row.status) !== 'SENDING') throw new Error('Fiscal outbox não está SENDING para rejeição.');
    db.prepare(`UPDATE nfce_documents SET state='REJECTED', sefaz_cstat=?, sefaz_xmotivo=?, updated_at=? WHERE empresa_id=? AND fiscal_id=?`)
      .run(cStat,xMotivo,now,empresaId,fiscalId);
    db.prepare(`UPDATE fiscal_outbox SET status='CONFIRMED', sending_started_at=NULL, next_attempt_at=NULL, confirmed_at=?, last_error=NULL, remote_ack_json=?, updated_at=? WHERE empresa_id=? AND fiscal_id=? AND status='SENDING'`)
      .run(now,JSON.stringify({kind:'REJECTED',cStat,xMotivo}),now,empresaId,fiscalId);
    db.exec('COMMIT;');
    return getFiscalOutboxByFiscalId(empresaId,fiscalId);
  } catch(error) { try { db.exec('ROLLBACK;'); } catch (_) {} throw error; }
}

function markFiscalOutboxManualReview(input = {}) {
  const status = input.conflict === true ? 'CONFLICT' : 'MANUAL_REVIEW';
  return transitionFiscalOutboxSending(input, {
    outboxStatus: status,
    action: input.action === 'RECONCILE_BY_KEY' ? 'RECONCILE_BY_KEY' : 'TRANSMIT',
    docState: 'MANUAL_REVIEW',
    lastError: optionalText(input.error) || 'Documento fiscal requer revisão manual.',
    remoteAck: input.remoteAck || null
  });
}

function markFiscalOutboxManualReviewReady(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const fiscalId = requiredText(input.fiscalId, 'fiscalId');
  const now = optionalText(input.now) || nowIso();
  const error = (optionalText(input.error) || 'Limite de tentativas fiscais atingido; revisão manual necessária.').slice(0, 2000);
  db.exec('BEGIN IMMEDIATE;');
  try {
    const row = db.prepare(`SELECT status FROM fiscal_outbox WHERE empresa_id=? AND fiscal_id=? LIMIT 1`)
      .get(empresaId, fiscalId);
    if (!row || !['PENDING', 'RETRY'].includes(String(row.status))) {
      throw new Error('Fiscal outbox não está pronto para revisão manual preventiva.');
    }
    const updated = db.prepare(`
      UPDATE fiscal_outbox
         SET status='MANUAL_REVIEW', next_attempt_at=NULL, sending_started_at=NULL,
             last_error=?, updated_at=?
       WHERE empresa_id=? AND fiscal_id=? AND status IN ('PENDING','RETRY')
    `).run(error, now, empresaId, fiscalId);
    if (Number(updated.changes || 0) !== 1) throw new Error('Fiscal outbox mudou durante a trava por limite de tentativas.');
    db.prepare(`UPDATE nfce_documents SET state='MANUAL_REVIEW', updated_at=? WHERE empresa_id=? AND fiscal_id=?`)
      .run(now, empresaId, fiscalId);
    db.exec('COMMIT;');
    return getFiscalOutboxByFiscalId(empresaId, fiscalId);
  } catch (errorValue) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw errorValue;
  }
}

function recoverStaleFiscalOutbox(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const staleBefore = requiredText(input.staleBefore, 'staleBefore');
  const now = optionalText(input.now) || nowIso();
  const nextAttemptAt = optionalText(input.nextAttemptAt) || now;
  db.exec('BEGIN IMMEDIATE;');
  try {
    const rows = db.prepare(`
      SELECT fiscal_id, action FROM fiscal_outbox
       WHERE empresa_id=? AND status='SENDING' AND sending_started_at IS NOT NULL AND sending_started_at <= ?
    `).all(empresaId, staleBefore);
    for (const row of rows) {
      const previousAction = String(row.action);
      const nextAction = previousAction === 'TRANSMIT' ? 'RECONCILE_BY_KEY' : previousAction;
      db.prepare(`UPDATE fiscal_outbox SET action=?, status='RETRY', next_attempt_at=?, sending_started_at=NULL, last_error=?, updated_at=? WHERE empresa_id=? AND fiscal_id=? AND status='SENDING'`)
        .run(nextAction,nextAttemptAt,previousAction === 'TRANSMIT' ? 'Transmissão interrompida; reconciliar por chave antes de qualquer reenvio.' : 'Reconciliação interrompida; repetir consulta por chave.',now,empresaId,String(row.fiscal_id));
      db.prepare(`UPDATE nfce_documents SET state='RECONCILE_BY_KEY', updated_at=? WHERE empresa_id=? AND fiscal_id=?`)
        .run(now,empresaId,String(row.fiscal_id));
    }
    db.exec('COMMIT;');
    return rows.length;
  } catch(error) { try { db.exec('ROLLBACK;'); } catch (_) {} throw error; }
}

function listAuthorizedNfcePendingSync(input = {}) {
  const db = getOfflineDatabase();
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const limit = normalizeLimit(input.limit, 50, 200);
  const rows = db.prepare(`
    SELECT d.fiscal_id, d.sale_id, d.ambiente, d.modelo, d.serie, d.numero,
           d.chave_acesso, d.tp_emis, d.dh_emi, d.protocolo,
           d.sefaz_cstat, d.sefaz_xmotivo, d.autorizado_em, d.processed_xml,
           d.updated_at,
           (
             SELECT s2.operation_id
               FROM sync_outbox AS s2
              WHERE s2.empresa_id = d.empresa_id
                AND s2.entity_id = d.sale_id
                AND s2.type = 'SALE_PAID'
              ORDER BY s2.created_at ASC
              LIMIT 1
           ) AS sale_sync_operation_id
      FROM nfce_documents AS d
      JOIN fiscal_outbox AS f
        ON f.empresa_id = d.empresa_id
       AND f.fiscal_id = d.fiscal_id
     WHERE d.empresa_id = ?
       AND d.state = 'AUTHORIZED'
       AND f.status = 'CONFIRMED'
       AND d.processed_xml IS NOT NULL
       AND d.protocolo IS NOT NULL
       AND d.sefaz_cstat IN ('100','150')
       AND d.ambiente = 'PRODUCAO'
       AND d.modelo = 65
       AND d.tp_emis = 9
       AND NOT EXISTS (
         SELECT 1
           FROM sync_outbox AS s
          WHERE s.empresa_id = d.empresa_id
            AND s.operation_id =
              ('nfce-auth:' || d.fiscal_id)
       )
     ORDER BY d.updated_at ASC
     LIMIT ?
  `).all(empresaId, limit);

  return rows.map((row) => ({
    fiscalId: String(row.fiscal_id),
    saleId: String(row.sale_id),
    ambiente: String(row.ambiente),
    modelo: Number(row.modelo),
    serie: String(row.serie),
    numero: Number(row.numero),
    chaveAcesso: String(row.chave_acesso),
    tipoEmissao: Number(row.tp_emis),
    dataHoraEmissao: String(row.dh_emi),
    protocolo: String(row.protocolo),
    cStat: String(row.sefaz_cstat),
    xMotivo: row.sefaz_xmotivo == null
      ? null
      : String(row.sefaz_xmotivo),
    autorizadoEm: String(row.autorizado_em),
    processedXml: Buffer.from(row.processed_xml),
    updatedAt: String(row.updated_at),
    saleSyncOperationId: row.sale_sync_operation_id == null
      ? null
      : String(row.sale_sync_operation_id)
  }));
}

function closeOfflineDatabase() {
  if (!database) return;
  try { database.close(); } finally {
    database = null;
    databasePath = '';
  }
}

function getOfflineDatabase() {
  if (!database) {
    throw new Error('SQLite offline ainda não foi inicializado.');
  }
  return database;
}

module.exports = {
  OFFLINE_DB_SCHEMA_VERSION,
  OFFLINE_DB_MIGRATIONS,
  initializeOfflineDatabase,
  closeOfflineDatabase,
  getOfflineDatabase,
  upsertOfflineOperatorCredential,
  listActiveOfflineOperatorCredentials,
  deactivateOfflineOperatorCredentialsExcept,
  deactivateOfflineOperatorCredentialsOutsideCompanies,
  upsertProvisionedOfflineCredential,
  listActiveProvisionedOfflineCredentials,
  deactivateProvisionedOfflineCredentialsExcept,
  deactivateProvisionedOfflineCredentialsOutsideCompanies,
  upsertPreparedOfflineCompany,
  getPreparedOfflineCompany,
  listPreparedOfflineCompanies,
  upsertProductCache,
  upsertCustomerCache,
  upsertSupplierCache,
  upsertCrediarioCache,
  finalizeCrediariosSnapshot,
  listCrediariosCache,
  getCrediarioCacheById,
  getCrediarioDetailCache,
  getCrediarioPendingDependencies,
  openCrediarioOfflineAtomic,
  updateCrediarioItemsOfflineAtomic,
  upsertFiscalProfileCache,
  getFiscalProfileCache,
  upsertFiscalNumberLease,
  getFiscalNumberLeaseById,
  getFiscalNumberLeaseByRequestId,
  getActiveFiscalNumberLease,
  getFiscalNumberLeaseInventory,
  peekNextNfceNumber,
  reconcileLocalNfceCounter,
  consumeNextNfceNumber,
  upsertReferenceBatch,
  getProductCacheById,
  findProductCacheByCodeOrGtin,
  searchProductsCache,
  getCustomerCacheById,
  searchCustomersCache,
  getSupplierCacheById,
  searchSuppliersCache,
  registerStockMovement,
  getStockProjection,
  listPendingStockDeltasByProduct,
  listStockMovements,
  openCashSession,
  getCashSession,
  getOpenCashSession,
  closeCashSession,
  registerCashMovement,
  listCashMovements,
  aggregateCashSessionActivity,
  registerFinancialMovement,
  listFinancialMovements,
  registerOfflineSaleAtomic,

  getNfceDocumentBySaleId,
  getNfceDocumentByFiscalId,
  ensureFiscalOutboxForPendingNfce,
  getFiscalOutboxByFiscalId,
  listFiscalOutboxReady,
  claimFiscalOutboxOperation,
  markFiscalOutboxRetry,
  markFiscalOutboxAmbiguous,
  markFiscalOutboxSafeRetransmit,
  markFiscalOutboxAuthorized,
  markFiscalOutboxRejected,
  markFiscalOutboxManualReview,
  markFiscalOutboxManualReviewReady,
  recoverStaleFiscalOutbox,

  persistSignedNfceContingency,
  persistNfceQrCode,
  getSaleById,
  listAuthorizedNfcePendingSync,
  getOutboxStatusSummary,
  getOutboxOperation,
  enqueueOutboxOperation,
  listOutboxReady,
  claimOutboxOperation,
  markOutboxRetry,
  markOutboxConfirmed,
  markOutboxConflict,
  markOutboxManualReview,
  recoverStaleOutbox,
  STOCK_QUANTITY_SCALE
};
