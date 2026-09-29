(function(){
  'use strict';

  const crediarioDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.crediario;

  if(!crediarioDomain){
    throw new Error(
      'PDV crediario domain indisponivel.'
    );
  }

  if(
    !crediarioDomain.claimGuard(
      'list-keyboard'
    )
  ){
    return;
  }

  var indiceAtivo = -1;
  var crediarioIdAtivo = '';

  function listaF5ClientesAberta(){
    var body = document.body;
    return Boolean(
      body &&
      body.classList.contains('scf-crediario-list-open') &&
      !body.classList.contains('scf-crediario-detail-open')
    );
  }

  function obterLista(){
    return document.getElementById('fiscalProductsList');
  }

  function obterLinhas(){
    var lista = obterLista();
    return lista
      ? Array.prototype.slice.call(
          lista.querySelectorAll(':scope > .scf-crediario-list-row')
        )
      : [];
  }

  function idDaLinha(linha){
    return String(
      linha && linha.dataset
        ? linha.dataset.crediarioId || ''
        : ''
    ).trim();
  }

  function limparDestaque(linhas){
    (linhas || obterLinhas()).forEach(function(linha){
      linha.classList.remove('scf-crediario-list-keyboard-active');
      linha.setAttribute('aria-selected','false');
    });
  }

  function selecionarIndice(indice, opcoes){
    var linhas = obterLinhas();

    if(!linhas.length){
      indiceAtivo = -1;
      crediarioIdAtivo = '';
      return null;
    }

    var proximo = Math.max(
      0,
      Math.min(Number(indice) || 0, linhas.length - 1)
    );

    limparDestaque(linhas);

    var linha = linhas[proximo];
    linha.classList.add('scf-crediario-list-keyboard-active');
    linha.setAttribute('aria-selected','true');

    indiceAtivo = proximo;
    crediarioIdAtivo = idDaLinha(linha);

    if(!opcoes || opcoes.scroll !== false){
      try{
        linha.scrollIntoView({
          block:'nearest',
          inline:'nearest',
          behavior:'smooth'
        });
      }catch(error){
        try{ linha.scrollIntoView(false); }catch(ignore){}
      }
    }

    return linha;
  }

  function sincronizarSelecao(){
    if(!listaF5ClientesAberta()){
      indiceAtivo = -1;
      crediarioIdAtivo = '';
      return;
    }

    var linhas = obterLinhas();
    if(!linhas.length){
      indiceAtivo = -1;
      return;
    }

    var indicePreservado = -1;

    if(crediarioIdAtivo){
      indicePreservado = linhas.findIndex(function(linha){
        return idDaLinha(linha) === crediarioIdAtivo;
      });
    }

    if(indicePreservado < 0){
      indicePreservado = Math.max(
        0,
        Math.min(indiceAtivo < 0 ? 0 : indiceAtivo, linhas.length - 1)
      );
    }

    selecionarIndice(indicePreservado,{scroll:false});
  }

  function pagarLinhaAtiva(){
    var linhas = obterLinhas();
    if(!linhas.length){
      return false;
    }

    var indice = indiceAtivo;
    if(indice < 0 || indice >= linhas.length){
      indice = 0;
    }

    var linha = selecionarIndice(indice,{scroll:true});
    if(!linha){
      return false;
    }

    var pagar = linha.querySelector('.scf-crediario-list-pay');
    if(!pagar || pagar.disabled){
      return false;
    }

    /*
     * Clique real: reaproveita exatamente o listener PAGAR já existente,
     * incluindo solicitarDetalhe(...,'pagar') e todos os estados aprovados.
     */
    pagar.click();
    return true;
  }

  document.addEventListener(
    'keydown',
    function(event){
      if(!event || !listaF5ClientesAberta()){
        return;
      }

      if(event.ctrlKey || event.metaKey || event.altKey){
        return;
      }

      var tecla = String(event.key || '');
      if(
        tecla !== 'ArrowDown' &&
        tecla !== 'ArrowUp' &&
        tecla !== 'Enter'
      ){
        return;
      }

      var linhas = obterLinhas();
      if(!linhas.length){
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if(typeof event.stopImmediatePropagation === 'function'){
        event.stopImmediatePropagation();
      }

      if(tecla === 'ArrowDown'){
        var proximo = indiceAtivo < 0
          ? 0
          : Math.min(indiceAtivo + 1, linhas.length - 1);

        selecionarIndice(proximo,{scroll:true});
        return;
      }

      if(tecla === 'ArrowUp'){
        var anterior = indiceAtivo < 0
          ? linhas.length - 1
          : Math.max(indiceAtivo - 1, 0);

        selecionarIndice(anterior,{scroll:true});
        return;
      }

      pagarLinhaAtiva();
    },
    true
  );

  /* Clique/mouse mantém a linha do teclado sincronizada com a linha tocada. */
  document.addEventListener(
    'pointerdown',
    function(event){
      if(!listaF5ClientesAberta()){
        return;
      }

      var linha =
        event && event.target && event.target.closest
          ? event.target.closest('#fiscalProductsList > .scf-crediario-list-row')
          : null;

      if(!linha){
        return;
      }

      var linhas = obterLinhas();
      var indice = linhas.indexOf(linha);
      if(indice >= 0){
        selecionarIndice(indice,{scroll:false});
      }
    },
    true
  );

  function instalarObservadores(){
    var lista = obterLista();
    if(lista){
      new MutationObserver(function(){
        window.setTimeout(sincronizarSelecao,0);
      }).observe(lista,{
        childList:true
      });
    }

    if(document.body){
      new MutationObserver(function(){
        window.setTimeout(sincronizarSelecao,0);
      }).observe(document.body,{
        attributes:true,
        attributeFilter:['class']
      });
    }

    [0,40,120,300,700].forEach(function(atraso){
      window.setTimeout(sincronizarSelecao,atraso);
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded',instalarObservadores,{once:true});
  }else{
    instalarObservadores();
  }
})();
