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
        (
          data.type !==
            'SCF_FINANCEIRO_CONTA_RECEBER_SITUACAO_ATUALIZADA' &&
          data.type !==
            'SCF_FINANCEIRO_CONTA_RECEBER_SITUACAO_ERRO'
        )
      ){
        return;
      }

      const requestId =
        String(
          data.requestId ||
          ''
        );

      const pendencias =
        financeDomain.receivablePending &&
        typeof financeDomain.receivablePending ===
          'object'
          ? financeDomain.receivablePending
          : {};

      const pendencia =
        requestId
          ? pendencias[
              requestId
            ]
          : null;

      if(pendencia){
        if(
          data.type ===
            'SCF_FINANCEIRO_CONTA_RECEBER_SITUACAO_ERRO'
        ){
          if(
            pendencia.input
          ){
            pendencia.input.checked =
              pendencia.anterior ===
                true;
          }

          if(
            pendencia.text
          ){
            pendencia.text.textContent =
              pendencia.anterior ===
                true
                ? 'RECEBIDO'
                : 'A RECEBER';
          }

          if(
            pendencia.label
          ){
            pendencia.label.classList.toggle(
              'is-received',
              pendencia.anterior ===
                true
            );

            pendencia.label.classList.toggle(
              'is-pending',
              pendencia.anterior !==
                true
            );
          }

          if(
            pendencia.input
          ){
            pendencia.input.disabled =
              false;
          }

          console.error(
            data.message ||
            'Não foi possível atualizar a conta a receber.'
          );
        }

        delete pendencias[
          requestId
        ];
      }

      /*
       * Recarrega a fotografia financeira para atualizar:
       * tabela, booleano e saldo da conta financeira.
       */
      window.__scfPdvInfra.eventBus.dispatch(
        new CustomEvent(
          'scf:financeiro-saldo-recarregar'
        )
      );
    }
  );
})();
