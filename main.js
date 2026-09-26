const {
  app,
  BrowserWindow,
  WebContentsView,
  session,
  ipcMain,
  safeStorage,
  globalShortcut,
  net
} = require('electron');

const {
  spawn
} = require('child_process');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const https = require('https');
const { autoUpdater } = require('electron-updater');

const {
  checkDesktopManifest,
  prepareOfflinePackage
} = require('./offline-standby');

const {
  initializeOfflineDatabase,
  closeOfflineDatabase,
  getOfflineDatabase,
  upsertOfflineOperatorCredential,
  listActiveOfflineOperatorCredentials,
  listActiveProvisionedOfflineCredentials,
  deactivateOfflineOperatorCredentialsExcept,
  deactivateOfflineOperatorCredentialsOutsideCompanies,
  upsertPreparedOfflineCompany,
  getPreparedOfflineCompany,
  listPreparedOfflineCompanies,
  upsertReferenceBatch,
  finalizeCrediariosSnapshot,
  searchCustomersCache,
  listCrediariosCache,
  getCrediarioDetailCache,
  openCrediarioOfflineAtomic,
  updateCrediarioItemsOfflineAtomic,
  listCashMovements,
  getFiscalProfileCache,
  peekNextNfceNumber,
  reconcileLocalNfceCounter,
  consumeNextNfceNumber,
  listAuthorizedNfcePendingSync,
  getOutboxStatusSummary,
  enqueueOutboxOperation
} = require('./offline-db');

const {
  getOrCreateSyncDeviceId,
  hasStoredSyncDeviceToken,
  hasStoredSyncDeviceTokenForCompany,
  loadSyncDeviceToken,
  loadSyncDeviceTokenForCompany,
  getSyncEmpresaId,
  storeSyncEmpresaId,
  storeSyncDeviceToken,
  storeSyncDeviceTokenForCompany,
  clearSyncDeviceTokenForCompany
} = require('./offline-device-auth');

const {
  requestDevicePairing
} = require('./offline-device-pairing');

const {

  pingSyncDevice,

  bootstrapSyncMultiCompany,

  pullSyncReferences,

  pullSyncCashState,

  pullSyncCashSummary,

  DEFAULT_SYNC_FISCAL_CERTIFICATE_SOURCE_URL,

  postAuthenticatedDeviceJson,

  createHttpSyncTransport

} = require('./offline-sync-http-transport');

const {
  findOfflineProductForSale,
  listOfflineProductsForSale
} = require('./offline-product-service');

const {

  mirrorRemoteCashState,

  consultCashOffline,

  openCashOffline,

  registerCashMovementOffline,

  closeCashOffline

} = require('./offline-cash-service');

const {

  buildOfflineCrediarioAtomicInput,
  listOfflineSalesForFinance,
  registerPaidSaleOffline

} = require('./offline-sale-service');

const {
  provisionFiscalA1FromServer
} = require('./offline-fiscal-certificate-provisioning');

const {
  generateDanfeContingencyForSale
} = require('./offline-fiscal-nfce-danfe');

const {
  runFiscalReconnectCycle
} = require('./offline-fiscal-runtime');



const {

  processOutboxOnce,

  recoverInterruptedOutbox

} = require('./offline-outbox-worker');



const {

  startOfflineUiServer

} = require('./offline-ui-server');

const URL_E_FISCO =
  'https://jpiresoficial.wixstudio.com/e-fisco';

function parseUrlSegura(rawUrl) {
  const value = String(rawUrl == null ? '' : rawUrl).trim();

  if (!value) {
    return null;
  }

  try {
    return new URL(value);
  } catch (_) {
    return null;
  }
}

const PRINTER_NAME =
  'IMPRESSORA FISCAL';

const VERSION = app.getVersion();

const FRAME_NFCE_COUNTER_MARKER = '__EFISCO_NFCE_COUNTER_FRAME_V1__';
const FRAME_NFCE_COUNTER_RESPONSE_EVENT = '__EFISCO_NFCE_COUNTER_RESPONSE_V1__';
const FRAME_ONLINE_NFCE_NUMBER_RESPONSE_MARKER =
  '__EFISCO_ONLINE_NFCE_NUMBER_RESPONSE_V1__';
const OFFLINE_OPERATOR_CREDENTIAL_CANDIDATE_TTL_MS = 120_000;
const OFFLINE_LOGIN_RESET_MS=600_000;

const FRAME_PRINT_MARKER =

  '__EFISCO_NFCE_PRINT_FRAME_V5__';

const FRAME_CONTINGENCY_PRINT_DIAG_MARKER =

  '__EFISCO_NFCE_CONTINGENCIA_PRINT_DIAG_V1__';


// Trava deliberada da Etapa 39. Não possui override por env/UI/config remota.
const ENABLE_REAL_SVRS_FISCAL_TRANSMISSION = true;
let fiscalTransmissionLockLogged = false;

let mainWindow;
let offlineView = null;
let offlineViewReady = false;
let offlineViewAttached = false;
let offlineContinuityDraft = null;
let tentouRecuperar404 = false;
let versaoAtualizacaoPendente = null;
let atualizacaoEmAndamento = false;
let filaImpressao = Promise.resolve();
let timerManifestoStandby = null;

let offlineUiServer = null;

const ORIGIN_E_FISCO = (() => {
  const parsed = parseUrlSegura(URL_E_FISCO);
  return parsed ? parsed.origin : '';
})();

const INTERNAL_UPDATE_NAVIGATION_URL = 'efisco-update://start';

function isOnlineOriginAllowed(rawUrl) {
  const parsed = parseUrlSegura(rawUrl);

  return Boolean(
    parsed &&
    parsed.protocol === 'https:' &&
    !parsed.username &&
    !parsed.password &&
    parsed.origin === ORIGIN_E_FISCO
  );
}

function isOfflineOriginAllowed(rawUrl) {
  const parsed = parseUrlSegura(rawUrl);
  const offlineOrigin =
    offlineUiServer &&
    offlineUiServer.origin
      ? parseUrlSegura(offlineUiServer.origin)
      : null;

  return Boolean(
    parsed &&
    offlineOrigin &&
    parsed.protocol === 'http:' &&
    parsed.hostname === '127.0.0.1' &&
    !parsed.username &&
    !parsed.password &&
    parsed.origin === offlineOrigin.origin
  );
}

function isInternalNavigationAllowed(rawUrl) {
  return (
    String(rawUrl == null ? '' : rawUrl).trim() ===
    INTERNAL_UPDATE_NAVIGATION_URL
  );
}

const MAIN_WINDOW_NAVIGATION_POLICY = Object.freeze({
  onlineOrigin: ORIGIN_E_FISCO,
  internalUpdateCommand: INTERNAL_UPDATE_NAVIGATION_URL,
  allowOnlineSameOrigin: true,
  allowOfflineOrigin: false,
  allowRendererDataNavigation: false,
  allowFileNavigation: false,
  allowUnknownSchemes: false
});

const RENDERER_WINDOW_OPEN_POLICY = Object.freeze({
  defaultAction: 'deny',
  allowMainWindowPopups: false,
  allowOfflineViewPopups: false,
  allowExternalOpen: false,
  allowInternalCommandPopup: false
});

const OFFLINE_VIEW_NAVIGATION_POLICY = Object.freeze({
  allowExactRuntimeOrigin: true,
  allowOnlineOrigin: false,
  allowInternalCommand: false,
  allowDataNavigation: false,
  allowFileNavigation: false,
  allowUnknownSchemes: false
});

function classifyOfflineViewNavigation(rawUrl) {
  const value =
    String(rawUrl == null ? '' : rawUrl).trim();

  if (isOfflineOriginAllowed(value)) {
    return {
      decision: 'ALLOW',
      reason: 'OFFLINE_TRUSTED_RUNTIME_ORIGIN',
      url: value
    };
  }

  if (isInternalNavigationAllowed(value)) {
    return {
      decision: 'BLOCK',
      reason: 'INTERNAL_COMMAND_MAIN_WINDOW_ONLY',
      url: value
    };
  }

  if (isOnlineOriginAllowed(value)) {
    return {
      decision: 'BLOCK',
      reason: 'ONLINE_MAIN_WINDOW_ONLY',
      url: value
    };
  }

  const parsed = parseUrlSegura(value);

  if (!parsed) {
    return {
      decision: 'BLOCK',
      reason: 'INVALID_URL',
      url: value
    };
  }

  if (parsed.protocol === 'data:') {
    return {
      decision: 'BLOCK',
      reason: 'DATA_NAVIGATION_DENIED',
      url: parsed.href
    };
  }

  if (parsed.protocol === 'file:') {
    return {
      decision: 'BLOCK',
      reason: 'FILE_NAVIGATION_DENIED',
      url: parsed.href
    };
  }

  return {
    decision: 'BLOCK',
    reason: 'UNTRUSTED_OFFLINE_NAVIGATION_TARGET',
    url: parsed.href
  };
}

function classifyRendererWindowOpen({
  source,
  url
} = {}) {
  const normalizedSource =
    source === 'offlineView'
      ? 'offlineView'
      : (
          source === 'mainWindow'
            ? 'mainWindow'
            : 'unknown'
        );

  const value =
    String(url == null ? '' : url).trim();

  if (!value) {
    return {
      action: 'deny',
      reason: 'EMPTY_WINDOW_TARGET',
      source: normalizedSource,
      url: ''
    };
  }

  if (isInternalNavigationAllowed(value)) {
    return {
      action: 'deny',
      reason: 'INTERNAL_COMMAND_POPUP_DENIED',
      source: normalizedSource,
      url: value
    };
  }

  if (isOnlineOriginAllowed(value)) {
    return {
      action: 'deny',
      reason: 'ONLINE_POPUP_DENIED',
      source: normalizedSource,
      url: value
    };
  }

  if (isOfflineOriginAllowed(value)) {
    return {
      action: 'deny',
      reason: 'OFFLINE_POPUP_DENIED',
      source: normalizedSource,
      url: value
    };
  }

  const parsed = parseUrlSegura(value);

  if (!parsed) {
    return {
      action: 'deny',
      reason: 'INVALID_WINDOW_TARGET',
      source: normalizedSource,
      url: value
    };
  }

  return {
    action: 'deny',
    reason: 'UNTRUSTED_WINDOW_TARGET',
    source: normalizedSource,
    url: parsed.href
  };
}

function classifyMainWindowNavigation(rawUrl) {
  const value = String(rawUrl == null ? '' : rawUrl).trim();

  if (isInternalNavigationAllowed(value)) {
    return {
      decision: 'INTERCEPT',
      reason: 'INTERNAL_UPDATE_COMMAND',
      url: value
    };
  }

  if (isOnlineOriginAllowed(value)) {
    return {
      decision: 'ALLOW',
      reason: 'ONLINE_TRUSTED_ORIGIN',
      url: value
    };
  }

  const parsed = parseUrlSegura(value);

  if (!parsed) {
    return {
      decision: 'BLOCK',
      reason: 'INVALID_URL',
      url: value
    };
  }

  if (isOfflineOriginAllowed(value)) {
    return {
      decision: 'BLOCK',
      reason: 'OFFLINE_VIEW_ONLY',
      url: parsed.href
    };
  }

  if (parsed.protocol === 'data:') {
    return {
      decision: 'BLOCK',
      reason: 'MAIN_PROCESS_DATA_ONLY',
      url: parsed.href
    };
  }

  if (parsed.protocol === 'file:') {
    return {
      decision: 'BLOCK',
      reason: 'FILE_NAVIGATION_DENIED',
      url: parsed.href
    };
  }

  return {
    decision: 'BLOCK',
    reason: 'UNTRUSTED_NAVIGATION_TARGET',
    url: parsed.href
  };
}

function resolveNavigationEventUrl(event, legacyUrl) {
  const eventUrl =
    event &&
    typeof event.url === 'string'
      ? event.url
      : '';

  return String(eventUrl || legacyUrl || '').trim();
}

function resolveNavigationEventIsMainFrame(
  event,
  legacyIsMainFrame
) {
  if (
    event &&
    typeof event.isMainFrame === 'boolean'
  ) {
    return event.isMainFrame;
  }

  if (typeof legacyIsMainFrame === 'boolean') {
    return legacyIsMainFrame;
  }

  return true;
}

function sanitizeNavigationUrlForLog(rawUrl) {
  const parsed = parseUrlSegura(rawUrl);

  if (!parsed) {
    return '<invalid-url>';
  }

  const protocol =
    String(parsed.protocol || '').toLowerCase();

  if (protocol === 'data:') {
    return 'data:<redacted>';
  }

  if (protocol === 'javascript:') {
    return 'javascript:<redacted>';
  }

  if (protocol === 'file:') {
    return 'file:<redacted>';
  }

  if (
    protocol === 'http:' ||
    protocol === 'https:'
  ) {
    const pathMarker =
      parsed.pathname &&
      parsed.pathname !== '/'
        ? '/<path-redacted>'
        : '/';

    return (
      protocol +
      '//' +
      parsed.host +
      pathMarker
    );
  }

  if (protocol === 'efisco-update:') {
    return INTERNAL_UPDATE_NAVIGATION_URL;
  }

  return (
    protocol ||
    '<unknown-scheme>'
  );
}

function logBlockedMainWindowNavigation({
  eventType,
  navigation,
  isMainFrame = true
}) {
  const decision =
    navigation &&
    navigation.decision
      ? String(navigation.decision)
      : 'BLOCK';

  const reason =
    navigation &&
    navigation.reason
      ? String(navigation.reason)
      : 'UNKNOWN';

  const target =
    sanitizeNavigationUrlForLog(
      navigation &&
      navigation.url
        ? navigation.url
        : ''
    );

  log(
    'MAIN WINDOW NAVIGATION DENIED',
    {
      eventType:
        String(eventType || 'unknown'),
      decision,
      reason,
      mainFrame:
        isMainFrame === true,
      target
    }
  );
}

function logBlockedOfflineViewNavigation({
  eventType,
  navigation,
  isMainFrame = true
}) {
  const decision =
    navigation &&
    navigation.decision
      ? String(navigation.decision)
      : 'BLOCK';

  const reason =
    navigation &&
    navigation.reason
      ? String(navigation.reason)
      : 'UNKNOWN';

  const target =
    sanitizeNavigationUrlForLog(
      navigation &&
      navigation.url
        ? navigation.url
        : ''
    );

  log(
    'OFFLINE VIEW NAVIGATION DENIED',
    {
      eventType:
        String(eventType || 'unknown'),
      decision,
      reason,
      mainFrame:
        isMainFrame === true,
      target
    }
  );
}

function logBlockedRendererWindowOpen({
  source,
  windowOpen
}) {
  const action =
    windowOpen &&
    windowOpen.action
      ? String(windowOpen.action)
      : 'deny';

  const reason =
    windowOpen &&
    windowOpen.reason
      ? String(windowOpen.reason)
      : 'UNKNOWN';

  const target =
    sanitizeNavigationUrlForLog(
      windowOpen &&
      windowOpen.url
        ? windowOpen.url
        : ''
    );

  log(
    'RENDERER WINDOW OPEN DENIED',
    {
      source:
        String(source || 'unknown'),
      action,
      reason,
      target
    }
  );
}

let timerOfflineRuntime = null;
let timerOfflineContinuityMirror = null;
let offlineContinuityMirrorBusy = false;
let offlineRuntimeBusy = false;
let onlineNetworkFailoverHookInstalled = false;
let onlineNetworkFailoverInFlight = false;
let offlineProductMirrorInFlight = null;
let offlineProductMirrorLastAt = 0;
let offlineF5MirrorInFlight = null;
let offlineF5MirrorLastAt = 0;
let pendingOfflineOperatorVerifier = null;
let offlineOperatorCredentialPersistInFlight = null;
let lastConfirmedOnlineOperatorIdentity = null;
let lastOnlineOperatorIdentityRefreshAt = 0;
let onlineOperatorIdentityRefreshMisses = 0;
let offlineFailoverOnlineOperatorIdentity = null;
let offlineAuthenticatedOperator = null;
let offlineLoginFailures=0;
let offlineLoginBlockedUntil=0;
let offlineLoginLastFailureAt=0;

let offlineUiMode = 'ONLINE';
let offlineFunctionShortcutsRegistered = false;

let offlineFailureCount = 0;

let offlineSuccessCount = 0;

let offlineAuthorizationState = 'UNAVAILABLE';

let offlineSyncIdentity = null;

let lastMainFrameFailureAt = 0;

const INTERVALO_MANIFESTO_STANDBY_MS =

  5 * 60 * 1000;



const OFFLINE_RUNTIME_INTERVAL_MS = 5_000;
const OFFLINE_PRODUCT_MIRROR_INTERVAL_MS = 5_000;
const OFFLINE_F5_MIRROR_INTERVAL_MS = 5_000;

const OFFLINE_FAILURE_THRESHOLD = 3;

const OFFLINE_RECOVERY_THRESHOLD = 3;

const OFFLINE_WIX_PROBE_TIMEOUT_MS = 7_000;
const OFFLINE_STARTUP_PROBE_TIMEOUT_MS = 900;
const OFFLINE_CONTINUITY_MIRROR_MS = 500;
const ONLINE_OPERATOR_IDENTITY_REFRESH_MS = 2_000;
const ONLINE_OPERATOR_FAILOVER_CACHE_MAX_AGE_MS = 60_000;
const ONLINE_OPERATOR_IDENTITY_CLEAR_AFTER_MISSES = 5;

function chromeUserAgent() {
  const chrome =
    process.versions.chrome;

  return (
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ` +
    `AppleWebKit/537.36 (KHTML, like Gecko) ` +
    `Chrome/${chrome} Safari/537.36 ` +
    `E-FISCO-ELECTRON/${VERSION}`
  );
}

function log(...partes) {
  try {
    const linha =
      `[${new Date().toISOString()}] ` +
      partes.map((parte) => {
        if (parte instanceof Error) {
          return (
            parte.stack ||
            parte.message
          );
        }

        if (
          parte &&
          typeof parte === 'object'
        ) {
          try {
            return JSON.stringify(
              parte
            );
          } catch (_) {}
        }

        return String(parte);
      }).join(' ') +
      '\r\n';

    fs.appendFileSync(
      path.join(
        app.getPath('userData'),
        'impressao-driver.log'
      ),
      linha,
      'utf8'
    );
  } catch (_) {}
}

function resolveOfflineReferenceEmpresaId() {
  const authenticatedEmpresaId =
    String(
      offlineAuthenticatedOperator &&
      offlineAuthenticatedOperator.empresaId ||
      ''
    ).trim();

  if (authenticatedEmpresaId) {
    return authenticatedEmpresaId;
  }

  const db = getOfflineDatabase();
  const empresaId = getSyncEmpresaId({ db });

  if (!empresaId) {
    throw new Error(
      'Empresa autenticada ainda não está disponível para consulta offline.'
    );
  }

  return String(empresaId);
}

function resolveUniquePreparedEmpresaIdForProvisionedOperator(
  operadorIdValue,
  perfilValue
) {
  const operadorId = String(operadorIdValue || '').trim();
  const perfil = String(perfilValue || '').trim().toUpperCase();
  if (!operadorId || !perfil) return '';

  const prepared = new Set(
    listPreparedOfflineCompanies()
      .map((company) => String(company && company.empresaId || '').trim())
      .filter(Boolean)
  );

  const empresaIds = [
    ...new Set(
      listActiveProvisionedOfflineCredentials()
        .filter((credential) => (
          String(credential && credential.operadorId || '').trim() === operadorId &&
          String(credential && credential.perfil || '').trim().toUpperCase() === perfil &&
          prepared.has(String(credential && credential.empresaId || '').trim())
        ))
        .map((credential) => String(credential.empresaId || '').trim())
        .filter(Boolean)
    )
  ];

  return empresaIds.length === 1
    ? empresaIds[0]
    : '';
}

function resolveOfflineOperationSyncIdentity() {
  const root =
    offlineSyncIdentity &&
    typeof offlineSyncIdentity === 'object'
      ? offlineSyncIdentity
      : null;
  if (!root) return null;

  const deviceId = String(root.deviceId || '').trim();
  const empresaId = String(
    offlineAuthenticatedOperator &&
    offlineAuthenticatedOperator.empresaId ||
    root.empresaId ||
    ''
  ).trim();
  if (!deviceId || !empresaId) return null;

  let deviceToken = '';
  try {
    deviceToken = String(
      loadSyncDeviceTokenForCompany({
        userDataDir: app.getPath('userData'),
        empresaId,
        safeStorage
      }) || ''
    ).trim();
  } catch (_) {}

  if (!deviceToken && empresaId === String(root.empresaId || '').trim()) {
    deviceToken = String(root.deviceToken || '').trim();
  }

  if (!deviceToken) return null;
  return { deviceId, deviceToken, empresaId };
}

function registerPreparedOfflineCompanyFromLocalState(
  empresaIdValue,
  options = {}
) {
  const empresaId =
    String(
      empresaIdValue || ''
    ).trim();

  if (!empresaId) {
    return null;
  }

  if (
    options.onlyIfMissing === true
  ) {
    const existing =
      getPreparedOfflineCompany(
        empresaId
      );

    if (existing) {
      return existing;
    }
  }

  const profile =
    getFiscalProfileCache(
      empresaId
    );

  if (
    !profile ||
    typeof profile !== 'object'
  ) {
    return null;
  }

  if (
    options.requireActiveCredential === true &&
    listActiveOfflineOperatorCredentials(
      empresaId
    ).length < 1
  ) {
    return null;
  }

  return upsertPreparedOfflineCompany({
    empresaId,
    razaoSocial:
      String(
        profile.razaoSocial || ''
      ).trim(),
    cnpj:
      String(
        profile.cnpj || ''
      ).trim(),
    ambiente:
      String(
        profile.ambiente || ''
      ).trim()
  });
}

function getOfflineCompanyHeader() {
  const empresaId =
    resolveOfflineReferenceEmpresaId();

  const profile =
    getFiscalProfileCache(
      empresaId
    );

  if (
    !profile ||
    typeof profile !== 'object'
  ) {
    throw new Error(
      'Dados locais da empresa não estão disponíveis.'
    );
  }

  return {
    razaoSocial:
      String(
        profile.razaoSocial || ''
      ).trim(),
    cnpj:
      String(
        profile.cnpj || ''
      ).trim(),
    ambiente:
      String(
        profile.ambiente || ''
      ).trim()
  };
}

function listOfflineCustomersForCrediario(input = {}) {
  const empresaId = resolveOfflineReferenceEmpresaId();
  const term = String(input.term == null ? '' : input.term).trim();
  const customers = searchCustomersCache({
    empresaId,
    term,
    limit: 5000,
    onlyActive: true
  });

  return customers.map((customer) => {
    const payload =
      customer && customer.payload && typeof customer.payload === 'object'
        ? customer.payload
        : {};
    const clienteId = String(customer.clienteId || '').trim();
    const nome = String(
      customer.nome ||
      payload.nomeCompleto ||
      payload.razaoSocial ||
      clienteId
    ).trim();
    const documento = String(customer.documento || '').trim();
    const telefone = String(customer.telefone || '').trim();

    return {
      _id: clienteId,
      clienteId,
      nome,
      nomeCompleto: String(payload.nomeCompleto || nome).trim(),
      razaoSocial: String(payload.razaoSocial || '').trim(),
      documento,
      cpf: String(payload.cpf || documento).trim(),
      cpfFormatado: String(payload.cpfFormatado || '').trim(),
      cnpj: String(payload.cnpj || '').trim(),
      cnpjFormatado: String(payload.cnpjFormatado || '').trim(),
      whatsapp: String(payload.whatsapp || telefone).trim(),
      whatsappFormatado: String(payload.whatsappFormatado || '').trim(),
      telefone,
      email: String(customer.email || '').trim(),
      ativo: customer.ativo === true
    };
  });
}

function listOfflineCrediariosForF5(input = {}) {
  const empresaId = resolveOfflineReferenceEmpresaId();
  const limit = input.limit == null ? 5000 : Number(input.limit);
  const safeLimit =
    Number.isFinite(limit) && limit > 0
      ? Math.min(Math.trunc(limit), 5000)
      : 5000;

  return listCrediariosCache({
    empresaId,
    limit: safeLimit
  }).map((conta) => ({
    ...conta,
    _id: String(conta.contaReceberId || conta.crediarioId || ''),
    saleId: String(conta.crediarioId || ''),
    nome: String(conta.clienteNome || conta.nome || '')
  }));
}

function getOfflineCrediarioDetailForF5(input = {}) {
  const empresaId = resolveOfflineReferenceEmpresaId();
  const crediarioId = String(
    input.crediarioId ||
    input.contaReceberId ||
    input.id ||
    ''
  ).trim();

  if (!crediarioId) {
    throw new Error('crediarioId é obrigatório para consultar o detalhe offline.');
  }

  return getCrediarioDetailCache({
    empresaId,
    crediarioId
  });
}

function updateOfflineCrediarioItemsForF5(input = {}) {
  const empresaId = resolveOfflineReferenceEmpresaId();
  const crediarioId = String(input.crediarioId || '').trim();

  if (!crediarioId) {
    throw new Error('crediarioId é obrigatório para atualizar o crediário offline.');
  }

  return updateCrediarioItemsOfflineAtomic({
    empresaId,
    crediarioId,
    operationId: input.operationId,
    occurredAt: input.occurredAt,
    produtos: Array.isArray(input.produtos) ? input.produtos : [],
    total: input.total
  });
}

function buildFiscalCounterSyncPayload(
  empresaId,
  deviceId
) {
  try {
    const profile =
      getFiscalProfileCache(empresaId);

    if (
      !profile ||
      String(profile.ambiente || '').toUpperCase() !==
        'PRODUCAO'
    ) {
      return null;
    }

    const counter =
      peekNextNfceNumber({
        empresaId,
        deviceId,
        ambiente: 'PRODUCAO',
        modelo: 65,
        serie: String(profile.serieNfce)
      });

    return {
      ambiente: 'PRODUCAO',
      modelo: 65,
      serie: String(profile.serieNfce),
      proximoNumero:
        Number(counter.proximoNumero)
    };
  } catch (_) {
    return null;
  }
}

function reconcileFiscalCounterFromReference(
  empresaId,
  deviceId,
  fiscalProfile
) {
  if (
    !fiscalProfile ||
    typeof fiscalProfile !== 'object'
  ) {
    return null;
  }

  const proximoNumero =
    Number(
      fiscalProfile.proximoNumeroNfce
    );

  if (
    !Number.isSafeInteger(proximoNumero) ||
    proximoNumero < 1
  ) {
    return null;
  }

  return reconcileLocalNfceCounter({
    empresaId,
    deviceId,
    ambiente: 'PRODUCAO',
    modelo: 65,
    serie: String(
      fiscalProfile.serieNfce || ''
    ),
    proximoNumero
  });
}

async function syncOfflineReferenceCache(options = {}) {
  const deviceId = String(options.deviceId || '').trim();
  const deviceToken = String(options.deviceToken || '').trim();
  const empresaId = String(options.empresaId || '').trim();

  if (!deviceId || !deviceToken || !empresaId) {
    throw new Error('Identidade autenticada incompleta para pull de referências.');
  }

  const cursors = {
    products: null,
    customers: null,
    suppliers: null,
    crediarios: null
  };
  const completed = {
    products: false,
    customers: false,
    suppliers: false,
    crediarios: false
  };
  const totals = {
    products: 0,
    customers: 0,
    suppliers: 0,
    crediarios: 0
  };
  const maxPages = 10_000;
  let pages = 0;
  const crediariosSnapshotToken =
    `cred-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

  while (
    !completed.products ||
    !completed.customers ||
    !completed.suppliers ||
    !completed.crediarios
  ) {
    if (pages >= maxPages) {
      throw new Error('Pull de referências excedeu o limite seguro de páginas.');
    }

    const previousCursors = {
      ...cursors
    };

    const fiscalCounterPayload =
      buildFiscalCounterSyncPayload(
        empresaId,
        deviceId
      );

    log(
      'OFFLINE FISCAL COUNTER PULL REQUEST',
      fiscalCounterPayload
    );

    const page =
      await pullSyncReferences({
        deviceId,
        deviceToken,
        empresaId,
        limit: 250,
        cursors,
        completed,
        fiscalCounter:
          fiscalCounterPayload
      });

    log(
      'OFFLINE FISCAL COUNTER PULL RESPONSE',
      {
        proximoNumeroNfce:
          page &&
          page.fiscalProfile &&
          page.fiscalProfile.proximoNumeroNfce != null
            ? page.fiscalProfile.proximoNumeroNfce
            : null
      }
    );

    const stored =
      upsertReferenceBatch({
        empresaId,
        products: page.products,
        customers: page.customers,
        suppliers: page.suppliers,
        crediarios: page.crediarios,
        crediariosSnapshotToken,
        fiscalProfile: page.fiscalProfile
      });

    reconcileFiscalCounterFromReference(
      empresaId,
      deviceId,
      page.fiscalProfile
    );

    totals.products += stored.products;
    totals.customers += stored.customers;
    totals.suppliers += stored.suppliers;
    totals.crediarios += stored.crediarios;
    pages += 1;

    for (
      const name of
      ['products', 'customers', 'suppliers', 'crediarios']
    ) {
      if (completed[name]) continue;

      completed[name] =
        page.done[name] === true;
      cursors[name] =
        page.cursors[name];

      if (
        !completed[name] &&
        cursors[name] === previousCursors[name]
      ) {
        throw new Error(
          `Pull de referências sem progresso em ${name}.`
        );
      }
    }
  }

  const crediariosRemovidos = finalizeCrediariosSnapshot({
    empresaId,
    snapshotToken: crediariosSnapshotToken
  });

  offlineProductMirrorLastAt = Date.now();

  return {
    empresaId,
    pages,
    crediariosRemovidos,
    ...totals
  };
}

function storeProvisionedOfflineCredentialFromBootstrap(
  empresaIdValue,
  credentialValue
) {
  const empresaId =
    String(
      empresaIdValue || ''
    ).trim();

  const credential =
    credentialValue &&
    typeof credentialValue === 'object' &&
    !Array.isArray(credentialValue)
      ? credentialValue
      : null;

  if (!empresaId || !credential) {
    return null;
  }

  const offlineCredential =
    credential.offlineCredential &&
    typeof credential.offlineCredential ===
      'object' &&
    !Array.isArray(
      credential.offlineCredential
    )
      ? credential.offlineCredential
      : null;

  if (!offlineCredential) {
    return null;
  }

  const kdf =
    String(
      offlineCredential.kdf || ''
    )
      .trim()
      .toUpperCase();

  const saltText =
    String(
      offlineCredential.salt || ''
    ).trim();

  const verifierText =
    String(
      offlineCredential.verifier || ''
    ).trim();

  const params =
    offlineCredential.params &&
    typeof offlineCredential.params ===
      'object' &&
    !Array.isArray(
      offlineCredential.params
    )
      ? offlineCredential.params
      : {};

  if (
    kdf !== 'PBKDF2_SHA256_V1' ||
    Number(params.iterations) !== 310000 ||
    String(
      params.hash || ''
    )
      .trim()
      .toUpperCase() !== 'SHA-256' ||
    Number(params.keyLength) !== 32
  ) {
    return null;
  }

  let saltBuffer = null;
  let verifierBuffer = null;
  let encryptedVerifier = null;

  try {
    saltBuffer =
      decodeCanonicalBase64(
        saltText,
        16
      );

    verifierBuffer =
      decodeCanonicalBase64(
        verifierText,
        32
      );

    if (
      !saltBuffer ||
      !verifierBuffer
    ) {
      return null;
    }

    if (
      !safeStorage
        .isEncryptionAvailable()
    ) {
      throw new Error(
        'safeStorage indisponível para credencial provisionada.'
      );
    }

    encryptedVerifier =
      safeStorage.encryptString(
        verifierText
      );

    if (
      !Buffer.isBuffer(
        encryptedVerifier
      ) ||
      encryptedVerifier.length < 1
    ) {
      throw new Error(
        'safeStorage não protegeu a credencial provisionada.'
      );
    }

    return upsertOfflineOperatorCredential({
      empresaId,
      operadorId:
        String(
          credential.operadorId || ''
        ).trim(),
      nome:
        String(
          credential.nome || ''
        ).trim(),
      perfil:
        String(
          credential.perfil || ''
        ).trim(),
      acessoTotal:
        credential.acessoTotal === true,
      ativo:
        credential.ativo !== false,
      credentialKdf:
        'PBKDF2_SHA256_V1_SAFE_STORAGE',
      credentialSalt:
        saltText,
      credentialVerifier:
        encryptedVerifier.toString(
          'base64'
        ),
      credentialParams: {
        iterations: 310000,
        hash: 'SHA-256',
        keyLength: 32,
        wrapper: 'safeStorage'
      },
      credentialRevision:
        String(
          offlineCredential.revision || ''
        ).trim() ||
        crypto.randomUUID(),
      sourceUpdatedAt:
        offlineCredential.updatedAt ||
        credential.sourceUpdatedAt ||
        null
    });
  } finally {
    for (
      const buffer of [
        saltBuffer,
        verifierBuffer,
        encryptedVerifier
      ]
    ) {
      if (buffer) {
        try {
          buffer.fill(0);
        } catch (_) {}
      }
    }
  }
}

async function syncRootReferenceFallback(
  input = {}
) {
  const deviceId =
    String(
      input.deviceId || ''
    ).trim();
  const deviceToken =
    String(
      input.deviceToken || ''
    ).trim();
  const empresaId =
    String(
      input.empresaId || ''
    ).trim();

  if (
    !deviceId ||
    !deviceToken ||
    !empresaId
  ) {
    return null;
  }

  const summary =
    await syncOfflineReferenceCache({
      deviceId,
      deviceToken,
      empresaId
    });

  const preparedCompany =
    registerPreparedOfflineCompanyFromLocalState(
      empresaId,
      {
        requireActiveCredential:
          false
      }
    );

  return {
    ...summary,
    preparedCompany:
      preparedCompany
        ? preparedCompany.empresaId
        : null
  };
}

async function provisionOfflineMultiCompany(
  input = {}
) {
  const deviceId =
    String(
      input.deviceId || ''
    ).trim();
  const rootDeviceToken =
    String(
      input.deviceToken || ''
    ).trim();
  const rootEmpresaId =
    String(
      input.rootEmpresaId || ''
    ).trim();

  if (
    !deviceId ||
    !rootDeviceToken ||
    !rootEmpresaId
  ) {
    throw new Error(
      'Identidade raiz incompleta para provisionamento multiempresa.'
    );
  }

  if (
    !safeStorage.isEncryptionAvailable()
  ) {
    throw new Error(
      'safeStorage indisponível para provisionamento multiempresa.'
    );
  }

  let cursor = null;
  let pages = 0;
  let companiesPrepared = 0;
  let credentialsPrepared = 0;
  let referencesPages = 0;
  const seenCompanies =
    new Set();

  while (true) {
    if (pages >= 10_000) {
      throw new Error(
        'Bootstrap multiempresa excedeu o limite seguro de páginas.'
      );
    }

    const page =
      await bootstrapSyncMultiCompany({
        deviceId,
        deviceToken:
          rootDeviceToken,
        rootEmpresaId,
        cursor,
        limit: 25,
        timeoutMs: 30_000
      });

    pages += 1;

    for (
      const companyValue of
      page.companies
    ) {
      const company =
        companyValue &&
        typeof companyValue ===
          'object' &&
        !Array.isArray(
          companyValue
        )
          ? companyValue
          : null;

      if (!company) {
        continue;
      }

      const empresaId =
        String(
          company.empresaId || ''
        ).trim();

      if (!empresaId) {
        continue;
      }

      const returnedDeviceId =
        String(
          company.deviceId || ''
        ).trim();

      if (
        returnedDeviceId !==
        deviceId
      ) {
        throw new Error(
          'Bootstrap retornou deviceId divergente para empresa.'
        );
      }

      const useCurrentToken =
        company.useCurrentToken === true;

      const companyToken =
        useCurrentToken
          ? rootDeviceToken
          : String(
              company.deviceToken || ''
            ).trim();

      if (!companyToken) {
        throw new Error(
          'Bootstrap não retornou token da empresa provisionada.'
        );
      }

      const ping =
        await pingSyncDevice({
          deviceId,
          deviceToken:
            companyToken,
          timeoutMs: 10_000
        });

      if (
        String(
          ping.empresaId || ''
        ).trim() !== empresaId
      ) {
        throw new Error(
          'Token provisionado pertence a empresa divergente.'
        );
      }

      storeSyncDeviceTokenForCompany({
        safeStorage,
        userDataDir:
          app.getPath(
            'userData'
          ),
        empresaId,
        deviceToken:
          companyToken
      });

      const credentials =
        Array.isArray(
          company.credentials
        )
          ? company.credentials
          : [];

      const operadorIds = [];

      for (
        const credential of
        credentials
      ) {
        const operadorId =
          String(
            credential &&
            credential.operadorId ||
            ''
          ).trim();

        if (operadorId) {
          operadorIds.push(
            operadorId
          );
        }

        const stored =
          storeProvisionedOfflineCredentialFromBootstrap(
            empresaId,
            credential
          );

        if (stored) {
          credentialsPrepared += 1;
        }
      }

      deactivateOfflineOperatorCredentialsExcept({
        empresaId,
        operadorIds
      });

      const referenceSummary =
        await syncOfflineReferenceCache({
          deviceId,
          deviceToken:
            companyToken,
          empresaId
        });

      referencesPages +=
        Number(
          referenceSummary &&
          referenceSummary.pages ||
          0
        );

      const preparedCompany =
        registerPreparedOfflineCompanyFromLocalState(
          empresaId,
          {
            requireActiveCredential:
              false
          }
        );

      if (!preparedCompany) {
        throw new Error(
          'Empresa provisionada não ficou pronta após sincronização.'
        );
      }

      if (
        empresaId !==
        rootEmpresaId
      ) {
        try {
          let cashState;

          try {
            cashState =
              await pullSyncCashSummary({
                deviceId,
                deviceToken:
                  companyToken,
                empresaId,
                includeMovements:
                  true,
                timeoutMs:
                  10_000
              });
          } catch (summaryError) {
            if (
              offlineAuthFailure(
                summaryError
              )
            ) {
              throw summaryError;
            }

            cashState =
              await pullSyncCashState({
                deviceId,
                deviceToken:
                  companyToken,
                empresaId,
                timeoutMs:
                  10_000
              });
          }

          mirrorRemoteCashState(
            cashState
          );
        } catch (error) {
          if (
            offlineAuthFailure(
              error
            )
          ) {
            throw error;
          }

          log(
            'OFFLINE MULTI COMPANY CASH STATE DEFERRED',
            {
              empresaId,
              erro:
                String(
                  error &&
                  error.message ||
                  error
                )
            }
          );
        }

        void provisionFiscalA1FromServer({
          deviceId,
          deviceToken:
            companyToken,
          empresaId,
          userDataDir:
            app.getPath(
              'userData'
            ),
          safeStorage,
          timeoutMs: 30_000
        })
          .then(
            (summary) => {
              log(
                'OFFLINE MULTI COMPANY A1 PROVISION',
                {
                  empresaId,
                  available:
                    summary &&
                    summary.available ===
                      true,
                  stored:
                    summary &&
                    summary.stored ===
                      true
                }
              );
            }
          )
          .catch(
            (error) => {
              log(
                'OFFLINE MULTI COMPANY A1 DEFERRED',
                {
                  empresaId,
                  erro:
                    String(
                      error &&
                      error.message ||
                      error
                    )
                }
              );
            }
          );
      }

      seenCompanies.add(
        empresaId
      );
      companiesPrepared += 1;
    }

    if (
      page.done === true
    ) {
      break;
    }

    const nextCursor =
      String(
        page.nextCursor || ''
      ).trim();

    if (
      !nextCursor ||
      nextCursor === cursor
    ) {
      throw new Error(
        'Bootstrap multiempresa não avançou o cursor.'
      );
    }

    cursor =
      nextCursor;
  }

  const seenCompanyIds =
    Array.from(
      seenCompanies
    );

  const credentialsDeactivated =
    deactivateOfflineOperatorCredentialsOutsideCompanies(
      seenCompanyIds
    );

  for (
    const preparedCompany of
    listPreparedOfflineCompanies()
  ) {
    const empresaId =
      String(
        preparedCompany &&
        preparedCompany.empresaId ||
        ''
      ).trim();

    if (
      !empresaId ||
      seenCompanies.has(
        empresaId
      )
    ) {
      continue;
    }

    try {
      clearSyncDeviceTokenForCompany({
        userDataDir:
          app.getPath(
            'userData'
          ),
        empresaId
      });
    } catch (_) {}
  }

  return {
    bootstrapPages:
      pages,
    companiesPrepared,
    credentialsPrepared,
    referencesPages,
    credentialsDeactivated
  };
}

async function syncOfflineProductCache(options = {}) {
  const deviceId = String(options.deviceId || '').trim();
  const deviceToken = String(options.deviceToken || '').trim();
  const empresaId = String(options.empresaId || '').trim();

  if (!deviceId || !deviceToken || !empresaId) {
    throw new Error('Identidade autenticada incompleta para espelho de estoque.');
  }

  const cursors = {
    products: null,
    customers: null,
    suppliers: null,
    crediarios: null
  };
  const completed = {
    products: false,
    customers: true,
    suppliers: true,
    crediarios: true
  };

  let pages = 0;
  let products = 0;

  while (!completed.products) {
    if (pages >= 10_000) {
      throw new Error('Espelho de produtos excedeu o limite seguro de páginas.');
    }

    const previousCursor = cursors.products;
    const page = await pullSyncReferences({
      deviceId,
      deviceToken,
      empresaId,
      limit: 250,
      cursors,
      completed,
      fiscalCounter:
        buildFiscalCounterSyncPayload(
          empresaId,
          deviceId
        )
    });

    reconcileFiscalCounterFromReference(
      empresaId,
      deviceId,
      page.fiscalProfile
    );

    const stored = upsertReferenceBatch({
      empresaId,
      products: page.products,
      customers: [],
      suppliers: []
    });

    products += stored.products;
    pages += 1;
    completed.products = page.done.products === true;
    cursors.products = page.cursors.products;

    if (!completed.products && cursors.products === previousCursor) {
      throw new Error('Espelho de produtos sem progresso.');
    }
  }

  offlineProductMirrorLastAt = Date.now();

  return {
    empresaId,
    pages,
    products
  };
}

async function syncOfflineProductCacheCoalesced(options = {}) {
  const force = options.force === true;
  const now = Date.now();

  if (
    !force &&
    offlineProductMirrorLastAt > 0 &&
    now - offlineProductMirrorLastAt < OFFLINE_PRODUCT_MIRROR_INTERVAL_MS
  ) {
    return {
      skipped: true,
      reason: 'RECENT_PRODUCT_MIRROR'
    };
  }

  if (offlineProductMirrorInFlight) {
    return offlineProductMirrorInFlight;
  }

  offlineProductMirrorInFlight =
    syncOfflineProductCache(options)
      .finally(() => {
        offlineProductMirrorInFlight = null;
      });

  return offlineProductMirrorInFlight;
}

async function syncOfflineF5ReferenceCache(options = {}) {
  const deviceId = String(options.deviceId || '').trim();
  const deviceToken = String(options.deviceToken || '').trim();
  const empresaId = String(options.empresaId || '').trim();

  if (!deviceId || !deviceToken || !empresaId) {
    throw new Error('Identidade autenticada incompleta para espelho offline do F5.');
  }

  const cursors = {
    products: null,
    customers: null,
    suppliers: null,
    crediarios: null
  };
  const completed = {
    products: true,
    customers: false,
    suppliers: true,
    crediarios: false
  };
  const totals = {
    customers: 0,
    crediarios: 0
  };
  const crediariosSnapshotToken =
    `f5-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  let pages = 0;

  while (!completed.customers || !completed.crediarios) {
    if (pages >= 10_000) {
      throw new Error('Espelho offline do F5 excedeu o limite seguro de páginas.');
    }

    const previousCustomersCursor = cursors.customers;
    const previousCrediariosCursor = cursors.crediarios;

    const page = await pullSyncReferences({
      deviceId,
      deviceToken,
      empresaId,
      limit: 250,
      cursors,
      completed,
      fiscalCounter:
        buildFiscalCounterSyncPayload(
          empresaId,
          deviceId
        )
    });

    reconcileFiscalCounterFromReference(
      empresaId,
      deviceId,
      page.fiscalProfile
    );

    const stored = upsertReferenceBatch({
      empresaId,
      products: [],
      customers: page.customers,
      suppliers: [],
      crediarios: page.crediarios,
      crediariosSnapshotToken
    });

    totals.customers += stored.customers;
    totals.crediarios += stored.crediarios;
    pages += 1;

    if (!completed.customers) {
      completed.customers = page.done.customers === true;
      cursors.customers = page.cursors.customers;
      if (
        !completed.customers &&
        cursors.customers === previousCustomersCursor
      ) {
        throw new Error('Espelho offline do F5 sem progresso em customers.');
      }
    }

    if (!completed.crediarios) {
      completed.crediarios = page.done.crediarios === true;
      cursors.crediarios = page.cursors.crediarios;
      if (
        !completed.crediarios &&
        cursors.crediarios === previousCrediariosCursor
      ) {
        throw new Error('Espelho offline do F5 sem progresso em crediarios.');
      }
    }
  }

  const crediariosRemovidos = finalizeCrediariosSnapshot({
    empresaId,
    snapshotToken: crediariosSnapshotToken
  });

  offlineF5MirrorLastAt = Date.now();

  return {
    empresaId,
    pages,
    crediariosRemovidos,
    ...totals
  };
}

async function syncOfflineF5ReferenceCacheCoalesced(options = {}) {
  const force = options.force === true;
  const now = Date.now();

  if (
    !force &&
    offlineF5MirrorLastAt > 0 &&
    now - offlineF5MirrorLastAt < OFFLINE_F5_MIRROR_INTERVAL_MS
  ) {
    return {
      skipped: true,
      reason: 'RECENT_F5_MIRROR'
    };
  }

  if (offlineF5MirrorInFlight) {
    return offlineF5MirrorInFlight;
  }

  offlineF5MirrorInFlight =
    syncOfflineF5ReferenceCache(options)
      .finally(() => {
        offlineF5MirrorInFlight = null;
      });

  return offlineF5MirrorInFlight;
}

async function maintainOfflineFiscalLeaseInventory() {
  /*
   * ETAPA 51 — caixa único / série única:
   * o desktop é o único proprietário da sequência da NFC-e.
   *
   * Não solicitamos novos blocos ao servidor, porque uma nova lease
   * criaria uma segunda autoridade de numeração. A lease local existente
   * passa a representar o contador único persistente deste caixa.
   */
  return {
    action: 'SKIP',
    reason: 'SINGLE_DESKTOP_NUMBER_OWNER'
  };
}

function logFiscalLeaseMaintenance(summary) {
  if (!summary || !summary.action || ['NONE', 'WAIT_RETRY', 'SKIP'].includes(summary.action)) return;
  log('OFFLINE FISCAL LEASE MAINTENANCE', {
    action: summary.action,
    remainingNumbers: Number(summary.remainingNumbers || 0),
    activeLeases: Number(summary.activeLeases || 0)
  });
}

async function maintainOfflineFiscalTransmission() {
  if (ENABLE_REAL_SVRS_FISCAL_TRANSMISSION !== true) {
    if (!fiscalTransmissionLockLogged) {
      fiscalTransmissionLockLogged = true;
      log('OFFLINE FISCAL SVRS TRANSMISSION LOCKED', {
        enabled: false,
        reason: 'STEP39_EXPLICIT_SAFETY_LOCK'
      });
    }
    return { enabled: false, locked: true, recoveredStale: 0, summary: null };
  }

  const identity =
    resolveOfflineOperationSyncIdentity();
  if (!identity || !identity.deviceId || !identity.empresaId) {
    return { enabled: false, locked: false, skipped: true, reason: 'IDENTIDADE_SYNC_INCOMPLETA' };
  }

  return runFiscalReconnectCycle({
    enabled: true,
    empresaId: identity.empresaId,
    deviceId: identity.deviceId,
    userDataDir: app.getPath('userData'),
    safeStorage,
    timeoutMs: 30_000,
    staleAfterMs: 5 * 60_000,
    retryDelayMs: 60_000,
    reconcileDelayMs: 30_000,
    limit: 20
  });
}

function logFiscalTransmissionSummary(result) {
  if (!result || result.enabled !== true) return;
  const summary = result.summary || {};
  const activity = Number(result.recoveredStale || 0) +
    Number(summary.claimed || 0) + Number(summary.authorized || 0) +
    Number(summary.rejected || 0) + Number(summary.retry || 0) +
    Number(summary.reconcile || 0) + Number(summary.manualReview || 0);
  if (activity <= 0) return;
  log('OFFLINE FISCAL OUTBOX CYCLE', {
    recoveredStale: Number(result.recoveredStale || 0),
    considered: Number(summary.considered || 0),
    claimed: Number(summary.claimed || 0),
    authorized: Number(summary.authorized || 0),
    rejected: Number(summary.rejected || 0),
    retry: Number(summary.retry || 0),
    reconcile: Number(summary.reconcile || 0),
    manualReview: Number(summary.manualReview || 0)
  });
}

function helperPath() {
  if (app.isPackaged) {
    return path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'print-driver-nfce.ps1'
    );
  }

  return path.join(
    __dirname,
    'print-driver-nfce.ps1'
  );
}

function updateHelperSourcePath() {
  if (app.isPackaged) {
    return path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'EFISCO-UPDATER.exe'
    );
  }

  return path.join(
    __dirname,
    'EFISCO-UPDATER.exe'
  );
}

function updateStatePaths() {
  const dir = path.join(
    app.getPath('userData'),
    'update-state'
  );

  return {
    dir,
    lockPath: path.join(
      dir,
      'update.lock'
    ),
    readyPath: path.join(
      dir,
      'ready.flag'
    )
  };
}

function limparEstadoAtualizacaoExterna() {
  const {
    lockPath,
    readyPath
  } = updateStatePaths();

  for (const arquivo of [
    lockPath,
    readyPath
  ]) {
    try {
      if (fs.existsSync(arquivo)) {
        fs.unlinkSync(arquivo);
      }
    } catch (_) {}
  }
}

function lerEstadoAtualizacaoExterna() {
  const {
    lockPath
  } = updateStatePaths();

  if (!fs.existsSync(lockPath)) {
    return null;
  }

  try {
    const conteudoLock =
      fs.readFileSync(
        lockPath,
        'utf8'
      ).replace(/^\uFEFF/, '');

    const estado =
      JSON.parse(
        conteudoLock
      );

    const iniciado =
      Date.parse(
        String(
          estado.startedAtUtc || ''
        )
      );

    if (
      Number.isFinite(iniciado) &&
      Date.now() - iniciado >
        30 * 60 * 1000
    ) {
      log(
        'LOCK DE UPDATE EXPIRADO'
      );

      limparEstadoAtualizacaoExterna();

      return null;
    }

    return estado;
  } catch (erro) {
    log(
      'LOCK DE UPDATE INVALIDO',
      erro
    );

    limparEstadoAtualizacaoExterna();

    return null;
  }
}

function deveBloquearInicioPorAtualizacao() {
  const estado =
    lerEstadoAtualizacaoExterna();

  if (!estado) {
    return false;
  }

  const targetVersion =
    String(
      estado.targetVersion || ''
    ).trim();

  if (!targetVersion) {
    limparEstadoAtualizacaoExterna();
    return false;
  }

  if (
    targetVersion ===
    app.getVersion()
  ) {
    return false;
  }

  log(
    'INICIO BLOQUEADO DURANTE UPDATE',
    {
      versaoAtual:
        app.getVersion(),

      versaoEsperada:
        targetVersion
    }
  );

  return true;
}

function sinalizarNovaVersaoProntaSeNecessario() {
  const estado =
    lerEstadoAtualizacaoExterna();

  if (!estado) {
    return;
  }

  const targetVersion =
    String(
      estado.targetVersion || ''
    ).trim();

  if (
    !targetVersion ||
    targetVersion !==
      app.getVersion()
  ) {
    return;
  }

  const {
    dir,
    readyPath
  } = updateStatePaths();

  try {
    fs.mkdirSync(
      dir,
      {
        recursive: true
      }
    );

    fs.writeFileSync(
      readyPath,
      JSON.stringify(
        {
          version:
            app.getVersion(),

          readyAtUtc:
            new Date()
              .toISOString()
        }
      ),
      'utf8'
    );

    log(
      'NOVA VERSAO SINALIZOU READY',
      {
        version:
          app.getVersion()
      }
    );
  } catch (erro) {
    log(
      'ERRO AO SINALIZAR READY',
      erro
    );
  }
}

function aguardarArquivoExistir(
  arquivo,
  timeoutMs = 10000
) {
  return new Promise(
    (resolve, reject) => {
      const inicio =
        Date.now();

      const timer =
        setInterval(
          () => {
            if (
              fs.existsSync(
                arquivo
              )
            ) {
              clearInterval(
                timer
              );

              resolve();

              return;
            }

            if (
              Date.now() - inicio >=
                timeoutMs
            ) {
              clearInterval(
                timer
              );

              reject(
                new Error(
                  'O helper externo de atualização não iniciou dentro do tempo esperado.'
                )
              );
            }
          },
          100
        );
    }
  );
}

async function iniciarHelperExternoAtualizacao() {
  const targetVersion =
    String(
      versaoAtualizacaoPendente || ''
    ).trim();

  if (!targetVersion) {
    throw new Error(
      'Versão de atualização pendente não disponível.'
    );
  }

  const origem =
    updateHelperSourcePath();

  if (!fs.existsSync(origem)) {
    throw new Error(
      `Helper externo não encontrado: ${origem}`
    );
  }

  const {
    dir,
    lockPath,
    readyPath
  } = updateStatePaths();

  fs.mkdirSync(
    dir,
    {
      recursive: true
    }
  );

  limparEstadoAtualizacaoExterna();

  const pastaTemp =
    path.join(
      app.getPath('temp'),
      'e-fisco-update-helper'
    );

  fs.mkdirSync(
    pastaTemp,
    {
      recursive: true
    }
  );

  const helperTemp =
    path.join(
      pastaTemp,
      'EFISCO-UPDATER.exe'
    );

  fs.copyFileSync(
    origem,
    helperTemp
  );

  const child =
    spawn(
      helperTemp,
      [
        '--lock',
        lockPath,
        '--ready',
        readyPath,
        '--version',
        targetVersion,
        '--timeout',
        '600'
      ],
      {
        windowsHide: false,
        detached: true,
        stdio: 'ignore'
      }
    );

  child.unref();

  await aguardarArquivoExistir(
    lockPath,
    10000
  );

  log(
    'HELPER EXTERNO DE UPDATE INICIADO',
    {
      pid:
        child.pid,

      targetVersion
    }
  );
}

function validarPayload(payload) {
  if (
    !payload ||
    typeof payload !== 'object'
  ) {
    throw new Error(
      'Payload de impressÃ£o invÃ¡lido.'
    );
  }

  const origem =
    String(
      payload.origem || 'NFCE'
    ).slice(0, 80);

  const saleId =
    String(
      payload.saleId || ''
    ).slice(0, 120);

  /*
   * Modo novo: recibo estruturado. O cupom inteiro deixa de ser JPEG.
   * Texto Ã© desenhado pelo PrintDocument; somente o QR continua bitmap PNG.
   */
  if (
    payload.nativeReceipt &&
    typeof payload.nativeReceipt === 'object' &&
    !Array.isArray(payload.nativeReceipt)
  ) {
    const json = JSON.stringify(
      payload.nativeReceipt
    );

    if (
      !json ||
      json.length > 2 * 1024 * 1024
    ) {
      throw new Error(
        'Dados estruturados do cupom excederam o limite permitido.'
      );
    }

    return {
      mode: 'NATIVE_TEXT_QR',
      extension: 'json',
      buffer: Buffer.from(
        json,
        'utf8'
      ),
      origem,
      saleId
    };
  }

  /*
   * Fallback preservado: imagem antiga. Isso permite voltar ao caminho
   * anterior sem trocar o canal CONSOLE-FRAME V5.
   */
  const imageBase64 =
    String(
      payload.imageBase64 || ''
    );

  const match =
    imageBase64.match(
      /^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=\r\n]+)$/i
    );

  if (!match) {
    throw new Error(
      'Payload sem recibo estruturado e sem imagem base64 vÃ¡lida.'
    );
  }

  const base64 =
    match[2].replace(
      /\s/g,
      ''
    );

  if (
    base64.length >
      16 * 1024 * 1024
  ) {
    throw new Error(
      'Imagem do cupom excedeu o limite permitido.'
    );
  }

  return {
    mode: 'IMAGE_FALLBACK',
    extension:
      match[1].toLowerCase() ===
        'png'
        ? 'png'
        : 'jpg',

    buffer:
      Buffer.from(
        base64,
        'base64'
      ),

    origem,
    saleId
  };
}

function executarPowerShell(
  inputPath,
  mode
) {
  return new Promise(
    (resolve, reject) => {
      const args = [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        helperPath(),
        '-PrinterName',
        PRINTER_NAME,
        mode === 'NATIVE_TEXT_QR'
          ? '-DataPath'
          : '-ImagePath',
        inputPath
      ];

      const child =
        spawn(
          'powershell.exe',
          args,
          {
            windowsHide: true,
            stdio: [
              'ignore',
              'pipe',
              'pipe'
            ]
          }
        );

      let stdout = '';
      let stderr = '';

      child.stdout.on(
        'data',
        (chunk) => {
          stdout +=
            String(chunk);
        }
      );

      child.stderr.on(
        'data',
        (chunk) => {
          stderr +=
            String(chunk);
        }
      );

      child.on(
        'error',
        reject
      );

      child.on(
        'close',
        (code) => {
          if (code === 0) {
            resolve(
              stdout.trim()
            );

            return;
          }

          reject(
            new Error(
              stderr.trim() ||
              stdout.trim() ||
              `PowerShell encerrou com cÃ³digo ${code}.`
            )
          );
        }
      );
    }
  );
}

async function imprimir(
  payload
) {
  const validado =
    validarPayload(
      payload
    );

  const nome =
    `e-fisco-nfce-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${validado.extension}`;

  const inputPath =
    path.join(
      app.getPath('temp'),
      nome
    );

  fs.writeFileSync(
    inputPath,
    validado.buffer
  );

  try {
    log(
      'INICIO',
      {
        printer:
          PRINTER_NAME,

        origem:
          validado.origem,

        saleId:
          validado.saleId,

        modo:
          validado.mode,

        bytesEntrada:
          validado.buffer.length
      }
    );

    const retorno =
      await executarPowerShell(
        inputPath,
        validado.mode
      );

    log(
      'OK',
      retorno
    );

    return {
      ok: true,
      mode:
        validado.mode === 'NATIVE_TEXT_QR'
          ? 'WINDOWS_DRIVER_NATIVE_TEXT_QR'
          : 'WINDOWS_DRIVER_SILENT_IMAGE',
      printer:
        PRINTER_NAME,
      detail:
        retorno
    };
  } finally {
    try {
      fs.unlinkSync(
        inputPath
      );
    } catch (_) {}
  }
}

function enfileirar(
  payload
) {
  const tarefa =
    filaImpressao
      .catch(() => {})
      .then(
        () =>
          imprimir(
            payload
          )
      );

  filaImpressao =
    tarefa.catch(
      (error) => {
        log(
          'ERRO',
          error
        );
      }
    );

  return tarefa;
}

const IPC_SENDER_SCOPE = Object.freeze({
  MAIN_WINDOW_TOP: 'MAIN_WINDOW_TOP',
  OFFLINE_VIEW_TOP: 'OFFLINE_VIEW_TOP'
});

const IPC_CHANNEL_AUTHORIZATION_POLICY = Object.freeze({
  'efisco:offline-operator-bridge-probe': Object.freeze({
    transport: 'send',
    senderScope: IPC_SENDER_SCOPE.MAIN_WINDOW_TOP,
    originScope: 'ONLINE_EXACT',
    capability: 'OFFLINE_CREDENTIAL_BRIDGE'
  }),
  'efisco:offline-operator-verifier-candidate': Object.freeze({
    transport: 'send',
    senderScope: IPC_SENDER_SCOPE.MAIN_WINDOW_TOP,
    originScope: 'ONLINE_EXACT',
    capability: 'OFFLINE_CREDENTIAL_BRIDGE'
  }),
  'efisco:offline-credential-provision': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.MAIN_WINDOW_TOP,
    originScope: 'ONLINE_EXACT',
    capability: 'OFFLINE_CREDENTIAL_PROVISION'
  }),
  'efisco:print-nfce-windows-driver': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.MAIN_WINDOW_TOP,
    originScope: 'ONLINE_EXACT',
    capability: 'PRINT'
  }),

  'efisco:offline-operator-login': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_LOGIN'
  }),
  'efisco:offline-product-find': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_READ'
  }),
  'efisco:offline-company-header': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_READ'
  }),
  'efisco:offline-products-list': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_READ'
  }),
  'efisco:offline-customers-list': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_READ'
  }),
  'efisco:offline-crediarios-list': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_READ'
  }),
  'efisco:offline-crediario-detail': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_READ'
  }),
  'efisco:offline-crediario-open': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_MUTATION'
  }),
  'efisco:offline-crediario-items-update': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_MUTATION'
  }),
  'efisco:offline-cash-consult': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_READ'
  }),
  'efisco:offline-finance-snapshot': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_READ'
  }),
  'efisco:offline-cash-open': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_MUTATION'
  }),
  'efisco:offline-cash-movement': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_MUTATION'
  }),
  'efisco:offline-cash-close': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_MUTATION'
  }),
  'efisco:nfce-number-peek': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'FISCAL_SENSITIVE'
  }),
  'efisco:offline-sale-paid': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_MUTATION'
  }),
  'efisco:offline-nfce-contingency-danfe-preview': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'FISCAL_SENSITIVE'
  }),
  'efisco:superadmin-a1-mirror': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'DEVICE_IDENTITY_SENSITIVE'
  })
});

function instalarIpc() {
  ipcMain.on(
    'efisco:offline-operator-bridge-probe',
    (event, payload) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-operator-bridge-probe',
          'send'
        )
      ) {
        return;
      }

      const stage =
        String(
          payload &&
          payload.stage ||
          ''
        )
          .trim()
          .slice(0, 64);

      if (
        stage !== 'top-bridge-installed' &&
        stage !== 'top-candidate-message'
      ) {
        return;
      }

      log(
        'OFFLINE OPERATOR BRIDGE PROBE',
        {
          stage
        }
      );
    }
  );

  ipcMain.on(
    'efisco:offline-operator-verifier-candidate',
    (event, payload) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-operator-verifier-candidate',
          'send'
        )
      ) {
        return;
      }

      storePendingOfflineOperatorVerifierCandidate(
        payload || {}
      );
    }
  );

  ipcMain.handle(
    'efisco:offline-credential-provision',
    async (event, payload) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-credential-provision',
          'invoke'
        )
      ) {
        return {
          ok: false,
          error:
            'Origem de provisionamento offline não autorizada.'
        };
      }

      try {
        const stored =
          persistExplicitOfflineCredentialProvision(
            payload || {}
          );

        if (
          stored &&
          offlineSyncIdentity &&
          offlineSyncIdentity.deviceId &&
          offlineSyncIdentity.deviceToken &&
          offlineSyncIdentity.empresaId &&
          offlineAuthorizationState ===
            'VALID'
        ) {
          void provisionOfflineMultiCompany({
            deviceId:
              offlineSyncIdentity.deviceId,
            deviceToken:
              offlineSyncIdentity.deviceToken,
            rootEmpresaId:
              offlineSyncIdentity.empresaId
          })
            .then(
              (summary) => {
                log(
                  'OFFLINE MULTI COMPANY REFRESH AFTER CREDENTIAL',
                  summary
                );
              }
            )
            .catch(
              (error) => {
                log(
                  'OFFLINE MULTI COMPANY REFRESH AFTER CREDENTIAL DEFERRED',
                  {
                    empresaId:
                      stored.empresaId,
                    erro:
                      String(
                        error &&
                        error.message ||
                        error
                      )
                  }
                );
              }
            );
        }

        return {
          ok: true,
          result: {
            stored: true,
            empresaId:
              stored.empresaId,
            operadorId:
              stored.operadorId,
            perfil:
              stored.perfil
          }
        };
      } catch (error) {
        log(
          'OFFLINE CREDENTIAL EXPLICIT PROVISION FAILED',
          {
            erro:
              String(
                error &&
                error.message ||
                error
              )
          }
        );

        return {
          ok: false,
          error:
            'Provisionamento da credencial offline falhou.'
        };
      }
    }
  );

  ipcMain.handle(
    'efisco:offline-operator-login',
    async (event, payload) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-operator-login',
          'invoke'
        )
      ) {
        return {
          ok: false,
          error:
            'Origem de autenticação offline não autorizada.'
        };
      }

      if (
        offlineUiMode !== 'OFFLINE' &&
        offlineUiMode !== 'SWITCHING_OFFLINE'
      ) {
        return {
          ok: true,
          result: {
            success: false,
            mensagem: 'ACESSO NEGADO'
          }
        };
      }

      try {
        const retryAfterMs=offlineLoginRetryAfterMs();
        if(retryAfterMs>0){
          log('OFFLINE OPERATOR LOGIN THROTTLED',{retryAfterMs});
          return {ok:true,result:{success:false,mensagem:'ACESSO NEGADO'}};
        }

        const validated =
          validateOfflineOperatorPasswordAcrossPreparedCompanies({
            senha:
              payload &&
              payload.senha
          });

        if (
          !validated ||
          validated.success !== true
        ) {
          const delay=registerOfflineLoginFailure();
          log('OFFLINE OPERATOR LOGIN DENIED',{
            failures:offlineLoginFailures,
            retryAfterMs:delay
          });
          return {
            ok: true,
            result: {
              success: false,
              mensagem: 'ACESSO NEGADO'
            }
          };
        }

        resetOfflineLoginBackoff();

        const profileApplied =
          await applyOfflineOperatorProfile(
            validated
          );

        if (!profileApplied) {
          throw new Error(
            'Perfil do operador offline não pôde ser aplicado ao PDV.'
          );
        }

        const session =
          setOfflineAuthenticatedOperator(
            validated
          );

        if (!session) {
          throw new Error(
            'Sessão local do operador offline ficou inválida.'
          );
        }

        await setOfflineShellAuthenticationState(
          session
        );

        resizeOfflineOverlay();
        syncOfflineFunctionShortcuts();

        log('OFFLINE OPERATOR LOGIN AUTHORIZED', {
          empresaId:
            session.empresaId,
          operadorId:
            session.operadorId,
          perfil:
            session.perfil,
          acessoTotal:
            session.acessoTotal === true
        });

        return {
          ok: true,
          result: {
            success: true,
            empresaId:
              session.empresaId,
            operadorId:
              session.operadorId,
            nomeOperador:
              session.nomeOperador,
            operadorNome:
              session.nomeOperador,
            perfil:
              session.perfil,
            acessoTotal:
              session.acessoTotal === true,
            offline:
              true,
            mensagem:
              'ACESSO AUTORIZADO'
          }
        };
      } catch (error) {
        log('OFFLINE OPERATOR LOGIN FAILED', {
          erro:
            String(
              error &&
              error.message ||
              error
            )
        });

        return {
          ok: true,
          result: {
            success: false,
            mensagem: 'ACESSO NEGADO'
          }
        };
      }
    }
  );

  ipcMain.handle(
    'efisco:print-nfce-windows-driver',
    async (
      event,
      payload
    ) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:print-nfce-windows-driver',
          'invoke'
        )
      ) {
        return {
          ok: false,
          error:
            'Origem de impressÃ£o nÃ£o autorizada.'
        };
      }

      try {
        return await enfileirar(
          payload
        );
      } catch (error) {
        log(
          'ERRO IPC',
          error
        );

        return {
          ok: false,
          error:
            error &&
            error.message
              ? error.message
              : String(error)
        };
      }
    }
  );

  ipcMain.handle(
    'efisco:offline-product-find',
    async (
      event,
      criterio
    ) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-product-find',
          'invoke'
        )
      ) {
        return {
          ok: false,
          error:
            'Origem de consulta offline nao autorizada.'
        };
      }

      try {
        return {
          ok: true,
          result:
            findOfflineProductForSale({
              ...(
                criterio &&
                typeof criterio === 'object'
                  ? criterio
                  : {}
              ),
              empresaId:
                resolveOfflineReferenceEmpresaId()
            })
        };
      } catch (error) {
        log(
          'ERRO IPC OFFLINE PRODUCT',
          error
        );

        return {
          ok: false,
          error:
            error &&
            error.message
              ? error.message
              : String(error)
        };
      }
    }
  );

  ipcMain.handle(
    'efisco:offline-company-header',
    async (event) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-company-header',
          'invoke'
        )
      ) {
        return {
          ok: false,
          error:
            'Origem de consulta offline da empresa nao autorizada.'
        };
      }

      try {
        return {
          ok: true,
          result:
            getOfflineCompanyHeader()
        };
      } catch (error) {
        log(
          'ERRO IPC OFFLINE COMPANY HEADER',
          error
        );

        return {
          ok: false,
          error:
            error &&
            error.message
              ? error.message
              : String(error)
        };
      }
    }
  );

  ipcMain.handle(
    'efisco:offline-products-list',
    async (event) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-products-list',
          'invoke'
        )
      ) {
        return {
          ok: false,
          error: 'Origem de listagem offline nao autorizada.'
        };
      }

      try {
        return {
          ok: true,
          result:
            listOfflineProductsForSale({
              empresaId:
                resolveOfflineReferenceEmpresaId()
            })
        };
      } catch (error) {
        log('ERRO IPC OFFLINE PRODUCTS LIST', error);
        return {
          ok: false,
          error:
            error && error.message
              ? error.message
              : String(error)
        };
      }
    }
  );

  ipcMain.handle(
    'efisco:offline-customers-list',
    async (event, payload) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-customers-list',
          'invoke'
        )
      ) {
        return {
          ok: false,
          error: 'Origem de listagem offline de clientes nao autorizada.'
        };
      }

      try {
        return {
          ok: true,
          result: listOfflineCustomersForCrediario(payload || {})
        };
      } catch (error) {
        log('ERRO IPC OFFLINE CUSTOMERS LIST', error);
        return {
          ok: false,
          error:
            error && error.message
              ? error.message
              : String(error)
        };
      }
    }
  );

  ipcMain.handle(
    'efisco:offline-crediarios-list',
    async (event, payload) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-crediarios-list',
          'invoke'
        )
      ) {
        return {
          ok: false,
          error: 'Origem de listagem offline de crediarios nao autorizada.'
        };
      }

      try {
        return {
          ok: true,
          result: listOfflineCrediariosForF5(payload || {})
        };
      } catch (error) {
        log('ERRO IPC OFFLINE CREDIARIOS LIST', error);
        return {
          ok: false,
          error:
            error && error.message
              ? error.message
              : String(error)
        };
      }
    }
  );

  ipcMain.handle(
    'efisco:offline-crediario-detail',
    async (event, payload) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-crediario-detail',
          'invoke'
        )
      ) {
        return {
          ok: false,
          error: 'Origem de detalhe offline de crediário não autorizada.'
        };
      }

      try {
        return {
          ok: true,
          result: getOfflineCrediarioDetailForF5(payload || {})
        };
      } catch (error) {
        log('ERRO IPC OFFLINE CREDIARIO DETAIL', error);
        return {
          ok: false,
          error:
            error && error.message
              ? error.message
              : String(error)
        };
      }
    }
  );

  ipcMain.handle(
    'efisco:offline-crediario-open',
    async (event, payload) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-crediario-open',
          'invoke'
        )
      ) {
        return {
          ok: false,
          error: 'Origem de abertura offline de crediário não autorizada.'
        };
      }

      try {
        assertOfflineMutationAuthorized();

        const sale =
          payload &&
          payload.sale &&
          typeof payload.sale === 'object'
            ? payload.sale
            : payload;

        const input =
          buildOfflineCrediarioAtomicInput(
            sale || {}
          );

        const result =
          openCrediarioOfflineAtomic(
            input
          );

        return {
          ok: true,
          result: {
            ...result,
            crediarioId: input.crediarioId,
            contaReceberId: input.contaReceberId,
            offline: true,
            syncPendente: true
          }
        };
      } catch (error) {
        log('ERRO IPC OFFLINE CREDIARIO OPEN', error);
        return {
          ok: false,
          error:
            error && error.message
              ? error.message
              : String(error)
        };
      }
    }
  );

  ipcMain.handle(
    'efisco:offline-crediario-items-update',
    async (event, payload) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-crediario-items-update',
          'invoke'
        )
      ) {
        return {
          ok: false,
          error: 'Origem de atualização offline de crediário não autorizada.'
        };
      }

      try {
        assertOfflineMutationAuthorized();
        return {
          ok: true,
          result: updateOfflineCrediarioItemsForF5(payload || {})
        };
      } catch (error) {
        log('ERRO IPC OFFLINE CREDIARIO ITEMS UPDATE', error);
        return {
          ok: false,
          error:
            error && error.message
              ? error.message
              : String(error)
        };
      }
    }
  );

  const instalarOfflineHandler = (
    channel,
    logLabel,
    handler
  ) => {
    ipcMain.handle(
      channel,
      async (event, payload) => {
        if (
          !isIpcChannelAuthorized(
            event,
            channel,
            'invoke'
          )
        ) {
          return {
            ok: false,
            error: 'Origem offline nao autorizada.'
          };
        }

        try {
          return {
            ok: true,
            result: await handler(payload || {})
          };
        } catch (error) {
          log(logLabel, error);
          return {
            ok: false,
            error:
              error && error.message
                ? error.message
                : String(error)
          };
        }
      }
    );
  };

  instalarOfflineHandler(
    'efisco:offline-cash-consult',
    'ERRO IPC OFFLINE CASH CONSULT',
    (payload) =>
      consultCashOffline({
        ...payload,
        empresaId:
          resolveOfflineReferenceEmpresaId()
      })
  );

  instalarOfflineHandler(
    'efisco:offline-finance-snapshot',
    'ERRO IPC OFFLINE FINANCE SNAPSHOT',
    (payload) => {
      const empresaId =
        resolveOfflineReferenceEmpresaId();

      const salesPage =
        listOfflineSalesForFinance({
          ...(payload || {}),
          empresaId
        });

      const caixaConsulta =
        consultCashOffline({
          incluirResumo: true,
          empresaId
        });

      const historicos =
        empresaId
          ? listCashMovements({
              empresaId,
              limit: 5000
            }).slice().reverse()
          : [];

      const mapMovimento =
        (row) => {
          let detalhe = {};

          detalhe =
            row &&
            row.payload &&
            typeof row.payload === 'object'
              ? row.payload
              : {};

          const tipo =
            String(
              row &&
              row.movementType ||
              ''
            )
              .trim()
              .toUpperCase();

          return {
            id:
              String(
                row &&
                row.movementId ||
                ''
              ),
            caixaSessaoId:
              String(
                row &&
                row.sessionId ||
                ''
              ),
            tipo,
            valor:
              Number(
                row &&
                row.direction ||
                0
              ) *
              Number(
                row &&
                row.amountCentavos ||
                0
              ) /
              100,
            motivo:
              String(
                detalhe.motivo ||
                detalhe.meio ||
                tipo ||
                ''
              ).trim(),
            descricao:
              String(
                detalhe.descricao ||
                ''
              ).trim(),
            operadorNome:
              String(
                detalhe.operadorNome ||
                detalhe.nomeOperador ||
                detalhe.operatorName ||
                ''
              ).trim(),
            operadorId:
              String(
                detalhe.operadorId ||
                detalhe.operatorId ||
                ''
              ).trim(),
            criadoEm:
              String(
                row &&
                row.occurredAt ||
                ''
              )
          };
        };

      const movimentosHistoricos =
        historicos
          .map(mapMovimento)
          .filter(
            (movimento) =>
              movimento.tipo !==
                'VENDA_PAGA' &&
              movimento.tipo !==
                'CREDIARIO_RECEBIMENTO'
          );

      const caixaSeguro =
        caixaConsulta &&
        caixaConsulta.caixa &&
        caixaConsulta.caixa.resumo
          ? {
              ...caixaConsulta,
              caixa: {
                ...caixaConsulta.caixa,
                resumo: {
                  ...caixaConsulta.caixa.resumo,
                  movimentos:
                    Array.isArray(
                      caixaConsulta
                        .caixa
                        .resumo
                        .movimentos
                    )
                      ? caixaConsulta
                          .caixa
                          .resumo
                          .movimentos
                          .filter(
                            (movimento) => {
                              const tipo =
                                String(
                                  movimento &&
                                  movimento.tipo ||
                                  ''
                                )
                                  .trim()
                                  .toUpperCase();

                              return (
                                tipo !==
                                  'VENDA_PAGA' &&
                                tipo !==
                                  'CREDIARIO_RECEBIMENTO'
                              );
                            }
                          )
                      : []
                }
              }
            }
          : caixaConsulta;

      return {
        ...salesPage,
        caixaConsulta:
          caixaSeguro,
        movimentosCaixa:
          caixaSeguro &&
          caixaSeguro.caixa &&
          caixaSeguro
            .caixa
            .resumo &&
          Array.isArray(
            caixaSeguro
              .caixa
              .resumo
              .movimentos
          )
            ? caixaSeguro
                .caixa
                .resumo
                .movimentos
            : [],
        movimentosCaixaHistoricoFinanceiro:
          movimentosHistoricos,
        evolucaoSaldo7Dias: {
          pontos: []
        }
      };
    }
  );

  instalarOfflineHandler(
    'efisco:offline-cash-open',
    'ERRO IPC OFFLINE CASH OPEN',
    (payload) => {

      assertOfflineMutationAuthorized();

      return openCashOffline(
        withAuthenticatedOfflineOperator(
          payload
        )
      );

    }
  );

  instalarOfflineHandler(
    'efisco:offline-cash-movement',
    'ERRO IPC OFFLINE CASH MOVEMENT',
    (payload) => {

      assertOfflineMutationAuthorized();

      return registerCashMovementOffline(
        withAuthenticatedOfflineOperator(
          payload
        )
      );

    }
  );

  instalarOfflineHandler(
    'efisco:offline-cash-close',
    'ERRO IPC OFFLINE CASH CLOSE',
    (payload) => {

      assertOfflineMutationAuthorized();

      return closeCashOffline(
        withAuthenticatedOfflineOperator(
          payload
        )
      );

    }
  );

  instalarOfflineHandler(
    'efisco:nfce-number-peek',
    'ERRO IPC NFCE NUMBER PEEK',
    () => {
      assertOfflineMutationAuthorized();
      const offlineDb = getOfflineDatabase();
      const empresaId =
        resolveOfflineReferenceEmpresaId();
      if (!empresaId) throw new Error('Empresa autenticada não está disponível para o contador fiscal.');
      const deviceId =
        offlineSyncIdentity && offlineSyncIdentity.deviceId
          ? String(offlineSyncIdentity.deviceId)
          : getOrCreateSyncDeviceId({ db: offlineDb });
      const profile = getFiscalProfileCache(empresaId);
      if (!profile) throw new Error('Perfil fiscal local não está disponível para o contador fiscal.');
      return peekNextNfceNumber({
        empresaId,
        deviceId,
        ambiente: 'PRODUCAO',
        modelo: 65,
        serie: String(profile.serieNfce)
      });
    }
  );

  instalarOfflineHandler(
    'efisco:offline-sale-paid',
    'ERRO IPC OFFLINE SALE PAID',
    (payload) => {

      assertOfflineMutationAuthorized();

      const offlineDb = getOfflineDatabase();
      const deviceId =
        offlineSyncIdentity && offlineSyncIdentity.deviceId
          ? String(offlineSyncIdentity.deviceId)
          : getOrCreateSyncDeviceId({ db: offlineDb });

      return registerPaidSaleOffline(
        withAuthenticatedOfflineOperator(
          payload && payload.sale
        ),
        {
        empresaId:
          resolveOfflineReferenceEmpresaId(),
        deviceId,
        userDataDir: app.getPath('userData'),
        safeStorage,
        requireFiscalContingency: true
      });

    }
  );

  instalarOfflineHandler(
    'efisco:offline-nfce-contingency-danfe-preview',
    'ERRO IPC OFFLINE NFCE CONTINGENCIA DANFE PREVIEW',
    (payload) => {
      assertOfflineMutationAuthorized();
      const empresaId =
        resolveOfflineReferenceEmpresaId();
      if (!empresaId) {
        throw new Error('Empresa autenticada não está disponível para o DANFE de contingência.');
      }
      const saleId = String(payload && payload.saleId == null ? '' : payload.saleId).trim();
      if (!saleId || saleId.length > 256) {
        throw new Error('saleId inválido para o DANFE de contingência.');
      }
      return generateDanfeContingencyForSale({ empresaId, saleId });
    }
  );

  instalarOfflineHandler(
    'efisco:superadmin-a1-mirror',
    'ERRO IPC SUPERADMIN A1 MIRROR',
    async (payload) => {
      const identity = offlineSyncIdentity && typeof offlineSyncIdentity === 'object'
        ? offlineSyncIdentity
        : null;
      if (!identity || !identity.deviceId || !identity.deviceToken || !identity.empresaId) {
        throw new Error('Identidade autenticada do dispositivo não está disponível para espelhar o A1.');
      }
      if (!payload || payload.type !== 'SCF_SUPERADMIN_CERTIFICADO_A1_ENVIAR') {
        throw new Error('Mensagem de certificado A1 inválida.');
      }
      const empresaId = String(payload.empresaId == null ? '' : payload.empresaId).trim();
      if (!empresaId || empresaId !== String(identity.empresaId)) {
        throw new Error('Empresa do certificado A1 difere da empresa autenticada neste dispositivo.');
      }
      const response = await postAuthenticatedDeviceJson({
        endpoint: DEFAULT_SYNC_FISCAL_CERTIFICATE_SOURCE_URL,
        deviceId: identity.deviceId,
        deviceToken: identity.deviceToken,
        payload,
        timeoutMs: 30000
      });
      if (String(response.status || '').trim().toUpperCase() !== 'OK') {

        throw new Error('A VPS não confirmou o espelhamento seguro do certificado A1.');

      }

      const localProvision = await provisionFiscalA1FromServer({

        deviceId: identity.deviceId,

        deviceToken: identity.deviceToken,

        empresaId: identity.empresaId,

        userDataDir: app.getPath('userData'),

        safeStorage,

        timeoutMs: 30000

      });

      return {

        ...response,

        localProvision: {

          available: localProvision.available === true,

          stored: localProvision.stored === true,

          certificateId: localProvision.certificateId || null

        }

      };
    }
  );
}



async function processarContadorFiscalDoFrame(
  frame,
  requestId
) {
  if (
    !frame ||
    typeof frame.executeJavaScript !== 'function' ||
    frame.isDestroyed()
  ) {
    throw new Error(
      'Frame do PDV não está disponível para o contador fiscal.'
    );
  }

  const pedido = await frame.executeJavaScript(
    '(() => {' +
      'const bucket=window.__scfElectronPendingNfceCounterRequests;' +
      'if(!bucket||typeof bucket!=="object")return null;' +
      'const item=bucket[' + JSON.stringify(requestId) + '];' +
      'if(!item||item.requestId!==' + JSON.stringify(requestId) + ')return null;' +
      'return {' +
        'requestId:String(item.requestId||""),' +
        'action:String(item.action||""),' +
        'saleId:String(item.saleId||""),' +
        'numero:Number(item.numero||0),' +
        'status:String(item.status||""),' +
        'origin:String((window.location&&window.location.origin)||"")' +
      '};' +
    '})()',
    false
  );

  if (
    !pedido ||
    String(pedido.requestId || '') !== requestId
  ) {
    throw new Error(
      'Solicitação do contador NFC-e não foi encontrada no iframe.'
    );
  }

  const origem =
    String(pedido.origin || '')
      .trim()
      .toLowerCase();

  const trustedOnlinePdvFrame =
    mainWindow &&
    !mainWindow.isDestroyed() &&
    mainWindow.webContents &&
    !mainWindow.webContents.isDestroyed()
      ? await findPdvContinuityFrame(
          mainWindow.webContents,
          300
        )
      : null;

  const frameOrigin =
    String(
      frame &&
      typeof frame.origin === 'string'
        ? frame.origin
        : ''
    )
      .trim()
      .toLowerCase();

  if (
    !trustedOnlinePdvFrame ||
    trustedOnlinePdvFrame !== frame ||
    !origem ||
    !frameOrigin ||
    origem === 'null' ||
    origem !== frameOrigin
  ) {
    throw new Error(
      'Frame do contador NFC-e não pertence ao PDV online confiável.'
    );
  }

  const offlineDb = getOfflineDatabase();
  const empresaId =
    getSyncEmpresaId({ db: offlineDb });

  if (!empresaId) {
    throw new Error(
      'Empresa autenticada não está disponível para o contador fiscal.'
    );
  }

  const deviceId =
    offlineSyncIdentity &&
    offlineSyncIdentity.deviceId
      ? String(offlineSyncIdentity.deviceId)
      : getOrCreateSyncDeviceId({ db: offlineDb });

  const profile =
    getFiscalProfileCache(empresaId);

  if (!profile) {
    throw new Error(
      'Perfil fiscal local não está disponível para o contador fiscal.'
    );
  }

  const comum = {
    empresaId,
    deviceId,
    ambiente: 'PRODUCAO',
    modelo: 65,
    serie: String(profile.serieNfce)
  };

  const action =
    String(pedido.action || '')
      .trim()
      .toUpperCase();

  let result;

  if (action === 'NEXT') {
    const next =
      peekNextNfceNumber(comum);

    result = {
      ...next,
      numero: Number(next.proximoNumero)
    };
  } else if (action === 'CONSUME') {
    result =
      consumeNextNfceNumber({
        ...comum,
        numero: pedido.numero
      });
  } else {
    throw new Error(
      'Ação do contador NFC-e não suportada.'
    );
  }

  const serializado =
    JSON.stringify({
      requestId,
      ok: true,
      result
    });

  await frame.executeJavaScript(
    '(() => {' +
      'window.dispatchEvent(new CustomEvent(' +
      JSON.stringify(FRAME_NFCE_COUNTER_RESPONSE_EVENT) +
      ',{detail:' + serializado + '}));' +
      'return true;' +
    '})()',
    false
  );

  log('NFCE COUNTER FRAME OK', {
    action,
    saleId: pedido.saleId || '',
    numero:
      result &&
      (result.numero || result.proximoNumero) ||
      null
  });

  return result;
}

async function responderErroContadorFiscalDoFrame(
  frame,
  requestId,
  error
) {
  if (
    !frame ||
    typeof frame.executeJavaScript !== 'function' ||
    frame.isDestroyed()
  ) {
    return;
  }

  const serializado =
    JSON.stringify({
      requestId,
      ok: false,
      error:
        error && error.message
          ? error.message
          : String(error)
    });

  try {
    await frame.executeJavaScript(
      '(() => {' +
        'window.dispatchEvent(new CustomEvent(' +
        JSON.stringify(FRAME_NFCE_COUNTER_RESPONSE_EVENT) +
        ',{detail:' + serializado + '}));' +
        'return true;' +
      '})()',
      false
    );
  } catch (_) {}
}

async function isTrustedPdvFrameForContents(
  contents,
  frame
) {
  if (
    !contents ||
    typeof contents.isDestroyed !== 'function' ||
    contents.isDestroyed() ||
    !frame ||
    typeof frame.isDestroyed !== 'function' ||
    frame.isDestroyed()
  ) {
    return false;
  }

  const trustedFrame =
    await findPdvContinuityFrame(
      contents,
      300
    );

  if (
    !trustedFrame ||
    trustedFrame !== frame
  ) {
    return false;
  }

  if (
    offlineView &&
    offlineView.webContents &&
    !offlineView.webContents.isDestroyed() &&
    contents === offlineView.webContents
  ) {
    const frameUrl =
      typeof frame.url === 'string'
        ? frame.url
        : '';

    return isOfflineOriginAllowed(frameUrl);
  }

  return Boolean(
    mainWindow &&
    !mainWindow.isDestroyed() &&
    mainWindow.webContents &&
    !mainWindow.webContents.isDestroyed() &&
    contents === mainWindow.webContents
  );
}

function instalarCanalDiretoDoFrame(

  contentsAlvo = null

) {

  const contents =

    contentsAlvo ||

    (

      mainWindow &&

      !mainWindow.isDestroyed()

        ? mainWindow.webContents

        : null

    );



  if (

    !contents ||

    contents.isDestroyed()

  ) {

    return;

  }

  contents.on(
    'console-message',
    async (
      details,
      levelDeprecated,
      messageDeprecated,
      lineDeprecated,
      sourceIdDeprecated
    ) => {
      let message =
        '';

      let frame =
        null;

      /*
       * API atual do Electron:
       * details.message + details.frame (WebFrameMain).
       */
      if (
        details &&
        typeof details ===
          'object'
      ) {
        if (
          typeof details.message ===
            'string'
        ) {
          message =
            details.message;
        }

        if (
          details.frame
        ) {
          frame =
            details.frame;
        }
      }

      /*
       * Compatibilidade com assinatura antiga para a mensagem.
       * Frame exato requer Electron atual, que o GERAR instala com @latest.
       */
      if (
        !message &&
        typeof messageDeprecated ===
          'string'
      ) {
        message =
          messageDeprecated;
      }

      const privilegedFrameMarker =
        [
          FRAME_ONLINE_NFCE_NUMBER_RESPONSE_MARKER,
          FRAME_NFCE_COUNTER_MARKER,
          FRAME_CONTINGENCY_PRINT_DIAG_MARKER,
          FRAME_PRINT_MARKER
        ]
          .find(
            (marker) =>
              message.startsWith(marker)
          ) || '';

      if (
        privilegedFrameMarker &&
        !(
          await isTrustedPdvFrameForContents(
            contents,
            frame
          )
        )
      ) {
        log(
          'FRAME BRIDGE DENIED',
          {
            marker:
              privilegedFrameMarker,
            source:
              sanitizeNavigationUrlForLog(
                frame &&
                typeof frame.url === 'string'
                  ? frame.url
                  : ''
              )
          }
        );

        return;
      }

      if (
        message.startsWith(
          FRAME_ONLINE_NFCE_NUMBER_RESPONSE_MARKER
        )
      ) {
        const number =
          Number(
            message.slice(
              FRAME_ONLINE_NFCE_NUMBER_RESPONSE_MARKER.length
            )
          );

        log(
          'ONLINE NFCE NUMBER RESPONSE',
          {
            proximoNumeroNfceProducao:
              Number.isSafeInteger(number) &&
              number > 0
                ? number
                : null
          }
        );

        return;
      }

      if (
        message.startsWith(
          FRAME_NFCE_COUNTER_MARKER
        )
      ) {
        const requestId =
          message.slice(
            FRAME_NFCE_COUNTER_MARKER.length
          );

        try {
          await processarContadorFiscalDoFrame(
            frame,
            requestId
          );
        } catch (error) {
          await responderErroContadorFiscalDoFrame(
            frame,
            requestId,
            error
          );

          log(
            'ERRO NFCE COUNTER FRAME',
            error
          );
        }

        return;
      }

      if (

        message.startsWith(

          FRAME_CONTINGENCY_PRINT_DIAG_MARKER

        )

      ) {

        const rawDiag =

          message.slice(

            FRAME_CONTINGENCY_PRINT_DIAG_MARKER.length

          );



        let printDiag = {};



        try {

          printDiag =

            JSON.parse(rawDiag);

        } catch (_) {

          printDiag = {

            raw: rawDiag

          };

        }



        log(

          'OFFLINE NFCE PRINT DIAG',

          printDiag

        );



        return;

      }



      if (

        !message.startsWith(

          FRAME_PRINT_MARKER

        )

      ) {

        return;

      }

      const requestId =
        message.slice(
          FRAME_PRINT_MARKER.length
        );

      log(
        'MARCADOR FRAME RECEBIDO',
        {
          requestId,
          sourceId:
            details &&
            details.sourceId
              ? details.sourceId
              : sourceIdDeprecated || ''
        }
      );

      const origemOffline =
        Boolean(
          offlineView &&
          !offlineView.webContents.isDestroyed() &&
          contents ===
            offlineView.webContents
        );

      if (
        !origemOffline &&
        (
          !frame ||
          typeof frame.executeJavaScript !==
            'function' ||
          frame.isDestroyed()
        )
      ) {
        log(
          'ERRO FRAME',
          'Electron não forneceu WebFrameMain válido para a solicitação.'
        );

        return;
      }

      if (
        origemOffline &&
        (
          !contents ||
          typeof contents.executeJavaScript !==
            'function' ||
          contents.isDestroyed()
        )
      ) {
        log(
          'ERRO FRAME',
          'WebContents OFFLINE inválido para a solicitação.'
        );

        return;
      }

      try {
        const codigo = `
          (() => {
            const janelaPayload =
              ${origemOffline}
                ? (
                    document
                      .getElementById(
                        'scfOfflinePdv'
                      ) &&
                    document
                      .getElementById(
                        'scfOfflinePdv'
                      ).contentWindow
                  )
                : window;

            const payload =
              janelaPayload &&
              janelaPayload
                .__scfElectronPendingPrintPayload;

            if (
              !payload ||
              payload.requestId !==
                ${JSON.stringify(requestId)}
            ) {
              return null;
            }

            /*
             * Faz uma cÃ³pia simples serializÃ¡vel e limpa logo depois
             * para nÃ£o reter a imagem base64 na memÃ³ria do iframe.
             */
            const copia = {
              nativeReceipt:
                payload.nativeReceipt || null,

              imageBase64:
                payload.imageBase64 || '',

              origem:
                payload.origem || 'NFCE',

              saleId:
                payload.saleId || ''
            };

            janelaPayload.__scfElectronPendingPrintPayload =
              null;

            return copia;
          })();
        `;

        const payload =
          origemOffline
            ? await contents.executeJavaScript(
                codigo,
                false
              )
            : await frame.executeJavaScript(
                codigo,
                false
              );

        if (
          !payload ||
          (
            !payload.nativeReceipt &&
            !payload.imageBase64
          )
        ) {
          throw new Error(
            'O iframe nÃ£o retornou dados pendentes da NFC-e.'
          );
        }

        log(
          'PAYLOAD FRAME OBTIDO',
          {
            requestId,
            origem:
              payload.origem || '',
            saleId:
              payload.saleId || '',
            modo:
              payload.nativeReceipt
                ? 'NATIVE_TEXT_QR'
                : 'IMAGE_FALLBACK',
            tamanhoBase64:
              String(
                payload.imageBase64 || ''
              ).length
          }
        );

        const resultado =
          await enfileirar(
            payload
          );

        log(
          'IMPRESSAO FRAME CONCLUIDA',
          resultado
        );
      } catch (error) {
        log(
          'ERRO CANAL FRAME',
          error
        );
      }
    }
  );

  log(
    'CANAL CONSOLE-FRAME INSTALADO'
  );
}


async function instalarPonteTopDeImpressao() {
  if (
    !mainWindow ||
    mainWindow.isDestroyed()
  ) {
    return;
  }

  const trustedPdvFrame =
    await findPdvContinuityFrame(
      mainWindow.webContents,
      1500
    );

  const trustedPdvOrigin =
    String(
      trustedPdvFrame &&
      typeof trustedPdvFrame.origin === 'string'
        ? trustedPdvFrame.origin
        : ''
    ).trim();

  if (
    !trustedPdvFrame ||
    !trustedPdvOrigin ||
    trustedPdvOrigin === 'null'
  ) {
    log(
      'PONTE TOP DE IMPRESSAO NAO INSTALADA',
      {
        reason:
          'PDV_TRUST_ORIGIN_UNAVAILABLE'
      }
    );

    return;
  }

  const codigo = `
    (() => {
      const TRUSTED_PDV_ORIGIN =
        ${JSON.stringify(trustedPdvOrigin)};

      if (
        window.__efiscoTopPrintBridgeInstalled
      ) {
        return true;
      }

      window.__efiscoTopPrintBridgeInstalled =
        true;

      const processados =
        new Map();

      window.addEventListener(
        'message',
        async (event) => {
          const data =
            event &&
            event.data &&
            typeof event.data ===
              'object'
              ? event.data
              : null;

          if (
            !data ||
            data.type !==
              'SCF_EFISCO_IMPRIMIR_NFCE_LOCAL' ||
            !event.source ||
            event.source === window ||
            event.origin !==
              TRUSTED_PDV_ORIGIN
          ) {
            return;
          }

          const requestId =
            String(
              data.requestId || ''
            );

          if (
            requestId &&
            processados.has(
              requestId
            )
          ) {
            return;
          }

          if (requestId) {
            processados.set(
              requestId,
              Date.now()
            );

            window.setTimeout(
              () =>
                processados.delete(
                  requestId
                ),
              60000
            );
          }

          const payload =
            data.payload &&
            typeof data.payload ===
              'object'
              ? data.payload
              : {};

          let resultado;

          try {
            if (
              !window.efiscoDesktop ||
              typeof window.efiscoDesktop.printNfce80 !==
                'function'
            ) {
              throw new Error(
                'Ponte Electron de impressÃ£o nÃ£o disponÃ­vel.'
              );
            }

            resultado =
              await window.efiscoDesktop
                .printNfce80(
                  payload
                );
          } catch (error) {
            resultado = {
              ok: false,
              error:
                error &&
                error.message
                  ? error.message
                  : String(error)
            };
          }

          try {
            if (
              event.source &&
              typeof event.source.postMessage ===
                'function'
            ) {
              event.source.postMessage(
                {
                  type:
                    'SCF_EFISCO_IMPRIMIR_NFCE_LOCAL_RESULT',

                  requestId,

                  resultado
                },
                TRUSTED_PDV_ORIGIN
              );
            }
          } catch (_) {}
        },
        false
      );

      return true;
    })();
  `;

  try {
    await mainWindow
      .webContents
      .executeJavaScript(
        codigo,
        false
      );

    log(
      'PONTE TOP DE IMPRESSAO INSTALADA'
    );
  } catch (error) {
    log(
      'ERRO AO INSTALAR PONTE TOP',
      error
    );
  }
}

async function limparTudoDaSessao() {
  const ses =
    session.defaultSession;

  try {
    await ses.clearData();
  } catch (_) {}

  try {
    await ses.clearCodeCaches({});
  } catch (_) {}

  try {
    await ses.clearHostResolverCache();
  } catch (_) {}
}

function paginaAtualizando() {
  const html = `
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Atualizando e-fisco</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Arial, sans-serif;
    background: #f4f6f8;
    color: #18202a;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .card {
    width: 460px;
    background: #fff;
    border-radius: 16px;
    padding: 38px;
    text-align: center;
    box-shadow: 0 12px 40px rgba(0,0,0,.12);
  }
  h1 {
    margin: 0 0 16px;
    font-size: 26px;
  }
  p {
    font-size: 16px;
    line-height: 1.5;
  }
</style>
</head>
<body>
  <div class="card">
    <h1>Atualizando e-fisco</h1>
    <p>Baixando e instalando a nova versão.</p>
    <p><strong>Não desligue o computador.</strong></p>
  </div>
</body>
</html>`;

  return `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`;
}
function paginaAtualizacaoObrigatoria(versao) {
  const html = `
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Atualização do e-fisco</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Arial, sans-serif;
    background: #f4f6f8;
    color: #18202a;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .card {
    width: 460px;
    background: #fff;
    border-radius: 16px;
    padding: 38px;
    text-align: center;
    box-shadow: 0 12px 40px rgba(0,0,0,.12);
  }
  h1 {
    margin: 0 0 16px;
    font-size: 26px;
  }
  p {
    margin: 8px 0;
    font-size: 16px;
    line-height: 1.5;
  }
  .versao {
    margin: 22px 0;
    font-weight: 700;
    font-size: 18px;
  }
  a {
    display: block;
    width: 100%;
    padding: 16px;
    border-radius: 10px;
    background: #1677ff;
    color: #fff;
    text-decoration: none;
    font-weight: 700;
    font-size: 17px;
  }
</style>
</head>
<body>
  <div class="card">
    <h1>Atualização disponível</h1>
    <p>Uma nova versão do e-fisco precisa ser instalada para continuar.</p>
    <div class="versao">Nova versão: ${versao}</div>
    <a href="efisco-update://start">ATUALIZAR</a>
  </div>
</body>
</html>`;

  return `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`;
}
async function iniciarAtualizacaoObrigatoria() {
  if (atualizacaoEmAndamento) {
    return;
  }

  atualizacaoEmAndamento = true;

  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(paginaAtualizando());
    }

    await autoUpdater.downloadUpdate();

    await iniciarHelperExternoAtualizacao();

    autoUpdater.quitAndInstall(true, true);
  } catch (erro) {
    atualizacaoEmAndamento = false;
    log('ERRO AUTOUPDATE', erro);
    throw erro;
  }
}
function scfCompararVersoes(a, b) {
  const pa = String(a || '').split('.').map((parte) => {
    const numero = parseInt(parte, 10);
    return Number.isFinite(numero) ? numero : 0;
  });

  const pb = String(b || '').split('.').map((parte) => {
    const numero = parseInt(parte, 10);
    return Number.isFinite(numero) ? numero : 0;
  });

  const tamanho = Math.max(pa.length, pb.length);

  for (let i = 0; i < tamanho; i += 1) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;

    if (va > vb) return 1;
    if (va < vb) return -1;
  }

  return 0;
}

async function verificarAtualizacaoObrigatoria() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  const resultado = await autoUpdater.checkForUpdates();

  if (
    resultado &&
    resultado.updateInfo &&
    resultado.updateInfo.version &&
    scfCompararVersoes(resultado.updateInfo.version, app.getVersion()) > 0
  ) {
    return resultado.updateInfo.version;
  }

  return null;
}
async function verificarManifestoStandby() {
  try {
    const resultado =
      await checkDesktopManifest({
        userDataDir:
          app.getPath('userData'),

        electronVersion:
          app.getVersion(),

        userAgent:
          chromeUserAgent(),

        timeoutMs:
          4000,

        logger:
          (...partes) =>
            log(...partes)
      });

    log(
      'STANDBY MANIFEST CHECK',
      {
        source:
          resultado.source,

        ok:
          resultado.ok,

        compatibility:
          resultado.compatibility ||
          null,

        error:
          resultado.error ||
          null
      }
    );

    /*
     * Pacote de standby: somente prepara o SLOT INATIVO.
     * Nunca ativa nem troca a interface nesta fase.
     */
    if (
      resultado.source === 'REMOTE' &&
      resultado.manifest &&
      resultado.manifest.offlinePackage
    ) {
      try {
        const pacote =
          await prepareOfflinePackage({
            userDataDir:
              app.getPath('userData'),

            electronVersion:
              app.getVersion(),

            manifest:
              resultado.manifest,

            userAgent:
              chromeUserAgent(),

            timeoutMs:
              15000
          });

        log(
          'STANDBY PACKAGE PREPARE',
          pacote
        );
      } catch (erroPacote) {
        log(
          'ERRO ISOLADO AO PREPARAR PACOTE STANDBY',
          erroPacote
        );
      }
    }
  } catch (erro) {
    /*
     * Regra da Fase 1:
     * falha de manifesto NUNCA pode impedir o Wix de abrir.
     */
    log(
      'ERRO ISOLADO NO STANDBY MANIFEST',
      erro
    );
  }
}

function iniciarMonitorManifestoStandby() {
  if (timerManifestoStandby) {
    return;
  }

  setTimeout(
    () => {
      verificarManifestoStandby();
    },
    1000
  );

  timerManifestoStandby =
    setInterval(
      () => {
        verificarManifestoStandby();
      },
      INTERVALO_MANIFESTO_STANDBY_MS
    );

  if (
    timerManifestoStandby &&
    typeof timerManifestoStandby.unref ===
      'function'
  ) {
    timerManifestoStandby.unref();
  }
}

function pararMonitorManifestoStandby() {
  if (!timerManifestoStandby) {
    return;
  }

  clearInterval(
    timerManifestoStandby
  );

  timerManifestoStandby =
    null;
}

function offlineAuthFailure(error) {

  return Boolean(

    error &&

    (

      error.code === 'SYNC_DEVICE_AUTH_FAILED' ||

      error.httpStatus === 401 ||

      error.httpStatus === 403

    )

  );

}



function marcarOfflineAuthInvalida(error) {

  offlineAuthorizationState = 'INVALID';

  log('OFFLINE SYNC AUTH INVALID', {

    code: error && error.code || null,

    httpStatus: error && error.httpStatus || null

  });

}



function assertOfflineMutationAuthorized() {

  if (offlineAuthorizationState === 'INVALID') {

    throw new Error(

      'Autorização offline do dispositivo foi recusada pelo servidor. Reconecte ou repareie o dispositivo antes de novas operações offline.'

    );

  }



  if (

    !offlineSyncIdentity ||

    !offlineSyncIdentity.deviceId ||

    !offlineSyncIdentity.deviceToken ||

    !offlineSyncIdentity.empresaId

  ) {

    throw new Error(

      'Dispositivo ainda não possui identidade autenticada suficiente para operações offline.'

    );

  }

  if (
    offlineUiMode === 'OFFLINE' &&
    !offlineAuthenticatedOperator
  ) {
    throw new Error(
      'Operador ainda não foi autenticado para operações offline.'
    );
  }

}



async function probeWixReachableStartup(
  timeoutMs = OFFLINE_STARTUP_PROBE_TIMEOUT_MS
) {
  /*
   * Na abertura do aplicativo não aguardamos o monitor de
   * 3 falhas. Se o Chromium já sabe que não existe internet,
   * entramos em contingência imediatamente.
   */
  try {
    if (net.isOnline() === false) {
      return false;
    }
  } catch (_) {}

  return new Promise((resolve) => {
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value === true);
    };

    const req = https.request(
      URL_E_FISCO,
      {
        method: 'HEAD',
        headers: {
          'user-agent': chromeUserAgent(),
          accept: 'text/html,*/*'
        }
      },
      (res) => {
        const status = Number(res.statusCode || 0);
        res.resume();

        finish(
          status >= 200 &&
          status < 400
        );
      }
    );

    req.setTimeout(
      timeoutMs,
      () => {
        req.destroy(
          new Error('Startup connectivity probe timeout.')
        );
      }
    );

    req.on(
      'error',
      () => finish(false)
    );

    req.end();
  });
}


function probeWixReachable() {

  return new Promise((resolve) => {

    let settled = false;

    const finish = (value) => {

      if (settled) return;

      settled = true;

      resolve(value === true);

    };



    const req = https.request(

      URL_E_FISCO,

      {

        method: 'HEAD',

        headers: {

          'user-agent': chromeUserAgent(),

          accept: 'text/html,*/*'

        }

      },

      (res) => {

        const status = Number(res.statusCode || 0);

        res.resume();

        finish(status >= 200 && status < 400);

      }

    );



    req.setTimeout(

      OFFLINE_WIX_PROBE_TIMEOUT_MS,

      () => req.destroy(new Error('Wix probe timeout.'))

    );

    req.on('error', () => finish(false));

    req.end();

  });

}



function outboxStatusSummary() {

  const identity = resolveOfflineOperationSyncIdentity();

  if (!identity) return {};

  return getOutboxStatusSummary(identity.empresaId);

}



function activeOutboxCount(summary) {

  return ['PENDING', 'RETRY', 'SENDING']

    .reduce((total, status) => total + Number(summary[status] || 0), 0);

}



async function refreshRemoteCashState() {
  const identity =
    resolveOfflineOperationSyncIdentity();

  if (!identity) return null;

  const state = await pullSyncCashState({
    deviceId: identity.deviceId,
    deviceToken: identity.deviceToken,
    empresaId: identity.empresaId,
    timeoutMs: 10_000
  });

  return mirrorRemoteCashState(state);
}



function enqueueAuthorizedNfceResultSync() {
  const identity =
    resolveOfflineOperationSyncIdentity();

  if (!identity) {
    return { considered: 0, enqueued: 0 };
  }

  const empresaId = identity.empresaId;
  const documents = listAuthorizedNfcePendingSync({
    empresaId,
    limit: 50
  });

  let enqueued = 0;
  for (const document of documents) {
    const operationId = `nfce-auth:${document.fiscalId}`;
    const payload = {
      saleId: document.saleId,
      fiscalId: document.fiscalId,
      ambiente: document.ambiente,
      modelo: document.modelo,
      serie: document.serie,
      numero: document.numero,
      chaveAcesso: document.chaveAcesso,
      tipoEmissao: document.tipoEmissao,
      dataHoraEmissao: document.dataHoraEmissao,
      protocolo: document.protocolo,
      cStat: document.cStat,
      xMotivo:
        document.xMotivo ||
        'Autorizado o uso da NF-e',
      autorizadoEm: document.autorizadoEm,
      contingenciaOffline: true,
      pendenteTransmissao: false,
      nfeProcXml:
        Buffer.from(document.processedXml)
          .toString('utf8')
    };
    const dependencies = document.saleSyncOperationId
      ? [document.saleSyncOperationId]
      : [];

    const result = enqueueOutboxOperation({
      empresaId,
      operationId,
      type: 'NFCE_AUTHORIZED',
      entityId: document.saleId,
      payload,
      dependencies
    });

    if (result.applied) {
      enqueued += 1;
    }
  }

  return {
    considered: documents.length,
    enqueued
  };
}

async function syncOutboxPending() {

  const identity =
    resolveOfflineOperationSyncIdentity();

  if (!identity || offlineAuthorizationState === 'INVALID') {

    return outboxStatusSummary();

  }

  const fiscalAuthorizationSync = enqueueAuthorizedNfceResultSync();
  if (fiscalAuthorizationSync.enqueued > 0) {
    log('OFFLINE FISCAL AUTHORIZATION SYNC QUEUED', {
      enqueued: fiscalAuthorizationSync.enqueued
    });
  }



  const baseTransport = createHttpSyncTransport({

    enabled: true,

    deviceId: identity.deviceId,

    deviceToken: identity.deviceToken,

    timeoutMs: 15_000

  });



  const guardedTransport = async (operation) => {

    const result = await baseTransport(operation);

    if (result && result.authFailure === true) {

      const error = new Error(

        result.error || 'Autenticação do device recusada pelo servidor.'

      );

      error.code = 'SYNC_DEVICE_AUTH_FAILED';

      error.httpStatus = result.httpStatus;

      throw error;

    }

    return result;

  };



  for (let cycle = 0; cycle < 50; cycle += 1) {

    const result = await processOutboxOnce({

      empresaId: identity.empresaId,

      transport: guardedTransport,

      limit: 20

    });

    if (!result || result.considered === 0) break;

  }



  return outboxStatusSummary();

}



async function probeSyncReachable() {

  if (!offlineSyncIdentity || !offlineSyncIdentity.deviceToken) {

    return { reachable: false, authenticated: false };

  }



  try {

    const ping = await pingSyncDevice({

      deviceId: offlineSyncIdentity.deviceId,

      deviceToken: offlineSyncIdentity.deviceToken,

      timeoutMs: 10_000

    });



    if (

      offlineSyncIdentity.empresaId &&

      ping.empresaId !== offlineSyncIdentity.empresaId

    ) {

      const error = new Error('Empresa retornada pelo sync mudou durante a execução.');

      error.code = 'SYNC_DEVICE_AUTH_FAILED';

      throw error;

    }



    offlineSyncIdentity.empresaId = ping.empresaId;

    offlineAuthorizationState = 'VALID';

    return { reachable: true, authenticated: true };

  } catch (error) {

    if (offlineAuthFailure(error)) {

      marcarOfflineAuthInvalida(error);

      return { reachable: true, authenticated: false, authInvalid: true };

    }

    return { reachable: false, authenticated: false, error };

  }

}



function resolveAuthorizedIpcSender(event) {
  const sender =
    event &&
    event.sender
      ? event.sender
      : null;

  const senderFrame =
    event &&
    event.senderFrame
      ? event.senderFrame
      : null;

  if (!sender || !senderFrame) {
    return null;
  }

  if (
    typeof senderFrame.isDestroyed === 'function' &&
    senderFrame.isDestroyed()
  ) {
    return null;
  }

  if (senderFrame.detached === true) {
    return null;
  }

  if (
    senderFrame.top !== senderFrame ||
    senderFrame.parent !== null
  ) {
    return null;
  }

  const eventProcessId =
    Number.isInteger(
      event && event.processId
    )
      ? event.processId
      : null;

  const eventFrameId =
    Number.isInteger(
      event && event.frameId
    )
      ? event.frameId
      : null;

  const frameProcessId =
    Number.isInteger(senderFrame.processId)
      ? senderFrame.processId
      : null;

  const frameRoutingId =
    Number.isInteger(senderFrame.routingId)
      ? senderFrame.routingId
      : null;

  if (
    eventProcessId == null ||
    eventFrameId == null ||
    frameProcessId == null ||
    frameRoutingId == null ||
    eventProcessId !== frameProcessId ||
    eventFrameId !== frameRoutingId
  ) {
    return null;
  }

  const frameUrl =
    typeof senderFrame.url === 'string'
      ? senderFrame.url.trim()
      : '';

  const frameOrigin =
    typeof senderFrame.origin === 'string'
      ? senderFrame.origin.trim()
      : '';

  const matchesExpectedTopFrame = (
    webContents,
    urlAllowed,
    expectedOrigin,
    surface
  ) => {
    if (
      !webContents ||
      typeof webContents.isDestroyed !== 'function' ||
      webContents.isDestroyed() ||
      !webContents.mainFrame
    ) {
      return null;
    }

    if (
      sender !== webContents ||
      sender.id !== webContents.id ||
      senderFrame !== webContents.mainFrame
    ) {
      return null;
    }

    if (
      !frameUrl ||
      !frameOrigin ||
      frameOrigin !== expectedOrigin ||
      !urlAllowed(frameUrl)
    ) {
      return null;
    }

    return {
      surface,
      senderId: sender.id,
      frameUrl,
      frameOrigin
    };
  };

  if (
    mainWindow &&
    typeof mainWindow.isDestroyed === 'function' &&
    !mainWindow.isDestroyed() &&
    mainWindow.webContents
  ) {
    const online =
      matchesExpectedTopFrame(
        mainWindow.webContents,
        isOnlineOriginAllowed,
        ORIGIN_E_FISCO,
        IPC_SENDER_SCOPE.MAIN_WINDOW_TOP
      );

    if (online) {
      return online;
    }
  }

  if (
    offlineView &&
    offlineView.webContents
  ) {
    const offlineOrigin =
      offlineUiServer &&
      offlineUiServer.origin
        ? parseUrlSegura(offlineUiServer.origin)
        : null;

    if (offlineOrigin) {
      const offline =
        matchesExpectedTopFrame(
          offlineView.webContents,
          isOfflineOriginAllowed,
          offlineOrigin.origin,
          IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP
        );

      if (offline) {
        return offline;
      }
    }
  }

  return null;
}

function isMainWindowSender(event) {
  const sender =
    resolveAuthorizedIpcSender(event);

  return Boolean(
    sender &&
    sender.surface ===
      IPC_SENDER_SCOPE.MAIN_WINDOW_TOP
  );
}

function isAuthorizedAppSender(event) {
  return Boolean(
    resolveAuthorizedIpcSender(event)
  );
}

function isIpcChannelAuthorized(
  event,
  channel,
  transport
) {
  const channelName =
    String(channel || '').trim();

  const expectedTransport =
    String(transport || '').trim();

  const policy =
    IPC_CHANNEL_AUTHORIZATION_POLICY[
      channelName
    ];

  if (
    !policy ||
    !expectedTransport ||
    policy.transport !== expectedTransport
  ) {
    return false;
  }

  const sender =
    resolveAuthorizedIpcSender(event);

  if (
    !sender ||
    sender.surface !== policy.senderScope
  ) {
    return false;
  }

  if (policy.originScope === 'ONLINE_EXACT') {
    return Boolean(
      sender.surface ===
        IPC_SENDER_SCOPE.MAIN_WINDOW_TOP &&
      sender.frameOrigin === ORIGIN_E_FISCO &&
      isOnlineOriginAllowed(sender.frameUrl)
    );
  }

  if (
    policy.originScope ===
      'OFFLINE_RUNTIME_EXACT'
  ) {
    const offlineOrigin =
      offlineUiServer &&
      offlineUiServer.origin
        ? parseUrlSegura(
            offlineUiServer.origin
          )
        : null;

    return Boolean(
      offlineOrigin &&
      sender.surface ===
        IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP &&
      sender.frameOrigin ===
        offlineOrigin.origin &&
      isOfflineOriginAllowed(
        sender.frameUrl
      )
    );
  }

  return false;
}

function offlineOverlayBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  // No modo OFFLINE, o renderer local é responsável pelo shell completo:
  // topo da empresa, indicador de conectividade, PDV e menu inferior.
  const bounds = mainWindow.getContentBounds();
  const width = Math.max(1, Number(bounds.width || 1));
  const height = Math.max(1, Number(bounds.height || 1));

  return {
    x: 0,
    y: 0,
    width,
    height
  };
}

function offlineParkedBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { x: 0, y: 2, width: 1, height: 1 };
  }

  const bounds = mainWindow.getContentBounds();
  return {
    x: 0,
    y: Math.max(2, Number(bounds.height || 1) + 16),
    width: 1,
    height: 1
  };
}

function offlineStagingBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { x: 0, y: 2, width: 1, height: 1 };
  }

  const bounds = mainWindow.getContentBounds();
  const width = Math.max(1, Number(bounds.width || 1));
  const height = Math.max(1, Number(bounds.height || 1));

  return {
    x: 0,
    y: height + 16,
    width,
    height
  };
}

async function settleOfflineRendererBeforeReveal() {
  if (
    !offlineView ||
    !offlineViewReady ||
    !offlineView.webContents ||
    offlineView.webContents.isDestroyed()
  ) {
    return false;
  }

  /*
   * A view está fora da área visível durante o staging.
   * Não espere requestAnimationFrame aqui: Chromium pode suspender RAF
   * de conteúdo oculto e travar o failover antes do showOfflineOverlay().
   *
   * As alterações de autenticação e continuidade acima já foram executadas
   * no renderer. Damos apenas um pequeno turno ao event loop do processo
   * principal e forçamos uma leitura de layout síncrona, sem depender de RAF.
   */
  await new Promise((resolve) => setTimeout(resolve, 20));

  try {
    await offlineView.webContents.executeJavaScript(
      `(() => {
        if (document && document.body) {
          void document.body.offsetHeight;
        }
        return true;
      })()`,
      true
    );
  } catch (error) {
    log('OFFLINE PRE-REVEAL LAYOUT DEFERRED', {
      erro: String(error && error.message || error)
    });
  }

  return true;
}

function resizeOfflineOverlay() {
  if (!offlineView || !offlineViewReady) return;
  try {
    const visible =
      offlineUiMode === 'OFFLINE' ||
      offlineUiMode === 'SWITCHING_OFFLINE';
    offlineView.setBounds(
      visible ? offlineOverlayBounds() : offlineParkedBounds()
    );
  } catch (_) {}
}

function normalizeContinuityText(value) {
  return String(value == null ? '' : value)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function enrichContinuityDraftWithOfflineReferences(inputDraft) {
  const draft = inputDraft && typeof inputDraft === 'object'
    ? { ...inputDraft }
    : null;

  if (!draft) return null;

  let catalog = [];
  try {
    const empresaId =
      String(
        offlineAuthenticatedOperator &&
        offlineAuthenticatedOperator.empresaId ||
        offlineFailoverOnlineOperatorIdentity &&
        offlineFailoverOnlineOperatorIdentity.empresaId ||
        lastConfirmedOnlineOperatorIdentity &&
        lastConfirmedOnlineOperatorIdentity.empresaId ||
        ''
      ).trim();

    catalog =
      empresaId
        ? listOfflineProductsForSale({
            empresaId
          })
        : [];
  } catch (_) {
    catalog = [];
  }

  const resolveProduct = (item) => {
    const source = item && typeof item === 'object' ? item : {};
    if (String(source.productFiscalId || '').trim()) return { ...source };

    const codeCandidates = [
      source.productCode,
      source.codigo,
      source.gtin,
      source.barcode
    ]
      .map((value) => String(value == null ? '' : value).trim())
      .filter(Boolean);

    let matches = [];
    if (codeCandidates.length) {
      matches = catalog.filter((product) => {
        const keys = [product.produtoId, product.id, product.codigo, product.gtin, product.codigoBarras]
          .map((value) => String(value == null ? '' : value).trim())
          .filter(Boolean);
        return codeCandidates.some((candidate) => keys.includes(candidate));
      });
    }

    if (matches.length !== 1) {
      const name = normalizeContinuityText(source.name || source.nome || source.descricao);
      const unitValue = Number(source.unitValue || source.valorUnitario || 0);
      matches = catalog.filter((product) => {
        if (!name || normalizeContinuityText(product.nome || product.descricao) !== name) {
          return false;
        }
        const catalogValue = Number(product.valorUnitario || product.precoVenda || 0);
        return unitValue > 0
          ? Math.abs(catalogValue - unitValue) < 0.005
          : true;
      });
    }

    if (matches.length !== 1) return { ...source };

    const product = matches[0];
    return {
      ...source,
      productFiscalId: String(product.produtoId || product.id || '').trim(),
      productCode: String(product.codigo || '').trim(),
      gtin: String(product.gtin || product.codigoBarras || '').trim(),
      barcode: String(product.gtin || product.codigoBarras || product.codigo || '').trim(),
      ncm: String(product.ncm || source.ncm || '').trim(),
      cfop: String(product.cfop || source.cfop || '').trim(),
      unit: String(source.unit || product.unidade || 'UN').trim().toUpperCase(),
      unitValue: Number(source.unitValue || product.valorUnitario || 0),
      total:
        Number(source.total || 0) > 0
          ? Number(source.total)
          : Number(source.quantity || 0) * Number(source.unitValue || product.valorUnitario || 0)
    };
  };

  draft.products = Array.isArray(draft.products)
    ? draft.products.slice(0, 500).map(resolveProduct)
    : [];

  if (draft.currentProduct && typeof draft.currentProduct === 'object') {
    draft.currentProduct = resolveProduct(draft.currentProduct);
  }

  return draft;
}

async function ensureOnlineNfceNumberResponseDiagnostic(frame) {
  if (!frame || typeof frame.executeJavaScript !== 'function' || frame.isDestroyed()) {
    return false;
  }

  try {
    const result = await frame.executeJavaScript(`
      (() => {
        if (window.__scfOnlineNfceNumberResponseDiagnosticInstalled === true) {
          return 'ALREADY';
        }

        window.__scfOnlineNfceNumberResponseDiagnosticInstalled = true;

        window.addEventListener(
          'message',
          (event) => {
            const data =
              event &&
              event.data &&
              typeof event.data === 'object'
                ? event.data
                : null;

            if (
              event.source !== window.parent ||
              !data ||
              data.type !== 'SCF_NFCE_NUMERACAO_RESULTADO'
            ) {
              return;
            }

            const number = Number(data.proximoNumeroNfceProducao);

            console.log(
              '__EFISCO_ONLINE_NFCE_NUMBER_RESPONSE_V1__' +
              (
                Number.isSafeInteger(number) && number > 0
                  ? String(number)
                  : ''
              )
            );
          },
          false
        );

        return 'INSTALLED';
      })()
    `, true);

    if (result === 'INSTALLED') {
      log('ONLINE NFCE NUMBER DIAGNOSTIC INSTALLED');
    }

    return result === 'INSTALLED' || result === 'ALREADY';
  } catch (_) {
    return false;
  }
}

async function installOfflineVerifierTopBridge() {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !mainWindow.webContents ||
    mainWindow.webContents.isDestroyed()
  ) {
    return false;
  }

  const trustedPdvFrame =
    await findPdvContinuityFrame(
      mainWindow.webContents,
      1500
    );

  const trustedPdvOrigin =
    String(
      trustedPdvFrame &&
      typeof trustedPdvFrame.origin === 'string'
        ? trustedPdvFrame.origin
        : ''
    ).trim();

  if (
    !trustedPdvFrame ||
    !trustedPdvOrigin ||
    trustedPdvOrigin === 'null'
  ) {
    log(
      'OFFLINE OPERATOR TOP BRIDGE NOT INSTALLED',
      {
        reason:
          'PDV_TRUST_ORIGIN_UNAVAILABLE'
      }
    );

    return false;
  }

  try {
    const result =
      await mainWindow.webContents.executeJavaScript(
        `(() => {
          const TRUSTED_PDV_ORIGIN =
            ${JSON.stringify(trustedPdvOrigin)};

          if (
            window.__efiscoOfflineVerifierTopBridgeInstalled === true
          ) {
            return 'ALREADY';
          }

          window.__efiscoOfflineVerifierTopBridgeInstalled = true;

          const initialBridge =
            window.efiscoOfflineVerifierBridge;

          if (
            initialBridge &&
            typeof initialBridge.probe === 'function'
          ) {
            initialBridge.probe(
              'top-bridge-installed'
            );
          }

          window.addEventListener(
            'message',
            (event) => {
              const data =
                event &&
                event.data &&
                typeof event.data === 'object'
                  ? event.data
                  : null;

              if (
                !data ||
                data.type !==
                  'SCF_EFISCO_OFFLINE_VERIFIER_CANDIDATE' ||
                !event.source ||
                event.source === window ||
                event.origin !==
                  TRUSTED_PDV_ORIGIN
              ) {
                return;
              }

              const bridge =
                window.efiscoOfflineVerifierBridge;

              if (
                bridge &&
                typeof bridge.probe === 'function'
              ) {
                bridge.probe(
                  'top-candidate-message'
                );
              }

              if (
                !bridge ||
                typeof bridge.submit !== 'function'
              ) {
                return;
              }

              bridge.submit({
                kdf:
                  String(data.kdf || ''),
                salt:
                  String(data.salt || ''),
                verifier:
                  String(data.verifier || ''),
                params:
                  data.params &&
                  typeof data.params === 'object'
                    ? data.params
                    : {},
                capturedAt:
                  Number(data.capturedAt) || Date.now()
              });
            },
            false
          );

          return 'INSTALLED';
        })()`,
        true
      );

    return (
      result === 'INSTALLED' ||
      result === 'ALREADY'
    );
  } catch (error) {
    log('OFFLINE OPERATOR TOP BRIDGE INSTALL FAILED', {
      erro:
        String(
          error &&
          error.message ||
          error
        )
    });
    return false;
  }
}

async function findPdvContinuityFrame(webContents, timeoutMs = 1500) {
  if (!webContents || webContents.isDestroyed()) return null;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const frames = Array.isArray(webContents.mainFrame.framesInSubtree)
      ? webContents.mainFrame.framesInSubtree
      : [];

    for (const frame of frames) {
      if (!frame || frame === webContents.mainFrame) continue;
      try {
        const supported = await frame.executeJavaScript(`
          (() => Boolean(
            document.getElementById('fiscalProductsList') ||
            typeof window.__scfPdvExportContinuityDraft === 'function' ||
            typeof window.__scfPdvRestoreContinuityDraft === 'function'
          ))()
        `, true);
        if (supported === true) {
          if (
            mainWindow &&
            !mainWindow.isDestroyed() &&
            mainWindow.webContents &&
            !mainWindow.webContents.isDestroyed() &&
            webContents.id === mainWindow.webContents.id
          ) {
            await ensureOnlineNfceNumberResponseDiagnostic(frame);
          }

          return frame;
        }
      } catch (_) {}
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return null;
}

function isOfflineViewSender(event) {
  const sender =
    resolveAuthorizedIpcSender(event);

  return Boolean(
    sender &&
    sender.surface ===
      IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP
  );
}

function resolveOfflineOperatorProfileForSession(profile) {
  if (!profile || typeof profile !== 'object') {
    return null;
  }

  let empresaId =
    String(
      profile.empresaId ||
      ''
    ).trim();

  const perfil =
    String(profile.perfil || '')
      .trim()
      .toUpperCase();

  const nomeOperador =
    String(
      profile.nomeOperador ||
      profile.operadorNome ||
      profile.operatorName ||
      ''
    ).trim();

  let operadorId =
    String(
      profile.operadorId ||
      profile.operatorId ||
      ''
    ).trim();

  if (!empresaId && operadorId && perfil) {
    empresaId =
      resolveUniquePreparedEmpresaIdForProvisionedOperator(
        operadorId,
        perfil
      );
  }

  if (
    !empresaId ||
    !nomeOperador ||
    !['ADMINISTRADOR', 'SUPERVISOR', 'CAIXA'].includes(perfil)
  ) {
    return null;
  }

  if (!operadorId) {
    const matching =
      listActiveOfflineOperatorCredentials(
        empresaId
      ).filter((candidate) => (
        candidate &&
        String(candidate.nome || '').trim() === nomeOperador &&
        String(candidate.perfil || '').trim().toUpperCase() === perfil
      ));

    if (matching.length !== 1) {
      return null;
    }

    operadorId =
      String(
        matching[0].operadorId ||
        ''
      ).trim();
  }

  if (!operadorId) {
    return null;
  }

  return {
    ...profile,
    empresaId,
    operadorId,
    operatorId:
      operadorId,
    nomeOperador,
    operadorNome:
      nomeOperador,
    operatorName:
      nomeOperador,
    perfil
  };
}

function normalizeOfflineAuthenticatedOperator(profile) {
  const resolved =
    resolveOfflineOperatorProfileForSession(
      profile
    );

  if (!resolved) {
    return null;
  }

  const perfil =
    String(resolved.perfil || '')
      .trim()
      .toUpperCase();

  return {
    empresaId:
      String(resolved.empresaId || '').trim(),
    operadorId:
      String(resolved.operadorId || '').trim(),
    operatorId:
      String(resolved.operadorId || '').trim(),
    nomeOperador:
      String(resolved.nomeOperador || '').trim(),
    operadorNome:
      String(resolved.nomeOperador || '').trim(),
    operatorName:
      String(resolved.nomeOperador || '').trim(),
    perfil,
    acessoTotal:
      perfil === 'ADMINISTRADOR' &&
      resolved.acessoTotal === true,
    offline:
      true
  };
}

function setOfflineAuthenticatedOperator(profile) {
  const normalized =
    normalizeOfflineAuthenticatedOperator(
      profile
    );

  offlineAuthenticatedOperator =
    normalized;

  return normalized;
}

function clearOfflineAuthenticatedOperator() {
  offlineAuthenticatedOperator = null;
}

function rememberConfirmedOnlineOperatorIdentity(profile) {
  const normalized =
    normalizeOfflineAuthenticatedOperator(
      profile
    );

  if (!normalized) {
    return null;
  }

  lastConfirmedOnlineOperatorIdentity = {
    ...normalized,
    offline: false,
    confirmedAt: Date.now()
  };

  onlineOperatorIdentityRefreshMisses = 0;

  return lastConfirmedOnlineOperatorIdentity;
}

function recentConfirmedOnlineOperatorIdentity() {
  const cached =
    lastConfirmedOnlineOperatorIdentity &&
    typeof lastConfirmedOnlineOperatorIdentity === 'object'
      ? lastConfirmedOnlineOperatorIdentity
      : null;

  if (!cached) {
    return null;
  }

  const confirmedAt =
    Number(cached.confirmedAt || 0);

  if (
    !Number.isFinite(confirmedAt) ||
    confirmedAt <= 0 ||
    Date.now() - confirmedAt >
      ONLINE_OPERATOR_FAILOVER_CACHE_MAX_AGE_MS
  ) {
    return null;
  }

  return normalizeOfflineAuthenticatedOperator(
    cached
  );
}

async function refreshConfirmedOnlineOperatorIdentityFromLivePage(
  options = {}
) {
  const now = Date.now();

  if (
    now - lastOnlineOperatorIdentityRefreshAt <
      ONLINE_OPERATOR_IDENTITY_REFRESH_MS
  ) {
    return recentConfirmedOnlineOperatorIdentity();
  }

  lastOnlineOperatorIdentityRefreshAt = now;

  const identity =
    await captureOnlineOperatorIdentityForOfflineCache({
      timeoutMs: 700
    });

  if (identity) {
    return rememberConfirmedOnlineOperatorIdentity(
      identity
    );
  }

  if (options.browserOnline === true) {
    onlineOperatorIdentityRefreshMisses += 1;

    if (
      onlineOperatorIdentityRefreshMisses >=
        ONLINE_OPERATOR_IDENTITY_CLEAR_AFTER_MISSES
    ) {
      if (lastConfirmedOnlineOperatorIdentity) {
        log('ONLINE OPERATOR SESSION CACHE CLEARED', {
          reason: 'ONLINE_IDENTITY_ABSENT'
        });
      }

      lastConfirmedOnlineOperatorIdentity = null;
      onlineOperatorIdentityRefreshMisses = 0;
    }
  }

  return null;
}

function withAuthenticatedOfflineOperator(payload = {}) {
  const session =
    normalizeOfflineAuthenticatedOperator(
      offlineAuthenticatedOperator
    );

  if (!session) {
    throw new Error(
      'Operador offline autenticado não está disponível para atribuir a operação.'
    );
  }

  const source =
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload)
      ? payload
      : {};

  return {
    ...source,
    empresaId:
      session.empresaId,
    operadorId:
      session.operadorId,
    operatorId:
      session.operadorId,
    operadorNome:
      session.nomeOperador,
    nomeOperador:
      session.nomeOperador,
    operatorName:
      session.nomeOperador,
    operadorPerfil:
      session.perfil,
    perfilOperador:
      session.perfil,
    acessoTotalOperador:
      session.acessoTotal === true
  };
}

async function setOfflineShellAuthenticationState(profile) {
  if (
    !offlineView ||
    !offlineView.webContents ||
    offlineView.webContents.isDestroyed() ||
    !offlineViewReady
  ) {
    return false;
  }

  const normalized =
    normalizeOfflineAuthenticatedOperator(
      profile
    );

  const publicPayload =
    normalized
      ? {
          authenticated: true,
          nomeOperador:
            normalized.nomeOperador,
          perfil:
            normalized.perfil,
          acessoTotal:
            normalized.acessoTotal === true
        }
      : {
          authenticated: false,
          focus:
            offlineUiMode === 'OFFLINE' ||
            offlineUiMode === 'SWITCHING_OFFLINE'
        };

  try {
    const payloadJson =
      JSON.stringify(publicPayload);

    const result =
      await offlineView.webContents.executeJavaScript(
        `(() => {
          const fn = window.scfOfflineAuthSetState;
          if (typeof fn !== 'function') return false;
          return fn(${payloadJson}) === true;
        })()`,
        true
      );

    return result === true;
  } catch (error) {
    log('OFFLINE AUTH GATE STATE FAILED', {
      authenticated:
        publicPayload.authenticated === true,
      erro:
        String(
          error &&
          error.message ||
          error
        )
    });
    return false;
  }
}

function decodeCanonicalBase64(value, expectedLength = null) {
  const text = String(value || '').trim();
  if (!text) return null;

  try {
    const buffer = Buffer.from(text, 'base64');

    if (
      buffer.length < 1 ||
      buffer.toString('base64') !== text
    ) {
      try { buffer.fill(0); } catch (_) {}
      return null;
    }

    if (
      expectedLength != null &&
      buffer.length !== Number(expectedLength)
    ) {
      try { buffer.fill(0); } catch (_) {}
      return null;
    }

    return buffer;
  } catch (_) {
    return null;
  }
}

function offlineLoginRetryAfterMs(now=Date.now()){
  if(offlineLoginLastFailureAt&&now-offlineLoginLastFailureAt>=OFFLINE_LOGIN_RESET_MS)resetOfflineLoginBackoff();
  return Math.max(0,offlineLoginBlockedUntil-now);
}
function registerOfflineLoginFailure(now=Date.now()){
  if(offlineLoginLastFailureAt&&now-offlineLoginLastFailureAt>=OFFLINE_LOGIN_RESET_MS)offlineLoginFailures=0;
  offlineLoginLastFailureAt=now;
  offlineLoginFailures+=1;
  const delay=offlineLoginFailures<3?0:Math.min(30000,2000*(2**Math.min(offlineLoginFailures-3,4)));
  offlineLoginBlockedUntil=now+delay;
  return delay;
}
function resetOfflineLoginBackoff(){
  offlineLoginFailures=0;
  offlineLoginBlockedUntil=0;
  offlineLoginLastFailureAt=0;
}

function validateOfflineOperatorPasswordAcrossPreparedCompanies(
  input = {}
) {
  const senha =
    String(
      input.senha == null
        ? ''
        : input.senha
    ).trim();

  if (!/^\d{1,6}$/.test(senha)) {
    return {
      success: false,
      reason: 'INVALID_CREDENTIAL'
    };
  }

  const preparedCompanies =
    listPreparedOfflineCompanies();

  const empresaIds = [];
  const seen = new Set();

  for (const company of preparedCompanies) {
    const empresaId =
      String(
        company &&
        company.empresaId ||
        ''
      ).trim();

    if (
      !empresaId ||
      seen.has(empresaId)
    ) {
      continue;
    }

    seen.add(empresaId);
    empresaIds.push(empresaId);
  }

  if (empresaIds.length < 1) {
    const legacyEmpresaId =
      String(
        offlineSyncIdentity &&
        offlineSyncIdentity.empresaId ||
        ''
      ).trim();

    if (legacyEmpresaId) {
      empresaIds.push(
        legacyEmpresaId
      );
    }
  }

  if (empresaIds.length < 1) {
    return {
      success: false,
      reason:
        'OFFLINE_EMPRESA_NOT_READY'
    };
  }

  let matched = null;
  let matches = 0;
  let ambiguous = false;

  for (const empresaId of empresaIds) {
    const result =
      validateOfflineOperatorPasswordLocal({
        senha,
        empresaId
      });

    if (
      result &&
      result.success === true
    ) {
      matches += 1;
      matched = result;
      continue;
    }

    if (
      result &&
      result.reason ===
        'AMBIGUOUS_CREDENTIAL'
    ) {
      ambiguous = true;
    }
  }

  if (
    ambiguous ||
    matches !== 1 ||
    !matched
  ) {
    return {
      success: false,
      reason:
        (
          ambiguous ||
          matches > 1
        )
          ? 'AMBIGUOUS_CREDENTIAL'
          : 'ACCESS_DENIED'
    };
  }

  return matched;
}

function validateOfflineOperatorPasswordLocal(input = {}) {
  const senha =
    String(
      input.senha == null
        ? ''
        : input.senha
    ).trim();

  if (!/^\d{1,6}$/.test(senha)) {
    return {
      success: false,
      reason: 'INVALID_CREDENTIAL'
    };
  }

  const empresaId =
    String(
      input.empresaId ||
      (
        offlineSyncIdentity &&
        offlineSyncIdentity.empresaId
      ) ||
      ''
    ).trim();

  if (!empresaId) {
    return {
      success: false,
      reason: 'OFFLINE_EMPRESA_NOT_READY'
    };
  }

  if (!safeStorage.isEncryptionAvailable()) {
    return {
      success: false,
      reason: 'SAFE_STORAGE_UNAVAILABLE'
    };
  }

  const candidates =
    listActiveOfflineOperatorCredentials(
      empresaId
    );

  let matched = null;
  let matches = 0;

  for (const candidate of candidates) {
    if (
      !candidate ||
      candidate.ativo !== true
    ) {
      continue;
    }

    const credentialKdf =
      String(
        candidate.credentialKdf ||
        ''
      ).toUpperCase();

    const isScrypt =
      credentialKdf ===
        'SCRYPT_V1_SAFE_STORAGE';

    const isPbkdf2 =
      credentialKdf ===
        'PBKDF2_SHA256_V1_SAFE_STORAGE';

    if (!isScrypt && !isPbkdf2) {
      continue;
    }

    const params =
      candidate.credentialParams &&
      typeof candidate.credentialParams === 'object' &&
      !Array.isArray(candidate.credentialParams)
        ? candidate.credentialParams
        : {};

    if (
      String(params.wrapper || '') !== 'safeStorage' ||
      Number(params.keyLength) !== 32
    ) {
      continue;
    }

    if (
      isScrypt &&
      (
        Number(params.N) !== 32768 ||
        Number(params.r) !== 8 ||
        Number(params.p) !== 1
      )
    ) {
      continue;
    }

    if (
      isPbkdf2 &&
      (
        Number(params.iterations) !== 310000 ||
        String(params.hash || '').toUpperCase() !== 'SHA-256'
      )
    ) {
      continue;
    }

    let saltBuffer = null;
    let encryptedVerifierBuffer = null;
    let expectedVerifierBuffer = null;
    let calculatedVerifierBuffer = null;

    try {
      saltBuffer =
        decodeCanonicalBase64(
          candidate.credentialSalt,
          16
        );

      encryptedVerifierBuffer =
        decodeCanonicalBase64(
          candidate.credentialVerifier
        );

      if (
        !saltBuffer ||
        !encryptedVerifierBuffer
      ) {
        continue;
      }

      const decryptedVerifierText =
        safeStorage.decryptString(
          encryptedVerifierBuffer
        );

      expectedVerifierBuffer =
        decodeCanonicalBase64(
          decryptedVerifierText,
          32
        );

      if (!expectedVerifierBuffer) {
        continue;
      }

      calculatedVerifierBuffer =
        isScrypt
          ? crypto.scryptSync(
              senha,
              saltBuffer,
              32,
              {
                N: 32768,
                r: 8,
                p: 1,
                maxmem:
                  64 * 1024 * 1024
              }
            )
          : crypto.pbkdf2Sync(
              senha,
              saltBuffer,
              310000,
              32,
              'sha256'
            );

      if (
        crypto.timingSafeEqual(
          calculatedVerifierBuffer,
          expectedVerifierBuffer
        )
      ) {
        matches += 1;
        matched = {
          success: true,
          empresaId:
            candidate.empresaId,
          operadorId:
            candidate.operadorId,
          nomeOperador:
            candidate.nome,
          operadorNome:
            candidate.nome,
          perfil:
            candidate.perfil,
          acessoTotal:
            candidate.perfil === 'ADMINISTRADOR' &&
            candidate.acessoTotal === true,
          offline:
            true
        };
      }
    } catch (_) {
      // Credencial local inválida/corrompida: ignora e mantém falha fechada.
    } finally {
      for (const buffer of [
        saltBuffer,
        encryptedVerifierBuffer,
        expectedVerifierBuffer,
        calculatedVerifierBuffer
      ]) {
        if (buffer) {
          try { buffer.fill(0); } catch (_) {}
        }
      }
    }
  }

  if (matches !== 1 || !matched) {
    return {
      success: false,
      reason:
        matches > 1
          ? 'AMBIGUOUS_CREDENTIAL'
          : 'ACCESS_DENIED'
    };
  }

  return matched;
}

function persistExplicitOfflineCredentialProvision(
  payload = {}
) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    throw new Error(
      'Payload de credencial offline inválido.'
    );
  }

  const empresaId =
    String(
      payload.empresaId || ''
    ).trim();

  const perfil =
    String(
      payload.perfil || ''
    )
      .trim()
      .toUpperCase();

  const nome =
    String(
      payload.nomeOperador ||
      payload.nome ||
      (
        perfil === 'ADMINISTRADOR'
          ? 'ADMINISTRADOR'
          : ''
      )
    ).trim();

  let operadorId =
    String(
      payload.operadorId || ''
    ).trim();

  if (
    perfil === 'ADMINISTRADOR' &&
    !operadorId &&
    empresaId
  ) {
    operadorId =
      'ADMINISTRADOR:' +
      empresaId;
  }

  if (
    !empresaId ||
    !operadorId ||
    !nome ||
    ![
      'ADMINISTRADOR',
      'SUPERVISOR',
      'CAIXA'
    ].includes(perfil)
  ) {
    throw new Error(
      'Identidade da credencial offline está incompleta.'
    );
  }

  const credential =
    payload.credential &&
    typeof payload.credential ===
      'object' &&
    !Array.isArray(
      payload.credential
    )
      ? payload.credential
      : {};

  const kdf =
    String(
      credential.kdf || ''
    )
      .trim()
      .toUpperCase();

  const params =
    credential.params &&
    typeof credential.params ===
      'object' &&
    !Array.isArray(
      credential.params
    )
      ? credential.params
      : {};

  if (
    kdf !==
      'PBKDF2_SHA256_V1' ||
    Number(
      params.iterations
    ) !== 310000 ||
    String(
      params.hash || ''
    )
      .trim()
      .toUpperCase() !==
      'SHA-256' ||
    Number(
      params.keyLength
    ) !== 32
  ) {
    throw new Error(
      'Parâmetros da credencial offline são inválidos.'
    );
  }

  const saltText =
    String(
      credential.salt || ''
    ).trim();

  const verifierText =
    String(
      credential.verifier || ''
    ).trim();

  let saltBuffer = null;
  let verifierBuffer = null;
  let encryptedVerifier = null;

  try {
    saltBuffer =
      decodeCanonicalBase64(
        saltText,
        16
      );

    verifierBuffer =
      decodeCanonicalBase64(
        verifierText,
        32
      );

    if (
      !saltBuffer ||
      !verifierBuffer
    ) {
      throw new Error(
        'Formato da credencial offline é inválido.'
      );
    }

    if (
      !safeStorage
        .isEncryptionAvailable()
    ) {
      throw new Error(
        'safeStorage indisponível.'
      );
    }

    encryptedVerifier =
      safeStorage.encryptString(
        verifierText
      );

    if (
      !Buffer.isBuffer(
        encryptedVerifier
      ) ||
      encryptedVerifier.length < 1
    ) {
      throw new Error(
        'safeStorage não protegeu a credencial.'
      );
    }

    const stored =
      upsertOfflineOperatorCredential({
        empresaId,
        operadorId,
        nome,
        perfil,
        acessoTotal:
          perfil ===
            'ADMINISTRADOR' &&
          payload.acessoTotal !==
            false,
        ativo: true,
        credentialKdf:
          'PBKDF2_SHA256_V1_SAFE_STORAGE',
        credentialSalt:
          saltText,
        credentialVerifier:
          encryptedVerifier
            .toString(
              'base64'
            ),
        credentialParams: {
          iterations: 310000,
          hash: 'SHA-256',
          keyLength: 32,
          wrapper:
            'safeStorage'
        },
        credentialRevision:
          String(
            credential.revision ||
            credential.credentialRevision ||
            crypto.randomUUID()
          ).trim(),
        sourceUpdatedAt:
          new Date()
            .toISOString()
      });

    log(
      'OFFLINE CREDENTIAL EXPLICITLY PROVISIONED',
      {
        empresaId:
          stored.empresaId,
        operadorId:
          stored.operadorId,
        perfil:
          stored.perfil
      }
    );

    return stored;
  } finally {
    for (
      const buffer of
      [
        saltBuffer,
        verifierBuffer,
        encryptedVerifier
      ]
    ) {
      if (buffer) {
        try {
          buffer.fill(0);
        } catch (_) {}
      }
    }
  }
}

function clearPendingOfflineOperatorVerifierCandidate(
  candidate
) {
  const target =
    candidate &&
    typeof candidate === 'object'
      ? candidate
      : null;

  if (
    target &&
    Buffer.isBuffer(
      target.serverVerifierBuffer
    )
  ) {
    try {
      target.serverVerifierBuffer.fill(0);
    } catch (_) {}
  }

  if (
    target &&
    pendingOfflineOperatorVerifier ===
      target
  ) {
    pendingOfflineOperatorVerifier = null;
  }

  return true;
}

function storePendingOfflineOperatorVerifierCandidate(payload = {}) {
  if (!payload || typeof payload !== 'object') return false;

  const kdf = String(payload.kdf || '').trim().toUpperCase();

  const isScrypt =
    kdf === 'SCRYPT_V1';

  const isPbkdf2 =
    kdf === 'PBKDF2_SHA256_V1';

  if (!isScrypt && !isPbkdf2) {
    return false;
  }

  const params =
    payload.params &&
    typeof payload.params === 'object' &&
    !Array.isArray(payload.params)
      ? payload.params
      : {};

  if (Number(params.keyLength) !== 32) {
    return false;
  }

  if (
    isScrypt &&
    (
      Number(params.N) !== 32768 ||
      Number(params.r) !== 8 ||
      Number(params.p) !== 1
    )
  ) {
    return false;
  }

  if (
    isPbkdf2 &&
    (
      Number(params.iterations) !== 310000 ||
      String(params.hash || '').toUpperCase() !== 'SHA-256'
    )
  ) {
    return false;
  }

  const saltText = String(payload.salt || '').trim();
  const verifierText = String(payload.verifier || '').trim();
  if (!saltText || !verifierText) return false;

  let saltBuffer = null;
  let verifierBuffer = null;

  try {
    saltBuffer = Buffer.from(saltText, 'base64');
    verifierBuffer = Buffer.from(verifierText, 'base64');

    if (
      saltBuffer.length !== 16 ||
      verifierBuffer.length !== 32 ||
      saltBuffer.toString('base64') !== saltText ||
      verifierBuffer.toString('base64') !== verifierText
    ) {
      return false;
    }

    if (!safeStorage.isEncryptionAvailable()) {
      log('OFFLINE OPERATOR VERIFIER SKIPPED', {
        reason: 'SAFE_STORAGE_UNAVAILABLE'
      });
      return false;
    }

    const encryptedVerifier =
      safeStorage
        .encryptString(
          verifierBuffer.toString('base64')
        )
        .toString('base64');

    const storedKdf =
      isScrypt
        ? 'SCRYPT_V1_SAFE_STORAGE'
        : 'PBKDF2_SHA256_V1_SAFE_STORAGE';

    const storedParams =
      isScrypt
        ? {
            N: 32768,
            r: 8,
            p: 1,
            keyLength: 32,
            wrapper: 'safeStorage'
          }
        : {
            iterations: 310000,
            hash: 'SHA-256',
            keyLength: 32,
            wrapper: 'safeStorage'
          };

    if (pendingOfflineOperatorVerifier) {
      clearPendingOfflineOperatorVerifierCandidate(
        pendingOfflineOperatorVerifier
      );
    }

    pendingOfflineOperatorVerifier = {
      kdf:
        storedKdf,
      salt: saltText,
      verifier: encryptedVerifier,
      params:
        storedParams,
      credentialRevision:
        crypto.randomUUID(),
      serverVerifierBuffer:
        isPbkdf2
          ? Buffer.from(
              verifierBuffer
            )
          : null,
      capturedAt:
        Date.now()
    };

    log('OFFLINE OPERATOR VERIFIER CANDIDATE READY', {
      kdf:
        storedKdf,
      encrypted: true
    });

    return true;
  } catch (error) {
    log('OFFLINE OPERATOR VERIFIER CANDIDATE FAILED', {
      erro: String(error && error.message || error)
    });
    return false;
  } finally {
    if (saltBuffer) {
      try { saltBuffer.fill(0); } catch (_) {}
    }
    if (verifierBuffer) {
      try { verifierBuffer.fill(0); } catch (_) {}
    }
  }
}

async function captureOnlineOperatorIdentityForOfflineCache(options = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;

  const identityCaptureTimeoutMs =
    Number.isFinite(Number(options.timeoutMs))
      ? Math.max(100, Math.min(1500, Number(options.timeoutMs)))
      : 900;

  const preferredFrame =
    await findPdvContinuityFrame(
      mainWindow.webContents,
      300
    );
  const subtree =
    mainWindow.webContents &&
    mainWindow.webContents.mainFrame &&
    Array.isArray(
      mainWindow.webContents.mainFrame.framesInSubtree
    )
      ? mainWindow.webContents.mainFrame.framesInSubtree
      : [];
  const frames = [];
  if (preferredFrame) frames.push(preferredFrame);
  for (const frame of subtree) {
    if (
      frame &&
      frame !== mainWindow.webContents.mainFrame &&
      frame !== preferredFrame
    ) {
      frames.push(frame);
    }
  }

  if (!frames.length) return null;

  for (const frame of frames) {
    try {
    const captured = await frame.executeJavaScript(
      `new Promise((resolve) => {
        const requestId =
          'offline-credential-' +
          Date.now() + '-' +
          Math.random().toString(36).slice(2, 10);

        let finished = false;

        const finish = (value) => {
          if (finished) return;
          finished = true;
          try { window.removeEventListener('message', onMessage); } catch (_) {}
          try { window.clearTimeout(timer); } catch (_) {}
          resolve(value);
        };

        const normalize = (value) =>
          String(value == null ? '' : value)
            .normalize('NFD')
            .replace(/[\\u0300-\\u036f]/g, '')
            .replace(/[^A-Z]/gi, '')
            .toUpperCase();

        const onMessage = (event) => {
          const data =
            event &&
            event.data &&
            typeof event.data === 'object'
              ? event.data
              : null;

          if (!data || String(data.requestId || '') !== requestId) return;

          if (
            data.type !== 'SCF_OPERADOR_LOGADO_RESULTADO' ||
            data.success !== true
          ) {
            return;
          }

          const perfil = normalize(data.perfil);
          if (!['ADMINISTRADOR', 'SUPERVISOR', 'CAIXA'].includes(perfil)) { finish(null); return; }

          finish({
            empresaId:
              String(
                data.empresaId || ''
              ).trim(),
            operadorId: String(data.operadorId || '').trim(),
            operatorName: String(
              data.nomeOperador ||
              data.operadorNome ||
              ''
            ).trim(),
            perfil,
            acessoTotal:
              perfil === 'ADMINISTRADOR' &&
              data.acessoTotal === true
          });
        };

        window.addEventListener('message', onMessage);

        const timer = window.setTimeout(
          () => finish(null),
          ${identityCaptureTimeoutMs}
        );

        try {
          window.parent.postMessage(
            {
              type: 'SCF_OPERADOR_LOGADO_SOLICITAR',
              requestId,
              usuarioLogado: true
            },
            '*'
          );
        } catch (_) {
          finish(null);
        }
      })`,
      true
    );

    if (!captured || typeof captured !== 'object') continue;

    const operadorId =
      String(captured.operadorId || '').trim();
    const operatorName =
      String(captured.operatorName || '').trim();
    const perfil =
      String(captured.perfil || '').trim().toUpperCase();
    let empresaId =
      String(captured.empresaId || '').trim();

    if (!empresaId && operadorId && perfil) {
      empresaId =
        resolveUniquePreparedEmpresaIdForProvisionedOperator(
          operadorId,
          perfil
        );
    }

    if (
      !empresaId ||
      !operadorId ||
      !operatorName ||
      !['ADMINISTRADOR', 'SUPERVISOR', 'CAIXA'].includes(perfil)
    ) {
      continue;
    }

    return {
      empresaId,
      operadorId,
      operatorName,
      perfil,
      acessoTotal:
        perfil === 'ADMINISTRADOR' &&
        captured.acessoTotal === true
    };
    } catch (error) {
      log('OFFLINE OPERATOR IDENTITY CAPTURE FAILED', {
        erro: String(error && error.message || error)
      });
    }
  }

  return null;
}

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 async function persistPendingOfflineOperatorCredentialAfterOnlineLogin() {
  if (!pendingOfflineOperatorVerifier) {
    return {
      skipped: true,
      reason: 'NO_PENDING_VERIFIER'
    };
  }

  if (offlineOperatorCredentialPersistInFlight) {
    return offlineOperatorCredentialPersistInFlight;
  }

  const candidate =
    pendingOfflineOperatorVerifier;

  offlineOperatorCredentialPersistInFlight =
    (async () => {
      if (
        Date.now() - Number(candidate.capturedAt || 0) >
        OFFLINE_OPERATOR_CREDENTIAL_CANDIDATE_TTL_MS
      ) {
        clearPendingOfflineOperatorVerifierCandidate(
          candidate
        );
        return {
          skipped: true,
          reason: 'PENDING_VERIFIER_EXPIRED'
        };
      }

      const identity =
        await captureOnlineOperatorIdentityForOfflineCache({
          timeoutMs: 5000
        });

      if (!identity) {
        return {
          skipped: true,
          reason: 'ONLINE_OPERATOR_IDENTITY_NOT_READY'
        };
      }

      if (pendingOfflineOperatorVerifier !== candidate) {
        clearPendingOfflineOperatorVerifierCandidate(
          candidate
        );
        return {
          skipped: true,
          reason: 'NEWER_LOGIN_ATTEMPT_EXISTS'
        };
      }

      const empresaId =
        String(
          identity.empresaId || ''
        ).trim();

      if (!empresaId) {
        return {
          skipped: true,
          reason:
            'ONLINE_EMPRESA_NOT_READY'
        };
      }

      const stored =
        upsertOfflineOperatorCredential({
          empresaId,
          operadorId:
            identity.operadorId,
          nome:
            identity.operatorName,
          perfil:
            identity.perfil,
          acessoTotal:
            identity.acessoTotal === true,
          ativo:
            true,
          credentialKdf:
            candidate.kdf,
          credentialSalt:
            candidate.salt,
          credentialVerifier:
            candidate.verifier,
          credentialParams:
            candidate.params,
          credentialRevision:
            candidate.credentialRevision,
          sourceUpdatedAt:
            new Date().toISOString()
        });

      rememberConfirmedOnlineOperatorIdentity({
        empresaId: stored.empresaId,
        operadorId: stored.operadorId,
        operatorId: stored.operadorId,
        nomeOperador: stored.nome,
        operadorNome: stored.nome,
        operatorName: stored.nome,
        perfil: stored.perfil,
        acessoTotal: stored.acessoTotal === true
      });

      log('OFFLINE OPERATOR CREDENTIAL CACHED', {
        empresaId:
          stored.empresaId,
        operadorId:
          stored.operadorId,
        perfil:
          stored.perfil,
        acessoTotal:
          stored.acessoTotal === true
      });

      let centralPublished = false;

      try {
        const syncIdentity =
          offlineSyncIdentity &&
          typeof offlineSyncIdentity ===
            'object'
            ? offlineSyncIdentity
            : null;

        const deviceId =
          String(
            syncIdentity &&
            syncIdentity.deviceId ||
            ''
          ).trim();

        const deviceToken =
          String(
            syncIdentity &&
            syncIdentity.deviceToken ||
            ''
          ).trim();

        if (
          Buffer.isBuffer(
            candidate.serverVerifierBuffer
          ) &&
          candidate.serverVerifierBuffer.length ===
            32 &&
          deviceId &&
          deviceToken
        ) {
          const ack =
            await postAuthenticatedDeviceJson({
              endpoint:
                'https://api.e-fisco.app/sync/device/offline-credential/provision',
              deviceId,
              deviceToken,
              timeoutMs:
                15_000,
              payload: {
                empresaId:
                  stored.empresaId,
                operadorId:
                  stored.operadorId,
                nomeOperador:
                  stored.nome,
                perfil:
                  stored.perfil,
                credential: {
                  kdf:
                    'PBKDF2_SHA256_V1',
                  salt:
                    candidate.salt,
                  verifier:
                    candidate
                      .serverVerifierBuffer
                      .toString(
                        'base64'
                      ),
                  params: {
                    iterations:
                      310000,
                    hash:
                      'SHA-256',
                    keyLength:
                      32
                  },
                  revision:
                    candidate
                      .credentialRevision
                }
              }
            });

          centralPublished =
            Boolean(
              ack &&
              String(
                ack.status || ''
              )
                .trim()
                .toUpperCase() ===
                  'OK' &&
              ack.stored === true
            );
        }
      } catch (error) {
        log(
          'OFFLINE OPERATOR CREDENTIAL CENTRAL DEFERRED',
          {
            empresaId:
              stored.empresaId,
            operadorId:
              stored.operadorId,
            erro:
              String(
                error &&
                error.message ||
                error
              )
          }
        );
      } finally {
        clearPendingOfflineOperatorVerifierCandidate(
          candidate
        );
      }

      if (centralPublished) {
        log(
          'OFFLINE OPERATOR CREDENTIAL CENTRALIZED',
          {
            empresaId:
              stored.empresaId,
            operadorId:
              stored.operadorId,
            perfil:
              stored.perfil
          }
        );
      }

      return {
        cached: true,
        centralPublished,
        operadorId:
          stored.operadorId,
        perfil:
          stored.perfil
      };
    })()
      .finally(() => {
        offlineOperatorCredentialPersistInFlight = null;
      });

  return offlineOperatorCredentialPersistInFlight;
}

async function captureOnlineOperatorProfile(options = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;

  const frame = await findPdvContinuityFrame(
    mainWindow.webContents,
    Number.isFinite(Number(options.timeoutMs))
      ? Math.max(0, Number(options.timeoutMs))
      : 600
  );

  if (!frame) {
    if (options.silent !== true) {
      log('OFFLINE PROFILE ONLINE FRAME NOT FOUND');
    }
    return null;
  }

  try {
    const captured = await frame.executeJavaScript(
      '(() => {' +
        'const normalize=(value)=>String(value==null?"":value)' +
          '.normalize("NFD")' +
          '.replace(/[\\u0300-\\u036f]/g,"")' +
          '.replace(/[^A-Z]/gi,"")' +
          '.toUpperCase();' +
        'const perfil=normalize(window.__scfPerfilSessao);' +
        'const allowed=["ADMINISTRADOR","SUPERVISOR","CAIXA"];' +
        'if(!allowed.includes(perfil))return null;' +
        'const operatorName=String(' +
          'document.getElementById("scfPdvOperatorName")?.textContent||' +
          'window.nomeOperador||window.scfNomeOperador||""' +
        ').trim();' +
        'return {' +
          'perfil,' +
          'operatorName,' +
          'acessoTotal:' +
            'perfil==="ADMINISTRADOR"' +
              '?window.__scfAcessoSomentePdv!==true' +
              ':false' +
        '};' +
      '})()',
      true
    );

    if (!captured || typeof captured !== 'object') return null;

    const perfil =
      String(captured.perfil || '')
        .trim()
        .toUpperCase();

    if (
      perfil !== 'ADMINISTRADOR' &&
      perfil !== 'SUPERVISOR' &&
      perfil !== 'CAIXA'
    ) {
      return null;
    }

    return {
      perfil,
      operatorName:
        String(
          captured.operatorName ||
          ''
        ).trim(),
      acessoTotal:
        perfil === 'ADMINISTRADOR' &&
        captured.acessoTotal === true
    };
  } catch (error) {
    if (options.silent !== true) {
      log('OFFLINE PROFILE CAPTURE FAILED', {
        erro: String(error && error.message || error)
      });
    }
    return null;
  }
}

async function applyOfflineOperatorProfile(profile) {
  if (
    !profile ||
    typeof profile !== 'object' ||
    !offlineView ||
    !offlineViewReady
  ) {
    return false;
  }

  const perfil =
    String(profile.perfil || '')
      .trim()
      .toUpperCase();

  if (
    perfil !== 'ADMINISTRADOR' &&
    perfil !== 'SUPERVISOR' &&
    perfil !== 'CAIXA'
  ) {
    return false;
  }

  const frame = await findPdvContinuityFrame(
    offlineView.webContents,
    1500
  );

  if (!frame) {
    log('OFFLINE PROFILE LOCAL FRAME NOT FOUND');
    return false;
  }

  try {
    const operatorName =
      String(
        profile.operatorName ||
        profile.nomeOperador ||
        profile.operadorNome ||
        ''
      ).trim();

    const payload = {
      type: 'SCF_OPERADOR_LOGADO_RESULTADO',
      perfil,
      operadorId:
        String(
          profile.operadorId ||
          ''
        ).trim(),
      operatorName,
      nomeOperador:
        operatorName,
      operadorNome:
        operatorName,
      acessoTotal:
        perfil === 'ADMINISTRADOR' &&
        profile.acessoTotal === true
    };

    const payloadJson = JSON.stringify(payload);

    const applied = await frame.executeJavaScript(
      'new Promise((resolve) => {' +
        'const data=' + payloadJson + ';' +
        'window.postMessage(data,"*");' +
        'window.setTimeout(() => resolve({' +
          'perfil:String(window.__scfPerfilSessao||"")' +
            '.trim().toUpperCase(),' +
          'pendente:document.body.classList.contains(' +
            '"scf-perfil-acesso-pendente"' +
          ')' +
        '}),25);' +
      '})',
      true
    );

    const ok =
      applied &&
      String(applied.perfil || '')
        .trim()
        .toUpperCase() === perfil &&
      applied.pendente !== true;

    if (ok) {
      log('OFFLINE PROFILE APPLIED', {
        perfil,
        acessoTotal:
          payload.acessoTotal === true
      });
    } else {
      log('OFFLINE PROFILE APPLY DEFERRED', {
        perfil,
        pendente:
          applied &&
          applied.pendente === true
      });
    }

    return ok;
  } catch (error) {
    log('OFFLINE PROFILE APPLY FAILED', {
      erro: String(error && error.message || error)
    });
    return false;
  }
}

async function captureOnlineContinuityDraft(options = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const frame = await findPdvContinuityFrame(
    mainWindow.webContents,
    Number.isFinite(Number(options.timeoutMs))
      ? Math.max(0, Number(options.timeoutMs))
      : 1500
  );
  if (!frame) {
    if (options.silent !== true) {
      log('OFFLINE CONTINUITY ONLINE FRAME NOT FOUND');
    }
    return null;
  }

  try {
    const encoded = await frame.executeJavaScript(`
      (() => {
        const scfContinuityMoney = (value) => {
          let raw = String(value == null ? '' : value)
            .replace(/R[$]/gi, '')
            .replace(/[^0-9,.-]/g, '');
          if (!raw) return 0;
          if (raw.includes(',')) {
            raw = raw.split('.').join('').replace(',', '.');
          }
          const result = Number(raw);
          return Number.isFinite(result) ? result : 0;
        };

        const capturePaymentContinuity = () => {
          const panel =
            document.getElementById('fiscalFinalizeSalePhotoPanel');
          if (!panel) return null;

          const buttons = Array.from(
            panel.querySelectorAll('.finalize-payment-method-btn')
          );
          const selectedButton =
            panel.querySelector(
              '.finalize-payment-method-btn.is-selected, .finalize-payment-method-btn.scf-payment-keyboard-focus'
            );
          const methodStage =
            document.getElementById('fiscalFinalizeMethodStage');
          const cashStage =
            document.getElementById('fiscalFinalizeCashStage');
          const methodTitle =
            document.getElementById('fiscalFinalizeMethodTitle');

          const titleMethod = String(
            methodTitle && methodTitle.textContent || ''
          )
            .replace('PAGAMENTO EM ', '')
            .trim()
            .toUpperCase();

          const selectedMethod = String(
            selectedButton &&
            selectedButton.getAttribute('data-payment-method') ||
            titleMethod ||
            ''
          ).trim().toUpperCase();

          const paymentParts = buttons
            .map((button) => {
              const method = String(
                button.getAttribute('data-payment-method') || ''
              ).trim().toUpperCase();
              const amountNode =
                button.querySelector('.finalize-payment-method-value');
              const amount = scfContinuityMoney(
                amountNode && amountNode.textContent || ''
              );
              return { method, amount };
            })
            .filter((part) => part.method && part.amount >= 0.005);

          return {
            selectedMethod,
            editingMethod:
              methodStage && methodStage.hidden === false
                ? (titleMethod || selectedMethod)
                : '',
            flowMode:
              methodStage && methodStage.hidden === false
                ? 'METHOD'
                : cashStage && cashStage.hidden === false
                  ? 'CASH'
                  : 'OVERVIEW',
            methodAmount: scfContinuityMoney(
              document.getElementById('fiscalFinalizeMethodAmount')?.value
            ),
            cashReceived: scfContinuityMoney(
              document.getElementById('fiscalFinalizeCashReceived')?.value
            ),
            paymentParts
          };
        };

        if (typeof window.__scfPdvExportContinuityDraft === 'function') {
          const nativeDraft =
            window.__scfPdvExportContinuityDraft() || null;

          if (nativeDraft && typeof nativeDraft === 'object') {
            nativeDraft.paymentContinuity =
              capturePaymentContinuity();
            nativeDraft.browserOnline =
              navigator.onLine !== false;
            nativeDraft.operatorName = String(
              document.getElementById('scfPdvOperatorName')?.textContent ||
              window.nomeOperador ||
              window.scfNomeOperador ||
              ''
            ).trim();
          }

          return JSON.stringify({
            mode: 'native',
            draft: nativeDraft
          });
        }

        const text = (value) => String(value == null ? '' : value).trim();
        const numberPtBr = (value) => {
          let raw = text(value).replace(/R\\$/gi, '').replace(/\\s/g, '').replace(/[^0-9,.-]/g, '');
          if (!raw) return 0;
          if (raw.includes(',')) raw = raw.replace(/\\./g, '').replace(',', '.');
          const result = Number(raw);
          return Number.isFinite(result) ? result : 0;
        };
        const valueOf = (id) => {
          const element = document.getElementById(id);
          return element ? text('value' in element ? element.value : element.textContent) : '';
        };

        const list = document.getElementById('fiscalProductsList');
        if (!list) return JSON.stringify({ mode: 'dom', draft: null });

        const products = Array.from(
          list.querySelectorAll(':scope > .fiscal-danfe-item-wrap:not(.is-preview)')
        ).map((wrap, index) => {
          const name = text(wrap.querySelector('.fiscal-desktop-danfe-cell.descricao')?.textContent);
          const quantity = numberPtBr(wrap.querySelector('.fiscal-desktop-danfe-cell.qtd')?.textContent);
          const unit = text(wrap.querySelector('.fiscal-desktop-danfe-cell.un')?.textContent).toUpperCase();
          const unitValue = numberPtBr(wrap.querySelector('.fiscal-desktop-danfe-cell.vl-unit')?.textContent);
          return {
            name,
            quantity,
            unit,
            unitValue,
            total: quantity * unitValue,
            itemNumber: index + 1,
            cancelled: wrap.classList.contains('is-cancelled')
          };
        }).filter((item) => item.name && item.quantity > 0);

        const currentName = valueOf('productName');
        const currentQuantity = numberPtBr(valueOf('productQuantity'));
        const currentUnitValue = numberPtBr(valueOf('productUnitValue'));
        const currentProduct = currentName || valueOf('productBarcode') || valueOf('productCode')
          ? {
              name: currentName,
              quantity: currentQuantity > 0 ? currentQuantity : 1,
              unit: valueOf('productUnit').toUpperCase(),
              unitValue: currentUnitValue,
              total: (currentQuantity > 0 ? currentQuantity : 1) * currentUnitValue,
              productFiscalId: valueOf('productFiscalId'),
              productCode: valueOf('productCode'),
              gtin: valueOf('productGtin'),
              barcode: valueOf('productBarcode'),
              ncm: valueOf('ncmCode') || valueOf('ncmSearch'),
              cfop: valueOf('cfopCode') || valueOf('cfopSearch')
            }
          : null;

        const active = products.filter((item) => item.cancelled !== true);
        const totalValue = active.reduce((sum, item) => sum + Number(item.total || 0), 0);
        const paymentStageKind =
          document.body && document.body.classList.contains('sale-validation-waiting-open')
            ? 'VALIDATION'
            : document.body && document.body.classList.contains('cpf-fiscal-card-open')
              ? 'CPF'
              : document.body && document.body.classList.contains('finalize-support-card-open')
                ? 'FINALIZE'
                : '';
        const paymentStageOpen = Boolean(paymentStageKind);
        let saleId = '';
        if (paymentStageOpen) {
          try {
            const lastSale = JSON.parse(
              localStorage.getItem('scfLastFinalizedSale') || '{}'
            );
            if (lastSale && typeof lastSale === 'object') {
              saleId = text(lastSale.saleId);
            }
          } catch (_) {}
        }

        return JSON.stringify({
          mode: 'dom',
          draft: {
            version: 1,
            saleNumber: valueOf('saleNumber'),
            saleId,
            products,
            currentProduct,
            totalValue,
            activeProducts: active.length,
            paymentStageOpen,
            paymentStageKind,
            paymentContinuity:
              capturePaymentContinuity(),
            browserOnline:
              navigator.onLine !== false,
            operatorName: text(
              document.getElementById('scfPdvOperatorName')?.textContent ||
              window.nomeOperador ||
              window.scfNomeOperador ||
              ''
            ),
            capturedAt: new Date().toISOString()
          }
        });
      })()
    `, true);

    if (!encoded) return null;
    const envelope = JSON.parse(encoded);
    const draft = envelope && envelope.draft && typeof envelope.draft === 'object'
      ? envelope.draft
      : null;
    const enriched = enrichContinuityDraftWithOfflineReferences(draft);

    if (
      options.silent !== true &&
      envelope &&
      envelope.mode === 'dom'
    ) {
      log('OFFLINE CONTINUITY DOM FALLBACK ACTIVE', {
        products: enriched && Array.isArray(enriched.products) ? enriched.products.length : 0
      });
    }

    return enriched;
  } catch (error) {
    if (options.silent !== true) {
      log('OFFLINE CONTINUITY SNAPSHOT FAILED', error);
    }
    return null;
  }
}

async function mirrorOnlineContinuityDraft() {
  if (
    offlineContinuityMirrorBusy ||
    offlineUiMode !== 'ONLINE' ||
    !mainWindow ||
    mainWindow.isDestroyed() ||
    versaoAtualizacaoPendente
  ) {
    return false;
  }

  offlineContinuityMirrorBusy = true;
  try {
    if (pendingOfflineOperatorVerifier) {
      void persistPendingOfflineOperatorCredentialAfterOnlineLogin()
        .catch((error) => {
          log('OFFLINE OPERATOR CREDENTIAL CACHE RETRY FAILED', {
            erro: String(error && error.message || error)
          });
        });
    }

    const snapshot = await captureOnlineContinuityDraft({
      silent: true,
      timeoutMs: 120
    });
    if (!snapshot || typeof snapshot !== 'object') return false;

    offlineContinuityDraft = snapshot;

    if (snapshot.browserOnline !== false) {
      try {
        await refreshConfirmedOnlineOperatorIdentityFromLivePage({
          browserOnline: true
        });
      } catch (error) {
        log('ONLINE OPERATOR SESSION CACHE REFRESH DEFERRED', {
          erro: String(error && error.message || error)
        });
      }
    }

    if (
      snapshot.browserOnline === false &&
      offlineViewReady &&
      offlineAuthorizationState !== 'INVALID' &&
      offlineUiMode === 'ONLINE' &&
      !onlineNetworkFailoverInFlight
    ) {
      onlineNetworkFailoverInFlight = true;
      lastMainFrameFailureAt = Date.now();

      log('ONLINE NAVIGATOR OFFLINE DETECTED');

      void switchToOfflineUi('navigator-offline')
        .catch((error) => {
          log('OFFLINE FAILOVER AFTER NAVIGATOR OFFLINE BLOCKED', error);
        })
        .finally(() => {
          onlineNetworkFailoverInFlight = false;
        });
    }

    return true;
  } finally {
    offlineContinuityMirrorBusy = false;
  }
}

function startContinuityMirror() {
  if (timerOfflineContinuityMirror) return;

  timerOfflineContinuityMirror = setInterval(() => {
    void mirrorOnlineContinuityDraft().catch(() => {});
  }, OFFLINE_CONTINUITY_MIRROR_MS);

  if (
    timerOfflineContinuityMirror &&
    typeof timerOfflineContinuityMirror.unref === 'function'
  ) {
    timerOfflineContinuityMirror.unref();
  }

  setTimeout(() => {
    void mirrorOnlineContinuityDraft().catch(() => {});
  }, 100);
}

function stopContinuityMirror() {
  if (!timerOfflineContinuityMirror) return;
  clearInterval(timerOfflineContinuityMirror);
  timerOfflineContinuityMirror = null;
}

async function restoreOfflineContinuityDraft(draft) {
  if (!offlineView || !offlineViewReady) return false;
  const frame = await findPdvContinuityFrame(offlineView.webContents, 5000);
  if (!frame) {
    log('OFFLINE CONTINUITY LOCAL FRAME NOT FOUND');
    return false;
  }

  try {
    const payload = draft && typeof draft === 'object' ? draft : {};
    await frame.executeJavaScript(`
      (() => {
        window.__scfPdvRestoreContinuityDraft(${JSON.stringify(payload)});
        return true;
      })()
    `, true);
    return true;
  } catch (error) {
    log('OFFLINE CONTINUITY RESTORE FAILED', error);
    return false;
  }
}

async function refreshOfflineNfceNumberDisplay() {
  if (
    !offlineView ||
    !offlineViewReady ||
    !offlineView.webContents ||
    offlineView.webContents.isDestroyed()
  ) {
    return false;
  }

  const frame = await findPdvContinuityFrame(
    offlineView.webContents,
    1500
  );

  if (!frame) {
    log('OFFLINE NFCE NUMBER REFRESH DEFERRED', {
      reason: 'PDV_FRAME_NOT_FOUND'
    });
    return false;
  }

  try {
    const requested = await frame.executeJavaScript(`
      (() => {
        if (!window.parent || window.parent === window) {
          return false;
        }

        window.parent.postMessage({
          type: 'SCF_NFCE_NUMERACAO_SOLICITAR'
        }, '*');

        return true;
      })()
    `, true);

    if (requested === true) {
      log('OFFLINE NFCE NUMBER REFRESH REQUESTED');
      return true;
    }

    log('OFFLINE NFCE NUMBER REFRESH DEFERRED', {
      reason: 'REQUEST_NOT_DELIVERED'
    });
    return false;
  } catch (error) {
    log('OFFLINE NFCE NUMBER REFRESH FAILED', {
      erro: String(error && error.message || error)
    });
    return false;
  }
}

async function offlineHasActiveContinuitySale() {
  if (!offlineView || !offlineViewReady) return false;
  const frame = await findPdvContinuityFrame(offlineView.webContents, 500);
  if (!frame) return false;

  try {
    return await frame.executeJavaScript(`
      (() => window.__scfPdvHasActiveContinuitySale() === true)()
    `, true) === true;
  } catch (_) {
    return false;
  }
}

async function primeOnlineNfceNumberDisplay(proximoNumero) {
  const number = Number(proximoNumero);
  if (!Number.isSafeInteger(number) || number < 1) return false;
  if (!mainWindow || mainWindow.isDestroyed()) return false;

  const frame = await findPdvContinuityFrame(
    mainWindow.webContents,
    1500
  );

  if (!frame) {
    log('ONLINE NFCE NUMBER PRIME DEFERRED', {
      reason: 'PDV_FRAME_NOT_FOUND'
    });
    return false;
  }

  try {
    const primed = await frame.executeJavaScript(`
      (() => {
        const number = ${number};
        if (
          typeof window.scfAtualizarProximoNumeroNfce !== 'function'
        ) {
          return false;
        }
        return window.scfAtualizarProximoNumeroNfce(number) === true;
      })()
    `, true);

    if (primed === true) {
      log('ONLINE NFCE NUMBER PRIMED', {
        proximoNumero: number
      });
      return true;
    }

    log('ONLINE NFCE NUMBER PRIME DEFERRED', {
      reason: 'UPDATE_FUNCTION_UNAVAILABLE',
      proximoNumero: number
    });
    return false;
  } catch (error) {
    log('ONLINE NFCE NUMBER PRIME FAILED', {
      erro: String(error && error.message || error),
      proximoNumero: number
    });
    return false;
  }
}

async function normalizeOnlinePdvUnitValueHeader() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;

  const frame = await findPdvContinuityFrame(
    mainWindow.webContents,
    1500
  );

  if (!frame) {
    log('ONLINE PDV HEADER NORMALIZE DEFERRED', {
      reason: 'PDV_FRAME_NOT_FOUND'
    });
    return false;
  }

  try {
    const normalized = await frame.executeJavaScript(`
      (() => {
        const normalizeHeader = () => {
          let changed = 0;

          document
            .querySelectorAll(
              '#scfPdvUnifiedHeader [role="columnheader"], #scfPdvUnifiedHeader span'
            )
            .forEach((node) => {
              const text = String(
                node.textContent || ''
              ).trim().toUpperCase();

              if (
                text === 'VALOR UNIT.' ||
                text === 'VL UNIT.'
              ) {
                node.textContent = 'VALOR UN.';
                changed += 1;
              }
            });

          return changed;
        };

        normalizeHeader();

        if (!window.__scfOnlineValorUnHeaderObserver) {
          const observer = new MutationObserver(() => {
            normalizeHeader();
          });

          observer.observe(
            document.body,
            {
              childList: true,
              subtree: true,
              characterData: true
            }
          );

          window.__scfOnlineValorUnHeaderObserver = observer;
        }

        return true;
      })()
    `, true);

    if (normalized === true) {
      log('ONLINE PDV HEADER NORMALIZED');
      return true;
    }

    return false;
  } catch (error) {
    log('ONLINE PDV HEADER NORMALIZE FAILED', {
      erro: String(error && error.message || error)
    });
    return false;
  }
}

async function refreshOnlineNfceNumberDisplay() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;

  const frame = await findPdvContinuityFrame(
    mainWindow.webContents,
    1500
  );

  if (!frame) {
    log('ONLINE NFCE NUMBER REFRESH DEFERRED', {
      reason: 'PDV_FRAME_NOT_FOUND'
    });
    return false;
  }

  try {
    const requested = await frame.executeJavaScript(`
      (() => {
        if (!window.parent || window.parent === window) {
          return false;
        }

        if (
          !window.__scfOnlineNfceNumberResponseDiagnosticInstalled
        ) {
          window.__scfOnlineNfceNumberResponseDiagnosticInstalled =
            true;

          window.addEventListener(
            'message',
            (event) => {
              const data =
                event &&
                event.data &&
                typeof event.data === 'object'
                  ? event.data
                  : null;

              if (
                event.source !== window.parent ||
                !data ||
                data.type !==
                  'SCF_NFCE_NUMERACAO_RESULTADO'
              ) {
                return;
              }

              const number =
                Number(
                  data.proximoNumeroNfceProducao
                );

              console.log(
                '__EFISCO_ONLINE_NFCE_NUMBER_RESPONSE_V1__' +
                (
                  Number.isSafeInteger(number) &&
                  number > 0
                    ? String(number)
                    : ''
                )
              );
            },
            false
          );
        }

        window.parent.postMessage({
          type: 'SCF_NFCE_NUMERACAO_SOLICITAR'
        }, '*');

        return true;
      })()
    `, true);

    if (requested === true) {
      log('ONLINE NFCE NUMBER REFRESH REQUESTED');
      return true;
    }

    log('ONLINE NFCE NUMBER REFRESH DEFERRED', {
      reason: 'REQUEST_NOT_DELIVERED'
    });
    return false;
  } catch (error) {
    log('ONLINE NFCE NUMBER REFRESH FAILED', {
      erro: String(error && error.message || error)
    });
    return false;
  }
}

async function queryOnlineNfceNumberForRecovery(timeoutMs = 6000) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return {
      ok: false,
      reason: 'MAIN_WINDOW_UNAVAILABLE',
      proximoNumero: null
    };
  }

  const frame = await findPdvContinuityFrame(
    mainWindow.webContents,
    1500
  );

  if (!frame) {
    return {
      ok: false,
      reason: 'PDV_FRAME_NOT_FOUND',
      proximoNumero: null
    };
  }

  const waitMs = Math.max(
    1000,
    Math.min(15000, Number(timeoutMs) || 6000)
  );

  try {
    const result = await frame.executeJavaScript(`
      (() => new Promise((resolve) => {
        if (!window.parent || window.parent === window) {
          resolve({
            ok: false,
            reason: 'PARENT_UNAVAILABLE',
            proximoNumero: null
          });
          return;
        }

        let settled = false;
        let timer = null;

        const finish = (value) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          window.removeEventListener('message', onMessage, false);
          resolve(value);
        };

        const onMessage = (event) => {
          const data =
            event &&
            event.data &&
            typeof event.data === 'object'
              ? event.data
              : null;

          if (event.source !== window.parent || !data) return;

          if (data.type === 'SCF_NFCE_NUMERACAO_RESULTADO') {
            const number = Number(
              data.proximoNumeroNfceProducao
            );

            finish({
              ok:
                Number.isSafeInteger(number) &&
                number > 0,
              reason:
                Number.isSafeInteger(number) &&
                number > 0
                  ? 'OK'
                  : 'INVALID_REMOTE_NUMBER',
              proximoNumero:
                Number.isSafeInteger(number) &&
                number > 0
                  ? number
                  : null
            });
            return;
          }

          if (data.type === 'SCF_NFCE_NUMERACAO_ERRO') {
            finish({
              ok: false,
              reason: 'REMOTE_ERROR',
              proximoNumero: null
            });
          }
        };

        window.addEventListener(
          'message',
          onMessage,
          false
        );

        timer = setTimeout(
          () => finish({
            ok: false,
            reason: 'TIMEOUT',
            proximoNumero: null
          }),
          ${waitMs}
        );

        window.parent.postMessage({
          type: 'SCF_NFCE_NUMERACAO_SOLICITAR'
        }, '*');
      }))()
    `, true);

    const number = Number(
      result && result.proximoNumero
    );

    return {
      ok:
        result &&
        result.ok === true &&
        Number.isSafeInteger(number) &&
        number > 0,
      reason:
        result && result.reason
          ? String(result.reason)
          : 'INVALID_RESPONSE',
      proximoNumero:
        Number.isSafeInteger(number) &&
        number > 0
          ? number
          : null
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'QUERY_FAILED',
      proximoNumero: null,
      erro: String(
        error && error.message || error
      )
    };
  }
}

async function clearOnlineContinuityDraft() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const frame = await findPdvContinuityFrame(mainWindow.webContents, 800);
  if (!frame) return false;

  try {
    const result = await frame.executeJavaScript(`
      (() => {
        const emptyDraft = {
          version: 1,
          saleNumber: '',
          products: [],
          currentProduct: null,
          totalValue: 0,
          activeProducts: 0,
          paymentStageOpen: false
        };

        if (typeof window.__scfPdvRestoreContinuityDraft === 'function') {
          window.__scfPdvRestoreContinuityDraft(emptyDraft);
          return 'RESTORED';
        }

        if (typeof window.scfCancelCurrentSaleFromKeyboard === 'function') {
          window.scfCancelCurrentSaleFromKeyboard({ continuityRecovery: true });
          return 'CANCELLED';
        }

        const list = document.getElementById('fiscalProductsList');
        const activeRows = list
          ? list.querySelectorAll(':scope > .fiscal-danfe-item-wrap:not(.is-preview):not(.is-cancelled)').length
          : 0;
        const currentHasValue = Boolean(
          String(document.getElementById('productName')?.value || '').trim() ||
          String(document.getElementById('productBarcode')?.value || '').trim() ||
          String(document.getElementById('productCode')?.value || '').trim()
        );

        return activeRows === 0 && !currentHasValue
          ? 'ALREADY_EMPTY'
          : 'UNSUPPORTED';
      })()
    `, true);

    if (result === 'CANCELLED') {
      log('OFFLINE CONTINUITY ONLINE CLEAR FALLBACK');
    }

    return result === 'RESTORED' || result === 'CANCELLED' || result === 'ALREADY_EMPTY';
  } catch (error) {
    log('OFFLINE CONTINUITY ONLINE CLEAR FAILED', error);
    return false;
  }
}

async function ensureOfflineView() {
  if (
    offlineView &&
    offlineView.webContents &&
    !offlineView.webContents.isDestroyed() &&
    offlineViewReady
  ) {
    return offlineView;
  }

  if (!offlineUiServer) {
    throw new Error('Servidor local offline ainda não está disponível.');
  }

  if (offlineView && offlineView.webContents && !offlineView.webContents.isDestroyed()) {
    try { offlineView.webContents.close(); } catch (_) {}
  }

  offlineViewReady = false;
  offlineViewAttached = false;
  offlineView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false
    }
  });

  offlineView.setBackgroundColor('#00000000');
  offlineView.webContents.setUserAgent(chromeUserAgent());

  if (
    typeof offlineView.webContents.setBackgroundThrottling ===
      'function'
  ) {
    try {
      offlineView.webContents.setBackgroundThrottling(false);
    } catch (_) {}
  }

  instalarCanalDiretoDoFrame(offlineView.webContents);

  offlineView.webContents.setWindowOpenHandler(
    (details) => {
      const windowOpen =
        classifyRendererWindowOpen({
          source: 'offlineView',
          url:
            details &&
            details.url
              ? details.url
              : ''
        });

      logBlockedRendererWindowOpen({
        source: 'offlineView',
        windowOpen
      });

      return {
        action: 'deny'
      };
    }
  );

  offlineView.webContents.on(
    'will-navigate',
    (event, url) => {
      if (
        !resolveNavigationEventIsMainFrame(
          event,
          true
        )
      ) {
        return;
      }

      const navigationUrl =
        resolveNavigationEventUrl(event, url);

      const navigation =
        classifyOfflineViewNavigation(
          navigationUrl
        );

      if (navigation.decision === 'ALLOW') {
        return;
      }

      event.preventDefault();

      logBlockedOfflineViewNavigation({
        eventType: 'will-navigate',
        navigation,
        isMainFrame: true
      });
    }
  );

  offlineView.webContents.on(
    'will-redirect',
    (
      event,
      url,
      _isInPlace,
      isMainFrame
    ) => {
      if (
        !resolveNavigationEventIsMainFrame(
          event,
          isMainFrame
        )
      ) {
        return;
      }

      const redirectUrl =
        resolveNavigationEventUrl(event, url);

      const navigation =
        classifyOfflineViewNavigation(
          redirectUrl
        );

      if (navigation.decision === 'ALLOW') {
        return;
      }

      event.preventDefault();

      logBlockedOfflineViewNavigation({
        eventType: 'will-redirect',
        navigation,
        isMainFrame: true
      });
    }
  );

  offlineView.webContents.on('context-menu', (event) => event.preventDefault());
  offlineView.webContents.on('before-input-event', (event, input) => {
    const key = String(input && input.key || '').toUpperCase();
    const ctrlShift = Boolean(input && input.control && input.shift);
    if (
      key === 'F12' ||
      (ctrlShift && ['I', 'J', 'C'].includes(key)) ||
      (input && input.control && key === 'U')
    ) {
      event.preventDefault();
    }
  });

  await offlineView.webContents.loadURL(offlineUiServer.shellUrl, {
    userAgent: chromeUserAgent()
  });

  offlineViewReady = true;

  // Mantém a view já composta, porém estacionada fora da área visível.
  // O failover passa a exigir apenas reposicionamento, evitando flash de attach.
  if (
    mainWindow &&
    !mainWindow.isDestroyed() &&
    !offlineViewAttached
  ) {
    mainWindow.contentView.addChildView(offlineView);
    offlineViewAttached = true;
  }
  offlineView.setBounds(offlineParkedBounds());

  log('OFFLINE VIEW PRELOADED', { origin: offlineUiServer.origin });
  return offlineView;
}

function showOfflineOverlay() {
  if (!mainWindow || mainWindow.isDestroyed() || !offlineView || !offlineViewReady) {
    return false;
  }

  try {
    if (!offlineViewAttached) {
      mainWindow.contentView.addChildView(offlineView);
      offlineViewAttached = true;
    }
    resizeOfflineOverlay();
    offlineView.webContents.focus();
    return true;
  } catch (error) {
    log('OFFLINE OVERLAY SHOW FAILED', error);
    return false;
  }
}

function hideOfflineOverlay() {
  if (!mainWindow || mainWindow.isDestroyed() || !offlineView) return false;
  try {
    // Não remove a view: apenas estaciona fora da área visível.
    // Isso preserva o renderer quente para a próxima contingência.
    if (offlineViewAttached) {
      offlineView.setBounds(offlineParkedBounds());
    }
    mainWindow.webContents.focus();
    return true;
  } catch (error) {
    log('OFFLINE OVERLAY HIDE FAILED', error);
    return false;
  }
}

function dispatchOfflineFunctionShortcut(key) {
  const normalizedKey = String(key || '').toUpperCase();

  if (
    (normalizedKey !== 'F4' && normalizedKey !== 'F5') ||
    offlineUiMode !== 'OFFLINE' ||
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !mainWindow.isFocused() ||
    !offlineView ||
    !offlineView.webContents ||
    offlineView.webContents.isDestroyed()
  ) {
    return false;
  }

  try {
    offlineView.webContents.focus();

    const expression = `
      (() => {
        const iframe = document.getElementById('scfOfflinePdv');
        if (!iframe || !iframe.contentWindow || !iframe.contentDocument) {
          return false;
        }

        const pdvWindow = iframe.contentWindow;
        const pdvDocument = iframe.contentDocument;
        const target =
          (
            pdvDocument.activeElement &&
            pdvDocument.activeElement !== pdvDocument.body
          )
            ? pdvDocument.activeElement
            : (
                pdvDocument.getElementById('productBarcode') ||
                pdvDocument.body ||
                pdvDocument
              );

        if (!target || typeof target.dispatchEvent !== 'function') {
          return false;
        }

        try {
          if (typeof target.focus === 'function') {
            target.focus({ preventScroll: true });
          }
        } catch (_) {
          try {
            if (typeof target.focus === 'function') target.focus();
          } catch (_) {}
        }

        const event = new pdvWindow.KeyboardEvent('keydown', {
          key: '${normalizedKey}',
          code: '${normalizedKey}',
          bubbles: true,
          cancelable: true
        });

        target.dispatchEvent(event);
        return true;
      })()
    `;

    void offlineView.webContents
      .executeJavaScript(expression, true)
      .then((forwarded) => {
        if (forwarded !== true) {
          log('OFFLINE FUNCTION KEY FORWARD NOT DELIVERED', {
            key: normalizedKey
          });
        }
      })
      .catch((error) => {
        log('OFFLINE FUNCTION KEY FORWARD FAILED', {
          key: normalizedKey,
          erro: String(error && error.message || error)
        });
      });

    return true;
  } catch (error) {
    log('OFFLINE FUNCTION KEY FORWARD FAILED', {
      key: normalizedKey,
      erro: String(error && error.message || error)
    });
    return false;
  }
}

function unregisterOfflineFunctionShortcuts() {
  for (const key of ['F4', 'F5']) {
    try {
      if (globalShortcut.isRegistered(key)) {
        globalShortcut.unregister(key);
      }
    } catch (_) {}
  }

  offlineFunctionShortcutsRegistered = false;
}

function registerOfflineFunctionShortcuts() {
  if (
    offlineFunctionShortcutsRegistered ||
    offlineUiMode !== 'OFFLINE' ||
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !mainWindow.isFocused()
  ) {
    return offlineFunctionShortcutsRegistered;
  }

  const registered = [];

  try {
    for (const key of ['F4', 'F5']) {
      const ok = globalShortcut.register(key, () => {
        if (
          offlineUiMode !== 'OFFLINE' ||
          !mainWindow ||
          mainWindow.isDestroyed() ||
          !mainWindow.isFocused()
        ) {
          return;
        }

        dispatchOfflineFunctionShortcut(key);
      });

      if (!ok) {
        throw new Error(`Não foi possível registrar ${key}.`);
      }

      registered.push(key);
    }

    offlineFunctionShortcutsRegistered = true;
    log('OFFLINE FUNCTION KEYS REGISTERED', {
      keys: registered
    });
    return true;
  } catch (error) {
    unregisterOfflineFunctionShortcuts();
    log('OFFLINE FUNCTION KEYS REGISTER FAILED', error);
    return false;
  }
}

function syncOfflineFunctionShortcuts() {
  if (
    offlineUiMode === 'OFFLINE' &&
    offlineAuthenticatedOperator &&
    mainWindow &&
    !mainWindow.isDestroyed() &&
    mainWindow.isFocused()
  ) {
    return registerOfflineFunctionShortcuts();
  }

  unregisterOfflineFunctionShortcuts();
  return false;
}

async function switchToOfflineUi(reason) {
  if (
    !offlineUiServer ||
    !mainWindow ||
    mainWindow.isDestroyed() ||
    offlineUiMode === 'OFFLINE' ||
    offlineUiMode === 'SWITCHING_OFFLINE'
  ) return false;

  assertOfflineMutationAuthorized();
  offlineUiMode = 'SWITCHING_OFFLINE';
  log('OFFLINE FAILOVER START', { reason: String(reason || 'connectivity') });

  try {
    await ensureOfflineView();

    if (
      offlineView &&
      offlineViewReady &&
      offlineViewAttached
    ) {
      offlineView.setBounds(
        offlineStagingBounds()
      );
    }

    offlineFailoverOnlineOperatorIdentity = null;

    /*
     * 1.0.41: a sessão do operador é mantida em cache enquanto o ONLINE
     * está saudável. Quando a rede some, usamos primeiro esse cache recente,
     * sem depender do iframe remoto no exato momento da queda.
     */
    const freshDraft = await captureOnlineContinuityDraft({ silent: true });
    if (freshDraft && typeof freshDraft === 'object') {
      offlineContinuityDraft = freshDraft;
    }

    let onlineSessionIdentity =
      recentConfirmedOnlineOperatorIdentity();
    let onlineSessionIdentitySource =
      onlineSessionIdentity
        ? 'RECENT_ONLINE_CACHE'
        : 'NONE';

    if (!onlineSessionIdentity) {
      const liveIdentity =
        await captureOnlineOperatorIdentityForOfflineCache({
          timeoutMs: 700
        });

      if (liveIdentity) {
        onlineSessionIdentity =
          rememberConfirmedOnlineOperatorIdentity(
            liveIdentity
          );
        onlineSessionIdentitySource =
          onlineSessionIdentity
            ? 'LIVE'
            : 'NONE';
      }
    }

    if (!onlineSessionIdentity) {
      const operatorProfile =
        await captureOnlineOperatorProfile({
          silent: true,
          timeoutMs: 350
        });

      onlineSessionIdentity =
        operatorProfile
          ? resolveOfflineOperatorProfileForSession(
              operatorProfile
            )
          : null;

      if (onlineSessionIdentity) {
        onlineSessionIdentity =
          rememberConfirmedOnlineOperatorIdentity(
            onlineSessionIdentity
          );
        onlineSessionIdentitySource =
          onlineSessionIdentity
            ? 'LIVE_PROFILE'
            : 'NONE';
      }
    }

    const preservedSessionCandidate =
      onlineSessionIdentity
        ? normalizeOfflineAuthenticatedOperator(
            onlineSessionIdentity
          )
        : null;

    offlineFailoverOnlineOperatorIdentity =
      preservedSessionCandidate
        ? {
            empresaId:
              String(
                preservedSessionCandidate.empresaId || ''
              ).trim(),
            operadorId:
              String(
                preservedSessionCandidate.operadorId || ''
              ).trim(),
            perfil:
              String(
                preservedSessionCandidate.perfil || ''
              )
                .trim()
                .toUpperCase()
          }
        : null;

    if (offlineFailoverOnlineOperatorIdentity) {
      log('OFFLINE ONLINE SESSION IDENTITY CACHED', {
        source:
          onlineSessionIdentitySource,
        empresaId:
          offlineFailoverOnlineOperatorIdentity.empresaId,
        operadorId:
          offlineFailoverOnlineOperatorIdentity.operadorId,
        perfil:
          offlineFailoverOnlineOperatorIdentity.perfil
      });
    }

    let sessionPreserved = false;

    if (preservedSessionCandidate) {
      const profileApplied =
        await applyOfflineOperatorProfile(
          preservedSessionCandidate
        );

      if (profileApplied) {
        const preservedSession =
          setOfflineAuthenticatedOperator(
            preservedSessionCandidate
          );

        if (preservedSession) {
          await setOfflineShellAuthenticationState(
            preservedSession
          );

          sessionPreserved = true;

          log('OFFLINE FAILOVER SESSION PRESERVED', {
            empresaId:
              preservedSession.empresaId,
            operadorId:
              preservedSession.operadorId,
            perfil:
              preservedSession.perfil
          });
        }
      }
    }

    if (!sessionPreserved) {
      clearOfflineAuthenticatedOperator();
      await setOfflineShellAuthenticationState(null);

      log('OFFLINE FAILOVER LOGIN FALLBACK', {
        reason:
          onlineSessionIdentity
            ? 'ONLINE_SESSION_COULD_NOT_BE_APPLIED'
            : 'ONLINE_SESSION_UNAVAILABLE'
      });
    }

    const draft =
      offlineContinuityDraft && typeof offlineContinuityDraft === 'object'
        ? offlineContinuityDraft
        : {
            version: 1,
            saleNumber: '',
            products: [],
            currentProduct: null,
            totalValue: 0,
            activeProducts: 0,
            paymentStageOpen: false
          };

    await restoreOfflineContinuityDraft(draft);

    try {
      await refreshOfflineNfceNumberDisplay();
    } catch (numberRefreshError) {
      log('OFFLINE NFCE NUMBER REFRESH TICK DEFERRED', {
        erro: String(
          numberRefreshError && numberRefreshError.message ||
          numberRefreshError
        )
      });
    }

    await settleOfflineRendererBeforeReveal();

    if (!showOfflineOverlay()) {
      throw new Error(
        'Não foi possível exibir o renderer offline pré-carregado.'
      );
    }

    offlineUiMode = 'OFFLINE';
    offlineFailureCount = 0;
    offlineSuccessCount = 0;
    syncOfflineFunctionShortcuts();

    log('OFFLINE FAILOVER ACTIVE', {
      origin: offlineUiServer.origin,
      continuity: {
        products: Array.isArray(draft.products) ? draft.products.length : 0,
        hasCurrentProduct: Boolean(draft.currentProduct),
        paymentStageOpen: draft.paymentStageOpen === true
      }
    });

    return true;
  } catch (error) {
    offlineUiMode = 'ONLINE';
    clearOfflineAuthenticatedOperator();
    await setOfflineShellAuthenticationState(null);
    unregisterOfflineFunctionShortcuts();
    hideOfflineOverlay();
    log('OFFLINE FAILOVER FAILED', error);
    return false;
  }
}

async function switchToOnlineUi(reason) {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    offlineUiMode === 'ONLINE' ||
    offlineUiMode === 'SWITCHING_ONLINE'
  ) return false;

  if (await offlineHasActiveContinuitySale()) {
    log('OFFLINE RECOVERY WAITING ACTIVE SALE');
    return false;
  }

  offlineUiMode = 'SWITCHING_ONLINE';
  unregisterOfflineFunctionShortcuts();
  log('OFFLINE RECOVERY START', { reason: String(reason || 'connectivity-restored') });

  try {
    /*
     * A página Wix nunca é recarregada aqui. Ela permaneceu viva por baixo
     * do renderer offline durante toda a contingência, preservando sessão,
     * login e estado do aplicativo. Antes de revelá-la novamente, limpamos
     * apenas o rascunho que foi transferido e concluído no PDV offline.
     */
    const transferredSale = Boolean(
      offlineContinuityDraft &&
      typeof offlineContinuityDraft === 'object' &&
      (
        (Array.isArray(offlineContinuityDraft.products) && offlineContinuityDraft.products.some((item) => item && item.cancelled !== true)) ||
        offlineContinuityDraft.currentProduct
      )
    );

    const onlineCleared = await clearOnlineContinuityDraft();
    if (transferredSale && !onlineCleared) {
      offlineUiMode = 'OFFLINE';
      syncOfflineFunctionShortcuts();
      log('OFFLINE RECOVERY WAITING ONLINE CART CLEAR');
      return false;
    }

    const recoveryIdentity =
      resolveOfflineOperationSyncIdentity();

    if (!recoveryIdentity) {
      offlineUiMode = 'OFFLINE';
      syncOfflineFunctionShortcuts();
      log('OFFLINE RECOVERY WAITING SYNC IDENTITY');
      return false;
    }

    const fiscalProfile =
      getFiscalProfileCache(
        recoveryIdentity.empresaId
      );
    const fiscalEnvironment =
      String(
        fiscalProfile &&
        fiscalProfile.ambiente ||
        ''
      )
        .trim()
        .toUpperCase();
    const remoteOnlyProduction =
      fiscalEnvironment === 'PRODUCAO';

    let liveOnlineIdentity =
      await captureOnlineOperatorIdentityForOfflineCache({
        timeoutMs: 5000
      });

    const failoverOnlineIdentity =
      offlineFailoverOnlineOperatorIdentity &&
      offlineAuthenticatedOperator &&
      String(
        offlineFailoverOnlineOperatorIdentity.empresaId || ''
      ).trim() ===
        recoveryIdentity.empresaId &&
      String(
        offlineFailoverOnlineOperatorIdentity.operadorId || ''
      ).trim() ===
        String(
          offlineAuthenticatedOperator.operadorId || ''
        ).trim() &&
      String(
        offlineFailoverOnlineOperatorIdentity.perfil || ''
      )
        .trim()
        .toUpperCase() ===
        String(
          offlineAuthenticatedOperator.perfil || ''
        )
          .trim()
          .toUpperCase()
        ? offlineFailoverOnlineOperatorIdentity
        : null;

    let onlineIdentitySource =
      liveOnlineIdentity
        ? 'LIVE'
        : (
            failoverOnlineIdentity
              ? 'FAILOVER_SESSION'
              : 'NONE'
          );
    let onlinePageReloaded = false;

    if (!liveOnlineIdentity && !failoverOnlineIdentity) {
      try {
        await mainWindow.loadURL(
          URL_E_FISCO,
          {
            userAgent: chromeUserAgent()
          }
        );
        onlinePageReloaded = true;
        await new Promise(
          (resolve) => setTimeout(resolve, 900)
        );
        liveOnlineIdentity =
          await captureOnlineOperatorIdentityForOfflineCache({
            timeoutMs: 8000
          });
        if (liveOnlineIdentity) {
          onlineIdentitySource =
            'LIVE_AFTER_RELOAD';
        }
      } catch (reloadError) {
        log('OFFLINE RECOVERY ONLINE RELOAD DEFERRED', {
          erro: String(
            reloadError &&
            reloadError.message ||
            reloadError
          )
        });
      }
    }

    const onlineIdentity =
      liveOnlineIdentity ||
      failoverOnlineIdentity;
    const onlineLoginRequired =
      !onlineIdentity &&
      onlinePageReloaded &&
      remoteOnlyProduction;

    if (onlineLoginRequired) {
      log('OFFLINE RECOVERY ONLINE LOGIN REQUIRED', {
        empresaId: recoveryIdentity.empresaId,
        ambiente: fiscalEnvironment
      });

      offlineUiMode = 'ONLINE';
      offlineFailureCount = 0;
      offlineSuccessCount = 0;
      offlineContinuityDraft = null;

      if (!hideOfflineOverlay()) {
        throw new Error(
          'Não foi possível ocultar o renderer offline.'
        );
      }

      clearOfflineAuthenticatedOperator();
      offlineFailoverOnlineOperatorIdentity = null;
      await setOfflineShellAuthenticationState(null);

      log('OFFLINE RECOVERY ONLINE', {
        loginRequired: true,
        empresaId: recoveryIdentity.empresaId
      });
      return true;
    }

    if (
      !onlineIdentity ||
      String(onlineIdentity.empresaId || '').trim() !==
        recoveryIdentity.empresaId
    ) {
      offlineUiMode = 'OFFLINE';
      syncOfflineFunctionShortcuts();
      log('OFFLINE RECOVERY WAITING ONLINE TENANT', {
        offlineEmpresaId: recoveryIdentity.empresaId,
        onlineEmpresaId:
          onlineIdentity &&
          onlineIdentity.empresaId
            ? String(onlineIdentity.empresaId)
            : null,
        source:
          onlineIdentitySource
      });
      return false;
    }

    log('OFFLINE RECOVERY ONLINE TENANT CONFIRMED', {
      empresaId: recoveryIdentity.empresaId,
      source: onlineIdentitySource
    });

    const counterSync =
      buildFiscalCounterSyncPayload(
        recoveryIdentity.empresaId,
        recoveryIdentity.deviceId
      );

    if (
      counterSync &&
      Number.isSafeInteger(Number(counterSync.proximoNumero)) &&
      Number(counterSync.proximoNumero) > 0
    ) {
      await primeOnlineNfceNumberDisplay(
        Number(counterSync.proximoNumero)
      );
    }

    const localNextNfce =
      counterSync &&
      Number.isSafeInteger(Number(counterSync.proximoNumero)) &&
      Number(counterSync.proximoNumero) > 0
        ? Number(counterSync.proximoNumero)
        : null;

    if (!localNextNfce && !remoteOnlyProduction) {
      offlineUiMode = 'OFFLINE';
      syncOfflineFunctionShortcuts();
      log('OFFLINE RECOVERY WAITING NFCE COUNTER', {
        reason: 'LOCAL_COUNTER_UNAVAILABLE',
        ambiente: fiscalEnvironment || null
      });
      return false;
    }

    const remoteCounterCheck =
      await queryOnlineNfceNumberForRecovery();

    const remoteNextNfce =
      remoteCounterCheck &&
      remoteCounterCheck.ok === true &&
      Number.isSafeInteger(
        Number(remoteCounterCheck.proximoNumero)
      ) &&
      Number(remoteCounterCheck.proximoNumero) > 0
        ? Number(remoteCounterCheck.proximoNumero)
        : null;

    const counterCompatible =
      remoteNextNfce !== null &&
      (
        localNextNfce === null ||
        remoteNextNfce >= localNextNfce
      );

    log('OFFLINE RECOVERY NFCE COUNTER CHECK', {
      localNext: localNextNfce,
      remoteNext: remoteNextNfce,
      ok: counterCompatible,
      mode:
        localNextNfce === null &&
        remoteOnlyProduction
          ? 'REMOTE_ONLY_PRODUCAO'
          : 'LOCAL_AND_REMOTE',
      reason:
        remoteCounterCheck &&
        remoteCounterCheck.reason
          ? String(remoteCounterCheck.reason)
          : 'INVALID_RESPONSE'
    });

    if (!counterCompatible) {
      offlineUiMode = 'OFFLINE';
      syncOfflineFunctionShortcuts();
      log('OFFLINE RECOVERY WAITING NFCE COUNTER', {
        reason:
          remoteNextNfce === null
            ? (
                remoteCounterCheck &&
                remoteCounterCheck.reason
                  ? String(remoteCounterCheck.reason)
                  : 'REMOTE_COUNTER_UNAVAILABLE'
              )
            : 'REMOTE_COUNTER_BEHIND_LOCAL',
        localNext: localNextNfce,
        remoteNext: remoteNextNfce
      });
      return false;
    }

    await primeOnlineNfceNumberDisplay(
      remoteNextNfce
    );

    /*
     * O PDV ONLINE permaneceu vivo por baixo do OFFLINE e algumas rotinas
     * remotas podem restaurar o cabeçalho legado "VALOR UNIT.".
     * Corrige o texto ainda oculto e instala um observador somente nesse
     * frame ONLINE antes de revelar a tela ao operador.
     */
    await normalizeOnlinePdvUnitValueHeader();

    offlineUiMode = 'ONLINE';
    offlineFailureCount = 0;
    offlineSuccessCount = 0;
    offlineContinuityDraft = null;

    /*
     * O ONLINE ainda está coberto pelo renderer OFFLINE neste ponto.
     * Atualizamos a numeração por baixo e damos um instante ao compositor
     * antes de revelar a tela, evitando o flash do número antigo.
     */
    await refreshOnlineNfceNumberDisplay();
    await new Promise((resolve) => setTimeout(resolve, 75));

    if (!hideOfflineOverlay()) {
      throw new Error('Não foi possível ocultar o renderer offline.');
    }

    clearOfflineAuthenticatedOperator();
    offlineFailoverOnlineOperatorIdentity = null;
    await setOfflineShellAuthenticationState(null);

    log('OFFLINE RECOVERY ONLINE');
    return true;
  } catch (error) {
    offlineUiMode = 'OFFLINE';
    showOfflineOverlay();
    syncOfflineFunctionShortcuts();
    log('OFFLINE RECOVERY SHOW FAILED', error);
    return false;
  }
}

async function offlineRuntimeTick() {

  if (

    offlineRuntimeBusy ||

    !mainWindow ||

    mainWindow.isDestroyed() ||

    versaoAtualizacaoPendente

  ) return;



  offlineRuntimeBusy = true;

  try {

    const [wixOk, syncProbe] = await Promise.all([

      probeWixReachable(),

      probeSyncReachable()

    ]);



    const healthy = wixOk && syncProbe.reachable === true;



    if (offlineUiMode === 'ONLINE') {

      if (healthy) {

        offlineFailureCount = 0;

        offlineSuccessCount = Math.min(

          OFFLINE_RECOVERY_THRESHOLD,

          offlineSuccessCount + 1

        );



        if (syncProbe.authenticated) {

          try {

            await refreshRemoteCashState();

            const onlineSyncSummary =
              await syncOutboxPending();

            if (activeOutboxCount(onlineSyncSummary) === 0) {
              try {
                const mirrorSummary =
                  await syncOfflineProductCacheCoalesced({
                    deviceId: offlineSyncIdentity.deviceId,
                    deviceToken: offlineSyncIdentity.deviceToken,
                    empresaId: offlineSyncIdentity.empresaId
                  });

                if (!mirrorSummary || mirrorSummary.skipped !== true) {
                  log('OFFLINE PRODUCT MIRROR SYNCED', mirrorSummary);
                }
              } catch (mirrorError) {
                log('OFFLINE PRODUCT MIRROR DEFERRED', {
                  erro: String(
                    mirrorError && mirrorError.message || mirrorError
                  )
                });
              }

              try {
                const f5MirrorSummary =
                  await syncOfflineF5ReferenceCacheCoalesced({
                    deviceId: offlineSyncIdentity.deviceId,
                    deviceToken: offlineSyncIdentity.deviceToken,
                    empresaId: offlineSyncIdentity.empresaId
                  });

                if (!f5MirrorSummary || f5MirrorSummary.skipped !== true) {
                  log('OFFLINE F5 MIRROR SYNCED', f5MirrorSummary);
                }
              } catch (f5MirrorError) {
                log('OFFLINE F5 MIRROR DEFERRED', {
                  erro: String(
                    f5MirrorError && f5MirrorError.message || f5MirrorError
                  )
                });
              }
            }

          } catch (error) {

            if (offlineAuthFailure(error)) marcarOfflineAuthInvalida(error);

            else log('OFFLINE ONLINE-SYNC DEFERRED', error);

          }

          try {

            const leaseSummary = await maintainOfflineFiscalLeaseInventory();

            logFiscalLeaseMaintenance(leaseSummary);

          } catch (error) {

            if (offlineAuthFailure(error)) marcarOfflineAuthInvalida(error);

            else log('OFFLINE FISCAL LEASE MAINTENANCE DEFERRED', {

              erro: String(error && error.message || error)

            });

          }

          try {

            const fiscalResult = await maintainOfflineFiscalTransmission();

            logFiscalTransmissionSummary(fiscalResult);

          } catch (error) {

            log('OFFLINE FISCAL OUTBOX DEFERRED', {

              erro: String(error && error.message || error)

            });

          }

        }

        return;

      }



      offlineSuccessCount = 0;

      offlineFailureCount += 1;

      if (

        Date.now() - lastMainFrameFailureAt < 20_000

      ) {

        offlineFailureCount = Math.max(

          offlineFailureCount,

          OFFLINE_FAILURE_THRESHOLD

        );

      }



      if (offlineFailureCount >= OFFLINE_FAILURE_THRESHOLD) {

        try {

          await switchToOfflineUi('online-unreachable');

        } catch (error) {

          log('OFFLINE FAILOVER BLOCKED', error);

        }

      }

      return;

    }



    if (offlineUiMode !== 'OFFLINE') return;



    if (!healthy) {

      offlineSuccessCount = 0;

      return;

    }



    offlineSuccessCount += 1;

    if (offlineSuccessCount < OFFLINE_RECOVERY_THRESHOLD) return;



    if (syncProbe.authInvalid === true) {
      log('OFFLINE RECOVERY REAUTH REQUIRED', {
        reason: 'device-auth-invalid-offline-blocked'
      });
      return;
    }



    try {

      await refreshRemoteCashState();

      const summary = await syncOutboxPending();

      const active = activeOutboxCount(summary);

      if (active > 0) {

        log('OFFLINE RECOVERY WAITING OUTBOX', summary);

        return;

      }

      /*
       * Reconciliação de estoque:
       * primeiro o servidor confirma todas as operações offline; depois
       * puxamos a fotografia ONLINE já conciliada. Só então voltamos ao Wix.
       * Assim a próxima queda parte exatamente do último saldo autoritativo.
       */
      const recoveryIdentity =
        resolveOfflineOperationSyncIdentity();
      if (!recoveryIdentity) {
        throw new Error(
          'Identidade de sync da empresa offline indisponível.'
        );
      }

      const mirrorSummary =
        await syncOfflineProductCacheCoalesced({
          deviceId: recoveryIdentity.deviceId,
          deviceToken: recoveryIdentity.deviceToken,
          empresaId: recoveryIdentity.empresaId,
          force: true
        });

      log('OFFLINE STOCK RECONCILED', mirrorSummary);

      const fiscalResult = await maintainOfflineFiscalTransmission();

      logFiscalTransmissionSummary(fiscalResult);

      /*
       * A transmissão fiscal pode autorizar uma NFC-e neste mesmo ciclo.
       * Sincronize essa autorização com a VPS antes de revelar o PDV ONLINE,
       * para que o refresh do cabeçalho leia o próximo número já atualizado.
       */
      const postFiscalSyncSummary = await syncOutboxPending();
      if (activeOutboxCount(postFiscalSyncSummary) > 0) {
        log('OFFLINE RECOVERY WAITING POST-FISCAL SYNC', postFiscalSyncSummary);
        return;
      }

      await switchToOnlineUi('outbox-synchronized');

    } catch (error) {

      if (offlineAuthFailure(error)) {
        marcarOfflineAuthInvalida(error);
        log('OFFLINE RECOVERY REAUTH REQUIRED', {
          reason: 'device-auth-invalid-after-reconnect'
        });
      } else {

        log('OFFLINE RECOVERY SYNC FAILED', error);

      }

    }

  } finally {

    offlineRuntimeBusy = false;

  }

}



function startOfflineRuntimeMonitor() {

  if (timerOfflineRuntime) return;

  timerOfflineRuntime = setInterval(

    () => void offlineRuntimeTick(),

    OFFLINE_RUNTIME_INTERVAL_MS

  );

  if (timerOfflineRuntime && typeof timerOfflineRuntime.unref === 'function') {

    timerOfflineRuntime.unref();

  }

  setTimeout(() => void offlineRuntimeTick(), 1_000);

}



function stopOfflineRuntimeMonitor() {

  if (!timerOfflineRuntime) return;

  clearInterval(timerOfflineRuntime);

  timerOfflineRuntime = null;

}



function installOnlineNetworkFailoverHook() {
  if (onlineNetworkFailoverHookInstalled) return;

  const ses = session.defaultSession;
  const connectivityErrors = [
    'ERR_INTERNET_DISCONNECTED',
    'ERR_NETWORK_CHANGED',
    'ERR_NAME_NOT_RESOLVED',
    'ERR_CONNECTION_TIMED_OUT',
    'ERR_CONNECTION_RESET',
    'ERR_CONNECTION_REFUSED',
    'ERR_ADDRESS_UNREACHABLE',
    'ERR_NETWORK_ACCESS_DENIED',
    'ERR_TIMED_OUT'
  ];

  ses.webRequest.onErrorOccurred(
    { urls: ['https://*/*'] },
    (details) => {
      if (
        offlineUiMode !== 'ONLINE' ||
        onlineNetworkFailoverInFlight ||
        !offlineViewReady ||
        offlineAuthorizationState === 'INVALID'
      ) {
        return;
      }

      const resourceType =
        String(details && details.resourceType || '').toLowerCase();

      if (
        !['xhr', 'fetch', 'mainframe', 'subframe'].includes(resourceType)
      ) {
        return;
      }

      const errorText =
        String(details && details.error || '').toUpperCase();

      if (
        !connectivityErrors.some((code) => errorText.includes(code))
      ) {
        return;
      }

      onlineNetworkFailoverInFlight = true;
      lastMainFrameFailureAt = Date.now();

      log('ONLINE NETWORK REQUEST FAILED', {
        error: String(details && details.error || ''),
        resourceType,
        url: String(details && details.url || '')
      });

      void switchToOfflineUi('network-request-failed')
        .catch((error) => {
          log('OFFLINE FAILOVER AFTER NETWORK ERROR BLOCKED', error);
        })
        .finally(() => {
          onlineNetworkFailoverInFlight = false;
        });
    }
  );

  onlineNetworkFailoverHookInstalled = true;
}

async function criarJanela() {
  await limparTudoDaSessao();

  const userAgent =
    chromeUserAgent();

  session.defaultSession.setUserAgent(

    userAgent

  );

  installOnlineNetworkFailoverHook();



  if (!offlineUiServer) {

    try {

      offlineUiServer = await startOfflineUiServer();

      log('OFFLINE UI LOOPBACK READY', {

        origin: offlineUiServer.origin

      });

    } catch (error) {

      offlineUiServer = null;

      log('OFFLINE UI LOOPBACK INDISPONIVEL', error);

    }

  }

  /*
   * Fase 1 — consulta o manifesto de contingência em paralelo.
   * Não bloqueia e não substitui o carregamento normal do Wix.
   */
  iniciarMonitorManifestoStandby();

  mainWindow =
    new BrowserWindow({
      width: 1280,
      height: 800,
      show: false,

      icon:
        path.join(
          __dirname,
          'icone_app.ico'
        ),

      frame: true,
      skipTaskbar: false,
      closable: true,
      minimizable: true,
      maximizable: true,
      fullscreenable: false,
      autoHideMenuBar: true,

      webPreferences: {
        preload:
          path.join(
            __dirname,
            'preload.js'
          ),
        contextIsolation:
          true,

        nodeIntegration:
          false,

        sandbox:
          true,

        devTools:
          false
      }
    });

  mainWindow.webContents.setWindowOpenHandler(
    (details) => {
      const windowOpen =
        classifyRendererWindowOpen({
          source: 'mainWindow',
          url:
            details &&
            details.url
              ? details.url
              : ''
        });

      logBlockedRendererWindowOpen({
        source: 'mainWindow',
        windowOpen
      });

      return {
        action: 'deny'
      };
    }
  );

  mainWindow.maximize();

  mainWindow.webContents.on(
    'preload-error',
    (_event, preloadPath, error) => {
      log(
        'MAIN PRELOAD ERROR',
        {
          preload:
            path.basename(
              String(preloadPath || '')
            ),
          erro:
            String(
              error &&
              error.message ||
              error ||
              ''
            )
        }
      );
    }
  );

  mainWindow.on('resize', resizeOfflineOverlay);
  mainWindow.on('maximize', resizeOfflineOverlay);
  mainWindow.on('unmaximize', resizeOfflineOverlay);
  mainWindow.on('focus', syncOfflineFunctionShortcuts);
  mainWindow.on('blur', unregisterOfflineFunctionShortcuts);
  mainWindow.on('closed', () => {
    unregisterOfflineFunctionShortcuts();
    offlineViewReady = false;
    offlineViewAttached = false;
    if (offlineView && offlineView.webContents && !offlineView.webContents.isDestroyed()) {
      try { offlineView.webContents.close(); } catch (_) {}
    }
    offlineView = null;
  });

  instalarCanalDiretoDoFrame();

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const navigationUrl =
      resolveNavigationEventUrl(event, url);

    const navigation =
      classifyMainWindowNavigation(navigationUrl);

    if (navigation.decision === 'ALLOW') {
      return;
    }

    event.preventDefault();

    logBlockedMainWindowNavigation({
      eventType: 'will-navigate',
      navigation,
      isMainFrame: true
    });

    if (navigation.decision === 'INTERCEPT') {
      iniciarAtualizacaoObrigatoria().catch(async (erro) => {
        log('FALHA AO INICIAR AUTOUPDATE', erro);

        if (
          mainWindow &&
          !mainWindow.isDestroyed() &&
          versaoAtualizacaoPendente
        ) {
          await mainWindow.loadURL(
            paginaAtualizacaoObrigatoria(versaoAtualizacaoPendente)
          );
        }
      });
    }
  });

  mainWindow.webContents.on(
    'will-redirect',
    (
      event,
      url,
      _isInPlace,
      isMainFrame
    ) => {
      if (
        !resolveNavigationEventIsMainFrame(
          event,
          isMainFrame
        )
      ) {
        return;
      }

      const redirectUrl =
        resolveNavigationEventUrl(event, url);

      const navigation =
        classifyMainWindowNavigation(redirectUrl);

      if (navigation.decision === 'ALLOW') {
        return;
      }

      event.preventDefault();

      logBlockedMainWindowNavigation({
        eventType: 'will-redirect',
        navigation,
        isMainFrame: true
      });
    }
  );

  mainWindow.webContents.on(
    'context-menu',
    (event) => {
      event.preventDefault();
    }
  );

  mainWindow.webContents.on(

    'did-fail-load',

    (

      _event,

      errorCode,

      errorDescription,

      validatedURL,

      isMainFrame

    ) => {

      if (

        isMainFrame === true &&

        offlineUiMode === 'ONLINE' &&

        !isOfflineOriginAllowed(validatedURL)

      ) {

        lastMainFrameFailureAt = Date.now();

        log('ONLINE MAIN FRAME LOAD FAILED', {
          errorCode,
          errorDescription: String(errorDescription || ''),
          url: String(validatedURL || '')
        });

        if (
          offlineViewReady &&
          offlineAuthorizationState !== 'INVALID'
        ) {
          void switchToOfflineUi('main-frame-load-failed').catch((error) => {
            log('OFFLINE FAILOVER AFTER LOAD FAILURE BLOCKED', error);
          });
        }

      }

    }

  );



  mainWindow.webContents.on(

    'before-input-event',
    (
      event,
      input
    ) => {
      const key =
        String(
          input.key || ''
        ).toUpperCase();

      const ctrlShift =
        input.control &&
        input.shift;

      if (
        offlineUiMode === 'OFFLINE' &&
        (key === 'F4' || key === 'F5')
      ) {
        event.preventDefault();

        if (
          offlineView &&
          offlineView.webContents &&
          !offlineView.webContents.isDestroyed() &&
          String(input.type || '') === 'keyDown'
        ) {
          try {
            offlineView.webContents.focus();
            offlineView.webContents.sendInputEvent({
              type: 'keyDown',
              keyCode: key
            });
          } catch (error) {
            log('OFFLINE FUNCTION KEY FORWARD FAILED', {
              key,
              erro: String(error && error.message || error)
            });
          }
        }

        return;
      }

      if (
        key === 'F12' ||
        (
          ctrlShift &&
          ['I', 'J', 'C'].includes(
            key
          )
        ) ||
        (
          input.control &&
          key === 'U'
        )
      ) {
        event.preventDefault();
      }
    }
  );

  mainWindow.webContents.on(
    'did-finish-load',
    async () => {
      try {
        const css =
          fs.readFileSync(
            path.join(
              __dirname,
              'ajuste.css'
            ),
            'utf8'
          );

        await mainWindow
          .webContents
          .insertCSS(
            css
          );
      } catch (_) {}

      await instalarPonteTopDeImpressao();
      await installOfflineVerifierTopBridge();

      if (
        offlineUiMode === 'ONLINE' &&
        pendingOfflineOperatorVerifier
      ) {
        setTimeout(
          () => {
            void persistPendingOfflineOperatorCredentialAfterOnlineLogin()
              .catch((error) => {
                log('OFFLINE OPERATOR CREDENTIAL CACHE FAILED', {
                  erro: String(error && error.message || error)
                });
              });
          },
          700
        );
      }

      try {
        const titulo =
          (
            await mainWindow
              .webContents
              .getTitle()
          ) || '';

        if (
          !tentouRecuperar404 &&
          /^404\b/i.test(
            titulo.trim()
          )
        ) {
          tentouRecuperar404 =
            true;

          await limparTudoDaSessao();

          mainWindow
            .webContents
            .loadURL(
              URL_E_FISCO,
              {
                userAgent
              }
            );
        }
      } catch (_) {}
    }
  );

  mainWindow.once(
    'ready-to-show',
    () => {
      mainWindow.show();
      mainWindow.maximize();
    }
  );

  try {
    versaoAtualizacaoPendente =
      await verificarAtualizacaoObrigatoria();
  } catch (erro) {
    log('ERRO VERIFICACAO AUTOUPDATE', erro);
    versaoAtualizacaoPendente = null;
  }

  if (versaoAtualizacaoPendente) {
    await mainWindow.loadURL(
      paginaAtualizacaoObrigatoria(
        versaoAtualizacaoPendente
      )
    );
    return;
  }

  try {
    await ensureOfflineView();
  } catch (error) {
    log('OFFLINE VIEW PRELOAD FAILED', error);
  }

  let startupOnline = false;

  try {
    startupOnline =
      await probeWixReachableStartup();
  } catch (error) {
    startupOnline = false;

    log(
      'STARTUP CONNECTIVITY PREFLIGHT FAILED',
      {
        erro: String(
          error &&
          error.message ||
          error
        )
      }
    );
  }

  if (!startupOnline) {
    log(
      'STARTUP OFFLINE DETECTED',
      {
        timeoutMs:
          OFFLINE_STARTUP_PROBE_TIMEOUT_MS
      }
    );

    try {
      const switched =
        await switchToOfflineUi(
          'startup-preflight-offline'
        );

      if (switched) {
        mainWindow.show();
        mainWindow.maximize();

        /*
         * Na inicialização já offline, a BrowserWindow estava oculta
         * enquanto a view de contingência era preparada. Depois de
         * mostrar a janela, devolvemos explicitamente o foco para a
         * view offline e reaplicamos o estado de autenticação para que
         * o campo de senha fique pronto para digitação imediatamente.
         */
        if (
          offlineView &&
          offlineView.webContents &&
          !offlineView.webContents.isDestroyed()
        ) {
          offlineView.webContents.focus();
        }

        await setOfflineShellAuthenticationState(null);

        sinalizarNovaVersaoProntaSeNecessario();
        startContinuityMirror();
        startOfflineRuntimeMonitor();

        return;
      }
    } catch (error) {
      log(
        'STARTUP OFFLINE PREFLIGHT SWITCH FAILED',
        error
      );
    }
  }

  try {
    await mainWindow.loadURL(
      URL_E_FISCO,
      {
        userAgent
      }
    );
  } catch (error) {
    lastMainFrameFailureAt = Date.now();
    log('ONLINE INITIAL LOAD FAILED', {
      erro: String(error && error.message || error)
    });

    try {
      await switchToOfflineUi('initial-load-failed');
    } catch (failoverError) {
      log('OFFLINE INITIAL FAILOVER BLOCKED', failoverError);
    }
  }

  sinalizarNovaVersaoProntaSeNecessario();

  startContinuityMirror();
  startOfflineRuntimeMonitor();
}

const gotLock =
  app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  instalarIpc();

  app.whenReady().then(
    async () => {
      if (
        deveBloquearInicioPorAtualizacao()
      ) {
        app.quit();
        return;
      }

      /*
       * Fase 2 — fundação SQLite local.
       * A falha do banco de contingência nunca bloqueia o Wix nesta etapa.
       */
      try {
        const offlineDbInfo =
          initializeOfflineDatabase({
            userDataDir:
              app.getPath('userData')
          });

        log(
          'OFFLINE SQLITE READY',
          offlineDbInfo
        );

        const offlineDb =
          getOfflineDatabase();

        const syncDeviceId =
          getOrCreateSyncDeviceId({
            db: offlineDb
          });

        /*
         * Reparo controlado do pareamento local:
         * um marcador temporário com código de pareamento só é consumido
         * pelo próprio e-fisco.exe, no userData real e com o safeStorage real.
         * O bearer retornado pelo servidor nunca é gravado em claro.
         */
        const pairingRepairPath =
          path.join(
            app.getPath('userData'),
            'offline-auth',
            'device-pairing-repair.json'
          );

        if (fs.existsSync(pairingRepairPath)) {
          const repairPayload =
            JSON.parse(
              fs.readFileSync(pairingRepairPath, 'utf8')
            );

          const pairingCode =
            String(
              repairPayload &&
              repairPayload.pairingCode ||
              ''
            ).trim();

          if (
            pairingCode.length < 16 ||
            pairingCode.length > 128
          ) {
            throw new Error(
              'Marcador local de reparo do pareamento é inválido.'
            );
          }

          if (!safeStorage.isEncryptionAvailable()) {
            throw new Error(
              'safeStorage indisponível durante reparo do pareamento.'
            );
          }

          const repairedPairing =
            await requestDevicePairing({
              deviceId: syncDeviceId,
              pairingCode
            });

          storeSyncDeviceTokenForCompany({
            safeStorage,
            userDataDir:
              app.getPath('userData'),
            empresaId:
              repairedPairing.empresaId,
            deviceToken:
              repairedPairing.deviceToken
          });

          storeSyncDeviceToken({
            safeStorage,
            userDataDir:
              app.getPath('userData'),
            deviceToken:
              repairedPairing.deviceToken
          });

          storeSyncEmpresaId({
            db: offlineDb,
            empresaId:
              repairedPairing.empresaId
          });

          fs.unlinkSync(pairingRepairPath);

          log(
            'OFFLINE SYNC DEVICE REPAIR COMPLETED',
            {
              deviceId: syncDeviceId,
              tokenConfigured: true,
              expiresAt:
                repairedPairing.expiresAt || null
            }
          );
        }

        let syncEmpresaId =

          getSyncEmpresaId({

            db: offlineDb

          });

        const companyTokenConfigured =
          Boolean(
            syncEmpresaId &&
            hasStoredSyncDeviceTokenForCompany({
              userDataDir:
                app.getPath('userData'),
              empresaId:
                syncEmpresaId
            })
          );

        const legacyTokenConfigured =
          hasStoredSyncDeviceToken({
            userDataDir:
              app.getPath('userData')
          });

        const tokenConfigured =
          companyTokenConfigured ||
          legacyTokenConfigured;



        if (syncEmpresaId) {
          try {
            const preparedCompany =
              registerPreparedOfflineCompanyFromLocalState(
                syncEmpresaId,
                {
                  requireActiveCredential:
                    true,
                  onlyIfMissing:
                    true
                }
              );

            if (preparedCompany) {
              log(
                'OFFLINE PREPARED COMPANY LEGACY REGISTERED',
                {
                  empresaId:
                    preparedCompany.empresaId
                }
              );
            }
          } catch (error) {
            log(
              'OFFLINE PREPARED COMPANY LEGACY DEFERRED',
              {
                empresaId:
                  syncEmpresaId,
                erro:
                  String(
                    error &&
                    error.message ||
                    error
                  )
              }
            );
          }
        }

        let deviceToken = null;

        offlineSyncIdentity = {

          deviceId: syncDeviceId,

          deviceToken: null,

          empresaId: syncEmpresaId

        };

        offlineAuthorizationState =

          tokenConfigured && syncEmpresaId

            ? 'TRUSTED_LOCAL'

            : 'UNAVAILABLE';

        if (
          tokenConfigured &&
          safeStorage.isEncryptionAvailable()
        ) {
          try {

            if (
              syncEmpresaId &&
              companyTokenConfigured
            ) {
              deviceToken =
                loadSyncDeviceTokenForCompany({
                  userDataDir:
                    app.getPath('userData'),
                  empresaId:
                    syncEmpresaId,
                  safeStorage
                });
            } else {
              deviceToken =
                loadSyncDeviceToken({
                  userDataDir:
                    app.getPath('userData'),
                  safeStorage
                });

              if (
                deviceToken &&
                syncEmpresaId
              ) {
                storeSyncDeviceTokenForCompany({
                  safeStorage,
                  userDataDir:
                    app.getPath('userData'),
                  empresaId:
                    syncEmpresaId,
                  deviceToken
                });
              }
            }

            log(
              'OFFLINE SYNC DEVICE TOKEN LOADED',
              {
                empresaId:
                  syncEmpresaId || null,
                source:
                  companyTokenConfigured
                    ? 'COMPANY'
                    : 'LEGACY'
              }
            );



            offlineSyncIdentity.deviceToken = deviceToken;

            const ping =
              await pingSyncDevice({
                deviceId:
                  syncDeviceId,
                deviceToken
              });

            syncEmpresaId =
              storeSyncEmpresaId({
                db: offlineDb,
                empresaId:
                  ping.empresaId
              });

            storeSyncDeviceTokenForCompany({
              safeStorage,
              userDataDir:
                app.getPath('userData'),
              empresaId:
                syncEmpresaId,
              deviceToken
            });



            offlineSyncIdentity.empresaId = syncEmpresaId;

            offlineAuthorizationState = 'VALID';



            try {

              let cashState;

              try {

                cashState = await pullSyncCashSummary({

                  deviceId: syncDeviceId,

                  deviceToken,

                  empresaId: syncEmpresaId,

                  includeMovements: true,

                  timeoutMs: 10_000

                });

              } catch (summaryError) {

                if (offlineAuthFailure(summaryError)) {

                  throw summaryError;

                }

                cashState = await pullSyncCashState({

                  deviceId: syncDeviceId,

                  deviceToken,

                  empresaId: syncEmpresaId,

                  timeoutMs: 10_000

                });

              }

              mirrorRemoteCashState(cashState);

              log('OFFLINE CASH STATE MIRRORED', {

                empresaId: syncEmpresaId,

                aberto: cashState.aberto === true

              });

            } catch (cashStateError) {

              if (offlineAuthFailure(cashStateError)) {

                marcarOfflineAuthInvalida(cashStateError);

              } else {

                log('OFFLINE CASH STATE DEFERRED', {

                  erro: String(cashStateError && cashStateError.message || cashStateError)

                });

              }

            }



            try {

              recoverInterruptedOutbox({

                empresaId: syncEmpresaId,

                staleBefore: new Date(Date.now() - 5 * 60 * 1000).toISOString(),

                updatedAt: new Date().toISOString(),

                nextAttemptAt: new Date().toISOString()

              });

            } catch (recoverError) {

              log('OFFLINE OUTBOX RECOVERY DEFERRED', recoverError);

            }



            void provisionFiscalA1FromServer({
              deviceId: syncDeviceId,
              deviceToken,
              empresaId: syncEmpresaId,
              userDataDir: app.getPath('userData'),
              safeStorage,
              timeoutMs: 30000
            }).then((summary) => {
              log('OFFLINE FISCAL A1 PROVISION', {
                available: summary.available === true,
                stored: summary.stored === true,
                certificateId: summary.certificateId || null
              });
            }).catch((error) => {
              log('OFFLINE FISCAL A1 PROVISION DEFERRED', {
                erro: String(error && error.message || error)
              });
            });

            log(

              'OFFLINE SYNC DEVICE AUTHENTICATED',
              {
                deviceId:
                  syncDeviceId,
                empresaId:
                  syncEmpresaId
              }
            );
            void provisionOfflineMultiCompany({
              deviceId:
                syncDeviceId,
              deviceToken,
              rootEmpresaId:
                syncEmpresaId
            }).then(
              (summary) => {
                log(
                  'OFFLINE MULTI COMPANY PROVISIONED',
                  summary
                );
              }
            ).catch(
              async (
                multiCompanyError
              ) => {
                log(
                  'OFFLINE MULTI COMPANY PROVISION DEFERRED',
                  {
                    empresaId:
                      syncEmpresaId,
                    erro:
                      String(
                        multiCompanyError &&
                        multiCompanyError.message ||
                        multiCompanyError
                      )
                  }
                );

                try {
                  const fallback =
                    await syncRootReferenceFallback({
                      deviceId:
                        syncDeviceId,
                      deviceToken,
                      empresaId:
                        syncEmpresaId
                    });

                  log(
                    'OFFLINE REFERENCE CACHE SYNCED',
                    fallback
                  );
                } catch (
                  erroReferencePull
                ) {
                  log(
                    'OFFLINE REFERENCE CACHE SYNC INDISPONIVEL',
                    {
                      deviceId:
                        syncDeviceId,
                      empresaId:
                        syncEmpresaId,
                      erro:
                        String(
                          erroReferencePull &&
                          erroReferencePull.message ||
                          erroReferencePull
                        )
                    }
                  );
                }
              }
            );
          } catch (erroPingDevice) {

            if (offlineAuthFailure(erroPingDevice)) {

              marcarOfflineAuthInvalida(erroPingDevice);

            } else if (deviceToken && syncEmpresaId) {

              offlineAuthorizationState = 'TRUSTED_LOCAL';

            }

            offlineSyncIdentity.deviceToken = deviceToken;

            offlineSyncIdentity.empresaId = syncEmpresaId;



            log(
              'OFFLINE SYNC DEVICE PING INDISPONIVEL',
              {
                deviceId:
                  syncDeviceId,
                empresaIdLocal:
                  syncEmpresaId,
                erro:
                  String(
                    erroPingDevice &&
                    erroPingDevice.message ||
                    erroPingDevice
                  )
              }
            );
          }
        }

        log(
          'OFFLINE SYNC DEVICE READY',
          {
            deviceId:
              syncDeviceId,
            empresaId:
              syncEmpresaId,
            tokenConfigured,
            secureStorageAvailable:
              safeStorage.isEncryptionAvailable()
          }
        );
      } catch (erroOfflineDb) {
        log(
          'ERRO ISOLADO AO INICIALIZAR SQLITE OFFLINE',
          erroOfflineDb
        );
      }

      await criarJanela();
    }
  );

  app.on(
    'second-instance',
    () => {
      if (mainWindow) {
        if (
          mainWindow.isMinimized()
        ) {
          mainWindow.restore();
        }

        mainWindow.show();
        mainWindow.focus();
      }
    }
  );

  app.on(
    'before-quit',
    () => {
      unregisterOfflineFunctionShortcuts();
      pararMonitorManifestoStandby();

      stopOfflineRuntimeMonitor();
      stopContinuityMirror();

      if (offlineUiServer) {

        void offlineUiServer.close().catch(() => {});

        offlineUiServer = null;

      }

      closeOfflineDatabase();
    }
  );

  app.on(
    'window-all-closed',
    () => {
      app.quit();
    }
  );

  app.on(
    'activate',
    () => {
      if (
        BrowserWindow
          .getAllWindows()
          .length ===
        0
      ) {
        criarJanela();
      }
    }
  );
}













