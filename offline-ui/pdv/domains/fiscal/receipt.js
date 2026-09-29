(function(){
  'use strict';

  const fiscalDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.fiscal;
  const historyDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.history;
  const salePaymentDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.salePayment;
  const printingDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.printing;

  if(!fiscalDomain){
    throw new Error(
      'PDV fiscal domain indisponivel.'
    );
  }

  if(!historyDomain){
    throw new Error(
      'PDV history domain indisponivel para fiscal.'
    );
  }

  if(!salePaymentDomain){
    throw new Error(
      'PDV sale/payment domain indisponivel para fiscal.'
    );
  }

  if(!printingDomain){
    throw new Error(
      'PDV printing domain indisponivel para fiscal.'
    );
  }

  const overlay =
    document.getElementById(
      'fiscalReceiptOverlay'
    );

  const closeButton =
    document.getElementById(
      'fiscalReceiptCloseButton'
    );

  const completedOverlay =
    document.getElementById(
      'saleCompletedCardOverlay'
    );

  const completedPhotoPanel =
    document.getElementById(
      'fiscalCompletedSalePhotoPanel'
    );

  const receiptPaper =
    document.getElementById(
      'fiscalReceiptPaper'
    );

  const receiptContent =
    document.getElementById(
      'fiscalReceiptContent'
    );

  const whatsappStatus =
    document.getElementById(
      'fiscalReceiptWhatsappStatus'
    );

  const desktopHistoryReceiptMq =
    window.matchMedia(
      '(min-width: 1001px)'
    );

  const desktopProductPhotoFrame =
    document.querySelector(
      '#fiscalDesktopProductPhoto .fiscal-desktop-product-photo-frame'
    );

  const receiptOverlayOriginalParent =
    overlay.parentNode;

  const receiptOverlayOriginalNextSibling =
    overlay.nextSibling;

  const receiptShell =
    overlay.querySelector(
      '.fiscal-receipt-shell'
    );

  const receiptCloseOriginalParent =
    closeButton
      ? closeButton.parentNode
      : null;

  const receiptCloseOriginalNextSibling =
    closeButton
      ? closeButton.nextSibling
      : null;

  function removerXComprovanteAtual(){
    if(
      closeButton &&
      closeButton.isConnected
    ){
      closeButton.remove();
    }
  }

  function restaurarXComprovante(){
    if(
      !closeButton ||
      closeButton.isConnected ||
      !receiptCloseOriginalParent
    ){
      return;
    }

    const referencia =
      receiptCloseOriginalNextSibling &&
      receiptCloseOriginalNextSibling.parentNode ===
        receiptCloseOriginalParent
        ? receiptCloseOriginalNextSibling
        : null;

    receiptCloseOriginalParent.insertBefore(
      closeButton,
      referencia
    );
  }

  let receiptFitFrame = 0;

  if(!overlay) return;

  function text(value){
    return String(
      value ?? ''
    ).trim();
  }

  function toNumber(value){
    if(
      typeof value ===
        'number'
    ){
      return Number.isFinite(
        value
      )
        ? value
        : 0;
    }

    const normalized =
      text(value)
        .replace(
          /R\$/gi,
          ''
        )
        .replace(
          /\s/g,
          ''
        )
        .replace(
          /\.(?=\d{3}(?:\D|$))/g,
          ''
        )
        .replace(
          ',',
          '.'
        )
        .replace(
          /[^0-9.-]/g,
          ''
        );

    const number =
      Number(
        normalized
      );

    return Number.isFinite(
      number
    )
      ? number
      : 0;
  }

  function money(value){
    return toNumber(
      value
    ).toLocaleString(
      'pt-BR',
      {
        minimumFractionDigits:
          2,

        maximumFractionDigits:
          2
      }
    );
  }

  function quantity(value){
    return toNumber(
      value
    ).toLocaleString(
      'pt-BR',
      {
        minimumFractionDigits:
          3,

        maximumFractionDigits:
          3
      }
    );
  }

  function formatDocument(
    value,
    groups
  ){
    const digits =
      text(value).replace(
        /\D/g,
        ''
      );

    let position = 0;

    return groups
      .map(
        (size) => {
          const part =
            digits.slice(
              position,
              position + size
            );

          position +=
            size;

          return part;
        }
      )
      .filter(Boolean)
      .join(
        '.'
      )
      .replace(
        /^(\d{2})\.(\d{3})\.(\d{3})\.(\d{4})\.(\d{2})$/,
        '$1.$2.$3/$4-$5'
      );
  }

  function formatCpf(value){
    const digits =
      text(value).replace(
        /\D/g,
        ''
      );

    return digits.length ===
      11
      ? digits.replace(
          /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
          '$1.$2.$3-$4'
        )
      : digits;
  }

  function formatCep(value){
    const digits =
      text(value).replace(
        /\D/g,
        ''
      );

    return digits.length ===
      8
      ? digits.replace(
          /^(\d{5})(\d{3})$/,
          '$1-$2'
        )
      : digits;
  }

  function formatAccessKey(value){
    const digits =
      text(value).replace(
        /\D/g,
        ''
      );

    return (
      digits.match(
        /.{1,4}/g
      ) ||
      []
    ).join(
      ' '
    );
  }

  function dateTime(value){
    const date =
      value
        ? new Date(
            value
          )
        : null;

    if(
      !date ||
      Number.isNaN(
        date.getTime()
      )
    ){
      return '';
    }

    return [
      date.toLocaleDateString(
        'pt-BR'
      ),

      date.toLocaleTimeString(
        'pt-BR',
        {
          hour:
            '2-digit',

          minute:
            '2-digit',

          second:
            '2-digit'
        }
      )
    ].join(
      ' '
    );
  }

  function setText(
    id,
    value
  ){
    const element =
      document.getElementById(
        id
      );

    if(element){
      element.textContent =
        text(value);
    }
  }

  function createCell(
    className,
    value
  ){
    const cell =
      document.createElement(
        'td'
      );

    cell.className =
      className;

    cell.textContent =
      text(value);

    return cell;
  }

  function renderItems(items){
    const body =
      document.getElementById(
        'fiscalReceiptItems'
      );

    if(!body) return;

    body.replaceChildren();

    (
      Array.isArray(
        items
      )
        ? items
        : []
    ).forEach(
      (
        item,
        index
      ) => {
        const row =
          document.createElement(
            'tr'
          );

        row.append(
          createCell(
            'c-item',
            String(
              item.itemNumber ||
              index + 1
            ).padStart(
              3,
              '0'
            )
          )
        );

        row.append(
          createCell(
            'c-code',
            item.productCode ||
            ''
          )
        );

        row.append(
          createCell(
            'c-desc',
            text(
              item.description
            ).toUpperCase()
          )
        );

        row.append(
          createCell(
            'c-qty',
            quantity(
              item.quantity
            )
          )
        );

        row.append(
          createCell(
            'c-un',
            item.unit ||
            'UN'
          )
        );

        row.append(
          createCell(
            'c-unit',
            money(
              item.unitValue
            )
          )
        );

        row.append(
          createCell(
            'c-st',
            '0,00'
          )
        );

        row.append(
          createCell(
            'c-total',
            money(
              item.totalValue
            )
          )
        );

        body.append(
          row
        );
      }
    );
  }

  function renderQrCode(url){
    fiscalDomain.qrUrl =
      text(url);

    const container =
      document.getElementById(
        'fiscalReceiptQr'
      );

    if(!container) return;

    container.replaceChildren();

    if(
      !url
    ){
      container.textContent =
        'QR INDISPONÍVEL';

      return;
    }

    if(
      typeof window.QRCode !==
        'function'
    ){
      const link =
        document.createElement(
          'a'
        );

      link.href =
        url;

      link.target =
        '_blank';

      link.rel =
        'noopener noreferrer';

      link.textContent =
        'ABRIR CONSULTA';

      link.style.fontSize =
        '9px';

      link.style.textAlign =
        'center';

      container.append(
        link
      );

      return;
    }

    new window.QRCode(
      container,
      {
        text:
          url,

        width:
          170,

        height:
          170,

        colorDark:
          '#000000',

        colorLight:
          '#ffffff',

        correctLevel:
          window.QRCode
            .CorrectLevel
            .M
      }
    );
  }

  function renderReceipt(comprovante){
    const vendaInterna =
      Boolean(
        comprovante &&
        comprovante.vendaInterna ===
          true
      );

    const contingenciaPendente =
      Boolean(
        comprovante &&
        comprovante.success ===
          true &&
        comprovante.autorizado ===
          false &&
        comprovante.contingenciaOffline ===
          true &&
        comprovante.pendenteTransmissao ===
          true &&
        Number(
          comprovante.tipoEmissao ||
          comprovante.nfce &&
          comprovante.nfce.tipoEmissao ||
          0
        ) === 9
      );

    const autorizado =
      Boolean(
        comprovante &&
        comprovante.success ===
          true &&
        comprovante.autorizado ===
          true
      );

    if(
      !autorizado &&
      !contingenciaPendente &&
      !vendaInterna
    ){
      throw new Error(
        'Os dados do DANFE NFC-e são inválidos.'
      );
    }

    const emitente =
      comprovante.emitente ||
      {};

    const venda =
      comprovante.venda ||
      {};

    const nfce =
      comprovante.nfce ||
      {};

    if(receiptContent){
      receiptContent.classList.toggle(
        'scf-nfce-contingencia',
        contingenciaPendente
      );

      receiptContent.classList.toggle(
        'scf-venda-interna',
        vendaInterna
      );
    }

    setText(
      'fiscalReceiptTitle',
      vendaInterna
        ? 'COMPROVANTE DE PAGAMENTO'
        : 'DANFE NFC-e'
    );

    setText(
      'fiscalReceiptSubtitle',
      vendaInterna
        ? ''
        : 'DOCUMENTO AUXILIAR DA NOTA FISCAL DE CONSUMIDOR ELETRÔNICA'
    );

    const mensagemContingencia =
      comprovante.mensagemFiscalContingencia &&
      typeof comprovante.mensagemFiscalContingencia ===
        'object'
        ? comprovante.mensagemFiscalContingencia
        : {};

    const textoContingencia =
      contingenciaPendente
        ? [
            text(
              mensagemContingencia.linha1 ||
              'EMITIDA EM CONTINGÊNCIA'
            ),
            text(
              mensagemContingencia.linha2 ||
              'Pendente de autorização'
            )
          ]
            .filter(Boolean)
            .join('\n')
        : '';

    const avisoContingenciaTopo =
      document.getElementById(
        'fiscalReceiptContingencyTop'
      );

    if(avisoContingenciaTopo){
      avisoContingenciaTopo.textContent =
        textoContingencia;

      avisoContingenciaTopo.style.display =
        contingenciaPendente
          ? 'block'
          : 'none';
    }

    const rotuloViaContingencia =
      document.getElementById(
        'fiscalReceiptCopyLabel'
      );

    if(rotuloViaContingencia){
      rotuloViaContingencia.textContent =
        contingenciaPendente
          ? 'VIA CONSUMIDOR'
          : '';

      rotuloViaContingencia.style.display =
        contingenciaPendente
          ? 'block'
          : 'none';
    }

    setText(
      'fiscalReceiptCompany',
      emitente.nomeFantasia ||
      emitente.razaoSocial ||
      'EMITENTE'
    );

    setText(
      'fiscalReceiptCnpj',
      [
        'CNPJ:',
        formatDocument(
          emitente.cnpj,
          [
            2,
            3,
            3,
            4,
            2
          ]
        )
      ].join(
        ' '
      )
    );

    setText(
      'fiscalReceiptIe',
      [
        'IE:',
        emitente.inscricaoEstadual
      ].join(
        ' '
      )
    );

    setText(
      'fiscalReceiptAddress1',
      [
        emitente.logradouro,
        emitente.numero,
        emitente.complemento
      ]
        .filter(Boolean)
        .join(
          ', '
        )
    );

    setText(
      'fiscalReceiptAddress2',
      [
        emitente.bairro,
        [
          emitente.municipio,
          emitente.uf
        ]
          .filter(Boolean)
          .join(
            ' - '
          ),
        emitente.cep
          ? `CEP ${formatCep(
              emitente.cep
            )}`
          : ''
      ]
        .filter(Boolean)
        .join(
          ' | '
        )
    );

    renderItems(
      comprovante.itens
    );

    setText(
      'fiscalReceiptTotal',
      money(
        venda.totalValue
      )
    );

    const pagamentoFiscal =
      comprovante &&
      comprovante.pagamentoFiscal &&
      typeof comprovante.pagamentoFiscal ===
        'object' &&
      !Array.isArray(
        comprovante.pagamentoFiscal
      )
        ? comprovante.pagamentoFiscal
        : null;

    const pagamentosFiscais =
      pagamentoFiscal &&
      Array.isArray(
        pagamentoFiscal.pagamentos
      )
        ? pagamentoFiscal.pagamentos
            .filter(function(pagamento){
              return (
                pagamento &&
                typeof pagamento ===
                  'object' &&
                toNumber(
                  pagamento.valor
                ) > 0
              );
            })
        : [];

    const pagamentoFiscalDisponivel =
      Boolean(
        pagamentoFiscal &&
        pagamentoFiscal.disponivel ===
          true &&
        pagamentosFiscais.length > 0
      );

    const paymentFiscalRows =
      document.getElementById(
        'fiscalReceiptPaymentFiscalRows'
      );

    const paymentLegacyRow =
      document.getElementById(
        'fiscalReceiptPaymentLegacyRow'
      );

    if(paymentFiscalRows){
      paymentFiscalRows.textContent =
        '';

      paymentFiscalRows.style.display =
        pagamentoFiscalDisponivel
          ? 'block'
          : 'none';
    }

    if(paymentLegacyRow){
      paymentLegacyRow.style.display =
        pagamentoFiscalDisponivel
          ? 'none'
          : 'flex';
    }

    if(
      pagamentoFiscalDisponivel &&
      paymentFiscalRows
    ){
      pagamentosFiscais.forEach(
        function(pagamento){
          const linha =
            document.createElement(
              'div'
            );

          linha.className =
            'fiscal-receipt-payment-row';

          const rotulo =
            document.createElement(
              'span'
            );

          rotulo.textContent =
            text(
              pagamento.metodo ||
              pagamento.tPag ||
              'PAGAMENTO'
            ).toUpperCase();

          const valor =
            document.createElement(
              'span'
            );

          valor.textContent =
            money(
              pagamento.valor
            );

          linha.appendChild(
            rotulo
          );

          linha.appendChild(
            valor
          );

          paymentFiscalRows.appendChild(
            linha
          );
        }
      );

      const valorTroco =
        toNumber(
          pagamentoFiscal.valorTroco
        );

      if(valorTroco > 0.004){
        const linhaTroco =
          document.createElement(
            'div'
          );

        linhaTroco.className =
          'fiscal-receipt-payment-row';

        const rotuloTroco =
          document.createElement(
            'span'
          );

        rotuloTroco.textContent =
          'TROCO';

        const valorTrocoElemento =
          document.createElement(
            'span'
          );

        valorTrocoElemento.textContent =
          money(
            valorTroco
          );

        linhaTroco.appendChild(
          rotuloTroco
        );

        linhaTroco.appendChild(
          valorTrocoElemento
        );

        paymentFiscalRows.appendChild(
          linhaTroco
        );
      }
    }else{
      setText(
        'fiscalReceiptPaymentLabel',
        text(
          venda.paymentMethod ||
          'PAGAMENTO'
        ).toUpperCase()
      );

      setText(
        'fiscalReceiptPaymentValue',
        money(
          venda.totalValue
        )
      );
    }

    const tributosAproximados =
      comprovante.tributosAproximados ||
      {};

    setText(
      'fiscalReceiptTaxIcms',
      `R$ ${money(
        tributosAproximados.icms
      )}`
    );

    setText(
      'fiscalReceiptTaxPis',
      `R$ ${money(
        tributosAproximados.pis
      )}`
    );

    setText(
      'fiscalReceiptTaxCofins',
      `R$ ${money(
        tributosAproximados.cofins
      )}`
    );

    setText(
      'fiscalReceiptTaxTotal',
      `R$ ${money(
        tributosAproximados.total ??
        comprovante.valorTotalTributos
      )}`
    );

    const informacoesComplementares =
      text(
        comprovante.informacoesComplementares ||
        (
          comprovante.creditoIcms &&
          comprovante.creditoIcms.mensagem
        )
      );

    const additionalInfo =
      document.getElementById(
        'fiscalReceiptAdditionalInfo'
      );

    setText(
      'fiscalReceiptAdditionalInfoText',
      informacoesComplementares
    );

    if(additionalInfo){
      additionalInfo.style.display =
        informacoesComplementares
          ? 'block'
          : 'none';
    }


    setText(
      'fiscalReceiptDocLine',
      vendaInterna
        ? [
            'VENDA INTERNA',
            dateTime(
              venda.saleDate
            )
          ]
            .filter(Boolean)
            .join(
              ' | '
            )
        : [
            `NFC-e nº ${String(
              nfce.numeroNfce ||
              ''
            ).padStart(
              9,
              '0'
            )}`,

            `Série ${String(
              nfce.serie ||
              ''
            ).padStart(
              3,
              '0'
            )}`,

            dateTime(
              contingenciaPendente
                ? (
                    nfce.dataEmissao ||
                    venda.saleDate
                  )
                : venda.saleDate
            ),

            contingenciaPendente
              ? 'Via Consumidor'
              : ''
          ]
            .filter(Boolean)
            .join(
              ' | '
            )
    );

    const authElement =
      document.getElementById(
        'fiscalReceiptAuth'
      );

    if(authElement){
      authElement.style.display =
        contingenciaPendente ||
        vendaInterna
          ? 'none'
          : 'block';
    }

    setText(
      'fiscalReceiptAuth',
      contingenciaPendente ||
      vendaInterna
        ? ''
        : [
            'PROTOCOLO DE AUTORIZAÇÃO:',
            nfce.protocolo,
            dateTime(
              nfce.dataAutorizacao
            )
          ]
            .filter(Boolean)
            .join(
              ' '
            )
    );

    setText(
      'fiscalReceiptSaleNumber',
      venda.saleNumber
        ? `Venda: ${venda.saleNumber}`
        : ''
    );

    setText(
      'fiscalReceiptOperator',
      venda.operatorId
        ? `Operador: ${venda.operatorId}`
        : ''
    );

    setText(
      'fiscalReceiptConsultUrl',
      vendaInterna
        ? ''
        : nfce.urlConsultaChave
    );

    setText(
      'fiscalReceiptAccessKey',
      vendaInterna
        ? ''
        : formatAccessKey(
            nfce.chaveAcesso
          )
    );

    const cpfCliente =
      text(
        venda.cnpjCliente ||
        venda.cpfCliente
      ).replace(
        /\D/g,
        ''
      );

    const documentoClienteTipo =
      text(
        venda.documentoClienteTipo
      ).toUpperCase() === 'CNPJ' ||
      cpfCliente.length === 14
        ? 'CNPJ'
        : 'CPF';

    function formatarDocumentoConsumidor(valor, tipo){
      const digitos = text(valor).replace(/\D/g, '');

      if(tipo === 'CNPJ'){
        return digitos.replace(
          /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
          '$1.$2.$3/$4-$5'
        );
      }

      return formatCpf(digitos);
    }

    setText(
      'fiscalReceiptConsumer',
      cpfCliente
        ? `CONSUMIDOR ${documentoClienteTipo}: ${formatarDocumentoConsumidor(
            cpfCliente,
            documentoClienteTipo
          )}`
        : 'CONSUMIDOR NÃO IDENTIFICADO'
    );

    setText(
      'fiscalReceiptNfce',
      vendaInterna
        ? 'VENDA INTERNA — SEM VALOR FISCAL'
        : [
            `NFC-e nº ${nfce.numeroNfce}`,

            `Série ${String(
              nfce.serie ||
              ''
            ).padStart(
              3,
              '0'
            )}`
          ].join(
            ' '
          )
    );

    setText(
      'fiscalReceiptWarning',
      vendaInterna
        ? 'DOCUMENTO SEM VALOR FISCAL — VENDA INTERNA'
        : (
            contingenciaPendente
              ? textoContingencia
              : (
                  comprovante.ambiente ===
                    'HOMOLOGACAO'
                    ? 'EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO — SEM VALOR FISCAL'
                    : ''
                )
          )
    );

    if(vendaInterna){
      const qrInterno =
        document.getElementById(
          'fiscalReceiptQr'
        );

      if(qrInterno){
        qrInterno.replaceChildren();
      }

      fiscalDomain.qrUrl =
        '';
    }else{
      renderQrCode(
        nfce.urlQrCode
      );
    }
  }

  function fitReceipt(){
    cancelAnimationFrame(
      receiptFitFrame
    );

    receiptFitFrame =
      requestAnimationFrame(
        () => {
          if(
            !receiptPaper ||
            !receiptContent ||
            !overlay.classList.contains(
              'show'
            )
          ) return;

          const availableWidth =
            Math.max(
              1,
              receiptPaper.clientWidth
            );

          const availableHeight =
            Math.max(
              1,
              receiptPaper.clientHeight
            );

          receiptContent.style.transform =
            'none';

          receiptContent.style.width =
            '100%';

          let scale = 1;

          for(
            let index = 0;
            index < 4;
            index += 1
          ){
            receiptContent.style.width =
              `${100 / scale}%`;

            const naturalWidth =
              Math.max(
                1,
                receiptContent.scrollWidth
              );

            const naturalHeight =
              Math.max(
                1,
                receiptContent.scrollHeight
              );

            const nextScale =
              Math.min(
                1,
                availableWidth /
                  naturalWidth,
                availableHeight /
                  naturalHeight
              );

            if(
              !Number.isFinite(
                nextScale
              ) ||
              nextScale <= 0
            ) break;

            if(
              Math.abs(
                nextScale -
                scale
              ) <
              0.002
            ){
              scale =
                nextScale;

              break;
            }

            scale =
              nextScale;
          }

          receiptContent.style.width =
            `${100 / scale}%`;

          receiptContent.style.transform =
            `scale(${scale})`;
        }
      );
  }



  /*
   * O botão central fica dentro do iframe interno do menu
   * (__htmlStatusIframe). Por isso document.getElementById
   * no iframe principal não encontrava o botão e o ícone
   * nunca recebia o modo de segunda via.
   */
  function obterBotaoCentral(){
    try{
      const iframeMenu =
        document.getElementById(
          '__htmlStatusIframe'
        );

      const documentoMenu =
        iframeMenu &&
        (
          iframeMenu.contentDocument ||
          iframeMenu.contentWindow &&
          iframeMenu.contentWindow.document
        );

      const botaoInterno =
        documentoMenu &&
        documentoMenu.getElementById(
          'statusButton'
        );

      if(botaoInterno){
        return botaoInterno;
      }
    }catch(error){
      console.error(
        'Falha ao acessar o botão central do menu:',
        error &&
        error.message
          ? error.message
          : error
      );
    }

    /*
     * Fallback para versões em que o botão não esteja
     * encapsulado no iframe interno.
     */
    return document.getElementById(
      'statusButton'
    );
  }

  function configurarCliqueSegundaVia(
    botao
  ){
    if(
      !botao ||
      botao.dataset
        .scfWhatsappSegundaViaClique ===
        'true'
    ){
      return;
    }

    botao.dataset
      .scfWhatsappSegundaViaClique =
        'true';

    /*
     * Listener em captura diretamente no botão interno.
     * Assim ele executa antes da ação normal que abre a
     * tela inicial do menu.
     */
    botao.addEventListener(
      'click',
      function(event){
        if(
          !botao.classList.contains(
            'whatsapp-resend-mode'
          )
        ){
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        if(
          typeof event.stopImmediatePropagation ===
            'function'
        ){
          event.stopImmediatePropagation();
        }

        if(
          fiscalDomain.secondCopyPending ||
          !fiscalDomain.currentReceipt
        ){
          return;
        }

        Promise
          .resolve(
            solicitarEnvioWhatsapp(
              fiscalDomain.currentReceipt,
              {
                segundaVia:
                  true
              }
            )
          )
          .catch(
            function(){
              /* O reenvio já trata seu próprio erro visualmente. */
            }
          )
          .finally(
            function(){
              /*
               * HISTÓRICO / REENVIAR:
               * abrir a 2ª via nunca imprime sozinho. A impressão 80 mm
               * acontece somente quando o operador pressiona REENVIAR.
               */
              printingDomain.printHistory(
                fiscalDomain.currentReceipt
              );
            }
          );
      },
      true
    );
  }

  /*
   * VISUAL FORTE DO REENVIAR NO DOCK.
   * O estilo é injetado no iframe interno no momento em que o modo
   * REENVIAR é ativado. Assim ele entra por último no <head> do menu e
   * vence as regras anteriores do comprovante que deixavam o botão claro.
   */
  function aplicarVisualReenviarPreto3D(botao){
    if(!botao) return;

    try{
      const doc = botao.ownerDocument;

      if(
        doc &&
        !doc.getElementById(
          'scf-reenviar-preto3d-runtime-style'
        )
      ){
        const style =
          doc.createElement(
            'style'
          );

        style.id =
          'scf-reenviar-preto3d-runtime-style';

        style.textContent = `
          #statusButton.scf-reenviar-preto3d,
          #statusButton.scf-reenviar-preto3d:disabled{
            border:3px solid #000 !important;
            border-color:#000 !important;
            color:#fff !important;
            background:radial-gradient(
              circle at 35% 25%,
              #3b3b3b 0%,
              #232323 24%,
              #111111 55%,
              #070707 78%,
              #000000 100%
            ) !important;
            box-shadow:
              inset 0 0 10px rgba(0,0,0,.82),
              inset 0 0 6px rgba(0,0,0,.68),
              inset 7px 8px 12px rgba(255,255,255,.22),
              0 0 0 1px rgba(0,0,0,.18),
              0 4px 10px rgba(0,0,0,.30) !important;
            opacity:1 !important;
            filter:none !important;
            isolation:isolate !important;
          }

          #statusButton.scf-reenviar-preto3d::before{
            content:"" !important;
            position:absolute !important;
            left:32% !important;
            top:24% !important;
            width:72% !important;
            height:64% !important;
            opacity:.24 !important;
            transform:translate(-50%,-50%) scale(1) !important;
            border-radius:999px !important;
            background:radial-gradient(
              ellipse at center,
              rgba(255,255,255,.92) 0%,
              rgba(255,255,255,.34) 34%,
              rgba(255,255,255,.08) 64%,
              rgba(255,255,255,0) 100%
            ) !important;
            filter:blur(2px) !important;
            z-index:1 !important;
            pointer-events:none !important;
          }

          #statusButton.scf-reenviar-preto3d::after{
            color:#fff !important;
            -webkit-text-fill-color:#fff !important;
            border-left-color:#fff !important;
          }

          #statusButton.scf-reenviar-preto3d .whatsapp-resend-icon{
            display:block !important;
            visibility:visible !important;
            opacity:1 !important;
            filter:brightness(0) invert(1) !important;
            position:relative !important;
            z-index:8 !important;
          }

          #statusButton.scf-reenviar-preto3d.whatsapp-resend-loading .whatsapp-resend-icon,
          #statusButton.scf-reenviar-preto3d.nfe55-resend-loading .whatsapp-resend-icon{
            display:none !important;
          }

          #statusButton.scf-reenviar-preto3d.whatsapp-resend-loading .loading-dots,
          #statusButton.scf-reenviar-preto3d.nfe55-resend-loading .loading-dots{
            display:flex !important;
            visibility:visible !important;
            opacity:1 !important;
            position:relative !important;
            z-index:8 !important;
          }

          #statusButton.scf-reenviar-preto3d .loading-dots span{
            background:#fff !important;
          }
        `;

        doc.head.appendChild(
          style
        );
      }

      botao.classList.add(
        'scf-reenviar-preto3d'
      );

      botao.classList.remove(
        'scf-pdv-menu-inactive'
      );

      /*
       * O Histórico possui regras antigas com !important para o botão
       * central. Além da classe acima, aplica o acabamento diretamente
       * no próprio botão com prioridade important. Isso garante que o
       * REENVIAR fique preto mesmo quando o comprovante estiver aberto.
       */
      botao.style.setProperty(
        'background',
        'radial-gradient(circle at 35% 25%, #3b3b3b 0%, #232323 24%, #111111 55%, #070707 78%, #000000 100%)',
        'important'
      );

      botao.style.setProperty(
        'border-color',
        '#000',
        'important'
      );

      botao.style.setProperty(
        'color',
        '#fff',
        'important'
      );

      botao.style.setProperty(
        'box-shadow',
        'inset 0 0 10px rgba(0,0,0,.82), inset 0 0 6px rgba(0,0,0,.68), inset 7px 8px 12px rgba(255,255,255,.22), 0 0 0 1px rgba(0,0,0,.18), 0 4px 10px rgba(0,0,0,.30)',
        'important'
      );

      botao.style.setProperty(
        'opacity',
        '1',
        'important'
      );

      botao.style.setProperty(
        'filter',
        'none',
        'important'
      );

      const iconeReenviar =
        botao.querySelector(
          '.whatsapp-resend-icon'
        );

      if(iconeReenviar){
        iconeReenviar.style.setProperty(
          'filter',
          'brightness(0) invert(1)',
          'important'
        );

        iconeReenviar.style.setProperty(
          'opacity',
          '1',
          'important'
        );
      }
    }catch(error){}
  }

  function removerVisualReenviarPreto3D(botao){
    if(!botao) return;

    try{
      botao.classList.remove(
        'scf-reenviar-preto3d'
      );

      [
        'background',
        'border-color',
        'color',
        'box-shadow',
        'opacity',
        'filter'
      ].forEach(
        function(propriedade){
          botao.style.removeProperty(
            propriedade
          );
        }
      );

      const iconeReenviar =
        botao.querySelector(
          '.whatsapp-resend-icon'
        );

      if(iconeReenviar){
        iconeReenviar.style.removeProperty(
          'filter'
        );

        iconeReenviar.style.removeProperty(
          'opacity'
        );
      }
    }catch(error){}
  }

  window.scfAplicarVisualReenviarPreto3D =
    aplicarVisualReenviarPreto3D;

  window.scfRemoverVisualReenviarPreto3D =
    removerVisualReenviarPreto3D;

  function ativarBotaoSegundaVia(
    tentativa
  ){
    const botao =
      obterBotaoCentral();

    if(!botao){
      const numeroTentativa =
        Number(
          tentativa || 0
        );

      if(numeroTentativa < 20){
        window.setTimeout(
          function(){
            ativarBotaoSegundaVia(
              numeroTentativa + 1
            );
          },
          50
        );
      }

      return;
    }

    configurarCliqueSegundaVia(
      botao
    );

    botao.classList.add(
      'whatsapp-resend-mode'
    );

    aplicarVisualReenviarPreto3D(
      botao
    );

    botao.classList.remove(
      'menu-home-active'
    );

    botao.classList.remove(
      'whatsapp-resend-loading'
    );

    botao.disabled =
      false;

    botao.setAttribute(
      'aria-pressed',
      'false'
    );

    botao.setAttribute(
      'aria-label',
      'Reenviar segunda via da NFC-e pelo WhatsApp'
    );
  }

  function definirCarregamentoSegundaVia(
    carregando
  ){
    const botao =
      obterBotaoCentral();

    if(!botao) return;

    configurarCliqueSegundaVia(
      botao
    );

    botao.classList.toggle(
      'whatsapp-resend-loading',
      carregando === true
    );

    botao.disabled =
      carregando === true;
  }

  function desativarBotaoSegundaVia(
    restaurarHome
  ){
    const botao =
      obterBotaoCentral();

    if(!botao) return;

    botao.classList.remove(
      'whatsapp-resend-mode',
      'whatsapp-resend-loading'
    );

    removerVisualReenviarPreto3D(
      botao
    );

    botao.disabled =
      false;

    botao.setAttribute(
      'aria-label',
      'Emissão NFC-e'
    );

    if(
      restaurarHome ===
        true
    ){
      botao.classList.add(
        'menu-home-active'
      );

      botao.setAttribute(
        'aria-pressed',
        'true'
      );
    }
  }

  window.__scfPdvInfra.eventBus.on('scf:comprovante-historico-solicitado',
    function(event){
      fiscalDomain.historyReceiptSaleId =
        text(
          event &&
          event.detail &&
          event.detail.saleId
        );
    }
  );

  function definirStatusWhatsapp(
    mensagem,
    tipo
  ){
    if(!whatsappStatus) return;

    if(!mensagem){
      whatsappStatus.style.display =
        'none';

      whatsappStatus.textContent =
        '';

      return;
    }

    whatsappStatus.style.display =
      'block';

    whatsappStatus.textContent =
      mensagem;

    whatsappStatus.dataset.tipo =
      tipo || '';
  }

  async function gerarImagemCupomBase64(opcoesGeracao){
    const rotuloViaGeracao =
      text(
        opcoesGeracao &&
        opcoesGeracao.rotuloVia
      );

    if(
      typeof window.html2canvas !==
        'function'
    ){
      throw new Error(
        'O gerador da imagem do cupom não foi carregado.'
      );
    }

    if(!receiptContent){
      throw new Error(
        'O conteúdo do cupom não foi encontrado.'
      );
    }

    /*
     * IMPORTANTE:
     * Não alteramos mais transform/width do cupom VISÍVEL.
     *
     * O html2canvas cria um clone interno do documento. É somente nesse
     * clone que removemos a escala usada para encaixar o DANFE no card
     * direito. Assim REENVIAR/WhatsApp/impressão não provocam nenhum
     * "zoom" visual no Histórico.
     */
    const canvasOriginal =
      await window.html2canvas(
        receiptContent,
        {
          backgroundColor:
            '#fffdfa',

          scale:
            1.35,

          useCORS:
            true,

          allowTaint:
            false,

          logging:
            false,

          imageTimeout:
            10000,

          onclone:
            function(documentoClonado){
              const conteudoClonado =
                documentoClonado
                  .getElementById(
                    'fiscalReceiptContent'
                  );

              if(
                !conteudoClonado
              ){
                return;
              }

              conteudoClonado.style.setProperty(
                'transform',
                'none',
                'important'
              );

              conteudoClonado.style.setProperty(
                'width',
                '100%',
                'important'
              );

              conteudoClonado.style.setProperty(
                'will-change',
                'auto',
                'important'
              );

              conteudoClonado.style.setProperty(
                'transform-origin',
                'top left',
                'important'
              );

              if(rotuloViaGeracao){
                const rotuloViaClonado =
                  documentoClonado
                    .getElementById(
                      'fiscalReceiptCopyLabel'
                    );

                if(rotuloViaClonado){
                  rotuloViaClonado.textContent =
                    rotuloViaGeracao;

                  rotuloViaClonado.style.setProperty(
                    'display',
                    'block',
                    'important'
                  );
                }
              }
            }
        }
      );

    const larguraMaxima =
      720;

    let canvasFinal =
      canvasOriginal;

    if(
      canvasOriginal.width >
      larguraMaxima
    ){
      const proporcao =
        larguraMaxima /
        canvasOriginal.width;

      const reduzido =
        document.createElement(
          'canvas'
        );

      reduzido.width =
        larguraMaxima;

      reduzido.height =
        Math.max(
          1,
          Math.round(
            canvasOriginal.height *
            proporcao
          )
        );

      const contexto =
        reduzido.getContext(
          '2d'
        );

      if(!contexto){
        throw new Error(
          'Não foi possível preparar a imagem do cupom.'
        );
      }

      contexto.fillStyle =
        '#fffdfa';

      contexto.fillRect(
        0,
        0,
        reduzido.width,
        reduzido.height
      );

      contexto.drawImage(
        canvasOriginal,
        0,
        0,
        reduzido.width,
        reduzido.height
      );

      canvasFinal =
        reduzido;
    }

    const imagem =
      canvasFinal.toDataURL(
        'image/jpeg',
        0.74
      );

    if(
      !imagem ||
      !imagem.startsWith(
        'data:image/jpeg;base64,'
      )
    ){
      throw new Error(
        'A imagem JPEG do cupom não foi gerada.'
      );
    }

    return imagem;
  }

  /*
   * IMPRESSÃO LOCAL:
   * expõe somente o gerador da imagem do DANFE já usado pelo WhatsApp.
   * A impressão ESC/POS reutiliza esta mesma representação do cupom.
   */
  printingDomain.registerImageGenerator(
    gerarImagemCupomBase64
  );

  async function solicitarEnvioWhatsapp(
    comprovante,
    opcoes
  ){
    const segundaVia =
      Boolean(
        opcoes &&
        opcoes.segundaVia ===
          true
      );

    const saleId =
      text(
        comprovante &&
        comprovante.saleId
      );

    const whatsapp =
      text(
        comprovante &&
        comprovante.venda &&
        comprovante.venda
          .whatsappCliente
      ).replace(
        /\D/g,
        ''
      );

    if(
      !saleId ||
      !whatsapp
    ){
      definirStatusWhatsapp(
        '',
        ''
      );

      return;
    }

    if(
      segundaVia &&
      fiscalDomain.secondCopyPending
    ){
      return;
    }

    if(
      !segundaVia &&
      fiscalDomain.whatsappRequests.has(
        saleId
      )
    ){
      return;
    }

    if(segundaVia){
      fiscalDomain.secondCopyPending =
        true;

      definirCarregamentoSegundaVia(
        true
      );
    }else{
      fiscalDomain.whatsappRequests.add(
        saleId
      );
    }

    definirStatusWhatsapp(
      segundaVia
        ? 'PREPARANDO 2ª VIA PARA O WHATSAPP...'
        : 'PREPARANDO NFC-e PARA O WHATSAPP...',
      'loading'
    );

    try{
      /*
       * Aguarda o QR Code terminar de ser desenhado
       * antes de capturar o DANFE.
       */
      await new Promise(
        function(resolve){
          window.setTimeout(
            resolve,
            550
          );
        }
      );

      const imagemBase64 =
        await gerarImagemCupomBase64();

      /*
       * Cache efêmero da mesma imagem do DANFE para a impressão local.
       * Não persiste no navegador; serve apenas para o disparo imediato.
       */
      printingDomain.lastImage = {
        saleId:
          saleId,

        imagemBase64:
          imagemBase64,

        criadoEm:
          Date.now()
      };

      definirStatusWhatsapp(
        segundaVia
          ? 'ENVIANDO 2ª VIA PARA O WHATSAPP...'
          : 'ENVIANDO NFC-e PARA O WHATSAPP...',
        'loading'
      );

      window.__scfPdvInfra.shellBridge.post(
        {
          type:
            'SCF_WHATSAPP_ENVIAR_CUPOM',

          saleId,

          imagemBase64,

          segundaVia
        },
        '*'
      );
    }catch(error){
      if(segundaVia){
        fiscalDomain.secondCopyPending =
          false;

        definirCarregamentoSegundaVia(
          false
        );

        ativarBotaoSegundaVia();
      }else{
        fiscalDomain.whatsappRequests.delete(
          saleId
        );
      }

      definirStatusWhatsapp(
        segundaVia
          ? 'NÃO FOI POSSÍVEL PREPARAR A 2ª VIA PARA O WHATSAPP.'
          : 'NÃO FOI POSSÍVEL PREPARAR O ENVIO PARA O WHATSAPP.',
        'error'
      );

      console.error(
        'Falha ao preparar a imagem do cupom:',
        error &&
        error.message
          ? error.message
          : error
      );
    }
  }

  function restaurarComprovanteAoContainerOriginal(){
    overlay.classList.remove(
      'is-history-desktop-embedded'
    );

    document.body.classList.remove(
      'scf-history-receipt-desktop'
    );

    if(receiptShell){
      receiptShell.setAttribute(
        'aria-modal',
        'true'
      );
    }

    if(
      receiptOverlayOriginalParent &&
      overlay.parentNode !==
        receiptOverlayOriginalParent
    ){
      const referenciaValida =
        receiptOverlayOriginalNextSibling &&
        receiptOverlayOriginalNextSibling.parentNode ===
          receiptOverlayOriginalParent
          ? receiptOverlayOriginalNextSibling
          : null;

      receiptOverlayOriginalParent.insertBefore(
        overlay,
        referenciaValida
      );
    }
  }

  function sincronizarPosicaoComprovanteHistorico(){
    /*
     * Segurança: nunca posiciona/exibe o DANFE apenas por mudança
     * de tamanho da janela, tecla ALT ou qualquer evento visual.
     * O comprovante só pode ser incorporado quando openReceipt()
     * já recebeu um comprovante real.
     */
    if(!fiscalDomain.currentReceipt){
      restaurarComprovanteAoContainerOriginal();

      return;
    }

    const painelInlineHistorico =
      historyDomain.getReceiptFrame();

    const deveIncorporarNoHistorico =
      fiscalDomain.currentReceiptFromHistory ===
        true &&
      desktopHistoryReceiptMq.matches &&
      painelInlineHistorico &&
      painelInlineHistorico.isConnected;

    /*
     * Prioridade absoluta para o painel direito do Histórico.
     * O comprovante é colocado aqui ANTES de receber a classe show,
     * portanto nunca chega a aparecer em tela inteira.
     */
    if(deveIncorporarNoHistorico){
      if(
        overlay.parentNode !==
          painelInlineHistorico
      ){
        painelInlineHistorico.appendChild(
          overlay
        );
      }

      overlay.classList.remove(
        'is-history-desktop-embedded'
      );

      overlay.classList.add(
        'scf-history-inline-receipt'
      );

      document.body.classList.remove(
        'scf-history-receipt-desktop'
      );

      document.body.classList.add(
        'scf-history-inline-receipt-open'
      );

      if(receiptShell){
        receiptShell.setAttribute(
          'aria-modal',
          'false'
        );
      }

      return;
    }

    const deveIncorporarNoPainel =
      desktopHistoryReceiptMq.matches &&
      desktopProductPhotoFrame;

    if(!deveIncorporarNoPainel){
      restaurarComprovanteAoContainerOriginal();

      return;
    }

    if(
      overlay.parentNode !==
        desktopProductPhotoFrame
    ){
      desktopProductPhotoFrame.appendChild(
        overlay
      );
    }

    overlay.classList.remove(
      'scf-history-inline-receipt'
    );

    overlay.classList.add(
      'is-history-desktop-embedded'
    );

    document.body.classList.remove(
      'scf-history-inline-receipt-open'
    );

    document.body.classList.add(
      'scf-history-receipt-desktop'
    );

    if(receiptShell){
      receiptShell.setAttribute(
        'aria-modal',
        'false'
      );
    }
  }

  function openReceipt(comprovante){
    renderReceipt(
      comprovante
    );

    fiscalDomain.currentReceipt =
      comprovante ||
      null;

    const saleIdAtual =
      text(
        comprovante &&
        comprovante.saleId
      );

    const saleIdInlineHistorico =
      text(
        historyDomain.getPendingSaleId()
      );

    fiscalDomain.currentReceiptFromHistory =
      Boolean(
        saleIdAtual &&
        (
          fiscalDomain.historyReceiptSaleId ===
            saleIdAtual ||
          saleIdInlineHistorico ===
            saleIdAtual
        )
      );

    fiscalDomain.historyReceiptSaleId =
      '';

    /*
     * HISTÓRICO / NFC-e:
     * avisa os outros fluxos que um comprovante NFC-e acabou de assumir
     * o painel direito. Isso limpa qualquer contexto visual pendente da
     * NF-e 55 antes de montar a segunda via da NFC-e.
     */
    if(fiscalDomain.currentReceiptFromHistory){
      window.__scfPdvInfra.eventBus.dispatch(
        new CustomEvent(
          'scf:nfce-historico-aberto',
          {
            detail:{
              saleId:saleIdAtual
            }
          }
        )
      );
    }

    sincronizarPosicaoComprovanteHistorico();

    fiscalDomain.completedCardWasVisible =
      Boolean(
        (
          completedOverlay &&
          (
            completedOverlay.style.display ===
              'flex' ||
            completedOverlay.getAttribute(
              'aria-hidden'
            ) ===
              'false'
          )
        ) ||
        (
          completedPhotoPanel &&
          completedPhotoPanel.hidden === false
        )
      );

    const pendingCurrentSaleId =
      text(
        salePaymentDomain.currentReceiptPendingSaleId
      );

    const pendingCurrentSaleReceipt =
      Boolean(
        pendingCurrentSaleId &&
        (
          !saleIdAtual ||
          pendingCurrentSaleId ===
            saleIdAtual
        )
      );

    const cupomVendaAtual =
      (
        fiscalDomain.completedCardWasVisible === true ||
        pendingCurrentSaleReceipt === true
      ) &&
      fiscalDomain.currentReceiptFromHistory !== true;

    if(pendingCurrentSaleReceipt){
      /*
       * O DANFE chegou direto do AGUARDANDO VALIDAÇÃO, sem passar
       * pelo card intermediário. Mesmo assim ele continua sendo
       * o cupom da venda recém-concluída. Marcar isto explicitamente
       * garante que FECHAR dispare scf:limpar-venda-concluida.
       */
      fiscalDomain.completedCardWasVisible = true;

      salePaymentDomain.currentReceiptPendingSaleId =
        '';

      const waitingOverlay =
        document.getElementById(
          'saleValidationWaitingOverlay'
        );

      if(waitingOverlay){
        waitingOverlay.style.display =
          'none';

        waitingOverlay.setAttribute(
          'aria-hidden',
          'true'
        );
      }

      const waitingFrame =
        document.getElementById(
          'fiscalDesktopProductPhoto'
        );

      if(waitingFrame){
        waitingFrame.classList.remove(
          'is-validation-waiting-open'
        );
      }

      document.body.classList.remove(
        'sale-validation-waiting-open'
      );
    }

    document.body.classList.toggle(
      'scf-current-sale-receipt-open',
      cupomVendaAtual
    );

    if(cupomVendaAtual){
      /*
       * O X é removido fisicamente durante o cupom da venda atual.
       * O FECHAR do rodapé passa a ser a única ação de saída.
       */
      removerXComprovanteAtual();
    }else{
      restaurarXComprovante();
    }

    if(completedOverlay){
      completedOverlay.style.display =
        'none';

      completedOverlay.setAttribute(
        'aria-hidden',
        'true'
      );
    }

    if(completedPhotoPanel){
      completedPhotoPanel.hidden = true;
    }

    if(desktopProductPhotoFrame){
      desktopProductPhotoFrame.classList.remove(
        'is-sale-completed-open'
      );
    }

    document.body.classList.remove(
      'sale-completed-card-open'
    );

    overlay.classList.add(
      'show'
    );

    overlay.setAttribute(
      'aria-hidden',
      'false'
    );

    document.body.classList.add(
      'fiscal-receipt-open'
    );

    requestAnimationFrame(
      () =>
        requestAnimationFrame(
          fitReceipt
        )
    );

    const comprovanteVendaInterna =
      Boolean(
        comprovante &&
        comprovante.vendaInterna ===
          true
      );

    /*
     * VENDA INTERNA:
     * - usa exatamente o mesmo papel/gerador de imagem da NFC-e;
     * - não solicita WhatsApp fiscal;
     * - não consulta SEFAZ;
     * - não possui QR Code/chave/protocolo;
     * - imprime localmente a imagem do comprovante não fiscal.
     */
    if(comprovanteVendaInterna){
      desativarBotaoSegundaVia(
        false
      );

      definirStatusWhatsapp(
        '',
        ''
      );

      /*
       * VENDA INTERNA:
       * dispara a impressão junto com a renderização do comprovante.
       * Sem atraso artificial de 200 ms; aguardamos apenas o próximo
       * ciclo visual para o cupom aparecer na tela e a impressão partir
       * praticamente ao mesmo tempo.
       */
      window.requestAnimationFrame(
        function(){
          window.requestAnimationFrame(
            function(){
              printingDomain.printCurrent(
                comprovante
              );
            }
          );
        }
      );

      return;
    }

    const comprovanteEmContingencia =
      Boolean(
        comprovante &&
        comprovante.autorizado ===
          false &&
        comprovante.contingenciaOffline ===
          true &&
        comprovante.pendenteTransmissao ===
          true &&
        Number(
          comprovante.tipoEmissao ||
          comprovante.nfce &&
          comprovante.nfce.tipoEmissao ||
          0
        ) === 9
      );

    /*
     * NFC-e EM CONTINGÊNCIA:
     * neste passo o DANFE é aberto para conferência, mas não é tratado
     * como comprovante autorizado. Portanto não dispara WhatsApp,
     * segunda via nem impressão automática do fluxo normal.
     */
    if(comprovanteEmContingencia){
      desativarBotaoSegundaVia(
        false
      );

      definirStatusWhatsapp(
        '',
        ''
      );

      /*
       * CONTINGÊNCIA OFFLINE:
       * imprime automaticamente duas vias do DANFE completo:
       * - VIA CONSUMIDOR;
       * - VIA ESTABELECIMENTO.
       *
       * O fluxo específico força a impressão por imagem para preservar
       * exatamente as duas mensagens de contingência e o QR Code offline.
       * Não dispara WhatsApp e não trata o documento como autorizado.
       */
      window.setTimeout(
        function(){
          printingDomain.printContingency(
            comprovante
          );
        },
        250
      );

      return;
    }

    const whatsapp =
      text(
        comprovante &&
        comprovante.venda &&
        comprovante.venda
          .whatsappCliente
      ).replace(
        /\D/g,
        ''
      );

    const whatsappStatusAtual =
      text(
        comprovante &&
        comprovante.venda &&
        comprovante.venda
          .whatsappCupomStatus
      ).toUpperCase();

    /*
     * HISTÓRICO / 2ª VIA:
     * abrir um comprovante já autorizado nunca dispara um novo envio
     * automaticamente. O botão central precisa assumir REENVIAR
     * imediatamente, inclusive após um novo login/perfil CAIXA/SUPERVISOR.
     */
    if(
      fiscalDomain.currentReceiptFromHistory
    ){
      if(
        whatsapp &&
        whatsappStatusAtual ===
          'ENVIADO'
      ){
        fiscalDomain.whatsappRequests.add(
          saleIdAtual
        );

        definirStatusWhatsapp(
          'NFC-e ENVIADO PARA O WHATSAPP',
          'success'
        );
      }else{
        definirStatusWhatsapp(
          'NFC-e AUTORIZADA — USE REENVIAR PARA NOVA VIA',
          'success'
        );
      }

      ativarBotaoSegundaVia();

      /*
       * O menu inferior é um iframe separado e pode terminar de aplicar
       * o perfil alguns milissegundos depois da abertura do cupom.
       * Reaplica somente o estado visual REENVIAR enquanto o comprovante
       * continuar aberto; não navega e não retransmite nada.
       */
      [120, 350, 800, 1500].forEach(
        function(atraso){
          window.setTimeout(
            function(){
              if(
                fiscalDomain.currentReceiptFromHistory ===
                  true &&
                overlay.classList.contains(
                  'show'
                )
              ){
                ativarBotaoSegundaVia();
              }
            },
            atraso
          );
        }
      );

      return;
    }

    desativarBotaoSegundaVia(
      false
    );

    definirStatusWhatsapp(
      '',
      ''
    );

    const envioWhatsappAtual =
      solicitarEnvioWhatsapp(
        comprovante
      );

    /*
     * VENDA ATUAL / NFC-e AUTORIZADA:
     * a impressao automatica usa exatamente o mesmo DANFE que acabou
     * de ser preparado para o WhatsApp. A Promise resolve assim que a
     * imagem foi capturada e o pedido de envio foi despachado ao Wix;
     * portanto o QR Code ja esta desenhado antes de chamar window.print().
     * Historico/2a via sai antes deste ponto e nunca imprime sozinho.
     */
    Promise
      .resolve(
        envioWhatsappAtual
      )
      .catch(
        function(){
          /* Mesmo se o WhatsApp falhar, a via local continua imprimivel. */
        }
      )
      .finally(
        function(){
          printingDomain.printCurrent(
            comprovante
          );
        }
      );
  }

  function closeReceipt(){
    const cupomDaVendaConcluida =
      fiscalDomain.completedCardWasVisible ===
        true;

    const cupomAbertoPeloHistorico =
      fiscalDomain.currentReceiptFromHistory ===
        true ||
      overlay.classList.contains(
        'scf-history-inline-receipt'
      ) ||
      document.body.classList.contains(
        'scf-history-inline-receipt-open'
      );

    overlay.classList.remove(
      'show'
    );

    overlay.setAttribute(
      'aria-hidden',
      'true'
    );

    document.body.classList.remove(
      'fiscal-receipt-open',
      'scf-current-sale-receipt-open'
    );

    restaurarComprovanteAoContainerOriginal();

    fiscalDomain.completedCardWasVisible =
      false;

    fiscalDomain.currentReceipt =
      null;

    fiscalDomain.currentReceiptFromHistory =
      false;

    fiscalDomain.secondCopyPending =
      false;

    desativarBotaoSegundaVia(
      cupomAbertoPeloHistorico
        ? false
        : true
    );

    if(cupomAbertoPeloHistorico){
      window.__scfPdvInfra.eventBus.dispatch(
        new CustomEvent(
          'scf:cupom-historico-fechado'
        )
      );
    }

    /*
     * O cupom foi aberto automaticamente após a
     * autorização da venda atual.
     *
     * Ao fechar pelo X, não voltamos ao card da
     * última venda: iniciamos uma nova venda limpa.
     */
    if(
      cupomDaVendaConcluida
    ){
      if(completedOverlay){
        completedOverlay.style.display =
          'none';

        completedOverlay.setAttribute(
          'aria-hidden',
          'true'
        );
      }

      if(completedPhotoPanel){
        completedPhotoPanel.hidden = true;
      }

      if(desktopProductPhotoFrame){
        desktopProductPhotoFrame.classList.remove(
          'is-sale-completed-open'
        );
      }

      document.body.classList.remove(
        'sale-completed-card-open'
      );

      window.__scfPdvInfra.eventBus.dispatch(
        new CustomEvent(
          'scf:limpar-venda-concluida'
        )
      );

      return;
    }

    /*
     * Cupom aberto pelo Histórico de Vendas:
     * apenas fecha o DANFE, sem limpar a venda que
     * estiver sendo digitada na tela principal.
     */
  }

  /*
   * Ponte usada pelo FECHAR do rodapé do cupom autorizado.
   * Fica no MESMO escopo onde closeReceipt realmente existe.
   */
  fiscalDomain.registerReceiptCloser(
    closeReceipt
  );

  window.scfCloseCurrentFiscalReceipt =
    function(){
      return fiscalDomain.closeReceipt();
    };

  window.__scfPdvInfra.shellBridge.onMessage(
    function(event){
      const data =
        event &&
        event.data &&
        typeof event.data ===
          'object'
          ? event.data
          : null;

      if(!data) return;

      if(
        data.type ===
          'SCF_WHATSAPP_CUPOM_RESULTADO'
      ){
        const saleId =
          text(
            data.saleId
          );

        const segundaVia =
          Boolean(
            data.resultado &&
            data.resultado.segundaVia ===
              true
          );

        if(segundaVia){
          fiscalDomain.secondCopyPending =
            false;

          definirCarregamentoSegundaVia(
            false
          );

          ativarBotaoSegundaVia();

          definirStatusWhatsapp(
            '2ª VIA - NFC-e ENVIADO PARA O WHATSAPP',
            'success'
          );
        }else{
          definirStatusWhatsapp(
            data.resultado &&
            data.resultado.duplicated ===
              true
              ? 'NFC-e JÁ ENVIADO PARA O WHATSAPP'
              : 'NFC-e ENVIADO PARA O WHATSAPP',
            'success'
          );

          if(
            fiscalDomain.currentReceiptFromHistory
          ){
            ativarBotaoSegundaVia();
          }
        }

        if(saleId){
          fiscalDomain.whatsappRequests.add(
            saleId
          );
        }

        return;
      }

      if(
        data.type ===
          'SCF_WHATSAPP_CUPOM_ERRO'
      ){
        const saleId =
          text(
            data.saleId
          );

        const segundaVia =
          data.segundaVia ===
            true;

        if(segundaVia){
          fiscalDomain.secondCopyPending =
            false;

          definirCarregamentoSegundaVia(
            false
          );

          ativarBotaoSegundaVia();
        }else if(saleId){
          fiscalDomain.whatsappRequests.delete(
            saleId
          );
        }

        const detalheErro =
          text(
            data.mensagem
          ) ||
          'Erro não informado pelo backend.';

        definirStatusWhatsapp(
          `ERRO WHATSAPP: ${detalheErro}`,
          'error'
        );

        console.error(
          'Falha no envio do cupom por WhatsApp:',
          detalheErro
        );

        return;
      }

      if(
        data.type ===
          'SCF_NFCE_COMPROVANTE_CONTINGENCIA_ERRO'
      ){
        console.error(
          'Falha ao carregar o DANFE da NFC-e em contingência:',
          text(
            data.mensagem
          ) ||
          'Erro sem detalhe público.'
        );

        return;
      }

      if(
        data.type !==
          'SCF_NFCE_COMPROVANTE_AUTORIZADO' &&
        data.type !==
          'SCF_NFCE_COMPROVANTE_CONTINGENCIA'
      ) return;

      try{
        openReceipt(
          data.comprovante
        );
      }catch(error){
        console.error(
          data.type ===
            'SCF_NFCE_COMPROVANTE_CONTINGENCIA'
            ? 'Falha ao abrir o DANFE da NFC-e em contingência:'
            : 'Falha ao abrir o comprovante autorizado:',
          error &&
          error.message
            ? error.message
            : error
        );
      }
    }
  );

  window.__scfPdvInfra.eventBus.on('scf:emitir-cupom-fiscal',
    function(event){
      const detail =
        event &&
        event.detail;

      if(
        detail &&
        detail.success ===
          true &&
        (
          detail.autorizado ===
            true ||
          detail.vendaInterna ===
            true
        )
      ){
        openReceipt(
          detail
        );
      }
    }
  );

  if(closeButton){
    closeButton.addEventListener(
      'click',
      closeReceipt
    );
  }

  overlay.addEventListener(
    'click',
    function(event){
      if(
        event.target ===
          overlay
      ){
        closeReceipt();
      }
    }
  );

  document.addEventListener(
    'keydown',
    function(event){
      if(
        event.key ===
          'Escape' &&
        overlay.getAttribute(
          'aria-hidden'
        ) ===
          'false'
      ){
        closeReceipt();
      }
    }
  );

  function atualizarLayoutComprovanteResponsivo(){
    sincronizarPosicaoComprovanteHistorico();

    requestAnimationFrame(
      fitReceipt
    );
  }

  if(
    typeof desktopHistoryReceiptMq.addEventListener ===
      'function'
  ){
    desktopHistoryReceiptMq.addEventListener(
      'change',
      atualizarLayoutComprovanteResponsivo
    );
  }else if(
    typeof desktopHistoryReceiptMq.addListener ===
      'function'
  ){
    desktopHistoryReceiptMq.addListener(
      atualizarLayoutComprovanteResponsivo
    );
  }

  /*
   * Não escuta resize da janela. Em alguns shells desktop, pressionar ALT
   * altera temporariamente a área útil e dispara resize; isso não deve ter
   * qualquer efeito sobre o cupom fiscal.
   */
})();
