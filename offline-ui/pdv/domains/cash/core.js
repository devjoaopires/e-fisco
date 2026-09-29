(function(){
  'use strict';

  const cashDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.cash;

  if(!cashDomain){
    throw new Error(
      'PDV cash domain indisponivel.'
    );
  }

  const suppliersDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.suppliers;

  if(!suppliersDomain){
    throw new Error(
      'PDV suppliers domain indisponivel para cash.'
    );
  }

  const photoFrame =
    document.querySelector(
      '#fiscalDesktopProductPhoto .fiscal-desktop-product-photo-frame'
    );

  if(!photoFrame) return;

  const cashConsultCenterCard =
    document.getElementById(
      'scfCashConsultCenterCard'
    );

  const cashConsultCenterMain =
    cashConsultCenterCard
      ? cashConsultCenterCard.querySelector(
          '.scf-cash-consult-main'
        )
      : null;

  const painelAntigo =
    document.getElementById(
      'scfCashPhotoPanel'
    );

  if(painelAntigo){
    painelAntigo.remove();
  }

  const panel =
    document.createElement(
      'div'
    );

  panel.id =
    'scfCashPhotoPanel';

  panel.className =
    'scf-cash-photo-panel';

  panel.hidden =
    true;

  panel.setAttribute(
    'aria-hidden',
    'true'
  );

  panel.innerHTML = [
    '<div class="fiscal-finalize-sale-title" id="scfCashPhotoTitle">CAIXA</div>',
    '<div class="fiscal-finalize-sale-subtitle" id="scfCashPhotoSubtitle">CONSULTANDO SITUAÇÃO DO CAIXA</div>',
    '<div class="scf-cash-photo-status" id="scfCashPhotoStatus"></div>',

    '<div class="scf-cash-photo-stage" id="scfCashPhotoLoading">',
      '<div class="scf-cash-photo-loading">CONSULTANDO CAIXA...</div>',
    '</div>',

    '<div class="scf-cash-photo-stage" id="scfCashPhotoOpening" hidden>',
      '<div class="scf-cash-photo-field">',
        '<label class="scf-cash-photo-label" for="scfCashOpeningAmount">FUNDO INICIAL</label>',
        '<input class="scf-cash-photo-input" id="scfCashOpeningAmount" inputmode="numeric" autocomplete="off" placeholder="R$ 0,00" type="text">',
      '</div>',
      '<div class="scf-cash-photo-field">',
        '<label class="scf-cash-photo-label" for="scfCashOpeningNote">OBSERVAÇÃO (OPCIONAL)</label>',
        '<textarea class="scf-cash-photo-textarea" id="scfCashOpeningNote" maxlength="300"></textarea>',
      '</div>',
      '<div class="scf-cash-photo-actions">',
        '<button class="finalize-photo-paid-btn" id="scfCashOpenButton" type="button">ABRIR CAIXA</button>',
        '<button class="finalize-photo-cancel-btn" id="scfCashOpeningBack" data-scf-cash-back type="button">VOLTAR</button>',
      '</div>',
    '</div>',

    '<div class="scf-cash-photo-stage" id="scfCashPhotoOpened" hidden>',
      '<div class="scf-cash-photo-summary">',
        '<div class="scf-cash-photo-summary-row"><span>SALDO INICIAL</span><strong id="scfCashMetricInitial">R$ 0,00</strong></div>',
        '<div class="scf-cash-photo-summary-row"><span>RECEBIMENTOS PIX</span><strong id="scfCashMetricPix">R$ 0,00</strong></div>',
        '<div class="scf-cash-photo-summary-row"><span>RECEBIMENTOS DÉBITO</span><strong id="scfCashMetricDebit">R$ 0,00</strong></div>',
        '<div class="scf-cash-photo-summary-row"><span>RECEBIMENTOS CRÉDITO</span><strong id="scfCashMetricCredit">R$ 0,00</strong></div>',
        '<div class="scf-cash-photo-summary-row"><span>RECEBIMENTOS DINHEIRO</span><strong id="scfCashMetricCashSales">R$ 0,00</strong></div>',
        '<div class="scf-cash-photo-summary-row"><span>SANGRIA</span><strong id="scfCashMetricWithdrawals">R$ 0,00</strong></div>',
        '<div class="scf-cash-photo-summary-row"><span>REEMBOLSOS</span><strong id="scfCashMetricRefunds">R$ 0,00</strong></div>',
        '<div class="scf-cash-photo-summary-row"><span>SUPRIMENTOS</span><strong id="scfCashMetricSupplies">R$ 0,00</strong></div>',
        '<div class="scf-cash-photo-summary-row"><span>ESTORNOS / AJUSTES</span><strong id="scfCashMetricRefundsAdjustments">R$ 0,00</strong></div>',
        '<div class="scf-cash-photo-summary-row"><span>SALDO ESPERADO</span><strong id="scfCashMetricExpected">R$ 0,00</strong></div>',
      '</div>',
      '<div class="scf-cash-photo-meta" id="scfCashOpenedMeta"></div>',
      '<div class="scf-cash-photo-actions three">',
        '<button class="scf-cash-photo-option" id="scfCashWithdrawalButton" type="button">SANGRIA</button>',
        '<button class="scf-cash-photo-option" id="scfCashSupplyButton" type="button">SUPRIMENTO</button>',
        '<button class="finalize-photo-cancel-btn" id="scfCashBeginCloseButton" type="button">FECHAR CAIXA</button>',
      '</div>',
    '</div>',

    '<div class="scf-cash-photo-stage" id="scfCashPhotoMovement" hidden>',
      '<div class="scf-cash-photo-field">',
        '<label class="scf-cash-photo-label" for="scfCashMovementAmount">VALOR</label>',
        '<input class="scf-cash-photo-input" id="scfCashMovementAmount" inputmode="decimal" autocomplete="off" placeholder="R$ 0,00" type="text">',
      '</div>',
      '<div class="scf-cash-photo-field">',
        '<label class="scf-cash-photo-label" for="scfCashMovementReason">MOTIVO</label>',
        '<input class="scf-cash-photo-input" id="scfCashMovementReason" maxlength="180" autocomplete="off" type="text">',
      '</div>',
      '<div class="scf-cash-photo-field" id="scfCashMovementSupplierField" hidden>',
        '<label class="scf-cash-photo-label" for="scfCashMovementSupplier">FORNECEDOR</label>',
        '<select class="scf-cash-photo-input" id="scfCashMovementSupplier" aria-label="Fornecedor da sangria">',
          '<option value="">SELECIONE O FORNECEDOR</option>',
        '</select>',
      '</div>',
      '<div class="scf-cash-photo-field" id="scfCashMovementDescriptionField" hidden>',
        '<label class="scf-cash-photo-label" for="scfCashMovementDescription">DESCRIÇÃO</label>',
        '<input class="scf-cash-photo-input" id="scfCashMovementDescription" maxlength="180" autocomplete="off" type="text" placeholder="DESCREVA A RETIRADA">',
      '</div>',
      '<div class="scf-cash-photo-actions" id="scfCashMovementActions">',
        '<button class="finalize-photo-paid-btn" id="scfCashMovementConfirmButton" type="button">CONFIRMAR</button>',
        '<button class="scf-cash-photo-option" id="scfCashMovementCancel" type="button">VOLTAR</button>',
      '</div>',
    '</div>',

    '<div class="scf-cash-photo-stage" id="scfCashPhotoClosing" hidden>',
      '<div class="scf-cash-photo-summary-row"><span>SALDO ESPERADO</span><strong id="scfCashCloseExpected">R$ 0,00</strong></div>',
      '<div class="scf-cash-photo-field">',
        '<label class="scf-cash-photo-label" for="scfCashCountedAmount">DINHEIRO CONTADO</label>',
        '<input class="scf-cash-photo-input" id="scfCashCountedAmount" inputmode="decimal" autocomplete="off" placeholder="R$ 0,00" type="text">',
      '</div>',
      '<div class="scf-cash-photo-difference">DIFERENÇA <strong id="scfCashCloseDifference">R$ 0,00</strong></div>',
      '<div class="scf-cash-photo-field">',
        '<label class="scf-cash-photo-label" for="scfCashClosingNote">OBSERVAÇÃO (OPCIONAL)</label>',
        '<textarea class="scf-cash-photo-textarea" id="scfCashClosingNote" maxlength="300"></textarea>',
      '</div>',
      '<div class="scf-cash-photo-actions">',
        '<button class="finalize-photo-cancel-btn" id="scfCashCloseConfirm" type="button">CONFIRMAR</button>',
        '<button class="scf-cash-photo-option" id="scfCashCloseCancel" type="button">VOLTAR</button>',
      '</div>',
    '</div>',

    '<div class="scf-cash-photo-stage" id="scfCashPhotoClosed" hidden>',
      '<button class="scf-cash-photo-close" data-scf-cash-back type="button" aria-label="Voltar ao PDV">',
        '<img alt="Fechar" src="https://static.wixstatic.com/media/fd6425_4a7468b648384589833816ddb0d7336f~mv2.png">',
      '</button>',
      '<div class="scf-cash-photo-summary">',
        '<div class="scf-cash-photo-summary-row"><span>SALDO ESPERADO</span><strong id="scfCashClosedExpected">R$ 0,00</strong></div>',
        '<div class="scf-cash-photo-summary-row"><span>SALDO CONTADO</span><strong id="scfCashClosedCounted">R$ 0,00</strong></div>',
        '<div class="scf-cash-photo-summary-row"><span>DIFERENÇA</span><strong id="scfCashClosedDifference">R$ 0,00</strong></div>',
      '</div>',
    '</div>'
  ].join('');

  photoFrame.appendChild(
    panel
  );

  const sangriaShortcutLayerHost =
    document.getElementById(
      'fiscalForm'
    );

  let shortcutGroup =
    document.getElementById(
      'scfCashShortcutGroup'
    );

  if(
    !shortcutGroup &&
    sangriaShortcutLayerHost
  ){
    shortcutGroup =
      document.createElement(
        'div'
      );

    shortcutGroup.id =
      'scfCashShortcutGroup';

    shortcutGroup.hidden =
      true;

    shortcutGroup.setAttribute(
      'aria-hidden',
      'true'
    );

    /*
     * O grupo continua fora de #fiscalDesktopProductPhoto,
     * na mesma camada independente do grid já aprovada.
     */
    sangriaShortcutLayerHost.appendChild(
      shortcutGroup
    );
  }else if(
    shortcutGroup &&
    sangriaShortcutLayerHost &&
    shortcutGroup.parentElement !==
      sangriaShortcutLayerHost
  ){
    sangriaShortcutLayerHost.appendChild(
      shortcutGroup
    );
  }

  /*
   * Remove atalhos legados FECHAR/SANGRIA caso uma instância antiga
   * ainda esteja presente no DOM e mantém somente MOVIMENTAÇÃO.
   */
  document
    .getElementById(
      'scfCashCloseShortcut'
    )
    ?.remove();

  document
    .getElementById(
      'scfCashSangriaShortcut'
    )
    ?.remove();

  let movimentacaoShortcutButton =
    document.getElementById(
      'scfCashMovementShortcut'
    );

  if(
    !movimentacaoShortcutButton &&
    shortcutGroup
  ){
    movimentacaoShortcutButton =
      document.createElement(
        'button'
      );

    movimentacaoShortcutButton.type =
      'button';

    movimentacaoShortcutButton.id =
      'scfCashMovementShortcut';

    shortcutGroup.appendChild(
      movimentacaoShortcutButton
    );
  }else if(
    movimentacaoShortcutButton &&
    shortcutGroup &&
    movimentacaoShortcutButton.parentElement !==
      shortcutGroup
  ){
    shortcutGroup.appendChild(
      movimentacaoShortcutButton
    );
  }

  if(
    movimentacaoShortcutButton
  ){
    movimentacaoShortcutButton.textContent =
      'F11 | MOVIMENTAÇÃO';

    movimentacaoShortcutButton.hidden =
      false;

    movimentacaoShortcutButton.setAttribute(
      'aria-hidden',
      'true'
    );

    movimentacaoShortcutButton.setAttribute(
      'aria-label',
      'F11 | Movimentação do caixa'
    );
  }

  const title =
    document.getElementById(
      'scfCashPhotoTitle'
    );

  const subtitle =
    document.getElementById(
      'scfCashPhotoSubtitle'
    );

  const status =
    document.getElementById(
      'scfCashPhotoStatus'
    );

  const stages = {
    loading:
      document.getElementById(
        'scfCashPhotoLoading'
      ),

    opening:
      document.getElementById(
        'scfCashPhotoOpening'
      ),

    opened:
      document.getElementById(
        'scfCashPhotoOpened'
      ),

    movement:
      document.getElementById(
        'scfCashPhotoMovement'
      ),

    closing:
      document.getElementById(
        'scfCashPhotoClosing'
      ),

    closed:
      document.getElementById(
        'scfCashPhotoClosed'
      )
  };

  let movimentoTipo =
    '';

  let requestEmAndamento =
    '';

  /*
   * Fornecedores disponíveis para a SANGRIA.
   * A lista usa o mesmo cadastro de fornecedores já existente no sistema.
   */
  let fornecedoresSangria =
    [];

  let fornecedoresSangriaRequestId =
    '';

  let stageAtual =
    'loading';

  /*
   * ABERTURA DO CAIXA NO CARD CENTRAL:
   * reutiliza o MESMO painel/inputs/botão já ligados à lógica do caixa.
   * Apenas no stage "opening" o painel é encaixado dentro do card
   * central com os recortes decorativos. Nos demais stages ele volta
   * imediatamente ao card lateral FOTO DO PRODUTO.
   */
  function posicionarPainelCaixa(nome){
    /*
     * AJUSTE FINAL:
     * o caixa não usa mais o card central.
     * CONSULTA, ABERTURA, CAIXA ABERTO, MOVIMENTAÇÃO e FECHAMENTO
     * permanecem sempre no mesmo card lateral "FOTO DO PRODUTO",
     * preservando o acabamento preto com máscara/recorte.
     */
    document.body.classList.remove(
      'scf-caixa-abertura-central'
    );

    cashConsultCenterCard?.classList.remove(
      'is-opening'
    );

    if(
      photoFrame &&
      panel.parentElement !==
        photoFrame
    ){
      photoFrame.appendChild(
        panel
      );
    }
  }

  function reciboTermoFechamentoAberto(){
    const overlay =
      document.getElementById(
        'scfCashReceiptOverlay'
      );

    const titulo =
      document.getElementById(
        'scfCashReceiptTitle'
      );

    return Boolean(
      overlay &&
      overlay.classList.contains(
        'show'
      ) &&
      texto(
        titulo?.textContent
      ).toUpperCase() ===
        'TERMO FECHAMENTO DE CAIXA'
    );
  }

  function podeExibirAtalhoSangria(){
    const exibindoTermoFechamento =
      reciboTermoFechamentoAberto();

    if(
      !shortcutGroup ||
      !movimentacaoShortcutButton
    ){
      return false;
    }

    if(
      !exibindoTermoFechamento &&
      (
        !cashDomain.currentCash ||
        String(
          cashDomain.currentCash.status || ''
        ).toUpperCase() !==
          'ABERTO'
      )
    ){
      return false;
    }

    if(
      !exibindoTermoFechamento &&
      aberturaObrigatoria ===
        true
    ){
      return false;
    }

    if(
      document.body.classList.contains(
        'scf-sales-history-open'
      )
    ){
      return false;
    }

    if(
      document.body.classList.contains(
        'scf-customer-registration-open'
      )
    ){
      return false;
    }

    if(
      !photoFrame
    ){
      return false;
    }

    return !(
      photoFrame.classList.contains(
        'is-client-identification-open'
      ) ||
      photoFrame.classList.contains(
        'is-validation-waiting-open'
      ) ||
      photoFrame.classList.contains(
        'is-sale-completed-open'
      ) ||
      photoFrame.classList.contains(
        'is-accounting-export-open'
      )
    );
  }

  function atalhoCaixaEmModoConfirmarMovimento(){
    /*
     * A confirmação de SANGRIA/SUPRIMENTO agora fica dentro do formulário.
     * O botão inferior é reservado ao F7 | VOLTAR.
     */
    return false;
  }

  function atalhoCaixaEmModoVoltar(){
    if(
      reciboTermoFechamentoAberto()
    ){
      return painelAberto();
    }

    return (
      painelAberto() &&
      aberturaObrigatoria !== true &&
      (
        stageAtual === 'opened' ||
        stageAtual === 'movement'
      ) &&
      !!cashDomain.currentCash &&
      String(cashDomain.currentCash.status || '').toUpperCase() === 'ABERTO'
    );
  }

  function atalhoCaixaEmModoFechar(){
    /*
     * O fechamento do caixa continua disponível pelo botão
     * FECHAR CAIXA dentro do próprio resumo. O atalho inferior,
     * quando o resumo foi aberto por F11, agora é exclusivamente VOLTAR.
     */
    return false;
  }

  function atualizarAtalhoCaixaVisual(){
    if(
      !movimentacaoShortcutButton
    ){
      return;
    }

    /*
     * CREDIÁRIO:
     * este mesmo botão inferior pertence ao F7 | VOLTAR enquanto
     * o painel VENDA NO CREDIÁRIO estiver ativo.
     *
     * Esta trava fica DENTRO da rotina do caixa para eliminar a disputa
     * F11 <-> F7 que causava o botão piscar continuamente.
     */
    if(
      document.body.classList.contains(
        'scf-crediario-open'
      )
    ){
      movimentacaoShortcutButton.classList.remove(
        'scf-confirm-mode',
        'scf-cash-back-mode',
        'scf-close-mode',
        'scf-product-cancel-back-mode',
        'scf-product-cancel-confirm-mode'
      );

      movimentacaoShortcutButton.classList.add(
        'scf-crediario-back-mode'
      );

      if(
        movimentacaoShortcutButton.textContent !==
          'F7 | VOLTAR'
      ){
        movimentacaoShortcutButton.textContent =
          'F7 | VOLTAR';
      }

      if(
        movimentacaoShortcutButton.getAttribute(
          'aria-label'
        ) !==
          'F7 | Voltar do crediário'
      ){
        movimentacaoShortcutButton.setAttribute(
          'aria-label',
          'F7 | Voltar do crediário'
        );
      }

      return;
    }

    const cancelFrame =
      document.querySelector(
        '#fiscalDesktopProductPhoto .fiscal-desktop-product-photo-frame'
      );

    const cancelCard =
      document.getElementById(
        'fiscalProductCancelCard'
      );

    const modoCancelarProduto =
      Boolean(
        cancelFrame &&
        cancelCard &&
        cancelCard.hidden !== true &&
        cancelFrame.classList.contains(
          'is-product-cancel-open'
        )
      );

    /* Sem senha: abrir o card já habilita a confirmação do cancelamento. */
    const cancelarProdutoConfirmado =
      modoCancelarProduto;

    /*
     * No PDV NORMAL com produto ativo, F2 não transforma mais o atalho
     * inferior em CANCELAR. O F11 permanece no seu papel original,
     * bloqueado e esmaecido pela trava da venda em andamento.
     */
    const pdvNormalVendaComProdutos =
      modoCancelarProduto &&
      !document.body.classList.contains('scf-crediario-open') &&
      !document.body.classList.contains('scf-crediario-list-open') &&
      !document.body.classList.contains('scf-crediario-detail-open') &&
      Boolean(
        document.querySelector(
          '#fiscalProductsList .fiscal-danfe-item-wrap:not(.is-preview):not(.is-cancelled)'
        )
      );

    const modoCancelarProdutoNoAtalho =
      modoCancelarProduto &&
      !pdvNormalVendaComProdutos;

    const modoConfirmar =
      !modoCancelarProduto &&
      atalhoCaixaEmModoConfirmarMovimento();

    const modoVoltarCaixa =
      !modoCancelarProduto &&
      !modoConfirmar &&
      atalhoCaixaEmModoVoltar();

    const modoFechar =
      !modoCancelarProduto &&
      !modoConfirmar &&
      !modoVoltarCaixa &&
      atalhoCaixaEmModoFechar();

    movimentacaoShortcutButton.classList.toggle(
      'scf-confirm-mode',
      modoConfirmar
    );

    movimentacaoShortcutButton.classList.toggle(
      'scf-cash-back-mode',
      modoVoltarCaixa
    );

    movimentacaoShortcutButton.classList.toggle(
      'scf-close-mode',
      modoFechar
    );

    movimentacaoShortcutButton.classList.toggle(
      'scf-product-cancel-back-mode',
      modoCancelarProdutoNoAtalho && !cancelarProdutoConfirmado
    );

    movimentacaoShortcutButton.classList.toggle(
      'scf-product-cancel-confirm-mode',
      modoCancelarProdutoNoAtalho && cancelarProdutoConfirmado
    );

    movimentacaoShortcutButton.textContent =
      modoCancelarProdutoNoAtalho
        ? cancelarProdutoConfirmado
          ? 'CANCELAR'
          : 'F7 | VOLTAR'
        : modoConfirmar
          ? 'CONFIRMAR'
          : modoVoltarCaixa
            ? 'F7 | VOLTAR'
            : modoFechar
              ? 'FECHAR CAIXA'
              : 'F11 | MOVIMENTAÇÃO';

    movimentacaoShortcutButton.setAttribute(
      'aria-label',
      modoCancelarProdutoNoAtalho
        ? cancelarProdutoConfirmado
          ? 'Confirmar cancelamento do item'
          : 'F7 | Voltar sem cancelar o item'
        : pdvNormalVendaComProdutos
          ? 'F11 | Movimentação indisponível durante venda com produtos'
          : modoConfirmar
            ? 'Confirmar movimentação do caixa'
            : modoVoltarCaixa
              ? (
                  reciboTermoFechamentoAberto()
                    ? 'F7 | Voltar para abrir caixa'
                    : 'F7 | Voltar ao PDV'
                )
              : modoFechar
                ? 'Fechar caixa'
                : 'F11 | Movimentação do caixa'
    );
  }

  function atualizarAtalhoSangria(){
    if(
      !shortcutGroup ||
      !movimentacaoShortcutButton
    ){
      return;
    }

    const visivel =
      podeExibirAtalhoSangria();

    shortcutGroup.hidden =
      !visivel;

    shortcutGroup.classList.toggle(
      'scf-visible',
      visivel
    );

    shortcutGroup.setAttribute(
      'aria-hidden',
      visivel
        ? 'false'
        : 'true'
    );

    movimentacaoShortcutButton.disabled =
      !visivel;

    movimentacaoShortcutButton.setAttribute(
      'aria-hidden',
      visivel
        ? 'false'
        : 'true'
    );

    atualizarAtalhoCaixaVisual();
  }

  function abrirAtalhoMovimentacao(){
    if(
      !cashDomain.currentCash ||
      !cashDomain.currentCash.id
    ){
      return;
    }

    aberturaObrigatoria =
      false;

    prepararExclusividadeVisual();

    panel.hidden =
      false;

    panel.setAttribute(
      'aria-hidden',
      'false'
    );

    photoFrame.classList.add(
      'is-cash-open'
    );

    document.body.classList.add(
      'scf-caixa-open'
    );

    mostrarStatus(
      ''
    );

    /*
     * F11 / movimentação: somente aqui o resumo completo é solicitado.
     * A consulta inicial do PDV permanece leve e serve apenas para saber
     * se existe uma sessão ABERTA. Enquanto o resumo real é atualizado,
     * não exibimos valores parciais ou antigos ao operador.
     */
    mostrarStage(
      'loading',
      'CAIXA',
      'ATUALIZANDO RESUMO DO CAIXA'
    );

    bloquearAcoes(
      true
    );

    requestEmAndamento =
      requestId(
        'caixa-consulta'
      );

    enviar({
      type:
        'SCF_CAIXA_CONSULTAR',

      requestId:
        requestEmAndamento,

      incluirResumo:
        true
    });

    atualizarAtalhoSangria();
  }

  /*
   * Consulta automática da abertura diária.
   * Se não houver caixa aberto, a tela de ABRIR CAIXA fica fixa
   * no card da foto até a abertura ser concluída.
   */
  let consultaInicialAutomatica =
    false;

  let aberturaObrigatoria =
    false;

  /*
   * Caixa fechado deve bloquear SOMENTE o PDV.
   * Ao navegar para VENDAS / ESTOQUE / CADASTRO / FINANCEIRO,
   * a obrigação de abrir caixa continua existindo, porém o painel
   * ABRIR CAIXA é apenas ocultado visualmente.
   */
  let aberturaObrigatoriaOcultaForaPdv =
    false;

  /*
   * Guarda somente o estado visual do menu existente ANTES de abrir o CAIXA.
   * Assim VOLTAR devolve exatamente o mesmo aspecto que estava na tela,
   * sem forçar o PDV para um estado selecionado diferente do anterior.
   */
  let estadoMenuAntesDoCaixa =
    null;

  function texto(valor){
    return String(
      valor == null
        ? ''
        : valor
    ).trim();
  }

  function numeroMoeda(valor){
    if(
      typeof valor ===
        'number'
    ){
      return Number.isFinite(
        valor
      )
        ? valor
        : 0;
    }

    let bruto =
      texto(
        valor
      )
        .replace(
          /R\$/gi,
          ''
        )
        .replace(
          /\s/g,
          ''
        );

    if(
      !bruto
    ){
      return 0;
    }

    if(
      bruto.includes(',')
    ){
      bruto =
        bruto
          .replace(
            /\.(?=\d{3}(?:\D|$))/g,
            ''
          )
          .replace(
            ',',
            '.'
          );
    }

    bruto =
      bruto.replace(
        /[^0-9.-]/g,
        ''
      );

    const numero =
      Number(
        bruto
      );

    return Number.isFinite(
      numero
    )
      ? numero
      : 0;
  }

  function moeda(valor){
    return new Intl.NumberFormat(
      'pt-BR',
      {
        style:
          'currency',

        currency:
          'BRL'
      }
    ).format(
      Number(valor) ||
        0
    );
  }

  /*
   * PARTE 1 — ABERTURA DE CAIXA.
   * O FUNDO INICIAL aceita somente dígitos e aplica máscara monetária
   * enquanto o operador digita. Ex.: 1 -> R$ 0,01; 100 -> R$ 1,00.
   */
  function formatarFundoInicialDigitado(input){
    if(
      !input
    ){
      return;
    }

    const digitos =
      String(
        input.value || ''
      ).replace(
        /\D/g,
        ''
      );

    if(
      !digitos
    ){
      input.value =
        '';

      return;
    }

    const centavos =
      Number(
        digitos
      );

    if(
      !Number.isSafeInteger(
        centavos
      )
    ){
      input.value =
        '';

      return;
    }

    input.value =
      moeda(
        centavos /
          100
      );
  }

  function fundoInicialDigitadoValido(valor){
    const valorTexto =
      texto(
        valor
      );

    return Boolean(
      valorTexto &&
      /\d/.test(
        valorTexto
      )
    );
  }

  function dataHora(valor){
    if(
      !valor
    ){
      return '';
    }

    const data =
      new Date(
        valor
      );

    if(
      Number.isNaN(
        data.getTime()
      )
    ){
      return '';
    }

    return data.toLocaleString(
      'pt-BR',
      {
        dateStyle:
          'short',

        timeStyle:
          'short'
      }
    );
  }

  function requestId(prefixo){
    return (
      `${prefixo}-` +
      `${Date.now()}-` +
      `${Math.random()
        .toString(36)
        .slice(2,8)}`
    );
  }

  function painelAberto(){
    return (
      panel.hidden !==
        true
    );
  }

  function enviar(mensagem){
    try{
      window.__scfPdvInfra.shellBridge.post(
        mensagem,
        '*'
      );

      return true;
    }catch(error){
      mostrarStatus(
        'Não foi possível comunicar com o Wix.',
        true
      );

      return false;
    }
  }

  function bloquearAcoes(bloquear){
    panel
      .querySelectorAll(
        'button,input,textarea,select'
      )
      .forEach(
        function(elemento){
          elemento.disabled =
            bloquear ===
            true;
        }
      );
  }

  function mostrarStatus(
    mensagem,
    erro,
    sucesso
  ){
    const mensagemTexto =
      texto(
        mensagem
      );

    /*
     * Durante a ABERTURA CENTRAL, toda mensagem operacional usa
     * exatamente a linha do subtítulo. Assim não existe uma segunda
     * linha de status abaixo de "INFORME O FUNDO INICIAL".
     */
    if(
      stageAtual === 'opening' &&
      document.body.classList.contains(
        'scf-caixa-abertura-central'
      )
    ){
      if(status){
        status.textContent =
          '';

        status.classList.remove(
          'error',
          'success'
        );
      }

      if(
        subtitle &&
        mensagemTexto
      ){
        subtitle.textContent =
          mensagemTexto;

        subtitle.classList.toggle(
          'scf-cash-opening-message-error',
          erro === true
        );

        subtitle.classList.toggle(
          'scf-cash-opening-message-success',
          sucesso === true
        );
      }

      return;
    }

    if(
      !status
    ){
      return;
    }

    status.textContent =
      mensagemTexto;

    status.classList.toggle(
      'error',
      erro ===
        true
    );

    status.classList.toggle(
      'success',
      sucesso ===
        true
    );
  }

  function mostrarStage(
    nome,
    titulo,
    subtitulo
  ){
    stageAtual =
      nome;

    posicionarPainelCaixa(
      nome
    );

    Object.entries(
      stages
    ).forEach(
      function([
        chave,
        elemento
      ]){
        if(
          elemento
        ){
          elemento.hidden =
            chave !==
            nome;
        }
      }
    );

    if(
      title
    ){
      title.textContent =
        titulo ||
        'CAIXA';
    }

    if(
      subtitle
    ){
      subtitle.classList.remove(
        'scf-cash-opening-message-error',
        'scf-cash-opening-message-success'
      );

      subtitle.textContent =
        subtitulo ||
        '';
    }

    atualizarAtalhoCaixaVisual();
    atualizarAtalhoSangria();
  }

  function selecionarPdvNoMenu(){
    try{
      const menu =
        document.getElementById(
          '__htmlStatusIframe'
        );

      if(
        menu &&
        menu.contentWindow
      ){
        menu.contentWindow.postMessage(
          {
            type:
              'SCF_MENU_SELECIONAR_CENTRAL'
          },
          '*'
        );
      }
    }catch(error){}
  }

  function capturarEstadoMenuAntesDoCaixa(
    doc
  ){
    if(
      !doc
    ){
      estadoMenuAntesDoCaixa =
        null;

      return;
    }

    const idsLaterais = [
      'localizacaoBtn',
      'cadastrarBtn',
      'bloqueioBtn',
      'admin'
    ];

    const central =
      doc.getElementById(
        'statusButton'
      );

    estadoMenuAntesDoCaixa = {
      laterais:
        idsLaterais
          .map(
            function(id){
              const elemento =
                doc.getElementById(
                  id
                );

              if(
                !elemento
              ){
                return null;
              }

              return {
                id,
                isOff:
                  elemento.classList.contains(
                    'is-off'
                  ),
                ariaPressed:
                  elemento.getAttribute(
                    'aria-pressed'
                  )
              };
            }
          )
          .filter(Boolean),

      central:
        central
          ? {
              menuHomeActive:
                central.classList.contains(
                  'menu-home-active'
                ),
              pdvMenuInactive:
                central.classList.contains(
                  'scf-pdv-menu-inactive'
                ),
              ariaPressed:
                central.getAttribute(
                  'aria-pressed'
                )
            }
          : null
    };
  }

  function restaurarEstadoMenuAntesDoCaixa(){
    const estado =
      estadoMenuAntesDoCaixa;

    estadoMenuAntesDoCaixa =
      null;

    if(
      !estado
    ){
      return false;
    }

    try{
      const iframe =
        document.getElementById(
          '__htmlStatusIframe'
        );

      const doc =
        iframe &&
        (
          iframe.contentDocument ||
          iframe.contentWindow?.document
        );

      if(
        !doc
      ){
        return false;
      }

      (
        Array.isArray(
          estado.laterais
        )
          ? estado.laterais
          : []
      ).forEach(
        function(item){
          const elemento =
            doc.getElementById(
              item.id
            );

          if(
            !elemento
          ){
            return;
          }

          elemento.classList.toggle(
            'is-off',
            item.isOff ===
              true
          );

          if(
            item.ariaPressed ===
              null
          ){
            elemento.removeAttribute(
              'aria-pressed'
            );
          }else{
            elemento.setAttribute(
              'aria-pressed',
              item.ariaPressed
            );
          }
        }
      );

      const central =
        doc.getElementById(
          'statusButton'
        );

      if(
        central &&
        estado.central
      ){
        central.classList.toggle(
          'menu-home-active',
          estado.central
            .menuHomeActive ===
            true
        );

        central.classList.toggle(
          'scf-pdv-menu-inactive',
          estado.central
            .pdvMenuInactive ===
            true
        );

        if(
          estado.central
            .ariaPressed ===
            null
        ){
          central.removeAttribute(
            'aria-pressed'
          );
        }else{
          central.setAttribute(
            'aria-pressed',
            estado.central
              .ariaPressed
          );
        }
      }

      const botaoCaixa =
        doc.getElementById(
          'caixaBtn'
        );

      if(
        botaoCaixa
      ){
        botaoCaixa.classList.add(
          'is-off'
        );

        botaoCaixa.setAttribute(
          'aria-pressed',
          'false'
        );
      }

      return true;
    }catch(error){
      return false;
    }
  }

  function ocultarAberturaObrigatoriaForaPdv(){
    if(
      aberturaObrigatoria !== true
    ){
      return false;
    }

    aberturaObrigatoriaOcultaForaPdv =
      true;

    /*
     * Não chama fecharTela(), pois fecharTela() remove a obrigação
     * de abertura. Aqui escondemos SOMENTE a interface do caixa.
     */
    panel.hidden =
      true;

    panel.setAttribute(
      'aria-hidden',
      'true'
    );

    photoFrame.classList.remove(
      'is-cash-open'
    );

    document.body.classList.remove(
      'scf-caixa-open',
      'scf-caixa-abertura-obrigatoria'
    );

    atualizarAtalhoSangria();

    return true;
  }

  function mostrarAberturaObrigatoriaNoPdv(){
    if(
      aberturaObrigatoria !== true
    ){
      return false;
    }

    aberturaObrigatoriaOcultaForaPdv =
      false;

    document.body.classList.add(
      'scf-caixa-abertura-obrigatoria'
    );

    panel.hidden =
      false;

    panel.setAttribute(
      'aria-hidden',
      'false'
    );

    photoFrame.classList.add(
      'is-cash-open'
    );

    document.body.classList.add(
      'scf-caixa-open'
    );

    atualizarAtalhoSangria();

    return true;
  }

  function fecharTela(
    selecionarPdv = true,
    forcar = false
  ){
    /*
     * Enquanto a abertura inicial for obrigatória, VOLTAR/Escape
     * não podem esconder o pedido de abertura.
     */
    if(
      aberturaObrigatoria ===
        true &&
      forcar !==
        true
    ){
      return;
    }

    posicionarPainelCaixa(
      'closed'
    );

    panel.hidden =
      true;

    panel.setAttribute(
      'aria-hidden',
      'true'
    );

    photoFrame.classList.remove(
      'is-cash-open'
    );

    document.body.classList.remove(
      'scf-caixa-open'
    );

    document.body.classList.remove(
      'scf-caixa-abertura-obrigatoria'
    );

    aberturaObrigatoriaOcultaForaPdv =
      false;

    atualizarAtalhoSangria();

    movimentoTipo =
      '';

    requestEmAndamento =
      '';

    bloquearAcoes(
      false
    );

    mostrarStatus(
      ''
    );

    if(
      selecionarPdv
    ){
      /*
       * VOLTAR deve recuperar o MESMO estado visual que existia
       * antes de abrir o caixa. O fallback antigo só é usado se
       * não houver snapshot disponível.
       */
      if(
        !restaurarEstadoMenuAntesDoCaixa()
      ){
        selecionarPdvNoMenu();
      }
    }else{
      /*
       * Se o fechamento veio do clique em outro item do menu,
       * esse novo item passa a controlar o estado visual.
       */
      estadoMenuAntesDoCaixa =
        null;
    }
  }

  function prepararExclusividadeVisual(){
    try{
      if(
        typeof window.scfCloseFinalizePhotoPanel ===
          'function'
      ){
        window.scfCloseFinalizePhotoPanel();
      }
    }catch(error){}

    const cancelCard =
      document.getElementById(
        'fiscalProductCancelCard'
      );

    if(
      cancelCard
    ){
      cancelCard.hidden =
        true;
    }

    photoFrame.classList.remove(
      'is-product-cancel-open',
      'is-sale-finalize-open',
      'is-client-identification-open',
      'is-validation-waiting-open',
      'is-sale-completed-open'
    );
  }

  function abrirTela(
    opcoes = {}
  ){
    const inicial =
      opcoes &&
      opcoes.inicial ===
        true;

    consultaInicialAutomatica =
      inicial;

    if(
      inicial
    ){
      aberturaObrigatoria =
        true;

      document.body.classList.add(
        'scf-caixa-abertura-obrigatoria'
      );
    }else if(
      aberturaObrigatoria !==
        true
    ){
      document.body.classList.remove(
        'scf-caixa-abertura-obrigatoria'
      );
    }

    prepararExclusividadeVisual();

    panel.hidden =
      false;

    panel.setAttribute(
      'aria-hidden',
      'false'
    );

    photoFrame.classList.add(
      'is-cash-open'
    );

    document.body.classList.add(
      'scf-caixa-open'
    );

    mostrarStatus(
      ''
    );

    mostrarStage(
      'loading',
      'CAIXA',
      'CONSULTANDO SITUAÇÃO DO CAIXA'
    );

    bloquearAcoes(
      true
    );

    requestEmAndamento =
      requestId(
        'caixa-consulta'
      );

    enviar({
      type:
        'SCF_CAIXA_CONSULTAR',

      requestId:
        requestEmAndamento,

      incluirResumo:
        true
    });
  }

  function verificarCaixaInicial(){
    /*
     * Consulta inicial SILENCIOSA:
     * - caixa aberto: permanece direto no PDV, sem exibir AGUARDE/CONSULTANDO;
     * - caixa fechado: somente após a resposta abre ABRIR CAIXA.
     */
    consultaInicialAutomatica =
      true;

    aberturaObrigatoria =
      false;

    requestEmAndamento =
      requestId(
        'caixa-consulta'
      );

    enviar({
      type:
        'SCF_CAIXA_CONSULTAR',

      requestId:
        requestEmAndamento,

      /*
       * Consulta de entrada: somente confirma ABERTO/FECHADO.
       * O resumo financeiro completo será carregado apenas ao abrir
       * MOVIMENTAÇÃO/FECHAMENTO do caixa.
       */
      incluirResumo:
        false
    });
  }

  /*
   * PARTE 5 — FECHAMENTO DE CAIXA.
   * Depois que o backend confirma o fechamento, o PDV deve voltar
   * imediatamente ao estado obrigatório de ABRIR CAIXA, sem exigir
   * fechar/reabrir o sistema e sem liberar a frente de caixa no intervalo.
   */
  function mostrarAberturaObrigatoriaAposFechamento(){
    consultaInicialAutomatica =
      false;

    aberturaObrigatoria =
      true;

    aberturaObrigatoriaOcultaForaPdv =
      false;

    cashDomain.currentCash =
      null;

    movimentoTipo =
      '';

    requestEmAndamento =
      '';

    document.body.classList.add(
      'scf-caixa-abertura-obrigatoria'
    );

    panel.hidden =
      false;

    panel.setAttribute(
      'aria-hidden',
      'false'
    );

    photoFrame.classList.add(
      'is-cash-open'
    );

    document.body.classList.add(
      'scf-caixa-open'
    );

    const inicial =
      document.getElementById(
        'scfCashOpeningAmount'
      );

    const nota =
      document.getElementById(
        'scfCashOpeningNote'
      );

    if(
      inicial
    ){
      inicial.value =
        '';
    }

    if(
      nota
    ){
      nota.value =
        '';
    }

    bloquearAcoes(
      false
    );

    mostrarStatus(
      ''
    );

    mostrarStage(
      'opening',
      'ABRIR CAIXA',
      'INFORME O FUNDO INICIAL'
    );

    atualizarAtalhoSangria();

    if(
      inicial
    ){
      window.setTimeout(
        function(){
          try{
            inicial.focus({
              preventScroll:
                true
            });
          }catch(error){
            inicial.focus();
          }
        },
        40
      );
    }
  }

  function definirMoeda(
    id,
    valor
  ){
    const elemento =
      document.getElementById(
        id
      );

    if(
      elemento
    ){
      elemento.textContent =
        moeda(
          valor
        );
    }
  }

  function atualizarResumo(
    caixa
  ){
    cashDomain.currentCash =
      caixa ||
      null;

    const resumo =
      cashDomain.currentCash &&
      cashDomain.currentCash.resumo
        ? cashDomain.currentCash.resumo
        : {};

    definirMoeda(
      'scfCashMetricInitial',
      resumo.saldoInicial !=
        null
        ? resumo.saldoInicial
        : cashDomain.currentCash?.saldoInicial
    );

    definirMoeda(
      'scfCashMetricCashSales',
      resumo.vendasDinheiro
    );

    definirMoeda(
      'scfCashMetricPix',
      resumo.recebimentosPix
    );

    definirMoeda(
      'scfCashMetricDebit',
      resumo.recebimentosDebito
    );

    definirMoeda(
      'scfCashMetricCredit',
      resumo.recebimentosCredito
    );

    definirMoeda(
      'scfCashMetricWithdrawals',
      resumo.sangrias
    );

    definirMoeda(
      'scfCashMetricSupplies',
      resumo.suprimentos
    );

    /*
     * REEMBOLSOS e ESTORNOS / AJUSTES ficam separados visualmente.
     *
     * O backend já devolve resumo.ajustes como o efeito líquido dos AJUSTES
     * comuns no caixa. Para separar os reembolsos em dinheiro, usamos os
     * movimentos do próprio resumo e identificamos os AJUSTES cujo MOTIVO
     * contém REEMBOLSO. Em seguida retiramos esse valor de resumo.ajustes,
     * deixando em ESTORNOS / AJUSTES somente os demais ajustes, inclusive
     * o AJUSTE POSITIVO criado ao anular uma SANGRIA.
     *
     * Cancelamentos de venda já estão refletidos em resumo.vendasDinheiro e
     * não são somados novamente aqui. O SALDO ESPERADO permanece exatamente
     * o valor calculado pelo backend.
     */
    const movimentosResumo =
      Array.isArray(
        resumo.movimentos
      )
        ? resumo.movimentos
        : [];

    const reembolsosAssinados =
      movimentosResumo.reduce(
        function(total,movimento){
          const tipo =
            String(
              movimento && movimento.tipo || ''
            ).trim().toLocaleUpperCase('pt-BR');

          const motivo =
            String(
              movimento && movimento.motivo || ''
            ).trim().toLocaleUpperCase('pt-BR');

          if(
            tipo !== 'AJUSTE' ||
            !motivo.includes('REEMBOLSO')
          ){
            return total;
          }

          return total +
            numeroMoeda(
              movimento && movimento.valor
            );
        },
        0
      );

    const estornosAjustesAssinados =
      numeroMoeda(
        resumo.ajustes
      ) - reembolsosAssinados;

    function definirMoedaAssinada(
      id,
      valor
    ){
      const elemento =
        document.getElementById(
          id
        );

      if(!elemento){
        return;
      }

      const numero =
        numeroMoeda(
          valor
        );

      if(Math.abs(numero) < 0.005){
        elemento.textContent =
          moeda(0);
        return;
      }

      elemento.textContent =
        (numero > 0 ? '+ ' : '- ') +
        moeda(
          Math.abs(
            numero
          )
        );
    }

    definirMoedaAssinada(
      'scfCashMetricRefunds',
      reembolsosAssinados
    );

    definirMoedaAssinada(
      'scfCashMetricRefundsAdjustments',
      estornosAjustesAssinados
    );

    definirMoeda(
      'scfCashMetricExpected',
      resumo.saldoEsperado !=
        null
        ? resumo.saldoEsperado
        : cashDomain.currentCash?.saldoEsperado
    );

    const meta =
      document.getElementById(
        'scfCashOpenedMeta'
      );

    if(
      meta
    ){
      const partes =
        [];

      const abertoEm =
        dataHora(
          cashDomain.currentCash?.abertoEm ||
          resumo.abertoEm
        );

      if(
        abertoEm
      ){
        partes.push(
          `ABERTO EM ${abertoEm}`
        );
      }

      if(
        Number.isFinite(
          Number(
            resumo.quantidadeVendas
          )
        )
      ){
        partes.push(
          `${Number(resumo.quantidadeVendas)} VENDA(S)`
        );
      }

      if(
        Number.isFinite(
          Number(
            resumo.quantidadeMovimentos
          )
        )
      ){
        partes.push(
          `${Number(resumo.quantidadeMovimentos)} MOVIMENTO(S)`
        );
      }

      meta.textContent =
        partes.join(
          ' • '
        );
    }

    atualizarDiferencaFechamento();
  }

  function saldoEsperadoAtual(){
    const resumo =
      cashDomain.currentCash?.resumo ||
      {};

    if(
      resumo.saldoEsperado !=
        null
    ){
      return (
        Number(
          resumo.saldoEsperado
        ) ||
        0
      );
    }

    return (
      Number(
        cashDomain.currentCash?.saldoEsperado
      ) ||
      0
    );
  }

  function atualizarDiferencaFechamento(){
    const input =
      document.getElementById(
        'scfCashCountedAmount'
      );

    const output =
      document.getElementById(
        'scfCashCloseDifference'
      );

    const esperado =
      document.getElementById(
        'scfCashCloseExpected'
      );

    if(
      esperado
    ){
      esperado.textContent =
        moeda(
          saldoEsperadoAtual()
        );
    }

    if(
      !input ||
      !output
    ){
      return;
    }

    const contado =
      numeroMoeda(
        input.value
      );

    const diferenca =
      contado -
      saldoEsperadoAtual();

    output.textContent =
      moeda(
        diferenca
      );
  }

  function abrirResumo(){
    movimentoTipo =
      '';

    mostrarStatus(
      ''
    );

    atualizarResumo(
      cashDomain.currentCash
    );

    atualizarAtalhoSangria();

    mostrarStage(
      'opened',
      'CAIXA ABERTO',
      'MOVIMENTAÇÃO E FECHAMENTO'
    );
  }

  function fornecedorSangriaId(
    fornecedor
  ){
    return texto(
      fornecedor &&
      (
        fornecedor.fornecedorId ||
        fornecedor._id ||
        fornecedor.id
      )
    );
  }

  function fornecedorSangriaNome(
    fornecedor
  ){
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

  function renderizarFornecedoresSangria(
    lista
  ){
    const select =
      document.getElementById(
        'scfCashMovementSupplier'
      );

    if(!select){
      return;
    }

    fornecedoresSangria =
      Array.isArray(lista)
        ? lista.slice()
        : [];

    const valorAnterior =
      texto(
        select.value
      );

    const unicos =
      new Map();

    fornecedoresSangria
      .forEach(
        function(fornecedor){
          const id =
            fornecedorSangriaId(
              fornecedor
            );

          const nome =
            fornecedorSangriaNome(
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
              sensitivity:
                'base'
            }
          );
        }
      );

    select.innerHTML =
      '';

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

        option.dataset
          .scfFornecedorNome =
            item.nome;

        select.appendChild(
          option
        );
      }
    );

    select.disabled =
      itens.length ===
        0;

    select.setAttribute(
      'aria-disabled',
      select.disabled
        ? 'true'
        : 'false'
    );

    if(
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
  }

  function solicitarFornecedoresSangria(){
    const cache =
      Array.isArray(
        suppliersDomain.suppliers
      )
        ? suppliersDomain.suppliers
        : [];

    if(cache.length){
      renderizarFornecedoresSangria(
        cache
      );
    }else{
      const select =
        document.getElementById(
          'scfCashMovementSupplier'
        );

      if(select){
        select.innerHTML =
          '<option value="">CARREGANDO FORNECEDORES...</option>';

        select.disabled =
          true;

        select.setAttribute(
          'aria-disabled',
          'true'
        );
      }
    }

    fornecedoresSangriaRequestId =
      'scf-cash-fornecedores-' +
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
            fornecedoresSangriaRequestId
        },
        '*'
      );
    }catch(error){
      if(!cache.length){
        renderizarFornecedoresSangria(
          []
        );
      }
    }
  }

  function sincronizarDetalheSangria(){
    const motivo =
      document.getElementById(
        'scfCashMovementReason'
      );

    const fornecedorField =
      document.getElementById(
        'scfCashMovementSupplierField'
      );

    const fornecedorSelect =
      document.getElementById(
        'scfCashMovementSupplier'
      );

    const descricaoField =
      document.getElementById(
        'scfCashMovementDescriptionField'
      );

    const descricaoInput =
      document.getElementById(
        'scfCashMovementDescription'
      );

    const motivoAtual =
      texto(
        motivo?.value
      ).toUpperCase();

    /*
     * SANGRIA:
     * - PAGAMENTO FORNECEDOR -> exibe FORNECEDOR;
     * - RETIRADA AVULSA -> exibe DESCRIÇÃO.
     *
     * SUPRIMENTO / ENTRADA:
     * - RECEBIMENTO AVULSO -> exibe DESCRIÇÃO;
     * - SUPRIMENTO DE CAIXA -> exibe DESCRIÇÃO.
     */
    if(
      movimentoTipo ===
        'SUPRIMENTO'
    ){
      if(fornecedorField){
        fornecedorField.hidden =
          true;
      }

      if(fornecedorSelect){
        fornecedorSelect.value =
          '';
      }

      const motivoValido =
        motivoAtual ===
          'RECEBIMENTO AVULSO' ||
        motivoAtual ===
          'SUPRIMENTO DE CAIXA';

      if(descricaoField){
        descricaoField.hidden =
          !motivoValido;
      }

      if(descricaoInput){
        descricaoInput.placeholder =
          motivoAtual ===
            'RECEBIMENTO AVULSO'
            ? 'DESCREVA O RECEBIMENTO'
            : 'DESCREVA O SUPRIMENTO';
      }

      if(motivoValido){
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

      if(descricaoInput){
        descricaoInput.value =
          '';
      }

      return;
    }

    /*
     * Fora de SANGRIA/SUPRIMENTO não existe seleção condicional.
     */
    if(
      movimentoTipo !==
        'SANGRIA'
    ){
      if(fornecedorField){
        fornecedorField.hidden =
          true;
      }

      if(descricaoField){
        descricaoField.hidden =
          true;
      }

      return;
    }

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

      solicitarFornecedoresSangria();

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

    /*
     * Nenhum MOTIVO escolhido:
     * FORNECEDOR e DESCRIÇÃO permanecem ocultos aguardando a escolha.
     */
    if(fornecedorSelect){
      fornecedorSelect.value =
        '';
    }

    if(descricaoInput){
      descricaoInput.value =
        '';
    }
  }

  function abrirFormularioMovimento(
    tipo
  ){
    if(
      !cashDomain.currentCash ||
      !cashDomain.currentCash.id
    ){
      return;
    }

    movimentoTipo =
      tipo;

    /*
     * SANGRIA e SUPRIMENTO usam dropdown obrigatório.
     *
     * SANGRIA:
     * - PAGAMENTO FORNECEDOR
     * - RETIRADA AVULSA
     *
     * SUPRIMENTO / ENTRADA:
     * - RECEBIMENTO AVULSO
     * - SUPRIMENTO DE CAIXA
     *
     * O mesmo ID é mantido para não alterar o envio ao backend,
     * comprovante e demais rotinas que leem scfCashMovementReason.
     */
    let motivoCampo =
      document.getElementById(
        'scfCashMovementReason'
      );

    const usaMotivoDropdown =
      tipo === 'SANGRIA' ||
      tipo === 'SUPRIMENTO';

    if(
      usaMotivoDropdown &&
      motivoCampo &&
      motivoCampo.tagName !== 'SELECT'
    ){
      const select =
        document.createElement(
          'select'
        );

      select.className =
        motivoCampo.className;

      select.id =
        'scfCashMovementReason';

      motivoCampo.replaceWith(
        select
      );

      motivoCampo =
        select;
    }else if(
      !usaMotivoDropdown &&
      motivoCampo &&
      motivoCampo.tagName === 'SELECT'
    ){
      const input =
        document.createElement(
          'input'
        );

      input.className =
        motivoCampo.className;

      input.id =
        'scfCashMovementReason';

      input.type =
        'text';

      input.maxLength =
        180;

      input.autocomplete =
        'off';

      motivoCampo.replaceWith(
        input
      );

      motivoCampo =
        input;
    }

    if(
      usaMotivoDropdown &&
      motivoCampo &&
      motivoCampo.tagName === 'SELECT'
    ){
      const opcoesMotivo =
        tipo === 'SANGRIA'
          ? [
              'PAGAMENTO FORNECEDOR',
              'RETIRADA AVULSA'
            ]
          : [
              'RECEBIMENTO AVULSO',
              'SUPRIMENTO DE CAIXA'
            ];

      motivoCampo.innerHTML =
        '';

      opcoesMotivo.forEach(
        function(opcaoTexto){
          const option =
            document.createElement(
              'option'
            );

          option.value =
            opcaoTexto;

          option.textContent =
            opcaoTexto;

          motivoCampo.appendChild(
            option
          );
        }
      );

      /*
       * Nenhuma opção começa selecionada. A escolha precisa ser explícita.
       */
      motivoCampo.selectedIndex =
        -1;

      motivoCampo.setAttribute(
        'aria-label',
        tipo === 'SANGRIA'
          ? 'Motivo da sangria'
          : 'Motivo da entrada'
      );

      if(
        motivoCampo.dataset
          .scfDetalheMovimentoListener !==
            '1'
      ){
        motivoCampo.addEventListener(
          'change',
          sincronizarDetalheSangria
        );

        motivoCampo.dataset
          .scfDetalheMovimentoListener =
            '1';
      }
    }

    const valor =
      document.getElementById(
        'scfCashMovementAmount'
      );

    const motivo =
      document.getElementById(
        'scfCashMovementReason'
      );

    const fornecedorField =
      document.getElementById(
        'scfCashMovementSupplierField'
      );

    const fornecedorSelect =
      document.getElementById(
        'scfCashMovementSupplier'
      );

    const descricaoField =
      document.getElementById(
        'scfCashMovementDescriptionField'
      );

    const descricaoInput =
      document.getElementById(
        'scfCashMovementDescription'
      );

    if(
      valor
    ){
      valor.value =
        '';
    }

    if(
      motivo
    ){
      motivo.value =
        '';
    }

    if(
      fornecedorSelect
    ){
      fornecedorSelect.value =
        '';
    }

    if(
      descricaoInput
    ){
      descricaoInput.value =
        '';
    }

    /*
     * Ao abrir SANGRIA, FORNECEDOR e DESCRIÇÃO ficam ocultos.
     * O MOTIVO escolhido decide qual dos dois será exibido.
     */
    if(
      fornecedorField
    ){
      fornecedorField.hidden =
        true;
    }

    if(
      descricaoField
    ){
      descricaoField.hidden =
        true;
    }

    sincronizarDetalheSangria();

    mostrarStatus(
      ''
    );

    mostrarStage(
      'movement',
      tipo ===
        'SANGRIA'
        ? 'SANGRIA'
        : 'ENTRADA',

      tipo ===
        'SANGRIA'
        ? 'INFORME O VALOR E O MOTIVO'
        : 'INFORME O VALOR, O MOTIVO E A DESCRIÇÃO'
    );

    if(
      valor
    ){
      window.setTimeout(
        function(){
          try{
            valor.focus({
              preventScroll:
                true
            });
          }catch(error){
            valor.focus();
          }
        },
        40
      );
    }
  }

  function abrirFormularioFechamento(){
    if(
      !cashDomain.currentCash ||
      !cashDomain.currentCash.id
    ){
      return;
    }

    movimentoTipo =
      '';

    const contado =
      document.getElementById(
        'scfCashCountedAmount'
      );

    const observacao =
      document.getElementById(
        'scfCashClosingNote'
      );

    if(
      contado
    ){
      contado.value =
        '';
    }

    if(
      observacao
    ){
      observacao.value =
        '';
    }

    atualizarDiferencaFechamento();

    mostrarStatus(
      ''
    );

    mostrarStage(
      'closing',
      'FECHAR CAIXA',
      'CONFIRA O DINHEIRO CONTADO'
    );

    if(
      contado
    ){
      window.setTimeout(
        function(){
          try{
            contado.focus({
              preventScroll:
                true
            });
          }catch(error){
            contado.focus();
          }
        },
        40
      );
    }
  }

  function removerBotaoCaixaDoMenu(){
    /*
     * O CAIXA não possui mais botão próprio no menu inferior.
     * Esta limpeza também remove uma eventual instância legada
     * criada antes deste script terminar de carregar.
     */
    try{
      const iframe =
        document.getElementById(
          '__htmlStatusIframe'
        );

      const doc =
        iframe &&
        (
          iframe.contentDocument ||
          iframe.contentWindow?.document
        );

      if(
        !doc
      ){
        return;
      }

      doc
        .getElementById(
          'caixaBtn'
        )
        ?.remove();

      doc
        .getElementById(
          'scf-caixa-menu-style'
        )
        ?.remove();
    }catch(error){
      console.warn(
        'SCF Caixa — não foi possível limpar o botão legado do menu:',
        error?.message ||
          error
      );
    }
  }

  panel
    .querySelectorAll(
      '[data-scf-cash-back]'
    )
    .forEach(
      function(button){
        button.addEventListener(
          'click',
          function(){
            if(
              stageAtual ===
                'closed'
            ){
              mostrarAberturaObrigatoriaAposFechamento();
              return;
            }

            fecharTela(
              true
            );
          }
        );
      }
    );

  document
    .getElementById(
      'scfCashOpeningAmount'
    )
    ?.addEventListener(
      'input',
      function(event){
        formatarFundoInicialDigitado(
          event.currentTarget
        );
      }
    );

  document
    .getElementById(
      'scfCashOpenButton'
    )
    ?.addEventListener(
      'click',
      function(){
        const campoSaldoInicial =
          document.getElementById(
            'scfCashOpeningAmount'
          );

        const saldoInicialTexto =
          texto(
            campoSaldoInicial?.value
          );

        if(
          !fundoInicialDigitadoValido(
            saldoInicialTexto
          )
        ){
          mostrarStatus(
            'Informe um fundo inicial válido.',
            true
          );

          return;
        }

        const saldoInicial =
          numeroMoeda(
            saldoInicialTexto
          );

        const observacao =
          texto(
            document
              .getElementById(
                'scfCashOpeningNote'
              )
              ?.value
          );

        if(
          saldoInicial <
            0
        ){
          mostrarStatus(
            'Informe um fundo inicial válido.',
            true
          );

          return;
        }

        /*
         * Durante a abertura, o andamento usa a MESMA linha visual
         * do subtítulo "INFORME O FUNDO INICIAL", sem criar uma
         * mensagem adicional abaixo do formulário.
         */
        mostrarStatus(
          ''
        );

        mostrarStage(
          'opening',
          'ABRIR CAIXA',
          'ABRINDO CAIXA...'
        );

        bloquearAcoes(
          true
        );

        requestEmAndamento =
          requestId(
            'caixa-abrir'
          );

        enviar({
          type:
            'SCF_CAIXA_ABRIR',

          requestId:
            requestEmAndamento,

          saldoInicial,

          observacao
        });
      }
    );

  document
    .getElementById(
      'scfCashWithdrawalButton'
    )
    ?.addEventListener(
      'click',
      function(){
        abrirFormularioMovimento(
          'SANGRIA'
        );
      }
    );

  movimentacaoShortcutButton
    ?.addEventListener(
      'click',
      function(){
        /*
         * TERMO DE FECHAMENTO:
         * F7 | VOLTAR fecha o termo e retorna imediatamente para a
         * abertura obrigatória de uma nova sessão de caixa.
         * Esta verificação precisa acontecer ANTES de fechar o comprovante,
         * pois o título do termo é o que identifica este estado especial.
         */
        if(
          reciboTermoFechamentoAberto()
        ){
          if(
            typeof cashDomain.getReceiptCloser() ===
              'function'
          ){
            cashDomain.closeReceipt();
          }

          mostrarAberturaObrigatoriaAposFechamento();
          return;
        }

        /*
         * Nos demais comprovantes internos de caixa, fecha o recibo antes
         * de executar o retorno normal do caixa.
         */
        if(
          document.body.classList.contains(
            'scf-cash-receipt-open'
          ) &&
          typeof cashDomain.getReceiptCloser() ===
            'function'
        ){
          cashDomain.closeReceipt();
        }

        if(
          atalhoCaixaEmModoConfirmarMovimento()
        ){
          confirmarMovimentoCaixa();
          return;
        }

        if(
          atalhoCaixaEmModoVoltar()
        ){
          if(
            reciboTermoFechamentoAberto()
          ){
            if(
              typeof cashDomain.getReceiptCloser() ===
                'function'
            ){
              cashDomain.closeReceipt();
            }

            mostrarAberturaObrigatoriaAposFechamento();
            return;
          }

          if(
            stageAtual ===
              'movement'
          ){
            /*
             * Na SANGRIA/SUPRIMENTO, F7 substitui a antiga seta:
             * volta somente para MOVIMENTAÇÃO DE CAIXA.
             */
            abrirResumo();
            return;
          }

          /*
           * No resumo MOVIMENTAÇÃO, F7 continua voltando ao PDV.
           */
          fecharTela(
            true
          );
          return;
        }

        if(
          atalhoCaixaEmModoFechar()
        ){
          abrirFormularioFechamento();
          return;
        }

        abrirAtalhoMovimentacao();
      }
    );

  /*
   * F11 executa exatamente o mesmo clique do botão MOVIMENTAÇÃO.
   * O atalho só é capturado quando o botão está realmente disponível
   * e visível no PDV; fora desse estado, F11 permanece livre.
   */
  document.addEventListener(
    'keydown',
    function(event){
      if(
        !event ||
        (
          event.key !== 'F11' &&
          event.code !== 'F11'
        )
      ){
        return;
      }

      if(
        !movimentacaoShortcutButton ||
        movimentacaoShortcutButton.disabled ||
        !shortcutGroup ||
        shortcutGroup.hidden ||
        !shortcutGroup.classList.contains('scf-visible') ||
        movimentacaoShortcutButton.getClientRects().length === 0 ||
        texto(
          movimentacaoShortcutButton.textContent
        ) !==
          'F11 | MOVIMENTAÇÃO'
      ){
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if(
        typeof event.stopImmediatePropagation ===
          'function'
      ){
        event.stopImmediatePropagation();
      }

      if(event.repeat){
        return;
      }

      movimentacaoShortcutButton.click();
    },
    true
  );

  /*
   * F7 | VOLTAR no caixa:
   * - SANGRIA/SUPRIMENTO -> volta para o resumo MOVIMENTAÇÃO;
   * - resumo MOVIMENTAÇÃO -> volta para o PDV.
   * Usa sempre o mesmo clique do botão inferior.
   */
  document.addEventListener(
    'keydown',
    function(event){
      if(
        !event ||
        (
          event.key !== 'F7' &&
          event.code !== 'F7'
        ) ||
        !atalhoCaixaEmModoVoltar()
      ){
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if(
        typeof event.stopImmediatePropagation ===
          'function'
      ){
        event.stopImmediatePropagation();
      }

      if(event.repeat){
        return;
      }

      movimentacaoShortcutButton?.click();
    },
    true
  );

  document
    .getElementById(
      'scfCashSupplyButton'
    )
    ?.addEventListener(
      'click',
      function(){
        abrirFormularioMovimento(
          'SUPRIMENTO'
        );
      }
    );

  document
    .getElementById(
      'scfCashMovementAmount'
    )
    ?.addEventListener(
      'input',
      function(event){
        formatarFundoInicialDigitado(
          event.currentTarget
        );
      }
    );

  document
    .getElementById(
      'scfCashMovementConfirmButton'
    )
    ?.addEventListener(
      'click',
      confirmarMovimentoCaixa
    );

  document
    .getElementById(
      'scfCashMovementCancel'
    )
    ?.addEventListener(
      'click',
      abrirResumo
    );

  function confirmarMovimentoCaixa(){
    if(
      !cashDomain.currentCash?.id ||
      !movimentoTipo
    ){
      return;
    }

    const valor =
      numeroMoeda(
        document
          .getElementById(
            'scfCashMovementAmount'
          )
          ?.value
      );

    const motivo =
      texto(
        document
          .getElementById(
            'scfCashMovementReason'
          )
          ?.value
      ).toLocaleUpperCase(
        'pt-BR'
      );

    const fornecedorSelect =
      document.getElementById(
        'scfCashMovementSupplier'
      );

    const fornecedorId =
      movimentoTipo ===
        'SANGRIA' &&
      motivo ===
        'PAGAMENTO FORNECEDOR'
        ? texto(
            fornecedorSelect?.value
          )
        : '';

    const fornecedorNome =
      movimentoTipo ===
        'SANGRIA' &&
      motivo ===
        'PAGAMENTO FORNECEDOR' &&
      fornecedorSelect &&
      fornecedorSelect.selectedIndex >=
        0
        ? texto(
            fornecedorSelect
              .options[
                fornecedorSelect.selectedIndex
              ]
              ?.dataset
              ?.scfFornecedorNome ||
            fornecedorSelect
              .options[
                fornecedorSelect.selectedIndex
              ]
              ?.textContent
          ).toLocaleUpperCase(
            'pt-BR'
          )
        : '';

    const descricao =
      (
        movimentoTipo ===
          'SANGRIA' &&
        motivo ===
          'RETIRADA AVULSA'
      ) ||
      movimentoTipo ===
        'SUPRIMENTO'
        ? texto(
            document
              .getElementById(
                'scfCashMovementDescription'
              )
              ?.value
          ).toLocaleUpperCase(
            'pt-BR'
          )
        : '';

    if(
      valor <=
        0
    ){
      mostrarStatus(
        'Informe um valor maior que zero.',
        true
      );

      return;
    }

    if(
      !motivo
    ){
      mostrarStatus(
        'Informe o motivo.',
        true
      );

      return;
    }

    if(
      movimentoTipo ===
        'SANGRIA' &&
      motivo ===
        'PAGAMENTO FORNECEDOR' &&
      !fornecedorId
    ){
      mostrarStatus(
        'Selecione o fornecedor.',
        true
      );

      return;
    }

    if(
      movimentoTipo ===
        'SANGRIA' &&
      motivo ===
        'RETIRADA AVULSA' &&
      !descricao
    ){
      mostrarStatus(
        'Informe a descrição da retirada.',
        true
      );

      return;
    }

    if(
      movimentoTipo ===
        'SUPRIMENTO' &&
      (
        motivo ===
          'RECEBIMENTO AVULSO' ||
        motivo ===
          'SUPRIMENTO DE CAIXA'
      ) &&
      !descricao
    ){
      mostrarStatus(
        'Informe a descrição da entrada.',
        true
      );

      return;
    }

    mostrarStatus(
      `Registrando ${movimentoTipo.toLowerCase()}...`
    );

    bloquearAcoes(
      true
    );

    requestEmAndamento =
      requestId(
        'caixa-movimento'
      );

    /*
     * A ponte do Wix já transporta o campo motivo. Os campos extras de
     * fornecedor/descrição podem ser descartados por versões antigas da ponte,
     * então o detalhe também segue encapsulado no motivo para a API da VPS
     * extrair e persistir. A API remove o sufixo antes de gravar o motivo.
     */
    const motivoEnvio =
      (
        movimentoTipo ===
          'SANGRIA' ||
        movimentoTipo ===
          'SUPRIMENTO'
      )
        ? motivo +
          '||SCFDETALHE||' +
          encodeURIComponent(
            JSON.stringify({
              fornecedorId,
              fornecedorNome,
              descricao
            })
          )
        : motivo;

    enviar({
      type:
        'SCF_CAIXA_MOVIMENTO_REGISTRAR',

      requestId:
        requestEmAndamento,

      caixaSessaoId:
        cashDomain.currentCash.id,

      tipo:
        movimentoTipo,

      valor,

      motivo:
        motivoEnvio,

      operadorNome:
        texto(
          document.getElementById(
            'scfPdvOperatorName'
          )?.textContent
        ),

      fornecedorId,

      fornecedorNome,

      descricao
    });
  }

  /*
   * FINANCEIRO - SAÍDA — CADASTRO DE CONTA A PAGAR.
   *
   * Este formulário NÃO registra SANGRIA e NÃO depende de caixa aberto.
   * Ele envia um lançamento financeiro independente para o backend.
   */
  window.__scfPdvInfra.eventBus.on('scf:financeiro-saida-cadastrar',
    function(event){
      const dados =
        event &&
        event.detail &&
        typeof event.detail === 'object'
          ? event.detail
          : {};

      const retorno =
        function(ok,message){
          window.__scfPdvInfra.eventBus.dispatch(
            new CustomEvent(
              'scf:financeiro-saida-status',
              {
                detail:{
                  requestId:
                    texto(dados.requestId),
                  ok:
                    ok === true,
                  message:
                    texto(message)
                }
              }
            )
          );
        };

      const valor = Number(dados.valor);
      const vencimento = texto(dados.vencimento);
      const motivo = texto(dados.motivo).toLocaleUpperCase('pt-BR');
      const fornecedorId = texto(dados.fornecedorId);
      const fornecedorNome = texto(dados.fornecedorNome).toLocaleUpperCase('pt-BR');
      const descricao = texto(dados.descricao).toLocaleUpperCase('pt-BR');

      if(!Number.isFinite(valor) || valor <= 0){
        retorno(false,'Informe um valor maior que zero.');
        return;
      }

      if(
        motivo !== 'PAGAMENTO FORNECEDOR' &&
        motivo !== 'RETIRADA AVULSA'
      ){
        retorno(false,'Selecione o motivo da conta a pagar.');
        return;
      }

      if(motivo === 'PAGAMENTO FORNECEDOR' && !fornecedorId){
        retorno(false,'Selecione o fornecedor.');
        return;
      }

      if(motivo === 'RETIRADA AVULSA' && !descricao){
        retorno(false,'Informe a descrição da conta a pagar.');
        return;
      }

      const identificador =
        texto(dados.requestId) ||
        requestId('financeiro-conta-pagar');

      enviar({
        type:'SCF_FINANCEIRO_CONTA_PAGAR_CADASTRAR',
        requestId:identificador,
        valor,
        vencimento,
        motivo,
        fornecedorId,
        fornecedorNome,
        descricao
      });

      retorno(true,'CADASTRANDO CONTA A PAGAR...');
    }
  );

  document
    .getElementById(
      'scfCashBeginCloseButton'
    )
    ?.addEventListener(
      'click',
      abrirFormularioFechamento
    );

  document
    .getElementById(
      'scfCashCloseCancel'
    )
    ?.addEventListener(
      'click',
      abrirResumo
    );

  document
    .getElementById(
      'scfCashCountedAmount'
    )
    ?.addEventListener(
      'input',
      function(event){
        /*
         * FECHAMENTO DE CAIXA — DINHEIRO CONTADO.
         * Mantém a digitação em centavos e aplica a máscara BRL em tempo real.
         * Ex.: 1 -> R$ 0,01; 10199 -> R$ 101,99.
         */
        formatarFundoInicialDigitado(
          event.currentTarget
        );

        atualizarDiferencaFechamento();
      }
    );

  document
    .getElementById(
      'scfCashCloseConfirm'
    )
    ?.addEventListener(
      'click',
      function(){
        if(
          !cashDomain.currentCash?.id
        ){
          return;
        }

        const contadoInput =
          document.getElementById(
            'scfCashCountedAmount'
          );

        const valorTexto =
          texto(
            contadoInput?.value
          );

        if(
          !valorTexto
        ){
          mostrarStatus(
            'Informe o dinheiro contado.',
            true
          );

          return;
        }

        const saldoContado =
          numeroMoeda(
            valorTexto
          );

        if(
          saldoContado <
            0
        ){
          mostrarStatus(
            'O dinheiro contado não pode ser negativo.',
            true
          );

          return;
        }

        const observacao =
          texto(
            document
              .getElementById(
                'scfCashClosingNote'
              )
              ?.value
          );

        mostrarStatus(
          'Fechando caixa...'
        );

        bloquearAcoes(
          true
        );

        requestEmAndamento =
          requestId(
            'caixa-fechar'
          );

        enviar({
          type:
            'SCF_CAIXA_FECHAR',

          requestId:
            requestEmAndamento,

          caixaSessaoId:
            cashDomain.currentCash.id,

          saldoContado,

          observacao
        });
      }
    );

  window.__scfPdvInfra.shellBridge.onMessage(
    function(event){
      const mensagem =
        event &&
        event.data &&
        typeof event.data ===
          'object'
          ? event.data
          : null;

      if(
        !mensagem
      ){
        return;
      }

      if(
        mensagem.type ===
          'SCF_FORNECEDORES_LISTA_RESULTADO' &&
        (
          !mensagem.requestId ||
          texto(
            mensagem.requestId
          ) ===
            texto(
              fornecedoresSangriaRequestId
            )
        )
      ){
        fornecedoresSangriaRequestId =
          '';

        const lista =
          Array.isArray(
            mensagem.fornecedores
          )
            ? mensagem.fornecedores
            : [];

        suppliersDomain.suppliers =
          lista.slice();

        if(
          movimentoTipo ===
            'SANGRIA'
        ){
          renderizarFornecedoresSangria(
            lista
          );
        }

        return;
      }

      if(
        mensagem.type ===
          'SCF_FORNECEDORES_LISTA_ERRO' &&
        (
          !mensagem.requestId ||
          texto(
            mensagem.requestId
          ) ===
            texto(
              fornecedoresSangriaRequestId
            )
        )
      ){
        fornecedoresSangriaRequestId =
          '';

        if(
          movimentoTipo ===
            'SANGRIA' &&
          !Array.isArray(
            suppliersDomain.suppliers
          )
        ){
          renderizarFornecedoresSangria(
            []
          );
        }

        return;
      }

      if(
        mensagem.type ===
          'SCF_CAIXA_TELA_ABRIR'
      ){
        if(
          aberturaObrigatoria ===
            true
        ){
          /*
           * A obrigação continua ativa, mas fora do PDV ela não pode
           * sobrepor VENDAS, ESTOQUE, CADASTRO ou FINANCEIRO.
           */
          if(
            aberturaObrigatoriaOcultaForaPdv ===
              true
          ){
            return;
          }

          mostrarAberturaObrigatoriaNoPdv();

          return;
        }

        abrirTela();
        return;
      }

      const tiposCaixa =
        new Set([
          'SCF_CAIXA_CONSULTA_RESULTADO',
          'SCF_CAIXA_ABERTO',
          'SCF_CAIXA_MOVIMENTO_REGISTRADO',
          'SCF_CAIXA_FECHADO',
          'SCF_CAIXA_CONSULTA_ERRO',
          'SCF_CAIXA_ABERTURA_ERRO',
          'SCF_CAIXA_MOVIMENTO_ERRO',
          'SCF_CAIXA_FECHAMENTO_ERRO'
        ]);

      const consultaInicialSilenciosa =
        consultaInicialAutomatica ===
          true &&
        (
          mensagem.type ===
            'SCF_CAIXA_CONSULTA_RESULTADO' ||
          mensagem.type ===
            'SCF_CAIXA_CONSULTA_ERRO'
        );

      if(
        !tiposCaixa.has(
          mensagem.type
        ) ||
        (
          !painelAberto() &&
          !consultaInicialSilenciosa
        )
      ){
        return;
      }

      if(
        mensagem.requestId &&
        requestEmAndamento &&
        texto(
          mensagem.requestId
        ) !==
          texto(
            requestEmAndamento
          )
      ){
        return;
      }

      bloquearAcoes(
        false
      );

      if(
        mensagem.type ===
          'SCF_CAIXA_CONSULTA_RESULTADO'
      ){
        requestEmAndamento =
          '';

        mostrarStatus(
          ''
        );

        if(
          mensagem.aberto ===
            true &&
          mensagem.caixa
        ){
          atualizarResumo(
            mensagem.caixa
          );

          if(
            consultaInicialAutomatica ===
              true ||
            aberturaObrigatoria ===
              true
          ){
            /*
             * O caixa já está aberto: a consulta de entrada termina
             * silenciosamente e o card volta a ser FOTO DO PRODUTO.
             */
            consultaInicialAutomatica =
              false;

            aberturaObrigatoria =
              false;

            fecharTela(
              false,
              true
            );

            return;
          }

          /*
           * F11 abre o resumo e dispara uma atualização assíncrona do caixa.
           * Se o operador entrar em SANGRIA/SUPRIMENTO antes dessa consulta
           * retornar, a resposta NÃO pode expulsá-lo do formulário e voltar
           * para MOVIMENTAÇÃO.
           *
           * Nesse caso apenas atualizamos os dados do caixa e preservamos
           * exatamente o estágio em que o operador já está.
           */
          if(
            stageAtual === 'movement' ||
            stageAtual === 'closing'
          ){
            atualizarAtalhoSangria();
            return;
          }

          mostrarStage(
            'opened',
            'CAIXA ABERTO',
            'MOVIMENTAÇÃO E FECHAMENTO'
          );
        }else{
          cashDomain.currentCash =
            null;

          if(
            consultaInicialAutomatica ===
              true
          ){
            consultaInicialAutomatica =
              false;

            aberturaObrigatoria =
              true;

            document.body.classList.add(
              'scf-caixa-abertura-obrigatoria'
            );

            /*
             * Só agora, depois da confirmação de que NÃO há caixa aberto,
             * torna a abertura obrigatória visível. A consulta anterior
             * permaneceu totalmente silenciosa para quem já tinha caixa aberto.
             */
            prepararExclusividadeVisual();

            panel.hidden =
              false;

            panel.setAttribute(
              'aria-hidden',
              'false'
            );

            photoFrame.classList.add(
              'is-cash-open'
            );

            document.body.classList.add(
              'scf-caixa-open'
            );
          }

          const inicial =
            document.getElementById(
              'scfCashOpeningAmount'
            );

          const nota =
            document.getElementById(
              'scfCashOpeningNote'
            );

          if(
            inicial
          ){
            inicial.value =
              '';
          }

          if(
            nota
          ){
            nota.value =
              '';
          }

          mostrarStage(
            'opening',
            'ABRIR CAIXA',
            'INFORME O FUNDO INICIAL'
          );
        }

        return;
      }

      if(
        mensagem.type ===
          'SCF_CAIXA_ABERTO'
      ){
        mostrarStatus(
          mensagem.message ||
          'Caixa aberto com sucesso.',
          false,
          true
        );

        bloquearAcoes(
          true
        );

        requestEmAndamento =
          requestId(
            'caixa-consulta'
          );

        enviar({
          type:
            'SCF_CAIXA_CONSULTAR',

          requestId:
            requestEmAndamento,

          incluirResumo:
            true
        });

        return;
      }

      if(
        mensagem.type ===
          'SCF_CAIXA_MOVIMENTO_REGISTRADO'
      ){
        requestEmAndamento =
          '';

        if(
          cashDomain.currentCash
        ){
          cashDomain.currentCash = {
            ...cashDomain.currentCash,

            saldoEsperado:
              mensagem.saldoEsperado,

            resumo:
              mensagem.resumo ||
              cashDomain.currentCash.resumo
          };
        }

        atualizarResumo(
          cashDomain.currentCash
        );

        movimentoTipo =
          '';

        mostrarStage(
          'opened',
          'CAIXA ABERTO',
          'MOVIMENTAÇÃO E FECHAMENTO'
        );

        mostrarStatus(
          mensagem.message ||
          'Movimento registrado com sucesso.',
          false,
          true
        );

        return;
      }

      if(
        mensagem.type ===
          'SCF_CAIXA_FECHADO'
      ){
        requestEmAndamento =
          '';

        const caixa =
          mensagem.caixa ||
          {};

        definirMoeda(
          'scfCashClosedExpected',
          caixa.saldoEsperado
        );

        definirMoeda(
          'scfCashClosedCounted',
          caixa.saldoContado
        );

        definirMoeda(
          'scfCashClosedDifference',
          caixa.diferenca
        );

        cashDomain.currentCash =
          null;

        movimentoTipo =
          '';

        /*
         * Fechamento confirmado pelo backend: não deixa o PDV voltar
         * para a tela de venda sem caixa. O próximo estado já é a
         * abertura obrigatória de uma nova sessão.
         */
        mostrarAberturaObrigatoriaAposFechamento();

        return;
      }

      if(
        mensagem.type ===
          'SCF_CAIXA_CONSULTA_ERRO' ||
        mensagem.type ===
          'SCF_CAIXA_ABERTURA_ERRO' ||
        mensagem.type ===
          'SCF_CAIXA_MOVIMENTO_ERRO' ||
        mensagem.type ===
          'SCF_CAIXA_FECHAMENTO_ERRO'
      ){
        requestEmAndamento =
          '';

        /* Se a abertura falhar, devolve o subtítulo original antes
         * de exibir a mensagem de erro e liberar uma nova tentativa. */
        if(
          mensagem.type ===
            'SCF_CAIXA_ABERTURA_ERRO'
        ){
          mostrarStage(
            'opening',
            'ABRIR CAIXA',
            'INFORME O FUNDO INICIAL'
          );
        }

        mostrarStatus(
          mensagem.message ||
          'Não foi possível concluir a operação de caixa.',
          true
        );

        if(
          mensagem.type ===
            'SCF_CAIXA_CONSULTA_ERRO'
        ){
          /*
           * Falha/timeout NÃO significa caixa fechado.
           * Nunca liberamos o formulário ABRIR CAIXA apenas porque a
           * consulta falhou; isso evita uma segunda abertura indevida.
           */
          if(
            consultaInicialAutomatica ===
              true
          ){
            consultaInicialAutomatica =
              false;

            aberturaObrigatoria =
              true;

            document.body.classList.add(
              'scf-caixa-abertura-obrigatoria'
            );

            prepararExclusividadeVisual();

            panel.hidden =
              false;

            panel.setAttribute(
              'aria-hidden',
              'false'
            );

            photoFrame.classList.add(
              'is-cash-open'
            );

            document.body.classList.add(
              'scf-caixa-open'
            );

            mostrarStage(
              'loading',
              'CAIXA',
              'NÃO FOI POSSÍVEL CONSULTAR O CAIXA'
            );
          }else if(
            cashDomain.currentCash &&
            cashDomain.currentCash.id
          ){
            /*
             * A sessão já havia sido confirmada como ABERTA pela consulta
             * rápida. Se apenas a atualização do resumo falhar, preserva
             * o estado ABERTO e não oferece uma nova abertura de caixa.
             */
            aberturaObrigatoria =
              false;

            document.body.classList.remove(
              'scf-caixa-abertura-obrigatoria'
            );

            atualizarResumo(
              cashDomain.currentCash
            );

            mostrarStage(
              'opened',
              'CAIXA ABERTO',
              'NÃO FOI POSSÍVEL ATUALIZAR O RESUMO'
            );
          }else{
            mostrarStage(
              'loading',
              'CAIXA',
              'NÃO FOI POSSÍVEL CONSULTAR O CAIXA'
            );
          }
        }

        return;
      }
    }
  );

  document.addEventListener(
    'keydown',
    function(event){
      if(
        event.key ===
          'Escape' &&
        painelAberto()
      ){
        event.preventDefault();

        if(
          stageAtual ===
            'movement' ||
          stageAtual ===
            'closing'
        ){
          abrirResumo();
        }else{
          fecharTela(
            true
          );
        }
      }
    }
  );

  /*
   * CORREÇÃO — RETORNO DO FINANCEIRO PARA O PDV COM CAIXA FECHADO.
   *
   * Enquanto o operador visita o FINANCEIRO, a abertura obrigatória do
   * caixa é apenas ocultada. Ao fechar o FINANCEIRO pelo X e voltar ao PDV,
   * reafirmamos o mesmo estado local antes que qualquer restauração visual
   * do card direito possa deixar o PDV com aparência de caixa aberto.
   */
  window.__scfPdvInfra.eventBus.on('scf:financeiro-retorno-pdv',
    function(){
      if(
        aberturaObrigatoria !==
          true
      ){
        return;
      }

      consultaInicialAutomatica =
        false;

      mostrarAberturaObrigatoriaNoPdv();

      mostrarStage(
        'opening',
        'ABRIR CAIXA',
        'INFORME O FUNDO INICIAL'
      );

      atualizarAtalhoSangria();
    }
  );

  function iniciar(){
    /*
     * A entrada no PDV permanece visualmente normal enquanto a situação
     * do caixa é consultada em segundo plano. ABRIR CAIXA só aparece se
     * o backend confirmar que não existe caixa aberto.
     */
    document.body.classList.remove(
      'scf-caixa-abertura-obrigatoria'
    );

    removerBotaoCaixaDoMenu();

    const iframe =
      document.getElementById(
        '__htmlStatusIframe'
      );

    function fecharMovimentacaoAoTrocarPagina(
      botao
    ){
      const idBotao =
        texto(
          botao &&
          botao.id
        );

      /*
       * Caixa fechado:
       * - PDV continua bloqueado e mostra ABRIR CAIXA;
       * - todos os demais módulos continuam liberados.
       */
      if(
        aberturaObrigatoria ===
          true
      ){
        if(
          idBotao ===
            'statusButton'
        ){
          window.setTimeout(
            mostrarAberturaObrigatoriaNoPdv,
            0
          );

          window.setTimeout(
            mostrarAberturaObrigatoriaNoPdv,
            60
          );
        }else{
          ocultarAberturaObrigatoriaForaPdv();
        }

        return;
      }

      if(
        painelAberto() ||
        document.body.classList.contains(
          'scf-caixa-open'
        )
      ){
        fecharTela(
          false,
          true
        );
      }
    }

    function vincularFechamentoAoMenu(){
      try{
        const menuIframe =
          document.getElementById(
            '__htmlStatusIframe'
          );

        const menuDoc =
          menuIframe &&
          (
            menuIframe.contentDocument ||
            menuIframe.contentWindow?.document
          );

        if(
          !menuDoc ||
          menuDoc.documentElement?.dataset
            ?.scfCashNavigationCloseReady === '1'
        ){
          return;
        }

        if(
          menuDoc.documentElement
        ){
          menuDoc.documentElement.dataset
            .scfCashNavigationCloseReady = '1';
        }

        menuDoc.addEventListener(
          'click',
          function(event){
            const botao =
              event.target &&
              event.target.closest
                ? event.target.closest(
                    '#localizacaoBtn,#cadastrarBtn,#statusButton,#bloqueioBtn,#admin'
                  )
                : null;

            if(!botao){
              return;
            }

            fecharMovimentacaoAoTrocarPagina(
              botao
            );
          },
          false
        );
      }catch(error){}
    }

    if(
      iframe
    ){
      iframe.addEventListener(
        'load',
        function(){
          window.setTimeout(
            removerBotaoCaixaDoMenu,
            40
          );

          window.setTimeout(
            vincularFechamentoAoMenu,
            45
          );
        }
      );
    }

    vincularFechamentoAoMenu();

    window.__scfPdvInfra.shellBridge.onMessage(
      function(event){
        if(
          aberturaObrigatoria !==
            true
        ){
          return;
        }

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
            'SCF_FISCAL_HOME_ABRIR' ||
          data.type ===
            'SCF_MENU_SELECIONAR_CENTRAL' ||
          data.type ===
            'SCF_MENU_SELECIONAR_PRIMEIRO'
        ){
          window.setTimeout(
            mostrarAberturaObrigatoriaNoPdv,
            0
          );

          window.setTimeout(
            mostrarAberturaObrigatoriaNoPdv,
            60
          );

          return;
        }

        if(
          data.type ===
            'SCF_HISTORICO_VENDAS_ABRIR' ||
          data.type ===
            'SCF_MENU_SELECIONAR_ESTOQUE' ||
          data.type ===
            'SCF_MENU_SELECIONAR_CADASTRAR' ||
          (
            data.type ===
              'SCF_LAYOUT_PRINCIPAL_PAGINA_SOLICITADA' &&
            texto(
              data.pagina
            ).toUpperCase() !==
              ''
          )
        ){
          const pagina =
            texto(
              data.pagina
            ).toUpperCase();

          if(
            pagina ===
              'PDV' ||
            pagina ===
              'FISCALHOME'
          ){
            window.setTimeout(
              mostrarAberturaObrigatoriaNoPdv,
              0
            );

            return;
          }

          ocultarAberturaObrigatoriaForaPdv();
        }
      }
    );

    /*
     * Aguarda a ponte Wix terminar de registrar os listeners e então
     * consulta o caixa automaticamente. Não há mais clique em CAIXA.
     */
    window.setTimeout(
      verificarCaixaInicial,
      250
    );

    window.setTimeout(
      removerBotaoCaixaDoMenu,
      500
    );

    window.setTimeout(
      removerBotaoCaixaDoMenu,
      1200
    );

    window.setTimeout(
      atualizarAtalhoSangria,
      450
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
        once:
          true
      }
    );
  }else{
    iniciar();
  }
})();
