(function(){
  'use strict';

  function removeTop3(){
    [
      '#scfStockDashV4Priority',
      '#scfStockDashV5Priority',
      '.scf-stock-v4-priority',
      '.scf-stock-v5-priority'
    ].forEach(function(sel){
      document.querySelectorAll(sel).forEach(function(el){
        el.remove();
      });
    });

    document.querySelectorAll('#scfStockDashV4Root .scf-stock-v4-card, #scfStockDashV5Root .scf-stock-v5-card').forEach(function(card){
      const title = (card.querySelector('.title, .kicker, .header, .scf-stock-v4-title, .scf-stock-v5-title') || {}).textContent || '';
      if(/top\s*3\s*para\s*reposi/i.test(title)){
        card.remove();
      }
    });
  }

  let raf = 0;
  function schedule(){
    if(raf) return;
    raf = requestAnimationFrame(function(){
      raf = 0;
      removeTop3();
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', schedule, { once:true });
  } else {
    schedule();
  }

  new MutationObserver(schedule).observe(document.documentElement, {
    childList:true,
    subtree:true
  });
})();
