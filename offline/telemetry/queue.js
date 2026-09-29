'use strict';

const crypto =
  require('crypto');

const OFFLINE_TELEMETRY_QUEUE_SCHEMA_VERSION =
  1;

const DEFAULT_MAX_ITEMS =
  100;

const DEFAULT_MAX_BYTES =
  4 * 1024 * 1024;

const DEFAULT_RETENTION_MS =
  30 * 24 * 60 * 60 * 1000;

const MAX_SINGLE_PAYLOAD_BYTES =
  128 * 1024;

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

function sha256Hex(
  value
) {
  return crypto
    .createHash(
      'sha256'
    )
    .update(
      String(
        value == null
          ? ''
          : value
      ),
      'utf8'
    )
    .digest(
      'hex'
    );
}

function validateOfflineTelemetryPayload(
  payload
) {
  if (
    !payload ||
    typeof payload !==
      'object' ||
    Array.isArray(
      payload
    )
  ) {
    return Object.freeze({
      ok: false,
      reason:
        'PAYLOAD_NOT_OBJECT'
    });
  }

  if (
    Number(
      payload.schemaVersion
    ) !== 1
  ) {
    return Object.freeze({
      ok: false,
      reason:
        'SCHEMA_VERSION_INVALID'
    });
  }

  if (
    payload.source !==
      'e-fisco-desktop-offline'
  ) {
    return Object.freeze({
      ok: false,
      reason:
        'SOURCE_INVALID'
    });
  }

  const eventId =
    asText(
      payload.eventId,
      80
    );

  const dedupeKey =
    asText(
      payload.dedupeKey,
      96
    );

  if (
    !eventId ||
    !dedupeKey ||
    !/^sha256:[a-f0-9]{64}$/
      .test(
        dedupeKey
      )
  ) {
    return Object.freeze({
      ok: false,
      reason:
        'IDENTIFIERS_INVALID'
    });
  }

  if (
    !payload.integrity ||
    typeof payload.integrity !==
      'object' ||
    payload.integrity.algorithm !==
      'SHA-256' ||
    !/^sha256:[a-f0-9]{64}$/
      .test(
        String(
          payload.integrity
            .payloadHash ||
          ''
        )
      )
  ) {
    return Object.freeze({
      ok: false,
      reason:
        'INTEGRITY_METADATA_INVALID'
    });
  }

  const {
    integrity,
    ...unsigned
  } = payload;

  const expectedHash =
    'sha256:' +
    sha256Hex(
      JSON.stringify(
        unsigned
      )
    );

  if (
    integrity.payloadHash !==
      expectedHash
  ) {
    return Object.freeze({
      ok: false,
      reason:
        'PAYLOAD_HASH_MISMATCH'
    });
  }

  const bytes =
    Buffer.byteLength(
      JSON.stringify(
        payload
      ),
      'utf8'
    );

  if (
    bytes >
    MAX_SINGLE_PAYLOAD_BYTES
  ) {
    return Object.freeze({
      ok: false,
      reason:
        'PAYLOAD_TOO_LARGE'
    });
  }

  return Object.freeze({
    ok: true,
    eventId,
    dedupeKey,
    bytes
  });
}

function normalizeQueueItem(
  item,
  nowMs
) {
  if (
    !item ||
    typeof item !==
      'object' ||
    Array.isArray(
      item
    )
  ) {
    return null;
  }

  const validation =
    validateOfflineTelemetryPayload(
      item.payload
    );

  if (!validation.ok) {
    return null;
  }

  const queueId =
    asText(
      item.queueId,
      96
    ) ||
    validation.eventId;

  const firstEnqueuedAt =
    asText(
      item.firstEnqueuedAt,
      64
    ) ||
    asText(
      item.enqueuedAt,
      64
    ) ||
    new Date(
      nowMs
    ).toISOString();

  const updatedAt =
    asText(
      item.updatedAt,
      64
    ) ||
    firstEnqueuedAt;

  const parsedUpdatedAt =
    Date.parse(
      updatedAt
    );

  const parsedFirstAt =
    Date.parse(
      firstEnqueuedAt
    );

  if (
    !Number.isFinite(
      parsedUpdatedAt
    ) ||
    !Number.isFinite(
      parsedFirstAt
    )
  ) {
    return null;
  }

  const lastAttemptAt =
    asText(
      item.lastAttemptAt,
      64
    );

  const nextAttemptAt =
    asText(
      item.nextAttemptAt,
      64
    );

  if (
    lastAttemptAt &&
    !Number.isFinite(
      Date.parse(
        lastAttemptAt
      )
    )
  ) {
    return null;
  }

  if (
    nextAttemptAt &&
    !Number.isFinite(
      Date.parse(
        nextAttemptAt
      )
    )
  ) {
    return null;
  }

  return {
    queueId,
    eventId:
      validation.eventId,
    dedupeKey:
      validation.dedupeKey,
    firstEnqueuedAt:
      new Date(
        parsedFirstAt
      ).toISOString(),
    updatedAt:
      new Date(
        parsedUpdatedAt
      ).toISOString(),
    attemptCount:
      Math.max(
        0,
        Math.floor(
          Number(
            item.attemptCount
          ) || 0
        )
      ),
    lastAttemptAt:
      lastAttemptAt ||
      null,
    nextAttemptAt:
      nextAttemptAt ||
      null,
    lastErrorCode:
      asText(
        item.lastErrorCode,
        80
      ),
    payloadSizeBytes:
      validation.bytes,
    payload:
      item.payload
  };
}

function createOfflineTelemetryQueue({
  fs,
  path,
  getUserDataDir,
  now =
    () => Date.now(),
  maxItems =
    DEFAULT_MAX_ITEMS,
  maxBytes =
    DEFAULT_MAX_BYTES,
  retentionMs =
    DEFAULT_RETENTION_MS,
  log =
    () => {}
} = {}) {
  if (
    !fs ||
    typeof fs.readFileSync !==
      'function' ||
    typeof fs.writeFileSync !==
      'function' ||
    typeof fs.renameSync !==
      'function' ||
    !path ||
    typeof path.join !==
      'function' ||
    typeof getUserDataDir !==
      'function'
  ) {
    throw new TypeError(
      'Dependências da fila de telemetria são obrigatórias.'
    );
  }

  const itemLimit =
    Math.max(
      5,
      Math.min(
        500,
        Math.floor(
          Number(
            maxItems
          ) ||
          DEFAULT_MAX_ITEMS
        )
      )
    );

  const byteLimit =
    Math.max(
      256 * 1024,
      Math.min(
        32 * 1024 * 1024,
        Math.floor(
          Number(
            maxBytes
          ) ||
          DEFAULT_MAX_BYTES
        )
      )
    );

  const retentionLimitMs =
    Math.max(
      60 * 60 * 1000,
      Math.min(
        90 *
          24 *
          60 *
          60 *
          1000,
        Math.floor(
          Number(
            retentionMs
          ) ||
          DEFAULT_RETENTION_MS
        )
      )
    );

  let items = [];

  function queueDirectory() {
    return path.join(
      getUserDataDir(),
      'offline-telemetry'
    );
  }

  function queuePath() {
    return path.join(
      queueDirectory(),
      'pending-queue.json'
    );
  }

  function queueBackupPath() {
    return queuePath() +
      '.previous';
  }

  function serializedState(
    sourceItems = items
  ) {
    return JSON.stringify(
      {
        schemaVersion:
          OFFLINE_TELEMETRY_QUEUE_SCHEMA_VERSION,
        updatedAt:
          new Date(
            now()
          ).toISOString(),
        items:
          sourceItems
      },
      null,
      2
    ) + '\n';
  }

  function stateSizeBytes(
    sourceItems = items
  ) {
    return Buffer.byteLength(
      serializedState(
        sourceItems
      ),
      'utf8'
    );
  }

  function pruneExpired(
    sourceItems
  ) {
    const cutoff =
      now() -
      retentionLimitMs;

    return sourceItems.filter(
      (item) => {
        const updatedMs =
          Date.parse(
            item.updatedAt
          );

        return (
          Number.isFinite(
            updatedMs
          ) &&
          updatedMs >= cutoff
        );
      }
    );
  }

  function trimToLimits(
    sourceItems
  ) {
    let trimmed =
      pruneExpired(
        sourceItems
      );

    if (
      trimmed.length >
      itemLimit
    ) {
      trimmed =
        trimmed.slice(
          -itemLimit
        );
    }

    while (
      trimmed.length > 0 &&
      stateSizeBytes(
        trimmed
      ) >
        byteLimit
    ) {
      trimmed.shift();
    }

    return trimmed;
  }

  function writeAtomically() {
    const directory =
      queueDirectory();

    fs.mkdirSync(
      directory,
      {
        recursive: true
      }
    );

    const file =
      queuePath();

    const backup =
      queueBackupPath();

    const tempFile =
      file +
      '.tmp-' +
      process.pid +
      '-' +
      now();

    const content =
      serializedState();

    fs.writeFileSync(
      tempFile,
      content,
      'utf8'
    );

    try {
      fs.renameSync(
        tempFile,
        file
      );

      if (
        typeof fs.rmSync ===
          'function'
      ) {
        try {
          fs.rmSync(
            backup,
            {
              force: true
            }
          );
        } catch (_) {}
      }

      return;
    } catch (_) {}

    const hadExisting =
      typeof fs.existsSync ===
        'function'
        ? fs.existsSync(
            file
          )
        : true;

    if (hadExisting) {
      if (
        typeof fs.rmSync ===
          'function'
      ) {
        try {
          fs.rmSync(
            backup,
            {
              force: true
            }
          );
        } catch (_) {}
      }

      fs.renameSync(
        file,
        backup
      );
    }

    try {
      fs.renameSync(
        tempFile,
        file
      );

      if (
        hadExisting &&
        typeof fs.rmSync ===
          'function'
      ) {
        try {
          fs.rmSync(
            backup,
            {
              force: true
            }
          );
        } catch (_) {}
      }
    } catch (replaceError) {
      if (
        hadExisting &&
        typeof fs.existsSync ===
          'function' &&
        fs.existsSync(
          backup
        ) &&
        !fs.existsSync(
          file
        )
      ) {
        try {
          fs.renameSync(
            backup,
            file
          );
        } catch (_) {}
      }

      if (
        typeof fs.rmSync ===
          'function'
      ) {
        try {
          fs.rmSync(
            tempFile,
            {
              force: true
            }
          );
        } catch (_) {}
      }

      throw replaceError;
    }
  }

  function quarantineCorruptFile(
    file
  ) {
    if (
      typeof fs.existsSync ===
        'function' &&
      !fs.existsSync(
        file
      )
    ) {
      return;
    }

    const quarantine =
      file +
      '.corrupt-' +
      now();

    try {
      fs.renameSync(
        file,
        quarantine
      );

      log(
        'OFFLINE TELEMETRY QUEUE QUARANTINED',
        {
          file:
            path.basename
              ? path.basename(
                  quarantine
                )
              : 'pending-queue.corrupt'
        }
      );
    } catch (_) {}
  }

  function load() {
    const file =
      queuePath();

    const backup =
      queueBackupPath();

    try {
      if (
        typeof fs.existsSync ===
          'function' &&
        !fs.existsSync(
          file
        ) &&
        fs.existsSync(
          backup
        )
      ) {
        fs.renameSync(
          backup,
          file
        );

        log(
          'OFFLINE TELEMETRY QUEUE RECOVERED',
          {
            reason:
              'PREVIOUS_DURABLE_STATE'
          }
        );
      }

      if (
        typeof fs.existsSync ===
          'function' &&
        !fs.existsSync(
          file
        )
      ) {
        items = [];
        return;
      }

      const parsed =
        JSON.parse(
          fs.readFileSync(
            file,
            'utf8'
          )
        );

      if (
        !parsed ||
        Number(
          parsed.schemaVersion
        ) !==
          OFFLINE_TELEMETRY_QUEUE_SCHEMA_VERSION ||
        !Array.isArray(
          parsed.items
        )
      ) {
        throw new Error(
          'QUEUE_SCHEMA_INVALID'
        );
      }

      const normalized =
        parsed.items
          .map(
            (item) =>
              normalizeQueueItem(
                item,
                now()
              )
          )
          .filter(Boolean);

      items =
        trimToLimits(
          normalized
        );

      if (
        items.length !==
        parsed.items.length
      ) {
        writeAtomically();
      }

      if (
        typeof fs.rmSync ===
          'function'
      ) {
        try {
          fs.rmSync(
            backup,
            {
              force: true
            }
          );
        } catch (_) {}
      }
    } catch (error) {
      items = [];

      quarantineCorruptFile(
        file
      );

      log(
        'OFFLINE TELEMETRY QUEUE LOAD FAILED',
        {
          reason:
            'QUEUE_RESET'
        }
      );
    }
  }

  load();

  function enqueue(
    payload
  ) {
    const validation =
      validateOfflineTelemetryPayload(
        payload
      );

    if (!validation.ok) {
      return Object.freeze({
        ok: false,
        queued: false,
        reason:
          validation.reason
      });
    }

    const nowMs =
      now();

    const timestamp =
      new Date(
        nowMs
      ).toISOString();

    items =
      trimToLimits(
        items
      );

    const existingIndex =
      items.findIndex(
        (item) =>
          item.dedupeKey ===
          validation.dedupeKey
      );

    let action =
      'ENQUEUED';

    let queueId =
      validation.eventId;

    if (
      existingIndex >= 0
    ) {
      const existing =
        items[
          existingIndex
        ];

      queueId =
        existing.queueId;

      const replacement = {
        ...existing,
        eventId:
          validation.eventId,
        dedupeKey:
          validation.dedupeKey,
        updatedAt:
          timestamp,
        payloadSizeBytes:
          validation.bytes,
        payload
      };

      items.splice(
        existingIndex,
        1
      );

      items.push(
        replacement
      );

      action =
        'COALESCED';
    } else {
      items.push({
        queueId,
        eventId:
          validation.eventId,
        dedupeKey:
          validation.dedupeKey,
        firstEnqueuedAt:
          timestamp,
        updatedAt:
          timestamp,
        attemptCount: 0,
        lastAttemptAt: null,
        nextAttemptAt: null,
        lastErrorCode: null,
        payloadSizeBytes:
          validation.bytes,
        payload
      });
    }

    items =
      trimToLimits(
        items
      );

    const retained =
      items.some(
        (item) =>
          item.queueId ===
          queueId
      );

    writeAtomically();

    return Object.freeze({
      ok: true,
      queued:
        retained,
      action:
        retained
          ? action
          : 'EVICTED_BY_LIMIT',
      queueId:
        retained
          ? queueId
          : null,
      pendingCount:
        items.length,
      queueSizeBytes:
        stateSizeBytes()
    });
  }

  function peekPending({
    limit = 10,
    nowMs =
      now()
  } = {}) {
    const normalizedLimit =
      Math.max(
        1,
        Math.min(
          50,
          Math.floor(
            Number(
              limit
            ) || 10
          )
        )
      );

    const timestamp =
      Number(
        nowMs
      );

    return Object.freeze(
      items
        .filter(
          (item) => {
            if (
              !item.nextAttemptAt
            ) {
              return true;
            }

            const next =
              Date.parse(
                item.nextAttemptAt
              );

            return (
              !Number.isFinite(
                next
              ) ||
              next <= timestamp
            );
          }
        )
        .slice(
          0,
          normalizedLimit
        )
        .map(
          (item) =>
            Object.freeze({
              ...item
            })
        )
    );
  }

  function markAttempt(
    queueIdValue,
    {
      attemptedAtMs =
        now(),
      nextAttemptAtMs =
        null,
      errorCode =
        null
    } = {}
  ) {
    const queueId =
      asText(
        queueIdValue,
        96
      );

    if (!queueId) {
      return false;
    }

    const index =
      items.findIndex(
        (item) =>
          item.queueId ===
          queueId
      );

    if (index < 0) {
      return false;
    }

    const attemptedAt =
      Number(
        attemptedAtMs
      );

    const nextAt =
      nextAttemptAtMs == null
        ? null
        : Number(
            nextAttemptAtMs
          );

    items[index] = {
      ...items[index],
      attemptCount:
        items[index]
          .attemptCount +
        1,
      lastAttemptAt:
        new Date(
          Number.isFinite(
            attemptedAt
          )
            ? attemptedAt
            : now()
        ).toISOString(),
      nextAttemptAt:
        Number.isFinite(
          nextAt
        )
          ? new Date(
              nextAt
            ).toISOString()
          : null,
      lastErrorCode:
        asText(
          errorCode,
          80
        )
    };

    writeAtomically();

    return true;
  }

  function acknowledge(
    queueIds
  ) {
    const requested =
      new Set(
        (
          Array.isArray(
            queueIds
          )
            ? queueIds
            : [
                queueIds
              ]
        )
          .map(
            (value) =>
              asText(
                value,
                96
              )
          )
          .filter(Boolean)
      );

    if (
      requested.size < 1
    ) {
      return Object.freeze({
        removed: 0,
        pendingCount:
          items.length
      });
    }

    const before =
      items.length;

    items =
      items.filter(
        (item) =>
          !requested.has(
            item.queueId
          )
      );

    const removed =
      before -
      items.length;

    if (removed > 0) {
      writeAtomically();
    }

    return Object.freeze({
      removed,
      pendingCount:
        items.length
    });
  }

  function compact() {
    const before =
      items.length;

    items =
      trimToLimits(
        items
      );

    if (
      items.length !==
      before
    ) {
      writeAtomically();
    }

    return getStats();
  }

  function getStats() {
    return Object.freeze({
      schemaVersion:
        OFFLINE_TELEMETRY_QUEUE_SCHEMA_VERSION,
      pendingCount:
        items.length,
      queueSizeBytes:
        stateSizeBytes(),
      maxItems:
        itemLimit,
      maxBytes:
        byteLimit,
      retentionMs:
        retentionLimitMs,
      path:
        queuePath()
    });
  }

  return Object.freeze({
    enqueue,
    peekPending,
    markAttempt,
    acknowledge,
    compact,
    getStats
  });
}

module.exports = {
  OFFLINE_TELEMETRY_QUEUE_SCHEMA_VERSION,
  DEFAULT_MAX_ITEMS,
  DEFAULT_MAX_BYTES,
  DEFAULT_RETENTION_MS,
  validateOfflineTelemetryPayload,
  createOfflineTelemetryQueue
};
