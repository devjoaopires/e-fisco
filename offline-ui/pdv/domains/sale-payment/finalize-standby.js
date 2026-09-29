(function(){
  'use strict';

  function montarStandby(){
    if(document.getElementById('scfFinalizeStandbyPanel')){
      return true;
    }

    const photoFrame = document.querySelector(
      '#fiscalDesktopProductPhoto > .fiscal-desktop-product-photo-frame'
    );
    const headerTotal = document.getElementById('fiscalHeaderTotal');

    if(!photoFrame){
      return false;
    }

    const standby = document.createElement('div');
    standby.id = 'scfFinalizeStandbyPanel';
    standby.className = 'fiscal-finalize-sale-photo-panel';
    standby.setAttribute('aria-hidden', 'true');
    standby.innerHTML = [
      '<div class="fiscal-finalize-sale-title">FINALIZAR VENDA</div>',
      '<div class="fiscal-finalize-sale-subtitle">ESCOLHA A FORMA DE PAGAMENTO</div>',
      '<div class="fiscal-finalize-split-summary">',
        '<div class="fiscal-finalize-split-totals">',
          '<span>TOTAL <strong class="scf-finalize-standby-total">R$ 0,00</strong></span>',
          '<span>PAGO <strong>R$ 0,00</strong></span>',
          '<span>RESTANTE <strong class="scf-finalize-standby-remaining">R$ 0,00</strong></span>',
        '</div>',
        '<div class="fiscal-finalize-split-list"></div>',
      '</div>',
      '<div class="finalize-payment-wrap">',
        '<button class="finalize-payment-method-btn" type="button" tabindex="-1"><span class="finalize-payment-method-label">PIX</span></button>',
        '<button class="finalize-payment-method-btn" type="button" tabindex="-1"><span class="finalize-payment-method-label">DÉBITO</span></button>',
        '<button class="finalize-payment-method-btn" type="button" tabindex="-1"><span class="finalize-payment-method-label">CRÉDITO</span></button>',
        '<button class="finalize-payment-method-btn" type="button" tabindex="-1"><span class="finalize-payment-method-label">DINHEIRO</span></button>',
      '</div>',

    ].join('');

    photoFrame.appendChild(standby);

    function atualizarTotal(){
      const total = String(
        headerTotal ? headerTotal.textContent : 'R$ 0,00'
      ).trim() || 'R$ 0,00';

      const totalEl = standby.querySelector('.scf-finalize-standby-total');
      const remainingEl = standby.querySelector('.scf-finalize-standby-remaining');

      if(totalEl) totalEl.textContent = total;
      if(remainingEl) remainingEl.textContent = total;
    }

    atualizarTotal();

    if(headerTotal){
      const totalObserver = new MutationObserver(atualizarTotal);
      totalObserver.observe(headerTotal, {
        childList:true,
        characterData:true,
        subtree:true
      });
    }

    return true;
  }

  function iniciar(){
    if(montarStandby()) return;

    let tentativas = 0;
    const timer = window.setInterval(function(){
      tentativas += 1;
      if(montarStandby() || tentativas >= 40){
        window.clearInterval(timer);
      }
    }, 100);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', iniciar, { once:true });
  }else{
    iniciar();
  }
})();
