'use strict';

function createContinuityRecoveryController({
  getMainWindow,
  getOfflineView,
  isOfflineViewReady,
  findPdvContinuityFrame,
  log = () => {}
} = {}) {
  async function restoreOfflineDraft(
    draft
  ) {
    const offlineView =
      getOfflineView();

    if (
      !offlineView ||
      !isOfflineViewReady()
    ) {
      return false;
    }

    const frame =
      await findPdvContinuityFrame(
        offlineView.webContents,
        5000
      );

    if (!frame) {
      log(
        'OFFLINE CONTINUITY LOCAL FRAME NOT FOUND'
      );

      return false;
    }

    try {
      const payload =
        draft &&
        typeof draft ===
          'object'
          ? draft
          : {};

      await frame
        .executeJavaScript(
          `
      (() => {
        window.__scfPdvRestoreContinuityDraft(${JSON.stringify(payload)});
        return true;
      })()
    `,
          true
        );

      return true;
    } catch (error) {
      log(
        'OFFLINE CONTINUITY RESTORE FAILED',
        error
      );

      return false;
    }
  }

  async function hasActiveOfflineSale() {
    const offlineView =
      getOfflineView();

    if (
      !offlineView ||
      !isOfflineViewReady()
    ) {
      return false;
    }

    const frame =
      await findPdvContinuityFrame(
        offlineView.webContents,
        500
      );

    if (!frame) {
      return false;
    }

    try {
      return (
        await frame
          .executeJavaScript(
            `
      (() => window.__scfPdvHasActiveContinuitySale() === true)()
    `,
            true
          )
      ) === true;
    } catch (_) {
      return false;
    }
  }

  async function clearOnlineDraft() {
    const mainWindow =
      getMainWindow();

    if (
      !mainWindow ||
      mainWindow.isDestroyed()
    ) {
      return false;
    }

    const frame =
      await findPdvContinuityFrame(
        mainWindow.webContents,
        800
      );

    if (!frame) {
      return false;
    }

    try {
      const result =
        await frame
          .executeJavaScript(
            `
      (() => {
        const emptyDraft = {
          version: 1,
          saleNumber: '',
          products: [],
          currentProduct: null,
          totalValue: 0,
          activeProducts: 0,
          paymentStageOpen: false
        };

        if (typeof window.__scfPdvRestoreContinuityDraft === 'function') {
          window.__scfPdvRestoreContinuityDraft(emptyDraft);
          return 'RESTORED';
        }

        if (typeof window.scfCancelCurrentSaleFromKeyboard === 'function') {
          window.scfCancelCurrentSaleFromKeyboard({ continuityRecovery: true });
          return 'CANCELLED';
        }

        const list = document.getElementById('fiscalProductsList');
        const activeRows = list
          ? list.querySelectorAll(':scope > .fiscal-danfe-item-wrap:not(.is-preview):not(.is-cancelled)').length
          : 0;
        const currentHasValue = Boolean(
          String(document.getElementById('productName')?.value || '').trim() ||
          String(document.getElementById('productBarcode')?.value || '').trim() ||
          String(document.getElementById('productCode')?.value || '').trim()
        );

        return activeRows === 0 && !currentHasValue
          ? 'ALREADY_EMPTY'
          : 'UNSUPPORTED';
      })()
    `,
            true
          );

      if (
        result ===
        'CANCELLED'
      ) {
        log(
          'OFFLINE CONTINUITY ONLINE CLEAR FALLBACK'
        );
      }

      return (
        result ===
          'RESTORED' ||
        result ===
          'CANCELLED' ||
        result ===
          'ALREADY_EMPTY'
      );
    } catch (error) {
      log(
        'OFFLINE CONTINUITY ONLINE CLEAR FAILED',
        error
      );

      return false;
    }
  }

  return Object.freeze({
    restoreOfflineDraft,
    hasActiveOfflineSale,
    clearOnlineDraft
  });
}

module.exports = {
  createContinuityRecoveryController
};
