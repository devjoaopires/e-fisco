(function (global) {
  'use strict';

  var root =
    global.__scfPdvInfra ||
    (global.__scfPdvInfra = {});

  function normalizeOrigin(targetOrigin) {
    return String(
      targetOrigin == null
        ? '*'
        : targetOrigin
    );
  }

  function post(message, targetOrigin) {
    global.parent.postMessage(
      message,
      normalizeOrigin(targetOrigin)
    );
  }

  function postTo(
    target,
    message,
    targetOrigin
  ) {
    if (
      !target ||
      typeof target.postMessage !==
        'function'
    ) {
      return false;
    }

    target.postMessage(
      message,
      normalizeOrigin(targetOrigin)
    );

    return true;
  }

  function onMessage(
    listener,
    options
  ) {
    global.addEventListener(
      'message',
      listener,
      options
    );

    return function unsubscribe() {
      global.removeEventListener(
        'message',
        listener,
        options
      );
    };
  }

  root.shellBridge = Object.freeze({
    post: post,
    postTo: postTo,
    onMessage: onMessage
  });
})(window);
