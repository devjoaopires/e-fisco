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

  /*
   * O CREDIÁRIO NÃO REUTILIZA MAIS o botão visual F11.
   *
   * O botão original #scfCashMovementShortcut continua existindo para
   * as demais rotinas do PDV/CAIXA, mas fica oculto visualmente enquanto
   * body.scf-crediario-open estiver ativo.
   *
   * Um botão exclusivo #scfCrediarioBackShortcut ocupa exatamente o mesmo
   * encaixe. Assim nenhuma rotina legada consegue alternar F11/F7 na tela.
   */

  function crediarioAberto(){
    return (
      document.body.classList.contains(
        'scf-crediario-open'
      ) ||
      document.body.classList.contains(
        'scf-crediario-list-open'
      ) ||
      document.body.classList.contains(
        'scf-crediario-payment-methods-open'
      ) ||
      crediarioDomain.paymentMethodsOpen ===
        true
    );
  }

  function nfceCrediarioProcessando(){
    return Boolean(
      (
        crediarioDomain.paymentMethodsOpen ===
          true ||
        document.body.classList.contains(
          'scf-crediario-payment-methods-open'
        )
      ) &&
      document.body.classList.contains(
        'sale-completed-card-open'
      ) &&
      document.body.classList.contains(
        'scf-nfce-processing'
      )
    );
  }

  function cupomCrediarioAberto(){
    return Boolean(
      (
        crediarioDomain.paymentMethodsOpen ===
          true ||
        document.body.classList.contains(
          'scf-crediario-payment-methods-open'
        )
      ) &&
      document.body.classList.contains(
        'fiscal-receipt-open'
      ) &&
      document.body.classList.contains(
        'scf-current-sale-receipt-open'
      )
    );
  }

  function fecharCupomCrediario(){
    if(!cupomCrediarioAberto()){
      return false;
    }

    /*
     * A NFC-e já foi emitida/autorizada.
     * Daqui em diante não existe mais "voltar para pagamento".
     * O fechamento segue exatamente a venda normal.
     */
    crediarioDomain.paymentMethodsOpen =
      false;

    crediarioDomain.paymentAwaitingF1 =
      false;

    document.body.classList.remove(
      'scf-crediario-payment-methods-open'
    );

    crediarioDomain.paymentPartialSelectionActive =
      false;

    if(
      typeof window.scfResetarEtapaPagamentoCrediario ===
        'function'
    ){
      try{
        window.scfResetarEtapaPagamentoCrediario();
      }catch(error){}
    }

    if(
      typeof window.scfCloseCurrentFiscalReceipt ===
        'function'
    ){
      try{
        window.scfCloseCurrentFiscalReceipt();
        return true;
      }catch(error){
        console.error(
          'Não foi possível fechar o DANFE do crediário:',
          error
        );
      }
    }

    return false;
  }

  function voltarCrediario(){
    if(!crediarioAberto()){
      return false;
    }

    /*
     * Depois da autorização da NFC-e, o botão deixa de ser VOLTAR.
     * Passa a ser FECHAR e encerra o DANFE como em uma venda normal.
     */
    if(cupomCrediarioAberto()){
      return fecharCupomCrediario();
    }

    /*
     * Durante a emissão, não é permitido retornar para a composição
     * do crediário. O rodapé fica apenas como status PROCESSANDO.
     */
    if(nfceCrediarioProcessando()){
      return true;
    }

    /*
     * LISTA CLIENTE | WHATSAPP | SITUAÇÃO:
     * F7 fecha somente o modo F5 e devolve o PDV normal.
     */
    if(
      document.body.classList.contains(
        'scf-crediario-list-open'
      )
    ){
      if(
        typeof window.scfFecharListaCrediario ===
          'function'
      ){
        try{
          window.scfFecharListaCrediario();
        }catch(error){
          console.error(
            'Não foi possível voltar da lista do CREDIÁRIO:',
            error
          );
          return false;
        }
      }else{
        document.body.classList.remove(
          'scf-crediario-list-open',
          'scf-crediario-detail-open',
          'scf-crediario-open',
          'fiscal-products-view-open'
        );
      }

      document.body.classList.remove(
        'fiscal-products-view-open'
      );

      const barcode =
        document.getElementById(
          'productBarcode'
        );

      if(barcode){
        window.setTimeout(
          function(){
            try{
              barcode.focus({
                preventScroll:true
              });
            }catch(error){
              try{ barcode.focus(); }catch(ignore){}
            }
          },
          0
        );
      }

      return true;
    }

    /*
     * FORMAS DE PAGAMENTO pertencem exclusivamente ao motor compartilhado.
     * Se esta flag ainda estiver ativa fora do card compartilhado por causa
     * de uma transição fiscal, o controlador exclusivo do F5 não executa
     * uma segunda rotina de VOLTAR. PROCESSANDO/FECHAR são tratados antes
     * deste ponto pelos estados fiscais próprios do crediário.
     */
    if(
      crediarioDomain.paymentMethodsOpen ===
        true
    ){
      return true;
    }

    /*
     * Se estamos visualizando um crediário já aberto (após PAGAR),
     * F7 volta para a lista CLIENTE | WHATSAPP | SITUAÇÃO.
     */
    if(
      document.body.classList.contains(
        'scf-crediario-detail-open'
      ) &&
      typeof window.scfVoltarParaListaCrediario ===
        'function'
    ){
      window.scfVoltarParaListaCrediario();
      return true;
    }

    /*
     * Se estamos criando um novo crediário a partir de produtos no PDV,
     * volta para a venda normal preservando os produtos adicionados.
     */
    if(
      typeof window.scfCancelarVendaCrediario ===
        'function'
    ){
      try{
        window.scfCancelarVendaCrediario();
        return true;
      }catch(error){
        console.error(
          'Não foi possível voltar do CREDIÁRIO:',
          error
        );
        return false;
      }
    }

    return false;
  }

  function sincronizarBotaoCrediario(){
    const button =
      document.getElementById(
        'scfCrediarioBackShortcut'
      );

    if(!button){
      return;
    }

    const receiptOpen =
      cupomCrediarioAberto();

    const processing =
      nfceCrediarioProcessando();

    button.classList.toggle(
      'scf-crediario-receipt-close-mode',
      receiptOpen
    );

    button.classList.toggle(
      'scf-crediario-nfce-processing-mode',
      processing && !receiptOpen
    );

    if(receiptOpen){
      if(
        button.textContent !==
          'FECHAR'
      ){
        button.textContent =
          'FECHAR';
      }

      button.setAttribute(
        'aria-label',
        'FECHAR | NFC-e do crediário'
      );

      button.disabled =
        false;

      return;
    }

    if(processing){
      if(
        button.textContent !==
          'PROCESSANDO'
      ){
        button.textContent =
          'PROCESSANDO';
      }

      button.setAttribute(
        'aria-label',
        'PROCESSANDO NFC-e'
      );

      button.disabled =
        false;

      return;
    }

    if(
      button.textContent !==
        'F7 | VOLTAR'
    ){
      button.textContent =
        'F7 | VOLTAR';
    }

    button.setAttribute(
      'aria-label',
      'F7 | Voltar do crediário'
    );

    button.disabled =
      false;
  }

  function garantirBotao(){
    const grupo =
      document.getElementById(
        'scfCashShortcutGroup'
      );

    if(!grupo){
      return null;
    }

    let button =
      document.getElementById(
        'scfCrediarioBackShortcut'
      );

    if(!button){
      button =
        document.createElement(
          'button'
        );

      button.type =
        'button';

      button.id =
        'scfCrediarioBackShortcut';

      button.textContent =
        'F7 | VOLTAR';

      button.setAttribute(
        'aria-label',
        'F7 | Voltar do crediário'
      );

      /*
       * O clique é tratado apenas neste botão dedicado.
       * Não dispara nenhuma rotina associada ao antigo F11.
       */
      button.addEventListener(
        'click',
        function(event){
          if(!crediarioAberto()){
            return;
          }

          event.preventDefault();
          event.stopPropagation();

          if(
            typeof event.stopImmediatePropagation ===
              'function'
          ){
            event.stopImmediatePropagation();
          }

          if(nfceCrediarioProcessando()){
            sincronizarBotaoCrediario();
            return;
          }

          if(cupomCrediarioAberto()){
            fecharCupomCrediario();
            return;
          }

          voltarCrediario();
        },
        true
      );

      grupo.appendChild(
        button
      );
    }

    sincronizarBotaoCrediario();

    return button;
  }

  /*
   * F7 físico:
   * intercepta no WINDOW antes dos listeners antigos do DOCUMENT.
   */
  window.addEventListener(
    'keydown',
    function(event){
      if(
        !crediarioAberto()
      ){
        return;
      }

      const key =
        String(
          event.key ||
          event.code ||
          ''
        ).toUpperCase();

      /*
       * F11 fica totalmente bloqueado enquanto o crediário está aberto.
       */
      if(key === 'F11'){
        event.preventDefault();
        event.stopPropagation();

        if(
          typeof event.stopImmediatePropagation ===
            'function'
        ){
          event.stopImmediatePropagation();
        }

        return;
      }

      if(key !== 'F7'){
        return;
      }

      /*
       * FORMAS DE PAGAMENTO DO F5:
       * enquanto o card FINALIZAR VENDA estiver realmente aberto, F7 deixa
       * de ter um handler exclusivo do crediário e passa pelo MESMO handler
       * do PDV NORMAL. Isso unifica etapa de valor -> opções -> voltar.
       * Depois que o card fecha (PROCESSANDO/FECHAR), o botão dedicado do
       * crediário volta a assumir normalmente o rodapé fiscal.
       */
      if(
        crediarioDomain.paymentMethodsOpen === true &&
        document.body.classList.contains('scf-crediario-payment-methods-open') &&
        document.body.classList.contains('finalize-support-card-open')
      ){
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if(
        typeof event.stopImmediatePropagation ===
          'function'
      ){
        event.stopImmediatePropagation();
      }

      if(nfceCrediarioProcessando()){
        sincronizarBotaoCrediario();
        return;
      }

      if(cupomCrediarioAberto()){
        fecharCupomCrediario();
        return;
      }

      voltarCrediario();
    },
    true
  );

  /*
   * Só observa a árvore para garantir que o botão dedicado exista
   * caso o grupo seja recriado. NÃO observa texto/classe do botão F11,
   * eliminando definitivamente o ciclo F11 <-> F7.
   */
  const observer =
    new MutationObserver(
      function(){
        garantirBotao();
        sincronizarBotaoCrediario();
      }
    );

  observer.observe(
    document.body,
    {
      childList:true,
      subtree:true,
      attributes:true,
      attributeFilter:[
        'class'
      ]
    }
  );

  /*
   * Quando FECHAR encerra o DANFE da venda atual, a rotina fiscal normal
   * dispara scf:limpar-venda-concluida. Limpamos também as marcas exclusivas
   * do CREDIÁRIO para que o próximo PDV não herde F7/PROCESSANDO.
   */
  window.__scfPdvInfra.eventBus.on('scf:limpar-venda-concluida',
    function(){
      crediarioDomain.paymentMethodsOpen =
        false;

      crediarioDomain.paymentAwaitingF1 =
        false;

      /*
       * No pagamento PARCIAL o updateTotal() usa o total dos itens
       * selecionados enquanto esta flag está ativa. A rotina fiscal normal
       * limpa os produtos primeiro; se a flag só for desligada depois,
       * o cabeçalho pode permanecer mostrando o valor liquidado (ex.: 9,00).
       */
      crediarioDomain.paymentPartialSelectionActive =
        false;

      if(
        typeof window.scfResetarEtapaPagamentoCrediario ===
          'function'
      ){
        try{
          window.scfResetarEtapaPagamentoCrediario();
        }catch(error){}
      }

      document.body.classList.remove(
        'scf-crediario-payment-methods-open',
        'scf-crediario-payment-choice-open',
        'scf-crediario-partial-select-open'
      );

      const zerarTotalVisual =
        function(){
          const totalProduto =
            document.getElementById(
              'productTotal'
            );

          const totalCabecalho =
            document.getElementById(
              'fiscalHeaderTotal'
            );

          if(totalProduto){
            totalProduto.textContent =
              'R$ 0,00';
          }

          if(totalCabecalho){
            totalCabecalho.textContent =
              'R$ 0,00';
          }
        };

      /*
       * A limpeza fiscal e o fechamento do DANFE possuem rotinas no mesmo
       * ciclo do ENTER. Reforçamos o zero após elas terminarem para não
       * deixar o valor da parcela anterior preso no cabeçalho.
       */
      zerarTotalVisual();

      window.setTimeout(
        zerarTotalVisual,
        0
      );

      window.setTimeout(
        zerarTotalVisual,
        80
      );

      window.setTimeout(
        zerarTotalVisual,
        180
      );

      window.setTimeout(
        sincronizarBotaoCrediario,
        0
      );
    }
  );

  if(
    document.readyState ===
      'loading'
  ){
    document.addEventListener(
      'DOMContentLoaded',
      garantirBotao,
      { once:true }
    );
  }else{
    garantirBotao();
  }
})();
