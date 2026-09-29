'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEVICE_ID_CONFIG_KEY = 'sync.deviceId';
const EMPRESA_ID_CONFIG_KEY = 'sync.empresaId';
const TOKEN_DIR_NAME = 'offline-auth';
const TOKEN_FILE_NAME = 'sync-device-token.bin';
const TOKEN_MIN_LENGTH = 32;
const TOKEN_MAX_LENGTH = 512;
const LOCAL_CONFIG_CONTEXT_PROPERTY =
  '__efiscoLocalConfigRepository';

function requiredDatabase(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('SQLite offline válido é obrigatório para identidade do device.');
  }

  const repository =
    db[LOCAL_CONFIG_CONTEXT_PROPERTY];

  if (
    !repository ||
    typeof repository.read !== 'function' ||
    typeof repository.write !== 'function'
  ) {
    throw new Error(
      'SQLite offline válido é obrigatório para identidade do device.'
    );
  }

  return db;
}

function normalizeDeviceId(value) {
  const text = String(value == null ? '' : value).trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(text)) {
    throw new Error('deviceId inválido.');
  }
  return text;
}

function localConfigRepository(db) {
  return requiredDatabase(db)[
    LOCAL_CONFIG_CONTEXT_PROPERTY
  ];
}

function readLocalConfig(db, key) {
  return localConfigRepository(db)
    .read(key);
}

function writeLocalConfig(
  db,
  key,
  value,
  updatedAt = new Date().toISOString()
) {
  localConfigRepository(db)
    .write(key, value, updatedAt);
}

function getOrCreateSyncDeviceId(input = {}) {
  const db = requiredDatabase(input.db);
  const current = readLocalConfig(db, DEVICE_ID_CONFIG_KEY);
  if (typeof current === 'string' && current.trim()) {
    return normalizeDeviceId(current);
  }

  const uuidFactory = typeof input.randomUUID === 'function'
    ? input.randomUUID
    : crypto.randomUUID;
  const deviceId = normalizeDeviceId(`desktop-${uuidFactory()}`);
  writeLocalConfig(db, DEVICE_ID_CONFIG_KEY, deviceId, input.updatedAt);
  return deviceId;
}

function normalizeEmpresaId(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text || text.length > 128) {
    throw new Error('empresaId inválido.');
  }
  return text;
}

function getSyncEmpresaId(input = {}) {
  const db = requiredDatabase(input.db);
  const current = readLocalConfig(db, EMPRESA_ID_CONFIG_KEY);

  if (typeof current !== 'string' || !current.trim()) {
    return null;
  }

  return normalizeEmpresaId(current);
}

function storeSyncEmpresaId(input = {}) {
  const db = requiredDatabase(input.db);
  const empresaId = normalizeEmpresaId(input.empresaId);

  writeLocalConfig(
    db,
    EMPRESA_ID_CONFIG_KEY,
    empresaId,
    input.updatedAt
  );

  return empresaId;
}

function companyTokenPaths(userDataDir, empresaIdValue) {
  const root = String(userDataDir || '').trim();
  if (!root) throw new Error('userDataDir é obrigatório.');

  const empresaId =
    normalizeEmpresaId(
      empresaIdValue
    );

  const empresaHash =
    crypto
      .createHash('sha256')
      .update(
        empresaId,
        'utf8'
      )
      .digest('hex');

  const dir =
    path.join(
      root,
      TOKEN_DIR_NAME
    );

  return {
    dir,
    tokenPath:
      path.join(
        dir,
        `sync-device-token-company-${empresaHash}.bin`
      )
  };
}

function tokenPaths(userDataDir) {
  const root = String(userDataDir || '').trim();
  if (!root) throw new Error('userDataDir é obrigatório.');
  const dir = path.join(root, TOKEN_DIR_NAME);
  return {
    dir,
    tokenPath: path.join(dir, TOKEN_FILE_NAME)
  };
}

function assertSafeStorage(safeStorage) {
  if (
    !safeStorage ||
    typeof safeStorage.isEncryptionAvailable !== 'function' ||
    typeof safeStorage.encryptString !== 'function' ||
    typeof safeStorage.decryptString !== 'function'
  ) {
    throw new Error('safeStorage do Electron é obrigatório para o token do device.');
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Criptografia do sistema indisponível; token do device não será armazenado.');
  }
  return safeStorage;
}

function normalizeDeviceToken(value) {
  const token = String(value == null ? '' : value).trim();
  if (token.length < TOKEN_MIN_LENGTH || token.length > TOKEN_MAX_LENGTH) {
    throw new Error(`deviceToken deve ter entre ${TOKEN_MIN_LENGTH} e ${TOKEN_MAX_LENGTH} caracteres.`);
  }
  return token;
}

function storeSyncDeviceToken(input = {}) {
  const safeStorage = assertSafeStorage(input.safeStorage);
  const token = normalizeDeviceToken(input.deviceToken);
  const { dir, tokenPath } = tokenPaths(input.userDataDir);
  fs.mkdirSync(dir, { recursive: true });

  const encrypted = safeStorage.encryptString(token);
  if (!Buffer.isBuffer(encrypted) || encrypted.length === 0) {
    throw new Error('safeStorage não retornou conteúdo criptografado válido.');
  }

  const tempPath = `${tokenPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, encrypted, { mode: 0o600 });
    fs.renameSync(tempPath, tokenPath);
    try { fs.chmodSync(tokenPath, 0o600); } catch (_) {}
  } finally {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (_) {}
  }

  return { stored: true, tokenPath };
}

function storeSyncDeviceTokenForCompany(input = {}) {
  const safeStorage =
    assertSafeStorage(
      input.safeStorage
    );
  const empresaId =
    normalizeEmpresaId(
      input.empresaId
    );
  const token =
    normalizeDeviceToken(
      input.deviceToken
    );
  const {
    dir,
    tokenPath
  } =
    companyTokenPaths(
      input.userDataDir,
      empresaId
    );

  fs.mkdirSync(
    dir,
    {
      recursive: true
    }
  );

  const encrypted =
    safeStorage.encryptString(
      token
    );

  if (
    !Buffer.isBuffer(encrypted) ||
    encrypted.length === 0
  ) {
    throw new Error(
      'safeStorage não retornou conteúdo criptografado válido.'
    );
  }

  const tempPath =
    `${tokenPath}.tmp-${process.pid}-${Date.now()}`;

  try {
    fs.writeFileSync(
      tempPath,
      encrypted,
      {
        mode: 0o600
      }
    );
    fs.renameSync(
      tempPath,
      tokenPath
    );
    try {
      fs.chmodSync(
        tokenPath,
        0o600
      );
    } catch (_) {}
  } finally {
    try {
      if (
        fs.existsSync(
          tempPath
        )
      ) {
        fs.unlinkSync(
          tempPath
        );
      }
    } catch (_) {}
  }

  return {
    stored: true,
    empresaId,
    tokenPath
  };
}

function loadSyncDeviceTokenForCompany(input = {}) {
  const {
    tokenPath
  } =
    companyTokenPaths(
      input.userDataDir,
      input.empresaId
    );

  if (
    !fs.existsSync(
      tokenPath
    )
  ) {
    return null;
  }

  const safeStorage =
    assertSafeStorage(
      input.safeStorage
    );
  const encrypted =
    fs.readFileSync(
      tokenPath
    );
  const token =
    safeStorage.decryptString(
      encrypted
    );

  return normalizeDeviceToken(
    token
  );
}

function hasStoredSyncDeviceTokenForCompany(input = {}) {
  const {
    tokenPath
  } =
    companyTokenPaths(
      input.userDataDir,
      input.empresaId
    );

  return fs.existsSync(
    tokenPath
  );
}

function clearSyncDeviceTokenForCompany(input = {}) {
  const {
    tokenPath
  } =
    companyTokenPaths(
      input.userDataDir,
      input.empresaId
    );

  if (
    !fs.existsSync(
      tokenPath
    )
  ) {
    return false;
  }

  fs.unlinkSync(
    tokenPath
  );

  return true;
}

function loadSyncDeviceToken(input = {}) {
  const { tokenPath } = tokenPaths(input.userDataDir);
  if (!fs.existsSync(tokenPath)) return null;
  const safeStorage = assertSafeStorage(input.safeStorage);
  const encrypted = fs.readFileSync(tokenPath);
  const token = safeStorage.decryptString(encrypted);
  return normalizeDeviceToken(token);
}

function clearSyncDeviceToken(input = {}) {
  const { tokenPath } = tokenPaths(input.userDataDir);
  if (!fs.existsSync(tokenPath)) return false;
  fs.unlinkSync(tokenPath);
  return true;
}

function hasStoredSyncDeviceToken(input = {}) {
  const { tokenPath } = tokenPaths(input.userDataDir);
  return fs.existsSync(tokenPath);
}

module.exports = {
  DEVICE_ID_CONFIG_KEY,
  EMPRESA_ID_CONFIG_KEY,
  TOKEN_DIR_NAME,
  TOKEN_FILE_NAME,
  getOrCreateSyncDeviceId,
  getSyncEmpresaId,
  storeSyncEmpresaId,
  storeSyncDeviceToken,
  storeSyncDeviceTokenForCompany,
  loadSyncDeviceToken,
  loadSyncDeviceTokenForCompany,
  clearSyncDeviceToken,
  clearSyncDeviceTokenForCompany,
  hasStoredSyncDeviceToken,
  hasStoredSyncDeviceTokenForCompany,
  normalizeDeviceId,
  normalizeEmpresaId,
  normalizeDeviceToken
};

