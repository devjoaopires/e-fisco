(function (global) {
  'use strict';

  var domains =
    global.__scfPdvDomains ||
    (global.__scfPdvDomains = {});

  var state = {
    cashSnapshot: null,
    localMovements: [],
    exitSelectedDateFilter: '',
    receivablePending: {},
    accountStatusReload: false,
    cashMovementDateProvider: null,
    cashMovementDateFilter: null
  };

  function normalizeObject(value) {
    return value &&
      typeof value === 'object'
        ? value
        : null;
  }

  function normalizeArray(value) {
    return Array.isArray(value)
      ? value
      : [];
  }

  function normalizeText(value) {
    return String(
      value == null
        ? ''
        : value
    ).trim();
  }

  function normalizePending(value) {
    return value &&
      typeof value === 'object' &&
      !Array.isArray(value)
        ? value
        : {};
  }

  function getCashSnapshot() {
    return state.cashSnapshot;
  }

  function setCashSnapshot(value) {
    state.cashSnapshot =
      normalizeObject(value);
    return state.cashSnapshot;
  }

  function getLocalMovements() {
    return state.localMovements;
  }

  function setLocalMovements(value) {
    state.localMovements =
      normalizeArray(value);
    return state.localMovements;
  }

  function getExitSelectedDateFilter() {
    return state.exitSelectedDateFilter;
  }

  function setExitSelectedDateFilter(value) {
    state.exitSelectedDateFilter =
      normalizeText(value);
    return state.exitSelectedDateFilter;
  }

  function getReceivablePending() {
    return state.receivablePending;
  }

  function setReceivablePending(value) {
    state.receivablePending =
      normalizePending(value);
    return state.receivablePending;
  }

  function getAccountStatusReload() {
    return state.accountStatusReload;
  }

  function setAccountStatusReload(value) {
    state.accountStatusReload =
      value === true;
    return state.accountStatusReload;
  }

  function setCashMovementDateProvider(value) {
    state.cashMovementDateProvider =
      typeof value === 'function'
        ? value
        : null;
    return state.cashMovementDateProvider;
  }

  function getCashMovementDates() {
    if(
      typeof state.cashMovementDateProvider !==
        'function'
    ) {
      return [];
    }

    var dates =
      state.cashMovementDateProvider();

    return Array.isArray(dates)
      ? dates
      : [];
  }

  function setCashMovementDateFilter(value) {
    state.cashMovementDateFilter =
      typeof value === 'function'
        ? value
        : null;
    return state.cashMovementDateFilter;
  }

  function filterCashMovementsByDate(value) {
    if(
      typeof state.cashMovementDateFilter ===
        'function'
    ) {
      return state.cashMovementDateFilter(
        value
      );
    }

    return undefined;
  }

  var api = {
    getCashSnapshot: getCashSnapshot,
    setCashSnapshot: setCashSnapshot,
    getLocalMovements: getLocalMovements,
    setLocalMovements: setLocalMovements,
    getExitSelectedDateFilter:
      getExitSelectedDateFilter,
    setExitSelectedDateFilter:
      setExitSelectedDateFilter,
    getReceivablePending:
      getReceivablePending,
    setReceivablePending:
      setReceivablePending,
    getAccountStatusReload:
      getAccountStatusReload,
    setAccountStatusReload:
      setAccountStatusReload,
    setCashMovementDateProvider:
      setCashMovementDateProvider,
    getCashMovementDates:
      getCashMovementDates,
    setCashMovementDateFilter:
      setCashMovementDateFilter,
    filterCashMovementsByDate:
      filterCashMovementsByDate,
    snapshot: function() {
      return Object.freeze({
        localMovementCount:
          state.localMovements.length,
        exitSelectedDateFilter:
          state.exitSelectedDateFilter,
        receivablePendingCount:
          Object.keys(
            state.receivablePending
          ).length,
        accountStatusReload:
          state.accountStatusReload,
        hasCashSnapshot:
          Boolean(
            state.cashSnapshot
          )
      });
    }
  };

  [
    ['cashSnapshot', getCashSnapshot, setCashSnapshot],
    ['localMovements', getLocalMovements, setLocalMovements],
    [
      'exitSelectedDateFilter',
      getExitSelectedDateFilter,
      setExitSelectedDateFilter
    ],
    [
      'receivablePending',
      getReceivablePending,
      setReceivablePending
    ],
    [
      'accountStatusReload',
      getAccountStatusReload,
      setAccountStatusReload
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

  domains.finance =
    Object.freeze(api);
})(window);
