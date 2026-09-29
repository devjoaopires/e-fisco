(function(){
  'use strict';

  const fiscalDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.fiscal;

  if(!fiscalDomain){
    throw new Error(
      'PDV fiscal domain indisponivel para processing footer.'
    );
  }

  let pending = false;

  function btn(){
    return document.getElementById(
      'scfCashMovementShortcut'
    );
  }

  function processando(){
    return (
      document.body.classList.contains(
        'sale-completed-card-open'
      ) &&
      document.body.classList.contains(
        'scf-nfce-processing'
      )
    );
  }

  function cupomAtualAberto(){
    return (
      document.body.classList.contains(
        'fiscal-receipt-open'
      ) &&
      document.body.classList.contains(
        'scf-current-sale-receipt-open'
      )
    );
  }

  function sync(){
    pending = false;

    const button = btn();
    if(!button) return;

    const processing =
      processando();

    const receiptOpen =
      cupomAtualAberto();

    button.classList.toggle(
      'scf-nfce-processing-mode',
      processing
    );

    button.classList.toggle(
      'scf-receipt-close-mode',
      receiptOpen
    );

    if(receiptOpen){
      button.textContent =
        'FECHAR';

      button.setAttribute(
        'aria-label',
        'FECHAR | Pressione ENTER'
      );

      button.disabled = false;
      button.hidden = false;

      button.setAttribute(
        'aria-hidden',
        'false'
      );

      return;
    }

    if(processing){
      button.textContent =
        'PROCESSANDO';

      button.setAttribute(
        'aria-label',
        'PROCESSANDO NFC-e'
      );

      button.disabled = false;
      button.hidden = false;

      button.setAttribute(
        'aria-hidden',
        'false'
      );
    }
  }

  function requestSync(){
    if(pending) return;

    pending = true;

    window.requestAnimationFrame(
      sync
    );
  }

  function fecharCupom(){
    try{
      return fiscalDomain.closeReceipt();
    }catch(error){
      return false;
    }
  }

  /*
   * PROCESSANDO é apenas status:
   * bloqueia clique no antigo atalho de movimentação.
   */
  window.addEventListener(
    'click',
    function(event){
      const target =
        event.target &&
        event.target.closest
          ? event.target.closest(
              '#scfCashMovementShortcut'
            )
          : null;

      if(!target) return;

      if(processando()){
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      if(!cupomAtualAberto()){
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      fecharCupom();

      window.setTimeout(
        requestSync,
        0
      );
    },
    true
  );

  /*
   * ENTER fecha o DANFE da venda atual.
   * Durante PROCESSANDO, ENTER é ignorado para evitar ação acidental.
   */
  window.addEventListener(
    'keydown',
    function(event){
      if(!event) return;

      const key =
        String(
          event.key || ''
        );

      if(
        processando() &&
        (
          key === 'Enter' ||
          key === 'F11'
        )
      ){
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      if(
        !cupomAtualAberto() ||
        key !== 'Enter'
      ){
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      fecharCupom();

      window.setTimeout(
        requestSync,
        0
      );
    },
    true
  );

  function init(){
    requestSync();

    new MutationObserver(
      requestSync
    ).observe(
      document.body,
      {
        attributes:true,
        attributeFilter:['class']
      }
    );

    [0, 50, 120, 300, 800].forEach(
      function(delay){
        window.setTimeout(
          requestSync,
          delay
        );
      }
    );
  }

  if(
    document.readyState ===
      'loading'
  ){
    document.addEventListener(
      'DOMContentLoaded',
      init,
      { once:true }
    );
  }else{
    init();
  }
})();
