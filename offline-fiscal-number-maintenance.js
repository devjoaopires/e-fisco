'use strict';

const crypto = require('crypto');
const {
  getOfflineDatabase,
  getFiscalProfileCache,
  getFiscalNumberLeaseInventory
} = require('./offline-db');
const {
  reserveFiscalNumberLeaseOffline
} = require('./offline-fiscal-number-service');
const {
  INTENT_KEY_PREFIX,
  DEFAULT_REFILL_THRESHOLD,
  DEFAULT_RESERVE_QUANTITY,
  DEFAULT_RETRY_INTERVAL_MS,
  fiscalNumberNamespaceKey: namespaceKey,
  normalizeFiscalNumberPolicy: policy,
  normalizeFiscalNumberIntent: normalizeIntent
} = require('./offline-fiscal-values');
const inFlightByIdentity = new Map();

function requiredText(value, fieldName) {
  const result = String(value == null ? '' : value).trim();
  if (!result) throw new Error(`${fieldName} é obrigatório.`);
  return result;
}

function nowIso(value) {
  if (value == null || value === '') return new Date().toISOString();
  const parsed = Date.parse(String(value));
  if (Number.isNaN(parsed)) throw new Error('now inválido para manutenção de lease fiscal.');
  return new Date(parsed).toISOString();
}

function readConfig(db, key) {
  const row = db.prepare('SELECT value_json FROM local_config WHERE config_key = ?').get(key);
  if (!row) return null;
  try { return JSON.parse(String(row.value_json)); } catch (_) {
    throw new Error('Intenção local de reserva fiscal está corrompida; revisão necessária.');
  }
}

function writeConfig(db, key, value, updatedAt) {
  db.prepare(`
    INSERT INTO local_config (config_key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(config_key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), updatedAt);
}

function deleteConfig(db, key) {
  db.prepare('DELETE FROM local_config WHERE config_key = ?').run(key);
}

async function ensureInternal(options = {}) {
  const empresaId = requiredText(options.empresaId, 'empresaId');
  const deviceId = requiredText(options.deviceId, 'deviceId');
  const deviceToken = requiredText(options.deviceToken, 'deviceToken');
  const currentIso = nowIso(options.now);
  const currentMs = Date.parse(currentIso);
  const { threshold, quantity, retryIntervalMs } = policy(options);
  const db = getOfflineDatabase();
  const profile = getFiscalProfileCache(empresaId);
  if (!profile) {
    return { action: 'SKIP', reason: 'FISCAL_PROFILE_AUSENTE', remainingNumbers: 0, activeLeases: 0 };
  }
  if (String(profile.ambiente || '').toUpperCase() !== 'PRODUCAO') {
    return { action: 'SKIP', reason: 'AMBIENTE_NAO_PRODUCAO', remainingNumbers: 0, activeLeases: 0 };
  }
  const serie = requiredText(profile.serieNfce, 'fiscalProfile.serieNfce');
  const inventoryInput = {
    empresaId,
    deviceId,
    ambiente: 'PRODUCAO',
    modelo: 65,
    serie,
    now: currentIso
  };
  const before = getFiscalNumberLeaseInventory(inventoryInput);
  const key = namespaceKey({ empresaId, deviceId, serie });
  const rawIntent = readConfig(db, key);
  let intent = rawIntent == null ? null : normalizeIntent(rawIntent, key, quantity);

  if (!intent && before.remainingNumbers > threshold) {
    return {
      action: 'NONE',
      reason: null,
      remainingNumbers: before.remainingNumbers,
      activeLeases: before.activeLeases,
      threshold,
      reserveQuantity: quantity
    };
  }

  if (intent && intent.lastAttemptAt && retryIntervalMs > 0) {
    const lastAttemptMs = Date.parse(intent.lastAttemptAt);
    if (!Number.isNaN(lastAttemptMs) && currentMs - lastAttemptMs < retryIntervalMs) {
      return {
        action: 'WAIT_RETRY',
        reason: null,
        remainingNumbers: before.remainingNumbers,
        activeLeases: before.activeLeases,
        threshold,
        reserveQuantity: quantity,
        retryAfterMs: retryIntervalMs - Math.max(0, currentMs - lastAttemptMs)
      };
    }
  }

  const recoveringIntent = Boolean(intent);
  if (!intent) {
    const uuidFactory = typeof options.randomUUID === 'function' ? options.randomUUID : crypto.randomUUID;
    intent = {
      version: 1,
      namespaceKey: key,
      requestId: `lease-auto-${uuidFactory()}`,
      quantity,
      createdAt: currentIso,
      attempts: 0,
      lastAttemptAt: null
    };
    writeConfig(db, key, intent, currentIso);
  }

  const reserveFn = typeof options.reserveFn === 'function'
    ? options.reserveFn
    : reserveFiscalNumberLeaseOffline;

  try {
    const reserved = await reserveFn({
      empresaId,
      deviceId,
      deviceToken,
      requestId: intent.requestId,
      quantidade: intent.quantity,
      fiscalProfile: profile,
      endpoint: options.endpoint,
      timeoutMs: options.timeoutMs == null ? 15_000 : options.timeoutMs,
      allowInsecureLocalhost: options.allowInsecureLocalhost === true
    });
    if (!reserved || !reserved.lease) {
      throw new Error('Reserva fiscal não retornou lease persistido.');
    }
    deleteConfig(db, key);
    const after = getFiscalNumberLeaseInventory(inventoryInput);
    return {
      action: reserved.localReuse === true
        ? 'RECOVERED_LOCAL'
        : reserved.duplicate === true
          ? 'RECOVERED_REMOTE'
          : 'RESERVED',
      reason: null,
      recoveredIntent: recoveringIntent,
      remainingNumbers: after.remainingNumbers,
      activeLeases: after.activeLeases,
      threshold,
      reserveQuantity: quantity
    };
  } catch (error) {
    const failedAt = nowIso(options.now);
    intent.attempts += 1;
    intent.lastAttemptAt = failedAt;
    writeConfig(db, key, intent, failedAt);
    throw error;
  }
}

function ensureFiscalNumberLeaseInventory(options = {}) {
  const empresaId = requiredText(options.empresaId, 'empresaId');
  const deviceId = requiredText(options.deviceId, 'deviceId');
  const flightKey = `${empresaId}\u0000${deviceId}`;
  const existing = inFlightByIdentity.get(flightKey);
  if (existing) return existing;

  const promise = ensureInternal(options);
  let wrapped;
  wrapped = promise.finally(() => {
    if (inFlightByIdentity.get(flightKey) === wrapped) {
      inFlightByIdentity.delete(flightKey);
    }
  });
  inFlightByIdentity.set(flightKey, wrapped);
  return wrapped;
}

module.exports = {
  INTENT_KEY_PREFIX,
  DEFAULT_REFILL_THRESHOLD,
  DEFAULT_RESERVE_QUANTITY,
  DEFAULT_RETRY_INTERVAL_MS,
  ensureFiscalNumberLeaseInventory
};
