(function(){
  'use strict';

  const historyList =
    document.getElementById(
      'scfSalesHistoryList'
    );

  if(!historyList){
    return;
  }

  function text(value){
    return String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function extrairNfce(titulo){
    const match =
      text(titulo).match(
        /(NFC-e\s*\d+)/i
      );

    return match
      ? text(match[1])
      : text(titulo).split('-')[0].trim();
  }

  function alinharCard(card){
    if(
      !card ||
      card.dataset.scfHistoricoAlinhado ===
        '1'
    ){
      return;
    }

    const title =
      card.querySelector(
        '.scf-sales-history-inline-title'
      );

    const meta =
      card.querySelector(
        '.scf-sales-history-inline-meta'
      );

    const total =
      card.querySelector(
        '.scf-sales-history-total'
      );

    if(
      !title ||
      !meta ||
      !total
    ){
      return;
    }

    /*
     * Evita que as alterações de textContent feitas abaixo
     * acionem o MutationObserver e processem o mesmo card
     * indefinidamente.
     */
    card.dataset.scfHistoricoAlinhado =
      '1';

    const nfce =
      extrairNfce(
        title.textContent
      );

    const totalText =
      text(
        total.textContent
      );

    const tituloAlinhado =
      totalText
        ? `${nfce} - ${totalText}`
        : nfce;

    if(
      title.textContent !==
        tituloAlinhado
    ){
      title.textContent =
        tituloAlinhado;
    }

    const metaAlinhada =
      text(
        meta.textContent
      ).replace(/\s*-\s*/g, ' - ');

    if(
      meta.textContent !==
        metaAlinhada
    ){
      meta.textContent =
        metaAlinhada;
    }

    card.classList.add(
      'scf-sales-history-item-alinhado'
    );
  }

  function aplicar(){
    historyList
      .querySelectorAll(
        '.scf-sales-history-item-compact'
      )
      .forEach(
        alinharCard
      );
  }

  new MutationObserver(
    aplicar
  ).observe(
    historyList,
    {
      childList:true,
      subtree:true
    }
  );

  aplicar();
})();
