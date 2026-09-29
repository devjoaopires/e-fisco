(function (global) {
  'use strict';

  var domains =
    global.__scfPdvDomains ||
    (global.__scfPdvDomains = {});

  var state = {
    currentPrinter: null,
    historyPrinter: null,
    contingencyPrinter: null,
    imageGenerator: null,
    lastImage: null,
    pendingPayload: null
  };

  function registerFunction(
    key,
    fn
  ) {
    if(typeof fn !== 'function') {
      throw new TypeError(
        'PDV printing handler invalido: ' +
        key
      );
    }

    state[key] =
      fn;

    return state[key];
  }

  function invoke(
    key,
    args,
    fallback
  ) {
    var fn =
      state[key];

    if(typeof fn !== 'function') {
      return fallback;
    }

    return fn.apply(
      null,
      args || []
    );
  }

  function printCurrent(receipt) {
    return invoke(
      'currentPrinter',
      [receipt],
      false
    );
  }

  function printHistory(receipt) {
    return invoke(
      'historyPrinter',
      [receipt],
      false
    );
  }

  function printContingency(receipt) {
    return invoke(
      'contingencyPrinter',
      [receipt],
      false
    );
  }

  function generateReceiptImage() {
    if(
      typeof state.imageGenerator !==
        'function'
    ) {
      return Promise.reject(
        new Error(
          'Gerador local do DANFE nao disponivel.'
        )
      );
    }

    try {
      return Promise.resolve(
        state.imageGenerator()
      );
    } catch(error) {
      return Promise.reject(error);
    }
  }

  var api = {
    registerCurrentPrinter:
      function(fn) {
        return registerFunction(
          'currentPrinter',
          fn
        );
      },
    registerHistoryPrinter:
      function(fn) {
        return registerFunction(
          'historyPrinter',
          fn
        );
      },
    registerContingencyPrinter:
      function(fn) {
        return registerFunction(
          'contingencyPrinter',
          fn
        );
      },
    registerImageGenerator:
      function(fn) {
        return registerFunction(
          'imageGenerator',
          fn
        );
      },
    printCurrent:
      printCurrent,
    printHistory:
      printHistory,
    printContingency:
      printContingency,
    generateReceiptImage:
      generateReceiptImage,
    snapshot:
      function() {
        return Object.freeze({
          currentPrinterReady:
            typeof state.currentPrinter ===
              'function',
          historyPrinterReady:
            typeof state.historyPrinter ===
              'function',
          contingencyPrinterReady:
            typeof state.contingencyPrinter ===
              'function',
          imageGeneratorReady:
            typeof state.imageGenerator ===
              'function',
          hasLastImage:
            Boolean(state.lastImage),
          hasPendingPayload:
            Boolean(state.pendingPayload)
        });
      }
  };

  [
    'lastImage',
    'pendingPayload'
  ].forEach(
    function(key) {
      Object.defineProperty(
        api,
        key,
        {
          enumerable: true,
          get: function() {
            return state[key];
          },
          set: function(value) {
            state[key] =
              value;
          }
        }
      );
    }
  );

  domains.printing =
    Object.freeze(api);

  Object.defineProperty(
    global,
    '__scfElectronPendingPrintPayload',
    {
      configurable: true,
      enumerable: true,
      get: function() {
        return state.pendingPayload;
      },
      set: function(value) {
        state.pendingPayload =
          value || null;
      }
    }
  );
})(window);
