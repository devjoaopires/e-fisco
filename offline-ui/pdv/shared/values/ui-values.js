(function (global) {
  'use strict';

  var root =
    global.__scfPdvShared ||
    (global.__scfPdvShared = {});

  root.values = Object.freeze({
    fiscalEnvironment:
      Object.freeze({
        production:
          'PRODUÇÃO',
        homologation:
          'HOMOLOGAÇÃO'
      }),
    connectivity:
      Object.freeze({
        onlineText:
          'SISTEMA ON-LINE',
        offlineText:
          'SISTEMA OFF-LINE',
        onlineAria:
          'Sistema on-line',
        offlineAria:
          'Sistema off-line',
        probeBaseUrl:
          'https://www.gstatic.com/generate_204?scf_online=',
        probeTimeoutMs:
          5000,
        pollIntervalMs:
          30000
      })
  });
})(window);
