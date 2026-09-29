'use strict';

const OFFLINE_FUNCTION_KEYS =
  Object.freeze([
    'F4',
    'F5'
  ]);

function createOfflineShortcutController({
  globalShortcut,
  getUiMode,
  getMainWindow,
  getOfflineView,
  getAuthenticatedOperator,
  log = () => {}
} = {}) {
  let registered = false;

  function dispatch(
    key
  ) {
    const normalizedKey =
      String(
        key ||
        ''
      ).toUpperCase();

    const mainWindow =
      getMainWindow();

    const offlineView =
      getOfflineView();

    if (
      !OFFLINE_FUNCTION_KEYS
        .includes(
          normalizedKey
        ) ||
      getUiMode() !==
        'OFFLINE' ||
      !mainWindow ||
      mainWindow.isDestroyed() ||
      !mainWindow.isFocused() ||
      !offlineView ||
      !offlineView.webContents ||
      offlineView
        .webContents
        .isDestroyed()
    ) {
      return false;
    }

    try {
      offlineView
        .webContents
        .focus();

      const expression = `
      (() => {
        const iframe = document.getElementById('scfOfflinePdv');
        if (!iframe || !iframe.contentWindow || !iframe.contentDocument) {
          return false;
        }

        const pdvWindow = iframe.contentWindow;
        const pdvDocument = iframe.contentDocument;
        const target =
          (
            pdvDocument.activeElement &&
            pdvDocument.activeElement !== pdvDocument.body
          )
            ? pdvDocument.activeElement
            : (
                pdvDocument.getElementById('productBarcode') ||
                pdvDocument.body ||
                pdvDocument
              );

        if (!target || typeof target.dispatchEvent !== 'function') {
          return false;
        }

        try {
          if (typeof target.focus === 'function') {
            target.focus({ preventScroll: true });
          }
        } catch (_) {
          try {
            if (typeof target.focus === 'function') target.focus();
          } catch (_) {}
        }

        const event = new pdvWindow.KeyboardEvent('keydown', {
          key: '${normalizedKey}',
          code: '${normalizedKey}',
          bubbles: true,
          cancelable: true
        });

        target.dispatchEvent(event);
        return true;
      })()
    `;

      void offlineView
        .webContents
        .executeJavaScript(
          expression,
          true
        )
        .then(
          (forwarded) => {
            if (
              forwarded !==
              true
            ) {
              log(
                'OFFLINE FUNCTION KEY FORWARD NOT DELIVERED',
                {
                  key:
                    normalizedKey
                }
              );
            }
          }
        )
        .catch(
          (error) => {
            log(
              'OFFLINE FUNCTION KEY FORWARD FAILED',
              {
                key:
                  normalizedKey,
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

      return true;
    } catch (error) {
      log(
        'OFFLINE FUNCTION KEY FORWARD FAILED',
        {
          key:
            normalizedKey,
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

  function unregister() {
    for (
      const key of
      OFFLINE_FUNCTION_KEYS
    ) {
      try {
        if (
          globalShortcut
            .isRegistered(
              key
            )
        ) {
          globalShortcut
            .unregister(
              key
            );
        }
      } catch (_) {}
    }

    registered = false;
  }

  function register() {
    const mainWindow =
      getMainWindow();

    if (
      registered ||
      getUiMode() !==
        'OFFLINE' ||
      !mainWindow ||
      mainWindow.isDestroyed() ||
      !mainWindow.isFocused()
    ) {
      return registered;
    }

    const newlyRegistered =
      [];

    try {
      for (
        const key of
        OFFLINE_FUNCTION_KEYS
      ) {
        const ok =
          globalShortcut
            .register(
              key,
              () => {
                const currentWindow =
                  getMainWindow();

                if (
                  getUiMode() !==
                    'OFFLINE' ||
                  !currentWindow ||
                  currentWindow
                    .isDestroyed() ||
                  !currentWindow
                    .isFocused()
                ) {
                  return;
                }

                dispatch(
                  key
                );
              }
            );

        if (!ok) {
          throw new Error(
            `Não foi possível registrar ${key}.`
          );
        }

        newlyRegistered
          .push(
            key
          );
      }

      registered = true;

      log(
        'OFFLINE FUNCTION KEYS REGISTERED',
        {
          keys:
            newlyRegistered
        }
      );

      return true;
    } catch (error) {
      unregister();

      log(
        'OFFLINE FUNCTION KEYS REGISTER FAILED',
        error
      );

      return false;
    }
  }

  function sync() {
    const mainWindow =
      getMainWindow();

    if (
      getUiMode() ===
        'OFFLINE' &&
      getAuthenticatedOperator() &&
      mainWindow &&
      !mainWindow.isDestroyed() &&
      mainWindow.isFocused()
    ) {
      return register();
    }

    unregister();

    return false;
  }

  return Object.freeze({
    dispatch,
    unregister,
    register,
    sync,
    isRegistered() {
      return registered;
    }
  });
}

module.exports = {
  OFFLINE_FUNCTION_KEYS,
  createOfflineShortcutController
};
