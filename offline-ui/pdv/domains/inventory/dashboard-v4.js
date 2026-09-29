(function(){
  'use strict';

  function txt(v){ return String(v ?? '').replace(/\s+/g,' ').trim(); }
  function num(v){
    const raw = txt(v).replace(/R\$/gi,'').replace(/\./g,'').replace(/,/g,'.').replace(/[^0-9.-]/g,'');
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  function money(v){
    return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v || 0));
  }
  function parseRows(){
    return Array.from(document.querySelectorAll('#scfStockList .scf-stock-row')).map(function(row){
      const c = Array.from(row.children || []);
      return {
        codigo: txt(c[0] && c[0].textContent),
        nome: txt(c[1] && c[1].textContent),
        quantidade: Math.max(0, Math.round(num(c[2] && c[2].textContent))),
        custo: Math.max(0, num(c[3] && c[3].textContent)),
        venda: Math.max(0, num(c[4] && c[4].textContent))
      };
    }).filter(function(item){ return item.codigo || item.nome; });
  }

  function ensure(){
    const panel = document.getElementById('scfStockRightPanel');
    if(!panel){ return null; }
    let dash = document.getElementById('scfStockDashboard');
    if(!dash){
      dash = document.createElement('div');
      dash.id = 'scfStockDashboard';
      panel.prepend(dash);
    }
    let root = document.getElementById('scfStockDashV4Root');
    if(!root){
      root = document.createElement('div');
      root.id = 'scfStockDashV4Root';
      root.innerHTML = ''
        + '<div id="scfStockDashV4Hero" class="scf-stock-v4-card">'
        +   '<span class="kicker">Valor em estoque</span>'
        +   '<strong class="main" id="scfStockDashV4Value">R$ 0,00</strong>'
        +   '<div class="subgrid">'
        +     '<div><span class="label">Potencial de venda</span><span class="value" id="scfStockDashV4Potential">R$ 0,00</span></div>'
        +     '<div><span class="label">Margem potencial</span><span class="value" id="scfStockDashV4Margin">R$ 0,00</span></div>'
        +   '</div>'
        + '</div>'
        + '<div id="scfStockDashV4Donut" class="scf-stock-v4-card">'
        +   '<div class="scf-stock-v4-donut-box">'
        +     '<div class="scf-stock-v4-donut" id="scfStockDashV4DonutChart">'
        +       '<div class="scf-stock-v4-donut-center"><span class="small">Reposição</span><strong id="scfStockDashV4Center">0</strong></div>'
        +     '</div>'
        +   '</div>'
        +   '<div class="scf-stock-v4-legend">'
        +     '<div class="scf-stock-v4-legend-row"><div class="scf-stock-v4-lbl"><span class="scf-stock-v4-dot ok"></span>Saudável</div><div class="scf-stock-v4-num" id="scfStockDashV4Healthy">0</div></div>'
        +     '<div class="scf-stock-v4-legend-row"><div class="scf-stock-v4-lbl"><span class="scf-stock-v4-dot low"></span>Estoque baixo</div><div class="scf-stock-v4-num" id="scfStockDashV4Low">0</div></div>'
        +     '<div class="scf-stock-v4-legend-row"><div class="scf-stock-v4-lbl"><span class="scf-stock-v4-dot out"></span>Sem estoque</div><div class="scf-stock-v4-num" id="scfStockDashV4Out">0</div></div>'
        +   '</div>'
        + '</div>'
        + '<div id="scfStockDashV4MiniGrid">'
        +   '<div class="scf-stock-v4-card scf-stock-v4-mini"><span class="label">Produtos</span><strong id="scfStockDashV4Products">0</strong></div>'
        +   '<div class="scf-stock-v4-card scf-stock-v4-mini"><span class="label">Unidades</span><strong id="scfStockDashV4Units">0</strong></div>'
        +   '<div class="scf-stock-v4-card scf-stock-v4-mini danger"><span class="label">Ruptura</span><strong id="scfStockDashV4Rupture">0</strong></div>'
        +   '<div class="scf-stock-v4-card scf-stock-v4-mini warn"><span class="label">Reposição</span><strong id="scfStockDashV4Restock">0</strong></div>'
        + '</div>'
        + '<div id="scfStockDashV4Priority" class="scf-stock-v4-card">'
        +   '<span class="title">Top 3 para reposição</span>'
        +   '<div class="scf-stock-v4-list" id="scfStockDashV4PriorityList"></div>'
        + '</div>';
      dash.appendChild(root);
    }
    return root;
  }

  function set(id, value){ const el = document.getElementById(id); if(el) el.textContent = value; }
  function setDonut(healthy, low, out){
    const total = Math.max(1, healthy + low + out);
    let p1 = (healthy / total) * 100;
    let p2 = (low / total) * 100;
    let p3 = (out / total) * 100;
    if(p1 > 0 && p1 < 6) p1 = 6;
    if(p2 > 0 && p2 < 6) p2 = 6;
    if(p3 > 0 && p3 < 6) p3 = 6;
    const sum = p1 + p2 + p3;
    if(sum !== 100){
      p1 = (p1 / sum) * 100;
      p2 = (p2 / sum) * 100;
      p3 = 100 - p1 - p2;
    }
    const a = p1;
    const b = p1 + p2;
    const chart = document.getElementById('scfStockDashV4DonutChart');
    if(chart){
      chart.style.background = 'conic-gradient(#1fbf8c 0 ' + a + '%, #f3a21b ' + a + '% ' + b + '%, #db4f4f ' + b + '% 100%)';
    }
  }
  function renderPriority(list){
    const wrap = document.getElementById('scfStockDashV4PriorityList');
    if(!wrap){ return; }
    wrap.replaceChildren();
    if(!list.length){
      const empty = document.createElement('div');
      empty.className = 'scf-stock-v4-empty';
      empty.textContent = 'Nenhum item crítico no momento.';
      wrap.appendChild(empty);
      return;
    }
    list.forEach(function(item){
      const row = document.createElement('div');
      row.className = 'scf-stock-v4-item';
      row.innerHTML = ''
        + '<div class="scf-stock-v4-item-main">'
        +   '<div class="scf-stock-v4-item-name">' + item.nome + '</div>'
        +   '<span class="scf-stock-v4-item-sub">custo ' + money(item.custo) + ' • venda ' + money(item.venda) + '</span>'
        + '</div>'
        + '<span class="scf-stock-v4-badge">' + item.quantidade + ' un</span>';
      wrap.appendChild(row);
    });
  }

  function update(){
    const root = ensure();
    if(!root){ return; }
    const data = parseRows();
    const products = data.length;
    const units = data.reduce((s,i)=>s+i.quantidade,0);
    const inventory = data.reduce((s,i)=>s+(i.quantidade*i.custo),0);
    const potential = data.reduce((s,i)=>s+(i.quantidade*i.venda),0);
    const margin = potential - inventory;
    const rupture = data.filter(i=>i.quantidade<=0).length;
    const low = data.filter(i=>i.quantidade>0 && i.quantidade<=3).length;
    const healthy = Math.max(0, products - low - rupture);
    const restock = rupture + low;

    set('scfStockDashV4Value', money(inventory));
    set('scfStockDashV4Potential', money(potential));
    set('scfStockDashV4Margin', money(margin));
    set('scfStockDashV4Healthy', String(healthy));
    set('scfStockDashV4Low', String(low));
    set('scfStockDashV4Out', String(rupture));
    set('scfStockDashV4Center', String(restock));
    set('scfStockDashV4Products', String(products));
    set('scfStockDashV4Units', String(units));
    set('scfStockDashV4Rupture', String(rupture));
    set('scfStockDashV4Restock', String(restock));
    setDonut(healthy, low, rupture);

    const priority = data.filter(i=>i.quantidade<=3).sort(function(a,b){
      if(a.quantidade !== b.quantidade) return a.quantidade - b.quantidade;
      return (b.venda - a.venda);
    }).slice(0,3).map(function(i){
      return {
        nome: (i.nome || i.codigo || 'PRODUTO').slice(0,34),
        quantidade: i.quantidade,
        custo: i.custo,
        venda: i.venda
      };
    });
    renderPriority(priority);
  }

  let raf = 0;
  function schedule(){
    if(raf) return;
    raf = requestAnimationFrame(function(){ raf = 0; update(); });
  }
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('input', function(e){ if(e.target && e.target.id === 'scfStockSearch') schedule(); }, true);
  schedule();
})();
