(function(){
  'use strict';

  const inventoryDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.inventory;

  if(!inventoryDomain){
    throw new Error(
      'PDV inventory domain indisponivel.'
    );
  }

  var STORAGE_KEY =
    window.__scfPdvContracts.storage.session.keys.stockAnnualSalesDashboardHtml;
  var stockDash = null;
  var sourceObserver = null;
  var raf = 0;

  function getFrame(){
    return document.querySelector('#fiscalDesktopProductPhoto .fiscal-desktop-product-photo-frame');
  }

  function getSource(){
    return document.getElementById('scfHistoryAnnualDashboard');
  }

  function currentYear(){
    var select = document.getElementById('scfSalesHistoryYearSelect');
    var year = select ? Number(select.value) : new Date().getFullYear();
    return Number.isInteger(year) ? year : new Date().getFullYear();
  }

  function placeholderMarkup(){
    var year = currentYear();
    var months = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
    var bars = months.map(function(month){
      return ''
        + '<div class="scf-history-annual-bar-item">'
        +   '<div class="scf-history-annual-bar-track"><div class="scf-history-annual-bar-fill" style="height:2px"></div></div>'
        +   '<div class="scf-history-annual-bar-label">' + month + '</div>'
        + '</div>';
    }).join('');

    return ''
      + '<div class="scf-history-annual-grid">'
      +   '<div class="scf-history-annual-card is-wide is-total" data-scf-stock-value-card="true"><div class="scf-history-annual-label">VALOR EM ESTOQUE</div><div class="scf-history-annual-value" data-scf-stock-value="true">R$ 0,00</div></div>'
      +   '<div class="scf-history-annual-card" data-scf-stock-products-card="true"><div class="scf-history-annual-label">PRODUTOS CADASTRADOS</div><div class="scf-history-annual-value" data-scf-stock-products="true">0</div></div>'
      +   '<div class="scf-history-annual-card" data-scf-stock-margin-card="true"><div class="scf-history-annual-label">MARGEM POTENCIAL</div><div class="scf-history-annual-value" data-scf-stock-margin="true">R$ 0,00</div></div>'
      +   '<div class="scf-history-annual-card scf-history-annual-payment-card is-wide" data-scf-stock-indicators-card="true">'
      +     '<div class="scf-history-annual-donut" style="background:conic-gradient(#e5e7eb 0% 100%)">'
      +       '<div class="scf-history-annual-donut-center">'
      +         '<span class="scf-history-annual-donut-total-label">Total</span>'
      +         '<strong class="scf-history-annual-donut-total-value" data-scf-stock-total-products="true">0</strong>'
      +       '</div>'
      +     '</div>'
      +     '<div class="scf-history-annual-payment-legend">'
      +       '<div class="scf-history-annual-payment-row"><span class="scf-history-annual-payment-dot" style="background:#32c48d"></span><span class="scf-history-annual-payment-name">Saudável</span><span class="scf-history-annual-payment-count" data-scf-stock-healthy-count="true">0</span><strong class="scf-history-annual-payment-pct is-healthy" data-scf-stock-healthy-pct="true">0%</strong></div>'
      +       '<div class="scf-history-annual-payment-row"><span class="scf-history-annual-payment-dot" style="background:#f2a900"></span><span class="scf-history-annual-payment-name">Estoque baixo</span><span class="scf-history-annual-payment-count" data-scf-stock-low-count="true">0</span><strong class="scf-history-annual-payment-pct is-low" data-scf-stock-low-pct="true">0%</strong></div>'
      +       '<div class="scf-history-annual-payment-row"><span class="scf-history-annual-payment-dot" style="background:#ef6258"></span><span class="scf-history-annual-payment-name">Sem estoque</span><span class="scf-history-annual-payment-count" data-scf-stock-out-count="true">0</span><strong class="scf-history-annual-payment-pct is-out" data-scf-stock-out-pct="true">0%</strong></div>'
      +       '<div class="scf-history-annual-payment-row"><span class="scf-history-annual-payment-dot" style="background:#8c93a3"></span><span class="scf-history-annual-payment-name">Sem preço de venda</span><span class="scf-history-annual-payment-count" data-scf-stock-no-price-count="true">0</span><strong class="scf-history-annual-payment-pct is-no-price" data-scf-stock-no-price-pct="true">0%</strong></div>'
      +     '</div>'
      +   '</div>'
      + '</div>'
      + '<div class="scf-stock-recommend-card" data-scf-stock-actions-card="true">'
      +   '<div class="scf-stock-recommend-title">AÇÕES RECOMENDADAS</div>'
      +   '<div class="scf-stock-recommend-item" data-scf-stock-price-action="true">'
      +     '<span class="scf-stock-recommend-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M3 11.5V5a2 2 0 0 1 2-2h6.5a2 2 0 0 1 1.41.59l7.5 7.5a2 2 0 0 1 0 2.82l-6.68 6.68a2 2 0 0 1-2.82 0l-7.5-7.5A2 2 0 0 1 3 11.5Zm4-4.75A1.25 1.25 0 1 0 7 9.25a1.25 1.25 0 0 0 0-2.5Z"/></svg></span>'
      +     '<span class="scf-stock-recommend-text">DEFINIÇÃO DE PREÇO EM PRODUTOS</span>'
      +     '<span class="scf-stock-recommend-status" data-scf-stock-price-action-dot="true"></span>'
      +   '</div>'
      +   '<div class="scf-stock-recommend-item" data-scf-stock-low-action="true">'
      +     '<span class="scf-stock-recommend-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M7 4h-2l-1 2H2v2h1l2.2 7.1A2 2 0 0 0 7.1 16h8.8a2 2 0 0 0 1.9-1.4L20 8H6.4l-.5-2ZM8 18a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/></svg></span>'
      +     '<span class="scf-stock-recommend-text">REPOR PRODUTOS COM ESTOQUE BAIXO</span>'
      +     '<span class="scf-stock-recommend-status" data-scf-stock-low-action-dot="true"></span>'
      +   '</div>'
      +   '<div class="scf-stock-recommend-item" data-scf-stock-negative-margin-action="true">'
      +     '<span class="scf-stock-recommend-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M3 17h3.59l3.7-3.71 4 4 6.3-6.29V14H22V7h-7v1.41h3.17l-4.88 4.88-4-4L4 14.59H3V17Z"/></svg></span>'
      +     '<span class="scf-stock-recommend-text">REVISAR ITENS COM MARGENS NEGATIVAS</span>'
      +     '<span class="scf-stock-recommend-status" data-scf-stock-negative-margin-action-dot="true"></span>'
      +   '</div>'
      + '</div>'
      + '<div class="scf-stock-best-seller-card" data-scf-stock-best-seller-card="true">'
      +   '<div class="scf-stock-best-seller-icon-wrap"><span class="scf-stock-best-seller-icon" aria-hidden="true"></span></div>'
      +   '<div class="scf-stock-best-seller-main">'
      +     '<div class="scf-stock-best-seller-kicker">PRODUTO MAIS VENDIDO</div>'
      +     '<div class="scf-stock-best-seller-name">SEM VENDAS NO MÊS</div>'
      +     '<div class="scf-stock-best-seller-meta">'
      +       '<span class="scf-stock-best-seller-meta-item"><svg class="scf-stock-best-seller-meta-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2ZM1 2v2h2l3.6 7.59-1.35 2.45A1.99 1.99 0 0 0 7 17h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03L21 4H5.21l-.94-2H1Zm16 16c-1.1 0-1.99.9-1.99 2S15.9 22 17 22s2-.9 2-2-.9-2-2-2Z"/></svg><span>0 vendas no mês</span></span>'
      +       '<span class="scf-stock-best-seller-sep"></span>'
      +       '<span class="scf-stock-best-seller-meta-item"><svg class="scf-stock-best-seller-meta-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 1C5.92 1 1 5.92 1 12s4.92 11 11 11 11-4.92 11-11S18.08 1 12 1Zm1 17.93c-2.83.48-5.45-1.46-5.93-4.29-.05-.31.16-.61.47-.66.31-.05.61.16.66.47.38 2.2 2.47 3.71 4.67 3.33 1.6-.27 2.89-1.56 3.16-3.16.05-.31.35-.52.66-.47.31.05.52.35.47.66-.39 2.29-2.18 4.08-4.47 4.47ZM16.5 11H13v2c0 .55-.45 1-1 1s-1-.45-1-1v-2H7.5c-.55 0-1-.45-1-1s.45-1 1-1H11V7.5c0-.55.45-1 1-1s1 .45 1 1V9h3.5c.55 0 1 .45 1 1s-.45 1-1 1Z"/></svg><span>Faturamento R$ 0,00</span></span>'
      +     '</div>'
      +   '</div>'
      +   '<div class="scf-stock-best-seller-side">'
      +     '<div class="scf-stock-best-seller-rank">TOP 1</div>'
      +     '<div class="scf-stock-best-seller-trend is-flat"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M5 11h14v2H5z"/></svg><span>0%</span></div>'
      +   '</div>'
      + '</div>';
  }

  function formatStockMoney(value){
    var number = Number(value) || 0;

    try{
      return new Intl.NumberFormat(
        'pt-BR',
        {
          style:'currency',
          currency:'BRL'
        }
      ).format(number);
    }catch(error){
      return 'R$ ' +
        number
          .toFixed(2)
          .replace('.',',');
    }
  }

  function estimatedStockValue(){
    try{
      if(typeof inventoryDomain.getEstimatedValue === 'function'){
        return Math.max(
          0,
          Number(inventoryDomain.getEstimatedValue()) || 0
        );
      }
    }catch(error){}

    return 0;
  }

  function registeredStockProducts(){
    try{
      if(typeof inventoryDomain.getRegisteredProducts === 'function'){
        return Math.max(
          0,
          Math.round(
            Number(inventoryDomain.getRegisteredProducts()) || 0
          )
        );
      }
    }catch(error){}

    return 0;
  }

  function estimatedStockPotentialMargin(){
    try{
      if(typeof inventoryDomain.getPotentialMargin === 'function'){
        return Number(inventoryDomain.getPotentialMargin()) || 0;
      }
    }catch(error){}

    return 0;
  }

  function stockIndicators(){
    try{
      if(typeof inventoryDomain.getIndicators === 'function'){
        var data = inventoryDomain.getIndicators() || {};
        var total = Math.max(0, Math.round(Number(data.total) || 0));

        function toInt(value){
          return Math.max(0, Math.round(Number(value) || 0));
        }

        function pct(value){
          return total > 0
            ? Math.round((toInt(value) / total) * 100)
            : 0;
        }

        return {
          total: total,
          saudavel: toInt(data.saudavel),
          baixo: toInt(data.baixo),
          semEstoque: toInt(data.semEstoque),
          semPreco: toInt(data.semPreco),
          margemNegativa: toInt(data.margemNegativa),
          pctSaudavel: pct(data.saudavel),
          pctBaixo: pct(data.baixo),
          pctSemEstoque: pct(data.semEstoque),
          pctSemPreco: pct(data.semPreco)
        };
      }
    }catch(error){}

    return {
      total: 0,
      saudavel: 0,
      baixo: 0,
      semEstoque: 0,
      semPreco: 0,
      margemNegativa: 0,
      pctSaudavel: 0,
      pctBaixo: 0,
      pctSemEstoque: 0,
      pctSemPreco: 0
    };
  }

  function renderStockIndicators(card){
    if(!card) return;

    var data = stockIndicators();
    var total = data.total;
    var donut = card.querySelector('.scf-history-annual-donut');
    var center = card.querySelector('.scf-history-annual-donut-center');
    var legend = card.querySelector('.scf-history-annual-payment-legend');

    card.setAttribute('data-scf-stock-indicators-card','true');

    if(!donut){
      donut = document.createElement('div');
      donut.className = 'scf-history-annual-donut';
      card.prepend(donut);
    }

    if(!center || center.parentElement !== donut){
      center = document.createElement('div');
      center.className = 'scf-history-annual-donut-center';
      donut.replaceChildren(center);
    }

    center.innerHTML = ''
      + '<span class="scf-history-annual-donut-total-label">Total</span>'
      + '<strong class="scf-history-annual-donut-total-value" data-scf-stock-total-products="true">' + total + '</strong>';

    if(!legend){
      legend = document.createElement('div');
      legend.className = 'scf-history-annual-payment-legend';
      card.appendChild(legend);
    }

    var segmentsTotal = data.saudavel + data.baixo + data.semEstoque + data.semPreco;
    if(segmentsTotal > 0){
      var healthyEnd = (data.saudavel / segmentsTotal) * 100;
      var lowEnd = healthyEnd + (data.baixo / segmentsTotal) * 100;
      var outEnd = lowEnd + (data.semEstoque / segmentsTotal) * 100;
      var noPriceEnd = 100;
      donut.style.background = 'conic-gradient(' +
        '#32c48d 0% ' + healthyEnd + '%,' +
        '#f2a900 ' + healthyEnd + '% ' + lowEnd + '%,' +
        '#ef6258 ' + lowEnd + '% ' + outEnd + '%,' +
        '#8c93a3 ' + outEnd + '% ' + noPriceEnd + '%)';
    }else{
      donut.style.background = 'conic-gradient(#e5e7eb 0% 100%)';
    }

    var rows = [
      { label:'Saudável', count:data.saudavel, pct:data.pctSaudavel, color:'#32c48d', cls:'is-healthy', countAttr:'data-scf-stock-healthy-count', pctAttr:'data-scf-stock-healthy-pct' },
      { label:'Estoque baixo', count:data.baixo, pct:data.pctBaixo, color:'#f2a900', cls:'is-low', countAttr:'data-scf-stock-low-count', pctAttr:'data-scf-stock-low-pct' },
      { label:'Sem estoque', count:data.semEstoque, pct:data.pctSemEstoque, color:'#ef6258', cls:'is-out', countAttr:'data-scf-stock-out-count', pctAttr:'data-scf-stock-out-pct' },
      { label:'Sem preço de venda', count:data.semPreco, pct:data.pctSemPreco, color:'#8c93a3', cls:'is-no-price', countAttr:'data-scf-stock-no-price-count', pctAttr:'data-scf-stock-no-price-pct' }
    ];

    legend.innerHTML = '';
    rows.forEach(function(item){
      var row = document.createElement('div');
      row.className = 'scf-history-annual-payment-row';

      var dot = document.createElement('span');
      dot.className = 'scf-history-annual-payment-dot';
      dot.style.background = item.color;

      var name = document.createElement('span');
      name.className = 'scf-history-annual-payment-name';
      name.textContent = item.label;

      var count = document.createElement('span');
      count.className = 'scf-history-annual-payment-count';
      count.setAttribute(item.countAttr,'true');
      count.textContent = String(item.count);

      var pct = document.createElement('strong');
      pct.className = 'scf-history-annual-payment-pct ' + item.cls;
      pct.setAttribute(item.pctAttr,'true');
      pct.textContent = String(item.pct) + '%';

      row.append(dot, name, count, pct);
      legend.appendChild(row);
    });
  }

  function renderRecommendedActions(dash){
    if(!dash) return;

    var grid = dash.querySelector('.scf-history-annual-grid');
    if(grid){
      Array.from(grid.children).slice(4).forEach(function(card){
        card.remove();
      });
    }

    dash.querySelectorAll('.scf-history-annual-trend').forEach(function(card){
      card.remove();
    });

    var wrap = dash.querySelector('[data-scf-stock-actions-card="true"]');
    if(!wrap){
      wrap = document.createElement('div');
      wrap.className = 'scf-stock-recommend-card';
      wrap.setAttribute('data-scf-stock-actions-card','true');
      dash.appendChild(wrap);
    }

    var indicators = stockIndicators();
    var hasPendingPriceDefinition = indicators.semPreco > 0;
    var hasLowStockToReplenish = indicators.baixo > 0;
    var hasNegativeMarginItems = indicators.margemNegativa > 0;

    wrap.innerHTML = ''
      + '<div class="scf-stock-recommend-title">AÇÕES RECOMENDADAS</div>'
      + '<div class="scf-stock-recommend-item" data-scf-stock-price-action="true">'
      +   '<span class="scf-stock-recommend-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M3 11.5V5a2 2 0 0 1 2-2h6.5a2 2 0 0 1 1.41.59l7.5 7.5a2 2 0 0 1 0 2.82l-6.68 6.68a2 2 0 0 1-2.82 0l-7.5-7.5A2 2 0 0 1 3 11.5Zm4-4.75A1.25 1.25 0 1 0 7 9.25a1.25 1.25 0 0 0 0-2.5Z"/></svg></span>'
      +   '<span class="scf-stock-recommend-text">DEFINIÇÃO DE PREÇO EM PRODUTOS</span>'
      +   '<span class="scf-stock-recommend-status' + (hasPendingPriceDefinition ? '' : ' is-ok') + '" data-scf-stock-price-action-dot="true"></span>'
      + '</div>'
      + '<div class="scf-stock-recommend-item" data-scf-stock-low-action="true">'
      +   '<span class="scf-stock-recommend-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M7 4h-2l-1 2H2v2h1l2.2 7.1A2 2 0 0 0 7.1 16h8.8a2 2 0 0 0 1.9-1.4L20 8H6.4l-.5-2ZM8 18a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/></svg></span>'
      +   '<span class="scf-stock-recommend-text">REPOR PRODUTOS COM ESTOQUE BAIXO</span>'
      +   '<span class="scf-stock-recommend-status' + (hasLowStockToReplenish ? ' is-low' : ' is-ok') + '" data-scf-stock-low-action-dot="true"></span>'
      + '</div>'
      + '<div class="scf-stock-recommend-item" data-scf-stock-negative-margin-action="true">'
      +   '<span class="scf-stock-recommend-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M3 17h3.59l3.7-3.71 4 4 6.3-6.29V14H22V7h-7v1.41h3.17l-4.88 4.88-4-4L4 14.59H3V17Z"/></svg></span>'
      +   '<span class="scf-stock-recommend-text">REVISAR ITENS COM MARGENS NEGATIVAS</span>'
      +   '<span class="scf-stock-recommend-status' + (hasNegativeMarginItems ? ' is-negative' : ' is-ok') + '" data-scf-stock-negative-margin-action-dot="true"></span>'
      + '</div>';
  }


  function stockHistoryText(value){
    return String(value == null ? '' : value)
      .replace(/\s+/g,' ')
      .trim();
  }

  function stockHistoryNumber(value){
    return Number(value) || 0;
  }

  function stockHistoryMoney(value){
    return formatStockMoney(
      Math.max(0, stockHistoryNumber(value))
    );
  }

  function stockEscapeHtml(value){
    return String(value == null ? '' : value)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function stockMonthStart(date){
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function stockNextMonthStart(date){
    return new Date(date.getFullYear(), date.getMonth() + 1, 1);
  }

  function stockPreviousMonth(date){
    return new Date(date.getFullYear(), date.getMonth() - 1, 1);
  }

  function stockSaleDate(sale){
    var raw = sale && (
      sale.savedAt ||
      sale.createdAt ||
      sale.date ||
      sale.emittedAt
    );

    if(!raw) return null;

    var date = new Date(raw);
    return Number.isNaN(date.getTime())
      ? null
      : date;
  }

  function stockSalesHistory(){
    try{
      var history = JSON.parse(
        window.__scfPdvInfra.storage.local.getItem(window.__scfPdvContracts.storage.local.keys.fiscalSales) || '[]'
      );

      return Array.isArray(history)
        ? history
        : [];
    }catch(error){
      return [];
    }
  }

  function aggregateBestSellerMonth(date){
    var start = stockMonthStart(date);
    var end = stockNextMonthStart(date);
    var map = Object.create(null);

    stockSalesHistory().forEach(function(sale){
      var saleDate = stockSaleDate(sale);
      if(!saleDate || saleDate < start || saleDate >= end) return;

      var products = Array.isArray(sale && sale.products)
        ? sale.products
        : [];

      products.forEach(function(product){
        if(!product) return;

        var name = stockHistoryText(
          product.name ||
          product.nome ||
          product.descricao ||
          product.description ||
          product.productName
        ) || 'PRODUTO';

        var key = stockHistoryText(
          product.productFiscalId ||
          product.productCode ||
          product.codigo ||
          product.gtin ||
          product.barcode ||
          name
        ).toUpperCase();

        var qty = Math.max(
          0,
          stockHistoryNumber(
            product.quantity || product.quantidade
          )
        );

        var total = stockHistoryNumber(product.total);
        if(total <= 0){
          total = qty * Math.max(
            0,
            stockHistoryNumber(
              product.unitValue ||
              product.valorUnitario
            )
          );
        }

        if(!qty && !total) return;

        if(!map[key]){
          map[key] = {
            key: key,
            name: name,
            qty: 0,
            revenue: 0
          };
        }

        map[key].qty += qty;
        map[key].revenue += Math.max(0,total);
      });
    });

    return Object.keys(map)
      .map(function(key){ return map[key]; })
      .sort(function(a,b){
        if(b.qty !== a.qty) return b.qty - a.qty;
        if(b.revenue !== a.revenue) return b.revenue - a.revenue;
        return String(a.name).localeCompare(String(b.name),'pt-BR');
      });
  }

  function bestSellerSnapshot(){
    var now = new Date();
    var current = aggregateBestSellerMonth(now);
    var top = current[0] || {
      key: '',
      name: 'SEM VENDAS NO MÊS',
      qty: 0,
      revenue: 0
    };

    var previous = aggregateBestSellerMonth(
      stockPreviousMonth(now)
    );

    var previousMap = Object.create(null);
    previous.forEach(function(item){
      previousMap[item.key] = item;
    });

    var previousQty = previousMap[top.key]
      ? Math.max(0, stockHistoryNumber(previousMap[top.key].qty))
      : 0;

    var growth = 0;
    if(top.qty > 0 && previousQty > 0){
      growth = ((top.qty - previousQty) / previousQty) * 100;
    }else if(top.qty > 0 && previousQty === 0){
      growth = 100;
    }else if(top.qty === 0 && previousQty > 0){
      growth = -100;
    }

    var trendClass = 'is-flat';
    if(growth > 0.49) trendClass = 'is-up';
    else if(growth < -0.49) trendClass = 'is-down';

    var trendIcon = trendClass === 'is-down'
      ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19 13H5v-2h14m0 0-4-4m4 4-4 4"/></svg>'
      : trendClass === 'is-up'
        ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 15.5 9 10l4 4 7-7 1.4 1.4L13 16.8l-4-4-3.6 3.6L4 15.5Z"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M5 11h14v2H5z"/></svg>';

    var growthText = (
      growth > 0
        ? '+' + Math.round(growth)
        : String(Math.round(growth))
    ) + '%';

    return {
      name: stockHistoryText(top.name || 'PRODUTO') || 'PRODUTO',
      qty: Math.max(0, Math.round(stockHistoryNumber(top.qty))),
      revenue: Math.max(0, stockHistoryNumber(top.revenue)),
      trendClass: trendClass,
      trendIcon: trendIcon,
      growthText: growthText
    };
  }

  function renderBestSellerCard(dash){
    if(!dash) return;

    var wrap = dash.querySelector('[data-scf-stock-best-seller-card="true"]');
    if(!wrap){
      wrap = document.createElement('div');
      wrap.className = 'scf-stock-best-seller-card';
      wrap.setAttribute('data-scf-stock-best-seller-card','true');
      dash.appendChild(wrap);
    }

    var data = bestSellerSnapshot();

    wrap.innerHTML = ''
      + '<div class="scf-stock-best-seller-icon-wrap"><span class="scf-stock-best-seller-icon" aria-hidden="true"></span></div>'
      + '<div class="scf-stock-best-seller-main">'
      +   '<div class="scf-stock-best-seller-kicker">PRODUTO MAIS VENDIDO</div>'
      +   '<div class="scf-stock-best-seller-name">' + stockEscapeHtml(data.name) + '</div>'
      +   '<div class="scf-stock-best-seller-meta">'
      +     '<span class="scf-stock-best-seller-meta-item"><svg class="scf-stock-best-seller-meta-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2ZM1 2v2h2l3.6 7.59-1.35 2.45A1.99 1.99 0 0 0 7 17h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03L21 4H5.21l-.94-2H1Zm16 16c-1.1 0-1.99.9-1.99 2S15.9 22 17 22s2-.9 2-2-.9-2-2-2Z"/></svg><span>' + data.qty + ' vendas no mês</span></span>'
      +     '<span class="scf-stock-best-seller-sep"></span>'
      +     '<span class="scf-stock-best-seller-meta-item"><svg class="scf-stock-best-seller-meta-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 1C5.92 1 1 5.92 1 12s4.92 11 11 11 11-4.92 11-11S18.08 1 12 1Zm1 17.93c-2.83.48-5.45-1.46-5.93-4.29-.05-.31.16-.61.47-.66.31-.05.61.16.66.47.38 2.2 2.47 3.71 4.67 3.33 1.6-.27 2.89-1.56 3.16-3.16.05-.31.35-.52.66-.47.31.05.52.35.47.66-.39 2.29-2.18 4.08-4.47 4.47ZM16.5 11H13v2c0 .55-.45 1-1 1s-1-.45-1-1v-2H7.5c-.55 0-1-.45-1-1s.45-1 1-1H11V7.5c0-.55.45-1 1-1s1 .45 1 1V9h3.5c.55 0 1 .45 1 1s-.45 1-1 1Z"/></svg><span>Faturamento ' + stockHistoryMoney(data.revenue) + '</span></span>'
      +   '</div>'
      + '</div>'
      + '<div class="scf-stock-best-seller-side">'
      +   '<div class="scf-stock-best-seller-rank">TOP 1</div>'
      +   '<div class="scf-stock-best-seller-trend ' + data.trendClass + '">' + data.trendIcon + '<span>' + data.growthText + '</span></div>'
      + '</div>';
  }

  function syncStockMetrics(){
    var dash = ensureStockDashboard();
    if(!dash) return;

    var cards = dash.querySelectorAll(
      '.scf-history-annual-grid > .scf-history-annual-card'
    );

    var valueCard = cards[0] || null;
    var productsCard = cards[1] || null;
    var marginCard = cards[2] || null;
    var indicatorsCard = cards[3] || null;

    function setMetric(card,cardAttr,valueAttr,labelText,valueText){
      if(!card) return;

      card.setAttribute(
        cardAttr,
        'true'
      );

      var label = card.querySelector(
        '.scf-history-annual-label'
      );

      var value = card.querySelector(
        '.scf-history-annual-value'
      );

      if(label){
        label.textContent = labelText;
      }

      if(value){
        value.setAttribute(
          valueAttr,
          'true'
        );
        value.textContent = valueText;
      }
    }

    setMetric(
      valueCard,
      'data-scf-stock-value-card',
      'data-scf-stock-value',
      'VALOR EM ESTOQUE',
      formatStockMoney(
        estimatedStockValue()
      )
    );

    setMetric(
      productsCard,
      'data-scf-stock-products-card',
      'data-scf-stock-products',
      'PRODUTOS CADASTRADOS',
      String(
        registeredStockProducts()
      )
    );

    setMetric(
      marginCard,
      'data-scf-stock-margin-card',
      'data-scf-stock-margin',
      'MARGEM POTENCIAL',
      formatStockMoney(
        estimatedStockPotentialMargin()
      )
    );

    renderStockIndicators(
      indicatorsCard
    );

    renderRecommendedActions(
      dash
    );

    renderBestSellerCard(
      dash
    );
  }

  function ensureStockDashboard(){
    var frame = getFrame();
    if(!frame) return null;

    if(stockDash && stockDash.isConnected){
      return stockDash;
    }

    stockDash = document.getElementById('scfStockAnnualDashboard');
    if(!stockDash){
      stockDash = document.createElement('section');
      stockDash.id = 'scfStockAnnualDashboard';
      stockDash.setAttribute('aria-label','Cópia da dashboard anual de vendas');
      stockDash.hidden = true;
      frame.appendChild(stockDash);
    }else if(stockDash.parentElement !== frame){
      frame.appendChild(stockDash);
    }

    return stockDash;
  }

  function saveSourceMarkup(){
    var source = getSource();
    if(!source || !source.children.length) return '';

    var html = source.innerHTML;
    if(!html) return '';

    try{ window.__scfPdvInfra.storage.session.setItem(STORAGE_KEY,html); }catch(error){}
    return html;
  }

  function lastMarkup(){
    var sourceHtml = saveSourceMarkup();
    if(sourceHtml) return sourceHtml;

    try{
      var stored = window.__scfPdvInfra.storage.session.getItem(STORAGE_KEY);
      if(stored) return stored;
    }catch(error){}

    return placeholderMarkup();
  }

  function copyNow(){
    var dash = ensureStockDashboard();
    if(!dash) return;

    var html = lastMarkup();
    if(html && dash.innerHTML !== html){
      dash.innerHTML = html;
    }

    syncStockMetrics();
  }

  function syncVisibility(){
    var body = document.body;
    var dash = ensureStockDashboard();
    if(!body || !dash) return;

    var show = body.classList.contains('scf-stock-page-open') &&
               body.classList.contains('scf-stock-neutral-mode');

    if(show){
      copyNow();
      dash.hidden = false;
    }else{
      dash.hidden = true;
    }
  }

  function observeSource(){
    var source = getSource();
    if(!source || sourceObserver) return;

    sourceObserver = new MutationObserver(function(){
      saveSourceMarkup();
      if(document.body && document.body.classList.contains('scf-stock-page-open')){
        copyNow();
      }
    });

    sourceObserver.observe(source,{childList:true,subtree:true,attributes:true,characterData:true});
  }

  function schedule(){
    if(raf) return;
    raf = requestAnimationFrame(function(){
      raf = 0;
      observeSource();
      syncVisibility();
    });
  }

  window.__scfPdvInfra.eventBus.on('scf:historico-vendas-ano-dados',function(){
    requestAnimationFrame(function(){
      saveSourceMarkup();
      copyNow();
    });
  });

  window.__scfPdvInfra.eventBus.on('scf:historico-vendas-renderizado',schedule);
  window.__scfPdvInfra.eventBus.on('scf:estoque-produtos-atualizados',function(){
    syncStockMetrics();
  });
  document.addEventListener('DOMContentLoaded',schedule,{once:true});
  window.addEventListener('load',schedule,{once:true});

  new MutationObserver(schedule).observe(document.documentElement,{
    childList:true,
    subtree:true,
    attributes:true,
    attributeFilter:['class','hidden']
  });

  schedule();
})();
