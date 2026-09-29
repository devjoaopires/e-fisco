(function(){
  'use strict';

  function bodyCrediario(){
    var body=document.body;
    return Boolean(
      body && (
        body.classList.contains('scf-crediario-open') ||
        body.classList.contains('scf-crediario-list-open') ||
        body.classList.contains('scf-crediario-detail-open')
      )
    );
  }

  function botaoMovimentacao(){
    return document.getElementById('scfCashMovementShortcut');
  }

  function listaProdutos(){
    return document.getElementById('fiscalProductsList');
  }

  function possuiProdutoAtivoAdicionado(){
    var lista=listaProdutos();
    if(!lista) return false;

    return Boolean(
      lista.querySelector(
        '.fiscal-danfe-item-wrap:not(.is-preview):not(.is-cancelled)'
      )
    );
  }

  function botaoEstaComoMovimentacao(botao){
    if(!botao) return false;

    return String(botao.textContent || '')
      .replace(/\s+/g,' ')
      .trim()
      .toUpperCase() === 'F11 | MOVIMENTAÇÃO';
  }

  function deveBloquear(){
    var botao=botaoMovimentacao();

    return Boolean(
      botao &&
      !bodyCrediario() &&
      botaoEstaComoMovimentacao(botao) &&
      (
        possuiProdutoAtivoAdicionado() ||
        window.__scfSistemaOnlineAtual === false
      )
    );
  }

  function sincronizar(){
    var botao=botaoMovimentacao();
    if(!botao) return;

    var bloquear=deveBloquear();

    botao.classList.toggle(
      'scf-normal-sale-products-f11-locked',
      bloquear
    );

    if(bloquear){
      botao.setAttribute('aria-disabled','true');
      botao.setAttribute(
        'aria-label',
        'F11 | Movimentação indisponível durante venda com produtos'
      );
      botao.title='Movimentação indisponível durante venda em andamento';
    }else if(
      botao.getAttribute('aria-label') ===
        'F11 | Movimentação indisponível durante venda com produtos'
    ){
      botao.setAttribute('aria-disabled','false');
      botao.setAttribute('aria-label','F11 | Movimentação do caixa');
      botao.removeAttribute('title');
    }
  }

  /*
   * Bloqueia o clique antes do handler original SOMENTE enquanto o botão
   * estiver no papel F11 | MOVIMENTAÇÃO. Se F2 o transformar em CANCELAR,
   * a classe é retirada e o botão continua funcionando normalmente.
   */
  document.addEventListener(
    'click',
    function(event){
      var alvo=event && event.target && event.target.closest
        ? event.target.closest('#scfCashMovementShortcut')
        : null;

      if(!alvo || !deveBloquear()) return;

      event.preventDefault();
      event.stopPropagation();

      if(typeof event.stopImmediatePropagation === 'function'){
        event.stopImmediatePropagation();
      }
    },
    true
  );

  /* F11 físico também fica neutro durante uma venda normal com itens. */
  window.addEventListener(
    'keydown',
    function(event){
      if(!event) return;

      var key=String(event.key || event.code || '').toUpperCase();
      if(key !== 'F11' || !deveBloquear()) return;

      event.preventDefault();
      event.stopPropagation();

      if(typeof event.stopImmediatePropagation === 'function'){
        event.stopImmediatePropagation();
      }
    },
    true
  );

  function observar(){
    sincronizar();

    var lista=listaProdutos();
    if(lista && typeof MutationObserver === 'function'){
      new MutationObserver(sincronizar).observe(lista,{
        childList:true,
        subtree:true,
        attributes:true,
        attributeFilter:['class']
      });
    }

    var botao=botaoMovimentacao();
    if(botao && typeof MutationObserver === 'function'){
      new MutationObserver(sincronizar).observe(botao,{
        childList:true,
        subtree:true,
        characterData:true,
        attributes:true,
        attributeFilter:['class']
      });
    }

    if(document.body && typeof MutationObserver === 'function'){
      new MutationObserver(sincronizar).observe(document.body,{
        attributes:true,
        attributeFilter:['class']
      });
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded',observar,{once:true});
  }else{
    observar();
  }

  /* Exposto apenas para sincronizações pontuais do próprio PDV. */
  window.scfSyncNormalSaleF11MovementLock=sincronizar;
})();
