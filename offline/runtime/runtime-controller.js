'use strict';

const DEFAULT_RUNTIME_INTERVAL_MS = 5_000;
const DEFAULT_RECOVERY_THRESHOLD = 3;

function createOfflineRuntimeController({
  runtimeIntervalMs =
    DEFAULT_RUNTIME_INTERVAL_MS,
  recoveryThreshold =
    DEFAULT_RECOVERY_THRESHOLD,
  getMainWindow,
  getUiMode,
  setUiMode,
  getPendingUpdateVersion,
  probeWixReachable,
  probeSyncReachable,
  checkOfflineRendererHealth =
    async () => {},
  getSyncIdentity,
  flushOfflineTelemetryPending =
    async () => ({
      status:
        'NO_PENDING'
    }),
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
  isOfflineAuthFailure,
  markOfflineAuthInvalid,
  resolveOfflineOperationSyncIdentity,
  offlineHasActiveContinuitySale,
  unregisterOfflineFunctionShortcuts,
  syncOfflineFunctionShortcuts,
  getOfflineContinuityDraft,
  clearOnlineContinuityDraft,
  getFiscalProfileCache,
  captureOnlineOperatorIdentity,
  getOfflineAuthenticatedOperator,
  getFailoverOnlineOperatorIdentity,
  reloadOnlinePage,
  buildFiscalCounterSyncPayload,
  primeOnlineNfceNumberDisplay,
  queryOnlineNfceNumberForRecovery,
  normalizeOnlinePdvUnitValueHeader,
  clearOfflineContinuityDraftState,
  refreshOnlineNfceNumberDisplay,
  hideOfflineOverlay,
  showOfflineOverlay,
  clearOfflineAuthenticatedOperator,
  clearFailoverOnlineOperatorIdentity,
  setOfflineShellAuthenticationState,
  log = () => {},
  delay = (ms) =>
    new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          ms
        )
    ),
  setIntervalFn =
    setInterval,
  clearIntervalFn =
    clearInterval,
  setTimeoutFn =
    setTimeout
} = {}) {
  let busy = false;
  let successCount = 0;
  let timer = null;

  function resetRecoverySuccessCount() {
    successCount = 0;
  }

  function getRecoverySuccessCount() {
    return successCount;
  }

  async function flushTelemetryBestEffort() {
    try {
      return await flushOfflineTelemetryPending();
    } catch (error) {
      if (
        isOfflineAuthFailure(
          error
        )
      ) {
        throw error;
      }

      log(
        'OFFLINE TELEMETRY FLUSH DEFERRED',
        {
          code:
            String(
              error &&
              error.code ||
              'TELEMETRY_SEND_FAILED'
            )
        }
      );

      return null;
    }
  }

  async function switchToOnlineUi(
    reason
  ) {
    const mainWindow =
      getMainWindow();

    if (
      !mainWindow ||
      mainWindow.isDestroyed() ||
      getUiMode() ===
        'ONLINE' ||
      getUiMode() ===
        'SWITCHING_ONLINE'
    ) {
      return false;
    }

    if (
      await offlineHasActiveContinuitySale()
    ) {
      log(
        'OFFLINE RECOVERY WAITING ACTIVE SALE'
      );

      return false;
    }

    setUiMode(
      'SWITCHING_ONLINE'
    );

    unregisterOfflineFunctionShortcuts();

    log(
      'OFFLINE RECOVERY START',
      {
        reason:
          String(
            reason ||
            'connectivity-restored'
          )
      }
    );

    try {
      const continuityDraft =
        getOfflineContinuityDraft();

      const transferredSale =
        Boolean(
          continuityDraft &&
          typeof continuityDraft ===
            'object' &&
          (
            (
              Array.isArray(
                continuityDraft
                  .products
              ) &&
              continuityDraft
                .products
                .some(
                  (item) =>
                    item &&
                    item.cancelled !==
                      true
                )
            ) ||
            continuityDraft
              .currentProduct
          )
        );

      const onlineCleared =
        await clearOnlineContinuityDraft();

      if (
        transferredSale &&
        !onlineCleared
      ) {
        setUiMode(
          'OFFLINE'
        );

        syncOfflineFunctionShortcuts();

        log(
          'OFFLINE RECOVERY WAITING ONLINE CART CLEAR'
        );

        return false;
      }

      const recoveryIdentity =
        resolveOfflineOperationSyncIdentity();

      if (!recoveryIdentity) {
        setUiMode(
          'OFFLINE'
        );

        syncOfflineFunctionShortcuts();

        log(
          'OFFLINE RECOVERY WAITING SYNC IDENTITY'
        );

        return false;
      }

      const fiscalProfile =
        getFiscalProfileCache(
          recoveryIdentity
            .empresaId
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
        fiscalEnvironment ===
        'PRODUCAO';

      let liveOnlineIdentity =
        await captureOnlineOperatorIdentity({
          timeoutMs: 5000
        });

      const authenticatedOperator =
        getOfflineAuthenticatedOperator();

      const storedFailoverOnlineIdentity =
        getFailoverOnlineOperatorIdentity();

      const failoverOnlineIdentity =
        storedFailoverOnlineIdentity &&
        authenticatedOperator &&
        String(
          storedFailoverOnlineIdentity
            .empresaId ||
          ''
        ).trim() ===
          recoveryIdentity
            .empresaId &&
        String(
          storedFailoverOnlineIdentity
            .operadorId ||
          ''
        ).trim() ===
          String(
            authenticatedOperator
              .operadorId ||
            ''
          ).trim() &&
        String(
          storedFailoverOnlineIdentity
            .perfil ||
          ''
        )
          .trim()
          .toUpperCase() ===
          String(
            authenticatedOperator
              .perfil ||
            ''
          )
            .trim()
            .toUpperCase()
          ? storedFailoverOnlineIdentity
          : null;

      let onlineIdentitySource =
        liveOnlineIdentity
          ? 'LIVE'
          : (
              failoverOnlineIdentity
                ? 'FAILOVER_SESSION'
                : 'NONE'
            );

      let onlinePageReloaded =
        false;

      if (
        !liveOnlineIdentity &&
        !failoverOnlineIdentity
      ) {
        try {
          await reloadOnlinePage();

          onlinePageReloaded =
            true;

          await delay(900);

          liveOnlineIdentity =
            await captureOnlineOperatorIdentity({
              timeoutMs: 8000
            });

          if (
            liveOnlineIdentity
          ) {
            onlineIdentitySource =
              'LIVE_AFTER_RELOAD';
          }
        } catch (
          reloadError
        ) {
          log(
            'OFFLINE RECOVERY ONLINE RELOAD DEFERRED',
            {
              erro:
                String(
                  reloadError &&
                  reloadError
                    .message ||
                  reloadError
                )
            }
          );
        }
      }

      const onlineIdentity =
        liveOnlineIdentity ||
        failoverOnlineIdentity;

      const onlineLoginRequired =
        !onlineIdentity &&
        onlinePageReloaded &&
        remoteOnlyProduction;

      if (
        onlineLoginRequired
      ) {
        log(
          'OFFLINE RECOVERY ONLINE LOGIN REQUIRED',
          {
            empresaId:
              recoveryIdentity
                .empresaId,
            ambiente:
              fiscalEnvironment
          }
        );

        setUiMode(
          'ONLINE'
        );

        failoverController
          .resetFailures();

        resetRecoverySuccessCount();

        clearOfflineContinuityDraftState();

        if (
          !hideOfflineOverlay()
        ) {
          throw new Error(
            'Não foi possível ocultar o renderer offline.'
          );
        }

        clearOfflineAuthenticatedOperator();

        clearFailoverOnlineOperatorIdentity();

        await setOfflineShellAuthenticationState(
          null
        );

        log(
          'OFFLINE RECOVERY ONLINE',
          {
            loginRequired:
              true,
            empresaId:
              recoveryIdentity
                .empresaId
          }
        );

        return true;
      }

      if (
        !onlineIdentity ||
        String(
          onlineIdentity
            .empresaId ||
          ''
        ).trim() !==
          recoveryIdentity
            .empresaId
      ) {
        setUiMode(
          'OFFLINE'
        );

        syncOfflineFunctionShortcuts();

        log(
          'OFFLINE RECOVERY WAITING ONLINE TENANT',
          {
            offlineEmpresaId:
              recoveryIdentity
                .empresaId,
            onlineEmpresaId:
              onlineIdentity &&
              onlineIdentity
                .empresaId
                ? String(
                    onlineIdentity
                      .empresaId
                  )
                : null,
            source:
              onlineIdentitySource
          }
        );

        return false;
      }

      log(
        'OFFLINE RECOVERY ONLINE TENANT CONFIRMED',
        {
          empresaId:
            recoveryIdentity
              .empresaId,
          source:
            onlineIdentitySource
        }
      );

      const counterSync =
        buildFiscalCounterSyncPayload(
          recoveryIdentity
            .empresaId,
          recoveryIdentity
            .deviceId
        );

      if (
        counterSync &&
        Number.isSafeInteger(
          Number(
            counterSync
              .proximoNumero
          )
        ) &&
        Number(
          counterSync
            .proximoNumero
        ) > 0
      ) {
        await primeOnlineNfceNumberDisplay(
          Number(
            counterSync
              .proximoNumero
          )
        );
      }

      const localNextNfce =
        counterSync &&
        Number.isSafeInteger(
          Number(
            counterSync
              .proximoNumero
          )
        ) &&
        Number(
          counterSync
            .proximoNumero
        ) > 0
          ? Number(
              counterSync
                .proximoNumero
            )
          : null;

      if (
        !localNextNfce &&
        !remoteOnlyProduction
      ) {
        setUiMode(
          'OFFLINE'
        );

        syncOfflineFunctionShortcuts();

        log(
          'OFFLINE RECOVERY WAITING NFCE COUNTER',
          {
            reason:
              'LOCAL_COUNTER_UNAVAILABLE',
            ambiente:
              fiscalEnvironment ||
              null
          }
        );

        return false;
      }

      const remoteCounterCheck =
        await queryOnlineNfceNumberForRecovery();

      const remoteNextNfce =
        remoteCounterCheck &&
        remoteCounterCheck
          .ok === true &&
        Number.isSafeInteger(
          Number(
            remoteCounterCheck
              .proximoNumero
          )
        ) &&
        Number(
          remoteCounterCheck
            .proximoNumero
        ) > 0
          ? Number(
              remoteCounterCheck
                .proximoNumero
            )
          : null;

      const counterCompatible =
        remoteNextNfce !==
          null &&
        (
          localNextNfce ===
            null ||
          remoteNextNfce >=
            localNextNfce
        );

      log(
        'OFFLINE RECOVERY NFCE COUNTER CHECK',
        {
          localNext:
            localNextNfce,
          remoteNext:
            remoteNextNfce,
          ok:
            counterCompatible,
          mode:
            localNextNfce ===
              null &&
            remoteOnlyProduction
              ? 'REMOTE_ONLY_PRODUCAO'
              : 'LOCAL_AND_REMOTE',
          reason:
            remoteCounterCheck &&
            remoteCounterCheck
              .reason
              ? String(
                  remoteCounterCheck
                    .reason
                )
              : 'INVALID_RESPONSE'
        }
      );

      if (!counterCompatible) {
        setUiMode(
          'OFFLINE'
        );

        syncOfflineFunctionShortcuts();

        log(
          'OFFLINE RECOVERY WAITING NFCE COUNTER',
          {
            reason:
              remoteNextNfce ===
                null
                ? (
                    remoteCounterCheck &&
                    remoteCounterCheck
                      .reason
                      ? String(
                          remoteCounterCheck
                            .reason
                        )
                      : 'REMOTE_COUNTER_UNAVAILABLE'
                  )
                : 'REMOTE_COUNTER_BEHIND_LOCAL',
            localNext:
              localNextNfce,
            remoteNext:
              remoteNextNfce
          }
        );

        return false;
      }

      await primeOnlineNfceNumberDisplay(
        remoteNextNfce
      );

      await normalizeOnlinePdvUnitValueHeader();

      setUiMode(
        'ONLINE'
      );

      failoverController
        .resetFailures();

      resetRecoverySuccessCount();

      clearOfflineContinuityDraftState();

      await refreshOnlineNfceNumberDisplay();

      await delay(75);

      if (
        !hideOfflineOverlay()
      ) {
        throw new Error(
          'Não foi possível ocultar o renderer offline.'
        );
      }

      clearOfflineAuthenticatedOperator();

      clearFailoverOnlineOperatorIdentity();

      await setOfflineShellAuthenticationState(
        null
      );

      log(
        'OFFLINE RECOVERY ONLINE'
      );

      return true;
    } catch (error) {
      setUiMode(
        'OFFLINE'
      );

      showOfflineOverlay();

      syncOfflineFunctionShortcuts();

      log(
        'OFFLINE RECOVERY SHOW FAILED',
        error
      );

      return false;
    }
  }

  async function tick() {
    const mainWindow =
      getMainWindow();

    if (
      busy ||
      !mainWindow ||
      mainWindow.isDestroyed() ||
      getPendingUpdateVersion()
    ) {
      return;
    }

    busy = true;

    try {
      try {
        await checkOfflineRendererHealth();
      } catch (error) {
        log(
          'OFFLINE RENDERER HEALTH TICK FAILED',
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

      const [
        wixOk,
        syncProbe
      ] =
        await Promise.all([
          probeWixReachable(),
          probeSyncReachable()
        ]);

      const healthy =
        wixOk &&
        syncProbe
          .reachable ===
          true;

      if (
        getUiMode() ===
        'ONLINE'
      ) {
        if (healthy) {
          failoverController
            .resetFailures();

          successCount =
            Math.min(
              recoveryThreshold,
              successCount + 1
            );

          if (
            syncProbe
              .authenticated
          ) {
            try {
              await flushTelemetryBestEffort();

              await refreshRemoteCashState();

              const onlineSyncSummary =
                await syncOutboxPending();

              if (
                activeOutboxCount(
                  onlineSyncSummary
                ) === 0
              ) {
                const identity =
                  getSyncIdentity();

                if (identity) {
                  try {
                    const mirrorSummary =
                      await syncOfflineProductCacheCoalesced({
                        deviceId:
                          identity.deviceId,
                        deviceToken:
                          identity.deviceToken,
                        empresaId:
                          identity.empresaId
                      });

                    if (
                      !mirrorSummary ||
                      mirrorSummary
                        .skipped !==
                        true
                    ) {
                      log(
                        'OFFLINE PRODUCT MIRROR SYNCED',
                        mirrorSummary
                      );
                    }
                  } catch (
                    mirrorError
                  ) {
                    log(
                      'OFFLINE PRODUCT MIRROR DEFERRED',
                      {
                        erro:
                          String(
                            mirrorError &&
                            mirrorError
                              .message ||
                            mirrorError
                          )
                      }
                    );
                  }

                  try {
                    const f5MirrorSummary =
                      await syncOfflineF5ReferenceCacheCoalesced({
                        deviceId:
                          identity.deviceId,
                        deviceToken:
                          identity.deviceToken,
                        empresaId:
                          identity.empresaId
                      });

                    if (
                      !f5MirrorSummary ||
                      f5MirrorSummary
                        .skipped !==
                        true
                    ) {
                      log(
                        'OFFLINE F5 MIRROR SYNCED',
                        f5MirrorSummary
                      );
                    }
                  } catch (
                    f5MirrorError
                  ) {
                    log(
                      'OFFLINE F5 MIRROR DEFERRED',
                      {
                        erro:
                          String(
                            f5MirrorError &&
                            f5MirrorError
                              .message ||
                            f5MirrorError
                          )
                      }
                    );
                  }
                }
              }
            } catch (error) {
              if (
                isOfflineAuthFailure(
                  error
                )
              ) {
                markOfflineAuthInvalid(
                  error
                );
              } else {
                log(
                  'OFFLINE ONLINE-SYNC DEFERRED',
                  error
                );
              }
            }

            try {
              const leaseSummary =
                await maintainOfflineFiscalLeaseInventory();

              logFiscalLeaseMaintenance(
                leaseSummary
              );
            } catch (error) {
              if (
                isOfflineAuthFailure(
                  error
                )
              ) {
                markOfflineAuthInvalid(
                  error
                );
              } else {
                log(
                  'OFFLINE FISCAL LEASE MAINTENANCE DEFERRED',
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

            try {
              const fiscalResult =
                await maintainOfflineFiscalTransmission();

              logFiscalTransmissionSummary(
                fiscalResult
              );
            } catch (error) {
              log(
                'OFFLINE FISCAL OUTBOX DEFERRED',
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

          return;
        }

        resetRecoverySuccessCount();

        const failoverState =
          failoverController
            .recordMonitorFailure();

        if (
          failoverState
            .shouldFailover
        ) {
          try {
            await switchToOfflineUi(
              'online-unreachable'
            );
          } catch (error) {
            log(
              'OFFLINE FAILOVER BLOCKED',
              error
            );
          }
        }

        return;
      }

      if (
        getUiMode() !==
        'OFFLINE'
      ) {
        return;
      }

      if (!healthy) {
        resetRecoverySuccessCount();
        return;
      }

      successCount += 1;

      if (
        successCount <
        recoveryThreshold
      ) {
        return;
      }

      if (
        syncProbe
          .authInvalid ===
        true
      ) {
        log(
          'OFFLINE RECOVERY REAUTH REQUIRED',
          {
            reason:
              'device-auth-invalid-offline-blocked'
          }
        );

        return;
      }

      try {
        await flushTelemetryBestEffort();

        await refreshRemoteCashState();

        const summary =
          await syncOutboxPending();

        const active =
          activeOutboxCount(
            summary
          );

        if (active > 0) {
          log(
            'OFFLINE RECOVERY WAITING OUTBOX',
            summary
          );

          return;
        }

        const recoveryIdentity =
          resolveOfflineOperationSyncIdentity();

        if (!recoveryIdentity) {
          throw new Error(
            'Identidade de sync da empresa offline indisponível.'
          );
        }

        const mirrorSummary =
          await syncOfflineProductCacheCoalesced({
            deviceId:
              recoveryIdentity.deviceId,
            deviceToken:
              recoveryIdentity.deviceToken,
            empresaId:
              recoveryIdentity.empresaId,
            force: true
          });

        log(
          'OFFLINE STOCK RECONCILED',
          mirrorSummary
        );

        const fiscalResult =
          await maintainOfflineFiscalTransmission();

        logFiscalTransmissionSummary(
          fiscalResult
        );

        const postFiscalSyncSummary =
          await syncOutboxPending();

        if (
          activeOutboxCount(
            postFiscalSyncSummary
          ) > 0
        ) {
          log(
            'OFFLINE RECOVERY WAITING POST-FISCAL SYNC',
            postFiscalSyncSummary
          );

          return;
        }

        await switchToOnlineUi(
          'outbox-synchronized'
        );
      } catch (error) {
        if (
          isOfflineAuthFailure(
            error
          )
        ) {
          markOfflineAuthInvalid(
            error
          );

          log(
            'OFFLINE RECOVERY REAUTH REQUIRED',
            {
              reason:
                'device-auth-invalid-after-reconnect'
            }
          );
        } else {
          log(
            'OFFLINE RECOVERY SYNC FAILED',
            error
          );
        }
      }
    } finally {
      busy = false;
    }
  }

  function start() {
    if (timer) {
      return;
    }

    timer =
      setIntervalFn(
        () => {
          void tick();
        },
        runtimeIntervalMs
      );

    if (
      timer &&
      typeof timer.unref ===
        'function'
    ) {
      timer.unref();
    }

    setTimeoutFn(
      () => {
        void tick();
      },
      1_000
    );
  }

  function stop() {
    if (!timer) {
      return;
    }

    clearIntervalFn(
      timer
    );

    timer = null;
  }

  return Object.freeze({
    switchToOnlineUi,
    tick,
    start,
    stop,
    resetRecoverySuccessCount,
    getRecoverySuccessCount,
    isBusy() {
      return busy;
    }
  });
}

module.exports = {
  DEFAULT_RUNTIME_INTERVAL_MS,
  DEFAULT_RECOVERY_THRESHOLD,
  createOfflineRuntimeController
};
