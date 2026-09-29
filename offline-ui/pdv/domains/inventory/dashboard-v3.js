(function(){
  'use strict';

  function t(v){ return String(v ?? '').replace(/\s+/g,' ').trim(); }
  function n(v){
    const raw = t(v).replace(/R\$/gi,'').replace(/\./g,'').replace(/,/g,'.').replace(/[^0-9.-]/g,'');
    const num = Number(raw);
    return Number.isFinite(num) ? num : 0;
  }
  function money(v){
    return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v || 0));
  }
  function rows(){
    return Array.from(document.querySelectorAll('#scfStockList .scf-stock-row')).map(function(row){
      const cells = Array.from(row.children || []);
      return {
        codigo: t(cells[0] && cells[0].textContent),
        nome: t(cells[1] && cells[1].textContent),
        quantidade: Math.max(0, Math.round(n(cells[2] && cells[2].textContent))),
        custo: Math.max(0, n(cells[3] && cells[3].textContent)),
        venda: Math.max(0, n(cells[4] && cells[4].textContent))
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
    if(dash.dataset.stockV3 !== '1'){
      dash.dataset.stockV3 = '1';
      dash.innerHTML += ''
        + '<div id="scfStockDashV3Hero" class="scf-stock-v3-card">'
        +   '<span class="kicker">Valor em estoque</span>'
        +   '<strong class="main" id="scfStockDashV3Value">R$ 0,00</strong>'
        +   '<div class="subgrid">'
        +     '<div><span class="label">Potencial de venda</span><span class="value" id="scfStockDashV3Potential">R$ 0,00</span></div>'
        +     '<div><span class="label">Margem potencial</span><span class="value" id="scfStockDashV3Margin">R$ 0,00</span></div>'
        +   '</div>'
        + '</div>'
        + '<div id="scfStockDashV3Donut" class="scf-stock-v3-card">'
        +   '<div class="scf-stock-v3-donut-wrap">'
        +     '<div class="scf-stock-v3-donut" id="scfStockDashV3DonutChart">'
        +       '<div class="scf-stock-v3-donut-center"><span class="small">Reposição</span><strong id="scfStockDashV3Center">0</strong></div>'
        +     '</div>'
        +   '</div>'
        +   '<div class="scf-stock-v3-legend">'
        +     '<div class="scf-stock-v3-legend-row"><div class="scf-stock-v3-label"><span class="scf-stock-v3-dot ok"></span>Saudável</div><div class="scf-stock-v3-num" id="scfStockDashV3Healthy">0</div></div>'
        +     '<div class="scf-stock-v3-legend-row"><div class="scf-stock-v3-label"><span class="scf-stock-v3-dot low"></span>Estoque baixo</div><div class="scf-stock-v3-num" id="scfStockDashV3Low">0</div></div>'
        +     '<div class="scf-stock-v3-legend-row"><div class="scf-stock-v3-label"><span class="scf-stock-v3-dot out"></span>Sem estoque</div><div class="scf-stock-v3-num" id="scfStockDashV3Out">0</div></div>'
        +   '</div>'
        + '</div>'
        + '<div id="scfStockDashV3Metrics">'
        +   '<div class="scf-stock-v3-card scf-stock-v3-mini"><span class="label">Produtos</span><strong id="scfStockDashV3Products">0</strong></div>'
        +   '<div class="scf-stock-v3-card scf-stock-v3-mini"><span class="label">Unidades</span><strong id="scfStockDashV3Units">0</strong></div>'
        +   '<div class="scf-stock-v3-card scf-stock-v3-mini warn"><span class="label">Reposição sugerida</span><strong id="scfStockDashV3Restock">0</strong></div>'
        +   '<div class="scf-stock-v3-card scf-stock-v3-mini accent"><span class="label">Capital em risco</span><strong id="scfStockDashV3Risk">R$ 0,00</strong></div>'
        + '</div>'
        + '<div id="scfStockDashV3Bottom">'
        +   '<div class="scf-stock-v3-card scf-stock-v3-bottom-card"><span class="title">Produtos prioritários</span><div class="scf-stock-v3-tags" id="scfStockDashV3Priority"></div></div>'
        +   '<div class="scf-stock-v3-card scf-stock-v3-bottom-card"><span class="title">Maior capital no estoque</span><div class="scf-stock-v3-tags" id="scfStockDashV3Capital"></div></div>'
        + '</div>';
    }
    return dash;
  }

  function set(id, value){ const el=document.getElementById(id); if(el) el.textContent=value; }
  function setDonut(ok, low, out){
    const total = Math.max(1, ok + low + out);
    const pOk = (ok/total)*100;
    const pLow = (low/total)*100;
    const pOut = (out/total)*100;
    const a = pOk;
    const b = pOk + pLow;
    const el = document.getElementById('scfStockDashV3DonutChart');
    if(el){
      el.style.background = 'conic-gradient(#22c38e 0 ' + a + '%, #f2a11d ' + a + '% ' + b + '%, #d84b4b ' + b + '% 100%)';
    }
  }
  function renderTags(id, items, kind){
    const wrap = document.getElementById(id);
    if(!wrap){ return; }
    wrap.replaceChildren();
    if(!items.length){
      const empty = document.createElement('div');
      empty.className = 'scf-stock-v3-empty';
      empty.textContent = kind === 'priority' ? 'Nenhum item crítico no momento.' : 'Sem capital relevante para destacar.';
      wrap.appendChild(empty);
      return;
    }
    items.forEach(function(item){
      const tag = document.createElement('div');
      tag.className = 'scf-stock-v3-tag ' + (kind === 'priority' ? 'warn' : 'info');
      tag.title = item.title;
      tag.textContent = item.label;
      wrap.appendChild(tag);
    });
  }
  function update(){
    const dash = ensure();
    if(!dash){ return; }
    const data = rows();
    const products = data.length;
    const units = data.reduce((s,i)=>s+i.quantidade,0);
    const inventory = data.reduce((s,i)=>s+(i.quantidade*i.custo),0);
    const potential = data.reduce((s,i)=>s+(i.quantidade*i.venda),0);
    const margin = potential - inventory;
    const out = data.filter(i=>i.quantidade<=0).length;
    const low = data.filter(i=>i.quantidade>0 && i.quantidade<=3).length;
    const healthy = Math.max(0, products - low - out);
    const restock = out + low;
    const risk = data.filter(i=>i.quantidade<=3).reduce((s,i)=>s+(i.quantidade*i.custo),0);
    set('scfStockDashV3Value', money(inventory));
    set('scfStockDashV3Potential', money(potential));
    set('scfStockDashV3Margin', money(margin));
    set('scfStockDashV3Healthy', String(healthy));
    set('scfStockDashV3Low', String(low));
    set('scfStockDashV3Out', String(out));
    set('scfStockDashV3Center', String(restock));
    set('scfStockDashV3Products', String(products));
    set('scfStockDashV3Units', String(units));
    set('scfStockDashV3Restock', String(restock));
    set('scfStockDashV3Risk', money(risk));
    setDonut(healthy, low, out);

    const priority = data.filter(i=>i.quantidade<=3).sort((a,b)=> a.quantidade!==b.quantidade ? a.quantidade-b.quantidade : (b.venda-a.venda)).slice(0,3).map(function(i){
      return { label:(i.nome||i.codigo||'Produto').slice(0,18)+' • '+i.quantidade+' un', title:(i.nome||i.codigo||'Produto')+' • '+i.quantidade+' un' };
    });
    const capital = data.map(i=>({nome:i.nome||i.codigo||'Produto',capital:i.quantidade*i.custo})).filter(i=>i.capital>0).sort((a,b)=>b.capital-a.capital).slice(0,3).map(function(i){
      return { label:i.nome.slice(0,18)+' • '+money(i.capital), title:i.nome+' • '+money(i.capital)};
    });
    renderTags('scfStockDashV3Priority', priority, 'priority');
    renderTags('scfStockDashV3Capital', capital, 'capital');
  }

  let raf = 0;
  function schedule(){
    if(raf) return;
    raf = requestAnimationFrame(function(){ raf = 0; update(); });
  }
  const mo = new MutationObserver(schedule);
  mo.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('input', function(e){ if(e.target && e.target.id==='scfStockSearch') schedule(); }, true);
  schedule();
})();
