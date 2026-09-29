(function(){
  'use strict';

  let pending = false;

  function cpfOpen(){
    return document.body.classList.contains(
      'cpf-fiscal-card-open'
    );
  }

  function button(){
    return document.getElementById(
      'scfCashMovementShortcut'
    );
  }

  function sync(){
    pending = false;

    const btn = button();
    if(!btn) return;

    const open = cpfOpen();

    btn.classList.toggle(
      'scf-cpf-back-mode',
      open
    );

    if(open){
      btn.textContent =
        'F7 | VOLTAR';

      btn.setAttribute(
        'aria-label',
        'F7 | Voltar para Finalizar Venda'
      );

      btn.disabled = false;
      btn.hidden = false;
      btn.setAttribute(
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

  function voltar(){
    if(
      typeof window.scfReturnFromCpfIdentificationToFinalize ===
        'function'
    ){
      try{
        return (
          window.scfReturnFromCpfIdentificationToFinalize() !==
          false
        );
      }catch(error){}
    }

    return false;
  }

  /*
   * WINDOW capture entra antes de handlers do botão/Document,
   * evitando que o clique seja interpretado como MOVIMENTAÇÃO.
   */
  window.addEventListener(
    'click',
    function(event){
      if(!cpfOpen()) return;

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

      voltar();

      window.setTimeout(
        requestSync,
        0
      );
    },
    true
  );

  window.addEventListener(
    'keydown',
    function(event){
      if(
        !cpfOpen() ||
        String(event.key || '') !==
          'F7'
      ){
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      voltar();

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

    [0, 80, 250, 700].forEach(
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
