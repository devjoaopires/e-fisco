(function (global) {
  'use strict';

  var root =
    global.__scfPdvInfra ||
    (global.__scfPdvInfra = {});

  function isNavigatorOnline() {
    return (
      !global.navigator ||
      typeof global.navigator.onLine !==
        'boolean' ||
      global.navigator.onLine
    );
  }

  function hasFetch() {
    return typeof global.fetch ===
      'function';
  }

  async function fetchWithTimeout(
    url,
    options,
    timeoutMs
  ) {
    if (!hasFetch()) {
      throw new Error(
        'fetch indisponível.'
      );
    }

    var settings =
      Object.assign(
        {},
        options || {}
      );

    var controller = null;
    var timeoutId = null;
    var timeout =
      Number(timeoutMs) || 0;

    if (
      timeout > 0 &&
      typeof global.AbortController ===
        'function'
    ) {
      controller =
        new global.AbortController();

      if (!settings.signal) {
        settings.signal =
          controller.signal;
      }

      timeoutId =
        global.setTimeout(
          function () {
            try {
              controller.abort();
            } catch (_) {}
          },
          timeout
        );
    }

    try {
      return await global.fetch(
        url,
        settings
      );
    } finally {
      if (timeoutId !== null) {
        global.clearTimeout(
          timeoutId
        );
      }
    }
  }

  async function fetchJson(
    url,
    options,
    timeoutMs
  ) {
    var response =
      await fetchWithTimeout(
        url,
        options,
        timeoutMs
      );

    if (!response.ok) {
      throw new Error(
        'HTTP ' +
          response.status
      );
    }

    return response.json();
  }

  async function probeNoCors(
    url,
    timeoutMs
  ) {
    if (!hasFetch()) {
      return true;
    }

    try {
      await fetchWithTimeout(
        url,
        {
          method: 'GET',
          mode: 'no-cors',
          cache: 'no-store',
          credentials: 'omit'
        },
        timeoutMs
      );

      return true;
    } catch (_) {
      return false;
    }
  }

  root.browserNetwork =
    Object.freeze({
      isNavigatorOnline:
        isNavigatorOnline,
      hasFetch: hasFetch,
      fetchWithTimeout:
        fetchWithTimeout,
      fetchJson: fetchJson,
      probeNoCors: probeNoCors
    });
})(window);
