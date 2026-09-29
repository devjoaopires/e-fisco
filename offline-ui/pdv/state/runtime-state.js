(function (global) {
  'use strict';

  var root =
    global.__scfPdvState ||
    (global.__scfPdvState = {});

  var state = {
    systemOnlineCurrent:
      undefined,
    connectivityReady: false
  };

  function snapshot() {
    return Object.freeze({
      systemOnlineCurrent:
        state.systemOnlineCurrent,
      connectivityReady:
        state.connectivityReady
    });
  }

  root.runtime = Object.freeze({
    getSystemOnlineCurrent:
      function () {
        return state
          .systemOnlineCurrent;
      },
    setSystemOnlineCurrent:
      function (value) {
        state.systemOnlineCurrent =
          value;
        return state
          .systemOnlineCurrent;
      },
    getConnectivityReady:
      function () {
        return state
          .connectivityReady;
      },
    setConnectivityReady:
      function (value) {
        state.connectivityReady =
          value;
        return state
          .connectivityReady;
      },
    snapshot: snapshot
  });
})(window);
