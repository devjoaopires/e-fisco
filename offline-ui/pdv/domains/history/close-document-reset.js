(function(){
  'use strict';

  const historyList =
    document.getElementById(
      'scfSalesHistoryList'
    );

  if(!historyList){
    return;
  }

  let timer1 = 0;
  let timer2 = 0;

  function resetarCupomParaSim(){
    historyList
      .querySelectorAll(
        '.scf-sales-history-tabular-button[data-cupom-stage-initialized="true"]'
      )
      .forEach(function(button){
        if(
          String(
            button.textContent || ''
          ).trim() !== '2ª VIA'
        ){
          return;
        }

        button.textContent = 'SIM';
        button.classList.remove(
          'is-active'
        );
        button.classList.add(
          'is-cupom-sim'
        );
        button.setAttribute(
          'aria-label',
          'Cupom emitido. Preparar segunda via'
        );
      });
  }

  function resetarNfeParaSim(){
    historyList
      .querySelectorAll(
        '.scf-sales-history-tabular-button[data-scf-nfe55-autorizada="true"]'
      )
      .forEach(function(button){
        if(
          String(
            button.textContent || ''
          ).trim() !== '2ª VIA'
        ){
          return;
        }

        button.textContent = 'SIM';
        button.classList.remove(
          'is-active'
        );
        button.classList.add(
          'is-nfe55-sim'
        );
        button.setAttribute(
          'aria-label',
          'NF-e emitida. Preparar segunda via'
        );
      });
  }

  function resetarRotulos(){
    resetarCupomParaSim();
    resetarNfeParaSim();
  }

  function agendarReset(){
    window.clearTimeout(timer1);
    window.clearTimeout(timer2);

    window.requestAnimationFrame(
      function(){
        window.requestAnimationFrame(
          resetarRotulos
        );
      }
    );

    /*
     * Repete depois dos observers/listeners antigos para garantir
     * que nenhum deles recoloque 2ª VIA após o fechamento.
     */
    timer1 = window.setTimeout(
      resetarRotulos,
      80
    );

    timer2 = window.setTimeout(
      resetarRotulos,
      220
    );
  }

  const closeDocument =
    document.getElementById(
      'fiscalReceiptCloseButton'
    );

  if(closeDocument){
    closeDocument.addEventListener(
      'click',
      agendarReset,
      false
    );
  }

  /*
   * O fechamento do cupom pelo Histórico já dispara este evento.
   * Também cobre qualquer fechamento indireto que reutilize o mesmo fluxo.
   */
  window.__scfPdvInfra.eventBus.on('scf:cupom-historico-fechado',
    agendarReset
  );

  /* Ao fechar o Histórico inteiro, a próxima abertura também começa em SIM. */
  const historyClose =
    document.getElementById(
      'scfSalesHistoryClose'
    );

  if(historyClose){
    historyClose.addEventListener(
      'click',
      agendarReset,
      false
    );
  }
})();
