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

  function somenteNumerosEdicao(valor){
    return String(valor || '')
      .replace(/\D/g, '');
  }


  function formatarCepEdicao(valor){
    const cep =
      somenteNumerosEdicao(valor)
        .slice(0, 8);

    return cep.length === 8
      ? cep.replace(
          /^(\d{5})(\d{3})$/,
          '$1-$2'
        )
      : cep;
  }


  function formatarCpfEdicao(valor){
    const cpf =
      somenteNumerosEdicao(valor)
        .slice(0, 11);

    return cpf.length === 11
      ? cpf.replace(
          /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
          '$1.$2.$3-$4'
        )
      : cpf;
  }


  function formatarCnpjEdicao(valor){
    const cnpj =
      somenteNumerosEdicao(valor)
        .slice(0, 14);

    return cnpj.length === 14
      ? cnpj.replace(
          /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
          '$1.$2.$3/$4-$5'
        )
      : cnpj;
  }


  function formatarWhatsappEdicao(valor){
    let numero =
      somenteNumerosEdicao(valor);

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


  function definirInputEdicao(
    id,
    valor,
    dispararInput
  ){
    const campo =
      document.getElementById(id);

    if(!campo){
      return;
    }

    campo.value =
      String(valor || '');

    if(dispararInput !== false){
      campo.dispatchEvent(
        new Event(
          'input',
          {
            bubbles:true
          }
        )
      );
    }
  }


  function localizarClienteDaLinha(linha){
    const id =
      String(
        linha &&
        linha.dataset &&
        linha.dataset.scfClienteId ||
        ''
      );

    if(!id){
      return null;
    }

    /*
     * A listagem CMS mantém os objetos completos em memória
     * dentro do script da tela. Como esse array é privado daquele
     * módulo, a própria linha recebe uma cópia serializada segura
     * ao ser renderizada pelo observer abaixo.
     */
    const dados =
      linha.dataset.scfClienteJson;

    if(!dados){
      return null;
    }

    try{
      const cliente =
        JSON.parse(dados);

      return cliente &&
        typeof cliente === 'object'
          ? cliente
          : null;
    }catch(erro){
      return null;
    }
  }


  function preencherFormularioEdicao(cliente){
    if(
      !cliente ||
      typeof cliente !== 'object'
    ){
      return;
    }

    const tipo =
      String(
        cliente.tipoPessoa || ''
      ).toUpperCase() === 'JURIDICA' ||
      somenteNumerosEdicao(
        cliente.cnpj
      )
        ? 'JURIDICA'
        : 'FISICA';

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

    customerDomain.editingId =
      String(
        cliente.clienteId ||
        cliente._id ||
        ''
      );

    definirInputEdicao(
      'scfCustomerFullName',
      tipo === 'JURIDICA'
        ? (
            cliente.razaoSocial ||
            cliente.nome ||
            ''
          )
        : (
            cliente.nomeCompleto ||
            cliente.nome ||
            ''
          ),
      false
    );

    definirInputEdicao(
      'scfCustomerCpf',
      tipo === 'JURIDICA'
        ? (
            cliente.cnpjFormatado ||
            formatarCnpjEdicao(
              cliente.cnpj
            )
          )
        : (
            cliente.cpfFormatado ||
            formatarCpfEdicao(
              cliente.cpf
            )
          ),
      true
    );

    definirInputEdicao(
      'scfCustomerStateRegistration',
      tipo === 'JURIDICA'
        ? cliente.inscricaoEstadual
        : '',
      false
    );

    definirInputEdicao(
      'scfCustomerIeIndicator',
      tipo === 'JURIDICA'
        ? (
            cliente.indicadorIe ||
            cliente.indIEDest ||
            (
              cliente.inscricaoEstadual
                ? '1'
                : ''
            )
          )
        : '9',
      true
    );

    definirInputEdicao(
      'scfCustomerCep',
      formatarCepEdicao(
        cliente.cep
      ),
      false
    );

    definirInputEdicao(
      'scfCustomerAddress',
      cliente.endereco,
      false
    );

    definirInputEdicao(
      'scfCustomerNumber',
      cliente.numero,
      false
    );

    definirInputEdicao(
      'scfCustomerComplement',
      cliente.complemento,
      false
    );

    definirInputEdicao(
      'scfCustomerNeighborhood',
      cliente.bairro,
      false
    );

    definirInputEdicao(
      'scfCustomerCity',
      cliente.cidade,
      false
    );

    definirInputEdicao(
      'scfCustomerUf',
      String(
        cliente.uf || ''
      ).toUpperCase(),
      false
    );

    definirInputEdicao(
      'scfCustomerMunicipalityCode',
      cliente.codigoMunicipio,
      false
    );

    definirInputEdicao(
      'scfCustomerEmail',
      cliente.email,
      false
    );

    definirInputEdicao(
      'scfCustomerWhatsapp',
      formatarWhatsappEdicao(
        cliente.whatsappFormatado ||
        cliente.whatsapp
      ),
      true
    );

    const titulo =
      document.getElementById(
        'scfCustomerNewClientTitle'
      );

    if(titulo){
      titulo.textContent =
        'EDITAR CLIENTE';
    }

    const botao =
      document.getElementById(
        'scfCustomerRegisterButton'
      );

    if(botao){
      botao.textContent =
        'ATUALIZAR';

      botao.disabled =
        false;
    }

    document
      .querySelectorAll(
        '#scfCustomerRegistrationList .scf-customer-registration-row'
      )
      .forEach(function(item){
        item.classList.toggle(
          'is-selected',
          item.dataset.scfClienteId ===
            customerDomain.editingId
        );
      });
  }


  /*
   * Expõe os dados completos em cada linha sem fazer nova chamada
   * ao backend. O objeto público da listagem contém todos os campos
   * necessários para preencher o formulário.
   */
  function anexarDadosCompletosNasLinhas(){
    const linhas =
      document.querySelectorAll(
        '#scfCustomerRegistrationList .scf-customer-registration-row'
      );

    if(!linhas.length){
      return;
    }

    /*
     * Reaproveita a mensagem de listagem recebida pelo iframe.
     * Guardamos uma cópia pública global somente dentro deste iframe.
     */
    const clientes =
      Array.isArray(
        customerDomain.customers
      )
        ? customerDomain.customers
        : [];

    if(!clientes.length){
      return;
    }

    linhas.forEach(function(linha){
      const id =
        String(
          linha.dataset.scfClienteId ||
          ''
        );

      if(
        !id ||
        linha.dataset.scfClienteJson
      ){
        return;
      }

      const cliente =
        clientes.find(function(item){
          return String(
            item &&
            (
              item.clienteId ||
              item._id
            ) ||
            ''
          ) === id;
        });

      if(cliente){
        try{
          linha.dataset.scfClienteJson =
            JSON.stringify(cliente);
        }catch(erro){
          /* não bloqueia a lista */
        }
      }
    });
  }


  window.__scfPdvInfra.shellBridge.onMessage(
    function(event){
      const mensagem =
        event &&
        event.data &&
        typeof event.data === 'object'
          ? event.data
          : null;

      if(
        !mensagem ||
        mensagem.type !==
          'SCF_CLIENTES_LISTA_RESULTADO'
      ){
        return;
      }

      customerDomain.customers =
        Array.isArray(
          mensagem.clientes
        )
          ? mensagem.clientes
          : [];

      window.setTimeout(
        anexarDadosCompletosNasLinhas,
        0
      );
    }
  );


  document.addEventListener(
    'click',
    function(event){
      if(
        document.body.classList.contains(
          'scf-supplier-registration-open'
        )
      ){
        return;
      }

      const linha =
        event.target &&
        event.target.closest
          ? event.target.closest(
              '#scfCustomerRegistrationList .scf-customer-registration-row'
            )
          : null;

      if(!linha){
        return;
      }

      const cliente =
        localizarClienteDaLinha(
          linha
        );

      if(!cliente){
        return;
      }

      event.preventDefault();

      preencherFormularioEdicao(
        cliente
      );
    }
  );


  const observer =
    new MutationObserver(
      anexarDadosCompletosNasLinhas
    );

  observer.observe(
    document.body,
    {
      childList:true,
      subtree:true
    }
  );
})();
