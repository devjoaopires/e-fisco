(function(){
  'use strict';

  function novoCrediarioOfflineAtivo(){
    var html=document.documentElement;
    var body=document.body;

    return Boolean(
      html &&
      html.getAttribute('data-scf-embedded') === '1' &&
      body &&
      body.classList.contains('scf-crediario-open') &&
      !body.classList.contains('scf-crediario-list-open') &&
      !body.classList.contains('scf-crediario-detail-open') &&
      !body.classList.contains('scf-crediario-payment-methods-open')
    );
  }

  function sincronizar(){
    if(!novoCrediarioOfflineAtivo()){
      return;
    }

    var botao=document.getElementById('scfPdvCrediarioConfirm');
    var linha=document.querySelector(
      '#scfPdvCrediarioPanel .scf-pdv-crediario-payment-row'
    );

    if(linha){
      linha.style.setProperty('display','grid','important');
      linha.style.setProperty(
        'grid-template-columns',
        'minmax(0,1fr) 112px',
        'important'
      );
      linha.style.setProperty('column-gap','8px','important');
      linha.style.setProperty('gap','8px','important');
      linha.style.setProperty('align-items','end','important');
    }

    if(!botao){
      return;
    }

    if(botao.hidden){
      botao.hidden=false;
    }

    if(botao.hasAttribute('hidden')){
      botao.removeAttribute('hidden');
    }

    botao.style.setProperty('display','flex','important');
    botao.style.setProperty('visibility','visible','important');
    botao.style.setProperty('opacity','1','important');
    botao.style.setProperty('pointer-events','auto','important');
    botao.style.setProperty('width','112px','important');
    botao.style.setProperty('min-width','112px','important');
    botao.style.setProperty('max-width','112px','important');
    botao.style.setProperty('height','32px','important');
    botao.style.setProperty('min-height','32px','important');
    botao.style.setProperty('max-height','32px','important');
    botao.style.setProperty('align-items','center','important');
    botao.style.setProperty('justify-content','center','important');
  }

  function agendar(){
    window.setTimeout(sincronizar,0);
    window.setTimeout(sincronizar,40);
    window.setTimeout(sincronizar,120);
  }

  window.__scfPdvInfra.eventBus.on('scf:crediario-venda-pronta',
    agendar
  );

  if(typeof MutationObserver === 'function'){
    new MutationObserver(agendar).observe(
      document.documentElement,
      {
        childList:true,
        subtree:true,
        attributes:true,
        attributeFilter:['class','hidden']
      }
    );
  }

  agendar();
})();
