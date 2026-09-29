(function(){
  'use strict';

  const customerDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.customer;

  if(!customerDomain){
    throw new Error(
      'PDV customer domain indisponivel.'
    );
  }

  let cadastroClienteEmAndamento =
    false;

  let cadastroClienteRequestId =
    0;

  let ultimoClienteEnviado =
    null;


  function valor(id){
    const elemento =
      document.getElementById(id);

    return elemento
      ? String(elemento.value || '').trim()
      : '';
  }


  function somenteNumeros(valorRecebido){
    return String(valorRecebido || '')
      .replace(/\D/g, '');
  }


  function tipoPessoaSelecionado(){
    const juridica =
      document.getElementById(
        'scfCustomerPersonJuridica'
      );

    return juridica && juridica.checked
      ? 'JURIDICA'
      : 'FISICA';
  }


  function montarClienteFormulario(){
    const tipoPessoa =
      tipoPessoaSelecionado();

    const nomeOuRazao =
      valor(
        'scfCustomerFullName'
      );

    const documento =
      valor(
        'scfCustomerCpf'
      );

    return {
      clienteId:
        String(
          customerDomain.editingId ||
          ''
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
          ? String(
              window.__scfUltimaConsultaCnpjSintegrapi
                ?.situacaoIe ||
              ''
            )
          : '',

      tipoIeSintegrapi:
        tipoPessoa === 'JURIDICA'
          ? String(
              window.__scfUltimaConsultaCnpjSintegrapi
                ?.tipoIe ||
              ''
            )
          : '',

      cep:
        valor(
          'scfCustomerCep'
        ),

      endereco:
        valor(
          'scfCustomerAddress'
        ),

      numero:
        valor(
          'scfCustomerNumber'
        ),

      complemento:
        valor(
          'scfCustomerComplement'
        ),

      bairro:
        valor(
          'scfCustomerNeighborhood'
        ),

      cidade:
        valor(
          'scfCustomerCity'
        ),

      uf:
        valor(
          'scfCustomerUf'
        ),

      codigoMunicipio:
        valor(
          'scfCustomerMunicipalityCode'
        ),

      email:
        valor(
          'scfCustomerEmail'
        ),

      whatsapp:
        valor(
          'scfCustomerWhatsapp'
        )
    };
  }


  function validarFormularioLocal(cliente){
    if(
      cliente.tipoPessoa === 'FISICA'
    ){
      if(!cliente.nomeCompleto){
        return 'Informe o nome completo do cliente.';
      }

      if(
        somenteNumeros(
          cliente.cpf
        ).length !== 11
      ){
        return 'Informe o CPF completo.';
      }
    }else{
      if(!cliente.razaoSocial){
        return 'Informe a razão social.';
      }

      if(
        somenteNumeros(
          cliente.cnpj
        ).length !== 14
      ){
        return 'Informe o CNPJ completo.';
      }

      if(
        !['1','2','9'].includes(
          String(cliente.indicadorIe || '')
        )
      ){
        return 'Selecione a situação da IE.';
      }

      if(
        String(cliente.indicadorIe) === '1' &&
        !cliente.inscricaoEstadual
      ){
        return 'Informe a Inscrição Estadual do contribuinte.';
      }
    }

    if(!cliente.endereco){
      return 'Informe o logradouro.';
    }

    if(!cliente.numero){
      return 'Informe o número do endereço ou S/N.';
    }

    if(!cliente.bairro){
      return 'Informe o bairro.';
    }

    if(!cliente.cidade){
      return 'Informe a cidade.';
    }

    if(
      String(cliente.uf || '')
        .replace(/[^A-Za-z]/g, '')
        .length !== 2
    ){
      return 'Informe a UF com 2 letras.';
    }

    return '';
  }


  function definirEstadoBotao(
    texto,
    desabilitado
  ){
    const botao =
      document.getElementById(
        'scfCustomerRegisterButton'
      );

    if(!botao){
      return;
    }

    botao.textContent =
      texto;

    botao.disabled =
      Boolean(
        desabilitado
      );
  }


  function limparFormularioCliente(){
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
      const input =
        document.getElementById(id);

      if(input){
        input.value = '';
      }
    });

    customerDomain.editingId =
      '';

    const titulo =
      document.getElementById(
        'scfCustomerNewClientTitle'
      );

    if(titulo){
      titulo.textContent =
        'CADASTRAR NOVO CLIENTE';
    }
  }


  function formatarWhatsappVisual(valorRecebido){
    let numeros =
      somenteNumeros(
        valorRecebido
      );

    if(
      numeros.startsWith('55') &&
      (
        numeros.length === 12 ||
        numeros.length === 13
      )
    ){
      numeros =
        numeros.slice(2);
    }

    if(numeros.length === 11){
      return numeros.replace(
        /^(\d{2})(\d{5})(\d{4})$/,
        '($1) $2-$3'
      );
    }

    if(numeros.length === 10){
      return numeros.replace(
        /^(\d{2})(\d{4})(\d{4})$/,
        '($1) $2-$3'
      );
    }

    return valorRecebido || '';
  }


  function inserirClienteNaLista(
    resultado,
    clienteEnviado
  ){
    const lista =
      document.getElementById(
        'scfCustomerRegistrationList'
      );

    if(
      !lista ||
      !clienteEnviado
    ){
      return;
    }

    const idCliente =
      String(
        resultado.clienteId || ''
      );

    if(
      idCliente &&
      lista.querySelector(
        '[data-scf-cliente-id="' +
        idCliente.replace(/"/g, '') +
        '"]'
      )
    ){
      return;
    }

    const linha =
      document.createElement(
        'div'
      );

    linha.className =
      'scf-customer-registration-row';

    if(idCliente){
      linha.dataset.scfClienteId =
        idCliente;
    }

    const documento =
      String(
        resultado.documento ||
        (
          clienteEnviado.tipoPessoa ===
            'JURIDICA'
            ? clienteEnviado.cnpj
            : clienteEnviado.cpf
        ) ||
        ''
      );

    const nome =
      String(
        resultado.nome ||
        (
          clienteEnviado.tipoPessoa ===
            'JURIDICA'
            ? clienteEnviado.razaoSocial
            : clienteEnviado.nomeCompleto
        ) ||
        ''
      );

    const email =
      String(
        clienteEnviado.email ||
        ''
      );

    const whatsapp =
      formatarWhatsappVisual(
        resultado.whatsappFormatado ||
        resultado.whatsapp ||
        clienteEnviado.whatsapp ||
        ''
      );

    [
      documento,
      nome,
      email,
      whatsapp
    ].forEach(function(textoCelula){
      const celula =
        document.createElement(
          'div'
        );

      celula.textContent =
        textoCelula;

      linha.appendChild(
        celula
      );
    });

    lista.prepend(
      linha
    );
  }


  document.addEventListener(
    'click',
    function(event){
      const alvo =
        event.target &&
        event.target.closest
          ? event.target.closest(
              '#scfCustomerRegisterButton'
            )
          : null;

      if(!alvo){
        return;
      }

      if(
        document.body.classList.contains(
          'scf-supplier-registration-open'
        )
      ){
        return;
      }

      event.preventDefault();

      if(
        cadastroClienteEmAndamento
      ){
        return;
      }

      const cliente =
        montarClienteFormulario();

      const erroLocal =
        validarFormularioLocal(
          cliente
        );

      if(erroLocal){
        window.alert(
          erroLocal
        );
        return;
      }

      cadastroClienteEmAndamento =
        true;

      cadastroClienteRequestId +=
        1;

      ultimoClienteEnviado =
        cliente;

      definirEstadoBotao(
        'SALVANDO...',
        true
      );

      window.__scfPdvInfra.shellBridge.post(
        {
          type:
            'SCF_CLIENTE_CADASTRAR',

          requestId:
            cadastroClienteRequestId,

          cliente
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
        typeof event.data ===
          'object'
          ? event.data
          : null;

      if(!mensagem){
        return;
      }

      if(
        mensagem.type !==
          'SCF_CLIENTE_CADASTRADO' &&
        mensagem.type !==
          'SCF_CLIENTE_CADASTRO_ERRO'
      ){
        return;
      }

      if(
        mensagem.requestId !==
        undefined &&
        mensagem.requestId !==
          null &&
        Number(
          mensagem.requestId
        ) !==
          Number(
            cadastroClienteRequestId
          )
      ){
        return;
      }

      if(
        mensagem.type ===
        'SCF_CLIENTE_CADASTRADO'
      ){
        inserirClienteNaLista(
          mensagem,
          ultimoClienteEnviado
        );

        limparFormularioCliente();

        definirEstadoBotao(
          'CADASTRADO',
          true
        );

        window.setTimeout(
          function(){
            cadastroClienteEmAndamento =
              false;

            definirEstadoBotao(
              'CADASTRAR',
              false
            );
          },
          1200
        );

        return;
      }

      cadastroClienteEmAndamento =
        false;

      definirEstadoBotao(
        'CADASTRAR',
        false
      );

      window.alert(
        mensagem.message ||
        mensagem.mensagem ||
        'Não foi possível cadastrar o cliente.'
      );
    }
  );
})();
