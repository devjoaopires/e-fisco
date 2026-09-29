(function (global) {
  'use strict';

  var domains =
    global.__scfPdvDomains ||
    (global.__scfPdvDomains = {});

  var state = {
    active: false,
    actions: Object.create(null)
  };

  var actionNames = [
    'afterCompanySuccess',
    'clearCompanyForm',
    'requestCompanies',
    'currentPanelTitle',
    'resetUpdateMode',
    'closeEditWithoutSaving',
    'leaveDetailsView'
  ];

  function setAction(name, value) {
    if(
      actionNames.indexOf(name) === -1
    ) {
      throw new Error(
        'PDV superadmin action desconhecida: ' +
        String(name || '')
      );
    }

    if(
      value != null &&
      typeof value !== 'function'
    ) {
      throw new TypeError(
        'PDV superadmin action invalida: ' +
        name
      );
    }

    state.actions[name] =
      value || null;

    return state.actions[name];
  }

  function getAction(name) {
    return state.actions[name] || null;
  }

  var actions = {};

  actionNames.forEach(
    function(name) {
      Object.defineProperty(
        actions,
        name,
        {
          configurable: false,
          enumerable: true,
          get: function() {
            return getAction(name);
          },
          set: function(value) {
            setAction(
              name,
              value
            );
          }
        }
      );
    }
  );

  function setActive(value) {
    state.active =
      value === true;

    return state.active;
  }

  var api = {
    actions:
      actions,
    setAction:
      setAction,
    getAction:
      getAction,
    snapshot: function() {
      var registered = {};

      actionNames.forEach(
        function(name) {
          registered[name] =
            typeof getAction(name) ===
              'function';
        }
      );

      return Object.freeze({
        active:
          state.active,
        registeredActions:
          Object.freeze(registered)
      });
    }
  };

  Object.defineProperty(
    api,
    'active',
    {
      enumerable: true,
      get: function() {
        return state.active;
      },
      set: setActive
    }
  );

  domains.superadmin =
    Object.freeze(api);

  if(
    global.__scfPdvInfra &&
    global.__scfPdvInfra.shellBridge
  ) {
    global.__scfPdvInfra.shellBridge.onMessage(
      function(event) {
        var data =
          event &&
          event.data &&
          typeof event.data === 'object'
            ? event.data
            : null;

        if(!data) {
          return;
        }

        if(
          data.type ===
            'SCF_SUPERADMIN_READY'
        ) {
          setActive(true);
          return;
        }

        if(
          data.type ===
            'SCF_WIX_READY'
        ) {
          setActive(false);
        }
      }
    );
  }
})(window);
