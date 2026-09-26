'use strict';

const {
  postAuthenticatedDeviceJson
} = require('./offline-sync-http-transport');

const {
  getFiscalProfileCache,
  getFiscalNumberLeaseByRequestId,
  upsertFiscalNumberLease
} = require('./offline-db');

function requiredText(value, fieldName) {
  const text = String(value == null ? '' : value).trim();
  if (!text) throw new Error(`${fieldName} é obrigatório.`);
  return text;
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

async function reserveSyncFiscalNumberLease(options = {}) {
  const ambiente = normalizeFiscalEnvironment(options.ambiente);
  if (ambiente !== 'PRODUCAO') {
    throw new Error('Reserva fiscal remota deste fluxo exige PRODUCAO.');
  }
  const ack = await postAuthenticatedDeviceJson({
    endpoint: requiredText(options.endpoint, 'endpoint'),
    deviceId: requiredText(options.deviceId, 'deviceId'),
    deviceToken: requiredText(options.deviceToken, 'deviceToken'),
    timeoutMs: options.timeoutMs,
    allowInsecureLocalhost: options.allowInsecureLocalhost === true,
    payload: {
      requestId: requiredText(options.requestId, 'requestId'),
      ambiente,
      modelo: Number(options.modelo),
      serie: requiredText(options.serie, 'serie'),
      quantidade: Number(options.quantidade)
    }
  });
  if (!ack || typeof ack !== 'object' || !ack.lease || typeof ack.lease !== 'object') {
    throw new Error('Reserva fiscal remota não retornou lease válido.');
  }
  if (normalizeFiscalEnvironment(ack.lease.ambiente) !== 'PRODUCAO') {
    throw new Error('Servidor retornou lease fiscal em ambiente diferente de PRODUCAO.');
  }
  return {
    duplicate: ack.duplicate === true,
    lease: { ...ack.lease, ambiente: 'PRODUCAO' }
  };
}

async function reserveFiscalNumberLeaseOffline(options = {}) {
  const empresaId = requiredText(options.empresaId, 'empresaId');
  const deviceId = requiredText(options.deviceId, 'deviceId');
  const deviceToken = requiredText(options.deviceToken, 'deviceToken');
  const requestId = requiredText(options.requestId, 'requestId');

  const existing = getFiscalNumberLeaseByRequestId(empresaId, requestId);
  if (existing) {
    if (existing.deviceId !== deviceId) {
      throw new Error('requestId fiscal local já pertence a outro dispositivo.');
    }
    return { duplicate: true, localReuse: true, lease: existing };
  }

  const profile = options.fiscalProfile || getFiscalProfileCache(empresaId);
  if (!profile) throw new Error('Perfil fiscal offline ainda não está disponível.');
  if (normalizeFiscalEnvironment(profile.ambiente) !== 'PRODUCAO') {
    throw new Error('Reserva fiscal offline está habilitada somente em PRODUCAO nesta fase.');
  }
  const serie = requiredText(profile.serieNfce, 'fiscalProfile.serieNfce');
  const quantidade = options.quantidade == null ? 50 : Number(options.quantidade);
  if (!Number.isSafeInteger(quantidade) || quantidade < 1 || quantidade > 200) {
    throw new Error('quantidade fiscal deve ser inteiro entre 1 e 200.');
  }

  const remote = await reserveSyncFiscalNumberLease({
    endpoint: options.endpoint,
    deviceId,
    deviceToken,
    requestId,
    ambiente: 'PRODUCAO',
    modelo: 65,
    serie,
    quantidade,
    timeoutMs: options.timeoutMs,
    allowInsecureLocalhost: options.allowInsecureLocalhost === true
  });

  const stored = upsertFiscalNumberLease({
    empresaId,
    leaseId: remote.lease.leaseId,
    requestId,
    deviceId,
    ambiente: remote.lease.ambiente,
    modelo: remote.lease.modelo,
    serie: remote.lease.serie,
    numeroInicial: remote.lease.numeroInicial,
    numeroFinal: remote.lease.numeroFinal,
    proximoNumero: remote.lease.numeroInicial,
    status: remote.lease.status,
    reservadoEm: remote.lease.reservadoEm,
    expiraEm: remote.lease.expiraEm,
    payload: {
      source: 'SYNC_FISCAL_NUMBER_LEASE_RESERVE',
      serverDuplicate: remote.duplicate === true,
      quantidade: remote.lease.quantidade
    }
  });

  return {
    duplicate: remote.duplicate === true,
    localReuse: false,
    lease: stored
  };
}

module.exports = {
  reserveFiscalNumberLeaseOffline
};
