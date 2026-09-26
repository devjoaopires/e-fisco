'use strict';

const {
  listOutboxReady,
  claimOutboxOperation,
  markOutboxRetry,
  markOutboxConfirmed,
  markOutboxConflict,
  markOutboxManualReview,
  recoverStaleOutbox
} = require('./offline-db');

const DEFAULT_RETRY_DELAYS_MS = Object.freeze([
  5_000,
  15_000,
  60_000,
  5 * 60_000,
  15 * 60_000
]);

function asDate(value, fieldName) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} inválido.`);
  }
  return date;
}

function iso(value) {
  return asDate(value, 'data').toISOString();
}

function normalizePositiveInteger(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.floor(number), max);
}

function retryDelayForAttempt(attempts, delays = DEFAULT_RETRY_DELAYS_MS) {
  const safeDelays = Array.isArray(delays) && delays.length
    ? delays.map((value) => Math.max(1_000, Number(value) || 1_000))
    : DEFAULT_RETRY_DELAYS_MS;
  const parsedAttempts = Number(attempts);
  const safeAttempts = Number.isFinite(parsedAttempts) && parsedAttempts >= 1
    ? Math.floor(parsedAttempts)
    : 1;
  const attemptIndex = safeAttempts - 1;
  return safeDelays[Math.min(attemptIndex, safeDelays.length - 1)];
}

function retryAtForOperation(operation, referenceDate, retryAfterMs, delays) {
  const base = asDate(referenceDate, 'referenceDate');
  const hasExplicitDelay = retryAfterMs !== null && retryAfterMs !== undefined && retryAfterMs !== '';
  const explicitDelay = hasExplicitDelay ? Number(retryAfterMs) : NaN;
  const delayMs = Number.isFinite(explicitDelay) && explicitDelay >= 0
    ? explicitDelay
    : retryDelayForAttempt(operation && operation.attempts, delays);
  return new Date(base.getTime() + delayMs).toISOString();
}

function normalizeTransportResult(result) {
  if (result == null) {
    return { status: 'CONFIRMED', ack: {} };
  }
  if (typeof result !== 'object') {
    throw new Error('Transport retornou resultado inválido.');
  }

  const status = String(result.status || 'CONFIRMED').trim().toUpperCase();
  if (!['CONFIRMED', 'RETRY', 'CONFLICT', 'MANUAL_REVIEW'].includes(status)) {
    throw new Error(`Status de transporte não suportado: ${status}.`);
  }

  return {
    status,
    ack: result.ack == null ? {} : result.ack,
    error: result.error == null ? null : String(result.error),
    retryAfterMs: result.retryAfterMs
  };
}

async function applyTransportResult(operation, result, finishedAt, retryDelaysMs) {
  const base = {
    empresaId: operation.empresaId,
    operationId: operation.operationId,
    updatedAt: finishedAt
  };

  if (result.status === 'CONFIRMED') {
    return markOutboxConfirmed({
      ...base,
      confirmedAt: finishedAt,
      ack: result.ack
    }).operation;
  }

  if (result.status === 'CONFLICT') {
    return markOutboxConflict({
      ...base,
      error: result.error || 'Conflito retornado pelo transporte.'
    }).operation;
  }

  if (result.status === 'MANUAL_REVIEW') {
    return markOutboxManualReview({
      ...base,
      error: result.error || 'Operação enviada para revisão manual.'
    }).operation;
  }

  return markOutboxRetry({
    ...base,
    error: result.error || 'Falha temporária no transporte.',
    nextAttemptAt: retryAtForOperation(
      operation,
      finishedAt,
      result.retryAfterMs,
      retryDelaysMs
    )
  }).operation;
}

async function processOutboxOnce(input = {}) {
  const empresaId = String(input.empresaId || '').trim();
  if (!empresaId) throw new Error('empresaId é obrigatório.');
  if (typeof input.transport !== 'function') {
    throw new Error('transport deve ser uma função assíncrona.');
  }

  const limit = normalizePositiveInteger(input.limit, 10, 100);
  const referenceAt = input.referenceAt ? iso(input.referenceAt) : new Date().toISOString();
  const retryDelaysMs = input.retryDelaysMs;
  const ready = listOutboxReady({ empresaId, referenceAt, limit });
  const results = [];

  for (const candidate of ready) {
    const startedAt = typeof input.now === 'function'
      ? iso(input.now())
      : referenceAt;
    const claim = claimOutboxOperation({
      empresaId,
      operationId: candidate.operationId,
      startedAt,
      referenceAt
    });

    if (!claim.claimed || !claim.operation) {
      results.push({
        operationId: candidate.operationId,
        outcome: 'SKIPPED_NOT_CLAIMED'
      });
      continue;
    }

    const claimedOperation = claim.operation;
    try {
      const rawResult = await input.transport(claimedOperation);
      const result = normalizeTransportResult(rawResult);
      const finishedAt = typeof input.now === 'function'
        ? iso(input.now())
        : new Date().toISOString();
      const finalOperation = await applyTransportResult(
        claimedOperation,
        result,
        finishedAt,
        retryDelaysMs
      );
      results.push({
        operationId: candidate.operationId,
        outcome: finalOperation ? finalOperation.status : result.status,
        operation: finalOperation
      });
    } catch (error) {
      const finishedAt = typeof input.now === 'function'
        ? iso(input.now())
        : new Date().toISOString();

      if (error && error.code === 'SYNC_DEVICE_AUTH_FAILED') {
        markOutboxManualReview({
          empresaId,
          operationId: candidate.operationId,
          updatedAt: finishedAt,
          error: 'Autenticação do device recusada pelo servidor.'
        });
        throw error;
      }

      const finalOperation = markOutboxRetry({
        empresaId,
        operationId: candidate.operationId,
        updatedAt: finishedAt,
        error: String(error && error.message ? error.message : error),
        nextAttemptAt: retryAtForOperation(
          claimedOperation,
          finishedAt,
          null,
          retryDelaysMs
        )
      }).operation;
      results.push({
        operationId: candidate.operationId,
        outcome: 'RETRY',
        operation: finalOperation
      });
    }
  }

  return {
    empresaId,
    referenceAt,
    considered: ready.length,
    processed: results.filter((item) => item.outcome !== 'SKIPPED_NOT_CLAIMED').length,
    results
  };
}

function recoverInterruptedOutbox(input = {}) {
  const empresaId = String(input.empresaId || '').trim();
  if (!empresaId) throw new Error('empresaId é obrigatório.');
  const staleBefore = iso(input.staleBefore);
  const updatedAt = input.updatedAt ? iso(input.updatedAt) : new Date().toISOString();
  const nextAttemptAt = input.nextAttemptAt ? iso(input.nextAttemptAt) : updatedAt;
  return recoverStaleOutbox({ empresaId, staleBefore, updatedAt, nextAttemptAt });
}

module.exports = {
  DEFAULT_RETRY_DELAYS_MS,
  retryDelayForAttempt,
  retryAtForOperation,
  normalizeTransportResult,
  processOutboxOnce,
  recoverInterruptedOutbox
};
