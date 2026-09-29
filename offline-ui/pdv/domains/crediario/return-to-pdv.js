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
      'return-pdv-normal'
    )
  ){
    return;
  }

  const body = document.body;
  if(!body){
    return;
  }

  let pdvEstavaSelecionado =
    body.classList.contains(
      'scf-pdv-pagina-selecionada'
    );

  let restauracaoPendente = false;
  let saiuDoPdvComListaF5 = false;

  /*
   * Guarda iniciada NO PRIMEIRO EVENTO FÍSICO do botão CADASTRO.
   *
   * Motivo: handlers legados podem remover scf-pdv-pagina-selecionada
   * antes de o dropdown receber a classe .show. Se dependermos somente
   * de .show, a MutationObserver pode interpretar esse intervalo como
   * uma navegação real e chamar scfFecharListaCrediario(), apagando as
   * linhas dos clientes. A guarda nasce em pointerdown/mousedown/click
   * (capture=true), portanto existe antes dos handlers antigos.
   */
  let cadastroDropdownInteracaoAte = 0;
  let menuIframeAtual = null;
  let menuDocumentoAtual = null;

  function agora(){
    return Date.now();
  }

  function marcarAberturaCadastro(){
    cadastroDropdownInteracaoAte =
      agora() + 900;
  }

  function cancelarGuardaCadastro(){
    cadastroDropdownInteracaoAte = 0;
  }

  function listaF5Aberta(){
    return body.classList.contains(
      'scf-crediario-list-open'
    );
  }

  function cadastroDropdownApenasAberto(){
    var dropdown =
      document.getElementById(
        'scfCadastrarQuickDropdown'
      );

    return Boolean(
      dropdown &&
      dropdown.classList.contains('show') &&
      dropdown.getAttribute('aria-hidden') !== 'true'
    );
  }

  function aberturaCadastroEmCurso(){
    return Boolean(
      agora() <= cadastroDropdownInteracaoAte ||
      cadastroDropdownApenasAberto()
    );
  }

  function obterIframeMenu(){
    return document.getElementById(
      '__htmlStatusIframe'
    );
  }

  function marcarSeBotaoCadastro(target){
    var botao =
      target && target.closest
        ? target.closest('#cadastrarBtn')
        : null;

    if(!botao){
      return;
    }

    marcarAberturaCadastro();
  }

  function instalarGuardaNoMenuInferior(){
    try{
      var iframe = obterIframeMenu();
      if(!iframe){
        return;
      }

      if(iframe !== menuIframeAtual){
        menuIframeAtual = iframe;

        iframe.addEventListener(
          'load',
          function(){
            menuDocumentoAtual = null;
            window.setTimeout(
              instalarGuardaNoMenuInferior,
              0
            );
          }
        );
      }

      var doc =
        iframe.contentDocument ||
        (iframe.contentWindow &&
          iframe.contentWindow.document);

      if(!doc || doc === menuDocumentoAtual){
        return;
      }

      menuDocumentoAtual = doc;

      ['pointerdown','mousedown','touchstart','click']
        .forEach(function(tipo){
          doc.addEventListener(
            tipo,
            function(event){
              marcarSeBotaoCadastro(
                event && event.target
              );
            },
            true
          );
        });
    }catch(error){}
  }

  /*
   * Ao escolher CLIENTE / FORNECEDOR / COLABORADOR, deixa de ser apenas
   * abertura de dropdown e passa a ser navegação real. A guarda precisa
   * cair ANTES dos handlers que trocam a página.
   */
  document.addEventListener(
    'pointerdown',
    function(event){
      var opcao =
        event && event.target && event.target.closest
          ? event.target.closest(
              '#scfCadastrarQuickDropdown .scf-cadastrar-quick-option'
            )
          : null;

      if(opcao){
        cancelarGuardaCadastro();
      }
    },
    true
  );

  document.addEventListener(
    'click',
    function(event){
      var opcao =
        event && event.target && event.target.closest
          ? event.target.closest(
              '#scfCadastrarQuickDropdown .scf-cadastrar-quick-option'
            )
          : null;

      if(opcao){
        cancelarGuardaCadastro();
      }
    },
    true
  );

  /*
   * Segunda garantia: a mensagem do próprio botão CADASTRO também arma a
   * guarda. Isso cobre teclado/ativação programática além do clique físico.
   */
  window.__scfPdvInfra.shellBridge.onMessage(
    function(event){
      var data =
        event &&
        event.data &&
        typeof event.data === 'object'
          ? event.data
          : null;

      if(!data){
        return;
      }

      if(
        data.type ===
          'SCF_CADASTRAR_DROPDOWN_TOGGLE'
      ){
        marcarAberturaCadastro();
        return;
      }

      if(
        data.type ===
          'SCF_LAYOUT_PRINCIPAL_PAGINA_SOLICITADA'
      ){
        var pagina =
          String(data.pagina || '')
            .trim()
            .toUpperCase();

        if(pagina === 'CADASTRAR'){
          marcarAberturaCadastro();
          return;
        }
      }

      if(
        data.type ===
          'SCF_CADASTRAR_OPCAO_SELECIONADA'
      ){
        cancelarGuardaCadastro();
      }
    },
    true
  );

  function reafirmarListaF5DuranteDropdown(){
    /*
     * NÃO renderiza e NÃO limpa a lista. Apenas preserva as classes que já
     * estavam ativas. Assim as linhas existentes permanecem exatamente no
     * DOM e nenhum cache precisa ser reconstruído.
     */
    [0, 25, 70, 160].forEach(function(atraso){
      window.setTimeout(function(){
        if(
          !listaF5Aberta() ||
          !aberturaCadastroEmCurso()
        ){
          return;
        }

        body.classList.add(
          'scf-pdv-pagina-selecionada',
          'fiscal-products-view-open',
          'scf-crediario-list-open'
        );

        body.classList.remove(
          'scf-crediario-detail-open',
          'scf-crediario-payment-edit-open',
          'scf-crediario-payment-methods-open'
        );
      }, atraso);
    });
  }

  function fecharF5ParaTrocaDePagina(){
    if(!listaF5Aberta()){
      return false;
    }

    if(
      typeof window.scfFecharListaCrediario ===
        'function'
    ){
      try{
        window.scfFecharListaCrediario();
      }catch(error){
        console.error(
          'SCF — falha ao encerrar a lista F5 ao trocar de página:',
          error
        );
      }
    }

    body.classList.remove(
      'scf-crediario-list-open',
      'scf-crediario-detail-open',
      'scf-crediario-open',
      'scf-crediario-payment-edit-open',
      'scf-crediario-payment-methods-open'
    );

    try{
      if(typeof window.renderAddedProducts === 'function'){
        window.renderAddedProducts();
      }
    }catch(error){}

    try{
      if(typeof window.setProductsView === 'function'){
        window.setProductsView(false);
      }else{
        body.classList.remove(
          'fiscal-products-view-open'
        );
      }
    }catch(error){
      body.classList.remove(
        'fiscal-products-view-open'
      );
    }

    try{
      if(typeof window.updateProductControls === 'function'){
        window.updateProductControls();
      }
    }catch(error){}

    try{
      if(typeof window.updateTotal === 'function'){
        window.updateTotal();
      }
    }catch(error){}

    try{
      if(typeof window.syncCentralSaleButtonState === 'function'){
        window.syncCentralSaleButtonState();
      }
    }catch(error){}

    return true;
  }

  function reafirmarPdvNormalAoVoltar(){
    if(restauracaoPendente){
      return;
    }

    restauracaoPendente = true;

    [0, 30, 100, 220].forEach(function(atraso, indice){
      window.setTimeout(function(){
        if(
          !body.classList.contains(
            'scf-pdv-pagina-selecionada'
          )
        ){
          if(indice === 3){
            restauracaoPendente = false;
          }
          return;
        }

        body.classList.remove(
          'scf-crediario-list-open',
          'scf-crediario-detail-open',
          'scf-crediario-open',
          'scf-crediario-payment-edit-open',
          'scf-crediario-payment-methods-open'
        );

        try{
          if(typeof window.setProductsView === 'function'){
            window.setProductsView(false);
          }else{
            body.classList.remove(
              'fiscal-products-view-open'
            );
          }
        }catch(error){
          body.classList.remove(
            'fiscal-products-view-open'
          );
        }

        try{
          if(typeof window.renderAddedProducts === 'function'){
            window.renderAddedProducts();
          }
        }catch(error){}

        try{
          if(typeof window.updateProductControls === 'function'){
            window.updateProductControls();
          }
        }catch(error){}

        try{
          if(typeof window.updateTotal === 'function'){
            window.updateTotal();
          }
        }catch(error){}

        if(indice === 3){
          restauracaoPendente = false;
        }
      }, atraso);
    });
  }

  new MutationObserver(function(){
    const pdvSelecionadoAgora =
      body.classList.contains(
        'scf-pdv-pagina-selecionada'
      );

    if(
      pdvEstavaSelecionado &&
      !pdvSelecionadoAgora
    ){
      /*
       * REGRA CORRIGIDA:
       * CADASTRO principal apenas abre o submenu. Enquanto esta guarda
       * estiver ativa, é proibido chamar scfFecharListaCrediario() ou
       * renderAddedProducts(), pois qualquer uma dessas rotinas remove as
       * linhas CLIENTE / WHATSAPP / SITUAÇÃO já renderizadas.
       */
      if(
        listaF5Aberta() &&
        aberturaCadastroEmCurso()
      ){
        saiuDoPdvComListaF5 = false;
        reafirmarListaF5DuranteDropdown();
      }else{
        saiuDoPdvComListaF5 =
          fecharF5ParaTrocaDePagina() === true;
      }
    }

    if(
      !pdvEstavaSelecionado &&
      pdvSelecionadoAgora &&
      saiuDoPdvComListaF5
    ){
      saiuDoPdvComListaF5 = false;
      reafirmarPdvNormalAoVoltar();
    }

    pdvEstavaSelecionado =
      pdvSelecionadoAgora;
  }).observe(
    body,
    {
      attributes:true,
      attributeFilter:['class']
    }
  );

  instalarGuardaNoMenuInferior();

  [0, 80, 250, 700, 1500].forEach(
    function(atraso){
      window.setTimeout(
        instalarGuardaNoMenuInferior,
        atraso
      );
    }
  );
})();
