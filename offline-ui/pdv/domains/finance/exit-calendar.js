(function(){
  'use strict';

  const financeDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.finance;

  if(!financeDomain){
    throw new Error(
      'PDV finance domain indisponivel.'
    );
  }

  const desktopMq = window.matchMedia('(min-width:1001px)');
  const MONTHS = [
    'JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO',
    'JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'
  ];

  let selectedYear = null;
  let selectedMonth = null;
  let selectedDateFilter = '';
  let pending = false;

  function monthViewOpen(){
    return desktopMq.matches &&
      document.body.classList.contains('scf-financeiro-registration-open') &&
      document.body.classList.contains('scf-financeiro-saida-open') &&
      document.body.classList.contains('scf-financeiro-saida-mes-open');
  }

  function exitView(){
    return document.getElementById('scfFinanceExitView');
  }

  function rightHost(){
    return document.getElementById('scfFinanceForm');
  }

  function rows(){
    const view = exitView();
    return view
      ? Array.from(view.querySelectorAll('.scf-finance-exit-row-hook'))
      : [];
  }

  function rowDate(row){
    const datasetDate =
      row &&
      row.dataset
        ? String(row.dataset.scfFinanceExitDate || '').trim()
        : '';

    if(datasetDate){
      return datasetDate;
    }

    const first = row && row.querySelector('span:first-child');
    return String(first ? first.textContent : '').replace(/\s+/g,' ').trim();
  }

  function inferMonthFromRows(){
    const match = rows()
      .map(rowDate)
      .find(function(value){
        return /^\d{2}\/\d{2}\/\d{4}$/.test(value);
      });

    if(!match) return false;

    const parts = match.split('/');
    selectedMonth = Math.max(0,Math.min(11,Number(parts[1]) - 1));
    selectedYear = Number(parts[2]);
    return Number.isFinite(selectedYear);
  }

  /*
   * Quando o mês não possui nenhuma entrada, não existem linhas na tabela
   * para descobrir mês/ano. Nesse caso usamos o título da tela e o ano
   * capturado da pasta selecionada (com fallback para o ano atual).
   */
  function inferMonthFromTitle(){
    const title = document.getElementById('scfFinanceRegistrationTitle');
    const text = String(title ? title.textContent : '')
      .replace(/\s+/g,' ')
      .trim()
      .toUpperCase();

    const month = MONTHS.findIndex(function(name){
      return text.endsWith(' - ' + name) || text.includes('ENTRADA - ' + name);
    });

    if(month < 0){
      return false;
    }

    selectedMonth = month;

    if(!Number.isFinite(Number(selectedYear))){
      selectedYear = new Date().getFullYear();
    }

    return true;
  }

  function ensureCalendar(){
    if(!monthViewOpen()) return null;

    const host = rightHost();
    if(!host) return null;

    let calendar = document.getElementById('scfFinanceExitCalendar');
    if(!calendar){
      calendar = document.createElement('section');
      calendar.id = 'scfFinanceExitCalendar';
      calendar.className = 'scf-history-inline-calendar';
      calendar.setAttribute('aria-label','Calendário para filtrar as saídas por data');
      calendar.innerHTML = ''
        + '<div class="scf-history-inline-calendar-weekdays"></div>'
        + '<div class="scf-history-inline-calendar-grid"></div>'
        + '<div class="scf-history-inline-calendar-hint">Clique em uma data para filtrar as saídas do mês.</div>';
      host.appendChild(calendar);
    }

    calendar.className = 'scf-history-inline-calendar';
    if(!calendar.querySelector('.scf-history-inline-calendar-weekdays')){
      calendar.innerHTML = ''
        + '<div class="scf-history-inline-calendar-weekdays"></div>'
        + '<div class="scf-history-inline-calendar-grid"></div>'
        + '<div class="scf-history-inline-calendar-hint">Clique em uma data para filtrar as saídas do mês.</div>';
    }

    return calendar;
  }

  function ensureEmptyMessage(){
    const view = exitView();
    if(!view) return null;

    let empty = view.querySelector('.scf-finance-exit-date-filter-empty');
    if(!empty){
      empty = document.createElement('div');
      empty.className = 'scf-finance-exit-date-filter-empty';
      empty.textContent = 'NENHUMA SAÍDA ENCONTRADA PARA A DATA SELECIONADA.';
      empty.hidden = true;
      view.appendChild(empty);
    }
    return empty;
  }

  function clearFilterVisual(){
    rows().forEach(function(row){
      row.style.removeProperty('display');
      row.classList.remove('is-filter-hidden');
    });

    const view = exitView();
    const empty = view && view.querySelector('.scf-finance-exit-date-filter-empty');
    if(empty) empty.remove();
  }

  function moneyNumber(value){
    const raw = String(value || '')
      .replace(/[^\d,.-]/g,'')
      .trim();

    if(!raw) return 0;

    const normalized = raw.includes(',')
      ? raw.replace(/\./g,'').replace(',','.')
      : raw;

    const number = Number(normalized);
    return Number.isFinite(number) ? Math.abs(number) : 0;
  }

  function moneyText(value){
    try{
      return new Intl.NumberFormat(
        'pt-BR',
        {
          style:'currency',
          currency:'BRL'
        }
      ).format(Number(value) || 0);
    }catch(error){
      return 'R$ ' + (Number(value) || 0)
        .toFixed(2)
        .replace('.',',');
    }
  }

  function activeStatusFilter(){
    const active =
      document.querySelector(
        '#scfFinanceExitStatusTotals ' +
        '[data-scf-finance-exit-filter].is-filter-active'
      ) ||
      document.querySelector(
        '#scfFinanceExitStatusTotals ' +
        '[data-scf-finance-exit-filter][aria-pressed="true"]'
      );

    const value = String(
      active
        ? active.getAttribute('data-scf-finance-exit-filter')
        : 'ALL'
    ).trim().toUpperCase();

    return (
      value === 'A_PAGAR' ||
      value === 'PAGO'
    )
      ? value
      : 'ALL';
  }

  function updateDateTotals(currentRows){
    let pending = 0;
    let paid = 0;

    currentRows.forEach(function(row){
      if(
        selectedDateFilter &&
        rowDate(row) !== selectedDateFilter
      ){
        return;
      }

      const status = String(
        row.dataset.scfFinanceExitStatus || ''
      ).trim().toUpperCase();

      const cells = row.querySelectorAll('span');
      const value = moneyNumber(
        cells && cells[2]
          ? cells[2].textContent
          : ''
      );

      if(status === 'PAGO'){
        paid += value;
      }else{
        pending += value;
      }
    });

    const total = pending + paid;

    const pendingEl =
      document.getElementById(
        'scfFinanceExitTotalPending'
      );
    const paidEl =
      document.getElementById(
        'scfFinanceExitTotalPaid'
      );
    const totalEl =
      document.getElementById(
        'scfFinanceExitTotalOverall'
      );

    if(pendingEl){
      pendingEl.textContent = moneyText(pending);
    }

    if(paidEl){
      paidEl.textContent = moneyText(paid);
    }

    if(totalEl){
      totalEl.textContent = moneyText(total);
    }
  }

  function applyDateFilter(){
    if(!monthViewOpen()) return;

    financeDomain.exitSelectedDateFilter =
      selectedDateFilter;

    const currentRows = rows();
    const statusFilter = activeStatusFilter();
    let visibleCount = 0;

    currentRows.forEach(function(row){
      const status = String(
        row.dataset.scfFinanceExitStatus || ''
      ).trim().toUpperCase();

      const passesDate =
        !selectedDateFilter ||
        rowDate(row) === selectedDateFilter;

      const passesStatus =
        statusFilter === 'ALL' ||
        status === statusFilter;

      const show =
        passesDate &&
        passesStatus;

      row.classList.toggle(
        'scf-finance-exit-filter-hidden',
        !show
      );

      row.classList.toggle(
        'is-filter-hidden',
        !show
      );

      if(show){
        row.style.removeProperty('display');
        visibleCount += 1;
      }else{
        row.style.setProperty(
          'display',
          'none',
          'important'
        );
      }
    });

    updateDateTotals(currentRows);

    const empty = ensureEmptyMessage();
    if(empty){
      empty.hidden = !(
        selectedDateFilter &&
        currentRows.length > 0 &&
        visibleCount === 0
      );
    }

    /*
     * Mantém os demais controles do FINANCEIRO sincronizados.
     * Mesmo que outro listener não responda, o filtro acima já foi
     * aplicado diretamente nas linhas e nos totais.
     */
    window.__scfPdvInfra.eventBus.dispatch(
      new CustomEvent(
        'scf:financeiro-saida-data-filtro-alterado',
        {
          detail:{
            data:selectedDateFilter
          }
        }
      )
    );
  }

  function buildCalendar(){
    if(!monthViewOpen()) return;

    if(
      selectedMonth === null ||
      selectedYear === null ||
      !Number.isFinite(Number(selectedYear))
    ){
      if(!inferMonthFromRows()) return;
    }

    const calendar = ensureCalendar();
    if(!calendar) return;

    const weekdays = calendar.querySelector('.scf-history-inline-calendar-weekdays');
    const grid = calendar.querySelector('.scf-history-inline-calendar-grid');
    if(!weekdays || !grid) return;
    weekdays.replaceChildren();
    grid.replaceChildren();

    ['dom','seg','ter','qua','qui','sex','sáb'].forEach(function(label,index){
      const item = document.createElement('div');
      item.className = 'scf-history-inline-calendar-weekday' +
        (index === 0 ? ' is-sunday' : '');
      item.textContent = label;
      weekdays.appendChild(item);
    });

    const movementDates = new Set(rows().map(rowDate).filter(Boolean));
    const firstDay = new Date(selectedYear,selectedMonth,1).getDay();
    const totalDays = new Date(selectedYear,selectedMonth + 1,0).getDate();
    const totalCells = Math.ceil((firstDay + totalDays) / 7) * 7;
    const today = new Date();

    for(let index = 0; index < totalCells; index += 1){
      const day = index - firstDay + 1;

      if(day < 1 || day > totalDays){
        const empty = document.createElement('button');
        empty.type = 'button';
        empty.className = 'scf-history-inline-calendar-day is-empty';
        empty.textContent = '0';
        empty.setAttribute('aria-hidden','true');
        empty.tabIndex = -1;
        grid.appendChild(empty);
        continue;
      }

      const dd = String(day).padStart(2,'0');
      const mm = String(selectedMonth + 1).padStart(2,'0');
      const dateString = dd + '/' + mm + '/' + String(selectedYear);
      const button = document.createElement('button');

      button.type = 'button';
      button.className = 'scf-history-inline-calendar-day';
      button.textContent = String(day);
      button.dataset.date = dateString;
      button.setAttribute('aria-label','Filtrar saídas de ' + dateString);

      if(new Date(selectedYear,selectedMonth,day).getDay() === 0){
        button.classList.add('is-sunday');
      }

      if(
        day === today.getDate() &&
        selectedMonth === today.getMonth() &&
        Number(selectedYear) === today.getFullYear()
      ){
        button.classList.add('is-today');
        button.setAttribute('aria-current','date');
      }

      if(movementDates.has(dateString)){
        button.classList.add('is-has-sales');
      }

      if(selectedDateFilter === dateString){
        button.classList.add('is-selected');
        button.setAttribute('aria-pressed','true');
      }else{
        button.setAttribute('aria-pressed','false');
      }

      grid.appendChild(button);
    }
  }

  function selectCalendarDay(button){
    if(!button || !monthViewOpen()) return;

    const dateString = String(
      button.dataset.date || ''
    ).trim();

    if(!/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)){
      return;
    }

    selectedDateFilter =
      selectedDateFilter === dateString
        ? ''
        : dateString;

    applyDateFilter();
    buildCalendar();
  }

  /*
   * POINTERDOWN em captura:
   * garante que o dia seja selecionado mesmo quando algum fluxo antigo
   * da página interfere no evento click.
   */
  document.addEventListener(
    'pointerdown',
    function(event){
      const button =
        event.target && event.target.closest
          ? event.target.closest(
              '#scfFinanceExitCalendar ' +
              '.scf-history-inline-calendar-day[data-date]'
            )
          : null;

      if(!button || !monthViewOpen()){
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      selectCalendarDay(button);
    },
    true
  );

  /*
   * Bloqueia o click posterior do mouse para não executar duas vezes.
   * Para ativação por teclado (detail === 0), executa a seleção aqui.
   */
  document.addEventListener(
    'click',
    function(event){
      const button =
        event.target && event.target.closest
          ? event.target.closest(
              '#scfFinanceExitCalendar ' +
              '.scf-history-inline-calendar-day[data-date]'
            )
          : null;

      if(!button || !monthViewOpen()){
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if(
        typeof event.stopImmediatePropagation ===
        'function'
      ){
        event.stopImmediatePropagation();
      }

      if(event.detail === 0){
        selectCalendarDay(button);
      }
    },
    true
  );

  function removeCalendar(){
    document.getElementById('scfFinanceExitCalendar')?.remove();
  }

  function sync(){
    pending = false;

    if(!monthViewOpen()){
      selectedDateFilter = '';
      selectedMonth = null;
      selectedYear = null;
      financeDomain.exitSelectedDateFilter = '';
      clearFilterVisual();
      removeCalendar();
      return;
    }

    buildCalendar();
    applyDateFilter();
  }

  function requestSync(){
    if(pending) return;
    pending = true;
    window.requestAnimationFrame(function(){
      window.requestAnimationFrame(sync);
    });
  }

  document.addEventListener('click',function(event){
    const folder = event.target && event.target.closest
      ? event.target.closest('#scfFinanceExitView .scf-sales-history-month-folder')
      : null;

    if(folder){
      const month = Number(folder.dataset.month);
      const year = Number(folder.dataset.year);

      if(Number.isInteger(month) && month >= 0 && month <= 11){
        selectedMonth = month;
      }
      if(Number.isFinite(year)){
        selectedYear = year;
      }
      selectedDateFilter = '';
      requestSync();
      return;
    }

    const back = event.target && event.target.closest
      ? event.target.closest('#scfFinanceExitBack')
      : null;

    if(back){
      selectedDateFilter = '';
      requestSync();
    }
  },true);

  const bodyObserver = new MutationObserver(requestSync);
  bodyObserver.observe(document.body,{
    attributes:true,
    attributeFilter:['class']
  });

  const view = exitView();
  if(view){
    const viewObserver = new MutationObserver(function(mutations){
      if(!monthViewOpen()) return;

      const changed = mutations.some(function(mutation){
        return mutation.type === 'childList';
      });

      if(changed) requestSync();
    });

    viewObserver.observe(view,{
      childList:true,
      subtree:true
    });
  }

  desktopMq.addEventListener?.('change',requestSync);
  requestSync();
})();
