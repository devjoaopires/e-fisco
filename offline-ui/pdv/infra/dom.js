(function (global) {
  'use strict';

  var root =
    global.__scfPdvInfra ||
    (global.__scfPdvInfra = {});

  function defaultRoot(rootNode) {
    return rootNode ||
      global.document;
  }

  function byId(id, rootNode) {
    var rootRef =
      defaultRoot(rootNode);

    if (
      rootRef &&
      typeof rootRef.getElementById ===
        'function'
    ) {
      return rootRef.getElementById(
        String(id || '')
      );
    }

    return null;
  }

  function query(
    selector,
    rootNode
  ) {
    var rootRef =
      defaultRoot(rootNode);

    if (
      !rootRef ||
      typeof rootRef.querySelector !==
        'function'
    ) {
      return null;
    }

    return rootRef.querySelector(
      String(selector || '')
    );
  }

  function queryAll(
    selector,
    rootNode
  ) {
    var rootRef =
      defaultRoot(rootNode);

    if (
      !rootRef ||
      typeof rootRef.querySelectorAll !==
        'function'
    ) {
      return [];
    }

    return rootRef.querySelectorAll(
      String(selector || '')
    );
  }

  root.dom = Object.freeze({
    byId: byId,
    query: query,
    queryAll: queryAll
  });
})(window);
