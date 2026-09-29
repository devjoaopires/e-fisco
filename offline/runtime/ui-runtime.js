'use strict';

function createOfflineUiRuntime({
  getMainWindow,
  getOfflineView,
  isOfflineViewReady,
  isOfflineViewAttached,
  setOfflineViewAttached,
  attachOfflineView,
  resizeOfflineOverlay,
  offlineParkedBounds,
  log = () => {},
  delay = (ms) =>
    new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          ms
        )
    )
} = {}) {
  async function settleBeforeReveal() {
    const offlineView =
      getOfflineView();

    if (
      !offlineView ||
      !isOfflineViewReady() ||
      !offlineView.webContents ||
      offlineView
        .webContents
        .isDestroyed()
    ) {
      return false;
    }

    await delay(20);

    try {
      await offlineView
        .webContents
        .executeJavaScript(
          `(() => {
            if (document && document.body) {
              void document.body.offsetHeight;
            }
            return true;
          })()`,
          true
        );
    } catch (error) {
      log(
        'OFFLINE PRE-REVEAL LAYOUT DEFERRED',
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

    return true;
  }

  function showOverlay() {
    const mainWindow =
      getMainWindow();

    const offlineView =
      getOfflineView();

    if (
      !mainWindow ||
      mainWindow.isDestroyed() ||
      !offlineView ||
      !isOfflineViewReady()
    ) {
      return false;
    }

    try {
      if (
        !isOfflineViewAttached()
      ) {
        attachOfflineView({
          mainWindow,
          offlineView
        });

        setOfflineViewAttached(
          true
        );
      }

      resizeOfflineOverlay();

      offlineView
        .webContents
        .focus();

      return true;
    } catch (error) {
      log(
        'OFFLINE OVERLAY SHOW FAILED',
        error
      );

      return false;
    }
  }

  function hideOverlay() {
    const mainWindow =
      getMainWindow();

    const offlineView =
      getOfflineView();

    if (
      !mainWindow ||
      mainWindow.isDestroyed() ||
      !offlineView
    ) {
      return false;
    }

    try {
      if (
        isOfflineViewAttached()
      ) {
        offlineView
          .setBounds(
            offlineParkedBounds()
          );
      }

      mainWindow
        .webContents
        .focus();

      return true;
    } catch (error) {
      log(
        'OFFLINE OVERLAY HIDE FAILED',
        error
      );

      return false;
    }
  }

  return Object.freeze({
    settleBeforeReveal,
    showOverlay,
    hideOverlay
  });
}

module.exports = {
  createOfflineUiRuntime
};
