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

  const cashDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.cash;

  if(!cashDomain){
    throw new Error(
      'PDV cash domain indisponivel para finance.'
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
  let requestIdAtual = '';

  function monthViewOpen(){
    return desktopMq.matches &&
      document.body.classList.contains('scf-financeiro-registration-open') &&
      document.body.classList.contains('scf-financeiro-entrada-open') &&
      document.body.classList.contains('scf-financeiro-entrada-mes-open');
  }

  function entryView(){
    return document.getElementById('scfFinanceEntryView');
  }

  function rightHost(){
    return document.getElementById('scfFinanceForm');
  }

  function rows(){
    const view = entryView();
    return view
      ? Array.from(view.querySelectorAll('.scf-finance-entry-table-row'))
      : [];
  }

  function rowDate(row){
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

  function ensureCalendar(){
    if(!monthViewOpen()) return null;

    const host = rightHost();
    if(!host) return null;

    let calendar = document.getElementById('scfFinanceEntryCalendar');
    if(!calendar){
      calendar = document.createElement('section');
      calendar.id = 'scfFinanceEntryCalendar';
      calendar.className = 'scf-history-inline-calendar';
      calendar.setAttribute('aria-label','Calendário para filtrar as entradas por data');
      calendar.innerHTML = ''
        + '<div class="scf-history-inline-calendar-weekdays"></div>'
        + '<div class="scf-history-inline-calendar-grid"></div>'
        + '<div class="scf-history-inline-calendar-hint">Clique em uma data para filtrar as entradas do mês.</div>';
      host.appendChild(calendar);
    }

    if(!calendar.querySelector('.scf-history-inline-calendar-weekdays')){
      calendar.innerHTML = ''
        + '<div class="scf-history-inline-calendar-weekdays"></div>'
        + '<div class="scf-history-inline-calendar-grid"></div>'
        + '<div class="scf-history-inline-calendar-hint">Clique em uma data para filtrar as entradas do mês.</div>';
    }

    return calendar;
  }

  function currentOpenCash(){
    /*
     * Fonte principal: a própria sessão mantida pelo módulo do caixa.
     * É a mesma variável usada pelo PDV para SANGRIA / SUPRIMENTO /
     * FECHAMENTO, portanto não sofre atraso da consulta do Financeiro.
     */
    try{
      const caixaReal =
        cashDomain.currentCash;

      if(
        caixaReal &&
        caixaReal.id &&
        String(
          caixaReal.status || 'ABERTO'
        ).toUpperCase() === 'ABERTO'
      ){
        return caixaReal;
      }
    }catch(error){}

    /*
     * Segunda fonte: fotografia mais recente recebida pelo Financeiro.
     */
    const consulta =
      financeDomain.cashSnapshot &&
      typeof financeDomain.cashSnapshot === 'object'
        ? financeDomain.cashSnapshot
        : null;

    if(
      consulta &&
      consulta.aberto === true &&
      consulta.caixa &&
      consulta.caixa.id
    ){
      return consulta.caixa;
    }

    return null;
  }

  function status(message,error){
    const node = document.getElementById('scfFinanceEntryNewStatus');
    if(!node) return;

    node.textContent = typeof saldoTexto === 'function'
      ? saldoTexto(message)
      : String(message || '').replace(/\s+/g,' ').trim();

    node.classList.toggle('is-error', error === true);
  }

  function formatMoneyInput(input){
    if(!input) return;
    const digits = String(input.value || '').replace(/\D+/g,'');
    const cents = Number(digits || '0');
    input.value = cents.toLocaleString('pt-BR',{
      style:'currency',
      currency:'BRL'
    });
  }

  function numberValue(raw){
    const cleaned = String(raw || '')
      .replace(/\s+/g,'')
      .replace(/R\$/gi,'')
      .replace(/\./g,'')
      .replace(',', '.')
      .replace(/[^0-9.-]/g,'');

    const number = Number(cleaned);
    return Number.isFinite(number) ? number : 0;
  }

  function updateLockState(){
    const form = document.getElementById('scfFinanceEntryNewForm');
    if(!form) return;

    const caixa = currentOpenCash();
    const unlocked = !!(caixa && caixa.id);

    form.querySelectorAll('input,select,button').forEach(function(node){
      node.disabled = !unlocked;
      if(node.matches('input')){
        node.readOnly = !unlocked;
      }
    });

    if(unlocked){
      form.classList.remove('is-cash-locked');
      status('', false);
    }else{
      form.classList.add('is-cash-locked');
      status('ABRA O CAIXA NO PDV PARA CADASTRAR UMA ENTRADA.', true);
    }
  }

  function clearForm(preserveStatus){
    const amount = document.getElementById('scfFinanceEntryNewAmount');
    const date = document.getElementById('scfFinanceEntryNewDate');
    const reason = document.getElementById('scfFinanceEntryNewReason');
    const desc = document.getElementById('scfFinanceEntryNewDescription');

    if(amount) amount.value = '';
    if(date){
      const now = new Date();
      date.value = [
        String(now.getDate()).padStart(2,'0'),
        String(now.getMonth() + 1).padStart(2,'0'),
        String(now.getFullYear())
      ].join('/');
    }
    if(reason) reason.selectedIndex = -1;
    if(desc) desc.value = '';

    if(!preserveStatus){
      status('', false);
    }

    updateLockState();
  }

  function ensureForm(){
    if(!monthViewOpen()) return null;

    const parent = rightHost();
    const cal = ensureCalendar();
    if(!parent || !cal) return null;

    let current = document.getElementById('scfFinanceEntryNewForm');
    if(!current){
      current = document.createElement('section');
      current.id = 'scfFinanceEntryNewForm';
      current.setAttribute('aria-label', 'Cadastrar nova entrada');
      current.innerHTML = ''
        + '<h3 class="scf-finance-entry-new-title">CADASTRAR NOVA ENTRADA</h3>'
        + '<div class="scf-finance-entry-new-row">'
        +   '<div class="scf-finance-entry-new-field">'
        +     '<label class="scf-finance-entry-new-label" for="scfFinanceEntryNewAmount">VALOR</label>'
        +     '<input class="scf-finance-entry-new-input" id="scfFinanceEntryNewAmount" inputmode="decimal" autocomplete="off" placeholder="R$ 0,00" type="text">'
        +   '</div>'
        +   '<div class="scf-finance-entry-new-field">'
        +     '<label class="scf-finance-entry-new-label" for="scfFinanceEntryNewDate">RECEBIMENTO</label>'
        +     '<input class="scf-finance-entry-new-input" id="scfFinanceEntryNewDate" inputmode="numeric" maxlength="10" autocomplete="off" placeholder="DD/MM/AAAA" type="text" title="RECEBIMENTO" aria-label="Data do recebimento">'
        +   '</div>'
        + '</div>'
        + '<div class="scf-finance-entry-new-field">'
        +   '<label class="scf-finance-entry-new-label" for="scfFinanceEntryNewReason">MOTIVO</label>'
        +   '<select class="scf-finance-entry-new-input" id="scfFinanceEntryNewReason" aria-label="Motivo da entrada">'
        +     '<option value="RECEBIMENTO AVULSO">RECEBIMENTO AVULSO</option>'
        +     '<option value="SUPRIMENTO DE CAIXA">SUPRIMENTO DE CAIXA</option>'
        +   '</select>'
        + '</div>'
        + '<div class="scf-finance-entry-new-field">'
        +   '<label class="scf-finance-entry-new-label" for="scfFinanceEntryNewDescription">DESCRIÇÃO</label>'
        +   '<input class="scf-finance-entry-new-input" id="scfFinanceEntryNewDescription" maxlength="180" autocomplete="off" type="text" placeholder="DESCREVA A ENTRADA">'
        + '</div>'
        + '<div class="scf-cash-photo-actions" id="scfFinanceEntryNewActions">'
        +   '<button class="finalize-photo-paid-btn" id="scfFinanceEntryNewConfirm" type="button">CONFIRMAR</button>'
        +   '<button id="scfFinanceEntryNewClear" type="button">LIMPAR</button>'
        + '</div>'
        + '<div class="scf-finance-entry-new-status" id="scfFinanceEntryNewStatus" aria-live="polite"></div>';

      cal.insertAdjacentElement('afterend', current);

      const reason = document.getElementById('scfFinanceEntryNewReason');
      if(reason){
        reason.selectedIndex = -1;
      }

      document.getElementById('scfFinanceEntryNewAmount')?.addEventListener('input', function(event){
        formatMoneyInput(event.currentTarget);
      });

      const entryDate =
        document.getElementById(
          'scfFinanceEntryNewDate'
        );

      if(entryDate){
        const now = new Date();

        entryDate.value = [
          String(now.getDate()).padStart(2,'0'),
          String(now.getMonth() + 1).padStart(2,'0'),
          String(now.getFullYear())
        ].join('/');

        entryDate.addEventListener(
          'input',
          function(event){
            const input = event.currentTarget;
            const digits = String(input.value || '')
              .replace(/\D+/g,'')
              .slice(0,8);

            let formatted = digits;

            if(digits.length > 4){
              formatted =
                digits.slice(0,2) + '/' +
                digits.slice(2,4) + '/' +
                digits.slice(4);
            }else if(digits.length > 2){
              formatted =
                digits.slice(0,2) + '/' +
                digits.slice(2);
            }

            input.value = formatted;
          }
        );
      }

      document.getElementById('scfFinanceEntryNewClear')?.addEventListener('click', function(){
        clearForm(false);
      });

      document.getElementById('scfFinanceEntryNewConfirm')?.addEventListener('click', function(){
        if(requestIdAtual){
          return;
        }

        const caixa = currentOpenCash();
        if(!caixa || !caixa.id){
          status('ABRA O CAIXA NO PDV PARA CADASTRAR UMA ENTRADA.', true);
          updateLockState();
          return;
        }

        const valor = numberValue(document.getElementById('scfFinanceEntryNewAmount')?.value);
        const dataRecebimento = String(document.getElementById('scfFinanceEntryNewDate')?.value || '').trim();
        const motivo = String(document.getElementById('scfFinanceEntryNewReason')?.value || '').replace(/\s+/g,' ').trim().toUpperCase();
        const descricao = String(document.getElementById('scfFinanceEntryNewDescription')?.value || '').replace(/\s+/g,' ').trim().toUpperCase();

        if(valor <= 0){
          status('INFORME UM VALOR MAIOR QUE ZERO.', true);
          return;
        }

        if(!/^\d{2}\/\d{2}\/\d{4}$/.test(dataRecebimento)){
          status('INFORME A DATA DO RECEBIMENTO NO FORMATO DD/MM/AAAA.', true);
          return;
        }

        const partesData = dataRecebimento.split('/');
        const dataValida = new Date(
          Number(partesData[2]),
          Number(partesData[1]) - 1,
          Number(partesData[0])
        );

        if(
          dataValida.getFullYear() !== Number(partesData[2]) ||
          dataValida.getMonth() !== Number(partesData[1]) - 1 ||
          dataValida.getDate() !== Number(partesData[0])
        ){
          status('INFORME UMA DATA DE RECEBIMENTO VÁLIDA.', true);
          return;
        }

        if(!motivo){
          status('INFORME O MOTIVO.', true);
          return;
        }

        if(!descricao){
          status('INFORME A DESCRIÇÃO DA ENTRADA.', true);
          return;
        }

        const detalhe = encodeURIComponent(JSON.stringify({
          fornecedorId:'',
          fornecedorNome:'',
          descricao:descricao,
          dataRecebimento:dataRecebimento,
          recebimento:dataRecebimento
        }));

        requestIdAtual = 'scf-finance-entrada-' + Date.now() + '-' + Math.random().toString(36).slice(2,8);

        current.querySelectorAll('input,select,button').forEach(function(node){
          node.disabled = true;
          if(node.matches('input')){
            node.readOnly = true;
          }
        });

        status('CADASTRANDO ENTRADA...', false);

        window.__scfPdvInfra.shellBridge.post({
          type:'SCF_CAIXA_MOVIMENTO_REGISTRAR',
          requestId:requestIdAtual,
          caixaSessaoId:caixa.id,
          tipo:'SUPRIMENTO',
          valor:valor,
          motivo:motivo + '||SCFDETALHE||' + detalhe,
          fornecedorId:'',
          fornecedorNome:'',
          descricao:descricao,
          dataRecebimento:dataRecebimento,
          recebimento:dataRecebimento
        }, '*');
      });
    }else if(current.previousElementSibling !== cal){
      cal.insertAdjacentElement('afterend', current);
    }

    updateLockState();
    return current;
  }

  function ensureEmptyMessage(){
    const view = entryView();
    if(!view) return null;

    let empty = view.querySelector('.scf-finance-entry-date-filter-empty');
    if(!empty){
      empty = document.createElement('div');
      empty.className = 'scf-finance-entry-date-filter-empty';
      empty.textContent = 'NENHUMA ENTRADA ENCONTRADA PARA A DATA SELECIONADA.';
      empty.hidden = true;
      view.appendChild(empty);
    }
    return empty;
  }

  function updateDateTotals(currentRows){
    let receipts = 0;
    let others = 0;

    currentRows.forEach(function(row){
      if(selectedDateFilter && rowDate(row) !== selectedDateFilter){
        return;
      }

      const category = String(row.dataset.scfFinanceEntryCategory || '').trim().toUpperCase();
      const cells = row.querySelectorAll('span');
      const value = cells && cells[2] && typeof saldoNumero === 'function'
        ? Math.abs(saldoNumero(String(cells[2].textContent || '').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'')))
        : 0;

      if(category === 'A_RECEBER'){
        receipts += value;
      }else{
        others += value;
      }
    });

    const total = receipts + others;
    const receiptsEl = document.getElementById('scfFinanceEntryTotalReceipts');
    const othersEl = document.getElementById('scfFinanceEntryTotalOthers');
    const totalEl = document.getElementById('scfFinanceEntryTotalOverall');

    if(receiptsEl && typeof saldoMoeda === 'function') receiptsEl.textContent = saldoMoeda(receipts);
    if(othersEl && typeof saldoMoeda === 'function') othersEl.textContent = saldoMoeda(others);
    if(totalEl && typeof saldoMoeda === 'function') totalEl.textContent = saldoMoeda(total);
  }

  function applyDateFilter(){
    if(!monthViewOpen()) return;

    const currentRows = rows();
    const activeFilter = typeof financeEntryStatusFilter !== 'undefined'
      ? String(financeEntryStatusFilter || 'ALL').trim().toUpperCase()
      : 'ALL';

    let visibleCount = 0;

    currentRows.forEach(function(row){
      const category = String(row.dataset.scfFinanceEntryCategory || '').trim().toUpperCase();

      const passesDate = !selectedDateFilter || rowDate(row) === selectedDateFilter;
      const passesStatus = activeFilter === 'ALL' || category === activeFilter;
      const show = passesDate && passesStatus;

      row.classList.toggle('scf-finance-entry-date-filter-hidden', !show);
      if(show){
        row.style.removeProperty('display');
        visibleCount += 1;
      }else{
        row.style.setProperty('display','none','important');
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
  }

  function buildCalendar(){
    if(!monthViewOpen()) return;

    if(selectedMonth === null || selectedYear === null || !Number.isFinite(Number(selectedYear))){
      if(!inferMonthFromRows() && !inferMonthFromTitle()) return;
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
      item.className = 'scf-history-inline-calendar-weekday' + (index === 0 ? ' is-sunday' : '');
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
      button.setAttribute('aria-label','Filtrar entradas de ' + dateString);

      if(new Date(selectedYear,selectedMonth,day).getDay() === 0){
        button.classList.add('is-sunday');
      }

      if(day === today.getDate() && selectedMonth === today.getMonth() && Number(selectedYear) === today.getFullYear()){
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

    const dateString = String(button.dataset.date || '').trim();
    if(!/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) return;

    selectedDateFilter = selectedDateFilter === dateString ? '' : dateString;
    applyDateFilter();
    buildCalendar();
  }

  /*
   * Captura mês/ano diretamente da pasta clicada. Assim o calendário é
   * montado inclusive quando a tabela do mês estiver completamente vazia.
   */
  document.addEventListener('click', function(event){
    const folder = event.target && event.target.closest
      ? event.target.closest('#scfFinanceEntryView .scf-sales-history-month-folder')
      : null;

    if(!folder){
      return;
    }

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
  }, true);

  document.addEventListener('pointerdown', function(event){
    const button = event.target && event.target.closest
      ? event.target.closest('#scfFinanceEntryCalendar .scf-history-inline-calendar-day[data-date]')
      : null;

    if(!button || !monthViewOpen()) return;

    event.preventDefault();
    event.stopPropagation();
    selectCalendarDay(button);
  }, true);

  document.addEventListener('click', function(event){
    const button = event.target && event.target.closest
      ? event.target.closest('#scfFinanceEntryCalendar .scf-history-inline-calendar-day[data-date]')
      : null;

    if(!button || !monthViewOpen()) return;

    event.preventDefault();
    event.stopPropagation();
    if(typeof event.stopImmediatePropagation === 'function'){
      event.stopImmediatePropagation();
    }

    if(event.detail === 0){
      selectCalendarDay(button);
    }
  }, true);

  function removeDynamicRightPanel(){
    document.getElementById('scfFinanceEntryCalendar')?.remove();
    document.getElementById('scfFinanceEntryNewForm')?.remove();
  }

  function sync(){
    pending = false;

    if(!monthViewOpen()){
      selectedDateFilter = '';
      selectedMonth = null;
      selectedYear = null;
      removeDynamicRightPanel();
      return;
    }

    buildCalendar();
    ensureForm();
    applyDateFilter();
  }

  function requestSync(){
    if(pending) return;
    pending = true;
    window.requestAnimationFrame(function(){
      window.requestAnimationFrame(sync);
    });
  }

  window.__scfPdvInfra.shellBridge.onMessage( function(event){
    const data = event && event.data && typeof event.data === 'object'
      ? event.data
      : null;

    if(!data) return;

    if(
      data.type === 'SCF_CAIXA_MOVIMENTO_REGISTRADO' &&
      requestIdAtual &&
      (!data.requestId || String(data.requestId) === String(requestIdAtual))
    ){
      requestIdAtual = '';
      clearForm(true);
      status(data.message || 'ENTRADA CADASTRADA COM SUCESSO.', false);
      requestSync();
      return;
    }

    if(
      data.type === 'SCF_CAIXA_MOVIMENTO_ERRO' &&
      requestIdAtual &&
      (!data.requestId || String(data.requestId) === String(requestIdAtual))
    ){
      requestIdAtual = '';
      updateLockState();
      status(data.message || 'NÃO FOI POSSÍVEL CADASTRAR A ENTRADA.', true);
      return;
    }

    if(
      data.type === 'SCF_FINANCEIRO_SALDO_DADOS_RESULTADO' ||
      data.type === 'SCF_CAIXA_CONSULTA_RESULTADO' ||
      data.type === 'SCF_CAIXA_ABERTO' ||
      data.type === 'SCF_CAIXA_FECHADO'
    ){
      requestSync();
    }
  });

  document.addEventListener('click', function(event){
    const totalsButton = event.target && event.target.closest
      ? event.target.closest('#scfFinanceEntryStatusTotals [data-scf-finance-entry-filter]')
      : null;

    if(!totalsButton || !monthViewOpen()) return;

    window.requestAnimationFrame(applyDateFilter);
  }, true);

  const observer = new MutationObserver(requestSync);
  observer.observe(document.body,{
    attributes:true,
    attributeFilter:['class']
  });

  window.__scfPdvInfra.shellBridge.onMessage( function(){
    if(!paginaFinanceiroPrincipal()) return;
    window.requestAnimationFrame(sincronizar);
  });

  desktopMq.addEventListener?.('change', requestSync);
  requestSync();
})();
