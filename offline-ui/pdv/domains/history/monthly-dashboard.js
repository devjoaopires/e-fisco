(function(){
  'use strict';

  const desktopMq = window.matchMedia('(min-width:1001px)');
  const historyOverlay = document.getElementById('scfSalesHistoryOverlay');
  const historyList = document.getElementById('scfSalesHistoryList');
  const historyTitle = document.getElementById('scfSalesHistoryTitle');

  if(!historyOverlay || !historyList || !historyTitle){
    return;
  }

  let refreshRaf = 0;

  function text(value){
    return String(value ?? '')
      .replace(/\s+/g,' ')
      .trim();
  }

  function normalize(value){
    return text(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toUpperCase();
  }

  function moneyToNumber(value){
    const raw = text(value)
      .replace(/R\$/gi,'')
      .replace(/\./g,'')
      .replace(/,/g,'.')
      .replace(/[^\d.-]/g,'');

    const number = Number(raw);
    return Number.isFinite(number) ? number : 0;
  }

  function formatMoney(value){
    return new Intl.NumberFormat('pt-BR',{
      style:'currency',
      currency:'BRL'
    }).format(Number(value || 0));
  }

  function formatPercent(value){
    return new Intl.NumberFormat('pt-BR',{
      style:'percent',
      minimumFractionDigits:1,
      maximumFractionDigits:1
    }).format((Number(value) || 0) / 100);
  }

  function isDesktopMonthView(){
    const body = document.body;
    const outraPagina = body && (
      body.classList.contains('scf-customer-registration-open') ||
      body.classList.contains('scf-stock-page-open')
    );

    return !outraPagina &&
      desktopMq.matches &&
      historyOverlay.classList.contains('show') &&
      historyOverlay.getAttribute('aria-hidden') === 'false' &&
      !historyList.querySelector('.scf-sales-history-month-grid');
  }

  function getReceiptPanel(){
    return historyList.querySelector('.scf-history-inline-receipt-panel');
  }

  function getRows(){
    return Array.from(
      historyList.querySelectorAll('.scf-sales-history-item-tabular')
    );
  }

  function getCellText(row,index){
    const cells = row.querySelectorAll('.scf-sales-history-tabular-row > *');
    const cell = cells[index - 1];
    return text(
      cell && (
        cell.getAttribute('title') ||
        cell.textContent
      )
    );
  }

  function getMonthLabel(){
    const title = text(historyTitle.textContent).toUpperCase();
    const parts = title.split(' - ');
    return text(parts[parts.length - 1] || 'MÊS');
  }

  function getLocalPaymentParts(saleId){
    if(!saleId){
      return [];
    }

    try{
      const history = JSON.parse(
        window.__scfPdvInfra.storage.local.getItem(window.__scfPdvContracts.storage.local.keys.fiscalSales) || '[]'
      );

      if(!Array.isArray(history)){
        return [];
      }

      const sale = history.find(function(item){
        return text(item && item.saleId) === saleId;
      });

      return sale && Array.isArray(sale.paymentParts)
        ? sale.paymentParts
        : [];
    }catch(error){
      return [];
    }
  }

  function getPaymentParts(row){
    try{
      const fromDataset = JSON.parse(
        row.dataset.paymentParts || '[]'
      );

      if(Array.isArray(fromDataset) && fromDataset.length){
        return fromDataset;
      }
    }catch(error){}

    return getLocalPaymentParts(
      text(row.dataset.saleId)
    );
  }

  function paymentKey(value){
    const method = normalize(value);

    if(method.includes('CREDITO')) return 'credito';
    if(method.includes('DEBITO')) return 'debito';
    if(method.includes('DINHEIRO')) return 'dinheiro';
    if(method.includes('PIX')) return 'pix';
    return '';
  }

  function singlePaymentKey(label){
    const parts = text(label)
      .split(/\s*\+\s*/)
      .map(paymentKey)
      .filter(Boolean);

    const unique = Array.from(new Set(parts));
    return unique.length === 1 ? unique[0] : '';
  }

  function paymentKeysFromLabel(label){
    return Array.from(new Set(
      text(label)
        .split(/\s*\+\s*/)
        .map(paymentKey)
        .filter(Boolean)
    ));
  }

  function ensureDashboard(){
    if(!isDesktopMonthView()){
      return null;
    }

    const panel = getReceiptPanel();
    if(!panel){
      return null;
    }

    let dash = panel.querySelector('.scf-history-inline-dashboard');

    if(!dash){
      dash = document.createElement('section');
      dash.className = 'scf-history-inline-dashboard';
      dash.innerHTML = ''
        + '<div class="scf-history-inline-dashboard-header">'
        +   '<div class="scf-history-inline-dashboard-title"></div>'
        +   '<div class="scf-history-inline-dashboard-subtitle"></div>'
        + '</div>'
        + '<div class="scf-history-inline-dashboard-grid"></div>'
        + '<div class="scf-history-inline-dashboard-note"></div>';

      panel.appendChild(dash);
    }else if(dash.parentElement !== panel){
      panel.appendChild(dash);
    }

    const frame =
      panel.querySelector(
        '.scf-history-inline-receipt-frame'
      );

    if(
      frame &&
      !panel.classList.contains('has-receipt') &&
      !panel.classList.contains('is-receipt-mode') &&
      !panel.classList.contains('is-loading')
    ){
      frame.remove();
    }

    return dash;
  }

  function computeMetrics(){
    const totals = {
      totalVendas:0,
      totalNfce:0,
      totalNfe:0,
      totalCancelamentos:0,
      totalDevolucoes:0,
      credito:0,
      debito:0,
      dinheiro:0,
      pix:0
    };

    getRows().forEach(function(row){
      const receita = moneyToNumber(getCellText(row,3));
      const nfcDigits = getCellText(row,5).replace(/\D/g,'');
      const notaFiscal = normalize(getCellText(row,7));
      const nfe55AutorizadaNoCard = Boolean(
        row.querySelector(
          '.scf-sales-history-tabular-button[data-scf-nfe55-autorizada="true"]'
        )
      );
      const paymentLabel = getCellText(row,4);
      const paymentParts = getPaymentParts(row);

      totals.totalVendas += receita;

      if(Number(nfcDigits) > 0){
        totals.totalNfce += 1;
      }

      if(
        nfe55AutorizadaNoCard ||
        notaFiscal === 'SIM' ||
        notaFiscal === 'EMITIDA' ||
        notaFiscal === 'AUTORIZADA'
      ){
        totals.totalNfe += 1;
      }

      const card =
        row.closest(
          '.scf-sales-history-item-compact'
        );

      const fiscalStatus =
        normalize(
          card &&
          card.dataset &&
          card.dataset.fiscalStatus
        );

      const devolucaoAutorizada =
        text(
          card &&
          card.dataset &&
          card.dataset.nfe55DevolucaoAutorizada
        ).toLowerCase() ===
          'true';

      const quantidadeDevolucoesTexto =
        text(
          card &&
          card.dataset &&
          card.dataset.nfe55DevolucoesAutorizadasQuantidade
        );

      const quantidadeDevolucoesAutorizadas =
        /^\d+$/.test(
          quantidadeDevolucoesTexto
        )
          ? Number(
              quantidadeDevolucoesTexto
            )
          : devolucaoAutorizada
            ? 1
            : 0;

      if(
        fiscalStatus ===
          'CANCELADA'
      ){
        totals.totalCancelamentos +=
          1;
      }

      if(
        quantidadeDevolucoesAutorizadas >
          0
      ){
        totals.totalDevolucoes +=
          quantidadeDevolucoesAutorizadas;
      }

      if(paymentParts.length){
        paymentParts.forEach(function(part){
          const key = paymentKey(
            part && (
              part.method ||
              part.metodo ||
              part.paymentMethod
            )
          );

          const amount = Number(
            part && (
              part.amount ??
              part.valor ??
              0
            )
          );

          if(key && Number.isFinite(amount)){
            totals[key] += Math.max(0,amount);
          }
        });

        return;
      }

      const uniqueKeys = paymentKeysFromLabel(paymentLabel);

      if(uniqueKeys.length === 1){
        totals[uniqueKeys[0]] += receita;
      }else if(uniqueKeys.length > 1 && receita > 0){
        const quota = receita / uniqueKeys.length;
        uniqueKeys.forEach(function(key){
          totals[key] += quota;
        });
      }
    });

    return totals;
  }

  function addPaymentDonut(
    grid,
    metrics,
    percentages
  ){
    const credito =
      Math.max(
        0,
        Number(
          percentages.credito
        ) || 0
      );

    const debito =
      Math.max(
        0,
        Number(
          percentages.debito
        ) || 0
      );

    const dinheiro =
      Math.max(
        0,
        Number(
          percentages.dinheiro
        ) || 0
      );

    const pix =
      Math.max(
        0,
        Number(
          percentages.pix
        ) || 0
      );

    const pixFim =
      pix;

    const debitoFim =
      pixFim +
      debito;

    const creditoFim =
      debitoFim +
      credito;

    const dinheiroFim =
      Math.min(
        100,
        creditoFim +
        dinheiro
      );

    const card =
      document.createElement(
        'div'
      );

    card.className =
      'scf-history-inline-dashboard-donut-card';

    const visual =
      document.createElement(
        'div'
      );

    visual.className =
      'scf-history-inline-dashboard-donut';

    visual.style.background =
      [
        'conic-gradient(',
        `#10b981 0% ${pixFim}%,`,
        `#7c3aed ${pixFim}% ${debitoFim}%,`,
        `#2563eb ${debitoFim}% ${creditoFim}%,`,
        `#f59e0b ${creditoFim}% ${dinheiroFim}%,`,
        `#e5e7eb ${dinheiroFim}% 100%`,
        ')'
      ].join('');

    const center =
      document.createElement(
        'div'
      );

    center.className =
      'scf-history-inline-dashboard-donut-center';

    const centerLabel =
      document.createElement(
        'div'
      );

    centerLabel.className =
      'scf-history-inline-dashboard-donut-center-label';

    centerLabel.textContent =
      'PAGAMENTOS';

    const centerValue =
      document.createElement(
        'div'
      );

    centerValue.className =
      'scf-history-inline-dashboard-donut-center-value';

    centerValue.textContent =
      formatMoney(
        metrics.credito +
        metrics.debito +
        metrics.dinheiro +
        metrics.pix
      );

    center.append(
      centerLabel,
      centerValue
    );

    visual.appendChild(
      center
    );

    const legend =
      document.createElement(
        'div'
      );

    legend.className =
      'scf-history-inline-dashboard-donut-legend';

    [
      {
        key:
          'pix',
        label:
          'PIX',
        value:
          pix,
        color:
          '#10b981'
      },
      {
        key:
          'debito',
        label:
          'DÉBITO',
        value:
          debito,
        color:
          '#7c3aed'
      },
      {
        key:
          'credito',
        label:
          'CRÉDITO',
        value:
          credito,
        color:
          '#2563eb'
      },
      {
        key:
          'dinheiro',
        label:
          'DINHEIRO',
        value:
          dinheiro,
        color:
          '#f59e0b'
      }
    ].forEach(function(item){
      const row =
        document.createElement(
          'div'
        );

      row.className =
        'scf-history-inline-dashboard-donut-legend-row';

      const dot =
        document.createElement(
          'span'
        );

      dot.className =
        'scf-history-inline-dashboard-donut-dot';

      dot.style.background =
        item.color;

      const label =
        document.createElement(
          'span'
        );

      label.className =
        'scf-history-inline-dashboard-donut-legend-label';

      label.textContent =
        item.label;

      const value =
        document.createElement(
          'strong'
        );

      value.className =
        'scf-history-inline-dashboard-donut-legend-value';

      value.textContent =
        formatPercent(
          item.value
        );

      row.append(
        dot,
        label,
        value
      );

      legend.appendChild(
        row
      );
    });

    card.append(
      visual,
      legend
    );

    grid.appendChild(
      card
    );
  }


  function addCard(grid,label,value,options){
    const card = document.createElement('div');
    card.className = 'scf-history-inline-dashboard-card'
      + (options && options.wide ? ' is-wide' : '')
      + (options && options.count ? ' is-count' : '');

    const labelEl = document.createElement('div');
    labelEl.className = 'scf-history-inline-dashboard-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('div');
    valueEl.className = 'scf-history-inline-dashboard-value';
    valueEl.textContent = value;

    card.append(labelEl,valueEl);
    grid.appendChild(card);
  }

  function renderDashboard(){
    if(!isDesktopMonthView()){
      return;
    }

    const dash = ensureDashboard();
    if(!dash){
      return;
    }

    const subtitle = dash.querySelector('.scf-history-inline-dashboard-subtitle');
    const grid = dash.querySelector('.scf-history-inline-dashboard-grid');
    const note = dash.querySelector('.scf-history-inline-dashboard-note');

    if(!grid){
      return;
    }

    const metrics = computeMetrics();

    if(subtitle){
      subtitle.textContent = getMonthLabel();
    }

    grid.replaceChildren();

    const totalPagamentos =
      metrics.credito +
      metrics.debito +
      metrics.dinheiro +
      metrics.pix;

    const creditoPct = totalPagamentos > 0 ? (metrics.credito / totalPagamentos) * 100 : 0;
    const debitoPct = totalPagamentos > 0 ? (metrics.debito / totalPagamentos) * 100 : 0;
    const dinheiroPct = totalPagamentos > 0 ? (metrics.dinheiro / totalPagamentos) * 100 : 0;
    const pixPct = totalPagamentos > 0 ? (metrics.pix / totalPagamentos) * 100 : 0;

    addCard(grid,'TOTAL EM VENDAS',formatMoney(metrics.totalVendas),{wide:true});

    addPaymentDonut(
      grid,
      metrics,
      {
        credito:
          creditoPct,

        debito:
          debitoPct,

        dinheiro:
          dinheiroPct,

        pix:
          pixPct
      }
    );

    addCard(grid,'NFC-e EMITIDAS',String(metrics.totalNfce),{count:true});
    addCard(grid,'NF-e EMITIDAS',String(metrics.totalNfe),{count:true});
    addCard(grid,'CANCELAMENTOS',String(metrics.totalCancelamentos),{count:true});
    addCard(grid,'DEVOLUÇÕES',String(metrics.totalDevolucoes),{count:true});

    if(note){
      note.textContent = '';
    }
  }

  function refreshSoon(){
    cancelAnimationFrame(refreshRaf);
    refreshRaf = requestAnimationFrame(function(){
      requestAnimationFrame(renderDashboard);
    });
  }

  /*
   * Atualiza apenas quando entram/saem vendas ou muda a estrutura do mês.
   * O próprio dashboard e o calendário são ignorados para não criar
   * MutationObserver em loop (isso também preserva o painel no card direito).
   */
  new MutationObserver(function(mutations){
    const shouldRefresh = mutations.some(function(mutation){
      const target = mutation.target && mutation.target.nodeType === 1
        ? mutation.target
        : mutation.target && mutation.target.parentElement;

      if(
        target &&
        target.closest &&
        (
          target.closest('.scf-history-inline-dashboard') ||
          target.closest('.scf-history-inline-calendar') ||
          target.closest('.scf-history-inline-empty-date')
        )
      ){
        return false;
      }

      return Array.from(mutation.addedNodes || [])
        .concat(Array.from(mutation.removedNodes || []))
        .some(function(node){
          if(!node || node.nodeType !== 1){
            return false;
          }

          return (
            node.matches &&
            (
              node.matches('.scf-sales-history-item') ||
              node.matches('.scf-history-month-sales-column') ||
              node.matches('.scf-history-month-detail-layout') ||
              node.matches('.scf-sales-history-month-grid')
            )
          ) || (
            node.querySelector &&
            (
              node.querySelector('.scf-sales-history-item') ||
              node.querySelector('.scf-history-month-sales-column')
            )
          );
        });
    });

    if(shouldRefresh){
      refreshSoon();
    }
  }).observe(historyList,{
    childList:true,
    subtree:true
  });

  new MutationObserver(refreshSoon).observe(historyOverlay,{
    attributes:true,
    attributeFilter:['class','aria-hidden']
  });

  /*
   * CANCELADA e DEVOLVIDA podem mudar sem recriar a linha inteira.
   * Observa somente os dois atributos persistentes usados pelos novos
   * indicadores, sem observar o DOM interno da própria dashboard.
   */
  new MutationObserver(refreshSoon).observe(historyList,{
    attributes:true,
    subtree:true,
    attributeFilter:[
      'data-fiscal-status',
      'data-nfe55-devolucao-autorizada'
    ]
  });

  new MutationObserver(refreshSoon).observe(historyTitle,{
    childList:true,
    subtree:true,
    characterData:true
  });

  window.__scfPdvInfra.eventBus.on('scf:cupom-historico-fechado',refreshSoon);

  if(typeof desktopMq.addEventListener === 'function'){
    desktopMq.addEventListener('change',refreshSoon);
  }else if(typeof desktopMq.addListener === 'function'){
    desktopMq.addListener(refreshSoon);
  }

  refreshSoon();
})();
