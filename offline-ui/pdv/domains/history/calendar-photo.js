(function(){
  'use strict';

  const desktopMq = window.matchMedia('(min-width:1001px)');
  const historyOverlay = document.getElementById('scfSalesHistoryOverlay');
  const historyList = document.getElementById('scfSalesHistoryList');
  const historyBack = document.getElementById('scfSalesHistoryBack');
  const photoFrame = document.querySelector(
    '#fiscalDesktopProductPhoto .fiscal-desktop-product-photo-frame'
  );

  if(!historyOverlay || !historyList || !photoFrame){
    return;
  }

  let rafId = 0;

  function historyIsOpen(){
    return historyOverlay.classList.contains('show') &&
      historyOverlay.getAttribute('aria-hidden') === 'false';
  }

  function isMonthDetail(){
    const body = document.body;
    const outraPagina = body && (
      body.classList.contains('scf-customer-registration-open') ||
      body.classList.contains('scf-stock-page-open')
    );

    return !outraPagina &&
      historyIsOpen() &&
      (!historyBack || historyBack.hidden === false) &&
      !historyList.querySelector('.scf-sales-history-month-grid');
  }

  function getPanel(){
    return historyList.querySelector('.scf-history-inline-receipt-panel');
  }

  function deactivate(){
    document.body.classList.remove('scf-history-calendar-on-photo');

    const panel = getPanel();
    if(panel){
      panel.classList.remove('scf-history-panel-on-photo');
      panel.style.removeProperty('--scf-history-photo-x');
      panel.style.removeProperty('--scf-history-photo-y');
      panel.style.removeProperty('--scf-history-photo-w');
      panel.style.removeProperty('--scf-history-photo-h');
    }
  }

  function syncNow(){
    if(!desktopMq.matches || !isMonthDetail()){
      deactivate();
      return;
    }

    const panel = getPanel();
    if(!panel){
      deactivate();
      return;
    }

    const rect = photoFrame.getBoundingClientRect();
    if(rect.width < 20 || rect.height < 20){
      deactivate();
      return;
    }

    panel.style.setProperty('--scf-history-photo-x', rect.left + 'px');
    panel.style.setProperty('--scf-history-photo-y', rect.top + 'px');
    panel.style.setProperty('--scf-history-photo-w', rect.width + 'px');
    panel.style.setProperty('--scf-history-photo-h', rect.height + 'px');

    panel.classList.add('scf-history-panel-on-photo');
    document.body.classList.add('scf-history-calendar-on-photo');
  }

  function sync(){
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(function(){
      requestAnimationFrame(syncNow);
    });
  }

  new MutationObserver(sync).observe(historyList, {
    childList:true,
    subtree:true
  });

  new MutationObserver(sync).observe(historyOverlay, {
    attributes:true,
    attributeFilter:['class','aria-hidden']
  });

  new MutationObserver(sync).observe(document.body, {
    attributes:true,
    attributeFilter:['class']
  });

  if(historyBack){
    new MutationObserver(sync).observe(historyBack, {
      attributes:true,
      attributeFilter:['hidden','style','class']
    });
  }

  if(typeof ResizeObserver === 'function'){
    const resizeObserver = new ResizeObserver(sync);
    resizeObserver.observe(photoFrame);
  }

  window.addEventListener('resize', sync, { passive:true });
  window.addEventListener('orientationchange', sync, { passive:true });
  window.__scfPdvInfra.eventBus.on('scf:cupom-historico-fechado', sync);

  if(typeof desktopMq.addEventListener === 'function'){
    desktopMq.addEventListener('change', sync);
  }else if(typeof desktopMq.addListener === 'function'){
    desktopMq.addListener(sync);
  }

  sync();
})();
