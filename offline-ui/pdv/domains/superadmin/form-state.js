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

  const ESTADO_FECHADO = 'FECHADO';
  const ESTADO_NOVO = 'NOVO';
  const ESTADO_EDICAO = 'EDICAO';

  let estado = ESTADO_FECHADO;
  let sincronizando = false;
  let snapshotEdicao = '';

  function el(id){
    return window.__scfPdvInfra.dom.byId(id);
  }

  function texto(valor){
    return String(valor ?? '').trim();
  }

  function superAdminAtivo(){
    return superadminDomain.active ===
      true;
  }

  function abrirVisual(){
    if(document.body){
      document.body.classList.add(
        'scf-superadmin-company-form-open'
      );
    }
  }

  function fecharVisual(){
    if(document.body){
      document.body.classList.remove(
        'scf-superadmin-company-form-open'
      );
    }
  }

  function campoTemValor(campo){
    if(!campo || campo.disabled){
      return false;
    }

    if(
      campo.id === 'scfSuperAdminCompanyEmpresaId' ||
      campo.id === 'scfSuperAdminCompanyCodigoMunicipio'
    ){
      return false;
    }

    if(campo.type === 'hidden'){
      return false;
    }

    /*
     * PASSO 91 — os radios DADOS EMPRESA / DADOS FISCAIS são apenas
     * navegação do formulário. DADOS EMPRESA nasce marcado e não pode
     * ser interpretado como dado cadastral preenchido.
     */
    if(campo.type === 'radio'){
      return false;
    }

    if(campo.type === 'checkbox'){
      return campo.checked === true;
    }

    if(campo.type === 'file'){
      return Boolean(
        campo.files &&
        campo.files.length > 0
      );
    }

    if(campo.tagName === 'SELECT'){
      return texto(campo.value) !== '';
    }

    return texto(campo.value) !== '';
  }

  function cadastroNovoTemDados(){
    const form = el('scfSuperAdminCompanyForm');

    if(!form){
      return false;
    }

    const campos = Array.from(
      form.querySelectorAll(
        'input, select, textarea'
      )
    );

    return campos.some(campoTemValor);
  }

  function valorCampoParaSnapshot(campo){
    if(!campo || campo.disabled){
      return null;
    }

    if(
      campo.type === 'radio' ||
      campo.type === 'hidden'
    ){
      return null;
    }

    if(campo.id === 'scfSuperAdminCompanyEmpresaId'){
      return null;
    }

    if(campo.type === 'checkbox'){
      return campo.checked === true
        ? '1'
        : '0';
    }

    if(campo.type === 'file'){
      const arquivos = Array.from(campo.files || []);
      return arquivos
        .map(function(arquivo){
          return [
            String(arquivo && arquivo.name || ''),
            String(arquivo && arquivo.size || 0),
            String(arquivo && arquivo.lastModified || 0)
          ].join(':');
        })
        .join('|');
    }

    return String(campo.value ?? '');
  }

  function snapshotFormularioEdicao(){
    const form = el('scfSuperAdminCompanyForm');

    if(!form){
      return '';
    }

    const dados = Array.from(
      form.querySelectorAll('input, select, textarea')
    )
      .map(function(campo){
        const valor = valorCampoParaSnapshot(campo);

        if(valor === null){
          return null;
        }

        return [
          campo.id || campo.name || campo.type || 'campo',
          valor
        ];
      })
      .filter(Boolean);

    return JSON.stringify(dados);
  }

  function edicaoTemAlteracoes(){
    if(
      estado !== ESTADO_EDICAO ||
      !snapshotEdicao
    ){
      return false;
    }

    return snapshotFormularioEdicao() !== snapshotEdicao;
  }

  function capturarSnapshotEdicao(){
    snapshotEdicao = snapshotFormularioEdicao();
    sincronizarBotao();
  }

  function temCertificadoSelecionado(){
    const arquivo = el('scfSuperAdminA1File');

    return Boolean(
      arquivo &&
      arquivo.files &&
      arquivo.files.length > 0
    );
  }

  function definirTextoPrimary(valor){
    const primary = el('scfSuperAdminPrimaryActionBtn');

    if(!primary){
      return;
    }

    const novoTexto = texto(valor) || 'CADASTRO';

    if(texto(primary.textContent) !== novoTexto){
      primary.textContent = novoTexto;
    }

    primary.setAttribute('aria-label', novoTexto);
    primary.setAttribute('title', novoTexto);
  }

  function sincronizarBotao(){
    if(sincronizando){
      return;
    }

    sincronizando = true;

    try{
      const primary = el('scfSuperAdminPrimaryActionBtn');
      const bridge = el('scfSuperAdminCompanySubmit');

      if(!primary){
        return;
      }

      if(estado === ESTADO_FECHADO){
        definirTextoPrimary('CADASTRO');
        primary.disabled = false;
        return;
      }

      if(estado === ESTADO_NOVO){
        const possuiDados = cadastroNovoTemDados();

        definirTextoPrimary(
          possuiDados
            ? 'CADASTRAR'
            : 'FECHAR'
        );

        if(
          possuiDados &&
          bridge &&
          bridge.disabled === true
        ){
          primary.disabled = true;
        }else{
          primary.disabled = false;
        }

        return;
      }

      /*
       * PASSO 92 — edição segue o mesmo conceito do cadastro novo:
       * sem alteração = FECHAR; qualquer alteração = ATUALIZAR.
       */
      if(estado === ESTADO_EDICAO){
        const alterado =
          edicaoTemAlteracoes();

        const textoBridge =
          bridge
            ? texto(bridge.textContent)
            : '';

        const emProcessamento =
          /ATUALIZANDO|ENVIANDO|PROCESSANDO/.test(
            textoBridge.toUpperCase()
          );

        definirTextoPrimary(
          emProcessamento
            ? textoBridge
            : (
                alterado
                  ? 'ATUALIZAR'
                  : 'FECHAR'
              )
        );

        primary.disabled =
          emProcessamento && bridge
            ? bridge.disabled === true
            : false;
      }
    }finally{
      sincronizando = false;
    }
  }

  function prepararNovoCadastro(){
    const limpar =
      superadminDomain.actions.clearCompanyForm;

    if(typeof limpar === 'function'){
      limpar();
    }

    const titulo = el('scfSuperAdminCompanyTitle');
    if(titulo){
      titulo.textContent = 'CADASTRAR NOVA EMPRESA';
    }

    const senha = el('scfSuperAdminCompanySenhaAdministrador');
    if(senha){
      senha.placeholder = 'SENHA';
    }

    snapshotEdicao = '';
    estado = ESTADO_NOVO;
    abrirVisual();

    window.setTimeout(function(){
      sincronizarBotao();
    }, 0);
  }

  function fecharCadastroNovo(){
    const limpar =
      superadminDomain.actions.clearCompanyForm;

    if(typeof limpar === 'function'){
      limpar();
    }

    snapshotEdicao = '';
    estado = ESTADO_FECHADO;
    fecharVisual();
    sincronizarBotao();
  }

  function fecharEdicao(){
    const resetarEdicao =
      superadminDomain.actions.resetUpdateMode;

    if(typeof resetarEdicao === 'function'){
      resetarEdicao();
    }

    const limpar =
      superadminDomain.actions.clearCompanyForm;

    if(typeof limpar === 'function'){
      limpar();
    }

    document
      .querySelectorAll(
        '#scfSuperAdminCompaniesRows .scf-superadmin-company-history-row'
      )
      .forEach(function(linha){
        linha.classList.remove('is-selected');
        linha.setAttribute('aria-pressed','false');
      });

    snapshotEdicao = '';
    estado = ESTADO_FECHADO;
    fecharVisual();

    /* PASSO 94 — FECHAR da edição volta à lista do PAINEL ADMINISTRATIVO. */
    if(document.body){
      document.body.classList.remove(
        'scf-superadmin-company-details-open'
      );
    }

    const tituloPainel =
      document.getElementById(
        'scfCustomerRegistrationTitle'
      );

    if(tituloPainel){
      tituloPainel.textContent =
        'PAINEL ADMINISTRATIVO';
    }

    const sairDetalhesVisual =
      superadminDomain.actions.leaveDetailsView;

    if(typeof sairDetalhesVisual === 'function'){
      sairDetalhesVisual();
    }

    sincronizarBotao();
  }

  function fecharAposSucesso(){
    snapshotEdicao = '';
    estado = ESTADO_FECHADO;
    fecharVisual();

    window.setTimeout(function(){
      sincronizarBotao();
    }, 0);
  }

  function tratarPrimaryAntesDoPasso89(event){
    const primary =
      event &&
      event.target &&
      event.target.closest
        ? event.target.closest(
            '#scfSuperAdminPrimaryActionBtn'
          )
        : null;

    if(!primary || !superAdminAtivo()){
      return;
    }

    if(estado === ESTADO_FECHADO){
      event.preventDefault();
      event.stopImmediatePropagation();
      prepararNovoCadastro();
      return;
    }

    if(
      estado === ESTADO_NOVO &&
      !cadastroNovoTemDados()
    ){
      event.preventDefault();
      event.stopImmediatePropagation();
      fecharCadastroNovo();
      return;
    }

    if(
      estado === ESTADO_EDICAO &&
      !edicaoTemAlteracoes()
    ){
      event.preventDefault();
      event.stopImmediatePropagation();
      fecharEdicao();
      return;
    }

    /*
     * NOVO com dados e EDICAO alterada seguem normalmente para o handler
     * do PASSO 89, que aciona o bridge real CADASTRAR/ATUALIZAR.
     */
  }

  function linhaEmpresaDoEvento(event){
    return (
      event &&
      event.target &&
      event.target.closest
        ? event.target.closest(
            '#scfSuperAdminCompaniesRows .scf-superadmin-company-history-row'
          )
        : null
    );
  }

  function tratarSelecaoEmpresa(event){
    const linha = linhaEmpresaDoEvento(event);

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

    estado = ESTADO_EDICAO;
    snapshotEdicao = '';
    abrirVisual();
    sincronizarBotao();

    window.setTimeout(function(){
      capturarSnapshotEdicao();
    }, 0);
  }

  function tratarAlteracaoFormulario(event){
    if(
      (
        estado !== ESTADO_NOVO &&
        estado !== ESTADO_EDICAO
      ) ||
      !event ||
      !event.target ||
      !event.target.closest ||
      !event.target.closest('#scfSuperAdminCompanyForm')
    ){
      return;
    }

    window.setTimeout(
      sincronizarBotao,
      0
    );
  }

  function tratarMensagem(event){
    const dados =
      event &&
      event.data &&
      typeof event.data === 'object'
        ? event.data
        : null;

    if(!dados){
      return;
    }

    if(dados.type === 'SCF_SUPERADMIN_READY'){
      snapshotEdicao = '';
      estado = ESTADO_FECHADO;
      fecharVisual();

      [0,80,220,500,900].forEach(function(atraso){
        window.setTimeout(function(){
          fecharVisual();
          sincronizarBotao();
        }, atraso);
      });

      return;
    }

    if(dados.type === 'SCF_WIX_READY'){
      snapshotEdicao = '';
      estado = ESTADO_FECHADO;
      fecharVisual();
      return;
    }

    if(
      dados.type === 'SCF_SUPERADMIN_EMPRESA_CADASTRO_RESULTADO' &&
      dados.success === true
    ){
      /*
       * Com A1 selecionado, aguarda o resultado do certificado para
       * não esconder o formulário no meio da sequência já aprovada.
       */
      if(!temCertificadoSelecionado()){
        window.setTimeout(
          fecharAposSucesso,
          0
        );
      }
      return;
    }

    if(
      dados.type === 'SCF_SUPERADMIN_EMPRESA_ATUALIZACAO_RESULTADO' &&
      dados.success === true
    ){
      if(!temCertificadoSelecionado()){
        window.setTimeout(
          fecharAposSucesso,
          0
        );
      }
      return;
    }

    if(
      dados.type === 'SCF_SUPERADMIN_CERTIFICADO_A1_RESULTADO' &&
      dados.success === true
    ){
      window.setTimeout(
        fecharAposSucesso,
        0
      );
    }
  }

  function observarBotoes(){
    const primary = el('scfSuperAdminPrimaryActionBtn');
    const bridge = el('scfSuperAdminCompanySubmit');

    if(
      primary &&
      primary.dataset.scfPasso91ObserverReady !== '1'
    ){
      primary.dataset.scfPasso91ObserverReady = '1';

      new MutationObserver(function(){
        window.setTimeout(
          sincronizarBotao,
          0
        );
      }).observe(primary, {
        childList:true,
        subtree:true,
        characterData:true,
        attributes:true,
        attributeFilter:['disabled']
      });
    }

    if(
      bridge &&
      bridge.dataset.scfPasso91ObserverReady !== '1'
    ){
      bridge.dataset.scfPasso91ObserverReady = '1';

      new MutationObserver(function(){
        window.setTimeout(
          sincronizarBotao,
          0
        );
      }).observe(bridge, {
        childList:true,
        subtree:true,
        characterData:true,
        attributes:true,
        attributeFilter:['disabled']
      });
    }
  }

  /* PASSO 93 — navegação DETALHES EMPRESA pode cancelar a edição sem salvar. */
  superadminDomain.actions.closeEditWithoutSaving =
    fecharEdicao;

  function iniciar(){
    fecharVisual();

    document.addEventListener(
      'click',
      tratarPrimaryAntesDoPasso89,
      true
    );

    document.addEventListener(
      'click',
      tratarSelecaoEmpresa
    );

    document.addEventListener(
      'keydown',
      tratarSelecaoEmpresa
    );

    document.addEventListener(
      'input',
      tratarAlteracaoFormulario,
      true
    );

    document.addEventListener(
      'change',
      tratarAlteracaoFormulario,
      true
    );

    window.__scfPdvInfra.shellBridge.onMessage(
      tratarMensagem
    );

    [0,80,220,500,900,1400].forEach(function(atraso){
      window.setTimeout(function(){
        observarBotoes();
        sincronizarBotao();
      }, atraso);
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
