(function(){
  'use strict';

  const desktopMq =
    window.matchMedia('(min-width:1001px)');

  const historyOverlay =
    document.getElementById('scfSalesHistoryOverlay');
  const historyList =
    document.getElementById('scfSalesHistoryList');
  const historyTitle =
    document.getElementById('scfSalesHistoryTitle');

  if(!historyOverlay || !historyList || !historyTitle){
    return;
  }

  const monthMap = {
    'JANEIRO': 0,
    'FEVEREIRO': 1,
    'MARÇO': 2,
    'MARCO': 2,
    'ABRIL': 3,
    'MAIO': 4,
    'JUNHO': 5,
    'JULHO': 6,
    'AGOSTO': 7,
    'SETEMBRO': 8,
    'OUTUBRO': 9,
    'NOVEMBRO': 10,
    'DEZEMBRO': 11
  };

  let selectedDateFilter = '';

  function text(value){
    return String(value ?? '').replace(/\s+/g, ' ').trim();
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

  function getSalesColumn(){
    return historyList.querySelector('.scf-history-month-sales-column') || historyList;
  }

  function getReceiptPanel(){
    return historyList.querySelector('.scf-history-inline-receipt-panel');
  }

  function getReceiptFrame(){
    return historyList.querySelector('.scf-history-inline-receipt-frame');
  }

  function getRows(){
    return Array.from(
      getSalesColumn().querySelectorAll('.scf-sales-history-item-tabular')
    );
  }

  function getRowDate(row){
    const cell = row.querySelector('.scf-sales-history-tabular-row > div:first-child');
    return text(cell && cell.textContent);
  }

  function getYearFromRows(){
    const matchRow = getRows().find(function(row){
      return /^\d{2}\/\d{2}\/\d{4}$/.test(getRowDate(row));
    });

    if(matchRow){
      return Number(getRowDate(matchRow).slice(-4));
    }

    return new Date().getFullYear();
  }

  function getMonthIndexFromTitle(){
    const title = text(historyTitle.textContent).toUpperCase();
    const lastPart = title.split(' - ').pop().trim();
    return monthMap.hasOwnProperty(lastPart) ? monthMap[lastPart] : (new Date().getMonth());
  }

  function ensureCalendarStructure(){
    if(!isDesktopMonthView()){
      return null;
    }

    const panel = getReceiptPanel();
    const frame = getReceiptFrame();

    if(!panel){
      return null;
    }

    let calendar = panel.querySelector('.scf-history-inline-calendar');
    if(!calendar){
      calendar = document.createElement('div');
      calendar.className = 'scf-history-inline-calendar';
      calendar.innerHTML = ''
        + '<div class="scf-history-inline-calendar-weekdays"></div>'
        + '<div class="scf-history-inline-calendar-grid"></div>'
        + '<div class="scf-history-inline-calendar-hint">Clique em uma data para filtrar as vendas do mês.</div>';

      if(frame){
        panel.insertBefore(calendar, frame);
      }else{
        panel.insertBefore(calendar, panel.firstChild);
      }
    }

    let emptyMessage = getSalesColumn().querySelector('.scf-history-inline-empty-date');
    if(!emptyMessage){
      emptyMessage = document.createElement('div');
      emptyMessage.className = 'scf-history-inline-empty-date';
      emptyMessage.textContent = 'Nenhuma venda encontrada para a data selecionada.';
      getSalesColumn().appendChild(emptyMessage);
    }

    return calendar;
  }

  function buildCalendar(){
    const calendar = ensureCalendarStructure();
    if(!calendar){
      return;
    }

    const weekdays = calendar.querySelector('.scf-history-inline-calendar-weekdays');
    const grid = calendar.querySelector('.scf-history-inline-calendar-grid');

    if(!weekdays || !grid){
      return;
    }

    weekdays.innerHTML = '';
    grid.innerHTML = '';

    ['dom','seg','ter','qua','qui','sex','sáb'].forEach(function(label, index){
      const item = document.createElement('div');
      item.className = 'scf-history-inline-calendar-weekday' + (index === 0 ? ' is-sunday' : '');
      item.textContent = label;
      weekdays.appendChild(item);
    });

    const monthIndex = getMonthIndexFromTitle();
    const year = getYearFromRows();
    const firstDay = new Date(year, monthIndex, 1).getDay();
    const totalDays = new Date(year, monthIndex + 1, 0).getDate();

    const salesDates = new Set(
      getRows()
        .map(getRowDate)
        .filter(Boolean)
    );

    for(let i = 0; i < firstDay; i += 1){
      const empty = document.createElement('button');
      empty.type = 'button';
      empty.className = 'scf-history-inline-calendar-day is-empty';
      empty.textContent = '0';
      empty.setAttribute('aria-hidden', 'true');
      grid.appendChild(empty);
    }

    for(let day = 1; day <= totalDays; day += 1){
      const dd = String(day).padStart(2, '0');
      const mm = String(monthIndex + 1).padStart(2, '0');
      const yyyy = String(year);
      const dateString = dd + '/' + mm + '/' + yyyy;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'scf-history-inline-calendar-day';
      button.textContent = String(day);
      button.dataset.date = dateString;

      const weekday = new Date(year, monthIndex, day).getDay();
      if(weekday === 0){
        button.classList.add('is-sunday');
      }

      if(salesDates.has(dateString)){
        button.classList.add('is-has-sales');
      }

      if(selectedDateFilter === dateString){
        button.classList.add('is-selected');
      }

      button.addEventListener('click', function(){
        if(selectedDateFilter === dateString){
          selectedDateFilter = '';
        }else{
          selectedDateFilter = dateString;
        }

        applyDateFilter();
        buildCalendar();
      });

      grid.appendChild(button);
    }
  }

  function applyDateFilter(){
    const rows = getRows();
    let visibleCount = 0;

    rows.forEach(function(row){
      const rowDate = getRowDate(row);
      const show =
        !selectedDateFilter ||
        rowDate === selectedDateFilter;

      row.classList.toggle(
        'is-filter-hidden',
        !show
      );

      row.style.display = show ? '' : 'none';

      if(show){
        visibleCount += 1;
      }
    });

    const emptyMessage = getSalesColumn().querySelector('.scf-history-inline-empty-date');
    if(emptyMessage){
      emptyMessage.classList.toggle(
        'show',
        rows.length > 0 && visibleCount === 0
      );
    }
  }

  function syncCalendarVisibility(){
    const calendar = ensureCalendarStructure();
    const panel = getReceiptPanel();

    if(!calendar || !panel){
      return;
    }

    const hasReceipt = panel.classList.contains('has-receipt');
    calendar.classList.toggle('is-hidden', hasReceipt);
  }

  function resetCalendarFilter(){
    selectedDateFilter = '';
    applyDateFilter();
    buildCalendar();
    syncCalendarVisibility();
  }

  function refreshCalendar(){
    if(!isDesktopMonthView()){
      return;
    }

    buildCalendar();
    applyDateFilter();
    syncCalendarVisibility();
  }

  historyList.addEventListener('click', function(event){
    const backToMonths = event.target.closest('#scfSalesHistoryBack');
    if(backToMonths){
      selectedDateFilter = '';
    }
  }, true);

  window.__scfPdvInfra.eventBus.on('scf:cupom-historico-fechado', function(){
    requestAnimationFrame(function(){
      refreshCalendar();
    });
  });

  /*
   * Observa somente mudanças reais na lista de vendas.
   * A versão anterior também observava alterações de style/class e
   * as próprias mudanças internas do calendário. Isso fazia o
   * refreshCalendar() disparar outro MutationObserver infinitamente,
   * travando o sistema ao abrir um mês.
   */
  new MutationObserver(function(mutations){
    if(!isDesktopMonthView()){
      selectedDateFilter = '';
      return;
    }

    const precisaAtualizar =
      mutations.some(function(mutation){
        const target =
          mutation.target &&
          mutation.target.nodeType === 1
            ? mutation.target
            : mutation.target &&
              mutation.target.parentElement;

        if(
          target &&
          target.closest &&
          (
            target.closest(
              '.scf-history-inline-calendar'
            ) ||
            target.closest(
              '.scf-history-inline-empty-date'
            )
          )
        ){
          return false;
        }

        return Array.from(
          mutation.addedNodes || []
        )
          .concat(
            Array.from(
              mutation.removedNodes || []
            )
          )
          .some(function(node){
            if(
              !node ||
              node.nodeType !== 1
            ){
              return false;
            }

            return (
              node.matches &&
              (
                node.matches(
                  '.scf-sales-history-item'
                ) ||
                node.matches(
                  '.scf-history-month-sales-column'
                ) ||
                node.matches(
                  '.scf-history-month-detail-layout'
                )
              )
            ) ||
            (
              node.querySelector &&
              (
                node.querySelector(
                  '.scf-sales-history-item'
                ) ||
                node.querySelector(
                  '.scf-history-month-sales-column'
                )
              )
            );
          });
      });

    if(precisaAtualizar){
      requestAnimationFrame(
        refreshCalendar
      );
    }
  }).observe(historyList, {
    childList:true,
    subtree:true
  });

  let titleRefreshFrame = 0;

  new MutationObserver(function(){
    cancelAnimationFrame(
      titleRefreshFrame
    );

    titleRefreshFrame =
      requestAnimationFrame(
        refreshCalendar
      );
  }).observe(historyTitle, {
    childList:true,
    subtree:true,
    characterData:true
  });

  new MutationObserver(function(){
    refreshCalendar();
  }).observe(historyOverlay, {
    attributes: true,
    attributeFilter: ['class', 'aria-hidden']
  });

  desktopMq.addEventListener('change', function(){
    refreshCalendar();
  });

  refreshCalendar();
})();
