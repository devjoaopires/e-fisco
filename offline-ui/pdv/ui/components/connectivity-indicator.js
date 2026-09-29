(function(){
  'use strict';

  const runtimeState =
    window.__scfPdvState.runtime;
  const connectivityValues =
    window.__scfPdvShared
      .values.connectivity;

  if(
    runtimeState
      .getConnectivityReady() ===
      true
  ){
    return;
  }

  runtimeState
    .setConnectivityReady(true);

  const statusElemento = window.__scfPdvInfra.dom.byId('scfSystemConnectivity');
  const statusTexto = window.__scfPdvInfra.dom.byId('scfSystemConnectivityText');
  if(!statusElemento || !statusTexto){ return; }

  let sequencia = 0;

  function aplicarEstado(online){
    const estaOnline = online === true;
    statusElemento.classList.toggle('is-online', estaOnline);
    statusElemento.classList.toggle('is-offline', !estaOnline);
    statusTexto.textContent =
      estaOnline
        ? connectivityValues.onlineText
        : connectivityValues.offlineText;

    statusElemento.setAttribute(
      'aria-label',
      estaOnline
        ? connectivityValues.onlineAria
        : connectivityValues.offlineAria
    );

    /* Mantém o menu inferior sincronizado com o mesmo estado da bolinha. */
    runtimeState
      .setSystemOnlineCurrent(
        estaOnline
      );

    if(
      typeof window.scfSyncNormalSaleF11MovementLock ===
        'function'
    ){
      try{
        window.scfSyncNormalSaleF11MovementLock();
      }catch(error){}
    }

    try{
      const menuFrame = window.__scfPdvInfra.dom.byId('__htmlStatusIframe');
      if(menuFrame && menuFrame.contentWindow){
        menuFrame.contentWindow.postMessage(
          {
            type: 'SCF_CONECTIVIDADE_ESTADO',
            online: estaOnline
          },
          '*'
        );
      }
    }catch(error){}
  }

  function navegadorOnline(){
    return window.__scfPdvInfra.browserNetwork
      .isNavigatorOnline();
  }

  async function conferirInternet(){
    const atual = ++sequencia;

    if(!navegadorOnline()){
      aplicarEstado(false);
      return;
    }

    if(
      !window.__scfPdvInfra
        .browserNetwork
        .hasFetch()
    ){
      aplicarEstado(true);
      return;
    }

    const online =
      await window.__scfPdvInfra
        .browserNetwork
        .probeNoCors(
          connectivityValues.probeBaseUrl +
            Date.now(),
          connectivityValues.probeTimeoutMs
        );

    if(atual === sequencia){
      aplicarEstado(
        online === true
      );
    }
  }

  window.addEventListener('online', function(){
    aplicarEstado(true);
    conferirInternet();
  });

  window.addEventListener('offline', function(){
    sequencia += 1;
    aplicarEstado(false);
  });

  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'visible'){ conferirInternet(); }
  });

  aplicarEstado(navegadorOnline());
  conferirInternet();
  window.setInterval(
    conferirInternet,
    connectivityValues.pollIntervalMs
  );
})();
