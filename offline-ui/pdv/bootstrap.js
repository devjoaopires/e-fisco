(function (global) {
  'use strict';

  function required(
    value,
    label
  ) {
    if (!value) {
      throw new Error(
        'PDV bootstrap: ' +
          label +
          ' indisponível.'
      );
    }

    return value;
  }

  var contracts =
    required(
      global.__scfPdvContracts,
      'contracts'
    );
  var infra =
    required(
      global.__scfPdvInfra,
      'infra'
    );
  var state =
    required(
      global.__scfPdvState,
      'state owners'
    );
  var shared =
    required(
      global.__scfPdvShared,
      'shared'
    );
  var compat =
    required(
      global.__scfPdvCompat,
      'compat'
    );

  required(
    contracts.messages,
    'contracts.messages'
  );
  required(
    contracts.events,
    'contracts.events'
  );
  required(
    contracts.storage,
    'contracts.storage'
  );

  required(
    infra.shellBridge,
    'infra.shellBridge'
  );
  required(
    infra.eventBus,
    'infra.eventBus'
  );
  required(
    infra.storage,
    'infra.storage'
  );
  required(
    infra.dom,
    'infra.dom'
  );
  required(
    infra.browserNetwork,
    'infra.browserNetwork'
  );

  required(
    state.session,
    'state.session'
  );
  required(
    state.runtime,
    'state.runtime'
  );
  required(
    state.navigation,
    'state.navigation'
  );

  required(
    shared.values,
    'shared.values'
  );
  required(
    shared.helpers,
    'shared.helpers'
  );

  required(
    compat.legacyGlobals,
    'compat.legacyGlobals'
  );

  compat.legacyGlobals.install();

})(window);
