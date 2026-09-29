(function(){
  'use strict';

  function restaurarSelecaoHistorico(){
    try{
      const historyOverlay =
        document.getElementById(
          'scfSalesHistoryOverlay'
        );

      if(
        !historyOverlay ||
        !historyOverlay.classList.contains('show') ||
        historyOverlay.getAttribute('aria-hidden') !==
          'false'
      ){
        return;
      }

      const iframe =
        document.getElementById(
          '__htmlStatusIframe'
        );

      const doc =
        iframe &&
        (
          iframe.contentDocument ||
          iframe.contentWindow &&
          iframe.contentWindow.document
        );

      if(!doc){
        return;
      }

      const historyButton =
        doc.getElementById(
          'localizacaoBtn'
        );

      const otherButtons = [
        doc.getElementById('cadastrarBtn'),
        doc.getElementById('bloqueioBtn'),
        doc.getElementById('admin')
      ].filter(Boolean);

      if(historyButton){
        historyButton.classList.remove(
          'is-off'
        );

        historyButton.classList.remove(
          'receipt-menu-locked'
        );

        historyButton.disabled = false;
        historyButton.removeAttribute(
          'disabled'
        );
        historyButton.setAttribute(
          'aria-disabled',
          'false'
        );
      }

      otherButtons.forEach(
        function(button){
          button.classList.add(
            'is-off'
          );

          button.classList.remove(
            'receipt-menu-locked'
          );

          button.disabled = false;
          button.removeAttribute(
            'disabled'
          );
          button.setAttribute(
            'aria-disabled',
            'false'
          );
        }
      );

      const centralButton =
        doc.getElementById(
          'statusButton'
        );

      if(centralButton){
        centralButton.classList.remove(
          'menu-home-active',
          'whatsapp-resend-mode',
          'whatsapp-resend-loading',
          'nfe55-resend-mode',
          'nfe55-resend-loading',
          'sale-finalize-ready',
          'products-back-ready',
          'conectando',
          'disabled'
        );

        centralButton.classList.add(
          'nfce-home-mode'
        );

        centralButton.disabled = false;
        centralButton.setAttribute(
          'aria-pressed',
          'false'
        );
        centralButton.setAttribute(
          'aria-label',
          'Emissão NFC-e'
        );
      }
    }catch(error){}
  }

  window.__scfPdvInfra.eventBus.on('scf:cupom-historico-fechado',
    function(){
      requestAnimationFrame(
        function(){
          requestAnimationFrame(
            restaurarSelecaoHistorico
          );
        }
      );
    }
  );
})();
