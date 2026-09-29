(function(){
  'use strict';

  const overlay =
    document.getElementById(
      'scfSalesHistoryOverlay'
    );

  const backButton =
    document.getElementById(
      'scfSalesHistoryBack'
    );

  const historyList =
    document.getElementById(
      'scfSalesHistoryList'
    );

  if(
    !overlay ||
    !backButton ||
    !historyList
  ){
    return;
  }

  function historicoAberto(){
    return (
      overlay.classList.contains('show') &&
      overlay.getAttribute('aria-hidden') === 'false' &&
      document.body.classList.contains('scf-sales-history-open')
    );
  }

  function estaDentroDeMes(){
    if(!historicoAberto()){
      return false;
    }

    /*
     * Na visão das pastas existe .scf-sales-history-month-grid.
     * Dentro de um mês ela desaparece e a seta VOLTAR fica disponível.
     * Usamos os dois sinais para não depender de variáveis privadas
     * do script principal do Histórico.
     */
    return (
      backButton.hidden === false ||
      !historyList.querySelector(
        '.scf-sales-history-month-grid'
      )
    );
  }

  function voltarParaPastasAntesDeSair(){
    if(!estaDentroDeMes()){
      return;
    }

    /*
     * O clique usa o fluxo oficial já existente do Histórico:
     * selectedMonth = null + render(). Dessa forma título, filtros,
     * dashboard e cache permanecem sincronizados sem duplicar lógica.
     */
    backButton.click();
  }

  function alvoEhSaidaDoHistorico(target){
    if(!target || !target.closest){
      return false;
    }

    const botao = target.closest(
      '#bloqueioBtn, #statusButton, #cadastrarBtn, #admin'
    );

    if(!botao){
      return false;
    }

    /*
     * O botão central é reutilizado pelo Histórico como REENVIAR.
     * Nesse estado ele NÃO representa navegação para o PDV e, portanto,
     * não pode resetar o mês antes do listener de reenvio executar.
     */
    if(
      botao.id === 'statusButton' &&
      (
        botao.classList.contains('whatsapp-resend-mode') ||
        botao.classList.contains('whatsapp-resend-loading') ||
        botao.classList.contains('nfe55-resend-mode') ||
        botao.classList.contains('nfe55-resend-loading')
      )
    ){
      return false;
    }

    return true;
  }

  let menuDocument = null;

  function instalarNoMenuInferior(){
    try{
      const iframe =
        document.getElementById(
          '__htmlStatusIframe'
        );

      if(!iframe){
        return;
      }

      const doc =
        iframe.contentDocument ||
        (
          iframe.contentWindow &&
          iframe.contentWindow.document
        );

      if(
        !doc ||
        doc === menuDocument
      ){
        return;
      }

      menuDocument = doc;

      /*
       * Capture=true faz o reset acontecer ANTES dos handlers do menu
       * efetivamente trocarem para ESTOQUE/PDV/CADASTRO/FINANCEIRO.
       */
      doc.addEventListener(
        'click',
        function(event){
          if(
            alvoEhSaidaDoHistorico(
              event.target
            )
          ){
            voltarParaPastasAntesDeSair();
          }
        },
        true
      );

      iframe.addEventListener(
        'load',
        function(){
          menuDocument = null;
          window.setTimeout(
            instalarNoMenuInferior,
            0
          );
        },
        { once:true }
      );
    }catch(error){}
  }

  /*
   * Segunda garantia para navegações disparadas por mensagem ou por
   * rotinas internas, sem depender somente do clique físico no menu.
   */
  window.__scfPdvInfra.shellBridge.onMessage(
    function(event){
      const data =
        event &&
        event.data &&
        typeof event.data === 'object'
          ? event.data
          : null;

      if(!data){
        return;
      }

      if(
        data.type === 'SCF_FISCAL_HOME_ABRIR' ||
        data.type === 'SCF_MENU_SELECIONAR_CENTRAL' ||
        data.type === 'SCF_MENU_SELECIONAR_ESTOQUE'
      ){
        voltarParaPastasAntesDeSair();
        return;
      }

      if(
        data.type === 'SCF_LAYOUT_PRINCIPAL_PAGINA_SOLICITADA'
      ){
        const pagina =
          String(
            data.pagina || ''
          )
            .trim()
            .toUpperCase();

        if(
          pagina === 'ESTOQUE' ||
          pagina === 'CADASTRAR' ||
          pagina === 'CADASTRO' ||
          pagina === 'FINANCEIRO' ||
          pagina === 'ADMIN'
        ){
          voltarParaPastasAntesDeSair();
        }
      }
    },
    true
  );

  [0, 80, 250, 700, 1600].forEach(
    function(delay){
      window.setTimeout(
        instalarNoMenuInferior,
        delay
      );
    }
  );
})();
