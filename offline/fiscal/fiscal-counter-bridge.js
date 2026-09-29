'use strict';

function createFiscalCounterBridge({
  responseEventName,
  getMainWindow,
  findTrustedPdvFrame,
  getOfflineDatabase,
  getSyncEmpresaId,
  getSyncIdentity,
  getOrCreateSyncDeviceId,
  getFiscalProfileCache,
  peekNextNfceNumber,
  consumeNextNfceNumber,
  log = () => {}
} = {}) {
  async function process(
    frame,
    requestId
  ) {
    if (
      !frame ||
      typeof frame
        .executeJavaScript !==
        'function' ||
      frame.isDestroyed()
    ) {
      throw new Error(
        'Frame do PDV não está disponível para o contador fiscal.'
      );
    }

    const pedido =
      await frame
        .executeJavaScript(
          '(() => {' +
            'const bucket=window.__scfElectronPendingNfceCounterRequests;' +
            'if(!bucket||typeof bucket!=="object")return null;' +
            'const item=bucket[' +
              JSON.stringify(
                requestId
              ) +
              '];' +
            'if(!item||item.requestId!==' +
              JSON.stringify(
                requestId
              ) +
              ')return null;' +
            'return {' +
              'requestId:String(item.requestId||""),' +
              'action:String(item.action||""),' +
              'saleId:String(item.saleId||""),' +
              'numero:Number(item.numero||0),' +
              'status:String(item.status||""),' +
              'origin:String((window.location&&window.location.origin)||"")' +
            '};' +
          '})()',
          false
        );

    if (
      !pedido ||
      String(
        pedido.requestId || ''
      ) !== requestId
    ) {
      throw new Error(
        'Solicitação do contador NFC-e não foi encontrada no iframe.'
      );
    }

    const origem =
      String(
        pedido.origin || ''
      )
        .trim()
        .toLowerCase();

    const mainWindow =
      getMainWindow();

    const trustedOnlinePdvFrame =
      mainWindow &&
      !mainWindow.isDestroyed() &&
      mainWindow.webContents &&
      !mainWindow
        .webContents
        .isDestroyed()
        ? await findTrustedPdvFrame(
            mainWindow
              .webContents,
            300
          )
        : null;

    const frameOrigin =
      String(
        frame &&
        typeof frame.origin ===
          'string'
          ? frame.origin
          : ''
      )
        .trim()
        .toLowerCase();

    if (
      !trustedOnlinePdvFrame ||
      trustedOnlinePdvFrame !==
        frame ||
      !origem ||
      !frameOrigin ||
      origem === 'null' ||
      origem !== frameOrigin
    ) {
      throw new Error(
        'Frame do contador NFC-e não pertence ao PDV online confiável.'
      );
    }

    const offlineDb =
      getOfflineDatabase();

    const empresaId =
      getSyncEmpresaId({
        db: offlineDb
      });

    if (!empresaId) {
      throw new Error(
        'Empresa autenticada não está disponível para o contador fiscal.'
      );
    }

    const syncIdentity =
      getSyncIdentity();

    const deviceId =
      syncIdentity &&
      syncIdentity.deviceId
        ? String(
            syncIdentity.deviceId
          )
        : getOrCreateSyncDeviceId({
            db: offlineDb
          });

    const profile =
      getFiscalProfileCache(
        empresaId
      );

    if (!profile) {
      throw new Error(
        'Perfil fiscal local não está disponível para o contador fiscal.'
      );
    }

    const comum = {
      empresaId,
      deviceId,
      ambiente:
        'PRODUCAO',
      modelo: 65,
      serie:
        String(
          profile.serieNfce
        )
    };

    const action =
      String(
        pedido.action || ''
      )
        .trim()
        .toUpperCase();

    let result;

    if (
      action === 'NEXT'
    ) {
      const next =
        peekNextNfceNumber(
          comum
        );

      result = {
        ...next,
        numero:
          Number(
            next
              .proximoNumero
          )
      };
    } else if (
      action === 'CONSUME'
    ) {
      result =
        consumeNextNfceNumber({
          ...comum,
          numero:
            pedido.numero
        });
    } else {
      throw new Error(
        'Ação do contador NFC-e não suportada.'
      );
    }

    const serializado =
      JSON.stringify({
        requestId,
        ok: true,
        result
      });

    await frame
      .executeJavaScript(
        '(() => {' +
          'window.dispatchEvent(new CustomEvent(' +
          JSON.stringify(
            responseEventName
          ) +
          ',{detail:' +
          serializado +
          '}));' +
          'return true;' +
        '})()',
        false
      );

    log(
      'NFCE COUNTER FRAME OK',
      {
        action,
        saleId:
          pedido.saleId ||
          '',
        numero:
          result &&
          (
            result.numero ||
            result
              .proximoNumero
          ) ||
          null
      }
    );

    return result;
  }

  async function respondError(
    frame,
    requestId,
    error
  ) {
    if (
      !frame ||
      typeof frame
        .executeJavaScript !==
        'function' ||
      frame.isDestroyed()
    ) {
      return;
    }

    const serializado =
      JSON.stringify({
        requestId,
        ok: false,
        error:
          error &&
          error.message
            ? error.message
            : String(error)
      });

    try {
      await frame
        .executeJavaScript(
          '(() => {' +
            'window.dispatchEvent(new CustomEvent(' +
            JSON.stringify(
              responseEventName
            ) +
            ',{detail:' +
            serializado +
            '}));' +
            'return true;' +
          '})()',
          false
        );
    } catch (_) {}
  }

  return Object.freeze({
    process,
    respondError
  });
}

module.exports = {
  createFiscalCounterBridge
};
