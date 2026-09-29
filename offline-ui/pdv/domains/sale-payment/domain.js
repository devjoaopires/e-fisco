(function (global) {
  'use strict';

  var domains =
    global.__scfPdvDomains ||
    (global.__scfPdvDomains = {});

  var state = {
    internalSaleActive: false,
    currentReceiptPendingSaleId: '',
    validationMinimumUntil: 0,
    guards: Object.create(null)
  };

  function normalizeBoolean(value) {
    return value === true;
  }

  function normalizeText(value) {
    return String(
      value == null
        ? ''
        : value
    ).trim();
  }

  function normalizeTimestamp(value) {
    var numeric =
      Number(value);

    return Number.isFinite(numeric) &&
      numeric > 0
        ? numeric
        : 0;
  }

  function getInternalSaleActive() {
    return state.internalSaleActive;
  }

  function setInternalSaleActive(value) {
    state.internalSaleActive =
      normalizeBoolean(value);

    return state.internalSaleActive;
  }

  function getCurrentReceiptPendingSaleId() {
    return state.currentReceiptPendingSaleId;
  }

  function setCurrentReceiptPendingSaleId(value) {
    state.currentReceiptPendingSaleId =
      normalizeText(value);

    return state.currentReceiptPendingSaleId;
  }

  function getValidationMinimumUntil() {
    return state.validationMinimumUntil;
  }

  function setValidationMinimumUntil(value) {
    state.validationMinimumUntil =
      normalizeTimestamp(value);

    return state.validationMinimumUntil;
  }

  function claimGuard(name) {
    var key =
      normalizeText(name);

    if(!key) {
      return false;
    }

    if(state.guards[key] === true) {
      return false;
    }

    state.guards[key] = true;
    return true;
  }

  function releaseGuard(name) {
    var key =
      normalizeText(name);

    if(!key) {
      return false;
    }

    delete state.guards[key];
    return true;
  }

  var api = {
    getInternalSaleActive:
      getInternalSaleActive,
    setInternalSaleActive:
      setInternalSaleActive,
    getCurrentReceiptPendingSaleId:
      getCurrentReceiptPendingSaleId,
    setCurrentReceiptPendingSaleId:
      setCurrentReceiptPendingSaleId,
    getValidationMinimumUntil:
      getValidationMinimumUntil,
    setValidationMinimumUntil:
      setValidationMinimumUntil,
    claimGuard:
      claimGuard,
    releaseGuard:
      releaseGuard,
    snapshot: function() {
      return Object.freeze({
        internalSaleActive:
          state.internalSaleActive,
        currentReceiptPendingSaleId:
          state.currentReceiptPendingSaleId,
        validationMinimumUntil:
          state.validationMinimumUntil,
        guards:
          Object.keys(state.guards)
            .filter(function(key) {
              return state.guards[key] === true;
            })
            .sort()
      });
    }
  };

  [
    [
      'internalSaleActive',
      getInternalSaleActive,
      setInternalSaleActive
    ],
    [
      'currentReceiptPendingSaleId',
      getCurrentReceiptPendingSaleId,
      setCurrentReceiptPendingSaleId
    ],
    [
      'validationMinimumUntil',
      getValidationMinimumUntil,
      setValidationMinimumUntil
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

  domains.salePayment =
    Object.freeze(api);
})(window);
