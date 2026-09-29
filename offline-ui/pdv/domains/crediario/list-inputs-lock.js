(function(){
  'use strict';

  const IDS_CONTROLES = [
    'scfPdvCrediarioCpf',
    'scfPdvCrediarioWhatsapp',
    'scfPdvCrediarioCliente',
    'scfPdvCrediarioPagamento'
  ];

  let sincronizacaoAgendada = false;

  function listaClientesAberta(){
    const body = document.body;

    return Boolean(
      body &&
      body.classList.contains('scf-crediario-list-open') &&
      !body.classList.contains('scf-crediario-detail-open')
    );
  }

  function sincronizar(){
    sincronizacaoAgendada = false;

    const panel =
      document.getElementById('scfPdvCrediarioPanel');

    if(!panel){
      return;
    }

    const bloquear =
      listaClientesAberta();

    if(bloquear){
      if(!panel.hasAttribute('inert')){
        panel.setAttribute('inert','');
      }

      panel.classList.add(
        'scf-f5-list-form-inactive'
      );

      panel.setAttribute(
        'aria-disabled',
        'true'
      );
    }else{
      if(panel.hasAttribute('inert')){
        panel.removeAttribute('inert');
      }

      panel.classList.remove(
        'scf-f5-list-form-inactive'
      );

      panel.removeAttribute(
        'aria-disabled'
      );
    }

    IDS_CONTROLES.forEach(function(id){
      const controle =
        document.getElementById(id);

      if(!controle){
        return;
      }

      if(bloquear){
        controle.setAttribute(
          'aria-disabled',
          'true'
        );
      }else{
        controle.removeAttribute(
          'aria-disabled'
        );
      }
    });
  }

  function agendarSincronizacao(){
    if(sincronizacaoAgendada){
      return;
    }

    sincronizacaoAgendada = true;

    if(typeof window.requestAnimationFrame === 'function'){
      window.requestAnimationFrame(
        sincronizar
      );
      return;
    }

    window.setTimeout(
      sincronizar,
      0
    );
  }

  function iniciar(){
    agendarSincronizacao();

    const body = document.body;

    if(body){
      new MutationObserver(
        agendarSincronizacao
      ).observe(
        body,
        {
          attributes:true,
          attributeFilter:['class']
        }
      );
    }

    const host =
      document.getElementById('fiscalDesktopProductPhoto') ||
      document.body;

    if(host){
      new MutationObserver(
        agendarSincronizacao
      ).observe(
        host,
        {
          childList:true,
          subtree:true
        }
      );
    }

    window.__scfPdvInfra.shellBridge.onMessage(
      agendarSincronizacao
    );
  }

  if(document.readyState === 'loading'){
    document.addEventListener(
      'DOMContentLoaded',
      iniciar,
      {once:true}
    );
  }else{
    iniciar();
  }
})();
