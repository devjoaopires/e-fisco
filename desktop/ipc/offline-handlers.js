'use strict';

const OFFLINE_READ_CHANNELS = Object.freeze([
  'efisco:offline-product-find',
  'efisco:offline-company-header',
  'efisco:offline-products-list',
  'efisco:offline-customers-list',
  'efisco:offline-crediarios-list',
  'efisco:offline-crediario-detail',
  'efisco:offline-cash-consult',
  'efisco:offline-finance-snapshot'
]);

function errorMessage(error) {
  return (
    error &&
    error.message
      ? error.message
      : String(error)
  );
}

function registerOfflineReadHandlers({
  ipcMain,
  isIpcChannelAuthorized,
  log = () => {},
  resolveOfflineReferenceEmpresaId,
  findOfflineProductForSale,
  getOfflineCompanyHeader,
  listOfflineProductsForSale,
  listOfflineCustomersForCrediario,
  listOfflineCrediariosForF5,
  getOfflineCrediarioDetailForF5,
  consultCashOffline,
  listOfflineSalesForFinance,
  listCashMovements
} = {}) {
  ipcMain.handle(
    'efisco:offline-product-find',
    async (
      event,
      criterio
    ) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-product-find',
          'invoke'
        )
      ) {
        return {
          ok: false,
          error:
            'Origem de consulta offline nao autorizada.'
        };
      }

      try {
        return {
          ok: true,
          result:
            findOfflineProductForSale({
              ...(
                criterio &&
                typeof criterio === 'object'
                  ? criterio
                  : {}
              ),
              empresaId:
                resolveOfflineReferenceEmpresaId()
            })
        };
      } catch (error) {
        log(
          'ERRO IPC OFFLINE PRODUCT',
          error
        );

        return {
          ok: false,
          error:
            errorMessage(error)
        };
      }
    }
  );

  ipcMain.handle(
    'efisco:offline-company-header',
    async (event) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-company-header',
          'invoke'
        )
      ) {
        return {
          ok: false,
          error:
            'Origem de consulta offline da empresa nao autorizada.'
        };
      }

      try {
        return {
          ok: true,
          result:
            getOfflineCompanyHeader()
        };
      } catch (error) {
        log(
          'ERRO IPC OFFLINE COMPANY HEADER',
          error
        );

        return {
          ok: false,
          error:
            errorMessage(error)
        };
      }
    }
  );

  ipcMain.handle(
    'efisco:offline-products-list',
    async (event) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-products-list',
          'invoke'
        )
      ) {
        return {
          ok: false,
          error:
            'Origem de listagem offline nao autorizada.'
        };
      }

      try {
        return {
          ok: true,
          result:
            listOfflineProductsForSale({
              empresaId:
                resolveOfflineReferenceEmpresaId()
            })
        };
      } catch (error) {
        log(
          'ERRO IPC OFFLINE PRODUCTS LIST',
          error
        );

        return {
          ok: false,
          error:
            errorMessage(error)
        };
      }
    }
  );

  ipcMain.handle(
    'efisco:offline-customers-list',
    async (event, payload) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-customers-list',
          'invoke'
        )
      ) {
        return {
          ok: false,
          error:
            'Origem de listagem offline de clientes nao autorizada.'
        };
      }

      try {
        return {
          ok: true,
          result:
            listOfflineCustomersForCrediario(
              payload || {}
            )
        };
      } catch (error) {
        log(
          'ERRO IPC OFFLINE CUSTOMERS LIST',
          error
        );

        return {
          ok: false,
          error:
            errorMessage(error)
        };
      }
    }
  );

  ipcMain.handle(
    'efisco:offline-crediarios-list',
    async (event, payload) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-crediarios-list',
          'invoke'
        )
      ) {
        return {
          ok: false,
          error:
            'Origem de listagem offline de crediarios nao autorizada.'
        };
      }

      try {
        return {
          ok: true,
          result:
            listOfflineCrediariosForF5(
              payload || {}
            )
        };
      } catch (error) {
        log(
          'ERRO IPC OFFLINE CREDIARIOS LIST',
          error
        );

        return {
          ok: false,
          error:
            errorMessage(error)
        };
      }
    }
  );

  ipcMain.handle(
    'efisco:offline-crediario-detail',
    async (event, payload) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-crediario-detail',
          'invoke'
        )
      ) {
        return {
          ok: false,
          error:
            'Origem de detalhe offline de crediário não autorizada.'
        };
      }

      try {
        return {
          ok: true,
          result:
            getOfflineCrediarioDetailForF5(
              payload || {}
            )
        };
      } catch (error) {
        log(
          'ERRO IPC OFFLINE CREDIARIO DETAIL',
          error
        );

        return {
          ok: false,
          error:
            errorMessage(error)
        };
      }
    }
  );

  const registerOfflineReadHandler = (
    channel,
    logLabel,
    handler
  ) => {
    ipcMain.handle(
      channel,
      async (event, payload) => {
        if (
          !isIpcChannelAuthorized(
            event,
            channel,
            'invoke'
          )
        ) {
          return {
            ok: false,
            error:
              'Origem offline nao autorizada.'
          };
        }

        try {
          return {
            ok: true,
            result:
              await handler(
                payload || {}
              )
          };
        } catch (error) {
          log(
            logLabel,
            error
          );

          return {
            ok: false,
            error:
              errorMessage(error)
          };
        }
      }
    );
  };

  registerOfflineReadHandler(
    'efisco:offline-cash-consult',
    'ERRO IPC OFFLINE CASH CONSULT',
    (payload) =>
      consultCashOffline({
        ...payload,
        empresaId:
          resolveOfflineReferenceEmpresaId()
      })
  );

  registerOfflineReadHandler(
    'efisco:offline-finance-snapshot',
    'ERRO IPC OFFLINE FINANCE SNAPSHOT',
    (payload) => {
      const empresaId =
        resolveOfflineReferenceEmpresaId();

      const salesPage =
        listOfflineSalesForFinance({
          ...(payload || {}),
          empresaId
        });

      const caixaConsulta =
        consultCashOffline({
          incluirResumo: true,
          empresaId
        });

      const historicos =
        empresaId
          ? listCashMovements({
              empresaId,
              limit: 5000
            }).slice().reverse()
          : [];

      const mapMovimento =
        (row) => {
          let detalhe = {};

          detalhe =
            row &&
            row.payload &&
            typeof row.payload === 'object'
              ? row.payload
              : {};

          const tipo =
            String(
              row &&
              row.movementType ||
              ''
            )
              .trim()
              .toUpperCase();

          return {
            id:
              String(
                row &&
                row.movementId ||
                ''
              ),
            caixaSessaoId:
              String(
                row &&
                row.sessionId ||
                ''
              ),
            tipo,
            valor:
              Number(
                row &&
                row.direction ||
                0
              ) *
              Number(
                row &&
                row.amountCentavos ||
                0
              ) /
              100,
            motivo:
              String(
                detalhe.motivo ||
                detalhe.meio ||
                tipo ||
                ''
              ).trim(),
            descricao:
              String(
                detalhe.descricao ||
                ''
              ).trim(),
            operadorNome:
              String(
                detalhe.operadorNome ||
                detalhe.nomeOperador ||
                detalhe.operatorName ||
                ''
              ).trim(),
            operadorId:
              String(
                detalhe.operadorId ||
                detalhe.operatorId ||
                ''
              ).trim(),
            criadoEm:
              String(
                row &&
                row.occurredAt ||
                ''
              )
          };
        };

      const movimentosHistoricos =
        historicos
          .map(mapMovimento)
          .filter(
            (movimento) =>
              movimento.tipo !==
                'VENDA_PAGA' &&
              movimento.tipo !==
                'CREDIARIO_RECEBIMENTO'
          );

      const caixaSeguro =
        caixaConsulta &&
        caixaConsulta.caixa &&
        caixaConsulta.caixa.resumo
          ? {
              ...caixaConsulta,
              caixa: {
                ...caixaConsulta.caixa,
                resumo: {
                  ...caixaConsulta.caixa.resumo,
                  movimentos:
                    Array.isArray(
                      caixaConsulta
                        .caixa
                        .resumo
                        .movimentos
                    )
                      ? caixaConsulta
                          .caixa
                          .resumo
                          .movimentos
                          .filter(
                            (movimento) => {
                              const tipo =
                                String(
                                  movimento &&
                                  movimento.tipo ||
                                  ''
                                )
                                  .trim()
                                  .toUpperCase();

                              return (
                                tipo !==
                                  'VENDA_PAGA' &&
                                tipo !==
                                  'CREDIARIO_RECEBIMENTO'
                              );
                            }
                          )
                      : []
                }
              }
            }
          : caixaConsulta;

      return {
        ...salesPage,
        caixaConsulta:
          caixaSeguro,
        movimentosCaixa:
          caixaSeguro &&
          caixaSeguro.caixa &&
          caixaSeguro
            .caixa
            .resumo &&
          Array.isArray(
            caixaSeguro
              .caixa
              .resumo
              .movimentos
          )
            ? caixaSeguro
                .caixa
                .resumo
                .movimentos
            : [],
        movimentosCaixaHistoricoFinanceiro:
          movimentosHistoricos,
        evolucaoSaldo7Dias: {
          pontos: []
        }
      };
    }
  );

  return OFFLINE_READ_CHANNELS;
}

const OFFLINE_MUTATION_CHANNELS = Object.freeze([
  'efisco:offline-crediario-open',
  'efisco:offline-crediario-items-update',
  'efisco:offline-cash-open',
  'efisco:offline-cash-movement',
  'efisco:offline-cash-close',
  'efisco:offline-sale-paid'
]);

function registerOfflineMutationHandlers({
  ipcMain,
  isIpcChannelAuthorized,
  log = () => {},
  assertOfflineMutationAuthorized,
  buildOfflineCrediarioAtomicInput,
  openCrediarioOfflineAtomic,
  updateOfflineCrediarioItemsForF5,
  openCashOffline,
  registerCashMovementOffline,
  closeCashOffline,
  withAuthenticatedOfflineOperator,
  getOfflineDatabase,
  getOfflineSyncIdentity,
  getOrCreateSyncDeviceId,
  registerPaidSaleOffline,
  resolveOfflineReferenceEmpresaId,
  getUserDataDir,
  safeStorage
} = {}) {
  ipcMain.handle(
    'efisco:offline-crediario-open',
    async (event, payload) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-crediario-open',
          'invoke'
        )
      ) {
        return {
          ok: false,
          error:
            'Origem de abertura offline de crediário não autorizada.'
        };
      }

      try {
        assertOfflineMutationAuthorized();

        const sale =
          payload &&
          payload.sale &&
          typeof payload.sale === 'object'
            ? payload.sale
            : payload;

        const input =
          buildOfflineCrediarioAtomicInput(
            sale || {}
          );

        const result =
          openCrediarioOfflineAtomic(
            input
          );

        return {
          ok: true,
          result: {
            ...result,
            crediarioId:
              input.crediarioId,
            contaReceberId:
              input.contaReceberId,
            offline: true,
            syncPendente: true
          }
        };
      } catch (error) {
        log(
          'ERRO IPC OFFLINE CREDIARIO OPEN',
          error
        );

        return {
          ok: false,
          error:
            errorMessage(error)
        };
      }
    }
  );

  ipcMain.handle(
    'efisco:offline-crediario-items-update',
    async (event, payload) => {
      if (
        !isIpcChannelAuthorized(
          event,
          'efisco:offline-crediario-items-update',
          'invoke'
        )
      ) {
        return {
          ok: false,
          error:
            'Origem de atualização offline de crediário não autorizada.'
        };
      }

      try {
        assertOfflineMutationAuthorized();

        return {
          ok: true,
          result:
            updateOfflineCrediarioItemsForF5(
              payload || {}
            )
        };
      } catch (error) {
        log(
          'ERRO IPC OFFLINE CREDIARIO ITEMS UPDATE',
          error
        );

        return {
          ok: false,
          error:
            errorMessage(error)
        };
      }
    }
  );

  const registerOfflineMutationHandler = (
    channel,
    logLabel,
    handler
  ) => {
    ipcMain.handle(
      channel,
      async (event, payload) => {
        if (
          !isIpcChannelAuthorized(
            event,
            channel,
            'invoke'
          )
        ) {
          return {
            ok: false,
            error:
              'Origem offline nao autorizada.'
          };
        }

        try {
          return {
            ok: true,
            result:
              await handler(
                payload || {}
              )
          };
        } catch (error) {
          log(
            logLabel,
            error
          );

          return {
            ok: false,
            error:
              errorMessage(error)
          };
        }
      }
    );
  };

  registerOfflineMutationHandler(
    'efisco:offline-cash-open',
    'ERRO IPC OFFLINE CASH OPEN',
    (payload) => {
      assertOfflineMutationAuthorized();

      return openCashOffline(
        withAuthenticatedOfflineOperator(
          payload
        )
      );
    }
  );

  registerOfflineMutationHandler(
    'efisco:offline-cash-movement',
    'ERRO IPC OFFLINE CASH MOVEMENT',
    (payload) => {
      assertOfflineMutationAuthorized();

      return registerCashMovementOffline(
        withAuthenticatedOfflineOperator(
          payload
        )
      );
    }
  );

  registerOfflineMutationHandler(
    'efisco:offline-cash-close',
    'ERRO IPC OFFLINE CASH CLOSE',
    (payload) => {
      assertOfflineMutationAuthorized();

      return closeCashOffline(
        withAuthenticatedOfflineOperator(
          payload
        )
      );
    }
  );

  registerOfflineMutationHandler(
    'efisco:offline-sale-paid',
    'ERRO IPC OFFLINE SALE PAID',
    (payload) => {
      assertOfflineMutationAuthorized();

      const offlineDb =
        getOfflineDatabase();

      const syncIdentity =
        typeof getOfflineSyncIdentity ===
          'function'
          ? getOfflineSyncIdentity()
          : null;

      const deviceId =
        syncIdentity &&
        syncIdentity.deviceId
          ? String(
              syncIdentity.deviceId
            )
          : getOrCreateSyncDeviceId({
              db: offlineDb
            });

      return registerPaidSaleOffline(
        withAuthenticatedOfflineOperator(
          payload &&
          payload.sale
        ),
        {
          empresaId:
            resolveOfflineReferenceEmpresaId(),
          deviceId,
          userDataDir:
            getUserDataDir(),
          safeStorage,
          requireFiscalContingency:
            true
        }
      );
    }
  );

  return OFFLINE_MUTATION_CHANNELS;
}

module.exports = {
  OFFLINE_READ_CHANNELS,
  OFFLINE_MUTATION_CHANNELS,
  registerOfflineReadHandlers,
  registerOfflineMutationHandlers
};
