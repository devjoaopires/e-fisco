'use strict';

function offlineAuthFailure(error) {
  return Boolean(
    error &&
    (
      error.code === 'SYNC_DEVICE_AUTH_FAILED' ||
      error.httpStatus === 401 ||
      error.httpStatus === 403
    )
  );
}

function createAuthorizationController({
  log = () => {}
} = {}) {
  let state = 'UNAVAILABLE';

  function getState() {
    return state;
  }

  function setState(nextState) {
    state =
      String(nextState || '')
        .trim() ||
      'UNAVAILABLE';

    return state;
  }

  function markInvalid(error) {
    state = 'INVALID';

    log('OFFLINE SYNC AUTH INVALID', {
      code:
        error && error.code || null,
      httpStatus:
        error && error.httpStatus || null
    });

    return state;
  }

  function assertMutationAuthorized({
    syncIdentity,
    uiMode,
    authenticatedOperator
  } = {}) {
    if (state === 'INVALID') {
      throw new Error(
        'Autorização offline do dispositivo foi recusada pelo servidor. Reconecte ou repareie o dispositivo antes de novas operações offline.'
      );
    }

    if (
      !syncIdentity ||
      !syncIdentity.deviceId ||
      !syncIdentity.deviceToken ||
      !syncIdentity.empresaId
    ) {
      throw new Error(
        'Dispositivo ainda não possui identidade autenticada suficiente para operações offline.'
      );
    }

    if (
      uiMode === 'OFFLINE' &&
      !authenticatedOperator
    ) {
      throw new Error(
        'Operador ainda não foi autenticado para operações offline.'
      );
    }

    return true;
  }

  return Object.freeze({
    getState,
    setState,
    markInvalid,
    assertMutationAuthorized
  });
}

module.exports = {
  offlineAuthFailure,
  createAuthorizationController
};
