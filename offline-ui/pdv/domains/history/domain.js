(function (global) {
  'use strict';

  var domains =
    global.__scfPdvDomains ||
    (global.__scfPdvDomains = {});

  var receiptState = {
    frame: null,
    pendingSaleId: ''
  };

  function normalizeSaleId(value) {
    return String(
      value == null
        ? ''
        : value
    ).trim();
  }

  function setReceiptFrame(value) {
    receiptState.frame =
      value || null;
    return receiptState.frame;
  }

  function getReceiptFrame() {
    return receiptState.frame;
  }

  function setPendingSaleId(value) {
    receiptState.pendingSaleId =
      normalizeSaleId(value);
    return receiptState.pendingSaleId;
  }

  function getPendingSaleId() {
    return receiptState.pendingSaleId;
  }

  function clearReceiptState() {
    receiptState.frame = null;
    receiptState.pendingSaleId = '';
  }

  var previousFrame =
    global.__scfHistoryInlineReceiptFrame;

  var previousPendingSaleId =
    global.__scfHistoryInlineReceiptPendingSaleId;

  if(previousFrame) {
    setReceiptFrame(previousFrame);
  }

  if(previousPendingSaleId != null) {
    setPendingSaleId(
      previousPendingSaleId
    );
  }

  Object.defineProperty(
    global,
    '__scfHistoryInlineReceiptFrame',
    {
      configurable: true,
      enumerable: true,
      get: getReceiptFrame,
      set: setReceiptFrame
    }
  );

  Object.defineProperty(
    global,
    '__scfHistoryInlineReceiptPendingSaleId',
    {
      configurable: true,
      enumerable: true,
      get: getPendingSaleId,
      set: setPendingSaleId
    }
  );

  var api = {
    receipt: receiptState,
    getReceiptFrame:
      getReceiptFrame,
    setReceiptFrame:
      setReceiptFrame,
    getPendingSaleId:
      getPendingSaleId,
    setPendingSaleId:
      setPendingSaleId,
    clearReceiptState:
      clearReceiptState,
    snapshot: function() {
      return Object.freeze({
        hasReceiptFrame:
          receiptState.frame != null,
        pendingSaleId:
          receiptState.pendingSaleId
      });
    }
  };

  domains.history =
    Object.freeze(api);
})(window);
