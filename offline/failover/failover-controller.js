'use strict';

const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_RECENT_MAIN_FRAME_FAILURE_WINDOW_MS = 20_000;

const CONNECTIVITY_ERRORS = Object.freeze([
  'ERR_INTERNET_DISCONNECTED',
  'ERR_NETWORK_CHANGED',
  'ERR_NAME_NOT_RESOLVED',
  'ERR_CONNECTION_TIMED_OUT',
  'ERR_CONNECTION_RESET',
  'ERR_CONNECTION_REFUSED',
  'ERR_ADDRESS_UNREACHABLE',
  'ERR_NETWORK_ACCESS_DENIED',
  'ERR_TIMED_OUT'
]);

function emptyContinuityDraft() {
  return {
    version: 1,
    saleNumber: '',
    products: [],
    currentProduct: null,
    totalValue: 0,
    activeProducts: 0,
    paymentStageOpen: false
  };
}

function createFailoverController({
  session,
  failureThreshold =
    DEFAULT_FAILURE_THRESHOLD,
  recentMainFrameFailureWindowMs =
    DEFAULT_RECENT_MAIN_FRAME_FAILURE_WINDOW_MS,
  now = () => Date.now(),
  getOfflineUiServer,
  getMainWindow,
  getOfflineView,
  isOfflineViewReady,
  isOfflineViewAttached,
  getOfflineUiMode,
  setOfflineUiMode,
  isAuthorizationInvalid,
  assertOfflineMutationAuthorized,
  ensureOfflineView,
  offlineStagingBounds,
  captureOnlineContinuityDraft,
  setOfflineContinuityDraft,
  getOfflineContinuityDraft,
  recentConfirmedOnlineOperatorIdentity,
  captureOnlineOperatorIdentity,
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
  resetRecoverySuccessCount,
  syncOfflineFunctionShortcuts,
  unregisterOfflineFunctionShortcuts,
  log = () => {}
} = {}) {
  let failureCount = 0;
  let lastMainFrameFailureAt = 0;
  let networkHookInstalled = false;
  let networkFailoverInFlight = false;
  let failoverOnlineOperatorIdentity = null;

  function getFailureCount() {
    return failureCount;
  }

  function resetFailures() {
    failureCount = 0;
    return failureCount;
  }

  function noteMainFrameFailure() {
    lastMainFrameFailureAt =
      now();

    return lastMainFrameFailureAt;
  }

  function recordMonitorFailure() {
    failureCount += 1;

    if (
      now() -
        lastMainFrameFailureAt <
      recentMainFrameFailureWindowMs
    ) {
      failureCount =
        Math.max(
          failureCount,
          failureThreshold
        );
    }

    return {
      failureCount,
      threshold:
        failureThreshold,
      shouldFailover:
        failureCount >=
        failureThreshold
    };
  }

  function getOnlineOperatorIdentity() {
    return failoverOnlineOperatorIdentity;
  }

  function clearOnlineOperatorIdentity() {
    failoverOnlineOperatorIdentity = null;
  }

  function setOnlineOperatorIdentity(
    value
  ) {
    failoverOnlineOperatorIdentity =
      value &&
      typeof value ===
        'object'
        ? value
        : null;

    return failoverOnlineOperatorIdentity;
  }

  async function switchToOfflineUi(
    reason
  ) {
    const offlineUiServer =
      getOfflineUiServer();

    const mainWindow =
      getMainWindow();

    if (
      !offlineUiServer ||
      !mainWindow ||
      mainWindow.isDestroyed() ||
      getOfflineUiMode() ===
        'OFFLINE' ||
      getOfflineUiMode() ===
        'SWITCHING_OFFLINE'
    ) {
      return false;
    }

    assertOfflineMutationAuthorized();

    setOfflineUiMode(
      'SWITCHING_OFFLINE'
    );

    log(
      'OFFLINE FAILOVER START',
      {
        reason:
          String(
            reason ||
            'connectivity'
          )
      }
    );

    try {
      await ensureOfflineView();

      const offlineView =
        getOfflineView();

      if (
        offlineView &&
        isOfflineViewReady() &&
        isOfflineViewAttached()
      ) {
        offlineView.setBounds(
          offlineStagingBounds()
        );
      }

      clearOnlineOperatorIdentity();

      const freshDraft =
        await captureOnlineContinuityDraft({
          silent: true
        });

      if (
        freshDraft &&
        typeof freshDraft ===
          'object'
      ) {
        setOfflineContinuityDraft(
          freshDraft
        );
      }

      let onlineSessionIdentity =
        recentConfirmedOnlineOperatorIdentity();

      let onlineSessionIdentitySource =
        onlineSessionIdentity
          ? 'RECENT_ONLINE_CACHE'
          : 'NONE';

      if (!onlineSessionIdentity) {
        const liveIdentity =
          await captureOnlineOperatorIdentity({
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

      setOnlineOperatorIdentity(
        preservedSessionCandidate
          ? {
              empresaId:
                String(
                  preservedSessionCandidate
                    .empresaId ||
                  ''
                ).trim(),
              operadorId:
                String(
                  preservedSessionCandidate
                    .operadorId ||
                  ''
                ).trim(),
              perfil:
                String(
                  preservedSessionCandidate
                    .perfil ||
                  ''
                )
                  .trim()
                  .toUpperCase()
            }
          : null
      );

      if (
        failoverOnlineOperatorIdentity
      ) {
        log(
          'OFFLINE ONLINE SESSION IDENTITY CACHED',
          {
            source:
              onlineSessionIdentitySource,
            empresaId:
              failoverOnlineOperatorIdentity
                .empresaId,
            operadorId:
              failoverOnlineOperatorIdentity
                .operadorId,
            perfil:
              failoverOnlineOperatorIdentity
                .perfil
          }
        );
      }

      let sessionPreserved =
        false;

      if (
        preservedSessionCandidate
      ) {
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

            sessionPreserved =
              true;

            log(
              'OFFLINE FAILOVER SESSION PRESERVED',
              {
                empresaId:
                  preservedSession
                    .empresaId,
                operadorId:
                  preservedSession
                    .operadorId,
                perfil:
                  preservedSession
                    .perfil
              }
            );
          }
        }
      }

      if (!sessionPreserved) {
        clearOfflineAuthenticatedOperator();

        await setOfflineShellAuthenticationState(
          null
        );

        log(
          'OFFLINE FAILOVER LOGIN FALLBACK',
          {
            reason:
              onlineSessionIdentity
                ? 'ONLINE_SESSION_COULD_NOT_BE_APPLIED'
                : 'ONLINE_SESSION_UNAVAILABLE'
          }
        );
      }

      const currentContinuityDraft =
        getOfflineContinuityDraft();

      const draft =
        currentContinuityDraft &&
        typeof currentContinuityDraft ===
          'object'
          ? currentContinuityDraft
          : emptyContinuityDraft();

      await restoreOfflineContinuityDraft(
        draft
      );

      try {
        await refreshOfflineNfceNumberDisplay();
      } catch (
        numberRefreshError
      ) {
        log(
          'OFFLINE NFCE NUMBER REFRESH TICK DEFERRED',
          {
            erro:
              String(
                numberRefreshError &&
                numberRefreshError
                  .message ||
                numberRefreshError
              )
          }
        );
      }

      await settleOfflineRendererBeforeReveal();

      if (
        !showOfflineOverlay()
      ) {
        throw new Error(
          'Não foi possível exibir o renderer offline pré-carregado.'
        );
      }

      setOfflineUiMode(
        'OFFLINE'
      );

      resetFailures();
      resetRecoverySuccessCount();
      syncOfflineFunctionShortcuts();

      log(
        'OFFLINE FAILOVER ACTIVE',
        {
          origin:
            offlineUiServer
              .origin,
          continuity: {
            products:
              Array.isArray(
                draft.products
              )
                ? draft.products
                    .length
                : 0,
            hasCurrentProduct:
              Boolean(
                draft.currentProduct
              ),
            paymentStageOpen:
              draft
                .paymentStageOpen ===
              true
          }
        }
      );

      return true;
    } catch (error) {
      setOfflineUiMode(
        'ONLINE'
      );

      clearOfflineAuthenticatedOperator();

      await setOfflineShellAuthenticationState(
        null
      );

      unregisterOfflineFunctionShortcuts();
      hideOfflineOverlay();

      log(
        'OFFLINE FAILOVER FAILED',
        error
      );

      return false;
    }
  }

  function canTriggerImmediateFailover() {
    return (
      getOfflineUiMode() ===
        'ONLINE' &&
      networkFailoverInFlight ===
        false &&
      isOfflineViewReady() &&
      !isAuthorizationInvalid()
    );
  }

  function requestNavigatorOfflineFailover() {
    if (
      !canTriggerImmediateFailover()
    ) {
      return false;
    }

    networkFailoverInFlight =
      true;

    noteMainFrameFailure();

    log(
      'ONLINE NAVIGATOR OFFLINE DETECTED'
    );

    void switchToOfflineUi(
      'navigator-offline'
    )
      .catch(
        (error) => {
          log(
            'OFFLINE FAILOVER AFTER NAVIGATOR OFFLINE BLOCKED',
            error
          );
        }
      )
      .finally(
        () => {
          networkFailoverInFlight =
            false;
        }
      );

    return true;
  }

  function installNetworkFailoverHook() {
    if (
      networkHookInstalled
    ) {
      return false;
    }

    const ses =
      session.defaultSession;

    ses.webRequest
      .onErrorOccurred(
        {
          urls: [
            'https://*/*'
          ]
        },
        (details) => {
          if (
            !canTriggerImmediateFailover()
          ) {
            return;
          }

          const resourceType =
            String(
              details &&
              details.resourceType ||
              ''
            ).toLowerCase();

          if (
            ![
              'xhr',
              'fetch',
              'mainframe',
              'subframe'
            ].includes(
              resourceType
            )
          ) {
            return;
          }

          const errorText =
            String(
              details &&
              details.error ||
              ''
            ).toUpperCase();

          if (
            !CONNECTIVITY_ERRORS
              .some(
                (code) =>
                  errorText.includes(
                    code
                  )
              )
          ) {
            return;
          }

          networkFailoverInFlight =
            true;

          noteMainFrameFailure();

          log(
            'ONLINE NETWORK REQUEST FAILED',
            {
              error:
                String(
                  details &&
                  details.error ||
                  ''
                ),
              resourceType,
              url:
                String(
                  details &&
                  details.url ||
                  ''
                )
            }
          );

          void switchToOfflineUi(
            'network-request-failed'
          )
            .catch(
              (error) => {
                log(
                  'OFFLINE FAILOVER AFTER NETWORK ERROR BLOCKED',
                  error
                );
              }
            )
            .finally(
              () => {
                networkFailoverInFlight =
                  false;
              }
            );
        }
      );

    networkHookInstalled =
      true;

    return true;
  }

  function handleMainFrameLoadFailure({
    errorCode,
    errorDescription,
    validatedURL,
    isMainFrame,
    isOfflineOriginAllowed
  }) {
    if (
      isMainFrame !== true ||
      getOfflineUiMode() !==
        'ONLINE' ||
      isOfflineOriginAllowed(
        validatedURL
      )
    ) {
      return false;
    }

    noteMainFrameFailure();

    log(
      'ONLINE MAIN FRAME LOAD FAILED',
      {
        errorCode,
        errorDescription:
          String(
            errorDescription ||
            ''
          ),
        url:
          String(
            validatedURL ||
            ''
          )
      }
    );

    if (
      isOfflineViewReady() &&
      !isAuthorizationInvalid()
    ) {
      void switchToOfflineUi(
        'main-frame-load-failed'
      ).catch(
        (error) => {
          log(
            'OFFLINE FAILOVER AFTER LOAD FAILURE BLOCKED',
            error
          );
        }
      );
    }

    return true;
  }

  return Object.freeze({
    getFailureCount,
    resetFailures,
    recordMonitorFailure,
    noteMainFrameFailure,
    getOnlineOperatorIdentity,
    setOnlineOperatorIdentity,
    clearOnlineOperatorIdentity,
    switchToOfflineUi,
    requestNavigatorOfflineFailover,
    installNetworkFailoverHook,
    handleMainFrameLoadFailure
  });
}

module.exports = {
  DEFAULT_FAILURE_THRESHOLD,
  DEFAULT_RECENT_MAIN_FRAME_FAILURE_WINDOW_MS,
  CONNECTIVITY_ERRORS,
  emptyContinuityDraft,
  createFailoverController
};
