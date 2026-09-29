(function (global) {
  'use strict';

  var root =
    global.__scfPdvInfra ||
    (global.__scfPdvInfra = {});

  function getDocument() {
    if (
      !global.document ||
      typeof global.document
        .addEventListener !==
        'function'
    ) {
      throw new Error(
        'PDV event bus requer document.'
      );
    }

    return global.document;
  }

  function on(
    name,
    listener,
    options
  ) {
    var documentRef =
      getDocument();

    documentRef.addEventListener(
      String(name || ''),
      listener,
      options
    );

    return function unsubscribe() {
      documentRef.removeEventListener(
        String(name || ''),
        listener,
        options
      );
    };
  }

  function dispatch(event) {
    return getDocument()
      .dispatchEvent(event);
  }

  function emit(
    name,
    detail
  ) {
    return dispatch(
      new global.CustomEvent(
        String(name || ''),
        {
          detail: detail
        }
      )
    );
  }

  root.eventBus = Object.freeze({
    on: on,
    dispatch: dispatch,
    emit: emit
  });
})(window);
