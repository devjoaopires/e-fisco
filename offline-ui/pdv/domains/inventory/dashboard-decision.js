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

  function safeText(value){
    return String(value ?? '').replace(/\s+/g,' ').trim();
  }

  function formatMoney(value){
    const number = Number(value || 0);
    return new Intl.NumberFormat('pt-BR',{
      style:'currency',
      currency:'BRL'
    }).format(Number.isFinite(number) ? number : 0);
  }

  function normalizeProduct(item){
    if(typeof produtoNormalizado === 'function'){
      try{
        return produtoNormalizado(item);
      }catch(error){}
    }

    const produto = item && typeof item === 'object' ? item : {};
    return {
      codigo: safeText(produto.codigoBarras ?? produto.barcode ?? produto.codigo ?? produto.sku),
      nome: safeText(produto.nome ?? produto.name ?? produto.descricao ?? produto.description),
      quantidade: Number(produto.quantidade ?? produto.estoque ?? produto.stock ?? 0) || 0,
      custo: Number(produto.custo ?? produto.cost ?? produto.valorCusto ?? 0) || 0,
      venda: Number(produto.precoVenda ?? produto.price ?? produto.valorVenda ?? produto.valorUnitario ?? 0) || 0
    };
  }

  function getProductsData(){
    return inventoryDomain.products
      .map(
        inventoryDomain.normalizeProduct
      );
  }

  function ensureDashboard(){
    const right = document.getElementById('scfStockRightPanel');
    if(!right){
      return null;
    }

    let dashboard = document.getElementById('scfStockDashboard');
    if(!dashboard){
      dashboard = document.createElement('div');
      dashboard.id = 'scfStockDashboard';
      dashboard.hidden = true;
      dashboard.innerHTML = ''
        + '<div class="scf-stock-dash-hero">'
        +   '<span class="scf-stock-dash-label">VALOR EM ESTOQUE</span>'
        +   '<strong class="scf-stock-dash-value" id="scfStockDashInventoryValue">R$ 0,00</strong>'
        +   '<div class="scf-stock-dash-meta">'
        +     '<div><span class="scf-stock-dash-label">POTENCIAL DE VENDA</span><strong id="scfStockDashSalesValue">R$ 0,00</strong></div>'
        +     '<div><span class="scf-stock-dash-label">MARGEM POTENCIAL</span><strong id="scfStockDashMarginValue">R$ 0,00</strong></div>'
        +   '</div>'
        + '</div>'
        + '<div class="scf-stock-dash-grid">'
        +   '<div class="scf-stock-dash-card"><span class="scf-stock-dash-label">PRODUTOS</span><strong id="scfStockDashSkuCount">0</strong></div>'
        +   '<div class="scf-stock-dash-card"><span class="scf-stock-dash-label">UNIDADES</span><strong id="scfStockDashUnitCount">0</strong></div>'
        +   '<div class="scf-stock-dash-card is-danger"><span class="scf-stock-dash-label">SEM ESTOQUE</span><strong id="scfStockDashOutCount">0</strong></div>'
        +   '<div class="scf-stock-dash-card is-warning"><span class="scf-stock-dash-label">ESTOQUE BAIXO</span><strong id="scfStockDashLowCount">0</strong></div>'
        + '</div>'
        + '<div class="scf-stock-dash-grid">'
        +   '<div class="scf-stock-dash-card"><span class="scf-stock-dash-label">REPOSIÇÃO SUGERIDA</span><strong id="scfStockDashRestockCount">0</strong></div>'
        +   '<div class="scf-stock-dash-card"><span class="scf-stock-dash-label">TICKET MÉDIO POR SKU</span><strong id="scfStockDashAvgValue">R$ 0,00</strong></div>'
        + '</div>'
        + '<div class="scf-stock-dash-section">'
        +   '<span class="scf-stock-dash-section-title">PRECISAM DE ATENÇÃO</span>'
        +   '<div class="scf-stock-dash-list" id="scfStockDashAttentionList"></div>'
        + '</div>'
        + '<div class="scf-stock-dash-section">'
        +   '<span class="scf-stock-dash-section-title">MAIOR CAPITAL NO ESTOQUE</span>'
        +   '<div class="scf-stock-dash-list" id="scfStockDashCapitalList"></div>'
        + '</div>';

      const title = document.getElementById('scfStockRightTitle');
      if(title && title.parentElement === right){
        title.insertAdjacentElement('afterend', dashboard);
      }else{
        right.insertBefore(dashboard, right.firstChild);
      }
    }

    return dashboard;
  }

  function fillList(container, items, mode){
    if(!container){
      return;
    }

    container.replaceChildren();

    if(!items.length){
      const empty = document.createElement('div');
      empty.className = 'scf-stock-dash-empty';
      empty.textContent = mode === 'attention'
        ? 'Nenhum produto exige atenção imediata.'
        : 'Sem produtos suficientes para destacar capital no estoque.';
      container.appendChild(empty);
      return;
    }

    items.forEach(function(item){
      const row = document.createElement('div');
      row.className = 'scf-stock-dash-item';

      const left = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'scf-stock-dash-item-name';
      name.textContent = item.nome || item.codigo || 'PRODUTO';
      left.appendChild(name);

      const sub = document.createElement('span');
      sub.className = 'scf-stock-dash-item-sub';
      sub.textContent = mode === 'attention'
        ? ('Restam ' + item.quantidade + ' un • venda ' + formatMoney(item.venda))
        : ('Qtd ' + item.quantidade + ' • custo ' + formatMoney(item.custo));
      left.appendChild(sub);

      const badge = document.createElement('span');
      badge.className = 'scf-stock-dash-badge';
      if(mode === 'attention'){
        badge.classList.add(item.quantidade <= 0 ? 'is-danger' : 'is-alert');
        badge.textContent = item.quantidade <= 0
          ? 'ZERADO'
          : (item.quantidade + ' UN');
      }else{
        badge.textContent = formatMoney(item.capital);
      }

      row.appendChild(left);
      row.appendChild(badge);
      container.appendChild(row);
    });
  }

  function updateDashboard(){
    const dashboard = ensureDashboard();
    if(!dashboard){
      return;
    }

    const data = getProductsData();
    const totalSkus = data.length;
    const totalUnits = data.reduce(function(sum, item){ return sum + Math.max(0, Number(item.quantidade || 0)); }, 0);
    const inventoryValue = data.reduce(function(sum, item){ return sum + (Math.max(0, Number(item.quantidade || 0)) * Math.max(0, Number(item.custo || 0))); }, 0);
    const salesValue = data.reduce(function(sum, item){ return sum + (Math.max(0, Number(item.quantidade || 0)) * Math.max(0, Number(item.venda || 0))); }, 0);
    const marginValue = salesValue - inventoryValue;
    const outCount = data.filter(function(item){ return Number(item.quantidade || 0) <= 0; }).length;
    const lowCount = data.filter(function(item){ const q = Number(item.quantidade || 0); return q > 0 && q <= 3; }).length;
    const restockCount = outCount + lowCount;
    const avgSkuValue = totalSkus ? (salesValue / totalSkus) : 0;

    const setText = function(id, value){
      const node = document.getElementById(id);
      if(node){
        node.textContent = value;
      }
    };

    setText('scfStockDashInventoryValue', formatMoney(inventoryValue));
    setText('scfStockDashSalesValue', formatMoney(salesValue));
    setText('scfStockDashMarginValue', formatMoney(marginValue));
    setText('scfStockDashSkuCount', String(totalSkus));
    setText('scfStockDashUnitCount', String(totalUnits));
    setText('scfStockDashOutCount', String(outCount));
    setText('scfStockDashLowCount', String(lowCount));
    setText('scfStockDashRestockCount', String(restockCount));
    setText('scfStockDashAvgValue', formatMoney(avgSkuValue));

    const attentionItems = data
      .filter(function(item){ return Number(item.quantidade || 0) <= 3; })
      .sort(function(a,b){
        const aq = Number(a.quantidade || 0);
        const bq = Number(b.quantidade || 0);
        if(aq !== bq){
          return aq - bq;
        }
        return safeText(a.nome).localeCompare(safeText(b.nome), 'pt-BR');
      })
      .slice(0,3);

    const capitalItems = data
      .map(function(item){
        return Object.assign({}, item, {
          capital: Math.max(0, Number(item.quantidade || 0)) * Math.max(0, Number(item.custo || 0))
        });
      })
      .filter(function(item){ return item.capital > 0; })
      .sort(function(a,b){ return b.capital - a.capital; })
      .slice(0,3);

    fillList(document.getElementById('scfStockDashAttentionList'), attentionItems, 'attention');
    fillList(document.getElementById('scfStockDashCapitalList'), capitalItems, 'capital');
  }

  function syncVisibility(){
    const right = document.getElementById('scfStockRightPanel');
    if(!right){
      return;
    }

    const dashboard = ensureDashboard();
    const body = document.body;
    const neutral = body.classList.contains('scf-stock-page-open') && body.classList.contains('scf-stock-neutral-mode');
    const status = document.getElementById('scfStockStatus');

    if(dashboard){
      dashboard.hidden = !neutral;
    }

    if(status){
      status.hidden = neutral;
    }

    const title = document.getElementById('scfStockRightTitle');
    if(title){
      const xmlMode =
        body.classList.contains(
          'scf-stock-xml-mode'
        );

      const cadastroProduto =
        body.classList.contains('scf-stock-page-open') &&
        !neutral &&
        !xmlMode;

      title.textContent =
        neutral
          ? 'VISÃO GERAL DO ESTOQUE'
          : (
              xmlMode
                ? 'IMPORTAR XML'
                : (
                    cadastroProduto
                      ? (
                          produtoEdicaoSelecionado
                            ? 'ATUALIZAR PRODUTO'
                            : 'CADASTRO DE PRODUTO'
                        )
                      : 'ESTOQUE'
                  )
            );
    }
  }

  let raf = 0;
  function scheduleSync(){
    if(raf){
      return;
    }
    raf = requestAnimationFrame(function(){
      raf = 0;
      updateDashboard();
      syncVisibility();
    });
  }

  const observer = new MutationObserver(function(){
    scheduleSync();
  });

  observer.observe(document.documentElement, {
    subtree:true,
    childList:true,
    attributes:true,
    attributeFilter:['class','hidden','aria-hidden','style','value']
  });

  window.__scfPdvInfra.shellBridge.onMessage( function(){
    scheduleSync();
  });

  document.addEventListener('input', function(event){
    const target = event.target;
    if(target && target.id === 'scfStockSearch'){
      scheduleSync();
    }
  }, true);

  scheduleSync();
})();
