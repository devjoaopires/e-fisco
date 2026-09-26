'use strict';

const {
  getOfflineDatabase,
  getCashSession,
  getOpenCashSession,
  openCashSession,
  closeCashSession,
  registerCashMovement,
  aggregateCashSessionActivity,
  enqueueOutboxOperation
} = require('./offline-db');

const {
  getSyncEmpresaId
} = require('./offline-device-auth');

function text(value) {
  return String(value == null ? '' : value).trim();
}

function resolveEmpresaId(input = {}) {
  const explicitEmpresaId =
    text(
      input &&
      input.empresaId
    );

  if (explicitEmpresaId) {
    return explicitEmpresaId;
  }

  const db = getOfflineDatabase();
  const empresaId = getSyncEmpresaId({ db });
  if (!empresaId) {
    throw new Error('Empresa autenticada ainda não está disponível para o caixa offline.');
  }
  return empresaId;
}

function decimalToCents(value, fieldName, allowNegative = false) {
  const number = Number(value);
  if (!Number.isFinite(number) || (!allowNegative && number < 0)) {
    throw new Error(`${fieldName} inválido.`);
  }
  const roundedMagnitude = Math.round((Math.abs(number) + Number.EPSILON) * 100);

  const cents = number < 0 ? -roundedMagnitude : roundedMagnitude;
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`${fieldName} excede o limite seguro.`);
  }
  return cents;
}

function centsToValue(cents) {
  return Math.round((Number(cents || 0) / 100 + Number.EPSILON) * 100) / 100;
}

function parsePayload(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch (_) { return {}; }
}

function cashSessionUi(session, resumo = null) {
  if (!session) return null;
  const payload = session.payload && typeof session.payload === 'object' ? session.payload : {};
  return {
    id: session.sessionId,
    operadorId: text(
      payload.operadorId ||
      payload.operatorId
    ),
    operadorNome: text(
      payload.operadorNome ||
      payload.nomeOperador ||
      payload.operatorName
    ),
    operadorPerfil: text(
      payload.operadorPerfil ||
      payload.perfilOperador
    ),
    operadorFechamentoId: text(
      payload.operadorFechamentoId
    ),
    operadorFechamentoNome: text(
      payload.operadorFechamentoNome
    ),
    operadorFechamentoPerfil: text(
      payload.operadorFechamentoPerfil
    ),
    abertoEm: session.openedAt,
    fechadoEm: session.closedAt || '',
    saldoInicial: centsToValue(session.openingBalanceCentavos),
    saldoEsperado: resumo ? resumo.saldoEsperado : centsToValue(session.openingBalanceCentavos),
    saldoContado: payload.saldoContado == null ? 0 : Number(payload.saldoContado),
    diferenca: payload.diferenca == null ? 0 : Number(payload.diferenca),
    fiscalEnvironment: text(payload.fiscalEnvironment),
    status: session.status === 'OPEN' ? 'ABERTO' : 'FECHADO',
    observacao: text(payload.observacao),
    resumo: resumo || undefined
  };
}

function normalizeRemoteSummaryBase(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
  if (!source) return null;

  const snapshotAt = text(source.snapshotAt);
  if (!snapshotAt || Number.isNaN(new Date(snapshotAt).getTime())) {
    return null;
  }

  const cents = (field) => {
    const number = Number(source[field] || 0);
    return Number.isSafeInteger(number) ? number : 0;
  };

  return {
    snapshotAt,
    vendasDinheiroCentavos: cents('vendasDinheiroCentavos'),
    recebimentosPixCentavos: cents('recebimentosPixCentavos'),
    recebimentosDebitoCentavos: cents('recebimentosDebitoCentavos'),
    recebimentosCreditoCentavos: cents('recebimentosCreditoCentavos'),
    sangriasCentavos: cents('sangriasCentavos'),
    suprimentosCentavos: cents('suprimentosCentavos'),
    ajustesCentavos: cents('ajustesCentavos'),
    saldoEsperadoCentavos: cents('saldoEsperadoCentavos'),
    quantidadeVendas: Math.max(0, Math.trunc(Number(source.quantidadeVendas) || 0)),
    quantidadeMovimentos: Math.max(0, Math.trunc(Number(source.quantidadeMovimentos) || 0)),
    movimentos: Array.isArray(source.movimentos)
      ? source.movimentos.filter((item) => item && typeof item === 'object').map((item) => ({ ...item }))
      : []
  };
}

function mapLocalCashMovementUi(movement) {
  const signed = Number(movement.direction) * Number(movement.amountCentavos);
  const type = text(movement.movementType).toUpperCase();
  const payload = movement.payload && typeof movement.payload === 'object'
    ? movement.payload
    : {};
  return {
    id: movement.movementId,
    _id: movement.movementId,
    caixaSessaoId: movement.sessionId,
    tipo: type,
    valor: centsToValue(signed),
    motivo: text(payload.motivo || payload.meio || type),
    fornecedorId: text(payload.fornecedorId),
    fornecedorNome: text(payload.fornecedorNome),
    descricao: text(payload.descricao),
    operadorNome: text(
      payload.operadorNome ||
      payload.nomeOperador ||
      payload.operatorName
    ),
    operadorId: text(
      payload.operadorId ||
      payload.operatorId
    ),
    operadorPerfil: text(
      payload.operadorPerfil ||
      payload.perfilOperador
    ),
    chaveIdempotencia: text(movement.operationId),
    criadoEm: movement.occurredAt
  };
}

function mergeCashMovements(baseMovements, localMovements) {
  const merged = [];
  const ids = new Set();
  for (const movement of [
    ...(Array.isArray(baseMovements) ? baseMovements : []),
    ...(Array.isArray(localMovements) ? localMovements : [])
  ]) {
    if (!movement || typeof movement !== 'object') continue;
    const id = text(movement.id || movement._id || movement.movementId);
    if (id && ids.has(id)) continue;
    if (id) ids.add(id);
    merged.push({ ...movement });
  }
  return merged;
}

function buildCashSummary(empresaId, session) {
  const payload = session.payload && typeof session.payload === 'object'
    ? session.payload
    : {};
  const remoteBase = normalizeRemoteSummaryBase(payload.remoteSummaryBase);
  const delta = aggregateCashSessionActivity({
    empresaId,
    sessionId: session.sessionId,
    snapshotAt: remoteBase ? remoteBase.snapshotAt : null,
    movementLimit: 5000
  });

  const baseSaldoEsperadoCentavos = remoteBase
    ? remoteBase.saldoEsperadoCentavos
    : Number(session.openingBalanceCentavos || 0);

  const vendasDinheiroCentavos =
    Number(remoteBase && remoteBase.vendasDinheiroCentavos || 0) +
    Number(delta.vendasDinheiroCentavos || 0);
  const pixCentavos =
    Number(remoteBase && remoteBase.recebimentosPixCentavos || 0) +
    Number(delta.recebimentosPixCentavos || 0);
  const debitoCentavos =
    Number(remoteBase && remoteBase.recebimentosDebitoCentavos || 0) +
    Number(delta.recebimentosDebitoCentavos || 0);
  const creditoCentavos =
    Number(remoteBase && remoteBase.recebimentosCreditoCentavos || 0) +
    Number(delta.recebimentosCreditoCentavos || 0);
  const sangriasCentavos =
    Number(remoteBase && remoteBase.sangriasCentavos || 0) +
    Number(delta.sangriasCentavos || 0);
  const suprimentosCentavos =
    Number(remoteBase && remoteBase.suprimentosCentavos || 0) +
    Number(delta.suprimentosCentavos || 0);
  const ajustesCentavos =
    Number(remoteBase && remoteBase.ajustesCentavos || 0) +
    Number(delta.ajustesCentavos || 0);
  const expectedCentavos =
    baseSaldoEsperadoCentavos +
    Number(delta.signedCashCentavos || 0);

  const localMovements = Array.isArray(delta.movimentos)
    ? delta.movimentos.map(mapLocalCashMovementUi)
    : [];
  const movimentos = mergeCashMovements(
    remoteBase && remoteBase.movimentos,
    localMovements
  );

  return {
    abertoEm: session.openedAt,
    apuradoAte: new Date().toISOString(),
    snapshotRemotoAte: remoteBase ? remoteBase.snapshotAt : '',
    saldoInicial: centsToValue(session.openingBalanceCentavos),
    vendasDinheiro: centsToValue(vendasDinheiroCentavos),
    recebimentosPix: centsToValue(pixCentavos),
    recebimentosDebito: centsToValue(debitoCentavos),
    recebimentosCredito: centsToValue(creditoCentavos),
    sangrias: centsToValue(sangriasCentavos),
    suprimentos: centsToValue(suprimentosCentavos),
    ajustes: centsToValue(ajustesCentavos),
    saldoEsperado: centsToValue(expectedCentavos),
    quantidadeVendas:
      Number(remoteBase && remoteBase.quantidadeVendas || 0) +
      Number(delta.quantidadeVendas || 0),
    quantidadeMovimentos:
      Number(remoteBase && remoteBase.quantidadeMovimentos || 0) +
      Number(delta.quantidadeMovimentos || 0),
    movimentos
  };
}

function latestCloseDependency(db, empresaId) {
  const row = db.prepare(`
    SELECT operation_id
      FROM sync_outbox
     WHERE empresa_id = ?
       AND type = 'CASH_CLOSE'
     ORDER BY created_at DESC, operation_id DESC
     LIMIT 1
  `).get(empresaId);
  return row ? [String(row.operation_id)] : [];
}

function sessionDependencies(db, empresaId, sessionId) {
  const rows = db.prepare(`
    SELECT operation_id, type, entity_id, payload_json
      FROM sync_outbox
     WHERE empresa_id = ?
       AND type IN ('CASH_OPEN', 'CASH_MOVEMENT', 'SALE_PAID')
     ORDER BY created_at, operation_id
  `).all(empresaId);

  const dependencies = [];
  for (const row of rows) {
    const payload = parsePayload(row.payload_json);
    let belongs = false;
    if (row.type === 'CASH_OPEN') {
      belongs = String(row.entity_id) === sessionId;
    } else if (row.type === 'CASH_MOVEMENT') {
      belongs = text(payload.sessionId) === sessionId;
    } else if (row.type === 'SALE_PAID') {
      belongs = Array.isArray(payload.cashMovements) &&
        payload.cashMovements.some((movement) => text(movement && movement.sessionId) === sessionId);
    }
    if (belongs) dependencies.push(String(row.operation_id));
  }
  return [...new Set(dependencies)];
}

function mirrorRemoteCashState(state = {}) {
  const empresaId = resolveEmpresaId(state);
  const db = getOfflineDatabase();
  const returnedEmpresaId = text(state.empresaId);
  if (returnedEmpresaId && returnedEmpresaId !== empresaId) {
    throw new Error('Estado remoto do caixa pertence a outra empresa.');
  }

  const localOpen = getOpenCashSession(empresaId);
  const remoteOpen = state.aberto === true;

  if (remoteOpen) {
    const remote = state.caixa && typeof state.caixa === 'object' ? state.caixa : null;
    if (!remote) throw new Error('Servidor informou caixa aberto sem dados da sessão.');
    const sessionId = text(remote.sessionId);
    if (!sessionId) throw new Error('Sessão remota de caixa inválida.');

    if (localOpen && localOpen.sessionId !== sessionId) {
      throw new Error(
        'Existe um caixa local diferente do caixa aberto no servidor; sincronização automática bloqueada.'
      );
    }

    if (!localOpen) {
      openCashSession({
        empresaId,
        sessionId,
        operationId: `remote-cash-open:${sessionId}`,
        openingBalanceCentavos: Number(remote.openingBalanceCentavos || 0),
        openedAt: text(remote.openedAt) || new Date().toISOString(),
        payload: {
          remoteSynced: true,
          fiscalEnvironment: text(remote.fiscalEnvironment || state.fiscalEnvironment),
          remoteSummaryBase: normalizeRemoteSummaryBase(remote.remoteSummary),
          mirroredAt: new Date().toISOString()
        }
      });
    } else {
      const nextPayload = {
        ...(localOpen.payload && typeof localOpen.payload === 'object' ? localOpen.payload : {}),
        remoteSynced: true,
        fiscalEnvironment: text(remote.fiscalEnvironment || state.fiscalEnvironment),
        remoteSummaryBase:
          normalizeRemoteSummaryBase(remote.remoteSummary) ||
          normalizeRemoteSummaryBase(localOpen.payload && localOpen.payload.remoteSummaryBase),
        mirroredAt: new Date().toISOString()
      };
      db.prepare(`
        UPDATE cash_sessions
           SET payload_json = ?
         WHERE empresa_id = ? AND session_id = ?
      `).run(JSON.stringify(nextPayload), empresaId, sessionId);
    }
  } else if (localOpen) {
    const payload = localOpen.payload && typeof localOpen.payload === 'object'
      ? localOpen.payload
      : {};
    if (payload.remoteSynced === true) {
      closeCashSession({
        empresaId,
        sessionId: localOpen.sessionId,
        closedAt: text(state.serverTime) || new Date().toISOString(),
        payload: {
          remoteSynced: true,
          mirroredRemoteClosed: true,
          mirroredAt: new Date().toISOString()
        }
      });
    }
  }

  return consultCashOffline({ incluirResumo: true, empresaId });
}

function consultCashOffline(input = {}) {
  const empresaId = resolveEmpresaId(input);
  const session = getOpenCashSession(empresaId);
  if (!session) {
    return {
      success: true,
      aberto: false,
      fiscalEnvironment: '',
      caixa: null
    };
  }
  const resumo = input.incluirResumo === false ? null : buildCashSummary(empresaId, session);
  return {
    success: true,
    aberto: true,
    resumoCarregado: Boolean(resumo),
    caixa: cashSessionUi(session, resumo)
  };
}

function openCashOffline(input = {}) {
  const empresaId = resolveEmpresaId(input);
  const db = getOfflineDatabase();
  const requestId = text(input.requestId);
  if (!requestId) throw new Error('requestId é obrigatório para abrir o caixa offline.');
  const saldoInicialCentavos = decimalToCents(input.saldoInicial, 'Saldo inicial');
  const sessionId = `offline-cash:${empresaId}:${requestId}`;
  const operationId = `cash-open:${sessionId}`;
  const openedAt = new Date().toISOString();
  const dependencies = latestCloseDependency(db, empresaId);
  const prepared = db.prepare(`
    SELECT ambiente
      FROM offline_prepared_companies
     WHERE empresa_id = ?
     LIMIT 1
  `).get(empresaId);
  const ambienteRecebido = text(input.fiscalEnvironment || input.ambiente).toUpperCase();
  const ambientePreparado = text(prepared && prepared.ambiente).toUpperCase();
  const fiscalEnvironment =
    ['PRODUCAO', 'HOMOLOGACAO'].includes(ambienteRecebido)
      ? ambienteRecebido
      : (
          ['PRODUCAO', 'HOMOLOGACAO'].includes(ambientePreparado)
            ? ambientePreparado
            : 'PRODUCAO'
        );
  const payload = {
    sessionId,
    openingBalanceCentavos: saldoInicialCentavos,
    openedAt,
    observacao: text(input.observacao),
    operadorId: text(
      input.operadorId ||
      input.operatorId
    ),
    operadorNome: text(
      input.operadorNome ||
      input.nomeOperador ||
      input.operatorName
    ),
    operadorPerfil: text(
      input.operadorPerfil ||
      input.perfilOperador
    ),
    fiscalEnvironment,
    offline: true
  };

  db.exec('BEGIN IMMEDIATE;');
  try {
    const opened = openCashSession({
      empresaId,
      sessionId,
      operationId,
      openingBalanceCentavos: saldoInicialCentavos,
      openedAt,
      payload
    });
    enqueueOutboxOperation({
      empresaId,
      operationId,
      type: 'CASH_OPEN',
      entityId: sessionId,
      payload,
      dependencies,
      createdAt: openedAt
    });
    db.exec('COMMIT;');
    return {
      success: true,
      aberto: true,
      caixa: cashSessionUi(opened.session, buildCashSummary(empresaId, opened.session)),
      message: opened.duplicate ? 'O caixa já estava aberto.' : 'Caixa aberto com sucesso.'
    };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

function registerCashMovementOffline(input = {}) {
  const empresaId = resolveEmpresaId(input);
  const db = getOfflineDatabase();
  const session = getOpenCashSession(empresaId);
  if (!session) throw new Error('Não existe caixa aberto para registrar o movimento.');
  const receivedSessionId = text(input.caixaSessaoId);
  if (receivedSessionId && receivedSessionId !== session.sessionId) {
    throw new Error('A sessão informada não corresponde ao caixa atualmente aberto.');
  }
  const requestId = text(input.requestId);
  if (!requestId) throw new Error('requestId é obrigatório para o movimento offline.');
  const type = text(input.tipo).toUpperCase();
  if (!['SANGRIA', 'SUPRIMENTO', 'AJUSTE'].includes(type)) {
    throw new Error('Tipo de movimento inválido.');
  }
  const signedCentavos = decimalToCents(input.valor, 'Valor do movimento', type === 'AJUSTE');
  if (signedCentavos === 0 || (type !== 'AJUSTE' && signedCentavos < 0)) {
    throw new Error('Valor do movimento inválido.');
  }
  const direction = type === 'SANGRIA' || signedCentavos < 0 ? 'SAIDA' : 'ENTRADA';
  const amountCentavos = Math.abs(signedCentavos);
  const movementId = `cash-movement:${session.sessionId}:${requestId}`;
  const operationId = `cash-movement-op:${session.sessionId}:${requestId}`;
  const occurredAt = new Date().toISOString();
  const movementPayload = {
    motivo: text(input.motivo),
    fornecedorId: text(input.fornecedorId),
    fornecedorNome: text(input.fornecedorNome),
    descricao: text(input.descricao),
    operadorNome: text(
      input.operadorNome ||
      input.nomeOperador ||
      input.operatorName
    ),
    operadorId: text(
      input.operadorId ||
      input.operatorId
    ),
    operadorPerfil: text(
      input.operadorPerfil ||
      input.perfilOperador
    ),
    offline: true
  };
  if (!movementPayload.motivo) throw new Error('Informe o motivo do movimento de caixa.');

  db.exec('BEGIN IMMEDIATE;');
  try {
    const movement = registerCashMovement({
      empresaId,
      movementId,
      operationId,
      sessionId: session.sessionId,
      direction,
      amountCentavos,
      movementType: type,
      sourceId: movementId,
      occurredAt,
      payload: movementPayload
    });
    enqueueOutboxOperation({
      empresaId,
      operationId,
      type: 'CASH_MOVEMENT',
      entityId: movementId,
      payload: {
        movementId,
        sessionId: session.sessionId,
        direction,
        amountCentavos,
        movementType: type,
        sourceId: movementId,
        occurredAt,
        payload: movementPayload
      },
      dependencies:
        session.payload && session.payload.remoteSynced === true
          ? []
          : [session.operationId],
      createdAt: occurredAt
    });
    db.exec('COMMIT;');
    const resumo = buildCashSummary(empresaId, session);
    return {
      success: true,
      idempotente: movement.duplicate === true,
      movimento: {
        id: movementId,
        caixaSessaoId: session.sessionId,
        tipo: type,
        valor: centsToValue(signedCentavos),
        motivo: movementPayload.motivo,
        fornecedorId: movementPayload.fornecedorId,
        fornecedorNome: movementPayload.fornecedorNome,
        descricao: movementPayload.descricao,
        operadorNome: movementPayload.operadorNome,
        operadorId: movementPayload.operadorId,
        criadoEm: occurredAt
      },
      saldoEsperado: resumo.saldoEsperado,
      resumo,
      message: movement.duplicate ? `${type} já estava registrada.` : `${type} registrada com sucesso.`
    };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

function closeCashOffline(input = {}) {
  const empresaId = resolveEmpresaId(input);
  const db = getOfflineDatabase();
  const sessionId = text(input.caixaSessaoId);
  if (!sessionId) throw new Error('caixaSessaoId é obrigatório para fechar o caixa.');
  const session = getCashSession(empresaId, sessionId);
  if (!session) throw new Error('A sessão de caixa informada não existe.');

  const existingClose = db.prepare(`
    SELECT operation_id FROM sync_outbox
     WHERE empresa_id = ? AND type = 'CASH_CLOSE' AND entity_id = ?
     ORDER BY created_at DESC LIMIT 1
  `).get(empresaId, sessionId);
  if (session.status === 'CLOSED' && existingClose) {
    const payload = session.payload && typeof session.payload === 'object' ? session.payload : {};
    return {
      success: true,
      aberto: false,
      caixa: cashSessionUi(session, null),
      message: 'Caixa já estava fechado.'
    };
  }
  if (session.status !== 'OPEN') throw new Error('O caixa não está aberto para fechamento.');

  const resumo = buildCashSummary(empresaId, session);
  const saldoEsperadoCentavos = decimalToCents(resumo.saldoEsperado, 'Saldo esperado');
  const saldoContadoCentavos = decimalToCents(input.saldoContado, 'Saldo contado');
  const diferencaCentavos = saldoContadoCentavos - saldoEsperadoCentavos;
  const closedAt = new Date().toISOString();
  const operationId = `cash-close:${sessionId}`;
  const dependencies = sessionDependencies(db, empresaId, sessionId);
  const closePayload = {
    sessionId,
    closedAt,
    expectedBalanceCentavos: saldoEsperadoCentavos,
    countedBalanceCentavos: saldoContadoCentavos,
    differenceCentavos: diferencaCentavos,
    observacao: text(input.observacao),
    operadorFechamentoId: text(
      input.operadorId ||
      input.operatorId
    ),
    operadorFechamentoNome: text(
      input.operadorNome ||
      input.nomeOperador ||
      input.operatorName
    ),
    operadorFechamentoPerfil: text(
      input.operadorPerfil ||
      input.perfilOperador
    ),
    offline: true
  };

  db.exec('BEGIN IMMEDIATE;');
  try {
    const closed = closeCashSession({
      empresaId,
      sessionId,
      closedAt,
      payload: {
        observacao: text(session.payload && session.payload.observacao),
        observacaoFechamento: closePayload.observacao,
        saldoEsperado: centsToValue(saldoEsperadoCentavos),
        saldoContado: centsToValue(saldoContadoCentavos),
        diferenca: centsToValue(diferencaCentavos),
        operadorFechamentoId:
          closePayload.operadorFechamentoId,
        operadorFechamentoNome:
          closePayload.operadorFechamentoNome,
        operadorFechamentoPerfil:
          closePayload.operadorFechamentoPerfil,
        offline: true
      }
    });
    enqueueOutboxOperation({
      empresaId,
      operationId,
      type: 'CASH_CLOSE',
      entityId: sessionId,
      payload: closePayload,
      dependencies,
      createdAt: closedAt
    });
    db.exec('COMMIT;');
    return {
      success: true,
      aberto: false,
      contaFinanceiraSincronizada: false,
      saldoDisponivelFinanceiro: resumo.saldoEsperado,
      caixa: {
        ...cashSessionUi(closed.session, resumo),
        fechadoEm: closedAt,
        saldoEsperado: resumo.saldoEsperado,
        saldoContado: centsToValue(saldoContadoCentavos),
        diferenca: centsToValue(diferencaCentavos),
        status: 'FECHADO'
      },
      message: closed.duplicate ? 'Caixa já estava fechado.' : 'Caixa fechado com sucesso no modo offline.'
    };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

module.exports = {
  decimalToCents,
  centsToValue,
  buildCashSummary,
  mirrorRemoteCashState,
  consultCashOffline,
  openCashOffline,
  registerCashMovementOffline,
  closeCashOffline
};
