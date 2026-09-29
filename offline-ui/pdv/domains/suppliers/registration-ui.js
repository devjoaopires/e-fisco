(function(){
  'use strict';

  const desktopMq =
    window.matchMedia(
      '(min-width:1001px)'
    );

  function obterPainelProdutos(){
    return document.getElementById(
      'fiscalProductsView'
    );
  }

  function garantirCadastroCliente(){
    const painel =
      obterPainelProdutos();

    if(!painel){
      return null;
    }

    let overlay =
      document.getElementById(
        'scfCustomerRegistrationOverlay'
      );

    if(overlay){
      if(
        overlay.parentElement !==
        painel
      ){
        painel.appendChild(
          overlay
        );
      }

      return overlay;
    }

    const historyClose =
      document.querySelector(
        '#scfSalesHistoryClose img'
      );

    const closeSrc =
      historyClose
        ? historyClose.getAttribute(
            'src'
          )
        : 'https://static.wixstatic.com/media/fd6425_4a7468b648384589833816ddb0d7336f~mv2.png';

    overlay =
      document.createElement(
        'div'
      );

    overlay.id =
      'scfCustomerRegistrationOverlay';

    overlay.className =
      'scf-customer-registration-overlay';

    overlay.setAttribute(
      'aria-hidden',
      'true'
    );

    overlay.innerHTML =
      ''
      + '<section class="scf-customer-registration-card" role="dialog" aria-modal="true" aria-labelledby="scfCustomerRegistrationTitle">'
      +   '<header class="scf-sales-history-header scf-customer-registration-header">'
      +     '<h2 class="scf-sales-history-title" id="scfCustomerRegistrationTitle">CADASTRO DE CLIENTE</h2>'
      +     '<div id="scfCustomerRegistrationHeaderTools">'
      +       '<div id="scfCustomerRegistrationHeaderPersonType" role="radiogroup" aria-label="Tipo de pessoa na busca de clientes">'
      +         '<label class="scf-customer-registration-person-option">'
      +           '<input id="scfCustomerRegistrationPersonFisica" type="radio" name="scfCustomerRegistrationPersonType" value="FISICA" checked>'
      +           '<span>PESSOA FÍSICA</span>'
      +         '</label>'
      +         '<label class="scf-customer-registration-person-option">'
      +           '<input id="scfCustomerRegistrationPersonJuridica" type="radio" name="scfCustomerRegistrationPersonType" value="JURIDICA">'
      +           '<span>PESSOA JURÍDICA</span>'
      +         '</label>'
      +       '</div>'
      +       '<div id="scfCustomerRegistrationSearchWrap">'
      +         '<span id="scfCustomerRegistrationSearchIcon" aria-hidden="true">⌕</span>'
      +         '<input id="scfCustomerRegistrationSearch" type="text" autocomplete="off" placeholder="BUSCAR CLIENTE" aria-label="Buscar cliente">'
      +       '</div>'
      +     '</div>'
      +     '<button class="scf-sales-history-close" id="scfCustomerRegistrationClose" type="button" aria-label="Fechar cadastro de cliente">'
      +       '<img alt="Fechar" src="' + closeSrc + '"/>'
      +     '</button>'
      +   '</header>'
      +   '<div class="scf-customer-registration-content" id="scfCustomerRegistrationContent">'
      +     '<div class="scf-customer-registration-table-header">'
      +       '<div id="scfCustomerRegistrationDocHeader">CPF</div>'
      +       '<div id="scfCustomerRegistrationNameHeader">NOME COMPLETO</div>'
      +       '<div>E-MAIL</div>'
      +       '<div>WHATSAPP</div>'
      +     '</div>'
      +     '<div class="scf-customer-registration-list" id="scfCustomerRegistrationList"></div>'
      +   '</div>'
      + '</section>';

    painel.appendChild(
      overlay
    );

    const closeButton =
      overlay.querySelector(
        '#scfCustomerRegistrationClose'
      );

    if(closeButton){
      closeButton.addEventListener(
        'click',
        fecharCadastroCliente
      );
    }

    return overlay;
  }

  function mostrarCardFiscalPrincipal(){
    const fiscalShell =
      document.querySelector(
        '.fiscal-form-shell'
      );

    const fiscalCard =
      document.querySelector(
        '.fiscal-form-card'
      );

    if(fiscalShell){
      fiscalShell.hidden =
        false;
    }

    if(fiscalCard){
      fiscalCard.hidden =
        false;
    }

    document.body.classList.remove(
      'fiscal-products-view-open'
    );
  }

  function ocultarHistoricoSemAlterarMenu(){
    const historyOverlay =
      document.getElementById(
        'scfSalesHistoryOverlay'
      );

    if(historyOverlay){
      historyOverlay.classList.remove(
        'show'
      );

      historyOverlay.setAttribute(
        'aria-hidden',
        'true'
      );
    }

    document.body.classList.remove(
      'scf-sales-history-open',
      'scf-history-year-dashboard-on-photo',
      'scf-history-calendar-on-photo'
    );

    const annualDashboard =
      document.getElementById(
        'scfHistoryAnnualDashboard'
      );

    if(annualDashboard){
      annualDashboard.hidden = true;
    }
  }

  function selecionarCadastrarNoMenu(){
    try{
      const iframe =
        document.getElementById(
          '__htmlStatusIframe'
        );

      if(
        iframe &&
        iframe.contentWindow
      ){
        iframe.contentWindow.postMessage({
          type:
            'SCF_MENU_SELECIONAR_CADASTRAR'
        }, '*');
      }
    }catch(error){}
  }

  function aplicarModoCadastro(tipoCadastro){
    const tipo =
      String(tipoCadastro || 'CLIENTE').toUpperCase();

    const fornecedor =
      tipo === 'FORNECEDOR';

    const titulo =
      document.getElementById(
        'scfCustomerRegistrationTitle'
      );

    if(titulo){
      titulo.textContent = fornecedor
        ? 'CADASTRO FORNECEDOR'
        : 'CADASTRO DE CLIENTE';
    }

    const overlay =
      document.getElementById(
        'scfCustomerRegistrationOverlay'
      );

    if(overlay){
      overlay.dataset.cadastroTipo = fornecedor
        ? 'FORNECEDOR'
        : 'CLIENTE';
    }

    const busca =
      document.getElementById(
        'scfCustomerRegistrationSearch'
      );

    if(busca){
      busca.placeholder = fornecedor
        ? 'BUSCAR FORNECEDOR'
        : 'BUSCAR CLIENTE';

      busca.setAttribute(
        'aria-label',
        fornecedor
          ? 'Buscar fornecedor'
          : 'Buscar cliente'
      );
    }

    document.body.classList.toggle(
      'scf-supplier-registration-open',
      fornecedor
    );
  }

  function abrirCadastroCliente(tipoCadastro){
    if(!desktopMq.matches){
      return;
    }

    /*
     * CLIENTE/FORNECEDOR e COLABORADOR reutilizam as mesmas áreas visuais.
     * Se COLABORADOR estiver aberto, fecha-o ANTES de montar o outro cadastro.
     * Isso evita que os dois overlays/títulos/tabelas fiquem sobrepostos.
     */
    try{
      window.__scfPdvInfra.eventBus.dispatch(
        new CustomEvent(
          'scf:fechar-cadastro-colaborador',
          {
            detail:{
              voltarPdv:false
            }
          }
        )
      );
    }catch(error){}

    mostrarCardFiscalPrincipal();
    ocultarHistoricoSemAlterarMenu();

    const overlay =
      garantirCadastroCliente();

    if(!overlay){
      return;
    }

    aplicarModoCadastro(
      tipoCadastro
    );

    /*
     * Há módulos antigos de edição/listagem que também reagem ao mesmo
     * evento scf:cadastrar-opcao. Na troca COLABORADOR -> FORNECEDOR/CLIENTE,
     * eles podem terminar o mesmo clique restaurando partes do modo anterior.
     * Reaplicamos somente o modo visual compartilhado depois desses handlers.
     */
    [0, 80, 220].forEach(function(atraso){
      window.setTimeout(
        function(){
          aplicarModoCadastro(
            tipoCadastro
          );
        },
        atraso
      );
    });

    overlay.classList.add(
      'show'
    );

    overlay.setAttribute(
      'aria-hidden',
      'false'
    );

    document.body.classList.add(
      'scf-customer-registration-open'
    );

    selecionarCadastrarNoMenu();
  }

  function fecharCadastroCliente(){
    const fechamentoDoPasso2 =
      document.body.classList.contains(
        'scf-nfe55-passo2-cadastro-open'
      ) ||
      document.body.classList.contains(
        'scf-nfe55-passo2-retornando-historico'
      ) ||
      document.body.classList.contains(
        'scf-nfe55-devolucao-cadastro-open'
      );

    const overlay =
      document.getElementById(
        'scfCustomerRegistrationOverlay'
      );

    if(overlay){
      overlay.classList.remove(
        'show'
      );

      overlay.setAttribute(
        'aria-hidden',
        'true'
      );
    }

    document.body.classList.remove(
      'scf-customer-registration-open',
      'scf-supplier-registration-open'
    );

    /*
     * No cadastro normal, fechar retorna ao PDV.
     * No PASSO 2, fechar/atualizar retorna ao Histórico,
     * portanto NÃO selecionamos o PDV aqui.
     */
    if(
      fechamentoDoPasso2
    ){
      return;
    }

    try{
      const iframe =
        document.getElementById(
          '__htmlStatusIframe'
        );

      if(
        iframe &&
        iframe.contentWindow
      ){
        iframe.contentWindow.postMessage({
          type:
            'SCF_MENU_SELECIONAR_CENTRAL'
        }, '*');
      }
    }catch(error){}
  }

  /*
   * O dropdown CADASTRAR já dispara este evento.
   * CLIENTE abre a nova página no mesmo card usado por VENDAS.
   */
  window.__scfPdvInfra.eventBus.on('scf:cadastrar-opcao',
    function(event){
      const opcao =
        String(
          event &&
          event.detail &&
          event.detail.opcao ||
          ''
        ).toUpperCase();

      if(
        opcao === 'CLIENTE' ||
        opcao === 'FORNECEDOR'
      ){
        abrirCadastroCliente(
          opcao
        );
      }
    }
  );

  document.addEventListener(
    'keydown',
    function(event){
      if(
        event.key ===
          'Escape' &&
        document.body.classList.contains(
          'scf-customer-registration-open'
        )
      ){
        fecharCadastroCliente();
      }
    }
  );

  window.__scfPdvInfra.shellBridge.onMessage(
    function(event){
      const data =
        event &&
        event.data &&
        typeof event.data ===
          'object'
          ? event.data
          : null;

      if(!data){
        return;
      }

      /*
       * Qualquer troca explícita de página do menu fecha o cadastro.
       * O próprio clique CLIENTE abre novamente logo em seguida.
       */
      if(
        data.type ===
          'SCF_FISCAL_HOME_ABRIR' ||
        data.type ===
          'SCF_HISTORICO_VENDAS_ABRIR' ||
        data.type ===
          'SCF_MENU_SELECIONAR_ESTOQUE'
      ){
        const overlay =
          document.getElementById(
            'scfCustomerRegistrationOverlay'
          );

        if(overlay){
          overlay.classList.remove(
            'show'
          );

          overlay.setAttribute(
            'aria-hidden',
            'true'
          );
        }

        document.body.classList.remove(
          'scf-customer-registration-open',
          'scf-supplier-registration-open'
        );
      }
    }
  );

  garantirCadastroCliente();
})();
