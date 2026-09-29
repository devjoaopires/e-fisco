(function(){
  'use strict';

  const title =
    document.getElementById(
      'scfSalesHistoryTitle'
    );

  const list =
    document.getElementById(
      'scfSalesHistoryList'
    );

  const backButton =
    document.getElementById(
      'scfSalesHistoryBack'
    );

  const closeButton =
    document.getElementById(
      'scfSalesHistoryClose'
    );

  const overlay =
    document.getElementById(
      'scfSalesHistoryOverlay'
    );

  if(
    !title ||
    !list ||
    !backButton ||
    !closeButton ||
    !overlay
  ){
    return;
  }

  const baseTitle =
    'FISCAL';

  function resetTitle(){
    title.textContent =
      baseTitle;
  }

  list.addEventListener(
    'click',
    function(event){
      const folder =
        event.target.closest(
          '.scf-sales-history-month-folder'
        );

      if(
        !folder ||
        folder.disabled
      ){
        return;
      }

      const monthElement =
        folder.querySelector(
          '.scf-sales-history-month-name'
        );

      const month =
        monthElement
          ? monthElement.textContent.trim()
          : '';

      if(month){
        title.textContent =
          `${baseTitle} - ${month}`;
      }
    }
  );

  backButton.addEventListener(
    'click',
    resetTitle
  );

  closeButton.addEventListener(
    'click',
    resetTitle
  );

  new MutationObserver(function(){
    if(
      !overlay.classList.contains('show') ||
      overlay.getAttribute('aria-hidden') ===
        'true'
    ){
      resetTitle();
    }
  }).observe(
    overlay,
    {
      attributes:true,
      attributeFilter:[
        'class',
        'aria-hidden'
      ]
    }
  );
})();
