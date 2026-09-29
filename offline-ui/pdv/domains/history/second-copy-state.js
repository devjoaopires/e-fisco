(function(){
  'use strict';

  const historyList =
    document.getElementById(
      'scfSalesHistoryList'
    );

  if(!historyList){
    return;
  }

  function getCupomButton(row){
    if(
      !row ||
      !row.children ||
      row.children.length < 6
    ){
      return null;
    }

    return row.children[5].querySelector(
      '.scf-sales-history-tabular-button'
    );
  }

  /*
   * No carregamento da linha, uma venda que possui cupom passa a exibir SIM.
   * O botão só vira 2ª VIA depois que o usuário clicar em SIM.
   */
  function prepararBotoesCupom(){
    historyList
      .querySelectorAll(
        '.scf-sales-history-item-tabular .scf-sales-history-tabular-row'
      )
      .forEach(function(row){
        const button =
          getCupomButton(row);

        if(!button){
          return;
        }

        if(
          button.dataset.cupomStageInitialized ===
            'true'
        ){
          return;
        }

        button.dataset.cupomStageInitialized =
          'true';

        const card =
          button.closest(
            '.scf-sales-history-item-compact'
          );

        const saleId =
          String(
            card &&
            card.dataset.saleId ||
            ''
          ).trim();

        if(
          saleId &&
          button.textContent.trim() ===
            '2ª VIA'
        ){
          button.textContent =
            'SIM';

          button.setAttribute(
            'aria-label',
            'Cupom emitido. Preparar segunda via'
          );

          button.classList.remove(
            'is-active'
          );

          button.classList.add(
            'is-cupom-sim'
          );
        }
      });
  }

  function resetarOutrosBotoes(
    exceptButton
  ){
    historyList
      .querySelectorAll(
        '.scf-sales-history-item-tabular .scf-sales-history-tabular-row'
      )
      .forEach(function(row){
        const button =
          getCupomButton(row);

        if(
          !button ||
          button === exceptButton ||
          button.dataset.cupomStageInitialized !==
            'true'
        ){
          return;
        }

        const card =
          button.closest(
            '.scf-sales-history-item-compact'
          );

        const saleId =
          String(
            card &&
            card.dataset.saleId ||
            ''
          ).trim();

        if(
          saleId &&
          button.textContent.trim() ===
            '2ª VIA'
        ){
          button.textContent =
            'SIM';

          button.setAttribute(
            'aria-label',
            'Cupom emitido. Preparar segunda via'
          );

          button.classList.remove(
            'is-active'
          );

          button.classList.add(
            'is-cupom-sim'
          );
        }
      });
  }

  /*
   * Fluxo do cupom no Histórico:
   *
   * SIM -> clique -> muda para 2ª VIA E abre o cupom imediatamente.
   *
   * Depois que o cupom for fechado, o botão permanece em 2ª VIA e
   * continua podendo ser usado novamente pelo manipulador existente.
   */
  historyList.addEventListener(
    'click',
    function(event){
      const button =
        event.target.closest(
          '.scf-sales-history-tabular-button'
        );

      if(
        !button ||
        button.textContent.trim() !==
          'SIM'
      ){
        return;
      }

      const row =
        button.closest(
          '.scf-sales-history-tabular-row'
        );

      if(
        !row ||
        getCupomButton(row) !==
          button
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

      resetarOutrosBotoes(
        button
      );

      button.textContent =
        '2ª VIA';

      button.setAttribute(
        'aria-label',
        'Abrir segunda via do cupom fiscal'
      );

      button.classList.remove(
        'is-cupom-sim'
      );

      button.classList.add(
        'is-active'
      );

      /*
       * O clique em SIM já deve exibir a segunda via no painel direito.
       * Antes o usuário precisava clicar novamente em 2ª VIA, o que
       * deixava a interface aparentemente parada nesse estado.
       */
      const card =
        button.closest(
          '.scf-sales-history-item-compact'
        );

      const saleId =
        String(
          card &&
          card.dataset.saleId ||
          ''
        ).trim();

      if(
        saleId &&
        typeof window.__scfAbrirCupomHistoricoInline ===
          'function'
      ){
        window.__scfAbrirCupomHistoricoInline(
          saleId
        );
      }
    },
    true
  );

  const observer =
    new MutationObserver(
      prepararBotoesCupom
    );

  observer.observe(
    historyList,
    {
      childList:true,
      subtree:true
    }
  );

  prepararBotoesCupom();
})();
