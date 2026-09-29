'use strict';

const path =
  require('path');

function resolveRuntimePaths({
  appRoot,
  isPackaged,
  resourcesPath,
  pathModule = path
} = {}) {
  const root =
    String(
      appRoot ||
      ''
    ).trim();

  if (!root) {
    throw new Error(
      'App root ausente para resolver recursos do runtime.'
    );
  }

  const unpackedRoot =
    isPackaged === true
      ? pathModule.join(
          String(
            resourcesPath ||
            ''
          ),
          'app.asar.unpacked'
        )
      : root;

  return Object.freeze({
    appRoot: root,
    preloadPath:
      pathModule.join(
        root,
        'preload.js'
      ),
    iconPath:
      pathModule.join(
        root,
        'icone_app.ico'
      ),
    adjustmentCssPath:
      pathModule.join(
        root,
        'ajuste.css'
      ),
    printDriverPath:
      pathModule.join(
        unpackedRoot,
        'print-driver-nfce.ps1'
      ),
    updaterHelperPath:
      pathModule.join(
        unpackedRoot,
        'EFISCO-UPDATER.exe'
      )
  });
}

function createRuntimeBootstrap({
  getUserDataDir,
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
  isOfflineAuthFailure,
  markOfflineAuthInvalid,
  recoverInterruptedOutbox,
  provisionFiscalA1FromServer,
  provisionOfflineMultiCompany,
  syncRootReferenceFallback,
  setAuthorizationState,
  setOfflineSyncIdentity,
  getOfflineSyncIdentity,
  log = () => {},
  now = () => Date.now()
} = {}) {
  async function bootstrap() {
    const userDataDir =
      getUserDataDir();

    try {
      const offlineDbInfo =
        initializeOfflineDatabase({
          userDataDir
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

      const pairingRepairPath =
        path.join(
          userDataDir,
          'offline-auth',
          'device-pairing-repair.json'
        );

      if (
        fs.existsSync(
          pairingRepairPath
        )
      ) {
        const repairPayload =
          JSON.parse(
            fs.readFileSync(
              pairingRepairPath,
              'utf8'
            )
          );

        const pairingCode =
          String(
            repairPayload &&
            repairPayload
              .pairingCode ||
            ''
          ).trim();

        if (
          pairingCode.length <
            16 ||
          pairingCode.length >
            128
        ) {
          throw new Error(
            'Marcador local de reparo do pareamento é inválido.'
          );
        }

        if (
          !safeStorage
            .isEncryptionAvailable()
        ) {
          throw new Error(
            'safeStorage indisponível durante reparo do pareamento.'
          );
        }

        const repairedPairing =
          await requestDevicePairing({
            deviceId:
              syncDeviceId,
            pairingCode
          });

        storeSyncDeviceTokenForCompany({
          safeStorage,
          userDataDir,
          empresaId:
            repairedPairing
              .empresaId,
          deviceToken:
            repairedPairing
              .deviceToken
        });

        storeSyncDeviceToken({
          safeStorage,
          userDataDir,
          deviceToken:
            repairedPairing
              .deviceToken
        });

        storeSyncEmpresaId({
          db: offlineDb,
          empresaId:
            repairedPairing
              .empresaId
        });

        fs.unlinkSync(
          pairingRepairPath
        );

        log(
          'OFFLINE SYNC DEVICE REPAIR COMPLETED',
          {
            deviceId:
              syncDeviceId,
            tokenConfigured:
              true,
            expiresAt:
              repairedPairing
                .expiresAt ||
              null
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
            userDataDir,
            empresaId:
              syncEmpresaId
          })
        );

      const legacyTokenConfigured =
        hasStoredSyncDeviceToken({
          userDataDir
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
                  preparedCompany
                    .empresaId
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

      let deviceToken =
        null;

      setOfflineSyncIdentity({
        deviceId:
          syncDeviceId,
        deviceToken:
          null,
        empresaId:
          syncEmpresaId
      });

      setAuthorizationState(
        tokenConfigured &&
        syncEmpresaId
          ? 'TRUSTED_LOCAL'
          : 'UNAVAILABLE'
      );

      if (
        tokenConfigured &&
        safeStorage
          .isEncryptionAvailable()
      ) {
        try {
          if (
            syncEmpresaId &&
            companyTokenConfigured
          ) {
            deviceToken =
              loadSyncDeviceTokenForCompany({
                userDataDir,
                empresaId:
                  syncEmpresaId,
                safeStorage
              });
          } else {
            deviceToken =
              loadSyncDeviceToken({
                userDataDir,
                safeStorage
              });

            if (
              deviceToken &&
              syncEmpresaId
            ) {
              storeSyncDeviceTokenForCompany({
                safeStorage,
                userDataDir,
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
                syncEmpresaId ||
                null,
              source:
                companyTokenConfigured
                  ? 'COMPANY'
                  : 'LEGACY'
            }
          );

          const identity =
            getOfflineSyncIdentity();

          identity.deviceToken =
            deviceToken;

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
            userDataDir,
            empresaId:
              syncEmpresaId,
            deviceToken
          });

          identity.empresaId =
            syncEmpresaId;

          setAuthorizationState(
            'VALID'
          );

          try {
            let cashState;

            try {
              cashState =
                await pullSyncCashSummary({
                  deviceId:
                    syncDeviceId,
                  deviceToken,
                  empresaId:
                    syncEmpresaId,
                  includeMovements:
                    true,
                  timeoutMs:
                    10_000
                });
            } catch (
              summaryError
            ) {
              if (
                isOfflineAuthFailure(
                  summaryError
                )
              ) {
                throw summaryError;
              }

              cashState =
                await pullSyncCashState({
                  deviceId:
                    syncDeviceId,
                  deviceToken,
                  empresaId:
                    syncEmpresaId,
                  timeoutMs:
                    10_000
                });
            }

            mirrorRemoteCashState(
              cashState
            );

            log(
              'OFFLINE CASH STATE MIRRORED',
              {
                empresaId:
                  syncEmpresaId,
                aberto:
                  cashState
                    .aberto ===
                  true
              }
            );
          } catch (
            cashStateError
          ) {
            if (
              isOfflineAuthFailure(
                cashStateError
              )
            ) {
              markOfflineAuthInvalid(
                cashStateError
              );
            } else {
              log(
                'OFFLINE CASH STATE DEFERRED',
                {
                  erro:
                    String(
                      cashStateError &&
                      cashStateError
                        .message ||
                      cashStateError
                    )
                }
              );
            }
          }

          try {
            const nowIso =
              new Date(
                now()
              ).toISOString();

            recoverInterruptedOutbox({
              empresaId:
                syncEmpresaId,
              staleBefore:
                new Date(
                  now() -
                  5 * 60 * 1000
                ).toISOString(),
              updatedAt:
                nowIso,
              nextAttemptAt:
                nowIso
            });
          } catch (
            recoverError
          ) {
            log(
              'OFFLINE OUTBOX RECOVERY DEFERRED',
              recoverError
            );
          }

          void provisionFiscalA1FromServer({
            deviceId:
              syncDeviceId,
            deviceToken,
            empresaId:
              syncEmpresaId,
            userDataDir,
            safeStorage,
            timeoutMs:
              30000
          }).then(
            (summary) => {
              log(
                'OFFLINE FISCAL A1 PROVISION',
                {
                  available:
                    summary.available ===
                    true,
                  stored:
                    summary.stored ===
                    true,
                  certificateId:
                    summary
                      .certificateId ||
                    null
                }
              );
            }
          ).catch(
            (error) => {
              log(
                'OFFLINE FISCAL A1 PROVISION DEFERRED',
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
          );

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
                      multiCompanyError
                        .message ||
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
                        erroReferencePull
                          .message ||
                        erroReferencePull
                      )
                  }
                );
              }
            }
          );
        } catch (
          erroPingDevice
        ) {
          if (
            isOfflineAuthFailure(
              erroPingDevice
            )
          ) {
            markOfflineAuthInvalid(
              erroPingDevice
            );
          } else if (
            deviceToken &&
            syncEmpresaId
          ) {
            setAuthorizationState(
              'TRUSTED_LOCAL'
            );
          }

          const identity =
            getOfflineSyncIdentity();

          identity.deviceToken =
            deviceToken;

          identity.empresaId =
            syncEmpresaId;

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
                  erroPingDevice
                    .message ||
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
            safeStorage
              .isEncryptionAvailable()
        }
      );

      return {
        ok: true,
        deviceId:
          syncDeviceId,
        empresaId:
          syncEmpresaId,
        tokenConfigured
      };
    } catch (
      erroOfflineDb
    ) {
      log(
        'ERRO ISOLADO AO INICIALIZAR SQLITE OFFLINE',
        erroOfflineDb
      );

      return {
        ok: false,
        error:
          erroOfflineDb
      };
    }
  }

  return Object.freeze({
    bootstrap
  });
}

module.exports = {
  resolveRuntimePaths,
  createRuntimeBootstrap
};
