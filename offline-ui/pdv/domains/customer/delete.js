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

  let clienteSelecionadoId =
    '';

  let estadoOriginal =
    '';

  let exclusaoEmAndamento =
    false;

  let requestExclusao =
    0;


  function campoValor(id){
    const campo =
      document.getElementById(id);

    return campo
      ? String(campo.value || '').trim()
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


  function estadoFormulario(){
    return JSON.stringify({
      tipoPessoa:
        tipoPessoaFormulario(),

      nome:
        campoValor(
          'scfCustomerFullName'
        ),

      documento:
        campoValor(
          'scfCustomerCpf'
        ),

      inscricaoEstadual:
        campoValor(
          'scfCustomerStateRegistration'
        ),

      indicadorIe:
        campoValor(
          'scfCustomerIeIndicator'
        ),

      cep:
        campoValor(
          'scfCustomerCep'
        ),

      endereco:
        campoValor(
          'scfCustomerAddress'
        ),

      numero:
        campoValor(
          'scfCustomerNumber'
        ),

      complemento:
        campoValor(
          'scfCustomerComplement'
        ),

      bairro:
        campoValor(
          'scfCustomerNeighborhood'
        ),

      cidade:
        campoValor(
          'scfCustomerCity'
        ),

      uf:
        campoValor(
          'scfCustomerUf'
        ),

      codigoMunicipio:
        campoValor(
          'scfCustomerMunicipalityCode'
        ),

      email:
        campoValor(
          'scfCustomerEmail'
        ),

      whatsapp:
        campoValor(
          'scfCustomerWhatsapp'
        )
    });
  }


  function botaoCadastro(){
    return document.getElementById(
      'scfCustomerRegisterButton'
    );
  }


  function aplicarBotaoExclusao(){
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

    botao.dataset.scfClienteAcao =
      'EXCLUIR';
  }


  function aplicarBotaoAtualizar(){
    const botao =
      botaoCadastro();

    if(!botao){
      return;
    }

    /*
     * ATUALIZAR volta ao visual verde original do botão.
     * Vermelho fica reservado somente para EXCLUIR.
     */
    botao.classList.remove(
      'scf-customer-danger-action'
    );

    botao.textContent =
      'ATUALIZAR';

    botao.disabled =
      false;

    botao.dataset.scfClienteAcao =
      'ATUALIZAR';
  }


  function aplicarBotaoCadastrar(){
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

    delete botao.dataset.scfClienteAcao;
  }


  function atualizarEstadoBotaoPorAlteracao(){
    if(
      !clienteSelecionadoId ||
      exclusaoEmAndamento
    ){
      return;
    }

    if(
      estadoFormulario() !==
        estadoOriginal
    ){
      aplicarBotaoAtualizar();
    }else{
      aplicarBotaoExclusao();
    }
  }


  function registrarClienteSelecionado(){
    const id =
      String(
        customerDomain.editingId ||
        ''
      );

    if(!id){
      return;
    }

    clienteSelecionadoId =
      id;

    /*
     * O script de edição anterior termina de preencher o formulário
     * durante o mesmo clique. O snapshot é feito logo depois.
     */
    window.setTimeout(
      function(){
        if(
          String(
            customerDomain.editingId ||
            ''
          ) !== clienteSelecionadoId
        ){
          return;
        }

        estadoOriginal =
          estadoFormulario();

        aplicarBotaoExclusao();
      },
      0
    );
  }


  function sairModoEdicao(){
    clienteSelecionadoId =
      '';

    estadoOriginal =
      '';

    exclusaoEmAndamento =
      false;

    customerDomain.editingId =
      '';

    /*
     * Sempre volta ao formulário totalmente limpo.
     * Isso também é usado quando o usuário fecha pelo X.
     */
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
      const campo =
        document.getElementById(id);

      if(campo){
        campo.value =
          '';
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
      fisica.checked =
        true;
    }

    if(juridica){
      juridica.checked =
        false;
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

    const titulo =
      document.getElementById(
        'scfCustomerNewClientTitle'
      );

    if(titulo){
      titulo.textContent =
        'CADASTRAR NOVO CLIENTE';
    }

    document
      .querySelectorAll(
        '#scfCustomerRegistrationList .scf-customer-registration-row'
      )
      .forEach(function(linha){
        linha.classList.remove(
          'is-selected'
        );
      });

    aplicarBotaoCadastrar();
  }


  window.__scfPdvInfra.eventBus.on('scf:cadastrar-opcao',
    function(event){
      const opcao =
        String(
          event &&
          event.detail &&
          event.detail.opcao ||
          ''
        ).toUpperCase();

      if(opcao === 'FORNECEDOR'){
        /*
         * FORNECEDOR usa o mesmo formulário visual de CLIENTE.
         * Aqui limpamos SOMENTE o estado interno da edição de cliente.
         * Não chamamos sairModoEdicao(), porque essa rotina redefine
         * título/radio/campos para CLIENTE e causava a tela híbrida
         * depois de COLABORADOR -> FORNECEDOR.
         */
        clienteSelecionadoId = '';
        estadoOriginal = '';
        exclusaoEmAndamento = false;
        customerDomain.editingId = '';

        const botao =
          document.getElementById(
            'scfCustomerRegisterButton'
          );

        if(botao){
          delete botao.dataset.scfClienteAcao;
        }

        document
          .querySelectorAll(
            '#scfCustomerRegistrationList .scf-customer-registration-row'
          )
          .forEach(function(linha){
            linha.classList.remove(
              'is-selected'
            );
          });
      }
    }
  );

  /*
   * Ao fechar CADASTRO DE CLIENTE pelo X, descarta qualquer
   * cliente selecionado/edição e garante que a próxima abertura
   * comece como um cadastro novo, com todos os campos vazios.
   */
  document.addEventListener(
    'click',
    function(event){
      const fechar =
        event.target &&
        event.target.closest
          ? event.target.closest(
              '#scfCustomerRegistrationClose'
            )
          : null;

      if(!fechar){
        return;
      }

      sairModoEdicao();
    },
    true
  );


  /*
   * Depois que o clique na linha for tratado pelo script de edição,
   * troca o botão para EXCLUIR em vermelho.
   */
  document.addEventListener(
    'click',
    function(event){
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

      registrarClienteSelecionado();
    }
  );


  /*
   * Qualquer alteração manual nos dados do cliente selecionado
   * muda EXCLUIR para ATUALIZAR, mantendo o botão vermelho.
   */
  document.addEventListener(
    'input',
    function(event){
      if(
        !clienteSelecionadoId
      ){
        return;
      }

      const alvo =
        event.target;

      if(
        !alvo ||
        !alvo.closest ||
        !alvo.closest(
          '#scfCustomerNewClientForm'
        )
      ){
        return;
      }

      window.setTimeout(
        atualizarEstadoBotaoPorAlteracao,
        0
      );
    }
  );


  document.addEventListener(
    'change',
    function(event){
      if(
        !clienteSelecionadoId
      ){
        return;
      }

      const alvo =
        event.target;

      if(
        !alvo ||
        !alvo.closest ||
        !alvo.closest(
          '#scfCustomerNewClientForm'
        )
      ){
        return;
      }

      window.setTimeout(
        atualizarEstadoBotaoPorAlteracao,
        0
      );
    }
  );


  /*
   * CAPTURE é usado de propósito:
   * quando o botão está em EXCLUIR, esta rotina intercepta
   * antes do handler antigo de CADASTRAR/ATUALIZAR.
   *
   * Quando está em ATUALIZAR, o clique segue normalmente e
   * o handler já existente envia SCF_CLIENTE_CADASTRAR com clienteId.
   */
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

      const botao =
        event.target &&
        event.target.closest
          ? event.target.closest(
              '#scfCustomerRegisterButton'
            )
          : null;

      if(
        !botao ||
        !clienteSelecionadoId ||
        botao.dataset.scfClienteAcao !==
          'EXCLUIR'
      ){
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      if(
        exclusaoEmAndamento
      ){
        return;
      }

      exclusaoEmAndamento =
        true;

      requestExclusao +=
        1;

      botao.textContent =
        'EXCLUINDO...';

      botao.disabled =
        true;

      window.__scfPdvInfra.shellBridge.post(
        {
          type:
            'SCF_CLIENTE_EXCLUIR',

          requestId:
            requestExclusao,

          clienteId:
            clienteSelecionadoId
        },
        '*'
      );
    },
    true
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
        mensagem.type ===
          'SCF_CLIENTE_EXCLUIDO'
      ){
        if(
          mensagem.requestId !==
            undefined &&
          mensagem.requestId !==
            null &&
          Number(
            mensagem.requestId
          ) !==
            Number(
              requestExclusao
            )
        ){
          return;
        }

        const idExcluido =
          String(
            mensagem.clienteId ||
            clienteSelecionadoId ||
            ''
          );

        const linha =
          document.querySelector(
            '#scfCustomerRegistrationList ' +
            '[data-scf-cliente-id="' +
            idExcluido.replace(/"/g, '') +
            '"]'
          );

        if(linha){
          linha.remove();
        }

        if(
          Array.isArray(
            customerDomain.customers
          )
        ){
          customerDomain.customers =
            customerDomain.customers
              .filter(function(cliente){
                return String(
                  cliente &&
                  (
                    cliente.clienteId ||
                    cliente._id
                  ) ||
                  ''
                ) !== idExcluido;
              });
        }

        /*
         * Limpa os campos sem disparar eventos que poderiam
         * transformar o botão novamente em ATUALIZAR.
         */
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
          const campo =
            document.getElementById(id);

          if(campo){
            campo.value =
              '';
          }
        });

        sairModoEdicao();

        /*
         * Recarrega a coleção para garantir sincronização total.
         */
        window.__scfPdvInfra.shellBridge.post(
          {
            type:
              'SCF_CLIENTES_LISTAR'
          },
          '*'
        );

        return;
      }

      if(
        mensagem.type ===
          'SCF_CLIENTE_EXCLUSAO_ERRO'
      ){
        if(
          mensagem.requestId !==
            undefined &&
          mensagem.requestId !==
            null &&
          Number(
            mensagem.requestId
          ) !==
            Number(
              requestExclusao
            )
        ){
          return;
        }

        exclusaoEmAndamento =
          false;

        aplicarBotaoExclusao();

        window.alert(
          mensagem.message ||
          mensagem.mensagem ||
          'Não foi possível excluir o cliente.'
        );

        return;
      }

      /*
       * Depois de ATUALIZAR com sucesso, o fluxo antigo limpa
       * o formulário. Aqui só garantimos que o botão volte ao verde.
       */
      if(
        mensagem.type ===
          'SCF_CLIENTE_CADASTRADO'
      ){
        sairModoEdicao();
      }
    }
  );
})();
