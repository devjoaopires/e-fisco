'use strict';

const {
  beginImmediateTransaction
} = require('../transaction');

function nowIso() {
  return new Date().toISOString();
}

function requiredText(value, fieldName) {
  const normalized =
    String(value == null ? '' : value).trim();

  if (!normalized) {
    throw new Error(
      `${fieldName} é obrigatório para o cache offline.`
    );
  }

  return normalized;
}

function optionalText(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function parseJsonText(value) {
  if (value == null || value === '') return null;

  try {
    return JSON.parse(String(value));
  } catch (_) {
    return null;
  }
}

function normalizeLimit(
  value,
  defaultValue = 50,
  maxValue = 200
) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return defaultValue;
  }

  return Math.min(
    Math.trunc(number),
    maxValue
  );
}

function mapOutboxRow(row) {
  if (!row) return null;

  return {
    empresaId: String(row.empresa_id),
    operationId: String(row.operation_id),
    type: String(row.type),
    entityId: String(row.entity_id),
    payload: parseJsonText(row.payload_json),
    status: String(row.status),
    attempts: Number(row.attempts),
    dependencies:
      parseJsonText(row.dependencies_json) || [],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastError:
      row.last_error == null
        ? null
        : String(row.last_error),
    nextAttemptAt:
      row.next_attempt_at == null
        ? null
        : String(row.next_attempt_at),
    sendingStartedAt:
      row.sending_started_at == null
        ? null
        : String(row.sending_started_at),
    confirmedAt:
      row.confirmed_at == null
        ? null
        : String(row.confirmed_at),
    remoteAck:
      row.remote_ack_json == null
        ? null
        : parseJsonText(row.remote_ack_json)
  };
}

const OUTBOX_SELECT = `
  SELECT empresa_id, operation_id, type, entity_id, payload_json, status,
         attempts, dependencies_json, created_at, updated_at, last_error,
         next_attempt_at, sending_started_at, confirmed_at, remote_ack_json
    FROM sync_outbox
`;

function getOutboxOperation(
  db,
  empresaIdValue,
  operationIdValue
) {
  const empresaId =
    requiredText(empresaIdValue, 'empresaId');
  const operationId =
    requiredText(operationIdValue, 'operationId');

  const row = db.prepare(`${OUTBOX_SELECT}
     WHERE empresa_id = ? AND operation_id = ?
  `).get(empresaId, operationId);

  return mapOutboxRow(row);
}

function normalizeOutboxDependencies(
  value,
  operationId = ''
) {
  const source =
    Array.isArray(value) ? value : [];
  const unique = [];

  for (const item of source) {
    const dependency = optionalText(item);

    if (
      !dependency ||
      dependency === operationId ||
      unique.includes(dependency)
    ) {
      continue;
    }

    unique.push(dependency);
  }

  return unique;
}

function enqueueOutboxOperation(
  db,
  input = {}
) {
  const empresaId =
    requiredText(input.empresaId, 'empresaId');
  const operationId =
    requiredText(input.operationId, 'operationId');
  const type =
    requiredText(input.type, 'type').toUpperCase();
  const entityId =
    requiredText(input.entityId, 'entityId');
  const payload =
    input.payload == null ? {} : input.payload;
  const dependencies =
    normalizeOutboxDependencies(
      input.dependencies,
      operationId
    );
  const createdAt =
    optionalText(input.createdAt) || nowIso();

  const existing =
    getOutboxOperation(
      db,
      empresaId,
      operationId
    );

  if (existing) {
    if (
      existing.type !== type ||
      existing.entityId !== entityId
    ) {
      throw new Error(
        `operationId ${operationId} já existe com outro tipo ou entidade.`
      );
    }

    if (
      JSON.stringify(existing.payload) !==
        JSON.stringify(payload) ||
      JSON.stringify(existing.dependencies) !==
        JSON.stringify(dependencies)
    ) {
      throw new Error(
        `operationId ${operationId} já existe com outro payload ou dependências.`
      );
    }

    return {
      applied: false,
      duplicate: true,
      operation: existing
    };
  }

  db.prepare(`
    INSERT INTO sync_outbox (
      empresa_id, operation_id, type, entity_id, payload_json, status,
      attempts, dependencies_json, created_at, updated_at, last_error
    ) VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?, ?, ?, NULL)
  `).run(
    empresaId,
    operationId,
    type,
    entityId,
    JSON.stringify(payload),
    JSON.stringify(dependencies),
    createdAt,
    createdAt
  );

  return {
    applied: true,
    duplicate: false,
    operation:
      getOutboxOperation(
        db,
        empresaId,
        operationId
      )
  };
}

function listOutboxReady(
  db,
  input = {}
) {
  const empresaId =
    requiredText(input.empresaId, 'empresaId');
  const limit =
    normalizeLimit(input.limit, 50, 200);
  const referenceAt =
    optionalText(input.referenceAt) || nowIso();

  const rows = db.prepare(`
    SELECT o.empresa_id, o.operation_id, o.type, o.entity_id, o.payload_json, o.status,
           o.attempts, o.dependencies_json, o.created_at, o.updated_at, o.last_error,
           o.next_attempt_at, o.sending_started_at, o.confirmed_at, o.remote_ack_json
      FROM sync_outbox AS o
     WHERE o.empresa_id = ?
       AND (
         o.status = 'PENDING'
         OR (
           o.status = 'RETRY'
           AND (
             o.next_attempt_at IS NULL
             OR o.next_attempt_at <= ?
           )
         )
       )
       AND NOT EXISTS (
         SELECT 1
           FROM json_each(
             o.dependencies_json
           ) AS dep
           LEFT JOIN sync_outbox AS d
             ON d.empresa_id = o.empresa_id
            AND d.operation_id = dep.value
          WHERE d.operation_id IS NULL
             OR d.status <> 'CONFIRMED'
       )
     ORDER BY o.created_at, o.operation_id
     LIMIT ?
  `).all(
    empresaId,
    referenceAt,
    limit
  );

  return rows.map(mapOutboxRow);
}

function claimOutboxOperation(
  db,
  input = {}
) {
  const empresaId =
    requiredText(input.empresaId, 'empresaId');
  const operationId =
    requiredText(input.operationId, 'operationId');
  const startedAt =
    optionalText(input.startedAt) || nowIso();
  const referenceAt =
    optionalText(input.referenceAt) || startedAt;

  const transaction =
    beginImmediateTransaction(db);

  try {
    const result = db.prepare(`
      UPDATE sync_outbox
         SET status = 'SENDING',
             attempts = attempts + 1,
             updated_at = ?,
             last_error = NULL,
             next_attempt_at = NULL,
             sending_started_at = ?,
             confirmed_at = NULL,
             remote_ack_json = NULL
       WHERE empresa_id = ?
         AND operation_id = ?
         AND (
           status = 'PENDING'
           OR (
             status = 'RETRY'
             AND (
               next_attempt_at IS NULL
               OR next_attempt_at <= ?
             )
           )
         )
         AND NOT EXISTS (
           SELECT 1
             FROM json_each(
               sync_outbox.dependencies_json
             ) AS dep
             LEFT JOIN sync_outbox AS d
               ON d.empresa_id =
                    sync_outbox.empresa_id
              AND d.operation_id =
                    dep.value
            WHERE d.operation_id IS NULL
               OR d.status <> 'CONFIRMED'
         )
    `).run(
      startedAt,
      startedAt,
      empresaId,
      operationId,
      referenceAt
    );

    transaction.commit();

    return {
      claimed:
        Number(result.changes || 0) === 1,
      operation:
        getOutboxOperation(
          db,
          empresaId,
          operationId
        )
    };
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}

function transitionOutboxFromSending(
  db,
  input,
  targetStatus,
  fields = {}
) {
  const empresaId =
    requiredText(input.empresaId, 'empresaId');
  const operationId =
    requiredText(input.operationId, 'operationId');
  const updatedAt =
    optionalText(input.updatedAt) || nowIso();

  const result = db.prepare(`
    UPDATE sync_outbox
       SET status = ?,
           updated_at = ?,
           last_error = ?,
           next_attempt_at = ?,
           sending_started_at = NULL,
           confirmed_at = ?,
           remote_ack_json = ?
     WHERE empresa_id = ?
       AND operation_id = ?
       AND status = 'SENDING'
  `).run(
    targetStatus,
    updatedAt,
    fields.lastError == null
      ? null
      : String(fields.lastError),
    fields.nextAttemptAt == null
      ? null
      : String(fields.nextAttemptAt),
    fields.confirmedAt == null
      ? null
      : String(fields.confirmedAt),
    fields.remoteAck == null
      ? null
      : JSON.stringify(fields.remoteAck),
    empresaId,
    operationId
  );

  return {
    changed:
      Number(result.changes || 0) === 1,
    operation:
      getOutboxOperation(
        db,
        empresaId,
        operationId
      )
  };
}

function markOutboxRetry(
  db,
  input = {}
) {
  const nextAttemptAt =
    requiredText(
      input.nextAttemptAt,
      'nextAttemptAt'
    );

  return transitionOutboxFromSending(
    db,
    input,
    'RETRY',
    {
      lastError:
        optionalText(input.error) ||
        'Falha temporária no envio.',
      nextAttemptAt
    }
  );
}

function markOutboxConfirmed(
  db,
  input = {},
  options = {}
) {
  const empresaId =
    requiredText(input.empresaId, 'empresaId');
  const operationId =
    requiredText(input.operationId, 'operationId');
  const confirmedAt =
    optionalText(input.confirmedAt) || nowIso();
  const onConfirmed =
    typeof options.onConfirmed === 'function'
      ? options.onConfirmed
      : null;

  const transaction =
    beginImmediateTransaction(db);

  try {
    const result =
      transitionOutboxFromSending(
        db,
        {
          ...input,
          empresaId,
          operationId
        },
        'CONFIRMED',
        {
          confirmedAt,
          remoteAck:
            input.ack == null
              ? {}
              : input.ack
        }
      );

    if (
      result.changed &&
      onConfirmed
    ) {
      onConfirmed(
        db,
        empresaId,
        operationId,
        confirmedAt
      );
    }

    transaction.commit();
    return result;
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}

function markOutboxConflict(
  db,
  input = {}
) {
  return transitionOutboxFromSending(
    db,
    input,
    'CONFLICT',
    {
      lastError:
        optionalText(input.error) ||
        'Conflito detectado na sincronização.'
    }
  );
}

function markOutboxManualReview(
  db,
  input = {}
) {
  return transitionOutboxFromSending(
    db,
    input,
    'MANUAL_REVIEW',
    {
      lastError:
        optionalText(input.error) ||
        'Operação requer revisão manual.'
    }
  );
}

function recoverStaleOutbox(
  db,
  input = {}
) {
  const empresaId =
    requiredText(input.empresaId, 'empresaId');
  const staleBefore =
    requiredText(input.staleBefore, 'staleBefore');
  const updatedAt =
    optionalText(input.updatedAt) || nowIso();
  const nextAttemptAt =
    optionalText(input.nextAttemptAt) ||
    updatedAt;

  const result = db.prepare(`
    UPDATE sync_outbox
       SET status = 'RETRY',
           updated_at = ?,
           last_error = COALESCE(
             last_error,
             'Envio interrompido antes da confirmação.'
           ),
           next_attempt_at = ?,
           sending_started_at = NULL,
           confirmed_at = NULL,
           remote_ack_json = NULL
     WHERE empresa_id = ?
       AND status = 'SENDING'
       AND sending_started_at IS NOT NULL
       AND sending_started_at <= ?
  `).run(
    updatedAt,
    nextAttemptAt,
    empresaId,
    staleBefore
  );

  return Number(result.changes || 0);
}

module.exports = {
  normalizeOutboxDependencies,
  getOutboxOperation,
  enqueueOutboxOperation,
  listOutboxReady,
  claimOutboxOperation,
  markOutboxRetry,
  markOutboxConfirmed,
  markOutboxConflict,
  markOutboxManualReview,
  recoverStaleOutbox
};
