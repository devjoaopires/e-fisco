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

  let requestIdAtual =
    '';

  let carregando =
    false;

  let tituloObserver =
    null;

  function texto(valor){
    return String(
      valor ?? ''
    )
      .replace(/\s+/g,' ')
      .trim();
  }

  function formatarCnpj(valor){
    const numeros =
      texto(valor)
        .replace(/\D/g,'')
        .slice(0,14);

    if(numeros.length !== 14){
      return numeros;
    }

    return numeros
      .replace(/^(\d{2})(\d)/,'$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3')
      .replace(/\.(\d{3})(\d)/,'.$1/$2')
      .replace(/(\d{4})(\d)/,'$1-$2');
  }

  function formatarValidade(valor){
    const bruto =
      texto(valor);

    if(!bruto){
      return '-';
    }

    const data =
      new Date(bruto);

    if(Number.isNaN(data.getTime())){
      return '-';
    }

    const dia =
      String(
        data.getUTCDate()
      ).padStart(2,'0');

    const mes =
      String(
        data.getUTCMonth() + 1
      ).padStart(2,'0');

    const ano =
      String(
        data.getUTCFullYear()
      );

    return `${dia}/${mes}/${ano}`;
  }

  function formatarTipoAmbiente(valor){
    const ambiente =
      texto(valor)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'')
        .toUpperCase();

    if(
      ambiente === '1' ||
      ambiente === 'PRODUCAO' ||
      ambiente === 'PROD'
    ){
      return 'PRODUÇÃO';
    }

    if(
      ambiente === '2' ||
      ambiente === 'HOMOLOGACAO' ||
      ambiente === 'HOMOLOG' ||
      ambiente === 'HML'
    ){
      return 'HOMOLOGAÇÃO';
    }

    return '-';
  }

  function obterCard(){
    const overlay =
      document.getElementById(
        'scfCustomerRegistrationOverlay'
      );

    return overlay
      ? overlay.querySelector(
          '.scf-customer-registration-card'
        )
      : null;
  }

  function tituloPainelSuperAdminAtual(){
    const resolver =
      superadminDomain.actions.currentPanelTitle;

    if(typeof resolver === 'function'){
      const resolvido =
        texto(
          resolver()
        );

      if(resolvido){
        return resolvido;
      }
    }

    return 'PAINEL ADMINISTRATIVO';
  }

  function sincronizarTitulo(){
    if(!superadminDomain.active){
      return;
    }

    const titulo =
      document.getElementById(
        'scfCustomerRegistrationTitle'
      );

    if(!titulo){
      return;
    }

    const tituloDesejado =
      tituloPainelSuperAdminAtual();

    if(
      titulo.textContent !==
        tituloDesejado
    ){
      titulo.textContent =
        tituloDesejado;
    }

    if(
      tituloObserver &&
      tituloObserver.__scfObservedTitle ===
        titulo
    ){
      return;
    }

    if(tituloObserver){
      tituloObserver.disconnect();
    }

    tituloObserver =
      new MutationObserver(
        function(){
          const desejado =
            tituloPainelSuperAdminAtual();

          if(
            superadminDomain.active &&
            titulo.textContent !==
              desejado
          ){
            titulo.textContent =
              desejado;
          }
        }
      );

    tituloObserver.__scfObservedTitle =
      titulo;

    tituloObserver.observe(
      titulo,
      {
        childList:true,
        characterData:true,
        subtree:true
      }
    );
  }

  function garantirPainel(){
    const card =
      obterCard();

    if(!card){
      return null;
    }

    sincronizarTitulo();

    let painel =
      document.getElementById(
        'scfSuperAdminCompaniesPanel'
      );

    if(painel){
      return painel;
    }

    painel =
      document.createElement(
        'div'
      );

    painel.id =
      'scfSuperAdminCompaniesPanel';

    painel.setAttribute(
      'aria-label',
      'Empresas cadastradas'
    );

    painel.innerHTML =
      ''
      + '<div id="scfSuperAdminCompaniesTableHeader" aria-hidden="true">'
      +   '<div>ID EMPRESA</div>'
      +   '<div>EMPRESA</div>'
      +   '<div>CNPJ</div>'
      +   '<div>STATUS</div>'
      +   '<div>CERTIFICADO</div>'
      +   '<div>VALIDADE</div>'
      +   '<div>TIPO</div>'
      + '</div>'
      + '<div id="scfSuperAdminCompaniesRows" aria-live="polite">'
      +   '<div class="scf-superadmin-companies-message">CARREGANDO EMPRESAS...</div>'
      + '</div>';

    const header =
      card.querySelector(
        '.scf-customer-registration-header'
      );

    const conteudoOriginal =
      document.getElementById(
        'scfCustomerRegistrationContent'
      );

    if(
      header &&
      header.nextSibling
    ){
      card.insertBefore(
        painel,
        header.nextSibling
      );
    }else if(conteudoOriginal){
      card.insertBefore(
        painel,
        conteudoOriginal
      );
    }else{
      card.appendChild(
        painel
      );
    }

    return painel;
  }

  function obterLinhas(){
    return document.getElementById(
      'scfSuperAdminCompaniesRows'
    );
  }

  function criarCelula(
    classe,
    valor,
    title
  ){
    const celula =
      document.createElement(
        'div'
      );

    if(classe){
      celula.className =
        classe;
    }

    celula.textContent =
      valor;

    if(title){
      celula.title =
        title;
    }

    return celula;
  }

  function criarLinhaEmpresa(empresa){
    const empresaId =
      texto(
        empresa?.empresaId
      ) || '-';

    const cnpj =
      formatarCnpj(
        empresa?.cnpj
      ) || '-';

    const razaoSocial =
      texto(
        empresa?.razaoSocial
      );

    const nomeFantasia =
      texto(
        empresa?.nomeFantasia
      );

    const nome =
      nomeFantasia ||
      razaoSocial ||
      `EMPRESA ${empresaId}`;

    const nomeCompleto =
      nomeFantasia &&
      razaoSocial &&
      nomeFantasia !== razaoSocial
        ? `${nomeFantasia} — ${razaoSocial}`
        : nome;

    const ativo =
      empresa?.ativo ===
        true;

    const certificadoTipo =
      texto(
        empresa?.certificadoTipo
      ) || '-';

    const certificadoValidade =
      formatarValidade(
        empresa?.certificadoValidoAte
      );

    const tipoAmbiente =
      formatarTipoAmbiente(
        empresa?.ambiente
      );

    const linha =
      document.createElement(
        'div'
      );

    linha.className =
      'scf-superadmin-company-history-row';

    linha.dataset.empresaId =
      empresaId;

    linha.__scfEmpresaDados =
      empresa;

    linha.setAttribute(
      'role',
      'button'
    );

    linha.setAttribute(
      'tabindex',
      '0'
    );

    linha.setAttribute(
      'aria-label',
      [
        `ID ${empresaId}`,
        nomeCompleto,
        `CNPJ ${cnpj}`,
        ativo
          ? 'ATIVA'
          : 'INATIVA',
        `CERTIFICADO ${certificadoTipo}`,
        `VALIDADE ${certificadoValidade}`,
        `TIPO ${tipoAmbiente}`
      ].join(', ')
    );

    linha.appendChild(
      criarCelula(
        '',
        empresaId,
        `ID EMPRESA ${empresaId}`
      )
    );

    linha.appendChild(
      criarCelula(
        'scf-superadmin-company-history-name',
        nome,
        nomeCompleto
      )
    );

    linha.appendChild(
      criarCelula(
        '',
        cnpj,
        cnpj
      )
    );

    linha.appendChild(
      criarCelula(
        'scf-superadmin-company-history-status',
        ativo
          ? 'ATIVA'
          : 'INATIVA',
        ativo
          ? 'EMPRESA ATIVA'
          : 'EMPRESA INATIVA'
      )
    );

    linha.appendChild(
      criarCelula(
        'scf-superadmin-company-history-certificate',
        certificadoTipo,
        certificadoTipo !== '-'
          ? `CERTIFICADO ${certificadoTipo}`
          : 'SEM CERTIFICADO ATIVO'
      )
    );

    linha.appendChild(
      criarCelula(
        'scf-superadmin-company-history-validity',
        certificadoValidade,
        certificadoValidade !== '-'
          ? `VALIDADE ${certificadoValidade}`
          : 'SEM VALIDADE DISPONÍVEL'
      )
    );

    linha.appendChild(
      criarCelula(
        'scf-superadmin-company-history-environment',
        tipoAmbiente,
        tipoAmbiente !== '-'
          ? `TIPO ${tipoAmbiente}`
          : 'TIPO NÃO INFORMADO'
      )
    );

    return linha;
  }

  function mostrarMensagem(mensagem){
    garantirPainel();

    const linhas =
      obterLinhas();

    if(!linhas){
      return;
    }

    linhas.replaceChildren();

    const aviso =
      document.createElement(
        'div'
      );

    aviso.className =
      'scf-superadmin-companies-message';

    aviso.textContent =
      texto(mensagem) ||
      'NÃO FOI POSSÍVEL CARREGAR AS EMPRESAS.';

    linhas.appendChild(
      aviso
    );
  }

  function renderizarEmpresas(empresas){
    garantirPainel();

    const linhas =
      obterLinhas();

    if(!linhas){
      return;
    }

    const lista =
      Array.isArray(empresas)
        ? empresas
        : [];

    linhas.replaceChildren();

    if(!lista.length){
      mostrarMensagem(
        'NENHUMA EMPRESA CADASTRADA EM CONFIGURACAOFISCAL.'
      );

      return;
    }

    lista.forEach(
      function(empresa){
        linhas.appendChild(
          criarLinhaEmpresa(
            empresa
          )
        );
      }
    );
  }

  function renderizarErro(mensagem){
    mostrarMensagem(
      texto(mensagem) ||
      'NÃO FOI POSSÍVEL CARREGAR AS EMPRESAS.'
    );
  }

  function gerarRequestId(){
    return [
      'superadmin-empresas',
      Date.now(),
      Math.random()
        .toString(36)
        .slice(2,8)
    ].join('-');
  }

  function solicitarEmpresas(forcar){
    if(
      !superadminDomain.active ||
      (
        carregando &&
        forcar !== true
      )
    ){
      return;
    }

    garantirPainel();

    mostrarMensagem(
      'CARREGANDO EMPRESAS...'
    );

    carregando =
      true;

    requestIdAtual =
      gerarRequestId();

    try{
      window.__scfPdvInfra.shellBridge.post(
        {
          type:
            'SCF_SUPERADMIN_EMPRESAS_LISTAR',

          requestId:
            requestIdAtual
        },
        '*'
      );
    }catch(error){
      carregando =
        false;

      requestIdAtual =
        '';

      renderizarErro(
        error &&
        error.message ||
        'Não foi possível solicitar a lista de empresas.'
      );
    }
  }

  function entrarSuperAdmin(){
    [0,80,220,500,900].forEach(
      function(atraso){
        window.setTimeout(
          function(){
            garantirPainel();
            sincronizarTitulo();
          },
          atraso
        );
      }
    );

    window.setTimeout(
      function(){
        solicitarEmpresas(
          true
        );
      },
      120
    );
  }

  function sairSuperAdmin(){
    carregando =
      false;

    requestIdAtual =
      '';

    if(tituloObserver){
      tituloObserver.disconnect();
      tituloObserver =
        null;
    }

    const titulo =
      document.getElementById(
        'scfCustomerRegistrationTitle'
      );

    if(
      titulo &&
      titulo.textContent ===
        'PAINEL ADMINISTRATIVO'
    ){
      titulo.textContent =
        'CADASTRO DE CLIENTE';
    }
  }

  superadminDomain.actions.requestCompanies =
    function(){
      solicitarEmpresas(
        true
      );
    };

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
        entrarSuperAdmin();
        return;
      }

      if(
        dados.type ===
          'SCF_WIX_READY'
      ){
        sairSuperAdmin();
        return;
      }

      if(
        !superadminDomain.active
      ){
        return;
      }

      if(
        dados.type ===
          'SCF_SUPERADMIN_EMPRESAS_RESULTADO' ||
        dados.type ===
          'SCF_SUPERADMIN_EMPRESAS_ERRO'
      ){
        if(
          !requestIdAtual ||
          texto(dados.requestId) !==
            requestIdAtual
        ){
          return;
        }

        carregando =
          false;

        requestIdAtual =
          '';

        if(
          dados.type ===
            'SCF_SUPERADMIN_EMPRESAS_RESULTADO' &&
          dados.success ===
            true
        ){
          renderizarEmpresas(
            dados.empresas
          );
        }else{
          renderizarErro(
            dados.message
          );
        }

        return;
      }

      if(
        (
          dados.type ===
            'SCF_SUPERADMIN_EMPRESA_CADASTRO_RESULTADO' ||
          dados.type ===
            'SCF_SUPERADMIN_EMPRESA_ATUALIZACAO_RESULTADO' ||
          dados.type ===
            'SCF_SUPERADMIN_CERTIFICADO_A1_RESULTADO'
        ) &&
        dados.success ===
          true
      ){
        window.setTimeout(
          function(){
            solicitarEmpresas(
              true
            );
          },
          0
        );
      }
    }
  );
})();
