'use strict';

function createFramePrintBridge({
  markers,
  getMainWindow,
  getOfflineView,
  findTrustedPdvFrame,
  isTrustedPdvFrameForContents,
  sanitizeNavigationUrlForLog,
  processFiscalCounterRequest,
  respondFiscalCounterError,
  enqueuePrint,
  log = () => {}
} = {}) {
  const {
    onlineNfceNumberResponse,
    nfceCounter,
    contingencyPrintDiag,
    print
  } = markers;

  function installConsoleFrameChannel(
    contentsAlvo = null
  ) {
    const mainWindow =
      getMainWindow();

    const contents =
      contentsAlvo ||
      (
        mainWindow &&
        !mainWindow.isDestroyed()
          ? mainWindow.webContents
          : null
      );

    if (
      !contents ||
      contents.isDestroyed()
    ) {
      return;
    }

    contents.on(
      'console-message',
      async (
        details,
        levelDeprecated,
        messageDeprecated,
        lineDeprecated,
        sourceIdDeprecated
      ) => {
        let message = '';
        let frame = null;

        if (
          details &&
          typeof details ===
            'object'
        ) {
          if (
            typeof details.message ===
              'string'
          ) {
            message =
              details.message;
          }

          if (
            details.frame
          ) {
            frame =
              details.frame;
          }
        }

        if (
          !message &&
          typeof messageDeprecated ===
            'string'
        ) {
          message =
            messageDeprecated;
        }

        const privilegedFrameMarker =
          [
            onlineNfceNumberResponse,
            nfceCounter,
            contingencyPrintDiag,
            print
          ]
            .find(
              (marker) =>
                message.startsWith(
                  marker
                )
            ) || '';

        if (
          privilegedFrameMarker &&
          !(
            await isTrustedPdvFrameForContents(
              contents,
              frame
            )
          )
        ) {
          log(
            'FRAME BRIDGE DENIED',
            {
              marker:
                privilegedFrameMarker,
              source:
                sanitizeNavigationUrlForLog(
                  frame &&
                  typeof frame.url ===
                    'string'
                    ? frame.url
                    : ''
                )
            }
          );

          return;
        }

        if (
          message.startsWith(
            onlineNfceNumberResponse
          )
        ) {
          const number =
            Number(
              message.slice(
                onlineNfceNumberResponse
                  .length
              )
            );

          log(
            'ONLINE NFCE NUMBER RESPONSE',
            {
              proximoNumeroNfceProducao:
                Number.isSafeInteger(
                  number
                ) &&
                number > 0
                  ? number
                  : null
            }
          );

          return;
        }

        if (
          message.startsWith(
            nfceCounter
          )
        ) {
          const requestId =
            message.slice(
              nfceCounter.length
            );

          try {
            await processFiscalCounterRequest(
              frame,
              requestId
            );
          } catch (error) {
            await respondFiscalCounterError(
              frame,
              requestId,
              error
            );

            log(
              'ERRO NFCE COUNTER FRAME',
              error
            );
          }

          return;
        }

        if (
          message.startsWith(
            contingencyPrintDiag
          )
        ) {
          const rawDiag =
            message.slice(
              contingencyPrintDiag
                .length
            );

          let printDiag = {};

          try {
            printDiag =
              JSON.parse(
                rawDiag
              );
          } catch (_) {
            printDiag = {
              raw: rawDiag
            };
          }

          log(
            'OFFLINE NFCE PRINT DIAG',
            printDiag
          );

          return;
        }

        if (
          !message.startsWith(
            print
          )
        ) {
          return;
        }

        const requestId =
          message.slice(
            print.length
          );

        log(
          'MARCADOR FRAME RECEBIDO',
          {
            requestId,
            sourceId:
              details &&
              details.sourceId
                ? details.sourceId
                : sourceIdDeprecated ||
                  ''
          }
        );

        const offlineView =
          getOfflineView();

        const origemOffline =
          Boolean(
            offlineView &&
            !offlineView
              .webContents
              .isDestroyed() &&
            contents ===
              offlineView
                .webContents
          );

        if (
          !origemOffline &&
          (
            !frame ||
            typeof frame
              .executeJavaScript !==
              'function' ||
            frame.isDestroyed()
          )
        ) {
          log(
            'ERRO FRAME',
            'Electron não forneceu WebFrameMain válido para a solicitação.'
          );

          return;
        }

        if (
          origemOffline &&
          (
            !contents ||
            typeof contents
              .executeJavaScript !==
              'function' ||
            contents.isDestroyed()
          )
        ) {
          log(
            'ERRO FRAME',
            'WebContents OFFLINE inválido para a solicitação.'
          );

          return;
        }

        try {
          const codigo = `
          (() => {
            const janelaPayload =
              ${origemOffline}
                ? (
                    document
                      .getElementById(
                        'scfOfflinePdv'
                      ) &&
                    document
                      .getElementById(
                        'scfOfflinePdv'
                      ).contentWindow
                  )
                : window;

            const payload =
              janelaPayload &&
              janelaPayload
                .__scfElectronPendingPrintPayload;

            if (
              !payload ||
              payload.requestId !==
                ${JSON.stringify(requestId)}
            ) {
              return null;
            }

            /*
             * Faz uma cÃ³pia simples serializÃ¡vel e limpa logo depois
             * para nÃ£o reter a imagem base64 na memÃ³ria do iframe.
             */
            const copia = {
              nativeReceipt:
                payload.nativeReceipt || null,

              imageBase64:
                payload.imageBase64 || '',

              origem:
                payload.origem || 'NFCE',

              saleId:
                payload.saleId || ''
            };

            janelaPayload.__scfElectronPendingPrintPayload =
              null;

            return copia;
          })();
        `;

          const payload =
            origemOffline
              ? await contents
                  .executeJavaScript(
                    codigo,
                    false
                  )
              : await frame
                  .executeJavaScript(
                    codigo,
                    false
                  );

          if (
            !payload ||
            (
              !payload.nativeReceipt &&
              !payload.imageBase64
            )
          ) {
            throw new Error(
              'O iframe nÃ£o retornou dados pendentes da NFC-e.'
            );
          }

          log(
            'PAYLOAD FRAME OBTIDO',
            {
              requestId,
              origem:
                payload.origem ||
                '',
              saleId:
                payload.saleId ||
                '',
              modo:
                payload.nativeReceipt
                  ? 'NATIVE_TEXT_QR'
                  : 'IMAGE_FALLBACK',
              tamanhoBase64:
                String(
                  payload.imageBase64 ||
                  ''
                ).length
            }
          );

          const resultado =
            await enqueuePrint(
              payload
            );

          log(
            'IMPRESSAO FRAME CONCLUIDA',
            resultado
          );
        } catch (error) {
          log(
            'ERRO CANAL FRAME',
            error
          );
        }
      }
    );

    log(
      'CANAL CONSOLE-FRAME INSTALADO'
    );
  }

  async function installTopPrintBridge() {
    const mainWindow =
      getMainWindow();

    if (
      !mainWindow ||
      mainWindow.isDestroyed()
    ) {
      return;
    }

    const trustedPdvFrame =
      await findTrustedPdvFrame(
        mainWindow.webContents,
        1500
      );

    const trustedPdvOrigin =
      String(
        trustedPdvFrame &&
        typeof trustedPdvFrame.origin ===
          'string'
          ? trustedPdvFrame.origin
          : ''
      ).trim();

    if (
      !trustedPdvFrame ||
      !trustedPdvOrigin ||
      trustedPdvOrigin ===
        'null'
    ) {
      log(
        'PONTE TOP DE IMPRESSAO NAO INSTALADA',
        {
          reason:
            'PDV_TRUST_ORIGIN_UNAVAILABLE'
        }
      );

      return;
    }

    const codigo = `
    (() => {
      const TRUSTED_PDV_ORIGIN =
        ${JSON.stringify(trustedPdvOrigin)};

      if (
        window.__efiscoTopPrintBridgeInstalled
      ) {
        return true;
      }

      window.__efiscoTopPrintBridgeInstalled =
        true;

      const processados =
        new Map();

      window.addEventListener(
        'message',
        async (event) => {
          const data =
            event &&
            event.data &&
            typeof event.data ===
              'object'
              ? event.data
              : null;

          if (
            !data ||
            data.type !==
              'SCF_EFISCO_IMPRIMIR_NFCE_LOCAL' ||
            !event.source ||
            event.source === window ||
            event.origin !==
              TRUSTED_PDV_ORIGIN
          ) {
            return;
          }

          const requestId =
            String(
              data.requestId || ''
            );

          if (
            requestId &&
            processados.has(
              requestId
            )
          ) {
            return;
          }

          if (requestId) {
            processados.set(
              requestId,
              Date.now()
            );

            window.setTimeout(
              () =>
                processados.delete(
                  requestId
                ),
              60000
            );
          }

          const payload =
            data.payload &&
            typeof data.payload ===
              'object'
              ? data.payload
              : {};

          let resultado;

          try {
            if (
              !window.efiscoDesktop ||
              typeof window.efiscoDesktop.printNfce80 !==
                'function'
            ) {
              throw new Error(
                'Ponte Electron de impressÃ£o nÃ£o disponÃ­vel.'
              );
            }

            resultado =
              await window.efiscoDesktop
                .printNfce80(
                  payload
                );
          } catch (error) {
            resultado = {
              ok: false,
              error:
                error &&
                error.message
                  ? error.message
                  : String(error)
            };
          }

          try {
            if (
              event.source &&
              typeof event.source.postMessage ===
                'function'
            ) {
              event.source.postMessage(
                {
                  type:
                    'SCF_EFISCO_IMPRIMIR_NFCE_LOCAL_RESULT',

                  requestId,

                  resultado
                },
                TRUSTED_PDV_ORIGIN
              );
            }
          } catch (_) {}
        },
        false
      );

      return true;
    })();
  `;

    try {
      await mainWindow
        .webContents
        .executeJavaScript(
          codigo,
          false
        );

      log(
        'PONTE TOP DE IMPRESSAO INSTALADA'
      );
    } catch (error) {
      log(
        'ERRO AO INSTALAR PONTE TOP',
        error
      );
    }
  }

  return Object.freeze({
    installConsoleFrameChannel,
    installTopPrintBridge
  });
}

module.exports = {
  createFramePrintBridge
};
