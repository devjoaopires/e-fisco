(function(){
  'use strict';

  const helpers =
    window.__scfPdvShared.helpers;

  const texto =
    helpers.text;
  const formatarCnpj =
    helpers.formatCnpj;
  const formatarAmbiente =
    helpers.formatFiscalEnvironment;

  function aplicarEmpresa(empresaRecebida){
    const configuracao =
      empresaRecebida &&
      typeof empresaRecebida === 'object'
        ? (
            empresaRecebida.configuracao &&
            typeof empresaRecebida.configuracao === 'object'
              ? empresaRecebida.configuracao
              : empresaRecebida
          )
        : null;

    if(!configuracao){
      return false;
    }

    const razaoSocial =
      texto(
        configuracao.razaoSocial ||
        configuracao.razaosocial ||
        configuracao.title
      );

    const cnpj =
      formatarCnpj(
        configuracao.cnpj
      );

    const ambiente =
      formatarAmbiente(
        configuracao.ambiente ||
        configuracao.fiscalEnvironment ||
        configuracao.tpAmb
      );

    const razaoElemento =
      window.__scfPdvInfra.dom.byId(
        'scfCompanyHeaderRazaoSocial'
      );

    const cnpjElemento =
      window.__scfPdvInfra.dom.byId(
        'scfCompanyHeaderCnpj'
      );

    if(razaoElemento){
      razaoElemento.textContent =
        razaoSocial;
    }

    if(cnpjElemento){
      cnpjElemento.textContent =
        cnpj
          ? (
              'CNPJ: ' +
              cnpj +
              (
                ambiente
                  ? ' - ' + ambiente
                  : ''
              )
            )
          : '';
    }

    return Boolean(
      razaoSocial ||
      cnpj ||
      ambiente
    );
  }

  let empresaAplicada =
    false;

  function solicitarEmpresaCabecalho(){
    if(empresaAplicada){
      return;
    }

    try{
      window.__scfPdvInfra.shellBridge.post(
        {
          type:
            'SCF_EMPRESA_CABECALHO_SOLICITAR'
        },
        '*'
      );
    }catch(error){}
  }

  window.__scfPdvInfra.shellBridge.onMessage(
    function(event){
      const dados =
        event &&
        event.data &&
        typeof event.data === 'object'
          ? event.data
          : null;

      if(!dados){
        return;
      }

      if(
        dados.type ===
          'SCF_EMPRESA_CABECALHO_RESULTADO'
      ){
        empresaAplicada =
          aplicarEmpresa(
            dados.empresa
          ) === true;

        return;
      }

      /*
       * Mantém compatibilidade com o carregamento geral já existente,
       * mas ele deixa de ser a única fonte dos dados da empresa.
       */
      if(
        dados.type ===
          'SCF_WIX_READY'
      ){
        empresaAplicada =
          aplicarEmpresa(
            dados.empresa
          ) === true ||
          empresaAplicada;
      }
    }
  );

  /*
   * Solicitação dedicada. Ela independe da sequência longa de testes
   * executada antes do SCF_WIX_READY.
   */
  if(document.readyState === 'complete'){
    solicitarEmpresaCabecalho();
  }else{
    window.addEventListener(
      'load',
      solicitarEmpresaCabecalho,
      {
        once:true
      }
    );
  }
})();
