'use strict';

const {
  WebContentsView
} = require('electron');

function offlineViewOptions({
  preloadPath
} = {}) {
  return {
    webPreferences: {
      preload:
        preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false
    }
  };
}

function createOfflineView({
  preloadPath,
  userAgent,
  WebContentsViewImpl = WebContentsView
} = {}) {
  const offlineView =
    new WebContentsViewImpl(
      offlineViewOptions({
        preloadPath
      })
    );

  offlineView.setBackgroundColor('#00000000');
  offlineView.webContents.setUserAgent(
    userAgent
  );

  if (
    typeof offlineView.webContents.setBackgroundThrottling ===
      'function'
  ) {
    try {
      offlineView.webContents.setBackgroundThrottling(false);
    } catch (_) {}
  }

  return offlineView;
}

async function loadOfflineView({
  offlineView,
  shellUrl,
  userAgent
} = {}) {
  await offlineView.webContents.loadURL(
    shellUrl,
    {
      userAgent
    }
  );

  return offlineView;
}

async function checkOfflineViewHealth({
  offlineView,
  expectedVersion = '',
  timeoutMs = 5000,
  pollIntervalMs = 100,
  now = () => Date.now(),
  setTimeoutFn = setTimeout
} = {}) {
  if (
    !offlineView ||
    !offlineView.webContents ||
    offlineView.webContents.isDestroyed()
  ) {
    return {
      ok: false,
      reason: 'WEB_CONTENTS_UNAVAILABLE'
    };
  }

  const normalizedTimeoutMs =
    Math.max(
      250,
      Math.min(
        15000,
        Number(timeoutMs) || 5000
      )
    );

  const normalizedPollIntervalMs =
    Math.max(
      50,
      Math.min(
        1000,
        Number(pollIntervalMs) || 100
      )
    );

  const expected =
    String(
      expectedVersion || ''
    ).trim();

  const deadline =
    now() + normalizedTimeoutMs;

  let lastSnapshot = null;
  let lastError = null;

  while (now() <= deadline) {
    if (
      offlineView.webContents.isDestroyed()
    ) {
      return {
        ok: false,
        reason: 'WEB_CONTENTS_DESTROYED',
        lastSnapshot
      };
    }

    try {
      lastSnapshot =
        await offlineView.webContents
          .executeJavaScript(
            `(() => {
              const shellReady =
                document.readyState === 'complete' ||
                document.readyState === 'interactive';

              const bridge =
                window.efiscoDesktop &&
                typeof window.efiscoDesktop === 'object'
                  ? window.efiscoDesktop
                  : null;

              const preloadReady =
                Boolean(
                  bridge &&
                  typeof bridge.offlineOperatorLogin === 'function' &&
                  typeof bridge.offlineCompanyHeader === 'function'
                );

              const preloadVersion =
                bridge &&
                bridge.version != null
                  ? String(bridge.version)
                  : '';

              const iframe =
                document.getElementById('scfOfflinePdv');

              let pdvReady = false;
              let pdvMarkerReady = false;
              let pdvScriptReady = false;

              try {
                const pdvDocument =
                  iframe &&
                  iframe.contentDocument;

                const pdvWindow =
                  iframe &&
                  iframe.contentWindow;

                pdvReady =
                  Boolean(
                    pdvDocument &&
                    (
                      pdvDocument.readyState === 'complete' ||
                      pdvDocument.readyState === 'interactive'
                    )
                  );

                pdvMarkerReady =
                  Boolean(
                    pdvDocument &&
                    pdvDocument.getElementById(
                      'fiscalProductsList'
                    )
                  );

                pdvScriptReady =
                  Boolean(
                    pdvWindow &&
                    (
                      typeof pdvWindow
                        .__scfPdvExportContinuityDraft ===
                          'function' ||
                      typeof pdvWindow
                        .__scfPdvRestoreContinuityDraft ===
                          'function'
                    )
                  );
              } catch (_) {}

              return {
                shellReady,
                preloadReady,
                preloadVersion,
                pdvFramePresent:
                  Boolean(iframe),
                pdvReady,
                pdvMarkerReady,
                pdvScriptReady
              };
            })()`,
            true
          );

      const versionReady =
        !expected ||
        String(
          lastSnapshot &&
          lastSnapshot.preloadVersion ||
          ''
        ) === expected;

      if (
        lastSnapshot &&
        lastSnapshot.shellReady === true &&
        lastSnapshot.preloadReady === true &&
        versionReady &&
        lastSnapshot.pdvFramePresent === true &&
        lastSnapshot.pdvReady === true &&
        lastSnapshot.pdvMarkerReady === true &&
        lastSnapshot.pdvScriptReady === true
      ) {
        return {
          ok: true,
          reason: 'HEALTHY',
          ...lastSnapshot
        };
      }
    } catch (error) {
      lastError =
        String(
          error &&
          error.message ||
          error
        );
    }

    if (now() >= deadline) {
      break;
    }

    await new Promise(
      (resolve) =>
        setTimeoutFn(
          resolve,
          normalizedPollIntervalMs
        )
    );
  }

  return {
    ok: false,
    reason: 'HEALTHCHECK_TIMEOUT',
    expectedVersion:
      expected || null,
    lastSnapshot,
    lastError
  };
}

function bindOfflineViewDiagnostics({
  offlineView,
  onFailure = () => {},
  onResponsive = () => {}
} = {}) {
  const webContents =
    offlineView &&
    offlineView.webContents;

  if (
    !webContents ||
    typeof webContents.on !== 'function'
  ) {
    throw new Error(
      'webContents offline indisponível para diagnóstico.'
    );
  }

  function reportFailure(
    type,
    details = {}
  ) {
    onFailure({
      type:
        String(type || 'UNKNOWN'),
      ...details
    });
  }

  webContents.on(
    'did-fail-load',
    (
      _event,
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame,
      frameProcessId,
      frameRoutingId
    ) => {
      const code =
        Number(errorCode);

      if (code === -3) {
        return;
      }

      reportFailure(
        'DID_FAIL_LOAD',
        {
          errorCode:
            Number.isFinite(code)
              ? code
              : null,
          errorDescription:
            String(
              errorDescription || ''
            ),
          validatedURL:
            String(
              validatedURL || ''
            ),
          isMainFrame:
            isMainFrame === true,
          frameProcessId:
            Number.isFinite(
              Number(frameProcessId)
            )
              ? Number(frameProcessId)
              : null,
          frameRoutingId:
            Number.isFinite(
              Number(frameRoutingId)
            )
              ? Number(frameRoutingId)
              : null
        }
      );
    }
  );

  webContents.on(
    'preload-error',
    (
      _event,
      preloadPath,
      error
    ) => {
      reportFailure(
        'PRELOAD_ERROR',
        {
          preloadPath:
            String(
              preloadPath || ''
            ),
          error:
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

  webContents.on(
    'render-process-gone',
    (
      _event,
      details = {}
    ) => {
      reportFailure(
        'RENDER_PROCESS_GONE',
        {
          reason:
            String(
              details &&
              details.reason ||
              ''
            ),
          exitCode:
            Number.isFinite(
              Number(
                details &&
                details.exitCode
              )
            )
              ? Number(
                  details.exitCode
                )
              : null
        }
      );
    }
  );

  webContents.on(
    'unresponsive',
    () => {
      reportFailure(
        'UNRESPONSIVE'
      );
    }
  );

  webContents.on(
    'responsive',
    () => {
      onResponsive({
        type: 'RESPONSIVE'
      });
    }
  );

  webContents.on(
    'destroyed',
    () => {
      reportFailure(
        'DESTROYED'
      );
    }
  );

  return true;
}

function attachOfflineView({
  mainWindow,
  offlineView
} = {}) {
  mainWindow.contentView.addChildView(
    offlineView
  );

  return offlineView;
}

function closeOfflineView(
  offlineView
) {
  if (
    offlineView &&
    offlineView.webContents &&
    !offlineView.webContents.isDestroyed()
  ) {
    try {
      offlineView.webContents.close();
    } catch (_) {}
  }
}

module.exports = {
  offlineViewOptions,
  createOfflineView,
  loadOfflineView,
  checkOfflineViewHealth,
  bindOfflineViewDiagnostics,
  attachOfflineView,
  closeOfflineView
};
