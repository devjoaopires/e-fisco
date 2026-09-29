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

  function texto(v){
    return String(v == null ? '' : v).trim();
  }

  function termoAberto(){
    const overlay = document.getElementById('scfCashReceiptOverlay');
    const title = document.getElementById('scfCashReceiptTitle');

    return Boolean(
      overlay &&
      overlay.classList.contains('show') &&
      texto(title && title.textContent).toUpperCase() ===
        'TERMO FECHAMENTO DE CAIXA'
    );
  }

  function sync(){
    if(!termoAberto()) return;

    const group = document.getElementById('scfCashShortcutGroup');
    const button = document.getElementById('scfCashMovementShortcut');

    if(!group || !button) return;

    group.hidden = false;
    group.classList.add('scf-visible');
    group.setAttribute('aria-hidden','false');

    button.hidden = false;
    button.disabled = false;
    button.classList.add('scf-cash-back-mode');
    button.classList.remove(
      'scf-confirm-mode',
      'scf-close-mode',
      'scf-product-cancel-back-mode',
      'scf-product-cancel-confirm-mode'
    );
    button.textContent = 'F7 | VOLTAR';
    button.setAttribute('aria-hidden','false');
    button.setAttribute('aria-label','F7 | Voltar para abrir caixa');
  }

  const observer = new MutationObserver(function(){
    window.requestAnimationFrame(sync);
  });

  function init(){
    const overlay = document.getElementById('scfCashReceiptOverlay');
    const title = document.getElementById('scfCashReceiptTitle');
    const button = document.getElementById('scfCashMovementShortcut');

    if(overlay){
      observer.observe(overlay,{attributes:true,attributeFilter:['class','aria-hidden']});
    }
    if(title){
      observer.observe(title,{childList:true,characterData:true,subtree:true});
    }
    if(button){
      observer.observe(button,{attributes:true,childList:true,characterData:true,subtree:true});
    }

    sync();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded',init,{once:true});
  }else{
    init();
  }
})();
