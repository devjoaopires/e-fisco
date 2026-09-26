'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

const DEFAULT_SYNC_PUSH_URL = 'https://api.e-fisco.app/sync/push';
const DEFAULT_SYNC_DEVICE_PING_URL = 'https://api.e-fisco.app/sync/device/ping';
const DEFAULT_SYNC_REFERENCE_PULL_URL = 'https://api.e-fisco.app/sync/reference/pull';
const DEFAULT_SYNC_MULTI_COMPANY_BOOTSTRAP_URL =
  'https://api.e-fisco.app/sync/device/bootstrap-multiempresa';
const DEFAULT_SYNC_CASH_STATE_URL = 'https://api.e-fisco.app/sync/cash/state';
const DEFAULT_SYNC_CASH_SUMMARY_URL = 'https://api.e-fisco.app/sync/cash/summary';
const DEFAULT_SYNC_FISCAL_CERTIFICATE_SOURCE_URL = 'https://api.e-fisco.app/sync/fiscal/certificate/source';
const DEFAULT_SYNC_FISCAL_CERTIFICATE_PROVISION_URL = 'https://api.e-fisco.app/sync/fiscal/certificate/provision';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_LARGE_RESPONSE_BYTES = 8 * 1024 * 1024;

function requiredText(value, fieldName) {
  const text = String(value == null ? '' : value).trim();
  if (!text) throw new Error(`${fieldName} é obrigatório.`);
  return text;
}

function normalizeTimeout(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.floor(number), 60_000);
}

function decimalValueToCents(value, fieldName, allowNegative = true) {
  const number = Number(value);
  if (!Number.isFinite(number) || (!allowNegative && number < 0)) {
    throw new Error(`${fieldName} inválido no resumo remoto do caixa.`);
  }
  const cents = Math.round((number + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`${fieldName} excede o limite seguro no resumo remoto do caixa.`);
  }
  return cents;
}

function isLocalHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

function validateEndpoint(endpoint, allowInsecureLocalhost) {
  const parsed = new URL(requiredText(endpoint, 'endpoint'));
  if (parsed.protocol === 'https:') return parsed;
  if (parsed.protocol === 'http:' && allowInsecureLocalhost === true && isLocalHost(parsed.hostname)) {
    return parsed;
  }
  throw new Error('Endpoint de sync deve usar HTTPS. HTTP só é permitido para localhost em self-test.');
}

function operationEnvelope(operation, options = {}) {
  if (!operation || typeof operation !== 'object') {
    throw new Error('Operação da outbox inválida.');
  }

  return {
    protocolVersion: 1,
    empresaId: requiredText(operation.empresaId, 'operation.empresaId'),
    operationId: requiredText(operation.operationId, 'operation.operationId'),
    type: requiredText(operation.type, 'operation.type'),
    entityId: requiredText(operation.entityId, 'operation.entityId'),
    payload: operation.payload == null ? {} : operation.payload,
    dependencies: Array.isArray(operation.dependencies) ? operation.dependencies : [],
    attempts: Number(operation.attempts || 0),
    createdAt: operation.createdAt || null,
    deviceId: options.deviceId ? String(options.deviceId) : null
  };
}

function retryAfterMsFromHeaders(headers) {
  const value = headers && headers['retry-after'];
  if (value == null || value === '') return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.floor(seconds * 1000);
  }

  const when = new Date(String(value));
  if (!Number.isNaN(when.getTime())) {
    return Math.max(0, when.getTime() - Date.now());
  }
  return undefined;
}

function normalizeServerResult(statusCode, body, headers) {
  const parsedBody = body && typeof body === 'object' ? body : {};
  const httpStatus = Number(statusCode || 0);
  const authFailure = httpStatus === 401 || httpStatus === 403;
  const serverError = parsedBody.error == null
    ? (parsedBody.erro == null ? null : String(parsedBody.erro))
    : String(parsedBody.error);
  const explicitStatus = String(parsedBody.status || '').trim().toUpperCase();
  if (['CONFIRMED', 'RETRY', 'CONFLICT', 'MANUAL_REVIEW'].includes(explicitStatus)) {
    return {
      status: explicitStatus,
      ack: parsedBody.ack != null
        ? parsedBody.ack
        : (parsedBody.result != null ? parsedBody.result : {}),
      error: serverError,
      retryAfterMs: parsedBody.retryAfterMs == null
        ? retryAfterMsFromHeaders(headers)
        : Number(parsedBody.retryAfterMs),
      httpStatus,
      authFailure
    };
  }

  if (httpStatus >= 200 && httpStatus < 300) {
    return {
      status: 'CONFIRMED',
      ack: parsedBody.ack == null ? parsedBody : parsedBody.ack,
      httpStatus,
      authFailure: false
    };
  }
  if (httpStatus === 409) {
    return {
      status: 'CONFLICT',
      ack: {},
      error: String(serverError || 'Conflito retornado pelo servidor.'),
      httpStatus,
      authFailure: false
    };
  }
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 422) {
    return {
      status: 'MANUAL_REVIEW',
      ack: {},
      error: String(serverError || `HTTP ${httpStatus}.`),
      httpStatus,
      authFailure
    };
  }
  if (httpStatus === 408 || httpStatus === 425 || httpStatus === 429 || httpStatus >= 500) {
    return {
      status: 'RETRY',
      ack: {},
      error: String(serverError || `HTTP ${httpStatus}.`),
      retryAfterMs: retryAfterMsFromHeaders(headers),
      httpStatus,
      authFailure: false
    };
  }
  return {
    status: 'MANUAL_REVIEW',
    ack: {},
    error: String(serverError || `HTTP ${httpStatus}.`),
    httpStatus,
    authFailure
  };
}

function requestJson(endpoint, payload, options = {}) {
  const url = validateEndpoint(endpoint, options.allowInsecureLocalhost === true);
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const transport = url.protocol === 'https:' ? https : http;
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const requestedMaxResponseBytes = Number(options.maxResponseBytes);
  const maxResponseBytes = Number.isFinite(requestedMaxResponseBytes) && requestedMaxResponseBytes > 0
    ? Math.min(Math.max(Math.floor(requestedMaxResponseBytes), MAX_RESPONSE_BYTES), MAX_LARGE_RESPONSE_BYTES)
    : MAX_RESPONSE_BYTES;

  const headers = {
    'content-type': 'application/json; charset=utf-8',
    accept: 'application/json',
    'content-length': String(body.length),
    'user-agent': 'e-fisco-desktop-sync/1',
    'x-efisco-sync-protocol': '1'
  };
  if (options.deviceId) headers['x-efisco-device-id'] = String(options.deviceId);
  if (options.deviceToken) headers.authorization = `Bearer ${String(options.deviceToken)}`;

  return new Promise((resolve, reject) => {
    const req = transport.request(url, {
      method: 'POST',
      headers,
      timeout: timeoutMs
    }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxResponseBytes) {
          req.destroy(new Error('Resposta do sync excedeu o limite seguro.'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8').trim();
        let parsed = {};
        if (text) {
          try {
            parsed = JSON.parse(text);
          } catch (_) {
            parsed = { error: `Resposta HTTP ${res.statusCode} não é JSON válido.` };
          }
        }
        resolve(normalizeServerResult(Number(res.statusCode || 0), parsed, res.headers || {}));
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error(`Timeout de sync após ${timeoutMs}ms.`));
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function pingSyncDevice(options = {}) {

  const endpoint = options.endpoint || DEFAULT_SYNC_DEVICE_PING_URL;

  const deviceId = requiredText(options.deviceId, 'deviceId');

  const deviceToken = requiredText(options.deviceToken, 'deviceToken');



  const result = await requestJson(endpoint, {}, {

    deviceId,

    deviceToken,

    timeoutMs: options.timeoutMs,

    allowInsecureLocalhost: options.allowInsecureLocalhost === true

  });



  if (result && result.authFailure === true) {

    const error = new Error(

      result.error || 'Autenticação do device recusada pelo servidor.'

    );

    error.code = 'SYNC_DEVICE_AUTH_FAILED';

    error.httpStatus = result.httpStatus;

    throw error;

  }



  if (!result || result.status !== 'CONFIRMED' || !result.ack || typeof result.ack !== 'object') {

    throw new Error(

      String(result && result.error || 'Ping autenticado do device falhou.')

    );

  }



  const returnedDeviceId = requiredText(result.ack.deviceId, 'deviceId retornado');

  if (returnedDeviceId !== deviceId) {

    throw new Error('Servidor retornou deviceId diferente do device local.');

  }



  const empresaId = requiredText(result.ack.empresaId, 'empresaId retornado');

  return {

    status: String(result.ack.status || 'OK'),

    deviceId: returnedDeviceId,

    empresaId

  };

}



async function bootstrapSyncMultiCompany(options = {}) {
  const endpoint =
    options.endpoint ||
    DEFAULT_SYNC_MULTI_COMPANY_BOOTSTRAP_URL;

  const deviceId =
    requiredText(
      options.deviceId,
      'deviceId'
    );

  const deviceToken =
    requiredText(
      options.deviceToken,
      'deviceToken'
    );

  const expectedRootEmpresaId =
    options.rootEmpresaId == null
      ? null
      : requiredText(
          options.rootEmpresaId,
          'rootEmpresaId'
        );

  const cursor =
    options.cursor == null
      ? ''
      : String(
          options.cursor
        )
          .trim()
          .slice(0, 128);

  const rawLimit =
    Number(
      options.limit
    );

  const limit =
    Number.isFinite(rawLimit) &&
    rawLimit > 0
      ? Math.min(
          Math.trunc(rawLimit),
          50
        )
      : 25;

  const result =
    await requestJson(
      endpoint,
      {
        cursor,
        limit
      },
      {
        deviceId,
        deviceToken,
        timeoutMs:
          options.timeoutMs,
        maxResponseBytes:
          MAX_LARGE_RESPONSE_BYTES,
        allowInsecureLocalhost:
          options.allowInsecureLocalhost ===
          true
      }
    );

  if (
    result &&
    result.authFailure === true
  ) {
    const error =
      new Error(
        result.error ||
        'Autenticação do device raiz recusada no bootstrap multiempresa.'
      );

    error.code =
      'SYNC_DEVICE_AUTH_FAILED';
    error.httpStatus =
      result.httpStatus;
    throw error;
  }

  if (
    !result ||
    result.status !== 'CONFIRMED' ||
    !result.ack ||
    typeof result.ack !== 'object'
  ) {
    const error =
      new Error(
        String(
          result &&
          result.error ||
          'Bootstrap multiempresa não foi confirmado.'
        )
      );

    error.code =
      'SYNC_MULTI_COMPANY_BOOTSTRAP_FAILED';
    error.httpStatus =
      result &&
      result.httpStatus;
    throw error;
  }

  const ack =
    result.ack;

  if (
    String(
      ack.status || ''
    )
      .trim()
      .toUpperCase() !== 'OK'
  ) {
    throw new Error(
      'Servidor retornou status inválido no bootstrap multiempresa.'
    );
  }

  const returnedDeviceId =
    requiredText(
      ack.deviceId,
      'deviceId retornado'
    );

  if (
    returnedDeviceId !==
    deviceId
  ) {
    throw new Error(
      'Servidor retornou deviceId diferente no bootstrap multiempresa.'
    );
  }

  const rootEmpresaId =
    requiredText(
      ack.rootEmpresaId,
      'rootEmpresaId retornado'
    );

  if (
    expectedRootEmpresaId &&
    rootEmpresaId !==
      expectedRootEmpresaId
  ) {
    throw new Error(
      'Servidor retornou empresa raiz diferente no bootstrap multiempresa.'
    );
  }

  const companies =
    Array.isArray(
      ack.companies
    )
      ? ack.companies
      : [];

  return {
    status: 'OK',
    deviceId:
      returnedDeviceId,
    rootEmpresaId,
    companies,
    nextCursor:
      ack.nextCursor == null
        ? null
        : String(
            ack.nextCursor
          )
            .trim()
            .slice(0, 128) ||
          null,
    done:
      ack.done === true
  };
}

function normalizeReferencePullLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 100;
  return Math.min(Math.floor(number), 250);
}

function normalizeReferenceCursor(value, fieldName) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > 256) {
    throw new Error(`${fieldName} excede o limite seguro de 256 caracteres.`);
  }
  return text;
}

function referencePullPayload(options = {}) {
  const cursors = options.cursors && typeof options.cursors === 'object'
    ? options.cursors
    : {};
  const completed = options.completed && typeof options.completed === 'object'
    ? options.completed
    : {};

  const fiscalCounter =
    options.fiscalCounter &&
    typeof options.fiscalCounter === 'object' &&
    !Array.isArray(options.fiscalCounter)
      ? options.fiscalCounter
      : null;

  let normalizedFiscalCounter = null;
  if (fiscalCounter) {
    const proximoNumero =
      Number(fiscalCounter.proximoNumero);
    const modelo =
      Number(
        fiscalCounter.modelo == null
          ? 65
          : fiscalCounter.modelo
      );
    const serie =
      String(
        fiscalCounter.serie == null
          ? ''
          : fiscalCounter.serie
      ).trim();

    if (
      Number.isSafeInteger(proximoNumero) &&
      proximoNumero > 0 &&
      modelo === 65 &&
      serie
    ) {
      normalizedFiscalCounter = {
        ambiente: 'PRODUCAO',
        modelo: 65,
        serie,
        proximoNumero
      };
    }
  }

  return {
    limit: normalizeReferencePullLimit(options.limit),
    fiscalCounter: normalizedFiscalCounter,
    cursors: {
      products: normalizeReferenceCursor(cursors.products, 'cursors.products'),
      customers: normalizeReferenceCursor(cursors.customers, 'cursors.customers'),
      suppliers: normalizeReferenceCursor(cursors.suppliers, 'cursors.suppliers'),
      crediarios: normalizeReferenceCursor(cursors.crediarios, 'cursors.crediarios')
    },
    completed: {
      products: completed.products === true,
      customers: completed.customers === true,
      suppliers: completed.suppliers === true,
      crediarios: completed.crediarios === true
    }
  };
}

async function pullSyncReferences(options = {}) {
  const endpoint = options.endpoint || DEFAULT_SYNC_REFERENCE_PULL_URL;
  const deviceId = requiredText(options.deviceId, 'deviceId');
  const deviceToken = requiredText(options.deviceToken, 'deviceToken');
  const expectedEmpresaId = options.empresaId == null
    ? null
    : requiredText(options.empresaId, 'empresaId');
  const payload = referencePullPayload(options);

  const result = await requestJson(endpoint, payload, {
    deviceId,
    deviceToken,
    timeoutMs: options.timeoutMs,
    allowInsecureLocalhost: options.allowInsecureLocalhost === true
  });

  if (!result || result.status !== 'CONFIRMED' || !result.ack || typeof result.ack !== 'object') {
    throw new Error(String(result && result.error || 'Pull autenticado de referências falhou.'));
  }

  const ack = result.ack;
  const returnedStatus = String(ack.status || '').trim().toUpperCase();
  if (returnedStatus !== 'OK') {
    throw new Error('Servidor retornou status inválido no pull de referências.');
  }

  const empresaId = requiredText(ack.empresaId, 'empresaId retornado');
  if (expectedEmpresaId && empresaId !== expectedEmpresaId) {
    throw new Error('Servidor retornou empresaId diferente da identidade autenticada local.');
  }

  if (
    !Array.isArray(ack.products) ||
    !Array.isArray(ack.customers) ||
    !Array.isArray(ack.suppliers) ||
    !Array.isArray(ack.crediarios)
  ) {
    throw new Error('Servidor retornou coleções inválidas no pull de referências.');
  }

  let fiscalProfile = null;
  if (ack.fiscalProfile != null) {
    if (typeof ack.fiscalProfile !== 'object' || Array.isArray(ack.fiscalProfile)) {
      throw new Error('Servidor retornou fiscalProfile inválido.');
    }
    fiscalProfile = ack.fiscalProfile;
  }

  const returnedCursors = ack.cursors && typeof ack.cursors === 'object' ? ack.cursors : {};
  const returnedDone = ack.done && typeof ack.done === 'object' ? ack.done : {};
  const cursors = {
    products: normalizeReferenceCursor(returnedCursors.products, 'cursors.products retornado'),
    customers: normalizeReferenceCursor(returnedCursors.customers, 'cursors.customers retornado'),
    suppliers: normalizeReferenceCursor(returnedCursors.suppliers, 'cursors.suppliers retornado'),
    crediarios: normalizeReferenceCursor(returnedCursors.crediarios, 'cursors.crediarios retornado')
  };
  const done = {
    products: returnedDone.products === true,
    customers: returnedDone.customers === true,
    suppliers: returnedDone.suppliers === true,
    crediarios: returnedDone.crediarios === true
  };

  for (const name of ['products', 'customers', 'suppliers', 'crediarios']) {
    if (!done[name] && !cursors[name]) {
      throw new Error(`Servidor não retornou cursor para ${name} ainda não concluído.`);
    }
    if (done[name] && cursors[name]) {
      throw new Error(`Servidor retornou cursor para ${name} já concluído.`);
    }
  }

  return {
    status: returnedStatus,
    empresaId,
    serverTime: ack.serverTime == null ? null : String(ack.serverTime),
    limit: normalizeReferencePullLimit(ack.limit),
    products: ack.products,
    customers: ack.customers,
    suppliers: ack.suppliers,
    crediarios: ack.crediarios,
    fiscalProfile,
    cursors,
    done
  };
}

async function pullSyncCashState(options = {}) {
  const endpoint = options.endpoint || DEFAULT_SYNC_CASH_STATE_URL;
  const deviceId = requiredText(options.deviceId, 'deviceId');
  const deviceToken = requiredText(options.deviceToken, 'deviceToken');
  const expectedEmpresaId = options.empresaId == null
    ? null
    : requiredText(options.empresaId, 'empresaId');

  const result = await requestJson(endpoint, {}, {
    deviceId,
    deviceToken,
    timeoutMs: options.timeoutMs,
    allowInsecureLocalhost: options.allowInsecureLocalhost === true
  });

  if (result && result.authFailure === true) {
    const error = new Error(result.error || 'Autenticação do device recusada ao consultar o caixa.');
    error.code = 'SYNC_DEVICE_AUTH_FAILED';
    error.httpStatus = result.httpStatus;
    throw error;
  }

  if (!result || result.status !== 'CONFIRMED' || !result.ack || typeof result.ack !== 'object') {
    throw new Error(String(result && result.error || 'Consulta autenticada do estado do caixa falhou.'));
  }

  const ack = result.ack;
  if (String(ack.status || '').trim().toUpperCase() !== 'OK') {
    throw new Error('Servidor retornou status inválido na consulta do caixa.');
  }

  const empresaId = requiredText(ack.empresaId, 'empresaId retornado');
  if (expectedEmpresaId && empresaId !== expectedEmpresaId) {
    throw new Error('Servidor retornou empresaId diferente da identidade autenticada local.');
  }

  const fiscalEnvironment = requiredText(ack.fiscalEnvironment, 'fiscalEnvironment retornado');
  const aberto = ack.aberto === true;
  let caixa = null;
  if (aberto) {
    if (!ack.caixa || typeof ack.caixa !== 'object') {
      throw new Error('Servidor informou caixa aberto sem os dados da sessão.');
    }
    caixa = {
      sessionId: requiredText(ack.caixa.sessionId, 'caixa.sessionId'),
      openedAt: requiredText(ack.caixa.openedAt, 'caixa.openedAt'),
      openingBalanceCentavos: Number(ack.caixa.openingBalanceCentavos),
      fiscalEnvironment: requiredText(
        ack.caixa.fiscalEnvironment || fiscalEnvironment,
        'caixa.fiscalEnvironment'
      )
    };
    if (!Number.isSafeInteger(caixa.openingBalanceCentavos) || caixa.openingBalanceCentavos < 0) {
      throw new Error('Servidor retornou saldo inicial inválido para o caixa.');
    }
  }

  return {
    status: 'OK',
    empresaId,
    fiscalEnvironment,
    aberto,
    caixa,
    serverTime: ack.serverTime == null ? null : String(ack.serverTime)
  };
}

async function pullSyncCashSummary(options = {}) {
  const endpoint = options.endpoint || DEFAULT_SYNC_CASH_SUMMARY_URL;
  const deviceId = requiredText(options.deviceId, 'deviceId');
  const deviceToken = requiredText(options.deviceToken, 'deviceToken');
  const expectedEmpresaId = options.empresaId == null
    ? null
    : requiredText(options.empresaId, 'empresaId');

  const result = await requestJson(
    endpoint,
    {
      includeMovements:
        options.includeMovements !== false
    },
    {
      deviceId,
      deviceToken,
      timeoutMs: options.timeoutMs,
      maxResponseBytes: MAX_LARGE_RESPONSE_BYTES,
      allowInsecureLocalhost: options.allowInsecureLocalhost === true
    }
  );

  if (result && result.authFailure === true) {
    const error = new Error(
      result.error ||
      'Autenticação do device recusada ao consultar o resumo do caixa.'
    );
    error.code = 'SYNC_DEVICE_AUTH_FAILED';
    error.httpStatus = result.httpStatus;
    throw error;
  }

  if (!result || result.status !== 'CONFIRMED' || !result.ack || typeof result.ack !== 'object') {
    const error = new Error(
      String(result && result.error || 'Consulta autenticada do resumo do caixa falhou.')
    );
    error.code = 'SYNC_CASH_SUMMARY_FAILED';
    error.httpStatus = result && result.httpStatus;
    throw error;
  }

  const ack = result.ack;
  if (String(ack.status || '').trim().toUpperCase() !== 'OK') {
    throw new Error('Servidor retornou status inválido no resumo do caixa.');
  }

  const empresaId = requiredText(ack.empresaId, 'empresaId retornado');
  if (expectedEmpresaId && empresaId !== expectedEmpresaId) {
    throw new Error('Servidor retornou empresaId diferente da identidade autenticada local.');
  }

  const fiscalEnvironment = requiredText(
    ack.fiscalEnvironment,
    'fiscalEnvironment retornado'
  );
  const aberto = ack.aberto === true;
  let caixa = null;

  if (aberto) {
    if (!ack.caixa || typeof ack.caixa !== 'object') {
      throw new Error('Servidor informou caixa aberto sem os dados da sessão.');
    }

    const raw = ack.caixa;
    const resumo = raw.resumo && typeof raw.resumo === 'object'
      ? raw.resumo
      : {};
    const snapshotAt = requiredText(
      ack.serverTime || resumo.apuradoAte || new Date().toISOString(),
      'serverTime do resumo do caixa'
    );

    caixa = {
      sessionId: requiredText(
        raw.id || raw._id || raw.caixaSessaoId,
        'caixa.sessionId'
      ),
      openedAt: requiredText(
        raw.abertoEm || resumo.abertoEm,
        'caixa.openedAt'
      ),
      openingBalanceCentavos: decimalValueToCents(
        raw.saldoInicial != null ? raw.saldoInicial : resumo.saldoInicial,
        'caixa.saldoInicial',
        false
      ),
      fiscalEnvironment: requiredText(
        raw.fiscalEnvironment || fiscalEnvironment,
        'caixa.fiscalEnvironment'
      ),
      remoteSummary: {
        snapshotAt,
        vendasDinheiroCentavos: decimalValueToCents(
          resumo.vendasDinheiro || 0,
          'resumo.vendasDinheiro'
        ),
        recebimentosPixCentavos: decimalValueToCents(
          resumo.recebimentosPix || 0,
          'resumo.recebimentosPix'
        ),
        recebimentosDebitoCentavos: decimalValueToCents(
          resumo.recebimentosDebito || 0,
          'resumo.recebimentosDebito'
        ),
        recebimentosCreditoCentavos: decimalValueToCents(
          resumo.recebimentosCredito || 0,
          'resumo.recebimentosCredito'
        ),
        sangriasCentavos: decimalValueToCents(
          resumo.sangrias || 0,
          'resumo.sangrias'
        ),
        suprimentosCentavos: decimalValueToCents(
          resumo.suprimentos || 0,
          'resumo.suprimentos'
        ),
        ajustesCentavos: decimalValueToCents(
          resumo.ajustes || 0,
          'resumo.ajustes'
        ),
        saldoEsperadoCentavos: decimalValueToCents(
          resumo.saldoEsperado != null
            ? resumo.saldoEsperado
            : raw.saldoEsperado,
          'resumo.saldoEsperado'
        ),
        quantidadeVendas: Math.max(
          0,
          Math.trunc(Number(resumo.quantidadeVendas) || 0)
        ),
        quantidadeMovimentos: Math.max(
          0,
          Math.trunc(Number(resumo.quantidadeMovimentos) || 0)
        ),
        movimentos: Array.isArray(resumo.movimentos)
          ? resumo.movimentos
              .filter((item) => item && typeof item === 'object')
              .map((item) => ({ ...item }))
          : []
      }
    };
  }

  return {
    status: 'OK',
    empresaId,
    fiscalEnvironment,
    aberto,
    caixa,
    serverTime: ack.serverTime == null ? null : String(ack.serverTime)
  };
}

async function postAuthenticatedDeviceJson(options = {}) {

  const endpoint = requiredText(options.endpoint, 'endpoint');

  const deviceId = requiredText(options.deviceId, 'deviceId');

  const deviceToken = requiredText(options.deviceToken, 'deviceToken');

  const payload = options.payload && typeof options.payload === 'object' && !Array.isArray(options.payload)

    ? options.payload

    : {};



  const result = await requestJson(endpoint, payload, {

    deviceId,

    deviceToken,

    timeoutMs: options.timeoutMs,

    maxResponseBytes: options.maxResponseBytes,

    allowInsecureLocalhost: options.allowInsecureLocalhost === true

  });



  if (result && result.authFailure === true) {
    const error = new Error(result.error || 'Autenticação do device recusada pelo servidor.');
    error.code = 'SYNC_DEVICE_AUTH_FAILED';
    error.httpStatus = result.httpStatus;
    throw error;
  }
  if (!result || result.status !== 'CONFIRMED' || !result.ack || typeof result.ack !== 'object') {
    const error = new Error(String(result && result.error || 'Operação autenticada do device não foi confirmada.'));
    error.code = 'SYNC_DEVICE_POST_FAILED';
    error.httpStatus = result && result.httpStatus;
    throw error;
  }
  return result.ack;
}

function createHttpSyncTransport(options = {}) {
  const enabled = options.enabled === true;
  const endpoint = options.endpoint || DEFAULT_SYNC_PUSH_URL;
  const deviceId = options.deviceId == null ? null : String(options.deviceId);
  const deviceToken = options.deviceToken == null ? null : String(options.deviceToken);
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const allowInsecureLocalhost = options.allowInsecureLocalhost === true;

  return async function httpSyncTransport(operation) {
    if (!enabled) {
      throw new Error('Transporte HTTP de sync está desativado por padrão.');
    }
    const envelope = operationEnvelope(operation, { deviceId });
    return requestJson(endpoint, envelope, {
      deviceId,
      deviceToken,
      timeoutMs,
      allowInsecureLocalhost
    });
  };
}

module.exports = {
  DEFAULT_SYNC_PUSH_URL,
  DEFAULT_SYNC_DEVICE_PING_URL,
  DEFAULT_SYNC_REFERENCE_PULL_URL,
  DEFAULT_SYNC_MULTI_COMPANY_BOOTSTRAP_URL,
  DEFAULT_SYNC_CASH_STATE_URL,
  DEFAULT_SYNC_CASH_SUMMARY_URL,
  DEFAULT_SYNC_FISCAL_CERTIFICATE_SOURCE_URL,
  DEFAULT_SYNC_FISCAL_CERTIFICATE_PROVISION_URL,
  DEFAULT_TIMEOUT_MS,
  operationEnvelope,
  normalizeServerResult,
  pingSyncDevice,
  bootstrapSyncMultiCompany,
  referencePullPayload,
  pullSyncReferences,
  pullSyncCashState,
  pullSyncCashSummary,
  postAuthenticatedDeviceJson,
  createHttpSyncTransport
};

