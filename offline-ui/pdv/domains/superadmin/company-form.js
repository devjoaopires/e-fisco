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

  let cadastroEmpresaEmAndamento =
    false;

  let cadastroEmpresaRequestId =
    '';

  let cadastroEmpresaConcluido =
    false;

  let consultaCepEmpresaTimer =
    null;

  let ultimoCepEmpresaConsultado =
    '';

  let sequenciaConsultaCepEmpresa =
    0;

  let consultaCnpjEmpresaTimer =
    null;

  let consultaCnpjEmpresaRequestId =
    '';

  let consultaCnpjEmpresaEmAndamento =
    false;

  let ultimoCnpjEmpresaConsultado =
    '';

  const idsEmpresaGeradosNestaTela =
    new Set();

  function gerarEmpresaIdAleatorioLocal(){
    let tentativa = 0;

    while(tentativa < 100){
      tentativa += 1;

      let numero;

      try{
        if(
          window.crypto &&
          typeof window.crypto.getRandomValues === 'function'
        ){
          const buffer =
            new Uint32Array(1);

          window.crypto.getRandomValues(buffer);

          numero =
            Number(buffer[0] % 1000000);
        }else{
          numero =
            Math.floor(Math.random() * 1000000);
        }
      }catch(error){
        numero =
          Math.floor(Math.random() * 1000000);
      }

      const empresaId =
        String(numero)
          .padStart(6,'0');

      if(
        !idsEmpresaGeradosNestaTela.has(empresaId)
      ){
        idsEmpresaGeradosNestaTela.add(empresaId);
        return empresaId;
      }
    }

    throw new Error(
      'Não foi possível gerar um ID EMPRESA nesta tela.'
    );
  }

  function preencherEmpresaIdAleatorio(forcarNovo){
    const campo =
      document.getElementById(
        'scfSuperAdminCompanyEmpresaId'
      );

    if(!campo){
      return '';
    }

    const atual =
      String(campo.value || '')
        .replace(/\D/g,'')
        .slice(0,6);

    if(
      forcarNovo !== true &&
      /^\d{6}$/.test(atual)
    ){
      campo.value = atual;
      return atual;
    }

    const novo =
      gerarEmpresaIdAleatorioLocal();

    campo.value = novo;
    return novo;
  }

  function garantirFormularioEmpresa(){
    const frame =
      document.querySelector(
        '#fiscalDesktopProductPhoto .fiscal-desktop-product-photo-frame'
      );

    if(!frame){
      return false;
    }

    if(
      document.getElementById(
        'scfSuperAdminCompanyForm'
      )
    ){
      return true;
    }

    const form =
      document.createElement(
        'div'
      );

    form.id =
      'scfSuperAdminCompanyForm';

    form.setAttribute(
      'aria-label',
      'Cadastro de empresa no SUPERADMIN'
    );

    form.innerHTML =
      ''
      + '<h2 id="scfSuperAdminCompanyTitle">CADASTRAR NOVA EMPRESA</h2>'
      + '<div id="scfSuperAdminCompanyDataPanel" class="scf-superadmin-company-panel is-active">'
      +   '<div class="scf-superadmin-company-row">'
      +     '<input id="scfSuperAdminCompanyEmpresaId" class="scf-superadmin-company-field scf-superadmin-company-id-field" type="text" inputmode="numeric" maxlength="6" placeholder="ID EMPRESA" aria-label="ID Empresa" readonly>'
      +     '<input id="scfSuperAdminCompanySenhaAdministrador" class="scf-superadmin-company-field" type="password" maxlength="80" placeholder="SENHA" aria-label="Senha Administrador" autocomplete="new-password">'
      +   '</div>'
      +   '<div class="scf-superadmin-company-row">'
      +     '<input id="scfSuperAdminCompanyCnpj" class="scf-superadmin-company-field" type="text" inputmode="numeric" maxlength="18" placeholder="00.000.000/0000-00" aria-label="CNPJ">'
      +     '<input id="scfSuperAdminCompanyInscricaoEstadual" class="scf-superadmin-company-field" type="text" maxlength="30" placeholder="INSC. ESTADUAL" aria-label="Inscrição Estadual">'
      +   '</div>'
      +   '<input id="scfSuperAdminCompanyRazaoSocial" class="scf-superadmin-company-field" type="text" maxlength="160" placeholder="RAZÃO SOCIAL" aria-label="Razão Social">'
      +   '<input id="scfSuperAdminCompanyNomeFantasia" class="scf-superadmin-company-field" type="text" maxlength="160" placeholder="NOME FANTASIA" aria-label="Nome Fantasia">'
      +   '<input id="scfSuperAdminCompanyCep" class="scf-superadmin-company-field" type="text" inputmode="numeric" maxlength="9" placeholder="00000-000" aria-label="CEP">'
      +   '<input id="scfSuperAdminCompanyLogradouro" class="scf-superadmin-company-field" type="text" maxlength="180" placeholder="LOGRADOURO" aria-label="Logradouro">'
      +   '<div class="scf-superadmin-company-number-complement-row">'
      +     '<input id="scfSuperAdminCompanyNumero" class="scf-superadmin-company-field scf-superadmin-company-number-field" type="text" inputmode="numeric" maxlength="20" placeholder="NÚMERO" aria-label="Número">'
      +     '<input id="scfSuperAdminCompanyComplemento" class="scf-superadmin-company-field" type="text" maxlength="120" placeholder="COMPLEMENTO" aria-label="Complemento">'
      +   '</div>'
      +   '<input id="scfSuperAdminCompanyBairro" class="scf-superadmin-company-field" type="text" maxlength="120" placeholder="BAIRRO" aria-label="Bairro">'
      +   '<div class="scf-superadmin-company-city-uf-row">'
      +     '<input id="scfSuperAdminCompanyMunicipio" class="scf-superadmin-company-field" type="text" maxlength="120" placeholder="CIDADE" aria-label="Cidade">'
      +     '<input id="scfSuperAdminCompanyUf" class="scf-superadmin-company-field scf-superadmin-company-uf-field" type="text" maxlength="2" placeholder="UF" aria-label="UF">'
      +   '</div>'
      +   '<input id="scfSuperAdminCompanyCodigoMunicipio" type="hidden" value="" aria-hidden="true">'
      + '</div>'
      + '<div id="scfSuperAdminCompanyFiscalPanel" class="scf-superadmin-company-panel">'
      +   '<div class="scf-superadmin-company-row">'
      +     '<select id="scfSuperAdminFiscalRegimeTributario" class="scf-superadmin-company-select" aria-label="Regime Tributário">'
      +       '<option value="" selected disabled>REGIME TRIBUTÁRIO</option>'
      +       '<option value="MEI" data-crt="4">MEI</option>'
      +       '<option value="LUCRO REAL" data-crt="3">LUCRO REAL</option>'
      +       '<option value="SIMPLES NACIONAL" data-crt="1">SIMPLES NACIONAL</option>'
      +       '<option value="LUCRO PRESUMIDO" data-crt="3">LUCRO PRESUMIDO</option>'
      +     '</select>'
      +     '<select id="scfSuperAdminFiscalTipo" class="scf-superadmin-company-select" aria-label="Tipo de ambiente fiscal">'
      +       '<option value="" selected disabled>TIPO</option>'
      +       '<option value="PRODUCAO">PRODUÇÃO</option>'
      +       '<option value="HOMOLOGACAO">HOMOLOGAÇÃO</option>'
      +     '</select>'
      +   '</div>'
      +   '<div class="scf-superadmin-company-row-three">'
      +     '<input id="scfSuperAdminFiscalCrt" class="scf-superadmin-company-field" type="text" maxlength="1" placeholder="CRT" aria-label="CRT preenchido automaticamente" readonly>'
      +     '<input id="scfSuperAdminFiscalSerieNfce" class="scf-superadmin-company-field" type="text" inputmode="numeric" maxlength="10" placeholder="SÉRIE NFC" aria-label="Série NFC-e">'
      +     '<input id="scfSuperAdminFiscalSerieNfe55" class="scf-superadmin-company-field" type="text" inputmode="numeric" maxlength="10" placeholder="SÉRIE NF" aria-label="Série NF-e">'
      +   '</div>'
      +   '<div class="scf-superadmin-company-row">'
      +     '<input id="scfSuperAdminFiscalProximoNumeroNfceProducao" class="scf-superadmin-company-field" type="text" inputmode="numeric" maxlength="12" placeholder="PRÓX. Nº NFC-e" aria-label="Próximo número NFC-e produção">'
      +     '<input id="scfSuperAdminFiscalProximoNumeroNfe55Producao" class="scf-superadmin-company-field" type="text" inputmode="numeric" maxlength="12" placeholder="PRÓX. Nº NF-e" aria-label="Próximo número NF-e 55 produção">'
      +   '</div>'
      + '</div>'
      + '<div class="scf-superadmin-company-actions">'
      +   '<button id="scfSuperAdminCompanyFiscalButton" class="scf-superadmin-company-stage-btn" type="button" aria-pressed="false">DADOS FISCAIS</button>'
      +   '<button id="scfSuperAdminCompanyClear" class="scf-superadmin-company-stage-btn" type="button">LIMPAR</button>'
      +   '<button id="scfSuperAdminCompanySubmit" class="scf-superadmin-company-stage-btn scf-superadmin-company-submit-btn" type="button">CADASTRAR</button>'
      + '</div>';

    frame.appendChild(
      form
    );

    preencherEmpresaIdAleatorio(false);
    sincronizarAlturaPaineisEmpresa();

    return true;
  }

  function sincronizarAlturaPaineisEmpresa(){
    const dados =
      document.getElementById('scfSuperAdminCompanyDataPanel');
    const fiscais =
      document.getElementById('scfSuperAdminCompanyFiscalPanel');
    const acoes =
      document.querySelector(
        '#scfSuperAdminCompanyForm .scf-superadmin-company-actions'
      );

    if(!dados || !fiscais || !acoes){
      return;
    }

    window.requestAnimationFrame(function(){
      if(!dados.classList.contains('is-active')){
        return;
      }

      dados.style.height = '';
      fiscais.style.height = '';

      const topoDados =
        dados.getBoundingClientRect().top;
      const topoAcoes =
        acoes.getBoundingClientRect().top;
      const altura =
        Math.round(topoAcoes - topoDados);

      if(altura > 0){
        const alturaCss =
          String(altura) + 'px';

        dados.style.height = alturaCss;
        fiscais.style.height = alturaCss;
      }
    });
  }

  function formatarCnpj(valor){
    const numeros =
      String(valor || '')
        .replace(/\D/g,'')
        .slice(0,14);

    return numeros
      .replace(/^(\d{2})(\d)/,'$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3')
      .replace(/\.(\d{3})(\d)/,'.$1/$2')
      .replace(/(\d{4})(\d)/,'$1-$2');
  }

  function formatarCep(valor){
    const numeros =
      String(valor || '')
        .replace(/\D/g,'')
        .slice(0,8);

    return numeros.replace(/^(\d{5})(\d)/,'$1-$2');
  }

  function gerarRequestIdConsultaCnpjEmpresa(){
    return [
      'superadmin-cnpj',
      Date.now(),
      Math.random()
        .toString(36)
        .slice(2,8)
    ].join('-');
  }

  function camposEmpresaAutopreenchiveisSintegrapi(){
    return [
      'scfSuperAdminCompanyInscricaoEstadual',
      'scfSuperAdminCompanyRazaoSocial',
      'scfSuperAdminCompanyNomeFantasia',
      'scfSuperAdminCompanyCep',
      'scfSuperAdminCompanyLogradouro',
      'scfSuperAdminCompanyNumero',
      'scfSuperAdminCompanyComplemento',
      'scfSuperAdminCompanyBairro',
      'scfSuperAdminCompanyMunicipio',
      'scfSuperAdminCompanyUf',
      'scfSuperAdminCompanyCodigoMunicipio',
      'scfSuperAdminCompanyEmail',
      'scfSuperAdminCompanyTelefone',
      'scfSuperAdminFiscalRegimeTributario',
      'scfSuperAdminFiscalCrt'
    ]
      .map(function(id){
        return document.getElementById(id);
      })
      .filter(Boolean);
  }

  function limparDadosAutomaticosCnpjEmpresa(){
    camposEmpresaAutopreenchiveisSintegrapi()
      .forEach(function(campo){
        if(
          campo.dataset &&
          campo.dataset.scfSintegrapiAuto === '1'
        ){
          campo.value = '';
          campo.dataset.scfSintegrapiAuto = '0';
        }
      });
  }

  function preencherCampoSintegrapi(id,valor,formatador){
    const campo =
      document.getElementById(id);

    if(!campo){
      return;
    }

    let texto =
      String(valor || '').trim();

    if(typeof formatador === 'function'){
      texto = formatador(texto);
    }

    campo.value = texto;

    if(campo.dataset){
      campo.dataset.scfSintegrapiAuto =
        texto ? '1' : '0';
    }
  }

  function solicitarConsultaCnpjEmpresa(cnpj){
    if(
      !modoSuperAdminAtivo() ||
      cnpj.length !== 14 ||
      consultaCnpjEmpresaEmAndamento ||
      cnpj === ultimoCnpjEmpresaConsultado
    ){
      return;
    }

    const campoCnpj =
      document.getElementById(
        'scfSuperAdminCompanyCnpj'
      );

    const campoIe =
      document.getElementById(
        'scfSuperAdminCompanyInscricaoEstadual'
      );

    consultaCnpjEmpresaRequestId =
      gerarRequestIdConsultaCnpjEmpresa();

    consultaCnpjEmpresaEmAndamento =
      true;

    if(campoCnpj){
      campoCnpj.setAttribute(
        'aria-busy',
        'true'
      );
    }

    try{
      window.__scfPdvInfra.shellBridge.post(
        {
          type:
            'SCF_SUPERADMIN_EMPRESA_CNPJ_CONSULTAR',

          requestId:
            consultaCnpjEmpresaRequestId,

          cnpj,

          inscricaoEstadual:
            campoIe
              ? String(campoIe.value || '').trim()
              : ''
        },
        '*'
      );
    }catch(error){
      consultaCnpjEmpresaEmAndamento =
        false;

      consultaCnpjEmpresaRequestId =
        '';

      if(campoCnpj){
        campoCnpj.removeAttribute(
          'aria-busy'
        );
      }

      console.error(
        '[SUPERADMIN] Falha ao solicitar consulta do CNPJ:',
        error && error.message || error
      );
    }
  }

  function agendarConsultaCnpjEmpresa(cnpj){
    if(consultaCnpjEmpresaTimer){
      window.clearTimeout(
        consultaCnpjEmpresaTimer
      );
      consultaCnpjEmpresaTimer = null;
    }

    if(cnpj.length !== 14){
      return;
    }

    if(cnpj === ultimoCnpjEmpresaConsultado){
      return;
    }

    consultaCnpjEmpresaTimer =
      window.setTimeout(
        function(){
          consultaCnpjEmpresaTimer = null;
          solicitarConsultaCnpjEmpresa(cnpj);
        },
        350
      );
  }

  function tratarRetornoConsultaCnpjEmpresa(event){
    const mensagem =
      event &&
      event.data &&
      typeof event.data === 'object'
        ? event.data
        : null;

    if(!mensagem){
      return;
    }

    if(
      mensagem.type !==
        'SCF_SUPERADMIN_EMPRESA_CNPJ_RESULTADO' &&
      mensagem.type !==
        'SCF_SUPERADMIN_EMPRESA_CNPJ_ERRO'
    ){
      return;
    }

    const requestId =
      String(
        mensagem.requestId || ''
      ).trim();

    if(
      !consultaCnpjEmpresaRequestId ||
      requestId !== consultaCnpjEmpresaRequestId
    ){
      return;
    }

    const campoCnpj =
      document.getElementById(
        'scfSuperAdminCompanyCnpj'
      );

    const cnpjAtual =
      campoCnpj
        ? String(campoCnpj.value || '')
            .replace(/\D/g,'')
            .slice(0,14)
        : '';

    consultaCnpjEmpresaEmAndamento =
      false;

    consultaCnpjEmpresaRequestId =
      '';

    if(campoCnpj){
      campoCnpj.removeAttribute(
        'aria-busy'
      );
    }

    if(
      mensagem.type ===
        'SCF_SUPERADMIN_EMPRESA_CNPJ_ERRO' ||
      mensagem.success !== true
    ){
      const erro =
        String(
          mensagem.message ||
          'Não foi possível consultar o CNPJ.'
        ).trim();

      console.warn(
        '[SUPERADMIN] Consulta de CNPJ não concluída:',
        erro
      );

      return;
    }

    const dados =
      mensagem.dados &&
      typeof mensagem.dados === 'object'
        ? mensagem.dados
        : {};

    const cnpjRetornado =
      String(dados.cnpj || '')
        .replace(/\D/g,'')
        .slice(0,14);

    if(
      cnpjAtual.length !== 14 ||
      (cnpjRetornado && cnpjRetornado !== cnpjAtual)
    ){
      return;
    }

    preencherCampoSintegrapi(
      'scfSuperAdminCompanyInscricaoEstadual',
      dados.inscricaoEstadual
    );

    preencherCampoSintegrapi(
      'scfSuperAdminCompanyRazaoSocial',
      dados.razaoSocial
    );

    preencherCampoSintegrapi(
      'scfSuperAdminCompanyNomeFantasia',
      dados.nomeFantasia
    );

    preencherCampoSintegrapi(
      'scfSuperAdminCompanyCep',
      dados.cep,
      formatarCep
    );

    preencherCampoSintegrapi(
      'scfSuperAdminCompanyLogradouro',
      dados.logradouro
    );

    preencherCampoSintegrapi(
      'scfSuperAdminCompanyNumero',
      dados.numero
    );

    preencherCampoSintegrapi(
      'scfSuperAdminCompanyComplemento',
      dados.complemento
    );

    preencherCampoSintegrapi(
      'scfSuperAdminCompanyBairro',
      dados.bairro
    );

    preencherCampoSintegrapi(
      'scfSuperAdminCompanyMunicipio',
      dados.municipio
    );

    preencherCampoSintegrapi(
      'scfSuperAdminCompanyUf',
      dados.uf,
      function(valor){
        return String(valor || '')
          .replace(/[^A-Za-z]/g,'')
          .slice(0,2)
          .toUpperCase();
      }
    );

    preencherCampoSintegrapi(
      'scfSuperAdminCompanyCodigoMunicipio',
      String(dados.codigoMunicipio || '')
        .replace(/\D/g,'')
        .slice(0,7)
    );

    preencherCampoSintegrapi(
      'scfSuperAdminCompanyEmail',
      dados.email,
      function(valor){
        return String(valor || '')
          .trim()
          .toLowerCase();
      }
    );

    preencherCampoSintegrapi(
      'scfSuperAdminCompanyTelefone',
      dados.whatsapp,
      function(valor){
        const numeros =
          String(valor || '')
            .replace(/\D/g,'')
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
    );

    preencherCampoSintegrapi(
      'scfSuperAdminFiscalRegimeTributario',
      dados.regimeTributario
    );

    preencherCampoSintegrapi(
      'scfSuperAdminFiscalCrt',
      dados.crt === null || dados.crt === undefined
        ? ''
        : String(dados.crt)
    );

    const cepConsultado =
      String(dados.cep || '')
        .replace(/\D/g,'')
        .slice(0,8);

    if(cepConsultado.length === 8){
      ultimoCepEmpresaConsultado =
        cepConsultado;
    }

    ultimoCnpjEmpresaConsultado =
      cnpjAtual;

    console.log(
      '[SUPERADMIN] Dados cadastrais preenchidos pela SintegrAPI.'
    );
  }

  function consultarCepEmpresaViaCep(cep){
    return new Promise(function(resolve,reject){
      const numeroConsulta =
        ++sequenciaConsultaCepEmpresa;

      const nomeCallback =
        '__scfViaCepSuperAdmin_' +
        Date.now() +
        '_' +
        numeroConsulta;

      const script =
        document.createElement('script');

      let encerrado =
        false;

      const timeout =
        window.setTimeout(
          function(){
            finalizar(
              new Error(
                'A consulta do CEP demorou demais.'
              )
            );
          },
          8000
        );

      function limpar(){
        window.clearTimeout(timeout);

        try{
          delete window[nomeCallback];
        }catch(error){
          window[nomeCallback] = undefined;
        }

        if(script && script.parentNode){
          script.parentNode.removeChild(script);
        }
      }

      function finalizar(erro,dados){
        if(encerrado){
          return;
        }

        encerrado = true;
        limpar();

        if(erro){
          reject(erro);
          return;
        }

        resolve(dados);
      }

      window[nomeCallback] =
        function(dados){
          finalizar(null,dados);
        };

      script.async = true;
      script.onerror =
        function(){
          finalizar(
            new Error(
              'Não foi possível consultar o CEP.'
            )
          );
        };

      script.src =
        'https://viacep.com.br/ws/' +
        encodeURIComponent(cep) +
        '/json/?callback=' +
        encodeURIComponent(nomeCallback);

      document.body.appendChild(script);
    });
  }

  async function buscarLogradouroEmpresaPeloCep(cep){
    const campoCep =
      document.getElementById(
        'scfSuperAdminCompanyCep'
      );

    const camposEndereco = [
      ['scfSuperAdminCompanyLogradouro','logradouro'],
      ['scfSuperAdminCompanyBairro','bairro'],
      ['scfSuperAdminCompanyMunicipio','localidade'],
      ['scfSuperAdminCompanyUf','uf'],
      ['scfSuperAdminCompanyCodigoMunicipio','ibge']
    ].map(function(item){
      return {
        campo:document.getElementById(item[0]),
        chave:item[1]
      };
    });

    if(
      !campoCep ||
      !camposEndereco[0].campo ||
      cep.length !== 8
    ){
      return;
    }

    campoCep.setAttribute(
      'aria-busy',
      'true'
    );

    try{
      const dados =
        await consultarCepEmpresaViaCep(cep);

      if(
        String(campoCep.value || '')
          .replace(/\D/g,'') !== cep
      ){
        return;
      }

      if(
        !dados ||
        dados.erro === true
      ){
        const codigoMunicipio =
          document.getElementById(
            'scfSuperAdminCompanyCodigoMunicipio'
          );

        if(codigoMunicipio){
          codigoMunicipio.value = '';
          codigoMunicipio.dataset.scfViaCepAuto = '0';
        }

        ultimoCepEmpresaConsultado = '';
        return;
      }

      camposEndereco.forEach(function(item){
        if(!item.campo){
          return;
        }

        item.campo.value =
          String(dados[item.chave] || '').trim();

        item.campo.dataset.scfViaCepAuto =
          item.campo.value
            ? '1'
            : '0';

        item.campo.dispatchEvent(
          new Event(
            'input',
            { bubbles:true }
          )
        );
      });

      ultimoCepEmpresaConsultado =
        cep;
    }catch(error){
      console.warn(
        '[SUPERADMIN] Consulta automática de CEP indisponível:',
        error && error.message || error
      );
    }finally{
      campoCep.removeAttribute(
        'aria-busy'
      );
    }
  }

  function agendarBuscaLogradouroEmpresa(cep){
    if(consultaCepEmpresaTimer){
      window.clearTimeout(
        consultaCepEmpresaTimer
      );
      consultaCepEmpresaTimer = null;
    }

    if(cep.length !== 8){
      return;
    }

    if(cep === ultimoCepEmpresaConsultado){
      return;
    }

    consultaCepEmpresaTimer =
      window.setTimeout(
        function(){
          consultaCepEmpresaTimer = null;
          buscarLogradouroEmpresaPeloCep(cep);
        },
        300
      );
  }

  function prepararMascaras(){
    const cnpj =
      document.getElementById(
        'scfSuperAdminCompanyCnpj'
      );

    const cep =
      document.getElementById(
        'scfSuperAdminCompanyCep'
      );

    const logradouro =
      document.getElementById(
        'scfSuperAdminCompanyLogradouro'
      );

    const bairro =
      document.getElementById(
        'scfSuperAdminCompanyBairro'
      );

    const municipio =
      document.getElementById(
        'scfSuperAdminCompanyMunicipio'
      );

    const uf =
      document.getElementById(
        'scfSuperAdminCompanyUf'
      );

    const codigoMunicipio =
      document.getElementById(
        'scfSuperAdminCompanyCodigoMunicipio'
      );

    const camposEnderecoAutomatico =
      [logradouro,bairro,municipio,uf]
        .filter(Boolean);

    if(cnpj && cnpj.dataset.scfMaskReady !== '1'){
      cnpj.dataset.scfMaskReady = '1';
      cnpj.addEventListener('input',function(){
        const anterior =
          ultimoCnpjEmpresaConsultado;

        cnpj.value = formatarCnpj(cnpj.value);

        const numeros =
          String(cnpj.value || '')
            .replace(/\D/g,'')
            .slice(0,14);

        if(
          anterior &&
          numeros !== anterior
        ){
          limparDadosAutomaticosCnpjEmpresa();
          ultimoCnpjEmpresaConsultado = '';
        }

        agendarConsultaCnpjEmpresa(numeros);
      });

      cnpj.addEventListener('blur',function(){
        const numeros =
          String(cnpj.value || '')
            .replace(/\D/g,'')
            .slice(0,14);

        agendarConsultaCnpjEmpresa(numeros);
      });
    }

    if(cep && cep.dataset.scfMaskReady !== '1'){
      cep.dataset.scfMaskReady = '1';
      cep.addEventListener('input',function(){
        const cepAnterior =
          ultimoCepEmpresaConsultado;

        cep.value = formatarCep(cep.value);

        const numeros =
          String(cep.value || '')
            .replace(/\D/g,'')
            .slice(0,8);

        if(
          cepAnterior &&
          numeros !== cepAnterior
        ){
          camposEnderecoAutomatico.forEach(function(campo){
            if(campo.dataset.scfViaCepAuto === '1'){
              campo.value = '';
              campo.dataset.scfViaCepAuto = '0';
            }
          });

          if(codigoMunicipio){
            codigoMunicipio.value = '';
            codigoMunicipio.dataset.scfViaCepAuto = '0';
          }

          ultimoCepEmpresaConsultado = '';
        }

        agendarBuscaLogradouroEmpresa(numeros);
      });

      cep.addEventListener('blur',function(){
        const numeros =
          String(cep.value || '')
            .replace(/\D/g,'')
            .slice(0,8);

        agendarBuscaLogradouroEmpresa(numeros);
      });
    }

    camposEnderecoAutomatico.forEach(function(campo){
      if(campo.dataset.scfViaCepManualReady === '1'){
        return;
      }

      campo.dataset.scfViaCepManualReady = '1';
      campo.addEventListener('input',function(){
        if(document.activeElement === campo){
          campo.dataset.scfViaCepAuto = '0';
          campo.dataset.scfSintegrapiAuto = '0';
        }
      });
    });

    [
      document.getElementById('scfSuperAdminCompanyInscricaoEstadual'),
      document.getElementById('scfSuperAdminCompanyRazaoSocial'),
      document.getElementById('scfSuperAdminCompanyNomeFantasia'),
      document.getElementById('scfSuperAdminCompanyNumero'),
      document.getElementById('scfSuperAdminCompanyComplemento')
    ]
      .filter(Boolean)
      .forEach(function(campo){
        if(campo.dataset.scfSintegrapiManualReady === '1'){
          return;
        }

        campo.dataset.scfSintegrapiManualReady = '1';
        campo.addEventListener('input',function(){
          if(document.activeElement === campo){
            campo.dataset.scfSintegrapiAuto = '0';
          }
        });
      });

    if(uf && uf.dataset.scfUfReady !== '1'){
      uf.dataset.scfUfReady = '1';
      uf.addEventListener('input',function(){
        uf.value = String(uf.value || '')
          .replace(/[^A-Za-z]/g,'')
          .slice(0,2)
          .toUpperCase();
      });
    }
  }

  function alternarPainelEmpresa(painel){
    const dados =
      document.getElementById('scfSuperAdminCompanyDataPanel');
    const fiscais =
      document.getElementById('scfSuperAdminCompanyFiscalPanel');
    const botaoFiscais =
      document.getElementById('scfSuperAdminCompanyFiscalButton');

    if(!dados || !fiscais || !botaoFiscais){
      return;
    }

    const mostrarFiscais =
      painel === 'FISCAIS';

    dados.classList.toggle('is-active',!mostrarFiscais);
    fiscais.classList.toggle('is-active',mostrarFiscais);
    botaoFiscais.classList.toggle('is-active',mostrarFiscais);
    botaoFiscais.setAttribute('aria-pressed',mostrarFiscais ? 'true' : 'false');
    botaoFiscais.textContent =
      mostrarFiscais
        ? 'DADOS EMPRESA'
        : 'DADOS FISCAIS';
  }

  function prepararAbas(){
    const botaoFiscais =
      document.getElementById('scfSuperAdminCompanyFiscalButton');

    if(botaoFiscais && botaoFiscais.dataset.scfTabReady !== '1'){
      botaoFiscais.dataset.scfTabReady = '1';
      botaoFiscais.addEventListener('click',function(){
        const fiscais =
          document.getElementById('scfSuperAdminCompanyFiscalPanel');

        const fiscaisAtivos =
          Boolean(
            fiscais &&
            fiscais.classList.contains('is-active')
          );

        alternarPainelEmpresa(
          fiscaisAtivos
            ? 'EMPRESA'
            : 'FISCAIS'
        );
      });
    }
  }

  function prepararRegimeCrt(){
    const regime =
      document.getElementById('scfSuperAdminFiscalRegimeTributario');
    const crt =
      document.getElementById('scfSuperAdminFiscalCrt');

    if(!regime || !crt){
      return;
    }

    function atualizarCrt(){
      const mapa = {
        'MEI':'4',
        'LUCRO REAL':'3',
        'SIMPLES NACIONAL':'1',
        'LUCRO PRESUMIDO':'3'
      };

      crt.value =
        mapa[String(regime.value || '').toUpperCase()] || '';
    }

    if(regime.dataset.scfRegimeCrtReady !== '1'){
      regime.dataset.scfRegimeCrtReady = '1';
      regime.addEventListener('change',function(){
        regime.dataset.scfSintegrapiAuto = '0';
        crt.dataset.scfSintegrapiAuto = '0';
        atualizarCrt();
      });
    }

    atualizarCrt();
  }

  function valorCampo(id){
    const campo =
      document.getElementById(id);

    return campo
      ? String(campo.value || '').trim()
      : '';
  }

  function dadosFormularioEmpresa(){
    return {
      empresaId:
        valorCampo('scfSuperAdminCompanyEmpresaId'),

      senhaAdministrador:
        valorCampo('scfSuperAdminCompanySenhaAdministrador'),

      razaoSocial:
        valorCampo('scfSuperAdminCompanyRazaoSocial'),

      nomeFantasia:
        valorCampo('scfSuperAdminCompanyNomeFantasia'),

      cnpj:
        valorCampo('scfSuperAdminCompanyCnpj'),

      inscricaoEstadual:
        valorCampo('scfSuperAdminCompanyInscricaoEstadual'),

      cep:
        valorCampo('scfSuperAdminCompanyCep'),

      logradouro:
        valorCampo('scfSuperAdminCompanyLogradouro'),

      numero:
        valorCampo('scfSuperAdminCompanyNumero'),

      complemento:
        valorCampo('scfSuperAdminCompanyComplemento'),

      bairro:
        valorCampo('scfSuperAdminCompanyBairro'),

      municipio:
        valorCampo('scfSuperAdminCompanyMunicipio'),

      codigoMunicipio:
        valorCampo('scfSuperAdminCompanyCodigoMunicipio'),

      uf:
        valorCampo('scfSuperAdminCompanyUf'),

      email:
        valorCampo('scfSuperAdminCompanyEmail'),

      whatsapp:
        valorCampo('scfSuperAdminCompanyTelefone'),

      regimeTributario:
        valorCampo('scfSuperAdminFiscalRegimeTributario'),

      crt:
        valorCampo('scfSuperAdminFiscalCrt'),

      serieNfce:
        valorCampo('scfSuperAdminFiscalSerieNfce'),

      serieNfe55:
        valorCampo('scfSuperAdminFiscalSerieNfe55'),

      proximoNumeroNfceProducao:
        valorCampo('scfSuperAdminFiscalProximoNumeroNfceProducao'),

      proximoNumeroNfe55Producao:
        valorCampo('scfSuperAdminFiscalProximoNumeroNfe55Producao')
    };
  }

  function validarFormularioEmpresa(dados){
    if(
      !/^\d{6}$/.test(
        String(dados.empresaId || '')
      )
    ){
      return 'ID EMPRESA INVÁLIDO.';
    }

    if(!dados.senhaAdministrador){
      return 'INFORME A SENHA DO ADMINISTRADOR.';
    }

    if(!dados.razaoSocial){
      return 'INFORME A RAZÃO SOCIAL.';
    }

    if(
      String(dados.cnpj || '')
        .replace(/\D/g,'')
        .length !== 14
    ){
      return 'INFORME UM CNPJ COMPLETO.';
    }

    if(
      String(dados.cep || '')
        .replace(/\D/g,'')
        .length !== 8
    ){
      return 'INFORME UM CEP COMPLETO.';
    }

    if(!dados.logradouro){
      return 'INFORME O LOGRADOURO.';
    }

    if(!dados.bairro){
      return 'INFORME O BAIRRO.';
    }

    if(!dados.municipio){
      return 'INFORME A CIDADE.';
    }

    if(!/^\d{7}$/.test(String(dados.codigoMunicipio || ''))){
      return 'CONSULTE NOVAMENTE O CEP PARA OBTER O CÓDIGO DO MUNICÍPIO.';
    }

    if(!/^[A-Za-z]{2}$/.test(String(dados.uf || ''))){
      return 'INFORME UMA UF VÁLIDA.';
    }

    if(!dados.regimeTributario || !dados.crt){
      return 'SELECIONE O REGIME TRIBUTÁRIO.';
    }

    if(!dados.serieNfce){
      return 'INFORME A SÉRIE DA NFC-E.';
    }

    if(!dados.serieNfe55){
      return 'INFORME A SÉRIE DA NF-E.';
    }

    if(!dados.proximoNumeroNfceProducao){
      return 'INFORME O PRÓXIMO NÚMERO DA NFC-E.';
    }

    if(!dados.proximoNumeroNfe55Producao){
      return 'INFORME O PRÓXIMO NÚMERO DA NF-E.';
    }

    return '';
  }

  function gerarRequestIdCadastroEmpresa(){
    return [
      'superadmin-empresa',
      Date.now(),
      Math.random()
        .toString(36)
        .slice(2,8)
    ].join('-');
  }

  function obterBotaoCadastrarEmpresa(){
    return document.getElementById(
      'scfSuperAdminCompanySubmit'
    );
  }

  function atualizarBotaoCadastrarEmpresa(
    texto,
    desabilitado
  ){
    const botao =
      obterBotaoCadastrarEmpresa();

    if(!botao){
      return;
    }

    botao.textContent =
      texto || 'CADASTRAR';

    botao.disabled =
      desabilitado === true;
  }

  function modoSuperAdminAtivo(){
    return superadminDomain.active ===
      true;
  }

  function enviarCadastroEmpresa(){
    if(cadastroEmpresaEmAndamento){
      return;
    }

    if(!modoSuperAdminAtivo()){
      console.warn(
        '[SUPERADMIN] Cadastro de empresa ignorado fora do modo SUPERADMIN.'
      );
      return;
    }

    const dados =
      dadosFormularioEmpresa();

    const erroFormulario =
      validarFormularioEmpresa(
        dados
      );

    if(erroFormulario){
      window.alert(
        erroFormulario
      );
      return;
    }

    cadastroEmpresaEmAndamento =
      true;

    cadastroEmpresaConcluido =
      false;

    cadastroEmpresaRequestId =
      gerarRequestIdCadastroEmpresa();

    atualizarBotaoCadastrarEmpresa(
      'CADASTRANDO...',
      true
    );

    try{
      window.__scfPdvInfra.shellBridge.post(
        {
          type:
            'SCF_SUPERADMIN_EMPRESA_CADASTRAR',

          requestId:
            cadastroEmpresaRequestId,

          dados
        },
        '*'
      );
    }catch(error){
      cadastroEmpresaEmAndamento =
        false;

      cadastroEmpresaRequestId =
        '';

      atualizarBotaoCadastrarEmpresa(
        'CADASTRAR',
        false
      );

      console.error(
        '[SUPERADMIN] Falha ao solicitar cadastro da empresa:',
        error && error.message || error
      );

      window.alert(
        'NÃO FOI POSSÍVEL ENVIAR O CADASTRO DA EMPRESA.'
      );
    }
  }

  function obterBotaoLimparEmpresa(){
    return document.getElementById(
      'scfSuperAdminCompanyClear'
    );
  }

  function limparFormularioEmpresa(){
    if(cadastroEmpresaEmAndamento){
      return;
    }

    const form =
      document.getElementById(
        'scfSuperAdminCompanyForm'
      );

    if(!form){
      return;
    }

    if(consultaCepEmpresaTimer){
      window.clearTimeout(
        consultaCepEmpresaTimer
      );
      consultaCepEmpresaTimer = null;
    }

    if(consultaCnpjEmpresaTimer){
      window.clearTimeout(
        consultaCnpjEmpresaTimer
      );
      consultaCnpjEmpresaTimer = null;
    }

    consultaCnpjEmpresaRequestId = '';
    consultaCnpjEmpresaEmAndamento = false;
    ultimoCnpjEmpresaConsultado = '';
    ultimoCepEmpresaConsultado = '';

    form.querySelectorAll(
      'input, select'
    ).forEach(function(campo){
      if(
        campo.id ===
        'scfSuperAdminCompanyEmpresaId'
      ){
        return;
      }

      /*
       * PASSO 80 — as bolinhas DADOS EMPRESA / DADOS FISCAIS
       * fazem parte do formulário, mas não são campos cadastrais.
       * Preserva o valor/estado desses radios durante a limpeza.
       */
      if(
        campo.tagName === 'INPUT' &&
        campo.type === 'radio'
      ){
        return;
      }

      if(
        campo.tagName === 'INPUT' &&
        campo.type === 'checkbox'
      ){
        campo.checked = false;
        return;
      }

      if(campo.tagName === 'SELECT'){
        campo.selectedIndex = 0;
      }else{
        campo.value = '';
      }

      if(campo.dataset){
        campo.dataset.scfViaCepAuto = '0';
      }
    });

    const campoCep =
      document.getElementById(
        'scfSuperAdminCompanyCep'
      );

    if(campoCep){
      campoCep.removeAttribute(
        'aria-busy'
      );
    }

    const campoCnpj =
      document.getElementById(
        'scfSuperAdminCompanyCnpj'
      );

    if(campoCnpj){
      campoCnpj.removeAttribute(
        'aria-busy'
      );
    }

    cadastroEmpresaConcluido = false;
    cadastroEmpresaRequestId = '';

    preencherEmpresaIdAleatorio(true);
    prepararRegimeCrt();
    alternarPainelEmpresa('EMPRESA');

    atualizarBotaoCadastrarEmpresa(
      'CADASTRAR',
      false
    );

    const primeiroCampo =
      document.getElementById(
        'scfSuperAdminCompanyCnpj'
      );

    if(primeiroCampo){
      primeiroCampo.focus();
    }
  }

  function prepararCadastroEmpresa(){
    const botao =
      obterBotaoCadastrarEmpresa();

    const botaoLimpar =
      obterBotaoLimparEmpresa();

    const form =
      document.getElementById(
        'scfSuperAdminCompanyForm'
      );

    if(
      botao &&
      botao.dataset.scfCadastroEmpresaReady !== '1'
    ){
      botao.dataset.scfCadastroEmpresaReady = '1';
      botao.addEventListener(
        'click',
        enviarCadastroEmpresa
      );
    }

    if(
      botaoLimpar &&
      botaoLimpar.dataset.scfLimparEmpresaReady !== '1'
    ){
      botaoLimpar.dataset.scfLimparEmpresaReady = '1';
      botaoLimpar.addEventListener(
        'click',
        limparFormularioEmpresa
      );
    }

    if(
      form &&
      form.dataset.scfCadastroEmpresaAlteracaoReady !== '1'
    ){
      form.dataset.scfCadastroEmpresaAlteracaoReady = '1';

      const rearmarCadastro =
        function(){
          if(
            cadastroEmpresaEmAndamento ||
            !cadastroEmpresaConcluido
          ){
            return;
          }

          cadastroEmpresaConcluido =
            false;

          cadastroEmpresaRequestId =
            '';

          preencherEmpresaIdAleatorio(true);

          atualizarBotaoCadastrarEmpresa(
            'CADASTRAR',
            false
          );
        };

      form.addEventListener(
        'input',
        rearmarCadastro
      );

      form.addEventListener(
        'change',
        rearmarCadastro
      );
    }
  }

  function erroEmpresaIdDuplicado(mensagemRecebida){
    const mensagem =
      String(mensagemRecebida || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'')
        .toUpperCase();

    return (
      mensagem.includes('ID EMPRESA') &&
      (
        mensagem.includes('JA ESTA CADASTRADO') ||
        mensagem.includes('CONFLITO')
      )
    );
  }

  function tratarRetornoCadastroEmpresa(event){
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
      dados.type !==
        'SCF_SUPERADMIN_EMPRESA_CADASTRO_RESULTADO' &&
      dados.type !==
        'SCF_SUPERADMIN_EMPRESA_CADASTRO_ERRO'
    ){
      return;
    }

    const requestId =
      String(
        dados.requestId || ''
      ).trim();

    if(
      !cadastroEmpresaRequestId ||
      requestId !==
        cadastroEmpresaRequestId
    ){
      return;
    }

    cadastroEmpresaEmAndamento =
      false;

    if(
      dados.type ===
        'SCF_SUPERADMIN_EMPRESA_CADASTRO_RESULTADO' &&
      dados.success === true
    ){
      const empresaId =
        String(
          dados.empresa &&
          dados.empresa.empresaId ||
          ''
        ).trim();

      cadastroEmpresaConcluido =
        true;

      if(empresaId){
        const campoEmpresaId =
          document.getElementById(
            'scfSuperAdminCompanyEmpresaId'
          );

        if(campoEmpresaId){
          campoEmpresaId.value =
            empresaId;
        }
      }

      atualizarBotaoCadastrarEmpresa(
        empresaId
          ? `CADASTRADA ${empresaId}`
          : 'CADASTRADA',
        true
      );

      console.log(
        '[SUPERADMIN] Empresa cadastrada com sucesso:',
        empresaId || '(empresaId não informado na resposta)'
      );

      /*
       * PASSO 80/81 — sem certificado selecionado, mantém a limpeza
       * imediata já aprovada. Com A1 selecionado, o PASSO 81 assume
       * a sequência EMPRESA -> CERTIFICADO e limpa somente no fim.
       */
      const certificadoAssumiuFluxo =
        typeof superadminDomain.actions.afterCompanySuccess ===
          'function'
          ? superadminDomain.actions.afterCompanySuccess({
              empresaId
            }) === true
          : false;

      if(
        !certificadoAssumiuFluxo
      ){
        limparFormularioEmpresa();
      }

      return;
    }

    cadastroEmpresaConcluido =
      false;

    cadastroEmpresaRequestId =
      '';

    atualizarBotaoCadastrarEmpresa(
      'CADASTRAR',
      false
    );

    const mensagem =
      String(
        dados.message ||
        'Não foi possível cadastrar a empresa.'
      ).trim();

    if(erroEmpresaIdDuplicado(mensagem)){
      const novoEmpresaId =
        preencherEmpresaIdAleatorio(true);

      atualizarBotaoCadastrarEmpresa(
        'CADASTRAR',
        false
      );

      console.warn(
        '[SUPERADMIN] ID EMPRESA em colisão. Novo ID gerado automaticamente:',
        novoEmpresaId
      );

      window.alert(
        `${mensagem} NOVO ID GERADO: ${novoEmpresaId}`
      );

      return;
    }

    console.error(
      '[SUPERADMIN] Cadastro de empresa recusado:',
      mensagem
    );

    window.alert(
      mensagem
    );
  }

  /*
   * PASSO 81 — expõe somente a rotina de limpeza já existente para que
   * o fluxo opcional do certificado A1 possa limpar o cadastro após
   * EMPRESA + CERTIFICADO concluírem com sucesso.
   */
  superadminDomain.actions.clearCompanyForm =
    limparFormularioEmpresa;

  window.__scfPdvInfra.shellBridge.onMessage(
    tratarRetornoConsultaCnpjEmpresa
  );

  window.__scfPdvInfra.shellBridge.onMessage(
    tratarRetornoCadastroEmpresa
  );

  function iniciar(){
    garantirFormularioEmpresa();
    preencherEmpresaIdAleatorio(false);
    prepararMascaras();
    prepararAbas();
    prepararRegimeCrt();
    prepararCadastroEmpresa();

    [0,80,220,500,900].forEach(function(atraso){
      window.setTimeout(function(){
        garantirFormularioEmpresa();
        preencherEmpresaIdAleatorio(false);
        prepararMascaras();
        prepararAbas();
        prepararRegimeCrt();
        prepararCadastroEmpresa();
      },atraso);
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
