(function(){
  'use strict';

  const desktopMq = window.matchMedia('(min-width:1001px)');
  const historyOverlay = document.getElementById('scfSalesHistoryOverlay');
  const historyList = document.getElementById('scfSalesHistoryList');
  const photoFrame = document.querySelector(
    '#fiscalDesktopProductPhoto .fiscal-desktop-product-photo-frame'
  );

  if(!historyOverlay || !historyList || !photoFrame){
    return;
  }

  const MONTHS = [
    'JAN','FEV','MAR','ABR','MAI','JUN',
    'JUL','AGO','SET','OUT','NOV','DEZ'
  ];

  const MONTHS_LONG = [
    'JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO',
    'JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'
  ];

  let dashboard = null;
  let lastData = null;

  function text(value){
    return String(value ?? '').replace(/\s+/g,' ').trim();
  }

  function normalize(value){
    return text(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toUpperCase();
  }

  function number(value){
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatMoney(value){
    return number(value).toLocaleString(
      'pt-BR',
      {
        style:'currency',
        currency:'BRL'
      }
    );
  }

  function formatPercent(value){
    return number(value).toLocaleString(
      'pt-BR',
      {
        minimumFractionDigits:1,
        maximumFractionDigits:1
      }
    ) + '%';
  }

  function paymentKey(value){
    const method = normalize(value);
    if(method.includes('CREDITO')) return 'credito';
    if(method.includes('DEBITO')) return 'debito';
    if(method.includes('DINHEIRO')) return 'dinheiro';
    if(method.includes('PIX')) return 'pix';
    return '';
  }

  function paymentKeysFromLabel(label){
    return Array.from(
      new Set(
        text(label)
          .split(/\s*\+\s*/)
          .map(paymentKey)
          .filter(Boolean)
      )
    );
  }

  function saleDate(sale){
    const value = sale && sale.saleDate;
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  }

  function computeMetrics(sales,year){
    const totals = {
      totalVendas:0,
      totalNfce:0,
      totalNfe:0,
      totalCancelamentos:0,
      totalDevolucoes:0,
      credito:0,
      debito:0,
      dinheiro:0,
      pix:0,
      monthly:new Array(12).fill(0)
    };

    sales.forEach(function(sale){
      const receita = number(sale && sale.totalValue);
      const date = saleDate(sale);

      totals.totalVendas += receita;

      if(date && date.getFullYear() === year){
        totals.monthly[date.getMonth()] += receita;
      }

      if(number(sale && sale.numeroNfce) > 0){
        totals.totalNfce += 1;
      }

      if(sale && sale.nfe55Autorizada === true){
        totals.totalNfe += 1;
      }

      if(normalize(sale && sale.fiscalStatus) === 'CANCELADA'){
        totals.totalCancelamentos += 1;
      }

      const qtyText = text(
        sale && sale.nfe55DevolucoesAutorizadasQuantidade
      );

      const qty = /^\d+$/.test(qtyText)
        ? Number(qtyText)
        : sale && sale.nfe55DevolucaoAutorizada === true
          ? 1
          : 0;

      if(qty > 0){
        totals.totalDevolucoes += qty;
      }

      const paymentParts = sale && Array.isArray(sale.paymentParts)
        ? sale.paymentParts
        : [];

      if(paymentParts.length){
        paymentParts.forEach(function(part){
          const key = paymentKey(
            part && (
              part.method ||
              part.metodo ||
              part.paymentMethod
            )
          );

          const amount = number(
            part && (
              part.amount ??
              part.valor ??
              0
            )
          );

          if(key){
            totals[key] += Math.max(0,amount);
          }
        });

        return;
      }

      const keys = paymentKeysFromLabel(
        sale && sale.paymentMethod
      );

      if(keys.length === 1){
        totals[keys[0]] += receita;
      }else if(keys.length > 1 && receita > 0){
        const quota = receita / keys.length;
        keys.forEach(function(key){
          totals[key] += quota;
        });
      }
    });

    return totals;
  }

  function ensureDashboard(){
    if(dashboard && dashboard.isConnected){
      return dashboard;
    }

    dashboard = document.createElement('section');
    dashboard.id = 'scfHistoryAnnualDashboard';
    dashboard.hidden = true;
    dashboard.setAttribute('aria-label','Resumo anual do Histórico de Vendas');
    photoFrame.appendChild(dashboard);
    return dashboard;
  }

  function addMetric(grid,label,value,classes){
    const card = document.createElement('div');
    card.className = 'scf-history-annual-card' + (classes ? ' ' + classes : '');

    const labelEl = document.createElement('div');
    labelEl.className = 'scf-history-annual-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('div');
    valueEl.className = 'scf-history-annual-value';
    valueEl.textContent = value;

    card.append(labelEl,valueEl);
    grid.appendChild(card);
    return card;
  }

  function addPaymentCard(grid,metrics){
    const total =
      metrics.credito +
      metrics.debito +
      metrics.dinheiro +
      metrics.pix;

    const pct = {
      pix: total > 0 ? (metrics.pix / total) * 100 : 0,
      debito: total > 0 ? (metrics.debito / total) * 100 : 0,
      credito: total > 0 ? (metrics.credito / total) * 100 : 0,
      dinheiro: total > 0 ? (metrics.dinheiro / total) * 100 : 0
    };

    const pixEnd = Math.min(100,pct.pix);
    const debitoEnd = Math.min(100,pixEnd + pct.debito);
    const creditoEnd = Math.min(100,debitoEnd + pct.credito);
    const dinheiroEnd = Math.min(100,creditoEnd + pct.dinheiro);

    const card = document.createElement('div');
    card.className = 'scf-history-annual-card scf-history-annual-payment-card is-wide';

    const donut = document.createElement('div');
    donut.className = 'scf-history-annual-donut';
    donut.style.background = [
      'conic-gradient(',
      '#10b981 0% ' + pixEnd + '%,',
      '#7c3aed ' + pixEnd + '% ' + debitoEnd + '%,',
      '#2563eb ' + debitoEnd + '% ' + creditoEnd + '%,',
      '#f59e0b ' + creditoEnd + '% ' + dinheiroEnd + '%,',
      '#e5e7eb ' + dinheiroEnd + '% 100%',
      ')'
    ].join('');

    const center = document.createElement('div');
    center.className = 'scf-history-annual-donut-center';

    donut.appendChild(center);

    const legend = document.createElement('div');
    legend.className = 'scf-history-annual-payment-legend';

    [
      { key:'pix', label:'PIX', value:pct.pix, color:'#10b981' },
      { key:'debito', label:'DÉBITO', value:pct.debito, color:'#7c3aed' },
      { key:'credito', label:'CRÉDITO', value:pct.credito, color:'#2563eb' },
      { key:'dinheiro', label:'DINHEIRO', value:pct.dinheiro, color:'#f59e0b' }
    ].forEach(function(item){
      const row = document.createElement('div');
      row.className = 'scf-history-annual-payment-row';

      const dot = document.createElement('span');
      dot.className = 'scf-history-annual-payment-dot';
      dot.style.background = item.color;

      const name = document.createElement('span');
      name.className = 'scf-history-annual-payment-name';
      name.textContent = item.label;

      const value = document.createElement('strong');
      value.className = 'scf-history-annual-payment-pct';
      value.textContent = formatPercent(item.value);

      row.append(dot,name,value);
      legend.appendChild(row);
    });

    card.append(donut,legend);
    grid.appendChild(card);
  }

  function addTrend(container,metrics){
    const card = document.createElement('div');
    card.className = 'scf-history-annual-card scf-history-annual-trend is-wide';

    const head = document.createElement('div');
    head.className = 'scf-history-annual-trend-head';
    head.textContent = 'EVOLUÇÃO JAN → DEZ';

    const bars = document.createElement('div');
    bars.className = 'scf-history-annual-bars';

    const max = Math.max.apply(null,metrics.monthly.concat([0]));

    metrics.monthly.forEach(function(value,index){
      const item = document.createElement('div');
      item.className = 'scf-history-annual-bar-item';
      item.title = MONTHS_LONG[index] + ': ' + formatMoney(value);

      const track = document.createElement('div');
      track.className = 'scf-history-annual-bar-track';

      const fill = document.createElement('div');
      fill.className = 'scf-history-annual-bar-fill';
      fill.style.height = max > 0
        ? Math.max(3,(value / max) * 100) + '%'
        : '2px';

      const label = document.createElement('div');
      label.className = 'scf-history-annual-bar-label';
      label.textContent = MONTHS[index];

      track.appendChild(fill);
      item.append(track,label);
      bars.appendChild(item);
    });

    card.append(head,bars);
    container.appendChild(card);
  }

  function hideDashboard(){
    const dash = ensureDashboard();
    dash.hidden = true;
    document.body.classList.remove('scf-history-year-dashboard-on-photo');
  }

  function render(data){
    const year = Number(data && data.year);
    const sales = data && Array.isArray(data.vendas)
      ? data.vendas
      : [];

    /*
     * Guarda a mesma fotografia anual usada para montar as pastas ANTES
     * de validar estados visuais transitórios de outra página. Assim, se
     * ESTOQUE/PDV/CADASTRO/FINANCEIRO ainda estiver removendo suas classes
     * no exato instante do retorno a VENDAS, o dashboard não perde o cache.
     */
    if(Number.isInteger(year)){
      lastData = {
        year,
        vendas:sales.slice()
      };
    }

    const body = document.body;
    const outraPagina = body && (
      body.classList.contains('scf-customer-registration-open') ||
      body.classList.contains('scf-stock-page-open') ||
      body.classList.contains('scf-accounting-export-open')
    );

    if(!desktopMq.matches || outraPagina){
      hideDashboard();
      return;
    }

    if(
      !Number.isInteger(year) ||
      historyOverlay.getAttribute('aria-hidden') !== 'false' ||
      !historyList.querySelector('.scf-sales-history-month-grid')
    ){
      hideDashboard();
      return;
    }

    const metrics = computeMetrics(sales,year);
    const dash = ensureDashboard();
    dash.replaceChildren();

    const topGrid = document.createElement('div');
    topGrid.className = 'scf-history-annual-grid';

    addMetric(
      topGrid,
      'FATURAMENTO ' + year,
      formatMoney(metrics.totalVendas),
      'is-wide is-total'
    );

    addMetric(
      topGrid,
      'VENDAS',
      String(sales.length),
      ''
    );

    addMetric(
      topGrid,
      'TICKET MÉDIO',
      formatMoney(sales.length ? metrics.totalVendas / sales.length : 0),
      ''
    );

    addPaymentCard(topGrid,metrics);

    addMetric(topGrid,'NFC-e EMITIDAS',String(metrics.totalNfce),'');
    addMetric(topGrid,'NF-e EMITIDAS',String(metrics.totalNfe),'');
    addMetric(topGrid,'CANCELAMENTOS',String(metrics.totalCancelamentos),'');
    addMetric(topGrid,'DEVOLUÇÕES',String(metrics.totalDevolucoes),'');

    dash.appendChild(topGrid);
    addTrend(dash,metrics);

    dash.hidden = false;
    document.body.classList.add('scf-history-year-dashboard-on-photo');
    lastData = {
      year,
      vendas:sales.slice()
    };
  }

  window.__scfPdvInfra.eventBus.on('scf:historico-vendas-ano-dados',
    function(event){
      render(event && event.detail ? event.detail : {});
    }
  );

  window.__scfPdvInfra.eventBus.on('scf:historico-vendas-fechado',
    hideDashboard
  );

  historyList.addEventListener(
    'click',
    function(event){
      const folder = event.target && event.target.closest
        ? event.target.closest('.scf-sales-history-month-folder')
        : null;

      if(folder){
        hideDashboard();
      }
    },
    true
  );

  /*
   * RETORNO A VENDAS — DASHBOARD ANUAL PELO MESMO CACHE DAS PASTAS
   *
   * As pastas podem ser restauradas antes de a página anterior terminar de
   * remover sua classe do body. O evento anual já trouxe os dados corretos,
   * porém o render antigo escondia o dashboard e só voltava a desenhá-lo na
   * próxima resposta silenciosa do backend.
   *
   * Este observador apenas sincroniza o estado visual: quando VENDAS + grade
   * de meses estiverem realmente ativos, redesenha imediatamente com lastData.
   * Não consulta backend e não altera o cache do Histórico.
   */
  let retornoDashboardPendente = false;

  function sincronizarDashboardAnualDoCache(){
    if(retornoDashboardPendente){
      return;
    }

    retornoDashboardPendente = true;

    window.requestAnimationFrame(function(){
      retornoDashboardPendente = false;

      if(!lastData || !desktopMq.matches){
        return;
      }

      const body = document.body;
      const outraPagina = body && (
        body.classList.contains('scf-customer-registration-open') ||
        body.classList.contains('scf-stock-page-open') ||
        body.classList.contains('scf-accounting-export-open')
      );

      if(
        outraPagina ||
        historyOverlay.getAttribute('aria-hidden') !== 'false' ||
        !historyList.querySelector('.scf-sales-history-month-grid')
      ){
        return;
      }

      const dash = ensureDashboard();

      if(
        dash.hidden === false &&
        body.classList.contains('scf-history-year-dashboard-on-photo')
      ){
        return;
      }

      render(lastData);
    });
  }

  const retornoDashboardObserver =
    new MutationObserver(
      sincronizarDashboardAnualDoCache
    );

  retornoDashboardObserver.observe(
    document.body,
    {
      attributes:true,
      attributeFilter:['class']
    }
  );

  retornoDashboardObserver.observe(
    historyOverlay,
    {
      attributes:true,
      attributeFilter:['class','aria-hidden']
    }
  );

  retornoDashboardObserver.observe(
    historyList,
    {
      childList:true
    }
  );

  if(typeof desktopMq.addEventListener === 'function'){
    desktopMq.addEventListener('change',function(){
      if(desktopMq.matches && lastData){
        render(lastData);
      }else{
        hideDashboard();
      }
    });
  }else if(typeof desktopMq.addListener === 'function'){
    desktopMq.addListener(function(){
      if(desktopMq.matches && lastData){
        render(lastData);
      }else{
        hideDashboard();
      }
    });
  }
})();
