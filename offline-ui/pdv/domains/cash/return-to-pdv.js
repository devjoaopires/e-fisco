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

  if(
    cashDomain.returnCoordinatorReady ===
      true
  ){
    return;
  }
  cashDomain.returnCoordinatorReady =
    true;

  var CLOSE_IDS = {
    scfSalesHistoryClose: 'VENDAS',
    scfStockClose: 'ESTOQUE',
    scfCustomerRegistrationClose: 'CADASTRO',
    scfCollaboratorRegistrationClose: 'CADASTRO'
  };

  function cadastroEstaEmFluxoInterno(){
    var body = document.body;
    if(!body) return false;

    return (
      body.classList.contains('scf-nfe55-passo2-cadastro-open') ||
      body.classList.contains('scf-nfe55-passo2-retornando-historico') ||
      body.classList.contains('scf-nfe55-devolucao-cadastro-open')
    );
  }

  function outroModuloEstaAberto(){
    var body = document.body;
    if(!body) return false;

    return (
      body.classList.contains('scf-sales-history-open') ||
      body.classList.contains('scf-stock-page-open') ||
      body.classList.contains('scf-customer-registration-open') ||
      body.classList.contains('scf-collaborator-registration-open') ||
      body.classList.contains('scf-financeiro-registration-open')
    );
  }

  function dispararReafirmacao(origem, exigirPdv){
    var body = document.body;
    if(!body) return;

    /*
     * Nos reforços tardios só atuamos se o retorno realmente permaneceu
     * no PDV. Assim, uma navegação rápida para outro módulo não é afetada.
     */
    if(exigirPdv === true){
      if(
        outroModuloEstaAberto() ||
        !body.classList.contains('scf-pdv-pagina-selecionada')
      ){
        return;
      }
    }

    try{
      window.__scfPdvInfra.eventBus.dispatch(
        new CustomEvent(
          'scf:financeiro-retorno-pdv',
          {
            detail:{
              origem: origem,
              retornoPor: 'X'
            }
          }
        )
      );
    }catch(error){}
  }

  function agendarReafirmacao(origem){
    /*
     * PRIMEIRO PASSO É SÍNCRONO E ACONTECE NO CAPTURE DO CLIQUE.
     * Assim ABRIR CAIXA já está montado antes do handler normal do X
     * remover VENDAS / ESTOQUE / CADASTRO e revelar novamente o PDV.
     */
    dispararReafirmacao(origem, false);

    /* Reforço imediatamente após os handlers normais do clique. */
    window.setTimeout(function(){
      dispararReafirmacao(origem, false);
    }, 0);

    /*
     * Reforços posteriores cobrem RAF/timeouts antigos de restauração,
     * inclusive rotinas que ainda podem executar perto de 900 ms.
     */
    [80, 250, 500, 1100].forEach(function(atraso){
      window.setTimeout(function(){
        dispararReafirmacao(origem, true);
      }, atraso);
    });
  }

  document.addEventListener(
    'click',
    function(event){
      var alvo =
        event && event.target && event.target.closest
          ? event.target.closest('button')
          : null;

      if(!alvo || !CLOSE_IDS[alvo.id]){
        return;
      }

      /*
       * O X de CLIENTE/FORNECEDOR também participa de fluxos da NFe.
       * Nesses casos ele volta ao Histórico, não ao PDV, então não mexemos.
       */
      if(
        alvo.id === 'scfCustomerRegistrationClose' &&
        cadastroEstaEmFluxoInterno()
      ){
        return;
      }

      agendarReafirmacao(
        CLOSE_IDS[alvo.id]
      );
    },
    true
  );
})();
