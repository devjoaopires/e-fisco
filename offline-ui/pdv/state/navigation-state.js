(function (global) {
  'use strict';

  var root =
    global.__scfPdvState ||
    (global.__scfPdvState = {});

  var state = {
    productLookupOpen: false
  };

  function snapshot() {
    return Object.freeze({
      productLookupOpen:
        state.productLookupOpen
    });
  }

  root.navigation =
    Object.freeze({
      getProductLookupOpen:
        function () {
          return state
            .productLookupOpen;
        },
      setProductLookupOpen:
        function (value) {
          state.productLookupOpen =
            value;
          return state
            .productLookupOpen;
        },
      snapshot: snapshot
    });
})(window);
