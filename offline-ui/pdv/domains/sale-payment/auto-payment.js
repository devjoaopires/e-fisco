(function(){
  'use strict';

  const desktopMq = window.matchMedia('(min-width:1001px)');
  let timerAutoPagamento = 0;
  let processandoAutoPagamento = false;
  let pagamentoAutomaticoDesfeitoPorEdicao = false;

  function numeroMoeda(valor){
    if(typeof valor === 'number'){
      return Number.isFinite(valor) ? valor : 0;
    }

    let texto = String(valor == null ? '' : valor)
      .trim()
      .replace(/R\$/gi,'')
      .replace(/\s/g,'');

    if(!texto) return 0;

    if(texto.includes(',')){
      texto = texto
        .replace(/\.(?=\d{3}(?:\D|$))/g,'')
        .replace(',','.');
    }

    texto = texto.replace(/[^0-9.-]/g,'');
    const numero = Number(texto);
    return Number.isFinite(numero) ? numero : 0;
  }

  function moeda(valor){
    return new Intl.NumberFormat('pt-BR',{
      style:'currency',
      currency:'BRL'
    }).format(Number(valor) || 0);
  }

  function painel(){
    return document.getElementById('fiscalFinalizeSalePhotoPanel');
  }

  function infoEtapa(){
    const card = painel();
    if(!card || !desktopMq.matches){
      return null;
    }

    if(card.classList.contains('is-method-payment-mode')){
      const input = document.getElementById('fiscalFinalizeMethodAmount');
      const restante = document.getElementById('fiscalFinalizeMethodRemaining');
      return {
        tipo:'METODO',
        input,
        valor:numeroMoeda(input ? input.value : ''),
        restante:numeroMoeda(restante ? restante.textContent : '')
      };
    }

    if(card.classList.contains('is-cash-payment-mode')){
      const input = document.getElementById('fiscalFinalizeCashReceived');
      const restante = document.getElementById('fiscalFinalizeCashRemaining');
      return {
        tipo:'DINHEIRO',
        input,
        valor:numeroMoeda(input ? input.value : ''),
        restante:numeroMoeda(restante ? restante.textContent : '')
      };
    }

    return null;
  }

  function parcelaEhParcial(info){
    return Boolean(
      info &&
      info.valor >= 0.005 &&
      info.restante >= 0.005 &&
      info.valor < info.restante - 0.005
    );
  }

  function parcelaQuitaRestante(info){
    return Boolean(
      info &&
      info.valor >= 0.005 &&
      info.restante >= 0.005 &&
      info.valor >= info.restante - 0.005
    );
  }

  /*
   * Parcela menor que o saldo é confirmada diretamente com ENTER no input.
   */
  function forcarSincronizacaoAtalho(input){
    if(!input) return;

    try{
      input.dispatchEvent(
        new Event('input',{bubbles:true})
      );
    }catch(error){}
  }

  function concluirAutomaticamente(){
    timerAutoPagamento = 0;

    if(processandoAutoPagamento){
      return;
    }

    const info = infoEtapa();
    if(!parcelaQuitaRestante(info)){
      return;
    }

    if(
      info.tipo === 'METODO' &&
      info.valor > info.restante + 0.005 &&
      info.input
    ){
      /* PIX/DÉBITO/CRÉDITO nunca ultrapassam o restante. */
      info.input.value = moeda(info.restante);
    }

    if(typeof window.scfAddFinalizePaymentStage !== 'function'){
      return;
    }

    processandoAutoPagamento = true;

    let adicionado = false;
    try{
      /*
       * MOTOR ÚNICO DE FINALIZAÇÃO:
       * depois que PDV NORMAL ou F5/CREDIÁRIO chegam às formas de pagamento,
       * a mesma parcela automática reversível é usada nos dois fluxos.
       * Assim PAGO volta imediatamente para F7 | VOLTAR se o operador
       * apagar ou alterar o valor que havia quitado o restante.
       */
      adicionado = window.scfAddFinalizePaymentStage({
        keepPaymentStage:true,
        reversibleAutoPayment:true
      }) === true;
    }catch(error){
      adicionado = false;
    }finally{
      processandoAutoPagamento = false;
    }

    if(adicionado){
      pagamentoAutomaticoDesfeitoPorEdicao = false;

      /*
       * O fluxo original atualiza PAGO via sincronização do atalho.
       * Este input sintético apenas solicita essa atualização após
       * a inclusão automática; não altera valores nem adiciona parcela.
       */
      window.setTimeout(function(){
        forcarSincronizacaoAtalho(info.input);
      },0);
    }
  }

  function agendarAutoPagamento(event){
    if(processandoAutoPagamento || !desktopMq.matches){
      return;
    }

    /*
     * Somente digitação real do operador pode disparar PAGO automático.
     * Abertura da etapa, preenchimento por script e eventos sintéticos
     * nunca confirmam uma forma de pagamento.
     */
    if(!event || event.isTrusted !== true){
      return;
    }

    const target = event.target;
    if(
      !target ||
      (
        target.id !== 'fiscalFinalizeMethodAmount' &&
        target.id !== 'fiscalFinalizeCashReceived'
      )
    ){
      return;
    }

    if(timerAutoPagamento){
      clearTimeout(timerAutoPagamento);
      timerAutoPagamento = 0;
    }

    /*
     * Se esta etapa já havia virado PAGO por ter recebido exatamente o
     * TOTAL, uma edição real do operador primeiro desfaz aquela parcela
     * automática. Assim RESTANTE volta ao valor correto e o botão deixa de
     * ficar preso em PAGO.
     */
    if(
      typeof window.scfRollbackFinalizeAutoPaymentStage === 'function' &&
      window.scfRollbackFinalizeAutoPaymentStage() === true
    ){
      pagamentoAutomaticoDesfeitoPorEdicao = true;
    }

    const info = infoEtapa();
    if(!parcelaQuitaRestante(info)){
      return;
    }

    /*
     * Em dinheiro a pausa é maior para o operador poder digitar, por
     * exemplo, R$ 100,00 em uma venda de R$ 73,00 e receber o troco.
     */
    timerAutoPagamento = window.setTimeout(
      concluirAutomaticamente,
      info && info.tipo === 'DINHEIRO' ? 450 : 40
    );
  }

  /*
   * Bubble phase: primeiro o handler original aplica a máscara monetária;
   * depois lemos o valor final realmente exibido ao operador.
   */
  document.addEventListener('input',agendarAutoPagamento,false);

  document.addEventListener('focusin',function(event){
    const target = event && event.target;

    if(
      !target ||
      (
        target.id !== 'fiscalFinalizeMethodAmount' &&
        target.id !== 'fiscalFinalizeCashReceived'
      )
    ){
      return;
    }

    /* Uma etapa recém-aberta começa vazia e pronta para ENTER parcial. */
    if(numeroMoeda(target.value) < 0.005){
      pagamentoAutomaticoDesfeitoPorEdicao = false;
    }
  },true);

  document.addEventListener('keydown',function(event){
    if(!desktopMq.matches || !event || event.isTrusted !== true) return;

    const target = event.target;
    if(
      !target ||
      (
        target.id !== 'fiscalFinalizeMethodAmount' &&
        target.id !== 'fiscalFinalizeCashReceived'
      )
    ){
      return;
    }

    /*
     * ENTER passa a ser a única confirmação da etapa de valor:
     * - valor MENOR que o saldo: adiciona a parcela e volta às opções;
     * - valor que QUITA o saldo: mantém a etapa em PAGO para o próximo ENTER.
     */
    if(event.key === 'Enter'){
      const info = infoEtapa();

      if(parcelaEhParcial(info)){
        if(timerAutoPagamento){
          clearTimeout(timerAutoPagamento);
          timerAutoPagamento = 0;
        }

        event.preventDefault();
        event.stopPropagation();
        if(typeof event.stopImmediatePropagation === 'function'){
          event.stopImmediatePropagation();
        }

        if(typeof window.scfAddFinalizePaymentStage === 'function'){
          const adicionado =
            window.scfAddFinalizePaymentStage() === true;

          if(adicionado){
            pagamentoAutomaticoDesfeitoPorEdicao = false;
          }
        }

        return;
      }

      if(parcelaQuitaRestante(info)){
        if(timerAutoPagamento){
          clearTimeout(timerAutoPagamento);
          timerAutoPagamento = 0;
        }

        event.preventDefault();
        event.stopPropagation();
        if(typeof event.stopImmediatePropagation === 'function'){
          event.stopImmediatePropagation();
        }

        concluirAutomaticamente();
      }
    }
  },true);
})();
