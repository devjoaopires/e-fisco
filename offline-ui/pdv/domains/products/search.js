(function(){
  'use strict';

  const productsDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.products;
  const navigationState =
    window.__scfPdvState &&
    window.__scfPdvState.navigation;

  if(
    !productsDomain ||
    !navigationState
  ){
    throw new Error(
      'PDV products search: domain/state indisponiveis.'
    );
  }

  const desktopMq =
    window.matchMedia(
      '(min-width:1001px)'
    );

  const input =
    document.getElementById(
      'productName'
    );

  if(!input){
    return;
  }

  let consultaAtiva =
    false;

  let estoqueCarregado =
    false;

  let estoqueSolicitado =
    false;

  let itensEstoque =
    [];

  let resultados =
    [];

  let indiceAtivo =
    -1;

  let valorAntesConsulta =
    '';

  let requestProdutoFiscal =
    0;

  let aguardandoInclusao =
    false;

  let mensagemConsulta =
    '';

  /*
   * O aviso LOCALIZANDO PRODUTO só aparece quando uma consulta externa
   * realmente ultrapassa 250 ms. Respostas rápidas não piscam mensagem.
   */
  let localizandoProdutoTimer =
    null;

  let produtoSelecionadoPendente =
    null;

  /*
   * Compatibilidade com estados antigos do PREVIEW F4.
   * No fluxo atual, o primeiro ENTER que escolhe um produto válido já
   * conclui a inclusão automaticamente após a validação fiscal.
   */
  let aguardandoConfirmacaoConsulta =
    false;


  /*
   * TABELA ÚNICA DO PDV:
   * venda normal, busca F4 e lista F5 reutilizam o mesmo cabeçalho e o mesmo corpo.
   */
  const cabecalhoTabelaCompartilhadaHtml =
    (
      document.querySelector(
        '#scfPdvUnifiedHeader'
      )?.innerHTML ||
      '<span>ITEM</span><span>DESCRIÇÃO</span><span>QTD</span><span>UN</span><span>VL UNIT.</span><span>STATUS</span>'
    );

  function aplicarCabecalhoConsultaCompartilhado(header){
    if(!header){
      return;
    }

    const rotulos = [
      'CÓDIGO',
      'DESCRIÇÃO DO PRODUTO',
      'VALOR UN.',
      'QTD'
    ];

    const atual = Array.from(header.children).map(function(node){
      return String(node.textContent || '').trim();
    });

    if(
      atual.length === rotulos.length &&
      atual.every(function(valor,index){
        return valor === rotulos[index];
      })
    ){
      return;
    }

    header.replaceChildren();

    rotulos.forEach(function(rotulo){
      const span = document.createElement('span');
      span.textContent = rotulo;
      header.appendChild(span);
    });
  }

  function restaurarTabelaCompartilhadaVenda(){
    const header = document.querySelector(
      '#scfPdvUnifiedHeader'
    );

    if(header){
      header.innerHTML = cabecalhoTabelaCompartilhadaHtml;
    }

    /*
     * Usa o renderer canônico já exposto pelo PDV. Assim qualquer item
     * incluído/alterado durante o F4 reaparece corretamente ao fechar a busca.
     */
    if(typeof window.scfRenderizarProdutosPdv === 'function'){
      try{
        window.scfRenderizarProdutosPdv();
      }catch(error){}
    }
  }

  function texto(valor){
    return String(
      valor == null
        ? ''
        : valor
    )
      .replace(/\s+/g,' ')
      .trim();
  }

  function normalizar(valor){
    return texto(valor)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toUpperCase();
  }

  function somenteDigitos(valor){
    return texto(valor)
      .replace(/\D/g,'');
  }

  /*
   * Helper LOCAL da consulta F4.
   * Cada script deste iframe roda em um IIFE isolado; por isso a função
   * precisa existir também neste escopo.
   */
  const pdvCodigoInternoBalancaValido =
    productsDomain.isInternalScaleCode;

  function dinheiro(valor){
    const numero =
      Number(valor || 0);

    return new Intl.NumberFormat(
      'pt-BR',
      {
        style:'currency',
        currency:'BRL'
      }
    ).format(
      Number.isFinite(numero)
        ? numero
        : 0
    );
  }

  function mostrarAvisoEstoque(mensagem){
    const toast =
      document.getElementById(
        'fiscalToast'
      );

    if(!toast){
      return;
    }

    toast.textContent =
      mensagem;

    toast.classList.add(
      'show'
    );

    window.clearTimeout(
      mostrarAvisoEstoque.timer
    );

    mostrarAvisoEstoque.timer =
      window.setTimeout(
        function(){
          toast.classList.remove(
            'show'
          );
        },
        2600
      );
  }

  function numeroDinheiroCampo(valor){
    let bruto =
      texto(valor)
        .replace(/[^0-9,.-]/g,'');

    if(!bruto){
      return 0;
    }

    if(bruto.includes(',')){
      bruto =
        bruto
          .replace(/\./g,'')
          .replace(',','.');
    }

    const numero =
      Number(bruto);

    return Number.isFinite(numero)
      ? numero
      : 0;
  }

  function capturarProdutoPreparado(){
    const campo =
      function(id){
        return document.getElementById(id);
      };

    const nome =
      texto(
        input.value
      );

    const quantidade =
      Number(
        campo('productQuantity') &&
        campo('productQuantity').value ||
        0
      );

    const unitValue =
      numeroDinheiroCampo(
        campo('productUnitValue') &&
        campo('productUnitValue').value
      );

    const preview = {
      name:
        nome,
      quantity:
        quantidade > 0
          ? quantidade
          : 1,
      unit:
        texto(
          campo('productUnit') &&
          campo('productUnit').value
        ).toUpperCase(),
      unitValue:
        unitValue,
      total:
        (quantidade > 0 ? quantidade : 1) * unitValue,
      productFiscalId:
        texto(
          campo('productFiscalId') &&
          campo('productFiscalId').value
        ),
      productCode:
        texto(
          campo('productCode') &&
          campo('productCode').value
        ),
      gtin:
        texto(
          campo('productGtin') &&
          campo('productGtin').value
        ),
      barcode:
        texto(
          campo('productBarcode') &&
          campo('productBarcode').value
        ),
      ncm:
        texto(
          campo('ncmCode') &&
          campo('ncmCode').value
        ),
      cfop:
        texto(
          campo('cfopCode') &&
          campo('cfopCode').value
        )
    };

    if(
      !preview.name ||
      !preview.productFiscalId ||
      !preview.unit ||
      preview.quantity <= 0 ||
      preview.unitValue <= 0
    ){
      return null;
    }

    return preview;
  }

  function produtoNormalizado(item){
    const produto =
      item &&
      typeof item ===
        'object'
        ? item
        : {};

    /*
     * A busca F4 usa a mesma regra visual da página ESTOQUE:
     * - quantidade <= 0: sem estoque;
     * - quantidade entre 1 e 3: estoque baixo.
     */
    const quantidadeEstoque =
      Number(
        produto.quantidade ??
        produto.estoque ??
        produto.stock ??
        0
      ) || 0;

    return {
      id:
        texto(
          produto.produtoId ??
          produto.id ??
          produto._id
        ),

      codigo:
        texto(
          produto.codigoBarras ??
          produto.barcode ??
          produto.gtin ??
          produto.codigo ??
          produto.sku
        ),

      nome:
        texto(
          produto.nome ??
          produto.name ??
          produto.descricao ??
          produto.description
        ),

      valorUnitario:
        Number(
          produto.precoVenda ??
          produto.price ??
          produto.valorVenda ??
          produto.valorUnitario ??
          0
        ) || 0,

      quantidade:
        quantidadeEstoque,

      semEstoque:
        quantidadeEstoque <= 0,

      estoqueBaixo:
        quantidadeEstoque > 0 &&
        quantidadeEstoque <= 3,

      original:
        produto
    };
  }

  function cacheProdutoEstoqueParaPdv(item){
    if(
      !item ||
      typeof item !== 'object'
    ){
      return null;
    }

    const cacheFn =
      productsDomain.cacheFiscalProduct;

    if(typeof cacheFn !== 'function'){
      return null;
    }

    return cacheFn(
      item.original,
      {
        id:
          item.id,
        codigo:
          item.codigo,
        gtin:
          item.codigo,
        nome:
          item.nome,
        valorUnitario:
          item.valorUnitario
      }
    );
  }

  function produtoFiscalLocalSelecionado(item){
    if(
      !item ||
      typeof item !== 'object'
    ){
      return null;
    }

    cacheProdutoEstoqueParaPdv(
      item
    );

    const buscarFn =
      productsDomain.findCachedFiscalProduct;

    if(typeof buscarFn !== 'function'){
      return null;
    }

    const codigoConsulta =
      somenteDigitos(
        item.codigo
      );

    return buscarFn({
      codigo:
        pdvCodigoInternoBalancaValido(
          codigoConsulta
        )
          ? codigoConsulta
          : '',
      barcode:
        pdvCodigoInternoBalancaValido(
          codigoConsulta
        )
          ? ''
          : codigoConsulta,
      descricao:
        item.nome,
      produto:
        item.original,
      fallback:{
        id:
          item.id,
        codigo:
          item.codigo,
        gtin:
          item.codigo,
        nome:
          item.nome,
        valorUnitario:
          item.valorUnitario
      }
    });
  }

  function cancelarIndicadorLocalizandoProduto(){
    if(localizandoProdutoTimer){
      window.clearTimeout(
        localizandoProdutoTimer
      );

      localizandoProdutoTimer =
        null;
    }
  }

  function agendarIndicadorLocalizandoProduto(){
    cancelarIndicadorLocalizandoProduto();

    localizandoProdutoTimer =
      window.setTimeout(
        function(){
          localizandoProdutoTimer =
            null;

          if(
            consultaAtiva &&
            aguardandoInclusao
          ){
            renderResultados();
          }
        },
        250
      );
  }


  function pdvNormalDisponivel(){
    if(!desktopMq.matches){
      return false;
    }

    const body =
      document.body;

    if(!body){
      return false;
    }

    /*
     * F5 — LISTA DE CLIENTES:
     * enquanto a tabela mostra somente os clientes do crediário, F4 não
     * representa uma venda editável e deve permanecer totalmente inativo.
     * Depois de PAGAR, no detalhe com a lista de produtos do cliente, a
     * exceção crediarioVendaAberta abaixo volta a liberar a pesquisa F4.
     */
    if(
      body.classList.contains(
        'scf-crediario-list-open'
      ) &&
      !body.classList.contains(
        'scf-crediario-detail-open'
      )
    ){
      return false;
    }

    /*
     * CREDIÁRIO EM ABERTO:
     * depois de clicar PAGAR, o crediário volta a funcionar como uma
     * venda operacional editável. Nesse estado F4 deve continuar disponível
     * para pesquisar e acrescentar produtos normalmente.
     *
     * O formulário de NOVO crediário continua bloqueando F4; a exceção
     * vale somente no detalhe PAGAR / venda aberta.
     */
    const crediarioVendaAberta =
      body.classList.contains(
        'scf-crediario-open'
      ) &&
      body.classList.contains(
        'scf-crediario-detail-open'
      ) &&
      body.classList.contains(
        'scf-crediario-payment-edit-open'
      ) &&
      window.__scfCrediarioPagamentoAguardandoF1 ===
        true &&
      window.__scfCrediarioPagamentoParcialSelecaoAtiva !==
        true;

    const bloqueios = [
      'scf-caixa-open',
      'scf-caixa-abertura-obrigatoria',
      'scf-sales-history-open',
      'scf-customer-registration-open',
      'scf-stock-page-open',
      'scf-history-receipt-desktop',
      'scf-accounting-export-open',
      'scf-history-calendar-on-photo',
      'scf-nfe55-photo-heading-open',
      'scf-nfe55-history-danfe'
    ];

    if(
      bloqueios.some(
        function(nome){
          return body.classList.contains(
            nome
          );
        }
      )
    ){
      return false;
    }

    if(
      body.classList.contains(
        'scf-crediario-open'
      ) &&
      !crediarioVendaAberta
    ){
      return false;
    }

    const frame =
      document.querySelector(
        '#fiscalDesktopProductPhoto > .fiscal-desktop-product-photo-frame'
      );

    if(frame){
      const estadosBloqueados = [
        'is-cash-open',
        'is-sale-finalize-open',
        'is-client-identification-open',
        'is-validation-waiting-open',
        'is-sale-completed-open',
        'is-accounting-export-open',
        'is-product-cancel-open'
      ];

      if(
        estadosBloqueados.some(
          function(nome){
            return frame.classList.contains(
              nome
            );
          }
        )
      ){
        return false;
      }
    }

    const shell =
      document.getElementById(
        'fiscalFormShell'
      );

    return !(
      shell &&
      shell.hidden
    );
  }

  function garantirAreaConsulta(){
    const view =
      document.getElementById(
        'fiscalProductsView'
      );

    if(!view){
      return null;
    }

    /*
     * F4 usa o único cabeçalho real #scfPdvUnifiedHeader e o único
     * corpo #fiscalProductsList. Não existe estrutura paralela de consulta.
     */
    const header =
      view.querySelector(
        ':scope > #scfPdvUnifiedHeader'
      );

    const list =
      document.getElementById(
        'fiscalProductsList'
      );

    if(!header || !list){
      return null;
    }

    header.classList.add(
      'scf-pdv-unified-table-header'
    );

    list.classList.add(
      'scf-pdv-unified-table-body'
    );

    if(
      consultaAtiva ||
      document.body.classList.contains(
        'scf-pdv-product-consult-open'
      )
    ){
      aplicarCabecalhoConsultaCompartilhado(
        header
      );
    }

    return {
      header,
      list
    };
  }

  function sincronizarCampo(){
    if(!desktopMq.matches){
      if(
        input.dataset.scfF5Readonly ===
          '1'
      ){
        input.readOnly =
          false;

        input.removeAttribute(
          'aria-readonly'
        );

        delete input.dataset.scfF5Readonly;
      }

      return;
    }

    input.setAttribute(
      'placeholder',
      consultaAtiva
        ? 'BUSCAR PRODUTO'
        : 'F4 | BUSCAR PRODUTO'
    );

    input.setAttribute(
      'aria-label',
      consultaAtiva
        ? 'Pesquisar produto. Use as setas para navegar e Enter para preparar.'
        : 'F4 | Buscar produto'
    );

    input.setAttribute(
      'autocomplete',
      'off'
    );

    if(!consultaAtiva){
      input.readOnly =
        true;

      input.setAttribute(
        'aria-readonly',
        'true'
      );

      input.dataset.scfF5Readonly =
        '1';
    }else{
      input.readOnly =
        false;

      input.removeAttribute(
        'aria-readonly'
      );
    }
  }

  function marcarProdutoPreparado(ativo){
    const wrap =
      document.getElementById(
        'scfPdvProductSearchWrap'
      );

    if(!wrap){
      return;
    }

    wrap.classList.toggle(
      'scf-pdv-product-prepared',
      Boolean(ativo)
    );
  }

  function renderizarProdutoPreparadoNaLista(){
    try{
      window.__scfPdvInfra.eventBus.dispatch(
        new CustomEvent(
          'scf:pdv-render-current-product-preview'
        )
      );
    }catch(error){}
  }

  function solicitarEstoque(){
    if(estoqueSolicitado){
      return;
    }

    estoqueSolicitado =
      true;

    try{
      window.__scfPdvInfra.shellBridge.post(
        {
          type:
            'SCF_ESTOQUE_LISTAR_SOLICITAR'
        },
        '*'
      );
    }catch(error){
      estoqueSolicitado =
        false;

      mensagemConsulta =
        'NÃO FOI POSSÍVEL CARREGAR OS PRODUTOS';

      renderResultados();
    }
  }

  function filtrarResultados(){
    const termo =
      normalizar(
        input.value
      );

    /*
     * F4 — mostra no máximo 5 produtos por vez.
     * A pesquisa continua sendo feita em TODO o estoque;
     * apenas os 5 primeiros resultados compatíveis são exibidos.
     */
    resultados =
      itensEstoque
        .filter(
          function(item){
            if(!termo){
              return true;
            }

            return (
              normalizar(
                item.codigo
              ).includes(
                termo
              ) ||
              normalizar(
                item.nome
              ).includes(
                termo
              )
            );
          }
        )
        .slice(
          0,
          5
        );

    if(!resultados.length){
      indiceAtivo =
        -1;
    }else if(
      indiceAtivo < 0 ||
      indiceAtivo >=
        resultados.length
    ){
      indiceAtivo =
        0;
    }
  }

  function scrollAtivo(){
    const list =
      document.getElementById(
        'fiscalProductsList'
      );

    if(!list){
      return;
    }

    const row =
      list.querySelector(
        '.scf-pdv-consult-row.is-keyboard-active'
      );

    if(!row){
      return;
    }

    try{
      row.scrollIntoView({
        block:'nearest',
        inline:'nearest',
        behavior:'smooth'
      });
    }catch(error){
      row.scrollIntoView(
        false
      );
    }
  }

  function marcarAtivo(){
    const list =
      document.getElementById(
        'fiscalProductsList'
      );

    if(!list){
      return;
    }

    list
      .querySelectorAll(
        '.scf-pdv-consult-row.is-keyboard-active'
      )
      .forEach(
        function(row){
          row.classList.remove(
            'is-keyboard-active'
          );

          row.setAttribute(
            'aria-selected',
            'false'
          );
        }
      );

    if(indiceAtivo < 0){
      return;
    }

    const row =
      list.querySelector(
        '.scf-pdv-consult-row[data-consult-index="' +
        indiceAtivo +
        '"]'
      );

    if(row){
      row.classList.add(
        'is-keyboard-active'
      );

      row.setAttribute(
        'aria-selected',
        'true'
      );
    }
  }

  function renderResultados(){
    const area =
      garantirAreaConsulta();

    if(!area){
      return;
    }

    const list =
      area.list;

    if(!consultaAtiva){
      return;
    }

    aplicarCabecalhoConsultaCompartilhado(
      area.header
    );

    list.replaceChildren();

    filtrarResultados();

    if(aguardandoInclusao){
      const carregando =
        document.createElement(
          'div'
        );

      carregando.className =
        'scf-pdv-consult-empty';

      carregando.textContent =
        'LOCALIZANDO PRODUTO...';

      list.appendChild(
        carregando
      );

      return;
    }

    if(mensagemConsulta){
      const mensagem =
        document.createElement(
          'div'
        );

      mensagem.className =
        'scf-pdv-consult-empty';

      mensagem.textContent =
        mensagemConsulta;

      list.appendChild(
        mensagem
      );

      return;
    }

    if(!estoqueCarregado){
      const carregando =
        document.createElement(
          'div'
        );

      carregando.className =
        'scf-pdv-consult-empty';

      carregando.textContent =
        'CARREGANDO PRODUTOS...';

      list.appendChild(
        carregando
      );

      return;
    }

    if(!resultados.length){
      const vazio =
        document.createElement(
          'div'
        );

      vazio.className =
        'scf-pdv-consult-empty';

      vazio.textContent =
        itensEstoque.length
          ? 'NENHUM PRODUTO ENCONTRADO'
          : 'NENHUM PRODUTO DISPONÍVEL';

      list.appendChild(
        vazio
      );

      return;
    }

    resultados.forEach(
      function(item,index){
        const row =
          document.createElement(
            'div'
          );

        row.className =
          'scf-pdv-consult-row';

        row.classList.toggle(
          'scf-pdv-consult-row-out',
          Boolean(item.semEstoque)
        );

        row.classList.toggle(
          'scf-pdv-consult-row-low',
          Boolean(
            !item.semEstoque &&
            item.estoqueBaixo
          )
        );

        row.dataset.estoqueQuantidade =
          String(
            Number(item.quantidade || 0)
          );

        row.dataset.consultIndex =
          String(index);

        row.setAttribute(
          'role',
          'option'
        );

        row.setAttribute(
          'aria-selected',
          index === indiceAtivo
            ? 'true'
            : 'false'
        );

        if(item.semEstoque){
          row.setAttribute(
            'aria-disabled',
            'true'
          );

          row.title =
            'SEM ESTOQUE — INCLUSÃO NÃO PERMITIDA';
        }else if(item.estoqueBaixo){
          row.title =
            'ESTOQUE BAIXO — RESTAM ' +
            String(item.quantidade) +
            ' UN';
        }

        if(index === indiceAtivo){
          row.classList.add(
            'is-keyboard-active'
          );
        }

        const codigo =
          document.createElement(
            'span'
          );

        codigo.textContent =
          item.codigo || '-';

        codigo.title =
          item.codigo || '';

        const nome =
          document.createElement(
            'span'
          );

        nome.textContent =
          item.nome || '-';

        nome.title =
          item.nome || '';

        const valor =
          document.createElement(
            'span'
          );

        valor.textContent =
          dinheiro(
            item.valorUnitario
          );

        const qtd =
          document.createElement(
            'span'
          );

        const qtdNumero =
          Number(
            item.quantidade || 0
          );

        qtd.textContent =
          new Intl.NumberFormat(
            'pt-BR',
            {
              minimumFractionDigits:0,
              maximumFractionDigits:3
            }
          ).format(
            Number.isFinite(qtdNumero)
              ? qtdNumero
              : 0
          );

        qtd.title =
          'Quantidade em estoque: ' +
          qtd.textContent;

        row.appendChild(
          codigo
        );

        row.appendChild(
          nome
        );

        row.appendChild(
          valor
        );

        row.appendChild(
          qtd
        );

        row.addEventListener(
          'mousedown',
          function(event){
            event.preventDefault();

            indiceAtivo =
              index;

            marcarAtivo();

            try{
              input.focus({
                preventScroll:true
              });
            }catch(error){
              input.focus();
            }
          }
        );

        row.addEventListener(
          'dblclick',
          function(event){
            event.preventDefault();
            event.stopPropagation();

            indiceAtivo =
              index;

            incluirSelecionado();
          }
        );

        list.appendChild(
          row
        );
      }
    );
  }

  function ativarConsulta(){
    if(!pdvNormalDisponivel()){
      return false;
    }

    /* Uma nova pesquisa substitui qualquer produto antes preparado. */
    aguardandoConfirmacaoConsulta =
      false;

    productsDomain.preparedPreview =
      null;

    marcarProdutoPreparado(
      false
    );

    renderizarProdutoPreparadoNaLista();

    garantirAreaConsulta();

    if(!consultaAtiva){
      valorAntesConsulta =
        texto(
          input.value
        );

      input.value =
        '';

      indiceAtivo =
        0;

      mensagemConsulta =
        '';
    }

    consultaAtiva =
      true;

    navigationState.setProductLookupOpen(true);

    document.body.classList.add(
      'scf-pdv-product-consult-open'
    );

    sincronizarCampo();

    solicitarEstoque();
    renderResultados();

    try{
      input.focus({
        preventScroll:true
      });
    }catch(error){
      input.focus();
    }

    input.select();

    return true;
  }

  function sairConsulta(opcoes){
    const settings =
      opcoes || {};

    if(!consultaAtiva){
      sincronizarCampo();
      return;
    }

    const restaurar =
      settings.restaurar !==
        false;

    if(restaurar){
      input.value =
        valorAntesConsulta;
    }

    /*
     * Blur ainda com consultaAtiva=true para o listener de captura
     * bloquear o blur/change antigo ligado à busca fiscal normal.
     */
    try{
      input.blur();
    }catch(error){}

    consultaAtiva =
      false;

    navigationState.setProductLookupOpen(false);

    document.body.classList.remove(
      'scf-pdv-product-consult-open'
    );

    restaurarTabelaCompartilhadaVenda();

    indiceAtivo =
      -1;

    mensagemConsulta =
      '';

    aguardandoInclusao =
      false;

    cancelarIndicadorLocalizandoProduto();

    produtoSelecionadoPendente =
      null;

    sincronizarCampo();
    renderResultados();
  }

  /*
   * Ao sair do PDV para ESTOQUE, VENDAS, CADASTRO, FINANCEIRO ou
   * qualquer outra página, a consulta F4 deve ser encerrada por completo.
   * Quando o operador voltar ao PDV, a busca permanece DESATIVADA e só
   * será aberta novamente com um novo pressionamento de F4.
   */
  function desativarBuscaF4AoTrocarPagina(){
    aguardandoConfirmacaoConsulta =
      false;

    aguardandoInclusao =
      false;

    produtoSelecionadoPendente =
      null;

    mensagemConsulta =
      '';

    valorAntesConsulta =
      '';

    productsDomain.preparedPreview =
      null;

    marcarProdutoPreparado(
      false
    );

    if(consultaAtiva){
      sairConsulta({
        restaurar:false
      });
    }else{
      consultaAtiva =
        false;

      navigationState.setProductLookupOpen(false);

      document.body.classList.remove(
        'scf-pdv-product-consult-open'
      );

      input.value =
        '';

      sincronizarCampo();
      renderResultados();
    }

    input.value =
      '';

    renderizarProdutoPreparadoNaLista();
    sincronizarCampo();
  }

  window.__scfPdvDesativarBuscaF4 =
    desativarBuscaF4AoTrocarPagina;

  /*
   * Camada extra de segurança: a seleção real do menu remove a classe
   * scf-pdv-pagina-selecionada quando o usuário deixa o PDV.
   */
  let pdvEstavaSelecionadoParaF4 =
    document.body.classList.contains(
      'scf-pdv-pagina-selecionada'
    );

  new MutationObserver(
    function(){
      const pdvSelecionadoAgora =
        document.body.classList.contains(
          'scf-pdv-pagina-selecionada'
        );

      if(
        pdvEstavaSelecionadoParaF4 &&
        !pdvSelecionadoAgora
      ){
        desativarBuscaF4AoTrocarPagina();
      }

      pdvEstavaSelecionadoParaF4 =
        pdvSelecionadoAgora;
    }
  ).observe(
    document.body,
    {
      attributes:true,
      attributeFilter:['class']
    }
  );

  function preencherProdutoFiscal(produto,produtoSelecionado){
    if(
      !produto ||
      typeof produto !==
        'object'
    ){
      return false;
    }

    const unidade =
      texto(
        produto.unidade
      ).toUpperCase();

    const idFiscal =
      texto(
        produto.id ??
        produto._id ??
        produto.produtoId
      );

    const nome =
      texto(
        produto.nome ??
        produto.descricao ??
        produtoSelecionado.nome
      );

    const codigoProduto =
      texto(
        produto.codigo ??
        produto.codigoProduto ??
        produto.sku ??
        produtoSelecionado.codigo
      );

    const gtinResposta =
      somenteDigitos(
        produto.gtin ??
        produto.codigoBarras ??
        produto.barcode
      );

    const codigoSelecionado =
      somenteDigitos(
        produtoSelecionado.codigo
      );

    const gtin =
      [8,12,13,14].includes(
        gtinResposta.length
      )
        ? gtinResposta
        : (
          [8,12,13,14].includes(
            codigoSelecionado.length
          )
            ? codigoSelecionado
            : ''
        );

    const codigoInterno =
      gtin
        ? ''
        : (
          pdvCodigoInternoBalancaValido(
            codigoProduto
          )
            ? somenteDigitos(
                codigoProduto
              )
            : (
              pdvCodigoInternoBalancaValido(
                codigoSelecionado
              )
                ? codigoSelecionado
                : ''
            )
        );

    const identificadorProduto =
      gtin ||
      codigoInterno;

    const valorUnitario =
      Number(
        produto.valorUnitario ??
        produto.precoVenda ??
        produto.valorVenda ??
        produtoSelecionado.valorUnitario ??
        0
      ) || 0;

    if(
      !idFiscal ||
      !nome ||
      !unidade ||
      valorUnitario <= 0 ||
      !identificadorProduto
    ){
      return false;
    }

    const quantidadeField =
      document.getElementById(
        'productQuantity'
      );

    const quantidadeAtual =
      Number(
        quantidadeField &&
        quantidadeField.value ||
        0
      );

    const quantidade =
      quantidadeAtual > 0
        ? quantidadeAtual
        : 1;

    const campos = {
      productFiscalId:
        idFiscal,
      productCode:
        codigoInterno ||
        codigoProduto ||
        gtin,
      productGtin:
        gtin,
      productUnit:
        unidade,
      productName:
        nome,
      productBarcode:
        identificadorProduto,
      productQuantity:
        String(quantidade)
    };

    Object.keys(campos)
      .forEach(
        function(id){
          const campo =
            document.getElementById(
              id
            );

          if(campo){
            campo.value =
              campos[id];
          }
        }
      );

    const valorField =
      document.getElementById(
        'productUnitValue'
      );

    if(valorField){
      valorField.value =
        dinheiro(
          valorUnitario
        );
    }

    const ncm =
      somenteDigitos(
        produto.ncm
      ).slice(0,8);

    if(ncm.length === 8){
      const ncmSearch =
        document.getElementById(
          'ncmSearch'
        );

      const ncmCode =
        document.getElementById(
          'ncmCode'
        );

      if(ncmSearch){
        ncmSearch.value =
          ncm;
      }

      if(ncmCode){
        ncmCode.value =
          ncm;
      }
    }

    const cfop =
      somenteDigitos(
        produto.cfop
      ).slice(0,4);

    if(cfop.length === 4){
      const cfopSearch =
        document.getElementById(
          'cfopSearch'
        );

      const cfopCode =
        document.getElementById(
          'cfopCode'
        );

      if(cfopSearch){
        cfopSearch.value =
          cfop;
      }

      if(cfopCode){
        cfopCode.value =
          cfop;
      }
    }

    return true;
  }

  function dispararInclusaoNormal(){
    const confirmarF4 =
      window.__scfPdvConfirmarProdutoSelecionadoF4;

    if(
      typeof confirmarF4 ===
        'function'
    ){
      try{
        return confirmarF4() ===
          true;
      }catch(error){}
    }

    const barcode =
      document.getElementById(
        'productBarcode'
      );

    if(!barcode){
      return false;
    }

    try{
      barcode.dispatchEvent(
        new KeyboardEvent(
          'keydown',
          {
            key:'Enter',
            code:'Enter',
            bubbles:true,
            cancelable:true
          }
        )
      );

      return true;
    }catch(error){
      return false;
    }
  }

  function incluirSelecionado(){
    if(
      !consultaAtiva ||
      aguardandoInclusao ||
      indiceAtivo < 0 ||
      indiceAtivo >=
        resultados.length
    ){
      return false;
    }

    const selecionado =
      resultados[
        indiceAtivo
      ];

    if(
      !selecionado ||
      !selecionado.nome
    ){
      return false;
    }

    /*
     * Produto sem estoque continua visível na consulta F4 para o operador
     * identificar a ruptura, mas não pode seguir para o formulário nem
     * entrar na lista da venda. Vale para ENTER e duplo clique, pois ambos
     * passam por incluirSelecionado().
     */
    if(
      selecionado.semEstoque ||
      Number(
        selecionado.quantidade ||
        0
      ) <= 0
    ){
      mostrarAvisoEstoque(
        'PRODUTO SEM ESTOQUE — INCLUSÃO NÃO PERMITIDA'
      );

      aguardandoInclusao =
        false;

      produtoSelecionadoPendente =
        null;

      cancelarIndicadorLocalizandoProduto();
      marcarAtivo();
      return false;
    }

    /*
     * PRODUTO DE BALANÇA — REGRA OBRIGATÓRIA:
     *
     * Códigos internos 0001..0999 podem aparecer normalmente na consulta F4
     * para identificação do produto, porém NUNCA podem ser adicionados à venda
     * pelo ENTER ou pelo duplo clique do F4.
     *
     * A inclusão desses produtos depende da leitura completa da balança no
     * campo normal do PDV, por exemplo:
     *
     *   0001245 + ENTER
     *
     * onde 0001 identifica o produto e 245 representa R$ 2,45.
     */
    const codigoBalancaSelecionado =
      somenteDigitos(
        selecionado.codigo
      );

    if(
      pdvCodigoInternoBalancaValido(
        codigoBalancaSelecionado
      )
    ){
      mensagemConsulta =
        'PRODUTO DE BALANÇA — USE O CÓDIGO COMPLETO DA BALANÇA NO PDV';

      aguardandoInclusao =
        false;

      produtoSelecionadoPendente =
        null;

      cancelarIndicadorLocalizandoProduto();
      renderResultados();
      marcarAtivo();

      mostrarAvisoEstoque(
        'PRODUTO DE BALANÇA — INCLUSÃO PELO F4 NÃO PERMITIDA'
      );

      return false;
    }

    /*
     * PRIMEIRA OPÇÃO: cache local.
     * Se o estoque já trouxe os dados fiscais completos (ou este produto
     * já foi consultado anteriormente), não existe nova ida ao backend.
     */
    const produtoLocal =
      produtoFiscalLocalSelecionado(
        selecionado
      );

    if(
      produtoLocal &&
      preencherProdutoFiscal(
        produtoLocal,
        selecionado
      )
    ){
      produtoSelecionadoPendente =
        null;

      cancelarIndicadorLocalizandoProduto();

      const produtoPreparado =
        capturarProdutoPreparado();

      if(!produtoPreparado){
        mensagemConsulta =
          'PRODUTO SEM DADOS FISCAIS COMPLETOS PARA INCLUSÃO';

        renderResultados();
        return false;
      }

      productsDomain.preparedPreview =
        null;

      aguardandoConfirmacaoConsulta =
        false;

      sairConsulta({
        restaurar:false
      });

      marcarProdutoPreparado(
        false
      );

      /*
       * Produto comum selecionado pelo F4:
       * usa o fluxo normal de inclusão. Produtos de balança já foram
       * bloqueados antes de chegar a este ponto.
       */
      window.setTimeout(
        function(){
          dispararInclusaoNormal();
        },
        0
      );

      return true;
    }

    /*
     * SEGUNDA OPÇÃO: fallback externo somente quando o cache não possui
     * dados fiscais suficientes para incluir o produto.
     */
    produtoSelecionadoPendente =
      selecionado;

    const codigoDigitos =
      somenteDigitos(
        selecionado.codigo
      );

    const codigoInternoBusca =
      pdvCodigoInternoBalancaValido(
        codigoDigitos
      )
        ? codigoDigitos
        : '';

    const barcodeBusca =
      [8,12,13,14].includes(
        codigoDigitos.length
      )
        ? codigoDigitos
        : '';

    requestProdutoFiscal =
      Date.now();

    aguardandoInclusao =
      true;

    mensagemConsulta =
      '';

    /*
     * Não troca imediatamente a lista por LOCALIZANDO PRODUTO.
     * Se o backend responder em até 250 ms, o operador não vê espera.
     */
    agendarIndicadorLocalizandoProduto();

    try{
      window.__scfPdvInfra.shellBridge.post(
        {
          type:
            'SCF_PRODUTO_FISCAL_VENDA_BUSCAR',

          requestId:
            requestProdutoFiscal,

          criterio:{
            descricao:
              selecionado.nome,

            codigo:
              codigoInternoBusca,

            barcode:
              barcodeBusca
          }
        },
        '*'
      );
    }catch(error){
      aguardandoInclusao =
        false;

      produtoSelecionadoPendente =
        null;

      cancelarIndicadorLocalizandoProduto();

      mensagemConsulta =
        'NÃO FOI POSSÍVEL CONSULTAR O PRODUTO';

      renderResultados();
      return false;
    }

    return true;
  }

  function moverSelecao(direcao){
    if(aguardandoInclusao){
      return;
    }

    if(!resultados.length){
      indiceAtivo =
        -1;

      marcarAtivo();
      return;
    }

    if(indiceAtivo < 0){
      indiceAtivo =
        direcao > 0
          ? 0
          : resultados.length - 1;
    }else{
      indiceAtivo =
        Math.max(
          0,
          Math.min(
            indiceAtivo + direcao,
            resultados.length - 1
          )
        );
    }

    marcarAtivo();
    scrollAtivo();
  }

  function interceptarEventoCampo(event){
    if(
      !consultaAtiva ||
      event.target !==
        input
    ){
      return;
    }

    event.stopImmediatePropagation();

    if(
      event.type === 'input' &&
      !aguardandoInclusao
    ){
      mensagemConsulta =
        '';

      indiceAtivo =
        0;

      renderResultados();
    }
  }

  ['input','change','blur']
    .forEach(
      function(tipo){
        window.addEventListener(
          tipo,
          interceptarEventoCampo,
          true
        );
      }
    );

  function cancelarProdutoPreparadoESair(){
    aguardandoConfirmacaoConsulta =
      false;

    productsDomain.preparedPreview =
      null;

    produtoSelecionadoPendente =
      null;

    aguardandoInclusao =
      false;

    cancelarIndicadorLocalizandoProduto();

    mensagemConsulta =
      '';

    marcarProdutoPreparado(
      false
    );

    try{
      window.__scfPdvInfra.eventBus.dispatch(
        new CustomEvent(
          'scf:pdv-cancelar-produto-preparado-consulta'
        )
      );
    }catch(error){
      input.value =
        '';
    }

    input.value =
      '';

    sincronizarCampo();
    renderResultados();
  }

  window.addEventListener(
    'keydown',
    function(event){
      if(!event){
        return;
      }

      const tecla =
        String(
          event.key ||
          ''
        );

      const codigo =
        String(
          event.code ||
          ''
        );

      if(
        tecla === 'F4' ||
        codigo === 'F4'
      ){
        if(!pdvNormalDisponivel()){
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        if(consultaAtiva){
          /* Lista aberta: F4 fecha a pesquisa atual. */
          sairConsulta({
            restaurar:true
          });

          const codigoBarras =
            document.getElementById(
              'productBarcode'
            );

          if(codigoBarras){
            try{
              codigoBarras.focus({
                preventScroll:true
              });
            }catch(error){
              codigoBarras.focus();
            }
          }
        }else if(
          aguardandoConfirmacaoConsulta
        ){
          /*
           * Produto escolhido pelo primeiro ENTER, mas ainda não incluído:
           * F4 abandona esse PREVIEW e encerra completamente o modo busca.
           * Somente um próximo F4 abrirá uma nova pesquisa.
           */
          cancelarProdutoPreparadoESair();
        }else{
          ativarConsulta();
        }

        return;
      }

      if(
        !consultaAtiva &&
        aguardandoConfirmacaoConsulta &&
        tecla === 'Enter'
      ){
        const quantidade =
          document.getElementById(
            'productQuantity'
          );

        const codigoBarras =
          document.getElementById(
            'productBarcode'
          );

        /*
         * O segundo ENTER só vale no bloco QTD | CÓDIGO DE BARRAS.
         * Assim o operador pode editar a quantidade antes de incluir.
         */
        if(
          event.target === quantidade ||
          event.target === codigoBarras
        ){
          if(!pdvNormalDisponivel()){
            aguardandoConfirmacaoConsulta =
              false;

            return;
          }

          event.preventDefault();
          event.stopImmediatePropagation();

          /*
           * Desarma antes de disparar o ENTER sintético para não
           * interceptar novamente o próprio fluxo normal do PDV.
           */
          const produtoPreparado =
            productsDomain.preparedPreview &&
            typeof productsDomain.preparedPreview === 'object'
              ? productsDomain.preparedPreview
              : null;

          /*
           * Restaura o nome real apenas no instante da confirmação.
           * O fluxo original do código de barras recebe, então, exatamente
           * os mesmos campos completos e faz a inclusão normalmente.
           */
          if(
            produtoPreparado &&
            produtoPreparado.name
          ){
            input.value =
              produtoPreparado.name;
          }

          aguardandoConfirmacaoConsulta =
            false;

          productsDomain.preparedPreview =
            null;

          marcarProdutoPreparado(
            false
          );

          dispararInclusaoNormal();
          return;
        }
      }

      if(!consultaAtiva){
        return;
      }

      if(tecla === 'Escape'){
        event.preventDefault();
        event.stopImmediatePropagation();

        sairConsulta({
          restaurar:true
        });

        return;
      }

      if(tecla === 'ArrowDown'){
        event.preventDefault();
        event.stopImmediatePropagation();

        moverSelecao(
          1
        );

        return;
      }

      if(tecla === 'ArrowUp'){
        event.preventDefault();
        event.stopImmediatePropagation();

        moverSelecao(
          -1
        );

        return;
      }

      if(tecla === 'Enter'){
        event.preventDefault();
        event.stopImmediatePropagation();

        incluirSelecionado();
      }
    },
    true
  );

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

      /*
       * Toda troca/seleção de página zera o estado do F4.
       * Isso vale inclusive ao VOLTAR para o PDV, evitando reabrir uma
       * pesquisa que havia ficado ativa antes de visitar outra página.
       */
      if(
        data.type === 'SCF_FISCAL_HOME_ABRIR' ||
        data.type === 'SCF_HISTORICO_VENDAS_ABRIR' ||
        data.type === 'SCF_MENU_SELECIONAR_PRIMEIRO' ||
        data.type === 'SCF_MENU_SELECIONAR_CENTRAL' ||
        data.type === 'SCF_MENU_SELECIONAR_ESTOQUE' ||
        data.type === 'SCF_MENU_SELECIONAR_CADASTRAR' ||
        data.type === 'SCF_LAYOUT_PRINCIPAL_PAGINA_SOLICITADA'
      ){
        desativarBuscaF4AoTrocarPagina();
        return;
      }

      if(
        data.type ===
          'SCF_ESTOQUE_LISTAR_RESULTADO' ||
        data.type ===
          'SCF_ESTOQUE_ATUALIZADO'
      ){
        const lista =
          data.produtos ||
          data.estoque ||
          data.items ||
          [];

        itensEstoque =
          Array.isArray(lista)
            ? lista
                .map(
                  produtoNormalizado
                )
                .filter(
                  function(item){
                    return Boolean(
                      item.nome ||
                      item.codigo
                    );
                  }
                )
            : [];

        /*
         * Pré-indexa produtos fiscalmente completos por código de barras.
         * Itens incompletos permanecem no F4 e usarão o backend apenas
         * quando forem realmente selecionados.
         */
        itensEstoque.forEach(
          cacheProdutoEstoqueParaPdv
        );

        estoqueCarregado =
          true;

        estoqueSolicitado =
          false;

        mensagemConsulta =
          '';

        if(consultaAtiva){
          indiceAtivo =
            0;

          renderResultados();
        }

        return;
      }

      if(
        Number(data.requestId) !==
          Number(requestProdutoFiscal) ||
        !aguardandoInclusao
      ){
        return;
      }

      if(
        data.type ===
          'SCF_PRODUTO_FISCAL_VENDA_RESULTADO'
      ){
        aguardandoInclusao =
          false;

        cancelarIndicadorLocalizandoProduto();

        if(
          data.found === true &&
          data.produto &&
          produtoSelecionadoPendente
        ){
          const selecionado =
            produtoSelecionadoPendente;

          const cacheFn =
            productsDomain.cacheFiscalProduct;

          if(typeof cacheFn === 'function'){
            cacheFn(
              data.produto,
              {
                id:
                  selecionado.id,
                codigo:
                  selecionado.codigo,
                gtin:
                  selecionado.codigo,
                nome:
                  selecionado.nome,
                valorUnitario:
                  selecionado.valorUnitario
              }
            );
          }

          if(
            preencherProdutoFiscal(
              data.produto,
              selecionado
            )
          ){
            produtoSelecionadoPendente =
              null;

            /*
             * Guarda o produto escolhido FORA de #productName. Assim o
             * campo superior pode voltar imediatamente para F4 | BUSCAR
             * PRODUTO, enquanto a linha permanece visível como PREVIEW.
             */
            const produtoPreparado =
              capturarProdutoPreparado();

            if(!produtoPreparado){
              mensagemConsulta =
                'PRODUTO SEM DADOS FISCAIS COMPLETOS PARA INCLUSÃO';

              renderResultados();
              return;
            }

            /*
             * F4 — FLUXO DE CAIXA:
             * o ENTER que escolhe o resultado já é a confirmação da inclusão.
             * Mantemos a validação fiscal no backend; assim que ela retorna
             * com os dados completos, fechamos a busca e usamos exatamente o
             * mesmo fluxo normal do código de barras para adicionar o item.
             */
            productsDomain.preparedPreview =
              null;

            aguardandoConfirmacaoConsulta =
              false;

            sairConsulta({
              restaurar:false
            });

            marcarProdutoPreparado(
              false
            );

            /*
             * O produto já está preenchido por preencherProdutoFiscal().
             * O ENTER sintético cai no fluxo normal e inclui imediatamente.
             */
            window.setTimeout(
              function(){
                dispararInclusaoNormal();
              },
              0
            );

            return;
          }

          produtoSelecionadoPendente =
            null;

          mensagemConsulta =
            'PRODUTO SEM DADOS FISCAIS COMPLETOS PARA INCLUSÃO';

          renderResultados();
          return;
        }

        produtoSelecionadoPendente =
          null;

        mensagemConsulta =
          texto(
            data.message
          ) ||
          'PRODUTO NÃO CADASTRADO OU INATIVO';

        renderResultados();
        return;
      }

      if(
        data.type ===
          'SCF_PRODUTO_FISCAL_VENDA_ERRO'
      ){
        aguardandoInclusao =
          false;

        cancelarIndicadorLocalizandoProduto();

        produtoSelecionadoPendente =
          null;

        mensagemConsulta =
          texto(
            data.message
          ) ||
          'NÃO FOI POSSÍVEL CONSULTAR O PRODUTO';

        renderResultados();
      }
    }
  );

  window.__scfPdvInfra.eventBus.on('scf:nova-venda-pronta',
    function(){
      aguardandoConfirmacaoConsulta =
        false;

      productsDomain.preparedPreview =
        null;

      marcarProdutoPreparado(
        false
      );

      if(consultaAtiva){
        sairConsulta({
          restaurar:false
        });
      }

      input.value =
        '';

      sincronizarCampo();
    }
  );

  function preparar(){
    garantirAreaConsulta();
    sincronizarCampo();

    /*
     * Pré-carga do catálogo no PDV. Quando o operador pressionar F4
     * ou ler um código, a lista/cache normalmente já estará em memória.
     */
    if(
      desktopMq.matches &&
      !estoqueCarregado
    ){
      solicitarEstoque();
    }
  }

  preparar();

  window.setTimeout(
    preparar,
    0
  );

  window.setTimeout(
    preparar,
    120
  );

  window.setTimeout(
    preparar,
    500
  );

  window.setTimeout(
    function(){
      if(
        desktopMq.matches &&
        !estoqueCarregado
      ){
        estoqueSolicitado =
          false;

        solicitarEstoque();
      }
    },
    900
  );

  if(
    typeof desktopMq.addEventListener ===
      'function'
  ){
    desktopMq.addEventListener(
      'change',
      function(){
        if(
          !desktopMq.matches &&
          consultaAtiva
        ){
          sairConsulta({
            restaurar:true
          });
        }

        preparar();
      }
    );
  }else if(
    typeof desktopMq.addListener ===
      'function'
  ){
    desktopMq.addListener(
      function(){
        if(
          !desktopMq.matches &&
          consultaAtiva
        ){
          sairConsulta({
            restaurar:true
          });
        }

        preparar();
      }
    );
  }
})();
