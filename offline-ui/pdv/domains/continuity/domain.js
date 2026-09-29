(function (global) {
  'use strict';

  var domains =
    global.__scfPdvDomains ||
    (global.__scfPdvDomains = {});

  var state = {
    salePort: null,
    paymentPort: null
  };

  function validPort(port) {
    return Boolean(
      port &&
      typeof port === 'object'
    );
  }

  function registerSalePort(port) {
    if(!validPort(port)) {
      throw new TypeError(
        'PDV continuity sale port invalido.'
      );
    }

    if(
      typeof port.exportDraft !== 'function' ||
      typeof port.restoreDraft !== 'function' ||
      typeof port.hasActiveSale !== 'function'
    ) {
      throw new TypeError(
        'PDV continuity sale port incompleto.'
      );
    }

    state.salePort =
      port;

    return state.salePort;
  }

  function registerPaymentPort(port) {
    if(!validPort(port)) {
      throw new TypeError(
        'PDV continuity payment port invalido.'
      );
    }

    if(
      typeof port.restoreState !== 'function'
    ) {
      throw new TypeError(
        'PDV continuity payment port incompleto.'
      );
    }

    state.paymentPort =
      port;

    return state.paymentPort;
  }

  function requireSalePort() {
    if(!state.salePort) {
      throw new Error(
        'PDV continuity sale port indisponivel.'
      );
    }

    return state.salePort;
  }

  function exportDraft() {
    return requireSalePort()
      .exportDraft();
  }

  function restoreDraft(draft) {
    var data =
      draft &&
      typeof draft === 'object'
        ? draft
        : {};

    return requireSalePort()
      .restoreDraft(
        data,
        function(paymentStageKind) {
          var paymentState =
            data.paymentContinuity &&
            typeof data.paymentContinuity ===
              'object'
              ? data.paymentContinuity
              : null;

          if(
            !paymentState ||
            !state.paymentPort
          ) {
            return;
          }

          state.paymentPort
            .restoreState(
              paymentState,
              paymentStageKind
            );
        }
      );
  }

  function hasActiveSale() {
    return (
      requireSalePort()
        .hasActiveSale() === true
    );
  }

  function snapshot() {
    return Object.freeze({
      salePortReady:
        Boolean(state.salePort),
      paymentPortReady:
        Boolean(state.paymentPort)
    });
  }

  domains.continuity =
    Object.freeze({
      registerSalePort:
        registerSalePort,
      registerPaymentPort:
        registerPaymentPort,
      exportDraft:
        exportDraft,
      restoreDraft:
        restoreDraft,
      hasActiveSale:
        hasActiveSale,
      snapshot:
        snapshot
    });
})(window);
