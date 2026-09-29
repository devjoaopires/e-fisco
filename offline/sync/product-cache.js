'use strict';

const DEFAULT_PRODUCT_MIRROR_INTERVAL_MS = 5_000;

function createProductCacheCoordinator({
  pullSyncReferences,
  upsertReferenceBatch,
  buildFiscalCounterSyncPayload,
  reconcileFiscalCounterFromReference,
  intervalMs =
    DEFAULT_PRODUCT_MIRROR_INTERVAL_MS,
  now = () => Date.now()
} = {}) {
  let inFlight = null;
  let lastAt = 0;

  function markSyncedAt(value = now()) {
    lastAt = Number(value) || now();
    return lastAt;
  }

  function getLastSyncedAt() {
    return lastAt;
  }

  async function sync(options = {}) {
    const deviceId =
      String(options.deviceId || '')
        .trim();
    const deviceToken =
      String(options.deviceToken || '')
        .trim();
    const empresaId =
      String(options.empresaId || '')
        .trim();

    if (
      !deviceId ||
      !deviceToken ||
      !empresaId
    ) {
      throw new Error(
        'Identidade autenticada incompleta para espelho de estoque.'
      );
    }

    const cursors = {
      products: null,
      customers: null,
      suppliers: null,
      crediarios: null
    };

    const completed = {
      products: false,
      customers: true,
      suppliers: true,
      crediarios: true
    };

    let pages = 0;
    let products = 0;

    while (!completed.products) {
      if (pages >= 10_000) {
        throw new Error(
          'Espelho de produtos excedeu o limite seguro de páginas.'
        );
      }

      const previousCursor =
        cursors.products;

      const page =
        await pullSyncReferences({
          deviceId,
          deviceToken,
          empresaId,
          limit: 250,
          cursors,
          completed,
          fiscalCounter:
            buildFiscalCounterSyncPayload(
              empresaId,
              deviceId
            )
        });

      reconcileFiscalCounterFromReference(
        empresaId,
        deviceId,
        page.fiscalProfile
      );

      const stored =
        upsertReferenceBatch({
          empresaId,
          products:
            page.products,
          customers: [],
          suppliers: []
        });

      products +=
        stored.products;
      pages += 1;
      completed.products =
        page.done.products === true;
      cursors.products =
        page.cursors.products;

      if (
        !completed.products &&
        cursors.products ===
          previousCursor
      ) {
        throw new Error(
          'Espelho de produtos sem progresso.'
        );
      }
    }

    markSyncedAt();

    return {
      empresaId,
      pages,
      products
    };
  }

  async function syncCoalesced(
    options = {}
  ) {
    const force =
      options.force === true;
    const current =
      now();

    if (
      !force &&
      lastAt > 0 &&
      current - lastAt <
        intervalMs
    ) {
      return {
        skipped: true,
        reason:
          'RECENT_PRODUCT_MIRROR'
      };
    }

    if (inFlight) {
      return inFlight;
    }

    inFlight =
      sync(options)
        .finally(() => {
          inFlight = null;
        });

    return inFlight;
  }

  return Object.freeze({
    sync,
    syncCoalesced,
    markSyncedAt,
    getLastSyncedAt
  });
}

module.exports = {
  DEFAULT_PRODUCT_MIRROR_INTERVAL_MS,
  createProductCacheCoordinator
};
