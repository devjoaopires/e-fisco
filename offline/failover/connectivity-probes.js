'use strict';

const DEFAULT_WIX_PROBE_TIMEOUT_MS = 7_000;
const DEFAULT_STARTUP_PROBE_TIMEOUT_MS = 900;
const DEFAULT_SYNC_PROBE_TIMEOUT_MS = 10_000;

function createConnectivityProbes({
  net,
  https,
  onlineUrl,
  userAgent,
  pingSyncDevice,
  getSyncIdentity,
  setSyncEmpresaId,
  setAuthorizationValid,
  isOfflineAuthFailure,
  markOfflineAuthInvalid,
  wixProbeTimeoutMs =
    DEFAULT_WIX_PROBE_TIMEOUT_MS,
  startupProbeTimeoutMs =
    DEFAULT_STARTUP_PROBE_TIMEOUT_MS,
  syncProbeTimeoutMs =
    DEFAULT_SYNC_PROBE_TIMEOUT_MS
} = {}) {
  function requestHead(
    timeoutMs,
    timeoutMessage
  ) {
    return new Promise(
      (resolve) => {
        let settled = false;

        const finish =
          (value) => {
            if (settled) {
              return;
            }

            settled = true;
            resolve(
              value === true
            );
          };

        const req =
          https.request(
            onlineUrl,
            {
              method: 'HEAD',
              headers: {
                'user-agent':
                  userAgent(),
                accept:
                  'text/html,*/*'
              }
            },
            (res) => {
              const status =
                Number(
                  res.statusCode ||
                  0
                );

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
              new Error(
                timeoutMessage
              )
            );
          }
        );

        req.on(
          'error',
          () => finish(false)
        );

        req.end();
      }
    );
  }

  async function probeWixReachableStartup(
    timeoutMs =
      startupProbeTimeoutMs
  ) {
    try {
      if (
        net.isOnline() ===
        false
      ) {
        return false;
      }
    } catch (_) {}

    return requestHead(
      timeoutMs,
      'Startup connectivity probe timeout.'
    );
  }

  function probeWixReachable() {
    return requestHead(
      wixProbeTimeoutMs,
      'Wix probe timeout.'
    );
  }

  async function probeSyncReachable() {
    const identity =
      getSyncIdentity();

    if (
      !identity ||
      !identity.deviceToken
    ) {
      return {
        reachable: false,
        authenticated: false
      };
    }

    try {
      const ping =
        await pingSyncDevice({
          deviceId:
            identity.deviceId,
          deviceToken:
            identity.deviceToken,
          timeoutMs:
            syncProbeTimeoutMs
        });

      if (
        identity.empresaId &&
        ping.empresaId !==
          identity.empresaId
      ) {
        const error =
          new Error(
            'Empresa retornada pelo sync mudou durante a execução.'
          );

        error.code =
          'SYNC_DEVICE_AUTH_FAILED';

        throw error;
      }

      setSyncEmpresaId(
        ping.empresaId
      );

      setAuthorizationValid();

      return {
        reachable: true,
        authenticated: true
      };
    } catch (error) {
      if (
        isOfflineAuthFailure(
          error
        )
      ) {
        markOfflineAuthInvalid(
          error
        );

        return {
          reachable: true,
          authenticated: false,
          authInvalid: true
        };
      }

      return {
        reachable: false,
        authenticated: false,
        error
      };
    }
  }

  return Object.freeze({
    probeWixReachableStartup,
    probeWixReachable,
    probeSyncReachable
  });
}

module.exports = {
  DEFAULT_WIX_PROBE_TIMEOUT_MS,
  DEFAULT_STARTUP_PROBE_TIMEOUT_MS,
  DEFAULT_SYNC_PROBE_TIMEOUT_MS,
  createConnectivityProbes
};
