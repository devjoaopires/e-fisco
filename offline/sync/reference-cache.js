'use strict';

const DEFAULT_F5_MIRROR_INTERVAL_MS = 5_000;

function createReferenceCacheCoordinator({
  crypto,
  pullSyncReferences,
  upsertReferenceBatch,
  finalizeCrediariosSnapshot,
  buildFiscalCounterSyncPayload,
  reconcileFiscalCounterFromReference,
  markProductSyncedAt = () => {},
  intervalMs =
    DEFAULT_F5_MIRROR_INTERVAL_MS,
  log = () => {},
  now = () => Date.now()
} = {}) {
  let f5InFlight = null;
  let f5LastAt = 0;

  async function syncAll(
    options = {}
  ) {
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
        'Identidade autenticada incompleta para pull de referências.'
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
      customers: false,
      suppliers: false,
      crediarios: false
    };

    const totals = {
      products: 0,
      customers: 0,
      suppliers: 0,
      crediarios: 0
    };

    const maxPages =
      10_000;
    let pages = 0;

    const crediariosSnapshotToken =
      'cred-' +
      now() +
      '-' +
      crypto
        .randomBytes(8)
        .toString('hex');

    while (
      !completed.products ||
      !completed.customers ||
      !completed.suppliers ||
      !completed.crediarios
    ) {
      if (
        pages >=
        maxPages
      ) {
        throw new Error(
          'Pull de referências excedeu o limite seguro de páginas.'
        );
      }

      const previousCursors = {
        ...cursors
      };

      const fiscalCounterPayload =
        buildFiscalCounterSyncPayload(
          empresaId,
          deviceId
        );

      log(
        'OFFLINE FISCAL COUNTER PULL REQUEST',
        fiscalCounterPayload
      );

      const page =
        await pullSyncReferences({
          deviceId,
          deviceToken,
          empresaId,
          limit: 250,
          cursors,
          completed,
          fiscalCounter:
            fiscalCounterPayload
        });

      log(
        'OFFLINE FISCAL COUNTER PULL RESPONSE',
        {
          proximoNumeroNfce:
            page &&
            page.fiscalProfile &&
            page.fiscalProfile
              .proximoNumeroNfce != null
              ? page
                  .fiscalProfile
                  .proximoNumeroNfce
              : null
        }
      );

      const stored =
        upsertReferenceBatch({
          empresaId,
          products:
            page.products,
          customers:
            page.customers,
          suppliers:
            page.suppliers,
          crediarios:
            page.crediarios,
          crediariosSnapshotToken,
          fiscalProfile:
            page.fiscalProfile
        });

      reconcileFiscalCounterFromReference(
        empresaId,
        deviceId,
        page.fiscalProfile
      );

      totals.products +=
        stored.products;
      totals.customers +=
        stored.customers;
      totals.suppliers +=
        stored.suppliers;
      totals.crediarios +=
        stored.crediarios;
      pages += 1;

      for (
        const name of
        [
          'products',
          'customers',
          'suppliers',
          'crediarios'
        ]
      ) {
        if (
          completed[name]
        ) {
          continue;
        }

        completed[name] =
          page.done[name] ===
          true;

        cursors[name] =
          page.cursors[name];

        if (
          !completed[name] &&
          cursors[name] ===
            previousCursors[name]
        ) {
          throw new Error(
            'Pull de referências sem progresso em ' +
            name +
            '.'
          );
        }
      }
    }

    const crediariosRemovidos =
      finalizeCrediariosSnapshot({
        empresaId,
        snapshotToken:
          crediariosSnapshotToken
      });

    markProductSyncedAt(
      now()
    );

    return {
      empresaId,
      pages,
      crediariosRemovidos,
      ...totals
    };
  }

  async function syncF5(
    options = {}
  ) {
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
        'Identidade autenticada incompleta para espelho offline do F5.'
      );
    }

    const cursors = {
      products: null,
      customers: null,
      suppliers: null,
      crediarios: null
    };

    const completed = {
      products: true,
      customers: false,
      suppliers: true,
      crediarios: false
    };

    const totals = {
      customers: 0,
      crediarios: 0
    };

    const crediariosSnapshotToken =
      'f5-' +
      now() +
      '-' +
      crypto
        .randomBytes(8)
        .toString('hex');

    let pages = 0;

    while (
      !completed.customers ||
      !completed.crediarios
    ) {
      if (
        pages >=
        10_000
      ) {
        throw new Error(
          'Espelho offline do F5 excedeu o limite seguro de páginas.'
        );
      }

      const previousCustomersCursor =
        cursors.customers;
      const previousCrediariosCursor =
        cursors.crediarios;

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
          products: [],
          customers:
            page.customers,
          suppliers: [],
          crediarios:
            page.crediarios,
          crediariosSnapshotToken
        });

      totals.customers +=
        stored.customers;
      totals.crediarios +=
        stored.crediarios;
      pages += 1;

      if (
        !completed.customers
      ) {
        completed.customers =
          page.done.customers ===
          true;

        cursors.customers =
          page.cursors.customers;

        if (
          !completed.customers &&
          cursors.customers ===
            previousCustomersCursor
        ) {
          throw new Error(
            'Espelho offline do F5 sem progresso em customers.'
          );
        }
      }

      if (
        !completed.crediarios
      ) {
        completed.crediarios =
          page.done.crediarios ===
          true;

        cursors.crediarios =
          page.cursors.crediarios;

        if (
          !completed.crediarios &&
          cursors.crediarios ===
            previousCrediariosCursor
        ) {
          throw new Error(
            'Espelho offline do F5 sem progresso em crediarios.'
          );
        }
      }
    }

    const crediariosRemovidos =
      finalizeCrediariosSnapshot({
        empresaId,
        snapshotToken:
          crediariosSnapshotToken
      });

    f5LastAt =
      now();

    return {
      empresaId,
      pages,
      crediariosRemovidos,
      ...totals
    };
  }

  async function syncF5Coalesced(
    options = {}
  ) {
    const force =
      options.force === true;
    const current =
      now();

    if (
      !force &&
      f5LastAt > 0 &&
      current - f5LastAt <
        intervalMs
    ) {
      return {
        skipped: true,
        reason:
          'RECENT_F5_MIRROR'
      };
    }

    if (f5InFlight) {
      return f5InFlight;
    }

    f5InFlight =
      syncF5(options)
        .finally(() => {
          f5InFlight = null;
        });

    return f5InFlight;
  }

  return Object.freeze({
    syncAll,
    syncF5,
    syncF5Coalesced
  });
}

module.exports = {
  DEFAULT_F5_MIRROR_INTERVAL_MS,
  createReferenceCacheCoordinator
};
