'use strict';

const crypto =
  require('crypto');

const DEFAULT_OFFLINE_TELEMETRY_ENDPOINT =
  'https://api.e-fisco.app/sync/device/telemetry';

const DEFAULT_BATCH_SIZE =
  10;

const DEFAULT_MAX_BATCHES_PER_FLUSH =
  3;

const DEFAULT_TIMEOUT_MS =
  10000;

const DEFAULT_BACKOFF_BASE_MS =
  15000;

const DEFAULT_BACKOFF_MAX_MS =
  15 * 60 * 1000;

function asText(
  value,
  maxLength = 160
) {
  const text =
    String(
      value == null
        ? ''
        : value
    )
      .trim();

  if (!text) {
    return null;
  }

  return text.slice(
    0,
    Math.max(
      1,
      Number(
        maxLength
      ) || 160
    )
  );
}

function computeTelemetryBackoffMs(
  attemptCount,
  {
    baseMs =
      DEFAULT_BACKOFF_BASE_MS,
    maxMs =
      DEFAULT_BACKOFF_MAX_MS,
    jitterRatio =
      0.2,
    random =
      Math.random
  } = {}
) {
  const attempt =
    Math.max(
      0,
      Math.floor(
        Number(
          attemptCount
        ) || 0
      )
    );

  const normalizedBase =
    Math.max(
      1000,
      Number(
        baseMs
      ) ||
      DEFAULT_BACKOFF_BASE_MS
    );

  const normalizedMax =
    Math.max(
      normalizedBase,
      Number(
        maxMs
      ) ||
      DEFAULT_BACKOFF_MAX_MS
    );

  const normalizedJitter =
    Math.max(
      0,
      Math.min(
        0.5,
        Number(
          jitterRatio
        ) || 0
      )
    );

  const exponent =
    Math.min(
      attempt,
      10
    );

  const raw =
    Math.min(
      normalizedMax,
      normalizedBase *
      (2 ** exponent)
    );

  const randomValue =
    Math.max(
      0,
      Math.min(
        1,
        Number(
          typeof random ===
            'function'
            ? random()
            : 0.5
        ) || 0
      )
    );

  const factor =
    1 -
    normalizedJitter +
    (
      randomValue *
      normalizedJitter *
      2
    );

  return Math.max(
    1000,
    Math.min(
      normalizedMax,
      Math.round(
        raw *
        factor
      )
    )
  );
}

function classifyTelemetrySendError(
  error
) {
  const code =
    asText(
      error &&
      error.code,
      80
    );

  const httpStatus =
    Number(
      error &&
      error.httpStatus
    );

  if (
    code ===
      'SYNC_DEVICE_AUTH_FAILED' ||
    httpStatus === 401 ||
    httpStatus === 403
  ) {
    return Object.freeze({
      code:
        'AUTH_INVALID',
      authInvalid:
        true
    });
  }

  if (
    Number.isFinite(
      httpStatus
    ) &&
    httpStatus >= 400
  ) {
    return Object.freeze({
      code:
        'HTTP_' +
        String(
          Math.trunc(
            httpStatus
          )
        ),
      authInvalid:
        false
    });
  }

  if (code) {
    return Object.freeze({
      code,
      authInvalid:
        false
    });
  }

  return Object.freeze({
    code:
      'NETWORK_ERROR',
    authInvalid:
      false
  });
}

function normalizeAckEventIds(
  ack
) {
  if (
    !ack ||
    typeof ack !==
      'object'
  ) {
    return [];
  }

  const status =
    String(
      ack.status || ''
    )
      .trim()
      .toUpperCase();

  if (
    status !== 'OK' &&
    status !== 'ACCEPTED'
  ) {
    return [];
  }

  const values =
    [
      ...(
        Array.isArray(
          ack.acceptedEventIds
        )
          ? ack.acceptedEventIds
          : []
      ),
      ...(
        Array.isArray(
          ack.duplicateEventIds
        )
          ? ack.duplicateEventIds
          : []
      )
    ];

  return [
    ...new Set(
      values
        .map(
          (value) =>
            asText(
              value,
              80
            )
        )
        .filter(Boolean)
    )
  ];
}

function createOfflineTelemetrySender({
  queue,
  postAuthenticatedDeviceJson,
  endpoint =
    DEFAULT_OFFLINE_TELEMETRY_ENDPOINT,
  batchSize =
    DEFAULT_BATCH_SIZE,
  maxBatchesPerFlush =
    DEFAULT_MAX_BATCHES_PER_FLUSH,
  timeoutMs =
    DEFAULT_TIMEOUT_MS,
  now =
    () => Date.now(),
  random =
    Math.random,
  randomUUID =
    () => crypto.randomUUID(),
  log =
    () => {}
} = {}) {
  if (
    !queue ||
    typeof queue.peekPending !==
      'function' ||
    typeof queue.markAttempt !==
      'function' ||
    typeof queue.acknowledge !==
      'function'
  ) {
    throw new TypeError(
      'Fila de telemetria inválida.'
    );
  }

  if (
    typeof postAuthenticatedDeviceJson !==
      'function'
  ) {
    throw new TypeError(
      'Transporte autenticado de device é obrigatório.'
    );
  }

  const normalizedBatchSize =
    Math.max(
      1,
      Math.min(
        25,
        Math.floor(
          Number(
            batchSize
          ) ||
          DEFAULT_BATCH_SIZE
        )
      )
    );

  const normalizedMaxBatches =
    Math.max(
      1,
      Math.min(
        10,
        Math.floor(
          Number(
            maxBatchesPerFlush
          ) ||
          DEFAULT_MAX_BATCHES_PER_FLUSH
        )
      )
    );

  const normalizedTimeout =
    Math.max(
      1000,
      Math.min(
        30000,
        Math.floor(
          Number(
            timeoutMs
          ) ||
          DEFAULT_TIMEOUT_MS
        )
      )
    );

  let inFlight = null;

  function scheduleRetry(
    item,
    errorCode
  ) {
    const delayMs =
      computeTelemetryBackoffMs(
        item.attemptCount,
        {
          random
        }
      );

    queue.markAttempt(
      item.queueId,
      {
        attemptedAtMs:
          now(),
        nextAttemptAtMs:
          now() +
          delayMs,
        errorCode
      }
    );

    return delayMs;
  }

  async function sendBatch(
    items,
    identity
  ) {
    const batchId =
      asText(
        randomUUID(),
        80
      );

    if (!batchId) {
      throw new Error(
        'batchId de telemetria inválido.'
      );
    }

    const ack =
      await postAuthenticatedDeviceJson({
        endpoint,
        deviceId:
          identity.deviceId,
        deviceToken:
          identity.deviceToken,
        payload: {
          schemaVersion: 1,
          batchId,
          sentAt:
            new Date(
              now()
            ).toISOString(),
          events:
            items.map(
              (item) =>
                item.payload
            )
        },
        timeoutMs:
          normalizedTimeout,
        maxResponseBytes:
          256 * 1024
      });

    const acceptedIds =
      new Set(
        normalizeAckEventIds(
          ack
        )
      );

    const acceptedQueueIds =
      [];

    const deferred =
      [];

    for (
      const item of items
    ) {
      if (
        acceptedIds.has(
          item.eventId
        )
      ) {
        acceptedQueueIds.push(
          item.queueId
        );
      } else {
        deferred.push(
          item
        );
      }
    }

    const ackResult =
      queue.acknowledge(
        acceptedQueueIds
      );

    for (
      const item of deferred
    ) {
      scheduleRetry(
        item,
        'ACK_MISSING_EVENT'
      );
    }

    return Object.freeze({
      batchId,
      attempted:
        items.length,
      accepted:
        ackResult.removed,
      deferred:
        deferred.length
    });
  }

  async function execute({
    deviceId,
    deviceToken
  } = {}) {
    if (inFlight) {
      return inFlight;
    }

    const normalizedDeviceId =
      asText(
        deviceId,
        256
      );

    const normalizedDeviceToken =
      asText(
        deviceToken,
        4096
      );

    if (
      !normalizedDeviceId ||
      !normalizedDeviceToken
    ) {
      return Object.freeze({
        status:
          'SKIPPED_IDENTITY_UNAVAILABLE',
        sent: 0,
        accepted: 0,
        deferred: 0,
        pending:
          queue.getStats
            ? queue
                .getStats()
                .pendingCount
            : null
      });
    }

    const run =
      Promise.resolve()
        .then(
          async () => {
            let sent = 0;
            let accepted = 0;
            let deferred = 0;
            let batches = 0;

            for (
              let batchIndex = 0;
              batchIndex <
                normalizedMaxBatches;
              batchIndex += 1
            ) {
              const pending =
                queue.peekPending({
                  limit:
                    normalizedBatchSize,
                  nowMs:
                    now()
                });

              if (
                pending.length < 1
              ) {
                break;
              }

              batches += 1;
              sent +=
                pending.length;

              try {
                const result =
                  await sendBatch(
                    pending,
                    {
                      deviceId:
                        normalizedDeviceId,
                      deviceToken:
                        normalizedDeviceToken
                    }
                  );

                accepted +=
                  result.accepted;

                deferred +=
                  result.deferred;

                log(
                  'OFFLINE TELEMETRY BATCH CONFIRMED',
                  {
                    batchId:
                      result.batchId,
                    attempted:
                      result.attempted,
                    accepted:
                      result.accepted,
                    deferred:
                      result.deferred
                  }
                );

                if (
                  result.accepted === 0
                ) {
                  break;
                }
              } catch (error) {
                const classified =
                  classifyTelemetrySendError(
                    error
                  );

                let maxDelayMs = 0;

                for (
                  const item of pending
                ) {
                  maxDelayMs =
                    Math.max(
                      maxDelayMs,
                      scheduleRetry(
                        item,
                        classified.code
                      )
                    );
                }

                log(
                  'OFFLINE TELEMETRY BATCH DEFERRED',
                  {
                    code:
                      classified.code,
                    authInvalid:
                      classified.authInvalid,
                    attempted:
                      pending.length,
                    retryAfterMs:
                      maxDelayMs
                  }
                );

                if (
                  classified.authInvalid
                ) {
                  const authError =
                    new Error(
                      'Autenticação do device recusada no envio de telemetria.'
                    );

                  authError.code =
                    'SYNC_DEVICE_AUTH_FAILED';

                  authError.httpStatus =
                    error &&
                    error.httpStatus;

                  throw authError;
                }

                deferred +=
                  pending.length;

                break;
              }
            }

            const pendingCount =
              queue.getStats
                ? queue
                    .getStats()
                    .pendingCount
                : null;

            const status =
              sent < 1
                ? 'NO_PENDING'
                : deferred > 0
                  ? 'PARTIAL_OR_DEFERRED'
                  : 'FLUSHED';

            const summary =
              Object.freeze({
                status,
                batches,
                sent,
                accepted,
                deferred,
                pending:
                  pendingCount
              });

            if (sent > 0) {
              log(
                'OFFLINE TELEMETRY FLUSH COMPLETED',
                summary
              );
            }

            return summary;
          }
        );

    const tracked =
      run.finally(
        () => {
          if (
            inFlight ===
            tracked
          ) {
            inFlight = null;
          }
        }
      );

    inFlight =
      tracked;

    return tracked;
  }

  return Object.freeze({
    flush:
      execute,
    isRunning() {
      return Boolean(
        inFlight
      );
    }
  });
}

module.exports = {
  DEFAULT_OFFLINE_TELEMETRY_ENDPOINT,
  DEFAULT_BATCH_SIZE,
  DEFAULT_MAX_BATCHES_PER_FLUSH,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_BACKOFF_BASE_MS,
  DEFAULT_BACKOFF_MAX_MS,
  computeTelemetryBackoffMs,
  classifyTelemetrySendError,
  normalizeAckEventIds,
  createOfflineTelemetrySender
};
