'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const {
  attachLocalConfigRepository
} = require('./repositories/local-config');
const {
  attachFinanceReadModel
} = require('./read-models/finance');
const {
  attachCashRepository
} = require('./repositories/cash');
const {
  attachCashReadModel
} = require('./read-models/cash');

let database = null;
let databasePath = '';

function ensureDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function normalizePathForComparison(value) {
  const resolved = path.resolve(String(value || ''));
  return process.platform === 'win32'
    ? resolved.toLowerCase()
    : resolved;
}

function configureDatabase(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
  `);
}

function initializeOfflineConnection(options = {}) {
  const userDataDir = String(options.userDataDir || '').trim();
  if (!userDataDir) {
    throw new Error('userDataDir é obrigatório para inicializar o SQLite offline.');
  }

  const dataDir = path.join(userDataDir, 'offline-data');
  const requestedDatabasePath = path.join(
    dataDir,
    'e-fisco-offline.db'
  );

  if (database) {
    if (
      normalizePathForComparison(requestedDatabasePath) !==
      normalizePathForComparison(databasePath)
    ) {
      throw new Error(
        'SQLite offline já está aberto para outro userDataDir; feche o banco antes de trocar o diretório.'
      );
    }

    return {
      database,
      path: databasePath,
      reused: true
    };
  }

  ensureDirectory(dataDir);
  const db = new DatabaseSync(requestedDatabasePath);

  try {
    configureDatabase(db);
    attachLocalConfigRepository(db);
    attachFinanceReadModel(db);
    attachCashRepository(db);
    attachCashReadModel(db);
    database = db;
    databasePath = requestedDatabasePath;

    return {
      database,
      path: databasePath,
      reused: false
    };
  } catch (error) {
    try { db.close(); } catch (_) {}
    throw error;
  }
}

function closeOfflineConnection() {
  if (!database) return;
  try {
    database.close();
  } finally {
    database = null;
    databasePath = '';
  }
}

function getOfflineConnection() {
  if (!database) {
    throw new Error('SQLite offline ainda não foi inicializado.');
  }
  return database;
}

module.exports = {
  initializeOfflineConnection,
  closeOfflineConnection,
  getOfflineConnection
};
