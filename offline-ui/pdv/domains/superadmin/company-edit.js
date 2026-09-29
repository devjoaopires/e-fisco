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

  let empresaSelecionadaId =
    '';

  let dadosSelecionados =
    null;

  let requestIdAtualizacao =
    '';

  let atualizando =
    false;

  function texto(valor){
    return String(
      valor ?? ''
    ).trim();
  }

  function apenasDigitos(valor){
    return texto(valor)
      .replace(/\D/g,'');
  }

  function formatarCnpj(valor){
    const numeros =
      apenasDigitos(valor)
        .slice(0,14);

    return numeros
      .replace(/^(\d{2})(\d)/,'$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3')
      .replace(/\.(\d{3})(\d)/,'.$1/$2')
      .replace(/(\d{4})(\d)/,'$1-$2');
  }

  function formatarCep(valor){
    const numeros =
      apenasDigitos(valor)
        .slice(0,8);

    return numeros.replace(
      /^(\d{5})(\d)/,
      '$1-$2'
    );
  }

  function formatarTelefone(valor){
    const numeros =
      apenasDigitos(valor)
        .slice(0,11);

    if(!numeros){
      return '';
    }

    if(numeros.length <= 2){
      return '(' + numeros;
    }

    if(numeros.length <= 7){
      return '(' + numeros.slice(0,2) + ') ' + numeros.slice(2);
    }

    if(numeros.length <= 10){
      return '(' + numeros.slice(0,2) + ') ' +
        numeros.slice(2,6) + '-' + numeros.slice(6);
    }

    return '(' + numeros.slice(0,2) + ') ' +
      numeros.slice(2,7) + '-' + numeros.slice(7);
  }

  function campo(id){
    return document.getElementById(id);
  }

  function definirValor(id,valor){
    const elemento =
      campo(id);

    if(!elemento){
      return;
    }

    elemento.value =
      valor === null ||
      valor === undefined
        ? ''
        : String(valor);
  }

  function selecionarRegime(valor){
    const regime =
      campo(
        'scfSuperAdminFiscalRegimeTributario'
      );

    if(!regime){
      return;
    }

    const desejado =
      texto(valor)
        .toUpperCase();

    const opcao =
      Array.from(
        regime.options || []
      ).find(
        function(item){
          return texto(item.value)
            .toUpperCase() ===
              desejado;
        }
      );

    regime.value =
      opcao
        ? opcao.value
        : '';
  }

  function selecionarTipoAmbiente(valor){
    const tipo =
      campo(
        'scfSuperAdminFiscalTipo'
      );

    if(!tipo){
      return;
    }

    const normalizado =
      texto(valor)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'')
        .toUpperCase();

    const desejado =
      [
        '1',
        'PRODUCAO',
        'PROD'
      ].includes(normalizado)
        ? 'PRODUCAO'
        : (
            [
              '2',
              'HOMOLOGACAO',
              'HOMOLOG',
              'HOM'
            ].includes(normalizado)
              ? 'HOMOLOGACAO'
              : ''
          );

    tipo.value =
      desejado;
  }

  function marcarLinhaSelecionada(){
    document
      .querySelectorAll(
        '#scfSuperAdminCompaniesRows .scf-superadmin-company-history-row'
      )
      .forEach(
        function(linha){
          const selecionada =
            texto(
              linha.dataset.empresaId
            ) ===
              empresaSelecionadaId;

          linha.classList.toggle(
            'is-selected',
            selecionada
          );

          linha.setAttribute(
            'aria-pressed',
            selecionada
              ? 'true'
              : 'false'
          );
        }
      );
  }

  function definirModoAtualizacao(empresa){
    const empresaId =
      texto(
        empresa?.empresaId
      );

    if(!/^\d{6}$/.test(empresaId)){
      return;
    }

    empresaSelecionadaId =
      empresaId;

    dadosSelecionados =
      empresa;

    definirValor(
      'scfSuperAdminCompanyEmpresaId',
      empresaId
    );

    /* Segurança: nunca preencher a senha existente no frontend. */
    definirValor(
      'scfSuperAdminCompanySenhaAdministrador',
      ''
    );

    const senha =
      campo(
        'scfSuperAdminCompanySenhaAdministrador'
      );

    if(senha){
      senha.placeholder =
        'NOVA SENHA (OPCIONAL)';
    }

    definirValor(
      'scfSuperAdminCompanyCnpj',
      formatarCnpj(
        empresa?.cnpj
      )
    );
    definirValor(
      'scfSuperAdminCompanyInscricaoEstadual',
      empresa?.inscricaoEstadual
    );
    definirValor(
      'scfSuperAdminCompanyRazaoSocial',
      empresa?.razaoSocial
    );
    definirValor(
      'scfSuperAdminCompanyNomeFantasia',
      empresa?.nomeFantasia
    );
    definirValor(
      'scfSuperAdminCompanyCep',
      formatarCep(
        empresa?.cep
      )
    );
    definirValor(
      'scfSuperAdminCompanyLogradouro',
      empresa?.logradouro
    );
    definirValor(
      'scfSuperAdminCompanyNumero',
      empresa?.numero
    );
    definirValor(
      'scfSuperAdminCompanyComplemento',
      empresa?.complemento
    );
    definirValor(
      'scfSuperAdminCompanyBairro',
      empresa?.bairro
    );
    definirValor(
      'scfSuperAdminCompanyMunicipio',
      empresa?.municipio
    );
    definirValor(
      'scfSuperAdminCompanyCodigoMunicipio',
      empresa?.codigoMunicipio
    );
    definirValor(
      'scfSuperAdminCompanyUf',
      texto(
        empresa?.uf
      ).toUpperCase()
    );
    definirValor(
      'scfSuperAdminCompanyEmail',
      empresa?.email
    );
    definirValor(
      'scfSuperAdminCompanyTelefone',
      formatarTelefone(
        empresa?.whatsapp
      )
    );

    selecionarRegime(
      empresa?.regimeTributario
    );

    selecionarTipoAmbiente(
      empresa?.ambiente
    );

    definirValor(
      'scfSuperAdminFiscalCrt',
      empresa?.crt ?? ''
    );
    definirValor(
      'scfSuperAdminFiscalSerieNfce',
      empresa?.serieNfce ?? ''
    );
    definirValor(
      'scfSuperAdminFiscalSerieNfe55',
      empresa?.serieNfe55 ?? ''
    );
    definirValor(
      'scfSuperAdminFiscalProximoNumeroNfceProducao',
      empresa?.proximoNumeroNfceProducao ?? ''
    );
    definirValor(
      'scfSuperAdminFiscalProximoNumeroNfe55Producao',
      empresa?.proximoNumeroNfe55Producao ?? ''
    );

    const titulo =
      campo(
        'scfSuperAdminCompanyTitle'
      );

    if(titulo){
      titulo.textContent =
        'ATUALIZAR EMPRESA';
    }

    const botao =
      campo(
        'scfSuperAdminCompanySubmit'
      );

    if(botao){
      botao.textContent =
        'ATUALIZAR';
      botao.disabled =
        false;
    }

    /* Volta para DADOS EMPRESA ao selecionar uma empresa. */
    const dadosPanel =
      campo(
        'scfSuperAdminCompanyDataPanel'
      );
    const fiscalPanel =
      campo(
        'scfSuperAdminCompanyFiscalPanel'
      );
    const botaoFiscal =
      campo(
        'scfSuperAdminCompanyFiscalButton'
      );

    if(dadosPanel){
      dadosPanel.classList.add(
        'is-active'
      );
    }

    if(fiscalPanel){
      fiscalPanel.classList.remove(
        'is-active'
      );
    }

    if(botaoFiscal){
      botaoFiscal.classList.remove(
        'is-active'
      );
      botaoFiscal.setAttribute(
        'aria-pressed',
        'false'
      );
      botaoFiscal.textContent =
        'DADOS FISCAIS';
    }

    marcarLinhaSelecionada();
  }

  function resetarModoAtualizacao(){
    empresaSelecionadaId =
      '';
    dadosSelecionados =
      null;
    requestIdAtualizacao =
      '';
    atualizando =
      false;

    const titulo =
      campo(
        'scfSuperAdminCompanyTitle'
      );

    if(titulo){
      titulo.textContent =
        'CADASTRAR NOVA EMPRESA';
    }

    const senha =
      campo(
        'scfSuperAdminCompanySenhaAdministrador'
      );

    if(senha){
      senha.placeholder =
        'SENHA';
    }

    marcarLinhaSelecionada();
  }

  function gerarRequestId(){
    return [
      'superadmin-empresa-atualizar',
      Date.now(),
      Math.random()
        .toString(36)
        .slice(2,8)
    ].join('-');
  }

  function coletarDadosFormulario(){
    function valor(id){
      const elemento =
        campo(id);

      return elemento
        ? texto(elemento.value)
        : '';
    }

    return {
      empresaId:
        valor('scfSuperAdminCompanyEmpresaId'),
      senhaAdministrador:
        valor('scfSuperAdminCompanySenhaAdministrador'),
      razaoSocial:
        valor('scfSuperAdminCompanyRazaoSocial'),
      nomeFantasia:
        valor('scfSuperAdminCompanyNomeFantasia'),
      cnpj:
        valor('scfSuperAdminCompanyCnpj'),
      inscricaoEstadual:
        valor('scfSuperAdminCompanyInscricaoEstadual'),
      cep:
        valor('scfSuperAdminCompanyCep'),
      logradouro:
        valor('scfSuperAdminCompanyLogradouro'),
      numero:
        valor('scfSuperAdminCompanyNumero'),
      complemento:
        valor('scfSuperAdminCompanyComplemento'),
      bairro:
        valor('scfSuperAdminCompanyBairro'),
      municipio:
        valor('scfSuperAdminCompanyMunicipio'),
      codigoMunicipio:
        valor('scfSuperAdminCompanyCodigoMunicipio'),
      uf:
        valor('scfSuperAdminCompanyUf'),
      email:
        valor('scfSuperAdminCompanyEmail'),
      whatsapp:
        valor('scfSuperAdminCompanyTelefone'),
      regimeTributario:
        valor('scfSuperAdminFiscalRegimeTributario'),
      ambiente:
        valor('scfSuperAdminFiscalTipo'),
      crt:
        valor('scfSuperAdminFiscalCrt'),
      serieNfce:
        valor('scfSuperAdminFiscalSerieNfce'),
      serieNfe55:
        valor('scfSuperAdminFiscalSerieNfe55'),
      proximoNumeroNfceProducao:
        valor('scfSuperAdminFiscalProximoNumeroNfceProducao'),
      proximoNumeroNfe55Producao:
        valor('scfSuperAdminFiscalProximoNumeroNfe55Producao')
    };
  }

  function enviarAtualizacao(event){
    if(
      !empresaSelecionadaId ||
      atualizando
    ){
      return;
    }

    const botao =
      event &&
      event.target &&
      event.target.closest
        ? event.target.closest(
            '#scfSuperAdminCompanySubmit'
          )
        : null;

    if(!botao){
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const dados =
      coletarDadosFormulario();

    if(
      dados.empresaId !==
        empresaSelecionadaId
    ){
      window.alert(
        'O ID EMPRESA SELECIONADO NÃO PODE SER ALTERADO.'
      );
      return;
    }

    if(
      ![
        'PRODUCAO',
        'HOMOLOGACAO'
      ].includes(
        texto(dados.ambiente)
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g,'')
          .toUpperCase()
      )
    ){
      window.alert(
        'SELECIONE O TIPO: PRODUÇÃO OU HOMOLOGAÇÃO.'
      );
      return;
    }

    atualizando =
      true;

    requestIdAtualizacao =
      gerarRequestId();

    botao.textContent =
      'ATUALIZANDO...';
    botao.disabled =
      true;

    try{
      window.__scfPdvInfra.shellBridge.post(
        {
          type:
            'SCF_SUPERADMIN_EMPRESA_ATUALIZAR',
          requestId:
            requestIdAtualizacao,
          dados
        },
        '*'
      );
    }catch(error){
      atualizando =
        false;
      requestIdAtualizacao =
        '';
      botao.textContent =
        'ATUALIZAR';
      botao.disabled =
        false;

      window.alert(
        'NÃO FOI POSSÍVEL ENVIAR A ATUALIZAÇÃO DA EMPRESA.'
      );
    }
  }

  function tratarCliqueLista(event){
    const linha =
      event &&
      event.target &&
      event.target.closest
        ? event.target.closest(
            '#scfSuperAdminCompaniesRows .scf-superadmin-company-history-row'
          )
        : null;

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

    if(event.type === 'keydown'){
      event.preventDefault();
    }

    const empresa =
      linha.__scfEmpresaDados;

    if(!empresa){
      return;
    }

    definirModoAtualizacao(
      empresa
    );
  }

  function tratarRetorno(event){
    const dados =
      event &&
      event.data &&
      typeof event.data ===
        'object'
        ? event.data
        : null;

    if(
      !dados ||
      (
        dados.type !==
          'SCF_SUPERADMIN_EMPRESA_ATUALIZACAO_RESULTADO' &&
        dados.type !==
          'SCF_SUPERADMIN_EMPRESA_ATUALIZACAO_ERRO'
      )
    ){
      return;
    }

    if(
      !requestIdAtualizacao ||
      texto(dados.requestId) !==
        requestIdAtualizacao
    ){
      return;
    }

    atualizando =
      false;
    requestIdAtualizacao =
      '';

    const botao =
      campo(
        'scfSuperAdminCompanySubmit'
      );

    if(
      dados.type ===
        'SCF_SUPERADMIN_EMPRESA_ATUALIZACAO_RESULTADO' &&
      dados.success ===
        true
    ){
      if(botao){
        botao.textContent =
          'ATUALIZAR';
        botao.disabled =
          false;
      }

      /*
       * Se um novo A1 tiver sido selecionado durante a edição, reutiliza
       * o fluxo já aprovado de envio do certificado para o mesmo tenant.
       */
      const certificadoAssumiu =
        typeof superadminDomain.actions.afterCompanySuccess ===
          'function'
          ? superadminDomain.actions.afterCompanySuccess({
              empresaId:
                empresaSelecionadaId
            }) === true
          : false;

      if(!certificadoAssumiu){
        const limpar =
          superadminDomain.actions.clearCompanyForm;

        if(typeof limpar === 'function'){
          limpar();
        }

        resetarModoAtualizacao();
      }

      window.alert(
        texto(dados.message) ||
        'EMPRESA ATUALIZADA COM SUCESSO.'
      );

      return;
    }

    if(botao){
      botao.textContent =
        'ATUALIZAR';
      botao.disabled =
        false;
    }

    window.alert(
      texto(dados.message) ||
      'NÃO FOI POSSÍVEL ATUALIZAR A EMPRESA.'
    );
  }

  /*
   * Como as linhas são recriadas a cada atualização da lista,
   * usa delegação no documento e reaplica a seleção após renderização.
   */
  document.addEventListener(
    'click',
    tratarCliqueLista
  );

  document.addEventListener(
    'keydown',
    tratarCliqueLista
  );

  document.addEventListener(
    'click',
    enviarAtualizacao,
    true
  );

  window.__scfPdvInfra.shellBridge.onMessage(
    function(event){
      tratarRetorno(event);

      const dados =
        event &&
        event.data &&
        typeof event.data ===
          'object'
          ? event.data
          : null;

      if(
        dados &&
        dados.type ===
          'SCF_SUPERADMIN_CERTIFICADO_A1_RESULTADO' &&
        dados.success ===
          true &&
        empresaSelecionadaId
      ){
        resetarModoAtualizacao();
      }

      if(
        dados &&
        dados.type ===
          'SCF_SUPERADMIN_EMPRESAS_RESULTADO' &&
        dados.success ===
          true &&
        empresaSelecionadaId
      ){
        const lista =
          Array.isArray(dados.empresas)
            ? dados.empresas
            : [];

        const atual =
          lista.find(
            function(item){
              return texto(
                item?.empresaId
              ) ===
                empresaSelecionadaId;
            }
          );

        if(atual){
          dadosSelecionados =
            atual;
          window.setTimeout(
            function(){
              marcarLinhaSelecionada();
            },
            0
          );
        }
      }
    }
  );

  /* PASSO 92 — permite ao controle visual fechar a edição sem salvar. */
  superadminDomain.actions.resetUpdateMode =
    resetarModoAtualizacao;
})();
