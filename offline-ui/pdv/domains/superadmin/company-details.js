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

  let empresaDetalhes = null;

  function el(id){
    return window.__scfPdvInfra.dom.byId(id);
  }

  function texto(valor){
    return String(valor ?? '')
      .replace(/\s+/g,' ')
      .trim();
  }

  function nomeFantasiaAtual(){
    if(!empresaDetalhes){
      return '';
    }

    return (
      texto(empresaDetalhes.nomeFantasia) ||
      texto(empresaDetalhes.razaoSocial) ||
      texto(empresaDetalhes.empresaId)
    );
  }

  function tituloAtual(){
    const nome = nomeFantasiaAtual();

    return nome
      ? 'PAINEL ADMINISTRATIVO - ' + nome
      : 'PAINEL ADMINISTRATIVO';
  }

  superadminDomain.actions.currentPanelTitle =
    tituloAtual;

  function atualizarTitulo(){
    const titulo = el('scfCustomerRegistrationTitle');

    if(titulo){
      titulo.textContent = tituloAtual();
    }
  }

  function garantirEstrutura(){
    const overlay = el('scfCustomerRegistrationOverlay');

    if(!overlay){
      return false;
    }

    const card = overlay.querySelector(
      '.scf-customer-registration-card'
    );

    const header = overlay.querySelector(
      '.scf-customer-registration-header'
    );

    const painelLista = el('scfSuperAdminCompaniesPanel');

    if(!card || !header || !painelLista){
      return false;
    }

    let detalhes = el('scfSuperAdminCompanyDetailsPanel');

    if(!detalhes){
      detalhes = document.createElement('div');
      detalhes.id = 'scfSuperAdminCompanyDetailsPanel';
      detalhes.setAttribute('aria-label','Detalhes da empresa');
      detalhes.setAttribute('role','region');
      painelLista.insertAdjacentElement('afterend', detalhes);
    }

    /* PASSO 95 — seta removida definitivamente; retorno ocorre pelo FECHAR. */

    return true;
  }

  function abrirDetalhes(empresa){
    if(!empresa || !texto(empresa.empresaId)){
      return;
    }

    empresaDetalhes = empresa;

    garantirEstrutura();

    if(document.body){
      document.body.classList.add(
        'scf-superadmin-company-details-open'
      );
    }

    const detalhes = el('scfSuperAdminCompanyDetailsPanel');

    if(detalhes){
      detalhes.dataset.empresaId = texto(empresa.empresaId);
      detalhes.setAttribute(
        'aria-label',
        'Detalhes da empresa ' + nomeFantasiaAtual()
      );
    }

    atualizarTitulo();
  }

  function limparSelecaoVisual(){
    document
      .querySelectorAll(
        '#scfSuperAdminCompaniesRows .scf-superadmin-company-history-row'
      )
      .forEach(function(linha){
        linha.classList.remove('is-selected');
        linha.setAttribute('aria-pressed','false');
      });
  }

  function sairDetalhesVisual(){
    empresaDetalhes = null;

    if(document.body){
      document.body.classList.remove(
        'scf-superadmin-company-details-open'
      );
    }

    const detalhes = el('scfSuperAdminCompanyDetailsPanel');
    if(detalhes){
      detalhes.removeAttribute('data-empresa-id');
      detalhes.setAttribute('aria-label','Detalhes da empresa');
    }

    atualizarTitulo();
  }

  superadminDomain.actions.leaveDetailsView =
    sairDetalhesVisual;

  function voltarParaLista(){
    const fecharEdicao =
      superadminDomain.actions.closeEditWithoutSaving;

    if(typeof fecharEdicao === 'function'){
      fecharEdicao();
    }else{
      const resetar =
        superadminDomain.actions.resetUpdateMode;

      if(typeof resetar === 'function'){
        resetar();
      }

      const limpar =
        superadminDomain.actions.clearCompanyForm;

      if(typeof limpar === 'function'){
        limpar();
      }

      if(document.body){
        document.body.classList.remove(
          'scf-superadmin-company-form-open'
        );
      }
    }

    limparSelecaoVisual();
    sairDetalhesVisual();
  }

  function linhaDoEvento(event){
    return event &&
      event.target &&
      event.target.closest
        ? event.target.closest(
            '#scfSuperAdminCompaniesRows .scf-superadmin-company-history-row'
          )
        : null;
  }

  function tratarSelecao(event){
    const linha = linhaDoEvento(event);

    if(!linha){
      return;
    }

    if(
      event.type === 'keydown' &&
      event.key !== 'Enter' &&
      event.key !== ' '
    ){
      return;
    }

    const empresa = linha.__scfEmpresaDados;

    if(!empresa){
      return;
    }

    /*
     * Roda em captura: a view entra em DETALHES imediatamente e os handlers
     * já existentes continuam o bubble normal para preencher o formulário.
     */
    abrirDetalhes(empresa);
  }

  function tratarMensagem(event){
    const dados = event &&
      event.data &&
      typeof event.data === 'object'
        ? event.data
        : null;

    if(!dados){
      return;
    }

    if(dados.type === 'SCF_SUPERADMIN_READY'){
      empresaDetalhes = null;

      if(document.body){
        document.body.classList.remove(
          'scf-superadmin-company-details-open'
        );
      }

      [0,80,220,500,900].forEach(function(atraso){
        window.setTimeout(function(){
          garantirEstrutura();
          atualizarTitulo();
        }, atraso);
      });

      return;
    }

    if(dados.type === 'SCF_WIX_READY'){
      empresaDetalhes = null;

      if(document.body){
        document.body.classList.remove(
          'scf-superadmin-company-details-open'
        );
      }

      return;
    }

    /* Mantém o título sincronizado se o nome fantasia for atualizado. */
    if(
      dados.type === 'SCF_SUPERADMIN_EMPRESAS_RESULTADO' &&
      dados.success === true &&
      empresaDetalhes
    ){
      const empresaIdAtual = texto(empresaDetalhes.empresaId);
      const lista = Array.isArray(dados.empresas)
        ? dados.empresas
        : [];

      const atualizada = lista.find(function(item){
        return texto(item && item.empresaId) === empresaIdAtual;
      });

      if(atualizada){
        empresaDetalhes = atualizada;
        atualizarTitulo();
      }
    }
  }

  function iniciar(){
    garantirEstrutura();

    document.addEventListener(
      'click',
      tratarSelecao,
      true
    );

    document.addEventListener(
      'keydown',
      tratarSelecao,
      true
    );

    window.__scfPdvInfra.shellBridge.onMessage(
      tratarMensagem
    );

    [0,80,220,500,900,1400].forEach(function(atraso){
      window.setTimeout(
        garantirEstrutura,
        atraso
      );
    });
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
