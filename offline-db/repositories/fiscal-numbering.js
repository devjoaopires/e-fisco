'use strict';

const { createHash } = require('crypto');
const {
  beginImmediateTransaction
} = require('../transaction');

function nowIso() {
  return new Date().toISOString();
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

function jsonText(value) {
  return JSON.stringify(value == null ? {} : value);
}

function parseJsonText(value) {
  if (value == null || value === '') return null;
  try { return JSON.parse(String(value)); } catch (_) { return null; }
}

function normalizeFiscalEnvironment(value) {
  const text = String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  if (['1', 'PRODUCAO', 'PROD'].includes(text)) return 'PRODUCAO';
  if (['2', 'HOMOLOGACAO', 'HOMOLOG', 'HOM'].includes(text)) return 'HOMOLOGACAO';
  return '';
}

function mapFiscalNumberLeaseRow(row) {
  if (!row) return null;
  return {
    empresaId: String(row.empresa_id),
    leaseId: String(row.lease_id),
    requestId: String(row.request_id),
    deviceId: String(row.device_id),
    ambiente: String(row.ambiente),
    modelo: Number(row.modelo),
    serie: String(row.serie),
    numeroInicial: Number(row.numero_inicial),
    numeroFinal: Number(row.numero_final),
    proximoNumero: Number(row.proximo_numero),
    status: String(row.status),
    reservadoEm: String(row.reservado_em),
    expiraEm: row.expira_em == null ? null : String(row.expira_em),
    updatedAt: String(row.updated_at),
    payload: parseJsonText(row.payload_json)
  };
}

function validateFiscalNumberLeaseInput(input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const leaseId = requiredText(input.leaseId, 'leaseId');
  const requestId = requiredText(input.requestId, 'requestId');
  const deviceId = requiredText(input.deviceId, 'deviceId');
  const ambiente = normalizeFiscalEnvironment(input.ambiente);
  if (!ambiente) {
    throw new Error('Ambiente fiscal inválido para o lease local.');
  }
  const modelo = Number(input.modelo);
  if (modelo !== 65) throw new Error('modelo do lease fiscal deve ser 65.');
  const serie = requiredText(input.serie, 'serie');
  const numeroInicial = Number(input.numeroInicial);
  const numeroFinal = Number(input.numeroFinal);
  if (!Number.isSafeInteger(numeroInicial) || numeroInicial < 1) {
    throw new Error('numeroInicial do lease fiscal inválido.');
  }
  if (!Number.isSafeInteger(numeroFinal) || numeroFinal < numeroInicial) {
    throw new Error('numeroFinal do lease fiscal inválido.');
  }
  const proximoNumero = input.proximoNumero == null
    ? numeroInicial
    : Number(input.proximoNumero);
  if (
    !Number.isSafeInteger(proximoNumero) ||
    proximoNumero < numeroInicial ||
    proximoNumero > numeroFinal + 1
  ) {
    throw new Error('proximoNumero do lease fiscal inválido.');
  }
  const status = String(input.status || 'ACTIVE').trim().toUpperCase();
  if (!['ACTIVE', 'EXHAUSTED', 'EXPIRED', 'REVOKED'].includes(status)) {
    throw new Error('status do lease fiscal inválido.');
  }
  return {
    empresaId,
    leaseId,
    requestId,
    deviceId,
    ambiente,
    modelo,
    serie,
    numeroInicial,
    numeroFinal,
    proximoNumero,
    status,
    reservadoEm: requiredText(input.reservadoEm, 'reservadoEm'),
    expiraEm: optionalText(input.expiraEm),
    payload: input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
      ? input.payload
      : {}
  };
}

function assertSameFiscalLease(existing, incoming) {
  const same =
    String(existing.lease_id) === incoming.leaseId &&
    String(existing.request_id) === incoming.requestId &&
    String(existing.device_id) === incoming.deviceId &&
    String(existing.ambiente) === incoming.ambiente &&
    Number(existing.modelo) === incoming.modelo &&
    String(existing.serie) === incoming.serie &&
    Number(existing.numero_inicial) === incoming.numeroInicial &&
    Number(existing.numero_final) === incoming.numeroFinal;
  if (!same) {
    throw new Error('Lease fiscal existente diverge da reserva recebida; revisão manual necessária.');
  }
}

function upsertFiscalNumberLease(db, input = {}) {
  const lease = validateFiscalNumberLeaseInput(input);

  const existingByRequest = db.prepare(`
    SELECT * FROM fiscal_number_leases
     WHERE empresa_id = ? AND request_id = ?
     LIMIT 1
  `).get(lease.empresaId, lease.requestId);
  if (existingByRequest) {
    assertSameFiscalLease(existingByRequest, lease);
    return mapFiscalNumberLeaseRow(existingByRequest);
  }

  const existingByLease = db.prepare(`
    SELECT * FROM fiscal_number_leases
     WHERE empresa_id = ? AND lease_id = ?
     LIMIT 1
  `).get(lease.empresaId, lease.leaseId);
  if (existingByLease) {
    assertSameFiscalLease(existingByLease, lease);
    return mapFiscalNumberLeaseRow(existingByLease);
  }

  const namespaceConflict = db.prepare(`
    SELECT lease_id
      FROM fiscal_number_leases
     WHERE empresa_id = ?
       AND ambiente = ?
       AND modelo = ?
       AND serie = ?
       AND NOT (numero_final < ? OR numero_inicial > ?)
     LIMIT 1
  `).get(
    lease.empresaId,
    lease.ambiente,
    lease.modelo,
    lease.serie,
    lease.numeroInicial,
    lease.numeroFinal
  );
  if (namespaceConflict) {
    throw new Error('Faixa fiscal recebida sobrepõe um lease local já existente.');
  }

  const updatedAt = nowIso();
  db.prepare(`
    INSERT INTO fiscal_number_leases (
      empresa_id, lease_id, request_id, device_id, ambiente, modelo, serie,
      numero_inicial, numero_final, proximo_numero, status,
      reservado_em, expira_em, updated_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    lease.empresaId,
    lease.leaseId,
    lease.requestId,
    lease.deviceId,
    lease.ambiente,
    lease.modelo,
    lease.serie,
    lease.numeroInicial,
    lease.numeroFinal,
    lease.proximoNumero,
    lease.status,
    lease.reservadoEm,
    lease.expiraEm,
    updatedAt,
    jsonText(lease.payload)
  );

  return getFiscalNumberLeaseById(db, lease.empresaId, lease.leaseId);
}

function getFiscalNumberLeaseById(db, empresaIdValue, leaseIdValue) {
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const leaseId = requiredText(leaseIdValue, 'leaseId');
  const row = db.prepare(`
    SELECT * FROM fiscal_number_leases
     WHERE empresa_id = ? AND lease_id = ?
     LIMIT 1
  `).get(empresaId, leaseId);
  return mapFiscalNumberLeaseRow(row);
}

function getFiscalNumberLeaseByRequestId(db, empresaIdValue, requestIdValue) {
  const empresaId = requiredText(empresaIdValue, 'empresaId');
  const requestId = requiredText(requestIdValue, 'requestId');
  const row = db.prepare(`
    SELECT * FROM fiscal_number_leases
     WHERE empresa_id = ? AND request_id = ?
     LIMIT 1
  `).get(empresaId, requestId);
  return mapFiscalNumberLeaseRow(row);
}

function selectFiscalCounterLeaseRow(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const deviceId = requiredText(input.deviceId, 'deviceId');
  const ambiente = normalizeFiscalEnvironment(input.ambiente || 'PRODUCAO');
  if (!ambiente) {
    throw new Error('Ambiente fiscal inválido para seleção do contador local.');
  }
  const modelo = Number(input.modelo == null ? 65 : input.modelo);
  if (modelo !== 65) {
    throw new Error('modelo do contador local deve ser 65.');
  }
  const serie = requiredText(input.serie, 'serie');
  const nowMs = input.now
    ? Date.parse(String(input.now))
    : Date.now();
  if (!Number.isFinite(nowMs)) {
    throw new Error('now inválido para seleção do contador local.');
  }

  const rows = db.prepare(`
    SELECT *
      FROM fiscal_number_leases
     WHERE empresa_id = ?
       AND device_id = ?
       AND ambiente = ?
       AND modelo = ?
       AND serie = ?
     ORDER BY numero_inicial ASC, reservado_em ASC, lease_id ASC
  `).all(
    empresaId,
    deviceId,
    ambiente,
    modelo,
    serie
  );

  const active = rows.find((row) => {
    if (String(row.status) !== 'ACTIVE') return false;
    if (Number(row.proximo_numero) > Number(row.numero_final)) return false;
    if (!row.expira_em) return true;
    const expiresAt = Date.parse(String(row.expira_em));
    return Number.isNaN(expiresAt) || expiresAt > nowMs;
  });

  return active || rows[0] || null;
}

function getActiveFiscalNumberLease(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const deviceId = requiredText(input.deviceId, 'deviceId');
  const ambiente = normalizeFiscalEnvironment(input.ambiente || 'PRODUCAO');
  if (!ambiente) {
    throw new Error('Ambiente fiscal inválido para seleção do lease ativo.');
  }
  const modelo = Number(input.modelo == null ? 65 : input.modelo);
  if (modelo !== 65) throw new Error('modelo do lease fiscal ativo deve ser 65.');
  const serie = requiredText(input.serie, 'serie');
  const nowMs = input.now ? Date.parse(String(input.now)) : Date.now();
  if (!Number.isFinite(nowMs)) throw new Error('now inválido para seleção do lease fiscal.');

  const rows = db.prepare(`
    SELECT * FROM fiscal_number_leases
     WHERE empresa_id = ?
       AND device_id = ?
       AND ambiente = ?
       AND modelo = ?
       AND serie = ?
       AND status = 'ACTIVE'
       AND proximo_numero <= numero_final
     ORDER BY numero_inicial ASC, reservado_em ASC, lease_id ASC
  `).all(empresaId, deviceId, ambiente, modelo, serie);

  for (const row of rows) {
    if (row.expira_em) {
      const expiresAt = Date.parse(String(row.expira_em));
      if (!Number.isNaN(expiresAt) && expiresAt <= nowMs) continue;
    }
    return mapFiscalNumberLeaseRow(row);
  }
  return null;
}

function getFiscalNumberLeaseInventory(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const deviceId = requiredText(input.deviceId, 'deviceId');
  const ambiente = normalizeFiscalEnvironment(input.ambiente || 'PRODUCAO');
  if (!ambiente) {
    throw new Error('Ambiente fiscal inválido para inventário de lease.');
  }
  const modelo = Number(input.modelo == null ? 65 : input.modelo);
  if (modelo !== 65) throw new Error('modelo do inventário fiscal deve ser 65.');
  const serie = requiredText(input.serie, 'serie');
  const nowMs = input.now ? Date.parse(String(input.now)) : Date.now();
  if (!Number.isFinite(nowMs)) throw new Error('now inválido para inventário fiscal.');

  const rows = db.prepare(`
    SELECT status, numero_inicial, numero_final, proximo_numero, expira_em
      FROM fiscal_number_leases
     WHERE empresa_id = ?
       AND device_id = ?
       AND ambiente = ?
       AND modelo = ?
       AND serie = ?
  `).all(empresaId, deviceId, ambiente, modelo, serie);

  let activeLeases = 0;
  let remainingNumbers = 0;
  let expiredLeases = 0;
  let exhaustedLeases = 0;
  for (const row of rows) {
    const status = String(row.status || '').toUpperCase();
    if (status !== 'ACTIVE') {
      if (status === 'EXHAUSTED') exhaustedLeases += 1;
      continue;
    }
    if (row.expira_em) {
      const expiresAt = Date.parse(String(row.expira_em));
      if (!Number.isNaN(expiresAt) && expiresAt <= nowMs) {
        expiredLeases += 1;
        continue;
      }
    }
    const next = Number(row.proximo_numero);
    const end = Number(row.numero_final);
    const remaining = Number.isSafeInteger(next) && Number.isSafeInteger(end) && next <= end
      ? end - next + 1
      : 0;
    if (remaining > 0) {
      activeLeases += 1;
      remainingNumbers += remaining;
    }
  }
  if (!Number.isSafeInteger(remainingNumbers)) {
    throw new Error('Inventário fiscal excedeu o limite inteiro seguro.');
  }
  return {
    activeLeases,
    remainingNumbers,
    expiredLeases,
    exhaustedLeases,
    totalLeases: rows.length
  };
}

function peekNextNfceNumber(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const deviceId = requiredText(input.deviceId, 'deviceId');
  const ambiente = normalizeFiscalEnvironment(
    input.ambiente || 'PRODUCAO'
  );
  if (!ambiente) {
    throw new Error(
      'Ambiente fiscal inválido para o contador único do caixa.'
    );
  }

  const modelo =
    Number(input.modelo == null ? 65 : input.modelo);
  if (modelo !== 65) {
    throw new Error(
      'modelo do contador único deve ser 65.'
    );
  }

  const serie = requiredText(
    input.serie,
    'serie'
  );

  const lease = getActiveFiscalNumberLease(db, {
    empresaId,
    deviceId,
    ambiente,
    modelo,
    serie,
    now: input.now
  });

  if (!lease) {
    throw new Error(
      'Contador fiscal único do caixa não está disponível.'
    );
  }

  return {
    ownerMode: 'SINGLE_CASHIER',
    ambiente,
    modelo,
    serie: String(lease.serie),
    proximoNumero: Number(lease.proximoNumero),
    counterId: String(lease.leaseId),
    status: String(lease.status)
  };
}

function reconcileLocalNfceCounter(db, input = {}) {
  const empresaId =
    requiredText(input.empresaId, 'empresaId');
  const deviceId =
    requiredText(input.deviceId, 'deviceId');
  const ambiente = normalizeFiscalEnvironment(
    input.ambiente || 'PRODUCAO'
  );
  const modelo =
    Number(input.modelo == null ? 65 : input.modelo);
  const serie =
    requiredText(input.serie, 'serie');
  const remoteNext =
    Number(input.proximoNumero);

  if (!ambiente) {
    throw new Error(
      'Ambiente fiscal inválido para sincronização do contador único.'
    );
  }
  if (modelo !== 65) {
    throw new Error(
      'modelo do contador único deve ser 65.'
    );
  }
  if (
    !Number.isSafeInteger(remoteNext) ||
    remoteNext < 1
  ) {
    throw new Error(
      'Próximo número fiscal remoto é inválido.'
    );
  }

  const updatedAt = nowIso();

  const transaction = beginImmediateTransaction(db);
  try {
    const row = selectFiscalCounterLeaseRow(db, {
      empresaId,
      deviceId,
      ambiente,
      modelo,
      serie,
      now: input.now
    });

    if (!row) {
      const namespaceSource = [
        empresaId,
        deviceId,
        ambiente,
        String(modelo),
        serie
      ].join('|');
      const namespaceHash = createHash('sha256')
        .update(namespaceSource, 'utf8')
        .digest('hex')
        .slice(0, 32);
      const initialized = upsertFiscalNumberLease(db, {
        empresaId,
        leaseId: `single-cashier-${namespaceHash}`,
        requestId: `single-cashier-init-${namespaceHash}`,
        deviceId,
        ambiente,
        modelo,
        serie,
        numeroInicial: remoteNext,
        numeroFinal: 999999999,
        proximoNumero: remoteNext,
        status: 'ACTIVE',
        reservadoEm: updatedAt,
        expiraEm: null,
        payload: {
          source: 'SYNC_REFERENCE_COUNTER_INIT',
          ownerMode: 'SINGLE_CASHIER'
        }
      });

      transaction.commit();
      return {
        ownerMode: 'SINGLE_CASHIER',
        empresaId,
        deviceId,
        ambiente,
        modelo,
        serie,
        previousNext: null,
        remoteNext,
        proximoNumero: Number(initialized.proximoNumero),
        advanced: false,
        initialized: true
      };
    }

    const currentNext =
      Number(row.proximo_numero);
    const numeroFinal =
      Number(row.numero_final);

    if (
      !Number.isSafeInteger(currentNext) ||
      currentNext < 1 ||
      !Number.isSafeInteger(numeroFinal) ||
      numeroFinal < 1
    ) {
      throw new Error(
        'Contador fiscal local está inválido.'
      );
    }

    /*
     * Enquanto ONLINE, servidor e desktop convergem sempre para o
     * maior próximo número conhecido. Isso impede regressão depois
     * de uma venda OFFLINE ainda não refletida no servidor.
     */
    const mergedNext =
      Math.max(currentNext, remoteNext);

    if (mergedNext > numeroFinal + 1) {
      throw new Error(
        'Próximo número fiscal excede o limite do contador local.'
      );
    }

    const status =
      mergedNext > numeroFinal
        ? 'EXHAUSTED'
        : 'ACTIVE';

    db.prepare(`
      UPDATE fiscal_number_leases
         SET proximo_numero = ?,
             status = ?,
             updated_at = ?
       WHERE empresa_id = ?
         AND lease_id = ?
    `).run(
      mergedNext,
      status,
      updatedAt,
      empresaId,
      String(row.lease_id)
    );

    transaction.commit();

    return {
      ownerMode: 'SINGLE_CASHIER',
      empresaId,
      deviceId,
      ambiente,
      modelo,
      serie,
      previousNext: currentNext,
      remoteNext,
      proximoNumero: mergedNext,
      advanced:
        mergedNext > currentNext
    };
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}

function consumeNextNfceNumber(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const deviceId = requiredText(input.deviceId, 'deviceId');
  const ambiente = normalizeFiscalEnvironment(
    input.ambiente || 'PRODUCAO'
  );
  const modelo = Number(input.modelo == null ? 65 : input.modelo);
  const serie = requiredText(input.serie, 'serie');
  const numero = Number(input.numero);
  const updatedAt = nowIso();

  if (!ambiente) {
    throw new Error(
      'Ambiente fiscal inválido para consumo do contador único.'
    );
  }
  if (modelo !== 65) {
    throw new Error('modelo do contador único deve ser 65.');
  }
  if (!Number.isSafeInteger(numero) || numero < 1) {
    throw new Error('numero NFC-e inválido para avançar o contador.');
  }

  const transaction = beginImmediateTransaction(db);
  try {
    const row = selectFiscalCounterLeaseRow(db, {
      empresaId,
      deviceId,
      ambiente,
      modelo,
      serie,
      now: input.now
    });

    if (!row) {
      throw new Error(
        'Contador fiscal local do caixa não foi encontrado.'
      );
    }

    const currentNext = Number(row.proximo_numero);
    const numeroFinal = Number(row.numero_final);

    if (
      !Number.isSafeInteger(currentNext) ||
      currentNext < 1 ||
      !Number.isSafeInteger(numeroFinal) ||
      numeroFinal < 1
    ) {
      throw new Error('Contador fiscal local está inválido.');
    }

    if (currentNext > numero) {
      transaction.commit();
      return {
        duplicate: true,
        ownerMode: 'SINGLE_CASHIER',
        numero,
        proximoNumero: currentNext
      };
    }

    if (currentNext !== numero) {
      throw new Error(
        `Sequência fiscal divergente: próximo local ${currentNext}, documento concluído ${numero}.`
      );
    }

    const nextNumber = numero + 1;
    const nextStatus =
      nextNumber > numeroFinal
        ? 'EXHAUSTED'
        : 'ACTIVE';

    const changed = db.prepare(`
      UPDATE fiscal_number_leases
         SET proximo_numero = ?,
             status = ?,
             updated_at = ?
       WHERE empresa_id = ?
         AND lease_id = ?
         AND proximo_numero = ?
    `).run(
      nextNumber,
      nextStatus,
      updatedAt,
      empresaId,
      String(row.lease_id),
      numero
    );

    if (Number(changed.changes || 0) !== 1) {
      throw new Error(
        'Contador fiscal mudou durante o avanço da sequência.'
      );
    }

    transaction.commit();
    return {
      duplicate: false,
      ownerMode: 'SINGLE_CASHIER',
      numero,
      proximoNumero: nextNumber
    };
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}

module.exports = {
  upsertFiscalNumberLease,
  getFiscalNumberLeaseById,
  getFiscalNumberLeaseByRequestId,
  getActiveFiscalNumberLease,
  getFiscalNumberLeaseInventory,
  peekNextNfceNumber,
  reconcileLocalNfceCounter,
  consumeNextNfceNumber
};
