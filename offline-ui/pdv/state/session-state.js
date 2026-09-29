(function (global) {
  'use strict';

  var root =
    global.__scfPdvState ||
    (global.__scfPdvState = {});

  var state = {
    profile: 'PENDENTE',
    accessOnlyPdv: true
  };

  function snapshot() {
    return Object.freeze({
      profile: state.profile,
      accessOnlyPdv:
        state.accessOnlyPdv
    });
  }

  root.session = Object.freeze({
    getProfile: function () {
      return state.profile;
    },
    setProfile: function (value) {
      state.profile = value;
      return state.profile;
    },
    getAccessOnlyPdv:
      function () {
        return state.accessOnlyPdv;
      },
    setAccessOnlyPdv:
      function (value) {
        state.accessOnlyPdv =
          value;
        return state.accessOnlyPdv;
      },
    snapshot: snapshot
  });
})(window);
