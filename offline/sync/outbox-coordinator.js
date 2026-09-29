'use strict';

function createOutboxCoordinator({
  resolveSyncIdentity,
  getAuthorizationState,
  getOutboxStatusSummary,
  listAuthorizedNfcePendingSync,
  enqueueOutboxOperation,
  createHttpSyncTransport,
  processOutboxOnce,
  log = () => {}
} = {}) {
  function statusSummary() {
    const identity =
      resolveSyncIdentity();

    if (!identity) {
      return {};
    }

    return getOutboxStatusSummary(
      identity.empresaId
    );
  }

  function activeCount(
    summary
  ) {
    return [
      'PENDING',
      'RETRY',
      'SENDING'
    ].reduce(
      (total, status) =>
        total +
        Number(
          summary[status] || 0
        ),
      0
    );
  }

  function enqueueAuthorizedNfceResultSync() {
    const identity =
      resolveSyncIdentity();

    if (!identity) {
      return {
        considered: 0,
        enqueued: 0
      };
    }

    const empresaId =
      identity.empresaId;

    const documents =
      listAuthorizedNfcePendingSync({
        empresaId,
        limit: 50
      });

    let enqueued = 0;

    for (
      const document of
      documents
    ) {
      const operationId =
        'nfce-auth:' +
        document.fiscalId;

      const payload = {
        saleId:
          document.saleId,
        fiscalId:
          document.fiscalId,
        ambiente:
          document.ambiente,
        modelo:
          document.modelo,
        serie:
          document.serie,
        numero:
          document.numero,
        chaveAcesso:
          document.chaveAcesso,
        tipoEmissao:
          document.tipoEmissao,
        dataHoraEmissao:
          document.dataHoraEmissao,
        protocolo:
          document.protocolo,
        cStat:
          document.cStat,
        xMotivo:
          document.xMotivo ||
          'Autorizado o uso da NF-e',
        autorizadoEm:
          document.autorizadoEm,
        contingenciaOffline:
          true,
        pendenteTransmissao:
          false,
        nfeProcXml:
          Buffer
            .from(
              document.processedXml
            )
            .toString('utf8')
      };

      const dependencies =
        document
          .saleSyncOperationId
          ? [
              document
                .saleSyncOperationId
            ]
          : [];

      const result =
        enqueueOutboxOperation({
          empresaId,
          operationId,
          type:
            'NFCE_AUTHORIZED',
          entityId:
            document.saleId,
          payload,
          dependencies
        });

      if (
        result.applied
      ) {
        enqueued += 1;
      }
    }

    return {
      considered:
        documents.length,
      enqueued
    };
  }

  async function syncPending() {
    const identity =
      resolveSyncIdentity();

    if (
      !identity ||
      getAuthorizationState() ===
        'INVALID'
    ) {
      return statusSummary();
    }

    const fiscalAuthorizationSync =
      enqueueAuthorizedNfceResultSync();

    if (
      fiscalAuthorizationSync
        .enqueued > 0
    ) {
      log(
        'OFFLINE FISCAL AUTHORIZATION SYNC QUEUED',
        {
          enqueued:
            fiscalAuthorizationSync
              .enqueued
        }
      );
    }

    const baseTransport =
      createHttpSyncTransport({
        enabled: true,
        deviceId:
          identity.deviceId,
        deviceToken:
          identity.deviceToken,
        timeoutMs:
          15_000
      });

    const guardedTransport =
      async (operation) => {
        const result =
          await baseTransport(
            operation
          );

        if (
          result &&
          result.authFailure ===
            true
        ) {
          const error =
            new Error(
              result.error ||
              'Autenticação do device recusada pelo servidor.'
            );

          error.code =
            'SYNC_DEVICE_AUTH_FAILED';

          error.httpStatus =
            result.httpStatus;

          throw error;
        }

        return result;
      };

    for (
      let cycle = 0;
      cycle < 50;
      cycle += 1
    ) {
      const result =
        await processOutboxOnce({
          empresaId:
            identity.empresaId,
          transport:
            guardedTransport,
          limit: 20
        });

      if (
        !result ||
        result.considered === 0
      ) {
        break;
      }
    }

    return statusSummary();
  }

  return Object.freeze({
    statusSummary,
    activeCount,
    enqueueAuthorizedNfceResultSync,
    syncPending
  });
}

module.exports = {
  createOutboxCoordinator
};
