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

  function garantir(){
    const form = document.getElementById('fiscalForm');
    if(!form) return false;

    ['scfFinanceDecorTop','scfFinanceDecorBottom']
      .forEach(function(id){
        let node = document.getElementById(id);
        if(!node){
          node = document.createElement('div');
          node.id = id;
          node.setAttribute('aria-hidden','true');
          node.setAttribute('role','presentation');
        }
        if(node.parentElement !== form){
          form.appendChild(node);
        }
      });

    return true;
  }

  garantir();
  window.setTimeout(garantir,0);
  window.setTimeout(garantir,250);
})();
