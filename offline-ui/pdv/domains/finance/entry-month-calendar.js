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

  var selectedDate = '';

  function paginaFinanceiroPrincipal(){
    var body = document.body;
    return Boolean(
      body &&
      body.classList.contains('scf-financeiro-registration-open') &&
      body.classList.contains('scf-financeiro-saldo-open') &&
      !body.classList.contains('scf-financeiro-entrada-open') &&
      !body.classList.contains('scf-financeiro-entrada-mes-open') &&
      !body.classList.contains('scf-financeiro-saida-open') &&
      !body.classList.contains('scf-financeiro-saida-mes-open')
    );
  }

  function anoAtualFinanceiro(){
    var select = document.getElementById('scfFinanceMainYearSelect');
    var valor = Number(select && select.value);
    return Number.isFinite(valor) && valor > 1900
      ? Math.trunc(valor)
      : new Date().getFullYear();
  }

  function garantirCalendario(){
    var form = document.getElementById('scfFinanceForm');
    if(!form) return null;

    var calendar = document.getElementById('scfFinanceSaldoMainCalendar');
    if(!calendar){
      calendar = document.createElement('section');
      calendar.id = 'scfFinanceSaldoMainCalendar';
      calendar.className = 'scf-history-inline-calendar';
      calendar.setAttribute('aria-label','Calendário financeiro do mês atual');
      calendar.innerHTML = ''
        + '<div class="scf-history-inline-calendar-weekdays"></div>'
        + '<div class="scf-history-inline-calendar-grid"></div>'
        + '<div class="scf-history-inline-calendar-hint">Clique em uma data.</div>';
      form.appendChild(calendar);
    }else if(calendar.parentElement !== form){
      form.appendChild(calendar);
    }

    return calendar;
  }

  function datasMovimentacaoDiaria(){
    var datas = new Set();

    try{
      financeDomain.getCashMovementDates()
          .forEach(
            function(dataMovimento){
              if(
                /^\d{2}\/\d{2}\/\d{4}$/.test(
                  String(dataMovimento || '')
                )
              ){
                datas.add(
                  String(dataMovimento)
                );
              }
            }
          );
    }catch(error){}

    /*
     * Fallback visual para a fotografia já renderizada.
     */
    document.querySelectorAll(
      '#scfFinanceSaldoView .scf-finance-daily-cash-table .scf-finance-entry-table-row span:first-child'
    ).forEach(function(cell){
      var value = String(cell.textContent || '').replace(/\s+/g,' ').trim();
      var match = value.match(/^(\d{2})\/(\d{2})(?:\/(\d{4}))?$/);
      if(!match) return;
      var year = match[3] || String(anoAtualFinanceiro());
      datas.add(match[1] + '/' + match[2] + '/' + year);
    });

    return datas;
  }

  function aplicarFiltroMovimentacoesCaixa(){
    /*
     * Caminho principal: o filtro entra no renderer do FINANCEIRO.
     * Assim uma data antiga usa movimentosCaixaHistoricoFinanceiro,
     * exatamente em vez de tentar esconder apenas as linhas do caixa atual.
     */
    financeDomain.filterCashMovementsByDate(
      selectedDate
    );
    return;

    /*
     * Fallback para versões antigas: filtra as linhas que já estão no DOM.
     */
    var chaveSelecionada = selectedDate
      ? selectedDate.slice(0,5)
      : '';

    document.querySelectorAll(
      '#scfFinanceSaldoView .scf-finance-daily-cash-table .scf-finance-entry-table-row'
    ).forEach(function(row){
      var primeiraCelula = row.querySelector('span:first-child');
      var textoData = String(
        primeiraCelula && primeiraCelula.textContent || ''
      ).replace(/\s+/g,' ').trim();

      var match = textoData.match(
        /^(\d{2})\/(\d{2})(?:\/(\d{4}))?$/
      );

      var chaveLinha = match
        ? match[1] + '/' + match[2]
        : '';

      var mostrar =
        !chaveSelecionada ||
        chaveLinha === chaveSelecionada;

      row.classList.toggle(
        'scf-finance-main-date-filter-hidden',
        !mostrar
      );
    });
  }

  function montarCalendario(){
    var calendar = garantirCalendario();
    if(!calendar) return;

    var weekdays = calendar.querySelector('.scf-history-inline-calendar-weekdays');
    var grid = calendar.querySelector('.scf-history-inline-calendar-grid');
    if(!weekdays || !grid) return;

    weekdays.replaceChildren();
    grid.replaceChildren();

    ['dom','seg','ter','qua','qui','sex','sáb'].forEach(function(label,index){
      var item = document.createElement('div');
      item.className = 'scf-history-inline-calendar-weekday' +
        (index === 0 ? ' is-sunday' : '');
      item.textContent = label;
      weekdays.appendChild(item);
    });

    var today = new Date();
    var year = anoAtualFinanceiro();
    var month = today.getMonth();
    var firstDay = new Date(year,month,1).getDay();
    var totalDays = new Date(year,month + 1,0).getDate();
    var totalCells = Math.ceil((firstDay + totalDays) / 7) * 7;
    var movementDates = datasMovimentacaoDiaria();

    for(var index = 0; index < totalCells; index += 1){
      var day = index - firstDay + 1;

      if(day < 1 || day > totalDays){
        var empty = document.createElement('button');
        empty.type = 'button';
        empty.className = 'scf-history-inline-calendar-day is-empty';
        empty.textContent = '0';
        empty.setAttribute('aria-hidden','true');
        empty.tabIndex = -1;
        grid.appendChild(empty);
        continue;
      }

      var dd = String(day).padStart(2,'0');
      var mm = String(month + 1).padStart(2,'0');
      var dateString = dd + '/' + mm + '/' + String(year);
      var button = document.createElement('button');

      button.type = 'button';
      button.className = 'scf-history-inline-calendar-day';
      button.textContent = String(day);
      button.dataset.date = dateString;
      button.setAttribute('aria-label',dateString);
      button.setAttribute('aria-pressed',selectedDate === dateString ? 'true' : 'false');

      if(new Date(year,month,day).getDay() === 0){
        button.classList.add('is-sunday');
      }

      if(
        day === today.getDate() &&
        month === today.getMonth() &&
        year === today.getFullYear()
      ){
        button.classList.add('is-today');
        button.setAttribute('aria-current','date');
      }

      if(movementDates.has(dateString)){
        button.classList.add('is-has-sales');
      }

      if(selectedDate === dateString){
        button.classList.add('is-selected');
      }

      grid.appendChild(button);
    }

    aplicarFiltroMovimentacoesCaixa();
  }

  function selecionarDiaCalendario(button){
    if(!button || !paginaFinanceiroPrincipal()) return;

    var date = String(
      button.dataset.date || ''
    ).trim();

    if(
      !/^\d{2}\/\d{2}\/\d{4}$/.test(
        date
      )
    ){
      return;
    }

    selectedDate =
      selectedDate === date
        ? ''
        : date;

    aplicarFiltroMovimentacoesCaixa();
    montarCalendario();
  }

  /*
   * Mesmo padrão de interação usado no calendário de
   * FINANCEIRO - ENTRADA - [MÊS]:
   * pointerdown captura o clique do mouse/toque antes de outros listeners.
   */
  document.addEventListener('pointerdown', function(event){
    var dayButton =
      event.target &&
      event.target.closest
        ? event.target.closest(
            '#scfFinanceSaldoMainCalendar .scf-history-inline-calendar-day[data-date]'
          )
        : null;

    if(
      !dayButton ||
      !paginaFinanceiroPrincipal()
    ){
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    selecionarDiaCalendario(
      dayButton
    );
  }, true);

  /*
   * Fallback de teclado/acessibilidade, também igual ao calendário
   * da página ENTRADA. O mouse já foi tratado no pointerdown.
   */
  document.addEventListener('click', function(event){
    var dayButton =
      event.target &&
      event.target.closest
        ? event.target.closest(
            '#scfFinanceSaldoMainCalendar .scf-history-inline-calendar-day[data-date]'
          )
        : null;

    if(
      !dayButton ||
      !paginaFinanceiroPrincipal()
    ){
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
      selecionarDiaCalendario(
        dayButton
      );
    }
  }, true);

  function sincronizar(){
    if(!paginaFinanceiroPrincipal()){
      selectedDate = '';
      aplicarFiltroMovimentacoesCaixa();
      return;
    }

    montarCalendario();
  }

  document.addEventListener('click', function(event){
    var button = event.target && event.target.closest
      ? event.target.closest('#scfFinanceMainCalendarButton')
      : null;

    if(!button) return;

    window.requestAnimationFrame(function(){
      window.requestAnimationFrame(sincronizar);
    });
  }, true);

  var yearSelect = document.getElementById('scfFinanceMainYearSelect');
  if(yearSelect){
    yearSelect.addEventListener('change', sincronizar);
  }

  var pending = false;
  var observer = new MutationObserver(function(){
    if(pending) return;
    pending = true;
    window.requestAnimationFrame(function(){
      pending = false;
      sincronizar();
    });
  });

  observer.observe(document.body,{
    attributes:true,
    attributeFilter:['class'],
    childList:true,
    subtree:true
  });

  sincronizar();
})();
