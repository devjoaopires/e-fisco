(function(){
  'use strict';

  const historyDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.history;

  if(!historyDomain){
    throw new Error(
      'PDV history domain indisponivel.'
    );
  }

  const desktopMq =
    window.matchMedia('(min-width:1001px)');

  const overlay =
    document.getElementById(
      'scfSalesHistoryOverlay'
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

  const receiptOverlay =
    document.getElementById(
      'fiscalReceiptOverlay'
    );

  const receiptCloseButton =
    document.getElementById(
      'fiscalReceiptCloseButton'
    );

  if(
    !overlay ||
    !list ||
    !backButton ||
    !closeButton ||
    !receiptOverlay ||
    !receiptCloseButton
  ){
    return;
  }

  let salesColumn = null;
  let receiptPanel = null;
  let receiptPlaceholder = null;
  let receiptLoading = null;
  let activeSaleId = '';

  function text(value){
    return String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isDesktop(){
    return desktopMq.matches;
  }

  function isHistoryOpen(){
    return (
      overlay.classList.contains('show') &&
      overlay.getAttribute('aria-hidden') ===
        'false'
    );
  }

  function isMonthView(){
    return (
      isHistoryOpen() &&
      backButton.hidden === false &&
      !list.querySelector(
        '.scf-sales-history-month-grid'
      )
    );
  }

  function ensureInlineStructure(){
    if(
      !isDesktop() ||
      !isMonthView()
    ){
      return;
    }

    let layout =
      list.querySelector(
        '.scf-history-month-detail-layout'
      );

    if(!layout){
      layout =
        document.createElement(
          'div'
        );

      layout.className =
        'scf-history-month-detail-layout';

      salesColumn =
        document.createElement(
          'div'
        );

      salesColumn.className =
        'scf-history-month-sales-column';

      receiptPanel =
        document.createElement(
          'div'
        );

      receiptPanel.className =
        'scf-history-inline-receipt-panel';

      historyDomain.receipt.frame = null;
      receiptPlaceholder = null;
      receiptLoading = null;

      layout.append(
        salesColumn,
        receiptPanel
      );

      list.appendChild(
        layout
      );
    }else{
      salesColumn =
        layout.querySelector(
          '.scf-history-month-sales-column'
        );

      receiptPanel =
        layout.querySelector(
          '.scf-history-inline-receipt-panel'
        );

      const receiptFrameNoLayout =
        layout.querySelector(
          '.scf-history-inline-receipt-frame'
        );

      if(receiptFrameNoLayout){
        historyDomain.receipt.frame =
          receiptFrameNoLayout;
      }

      if(historyDomain.receipt.frame){
        receiptPlaceholder =
          historyDomain.receipt.frame.querySelector(
            '.scf-history-inline-receipt-placeholder'
          );

        receiptLoading =
          historyDomain.receipt.frame.querySelector(
            '.scf-history-inline-receipt-loading'
          );
      }
    }

    Array.from(list.children)
      .filter(function(node){
        return !node.classList.contains(
          'scf-history-month-detail-layout'
        );
      })
      .forEach(function(node){
        salesColumn.appendChild(
          node
        );
      });

    list.classList.add(
      'scf-history-inline-mode'
    );
  }

  function garantirReceiptFrameParaDocumento(){
    if(!receiptPanel){
      return null;
    }

    if(!historyDomain.receipt.frame){
      historyDomain.receipt.frame =
        document.createElement(
          'div'
        );

      historyDomain.receipt.frame.className =
        'scf-history-inline-receipt-frame';

      receiptPlaceholder =
        document.createElement(
          'div'
        );

      receiptPlaceholder.className =
        'scf-history-inline-receipt-placeholder';

      receiptPlaceholder.textContent =
        'CUPOM FISCAL';

      receiptLoading =
        document.createElement(
          'div'
        );

      receiptLoading.className =
        'scf-history-inline-receipt-loading';

      receiptLoading.textContent =
        'CARREGANDO...';

      historyDomain.receipt.frame.append(
        receiptPlaceholder,
        receiptLoading
      );
    }

    if(
      historyDomain.receipt.frame.parentElement !==
        receiptPanel
    ){
      receiptPanel.appendChild(
        historyDomain.receipt.frame
      );
    }

    return historyDomain.receipt.frame;
  }

  window.__scfGarantirReceiptFrameHistorico =
    garantirReceiptFrameParaDocumento;

  function cleanupInlineStructure(){
    list.classList.remove(
      'scf-history-inline-mode'
    );

    const layout =
      list.querySelector(
        '.scf-history-month-detail-layout'
      );

    if(!layout){
      return;
    }

    const localSalesColumn =
      layout.querySelector(
        '.scf-history-month-sales-column'
      );

    if(localSalesColumn){
      Array.from(
        localSalesColumn.children
      ).forEach(function(node){
        list.insertBefore(
          node,
          layout
        );
      });
    }

    layout.remove();
    salesColumn = null;
    receiptPanel = null;
    historyDomain.receipt.frame = null;
    receiptPlaceholder = null;
    receiptLoading = null;
    clearInlineReceiptState();
  }

  function setLoading(loading, message){
    if(
      !receiptPanel ||
      !receiptLoading
    ){
      return;
    }

    receiptPanel.classList.toggle(
      'is-loading',
      loading === true
    );

    if(message){
      receiptLoading.textContent =
        message;
    }else{
      receiptLoading.textContent =
        'CARREGANDO...';
    }
  }

  function clearInlineReceiptState(){
    historyDomain.receipt.pendingSaleId = '';
    activeSaleId = '';

    historyDomain.receipt.pendingSaleId =
      '';

    historyDomain.receipt.frame =
      null;

    if(receiptPanel){
      receiptPanel.classList.remove(
        'has-receipt',
        'is-loading',
        'is-receipt-mode'
      );
    }

    document.body.classList.remove(
      'scf-history-inline-receipt-open'
    );

    receiptOverlay.classList.remove(
      'scf-history-inline-receipt'
    );

    updateButtonsState();
  }

  function ensureButtonsSetup(){
    const scope =
      salesColumn || list;

    scope.querySelectorAll(
      '.scf-sales-history-item-compact'
    ).forEach(function(card){
      const reprint =
        card.querySelector(
          '.scf-sales-history-reprint'
        );

      if(
        reprint &&
        !card.dataset.saleId
      ){
        card.dataset.saleId =
          text(
            reprint.dataset.saleId
          );
      }

      if(reprint){
        reprint.remove();
      }

      const side =
        card.querySelector(
          '.scf-sales-history-side'
        );

      if(side){
        Array.from(side.children)
          .filter(function(node){
            return !node.classList.contains(
              'scf-sales-history-total'
            );
          })
          .forEach(function(node){
            node.remove();
          });
      }

      const cupomButton =
        card.querySelector(
          '.scf-sales-history-doc-action'
        );

      const notaButton =
        card.querySelectorAll(
          '.scf-sales-history-doc-action'
        )[1];

      if(
        cupomButton &&
        cupomButton.dataset.inlineReady !==
          'true'
      ){
        cupomButton.dataset.inlineReady =
          'true';

        cupomButton.addEventListener(
          'click',
          function(event){
            event.preventDefault();
            event.stopPropagation();

            if(
              typeof event.stopImmediatePropagation ===
                'function'
            ){
              event.stopImmediatePropagation();
            }

            const saleId =
              text(
                card.dataset.saleId
              );

            if(!saleId){
              return;
            }

            activeSaleId =
              saleId;

            requestInlineReceipt(
              saleId
            );
          },
          true
        );
      }

      if(
        notaButton &&
        notaButton.dataset.inlineReady !==
          'true'
      ){
        notaButton.dataset.inlineReady =
          'true';

        notaButton.addEventListener(
          'click',
          function(event){
            event.preventDefault();
            event.stopPropagation();

            if(
              typeof event.stopImmediatePropagation ===
                'function'
            ){
              event.stopImmediatePropagation();
            }

            /*
             * Mantém o segundo botão visível, porém
             * sem acionar nova tela enquanto não houver
             * um fluxo separado para Nota Fiscal.
             */
          },
          true
        );
      }
    });

    updateButtonsState();
  }

  function updateButtonsState(){
    const scope =
      salesColumn || list;

    scope.querySelectorAll(
      '.scf-sales-history-item-compact'
    ).forEach(function(card){
      const saleId =
        text(
          card.dataset.saleId
        );

      const buttons =
        card.querySelectorAll(
          '.scf-sales-history-doc-action'
        );

      const cupomButton =
        buttons[0];

      const notaButton =
        buttons[1];

      if(cupomButton){
        const isActive =
          saleId &&
          saleId === activeSaleId &&
          receiptPanel &&
          receiptPanel.classList.contains(
            'has-receipt'
          );

        cupomButton.classList.toggle(
          'is-active',
          isActive
        );

        cupomButton.classList.toggle(
          'is-inactive',
          !isActive
        );

        const isLoading =
          historyDomain.receipt.pendingSaleId &&
          saleId === historyDomain.receipt.pendingSaleId;

        cupomButton.classList.toggle(
          'is-loading',
          Boolean(isLoading)
        );
      }

      if(notaButton){
        notaButton.classList.remove(
          'is-active',
          'is-loading'
        );

        notaButton.classList.add(
          'is-inactive'
        );
      }
    });
  }

  function requestInlineReceipt(saleId){
    ensureInlineStructure();
    garantirReceiptFrameParaDocumento();
    ensureButtonsSetup();

    /*
     * Se o usuário acabou de visualizar a 2ª via da NF-e, o DANFE PDF
     * deixou o #fiscalReceiptContent em modo NF-e. Restauramos primeiro
     * a estrutura do cupom para que o renderizador NFC-e escreva no
     * documento correto em vez de reutilizar os canvases da NF-e.
     */
    if(
      typeof window.__scfRestaurarConteudoNfceHistorico ===
        'function'
    ){
      window.__scfRestaurarConteudoNfceHistorico();
    }

    historyDomain.receipt.pendingSaleId =
      saleId;

    if(receiptPanel){
      receiptPanel.classList.remove(
        'has-receipt'
      );

      receiptPanel.classList.add(
        'is-receipt-mode'
      );
    }

    setLoading(
      true,
      'CARREGANDO...'
    );

    updateButtonsState();

    document.body.classList.add(
      'scf-history-inline-request-pending'
    );

    /*
     * Informa ao renderizador principal onde o cupom deve nascer.
     * Assim ele não abre primeiro em tela cheia.
     */
    historyDomain.receipt.frame =
      historyDomain.receipt.frame;

    historyDomain.receipt.pendingSaleId =
      saleId;

    window.__scfPdvInfra.shellBridge.post(
      {
        type:
          'SCF_NFCE_SOLICITAR_COMPROVANTE',
        saleId
      },
      '*'
    );
  }

  /*
   * API interna exclusiva do Histórico.
   * A tabela chama esta função diretamente, sem passar pelo botão antigo
   * REIMPRIMIR CUPOM e sem acionar closeHistory()/tela principal.
   */
  window.__scfAbrirCupomHistoricoInline =
    requestInlineReceipt;

  function prepareInlineReceiptBeforeOpen(){
    ensureInlineStructure();
    garantirReceiptFrameParaDocumento();

    if(!historyDomain.receipt.frame){
      return;
    }

    historyDomain.receipt.frame.appendChild(
      receiptOverlay
    );

    receiptOverlay.classList.add(
      'scf-history-inline-receipt'
    );

    document.body.classList.add(
      'scf-history-inline-receipt-open'
    );
  }

  function handleReceiptError(message){
    document.body.classList.remove(
      'scf-history-inline-request-pending'
    );

    ensureInlineStructure();

    if(receiptPanel){
      receiptPanel.classList.remove(
        'is-receipt-mode',
        'has-receipt'
      );
    }

    setLoading(
      true,
      text(message) ||
      'NÃO FOI POSSÍVEL CARREGAR O CUPOM.'
    );

    activeSaleId = '';
    historyDomain.receipt.pendingSaleId = '';
    updateButtonsState();

    window.setTimeout(
      function(){
        if(receiptPanel){
          receiptPanel.classList.remove(
            'has-receipt'
          );
        }

        setLoading(
          false,
          'CARREGANDO...'
        );
      },
      1800
    );
  }

  function closeInlineReceiptVisualOnly(){
    document.body.classList.remove(
      'scf-history-inline-request-pending'
    );

    if(receiptPanel){
      receiptPanel.classList.remove(
        'has-receipt',
        'is-loading',
        'is-receipt-mode'
      );

      /*
       * O calendário tinha recebido is-hidden quando o cupom abriu.
       * Apenas remover has-receipt não retirava essa classe.
       * Restauramos diretamente aqui, no mesmo clique do X.
       */
      const calendar =
        receiptPanel.querySelector(
          '.scf-history-inline-calendar'
        );

      if(calendar){
        calendar.classList.remove(
          'is-hidden'
        );

        calendar.style.display =
          '';
        calendar.style.visibility =
          '';
        calendar.style.height =
          '';
        calendar.style.minHeight =
          '';
        calendar.style.margin =
          '';
        calendar.style.padding =
          '';
        calendar.style.border =
          '';
        calendar.style.overflow =
          '';
        calendar.style.pointerEvents =
          '';
      }

      const frame =
        receiptPanel.querySelector(
          '.scf-history-inline-receipt-frame'
        );

      if(frame){
        frame.style.width = '';
        frame.style.height = '';
        frame.style.minHeight = '';
        frame.style.margin = '';
        frame.style.border = '';
        frame.style.borderRadius = '';
      }
    }

    clearInlineReceiptState();

    /*
     * Avisa o calendário depois da restauração visual para ele
     * redesenhar/atualizar o mês, sem depender da ordem dos listeners.
     */
    window.__scfPdvInfra.eventBus.dispatch(
      new CustomEvent(
        'scf:cupom-historico-fechado'
      )
    );
  }

  function syncLayout(){
    if(
      isDesktop() &&
      isMonthView()
    ){
      ensureInlineStructure();
      ensureButtonsSetup();
    }else{
      cleanupInlineStructure();
    }
  }

  window.__scfPdvInfra.shellBridge.onMessage(
    function(event){
      const data =
        event &&
        event.data &&
        typeof event.data ===
          'object'
          ? event.data
          : null;

      if(
        !data ||
        !isDesktop() ||
        !isMonthView()
      ){
        return;
      }

      if(
        data.type ===
          'SCF_NFCE_COMPROVANTE_ERRO'
      ){
        const saleIdErro =
          text(
            data.saleId ||
            data.comprovante &&
            data.comprovante.saleId
          );

        if(
          historyDomain.receipt.pendingSaleId &&
          saleIdErro &&
          saleIdErro !==
            historyDomain.receipt.pendingSaleId
        ){
          return;
        }

        if(historyDomain.receipt.pendingSaleId){
          handleReceiptError(
            data.mensagem
          );
        }

        return;
      }

      if(
        data.type !==
          'SCF_NFCE_COMPROVANTE_AUTORIZADO'
      ){
        return;
      }

      const receipt =
        data.comprovante || {};

      const saleId =
        text(
          receipt.saleId ||
          data.saleId
        );

      if(
        historyDomain.receipt.pendingSaleId &&
        saleId &&
        saleId !==
          historyDomain.receipt.pendingSaleId
      ){
        return;
      }

      if(!historyDomain.receipt.pendingSaleId && !saleId){
        return;
      }

      activeSaleId =
        saleId || historyDomain.receipt.pendingSaleId;

      prepareInlineReceiptBeforeOpen();

      const finalizarComprovanteInline =
        function(){
          /*
           * O manipulador antigo já terminou neste ponto.
           * Recolocamos o overlay no Histórico antes que o navegador
           * tenha oportunidade de desenhar a versão em tela inteira.
           */
          prepareInlineReceiptBeforeOpen();

          if(receiptPanel){
            receiptPanel.classList.add(
              'has-receipt'
            );
          }

          /*
           * O ajuste de escala do DANFE ocorre em dois frames.
           * Mantemos a camada CARREGANDO por mais alguns frames para
           * impedir que o usuário veja o cupom grande e depois reduzindo.
           */
          requestAnimationFrame(
            function(){
              requestAnimationFrame(
                function(){
                  requestAnimationFrame(
                    function(){
                      document.body.classList.remove(
                        'scf-history-inline-request-pending'
                      );

                      setLoading(
                        false,
                        'CARREGANDO...'
                      );

                      historyDomain.receipt.pendingSaleId = '';
                      updateButtonsState();
                    }
                  );
                }
              );
            }
          );
        };

      if(typeof queueMicrotask === 'function'){
        queueMicrotask(
          finalizarComprovanteInline
        );
      }else{
        Promise.resolve().then(
          finalizarComprovanteInline
        );
      }
    },
    true
  );

  receiptCloseButton.addEventListener(
    'click',
    function(){
      window.requestAnimationFrame(
        closeInlineReceiptVisualOnly
      );
    }
  );

  backButton.addEventListener(
    'click',
    function(){
      if(
        receiptOverlay.classList.contains(
          'scf-history-inline-receipt'
        ) &&
        receiptOverlay.classList.contains(
          'show'
        )
      ){
        receiptCloseButton.click();
      }

      window.requestAnimationFrame(
        syncLayout
      );
    }
  );

  closeButton.addEventListener(
    'click',
    function(){
      if(
        receiptOverlay.classList.contains(
          'scf-history-inline-receipt'
        ) &&
        receiptOverlay.classList.contains(
          'show'
        )
      ){
        receiptCloseButton.click();
      }

      window.requestAnimationFrame(
        syncLayout
      );
    }
  );

  new MutationObserver(
    function(){
      syncLayout();
    }
  ).observe(
    list,
    {
      childList:true
    }
  );

  new MutationObserver(
    function(){
      syncLayout();
    }
  ).observe(
    overlay,
    {
      attributes:true,
      attributeFilter:[
        'class',
        'aria-hidden'
      ]
    }
  );

  desktopMq.addEventListener(
    'change',
    function(){
      syncLayout();
    }
  );

  syncLayout();
})();
