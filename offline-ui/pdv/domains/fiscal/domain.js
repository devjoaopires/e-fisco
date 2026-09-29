(function (global) {
  'use strict';

  var domains =
    global.__scfPdvDomains ||
    (global.__scfPdvDomains = {});

  var state = {
    completedCardWasVisible: false,
    historyReceiptSaleId: '',
    currentReceipt: null,
    currentReceiptFromHistory: false,
    secondCopyPending: false,
    qrUrl: '',
    whatsappRequests: new Set(),
    receiptCloser: null
  };

  function normalizeText(value) {
    return String(
      value == null
        ? ''
        : value
    ).trim();
  }

  function asBoolean(value) {
    return value === true;
  }

  function registerReceiptCloser(fn) {
    if(typeof fn !== 'function') {
      throw new TypeError(
        'PDV fiscal receipt closer invalido.'
      );
    }

    state.receiptCloser =
      fn;

    return state.receiptCloser;
  }

  function closeReceipt() {
    if(
      typeof state.receiptCloser !==
        'function'
    ) {
      return false;
    }

    state.receiptCloser();
    return true;
  }

  function resetReceiptSession() {
    state.completedCardWasVisible = false;
    state.historyReceiptSaleId = '';
    state.currentReceipt = null;
    state.currentReceiptFromHistory = false;
    state.secondCopyPending = false;
    state.qrUrl = '';
  }

  var api = {
    whatsappRequests:
      state.whatsappRequests,
    registerReceiptCloser:
      registerReceiptCloser,
    closeReceipt:
      closeReceipt,
    resetReceiptSession:
      resetReceiptSession,
    snapshot: function() {
      return Object.freeze({
        completedCardWasVisible:
          state.completedCardWasVisible,
        historyReceiptSaleId:
          state.historyReceiptSaleId,
        hasCurrentReceipt:
          state.currentReceipt != null,
        currentReceiptFromHistory:
          state.currentReceiptFromHistory,
        secondCopyPending:
          state.secondCopyPending,
        qrUrl:
          state.qrUrl,
        whatsappRequestCount:
          state.whatsappRequests.size,
        receiptCloserReady:
          typeof state.receiptCloser ===
            'function'
      });
    }
  };

  [
    [
      'completedCardWasVisible',
      function() {
        return state.completedCardWasVisible;
      },
      function(value) {
        state.completedCardWasVisible =
          asBoolean(value);
      }
    ],
    [
      'historyReceiptSaleId',
      function() {
        return state.historyReceiptSaleId;
      },
      function(value) {
        state.historyReceiptSaleId =
          normalizeText(value);
      }
    ],
    [
      'currentReceipt',
      function() {
        return state.currentReceipt;
      },
      function(value) {
        state.currentReceipt =
          value &&
          typeof value === 'object'
            ? value
            : null;
      }
    ],
    [
      'currentReceiptFromHistory',
      function() {
        return state.currentReceiptFromHistory;
      },
      function(value) {
        state.currentReceiptFromHistory =
          asBoolean(value);
      }
    ],
    [
      'secondCopyPending',
      function() {
        return state.secondCopyPending;
      },
      function(value) {
        state.secondCopyPending =
          asBoolean(value);
      }
    ],
    [
      'qrUrl',
      function() {
        return state.qrUrl;
      },
      function(value) {
        state.qrUrl =
          normalizeText(value);
      }
    ]
  ].forEach(
    function(descriptor) {
      Object.defineProperty(
        api,
        descriptor[0],
        {
          enumerable: true,
          get: descriptor[1],
          set: descriptor[2]
        }
      );
    }
  );

  domains.fiscal =
    Object.freeze(api);
})(window);
