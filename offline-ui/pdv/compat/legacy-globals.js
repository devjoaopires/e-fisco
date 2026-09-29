(function (global) {
  'use strict';

  var root =
    global.__scfPdvCompat ||
    (global.__scfPdvCompat = {});

  var installed = false;

  function bind(
    name,
    getter,
    setter
  ) {
    var hadOwn =
      Object.prototype
        .hasOwnProperty.call(
          global,
          name
        );

    var previous =
      hadOwn
        ? global[name]
        : undefined;

    Object.defineProperty(
      global,
      name,
      {
        configurable: true,
        enumerable: true,
        get: getter,
        set: setter
      }
    );

    if (hadOwn) {
      setter(previous);
    }
  }

  function install() {
    if (installed) {
      return;
    }

    var state =
      global.__scfPdvState;

    if (
      !state ||
      !state.session ||
      !state.runtime ||
      !state.navigation
    ) {
      throw new Error(
        'PDV state owners indisponíveis.'
      );
    }

    bind(
      '__scfPerfilSessao',
      state.session.getProfile,
      state.session.setProfile
    );

    bind(
      '__scfAcessoSomentePdv',
      state.session
        .getAccessOnlyPdv,
      state.session
        .setAccessOnlyPdv
    );

    bind(
      '__scfSistemaOnlineAtual',
      state.runtime
        .getSystemOnlineCurrent,
      state.runtime
        .setSystemOnlineCurrent
    );



    installed = true;
  }

  root.legacyGlobals =
    Object.freeze({
      install: install,
      isInstalled: function () {
        return installed;
      },
      bindings: Object.freeze([
        '__scfPerfilSessao',
        '__scfAcessoSomentePdv',
        '__scfSistemaOnlineAtual'
      ])
    });
})(window);
