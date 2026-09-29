(function (global) {
  'use strict';

  var domains =
    global.__scfPdvDomains ||
    (global.__scfPdvDomains = {});

  var state = {
    paymentAwaitingF1: false,
    paymentMethodsOpen: false,
    paymentPartialSelectionActive: false,
    sideMenuLocked: false,
    guards: Object.create(null)
  };

  function asBoolean(value) {
    return value === true;
  }

  function getPaymentAwaitingF1() {
    return state.paymentAwaitingF1;
  }

  function setPaymentAwaitingF1(value) {
    state.paymentAwaitingF1 =
      asBoolean(value);
    return state.paymentAwaitingF1;
  }

  function getPaymentMethodsOpen() {
    return state.paymentMethodsOpen;
  }

  function setPaymentMethodsOpen(value) {
    state.paymentMethodsOpen =
      asBoolean(value);
    return state.paymentMethodsOpen;
  }

  function getPaymentPartialSelectionActive() {
    return state.paymentPartialSelectionActive;
  }

  function setPaymentPartialSelectionActive(value) {
    state.paymentPartialSelectionActive =
      asBoolean(value);
    return state.paymentPartialSelectionActive;
  }

  function getSideMenuLocked() {
    return state.sideMenuLocked;
  }

  function setSideMenuLocked(value) {
    state.sideMenuLocked =
      asBoolean(value);
    return state.sideMenuLocked;
  }

  function resetPaymentState() {
    setPaymentAwaitingF1(false);
    setPaymentMethodsOpen(false);
    setPaymentPartialSelectionActive(false);
  }

  function claimGuard(name) {
    var key =
      String(
        name == null
          ? ''
          : name
      ).trim();

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
      String(
        name == null
          ? ''
          : name
      ).trim();

    if(!key) {
      return false;
    }

    delete state.guards[key];
    return true;
  }

  var previousPaymentAwaitingF1 =
    global.__scfCrediarioPagamentoAguardandoF1;
  var previousPaymentMethodsOpen =
    global.__scfCrediarioPagamentoFormasAberto;
  var previousPaymentPartialSelectionActive =
    global.__scfCrediarioPagamentoParcialSelecaoAtiva;
  var previousSideMenuLocked =
    global.__scfCrediarioMenuLateralBloqueado;

  if(previousPaymentAwaitingF1 === true) {
    setPaymentAwaitingF1(true);
  }

  if(previousPaymentMethodsOpen === true) {
    setPaymentMethodsOpen(true);
  }

  if(previousPaymentPartialSelectionActive === true) {
    setPaymentPartialSelectionActive(true);
  }

  if(previousSideMenuLocked === true) {
    setSideMenuLocked(true);
  }

  [
    [
      '__scfCrediarioPagamentoAguardandoF1',
      getPaymentAwaitingF1,
      setPaymentAwaitingF1
    ],
    [
      '__scfCrediarioPagamentoFormasAberto',
      getPaymentMethodsOpen,
      setPaymentMethodsOpen
    ],
    [
      '__scfCrediarioPagamentoParcialSelecaoAtiva',
      getPaymentPartialSelectionActive,
      setPaymentPartialSelectionActive
    ],
    [
      '__scfCrediarioMenuLateralBloqueado',
      getSideMenuLocked,
      setSideMenuLocked
    ]
  ].forEach(
    function(descriptor) {
      Object.defineProperty(
        global,
        descriptor[0],
        {
          configurable: true,
          enumerable: true,
          get: descriptor[1],
          set: descriptor[2]
        }
      );
    }
  );

  var api = {
    getPaymentAwaitingF1:
      getPaymentAwaitingF1,
    setPaymentAwaitingF1:
      setPaymentAwaitingF1,
    getPaymentMethodsOpen:
      getPaymentMethodsOpen,
    setPaymentMethodsOpen:
      setPaymentMethodsOpen,
    getPaymentPartialSelectionActive:
      getPaymentPartialSelectionActive,
    setPaymentPartialSelectionActive:
      setPaymentPartialSelectionActive,
    getSideMenuLocked:
      getSideMenuLocked,
    setSideMenuLocked:
      setSideMenuLocked,
    resetPaymentState:
      resetPaymentState,
    claimGuard:
      claimGuard,
    releaseGuard:
      releaseGuard,
    snapshot: function() {
      return Object.freeze({
        paymentAwaitingF1:
          state.paymentAwaitingF1,
        paymentMethodsOpen:
          state.paymentMethodsOpen,
        paymentPartialSelectionActive:
          state.paymentPartialSelectionActive,
        sideMenuLocked:
          state.sideMenuLocked,
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
      'paymentAwaitingF1',
      getPaymentAwaitingF1,
      setPaymentAwaitingF1
    ],
    [
      'paymentMethodsOpen',
      getPaymentMethodsOpen,
      setPaymentMethodsOpen
    ],
    [
      'paymentPartialSelectionActive',
      getPaymentPartialSelectionActive,
      setPaymentPartialSelectionActive
    ],
    [
      'sideMenuLocked',
      getSideMenuLocked,
      setSideMenuLocked
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

  domains.crediario =
    Object.freeze(api);
})(window);
