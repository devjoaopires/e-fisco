(function(){
  'use strict';

  const superadminDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.superadmin;

  if(!superadminDomain){
    throw new Error(
      'PDV superadmin domain indisponivel.'
    );
  }

  function removerSetaResidual(){
    const seta = document.getElementById('scfSuperAdminCompanyDetailsBack');
    if(seta && seta.parentNode){
      seta.parentNode.removeChild(seta);
    }
  }

  function iniciar(){
    removerSetaResidual();

    const alvo = document.documentElement || document.body;
    if(alvo && typeof MutationObserver === 'function'){
      new MutationObserver(removerSetaResidual).observe(alvo, {
        childList:true,
        subtree:true
      });
    }

    [0,80,220,500,900,1400,2000].forEach(function(atraso){
      window.setTimeout(removerSetaResidual, atraso);
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', iniciar, {once:true});
  }else{
    iniciar();
  }
})();
