(function(){
  'use strict';

  const historyOverlay =
    document.getElementById(
      'scfSalesHistoryOverlay'
    );

  const historyClose =
    document.getElementById(
      'scfSalesHistoryClose'
    );

  if(!historyOverlay){
    return;
  }

  let timer1 = 0;
  let timer2 = 0;

  function historicoFechado(){
    return (
      !historyOverlay.classList.contains(
        'show'
      ) ||
      historyOverlay.getAttribute(
        'aria-hidden'
      ) ===
        'true'
    );
  }

  function obterDocumentoMenu(){
    try{
      const iframe =
        document.getElementById(
          '__htmlStatusIframe'
        );

      return iframe &&
        (
          iframe.contentDocument ||
          iframe.contentWindow &&
          iframe.contentWindow.document
        );
    }catch(error){
      return null;
    }
  }

  function liberarTravasTemporarias(){
    const doc =
      obterDocumentoMenu();

    if(!doc){
      return;
    }

    [
      'localizacaoBtn',
      'cadastrarBtn',
      'bloqueioBtn',
      'admin'
    ].forEach(function(id){
      const botao =
        doc.getElementById(id);

      if(!botao){
        return;
      }

      /*
       * Ao sair do Histórico nenhuma trava temporária de
       * comprovante/NF-e pode sobreviver. Se existir uma venda
       * real com produtos, a sincronização logo abaixo reaplica
       * somente a trava correta de venda.
       */
      botao.classList.remove(
        'receipt-menu-locked',
        'sale-menu-locked'
      );

      botao.disabled =
        false;

      botao.removeAttribute(
        'disabled'
      );

      botao.setAttribute(
        'aria-disabled',
        'false'
      );

      botao.removeAttribute(
        'tabindex'
      );
    });

    const central =
      doc.getElementById(
        'statusButton'
      );

    if(central){
      central.classList.remove(
        'nfe55-resend-mode',
        'nfe55-resend-loading',
        'whatsapp-resend-mode',
        'whatsapp-resend-loading',
        'conectando',
        'disabled'
      );

      central.classList.add(
        'nfce-home-mode'
      );

      central.disabled =
        false;

      central.removeAttribute(
        'disabled'
      );

      central.setAttribute(
        'aria-disabled',
        'false'
      );
    }
  }

  function sincronizarEstadoRealDoDock(){
    if(!historicoFechado()){
      return;
    }

    /*
     * ESTOQUE já atualiza o dock de forma síncrona no próprio clique/abertura.
     * O observer do Histórico NÃO deve reenviar SCF_MENU_SELECIONAR_ESTOQUE,
     * porque agendarRestauracao() roda em RAF + 80 ms + 220 ms e faria o botão
     * repetir o estado visual várias vezes (o "pisca" percebido no menu).
     */
    if(
      document.body.classList.contains(
        'scf-stock-page-open'
      )
    ){
      return;
    }

    /*
     * Se o Histórico estiver oculto porque o CADASTRO DE CLIENTE está
     * aberto (cadastro normal ou PASSO 2 da NF-e), CADASTRAR deve
     * permanecer como única seleção. Não restaura o PDV enquanto
     * scf-customer-registration-open estiver ativo.
     */
    if(
      document.body.classList.contains(
        'scf-customer-registration-open'
      ) ||
      document.body.classList.contains(
        'scf-nfe55-passo2-cadastro-open'
      )
    ){
      try{
        const iframe =
          document.getElementById(
            '__htmlStatusIframe'
          );

        if(
          iframe &&
          iframe.contentWindow
        ){
          iframe.contentWindow.postMessage(
            {
              type:
                'SCF_MENU_SELECIONAR_CADASTRAR'
            },
            '*'
          );
        }
      }catch(error){}

      return;
    }

    liberarTravasTemporarias();

    /*
     * Esta função já existente lê addedProducts de verdade.
     * Assim, com carrinho vazio libera tudo; se houver produto,
     * reaplica apenas o estado correto de FINALIZAR.
     */
    try{
      if(
        typeof window
          .scfSincronizarBotaoCentralVenda ===
          'function'
      ){
        window
          .scfSincronizarBotaoCentralVenda();
      }
    }catch(error){}

    try{
      const iframe =
        document.getElementById(
          '__htmlStatusIframe'
        );

      if(
        iframe &&
        iframe.contentWindow
      ){
        iframe.contentWindow.postMessage(
          {
            type:
              'SCF_MENU_SELECIONAR_CENTRAL'
          },
          '*'
        );
      }
    }catch(error){}
  }

  function agendarRestauracao(){
    window.clearTimeout(timer1);
    window.clearTimeout(timer2);

    window.requestAnimationFrame(
      function(){
        window.requestAnimationFrame(
          sincronizarEstadoRealDoDock
        );
      }
    );

    /*
     * Repete após os observers antigos terminarem para impedir
     * que uma restauração tardia de receipt-menu-locked volte a
     * deixar o dock cinza/desabilitado.
     */
    timer1 = window.setTimeout(
      sincronizarEstadoRealDoDock,
      80
    );

    timer2 = window.setTimeout(
      sincronizarEstadoRealDoDock,
      220
    );
  }

  if(historyClose){
    historyClose.addEventListener(
      'click',
      agendarRestauracao,
      false
    );
  }

  new MutationObserver(
    function(){
      if(!historicoFechado()){
        return;
      }

      /*
       * Abrir ESTOQUE também oculta o overlay do Histórico. Isso não é um
       * "fechar Histórico e voltar ao PDV"; portanto não agenda nenhuma das
       * restaurações tardias (RAF/80/220 ms) enquanto ESTOQUE estiver aberto.
       */
      if(
        document.body.classList.contains(
          'scf-stock-page-open'
        )
      ){
        return;
      }

      agendarRestauracao();
    }
  ).observe(
    historyOverlay,
    {
      attributes:true,
      attributeFilter:[
        'class',
        'aria-hidden'
      ]
    }
  );
})();
