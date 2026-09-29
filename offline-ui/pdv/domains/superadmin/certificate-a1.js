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

  const LIMITE_BYTES =
    5 * 1024 * 1024;

  const estado = {
    lendo:
      false,
    arquivoBase64:
      '',
    nomeArquivo:
      '',
    tamanho:
      0,
    requestId:
      '',
    empresaId:
      '',
    empresaJaCadastrada:
      false,
    enviando:
      false
  };

  function elemento(id){
    return document.getElementById(
      id
    );
  }

  function definirStatus(
    mensagem,
    tipo
  ){
    const status =
      elemento(
        'scfSuperAdminA1Status'
      );

    if(!status){
      return;
    }

    status.textContent =
      String(
        mensagem || ''
      );

    if(tipo){
      status.dataset.state =
        tipo;
    }else{
      delete status.dataset.state;
    }
  }

  function atualizarNomeArquivo(
    nome
  ){
    const texto =
      elemento(
        'scfSuperAdminA1FileText'
      );

    const label =
      elemento(
        'scfSuperAdminA1FileLabel'
      );

    if(texto){
      texto.textContent =
        'CERTIFICADO';
    }

    if(label){
      label.classList.toggle(
        'is-selected',
        Boolean(nome)
      );

      label.title =
        nome ||
        'CERTIFICADO';

      label.setAttribute(
        'aria-label',
        nome
          ? 'Certificado selecionado: ' + nome
          : 'Selecionar certificado A1'
      );
    }
  }

  function obterSenha(){
    const campo =
      elemento(
        'scfSuperAdminA1Password'
      );

    return campo
      ? String(
          campo.value || ''
        )
      : '';
  }

  function definirBotao(
    texto,
    desabilitado
  ){
    [
      'scfSuperAdminCompanySectionData',
      'scfSuperAdminCompanySectionFiscal'
    ].forEach(function(idRadio){
      const radio =
        elemento(
          idRadio
        );

      if(
        radio &&
        radio.dataset.scfPasso81PropagationReady !==
          '1'
      ){
        radio.dataset.scfPasso81PropagationReady =
          '1';

        radio.addEventListener(
          'change',
          function(event){
            event.stopPropagation();
          }
        );
      }
    });

    const botao =
      elemento(
        'scfSuperAdminCompanySubmit'
      );

    if(!botao){
      return;
    }

    botao.textContent =
      texto || 'CADASTRAR';

    botao.disabled =
      desabilitado === true;
  }

  function bloquearCamposEmpresa(
    bloquear
  ){
    const form =
      elemento(
        'scfSuperAdminCompanyForm'
      );

    if(!form){
      return;
    }

    form.querySelectorAll(
      'input, select'
    ).forEach(function(campo){
      if(
        campo.id ===
          'scfSuperAdminA1File' ||
        campo.id ===
          'scfSuperAdminA1Password' ||
        campo.type ===
          'radio'
      ){
        campo.disabled =
          false;
        return;
      }

      campo.disabled =
        bloquear === true;
    });
  }

  function resetarEstado(){
    estado.lendo =
      false;
    estado.arquivoBase64 =
      '';
    estado.nomeArquivo =
      '';
    estado.tamanho =
      0;
    estado.requestId =
      '';
    estado.empresaId =
      '';
    estado.empresaJaCadastrada =
      false;
    estado.enviando =
      false;

    atualizarNomeArquivo(
      ''
    );

    definirStatus(
      '',
      ''
    );

    bloquearCamposEmpresa(
      false
    );
  }

  function gerarRequestId(){
    return [
      'superadmin-a1',
      Date.now(),
      Math.random()
        .toString(36)
        .slice(2,8)
    ].join('-');
  }

  function arquivoValido(
    arquivo
  ){
    if(!arquivo){
      return false;
    }

    if(
      !/\.(pfx|p12)$/i.test(
        String(
          arquivo.name || ''
        )
      )
    ){
      window.alert(
        'SELECIONE UM CERTIFICADO A1 .PFX OU .P12.'
      );
      return false;
    }

    if(
      Number(
        arquivo.size || 0
      ) >
        LIMITE_BYTES
    ){
      window.alert(
        'O CERTIFICADO A1 DEVE TER NO MÁXIMO 5 MB.'
      );
      return false;
    }

    return true;
  }

  function prepararArquivo(
    arquivo
  ){
    estado.arquivoBase64 =
      '';
    estado.nomeArquivo =
      '';
    estado.tamanho =
      0;

    if(
      !arquivoValido(
        arquivo
      )
    ){
      const campoArquivo =
        elemento(
          'scfSuperAdminA1File'
        );

      if(campoArquivo){
        campoArquivo.value =
          '';
      }

      atualizarNomeArquivo(
        ''
      );
      definirStatus(
        '',
        ''
      );
      return;
    }

    estado.lendo =
      true;
    estado.nomeArquivo =
      String(
        arquivo.name || ''
      );
    estado.tamanho =
      Number(
        arquivo.size || 0
      );

    atualizarNomeArquivo(
      estado.nomeArquivo
    );

    definirStatus(
      'LENDO CERTIFICADO...',
      ''
    );

    const leitor =
      new FileReader();

    leitor.onload =
      function(){
        const resultado =
          String(
            leitor.result || ''
          );

        const separador =
          resultado.indexOf(
            ','
          );

        estado.arquivoBase64 =
          separador >= 0
            ? resultado.slice(
                separador + 1
              )
            : resultado;

        estado.lendo =
          false;

        if(
          !estado.arquivoBase64
        ){
          definirStatus(
            'NÃO FOI POSSÍVEL LER O CERTIFICADO.',
            'error'
          );
          return;
        }

        definirStatus(
          'CERTIFICADO A1 PRONTO PARA ENVIO.',
          ''
        );
      };

    leitor.onerror =
      function(){
        estado.lendo =
          false;
        estado.arquivoBase64 =
          '';

        definirStatus(
          'NÃO FOI POSSÍVEL LER O CERTIFICADO.',
          'error'
        );
      };

    leitor.readAsDataURL(
      arquivo
    );
  }

  function garantirInterface(){
    const painel =
      elemento(
        'scfSuperAdminCompanyFiscalPanel'
      );

    if(!painel){
      return false;
    }

    let bloco =
      elemento(
        'scfSuperAdminA1Block'
      );

    if(!bloco){
      bloco =
        document.createElement(
          'div'
        );

      bloco.id =
        'scfSuperAdminA1Block';

      bloco.innerHTML =
        ''
        + '<div id="scfSuperAdminA1Row">'
        +   '<label id="scfSuperAdminA1FileLabel" for="scfSuperAdminA1File" aria-label="Selecionar certificado A1">'
        +     '<img id="scfSuperAdminA1FileIcon" alt="" aria-hidden="true" src="data:image/png;base64,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">'
        +     '<span id="scfSuperAdminA1FileText">CERTIFICADO</span>'
        +     '<input id="scfSuperAdminA1File" type="file" accept=".pfx,.p12,application/x-pkcs12,application/pkcs12">'
        +   '</label>'
        +   '<input id="scfSuperAdminA1Password" class="scf-superadmin-company-field" type="password" maxlength="300" autocomplete="new-password" placeholder="SENHA CERTIFICADO A1" aria-label="Senha do certificado A1">'
        + '</div>'
        + '<div id="scfSuperAdminA1Status" aria-live="polite"></div>';

      painel.appendChild(
        bloco
      );
    }

    const arquivo =
      elemento(
        'scfSuperAdminA1File'
      );

    const senha =
      elemento(
        'scfSuperAdminA1Password'
      );

    if(
      arquivo &&
      arquivo.dataset.scfPasso81Ready !==
        '1'
    ){
      arquivo.dataset.scfPasso81Ready =
        '1';

      arquivo.addEventListener(
        'change',
        function(event){
          event.stopPropagation();

          const selecionado =
            arquivo.files &&
            arquivo.files[0]
              ? arquivo.files[0]
              : null;

          prepararArquivo(
            selecionado
          );
        }
      );
    }

    if(
      senha &&
      senha.dataset.scfPasso81Ready !==
        '1'
    ){
      senha.dataset.scfPasso81Ready =
        '1';

      senha.addEventListener(
        'input',
        function(event){
          event.stopPropagation();
        }
      );

      senha.addEventListener(
        'change',
        function(event){
          event.stopPropagation();
        }
      );
    }

    const botao =
      elemento(
        'scfSuperAdminCompanySubmit'
      );

    if(
      botao &&
      botao.dataset.scfPasso81Ready !==
        '1'
    ){
      botao.dataset.scfPasso81Ready =
        '1';

      botao.addEventListener(
        'click',
        function(event){
          if(
            estado.empresaJaCadastrada &&
            estado.empresaId
          ){
            event.preventDefault();
            event.stopImmediatePropagation();

            enviarCertificado(
              estado.empresaId
            );

            return;
          }

          const arquivoSelecionado =
            elemento(
              'scfSuperAdminA1File'
            );

          const possuiArquivo =
            Boolean(
              arquivoSelecionado &&
              arquivoSelecionado.files &&
              arquivoSelecionado.files.length
            );

          if(
            !possuiArquivo
          ){
            return;
          }

          if(
            estado.lendo
          ){
            event.preventDefault();
            event.stopImmediatePropagation();

            window.alert(
              'AGUARDE A LEITURA DO CERTIFICADO A1.'
            );
            return;
          }

          if(
            !estado.arquivoBase64
          ){
            event.preventDefault();
            event.stopImmediatePropagation();

            window.alert(
              'SELECIONE NOVAMENTE O CERTIFICADO A1.'
            );
            return;
          }

          if(
            !obterSenha()
          ){
            event.preventDefault();
            event.stopImmediatePropagation();

            window.alert(
              'INFORME A SENHA DO CERTIFICADO A1.'
            );
          }
        },
        true
      );
    }

    return true;
  }

  function enviarCertificado(
    empresaId
  ){
    if(
      estado.enviando
    ){
      return;
    }

    if(
      !estado.arquivoBase64 ||
      !estado.nomeArquivo ||
      !obterSenha()
    ){
      definirBotao(
        'REENVIAR A1',
        false
      );

      window.alert(
        'SELECIONE O CERTIFICADO A1 E INFORME A SENHA.'
      );
      return;
    }

    estado.enviando =
      true;
    estado.empresaId =
      String(
        empresaId || ''
      ).trim();
    estado.requestId =
      gerarRequestId();

    definirBotao(
      'ENVIANDO A1...',
      true
    );

    definirStatus(
      'ENVIANDO CERTIFICADO A1...',
      ''
    );

    try{
      window.__scfPdvInfra.shellBridge.post(
        {
          type:
            'SCF_SUPERADMIN_CERTIFICADO_A1_ENVIAR',

          requestId:
            estado.requestId,

          empresaId:
            estado.empresaId,

          nomeArquivo:
            estado.nomeArquivo,

          arquivoBase64:
            estado.arquivoBase64,

          senhaCertificado:
            obterSenha()
        },
        '*'
      );
    }catch(error){
      estado.enviando =
        false;

      definirBotao(
        'REENVIAR A1',
        false
      );

      definirStatus(
        'FALHA AO ENVIAR CERTIFICADO A1.',
        'error'
      );

      window.alert(
        'NÃO FOI POSSÍVEL ENVIAR O CERTIFICADO A1.'
      );
    }
  }

  superadminDomain.actions.afterCompanySuccess =
    function(resultado){
      const arquivo =
        elemento(
          'scfSuperAdminA1File'
        );

      const possuiArquivo =
        Boolean(
          arquivo &&
          arquivo.files &&
          arquivo.files.length
        );

      if(
        !possuiArquivo
      ){
        resetarEstado();
        return false;
      }

      const empresaId =
        String(
          resultado &&
          resultado.empresaId ||
          ''
        ).trim();

      if(
        !empresaId
      ){
        return false;
      }

      estado.empresaJaCadastrada =
        true;
      estado.empresaId =
        empresaId;

      enviarCertificado(
        empresaId
      );

      return true;
    };

  function tratarRetorno(
    event
  ){
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
          'SCF_SUPERADMIN_CERTIFICADO_A1_RESULTADO' &&
        dados.type !==
          'SCF_SUPERADMIN_CERTIFICADO_A1_ERRO'
      )
    ){
      return;
    }

    if(
      !estado.requestId ||
      String(
        dados.requestId || ''
      ) !==
        estado.requestId
    ){
      return;
    }

    estado.enviando =
      false;

    if(
      dados.type ===
        'SCF_SUPERADMIN_CERTIFICADO_A1_RESULTADO' &&
      dados.success ===
        true
    ){
      definirStatus(
        'CERTIFICADO A1 CADASTRADO COM SUCESSO.',
        'success'
      );

      bloquearCamposEmpresa(
        false
      );

      const limpar =
        superadminDomain.actions.clearCompanyForm;

      resetarEstado();

      if(
        typeof limpar ===
          'function'
      ){
        limpar();
      }

      return;
    }

    estado.empresaJaCadastrada =
      true;

    bloquearCamposEmpresa(
      true
    );

    definirBotao(
      'REENVIAR A1',
      false
    );

    const mensagem =
      String(
        dados.message ||
        'Não foi possível cadastrar o certificado A1.'
      ).trim();

    definirStatus(
      mensagem,
      'error'
    );

    window.alert(
      mensagem
    );
  }

  window.__scfPdvInfra.shellBridge.onMessage(
    tratarRetorno
  );

  function iniciar(){
    garantirInterface();

    [0,80,220,500,900].forEach(
      function(atraso){
        window.setTimeout(
          garantirInterface,
          atraso
        );
      }
    );
  }

  if(
    document.readyState ===
      'loading'
  ){
    document.addEventListener(
      'DOMContentLoaded',
      iniciar,
      {
        once:true
      }
    );
  }else{
    iniciar();
  }
})();
