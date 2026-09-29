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

  function getContainer(){
    return (
      historyList.querySelector(
        '.scf-history-month-sales-column'
      ) || historyList
    );
  }

  function isMonthView(){
    return !historyList.querySelector(
      '.scf-sales-history-month-grid'
    );
  }

  function ensureHeader(container){
    if(
      !container ||
      !isMonthView()
    ){
      return;
    }

    const hasRows =
      container.querySelector(
        '.scf-sales-history-item-compact'
      );

    if(!hasRows){
      const oldHeader =
        container.querySelector(
          '.scf-sales-history-table-header'
        );

      if(oldHeader){
        oldHeader.remove();
      }

      return;
    }

    let header =
      container.querySelector(
        '.scf-sales-history-table-header'
      );

    if(!header){
      header =
        document.createElement('div');

      header.className =
        'scf-sales-history-table-header';

      [
        'DATA',
        'HORA',
        'VALOR',
        'FORMA',
        'Nº',
        'NFC-e',
        'NF-e'
      ].forEach(function(label){
        const cell =
          document.createElement('div');

        cell.textContent = label;
        header.appendChild(cell);
      });

      container.insertBefore(
        header,
        container.firstChild
      );
    }
  }

  function parseData(card){
    const titleElement =
      card.querySelector(
        '.scf-sales-history-inline-title'
      );

    const metaElement =
      card.querySelector(
        '.scf-sales-history-inline-meta'
      );

    const title =
      normalizeText(
        titleElement &&
        titleElement.textContent
      );

    const meta =
      normalizeText(
        metaElement &&
        metaElement.textContent
      );

    let data = '';
    let hora = '';
    let pagamento = '';

    const metaMatch =
      meta.match(
        /^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})(?:\s*-\s*(.+))?$/i
      );

    if(metaMatch){
      data = normalizeText(metaMatch[1]);
      hora = normalizeText(metaMatch[2]);
      pagamento =
        normalizeText(
          metaMatch[3] || ''
        ) || '-';
    }else{
      pagamento = meta || '-';
    }

    const receitaMatch =
      title.match(
        /(R\$\s*[\d\.,]+)/i
      );

    const nfceMatch =
      title.match(
        /NFC-e\s*(\d+)/i
      );

    return {
      data: data || '-',
      hora: hora || '-',
      receita: receitaMatch
        ? normalizeText(
            receitaMatch[1]
          )
        : '-',
      pagamento,
      nfce: nfceMatch
        ? String(nfceMatch[1]).padStart(5, '0')
        : '-',
      saleId: normalizeText(
        card.dataset.saleId
      )
    };
  }

  function transformCard(card){
    if(
      !card ||
      card.classList.contains(
        'scf-sales-history-item-tabular'
      )
    ){
      return;
    }

    const info =
      parseData(card);

    card.classList.add(
      'scf-sales-history-item-tabular'
    );

    Array.from(card.children)
      .forEach(function(child){
        child.style.display = 'none';
      });

    let row =
      card.querySelector(
        '.scf-sales-history-tabular-row'
      );

    if(row){
      row.remove();
    }

    row =
      document.createElement('div');

    row.className =
      'scf-sales-history-tabular-row';

    const tipoVendaCard =
      String(
        card.dataset.scfTipoVenda ||
        ''
      ).trim().toUpperCase();

    row.dataset.scfTipoVenda =
      (
        tipoVendaCard === 'CONTINGÊNCIA' ||
        tipoVendaCard === 'CONTINGENCIA'
      )
        ? 'CONTINGÊNCIA'
        : tipoVendaCard === 'INTERNO'
          ? 'INTERNO'
          : 'NORMAL';

    const textCells = [
      info.data,
      info.hora,
      info.receita,
      info.pagamento,
      info.nfce
    ];

    textCells.forEach(function(value,index){
      const cell =
        document.createElement('div');

      if(index === 0){
        const fullDate =
          String(value || '').trim();

        const dateMatch =
          fullDate.match(
            /^(\d{2})\/(\d{2})\/(\d{4})$/
          );

        if(dateMatch){
          cell.dataset.scfDateShort =
            `${dateMatch[1]}/${dateMatch[2]}`;

          cell.title =
            fullDate;
        }
      }

      /*
       * PAGAMENTO múltiplo: quando a descrição ficar longa,
       * divide os métodos em duas linhas equilibradas sem
       * invadir a coluna NFC-e. O valor completo permanece
       * disponível no title da célula.
       */
      if(
        index === 3 &&
        String(value || '').includes('+')
      ){
        const metodos =
          String(value || '')
            .split(/\s*\+\s*/)
            .map(function(item){
              return item.trim();
            })
            .filter(Boolean);

        /*
         * Mais de 3 formas de pagamento: simplifica a coluna
         * para não apertar nem invadir as colunas vizinhas.
         * O detalhamento completo continua disponível no title.
         */
        if(metodos.length > 3){
          cell.textContent =
            'MÚLTIPLOS';

          cell.title =
            String(value || '');
        }else if(
          metodos.length > 1 &&
          String(value || '').length > 18
        ){
          const corte =
            Math.ceil(
              metodos.length / 2
            );

          const linhas = [
            metodos.slice(0,corte),
            metodos.slice(corte)
          ].filter(function(linha){
            return linha.length > 0;
          });

          cell.classList.add(
            'scf-sales-history-payment-multiple'
          );

          cell.title =
            String(value || '');

          linhas.forEach(function(linha){
            const span =
              document.createElement('span');

            span.className =
              'scf-sales-history-payment-line';

            span.textContent =
              linha.join(' + ');

            cell.appendChild(span);
          });
        }else{
          cell.textContent = value;
        }
      }else{
        cell.textContent = value;
      }

      row.appendChild(cell);
    });

    const cupomCell =
      document.createElement('div');

    const cupomButton =
      document.createElement('button');

    cupomButton.type = 'button';
    cupomButton.className =
      'scf-sales-history-doc-action scf-sales-history-tabular-button';

    const possuiNfce =
      Boolean(
        info.saleId &&
        info.nfce &&
        info.nfce !== '-' &&
        info.nfce !== '00000'
      );

    cupomButton.textContent =
      possuiNfce
        ? '2ª VIA'
        : 'NÃO';

    if(!possuiNfce){
      cupomButton.disabled = true;
      cupomButton.classList.add(
        'is-inactive'
      );
    }

    cupomCell.appendChild(
      cupomButton
    );
    row.appendChild(
      cupomCell
    );

    const notaCell =
      document.createElement('div');

    const notaButton =
      document.createElement('button');

    notaButton.type = 'button';
    notaButton.className =
      'scf-sales-history-doc-action scf-sales-history-tabular-button is-inactive';
    notaButton.textContent = 'EMITIR';
    notaButton.disabled = true;

    notaCell.appendChild(
      notaButton
    );
    row.appendChild(
      notaCell
    );

    card.appendChild(row);
  }

  function applyLayout(){
    const container =
      getContainer();

    ensureHeader(
      container
    );

    container
      .querySelectorAll(
        '.scf-sales-history-item-compact'
      )
      .forEach(
        transformCard
      );
  }

  new MutationObserver(
    applyLayout
  ).observe(
    historyList,
    {
      childList:true,
      subtree:true
    }
  );

  applyLayout();
})();
