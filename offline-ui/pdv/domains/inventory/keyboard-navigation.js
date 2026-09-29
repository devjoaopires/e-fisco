(function(){
  'use strict';

  let activeIndex = -1;
  let pendingTimer = 0;
  let observerRaf = 0;

  function stockOpen(){
    return Boolean(
      document.body &&
      document.body.classList.contains(
        'scf-stock-page-open'
      )
    );
  }

  function visibleRows(){
    return Array.from(
      document.querySelectorAll(
        '#scfStockList .scf-stock-row'
      )
    ).filter(
      function(row){
        return (
          !row.hidden &&
          row.offsetParent !== null
        );
      }
    );
  }

  function clearSelection(){
    document
      .querySelectorAll(
        '#scfStockList .scf-stock-row.scf-stock-keyboard-active'
      )
      .forEach(
        function(row){
          row.classList.remove(
            'scf-stock-keyboard-active'
          );

          row.setAttribute(
            'aria-selected',
            'false'
          );
        }
      );
  }

  function normalizeIndex(rows){
    if(!rows.length){
      activeIndex = -1;
      return;
    }

    if(
      activeIndex < 0 ||
      activeIndex >= rows.length
    ){
      activeIndex = 0;
    }
  }

  function paintActive(scroll){
    const rows =
      visibleRows();

    clearSelection();

    if(!rows.length){
      activeIndex = -1;
      return null;
    }

    normalizeIndex(
      rows
    );

    const row =
      rows[
        activeIndex
      ];

    if(!row){
      return null;
    }

    row.classList.add(
      'scf-stock-keyboard-active'
    );

    row.setAttribute(
      'aria-selected',
      'true'
    );

    if(scroll !== false){
      try{
        row.scrollIntoView({
          block:'nearest',
          inline:'nearest',
          behavior:'smooth'
        });
      }catch(error){
        try{
          row.scrollIntoView(
            false
          );
        }catch(error2){}
      }
    }

    return row;
  }

  function move(direction){
    const rows =
      visibleRows();

    if(!rows.length){
      activeIndex = -1;
      clearSelection();
      return false;
    }

    /*
     * Igual ao comportamento do F4:
     * sem seleção anterior, ↓ começa no primeiro e ↑ no último.
     */
    if(activeIndex < 0){
      activeIndex =
        direction > 0
          ? 0
          : rows.length - 1;
    }else{
      activeIndex =
        Math.max(
          0,
          Math.min(
            activeIndex + direction,
            rows.length - 1
          )
        );
    }

    paintActive(
      true
    );

    return true;
  }

  function activateCurrent(){
    const row =
      paintActive(
        true
      );

    if(!row){
      return false;
    }

    /*
     * Usa o click original da própria linha.
     * Assim não duplica nenhuma regra de edição/cadastro.
     */
    try{
      row.click();
      return true;
    }catch(error){
      return false;
    }
  }

  function executeAction(action,attempt){
    if(!stockOpen()){
      return false;
    }

    const rows =
      visibleRows();

    /*
     * O operador pode apertar a seta praticamente junto do clique
     * em ESTOQUE. Se a lista ainda estiver montando, guarda a ação
     * por alguns milissegundos em vez de descartá-la.
     */
    if(!rows.length){
      const tryNumber =
        Number(
          attempt ||
          0
        );

      if(tryNumber < 24){
        window.clearTimeout(
          pendingTimer
        );

        pendingTimer =
          window.setTimeout(
            function(){
              executeAction(
                action,
                tryNumber + 1
              );
            },
            25
          );
      }

      return false;
    }

    window.clearTimeout(
      pendingTimer
    );

    pendingTimer =
      0;

    if(action === 'DOWN'){
      return move(
        1
      );
    }

    if(action === 'UP'){
      return move(
        -1
      );
    }

    if(action === 'ENTER'){
      return activateCurrent();
    }

    return false;
  }

  /*
   * Recebe as teclas do iframe inferior.
   * Este é o caminho que garante a navegação IMEDIATA após clicar ESTOQUE.
   */
  window.__scfPdvInfra.shellBridge.onMessage(
    function(event){
      const data =
        event &&
        event.data &&
        typeof event.data === 'object'
          ? event.data
          : null;

      if(
        !data ||
        data.type !==
          'SCF_STOCK_KEYBOARD_FROM_MENU' ||
        !stockOpen()
      ){
        return;
      }

      executeAction(
        String(
          data.action ||
          ''
        ).toUpperCase(),
        0
      );
    }
  );

  /*
   * Também funciona quando o foco já está dentro da página ESTOQUE.
   */
  document.addEventListener(
    'keydown',
    function(event){
      if(
        !event ||
        !stockOpen()
      ){
        return;
      }

      const target =
        event.target;

      /*
       * Select e formulário lateral mantêm seu comportamento normal.
       * O campo BUSCAR PRODUTO aceita ↑/↓ para navegar a lista.
       */
      if(
        target &&
        target instanceof Element
      ){
        if(
          target.closest(
            '#scfStockProductForm, #scfStockXmlPanel'
          ) ||
          target.closest(
            '#scfStockQuickFilter'
          ) ||
          (
            target.matches(
              'input, textarea, select'
            ) &&
            target.id !==
              'scfStockSearch'
          )
        ){
          return;
        }
      }

      const key =
        String(
          event.key ||
          event.code ||
          ''
        );

      let action = '';

      if(
        key === 'ArrowDown' ||
        key === 'Down' ||
        Number(event.keyCode) === 40
      ){
        action = 'DOWN';
      }else if(
        key === 'ArrowUp' ||
        key === 'Up' ||
        Number(event.keyCode) === 38
      ){
        action = 'UP';
      }else if(
        key === 'Enter' ||
        Number(event.keyCode) === 13
      ){
        action = 'ENTER';
      }

      if(!action){
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      executeAction(
        action,
        0
      );
    },
    true
  );

  /*
   * Clique/mousedown somente sincroniza qual linha é a ativa.
   * preventDefault no mousedown evita o contorno de foco do navegador,
   * mas o click original da linha continua sendo executado.
   */
  document.addEventListener(
    'mousedown',
    function(event){
      if(
        !stockOpen() ||
        !event.target ||
        !event.target.closest
      ){
        return;
      }

      const row =
        event.target.closest(
          '#scfStockList .scf-stock-row'
        );

      if(!row){
        return;
      }

      const rows =
        visibleRows();

      const index =
        rows.indexOf(
          row
        );

      if(index < 0){
        return;
      }

      activeIndex =
        index;

      event.preventDefault();

      paintActive(
        false
      );
    },
    true
  );

  /*
   * Busca/filtro: reinicia no primeiro resultado visível,
   * mas sem roubar foco nem abrir item.
   */
  document.addEventListener(
    'input',
    function(event){
      if(
        event.target &&
        event.target.id ===
          'scfStockSearch'
      ){
        activeIndex =
          0;

        window.requestAnimationFrame(
          function(){
            if(stockOpen()){
              paintActive(
                false
              );
            }
          }
        );
      }
    },
    true
  );

  document.addEventListener(
    'change',
    function(event){
      if(
        event.target &&
        event.target.id ===
          'scfStockQuickFilter'
      ){
        activeIndex =
          0;

        window.requestAnimationFrame(
          function(){
            if(stockOpen()){
              paintActive(
                false
              );
            }
          }
        );
      }
    },
    true
  );

  /*
   * Quando a página ESTOQUE é montada, já deixa a primeira linha
   * preparada visualmente. NÃO tenta mudar o foco do iframe/menu.
   * A ponte acima torna isso desnecessário.
   */
  function syncStructure(){
    observerRaf =
      0;

    if(!stockOpen()){
      activeIndex =
        -1;

      clearSelection();
      return;
    }

    const rows =
      visibleRows();

    if(!rows.length){
      return;
    }

    normalizeIndex(
      rows
    );

    paintActive(
      false
    );
  }

  function scheduleSync(){
    if(observerRaf){
      return;
    }

    observerRaf =
      window.requestAnimationFrame(
        syncStructure
      );
  }

  new MutationObserver(
    scheduleSync
  ).observe(
    document.documentElement,
    {
      subtree:true,
      childList:true,
      attributes:true,
      attributeFilter:[
        'class',
        'hidden'
      ]
    }
  );

  if(
    document.readyState ===
      'loading'
  ){
    document.addEventListener(
      'DOMContentLoaded',
      scheduleSync,
      {
        once:true
      }
    );
  }else{
    scheduleSync();
  }

  window.addEventListener(
    'load',
    scheduleSync
  );
})();
