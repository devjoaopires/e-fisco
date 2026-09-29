const {
  app,
  session,
  ipcMain,
  safeStorage,
  globalShortcut,
  net,
  BrowserWindow
} = require('electron');

const {
  spawn
} = require('child_process');

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const https = require('https');
const { autoUpdater } = require('electron-updater');
const {
  createAppLifecycle
} = require('./desktop/bootstrap/app-lifecycle');
const {
  resolveRuntimePaths,
  createRuntimeBootstrap
} = require('./desktop/bootstrap/runtime-bootstrap');
const navigationPolicyModule =
  require('./desktop/security/navigation-policy');
const ipcAuthorizationModule =
  require('./desktop/security/ipc-authorization');
const {
  registerOfflineReadHandlers,
  registerOfflineMutationHandlers
} = require('./desktop/ipc/offline-handlers');
const windowLayoutModule =
  require('./desktop/windows/window-layout');
const {
  createMainWindow,
  bindMainWindowLifecycle,
  bindMainWindowReadyToShow
} = require('./desktop/windows/main-window');
const {
  createOfflineView,
  loadOfflineView,
  checkOfflineViewHealth,
  bindOfflineViewDiagnostics,
  attachOfflineView,
  closeOfflineView
} = require('./desktop/windows/offline-view');
const {
  createOfflineDiagnosticView,
  loadOfflineDiagnosticView,
  attachOfflineDiagnosticView,
  closeOfflineDiagnosticView
} = require('./desktop/windows/offline-diagnostic-view');
const {
  createOfflineRendererRecoveryController
} = require('./desktop/windows/offline-renderer-recovery');
const {
  createOfflineRendererHealthState
} = require('./desktop/windows/offline-renderer-health');
const {
  collectOfflinePrerequisiteDiagnostics
} = require('./offline/diagnostics/prerequisites');
const {
  resolveOfflineUiFailureDiagnostic
} = require('./offline/diagnostics/codes');
const {
  shouldShowDiagnosticOverlay,
  buildBlockedFailoverDiagnostic
} = require('./offline/diagnostics/presentation');
const {
  createOfflineSelfTestRunner
} = require('./offline/diagnostics/self-test');
const {
  createOfflineAutoRepairRunner
} = require('./offline/diagnostics/auto-repair');
const {
  createOfflineDiagnosticReportService
} = require('./offline/diagnostics/report');
const {
  buildOfflineTelemetryPayload
} = require('./offline/telemetry/payload');
const {
  createOfflineTelemetryQueue
} = require('./offline/telemetry/queue');
const {
  createOfflineTelemetrySender
} = require('./offline/telemetry/sender');
const {
  createUpdateController
} = require('./updater/update-controller');
const {
  createStandbyController
} = require('./updater/standby-controller');
const {
  createAuthorizationController,
  offlineAuthFailure:
    offlineAuthFailureFromModule
} = require('./offline/auth-session/authorization');
const {
  createOperatorSessionController
} = require('./offline/auth-session/operator-session');
const {
  createOperatorVerifierController,
  decodeCanonicalBase64:
    decodeCanonicalBase64FromModule
} = require('./offline/auth-session/operator-verifier');
const {
  createOperatorProvisioningController
} = require('./offline/auth-session/operator-provisioning');
const {
  createProductCacheCoordinator
} = require('./offline/sync/product-cache');
const {
  createReferenceCacheCoordinator
} = require('./offline/sync/reference-cache');
const {
  createOutboxCoordinator
} = require('./offline/sync/outbox-coordinator');
const {
  createFiscalRuntimeCoordinator
} = require('./offline/fiscal/fiscal-runtime-coordinator');
const {
  createFiscalCounterBridge
} = require('./offline/fiscal/fiscal-counter-bridge');
const {
  createContinuityMirrorController
} = require('./offline/continuity/continuity-mirror');
const {
  createContinuityRecoveryController
} = require('./offline/continuity/continuity-recovery');
const {
  createConnectivityProbes
} = require('./offline/failover/connectivity-probes');
const {
  createFailoverController
} = require('./offline/failover/failover-controller');
const {
  createOfflineUiRuntime
} = require('./offline/runtime/ui-runtime');
const {
  createOfflineShortcutController
} = require('./offline/runtime/shortcuts');
const {
  createOfflineRuntimeController
} = require('./offline/runtime/runtime-controller');
const {
  createWindowsPrintDriver
} = require('./printing/windows-driver');
const {
  createPrintQueue
} = require('./printing/print-queue');
const {
  createFramePrintBridge
} = require('./printing/frame-print-bridge');

const {
  initializeOfflineDatabase,
  closeOfflineDatabase,
  getOfflineDatabase,
  probeOfflineDatabase,
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
  'https://plataforma.e-fisco.app/';

const TRUSTED_ONLINE_REDIRECT_ORIGINS =
  Object.freeze([]);

function parseUrlSegura(rawUrl) {
  return navigationPolicyModule.parseUrlSegura(rawUrl);
}

const PRINTER_NAME =
  'IMPRESSORA FISCAL';

const RUNTIME_PATHS =
  resolveRuntimePaths({
    appRoot:
      __dirname,
    isPackaged:
      app.isPackaged,
    resourcesPath:
      process.resourcesPath
  });

const PRELOAD_PATH =
  RUNTIME_PATHS.preloadPath;
const APP_ICON_PATH =
  RUNTIME_PATHS.iconPath;
const ADJUSTMENT_CSS_PATH =
  RUNTIME_PATHS.adjustmentCssPath;

const VERSION = app.getVersion();

const FRAME_NFCE_COUNTER_MARKER = '__EFISCO_NFCE_COUNTER_FRAME_V1__';
const FRAME_NFCE_COUNTER_RESPONSE_EVENT = '__EFISCO_NFCE_COUNTER_RESPONSE_V1__';
const FRAME_ONLINE_NFCE_NUMBER_RESPONSE_MARKER =
  '__EFISCO_ONLINE_NFCE_NUMBER_RESPONSE_V1__';
const FRAME_PRINT_MARKER =

  '__EFISCO_NFCE_PRINT_FRAME_V5__';

const FRAME_CONTINGENCY_PRINT_DIAG_MARKER =

  '__EFISCO_NFCE_CONTINGENCIA_PRINT_DIAG_V1__';


// Trava deliberada da Etapa 39. Não possui override por env/UI/config remota.
const ENABLE_REAL_SVRS_FISCAL_TRANSMISSION = true;

let mainWindow;
let offlineView = null;
let offlineViewReady = false;
let offlineViewAttached = false;
let offlineRendererFailureState = null;
let offlineDiagnosticView = null;
let offlineDiagnosticViewAttached = false;
let offlineDiagnosticGeneration = 0;
let lastOfflineBootstrapError = null;

const offlineRendererHealthState =
  createOfflineRendererHealthState({
    maxAgeMs:
      20000
  });

let offlineRendererHealthCheckInFlight =
  null;

let offlinePrerequisiteDiagnosticsState =
  null;

let offlinePrerequisiteDiagnosticsFingerprint =
  '';

let lastOfflineSelfTestReport =
  null;

let lastOfflineAutoRepairSummary =
  null;

let offlineDiagnosticReportService =
  null;

let offlineTelemetryQueue =
  null;

let offlineTelemetrySender =
  null;

let offlineReadinessState =
  Object.freeze({
    status: 'OFFLINE_NOT_READY',
    empresaId: null,
    operadorId: null,
    checkedAt: null,
    source: 'not-evaluated',
    checks: Object.freeze({
      database: false,
      preparedCompany: false,
      safeStorage: false,
      credential: false,
      server: false,
      renderer: false
    }),
    reasons: Object.freeze([
      'NOT_EVALUATED'
    ]),
    rendererFailure: null
  });
let tentouRecuperar404 = false;

let offlineUiServer = null;

const offlineRendererRecoveryController =
  createOfflineRendererRecoveryController({
    retryDelaysMs: [
      500,
      1500,
      3000
    ],
    budgetWindowMs:
      120000,
    isRecoverable(
      type
    ) {
      return [
        'DID_FAIL_LOAD',
        'PRELOAD_ERROR',
        'RENDER_PROCESS_GONE',
        'DESTROYED',
        'HEALTHCHECK_FAILED'
      ].includes(
        String(
          type || ''
        )
          .trim()
          .toUpperCase()
      );
    },
    recoverAttempt:
      performOfflineRendererRecoveryAttempt,
    log
  });

const offlineSelfTestRunner =
  createOfflineSelfTestRunner({
    probeRenderer:
      probeOfflineRendererForSelfTest,
    collectPrerequisites() {
      return evaluateOfflineReadiness(
        null,
        'self-test'
      ).prerequisites;
    },
    log
  });

const offlineAutoRepairRunner =
  createOfflineAutoRepairRunner({
    runSelfTest(
      options
    ) {
      return runOfflineSelfTestAndRecord(
        options
      );
    },
    repairDatabase:
      repairOfflineDatabaseSafely,
    repairCompany:
      repairPreparedOfflineCompanySafely,
    repairServer:
      repairOfflineServerSafely,
    repairRenderer:
      repairOfflineRendererSafely,
    maxPasses: 2,
    log
  });

offlineDiagnosticReportService =
  createOfflineDiagnosticReportService({
    fs,
    path,
    getUserDataDir() {
      return app.getPath(
        'userData'
      );
    },
    getRuntimeInfo() {
      return {
        appVersion:
          VERSION,
        platform:
          process.platform,
        arch:
          process.arch,
        osRelease:
          os.release(),
        electronVersion:
          process.versions
            .electron,
        chromeVersion:
          process.versions.chrome,
        nodeVersion:
          process.versions.node,
        packaged:
          app.isPackaged ===
          true
      };
    },
    maxHistory: 40
  });

offlineTelemetryQueue =
  createOfflineTelemetryQueue({
    fs,
    path,
    getUserDataDir() {
      return app.getPath(
        'userData'
      );
    },
    maxItems: 100,
    maxBytes:
      4 * 1024 * 1024,
    retentionMs:
      30 *
      24 *
      60 *
      60 *
      1000,
    log
  });

offlineTelemetrySender =
  createOfflineTelemetrySender({
    queue:
      offlineTelemetryQueue,
    postAuthenticatedDeviceJson,
    batchSize: 10,
    maxBatchesPerFlush: 3,
    timeoutMs: 10000,
    log
  });

const NAVIGATION_POLICY_CONTEXT =
  navigationPolicyModule.createNavigationPolicyContext({
    onlineUrl: URL_E_FISCO,
    additionalOnlineOrigins:
      TRUSTED_ONLINE_REDIRECT_ORIGINS,
    internalUpdateNavigationUrl: 'efisco-update://start',
    getOfflineOrigin() {
      return (
        offlineUiServer &&
        offlineUiServer.origin
          ? offlineUiServer.origin
          : ''
      );
    }
  });

const ORIGIN_E_FISCO =
  NAVIGATION_POLICY_CONTEXT.onlineOrigin;

const INTERNAL_UPDATE_NAVIGATION_URL =
  NAVIGATION_POLICY_CONTEXT.internalUpdateNavigationUrl;

function isOnlineOriginAllowed(rawUrl) {
  return navigationPolicyModule.isOnlineOriginAllowed(
    rawUrl,
    NAVIGATION_POLICY_CONTEXT
  );
}

function isOfflineOriginAllowed(rawUrl) {
  return navigationPolicyModule.isOfflineOriginAllowed(
    rawUrl,
    NAVIGATION_POLICY_CONTEXT
  );
}

function isInternalNavigationAllowed(rawUrl) {
  return navigationPolicyModule.isInternalNavigationAllowed(
    rawUrl,
    NAVIGATION_POLICY_CONTEXT
  );
}

const MAIN_WINDOW_NAVIGATION_POLICY =
  NAVIGATION_POLICY_CONTEXT.mainWindowPolicy;

const RENDERER_WINDOW_OPEN_POLICY =
  NAVIGATION_POLICY_CONTEXT.rendererWindowOpenPolicy;

const OFFLINE_VIEW_NAVIGATION_POLICY =
  NAVIGATION_POLICY_CONTEXT.offlineViewNavigationPolicy;

function classifyOfflineViewNavigation(rawUrl) {
  return navigationPolicyModule.classifyOfflineViewNavigation(
    rawUrl,
    NAVIGATION_POLICY_CONTEXT
  );
}

function classifyRendererWindowOpen(options = {}) {
  return navigationPolicyModule.classifyRendererWindowOpen(
    options,
    NAVIGATION_POLICY_CONTEXT
  );
}

function classifyMainWindowNavigation(rawUrl) {
  return navigationPolicyModule.classifyMainWindowNavigation(
    rawUrl,
    NAVIGATION_POLICY_CONTEXT
  );
}

function resolveNavigationEventUrl(event, legacyUrl) {
  return navigationPolicyModule.resolveNavigationEventUrl(
    event,
    legacyUrl
  );
}

function resolveNavigationEventIsMainFrame(
  event,
  legacyIsMainFrame
) {
  return navigationPolicyModule.resolveNavigationEventIsMainFrame(
    event,
    legacyIsMainFrame
  );
}

function sanitizeNavigationUrlForLog(rawUrl) {
  return navigationPolicyModule.sanitizeNavigationUrlForLog(
    rawUrl,
    NAVIGATION_POLICY_CONTEXT
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

let offlineUiMode = 'ONLINE';

let offlineSyncIdentity = null;

const authorizationController =
  createAuthorizationController({
    log
  });

const operatorSessionController =
  createOperatorSessionController({
    resolveUniquePreparedEmpresaIdForProvisionedOperator,
    listActiveOfflineOperatorCredentials,
    captureOnlineOperatorIdentity:
      captureOnlineOperatorIdentityForOfflineCache,
    log
  });

const operatorVerifierController =
  createOperatorVerifierController({
    safeStorage,
    crypto,
    log,
    listPreparedOfflineCompanies,
    listActiveOfflineOperatorCredentials,
    getLegacyEmpresaId() {
      return (
        offlineSyncIdentity &&
        offlineSyncIdentity.empresaId
          ? offlineSyncIdentity.empresaId
          : ''
      );
    }
  });

const operatorProvisioningController =
  createOperatorProvisioningController({
    safeStorage,
    crypto,
    log,
    upsertOfflineOperatorCredential,
    listActiveOfflineOperatorCredentials,
    verifierController:
      operatorVerifierController,
    captureOnlineOperatorIdentity:
      captureOnlineOperatorIdentityForOfflineCache,
    rememberConfirmedOnlineOperatorIdentity(
      profile
    ) {
      return operatorSessionController
        .rememberConfirmedOnlineOperatorIdentity(
          profile
        );
    },
    getSyncIdentity() {
      return offlineSyncIdentity;
    },
    postAuthenticatedDeviceJson,
    onOfflineCredentialVerified(
      stored
    ) {
      evaluateOfflineReadiness(
        stored &&
        stored.empresaId,
        'credential-verified'
      );
    }
  });

function persistOfflineDiagnosticReportSafely() {
  if (!offlineDiagnosticReportService) {
    return null;
  }

  try {
    const persisted =
      offlineDiagnosticReportService
        .persist({
          readiness:
            offlineReadinessState,
          selfTest:
            lastOfflineSelfTestReport,
          autoRepair:
            lastOfflineAutoRepairSummary
        });

    const queued =
      enqueueCurrentOfflineTelemetrySafely(
        persisted &&
        persisted.report
      );

    return Object.freeze({
      ...persisted,
      telemetry:
        queued &&
        queued.telemetry ||
        null,
      queue:
        queued &&
        queued.queue ||
        null,
      queueStats:
        getOfflineTelemetryQueueSummary()
    });
  } catch (error) {
    log(
      'OFFLINE DIAGNOSTIC REPORT PERSIST FAILED',
      {
        erro:
          String(
            error &&
            error.message ||
            error
          )
      }
    );

    return null;
  }
}

async function runOfflineSelfTestAndRecord(
  options = {}
) {
  const report =
    await offlineSelfTestRunner
      .run(
        options
      );

  lastOfflineSelfTestReport =
    report;

  if (offlineDiagnosticReportService) {
    offlineDiagnosticReportService
      .record(
        'SELF_TEST',
        {
          status:
            report.status,
          ready:
            report.ready,
          codes:
            report.codes,
          primaryCode:
            report.primaryDiagnostic &&
            report.primaryDiagnostic
              .code ||
            null,
          durationMs:
            report.durationMs
        }
      );
  }

  persistOfflineDiagnosticReportSafely();

  return report;
}

function recordOfflineAutoRepairSummary(
  summary
) {
  lastOfflineAutoRepairSummary =
    summary || null;

  if (
    offlineDiagnosticReportService &&
    summary
  ) {
    offlineDiagnosticReportService
      .record(
        'AUTO_REPAIR',
        {
          status:
            summary.status,
          repaired:
            summary.repaired,
          actions:
            Array.isArray(
              summary.actions
            )
              ? summary.actions
                  .map(
                    (action) =>
                      action &&
                      action.action
                  )
                  .filter(Boolean)
              : [],
          remainingCodes:
            summary.after &&
            Array.isArray(
              summary.after.codes
            )
              ? summary.after.codes
              : []
        }
      );
  }

  persistOfflineDiagnosticReportSafely();

  return summary;
}

function buildCurrentOfflineTelemetryPayload(
  report
) {
  const identity =
    offlineSyncIdentity &&
    typeof offlineSyncIdentity ===
      'object'
      ? offlineSyncIdentity
      : {};

  return buildOfflineTelemetryPayload({
    report,
    identity: {
      deviceId:
        identity.deviceId,
      empresaId:
        identity.empresaId
    },
    maxPayloadBytes:
      48 * 1024,
    maxHistoryEvents:
      20
  });
}

async function flushOfflineTelemetryPending() {
  if (!offlineTelemetrySender) {
    return Object.freeze({
      status:
        'SKIPPED_SENDER_UNAVAILABLE',
      sent: 0,
      accepted: 0,
      deferred: 0,
      pending:
        offlineTelemetryQueue &&
        offlineTelemetryQueue
          .getStats()
          .pendingCount ||
        0
    });
  }

  const identity =
    offlineSyncIdentity &&
    typeof offlineSyncIdentity ===
      'object'
      ? offlineSyncIdentity
      : null;

  if (
    !identity ||
    !identity.deviceId ||
    !identity.deviceToken
  ) {
    return Object.freeze({
      status:
        'SKIPPED_IDENTITY_UNAVAILABLE',
      sent: 0,
      accepted: 0,
      deferred: 0,
      pending:
        offlineTelemetryQueue
          .getStats()
          .pendingCount
    });
  }

  return offlineTelemetrySender
    .flush({
      deviceId:
        identity.deviceId,
      deviceToken:
        identity.deviceToken
    });
}

function getOfflineTelemetryQueueSummary() {
  if (!offlineTelemetryQueue) {
    return null;
  }

  const stats =
    offlineTelemetryQueue
      .getStats();

  return Object.freeze({
    pendingCount:
      stats.pendingCount,
    queueSizeBytes:
      stats.queueSizeBytes,
    maxItems:
      stats.maxItems,
    maxBytes:
      stats.maxBytes,
    retentionMs:
      stats.retentionMs
  });
}

function enqueueCurrentOfflineTelemetrySafely(
  report
) {
  if (
    !offlineTelemetryQueue ||
    !report
  ) {
    return null;
  }

  try {
    const telemetry =
      buildCurrentOfflineTelemetryPayload(
        report
      );

    const queue =
      offlineTelemetryQueue
        .enqueue(
          telemetry.payload
        );

    if (
      !queue ||
      queue.ok !== true
    ) {
      log(
        'OFFLINE TELEMETRY QUEUE REJECTED',
        {
          reason:
            queue &&
            queue.reason ||
            'UNKNOWN'
        }
      );
    } else if (
      queue.action !==
      'COALESCED'
    ) {
      log(
        'OFFLINE TELEMETRY QUEUE UPDATED',
        {
          action:
            queue.action,
          queueId:
            queue.queueId,
          pendingCount:
            queue.pendingCount,
          queueSizeBytes:
            queue.queueSizeBytes,
          codes:
            telemetry.payload
              .state.codes
        }
      );
    }

    return Object.freeze({
      telemetry,
      queue
    });
  } catch (error) {
    log(
      'OFFLINE TELEMETRY QUEUE FAILED',
      {
        erro:
          String(
            error &&
            error.message ||
            error
          )
      }
    );

    return null;
  }
}

async function generateOfflineDiagnosticReport() {
  const selfTest =
    await runOfflineSelfTestAndRecord({
      source:
        'diagnostic-report'
    });

  if (offlineDiagnosticReportService) {
    offlineDiagnosticReportService
      .record(
        'REPORT_GENERATED',
        {
          ready:
            selfTest.ready,
          codes:
            selfTest.codes
        }
      );
  }

  const persisted =
    persistOfflineDiagnosticReportSafely() ||
    {
      path: null,
      report: null,
      telemetry: null,
      queue: null,
      queueStats:
        getOfflineTelemetryQueueSummary()
    };

  return Object.freeze({
    path:
      persisted.path ||
      null,
    report:
      persisted.report ||
      null,
    telemetry:
      persisted.telemetry ||
      null,
    queue:
      persisted.queue ||
      null,
    queueStats:
      persisted.queueStats ||
      getOfflineTelemetryQueueSummary()
  });
}

async function repairOfflineDatabaseSafely() {
  let currentDb = null;

  try {
    currentDb =
      getOfflineDatabase();
  } catch (_) {
    currentDb = null;
  }

  if (currentDb) {
    return {
      success: false,
      reason:
        'DATABASE_CONNECTION_PRESENT'
    };
  }

  const info =
    initializeOfflineDatabase({
      userDataDir:
        app.getPath(
          'userData'
        )
    });

  const success =
    Boolean(
      info &&
      info.ok === true &&
      probeOfflineDatabase() ===
        true
    );

  return {
    success,
    reason:
      success
        ? 'DATABASE_REINITIALIZED'
        : 'DATABASE_REINITIALIZE_FAILED'
  };
}

async function repairPreparedOfflineCompanySafely({
  report
} = {}) {
  const empresaId =
    String(
      report &&
      (
        report.empresaId ||
        (
          report.checks &&
          report.checks.company &&
          report.checks.company
            .empresaId
        )
      ) ||
      ''
    ).trim();

  if (!empresaId) {
    return {
      success: false,
      reason:
        'EMPRESA_ID_UNAVAILABLE'
    };
  }

  const prepared =
    registerPreparedOfflineCompanyFromLocalState(
      empresaId,
      {
        requireActiveCredential:
          true,
        onlyIfMissing:
          true
      }
    );

  return {
    success:
      Boolean(
        prepared
      ),
    reason:
      prepared
        ? 'COMPANY_PREPARED_FROM_LOCAL_STATE'
        : 'COMPANY_LOCAL_STATE_INSUFFICIENT'
  };
}

async function repairOfflineServerSafely() {
  offlineRendererRecoveryController
    .cancel(
      'auto-repair-server-restart'
    );

  const previousServer =
    offlineUiServer;

  offlineUiServer =
    null;

  if (
    previousServer &&
    typeof previousServer.close ===
      'function'
  ) {
    try {
      await previousServer
        .close();
    } catch (error) {
      log(
        'OFFLINE AUTO REPAIR SERVER CLOSE DEFERRED',
        {
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

  offlineViewReady = false;

  offlineRendererHealthState
    .clear(
      'SERVER_RESTART'
    );

  const startedServer =
    await startOfflineUiServer();

  offlineUiServer =
    startedServer;

  const listening =
    Boolean(
      startedServer &&
      typeof startedServer
        .isListening ===
          'function' &&
      startedServer
        .isListening()
    );

  if (!listening) {
    return {
      success: false,
      reason:
        'SERVER_RESTART_FAILED'
    };
  }

  const rendererRecovered =
    await performOfflineRendererRecoveryAttempt({
      type:
        'HEALTHCHECK_FAILED',
      attempt: 1
    });

  return {
    success:
      rendererRecovered ===
      true,
    reason:
      rendererRecovered ===
        true
        ? 'SERVER_AND_RENDERER_RESTARTED'
        : 'SERVER_RESTARTED_RENDERER_NOT_READY'
  };
}

async function repairOfflineRendererSafely() {
  offlineViewReady = false;

  offlineRendererHealthState
    .markUnhealthy(
      offlineView,
      'AUTO_REPAIR_REQUESTED'
    );

  const result =
    await offlineRendererRecoveryController
      .start({
        type:
          'HEALTHCHECK_FAILED',
        source:
          'auto-repair'
      });

  return {
    success:
      Boolean(
        result &&
        result.recovered ===
          true
      ),
    reason:
      result &&
      result.reason
        ? String(
            result.reason
          )
        : 'RENDERER_RECOVERY_NOT_COMPLETED'
  };
}

async function probeOfflineRendererForSelfTest() {
  const viewRef =
    offlineView;

  if (
    !viewRef ||
    !viewRef.webContents ||
    viewRef.webContents.isDestroyed()
  ) {
    return {
      attempted: false,
      ok: false,
      reason:
        'RENDERER_UNAVAILABLE'
    };
  }

  if (
    offlineRendererRecoveryController
      .isRunning()
  ) {
    return {
      attempted: false,
      ok: null,
      reason:
        'RENDERER_RECOVERY_IN_PROGRESS'
    };
  }

  const health =
    await checkOfflineViewHealth({
      offlineView:
        viewRef,
      expectedVersion:
        VERSION,
      timeoutMs:
        2000,
      pollIntervalMs:
        100
    });

  if (
    offlineView !== viewRef
  ) {
    return {
      attempted: true,
      ok: false,
      reason:
        'VIEW_REPLACED_DURING_TEST'
    };
  }

  if (
    health &&
    health.ok === true
  ) {
    offlineRendererHealthState
      .markHealthy(
        viewRef,
        {
          source:
            'self-test',
          health
        }
      );

    return {
      attempted: true,
      ok: true,
      reason:
        'HEALTHY',
      shellReady:
        health.shellReady ===
        true,
      preloadReady:
        health.preloadReady ===
        true,
      pdvReady:
        health.pdvReady ===
        true,
      pdvMarkerReady:
        health.pdvMarkerReady ===
        true,
      pdvScriptReady:
        health.pdvScriptReady ===
        true
    };
  }

  offlineRendererHealthState
    .markUnhealthy(
      viewRef,
      'HEALTHCHECK_FAILED',
      {
        healthReason:
          health &&
          health.reason ||
          'UNKNOWN'
      }
    );

  return {
    attempted: true,
    ok: false,
    reason:
      health &&
      health.reason ||
      'HEALTHCHECK_FAILED',
    shellReady:
      Boolean(
        health &&
        health.lastSnapshot &&
        health.lastSnapshot
          .shellReady
      ),
    preloadReady:
      Boolean(
        health &&
        health.lastSnapshot &&
        health.lastSnapshot
          .preloadReady
      ),
    pdvReady:
      Boolean(
        health &&
        health.lastSnapshot &&
        health.lastSnapshot
          .pdvReady
      ),
    pdvMarkerReady:
      Boolean(
        health &&
        health.lastSnapshot &&
        health.lastSnapshot
          .pdvMarkerReady
      ),
    pdvScriptReady:
      Boolean(
        health &&
        health.lastSnapshot &&
        health.lastSnapshot
          .pdvScriptReady
      )
  };
}

function collectOfflinePrerequisitesForRuntime(
  empresaIdValue = null
) {
  const rendererHealth =
    offlineRendererHealthState
      .snapshot(
        offlineView
      );

  const rendererRecoveryRunning =
    offlineRendererRecoveryController
      .isRunning();

  return collectOfflinePrerequisiteDiagnostics({
    getDatabase:
      getOfflineDatabase,
    probeDatabase() {
      return (
        probeOfflineDatabase() ===
        true
      );
    },
    empresaIdValue:
      String(
        empresaIdValue || ''
      ).trim(),
    resolveEmpresaId(
      db
    ) {
      return (
        (
          offlineSyncIdentity &&
          offlineSyncIdentity.empresaId
        ) ||
        getSyncEmpresaId({
          db
        }) ||
        ''
      );
    },
    getPreparedCompany:
      getPreparedOfflineCompany,
    listActiveCredentials:
      listActiveOfflineOperatorCredentials,
    verifyCredential(
      credential
    ) {
      return (
        operatorProvisioningController
          .verifyStoredOfflineCredential(
            credential,
            {
              silent: true
            }
          ) === true
      );
    },
    safeStorage,
    offlineUiServer,
    offlineView,
    offlineViewReady,
    rendererHealth,
    rendererRecoveryRunning
  });
}

function evaluateOfflineReadiness(
  empresaIdValue = null,
  source = 'runtime'
) {
  const prerequisites =
    collectOfflinePrerequisitesForRuntime(
      empresaIdValue
    );

  offlinePrerequisiteDiagnosticsState =
    prerequisites;

  const reasons =
    prerequisites.failed
      .map(
        (name) =>
          prerequisites.checks[
            name
          ] &&
          prerequisites.checks[
            name
          ].reason
      )
      .filter(Boolean);

  if (
    offlineRendererFailureState &&
    offlineRendererFailureState.type
  ) {
    reasons.push(
      'RENDERER_' +
      String(
        offlineRendererFailureState.type
      )
        .replace(
          /[^A-Z0-9_]/gi,
          '_'
        )
        .toUpperCase()
    );
  }

  const checks =
    Object.freeze({
      database:
        prerequisites.checks
          .database.ok === true,
      preparedCompany:
        prerequisites.checks
          .company.ok === true,
      safeStorage:
        prerequisites.checks
          .safeStorage.ok === true,
      credential:
        prerequisites.checks
          .credential.ok === true,
      server:
        prerequisites.checks
          .server.ok === true,
      renderer:
        prerequisites.checks
          .renderer.ok === true
    });

  const rendererHealth =
    offlineRendererHealthState
      .snapshot(
        offlineView
      );

  const rendererRecoveryRunning =
    offlineRendererRecoveryController
      .isRunning();

  offlineReadinessState =
    Object.freeze({
      status:
        prerequisites.ready
          ? 'OFFLINE_READY'
          : 'OFFLINE_NOT_READY',
      empresaId:
        prerequisites.empresaId ||
        null,
      operadorId:
        prerequisites.operadorId ||
        null,
      checkedAt:
        prerequisites.checkedAt,
      source:
        String(
          source || 'runtime'
        ),
      checks,
      reasons:
        Object.freeze([
          ...new Set(
            reasons
          )
        ]),
      rendererFailure:
        offlineRendererFailureState
          ? Object.freeze({
              ...offlineRendererFailureState
            })
          : null,
      rendererHealth,
      rendererRecoveryRunning,
      diagnosticCodes:
        Object.freeze([
          ...new Set(
            prerequisites.issues
              .map(
                (issue) =>
                  issue.code
              )
          )
        ]),
      primaryDiagnostic:
        prerequisites.primaryIssue,
      prerequisites
    });

  const fingerprint =
    JSON.stringify({
      status:
        prerequisites.status,
      failed:
        prerequisites.failed,
      reasons:
        offlineReadinessState.reasons
    });

  if (
    fingerprint !==
    offlinePrerequisiteDiagnosticsFingerprint
  ) {
    offlinePrerequisiteDiagnosticsFingerprint =
      fingerprint;

    const diagnosticCodes =
      [
        ...new Set(
          prerequisites.issues
            .map(
              (issue) =>
                issue.code
            )
        )
      ];

    const primaryCode =
      prerequisites.primaryIssue &&
      prerequisites.primaryIssue.code ||
      null;

    log(
      'OFFLINE PREREQUISITE DIAGNOSTICS',
      {
        status:
          prerequisites.status,
        failed:
          prerequisites.failed,
        codes:
          diagnosticCodes,
        primaryCode,
        checks: {
          database:
            prerequisites.checks
              .database.reason,
          company:
            prerequisites.checks
              .company.reason,
          safeStorage:
            prerequisites.checks
              .safeStorage.reason,
          credential:
            prerequisites.checks
              .credential.reason,
          server:
            prerequisites.checks
              .server.reason,
          renderer:
            prerequisites.checks
              .renderer.reason
        }
      }
    );

    if (offlineDiagnosticReportService) {
      offlineDiagnosticReportService
        .record(
          'READINESS_CHANGE',
          {
            status:
              offlineReadinessState.status,
            source:
              offlineReadinessState.source,
            codes:
              diagnosticCodes,
            primaryCode
          }
        );

      persistOfflineDiagnosticReportSafely();
    }
  }

  log(
    offlineReadinessState.status,
    offlineReadinessState
  );

  return offlineReadinessState;
}

function markOfflineRendererFailure(
  viewRef,
  diagnostic = {}
) {
  if (
    !viewRef ||
    offlineView !== viewRef
  ) {
    return false;
  }

  const type =
    String(
      diagnostic &&
      diagnostic.type ||
      'UNKNOWN'
    )
      .trim()
      .toUpperCase() ||
    'UNKNOWN';

  const standardizedDiagnostic =
    resolveOfflineUiFailureDiagnostic(
      type
    );

  offlineViewReady = false;

  offlineRendererHealthState
    .markUnhealthy(
      viewRef,
      type,
      diagnostic &&
      typeof diagnostic === 'object'
        ? diagnostic
        : null
    );

  offlineRendererFailureState =
    Object.freeze({
      detectedAt:
        new Date()
          .toISOString(),
      ...(
        diagnostic &&
        typeof diagnostic === 'object'
          ? diagnostic
          : {}
      ),
      type,
      code:
        standardizedDiagnostic.code,
      category:
        standardizedDiagnostic.category,
      severity:
        standardizedDiagnostic.severity,
      message:
        standardizedDiagnostic.message
    });

  log(
    'OFFLINE RENDERER FAILURE',
    offlineRendererFailureState
  );

  if (offlineDiagnosticReportService) {
    offlineDiagnosticReportService
      .record(
        'RENDERER_FAILURE',
        {
          code:
            offlineRendererFailureState.code,
          failureType:
            type,
          severity:
            offlineRendererFailureState.severity
        }
      );

    persistOfflineDiagnosticReportSafely();
  }

  evaluateOfflineReadiness(
    null,
    'renderer-failure:' +
    type.toLowerCase()
  );

  if (
    offlineUiMode ===
      'OFFLINE' ||
    offlineUiMode ===
      'SWITCHING_OFFLINE'
  ) {
    void showOfflineDiagnosticOverlay(
      offlineRendererFailureState
    );
  }

  void offlineRendererRecoveryController
    .start(
      offlineRendererFailureState
    )
    .then(
      (summary) => {
        evaluateOfflineReadiness(
          null,
          summary &&
          summary.recovered === true
            ? 'renderer-recovery-complete'
            : 'renderer-recovery-ended'
        );
      }
    )
    .catch(
      (error) => {
        log(
          'OFFLINE RENDERER RECOVERY CONTROLLER FAILED',
          {
            type,
            erro:
              String(
                error &&
                error.message ||
                error
              )
          }
        );

        evaluateOfflineReadiness(
          null,
          'renderer-recovery-controller-failed'
        );
      }
    );

  return true;
}

async function showOfflineDiagnosticOverlay(
  diagnostic = {},
  {
    force = false
  } = {}
) {
  if (
    !shouldShowDiagnosticOverlay(
      offlineUiMode,
      {
        force
      }
    )
  ) {
    return false;
  }

  if (
    !mainWindow ||
    mainWindow.isDestroyed()
  ) {
    return false;
  }

  const generation =
    offlineDiagnosticGeneration +
    1;

  offlineDiagnosticGeneration =
    generation;

  const previous =
    offlineDiagnosticView;

  offlineDiagnosticView =
    null;
  offlineDiagnosticViewAttached =
    false;

  closeOfflineDiagnosticView(
    previous
  );

  const type =
    String(
      diagnostic &&
      diagnostic.type ||
      'UNKNOWN'
    )
      .trim()
      .toUpperCase() ||
    'UNKNOWN';

  const uiDiagnostic =
    resolveOfflineUiFailureDiagnostic(
      type
    );

  const code =
    String(
      diagnostic &&
      diagnostic.code ||
      uiDiagnostic.code
    );

  const view =
    createOfflineDiagnosticView({
      userAgent:
        chromeUserAgent()
    });

  try {
    if (
      view.webContents &&
      typeof view.webContents
        .setWindowOpenHandler ===
          'function'
    ) {
      view.webContents
        .setWindowOpenHandler(
          () => ({
            action: 'deny'
          })
        );
    }

    await loadOfflineDiagnosticView({
      diagnosticView:
        view,
      userAgent:
        chromeUserAgent(),
      diagnostic: {
        code,
        type,
        version:
          VERSION,
        detectedAt:
          diagnostic &&
          diagnostic.detectedAt ||
          new Date()
            .toISOString(),
        title:
          'Modo offline indisponível',
        message:
          String(
            diagnostic &&
            diagnostic.message ||
            uiDiagnostic.message
          ),
        detail:
          String(
            diagnostic &&
            diagnostic.detail ||
            ''
          )
      }
    });

    if (
      generation !==
        offlineDiagnosticGeneration ||
      !mainWindow ||
      mainWindow.isDestroyed()
    ) {
      closeOfflineDiagnosticView(
        view
      );
      return false;
    }

    attachOfflineDiagnosticView({
      mainWindow,
      diagnosticView:
        view
    });

    offlineDiagnosticView =
      view;
    offlineDiagnosticViewAttached =
      true;

    view.setBounds(
      offlineOverlayBounds()
    );

    log(
      'OFFLINE DIAGNOSTIC VIEW SHOWN',
      {
        code,
        type
      }
    );

    return true;
  } catch (error) {
    closeOfflineDiagnosticView(
      view
    );

    log(
      'OFFLINE DIAGNOSTIC VIEW FAILED',
      {
        code,
        type,
        erro:
          String(
            error &&
            error.message ||
            error
          )
      }
    );

    return false;
  }
}

function hideOfflineDiagnosticOverlay() {
  offlineDiagnosticGeneration +=
    1;

  const current =
    offlineDiagnosticView;

  offlineDiagnosticView =
    null;
  offlineDiagnosticViewAttached =
    false;

  closeOfflineDiagnosticView(
    current
  );

  return Boolean(
    current
  );
}

function resizeOfflineDiagnosticOverlay() {
  if (
    !offlineDiagnosticView ||
    !offlineDiagnosticViewAttached ||
    !offlineDiagnosticView.webContents ||
    offlineDiagnosticView.webContents
      .isDestroyed()
  ) {
    return false;
  }

  try {
    offlineDiagnosticView.setBounds(
      offlineOverlayBounds()
    );
    return true;
  } catch (_) {
    return false;
  }
}

async function checkOfflineRendererHealthContinuously() {
  if (offlineRendererHealthCheckInFlight) {
    return offlineRendererHealthCheckInFlight;
  }

  const viewRef =
    offlineView;

  if (
    !viewRef ||
    !offlineViewReady ||
    !viewRef.webContents ||
    viewRef.webContents.isDestroyed()
  ) {
    offlineRendererHealthState
      .markUnhealthy(
        viewRef,
        'VIEW_NOT_READY'
      );

    evaluateOfflineReadiness(
      null,
      'renderer-health-view-not-ready'
    );

    return false;
  }

  if (
    offlineRendererRecoveryController
      .isRunning()
  ) {
    evaluateOfflineReadiness(
      null,
      'renderer-health-recovery-in-progress'
    );
    return false;
  }

  const run =
    Promise.resolve()
      .then(
        async () => {
          const health =
            await checkOfflineViewHealth({
              offlineView:
                viewRef,
              expectedVersion:
                VERSION,
              timeoutMs:
                2000,
              pollIntervalMs:
                100
            });

          if (
            offlineView !== viewRef
          ) {
            return false;
          }

          if (
            health &&
            health.ok === true
          ) {
            offlineRendererHealthState
              .markHealthy(
                viewRef,
                {
                  source:
                    'runtime-healthcheck',
                  health
                }
              );

            evaluateOfflineReadiness(
              null,
              'renderer-health-ok'
            );

            return true;
          }

          offlineRendererHealthState
            .markUnhealthy(
              viewRef,
              'HEALTHCHECK_FAILED',
              health || null
            );

          markOfflineRendererFailure(
            viewRef,
            {
              type:
                'HEALTHCHECK_FAILED',
              healthReason:
                health &&
                health.reason ||
                'UNKNOWN',
              lastSnapshot:
                health &&
                health.lastSnapshot ||
                null,
              lastError:
                health &&
                health.lastError ||
                null
            }
          );

          return false;
        }
      );

  const trackedRun =
    run.finally(
      () => {
        if (
          offlineRendererHealthCheckInFlight ===
          trackedRun
        ) {
          offlineRendererHealthCheckInFlight =
            null;
        }
      }
    );

  offlineRendererHealthCheckInFlight =
    trackedRun;

  return trackedRun;
}

async function performOfflineRendererRecoveryAttempt({
  type,
  attempt
} = {}) {
  if (
    !mainWindow ||
    mainWindow.isDestroyed()
  ) {
    throw new Error(
      'Janela principal indisponível para recuperação offline.'
    );
  }

  if (!offlineUiServer) {
    throw new Error(
      'Servidor local offline indisponível para recuperação.'
    );
  }

  log(
    'OFFLINE RENDERER RECOVERY REBUILD START',
    {
      type:
        String(
          type || 'UNKNOWN'
        ),
      attempt:
        Number(attempt) || 0,
      mode:
        offlineUiMode
    }
  );

  const rebuiltView =
    await ensureOfflineView();

  if (
    !rebuiltView ||
    rebuiltView !== offlineView ||
    !offlineViewReady ||
    !rebuiltView.webContents ||
    rebuiltView.webContents
      .isDestroyed()
  ) {
    throw new Error(
      'Renderer offline recriado sem estado saudável.'
    );
  }

  if (
    offlineUiMode ===
      'OFFLINE'
  ) {
    const authenticatedOperator =
      getOfflineAuthenticatedOperator();

    const authApplied =
      await setOfflineShellAuthenticationState(
        authenticatedOperator ||
        null
      );

    if (
      authenticatedOperator &&
      authApplied !== true
    ) {
      throw new Error(
        'Sessão offline não pôde ser reaplicada após reconstrução.'
      );
    }

    const continuityDraft =
      getOfflineContinuityDraft();

    if (
      continuityDraft &&
      typeof continuityDraft ===
        'object'
    ) {
      const restored =
        await restoreOfflineContinuityDraft(
          continuityDraft
        );

      if (restored !== true) {
        log(
          'OFFLINE RENDERER RECOVERY CONTINUITY DEFERRED',
          {
            type:
              String(
                type || 'UNKNOWN'
              ),
            attempt:
              Number(attempt) || 0
          }
        );
      }
    }

    try {
      await refreshOfflineNfceNumberDisplay();
    } catch (error) {
      log(
        'OFFLINE RENDERER RECOVERY NFCE REFRESH DEFERRED',
        {
          erro:
            String(
              error &&
              error.message ||
              error
            )
        }
      );
    }

    await settleOfflineRendererBeforeReveal();

    if (
      !showOfflineOverlay()
    ) {
      throw new Error(
        'Renderer offline recuperado não pôde ser exibido.'
      );
    }

    syncOfflineFunctionShortcuts();
  }

  hideOfflineDiagnosticOverlay();

  evaluateOfflineReadiness(
    null,
    'renderer-recovered'
  );

  return true;
}

async function recheckOfflineRendererAfterResponsive(
  viewRef
) {
  if (
    !viewRef ||
    offlineView !== viewRef ||
    !viewRef.webContents ||
    viewRef.webContents.isDestroyed()
  ) {
    return false;
  }

  log(
    'OFFLINE RENDERER RESPONSIVE',
    {
      previousFailure:
        offlineRendererFailureState &&
        offlineRendererFailureState.type ||
        null
    }
  );

  if (
    !offlineRendererFailureState ||
    offlineRendererFailureState.type !==
      'UNRESPONSIVE'
  ) {
    return true;
  }

  const health =
    await checkOfflineViewHealth({
      offlineView:
        viewRef,
      expectedVersion:
        VERSION,
      timeoutMs:
        2500,
      pollIntervalMs:
        100
    });

  if (
    offlineView !== viewRef
  ) {
    return false;
  }

  if (
    health &&
    health.ok === true
  ) {
    offlineRendererFailureState =
      null;

    offlineRendererHealthState
      .markHealthy(
        viewRef,
        {
          source:
            'responsive-recheck',
          health
        }
      );

    offlineViewReady =
      true;

    log(
      'OFFLINE RENDERER RESPONSIVE HEALTHCHECK PASSED',
      {
        version:
          health.preloadVersion ||
          null,
        pdvReady:
          health.pdvReady === true,
        pdvScriptReady:
          health.pdvScriptReady ===
          true
      }
    );

    evaluateOfflineReadiness(
      null,
      'renderer-responsive'
    );

    hideOfflineDiagnosticOverlay();

    return true;
  }

  return markOfflineRendererFailure(
    viewRef,
    {
      type:
        'RESPONSIVE_HEALTHCHECK_FAILED',
      healthReason:
        health &&
        health.reason ||
        'UNKNOWN',
      lastSnapshot:
        health &&
        health.lastSnapshot ||
        null,
      lastError:
        health &&
        health.lastError ||
        null
    }
  );
}

const fiscalRuntimeCoordinator =
  createFiscalRuntimeCoordinator({
    enabled:
      ENABLE_REAL_SVRS_FISCAL_TRANSMISSION,
    resolveSyncIdentity:
      resolveOfflineOperationSyncIdentity,
    getFiscalProfileCache,
    peekNextNfceNumber,
    reconcileLocalNfceCounter,
    runFiscalReconnectCycle,
    getUserDataDir() {
      return app.getPath(
        'userData'
      );
    },
    safeStorage,
    log
  });

const productCacheCoordinator =
  createProductCacheCoordinator({
    pullSyncReferences,
    upsertReferenceBatch,
    buildFiscalCounterSyncPayload(
      empresaId,
      deviceId
    ) {
      return fiscalRuntimeCoordinator
        .buildCounterSyncPayload(
          empresaId,
          deviceId
        );
    },
    reconcileFiscalCounterFromReference(
      empresaId,
      deviceId,
      fiscalProfile
    ) {
      return fiscalRuntimeCoordinator
        .reconcileCounterFromReference(
          empresaId,
          deviceId,
          fiscalProfile
        );
    }
  });

const referenceCacheCoordinator =
  createReferenceCacheCoordinator({
    crypto,
    pullSyncReferences,
    upsertReferenceBatch,
    finalizeCrediariosSnapshot,
    buildFiscalCounterSyncPayload(
      empresaId,
      deviceId
    ) {
      return fiscalRuntimeCoordinator
        .buildCounterSyncPayload(
          empresaId,
          deviceId
        );
    },
    reconcileFiscalCounterFromReference(
      empresaId,
      deviceId,
      fiscalProfile
    ) {
      return fiscalRuntimeCoordinator
        .reconcileCounterFromReference(
          empresaId,
          deviceId,
          fiscalProfile
        );
    },
    markProductSyncedAt(
      value
    ) {
      return productCacheCoordinator
        .markSyncedAt(
          value
        );
    },
    log
  });

const outboxCoordinator =
  createOutboxCoordinator({
    resolveSyncIdentity:
      resolveOfflineOperationSyncIdentity,
    getAuthorizationState() {
      return authorizationController
        .getState();
    },
    getOutboxStatusSummary,
    listAuthorizedNfcePendingSync,
    enqueueOutboxOperation,
    createHttpSyncTransport,
    processOutboxOnce,
    log
  });

const fiscalCounterBridge =
  createFiscalCounterBridge({
    responseEventName:
      FRAME_NFCE_COUNTER_RESPONSE_EVENT,
    getMainWindow() {
      return mainWindow;
    },
    findTrustedPdvFrame:
      findPdvContinuityFrame,
    getOfflineDatabase,
    getSyncEmpresaId,
    getSyncIdentity() {
      return offlineSyncIdentity;
    },
    getOrCreateSyncDeviceId,
    getFiscalProfileCache,
    peekNextNfceNumber,
    consumeNextNfceNumber,
    log
  });

const OFFLINE_RUNTIME_INTERVAL_MS = 5_000;

const OFFLINE_FAILURE_THRESHOLD = 3;

const OFFLINE_RECOVERY_THRESHOLD = 3;

const OFFLINE_WIX_PROBE_TIMEOUT_MS = 7_000;
const OFFLINE_STARTUP_PROBE_TIMEOUT_MS = 900;
const OFFLINE_CONTINUITY_MIRROR_MS = 500;

let failoverController = null;
let runtimeController = null;

function requestNavigatorOfflineFailover() {
  return (
    failoverController &&
    failoverController
      .requestNavigatorOfflineFailover()
  ) === true;
}

const continuityMirrorController =
  createContinuityMirrorController({
    intervalMs:
      OFFLINE_CONTINUITY_MIRROR_MS,
    getMainWindow() {
      return mainWindow;
    },
    findPdvContinuityFrame,
    getOfflineUiMode() {
      return offlineUiMode;
    },
    getPendingUpdateVersion:
      getVersaoAtualizacaoPendente,
    getPendingVerifierCandidate:
      getPendingOfflineOperatorVerifierCandidate,
    persistPendingCredential:
      persistPendingOfflineOperatorCredentialAfterOnlineLogin,
    refreshConfirmedOnlineIdentity:
      refreshConfirmedOnlineOperatorIdentityFromLivePage,
    getAuthenticatedOperator:
      getOfflineAuthenticatedOperator,
    getFailoverOnlineOperatorIdentity() {
      return failoverController
        ? failoverController
            .getOnlineOperatorIdentity()
        : null;
    },
    getLastConfirmedOnlineOperatorIdentity:
      getLastConfirmedOnlineOperatorIdentity,
    listOfflineProductsForSale,
    requestNavigatorOfflineFailover,
    log
  });

const continuityRecoveryController =
  createContinuityRecoveryController({
    getMainWindow() {
      return mainWindow;
    },
    getOfflineView() {
      return offlineView;
    },
    isOfflineViewReady() {
      return offlineViewReady;
    },
    findPdvContinuityFrame,
    log
  });

const offlineUiRuntime =
  createOfflineUiRuntime({
    getMainWindow() {
      return mainWindow;
    },
    getOfflineView() {
      return offlineView;
    },
    isOfflineViewReady() {
      return offlineViewReady;
    },
    isOfflineViewAttached() {
      return offlineViewAttached;
    },
    setOfflineViewAttached(
      value
    ) {
      offlineViewAttached =
        value === true;
    },
    attachOfflineView,
    resizeOfflineOverlay() {
      return windowLayoutModule
        .resizeOfflineOverlay({
          mainWindow,
          offlineView,
          offlineViewReady,
          offlineUiMode
        });
    },
    offlineParkedBounds() {
      return windowLayoutModule
        .offlineParkedBounds(
          mainWindow
        );
    },
    log
  });

const offlineShortcutController =
  createOfflineShortcutController({
    globalShortcut,
    getUiMode() {
      return offlineUiMode;
    },
    getMainWindow() {
      return mainWindow;
    },
    getOfflineView() {
      return offlineView;
    },
    getAuthenticatedOperator:
      getOfflineAuthenticatedOperator,
    log
  });

const connectivityProbes =
  createConnectivityProbes({
    net,
    https,
    onlineUrl:
      URL_E_FISCO,
    userAgent:
      chromeUserAgent,
    pingSyncDevice,
    getSyncIdentity() {
      return offlineSyncIdentity;
    },
    setSyncEmpresaId(
      empresaId
    ) {
      if (
        offlineSyncIdentity
      ) {
        offlineSyncIdentity
          .empresaId =
          empresaId;
      }
    },
    setAuthorizationValid() {
      authorizationController
        .setState(
          'VALID'
        );
    },
    isOfflineAuthFailure:
      offlineAuthFailure,
    markOfflineAuthInvalid:
      marcarOfflineAuthInvalida,
    wixProbeTimeoutMs:
      OFFLINE_WIX_PROBE_TIMEOUT_MS,
    startupProbeTimeoutMs:
      OFFLINE_STARTUP_PROBE_TIMEOUT_MS,
    syncProbeTimeoutMs:
      10_000
  });

failoverController =
  createFailoverController({
    session,
    failureThreshold:
      OFFLINE_FAILURE_THRESHOLD,
    getOfflineUiServer() {
      return offlineUiServer;
    },
    getMainWindow() {
      return mainWindow;
    },
    getOfflineView() {
      return offlineView;
    },
    isOfflineViewReady() {
      return offlineViewReady;
    },
    isOfflineViewAttached() {
      return offlineViewAttached;
    },
    getOfflineUiMode() {
      return offlineUiMode;
    },
    setOfflineUiMode(
      mode
    ) {
      offlineUiMode =
        mode;
    },
    isAuthorizationInvalid() {
      return (
        authorizationController
          .getState() ===
        'INVALID'
      );
    },
    assertOfflineMutationAuthorized,
    ensureOfflineView,
    offlineStagingBounds,
    captureOnlineContinuityDraft,
    setOfflineContinuityDraft,
    getOfflineContinuityDraft,
    recentConfirmedOnlineOperatorIdentity,
    captureOnlineOperatorIdentity:
      captureOnlineOperatorIdentityForOfflineCache,
    rememberConfirmedOnlineOperatorIdentity,
    captureOnlineOperatorProfile,
    resolveOfflineOperatorProfileForSession,
    normalizeOfflineAuthenticatedOperator,
    applyOfflineOperatorProfile,
    setOfflineAuthenticatedOperator,
    clearOfflineAuthenticatedOperator,
    setOfflineShellAuthenticationState,
    restoreOfflineContinuityDraft,
    refreshOfflineNfceNumberDisplay,
    settleOfflineRendererBeforeReveal,
    showOfflineOverlay,
    hideOfflineOverlay,
    resetRecoverySuccessCount() {
      if (runtimeController) {
        runtimeController
          .resetRecoverySuccessCount();
      }
    },
    syncOfflineFunctionShortcuts,
    unregisterOfflineFunctionShortcuts,
    log
  });

runtimeController =
  createOfflineRuntimeController({
    runtimeIntervalMs:
      OFFLINE_RUNTIME_INTERVAL_MS,
    recoveryThreshold:
      OFFLINE_RECOVERY_THRESHOLD,
    getMainWindow() {
      return mainWindow;
    },
    getUiMode() {
      return offlineUiMode;
    },
    setUiMode(
      mode
    ) {
      offlineUiMode =
        mode;
    },
    getPendingUpdateVersion:
      getVersaoAtualizacaoPendente,
    probeWixReachable,
    probeSyncReachable,
    checkOfflineRendererHealth:
      checkOfflineRendererHealthContinuously,
    getSyncIdentity() {
      return offlineSyncIdentity;
    },
    flushOfflineTelemetryPending,
    failoverController,
    switchToOfflineUi,
    refreshRemoteCashState,
    syncOutboxPending,
    activeOutboxCount,
    syncOfflineProductCacheCoalesced,
    syncOfflineF5ReferenceCacheCoalesced,
    maintainOfflineFiscalLeaseInventory,
    logFiscalLeaseMaintenance,
    maintainOfflineFiscalTransmission,
    logFiscalTransmissionSummary,
    isOfflineAuthFailure:
      offlineAuthFailure,
    markOfflineAuthInvalid:
      marcarOfflineAuthInvalida,
    resolveOfflineOperationSyncIdentity,
    offlineHasActiveContinuitySale,
    unregisterOfflineFunctionShortcuts,
    syncOfflineFunctionShortcuts,
    getOfflineContinuityDraft,
    clearOnlineContinuityDraft,
    getFiscalProfileCache,
    captureOnlineOperatorIdentity:
      captureOnlineOperatorIdentityForOfflineCache,
    getOfflineAuthenticatedOperator,
    getFailoverOnlineOperatorIdentity() {
      return failoverController
        .getOnlineOperatorIdentity();
    },
    async reloadOnlinePage() {
      if (
        !mainWindow ||
        mainWindow.isDestroyed()
      ) {
        throw new Error(
          'Janela online indisponível para recovery.'
        );
      }

      return mainWindow
        .loadURL(
          URL_E_FISCO,
          {
            userAgent:
              chromeUserAgent()
          }
        );
    },
    buildFiscalCounterSyncPayload,
    primeOnlineNfceNumberDisplay,
    queryOnlineNfceNumberForRecovery,
    normalizeOnlinePdvUnitValueHeader,
    clearOfflineContinuityDraftState,
    refreshOnlineNfceNumberDisplay,
    hideOfflineOverlay,
    showOfflineOverlay,
    clearOfflineAuthenticatedOperator,
    clearFailoverOnlineOperatorIdentity() {
      failoverController
        .clearOnlineOperatorIdentity();
    },
    setOfflineShellAuthenticationState,
    log
  });

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
  const authenticatedOperator =
    getOfflineAuthenticatedOperator();

  const authenticatedEmpresaId =
    String(
      authenticatedOperator &&
      authenticatedOperator.empresaId ||
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

  const authenticatedOperator =
    getOfflineAuthenticatedOperator();
  const deviceId = String(root.deviceId || '').trim();
  const empresaId = String(
    authenticatedOperator &&
    authenticatedOperator.empresaId ||
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
  return fiscalRuntimeCoordinator
    .buildCounterSyncPayload(
      empresaId,
      deviceId
    );
}

function reconcileFiscalCounterFromReference(
  empresaId,
  deviceId,
  fiscalProfile
) {
  return fiscalRuntimeCoordinator
    .reconcileCounterFromReference(
      empresaId,
      deviceId,
      fiscalProfile
    );
}

async function syncOfflineReferenceCache(
  options = {}
) {
  return referenceCacheCoordinator
    .syncAll(
      options
    );
}

function storeProvisionedOfflineCredentialFromBootstrap(
  empresaIdValue,
  credentialValue
) {
  return operatorProvisioningController
    .storeProvisionedOfflineCredentialFromBootstrap(
      empresaIdValue,
      credentialValue
    );
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

  evaluateOfflineReadiness(
    rootEmpresaId,
    'multi-company-provisioned'
  );

  return {
    bootstrapPages:
      pages,
    companiesPrepared,
    credentialsPrepared,
    referencesPages,
    credentialsDeactivated
  };
}

async function syncOfflineProductCache(
  options = {}
) {
  return productCacheCoordinator
    .sync(
      options
    );
}

async function syncOfflineProductCacheCoalesced(
  options = {}
) {
  return productCacheCoordinator
    .syncCoalesced(
      options
    );
}

async function syncOfflineF5ReferenceCache(
  options = {}
) {
  return referenceCacheCoordinator
    .syncF5(
      options
    );
}

async function syncOfflineF5ReferenceCacheCoalesced(
  options = {}
) {
  return referenceCacheCoordinator
    .syncF5Coalesced(
      options
    );
}

async function maintainOfflineFiscalLeaseInventory() {
  return fiscalRuntimeCoordinator
    .maintainLeaseInventory();
}

function logFiscalLeaseMaintenance(summary) {
  return fiscalRuntimeCoordinator
    .logLeaseMaintenance(
      summary
    );
}

async function maintainOfflineFiscalTransmission() {
  return fiscalRuntimeCoordinator
    .maintainTransmission();
}

function logFiscalTransmissionSummary(result) {
  return fiscalRuntimeCoordinator
    .logTransmissionSummary(
      result
    );
}

const updateController =
  createUpdateController({
    app,
    autoUpdater,
    log,
    getMainWindow() {
      return mainWindow;
    },
    updateHelperSourcePath:
      RUNTIME_PATHS.updaterHelperPath
  });

const standbyController =
  createStandbyController({
    app,
    getUserAgent:
      chromeUserAgent,
    log
  });

function deveBloquearInicioPorAtualizacao() {
  return updateController
    .deveBloquearInicioPorAtualizacao();
}

function sinalizarNovaVersaoProntaSeNecessario() {
  return updateController
    .sinalizarNovaVersaoProntaSeNecessario();
}

function getVersaoAtualizacaoPendente() {
  return updateController
    .getVersaoAtualizacaoPendente();
}

function setVersaoAtualizacaoPendente(version) {
  return updateController
    .setVersaoAtualizacaoPendente(version);
}

const windowsPrintDriver =
  createWindowsPrintDriver({
    fs,
    path,
    crypto,
    spawn,
    printerName:
      PRINTER_NAME,
    helperPath:
      RUNTIME_PATHS.printDriverPath,
    tempDir:
      app.getPath(
        'temp'
      ),
    log
  });

const printQueue =
  createPrintQueue({
    print(payload) {
      return windowsPrintDriver
        .print(
          payload
        );
    },
    log
  });

const framePrintBridge =
  createFramePrintBridge({
    markers: {
      onlineNfceNumberResponse:
        FRAME_ONLINE_NFCE_NUMBER_RESPONSE_MARKER,
      nfceCounter:
        FRAME_NFCE_COUNTER_MARKER,
      contingencyPrintDiag:
        FRAME_CONTINGENCY_PRINT_DIAG_MARKER,
      print:
        FRAME_PRINT_MARKER
    },
    getMainWindow() {
      return mainWindow;
    },
    getOfflineView() {
      return offlineView;
    },
    findTrustedPdvFrame:
      findPdvContinuityFrame,
    isTrustedPdvFrameForContents,
    sanitizeNavigationUrlForLog,
    processFiscalCounterRequest(
      frame,
      requestId
    ) {
      return processarContadorFiscalDoFrame(
        frame,
        requestId
      );
    },
    respondFiscalCounterError(
      frame,
      requestId,
      error
    ) {
      return responderErroContadorFiscalDoFrame(
        frame,
        requestId,
        error
      );
    },
    enqueuePrint(payload) {
      return printQueue
        .enqueue(
          payload
        );
    },
    log
  });

function validarPayload(payload) {
  return windowsPrintDriver
    .validatePayload(
      payload
    );
}

function executarPowerShell(
  inputPath,
  mode
) {
  return windowsPrintDriver
    .executePowerShell(
      inputPath,
      mode
    );
}

async function imprimir(payload) {
  return windowsPrintDriver
    .print(
      payload
    );
}

function enfileirar(payload) {
  return printQueue
    .enqueue(
      payload
    );
}

const IPC_SENDER_SCOPE =
  ipcAuthorizationModule.IPC_SENDER_SCOPE;

const IPC_CHANNEL_AUTHORIZATION_POLICY =
  ipcAuthorizationModule.IPC_CHANNEL_AUTHORIZATION_POLICY;

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

      const candidateStored =
        storePendingOfflineOperatorVerifierCandidate(
          payload || {}
        );

      if (!candidateStored) {
        log(
          'OFFLINE OPERATOR VERIFIER CANDIDATE REJECTED'
        );
        return;
      }

      setTimeout(
        () => {
          if (offlineUiMode !== 'ONLINE') {
            return;
          }

          void persistPendingOfflineOperatorCredentialAfterOnlineLogin()
            .then((summary) => {
              log(
                'OFFLINE OPERATOR CREDENTIAL CACHE AFTER VERIFIER',
                summary
              );
            })
            .catch((error) => {
              log(
                'OFFLINE OPERATOR CREDENTIAL CACHE AFTER VERIFIER FAILED',
                {
                  erro: String(
                    error &&
                    error.message ||
                    error
                  )
                }
              );
            });
        },
        700
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

        if (stored) {
          evaluateOfflineReadiness(
            stored.empresaId,
            'explicit-credential-provisioned'
          );
        }

        if (
          stored &&
          offlineSyncIdentity &&
          offlineSyncIdentity.deviceId &&
          offlineSyncIdentity.deviceToken &&
          offlineSyncIdentity.empresaId &&
          authorizationController.getState() ===
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
    'efisco:offline-self-test',
    async (event) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-self-test',
          'invoke'
        )
      ) {
        return {
          ok: false,
          error:
            'Origem do auto-teste offline não autorizada.'
        };
      }

      try {
        const report =
          await runOfflineSelfTestAndRecord({
            source:
              'offline-ui'
          });

        return {
          ok: true,
          result:
            report
        };
      } catch (error) {
        log(
          'OFFLINE SELF TEST FAILED',
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
            'Auto-teste offline falhou.'
        };
      }
    }
  );

  ipcMain.handle(
    'efisco:offline-auto-repair',
    async (event) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-auto-repair',
          'invoke'
        )
      ) {
        return {
          ok: false,
          error:
            'Origem do auto-reparo offline não autorizada.'
        };
      }

      try {
        const summary =
          await offlineAutoRepairRunner
            .run({
              source:
                'offline-ui'
            });

        recordOfflineAutoRepairSummary(
          summary
        );

        return {
          ok: true,
          result:
            summary
        };
      } catch (error) {
        log(
          'OFFLINE AUTO REPAIR FAILED',
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
            'Auto-reparo offline falhou.'
        };
      }
    }
  );

  ipcMain.handle(
    'efisco:offline-diagnostic-report',
    async (event) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-diagnostic-report',
          'invoke'
        )
      ) {
        return {
          ok: false,
          error:
            'Origem do relatório offline não autorizada.'
        };
      }

      try {
        const generated =
          await generateOfflineDiagnosticReport();

        return {
          ok: true,
          result:
            generated
        };
      } catch (error) {
        log(
          'OFFLINE DIAGNOSTIC REPORT FAILED',
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
            'Relatório técnico offline falhou.'
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
            failures:
              operatorSessionController
                .getLoginBackoffState()
                .failures,
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

  registerOfflineReadHandlers({
    ipcMain,
    isIpcChannelAuthorized,
    log,
    resolveOfflineReferenceEmpresaId,
    findOfflineProductForSale,
    getOfflineCompanyHeader,
    listOfflineProductsForSale,
    listOfflineCustomersForCrediario,
    listOfflineCrediariosForF5,
    getOfflineCrediarioDetailForF5,
    consultCashOffline,
    listOfflineSalesForFinance,
    listCashMovements
  });

  registerOfflineMutationHandlers({
    ipcMain,
    isIpcChannelAuthorized,
    log,
    assertOfflineMutationAuthorized,
    buildOfflineCrediarioAtomicInput,
    openCrediarioOfflineAtomic,
    updateOfflineCrediarioItemsForF5,
    openCashOffline,
    registerCashMovementOffline,
    closeCashOffline,
    withAuthenticatedOfflineOperator,
    getOfflineDatabase,
    getOfflineSyncIdentity() {
      return offlineSyncIdentity;
    },
    getOrCreateSyncDeviceId,
    registerPaidSaleOffline,
    resolveOfflineReferenceEmpresaId,
    getUserDataDir() {
      return app.getPath('userData');
    },
    safeStorage
  });


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
  return fiscalCounterBridge
    .process(
      frame,
      requestId
    );
}

async function responderErroContadorFiscalDoFrame(
  frame,
  requestId,
  error
) {
  return fiscalCounterBridge
    .respondError(
      frame,
      requestId,
      error
    );
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
  return framePrintBridge
    .installConsoleFrameChannel(
      contentsAlvo
    );
}

async function instalarPonteTopDeImpressao() {
  return framePrintBridge
    .installTopPrintBridge();
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

function paginaAtualizacaoObrigatoria(versao) {
  return updateController
    .paginaAtualizacaoObrigatoria(versao);
}

async function iniciarAtualizacaoObrigatoria() {
  return updateController
    .iniciarAtualizacaoObrigatoria();
}

async function verificarAtualizacaoObrigatoria() {
  return updateController
    .verificarAtualizacaoObrigatoria();
}

async function verificarManifestoStandby() {
  return standbyController
    .verificarManifestoStandby();
}

function iniciarMonitorManifestoStandby() {
  return standbyController
    .iniciarMonitorManifestoStandby();
}

function pararMonitorManifestoStandby() {
  return standbyController
    .pararMonitorManifestoStandby();
}

function offlineAuthFailure(error) {
  return offlineAuthFailureFromModule(
    error
  );
}

function marcarOfflineAuthInvalida(error) {
  return authorizationController
    .markInvalid(
      error
    );
}

function assertOfflineMutationAuthorized() {
  return authorizationController
    .assertMutationAuthorized({
      syncIdentity:
        offlineSyncIdentity,
      uiMode:
        offlineUiMode,
      authenticatedOperator:
        operatorSessionController
          .getOfflineAuthenticatedOperator()
    });
}

async function probeWixReachableStartup(
  timeoutMs =
    OFFLINE_STARTUP_PROBE_TIMEOUT_MS
) {
  return connectivityProbes
    .probeWixReachableStartup(
      timeoutMs
    );
}

function probeWixReachable() {
  return connectivityProbes
    .probeWixReachable();
}

function outboxStatusSummary() {
  return outboxCoordinator
    .statusSummary();
}

function activeOutboxCount(summary) {
  return outboxCoordinator
    .activeCount(
      summary
    );
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
  return outboxCoordinator
    .enqueueAuthorizedNfceResultSync();
}

async function syncOutboxPending() {
  return outboxCoordinator
    .syncPending();
}

async function probeSyncReachable() {
  return connectivityProbes
    .probeSyncReachable();
}

function resolveAuthorizedIpcSender(event) {
  return ipcAuthorizationModule
    .resolveAuthorizedIpcSender(
      event,
      currentIpcAuthorizationContext()
    );
}

function currentIpcAuthorizationContext() {
  return {
    mainWindow,
    offlineView,
    onlineOrigin:
      ORIGIN_E_FISCO,
    onlineOrigins:
      NAVIGATION_POLICY_CONTEXT.onlineOrigins,
    offlineOrigin:
      offlineUiServer &&
      offlineUiServer.origin
        ? offlineUiServer.origin
        : '',
    parseUrlSegura,
    isOnlineOriginAllowed,
    isOfflineOriginAllowed
  };
}

function isMainWindowSender(event) {
  return ipcAuthorizationModule
    .isMainWindowSender(
      event,
      currentIpcAuthorizationContext()
    );
}

function isAuthorizedAppSender(event) {
  return ipcAuthorizationModule
    .isAuthorizedAppSender(
      event,
      currentIpcAuthorizationContext()
    );
}

function isIpcChannelAuthorized(
  event,
  channel,
  transport
) {
  return ipcAuthorizationModule
    .isIpcChannelAuthorized(
      event,
      channel,
      transport,
      currentIpcAuthorizationContext()
    );
}

function offlineOverlayBounds() {
  return windowLayoutModule.offlineOverlayBounds(
    mainWindow
  );
}

function offlineParkedBounds() {
  return windowLayoutModule.offlineParkedBounds(
    mainWindow
  );
}

function offlineStagingBounds() {
  return windowLayoutModule.offlineStagingBounds(
    mainWindow
  );
}

async function settleOfflineRendererBeforeReveal() {
  return offlineUiRuntime
    .settleBeforeReveal();
}

function resizeOfflineOverlay() {
  const resized =
    windowLayoutModule.resizeOfflineOverlay({
      mainWindow,
      offlineView,
      offlineViewReady,
      offlineUiMode
    });

  resizeOfflineDiagnosticOverlay();

  return resized;
}

function enrichContinuityDraftWithOfflineReferences(
  inputDraft
) {
  return continuityMirrorController
    .enrichDraftWithOfflineReferences(
      inputDraft
    );
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
  return ipcAuthorizationModule
    .isOfflineViewSender(
      event,
      currentIpcAuthorizationContext()
    );
}

function resolveOfflineOperatorProfileForSession(profile) {
  return operatorSessionController
    .resolveOfflineOperatorProfileForSession(
      profile
    );
}

function normalizeOfflineAuthenticatedOperator(profile) {
  return operatorSessionController
    .normalizeOfflineAuthenticatedOperator(
      profile
    );
}

function setOfflineAuthenticatedOperator(profile) {
  return operatorSessionController
    .setOfflineAuthenticatedOperator(
      profile
    );
}

function getOfflineAuthenticatedOperator() {
  return operatorSessionController
    .getOfflineAuthenticatedOperator();
}

function clearOfflineAuthenticatedOperator() {
  return operatorSessionController
    .clearOfflineAuthenticatedOperator();
}

function rememberConfirmedOnlineOperatorIdentity(profile) {
  return operatorSessionController
    .rememberConfirmedOnlineOperatorIdentity(
      profile
    );
}

function getLastConfirmedOnlineOperatorIdentity() {
  return operatorSessionController
    .getLastConfirmedOnlineOperatorIdentity();
}

function recentConfirmedOnlineOperatorIdentity() {
  return operatorSessionController
    .recentConfirmedOnlineOperatorIdentity();
}

async function refreshConfirmedOnlineOperatorIdentityFromLivePage(
  options = {}
) {
  return operatorSessionController
    .refreshConfirmedOnlineOperatorIdentityFromLivePage(
      options
    );
}

function withAuthenticatedOfflineOperator(payload = {}) {
  return operatorSessionController
    .withAuthenticatedOfflineOperator(
      payload
    );
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

function decodeCanonicalBase64(
  value,
  expectedLength = null
) {
  return decodeCanonicalBase64FromModule(
    value,
    expectedLength
  );
}

function offlineLoginRetryAfterMs(
  now = Date.now()
) {
  return operatorSessionController
    .offlineLoginRetryAfterMs(
      now
    );
}

function registerOfflineLoginFailure(
  now = Date.now()
) {
  return operatorSessionController
    .registerOfflineLoginFailure(
      now
    );
}

function resetOfflineLoginBackoff() {
  return operatorSessionController
    .resetOfflineLoginBackoff();
}

function validateOfflineOperatorPasswordAcrossPreparedCompanies(
  input = {}
) {
  return operatorVerifierController
    .validateOfflineOperatorPasswordAcrossPreparedCompanies(
      input
    );
}

function validateOfflineOperatorPasswordLocal(
  input = {}
) {
  return operatorVerifierController
    .validateOfflineOperatorPasswordLocal(
      input
    );
}

function persistExplicitOfflineCredentialProvision(
  payload = {}
) {
  return operatorProvisioningController
    .persistExplicitOfflineCredentialProvision(
      payload
    );
}

function clearPendingOfflineOperatorVerifierCandidate(
  candidate
) {
  return operatorVerifierController
    .clearPendingOfflineOperatorVerifierCandidate(
      candidate
    );
}

function storePendingOfflineOperatorVerifierCandidate(
  payload = {}
) {
  return operatorVerifierController
    .storePendingOfflineOperatorVerifierCandidate(
      payload
    );
}

function getPendingOfflineOperatorVerifierCandidate() {
  return operatorVerifierController
    .getPendingOfflineOperatorVerifierCandidate();
}

async function captureOnlineOperatorIdentityForOfflineCache(options = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;

  const identityCaptureTimeoutMs =
    Number.isFinite(Number(options.timeoutMs))
      ? Math.max(100, Math.min(5000, Number(options.timeoutMs)))
      : 900;

  const preferredFrame =
    await findPdvContinuityFrame(
      mainWindow.webContents,
      identityCaptureTimeoutMs
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
  return operatorProvisioningController
    .persistPendingOfflineOperatorCredentialAfterOnlineLogin();
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

async function captureOnlineContinuityDraft(
  options = {}
) {
  return continuityMirrorController
    .captureOnlineDraft(
      options
    );
}

async function mirrorOnlineContinuityDraft() {
  return continuityMirrorController
    .mirrorOnlineDraft();
}

function startContinuityMirror() {
  return continuityMirrorController
    .start();
}

function stopContinuityMirror() {
  return continuityMirrorController
    .stop();
}

function getOfflineContinuityDraft() {
  return continuityMirrorController
    .getDraft();
}

function setOfflineContinuityDraft(
  draft
) {
  return continuityMirrorController
    .setDraft(
      draft
    );
}

function clearOfflineContinuityDraftState() {
  return continuityMirrorController
    .clearDraft();
}

async function restoreOfflineContinuityDraft(
  draft
) {
  return continuityRecoveryController
    .restoreOfflineDraft(
      draft
    );
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
  return continuityRecoveryController
    .hasActiveOfflineSale();
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
  return continuityRecoveryController
    .clearOnlineDraft();
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

  const previousOfflineView =
    offlineView;

  offlineView = null;
  offlineViewReady = false;
  offlineViewAttached = false;

  offlineRendererHealthState
    .clear(
      'VIEW_REPLACED'
    );

  closeOfflineView(
    previousOfflineView
  );

  offlineView = createOfflineView({
    preloadPath:
      PRELOAD_PATH,
    userAgent:
      chromeUserAgent()
  });

  const observedOfflineView =
    offlineView;

  bindOfflineViewDiagnostics({
    offlineView:
      observedOfflineView,
    onFailure(
      diagnostic
    ) {
      markOfflineRendererFailure(
        observedOfflineView,
        diagnostic
      );
    },
    onResponsive() {
      void recheckOfflineRendererAfterResponsive(
        observedOfflineView
      ).catch(
        (error) => {
          markOfflineRendererFailure(
            observedOfflineView,
            {
              type:
                'RESPONSIVE_RECHECK_ERROR',
              error:
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
  });

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

  await loadOfflineView({
    offlineView,
    shellUrl:
      offlineUiServer.shellUrl,
    userAgent:
      chromeUserAgent()
  });

  const offlineViewHealth =
    await checkOfflineViewHealth({
      offlineView,
      expectedVersion:
        VERSION,
      timeoutMs:
        5000,
      pollIntervalMs:
        100
    });

  if (
    !offlineViewHealth ||
    offlineViewHealth.ok !== true
  ) {
    log(
      'OFFLINE VIEW HEALTHCHECK FAILED',
      offlineViewHealth || {
        ok: false,
        reason:
          'EMPTY_HEALTH_RESULT'
      }
    );

    markOfflineRendererFailure(
      observedOfflineView,
      {
        type:
          'HEALTHCHECK_FAILED',
        healthReason:
          offlineViewHealth &&
          offlineViewHealth.reason ||
          'EMPTY_HEALTH_RESULT',
        lastSnapshot:
          offlineViewHealth &&
          offlineViewHealth.lastSnapshot ||
          null,
        lastError:
          offlineViewHealth &&
          offlineViewHealth.lastError ||
          null
      }
    );

    throw new Error(
      'Renderer offline não passou no health-check: ' +
      String(
        offlineViewHealth &&
        offlineViewHealth.reason ||
        'UNKNOWN'
      )
    );
  }

  log(
    'OFFLINE VIEW HEALTHCHECK PASSED',
    {
      version:
        offlineViewHealth
          .preloadVersion ||
        null,
      shellReady:
        offlineViewHealth
          .shellReady === true,
      pdvReady:
        offlineViewHealth
          .pdvReady === true,
      pdvMarkerReady:
        offlineViewHealth
          .pdvMarkerReady === true,
      pdvScriptReady:
        offlineViewHealth
          .pdvScriptReady === true
    }
  );

  offlineRendererHealthState
    .markHealthy(
      observedOfflineView,
      {
        source:
          'initial-healthcheck',
        health:
          offlineViewHealth
      }
    );

  offlineRendererFailureState =
    null;

  if (
    !offlineRendererRecoveryController
      .isRunning()
  ) {
    hideOfflineDiagnosticOverlay();
  }

  offlineViewReady = true;

  // Mantém a view já composta, porém estacionada fora da área visível.
  // O failover passa a exigir apenas reposicionamento, evitando flash de attach.
  if (
    mainWindow &&
    !mainWindow.isDestroyed() &&
    !offlineViewAttached
  ) {
    attachOfflineView({
      mainWindow,
      offlineView
    });
    offlineViewAttached = true;
  }
  offlineView.setBounds(offlineParkedBounds());

  log('OFFLINE VIEW PRELOADED', { origin: offlineUiServer.origin });

  evaluateOfflineReadiness(
    null,
    'renderer-preloaded'
  );

  return offlineView;
}

function showOfflineOverlay() {
  return offlineUiRuntime
    .showOverlay();
}

function hideOfflineOverlay() {
  return offlineUiRuntime
    .hideOverlay();
}

function dispatchOfflineFunctionShortcut(key) {
  return offlineShortcutController
    .dispatch(
      key
    );
}

function unregisterOfflineFunctionShortcuts() {
  return offlineShortcutController
    .unregister();
}

function registerOfflineFunctionShortcuts() {
  return offlineShortcutController
    .register();
}

function syncOfflineFunctionShortcuts() {
  return offlineShortcutController
    .sync();
}

async function showBlockedOfflineDiagnostic(
  reason,
  error = null
) {
  const readiness =
    evaluateOfflineReadiness(
      null,
      'failover-blocked:' +
      String(
        reason ||
        'unknown'
      )
    );

  const diagnostic =
    buildBlockedFailoverDiagnostic({
      readiness,
      reason,
      error,
      bootstrapError:
        lastOfflineBootstrapError
    });

  const shown =
    await showOfflineDiagnosticOverlay(
      diagnostic,
      {
        force: true
      }
    );

  if (
    shown &&
    mainWindow &&
    !mainWindow.isDestroyed()
  ) {
    mainWindow.show();
    mainWindow.maximize();
  }

  return shown;
}

async function switchToOfflineUi(reason) {
  try {
    const switched =
      await failoverController
        .switchToOfflineUi(
          reason
        );

    if (switched) {
      hideOfflineDiagnosticOverlay();
      return true;
    }

    if (
      offlineUiMode ===
        'ONLINE' &&
      mainWindow &&
      !mainWindow.isDestroyed()
    ) {
      await showBlockedOfflineDiagnostic(
        reason
      );
    }

    return false;
  } catch (error) {
    if (
      offlineUiMode ===
        'ONLINE' &&
      mainWindow &&
      !mainWindow.isDestroyed()
    ) {
      await showBlockedOfflineDiagnostic(
        reason,
        error
      );
    }

    throw error;
  }
}

async function switchToOnlineUi(reason) {
  const switched =
    await runtimeController
      .switchToOnlineUi(
        reason
      );

  if (switched) {
    hideOfflineDiagnosticOverlay();
  }

  return switched;
}

async function offlineRuntimeTick() {
  return runtimeController
    .tick();
}

function startOfflineRuntimeMonitor() {
  return runtimeController
    .start();
}

function stopOfflineRuntimeMonitor() {
  return runtimeController
    .stop();
}

function installOnlineNetworkFailoverHook() {
  return failoverController
    .installNetworkFailoverHook();
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
    createMainWindow({
      iconPath:
        APP_ICON_PATH,
      preloadPath:
        PRELOAD_PATH
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

  bindMainWindowLifecycle({
    mainWindow,
    onResize:
      resizeOfflineOverlay,
    onMaximize:
      resizeOfflineOverlay,
    onUnmaximize:
      resizeOfflineOverlay,
    onFocus:
      syncOfflineFunctionShortcuts,
    onBlur:
      unregisterOfflineFunctionShortcuts,
    onClosed() {
      unregisterOfflineFunctionShortcuts();

      offlineRendererRecoveryController
        .cancel(
          'window-closed'
        );

      const closingOfflineView =
        offlineView;

      const closingDiagnosticView =
        offlineDiagnosticView;

      offlineView = null;
      offlineViewReady = false;
      offlineViewAttached = false;
      offlineRendererFailureState =
        null;

      offlineRendererHealthState
        .clear(
          'WINDOW_CLOSED'
        );

      offlineDiagnosticGeneration +=
        1;
      offlineDiagnosticView =
        null;
      offlineDiagnosticViewAttached =
        false;

      closeOfflineView(
        closingOfflineView
      );

      closeOfflineDiagnosticView(
        closingDiagnosticView
      );

      evaluateOfflineReadiness(
        null,
        'window-closed'
      );
    }
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
          getVersaoAtualizacaoPendente()
        ) {
          await mainWindow.loadURL(
            paginaAtualizacaoObrigatoria(
              getVersaoAtualizacaoPendente()
            )
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
      failoverController
        .handleMainFrameLoadFailure({
          errorCode,
          errorDescription,
          validatedURL,
          isMainFrame,
          isOfflineOriginAllowed
        });
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
            ADJUSTMENT_CSS_PATH,
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
        getPendingOfflineOperatorVerifierCandidate()
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

  bindMainWindowReadyToShow(
    mainWindow
  );

  try {
    setVersaoAtualizacaoPendente(
      await verificarAtualizacaoObrigatoria()
    );
  } catch (erro) {
    log('ERRO VERIFICACAO AUTOUPDATE', erro);
    setVersaoAtualizacaoPendente(null);
  }

  const versaoAtualizacaoPendente =
    getVersaoAtualizacaoPendente();

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

    evaluateOfflineReadiness(
      null,
      'renderer-preload-failed'
    );
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

    hideOfflineDiagnosticOverlay();
  } catch (error) {
    failoverController
      .noteMainFrameFailure();
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

const runtimeBootstrap =
  createRuntimeBootstrap({
    getUserDataDir() {
      return app.getPath(
        'userData'
      );
    },
    fs,
    safeStorage,
    initializeOfflineDatabase,
    getOfflineDatabase,
    getOrCreateSyncDeviceId,
    hasStoredSyncDeviceTokenForCompany,
    hasStoredSyncDeviceToken,
    getSyncEmpresaId,
    storeSyncEmpresaId,
    storeSyncDeviceTokenForCompany,
    storeSyncDeviceToken,
    loadSyncDeviceTokenForCompany,
    loadSyncDeviceToken,
    requestDevicePairing,
    pingSyncDevice,
    registerPreparedOfflineCompanyFromLocalState,
    pullSyncCashSummary,
    pullSyncCashState,
    mirrorRemoteCashState,
    isOfflineAuthFailure:
      offlineAuthFailure,
    markOfflineAuthInvalid:
      marcarOfflineAuthInvalida,
    recoverInterruptedOutbox,
    provisionFiscalA1FromServer,
    provisionOfflineMultiCompany,
    syncRootReferenceFallback,
    setAuthorizationState(
      state
    ) {
      authorizationController
        .setState(
          state
        );
    },
    setOfflineSyncIdentity(
      identity
    ) {
      offlineSyncIdentity =
        identity;
    },
    getOfflineSyncIdentity() {
      return offlineSyncIdentity;
    },
    log
  });

const appLifecycle =
  createAppLifecycle({
    app,
    getAllWindows() {
      return BrowserWindow
        .getAllWindows();
    },
    installIpc:
      instalarIpc,
    shouldBlockStartForUpdate:
      deveBloquearInicioPorAtualizacao,
    bootstrapRuntime:
      async () => {
        const result =
          await runtimeBootstrap
            .bootstrap();

        lastOfflineBootstrapError =
          result &&
          result.ok === false
            ? result.error || null
            : null;

        return result;
      },
    createWindow:
      criarJanela,
    getMainWindow() {
      return mainWindow;
    },
    unregisterOfflineFunctionShortcuts,
    stopStandbyMonitor:
      pararMonitorManifestoStandby,
    stopOfflineRuntimeMonitor,
    stopContinuityMirror,
    getOfflineUiServer() {
      return offlineUiServer;
    },
    clearOfflineUiServer() {
      offlineUiServer =
        null;
    },
    closeOfflineDatabase
  });

appLifecycle.start();
