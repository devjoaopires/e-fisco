(function(){
  'use strict';

  let observer = null;
  let pending = false;

  function isFinalizeOpen(){
    return document.body.classList.contains('finalize-support-card-open');
  }

  function getButton(){
    return document.getElementById('scfCashMovementShortcut');
  }

  function finalizePaymentStageIsOpen(){
    const panel =
      document.getElementById(
        'fiscalFinalizeSalePhotoPanel'
      );

    return Boolean(
      panel &&
      panel.hidden !== true &&
      (
        panel.classList.contains(
          'is-method-payment-mode'
        ) ||
        panel.classList.contains(
          'is-cash-payment-mode'
        )
      )
    );
  }

  function focusBarcodeAfterFinalizeClose(){
    /*
     * PDV NORMAL:
     * ao sair de FINALIZAR VENDA com F7, o CÓDIGO DE BARRAS volta a ser
     * o campo operacional ativo. Usamos tentativas curtas porque a rotina
     * de fechamento ainda remove classes/inert no mesmo ciclo do teclado.
     * O crediário fica explicitamente fora desta restauração.
     */
    const generation =
      (window.__scfPdvFinalizeBackFocusGeneration || 0) + 1;

    window.__scfPdvFinalizeBackFocusGeneration = generation;

    [0, 20, 60, 120, 240].forEach(function(delay){
      window.setTimeout(function(){
        if(
          window.__scfPdvFinalizeBackFocusGeneration !== generation
        ){
          return;
        }

        const body = document.body;
        if(!body) return;

        if(
          body.classList.contains('finalize-support-card-open') ||
          body.classList.contains('scf-crediario-open') ||
          body.classList.contains('scf-crediario-list-open') ||
          body.classList.contains('scf-crediario-detail-open') ||
          body.classList.contains('cpf-fiscal-card-open') ||
          body.classList.contains('sale-validation-waiting-open') ||
          body.classList.contains('sale-completed-card-open') ||
          body.classList.contains('scf-pdv-product-consult-open') ||
          body.classList.contains('scf-caixa-open') ||
          !body.classList.contains('scf-pdv-pagina-selecionada')
        ){
          return;
        }

        const barcode =
          document.getElementById('productBarcode');

        const wrap =
          document.getElementById('scfPdvProductSearchWrap');

        if(
          !barcode ||
          barcode.disabled ||
          barcode.readOnly ||
          (wrap && wrap.hasAttribute('inert'))
        ){
          return;
        }

        try{
          window.focus();
        }catch(error){}

        try{
          barcode.focus({ preventScroll:true });
        }catch(error){
          try{ barcode.focus(); }catch(ignore){ return; }
        }

        if(document.activeElement === barcode){
          try{ barcode.select(); }catch(error){}
          window.__scfPdvFinalizeBackFocusGeneration = generation + 1;
        }
      }, delay);
    });
  }

  function closeFinalizeSupportCard(){
    /*
     * F7 dentro de PIX/DÉBITO/CRÉDITO/DINHEIRO:
     * volta SOMENTE para a escolha das formas de pagamento.
     */
    if(
      finalizePaymentStageIsOpen() &&
      typeof window.scfReturnFinalizePaymentOverview === 'function'
    ){
      try{
        window.scfReturnFinalizePaymentOverview();
        return true;
      }catch(error){}
    }

    /*
     * MOTOR ÚNICO DE FINALIZAÇÃO — F5/CREDIÁRIO:
     * na visão principal das formas de pagamento, o mesmo F7 do PDV NORMAL
     * encerra a finalização. A única diferença é o destino: volta para o
     * detalhe VENDAS NO CREDIÁRIO em vez de abandonar a venda para o PDV.
     * Dentro de PIX/DÉBITO/CRÉDITO/DINHEIRO a regra acima continua igual
     * para ambos: F7 volta primeiro às opções de pagamento.
     */
    if(
      window.__scfCrediarioPagamentoFormasAberto === true &&
      typeof window.scfVoltarPagamentoParaCrediario === 'function'
    ){
      try{
        return window.scfVoltarPagamentoParaCrediario() === true;
      }catch(error){}
    }

    /*
     * PDV NORMAL:
     * encerra a finalização e devolve ao PDV.
     */
    try{
      if(typeof window.scfCloseFinalizePhotoPanel === 'function'){
        window.scfCloseFinalizePhotoPanel();
        focusBarcodeAfterFinalizeClose();
        return true;
      }
    }catch(error){}

    return false;
  }

  function syncButton(){
    pending = false;

    const button = getButton();
    if(!button){
      return;
    }

    const finalizeOpen = isFinalizeOpen();

    const paymentStageOpen =
      finalizeOpen &&
      finalizePaymentStageIsOpen();

    const paidMode =
      finalizeOpen &&
      typeof window.scfFinalizePaymentComplete === 'function' &&
      window.scfFinalizePaymentComplete();

    /*
     * Enquanto a parcela ainda não quitar o saldo, o botão inferior
     * permanece F7 | VOLTAR; ENTER no próprio input registra a parcela
     * parcial e retorna automaticamente às formas de pagamento.
     */
    const deleteMode =
      finalizeOpen &&
      !paymentStageOpen &&
      typeof window.scfFinalizeFocusedPaymentHasValue === 'function' &&
      window.scfFinalizeFocusedPaymentHasValue();

    button.classList.toggle(
      'scf-finalize-back-mode',
      finalizeOpen &&
      !paidMode &&
      !deleteMode
    );

    button.classList.toggle(
      'scf-finalize-paid-mode',
      paidMode &&
      !deleteMode
    );

    button.classList.toggle(
      'scf-finalize-delete-mode',
      deleteMode
    );

    if(finalizeOpen){
      button.textContent =
        deleteMode
          ? 'F8 | EXCLUIR'
          : paidMode
            ? 'PAGO'
            : 'F7 | VOLTAR';

      button.setAttribute(
        'aria-label',
        deleteMode
          ? 'F8 | Excluir pagamento'
          : paidMode
            ? 'PAGO | Pressione ENTER para continuar'
            : 'F7 | Voltar'
      );

      button.disabled = false;
      button.hidden = false;
      button.setAttribute('aria-hidden', 'false');
    }else{
      button.classList.remove(
        'scf-finalize-paid-mode',
        'scf-finalize-delete-mode'
      );

      if(
        button.classList.contains(
          'scf-finalize-back-mode'
        ) === false &&
        button.classList.contains(
          'scf-cash-back-mode'
        ) === false &&
        button.classList.contains(
          'scf-product-cancel-back-mode'
        ) === false &&
        button.classList.contains(
          'scf-product-cancel-confirm-mode'
        ) === false &&
        button.classList.contains(
          'scf-cpf-back-mode'
        ) === false
      ){
        /*
         * Quando a finalização fecha, devolvemos o rótulo base
         * somente se o CAIXA não estiver usando F7 | VOLTAR.
         */
        button.textContent =
          'F11 | MOVIMENTAÇÃO';

        button.setAttribute(
          'aria-label',
          'F11 | Movimentação do caixa'
        );
      }
    }
  }

  function requestSync(){
    if(pending) return;
    pending = true;
    window.requestAnimationFrame(syncButton);
  }

  document.addEventListener('click', function(event){
    const button = event.target && event.target.closest
      ? event.target.closest('#scfCashMovementShortcut')
      : null;

    if(!button || !isFinalizeOpen()){
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if(
      button.classList.contains(
        'scf-finalize-paid-mode'
      )
    ){
      if(
        typeof window.scfFinalizePaidSale === 'function'
      ){
        window.scfFinalizePaidSale();
      }
    }else if(
      button.classList.contains(
        'scf-finalize-delete-mode'
      )
    ){
      if(
        typeof window.scfRemoveFocusedFinalizePayment === 'function'
      ){
        window.scfRemoveFocusedFinalizePayment();
      }
    }else{
      closeFinalizeSupportCard();
    }

    window.setTimeout(requestSync, 0);
  }, true);

  document.addEventListener('keydown', function(event){
    const key = String(event.key || '');

    if(
      !isFinalizeOpen()
    ){
      return;
    }

    const button =
      getButton();

    const paidMode =
      Boolean(
        button &&
        button.classList.contains(
          'scf-finalize-paid-mode'
        )
      );

    const deleteMode =
      Boolean(
        button &&
        button.classList.contains(
          'scf-finalize-delete-mode'
        )
      );

    /*
     * RESTANTE = R$ 0,00:
     * ENTER confirma PAGO e segue o fluxo da venda.
     */
    if(
      paidMode &&
      key === 'Enter'
    ){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if(
        typeof window.scfFinalizePaidSale === 'function'
      ){
        window.scfFinalizePaidSale();
      }

      window.setTimeout(
        requestSync,
        0
      );

      return;
    }

    /*
     * Na tela FINALIZAR, quando a forma destacada já possui valor:
     * F8 remove o pagamento inteiro dessa forma.
     */
    if(
      deleteMode &&
      key === 'F8'
    ){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if(
        typeof window.scfRemoveFocusedFinalizePayment === 'function'
      ){
        window.scfRemoveFocusedFinalizePayment();
      }

      window.setTimeout(
        requestSync,
        0
      );

      return;
    }

    /*
     * Sem PAGO/F8 ativo, F7 continua sendo VOLTAR.
     */
    if(
      !paidMode &&
      !deleteMode &&
      key === 'F7'
    ){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      closeFinalizeSupportCard();

      window.setTimeout(
        requestSync,
        0
      );
    }
  }, true);

  function init(){
    requestSync();

    document.addEventListener(
      'focusin',
      function(event){
        const target =
          event &&
          event.target;

        if(
          target &&
          target.classList &&
          target.classList.contains(
            'finalize-payment-method-btn'
          )
        ){
          requestSync();
        }
      },
      true
    );

    document.addEventListener(
      'input',
      function(event){
        const target =
          event &&
          event.target;

        if(
          target &&
          (
            target.id === 'fiscalFinalizeMethodAmount' ||
            target.id === 'fiscalFinalizeCashReceived'
          )
        ){
          requestSync();
        }
      },
      true
    );

    observer = new MutationObserver(function(mutations){
      for(const mutation of mutations){
        if(mutation.type === 'attributes' && mutation.attributeName === 'class'){
          requestSync();
          break;
        }
      }
    });

    observer.observe(document.body, {
      attributes:true,
      attributeFilter:['class']
    });

    [0, 80, 250, 800].forEach(function(delay){
      window.setTimeout(requestSync, delay);
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, { once:true });
  }else{
    init();
  }
})();
