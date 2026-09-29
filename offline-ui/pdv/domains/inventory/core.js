(function(){
  'use strict';

  const inventoryDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.inventory;

  if(!inventoryDomain){
    throw new Error(
      'PDV inventory domain indisponivel.'
    );
  }

  const desktopMq = window.matchMedia('(min-width:1001px)');

  let eventosInstalados = false;

  /*
   * CACHE VISUAL DO ESTOQUE
   * -----------------------
   * Mantém a última fotografia válida em memória e pré-carrega a listagem
   * em segundo plano. Ao abrir ESTOQUE, renderiza o cache imediatamente e
   * só depois confere o backend silenciosamente.
   */
  let estoqueCachePronto = false;
  let estoqueListaCarregando = false;
  let estoqueListaRequestId = '';
  let estoqueListaSilenciosa = false;
  let estoquePreloadSolicitado = false;

  /*
   * Ordenação visual da grade de ESTOQUE.
   * Sem seleção, preserva a ordem recebida do backend.
   * Primeiro clique: crescente (A-Z / menor-maior).
   * Cliques seguintes no mesmo campo alternam crescente/decrescente.
   */
  let ordenacaoEstoqueCampo = '';
  let ordenacaoEstoqueDirecao = '';

  let pesquisaGtinEstoqueTimer = null;
  let pesquisaGtinEstoquePollTimer = null;
  let pesquisaGtinEstoqueRequestId = '';
  let pesquisaGtinEstoqueResponseId = '';
  let pesquisaGtinEstoqueAtual = '';
  let pesquisaGtinEstoqueUltimoPreenchido = null;

  /*
   * Quando o operador apaga TODO o código de barras manualmente,
   * nenhuma resposta/tarefa atrasada pode recolocar o GTIN anterior.
   */
  let codigoBarrasEstoqueLimpoToken = 0;

  let cadastroEstoqueManualRequestId = '';
  let atualizacaoProdutoEstoqueRequestId = '';
  let exclusaoProdutoEstoqueRequestId = '';
  let importacaoXmlEstoqueRequestId = '';
  let finalizacaoProdutoXmlRequestId = '';
  let produtoXmlPendenteSelecionado = null;
  let produtoEdicaoSelecionado = null;
  let produtoEdicaoEstadoOriginal = '';

  function text(value){
    return String(value ?? '').replace(/\s+/g,' ').trim();
  }

  function digits(value){
    return text(value).replace(/\D/g,'');
  }

  /*
   * CÓDIGO INTERNO DE BALANÇA — helper LOCAL da página ESTOQUE.
   *
   * Este helper precisa existir dentro deste mesmo IIFE.
   * A versão anterior estava somente dentro do script do PDV e,
   * por causa do escopo isolado dos IIFEs, o clique em CADASTRAR
   * parava com ReferenceError antes de enviar a mensagem ao Wix.
   *
   * Regra final:
   * - aceita somente 0001..0999;
   * - não completa zeros;
   * - preserva exatamente o código digitado.
   */
  function pdvCodigoInternoBalancaValido(valor){
    const codigo =
      digits(
        valor == null
          ? ''
          : valor
      );

    return (
      /^0\d{3}$/.test(codigo) &&
      codigo !== '0000'
    );
  }

  function money(value){
    const number = Number(value || 0);

    return new Intl.NumberFormat('pt-BR',{
      style:'currency',
      currency:'BRL'
    }).format(
      Number.isFinite(number)
        ? number
        : 0
    );
  }

  function aplicarOrdenacaoEstoque(lista){
    const itens =
      Array.isArray(lista)
        ? lista.slice()
        : [];

    if(
      !ordenacaoEstoqueCampo ||
      !ordenacaoEstoqueDirecao
    ){
      return itens;
    }

    const fator =
      ordenacaoEstoqueDirecao === 'desc'
        ? -1
        : 1;

    itens.sort(
      function(a,b){
        if(ordenacaoEstoqueCampo === 'nome'){
          return (
            text(a && a.nome)
              .localeCompare(
                text(b && b.nome),
                'pt-BR',
                {
                  sensitivity:'base',
                  numeric:true
                }
              ) *
            fator
          );
        }

        if(ordenacaoEstoqueCampo === 'quantidade'){
          return (
            (
              Number(a && a.quantidade || 0) -
              Number(b && b.quantidade || 0)
            ) *
            fator
          );
        }

        if(ordenacaoEstoqueCampo === 'venda'){
          return (
            (
              Number(a && a.venda || 0) -
              Number(b && b.venda || 0)
            ) *
            fator
          );
        }

        return 0;
      }
    );

    return itens;
  }

  function atualizarIndicadoresOrdenacaoEstoque(){
    document
      .querySelectorAll(
        '#scfStockTableHeader [data-stock-sort]'
      )
      .forEach(
        function(button){
          const campo =
            text(
              button.dataset
                .stockSort
            );

          const ativo =
            campo ===
              ordenacaoEstoqueCampo &&
            Boolean(
              ordenacaoEstoqueDirecao
            );

          button.dataset
            .sortDirection =
              ativo
                ? ordenacaoEstoqueDirecao
                : '';

          button.setAttribute(
            'aria-pressed',
            ativo
              ? 'true'
              : 'false'
          );

          const descricao =
            campo === 'nome'
              ? 'produtos'
              : campo === 'quantidade'
                  ? 'quantidade'
                  : 'preço de venda';

          const proximaDirecao =
            ativo &&
            ordenacaoEstoqueDirecao === 'asc'
              ? 'decrescente'
              : 'crescente';

          button.title =
            'Ordenar ' +
            descricao +
            ' em ordem ' +
            proximaDirecao;
        }
      );
  }

  function alternarOrdenacaoEstoque(campo){
    const campoNormalizado =
      text(
        campo
      );

    if(
      ![
        'nome',
        'quantidade',
        'venda'
      ].includes(
        campoNormalizado
      )
    ){
      return;
    }

    if(
      ordenacaoEstoqueCampo ===
        campoNormalizado
    ){
      ordenacaoEstoqueDirecao =
        ordenacaoEstoqueDirecao === 'asc'
          ? 'desc'
          : 'asc';
    }else{
      ordenacaoEstoqueCampo =
        campoNormalizado;

      ordenacaoEstoqueDirecao =
        'asc';
    }

    atualizarIndicadoresOrdenacaoEstoque();
    renderizar();
  }

  function setStockStatus(message){
    const status =
      document.getElementById(
        'scfStockStatus'
      );

    if(!status){
      return;
    }

    const mensagem =
      text(
        message
      );

    status.textContent =
      mensagem;

    status.classList.remove(
      'is-success',
      'is-error',
      'is-wait'
    );

    const mensagemAlta =
      mensagem.toUpperCase();

    if(
      /SUCESSO|CADASTRADO|ATUALIZADO|REFERÊNCIA LOCALIZADA/.test(
        mensagemAlta
      )
    ){
      status.classList.add(
        'is-success'
      );
    }else if(
      /ERRO|NÃO FOI|INFORME|INVÁLID|FALHA|PENDENTE FISCAL/.test(
        mensagemAlta
      )
    ){
      status.classList.add(
        'is-error'
      );
    }else if(
      /CADASTRANDO|ATUALIZANDO|CALCULANDO|AGUARDE|ENVIANDO/.test(
        mensagemAlta
      )
    ){
      status.classList.add(
        'is-wait'
      );
    }
  }

  function protegerCodigoBarrasEstoqueVazio(){
    const token =
      ++codigoBarrasEstoqueLimpoToken;

    [0, 40, 120, 260, 520].forEach(
      function(atraso){
        window.setTimeout(
          function(){
            if(
              token !==
                codigoBarrasEstoqueLimpoToken
            ){
              return;
            }

            const campo =
              document.getElementById(
                'scfStockBarcode'
              );

            if(
              !campo ||
              campo.dataset
                .scfCodigoBarrasApagado !==
                '1'
            ){
              return;
            }

            /*
             * Protege somente o estado realmente vazio.
             * Se o usuário já começou a digitar outro GTIN,
             * o listener de input remove a trava e este bloco não atua.
             */
            if(
              !digits(
                campo.value
              )
            ){
              campo.value = '';
            }
          },
          atraso
        );
      }
    );
  }

  function liberarProtecaoCodigoBarrasEstoque(
    campo
  ){
    codigoBarrasEstoqueLimpoToken +=
      1;

    if(campo){
      delete campo.dataset
        .scfCodigoBarrasApagado;
    }
  }

  function getProductsPanel(){
    return document.getElementById('fiscalProductsView');
  }

  function getPhotoFrame(){
    return document.querySelector(
      '#fiscalDesktopProductPhoto .fiscal-desktop-product-photo-frame'
    );
  }

  function getProductSection(){
    return document.querySelector(
      '#fiscalForm .fiscal-product-section'
    );
  }

  function getFiscalForm(){
    return document.getElementById('fiscalForm');
  }

  function closeSrc(){
    const img =
      document.querySelector('#scfSalesHistoryClose img');

    return img
      ? img.getAttribute('src')
      : 'https://static.wixstatic.com/media/fd6425_4a7468b648384589833816ddb0d7336f~mv2.png';
  }

  function clearStockGtinTimers(){
    if(pesquisaGtinEstoqueTimer){
      clearTimeout(
        pesquisaGtinEstoqueTimer
      );

      pesquisaGtinEstoqueTimer =
        null;
    }

    if(pesquisaGtinEstoquePollTimer){
      clearTimeout(
        pesquisaGtinEstoquePollTimer
      );

      pesquisaGtinEstoquePollTimer =
        null;
    }
  }

  function clearPreviousAiFieldsIfUnchanged(){
    const previous =
      pesquisaGtinEstoqueUltimoPreenchido;

    if(!previous){
      return;
    }

    const name =
      document.getElementById(
        'scfStockProductName'
      );

    const ncm =
      document.getElementById(
        'scfStockNcm'
      );

    const unit =
      document.getElementById(
        'scfStockUnit'
      );

    if(
      name &&
      text(name.value) ===
        previous.nome
    ){
      name.value = '';
    }

    if(
      ncm &&
      digits(ncm.value) ===
        previous.ncm
    ){
      ncm.value = '';
    }

    if(
      unit &&
      text(unit.value).toUpperCase() ===
        previous.unidade
    ){
      unit.value = 'UN';
    }

    pesquisaGtinEstoqueUltimoPreenchido =
      null;
  }

  function invalidateStockGtinSearch(nextGtin){
    clearStockGtinTimers();

    if(
      pesquisaGtinEstoqueAtual &&
      pesquisaGtinEstoqueAtual !==
        nextGtin
    ){
      clearPreviousAiFieldsIfUnchanged();
    }

    pesquisaGtinEstoqueRequestId = '';
    pesquisaGtinEstoqueResponseId = '';
    pesquisaGtinEstoqueAtual =
      nextGtin || '';

    const pesquisaId =
      document.getElementById(
        'scfStockPesquisaId'
      );

    if(pesquisaId){
      pesquisaId.value = '';
    }
  }

  function setStockUnit(unitValue){
    const select =
      document.getElementById(
        'scfStockUnit'
      );

    const unit =
      text(
        unitValue
      ).toUpperCase();

    if(
      !select ||
      !unit
    ){
      return;
    }

    let option =
      Array.from(
        select.options
      ).find(
        function(item){
          return (
            text(item.value)
              .toUpperCase() ===
            unit
          );
        }
      );

    if(!option){
      option =
        document.createElement(
          'option'
        );

      option.value =
        unit;

      option.textContent =
        unit;

      select.appendChild(
        option
      );
    }

    select.value =
      unit;
  }

  function fillStockFormFromAi(
    product,
    responseId
  ){
    const currentBarcode =
      digits(
        document.getElementById(
          'scfStockBarcode'
        )?.value
      ).slice(
        0,
        14
      );

    if(
      !product ||
      typeof product !==
        'object' ||
      !pesquisaGtinEstoqueAtual ||
      currentBarcode !==
        pesquisaGtinEstoqueAtual
    ){
      return false;
    }

    const returnedGtin =
      digits(
        product.gtin
      ).slice(
        0,
        14
      );

    if(
      returnedGtin &&
      returnedGtin !==
        pesquisaGtinEstoqueAtual
    ){
      return false;
    }

    const nome =
      text(
        product.descricaoCadastro ||
        product.nomePesquisa ||
        product.nome ||
        product.descricao
      );

    const ncm =
      digits(
        product.ncm
      ).slice(
        0,
        8
      );

    const unidade =
      text(
        product.unidadeSugerida ||
        product.unidade
      ).toUpperCase();

    const nameInput =
      document.getElementById(
        'scfStockProductName'
      );

    const ncmInput =
      document.getElementById(
        'scfStockNcm'
      );

    const pesquisaId =
      document.getElementById(
        'scfStockPesquisaId'
      );

    if(
      nameInput &&
      nome
    ){
      nameInput.value =
        nome;
    }

    if(
      ncmInput &&
      ncm.length ===
        8
    ){
      ncmInput.value =
        ncm;
    }

    if(unidade){
      setStockUnit(
        unidade
      );
    }

    if(pesquisaId){
      pesquisaId.value =
        text(
          responseId
        );
    }

    pesquisaGtinEstoqueUltimoPreenchido = {
      gtin:
        pesquisaGtinEstoqueAtual,

      nome,

      ncm,

      unidade
    };

    setStockStatus(
      'REFERÊNCIA LOCALIZADA'
    );

    return true;
  }

  function scheduleStockGtinPoll(){
    clearTimeout(
      pesquisaGtinEstoquePollTimer
    );

    if(
      !pesquisaGtinEstoqueRequestId ||
      !pesquisaGtinEstoqueResponseId ||
      !pesquisaGtinEstoqueAtual
    ){
      return;
    }

    pesquisaGtinEstoquePollTimer =
      setTimeout(
        function(){
          pesquisaGtinEstoquePollTimer =
            null;

          try{
            window.__scfPdvInfra.shellBridge.post({
              type:
                'SCF_PRODUTO_GTIN_CONSULTAR',

              requestId:
                pesquisaGtinEstoqueRequestId,

              responseId:
                pesquisaGtinEstoqueResponseId,

              gtin:
                pesquisaGtinEstoqueAtual
            },'*');
          }catch(error){
            setStockStatus(
              'NÃO FOI POSSÍVEL CONSULTAR A PESQUISA DO PRODUTO'
            );
          }
        },
        1800
      );
  }

  function requestStockGtinSearch(){
    /*
     * A pesquisa automática por GTIN pertence ao fluxo de CADASTRO NOVO.
     * Se existe um produto selecionado para edição/ATUALIZAÇÃO, nenhuma
     * pesquisa externa deve ser iniciada, mesmo que blur/change/Enter do
     * campo de código de barras disparem listeners antigos.
     */
    if(
      produtoEdicaoSelecionado ||
      atualizacaoProdutoEstoqueRequestId
    ){
      clearStockGtinTimers();

      pesquisaGtinEstoqueRequestId =
        '';

      pesquisaGtinEstoqueResponseId =
        '';

      return;
    }

    const barcode =
      document.getElementById(
        'scfStockBarcode'
      );

    const gtin =
      digits(
        barcode?.value
      ).slice(
        0,
        14
      );

    if(
      pdvCodigoInternoBalancaValido(
        gtin
      )
    ){
      return;
    }

    if(
      ![
        8,
        12,
        13,
        14
      ].includes(
        gtin.length
      )
    ){
      return;
    }

    if(
      pesquisaGtinEstoqueRequestId &&
      pesquisaGtinEstoqueAtual ===
        gtin
    ){
      return;
    }

    invalidateStockGtinSearch(
      gtin
    );

    pesquisaGtinEstoqueRequestId =
      'scf-stock-gtin-' +
      Date.now() +
      '-' +
      Math.random()
        .toString(36)
        .slice(2,8);

    setStockStatus(
      'PESQUISANDO PRODUTO E DADOS FISCAIS...'
    );

    try{
      window.__scfPdvInfra.shellBridge.post({
        type:
          'SCF_PRODUTO_GTIN_PESQUISAR',

        requestId:
          pesquisaGtinEstoqueRequestId,

        gtin
      },'*');
    }catch(error){
      pesquisaGtinEstoqueRequestId =
        '';

      setStockStatus(
        'NÃO FOI POSSÍVEL INICIAR A PESQUISA DO PRODUTO'
      );
    }
  }

  function scheduleStockGtinSearch(
    immediate
  ){
    /*
     * Não agenda pesquisa de produto enquanto o formulário estiver
     * atualizando/editando um item já existente. A consulta automática
     * continua disponível normalmente no CADASTRO NOVO.
     */
    if(
      produtoEdicaoSelecionado ||
      atualizacaoProdutoEstoqueRequestId
    ){
      clearStockGtinTimers();
      return;
    }

    const barcode =
      document.getElementById(
        'scfStockBarcode'
      );

    const gtin =
      digits(
        barcode?.value
      ).slice(
        0,
        14
      );

    clearTimeout(
      pesquisaGtinEstoqueTimer
    );

    pesquisaGtinEstoqueTimer =
      null;

    if(
      pesquisaGtinEstoqueAtual &&
      pesquisaGtinEstoqueAtual !==
        gtin
    ){
      invalidateStockGtinSearch(
        gtin
      );
    }

    if(!gtin){
      invalidateStockGtinSearch(
        ''
      );

      setStockStatus(
        ''
      );

      return;
    }

    if(
      pdvCodigoInternoBalancaValido(
        gtin
      )
    ){
      invalidateStockGtinSearch(
        ''
      );

      setStockStatus(
        'CÓDIGO INTERNO DA BALANÇA — USE 0001 A 0999. NO PDV, OS DÍGITOS SEGUINTES SERÃO O VALOR EM CENTAVOS.'
      );

      return;
    }

    if(
      ![
        8,
        12,
        13,
        14
      ].includes(
        gtin.length
      )
    ){
      if(immediate){
        invalidateStockGtinSearch(
          gtin
        );

        setStockStatus(
          'USE CÓDIGO INTERNO 0001 A 0999 OU CÓDIGO DE BARRAS COM 8, 12, 13 OU 14 DÍGITOS'
        );
      }

      return;
    }

    pesquisaGtinEstoqueTimer =
      setTimeout(
        requestStockGtinSearch,
        immediate
          ? 0
          : 700
      );
  }

  function produtoNormalizado(item){
    return inventoryDomain.normalizeProduct(
      item
    );
  }


  function stockNumber(value){
    /*
     * Valores vindos do backend podem chegar como number (3.99) ou
     * como string decimal com ponto ("3.99"). Já o operador digita
     * no padrão brasileiro (3,99 / R$ 3,99). Não podemos remover todo
     * ponto indiscriminadamente, pois isso transformava 3.99 em 399.
     */
    if(
      typeof value === 'number'
    ){
      return Number.isFinite(value)
        ? value
        : 0;
    }

    let raw =
      text(
        value
      )
        .replace(/R\$/gi,'')
        .replace(/\s/g,'')
        .replace(/[^0-9,.-]/g,'');

    if(!raw){
      return 0;
    }

    const temVirgula =
      raw.includes(',');

    const temPonto =
      raw.includes('.');

    if(
      temVirgula &&
      temPonto
    ){
      /* 1.234,56 -> 1234.56 | 1,234.56 -> 1234.56 */
      if(
        raw.lastIndexOf(',') >
        raw.lastIndexOf('.')
      ){
        raw =
          raw
            .replace(/\./g,'')
            .replace(/,/g,'.');
      }else{
        raw =
          raw.replace(/,/g,'');
      }
    }else if(temVirgula){
      /* 3,99 -> 3.99 */
      raw =
        raw.replace(/,/g,'.');
    }else if(temPonto){
      /*
       * 3.99 / 399.00 vindos do backend são decimais.
       * Pontos que não têm 1 ou 2 casas finais continuam sendo
       * tratados como separadores de milhar.
       */
      if(
        !/^-?\d+\.\d{1,2}$/.test(raw)
      ){
        raw =
          raw.replace(/\./g,'');
      }
    }

    const number =
      Number(
        raw
      );

    return Number.isFinite(number)
      ? number
      : 0;
  }

  function formatStockCurrency(
    value
  ){
    const number =
      stockNumber(
        value
      );

    return 'R$ ' +
      number.toLocaleString(
        'pt-BR',
        {
          minimumFractionDigits:
            2,
          maximumFractionDigits:
            2
        }
      );
  }

  function stockCurrencyRaw(
    value
  ){
    const raw =
      text(
        value
      );

    if(!raw){
      return '';
    }

    return stockNumber(
      raw
    )
      .toFixed(
        2
      )
      .replace(
        '.',
        ','
      );
  }

  function stockMoneyPayload(
    value
  ){
    const raw =
      text(
        value
      );

    if(!raw){
      return '';
    }

    return String(
      stockNumber(
        raw
      )
    );
  }

  function setStockMoneyFieldValue(
    field,
    value
  ){
    if(!field){
      return;
    }

    const raw =
      text(
        value
      );

    if(!raw){
      field.value =
        '';

      field.dataset
        .scfStockMoneyRaw =
          '';

      return;
    }

    field.dataset
      .scfStockMoneyRaw =
        stockCurrencyRaw(
          raw
        );

    field.value =
      formatStockCurrency(
        raw
      );
  }

  function instalarMascaraMoedaEstoque(
    field
  ){
    if(
      !field ||
      field.dataset
        .scfStockMoneyMask ===
          '1'
    ){
      return;
    }

    field.dataset
      .scfStockMoneyMask =
        '1';

    /*
     * Máscara monetária no padrão de caixa/PDV:
     * os números entram da direita para a esquerda.
     *
     * Exemplos:
     * 2       -> R$ 0,02
     * 2 5     -> R$ 0,25
     * 2 5 0   -> R$ 2,50
     * 2 5 0 0 -> R$ 25,00
     */
    function centavosDigitadosAtuais(){
      const raw =
        field.dataset
          .scfStockMoneyRaw ||
        '';

      if(!raw){
        return '';
      }

      const somenteNumeros =
        String(
          raw
        ).replace(
          /\D/g,
          ''
        );

      return somenteNumeros
        .replace(
          /^0+/,
          ''
        );
    }

    function aplicarCentavos(
      digitos
    ){
      let somenteNumeros =
        String(
          digitos == null
            ? ''
            : digitos
        ).replace(
          /\D/g,
          ''
        );

      /*
       * Evita crescimento desnecessário com zeros à esquerda.
       * Mantém, porém, o zero digitado quando ele fizer parte da sequência.
       */
      somenteNumeros =
        somenteNumeros
          .replace(
            /^0+(?=\d)/,
            ''
          )
          .slice(
            0,
            15
          );

      if(!somenteNumeros){
        field.dataset
          .scfStockMoneyRaw =
            '';

        field.value =
          '';

        field.dispatchEvent(
          new Event(
            'input',
            {
              bubbles:
                true
            }
          )
        );

        return;
      }

      const preenchido =
        somenteNumeros.padStart(
          3,
          '0'
        );

      const inteiros =
        preenchido.slice(
          0,
          -2
        ) || '0';

      const decimais =
        preenchido.slice(
          -2
        );

      const raw =
        inteiros +
        ',' +
        decimais;

      field.dataset
        .scfStockMoneyRaw =
          raw;

      field.value =
        formatStockCurrency(
          raw
        );

      field.dispatchEvent(
        new Event(
          'input',
          {
            bubbles:
              true
          }
        )
      );
    }

    function sincronizarRawAtual(){
      field.dataset
        .scfStockMoneyRaw =
          text(
            field.value
          )
            ? stockCurrencyRaw(
                field.value
              )
            : '';
    }

    field.addEventListener(
      'focus',
      function(){
        sincronizarRawAtual();

        window.setTimeout(
          function(){
            try{
              field.select();
            }catch(error){}
          },
          0
        );
      }
    );

    field.addEventListener(
      'keydown',
      function(event){
        if(
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        ){
          return;
        }

        const key =
          event.key;

        const ehDigito =
          /^[0-9]$/
            .test(
              key
            );

        const ehSeparador =
          key === ',' ||
          key === '.';

        const ehApagar =
          key ===
            'Backspace' ||
          key ===
            'Delete';

        if(
          !ehDigito &&
          !ehSeparador &&
          !ehApagar
        ){
          return;
        }

        event.preventDefault();

        const tudoSelecionado =
          field.selectionStart ===
            0 &&
          field.selectionEnd ===
            field.value.length;

        let centavos =
          tudoSelecionado
            ? ''
            : centavosDigitadosAtuais();

        /*
         * A vírgula/ponto não precisa ser digitada:
         * os dois últimos números são sempre os centavos.
         */
        if(ehSeparador){
          return;
        }

        if(ehDigito){
          aplicarCentavos(
            centavos +
            key
          );

          return;
        }

        if(ehApagar){
          if(tudoSelecionado){
            aplicarCentavos(
              ''
            );

            return;
          }

          aplicarCentavos(
            centavos.slice(
              0,
              -1
            )
          );
        }
      }
    );

    field.addEventListener(
      'paste',
      function(event){
        const clipboard =
          event.clipboardData &&
          event.clipboardData.getData
            ? event.clipboardData.getData(
                'text'
              )
            : '';

        if(!clipboard){
          return;
        }

        event.preventDefault();

        /*
         * Ao colar um valor já formatado (ex.: 12,50),
         * preserva exatamente o valor monetário informado.
         */
        const numero =
          stockNumber(
            clipboard
          );

        setStockMoneyFieldValue(
          field,
          numero
        );

        field.dispatchEvent(
          new Event(
            'input',
            {
              bubbles:
                true
            }
          )
        );
      }
    );

    field.addEventListener(
      'blur',
      function(){
        if(
          !text(
            field.value
          )
        ){
          field.dataset
            .scfStockMoneyRaw =
              '';

          return;
        }

        setStockMoneyFieldValue(
          field,
          field.value
        );
      }
    );

    if(
      text(
        field.value
      )
    ){
      setStockMoneyFieldValue(
        field,
        field.value
      );
    }
  }

  function obterEstadoAtualProdutoEdicao(){
    return JSON.stringify({
      quantidade:
        text(
          document.getElementById(
            'scfStockQuantity'
          )?.value
        ),

      codigoBarras:
        digits(
          document.getElementById(
            'scfStockBarcode'
          )?.value
        ).slice(
          0,
          14
        ),

      nome:
        text(
          document.getElementById(
            'scfStockProductName'
          )?.value
        ),

      ncm:
        digits(
          document.getElementById(
            'scfStockNcm'
          )?.value
        ).slice(
          0,
          8
        ),

      unidade:
        text(
          document.getElementById(
            'scfStockUnit'
          )?.value
        ).toUpperCase(),

      custo:
        stockMoneyPayload(
          document.getElementById(
            'scfStockCost'
          )?.value
        ),

      precoVenda:
        stockMoneyPayload(
          document.getElementById(
            'scfStockPrice'
          )?.value
        )
    });
  }

  function registrarEstadoOriginalProdutoEdicao(){
    produtoEdicaoEstadoOriginal =
      produtoEdicaoSelecionado
        ? obterEstadoAtualProdutoEdicao()
        : '';
  }

  function produtoEdicaoFoiAlterado(){
    return Boolean(
      produtoEdicaoSelecionado &&
      produtoEdicaoEstadoOriginal &&
      obterEstadoAtualProdutoEdicao() !==
        produtoEdicaoEstadoOriginal
    );
  }

  function atualizarRotuloAcaoProduto(){
    const button =
      document.getElementById(
        'scfStockRegisterProduct'
      );

    if(button){
      button.textContent =
        produtoEdicaoSelecionado
          ? (
              produtoEdicaoFoiAlterado()
                ? 'ATUALIZAR'
                : 'EXCLUIR'
            )
          : 'CADASTRAR';
    }
  }

  function atualizarTituloPainelProduto(){
    const title =
      document.getElementById(
        'scfStockRightTitle'
      );

    if(!title){
      return;
    }

    title.textContent =
      produtoEdicaoSelecionado
        ? 'ATUALIZAR PRODUTO'
        : (
            produtoXmlPendenteSelecionado
              ? 'FINALIZAR PRODUTO'
              : 'CADASTRO DE PRODUTO'
          );
  }

  function encerrarEdicaoProduto(){
    produtoEdicaoSelecionado =
      null;

    produtoEdicaoEstadoOriginal =
      '';

    atualizarRotuloAcaoProduto();
    atualizarTituloPainelProduto();
  }

  function calcularValorEstimadoEstoque(){
    return inventoryDomain.getEstimatedValue();
  }

  window.scfObterValorEstimadoEstoque =
    calcularValorEstimadoEstoque;


  function contarProdutosCadastrados(){
    return inventoryDomain.getRegisteredProducts();
  }

  function calcularMargemPotencialEstoque(){
    return inventoryDomain.getPotentialMargin();
  }

  window.scfObterQuantidadeProdutosCadastrados =
    contarProdutosCadastrados;

  window.scfObterMargemPotencialEstoque =
    calcularMargemPotencialEstoque;

  function calcularIndicadoresEstoque(){
    return inventoryDomain.getIndicators();
  }

  window.scfObterIndicadoresEstoque =
    calcularIndicadoresEstoque;


  function bloquearCamposMovimentoXml(
    bloqueado
  ){
    [
      'scfStockQuantity',
      'scfStockBarcode',
      'scfStockCost'
    ].forEach(
      function(id){
        const field =
          document.getElementById(
            id
          );

        if(!field){
          return;
        }

        field.readOnly =
          Boolean(
            bloqueado
          );

        field.setAttribute(
          'aria-readonly',
          bloqueado
            ? 'true'
            : 'false'
        );
      }
    );
  }

  function limparProdutoXmlPendente(
    limparFormulario
  ){
    produtoXmlPendenteSelecionado =
      null;

    bloquearCamposMovimentoXml(
      false
    );

    if(!limparFormulario){
      return;
    }

    clearStockGtinTimers();
    invalidateStockGtinSearch(
      ''
    );

    [
      'scfStockQuantity',
      'scfStockBarcode',
      'scfStockProductName',
      'scfStockNcm',
      'scfStockCost',
      'scfStockPrice',
      'scfStockPesquisaId'
    ].forEach(
      function(id){
        const field =
          document.getElementById(
            id
          );

        if(field){
          field.value =
            '';

          if(
            id === 'scfStockCost' ||
            id === 'scfStockPrice'
          ){
            field.dataset
              .scfStockMoneyRaw =
                '';
          }
        }
      }
    );

    setStockUnit(
      'UN'
    );
  }

  function selecionarProdutoXmlPendente(
    item
  ){
    if(
      !item ||
      !item.produtoId ||
      item.venda > 0 ||
      finalizacaoProdutoXmlRequestId
    ){
      return;
    }

    modo(
      'produto'
    );

    limparProdutoXmlPendente(
      true
    );

    produtoXmlPendenteSelecionado = {
      produtoId:
        item.produtoId,

      codigo:
        item.codigo,

      nome:
        item.nome,

      quantidade:
        item.quantidade,

      custo:
        item.custo
    };

    atualizarTituloPainelProduto();

    const quantity =
      document.getElementById(
        'scfStockQuantity'
      );

    const barcode =
      document.getElementById(
        'scfStockBarcode'
      );

    const name =
      document.getElementById(
        'scfStockProductName'
      );

    const ncm =
      document.getElementById(
        'scfStockNcm'
      );

    const cost =
      document.getElementById(
        'scfStockCost'
      );

    const price =
      document.getElementById(
        'scfStockPrice'
      );

    if(quantity){
      quantity.value =
        String(
          item.quantidade
        );
    }

    if(barcode){
      liberarProtecaoCodigoBarrasEstoque(
        barcode
      );

      barcode.value =
        item.codigo;
    }

    if(name){
      name.value =
        item.nome;
    }

    if(ncm){
      ncm.value =
        '';
    }

    if(cost){
      setStockMoneyFieldValue(
        cost,
        item.custo
      );
    }

    if(price){
      price.value =
        '';
    }

    bloquearCamposMovimentoXml(
      true
    );

    const gtin =
      digits(
        item.codigo
      ).slice(
        0,
        14
      );

    invalidateStockGtinSearch(
      gtin
    );

    setStockStatus(
      'PRODUTO IMPORTADO DO XML: INFORME O PREÇO DE VENDA. A IA FARÁ UMA CONSULTA AUXILIAR.'
    );

    scheduleStockGtinSearch(
      true
    );
  }

  function selecionarProdutoParaEdicao(
    item
  ){
    if(
      !item ||
      !item.produtoId ||
      cadastroEstoqueManualRequestId ||
      atualizacaoProdutoEstoqueRequestId ||
      exclusaoProdutoEstoqueRequestId ||
      finalizacaoProdutoXmlRequestId
    ){
      return;
    }

    /*
     * Produtos importados do XML e ainda sem preço continuam usando
     * o fluxo específico de finalização já existente.
     */
    if(item.venda <= 0){
      selecionarProdutoXmlPendente(
        item
      );

      return;
    }

    limparProdutoXmlPendente(
      true
    );

    produtoEdicaoSelecionado = {
      produtoId:
        item.produtoId,

      somenteCadastroFiscal:
        item.somenteCadastroFiscal ===
          true,

      fiscalPendente:
        item.fiscalPendente ===
          true,

      aptoVenda:
        item.aptoVenda ===
          true
    };

    modo(
      'produto'
    );

    const quantity =
      document.getElementById(
        'scfStockQuantity'
      );

    const barcode =
      document.getElementById(
        'scfStockBarcode'
      );

    const name =
      document.getElementById(
        'scfStockProductName'
      );

    const ncm =
      document.getElementById(
        'scfStockNcm'
      );

    const cost =
      document.getElementById(
        'scfStockCost'
      );

    const price =
      document.getElementById(
        'scfStockPrice'
      );

    if(quantity){
      quantity.value =
        String(
          item.quantidade
        ).replace(
          '.',
          ','
        );
    }

    if(barcode){
      liberarProtecaoCodigoBarrasEstoque(
        barcode
      );

      barcode.value =
        item.codigo;
    }

    if(name){
      name.value =
        item.nome;
    }

    if(ncm){
      ncm.value =
        item.ncm ||
        '';
    }

    if(cost){
      setStockMoneyFieldValue(
        cost,
        item.custo
      );
    }

    if(price){
      setStockMoneyFieldValue(
        price,
        item.venda
      );
    }

    setStockUnit(
      item.unidade ||
      'UN'
    );

    invalidateStockGtinSearch(
      digits(
        item.codigo
      ).slice(
        0,
        14
      )
    );

    registrarEstadoOriginalProdutoEdicao();
    atualizarRotuloAcaoProduto();
    atualizarTituloPainelProduto();

    setStockStatus(
      item.fiscalPendente === true
        ? 'PENDENTE FISCAL — SEM ALTERAR: EXCLUIR. AO ALTERAR ALGUM CAMPO: ATUALIZAR. VENDA BLOQUEADA ATÉ COMPLETAR O FISCAL.'
        : 'PRODUTO SELECIONADO: CLIQUE EM EXCLUIR OU ALTERE ALGUM CAMPO PARA ATUALIZAR'
    );
  }

  function solicitarExclusaoProduto(){
    if(
      exclusaoProdutoEstoqueRequestId ||
      atualizacaoProdutoEstoqueRequestId ||
      !produtoEdicaoSelecionado ||
      !produtoEdicaoSelecionado.produtoId ||
      produtoEdicaoFoiAlterado()
    ){
      return;
    }

    const produtoId =
      produtoEdicaoSelecionado
        .produtoId;

    const nomeProduto =
      text(
        document.getElementById(
          'scfStockProductName'
        )?.value
      ) ||
      'PRODUTO';

    const confirmado =
      window.confirm(
        'EXCLUIR O PRODUTO "' +
        nomeProduto +
        '"?\n\nESTA AÇÃO NÃO PODE SER DESFEITA.'
      );

    if(!confirmado){
      return;
    }

    exclusaoProdutoEstoqueRequestId =
      'scf-stock-delete-' +
      Date.now() +
      '-' +
      Math.random()
        .toString(36)
        .slice(2,8);

    const registerButton =
      document.getElementById(
        'scfStockRegisterProduct'
      );

    if(registerButton){
      registerButton.disabled =
        true;

      registerButton.setAttribute(
        'aria-disabled',
        'true'
      );
    }

    setStockStatus(
      'EXCLUINDO PRODUTO...'
    );

    try{
      window.__scfPdvInfra.shellBridge.post({
        type:
          'SCF_ESTOQUE_PRODUTO_EXCLUIR_SOLICITAR',

        requestId:
          exclusaoProdutoEstoqueRequestId,

        produtoId,

        produto:{
          produtoId
        }
      },'*');
    }catch(error){
      exclusaoProdutoEstoqueRequestId =
        '';

      if(registerButton){
        registerButton.disabled =
          false;

        registerButton.setAttribute(
          'aria-disabled',
          'false'
        );
      }

      setStockStatus(
        'NÃO FOI POSSÍVEL ENVIAR A EXCLUSÃO DO PRODUTO'
      );
    }
  }

  function solicitarAtualizacaoProduto(){
    if(
      atualizacaoProdutoEstoqueRequestId ||
      exclusaoProdutoEstoqueRequestId ||
      !produtoEdicaoSelecionado ||
      !produtoEdicaoSelecionado.produtoId ||
      !produtoEdicaoFoiAlterado()
    ){
      return;
    }

    const payload = {
      produtoId:
        produtoEdicaoSelecionado
          .produtoId,

      nome:
        text(
          document.getElementById(
            'scfStockProductName'
          )?.value
        ),

      codigoBarras:
        digits(
          document.getElementById(
            'scfStockBarcode'
          )?.value
        ).slice(
          0,
          14
        ),

      ncm:
        digits(
          document.getElementById(
            'scfStockNcm'
          )?.value
        ).slice(
          0,
          8
        ),

      unidade:
        text(
          document.getElementById(
            'scfStockUnit'
          )?.value
        ),

      quantidade:
        text(
          document.getElementById(
            'scfStockQuantity'
          )?.value
        ),

      custo:
        stockMoneyPayload(
          document.getElementById(
            'scfStockCost'
          )?.value
        ),

      precoVenda:
        stockMoneyPayload(
          document.getElementById(
            'scfStockPrice'
          )?.value
        )
    };

    const barcodeCadastro =
      document.getElementById(
        'scfStockBarcode'
      );

    if(
      barcodeCadastro &&
      payload.codigoBarras
    ){
      barcodeCadastro.value =
        payload.codigoBarras;
    }

    if(
      !pdvCodigoInternoBalancaValido(
        payload.codigoBarras
      ) &&
      ![
        8,
        12,
        13,
        14
      ].includes(
        payload.codigoBarras.length
      )
    ){
      setStockStatus(
        'INFORME CÓDIGO INTERNO 0001 A 0999 OU CÓDIGO DE BARRAS VÁLIDO'
      );
      return;
    }

    if(!payload.quantidade){
      setStockStatus(
        'INFORME A QUANTIDADE'
      );
      return;
    }

    /*
     * CUSTO OPCIONAL:
     * produto pode ser atualizado com custo vazio/zero.
     * O backend recebe zero quando não houver custo informado.
     */
    if(!payload.custo){
      payload.custo = '0';
    }

    if(!payload.precoVenda){
      setStockStatus(
        'INFORME O PREÇO DE VENDA'
      );
      return;
    }

    atualizacaoProdutoEstoqueRequestId =
      'scf-stock-update-' +
      Date.now() +
      '-' +
      Math.random()
        .toString(36)
        .slice(2,8);

    const registerButton =
      document.getElementById(
        'scfStockRegisterProduct'
      );

    if(registerButton){
      registerButton.disabled =
        true;

      registerButton.setAttribute(
        'aria-disabled',
        'true'
      );
    }

    setStockStatus(
      payload.nome &&
      payload.ncm.length === 8
        ? 'ATUALIZANDO PRODUTO E CALCULANDO TRIBUTOS...'
        : 'ATUALIZANDO PRODUTO COMO PENDENTE FISCAL...'
    );

    try{
      window.__scfPdvInfra.shellBridge.post({
        type:
          'SCF_ESTOQUE_PRODUTO_ATUALIZAR_SOLICITAR',

        requestId:
          atualizacaoProdutoEstoqueRequestId,

        produto:
          payload
      },'*');
    }catch(error){
      atualizacaoProdutoEstoqueRequestId =
        '';

      if(registerButton){
        registerButton.disabled =
          false;

        registerButton.setAttribute(
          'aria-disabled',
          'false'
        );
      }

      setStockStatus(
        'NÃO FOI POSSÍVEL ENVIAR A ATUALIZAÇÃO DO PRODUTO'
      );
    }
  }

  function solicitarFinalizacaoProdutoXml(){
    if(
      finalizacaoProdutoXmlRequestId ||
      !produtoXmlPendenteSelecionado
    ){
      return;
    }

    const payload = {
      produtoId:
        produtoXmlPendenteSelecionado
          .produtoId,

      nome:
        text(
          document.getElementById(
            'scfStockProductName'
          )?.value
        ),

      codigoBarras:
        digits(
          document.getElementById(
            'scfStockBarcode'
          )?.value
        ).slice(
          0,
          14
        ),

      unidade:
        text(
          document.getElementById(
            'scfStockUnit'
          )?.value
        ),

      precoVenda:
        stockMoneyPayload(
          document.getElementById(
            'scfStockPrice'
          )?.value
        ),

      pesquisaId:
        text(
          document.getElementById(
            'scfStockPesquisaId'
          )?.value
        )
    };

    if(!payload.nome){
      setStockStatus(
        'INFORME O NOME DO PRODUTO'
      );

      return;
    }

    if(
      ![
        8,
        12,
        13,
        14
      ].includes(
        payload.codigoBarras.length
      )
    ){
      setStockStatus(
        'O PRODUTO IMPORTADO NÃO POSSUI UM GTIN VÁLIDO'
      );

      return;
    }

    /*
     * Produto vindo de XML:
     * a IA é auxiliar e não bloqueia a finalização.
     * Mesmo sem pesquisaId, o backend usa os dados fiscais
     * armazenados no XML original da NF-e.
     */
    if(!payload.precoVenda){
      setStockStatus(
        'INFORME O PREÇO DE VENDA'
      );

      return;
    }

    finalizacaoProdutoXmlRequestId =
      'scf-stock-xml-finalizar-' +
      Date.now() +
      '-' +
      Math.random()
        .toString(36)
        .slice(2,8);

    const registerButton =
      document.getElementById(
        'scfStockRegisterProduct'
      );

    if(registerButton){
      registerButton.disabled =
        true;

      registerButton.setAttribute(
        'aria-disabled',
        'true'
      );
    }

    setStockStatus(
      'FINALIZANDO PRODUTO IMPORTADO DO XML...'
    );

    try{
      window.__scfPdvInfra.shellBridge.post({
        type:
          'SCF_ESTOQUE_XML_PRODUTO_FINALIZAR_SOLICITAR',

        requestId:
          finalizacaoProdutoXmlRequestId,

        produto:
          payload
      },'*');
    }catch(error){
      finalizacaoProdutoXmlRequestId =
        '';

      if(registerButton){
        registerButton.disabled =
          false;

        registerButton.setAttribute(
          'aria-disabled',
          'false'
        );
      }

      setStockStatus(
        'NÃO FOI POSSÍVEL ENVIAR A FINALIZAÇÃO DO PRODUTO'
      );
    }
  }

  function solicitarAcaoProduto(){
    if(produtoXmlPendenteSelecionado){
      solicitarFinalizacaoProdutoXml();
      return;
    }

    /*
     * Produto existente — inclusive cadastro fiscal ainda com QTD 0:
     *
     * - sem alteração nos campos -> EXCLUIR;
     * - com qualquer alteração   -> ATUALIZAR.
     *
     * O backend de Estoque já aceita criar a primeira posição física
     * durante a atualização e também excluir produto sem movimento anterior.
     */
    if(produtoEdicaoSelecionado){
      if(produtoEdicaoFoiAlterado()){
        solicitarAtualizacaoProduto();
      }else{
        solicitarExclusaoProduto();
      }

      return;
    }

    solicitarCadastroManual();
  }

  function formatarQuantidadeEstoqueComUnidade(
    quantidade,
    unidade
  ){
    const numero =
      Number(
        quantidade
      );

    const valor =
      Number.isFinite(
        numero
      )
        ? numero
        : 0;

    const unidadeFinal =
      text(
        unidade ||
        'UN'
      )
        .toUpperCase()
        .trim() ||
      'UN';

    let quantidadeFormatada;

    try{
      quantidadeFormatada =
        new Intl.NumberFormat(
          'pt-BR',
          {
            minimumFractionDigits:
              0,

            maximumFractionDigits:
              3
          }
        ).format(
          valor
        );
    }catch(error){
      quantidadeFormatada =
        String(
          valor
        ).replace(
          '.',
          ','
        );
    }

    return (
      quantidadeFormatada +
      ' ' +
      unidadeFinal
    );
  }


  function renderizar(){
    const list =
      document.getElementById(
        'scfStockList'
      );

    const search =
      document.getElementById(
        'scfStockSearch'
      );

    if(!list){
      return;
    }

    atualizarIndicadoresOrdenacaoEstoque();

    const termo =
      text(
        search &&
        search.value
      ).toUpperCase();

    const dados =
      aplicarOrdenacaoEstoque(
        inventoryDomain.products
          .map(
            produtoNormalizado
          )
          .filter(
            function(item){
              if(!termo){
                return true;
              }

              return (
                item.codigo
                  .toUpperCase()
                  .includes(
                    termo
                  ) ||
                item.nome
                  .toUpperCase()
                  .includes(
                    termo
                  )
              );
            }
          )
      );

    list.replaceChildren();

    if(!dados.length){
      const empty =
        document.createElement(
          'div'
        );

      empty.className =
        'scf-stock-empty';

      empty.textContent =
        inventoryDomain.products.length
          ? 'NENHUM PRODUTO ENCONTRADO'
          : 'NENHUM PRODUTO CARREGADO NO ESTOQUE';

      list.appendChild(
        empty
      );

      return;
    }

    dados.forEach(
      function(item){
        const row =
          document.createElement(
            'div'
          );

        row.className =
          'scf-stock-row';

        if(item.produtoId){
          if(
            item.venda <= 0 ||
            item.fiscalPendente === true
          ){
            row.classList.add(
              'scf-stock-row-pendente'
            );
          }

          row.tabIndex =
            0;

          row.setAttribute(
            'role',
            'button'
          );

          row.title =
            item.fiscalPendente === true
              ? 'PENDENTE FISCAL: não permitido para venda. Clique para preencher descrição/NCM e atualizar.'
              : item.venda <= 0
                  ? 'Clique para finalizar este produto importado do XML'
                  : 'Clique para editar este produto';

          row.addEventListener(
            'click',
            function(){
              selecionarProdutoParaEdicao(
                item
              );
            }
          );

          row.addEventListener(
            'keydown',
            function(event){
              if(
                event.key === 'Enter' ||
                event.key === ' '
              ){
                event.preventDefault();

                selecionarProdutoParaEdicao(
                  item
                );
              }
            }
          );
        }

        [
          item.codigo ||
            '-',

          item.nome ||
            (
              item.fiscalPendente === true
                ? 'PENDENTE — INFORME DESCRIÇÃO/NCM'
                : '-'
            ),

          formatarQuantidadeEstoqueComUnidade(
            item.quantidade,
            item.unidade
          ),

          money(
            item.custo
          ),

          money(
            item.venda
          ),

          money(
            Number(item.venda || 0) -
            Number(item.custo || 0)
          )
        ].forEach(
          function(value){
            const cell =
              document.createElement(
                'div'
              );

            cell.textContent =
              value;

            cell.title =
              value;

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

  function garantirEstrutura(){
    const painel =
      getProductsPanel();

    const frame =
      getPhotoFrame();

    const formCard =
      getFiscalForm();

    if(
      !painel ||
      !frame ||
      !formCard
    ){
      return false;
    }

    let overlay =
      document.getElementById(
        'scfStockOverlay'
      );

    if(!overlay){
      overlay =
        document.createElement(
          'div'
        );

      overlay.id =
        'scfStockOverlay';

      overlay.setAttribute(
        'aria-hidden',
        'true'
      );

      overlay.innerHTML = ''
        + '<header id="scfStockHeader">'
        +   '<h2 id="scfStockTitle">ESTOQUE</h2>'
        +   '<div id="scfStockHeaderTools">'
        +     '<button class="scf-sales-history-export scf-stock-header-action" id="scfStockModeProduct" type="button"><span class="scf-sales-history-export-text">CADASTRAR</span></button>'
        +     '<button class="scf-sales-history-export scf-stock-header-action" id="scfStockModeXml" type="button"><span class="scf-sales-history-export-text">IMPORTAR XML</span></button>'
        +     '<div id="scfStockSearchWrap">'
        +       '<span id="scfStockSearchIcon" aria-hidden="true">⌕</span>'
        +       '<input id="scfStockSearch" type="text" autocomplete="off" placeholder="BUSCAR PRODUTO" aria-label="Buscar produto no estoque">'
        +     '</div>'
        +   '</div>'
        +   '<button id="scfStockClose" type="button" aria-label="Fechar estoque">'
        +     '<img alt="Fechar" src="' + closeSrc() + '">'
        +   '</button>'
        + '</header>'
        + '<div id="scfStockContent">'
        +   '<div id="scfStockTableHeader">'
        +     '<div>CÓDIGO</div>'
        +     '<div><button class="scf-stock-sort-button" data-stock-sort="nome" type="button" aria-label="Ordenar produtos por nome" aria-pressed="false"><span>PRODUTOS</span><span class="scf-stock-sort-arrows" aria-hidden="true"><span class="scf-stock-sort-arrow scf-stock-sort-arrow-up">▲</span><span class="scf-stock-sort-arrow scf-stock-sort-arrow-down">▼</span></span></button></div>'
        +     '<div><button class="scf-stock-sort-button" data-stock-sort="quantidade" type="button" aria-label="Ordenar produtos por quantidade" aria-pressed="false"><span>QTD.</span><span class="scf-stock-sort-arrows" aria-hidden="true"><span class="scf-stock-sort-arrow scf-stock-sort-arrow-up">▲</span><span class="scf-stock-sort-arrow scf-stock-sort-arrow-down">▼</span></span></button></div>'
        +     '<div>CUSTO</div>'
        +     '<div><button class="scf-stock-sort-button" data-stock-sort="venda" type="button" aria-label="Ordenar produtos por preço de venda" aria-pressed="false"><span>VENDA</span><span class="scf-stock-sort-arrows" aria-hidden="true"><span class="scf-stock-sort-arrow scf-stock-sort-arrow-up">▲</span><span class="scf-stock-sort-arrow scf-stock-sort-arrow-down">▼</span></span></button></div>'
        +     '<div>MARGEM</div>'
        +   '</div>'
        +   '<div id="scfStockList"></div>'
        + '</div>';

      painel.appendChild(
        overlay
      );
    }

    let right =
      document.getElementById(
        'scfStockRightPanel'
      );

    if(!right){
      right =
        document.createElement(
          'div'
        );

      right.id =
        'scfStockRightPanel';

      right.innerHTML = ''
        + '<h2 id="scfStockRightTitle">IMPORTAR XML</h2>'
        + '<form id="scfStockProductForm">'
        +   '<input id="scfStockPesquisaId" type="hidden">'
        +   '<div id="scfStockBottomStrip">'
        +     '<div class="scf-stock-bottom-cell" id="scfStockQuantityCell">'
        +       '<input id="scfStockQuantity" type="text" inputmode="decimal" autocomplete="off" placeholder="QTD" aria-label="Quantidade">'
        +     '</div>'
        +     '<div class="scf-stock-bottom-cell">'
        +       '<input id="scfStockBarcode" type="text" inputmode="numeric" autocomplete="off" maxlength="40" placeholder="CÓDIGO / BALANÇA" aria-label="Código de barras ou código interno da balança">'
        +     '</div>'
        +   '</div>'
        +   '<input class="scf-stock-field" id="scfStockProductName" type="text" maxlength="120" placeholder="NOME DO PRODUTO" aria-label="Nome do produto">'
        +   '<div class="scf-stock-inline" id="scfStockNcmUnitRow">'
        +     '<input class="scf-stock-field" id="scfStockNcm" type="text" inputmode="numeric" maxlength="8" placeholder="NCM" aria-label="NCM">'
        +     '<select class="scf-stock-select" id="scfStockUnit" aria-label="Unidade">'
        +       '<option value="UN">UN</option>'
        +       '<option value="KG">KG</option>'
        +       '<option value="LT">LT</option>'
        +       '<option value="CX">CX</option>'
        +       '<option value="PC">PC</option>'
        +     '</select>'
        +   '</div>'
        +   '<div class="scf-stock-inline" id="scfStockFinancialRow">'
        +     '<input class="scf-stock-field" id="scfStockCost" type="text" inputmode="decimal" placeholder="CUSTO R$" aria-label="Custo">'
        +     '<input class="scf-stock-field" id="scfStockPrice" type="text" inputmode="decimal" placeholder="PREÇO DE VENDA R$" aria-label="Preço de venda">'
        +   '</div>'
        +   '<div class="scf-stock-product-actions">'
        +     '<button class="scf-stock-product-action-btn" id="scfStockRegisterProduct" type="submit">CADASTRAR</button>'
        +     '<button class="scf-stock-product-action-btn" id="scfStockClearProduct" type="button">LIMPAR</button>'
        +     '<button class="scf-stock-product-action-btn" id="scfStockBackProduct" type="button">VOLTAR</button>'
        +   '</div>'
        + '</form>'
        + '<div id="scfStockXmlPanel" hidden>'
        +   '<div class="scf-stock-xml-box">'
        +     '<p class="scf-stock-xml-text">IMPORTE O XML DA NF-e DO FORNECEDOR PARA DAR ENTRADA NOS PRODUTOS.</p>'
        +     '<div class="scf-stock-xml-actions">'
        +       '<button class="scf-stock-xml-action-btn" id="scfStockChooseXml" type="button">IMPORTAR</button>'
        +       '<button class="scf-stock-xml-action-btn" id="scfStockClearXml" type="button">LIMPAR</button>'
        +       '<button class="scf-stock-xml-action-btn" id="scfStockBackXml" type="button">VOLTAR</button>'
        +     '</div>'
        +     '<input id="scfStockXmlFile" type="file" accept=".xml,text/xml,application/xml" hidden>'
        +   '</div>'
        + '</div>'
        + '<div id="scfStockStatus" aria-live="polite"></div>';

      frame.appendChild(
        right
      );
    }


    let topAction =
      document.getElementById(
        'scfStockModeXml'
      );

    if(!topAction){
      topAction =
        document.createElement(
          'button'
        );

      topAction.id =
        'scfStockModeXml';

      topAction.type =
        'button';

      topAction.textContent =
        'IMPORTAR XML';

      formCard.appendChild(
        topAction
      );
    }

    let bottomAction =
      document.getElementById(
        'scfStockModeProduct'
      );

    if(!bottomAction){
      bottomAction =
        document.createElement(
          'button'
        );

      bottomAction.id =
        'scfStockModeProduct';

      bottomAction.type =
        'button';

      bottomAction.textContent =
        'CADASTRAR';

      formCard.appendChild(
        bottomAction
      );
    }

    instalarEventos();
    renderizar();

    return true;
  }

  function modo(tipo){
    const neutro =
      tipo ===
      'neutro';

    const cadastro =
      tipo ===
      'produto';

    const xml =
      tipo ===
      'xml';

    const modeProduct =
      document.getElementById(
        'scfStockModeProduct'
      );

    const modeXml =
      document.getElementById(
        'scfStockModeXml'
      );

    const form =
      document.getElementById(
        'scfStockProductForm'
      );

    const xmlPanel =
      document.getElementById(
        'scfStockXmlPanel'
      );

    if(
      !modeProduct ||
      !modeXml ||
      !form ||
      !xmlPanel
    ){
      return;
    }

    modeProduct.classList.toggle(
      'is-active',
      cadastro
    );

    modeXml.classList.toggle(
      'is-active',
      xml
    );

    /*
     * IMPORTAR XML só fica bloqueado durante um CADASTRO NOVO.
     *
     * Ao editar/ATUALIZAR um produto existente, o XML continua ativo,
     * porque é uma ação independente da atualização do cadastro.
     */
    modeXml.disabled =
      (
        cadastro &&
        !produtoEdicaoSelecionado
      ) ||
      Boolean(
        importacaoXmlEstoqueRequestId
      ) ||
      Boolean(
        exclusaoProdutoEstoqueRequestId
      );

    modeXml.setAttribute(
      'aria-disabled',
      modeXml.disabled
        ? 'true'
        : 'false'
    );

    /*
     * Regras dos modos:
     * - CADASTRO NOVO aberto -> IMPORTAR XML desativado
     * - ATUALIZAR PRODUTO    -> IMPORTAR XML permanece ativo
     * - IMPORTAR XML aberto  -> CADASTRAR desativado
     */
    modeProduct.disabled =
      xml;

    modeProduct.setAttribute(
      'aria-disabled',
      modeProduct.disabled
        ? 'true'
        : 'false'
    );

    form.hidden =
      !cadastro;

    xmlPanel.hidden =
      !xml;

    document.body.classList.toggle(
      'scf-stock-xml-mode',
      xml
    );

    document.body.classList.toggle(
      'scf-stock-neutral-mode',
      neutro
    );

    setStockStatus(
      ''
    );

    if(neutro){
      encerrarEdicaoProduto();
    }

    atualizarRotuloAcaoProduto();

    if(cadastro){
      setTimeout(
        function(){
          const barcode =
            document.getElementById(
              'scfStockBarcode'
            );

          if(
            barcode &&
            !text(
              barcode.value
            )
          ){
            barcode.focus();
          }
        },
        0
      );
    }
  }

  function solicitarCadastroManual(){
    if(
      cadastroEstoqueManualRequestId
    ){
      return;
    }

    /*
     * CADASTRO MANUAL SEM IA:
     * - identificação fiscal manual: GTIN + DESCRIÇÃO + NCM;
     * - dados operacionais preservados: QTD + UNIDADE + CUSTO + PREÇO DE VENDA.
     *
     * Nenhum imposto é solicitado ao operador.
     */
    const payload = {
      nome:
        text(
          document.getElementById(
            'scfStockProductName'
          )?.value
        ),

      codigoBarras:
        digits(
          document.getElementById(
            'scfStockBarcode'
          )?.value
        ).slice(
          0,
          14
        ),

      ncm:
        digits(
          document.getElementById(
            'scfStockNcm'
          )?.value
        ).slice(
          0,
          8
        ),

      unidade:
        text(
          document.getElementById(
            'scfStockUnit'
          )?.value
        ).toUpperCase(),

      quantidade:
        text(
          document.getElementById(
            'scfStockQuantity'
          )?.value
        ),

      custo:
        stockMoneyPayload(
          document.getElementById(
            'scfStockCost'
          )?.value
        ),

      precoVenda:
        stockMoneyPayload(
          document.getElementById(
            'scfStockPrice'
          )?.value
        )
    };

    const barcodeCadastro =
      document.getElementById(
        'scfStockBarcode'
      );

    if(
      barcodeCadastro &&
      payload.codigoBarras
    ){
      barcodeCadastro.value =
        payload.codigoBarras;
    }

    if(
      !pdvCodigoInternoBalancaValido(
        payload.codigoBarras
      ) &&
      ![
        8,
        12,
        13,
        14
      ].includes(
        payload.codigoBarras.length
      )
    ){
      setStockStatus(
        'INFORME CÓDIGO INTERNO 0001 A 0999 OU GTIN COM 8, 12, 13 OU 14 DÍGITOS'
      );
      return;
    }

    /*
     * DESCRIÇÃO e NCM são opcionais para entrada no ESTOQUE.
     * Sem ambos completos, o backend salva o GTIN como PENDENTE FISCAL,
     * não chama a IA tributária e o PDV bloqueia a venda.
     */

    if(!payload.unidade){
      setStockStatus(
        'INFORME A UNIDADE'
      );
      return;
    }

    /*
     * QTD ZERO É VÁLIDA:
     * permite cadastrar o produto antes de existir saldo físico.
     * Apenas campo vazio ou quantidade negativa são rejeitados.
     */
    if(
      !text(
        payload.quantidade
      )
    ){
      setStockStatus(
        'INFORME A QUANTIDADE (ZERO É PERMITIDO)'
      );
      return;
    }

    if(
      stockNumber(
        payload.quantidade
      ) < 0
    ){
      setStockStatus(
        'A QUANTIDADE NÃO PODE SER NEGATIVA'
      );
      return;
    }

    /* Custo pode ser zero/vazio; o backend registra como zero. */

    if(
      stockNumber(
        payload.precoVenda
      ) <= 0
    ){
      setStockStatus(
        'INFORME UM PREÇO DE VENDA MAIOR QUE ZERO'
      );
      return;
    }

    cadastroEstoqueManualRequestId =
      'scf-stock-register-' +
      Date.now() +
      '-' +
      Math.random()
        .toString(36)
        .slice(2,8);

    const registerButton =
      document.getElementById(
        'scfStockRegisterProduct'
      );

    if(registerButton){
      registerButton.disabled =
        true;

      registerButton.setAttribute(
        'aria-disabled',
        'true'
      );
    }

    setStockStatus(
      payload.nome &&
      payload.ncm.length === 8
        ? 'CADASTRANDO PRODUTO E CALCULANDO TRIBUTOS...'
        : 'CADASTRANDO GTIN COMO PENDENTE FISCAL NO ESTOQUE...'
    );

    const requestIdCadastroAtual =
      cadastroEstoqueManualRequestId;

    try{
      window.__scfPdvInfra.shellBridge.post({
        type:
          'SCF_ESTOQUE_PRODUTO_CADASTRAR_SOLICITAR',

        requestId:
          cadastroEstoqueManualRequestId,

        produto:
          payload
      },'*');

      /*
       * Se a ponte Wix não responder por qualquer motivo, o botão não fica
       * eternamente travado e o operador recebe uma mensagem visível.
       */
      window.setTimeout(
        function(){
          if(
            cadastroEstoqueManualRequestId !==
              requestIdCadastroAtual
          ){
            return;
          }

          cadastroEstoqueManualRequestId =
            '';

          const button =
            document.getElementById(
              'scfStockRegisterProduct'
            );

          if(button){
            button.disabled =
              false;

            button.setAttribute(
              'aria-disabled',
              'false'
            );
          }

          setStockStatus(
            'O CADASTRO NÃO RECEBEU RESPOSTA DO WIX. TENTE NOVAMENTE OU VERIFIQUE O BACKEND.'
          );
        },
        45000
      );
    }catch(error){
      cadastroEstoqueManualRequestId =
        '';

      if(registerButton){
        registerButton.disabled =
          false;

        registerButton.setAttribute(
          'aria-disabled',
          'false'
        );
      }

      setStockStatus(
        'NÃO FOI POSSÍVEL ENVIAR O CADASTRO DO PRODUTO'
      );
      return;
    }

    window.__scfPdvInfra.eventBus.dispatch(
      new CustomEvent(
        'scf:estoque-produto-cadastrar',
        {
          detail:
            payload
        }
      )
    );
  }

  function setXmlActionButtonsDisabled(disabled){
    [
      'scfStockChooseXml',
      'scfStockClearXml',
      'scfStockBackXml'
    ].forEach(
      function(id){
        const button =
          document.getElementById(
            id
          );

        if(!button){
          return;
        }

        button.disabled =
          Boolean(disabled);

        button.setAttribute(
          'aria-disabled',
          button.disabled
            ? 'true'
            : 'false'
        );
      }
    );
  }

  function instalarEventos(){
    if(eventosInstalados){
      return;
    }

    const close =
      document.getElementById(
        'scfStockClose'
      );

    const search =
      document.getElementById(
        'scfStockSearch'
      );

    const sortButtons =
      Array.from(
        document.querySelectorAll(
          '#scfStockTableHeader [data-stock-sort]'
        )
      );

    const modeProduct =
      document.getElementById(
        'scfStockModeProduct'
      );

    const modeXml =
      document.getElementById(
        'scfStockModeXml'
      );

    const form =
      document.getElementById(
        'scfStockProductForm'
      );

    const chooseXml =
      document.getElementById(
        'scfStockChooseXml'
      );

    const clearXml =
      document.getElementById(
        'scfStockClearXml'
      );

    const backXml =
      document.getElementById(
        'scfStockBackXml'
      );

    const clearProduct =
      document.getElementById(
        'scfStockClearProduct'
      );

    const backProduct =
      document.getElementById(
        'scfStockBackProduct'
      );

    const xmlFile =
      document.getElementById(
        'scfStockXmlFile'
      );

    const barcode =
      document.getElementById(
        'scfStockBarcode'
      );

    const costField =
      document.getElementById(
        'scfStockCost'
      );

    const priceField =
      document.getElementById(
        'scfStockPrice'
      );

    instalarMascaraMoedaEstoque(
      costField
    );

    instalarMascaraMoedaEstoque(
      priceField
    );

    if(
      !close ||
      !search ||
      !modeProduct ||
      !modeXml ||
      !form ||
      !barcode
    ){
      return;
    }

    eventosInstalados =
      true;

    close.addEventListener(
      'click',
      fecharEstoque
    );

    search.addEventListener(
      'input',
      renderizar
    );

    sortButtons.forEach(
      function(button){
        button.addEventListener(
          'click',
          function(){
            alternarOrdenacaoEstoque(
              button.dataset
                .stockSort
            );
          }
        );
      }
    );

    atualizarIndicadoresOrdenacaoEstoque();

    barcode.addEventListener(
      'input',
      function(){
        const gtinAtual =
          digits(
            barcode.value
          ).slice(
            0,
            14
          );

        if(!gtinAtual){
          /*
           * O operador apagou completamente o GTIN:
           * cancela pesquisa/poll pendentes e não permite
           * que o código anterior reapareça sozinho.
           */
          barcode.dataset
            .scfCodigoBarrasApagado =
              '1';

          clearStockGtinTimers();

          pesquisaGtinEstoqueRequestId =
            '';

          pesquisaGtinEstoqueResponseId =
            '';

          pesquisaGtinEstoqueAtual =
            '';

          const pesquisaId =
            document.getElementById(
              'scfStockPesquisaId'
            );

          if(pesquisaId){
            pesquisaId.value =
              '';
          }

          clearPreviousAiFieldsIfUnchanged();

          setStockStatus(
            ''
          );

          protegerCodigoBarrasEstoqueVazio();

          return;
        }

        liberarProtecaoCodigoBarrasEstoque(
          barcode
        );

        scheduleStockGtinSearch(
          false
        );
      }
    );

    barcode.addEventListener(
      'change',
      function(){
        if(
          barcode.dataset
            .scfCodigoBarrasApagado ===
            '1' &&
          !digits(
            barcode.value
          )
        ){
          return;
        }

        scheduleStockGtinSearch(
          true
        );
      }
    );

    barcode.addEventListener(
      'blur',
      function(){
        if(
          barcode.dataset
            .scfCodigoBarrasApagado ===
            '1' &&
          !digits(
            barcode.value
          )
        ){
          return;
        }

        scheduleStockGtinSearch(
          true
        );
      }
    );

    barcode.addEventListener(
      'keydown',
      function(event){
        if(
          event.key ===
          'Enter'
        ){
          event.preventDefault();

          if(
            barcode.dataset
              .scfCodigoBarrasApagado ===
              '1' &&
            !digits(
              barcode.value
            )
          ){
            return;
          }

          scheduleStockGtinSearch(
            true
          );
        }
      }
    );

    form.addEventListener(
      'submit',
      function(event){
        event.preventDefault();

        solicitarAcaoProduto();
      }
    );

    function sincronizarAcaoEdicaoProduto(event){
      if(
        !produtoEdicaoSelecionado ||
        exclusaoProdutoEstoqueRequestId ||
        atualizacaoProdutoEstoqueRequestId
      ){
        return;
      }

      const target =
        event &&
        event.target;

      if(
        !target ||
        ![
          'scfStockQuantity',
          'scfStockBarcode',
          'scfStockProductName',
          'scfStockNcm',
          'scfStockUnit',
          'scfStockCost',
          'scfStockPrice'
        ].includes(
          target.id
        )
      ){
        return;
      }

      atualizarRotuloAcaoProduto();

      setStockStatus(
        produtoEdicaoFoiAlterado()
          ? 'DADOS ALTERADOS: CLIQUE EM ATUALIZAR PARA SALVAR'
          : 'PRODUTO SELECIONADO: CLIQUE EM EXCLUIR OU ALTERE ALGUM CAMPO PARA ATUALIZAR'
      );
    }

    form.addEventListener(
      'input',
      sincronizarAcaoEdicaoProduto
    );

    form.addEventListener(
      'change',
      sincronizarAcaoEdicaoProduto
    );

    if(clearProduct){
      clearProduct.addEventListener(
        'click',
        function(){
          if(
            cadastroEstoqueManualRequestId ||
            atualizacaoProdutoEstoqueRequestId ||
            exclusaoProdutoEstoqueRequestId ||
            finalizacaoProdutoXmlRequestId
          ){
            return;
          }

          const mantendoEdicao =
            Boolean(
              produtoEdicaoSelecionado
            );

          limparProdutoXmlPendente(
            true
          );

          if(mantendoEdicao){
            atualizarRotuloAcaoProduto();
          }

          setStockStatus(
            ''
          );

          const barcodeField =
            document.getElementById(
              'scfStockBarcode'
            );

          if(barcodeField){
            barcodeField.focus();
          }
        }
      );
    }

    if(backProduct){
      backProduct.addEventListener(
        'click',
        function(){
          if(
            cadastroEstoqueManualRequestId ||
            atualizacaoProdutoEstoqueRequestId ||
            exclusaoProdutoEstoqueRequestId ||
            finalizacaoProdutoXmlRequestId
          ){
            return;
          }

          limparProdutoXmlPendente(
            true
          );

          encerrarEdicaoProduto();

          modo(
            'neutro'
          );
        }
      );
    }

    if(clearXml){
      clearXml.addEventListener(
        'click',
        function(){
          if(importacaoXmlEstoqueRequestId){
            return;
          }

          if(xmlFile){
            xmlFile.value =
              '';
          }

          setStockStatus(
            ''
          );
        }
      );
    }

    if(backXml){
      backXml.addEventListener(
        'click',
        function(){
          if(importacaoXmlEstoqueRequestId){
            return;
          }

          if(xmlFile){
            xmlFile.value =
              '';
          }

          setStockStatus(
            ''
          );

          modo(
            'neutro'
          );
        }
      );
    }

    modeXml.addEventListener(
      'click',
      function(){
        modo(
          'xml'
        );
      }
    );

    modeProduct.addEventListener(
      'click',
      function(){
        /*
         * CADASTRAR sempre significa iniciar um CADASTRO NOVO.
         *
         * Se o operador estiver apenas na visão geral, no XML ou com um
         * produto selecionado para edição/ATUALIZAÇÃO, o clique abandona
         * a seleção atual, limpa o formulário e abre o formulário vazio
         * de CADASTRO DE PRODUTO.
         */
        if(
          cadastroEstoqueManualRequestId ||
          atualizacaoProdutoEstoqueRequestId ||
          exclusaoProdutoEstoqueRequestId ||
          finalizacaoProdutoXmlRequestId
        ){
          return;
        }

        if(
          document.body.classList.contains(
            'scf-stock-neutral-mode'
          ) ||
          document.body.classList.contains(
            'scf-stock-xml-mode'
          ) ||
          produtoEdicaoSelecionado ||
          produtoXmlPendenteSelecionado
        ){
          encerrarEdicaoProduto();

          limparProdutoXmlPendente(
            true
          );

          modo(
            'produto'
          );

          atualizarRotuloAcaoProduto();
          atualizarTituloPainelProduto();
        }
      }
    );

    if(
      chooseXml &&
      xmlFile
    ){
      chooseXml.addEventListener(
        'click',
        function(){
          if(importacaoXmlEstoqueRequestId){
            return;
          }

          xmlFile.click();
        }
      );

      xmlFile.addEventListener(
        'change',
        async function(){
          const file =
            xmlFile.files &&
            xmlFile.files[0];

          if(
            !file ||
            importacaoXmlEstoqueRequestId
          ){
            return;
          }

          const modeXmlButton =
            document.getElementById(
              'scfStockModeXml'
            );

          importacaoXmlEstoqueRequestId =
            'scf-stock-xml-' +
            Date.now() +
            '-' +
            Math.random()
              .toString(36)
              .slice(2,8);

          chooseXml.disabled =
            true;

          chooseXml.setAttribute(
            'aria-disabled',
            'true'
          );

          if(clearXml){
            clearXml.disabled =
              true;

            clearXml.setAttribute(
              'aria-disabled',
              'true'
            );
          }

          if(backXml){
            backXml.disabled =
              true;

            backXml.setAttribute(
              'aria-disabled',
              'true'
            );
          }

          if(modeXmlButton){
            modeXmlButton.disabled =
              true;

            modeXmlButton.setAttribute(
              'aria-disabled',
              'true'
            );
          }

          setStockStatus(
            'LENDO XML DO FORNECEDOR...'
          );

          try{
            const xml =
              await file.text();

            setStockStatus(
              'REGISTRANDO NF-e EM NOTAS DE ENTRADA...'
            );

            window.__scfPdvInfra.shellBridge.post({
              type:
                'SCF_ESTOQUE_XML_FORNECEDOR_IMPORTAR_SOLICITAR',

              requestId:
                importacaoXmlEstoqueRequestId,

              nomeArquivo:
                file.name,

              xml
            },'*');

            window.__scfPdvInfra.eventBus.dispatch(
              new CustomEvent(
                'scf:estoque-xml-selecionado',
                {
                  detail:{
                    requestId:
                      importacaoXmlEstoqueRequestId,

                    nomeArquivo:
                      file.name,

                    xml
                  }
                }
              )
            );
          }catch(error){
            importacaoXmlEstoqueRequestId =
              '';

            chooseXml.disabled =
              false;

            chooseXml.setAttribute(
              'aria-disabled',
              'false'
            );

            if(clearXml){
              clearXml.disabled =
                false;

              clearXml.setAttribute(
                'aria-disabled',
                'false'
              );
            }

            if(backXml){
              backXml.disabled =
                false;

              backXml.setAttribute(
                'aria-disabled',
                'false'
              );
            }

            if(modeXmlButton){
              modeXmlButton.disabled =
                false;

              modeXmlButton.setAttribute(
                'aria-disabled',
                'false'
              );
            }

            xmlFile.value =
              '';

            setStockStatus(
              'NÃO FOI POSSÍVEL LER O XML'
            );
          }
        }
      );
    }
  }

  function selecionarMenuEstoque(){
    try{
      const iframe =
        document.getElementById(
          '__htmlStatusIframe'
        );

      if(
        iframe &&
        iframe.contentWindow
      ){
        iframe.contentWindow.postMessage({
          type:
            'SCF_MENU_SELECIONAR_ESTOQUE'
        },'*');
      }
    }catch(error){}
  }


  function solicitarListaEstoqueSilenciosa(
    silencioso
  ){
    if(estoqueListaCarregando){
      return false;
    }

    estoqueListaCarregando =
      true;

    estoqueListaSilenciosa =
      silencioso === true;

    estoqueListaRequestId =
      'scf-estoque-lista-' +
      Date.now() +
      '-' +
      Math.random()
        .toString(36)
        .slice(2,8);

    try{
      window.__scfPdvInfra.shellBridge.post({
        type:
          'SCF_ESTOQUE_LISTAR_SOLICITAR',

        requestId:
          estoqueListaRequestId,

        silencioso:
          estoqueListaSilenciosa
      },'*');

      return true;
    }catch(error){
      estoqueListaCarregando =
        false;

      estoqueListaSilenciosa =
        false;

      estoqueListaRequestId =
        '';

      return false;
    }
  }

  function abrirEstoque(opcoes){
    const sincronizarMenu =
      !opcoes ||
      opcoes.sincronizarMenu !==
        false;

    if(
      !desktopMq.matches
    ){
      return;
    }

    if(
      !garantirEstrutura()
    ){
      return;
    }

    const history =
      document.getElementById(
        'scfSalesHistoryOverlay'
      );

    if(
      history &&
      (
        history.classList.contains(
          'show'
        ) ||
        history.getAttribute(
          'aria-hidden'
        ) !==
          'true'
      )
    ){
      history.classList.remove(
        'show'
      );

      history.setAttribute(
        'aria-hidden',
        'true'
      );
    }

    document.body.classList.remove(
      'scf-sales-history-open',
      'scf-customer-registration-open',
      'fiscal-products-view-open',
      'scf-history-year-dashboard-on-photo',
      'scf-history-calendar-on-photo'
    );

    /*
     * Ao entrar no ESTOQUE vindo de VENDAS, o overlay do histórico pode
     * ser fechado sem passar por closeHistory(). Nesse caso o dashboard
     * anual permanece com hidden=false e reaparece sobre o PDV quando o
     * ESTOQUE é fechado. Desliga explicitamente esse estado aqui.
     */
    const historyAnnualDashboard =
      document.getElementById(
        'scfHistoryAnnualDashboard'
      );

    if(historyAnnualDashboard){
      historyAnnualDashboard.hidden =
        true;
    }

    const customer =
      document.getElementById(
        'scfCustomerRegistrationOverlay'
      );

    if(customer){
      customer.classList.remove(
        'show'
      );

      customer.setAttribute(
        'aria-hidden',
        'true'
      );
    }

    const shell =
      document.querySelector(
        '.fiscal-form-shell'
      );

    const card =
      document.querySelector(
        '.fiscal-form-card'
      );

    const primary =
      document.getElementById(
        'fiscalPrimaryView'
      );

    const products =
      document.getElementById(
        'fiscalProductsView'
      );

    if(shell){
      shell.hidden =
        false;
    }

    if(card){
      card.hidden =
        false;
    }

    if(primary){
      primary.hidden =
        false;

      primary.style.removeProperty(
        'display'
      );
    }

    if(products){
      products.hidden =
        false;

      products.style.removeProperty(
        'display'
      );
    }

    document.body.classList.add(
      'scf-stock-page-open'
    );

    modo(
      'neutro'
    );

    const overlay =
      document.getElementById(
        'scfStockOverlay'
      );

    if(overlay){
      overlay.setAttribute(
        'aria-hidden',
        'false'
      );
    }

    if(sincronizarMenu){
      selecionarMenuEstoque();
    }

    if(
      estoqueCachePronto ===
        true
    ){
      /*
       * Reentrada instantânea: reaproveita a última fotografia completa
       * já recebida e só confere a VPS em segundo plano.
       */
      renderizar();

      solicitarListaEstoqueSilenciosa(
        true
      );
    }else{
      /*
       * Primeiro acesso: se uma pré-carga já estiver em andamento,
       * a função simplesmente não duplica a requisição.
       */
      solicitarListaEstoqueSilenciosa(
        false
      );
    }
  }

  function fecharEstoque(opcoes){
    const sincronizarMenu =
      !opcoes ||
      opcoes.sincronizarMenu !==
        false;

    clearStockGtinTimers();
    produtoXmlPendenteSelecionado = null;
    bloquearCamposMovimentoXml(false);

    const overlay =
      document.getElementById(
        'scfStockOverlay'
      );

    if(overlay){
      overlay.setAttribute(
        'aria-hidden',
        'true'
      );
    }

    document.body.classList.remove(
      'scf-stock-page-open',
      'scf-stock-xml-mode',
      'scf-stock-neutral-mode'
    );

    const primary =
      document.getElementById(
        'fiscalPrimaryView'
      );

    const products =
      document.getElementById(
        'fiscalProductsView'
      );

    if(primary){
      primary.hidden =
        false;

      primary.style.removeProperty(
        'display'
      );
    }

    if(products){
      products.hidden =
        false;

      products.style.removeProperty(
        'display'
      );
    }

    if(sincronizarMenu){
      try{
        const iframe =
          document.getElementById(
            '__htmlStatusIframe'
          );

        if(
          iframe &&
          iframe.contentWindow
        ){
          iframe.contentWindow.postMessage({
            type:
              'SCF_MENU_SELECIONAR_CENTRAL'
          },'*');
        }
      }catch(error){}
    }
  }

  function atualizarProdutos(lista){
    inventoryDomain.setProducts(
      lista
    );

    renderizar();

    try{
      window.__scfPdvInfra.eventBus.dispatch(
        new CustomEvent(
          'scf:estoque-produtos-atualizados',
          {
            detail:{
              valorEstimado:
                calcularValorEstimadoEstoque(),
              produtosCadastrados:
                contarProdutosCadastrados(),
              margemPotencial:
                calcularMargemPotencialEstoque()
            }
          }
        )
      );
    }catch(error){}
  }

  window.scfAbrirEstoque =
    abrirEstoque;

  window.scfFecharEstoque =
    fecharEstoque;

  window.scfAtualizarEstoque =
    atualizarProdutos;

  window.__scfPdvInfra.shellBridge.onMessage(
    function(event){
      const data =
        event &&
        event.data &&
        typeof event.data ===
          'object'
          ? event.data
          : null;

      if(!data){
        return;
      }

      if(
        data.type ===
          'SCF_LAYOUT_PRINCIPAL_PAGINA_SOLICITADA' &&
        String(
          data.pagina ||
          ''
        ).toUpperCase() ===
          'ESTOQUE'
      ){
        /*
         * COLABORADOR usa o mesmo espaço visual do módulo ESTOQUE.
         * Fecha primeiro o cadastro de colaborador e só depois abre
         * o Estoque. A ordem é importante: anteriormente o Estoque
         * abria primeiro e o overlay do COLABORADOR permanecia no
         * painel esquerdo, criando a tela híbrida vista no teste.
         */
        try{
          window.__scfPdvInfra.eventBus.dispatch(
            new CustomEvent(
              'scf:fechar-cadastro-colaborador',
              {
                detail:{
                  voltarPdv:false,
                  destino:'ESTOQUE'
                }
              }
            )
          );
        }catch(error){}

        abrirEstoque({
          sincronizarMenu:
            false
        });

        return;
      }

      if(
        (
          data.type ===
            'SCF_PRODUTO_GTIN_PENDENTE' ||
          data.type ===
            'SCF_PRODUTO_GTIN_RESULTADO' ||
          data.type ===
            'SCF_PRODUTO_GTIN_ERRO'
        ) &&
        text(
          data.requestId
        ) ===
          pesquisaGtinEstoqueRequestId
      ){
        if(
          data.type ===
            'SCF_PRODUTO_GTIN_PENDENTE'
        ){
          pesquisaGtinEstoqueResponseId =
            text(
              data.responseId ||
              pesquisaGtinEstoqueResponseId
            );

          setStockStatus(
            data.message ||
            'PESQUISANDO PRODUTO E DADOS FISCAIS...'
          );

          scheduleStockGtinPoll();

          return;
        }

        clearStockGtinTimers();

        if(
          data.type ===
            'SCF_PRODUTO_GTIN_RESULTADO'
        ){
          pesquisaGtinEstoqueResponseId =
            text(
              data.responseId ||
              pesquisaGtinEstoqueResponseId
            );

          if(
            data.success ===
              true &&
            data.found ===
              true &&
            fillStockFormFromAi(
              data.produto,
              pesquisaGtinEstoqueResponseId
            )
          ){
            return;
          }

          pesquisaGtinEstoqueRequestId =
            '';

          pesquisaGtinEstoqueResponseId =
            '';

          const pesquisaId =
            document.getElementById(
              'scfStockPesquisaId'
            );

          if(pesquisaId){
            pesquisaId.value =
              '';
          }

          setStockStatus(
            data.found === false
              ? 'GTIN NÃO LOCALIZADO — PREENCHA OS DADOS DO PRODUTO E CADASTRE MANUALMENTE'
              : (
                  data.message ||
                  'NÃO FOI POSSÍVEL IDENTIFICAR O PRODUTO PELO CÓDIGO DE BARRAS'
                )
          );

          return;
        }

        pesquisaGtinEstoqueRequestId =
          '';

        pesquisaGtinEstoqueResponseId =
          '';

        const pesquisaId =
          document.getElementById(
            'scfStockPesquisaId'
          );

        if(pesquisaId){
          pesquisaId.value =
            '';
        }

        setStockStatus(
          data.message ||
          'NÃO FOI POSSÍVEL PESQUISAR O PRODUTO PELO CÓDIGO DE BARRAS'
        );

        return;
      }

      if(
        (
          data.type ===
            'SCF_ESTOQUE_PRODUTO_CADASTRADO' ||
          data.type ===
            'SCF_ESTOQUE_PRODUTO_CADASTRO_ERRO'
        ) &&
        text(
          data.requestId
        ) ===
          cadastroEstoqueManualRequestId
      ){
        const registerButton =
          document.getElementById(
            'scfStockRegisterProduct'
          );

        cadastroEstoqueManualRequestId =
          '';

        if(registerButton){
          registerButton.disabled =
            false;

          registerButton.setAttribute(
            'aria-disabled',
            'false'
          );
        }

        if(
          data.type ===
            'SCF_ESTOQUE_PRODUTO_CADASTRADO' &&
          data.success ===
            true
        ){
          /*
           * Cadastro concluído:
           * limpa imediatamente o formulário e deixa o GTIN pronto
           * para o próximo produto, sem exigir clique em LIMPAR.
           */
          limparProdutoXmlPendente(
            true
          );

          encerrarEdicaoProduto();
          atualizarRotuloAcaoProduto();
          atualizarTituloPainelProduto();

          setStockStatus(
            data.message ||
            'PRODUTO CADASTRADO COM SUCESSO'
          );

          function focarProximoGtinCadastro(){
            const barcodeField =
              document.getElementById(
                'scfStockBarcode'
              );

            if(!barcodeField){
              return;
            }

            try{
              barcodeField.focus({
                preventScroll:
                  true
              });
            }catch(error){
              barcodeField.focus();
            }

            try{
              barcodeField.select();
            }catch(error){}
          }

          focarProximoGtinCadastro();

          window.setTimeout(
            focarProximoGtinCadastro,
            80
          );

          window.setTimeout(
            focarProximoGtinCadastro,
            220
          );

          return;
        }

        setStockStatus(
          data.message ||
          'NÃO FOI POSSÍVEL CADASTRAR O PRODUTO NO ESTOQUE'
        );

        return;
      }

      if(
        atualizacaoProdutoEstoqueRequestId &&
        (
          data.type ===
            'SCF_ESTOQUE_PRODUTO_ATUALIZADO' ||
          data.type ===
            'SCF_ESTOQUE_PRODUTO_ATUALIZAR_ERRO'
        ) &&
        text(
          data.requestId
        ) ===
          atualizacaoProdutoEstoqueRequestId
      ){
        const registerButton =
          document.getElementById(
            'scfStockRegisterProduct'
          );

        atualizacaoProdutoEstoqueRequestId =
          '';

        if(registerButton){
          registerButton.disabled =
            false;

          registerButton.setAttribute(
            'aria-disabled',
            'false'
          );
        }

        if(
          data.type ===
            'SCF_ESTOQUE_PRODUTO_ATUALIZADO' &&
          data.success ===
            true
        ){
          registrarEstadoOriginalProdutoEdicao();
          atualizarRotuloAcaoProduto();

          setStockStatus(
            data.message ||
            'PRODUTO ATUALIZADO COM SUCESSO'
          );

          try{
            solicitarListaEstoqueSilenciosa(
              true
            );
          }catch(error){}

          return;
        }

        setStockStatus(
          data.message ||
          'NÃO FOI POSSÍVEL ATUALIZAR O PRODUTO'
        );

        return;
      }

      if(
        exclusaoProdutoEstoqueRequestId &&
        (
          data.type ===
            'SCF_ESTOQUE_PRODUTO_EXCLUIDO' ||
          data.type ===
            'SCF_ESTOQUE_PRODUTO_EXCLUIR_ERRO'
        ) &&
        text(
          data.requestId
        ) ===
          exclusaoProdutoEstoqueRequestId
      ){
        const registerButton =
          document.getElementById(
            'scfStockRegisterProduct'
          );

        const produtoIdExcluido =
          produtoEdicaoSelecionado &&
          produtoEdicaoSelecionado.produtoId
            ? produtoEdicaoSelecionado.produtoId
            : '';

        exclusaoProdutoEstoqueRequestId =
          '';

        if(registerButton){
          registerButton.disabled =
            false;

          registerButton.setAttribute(
            'aria-disabled',
            'false'
          );
        }

        if(
          data.type ===
            'SCF_ESTOQUE_PRODUTO_EXCLUIDO' &&
          data.success ===
            true
        ){
          if(produtoIdExcluido){
            inventoryDomain.products =
              inventoryDomain.products.filter(
                function(item){
                  return produtoNormalizado(
                    item
                  ).produtoId !==
                    produtoIdExcluido;
                }
              );

            renderizar();
          }

          limparProdutoXmlPendente(
            true
          );

          encerrarEdicaoProduto();

          modo(
            'neutro'
          );

          try{
            solicitarListaEstoqueSilenciosa(
              true
            );
          }catch(error){}

          return;
        }

        atualizarRotuloAcaoProduto();

        setStockStatus(
          data.message ||
          'NÃO FOI POSSÍVEL EXCLUIR O PRODUTO'
        );

        return;
      }

      if(
        finalizacaoProdutoXmlRequestId &&
        (
          data.type ===
            'SCF_ESTOQUE_XML_PRODUTO_FINALIZADO' ||
          data.type ===
            'SCF_ESTOQUE_XML_PRODUTO_FINALIZAR_ERRO'
        ) &&
        text(
          data.requestId
        ) ===
          finalizacaoProdutoXmlRequestId
      ){
        const registerButton =
          document.getElementById(
            'scfStockRegisterProduct'
          );

        finalizacaoProdutoXmlRequestId =
          '';

        if(registerButton){
          registerButton.disabled =
            false;

          registerButton.setAttribute(
            'aria-disabled',
            'false'
          );
        }

        if(
          data.type ===
            'SCF_ESTOQUE_XML_PRODUTO_FINALIZADO' &&
          data.success ===
            true
        ){
          const mensagemFinal =
            data.message ||
            'PRODUTO IMPORTADO DO XML FINALIZADO COM SUCESSO';

          limparProdutoXmlPendente(
            true
          );

          setStockStatus(
            mensagemFinal
          );

          return;
        }

        setStockStatus(
          data.message ||
          'NÃO FOI POSSÍVEL FINALIZAR O PRODUTO IMPORTADO DO XML'
        );

        return;
      }

      if(
        importacaoXmlEstoqueRequestId &&
        (
          data.type ===
            'SCF_ESTOQUE_XML_FORNECEDOR_IMPORTADO' ||
          data.type ===
            'SCF_ESTOQUE_XML_FORNECEDOR_ERRO'
        ) &&
        text(
          data.requestId
        ) ===
          importacaoXmlEstoqueRequestId
      ){
        const chooseXml =
          document.getElementById(
            'scfStockChooseXml'
          );

        const xmlFile =
          document.getElementById(
            'scfStockXmlFile'
          );

        const modeXmlButton =
          document.getElementById(
            'scfStockModeXml'
          );

        if(
          data.type ===
            'SCF_ESTOQUE_XML_FORNECEDOR_IMPORTADO' &&
          data.success ===
            true
        ){
          const notaEntradaId =
            text(
              data.notaEntrada?.id ||
              data.notaEntradaId
            );

          if(!notaEntradaId){
            importacaoXmlEstoqueRequestId =
              '';

            if(chooseXml){
              chooseXml.disabled =
                false;

              chooseXml.setAttribute(
                'aria-disabled',
                'false'
              );
            }

            setXmlActionButtonsDisabled(
              false
            );

            if(modeXmlButton){
              modeXmlButton.disabled =
                false;

              modeXmlButton.setAttribute(
                'aria-disabled',
                'false'
              );
            }

            if(xmlFile){
              xmlFile.value =
                '';
            }

            setStockStatus(
              'NF-e REGISTRADA, MAS O ID DE NOTAS DE ENTRADA NÃO FOI RETORNADO'
            );

            return;
          }

          setStockStatus(
            'NF-e REGISTRADA. PROCESSANDO PRODUTOS E ENTRADA DE ESTOQUE...'
          );

          window.__scfPdvInfra.shellBridge.post({
            type:
              'SCF_ESTOQUE_XML_ITENS_PROCESSAR_SOLICITAR',

            requestId:
              importacaoXmlEstoqueRequestId,

            notaEntradaId
          },'*');

          return;
        }

        importacaoXmlEstoqueRequestId =
          '';

        if(chooseXml){
          chooseXml.disabled =
            false;

          chooseXml.setAttribute(
            'aria-disabled',
            'false'
          );
        }

        setXmlActionButtonsDisabled(
          false
        );

        if(modeXmlButton){
          modeXmlButton.disabled =
            false;

          modeXmlButton.setAttribute(
            'aria-disabled',
            'false'
          );
        }

        if(xmlFile){
          xmlFile.value =
            '';
        }

        setStockStatus(
          data.message ||
          'NÃO FOI POSSÍVEL REGISTRAR A NF-e DE ENTRADA'
        );

        return;
      }

      if(
        importacaoXmlEstoqueRequestId &&
        (
          data.type ===
            'SCF_ESTOQUE_XML_ITENS_PROCESSADOS' ||
          data.type ===
            'SCF_ESTOQUE_XML_ITENS_PROCESSAR_ERRO'
        ) &&
        text(
          data.requestId
        ) ===
          importacaoXmlEstoqueRequestId
      ){
        const chooseXml =
          document.getElementById(
            'scfStockChooseXml'
          );

        const xmlFile =
          document.getElementById(
            'scfStockXmlFile'
          );

        const modeXmlButton =
          document.getElementById(
            'scfStockModeXml'
          );

        importacaoXmlEstoqueRequestId =
          '';

        if(chooseXml){
          chooseXml.disabled =
            false;

          chooseXml.setAttribute(
            'aria-disabled',
            'false'
          );
        }

        setXmlActionButtonsDisabled(
          false
        );

        if(modeXmlButton){
          modeXmlButton.disabled =
            false;

          modeXmlButton.setAttribute(
            'aria-disabled',
            'false'
          );
        }

        if(xmlFile){
          xmlFile.value =
            '';
        }

        if(
          data.type ===
            'SCF_ESTOQUE_XML_ITENS_PROCESSADOS' &&
          data.success ===
            true
        ){
          setStockStatus(
            data.message ||
            'NF-e PROCESSADA E ENTRADA DE ESTOQUE REGISTRADA COM SUCESSO'
          );

          try{
            solicitarListaEstoqueSilenciosa(
              true
            );
          }catch(error){}

          return;
        }

        setStockStatus(
          data.message ||
          'A NF-e FOI REGISTRADA, MAS NÃO FOI POSSÍVEL PROCESSAR OS ITENS'
        );

        return;
      }

      if(
        data.type ===
          'SCF_ESTOQUE_LISTAR_RESULTADO' ||
        data.type ===
          'SCF_ESTOQUE_ATUALIZADO'
      ){
        if(
          data.requestId &&
          estoqueListaRequestId &&
          text(
            data.requestId
          ) !==
            estoqueListaRequestId
        ){
          return;
        }

        const eraSilenciosa =
          estoqueListaSilenciosa ===
            true;

        estoqueListaCarregando =
          false;

        estoqueListaSilenciosa =
          false;

        estoqueListaRequestId =
          '';

        if(
          data.success ===
            false
        ){
          /*
           * Falha transitória numa conferência silenciosa nunca apaga a
           * fotografia válida que o operador já possui.
           */
          if(
            estoqueCachePronto ===
              true
          ){
            if(
              document.body.classList.contains(
                'scf-stock-page-open'
              )
            ){
              renderizar();
            }

            return;
          }

          if(
            document.body.classList.contains(
              'scf-stock-page-open'
            )
          ){
            setStockStatus(
              data.message ||
              'NÃO FOI POSSÍVEL CARREGAR O ESTOQUE. TENTE NOVAMENTE.'
            );
          }

          return;
        }

        atualizarProdutos(
          data.produtos ||
          data.estoque ||
          data.items ||
          []
        );

        estoqueCachePronto =
          true;

        return;
      }

      if(
        data.type ===
          'SCF_FISCAL_HOME_ABRIR' ||
        data.type ===
          'SCF_HISTORICO_VENDAS_ABRIR' ||
        (
          data.type ===
            'SCF_LAYOUT_PRINCIPAL_PAGINA_SOLICITADA' &&
          String(
            data.pagina ||
            ''
          ).toUpperCase() !==
            'ESTOQUE' &&
          String(
            data.pagina ||
            ''
          ).toUpperCase() !==
            'CADASTRAR'
        )
      ){
        clearStockGtinTimers();

        const overlay =
          document.getElementById(
            'scfStockOverlay'
          );

        if(overlay){
          overlay.setAttribute(
            'aria-hidden',
            'true'
          );
        }

        document.body.classList.remove(
          'scf-stock-page-open',
          'scf-stock-xml-mode'
        );

        if(
          data.type ===
            'SCF_FISCAL_HOME_ABRIR'
        ){
          /*
           * PRÉ-CARGA DO ESTOQUE:
           * deixa a fotografia pronta antes de o operador clicar em ESTOQUE.
           */
          if(
            estoquePreloadSolicitado !==
              true &&
            estoqueCachePronto !==
              true &&
            !estoqueListaCarregando
          ){
            estoquePreloadSolicitado =
              true;

            window.setTimeout(
              function(){
                if(
                  estoqueCachePronto !==
                    true &&
                  !estoqueListaCarregando
                ){
                  solicitarListaEstoqueSilenciosa(
                    true
                  );
                }
              },
              500
            );
          }

          const primary =
            document.getElementById(
              'fiscalPrimaryView'
            );

          const products =
            document.getElementById(
              'fiscalProductsView'
            );

          if(primary){
            primary.hidden =
              false;

            primary.style.removeProperty(
              'display'
            );
          }

          if(products){
            products.hidden =
              false;

            products.style.removeProperty(
              'display'
            );
          }
        }
      }
    }
  );

  /*
   * CADASTRO funciona como dropdown:
   * abrir o menu não fecha ESTOQUE.
   * Somente a escolha efetiva de uma opção encerra a tela atual.
   */
  window.__scfPdvInfra.eventBus.on('scf:cadastrar-opcao',
    function(event){
      const opcao =
        String(
          event &&
          event.detail &&
          event.detail.opcao ||
          ''
        ).toUpperCase();

      if(
        (
          opcao === 'CLIENTE' ||
          opcao === 'FORNECEDOR' ||
          opcao === 'COLABORADOR'
        ) &&
        document.body.classList.contains(
          'scf-stock-page-open'
        )
      ){
        fecharEstoque({
          sincronizarMenu:
            false
        });
      }
    }
  );

  document.addEventListener(
    'keydown',
    function(event){
      if(
        event.key ===
          'Escape' &&
        document.body.classList.contains(
          'scf-stock-page-open'
        )
      ){
        fecharEstoque();
      }
    }
  );

  function inicializar(){
    garantirEstrutura();
  }

  if(
    document.readyState ===
      'loading'
  ){
    document.addEventListener(
      'DOMContentLoaded',
      inicializar,
      {
        once:
          true
      }
    );
  }else{
    inicializar();
  }
})();
