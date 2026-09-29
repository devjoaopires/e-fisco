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
  function pct(v,total){
    return total > 0 ? Math.round((v/total)*100) : 0;
  }

  function getRows(){
    return Array.from(document.querySelectorAll('#scfStockList .scf-stock-row'));
  }

  function parseRow(row){
    const c = Array.from(row.children || []);
    const qtd = Math.max(0, Math.round(num(c[2] && c[2].textContent)));
    const custo = Math.max(0, num(c[3] && c[3].textContent));
    const venda = Math.max(0, num(c[4] && c[4].textContent));
    const margem = c[5] ? num(c[5].textContent) : (venda - custo);
    const situacao = txt(c[6] && c[6].textContent).toUpperCase();
    const semPreco = venda <= 0 || situacao.includes('SEM PREÇO');
    const semEstoque = qtd <= 0 || situacao.includes('SEM ESTOQUE');
    const baixo = (!semEstoque) && (qtd <= 3 || situacao.includes('BAIXO'));
    const margemNegativa = margem < 0;
    return {
      row,
      nome: txt(c[1] && c[1].textContent),
      qtd, custo, venda, margem, situacao,
      semPreco, semEstoque, baixo, margemNegativa,
      saudavel: !semEstoque && !baixo && !semPreco && !margemNegativa,
      capital: qtd * custo,
      potencial: qtd * venda
    };
  }

  function ensureFilter(){
    const tools = document.getElementById('scfStockHeaderTools');
    if(!tools) return null;
    let sel = document.getElementById('scfStockQuickFilter');
    if(!sel){
      sel = document.createElement('select');
      sel.id = 'scfStockQuickFilter';
      sel.setAttribute('aria-label','Filtro rápido do estoque');
      tools.insertBefore(sel, tools.firstChild);
      sel.addEventListener('change', schedule);
    }
    const current = sel.value || 'TODOS';
    sel.innerHTML = ''
      + '<option value="TODOS">TODOS</option>'
      + '<option value="SEM_PRECO">SEM PREÇO</option>'
      + '<option value="BAIXO">ESTOQUE BAIXO</option>'
      + '<option value="SEM_ESTOQUE">ESTOQUE ZERADO</option>'
      + '<option value="MARGEM_NEGATIVA">MARGEM NEGATIVA</option>';
    sel.value = current;
    return sel;
  }

  function classifyAndFilter(data){
    const sel = ensureFilter();
    const mode = sel ? sel.value : 'TODOS';
    data.forEach(function(item){
      const row = item.row;
      row.classList.remove('scf-stock-row-low','scf-stock-row-out','scf-stock-row-noprice','scf-stock-row-negative','scf-stock-row-positive');
      if(item.semEstoque) row.classList.add('scf-stock-row-out');
      else if(item.margemNegativa) row.classList.add('scf-stock-row-negative');
      else if(item.semPreco) row.classList.add('scf-stock-row-noprice');
      else if(item.baixo) row.classList.add('scf-stock-row-low');
      else row.classList.add('scf-stock-row-positive');

      let show = true;
      if(mode === 'BAIXO') show = item.baixo;
      else if(mode === 'SEM_ESTOQUE') show = item.semEstoque;
      else if(mode === 'SEM_PRECO') show = item.semPreco;
      else if(mode === 'MARGEM_NEGATIVA') show = item.margemNegativa;
      row.hidden = !show;
    });
  }

  function ensureDashboard(){
    const panel = document.getElementById('scfStockRightPanel');
    if(!panel) return null;
    let dash = document.getElementById('scfStockDashboard');
    if(!dash){
      dash = document.createElement('div');
      dash.id = 'scfStockDashboard';
      panel.prepend(dash);
    }
    let root = document.getElementById('scfStockDashV5Root');
    if(!root){
      root = document.createElement('div');
      root.id = 'scfStockDashV5Root';
      root.innerHTML = ''
        + '<div id="scfStockDashV4Hero" class="scf-stock-v4-card">'
        +   '<span class="kicker">Valor em estoque</span>'
        +   '<strong class="main" id="scfStockDashV5Value">R$ 0,00</strong>'
        +   '<div class="subgrid">'
        +     '<div><span class="label">Potencial de venda</span><span class="value" id="scfStockDashV5Potential">R$ 0,00</span></div>'
        +     '<div><span class="label">Margem potencial</span><span class="value" id="scfStockDashV5Margin">R$ 0,00</span></div>'
        +   '</div>'
        + '</div>'
        + '<div id="scfStockDashV4Donut" class="scf-stock-v4-card">'
        +   '<div class="scf-stock-v4-donut-box">'
        +     '<div class="scf-stock-v4-donut" id="scfStockDashV5Donut">'
        +       '<div class="scf-stock-v4-donut-center"><span class="small">ATENÇÃO</span><strong id="scfStockDashV5Center">0</strong><span class="tiny">PARA REPOR</span></div>'
        +     '</div>'
        +   '</div>'
        +   '<div class="scf-stock-v4-legend">'
        +     '<div class="scf-stock-v4-legend-row"><div class="scf-stock-v4-lbl"><span class="scf-stock-v4-dot ok"></span>Saudável</div><div class="scf-stock-v4-num" id="scfStockDashV5Healthy">0</div></div>'
        +     '<div class="scf-stock-v4-legend-row"><div class="scf-stock-v4-lbl"><span class="scf-stock-v4-dot low"></span>Estoque baixo</div><div class="scf-stock-v4-num" id="scfStockDashV5Low">0</div></div>'
        +     '<div class="scf-stock-v4-legend-row"><div class="scf-stock-v4-lbl"><span class="scf-stock-v4-dot out"></span>Sem estoque</div><div class="scf-stock-v4-num" id="scfStockDashV5Out">0</div></div>'
        +   '</div>'
        + '</div>'
        + '<div id="scfStockDashV4MiniGrid">'
        +   '<div class="scf-stock-v4-card scf-stock-v4-mini"><span class="label">Unidades</span><strong id="scfStockDashV5Units">0</strong></div>'
        +   '<div class="scf-stock-v4-card scf-stock-v4-mini warn"><span class="label">Estoque baixo</span><strong id="scfStockDashV5LowBox">0</strong></div>'
        +   '<div class="scf-stock-v4-card scf-stock-v4-mini danger"><span class="label">Ruptura</span><strong id="scfStockDashV5OutBox">0</strong></div>'
        +   '<div class="scf-stock-v4-card scf-stock-v4-mini"><span class="label">Sem preço</span><strong id="scfStockDashV5NoPrice">0</strong></div>'
        + '</div>'
        + '<div id="scfStockDashV4Priority" class="scf-stock-v4-card">'
        +   '<span class="title">Atenção imediata</span>'
        +   '<div class="scf-stock-v4-list" id="scfStockDashV5Priority"></div>'
        + '</div>';
      dash.appendChild(root);
    }
    return root;
  }

  function setText(id, value){ const el = document.getElementById(id); if(el) el.textContent = value; }
  function setDonut(healthy, low, out){
    const total = Math.max(1, healthy + low + out);
    let a = healthy ? Math.max(healthy / total * 100, 8) : 0;
    let b = low ? Math.max(low / total * 100, 8) : 0;
    let c = out ? Math.max(out / total * 100, 8) : 0;
    const sum = a + b + c || 100;
    a = (a/sum)*100; b = (b/sum)*100; c = 100 - a - b;
    const cut1 = a, cut2 = a + b;
    const el = document.getElementById('scfStockDashV5Donut');
    if(el) el.style.background = 'conic-gradient(#26b884 0 ' + cut1 + '%, #f1a51b ' + cut1 + '% ' + cut2 + '%, #df5757 ' + cut2 + '% 100%)';
  }

  function renderPriority(items){
    const wrap = document.getElementById('scfStockDashV5Priority');
    if(!wrap) return;
    wrap.replaceChildren();
    if(!items.length){
      const empty = document.createElement('div');
      empty.className = 'scf-stock-v4-empty';
      empty.textContent = 'Nenhum produto exige ação imediata.';
      wrap.appendChild(empty);
      return;
    }
    items.forEach(function(item){
      const row = document.createElement('div');
      row.className = 'scf-stock-v4-item';
      row.innerHTML = ''
        + '<div class="scf-stock-v4-item-main">'
        +   '<div class="scf-stock-v4-item-name">' + item.nome + '</div>'
        +   '<span class="scf-stock-v4-item-sub">' + item.motivo + ' • margem ' + money(item.margem) + '</span>'
        + '</div>'
        + '<span class="scf-stock-v4-badge">' + item.qtd + ' un</span>';
      wrap.appendChild(row);
    });
  }

  function update(){
    ensureDashboard();
    const data = getRows().map(parseRow);
    classifyAndFilter(data);

    const visible = data.filter(i => !i.row.hidden);
    const basis = visible.length ? visible : data;

    const units = basis.reduce((s,i)=>s+i.qtd,0);
    const inv = basis.reduce((s,i)=>s+i.capital,0);
    const pot = basis.reduce((s,i)=>s+i.potencial,0);
    const margin = pot - inv;
    const low = basis.filter(i=>i.baixo).length;
    const out = basis.filter(i=>i.semEstoque).length;
    const healthy = basis.filter(i=>i.saudavel).length;
    const noPrice = basis.filter(i=>i.semPreco).length;
    const need = low + out;

    setText('scfStockDashV5Value', money(inv));
    setText('scfStockDashV5Potential', money(pot));
    setText('scfStockDashV5Margin', money(margin));
    setText('scfStockDashV5Center', String(need));
    setText('scfStockDashV5Healthy', String(healthy));
    setText('scfStockDashV5Low', String(low));
    setText('scfStockDashV5Out', String(out));
    setText('scfStockDashV5Units', String(units));
    setText('scfStockDashV5LowBox', String(low));
    setText('scfStockDashV5OutBox', String(out));
    setText('scfStockDashV5NoPrice', String(noPrice));
    setDonut(healthy, low, out);

    const top = basis.slice().sort(function(a,b){
      const pa = (a.semEstoque ? 300 : 0) + (a.baixo ? 200 : 0) + (a.semPreco ? 120 : 0) + (a.margemNegativa ? 100 : 0) - a.qtd;
      const pb = (b.semEstoque ? 300 : 0) + (b.baixo ? 200 : 0) + (b.semPreco ? 120 : 0) + (b.margemNegativa ? 100 : 0) - b.qtd;
      if(pb !== pa) return pb - pa;
      return (b.capital - a.capital);
    }).filter(function(i){ return i.semEstoque || i.baixo || i.semPreco || i.margemNegativa; }).slice(0,3).map(function(i){
      let motivo = 'baixo estoque';
      if(i.semEstoque) motivo = 'sem estoque';
      else if(i.semPreco) motivo = 'sem preço de venda';
      else if(i.margemNegativa) motivo = 'margem negativa';
      return { nome: i.nome || 'PRODUTO', qtd: i.qtd, margem: i.margem, motivo: motivo };
    });
    renderPriority(top);
  }

  let raf = 0;
  function schedule(){
    if(raf) return;
    raf = requestAnimationFrame(function(){ raf = 0; update(); });
  }
  new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden']});
  document.addEventListener('input', function(e){ if(e.target && e.target.id === 'scfStockSearch') schedule(); }, true);
  document.addEventListener('change', function(e){ if(e.target && e.target.id === 'scfStockQuickFilter') schedule(); }, true);
  schedule();
})();
