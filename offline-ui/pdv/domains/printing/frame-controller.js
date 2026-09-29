(function(){
  'use strict';

  const printingDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.printing;
  const fiscalDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.fiscal;

  if(!printingDomain){
    throw new Error(
      'PDV printing domain indisponivel.'
    );
  }

  if(!fiscalDomain){
    throw new Error(
      'PDV fiscal domain indisponivel para printing.'
    );
  }

  const MARCADOR =

    '__EFISCO_NFCE_PRINT_FRAME_V5__';



  const DIAG_MARCADOR =

    '__EFISCO_NFCE_CONTINGENCIA_PRINT_DIAG_V1__';

  const enviados =
    new Map();

  let gerandoHistorico =
    false;

  function texto(valor){
    return String(
      valor ?? ''
    ).trim();
  }

  function idNovo(){
    return (
      'print-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2)
    );
  }

  function cacheImagemRecente(){
    const cache =
      printingDomain.lastImage;

    if(
      !cache ||
      typeof cache !==
        'object' ||
      !cache.imagemBase64 ||
      Date.now() -
        Number(cache.criadoEm || 0) >
        30000
    ){
      return null;
    }

    return cache;
  }

  function textoElemento(id){
    const el =
      document.getElementById(
        id
      );

    return texto(
      el &&
      el.textContent
    );
  }

  function qrPng256(){
    const url =
      texto(
        fiscalDomain.qrUrl
      );

    if(
      url &&
      typeof window.QRCode ===
        'function'
    ){
      try{
        const holder =
          document.createElement(
            'div'
          );

        new window.QRCode(
          holder,
          {
            text:url,
            width:256,
            height:256,
            colorDark:'#000000',
            colorLight:'#ffffff',
            correctLevel:
              window.QRCode
                .CorrectLevel
                .M
          }
        );

        const canvas =
          holder.querySelector(
            'canvas'
          );

        if(canvas){
          return canvas.toDataURL(
            'image/png'
          );
        }

        const img =
          holder.querySelector(
            'img'
          );

        if(
          img &&
          /^data:image\/png;base64,/i.test(
            img.src || ''
          )
        ){
          return img.src;
        }
      }catch(error){}
    }

    const container =
      document.getElementById(
        'fiscalReceiptQr'
      );

    if(container){
      const canvas =
        container.querySelector(
          'canvas'
        );

      if(canvas){
        try{
          return canvas.toDataURL(
            'image/png'
          );
        }catch(error){}
      }

      const img =
        container.querySelector(
          'img'
        );

      if(
        img &&
        /^data:image\/(?:png|jpeg|jpg);base64,/i.test(
          img.src || ''
        )
      ){
        return img.src;
      }
    }

    return '';
  }

  function obterDadosNativos(){
    const content =
      document.getElementById(
        'fiscalReceiptContent'
      );

    if(!content){
      throw new Error(
        'Conteúdo do DANFE não encontrado.'
      );
    }

    const items =
      Array.from(
        document.querySelectorAll(
          '#fiscalReceiptItems tr'
        )
      ).map(
        function(row){
          function cell(classe){
            const el =
              row.querySelector(
                '.' + classe
              );

            return texto(
              el &&
              el.textContent
            );
          }

          return {
            item:cell('c-item'),
            code:cell('c-code'),
            description:cell('c-desc'),
            qty:cell('c-qty'),
            unit:cell('c-un'),
            unitValue:cell('c-unit'),
            st:cell('c-st'),
            total:cell('c-total')
          };
        }
      );

    const payments = [];

    const fiscalRows =
      document.getElementById(
        'fiscalReceiptPaymentFiscalRows'
      );

    if(
      fiscalRows &&
      fiscalRows.style.display !==
        'none'
    ){
      Array.from(
        fiscalRows.querySelectorAll(
          '.fiscal-receipt-payment-row'
        )
      ).forEach(
        function(row){
          const spans =
            row.querySelectorAll(
              'span'
            );

          if(spans.length >= 2){
            payments.push({
              label:texto(
                spans[0].textContent
              ),
              value:texto(
                spans[1].textContent
              )
            });
          }
        }
      );
    }

    if(!payments.length){
      payments.push({
        label:
          textoElemento(
            'fiscalReceiptPaymentLabel'
          ) ||
          'PAGAMENTO',
        value:
          textoElemento(
            'fiscalReceiptPaymentValue'
          )
      });
    }

    const additional =
      document.getElementById(
        'fiscalReceiptAdditionalInfo'
      );

    const nativeReceipt = {
      /*
       * O Electron 1.0.32 reconhece VENDA_INTERNA no próprio renderer
       * térmico nativo. A NFC-e comum continua identificada como NFCE.
       */
      receiptKind:
        content.classList.contains(
          'scf-venda-interna'
        )
          ? 'VENDA_INTERNA'
          : 'NFCE',

      company:
        textoElemento(
          'fiscalReceiptCompany'
        ),
      cnpj:
        textoElemento(
          'fiscalReceiptCnpj'
        ),
      ie:
        textoElemento(
          'fiscalReceiptIe'
        ),
      address1:
        textoElemento(
          'fiscalReceiptAddress1'
        ),
      address2:
        textoElemento(
          'fiscalReceiptAddress2'
        ),
      items,
      total:
        textoElemento(
          'fiscalReceiptTotal'
        ),
      payments,
      taxPis:
        textoElemento(
          'fiscalReceiptTaxPis'
        ),
      taxIcms:
        textoElemento(
          'fiscalReceiptTaxIcms'
        ),
      taxCofins:
        textoElemento(
          'fiscalReceiptTaxCofins'
        ),
      taxTotal:
        textoElemento(
          'fiscalReceiptTaxTotal'
        ),
      additionalInfo:
        additional &&
        additional.style.display !==
          'none'
          ? textoElemento(
              'fiscalReceiptAdditionalInfoText'
            )
          : '',
      docLine:
        textoElemento(
          'fiscalReceiptDocLine'
        ),
      auth:
        textoElemento(
          'fiscalReceiptAuth'
        ),
      saleNumber:
        textoElemento(
          'fiscalReceiptSaleNumber'
        ),
      operator:
        textoElemento(
          'fiscalReceiptOperator'
        ),
      consultUrl:
        textoElemento(
          'fiscalReceiptConsultUrl'
        ),
      accessKey:
        textoElemento(
          'fiscalReceiptAccessKey'
        ),
      qrImageBase64:
        qrPng256(),
      consumer:
        textoElemento(
          'fiscalReceiptConsumer'
        ),
      nfce:
        textoElemento(
          'fiscalReceiptNfce'
        ),
      warning:
        textoElemento(
          'fiscalReceiptWarning'
        )
    };

    if(
      !nativeReceipt.company ||
      !nativeReceipt.docLine
    ){
      throw new Error(
        'DANFE ainda não está pronto para impressão nativa.'
      );
    }

    return nativeReceipt;
  }

  async function obterImagem(){
    const cache =
      cacheImagemRecente();

    if(cache){
      return {
        imagemBase64:
          cache.imagemBase64,

        saleId:
          texto(cache.saleId)
      };
    }

    const imagemBase64 =
      await printingDomain
        .generateReceiptImage();

    return {
      imagemBase64,
      saleId:''
    };
  }

  async function disparar(
    origem,
    chaveAntiduplicidade
  ){
    const chave =
      texto(chaveAntiduplicidade) ||
      origem;

    const agora =
      Date.now();

    for(
      const [id, instante]
      of enviados
    ){
      if(
        agora - instante >
        30000
      ){
        enviados.delete(id);
      }
    }

    if(
      chave &&
      enviados.has(chave)
    ){
      return false;
    }

    let nativeReceipt =
      null;

    let imagem =
      null;

    try{
      nativeReceipt =
        obterDadosNativos();
    }catch(error){
      console.warn(
        'SCF NFC-e — impressão nativa indisponível; usando fallback de imagem:',
        error && error.message
          ? error.message
          : error
      );

      imagem =
        await obterImagem();
    }

    if(
      !nativeReceipt &&
      (
        !imagem ||
        !imagem.imagemBase64 ||
        !/^data:image\/(?:jpeg|jpg|png);base64,/i.test(
          imagem.imagemBase64
        )
      )
    ){
      throw new Error(
        'Não foi possível preparar o DANFE para impressão.'
      );
    }

    const requestId =
      idNovo();

    const cache =
      cacheImagemRecente();

    printingDomain.pendingPayload = {
      requestId,

      nativeReceipt,

      imageBase64:
        imagem &&
        imagem.imagemBase64
          ? imagem.imagemBase64
          : '',

      origem:
        origem || 'NFCE',

      saleId:
        texto(
          imagem &&
          imagem.saleId
        ) ||
        texto(
          cache &&
          cache.saleId
        ) ||
        chave
    };

    if(chave){
      enviados.set(
        chave,
        agora
      );
    }

    /*
     * Não colocar a imagem no console.
     * Vai somente um identificador pequeno.
     * O Electron usa details.frame.executeJavaScript() para buscar
     * printingDomain.pendingPayload dentro deste MESMO iframe.
     */
    console.info(
      MARCADOR +
      requestId
    );

    return true;
  }

  /*
   * O fluxo antigo chama esta função no finally do WhatsApp.
   * Mantemos a função, agora usando diretamente o canal do frame.
   */
  const imprimirHistoricoAoReenviar =
    function(){
      if(
        gerandoHistorico
      ){
        return false;
      }

      gerandoHistorico =
        true;

      window.setTimeout(
        function(){
          disparar(
            'HISTORICO_REENVIAR',
            'HISTORICO_REENVIAR'
          )
            .catch(
              function(error){
                console.error(
                  'SCF NFC-e — falha ao preparar impressão direta do Histórico:',
                  error &&
                  error.message
                    ? error.message
                    : error
                );
              }
            )
            .finally(
              function(){
                gerandoHistorico =
                  false;
              }
            );
        },
        80
      );

      return true;
    };

  function saleIdContingencia(
    comprovante
  ){
    return (
      texto(
        comprovante &&
        comprovante.saleId
      ) ||
      texto(
        comprovante &&
        comprovante.identificadordavenda
      ) ||
      texto(
        comprovante &&
        comprovante.venda &&
        comprovante.venda.saleId
      ) ||
      'CONTINGENCIA'
    );
  }

  async function dispararViaContingencia(
    comprovante,
    via,
    chaveAntiduplicidade
  ){
    const chave =
      texto(
        chaveAntiduplicidade
      );

    const agora =
      Date.now();

    for(
      const [id, instante]
      of enviados
    ){
      if(
        agora - instante >
        30000
      ){
        enviados.delete(id);
      }
    }

    if(
      chave &&
      enviados.has(chave)
    ){
      return false;
    }

    const rotuloVia =
      via ===
        'ESTABELECIMENTO'
        ? 'VIA ESTABELECIMENTO'
        : 'VIA CONSUMIDOR';

    console.info(
      DIAG_MARCADOR +
      JSON.stringify({
        etapa:'NATIVE_START',
        via,
        saleId:
          saleIdContingencia(
            comprovante
          )
      })
    );

    const nativeReceipt =
      obterDadosNativos();

    nativeReceipt.copyLabel =
      rotuloVia;

    nativeReceipt.contingencyMessage =
      textoElemento(
        'fiscalReceiptContingencyTop'
      ) ||
      [
        'EMITIDA EM CONTINGÊNCIA',
        'Pendente de autorização'
      ].join(
        String.fromCharCode(10)
      );

    console.info(
      DIAG_MARCADOR +
      JSON.stringify({
        etapa:'NATIVE_DONE',
        via,
        saleId:
          saleIdContingencia(
            comprovante
          ),
        copyLabel:
          nativeReceipt.copyLabel,
        contingencyMessage:
          nativeReceipt.contingencyMessage
      })
    );

    const requestId =
      idNovo();

    printingDomain.pendingPayload = {
      requestId,

      /*
       * Contingência usa o mesmo recibo estruturado do ONLINE.
       * O helper nativo recebe também o rótulo da via e as mensagens
       * fiscais específicas da contingência, sem depender de captura JPEG.
       */
      nativeReceipt,

      imageBase64:
        '',

      origem:
        via ===
          'ESTABELECIMENTO'
          ? 'CONTINGENCIA_ESTABELECIMENTO'
          : 'CONTINGENCIA_CONSUMIDOR',

      saleId:

        saleIdContingencia(

          comprovante

        )

    };



    if(chave){

      enviados.set(

        chave,

        agora

      );

    }



    console.info(

      DIAG_MARCADOR +

      JSON.stringify({

        etapa:'BEFORE_MARKER',

        via,

        requestId,

        saleId:

          saleIdContingencia(

            comprovante

          )

      })

    );



    console.info(

      MARCADOR +

      requestId

    );

    return true;
  }

  /*
   * NFC-e tpEmis=9:
   * por segurança fiscal imprime duas vias distintas.
   * A primeira é entregue ao consumidor; a segunda permanece no
   * estabelecimento enquanto a NFC-e estiver pendente de autorização.
   *
   * Este caminho não usa o fluxo normal de NFC-e autorizada e não
   * dispara WhatsApp.
   */
  const imprimirContingenciaAutomaticamente =

    function(comprovante){

      const saleId =

        saleIdContingencia(

          comprovante

        );



      console.info(

        DIAG_MARCADOR +

        JSON.stringify({

          etapa:'ENTRY',

          saleId

        })

      );

      const chaveBase =
        'CONTINGENCIA:' +
        saleId;

      if(
        enviados.has(
          chaveBase +
          ':CONSUMIDOR'
        ) &&
        enviados.has(
          chaveBase +
          ':ESTABELECIMENTO'
        )
      ){
        return false;
      }

      window.setTimeout(
        function(){
          dispararViaContingencia(
            comprovante,
            'CONSUMIDOR',
            chaveBase +
              ':CONSUMIDOR'
          )
            .then(
              function(){
                /*
                 * O pequeno intervalo evita sobrescrever o payload do
                 * primeiro console-message antes de o processo principal
                 * do aplicativo recolhê-lo e enfileirá-lo no driver.
                 */
                return new Promise(
                  function(resolve){
                    window.setTimeout(
                      resolve,
                      1400
                    );
                  }
                );
              }
            )
            .then(
              function(){
                return dispararViaContingencia(
                  comprovante,
                  'ESTABELECIMENTO',
                  chaveBase +
                    ':ESTABELECIMENTO'
                );
              }
            )
            .catch(
              function(error){
                console.info(
                  DIAG_MARCADOR +
                  JSON.stringify({
                    etapa:'ERROR',
                    saleId:
                      saleIdContingencia(
                        comprovante
                      ),
                    mensagem:
                      error &&
                      error.message
                        ? String(
                            error.message
                          )
                        : String(error)
                  })
                );

                console.error(
                  'SCF NFC-e — falha ao imprimir DANFE de contingência:',
                  error &&
                  error.message
                    ? error.message
                    : error
                );
              }
            );
        },
        300
      );

      return true;
    };

  /*
   * Venda atual também passa pelo mesmo canal, mantendo o comportamento
   * de impressão automática depois da emissão.
   */
  const imprimirAtualAutomaticamente =
    function(comprovante){
      const saleId =
        texto(
          comprovante &&
          (
            comprovante.saleId ||
            comprovante.identificadordavenda
          )
        ) ||
        'VENDA_ATUAL';

      window.setTimeout(
        function(){
          disparar(
            'VENDA_ATUAL',
            'VENDA_ATUAL:' +
              saleId
          ).catch(
            function(error){
              console.error(
                'SCF NFC-e — falha ao preparar impressão direta da venda:',
                error &&
                error.message
                  ? error.message
                  : error
              );
            }
          );
        },
        100
      );

      return true;
    };

  /*
   * GARANTIA DO REENVIAR:
   * O botão está em outro iframe (__htmlStatusIframe).
   * O listener antigo fica no próprio botão e usa stopImmediatePropagation.
   * Aqui ouvimos no DOCUMENT do menu, em captura, portanto somos executados
   * antes do listener do target.
   *
   * O hook é só uma garantia: espera o WhatsApp gerar/cachear a imagem.
   * A trava de 30 s impede impressão duplicada caso o finally antigo também
   * solicite a reimpressao pelo printing owner.
   */
  printingDomain.registerCurrentPrinter(
    imprimirAtualAutomaticamente
  );

  printingDomain.registerHistoryPrinter(
    imprimirHistoricoAoReenviar
  );

  printingDomain.registerContingencyPrinter(
    imprimirContingenciaAutomaticamente
  );

  function instalarHookMenu(){
    let docMenu =
      null;

    try{
      const iframe =
        document.getElementById(
          '__htmlStatusIframe'
        );

      docMenu =
        iframe &&
        (
          iframe.contentDocument ||
          iframe.contentWindow &&
          iframe.contentWindow.document
        );
    }catch(error){
      docMenu =
        null;
    }

    if(
      !docMenu ||
      docMenu.__scfPrintFrameV5Hook ===
        true
    ){
      return Boolean(docMenu);
    }

    docMenu.__scfPrintFrameV5Hook =
      true;

    docMenu.addEventListener(
      'click',
      function(event){
        const target =
          event &&
          event.target;

        const button =
          target &&
          target.closest
            ? target.closest(
                '#statusButton.whatsapp-resend-mode'
              )
            : null;

        if(!button){
          return;
        }

        /*
         * Não bloqueia nem altera o clique original.
         * Aguarda a captura usada pelo WhatsApp.
         */
        const inicio =
          Date.now();

        function tentar(){
          const cache =
            cacheImagemRecente();

          if(cache){
            printingDomain
              .printHistory();

            return;
          }

          if(
            Date.now() -
            inicio <
            4500
          ){
            window.setTimeout(
              tentar,
              120
            );

            return;
          }

          /*
           * Caso o WhatsApp não tenha criado o cache por qualquer motivo,
           * ainda tentamos gerar a imagem diretamente.
           */
          printingDomain
            .printHistory();
        }

        window.setTimeout(
          tentar,
          150
        );
      },
      true
    );

    return true;
  }

  function iniciar(){
    if(
      instalarHookMenu()
    ){
      return;
    }

    let tentativas =
      0;

    const timer =
      window.setInterval(
        function(){
          tentativas +=
            1;

          if(
            instalarHookMenu() ||
            tentativas >=
              80
          ){
            window.clearInterval(
              timer
            );
          }
        },
        100
      );
  }

  if(
    document.readyState ===
      'loading'
  ){
    document.addEventListener(
      'DOMContentLoaded',
      iniciar,
      {
        once:true
      }
    );
  }else{
    iniciar();
  }
})();
