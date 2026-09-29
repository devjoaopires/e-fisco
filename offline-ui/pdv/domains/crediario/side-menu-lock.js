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

  var idsLaterais = [
    'localizacaoBtn',
    'bloqueioBtn',
    'cadastrarBtn',
    'admin'
  ];

  var sincronizando = false;
  var observerDock = null;
  var observerBody = null;
  var observerCrediarioVisual = null;

  function crediarioExibindoListaOperacional(){
    var body = document.body;
    if(!body) return false;

    /*
     * F5 — MENU NORMAL NA LISTA DE CLIENTES.
     *
     * Pressionar F5 e permanecer em CLIENTE | WHATSAPP | SITUAÇÃO
     * NÃO bloqueia mais VENDAS / ESTOQUE / CADASTRO / FINANCEIRO.
     *
     * A trava entra somente depois que um cliente é aberto e a lista
     * de compras/produtos desse crediário passa a ser exibida.
     */
    if(
      body.classList.contains('scf-crediario-detail-open')
    ){
      return true;
    }

    /*
     * Fallback visual: se alguma rotina legada perder momentaneamente
     * a classe do body, a presença de uma linha de produto exclusiva
     * do detalhe do crediário mantém a trava. A lista inicial de clientes
     * (.scf-crediario-list-row / .scf-crediario-list-empty) NÃO bloqueia.
     */
    var view =
      document.getElementById('fiscalProductsView');

    var list =
      document.getElementById('fiscalProductsList');

    if(
      !view ||
      view.hidden === true ||
      !list
    ){
      return false;
    }

    return Boolean(
      list.querySelector('.scf-crediario-product-row')
    );
  }

  function botoesLaterais(){
    return idsLaterais
      .map(function(id){
        return document.getElementById(id);
      })
      .filter(Boolean);
  }

  function guardarEstadoAnterior(botao){
    if(
      botao.dataset.scfCrediarioMenuEstadoGuardado ===
        '1'
    ){
      return;
    }

    botao.dataset.scfCrediarioMenuEstadoGuardado = '1';
    botao.dataset.scfCrediarioMenuDisabledAntes =
      botao.disabled ? '1' : '0';
    botao.dataset.scfCrediarioMenuIsOffAntes =
      botao.classList.contains('is-off') ? '1' : '0';
    botao.dataset.scfCrediarioMenuAriaPressedAntes =
      botao.hasAttribute('aria-pressed')
        ? String(botao.getAttribute('aria-pressed'))
        : '__SCF_NONE__';
    botao.dataset.scfCrediarioMenuTabindexAntes =
      botao.hasAttribute('tabindex')
        ? String(botao.getAttribute('tabindex'))
        : '__SCF_NONE__';
  }

  function restaurarEstadoAnterior(botao){
    var haviaEstado =
      botao.dataset.scfCrediarioMenuEstadoGuardado ===
        '1';

    botao.classList.remove(
      'scf-crediario-menu-locked'
    );

    if(!haviaEstado){
      return;
    }

    /*
     * Se outra trava legítima estiver ativa, ela continua soberana.
     * O desbloqueio do CREDIÁRIO não pode reabilitar um botão que a
     * venda/fiscal ainda precisa manter desabilitado.
     */
    var outraTrava =
      botao.classList.contains('sale-menu-locked') ||
      botao.classList.contains('receipt-menu-locked');

    if(!outraTrava){
      if(
        botao.dataset.scfCrediarioMenuDisabledAntes ===
          '1'
      ){
        botao.disabled = true;
        botao.setAttribute('disabled','');
        botao.setAttribute('aria-disabled','true');
      }else{
        botao.disabled = false;
        botao.removeAttribute('disabled');
        botao.setAttribute('aria-disabled','false');
      }

      if(
        botao.dataset.scfCrediarioMenuIsOffAntes ===
          '1'
      ){
        botao.classList.add('is-off');
      }else{
        botao.classList.remove('is-off');
      }

      var ariaPressedAntes =
        botao.dataset.scfCrediarioMenuAriaPressedAntes;

      if(ariaPressedAntes === '__SCF_NONE__'){
        botao.removeAttribute('aria-pressed');
      }else if(ariaPressedAntes != null){
        botao.setAttribute(
          'aria-pressed',
          ariaPressedAntes
        );
      }

      var tabindexAntes =
        botao.dataset.scfCrediarioMenuTabindexAntes;

      if(tabindexAntes === '__SCF_NONE__'){
        botao.removeAttribute('tabindex');
      }else if(tabindexAntes != null){
        botao.setAttribute(
          'tabindex',
          tabindexAntes
        );
      }
    }

    delete botao.dataset.scfCrediarioMenuEstadoGuardado;
    delete botao.dataset.scfCrediarioMenuDisabledAntes;
    delete botao.dataset.scfCrediarioMenuIsOffAntes;
    delete botao.dataset.scfCrediarioMenuAriaPressedAntes;
    delete botao.dataset.scfCrediarioMenuTabindexAntes;
  }

  function aplicarEstadoMenuCrediario(){
    if(sincronizando) return;
    sincronizando = true;

    try{
      var bloquear =
        crediarioExibindoListaOperacional();

      crediarioDomain.sideMenuLocked =
        bloquear;

      botoesLaterais().forEach(
        function(botao){
          if(bloquear){
            guardarEstadoAnterior(botao);

            /*
             * O CREDIÁRIO pertence ao PDV: nenhum módulo lateral deve
             * parecer selecionado enquanto as listas estiverem na tela.
             */
            if(
              !botao.classList.contains(
                'scf-crediario-menu-locked'
              )
            ){
              botao.classList.add(
                'scf-crediario-menu-locked'
              );
            }

            if(botao.classList.contains('is-off')){
              botao.classList.remove('is-off');
            }

            if(!botao.disabled){
              botao.disabled = true;
            }

            if(!botao.hasAttribute('disabled')){
              botao.setAttribute('disabled','');
            }

            if(
              botao.getAttribute('aria-disabled') !==
                'true'
            ){
              botao.setAttribute(
                'aria-disabled',
                'true'
              );
            }

            if(
              botao.getAttribute('aria-pressed') !==
                'false'
            ){
              botao.setAttribute(
                'aria-pressed',
                'false'
              );
            }

            if(
              botao.getAttribute('tabindex') !==
                '-1'
            ){
              botao.setAttribute(
                'tabindex',
                '-1'
              );
            }
          }else{
            restaurarEstadoAnterior(botao);
          }
        }
      );
    }finally{
      sincronizando = false;
    }
  }

  function agendarSincronizacao(){
    window.setTimeout(
      aplicarEstadoMenuCrediario,
      0
    );
    window.setTimeout(
      aplicarEstadoMenuCrediario,
      40
    );
  }

  /*
   * Proteção adicional: mesmo que algum handler legado tente receber o
   * clique antes de perceber o atributo disabled, o evento não sai do menu.
   */
  function bloquearEventoMenuLateralCrediario(event){
    /* Recalcula pela tela antes de decidir: evita uma janela de corrida. */
    var bloquear =
      crediarioExibindoListaOperacional();

    if(!bloquear){
      return;
    }

    crediarioDomain.sideMenuLocked =
      true;

    var target =
      event &&
      event.target &&
      event.target.closest
        ? event.target.closest(
            '#localizacaoBtn,#bloqueioBtn,#cadastrarBtn,#admin'
          )
        : null;

    if(!target) return;

    event.preventDefault();
    event.stopPropagation();

    if(
      typeof event.stopImmediatePropagation ===
        'function'
    ){
      event.stopImmediatePropagation();
    }

    agendarSincronizacao();
  }

  [
    'pointerdown',
    'mousedown',
    'touchstart',
    'click'
  ].forEach(
    function(tipo){
      document.addEventListener(
        tipo,
        bloquearEventoMenuLateralCrediario,
        true
      );
    }
  );

  function iniciar(){
    if(!document.body) return;

    if(!observerBody){
      observerBody =
        new MutationObserver(
          agendarSincronizacao
        );

      observerBody.observe(
        document.body,
        {
          attributes:true,
          attributeFilter:['class']
        }
      );
    }

    var dock =
      document.getElementById('dockActions');

    if(dock && !observerDock){
      /*
       * SCF_CENTRAL_VENDA_ESTADO possui uma rotina antiga que pode
       * reabilitar os laterais no F5. Observamos os atributos do dock e
       * reaplicamos esta trava enquanto o CREDIÁRIO continuar aberto.
       */
      observerDock =
        new MutationObserver(
          agendarSincronizacao
        );

      observerDock.observe(
        dock,
        {
          subtree:true,
          childList:true,
          attributes:true,
          attributeFilter:[
            'class',
            'disabled',
            'aria-disabled',
            'tabindex'
          ]
        }
      );
    }

    var crediarioView =
      document.getElementById('fiscalProductsView');

    if(
      crediarioView &&
      !observerCrediarioVisual
    ){
      observerCrediarioVisual =
        new MutationObserver(
          agendarSincronizacao
        );

      observerCrediarioVisual.observe(
        crediarioView,
        {
          subtree:true,
          childList:true,
          attributes:true,
          attributeFilter:[
            'class',
            'hidden'
          ]
        }
      );
    }

    aplicarEstadoMenuCrediario();
  }

  if(document.readyState === 'loading'){
    document.addEventListener(
      'DOMContentLoaded',
      iniciar,
      {once:true}
    );
  }else{
    iniciar();
  }

  window.__scfPdvInfra.shellBridge.onMessage(
    agendarSincronizacao
  );
})();
