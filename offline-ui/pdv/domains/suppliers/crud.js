(function(){
  'use strict';

  const supplierDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.suppliers;

  if(!supplierDomain){
    throw new Error(
      'PDV suppliers domain indisponivel.'
    );
  }

  const customerDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.customer;

  if(!customerDomain){
    throw new Error(
      'PDV customer domain indisponivel.'
    );
  }

  let requestLista = 0;
  let requestAcao = 0;
  let carregandoLista = false;
  let acaoEmAndamento = false;
  let estadoOriginal = '';


  function modoFornecedor(){
    const overlay =
      document.getElementById(
        'scfCustomerRegistrationOverlay'
      );

    return (
      document.body.classList.contains(
        'scf-supplier-registration-open'
      ) ||
      String(
        overlay && overlay.dataset
          ? overlay.dataset.cadastroTipo || ''
          : ''
      ).toUpperCase() === 'FORNECEDOR'
    );
  }


  function texto(valor){
    return String(
      valor == null ? '' : valor
    ).trim();
  }


  function normalizarTexto(valor){
    return texto(valor)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
  }


  function digitos(valor){
    return texto(valor)
      .replace(/\D/g, '');
  }


  function valor(id){
    const campo =
      document.getElementById(id);

    return campo
      ? texto(campo.value)
      : '';
  }


  function tipoPessoaFormulario(){
    const juridica =
      document.getElementById(
        'scfCustomerPersonJuridica'
      );

    return juridica && juridica.checked
      ? 'JURIDICA'
      : 'FISICA';
  }


  function tipoPessoaLista(){
    const juridica =
      document.getElementById(
        'scfCustomerRegistrationPersonJuridica'
      );

    return juridica && juridica.checked
      ? 'JURIDICA'
      : 'FISICA';
  }


  function tipoPessoaFornecedor(fornecedor){
    const tipo =
      normalizarTexto(
        fornecedor && fornecedor.tipoPessoa
      ).replace(/[^A-Z]/g, '');

    if(
      tipo === 'JURIDICA' ||
      tipo === 'PESSOAJURIDICA' ||
      tipo === 'PJ' ||
      digitos(
        fornecedor && fornecedor.cnpj
      )
    ){
      return 'JURIDICA';
    }

    return 'FISICA';
  }


  function formatarCpf(valorRecebido){
    const cpf =
      digitos(valorRecebido)
        .slice(0, 11);

    return cpf.length === 11
      ? cpf.replace(
          /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
          '$1.$2.$3-$4'
        )
      : cpf;
  }


  function formatarCnpj(valorRecebido){
    const cnpj =
      digitos(valorRecebido)
        .slice(0, 14);

    return cnpj.length === 14
      ? cnpj.replace(
          /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
          '$1.$2.$3/$4-$5'
        )
      : cnpj;
  }


  function formatarCep(valorRecebido){
    const cep =
      digitos(valorRecebido)
        .slice(0, 8);

    return cep.length === 8
      ? cep.replace(
          /^(\d{5})(\d{3})$/,
          '$1-$2'
        )
      : cep;
  }


  function formatarWhatsapp(valorRecebido){
    let numero =
      digitos(valorRecebido);

    if(
      numero.startsWith('55') &&
      (
        numero.length === 12 ||
        numero.length === 13
      )
    ){
      numero =
        numero.slice(2);
    }

    if(numero.length === 11){
      return numero.replace(
        /^(\d{2})(\d{5})(\d{4})$/,
        '($1) $2-$3'
      );
    }

    if(numero.length === 10){
      return numero.replace(
        /^(\d{2})(\d{4})(\d{4})$/,
        '($1) $2-$3'
      );
    }

    return texto(valorRecebido);
  }


  function campo(id, valorRecebido, disparar){
    const elemento =
      document.getElementById(id);

    if(!elemento){
      return;
    }

    elemento.value =
      texto(valorRecebido);

    if(disparar === true){
      elemento.dispatchEvent(
        new Event(
          'input',
          {
            bubbles:true
          }
        )
      );
    }
  }


  function botaoCadastro(){
    return document.getElementById(
      'scfCustomerRegisterButton'
    );
  }


  function definirBotaoNovo(){
    const botao =
      botaoCadastro();

    if(!botao){
      return;
    }

    botao.classList.remove(
      'scf-customer-danger-action'
    );

    botao.textContent =
      'CADASTRAR';

    botao.disabled =
      false;

    delete botao.dataset.scfFornecedorAcao;
    delete botao.dataset.scfClienteAcao;
  }


  function definirBotaoExcluir(){
    const botao =
      botaoCadastro();

    if(!botao){
      return;
    }

    botao.classList.add(
      'scf-customer-danger-action'
    );

    botao.textContent =
      'EXCLUIR';

    botao.disabled =
      false;

    botao.dataset.scfFornecedorAcao =
      'EXCLUIR';

    delete botao.dataset.scfClienteAcao;
  }


  function definirBotaoAtualizar(){
    const botao =
      botaoCadastro();

    if(!botao){
      return;
    }

    botao.classList.add(
      'scf-customer-danger-action'
    );

    botao.textContent =
      'ATUALIZAR';

    botao.disabled =
      false;

    botao.dataset.scfFornecedorAcao =
      'ATUALIZAR';

    delete botao.dataset.scfClienteAcao;
  }


  function tituloFormulario(textoTitulo){
    const titulo =
      document.getElementById(
        'scfCustomerNewClientTitle'
      );

    if(titulo){
      titulo.textContent =
        textoTitulo;
    }
  }


  function limparCamposFornecedor(){
    [
      'scfCustomerFullName',
      'scfCustomerCpf',
      'scfCustomerStateRegistration',
      'scfCustomerIeIndicator',
      'scfCustomerCep',
      'scfCustomerAddress',
      'scfCustomerNumber',
      'scfCustomerComplement',
      'scfCustomerNeighborhood',
      'scfCustomerCity',
      'scfCustomerUf',
      'scfCustomerMunicipalityCode',
      'scfCustomerEmail',
      'scfCustomerWhatsapp'
    ].forEach(function(id){
      const elemento =
        document.getElementById(id);

      if(elemento){
        elemento.value = '';
      }
    });

    const fisica =
      document.getElementById(
        'scfCustomerPersonFisica'
      );

    const juridica =
      document.getElementById(
        'scfCustomerPersonJuridica'
      );

    if(fisica){
      fisica.checked = true;
    }

    if(juridica){
      juridica.checked = false;
    }

    if(fisica){
      fisica.dispatchEvent(
        new Event(
          'change',
          {
            bubbles:true
          }
        )
      );
    }

    supplierDomain.editingId = '';
    estadoOriginal = '';
    supplierDomain.editingId = '';
    customerDomain.editingId = '';
    window.__scfIndicadorIeSintegrapiConfirmado = false;

    tituloFormulario(
      'CADASTRAR NOVO FORNECEDOR'
    );

    definirBotaoNovo();
  }


  function estadoFormulario(){
    return JSON.stringify({
      tipoPessoa:
        tipoPessoaFormulario(),
      nome:
        valor('scfCustomerFullName'),
      documento:
        valor('scfCustomerCpf'),
      ie:
        valor('scfCustomerStateRegistration'),
      indicadorIe:
        valor('scfCustomerIeIndicator'),
      cep:
        valor('scfCustomerCep'),
      endereco:
        valor('scfCustomerAddress'),
      numero:
        valor('scfCustomerNumber'),
      complemento:
        valor('scfCustomerComplement'),
      bairro:
        valor('scfCustomerNeighborhood'),
      cidade:
        valor('scfCustomerCity'),
      uf:
        valor('scfCustomerUf'),
      codigoMunicipio:
        valor('scfCustomerMunicipalityCode'),
      email:
        valor('scfCustomerEmail'),
      whatsapp:
        valor('scfCustomerWhatsapp')
    });
  }


  function atualizarEstadoEdicao(){
    if(
      !modoFornecedor() ||
      !supplierDomain.editingId ||
      acaoEmAndamento
    ){
      return;
    }

    if(
      estadoFormulario() ===
        estadoOriginal
    ){
      definirBotaoExcluir();
    }else{
      definirBotaoAtualizar();
    }
  }


  function montarFornecedorFormulario(){
    const tipoPessoa =
      tipoPessoaFormulario();

    const nomeOuRazao =
      valor(
        'scfCustomerFullName'
      );

    const documento =
      valor(
        'scfCustomerCpf'
      );

    return {
      fornecedorId:
        texto(
          supplierDomain.editingId
        ),

      tipoPessoa,

      nomeCompleto:
        tipoPessoa === 'FISICA'
          ? nomeOuRazao
          : '',

      razaoSocial:
        tipoPessoa === 'JURIDICA'
          ? nomeOuRazao
          : '',

      cpf:
        tipoPessoa === 'FISICA'
          ? documento
          : '',

      cnpj:
        tipoPessoa === 'JURIDICA'
          ? documento
          : '',

      inscricaoEstadual:
        tipoPessoa === 'JURIDICA'
          ? valor(
              'scfCustomerStateRegistration'
            )
          : '',

      indicadorIe:
        tipoPessoa === 'FISICA'
          ? '9'
          : valor(
              'scfCustomerIeIndicator'
            ),

      indicadorIeConfirmadoSintegrapi:
        tipoPessoa === 'JURIDICA' &&
        window.__scfIndicadorIeSintegrapiConfirmado ===
          true,

      ieConsultaRealizadaSintegrapi:
        tipoPessoa === 'JURIDICA' &&
        window.__scfUltimaConsultaCnpjSintegrapi
          ?.ieConsultaRealizada ===
          true,

      ieEncontradaSintegrapi:
        tipoPessoa === 'JURIDICA' &&
        window.__scfUltimaConsultaCnpjSintegrapi
          ?.ieEncontrada ===
          true,

      ieAtivaSintegrapi:
        tipoPessoa === 'JURIDICA' &&
        window.__scfUltimaConsultaCnpjSintegrapi
          ?.ieAtiva ===
          true,

      ieRevisaoObrigatoriaSintegrapi:
        tipoPessoa === 'JURIDICA' &&
        window.__scfUltimaConsultaCnpjSintegrapi
          ?.ieRevisaoObrigatoria ===
          true,

      situacaoIeSintegrapi:
        tipoPessoa === 'JURIDICA'
          ? texto(
              window.__scfUltimaConsultaCnpjSintegrapi
                ?.situacaoIe
            )
          : '',

      tipoIeSintegrapi:
        tipoPessoa === 'JURIDICA'
          ? texto(
              window.__scfUltimaConsultaCnpjSintegrapi
                ?.tipoIe
            )
          : '',

      cep:
        valor('scfCustomerCep'),
      endereco:
        valor('scfCustomerAddress'),
      numero:
        valor('scfCustomerNumber'),
      complemento:
        valor('scfCustomerComplement'),
      bairro:
        valor('scfCustomerNeighborhood'),
      cidade:
        valor('scfCustomerCity'),
      uf:
        valor('scfCustomerUf'),
      codigoMunicipio:
        valor('scfCustomerMunicipalityCode'),
      email:
        valor('scfCustomerEmail'),
      whatsapp:
        valor('scfCustomerWhatsapp')
    };
  }


  function validarFornecedor(fornecedor){
    if(
      fornecedor.tipoPessoa === 'FISICA'
    ){
      if(!fornecedor.nomeCompleto){
        return 'Informe o nome completo do fornecedor.';
      }

      if(
        digitos(
          fornecedor.cpf
        ).length !== 11
      ){
        return 'Informe o CPF completo.';
      }
    }else{
      if(!fornecedor.razaoSocial){
        return 'Informe a razão social.';
      }

      if(
        digitos(
          fornecedor.cnpj
        ).length !== 14
      ){
        return 'Informe o CNPJ completo.';
      }

      if(
        !['1','2','9'].includes(
          texto(
            fornecedor.indicadorIe
          )
        )
      ){
        return 'Selecione a situação da IE.';
      }

      if(
        texto(
          fornecedor.indicadorIe
        ) === '1' &&
        !fornecedor.inscricaoEstadual
      ){
        return 'Informe a Inscrição Estadual do fornecedor contribuinte.';
      }
    }

    if(!fornecedor.endereco){
      return 'Informe o logradouro.';
    }

    if(!fornecedor.numero){
      return 'Informe o número do endereço ou S/N.';
    }

    if(!fornecedor.bairro){
      return 'Informe o bairro.';
    }

    if(!fornecedor.cidade){
      return 'Informe a cidade.';
    }

    if(
      texto(fornecedor.uf)
        .replace(/[^A-Za-z]/g, '')
        .length !== 2
    ){
      return 'Informe a UF com 2 letras.';
    }

    return '';
  }


  function listaElemento(){
    return document.getElementById(
      'scfCustomerRegistrationList'
    );
  }


  function limparLista(){
    const lista =
      listaElemento();

    if(lista){
      lista.innerHTML = '';
    }

    return lista;
  }


  function mostrarStatus(textoStatus){
    if(!modoFornecedor()){
      return;
    }

    const lista =
      limparLista();

    if(!lista){
      return;
    }

    const status =
      document.createElement('div');

    status.className =
      'scf-customer-registration-list-status';

    status.textContent =
      texto(textoStatus);

    lista.appendChild(status);
  }


  function criarLinhaFornecedor(fornecedor){
    const linha =
      document.createElement('div');

    linha.className =
      'scf-customer-registration-row';

    const fornecedorId =
      texto(
        fornecedor.fornecedorId ||
        fornecedor._id
      );

    if(fornecedorId){
      linha.dataset.scfFornecedorId =
        fornecedorId;
    }

    const tipo =
      tipoPessoaFornecedor(
        fornecedor
      );

    linha.dataset.scfTipoPessoa =
      tipo;

    try{
      linha.dataset.scfFornecedorJson =
        JSON.stringify(fornecedor);
    }catch(erro){}

    const documento =
      tipo === 'JURIDICA'
        ? texto(
            fornecedor.cnpjFormatado ||
            fornecedor.documento ||
            formatarCnpj(
              fornecedor.cnpj
            )
          )
        : texto(
            fornecedor.cpfFormatado ||
            fornecedor.documento ||
            formatarCpf(
              fornecedor.cpf
            )
          );

    const nome =
      tipo === 'JURIDICA'
        ? texto(
            fornecedor.razaoSocial ||
            fornecedor.nome
          )
        : texto(
            fornecedor.nomeCompleto ||
            fornecedor.nome
          );

    const email =
      texto(
        fornecedor.email
      );

    const whatsapp =
      formatarWhatsapp(
        fornecedor.whatsappFormatado ||
        fornecedor.whatsapp
      );

    [
      documento,
      nome,
      email,
      whatsapp
    ].forEach(function(valorCelula){
      const celula =
        document.createElement('div');

      celula.textContent =
        texto(valorCelula).toUpperCase();

      linha.appendChild(
        celula
      );
    });

    return linha;
  }


  function renderizarFornecedores(){
    if(!modoFornecedor()){
      return;
    }

    const lista =
      limparLista();

    if(!lista){
      return;
    }

    const tipo =
      tipoPessoaLista();

    const busca =
      document.getElementById(
        'scfCustomerRegistrationSearch'
      );

    const termo =
      normalizarTexto(
        busca ? busca.value : ''
      );

    const filtrados =
      supplierDomain.suppliers.filter(function(fornecedor){
        if(
          tipoPessoaFornecedor(
            fornecedor
          ) !== tipo
        ){
          return false;
        }

        if(!termo){
          return true;
        }

        return normalizarTexto([
          fornecedor.nomeCompleto,
          fornecedor.razaoSocial,
          fornecedor.nome,
          fornecedor.cpf,
          fornecedor.cnpj,
          fornecedor.documento,
          fornecedor.email,
          fornecedor.whatsapp,
          fornecedor.inscricaoEstadual,
          fornecedor.cidade,
          fornecedor.uf
        ].join(' ')).includes(
          termo
        );
      });

    if(!filtrados.length){
      mostrarStatus(
        termo
          ? 'NENHUM FORNECEDOR ENCONTRADO'
          : (
              tipo === 'JURIDICA'
                ? 'NENHUM FORNECEDOR PESSOA JURÍDICA CADASTRADO'
                : 'NENHUM FORNECEDOR PESSOA FÍSICA CADASTRADO'
            )
      );
      return;
    }

    filtrados.forEach(function(fornecedor){
      lista.appendChild(
        criarLinhaFornecedor(
          fornecedor
        )
      );
    });
  }


  function solicitarFornecedores(){
    if(
      !modoFornecedor() ||
      carregandoLista
    ){
      return;
    }

    carregandoLista =
      true;

    requestLista +=
      1;

    mostrarStatus(
      'CARREGANDO FORNECEDORES...'
    );

    window.__scfPdvInfra.shellBridge.post(
      {
        type:
          'SCF_FORNECEDORES_LISTAR',

        requestId:
          requestLista
      },
      '*'
    );
  }


  function preencherFornecedor(fornecedor){
    if(
      !fornecedor ||
      typeof fornecedor !== 'object'
    ){
      return;
    }

    const tipo =
      tipoPessoaFornecedor(
        fornecedor
      );

    const fisica =
      document.getElementById(
        'scfCustomerPersonFisica'
      );

    const juridica =
      document.getElementById(
        'scfCustomerPersonJuridica'
      );

    if(fisica && juridica){
      fisica.checked =
        tipo === 'FISICA';

      juridica.checked =
        tipo === 'JURIDICA';

      (
        tipo === 'JURIDICA'
          ? juridica
          : fisica
      ).dispatchEvent(
        new Event(
          'change',
          {
            bubbles:true
          }
        )
      );
    }

    supplierDomain.editingId =
      texto(
        fornecedor.fornecedorId ||
        fornecedor._id
      );

    supplierDomain.editingId =
      supplierDomain.editingId;

    customerDomain.editingId = '';

    campo(
      'scfCustomerFullName',
      tipo === 'JURIDICA'
        ? (
            fornecedor.razaoSocial ||
            fornecedor.nome
          )
        : (
            fornecedor.nomeCompleto ||
            fornecedor.nome
          ),
      false
    );

    campo(
      'scfCustomerCpf',
      tipo === 'JURIDICA'
        ? (
            fornecedor.cnpjFormatado ||
            formatarCnpj(
              fornecedor.cnpj
            )
          )
        : (
            fornecedor.cpfFormatado ||
            formatarCpf(
              fornecedor.cpf
            )
          ),
      false
    );

    campo(
      'scfCustomerStateRegistration',
      tipo === 'JURIDICA'
        ? fornecedor.inscricaoEstadual
        : '',
      false
    );

    campo(
      'scfCustomerIeIndicator',
      tipo === 'JURIDICA'
        ? (
            fornecedor.indicadorIe ||
            fornecedor.indIEDest ||
            (
              fornecedor.inscricaoEstadual
                ? '1'
                : '9'
            )
          )
        : '9',
      false
    );

    campo(
      'scfCustomerCep',
      formatarCep(
        fornecedor.cep
      ),
      false
    );

    campo(
      'scfCustomerAddress',
      fornecedor.endereco,
      false
    );

    campo(
      'scfCustomerNumber',
      fornecedor.numero,
      false
    );

    campo(
      'scfCustomerComplement',
      fornecedor.complemento,
      false
    );

    campo(
      'scfCustomerNeighborhood',
      fornecedor.bairro,
      false
    );

    campo(
      'scfCustomerCity',
      fornecedor.cidade,
      false
    );

    campo(
      'scfCustomerUf',
      fornecedor.uf,
      false
    );

    campo(
      'scfCustomerMunicipalityCode',
      fornecedor.codigoMunicipio,
      false
    );

    campo(
      'scfCustomerEmail',
      fornecedor.email,
      false
    );

    campo(
      'scfCustomerWhatsapp',
      formatarWhatsapp(
        fornecedor.whatsappFormatado ||
        fornecedor.whatsapp
      ),
      false
    );

    window.__scfIndicadorIeSintegrapiConfirmado =
      fornecedor.indicadorIeConfirmadoSintegrapi ===
        true;

    window.__scfUltimaConsultaCnpjSintegrapi = {
      ieConsultaRealizada:
        fornecedor.ieConsultaRealizadaSintegrapi === true,
      ieEncontrada:
        fornecedor.ieEncontradaSintegrapi === true,
      ieAtiva:
        fornecedor.ieAtivaSintegrapi === true,
      ieRevisaoObrigatoria:
        fornecedor.ieRevisaoObrigatoriaSintegrapi === true,
      situacaoIe:
        texto(fornecedor.situacaoIeSintegrapi),
      tipoIe:
        texto(fornecedor.tipoIeSintegrapi)
    };

    tituloFormulario(
      'EDITAR FORNECEDOR'
    );

    estadoOriginal =
      estadoFormulario();

    definirBotaoExcluir();

    document
      .querySelectorAll(
        '#scfCustomerRegistrationList .scf-customer-registration-row'
      )
      .forEach(function(linha){
        linha.classList.toggle(
          'is-selected',
          texto(
            linha.dataset.scfFornecedorId
          ) === supplierDomain.editingId
        );
      });
  }


  window.__scfPdvInfra.eventBus.on('scf:cadastrar-opcao',
    function(event){
      const opcao =
        normalizarTexto(
          event && event.detail
            ? event.detail.opcao
            : ''
        );

      if(opcao === 'FORNECEDOR'){
        acaoEmAndamento = false;
        carregandoLista = false;
        supplierDomain.suppliers = [];
        limparCamposFornecedor();

        window.setTimeout(
          function(){
            tituloFormulario(
              'CADASTRAR NOVO FORNECEDOR'
            );
            solicitarFornecedores();
          },
          0
        );
        return;
      }

      if(opcao === 'CLIENTE'){
        supplierDomain.editingId = '';
        estadoOriginal = '';
        supplierDomain.editingId = '';
        supplierDomain.suppliers = [];
        carregandoLista = false;
        acaoEmAndamento = false;

        const botao =
          botaoCadastro();

        if(botao){
          delete botao.dataset.scfFornecedorAcao;
        }
      }
    }
  );


  document.addEventListener(
    'change',
    function(event){
      if(!modoFornecedor()){
        return;
      }

      const alvo =
        event.target;

      if(
        alvo &&
        (
          alvo.id === 'scfCustomerRegistrationPersonFisica' ||
          alvo.id === 'scfCustomerRegistrationPersonJuridica'
        )
      ){
        window.setTimeout(
          renderizarFornecedores,
          0
        );
        return;
      }

      if(
        alvo &&
        alvo.closest &&
        alvo.closest(
          '#scfCustomerNewClientForm'
        )
      ){
        window.setTimeout(
          atualizarEstadoEdicao,
          0
        );
      }
    }
  );


  document.addEventListener(
    'input',
    function(event){
      if(!modoFornecedor()){
        return;
      }

      const alvo =
        event.target;

      if(
        alvo &&
        alvo.id === 'scfCustomerRegistrationSearch'
      ){
        window.setTimeout(
          renderizarFornecedores,
          0
        );
        return;
      }

      if(
        alvo &&
        alvo.closest &&
        alvo.closest(
          '#scfCustomerNewClientForm'
        )
      ){
        window.setTimeout(
          atualizarEstadoEdicao,
          0
        );
      }
    }
  );


  document.addEventListener(
    'click',
    function(event){
      if(!modoFornecedor()){
        return;
      }

      const linha =
        event.target &&
        event.target.closest
          ? event.target.closest(
              '#scfCustomerRegistrationList .scf-customer-registration-row[data-scf-fornecedor-id]'
            )
          : null;

      if(!linha){
        return;
      }

      const dados =
        linha.dataset.scfFornecedorJson;

      if(!dados){
        return;
      }

      try{
        preencherFornecedor(
          JSON.parse(dados)
        );
      }catch(erro){}
    }
  );


  document.addEventListener(
    'click',
    function(event){
      if(!modoFornecedor()){
        return;
      }

      const botao =
        event.target &&
        event.target.closest
          ? event.target.closest(
              '#scfCustomerRegisterButton'
            )
          : null;

      if(!botao){
        return;
      }

      event.preventDefault();

      if(acaoEmAndamento){
        return;
      }

      if(
        botao.dataset.scfFornecedorAcao ===
          'EXCLUIR' &&
        supplierDomain.editingId
      ){
        acaoEmAndamento = true;
        requestAcao += 1;
        botao.textContent = 'EXCLUINDO...';
        botao.disabled = true;

        window.__scfPdvInfra.shellBridge.post(
          {
            type:
              'SCF_FORNECEDOR_EXCLUIR',
            requestId:
              requestAcao,
            fornecedorId:
              supplierDomain.editingId
          },
          '*'
        );
        return;
      }

      const fornecedor =
        montarFornecedorFormulario();

      const erroLocal =
        validarFornecedor(
          fornecedor
        );

      if(erroLocal){
        window.alert(
          erroLocal
        );
        return;
      }

      acaoEmAndamento = true;
      requestAcao += 1;
      botao.textContent = 'SALVANDO...';
      botao.disabled = true;

      window.__scfPdvInfra.shellBridge.post(
        {
          type:
            'SCF_FORNECEDOR_CADASTRAR',
          requestId:
            requestAcao,
          fornecedor
        },
        '*'
      );
    }
  );


  window.__scfPdvInfra.shellBridge.onMessage(
    function(event){
      const mensagem =
        event &&
        event.data &&
        typeof event.data === 'object'
          ? event.data
          : null;

      if(!mensagem){
        return;
      }

      if(
        mensagem.type ===
          'SCF_FORNECEDORES_LISTA_RESULTADO'
      ){
        carregandoLista = false;

        if(
          mensagem.requestId !== undefined &&
          mensagem.requestId !== null &&
          Number(mensagem.requestId) !==
            Number(requestLista)
        ){
          return;
        }

        supplierDomain.suppliers =
          Array.isArray(
            mensagem.fornecedores
          )
            ? mensagem.fornecedores
            : [];

        renderizarFornecedores();
        return;
      }

      if(
        mensagem.type ===
          'SCF_FORNECEDORES_LISTA_ERRO'
      ){
        carregandoLista = false;

        mostrarStatus(
          mensagem.message ||
          mensagem.mensagem ||
          'NÃO FOI POSSÍVEL CARREGAR OS FORNECEDORES'
        );
        return;
      }

      if(
        mensagem.type ===
          'SCF_FORNECEDOR_CADASTRADO'
      ){
        if(
          mensagem.requestId !== undefined &&
          mensagem.requestId !== null &&
          Number(mensagem.requestId) !==
            Number(requestAcao)
        ){
          return;
        }

        acaoEmAndamento = false;
        carregandoLista = false;
        limparCamposFornecedor();

        const botao =
          botaoCadastro();

        if(botao){
          botao.textContent = 'CADASTRADO';
          botao.disabled = true;
        }

        window.setTimeout(
          function(){
            if(!modoFornecedor()){
              return;
            }

            definirBotaoNovo();
            solicitarFornecedores();
          },
          500
        );
        return;
      }

      if(
        mensagem.type ===
          'SCF_FORNECEDOR_CADASTRO_ERRO'
      ){
        if(
          mensagem.requestId !== undefined &&
          mensagem.requestId !== null &&
          Number(mensagem.requestId) !==
            Number(requestAcao)
        ){
          return;
        }

        acaoEmAndamento = false;

        if(supplierDomain.editingId){
          atualizarEstadoEdicao();
        }else{
          definirBotaoNovo();
        }

        window.alert(
          mensagem.message ||
          mensagem.mensagem ||
          'Não foi possível cadastrar o fornecedor.'
        );
        return;
      }

      if(
        mensagem.type ===
          'SCF_FORNECEDOR_EXCLUIDO'
      ){
        if(
          mensagem.requestId !== undefined &&
          mensagem.requestId !== null &&
          Number(mensagem.requestId) !==
            Number(requestAcao)
        ){
          return;
        }

        acaoEmAndamento = false;
        carregandoLista = false;
        limparCamposFornecedor();

        window.setTimeout(
          solicitarFornecedores,
          100
        );
        return;
      }

      if(
        mensagem.type ===
          'SCF_FORNECEDOR_EXCLUSAO_ERRO'
      ){
        if(
          mensagem.requestId !== undefined &&
          mensagem.requestId !== null &&
          Number(mensagem.requestId) !==
            Number(requestAcao)
        ){
          return;
        }

        acaoEmAndamento = false;
        definirBotaoExcluir();

        window.alert(
          mensagem.message ||
          mensagem.mensagem ||
          'Não foi possível excluir o fornecedor.'
        );
      }
    }
  );
})();
