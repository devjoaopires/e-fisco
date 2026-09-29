(function(){
  'use strict';

  const financeDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.finance;

  if(!financeDomain){
    throw new Error(
      'PDV finance domain indisponivel.'
    );
  }

  const suppliersDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.suppliers;

  if(!suppliersDomain){
    throw new Error(
      'PDV suppliers domain indisponivel para finance.'
    );
  }

  const desktopMq =
    window.matchMedia(
      '(min-width:1001px)'
    );

  let fornecedoresRequestId =
    '';

  let movimentoRequestId =
    '';

  let movimentoSelecionado =
    null;

  let formularioSelecionadoAlterado =
    false;

  let fornecedorSelecionadoPendenteId =
    '';

  let fornecedorSelecionadoPendenteNome =
    '';

  let acaoRequestId =
    '';

  let acaoPendente =
    '';

  let acaoTimeout =
    null;

  let syncPending =
    false;

  function texto(valor){
    return String(
      valor ?? ''
    ).replace(
      /\s+/g,
      ' '
    ).trim();
  }

  function monthViewOpen(){
    return desktopMq.matches &&
      document.body.classList.contains('scf-financeiro-registration-open') &&
      document.body.classList.contains('scf-financeiro-saida-open') &&
      document.body.classList.contains('scf-financeiro-saida-mes-open');
  }

  function host(){
    return document.getElementById(
      'scfFinanceForm'
    );
  }

  function calendar(){
    return document.getElementById(
      'scfFinanceExitCalendar'
    );
  }

  function form(){
    return document.getElementById(
      'scfFinanceExitNewForm'
    );
  }

  function fornecedorId(fornecedor){
    return texto(
      fornecedor &&
      (
        fornecedor.fornecedorId ||
        fornecedor._id ||
        fornecedor.id
      )
    );
  }

  function fornecedorNome(fornecedor){
    return texto(
      fornecedor &&
      (
        fornecedor.razaoSocial ||
        fornecedor.nomeCompleto ||
        fornecedor.nomeFantasia ||
        fornecedor.fantasia ||
        fornecedor.nome ||
        fornecedor.cnpjFormatado ||
        fornecedor.cpfFormatado ||
        fornecedor.cnpj ||
        fornecedor.cpf
      )
    );
  }

  function renderFornecedores(lista){
    const select =
      document.getElementById(
        'scfFinanceExitNewSupplier'
      );

    if(!select){
      return;
    }

    const valorAnterior =
      texto(
        select.value
      );

    const unicos =
      new Map();

    (Array.isArray(lista) ? lista : [])
      .forEach(
        function(fornecedor){
          const id =
            fornecedorId(
              fornecedor
            );

          const nome =
            fornecedorNome(
              fornecedor
            );

          if(
            !id ||
            !nome ||
            unicos.has(id)
          ){
            return;
          }

          unicos.set(
            id,
            {
              id,
              nome
            }
          );
        }
      );

    const itens =
      Array.from(
        unicos.values()
      ).sort(
        function(a,b){
          return a.nome.localeCompare(
            b.nome,
            'pt-BR',
            {
              sensitivity:'base'
            }
          );
        }
      );

    select.replaceChildren();

    const placeholder =
      document.createElement(
        'option'
      );

    placeholder.value =
      '';

    placeholder.textContent =
      itens.length
        ? 'SELECIONE O FORNECEDOR'
        : 'NENHUM FORNECEDOR CADASTRADO';

    select.appendChild(
      placeholder
    );

    itens.forEach(
      function(item){
        const option =
          document.createElement(
            'option'
          );

        option.value =
          item.id;

        option.textContent =
          item.nome;

        option.dataset.scfFornecedorNome =
          item.nome;

        select.appendChild(
          option
        );
      }
    );

    select.disabled =
      itens.length === 0;

    const pendenteId =
      texto(
        fornecedorSelecionadoPendenteId
      );

    const pendenteNome =
      texto(
        fornecedorSelecionadoPendenteNome
      ).toLocaleUpperCase(
        'pt-BR'
      );

    const itemPendentePorId =
      pendenteId
        ? itens.find(
            function(item){
              return item.id === pendenteId;
            }
          )
        : null;

    const itemPendentePorNome =
      !itemPendentePorId && pendenteNome
        ? itens.find(
            function(item){
              return texto(item.nome)
                .toLocaleUpperCase('pt-BR') ===
                pendenteNome;
            }
          )
        : null;

    const itemPendente =
      itemPendentePorId ||
      itemPendentePorNome;

    if(itemPendente){
      select.value =
        itemPendente.id;

      fornecedorSelecionadoPendenteId =
        '';

      fornecedorSelecionadoPendenteNome =
        '';
    }else if(
      valorAnterior &&
      itens.some(
        function(item){
          return item.id ===
            valorAnterior;
        }
      )
    ){
      select.value =
        valorAnterior;
    }else{
      select.value =
        '';
    }

    if(
      movimentoSelecionado &&
      !movimentoSelecionadoEhFinanceiro()
    ){
      select.disabled = true;
    }else if(
      movimentoSelecionado &&
      movimentoSelecionadoEhFinanceiro()
    ){
      select.disabled =
        itens.length === 0;
    }
  }

  function solicitarFornecedores(){
    const cache =
      Array.isArray(
        suppliersDomain.suppliers
      )
        ? suppliersDomain.suppliers
        : [];

    if(cache.length){
      renderFornecedores(
        cache
      );
    }else{
      const select =
        document.getElementById(
          'scfFinanceExitNewSupplier'
        );

      if(select){
        select.innerHTML =
          '<option value="">CARREGANDO FORNECEDORES...</option>';
        select.disabled =
          true;
      }
    }

    fornecedoresRequestId =
      'scf-finance-saida-fornecedores-' +
      Date.now() +
      '-' +
      Math.random()
        .toString(36)
        .slice(2,8);

    try{
      window.__scfPdvInfra.shellBridge.post(
        {
          type:
            'SCF_FORNECEDORES_LISTAR',
          requestId:
            fornecedoresRequestId
        },
        '*'
      );
    }catch(error){
      if(!cache.length){
        renderFornecedores(
          []
        );
      }
    }
  }

  function sincronizarDetalhe(){
    const motivo =
      document.getElementById(
        'scfFinanceExitNewReason'
      );

    const fornecedorField =
      document.getElementById(
        'scfFinanceExitNewSupplierField'
      );

    const fornecedorSelect =
      document.getElementById(
        'scfFinanceExitNewSupplier'
      );

    const descricaoField =
      document.getElementById(
        'scfFinanceExitNewDescriptionField'
      );

    const descricaoInput =
      document.getElementById(
        'scfFinanceExitNewDescription'
      );

    const motivoAtual =
      texto(
        motivo?.value
      ).toUpperCase();

    const pagamentoFornecedor =
      motivoAtual ===
        'PAGAMENTO FORNECEDOR';

    const retiradaAvulsa =
      motivoAtual ===
        'RETIRADA AVULSA';

    if(fornecedorField){
      fornecedorField.hidden =
        !pagamentoFornecedor;
    }

    if(descricaoField){
      descricaoField.hidden =
        !retiradaAvulsa;
    }

    if(descricaoInput){
      descricaoInput.placeholder =
        'DESCREVA A RETIRADA';
    }

    if(pagamentoFornecedor){
      if(descricaoInput){
        descricaoInput.value =
          '';
      }

      solicitarFornecedores();

      window.setTimeout(
        function(){
          try{
            fornecedorSelect?.focus({
              preventScroll:
                true
            });
          }catch(error){
            fornecedorSelect?.focus();
          }
        },
        20
      );

      return;
    }

    if(retiradaAvulsa){
      if(fornecedorSelect){
        fornecedorSelect.value =
          '';
      }

      window.setTimeout(
        function(){
          try{
            descricaoInput?.focus({
              preventScroll:
                true
            });
          }catch(error){
            descricaoInput?.focus();
          }
        },
        20
      );

      return;
    }

    /* Nenhum MOTIVO escolhido: mantém os detalhes ocultos, como na SANGRIA. */
    if(fornecedorSelect){
      fornecedorSelect.value =
        '';
    }

    if(descricaoInput){
      descricaoInput.value =
        '';
    }
  }


  function extrairDetalheMovimento(movimento){
    const bruto = texto(movimento && movimento.motivo);
    const marcador = '||SCFDETALHE||';
    const indice = bruto.indexOf(marcador);

    if(indice < 0){
      return {motivo:bruto,detalhe:{}};
    }

    const motivoBase = texto(bruto.slice(0,indice));
    const codificado = texto(bruto.slice(indice + marcador.length));
    let detalhe = {};

    try{
      detalhe = JSON.parse(decodeURIComponent(codificado)) || {};
    }catch(error){
      detalhe = {};
    }

    return {
      motivo:motivoBase,
      detalhe:detalhe && typeof detalhe === 'object' ? detalhe : {}
    };
  }

  function idMovimento(movimento){
    return texto(
      movimento &&
      (movimento.id || movimento._id || movimento.movimentoId)
    );
  }

  function caixaSessaoMovimento(movimento){
    return texto(
      movimento &&
      (
        movimento.caixaSessaoId ||
        movimento.sessaoCaixaId ||
        movimento.caixaId ||
        movimento.sessionId
      )
    );
  }

  function fornecedorIdMovimento(movimento,detalhe){
    return texto(
      movimento &&
      (
        movimento.fornecedorId ||
        movimento.idFornecedor ||
        (movimento.fornecedor && (
          movimento.fornecedor.fornecedorId ||
          movimento.fornecedor.id ||
          movimento.fornecedor._id
        ))
      ) ||
      detalhe && detalhe.fornecedorId
    );
  }

  function fornecedorNomeMovimento(movimento,detalhe){
    return texto(
      movimento &&
      (
        movimento.fornecedorNome ||
        movimento.nomeFornecedor ||
        movimento.fornecedorRazaoSocial ||
        (movimento.fornecedor && (
          movimento.fornecedor.razaoSocial ||
          movimento.fornecedor.nomeFantasia ||
          movimento.fornecedor.nome
        ))
      ) ||
      detalhe && detalhe.fornecedorNome
    ).toLocaleUpperCase('pt-BR');
  }

  function descricaoMovimento(movimento,detalhe){
    return texto(
      movimento &&
      (
        movimento.descricao ||
        movimento.observacao ||
        movimento.detalhe
      ) ||
      detalhe && detalhe.descricao
    ).toLocaleUpperCase('pt-BR');
  }

  function vencimentoMovimento(movimento,detalhe){
    const bruto = texto(
      movimento &&
      (
        movimento.vencimento ||
        movimento.dataVencimento ||
        movimento.dueDate
      ) ||
      detalhe && detalhe.vencimento
    );

    if(!bruto) return '';
    if(/^\d{2}\/\d{2}\/\d{4}$/.test(bruto)) return bruto;

    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(bruto);
    if(iso) return iso[3] + '/' + iso[2] + '/' + iso[1];

    const data = new Date(bruto);
    if(!Number.isNaN(data.getTime())){
      return String(data.getDate()).padStart(2,'0') + '/' +
        String(data.getMonth()+1).padStart(2,'0') + '/' +
        String(data.getFullYear());
    }

    return bruto;
  }

  function valorComoMoeda(valor){
    const numero = Math.abs(Number(valor));
    if(!Number.isFinite(numero)) return '';
    return numero.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  }

  function marcarLinhaSelecionada(movimento){
    document.querySelectorAll(
      '#scfFinanceExitView .scf-finance-exit-row-hook.is-finance-exit-selected'
    ).forEach(function(row){
      row.classList.remove('is-finance-exit-selected');
    });

    const id = idMovimento(movimento);
    if(!id) return;

    document.querySelectorAll(
      '#scfFinanceExitView .scf-finance-exit-row-hook'
    ).forEach(function(row){
      if(texto(row.dataset.scfFinanceMovimentoId) === id){
        row.classList.add('is-finance-exit-selected');
      }
    });
  }

  function movimentoSelecionadoEhFinanceiro(){
    if(!movimentoSelecionado){
      return false;
    }

    const tipo =
      texto(
        movimentoSelecionado &&
        movimentoSelecionado.tipo
      )
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'')
        .replace(/[^A-Z]/gi,'')
        .toUpperCase();

    /*
     * As saídas cadastradas pelo módulo FINANCEIRO são persistidas
     * como CONTA_PAGAR. SANGRIA pertence ao CAIXA.
     */
    return tipo === 'CONTAPAGAR';
  }

  function atualizarModoFormulario(){
    const current = form();
    if(!current) return;

    const editing =
      !!movimentoSelecionado;

    const editavelFinanceiro =
      editing &&
      movimentoSelecionadoEhFinanceiro();

    const bloqueadoCaixa =
      editing &&
      !editavelFinanceiro;

    const alterado =
      editavelFinanceiro &&
      formularioSelecionadoAlterado === true;

    current.classList.toggle(
      'is-editing',
      editing
    );

    current.classList.toggle(
      'is-finance-editable',
      editavelFinanceiro
    );

    current.classList.toggle(
      'is-cash-locked',
      bloqueadoCaixa
    );

    current.classList.toggle(
      'is-dirty',
      alterado
    );

    const titulo =
      current.querySelector(
        '.scf-finance-exit-new-title'
      );

    if(titulo){
      titulo.textContent =
        !editing
          ? 'CADASTRAR NOVA SAÍDA'
          : alterado
            ? 'ATUALIZAR SAÍDA'
            : 'EXCLUIR SAÍDA';
    }

    const valor =
      document.getElementById(
        'scfFinanceExitNewAmount'
      );

    const vencimento =
      document.getElementById(
        'scfFinanceExitNewDueDate'
      );

    const motivo =
      document.getElementById(
        'scfFinanceExitNewReason'
      );

    const fornecedor =
      document.getElementById(
        'scfFinanceExitNewSupplier'
      );

    const descricao =
      document.getElementById(
        'scfFinanceExitNewDescription'
      );

    /*
     * FINANCEIRO (CONTA_PAGAR):
     * campos liberados para alteração.
     *
     * SANGRIA:
     * campos mantidos somente para consulta.
     */
    [valor,vencimento,descricao].forEach(
      function(input){
        if(!input) return;

        input.readOnly =
          bloqueadoCaixa;

        input.setAttribute(
          'aria-readonly',
          bloqueadoCaixa
            ? 'true'
            : 'false'
        );
      }
    );

    if(motivo){
      motivo.disabled =
        bloqueadoCaixa;
    }

    if(fornecedor){
      fornecedor.disabled =
        bloqueadoCaixa ||
        fornecedor.options.length <= 1;
    }

    const botao =
      document.getElementById(
        'scfFinanceExitNewConfirm'
      );

    if(botao){
      botao.classList.toggle(
        'is-delete',
        editing && !alterado
      );

      botao.classList.toggle(
        'is-update',
        alterado
      );

      botao.textContent =
        !editing
          ? 'CONFIRMAR'
          : alterado
            ? 'ATUALIZAR'
            : 'EXCLUIR';
    }

    const limparBotao =
      document.getElementById(
        'scfFinanceExitNewClear'
      );

    if(limparBotao){
      limparBotao.hidden =
        editing;

      limparBotao.setAttribute(
        'aria-hidden',
        editing
          ? 'true'
          : 'false'
      );
    }

    const voltar =
      document.getElementById(
        'scfFinanceExitNewBack'
      );

    if(voltar){
      /*
       * VOLTAR fica disponível somente quando a saída é do FINANCEIRO,
       * pois nesse caso existe modo de edição.
       */
      voltar.hidden =
        !editavelFinanceiro;

      voltar.setAttribute(
        'aria-hidden',
        editavelFinanceiro
          ? 'false'
          : 'true'
      );
    }
  }

  function marcarFormularioAlterado(){
    /*
     * Somente saída criada pelo FINANCEIRO (CONTA_PAGAR)
     * pode entrar no modo ATUALIZAR.
     */
    if(
      !movimentoSelecionado ||
      !movimentoSelecionadoEhFinanceiro()
    ){
      return;
    }

    if(!formularioSelecionadoAlterado){
      formularioSelecionadoAlterado = true;
      status('',false);
    }

    atualizarModoFormulario();
  }

  function executarAcaoPrincipal(){
    if(movimentoSelecionado){
      if(
        movimentoSelecionadoEhFinanceiro() &&
        formularioSelecionadoAlterado
      ){
        alterarSelecionado();
      }else{
        excluirSelecionado();
      }

      return;
    }

    confirmar();
  }

  function limparFormularioNovaSaida(){
    if(movimentoSelecionado){
      return;
    }

    limpar();

    window.requestAnimationFrame(
      function(){
        const valor =
          document.getElementById(
            'scfFinanceExitNewAmount'
          );

        try{
          valor?.focus({
            preventScroll:true
          });
        }catch(error){
          valor?.focus();
        }
      }
    );
  }

  function voltarDaSaidaSelecionada(){
    if(!movimentoSelecionado){
      return;
    }

    /*
     * VOLTAR abandona somente a seleção/edição local:
     * - desmarca a linha da tabela;
     * - limpa o formulário;
     * - retorna para CADASTRAR NOVA SAÍDA / CONFIRMAR;
     * - não envia nenhuma alteração ao backend.
     */
    limpar();

    window.requestAnimationFrame(
      function(){
        const valor =
          document.getElementById(
            'scfFinanceExitNewAmount'
          );

        try{
          valor?.focus({
            preventScroll:true
          });
        }catch(error){
          valor?.focus();
        }
      }
    );
  }

  function preencherMovimentoSelecionado(movimento){
    if(!monthViewOpen()) return false;

    const current = ensureForm();
    if(!current) return false;

    const tipo = texto(movimento && movimento.tipo).toLocaleUpperCase('pt-BR');
    const id = idMovimento(movimento);

    if(
      tipo !== 'SANGRIA' &&
      tipo !== 'CONTA_PAGAR'
    ){
      status(
        'ESTA SAÍDA É AUTOMÁTICA E NÃO PODE SER ALTERADA POR ESTE FORMULÁRIO.',
        true
      );
      return false;
    }

    if(!id){
      status(
        'ESTA SAÍDA NÃO POSSUI IDENTIFICADOR PARA ALTERAÇÃO OU EXCLUSÃO.',
        true
      );
      return false;
    }

    movimentoSelecionado = movimento;
    formularioSelecionadoAlterado = false;

    const extraido = extrairDetalheMovimento(movimento);
    const detalhe = extraido.detalhe || {};
    const motivoBase = texto(extraido.motivo).toLocaleUpperCase('pt-BR');

    const valorInput = document.getElementById('scfFinanceExitNewAmount');
    const vencimentoInput = document.getElementById('scfFinanceExitNewDueDate');
    const motivoInput = document.getElementById('scfFinanceExitNewReason');
    const fornecedorInput = document.getElementById('scfFinanceExitNewSupplier');
    const descricaoInput = document.getElementById('scfFinanceExitNewDescription');

    if(valorInput) valorInput.value = valorComoMoeda(movimento && movimento.valor);
    if(vencimentoInput) vencimentoInput.value = vencimentoMovimento(movimento,detalhe);
    if(motivoInput) motivoInput.value = motivoBase;

    fornecedorSelecionadoPendenteId = fornecedorIdMovimento(movimento,detalhe);
    fornecedorSelecionadoPendenteNome = fornecedorNomeMovimento(movimento,detalhe);

    if(descricaoInput) descricaoInput.value = descricaoMovimento(movimento,detalhe);
    if(fornecedorInput) fornecedorInput.value = '';

    atualizarModoFormulario();
    sincronizarDetalhe();
    marcarLinhaSelecionada(movimento);

    status('',false);

    window.requestAnimationFrame(function(){
      if(movimentoSelecionadoEhFinanceiro()){
        try{
          valorInput?.focus({
            preventScroll:true
          });
          valorInput?.select();
        }catch(error){
          valorInput?.focus();
        }

        return;
      }

      try{
        document
          .getElementById(
            'scfFinanceExitNewConfirm'
          )
          ?.focus({
            preventScroll:true
          });
      }catch(error){}
    });

    return true;
  }

  function dadosFormulario(){
    const valor = numeroValor(document.getElementById('scfFinanceExitNewAmount')?.value);
    const vencimento = texto(document.getElementById('scfFinanceExitNewDueDate')?.value);
    const motivo = texto(document.getElementById('scfFinanceExitNewReason')?.value).toLocaleUpperCase('pt-BR');
    const fornecedorSelect = document.getElementById('scfFinanceExitNewSupplier');
    const fornecedorIdSelecionado = motivo === 'PAGAMENTO FORNECEDOR' ? texto(fornecedorSelect?.value) : '';
    const fornecedorNomeSelecionado = motivo === 'PAGAMENTO FORNECEDOR' && fornecedorSelect && fornecedorSelect.selectedIndex >= 0
      ? texto(
          fornecedorSelect.options[fornecedorSelect.selectedIndex]?.dataset?.scfFornecedorNome ||
          fornecedorSelect.options[fornecedorSelect.selectedIndex]?.textContent
        ).toLocaleUpperCase('pt-BR')
      : '';
    const descricao = motivo === 'RETIRADA AVULSA'
      ? texto(document.getElementById('scfFinanceExitNewDescription')?.value).toLocaleUpperCase('pt-BR')
      : '';

    return {
      valor,
      vencimento,
      motivo,
      fornecedorId:fornecedorIdSelecionado,
      fornecedorNome:fornecedorNomeSelecionado,
      descricao
    };
  }

  function validarDadosFormulario(dados){
    if(dados.valor <= 0){ status('INFORME UM VALOR MAIOR QUE ZERO.',true); return false; }
    if(!vencimentoValido(dados.vencimento)){ status('INFORME O VENCIMENTO NO FORMATO DD/MM/AAAA.',true); return false; }
    if(!dados.motivo){ status('INFORME O MOTIVO.',true); return false; }
    if(dados.motivo === 'PAGAMENTO FORNECEDOR' && !dados.fornecedorId){ status('SELECIONE O FORNECEDOR.',true); return false; }
    if(dados.motivo === 'RETIRADA AVULSA' && !dados.descricao){ status('INFORME A DESCRIÇÃO DA RETIRADA.',true); return false; }
    return true;
  }

  function iniciarAcaoPersistente(acao){
    acaoPendente = acao;
    acaoRequestId = [
      'scf-finance-saida',
      acao.toLowerCase(),
      Date.now(),
      Math.random().toString(36).slice(2,8)
    ].join('-');

    if(acaoTimeout) window.clearTimeout(acaoTimeout);

    acaoTimeout = window.setTimeout(function(){
      if(!acaoRequestId) return;
      acaoRequestId = '';
      acaoPendente = '';
      bloquear(false);
      atualizarModoFormulario();
      status(
        'A OPERAÇÃO NÃO FOI CONFIRMADA PELO SISTEMA. NENHUMA ALTERAÇÃO VISUAL FOI ASSUMIDA COMO DEFINITIVA.',
        true
      );
    },12000);

    bloquear(true);
    return acaoRequestId;
  }

  function concluirAcaoPersistente(){
    if(acaoTimeout){
      window.clearTimeout(acaoTimeout);
      acaoTimeout = null;
    }
    acaoRequestId = '';
    acaoPendente = '';
  }

  function alterarSelecionado(){
    if(!movimentoSelecionado || acaoRequestId || movimentoRequestId) return;

    const movimentoId = idMovimento(movimentoSelecionado);
    if(!movimentoId){ status('NÃO FOI POSSÍVEL IDENTIFICAR A SAÍDA.',true); return; }

    const dados = dadosFormulario();
    if(!validarDadosFormulario(dados)) return;

    const requestId = iniciarAcaoPersistente('ALTERAR');
    status('ALTERANDO SAÍDA...',false);

    const motivoEnvio = dados.motivo + '||SCFDETALHE||' + encodeURIComponent(JSON.stringify({
      fornecedorId:dados.fornecedorId,
      fornecedorNome:dados.fornecedorNome,
      descricao:dados.descricao,
      vencimento:dados.vencimento
    }));

    const tipoSelecionado =
      texto(
        movimentoSelecionado && movimentoSelecionado.tipo
      ).toLocaleUpperCase('pt-BR');

    try{
      if(tipoSelecionado === 'CONTA_PAGAR'){
        window.__scfPdvInfra.shellBridge.post({
          type:'SCF_FINANCEIRO_CONTA_PAGAR_ATUALIZAR',
          requestId,
          movimentoId,
          valor:dados.valor,
          motivo:dados.motivo,
          fornecedorId:dados.fornecedorId,
          fornecedorNome:dados.fornecedorNome,
          descricao:dados.descricao,
          vencimento:dados.vencimento
        },'*');
      }else{
        window.__scfPdvInfra.shellBridge.post({
          type:'SCF_CAIXA_MOVIMENTO_ATUALIZAR',
          requestId,
          movimentoId,
          caixaSessaoId:caixaSessaoMovimento(movimentoSelecionado),
          tipo:'SANGRIA',
          valor:dados.valor,
          motivo:motivoEnvio,
          motivoBase:dados.motivo,
          fornecedorId:dados.fornecedorId,
          fornecedorNome:dados.fornecedorNome,
          descricao:dados.descricao,
          vencimento:dados.vencimento
        },'*');
      }
    }catch(error){
      concluirAcaoPersistente();
      bloquear(false);
      atualizarModoFormulario();
      status('NÃO FOI POSSÍVEL ENVIAR A ALTERAÇÃO.',true);
    }
  }

  function excluirSelecionado(){
    if(!movimentoSelecionado || acaoRequestId || movimentoRequestId) return;

    const movimentoId = idMovimento(movimentoSelecionado);
    if(!movimentoId){ status('NÃO FOI POSSÍVEL IDENTIFICAR A SAÍDA.',true); return; }

    const tipoMovimento = texto(
      movimentoSelecionado && movimentoSelecionado.tipo
    )
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[^A-Z]/gi,'')
      .toUpperCase();

    if(tipoMovimento === 'CONTAPAGAR'){
      const valorExibicao =
        valorComoMoeda(
          movimentoSelecionado && movimentoSelecionado.valor
        ) || 'ESTA CONTA';

      if(
        !window.confirm(
          'EXCLUIR ESTA CONTA A PAGAR?\n\n' +
          valorExibicao +
          ' SERÁ REMOVIDO SOMENTE DO FINANCEIRO.\n\n' +
          'NENHUMA SANGRIA, AJUSTE OU SALDO DO CAIXA SERÁ ALTERADO.'
        )
      ){
        return;
      }

      const requestId = iniciarAcaoPersistente('EXCLUIR');
      status('EXCLUINDO CONTA A PAGAR...',false);

      try{
        window.__scfPdvInfra.shellBridge.post({
          type:'SCF_FINANCEIRO_CONTA_PAGAR_EXCLUIR',
          requestId,
          movimentoId
        },'*');
      }catch(error){
        concluirAcaoPersistente();
        bloquear(false);
        atualizarModoFormulario();
        status('NÃO FOI POSSÍVEL ENVIAR A EXCLUSÃO DA CONTA A PAGAR.',true);
      }

      return;
    }

    if(tipoMovimento !== 'SANGRIA'){
      status(
        'SOMENTE SAÍDAS ORIGINADAS POR SANGRIA PODEM SER ANULADAS NESTA TELA.',
        true
      );
      return;
    }

    const valorExibicao =
      valorComoMoeda(
        movimentoSelecionado && movimentoSelecionado.valor
      ) || 'O VALOR DA SAÍDA';

    if(
      !window.confirm(
        'ANULAR ESTA SAÍDA?\n\n' +
        valorExibicao +
        ' SERÁ DEVOLVIDO AO SALDO DO CAIXA.\n\n' +
        'A SANGRIA ORIGINAL SERÁ MANTIDA NO HISTÓRICO PARA AUDITORIA.'
      )
    ){
      return;
    }

    const requestId = iniciarAcaoPersistente('EXCLUIR');
    status('ANULANDO SAÍDA E DEVOLVENDO O VALOR AO CAIXA...',false);

    try{
      window.__scfPdvInfra.shellBridge.post({
        type:'SCF_FINANCEIRO_SAIDA_ESTORNAR',
        requestId,
        movimentoId
      },'*');
    }catch(error){
      concluirAcaoPersistente();
      bloquear(false);
      atualizarModoFormulario();
      status('NÃO FOI POSSÍVEL ENVIAR A ANULAÇÃO DA SAÍDA.',true);
    }
  }

  function atualizarCacheLocalAposAlteracao(movimentoRetornado){
    const id = idMovimento(movimentoSelecionado);
    if(!id) return;

    const dados = dadosFormulario();
    const lista = Array.isArray(financeDomain.localMovements)
      ? financeDomain.localMovements.slice()
      : [];
    const indice = lista.findIndex(function(item){ return idMovimento(item) === id; });
    const base = movimentoRetornado && typeof movimentoRetornado === 'object'
      ? movimentoRetornado
      : movimentoSelecionado;

    const tipoAtual =
      texto(
        movimentoSelecionado && movimentoSelecionado.tipo
      ).toLocaleUpperCase('pt-BR');

    const atualizado = {
      ...base,
      id,
      tipo:tipoAtual || 'SANGRIA',
      valor:dados.valor,
      motivo:dados.motivo,
      fornecedorId:dados.fornecedorId,
      fornecedorNome:dados.fornecedorNome,
      descricao:dados.descricao,
      vencimento:dados.vencimento,
      __scfFinanceiroConfirmadoLocal:true
    };

    if(indice >= 0) lista[indice] = atualizado;
    else lista.unshift(atualizado);

    financeDomain.localMovements = lista.slice(0,300);
  }

  function removerCacheLocalSelecionado(){
    const id = idMovimento(movimentoSelecionado);
    if(!id) return;

    if(Array.isArray(financeDomain.localMovements)){
      financeDomain.localMovements = financeDomain.localMovements.filter(
        function(item){ return idMovimento(item) !== id; }
      );
    }
  }

  function formatarValor(input){
    if(!input){
      return;
    }

    const digitos =
      String(
        input.value || ''
      ).replace(
        /\D/g,
        ''
      );

    if(!digitos){
      input.value =
        '';
      return;
    }

    const valor =
      Number(
        digitos
      ) / 100;

    input.value =
      valor.toLocaleString(
        'pt-BR',
        {
          style:'currency',
          currency:'BRL'
        }
      );
  }

  function formatarVencimento(input){
    if(!input){
      return;
    }

    const digitos =
      String(
        input.value || ''
      ).replace(
        /\D/g,
        ''
      ).slice(
        0,
        8
      );

    let valor =
      digitos;

    if(digitos.length > 4){
      valor =
        digitos.slice(0,2) +
        '/' +
        digitos.slice(2,4) +
        '/' +
        digitos.slice(4);
    }else if(digitos.length > 2){
      valor =
        digitos.slice(0,2) +
        '/' +
        digitos.slice(2);
    }

    input.value =
      valor;
  }

  function vencimentoValido(valor){
    const textoData =
      texto(valor);

    if(!textoData){
      return true;
    }

    const match =
      /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(
        textoData
      );

    if(!match){
      return false;
    }

    const dia =
      Number(match[1]);
    const mes =
      Number(match[2]);
    const ano =
      Number(match[3]);

    const data =
      new Date(
        ano,
        mes - 1,
        dia
      );

    return data.getFullYear() === ano &&
      data.getMonth() === mes - 1 &&
      data.getDate() === dia;
  }

  function numeroValor(valor){
    const limpo =
      texto(
        valor
      )
        .replace(
          /\s/g,
          ''
        )
        .replace(
          /R\$/gi,
          ''
        )
        .replace(
          /\./g,
          ''
        )
        .replace(
          ',',
          '.'
        )
        .replace(
          /[^0-9.-]/g,
          ''
        );

    const numero =
      Number(
        limpo
      );

    return Number.isFinite(numero)
      ? numero
      : 0;
  }

  function status(message,error){
    const node =
      document.getElementById(
        'scfFinanceExitNewStatus'
      );

    if(!node){
      return;
    }

    node.textContent =
      texto(
        message
      );

    node.classList.toggle(
      'is-error',
      error === true
    );
  }

  function bloquear(bloqueado){
    const current =
      form();

    if(!current){
      return;
    }

    current
      .querySelectorAll(
        'input,select,button'
      )
      .forEach(
        function(node){
          if(bloqueado === true){
            node.disabled = true;

            if(node.matches('input')){
              node.readOnly = true;
            }

            return;
          }

          /*
           * Ao terminar a operação, a função central reaplica:
           * - FINANCEIRO = editável
           * - SANGRIA = somente leitura
           */
          node.disabled = false;

          if(node.matches('input')){
            node.readOnly = false;
          }
        }
      );

    if(!bloqueado){
      atualizarModoFormulario();
    }
  }

  function limpar(){
    movimentoSelecionado =
      null;

    formularioSelecionadoAlterado =
      false;

    fornecedorSelecionadoPendenteId =
      '';

    fornecedorSelecionadoPendenteNome =
      '';

    document
      .querySelectorAll(
        '#scfFinanceExitView .scf-finance-exit-row-hook.is-finance-exit-selected'
      )
      .forEach(
        function(row){
          row.classList.remove(
            'is-finance-exit-selected'
          );
        }
      );

    const valor =
      document.getElementById(
        'scfFinanceExitNewAmount'
      );

    const vencimento =
      document.getElementById(
        'scfFinanceExitNewDueDate'
      );

    const motivo =
      document.getElementById(
        'scfFinanceExitNewReason'
      );

    const fornecedor =
      document.getElementById(
        'scfFinanceExitNewSupplier'
      );

    const descricao =
      document.getElementById(
        'scfFinanceExitNewDescription'
      );

    if(valor){
      valor.value =
        '';
    }

    if(vencimento){
      vencimento.value =
        '';
    }

    if(motivo){
      motivo.value =
        '';
      motivo.selectedIndex =
        -1;
    }

    if(fornecedor){
      fornecedor.value =
        '';
    }

    if(descricao){
      descricao.value =
        '';
    }

    status(
      '',
      false
    );

    sincronizarDetalhe();
    atualizarModoFormulario();
  }

  function confirmar(){
    if(movimentoRequestId){
      return;
    }

    const valor =
      numeroValor(
        document.getElementById(
          'scfFinanceExitNewAmount'
        )?.value
      );

    const vencimento =
      texto(
        document.getElementById(
          'scfFinanceExitNewDueDate'
        )?.value
      );

    const motivo =
      texto(
        document.getElementById(
          'scfFinanceExitNewReason'
        )?.value
      ).toLocaleUpperCase(
        'pt-BR'
      );

    const fornecedorSelect =
      document.getElementById(
        'scfFinanceExitNewSupplier'
      );

    const fornecedorIdSelecionado =
      motivo ===
        'PAGAMENTO FORNECEDOR'
        ? texto(
            fornecedorSelect?.value
          )
        : '';

    const fornecedorNomeSelecionado =
      motivo ===
        'PAGAMENTO FORNECEDOR' &&
      fornecedorSelect &&
      fornecedorSelect.selectedIndex >= 0
        ? texto(
            fornecedorSelect.options[
              fornecedorSelect.selectedIndex
            ]?.dataset?.scfFornecedorNome ||
            fornecedorSelect.options[
              fornecedorSelect.selectedIndex
            ]?.textContent
          ).toLocaleUpperCase(
            'pt-BR'
          )
        : '';

    const descricao =
      motivo ===
        'RETIRADA AVULSA'
        ? texto(
            document.getElementById(
              'scfFinanceExitNewDescription'
            )?.value
          ).toLocaleUpperCase(
            'pt-BR'
          )
        : '';

    if(valor <= 0){
      status(
        'INFORME UM VALOR MAIOR QUE ZERO.',
        true
      );
      return;
    }

    if(!vencimentoValido(vencimento)){
      status(
        'INFORME O VENCIMENTO NO FORMATO DD/MM/AAAA.',
        true
      );
      return;
    }

    if(!motivo){
      status(
        'INFORME O MOTIVO.',
        true
      );
      return;
    }

    if(
      motivo === 'PAGAMENTO FORNECEDOR' &&
      !fornecedorIdSelecionado
    ){
      status(
        'SELECIONE O FORNECEDOR.',
        true
      );
      return;
    }

    if(
      motivo === 'RETIRADA AVULSA' &&
      !descricao
    ){
      status(
        'INFORME A DESCRIÇÃO DA RETIRADA.',
        true
      );
      return;
    }

    movimentoRequestId =
      'scf-finance-saida-' +
      Date.now() +
      '-' +
      Math.random()
        .toString(36)
        .slice(2,8);

    bloquear(
      true
    );

    status(
      'CADASTRANDO CONTA A PAGAR...',
      false
    );

    window.__scfPdvInfra.eventBus.dispatch(
      new CustomEvent(
        'scf:financeiro-saida-cadastrar',
        {
          detail:{
            requestId:
              movimentoRequestId,
            valor,
            vencimento,
            motivo,
            fornecedorId:
              fornecedorIdSelecionado,
            fornecedorNome:
              fornecedorNomeSelecionado,
            descricao
          }
        }
      )
    );
  }

  function ensureForm(){
    if(!monthViewOpen()){
      return null;
    }

    const parent =
      host();

    const cal =
      calendar();

    if(
      !parent ||
      !cal
    ){
      return null;
    }

    let current =
      form();

    if(!current){
      current =
        document.createElement(
          'section'
        );

      current.id =
        'scfFinanceExitNewForm';

      current.setAttribute(
        'aria-label',
        'Cadastrar nova saída'
      );

      current.innerHTML = ''
        + '<h3 class="scf-finance-exit-new-title">CADASTRAR NOVA SAÍDA</h3>'
        + '<div class="scf-finance-exit-new-row">'
        +   '<div class="scf-finance-exit-new-field">'
        +     '<label class="scf-finance-exit-new-label" for="scfFinanceExitNewAmount">VALOR</label>'
        +     '<input class="scf-finance-exit-new-input" id="scfFinanceExitNewAmount" inputmode="decimal" autocomplete="off" placeholder="R$ 0,00" type="text">'
        +   '</div>'
        +   '<div class="scf-finance-exit-new-field">'
        +     '<label class="scf-finance-exit-new-label" for="scfFinanceExitNewDueDate">VENCIMENTO</label>'
        +     '<input class="scf-finance-exit-new-input" id="scfFinanceExitNewDueDate" inputmode="numeric" maxlength="10" autocomplete="off" placeholder="DD/MM/AAAA" type="text">'
        +   '</div>'
        + '</div>'
        + '<div class="scf-finance-exit-new-field">'
        +   '<label class="scf-finance-exit-new-label" for="scfFinanceExitNewReason">MOTIVO</label>'
        +   '<select class="scf-finance-exit-new-input" id="scfFinanceExitNewReason" aria-label="Motivo da saída">'
        +     '<option value="PAGAMENTO FORNECEDOR">PAGAMENTO FORNECEDOR</option>'
        +     '<option value="RETIRADA AVULSA">RETIRADA AVULSA</option>'
        +   '</select>'
        + '</div>'
        + '<div class="scf-finance-exit-new-field" id="scfFinanceExitNewSupplierField" hidden>'
        +   '<label class="scf-finance-exit-new-label" for="scfFinanceExitNewSupplier">FORNECEDOR</label>'
        +   '<select class="scf-finance-exit-new-input" id="scfFinanceExitNewSupplier" aria-label="Fornecedor da saída"><option value="">SELECIONE O FORNECEDOR</option></select>'
        + '</div>'
        + '<div class="scf-finance-exit-new-field" id="scfFinanceExitNewDescriptionField" hidden>'
        +   '<label class="scf-finance-exit-new-label" for="scfFinanceExitNewDescription">DESCRIÇÃO</label>'
        +   '<input class="scf-finance-exit-new-input" id="scfFinanceExitNewDescription" maxlength="180" autocomplete="off" type="text" placeholder="DESCREVA A RETIRADA">'
        + '</div>'
        + '<div class="scf-cash-photo-actions" id="scfFinanceExitNewActions">'
        +   '<button class="finalize-photo-paid-btn" id="scfFinanceExitNewConfirm" type="button">CONFIRMAR</button>'
        +   '<button id="scfFinanceExitNewClear" type="button" aria-hidden="false">LIMPAR</button>'
        +   '<button id="scfFinanceExitNewBack" type="button" hidden aria-hidden="true">VOLTAR</button>'
        + '</div>'
        + '<div class="scf-finance-exit-new-status" id="scfFinanceExitNewStatus" aria-live="polite"></div>';

      const motivoInicial =
        document.getElementById(
          'scfFinanceExitNewReason'
        );

      if(motivoInicial){
        motivoInicial.selectedIndex =
          -1;
      }

      cal.insertAdjacentElement(
        'afterend',
        current
      );

      document
        .getElementById(
          'scfFinanceExitNewAmount'
        )
        ?.addEventListener(
          'input',
          function(event){
            formatarValor(
              event.currentTarget
            );
            marcarFormularioAlterado();
          }
        );

      document
        .getElementById(
          'scfFinanceExitNewDueDate'
        )
        ?.addEventListener(
          'input',
          function(event){
            formatarVencimento(
              event.currentTarget
            );
            marcarFormularioAlterado();
          }
        );

      document
        .getElementById(
          'scfFinanceExitNewReason'
        )
        ?.addEventListener(
          'change',
          function(){
            sincronizarDetalhe();
            marcarFormularioAlterado();
          }
        );

      document
        .getElementById(
          'scfFinanceExitNewSupplier'
        )
        ?.addEventListener(
          'change',
          marcarFormularioAlterado
        );

      document
        .getElementById(
          'scfFinanceExitNewDescription'
        )
        ?.addEventListener(
          'input',
          marcarFormularioAlterado
        );

      document
        .getElementById(
          'scfFinanceExitNewConfirm'
        )
        ?.addEventListener(
          'click',
          executarAcaoPrincipal
        );

      document
        .getElementById(
          'scfFinanceExitNewClear'
        )
        ?.addEventListener(
          'click',
          limparFormularioNovaSaida
        );

      document
        .getElementById(
          'scfFinanceExitNewBack'
        )
        ?.addEventListener(
          'click',
          voltarDaSaidaSelecionada
        );

      sincronizarDetalhe();
      atualizarModoFormulario();
    }else if(
      current.previousElementSibling !==
        cal
    ){
      cal.insertAdjacentElement(
        'afterend',
        current
      );
    }

    return current;
  }

  function removeForm(){
    form()?.remove();
    movimentoRequestId =
      '';

    movimentoSelecionado =
      null;

    formularioSelecionadoAlterado =
      false;

    fornecedorSelecionadoPendenteId =
      '';

    fornecedorSelecionadoPendenteNome =
      '';

    if(acaoTimeout){
      window.clearTimeout(acaoTimeout);
      acaoTimeout = null;
    }

    acaoRequestId =
      '';

    acaoPendente =
      '';
  }

  function sync(){
    syncPending =
      false;

    if(!monthViewOpen()){
      removeForm();
      return;
    }

    ensureForm();
  }

  function requestSync(){
    if(syncPending){
      return;
    }

    syncPending =
      true;

    window.requestAnimationFrame(
      function(){
        window.requestAnimationFrame(
          sync
        );
      }
    );
  }

  window.__scfPdvInfra.eventBus.on('scf:financeiro-saida-selecionar',
    function(event){
      const movimento =
        event &&
        event.detail &&
        event.detail.movimento &&
        typeof event.detail.movimento === 'object'
          ? event.detail.movimento
          : null;

      if(!movimento) return;
      preencherMovimentoSelecionado(movimento);
    }
  );

  window.__scfPdvInfra.eventBus.on('scf:financeiro-saida-status',
    function(event){
      const data =
        event &&
        event.detail &&
        typeof event.detail === 'object'
          ? event.detail
          : null;

      if(
        !data ||
        !movimentoRequestId ||
        (
          data.requestId &&
          texto(data.requestId) !==
            texto(movimentoRequestId)
        )
      ){
        return;
      }

      if(data.ok === false){
        status(
          data.message ||
          'NÃO FOI POSSÍVEL REGISTRAR A SAÍDA.',
          true
        );
        bloquear(
          false
        );
        movimentoRequestId =
          '';
        sincronizarDetalhe();
      }
    }
  );

  window.__scfPdvInfra.shellBridge.onMessage(
    function(event){
      const data =
        event &&
        event.data &&
        typeof event.data === 'object'
          ? event.data
          : null;

      if(!data){
        return;
      }

      if(
        data.type ===
          'SCF_FORNECEDORES_LISTA_RESULTADO' &&
        (
          !data.requestId ||
          texto(data.requestId) ===
            texto(fornecedoresRequestId)
        )
      ){
        fornecedoresRequestId =
          '';

        const lista =
          Array.isArray(
            data.fornecedores
          )
            ? data.fornecedores
            : [];

        suppliersDomain.suppliers =
          lista.slice();

        if(monthViewOpen()){
          renderFornecedores(
            lista
          );
        }

        return;
      }

      if(
        data.type ===
          'SCF_FORNECEDORES_LISTA_ERRO' &&
        (
          !data.requestId ||
          texto(data.requestId) ===
            texto(fornecedoresRequestId)
        )
      ){
        fornecedoresRequestId =
          '';

        if(
          !Array.isArray(
            suppliersDomain.suppliers
          )
        ){
          renderFornecedores(
            []
          );
        }

        return;
      }

      if(
        (
          data.type === 'SCF_CAIXA_MOVIMENTO_ATUALIZADO' ||
          data.type === 'SCF_CAIXA_MOVIMENTO_EXCLUIDO' ||
          data.type === 'SCF_FINANCEIRO_SAIDA_ESTORNADA' ||
          data.type === 'SCF_FINANCEIRO_CONTA_PAGAR_ATUALIZADA' ||
          data.type === 'SCF_FINANCEIRO_CONTA_PAGAR_EXCLUIDA'
        ) &&
        acaoRequestId &&
        (!data.requestId || texto(data.requestId) === texto(acaoRequestId))
      ){
        const acaoConcluida = acaoPendente;
        const tipoSelecionadoConcluido =
          texto(
            movimentoSelecionado && movimentoSelecionado.tipo
          ).toLocaleUpperCase('pt-BR');

        const movimentoIdAnulado =
          acaoConcluida === 'EXCLUIR' &&
          tipoSelecionadoConcluido === 'SANGRIA'
            ? idMovimento(movimentoSelecionado)
            : '';

        if(acaoConcluida === 'ALTERAR'){
          atualizarCacheLocalAposAlteracao(data.movimento);
        }else if(acaoConcluida === 'EXCLUIR'){
          removerCacheLocalSelecionado();

          if(movimentoIdAnulado){
            window.__scfPdvInfra.eventBus.dispatch(
              new CustomEvent(
                'scf:financeiro-saida-anulada-local',
                {
                  detail:{
                    movimentoId:movimentoIdAnulado
                  }
                }
              )
            );
          }
        }

        concluirAcaoPersistente();

        if(monthViewOpen()){
          limpar();
          bloquear(false);
          status(
            data.message ||
            (acaoConcluida === 'ALTERAR'
              ? 'SAÍDA ALTERADA COM SUCESSO.'
              : 'SAÍDA ANULADA. VALOR DEVOLVIDO AO CAIXA.'),
            false
          );
        }

        window.__scfPdvInfra.eventBus.dispatch(new CustomEvent('scf:financeiro-saldo-recarregar'));
        return;
      }

      if(
        (
          data.type === 'SCF_CAIXA_MOVIMENTO_ATUALIZAR_ERRO' ||
          data.type === 'SCF_CAIXA_MOVIMENTO_EXCLUIR_ERRO' ||
          data.type === 'SCF_FINANCEIRO_SAIDA_ESTORNO_ERRO' ||
          data.type === 'SCF_FINANCEIRO_CONTA_PAGAR_ATUALIZACAO_ERRO' ||
          data.type === 'SCF_FINANCEIRO_CONTA_PAGAR_EXCLUSAO_ERRO' ||
          data.type === 'SCF_CAIXA_MOVIMENTO_ERRO'
        ) &&
        acaoRequestId &&
        (!data.requestId || texto(data.requestId) === texto(acaoRequestId))
      ){
        const acaoFalhou = acaoPendente;
        concluirAcaoPersistente();
        bloquear(false);
        atualizarModoFormulario();
        status(
          data.message || data.mensagem ||
          (acaoFalhou === 'ALTERAR'
            ? 'NÃO FOI POSSÍVEL ALTERAR A SAÍDA.'
            : 'NÃO FOI POSSÍVEL ANULAR A SAÍDA NEM DEVOLVER O VALOR AO CAIXA.'),
          true
        );
        return;
      }

      if(
        data.type ===
          'SCF_FINANCEIRO_CONTA_PAGAR_CADASTRADA' &&
        movimentoRequestId &&
        (
          !data.requestId ||
          texto(data.requestId) ===
            texto(movimentoRequestId)
        )
      ){
        movimentoRequestId =
          '';

        if(monthViewOpen()){
          ensureForm();
          limpar();
          bloquear(
            false
          );
          status(
            data.message ||
            'CONTA A PAGAR CADASTRADA COM SUCESSO.',
            false
          );

          window.__scfPdvInfra.eventBus.dispatch(
            new CustomEvent(
              'scf:financeiro-saldo-recarregar'
            )
          );
        }

        return;
      }

      if(
        data.type ===
          'SCF_FINANCEIRO_CONTA_PAGAR_CADASTRO_ERRO' &&
        movimentoRequestId &&
        (
          !data.requestId ||
          texto(data.requestId) ===
            texto(movimentoRequestId)
        )
      ){
        movimentoRequestId =
          '';

        if(monthViewOpen()){
          bloquear(
            false
          );
          status(
            data.message ||
            'NÃO FOI POSSÍVEL CADASTRAR A CONTA A PAGAR.',
            true
          );
          sincronizarDetalhe();
        }
      }
    }
  );

  const observer =
    new MutationObserver(
      requestSync
    );

  observer.observe(
    document.body,
    {
      attributes:true,
      attributeFilter:[
        'class'
      ],
      childList:true,
      subtree:true
    }
  );

  desktopMq.addEventListener?.(
    'change',
    requestSync
  );

  requestSync();
})();
