(function(){
  'use strict';

  let pending = false;

  function ativo(){
    return (
      document.body.classList.contains(
        'sale-completed-card-open'
      ) &&
      document.body.classList.contains(
        'scf-sale-pf-cupom-ready'
      )
    );
  }

  function botao(){
    return document.getElementById(
      'scfCashMovementShortcut'
    );
  }

  function sincronizar(){
    pending = false;

    const btn = botao();
    if(!btn) return;

    const ligado = ativo();

    btn.classList.toggle(
      'scf-pf-cupom-mode',
      ligado
    );

    if(ligado){
      btn.textContent =
        'CUPOM FISCAL';

      btn.setAttribute(
        'aria-label',
        'CUPOM FISCAL | Pressione ENTER'
      );

      btn.disabled = false;
      btn.hidden = false;

      btn.setAttribute(
        'aria-hidden',
        'false'
      );
    }
  }

  function solicitarSync(){
    if(pending) return;

    pending = true;

    window.requestAnimationFrame(
      sincronizar
    );
  }

  function gerarCupom(){
    if(
      typeof window.scfHandleCompletedReceiptAction ===
        'function'
    ){
      try{
        window.scfHandleCompletedReceiptAction();
        return true;
      }catch(error){}
    }

    return false;
  }

  /*
   * ENTER é a confirmação principal desse estado.
   * Capture impede o evento de acionar outro controle do PDV.
   */
  window.addEventListener(
    'keydown',
    function(event){
      if(
        !ativo() ||
        String(event.key || '') !==
          'Enter'
      ){
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      gerarCupom();

      window.setTimeout(
        solicitarSync,
        0
      );
    },
    true
  );

  /*
   * Clique no rodapé executa o mesmo fluxo do antigo CUPOM FISCAL.
   */
  window.addEventListener(
    'click',
    function(event){
      if(!ativo()) return;

      const target =
        event.target &&
        event.target.closest
          ? event.target.closest(
              '#scfCashMovementShortcut'
            )
          : null;

      if(!target) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      gerarCupom();

      window.setTimeout(
        solicitarSync,
        0
      );
    },
    true
  );

  function init(){
    solicitarSync();

    new MutationObserver(
      solicitarSync
    ).observe(
      document.body,
      {
        attributes:true,
        attributeFilter:['class']
      }
    );

    [0, 80, 250, 700].forEach(
      function(delay){
        window.setTimeout(
          solicitarSync,
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
