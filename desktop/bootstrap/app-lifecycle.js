'use strict';

function createAppLifecycle({
  app,
  getAllWindows,
  installIpc,
  shouldBlockStartForUpdate,
  bootstrapRuntime,
  createWindow,
  getMainWindow,
  unregisterOfflineFunctionShortcuts,
  stopStandbyMonitor,
  stopOfflineRuntimeMonitor,
  stopContinuityMirror,
  getOfflineUiServer,
  clearOfflineUiServer,
  closeOfflineDatabase
} = {}) {
  let started = false;

  function focusExistingWindow() {
    const mainWindow =
      getMainWindow();

    if (!mainWindow) {
      return false;
    }

    if (
      mainWindow.isMinimized()
    ) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();

    return true;
  }

  function registerLifecycleEvents() {
    app.on(
      'second-instance',
      () => {
        focusExistingWindow();
      }
    );

    app.on(
      'before-quit',
      () => {
        unregisterOfflineFunctionShortcuts();
        stopStandbyMonitor();
        stopOfflineRuntimeMonitor();
        stopContinuityMirror();

        const offlineUiServer =
          getOfflineUiServer();

        if (offlineUiServer) {
          void offlineUiServer
            .close()
            .catch(
              () => {}
            );

          clearOfflineUiServer();
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
          getAllWindows()
            .length ===
          0
        ) {
          void createWindow();
        }
      }
    );
  }

  function start() {
    if (started) {
      return false;
    }

    started = true;

    const gotLock =
      app.requestSingleInstanceLock();

    if (!gotLock) {
      app.quit();
      return false;
    }

    installIpc();

    app.whenReady().then(
      async () => {
        if (
          shouldBlockStartForUpdate()
        ) {
          app.quit();
          return;
        }

        await bootstrapRuntime();
        await createWindow();
      }
    );

    registerLifecycleEvents();

    return true;
  }

  return Object.freeze({
    start,
    focusExistingWindow
  });
}

module.exports = {
  createAppLifecycle
};
