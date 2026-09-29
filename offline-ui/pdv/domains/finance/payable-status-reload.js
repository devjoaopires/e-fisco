(function(){
  'use strict';

  const financeDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.finance;

  if(!financeDomain){
    throw new Error(
      'PDV finance domain indisponivel.'
    );
  }

  if(financeDomain.accountStatusReload){
    return;
  }

  financeDomain.accountStatusReload = true;

  window.__scfPdvInfra.shellBridge.onMessage(
    function(event){
      const data =
        event &&
        event.data &&
        typeof event.data === 'object'
          ? event.data
          : null;

      if(
        !data ||
        data.type !==
          'SCF_FINANCEIRO_CONTA_PAGAR_SITUACAO_ATUALIZADA'
      ){
        return;
      }

      window.__scfPdvInfra.eventBus.dispatch(
        new CustomEvent(
          'scf:financeiro-saldo-recarregar'
        )
      );
    }
  );
})();
