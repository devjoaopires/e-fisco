(function(){
  'use strict';

  const desktopQuery =
    window.matchMedia('(min-width:1001px)');

  let marcadorOriginal = null;

  function obterElementos(){
    return {
      overlay:
        document.getElementById(
          'scfSalesHistoryOverlay'
        ),
      painelProdutos:
        document.getElementById(
          'fiscalProductsView'
        )
    };
  }

  function garantirMarcador(overlay){
    if(
      marcadorOriginal ||
      !overlay ||
      !overlay.parentNode
    ){
      return;
    }

    marcadorOriginal =
      document.createComment(
        'scf-historico-vendas-posicao-original'
      );

    overlay.parentNode.insertBefore(
      marcadorOriginal,
      overlay
    );
  }

  function montarHistoricoNoLayout(){
    const elementos =
      obterElementos();

    const overlay =
      elementos.overlay;

    const painelProdutos =
      elementos.painelProdutos;

    if(
      !overlay ||
      !painelProdutos
    ){
      return;
    }

    garantirMarcador(
      overlay
    );

    if(
      desktopQuery.matches
    ){
      /*
       * O próprio histórico passa a ser filho do painel esquerdo do PDV.
       * Não existe mais necessidade de sincronizar um segundo card por pixels.
       */
      if(
        overlay.parentElement !==
          painelProdutos
      ){
        painelProdutos.appendChild(
          overlay
        );
      }
    }else if(
      marcadorOriginal &&
      marcadorOriginal.parentNode &&
      overlay.parentNode !==
        marcadorOriginal.parentNode
    ){
      /*
       * Em telas menores preserva o comportamento original do arquivo.
       */
      marcadorOriginal.parentNode.insertBefore(
        overlay,
        marcadorOriginal.nextSibling
      );
    }
  }

  function iniciar(){
    montarHistoricoNoLayout();

    if(
      typeof desktopQuery.addEventListener ===
        'function'
    ){
      desktopQuery.addEventListener(
        'change',
        montarHistoricoNoLayout
      );
    }else if(
      typeof desktopQuery.addListener ===
        'function'
    ){
      desktopQuery.addListener(
        montarHistoricoNoLayout
      );
    }
  }

  if(
    document.readyState ===
      'loading'
  ){
    document.addEventListener(
      'DOMContentLoaded',
      iniciar,
      { once:true }
    );
  }else{
    iniciar();
  }
})();
