(function(){
  'use strict';

  const financeDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.finance;

  if(!financeDomain){
    throw new Error(
      'PDV finance domain indisponivel.'
    );
  }

  function corrigirRotulo(){
    const input =
      document.getElementById(
        'scfFinanceEntryNewDate'
      );

    if(!input){
      return;
    }

    const label =
      document.querySelector(
        'label[for="scfFinanceEntryNewDate"]'
      );

    if(
      label &&
      label.textContent !== 'RECEBIMENTO'
    ){
      label.textContent =
        'RECEBIMENTO';
    }

    input.title =
      'RECEBIMENTO';

    input.setAttribute(
      'aria-label',
      'Data do recebimento'
    );
  }

  corrigirRotulo();

  const observer =
    new MutationObserver(
      function(){
        corrigirRotulo();
      }
    );

  observer.observe(
    document.body,
    {
      childList:true,
      subtree:true
    }
  );

  window.__scfPdvInfra.eventBus.on('scf:financeiro-saldo-recarregar',
    corrigirRotulo
  );

  window.addEventListener(
    'load',
    corrigirRotulo
  );
})();
