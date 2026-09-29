(function(){
  'use strict';

  const cashDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.cash;

  if(!cashDomain){
    throw new Error(
      'PDV cash domain indisponivel.'
    );
  }

  let pending = false;

  function sync(){
    pending = false;

    const button =
      document.getElementById(
        'scfCashMovementShortcut'
      );

    if(
      !button ||
      !button.classList.contains(
        'scf-cash-back-mode'
      )
    ){
      return;
    }

    if(
      button.textContent !==
        'F7 | VOLTAR'
    ){
      button.textContent =
        'F7 | VOLTAR';
    }

    button.setAttribute(
      'aria-label',
      'F7 | Voltar ao PDV'
    );
  }

  function requestSync(){
    if(pending) return;
    pending = true;

    window.requestAnimationFrame(
      sync
    );
  }

  function init(){
    const button =
      document.getElementById(
        'scfCashMovementShortcut'
      );

    if(!button){
      return;
    }

    new MutationObserver(
      requestSync
    ).observe(
      button,
      {
        attributes:true,
        attributeFilter:['class'],
        childList:true,
        characterData:true,
        subtree:true
      }
    );

    requestSync();
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
