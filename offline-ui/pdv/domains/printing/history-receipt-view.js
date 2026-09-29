(function(){
  'use strict';

  const body = document.body;
  const receiptOverlay = document.getElementById('fiscalReceiptOverlay');
  const historyList = document.getElementById('scfSalesHistoryList');

  if(!body || !receiptOverlay){
    return;
  }

  let pending = false;

  function cupomHistoricoAberto(){
    return Boolean(
      receiptOverlay.classList.contains('show') &&
      (
        body.classList.contains('scf-history-inline-receipt-open') ||
        receiptOverlay.classList.contains('scf-history-inline-receipt') ||
        receiptOverlay.classList.contains('is-history-desktop-embedded')
      )
    );
  }

  function sync(){
    pending = false;

    const aberto = cupomHistoricoAberto();

    body.classList.toggle(
      'scf-history-receipt-exclusive',
      aberto
    );

    if(aberto && historyList){
      const panel = historyList.querySelector(
        '.scf-history-inline-receipt-panel'
      );

      /*
       * Mantém o estado semântico do painel coerente enquanto o DANFE
       * estiver aberto. Isso impede estilos antigos do dashboard de
       * reaparecerem depois do REENVIAR/print().
       */
      if(panel){
        panel.classList.add('has-receipt');
        panel.classList.add('is-receipt-mode');
      }
    }
  }

  function requestSync(){
    if(pending){
      return;
    }

    pending = true;
    window.requestAnimationFrame(sync);
  }

  new MutationObserver(requestSync).observe(
    body,
    {
      attributes:true,
      attributeFilter:['class']
    }
  );

  new MutationObserver(requestSync).observe(
    receiptOverlay,
    {
      attributes:true,
      attributeFilter:['class','style','hidden']
    }
  );

  if(historyList){
    new MutationObserver(requestSync).observe(
      historyList,
      {
        childList:true,
        subtree:true
      }
    );
  }

  window.__scfPdvInfra.eventBus.on('scf:cupom-historico-fechado',
    requestSync
  );

  [0,80,250,700].forEach(function(delay){
    window.setTimeout(requestSync,delay);
  });
})();
