'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CERT_DIR_NAME = 'offline-fiscal-secrets';
const CERT_FILE_NAME = 'a1-bundle.v1.bin';
const FORMAT_VERSION = 1;
const ALGORITHM = 'aes-256-gcm';
const AAD = Buffer.from('e-fisco:a1-bundle:v1', 'utf8');
const MAGIC = Buffer.from('EFA1B1', 'ascii');
const MAX_PFX_BYTES = 5 * 1024 * 1024;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_PASSPHRASE_BYTES = 4096;

function requiredText(value, fieldName, maxLength = 256) {
  const text = String(value == null ? '' : value).trim();
  if (!text || text.length > maxLength) {
    throw new Error(`${fieldName} inválido.`);
  }
  return text;
}

function optionalIso(value, fieldName) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  const parsed = Date.parse(text);
  if (!text || Number.isNaN(parsed)) throw new Error(`${fieldName} inválido.`);
  return new Date(parsed).toISOString();
}

function optionalFingerprint(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim().replace(/:/g, '').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(text)) {
    throw new Error('fingerprintSha256 inválido.');
  }
  return text;
}

function assertSafeStorage(safeStorage) {
  if (
    !safeStorage ||
    typeof safeStorage.isEncryptionAvailable !== 'function' ||
    typeof safeStorage.encryptString !== 'function' ||
    typeof safeStorage.decryptString !== 'function'
  ) {
    throw new Error('safeStorage do Electron é obrigatório para o certificado A1.');
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Criptografia do sistema indisponível; certificado A1 não será armazenado.');
  }
  return safeStorage;
}

function bundlePaths(userDataDir) {
  const root = String(userDataDir || '').trim();
  if (!root) throw new Error('userDataDir é obrigatório.');
  const dir = path.join(root, CERT_DIR_NAME);
  return {
    dir,
    bundlePath: path.join(dir, CERT_FILE_NAME)
  };
}

function encodeField(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value || ''), 'utf8');
  if (buffer.length > 0x7fffffff) throw new Error('Campo do bundle A1 excede o limite seguro.');
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(buffer.length, 0);
  return [length, buffer];
}

function encodePlainEnvelope(input) {
  const passphraseBuffer = Buffer.from(String(input.passphrase == null ? '' : input.passphrase), 'utf8');
  if (passphraseBuffer.length > MAX_PASSPHRASE_BYTES) {
    passphraseBuffer.fill(0);
    throw new Error('Senha do A1 excede o limite seguro.');
  }

  const pfxBuffer = Buffer.from(input.pfxBuffer);
  const parts = [MAGIC];
  const fields = [
    Buffer.from(input.empresaId, 'utf8'),
    Buffer.from(input.deviceId, 'utf8'),
    Buffer.from(input.certificateId, 'utf8'),
    Buffer.from(input.fingerprintSha256 || '', 'utf8'),
    Buffer.from(input.validFrom || '', 'utf8'),
    Buffer.from(input.validTo || '', 'utf8'),
    Buffer.from(input.storedAt, 'utf8'),
    passphraseBuffer,
    pfxBuffer
  ];

  for (const field of fields) parts.push(...encodeField(field));
  const envelope = Buffer.concat(parts);

  passphraseBuffer.fill(0);
  pfxBuffer.fill(0);
  for (let i = 0; i < 7; i += 1) fields[i].fill(0);
  return envelope;
}

function decodePlainEnvelope(plain) {
  if (!Buffer.isBuffer(plain) || plain.length < MAGIC.length) {
    throw new Error('Bundle A1 descriptografado inválido.');
  }
  if (!plain.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Formato interno do bundle A1 inválido.');
  }

  let offset = MAGIC.length;
  const fields = [];
  for (let index = 0; index < 9; index += 1) {
    if (offset + 4 > plain.length) throw new Error('Bundle A1 truncado.');
    const length = plain.readUInt32BE(offset);
    offset += 4;
    if (length > MAX_PFX_BYTES + MAX_PASSPHRASE_BYTES + 4096 || offset + length > plain.length) {
      throw new Error('Campo inválido no bundle A1.');
    }
    fields.push(Buffer.from(plain.subarray(offset, offset + length)));
    offset += length;
  }
  if (offset !== plain.length) throw new Error('Bundle A1 contém bytes inesperados.');

  const pfxBuffer = fields[8];
  if (pfxBuffer.length < 1 || pfxBuffer.length > MAX_PFX_BYTES) {
    for (const field of fields) field.fill(0);
    throw new Error('Conteúdo PFX/P12 inválido no bundle A1.');
  }

  const result = {
    empresaId: fields[0].toString('utf8'),
    deviceId: fields[1].toString('utf8'),
    certificateId: fields[2].toString('utf8'),
    fingerprintSha256: fields[3].length ? fields[3].toString('utf8') : null,
    validFrom: fields[4].length ? fields[4].toString('utf8') : null,
    validTo: fields[5].length ? fields[5].toString('utf8') : null,
    storedAt: fields[6].toString('utf8'),
    passphrase: fields[7].toString('utf8'),
    pfxBuffer: Buffer.from(pfxBuffer)
  };

  for (const field of fields) field.fill(0);
  return result;
}

function normalizeStoreInput(input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId', 128);
  const deviceId = requiredText(input.deviceId, 'deviceId', 128);
  const certificateId = requiredText(input.certificateId, 'certificateId', 128);
  if (!Buffer.isBuffer(input.pfxBuffer)) {
    throw new Error('pfxBuffer deve ser um Buffer.');
  }
  if (input.pfxBuffer.length < 1 || input.pfxBuffer.length > MAX_PFX_BYTES) {
    throw new Error('pfxBuffer inválido ou acima do limite seguro.');
  }
  return {
    empresaId,
    deviceId,
    certificateId,
    pfxBuffer: input.pfxBuffer,
    passphrase: String(input.passphrase == null ? '' : input.passphrase),
    fingerprintSha256: optionalFingerprint(input.fingerprintSha256),
    validFrom: optionalIso(input.validFrom, 'validFrom'),
    validTo: optionalIso(input.validTo, 'validTo'),
    storedAt: input.storedAt ? optionalIso(input.storedAt, 'storedAt') : new Date().toISOString()
  };
}

function atomicWriteEncrypted(bundlePath, data) {
  const tempPath = `${bundlePath}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  let fd = null;
  try {
    fd = fs.openSync(tempPath, 'wx', 0o600);
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tempPath, bundlePath);
    try { fs.chmodSync(bundlePath, 0o600); } catch (_) {}
  } finally {
    if (fd != null) {
      try { fs.closeSync(fd); } catch (_) {}
    }
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (_) {}
  }
}

function storeFiscalA1Bundle(input = {}) {
  const safeStorage = assertSafeStorage(input.safeStorage);
  const normalized = normalizeStoreInput(input);
  const { dir, bundlePath } = bundlePaths(input.userDataDir);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch (_) {}

  const dataKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  let plain = null;
  let cipherText = null;
  let wrappedKey = null;

  try {
    plain = encodePlainEnvelope(normalized);
    const cipher = crypto.createCipheriv(ALGORITHM, dataKey, iv);
    cipher.setAAD(AAD);
    cipherText = Buffer.concat([cipher.update(plain), cipher.final()]);
    const authTag = cipher.getAuthTag();

    wrappedKey = safeStorage.encryptString(dataKey.toString('base64'));
    if (!Buffer.isBuffer(wrappedKey) || wrappedKey.length === 0) {
      throw new Error('safeStorage não retornou uma chave protegida válida.');
    }

    const container = Buffer.from(JSON.stringify({
      formatVersion: FORMAT_VERSION,
      algorithm: ALGORITHM,
      wrappedKey: wrappedKey.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      cipherText: cipherText.toString('base64')
    }), 'utf8');

    atomicWriteEncrypted(bundlePath, container);
    container.fill(0);

    return {
      stored: true,
      certificateId: normalized.certificateId,
      fingerprintSha256: normalized.fingerprintSha256,
      validFrom: normalized.validFrom,
      validTo: normalized.validTo,
      storedAt: normalized.storedAt,
      bundlePath
    };
  } finally {
    dataKey.fill(0);
    iv.fill(0);
    if (plain) plain.fill(0);
    if (cipherText) cipherText.fill(0);
    if (wrappedKey) wrappedKey.fill(0);
  }
}

function parseContainer(raw) {
  if (!Buffer.isBuffer(raw) || raw.length < 1 || raw.length > MAX_FILE_BYTES) {
    throw new Error('Arquivo local do A1 inválido ou acima do limite seguro.');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch (_) {
    throw new Error('Arquivo local do A1 não contém um container válido.');
  }
  if (
    !parsed ||
    parsed.formatVersion !== FORMAT_VERSION ||
    parsed.algorithm !== ALGORITHM ||
    typeof parsed.wrappedKey !== 'string' ||
    typeof parsed.iv !== 'string' ||
    typeof parsed.authTag !== 'string' ||
    typeof parsed.cipherText !== 'string'
  ) {
    throw new Error('Versão ou algoritmo do bundle A1 não suportado.');
  }
  return parsed;
}

function loadFiscalA1Bundle(input = {}) {
  const safeStorage = assertSafeStorage(input.safeStorage);
  const empresaId = requiredText(input.empresaId, 'empresaId', 128);
  const deviceId = requiredText(input.deviceId, 'deviceId', 128);
  const { bundlePath } = bundlePaths(input.userDataDir);
  if (!fs.existsSync(bundlePath)) return null;

  const stat = fs.statSync(bundlePath);
  if (!stat.isFile() || stat.size < 1 || stat.size > MAX_FILE_BYTES) {
    throw new Error('Arquivo local do A1 inválido.');
  }

  const raw = fs.readFileSync(bundlePath);
  const container = parseContainer(raw);
  raw.fill(0);

  const wrappedKey = Buffer.from(container.wrappedKey, 'base64');
  const iv = Buffer.from(container.iv, 'base64');
  const authTag = Buffer.from(container.authTag, 'base64');
  const cipherText = Buffer.from(container.cipherText, 'base64');
  let dataKey = null;
  let plain = null;

  try {
    const keyText = safeStorage.decryptString(wrappedKey);
    dataKey = Buffer.from(String(keyText || ''), 'base64');
    if (dataKey.length !== 32) throw new Error('Chave local do bundle A1 inválida.');
    if (iv.length !== 12 || authTag.length !== 16 || cipherText.length < 1) {
      throw new Error('Parâmetros criptográficos do bundle A1 inválidos.');
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, dataKey, iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(authTag);
    plain = Buffer.concat([decipher.update(cipherText), decipher.final()]);
    const decoded = decodePlainEnvelope(plain);

    if (decoded.empresaId !== empresaId || decoded.deviceId !== deviceId) {
      decoded.pfxBuffer.fill(0);
      throw new Error('Bundle A1 não pertence à empresa/dispositivo esperado.');
    }

    return {
      certificateId: decoded.certificateId,
      fingerprintSha256: decoded.fingerprintSha256,
      validFrom: decoded.validFrom,
      validTo: decoded.validTo,
      storedAt: decoded.storedAt,
      passphrase: decoded.passphrase,
      pfxBuffer: decoded.pfxBuffer
    };
  } catch (error) {
    if (error && /^Bundle A1 não pertence/.test(String(error.message || ''))) throw error;
    throw new Error(`Falha ao abrir o bundle A1 protegido: ${String(error && error.message || error)}`);
  } finally {
    wrappedKey.fill(0);
    iv.fill(0);
    authTag.fill(0);
    cipherText.fill(0);
    if (dataKey) dataKey.fill(0);
    if (plain) plain.fill(0);
  }
}

function inspectFiscalA1Bundle(input = {}) {
  const loaded = loadFiscalA1Bundle(input);
  if (!loaded) return null;
  try {
    return {
      certificateId: loaded.certificateId,
      fingerprintSha256: loaded.fingerprintSha256,
      validFrom: loaded.validFrom,
      validTo: loaded.validTo,
      storedAt: loaded.storedAt
    };
  } finally {
    loaded.pfxBuffer.fill(0);
  }
}

function hasStoredFiscalA1Bundle(input = {}) {
  const { bundlePath } = bundlePaths(input.userDataDir);
  return fs.existsSync(bundlePath);
}

function clearFiscalA1Bundle(input = {}) {
  const { bundlePath } = bundlePaths(input.userDataDir);
  if (!fs.existsSync(bundlePath)) return false;
  fs.unlinkSync(bundlePath);
  return true;
}

module.exports = {
  CERT_DIR_NAME,
  CERT_FILE_NAME,
  FORMAT_VERSION,
  MAX_PFX_BYTES,
  storeFiscalA1Bundle,
  loadFiscalA1Bundle,
  inspectFiscalA1Bundle,
  hasStoredFiscalA1Bundle,
  clearFiscalA1Bundle
};
