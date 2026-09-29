(function(){
  'use strict';

  const historyList =
    document.getElementById(
      'scfSalesHistoryList'
    );

  if(!historyList){
    return;
  }

  function normalizeText(value){
    return String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function corrigirTitulo(titleElement){
    if(!titleElement){
      return;
    }

    const raw =
      normalizeText(
        titleElement.textContent
      );

    if(!raw){
      return;
    }

    /*
     * Corrige casos como:
     * "NFC-e 00010 - NFC-e AUTORIZADA"
     * para:
     * "NFC-e 00010 - AUTORIZADA"
     */
    const match =
      raw.match(
        /^(NFC-e\s*\d+)\s*-\s*(?:NFC-e\s*)?(.*)$/i
      );

    if(!match){
      return;
    }

    const nfce =
      normalizeText(match[1]);

    let status =
      normalizeText(match[2]);

    status = status.replace(
      /^-\s*/,
      ''
    );

    const tituloCorrigido =
      !status
        ? nfce
        : nfce + ' - ' + status;

    /*
     * IMPORTANTE: este bloco é chamado por um MutationObserver que
     * observa childList/subtree. Regravar o mesmo textContent gera uma
     * nova mutação e pode prender o Histórico em um loop infinito.
     */
    if(
      titleElement.textContent !==
        tituloCorrigido
    ){
      titleElement.textContent =
        tituloCorrigido;
    }
  }

  function corrigirCards(){
    historyList
      .querySelectorAll(
        '.scf-sales-history-item-compact'
      )
      .forEach(function(card){
        const title =
          card.querySelector(
            '.scf-sales-history-inline-title'
          );

        corrigirTitulo(title);
      });
  }

  new MutationObserver(
    corrigirCards
  ).observe(
    historyList,
    {
      childList:true,
      subtree:true
    }
  );

  corrigirCards();
})();
