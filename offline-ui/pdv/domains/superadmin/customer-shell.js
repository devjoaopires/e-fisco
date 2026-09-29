(function(){
  'use strict';

  const superadminDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.superadmin;

  if(!superadminDomain){
    throw new Error(
      'PDV superadmin domain indisponivel.'
    );
  }


  function informarModoSuperAdminAoMenu(
    ativo
  ){
    const iframeMenu =
      document.getElementById(
        '__htmlStatusIframe'
      );

    if(
      !iframeMenu ||
      !iframeMenu.contentWindow
    ){
      return;
    }

    try{
      iframeMenu.contentWindow.postMessage(
        {
          type:
            'SCF_SUPERADMIN_MENU_MODO',

          ativo:
            ativo ===
            true
        },
        '*'
      );
    }catch(error){}
  }

  function abrirCadastroClienteOriginal(){
    if(!superadminDomain.active){
      return;
    }

    /*
     * Este é exatamente o mesmo evento utilizado pelo menu CADASTRAR
     * do ERP para abrir o cadastro original de clientes.
     */
    try{
      window.__scfPdvInfra.eventBus.dispatch(
        new CustomEvent(
          'scf:cadastrar-opcao',
          {
            detail:{
              opcao:'CLIENTE'
            }
          }
        )
      );
    }catch(error){
      console.error(
        '[SUPERADMIN] Não foi possível abrir o Cadastro de Cliente original:',
        error &&
        error.message ||
        error
      );
    }
  }

  function garantirCadastroAberto(){
    if(!superadminDomain.active){
      return;
    }

    const overlay =
      document.getElementById(
        'scfCustomerRegistrationOverlay'
      );

    const aberto =
      document.body.classList.contains(
        'scf-customer-registration-open'
      ) &&
      overlay &&
      overlay.classList.contains(
        'show'
      );

    if(!aberto){
      abrirCadastroClienteOriginal();
    }
  }

  window.__scfPdvInfra.shellBridge.onMessage(
    function(event){
      const dados =
        event &&
        event.data &&
        typeof event.data ===
          'object'
          ? event.data
          : null;

      if(!dados){
        return;
      }

      if(
        dados.type ===
          'SCF_SUPERADMIN_READY'
      ){
        document.body.classList.add(
          'scf-superadmin-cadastro-cliente-open'
        );

        /*
         * Mantém exatamente a abertura do Cadastro de Cliente do PASSO 22
         * e, separadamente, informa ao iframe inferior para trocar somente
         * as labels e bloquear seus cinco botões.
         */
        [0, 80, 220, 500, 900].forEach(
          function(atraso){
            window.setTimeout(
              function(){
                garantirCadastroAberto();

                informarModoSuperAdminAoMenu(
                  true
                );
              },
              atraso
            );
          }
        );

        /*
         * A trava do PASSO 31 só libera quando o Cadastro original já
         * estiver efetivamente aberto; esta chamada é uma segurança extra.
         */
        window.setTimeout(
          function(){
            if(
              typeof window.__scfLiberarPrimeiroPaintAcesso ===
                'function' &&
              document.body.classList.contains(
                'scf-customer-registration-open'
              )
            ){
              window.__scfLiberarPrimeiroPaintAcesso();
            }
          },
          30
        );

        return;
      }

      if(
        dados.type ===
          'SCF_WIX_READY'
      ){
        document.body.classList.remove(
          'scf-superadmin-cadastro-cliente-open'
        );

        informarModoSuperAdminAoMenu(
          false
        );

        if(
          typeof window.__scfLiberarPrimeiroPaintAcesso ===
            'function'
        ){
          window.__scfLiberarPrimeiroPaintAcesso();
        }
      }
    }
  );

  /*
   * Se algum módulo interno tentar fechar o cadastro enquanto o usuário
   * estiver em SUPERADMIN, reabre a mesma tela original.
   */
  window.__scfPdvInfra.eventBus.on('scf:superadmin-garantir-cadastro-cliente',
    garantirCadastroAberto
  );
})();
