(function(){
  'use strict';

  const IDS_LATERAIS = [
    'localizacaoBtn',
    'bloqueioBtn',
    'cadastrarBtn',
    'admin'
  ];

  let menuIframeVinculado = null;
  let menuDocumentoVinculado = null;
  let menuObserver = null;
  let agendamentoPendente = false;
  let geracaoFocoCodigoBarras = 0;

  /*
   * PDV — o foco operacional fica preso somente entre
   * CÓDIGO DE BARRAS e QTD. Se o operador clicar fora,
   * o foco retorna ao último desses dois campos usado.
   */
  let ultimoCampoOperacionalPdv =
    'productBarcode';

  let geracaoRestauracaoFocoPdv =
    0;

  /*
   * F11 -> MOVIMENTAÇÃO -> F7 -> VOLTAR:
   * ao retornar ao PDV o foco é restaurado automaticamente no
   * CÓDIGO DE BARRAS, sem exigir ENTER do operador.
   */

  let caixaPdvEstavaAberto =
    false;

  function pdvPodeFocarCodigoBarras(){
    const body = document.body;
    if(!body) return false;

    if(
      typeof window.matchMedia === 'function' &&
      !window.matchMedia('(min-width:1001px)').matches
    ){
      return false;
    }

    if(!body.classList.contains('scf-pdv-pagina-selecionada')){
      return false;
    }

    const classesBloqueadas = [
      'scf-sales-history-open',
      'scf-stock-page-open',
      'scf-customer-registration-open',
      'scf-collaborator-registration-open',
      'scf-financeiro-registration-open',
      'scf-financeiro-saldo-open',
      'scf-accounting-export-open',
      'scf-history-receipt-desktop',
      'scf-history-calendar-on-photo',
      'scf-nfe55-photo-heading-open',
      'scf-nfe55-history-danfe',
      'fiscal-products-view-open',
      'cpf-fiscal-card-open',
      'sale-validation-waiting-open',
      'sale-completed-card-open',
      'finalize-support-card-open',
      'scf-pdv-product-consult-open',
      'scf-crediario-open'
    ];

    if(classesBloqueadas.some(function(nome){
      return body.classList.contains(nome);
    })){
      return false;
    }

    const barcode = document.getElementById('productBarcode');
    const wrap = document.getElementById('scfPdvProductSearchWrap');

    if(
      !barcode ||
      barcode.disabled ||
      barcode.readOnly ||
      (wrap && wrap.hasAttribute('inert'))
    ){
      return false;
    }

    return true;
  }

  function focarCodigoBarrasPdv(){
    if(!pdvPodeFocarCodigoBarras()) return false;

    const barcode = document.getElementById('productBarcode');
    if(!barcode) return false;

    /*
     * Depois do fechamento/impressao do DANFE, a janela hospedeira pode
     * ainda estar retomando o foco. Trazemos a janela de volta antes de
     * ativar o campo operacional do PDV.
     */
    try{
      window.focus();
    }catch(error){}

    try{
      barcode.focus({ preventScroll:true });
    }catch(error){
      try{ barcode.focus(); }catch(erroFoco){ return false; }
    }

    if(document.activeElement !== barcode){
      return false;
    }

    try{ barcode.select(); }catch(error){}

    ultimoCampoOperacionalPdv =
      'productBarcode';

    return true;
  }

  function obterCampoOperacionalPdv(){
    const quantidade =
      document.getElementById(
        'productQuantity'
      );

    const barcode =
      document.getElementById(
        'productBarcode'
      );

    if(
      ultimoCampoOperacionalPdv ===
        'productQuantity' &&
      quantidade &&
      !quantidade.disabled &&
      !quantidade.readOnly
    ){
      return quantidade;
    }

    return barcode;
  }

  function restaurarFocoOperacionalPdv(){
    if(!pdvPodeFocarCodigoBarras()){
      return false;
    }

    const campo =
      obterCampoOperacionalPdv();

    if(
      !campo ||
      campo.disabled ||
      campo.readOnly
    ){
      return false;
    }

    try{
      campo.focus({
        preventScroll:true
      });
    }catch(error){
      try{
        campo.focus();
      }catch(erroFoco){
        return false;
      }
    }

    try{
      campo.select();
    }catch(error){}

    return (
      document.activeElement ===
      campo
    );
  }

  function agendarRestauracaoFocoOperacionalPdv(){
    const geracao =
      ++geracaoRestauracaoFocoPdv;

    [0, 20, 60, 120, 240].forEach(
      function(delay){
        window.setTimeout(
          function(){
            if(
              geracao !==
                geracaoRestauracaoFocoPdv
            ){
              return;
            }

            if(
              restaurarFocoOperacionalPdv()
            ){
              geracaoRestauracaoFocoPdv +=
                1;
            }
          },
          delay
        );
      }
    );
  }

  function instalarTravaFocoOperacionalPdv(){
    caixaPdvEstavaAberto =
      document.body.classList.contains(
        'scf-caixa-open'
      );

    /*
     * Detecta quando a tela de MOVIMENTAÇÃO/CAIXA é fechada
     * e o usuário retorna ao PDV.
     */
    new MutationObserver(
      function(){
        const caixaAbertoAgora =
          document.body.classList.contains(
            'scf-caixa-open'
          );

        if(
          caixaPdvEstavaAberto &&
          !caixaAbertoAgora &&
          document.body.classList.contains(
            'scf-pdv-pagina-selecionada'
          )
        ){
          /*
           * O fechamento do F11 remove o "inert" dos campos em outro
           * MutationObserver/requestAnimationFrame. Por isso agendamos
           * algumas tentativas curtas até o CÓDIGO DE BARRAS estar
           * novamente disponível, sem depender de ENTER.
           */
          ultimoCampoOperacionalPdv =
            'productBarcode';

          geracaoRestauracaoFocoPdv +=
            1;

          agendarRestauracaoFocoOperacionalPdv();
        }

        caixaPdvEstavaAberto =
          caixaAbertoAgora;
      }
    ).observe(
      document.body,
      {
        attributes:true,
        attributeFilter:[
          'class'
        ]
      }
    );

    /*
     * Não existe mais etapa intermediária de ENTER após fechar o F11:
     * a restauração do foco é automática.
     */

    document.addEventListener(
      'focusin',
      function(event){
        const alvo =
          event &&
          event.target
            ? event.target
            : null;

        if(
          alvo &&
          (
            alvo.id ===
              'productBarcode' ||
            alvo.id ===
              'productQuantity'
          )
        ){
          ultimoCampoOperacionalPdv =
            alvo.id;

          geracaoRestauracaoFocoPdv +=
            1;
        }
      },
      true
    );

    /*
     * Não bloqueia o clique: botões e ações continuam funcionando.
     * Depois do clique, se a tela continuar sendo o PDV normal,
     * o foco retorna imediatamente ao último campo operacional.
     */
    document.addEventListener(
      'click',
      function(event){
        if(!pdvPodeFocarCodigoBarras()){
          return;
        }

        const alvo =
          event &&
          event.target
            ? event.target
            : null;

        if(
          alvo &&
          (
            alvo.id ===
              'productBarcode' ||
            alvo.id ===
              'productQuantity' ||
            (
              typeof alvo.closest ===
                'function' &&
              alvo.closest(
                '#productBarcode,#productQuantity'
              )
            )
          )
        ){
          return;
        }

        agendarRestauracaoFocoOperacionalPdv();
      },
      true
    );
  }

  function agendarFocoCodigoBarrasPdv(){
    const geracao = ++geracaoFocoCodigoBarras;

    /*
     * Nao interrompe mais as tentativas depois do primeiro focus() bem
     * sucedido. Ao fechar o cupom, outros MutationObservers ainda podem
     * mover QTD/CODIGO entre o formulario e o cabecalho; esse reparent
     * pode derrubar um foco que havia sido obtido alguns milissegundos antes.
     * Reaplicamos o foco durante toda a estabilizacao visual do PDV.
     */
    [0, 40, 100, 180, 320, 520, 800, 1200].forEach(function(delay){
      window.setTimeout(function(){
        if(geracao !== geracaoFocoCodigoBarras){
          return;
        }

        focarCodigoBarrasPdv();
      }, delay);
    });
  }

  /*
   * CUPOM FECHADO -> NOVA VENDA:
   * garante que o leitor/teclado volte pronto no CÓDIGO DE BARRAS.
   * O evento é disparado depois da limpeza da venda concluída; as
   * tentativas escalonadas absorvem qualquer atualização visual assíncrona.
   */
  window.__scfPdvInfra.eventBus.on('scf:nova-venda-pronta',
    function(){
      ultimoCampoOperacionalPdv =
        'productBarcode';

      geracaoRestauracaoFocoPdv +=
        1;

      agendarFocoCodigoBarrasPdv();
    }
  );

  function obterIframeMenu(){
    return document.getElementById('__htmlStatusIframe');
  }

  function obterDocumentoMenu(){
    try{
      const iframe = obterIframeMenu();
      return iframe && (
        iframe.contentDocument ||
        (iframe.contentWindow && iframe.contentWindow.document)
      );
    }catch(error){
      return null;
    }
  }

  function lateralEstaSelecionado(botao){
    if(!botao) return false;

    /*
     * Durante estados bloqueados de venda/comprovante, os laterais podem
     * receber aparência especial sem significar mudança de página.
     */
    if(
      botao.classList.contains('sale-menu-locked') ||
      botao.classList.contains('receipt-menu-locked')
    ){
      return false;
    }

    return !botao.classList.contains('is-off');
  }

  function sincronizarPaginaSelecionada(){
    agendamentoPendente = false;

    const documentoMenu = obterDocumentoMenu();
    if(!documentoMenu){
      return;
    }

    const central = documentoMenu.getElementById('statusButton');
    if(!central){
      return;
    }

    const lateralAtivo = IDS_LATERAIS.some(function(id){
      return lateralEstaSelecionado(
        documentoMenu.getElementById(id)
      );
    });

    const centralAtivo =
      !central.classList.contains('scf-pdv-menu-inactive') &&
      (
        central.getAttribute('aria-pressed') === 'true' ||
        central.classList.contains('menu-home-active')
      );

    const paginaPdvEstavaSelecionada =
      document.body.classList.contains(
        'scf-pdv-pagina-selecionada'
      );

    const paginaPdvDeveFicarSelecionada =
      centralAtivo && !lateralAtivo;

    document.body.classList.toggle(
      'scf-pdv-pagina-selecionada',
      paginaPdvDeveFicarSelecionada
    );

    if(
      paginaPdvDeveFicarSelecionada &&
      !paginaPdvEstavaSelecionada
    ){
      agendarFocoCodigoBarrasPdv();
    }
  }

  function agendarSincronizacao(){
    if(agendamentoPendente) return;
    agendamentoPendente = true;

    window.requestAnimationFrame(function(){
      sincronizarPaginaSelecionada();
    });
  }

  function desvincularDocumentoMenu(){
    if(menuObserver){
      menuObserver.disconnect();
      menuObserver = null;
    }

    menuDocumentoVinculado = null;
  }

  function vincularDocumentoMenu(){
    const documentoMenu = obterDocumentoMenu();

    if(
      !documentoMenu ||
      documentoMenu === menuDocumentoVinculado
    ){
      agendarSincronizacao();
      return;
    }

    desvincularDocumentoMenu();
    menuDocumentoVinculado = documentoMenu;

    documentoMenu.addEventListener(
      'click',
      function(event){
        const alvo = event && event.target && event.target.closest
          ? event.target.closest('#localizacaoBtn,#bloqueioBtn,#cadastrarBtn,#admin,#statusButton')
          : null;

        if(!alvo) return;

        window.setTimeout(agendarSincronizacao, 0);
        window.setTimeout(agendarSincronizacao, 40);

        if(alvo.id === 'statusButton'){
          /*
           * Se houver um comprovante interno de caixa aberto
           * (SANGRIA, SUPRIMENTO ou TERMO DE FECHAMENTO),
           * clicar em PDV deve executar exatamente o mesmo fluxo
           * do atalho F7 | VOLTAR.
           *
           * Disparamos o próprio F7 para reutilizar integralmente
           * a rotina canônica já existente do caixa, inclusive o
           * tratamento especial do TERMO DE FECHAMENTO.
           */
          if(
            document.body.classList.contains(
              'scf-cash-receipt-open'
            )
          ){
            window.__scfPdvInfra.eventBus.dispatch(
              new KeyboardEvent(
                'keydown',
                {
                  key:'F7',
                  code:'F7',
                  bubbles:true,
                  cancelable:true
                }
              )
            );
          }

          window.setTimeout(agendarFocoCodigoBarrasPdv, 0);
          window.setTimeout(agendarFocoCodigoBarrasPdv, 80);
        }
      },
      true
    );

    const alvoObserver =
      documentoMenu.getElementById('dockActions') ||
      documentoMenu.body ||
      documentoMenu.documentElement;

    if(alvoObserver){
      menuObserver = new MutationObserver(function(mutations){
        for(const mutation of mutations){
          if(
            mutation.type === 'attributes' &&
            (
              mutation.attributeName === 'class' ||
              mutation.attributeName === 'aria-pressed'
            )
          ){
            agendarSincronizacao();
            break;
          }
        }
      });

      menuObserver.observe(alvoObserver, {
        subtree:true,
        attributes:true,
        attributeFilter:['class','aria-pressed']
      });
    }

    agendarSincronizacao();
  }

  function vincularIframeMenu(){
    const iframe = obterIframeMenu();

    if(!iframe){
      return false;
    }

    if(iframe !== menuIframeVinculado){
      menuIframeVinculado = iframe;

      iframe.addEventListener('load', function(){
        desvincularDocumentoMenu();
        vincularDocumentoMenu();

        window.setTimeout(vincularDocumentoMenu, 40);
        window.setTimeout(vincularDocumentoMenu, 160);
      });
    }

    vincularDocumentoMenu();
    return true;
  }

  function iniciar(){
    instalarTravaFocoOperacionalPdv();

    /*
     * A página inicial é o PDV. A classe é confirmada assim que o menu
     * inferior estiver disponível e passa a seguir a seleção real dele.
     */
    document.body.classList.add('scf-pdv-pagina-selecionada');

    vincularIframeMenu();

    [0, 60, 180, 500, 1200].forEach(function(delay){
      window.setTimeout(function(){
        vincularIframeMenu();
        agendarSincronizacao();
      }, delay);
    });
  }

  window.__scfPdvInfra.shellBridge.onMessage( function(event){
    const data = event && event.data && typeof event.data === 'object'
      ? event.data
      : null;

    if(!data) return;

    if(
      data.type === 'SCF_FISCAL_HOME_ABRIR' ||
      data.type === 'SCF_HISTORICO_VENDAS_ABRIR' ||
      data.type === 'SCF_MENU_SELECIONAR_PRIMEIRO' ||
      data.type === 'SCF_MENU_SELECIONAR_CENTRAL' ||
      data.type === 'SCF_MENU_SELECIONAR_ESTOQUE' ||
      data.type === 'SCF_MENU_SELECIONAR_CADASTRAR' ||
      data.type === 'SCF_LAYOUT_PRINCIPAL_PAGINA_SOLICITADA'
    ){
      window.setTimeout(agendarSincronizacao, 0);
      window.setTimeout(agendarSincronizacao, 50);
    }
  });

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', iniciar, { once:true });
  }else{
    iniciar();
  }
})();
