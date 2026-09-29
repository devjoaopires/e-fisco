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
  const estadosPaineis = new Map();
  const estilosChrome = new Map();

  /*
   * Ícone fornecido para os botões ENTRADA e SAÍDA.
   * Mantido embutido para preservar o arquivo único e autocontido.
   */
  const financeMovementIconSrc =
    'data:image/png;base64,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3vnFap3tNcsIwNQAltje+XVqp+01bxCAqQFssL3zO1W17TW7CMDUAMpt73y1ara95iABmBrAQds736zsH/BhAjA1gMP2954ACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAACIAAxAXwigkB/IsAXGOBCQE8SwCuMdOEAP5CAK5RaEIAEwnANW42IYBfEoBrZJgQQBYBuIavxn3/tbEE4B7Puh/AC4oA3GOk+wHkEYCLxH/jtv8TPQnATVa7HcA6RQBucoPbAdxMAO6ywV3/JYoA3GVIs5v+/VkE4DbPuxnAKkUAbnPeCff8n7yAANznbvcCGKcIwAAec8v/k4oAjPhGYL07/jf4CMAMkve44X9PL0UAhtBvW+T9b++nCMCc7wQi/mZwRbwiAJOYHtEPhPwzjRyC5ABUTlXk/H+aqwjAOOKmfBkZ/Uf/GK8IwER6FX0bfv3fFp9l7ACkB6BUasErYb1E5PiaglSDD58AlFLxOQu37A/D9wMn9r+7eGSC2cdOAKdfCoYMv8VBRlye5oWjJgDhEAABEAABEAABEAABEAABEAABdB2A/Y9MjjFoU6mz//GWOmJ7TXMMkzaURtsyj6j99l81ejJpM0mw73K/qrC/6GxGbSa97busUO/aXzSYUZvJQPsu31Wv2V90JaM2kyH2Xb6mVtlfdDujNpNc+y5XqefsL5rFqM1kmn2Xz6mn7C96gVGbybP2XT6l5thf9D6jNpMt9l3OUQ9YfBQYLWg8NfEBdZfG5XE/ZtYmkqah8i6VqbHqToZtIr/WUJmpkjVWLWXYJvJXDZXJSh20v+oThm0iH9k3eVApVaLRzSCmbR7naIgsUUot1Fj3O8ZtHmM0RC5USk3RWLeecZvHKxoipyi9X91o7MO8TSP1pIbIm5XWd4iWdS8DN40/6HgcqJTy6dxIuYOBm0aZzg2vPqWUzjVBlnUJEzeLi3UsViil+TbAeoKRm8VcS/NNgFL5Oku/SWXmRp0Caj0XI18ppVSaX2ftwwzdJB7Wceg/9dADrZOAumSmbg7JdfqnAEo9ofXIlBmM3RxmWKGcyOn99tqRs5i7KfQ6oqVw5A+vH41ayxcweFOYpyWwseV/8e1a65t/xuTN4KdNWgK3t2ygSO/Bae/7mL0JxLyn56+oZQvDNB+dN4nhm8BvNfUNa9lCfJ3eFo6dz/Td59yv9OzVnfHE4yWaDZV1Z/5uE7tVU96SMzYyVHMb1lwEuM2juu6GnnkaUaW5Ef9IDLhLjl9TXVWrB708rJvR0QE4cJMB2r+R0PrLnAt0N2NV9saCe/Su1BbX5kdP9X92a0cSHtwiaYe2tm1tNjVRe0vWpjhMuEPcJn1rE9tsK+Wk/rZWd8OFG3Rbre/sZErbra3R35i1NgEbkSdhbQjK1rTb3IgQtmZt4avhiHPWllCMjWi/wbJQtleRjpHIkl4Riq+yAFvMDWWD1v4MnESSjP0h6Qr0w5cxu0LaZP14rESO8fUhydoV8HHPd1ihsZLLRCNE8soQVd0RcLO+yhA3+3EWbiJB1schiqrs4EqeghC3azXN64WecNNrXlOongo62HRsVahbtg6NxlB4GX0oZElVsR1tfIIVOpsuQ1L4uGyTA4omdLj5uAMObN7/aiaiwkPmq34HBB3o5Lub2y1HeH0ospxn6OvO2On0Ye8bnfkbVtmkFIw5ScqkMofUbOz071zY4NCfsRpevjUWb84Qe+vLznm5sPO/NcdyjqOrJ12MvVC5eNLqow5KmdPFn0usshyl+qWpOYO4g0gL36CcqS9VO+ujKrGrv5prOU/DnjWLHpt1b2HebRAEeYX3znps0Zo9DWFQkdt1d2stiFrWBvHCM7CeOUUr9QOD+a9nBoOKVoJ7qouvhElFJyVBno2nH2ZW0cjhoK/bu6mZaUUfzTcF/w50NuOKPmbb+QiC0wCxJwCcBkg/AeA0QPoJAKcBwk8ATp0GrGJq0cMqje/j4jgRjJ4TQK07+JN3MrnoYKfmLTv99jG7aGBfP90rEgbxZjAa3gCG8DuvV3zN/LzO11eEclXSjQ1M0Ns03BjadWn5TczQyzTlh3plYi4XCHmY+tzQr029tpY5epXaXzhyQ+LnTNKbfO7QjbrnfcQsvchH5zl1h0LadqbpPbanOXePSo8NzNNrbOjh6O2Jy5iot1jm9K25E04wVO9wYoLztypeXslcvULl5eG4WTVpBZP1BivC9RMO4/hU0APUjwvfHesZHzJf0/kwrE9t7rmcCZvN8p5hfmzFqE8Zsrl8Oir8Dy7p8ch3DNpMThb3UJHgkneYtYmURO6RXHfXMG7TqL4zkg+w+tFCbh0ziqb5kf7Zpiv/zdTNYeMVKvJctc7P5E3A/0+3fqljyEouGXX/xf9FNx/Qf8FzJ1Hg6ju/JT9x+Xmm/efxBYFrfPt0fwMeaZsyqRQVblBqzjP5BxcdwEdkOVA02KwnWw97/jhWIsXx54cZ+AT2pLEbOR2IAPUbxyYpQ4m7fvZm3haE86R/8+zr45TZJA4v2taIKudp3FY0PFF5g6ScB5eX1uHMKepKlz+Yk6S8Rt/rxs9dv5dXg1D+1e9dP3f8dX2Vl4lNHZBxTXZe4T0zH3lmMQTBM4/MvKcwL/uajAGp/PAaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATi/2VY2pv5SKICAAAAAElFTkSuQmCC';

  /*
   * Ícone fornecido pelo usuário para o botão A PAGAR.
   * Mantido embutido para preservar este arquivo único e autocontido.
   */
  const financePayablesIconSrc =
    'data:image/png;base64,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';

  /*
   * Mesma arte de pasta usada nas pastas mensais da página VENDAS.
   * Mantida embutida para a página FINANCEIRO - SAÍDA funcionar sozinha.
   */
  const financeFolderIconSrc =
    'data:image/png;base64,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';

  const FINANCE_MONTHS = [
    'JANEIRO',
    'FEVEREIRO',
    'MARÇO',
    'ABRIL',
    'MAIO',
    'JUNHO',
    'JULHO',
    'AGOSTO',
    'SETEMBRO',
    'OUTUBRO',
    'NOVEMBRO',
    'DEZEMBRO'
  ];

  let financeExitSelectedYear =
    new Date().getFullYear();

  let financeExitSelectedMonth = null;

  /*
   * Filtro visual da tabela FINANCEIRO - SAÍDA.
   * ALL = todas as linhas; A_PAGAR / PAGO = situação exibida na tabela.
   */
  let financeExitStatusFilter = 'ALL';

  let financeEntrySelectedYear =
    new Date().getFullYear();

  let financeEntrySelectedMonth = null;

  /*
   * Filtro visual da tabela FINANCEIRO - ENTRADA.
   * ALL = todas; A_RECEBER = contas ainda pendentes;
   * RECEBIDO = entradas já recebidas/realizadas.
   */
  let financeEntryStatusFilter = 'ALL';


  let saldoDadosRequestId = '';
  let saldoDadosVendas = [];
  let saldoDadosCaixaConsulta = null;

  let saldoDadosMovimentos = [];
  let saldoDadosMovimentosCaixaHistoricos = [];

  /*
   * Vendas OFFLINE são exibidas no livro de MOVIMENTAÇÕES DO CAIXA,
   * mas continuam fora de cash_movements e dos cálculos de saldo.
   */
  let saldoDadosVendasComoMovimentos = [];

  /*
   * Filtro por data da MOVIMENTAÇÃO DE CAIXA na página FINANCEIRO.
   * Vazio = visualização diária padrão do caixa atual.
   * DD/MM/AAAA = usa o histórico persistente de movimentos de caixa e
   * renderiza somente os lançamentos da data escolhida no calendário.
   */
  let saldoFiltroDataMovimentacaoCaixa = '';

  function saldoChaveDataMovimentoCaixa(movimento){
    const bruto =
      movimento &&
      (
        movimento.criadoEm ||
        movimento.dataMovimento ||
        movimento.dataHora ||
        movimento._createdDate ||
        movimento.createdAt
      );

    const dataMovimento =
      bruto
        ? new Date(bruto)
        : null;

    if(
      !dataMovimento ||
      Number.isNaN(dataMovimento.getTime())
    ){
      return '';
    }

    return [
      String(dataMovimento.getDate()).padStart(2,'0'),
      String(dataMovimento.getMonth() + 1).padStart(2,'0'),
      String(dataMovimento.getFullYear())
    ].join('/');
  }

  /*
   * Ponte usada somente pelo calendário da página FINANCEIRO.
   * Mantém o estado/fonte dos dados dentro deste módulo e permite que
   * o calendário externo aplique exatamente o mesmo tipo de filtro
   * persistente usado nas páginas mensais de ENTRADA/SAÍDA.
   */
  financeDomain.setCashMovementDateFilter(
    function(dataSelecionada){
      const normalizada =
        /^\d{2}\/\d{2}\/\d{4}$/.test(
          saldoTexto(dataSelecionada)
        )
          ? saldoTexto(dataSelecionada)
          : '';

      if(
        saldoFiltroDataMovimentacaoCaixa ===
        normalizada
      ){
        return;
      }

      saldoFiltroDataMovimentacaoCaixa =
        normalizada;

      renderizarSaldoEsquerdo();
      renderizarSaldoMovimentos();
    }
  );

  financeDomain.setCashMovementDateProvider(
    function(){
      const historicos =
        Array.isArray(
          saldoDadosMovimentosCaixaHistoricos
        )
          ? saldoDadosMovimentosCaixaHistoricos
          : [];

      const atuais =
        Array.isArray(
          saldoDadosMovimentos
        )
          ? saldoDadosMovimentos
          : [];

      const vendas =
        Array.isArray(
          saldoDadosVendasComoMovimentos
        )
          ? saldoDadosVendasComoMovimentos
          : [];

      const mesclados =
        saldoRemoverMovimentosDuplicados(
          historicos.concat(
            atuais,
            vendas
          )
        );

      return Array.from(
        new Set(
          mesclados
            .map(
              saldoChaveDataMovimentoCaixa
            )
            .filter(Boolean)
        )
      );
    }
  );

  let saldoDadosEvolucao7Dias = [];
  let saldoDadosContaFinanceira = {
    success:true,
    saldo:0,
    totalEntradas:0,
    totalSaidas:0,
    quantidade:0,
    resumoMensal:{},
    movimentos:[]
  };

  /*
   * EXTRATO MENSAL DA CONTA INTERNA.
   * FINANCEIRO > ENTRADA/SAÍDA lê exclusivamente este cache, alimentado
   * pelo mesmo livro financeiro usado no card EXTRATO do painel direito.
   * Movimentos do caixa diário permanecem em saldoDadosMovimentos, mas não
   * entram mais nas tabelas mensais de ENTRADA/SAÍDA.
   */
  let financeAccountExtractMonthCache = Object.create(null);
  let financeAccountExtractMonthPending = Object.create(null);
  let financeAccountExtractMonthErrors = Object.create(null);
  let financeAccountExtractLedgerSignature = '';

  let saldoDadosCarregando = false;

  /*
   * CACHE VISUAL DO FINANCEIRO — mesmo princípio usado em VENDAS:
   * - depois do primeiro carregamento completo, a última fotografia válida
   *   permanece em memória enquanto o usuário navega por outras páginas;
   * - ao voltar ao FINANCEIRO, essa fotografia é renderizada imediatamente;
   * - a conferência com o backend acontece em segundo plano, usando buffers
   *   separados, e só substitui o cache quando TODAS as páginas terminarem.
   */
  let saldoCachePronto = false;
  let saldoAtualizacaoSilenciosa = false;

  /*
   * Pré-carga do FINANCEIRO.
   * O módulo já possuía cache de reentrada; agora a primeira fotografia é
   * construída em segundo plano antes do primeiro clique no FINANCEIRO.
   */
  let saldoPrecarregamentoAtivo = false;
  let saldoPreloadSolicitado = false;
  let saldoAtualizacaoVendas = [];
  let saldoAtualizacaoCaixaConsulta = null;
  let saldoAtualizacaoMovimentos = [];
  let saldoAtualizacaoMovimentosCaixaHistoricos = [];
  let saldoAtualizacaoEvolucao7Dias = [];
  let saldoAtualizacaoContaFinanceira = null;

  function el(id){ return window.__scfPdvInfra.dom.byId(id); }

  function closeSrc(){
    const img = document.querySelector('#scfSalesHistoryClose img');
    return img
      ? String(img.getAttribute('src') || '').trim()
      : 'https://static.wixstatic.com/media/fd6425_4a7468b648384589833816ddb0d7336f~mv2.png';
  }

  function backSrc(){
    const img = document.querySelector('#scfSalesHistoryBack img');
    return img
      ? String(img.getAttribute('src') || '').trim()
      : '';
  }


  function financeCreateElement(tag,className,value){
    const node = document.createElement(tag);
    if(className) node.className = className;
    if(value !== undefined) node.textContent = String(value ?? '').trim();
    return node;
  }

  function desmontarAnoSaidaFinanceiro(){
    const yearBar = el('scfFinanceExitYearBar');
    if(yearBar && yearBar.parentNode){
      yearBar.parentNode.removeChild(yearBar);
    }
  }

  function desmontarAnoEntradaFinanceiro(){
    const yearBar = el('scfFinanceEntryYearBar');
    if(yearBar && yearBar.parentNode){
      yearBar.parentNode.removeChild(yearBar);
    }
  }

  function financeDataMovimento(movimento){
    const valor =
      movimento && (
        movimento.ocorridoEm ||
        movimento.criadoEm
      );

    const data = valor ? new Date(valor) : null;
    return data && !Number.isNaN(data.getTime()) ? data : null;
  }

  function financeContaExtratoChaveMes(ano,mes){
    return [
      Math.trunc(Number(ano)),
      String(
        Math.max(0,Math.min(11,Math.trunc(Number(mes)))) + 1
      ).padStart(2,'0')
    ].join('-');
  }

  function financeContaExtratoResumoMes(ano,mes){
    const resumo =
      saldoDadosContaFinanceira &&
      saldoDadosContaFinanceira.resumoMensal &&
      typeof saldoDadosContaFinanceira.resumoMensal === 'object'
        ? saldoDadosContaFinanceira.resumoMensal
        : {};

    const item = resumo[
      financeContaExtratoChaveMes(ano,mes)
    ];

    return item && typeof item === 'object'
      ? item
      : {
          entradas:0,
          saidas:0,
          totalEntradas:0,
          totalSaidas:0
        };
  }

  function financeContaExtratoTemCache(ano,mes){
    const chave = financeContaExtratoChaveMes(ano,mes);
    return Object.prototype.hasOwnProperty.call(
      financeAccountExtractMonthCache,
      chave
    );
  }

  function financeContaExtratoMovimentosMes(ano,mes){
    const chave = financeContaExtratoChaveMes(ano,mes);
    const lista = financeAccountExtractMonthCache[chave];

    return Array.isArray(lista)
      ? lista.slice()
      : [];
  }

  function financeContaExtratoInvalidarCache(){
    financeAccountExtractMonthCache = Object.create(null);
    financeAccountExtractMonthPending = Object.create(null);
    financeAccountExtractMonthErrors = Object.create(null);
  }

  function financeContaExtratoAtualizarAssinatura(conta){
    const atual = conta && typeof conta === 'object'
      ? conta
      : {};

    const assinatura = [
      Math.max(0,Math.trunc(saldoNumero(atual.quantidade))),
      saldoNumero(atual.saldo).toFixed(2),
      saldoNumero(atual.totalEntradas).toFixed(2),
      saldoNumero(atual.totalSaidas).toFixed(2)
    ].join('|');

    if(
      financeAccountExtractLedgerSignature &&
      financeAccountExtractLedgerSignature !== assinatura
    ){
      financeContaExtratoInvalidarCache();
    }

    financeAccountExtractLedgerSignature = assinatura;
  }

  function financeContaExtratoSolicitarMes(ano,mes){
    const anoSeguro = Math.trunc(Number(ano));
    const mesSeguro = Math.max(0,Math.min(11,Math.trunc(Number(mes))));
    const chave = financeContaExtratoChaveMes(anoSeguro,mesSeguro);

    if(financeContaExtratoTemCache(anoSeguro,mesSeguro)){
      return true;
    }

    if(financeAccountExtractMonthPending[chave]){
      return false;
    }

    const requestId = [
      'financeiro-extrato-mes',
      anoSeguro,
      mesSeguro,
      Date.now(),
      Math.random().toString(36).slice(2,8)
    ].join('-');

    financeAccountExtractMonthPending[chave] = requestId;
    delete financeAccountExtractMonthErrors[chave];

    window.__scfPdvInfra.shellBridge.post({
      type:'SCF_FINANCEIRO_EXTRATO_MES_SOLICITAR',
      requestId,
      ano:anoSeguro,
      mes:mesSeguro,
      timezoneOffsetMinutes:new Date().getTimezoneOffset()
    },'*');

    return false;
  }

  function financeContaExtratoRecalcularResumoMes(ano,mes,movimentos){
    const lista = Array.isArray(movimentos) ? movimentos : [];
    let entradas = 0;
    let saidas = 0;
    let totalEntradas = 0;
    let totalSaidas = 0;

    lista.forEach(function(movimento){
      const tipo = saldoNormalizar(movimento && movimento.tipo);
      const valor = Math.abs(saldoNumero(movimento && movimento.valor));

      if(tipo === 'SAIDA'){
        saidas += 1;
        totalSaidas += valor;
      }else if(tipo === 'ENTRADA'){
        entradas += 1;
        totalEntradas += valor;
      }
    });

    if(
      !saldoDadosContaFinanceira ||
      typeof saldoDadosContaFinanceira !== 'object'
    ){
      saldoDadosContaFinanceira = {};
    }

    if(
      !saldoDadosContaFinanceira.resumoMensal ||
      typeof saldoDadosContaFinanceira.resumoMensal !== 'object'
    ){
      saldoDadosContaFinanceira.resumoMensal = {};
    }

    saldoDadosContaFinanceira.resumoMensal[
      financeContaExtratoChaveMes(ano,mes)
    ] = {
      ano:Math.trunc(Number(ano)),
      mes:Math.max(0,Math.min(11,Math.trunc(Number(mes)))),
      entradas,
      saidas,
      totalEntradas,
      totalSaidas
    };
  }

  function financeContaExtratoTratarResultado(data){
    const ano = Math.trunc(Number(data && data.ano));
    const mes = Math.max(0,Math.min(11,Math.trunc(Number(data && data.mes))));
    const chave = financeContaExtratoChaveMes(ano,mes);
    const requestId = saldoTexto(data && data.requestId);

    if(
      !requestId ||
      financeAccountExtractMonthPending[chave] !== requestId
    ){
      return;
    }

    delete financeAccountExtractMonthPending[chave];
    delete financeAccountExtractMonthErrors[chave];

    const movimentos =
      data && Array.isArray(data.movimentos)
        ? data.movimentos
            .filter(function(movimento){
              const tipo = saldoNormalizar(movimento && movimento.tipo);
              return tipo === 'ENTRADA' || tipo === 'SAIDA';
            })
            .map(function(movimento){
              return {
                ...movimento,
                criadoEm:
                  saldoTexto(movimento && movimento.ocorridoEm) ||
                  saldoTexto(movimento && movimento.criadoEm)
              };
            })
        : [];

    financeAccountExtractMonthCache[chave] = movimentos;
    financeContaExtratoRecalcularResumoMes(ano,mes,movimentos);

    if(
      document.body.classList.contains('scf-financeiro-saida-open') &&
      financeExitSelectedYear === ano &&
      financeExitSelectedMonth === mes
    ){
      renderizarTabelaSaidaFinanceiro(mes);
    }

    if(
      document.body.classList.contains('scf-financeiro-entrada-open') &&
      financeEntrySelectedYear === ano &&
      financeEntrySelectedMonth === mes
    ){
      renderizarTabelaEntradaFinanceiro(mes);
    }
  }

  function financeContaExtratoTratarErro(data){
    const ano = Math.trunc(Number(data && data.ano));
    const mes = Math.max(0,Math.min(11,Math.trunc(Number(data && data.mes))));
    const chave = financeContaExtratoChaveMes(ano,mes);
    const requestId = saldoTexto(data && data.requestId);

    if(
      !requestId ||
      financeAccountExtractMonthPending[chave] !== requestId
    ){
      return;
    }

    delete financeAccountExtractMonthPending[chave];
    financeAccountExtractMonthCache[chave] = [];
    financeAccountExtractMonthErrors[chave] =
      saldoTexto(data && (data.message || data.mensagem)) ||
      'NÃO FOI POSSÍVEL CARREGAR O EXTRATO DESTE MÊS.';

    if(
      document.body.classList.contains('scf-financeiro-saida-open') &&
      financeExitSelectedYear === ano &&
      financeExitSelectedMonth === mes
    ){
      renderizarTabelaSaidaFinanceiro(mes);
    }

    if(
      document.body.classList.contains('scf-financeiro-entrada-open') &&
      financeEntrySelectedYear === ano &&
      financeEntrySelectedMonth === mes
    ){
      renderizarTabelaEntradaFinanceiro(mes);
    }
  }

  /*
   * CONTAS A PAGAR: o HTML mantém apenas o contrato de mensagens.
   * A persistência definitiva é feita no backend na coleção
   * financeiroContasPagar / PostgreSQL.financeiro_contas_pagar da VPS.
   */

  function financeEhSaida(movimento){
    const tipo = saldoNormalizar(movimento && movimento.tipo);
    const motivo = saldoNormalizar(movimento && movimento.motivo);
    const valor = saldoNumero(movimento && movimento.valor);

    if(tipo === 'SANGRIA') return true;
    if(tipo === 'CONTA_PAGAR') return true;
    if(valor < 0) return true;
    if(tipo === 'AJUSTE' && (motivo.includes('REEMBOLSO') || motivo.includes('CANCELAMENTO'))) return true;
    return false;
  }

  /*
   * FINANCEIRO - SAÍDA — ANULAÇÃO POR AJUSTE POSITIVO.
   * A SANGRIA original nunca é apagada do livro do caixa. Quando o usuário
   * exclui/anula uma saída, o backend grava um AJUSTE positivo com a descrição
   * abaixo apontando para o ID original. A tabela usa esse vínculo para ocultar
   * somente a saída anulada, preservando a auditoria do caixa.
   */
  const financeExitReversalMarker =
    'SCF_FINANCEIRO_ESTORNO_SAIDA|';

  const financeExitReversedLocalIds =
    new Set();

  function financeExitMovementId(movimento){
    return saldoTexto(
      movimento &&
      (
        movimento.id ||
        movimento._id ||
        movimento.movimentoId
      )
    );
  }

  function financeExitReversalOriginalId(movimento){
    const tipo = saldoNormalizar(
      movimento && movimento.tipo
    );

    if(tipo !== 'AJUSTE') return '';

    const descricao = saldoTexto(
      movimento && movimento.descricao
    );

    if(!descricao.startsWith(financeExitReversalMarker)){
      return '';
    }

    return saldoTexto(
      descricao.slice(financeExitReversalMarker.length)
    );
  }

  /*
   * FINANCEIRO > SAÍDA > MÊS — HISTÓRICO LOCAL DE SANGRIAS.
   *
   * O fechamento do caixa pode fazer a fotografia corrente de movimentos
   * deixar de trazer as SANGRIAS da sessão encerrada. Isso é correto para o
   * estado operacional do caixa, porém a página FINANCEIRO - SAÍDA - [MÊS]
   * precisa continuar exibindo essas saídas como histórico.
   *
   * Por isso somente esta listagem mantém uma cópia persistente das SANGRIAS
   * já vistas. Nada deste arquivo é reinjetado no resumo do caixa, no saldo,
   * no PDV ou nas demais telas do Financeiro.
   */
  function financeExitSangriaArchiveStorageKey(){
    const cnpjNode = el('scfCompanyHeaderCnpj');
    const cnpj = saldoTexto(
      cnpjNode && cnpjNode.textContent
    ).replace(/\D/g,'').slice(0,14);

    return (
      window.__scfPdvContracts.storage.local.prefixes.financeSangriaHistory +
      (
        cnpj ||
        window.__scfPdvContracts.storage.defaults.financeTenant
      )
    );
  }

  function financeExitSangriaReversedStorageKey(){
    const cnpjNode = el('scfCompanyHeaderCnpj');
    const cnpj = saldoTexto(
      cnpjNode && cnpjNode.textContent
    ).replace(/\D/g,'').slice(0,14);

    return (
      window.__scfPdvContracts.storage.local.prefixes.financeSangriaReversed +
      (
        cnpj ||
        window.__scfPdvContracts.storage.defaults.financeTenant
      )
    );
  }

  function financeExitSangriaSnapshot(movimento){
    if(
      !movimento ||
      saldoNormalizar(movimento.tipo) !== 'SANGRIA'
    ){
      return null;
    }

    return {
      id:saldoTexto(movimento.id),
      _id:saldoTexto(movimento._id),
      movimentoId:saldoTexto(movimento.movimentoId),
      tipo:'SANGRIA',
      valor:saldoNumero(movimento.valor),
      motivo:saldoTexto(movimento.motivo),
      descricao:saldoTexto(movimento.descricao),
      observacao:saldoTexto(movimento.observacao),
      detalhe:saldoTexto(movimento.detalhe),
      fornecedorId:saldoTexto(movimento.fornecedorId),
      fornecedorNome:saldoTexto(
        movimento.fornecedorNome ||
        movimento.nomeFornecedor ||
        movimento.fornecedorRazaoSocial
      ),
      criadoEm:saldoTexto(
        movimento.criadoEm ||
        movimento._createdDate ||
        movimento.createdAt
      ),
      operadorNome:saldoTexto(
        movimento.operadorNome ||
        movimento.nomeOperador
      ),
      pago:true,
      __scfFinanceiroPagoLocal:true,
      __scfFinanceiroSangriaHistorica:true
    };
  }

  function financeExitCarregarSangriasHistoricas(){
    try{
      const bruto = window.__scfPdvInfra.storage.local.getItem(
        financeExitSangriaArchiveStorageKey()
      );
      const lista = bruto ? JSON.parse(bruto) : [];

      return Array.isArray(lista)
        ? lista.filter(function(item){
            return (
              item &&
              typeof item === 'object' &&
              saldoNormalizar(item.tipo) === 'SANGRIA'
            );
          })
        : [];
    }catch(error){
      return [];
    }
  }

  function financeExitSalvarSangriasHistoricas(lista){
    try{
      window.__scfPdvInfra.storage.local.setItem(
        financeExitSangriaArchiveStorageKey(),
        JSON.stringify(
          (Array.isArray(lista) ? lista : []).slice(0,500)
        )
      );
    }catch(error){}
  }

  function financeExitCarregarSangriasAnuladas(){
    try{
      const bruto = window.__scfPdvInfra.storage.local.getItem(
        financeExitSangriaReversedStorageKey()
      );
      const lista = bruto ? JSON.parse(bruto) : [];
      return new Set(
        Array.isArray(lista)
          ? lista.map(saldoTexto).filter(Boolean)
          : []
      );
    }catch(error){
      return new Set();
    }
  }

  function financeExitSalvarSangriasAnuladas(ids){
    try{
      window.__scfPdvInfra.storage.local.setItem(
        financeExitSangriaReversedStorageKey(),
        JSON.stringify(
          Array.from(ids || []).map(saldoTexto).filter(Boolean).slice(0,500)
        )
      );
    }catch(error){}
  }

  function financeExitArquivarSangrias(movimentos){
    const historicas = financeExitCarregarSangriasHistoricas();
    const mapa = new Map();

    historicas.forEach(function(movimento,indice){
      const snapshot = financeExitSangriaSnapshot(movimento);
      if(!snapshot) return;
      mapa.set(
        saldoChaveMovimento(snapshot,indice),
        snapshot
      );
    });

    (Array.isArray(movimentos) ? movimentos : [])
      .forEach(function(movimento,indice){
        const snapshot = financeExitSangriaSnapshot(movimento);
        if(!snapshot) return;

        mapa.set(
          saldoChaveMovimento(snapshot,indice),
          snapshot
        );
      });

    const lista = Array.from(mapa.values())
      .sort(function(a,b){
        const da = financeDataMovimento(a);
        const db = financeDataMovimento(b);
        return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
      })
      .slice(0,500);

    financeExitSalvarSangriasHistoricas(lista);
    return lista;
  }

  function financeSaidasDoMes(ano,mes){
    /*
     * Fonte única: EXTRATO da conta interna (financeiroContaMovimentos).
     * Nenhum caixaMovimentos/SANGRIA do caixa diário participa desta tabela.
     */
    return financeContaExtratoMovimentosMes(ano,mes)
      .filter(function(movimento){
        if(
          saldoNormalizar(
            movimento && movimento.tipo
          ) !== 'SAIDA'
        ){
          return false;
        }

        const data = financeDataMovimento(movimento);

        return !!data &&
          data.getFullYear() === ano &&
          data.getMonth() === mes;
      })
      .sort(function(a,b){
        const da = financeDataMovimento(a);
        const db = financeDataMovimento(b);
        return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
      });
  }

  function financeMotivoSaida(movimento){
    const tipo = saldoNormalizar(
      movimento && movimento.tipo
    );

    const origem = saldoNormalizar(
      movimento && movimento.origem
    );

    if(
      tipo === 'SAIDA' &&
      saldoTexto(movimento && movimento.ocorridoEm)
    ){
      if(
        origem === 'PAGAMENTO_CONTA_PAGAR' ||
        origem === 'CONCILIACAO_CONTA_PAGAR'
      ){
        return 'CONTA A PAGAR';
      }

      if(
        origem === 'AJUSTE_VALOR_CONTA_PAGA'
      ){
        return 'AJUSTE';
      }

      return 'DIVERSOS';
    }

    const motivo =
      saldoTexto(
        movimento && movimento.motivo
      );

    return motivo
      ? motivo.toLocaleUpperCase(
          'pt-BR'
        )
      : '—';
  }

  function financeDetalheSaida(movimento){
    const motivo = saldoNormalizar(
      movimento && movimento.motivo
    );

    const fornecedor =
      saldoTexto(
        movimento && (
          movimento.fornecedorNome ||
          movimento.nomeFornecedor ||
          movimento.fornecedorRazaoSocial ||
          (movimento.fornecedor && (
            movimento.fornecedor.nome ||
            movimento.fornecedor.razaoSocial ||
            movimento.fornecedor.nomeFantasia
          ))
        )
      ).toLocaleUpperCase(
        'pt-BR'
      );

    const descricao =
      saldoTexto(
        movimento && (
          movimento.descricao ||
          movimento.observacao ||
          movimento.detalhe
        )
      ).toLocaleUpperCase(
        'pt-BR'
      );

    if(motivo === 'PAGAMENTO FORNECEDOR'){
      return fornecedor || '—';
    }

    if(motivo === 'RETIRADA AVULSA'){
      return descricao || '—';
    }

    return fornecedor || descricao || '—';
  }

  function financeValorSaida(movimento){
    return saldoMoeda(
      Math.abs(
        saldoNumero(movimento && movimento.valor)
      )
    );
  }

  /*
   * FINANCEIRO - SAÍDA — SITUAÇÃO PAGO
   * Mantém o estado booleano de cada lançamento separado dos dados fiscais/caixa.
   * A chave usa preferencialmente o ID persistido do movimento e o estado fica
   * salvo no navegador, permitindo marcar e desmarcar sem alterar o lançamento.
   */
  const financeExitPaidStorageKey =
    window.__scfPdvContracts.storage.local.keys.financeExitPaid;

  const financeExitPaidState =
    Object.create(null);

  let financeExitPaidStateLoaded =
    false;

  function financeExitPaidMovementKey(movimento){
    const id = saldoTexto(
      movimento &&
      (
        movimento.id ||
        movimento._id ||
        movimento.movimentoId
      )
    );

    if(id){
      return 'ID|' + id;
    }

    const data = financeDataMovimento(movimento);

    return [
      'MOV',
      data ? data.toISOString() : '',
      String(saldoNumero(movimento && movimento.valor)),
      saldoTexto(movimento && movimento.tipo),
      saldoTexto(movimento && movimento.motivo),
      financeDetalheSaida(movimento)
    ].join('|');
  }

  function financeExitLoadPaidState(){
    if(financeExitPaidStateLoaded){
      return financeExitPaidState;
    }

    financeExitPaidStateLoaded =
      true;

    try{
      const salvo =
        window.__scfPdvInfra.storage.local.getItem(
          financeExitPaidStorageKey
        );

      const mapa =
        salvo
          ? JSON.parse(salvo)
          : null;

      if(
        mapa &&
        typeof mapa === 'object' &&
        !Array.isArray(mapa)
      ){
        Object.keys(mapa).forEach(function(chave){
          financeExitPaidState[chave] =
            mapa[chave] === true;
        });
      }
    }catch(error){}

    return financeExitPaidState;
  }

  function financeExitPaidValue(movimento){
    const tipoMovimento =
      saldoNormalizar(
        movimento && movimento.tipo
      );

    /*
     * SANGRIA é retirada de dinheiro já realizada no caixa. Portanto ela
     * é sempre PAGA no FINANCEIRO e nunca pode herdar um antigo false do
     * window.__scfPdvInfra.storage.local. A alternância PAGO / A PAGAR existe só para CONTA_PAGAR.
     */
    if(tipoMovimento === 'SANGRIA'){
      return true;
    }

    if(
      tipoMovimento === 'SAIDA' &&
      saldoTexto(
        movimento && movimento.ocorridoEm
      )
    ){
      return true;
    }

    const chave =
      financeExitPaidMovementKey(movimento);

    const mapa =
      financeExitLoadPaidState();

    const ehContaPagar =
      tipoMovimento === 'CONTA_PAGAR';

    /*
     * Para contas A PAGAR, o backend é a fonte definitiva da situação.
     * Isso evita que um valor antigo do localStorage sobrescreva uma
     * alteração feita em outro navegador/dispositivo.
     */
    if(
      ehContaPagar &&
      movimento &&
      typeof movimento.pago === 'boolean'
    ){
      return movimento.pago;
    }

    if(
      Object.prototype.hasOwnProperty.call(
        mapa,
        chave
      )
    ){
      return mapa[chave] === true;
    }

    if(
      movimento &&
      typeof movimento.__scfFinanceiroPagoLocal === 'boolean'
    ){
      return movimento.__scfFinanceiroPagoLocal;
    }

    if(
      movimento &&
      typeof movimento.pago === 'boolean'
    ){
      return movimento.pago;
    }

    if(
      movimento &&
      typeof movimento.paid === 'boolean'
    ){
      return movimento.paid;
    }

    return false;
  }

  function financeExitSavePaidValue(movimento,pago){
    const tipoMovimento =
      saldoNormalizar(
        movimento && movimento.tipo
      );

    /*
     * Proteção adicional: mesmo que algum evento tente salvar false para
     * uma SANGRIA, a situação permanece PAGO.
     */
    if(tipoMovimento === 'SANGRIA'){
      if(movimento && typeof movimento === 'object'){
        movimento.__scfFinanceiroPagoLocal = true;
        movimento.pago = true;
      }
      return true;
    }

    const chave =
      financeExitPaidMovementKey(movimento);

    const mapa =
      financeExitLoadPaidState();

    mapa[chave] =
      pago === true;

    if(movimento && typeof movimento === 'object'){
      movimento.__scfFinanceiroPagoLocal =
        pago === true;

      if(
        saldoNormalizar(
          movimento.tipo
        ) === 'CONTA_PAGAR'
      ){
        movimento.pago =
          pago === true;
      }
    }

    try{
      window.__scfPdvInfra.storage.local.setItem(
        financeExitPaidStorageKey,
        JSON.stringify(mapa)
      );
    }catch(error){}

    return mapa[chave];
  }

  function financeExitNormalizarFiltroSituacao(valor){
    const filtro = saldoNormalizar(valor);

    if(filtro === 'A_PAGAR' || filtro === 'PAGO'){
      return filtro;
    }

    return 'ALL';
  }

  function financeExitAtualizarEstadoVisualFiltros(){
    const host = el('scfFinanceExitStatusTotals');
    if(!host) return false;

    const filtro =
      financeExitNormalizarFiltroSituacao(
        financeExitStatusFilter
      );

    host
      .querySelectorAll('[data-scf-finance-exit-filter]')
      .forEach(function(botao){
        const ativo =
          financeExitNormalizarFiltroSituacao(
            botao.getAttribute('data-scf-finance-exit-filter')
          ) === filtro;

        botao.classList.toggle(
          'is-filter-active',
          ativo
        );
        botao.setAttribute(
          'aria-pressed',
          ativo ? 'true' : 'false'
        );
      });

    return true;
  }

  function financeExitAplicarFiltroSituacao(){
    const view = el('scfFinanceExitView');
    if(!view) return false;

    const filtro =
      financeExitNormalizarFiltroSituacao(
        financeExitStatusFilter
      );

    const dataFiltro =
      saldoTexto(
        financeDomain.exitSelectedDateFilter
      );

    const linhas = Array.from(
      view.querySelectorAll(
        '.scf-finance-exit-row-hook'
      )
    );

    let visiveis = 0;

    linhas.forEach(function(linha){
      const situacao =
        financeExitNormalizarFiltroSituacao(
          linha.dataset.scfFinanceExitStatus
        );

      const dataLinha =
        saldoTexto(
          linha.dataset.scfFinanceExitDate
        ) ||
        saldoTexto(
          linha.querySelector('span:first-child')?.textContent
        );

      const passaSituacao =
        filtro === 'ALL' ||
        situacao === filtro;

      const passaData =
        !dataFiltro ||
        dataLinha === dataFiltro;

      const mostrar =
        passaSituacao &&
        passaData;

      linha.classList.toggle(
        'scf-finance-exit-filter-hidden',
        !mostrar
      );

      linha.classList.toggle(
        'is-filter-hidden',
        !mostrar
      );

      if(mostrar){
        linha.style.removeProperty('display');
        visiveis += 1;
      }else{
        linha.style.setProperty(
          'display',
          'none',
          'important'
        );
      }
    });

    let vazio = el('scfFinanceExitFilterEmpty');

    if(
      linhas.length > 0 &&
      !vazio
    ){
      vazio = financeCreateElement(
        'div',
        'scf-finance-exit-table-empty',
        ''
      );
      vazio.id = 'scfFinanceExitFilterEmpty';
      vazio.hidden = true;
      view.append(vazio);
    }

    if(vazio){
      const temFiltro =
        filtro !== 'ALL' ||
        !!dataFiltro;

      const semResultado =
        temFiltro &&
        linhas.length > 0 &&
        visiveis === 0;

      vazio.hidden = !semResultado;

      if(semResultado){
        if(dataFiltro && filtro === 'A_PAGAR'){
          vazio.textContent =
            'NENHUMA SAÍDA A PAGAR EM ' + dataFiltro + '.';
        }else if(dataFiltro && filtro === 'PAGO'){
          vazio.textContent =
            'NENHUMA SAÍDA PAGA EM ' + dataFiltro + '.';
        }else if(dataFiltro){
          vazio.textContent =
            'NENHUMA SAÍDA EM ' + dataFiltro + '.';
        }else{
          vazio.textContent =
            filtro === 'A_PAGAR'
              ? 'NENHUMA SAÍDA A PAGAR NESTE MÊS.'
              : 'NENHUMA SAÍDA PAGA NESTE MÊS.';
        }
      }
    }

    financeExitAtualizarEstadoVisualFiltros();
    return true;
  }

  function financeExitConfigurarFiltrosSituacao(){
    const host = el('scfFinanceExitStatusTotals');
    if(!host) return false;

    if(host.dataset.scfFinanceExitFilterBound === '1'){
      financeExitAtualizarEstadoVisualFiltros();
      return true;
    }

    host.dataset.scfFinanceExitFilterBound = '1';

    host.addEventListener(
      'click',
      function(event){
        const botao =
          event.target &&
          event.target.closest
            ? event.target.closest(
                '[data-scf-finance-exit-filter]'
              )
            : null;

        if(!botao || !host.contains(botao)){
          return;
        }

        financeExitStatusFilter =
          financeExitNormalizarFiltroSituacao(
            botao.getAttribute(
              'data-scf-finance-exit-filter'
            )
          );

        financeExitAplicarFiltroSituacao();
      }
    );

    financeExitAtualizarEstadoVisualFiltros();
    return true;
  }

  function financeExitAtualizarTotaisSituacao(saidasRecebidas){
    const host = el('scfFinanceExitStatusTotals');
    if(!host) return false;

    financeExitConfigurarFiltrosSituacao();

    const mesAberto =
      document.body.classList.contains('scf-financeiro-saida-mes-open') &&
      financeExitSelectedMonth !== null;

    host.hidden = !mesAberto;
    host.setAttribute('aria-hidden',mesAberto ? 'false' : 'true');

    if(!mesAberto){
      return false;
    }

    const saidas = Array.isArray(saidasRecebidas)
      ? saidasRecebidas
      : financeSaidasDoMes(
          financeExitSelectedYear,
          financeExitSelectedMonth
        );

    /*
     * Quando o calendário da SAÍDA estiver filtrando uma data,
     * os cards A PAGAR / PAGO / TOTAL passam a refletir somente
     * os lançamentos daquele dia. Sem data selecionada, continuam
     * mostrando o total normal do mês.
     */
    const dataFiltroCalendario =
      saldoTexto(
        financeDomain.exitSelectedDateFilter
      );

    const saidasParaTotais =
      dataFiltroCalendario
        ? saidas.filter(function(movimento){
            const dataMovimento =
              financeDataMovimento(movimento);

            return (
              dataMovimento &&
              saldoDataMovimento(
                dataMovimento.toISOString()
              ) === dataFiltroCalendario
            );
          })
        : saidas;

    let totalPagar = 0;
    let totalPago = 0;

    saidasParaTotais.forEach(function(movimento){
      const valor = Math.abs(
        saldoNumero(movimento && movimento.valor)
      );

      if(financeExitPaidValue(movimento)){
        totalPago += valor;
      }else{
        totalPagar += valor;
      }
    });

    const totalGeral = totalPagar + totalPago;

    const pendente = el('scfFinanceExitTotalPending');
    const pago = el('scfFinanceExitTotalPaid');
    const total = el('scfFinanceExitTotalOverall');

    if(pendente){
      pendente.textContent = saldoMoeda(totalPagar);
    }

    if(pago){
      pago.textContent = saldoMoeda(totalPago);
    }

    if(total){
      total.textContent = saldoMoeda(totalGeral);
    }

    host.setAttribute(
      'aria-label',
      'Total a pagar ' + saldoMoeda(totalPagar) +
        '. Total pago ' + saldoMoeda(totalPago) +
        '. Total geral ' + saldoMoeda(totalGeral) + '.'
    );

    return true;
  }

  window.__scfPdvInfra.eventBus.on('scf:financeiro-saida-data-filtro-alterado',
    function(){
      if(
        document.body.classList.contains(
          'scf-financeiro-saida-mes-open'
        ) &&
        financeExitSelectedMonth !== null
      ){
        financeExitAtualizarTotaisSituacao();
        financeExitAplicarFiltroSituacao();
      }
    }
  );

  function renderizarTabelaSaidaFinanceiro(monthIndex){
    const view = el('scfFinanceExitView');
    if(!view) return false;

    const mes = Math.max(0,Math.min(11,Math.trunc(Number(monthIndex))));
    const mesAnterior = financeExitSelectedMonth;
    financeExitSelectedMonth = mes;

    const titulo = el('scfFinanceRegistrationTitle');
    if(titulo){
      titulo.textContent =
        'FINANCEIRO - SAÍDA - ' +
        FINANCE_MONTHS[mes];
    }

    if(mesAnterior === null || mesAnterior !== mes){
      financeExitStatusFilter = 'ALL';
    }

    document.body.classList.add('scf-financeiro-saida-mes-open');
    desmontarAnoSaidaFinanceiro();
    view.replaceChildren();

    /*
     * FINANCEIRO - SAÍDA [MÊS]
     * Usa a MESMA tabela de FINANCEIRO - ENTRADA [MÊS].
     * Não existe mais um cabeçalho/layout próprio de SAÍDA.
     */
    const cabecalho = financeCreateElement(
      'div',
      'scf-finance-entry-table-header'
    );

    [
      'DATA',
      'HORA',
      'VALOR',
      'MOTIVO',
      'ORIGEM / DESCRIÇÃO',
      'VENCE EM',
      'SITUAÇÃO'
    ].forEach(function(rotulo){
      cabecalho.append(
        financeCreateElement(
          'span',
          '',
          rotulo
        )
      );
    });

    view.append(cabecalho);

    const corpoTabela = financeCreateElement(
      'div',
      'scf-finance-entry-table-body'
    );

    view.append(corpoTabela);

    const chaveExtratoMes =
      financeContaExtratoChaveMes(
        financeExitSelectedYear,
        mes
      );

    if(!financeContaExtratoTemCache(financeExitSelectedYear,mes)){
      financeContaExtratoSolicitarMes(
        financeExitSelectedYear,
        mes
      );

      financeExitAtualizarTotaisSituacao([]);

      corpoTabela.append(
        financeCreateElement(
          'div',
          'scf-finance-entry-table-empty',
          'CARREGANDO EXTRATO DA CONTA...'
        )
      );

      return true;
    }

    if(financeAccountExtractMonthErrors[chaveExtratoMes]){
      financeExitAtualizarTotaisSituacao([]);

      corpoTabela.append(
        financeCreateElement(
          'div',
          'scf-finance-entry-table-empty',
          financeAccountExtractMonthErrors[chaveExtratoMes]
        )
      );

      return true;
    }

    const saidas = financeSaidasDoMes(financeExitSelectedYear,mes);

    financeExitAtualizarTotaisSituacao(saidas);

    if(saidas.length === 0){
      corpoTabela.append(
        financeCreateElement(
          'div',
          'scf-finance-entry-table-empty',
          'NENHUMA SAÍDA NESTE MÊS.'
        )
      );
      return true;
    }

    saidas.forEach(function(movimento){
      const row = financeCreateElement(
        'div',
        'scf-finance-entry-table-row scf-finance-exit-row-hook'
      );
      const data = financeDataMovimento(movimento);
      const situacaoPagaInicial = financeExitPaidValue(movimento);

      row.dataset.scfFinanceExitStatus =
        situacaoPagaInicial ? 'PAGO' : 'A_PAGAR';

      row.dataset.scfFinanceExitDate =
        data ? saldoDataMovimento(data.toISOString()) : '';

      const movimentoIdLinha = saldoTexto(
        movimento &&
        (
          movimento.id ||
          movimento._id ||
          movimento.movimentoId
        )
      );

      if(movimentoIdLinha){
        row.dataset.scfFinanceMovimentoId =
          movimentoIdLinha;
      }

      const dataCell = financeCreateElement(
        'span',
        '',
        data
          ? [
              String(data.getDate()).padStart(2,'0'),
              String(data.getMonth() + 1).padStart(2,'0')
            ].join('/')
          : '--/--'
      );
      const horaCell = financeCreateElement(
        'span',
        '',
        data ? saldoHorarioMovimento(data.toISOString()) : '--:--'
      );
      const valorCell = financeCreateElement(
        'span',
        '',
        financeValorSaida(movimento)
      );

      const tipoOrigemMovimento =
        saldoNormalizar(
          movimento && movimento.tipo
        );

      const ehExtratoContaLinha =
        tipoOrigemMovimento === 'SAIDA' &&
        !!saldoTexto(
          movimento && movimento.ocorridoEm
        );

      const origemTexto =
        ehExtratoContaLinha
          ? 'CONTA'
          : (
              tipoOrigemMovimento === 'SANGRIA'
                ? 'SANGRIA'
                : (
                    tipoOrigemMovimento === 'CONTA_PAGAR'
                      ? 'FINANCEIRO'
                      : ''
                  )
            );

      /*
       * FINANCEIRO > SAÍDA — a LINHA INTEIRA seleciona o lançamento.
       * Assim DATA, HORA, VALOR, ORIGEM, MOTIVO, FORNECEDOR / DESCRIÇÃO e SITUAÇÃO
       * podem abrir a saída no formulário sem destacar visualmente o VALOR.
       */
      const selecionarMovimentoSaida =
        function(){
          /* O extrato da conta é histórico e somente leitura. */
          if(ehExtratoContaLinha){
            return;
          }

          window.__scfPdvInfra.eventBus.dispatch(
            new CustomEvent(
              'scf:financeiro-saida-selecionar',
              {
                detail:{
                  movimento:movimento
                }
              }
            )
          );
        };

      if(ehExtratoContaLinha){
        row.setAttribute(
          'aria-label',
          'Lançamento do extrato da conta: saída ' + financeValorSaida(movimento)
        );
      }else{
        row.setAttribute(
          'role',
          'button'
        );

        row.setAttribute(
          'tabindex',
          '0'
        );

        row.setAttribute(
          'aria-label',
          'Selecionar saída ' + financeValorSaida(movimento) + ' para visualizar e excluir'
        );

        row.addEventListener(
          'click',
          function(event){
            if(
              event.target &&
              event.target.closest &&
              event.target.closest('.scf-finance-exit-paid-label')
            ){
              return;
            }

            selecionarMovimentoSaida();
          }
        );

        row.addEventListener(
          'keydown',
          function(event){
            if(
              event.target &&
              event.target.matches &&
              event.target.matches('input,button,select,textarea,a[href]')
            ){
              return;
            }

            if(
              event.key === 'Enter' ||
              event.key === ' '
            ){
              event.preventDefault();
              selecionarMovimentoSaida();
            }
          }
        );
      }

      const motivoCell = financeCreateElement(
        'span',
        'is-motivo',
        financeMotivoSaida(movimento)
      );
      motivoCell.title = financeMotivoSaida(movimento);

      const detalheSaidaTexto =
        financeDetalheSaida(movimento);

      const detalheTexto =
        [
          origemTexto,
          detalheSaidaTexto && detalheSaidaTexto !== '—'
            ? detalheSaidaTexto
            : ''
        ]
          .filter(Boolean)
          .join(' — ') ||
        '—';

      const detalheCell = financeCreateElement(
        'span',
        'is-detalhe',
        detalheTexto
      );

      detalheCell.title =
        detalheTexto;

      /*
       * A sexta coluna é a mesma VENCE EM da tabela de ENTRADA.
       * Para contas a pagar usa o vencimento disponível no lançamento;
       * movimentos sem vencimento exibem apenas "—".
       */
      const candidatosVencimento = [
        movimento && movimento.vencimento,
        movimento && movimento.dataVencimento,
        movimento && movimento.venceEm,
        movimento && movimento.detalhe && movimento.detalhe.vencimento,
        movimento && movimento.metadata && movimento.metadata.vencimento
      ];

      let vencimentoTexto = '—';

      for(
        let indiceVencimento = 0;
        indiceVencimento < candidatosVencimento.length;
        indiceVencimento += 1
      ){
        const brutoVencimento =
          saldoTexto(
            candidatosVencimento[indiceVencimento]
          );

        if(!brutoVencimento){
          continue;
        }

        const brVencimento =
          brutoVencimento.match(
            /^(\d{2})\/(\d{2})\/(\d{4})$/
          );

        if(brVencimento){
          vencimentoTexto =
            brutoVencimento;
          break;
        }

        const isoVencimento =
          brutoVencimento.match(
            /^(\d{4})-(\d{2})-(\d{2})/
          );

        if(isoVencimento){
          vencimentoTexto =
            isoVencimento[3] + '/' +
            isoVencimento[2] + '/' +
            isoVencimento[1];
          break;
        }

        const dataVencimento =
          new Date(
            brutoVencimento
          );

        if(
          !Number.isNaN(
            dataVencimento.getTime()
          )
        ){
          vencimentoTexto = [
            String(dataVencimento.getDate()).padStart(2,'0'),
            String(dataVencimento.getMonth() + 1).padStart(2,'0'),
            String(dataVencimento.getFullYear())
          ].join('/');
          break;
        }
      }

      const vencimentoCell = financeCreateElement(
        'span',
        'is-recebimento',
        vencimentoTexto
      );

      vencimentoCell.title =
        vencimentoTexto === '—'
          ? 'Vencimento não informado'
          : 'Vencimento em ' + vencimentoTexto;

      const situacaoCell = financeCreateElement(
        'span',
        'is-situacao',
        ''
      );

      const situacaoLabel = financeCreateElement(
        'label',
        'scf-finance-entry-received-label scf-finance-exit-paid-label',
        ''
      );

      const tipoSituacaoMovimento =
        saldoNormalizar(
          movimento && movimento.tipo
        );

      const ehSangriaSituacao =
        tipoSituacaoMovimento === 'SANGRIA';

      const ehExtratoContaSituacao =
        tipoSituacaoMovimento === 'SAIDA' &&
        !!saldoTexto(
          movimento && movimento.ocorridoEm
        );

      const situacaoBloqueada =
        ehSangriaSituacao ||
        ehExtratoContaSituacao;

      const situacaoInput = document.createElement('input');
      situacaoInput.type = 'checkbox';
      situacaoInput.className =
        'scf-finance-entry-received-checkbox scf-finance-exit-paid-checkbox';
      situacaoInput.checked =
        situacaoBloqueada ? true : situacaoPagaInicial;

      if(situacaoBloqueada){
        situacaoInput.classList.add('is-sangria-locked');
        situacaoInput.disabled = true;
        situacaoInput.tabIndex = -1;
        situacaoInput.setAttribute('aria-readonly','true');
        situacaoInput.setAttribute(
          'aria-label',
          ehExtratoContaSituacao
            ? 'Saída lançada no extrato da conta interna: PAGO'
            : 'Saída ' + financeValorSaida(movimento) +
                ' originada por sangria: PAGO, situação não alterável'
        );
        situacaoInput.title =
          ehExtratoContaSituacao
            ? 'LANÇAMENTO DO EXTRATO — SITUAÇÃO PAGO'
            : 'SANGRIA JÁ REALIZADA — SITUAÇÃO PAGO NÃO PODE SER ALTERADA';
      }else{
        situacaoInput.setAttribute(
          'aria-label',
          (situacaoInput.checked ? 'Desmarcar' : 'Marcar') +
            ' saída ' + financeValorSaida(movimento) + ' como paga'
        );
      }

      const situacaoTexto = financeCreateElement(
        'span',
        'scf-finance-entry-received-text scf-finance-exit-paid-text',
        situacaoInput.checked ? 'PAGO' : 'A PAGAR'
      );

      situacaoInput.addEventListener(
        'click',
        function(event){
          /*
           * A coluna SITUAÇÃO é independente da seleção da saída.
           * Clicar no booleano altera apenas A PAGAR/PAGO e nunca
           * abre/preenche o formulário do painel direito.
           */
          event.stopPropagation();

          if(situacaoBloqueada){
            event.preventDefault();
            situacaoInput.checked = true;
          }
        }
      );

      situacaoInput.addEventListener(
        'change',
        function(event){
          event.stopPropagation();

          if(situacaoBloqueada){
            situacaoInput.checked = true;
            situacaoTexto.textContent = 'PAGO';
            situacaoLabel.classList.add('is-paid');
            row.dataset.scfFinanceExitStatus = 'PAGO';
            financeExitAtualizarTotaisSituacao();
            financeExitAplicarFiltroSituacao();
            return;
          }

          const pago =
            situacaoInput.checked === true;

          financeExitSavePaidValue(
            movimento,
            pago
          );

          situacaoInput.setAttribute(
            'aria-label',
            (pago ? 'Desmarcar' : 'Marcar') +
              ' saída ' + financeValorSaida(movimento) + ' como paga'
          );

          situacaoTexto.textContent =
            pago ? 'PAGO' : 'A PAGAR';

          situacaoLabel.classList.toggle(
            'is-paid',
            pago
          );

          row.dataset.scfFinanceExitStatus =
            pago ? 'PAGO' : 'A_PAGAR';

          financeExitAtualizarTotaisSituacao();
          financeExitAplicarFiltroSituacao();

          if(
            saldoNormalizar(
              movimento && movimento.tipo
            ) === 'CONTA_PAGAR'
          ){
            const movimentoId =
              financeExitMovementId(
                movimento
              );

            if(movimentoId){
              try{
                window.__scfPdvInfra.shellBridge.post(
                  {
                    type:'SCF_FINANCEIRO_CONTA_PAGAR_SITUACAO_ATUALIZAR',
                    requestId:[
                      'financeiro-conta-pagar-situacao',
                      Date.now(),
                      Math.random().toString(36).slice(2,8)
                    ].join('-'),
                    movimentoId,
                    pago
                  },
                  '*'
                );
              }catch(error){}
            }
          }
        }
      );

      situacaoLabel.classList.toggle(
        'is-paid',
        situacaoInput.checked
      );

      situacaoLabel.append(
        situacaoInput,
        situacaoTexto
      );

      situacaoCell.append(
        situacaoLabel
      );

      row.append(
        dataCell,
        horaCell,
        valorCell,
        motivoCell,
        detalheCell,
        vencimentoCell,
        situacaoCell
      );

      corpoTabela.append(
        row
      );
    });

    financeExitAplicarFiltroSituacao();
    return true;
  }

  function renderizarPastasSaidaFinanceiro(){
    const view = el('scfFinanceExitView');
    if(!view) return false;

    const titulo = el('scfFinanceRegistrationTitle');
    if(titulo){
      titulo.textContent = 'FINANCEIRO - SAÍDA';
    }

    view.replaceChildren();
    financeExitSelectedMonth = null;
    financeExitStatusFilter = 'ALL';
    document.body.classList.remove('scf-financeiro-saida-mes-open');
    financeExitAtualizarTotaisSituacao();
    desmontarAnoSaidaFinanceiro();


    const grid =
      financeCreateElement(
        'div',
        'scf-sales-history-month-grid'
      );

    const now = new Date();

    FINANCE_MONTHS.forEach(
      function(monthName,monthIndex){
        const futureMonth =
          financeExitSelectedYear > now.getFullYear() ||
          (
            financeExitSelectedYear === now.getFullYear() &&
            monthIndex > now.getMonth()
          );

        const classes = [
          'scf-sales-history-month-folder',
          futureMonth ? 'is-future-month' : ''
        ].filter(Boolean).join(' ');

        const folder =
          financeCreateElement(
            'button',
            classes
          );

        folder.type = 'button';
        folder.dataset.month = String(monthIndex);
        folder.dataset.year = String(financeExitSelectedYear);
        folder.disabled = futureMonth;

        folder.setAttribute(
          'aria-label',
          futureMonth
            ? monthName.toLowerCase() + ' de ' + financeExitSelectedYear + ', mês futuro'
            : 'Abrir saídas de ' + monthName.toLowerCase() + ' de ' + financeExitSelectedYear
        );

        const icon = document.createElement('img');
        icon.className = 'scf-sales-history-folder-icon';
        icon.src = financeFolderIconSrc;
        icon.alt = '';
        icon.setAttribute('aria-hidden','true');

        const name =
          financeCreateElement(
            'span',
            'scf-sales-history-month-name',
            monthName
          );

        const quantidadeSaidas =
          Math.max(
            0,
            Math.trunc(
              saldoNumero(
                financeContaExtratoResumoMes(
                  financeExitSelectedYear,
                  monthIndex
                ).saidas
              )
            )
          );

        const count =
          financeCreateElement(
            'span',
            'scf-sales-history-month-count',
            quantidadeSaidas === 1
              ? '1 SAÍDA'
              : String(quantidadeSaidas) + ' SAÍDAS'
          );

        if(!futureMonth){
          folder.addEventListener('click',function(){
            renderizarTabelaSaidaFinanceiro(monthIndex);
          });
        }

        folder.append(icon,name,count);
        grid.append(folder);
      }
    );

    view.append(grid);
    return true;
  }

  window.__scfPdvInfra.eventBus.on('scf:financeiro-saida-anulada-local',
    function(event){
      const movimentoId = saldoTexto(
        event &&
        event.detail &&
        event.detail.movimentoId
      );

      if(!movimentoId) return;

      financeExitReversedLocalIds.add(movimentoId);

      /*
       * Se a saída anulada for uma SANGRIA arquivada, mantém a anulação
       * também após fechamento/reabertura do caixa e após recarregar a tela.
       */
      const idsAnuladosPersistidos =
        financeExitCarregarSangriasAnuladas();
      idsAnuladosPersistidos.add(movimentoId);
      financeExitSalvarSangriasAnuladas(
        idsAnuladosPersistidos
      );

      if(
        document.body.classList.contains('scf-financeiro-saida-mes-open') &&
        financeExitSelectedMonth !== null
      ){
        renderizarTabelaSaidaFinanceiro(
          financeExitSelectedMonth
        );
      }
    }
  );


  function abrirPaginaSaidaFinanceiro(){
    if(!document.body.classList.contains('scf-financeiro-registration-open')) return false;

    const view = el('scfFinanceExitView');
    const back = el('scfFinanceExitBack');
    const titulo = el('scfFinanceRegistrationTitle');

    if(!view || !back || !titulo) return false;

    /*
     * TROCA LIMPA ENTRADA -> SAÍDA
     * Antes de abrir SAÍDA, desmonta completamente a página ENTRADA
     * para impedir sobreposição de cards, tabela, pastas e seletor de ano.
     */
    document.body.classList.remove(
      'scf-financeiro-entrada-open',
      'scf-financeiro-entrada-mes-open'
    );

    financeEntrySelectedMonth = null;
    financeEntryStatusFilter = 'ALL';

    const entradaView = el('scfFinanceEntryView');
    if(entradaView){
      entradaView.hidden = true;
      entradaView.setAttribute('aria-hidden','true');
    }

    const entradaTotais = el('scfFinanceEntryStatusTotals');
    if(entradaTotais){
      entradaTotais.hidden = true;
      entradaTotais.setAttribute('aria-hidden','true');
    }

    desmontarAnoEntradaFinanceiro();

    /*
     * Garante que uma sangria recém-confirmada já esteja disponível antes
     * de calcular as pastas mensais e a quantidade de SAÍDAS.
     */
    saldoSincronizarMovimentosLocais();

    financeExitSelectedYear =
      new Date().getFullYear();

    financeExitSelectedMonth = null;
    financeExitStatusFilter = 'ALL';

    document.body.classList.remove(
      'scf-financeiro-saida-mes-open'
    );

    document.body.classList.add(
      'scf-financeiro-saida-open'
    );

    titulo.textContent =
      'FINANCEIRO - SAÍDA';

    renderizarPastasSaidaFinanceiro();

    view.hidden = false;
    view.setAttribute('aria-hidden','false');

    back.hidden = false;
    back.setAttribute('aria-hidden','false');

    try{
      back.focus({preventScroll:true});
    }catch(error){}

    return true;
  }

  function fecharPaginaSaidaFinanceiro(){
    if(!document.body.classList.contains('scf-financeiro-saida-open')) return false;

    document.body.classList.remove('scf-financeiro-saida-open');
    document.body.classList.remove('scf-financeiro-saida-mes-open');
    financeExitSelectedMonth = null;

    const view = el('scfFinanceExitView');
    if(view){
      view.hidden = true;
      view.setAttribute('aria-hidden','true');
    }

    const back = el('scfFinanceExitBack');
    if(back){
      back.hidden = true;
      back.setAttribute('aria-hidden','true');
    }

    desmontarAnoSaidaFinanceiro();

    const titulo = el('scfFinanceRegistrationTitle');
    if(titulo){
      titulo.textContent = 'FINANCEIRO';
    }

    const saldoView = el('scfFinanceSaldoView');
    if(saldoView){
      saldoView.hidden = false;
      saldoView.setAttribute('aria-hidden','false');
    }

    try{
      el('scfFinanceExitButton')?.focus({preventScroll:true});
    }catch(error){}

    return true;
  }

  function financeEhEntrada(movimento){
    const tipo = saldoNormalizar(movimento && movimento.tipo);
    const valor = saldoNumero(movimento && movimento.valor);

    /*
     * ENTRADA reúne movimentações manuais positivas do caixa.
     * As vendas normais permanecem no fluxo próprio de vendas.
     */
    if(tipo === 'SUPRIMENTO') return true;
    if(financeEhSaida(movimento)) return false;
    if(valor > 0) return true;

    return false;
  }

  function financeEntradasDoMes(ano,mes){
    /*
     * FINANCEIRO - ENTRADA [MÊS]
     *
     * RECEBIDO:
     * vem do EXTRATO da conta interna (financeiroContaMovimentos).
     *
     * A RECEBER:
     * vem das contas de crediário ainda abertas (CONTA_RECEBER).
     *
     * Uma conta em crediário NÃO entra no livro financeiro interno enquanto
     * ainda está pendente; portanto, se a tabela lesse somente o EXTRATO,
     * o PDV mostraria o crediário em aberto mas o FINANCEIRO exibiria
     * A RECEBER = R$ 0,00. Aqui mesclamos somente as contas pendentes.
     *
     * Contas já recebidas NÃO são adicionadas por esta fonte para evitar
     * duplicidade: depois do pagamento, o recebimento aparece pelo EXTRATO.
     */
    const recebidos =
      financeContaExtratoMovimentosMes(
        ano,
        mes
      )
        .filter(function(movimento){
          if(
            saldoNormalizar(
              movimento && movimento.tipo
            ) !== 'ENTRADA'
          ){
            return false;
          }

          /*
           * Venda comum do caixa não pertence ao FINANCEIRO > ENTRADA.
           * No OFFLINE ela pode existir no livro técnico como VENDA_PAGA
           * para preservar totais/sincronização do caixa, mas sua exibição
           * financeira só deve ocorrer quando houver um lançamento próprio
           * (ex.: fechamento do caixa).
           */
          const marcadorVendaCaixa =
            saldoNormalizar(
              [
                movimento && movimento.origem,
                movimento && movimento.descricao,
                movimento && movimento.motivo,
                movimento && movimento.movementType,
                movimento && movimento.tipoMovimento,
                movimento && movimento.origemDescricao
              ]
                .filter(Boolean)
                .join(' ')
            );

          if(
            movimento && movimento.__scfVendaCaixa === true ||
            marcadorVendaCaixa.includes('VENDA_PAGA') ||
            marcadorVendaCaixa.includes('VENDA CAIXA')
          ){
            return false;
          }

          const data =
            financeDataMovimento(
              movimento
            );

          return (
            !!data &&
            data.getFullYear() === ano &&
            data.getMonth() === mes
          );
        });

    const contasAReceber =
      (
        Array.isArray(
          saldoDadosMovimentos
        )
          ? saldoDadosMovimentos
          : []
      )
        .filter(function(movimento){
          if(
            saldoNormalizar(
              movimento && movimento.tipo
            ) !== 'CONTA_RECEBER'
          ){
            return false;
          }

          if(
            movimento &&
            movimento.recebido === true
          ){
            return false;
          }

          const data =
            financeDataMovimento(
              movimento
            );

          return (
            !!data &&
            data.getFullYear() === ano &&
            data.getMonth() === mes
          );
        });

    /*
     * Proteção contra repetição da mesma conta caso ela exista no cache local
     * e também tenha acabado de chegar da leitura do backend.
     */
    const vistos =
      new Set();

    return recebidos
      .concat(
        contasAReceber
      )
      .filter(function(movimento,index){
        const id =
          saldoTexto(
            movimento &&
            (
              movimento.movimentoId ||
              movimento.id ||
              movimento._id ||
              movimento.crediarioId
            )
          );

        const chave =
          id
            ? (
                saldoNormalizar(
                  movimento && movimento.tipo
                ) +
                '|' +
                id
              )
            : (
                'SEM_ID|' +
                saldoTexto(
                  movimento &&
                  (
                    movimento.ocorridoEm ||
                    movimento.criadoEm ||
                    movimento.abertoEm
                  )
                ) +
                '|' +
                saldoNumero(
                  movimento && movimento.valor
                ).toFixed(2) +
                '|' +
                saldoTexto(
                  movimento &&
                  movimento.clienteNome
                ) +
                '|' +
                index
              );

        if(
          vistos.has(
            chave
          )
        ){
          return false;
        }

        vistos.add(
          chave
        );

        return true;
      })
      .sort(function(a,b){
        const da =
          financeDataMovimento(a);

        const db =
          financeDataMovimento(b);

        return (
          (db ? db.getTime() : 0) -
          (da ? da.getTime() : 0)
        );
      });
  }

  function financeMotivoEntrada(movimento){
    const tipo = saldoNormalizar(movimento && movimento.tipo);
    const motivo = saldoNormalizar(movimento && movimento.motivo);

    if(
      tipo === 'CONTA_RECEBER'
    ){
      return 'CREDIÁRIO';
    }

    if(tipo === 'SUPRIMENTO'){
      if(
        motivo === 'RECEBIMENTO AVULSO'
      ){
        return 'RECEBIMENTO AVULSO';
      }

      if(
        motivo === 'SUPRIMENTO DE CAIXA'
      ){
        return 'SUPRIMENTO DE CAIXA';
      }

      /*
       * Compatibilidade com suprimentos antigos, que tinham MOTIVO livre.
       */
      return 'SUPRIMENTO DE CAIXA';
    }

    if(
      motivo.includes('RECEBIMENTO') ||
      tipo.includes('RECEBIMENTO')
    ){
      return 'RECEBIMENTO AVULSO';
    }

    if(
      motivo.includes('TRANSFERENCIA') ||
      motivo.includes('TRANSFERÊNCIA') ||
      motivo.includes('APORTE') ||
      tipo.includes('TRANSFERENCIA') ||
      tipo.includes('TRANSFERÊNCIA') ||
      tipo.includes('APORTE')
    ){
      return 'TRANSFERÊNCIA / APORTE';
    }

    if(tipo && tipo !== 'AJUSTE'){
      return tipo;
    }

    return 'OUTRA ENTRADA';
  }

  /*
   * FINANCEIRO - ENTRADA — MOTIVO VISUAL.
   *
   * A coluna MOTIVO fica limitada a três rótulos amigáveis, sem alterar
   * a classificação interna usada nos cards, filtros ou cálculos:
   * - CREDIÁRIO: contas a receber;
   * - SUPRIMENTO: aporte/suprimento de caixa;
   * - DIVERSOS: demais entradas, inclusive recebimentos avulsos.
   */
  function financeMotivoEntradaExibicao(movimento){
    const tipo = saldoNormalizar(
      movimento && movimento.tipo
    );

    const origem = saldoNormalizar(
      movimento && movimento.origem
    );

    const motivo = saldoNormalizar(
      movimento && movimento.motivo
    );

    /* EXTRATO DA CONTA INTERNA */
    if(
      tipo === 'ENTRADA' &&
      saldoTexto(movimento && movimento.ocorridoEm)
    ){
      if(origem === 'RECEBIMENTO_CREDIARIO'){
        return 'CREDIÁRIO';
      }

      if(
        origem.includes('SUPRIMENTO') ||
        origem.includes('APORTE')
      ){
        return 'SUPRIMENTO';
      }

      return 'DIVERSOS';
    }

    /* Compatibilidade com registros antigos fora do extrato mensal. */
    if(tipo === 'CONTA_RECEBER'){
      return 'CREDIÁRIO';
    }

    if(tipo === 'SUPRIMENTO'){
      if(motivo === 'RECEBIMENTO AVULSO'){
        return 'DIVERSOS';
      }

      return 'SUPRIMENTO';
    }

    return 'DIVERSOS';
  }

  function financeDetalheEntrada(movimento){
    const tipo =
      saldoNormalizar(
        movimento &&
        movimento.tipo
      );

    const origem =
      saldoNormalizar(
        movimento &&
        movimento.origem
      );

    /*
     * EXTRATO DA CONTA INTERNA — CREDIÁRIO:
     * MOTIVO já exibe CREDIÁRIO; em ORIGEM / DESCRIÇÃO mostramos
     * somente o nome do cliente, sem repetir o prefixo CREDIÁRIO.
     */
    if(
      tipo === 'ENTRADA' &&
      origem === 'RECEBIMENTO_CREDIARIO'
    ){
      const clienteCrediario =
        saldoTexto(
          movimento &&
          movimento.clienteNome
        ) ||
        saldoTexto(
          movimento &&
          movimento.descricao
        )
          .replace(
            /^CREDI[ÁA]RIO\s*(?:—|-|:)\s*/i,
            ''
          )
          .trim();

      return (
        clienteCrediario ||
        'CLIENTE'
      ).toLocaleUpperCase(
        'pt-BR'
      );
    }

    if(
      tipo === 'CONTA_RECEBER'
    ){
      return (
        saldoTexto(
          movimento &&
          movimento.clienteNome
        ) ||
        saldoTexto(
          movimento &&
          movimento.descricao
        ) ||
        'CLIENTE'
      ).toLocaleUpperCase(
        'pt-BR'
      );
    }

    const descricao =
      saldoTexto(
        movimento && (
          movimento.descricao ||
          movimento.observacao ||
          movimento.detalhe ||
          movimento.origemDescricao ||
          movimento.origem
        )
      ).toLocaleUpperCase(
        'pt-BR'
      );

    /*
     * ESTORNO DE SANGRIA — limpeza somente visual.
     * O backend continua preservando SCF_FINANCEIRO_ESTORNO_SAIDA|<id>
     * para auditoria, idempotência e vínculo com a SANGRIA original.
     */
    if(
      descricao.startsWith(
        'SCF_FINANCEIRO_ESTORNO_SAIDA|'
      )
    ){
      return 'ESTORNO DE SANGRIA';
    }

    /*
     * No SUPRIMENTO, o campo motivo é livre. Por isso ele aparece
     * como a descrição/origem enquanto a categoria fica em MOTIVO.
     */
    const motivoLivre =
      saldoTexto(
        movimento &&
        movimento.motivo
      ).toLocaleUpperCase(
        'pt-BR'
      );

    if(descricao){
      return descricao;
    }

    /*
     * Registros novos usam o motivo como categoria e a descrição em campo
     * próprio. Registros antigos usavam o motivo como texto descritivo.
     */
    const motivoNormalizado =
      saldoNormalizar(
        motivoLivre
      );

    if(
      motivoNormalizado ===
        'RECEBIMENTO AVULSO' ||
      motivoNormalizado ===
        'SUPRIMENTO DE CAIXA'
    ){
      return '—';
    }

    return motivoLivre || '—';
  }

  function financeValorEntrada(movimento){
    return saldoMoeda(
      Math.abs(
        saldoNumero(movimento && movimento.valor)
      )
    );
  }

  function financeRecebimentoEntrada(movimento){
    if(!movimento || typeof movimento !== 'object'){
      return '—';
    }

    const candidatos = [
      movimento.dataRecebimento,
      movimento.recebimento,
      movimento.recebidoEm,
      movimento.dataRecebido,
      movimento.dataPagamento,
      movimento.detalhe && movimento.detalhe.dataRecebimento,
      movimento.detalhe && movimento.detalhe.recebimento,
      movimento.metadata && movimento.metadata.dataRecebimento,
      movimento.metadata && movimento.metadata.recebimento
    ];

    /*
     * Compatibilidade com registros enviados pelo formulário de ENTRADA:
     * a data também viaja dentro de SCFDETALHE para sobreviver a pontes
     * antigas que descartem campos extras do postMessage.
     */
    const motivoBruto = saldoTexto(
      movimento.motivo
    );

    const marcador =
      '||SCFDETALHE||';

    const indice =
      motivoBruto.indexOf(
        marcador
      );

    if(indice >= 0){
      try{
        const detalhe = JSON.parse(
          decodeURIComponent(
            motivoBruto.slice(
              indice + marcador.length
            )
          )
        );

        if(
          detalhe &&
          typeof detalhe === 'object'
        ){
          candidatos.push(
            detalhe.dataRecebimento,
            detalhe.recebimento
          );
        }
      }catch(error){}
    }

    for(
      let i = 0;
      i < candidatos.length;
      i += 1
    ){
      const bruto = saldoTexto(
        candidatos[i]
      );

      if(!bruto){
        continue;
      }

      const br = bruto.match(
        /^(\d{2})\/(\d{2})\/(\d{4})$/
      );

      if(br){
        return bruto;
      }

      const iso = bruto.match(
        /^(\d{4})-(\d{2})-(\d{2})/
      );

      if(iso){
        return (
          iso[3] + '/' +
          iso[2] + '/' +
          iso[1]
        );
      }

      const data = new Date(bruto);

      if(
        !Number.isNaN(
          data.getTime()
        )
      ){
        return [
          String(data.getDate()).padStart(2,'0'),
          String(data.getMonth() + 1).padStart(2,'0'),
          String(data.getFullYear())
        ].join('/');
      }
    }

    return '—';
  }

  function financeEntryNormalizarFiltro(valor){
    const filtro = saldoNormalizar(valor);

    if(
      filtro === 'A_RECEBER' ||
      filtro === 'RECEBIDO'
    ){
      return filtro;
    }

    return 'ALL';
  }

  function financeEntryCategoriaMovimento(movimento){
    const tipo = saldoNormalizar(
      movimento && movimento.tipo
    );

    if(
      tipo === 'CONTA_RECEBER' &&
      movimento &&
      movimento.recebido !== true
    ){
      return 'A_RECEBER';
    }

    return 'RECEBIDO';
  }

  function financeEntryAtualizarEstadoVisualFiltros(){
    const host = el('scfFinanceEntryStatusTotals');
    if(!host) return false;

    const filtro =
      financeEntryNormalizarFiltro(
        financeEntryStatusFilter
      );

    host
      .querySelectorAll('[data-scf-finance-entry-filter]')
      .forEach(function(botao){
        const ativo =
          financeEntryNormalizarFiltro(
            botao.getAttribute(
              'data-scf-finance-entry-filter'
            )
          ) === filtro;

        botao.classList.toggle(
          'is-filter-active',
          ativo
        );

        botao.setAttribute(
          'aria-pressed',
          ativo ? 'true' : 'false'
        );
      });

    return true;
  }

  function financeEntryAplicarFiltro(){
    const view = el('scfFinanceEntryView');
    if(!view) return false;

    const filtro =
      financeEntryNormalizarFiltro(
        financeEntryStatusFilter
      );

    const linhas = Array.from(
      view.querySelectorAll(
        '.scf-finance-entry-table-row'
      )
    );

    let visiveis = 0;

    linhas.forEach(function(linha){
      const categoria =
        financeEntryNormalizarFiltro(
          linha.dataset.scfFinanceEntryCategory
        );

      const mostrar =
        filtro === 'ALL' ||
        categoria === filtro;

      linha.classList.toggle(
        'scf-finance-entry-filter-hidden',
        !mostrar
      );

      if(mostrar){
        linha.style.removeProperty('display');
        visiveis += 1;
      }else{
        linha.style.setProperty(
          'display',
          'none',
          'important'
        );
      }
    });

    let vazio = el('scfFinanceEntryFilterEmpty');

    if(
      linhas.length > 0 &&
      !vazio
    ){
      vazio = financeCreateElement(
        'div',
        'scf-finance-entry-table-empty',
        ''
      );

      vazio.id =
        'scfFinanceEntryFilterEmpty';

      vazio.hidden = true;
      view.append(vazio);
    }

    if(vazio){
      const semResultado =
        filtro !== 'ALL' &&
        linhas.length > 0 &&
        visiveis === 0;

      vazio.hidden = !semResultado;

      if(semResultado){
        vazio.textContent =
          filtro === 'A_RECEBER'
            ? 'NENHUM VALOR A RECEBER NESTE MÊS.'
            : 'NENHUM VALOR RECEBIDO NESTE MÊS.';
      }
    }

    financeEntryAtualizarEstadoVisualFiltros();
    return true;
  }

  function financeEntryConfigurarFiltros(){
    const host = el('scfFinanceEntryStatusTotals');
    if(!host) return false;

    if(
      host.dataset.scfFinanceEntryFilterBound ===
        '1'
    ){
      financeEntryAtualizarEstadoVisualFiltros();
      return true;
    }

    host.dataset.scfFinanceEntryFilterBound =
      '1';

    host.addEventListener(
      'click',
      function(event){
        const botao =
          event.target &&
          event.target.closest
            ? event.target.closest(
                '[data-scf-finance-entry-filter]'
              )
            : null;

        if(
          !botao ||
          !host.contains(botao)
        ){
          return;
        }

        financeEntryStatusFilter =
          financeEntryNormalizarFiltro(
            botao.getAttribute(
              'data-scf-finance-entry-filter'
            )
          );

        financeEntryAplicarFiltro();
      }
    );

    financeEntryAtualizarEstadoVisualFiltros();
    return true;
  }

  function financeEntryAtualizarTotais(entradasRecebidas){
    const host = el('scfFinanceEntryStatusTotals');
    if(!host) return false;

    financeEntryConfigurarFiltros();

    const mesAberto =
      document.body.classList.contains(
        'scf-financeiro-entrada-mes-open'
      ) &&
      financeEntrySelectedMonth !== null;

    host.hidden = !mesAberto;
    host.setAttribute(
      'aria-hidden',
      mesAberto ? 'false' : 'true'
    );

    if(!mesAberto){
      return false;
    }

    const entradas =
      Array.isArray(entradasRecebidas)
        ? entradasRecebidas
        : financeEntradasDoMes(
            financeEntrySelectedYear,
            financeEntrySelectedMonth
          );

    let totalRecebimentos = 0;
    let totalOutras = 0;

    entradas.forEach(function(movimento){
      const valor = Math.abs(
        saldoNumero(
          movimento &&
          movimento.valor
        )
      );

      if(
        financeEntryCategoriaMovimento(
          movimento
        ) === 'A_RECEBER'
      ){
        totalRecebimentos += valor;
      }else{
        totalOutras += valor;
      }
    });

    const totalGeral =
      totalRecebimentos +
      totalOutras;

    const recebimentos =
      el('scfFinanceEntryTotalReceipts');

    const outras =
      el('scfFinanceEntryTotalOthers');

    const total =
      el('scfFinanceEntryTotalOverall');

    if(recebimentos){
      recebimentos.textContent =
        saldoMoeda(totalRecebimentos);
    }

    if(outras){
      outras.textContent =
        saldoMoeda(totalOutras);
    }

    if(total){
      total.textContent =
        saldoMoeda(totalGeral);
    }

    host.setAttribute(
      'aria-label',
      'A receber ' +
        saldoMoeda(totalRecebimentos) +
        '. Recebido ' +
        saldoMoeda(totalOutras) +
        '. Total ' +
        saldoMoeda(totalGeral) +
        '.'
    );

    return true;
  }


  function renderizarTabelaEntradaFinanceiro(monthIndex){
    const view = el('scfFinanceEntryView');
    if(!view) return false;

    const mes = Math.max(
      0,
      Math.min(
        11,
        Math.trunc(Number(monthIndex))
      )
    );

    const mesAnterior =
      financeEntrySelectedMonth;

    financeEntrySelectedMonth = mes;

    const titulo =
      el('scfFinanceRegistrationTitle');

    if(titulo){
      titulo.textContent =
        'FINANCEIRO - ENTRADA - ' +
        FINANCE_MONTHS[mes];
    }

    if(
      mesAnterior === null ||
      mesAnterior !== mes
    ){
      financeEntryStatusFilter = 'ALL';
    }

    document.body.classList.add(
      'scf-financeiro-entrada-mes-open'
    );

    desmontarAnoEntradaFinanceiro();
    view.replaceChildren();

    const cabecalho = financeCreateElement(
      'div',
      'scf-finance-entry-table-header'
    );

    [
      'DATA',
      'HORA',
      'VALOR',
      'MOTIVO',
      'ORIGEM / DESCRIÇÃO',
      'VENCE EM',
      'SITUAÇÃO'
    ].forEach(function(rotulo){
      cabecalho.append(
        financeCreateElement(
          'span',
          '',
          rotulo
        )
      );
    });

    view.append(cabecalho);

    const corpoTabela = financeCreateElement(
      'div',
      'scf-finance-entry-table-body'
    );

    view.append(corpoTabela);

    const chaveExtratoMes =
      financeContaExtratoChaveMes(
        financeEntrySelectedYear,
        mes
      );

    if(!financeContaExtratoTemCache(financeEntrySelectedYear,mes)){
      financeContaExtratoSolicitarMes(
        financeEntrySelectedYear,
        mes
      );

      financeEntryAtualizarTotais([]);

      corpoTabela.append(
        financeCreateElement(
          'div',
          'scf-finance-entry-table-empty',
          'CARREGANDO EXTRATO DA CONTA...'
        )
      );

      return true;
    }

    if(financeAccountExtractMonthErrors[chaveExtratoMes]){
      financeEntryAtualizarTotais([]);

      corpoTabela.append(
        financeCreateElement(
          'div',
          'scf-finance-entry-table-empty',
          financeAccountExtractMonthErrors[chaveExtratoMes]
        )
      );

      return true;
    }

    const entradas = financeEntradasDoMes(
      financeEntrySelectedYear,
      mes
    );

    financeEntryAtualizarTotais(
      entradas
    );

    if(entradas.length === 0){
      corpoTabela.append(
        financeCreateElement(
          'div',
          'scf-finance-entry-table-empty',
          'NENHUMA ENTRADA NESTE MÊS.'
        )
      );

      return true;
    }

    entradas.forEach(function(movimento){
      const row = financeCreateElement(
        'div',
        'scf-finance-entry-table-row'
      );

      const data = financeDataMovimento(movimento);

      row.dataset.scfFinanceEntryCategory =
        financeEntryCategoriaMovimento(
          movimento
        );

      const dataCell = financeCreateElement(
        'span',
        '',
        data
          ? [
              String(data.getDate()).padStart(2,'0'),
              String(data.getMonth() + 1).padStart(2,'0')
            ].join('/')
          : '--/--'
      );

      const horaCell = financeCreateElement(
        'span',
        '',
        data
          ? saldoHorarioMovimento(data.toISOString())
          : '--:--'
      );

      const valorCell = financeCreateElement(
        'span',
        '',
        financeValorEntrada(movimento)
      );

      const motivoTexto =
        financeMotivoEntradaExibicao(movimento);

      const motivoCell = financeCreateElement(
        'span',
        'is-motivo',
        motivoTexto
      );

      motivoCell.title = motivoTexto;

      const detalheTexto =
        financeDetalheEntrada(movimento);

      const detalheCell = financeCreateElement(
        'span',
        'is-detalhe',
        detalheTexto
      );

      detalheCell.title = detalheTexto;

      const recebimentoTexto =
        financeRecebimentoEntrada(
          movimento
        );

      const recebimentoCell = financeCreateElement(
        'span',
        'is-recebimento',
        recebimentoTexto
      );

      recebimentoCell.title =
        recebimentoTexto === '—'
          ? 'Data de recebimento não informada'
          : 'Recebimento em ' + recebimentoTexto;

      /*
       * SITUAÇÃO:
       * - SUPRIMENTO/entrada comum já nasce RECEBIDO e é somente informativo;
       * - CONTA_RECEBER (F5 CREDIÁRIO) nasce A RECEBER e o checkbox é persistente.
       */
      const situacaoCell = financeCreateElement(
        'span',
        'is-situacao'
      );

      const situacaoLabel =
        document.createElement('label');

      const tipoEntrada =
        saldoNormalizar(
          movimento &&
          movimento.tipo
        );

      const contaReceber =
        tipoEntrada ===
          'CONTA_RECEBER';

      const recebido =
        contaReceber
          ? (
              movimento &&
              movimento.recebido ===
                true
            )
          : true;

      situacaoLabel.className =
        'scf-finance-entry-received-label ' +
        (
          recebido
            ? 'is-received'
            : 'is-pending'
        );

      const situacaoInput =
        document.createElement('input');

      situacaoInput.type =
        'checkbox';

      situacaoInput.checked =
        recebido;

      /*
       * CREDIÁRIO é recebido exclusivamente pelo PDV: F5 -> PAGAR.
       * A coluna Financeiro permanece informativa e não altera a situação.
       */
      situacaoInput.disabled =
        true;

      situacaoInput.tabIndex =
        -1;

      situacaoInput.className =
        'scf-finance-entry-received-checkbox';

      const movimentoIdContaReceber =
        saldoTexto(
          movimento &&
          (
            movimento.movimentoId ||
            movimento.id ||
            movimento._id
          )
        );

      if(
        contaReceber
      ){
        situacaoInput.dataset.scfContaReceberId =
          movimentoIdContaReceber;

        situacaoInput.setAttribute(
          'aria-label',
          recebido
            ? 'Crediário recebido'
            : 'Crediário a receber. Use F5 CREDIÁRIO e PAGAR no PDV.'
        );
      }else{
        situacaoInput.setAttribute(
          'aria-label',
          'Entrada recebida'
        );
      }

      const situacaoTexto =
        document.createElement('span');

      situacaoTexto.className =
        'scf-finance-entry-received-text';

      situacaoTexto.textContent =
        recebido
          ? 'RECEBIDO'
          : 'A RECEBER';

      if(
        contaReceber
      ){
        situacaoInput.addEventListener(
          'change',
          function(){
            const novoRecebido =
              situacaoInput.checked ===
                true;

            if(
              !movimentoIdContaReceber
            ){
              situacaoInput.checked =
                !novoRecebido;

              return;
            }

            const requestId =
              'scf-conta-receber-situacao-' +
              Date.now() +
              '-' +
              Math.random()
                .toString(36)
                .slice(2,8);

            financeDomain.receivablePending[
              requestId
            ] = {
              input:
                situacaoInput,
              label:
                situacaoLabel,
              text:
                situacaoTexto,
              anterior:
                !novoRecebido
            };

            situacaoInput.disabled =
              true;

            situacaoTexto.textContent =
              'ATUALIZANDO...';

            window.__scfPdvInfra.shellBridge.post(
              {
                type:
                  'SCF_FINANCEIRO_CONTA_RECEBER_SITUACAO_ATUALIZAR',

                requestId,

                movimentoId:
                  movimentoIdContaReceber,

                recebido:
                  novoRecebido
              },
              '*'
            );
          }
        );
      }

      situacaoLabel.append(
        situacaoInput,
        situacaoTexto
      );

      situacaoCell.append(
        situacaoLabel
      );

      row.append(
        dataCell,
        horaCell,
        valorCell,
        motivoCell,
        detalheCell,
        recebimentoCell,
        situacaoCell
      );

      corpoTabela.append(row);
    });

    financeEntryAplicarFiltro();
    return true;
  }


  function renderizarPastasEntradaFinanceiro(){
    const view = el('scfFinanceEntryView');
    if(!view) return false;

    view.replaceChildren();

    financeEntrySelectedMonth = null;
    financeEntryStatusFilter = 'ALL';

    document.body.classList.remove(
      'scf-financeiro-entrada-mes-open'
    );

    const titulo =
      el('scfFinanceRegistrationTitle');

    if(titulo){
      titulo.textContent =
        'FINANCEIRO - ENTRADA';
    }

    financeEntryAtualizarTotais();

    desmontarAnoEntradaFinanceiro();


    const grid =
      financeCreateElement(
        'div',
        'scf-sales-history-month-grid'
      );

    const now = new Date();

    FINANCE_MONTHS.forEach(
      function(monthName,monthIndex){
        const futureMonth =
          financeEntrySelectedYear > now.getFullYear() ||
          (
            financeEntrySelectedYear === now.getFullYear() &&
            monthIndex > now.getMonth()
          );

        const classes = [
          'scf-sales-history-month-folder',
          futureMonth ? 'is-future-month' : ''
        ].filter(Boolean).join(' ');

        const folder =
          financeCreateElement(
            'button',
            classes
          );

        folder.type = 'button';
        folder.dataset.month = String(monthIndex);
        folder.dataset.year = String(financeEntrySelectedYear);
        folder.disabled = futureMonth;

        folder.setAttribute(
          'aria-label',
          futureMonth
            ? monthName.toLowerCase() + ' de ' + financeEntrySelectedYear + ', mês futuro'
            : 'Abrir entradas de ' + monthName.toLowerCase() + ' de ' + financeEntrySelectedYear
        );

        const icon = document.createElement('img');
        icon.className = 'scf-sales-history-folder-icon';
        icon.src = financeFolderIconSrc;
        icon.alt = '';
        icon.setAttribute('aria-hidden','true');

        const name =
          financeCreateElement(
            'span',
            'scf-sales-history-month-name',
            monthName
          );

        const quantidadeEntradas =
          Math.max(
            0,
            Math.trunc(
              saldoNumero(
                financeContaExtratoResumoMes(
                  financeEntrySelectedYear,
                  monthIndex
                ).entradas
              )
            )
          );

        const count =
          financeCreateElement(
            'span',
            'scf-sales-history-month-count',
            quantidadeEntradas === 1
              ? '1 ENTRADA'
              : String(quantidadeEntradas) + ' ENTRADAS'
          );

        if(!futureMonth){
          folder.addEventListener(
            'click',
            function(){
              renderizarTabelaEntradaFinanceiro(
                monthIndex
              );
            }
          );
        }

        folder.append(icon,name,count);
        grid.append(folder);
      }
    );

    view.append(grid);
    return true;
  }

  function abrirPaginaEntradaFinanceiro(){
    if(!document.body.classList.contains('scf-financeiro-registration-open')) return false;

    const view = el('scfFinanceEntryView');
    const back = el('scfFinanceExitBack');
    const titulo = el('scfFinanceRegistrationTitle');

    if(!view || !back || !titulo) return false;

    /*
     * TROCA LIMPA SAÍDA -> ENTRADA
     * Antes de abrir ENTRADA, desmonta completamente a página SAÍDA
     * para impedir sobreposição de cards, tabela, pastas e seletor de ano.
     */
    document.body.classList.remove(
      'scf-financeiro-saida-open',
      'scf-financeiro-saida-mes-open'
    );

    financeExitSelectedMonth = null;
    financeExitStatusFilter = 'ALL';

    const saidaView = el('scfFinanceExitView');
    if(saidaView){
      saidaView.hidden = true;
      saidaView.setAttribute('aria-hidden','true');
    }

    const saidaTotais = el('scfFinanceExitStatusTotals');
    if(saidaTotais){
      saidaTotais.hidden = true;
      saidaTotais.setAttribute('aria-hidden','true');
    }

    desmontarAnoSaidaFinanceiro();

    /*
     * Inclui imediatamente um SUPRIMENTO recém-confirmado no histórico.
     */
    saldoSincronizarMovimentosLocais();

    financeEntrySelectedYear =
      new Date().getFullYear();

    financeEntrySelectedMonth = null;
    financeEntryStatusFilter = 'ALL';

    document.body.classList.remove(
      'scf-financeiro-entrada-mes-open'
    );

    document.body.classList.add(
      'scf-financeiro-entrada-open'
    );

    titulo.textContent =
      'FINANCEIRO - ENTRADA';

    renderizarPastasEntradaFinanceiro();

    view.hidden = false;
    view.setAttribute('aria-hidden','false');

    back.hidden = false;
    back.setAttribute('aria-hidden','false');

    try{
      back.focus({preventScroll:true});
    }catch(error){}

    return true;
  }

  function fecharPaginaEntradaFinanceiro(){
    if(!document.body.classList.contains('scf-financeiro-entrada-open')) return false;

    document.body.classList.remove('scf-financeiro-entrada-open');
    document.body.classList.remove('scf-financeiro-entrada-mes-open');

    financeEntrySelectedMonth = null;
    financeEntryStatusFilter = 'ALL';
    financeEntryAtualizarTotais();

    const view = el('scfFinanceEntryView');
    if(view){
      view.hidden = true;
      view.setAttribute('aria-hidden','true');
    }

    const back = el('scfFinanceExitBack');
    if(back){
      back.hidden = true;
      back.setAttribute('aria-hidden','true');
    }

    desmontarAnoEntradaFinanceiro();

    const titulo = el('scfFinanceRegistrationTitle');
    if(titulo){
      titulo.textContent = 'FINANCEIRO';
    }

    const saldoView = el('scfFinanceSaldoView');
    if(saldoView){
      saldoView.hidden = false;
      saldoView.setAttribute('aria-hidden','false');
    }

    try{
      el('scfFinanceEntryButton')?.focus({preventScroll:true});
    }catch(error){}

    return true;
  }


  function financeSaldoRightMarkup(){
    return ''
      + '<section id="scfFinanceSaldoRightDashboard" class="scf-fin-bank-dashboard" aria-label="Conta financeira interna">'
      +   '<div class="scf-fin-bank-head">'
      +     '<div class="scf-fin-bank-head-title">'
      +       '<span class="scf-fin-bank-kicker">CONTA FINANCEIRA</span>'
      +       '<strong>SALDO E MOVIMENTAÇÕES</strong>'
      +     '</div>'
      +     '<span class="scf-fin-bank-badge">CONTA INTERNA</span>'
      +   '</div>'
      +   '<div class="scf-fin-bank-balance-card">'
      +     '<span class="scf-fin-bank-balance-label">SALDO DISPONÍVEL</span>'
      +     '<strong class="scf-fin-bank-balance-value" id="scfFinanceAccountBalanceValue">R$ 0,00</strong>'
      +     '<small class="scf-fin-bank-balance-meta" id="scfFinanceAccountBalanceMeta">POSIÇÃO DA CONTA FINANCEIRA</small>'
      +   '</div>'
      +   '<div id="scfFinanceHeaderActions" class="scf-fin-bank-actions" aria-label="Movimentações financeiras">'
      +     '<button class="scf-sales-history-export scf-finance-header-action" id="scfFinanceEntryButton" type="button" aria-label="Entrada">'
      +       '<img class="scf-sales-history-export-icon" alt="" aria-hidden="true" src="' + financeMovementIconSrc + '">'
      +       '<span class="scf-sales-history-export-text">ENTRADA</span>'
      +     '</button>'
      +     '<button class="scf-sales-history-export scf-finance-header-action" id="scfFinanceExitButton" type="button" aria-label="Saída">'
      +       '<img class="scf-sales-history-export-icon" alt="" aria-hidden="true" src="' + financeMovementIconSrc + '">'
      +       '<span class="scf-sales-history-export-text">SAÍDA</span>'
      +     '</button>'
      +   '</div>'
      +   '<div class="scf-fin-bank-extract-head">'
      +     '<strong>ÚLTIMAS MOVIMENTAÇÕES</strong>'
      +     '<span id="scfFinanceAccountMovementCount">0 LANÇAMENTOS</span>'
      +   '</div>'
      +   '<div id="scfFinanceAccountMovements" class="scf-fin-bank-extract scf-fin-bank-movements-card" aria-label="Últimas movimentações da conta financeira"></div>'
      + '</section>';
  }

  function saldoContaFinanceiraDataHora(valor){
    const data =
      valor
        ? new Date(valor)
        : null;

    if(
      !data ||
      Number.isNaN(
        data.getTime()
      )
    ){
      return {
        data:'--/--',
        hora:'--:--'
      };
    }

    return {
      data:[
        String(data.getDate()).padStart(2,'0'),
        String(data.getMonth() + 1).padStart(2,'0')
      ].join('/'),
      hora:[
        String(data.getHours()).padStart(2,'0'),
        String(data.getMinutes()).padStart(2,'0')
      ].join(':')
    };
  }

  function saldoContaFinanceiraDescricao(movimento){
    const origem =
      saldoNormalizar(
        movimento && movimento.origem
      );

    if(origem === 'FECHAMENTO_CAIXA'){
      return 'FECHAMENTO DE CAIXA';
    }

    if(origem === 'PAGAMENTO_CONTA_PAGAR'){
      return (
        saldoTexto(
          movimento && movimento.descricao
        ) ||
        'PAGAMENTO DE CONTA'
      ).toLocaleUpperCase('pt-BR');
    }

    if(origem === 'ESTORNO_PAGAMENTO'){
      const descricao =
        saldoTexto(
          movimento && movimento.descricao
        );

      return (
        'ESTORNO' +
        (
          descricao
            ? ' — ' + descricao
            : ''
        )
      ).toLocaleUpperCase('pt-BR');
    }

    if(origem === 'AJUSTE_VALOR_CONTA_PAGA'){
      const descricao =
        saldoTexto(
          movimento && movimento.descricao
        );

      return (
        'AJUSTE DE PAGAMENTO' +
        (
          descricao
            ? ' — ' + descricao
            : ''
        )
      ).toLocaleUpperCase('pt-BR');
    }

    if(origem === 'ESTORNO_EXCLUSAO_CONTA_PAGA'){
      const descricao =
        saldoTexto(
          movimento && movimento.descricao
        );

      return (
        'ESTORNO DE EXCLUSÃO' +
        (
          descricao
            ? ' — ' + descricao
            : ''
        )
      ).toLocaleUpperCase('pt-BR');
    }

    return (
      saldoTexto(
        movimento && movimento.descricao
      ) ||
      saldoTexto(
        movimento && movimento.origem
      ) ||
      'MOVIMENTAÇÃO FINANCEIRA'
    ).toLocaleUpperCase('pt-BR');
  }

  function montarCalendarioSaldoDireito(){
    const grid = el('scfFinanceSaldoRightCalendarGrid');
    if(!grid) return;

    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    const primeiroDia = new Date(ano,mes,1).getDay();
    const totalDias = new Date(ano,mes + 1,0).getDate();
    const totalCelulas = Math.ceil((primeiroDia + totalDias) / 7) * 7;

    grid.replaceChildren();

    for(let indice = 0; indice < totalCelulas; indice += 1){
      const celula = document.createElement('span');
      const dia = indice - primeiroDia + 1;

      celula.className = 'scf-history-inline-calendar-day scf-fin-saldo-cal-day';

      if(dia < 1 || dia > totalDias){
        celula.classList.add('is-empty');
        celula.setAttribute('aria-hidden','true');
      }else{
        celula.textContent = String(dia);
        const semana = new Date(ano,mes,dia).getDay();
        if(semana === 0){
          celula.classList.add('is-sunday');
        }
        if(dia === hoje.getDate()){
          celula.classList.add('is-today');
          celula.setAttribute('aria-current','date');
        }
      }

      grid.appendChild(celula);
    }
  }

  function saldoNumero(valor){
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : 0;
  }

  function saldoMoeda(valor){
    return saldoNumero(valor).toLocaleString(
      'pt-BR',
      {
        style:'currency',
        currency:'BRL'
      }
    );
  }

  function saldoTexto(valor){
    return String(valor ?? '').replace(/\s+/g,' ').trim();
  }

  function saldoNormalizar(valor){
    return saldoTexto(valor)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toUpperCase();
  }

  /*
   * Movimentos de caixa confirmados durante a sessão podem chegar ao
   * Financeiro antes de a consulta geral do backend terminar. O identificador
   * abaixo permite mesclar as duas fontes sem repetir a mesma sangria.
   */
  function saldoChaveMovimento(movimento,indice){
    const id = saldoTexto(
      movimento &&
      (
        movimento.id ||
        movimento._id ||
        movimento.movimentoId
      )
    );

    if(id){
      return 'ID|' + id;
    }

    const criadoEm = saldoTexto(
      movimento &&
      (
        movimento.criadoEm ||
        movimento._createdDate ||
        movimento.createdAt
      )
    );

    const valor =
      movimento &&
      movimento.valor !=
        null
        ? Number(
            movimento.valor
          )
        : NaN;

    return [
      'MOV',
      saldoNormalizar(
        movimento &&
        movimento.tipo
      ),
      criadoEm,
      Number.isFinite(valor)
        ? valor.toFixed(4)
        : saldoTexto(
            movimento &&
            movimento.valor
          ),
      saldoNormalizar(
        movimento &&
        movimento.motivo
      ),
      saldoNormalizar(
        movimento &&
        movimento.descricao
      )
    ].join('|');
  }

  function saldoRemoverMovimentosDuplicados(movimentos){
    const mapa = new Map();

    (
      Array.isArray(movimentos)
        ? movimentos
        : []
    ).forEach(
      function(movimento,indice){
        if(
          !movimento ||
          typeof movimento !==
            'object'
        ){
          return;
        }

        const chave =
          saldoChaveMovimento(
            movimento,
            indice
          );

        /*
         * Se o backend chegar depois do cache local e possuir o mesmo ID,
         * ele substitui o objeto local, preservando os dados persistidos.
         */
        mapa.set(
          chave,
          movimento
        );
      }
    );

    return Array.from(
      mapa.values()
    );
  }

  function saldoMovimentosLocaisConfirmados(){
    return Array.isArray(
      financeDomain.localMovements
    )
      ? financeDomain.localMovements.filter(
          function(movimento){
            const tipo =
              saldoNormalizar(
                movimento &&
                movimento.tipo
              );

            return tipo ===
              'SANGRIA' ||
              tipo ===
                'SUPRIMENTO' ||
              tipo ===
                'CONTA_PAGAR';
          }
        )
      : [];
  }

  function saldoMesclarMovimentosComLocais(movimentos){
    /*
     * Locais primeiro e backend depois: quando ambos têm o mesmo ID, o Map
     * mantém uma única posição e o objeto definitivo do backend prevalece.
     */
    return saldoRemoverMovimentosDuplicados(
      saldoMovimentosLocaisConfirmados()
        .concat(
          Array.isArray(movimentos)
            ? movimentos
            : []
        )
    );
  }

  function saldoSincronizarMovimentosLocais(){
    saldoDadosMovimentos =
      saldoMesclarMovimentosComLocais(
        saldoDadosMovimentos
      );

    if(
      Array.isArray(
        saldoAtualizacaoMovimentos
      ) &&
      saldoAtualizacaoMovimentos.length >
        0
    ){
      saldoAtualizacaoMovimentos =
        saldoMesclarMovimentosComLocais(
          saldoAtualizacaoMovimentos
        );
    }

    return saldoDadosMovimentos;
  }

  function saldoPaymentKey(valor){
    const metodo = saldoNormalizar(valor);
    if(metodo.includes('CREDITO')) return 'credito';
    if(metodo.includes('DEBITO')) return 'debito';
    if(metodo.includes('DINHEIRO')) return 'dinheiro';
    if(metodo.includes('PIX')) return 'pix';
    return '';
  }

  function saldoPaymentKeysFromLabel(rotulo){
    return Array.from(
      new Set(
        saldoTexto(rotulo)
          .split(/\s*\+\s*/)
          .map(saldoPaymentKey)
          .filter(Boolean)
      )
    );
  }

  function saldoDataVenda(venda){
    const valor = venda && venda.saleDate;
    const data = valor ? new Date(valor) : null;
    return data && !Number.isNaN(data.getTime()) ? data : null;
  }

  function saldoVendaComoMovimentoCaixa(venda,indice){
    if(!venda || typeof venda !== 'object') return null;

    const saleId = saldoTexto(
      venda.saleId ||
      venda.identificadordavenda
    );

    const dataBruta = saldoTexto(
      venda.saleDate ||
      venda.paidAt ||
      venda.savedAt ||
      venda.criadoEm
    );

    const data = dataBruta ? new Date(dataBruta) : null;
    const valor = saldoNumero(
      venda.totalValue != null
        ? venda.totalValue
        : venda.total
    );

    if(
      !saleId ||
      !data ||
      Number.isNaN(data.getTime()) ||
      !Number.isFinite(valor) ||
      valor <= 0
    ){
      return null;
    }

    const origemVenda = saldoNormalizar(
      venda.origemVenda
    );

    const crediario =
      venda.crediarioLiquidacao === true ||
      origemVenda === 'CREDIARIO';

    const operadorNome = saldoTexto(
      venda.operadorNome ||
      venda.nomeOperador ||
      venda.operatorName
    );

    const operadorId = saldoTexto(
      venda.operadorId ||
      venda.operatorId
    );

    const formaPagamento = saldoTexto(
      venda.paymentMethod ||
      venda.payment
    );

    return {
      id:'SCF_VENDA_CAIXA|' + saleId,
      movimentoId:'SCF_VENDA_CAIXA|' + saleId,
      saleId,
      caixaSessaoId:saldoTexto(
        venda.caixaSessaoId ||
        venda.cashSessionId
      ),
      tipo:'VENDA',
      valor:Math.abs(valor),
      motivo:formaPagamento || 'VENDA',
      descricao:'VENDA_PAGA',
      origem:crediario ? 'CREDIARIO' : 'VENDA_PAGA',
      criadoEm:data.toISOString(),
      operadorNome,
      operadorId,
      __scfVendaCaixa:true,
      __scfVendaIndice:indice
    };
  }

  function saldoVendasComoMovimentosCaixa(vendas){
    return (
      Array.isArray(vendas)
        ? vendas
        : []
    )
      .map(saldoVendaComoMovimentoCaixa)
      .filter(Boolean);
  }

  function saldoVendaMovimentoPertenceCaixaAtual(movimento){
    const consulta =
      saldoDadosCaixaConsulta &&
      typeof saldoDadosCaixaConsulta === 'object'
        ? saldoDadosCaixaConsulta
        : null;

    const caixa =
      consulta &&
      consulta.aberto === true &&
      consulta.caixa &&
      typeof consulta.caixa === 'object'
        ? consulta.caixa
        : null;

    if(!caixa) return false;

    const caixaId = saldoTexto(
      caixa.id ||
      caixa.caixaSessaoId
    );

    const movimentoCaixaId = saldoTexto(
      movimento && movimento.caixaSessaoId
    );

    if(caixaId && movimentoCaixaId){
      return caixaId === movimentoCaixaId;
    }

    const abertoBruto = saldoTexto(
      caixa.abertoEm ||
      (
        caixa.resumo &&
        caixa.resumo.abertoEm
      )
    );

    const movimentoBruto = saldoTexto(
      movimento && movimento.criadoEm
    );

    const abertoEm = abertoBruto ? new Date(abertoBruto) : null;
    const criadoEm = movimentoBruto ? new Date(movimentoBruto) : null;

    return Boolean(
      abertoEm &&
      criadoEm &&
      !Number.isNaN(abertoEm.getTime()) &&
      !Number.isNaN(criadoEm.getTime()) &&
      criadoEm.getTime() >= abertoEm.getTime()
    );
  }

  function saldoSetText(id,valor){
    const node = el(id);
    if(node) node.textContent = String(valor);
  }

  function saldoPercentual(valor){
    return saldoNumero(valor).toLocaleString(
      'pt-BR',
      {
        minimumFractionDigits:1,
        maximumFractionDigits:1
      }
    ) + '%';
  }

  function saldoRemoverDuplicadas(vendas){
    const mapa = new Map();

    vendas.forEach(function(venda,indice){
      const saleId = saldoTexto(
        venda && (
          venda.saleId ||
          venda.identificadordavenda
        )
      );

      const chave = saleId || [
        saldoTexto(venda && venda.saleDate),
        saldoTexto(venda && venda.totalValue),
        String(indice)
      ].join('|');

      mapa.set(chave,venda);
    });

    return Array.from(mapa.values());
  }

  function saldoMetricasMesAtual(vendas){
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();

    const metricas = {
      totalVendas:0,
      totalNfce:0,
      totalNfe:0,
      totalCancelamentos:0,
      totalDevolucoes:0,
      credito:0,
      debito:0,
      dinheiro:0,
      pix:0
    };

    vendas.forEach(function(venda){
      const data = saldoDataVenda(venda);
      if(
        !data ||
        data.getFullYear() !== ano ||
        data.getMonth() !== mes
      ){
        return;
      }

      const receita = saldoNumero(venda && venda.totalValue);
      metricas.totalVendas += receita;

      if(saldoNumero(venda && venda.numeroNfce) > 0){
        metricas.totalNfce += 1;
      }

      if(venda && venda.nfe55Autorizada === true){
        metricas.totalNfe += 1;
      }

      if(saldoNormalizar(venda && venda.fiscalStatus) === 'CANCELADA'){
        metricas.totalCancelamentos += 1;
      }

      const quantidadeDevolucoes = Math.max(
        0,
        Math.trunc(
          saldoNumero(
            venda && venda.nfe55DevolucoesAutorizadasQuantidade
          )
        )
      );

      metricas.totalDevolucoes += quantidadeDevolucoes;

      const partes = venda && Array.isArray(venda.paymentParts)
        ? venda.paymentParts
        : [];

      if(partes.length){
        partes.forEach(function(parte){
          const chave = saldoPaymentKey(
            parte && (
              parte.method ||
              parte.metodo ||
              parte.paymentMethod
            )
          );

          const valor = saldoNumero(
            parte && (
              parte.amount ??
              parte.valor ??
              0
            )
          );

          if(chave){
            metricas[chave] += Math.max(0,valor);
          }
        });

        return;
      }

      const chaves = saldoPaymentKeysFromLabel(
        venda && venda.paymentMethod
      );

      if(chaves.length === 1){
        metricas[chaves[0]] += receita;
      }else if(chaves.length > 1 && receita > 0){
        const quota = receita / chaves.length;
        chaves.forEach(function(chave){
          metricas[chave] += quota;
        });
      }
    });

    return metricas;
  }

  function saldoDataMovimento(valor){
    const data = valor ? new Date(valor) : null;
    if(!data || Number.isNaN(data.getTime())) return '--/--/----';

    return data.toLocaleDateString(
      'pt-BR',
      {day:'2-digit',month:'2-digit',year:'numeric'}
    );
  }

  function saldoHorarioMovimento(valor){
    const data = valor ? new Date(valor) : null;
    if(!data || Number.isNaN(data.getTime())) return '--:--';

    return data.toLocaleTimeString(
      'pt-BR',
      {hour:'2-digit',minute:'2-digit'}
    );
  }

  function saldoMovimentoDuplicaVendaCaixa(
    movimento,
    vendas
  ){
    if(
      !movimento ||
      typeof movimento !== 'object'
    ){
      return false;
    }

    const tipo =
      saldoNormalizar(
        movimento.tipo ||
        movimento.movementType ||
        movimento.tipoMovimento
      );

    const marcador =
      saldoNormalizar(
        [
          movimento.origem,
          movimento.descricao,
          movimento.motivo,
          movimento.origemDescricao
        ]
          .filter(Boolean)
          .join(' ')
      );

    if(
      tipo !== 'AJUSTE' ||
      !marcador.includes('VENDA CAIXA')
    ){
      return false;
    }

    const sourceId =
      saldoTexto(
        movimento.sourceId ||
        movimento.saleId ||
        movimento.vendaId
      );

    const valorMovimento =
      Math.round(
        Math.abs(
          saldoNumero(
            movimento.valor
          )
        ) * 100
      );

    const dataMovimentoBruta =
      saldoTexto(
        movimento.criadoEm ||
        movimento.dataMovimento ||
        movimento.dataHora ||
        movimento.ocorridoEm ||
        movimento._createdDate ||
        movimento.createdAt
      );

    const dataMovimento =
      dataMovimentoBruta
        ? new Date(
            dataMovimentoBruta
          )
        : null;

    return (
      Array.isArray(vendas)
        ? vendas
        : []
    ).some(function(venda){
      if(
        !venda ||
        typeof venda !== 'object'
      ){
        return false;
      }

      const vendaSaleId =
        saldoTexto(
          venda.saleId ||
          venda.sourceId ||
          venda.vendaId
        );

      if(
        sourceId &&
        vendaSaleId &&
        sourceId === vendaSaleId
      ){
        return true;
      }

      const valorVenda =
        Math.round(
          Math.abs(
            saldoNumero(
              venda.valor
            )
          ) * 100
        );

      if(
        valorMovimento !==
        valorVenda
      ){
        return false;
      }

      const dataVendaBruta =
        saldoTexto(
          venda.criadoEm ||
          venda.saleDate ||
          venda.paidAt ||
          venda.savedAt
        );

      const dataVenda =
        dataVendaBruta
          ? new Date(
              dataVendaBruta
            )
          : null;

      if(
        !dataMovimento ||
        !dataVenda ||
        Number.isNaN(
          dataMovimento.getTime()
        ) ||
        Number.isNaN(
          dataVenda.getTime()
        )
      ){
        return false;
      }

      return (
        Math.abs(
          dataMovimento.getTime() -
          dataVenda.getTime()
        ) <= 120000
      );
    });
  }

  function saldoTipoMovimento(movimento){
    const tipo =
      saldoNormalizar(
        movimento && (
          movimento.tipo ||
          movimento.movementType ||
          movimento.tipoMovimento
        )
      );

    const motivo = saldoNormalizar(movimento && movimento.motivo);

    if(tipo === 'AJUSTE' && motivo.includes('REEMBOLSO')) return 'REEMBOLSO';
    if(tipo === 'AJUSTE' && motivo.includes('CANCELAMENTO')) return 'ESTORNO';
    return tipo || 'AJUSTE';
  }

  function saldoValorMovimento(movimento){
    const tipo =
      saldoNormalizar(
        movimento && (
          movimento.tipo ||
          movimento.movementType ||
          movimento.tipoMovimento
        )
      );
    const valorOriginal = saldoNumero(movimento && movimento.valor);
    const absoluto = Math.abs(valorOriginal);

    let sinal = '';
    if(tipo === 'SANGRIA') sinal = '- ';
    else if(tipo === 'SUPRIMENTO') sinal = '+ ';
    else if(valorOriginal < 0) sinal = '- ';
    else if(valorOriginal > 0) sinal = '+ ';

    return sinal + saldoMoeda(absoluto);
  }

  function renderizarSaldoMovimentos(){
    const host = el('scfFinanceSaldoExtratoRows');
    if(!host) return;

    const vendasMovimentos =
      Array.isArray(
        saldoDadosVendasComoMovimentos
      )
        ? saldoDadosVendasComoMovimentos
        : [];

    const vendasVisiveis =
      saldoFiltroDataMovimentacaoCaixa
        ? vendasMovimentos
        : vendasMovimentos.filter(
            saldoVendaMovimentoPertenceCaixaAtual
          );

    const fonteMovimentos =
      saldoFiltroDataMovimentacaoCaixa
        ? saldoRemoverMovimentosDuplicados(
            (
              Array.isArray(
                saldoDadosMovimentosCaixaHistoricos
              )
                ? saldoDadosMovimentosCaixaHistoricos
                : []
            ).concat(
              Array.isArray(
                saldoDadosMovimentos
              )
                ? saldoDadosMovimentos
                : [],
              vendasVisiveis
            )
          )
        : saldoRemoverMovimentosDuplicados(
            (
              Array.isArray(
                saldoDadosMovimentos
              )
                ? saldoDadosMovimentos
                : []
            ).concat(
              vendasVisiveis
            )
          );

    const movimentos =
      fonteMovimentos.filter(
        function(movimento){
          const tipo =
            saldoNormalizar(
              movimento && (
                movimento.tipo ||
                movimento.movementType ||
                movimento.tipoMovimento
              )
            );

          /*
           * Venda paga já é representada pela linha visual VENDA,
           * montada a partir do histórico de vendas. Se o movimento
           * técnico do caixa voltar do sync, não o renderizamos de novo.
           */
          if(tipo === 'VENDA_PAGA'){
            return false;
          }

          if(
            saldoMovimentoDuplicaVendaCaixa(
              movimento,
              vendasVisiveis
            )
          ){
            return false;
          }

          const origemMovimento =
            saldoNormalizar(
              movimento &&
              movimento.origem
            );

          const descricaoMovimento =
            saldoNormalizar(
              movimento && (
                movimento.descricao ||
                movimento.observacao ||
                movimento.detalhe ||
                movimento.origemDescricao ||
                ''
              )
            );

          const motivoMovimento =
            saldoNormalizar(
              movimento &&
              movimento.motivo
            );

          if(
            origemMovimento.includes('CREDIARIO') ||
            descricaoMovimento.includes('CREDIARIO') ||
            motivoMovimento.includes('CREDIARIO') ||
            tipo === 'CREDIARIO_RECEBIMENTO'
          ){
            return false;
          }

          if(
            tipo === 'CONTA_PAGAR' ||
            tipo === 'CONTA_RECEBER'
          ){
            return false;
          }

          if(
            saldoFiltroDataMovimentacaoCaixa &&
            saldoChaveDataMovimentoCaixa(
              movimento
            ) !==
              saldoFiltroDataMovimentacaoCaixa
          ){
            return false;
          }

          return true;
        }
      );

    movimentos.sort(function(a,b){
      const da = a && a.criadoEm ? new Date(a.criadoEm).getTime() : 0;
      const db = b && b.criadoEm ? new Date(b.criadoEm).getTime() : 0;
      return db - da;
    });

    host.replaceChildren();

    if(movimentos.length === 0){
      const vazio = financeCreateElement(
        'div',
        'scf-finance-entry-table-empty',
        'NENHUMA MOVIMENTAÇÃO NO PERÍODO'
      );
      host.appendChild(vazio);
      return;
    }

    movimentos.forEach(function(movimento){
      const row = financeCreateElement(
        'div',
        'scf-finance-entry-table-row scf-finance-daily-cash-table-row'
      );

      const data =
        movimento && movimento.criadoEm
          ? new Date(movimento.criadoEm)
          : null;

      const dataValida =
        data && !Number.isNaN(data.getTime())
          ? data
          : null;

      const dataCell = financeCreateElement(
        'span',
        'is-data',
        dataValida
          ? [
              String(dataValida.getDate()).padStart(2,'0'),
              String(dataValida.getMonth() + 1).padStart(2,'0')
            ].join('/')
          : '--/--'
      );

      const horaCell = financeCreateElement(
        'span',
        '',
        dataValida
          ? saldoHorarioMovimento(dataValida.toISOString())
          : '--:--'
      );

      const valorCell = financeCreateElement(
        'span',
        'is-valor',
        saldoValorMovimento(movimento)
      );

      const motivoTexto =
        saldoTipoMovimento(movimento);

      const motivoCell = financeCreateElement(
        'span',
        'is-motivo',
        motivoTexto
      );

      motivoCell.title = motivoTexto;

      const detalheTexto =
        financeDetalheEntrada(movimento);

      const detalheCell = financeCreateElement(
        'span',
        'is-detalhe',
        detalheTexto
      );

      detalheCell.title = detalheTexto;

      const operadorNomeBruto =
        saldoTexto(
          movimento &&
          (
            movimento.operadorNome ||
            movimento.operadorId
          )
        );

      const operadorTexto =
        operadorNomeBruto
          ? operadorNomeBruto.split(':')[0].trim()
          : '—';

      const operadorCell = financeCreateElement(
        'span',
        'is-operador',
        operadorTexto
      );

      operadorCell.title = operadorTexto;

      row.title =
        saldoTexto(movimento && movimento.motivo);

      row.append(
        dataCell,
        horaCell,
        valorCell,
        motivoCell,
        detalheCell,
        operadorCell
      );

      host.appendChild(row);
    });
  }

  function saldoAtualizarRotulosCardsResumo(filtroDataAtivo){
    const entradaValor = el('scfFinanceSaldoEntradasValue');
    const saidaValor = el('scfFinanceSaldoSaidasValue');
    const saldoValor = el('scfFinanceSaldoTotalValue');

    const entradaCard = entradaValor
      ? entradaValor.closest('.scf-finance-saldo-summary-card')
      : null;

    const saidaCard = saidaValor
      ? saidaValor.closest('.scf-finance-saldo-summary-card')
      : null;

    const saldoCard = saldoValor
      ? saldoValor.closest('.scf-finance-saldo-summary-card')
      : null;

    function atualizarCard(card,titulo,subtitulo){
      if(!card) return;

      const tituloNode = card.querySelector('span');
      const subtituloNode = card.querySelector('small');

      if(tituloNode){
        tituloNode.textContent = titulo;
      }

      if(subtituloNode){
        subtituloNode.textContent = subtitulo;
      }
    }

    if(filtroDataAtivo){
      atualizarCard(
        entradaCard,
        'ENTRADAS DO DIA',
        'MOVIMENTAÇÃO DO DIA'
      );

      atualizarCard(
        saidaCard,
        'SAÍDAS DO DIA',
        'MOVIMENTAÇÃO DO DIA'
      );

      atualizarCard(
        saldoCard,
        'SALDO DO DIA',
        'MOVIMENTAÇÃO DO DIA'
      );
      return;
    }

    atualizarCard(
      entradaCard,
      'ENTRADAS HOJE',
      'MOVIMENTAÇÃO DO DIA'
    );

    atualizarCard(
      saidaCard,
      'SAÍDAS HOJE',
      'MOVIMENTAÇÃO DO DIA'
    );

    atualizarCard(
      saldoCard,
      'SALDO DISPONÍVEL',
      'POSIÇÃO CONSOLIDADA AGORA'
    );
  }

  function saldoResumoCardsDataSelecionada(){
    const dataSelecionada =
      saldoFiltroDataMovimentacaoCaixa;

    if(!dataSelecionada){
      return null;
    }

    const movimentosHistoricos =
      Array.isArray(
        saldoDadosMovimentosCaixaHistoricos
      )
        ? saldoDadosMovimentosCaixaHistoricos
        : [];

    const movimentosAtuais =
      Array.isArray(
        saldoDadosMovimentos
      )
        ? saldoDadosMovimentos
        : [];

    const movimentosDoDia =
      saldoRemoverMovimentosDuplicados(
        movimentosHistoricos.concat(
          movimentosAtuais
        )
      ).filter(
        function(movimento){
          const tipo =
            saldoNormalizar(
              movimento && movimento.tipo
            );

          if(
            tipo === 'CONTA_PAGAR' ||
            tipo === 'CONTA_RECEBER'
          ){
            return false;
          }

          return (
            saldoChaveDataMovimentoCaixa(
              movimento
            ) === dataSelecionada
          );
        }
      );

    const vendasDoDia =
      (
        Array.isArray(
          saldoDadosVendas
        )
          ? saldoDadosVendas
          : []
      ).filter(
        function(venda){
          const dataVenda =
            saldoDataVenda(
              venda
            );

          if(!dataVenda){
            return false;
          }

          const chaveVenda = [
            String(
              dataVenda.getDate()
            ).padStart(2,'0'),
            String(
              dataVenda.getMonth() + 1
            ).padStart(2,'0'),
            String(
              dataVenda.getFullYear()
            )
          ].join('/');

          if(
            chaveVenda !==
              dataSelecionada
          ){
            return false;
          }

          return (
            saldoNormalizar(
              venda && venda.fiscalStatus
            ) !== 'CANCELADA'
          );
        }
      );

    const vendas =
      vendasDoDia.reduce(
        function(total,venda){
          return total +
            Math.max(
              0,
              saldoNumero(
                venda && venda.totalValue
              )
            );
        },
        0
      );

    const suprimentos =
      movimentosDoDia.reduce(
        function(total,movimento){
          if(
            saldoNormalizar(
              movimento && movimento.tipo
            ) !== 'SUPRIMENTO'
          ){
            return total;
          }

          return total +
            Math.abs(
              saldoNumero(
                movimento && movimento.valor
              )
            );
        },
        0
      );

    const sangriasDoDia =
      movimentosDoDia.filter(
        function(movimento){
          return (
            saldoNormalizar(
              movimento && movimento.tipo
            ) === 'SANGRIA'
          );
        }
      );

    const idsSangriasDoDia =
      new Set();

    sangriasDoDia.forEach(
      function(movimento){
        const movimentoId =
          financeExitMovementId(
            movimento
          );

        if(movimentoId){
          idsSangriasDoDia.add(
            movimentoId
          );
        }
      }
    );

    const sangriasBrutas =
      sangriasDoDia.reduce(
        function(total,movimento){
          return total +
            Math.abs(
              saldoNumero(
                movimento && movimento.valor
              )
            );
        },
        0
      );

    const estornosProcessados =
      new Set();

    const estornosSangrias =
      movimentosDoDia.reduce(
        function(total,movimento){
          const movimentoOriginalId =
            financeExitReversalOriginalId(
              movimento
            );

          if(
            !movimentoOriginalId ||
            !idsSangriasDoDia.has(
              movimentoOriginalId
            )
          ){
            return total;
          }

          const movimentoEstornoId =
            financeExitMovementId(
              movimento
            );

          if(
            movimentoEstornoId &&
            estornosProcessados.has(
              movimentoEstornoId
            )
          ){
            return total;
          }

          const valorEstorno =
            saldoNumero(
              movimento && movimento.valor
            );

          if(valorEstorno <= 0){
            return total;
          }

          if(movimentoEstornoId){
            estornosProcessados.add(
              movimentoEstornoId
            );
          }

          return total +
            Math.abs(
              valorEstorno
            );
        },
        0
      );

    const entradas =
      vendas +
      suprimentos;

    const saidas =
      Math.max(
        0,
        sangriasBrutas -
          estornosSangrias
      );

    /*
     * DATA ATUAL: usa exatamente a mesma posicao consolidada do caixa aberto
     * exibida no card SALDO DISPONIVEL antes de ativar o calendario.
     * Isso evita recalcular o dia como entradas - saidas e perder o fundo
     * inicial da sessao.
     */
    const agoraResumoDia =
      new Date();

    const chaveHojeResumoDia =
      [
        String(
          agoraResumoDia.getDate()
        ).padStart(2,'0'),
        String(
          agoraResumoDia.getMonth() + 1
        ).padStart(2,'0'),
        String(
          agoraResumoDia.getFullYear()
        )
      ].join('/');

    const consultaCaixaHoje =
      saldoDadosCaixaConsulta;

    const caixaHoje =
      consultaCaixaHoje &&
      consultaCaixaHoje.aberto === true &&
      consultaCaixaHoje.caixa
        ? consultaCaixaHoje.caixa
        : null;

    if(
      dataSelecionada === chaveHojeResumoDia &&
      caixaHoje
    ){
      const resumoCaixaHoje =
        caixaHoje.resumo &&
        typeof caixaHoje.resumo === 'object'
          ? caixaHoje.resumo
          : {};

      const saldoDinheiroHoje =
        saldoNumero(
          resumoCaixaHoje.saldoEsperado != null
            ? resumoCaixaHoje.saldoEsperado
            : caixaHoje.saldoEsperado
        );

      const saldoDisponivelHoje =
        saldoDinheiroHoje +
        saldoNumero(
          resumoCaixaHoje.recebimentosPix
        ) +
        saldoNumero(
          resumoCaixaHoje.recebimentosDebito
        ) +
        saldoNumero(
          resumoCaixaHoje.recebimentosCredito
        );

      return {
        entradas:entradas,
        saidas:saidas,
        saldo:saldoDisponivelHoje
      };
    }

    /*
     * SALDO DO DIA precisa partir do FUNDO INICIAL da sessao de caixa.
     *
     * ENTRADAS DO DIA continua mostrando somente vendas/suprimentos:
     * o fundo inicial nao e uma entrada operacional.
     *
     * Exemplo:
     *   fundo inicial = R$ 100,00
     *   entradas      = R$   0,00
     *   saidas        = R$   3,00
     *   saldo do dia  = R$  97,00
     */
    let saldoInicialDaData = 0;
    let temSaldoInicialDaData = false;
    let encontrouSaldoConsolidado = false;
    let saldoConsolidadoDaData = 0;

    const consultaCaixaAtual =
      saldoDadosCaixaConsulta;

    const caixaAtual =
      consultaCaixaAtual &&
      consultaCaixaAtual.caixa
        ? consultaCaixaAtual.caixa
        : null;

    const resumoCaixaAtual =
      caixaAtual &&
      caixaAtual.resumo &&
      typeof caixaAtual.resumo === 'object'
        ? caixaAtual.resumo
        : {};

    function chaveDataResumo(valor){
      const textoValor =
        saldoTexto(
          valor
        );

      if(
        /^\d{2}\/\d{2}\/\d{4}$/.test(
          textoValor
        )
      ){
        return textoValor;
      }

      const data =
        textoValor
          ? new Date(
              textoValor
            )
          : null;

      if(
        !data ||
        Number.isNaN(
          data.getTime()
        )
      ){
        return '';
      }

      return [
        String(
          data.getDate()
        ).padStart(2,'0'),
        String(
          data.getMonth() + 1
        ).padStart(2,'0'),
        String(
          data.getFullYear()
        )
      ].join('/');
    }

    if(caixaAtual){
      const chaveAbertura =
        chaveDataResumo(
          caixaAtual.abertoEm ||
          resumoCaixaAtual.abertoEm
        );

      if(
        chaveAbertura ===
        dataSelecionada
      ){
        temSaldoInicialDaData =
          true;

        saldoInicialDaData =
          Math.max(
            0,
            saldoNumero(
              resumoCaixaAtual.saldoInicial != null
                ? resumoCaixaAtual.saldoInicial
                : caixaAtual.saldoInicial
            )
          );
      }
    }

    /*
     * HISTÓRICO DE CAIXA:
     * o backend agora devolve, em cada movimento histórico, os dados públicos
     * da caixaSessao correspondente. Assim o calendário consegue recuperar o
     * FUNDO INICIAL mesmo para caixas já fechados.
     *
     * Uma sessão é contada somente uma vez, ainda que possua várias linhas.
     */
    const sessoesHistoricasDaData =
      new Map();

    movimentosHistoricos.forEach(
      function(movimento){
        if(
          saldoChaveDataMovimentoCaixa(
            movimento
          ) !== dataSelecionada
        ){
          return;
        }

        const sessaoId =
          saldoTexto(
            movimento &&
            movimento.caixaSessaoId
          );

        if(
          !sessaoId ||
          sessoesHistoricasDaData.has(
            sessaoId
          )
        ){
          return;
        }

        const saldoInicialBruto =
          movimento &&
          movimento.caixaSaldoInicial;

        const saldoFinalBruto =
          movimento &&
          movimento.caixaSaldoDisponivelFinanceiro;

        sessoesHistoricasDaData.set(
          sessaoId,
          {
            saldoInicial:
              saldoInicialBruto == null ||
              saldoInicialBruto === ''
                ? null
                : Math.max(
                    0,
                    saldoNumero(
                      saldoInicialBruto
                    )
                  ),

            saldoDisponivelFinanceiro:
              saldoFinalBruto == null ||
              saldoFinalBruto === ''
                ? null
                : saldoNumero(
                    saldoFinalBruto
                  ),

            status:
              saldoNormalizar(
                movimento &&
                movimento.caixaStatus
              )
          }
        );
      }
    );

    if(
      temSaldoInicialDaData !== true &&
      sessoesHistoricasDaData.size > 0
    ){
      const sessoesComSaldoInicial =
        Array.from(
          sessoesHistoricasDaData.values()
        ).filter(
          function(sessao){
            return (
              sessao &&
              sessao.saldoInicial != null
            );
          }
        );

      if(sessoesComSaldoInicial.length > 0){
        saldoInicialDaData =
          sessoesComSaldoInicial.reduce(
            function(total,sessao){
              return total +
                saldoNumero(
                  sessao.saldoInicial
                );
            },
            0
          );

        temSaldoInicialDaData =
          true;
      }

      /*
       * Caixa fechado: saldoDisponivelFinanceiro foi gravado no fechamento
       * usando a mesma regra oficial do caixa (dinheiro + PIX + débito +
       * crédito). Se todas as sessões da data possuírem esse valor, ele é a
       * referência mais fiel para o SALDO DO DIA.
       */
      const sessoesDaData =
        Array.from(
          sessoesHistoricasDaData.values()
        );

      const todasFechadasComSaldoFinal =
        sessoesDaData.length > 0 &&
        sessoesDaData.every(
          function(sessao){
            return (
              sessao &&
              sessao.status === 'FECHADO' &&
              sessao.saldoDisponivelFinanceiro != null
            );
          }
        );

      if(todasFechadasComSaldoFinal){
        saldoConsolidadoDaData =
          sessoesDaData.reduce(
            function(total,sessao){
              return total +
                saldoNumero(
                  sessao.saldoDisponivelFinanceiro
                );
            },
            0
          );

        encontrouSaldoConsolidado =
          true;
      }
    }

    /*
     * Para datas recentes que ja possuam saldo consolidado no historico
     * de evolucao, ele e a referencia mais fiel da posicao daquele dia.
     * O caixa aberto da data atual continua usando fundo inicial +
     * movimentacoes para refletir imediatamente os lancamentos em tela.
     */
    if(
      encontrouSaldoConsolidado !== true &&
      temSaldoInicialDaData !== true &&
      Array.isArray(
        saldoDadosEvolucao7Dias
      )
    ){
      const pontoSaldo =
        saldoDadosEvolucao7Dias.find(
          function(ponto){
            if(
              !ponto ||
              ponto.temDados !== true
            ){
              return false;
            }

            const chavePonto =
              chaveDataResumo(
                ponto.data ||
                ponto.dataFormatada
              );

            return (
              chavePonto ===
              dataSelecionada
            );
          }
        );

      if(pontoSaldo){
        saldoConsolidadoDaData =
          saldoNumero(
            pontoSaldo.saldoDisponivel
          );

        encontrouSaldoConsolidado =
          true;
      }
    }

    return {
      entradas:entradas,
      saidas:saidas,
      saldo:
        encontrouSaldoConsolidado
          ? saldoConsolidadoDaData
          : (
              saldoInicialDaData +
              entradas -
              saidas
            )
    };
  }

  function renderizarSaldoEsquerdo(){
    if(saldoFiltroDataMovimentacaoCaixa){
      const resumoData =
        saldoResumoCardsDataSelecionada();

      saldoAtualizarRotulosCardsResumo(
        true
      );

      saldoSetText(
        'scfFinanceSaldoEntradasValue',
        saldoMoeda(
          resumoData
            ? resumoData.entradas
            : 0
        )
      );

      saldoSetText(
        'scfFinanceSaldoSaidasValue',
        saldoMoeda(
          resumoData
            ? resumoData.saidas
            : 0
        )
      );

      saldoSetText(
        'scfFinanceSaldoTotalValue',
        saldoMoeda(
          resumoData
            ? resumoData.saldo
            : 0
        )
      );

      return;
    }

    saldoAtualizarRotulosCardsResumo(
      false
    );
    const consulta = saldoDadosCaixaConsulta;
    const caixa = consulta && consulta.aberto === true && consulta.caixa
      ? consulta.caixa
      : null;

    const resumo = caixa && caixa.resumo
      ? caixa.resumo
      : {};

    const dinheiro = saldoNumero(
      resumo.saldoEsperado != null
        ? resumo.saldoEsperado
        : caixa && caixa.saldoEsperado
    );

    const pix = saldoNumero(resumo.recebimentosPix);
    const debito = saldoNumero(resumo.recebimentosDebito);
    const credito = saldoNumero(resumo.recebimentosCredito);
    const vendasDinheiro = saldoNumero(resumo.vendasDinheiro);
    const suprimentos = saldoNumero(resumo.suprimentos);

    /*
     * SAÍDAS HOJE / MOVIMENTAÇÃO DO CAIXA
     *
     * resumo.sangrias representa o total bruto das SANGRIAS da sessão.
     * Quando uma saída originada de SANGRIA é anulada pelo FINANCEIRO,
     * o backend preserva a SANGRIA original e registra um AJUSTE positivo
     * com o marcador SCF_FINANCEIRO_ESTORNO_SAIDA|<id-original>.
     *
     * Para o card SAÍDAS HOJE não continuar exibindo uma retirada que já
     * voltou ao caixa, descontamos somente os estornos vinculados a uma
     * SANGRIA existente nesta mesma sessão. CONTAS A PAGAR/PAGO não entram
     * neste cálculo e outros AJUSTES positivos também não são descontados.
     */
    const sangriasBrutas =
      Math.max(
        0,
        saldoNumero(
          resumo.sangrias
        )
      );

    const movimentosCaixaSaidas =
      Array.isArray(
        saldoDadosMovimentos
      )
        ? saldoDadosMovimentos.filter(
            function(movimento){
              return saldoNormalizar(
                movimento && movimento.tipo
              ) !== 'CONTA_PAGAR';
            }
          )
        : [];

    const idsSangriasDaSessao =
      new Set();

    movimentosCaixaSaidas.forEach(
      function(movimento){
        if(
          saldoNormalizar(
            movimento && movimento.tipo
          ) !== 'SANGRIA'
        ){
          return;
        }

        const movimentoId =
          financeExitMovementId(
            movimento
          );

        if(movimentoId){
          idsSangriasDaSessao.add(
            movimentoId
          );
        }
      }
    );

    const estornosSangriasProcessados =
      new Set();

    const estornosSangrias =
      movimentosCaixaSaidas.reduce(
        function(total,movimento){
          const movimentoOriginalId =
            financeExitReversalOriginalId(
              movimento
            );

          if(
            !movimentoOriginalId ||
            !idsSangriasDaSessao.has(
              movimentoOriginalId
            )
          ){
            return total;
          }

          const movimentoEstornoId =
            financeExitMovementId(
              movimento
            );

          if(
            movimentoEstornoId &&
            estornosSangriasProcessados.has(
              movimentoEstornoId
            )
          ){
            return total;
          }

          const valorEstorno =
            saldoNumero(
              movimento && movimento.valor
            );

          if(valorEstorno <= 0){
            return total;
          }

          if(movimentoEstornoId){
            estornosSangriasProcessados.add(
              movimentoEstornoId
            );
          }

          return total +
            Math.abs(
              valorEstorno
            );
        },
        0
      );

    const sangrias =
      Math.max(
        0,
        sangriasBrutas -
          estornosSangrias
      );

    const saldoDisponivel =
      dinheiro +
      pix +
      debito +
      credito;

    const entradas =
      vendasDinheiro +
      pix +
      debito +
      credito +
      suprimentos;

    saldoSetText('scfFinanceSaldoTotalValue',saldoMoeda(saldoDisponivel));
    saldoSetText('scfFinanceSaldoCashValue',saldoMoeda(dinheiro));
    saldoSetText('scfFinanceSaldoPixValue',saldoMoeda(pix));
    saldoSetText('scfFinanceSaldoDebitoValue',saldoMoeda(debito));
    saldoSetText('scfFinanceSaldoCreditoValue',saldoMoeda(credito));
    saldoSetText('scfFinanceSaldoEntradasValue',saldoMoeda(entradas));
    saldoSetText('scfFinanceSaldoSaidasValue',saldoMoeda(sangrias));
  }

  function renderizarSaldoEvolucaoDireito(){
    const chart = el('scfFinanceSaldoRightChart');
    if(!chart) return;

    const itens = Array.from(
      chart.querySelectorAll('[data-scf-fin-saldo-dia]')
    );

    const pontos = Array.isArray(saldoDadosEvolucao7Dias)
      ? saldoDadosEvolucao7Dias.slice(0,7)
      : [];

    const valoresComDados = pontos
      .filter(function(ponto){
        return ponto && ponto.temDados === true;
      })
      .map(function(ponto){
        return Math.abs(
          saldoNumero(ponto.saldoDisponivel)
        );
      });

    const maiorValor = valoresComDados.length
      ? Math.max.apply(null,valoresComDados)
      : 0;

    itens.forEach(function(item,indice){
      const ponto = pontos[indice] || null;
      const barra = item.querySelector('i');
      const legenda = item.querySelector('span');

      const temDados = Boolean(
        ponto && ponto.temDados === true
      );

      const valor = temDados
        ? saldoNumero(ponto.saldoDisponivel)
        : 0;

      const altura = temDados
        ? (
            maiorValor > 0
              ? Math.max(
                  8,
                  Math.min(
                    100,
                    Math.abs(valor) /
                      maiorValor * 100
                  )
                )
              : 8
          )
        : 3;

      if(barra){
        barra.style.height = altura.toFixed(2) + '%';
        barra.style.opacity = temDados ? '1' : '.22';
      }

      if(legenda){
        legenda.textContent =
          saldoTexto(ponto && ponto.rotuloSemana) ||
          '—';
      }

      const dataFormatada =
        saldoTexto(ponto && ponto.dataFormatada) ||
        saldoTexto(ponto && ponto.data) ||
        '—';

      const descricao = temDados
        ? dataFormatada + ' — ' + saldoMoeda(valor)
        : dataFormatada + ' — sem saldo apurado nesta sessão';

      item.title = descricao;
      item.setAttribute('aria-label',descricao);
    });
  }

  function saldoDataVencimentoContaPagar(valor){
    const texto = saldoTexto(valor);
    if(!texto) return null;

    let match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
    let dia;
    let mes;
    let ano;

    if(match){
      dia = Number(match[1]);
      mes = Number(match[2]);
      ano = Number(match[3]);
    }else{
      match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(texto);
      if(match){
        ano = Number(match[1]);
        mes = Number(match[2]);
        dia = Number(match[3]);
      }
    }

    if(
      Number.isInteger(dia) &&
      Number.isInteger(mes) &&
      Number.isInteger(ano)
    ){
      const data = new Date(ano,mes - 1,dia,12,0,0,0);
      if(
        data.getFullYear() === ano &&
        data.getMonth() === mes - 1 &&
        data.getDate() === dia
      ){
        return data;
      }
      return null;
    }

    const data = new Date(texto);
    return data && !Number.isNaN(data.getTime()) ? data : null;
  }

  function saldoInicioDia(data){
    const base = data instanceof Date ? data : new Date();
    return new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate(),
      0,0,0,0
    );
  }

  function saldoContasPagarAbertas(){
    return (Array.isArray(saldoDadosMovimentos) ? saldoDadosMovimentos : [])
      .filter(function(movimento){
        return (
          saldoNormalizar(movimento && movimento.tipo) === 'CONTA_PAGAR' &&
          movimento && movimento.pago !== true &&
          movimento.cancelado !== true
        );
      });
  }

  function saldoNomeParteContaPagar(conta){
    return (
      saldoTexto(
        conta && (
          conta.fornecedorNome ||
          conta.nomeFornecedor ||
          conta.clienteNome ||
          conta.descricao
        )
      ) ||
      saldoTexto(conta && conta.motivo) ||
      '—'
    ).toLocaleUpperCase('pt-BR');
  }

  function saldoFormatarVencimentoCurto(data){
    if(!(data instanceof Date) || Number.isNaN(data.getTime())){
      return '--/--';
    }

    return [
      String(data.getDate()).padStart(2,'0'),
      String(data.getMonth() + 1).padStart(2,'0')
    ].join('/');
  }

  function renderizarSaldoDireito(){
    const conta =
      saldoDadosContaFinanceira &&
      typeof saldoDadosContaFinanceira === 'object'
        ? saldoDadosContaFinanceira
        : {};

    const movimentos =
      Array.isArray(
        conta.movimentos
      )
        ? conta.movimentos
        : [];

    saldoSetText(
      'scfFinanceAccountBalanceValue',
      saldoMoeda(
        conta.saldo
      )
    );

    saldoSetText(
      'scfFinanceAccountEntriesTotal',
      saldoMoeda(
        conta.totalEntradas
      )
    );

    saldoSetText(
      'scfFinanceAccountExitsTotal',
      saldoMoeda(
        conta.totalSaidas
      )
    );

    const quantidade =
      Math.max(
        0,
        Math.trunc(
          saldoNumero(
            conta.quantidade
          )
        )
      );

    saldoSetText(
      'scfFinanceAccountMovementCount',
      quantidade === 1
        ? '1 LANÇAMENTO'
        : String(quantidade) + ' LANÇAMENTOS'
    );

    const meta =
      el(
        'scfFinanceAccountBalanceMeta'
      );

    if(meta){
      if(conta.success === false){
        meta.textContent =
          'NÃO FOI POSSÍVEL ATUALIZAR A CONTA';
      }else if(quantidade === 0){
        meta.textContent =
          'AGUARDANDO O PRIMEIRO LANÇAMENTO';
      }else{
        meta.textContent =
          'POSIÇÃO ATUALIZADA PELO LIVRO FINANCEIRO';
      }
    }

    const host =
      el(
        'scfFinanceAccountMovements'
      );

    if(!host){
      return;
    }

    host.replaceChildren();

    if(
      movimentos.length === 0
    ){
      const vazio =
        document.createElement(
          'div'
        );

      vazio.className =
        'scf-fin-bank-empty';

      const titulo =
        document.createElement(
          'strong'
        );

      titulo.textContent =
        conta.success === false
          ? 'CONTA FINANCEIRA INDISPONÍVEL'
          : 'NENHUMA MOVIMENTAÇÃO AINDA';

      const detalhe =
        document.createElement(
          'span'
        );

      detalhe.textContent =
        conta.success === false
          ? (
              saldoTexto(
                conta.message
              ) ||
              'TENTE NOVAMENTE EM INSTANTES.'
            )
          : 'O PRÓXIMO FECHAMENTO DE CAIXA GERARÁ UMA ENTRADA NESTA CONTA.';

      vazio.append(
        titulo,
        detalhe
      );

      host.appendChild(
        vazio
      );

      return;
    }

    movimentos
      .slice(
        0,
        10
      )
      .forEach(
        function(movimento){
          const tipo =
            saldoNormalizar(
              movimento &&
              movimento.tipo
            ) === 'SAIDA'
              ? 'SAIDA'
              : 'ENTRADA';

          const positivo =
            tipo ===
              'ENTRADA';

          const dataHora =
            saldoContaFinanceiraDataHora(
              movimento &&
              movimento.ocorridoEm
            );

          const row =
            document.createElement(
              'div'
            );

          row.className =
            'scf-fin-bank-row ' +
            (
              positivo
                ? 'is-entry'
                : 'is-exit'
            );

          const sinal =
            document.createElement(
              'span'
            );

          sinal.className =
            'scf-fin-bank-row-signal';

          sinal.textContent =
            positivo
              ? '+'
              : '−';

          const corpo =
            document.createElement(
              'div'
            );

          corpo.className =
            'scf-fin-bank-row-body';

          const descricao =
            document.createElement(
              'strong'
            );

          descricao.textContent =
            saldoContaFinanceiraDescricao(
              movimento
            );

          descricao.title =
            descricao.textContent;

          const detalhe =
            document.createElement(
              'span'
            );

          detalhe.textContent =
            [
              dataHora.data,
              dataHora.hora
            ].join(' • ');

          corpo.append(
            descricao,
            detalhe
          );

          const valor =
            document.createElement(
              'strong'
            );

          valor.className =
            'scf-fin-bank-row-value';

          valor.textContent =
            (
              positivo
                ? '+ '
                : '− '
            ) +
            saldoMoeda(
              Math.abs(
                saldoNumero(
                  movimento &&
                  movimento.valor
                )
              )
            );

          row.append(
            sinal,
            corpo,
            valor
          );

          host.appendChild(
            row
          );
        }
      );
  }

  function renderizarDadosSaldoFinanceiro(){
    if(!document.body.classList.contains('scf-financeiro-saldo-open')) return;
    renderizarSaldoEsquerdo();
    renderizarSaldoMovimentos();
    renderizarSaldoDireito();
  }

  function solicitarDadosSaldoFinanceiro(offset,reiniciar,silencioso){
    if(
      !document.body.classList.contains(
        'scf-financeiro-registration-open'
      ) &&
      saldoPrecarregamentoAtivo !==
        true
    ){
      return false;
    }

    if(saldoDadosCarregando) return false;

    if(reiniciar === true){
      saldoDadosRequestId = [
        'financeiro-saldo',
        Date.now(),
        Math.random().toString(36).slice(2,8)
      ].join('-');

      /*
       * Nunca apaga a fotografia já exibível antes da nova consulta terminar.
       * A resposta nova é montada nestes buffers e promovida de uma vez no fim.
       */
      saldoAtualizacaoSilenciosa =
        silencioso === true &&
        saldoCachePronto === true;

      saldoAtualizacaoVendas = [];
      saldoAtualizacaoCaixaConsulta = null;
      saldoAtualizacaoMovimentos = [];
      saldoAtualizacaoMovimentosCaixaHistoricos = [];
      saldoAtualizacaoEvolucao7Dias = [];
      saldoAtualizacaoContaFinanceira = null;
    }

    if(!saldoDadosRequestId){
      return false;
    }

    saldoDadosCarregando = true;

    window.__scfPdvInfra.shellBridge.post({
      type:'SCF_FINANCEIRO_SALDO_DADOS_SOLICITAR',
      requestId:saldoDadosRequestId,
      offset:Math.max(0,Math.trunc(saldoNumero(offset))),
      limit:50,
      timezoneOffsetMinutes:new Date().getTimezoneOffset()
    },'*');

    return true;
  }

  function tratarResultadoDadosSaldo(data){
    if(
      (
        !document.body.classList.contains(
          'scf-financeiro-registration-open'
        ) &&
        saldoPrecarregamentoAtivo !==
          true
      ) ||
      saldoTexto(data && data.requestId) !== saldoDadosRequestId
    ){
      return;
    }

    saldoDadosCarregando = false;

    const incoming = data && Array.isArray(data.vendas)
      ? data.vendas
      : [];

    const offsetRecebido = Math.max(
      0,
      Math.trunc(saldoNumero(data && data.offset))
    );

    if(offsetRecebido === 0){
      saldoAtualizacaoVendas = incoming.slice();
      saldoAtualizacaoCaixaConsulta =
        data && data.caixaConsulta
          ? data.caixaConsulta
          : null;

      const movimentosCaixaRecebidos =
        data && Array.isArray(data.movimentosCaixa)
          ? data.movimentosCaixa
          : (
              data &&
              data.caixaConsulta &&
              data.caixaConsulta.caixa &&
              data.caixaConsulta.caixa.resumo &&
              Array.isArray(data.caixaConsulta.caixa.resumo.movimentos)
                ? data.caixaConsulta.caixa.resumo.movimentos
                : []
            );

      const movimentosCaixaHistoricosRecebidos =
        data && Array.isArray(data.movimentosCaixaHistoricoFinanceiro)
          ? data.movimentosCaixaHistoricoFinanceiro
          : [];

      saldoAtualizacaoMovimentosCaixaHistoricos =
        saldoRemoverMovimentosDuplicados(
          movimentosCaixaHistoricosRecebidos
        );

      const contasPagarRecebidas =
        data && Array.isArray(data.contasPagarFinanceiro)
          ? data.contasPagarFinanceiro
          : [];

      const contasReceberRecebidas =
        data && Array.isArray(data.contasReceberFinanceiro)
          ? data.contasReceberFinanceiro
          : [];

      const movimentosRecebidos =
        movimentosCaixaRecebidos.concat(
          contasPagarRecebidas,
          contasReceberRecebidas
        );

      /*
       * Não deixa uma consulta de backend momentaneamente desatualizada
       * apagar uma sangria que acabou de ser confirmada no caixa.
       */
      saldoAtualizacaoMovimentos =
        saldoMesclarMovimentosComLocais(
          movimentosRecebidos
        );

      const evolucaoRecebida =
        data && data.evolucaoSaldo7Dias &&
        Array.isArray(data.evolucaoSaldo7Dias.pontos)
          ? data.evolucaoSaldo7Dias.pontos
          : [];

      saldoAtualizacaoEvolucao7Dias = evolucaoRecebida.slice(0,7);

      saldoAtualizacaoContaFinanceira =
        data &&
        data.contaFinanceira &&
        typeof data.contaFinanceira === 'object'
          ? {
              ...data.contaFinanceira,
              movimentos:
                Array.isArray(
                  data.contaFinanceira.movimentos
                )
                  ? data.contaFinanceira.movimentos.slice(0,20)
                  : []
            }
          : {
              success:true,
              saldo:0,
              totalEntradas:0,
              totalSaidas:0,
              quantidade:0,
              resumoMensal:{},
              movimentos:[]
            };
    }else{
      saldoAtualizacaoVendas =
        saldoAtualizacaoVendas.concat(incoming);
    }

    saldoAtualizacaoVendas =
      saldoRemoverDuplicadas(saldoAtualizacaoVendas);

    if(data && data.hasMore === true && incoming.length > 0){
      let proximoOffset = Math.trunc(saldoNumero(data.nextOffset));
      if(proximoOffset <= offsetRecebido){
        proximoOffset = offsetRecebido + incoming.length;
      }

      solicitarDadosSaldoFinanceiro(proximoOffset,false,saldoAtualizacaoSilenciosa);
      return;
    }

    /*
     * Troca atômica: só agora, com a consulta completa, a nova fotografia
     * substitui o cache que estava sendo exibido ao operador.
     */
    saldoDadosVendas = saldoAtualizacaoVendas.slice();
    saldoDadosVendasComoMovimentos =
      saldoVendasComoMovimentosCaixa(
        saldoDadosVendas
      );
    saldoDadosCaixaConsulta = saldoAtualizacaoCaixaConsulta;

    financeDomain.cashSnapshot =
      saldoDadosCaixaConsulta &&
      typeof saldoDadosCaixaConsulta === 'object'
        ? saldoDadosCaixaConsulta
        : null;

    saldoDadosMovimentos =
      saldoMesclarMovimentosComLocais(
        saldoAtualizacaoMovimentos
      );
    saldoDadosMovimentosCaixaHistoricos =
      saldoRemoverMovimentosDuplicados(
        saldoAtualizacaoMovimentosCaixaHistoricos
      );
    saldoDadosEvolucao7Dias = saldoAtualizacaoEvolucao7Dias.slice(0,7);

    saldoDadosContaFinanceira =
      saldoAtualizacaoContaFinanceira &&
      typeof saldoAtualizacaoContaFinanceira === 'object'
        ? {
            ...saldoAtualizacaoContaFinanceira,
            movimentos:
              Array.isArray(
                saldoAtualizacaoContaFinanceira.movimentos
              )
                ? saldoAtualizacaoContaFinanceira.movimentos.slice(0,20)
                : []
          }
        : saldoDadosContaFinanceira;

    financeContaExtratoAtualizarAssinatura(
      saldoDadosContaFinanceira
    );

    saldoAtualizacaoVendas = [];
    saldoAtualizacaoCaixaConsulta = null;
    saldoAtualizacaoMovimentos = [];
    saldoAtualizacaoMovimentosCaixaHistoricos = [];
    saldoAtualizacaoEvolucao7Dias = [];
    saldoAtualizacaoContaFinanceira = null;
    saldoAtualizacaoSilenciosa = false;
    saldoCachePronto = true;
    saldoPrecarregamentoAtivo = false;

    renderizarDadosSaldoFinanceiro();

    if(document.body.classList.contains('scf-financeiro-saida-open')){
      if(financeExitSelectedMonth === null){
        renderizarPastasSaidaFinanceiro();
      }else{
        renderizarTabelaSaidaFinanceiro(financeExitSelectedMonth);
      }
    }

    if(document.body.classList.contains('scf-financeiro-entrada-open')){
      if(financeEntrySelectedMonth === null){
        renderizarPastasEntradaFinanceiro();
      }else{
        renderizarTabelaEntradaFinanceiro(
          financeEntrySelectedMonth
        );
      }
    }
  }

  function tratarErroDadosSaldo(data){
    if(
      saldoTexto(data && data.requestId) !== saldoDadosRequestId
    ){
      return;
    }

    saldoDadosCarregando = false;
    saldoPrecarregamentoAtivo = false;

    /*
     * Se a conferência silenciosa falhar, preserva integralmente o último
     * cache completo. Assim uma falha momentânea nunca esvazia o Financeiro.
     */
    saldoAtualizacaoSilenciosa = false;
    saldoAtualizacaoVendas = [];
    saldoAtualizacaoCaixaConsulta = null;
    saldoAtualizacaoMovimentos = [];
    saldoAtualizacaoMovimentosCaixaHistoricos = [];
    saldoAtualizacaoEvolucao7Dias = [];
    saldoAtualizacaoContaFinanceira = null;

    if(saldoCachePronto === true){
      renderizarDadosSaldoFinanceiro();
    }

    console.warn(
      'FINANCEIRO SALDO — dados não carregados:',
      data && (data.message || data.mensagem) || 'erro desconhecido'
    );
  }

  function mostrarDashboardSaldoDireito(){
    const frame = document.querySelector(
      '#fiscalDesktopProductPhoto .fiscal-desktop-product-photo-frame'
    );
    if(!frame) return false;

    let form = el('scfFinanceForm');
    if(!form){
      form = document.createElement('div');
      form.id = 'scfFinanceForm';
      frame.appendChild(form);
    }else if(form.parentElement !== frame){
      frame.appendChild(form);
    }

    form.classList.add('scf-finance-dashboard-v3');

    /*
     * Não reconstrói o HTML a cada reforço/reentrada se o painel já existe.
     * Isso evita zerar visualmente os valores do cache durante a transição.
     */
    if(
      !form.querySelector('#scfFinanceSaldoRightDashboard') ||
      !form.querySelector('#scfFinanceAccountBalanceValue')
    ){
      form.innerHTML = financeSaldoRightMarkup();
    }

    form.hidden = false;
    form.setAttribute('aria-hidden','false');
    form.style.setProperty('display','flex','important');
    form.style.setProperty('visibility','visible','important');
    form.style.setProperty('opacity','1','important');
    form.style.setProperty('pointer-events','auto','important');

    return true;
  }

  function garantirEstrutura(){
    const painel = el('fiscalProductsView');
    const frame = document.querySelector(
      '#fiscalDesktopProductPhoto .fiscal-desktop-product-photo-frame'
    );

    if(!painel || !frame) return false;

    let overlay = el('scfFinanceRegistrationOverlay');
    if(!overlay){
      overlay = document.createElement('div');
      overlay.id = 'scfFinanceRegistrationOverlay';
      overlay.setAttribute('aria-hidden','true');
      overlay.innerHTML = ''
        + '<section class="scf-finance-card" role="dialog" aria-modal="true" aria-labelledby="scfFinanceRegistrationTitle">'
        +   '<header class="scf-finance-header">'
        +     '<div id="scfFinanceExitStatusTotals" aria-label="Totais das saídas por situação" hidden>'
        +       '<button type="button" class="scf-finance-exit-status-total is-pending" data-scf-finance-exit-filter="A_PAGAR" aria-pressed="false" title="Mostrar somente saídas A PAGAR"><span>A PAGAR</span><strong id="scfFinanceExitTotalPending">R$ 0,00</strong></button>'
        +       '<button type="button" class="scf-finance-exit-status-total is-paid" data-scf-finance-exit-filter="PAGO" aria-pressed="false" title="Mostrar somente saídas PAGAS"><span>PAGO</span><strong id="scfFinanceExitTotalPaid">R$ 0,00</strong></button>'
        +       '<button type="button" class="scf-finance-exit-status-total is-total" data-scf-finance-exit-filter="ALL" aria-pressed="true" title="Mostrar todas as saídas"><span>TOTAL</span><strong id="scfFinanceExitTotalOverall">R$ 0,00</strong></button>'
        +     '</div>'
        +     '<div id="scfFinanceEntryStatusTotals" aria-label="Totais das entradas" hidden>'
        +       '<button type="button" class="scf-finance-entry-status-total is-receipts" data-scf-finance-entry-filter="A_RECEBER" aria-pressed="false" title="Mostrar somente valores a receber"><span>A RECEBER</span><strong id="scfFinanceEntryTotalReceipts">R$ 0,00</strong></button>'
        +       '<button type="button" class="scf-finance-entry-status-total is-others" data-scf-finance-entry-filter="RECEBIDO" aria-pressed="false" title="Mostrar somente valores recebidos"><span>RECEBIDO</span><strong id="scfFinanceEntryTotalOthers">R$ 0,00</strong></button>'
        +       '<button type="button" class="scf-finance-entry-status-total is-total" data-scf-finance-entry-filter="ALL" aria-pressed="true" title="Mostrar todas as entradas"><span>TOTAL</span><strong id="scfFinanceEntryTotalOverall">R$ 0,00</strong></button>'
        +     '</div>'
        +     '<button class="scf-sales-history-back scf-finance-exit-back" id="scfFinanceExitBack" type="button" aria-label="Voltar para Financeiro" aria-hidden="true" hidden>'
        +       '<img class="scf-sales-history-back-icon" alt="" aria-hidden="true" src="' + backSrc() + '">'
        +     '</button>'
        +     '<h2 id="scfFinanceRegistrationTitle">FINANCEIRO</h2>'
        +     '<div id="scfFinanceMainYearBar" class="scf-sales-history-year-bar">'
        +       '<button id="scfFinanceMainCalendarButton" class="scf-sales-history-export scf-finance-main-calendar-button" type="button" aria-label="Calendário" title="Calendário">'
        +         '<img class="scf-sales-history-export-icon scf-finance-main-calendar-icon" alt="" aria-hidden="true" src="data:image/png;base64,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">'
        +       '</button>'
        +       '<label class="scf-sales-history-year-label" for="scfFinanceMainYearSelect">'
        +         '<select id="scfFinanceMainYearSelect" class="scf-sales-history-year-select" aria-label="Ano do financeiro" aria-disabled="true" disabled tabindex="-1">'
        +           '<option value="' + String(new Date().getFullYear()) + '" selected>' + String(new Date().getFullYear()) + '</option>'
        +         '</select>'
        +       '</label>'
        +     '</div>'
        +     '<button id="scfFinanceRegistrationClose" type="button" aria-label="Fechar financeiro">'
        +       '<img alt="Fechar" src="' + closeSrc() + '">'
        +     '</button>'
        +   '</header>'
        +   '<div id="scfFinanceRegistrationContent">'
        +     '<div id="scfFinanceRegistrationList">'
        +       '<div id="scfFinanceEntryView" class="scf-sales-history-list" hidden aria-hidden="true" aria-label="Pastas de entradas financeiras por mês"></div>'
        +       '<div id="scfFinanceExitView" class="scf-sales-history-list" hidden aria-hidden="true" aria-label="Pastas de saídas financeiras por mês"></div>'
        +       '<div id="scfFinanceSaldoView" hidden aria-hidden="true" aria-label="Detalhamento do saldo">'
        +         '<div class="scf-finance-saldo-summary-grid" aria-label="Resumo financeiro do dia">'
        +           '<div class="scf-finance-saldo-summary-card is-entrada"><span>ENTRADAS HOJE</span><strong id="scfFinanceSaldoEntradasValue">R$ 0,00</strong><small>MOVIMENTAÇÃO DO DIA</small></div>'
        +           '<div class="scf-finance-saldo-summary-card is-saida"><span>SAÍDAS HOJE</span><strong id="scfFinanceSaldoSaidasValue">R$ 0,00</strong><small>MOVIMENTAÇÃO DO DIA</small></div>'
        +           '<div class="scf-finance-saldo-summary-card is-saldo"><span>SALDO DISPONÍVEL</span><strong id="scfFinanceSaldoTotalValue">R$ 0,00</strong><small>POSIÇÃO CONSOLIDADA AGORA</small></div>'
        +         '</div>'
        +         '<div class="scf-finance-saldo-extrato scf-finance-daily-cash-table">'
        +           '<div class="scf-finance-entry-table-header scf-finance-daily-cash-table-header"><span>DATA</span><span>HORA</span><span>VALOR</span><span>MOTIVO</span><span>ORIGEM / DESCRIÇÃO</span><span>OPERADOR</span></div>'
        +           '<div class="scf-finance-entry-table-body scf-finance-daily-cash-table-body" id="scfFinanceSaldoExtratoRows"><div class="scf-finance-entry-table-empty">NENHUMA MOVIMENTAÇÃO NO PERÍODO</div></div>'
        +         '</div>'
        +       '</div>'
        +     '</div>'
        +   '</div>'
        +   '<footer class="scf-sales-history-footer" id="scfFinanceExitFooter" aria-hidden="true">'
        +     '<button class="scf-sales-history-more" type="button" hidden tabindex="-1" aria-hidden="true">CARREGAR MAIS</button>'
        +   '</footer>'
        + '</section>';
      painel.appendChild(overlay);
    }else if(overlay.parentElement !== painel){
      painel.appendChild(overlay);
    }

    let form = el('scfFinanceForm');
    if(!form){
      form = document.createElement('div');
      form.id = 'scfFinanceForm';
      form.classList.add('scf-finance-dashboard-v3');
      form.innerHTML = financeSaldoRightMarkup();
      frame.appendChild(form);
    }else if(form.parentElement !== frame){
      frame.appendChild(form);
    }

    const close = el('scfFinanceRegistrationClose');
    if(close && close.dataset.scfEventos !== '1'){
      close.dataset.scfEventos = '1';
      close.addEventListener('click', function(){
        fecharFinanceiro(true);
      });
    }

    const entrada = el('scfFinanceEntryButton');
    if(entrada && entrada.dataset.scfEventos !== '1'){
      entrada.dataset.scfEventos = '1';
      entrada.addEventListener('click', function(){
        /*
         * Se o calendário da página FINANCEIRO estiver aberto,
         * ENTRADA executa antes o mesmo estado visual do segundo clique:
         * fecha o calendário, restaura ÚLTIMAS MOVIMENTAÇÕES e
         * devolve o botão do calendário ao estado normal.
         */
        document.body.classList.remove(
          'scf-financeiro-movimentacoes-ocultas'
        );

        const botaoCalendario =
          el('scfFinanceMainCalendarButton');

        if(botaoCalendario){
          botaoCalendario.setAttribute(
            'aria-pressed',
            'false'
          );
        }

        abrirPaginaEntradaFinanceiro();
      });
    }

    const saida = el('scfFinanceExitButton');
    if(saida && saida.dataset.scfEventos !== '1'){
      saida.dataset.scfEventos = '1';
      saida.addEventListener('click', function(){
        /*
         * Mesmo comportamento de ENTRADA: nunca entra em FINANCEIRO - SAÍDA
         * deixando o calendário principal/estado de movimentações ocultas ativo.
         */
        document.body.classList.remove(
          'scf-financeiro-movimentacoes-ocultas'
        );

        const botaoCalendario =
          el('scfFinanceMainCalendarButton');

        if(botaoCalendario){
          botaoCalendario.setAttribute(
            'aria-pressed',
            'false'
          );
        }

        abrirPaginaSaidaFinanceiro();
      });
    }

    const voltarSaida = el('scfFinanceExitBack');
    if(voltarSaida && voltarSaida.dataset.scfEventos !== '1'){
      voltarSaida.dataset.scfEventos = '1';
      voltarSaida.addEventListener('click', function(){
        if(document.body.classList.contains('scf-financeiro-entrada-open')){
          if(financeEntrySelectedMonth !== null){
            renderizarPastasEntradaFinanceiro();
            return;
          }

          fecharPaginaEntradaFinanceiro();
          return;
        }

        if(
          document.body.classList.contains('scf-financeiro-saida-open') &&
          financeExitSelectedMonth !== null
        ){
          renderizarPastasSaidaFinanceiro();
          return;
        }

        fecharPaginaSaidaFinanceiro();
      });
    }

    return true;
  }

  function resetarFinanceiroFechado(){
    document.body.classList.remove(
      'scf-financeiro-saldo-open',
      'scf-financeiro-saida-open',
      'scf-financeiro-saida-mes-open',
      'scf-financeiro-entrada-open',
      'scf-financeiro-entrada-mes-open'
    );

    financeExitSelectedMonth = null;
    financeEntrySelectedMonth = null;

    /*
     * Invalida apenas a requisição em trânsito. O último conjunto COMPLETO
     * permanece em memória para a próxima abertura instantânea do Financeiro.
     */
    saldoDadosRequestId = '';
    saldoDadosCarregando = false;
    saldoAtualizacaoSilenciosa = false;
    saldoAtualizacaoVendas = [];
    saldoAtualizacaoCaixaConsulta = null;
    saldoAtualizacaoMovimentos = [];
    saldoAtualizacaoEvolucao7Dias = [];
    saldoAtualizacaoContaFinanceira = null;

    const saldoView = el('scfFinanceSaldoView');
    if(saldoView){
      saldoView.hidden = true;
      saldoView.setAttribute('aria-hidden','true');
    }

    const entradaView = el('scfFinanceEntryView');
    if(entradaView){
      entradaView.hidden = true;
      entradaView.setAttribute('aria-hidden','true');
    }

    const saidaView = el('scfFinanceExitView');
    if(saidaView){
      saidaView.hidden = true;
      saidaView.setAttribute('aria-hidden','true');
    }

    const voltarSaida = el('scfFinanceExitBack');
    if(voltarSaida){
      voltarSaida.hidden = true;
      voltarSaida.setAttribute('aria-hidden','true');
    }

    desmontarAnoEntradaFinanceiro();
    desmontarAnoSaidaFinanceiro();

    const titulo = el('scfFinanceRegistrationTitle');
    if(titulo){
      titulo.textContent = 'FINANCEIRO';
    }
  }

  function abrirDetalhamentoSaldo(){
    if(!document.body.classList.contains('scf-financeiro-registration-open')) return;

    document.body.classList.remove('scf-financeiro-saida-open');
    document.body.classList.remove('scf-financeiro-saida-mes-open');
    document.body.classList.remove('scf-financeiro-entrada-open');
    document.body.classList.remove('scf-financeiro-entrada-mes-open');

    financeExitSelectedMonth = null;
    financeEntrySelectedMonth = null;

    const entradaView = el('scfFinanceEntryView');
    if(entradaView){
      entradaView.hidden = true;
      entradaView.setAttribute('aria-hidden','true');
    }

    const saidaView = el('scfFinanceExitView');
    if(saidaView){
      saidaView.hidden = true;
      saidaView.setAttribute('aria-hidden','true');
    }

    const voltarSaida = el('scfFinanceExitBack');
    if(voltarSaida){
      voltarSaida.hidden = true;
      voltarSaida.setAttribute('aria-hidden','true');
    }

    desmontarAnoEntradaFinanceiro();
    desmontarAnoSaidaFinanceiro();

    const saldoView = el('scfFinanceSaldoView');
    if(!saldoView) return;

    document.body.classList.add('scf-financeiro-saldo-open');

    const titulo = el('scfFinanceRegistrationTitle');
    if(titulo) titulo.textContent = 'FINANCEIRO';

    const controle = el('scfFinanceRegistrationClose');
    if(controle){
      controle.setAttribute('aria-label','Fechar financeiro');
      const img = controle.querySelector('img');
      if(img){
        img.src = closeSrc();
        img.alt = 'Fechar';
      }
    }

    saldoView.hidden = false;
    saldoView.setAttribute('aria-hidden','false');

    /* No FINANCEIRO, o card direito recebe o painel operacional próprio. */
    mostrarDashboardSaldoDireito();

    /*
     * Incorpora imediatamente sangrias/suprimentos já confirmados nesta
     * sessão, mesmo antes da nova consulta geral ao backend responder.
     */
    saldoSincronizarMovimentosLocais();

    if(saldoCachePronto === true){
      /*
       * Reentrada instantânea: pinta primeiro a última fotografia completa e
       * só depois confere o backend sem apagar nem bloquear o que já está visível.
       */
      renderizarDadosSaldoFinanceiro();
      solicitarDadosSaldoFinanceiro(0,true,true);
    }else{
      /* Primeiro acesso da sessão: ainda não existe fotografia para reutilizar. */
      solicitarDadosSaldoFinanceiro(0,true,false);
    }

    try{ controle?.focus({preventScroll:true}); }catch(error){}
  }

  function mostrarCardFiscalPrincipal(){
    const shell = document.querySelector('.fiscal-form-shell');
    const card = document.querySelector('.fiscal-form-card');
    if(shell) shell.hidden = false;
    if(card) card.hidden = false;
    document.body.classList.remove('fiscal-products-view-open');
  }

  function ocultarPainel(id){
    const painel = el(id);
    if(!painel) return;

    if(!estadosPaineis.has(painel)){
      estadosPaineis.set(painel, {
        hidden:painel.hidden,
        ariaHidden:painel.getAttribute('aria-hidden'),
        display:painel.style.getPropertyValue('display'),
        displayPriority:painel.style.getPropertyPriority('display'),
        visibility:painel.style.getPropertyValue('visibility'),
        visibilityPriority:painel.style.getPropertyPriority('visibility'),
        pointerEvents:painel.style.getPropertyValue('pointer-events'),
        pointerEventsPriority:painel.style.getPropertyPriority('pointer-events')
      });
    }

    painel.hidden = true;
    painel.style.setProperty('display','none','important');
    painel.style.setProperty('visibility','hidden','important');
    painel.style.setProperty('pointer-events','none','important');
    painel.setAttribute('aria-hidden','true');
  }

  function restaurarPaineis(){
    estadosPaineis.forEach(function(estado,painel){
      if(!painel || !painel.style) return;

      function restaurar(nome,valor,prioridade){
        if(valor){
          painel.style.setProperty(nome,valor,prioridade || '');
        }else{
          painel.style.removeProperty(nome);
        }
      }

      painel.hidden = estado.hidden === true;
      restaurar('display',estado.display,estado.displayPriority);
      restaurar('visibility',estado.visibility,estado.visibilityPriority);
      restaurar('pointer-events',estado.pointerEvents,estado.pointerEventsPriority);

      if(estado.ariaHidden == null){
        painel.removeAttribute('aria-hidden');
      }else{
        painel.setAttribute('aria-hidden',estado.ariaHidden);
      }
    });
    estadosPaineis.clear();
  }

  function ocultarChromePdv(){
    ['scfPdvShortcutLegend','scfPdvOperatorCard','scfCashShortcutGroup']
      .forEach(function(id){
        const node = el(id);
        if(!node) return;

        if(!estilosChrome.has(node)){
          estilosChrome.set(node, {
            display:node.style.getPropertyValue('display'),
            displayPriority:node.style.getPropertyPriority('display'),
            visibility:node.style.getPropertyValue('visibility'),
            visibilityPriority:node.style.getPropertyPriority('visibility'),
            pointerEvents:node.style.getPropertyValue('pointer-events'),
            pointerEventsPriority:node.style.getPropertyPriority('pointer-events')
          });
        }

        node.style.setProperty('display','none','important');
        node.style.setProperty('visibility','hidden','important');
        node.style.setProperty('pointer-events','none','important');
        node.setAttribute('aria-hidden','true');
      });
  }

  function restaurarChromePdv(){
    estilosChrome.forEach(function(estado,node){
      if(!node || !node.style) return;

      function restaurar(nome,valor,prioridade){
        if(valor){
          node.style.setProperty(nome,valor,prioridade || '');
        }else{
          node.style.removeProperty(nome);
        }
      }

      restaurar('display',estado.display,estado.displayPriority);
      restaurar('visibility',estado.visibility,estado.visibilityPriority);
      restaurar('pointer-events',estado.pointerEvents,estado.pointerEventsPriority);
    });
    estilosChrome.clear();
  }

  function prepararCardDireito(){
    try{
      if(typeof window.scfCloseFinalizePhotoPanel === 'function'){
        window.scfCloseFinalizePhotoPanel();
      }
    }catch(error){}

    [
      'scfFinalizeStandbyPanel',
      'fiscalFinalizeSalePhotoPanel',
      'fiscalCompletedSalePhotoPanel',
      'cpfFiscalCardOverlay',
      'saleValidationWaitingOverlay',
      'saleCompletedCardOverlay',
      'finalizeSupportCardOverlay',
      'fiscalProductCancelCard'
    ].forEach(ocultarPainel);

    const frame = document.querySelector(
      '#fiscalDesktopProductPhoto .fiscal-desktop-product-photo-frame'
    );

    if(frame){
      frame.classList.remove(
        'is-sale-finalize-open',
        'is-client-identification-open',
        'is-validation-waiting-open',
        'is-sale-completed-open',
        'is-product-cancel-open'
      );
    }

    document.body.classList.remove(
      'finalize-support-card-open',
      'cpf-fiscal-card-open',
      'sale-validation-waiting-open',
      'sale-completed-card-open'
    );
  }

  function reforcarFinanceiro(){
    if(!document.body.classList.contains('scf-financeiro-registration-open')) return;
    ocultarChromePdv();
    prepararCardDireito();

    /*
     * REENTRADA NO FINANCEIRO:
     * CADASTRO / ESTOQUE / VENDAS podem restaurar o conteúdo padrão do
     * card FOTO DO PRODUTO enquanto estão sendo fechados. Como esses fluxos
     * são assíncronos, reforçamos também o painel financeiro direito depois
     * que a página FINANCEIRO já assumiu a tela.
     */
    if(document.body.classList.contains('scf-financeiro-saldo-open')){
      mostrarDashboardSaldoDireito();

      /* Só repinta valores consolidados; nunca usa buffers de uma carga parcial. */
      if(saldoCachePronto === true || saldoDadosCarregando === false){
        renderizarDadosSaldoFinanceiro();
      }
    }
  }

  function ocultarOutrasPaginas(){
    try{
      if(
        document.body.classList.contains('scf-stock-page-open') &&
        typeof window.scfFecharEstoque === 'function'
      ){
        window.scfFecharEstoque({sincronizarMenu:false});
      }
    }catch(error){}

    try{
      window.__scfPdvInfra.eventBus.dispatch(new CustomEvent(
        'scf:fechar-cadastro-colaborador',
        {detail:{voltarPdv:false,destino:'FINANCEIRO'}}
      ));
    }catch(error){}

    const colaborador = el('scfCollaboratorRegistrationOverlay');
    if(colaborador){
      colaborador.classList.remove('show');
      colaborador.setAttribute('aria-hidden','true');
    }
    document.body.classList.remove('scf-collaborator-registration-open');

    const cliente = el('scfCustomerRegistrationOverlay');
    if(cliente){
      cliente.classList.remove('show');
      cliente.setAttribute('aria-hidden','true');
    }
    document.body.classList.remove(
      'scf-customer-registration-open',
      'scf-supplier-registration-open'
    );

    const historico = el('scfSalesHistoryOverlay');
    if(historico){
      historico.classList.remove('show');
      historico.setAttribute('aria-hidden','true');
    }
    document.body.classList.remove(
      'scf-sales-history-open',
      'scf-history-year-dashboard-on-photo',
      'scf-history-calendar-on-photo'
    );

    const anual = el('scfHistoryAnnualDashboard');
    if(anual) anual.hidden = true;
  }

  function selecionarFinanceiroNoMenu(){
    try{
      const iframe = el('__htmlStatusIframe');
      if(iframe && iframe.contentWindow){
        iframe.contentWindow.postMessage(
          {type:'SCF_MENU_FINANCEIRO_ABERTO'},
          '*'
        );
      }
    }catch(error){}
  }

  function liberarMenuFinanceiro(){
    try{
      const iframe = el('__htmlStatusIframe');
      if(iframe && iframe.contentWindow){
        iframe.contentWindow.postMessage(
          {type:'SCF_MENU_FINANCEIRO_FECHADO'},
          '*'
        );
      }
    }catch(error){}
  }

  function restaurarStandby(){
    const standby = el('scfFinalizeStandbyPanel');
    if(!standby) return;
    standby.hidden = false;
    standby.style.removeProperty('display');
    standby.style.removeProperty('visibility');
    standby.style.removeProperty('pointer-events');
    standby.setAttribute('aria-hidden','true');
  }


  function iniciarPrecacheFinanceiro(){
    if(
      saldoCachePronto ===
        true ||
      saldoDadosCarregando ===
        true ||
      saldoPrecarregamentoAtivo ===
        true
    ){
      return false;
    }

    saldoPrecarregamentoAtivo =
      true;

    const iniciou =
      solicitarDadosSaldoFinanceiro(
        0,
        true,
        true
      );

    if(iniciou !== true){
      saldoPrecarregamentoAtivo =
        false;

      return false;
    }

    return true;
  }

  function abrirFinanceiro(){
    if(!desktopMq.matches) return;
    if(!garantirEstrutura()) return;

    /* A classe entra primeiro: nenhum frame intermediário do PDV é pintado. */
    document.body.classList.add('scf-financeiro-registration-open');

    /*
     * Primeiro encerra/restaura qualquer página anterior. Isso é essencial
     * na reentrada vindo de CADASTRO, ESTOQUE ou VENDAS, porque essas páginas
     * podem restaurar o card FOTO DO PRODUTO durante o próprio fechamento.
     */
    mostrarCardFiscalPrincipal();
    ocultarOutrasPaginas();
    prepararCardDireito();

    /* Só depois monta o FINANCEIRO e o card direito como estado final. */
    abrirDetalhamentoSaldo();

    const overlay = el('scfFinanceRegistrationOverlay');
    overlay?.classList.add('show');
    overlay?.setAttribute('aria-hidden','false');

    ocultarChromePdv();
    selecionarFinanceiroNoMenu();

    [0,100,350,900].forEach(function(atraso){
      window.setTimeout(reforcarFinanceiro,atraso);
    });
  }

  function fecharFinanceiro(voltarPdv){
    /*
     * CAIXA FECHADO — PREPARA O RETORNO ANTES DO PRIMEIRO PAINT DO PDV.
     * O dispatch é síncrono: se aberturaObrigatoria=true, o módulo de caixa
     * já deixa ABRIR CAIXA montado antes de remover a página FINANCEIRO.
     * Isso elimina o frame em que o PDV podia aparecer como caixa aberto.
     */
    if(voltarPdv === true){
      try{
        window.__scfPdvInfra.eventBus.dispatch(
          new CustomEvent(
            'scf:financeiro-retorno-pdv',
            {detail:{origem:'FINANCEIRO', fase:'ANTES_FECHAR'}}
          )
        );
      }catch(error){}
    }

    const estavaAberto = document.body.classList.contains(
      'scf-financeiro-registration-open'
    );

    const overlay = el('scfFinanceRegistrationOverlay');
    overlay?.classList.remove('show');
    overlay?.setAttribute('aria-hidden','true');
    resetarFinanceiroFechado();

    document.body.classList.remove('scf-financeiro-registration-open');

    /*
     * O rebuild do resumo aplica estilos inline com !important para garantir
     * o Financeiro durante a abertura. Ao sair da página, esses estilos
     * precisam ser removidos para a regra CSS padrão voltar a esconder o
     * dashboard, exatamente como ocorre nas demais páginas exclusivas.
     */
    const form = el('scfFinanceForm');
    if(form){
      form.hidden = true;
      form.setAttribute('aria-hidden','true');
      form.style.removeProperty('display');
      form.style.removeProperty('visibility');
      form.style.removeProperty('opacity');
      form.style.removeProperty('pointer-events');
    }

    if(estavaAberto){
      restaurarPaineis();
      restaurarChromePdv();
    }

    liberarMenuFinanceiro();

    if(voltarPdv === true){
      restaurarStandby();

      /*
       * Se o caixa estava FECHADO antes de entrar no FINANCEIRO, o módulo
       * de caixa mantém internamente aberturaObrigatoria=true. Disparamos
       * um evento direto para esse módulo restaurar ABRIR CAIXA no retorno,
       * sem depender apenas da ordem assíncrona das mensagens do menu.
       */
      function reafirmarEstadoCaixaNoRetorno(){
        try{
          window.__scfPdvInfra.eventBus.dispatch(
            new CustomEvent(
              'scf:financeiro-retorno-pdv',
              {detail:{origem:'FINANCEIRO'}}
            )
          );
        }catch(error){}
      }

      reafirmarEstadoCaixaNoRetorno();

      try{
        const iframe = el('__htmlStatusIframe');
        if(iframe && iframe.contentWindow){
          iframe.contentWindow.postMessage(
            {type:'SCF_MENU_SELECIONAR_CENTRAL'},
            '*'
          );
        }
      }catch(error){}

      /*
       * Segunda reafirmação curta elimina a corrida com rotinas antigas que
       * também restauram o card direito alguns milissegundos após a navegação.
       */
      window.setTimeout(
        reafirmarEstadoCaixaNoRetorno,
        80
      );
    }
  }

  window.scfAbrirFinanceiro = abrirFinanceiro;
  window.scfFecharFinanceiro = fecharFinanceiro;

  document.addEventListener('keydown', function(event){
    if(
      event.key === 'Escape' &&
      document.body.classList.contains('scf-financeiro-registration-open')
    ){
      if(document.body.classList.contains('scf-financeiro-entrada-open')){
        if(financeEntrySelectedMonth !== null){
          renderizarPastasEntradaFinanceiro();
          return;
        }

        fecharPaginaEntradaFinanceiro();
        return;
      }

      if(document.body.classList.contains('scf-financeiro-saida-open')){
        if(financeExitSelectedMonth !== null){
          renderizarPastasSaidaFinanceiro();
          return;
        }

        fecharPaginaSaidaFinanceiro();
        return;
      }

      fecharFinanceiro(true);
    }
  });

  window.__scfPdvInfra.shellBridge.onMessage( function(event){
    const data = event && event.data && typeof event.data === 'object'
      ? event.data
      : null;
    if(!data) return;

    if(
      data.type ===
        'SCF_FISCAL_HOME_ABRIR' &&
      saldoPreloadSolicitado !==
        true &&
      saldoCachePronto !==
        true
    ){
      saldoPreloadSolicitado =
        true;

      window.setTimeout(
        function(){
          if(
            saldoCachePronto !==
              true &&
            saldoDadosCarregando !==
              true
          ){
            iniciarPrecacheFinanceiro();
          }
        },
        900
      );
    }

    if(data.type === 'SCF_CAIXA_MOVIMENTO_REGISTRADO'){
      /*
       * O listener do comprovante, registrado antes deste script, já colocou
       * o movimento confirmado em financeDomain.localMovements.
       * Aqui promovemos esse cache para a fotografia atual do Financeiro.
       */
      saldoSincronizarMovimentosLocais();

      if(
        document.body.classList.contains(
          'scf-financeiro-registration-open'
        )
      ){
        renderizarDadosSaldoFinanceiro();

        if(
          document.body.classList.contains(
            'scf-financeiro-saida-open'
          )
        ){
          if(
            financeExitSelectedMonth ===
              null
          ){
            renderizarPastasSaidaFinanceiro();
          }else{
            renderizarTabelaSaidaFinanceiro(
              financeExitSelectedMonth
            );
          }
        }

        if(
          document.body.classList.contains(
            'scf-financeiro-entrada-open'
          )
        ){
          if(
            financeEntrySelectedMonth ===
              null
          ){
            renderizarPastasEntradaFinanceiro();
          }else{
            renderizarTabelaEntradaFinanceiro(
              financeEntrySelectedMonth
            );
          }
        }
      }

      return;
    }

    if(data.type === 'SCF_FINANCEIRO_EXTRATO_MES_RESULTADO'){
      financeContaExtratoTratarResultado(data);
      return;
    }

    if(data.type === 'SCF_FINANCEIRO_EXTRATO_MES_ERRO'){
      financeContaExtratoTratarErro(data);
      return;
    }

    if(data.type === 'SCF_FINANCEIRO_SALDO_DADOS_RESULTADO'){
      tratarResultadoDadosSaldo(data);
      return;
    }

    if(data.type === 'SCF_FINANCEIRO_SALDO_DADOS_ERRO'){
      tratarErroDadosSaldo(data);
      return;
    }

    if(
      data.type === 'SCF_LAYOUT_PRINCIPAL_PAGINA_SOLICITADA' &&
      String(data.pagina || '').trim().toUpperCase() === 'FINANCEIRO'
    ){
      abrirFinanceiro();
      return;
    }

    if(!document.body.classList.contains('scf-financeiro-registration-open')){
      return;
    }

    /*
     * Qualquer troca explícita de página para um destino diferente de
     * FINANCEIRO encerra o Financeiro antes da nova página assumir a tela.
     * Isso cobre CADASTRO, ESTOQUE, VENDAS e os demais destinos presentes
     * ou futuros sem depender de uma lista incompleta de nomes.
     */
    if(data.type === 'SCF_LAYOUT_PRINCIPAL_PAGINA_SOLICITADA'){
      const destino = String(data.pagina || '').trim().toUpperCase();
      if(destino && destino !== 'FINANCEIRO'){
        fecharFinanceiro(false);
        return;
      }
    }

    if(
      data.type === 'SCF_FISCAL_HOME_ABRIR' ||
      data.type === 'SCF_HISTORICO_VENDAS_ABRIR' ||
      data.type === 'SCF_MENU_SELECIONAR_ESTOQUE'
    ){
      fecharFinanceiro(false);
    }
  });

  window.__scfPdvInfra.eventBus.on('scf:financeiro-saldo-recarregar',
    function(){
      if(
        !document.body.classList.contains(
          'scf-financeiro-registration-open'
        )
      ){
        return;
      }

      const tentar =
        function(){
          if(
            !document.body.classList.contains(
              'scf-financeiro-registration-open'
            )
          ){
            return;
          }

          if(saldoDadosCarregando){
            window.setTimeout(
              tentar,
              180
            );
            return;
          }

          solicitarDadosSaldoFinanceiro(
            0,
            true,
            true
          );
        };

      tentar();
    }
  );

  garantirEstrutura();

  /*
   * Fallback de pré-carga: cobre o caso em que SCF_FISCAL_HOME_ABRIR já
   * aconteceu antes de este módulo registrar o listener.
   */
  window.setTimeout(
    function(){
      if(
        saldoPreloadSolicitado !==
          true &&
        saldoCachePronto !==
          true &&
        saldoDadosCarregando !==
          true &&
        !document.body.classList.contains(
          'scf-financeiro-registration-open'
        )
      ){
        saldoPreloadSolicitado =
          true;
        iniciarPrecacheFinanceiro();
      }
    },
    1400
  );
})();
