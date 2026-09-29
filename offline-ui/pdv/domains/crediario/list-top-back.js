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
      'list-top-back'
    )
  ){
    return;
  }

  var botao = null;

  function obterHeader(){
    var titulo = document.getElementById('fiscalSaleTitle');
    return titulo ? titulo.closest('.fiscal-header') : null;
  }

  function obterFonteSetaConhecida(){
    var conhecida = document.querySelector(
      '#scfSalesHistoryBack .scf-sales-history-back-icon, #scfSalesHistoryBack img'
    );

    return conhecida
      ? String(conhecida.getAttribute('src') || conhecida.src || '').trim()
      : '';
  }

  function criarOuReposicionar(){
    var header = obterHeader();
    if(!header){
      return false;
    }

    if(!botao || !botao.isConnected){
      botao = document.getElementById('scfCrediarioListTopBack');
    }

    if(!botao){
      botao = document.createElement('button');
      botao.id = 'scfCrediarioListTopBack';
      botao.type = 'button';
      botao.setAttribute('aria-label','Voltar ao PDV normal');
      botao.setAttribute('title','Voltar ao PDV');

      var img = document.createElement('img');
      img.alt = '';
      img.setAttribute('aria-hidden','true');
      img.className = 'scf-crediario-list-top-back-icon';

      var src = obterFonteSetaConhecida();
      if(src){
        img.src = src;
      }

      botao.appendChild(img);

      botao.addEventListener('click',function(event){
        event.preventDefault();
        event.stopPropagation();

        /*
         * O handler já aprovado do botão central PDV escuta exatamente
         * SCF_FISCAL_HOME_ABRIR. Enviar o mesmo comando evita criar uma
         * segunda rotina de encerramento do crediário e mantém o comportamento
         * idêntico ao botão PDV.
         */
        window.postMessage(
          {
            type:'SCF_FISCAL_HOME_ABRIR',
            origem:'SCF_CREDIARIO_LISTA_TOPO_VOLTAR'
          },
          '*'
        );
      });
    }

    if(botao.parentNode !== header){
      header.appendChild(botao);
    }

    var imgAtual = botao.querySelector('img');
    if(imgAtual && !String(imgAtual.getAttribute('src') || '').trim()){
      var fonte = obterFonteSetaConhecida();
      if(fonte){
        imgAtual.src = fonte;
      }
    }

    return true;
  }

  function iniciar(){
    criarOuReposicionar();

    [0,60,180,500,1200].forEach(function(delay){
      window.setTimeout(criarOuReposicionar,delay);
    });

    var body = document.body;
    if(body){
      new MutationObserver(function(){
        criarOuReposicionar();
      }).observe(body,{
        attributes:true,
        attributeFilter:['class']
      });
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded',iniciar,{once:true});
  }else{
    iniciar();
  }
})();
