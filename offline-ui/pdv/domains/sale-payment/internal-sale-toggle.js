(function(){
  'use strict';

  const salePaymentDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.salePayment;

  if(!salePaymentDomain){
    throw new Error(
      'PDV sale/payment domain indisponivel.'
    );
  }

  if(
    !salePaymentDomain.claimGuard(
      'internal-sale-toggle'
    )
  ){
    return;
  }

  if(
    typeof salePaymentDomain.internalSaleActive !==
      'boolean'
  ){
    salePaymentDomain.internalSaleActive =
      false;
  }

  function itemVendaInterna(){
    return document.querySelector(
      '#scfPdvShortcutLegend .scf-pdv-shortcut-venda-interna'
    );
  }

  function legendaPdvVisivel(){
    const body = document.body;
    const legenda =
      document.getElementById(
        'scfPdvShortcutLegend'
      );

    if(
      !body ||
      !body.classList.contains(
        'scf-pdv-pagina-selecionada'
      ) ||
      !legenda
    ){
      return false;
    }

    const estilo =
      window.getComputedStyle(
        legenda
      );

    return (
      estilo.display !== 'none' &&
      estilo.visibility !== 'hidden' &&
      legenda.getClientRects().length > 0
    );
  }

  function sincronizarVisual(){
    const item =
      itemVendaInterna();

    if(!item){
      return;
    }

    const ativo =
      salePaymentDomain.internalSaleActive ===
        true;

    item.classList.toggle(
      'is-active',
      ativo
    );

    item.setAttribute(
      'data-active',
      ativo ? 'true' : 'false'
    );
  }

  function alternarVendaInterna(){
    salePaymentDomain.internalSaleActive =
      salePaymentDomain.internalSaleActive !==
        true;

    sincronizarVisual();

    window.__scfPdvInfra.eventBus.dispatch(
      new CustomEvent(
        'scf:pdv-venda-interna-toggle',
        {
          detail:{
            ativa:
              salePaymentDomain.internalSaleActive ===
                true
          }
        }
      )
    );
  }

  document.addEventListener(
    'keydown',
    function(event){
      if(
        !event ||
        (
          String(event.key || '').toUpperCase() !==
            'F6' &&
          String(event.code || '').toUpperCase() !==
            'F6'
        ) ||
        !legendaPdvVisivel()
      ){
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if(
        typeof event.stopImmediatePropagation ===
          'function'
      ){
        event.stopImmediatePropagation();
      }

      alternarVendaInterna();
    },
    true
  );

  const observar =
    function(){
      sincronizarVisual();

      if(
        typeof MutationObserver !==
          'function' ||
        !document.body
      ){
        return;
      }

      new MutationObserver(
        function(){
          sincronizarVisual();
        }
      ).observe(
        document.body,
        {
          childList:true,
          subtree:true
        }
      );
    };

  if(document.readyState === 'loading'){
    document.addEventListener(
      'DOMContentLoaded',
      observar,
      { once:true }
    );
  }else{
    observar();
  }
})();
