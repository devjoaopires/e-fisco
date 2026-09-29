(function(){
  'use strict';

  const cashDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.cash;

  if(!cashDomain){
    throw new Error(
      'PDV cash domain indisponivel.'
    );
  }

  const body = document.body;
  if(!body) return;

  let fechamentoAgendado = false;

  function outraPaginaAberta(){
    return (
      !body.classList.contains(
        'scf-pdv-pagina-selecionada'
      ) ||

      body.classList.contains(
        'scf-sales-history-open'
      ) ||

      body.classList.contains(
        'scf-stock-page-open'
      ) ||

      body.classList.contains(
        'scf-customer-registration-open'
      ) ||

      body.classList.contains(
        'scf-collaborator-registration-open'
      ) ||

      body.classList.contains(
        'scf-financeiro-registration-open'
      ) ||

      body.classList.contains(
        'scf-accounting-export-open'
      )
    );
  }

  function comprovanteCaixaAberto(){
    const overlay =
      document.getElementById(
        'scfCashReceiptOverlay'
      );

    return !!(
      overlay &&
      (
        overlay.classList.contains(
          'show'
        ) ||
        body.classList.contains(
          'scf-cash-receipt-open'
        )
      )
    );
  }

  function fecharComprovanteCaixa(){
    fechamentoAgendado = false;

    if(
      !outraPaginaAberta() ||
      !comprovanteCaixaAberto()
    ){
      return;
    }

    /*
     * Usa o próprio botão FECHAR do comprovante.
     * Dessa forma reaproveita fecharRecibo(), que também:
     * - cancela impressão automática pendente;
     * - limpa timers;
     * - remove a classe scf-cash-receipt-open;
     * - restaura o botão FECHAR CAIXA;
     * - devolve o overlay à posição original.
     */
    const done =
      document.getElementById(
        'scfCashReceiptDone'
      );

    if(done){
      done.click();
      return;
    }

    /*
     * Fallback defensivo caso o botão ainda não esteja disponível.
     */
    const close =
      document.getElementById(
        'scfCashReceiptClose'
      );

    if(close){
      close.click();
      return;
    }

    const overlay =
      document.getElementById(
        'scfCashReceiptOverlay'
      );

    if(overlay){
      overlay.classList.remove(
        'show',
        'scf-cash-receipt-embedded'
      );

      overlay.setAttribute(
        'aria-hidden',
        'true'
      );
    }

    body.classList.remove(
      'scf-cash-receipt-open'
    );
  }

  function solicitarFechamento(){
    if(
      fechamentoAgendado ||
      !outraPaginaAberta() ||
      !comprovanteCaixaAberto()
    ){
      return;
    }

    fechamentoAgendado = true;

    /*
     * microtask: fecha antes do próximo frame pintado.
     */
    Promise.resolve().then(
      fecharComprovanteCaixa
    );
  }

  /*
   * A troca de página principal altera classes do body.
   */
  const observer =
    new MutationObserver(
      solicitarFechamento
    );

  observer.observe(
    body,
    {
      attributes:true,
      attributeFilter:[
        'class'
      ]
    }
  );

  /*
   * Captura também o clique nos menus principais.
   * Isso antecipa o fechamento antes mesmo da classe da página mudar.
   */
  document.addEventListener(
    'pointerdown',
    function(event){
      if(
        !comprovanteCaixaAberto()
      ){
        return;
      }

      const alvo =
        event.target &&
        event.target.closest
          ? event.target.closest(
              [
                '#salesHistoryBtn',
                '#scfSalesHistoryButton',
                '#estoqueBtn',
                '#scfStockButton',
                '#cadastrarBtn',
                '#scfCustomerRegistrationButton',
                '#scfFinanceButton',
                '#financeiroBtn',
                '[data-scf-page="vendas"]',
                '[data-scf-page="estoque"]',
                '[data-scf-page="cadastro"]',
                '[data-scf-page="financeiro"]'
              ].join(',')
            )
          : null;

      if(!alvo){
        return;
      }

      /*
       * Aqui fechamos diretamente, pois o clique já demonstra a intenção
       * de abandonar o PDV.
       */
      const done =
        document.getElementById(
          'scfCashReceiptDone'
        );

      if(done){
        done.click();
      }else{
        solicitarFechamento();
      }
    },
    true
  );

  solicitarFechamento();
})();
