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
      'detail-pdv-close'
    )
  ){
    return;
  }

  var encerrando = false;

  function detalheCrediarioVisivel(){
    var body = document.body;
    if(!body){
      return false;
    }

    if(
      body.classList.contains(
        'scf-crediario-detail-open'
      )
    ){
      return true;
    }

    /*
     * Fallback visual para alguma janela de corrida em que a classe do body
     * já tenha sido mexida, mas a tabela de produtos do crediário ainda
     * continue efetivamente renderizada.
     */
    var view =
      document.getElementById(
        'fiscalProductsView'
      );

    var list =
      document.getElementById(
        'fiscalProductsList'
      );

    return Boolean(
      view &&
      view.hidden !== true &&
      list &&
      list.querySelector(
        '.scf-crediario-product-row'
      )
    );
  }

  function normalizarPdvDepoisDoCrediario(){
    var body = document.body;
    if(!body){
      return;
    }

    body.classList.remove(
      'scf-crediario-list-open',
      'scf-crediario-detail-open',
      'scf-crediario-open',
      'scf-crediario-payment-edit-open',
      'scf-crediario-payment-methods-open'
    );

    crediarioDomain.paymentMethodsOpen = false;
    crediarioDomain.paymentAwaitingF1 = false;
    crediarioDomain.sideMenuLocked = false;

    var panel =
      document.getElementById(
        'scfPdvCrediarioPanel'
      );

    if(panel){
      panel.hidden = true;
      panel.setAttribute(
        'aria-hidden',
        'true'
      );
      panel.removeAttribute('inert');
      panel.removeAttribute('aria-disabled');
      panel.classList.remove(
        'scf-f5-list-form-inactive'
      );
    }

    try{
      if(
        typeof window.setProductsView ===
          'function'
      ){
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
      if(
        typeof window.renderAddedProducts ===
          'function'
      ){
        window.renderAddedProducts();
      }
    }catch(error){}

    try{
      if(
        typeof window.updateProductControls ===
          'function'
      ){
        window.updateProductControls();
      }
    }catch(error){}

    try{
      if(
        typeof window.updateTotal ===
          'function'
      ){
        window.updateTotal();
      }
    }catch(error){}

    try{
      if(
        typeof window.syncCentralSaleButtonState ===
          'function'
      ){
        window.syncCentralSaleButtonState();
      }
    }catch(error){}

    var barcode =
      document.getElementById(
        'productBarcode'
      );

    if(
      barcode &&
      !barcode.disabled
    ){
      try{
        barcode.focus({
          preventScroll:true
        });
      }catch(error){
        try{
          barcode.focus();
        }catch(ignore){}
      }
    }
  }

  function fecharDetalheCrediarioParaPdvNormal(){
    if(encerrando){
      return;
    }

    encerrando = true;

    /*
     * A rotina oficial limpa requestDetalhe/requestAtualizacaoItens,
     * estado de edição e o conteúdo local carregado pelo PAGAR.
     */
    if(
      typeof window.scfFecharListaCrediario ===
        'function'
    ){
      try{
        window.scfFecharListaCrediario();
      }catch(error){
        console.error(
          'SCF — falha ao fechar o detalhe do crediário pelo botão PDV:',
          error
        );
      }
    }else if(
      typeof window.scfLimparEdicaoCrediarioPdv ===
        'function'
    ){
      try{
        window.scfLimparEdicaoCrediarioPdv();
      }catch(error){}
    }

    /*
     * Reafirma o estado normal depois dos handlers legados do mesmo clique.
     * Isso impede que uma rotina assíncrona do F5 recoloque a tabela/painel.
     */
    [0, 35, 100, 220].forEach(
      function(atraso, indice){
        window.setTimeout(
          function(){
            normalizarPdvDepoisDoCrediario();

            if(indice === 3){
              encerrando = false;
            }
          },
          atraso
        );
      }
    );
  }

  window.__scfPdvInfra.shellBridge.onMessage(
    function(event){
      var data =
        event &&
        event.data &&
        typeof event.data === 'object'
          ? event.data
          : null;

      if(
        !data ||
        data.type !==
          'SCF_FISCAL_HOME_ABRIR'
      ){
        return;
      }

      /*
       * O botão central PDV também é uma saída explícita quando a tela
       * atualmente exibida é a LISTA do F5. Antes esta proteção existia
       * somente para scf-crediario-detail-open (produtos após PAGAR), por
       * isso clicar PDV enquanto CLIENTE | WHATSAPP | SITUAÇÃO estava
       * visível não encerrava o modo crediário.
       */
      var listaF5Visivel =
        Boolean(
          document.body &&
          document.body.classList.contains(
            'scf-crediario-list-open'
          )
        );

      if(
        !listaF5Visivel &&
        !detalheCrediarioVisivel()
      ){
        return;
      }

      fecharDetalheCrediarioParaPdvNormal();
    }
  );
})();
