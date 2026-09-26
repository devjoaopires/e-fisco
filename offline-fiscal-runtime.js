'use strict';

const {
  processFiscalOutboxOnce,
  recoverStaleFiscalOutbox
} = require('./offline-fiscal-outbox-worker');
const {
  createSvrsProductionTransport
} = require('./offline-fiscal-svrs-transport');

function requiredText(value, name) {
  const out = String(value == null ? '' : value).trim();
  if (!out) throw new Error(`${name} é obrigatório.`);
  return out;
}

function isoBefore(now, ms) {
  const value = Date.parse(String(now));
  if (!Number.isFinite(value)) throw new Error('now inválido.');
  return new Date(value - ms).toISOString();
}

async function runFiscalReconnectCycle(options = {}) {
  if (options.enabled !== true) {
    return {
      enabled: false,
      locked: true,
      recoveredStale: 0,
      summary: null
    };
  }

  const empresaId = requiredText(options.empresaId, 'empresaId');
  const deviceId = requiredText(options.deviceId, 'deviceId');
  const now = options.now ? String(options.now) : new Date().toISOString();
  const staleAfterMs = Math.max(60_000, Number(options.staleAfterMs || 5 * 60_000));

  const recoverFn = typeof options.recoverFn === 'function'
    ? options.recoverFn
    : recoverStaleFiscalOutbox;
  const processFn = typeof options.processFn === 'function'
    ? options.processFn
    : processFiscalOutboxOnce;
  const transportFactory = typeof options.transportFactory === 'function'
    ? options.transportFactory
    : createSvrsProductionTransport;

  const transport = options.transport || transportFactory({
    empresaId,
    deviceId,
    userDataDir: requiredText(options.userDataDir, 'userDataDir'),
    safeStorage: options.safeStorage,
    timeoutMs: options.timeoutMs || 30_000
  });

  const recoveredStale = Number(await recoverFn({
    empresaId,
    staleBefore: isoBefore(now, staleAfterMs),
    now,
    nextAttemptAt: now
  }) || 0);

  const summary = await processFn({
    empresaId,
    transport,
    now,
    retryDelayMs: options.retryDelayMs || 60_000,
    reconcileDelayMs: options.reconcileDelayMs || 30_000,
    limit: options.limit || 20
  });

  return {
    enabled: true,
    locked: false,
    recoveredStale,
    summary
  };
}

module.exports = {
  runFiscalReconnectCycle
};
