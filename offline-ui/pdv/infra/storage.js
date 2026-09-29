(function (global) {
  'use strict';

  var root =
    global.__scfPdvInfra ||
    (global.__scfPdvInfra = {});

  function storageBackend(name) {
    var backend = global[name];

    if (!backend) {
      throw new Error(
        name + ' indisponível.'
      );
    }

    return backend;
  }

  function createAdapter(name) {
    return Object.freeze({
      getItem: function (key) {
        return storageBackend(name)
          .getItem(key);
      },
      setItem: function (
        key,
        value
      ) {
        storageBackend(name)
          .setItem(key, value);
      },
      removeItem: function (key) {
        storageBackend(name)
          .removeItem(key);
      },
      clear: function () {
        storageBackend(name)
          .clear();
      },
      key: function (index) {
        return storageBackend(name)
          .key(index);
      },
      length: function () {
        return storageBackend(name)
          .length;
      }
    });
  }

  root.storage = Object.freeze({
    local: createAdapter(
      'localStorage'
    ),
    session: createAdapter(
      'sessionStorage'
    )
  });
})(window);
