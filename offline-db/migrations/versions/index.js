'use strict';

const {
  beginImmediateTransaction
} = require('../../transaction');

function nowIso() {
  return new Date().toISOString();
}

function hasMigration(db, version) {
  const row = db
    .prepare('SELECT version FROM schema_migrations WHERE version = ?')
    .get(version);
  return Boolean(row);
}

function applyMigrationV1(db) {
  if (hasMigration(db, 1)) return false;

  const appliedAt = nowIso();
  const transaction = beginImmediateTransaction(db);

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

    transaction.commit();
    return true;
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}

function applyMigrationV2(db) {
  if (hasMigration(db, 2)) return false;

  const appliedAt = nowIso();
  const transaction = beginImmediateTransaction(db);

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

    transaction.commit();
    return true;
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}

function applyMigrationV3(db) {
  if (hasMigration(db, 3)) return false;

  const appliedAt = nowIso();
  const transaction = beginImmediateTransaction(db);

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

    transaction.commit();
    return true;
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}


function applyMigrationV4(db) {
  if (hasMigration(db, 4)) return false;

  const appliedAt = nowIso();
  const transaction = beginImmediateTransaction(db);

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

    transaction.commit();
    return true;
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}


function applyMigrationV5(db) {
  if (hasMigration(db, 5)) return false;

  const appliedAt = nowIso();
  const transaction = beginImmediateTransaction(db);

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

    transaction.commit();
    return true;
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}


function applyMigrationV6(db) {
  if (hasMigration(db, 6)) return false;

  const appliedAt = nowIso();
  const transaction = beginImmediateTransaction(db);

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

    transaction.commit();
    return true;
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}

function applyMigrationV7(db) {
  if (hasMigration(db, 7)) return false;

  const appliedAt = nowIso();
  const transaction = beginImmediateTransaction(db);

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

    transaction.commit();
    return true;
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}

function applyMigrationV8(db) {
  if (hasMigration(db, 8)) return false;

  const appliedAt = nowIso();
  const transaction = beginImmediateTransaction(db);

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
    `).run(8, 'single-owner-nfce-number-reservations', appliedAt);

    transaction.commit();
    return true;
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}

function applyMigrationV9(db) {
  if (hasMigration(db, 9)) return false;

  const appliedAt = nowIso();
  const transaction = beginImmediateTransaction(db);

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

    transaction.commit();
    return true;
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}

function applyMigrationV10(db) {
  if (hasMigration(db, 10)) return false;

  const appliedAt = nowIso();
  const transaction = beginImmediateTransaction(db);

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

    transaction.commit();
    return true;
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}

function applyMigrationV11(db) {
  if (hasMigration(db, 11)) return false;

  const appliedAt = nowIso();
  const transaction = beginImmediateTransaction(db);

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

    transaction.commit();
    return true;
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}

function applyMigrationV12(db) {
  if (hasMigration(db, 12)) return false;

  const appliedAt = nowIso();
  const transaction = beginImmediateTransaction(db);

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

    transaction.commit();
    return true;
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}

function applyMigrationV13(db) {
  if (hasMigration(db, 13)) return false;

  const appliedAt = nowIso();
  const transaction = beginImmediateTransaction(db);

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

    transaction.commit();
    return true;
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}

function applyMigrations(db) {
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
}

module.exports = {
  applyMigrations
};
