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

  let requestLista = 0;
  let carregandoLista = false;


  function normalizarTexto(valor){
    return String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim();
  }


  function somenteNumeros(valor){
    return String(valor || '')
      .replace(/\D/g, '');
  }


  function tipoPessoaAtual(){
    const juridica =
      document.getElementById(
        'scfCustomerRegistrationPersonJuridica'
      );

    return juridica && juridica.checked
      ? 'JURIDICA'
      : 'FISICA';
  }


  function tipoPessoaCliente(cliente){
    const salvo =
      normalizarTexto(
        cliente &&
        cliente.tipoPessoa
      ).replace(/[^A-Z]/g, '');

    if(
      salvo === 'JURIDICA' ||
      salvo === 'PESSOAJURIDICA' ||
      salvo === 'PJ' ||
      somenteNumeros(
        cliente &&
        cliente.cnpj
      )
    ){
      return 'JURIDICA';
    }

    return 'FISICA';
  }


  function formatarCpf(valor){
    const cpf =
      somenteNumeros(valor)
        .slice(0, 11);

    return cpf.length === 11
      ? cpf.replace(
          /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
          '$1.$2.$3-$4'
        )
      : cpf;
  }


  function formatarCnpj(valor){
    const cnpj =
      somenteNumeros(valor)
        .slice(0, 14);

    return cnpj.length === 14
      ? cnpj.replace(
          /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
          '$1.$2.$3/$4-$5'
        )
      : cnpj;
  }


  function formatarWhatsapp(valor){
    let numero =
      somenteNumeros(valor);

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

    return String(valor || '');
  }


  function limparLista(){
    const lista =
      document.getElementById(
        'scfCustomerRegistrationList'
      );

    if(lista){
      lista.innerHTML = '';
    }

    return lista;
  }


  function mostrarStatusLista(texto){
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
      String(texto || '');

    lista.appendChild(status);
  }


  function criarLinhaCliente(cliente){
    const linha =
      document.createElement('div');

    linha.className =
      'scf-customer-registration-row';

    const clienteId =
      String(
        cliente.clienteId ||
        cliente._id ||
        ''
      );

    if(clienteId){
      linha.dataset.scfClienteId =
        clienteId;
    }

    const tipo =
      tipoPessoaCliente(cliente);

    linha.dataset.scfTipoPessoa =
      tipo;

    const documento =
      tipo === 'JURIDICA'
        ? String(
            cliente.cnpjFormatado ||
            cliente.documento ||
            formatarCnpj(cliente.cnpj) ||
            ''
          )
        : String(
            cliente.cpfFormatado ||
            cliente.documento ||
            formatarCpf(cliente.cpf) ||
            ''
          );

    const nome =
      tipo === 'JURIDICA'
        ? String(
            cliente.razaoSocial ||
            cliente.nome ||
            ''
          )
        : String(
            cliente.nomeCompleto ||
            cliente.nome ||
            ''
          );

    const email =
      String(
        cliente.email ||
        ''
      );

    const whatsapp =
      formatarWhatsapp(
        cliente.whatsappFormatado ||
        cliente.whatsapp ||
        ''
      );

    [
      documento,
      nome,
      email,
      whatsapp
    ].forEach(function(valor){
      const celula =
        document.createElement('div');

      celula.textContent =
        String(valor || '')
          .toUpperCase();

      linha.appendChild(celula);
    });

    return linha;
  }


  function renderizarClientes(){
    if(
      document.body.classList.contains(
        'scf-supplier-registration-open'
      )
    ){
      return;
    }

    const lista =
      limparLista();

    if(!lista){
      return;
    }

    const tipo =
      tipoPessoaAtual();

    const busca =
      document.getElementById(
        'scfCustomerRegistrationSearch'
      );

    const termo =
      normalizarTexto(
        busca ? busca.value : ''
      );

    const filtrados =
      customerDomain.customers.filter(function(cliente){
        if(
          tipoPessoaCliente(cliente) !==
          tipo
        ){
          return false;
        }

        if(!termo){
          return true;
        }

        const pesquisa =
          normalizarTexto([
            cliente.nomeCompleto,
            cliente.razaoSocial,
            cliente.nome,
            cliente.cpf,
            cliente.cpfFormatado,
            cliente.cnpj,
            cliente.cnpjFormatado,
            cliente.documento,
            cliente.email,
            cliente.whatsapp,
            cliente.whatsappFormatado,
            cliente.inscricaoEstadual,
            cliente.cidade,
            cliente.uf
          ].join(' '));

        return pesquisa.includes(
          termo
        );
      });

    if(!filtrados.length){
      mostrarStatusLista(
        termo
          ? 'NENHUM CLIENTE ENCONTRADO'
          : (
              tipo === 'JURIDICA'
                ? 'NENHUMA PESSOA JURÍDICA CADASTRADA'
                : 'NENHUMA PESSOA FÍSICA CADASTRADA'
            )
      );

      return;
    }

    filtrados.forEach(function(cliente){
      lista.appendChild(
        criarLinhaCliente(cliente)
      );
    });
  }


  function solicitarClientesCms(){
    if(
      document.body.classList.contains(
        'scf-supplier-registration-open'
      )
    ){
      return;
    }

    if(carregandoLista){
      return;
    }

    carregandoLista =
      true;

    requestLista +=
      1;

    mostrarStatusLista(
      'CARREGANDO CLIENTES...'
    );

    window.__scfPdvInfra.shellBridge.post(
      {
        type:
          'SCF_CLIENTES_LISTAR',

        requestId:
          requestLista
      },
      '*'
    );
  }


  function garantirEventosLista(){
    const fisica =
      document.getElementById(
        'scfCustomerRegistrationPersonFisica'
      );

    const juridica =
      document.getElementById(
        'scfCustomerRegistrationPersonJuridica'
      );

    const busca =
      document.getElementById(
        'scfCustomerRegistrationSearch'
      );

    [fisica, juridica].forEach(function(radio){
      if(
        radio &&
        radio.dataset.scfListaCmsReady !== '1'
      ){
        radio.dataset.scfListaCmsReady =
          '1';

        radio.addEventListener(
          'change',
          function(){
            renderizarClientes();
          }
        );
      }
    });

    if(
      busca &&
      busca.dataset.scfListaCmsReady !== '1'
    ){
      busca.dataset.scfListaCmsReady =
        '1';

      busca.addEventListener(
        'input',
        function(){
          renderizarClientes();
        }
      );
    }
  }


  window.__scfPdvInfra.eventBus.on('scf:cadastrar-opcao',
    function(event){
      const opcao =
        normalizarTexto(
          event &&
          event.detail &&
          event.detail.opcao
        );

      if(opcao === 'CLIENTE'){
        window.setTimeout(
          function(){
            garantirEventosLista();
            solicitarClientesCms();
          },
          0
        );
      }
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
          'SCF_CLIENTES_LISTA_RESULTADO'
      ){
        carregandoLista =
          false;

        if(
          mensagem.requestId !== undefined &&
          mensagem.requestId !== null &&
          Number(mensagem.requestId) !==
            Number(requestLista)
        ){
          return;
        }

        customerDomain.customers =
          Array.isArray(
            mensagem.clientes
          )
            ? mensagem.clientes
            : [];

        garantirEventosLista();
        renderizarClientes();
        return;
      }

      if(
        mensagem.type ===
          'SCF_CLIENTES_LISTA_ERRO'
      ){
        carregandoLista =
          false;

        mostrarStatusLista(
          mensagem.message ||
          mensagem.mensagem ||
          'NÃO FOI POSSÍVEL CARREGAR OS CLIENTES'
        );

        return;
      }

      /*
       * Depois de um cadastro novo ou atualização, consulta novamente
       * a coleção para manter a tela sincronizada com o CMS.
       */
      if(
        mensagem.type ===
          'SCF_CLIENTE_CADASTRADO'
      ){
        carregandoLista =
          false;

        window.setTimeout(
          solicitarClientesCms,
          150
        );
      }
    }
  );


  garantirEventosLista();
})();
