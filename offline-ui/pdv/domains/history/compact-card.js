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

  function splitMetaLines(metaElement){
    return String(
      metaElement &&
      metaElement.textContent ||
      ''
    )
      .split('\n')
      .map(function(line){
        return normalizeText(line);
      })
      .filter(Boolean);
  }

  function mountCompactCard(card){
    if(
      !card ||
      card.dataset.compactHistoryReady ===
        '1'
    ){
      return;
    }

    const numberElement =
      card.querySelector(
        '.scf-sales-history-number'
      );

    const totalElement =
      card.querySelector(
        '.scf-sales-history-total'
      );

    const metaElement =
      card.querySelector(
        '.scf-sales-history-meta'
      );

    const statusElement =
      card.querySelector(
        '.scf-sales-history-status'
      );

    const reprintElement =
      card.querySelector(
        '.scf-sales-history-reprint'
      );

    if(
      !numberElement ||
      !totalElement ||
      !metaElement
    ){
      return;
    }

    const lines =
      splitMetaLines(
        metaElement
      );

    const titleText =
      [
        normalizeText(
          numberElement.textContent
        ),
        normalizeText(
          statusElement &&
          statusElement.textContent
        )
      ]
        .filter(Boolean)
        .join(' - ');

    const paymentLine =
      normalizeText(
        lines[1] || ''
      )
        .split('|')[0]
        .trim();

    const secondLine =
      [
        normalizeText(
          lines[0] || ''
        ),
        paymentLine
      ]
        .filter(Boolean)
        .join(' - ');

    const saleId =
      reprintElement &&
      reprintElement.dataset
        ? reprintElement.dataset.saleId || ''
        : '';

    const reprintText =
      normalizeText(
        reprintElement &&
        reprintElement.textContent
      ) || 'REIMPRIMIR CUPOM';

    const reprintDisabled =
      !!(
        reprintElement &&
        reprintElement.disabled
      );

    card.innerHTML = '';
    card.classList.add(
      'scf-sales-history-item-compact'
    );

    const main =
      document.createElement('div');

    main.className =
      'scf-sales-history-main';

    const inlineTitle =
      document.createElement('div');

    inlineTitle.className =
      'scf-sales-history-inline-title';

    inlineTitle.textContent =
      titleText;

    const inlineMeta =
      document.createElement('div');

    inlineMeta.className =
      'scf-sales-history-inline-meta';

    inlineMeta.textContent =
      secondLine;

    const switchRow =
      document.createElement('div');

    switchRow.className =
      'scf-sales-history-doc-switch';

    const cupomButton =
      document.createElement('button');

    cupomButton.type =
      'button';

    cupomButton.className =
      'scf-sales-history-doc-action is-active';

    cupomButton.textContent =
      'CUPOM FISCAL';

    const notaButton =
      document.createElement('button');

    notaButton.type =
      'button';

    notaButton.className =
      'scf-sales-history-doc-action';

    notaButton.textContent =
      'NOTA FISCAL';

    switchRow.append(
      cupomButton,
      notaButton
    );

    main.append(
      inlineTitle,
      inlineMeta,
      switchRow
    );

    const side =
      document.createElement('div');

    side.className =
      'scf-sales-history-side';

    const total =
      document.createElement('div');

    total.className =
      'scf-sales-history-total';

    total.textContent =
      normalizeText(
        totalElement.textContent
      );

    side.appendChild(
      total
    );

    if(saleId){
      const reprintButton =
        document.createElement('button');

      reprintButton.type =
        'button';

      reprintButton.className =
        'scf-sales-history-reprint';

      reprintButton.textContent =
        reprintText;

      reprintButton.dataset.saleId =
        saleId;

      reprintButton.disabled =
        reprintDisabled;

      side.appendChild(
        reprintButton
      );

      cupomButton.addEventListener(
        'click',
        function(event){
          event.preventDefault();
          event.stopPropagation();
          reprintButton.click();
        }
      );

      /*
       * No momento, o botão "Nota Fiscal" acompanha
       * a mesma visualização/reimpressão do DANFE.
       */
      notaButton.addEventListener(
        'click',
        function(event){
          event.preventDefault();
          event.stopPropagation();
          reprintButton.click();
        }
      );
    }

    card.append(
      main,
      side
    );

    card.dataset.compactHistoryReady =
      '1';
  }

  function upgradeCards(){
    historyList
      .querySelectorAll(
        '.scf-sales-history-item'
      )
      .forEach(
        mountCompactCard
      );
  }

  new MutationObserver(
    upgradeCards
  ).observe(
    historyList,
    {
      childList:true,
      subtree:true
    }
  );

  upgradeCards();
})();
