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

  var MONTHS = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
  var resumoRequestId = '';
  var resumoVendas = [];
  var resumoCaixaConsulta = null;
  var resumoCarregando = false;

  function numero(valor){
    if(typeof valor === 'number'){
      return Number.isFinite(valor) ? valor : 0;
    }

    var texto = String(valor == null ? '' : valor)
      .trim()
      .replace(/R\$/gi,'')
      .replace(/\s/g,'')
      .replace(/\.(?=\d{3}(?:\D|$))/g,'')
      .replace(',','.')
      .replace(/[^0-9.-]/g,'');

    var n = Number(texto);
    return Number.isFinite(n) ? n : 0;
  }

  function texto(valor){
    return String(valor == null ? '' : valor).replace(/\s+/g,' ').trim();
  }

  function normalizar(valor){
    return texto(valor)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toUpperCase();
  }

  function moeda(valor){
    return numero(valor).toLocaleString('pt-BR',{
      style:'currency',
      currency:'BRL'
    });
  }

  function percentual(valor){
    return numero(valor).toLocaleString('pt-BR',{
      minimumFractionDigits:1,
      maximumFractionDigits:1
    }) + '%';
  }

  function paymentKey(valor){
    var metodo = normalizar(valor);
    if(metodo.indexOf('CREDITO') >= 0) return 'credito';
    if(metodo.indexOf('DEBITO') >= 0) return 'debito';
    if(metodo.indexOf('DINHEIRO') >= 0) return 'dinheiro';
    if(metodo.indexOf('PIX') >= 0) return 'pix';
    return '';
  }

  function paymentKeysFromLabel(rotulo){
    var mapa = {};
    texto(rotulo).split(/\s*\+\s*/).forEach(function(parte){
      var chave = paymentKey(parte);
      if(chave) mapa[chave] = true;
    });
    return Object.keys(mapa);
  }

  function dataVenda(venda){
    var valor = venda && venda.saleDate;
    var data = valor ? new Date(valor) : null;
    return data && !Number.isNaN(data.getTime()) ? data : null;
  }

  function removerDuplicadas(vendas){
    var mapa = new Map();

    vendas.forEach(function(venda,indice){
      var saleId = texto(
        venda && (
          venda.saleId ||
          venda.identificadordavenda
        )
      );

      var chave = saleId || [
        texto(venda && venda.saleDate),
        texto(venda && venda.totalValue),
        String(indice)
      ].join('|');

      mapa.set(chave,venda);
    });

    return Array.from(mapa.values());
  }

  function calcularMetricas(vendas){
    var agora = new Date();
    var ano = agora.getFullYear();
    var mesAtual = agora.getMonth();
    var meses = new Array(12).fill(0);
    var metodos = {
      pix:0,
      debito:0,
      credito:0,
      dinheiro:0
    };

    vendas.forEach(function(venda){
      var data = dataVenda(venda);
      if(!data || data.getFullYear() !== ano) return;

      var valorVenda = Math.max(0,numero(venda && venda.totalValue));
      meses[data.getMonth()] += valorVenda;

      if(data.getMonth() !== mesAtual) return;

      var partes = venda && Array.isArray(venda.paymentParts)
        ? venda.paymentParts
        : [];

      if(partes.length){
        partes.forEach(function(parte){
          var chave = paymentKey(
            parte && (
              parte.method ||
              parte.metodo ||
              parte.paymentMethod
            )
          );

          var valorParte = numero(
            parte && (
              parte.amount != null
                ? parte.amount
                : parte.valor
            )
          );

          if(chave){
            metodos[chave] += Math.max(0,valorParte);
          }
        });
        return;
      }

      var chaves = paymentKeysFromLabel(venda && venda.paymentMethod);
      if(chaves.length === 1){
        metodos[chaves[0]] += valorVenda;
      }else if(chaves.length > 1 && valorVenda > 0){
        var quota = valorVenda / chaves.length;
        chaves.forEach(function(chave){
          metodos[chave] += quota;
        });
      }
    });

    return {
      ano:ano,
      mesAtual:mesAtual,
      meses:meses,
      vendasMes:meses[mesAtual] || 0,
      metodos:metodos
    };
  }

  function saldoDisponivelAtual(){
    var consulta = resumoCaixaConsulta;
    var caixa = consulta && consulta.aberto === true && consulta.caixa
      ? consulta.caixa
      : null;

    var resumo = caixa && caixa.resumo
      ? caixa.resumo
      : null;

    if(!resumo) return 0;

    return numero(
      resumo.saldoEsperado != null
        ? resumo.saldoEsperado
        : caixa.saldoEsperado
    ) +
      numero(resumo.recebimentosPix) +
      numero(resumo.recebimentosDebito) +
      numero(resumo.recebimentosCredito);
  }

  function setText(id,valor){
    var node = document.getElementById(id);
    if(node) node.textContent = String(valor);
  }

  function markup(){
    var bars = MONTHS.map(function(month,index){
      return ''
        + '<div class="scf-fin-v3-bar-item" data-scf-fin-resumo-mes="' + index + '">'
        +   '<div class="scf-fin-v3-bar-track"><div class="scf-fin-v3-bar-fill" style="height:2%;opacity:.22"></div></div>'
        +   '<div class="scf-fin-v3-bar-label">' + month + '</div>'
        + '</div>';
    }).join('');

    return ''
      + '<section id="scfFinanceDashboardV3" aria-label="Resumo financeiro">'
      +   '<div id="scfFinanceDashboardV3Top">'
      +     '<div class="scf-fin-v3-card is-wide is-main"><div class="scf-fin-v3-label">SALDO DISPONÍVEL</div><div class="scf-fin-v3-value" id="scfFinanceDashboardV3SaldoValue">R$ 0,00</div></div>'
      +     '<div class="scf-fin-v3-card"><div class="scf-fin-v3-label">A RECEBER</div><div class="scf-fin-v3-value">R$ 0,00</div></div>'
      +     '<div class="scf-fin-v3-card"><div class="scf-fin-v3-label">A PAGAR</div><div class="scf-fin-v3-value">R$ 0,00</div></div>'
      +     '<div class="scf-history-annual-card scf-history-annual-payment-card is-wide" id="scfFinanceDashboardV3Composition">'
      +       '<div class="scf-history-annual-donut" id="scfFinanceDashboardV3Donut" style="background:conic-gradient(#e5e7eb 0% 100%)">'
      +         '<div class="scf-history-annual-donut-center"></div>'
      +       '</div>'
      +       '<div class="scf-history-annual-payment-legend">'
      +         '<div class="scf-history-annual-payment-row"><span class="scf-history-annual-payment-dot" style="background:#10b981"></span><span class="scf-history-annual-payment-name">PIX</span><strong class="scf-history-annual-payment-pct" id="scfFinanceDashboardV3PixPct">0,0%</strong></div>'
      +         '<div class="scf-history-annual-payment-row"><span class="scf-history-annual-payment-dot" style="background:#7c3aed"></span><span class="scf-history-annual-payment-name">DÉBITO</span><strong class="scf-history-annual-payment-pct" id="scfFinanceDashboardV3DebitoPct">0,0%</strong></div>'
      +         '<div class="scf-history-annual-payment-row"><span class="scf-history-annual-payment-dot" style="background:#2563eb"></span><span class="scf-history-annual-payment-name">CRÉDITO</span><strong class="scf-history-annual-payment-pct" id="scfFinanceDashboardV3CreditoPct">0,0%</strong></div>'
      +         '<div class="scf-history-annual-payment-row"><span class="scf-history-annual-payment-dot" style="background:#f59e0b"></span><span class="scf-history-annual-payment-name">DINHEIRO</span><strong class="scf-history-annual-payment-pct" id="scfFinanceDashboardV3DinheiroPct">0,0%</strong></div>'
      +       '</div>'
      +     '</div>'
      +     '<div class="scf-fin-v3-card"><div class="scf-fin-v3-label">VENDAS DO MÊS</div><div class="scf-fin-v3-value" id="scfFinanceDashboardV3VendasMesValue">R$ 0,00</div></div>'
      +     '<div class="scf-fin-v3-card"><div class="scf-fin-v3-label">CONTAS VENCIDAS</div><div class="scf-fin-v3-value">0</div></div>'
      +   '</div>'
      +   '<div class="scf-fin-v3-card is-wide" id="scfFinanceDashboardV3Trend">'
      +     '<div id="scfFinanceDashboardV3TrendTitle">EVOLUÇÃO DAS VENDAS — JAN → DEZ</div>'
      +     '<div id="scfFinanceDashboardV3Bars">' + bars + '</div>'
      +   '</div>'
      + '</section>';
  }

  function renderizar(){
    if(
      !document.body.classList.contains('scf-financeiro-registration-open') ||
      document.body.classList.contains('scf-financeiro-saldo-open')
    ){
      return false;
    }

    var dashboard = document.getElementById('scfFinanceDashboardV3');
    if(!dashboard) return false;

    var metricas = calcularMetricas(resumoVendas);
    var metodos = metricas.metodos;

    setText('scfFinanceDashboardV3SaldoValue',moeda(saldoDisponivelAtual()));
    setText('scfFinanceDashboardV3VendasMesValue',moeda(metricas.vendasMes));

    var totalMetodos =
      metodos.pix +
      metodos.debito +
      metodos.credito +
      metodos.dinheiro;

    var pctPix = totalMetodos > 0 ? metodos.pix / totalMetodos * 100 : 0;
    var pctDebito = totalMetodos > 0 ? metodos.debito / totalMetodos * 100 : 0;
    var pctCredito = totalMetodos > 0 ? metodos.credito / totalMetodos * 100 : 0;
    var pctDinheiro = totalMetodos > 0 ? metodos.dinheiro / totalMetodos * 100 : 0;

    setText('scfFinanceDashboardV3PixPct',percentual(pctPix));
    setText('scfFinanceDashboardV3DebitoPct',percentual(pctDebito));
    setText('scfFinanceDashboardV3CreditoPct',percentual(pctCredito));
    setText('scfFinanceDashboardV3DinheiroPct',percentual(pctDinheiro));

    var pixFim = Math.min(100,pctPix);
    var debitoFim = Math.min(100,pixFim + pctDebito);
    var creditoFim = Math.min(100,debitoFim + pctCredito);
    var dinheiroFim = Math.min(100,creditoFim + pctDinheiro);
    var donut = document.getElementById('scfFinanceDashboardV3Donut');

    if(donut){
      donut.style.background = [
        'conic-gradient(',
        '#10b981 0% ' + pixFim + '%,',
        '#7c3aed ' + pixFim + '% ' + debitoFim + '%,',
        '#2563eb ' + debitoFim + '% ' + creditoFim + '%,',
        '#f59e0b ' + creditoFim + '% ' + dinheiroFim + '%,',
        '#e5e7eb ' + dinheiroFim + '% 100%',
        ')'
      ].join('');
    }

    var maior = Math.max.apply(null,metricas.meses.concat([0]));
    var itens = Array.from(
      document.querySelectorAll('#scfFinanceDashboardV3Bars [data-scf-fin-resumo-mes]')
    );

    itens.forEach(function(item,index){
      var valorMes = Math.max(0,numero(metricas.meses[index]));
      var fill = item.querySelector('.scf-fin-v3-bar-fill');
      var altura = valorMes > 0 && maior > 0
        ? Math.max(8,Math.min(100,valorMes / maior * 100))
        : 2;
      var futuro = index > metricas.mesAtual;

      if(fill){
        fill.style.height = altura.toFixed(2) + '%';
        fill.style.opacity = valorMes > 0 ? '1' : (futuro ? '.12' : '.24');
      }

      item.title = MONTHS[index] + ' — ' + moeda(valorMes);
      item.setAttribute('aria-label',MONTHS[index] + ' — ' + moeda(valorMes));
    });

    return true;
  }

  function solicitar(offset,reiniciar){
    if(
      !document.body.classList.contains('scf-financeiro-registration-open') ||
      document.body.classList.contains('scf-financeiro-saldo-open')
    ){
      return false;
    }

    if(reiniciar === true){
      resumoRequestId = [
        'financeiro-resumo',
        Date.now(),
        Math.random().toString(36).slice(2,8)
      ].join('-');
      resumoVendas = [];
      resumoCaixaConsulta = null;
      resumoCarregando = false;
    }

    if(!resumoRequestId || resumoCarregando) return false;

    resumoCarregando = true;
    window.__scfPdvInfra.shellBridge.post({
      type:'SCF_FINANCEIRO_RESUMO_DADOS_SOLICITAR',
      requestId:resumoRequestId,
      offset:Math.max(0,Math.trunc(numero(offset))),
      limit:50
    },'*');

    return true;
  }

  function rebuild(){
    if(
      !document.body.classList.contains('scf-financeiro-registration-open') ||
      document.body.classList.contains('scf-financeiro-saldo-open')
    ){
      return false;
    }

    var frame = document.querySelector('#fiscalDesktopProductPhoto .fiscal-desktop-product-photo-frame');
    if(!frame) return false;

    var form = document.getElementById('scfFinanceForm');
    if(!form){
      form = document.createElement('div');
      form.id = 'scfFinanceForm';
      frame.appendChild(form);
    }else if(form.parentElement !== frame){
      frame.appendChild(form);
    }

    form.classList.add('scf-finance-dashboard-v3');
    form.innerHTML = markup();
    form.removeAttribute('hidden');
    form.setAttribute('aria-hidden','false');
    form.style.setProperty('display','flex','important');
    form.style.setProperty('visibility','visible','important');
    form.style.setProperty('opacity','1','important');
    form.style.setProperty('pointer-events','auto','important');

    renderizar();

    if(!resumoRequestId){
      solicitar(0,true);
    }

    return true;
  }

  function schedule(){
    [0,30,100,250,600].forEach(function(delay){
      window.setTimeout(rebuild,delay);
    });
  }

  function limparEstado(){
    resumoRequestId = '';
    resumoVendas = [];
    resumoCaixaConsulta = null;
    resumoCarregando = false;
  }

  window.__scfPdvInfra.shellBridge.onMessage(function(event){
    var data = event && event.data && typeof event.data === 'object' ? event.data : null;
    if(!data) return;

    if(
      data.type === 'SCF_LAYOUT_PRINCIPAL_PAGINA_SOLICITADA' &&
      String(data.pagina || '').trim().toUpperCase() === 'FINANCEIRO'
    ){
      schedule();
      return;
    }

    if(
      data.type === 'SCF_FINANCEIRO_RESUMO_DADOS_RESULTADO' &&
      texto(data.requestId) === resumoRequestId
    ){
      resumoCarregando = false;

      var incoming = Array.isArray(data.vendas)
        ? data.vendas
        : [];

      if(numero(data.offset) === 0){
        resumoVendas = incoming.slice();
        if(data.caixaConsulta){
          resumoCaixaConsulta = data.caixaConsulta;
        }
      }else{
        resumoVendas = resumoVendas.concat(incoming);
      }

      resumoVendas = removerDuplicadas(resumoVendas);

      if(data.hasMore === true && incoming.length > 0){
        var proximoOffset = Math.trunc(numero(data.nextOffset));
        if(proximoOffset <= numero(data.offset)){
          proximoOffset = numero(data.offset) + incoming.length;
        }
        solicitar(proximoOffset,false);
        return;
      }

      renderizar();
      return;
    }

    if(
      data.type === 'SCF_FINANCEIRO_RESUMO_DADOS_ERRO' &&
      texto(data.requestId) === resumoRequestId
    ){
      resumoCarregando = false;
      console.warn(
        'FINANCEIRO RESUMO — dados não carregados:',
        data.message || data.mensagem || 'erro desconhecido'
      );
    }
  });

  new MutationObserver(function(){
    if(
      document.body.classList.contains('scf-financeiro-registration-open') &&
      !document.body.classList.contains('scf-financeiro-saldo-open')
    ){
      rebuild();
      return;
    }

    limparEstado();
  }).observe(document.body,{attributes:true,attributeFilter:['class']});

  if(
    document.body.classList.contains('scf-financeiro-registration-open') &&
    !document.body.classList.contains('scf-financeiro-saldo-open')
  ){
    schedule();
  }
})();
