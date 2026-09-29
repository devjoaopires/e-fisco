(function(){
  'use strict';

  const desktopMq = window.matchMedia('(min-width:1001px)');
  const overlay = document.getElementById('scfSalesHistoryOverlay');
  const header = overlay && overlay.querySelector('.scf-sales-history-header');
  const historyList = document.getElementById('scfSalesHistoryList');
  const backButton = document.getElementById('scfSalesHistoryBack');

  if(!overlay || !header || !historyList || !backButton){
    return;
  }

  const filters = document.createElement('div');
  filters.id = 'scfSalesHistoryQuickFilters';
  filters.hidden = true;
  filters.setAttribute('aria-label','Filtros rápidos do Histórico de Vendas');

  function createSelect(id,label){
    const select = document.createElement('select');
    select.id = id;
    select.className = 'scf-history-quick-filter';
    select.setAttribute('aria-label',label);

    const option = document.createElement('option');
    option.value = '';
    option.textContent = label;
    option.disabled = true;
    option.hidden = true;
    option.selected = true;
    select.appendChild(option);

    return select;
  }

  const paymentSelect = createSelect('scfSalesHistoryFilterPayment','PAGAMENTO');
  const statusSelect = createSelect('scfSalesHistoryFilterStatus','SITUAÇÃO');

  filters.append(paymentSelect,statusSelect);
  header.appendChild(filters);

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

  function getRows(){
    return Array.from(
      historyList.querySelectorAll(
        '.scf-sales-history-item-tabular'
      )
    );
  }

  function getCells(card){
    const row = card && card.querySelector('.scf-sales-history-tabular-row');
    return row ? Array.from(row.children) : [];
  }

  function cellValue(cell){
    return text(
      cell && (
        cell.getAttribute('title') ||
        cell.textContent
      )
    );
  }

  function isMonthDetail(){
    return desktopMq.matches &&
      overlay.classList.contains('show') &&
      overlay.getAttribute('aria-hidden') === 'false' &&
      backButton.hidden === false &&
      !historyList.querySelector('.scf-sales-history-month-grid');
  }

  function syncSelect(select,items,placeholder){
    const previous = select.value;
    const unique = [];
    const seen = new Set();

    items.forEach(function(item){
      const value = text(item && item.value);
      const label = text(item && item.label);
      const key = text(item && item.key) || normalize(value);

      if(!value || seen.has(key)){
        return;
      }

      seen.add(key);
      unique.push({ value,label:label || value,key });
    });

    select.replaceChildren();

    const first = document.createElement('option');
    first.value = '';
    first.textContent = placeholder;
    first.disabled = true;
    first.hidden = true;
    first.selected = true;
    select.appendChild(first);

    unique.forEach(function(item){
      const option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      select.appendChild(option);
    });

    if(
      previous &&
      Array.from(select.options).some(function(option){
        return option.value === previous;
      })
    ){
      select.value = previous;
    }else{
      select.value = '';
    }
  }

  function refreshOptions(){
    if(!isMonthDetail()){
      return;
    }

    const rows = getRows();
    const payments = [];
    const statuses = [];

    rows.forEach(function(card){
      const cells = getCells(card);

      if(cells.length < 7){
        return;
      }

      const payment = cellValue(cells[3]);
      if(payment && payment !== '-'){
        payment
          .split(/\s*\+\s*/)
          .map(text)
          .filter(Boolean)
          .forEach(function(method){
            const key = normalize(method);
            payments.push({
              value:key,
              label:method,
              key
            });
          });
      }

      if(cells.length >= 8){
        const status = cellValue(cells[7]);
        if(status){
          const key = normalize(status);
          statuses.push({
            value:key,
            label:status === '-' ? 'SEM SITUAÇÃO' : status,
            key
          });
        }
      }
    });

    payments.sort(function(a,b){
      return a.label.localeCompare(b.label,'pt-BR');
    });

    statuses.sort(function(a,b){
      return a.label.localeCompare(b.label,'pt-BR');
    });

    syncSelect(paymentSelect,payments,'PAGAMENTO');
    syncSelect(statusSelect,statuses,'SITUAÇÃO');
  }

  function applyFilters(){
    if(!isMonthDetail()){
      getRows().forEach(function(card){
        card.classList.remove('scf-history-filter-hidden');
      });
      return;
    }

    const selectedPayment = normalize(paymentSelect.value);
    const selectedStatus = normalize(statusSelect.value);

    getRows().forEach(function(card){
      const cells = getCells(card);

      if(cells.length < 7){
        card.classList.remove('scf-history-filter-hidden');
        return;
      }

      const rowPayment = normalize(cellValue(cells[3]));
      const rowStatus = cells.length >= 8
        ? normalize(cellValue(cells[7]))
        : '';

      const matchesPayment = !selectedPayment || rowPayment.includes(selectedPayment);
      const matchesStatus = !selectedStatus || rowStatus === selectedStatus;

      card.classList.toggle(
        'scf-history-filter-hidden',
        !(matchesPayment && matchesStatus)
      );
    });

    const salesColumn = historyList.querySelector('.scf-history-month-sales-column');
    if(salesColumn){
      salesColumn.scrollTop = 0;
    }
  }

  function syncVisibility(){
    const visible = isMonthDetail();
    filters.hidden = !visible;

    if(!visible){
      paymentSelect.value = '';
      statusSelect.value = '';
      applyFilters();
      return;
    }

    refreshOptions();
    applyFilters();
  }

  function scheduleSync(){
    window.setTimeout(syncVisibility,0);
    window.setTimeout(syncVisibility,80);
    window.setTimeout(syncVisibility,250);
  }

  [paymentSelect,statusSelect].forEach(function(select){
    select.addEventListener('focus',refreshOptions);
    select.addEventListener('pointerdown',refreshOptions);
    select.addEventListener('change',applyFilters);
  });

  overlay.addEventListener('click',function(event){
    if(
      event.target &&
      event.target.closest &&
      event.target.closest('#scfSalesHistoryQuickFilters')
    ){
      return;
    }

    scheduleSync();
  },true);
  window.__scfPdvInfra.eventBus.on('scf:historico-vendas-atualizar',scheduleSync);
  window.__scfPdvInfra.eventBus.on('scf:historico-vendas-renderizado',scheduleSync);
  window.__scfPdvInfra.eventBus.on('scf:cupom-historico-fechado',scheduleSync);
  window.addEventListener('resize',scheduleSync,{ passive:true });

  if(typeof desktopMq.addEventListener === 'function'){
    desktopMq.addEventListener('change',scheduleSync);
  }else if(typeof desktopMq.addListener === 'function'){
    desktopMq.addListener(scheduleSync);
  }

  scheduleSync();
})();
