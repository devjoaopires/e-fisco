'use strict';

const { createHash } = require('crypto');
const {
  initializeOfflineConnection,
  closeOfflineConnection,
  getOfflineConnection
} = require('./offline-db/connection');
const {
  beginImmediateTransaction
} = require('./offline-db/transaction');

const {
  OFFLINE_DB_SCHEMA_VERSION,
  OFFLINE_DB_MIGRATIONS,
  migrateOfflineDatabase
} = require('./offline-db/migrations');
const operatorCredentialsRepository =
  require('./offline-db/repositories/operator-credentials');
const preparedCompaniesRepository =
  require('./offline-db/repositories/prepared-companies');
const productsRepository =
  require('./offline-db/repositories/products');
const customersRepository =
  require('./offline-db/repositories/customers');
const suppliersRepository =
  require('./offline-db/repositories/suppliers');
const financeReadModel =
  require('./offline-db/read-models/finance');
const outboxStatusReadModel =
  require('./offline-db/read-models/outbox-status');
const syncOutbox =
  require('./offline-db/outbox/sync-outbox');
const cashRepository =
  require('./offline-db/repositories/cash');
const financeRepository =
  require('./offline-db/repositories/finance');
const salesRepository =
  require('./offline-db/repositories/sales');
const cashReadModel =
  require('./offline-db/read-models/cash');
const stockRepository =
  require('./offline-db/repositories/stock');
const fiscalProfileRepository =
  require('./offline-db/repositories/fiscal-profile');
const fiscalNumberingRepository =
  require('./offline-db/repositories/fiscal-numbering');
const fiscalReadModel =
  require('./offline-db/read-models/fiscal');
const fiscalOutbox =
  require('./offline-db/outbox/fiscal-outbox');
const crediarioRepository =
  require('./offline-db/repositories/crediario');
const crediarioReadModel =
  require('./offline-db/read-models/crediario');
const crediarioAtomic =
  require('./offline-db/atomic/crediario');
const saleAtomic =
  require('./offline-db/atomic/sale');
function nowIso() {
  return new Date().toISOString();
}

function scalarRowValue(row) {
  if (!row || typeof row !== 'object') return null;
  const keys = Object.keys(row);
  return keys.length ? row[keys[0]] : null;
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







function initializeOfflineDatabase(options = {}) {
  const connection = initializeOfflineConnection(options);
  const db = connection.database;

  if (connection.reused) {
    return {
      ok: true,
      reused: true,
      path: connection.path,
      ...inspectDatabase(db)
    };
  }

  try {
    migrateOfflineDatabase(db);
    salesRepository.reconcileConfirmedSaleSyncStatuses(db);
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

    return {
      ok: true,
      reused: false,
      path: connection.path,
      ...info
    };
  } catch (error) {
    closeOfflineConnection();
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
  return operatorCredentialsRepository
    .upsertOfflineOperatorCredential(
      getOfflineDatabase(),
      input
    );
}

function deactivateOfflineOperatorCredentialsExcept(
  input = {}
) {
  return operatorCredentialsRepository
    .deactivateOfflineOperatorCredentialsExcept(
      getOfflineDatabase(),
      input
    );
}

function deactivateOfflineOperatorCredentialsOutsideCompanies(
  empresaIdsValue = []
) {
  return operatorCredentialsRepository
    .deactivateOfflineOperatorCredentialsOutsideCompanies(
      getOfflineDatabase(),
      empresaIdsValue
    );
}



function upsertProvisionedOfflineCredential(input = {}) {
  return operatorCredentialsRepository
    .upsertProvisionedOfflineCredential(
      getOfflineDatabase(),
      input
    );
}

function listActiveProvisionedOfflineCredentials(
  empresaIdValue = null
) {
  return operatorCredentialsRepository
    .listActiveProvisionedOfflineCredentials(
      getOfflineDatabase(),
      empresaIdValue
    );
}

function deactivateProvisionedOfflineCredentialsExcept(
  input = {}
) {
  return operatorCredentialsRepository
    .deactivateProvisionedOfflineCredentialsExcept(
      getOfflineDatabase(),
      input
    );
}

function deactivateProvisionedOfflineCredentialsOutsideCompanies(
  empresaIdsValue = []
) {
  return operatorCredentialsRepository
    .deactivateProvisionedOfflineCredentialsOutsideCompanies(
      getOfflineDatabase(),
      empresaIdsValue
    );
}



function upsertProductCache(input) {
  return productsRepository.upsertProductCache(
    getOfflineDatabase(),
    input
  );
}

function upsertCustomerCache(input) {
  return customersRepository.upsertCustomerCache(
    getOfflineDatabase(),
    input
  );
}

function mapCrediarioCacheRow(row) {
  return crediarioRepository
    .mapCrediarioCacheRow(row);
}

function upsertCrediarioCache(input) {
  return crediarioRepository
    .upsertCrediarioCache(
      getOfflineConnection(),
      input
    );
}

function finalizeCrediariosSnapshot(
  input = {}
) {
  return crediarioRepository
    .finalizeCrediariosSnapshot(
      getOfflineConnection(),
      input
    );
}

function listCrediariosCache(input = {}) {
  return crediarioReadModel
    .listCrediariosCache(
      getOfflineConnection(),
      input
    );
}

function crediarioItemIsOpen(item) {
  return crediarioReadModel
    .crediarioItemIsOpen(item);
}

function normalizeCrediarioDetailItem(
  item,
  index = 0
) {
  return crediarioReadModel
    .normalizeCrediarioDetailItem(
      item,
      index
    );
}

function getCrediarioCacheById(
  empresaIdValue,
  crediarioIdValue
) {
  return crediarioRepository
    .getCrediarioCacheById(
      getOfflineConnection(),
      empresaIdValue,
      crediarioIdValue
    );
}

function getCrediarioDetailCache(
  input = {}
) {
  return crediarioReadModel
    .getCrediarioDetailCache(
      getOfflineConnection(),
      input
    );
}


function openCrediarioOfflineAtomic(
  input = {}
) {
  return crediarioAtomic
    .openCrediarioOfflineAtomic(
      getOfflineConnection(),
      input
    );
}



function getCrediarioPendingDependencies(
  empresaIdValue,
  crediarioIdValue
) {
  return crediarioReadModel
    .getCrediarioPendingDependencies(
      getOfflineConnection(),
      empresaIdValue,
      crediarioIdValue
    );
}



function updateCrediarioItemsOfflineAtomic(
  input = {}
) {
  return crediarioAtomic
    .updateCrediarioItemsOfflineAtomic(
      getOfflineConnection(),
      input
    );
}

function upsertSupplierCache(input) {
  return suppliersRepository.upsertSupplierCache(
    getOfflineDatabase(),
    input
  );
}





function upsertFiscalProfileCache(input = {}) {
  return fiscalProfileRepository
    .upsertFiscalProfileCache(
      getOfflineConnection(),
      input
    );
}

function getFiscalProfileCache(empresaIdValue) {
  return fiscalProfileRepository
    .getFiscalProfileCache(
      getOfflineConnection(),
      empresaIdValue
    );
}







function upsertFiscalNumberLease(input = {}) {
  return fiscalNumberingRepository
    .upsertFiscalNumberLease(
      getOfflineConnection(),
      input
    );
}

function getFiscalNumberLeaseById(
  empresaIdValue,
  leaseIdValue
) {
  return fiscalNumberingRepository
    .getFiscalNumberLeaseById(
      getOfflineConnection(),
      empresaIdValue,
      leaseIdValue
    );
}

function getFiscalNumberLeaseByRequestId(
  empresaIdValue,
  requestIdValue
) {
  return fiscalNumberingRepository
    .getFiscalNumberLeaseByRequestId(
      getOfflineConnection(),
      empresaIdValue,
      requestIdValue
    );
}



function getActiveFiscalNumberLease(
  input = {}
) {
  return fiscalNumberingRepository
    .getActiveFiscalNumberLease(
      getOfflineConnection(),
      input
    );
}

function getFiscalNumberLeaseInventory(
  input = {}
) {
  return fiscalNumberingRepository
    .getFiscalNumberLeaseInventory(
      getOfflineConnection(),
      input
    );
}

function peekNextNfceNumber(input = {}) {
  return fiscalNumberingRepository
    .peekNextNfceNumber(
      getOfflineConnection(),
      input
    );
}

function reconcileLocalNfceCounter(
  input = {}
) {
  return fiscalNumberingRepository
    .reconcileLocalNfceCounter(
      getOfflineConnection(),
      input
    );
}


function consumeNextNfceNumber(input = {}) {
  return fiscalNumberingRepository
    .consumeNextNfceNumber(
      getOfflineConnection(),
      input
    );
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

  const transaction = beginImmediateTransaction(db);
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
    transaction.commit();
  } catch (error) {
    transaction.rollback();
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



function upsertPreparedOfflineCompany(input = {}) {
  return preparedCompaniesRepository
    .upsertPreparedOfflineCompany(
      getOfflineDatabase(),
      input
    );
}

function getPreparedOfflineCompany(empresaIdValue) {
  return preparedCompaniesRepository
    .getPreparedOfflineCompany(
      getOfflineDatabase(),
      empresaIdValue
    );
}

function listPreparedOfflineCompanies() {
  return preparedCompaniesRepository
    .listPreparedOfflineCompanies(
      getOfflineDatabase()
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
  return operatorCredentialsRepository
    .listActiveOfflineOperatorCredentials(
      getOfflineDatabase(),
      empresaIdValue
    );
}





function getProductCacheById(
  empresaIdValue,
  produtoIdValue
) {
  return productsRepository.getProductCacheById(
    getOfflineDatabase(),
    empresaIdValue,
    produtoIdValue
  );
}

function findProductCacheByCodeOrGtin(
  empresaIdValue,
  value
) {
  return productsRepository.findProductCacheByCodeOrGtin(
    getOfflineDatabase(),
    empresaIdValue,
    value
  );
}

function searchProductsCache(input = {}) {
  return productsRepository.searchProductsCache(
    getOfflineDatabase(),
    input
  );
}

function getCustomerCacheById(
  empresaIdValue,
  clienteIdValue
) {
  return customersRepository.getCustomerCacheById(
    getOfflineDatabase(),
    empresaIdValue,
    clienteIdValue
  );
}

function searchCustomersCache(input = {}) {
  return customersRepository.searchCustomersCache(
    getOfflineDatabase(),
    input
  );
}

function getSupplierCacheById(
  empresaIdValue,
  fornecedorIdValue
) {
  return suppliersRepository.getSupplierCacheById(
    getOfflineDatabase(),
    empresaIdValue,
    fornecedorIdValue
  );
}

function searchSuppliersCache(input = {}) {
  return suppliersRepository.searchSuppliersCache(
    getOfflineDatabase(),
    input
  );
}

const STOCK_QUANTITY_SCALE =
  stockRepository.STOCK_QUANTITY_SCALE;

function decimalToMicrounits(
  value,
  fieldName = 'quantidade'
) {
  return stockRepository
    .decimalToMicrounits(
      value,
      fieldName
    );
}

function microunitsToDecimalString(value) {
  return stockRepository
    .microunitsToDecimalString(value);
}

function stockDirection(value) {
  return stockRepository
    .stockDirection(value);
}

function registerStockMovement(input) {
  return stockRepository
    .registerStockMovement(
      getOfflineConnection(),
      input
    );
}

function getStockProjection(
  empresaIdValue,
  produtoIdValue
) {
  return stockRepository
    .getStockProjection(
      getOfflineConnection(),
      empresaIdValue,
      produtoIdValue
    );
}

function listPendingStockDeltasByProduct(
  empresaIdValue
) {
  return stockRepository
    .listPendingStockDeltasByProduct(
      getOfflineConnection(),
      empresaIdValue
    );
}

function listStockMovements(input = {}) {
  return stockRepository
    .listStockMovements(
      getOfflineConnection(),
      input
    );
}








function getCashSession(
  empresaIdValue,
  sessionIdValue
) {
  return cashRepository.getCashSession(
    getOfflineConnection(),
    empresaIdValue,
    sessionIdValue
  );
}

function getOpenCashSession(empresaIdValue) {
  return cashRepository.getOpenCashSession(
    getOfflineConnection(),
    empresaIdValue
  );
}

function openCashSession(input = {}) {
  return cashRepository.openCashSession(
    getOfflineConnection(),
    input
  );
}

function closeCashSession(input = {}) {
  return cashRepository.closeCashSession(
    getOfflineConnection(),
    input
  );
}



function registerCashMovement(input = {}) {
  return cashRepository.registerCashMovement(
    getOfflineConnection(),
    input
  );
}

function listCashMovements(input = {}) {
  return cashReadModel.listCashMovements(
    getOfflineConnection(),
    input
  );
}
function aggregateCashSessionActivity(
  input = {}
) {
  return cashReadModel.aggregateCashSessionActivity(
    getOfflineConnection(),
    input
  );
}



function registerFinancialMovement(
  input = {}
) {
  return financeRepository
    .registerFinancialMovement(
      getOfflineConnection(),
      input
    );
}

function listFinancialMovements(input = {}) {
  return financeReadModel.listFinancialMovements(
    getOfflineDatabase(),
    input
  );
}







function getSaleById(
  empresaIdValue,
  saleIdValue
) {
  return financeReadModel.getSaleById(
    getOfflineDatabase(),
    empresaIdValue,
    saleIdValue
  );
}

function getOutboxStatusSummary(empresaIdValue) {
  return outboxStatusReadModel
    .getOutboxStatusSummary(
      getOfflineConnection(),
      empresaIdValue
    );
}

function getOutboxOperation(
  empresaIdValue,
  operationIdValue
) {
  return syncOutbox.getOutboxOperation(
    getOfflineConnection(),
    empresaIdValue,
    operationIdValue
  );
}

function enqueueOutboxOperation(input = {}) {
  return syncOutbox.enqueueOutboxOperation(
    getOfflineConnection(),
    input
  );
}

function listOutboxReady(input = {}) {
  return syncOutbox.listOutboxReady(
    getOfflineConnection(),
    input
  );
}

function claimOutboxOperation(input = {}) {
  return syncOutbox.claimOutboxOperation(
    getOfflineConnection(),
    input
  );
}

function markOutboxRetry(input = {}) {
  return syncOutbox.markOutboxRetry(
    getOfflineConnection(),
    input
  );
}

function markOutboxConfirmed(input = {}) {
  return syncOutbox.markOutboxConfirmed(
    getOfflineConnection(),
    input,
    {
      onConfirmed:
        salesRepository.applyConfirmedSaleSyncStatus
    }
  );
}

function markOutboxConflict(input = {}) {
  return syncOutbox.markOutboxConflict(
    getOfflineConnection(),
    input
  );
}

function markOutboxManualReview(input = {}) {
  return syncOutbox.markOutboxManualReview(
    getOfflineConnection(),
    input
  );
}

function recoverStaleOutbox(input = {}) {
  return syncOutbox.recoverStaleOutbox(
    getOfflineConnection(),
    input
  );
}

function getNfceDocumentBySaleId(
  empresaIdValue,
  saleIdValue
) {
  return fiscalReadModel
    .getNfceDocumentBySaleId(
      getOfflineConnection(),
      empresaIdValue,
      saleIdValue
    );
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



  const transaction = beginImmediateTransaction(db);

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

        transaction.commit();

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



    transaction.commit();

    return {

      applied: true,

      duplicate: false,

      fiscalId: String(row.fiscal_id),

      state: 'CONTINGENCIA_PENDENTE',

      chaveAcesso: String(row.chave_acesso),

      signedXmlSha256

    };

  } catch (error) {

    transaction.rollback();

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

  const transaction = beginImmediateTransaction(db);
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
      transaction.commit();
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
    transaction.commit();
    return {
      applied: true,
      duplicate: false,
      fiscalId: String(row.fiscal_id),
      state: 'CONTINGENCIA_PENDENTE',
      chaveAcesso: String(row.chave_acesso),
      qrCodeText
    };
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}






function registerOfflineSaleAtomic(input = {}) {
  return saleAtomic.registerOfflineSaleAtomic(
    getOfflineConnection(),
    input
  );
}




function getNfceDocumentByFiscalId(
  empresaIdValue,
  fiscalIdValue
) {
  return fiscalReadModel
    .getNfceDocumentByFiscalId(
      getOfflineConnection(),
      empresaIdValue,
      fiscalIdValue
    );
}

function getFiscalOutboxByFiscalId(
  empresaIdValue,
  fiscalIdValue
) {
  return fiscalOutbox
    .getFiscalOutboxByFiscalId(
      getOfflineConnection(),
      empresaIdValue,
      fiscalIdValue
    );
}

function ensureFiscalOutboxForPendingNfce(
  input = {}
) {
  return fiscalOutbox
    .ensureFiscalOutboxForPendingNfce(
      getOfflineConnection(),
      input
    );
}

function listFiscalOutboxReady(input = {}) {
  return fiscalOutbox.listFiscalOutboxReady(
    getOfflineConnection(),
    input
  );
}

function claimFiscalOutboxOperation(
  input = {}
) {
  return fiscalOutbox
    .claimFiscalOutboxOperation(
      getOfflineConnection(),
      input
    );
}



function markFiscalOutboxRetry(input = {}) {
  return fiscalOutbox.markFiscalOutboxRetry(
    getOfflineConnection(),
    input
  );
}

function markFiscalOutboxAmbiguous(
  input = {}
) {
  return fiscalOutbox
    .markFiscalOutboxAmbiguous(
      getOfflineConnection(),
      input
    );
}

function markFiscalOutboxSafeRetransmit(
  input = {}
) {
  return fiscalOutbox
    .markFiscalOutboxSafeRetransmit(
      getOfflineConnection(),
      input
    );
}

function markFiscalOutboxAuthorized(
  input = {}
) {
  return fiscalOutbox
    .markFiscalOutboxAuthorized(
      getOfflineConnection(),
      input
    );
}

function markFiscalOutboxRejected(
  input = {}
) {
  return fiscalOutbox
    .markFiscalOutboxRejected(
      getOfflineConnection(),
      input
    );
}

function markFiscalOutboxManualReview(
  input = {}
) {
  return fiscalOutbox
    .markFiscalOutboxManualReview(
      getOfflineConnection(),
      input
    );
}

function markFiscalOutboxManualReviewReady(
  input = {}
) {
  return fiscalOutbox
    .markFiscalOutboxManualReviewReady(
      getOfflineConnection(),
      input
    );
}

function recoverStaleFiscalOutbox(
  input = {}
) {
  return fiscalOutbox
    .recoverStaleFiscalOutbox(
      getOfflineConnection(),
      input
    );
}

function listAuthorizedNfcePendingSync(
  input = {}
) {
  return fiscalReadModel
    .listAuthorizedNfcePendingSync(
      getOfflineConnection(),
      input
    );
}

function closeOfflineDatabase() {
  closeOfflineConnection();
}

function getOfflineDatabase() {
  return getOfflineConnection();
}

function probeOfflineDatabase() {
  const db =
    getOfflineConnection();

  if (
    !db ||
    typeof db.prepare !==
      'function'
  ) {
    return false;
  }

  const row =
    db.prepare(
      'SELECT 1 AS ok'
    ).get();

  return (
    row &&
    Number(row.ok) === 1
  );
}

module.exports = {
  OFFLINE_DB_SCHEMA_VERSION,
  OFFLINE_DB_MIGRATIONS,
  initializeOfflineDatabase,
  closeOfflineDatabase,
  getOfflineDatabase,
  probeOfflineDatabase,
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
