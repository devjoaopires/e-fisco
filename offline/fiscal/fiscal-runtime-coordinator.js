'use strict';

function createFiscalRuntimeCoordinator({
  enabled = true,
  resolveSyncIdentity,
  getFiscalProfileCache,
  peekNextNfceNumber,
  reconcileLocalNfceCounter,
  runFiscalReconnectCycle,
  getUserDataDir,
  safeStorage,
  log = () => {}
} = {}) {
  let transmissionLockLogged =
    false;

  function buildCounterSyncPayload(
    empresaId,
    deviceId
  ) {
    try {
      const profile =
        getFiscalProfileCache(
          empresaId
        );

      if (
        !profile ||
        String(
          profile.ambiente || ''
        ).toUpperCase() !==
          'PRODUCAO'
      ) {
        return null;
      }

      const counter =
        peekNextNfceNumber({
          empresaId,
          deviceId,
          ambiente:
            'PRODUCAO',
          modelo: 65,
          serie:
            String(
              profile.serieNfce
            )
        });

      return {
        ambiente:
          'PRODUCAO',
        modelo: 65,
        serie:
          String(
            profile.serieNfce
          ),
        proximoNumero:
          Number(
            counter
              .proximoNumero
          )
      };
    } catch (_) {
      return null;
    }
  }

  function reconcileCounterFromReference(
    empresaId,
    deviceId,
    fiscalProfile
  ) {
    if (
      !fiscalProfile ||
      typeof fiscalProfile !==
        'object'
    ) {
      return null;
    }

    const proximoNumero =
      Number(
        fiscalProfile
          .proximoNumeroNfce
      );

    if (
      !Number.isSafeInteger(
        proximoNumero
      ) ||
      proximoNumero < 1
    ) {
      return null;
    }

    return reconcileLocalNfceCounter({
      empresaId,
      deviceId,
      ambiente:
        'PRODUCAO',
      modelo: 65,
      serie:
        String(
          fiscalProfile
            .serieNfce ||
          ''
        ),
      proximoNumero
    });
  }

  async function maintainLeaseInventory() {
    return {
      action: 'SKIP',
      reason:
        'SINGLE_DESKTOP_NUMBER_OWNER'
    };
  }

  function logLeaseMaintenance(
    summary
  ) {
    if (
      !summary ||
      !summary.action ||
      [
        'NONE',
        'WAIT_RETRY',
        'SKIP'
      ].includes(
        summary.action
      )
    ) {
      return;
    }

    log(
      'OFFLINE FISCAL LEASE MAINTENANCE',
      {
        action:
          summary.action,
        remainingNumbers:
          Number(
            summary
              .remainingNumbers ||
            0
          ),
        activeLeases:
          Number(
            summary
              .activeLeases ||
            0
          )
      }
    );
  }

  async function maintainTransmission() {
    if (
      enabled !== true
    ) {
      if (
        !transmissionLockLogged
      ) {
        transmissionLockLogged =
          true;

        log(
          'OFFLINE FISCAL SVRS TRANSMISSION LOCKED',
          {
            enabled: false,
            reason:
              'STEP39_EXPLICIT_SAFETY_LOCK'
          }
        );
      }

      return {
        enabled: false,
        locked: true,
        recoveredStale: 0,
        summary: null
      };
    }

    const identity =
      resolveSyncIdentity();

    if (
      !identity ||
      !identity.deviceId ||
      !identity.empresaId
    ) {
      return {
        enabled: false,
        locked: false,
        skipped: true,
        reason:
          'IDENTIDADE_SYNC_INCOMPLETA'
      };
    }

    return runFiscalReconnectCycle({
      enabled: true,
      empresaId:
        identity.empresaId,
      deviceId:
        identity.deviceId,
      userDataDir:
        getUserDataDir(),
      safeStorage,
      timeoutMs:
        30_000,
      staleAfterMs:
        5 * 60_000,
      retryDelayMs:
        60_000,
      reconcileDelayMs:
        30_000,
      limit: 20
    });
  }

  function logTransmissionSummary(
    result
  ) {
    if (
      !result ||
      result.enabled !== true
    ) {
      return;
    }

    const summary =
      result.summary || {};

    const activity =
      Number(
        result.recoveredStale ||
        0
      ) +
      Number(
        summary.claimed || 0
      ) +
      Number(
        summary.authorized || 0
      ) +
      Number(
        summary.rejected || 0
      ) +
      Number(
        summary.retry || 0
      ) +
      Number(
        summary.reconcile || 0
      ) +
      Number(
        summary.manualReview || 0
      );

    if (
      activity <= 0
    ) {
      return;
    }

    log(
      'OFFLINE FISCAL OUTBOX CYCLE',
      {
        recoveredStale:
          Number(
            result
              .recoveredStale ||
            0
          ),
        considered:
          Number(
            summary
              .considered ||
            0
          ),
        claimed:
          Number(
            summary.claimed ||
            0
          ),
        authorized:
          Number(
            summary
              .authorized ||
            0
          ),
        rejected:
          Number(
            summary
              .rejected ||
            0
          ),
        retry:
          Number(
            summary.retry ||
            0
          ),
        reconcile:
          Number(
            summary
              .reconcile ||
            0
          ),
        manualReview:
          Number(
            summary
              .manualReview ||
            0
          )
      }
    );
  }

  return Object.freeze({
    buildCounterSyncPayload,
    reconcileCounterFromReference,
    maintainLeaseInventory,
    logLeaseMaintenance,
    maintainTransmission,
    logTransmissionSummary
  });
}

module.exports = {
  createFiscalRuntimeCoordinator
};
