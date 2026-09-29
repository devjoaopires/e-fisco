(function(){
  'use strict';

  const historyList =
    document.getElementById(
      'scfSalesHistoryList'
    );

  if(!historyList){
    return;
  }

  /*
   * O botão tabular é criado depois do script que prepara o cupom.
   * Por isso ele ainda não tinha o listener de abertura.
   * Ao clicar em 2ª VIA, acionamos o botão CUPOM FISCAL original
   * (oculto no mesmo card), que já possui toda a lógica de carregar
   * o comprovante dentro do painel direito.
   */
  historyList.addEventListener(
    'click',
    function(event){
      const tableButton =
        event.target.closest(
          '.scf-sales-history-tabular-button'
        );

      if(
        !tableButton ||
        tableButton.textContent.trim() !==
          '2ª VIA'
      ){
        return;
      }
      /*
       * Este listener é EXCLUSIVO da coluna CUPOM (6ª coluna).
       *
       * Antes, qualquer botão com o texto "2ª VIA" podia cair aqui
       * caso o dataset da NF-e 55 ainda não estivesse disponível no
       * instante do clique. Isso fazia a coluna NOTA FISCAL abrir
       * indevidamente o comprovante da NFC-e.
       */
      const row =
        tableButton.closest(
          '.scf-sales-history-tabular-row'
        );

      const cupomButton =
        row &&
        row.children &&
        row.children.length >= 6 &&
        row.children[5]
          ? row.children[5].querySelector(
              '.scf-sales-history-tabular-button'
            )
          : null;

      if(
        cupomButton !==
          tableButton
      ){
        return;
      }

      /*
       * Segurança adicional:
       * NF-e 55 autorizada sempre usa o DANFE próprio.
       */
      if(
        tableButton.dataset.scfNfe55Autorizada ===
          'true'
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

      const card =
        tableButton.closest(
          '.scf-sales-history-item-compact'
        );

      if(!card){
        return;
      }

      const saleId =
        String(
          card.dataset.saleId || ''
        ).trim();

      if(
        !saleId ||
        typeof window.__scfAbrirCupomHistoricoInline !==
          'function'
      ){
        return;
      }

      window.__scfAbrirCupomHistoricoInline(
        saleId
      );
    },
    true
  );
})();
