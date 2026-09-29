(function(){
  'use strict';

  const crediarioDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.crediario;

  if(!crediarioDomain){
    throw new Error(
      'PDV crediario domain indisponivel.'
    );
  }

  const customerDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.customer;

  if(!customerDomain){
    throw new Error(
      'PDV customer domain indisponivel para crediario.'
    );
  }

  let vendaPreparada =
    null;

  let clientes =
    [];

  let requestClientes =
    '';

  let requestAbertura =
    '';

  let requestLista =
    '';

  /*
   * Cache visual do CREDIÁRIO, espelhando o comportamento do Histórico
   * de VENDAS: mantém a última lista completa válida em memória e faz
   * a conferência nova em segundo plano sem apagar a tela atual.
   */
  let crediarioListaCachePronto =
    false;

  let crediariosListaCache =
    [];

  let requestListaSilenciosa =
    false;

  let crediarioPreloadSolicitado =
    false;

  let requestDetalhe =
    '';

  let requestCancelamento =
    '';

  let requestAtualizacaoItens =
    '';

  /*
   * F5 — proteção contra CREDIÁRIO duplicado.
   * Antes de abrir uma nova conta, exige uma leitura atual da lista e,
   * se o cliente já possuir crediário em aberto, reaproveita o mesmo ID.
   */
  let confirmacaoNovoCrediarioAguardandoLista =
    false;

  let verificacaoCrediarioF5Pendente =
    false;

  let reutilizacaoCrediarioF5 =
    null;

  let crediarioResumoConfirmado =
    '';

  let crediarioEdicaoPendente =
    false;

  /*
   * ETAPAS DO RECEBIMENTO DO CREDIÁRIO:
   * EDICAO   -> botão principal F1 FINALIZAR / CONFIRMAR;
   * ESCOLHA  -> exibe PAGAR TOTAL e PAGAR PARCIAL e principal vira CANCELAR;
   * PARCIAL  -> ITEM vira booleano; PAGAR TOTAL vira F1 FINALIZAR.
   */
  let crediarioEtapaPagamento =
    'EDICAO';

  let crediarioItensParcialSelecionados =
    new Set();

  crediarioDomain.paymentPartialSelectionActive =
    false;

  let acaoDetalhePendente =
    'visualizar';

  let crediarioDetalheAtual =
    null;

  let clienteDropdownEmUso =
    false;

  let clientesAtualizacaoPendente =
    false;

  let ultimoFingerprintClientes =
    '';

  let aguardandoPrimeiraListaClientes =
    false;

  const cabecalhoProdutosHtml =
    (
      document.querySelector(
        '#scfPdvUnifiedHeader'
      )
      ?.innerHTML ||
      ''
    );

  function texto(valor){
    return String(
      valor == null
        ? ''
        : valor
    )
      .replace(/\s+/g,' ')
      .trim();
  }

  function somenteDigitos(valor){
    return texto(
      valor
    ).replace(/\D+/g,'');
  }

  function nomeCliente(cliente){
    return texto(
      cliente &&
      (
        cliente.nome ||
        cliente.nomeCompleto ||
        cliente.clienteNome ||
        cliente.razaoSocial
      )
    );
  }

  function cpfCliente(cliente){
    return somenteDigitos(
      cliente &&
      (
        cliente.cpf ||
        cliente.cpfCliente ||
        cliente.cpfFormatado ||
        cliente.cpfClienteFormatado ||
        cliente.documento
      )
    );
  }

  function whatsappCliente(cliente){
    return somenteDigitos(
      cliente &&
      (
        cliente.whatsapp ||
        cliente.whatsappFormatado
      )
    );
  }

  function clienteIdCrediario(cliente){
    return texto(
      cliente &&
      (
        cliente.clienteId ||
        cliente._id
      )
    );
  }

  function localizarCrediarioAbertoDoCliente(cliente){
    if(
      !cliente ||
      crediarioListaCachePronto !== true
    ){
      return null;
    }

    const clienteId =
      clienteIdCrediario(
        cliente
      );

    const cpf =
      cpfCliente(
        cliente
      );

    return crediariosListaCache.find(
      function(conta){
        if(!conta){
          return false;
        }

        const mesmoClienteId =
          clienteId &&
          texto(
            conta.clienteId ||
            conta.customerId
          ) === clienteId;

        const mesmoCpf =
          cpf &&
          cpfCliente(
            conta
          ) === cpf;

        return Boolean(
          mesmoClienteId ||
          mesmoCpf
        );
      }
    ) || null;
  }

  function sinalizarCrediarioAbertoDoCliente(cliente){
    if(!cliente){
      cancelarPreviaReutilizacaoCrediarioF5();
      return null;
    }

    if(
      crediarioListaCachePronto !== true ||
      verificacaoCrediarioF5Pendente === true
    ){
      if(!requestLista){
        solicitarLista(
          true
        );
      }

      return null;
    }

    const conta =
      localizarCrediarioAbertoDoCliente(
        cliente
      );

    if(conta){
      prepararPreviaReutilizacaoCrediarioF5(
        cliente,
        conta
      );
    }else{
      cancelarPreviaReutilizacaoCrediarioF5();

      status(
        '',
        false
      );
    }

    return conta;
  }

  function formatarCpfCrediario(valor){
    const d =
      somenteDigitos(
        valor
      ).slice(
        0,
        11
      );

    if(d.length <= 3) return d;
    if(d.length <= 6) return d.slice(0,3)+'.'+d.slice(3);
    if(d.length <= 9) return d.slice(0,3)+'.'+d.slice(3,6)+'.'+d.slice(6);

    return d.slice(0,3)+'.'+d.slice(3,6)+'.'+d.slice(6,9)+'-'+d.slice(9,11);
  }

  function formatarWhatsappCrediario(valor){
    let d =
      somenteDigitos(
        valor
      );

    if(
      d.startsWith('55') &&
      d.length > 11
    ){
      d = d.slice(2);
    }

    d = d.slice(0,11);

    if(d.length <= 2) return d ? '('+d : '';
    if(d.length <= 6) return '('+d.slice(0,2)+') '+d.slice(2);
    if(d.length <= 10) return '('+d.slice(0,2)+') '+d.slice(2,6)+'-'+d.slice(6);

    return '('+d.slice(0,2)+') '+d.slice(2,7)+'-'+d.slice(7,11);
  }


  function normalizarNumeroCrediario(valor){
    const numero =
      Number(valor || 0);

    return Number.isFinite(numero)
      ? numero.toFixed(4)
      : '0.0000';
  }

  function resumoItensCrediario(itens){
    const lista =
      Array.isArray(itens)
        ? itens
        : [];

    return lista
      .filter(
        function(item){
          return (
            item &&
            item.cancelled !== true &&
            Number(item.quantity || 0) > 0
          );
        }
      )
      .map(
        function(item,index){
          return [
            texto(
              item.crediarioItemId ||
              item.id ||
              item.productFiscalId ||
              item.produtoId ||
              item.productCode ||
              item.codigoProduto ||
              item.barcode ||
              item.gtin ||
              item.name ||
              item.description ||
              ('item-' + index)
            ),
            texto(
              item.name ||
              item.description
            ),
            texto(
              item.unit || 'UN'
            ).toUpperCase(),
            normalizarNumeroCrediario(
              item.quantity
            ),
            normalizarNumeroCrediario(
              item.unitValue
            ),
            normalizarNumeroCrediario(
              item.totalValue != null
                ? item.totalValue
                : item.total
            )
          ].join('|');
        }
      )
      .sort()
      .join('||');
  }

  function definirResumoConfirmadoCrediario(detalhe){
    crediarioResumoConfirmado =
      resumoItensCrediario(
        detalhe?.itens || []
      );

    crediarioEdicaoPendente =
      false;
  }

  function calcularEdicaoPendenteCrediario(){
    if(
      document.body.classList.contains(
        'scf-crediario-detail-open'
      ) !== true ||
      crediarioDomain.paymentAwaitingF1 !==
        true
    ){
      crediarioEdicaoPendente =
        false;

      return false;
    }

    const edicao =
      typeof window.scfObterEdicaoCrediarioPdv === 'function'
        ? window.scfObterEdicaoCrediarioPdv()
        : null;

    const resumoAtual =
      resumoItensCrediario(
        edicao?.produtos || []
      );

    crediarioEdicaoPendente =
      resumoAtual !==
      crediarioResumoConfirmado;

    return crediarioEdicaoPendente;
  }

  function chaveItemPagamentoParcial(
    item,
    index
  ){
    const id =
      texto(
        item &&
        (
          item.crediarioItemId ||
          item.id ||
          item._id
        )
      );

    if(id){
      return 'ID:' + id;
    }

    const numero =
      Number(
        item &&
        item.itemNumber
      );

    if(
      Number.isFinite(numero) &&
      numero > 0
    ){
      return 'ITEM:' + numero;
    }

    return [
      'IDX',
      Number(index) || 0,
      texto(
        item &&
        (
          item.productCode ||
          item.codigoProduto ||
          item.barcode
        )
      )
    ].join(':');
  }

  window.scfCrediarioItemPagamentoParcialSelecionado =
    function(
      item,
      index
    ){
      return crediarioItensParcialSelecionados.has(
        chaveItemPagamentoParcial(
          item,
          index
        )
      );
    };

  function itensPagamentoParcialSelecionados(){
    const itens =
      Array.isArray(
        crediarioDetalheAtual?.itens
      )
        ? crediarioDetalheAtual.itens
        : [];

    return itens.filter(
      function(item,index){
        return crediarioItensParcialSelecionados.has(
          chaveItemPagamentoParcial(
            item,
            index
          )
        );
      }
    );
  }

  window.scfCrediarioTotalPagamentoParcial =
    function(){
      return itensPagamentoParcialSelecionados()
        .reduce(
          function(soma,item){
            const valorItem =
              Number(
                normalizarNumeroCrediario(
                  item.totalValue != null
                    ? item.totalValue
                    : item.total
                )
              );

            return soma +
              (
                Number.isFinite(valorItem)
                  ? valorItem
                  : 0
              );
          },
          0
        );
    };

  window.scfCrediarioDefinirItemPagamentoParcial =
    function(
      item,
      index,
      selecionado
    ){
      if(
        crediarioEtapaPagamento !==
          'PARCIAL'
      ){
        return false;
      }

      const chave =
        chaveItemPagamentoParcial(
          item,
          index
        );

      if(selecionado === true){
        crediarioItensParcialSelecionados.add(
          chave
        );
      }else{
        crediarioItensParcialSelecionados.delete(
          chave
        );
      }

      if(
        typeof window.scfRenderizarProdutosPdv ===
          'function'
      ){
        try{
          window.scfRenderizarProdutosPdv();
        }catch(error){}
      }

      /*
       * renderAddedProducts() já atualiza os booleanos; updateTotal()
       * troca o TOTAL principal para a soma somente dos itens marcados.
       */
      try{
        const evento =
          new CustomEvent(
            'scf:crediario-parcial-selecao-alterada'
          );
        window.__scfPdvInfra.eventBus.dispatch(evento);
      }catch(error){}

      const total =
        window.scfCrediarioTotalPagamentoParcial();

      const totalNode =
        document.getElementById(
          'productTotal'
        );

      const headerTotal =
        document.getElementById(
          'fiscalHeaderTotal'
        );

      const summary =
        document.getElementById(
          'fiscalProductsSummaryValue'
        );

      const formatador =
        new Intl.NumberFormat(
          'pt-BR',
          {
            style:'currency',
            currency:'BRL'
          }
        );

      const totalTexto =
        formatador.format(
          Number(total) || 0
        );

      if(totalNode){
        totalNode.textContent =
          totalTexto;
      }

      if(headerTotal){
        headerTotal.textContent =
          totalTexto;
      }

      if(summary){
        summary.textContent =
          totalTexto;
      }

      return true;
    };

  function controlesPagamentoCrediario(){
    return {
      row:
        document.getElementById(
          'scfPdvCrediarioPayChoice'
        ),

      total:
        document.getElementById(
          'scfPdvCrediarioPayTotal'
        ),

      parcial:
        document.getElementById(
          'scfPdvCrediarioPayPartial'
        ),

      principal:
        document.getElementById(
          'scfPdvCrediarioConfirm'
        )
    };
  }

  function sincronizarEtapaPagamentoCrediario(){
    const controles =
      controlesPagamentoCrediario();

    const emEscolha =
      crediarioEtapaPagamento ===
        'ESCOLHA';

    const emParcial =
      crediarioEtapaPagamento ===
        'PARCIAL';

    crediarioDomain.paymentPartialSelectionActive =
      emParcial;

    document.body.classList.toggle(
      'scf-crediario-payment-choice-open',
      emEscolha ||
      emParcial
    );

    document.body.classList.toggle(
      'scf-crediario-partial-select-open',
      emParcial
    );

    if(controles.row){
      controles.row.hidden =
        !(
          emEscolha ||
          emParcial
        );
    }

    if(controles.total){
      controles.total.textContent =
        emParcial
          ? 'F1 FINALIZAR'
          : 'PAGAR TOTAL';

      controles.total.disabled =
        false;
    }

    if(controles.parcial){
      controles.parcial.textContent =
        'PAGAR PARCIAL';

      controles.parcial.disabled =
        emParcial;
    }

    if(
      controles.principal &&
      (
        emEscolha ||
        emParcial
      )
    ){
      controles.principal.hidden =
        false;

      controles.principal.disabled =
        false;

      controles.principal.textContent =
        'CANCELAR';
    }

    if(
      typeof window.scfRenderizarProdutosPdv ===
        'function'
    ){
      try{
        window.scfRenderizarProdutosPdv();
      }catch(error){}
    }

    const totalNode =
      document.getElementById(
        'productTotal'
      );

    const headerTotal =
      document.getElementById(
        'fiscalHeaderTotal'
      );

    const summary =
      document.getElementById(
        'fiscalProductsSummaryValue'
      );

    const valorTotal =
      emParcial
        ? window.scfCrediarioTotalPagamentoParcial()
        : (
            typeof window.scfObterEdicaoCrediarioPdv ===
              'function'
              ? Number(
                  window.scfObterEdicaoCrediarioPdv()?.total ||
                  0
                )
              : 0
          );

    const totalTexto =
      new Intl.NumberFormat(
        'pt-BR',
        {
          style:'currency',
          currency:'BRL'
        }
      ).format(
        Number(valorTotal) || 0
      );

    if(totalNode){
      totalNode.textContent =
        totalTexto;
    }

    if(headerTotal){
      headerTotal.textContent =
        totalTexto;
    }

    if(summary){
      summary.textContent =
        totalTexto;
    }
  }

  function resetarEtapaPagamentoCrediario(){
    crediarioEtapaPagamento =
      'EDICAO';

    crediarioItensParcialSelecionados.clear();

    crediarioDomain.paymentPartialSelectionActive =
      false;

    document.body.classList.remove(
      'scf-crediario-payment-choice-open',
      'scf-crediario-partial-select-open'
    );

    const controles =
      controlesPagamentoCrediario();

    if(controles.row){
      controles.row.hidden =
        true;
    }

    sincronizarEtapaPagamentoCrediario();
  }

  window.scfResetarEtapaPagamentoCrediario =
    resetarEtapaPagamentoCrediario;

  function mostrarEscolhaPagamentoCrediario(){
    crediarioEtapaPagamento =
      'ESCOLHA';

    crediarioItensParcialSelecionados.clear();

    sincronizarEtapaPagamentoCrediario();

    return true;
  }

  function entrarSelecaoPagamentoParcial(){
    crediarioEtapaPagamento =
      'PARCIAL';

    crediarioItensParcialSelecionados.clear();

    sincronizarEtapaPagamentoCrediario();

    return true;
  }

  function cancelarEscolhaPagamentoCrediario(){
    resetarEtapaPagamentoCrediario();
    atualizarBotaoPrincipalCrediario();

    const barcode =
      document.getElementById(
        'productBarcode'
      );

    if(barcode){
      try{
        barcode.focus({
          preventScroll:true
        });
      }catch(error){
        try{barcode.focus();}catch(ignore){}
      }
    }

    return true;
  }

  function abrirPagamentoTotalCrediario(){
    if(
      crediarioEtapaPagamento !==
        'ESCOLHA' ||
      !crediarioDetalheAtual
    ){
      return false;
    }

    const resultado =
      abrirFluxoPagamentoCrediarioDetalhe(
        crediarioDetalheAtual
      );

    if(
      !resultado ||
      resultado.ok !== true
    ){
      console.error(
        resultado?.message ||
        'Não foi possível abrir o pagamento total do crediário.'
      );
      return false;
    }

    return true;
  }

  function finalizarPagamentoParcialCrediario(){
    if(
      crediarioEtapaPagamento !==
        'PARCIAL' ||
      !crediarioDetalheAtual
    ){
      return false;
    }

    const itens =
      itensPagamentoParcialSelecionados();

    if(itens.length === 0){
      status(
        'SELECIONE AO MENOS UM PRODUTO PARA PAGAMENTO PARCIAL.',
        true
      );

      return false;
    }

    const valorSelecionado =
      itens.reduce(
        function(soma,item){
          const valorItem =
            Number(
              normalizarNumeroCrediario(
                item.totalValue != null
                  ? item.totalValue
                  : item.total
              )
            );

          return soma +
            (
              Number.isFinite(valorItem)
                ? valorItem
                : 0
            );
        },
        0
      );

    if(
      !Number.isFinite(valorSelecionado) ||
      valorSelecionado <= 0
    ){
      status(
        'O TOTAL DOS ITENS SELECIONADOS É INVÁLIDO.',
        true
      );

      return false;
    }

    const detalheParcial = {
      conta:{
        ...crediarioDetalheAtual.conta,
        valor:
          valorSelecionado
      },
      itens,
      pagamentoParcial:true,
      valorAntesPagamento:
        Number(
          crediarioDetalheAtual?.conta?.saldoReceber ||
          crediarioDetalheAtual?.conta?.valor ||
          0
        )
    };

    const resultado =
      abrirFluxoPagamentoCrediarioDetalhe(
        detalheParcial
      );

    if(
      !resultado ||
      resultado.ok !== true
    ){
      console.error(
        resultado?.message ||
        'Não foi possível abrir o pagamento parcial do crediário.'
      );
      return false;
    }

    return true;
  }

  function atualizarBotaoPrincipalCrediario(){
    const button =
      document.getElementById(
        'scfPdvCrediarioConfirm'
      );

    if(!button){
      return;
    }

    const detalheAberto =
      document.body.classList.contains(
        'scf-crediario-detail-open'
      ) === true;

    if(
      detalheAberto !== true ||
      crediarioDomain.paymentAwaitingF1 !==
        true
    ){
      return;
    }

    if(
      crediarioEtapaPagamento ===
        'ESCOLHA' ||
      crediarioEtapaPagamento ===
        'PARCIAL'
    ){
      button.hidden =
        false;

      button.disabled =
        false;

      button.textContent =
        'CANCELAR';

      return;
    }

    const pendente =
      calcularEdicaoPendenteCrediario();

    button.hidden =
      false;

    button.disabled =
      requestAtualizacaoItens
        ? true
        : false;

    button.textContent =
      requestAtualizacaoItens
        ? 'CONFIRMANDO...'
        : (
            pendente
              ? 'CONFIRMAR'
              : 'F1 FINALIZAR'
          );
  }

  window.scfAtualizarBotaoPrincipalCrediario =
    atualizarBotaoPrincipalCrediario;

  function acionarBotaoPrincipalCrediario(){
    const detalheAberto =
      document.body.classList.contains(
        'scf-crediario-detail-open'
      ) === true;

    if(
      detalheAberto === true &&
      crediarioDomain.paymentAwaitingF1 ===
        true
    ){
      if(
        crediarioEtapaPagamento ===
          'ESCOLHA' ||
        crediarioEtapaPagamento ===
          'PARCIAL'
      ){
        cancelarEscolhaPagamentoCrediario();
        return;
      }

      if(
        typeof window.scfFinalizarPagamentoCrediarioSelecionado ===
          'function'
      ){
        window.scfFinalizarPagamentoCrediarioSelecionado();
      }

      return;
    }

    confirmarNovoCrediario();
  }

  function abrirFluxoPagamentoCrediarioDetalhe(
    detalhe
  ){
    const atual =
      detalhe &&
      typeof detalhe === 'object'
        ? detalhe
        : crediarioDetalheAtual;

    if(!atual){
      return {
        ok:false,
        message:
          'Não foi possível localizar o crediário para pagamento.'
      };
    }

    const detalheBaseAntesPagamento =
      crediarioDetalheAtual;

    if(
      atual.pagamentoParcial !==
        true
    ){
      crediarioDetalheAtual =
        atual;
    }

    crediarioDomain.paymentAwaitingF1 =
      false;

    fecharPainelCrediario();

    document.body.classList.remove(
      'scf-crediario-list-open',
      'scf-crediario-detail-open',
      'scf-crediario-open'
    );

    const resultado =
      typeof window.scfAbrirPagamentoCrediario === 'function'
        ? window.scfAbrirPagamentoCrediario(
            atual
          )
        : {
            ok:false,
            message:
              'Fluxo de pagamento do crediário indisponível.'
          };

    if(
      !resultado ||
      resultado.ok !== true
    ){
      crediarioDomain.paymentAwaitingF1 =
        true;

      crediarioDomain.paymentMethodsOpen =
        false;

      document.body.classList.remove(
        'scf-crediario-payment-methods-open'
      );

      exibirDetalheNoPainel(
        detalheBaseAntesPagamento ||
        atual,
        true
      );

      return {
        ok:false,
        message:
          resultado?.message ||
          'Não foi possível abrir o pagamento do crediário.'
      };
    }

    /*
     * Enquanto PIX / DÉBITO / CRÉDITO / DINHEIRO estiverem na tela,
     * o sistema continua pertencendo ao fluxo do CREDIÁRIO.
     * Isso permite que o F7 exclusivo continue ativo.
     */
    crediarioDomain.paymentMethodsOpen =
      true;

    document.body.classList.add(
      'scf-crediario-payment-methods-open'
    );

    return {
      ok:true
    };
  }

  function painel(){
    return document.getElementById(
      'scfPdvCrediarioPanel'
    );
  }

  function frame(){
    return document.querySelector(
      '#fiscalDesktopProductPhoto .fiscal-desktop-product-photo-frame'
    );
  }

  function status(mensagem,erro){
    const node =
      document.getElementById(
        'scfPdvCrediarioStatus'
      );

    if(!node) return;

    node.textContent =
      texto(
        mensagem
      );

    node.classList.toggle(
      'is-error',
      erro === true
    );
  }

  function criarPainel(){
    let node =
      painel();

    if(node){
      return node;
    }

    const host =
      frame();

    if(!host){
      return null;
    }

    node =
      document.createElement(
        'div'
      );

    node.id =
      'scfPdvCrediarioPanel';

    node.setAttribute(
      'aria-label',
      'Vendas no crediário'
    );

    node.innerHTML = ''
      + '<h3 class="scf-pdv-crediario-title">VENDAS NO CREDIÁRIO</h3>'
      + '<div class="scf-pdv-crediario-client-row">'
      +   '<div class="scf-pdv-crediario-field">'
      +     '<label class="scf-pdv-crediario-label" for="scfPdvCrediarioCpf">CPF</label>'
      +     '<input class="scf-pdv-crediario-input" id="scfPdvCrediarioCpf" inputmode="numeric" maxlength="14" autocomplete="off" placeholder="000.000.000-00" type="text" aria-label="CPF do cliente">'
      +   '</div>'
      +   '<div class="scf-pdv-crediario-field">'
      +     '<label class="scf-pdv-crediario-label" for="scfPdvCrediarioWhatsapp">WHATSAPP</label>'
      +     '<input class="scf-pdv-crediario-input" id="scfPdvCrediarioWhatsapp" autocomplete="off" placeholder="(00) 00000-0000" type="text" aria-label="WhatsApp do cliente" readonly>'
      +   '</div>'
      + '</div>'
      + '<div class="scf-pdv-crediario-field">'
      +   '<label class="scf-pdv-crediario-label" for="scfPdvCrediarioCliente">NOME DO CLIENTE</label>'
      +   '<select class="scf-pdv-crediario-input" id="scfPdvCrediarioCliente" aria-label="Nome do cliente do crediário">'
      +     '<option value="">SELECIONE O CLIENTE</option>'
      +   '</select>'
      + '</div>'
      + '<div class="scf-pdv-crediario-payment-row">'
      +   '<div class="scf-pdv-crediario-field">'
      +     '<label class="scf-pdv-crediario-label" for="scfPdvCrediarioPagamento">PAGAMENTO</label>'
      +     '<input class="scf-pdv-crediario-input" id="scfPdvCrediarioPagamento" inputmode="numeric" maxlength="10" autocomplete="off" placeholder="DD/MM/AAAA" type="text">'
      +   '</div>'
      +   '<button id="scfPdvCrediarioConfirm" type="button">CONFIRMAR</button>'
      + '</div>'
      + '<div id="scfPdvCrediarioPayChoice" hidden>'
      +   '<button id="scfPdvCrediarioPayTotal" type="button">PAGAR TOTAL</button>'
      +   '<button id="scfPdvCrediarioPayPartial" type="button">PAGAR PARCIAL</button>'
      + '</div>'
      + '<div id="scfPdvCrediarioStatus" aria-live="polite"></div>';

    host.appendChild(
      node
    );

    const select =
      document.getElementById(
        'scfPdvCrediarioCliente'
      );

    const cpfInput =
      document.getElementById(
        'scfPdvCrediarioCpf'
      );

    const pagamento =
      document.getElementById(
        'scfPdvCrediarioPagamento'
      );

    const pagarTotal =
      document.getElementById(
        'scfPdvCrediarioPayTotal'
      );

    const pagarParcial =
      document.getElementById(
        'scfPdvCrediarioPayPartial'
      );

    pagarTotal?.addEventListener(
      'click',
      function(event){
        event.preventDefault();
        event.stopPropagation();

        if(
          crediarioEtapaPagamento ===
            'PARCIAL'
        ){
          finalizarPagamentoParcialCrediario();
          return;
        }

        abrirPagamentoTotalCrediario();
      }
    );

    pagarParcial?.addEventListener(
      'click',
      function(event){
        event.preventDefault();
        event.stopPropagation();

        entrarSelecaoPagamentoParcial();
      }
    );

    select?.addEventListener(
      'pointerdown',
      function(){
        if(!select.disabled){
          clienteDropdownEmUso =
            true;
        }
      },
      true
    );

    select?.addEventListener(
      'mousedown',
      function(){
        if(!select.disabled){
          clienteDropdownEmUso =
            true;
        }
      },
      true
    );

    select?.addEventListener(
      'change',
      function(){
        const cliente =
          clientePorId(
            select.value
          );

        preencherDadosCliente(
          cliente
        );

        sinalizarCrediarioAbertoDoCliente(
          cliente
        );

        clienteDropdownEmUso =
          false;

        if(
          clientesAtualizacaoPendente
        ){
          clientesAtualizacaoPendente =
            false;

          renderClientes(
            true
          );
        }
      }
    );

    select?.addEventListener(
      'blur',
      function(){
        clienteDropdownEmUso =
          false;

        if(
          clientesAtualizacaoPendente
        ){
          clientesAtualizacaoPendente =
            false;

          renderClientes(
            true
          );
        }
      }
    );

    cpfInput?.addEventListener(
      'input',
      function(){
        selecionarClientePorCpf();
      }
    );

    pagamento?.addEventListener(
      'input',
      function(){
        const d =
          somenteDigitos(
            pagamento.value
          ).slice(0,8);

        pagamento.value =
          d.length > 4
            ? d.slice(0,2)+'/'+d.slice(2,4)+'/'+d.slice(4)
            : (
                d.length > 2
                  ? d.slice(0,2)+'/'+d.slice(2)
                  : d
              );
      }
    );

    document.getElementById(
      'scfPdvCrediarioConfirm'
    )?.addEventListener(
      'click',
      acionarBotaoPrincipalCrediario
    );

    return node;
  }

  function clientePorId(clienteId){
    const id =
      texto(
        clienteId
      );

    return clientes.find(
      function(cliente){
        return texto(
          cliente &&
          (
            cliente.clienteId ||
            cliente._id
          )
        ) === id;
      }
    ) || null;
  }

  function clientePorCpf(cpf){
    const d =
      somenteDigitos(
        cpf
      );

    if(d.length !== 11){
      return null;
    }

    return clientes.find(
      function(cliente){
        return cpfCliente(
          cliente
        ) === d;
      }
    ) || null;
  }

  function preencherDadosCliente(cliente){
    const cpfInput =
      document.getElementById(
        'scfPdvCrediarioCpf'
      );

    const whatsappInput =
      document.getElementById(
        'scfPdvCrediarioWhatsapp'
      );

    if(!cliente){
      if(whatsappInput){
        whatsappInput.value = '';
      }

      return;
    }

    if(cpfInput){
      cpfInput.value =
        formatarCpfCrediario(
          cpfCliente(
            cliente
          )
        );
    }

    if(whatsappInput){
      whatsappInput.value =
        formatarWhatsappCrediario(
          whatsappCliente(
            cliente
          )
        );
    }
  }

  function selecionarClientePorCpf(){
    const input =
      document.getElementById(
        'scfPdvCrediarioCpf'
      );

    const select =
      document.getElementById(
        'scfPdvCrediarioCliente'
      );

    const whatsapp =
      document.getElementById(
        'scfPdvCrediarioWhatsapp'
      );

    if(
      !input ||
      !select
    ){
      return false;
    }

    const d =
      somenteDigitos(
        input.value
      );

    input.value =
      formatarCpfCrediario(
        d
      );

    if(d.length < 11){
      select.value = '';

      if(whatsapp){
        whatsapp.value = '';
      }

      status(
        '',
        false
      );

      return false;
    }

    const cliente =
      clientePorCpf(
        d
      );

    if(!cliente){
      select.value = '';

      if(whatsapp){
        whatsapp.value = '';
      }

      status(
        'CPF NÃO LOCALIZADO NO CADASTRO DE CLIENTES.',
        true
      );

      return false;
    }

    select.value =
      texto(
        cliente.clienteId ||
        cliente._id
      );

    preencherDadosCliente(
      cliente
    );

    sinalizarCrediarioAbertoDoCliente(
      cliente
    );

    return true;
  }

  function clientesFiltradosOrdenados(){
    return clientes
      .filter(
        function(cliente){
          const tipo =
            texto(
              cliente &&
              cliente.tipoPessoa
            )
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g,'')
              .toUpperCase();

          return (
            (
              !tipo ||
              tipo === 'FISICA'
            ) &&
            cpfCliente(
              cliente
            ).length === 11 &&
            cliente?.ativo !== false
          );
        }
      )
      .sort(
        function(a,b){
          return nomeCliente(a).localeCompare(
            nomeCliente(b),
            'pt-BR'
          );
        }
      );
  }

  function renderClientes(forcar){
    const select =
      document.getElementById(
        'scfPdvCrediarioCliente'
      );

    if(!select){
      return;
    }

    if(
      forcar !== true &&
      (
        clienteDropdownEmUso ||
        document.activeElement ===
          select
      )
    ){
      clientesAtualizacaoPendente =
        true;

      return;
    }

    const lista =
      clientesFiltradosOrdenados();

    const fingerprint =
      lista.map(
        function(cliente){
          return [
            texto(
              cliente.clienteId ||
              cliente._id
            ),
            nomeCliente(
              cliente
            ),
            cpfCliente(
              cliente
            ),
            whatsappCliente(
              cliente
            )
          ].join('|');
        }
      ).join('||');

    if(
      forcar !== true &&
      fingerprint ===
        ultimoFingerprintClientes
    ){
      return;
    }

    ultimoFingerprintClientes =
      fingerprint;

    const valorAtual =
      texto(
        select.value
      );

    select.replaceChildren();

    const placeholder =
      document.createElement(
        'option'
      );

    placeholder.value = '';
    placeholder.textContent =
      lista.length
        ? 'SELECIONE O CLIENTE'
        : 'NENHUM CLIENTE COM CPF CADASTRADO';

    select.appendChild(
      placeholder
    );

    lista.forEach(
      function(cliente){
        const option =
          document.createElement(
            'option'
          );

        option.value =
          texto(
            cliente.clienteId ||
            cliente._id
          );

        /*
         * O CPF possui campo próprio. No dropdown aparece SOMENTE o nome.
         */
        option.textContent =
          nomeCliente(
            cliente
          ) ||
          'CLIENTE';

        select.appendChild(
          option
        );
      }
    );

    if(
      valorAtual &&
      lista.some(
        function(cliente){
          return texto(
            cliente.clienteId ||
            cliente._id
          ) === valorAtual;
        }
      )
    ){
      select.value =
        valorAtual;
    }
  }

  function solicitarClientes(){
    const select =
      document.getElementById(
        'scfPdvCrediarioCliente'
      );

    const cache =
      Array.isArray(
        customerDomain.customers
      )
        ? customerDomain.customers.slice()
        : [];

    clientes =
      cache;

    clienteDropdownEmUso =
      false;

    clientesAtualizacaoPendente =
      false;

    if(clientes.length > 0){
      aguardandoPrimeiraListaClientes =
        false;

      if(select){
        select.disabled =
          false;
      }

      renderClientes(
        true
      );
    }else{
      aguardandoPrimeiraListaClientes =
        true;

      ultimoFingerprintClientes =
        '';

      if(select){
        select.replaceChildren();

        const loading =
          document.createElement(
            'option'
          );

        loading.value = '';
        loading.textContent =
          'CARREGANDO CLIENTES...';

        select.appendChild(
          loading
        );

        select.disabled =
          true;
      }

      status(
        'CARREGANDO CLIENTES...',
        false
      );
    }

    requestClientes =
      'scf-crediario-clientes-' +
      Date.now() +
      '-' +
      Math.random()
        .toString(36)
        .slice(2,8);

    window.__scfPdvInfra.shellBridge.post(
      {
        type:
          'SCF_CLIENTES_LISTAR',

        requestId:
          requestClientes
      },
      '*'
    );
  }

  function abrirNovo(venda){
    criarPainel();

    vendaPreparada =
      venda &&
      typeof venda === 'object'
        ? venda
        : null;

    if(!vendaPreparada){
      return false;
    }

    crediarioDetalheAtual =
      null;

    reutilizacaoCrediarioF5 =
      null;

    document.body.classList.remove(
      'scf-crediario-list-open',
      'scf-crediario-detail-open'
    );

    document.body.classList.add(
      'scf-crediario-open'
    );

    const panel =
      painel();

    if(panel){
      panel.hidden =
        false;

      panel.setAttribute(
        'aria-hidden',
        'false'
      );
    }

    const title =
      panel?.querySelector(
        '.scf-pdv-crediario-title'
      );

    if(title){
      title.textContent =
        'VENDAS NO CREDIÁRIO';
    }

    const cpf =
      document.getElementById(
        'scfPdvCrediarioCpf'
      );

    const whatsapp =
      document.getElementById(
        'scfPdvCrediarioWhatsapp'
      );

    const select =
      document.getElementById(
        'scfPdvCrediarioCliente'
      );

    const pagamento =
      document.getElementById(
        'scfPdvCrediarioPagamento'
      );

    const confirmar =
      document.getElementById(
        'scfPdvCrediarioConfirm'
      );

    if(cpf){
      cpf.value = '';
      cpf.readOnly = false;
      cpf.disabled = false;
    }

    if(whatsapp){
      whatsapp.value = '';
      whatsapp.readOnly = true;
      whatsapp.disabled = false;
    }

    if(select){
      select.value = '';
      select.disabled = false;
    }

    if(pagamento){
      pagamento.value = '';
      pagamento.readOnly = false;
      pagamento.disabled = false;
    }

    if(confirmar){
      confirmar.hidden = false;
      confirmar.disabled = false;
      confirmar.textContent =
        'CONFIRMAR';
    }

    status(
      '',
      false
    );

    solicitarClientes();

    /*
     * A conferência é renovada a cada F5 com produtos. Mesmo que exista
     * cache anterior, a confirmação espera esta leitura terminar para não
     * criar uma segunda conta por causa de uma lista antiga.
     */
    verificacaoCrediarioF5Pendente =
      true;

    if(!requestLista){
      solicitarLista(
        true
      );
    }

    return true;
  }

  function formatarDataCrediario(valor){
    if(
      valor === null ||
      valor === undefined ||
      valor === ''
    ){
      return '';
    }

    if(
      valor instanceof Date &&
      !Number.isNaN(valor.getTime())
    ){
      const dia =
        String(valor.getDate()).padStart(2,'0');

      const mes =
        String(valor.getMonth() + 1).padStart(2,'0');

      return (
        dia +
        '/' +
        mes +
        '/' +
        String(valor.getFullYear())
      );
    }

    const bruto =
      texto(
        valor
      ).trim();

    const brasileiro =
      /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(
        bruto
      );

    if(brasileiro){
      return bruto;
    }

    const iso =
      /^(\d{4})-(\d{2})-(\d{2})(?:[T\s]|$)/.exec(
        bruto
      );

    if(iso){
      return (
        iso[3] +
        '/' +
        iso[2] +
        '/' +
        iso[1]
      );
    }

    const data =
      new Date(
        bruto
      );

    if(!Number.isNaN(data.getTime())){
      return (
        String(data.getDate()).padStart(2,'0') +
        '/' +
        String(data.getMonth() + 1).padStart(2,'0') +
        '/' +
        String(data.getFullYear())
      );
    }

    return bruto;
  }

  function dataValidaFutura(valor){
    const match =
      /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(
        texto(
          valor
        )
      );

    if(!match){
      return false;
    }

    const dia = Number(match[1]);
    const mes = Number(match[2]);
    const ano = Number(match[3]);

    const data =
      new Date(
        ano,
        mes - 1,
        dia
      );

    if(
      data.getFullYear() !== ano ||
      data.getMonth() !== mes - 1 ||
      data.getDate() !== dia
    ){
      return false;
    }

    const hoje =
      new Date();

    hoje.setHours(
      0,
      0,
      0,
      0
    );

    data.setHours(
      0,
      0,
      0,
      0
    );

    return data.getTime() >
      hoje.getTime();
  }

  function normalizarProdutoParaAtualizacaoCrediario(
    item,
    index,
    itemNumberForcado
  ){
    const quantity =
      Number(
        item?.quantity ||
        0
      );

    const unitValue =
      Number(
        item?.unitValue ||
        item?.valorUnitario ||
        0
      );

    const totalInformado =
      Number(
        item?.totalValue != null
          ? item.totalValue
          : item?.total
      );

    const itemNumber =
      Number(
        itemNumberForcado ||
        item?.itemNumber
      ) ||
      index + 1;

    return {
      name:
        texto(
          item?.name ||
          item?.description ||
          'PRODUTO'
        ),

      quantity,

      unit:
        texto(
          item?.unit ||
          'UN'
        ).toUpperCase(),

      unitValue,

      total:
        Number.isFinite(totalInformado)
          ? totalInformado
          : quantity * unitValue,

      productFiscalId:
        texto(
          item?.productFiscalId ||
          item?.produtoId
        ),

      productCode:
        texto(
          item?.productCode ||
          item?.codigoProduto ||
          item?.barcode ||
          item?.gtin
        ),

      gtin:
        texto(
          item?.gtin ||
          item?.productCode ||
          item?.barcode
        ),

      barcode:
        texto(
          item?.barcode ||
          item?.productCode ||
          item?.gtin
        ),

      ncm:
        texto(
          item?.ncm
        ),

      cest:
        texto(
          item?.cest
        ),

      cfop:
        texto(
          item?.cfop
        ),

      taxCode:
        texto(
          item?.taxCode
        ),

      tributosReferenciaJson:
        item?.tributosReferenciaJson ||
        '',

      crediarioItemId:
        texto(
          item?.crediarioItemId ||
          item?.id ||
          item?._id
        ),

      itemNumber,

      cancelled:
        item?.cancelled === true
    };
  }

  function produtosNovosVendaPreparadaCrediario(){
    const produtos =
      Array.isArray(
        vendaPreparada?.products
      )
        ? vendaPreparada.products
        : [];

    return produtos.filter(
      function(item){
        return (
          item &&
          item.cancelled !== true &&
          Number(item.quantity || 0) > 0
        );
      }
    );
  }

  function restaurarVendaAtualNaListaCrediarioF5(){
    try{
      if(typeof renderAddedProducts === 'function'){
        renderAddedProducts();
      }

      if(typeof updateTotal === 'function'){
        updateTotal();
      }
    }catch(error){}
  }

  function cancelarPreviaReutilizacaoCrediarioF5(){
    const haviaPrevia =
      Boolean(
        reutilizacaoCrediarioF5
      );

    reutilizacaoCrediarioF5 =
      null;

    if(haviaPrevia){
      restaurarVendaAtualNaListaCrediarioF5();
    }

    const pagamento =
      document.getElementById(
        'scfPdvCrediarioPagamento'
      );

    if(
      pagamento &&
      pagamento.dataset.scfCrediarioReutilizado === '1'
    ){
      pagamento.value = '';
      pagamento.readOnly = false;
      delete pagamento.dataset.scfCrediarioReutilizado;
    }

    const button =
      document.getElementById(
        'scfPdvCrediarioConfirm'
      );

    if(button && !requestAbertura){
      button.hidden = false;
      button.disabled = false;
      button.textContent =
        'CONFIRMAR';
    }
  }

  function prepararPreviaReutilizacaoCrediarioF5(
    cliente,
    conta
  ){
    const crediarioId =
      texto(
        conta &&
        (
          conta.crediarioId ||
          conta.saleId
        )
      );

    const produtosNovos =
      produtosNovosVendaPreparadaCrediario();

    if(!crediarioId){
      status(
        'O CREDIÁRIO EXISTENTE NÃO POSSUI IDENTIFICADOR VÁLIDO.',
        true
      );

      return false;
    }

    if(produtosNovos.length === 0){
      status(
        'NENHUM PRODUTO FOI ENCONTRADO PARA ADICIONAR AO CREDIÁRIO.',
        true
      );

      return false;
    }

    if(
      reutilizacaoCrediarioF5 &&
      reutilizacaoCrediarioF5.crediarioId === crediarioId
    ){
      if(
        reutilizacaoCrediarioF5.previewPronto === true
      ){
        status(
          'CREDIÁRIO EM ABERTO ENCONTRADO. CONFIRA OS PRODUTOS E CLIQUE EM CONFIRMAR.',
          false
        );
      }

      return true;
    }

    reutilizacaoCrediarioF5 = {
      crediarioId,
      clienteId:
        clienteIdCrediario(
          cliente
        ),
      produtosNovos:
        produtosNovos.map(
          function(item){
            return {
              ...item
            };
          }
        ),
      previewPronto:false,
      detalhe:null,
      produtosMesclados:[],
      total:0
    };

    const button =
      document.getElementById(
        'scfPdvCrediarioConfirm'
      );

    if(button){
      button.hidden = false;
      button.disabled = true;
      button.textContent =
        'CARREGANDO...';
    }

    status(
      'CREDIÁRIO EM ABERTO ENCONTRADO. CARREGANDO OS PRODUTOS DA MESMA CONTA...',
      false
    );

    solicitarDetalhe(
      crediarioId,
      'visualizar'
    );

    if(!requestDetalhe){
      reutilizacaoCrediarioF5 =
        null;

      if(button){
        button.disabled = false;
        button.textContent =
          'CONFIRMAR';
      }

      status(
        'NÃO FOI POSSÍVEL CARREGAR O CREDIÁRIO EXISTENTE.',
        true
      );

      return false;
    }

    return true;
  }

  function montarPreviaReutilizacaoCrediarioF5(
    detalhe
  ){
    if(!reutilizacaoCrediarioF5){
      return false;
    }

    const conta =
      detalhe?.conta ||
      {};

    const crediarioId =
      texto(
        conta.crediarioId ||
        conta.saleId ||
        reutilizacaoCrediarioF5.crediarioId
      );

    if(
      !crediarioId ||
      crediarioId !==
        reutilizacaoCrediarioF5.crediarioId
    ){
      status(
        'O CREDIÁRIO LOCALIZADO NÃO CORRESPONDE AO CLIENTE SELECIONADO.',
        true
      );

      cancelarPreviaReutilizacaoCrediarioF5();
      return false;
    }

    const itensExistentes =
      Array.isArray(
        detalhe?.itens
      )
        ? detalhe.itens
        : [];

    const maiorItemNumber =
      itensExistentes.reduce(
        function(maior,item,index){
          return Math.max(
            maior,
            Number(item?.itemNumber) ||
              index + 1
          );
        },
        0
      );

    const produtos =
      itensExistentes.map(
        function(item,index){
          return normalizarProdutoParaAtualizacaoCrediario(
            item,
            index
          );
        }
      );

    reutilizacaoCrediarioF5.produtosNovos.forEach(
      function(item,index){
        const novo =
          normalizarProdutoParaAtualizacaoCrediario(
            item,
            produtos.length + index,
            maiorItemNumber + index + 1
          );

        /*
         * O item novo aparece na prévia, mas ainda NÃO é salvo.
         * O backend só receberá esta composição quando o operador
         * clicar em CONFIRMAR.
         */
        novo.crediarioItemId =
          '';

        novo.scfPreviewNovo =
          true;

        produtos.push(
          novo
        );
      }
    );

    const total =
      produtos.reduce(
        function(soma,item){
          if(
            !item ||
            item.cancelled === true ||
            Number(item.quantity || 0) <= 0
          ){
            return soma;
          }

          return soma +
            Number(
              item.total ||
              0
            );
        },
        0
      );

    if(
      produtos.length === 0 ||
      !Number.isFinite(total) ||
      total <= 0
    ){
      status(
        'NÃO FOI POSSÍVEL MONTAR A LISTA ATUALIZADA DO CREDIÁRIO.',
        true
      );

      cancelarPreviaReutilizacaoCrediarioF5();
      return false;
    }

    reutilizacaoCrediarioF5.previewPronto =
      true;

    reutilizacaoCrediarioF5.detalhe =
      detalhe;

    reutilizacaoCrediarioF5.produtosMesclados =
      produtos;

    reutilizacaoCrediarioF5.total =
      total;

    crediarioDetalheAtual =
      detalhe;

    const view =
      document.getElementById(
        'fiscalProductsView'
      );

    if(view){
      view.hidden = false;
    }

    renderProdutosCrediario({
      conta,
      itens:produtos
    });

    const totalFormatado =
      Number(total).toLocaleString(
        'pt-BR',
        {
          style:'currency',
          currency:'BRL'
        }
      );

    const totalCentral =
      document.getElementById(
        'productTotal'
      );

    const totalCabecalho =
      document.getElementById(
        'fiscalHeaderTotal'
      );

    if(totalCentral){
      totalCentral.textContent =
        totalFormatado;
    }

    if(totalCabecalho){
      totalCabecalho.textContent =
        totalFormatado;
    }

    const pagamento =
      document.getElementById(
        'scfPdvCrediarioPagamento'
      );

    if(pagamento){
      pagamento.value =
        formatarDataCrediario(
          conta.vencimento
        );

      pagamento.readOnly = true;
      pagamento.dataset.scfCrediarioReutilizado =
        '1';
    }

    const button =
      document.getElementById(
        'scfPdvCrediarioConfirm'
      );

    if(button){
      button.hidden = false;
      button.disabled = false;
      button.textContent =
        'CONFIRMAR';
    }

    status(
      'CREDIÁRIO EM ABERTO ENCONTRADO. CONFIRA OS PRODUTOS E CLIQUE EM CONFIRMAR.',
      false
    );

    return true;
  }

  function confirmarReutilizacaoCrediarioF5(){
    if(
      !reutilizacaoCrediarioF5 ||
      reutilizacaoCrediarioF5.previewPronto !== true ||
      requestAtualizacaoItens
    ){
      return false;
    }

    const crediarioId =
      texto(
        reutilizacaoCrediarioF5.crediarioId
      );

    const produtos =
      Array.isArray(
        reutilizacaoCrediarioF5.produtosMesclados
      )
        ? reutilizacaoCrediarioF5.produtosMesclados
        : [];

    const produtosEnvio =
      produtos.map(
        function(item){
          const copia = {
            ...item
          };

          delete copia.scfPreviewNovo;
          return copia;
        }
      );

    const total =
      Number(
        reutilizacaoCrediarioF5.total ||
        0
      );

    if(
      !crediarioId ||
      produtos.length === 0 ||
      !Number.isFinite(total) ||
      total <= 0
    ){
      status(
        'NÃO FOI POSSÍVEL CONFIRMAR A COMPOSIÇÃO DO CREDIÁRIO.',
        true
      );

      return false;
    }

    requestAtualizacaoItens =
      'scf-crediario-reutilizar-' +
      Date.now() +
      '-' +
      Math.random()
        .toString(36)
        .slice(2,8);

    const button =
      document.getElementById(
        'scfPdvCrediarioConfirm'
      );

    if(button){
      button.disabled = true;
      button.textContent =
        'CONFIRMANDO...';
    }

    status(
      'SALVANDO OS NOVOS PRODUTOS NO CREDIÁRIO EXISTENTE E BAIXANDO O ESTOQUE...',
      false
    );

    window.__scfPdvInfra.shellBridge.post(
      {
        type:
          'SCF_CREDIARIO_ATUALIZAR_ITENS',

        requestId:
          requestAtualizacaoItens,

        crediarioId,

        produtos:
          produtosEnvio,

        total
      },
      '*'
    );

    return true;
  }

  function confirmarNovoCrediario(){
    if(
      !vendaPreparada ||
      requestAbertura ||
      requestAtualizacaoItens
    ){
      return;
    }

    const select =
      document.getElementById(
        'scfPdvCrediarioCliente'
      );

    const pagamento =
      document.getElementById(
        'scfPdvCrediarioPagamento'
      );

    const clienteId =
      texto(
        select?.value
      );

    const pagamentoEm =
      texto(
        pagamento?.value
      );

    if(!clienteId){
      status(
        'SELECIONE O CLIENTE.',
        true
      );

      select?.focus();

      return;
    }

    const cliente =
      clientePorId(
        clienteId
      );

    if(!cliente){
      status(
        'CLIENTE NÃO ENCONTRADO.',
        true
      );

      return;
    }

    /*
     * Nunca cria uma nova conta antes de conferir a lista atual do backend.
     * Se a atualização ainda estiver em andamento, mantém a venda intacta e
     * retoma esta confirmação automaticamente quando a resposta chegar.
     */
    if(
      verificacaoCrediarioF5Pendente === true ||
      crediarioListaCachePronto !== true
    ){
      confirmacaoNovoCrediarioAguardandoLista =
        true;

      const button =
        document.getElementById(
          'scfPdvCrediarioConfirm'
        );

      if(button){
        button.disabled =
          true;
      }

      status(
        'VERIFICANDO SE O CLIENTE JÁ POSSUI CREDIÁRIO EM ABERTO...',
        false
      );

      if(!requestLista){
        solicitarLista(
          true
        );
      }

      return;
    }

    confirmacaoNovoCrediarioAguardandoLista =
      false;

    const crediarioExistente =
      localizarCrediarioAbertoDoCliente(
        cliente
      );

    if(crediarioExistente){
      const idExistente =
        texto(
          crediarioExistente.crediarioId ||
          crediarioExistente.saleId
        );

      if(
        !reutilizacaoCrediarioF5 ||
        reutilizacaoCrediarioF5.crediarioId !== idExistente ||
        reutilizacaoCrediarioF5.previewPronto !== true
      ){
        prepararPreviaReutilizacaoCrediarioF5(
          cliente,
          crediarioExistente
        );

        return;
      }

      confirmarReutilizacaoCrediarioF5();
      return;
    }

    /*
     * A data é necessária somente quando realmente será criada uma NOVA
     * conta. Ao reutilizar uma conta aberta, o vencimento original permanece.
     */
    if(
      !dataValidaFutura(
        pagamentoEm
      )
    ){
      status(
        'INFORME UMA DATA FUTURA EM DD/MM/AAAA.',
        true
      );

      pagamento?.focus();

      return;
    }

    const resultado =
      typeof window.scfConfirmarVendaCrediario ===
        'function'
        ? window.scfConfirmarVendaCrediario({
            cliente,
            pagamentoEm
          })
        : {
            ok:false,
            message:
              'O FLUXO DO CREDIÁRIO NÃO ESTÁ DISPONÍVEL.'
          };

    if(
      !resultado ||
      resultado.ok !==
        true ||
      !resultado.sale
    ){
      status(
        resultado?.message ||
        'NÃO FOI POSSÍVEL PREPARAR O CREDIÁRIO.',
        true
      );

      return;
    }

    requestAbertura =
      'scf-crediario-abrir-' +
      Date.now() +
      '-' +
      Math.random()
        .toString(36)
        .slice(2,8);

    const button =
      document.getElementById(
        'scfPdvCrediarioConfirm'
      );

    if(button){
      button.disabled =
        true;
    }

    status(
      'SALVANDO CREDIÁRIO E BAIXANDO ESTOQUE...',
      false
    );

    window.__scfPdvInfra.shellBridge.post(
      {
        type:
          'SCF_CREDIARIO_ABRIR',

        requestId:
          requestAbertura,

        crediarioId:
          resultado.sale.saleId,

        clienteId,

        vencimento:
          pagamentoEm,

        venda:
          resultado.sale
      },
      '*'
    );
  }

  function fecharPainelCrediario(){
    document.body.classList.remove(
      'scf-crediario-open',
      'scf-crediario-detail-open',
      'scf-crediario-payment-edit-open'
    );

    const panel =
      painel();

    if(panel){
      panel.hidden =
        true;

      panel.setAttribute(
        'aria-hidden',
        'true'
      );
    }
  }

  function restaurarCabecalhoProdutos(){
    const header =
      document.querySelector(
        '#scfPdvUnifiedHeader'
      );

    if(
      header &&
      cabecalhoProdutosHtml
    ){
      header.innerHTML =
        cabecalhoProdutosHtml;
    }
  }

  /*
   * LISTA DE CLIENTES DO CREDIÁRIO:
   * enquanto CLIENTE | WHATSAPP | SITUAÇÃO estiver na tela, QTD e
   * CÓDIGO DE BARRAS não fazem parte do fluxo operacional.
   *
   * Eles são realmente desabilitados (não apenas visualmente) e voltam
   * automaticamente assim que o operador fecha a lista ou entra em PAGAR.
   */
  function sincronizarInputsOperacionaisListaCrediario(){
    const listaAberta =
      document.body.classList.contains(
        'scf-crediario-list-open'
      );

    const quantidade =
      document.getElementById(
        'productQuantity'
      );

    const codigo =
      document.getElementById(
        'productBarcode'
      );

    [
      quantidade,
      codigo
    ].forEach(
      function(input){
        if(!input){
          return;
        }

        input.disabled =
          listaAberta;

        input.setAttribute(
          'aria-disabled',
          listaAberta
            ? 'true'
            : 'false'
        );

        if(listaAberta){
          input.blur();
          input.dataset.scfCrediarioListaDisabled =
            '1';
        }else{
          delete input.dataset.scfCrediarioListaDisabled;
        }
      }
    );

    return listaAberta;
  }

  window.scfSincronizarInputsOperacionaisListaCrediario =
    sincronizarInputsOperacionaisListaCrediario;

  function abrirAreaLista(){
    const view =
      document.getElementById(
        'fiscalProductsView'
      );

    if(view){
      view.hidden =
        false;
    }

    document.body.classList.add(
      'fiscal-products-view-open',
      'scf-crediario-list-open'
    );

    document.body.classList.remove(
      'scf-crediario-detail-open',
      'scf-crediario-open'
    );

    sincronizarInputsOperacionaisListaCrediario();

    fecharPainelCrediario();

    /*
     * F5 / LISTA DE CLIENTES:
     * mantém o formulário VENDAS NO CREDIÁRIO visível no card direito.
     * Ele fica em modo de consulta enquanto não existe uma venda preparada;
     * o botão CONFIRMAR permanece inativo para não criar conta sem produtos.
     */
    const panelLista =
      criarPainel();

    if(panelLista){
      panelLista.hidden =
        false;

      panelLista.setAttribute(
        'aria-hidden',
        'false'
      );

      const tituloLista =
        panelLista.querySelector(
          '.scf-pdv-crediario-title'
        );

      if(tituloLista){
        tituloLista.textContent =
          'VENDAS NO CREDIÁRIO';
      }
    }

    const cpfLista =
      document.getElementById(
        'scfPdvCrediarioCpf'
      );

    const whatsappLista =
      document.getElementById(
        'scfPdvCrediarioWhatsapp'
      );

    const clienteLista =
      document.getElementById(
        'scfPdvCrediarioCliente'
      );

    const pagamentoLista =
      document.getElementById(
        'scfPdvCrediarioPagamento'
      );

    const confirmarLista =
      document.getElementById(
        'scfPdvCrediarioConfirm'
      );

    if(cpfLista){
      cpfLista.value = '';
      cpfLista.readOnly = false;
      cpfLista.disabled = false;
    }

    if(whatsappLista){
      whatsappLista.value = '';
      whatsappLista.readOnly = true;
      whatsappLista.disabled = false;
    }

    if(clienteLista){
      clienteLista.value = '';
      clienteLista.disabled = false;
    }

    if(pagamentoLista){
      pagamentoLista.value = '';
      pagamentoLista.readOnly = false;
      pagamentoLista.disabled = false;
    }

    if(confirmarLista){
      confirmarLista.hidden = false;
      confirmarLista.disabled = true;
      confirmarLista.textContent =
        'CONFIRMAR';
    }

    status(
      '',
      false
    );

    /* Atualiza também o dropdown exibido no card direito. */
    solicitarClientes();
  }

  function renderListaCarregando(){
    const header =
      document.querySelector(
        '#scfPdvUnifiedHeader'
      );

    const list =
      document.getElementById(
        'fiscalProductsList'
      );

    if(header){
      header.innerHTML =
        '<span>CLIENTE</span><span>WHATSAPP</span><span>SITUAÇÃO</span>';
    }

    if(list){
      list.innerHTML =
        '<div class="scf-crediario-list-empty">CARREGANDO CREDIÁRIOS...</div>';
    }
  }

  function solicitarLista(
    silencioso
  ){
    if(requestLista){
      return false;
    }

    requestListaSilenciosa =
      silencioso === true;

    requestLista =
      'scf-crediario-lista-' +
      Date.now() +
      '-' +
      Math.random()
        .toString(36)
        .slice(2,8);

    window.__scfPdvInfra.shellBridge.post(
      {
        type:
          'SCF_CREDIARIO_LISTAR',

        requestId:
          requestLista,

        silencioso:
          requestListaSilenciosa
      },
      '*'
    );

    return true;
  }

  function renderLista(crediarios){
    const header =
      document.querySelector(
        '#scfPdvUnifiedHeader'
      );

    const list =
      document.getElementById(
        'fiscalProductsList'
      );

    if(!list){
      return;
    }

    if(header){
      header.innerHTML =
        '<span>CLIENTE</span><span>WHATSAPP</span><span>SITUAÇÃO</span>';
    }

    list.replaceChildren();

    const registros =
      Array.isArray(
        crediarios
      )
        ? crediarios
        : [];

    if(
      registros.length ===
        0
    ){
      const vazio =
        document.createElement(
          'div'
        );

      vazio.className =
        'scf-crediario-list-empty';

      vazio.textContent =
        'NENHUM CREDIÁRIO EM ABERTO.';

      list.appendChild(
        vazio
      );

      return;
    }

    registros.forEach(
      function(conta){
        const row =
          document.createElement(
            'div'
          );

        row.className =
          'scf-crediario-list-row';

        row.dataset.crediarioId =
          texto(
            conta.crediarioId ||
            conta.saleId
          );

        const cliente =
          document.createElement(
            'span'
          );

        cliente.className =
          'scf-crediario-list-client';

        cliente.textContent =
          nomeCliente(
            conta
          ) ||
          'CLIENTE';

        const whatsapp =
          document.createElement(
            'span'
          );

        whatsapp.className =
          'scf-crediario-list-whatsapp';

        whatsapp.textContent =
          formatarWhatsappCrediario(
            conta.whatsapp
          ) ||
          '-';

        const statusCell =
          document.createElement(
            'span'
          );

        statusCell.className =
          'scf-crediario-list-status';

        const pagar =
          document.createElement(
            'button'
          );

        pagar.type =
          'button';

        pagar.className =
          'scf-crediario-list-pay';

        pagar.textContent =
          'PAGAR';

        pagar.addEventListener(
          'click',
          function(event){
            event.preventDefault();
            event.stopPropagation();

            solicitarDetalhe(
              row.dataset.crediarioId,
              'pagar'
            );
          }
        );

        statusCell.appendChild(
          pagar
        );

        row.append(
          cliente,
          whatsapp,
          statusCell
        );

        row.addEventListener(
          'click',
          function(){
            solicitarDetalhe(
              row.dataset.crediarioId,
              'visualizar'
            );
          }
        );

        list.appendChild(
          row
        );
      }
    );
  }

  function solicitarDetalhe(
    crediarioId,
    acao
  ){
    const id =
      texto(
        crediarioId
      );

    if(
      !id ||
      requestDetalhe
    ){
      return;
    }

    acaoDetalhePendente =
      acao === 'pagar'
        ? 'pagar'
        : 'visualizar';

    requestDetalhe =
      'scf-crediario-detalhe-' +
      Date.now() +
      '-' +
      Math.random()
        .toString(36)
        .slice(2,8);

    window.__scfPdvInfra.shellBridge.post(
      {
        type:
          'SCF_CREDIARIO_OBTER',

        requestId:
          requestDetalhe,

        crediarioId:
          id,

        acao:
          acaoDetalhePendente
      },
      '*'
    );
  }

  function renderProdutosCrediario(detalhe){
    const header =
      document.querySelector(
        '#scfPdvUnifiedHeader'
      );

    const list =
      document.getElementById(
        'fiscalProductsList'
      );

    if(!list){
      return;
    }

    restaurarCabecalhoProdutos();

    list.replaceChildren();

    const itens =
      Array.isArray(
        detalhe?.itens
      )
        ? detalhe.itens
        : [];

    itens.forEach(
      function(item,index){
        const row =
          document.createElement(
            'div'
          );

        row.className =
          'fiscal-desktop-danfe-row scf-crediario-product-row';

        const dados = [
          String(
            Number(
              item.itemNumber
            ) ||
            index +
              1
          ).padStart(3,'0'),

          texto(
            item.description ||
            item.name
          ),

          Number(
            item.quantity ||
            0
          ).toLocaleString(
            'pt-BR',
            {
              maximumFractionDigits:3
            }
          ),

          texto(
            item.unit ||
            'UN'
          ).toUpperCase(),

          Number(
            item.unitValue ||
            0
          ).toLocaleString(
            'pt-BR',
            {
              style:'currency',
              currency:'BRL'
            }
          ),

          item.scfPreviewNovo === true
            ? 'AGUARDANDO'
            : 'INCLUIDO'
        ];

        const classes = [
          'item',
          'descricao',
          'qtd',
          'un',
          'vl-unit',
          'status'
        ];

        dados.forEach(
          function(valor,posicao){
            const cell =
              document.createElement(
                'div'
              );

            cell.className =
              'fiscal-desktop-danfe-cell ' +
              classes[posicao];

            cell.textContent =
              valor;

            row.appendChild(
              cell
            );
          }
        );

        list.appendChild(
          row
        );
      }
    );
  }

  function exibirDetalheNoPainel(
    detalhe,
    aguardarF1Pagamento
  ){
    criarPainel();

    const conta =
      detalhe?.conta ||
      {};

    crediarioDetalheAtual =
      detalhe;

    crediarioDomain.paymentAwaitingF1 =
      aguardarF1Pagamento ===
        true;

    document.body.classList.remove(
      'scf-crediario-list-open'
    );

    document.body.classList.add(
      'scf-crediario-open',
      'scf-crediario-detail-open',
      'fiscal-products-view-open'
    );

    document.body.classList.toggle(
      'scf-crediario-payment-edit-open',
      aguardarF1Pagamento === true
    );

    /*
     * Saiu da lista CLIENTE | WHATSAPP | SITUAÇÃO:
     * QTD e CÓDIGO voltam a funcionar para a venda aberta.
     */
    sincronizarInputsOperacionaisListaCrediario();

    const panel =
      painel();

    if(panel){
      panel.hidden =
        false;

      panel.setAttribute(
        'aria-hidden',
        'false'
      );
    }

    const title =
      panel?.querySelector(
        '.scf-pdv-crediario-title'
      );

    if(title){
      title.textContent =
        'VENDAS NO CREDIÁRIO';
    }

    const cpf =
      document.getElementById(
        'scfPdvCrediarioCpf'
      );

    const whatsapp =
      document.getElementById(
        'scfPdvCrediarioWhatsapp'
      );

    const select =
      document.getElementById(
        'scfPdvCrediarioCliente'
      );

    const pagamento =
      document.getElementById(
        'scfPdvCrediarioPagamento'
      );

    const confirmar =
      document.getElementById(
        'scfPdvCrediarioConfirm'
      );

    if(cpf){
      cpf.value =
        formatarCpfCrediario(
          conta.cpf
        );

      cpf.readOnly =
        true;

      cpf.disabled =
        false;
    }

    if(whatsapp){
      whatsapp.value =
        formatarWhatsappCrediario(
          conta.whatsapp
        );

      whatsapp.readOnly =
        true;

      whatsapp.disabled =
        false;
    }

    if(select){
      select.replaceChildren();

      const option =
        document.createElement(
          'option'
        );

      option.value =
        texto(
          conta.clienteId
        );

      option.textContent =
        nomeCliente(
          conta
        ) ||
        'CLIENTE';

      option.selected =
        true;

      select.appendChild(
        option
      );

      select.disabled =
        true;
    }

    if(pagamento){
      pagamento.value =
        formatarDataCrediario(
          conta.vencimento
        );

      pagamento.readOnly =
        true;

      pagamento.disabled =
        false;
    }

    if(confirmar){
      confirmar.hidden =
        aguardarF1Pagamento ===
          true
            ? false
            : true;

      confirmar.disabled =
        false;

      confirmar.textContent =
        'F1 FINALIZAR';
    }

    if(
      aguardarF1Pagamento ===
        true
    ){
      resetarEtapaPagamentoCrediario();

      definirResumoConfirmadoCrediario(
        detalhe
      );

      atualizarBotaoPrincipalCrediario();
    }else{
      crediarioResumoConfirmado =
        '';

      crediarioEdicaoPendente =
        false;
    }

    /*
     * No detalhe de um crediário aberto não exibimos mais a faixa
     * "A RECEBER — F1 FINALIZAR | F3 CANCELA | F7 VOLTA".
     *
     * O elemento permanece disponível para mensagens reais de erro
     * em outros momentos do formulário, mas fica vazio aqui e,
     * pelo CSS :empty, não ocupa espaço visual.
     */
    status(
      '',
      false
    );

    /*
     * No modo PAGAR / venda aberta, o formulário do cliente é apenas
     * informativo para este momento. O foco operacional fica no código
     * de barras para o operador poder acrescentar itens sem clicar no campo.
     */
    if(
      crediarioDomain.paymentAwaitingF1 ===
        true
    ){
      const focarBarcode =
        function(){
          const barcode =
            document.getElementById(
              'productBarcode'
            );

          if(!barcode){
            return;
          }

          try{
            barcode.focus({
              preventScroll:true
            });
          }catch(error){
            try{
              barcode.focus();
            }catch(ignore){}
          }
        };

      setTimeout(
        focarBarcode,
        0
      );

      setTimeout(
        focarBarcode,
        120
      );
    }
  }

  /*
   * Chamado pelo F1 depois que o operador clicou PAGAR e conferiu
   * produtos + cliente no formulário VENDA NO CREDIÁRIO.
   *
   * Só aqui o pagamento/fiscal é preparado. Até este momento a conta
   * continua apenas A RECEBER e nenhuma forma de pagamento foi escolhida.
   */
  window.scfFinalizarPagamentoCrediarioSelecionado =
    function(){
      if(
        crediarioDomain.paymentAwaitingF1 !== true ||
        !crediarioDetalheAtual ||
        requestAtualizacaoItens
      ){
        return false;
      }

      if(
        crediarioEtapaPagamento ===
          'PARCIAL'
      ){
        return finalizarPagamentoParcialCrediario();
      }

      if(
        crediarioEtapaPagamento ===
          'ESCOLHA'
      ){
        return false;
      }

      /*
       * Se a pesquisa F4 estiver aberta, fecha somente a pesquisa antes
       * de confirmar os itens ou avançar para o pagamento.
       */
      if(
        typeof window.__scfPdvDesativarBuscaF4 ===
          'function'
      ){
        try{
          window.__scfPdvDesativarBuscaF4();
        }catch(error){}
      }

      const edicao =
        typeof window.scfObterEdicaoCrediarioPdv === 'function'
          ? window.scfObterEdicaoCrediarioPdv()
          : null;

      if(
        !edicao ||
        edicao.ok !== true ||
        !edicao.crediarioId
      ){
        console.error(
          'Não foi possível obter a composição atual da venda em crediário.'
        );
        return false;
      }

      if(
        Number(edicao.quantidadeAtiva) <= 0 ||
        Number(edicao.total) <= 0
      ){
        console.error(
          'O crediário precisa possuir ao menos um item ativo.'
        );
        return false;
      }

      if(
        calcularEdicaoPendenteCrediario() ===
          true
      ){
        requestAtualizacaoItens =
          'scf-crediario-atualizar-' +
          Date.now() +
          '-' +
          Math.random().toString(36).slice(2,8);

        atualizarBotaoPrincipalCrediario();

        window.__scfPdvInfra.shellBridge.post(
          {
            type:'SCF_CREDIARIO_ATUALIZAR_ITENS',
            requestId:requestAtualizacaoItens,
            crediarioId:edicao.crediarioId,
            produtos:edicao.produtos,
            total:edicao.total
          },
          '*'
        );

        return true;
      }

      /*
       * A composição está confirmada. F1 não abre mais as formas de
       * pagamento diretamente: primeiro oferece TOTAL ou PARCIAL.
       */
      return mostrarEscolhaPagamentoCrediario();
    };

  /*
   * F7 nas formas de pagamento:
   * PIX / DÉBITO / CRÉDITO / DINHEIRO -> VENDA NO CREDIÁRIO.
   *
   * Não volta para a lista de clientes. Retorna para o detalhe da venda
   * aberta, restaura F1 FINALIZAR e devolve o foco ao CÓDIGO DE BARRAS.
   */
  window.scfVoltarPagamentoParaCrediario =
    function(){
      if(
        crediarioDomain.paymentMethodsOpen !==
          true ||
        !crediarioDetalheAtual
      ){
        return false;
      }

      if(
        typeof window.scfCancelarPagamentoCrediarioEmAndamento ===
          'function'
      ){
        try{
          window.scfCancelarPagamentoCrediarioEmAndamento();
        }catch(error){
          console.error(
            'Não foi possível fechar as formas de pagamento do crediário:',
            error
          );
        }
      }else if(
        typeof window.scfCloseFinalizePhotoPanel ===
          'function'
      ){
        try{
          window.scfCloseFinalizePhotoPanel();
        }catch(error){}
      }

      crediarioDomain.paymentMethodsOpen =
        false;

      document.body.classList.remove(
        'scf-crediario-payment-methods-open'
      );

      /*
       * Volta à etapa operacional, não à tela TOTAL/PARCIAL.
       * Um novo F1 apresentará novamente PAGAR TOTAL / PAGAR PARCIAL.
       */
      resetarEtapaPagamentoCrediario();

      crediarioDomain.paymentAwaitingF1 =
        true;

      exibirDetalheNoPainel(
        crediarioDetalheAtual,
        true
      );

      /*
       * Alguns componentes do card direito ainda concluem o blur/focus
       * no mesmo ciclo do teclado. Reforçamos o foco após a restauração.
       */
      const focarCodigoBarras =
        function(){
          const barcode =
            document.getElementById(
              'productBarcode'
            );

          if(
            !barcode ||
            barcode.disabled
          ){
            return;
          }

          try{
            barcode.focus({
              preventScroll:true
            });
          }catch(error){
            try{
              barcode.focus();
            }catch(ignore){}
          }
        };

      focarCodigoBarras();

      window.setTimeout(
        focarCodigoBarras,
        0
      );

      window.setTimeout(
        focarCodigoBarras,
        80
      );

      window.setTimeout(
        focarCodigoBarras,
        160
      );

      return true;
    };


  window.scfAbrirListaCrediario =
    function(){
      crediarioDetalheAtual =
        null;

      requestAtualizacaoItens =
        '';

      crediarioResumoConfirmado =
        '';

      crediarioEdicaoPendente =
        false;

      crediarioDomain.paymentAwaitingF1 =
        false;

      resetarEtapaPagamentoCrediario();

      if(
        typeof window.scfLimparEdicaoCrediarioPdv === 'function'
      ){
        window.scfLimparEdicaoCrediarioPdv();
      }

      abrirAreaLista();

      if(
        crediarioListaCachePronto ===
          true
      ){
        /*
         * Mesmo padrão de VENDAS:
         * abre instantaneamente com o último cache completo.
         */
        renderLista(
          crediariosListaCache
        );

        /*
         * Confere a VPS silenciosamente sem apagar a lista visível.
         */
        solicitarLista(
          true
        );

        return true;
      }

      renderListaCarregando();

      /*
       * Se o pré-carregamento já estiver em curso, solicitarLista()
       * simplesmente reutiliza a requisição pendente.
       */
      solicitarLista(
        false
      );

      return true;
    };

  /*
   * Fecha somente a LISTA do crediário e restaura o estado visual
   * padrão do PDV. Não cancela venda, não mexe em estoque, financeiro
   * ou caixa.
   *
   * O handler principal do teclado chama esta rotina no segundo F5
   * e, logo depois, renderiza novamente a tabela normal de produtos.
   */
  window.scfFecharListaCrediario =
    function(){
      /*
       * Uma atualização silenciosa pode terminar com a lista fechada.
       * Não zeramos requestLista: a resposta continua útil para o cache.
       */
      requestDetalhe =
        '';

      requestCancelamento =
        '';

      requestAtualizacaoItens =
        '';

      acaoDetalhePendente =
        '';

      crediarioDetalheAtual =
        null;

      crediarioDomain.paymentAwaitingF1 =
        false;

      resetarEtapaPagamentoCrediario();

      if(
        typeof window.scfLimparEdicaoCrediarioPdv === 'function'
      ){
        window.scfLimparEdicaoCrediarioPdv();
      }

      fecharPainelCrediario();

      document.body.classList.remove(
        'scf-crediario-list-open',
        'scf-crediario-detail-open',
        'scf-crediario-open',
        'scf-crediario-payment-edit-open'
      );

      sincronizarInputsOperacionaisListaCrediario();

      restaurarCabecalhoProdutos();

      const list =
        document.getElementById(
          'fiscalProductsList'
        );

      if(list){
        list.replaceChildren();
      }

      return true;
    };

  window.scfVoltarParaListaCrediario =
    function(){
      if(
        typeof window.__scfPdvDesativarBuscaF4 ===
          'function'
      ){
        try{
          window.__scfPdvDesativarBuscaF4();
        }catch(error){}
      }

      requestAtualizacaoItens =
        '';

      crediarioResumoConfirmado =
        '';

      crediarioEdicaoPendente =
        false;

      crediarioDomain.paymentAwaitingF1 =
        false;

      resetarEtapaPagamentoCrediario();

      if(
        typeof window.scfLimparEdicaoCrediarioPdv === 'function'
      ){
        window.scfLimparEdicaoCrediarioPdv();
      }

      fecharPainelCrediario();

      document.body.classList.remove(
        'scf-crediario-detail-open'
      );

      abrirAreaLista();

      /*
       * F7 — retorno instantâneo para a lista:
       * se já existe uma fotografia válida em memória, mostra imediatamente
       * sem trocar a tabela por "CARREGANDO CREDIÁRIOS...".
       * A atualização nova continua acontecendo silenciosamente.
       */
      if(
        crediarioListaCachePronto ===
          true
      ){
        renderLista(
          crediariosListaCache
        );

        solicitarLista(
          true
        );

        return true;
      }

      renderListaCarregando();

      solicitarLista(
        false
      );

      return true;
    };

  window.scfCancelarCrediarioAberto =
    function(crediarioId){
      const id =
        texto(
          crediarioId ||
          crediarioDetalheAtual
            ?.conta
            ?.crediarioId
      );

      if(
        !id ||
        requestCancelamento
      ){
        return false;
      }

      if(
        !window.confirm(
          'Cancelar este crediário e devolver os produtos ao estoque?'
        )
      ){
        return false;
      }

      requestCancelamento =
        'scf-crediario-cancelar-' +
        Date.now() +
        '-' +
        Math.random()
          .toString(36)
          .slice(2,8);

      status(
        'CANCELANDO CREDIÁRIO E DEVOLVENDO ESTOQUE...',
        false
      );

      window.__scfPdvInfra.shellBridge.post(
        {
          type:
            'SCF_CREDIARIO_CANCELAR',

          requestId:
            requestCancelamento,

          crediarioId:
            id
        },
        '*'
      );

      return true;
    };

  window.__scfPdvInfra.eventBus.on('scf:crediario-venda-pronta',
    function(event){
      abrirNovo(
        event?.detail
      );
    }
  );

  /*
   * F3 em um detalhe de CREDIÁRIO cancela a conta e estorna estoque,
   * em vez de executar o cancelamento comum da venda vazia do PDV.
   */
  window.addEventListener(
    'keydown',
    function(event){
      if(
        String(
          event.key ||
          ''
        ) !== 'F3' ||
        !document.body.classList.contains(
          'scf-crediario-detail-open'
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

      window.scfCancelarCrediarioAberto();
    },
    true
  );

  window.__scfPdvInfra.shellBridge.onMessage(
    function(event){
      const data =
        event?.data &&
        typeof event.data === 'object'
          ? event.data
          : null;

      if(!data){
        return;
      }

      /*
       * Pré-cache do CREDIÁRIO:
       * assim que o PDV principal é aberto, consulta uma vez em segundo
       * plano. Na maioria dos casos o primeiro F5 já encontra a lista pronta.
       */
      if(
        data.type ===
          'SCF_FISCAL_HOME_ABRIR' &&
        crediarioPreloadSolicitado !==
          true &&
        crediarioListaCachePronto !==
          true &&
        !requestLista
      ){
        crediarioPreloadSolicitado =
          true;

        window.setTimeout(
          function(){
            if(
              !requestLista &&
              crediarioListaCachePronto !==
                true
            ){
              solicitarLista(
                true
              );
            }
          },
          250
        );
      }

      if(
        data.type ===
          'SCF_CLIENTES_LISTA_RESULTADO'
      ){
        clientes =
          Array.isArray(
            data.clientes
          )
            ? data.clientes.slice()
            : [];

        customerDomain.customers =
          clientes.slice();

        if(
          (
            document.body.classList.contains(
              'scf-crediario-open'
            ) ||
            document.body.classList.contains(
              'scf-crediario-list-open'
            )
          ) &&
          !document.body.classList.contains(
            'scf-crediario-detail-open'
          )
        ){
          const select =
            document.getElementById(
              'scfPdvCrediarioCliente'
            );

          if(
            aguardandoPrimeiraListaClientes
          ){
            aguardandoPrimeiraListaClientes =
              false;

            clienteDropdownEmUso =
              false;

            clientesAtualizacaoPendente =
              false;

            renderClientes(
              true
            );

            if(select){
              select.disabled =
                false;
            }

            const quantidadeUsavel =
              clientesFiltradosOrdenados()
                .length;

            status(
              quantidadeUsavel > 0
                ? ''
                : 'NENHUM CLIENTE PESSOA FÍSICA COM CPF VÁLIDO FOI ENCONTRADO.',
              quantidadeUsavel === 0
            );
          }else{
            renderClientes();

            if(select){
              select.disabled =
                false;
            }
          }
        }

        return;
      }

      if(
        data.type ===
          'SCF_CREDIARIO_ABERTO' &&
        (
          !requestAbertura ||
          data.requestId ===
            requestAbertura
        )
      ){
        requestAbertura =
          '';

        fecharPainelCrediario();

        /*
         * Limpa os produtos SOMENTE depois que backend confirmou:
         * conta a receber + itens + baixa de estoque.
         */
        if(
          typeof window.scfCancelCurrentSaleFromKeyboard ===
            'function'
        ){
          window.scfCancelCurrentSaleFromKeyboard({
            crediarioSalvo:
              true
          });
        }

        vendaPreparada =
          null;

        /*
         * A coleção mudou. Reaquece o cache em segundo plano para que o
         * próximo F5 já reflita o novo crediário.
         */
        if(!requestLista){
          solicitarLista(
            true
          );
        }

        return;
      }

      if(
        data.type ===
          'SCF_CREDIARIO_ABERTURA_ERRO' &&
        (
          !requestAbertura ||
          data.requestId ===
            requestAbertura
        )
      ){
        requestAbertura =
          '';

        const button =
          document.getElementById(
            'scfPdvCrediarioConfirm'
          );

        if(button){
          button.disabled =
            false;
        }

        status(
          data.message ||
          'NÃO FOI POSSÍVEL SALVAR O CREDIÁRIO.',
          true
        );

        return;
      }

      if(
        data.type ===
          'SCF_CREDIARIO_LISTA_RESULTADO'
      ){
        if(
          !requestLista ||
          (
            data.requestId &&
            data.requestId !==
              requestLista
          )
        ){
          return;
        }

        requestLista =
          '';

        requestListaSilenciosa =
          false;

        crediariosListaCache =
          Array.isArray(
            data.crediarios
          )
            ? data.crediarios.slice()
            : [];

        crediarioListaCachePronto =
          true;

        if(
          vendaPreparada &&
          document.body.classList.contains(
            'scf-crediario-open'
          )
        ){
          verificacaoCrediarioF5Pendente =
            false;

          const selectAtual =
            document.getElementById(
              'scfPdvCrediarioCliente'
            );

          const clienteAtual =
            clientePorId(
              selectAtual?.value
            );

          if(clienteAtual){
            sinalizarCrediarioAbertoDoCliente(
              clienteAtual
            );
          }
        }

        /*
         * Pré-carga com o card fechado: somente atualiza memória.
         * Com a lista aberta, troca a tabela de uma vez.
         */
        if(
          document.body.classList.contains(
            'scf-crediario-list-open'
          )
        ){
          renderLista(
            crediariosListaCache
          );
        }

        if(
          confirmacaoNovoCrediarioAguardandoLista ===
            true
        ){
          confirmacaoNovoCrediarioAguardandoLista =
            false;

          const button =
            document.getElementById(
              'scfPdvCrediarioConfirm'
            );

          if(button){
            button.disabled =
              false;
          }

          window.setTimeout(
            confirmarNovoCrediario,
            0
          );
        }

        return;
      }

      if(
        data.type ===
          'SCF_CREDIARIO_LISTA_ERRO'
      ){
        if(
          !requestLista ||
          (
            data.requestId &&
            data.requestId !==
              requestLista
          )
        ){
          return;
        }

        const eraSilenciosa =
          requestListaSilenciosa ===
            true;

        requestLista =
          '';

        requestListaSilenciosa =
          false;

        if(
          confirmacaoNovoCrediarioAguardandoLista ===
            true
        ){
          confirmacaoNovoCrediarioAguardandoLista =
            false;

          verificacaoCrediarioF5Pendente =
            true;

          const button =
            document.getElementById(
              'scfPdvCrediarioConfirm'
            );

          if(button){
            button.disabled =
              false;
          }

          status(
            data.message ||
            'NÃO FOI POSSÍVEL VERIFICAR OS CREDIÁRIOS EM ABERTO. TENTE CONFIRMAR NOVAMENTE.',
            true
          );

          return;
        }

        /*
         * Igual ao Histórico de VENDAS:
         * erro numa conferência silenciosa não apaga o último cache válido.
         */
        if(
          eraSilenciosa ===
            true &&
          crediarioListaCachePronto ===
            true
        ){
          return;
        }

        /*
         * Erro em pré-carregamento com a tela fechada também não aparece
         * no PDV. O próximo F5 tentará novamente.
         */
        if(
          !document.body.classList.contains(
            'scf-crediario-list-open'
          )
        ){
          return;
        }

        const list =
          document.getElementById(
            'fiscalProductsList'
          );

        if(list){
          const erro =
            document.createElement(
              'div'
            );

          erro.className =
            'scf-crediario-list-empty is-error';

          erro.textContent =
            data.message ||
            'NÃO FOI POSSÍVEL CARREGAR OS CREDIÁRIOS.';

          list.replaceChildren(
            erro
          );
        }

        return;
      }

      if(
        data.type ===
          'SCF_CREDIARIO_DETALHE_RESULTADO'
      ){
        requestDetalhe =
          '';

        const detalhe = {
          conta:
            data.conta ||
            {},

          itens:
            Array.isArray(
              data.itens
            )
              ? data.itens
              : []
        };

        crediarioDetalheAtual =
          detalhe;

        if(
          reutilizacaoCrediarioF5
        ){
          montarPreviaReutilizacaoCrediarioF5(
            detalhe
          );

          return;
        }

        const acao =
          data.acao ||
          acaoDetalhePendente;

        if(
          acao ===
            'pagar'
        ){
          /*
           * PAGAR transforma o crediário em uma VENDA ABERTA editável.
           * TOTAL, inclusão, alteração de quantidade e F2 passam a usar
           * exatamente as mesmas rotinas da venda normal.
           */
          const carregamento =
            typeof window.scfCarregarCrediarioAbertoNoPdv === 'function'
              ? window.scfCarregarCrediarioAbertoNoPdv(detalhe)
              : { ok:false };

          if(
            !carregamento ||
            carregamento.ok !== true
          ){
            console.error(
              carregamento?.message ||
              'Não foi possível carregar os itens do crediário no PDV.'
            );
            return;
          }

          exibirDetalheNoPainel(
            detalhe,
            true
          );

          /*
           * CREDIÁRIO EM ABERTO:
           * depois de carregar os itens e preencher o formulário do cliente,
           * o foco deve voltar ao CÓDIGO DE BARRAS para permitir adicionar
           * novos produtos imediatamente, exatamente como no PDV normal.
           *
           * Usamos dois ciclos curtos porque algumas rotinas do formulário
           * ainda atualizam o DOM logo após exibirDetalheNoPainel().
           */
          const focarCodigoBarrasCrediario =
            function(){
              const barcode =
                document.getElementById(
                  'productBarcode'
                );

              if(!barcode){
                return;
              }

              try{
                barcode.focus({
                  preventScroll:true
                });
              }catch(error){
                try{
                  barcode.focus();
                }catch(ignore){}
              }

              try{
                barcode.select();
              }catch(error){}
            };

          focarCodigoBarrasCrediario();

          setTimeout(
            focarCodigoBarrasCrediario,
            0
          );

          setTimeout(
            focarCodigoBarrasCrediario,
            80
          );

          return;
        }

        renderProdutosCrediario(
          detalhe
        );

        exibirDetalheNoPainel(
          detalhe,
          false
        );

        return;
      }

      if(
        data.type ===
          'SCF_CREDIARIO_ITENS_ATUALIZADOS'
      ){
        if(
          !requestAtualizacaoItens ||
          (
            data.requestId &&
            data.requestId !== requestAtualizacaoItens
          )
        ){
          return;
        }

        requestAtualizacaoItens = '';

        if(
          reutilizacaoCrediarioF5
        ){
          const detalheAtualizadoF5 = {
            conta:
              data.conta ||
              crediarioDetalheAtual?.conta ||
              {},

            itens:
              Array.isArray(data.itens)
                ? data.itens
                : []
          };

          reutilizacaoCrediarioF5 =
            null;

          confirmacaoNovoCrediarioAguardandoLista =
            false;

          verificacaoCrediarioF5Pendente =
            false;

          /*
           * Só limpa a venda local depois que o backend confirmou a atualização
           * da MESMA conta e a baixa de estoque dos itens recém-incluídos.
           */
          if(
            typeof window.scfCancelCurrentSaleFromKeyboard ===
              'function'
          ){
            window.scfCancelCurrentSaleFromKeyboard({
              crediarioSalvo:
                true
            });
          }

          vendaPreparada =
            null;

          const view =
            document.getElementById(
              'fiscalProductsView'
            );

          if(view){
            view.hidden =
              false;
          }

          renderProdutosCrediario(
            detalheAtualizadoF5
          );

          exibirDetalheNoPainel(
            detalheAtualizadoF5,
            false
          );

          /*
           * Reaquece a lista em segundo plano para que o próximo F5 enxergue
           * imediatamente a conta já atualizada.
           */
          if(!requestLista){
            solicitarLista(
              true
            );
          }

          return;
        }

        if(
          !document.body.classList.contains(
            'scf-crediario-detail-open'
          )
        ){
          return;
        }

        const detalheAtualizado = {
          conta:data.conta || {},
          itens:Array.isArray(data.itens) ? data.itens : []
        };

        crediarioDetalheAtual =
          detalheAtualizado;

        if(
          typeof window.scfCarregarCrediarioAbertoNoPdv === 'function'
        ){
          window.scfCarregarCrediarioAbertoNoPdv(
            detalheAtualizado
          );
        }

        crediarioDomain.paymentAwaitingF1 =
          true;

        definirResumoConfirmadoCrediario(
          detalheAtualizado
        );

        exibirDetalheNoPainel(
          detalheAtualizado,
          true
        );

        atualizarBotaoPrincipalCrediario();

        return;
      }

      if(
        data.type ===
          'SCF_CREDIARIO_ITENS_ATUALIZACAO_ERRO'
      ){
        if(
          !requestAtualizacaoItens ||
          (
            data.requestId &&
            data.requestId !== requestAtualizacaoItens
          )
        ){
          return;
        }

        requestAtualizacaoItens = '';

        if(
          reutilizacaoCrediarioF5
        ){
          const button =
            document.getElementById(
              'scfPdvCrediarioConfirm'
            );

          if(button){
            button.disabled = false;
            button.textContent =
              'CONFIRMAR';
          }

          status(
            data.message ||
            'NÃO FOI POSSÍVEL ADICIONAR OS PRODUTOS AO CREDIÁRIO EXISTENTE. TENTE CONFIRMAR NOVAMENTE.',
            true
          );

          return;
        }

        status(
          data.message ||
          'NÃO FOI POSSÍVEL ATUALIZAR A VENDA EM CREDIÁRIO.',
          true
        );

        atualizarBotaoPrincipalCrediario();

        return;
      }

      if(
        data.type ===
          'SCF_CREDIARIO_DETALHE_ERRO'
      ){
        requestDetalhe =
          '';

        if(
          reutilizacaoCrediarioF5
        ){
          cancelarPreviaReutilizacaoCrediarioF5();

          status(
            data.message ||
            'NÃO FOI POSSÍVEL CARREGAR O CREDIÁRIO EXISTENTE.',
            true
          );

          return;
        }

        console.error(
          data.message ||
          'Não foi possível carregar o crediário.'
        );

        return;
      }

      if(
        data.type ===
          'SCF_CREDIARIO_CANCELADO'
      ){
        requestCancelamento =
          '';

        crediarioDetalheAtual =
          null;

        crediarioDomain.paymentAwaitingF1 =
          false;

        window.scfVoltarParaListaCrediario();

        return;
      }

      if(
        data.type ===
          'SCF_CREDIARIO_CANCELAMENTO_ERRO'
      ){
        requestCancelamento =
          '';

        status(
          data.message ||
          'NÃO FOI POSSÍVEL CANCELAR O CREDIÁRIO.',
          true
        );

        return;
      }
    }
  );

  document.addEventListener(
    'keydown',
    function(event){
      if(
        !document.body.classList.contains(
          'scf-crediario-open'
        ) ||
        document.body.classList.contains(
          'scf-crediario-detail-open'
        )
      ){
        return;
      }

      const key =
        String(
          event.key ||
          ''
        );

      if(
        key === 'Enter'
      ){
        const target =
          event.target;

        if(
          target?.id ===
            'scfPdvCrediarioCpf'
        ){
          event.preventDefault();

          const encontrado =
            selecionarClientePorCpf();

          document.getElementById(
            encontrado
              ? 'scfPdvCrediarioPagamento'
              : 'scfPdvCrediarioCliente'
          )?.focus();

          return;
        }

        if(
          target?.id ===
            'scfPdvCrediarioCliente'
        ){
          event.preventDefault();

          document.getElementById(
            'scfPdvCrediarioPagamento'
          )?.focus();

          return;
        }

        if(
          target?.id ===
            'scfPdvCrediarioPagamento'
        ){
          event.preventDefault();

          confirmarNovoCrediario();
        }
      }
    },
    true
  );

  /*
   * Depois que uma venda/crediário termina, remove qualquer modo visual
   * residual e devolve o cabeçalho padrão do PDV.
   */
  window.__scfPdvInfra.eventBus.on('scf:nova-venda-pronta',
    function(){
      fecharPainelCrediario();

      document.body.classList.remove(
        'scf-crediario-list-open',
        'scf-crediario-detail-open'
      );

      restaurarCabecalhoProdutos();
    }
  );

  criarPainel();

  /*
   * Pré-carga garantida da lista do F5.
   *
   * O listener de SCF_FISCAL_HOME_ABRIR continua existindo, mas este
   * fallback cobre o caso em que a mensagem da página Wix chegou antes
   * deste módulo terminar de registrar o listener.
   *
   * A consulta é silenciosa: não abre a tela, não mostra CARREGANDO e
   * apenas aquece crediariosListaCache para o primeiro F5.
   */
  window.setTimeout(
    function(){
      if(
        crediarioPreloadSolicitado !==
          true &&
        crediarioListaCachePronto !==
          true &&
        !requestLista &&
        !document.body.classList.contains(
          'scf-crediario-list-open'
        )
      ){
        crediarioPreloadSolicitado =
          true;

        solicitarLista(
          true
        );
      }
    },
    0
  );
})();
