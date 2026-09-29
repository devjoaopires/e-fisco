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

  function removerSetaDetalhes(){
    const seta =
      document.getElementById(
        'scfSuperAdminCompanyDetailsBack'
      );

    if(seta && seta.parentNode){
      seta.parentNode.removeChild(seta);
    }
  }

  function garantirTituloListaQuandoSemDetalhes(){
    if(
      document.body &&
      document.body.classList.contains(
        'scf-superadmin-cadastro-cliente-open'
      ) &&
      !document.body.classList.contains(
        'scf-superadmin-company-details-open'
      )
    ){
      const titulo =
        document.getElementById(
          'scfCustomerRegistrationTitle'
        );

      if(titulo){
        titulo.textContent =
          'PAINEL ADMINISTRATIVO';
      }
    }
  }

  function sincronizar(){
    removerSetaDetalhes();
    garantirTituloListaQuandoSemDetalhes();
  }

  function iniciar(){
    sincronizar();

    [0,80,220,500,900,1400,1800].forEach(
      function(atraso){
        window.setTimeout(
          sincronizar,
          atraso
        );
      }
    );

    window.__scfPdvInfra.shellBridge.onMessage(
      function(){
        window.setTimeout(
          sincronizar,
          0
        );
      }
    );
  }

  if(document.readyState === 'loading'){
    document.addEventListener(
      'DOMContentLoaded',
      iniciar,
      { once:true }
    );
  }else{
    iniciar();
  }
})();
