'use strict';

const {
  checkDesktopManifest,
  prepareOfflinePackage
} = require('../offline-standby');

const DEFAULT_MANIFEST_INTERVAL_MS =
  5 * 60 * 1000;

function createStandbyController({
  app,
  getUserAgent,
  log = () => {},
  checkDesktopManifestImpl =
    checkDesktopManifest,
  prepareOfflinePackageImpl =
    prepareOfflinePackage,
  intervalMs =
    DEFAULT_MANIFEST_INTERVAL_MS,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval
} = {}) {
  if (!app || typeof app.getVersion !== 'function') {
    throw new Error('Standby controller requires app.');
  }

  if (typeof getUserAgent !== 'function') {
    throw new Error('Standby controller requires getUserAgent.');
  }

  let timerManifestoStandbyInicial = null;
  let timerManifestoStandby = null;

  async function verificarManifestoStandby() {
    try {
      const resultado =
        await checkDesktopManifestImpl({
          userDataDir:
            app.getPath('userData'),

          electronVersion:
            app.getVersion(),

          userAgent:
            getUserAgent(),

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

      if (
        resultado.source === 'REMOTE' &&
        resultado.manifest &&
        resultado.manifest.offlinePackage
      ) {
        try {
          const pacote =
            await prepareOfflinePackageImpl({
              userDataDir:
                app.getPath('userData'),

              electronVersion:
                app.getVersion(),

              manifest:
                resultado.manifest,

              userAgent:
                getUserAgent(),

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
      log(
        'ERRO ISOLADO NO STANDBY MANIFEST',
        erro
      );
    }
  }

  function iniciarMonitorManifestoStandby() {
    if (
      timerManifestoStandbyInicial ||
      timerManifestoStandby
    ) {
      return;
    }

    timerManifestoStandbyInicial =
      setTimeoutFn(
        () => {
          timerManifestoStandbyInicial =
            null;

          verificarManifestoStandby();
        },
        1000
      );

    if (
      timerManifestoStandbyInicial &&
      typeof timerManifestoStandbyInicial.unref ===
        'function'
    ) {
      timerManifestoStandbyInicial.unref();
    }

    timerManifestoStandby =
      setIntervalFn(
        () => {
          verificarManifestoStandby();
        },
        intervalMs
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
    if (timerManifestoStandbyInicial) {
      clearTimeoutFn(
        timerManifestoStandbyInicial
      );

      timerManifestoStandbyInicial =
        null;
    }

    if (timerManifestoStandby) {
      clearIntervalFn(
        timerManifestoStandby
      );

      timerManifestoStandby =
        null;
    }
  }

  return Object.freeze({
    verificarManifestoStandby,
    iniciarMonitorManifestoStandby,
    pararMonitorManifestoStandby
  });
}

module.exports = {
  DEFAULT_MANIFEST_INTERVAL_MS,
  createStandbyController
};
