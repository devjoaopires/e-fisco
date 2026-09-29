(function (global) {
  'use strict';

  var domains =
    global.__scfPdvDomains ||
    (global.__scfPdvDomains = {});

  var state = {
    currentCash: null,
    receiptCloser: null,
    returnCoordinatorReady: false
  };

  function normalizeCash(value) {
    return value &&
      typeof value === 'object'
        ? value
        : null;
  }

  function getCurrentCash() {
    return state.currentCash;
  }

  function setCurrentCash(value) {
    state.currentCash =
      normalizeCash(value);
    return state.currentCash;
  }

  function getReceiptCloser() {
    return state.receiptCloser;
  }

  function setReceiptCloser(value) {
    state.receiptCloser =
      typeof value === 'function'
        ? value
        : null;
    return state.receiptCloser;
  }

  function closeReceipt() {
    if(
      typeof state.receiptCloser ===
        'function'
    ) {
      return state.receiptCloser();
    }

    return undefined;
  }

  function getReturnCoordinatorReady() {
    return state.returnCoordinatorReady;
  }

  function setReturnCoordinatorReady(value) {
    state.returnCoordinatorReady =
      value === true;
    return state.returnCoordinatorReady;
  }

  var previousGetCurrentCash =
    global.__scfGetCaixaAtual;
  var previousReceiptCloser =
    global.scfFecharComprovanteCaixa;

  if(
    typeof previousGetCurrentCash ===
      'function'
  ) {
    try {
      setCurrentCash(
        previousGetCurrentCash()
      );
    } catch(error) {}
  }

  if(
    typeof previousReceiptCloser ===
      'function'
  ) {
    setReceiptCloser(
      previousReceiptCloser
    );
  }


  Object.defineProperty(
    global,
    '__scfGetCaixaAtual',
    {
      configurable: true,
      enumerable: true,
      get: function() {
        return getCurrentCash;
      }
    }
  );

  Object.defineProperty(
    global,
    'scfFecharComprovanteCaixa',
    {
      configurable: true,
      enumerable: true,
      get: function() {
        return state.receiptCloser ||
          undefined;
      },
      set: setReceiptCloser
    }
  );


  var api = {
    getCurrentCash: getCurrentCash,
    setCurrentCash: setCurrentCash,
    getReceiptCloser: getReceiptCloser,
    setReceiptCloser: setReceiptCloser,
    closeReceipt: closeReceipt,
    getReturnCoordinatorReady:
      getReturnCoordinatorReady,
    setReturnCoordinatorReady:
      setReturnCoordinatorReady,
    snapshot: function() {
      return Object.freeze({
        hasCurrentCash:
          Boolean(state.currentCash),
        currentCashId:
          state.currentCash &&
          state.currentCash.id != null
            ? String(state.currentCash.id)
            : '',
        hasReceiptCloser:
          typeof state.receiptCloser ===
            'function',
        returnCoordinatorReady:
          state.returnCoordinatorReady
      });
    }
  };

  Object.defineProperty(
    api,
    'currentCash',
    {
      enumerable: true,
      get: getCurrentCash,
      set: setCurrentCash
    }
  );

  Object.defineProperty(
    api,
    'returnCoordinatorReady',
    {
      enumerable: true,
      get: getReturnCoordinatorReady,
      set: setReturnCoordinatorReady
    }
  );

  domains.cash =
    Object.freeze(api);
})(window);
