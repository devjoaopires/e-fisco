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

  function configurarToggleMovimentacoes(){
    var botao = document.getElementById('scfFinanceMainCalendarButton');
    if(!botao || botao.dataset.scfMovToggleReady === '1') return;

    botao.dataset.scfMovToggleReady = '1';
    botao.setAttribute('aria-pressed','false');

    botao.addEventListener('click', function(){
      var ocultar = !document.body.classList.contains(
        'scf-financeiro-movimentacoes-ocultas'
      );

      document.body.classList.toggle(
        'scf-financeiro-movimentacoes-ocultas',
        ocultar
      );

      botao.setAttribute(
        'aria-pressed',
        ocultar ? 'true' : 'false'
      );
    });
  }

  configurarToggleMovimentacoes();

  var observer = new MutationObserver(function(){
    configurarToggleMovimentacoes();
  });

  observer.observe(document.documentElement,{
    childList:true,
    subtree:true
  });
})();
