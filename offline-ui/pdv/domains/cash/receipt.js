(function(){
  'use strict';

  const cashDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.cash;

  if(!cashDomain){
    throw new Error(
      'PDV cash domain indisponivel.'
    );
  }

  function requireFinanceDomain(){
    const financeDomain =
      window.__scfPdvDomains &&
      window.__scfPdvDomains.finance;

    if(!financeDomain){
      throw new Error(
        'PDV finance domain indisponivel para cash.'
      );
    }

    return financeDomain;
  }

  const overlay =
    document.getElementById(
      'scfCashReceiptOverlay'
    );

  const title =
    document.getElementById(
      'scfCashReceiptTitle'
    );

  const rowsHost =
    document.getElementById(
      'scfCashReceiptRows'
    );

  const closeButton =
    document.getElementById(
      'scfCashReceiptClose'
    );

  const doneButton =
    document.getElementById(
      'scfCashReceiptDone'
    );

  const printButton =
    document.getElementById(
      'scfCashReceiptPrint'
    );

  const desktopReceiptMq =
    window.matchMedia(
      '(min-width:1001px)'
    );

  const desktopProductPhotoFrame =
    document.querySelector(
      '#fiscalDesktopProductPhoto .fiscal-desktop-product-photo-frame'
    );

  const overlayOriginalParent =
    overlay?.parentNode ||
    null;

  const overlayOriginalNextSibling =
    overlay?.nextSibling ||
    null;

  if(
    !overlay ||
    !title ||
    !rowsHost
  ){
    return;
  }

  let movimentoPendente =
    null;

  /*
   * Nova saída cadastrada pelo FINANCEIRO usa o mesmo objeto pendente
   * da SANGRIA. Assim o cache local do Financeiro é atualizado antes
   * da própria tela redesenhar a tabela após a confirmação do backend.
   */
  window.__scfPdvInfra.eventBus.on('scf:financeiro-saida-cadastrar',
    function(event){
      const dados =
        event &&
        event.detail &&
        typeof event.detail === 'object'
          ? event.detail
          : null;

      if(
        !dados ||
        dados.__scfAceitoCaixa !==
          true
      ){
        return;
      }

      movimentoPendente = {
        tipo:
          'SANGRIA',
        valor:
          dados.valor,
        motivo:
          texto(
            dados.motivo
          ).toLocaleUpperCase(
            'pt-BR'
          ),
        fornecedorNome:
          texto(
            dados.fornecedorNome
          ).toLocaleUpperCase(
            'pt-BR'
          ),
        descricao:
          texto(
            dados.descricao
          ).toLocaleUpperCase(
            'pt-BR'
          ),
        vencimento:
          texto(
            dados.vencimento
          ),
        saldoAntes:
          lerTexto(
            'scfCashMetricExpected'
          ),
        origemFinanceiro:
          true
      };
    }
  );

  let fechamentoPendente =
    null;

  let impressaoAutomaticaPendente =
    0;

  let reciboAtualParaImpressao =
    null;

  /*
   * PASSO 51 — comprovantes de caixa usam a mesma ponte TOP já utilizada
   * pelo cupom fiscal no Electron. Não dependemos mais do userAgent do iframe,
   * que pode ser mascarado pelo HTML Component do Wix.
   */
  const TIPO_IMPRESSAO_LOCAL =
    'SCF_EFISCO_IMPRIMIR_NFCE_LOCAL';

  const TIPO_IMPRESSAO_LOCAL_RESULTADO =
    'SCF_EFISCO_IMPRIMIR_NFCE_LOCAL_RESULT';

  const impressoesCaixaPendentes =
    new Map();

  function texto(
    value
  ){
    return String(
      value ?? ''
    )
      .replace(
        /\s+/g,
        ' '
      )
      .trim();
  }

  function lerTexto(
    id
  ){
    return texto(
      document
        .getElementById(
          id
        )
        ?.textContent
    );
  }

  function lerValor(
    id
  ){
    return texto(
      document
        .getElementById(
          id
        )
        ?.value
    );
  }

  function moeda(
    value
  ){
    const numero =
      Number(
        value
      );

    if(
      !Number.isFinite(
        numero
      )
    ){
      return '';
    }

    return new Intl.NumberFormat(
      'pt-BR',
      {
        style:
          'currency',
        currency:
          'BRL'
      }
    ).format(
      numero
    );
  }

  function numeroMoedaTexto(
    value
  ){
    let raw =
      texto(
        value
      )
        .replace(
          /R\$/gi,
          ''
        )
        .replace(
          /\s+/g,
          ''
        );

    if(
      !raw
    ){
      return NaN;
    }

    if(
      raw.includes(
        ','
      )
    ){
      raw =
        raw
          .replace(
            /\./g,
            ''
          )
          .replace(
            ',',
            '.'
          );
    }

    const numero =
      Number(
        raw
      );

    return Number.isFinite(
      numero
    )
      ? numero
      : NaN;
  }

  function moedaTexto(
    value
  ){
    const numero =
      numeroMoedaTexto(
        value
      );

    return Number.isFinite(
      numero
    )
      ? moeda(
          numero
        )
      : texto(
          value
        );
  }

  function dataHora(
    value
  ){
    let data =
      null;

    if(
      value instanceof
        Date
    ){
      data =
        value;
    }else if(
      value
    ){
      const parsed =
        new Date(
          value
        );

      if(
        !Number.isNaN(
          parsed.getTime()
        )
      ){
        data =
          parsed;
      }
    }

    if(
      !data
    ){
      data =
        new Date();
    }

    try{
      return data.toLocaleString(
        'pt-BR',
        {
          day:
            '2-digit',
          month:
            '2-digit',
          year:
            'numeric',
          hour:
            '2-digit',
          minute:
            '2-digit',
          second:
            '2-digit'
        }
      );
    }catch(error){
      return data.toLocaleString(
        'pt-BR'
      );
    }
  }

  function resumoAbertura(){
    const meta =
      lerTexto(
        'scfCashOpenedMeta'
      );

    if(
      !meta
    ){
      return '';
    }

    const primeiraParte =
      meta
        .split(
          '•'
        )[0]
        .trim();

    return primeiraParte
      .replace(
        /^ABERTO EM\s+/i,
        ''
      )
      .trim();
  }

  function restaurarPosicaoRecibo(){
    overlay.classList.remove(
      'scf-cash-receipt-embedded'
    );

    if(
      overlayOriginalParent &&
      overlay.parentNode !==
        overlayOriginalParent
    ){
      const referenciaValida =
        overlayOriginalNextSibling &&
        overlayOriginalNextSibling.parentNode ===
          overlayOriginalParent
          ? overlayOriginalNextSibling
          : null;

      overlayOriginalParent.insertBefore(
        overlay,
        referenciaValida
      );
    }
  }

  function posicionarRecibo(){
    if(
      desktopReceiptMq.matches &&
      desktopProductPhotoFrame
    ){
      if(
        overlay.parentNode !==
          desktopProductPhotoFrame
      ){
        desktopProductPhotoFrame.appendChild(
          overlay
        );
      }

      overlay.classList.add(
        'scf-cash-receipt-embedded'
      );

      return;
    }

    restaurarPosicaoRecibo();
  }

  function adicionarLinha(
    label,
    value,
    full = false
  ){
    const valor =
      texto(
        value
      );

    if(
      !valor
    ){
      return;
    }

    const row =
      document.createElement(
        'div'
      );

    row.className =
      'scf-cash-receipt-row' +
      (
        full
          ? ' full'
          : ''
      );

    const labelNode =
      document.createElement(
        'span'
      );

    labelNode.textContent =
      texto(
        label
      );

    const valueNode =
      document.createElement(
        'strong'
      );

    valueNode.textContent =
      valor;

    row.append(
      labelNode,
      valueNode
    );

    rowsHost.appendChild(
      row
    );
  }

  function fecharRecibo(){
    if(
      impressaoAutomaticaPendente
    ){
      window.clearTimeout(
        impressaoAutomaticaPendente
      );

      impressaoAutomaticaPendente =
        0;
    }

    for(
      const pendente
      of impressoesCaixaPendentes.values()
    ){
      if(
        pendente &&
        pendente.fallbackTimer
      ){
        window.clearTimeout(
          pendente.fallbackTimer
        );
      }
    }

    impressoesCaixaPendentes.clear();

    overlay.classList.remove(
      'show'
    );

    overlay.setAttribute(
      'aria-hidden',
      'true'
    );

    document.body.classList.remove(
      'scf-cash-receipt-open',
      'scf-cash-receipt-closing-term'
    );

    const botaoFecharCaixa =
      document.getElementById(
        'scfCashBeginCloseButton'
      );

    if(botaoFecharCaixa){
      botaoFecharCaixa.style.removeProperty(
        'display'
      );
      botaoFecharCaixa.style.removeProperty(
        'visibility'
      );
      botaoFecharCaixa.style.removeProperty(
        'opacity'
      );
      botaoFecharCaixa.style.removeProperty(
        'pointer-events'
      );
    }

    restaurarPosicaoRecibo();

    reciboAtualParaImpressao =
      null;
  }

  /*
   * Ponte interna para o atalho F7 | VOLTAR do caixa fechar o comprovante
   * usando a rotina canônica antes de retornar ao PDV.
   */
  cashDomain.setReceiptCloser(
    fecharRecibo
  );

  function estaNoAppElectron(){
    return /E-FISCO-ELECTRON\//i.test(
      String(
        navigator.userAgent ||
        ''
      )
    );
  }

  function idImpressaoNovo(){
    return (
      'cash-' +
      Date.now().toString(36) +
      '-' +
      Math.random()
        .toString(36)
        .slice(2)
    );
  }

  function origemDoRecibo(
    tituloRecibo
  ){
    const tituloNormalizado =
      texto(
        tituloRecibo
      )
        .toUpperCase();

    if(
      tituloNormalizado.includes(
        'SANGRIA'
      )
    ){
      return 'CAIXA_SANGRIA';
    }

    if(
      tituloNormalizado.includes(
        'SUPRIMENTO'
      )
    ){
      return 'CAIXA_SUPRIMENTO';
    }

    return 'CAIXA_FECHAMENTO';
  }

  function chaveDoRecibo(
    rows
  ){
    const lista =
      Array.isArray(
        rows
      )
        ? rows
        : [];

    const itemId =
      lista.find(
        function(item){
          const label =
            texto(
              item &&
              item.label
            )
              .toUpperCase();

          return (
            label ===
              'ID MOVIMENTO' ||
            label ===
              'ID SESSÃO'
          );
        }
      );

    return texto(
      itemId &&
      itemId.value
    );
  }

  function enviarReciboParaElectron(){
    if(
      !reciboAtualParaImpressao
    ){
      return false;
    }

    const requestId =
      idImpressaoNovo();

    const rows =
      reciboAtualParaImpressao.rows
        .map(
          function(item){
            return {
              label:
                texto(
                  item &&
                  item.label
                ),
              value:
                texto(
                  item &&
                  item.value
                ),
              full:
                Boolean(
                  item &&
                  item.full ===
                    true
                )
            };
          }
        )
        .filter(
          function(item){
            return Boolean(
              item.label ||
              item.value
            );
          }
        );

    const payload = {
      nativeReceipt:{
        receiptKind:
          'CAIXA',
        title:
          reciboAtualParaImpressao.titulo,
        rows,
        signature:
          'ASSINATURA DO OPERADOR'
      },

      imageBase64:
        '',

      origem:
        origemDoRecibo(
          reciboAtualParaImpressao.titulo
        ),

      saleId:
        chaveDoRecibo(
          rows
        ) ||
        requestId
    };

    /*
     * O Electron injeta na janela principal exatamente a mesma ponte que
     * já encaminha a NFC-e para efiscoDesktop.printNfce80().
     *
     * Enviamos para window.top porque o HTML Component do Wix pode mascarar
     * o userAgent dentro do iframe. Se estivermos no Electron, a ponte devolve
     * SCF_EFISCO_IMPRIMIR_NFCE_LOCAL_RESULT e cancelamos qualquer fallback.
     *
     * Em navegador comum não existe essa ponte; após alguns segundos mantemos
     * o window.print() antigo como fallback.
     */
    const destino =
      window.top ||
      window.parent;

    const fallbackTimer =
      window.setTimeout(
        function(){
          if(
            !impressoesCaixaPendentes.has(
              requestId
            )
          ){
            return;
          }

          impressoesCaixaPendentes.delete(
            requestId
          );

          try{
            window.focus();
          }catch(error){}

          try{
            window.print();
          }catch(error){
            console.warn(
              'SCF Caixa — não foi possível abrir a impressão do comprovante:',
              error?.message ||
                error
            );
          }
        },
        8000
      );

    impressoesCaixaPendentes.set(
      requestId,
      {
        fallbackTimer
      }
    );

    try{
      destino.postMessage(
        {
          type:
            TIPO_IMPRESSAO_LOCAL,

          requestId,

          payload
        },
        '*'
      );

      return true;
    }catch(error){
      window.clearTimeout(
        fallbackTimer
      );

      impressoesCaixaPendentes.delete(
        requestId
      );

      console.warn(
        'SCF Caixa — falha ao encaminhar comprovante ao Electron:',
        error?.message ||
          error
      );

      return false;
    }
  }

  function imprimirRecibo(){
    if(
      enviarReciboParaElectron()
    ){
      return;
    }

    try{
      window.focus();
    }catch(error){}

    try{
      window.print();
    }catch(error){
      console.warn(
        'SCF Caixa — não foi possível abrir a impressão do comprovante:',
        error?.message ||
          error
      );
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
        data.type !==
          TIPO_IMPRESSAO_LOCAL_RESULTADO
      ){
        return;
      }

      const requestId =
        texto(
          data.requestId
        );

      if(
        !requestId ||
        !impressoesCaixaPendentes.has(
          requestId
        )
      ){
        return;
      }

      const pendente =
        impressoesCaixaPendentes.get(
          requestId
        );

      if(
        pendente &&
        pendente.fallbackTimer
      ){
        window.clearTimeout(
          pendente.fallbackTimer
        );
      }

      impressoesCaixaPendentes.delete(
        requestId
      );

      if(
        data.resultado &&
        data.resultado.ok ===
          true
      ){
        console.info(
          'SCF Caixa — comprovante enviado silenciosamente para IMPRESSORA FISCAL.'
        );

        return;
      }

      /*
       * Se o Electron respondeu, sabemos que estamos dentro do app.
       * Portanto NÃO abrimos a janela de impressão do Windows em caso de erro;
       * mantemos o comprovante visível e registramos o erro para diagnóstico.
       */
      console.error(
        'SCF Caixa — Electron retornou erro na impressão térmica:',
        data.resultado &&
        data.resultado.error
          ? data.resultado.error
          : 'Erro não informado.'
      );
    },
    false
  );

  function mostrarRecibo(
    titulo,
    rows
  ){
    fecharRecibo();

    title.textContent =
      titulo;

    rowsHost.innerHTML =
      '';

    (
      Array.isArray(
        rows
      )
        ? rows
        : []
    ).forEach(
      function(item){
        adicionarLinha(
          item.label,
          item.value,
          item.full ===
            true
        );
      }
    );

    posicionarRecibo();

    overlay.classList.add(
      'show'
    );

    overlay.setAttribute(
      'aria-hidden',
      'false'
    );

    document.body.classList.add(
      'scf-cash-receipt-open'
    );

    document.body.classList.toggle(
      'scf-cash-receipt-closing-term',
      texto(
        titulo
      ).toUpperCase() ===
        'TERMO FECHAMENTO DE CAIXA'
    );

    atualizarAtalhoCaixaVisual();
    atualizarAtalhoSangria();

    const botaoFecharCaixa =
      document.getElementById(
        'scfCashBeginCloseButton'
      );

    if(botaoFecharCaixa){
      botaoFecharCaixa.style.setProperty(
        'display',
        'none',
        'important'
      );
      botaoFecharCaixa.style.setProperty(
        'visibility',
        'hidden',
        'important'
      );
      botaoFecharCaixa.style.setProperty(
        'opacity',
        '0',
        'important'
      );
      botaoFecharCaixa.style.setProperty(
        'pointer-events',
        'none',
        'important'
      );
    }

    reciboAtualParaImpressao = {
      titulo:
        texto(
          titulo
        ),
      rows:
        (
          Array.isArray(
            rows
          )
            ? rows
            : []
        ).map(
          function(item){
            return {
              label:
                texto(
                  item &&
                  item.label
                ),
              value:
                texto(
                  item &&
                  item.value
                ),
              full:
                Boolean(
                  item &&
                  item.full ===
                    true
                )
            };
          }
        )
    };

    /*
     * PASSO 51:
     * tenta primeiro a mesma ponte TOP usada pela NFC-e no Electron.
     * O fallback window.print() fica interno ao envio e só é liberado
     * se nenhuma ponte Electron responder em 8 segundos.
     */
    impressaoAutomaticaPendente =
      window.setTimeout(
        function(){
          impressaoAutomaticaPendente =
            0;

          imprimirRecibo();
        },
        220
      );
  }

  function tituloMovimento(
    tipo
  ){
    return tipo ===
      'SUPRIMENTO'
      ? 'COMPROVANTE SUPRIMENTO'
      : 'COMPROVANTE SANGRIA';
  }

  function operadorMovimento(
    mensagem
  ){
    return texto(
      mensagem?.movimento?.operadorNome ||
      mensagem?.movimento?.nomeOperador ||
      mensagem?.operadorNome ||
      mensagem?.nomeOperador ||
      mensagem?.movimento?.operadorId ||
      mensagem?.movimento?.operador ||
      mensagem?.operadorId ||
      mensagem?.operador ||
      ''
    );
  }

  function idMovimento(
    mensagem
  ){
    return texto(
      mensagem?.movimento?.id ||
      mensagem?.movimento?._id ||
      mensagem?.movimentoId ||
      ''
    );
  }

  function momentoMovimento(
    mensagem
  ){
    return (
      mensagem?.movimento?.criadoEm ||
      mensagem?.movimento?._createdDate ||
      mensagem?.movimento?.createdAt ||
      mensagem?.criadoEm ||
      null
    );
  }

  function operadorFechamento(
    caixa,
    mensagem
  ){
    return texto(
      caixa?.operadorFechamentoNome ||
      caixa?.operadorNome ||
      mensagem?.operadorNome ||
      mensagem?.nomeOperador ||
      caixa?.operadorFechamentoId ||
      caixa?.operadorId ||
      caixa?.fechadoPor ||
      mensagem?.operadorId ||
      mensagem?.operador ||
      ''
    );
  }

  document
    .getElementById(
      'scfCashMovementConfirmButton'
    )
    ?.addEventListener(
      'click',
      function(){
        const tipoTela =
          lerTexto(
            'scfCashPhotoTitle'
          )
            .toUpperCase();

        const tipo =
          tipoTela ===
            'ENTRADA'
            ? 'SUPRIMENTO'
            : tipoTela;

        if(
          tipo !==
            'SANGRIA' &&
          tipo !==
            'SUPRIMENTO'
        ){
          return;
        }

        const fornecedorSelect =
          document.getElementById(
            'scfCashMovementSupplier'
          );

        const fornecedorNome =
          fornecedorSelect &&
          fornecedorSelect.selectedIndex >=
            0
            ? texto(
                fornecedorSelect
                  .options[
                    fornecedorSelect.selectedIndex
                  ]
                  ?.dataset
                  ?.scfFornecedorNome ||
                ''
              )
            : '';

        movimentoPendente = {
          tipo,
          valor:
            lerValor(
              'scfCashMovementAmount'
            ),
          motivo:
            lerValor(
              'scfCashMovementReason'
            ),
          fornecedorNome,
          descricao:
            lerValor(
              'scfCashMovementDescription'
            ),
          saldoAntes:
            lerTexto(
              'scfCashMetricExpected'
            )
        };
      }
    );

  document
    .getElementById(
      'scfCashCloseConfirm'
    )
    ?.addEventListener(
      'click',
      function(){
        fechamentoPendente = {
          abertoEm:
            resumoAbertura(),
          saldoInicial:
            lerTexto(
              'scfCashMetricInitial'
            ),
          vendasDinheiro:
            lerTexto(
              'scfCashMetricCashSales'
            ),
          sangrias:
            lerTexto(
              'scfCashMetricWithdrawals'
            ),
          suprimentos:
            lerTexto(
              'scfCashMetricSupplies'
            ),
          saldoEsperado:
            lerTexto(
              'scfCashCloseExpected'
            ) ||
            lerTexto(
              'scfCashMetricExpected'
            ),
          saldoContado:
            lerValor(
              'scfCashCountedAmount'
            ),
          diferenca:
            lerTexto(
              'scfCashCloseDifference'
            ),
          observacao:
            lerValor(
              'scfCashClosingNote'
            )
        };
      }
    );

  window.__scfPdvInfra.shellBridge.onMessage(
    function(event){
      const mensagem =
        event &&
        event.data &&
        typeof event.data ===
          'object'
          ? event.data
          : null;

      if(
        !mensagem
      ){
        return;
      }

      if(
        mensagem.type ===
          'SCF_CAIXA_MOVIMENTO_REGISTRADO' &&
        movimentoPendente
      ){
        const pendente =
          movimentoPendente;

        movimentoPendente =
          null;

        const valorPersistido =
          mensagem?.movimento?.valor;

        const valor =
          valorPersistido !=
            null
            ? moeda(
                valorPersistido
              )
            : moedaTexto(
                pendente.valor
              );

        const saldoEsperado =
          mensagem.saldoEsperado !=
            null
            ? moeda(
                mensagem.saldoEsperado
              )
            : '';

        /*
         * FINANCEIRO — atualização imediata após a confirmação real da sangria.
         *
         * O backend continua sendo a fonte definitiva. Este cache local existe
         * apenas para a movimentação já aparecer em FINANCEIRO > SAÍDA assim
         * que SCF_CAIXA_MOVIMENTO_REGISTRADO for recebido, sem depender de uma
         * nova rodada de consulta. Quando o backend devolver o mesmo movimento,
         * o Financeiro faz a mesclagem pelo ID e não duplica a linha.
         */
        const movimentoPersistido =
          mensagem &&
          mensagem.movimento &&
          typeof mensagem.movimento ===
            'object'
            ? mensagem.movimento
            : {};

        const valorFinanceiro =
          numeroMoedaTexto(
            valorPersistido !=
              null
              ? valorPersistido
              : pendente.valor
          );

        const movimentoFinanceiro = {
          ...movimentoPersistido,

          id:
            texto(
              movimentoPersistido.id ||
              movimentoPersistido._id ||
              mensagem.movimentoId ||
              ''
            ),

          tipo:
            texto(
              movimentoPersistido.tipo ||
              pendente.tipo
            ).toUpperCase(),

          valor:
            Number.isFinite(
              valorFinanceiro
            )
              ? valorFinanceiro
              : 0,

          motivo:
            texto(
              movimentoPersistido.motivo ||
              pendente.motivo
            ),

          descricao:
            texto(
              movimentoPersistido.descricao ||
              pendente.descricao
            ),

          fornecedorNome:
            texto(
              movimentoPersistido.fornecedorNome ||
              pendente.fornecedorNome
            ),

          criadoEm:
            momentoMovimento(
              mensagem
            ) ||
            new Date().toISOString(),

          operadorNome:
            texto(
              movimentoPersistido.operadorNome ||
              movimentoPersistido.nomeOperador ||
              operadorMovimento(
                mensagem
              )
            ),

          __scfFinanceiroConfirmadoLocal:
            true
        };

        if(
          movimentoFinanceiro.tipo ===
            'SANGRIA' ||
          movimentoFinanceiro.tipo ===
            'SUPRIMENTO'
        ){
          const financeDomain =
            requireFinanceDomain();

          const cacheFinanceiro =
            Array.isArray(
              financeDomain.localMovements
            )
              ? financeDomain.localMovements.slice()
              : [];

          const chaveMovimento =
            movimentoFinanceiro.id
              ? 'ID|' +
                movimentoFinanceiro.id
              : [
                  'MOV',
                  movimentoFinanceiro.tipo,
                  texto(
                    movimentoFinanceiro.criadoEm
                  ),
                  String(
                    movimentoFinanceiro.valor
                  ),
                  movimentoFinanceiro.motivo,
                  movimentoFinanceiro.descricao
                ].join(
                  '|'
                );

          const indiceExistente =
            cacheFinanceiro.findIndex(
              function(item){
                const itemId =
                  texto(
                    item &&
                    (
                      item.id ||
                      item._id ||
                      item.movimentoId
                    )
                  );

                const chaveItem =
                  itemId
                    ? 'ID|' +
                      itemId
                    : [
                        'MOV',
                        texto(
                          item &&
                          item.tipo
                        ).toUpperCase(),
                        texto(
                          item &&
                          item.criadoEm
                        ),
                        String(
                          item &&
                          item.valor !=
                            null
                            ? item.valor
                            : ''
                        ),
                        texto(
                          item &&
                          item.motivo
                        ),
                        texto(
                          item &&
                          item.descricao
                        )
                      ].join(
                        '|'
                      );

                return chaveItem ===
                  chaveMovimento;
              }
            );

          if(
            indiceExistente >=
              0
          ){
            cacheFinanceiro[
              indiceExistente
            ] =
              movimentoFinanceiro;
          }else{
            cacheFinanceiro.unshift(
              movimentoFinanceiro
            );
          }

          /*
           * Evita crescimento indefinido caso a aplicação permaneça aberta
           * por muitos dias. O backend continua responsável pelo histórico.
           */
          financeDomain.localMovements =
            cacheFinanceiro.slice(
              0,
              300
            );
        }

        mostrarRecibo(
          tituloMovimento(
            pendente.tipo
          ),
          [
            {
              label:
                'DATA/HORA',
              value:
                dataHora(
                  momentoMovimento(
                    mensagem
                  )
                )
            },
            {
              label:
                'VALOR',
              value:
                valor
            },
            {
              label:
                'MOTIVO',
              value:
                pendente.motivo,
              full:
                true
            },
            ...(pendente.fornecedorNome
              ? [
                  {
                    label:
                      'FORNECEDOR',
                    value:
                      pendente.fornecedorNome,
                    full:
                      true
                  }
                ]
              : []),
            ...(pendente.descricao
              ? [
                  {
                    label:
                      'DESCRIÇÃO',
                    value:
                      pendente.descricao,
                    full:
                      true
                  }
                ]
              : []),
            {
              label:
                'SALDO ESPERADO',
              value:
                saldoEsperado
            },
            {
              label:
                'OPERADOR',
              value:
                operadorMovimento(
                  mensagem
                )
            },
            {
              label:
                'ID MOVIMENTO',
              value:
                idMovimento(
                  mensagem
                ),
              full:
                true
            }
          ]
        );

        return;
      }

      if(
        (
          mensagem.type ===
            'SCF_CAIXA_MOVIMENTO_ERRO'
        ) &&
        movimentoPendente
      ){
        movimentoPendente =
          null;

        return;
      }

      if(
        mensagem.type ===
          'SCF_CAIXA_FECHADO' &&
        fechamentoPendente
      ){
        const pendente =
          fechamentoPendente;

        fechamentoPendente =
          null;

        const caixa =
          mensagem.caixa ||
          {};

        mostrarRecibo(
          'TERMO FECHAMENTO DE CAIXA',
          [
            {
              label:
                'ABERTO EM',
              value:
                caixa.abertoEm
                  ? dataHora(
                      caixa.abertoEm
                    )
                  : pendente.abertoEm
            },
            {
              label:
                'FECHADO EM',
              value:
                dataHora(
                  caixa.fechadoEm
                )
            },
            {
              label:
                'SALDO INICIAL',
              value:
                caixa.saldoInicial !=
                  null
                  ? moeda(
                      caixa.saldoInicial
                    )
                  : pendente.saldoInicial
            },
            {
              label:
                'VENDAS EM DINHEIRO',
              value:
                pendente.vendasDinheiro
            },
            {
              label:
                'SANGRIAS',
              value:
                pendente.sangrias
            },
            {
              label:
                'SUPRIMENTOS',
              value:
                pendente.suprimentos
            },
            {
              label:
                'SALDO ESPERADO',
              value:
                caixa.saldoEsperado !=
                  null
                  ? moeda(
                      caixa.saldoEsperado
                    )
                  : pendente.saldoEsperado
            },
            {
              label:
                'SALDO CONTADO',
              value:
                caixa.saldoContado !=
                  null
                  ? moeda(
                      caixa.saldoContado
                    )
                  : moedaTexto(
                      pendente.saldoContado
                    )
            },
            {
              label:
                'DIFERENÇA',
              value:
                caixa.diferenca !=
                  null
                  ? moeda(
                      caixa.diferenca
                    )
                  : pendente.diferenca
            },
            {
              label:
                'OBSERVAÇÃO',
              value:
                pendente.observacao,
              full:
                true
            },
            {
              label:
                'OPERADOR',
              value:
                operadorFechamento(
                  caixa,
                  mensagem
                )
            },
            {
              label:
                'ID SESSÃO',
              value:
                texto(
                  caixa.id ||
                  caixa._id ||
                  ''
                ),
              full:
                true
            }
          ]
        );

        return;
      }

      if(
        mensagem.type ===
          'SCF_CAIXA_FECHAMENTO_ERRO' &&
        fechamentoPendente
      ){
        fechamentoPendente =
          null;
      }
    }
  );

  closeButton
    ?.addEventListener(
      'click',
      fecharRecibo
    );

  doneButton
    ?.addEventListener(
      'click',
      fecharRecibo
    );

  printButton
    ?.addEventListener(
      'click',
      imprimirRecibo
    );

  desktopReceiptMq.addEventListener?.(
    'change',
    function(){
      if(
        overlay.classList.contains(
          'show'
        )
      ){
        posicionarRecibo();
      }else{
        restaurarPosicaoRecibo();
      }
    }
  );

  overlay.addEventListener(
    'click',
    function(event){
      if(
        event.target ===
          overlay
      ){
        fecharRecibo();
      }
    }
  );

  document.addEventListener(
    'keydown',
    function(event){
      if(
        event.key ===
          'Escape' &&
        overlay.classList.contains(
          'show'
        )
      ){
        event.preventDefault();
        fecharRecibo();
      }
    }
  );
})();
