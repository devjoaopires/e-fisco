(function(){
  'use strict';

  const salePaymentDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.salePayment;

  if(!salePaymentDomain){
    throw new Error(
      'PDV sale/payment domain indisponivel.'
    );
  }

  const continuityDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.continuity;

  if(!continuityDomain){
    throw new Error(
      'PDV continuity domain indisponivel para payment.'
    );
  }

  /*
   * O Wix pode reconstruir o HTML sem destruir imediatamente
   * elementos criados por uma execução anterior do script.
   * Remover as cópias antigas garante que o card CPF também
   * seja recriado e conectado ao fluxo atual.
   */
  [
    'finalizeSupportCardOverlay',
    'cpfFiscalCardOverlay',
    'saleValidationWaitingOverlay',
    'saleCompletedCardOverlay'
  ].forEach(function(id){
    const antigo=document.getElementById(id);
    if(antigo) antigo.remove();
  });

  const overlay = document.createElement('div');
  overlay.id = 'finalizeSupportCardOverlay';
  overlay.className = 'block-confirm-overlay finalize-flow-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.display = 'none';
  overlay.innerHTML = [
    '<div aria-labelledby="finalizeScTitle" aria-modal="true" class="block-confirm-card" role="dialog">',
    '<div class="bc-title" id="finalizeScTitle">FINALIZAR VENDA</div>',
    '<div class="bc-warn">ESCOLHA A FORMA DE PAGAMENTO</div>',
    '<div class="bc-actions support-actions">',
    '<button class="bp-btn success" id="finalizeScWhatsappBtn" type="button">PAGO</button>',
    '<button class="bp-btn primary" id="finalizeScTechBtn" type="button">CANCELAR</button>',
    '</div>',
    '</div>'
  ].join('');
  document.body.appendChild(overlay);


  /*
   * Card obrigatório depois que o operador confirma
   * a forma de pagamento e antes de registrar a venda
   * como paga.
   *
   * Não possui X e não fecha pelo fundo.
   */
  const cpfOverlay = document.createElement('div');
  cpfOverlay.id = 'cpfFiscalCardOverlay';
  cpfOverlay.className = 'block-confirm-overlay finalize-flow-overlay';
  cpfOverlay.setAttribute('aria-hidden', 'true');
  cpfOverlay.style.display = 'none';
  cpfOverlay.innerHTML = [
    '<div aria-labelledby="cpfFiscalCardTitle" aria-modal="true" class="block-confirm-card" role="dialog">',
    '<div class="bc-title" id="cpfFiscalCardTitle">IDENTIFICAÇÃO NA NOTA</div>',
    '<div class="finalize-person-type" role="radiogroup" aria-label="Tipo de pessoa">',
    '<label class="finalize-person-type-option" for="tipoPessoaFisica">',
    '<input checked id="tipoPessoaFisica" name="tipoPessoaFiscal" type="radio" value="FISICA">',
    '<span aria-hidden="true" class="finalize-person-type-dot"></span>',
    '<span class="finalize-person-type-text">PESSOA FISICA</span>',
    '</label>',
    '<label class="finalize-person-type-option" for="tipoPessoaJuridica">',
    '<input id="tipoPessoaJuridica" name="tipoPessoaFiscal" type="radio" value="JURIDICA">',
    '<span aria-hidden="true" class="finalize-person-type-dot"></span>',
    '<span class="finalize-person-type-text">PESSOA JURIDICA</span>',
    '</label>',
    '</div>',
    '<div class="finalize-cpf-wrap">',
    '<label class="finalize-identification-label" id="cpfFiscalLabel" for="cpfFiscalInput">CPF</label>',
    '<div class="finalize-cpf-input-shell" id="cpfFiscalInputShell">',
    '<input autocomplete="off" class="finalize-cpf-input" id="cpfFiscalInput" inputmode="numeric" maxlength="14" placeholder="" type="text" aria-label="CPF do consumidor">',
    '<span aria-hidden="true" class="finalize-cpf-hint is-visible" data-doc-hint="cpf">000.000.000-00</span>',
    '<span aria-hidden="true" class="finalize-cpf-hint" data-doc-hint="cnpj">00.000.000/0000-00</span>',
    '</div>',
    '<label class="finalize-identification-label" id="whatsappFiscalLabel" for="whatsappFiscalInput">NFC-e VIA WHATSAPP</label>',
    '<input autocomplete="tel" class="finalize-whatsapp-input" id="whatsappFiscalInput" inputmode="tel" maxlength="15" placeholder="(00) 00000-0000" type="tel" aria-label="WhatsApp do consumidor">',
    '</div>',
    '</div>'
  ].join('');
  document.body.appendChild(cpfOverlay);

  const cpfInput = cpfOverlay.querySelector('#cpfFiscalInput');
  const cpfInputShell = cpfOverlay.querySelector('#cpfFiscalInputShell');
  const cpfLabel = cpfOverlay.querySelector('#cpfFiscalLabel');
  const whatsappFiscalLabel = cpfOverlay.querySelector('#whatsappFiscalLabel');
  const tipoPessoaRadios = Array.from(cpfOverlay.querySelectorAll('input[name="tipoPessoaFiscal"]'));
  const cpfHintItems = Array.from(cpfOverlay.querySelectorAll('.finalize-cpf-hint'));
  let tipoPessoaSelecionada = 'FISICA';
  let cpfHintIndex = 0;
  let cpfHintIntervalId = null;
  const whatsappInput = cpfOverlay.querySelector('#whatsappFiscalInput');
  const cpfInformButton = cpfOverlay.querySelector('#cpfInformButton');
  const cpfCloseButton = cpfOverlay.querySelector('#cpfCloseButton');

  function getDocumentoTipoAtual(){
    return tipoPessoaSelecionada === 'JURIDICA' ? 'CNPJ' : 'CPF';
  }

  function cpfSomenteDigitos(valor){
    const limite = getDocumentoTipoAtual() === 'CNPJ' ? 14 : 11;
    return String(valor || '').replace(/\D/g,'').slice(0, limite);
  }

  function formatarCpfFiscal(valor){
    const documento=cpfSomenteDigitos(valor);

    if(getDocumentoTipoAtual()==='CNPJ'){
      if(documento.length<=2) return documento;
      if(documento.length<=5) return documento.replace(/^(\d{2})(\d+)/,'$1.$2');
      if(documento.length<=8) return documento.replace(/^(\d{2})(\d{3})(\d+)/,'$1.$2.$3');
      if(documento.length<=12) return documento.replace(/^(\d{2})(\d{3})(\d{3})(\d+)/,'$1.$2.$3/$4');
      return documento.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})$/,'$1.$2.$3/$4-$5');
    }

    if(documento.length<=3) return documento;
    if(documento.length<=6) return documento.replace(/^(\d{3})(\d+)/,'$1.$2');
    if(documento.length<=9) return documento.replace(/^(\d{3})(\d{3})(\d+)/,'$1.$2.$3');
    return documento.replace(/^(\d{3})(\d{3})(\d{3})(\d{1,2})$/,'$1.$2.$3-$4');
  }

  function cpfFiscalValido(valor){
    const documento=cpfSomenteDigitos(valor);
    if(!documento) return false;

    if(getDocumentoTipoAtual()==='CPF' && documento.length===11){
      if(/^(\d)\1{10}$/.test(documento)) return false;
      function calcularDigitoCpf(quantidade){
        let soma=0;
        for(let indice=0;indice<quantidade;indice+=1){
          soma+=Number(documento[indice])*(quantidade+1-indice);
        }
        const resto=soma%11;
        return resto<2 ? 0 : 11-resto;
      }
      return Number(documento[9])===calcularDigitoCpf(9) &&
        Number(documento[10])===calcularDigitoCpf(10);
    }

    if(getDocumentoTipoAtual()==='CNPJ' && documento.length===14){
      if(/^(\d)\1{13}$/.test(documento)) return false;
      function calcularDigitoCnpj(tamanho){
        const base = documento.slice(0, tamanho);
        let soma = 0;
        let pos = tamanho - 7;
        for(let i = tamanho; i >= 1; i -= 1){
          soma += Number(base[tamanho - i]) * pos;
          pos -= 1;
          if(pos < 2) pos = 9;
        }
        const resto = soma % 11;
        return resto < 2 ? 0 : 11 - resto;
      }
      return Number(documento[12])===calcularDigitoCnpj(12) &&
        Number(documento[13])===calcularDigitoCnpj(13);
    }

    return false;
  }

  function showCpfHintByIndex(index){
    if(!cpfHintItems.length) return;
    cpfHintItems.forEach(function(item, itemIndex){
      item.classList.toggle('is-visible', itemIndex === index);
    });
  }

  function syncCpfHintState(){
    const hasValue = !!String(cpfInput && cpfInput.value || '').trim();
    const tipoDoc = getDocumentoTipoAtual();
    cpfHintIndex = tipoDoc === 'CNPJ' ? 1 : 0;

    if(cpfInputShell) cpfInputShell.classList.toggle('has-value', hasValue);

    if(hasValue){
      cpfHintItems.forEach(function(item){ item.classList.remove('is-visible'); });
      return;
    }

    showCpfHintByIndex(cpfHintIndex);
  }

  function stopCpfHintRotation(){
    if(cpfHintIntervalId){
      clearInterval(cpfHintIntervalId);
      cpfHintIntervalId = null;
    }
  }

  function startCpfHintRotation(){
    stopCpfHintRotation();
    syncCpfHintState();
  }

  function syncTipoPessoaFiscalUI(limparDocumento){
    const tipoDoc = getDocumentoTipoAtual();

    tipoPessoaRadios.forEach(function(radio){
      radio.checked = radio.value === tipoPessoaSelecionada;
    });

    if(cpfLabel){
      cpfLabel.textContent = tipoDoc;
    }

    if(whatsappFiscalLabel){
      whatsappFiscalLabel.textContent =
        tipoPessoaSelecionada === 'JURIDICA'
          ? 'NF-e VIA WHATSAPP'
          : 'NFC-e VIA WHATSAPP';
    }

    if(cpfInput){
      if(limparDocumento){
        cpfInput.value = '';
      }
      cpfInput.maxLength = tipoDoc === 'CNPJ' ? 18 : 14;
      cpfInput.setAttribute(
        'aria-label',
        tipoDoc === 'CNPJ' ? 'CNPJ do consumidor' : 'CPF do consumidor'
      );
      cpfInput.setCustomValidity('');
      cpfInput.value = formatarCpfFiscal(cpfInput.value);
    }

    syncCpfHintState();
  }

  function resetTipoPessoaFiscal(){
    tipoPessoaSelecionada = 'FISICA';
    syncTipoPessoaFiscalUI(true);
  }

  tipoPessoaRadios.forEach(function(radio){
    radio.addEventListener('change', function(){
      if(!this.checked) return;
      tipoPessoaSelecionada = this.value === 'JURIDICA' ? 'JURIDICA' : 'FISICA';
      syncTipoPessoaFiscalUI(true);
    });
  });

  syncTipoPessoaFiscalUI(false);

  if(cpfInput){
    cpfInput.addEventListener('focus', function(){
      syncCpfHintState();
    });

    cpfInput.addEventListener('blur', function(){
      syncCpfHintState();
    });

    cpfInput.addEventListener('input',function(){
      this.value=formatarCpfFiscal(this.value);
      this.setCustomValidity('');
      syncCpfHintState();
    });
  }

  syncCpfHintState();
  startCpfHintRotation();


  function whatsappSomenteDigitos(valor){
    return String(valor || '')
      .replace(/\D/g,'')
      .slice(0,13);
  }

  function normalizarWhatsappFiscal(valor){
    let numero=whatsappSomenteDigitos(valor);

    if(
      numero.startsWith('0') &&
      (
        numero.length===11 ||
        numero.length===12
      )
    ){
      numero=numero.slice(1);
    }

    if(
      (
        numero.length===10 ||
        numero.length===11
      ) &&
      !numero.startsWith('55')
    ){
      numero='55'+numero;
    }

    return numero;
  }

  function formatarWhatsappFiscal(valor){
    let numero=whatsappSomenteDigitos(valor);

    if(
      numero.startsWith('55') &&
      (
        numero.length===12 ||
        numero.length===13
      )
    ){
      numero=numero.slice(2);
    }

    if(numero.length<=2) return numero;
    if(numero.length<=6){
      return numero.replace(
        /^(\d{2})(\d+)/,
        '($1) $2'
      );
    }

    if(numero.length<=10){
      return numero.replace(
        /^(\d{2})(\d{4})(\d{1,4})$/,
        '($1) $2-$3'
      );
    }

    return numero.replace(
      /^(\d{2})(\d{5})(\d{1,4})$/,
      '($1) $2-$3'
    );
  }

  function whatsappFiscalValido(valor){
    const numero=
      normalizarWhatsappFiscal(
        valor
      );

    return /^55[1-9]\d{9,10}$/.test(numero) &&
      !/^(\d)\1+$/.test(numero);
  }

  if(whatsappInput){
    whatsappInput.addEventListener('input',function(){
      this.value=
        formatarWhatsappFiscal(
          this.value
        );

      this.setCustomValidity('');
    });
  }

  function replaceButtonContent(button, label){
    if(!button) return;
    button.replaceChildren(document.createTextNode(label));
  }

  const photoFrame = document.querySelector('#fiscalDesktopProductPhoto .fiscal-desktop-product-photo-frame');

  /*
   * A identificação do cliente usa o mesmo subcard FOTO DO PRODUTO
   * utilizado pelos fluxos de cancelamento e pagamento.
   */
  if(photoFrame && cpfOverlay){
    const cpfDialog = cpfOverlay.querySelector('[role="dialog"]');
    cpfOverlay.className = 'fiscal-cpf-photo-panel';
    cpfOverlay.style.display = 'none';
    if(cpfDialog) cpfDialog.className = 'fiscal-cpf-photo-content';
    photoFrame.appendChild(cpfOverlay);
  }

  const oldFinalizePhotoPanel = document.getElementById('fiscalFinalizeSalePhotoPanel');
  if(oldFinalizePhotoPanel) oldFinalizePhotoPanel.remove();

  const finalizePhotoPanel = document.createElement('div');
  finalizePhotoPanel.id = 'fiscalFinalizeSalePhotoPanel';
  finalizePhotoPanel.className = 'fiscal-finalize-sale-photo-panel';
  finalizePhotoPanel.hidden = true;
  finalizePhotoPanel.innerHTML = [
    '<div class="fiscal-finalize-sale-title">FINALIZAR VENDA</div>',
    '<div class="fiscal-finalize-sale-subtitle">ESCOLHA A FORMA DE PAGAMENTO</div>',
    '<div class="fiscal-finalize-split-summary" id="fiscalFinalizeSplitSummary">',
      '<div class="fiscal-finalize-split-totals">',
        '<span>TOTAL <strong id="fiscalFinalizeSplitTotal">R$ 0,00</strong></span>',
        '<span>PAGO <strong id="fiscalFinalizeSplitPaid">R$ 0,00</strong></span>',
        '<span>RESTANTE <strong id="fiscalFinalizeSplitRemaining">R$ 0,00</strong></span>',
      '</div>',
      '<div class="fiscal-finalize-split-list" id="fiscalFinalizeSplitList"></div>',
    '</div>',
    '<div class="finalize-payment-wrap">',
      '<button class="finalize-payment-method-btn" data-payment-method="PIX" type="button"><span class="finalize-payment-method-label">PIX</span></button>',
      '<button class="finalize-payment-method-btn" data-payment-method="DÉBITO" type="button"><span class="finalize-payment-method-label">DÉBITO</span></button>',
      '<button class="finalize-payment-method-btn" data-payment-method="CRÉDITO" type="button"><span class="finalize-payment-method-label">CRÉDITO</span></button>',
      '<button class="finalize-payment-method-btn" data-payment-method="DINHEIRO" type="button"><span class="finalize-payment-method-label">DINHEIRO</span></button>',
    '</div>',

    '<div class="fiscal-finalize-method-stage" id="fiscalFinalizeMethodStage" hidden>',
      '<div class="fiscal-finalize-cash-title" id="fiscalFinalizeMethodTitle">PAGAMENTO EM PIX</div>',
      '<div class="fiscal-finalize-cash-subtitle">QUAL O VALOR DESTE PAGAMENTO?</div>',
      '<input autocomplete="off" class="fiscal-finalize-cash-input" id="fiscalFinalizeMethodAmount" inputmode="numeric" placeholder="R$ 0,00" type="text" aria-label="Valor desta forma de pagamento">',
      '<div class="fiscal-finalize-stage-remaining">RESTANTE DA VENDA <strong id="fiscalFinalizeMethodRemaining">R$ 0,00</strong></div>',

    '</div>',
    '<div class="fiscal-finalize-cash-stage" id="fiscalFinalizeCashStage" hidden>',
      '<div class="fiscal-finalize-cash-title">PAGAMENTO EM DINHEIRO</div>',
      '<div class="fiscal-finalize-cash-subtitle">QUANTO FOI O RECEBIMENTO?</div>',
      '<input autocomplete="off" class="fiscal-finalize-cash-input" id="fiscalFinalizeCashReceived" inputmode="numeric" placeholder="R$ 0,00" type="text" aria-label="Valor recebido em dinheiro">',
      '<div class="fiscal-finalize-cash-change">',
        '<div class="fiscal-finalize-cash-change-label">TROCO</div>',
        '<div class="fiscal-finalize-cash-change-value" id="fiscalFinalizeCashChange">R$ 0,00</div>',
      '</div>',
      '<div class="fiscal-finalize-stage-remaining">RESTANTE DA VENDA <strong id="fiscalFinalizeCashRemaining">R$ 0,00</strong></div>',

    '</div>'
  ].join('');

  if(photoFrame) photoFrame.appendChild(finalizePhotoPanel);

  const oldCompletedPhotoPanel = document.getElementById('fiscalCompletedSalePhotoPanel');
  if(oldCompletedPhotoPanel) oldCompletedPhotoPanel.remove();

  const completedPhotoPanel = document.createElement('div');
  completedPhotoPanel.id = 'fiscalCompletedSalePhotoPanel';
  completedPhotoPanel.className = 'fiscal-completed-sale-photo-panel';
  completedPhotoPanel.hidden = true;
  completedPhotoPanel.innerHTML = [
    '<div class="fiscal-completed-sale-title" id="completedPhotoTitle">VENDA FINALIZADA</div>',
    '<div class="fiscal-completed-sale-subtitle" id="completedPhotoMessage">EMITIR COMPROVANTE DE PAGAMENTO</div>',
    '<div class="fiscal-completed-sale-actions">',
      '<button class="fiscal-completed-sale-btn fiscal-completed-sale-btn-primary" id="completedPhotoReceiptBtn" type="button">CUPOM FISCAL</button>',
      '<button class="fiscal-completed-sale-btn fiscal-completed-sale-btn-danger" id="completedPhotoCloseBtn" type="button">FECHAR</button>',
    '</div>'
  ].join('');
  if(photoFrame) photoFrame.appendChild(completedPhotoPanel);

  const paidButton = finalizePhotoPanel.querySelector('#finalizeScWhatsappBtnPhoto');
  const cancelButton = finalizePhotoPanel.querySelector('#finalizeScTechBtnPhoto');
  const splitTotalValue = finalizePhotoPanel.querySelector('#fiscalFinalizeSplitTotal');
  const splitPaidValue = finalizePhotoPanel.querySelector('#fiscalFinalizeSplitPaid');
  const splitRemainingValue = finalizePhotoPanel.querySelector('#fiscalFinalizeSplitRemaining');
  const splitList = finalizePhotoPanel.querySelector('#fiscalFinalizeSplitList');
  const methodStage = finalizePhotoPanel.querySelector('#fiscalFinalizeMethodStage');
  const methodStageTitle = finalizePhotoPanel.querySelector('#fiscalFinalizeMethodTitle');
  const methodAmountInput = finalizePhotoPanel.querySelector('#fiscalFinalizeMethodAmount');
  const methodRemainingValue = finalizePhotoPanel.querySelector('#fiscalFinalizeMethodRemaining');
  const methodAddButton = finalizePhotoPanel.querySelector('#fiscalFinalizeMethodAdd');
  const methodBackButton = finalizePhotoPanel.querySelector('#fiscalFinalizeMethodBack');
  const cashStage = finalizePhotoPanel.querySelector('#fiscalFinalizeCashStage');
  const cashReceivedInput = finalizePhotoPanel.querySelector('#fiscalFinalizeCashReceived');
  const cashChangeValue = finalizePhotoPanel.querySelector('#fiscalFinalizeCashChange');
  const cashRemainingValue = finalizePhotoPanel.querySelector('#fiscalFinalizeCashRemaining');
  const cashPaidButton = finalizePhotoPanel.querySelector('#fiscalFinalizeCashPaid');
  const cashCancelButton = finalizePhotoPanel.querySelector('#fiscalFinalizeCashCancel');

  // Estado intermediário: agora a mensagem aparece no subcard FOTO DO PRODUTO; o overlay fica apenas como controle de estado.
  const waitingOverlay = document.createElement('div');
  waitingOverlay.id = 'saleValidationWaitingOverlay';
  waitingOverlay.className = 'block-confirm-overlay finalize-flow-overlay';
  waitingOverlay.setAttribute('aria-hidden', 'true');
  waitingOverlay.style.display = 'none';
  waitingOverlay.innerHTML = [
    '<div aria-modal="true" class="block-confirm-card" role="dialog">',
    '<div aria-live="polite" id="saleValidationWaitingMessage" role="status">AGUARDANDO VALIDAÇÃO...</div>',
    '</div>'
  ].join('');

  // Segunda etapa: cópia do card de pagamento para confirmar a venda finalizada.
  const completedOverlay = overlay.cloneNode(true);
  completedOverlay.id = 'saleCompletedCardOverlay';
  completedOverlay.setAttribute('aria-hidden', 'true');
  completedOverlay.style.display = 'none';

  const completedIdMap = {
    finalizeScTitle: 'completedScTitle',
    finalizeScWhatsappBtn: 'completedReceiptBtn',
    finalizeScTechBtn: 'completedCloseBtn'
  };

  Object.keys(completedIdMap).forEach(function(oldId){
    const element = completedOverlay.querySelector('#' + oldId);
    if(element) element.id = completedIdMap[oldId];
  });

  const completedDialog = completedOverlay.querySelector('[role="dialog"]');
  if(completedDialog) completedDialog.setAttribute('aria-labelledby', 'completedScTitle');

  const completedTitle = completedOverlay.querySelector('#completedScTitle');
  const completedWarning = completedOverlay.querySelector('.bc-warn');
  const completedPaymentWrap = completedOverlay.querySelector('.finalize-payment-wrap');
  const receiptButton = completedOverlay.querySelector('#completedReceiptBtn');
  const completedCloseButton = completedOverlay.querySelector('#completedCloseBtn');
  const completedPhotoTitle = completedPhotoPanel.querySelector('#completedPhotoTitle');
  const completedPhotoMessage = completedPhotoPanel.querySelector('#completedPhotoMessage');
  let completedPhotoReceiptButton = completedPhotoPanel.querySelector('#completedPhotoReceiptBtn');
  let completedPhotoCloseButton = completedPhotoPanel.querySelector('#completedPhotoCloseBtn');

  if(completedTitle) completedTitle.textContent = 'VENDA FINALIZADA';
  if(completedWarning) completedWarning.textContent = 'EMITIR COMPROVANTE DE PAGAMENTO';
  if(completedPaymentWrap) completedPaymentWrap.remove();
  replaceButtonContent(receiptButton, 'CUPOM FISCAL');
  replaceButtonContent(completedCloseButton, 'FECHAR');

  overlay.insertAdjacentElement('afterend', waitingOverlay);
  waitingOverlay.insertAdjacentElement('afterend', completedOverlay);

  const paymentMethodButtons = Array.from(finalizePhotoPanel.querySelectorAll('.finalize-payment-method-btn'));
  let selectedPaymentMethod = '';
  let editingPaymentMethod = '';
  let paymentParts = [];
  let currentSale = null;
  let completedSale = null;

  /*
   * NFC-e automática após o pré-check da venda PF.
   * A chave é o saleId para impedir disparo duplicado da mesma venda.
   */
  const nfceAutoEmissionSaleIds = new Set();

  function syncSelectedPaymentMethod(){
    paymentMethodButtons.forEach(function(button){
      const method = String(button.getAttribute('data-payment-method') || '');
      const selected = method === selectedPaymentMethod;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  function selectPaymentMethod(method){
    selectedPaymentMethod = String(method || '').trim().toUpperCase();
    syncSelectedPaymentMethod();
  }

  function parseCashCurrency(value){
    const digits = String(value || '').replace(/\D/g, '').slice(0, 12);
    if(!digits) return 0;
    return Number(digits) / 100;
  }

  function formatCashCurrency(value){
    const amount = Number(value) || 0;
    return amount.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function currentSaleTotalValue(){
    if(currentSale){
      const direct = Number(currentSale.totalValue);
      if(Number.isFinite(direct)) return Math.max(0, direct);

      const raw = String(currentSale.totalValue || '').trim();
      if(raw){
        const normalized = raw
          .replace(/[^0-9,.-]/g, '')
          .replace(/\./g, '')
          .replace(',', '.');
        const parsed = Number(normalized);
        if(Number.isFinite(parsed)) return Math.max(0, parsed);
      }
    }

    const headerTotal = document.getElementById('fiscalHeaderTotal');
    const rawHeader = String(headerTotal ? headerTotal.textContent : '').trim();
    const normalizedHeader = rawHeader
      .replace(/[^0-9,.-]/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const parsedHeader = Number(normalizedHeader);
    return Number.isFinite(parsedHeader) ? Math.max(0, parsedHeader) : 0;
  }

  function splitPaidTotal(){
    return paymentParts.reduce(function(total, part){
      return total + Math.max(0, Number(part && part.amount || 0));
    }, 0);
  }

  function splitRemainingTotal(){
    return Math.max(0, currentSaleTotalValue() - splitPaidTotal());
  }

  function combinedPaymentMethodLabel(){
    const methods = [];
    paymentParts.forEach(function(part){
      const method = String(part && part.method || '').trim().toUpperCase();
      if(method && !methods.includes(method)) methods.push(method);
    });
    return methods.join(' + ');
  }

  function paymentPartsByMethod(method){
    const normalized = String(method || '').trim().toUpperCase();
    return paymentParts.filter(function(part){
      return String(part && part.method || '').trim().toUpperCase() === normalized;
    });
  }

  function paymentAmountByMethod(method){
    return paymentPartsByMethod(method).reduce(function(total, part){
      return total + Math.max(0, Number(part && part.amount || 0));
    }, 0);
  }

  function removePaymentMethod(method){
    const normalized = String(method || '').trim().toUpperCase();
    paymentParts = paymentParts.filter(function(part){
      return String(part && part.method || '').trim().toUpperCase() !== normalized;
    });
    if(selectedPaymentMethod === normalized) selectedPaymentMethod = '';
    renderSplitPayments();
  }

  function renderPaymentMethodButtons(){
    paymentMethodButtons.forEach(function(button){
      const method = String(button.getAttribute('data-payment-method') || '').trim().toUpperCase();
      const amount = paymentAmountByMethod(method);
      const hasValue = amount >= 0.005;
      button.classList.toggle('has-value', hasValue);
      if(hasValue){
        button.innerHTML = [
          '<span class="finalize-payment-method-label">' + method + '</span>',
          '<span class="finalize-payment-method-value">' + formatCashCurrency(amount) + '</span>',
          '<span class="finalize-payment-method-remove" aria-hidden="true">×</span>'
        ].join('');
        button.setAttribute('aria-label', method + ' ' + formatCashCurrency(amount) + '. Clique no X para remover.');
      }else{
        button.innerHTML = '<span class="finalize-payment-method-label">' + method + '</span>';
        button.setAttribute('aria-label', method);
      }
    });
  }

  function focusedPaymentMethodButton(){
    const active =
      document.activeElement;

    if(
      active &&
      active.classList &&
      active.classList.contains(
        'finalize-payment-method-btn'
      )
    ){
      return active;
    }

    return finalizePhotoPanel
      ? finalizePhotoPanel.querySelector(
          '.finalize-payment-method-btn.scf-payment-keyboard-focus'
        )
      : null;
  }

  window.scfFinalizeFocusedPaymentHasValue =
    function(){
      const button =
        focusedPaymentMethodButton();

      if(!button){
        return false;
      }

      const method =
        String(
          button.getAttribute(
            'data-payment-method'
          ) || ''
        )
          .trim()
          .toUpperCase();

      return (
        method &&
        paymentAmountByMethod(
          method
        ) >= 0.005
      );
    };

  window.scfRemoveFocusedFinalizePayment =
    function(){
      const button =
        focusedPaymentMethodButton();

      if(!button){
        return false;
      }

      const method =
        String(
          button.getAttribute(
            'data-payment-method'
          ) || ''
        )
          .trim()
          .toUpperCase();

      if(
        !method ||
        paymentAmountByMethod(
          method
        ) < 0.005
      ){
        return false;
      }

      removePaymentMethod(
        method
      );

      requestAnimationFrame(
        function(){
          const target =
            paymentMethodButtons.find(
              function(item){
                return String(
                  item.getAttribute(
                    'data-payment-method'
                  ) || ''
                )
                  .trim()
                  .toUpperCase() ===
                    method;
              }
            );

          if(target){
            destacarBotaoPagamento(
              target
            );

            try{
              target.focus({
                preventScroll:true
              });
            }catch(error){
              try{
                target.focus();
              }catch(innerError){}
            }
          }
        }
      );

      return true;
    };

  function renderSplitPayments(){
    const total = currentSaleTotalValue();
    const paid = splitPaidTotal();
    const remaining = Math.max(0, total - paid);

    if(splitTotalValue) splitTotalValue.textContent = formatCashCurrency(total);
    if(splitPaidValue) splitPaidValue.textContent = formatCashCurrency(paid);
    if(splitRemainingValue) splitRemainingValue.textContent = formatCashCurrency(remaining);
    if(methodRemainingValue) methodRemainingValue.textContent = formatCashCurrency(remaining);
    if(cashRemainingValue) cashRemainingValue.textContent = formatCashCurrency(remaining);

    if(splitList){
      splitList.textContent = '';
    }

    renderPaymentMethodButtons();

    if(paidButton){
      const complete = total > 0 && remaining < 0.005;
      paidButton.disabled = !complete;
      paidButton.setAttribute('aria-disabled', complete ? 'false' : 'true');
    }

    if(currentSale){
      currentSale.paymentParts = paymentParts.map(function(part){ return Object.assign({}, part); });
      currentSale.paymentMethod = combinedPaymentMethodLabel();
      currentSale.paymentStatus = remaining < 0.005 && total > 0 ? 'PRONTO' : 'PENDENTE';
    }
  }

  function setFinalizePaymentOverviewVisible(visible){
    if(!finalizePhotoPanel) return;

    const elements = [
      finalizePhotoPanel.querySelector('.fiscal-finalize-sale-title'),
      finalizePhotoPanel.querySelector('.fiscal-finalize-sale-subtitle'),
      finalizePhotoPanel.querySelector('#fiscalFinalizeSplitSummary'),
      finalizePhotoPanel.querySelector('.finalize-payment-wrap')
    ].filter(Boolean);

    elements.forEach(function(element){
      if(visible){
        element.hidden = false;
        element.style.removeProperty('display');
        element.style.removeProperty('visibility');
        element.removeAttribute('aria-hidden');
      }else{
        element.hidden = true;
        element.style.setProperty('display','none','important');
        element.style.setProperty('visibility','hidden','important');
        element.setAttribute('aria-hidden','true');
      }
    });
  }

  function setFinalizeStandbySuppressed(suppressed){
    const standby =
      document.getElementById(
        'scfFinalizeStandbyPanel'
      );

    if(!standby) return;

    if(suppressed){
      standby.hidden = true;
      standby.style.setProperty(
        'display',
        'none',
        'important'
      );
      standby.style.setProperty(
        'visibility',
        'hidden',
        'important'
      );
      standby.setAttribute(
        'aria-hidden',
        'true'
      );
    }else{
      standby.hidden = false;
      standby.style.removeProperty(
        'display'
      );
      standby.style.removeProperty(
        'visibility'
      );
      standby.setAttribute(
        'aria-hidden',
        'true'
      );
    }
  }

  function resetMethodPaymentView(){
    editingPaymentMethod = '';
    if(methodAmountInput) methodAmountInput.value = '';
    if(methodStage) methodStage.hidden = true;
    if(finalizePhotoPanel) finalizePhotoPanel.classList.remove('is-method-payment-mode');

    if(
      !finalizePhotoPanel ||
      !finalizePhotoPanel.classList.contains('is-cash-payment-mode')
    ){
      setFinalizePaymentOverviewVisible(true);
    }
  }

  function resetCashPaymentView(){
    if(cashReceivedInput) cashReceivedInput.value = '';
    if(cashChangeValue) cashChangeValue.textContent = formatCashCurrency(0);
    if(cashStage) cashStage.hidden = true;
    if(finalizePhotoPanel) finalizePhotoPanel.classList.remove('is-cash-payment-mode');

    if(
      !finalizePhotoPanel ||
      !finalizePhotoPanel.classList.contains('is-method-payment-mode')
    ){
      setFinalizePaymentOverviewVisible(true);
    }
  }

  function returnToSplitOverview(preferredMethod){
    const preferred =
      String(
        preferredMethod ||
        editingPaymentMethod ||
        selectedPaymentMethod ||
        ''
      )
        .trim()
        .toUpperCase();

    resetMethodPaymentView();
    resetCashPaymentView();
    setFinalizePaymentOverviewVisible(true);
    selectPaymentMethod('');
    renderSplitPayments();

    requestAnimationFrame(function(){
      let targetButton =
        preferred
          ? paymentMethodButtons.find(
              function(button){
                return String(
                  button.getAttribute(
                    'data-payment-method'
                  ) || ''
                )
                  .trim()
                  .toUpperCase() ===
                    preferred;
              }
            )
          : null;

      if(!targetButton){
        targetButton =
          paymentMethodButtons[0];
      }

      if(targetButton){
        destacarBotaoPagamento(targetButton);

        try{
          targetButton.focus({
            preventScroll:true
          });
        }catch(error){
          try{
            targetButton.focus();
          }catch(innerError){}
        }
      }
    });
  }

  /*
   * Usado pelo atalho F7:
   * dentro de uma etapa de valor, volta para FINALIZAR VENDA
   * mantendo a mesma forma de pagamento selecionada.
   */
  window.scfReturnFinalizePaymentOverview =
    function(){
      returnToSplitOverview(
        editingPaymentMethod ||
        selectedPaymentMethod
      );
    };

  function openMethodPaymentView(method){
    const remaining = splitRemainingTotal();
    if(remaining < 0.005) return;

    editingPaymentMethod = String(method || '').trim().toUpperCase();
    selectPaymentMethod(editingPaymentMethod);
    resetCashPaymentView();
    if(methodStageTitle) methodStageTitle.textContent = 'PAGAMENTO EM ' + editingPaymentMethod;
    if(methodRemainingValue) methodRemainingValue.textContent = formatCashCurrency(remaining);

    setFinalizeStandbySuppressed(true);
    setFinalizePaymentOverviewVisible(false);

    if(finalizePhotoPanel) finalizePhotoPanel.classList.add('is-method-payment-mode');
    if(methodStage) methodStage.hidden = false;
    if(methodAmountInput){
      methodAmountInput.value = '';

      requestAnimationFrame(function(){
        try{
          methodAmountInput.focus({ preventScroll:true });
        }catch(error){
          try{ methodAmountInput.focus(); }catch(innerError){}
        }

        try{
          methodAmountInput.setSelectionRange(0, 0);
        }catch(error){}
      });
    }
  }

  function updateCashChange(){
    const received = parseCashCurrency(cashReceivedInput ? cashReceivedInput.value : '');
    const remaining = splitRemainingTotal();
    const change = Math.max(0, received - remaining);

    if(cashChangeValue){
      cashChangeValue.textContent = formatCashCurrency(change);
    }
    if(cashRemainingValue){
      cashRemainingValue.textContent = formatCashCurrency(remaining);
    }

    return {
      received: received,
      remaining: remaining,
      applied: Math.min(received, remaining),
      change: change
    };
  }

  function openCashPaymentView(){
    const remaining = splitRemainingTotal();
    if(remaining < 0.005) return;

    selectPaymentMethod('DINHEIRO');
    resetMethodPaymentView();

    setFinalizeStandbySuppressed(true);
    setFinalizePaymentOverviewVisible(false);

    if(finalizePhotoPanel) finalizePhotoPanel.classList.add('is-cash-payment-mode');
    if(cashStage) cashStage.hidden = false;
    if(cashRemainingValue) cashRemainingValue.textContent = formatCashCurrency(remaining);
    if(cashReceivedInput){
      cashReceivedInput.value = '';

      requestAnimationFrame(function(){
        try{
          cashReceivedInput.focus({ preventScroll:true });
        }catch(error){
          try{ cashReceivedInput.focus(); }catch(innerError){}
        }

        try{
          cashReceivedInput.setSelectionRange(0, 0);
        }catch(error){}
      });
    }
    updateCashChange();
  }

  function restoreContinuityPaymentState(
    paymentState,
    paymentStageKind
  ){
    const source =
      paymentState &&
      typeof paymentState ===
        'object'
        ? paymentState
        : null;

    if(!source){
      return false;
    }

    const restoredParts =
      Array.isArray(
        source.paymentParts
      )
        ? source.paymentParts
            .map(
              function(part){
                const method =
                  String(
                    part &&
                    part.method ||
                    ''
                  )
                    .trim()
                    .toUpperCase();

                const amount =
                  Number(
                    part &&
                    part.amount ||
                    0
                  );

                return {
                  method,
                  amount
                };
              }
            )
            .filter(
              function(part){
                return (
                  part.method &&
                  Number.isFinite(
                    part.amount
                  ) &&
                  part.amount >=
                    0.005
                );
              }
            )
        : [];

    paymentParts =
      restoredParts;

    const restoredMethod =
      String(
        source.editingMethod ||
        source.selectedMethod ||
        ''
      )
        .trim()
        .toUpperCase();

    selectedPaymentMethod =
      restoredMethod;

    syncSelectedPaymentMethod();
    renderSplitPayments();

    const flowMode =
      String(
        source.flowMode ||
        ''
      )
        .trim()
        .toUpperCase();

    if(
      flowMode === 'METHOD' &&
      restoredMethod &&
      restoredMethod !== 'DINHEIRO'
    ){
      openMethodPaymentView(
        restoredMethod
      );

      const amount =
        Number(
          source.methodAmount ||
          0
        );

      if(
        methodAmountInput &&
        Number.isFinite(amount) &&
        amount >= 0.005
      ){
        methodAmountInput.value =
          formatCashCurrency(
            amount
          );
      }
    }else if(
      flowMode === 'CASH'
    ){
      openCashPaymentView();

      const received =
        Number(
          source.cashReceived ||
          0
        );

      if(
        cashReceivedInput &&
        Number.isFinite(received) &&
        received >= 0.005
      ){
        cashReceivedInput.value =
          formatCashCurrency(
            received
          );

        updateCashChange();
      }
    }

    if(
      String(
        paymentStageKind ||
        ''
      )
        .trim()
        .toUpperCase() ===
          'CPF' &&
      typeof concluirPagamentoVenda ===
        'function' &&
      typeof window.scfFinalizePaymentComplete ===
        'function' &&
      window.scfFinalizePaymentComplete() ===
        true
    ){
      concluirPagamentoVenda();
    }

    return true;
  }

  continuityDomain.registerPaymentPort(
    Object.freeze({
      restoreState:
        restoreContinuityPaymentState
    })
  );

  function addPaymentPart(method, amount, extra, options){
    const remaining = splitRemainingTotal();
    const applied = Math.min(Math.max(0, Number(amount) || 0), remaining);
    if(applied < 0.005) return false;

    const part = Object.assign({
      method: String(method || '').trim().toUpperCase(),
      amount: applied
    }, extra || {});

    /*
     * Pagamento TOTAL inserido automaticamente enquanto a etapa permanece
     * aberta: marca a parcela somente em memória para que uma edição
     * posterior do próprio input possa desfazê-la. A marca é não enumerável,
     * portanto não é enviada junto com paymentParts/currentSale.
     */
    if(
      options &&
      options.reversibleAutoPayment === true
    ){
      try{
        Object.defineProperty(
          part,
          '__scfReversibleAutoPayment',
          {
            value:true,
            configurable:true,
            enumerable:false
          }
        );
      }catch(error){}
    }

    paymentParts.push(part);

    if(
      options &&
      options.keepPaymentStage === true
    ){
      /*
       * Pagamento que quitou todo o restante:
       * registra a parcela, atualiza PAGO/RESTANTE, mas mantém
       * a tela atual para o próximo ENTER seguir a finalização.
       */
      renderSplitPayments();
      return true;
    }

    returnToSplitOverview(
      part.method
    );
    return true;
  }

  function limparDestaqueTecladoPagamento(){
    paymentMethodButtons.forEach(function(button){
      button.classList.remove('scf-payment-keyboard-focus');
    });
  }

  function destacarBotaoPagamento(button){
    limparDestaqueTecladoPagamento();

    if(button){
      button.classList.add('scf-payment-keyboard-focus');
    }
  }

  function focarFormaPagamento(index){
    if(!paymentMethodButtons.length) return;

    const safeIndex = Math.max(
      0,
      Math.min(
        Number(index) || 0,
        paymentMethodButtons.length - 1
      )
    );

    const button = paymentMethodButtons[safeIndex];

    if(!button) return;

    destacarBotaoPagamento(button);

    try{
      button.focus({ preventScroll:true });
    }catch(error){
      try{ button.focus(); }catch(innerError){}
    }
  }

  paymentMethodButtons.forEach(function(button, index){
    /*
     * A navegação é tratada NO PRÓPRIO BOTÃO.
     * Assim não depende de disputa com os handlers globais do PDV.
     */
    button.addEventListener('focus', function(){
      destacarBotaoPagamento(button);
    });

    button.addEventListener('keydown', function(event){
      if(
        !photoFrame ||
        !photoFrame.classList.contains('is-sale-finalize-open')
      ){
        return;
      }

      const key = String(event.key || '');

      if(
        key !== 'ArrowDown' &&
        key !== 'ArrowUp' &&
        key !== 'Enter'
      ){
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if(key === 'ArrowDown'){
        focarFormaPagamento(
          Math.min(
            index + 1,
            paymentMethodButtons.length - 1
          )
        );
        return;
      }

      if(key === 'ArrowUp'){
        focarFormaPagamento(
          Math.max(
            index - 1,
            0
          )
        );
        return;
      }

      if(
        typeof event.stopImmediatePropagation === 'function'
      ){
        event.stopImmediatePropagation();
      }

      button.click();
    });

    button.addEventListener('click', function(event){
      const method = String(button.getAttribute('data-payment-method') || '').trim().toUpperCase();
      const removeTrigger = event.target && event.target.closest('.finalize-payment-method-remove');
      if(removeTrigger){
        event.preventDefault();
        event.stopPropagation();
        removePaymentMethod(method);
        return;
      }
      if(method === 'DINHEIRO'){
        openCashPaymentView();
        return;
      }
      openMethodPaymentView(method);
    });
  });

  if(methodAmountInput){
    methodAmountInput.addEventListener('input', function(){
      const amount = parseCashCurrency(this.value);
      this.value = amount ? formatCashCurrency(amount) : '';
      try{
        const end = this.value.length;
        this.setSelectionRange(end, end);
      }catch(error){}
    });

    methodAmountInput.addEventListener('keydown', function(event){
      if(event.key === 'Enter'){
        event.preventDefault();
        if(methodAddButton) methodAddButton.click();
      }
    });
  }

  if(methodAddButton) methodAddButton.addEventListener('click', function(){
    const amount = parseCashCurrency(methodAmountInput ? methodAmountInput.value : '');
    const remaining = splitRemainingTotal();
    if(!editingPaymentMethod || amount < 0.005){
      if(methodAmountInput) methodAmountInput.focus();
      return;
    }
    if(amount - remaining > 0.005){
      if(methodAmountInput){
        methodAmountInput.value = formatCashCurrency(remaining);
        methodAmountInput.focus();
        try{ methodAmountInput.select(); }catch(error){}
      }
      return;
    }
    addPaymentPart(editingPaymentMethod, amount);
  });

  if(methodBackButton) methodBackButton.addEventListener('click', function(){
    returnToSplitOverview();
  });

  if(cashReceivedInput){
    cashReceivedInput.addEventListener('input', function(){
      const amount = parseCashCurrency(this.value);
      this.value = amount ? formatCashCurrency(amount) : '';
      try{
        const end = this.value.length;
        this.setSelectionRange(end, end);
      }catch(error){}
      updateCashChange();
    });

    cashReceivedInput.addEventListener('keydown', function(event){
      if(event.key === 'Enter'){
        event.preventDefault();
        if(cashPaidButton) cashPaidButton.click();
      }
    });
  }

  syncSelectedPaymentMethod();
  renderPaymentMethodButtons();
  resetMethodPaymentView();
  resetCashPaymentView();
  renderSplitPayments();

  /*
   * A forma de pagamento fica pendente somente enquanto
   * o card CPF aguarda INFORMAR ou FECHAR.
   */
  let metodoPagamentoPendente = '';

  let temporizadorValidacaoVenda = 0;

  function limparTemporizadorValidacaoVenda(){
    if(temporizadorValidacaoVenda){
      clearTimeout(temporizadorValidacaoVenda);
      temporizadorValidacaoVenda = 0;
    }
  }

  function showMainFiscalCard(){
    const fiscalShell = document.querySelector('.fiscal-form-shell');
    const fiscalCard = document.querySelector('.fiscal-form-card');
    if(fiscalShell) fiscalShell.hidden = false;
    if(fiscalCard) fiscalCard.hidden = false;
    document.body.classList.remove('fiscal-products-view-open');
  }

  function closePaymentCard(){
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');

    resetMethodPaymentView();
    resetCashPaymentView();
    if(finalizePhotoPanel) finalizePhotoPanel.hidden = true;
    if(completedPhotoPanel) completedPhotoPanel.hidden = true;
    if(photoFrame){
      photoFrame.classList.remove('is-sale-finalize-open');
      photoFrame.classList.remove('is-validation-waiting-open');
      photoFrame.classList.remove('is-sale-completed-open');
    }

    document.body.classList.remove('finalize-support-card-open');
    setFinalizeStandbySuppressed(false);
  }

  window.scfCloseFinalizePhotoPanel = closePaymentCard;

  function hideValidationWaitingCard(){
    waitingOverlay.style.display = 'none';
    waitingOverlay.setAttribute('aria-hidden', 'true');
    if(photoFrame) photoFrame.classList.remove('is-validation-waiting-open');
    document.body.classList.remove('sale-validation-waiting-open');
  }

  function openValidationWaitingCard(sale){
    completedSale = sale || currentSale;
    comprovanteAutorizadoCarregado = null;

    closePaymentCard();

    /*
     * A validação é um estado prioritário do card direito.
     * closePaymentCard() devolve o standby do PDV; portanto
     * suprimimos novamente antes de mostrar AGUARDANDO VALIDAÇÃO.
     */
    setFinalizeStandbySuppressed(true);

    completedOverlay.style.display = 'none';
    completedOverlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('sale-completed-card-open');

    waitingOverlay.style.display = 'none';
    waitingOverlay.setAttribute('aria-hidden', 'false');

    const productCancelCard = document.getElementById('fiscalProductCancelCard');
    if(productCancelCard) productCancelCard.hidden = true;

    if(photoFrame){
      photoFrame.classList.remove('is-product-cancel-open');
      photoFrame.classList.remove('is-sale-finalize-open');
      photoFrame.classList.remove('is-client-identification-open');
      photoFrame.classList.remove('is-sale-completed-open');
      photoFrame.classList.add('is-validation-waiting-open');
    }

    document.body.classList.remove('finalize-support-card-open');
    document.body.classList.remove('cpf-fiscal-card-open');
    document.body.classList.remove('sale-completed-card-open');
    document.body.classList.add('sale-validation-waiting-open');

    /*
     * Se o backend responder instantaneamente, a tela de validação
     * ainda fica visível por um curto período para o operador perceber
     * claramente a passagem pela etapa AGUARDANDO VALIDAÇÃO.
     */
    /*
     * PERFORMANCE 1.5–3s:
     * mantém somente 250 ms de presença visual mínima do estado.
     * O processamento real continua sendo determinado pelo backend.
     */
    salePaymentDomain.validationMinimumUntil =
      Date.now() + 250;

    limparTemporizadorValidacaoVenda();
    temporizadorValidacaoVenda = window.setTimeout(function(){
      hideValidationWaitingCard();

      definirConteudoCardFiscal({
        titulo: 'VALIDAÇÃO NÃO CONCLUÍDA',
        mensagem:
          'A VALIDAÇÃO NÃO RETORNOU NO TEMPO ESPERADO. FECHE ESTA TELA E CONSULTE O MONITORAMENTO DO WIX.',
        textoBotao: 'NÃO LIBERADA',
        bloquearBotao: true,
        bloquearFechar: false
      });

      openCompletedCard(completedSale || currentSale);
    }, 60000);
  }

  function closeCompletedCard(){
    /*
     * Venda PJ registrada sem NFC-e:
     *
     * O botão FECHAR representa o encerramento real da venda no caixa.
     * A venda já está persistida no CMS/Histórico; aqui limpamos somente
     * a frente de caixa para iniciar a próxima venda.
     */
    const vendaFinalizada =
      completedSale ||
      currentSale;

    const deveLimparFrenteDeCaixa =
      Boolean(
        vendaFinalizada &&
        (
          vendaFinalizada.nfe55Pendente === true ||
          String(
            vendaFinalizada.fiscalStatus || ''
          ).toUpperCase() ===
            'AGUARDANDO_NFE55' ||
          String(
            vendaFinalizada.tipoPessoaCliente || ''
          ).toUpperCase() ===
            'JURIDICA' ||
          String(
            vendaFinalizada.documentoClienteTipo || ''
          ).toUpperCase() ===
            'CNPJ'
        )
      );

    if(
      deveLimparFrenteDeCaixa
    ){
      window.__scfPdvInfra.eventBus.dispatch(
        new CustomEvent(
          'scf:limpar-venda-concluida'
        )
      );

      return;
    }

    completedOverlay.style.display = 'none';
    completedOverlay.setAttribute('aria-hidden', 'true');
    if(completedPhotoPanel) completedPhotoPanel.hidden = true;
    if(photoFrame) photoFrame.classList.remove('is-sale-completed-open');
    document.body.classList.remove('sale-completed-card-open');

    setFinalizeStandbySuppressed(false);

    showMainFiscalCard();
  }

  window.scfCloseCompletedSaleCard =
    closeCompletedCard;

  function closeCpfCard(){
    cpfOverlay.style.display = 'none';
    cpfOverlay.setAttribute('aria-hidden', 'true');
    cpfHintIndex = 0;
    syncCpfHintState();
    if(photoFrame){
      photoFrame.classList.remove('is-client-identification-open');
      photoFrame.classList.remove('is-validation-waiting-open');
    }
    document.body.classList.remove('cpf-fiscal-card-open');
  }

  function openPaymentCard(){
    closeCpfCard();
    setFinalizeStandbySuppressed(true);
    resetMethodPaymentView();
    resetCashPaymentView();
    setFinalizePaymentOverviewVisible(true);
    renderSplitPayments();

    /* O pagamento aparece dentro do próprio subcard FOTO DO PRODUTO. */
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');

    const productCancelCard = document.getElementById('fiscalProductCancelCard');
    if(productCancelCard) productCancelCard.hidden = true;
    if(photoFrame){
      photoFrame.classList.remove('is-product-cancel-open');
      photoFrame.classList.add('is-sale-finalize-open');
    }
    if(finalizePhotoPanel) finalizePhotoPanel.hidden = false;

    document.body.classList.add('finalize-support-card-open');

    /*
     * Venda normal do PDV mantém PIX como primeiro foco para navegação
     * por teclado.
     *
     * Na LIQUIDAÇÃO DO CREDIÁRIO não existe forma pré-escolhida:
     * PIX, DÉBITO, CRÉDITO e DINHEIRO começam igualmente disponíveis.
     * O operador escolhe livremente a forma desejada.
     */
    const liquidacaoCrediario =
      Boolean(
        currentSale &&
        currentSale.crediarioLiquidacao ===
          true
      );

    if(liquidacaoCrediario){
      /*
       * CREDIÁRIO — TOTAL / PARCIAL:
       *
       * Nenhuma forma de pagamento fica ESCOLHIDA antecipadamente,
       * porém o primeiro botão recebe FOCO DE NAVEGAÇÃO, exatamente
       * como na venda normal.
       *
       * Assim:
       *   ↑ / ↓ navegam PIX, DÉBITO, CRÉDITO e DINHEIRO;
       *   ENTER abre/confirma a forma que estiver focada;
       *   PIX receber foco NÃO significa selecionar PIX como pagamento.
       */
      selectedPaymentMethod =
        '';

      limparDestaqueTecladoPagamento();

      paymentMethodButtons.forEach(
        function(button){
          button.classList.remove(
            'is-selected',
            'scf-payment-keyboard-focus'
          );

          button.setAttribute(
            'aria-pressed',
            'false'
          );

          button.removeAttribute(
            'aria-current'
          );
        }
      );

      const firstPaymentButton =
        paymentMethodButtons[0];

      if(firstPaymentButton){
        destacarBotaoPagamento(
          firstPaymentButton
        );

        try{
          firstPaymentButton.focus({
            preventScroll:true
          });
        }catch(error){
          try{
            firstPaymentButton.focus();
          }catch(innerError){}
        }
      }
    }else{
      /*
       * PDV NORMAL — ao voltar da etapa seguinte com F7, preserva o
       * contexto do pagamento já lançado. A última forma que possui valor
       * recebe o foco para que F8 | EXCLUIR apareça imediatamente.
       * Em uma abertura nova, sem pagamentos, mantém o primeiro botão.
       */
      const preferredPaymentMethod =
        String(
          selectedPaymentMethod ||
          (
            paymentParts.length
              ? paymentParts[paymentParts.length - 1].method
              : ''
          ) ||
          ''
        )
          .trim()
          .toUpperCase();

      const firstPaymentButton =
        (
          preferredPaymentMethod
            ? paymentMethodButtons.find(
                function(button){
                  return String(
                    button.getAttribute(
                      'data-payment-method'
                    ) || ''
                  )
                    .trim()
                    .toUpperCase() ===
                      preferredPaymentMethod;
                }
              )
            : null
        ) ||
        paymentMethodButtons[0];

      if(firstPaymentButton){
        destacarBotaoPagamento(
          firstPaymentButton
        );

        try{
          firstPaymentButton.focus({
            preventScroll:true
          });
        }catch(error){
          try{
            firstPaymentButton.focus();
          }catch(innerError){}
        }
      }
    }
  }

  function openCpfCard(){
    /*
     * TRANSIÇÃO SEM PISCAR:
     * o botão deixa o estado PAGO e assume F7 | VOLTAR de forma síncrona,
     * antes de FINALIZAR VENDA ser fechado. Assim não existe um frame
     * intermediário exibindo PAGO ao entrar em IDENTIFICAÇÃO NA NOTA.
     */
    document.body.classList.add('cpf-fiscal-card-open');

    const cpfBackShortcut =
      document.getElementById('scfCashMovementShortcut');

    if(cpfBackShortcut){
      cpfBackShortcut.classList.remove(
        'scf-finalize-paid-mode',
        'scf-finalize-delete-mode',
        'scf-finalize-back-mode'
      );
      cpfBackShortcut.classList.add('scf-cpf-back-mode');
      cpfBackShortcut.textContent = 'F7 | VOLTAR';
      cpfBackShortcut.setAttribute(
        'aria-label',
        'F7 | Voltar para Finalizar Venda'
      );
      cpfBackShortcut.disabled = false;
      cpfBackShortcut.hidden = false;
      cpfBackShortcut.setAttribute('aria-hidden', 'false');
    }

    closePaymentCard();

    /*
     * IDENTIFICAÇÃO NA NOTA tem prioridade total no card direito.
     * closePaymentCard() libera o standby do FINALIZAR VENDA para o PDV;
     * aqui ele é suprimido novamente antes de exibir a identificação.
     */
    setFinalizeStandbySuppressed(true);

    /* Garante exclusividade visual dentro do subcard da foto. */
    const productCancelCard = document.getElementById('fiscalProductCancelCard');
    if(productCancelCard) productCancelCard.hidden = true;
    if(photoFrame){
      photoFrame.classList.remove('is-product-cancel-open');
      photoFrame.classList.remove('is-sale-finalize-open');
      photoFrame.classList.add('is-client-identification-open');
    }

    cpfOverlay.style.display = 'flex';
    cpfOverlay.setAttribute('aria-hidden', 'false');
    cpfHintIndex = 0;
    syncCpfHintState();

    /*
     * Ao abrir IDENTIFICAÇÃO NA NOTA, o primeiro campo
     * (CPF/CNPJ) já fica pronto para digitação.
     */
    requestAnimationFrame(function(){
      if(cpfInput){
        try{
          cpfInput.focus({
            preventScroll:true
          });
        }catch(error){
          try{ cpfInput.focus(); }catch(innerError){}
        }

        try{
          cpfInput.setSelectionRange(
            cpfInput.value.length,
            cpfInput.value.length
          );
        }catch(error){}
      }
    });
  }

  /*
   * F7 na IDENTIFICAÇÃO NA NOTA:
   * volta para a etapa anterior (FINALIZAR VENDA), preservando
   * as formas/valores de pagamento já adicionados.
   */
  window.scfReturnFromCpfIdentificationToFinalize =
    function(){
      openPaymentCard();
      return true;
    };

  /*
   * PASSO 11K — dispara o pré-check da NFC-e ao entrar em
   * FINALIZAR VENDA, antes da confirmação do pagamento.
   *
   * Esta chamada é apenas técnica:
   * - não transmite NFC-e;
   * - não altera venda;
   * - não incrementa numeração;
   * - não bloqueia o operador se falhar.
   *
   * A emissão ainda mantém o pré-check normal como fallback.
   */
  function dispararPrecheckNfcePrePagamento(sale){
    const venda =
      sale &&
      typeof sale === 'object'
        ? sale
        : null;

    const saleId =
      String(
        venda &&
        venda.saleId ||
        ''
      ).trim();

    if(!saleId){
      return false;
    }

    const agora = Date.now();
    const estadoAnterior =
      window.scfNfcePrecheckPrePagamento &&
      typeof window.scfNfcePrecheckPrePagamento === 'object'
        ? window.scfNfcePrecheckPrePagamento
        : null;

    /*
     * Evita clique duplo no FINALIZAR disparar duas consultas
     * praticamente simultâneas para a mesma venda.
     */
    if(
      estadoAnterior &&
      String(estadoAnterior.saleId || '') === saleId &&
      agora - Number(estadoAnterior.disparadoEm || 0) < 5000
    ){
      return false;
    }

    window.scfNfcePrecheckPrePagamento = {
      saleId,
      disparadoEm: agora
    };

    try{
      window.__scfPdvInfra.shellBridge.post(
        {
          type:
            'SCF_NFCE_PRECHECK_PRE_PAGAMENTO',

          saleId
        },
        '*'
      );

      console.log(
        '[NFCe][PRECHECK_PRE_PAGAMENTO_HTML]',
        JSON.stringify({
          saleId,
          disparadoEm: agora
        })
      );

      return true;
    }catch(error){
      console.warn(
        '[NFCe][PRECHECK_PRE_PAGAMENTO_HTML] falha ao solicitar pré-check.'
      );

      return false;
    }
  }


  function prepararNovaVenda(){
    currentSale = null;
    completedSale = null;
    metodoPagamentoPendente = '';
    window.scfNfcePrecheckPrePagamento = null;
    hideValidationWaitingCard();

    hideValidationWaitingCard();
    closeCompletedCard();
    closeCpfCard();
    closePaymentCard();

    selectedPaymentMethod = '';
    paymentParts = [];
    syncSelectedPaymentMethod();
    renderSplitPayments();

    resetTipoPessoaFiscal();

    resetTipoPessoaFiscal();

    resetTipoPessoaFiscal();

    if(cpfInput){
      cpfInput.value = '';
      cpfInput.setCustomValidity('');
      syncCpfHintState();
    }

    if(whatsappInput){
      whatsappInput.value = '';
      whatsappInput.setCustomValidity('');
    }

    showMainFiscalCard();
  }

  function openCard(event){
    const abrirCrediario =
      window.__scfCrediarioOpening ===
        true;

    window.__scfCrediarioOpening =
      false;

    currentSale =
      event &&
      event.detail
        ? event.detail
        : null;

    if(!currentSale){
      return;
    }

    /*
     * F6 | VENDA INTERNA:
     * o estado do toggle é persistente entre vendas e só muda quando
     * o operador pressiona F6 novamente. Aqui apenas "carimbamos" a
     * venda que está entrando em FINALIZAR VENDA.
     *
     * Liquidação de crediário nunca herda o modo interno: o F6 pode
     * continuar visualmente ativo, mas o recebimento do F5 mantém seu
     * fluxo fiscal próprio.
     */
    const vendaInternaAtiva =
      salePaymentDomain.internalSaleActive ===
        true &&
      currentSale.crediarioLiquidacao !==
        true &&
      String(
        currentSale.origemVenda ||
        ''
      ).trim().toUpperCase() !==
        'CREDIARIO';

    currentSale.vendaInterna =
      vendaInternaAtiva;

    if(vendaInternaAtiva){
      currentSale.origemVenda =
        'VENDA_INTERNA';
    }

    metodoPagamentoPendente = '';

    currentSale.cpfCliente = '';
    currentSale.cpfClienteFormatado = '';
    currentSale.cashReceived = 0;
    currentSale.cashReceivedFormatted = '';
    currentSale.changeAmount = 0;
    currentSale.changeFormatted = '';
    currentSale.paymentParts = [];

    hideValidationWaitingCard();
    closeCompletedCard();
    closeCpfCard();
    closePaymentCard();

    selectedPaymentMethod = '';
    paymentParts = [];
    syncSelectedPaymentMethod();
    renderSplitPayments();

    if(cpfInput){
      cpfInput.value = '';
      cpfInput.setCustomValidity('');
      syncCpfHintState();
    }

    if(whatsappInput){
      whatsappInput.value = '';
      whatsappInput.setCustomValidity('');
    }

    if(
      abrirCrediario
    ){
      window.__scfPdvInfra.eventBus.dispatch(
        new CustomEvent(
          'scf:crediario-venda-pronta',
          {
            detail:
              currentSale
          }
        )
      );

      return;
    }

    /*
     * Pré-check fiscal somente quando a venda realmente seguirá
     * para pagamento/emissão. Abrir um crediário não emite NFC-e.
     *
     * VENDA INTERNA não consulta SEFAZ nem sequer executa pré-check:
     * ela segue apenas pelo registro operacional/financeiro.
     */
    if(
      currentSale.vendaInterna !==
        true
    ){
      dispararPrecheckNfcePrePagamento(
        currentSale
      );
    }

    openPaymentCard();
  }

  /*
   * Ponte direta usada pelo botão FINALIZAR.
   * Primeiro abre a escolha da forma de pagamento.
   */
  window.scfAbrirCpfFiscalCard = openCard;

  /*
   * Ponte opcional para limpar o estado ao começar
   * uma nova venda.
   */
  window.scfPrepararCpfNovaVenda =
    prepararNovaVenda;

  function openCompletedCard(sale){
    const minimumUntil =
      Number(
        salePaymentDomain.validationMinimumUntil ||
        0
      );

    if(
      document.body.classList.contains(
        'sale-validation-waiting-open'
      ) &&
      minimumUntil > Date.now()
    ){
      window.setTimeout(
        function(){
          openCompletedCard(sale);
        },
        Math.max(
          0,
          minimumUntil - Date.now()
        )
      );

      return;
    }

    salePaymentDomain.validationMinimumUntil = 0;

    completedSale = sale || currentSale;

    closePaymentCard();

    /*
     * O resultado da validação também é exclusivo.
     * Nada de FINALIZAR VENDA pode aparecer por trás.
     */
    setFinalizeStandbySuppressed(true);

    hideValidationWaitingCard();
    completedOverlay.style.display = 'none';
    completedOverlay.setAttribute('aria-hidden', 'false');
    if(photoFrame){
      photoFrame.classList.remove('is-product-cancel-open');
      photoFrame.classList.remove('is-sale-finalize-open');
      photoFrame.classList.remove('is-client-identification-open');
      photoFrame.classList.remove('is-validation-waiting-open');
      photoFrame.classList.add('is-sale-completed-open');
    }
    if(completedPhotoPanel) completedPhotoPanel.hidden = false;
    document.body.classList.add('sale-completed-card-open');

    const focusButton = completedPhotoReceiptButton || receiptButton;
    if(focusButton){
      try{ focusButton.focus({ preventScroll: true }); }catch(e){ focusButton.focus(); }
    }
  }

  function concluirPagamentoDepoisDoCpf(){
    if(
      !currentSale ||
      !metodoPagamentoPendente
    ){
      return;
    }

    const metodo =
      metodoPagamentoPendente;

    metodoPagamentoPendente = '';

    savePayment(
      metodo
    );

    openValidationWaitingCard(
      currentSale
    );
  }

  function savePayment(method){
    if(!currentSale) return;

    const paidAt = new Date().toISOString();
    currentSale.paymentMethod = method;
    currentSale.paymentStatus = 'PAGO';
    currentSale.paidAt = paidAt;

    try{
      const key = window.__scfPdvContracts.storage.local.keys.fiscalSales;
      const history = JSON.parse(window.__scfPdvInfra.storage.local.getItem(key) || '[]');
      const saleNumber = String(currentSale.saleNumber || '');

      for(let index = history.length - 1; index >= 0; index -= 1){
        if(String(history[index] && history[index].saleNumber || '') === saleNumber){
          history[index] = Object.assign({}, history[index], {
            paymentMethod: method,
            paymentStatus: 'PAGO',
            paidAt: paidAt,
            paymentParts: Array.isArray(currentSale.paymentParts)
              ? currentSale.paymentParts.map(function(part){ return Object.assign({}, part); })
              : [],
            cashReceived: Number(currentSale.cashReceived || 0),
            cashReceivedFormatted: String(currentSale.cashReceivedFormatted || ''),
            changeAmount: Number(currentSale.changeAmount || 0),
            changeFormatted: String(currentSale.changeFormatted || ''),
            cpfCliente:
              String(
                currentSale.cpfCliente ||
                ''
              ),
            cpfClienteFormatado:
              String(
                currentSale.cpfClienteFormatado ||
                ''
              ),

            cnpjCliente:
              String(
                currentSale.cnpjCliente ||
                ''
              ),

            cnpjClienteFormatado:
              String(
                currentSale.cnpjClienteFormatado ||
                ''
              ),

            documentoClienteTipo:
              String(
                currentSale.documentoClienteTipo ||
                ''
              ),

            tipoPessoaCliente:
              String(
                currentSale.tipoPessoaCliente ||
                ''
              ),

            whatsappCliente:
              String(
                currentSale.whatsappCliente ||
                ''
              ),

            whatsappClienteFormatado:
              String(
                currentSale.whatsappClienteFormatado ||
                ''
              ),

            vendaInterna:
              currentSale.vendaInterna ===
                true,

            origemVenda:
              String(
                currentSale.origemVenda ||
                ''
              )
          });
          break;
        }
      }

      window.__scfPdvInfra.storage.local.setItem(key, JSON.stringify(history));
      window.__scfPdvInfra.storage.local.setItem(window.__scfPdvContracts.storage.local.keys.lastFinalizedSale, JSON.stringify(currentSale));
    }catch(e){}

    window.__scfPdvInfra.eventBus.dispatch(new CustomEvent('scf:venda-paga', {
      detail: currentSale
    }));
  }


  function continuarComIdentificacaoFiscal(){
    if(
      !currentSale ||
      !metodoPagamentoPendente
    ){
      return;
    }

    const cpf=cpfSomenteDigitos(
      cpfInput && cpfInput.value
    );

    const whatsappDigitado=
      whatsappSomenteDigitos(
        whatsappInput &&
        whatsappInput.value
      );

    const whatsapp=
      whatsappDigitado
        ? normalizarWhatsappFiscal(
            whatsappDigitado
          )
        : '';

    if(
      cpf &&
      !cpfFiscalValido(cpf)
    ){
      if(cpfInput){
        cpfInput.setCustomValidity(
          getDocumentoTipoAtual()==='CNPJ'
            ? 'Informe um CNPJ válido.'
            : 'Informe um CPF válido.'
        );
        cpfInput.reportValidity();
      }
      return;
    }

    if(
      whatsappDigitado &&
      !whatsappFiscalValido(
        whatsapp
      )
    ){
      if(whatsappInput){
        whatsappInput.setCustomValidity(
          'Informe um WhatsApp com DDD válido.'
        );
        whatsappInput.reportValidity();
      }
      return;
    }

    const tipoDocumentoSelecionado =
      getDocumentoTipoAtual();

    currentSale.cpfCliente =
      tipoDocumentoSelecionado === 'CPF'
        ? cpf
        : '';

    currentSale.cpfClienteFormatado =
      tipoDocumentoSelecionado === 'CPF'
        ? formatarCpfFiscal(
            cpf
          )
        : '';

    currentSale.cnpjCliente =
      tipoDocumentoSelecionado === 'CNPJ'
        ? cpf
        : '';

    currentSale.cnpjClienteFormatado =
      tipoDocumentoSelecionado === 'CNPJ'
        ? formatarCpfFiscal(
            cpf
          )
        : '';

    /*
     * A escolha PF/PJ é preservada mesmo se o operador informar
     * apenas WhatsApp. O documento continua opcional, mas a rota
     * fiscal escolhida não é perdida.
     */
    currentSale.documentoClienteTipo =
      tipoDocumentoSelecionado;

    currentSale.tipoPessoaCliente =
      tipoPessoaSelecionada;

    currentSale.whatsappCliente =
      whatsapp;

    currentSale.whatsappClienteFormatado =
      whatsapp
        ? formatarWhatsappFiscal(
            whatsapp
          )
        : '';

    closeCpfCard();
    concluirPagamentoDepoisDoCpf();
    return true;
  }

  if(cpfInformButton){
    cpfInformButton.addEventListener(
      'click',
      continuarComIdentificacaoFiscal
    );
  }

  function continuarSemIdentificacaoFiscal(){
    if(
      !currentSale ||
      !metodoPagamentoPendente
    ){
      return false;
    }

    /*
     * A identificação (documento/WhatsApp) é opcional,
     * mas a escolha PF/PJ NÃO pode ser descartada.
     *
     * Antes este fluxo zerava tipoPessoaCliente/documentoClienteTipo
     * e ainda chamava resetTipoPessoaFiscal() antes de finalizar.
     * Com PJ selecionada e sem CNPJ, a venda acabava sendo enviada
     * como consumidor comum e seguia o fluxo de NFC-e/CUPOM FISCAL.
     */
    const tipoPessoaEscolhida =
      tipoPessoaSelecionada === 'JURIDICA'
        ? 'JURIDICA'
        : 'FISICA';

    const tipoDocumentoEscolhido =
      tipoPessoaEscolhida === 'JURIDICA'
        ? 'CNPJ'
        : 'CPF';

    currentSale.cpfCliente = '';
    currentSale.cpfClienteFormatado = '';
    currentSale.cnpjCliente = '';
    currentSale.cnpjClienteFormatado = '';

    /*
     * Mesmo sem número digitado, preserva a rota fiscal escolhida:
     * PF -> CPF / NFC-e
     * PJ -> CNPJ / fluxo PJ (NF-e 55 / validação)
     */
    currentSale.documentoClienteTipo =
      tipoDocumentoEscolhido;

    currentSale.tipoPessoaCliente =
      tipoPessoaEscolhida;

    currentSale.whatsappCliente = '';
    currentSale.whatsappClienteFormatado = '';

    if(cpfInput){
      cpfInput.value = '';
      cpfInput.setCustomValidity('');
      syncCpfHintState();
    }

    if(whatsappInput){
      whatsappInput.value = '';
      whatsappInput.setCustomValidity('');
    }

    closeCpfCard();

    /*
     * Salva/enfileira a venda primeiro com PF/PJ preservado.
     * O reset visual fica para depois, sem alterar currentSale.
     */
    concluirPagamentoDepoisDoCpf();

    resetTipoPessoaFiscal();

    return true;
  }

  /*
   * ENTER confirma a tela de IDENTIFICAÇÃO NA NOTA:
   * - com CPF/CNPJ e/ou WhatsApp: valida, grava e avança;
   * - sem nenhum dado: avança porque a identificação é opcional.
   */
  document.addEventListener(
    'keydown',
    function(event){
      if(
        !event ||
        String(event.key || '') !== 'Enter' ||
        !document.body.classList.contains('cpf-fiscal-card-open')
      ){
        return;
      }

      const documento =
        cpfSomenteDigitos(
          cpfInput &&
          cpfInput.value
        );

      const whatsapp =
        whatsappSomenteDigitos(
          whatsappInput &&
          whatsappInput.value
        );

      event.preventDefault();
      event.stopPropagation();

      if(
        typeof event.stopImmediatePropagation === 'function'
      ){
        event.stopImmediatePropagation();
      }

      if(
        documento ||
        whatsapp
      ){
        /*
         * Há identificação digitada:
         * executa a antiga ação INFORMAR, agora via teclado.
         * Se CPF/CNPJ/WhatsApp for inválido, a própria função
         * mantém o operador nesta tela e exibe a validação.
         */
        continuarComIdentificacaoFiscal();
        return;
      }

      /*
       * Nenhum dado informado:
       * identificação é opcional e o fluxo avança preservando PF/PJ.
       */
      continuarSemIdentificacaoFiscal();
    },
    true
  );

  if(cpfCloseButton){
    cpfCloseButton.addEventListener(
      'click',
      continuarSemIdentificacaoFiscal
    );
  }

  overlay.addEventListener('click', function(event){
    if(event.target === overlay){
      metodoPagamentoPendente = '';
      closePaymentCard();
    }
  });

  if(cashPaidButton) cashPaidButton.addEventListener('click', function(){
    if(!currentSale) return;

    const cash = updateCashChange();
    if(cash.received < 0.005 || cash.remaining < 0.005){
      if(cashReceivedInput) cashReceivedInput.focus();
      return;
    }

    addPaymentPart('DINHEIRO', cash.applied, {
      received: cash.received,
      change: cash.change
    });
  });

  if(cashCancelButton) cashCancelButton.addEventListener('click', function(){
    returnToSplitOverview();
  });

  /*
   * Confirma a etapa atual de pagamento usando as mesmas validações
   * do fluxo normal, inclusive para pagamentos parciais via ENTER.
   */
  window.scfAddFinalizePaymentStage = function(options){
    if(
      finalizePhotoPanel &&
      finalizePhotoPanel.classList.contains('is-method-payment-mode')
    ){
      const amount =
        parseCashCurrency(
          methodAmountInput
            ? methodAmountInput.value
            : ''
        );

      const remaining =
        splitRemainingTotal();

      if(
        !editingPaymentMethod ||
        amount < 0.005
      ){
        if(methodAmountInput){
          try{ methodAmountInput.focus(); }catch(error){}
        }

        return false;
      }

      if(
        amount - remaining >
          0.005
      ){
        /*
         * PIX/DÉBITO/CRÉDITO não podem ultrapassar o restante.
         * Mantém o operador na etapa para corrigir o valor digitado.
         */
        if(methodAmountInput){
          methodAmountInput.value =
            formatCashCurrency(
              remaining
            );

          try{
            methodAmountInput.focus({
              preventScroll:true
            });
          }catch(error){
            try{ methodAmountInput.focus(); }catch(innerError){}
          }

          try{
            methodAmountInput.select();
          }catch(error){}
        }

        return false;
      }

      return addPaymentPart(
        editingPaymentMethod,
        amount,
        null,
        options
      );
    }

    if(
      finalizePhotoPanel &&
      finalizePhotoPanel.classList.contains('is-cash-payment-mode')
    ){
      if(
        !currentSale
      ){
        return false;
      }

      const cash =
        updateCashChange();

      if(
        cash.received < 0.005 ||
        cash.remaining < 0.005
      ){
        if(cashReceivedInput){
          try{ cashReceivedInput.focus(); }catch(error){}
        }

        return false;
      }

      return addPaymentPart(
        'DINHEIRO',
        cash.applied,
        {
          received:
            cash.received,

          change:
            cash.change
        },
        options
      );
    }

    return false;
  };

  function concluirPagamentoVenda(){
    if(!currentSale){
      return false;
    }

    const total = currentSaleTotalValue();
    const remaining = splitRemainingTotal();

    if(
      total <= 0 ||
      remaining >= 0.005
    ){
      renderSplitPayments();
      return false;
    }

    const methodLabel =
      combinedPaymentMethodLabel();

    if(!methodLabel){
      return false;
    }

    const cashParts =
      paymentParts.filter(
        function(part){
          return part.method ===
            'DINHEIRO';
        }
      );

    currentSale.paymentParts =
      paymentParts.map(
        function(part){
          return Object.assign(
            {},
            part
          );
        }
      );

    currentSale.paymentMethod =
      methodLabel;

    currentSale.cashReceived =
      cashParts.reduce(
        function(
          totalValue,
          part
        ){
          return (
            totalValue +
            Number(
              part.received ||
              0
            )
          );
        },
        0
      );

    currentSale.cashReceivedFormatted =
      currentSale.cashReceived
        ? formatCashCurrency(
            currentSale.cashReceived
          )
        : '';

    currentSale.changeAmount =
      cashParts.reduce(
        function(
          totalValue,
          part
        ){
          return (
            totalValue +
            Number(
              part.change ||
              0
            )
          );
        },
        0
      );

    currentSale.changeFormatted =
      currentSale.changeAmount
        ? formatCashCurrency(
            currentSale.changeAmount
          )
        : '';

    metodoPagamentoPendente =
      methodLabel;

    /*
     * O CREDIÁRIO já possui cliente/CPF/WhatsApp vinculados.
     * Ao clicar PAGAR, a escolha PIX/DÉBITO/CRÉDITO/DINHEIRO segue
     * direto para o fluxo normal da venda, sem pedir CPF NA NOTA novamente.
     */
    if(
      currentSale.crediarioLiquidacao ===
        true
    ){
      closePaymentCard();

      concluirPagamentoDepoisDoCpf();

      return true;
    }

    currentSale.cpfCliente = '';
    currentSale.cpfClienteFormatado = '';
    currentSale.cnpjCliente = '';
    currentSale.cnpjClienteFormatado = '';
    currentSale.whatsappCliente = '';
    currentSale.whatsappClienteFormatado = '';

    if(cpfInput){
      cpfInput.value = '';
      cpfInput.setCustomValidity('');
      syncCpfHintState();
    }

    if(whatsappInput){
      whatsappInput.value = '';
      whatsappInput.setCustomValidity('');
    }

    closePaymentCard();
    openCpfCard();

    return true;
  }

  /*
   * Se o operador digitou o TOTAL e a etapa entrou em PAGO automaticamente,
   * qualquer nova edição do valor deve devolver a parcela automática para a
   * etapa de digitação. Remove SOMENTE a última parcela criada pelo modo
   * automático reversível; pagamentos já adicionados pelo operador ficam
   * preservados.
   */
  window.scfRollbackFinalizeAutoPaymentStage =
    function(){
      const method =
        String(
          editingPaymentMethod ||
          selectedPaymentMethod ||
          ''
        )
          .trim()
          .toUpperCase();

      if(!method){
        return false;
      }

      let index = -1;

      for(
        let i = paymentParts.length - 1;
        i >= 0;
        i -= 1
      ){
        const part = paymentParts[i];
        const partMethod =
          String(
            part && part.method || ''
          )
            .trim()
            .toUpperCase();

        if(
          part &&
          part.__scfReversibleAutoPayment === true &&
          partMethod === method
        ){
          index = i;
          break;
        }
      }

      if(index < 0){
        return false;
      }

      paymentParts.splice(index, 1);
      renderSplitPayments();
      return true;
    };

  window.scfFinalizePaymentComplete =
    function(){
      const total =
        currentSaleTotalValue();

      const remaining =
        splitRemainingTotal();

      return Boolean(
        currentSale &&
        total > 0 &&
        remaining < 0.005 &&
        paymentParts.length > 0
      );
    };

  window.scfFinalizePaidSale =
    concluirPagamentoVenda;

  if(paidButton){
    paidButton.addEventListener(
      'click',
      concluirPagamentoVenda
    );
  }

  if(cancelButton) cancelButton.addEventListener('click', function(){
    metodoPagamentoPendente = '';
    selectedPaymentMethod = '';
    paymentParts = [];
    syncSelectedPaymentMethod();
    renderSplitPayments();
    closePaymentCard();
  });

  let solicitacaoCupomEmAndamento = false;
  let temporizadorSolicitacaoCupom = 0;
  let comprovanteAutorizadoCarregado = null;

  function vendaEstaAutorizada(){
    const venda =
      completedSale ||
      currentSale ||
      {};

    return Boolean(
      venda.fiscalResult &&
      venda.fiscalResult.autorizado ===
        true ||
      (
        String(
          venda.accessKey || ''
        ).trim() &&
        String(
          venda.protocol || ''
        ).trim()
      )
    );
  }

  function limparTemporizadorCupom(){
    if(temporizadorSolicitacaoCupom){
      clearTimeout(temporizadorSolicitacaoCupom);
      temporizadorSolicitacaoCupom = 0;
    }
  }

  function definirEstadoBotaoCupom({
    bloqueado,
    texto
  }){
    const label = texto || 'CUPOM FISCAL';
    if(receiptButton){
      receiptButton.disabled = Boolean(bloqueado);
      replaceButtonContent(receiptButton, label);
    }
    if(completedPhotoReceiptButton){
      completedPhotoReceiptButton.disabled = Boolean(bloqueado);
      replaceButtonContent(completedPhotoReceiptButton, label);
    }
  }

  function definirEstadoBotaoFechar({
    bloqueado,
    texto
  }){
    const label = texto || 'FECHAR';
    if(completedCloseButton){
      completedCloseButton.disabled = Boolean(bloqueado);
      replaceButtonContent(completedCloseButton, label);
    }
    if(completedPhotoCloseButton){
      completedPhotoCloseButton.disabled = Boolean(bloqueado);
      replaceButtonContent(completedPhotoCloseButton, label);
    }
  }

  function removerAcoesResultadoFoto(){
    const actions =
      completedPhotoPanel
        ? completedPhotoPanel.querySelector(
            '.fiscal-completed-sale-actions'
          )
        : null;

    if(actions){
      actions.remove();
    }

    completedPhotoReceiptButton = null;
    completedPhotoCloseButton = null;
  }

  function garantirAcoesResultadoFoto(){
    if(!completedPhotoPanel){
      return;
    }

    let actions =
      completedPhotoPanel.querySelector(
        '.fiscal-completed-sale-actions'
      );

    if(!actions){
      actions =
        document.createElement('div');

      actions.className =
        'fiscal-completed-sale-actions';

      const receipt =
        document.createElement('button');

      receipt.className =
        'fiscal-completed-sale-btn fiscal-completed-sale-btn-primary';

      receipt.id =
        'completedPhotoReceiptBtn';

      receipt.type = 'button';
      receipt.textContent =
        'CUPOM FISCAL';

      receipt.addEventListener(
        'click',
        handleCompletedReceiptAction
      );

      const close =
        document.createElement('button');

      close.className =
        'fiscal-completed-sale-btn fiscal-completed-sale-btn-danger';

      close.id =
        'completedPhotoCloseBtn';

      close.type = 'button';
      close.textContent =
        'FECHAR';

      close.addEventListener(
        'click',
        closeCompletedCard
      );

      actions.appendChild(receipt);
      actions.appendChild(close);
      completedPhotoPanel.appendChild(actions);
    }

    completedPhotoReceiptButton =
      completedPhotoPanel.querySelector(
        '#completedPhotoReceiptBtn'
      );

    completedPhotoCloseButton =
      completedPhotoPanel.querySelector(
        '#completedPhotoCloseBtn'
      );
  }

  function resultadoNaoLiberado({
    titulo,
    textoBotao
  }){
    return Boolean(
      String(titulo || '')
        .trim()
        .toUpperCase() ===
          'VENDA NÃO VALIDADA' &&
      String(textoBotao || '')
        .trim()
        .toUpperCase() ===
          'NÃO LIBERADA'
    );
  }

  function resultadoPessoaJuridicaRegistrada({
    titulo,
    mensagem
  }){
    const tituloNormalizado =
      String(titulo || '')
        .trim()
        .toUpperCase();

    const mensagemNormalizada =
      String(mensagem || '')
        .trim()
        .toUpperCase();

    return Boolean(
      tituloNormalizado ===
        'VENDA FINALIZADA' &&
      mensagemNormalizada.includes(
        'PESSOA JURÍDICA REGISTRADA'
      )
    );
  }

  function resultadoPessoaFisicaCupom({
    titulo,
    mensagem
  }){
    const tituloNormalizado =
      String(titulo || '')
        .trim()
        .toUpperCase();

    const mensagemNormalizada =
      String(mensagem || '')
        .trim()
        .toUpperCase();

    const venda =
      completedSale ||
      currentSale ||
      {};

    const juridica =
      (
        String(
          venda.tipoPessoaCliente || ''
        )
          .trim()
          .toUpperCase() ===
          'JURIDICA'
      ) ||
      (
        String(
          venda.documentoClienteTipo || ''
        )
          .trim()
          .toUpperCase() ===
          'CNPJ'
      ) ||
      venda.nfe55Pendente === true;

    return Boolean(
      !juridica &&
      tituloNormalizado ===
        'VENDA FINALIZADA' &&
      mensagemNormalizada ===
        'EMITIR COMPROVANTE DE PAGAMENTO'
    );
  }

  function resultadoNfceProcessando({
    titulo,
    textoBotao
  }){
    return Boolean(
      String(titulo || '')
        .trim()
        .toUpperCase() ===
          'EMITINDO NFC-E...' &&
      String(textoBotao || '')
        .trim()
        .toUpperCase() ===
          'PROCESSANDO...'
    );
  }

  function definirConteudoCardFiscal({
    titulo,
    mensagem,
    textoBotao,
    bloquearBotao,
    bloquearFechar,
    ocultarBotao
  }){
    const titleText = titulo || 'VENDA FINALIZADA';
    const messageText = mensagem || '';

    const naoLiberada =
      resultadoNaoLiberado({
        titulo: titleText,
        textoBotao
      });

    const pessoaJuridicaRegistrada =
      resultadoPessoaJuridicaRegistrada({
        titulo: titleText,
        mensagem: messageText
      });

    const pessoaFisicaCupom =
      resultadoPessoaFisicaCupom({
        titulo: titleText,
        mensagem: messageText
      });

    const nfceProcessando =
      resultadoNfceProcessando({
        titulo: titleText,
        textoBotao
      });

    document.body.classList.toggle(
      'scf-sale-not-released',
      naoLiberada
    );

    document.body.classList.toggle(
      'scf-sale-pj-registered-completed',
      pessoaJuridicaRegistrada
    );

    document.body.classList.toggle(
      'scf-sale-pf-cupom-ready',
      pessoaFisicaCupom
    );

    document.body.classList.toggle(
      'scf-nfce-processing',
      nfceProcessando
    );

    if(
      naoLiberada ||
      pessoaJuridicaRegistrada ||
      pessoaFisicaCupom ||
      nfceProcessando
    ){
      /*
       * Remove fisicamente os botões internos do card.
       * No processamento, PROCESSANDO/FECHAR deixam de existir
       * no centro e o estado passa para o rodapé.
       */
      removerAcoesResultadoFoto();
    }else{
      garantirAcoesResultadoFoto();
    }

    if(completedTitle){
      completedTitle.textContent = titleText;
    }
    if(completedPhotoTitle){
      completedPhotoTitle.textContent = titleText;
    }

    if(completedWarning){
      completedWarning.textContent = messageText;
    }
    if(completedPhotoMessage){
      completedPhotoMessage.textContent = messageText;
    }

    if(receiptButton) receiptButton.hidden = Boolean(ocultarBotao);
    if(completedPhotoReceiptButton) completedPhotoReceiptButton.hidden = Boolean(ocultarBotao);

    definirEstadoBotaoCupom({
      bloqueado:
        Boolean(bloquearBotao),

      texto:
        textoBotao ||
        'CUPOM FISCAL'
    });

    definirEstadoBotaoFechar({
      bloqueado:
        Boolean(bloquearFechar),

      texto:
        'FECHAR'
    });
  }

  function restaurarCardVendaFinalizada(){
    document.body.classList.remove(
      'scf-sale-not-released',
      'scf-sale-pj-registered-completed',
      'scf-sale-pf-cupom-ready',
      'scf-nfce-processing'
    );

    garantirAcoesResultadoFoto();

    if(receiptButton) receiptButton.hidden = false;
    if(completedPhotoReceiptButton) completedPhotoReceiptButton.hidden = false;
    definirConteudoCardFiscal({
      titulo:
        'VENDA FINALIZADA',

      mensagem:
        'EMITIR COMPROVANTE DE PAGAMENTO',

      textoBotao:
        'CUPOM FISCAL',

      bloquearBotao:
        false,

      bloquearFechar:
        false
    });
  }

  function vendaDaRespostaCorresponde(dados){
    const vendaAtual =
      completedSale ||
      currentSale;

    const saleIdAtual =
      String(
        vendaAtual &&
        vendaAtual.saleId ||
        ''
      );

    const saleIdRecebido =
      String(
        dados.saleId ||
        dados.sale &&
        dados.sale.saleId ||
        ''
      );

    return !(
      saleIdAtual &&
      saleIdRecebido &&
      saleIdAtual !==
        saleIdRecebido
    );
  }

  async function handleCompletedReceiptAction(){
    if(solicitacaoCupomEmAndamento) return;

    const venda = completedSale || currentSale;

    if(
      venda &&
      (
        venda.nfe55Pendente === true ||
        String(
          venda.tipoPessoaCliente || ''
        ).toUpperCase() === 'JURIDICA' ||
        String(
          venda.documentoClienteTipo || ''
        ).toUpperCase() === 'CNPJ'
      )
    ){
      console.warn(
        'Venda PJ: emissão de NFC-e bloqueada. A NF-e deve ser tratada pelo Histórico de Vendas.'
      );
      return;
    }
    const saleId = String(venda && venda.saleId || '').trim();

    if(!saleId){
      console.error('Não foi possível processar o cupom: saleId ausente.');
      return;
    }

    const contingenciaPendente =
      Boolean(
        venda &&
        venda.contingenciaOffline === true &&
        venda.pendenteTransmissao === true
      );

    if(contingenciaPendente){
      solicitacaoCupomEmAndamento = true;

      definirConteudoCardFiscal({
        titulo: 'PROCESSANDO CONTINGÊNCIA...',
        mensagem: 'CONSULTANDO A SITUAÇÃO DA NFC-e NA SEFAZ. NÃO FECHE ESTA TELA.',
        textoBotao: 'PROCESSANDO...',
        bloquearBotao: true,
        bloquearFechar: true
      });

      limparTemporizadorCupom();
      temporizadorSolicitacaoCupom = window.setTimeout(function(){
        solicitacaoCupomEmAndamento = false;
        temporizadorSolicitacaoCupom = 0;

        definirConteudoCardFiscal({
          titulo: 'REVISÃO MANUAL',
          mensagem: 'O PROCESSAMENTO DA CONTINGÊNCIA NÃO RETORNOU NO TEMPO ESPERADO. NÃO TENTE NOVAMENTE SEM CONFERIR A SITUAÇÃO FISCAL.',
          textoBotao: 'REVISÃO MANUAL',
          bloquearBotao: true,
          bloquearFechar: false
        });

        console.error(
          'O processamento da NFC-e em contingência não retornou no tempo esperado.'
        );
      }, 120000);

      window.__scfPdvInfra.shellBridge.post({
        type: 'SCF_NFCE_CONTINGENCIA_PROCESSAR',
        saleId
      }, '*');

      return;
    }

    if(vendaEstaAutorizada()){
      if(comprovanteAutorizadoCarregado && comprovanteAutorizadoCarregado.saleId === saleId){
        window.__scfPdvInfra.eventBus.dispatch(new CustomEvent('scf:emitir-cupom-fiscal', { detail: comprovanteAutorizadoCarregado }));
        return;
      }

      solicitacaoCupomEmAndamento = true;

      /*
       * Não exibe etapa intermediária "NFC-e AUTORIZADA".
       * Mantém PROCESSANDO até o DANFE assumir o card direito.
       */
      definirConteudoCardFiscal({
        titulo: 'EMITINDO NFC-e...',
        mensagem: 'AGUARDE A ABERTURA DO CUPOM FISCAL.',
        textoBotao: 'PROCESSANDO...',
        bloquearBotao: true,
        bloquearFechar: true
      });

      limparTemporizadorCupom();
      temporizadorSolicitacaoCupom = window.setTimeout(function(){
        solicitacaoCupomEmAndamento = false;
        temporizadorSolicitacaoCupom = 0;

        definirConteudoCardFiscal({
          titulo: 'ERRO AO CARREGAR CUPOM',
          mensagem: 'O COMPROVANTE AUTORIZADO NÃO RETORNOU NO TEMPO ESPERADO.',
          textoBotao: 'ERRO',
          bloquearBotao: true,
          bloquearFechar: false
        });

        console.error(
          'O comprovante autorizado não retornou dentro do tempo esperado.'
        );
      }, 15000);

      window.__scfPdvInfra.shellBridge.post({
        type: 'SCF_NFCE_SOLICITAR_COMPROVANTE',
        saleId
      }, '*');
      return;
    }

    solicitacaoCupomEmAndamento = true;
    definirConteudoCardFiscal({
      titulo: 'EMITINDO NFC-e...',
      mensagem: 'AGUARDE A RESPOSTA DA SEFAZ. NÃO FECHE ESTA TELA.',
      textoBotao: 'PROCESSANDO...',
      bloquearBotao: true,
      bloquearFechar: true
    });

    limparTemporizadorCupom();
    temporizadorSolicitacaoCupom = window.setTimeout(function(){
      solicitacaoCupomEmAndamento = false;
      temporizadorSolicitacaoCupom = 0;
      definirConteudoCardFiscal({
        titulo: 'ERRO NA EMISSÃO',
        mensagem: 'A RESPOSTA NÃO RETORNOU NO TEMPO ESPERADO. CONFIRA A SITUAÇÃO FISCAL ANTES DE TENTAR NOVAMENTE.',
        textoBotao: 'ERRO',
        bloquearBotao: true,
        bloquearFechar: false
      });
      console.error('A emissão não retornou resposta conclusiva dentro do tempo esperado.');
    }, 120000);

    window.__scfPdvInfra.shellBridge.post({
      type: 'SCF_NFCE_SOLICITAR_EMISSAO',
      saleId,
      sale: {
        ...venda
      }
    }, '*');
  }

  /*
   * Ponte usada pelo CUPOM FISCAL do rodapé na venda PF.
   * Reutiliza exatamente o fluxo fiscal já existente.
   */
  window.scfHandleCompletedReceiptAction =
    handleCompletedReceiptAction;

  if(receiptButton) receiptButton.addEventListener('click', handleCompletedReceiptAction);
  if(completedPhotoReceiptButton) completedPhotoReceiptButton.addEventListener('click', handleCompletedReceiptAction);

  if(completedCloseButton){
    completedCloseButton.addEventListener('click', closeCompletedCard);
  }
  if(completedPhotoCloseButton){
    completedPhotoCloseButton.addEventListener('click', closeCompletedCard);
  }

  window.__scfPdvInfra.eventBus.on('scf:limpar-venda-concluida',
    function(){
      solicitacaoCupomEmAndamento =
        false;

      limparTemporizadorCupom();

      comprovanteAutorizadoCarregado =
        null;

      currentSale =
        null;

      completedSale =
        null;

      if(false){
        /* dropdown removido */
          '';
      }

      closePaymentCard();

      limparTemporizadorValidacaoVenda();
      hideValidationWaitingCard();

      completedOverlay.style.display =
        'none';

      completedOverlay.setAttribute(
        'aria-hidden',
        'true'
      );

      document.body.classList.remove(
        'sale-completed-card-open'
      );

      restaurarCardVendaFinalizada();

      showMainFiscalCard();
    }
  );

  window.__scfPdvInfra.shellBridge.onMessage( function(event){
    const dados =
      event &&
      event.data &&
      typeof event.data ===
        'object'
        ? event.data
        : null;

    if(!dados) return;

    if(
      dados.type ===
        'SCF_VENDA_INTERNA_REGISTRADA'
    ){
      if(
        !vendaDaRespostaCorresponde(
          dados
        )
      ) return;

      limparTemporizadorValidacaoVenda();
      hideValidationWaitingCard();

      solicitacaoCupomEmAndamento =
        false;

      limparTemporizadorCupom();

      const vendaAtual =
        completedSale ||
        currentSale ||
        {};

      completedSale =
        Object.assign(
          {},
          vendaAtual,
          dados.sale &&
          typeof dados.sale ===
            'object'
            ? dados.sale
            : {},
          {
            vendaInterna:
              true,

            origemVenda:
              'VENDA_INTERNA',

            fiscalStatus:
              'VENDA_INTERNA'
          }
        );

      /*
       * Mantém a mesma transição visual de uma venda finalizada comum.
       * O comprovante não fiscal assume o painel logo em seguida.
       */
      restaurarCardVendaFinalizada();

      openCompletedCard(
        completedSale
      );

      definirConteudoCardFiscal({
        titulo:
          'VENDA INTERNA FINALIZADA',

        mensagem:
          'VENDA REGISTRADA SEM EMISSÃO FISCAL. ABRINDO COMPROVANTE.',

        textoBotao:
          'COMPROVANTE',

        bloquearBotao:
          true,

        bloquearFechar:
          true
      });

      const comprovanteInterno =
        dados.comprovante &&
        typeof dados.comprovante ===
          'object'
          ? dados.comprovante
          : null;

      if(!comprovanteInterno){
        definirConteudoCardFiscal({
          titulo:
            'VENDA INTERNA FINALIZADA',

          mensagem:
            'A VENDA FOI REGISTRADA, MAS O COMPROVANTE INTERNO NÃO FOI RECEBIDO.',

          textoBotao:
            'FECHAR',

          bloquearBotao:
            true,

          bloquearFechar:
            false
        });

        return;
      }

      window.setTimeout(
        function(){
          window.__scfPdvInfra.eventBus.dispatch(
            new CustomEvent(
              'scf:emitir-cupom-fiscal',
              {
                detail:
                  comprovanteInterno
              }
            )
          );
        },
        0
      );

      return;
    }

    if(
      dados.type ===
        'SCF_VENDA_OFFLINE_REGISTRADA'
    ){
      if(
        !vendaDaRespostaCorresponde(
          dados
        )
      ) return;

      limparTemporizadorValidacaoVenda();
      hideValidationWaitingCard();

      solicitacaoCupomEmAndamento =
        false;

      limparTemporizadorCupom();

      const vendaAtual =
        completedSale ||
        currentSale;

      const contingenciaFiscalPronta =
        Boolean(
          dados.fiscalContingencyReady === true &&
          dados.sale &&
          dados.sale.documentoFiscalEmitido === true &&
          String(
            dados.sale.fiscalStatus ||
            ''
          ).toUpperCase() ===
            'CONTINGENCIA_PENDENTE'
        );

      completedSale =
        Object.assign(
          {},
          vendaAtual || {},
          dados.sale &&
          typeof dados.sale ===
            'object'
            ? dados.sale
            : {},
          {
            offline:
              true,
            syncPendente:
              true,
            fiscalStatus:
              contingenciaFiscalPronta
                ? 'CONTINGENCIA_PENDENTE'
                : 'NAO_EMITIDA',
            documentoFiscalEmitido:
              contingenciaFiscalPronta,
            transmissaoFiscalExecutada:
              false,
            contingenciaOffline:
              contingenciaFiscalPronta,
            pendenteTransmissao:
              contingenciaFiscalPronta,
            tipoEmissao:
              contingenciaFiscalPronta
                ? 9
                : 0
          }
        );

      if(contingenciaFiscalPronta){
        const saleIdCupomPendente =
          String(
            completedSale &&
            completedSale.saleId ||
            dados.saleId ||
            ''
          ).trim();

        salePaymentDomain.currentReceiptPendingSaleId =
          saleIdCupomPendente;

        /*
         * Não revela o card intermediário de VENDA FINALIZADA.
         * Mantém AGUARDANDO VALIDAÇÃO cobrindo a coluna direita
         * até o DANFE local estar pronto. Assim não existe frame
         * visível com botões entre o pagamento e o cupom.
         *
         * Fallback: se o DANFE não chegar em 2,5 s, revela o estado
         * de contingência para o operador não ficar preso esperando.
         * O segundo adicional mantém AGUARDANDO VALIDAÇÃO cobrindo
         * qualquer transição visual intermediária do cupom.
         */
        window.setTimeout(
          function(){
            if(
              String(
                salePaymentDomain.currentReceiptPendingSaleId ||
                ''
              ) !== saleIdCupomPendente ||
              document.body.classList.contains(
                'fiscal-receipt-open'
              )
            ){
              return;
            }

            hideValidationWaitingCard();
            restaurarCardVendaFinalizada();

            openCompletedCard(
              completedSale ||
              currentSale
            );

            definirConteudoCardFiscal({
              titulo:
                'NFC-e EM CONTINGÊNCIA',
              mensagem:
                'DOCUMENTO FISCAL GERADO LOCALMENTE. PENDENTE DE AUTORIZAÇÃO. ABRINDO DANFE.',
              textoBotao:
                '',
              bloquearBotao:
                true,
              bloquearFechar:
                true,
              ocultarBotao:
                true
            });
          },
          2500
        );

        return;
      }

      hideValidationWaitingCard();
      restaurarCardVendaFinalizada();

      openCompletedCard(
        completedSale ||
        currentSale
      );

      definirConteudoCardFiscal({
        titulo:
          'VENDA SALVA OFFLINE',

        mensagem:
          'VENDA PAGA E SALVA NESTE COMPUTADOR. SINCRONIZAÇÃO PENDENTE. DOCUMENTO FISCAL NÃO EMITIDO.',

        textoBotao:
          '',

        bloquearBotao:
          true,

        bloquearFechar:
          false,

        ocultarBotao:
          true
      });

      return;
    }

    if(
      dados.type ===
        'SCF_VENDA_PJ_REGISTRADA'
    ){
      if(
        !vendaDaRespostaCorresponde(
          dados
        )
      ) return;

      limparTemporizadorValidacaoVenda();
      hideValidationWaitingCard();

      const vendaAtual =
        completedSale ||
        currentSale;

      completedSale =
        Object.assign(
          {},
          vendaAtual || {},
          dados.sale &&
          typeof dados.sale ===
            'object'
            ? dados.sale
            : {},
          {
            nfe55Pendente:
              true
          }
        );

      openCompletedCard(
        completedSale ||
        currentSale
      );

      definirConteudoCardFiscal({
        titulo:
          'VENDA FINALIZADA',

        mensagem:
          'VENDA PARA PESSOA JURÍDICA REGISTRADA. NFC-e NÃO EMITIDA. NF-e PENDENTE NO HISTÓRICO.',

        textoBotao:
          '',

        bloquearBotao:
          true,

        bloquearFechar:
          false,

        ocultarBotao:
          true
      });

      return;
    }

    if(
      dados.type === 'SCF_VENDA_ERRO' ||
      dados.type === 'SCF_NFCE_PRECHECK_ERRO'
    ){
      if(
        !vendaDaRespostaCorresponde(
          dados
        )
      ) return;

      limparTemporizadorValidacaoVenda();
      hideValidationWaitingCard();

      definirConteudoCardFiscal({
        titulo:
          dados.type === 'SCF_NFCE_PRECHECK_ERRO'
            ? 'PRÉ-CHECK NÃO APROVADO'
            : 'VENDA NÃO VALIDADA',

        mensagem:
          String(
            dados.message ||
            dados.mensagem ||
            'Não foi possível concluir a validação da venda.'
          ).toUpperCase(),

        textoBotao:
          dados.type === 'SCF_NFCE_PRECHECK_ERRO'
            ? ''
            : 'NÃO LIBERADA',

        bloquearBotao:
          true,

        bloquearFechar:
          false,

        ocultarBotao:
          dados.type === 'SCF_NFCE_PRECHECK_ERRO'
      });

      openCompletedCard(
        completedSale ||
        currentSale
      );

      console.error(
        'Falha na validação da venda:',
        dados && (dados.mensagem || dados.message)
          ? (dados.mensagem || dados.message)
          : 'Validação não aprovada.'
      );

      return;
    }

    if(
      dados.type ===
        'SCF_NFCE_PRECHECK_OK' ||
      dados.type ===
        'SCF_NFCE_VALIDACAO_OK'
    ){
      limparTemporizadorValidacaoVenda();

      const vendaAtual =
        completedSale ||
        currentSale;

      const saleIdAtual =
        String(
          vendaAtual &&
          vendaAtual.saleId ||
          ''
        );

      const saleIdRecebido =
        String(
          dados.saleId ||
          dados.sale &&
          dados.sale.saleId ||
          ''
        );

      if(
        saleIdAtual &&
        saleIdRecebido &&
        saleIdAtual !==
          saleIdRecebido
      ) return;

      if(
        dados.sale &&
        typeof dados.sale ===
          'object'
      ){
        completedSale =
          Object.assign(
            {},
            vendaAtual || {},
            dados.sale
          );
      }

      restaurarCardVendaFinalizada();

      openCompletedCard(
        completedSale ||
        currentSale
      );

      /*
       * Venda PF liberada para seguir ao backend fiscal:
       * aceita tanto o sinal histórico de pré-check quanto o novo
       * sinal de validação interna concluída.
       *
       * A autorização real continua passando pelo mesmo fluxo do
       * botão CUPOM FISCAL e pelas validações do backend de emissão.
       *
       * A pequena espera deixa o card concluir a troca visual para
       * VENDA FINALIZADA antes de assumir EMITINDO NFC-e....
       */
      const vendaAuto =
        completedSale ||
        currentSale;

      const saleIdAuto =
        String(
          vendaAuto &&
          vendaAuto.saleId ||
          ''
        ).trim();

      if(
        saleIdAuto &&
        !nfceAutoEmissionSaleIds.has(
          saleIdAuto
        )
      ){
        /*
         * O pré-check já aprovou a venda. A emissão automática não
         * depende mais de uma janela visual específica do card.
         * A trava é gravada apenas no instante da chamada fiscal real.
         */
        window.setTimeout(
          function(){
            const vendaAtualAuto =
              completedSale ||
              currentSale;

            const saleIdAtualAuto =
              String(
                vendaAtualAuto &&
                vendaAtualAuto.saleId ||
                ''
              ).trim();

            if(
              saleIdAtualAuto !==
                saleIdAuto ||
              solicitacaoCupomEmAndamento ||
              nfceAutoEmissionSaleIds.has(
                saleIdAuto
              )
            ){
              return;
            }

            const juridicaAuto =
              vendaAtualAuto &&
              (
                vendaAtualAuto.nfe55Pendente === true ||
                String(
                  vendaAtualAuto.tipoPessoaCliente ||
                  ''
                ).trim().toUpperCase() ===
                  'JURIDICA' ||
                String(
                  vendaAtualAuto.documentoClienteTipo ||
                  ''
                ).trim().toUpperCase() ===
                  'CNPJ'
              );

            if(juridicaAuto){
              return;
            }

            nfceAutoEmissionSaleIds.add(
              saleIdAuto
            );

            handleCompletedReceiptAction();
          },
          0
        );
      }

      return;
    }

    if(
      dados.type ===
      'SCF_NFCE_CONTINGENCIA_PROCESSAMENTO_ERRO'
    ){
      if(
        !vendaDaRespostaCorresponde(
          dados
        )
      ) return;

      solicitacaoCupomEmAndamento =
        false;

      limparTemporizadorCupom();

      const vendaAtualErroContingencia =
        completedSale ||
        currentSale ||
        {};

      completedSale =
        Object.assign(
          {},
          vendaAtualErroContingencia,
          {
            fiscalResult: dados,
            fiscalStatus: 'CONTINGENCIA_PENDENTE',
            contingenciaOffline: true,
            pendenteTransmissao: true
          }
        );

      definirConteudoCardFiscal({
        titulo: 'NFC-e EM CONTINGÊNCIA',
        mensagem: 'PENDENTE DE AUTORIZAÇÃO',
        textoBotao: 'PROCESSAR SEFAZ',
        bloquearBotao: false,
        bloquearFechar: false
      });

      console.error(
        'Falha na ponte do processamento da NFC-e em contingência:',
        dados.mensagem ||
        dados.message ||
        'A NFC-e permanece pendente e deverá ser processada novamente pelo fluxo seguro.'
      );

      return;
    }

    if(
      dados.type ===
      'SCF_NFCE_CONTINGENCIA_PROCESSAMENTO_RESULTADO'
    ){
      if(
        !vendaDaRespostaCorresponde(
          dados
        )
      ) return;

      limparTemporizadorCupom();

      const vendaAtualContingencia =
        completedSale ||
        currentSale ||
        {};

      const autorizadaContingencia =
        dados.autorizado === true &&
        dados.pendenteTransmissao !== true;

      if(autorizadaContingencia){
        completedSale =
          Object.assign(
            {},
            vendaAtualContingencia,
            {
              fiscalResult: dados,
              fiscalStatus: 'AUTORIZADA',
              contingenciaOffline: true,
              pendenteTransmissao: false,
              accessKey:
                dados.chaveAcesso ||
                vendaAtualContingencia.accessKey ||
                '',
              protocol:
                dados.protocolo ||
                '',
              nfceNumber:
                dados.numeroNfce ||
                vendaAtualContingencia.nfceNumber,
              nfceSeries:
                dados.serie ||
                vendaAtualContingencia.nfceSeries
            }
          );

        /*
         * A /plataforma carregará em seguida o comprovante já autorizado.
         * Mantemos a trava ativa até esse comprovante chegar.
         */
        solicitacaoCupomEmAndamento = true;

        definirConteudoCardFiscal({
          titulo: 'NFC-e AUTORIZADA',
          mensagem: 'AGUARDE A ABERTURA DO CUPOM FISCAL.',
          textoBotao: 'PROCESSANDO...',
          bloquearBotao: true,
          bloquearFechar: true
        });

        console.log(
          'NFC-e de contingência regularizada e autorizada.'
        );

        return;
      }

      solicitacaoCupomEmAndamento = false;

      if(dados.rejeitado === true){
        completedSale =
          Object.assign(
            {},
            vendaAtualContingencia,
            {
              fiscalResult: dados,
              fiscalStatus: 'CONTINGENCIA_REJEITADA',
              contingenciaOffline: true,
              pendenteTransmissao: false
            }
          );

        definirConteudoCardFiscal({
          titulo: 'NFC-e REJEITADA',
          mensagem:
            String(
              dados.mensagem ||
              dados.xMotivoProtocolo ||
              dados.xMotivoLote ||
              'A NFC-e EM CONTINGÊNCIA FOI REJEITADA PELA SEFAZ.'
            ).toUpperCase(),
          textoBotao: 'REJEITADA',
          bloquearBotao: true,
          bloquearFechar: false
        });

        console.error(
          'NFC-e de contingência rejeitada pela SEFAZ:',
          dados.mensagem ||
          dados.xMotivoProtocolo ||
          dados.xMotivoLote ||
          'Rejeição fiscal sem detalhe público.'
        );

        return;
      }

      const podeTentarQuandoServicoVoltar =
        dados.pendenteTransmissao === true &&
        dados.aguardarServico === true &&
        dados.novaTentativaBloqueada !== true &&
        dados.revisaoManualNecessaria !== true &&
        dados.reconciliacaoPorChaveNecessaria !== true;

      if(podeTentarQuandoServicoVoltar){
        completedSale =
          Object.assign(
            {},
            vendaAtualContingencia,
            {
              fiscalResult: dados,
              fiscalStatus: 'CONTINGENCIA_PENDENTE',
              contingenciaOffline: true,
              pendenteTransmissao: true,
              accessKey:
                dados.chaveAcesso ||
                vendaAtualContingencia.accessKey ||
                ''
            }
          );

        definirConteudoCardFiscal({
          titulo: 'NFC-e EM CONTINGÊNCIA',
          mensagem: 'PENDENTE DE AUTORIZAÇÃO',
          textoBotao: 'PROCESSAR SEFAZ',
          bloquearBotao: false,
          bloquearFechar: false
        });

        console.warn(
          'A NFC-e continua pendente de autorização:',
          dados.mensagem ||
          'Serviço da SEFAZ ainda indisponível.'
        );

        return;
      }

      completedSale =
        Object.assign(
          {},
          vendaAtualContingencia,
          {
            fiscalResult: dados,
            contingenciaOffline: true,
            pendenteTransmissao:
              dados.pendenteTransmissao === true
          }
        );

      definirConteudoCardFiscal({
        titulo: 'REVISÃO MANUAL',
        mensagem:
          String(
            dados.mensagem ||
            'A SITUAÇÃO FISCAL NÃO PERMITE NOVA TRANSMISSÃO AUTOMÁTICA.'
          ).toUpperCase(),
        textoBotao: 'REVISÃO MANUAL',
        bloquearBotao: true,
        bloquearFechar: false
      });

      console.error(
        'O processamento da NFC-e em contingência exige revisão manual:',
        dados.mensagem ||
        'Resultado não liberado para nova transmissão.'
      );

      return;
    }

    if(
      dados.type ===
      'SCF_NFCE_COMPROVANTE_AUTORIZADO'
    ){
      if(
        !vendaDaRespostaCorresponde(
          dados
        )
      ) return;

      solicitacaoCupomEmAndamento =
        false;

      limparTemporizadorCupom();

      comprovanteAutorizadoCarregado =
        dados.comprovante ||
        null;

      /*
       * O comprovante autorizado é aberto automaticamente pelo
       * listener do DANFE que recebe este mesmo message event.
       */

      return;
    }

    if(
      dados.type ===
      'SCF_NFCE_COMPROVANTE_ERRO'
    ){
      if(
        !vendaDaRespostaCorresponde(
          dados
        )
      ) return;

      solicitacaoCupomEmAndamento =
        false;

      limparTemporizadorCupom();

      definirConteudoCardFiscal({
        titulo: 'ERRO AO CARREGAR CUPOM',
        mensagem:
          dados.mensagem ||
          'FALHA AO CARREGAR O COMPROVANTE AUTORIZADO.',
        textoBotao: 'ERRO',
        bloquearBotao: true,
        bloquearFechar: false
      });

      console.error(
        'Falha ao carregar o comprovante autorizado:',
        dados.mensagem ||
        dados.message ||
        'Erro sem detalhe público.'
      );

      return;
    }

    const tiposEmissao = [
      'SCF_NFCE_EMISSAO_AUTORIZADA',
      'SCF_NFCE_EMISSAO_CONTINGENCIA',
      'SCF_NFCE_EMISSAO_REJEITADA',
      'SCF_NFCE_EMISSAO_NAO_REALIZADA',
      'SCF_NFCE_EMISSAO_REVISAO_MANUAL'
    ];

    if(
      !tiposEmissao.includes(
        dados.type
      )
    ) return;

    if(
      !vendaDaRespostaCorresponde(
        dados
      )
    ) return;

    solicitacaoCupomEmAndamento =
      false;

    limparTemporizadorCupom();

    if(
      dados.type ===
      'SCF_NFCE_EMISSAO_AUTORIZADA'
    ){
      completedSale =
        Object.assign(
          {},
          completedSale ||
          currentSale ||
          {},
          {
            fiscalResult:
              dados,

            accessKey:
              dados.chaveAcesso ||
              '',

            protocol:
              dados.protocolo ||
              '',

            nfceNumber:
              dados.numeroNfce,

            nfceSeries:
              dados.serie
          }
        );

      /*
       * Mantém "EMITINDO NFC-e... / PROCESSANDO" visível.
       * O DANFE abrirá automaticamente assim que o comprovante
       * autorizado chegar.
       */

      console.log(
        'NFC-e autorizada em produção.'
      );

      return;
    }

    if(
      dados.type ===
      'SCF_NFCE_EMISSAO_CONTINGENCIA'
    ){
      completedSale =
        Object.assign(
          {},
          completedSale ||
          currentSale ||
          {},
          {
            fiscalResult:
              dados,

            fiscalStatus:
              'CONTINGENCIA_PENDENTE',

            contingenciaOffline:
              true,

            pendenteTransmissao:
              true,

            accessKey:
              dados.chaveAcesso ||
              '',

            protocol:
              '',

            nfceNumber:
              dados.numeroNfce,

            nfceSeries:
              dados.serie
          }
        );

      comprovanteAutorizadoCarregado =
        null;

      const saleIdDanfeContingencia =
        String(
          dados.saleId ||
          completedSale && completedSale.saleId ||
          ''
        ).trim();

      if(saleIdDanfeContingencia){
        window.__scfPdvInfra.shellBridge.post({
          type: 'SCF_NFCE_COMPROVANTE_CONTINGENCIA_SOLICITAR',
          saleId: saleIdDanfeContingencia
        }, '*');
      }

      definirConteudoCardFiscal({
        titulo:
          'NFC-e EM CONTINGÊNCIA',

        mensagem:
          'PENDENTE DE AUTORIZAÇÃO',

        textoBotao:
          'PROCESSAR SEFAZ',

        bloquearBotao:
          false,

        bloquearFechar:
          false
      });

      console.warn(
        'NFC-e registrada em contingência offline e pendente de transmissão para autorização.'
      );

      return;
    }

    if(
      dados.type ===
      'SCF_NFCE_EMISSAO_REJEITADA'
    ){
      definirConteudoCardFiscal({
        titulo:
          'NFC-e REJEITADA',

        mensagem:
          [
            dados.cStatProtocolo ||
            dados.cStatLote,
            dados.xMotivoProtocolo ||
            dados.xMotivoLote ||
            dados.mensagem
          ]
            .filter(Boolean)
            .join(' - ') ||
          'A NFC-e NÃO FOI AUTORIZADA.',

        textoBotao:
          'REJEITADA',

        bloquearBotao:
          true,

        bloquearFechar:
          false
      });

      console.error(
        'NFC-e rejeitada em produção:',
        dados.mensagem ||
        dados.xMotivoProtocolo ||
        dados.xMotivoLote ||
        'Rejeição fiscal sem detalhe público.'
      );

      return;
    }

    if(
      dados.type ===
      'SCF_NFCE_EMISSAO_NAO_REALIZADA'
    ){
      definirConteudoCardFiscal({
        titulo:
          'EMISSÃO NÃO REALIZADA',

        mensagem:
          dados.mensagem ||
          'NENHUMA TRANSMISSÃO FOI REALIZADA.',

        textoBotao:
          'NÃO ENVIADA',

        bloquearBotao:
          true,

        bloquearFechar:
          false
      });

      console.error(
        'Emissão da NFC-e não realizada:',
        dados.mensagem ||
        'Emissão não realizada.'
      );

      return;
    }

    definirConteudoCardFiscal({
      titulo:
        'REVISÃO MANUAL',

      mensagem:
        dados.mensagem ||
        'O RESULTADO FISCAL NÃO FICOU CONCLUSIVO. NÃO TENTE NOVAMENTE.',

      textoBotao:
        'REVISÃO MANUAL',

      bloquearBotao:
        true,

      bloquearFechar:
        false
    });

    console.error(
      'Emissão da NFC-e exige revisão manual:',
      dados.mensagem ||
      'Revisão manual necessária.'
    );
  });

  /*
   * F5 CREDIÁRIO — prepara o snapshot para CONTAS A RECEBER.
   *
   * IMPORTANTE:
   * - NÃO marca a venda como PAGO;
   * - NÃO escolhe PIX;
   * - NÃO envia SCF_VENDA_PAGA;
   * - NÃO abre AGUARDE VALIDAÇÃO;
   * - NÃO emite NFC-e.
   *
   * O script visual do F5 envia este snapshot para SCF_CREDIARIO_ABRIR.
   */
  window.scfConfirmarVendaCrediario =
    function(dados){
      if(
        !currentSale
      ){
        return {
          ok:false,
          message:
            'Nenhuma venda está preparada para o crediário.'
        };
      }

      const payload =
        dados &&
        typeof dados === 'object'
          ? dados
          : {};

      const cliente =
        payload.cliente &&
        typeof payload.cliente === 'object'
          ? payload.cliente
          : {};

      const clienteId =
        String(
          cliente.clienteId ||
          cliente._id ||
          ''
        ).trim();

      const cpf =
        cpfSomenteDigitos(
          cliente.cpf ||
          cliente.documento ||
          ''
        );

      const nomeCliente =
        String(
          cliente.nome ||
          cliente.nomeCompleto ||
          cliente.razaoSocial ||
          ''
        )
          .replace(/\s+/g,' ')
          .trim();

      const whatsapp =
        whatsappSomenteDigitos(
          cliente.whatsapp ||
          cliente.whatsappFormatado ||
          ''
        );

      const pagamentoEm =
        String(
          payload.pagamentoEm ||
          payload.vencimento ||
          ''
        ).trim();

      if(!clienteId){
        return {
          ok:false,
          message:
            'SELECIONE O CLIENTE.'
        };
      }

      if(
        !cpf ||
        !cpfFiscalValido(
          cpf
        )
      ){
        return {
          ok:false,
          message:
            'O CLIENTE SELECIONADO PRECISA TER CPF VÁLIDO.'
        };
      }

      if(
        !/^\d{2}\/\d{2}\/\d{4}$/.test(
          pagamentoEm
        )
      ){
        return {
          ok:false,
          message:
            'INFORME O PAGAMENTO EM DD/MM/AAAA.'
        };
      }

      if(!currentSale.saleId){
        try{
          currentSale.saleId =
            crypto.randomUUID();
        }catch(error){
          currentSale.saleId =
            'CREDIARIO-' +
            Date.now() +
            '-' +
            Math.random()
              .toString(16)
              .slice(2);
        }
      }

      currentSale.crediario =
        true;

      currentSale.crediarioId =
        String(
          currentSale.saleId
        );

      currentSale.origemVenda =
        'CREDIARIO';

      currentSale.crediarioStatus =
        'A_RECEBER';

      currentSale.crediarioPagamentoEm =
        pagamentoEm;

      currentSale.clienteId =
        clienteId;

      currentSale.clienteNome =
        nomeCliente;

      currentSale.cpfCliente =
        cpf;

      currentSale.cpfClienteFormatado =
        formatarCpfFiscal(
          cpf
        );

      currentSale.cnpjCliente =
        '';

      currentSale.cnpjClienteFormatado =
        '';

      currentSale.documentoClienteTipo =
        'CPF';

      currentSale.tipoPessoaCliente =
        'FISICA';

      currentSale.whatsappCliente =
        whatsapp
          ? normalizarWhatsappFiscal(
              whatsapp
            )
          : '';

      currentSale.whatsappClienteFormatado =
        currentSale.whatsappCliente
          ? formatarWhatsappFiscal(
              currentSale.whatsappCliente
            )
          : '';

      /*
       * Enquanto está ABERTO, não existe pagamento fiscal.
       */
      currentSale.paymentMethod =
        '';

      currentSale.paymentStatus =
        'PENDENTE';

      currentSale.paymentParts =
        [];

      currentSale.paymentSplit =
        false;

      currentSale.paymentPartsCount =
        0;

      currentSale.paymentMethodsCount =
        0;

      currentSale.paymentTotalValue =
        0;

      currentSale.cashReceived =
        0;

      currentSale.cashReceivedFormatted =
        '';

      currentSale.changeAmount =
        0;

      currentSale.changeFormatted =
        '';

      return {
        ok:true,
        sale:
          Object.assign(
            {},
            currentSale,
            {
              products:
                Array.isArray(
                  currentSale.products
                )
                  ? currentSale.products.map(
                      function(item){
                        return Object.assign(
                          {},
                          item
                        );
                      }
                    )
                  : []
            }
          )
      };
    };


  /*
   * F7 no formulário de NOVO crediário: volta para o PDV sem apagar
   * os produtos que ainda estão na venda principal.
   */
  window.scfCancelarVendaCrediario =
    function(){
      metodoPagamentoPendente =
        '';

      closePaymentCard();
      closeCpfCard();
      hideValidationWaitingCard();

      currentSale =
        null;

      showMainFiscalCard();

      return true;
    };


  /*
   * PAGAR um CREDIÁRIO ABERTO.
   *
   * Recria somente o snapshot de venda usado pelo pagamento/fiscal.
   * O saleId é o próprio crediarioId. Por isso a baixa normal de estoque,
   * executada depois, reconhece as SAÍDAS já gravadas na abertura e não
   * desconta os produtos novamente.
   */
  /*
   * F7 DURANTE AS FORMAS DE PAGAMENTO DO CREDIÁRIO
   * ------------------------------------------------------------
   * Fecha somente o fluxo de pagamento/fiscal que ainda não foi
   * confirmado. Não altera conta a receber, estoque ou caixa.
   *
   * O módulo do CREDIÁRIO chama esta função e, em seguida, redesenha
   * o card "VENDA NO CREDIÁRIO".
   */
  window.scfCancelarPagamentoCrediarioEmAndamento =
    function(){
      const ehLiquidacaoCrediario =
        Boolean(
          currentSale &&
          currentSale.crediarioLiquidacao ===
            true
        );

      if(!ehLiquidacaoCrediario){
        return false;
      }

      metodoPagamentoPendente =
        '';

      selectedPaymentMethod =
        '';

      paymentParts =
        [];

      limparDestaqueTecladoPagamento();

      closePaymentCard();
      closeCpfCard();
      hideValidationWaitingCard();

      currentSale =
        null;

      completedSale =
        null;

      showMainFiscalCard();

      return true;
    };


  window.scfAbrirPagamentoCrediario =
    function(detalhe){
      const dados =
        detalhe &&
        typeof detalhe === 'object'
          ? detalhe
          : {};

      const conta =
        dados.conta &&
        typeof dados.conta === 'object'
          ? dados.conta
          : {};

      const itens =
        Array.isArray(
          dados.itens
        )
          ? dados.itens
          : [];

      const crediarioId =
        String(
          conta.crediarioId ||
          conta.saleId ||
          ''
        ).trim();

      const pagamentoParcial =
        dados.pagamentoParcial ===
          true;

      const fiscalSaleId =
        pagamentoParcial
          ? (
              String(
                dados.fiscalSaleId ||
                dados.saleIdPagamento ||
                ''
              ).trim() ||
              (
                globalThis.crypto &&
                typeof globalThis.crypto.randomUUID ===
                  'function'
                  ? globalThis.crypto.randomUUID()
                  : (
                      crediarioId +
                      '-P-' +
                      Date.now() +
                      '-' +
                      Math.random()
                        .toString(36)
                        .slice(2,10)
                    )
              )
            )
          : crediarioId;

      if(
        !crediarioId ||
        itens.length ===
          0
      ){
        return {
          ok:false,
          message:
            'O crediário não possui dados suficientes para pagamento.'
        };
      }

      const cpf =
        cpfSomenteDigitos(
          conta.cpf ||
          ''
        );

      if(
        !cpf ||
        !cpfFiscalValido(
          cpf
        )
      ){
        return {
          ok:false,
          message:
            'O cliente do crediário não possui CPF válido.'
        };
      }

      const produtos =
        itens.map(
          function(item,index){
            const quantity =
              Number(
                item.quantity ||
                0
              );

            const unitValue =
              Number(
                item.unitValue ||
                0
              );

            return {
              name:
                String(
                  item.description ||
                  item.name ||
                  'PRODUTO'
                ).trim(),

              quantity,

              unit:
                String(
                  item.unit ||
                  'UN'
                ).trim().toUpperCase(),

              unitValue,

              total:
                Number(
                  item.totalValue ||
                  item.total ||
                  (
                    quantity *
                    unitValue
                  )
                ),

              productFiscalId:
                String(
                  item.produtoId ||
                  item.productFiscalId ||
                  ''
                ).trim(),

              productCode:
                String(
                  item.productCode ||
                  item.codigoProduto ||
                  ''
                ).trim(),

              gtin:
                String(
                  item.productCode ||
                  ''
                ).trim(),

              barcode:
                String(
                  item.productCode ||
                  ''
                ).trim(),

              imageUrl:
                '',

              ncm:
                String(
                  item.ncm ||
                  ''
                ).trim(),

              cest:
                String(
                  item.cest ||
                  ''
                ).trim(),

              cfop:
                String(
                  item.cfop ||
                  ''
                ).trim(),

              taxCode:
                String(
                  item.taxCode ||
                  ''
                ).trim(),

              tributosReferenciaJson:
                item.tributosReferenciaJson ||
                '',

              itemNumber:
                Number(
                  item.itemNumber
                ) ||
                index +
                  1,

              crediarioItemId:
                String(
                  item.crediarioItemId ||
                  item.id ||
                  item._id ||
                  ''
                ).trim()
            };
          }
        );

      const totalProdutosPagamento =
        produtos.reduce(
          function(soma,item){
            return soma +
              Number(
                item.total ||
                0
              );
          },
          0
        );

      currentSale = {
        saleId:
          fiscalSaleId,

        crediarioId,

        crediario:
          true,

        crediarioLiquidacao:
          true,

        crediarioPagamentoParcial:
          pagamentoParcial,

        crediarioItensSelecionados:
          pagamentoParcial
            ? produtos
                .map(
                  item =>
                    String(
                      item.crediarioItemId ||
                      ''
                    ).trim()
                )
                .filter(Boolean)
            : [],

        crediarioValorAntesPagamento:
          Number(
            dados.valorAntesPagamento ||
            conta.saldoReceber ||
            conta.valor ||
            totalProdutosPagamento
          ),

        origemVenda:
          'CREDIARIO',

        crediarioStatus:
          'A_RECEBER',

        crediarioPagamentoEm:
          String(
            conta.vencimento ||
            ''
          ),

        clienteId:
          String(
            conta.clienteId ||
            ''
          ),

        clienteNome:
          String(
            conta.clienteNome ||
            ''
          ),

        cpfCliente:
          cpf,

        cpfClienteFormatado:
          formatarCpfFiscal(
            cpf
          ),

        cnpjCliente:
          '',

        cnpjClienteFormatado:
          '',

        documentoClienteTipo:
          'CPF',

        tipoPessoaCliente:
          'FISICA',

        whatsappCliente:
          normalizarWhatsappFiscal(
            conta.whatsapp ||
            ''
          ),

        whatsappClienteFormatado:
          conta.whatsapp
            ? formatarWhatsappFiscal(
                normalizarWhatsappFiscal(
                  conta.whatsapp
                )
              )
            : '',

        products:
          produtos,

        cancelledProducts:
          [],

        totalValue:
          pagamentoParcial
            ? Number(
                totalProdutosPagamento
              )
            : Number(
                conta.valor ||
                conta.saldoReceber ||
                totalProdutosPagamento
              ),

        paymentMethod:
          '',

        paymentStatus:
          'PENDENTE',

        paymentParts:
          [],

        paymentSplit:
          false,

        paymentPartsCount:
          0,

        paymentMethodsCount:
          0,

        paymentTotalValue:
          0,

        cashReceived:
          0,

        cashReceivedFormatted:
          '',

        changeAmount:
          0,

        changeFormatted:
          ''
      };

      metodoPagamentoPendente =
        '';

      selectedPaymentMethod =
        '';

      paymentParts =
        [];

      syncSelectedPaymentMethod();
      renderSplitPayments();

      closeCpfCard();
      hideValidationWaitingCard();
      closeCompletedCard();

      /*
       * Agora sim a venda vai seguir para pagamento/NFC-e.
       */
      dispararPrecheckNfcePrePagamento(
        currentSale
      );

      openPaymentCard();

      return {
        ok:true
      };
    };


  document.addEventListener('keydown', function(event){
    if(event.key !== 'Escape') return;

    // Depois de confirmar o pagamento, os cards CPF e AGUARDANDO VALIDAÇÃO não fecham por Escape.
    if(cpfOverlay.getAttribute('aria-hidden') === 'false') return;
    if(waitingOverlay.getAttribute('aria-hidden') === 'false') return;

    if(completedOverlay.getAttribute('aria-hidden') === 'false'){
      closeCompletedCard();
      return;
    }

    if(overlay.getAttribute('aria-hidden') === 'false'){
      closePaymentCard();
    }
  });

  window.__scfPdvInfra.eventBus.on('scf:finalizar-venda',
    openCard
  );

  /*
   * Ao iniciar uma nova venda, apenas limpa os dados
   * da venda anterior. O card CPF só será aberto depois
   * de confirmar a forma de pagamento.
   */
  window.__scfPdvInfra.eventBus.on('scf:nova-venda-pronta',
    prepararNovaVenda
  );
})();
