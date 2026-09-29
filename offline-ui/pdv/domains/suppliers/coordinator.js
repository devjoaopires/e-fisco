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

  const CAMPOS_COMPARTILHADOS = [
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
  ];

  function texto(valor){
    return String(valor == null ? '' : valor).trim();
  }

  function normalizar(valor){
    return texto(valor)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toUpperCase();
  }

  function obterTipo(){
    const overlay =
      document.getElementById(
        'scfCustomerRegistrationOverlay'
      );

    const tipoDataset =
      normalizar(
        overlay &&
        overlay.dataset
          ? overlay.dataset.cadastroTipo
          : ''
      );

    if(
      tipoDataset === 'FORNECEDOR' ||
      document.body.classList.contains(
        'scf-supplier-registration-open'
      )
    ){
      return 'FORNECEDOR';
    }

    return 'CLIENTE';
  }

  function selecionarCadastroNoMenu(){
    try{
      const iframe =
        document.getElementById(
          '__htmlStatusIframe'
        );

      if(
        iframe &&
        iframe.contentWindow
      ){
        iframe.contentWindow.postMessage(
          {
            type:
              'SCF_MENU_SELECIONAR_CADASTRAR'
          },
          '*'
        );
      }
    }catch(error){}
  }

  function sincronizarVisual(tipoRecebido){
    const tipo =
      normalizar(tipoRecebido) ===
        'FORNECEDOR'
        ? 'FORNECEDOR'
        : 'CLIENTE';

    const fornecedor =
      tipo === 'FORNECEDOR';

    const overlay =
      document.getElementById(
        'scfCustomerRegistrationOverlay'
      );

    if(overlay){
      overlay.dataset.cadastroTipo =
        tipo;
    }

    document.body.classList.toggle(
      'scf-supplier-registration-open',
      fornecedor
    );

    const tituloPagina =
      document.getElementById(
        'scfCustomerRegistrationTitle'
      );

    if(tituloPagina){
      tituloPagina.textContent =
        fornecedor
          ? 'CADASTRO FORNECEDOR'
          : 'CADASTRO DE CLIENTE';
    }

    const busca =
      document.getElementById(
        'scfCustomerRegistrationSearch'
      );

    if(busca){
      busca.placeholder =
        fornecedor
          ? 'BUSCAR FORNECEDOR'
          : 'BUSCAR CLIENTE';

      busca.setAttribute(
        'aria-label',
        fornecedor
          ? 'Buscar fornecedor'
          : 'Buscar cliente'
      );
    }

    const tituloFormulario =
      document.getElementById(
        'scfCustomerNewClientTitle'
      );

    if(tituloFormulario){
      tituloFormulario.textContent =
        fornecedor
          ? 'CADASTRAR NOVO FORNECEDOR'
          : 'CADASTRAR NOVO CLIENTE';
    }

    selecionarCadastroNoMenu();
  }

  function resetarFormularioCompartilhado(tipoRecebido){
    const tipo =
      normalizar(tipoRecebido) ===
        'FORNECEDOR'
        ? 'FORNECEDOR'
        : 'CLIENTE';

    /*
     * Define o estado ANTES de disparar change nos radios.
     * Assim os handlers de Cliente/Fornecedor já enxergam o modo correto.
     */
    sincronizarVisual(tipo);

    CAMPOS_COMPARTILHADOS.forEach(
      function(id){
        const campo =
          document.getElementById(id);

        if(campo){
          campo.value = '';
        }
      }
    );

    const busca =
      document.getElementById(
        'scfCustomerRegistrationSearch'
      );

    if(busca){
      busca.value = '';
    }

    customerDomain.editingId = '';
    supplierDomain.editingId = '';
    window.__scfIndicadorIeSintegrapiConfirmado =
      false;

    const botao =
      document.getElementById(
        'scfCustomerRegisterButton'
      );

    if(botao){
      botao.classList.remove(
        'scf-customer-danger-action'
      );

      botao.textContent =
        'CADASTRAR';

      botao.disabled =
        false;

      delete botao.dataset
        .scfClienteAcao;

      delete botao.dataset
        .scfFornecedorAcao;
    }

    const formFisica =
      document.getElementById(
        'scfCustomerPersonFisica'
      );

    const formJuridica =
      document.getElementById(
        'scfCustomerPersonJuridica'
      );

    if(formFisica){
      formFisica.checked = true;
    }

    if(formJuridica){
      formJuridica.checked = false;
    }

    const listaFisica =
      document.getElementById(
        'scfCustomerRegistrationPersonFisica'
      );

    const listaJuridica =
      document.getElementById(
        'scfCustomerRegistrationPersonJuridica'
      );

    if(listaFisica){
      listaFisica.checked = true;
    }

    if(listaJuridica){
      listaJuridica.checked = false;
    }

    /*
     * Dispara depois que todos os valores e o tipo já estão coerentes.
     * Os módulos existentes cuidam de máscara, campos PJ e renderização.
     */
    if(formFisica){
      formFisica.dispatchEvent(
        new Event(
          'change',
          {
            bubbles:true
          }
        )
      );
    }

    if(listaFisica){
      listaFisica.dispatchEvent(
        new Event(
          'change',
          {
            bubbles:true
          }
        )
      );
    }

    sincronizarVisual(tipo);
  }

  window.__scfPdvInfra.eventBus.on('scf:cadastrar-opcao',
    function(event){
      const opcao =
        normalizar(
          event &&
          event.detail
            ? event.detail.opcao
            : ''
        );

      if(
        opcao !== 'CLIENTE' &&
        opcao !== 'FORNECEDOR'
      ){
        return;
      }

      /*
       * Este listener está no final do arquivo e portanto roda depois dos
       * módulos antigos. Ele encerra a transição com os dois lados do cadastro
       * apontando para o MESMO tipo.
       */
      resetarFormularioCompartilhado(
        opcao
      );

      [0, 80, 220].forEach(
        function(atraso){
          window.setTimeout(
            function(){
              sincronizarVisual(
                opcao
              );
            },
            atraso
          );
        }
      );
    }
  );

  /*
   * Guarda final: se algum retorno assíncrono antigo tentar alterar apenas
   * título/classe, o dataset do overlay continua sendo a fonte principal.
   */
  window.__scfPdvInfra.shellBridge.onMessage(
    function(){
      if(
        !document.body.classList.contains(
          'scf-customer-registration-open'
        )
      ){
        return;
      }

      const tipo =
        obterTipo();

      window.setTimeout(
        function(){
          sincronizarVisual(
            tipo
          );
        },
        0
      );
    }
  );
})();
