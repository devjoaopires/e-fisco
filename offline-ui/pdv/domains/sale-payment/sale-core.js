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
      'PDV continuity domain indisponivel para sale.'
    );
  }

  const API_BASE = 'https://tabelasfiscais.com.br/api/v1';
  const queryCache = { cfop: new Map(), ncm: new Map() };
  const requestVersion = { cfop: 0, ncm: 0 };
  const addedProducts = [];
  let activeProductIndex = -1;
  let productFiscalLookupTimer = null;
  let productFiscalLookupRequestId = 0;
  let productFiscalLookupPending = false;

  /*
   * PDV — CACHE LOCAL DE PRODUTOS
   *
   * O estoque carregado pelo próprio ERP alimenta este índice em memória.
   * Leitura do código de barras e F4 consultam o cache antes de chamar o
   * backend. A consulta externa fica como fallback quando os dados fiscais
   * locais ainda não estão completos.
   */
  const productsDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.products;

  if(!productsDomain){
    throw new Error(
      'PDV products domain indisponivel.'
    );
  }

  const pdvCodigoInternoBalancaValido =
    productsDomain.isInternalScaleCode;
  const cachePdvProductFiscal =
    productsDomain.cacheFiscalProduct;
  const findPdvCachedProduct =
    productsDomain.findCachedFiscalProduct;

  /*
   * PDV — se o operador apagar completamente o CÓDIGO DE BARRAS
   * depois que o produto já foi localizado e o foco passou para QTD,
   * o GTIN antigo não pode retornar por resposta atrasada nem por
   * uma nova consulta automática usando a descrição já preenchida.
   */
  let productBarcodeClearedManually = false;
  let productBarcodeClearGeneration = 0;
  let pendingProductEnterConfirmation = false;

  /*
   * PDV — CÓDIGO INTERNO DE BALANÇA / VALOR
   *
   * Reserva 0001..0999 para produtos cujo código digitado/lido é:
   *   0001 + 245  => produto 0001 com valor R$ 2,45
   *
   * O produto é localizado assim que os 4 primeiros dígitos existem.
   * Os dígitos seguintes são interpretados como centavos do valor da balança.
   * A inclusão em PRODUTOS ADICIONADOS acontece SOMENTE ao pressionar ENTER.
   */
  let productScaleLookupCode = '';
  let productScaleRejectedCode = '';
  let productScaleActiveCode = '';
  let currentProductImageUrl = '';
  let fiscalScannerActivatedForSale = false;

  // Navegação da lista de itens pelo teclado (desktop).
  let keyboardProductIndex = -1;
  let keyboardProductCancelIndex = -1;
  let cancelCardOpenIndex = -1;
  let scrollLastIncludedAfterRender = false;

  /*
   * Fica verdadeiro somente quando o operador navegou explicitamente
   * pela lista de PRODUTOS ADICIONADOS. Assim, ENTER pode abrir o item
   * selecionado para alterar a QTD sem confundir o ENTER enviado pelo scanner.
   */
  let keyboardProductEditSelectionReady = false;
  const $ = (id) => document.getElementById(id);

  const normalize = (value) => String(value == null ? '' : value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  function digitsOnly(value){
    return String(value || '').replace(/\D/g, '');
  }

  function formatCode(type, value){
    const digits = digitsOnly(value);
    if(type === 'ncm') return digits.slice(0, 8);
    if(type === 'cfop') return digits.slice(0, 4);
    return String(value || '').trim();
  }

  function rowFromObject(item, type){
    if(!item || typeof item !== 'object') return null;
    const codeKeys = type === 'ncm'
      ? ['codigo','Codigo','Código','codigo_num','code','ncm','NCM','co_ncm','CO_NCM']
      : ['cfop','CFOP','codigo','Codigo','Código','cfop_num','code'];
    const descKeys = ['descricao','Descricao','Descrição','description','nome','titulo','text'];
    let code = '';
    let description = '';

    for(const key of codeKeys){
      if(item[key] != null && String(item[key]).trim()){
        code = item[key];
        break;
      }
    }
    for(const key of descKeys){
      if(item[key] != null && String(item[key]).trim()){
        description = item[key];
        break;
      }
    }

    if(!code || !description) return null;
    code = formatCode(type, code);
    description = String(description)
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if(!code || !description) return null;
    return { code, description, search: normalize(code + ' ' + description) };
  }

  function extractRows(payload, type){
    const candidates = payload && (
      payload.resultados || payload.results || payload.items || payload.rows ||
      payload.data || payload.list || payload.Nomenclaturas || payload.nomenclaturas || payload[type] || payload[type.toUpperCase()]
    );
    const raw = Array.isArray(candidates)
      ? candidates
      : (Array.isArray(payload) ? payload : []);

    const unique = new Map();
    raw.map((item) => rowFromObject(item, type)).filter(Boolean).forEach((row) => {
      if(!unique.has(row.code)) unique.set(row.code, row);
    });
    return Array.from(unique.values());
  }

  async function fetchJson(url, timeoutMs = 15000){
    return window.__scfPdvInfra
      .browserNetwork
      .fetchJson(
        url,
        {
          method: 'GET',
          mode: 'cors',
          cache: 'no-store',
          headers: {
            'Accept':
              'application/json'
          }
        },
        timeoutMs
      );
  }

  async function searchOfficialNcm(query){
    return productsDomain.searchOfficialNcm(
      query,
      extractRows
    );
  }

  async function searchRemote(type, query){
    const cacheKey = normalize(query);
    if(queryCache[type].has(cacheKey)) return queryCache[type].get(cacheKey);

    let result = null;
    try{
      const url = API_BASE + '/' + type + '/buscar?q=' + encodeURIComponent(query) + '&page=1';
      const payload = await fetchJson(url);
      result = {
        rows: extractRows(payload, type),
        total: Number(payload && payload.total) || 0
      };
    }catch(error){
      if(type !== 'ncm') throw error;
      result = await searchOfficialNcm(query);
    }

    if(type === 'ncm' && (!result.rows || !result.rows.length)){
      try{ result = await searchOfficialNcm(query); }catch(error){}
    }

    queryCache[type].set(cacheKey, result);
    return result;
  }

  function closeResults(type){
    const el = $(type + 'Results');
    if(el) el.classList.remove('show');
  }

  function showResultMessage(type, message){
    const resultsEl = $(type + 'Results');
    resultsEl.innerHTML = '';
    const item = document.createElement('div');
    item.className = 'fiscal-empty-option';
    item.textContent = message;
    resultsEl.appendChild(item);
    resultsEl.classList.add('show');
  }

  function paintRows(type, rows){
    const resultsEl = $(type + 'Results');
    resultsEl.innerHTML = '';

    if(!rows.length){
      showResultMessage(type, 'Nenhum código encontrado.');
      return;
    }

    const fragment = document.createDocumentFragment();
    rows.slice(0, 40).forEach((row) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fiscal-combo-option';
      btn.setAttribute('role', 'option');

      const code = document.createElement('span');
      code.className = 'fiscal-combo-code';
      code.textContent = row.code;

      const desc = document.createElement('span');
      desc.className = 'fiscal-combo-desc';
      desc.textContent = row.description;

      btn.append(code, desc);
      btn.addEventListener('mousedown', (event) => event.preventDefault());
      btn.addEventListener('click', () => selectRow(type, row));
      fragment.appendChild(btn);
    });

    resultsEl.appendChild(fragment);
    resultsEl.classList.add('show');
  }

  async function renderResults(type, query){
    const raw = String(query || '').trim();
    const digits = digitsOnly(raw);
    const minimumReached = digits.length > 0 || normalize(raw).length >= 2;

    if(!raw){
      closeResults(type);
      return;
    }
    if(!minimumReached){
      showResultMessage(type, 'Digite pelo menos 2 letras ou um número.');
      return;
    }

    const version = ++requestVersion[type];
    showResultMessage(type, 'Buscando na tabela completa…');

    try{
      const result = await searchRemote(type, raw);
      if(version !== requestVersion[type]) return;
      paintRows(type, result.rows);
    }catch(error){
      if(version !== requestVersion[type]) return;
      showResultMessage(type, 'Não foi possível consultar agora. Digite o código manualmente.');
    }
  }

  function applyProductNcm(row, automatic){
    const code = formatCode('ncm', row && row.code);
    if(code.length !== 8) return;
    $('ncmSearch').value = code;
    $('ncmCode').value = code;
    $('ncmSelected').textContent = '';
    productsDomain.setNcmOrigin(
      automatic ? 'product-auto' : 'product-choice'
    );
    closeResults('ncm');
  }

  const saveLearnedProductNcm =
    productsDomain.saveLearnedProductNcm;

  function setupProductNcmLookup(){
    productsDomain.bindProductNcmLookup({
      searchRemote,
      applyProductNcm,
      closeResults
    });
  }

  function selectRow(type, row){
    const code = formatCode(type, row.code);
    $(type + 'Search').value = code;
    $(type + 'Code').value = code;
    $(type + 'Selected').textContent = '';
    if(type === 'ncm'){
      productsDomain.setNcmOrigin('manual-search');
      if($('productName')) saveLearnedProductNcm($('productName').value, code);
    }
    closeResults(type);
  }

  function acceptManualCode(type){
    const input = $(type + 'Search');
    const hidden = $(type + 'Code');
    const selected = $(type + 'Selected');
    const digits = digitsOnly(input.value);
    const expected = type === 'cfop' ? 4 : 8;

    if(digits.length === expected){
      const code = formatCode(type, digits);
      input.value = code;
      hidden.value = code;
      selected.textContent = '';
      if(type === 'ncm' && $('productName')) saveLearnedProductNcm($('productName').value, code);
      return true;
    }
    return false;
  }

  function setupCombo(type){
    const input = $(type + 'Search');
    const results = $(type + 'Results');
    let timer = null;

    input.addEventListener('input', () => {
      const onlyDigits = digitsOnly(input.value).slice(0, type === 'cfop' ? 4 : 8);
      if(input.value !== onlyDigits) input.value = onlyDigits;
      $(type + 'Code').value = '';
      $(type + 'Selected').textContent = '';
      if(type === 'ncm'){
        productsDomain.setNcmOrigin('manual');
        }
      clearTimeout(timer);
      timer = setTimeout(() => renderResults(type, input.value), 360);
    });

    input.addEventListener('focus', () => {
      if(input.value && !input.value.includes('—')) renderResults(type, input.value);
    });

    input.addEventListener('keydown', (event) => {
      if(event.key === 'Escape') closeResults(type);
      if(event.key === 'Enter' && results.classList.contains('show')){
        const first = results.querySelector('.fiscal-combo-option');
        if(first){
          event.preventDefault();
          first.click();
        }
      }
    });

    input.addEventListener('blur', () => {
      acceptManualCode(type);
      setTimeout(() => closeResults(type), 160);
    });
  }

  function parseMoney(value){
    let raw = String(value || '').trim().replace(/R\$\s?/g, '').replace(/\s/g, '');
    if(raw.includes(',') && raw.includes('.')) raw = raw.replace(/\./g, '').replace(',', '.');
    else if(raw.includes(',')) raw = raw.replace(',', '.');
    const n = Number(raw.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function money(value){
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }



  function isDesktopThreePanel(){
    return Boolean(
      window.matchMedia &&
      window.matchMedia('(min-width: 1001px)').matches
    );
  }

  function normalizeWixImageUrl(value){
    const raw = String(value || '').trim();
    if(!raw) return '';

    if(/^wix:image:\/\/v1\//i.test(raw)){
      const withoutPrefix = raw.replace(/^wix:image:\/\/v1\//i, '');
      const mediaId = withoutPrefix.split('/')[0].split('#')[0].trim();
      return mediaId
        ? 'https://static.wixstatic.com/media/' + mediaId
        : '';
    }

    if(/^(https?:\/\/|data:image\/|blob:)/i.test(raw)){
      return raw;
    }

    return '';
  }

  function imageUrlFromValue(value){
    if(typeof value === 'string'){
      return normalizeWixImageUrl(value);
    }

    if(!value || typeof value !== 'object'){
      return '';
    }

    const directCandidates = [
      value.url,
      value.src,
      value.fileUrl,
      value.imageUrl,
      value.photoUrl
    ];

    for(const candidate of directCandidates){
      const normalized = normalizeWixImageUrl(candidate);
      if(normalized) return normalized;
    }

    if(value.image){
      const nestedImage = imageUrlFromValue(value.image);
      if(nestedImage) return nestedImage;
    }

    return '';
  }

  function extractProductImageUrl(produto){
    if(!produto || typeof produto !== 'object') return '';

    const candidates = [
      produto.imagemUrl,
      produto.imageUrl,
      produto.fotoUrl,
      produto.photoUrl,
      produto.imagem,
      produto.image,
      produto.foto,
      produto.photo,
      produto.mainMedia,
      produto.media
    ];

    for(const candidate of candidates){
      const imageUrl = imageUrlFromValue(candidate);
      if(imageUrl) return imageUrl;
    }

    return '';
  }

  function renderDesktopProductPhoto(imageUrl, productName){
    const image = $('fiscalDesktopProductImage');
    if(!image) return;

    const safeImageUrl = normalizeWixImageUrl(imageUrl);
    const safeName = String(productName || '').trim();

    if(!safeImageUrl){
      image.hidden = true;
      image.removeAttribute('src');
      image.alt = '';
      return;
    }

    image.onload = function(){
      image.hidden = false;
    };

    image.onerror = function(){
      image.hidden = true;
      image.removeAttribute('src');
      image.alt = '';
    };

    image.alt = safeName
      ? 'Foto de ' + safeName
      : 'Foto do produto';
    image.src = safeImageUrl;
  }

  function updateDesktopProductPhotoFromCurrent(){
    const productName = $('productName');
    const productCode = $('productCode');
    const productBarcode = $('productBarcode');

    renderDesktopProductPhoto(
      currentProductImageUrl,
      productName ? productName.value : '',
      productCode && productCode.value
        ? productCode.value
        : (productBarcode ? productBarcode.value : '')
    );
  }






  function resetDesktopProductScannerView(){
    const trigger = $('barcodeScanTrigger');
    const scannerButton = $('addProductButton');

    if(trigger){
      trigger.hidden = false;
    }

    if(scannerButton){
      scannerButton.textContent = 'SCANNER';
      scannerButton.setAttribute('aria-label', 'Abrir scanner de código de barras');
      scannerButton.disabled = false;
      scannerButton.setAttribute('aria-disabled', 'false');
      scannerButton.title = '';
    }
  }



  function clearProductFiscalMatch(){
    const unit = $('productUnit');
    const fiscalId = $('productFiscalId');
    const productCode = $('productCode');
    const productGtin = $('productGtin');

    if(unit){
      unit.value = '';
      unit.placeholder = 'UN / CX';
    }
    if(fiscalId) fiscalId.value = '';
    if(productCode) productCode.value = '';
    if(productGtin) productGtin.value = '';

    currentProductImageUrl = '';
    hideProductCancelCard();
    updateDesktopProductPhotoFromCurrent();
    productFiscalLookupPending = false;
  }

  function applyProductFiscalMatch(produto){
    if(!produto || typeof produto !== 'object'){
      clearProductFiscalMatch();
      return false;
    }

    const unidade = String(produto.unidade || '').trim().toUpperCase();
    if(!unidade){
      clearProductFiscalMatch();
      toast('O produto cadastrado não possui unidade.');
      return false;
    }

    $('productFiscalId').value = String(produto.id || '').trim();
    $('productCode').value = String(produto.codigo || '').trim();
    $('productGtin').value = String(produto.gtin || '').trim();
    $('productUnit').value = unidade;
    $('productUnit').placeholder = 'UN / CX';

    const valorUnitarioCadastro = Number(produto.valorUnitario || 0);
    if(valorUnitarioCadastro > 0 && $('productUnitValue')){
      $('productUnitValue').value = money(valorUnitarioCadastro);
    }

    if(produto.nome){
      $('productName').value = String(produto.nome).trim();
    }

    if(
      produto.gtin &&
      !(
        productBarcodeClearedManually &&
        !digitsOnly(
          $('productBarcode').value ||
          ''
        )
      )
    ){
      $('productBarcode').value =
        String(
          produto.gtin
        ).trim();
    }

    if(produto.ncm){
      const ncm = digitsOnly(produto.ncm).slice(0, 8);
      if(ncm.length === 8){
        $('ncmSearch').value = ncm;
        $('ncmCode').value = ncm;
        $('ncmSelected').textContent = '';
        productsDomain.setNcmOrigin('produto-fiscal');
        closeResults('ncm');
      }
    }

    if(produto.cfop){
      const cfop = digitsOnly(produto.cfop).slice(0, 4);
      if(cfop.length === 4){
        $('cfopSearch').value = cfop;
        $('cfopCode').value = cfop;
      }
    }

    currentProductImageUrl = extractProductImageUrl(produto);
    updateDesktopProductPhotoFromCurrent();
    productFiscalLookupPending = false;
    syncCurrentProductAutomatically({ notify: false });
    return true;
  }

  function limparEstadoBalancaPdv(opcoes){
    const settings =
      opcoes &&
      typeof opcoes === 'object'
        ? opcoes
        : {};

    productScaleActiveCode = '';

    if(settings.manterConsulta !== true){
      productScaleLookupCode = '';
    }

    if(settings.manterRejeitado !== true){
      productScaleRejectedCode = '';
    }
  }

  function leituraCodigoBalancaPdv(){
    const leitura =
      digitsOnly(
        $('productBarcode')?.value ||
        ''
      ).slice(0,14);

    if(leitura.length < 4){
      return null;
    }

    const codigo =
      leitura.slice(0,4);

    if(
      !pdvCodigoInternoBalancaValido(
        codigo
      )
    ){
      return null;
    }

    return {
      leitura,
      codigo,
      sufixo:
        leitura.slice(4)
    };
  }

  function solicitarProdutoInternoBalancaPdv(codigo){
    const codigoNormalizado =
      digitsOnly(
        codigo
      ).slice(0,4);

    if(
      !pdvCodigoInternoBalancaValido(
        codigoNormalizado
      )
    ){
      return false;
    }

    if(
      productFiscalLookupPending &&
      productScaleLookupCode ===
        codigoNormalizado
    ){
      return true;
    }

    clearTimeout(
      productFiscalLookupTimer
    );

    productFiscalLookupTimer = null;

    const requestId =
      ++productFiscalLookupRequestId;

    productFiscalLookupPending =
      true;

    productScaleLookupCode =
      codigoNormalizado;

    productScaleRejectedCode =
      '';

    $('productFiscalId').value = '';
    $('productCode').value = '';
    $('productGtin').value = '';
    $('productUnit').value = '';
    $('productUnitValue').value = '';

    window.__scfPdvInfra.shellBridge.post({
      type:
        'SCF_PRODUTO_FISCAL_VENDA_BUSCAR',
      requestId,
      criterio:{
        codigo:
          codigoNormalizado
      }
    },'*');

    return true;
  }


  function aplicarLeituraBalancaPdv(produto){
    const leitura =
      leituraCodigoBalancaPdv();

    if(!leitura){
      return false;
    }

    const codigoProduto =
      digitsOnly(
        produto &&
        typeof produto === 'object'
          ? (
              produto.codigo ||
              produto.codigoProduto ||
              produto.sku ||
              ''
            )
          : (
              $('productCode')?.value ||
              ''
            )
      ).slice(0,4);

    if(
      !pdvCodigoInternoBalancaValido(
        codigoProduto
      ) ||
      codigoProduto !==
        leitura.codigo
    ){
      return false;
    }

    productScaleActiveCode =
      codigoProduto;

    productScaleLookupCode = '';
    productScaleRejectedCode = '';

    if(
      produto &&
      typeof produto === 'object'
    ){
      const idAtual =
        String(
          $('productFiscalId')?.value ||
          ''
        ).trim();

      const idProduto =
        String(
          produto.id ||
          produto.produtoId ||
          produto._id ||
          ''
        ).trim();

      if(
        !idAtual ||
        !idProduto ||
        idAtual !==
          idProduto
      ){
        if(
          !applyProductFiscalMatch(
            produto
          )
        ){
          return true;
        }
      }
    }

    const quantityInput =
      $('productQuantity');

    if(quantityInput){
      quantityInput.value =
        '1';
    }

    const valorInput =
      $('productUnitValue');

    if(!leitura.sufixo){
      if(valorInput){
        valorInput.value = '';
      }

      syncCurrentProductAutomatically({
        notify:false
      });

      return true;
    }

    const centavos =
      Number(
        leitura.sufixo
      );

    const valorBalanca =
      Number.isFinite(
        centavos
      )
        ? centavos / 100
        : 0;

    if(valorBalanca <= 0){
      if(valorInput){
        valorInput.value = '';
      }

      syncCurrentProductAutomatically({
        notify:false
      });

      return true;
    }

    if(valorInput){
      valorInput.value =
        money(
          valorBalanca
        );
    }

    syncCurrentProductAutomatically({
      notify:false
    });

    return true;
  }

  function tentarProcessarLeituraBalancaPdv(){
    const leitura =
      leituraCodigoBalancaPdv();

    if(!leitura){
      if(productScaleActiveCode){
        limparEstadoBalancaPdv({
          manterRejeitado:true
        });
      }

      return false;
    }

    const codigoAtual =
      digitsOnly(
        $('productCode')?.value ||
        ''
      ).slice(0,4);

    if(
      codigoAtual ===
        leitura.codigo &&
      pdvCodigoInternoBalancaValido(
        codigoAtual
      ) &&
      String(
        $('productFiscalId')?.value ||
        ''
      ).trim()
    ){
      return aplicarLeituraBalancaPdv();
    }

    const produtoCache =
      findPdvCachedProduct({
        codigo:
          leitura.codigo
      });

    if(produtoCache){
      return aplicarLeituraBalancaPdv(
        produtoCache
      );
    }

    if(
      productScaleRejectedCode ===
        leitura.codigo
    ){
      return false;
    }

    if(
      productFiscalLookupPending &&
      productScaleLookupCode ===
        leitura.codigo
    ){
      return true;
    }

    return solicitarProdutoInternoBalancaPdv(
      leitura.codigo
    );
  }

  function solicitarProdutoFiscalDaVenda(){
    const descricao = String($('productName').value || '').trim();
    const barcode = digitsOnly($('productBarcode').value || '').slice(0, 14);
    const barcodeCompleto = [8, 12, 13, 14].includes(barcode.length);

    if(
      productBarcodeClearedManually &&
      !barcode
    ){
      productFiscalLookupPending =
        false;
      return false;
    }

    if(barcode && !barcodeCompleto){
      clearProductFiscalMatch();
      return false;
    }

    if(!barcodeCompleto && normalize(descricao).length < 2){
      clearProductFiscalMatch();
      return false;
    }

    /*
     * Primeiro tenta a memória local. Em operação normal de caixa,
     * o estoque já foi pré-carregado e esta etapa é praticamente imediata.
     */
    const produtoCache =
      findPdvCachedProduct({
        barcode:
          barcodeCompleto
            ? barcode
            : '',
        descricao
      });

    if(produtoCache){
      const incluirAoLocalizar =
        pendingProductEnterConfirmation ===
          true;

      clearTimeout(
        productFiscalLookupTimer
      );

      productFiscalLookupPending =
        false;

      if(
        applyProductFiscalMatch(
          produtoCache
        )
      ){
        if(incluirAoLocalizar){
          pendingProductEnterConfirmation =
            false;

          confirmCurrentProductFromEnter();
        }else{
          focusProductQuantityForEdit(
            true
          );
        }

        return true;
      }
    }

    /*
     * Fallback: somente produtos ainda não completos no cache consultam
     * o backend fiscal.
     */
    const requestId = ++productFiscalLookupRequestId;
    productFiscalLookupPending = true;
    clearTimeout(productFiscalLookupTimer);

    $('productUnit').value = '';
    $('productUnit').placeholder = 'Buscando...';
    $('productFiscalId').value = '';
    $('productCode').value = '';
    $('productGtin').value = '';

    window.__scfPdvInfra.shellBridge.post({
      type: 'SCF_PRODUTO_FISCAL_VENDA_BUSCAR',
      requestId,
      criterio: {
        descricao,
        barcode: barcodeCompleto ? barcode : ''
      }
    }, '*');

    return false;
  }

  function agendarBuscaProdutoFiscal(imediata){
    pendingProductEnterConfirmation = false;
    clearTimeout(productFiscalLookupTimer);
    productFiscalLookupRequestId += 1;

    const descricao = String($('productName').value || '').trim();
    const barcode = digitsOnly($('productBarcode').value || '').slice(0, 14);
    const barcodeCompleto = [8, 12, 13, 14].includes(barcode.length);

    if(
      productBarcodeClearedManually &&
      !barcode
    ){
      clearProductFiscalMatch();
      return;
    }

    if(barcode && !barcodeCompleto){
      clearProductFiscalMatch();
      return;
    }

    if(!barcodeCompleto && normalize(descricao).length < 2){
      clearProductFiscalMatch();
      return;
    }

    /*
     * Código completo encontrado no cache: preenche na mesma interação
     * do leitor, sem aguardar os 80 ms nem consultar o backend.
     */
    const produtoCache =
      findPdvCachedProduct({
        barcode:
          barcodeCompleto
            ? barcode
            : '',
        descricao
      });

    if(
      produtoCache &&
      applyProductFiscalMatch(
        produtoCache
      )
    ){
      productFiscalLookupPending =
        false;

      return;
    }

    clearProductFiscalMatch();

    productFiscalLookupTimer = setTimeout(
      solicitarProdutoFiscalDaVenda,
      imediata === true || barcodeCompleto ? 80 : 650
    );
  }

  function setupProductFiscalLookup(){
    const nameInput = $('productName');
    const barcodeInput = $('productBarcode');

    if(nameInput){
      nameInput.addEventListener('input', () => agendarBuscaProdutoFiscal(false));
      nameInput.addEventListener('change', () => agendarBuscaProdutoFiscal(true));
      nameInput.addEventListener('blur', () => agendarBuscaProdutoFiscal(true));
    }

    if(barcodeInput){
      /*
       * PDV — GTIN APAGADO MANUALMENTE
       *
       * Se o operador ler/digitar um código e depois apagar TODO o conteúdo,
       * o código anterior não pode reaparecer por causa de uma consulta
       * atrasada ou de uma nova busca disparada pela descrição já preenchida.
       */
      function cancelarBuscaProdutoFiscalPorBarcodeVazio(){
        const barcode =
          digitsOnly(
            barcodeInput.value ||
            ''
          ).slice(
            0,
            14
          );

        if(barcode){
          return false;
        }

        pendingProductEnterConfirmation =
          false;

        limparEstadoBalancaPdv();

        productBarcodeClearedManually =
          true;

        const geracaoLimpeza =
          ++productBarcodeClearGeneration;

        clearTimeout(
          productFiscalLookupTimer
        );

        productFiscalLookupTimer =
          null;

        /*
         * Invalida qualquer resposta iniciada antes de o operador
         * apagar o CÓDIGO DE BARRAS.
         */
        productFiscalLookupRequestId +=
          1;

        productFiscalLookupPending =
          false;

        /*
         * Remove também os identificadores internos do produto anterior.
         * A descrição pode permanecer visível, mas não poderá disparar
         * nova consulta automática até existir um NOVO GTIN.
         */
        clearProductFiscalMatch();

        if($('productGtin')){
          $('productGtin').value =
            '';
        }

        if($('productFiscalId')){
          $('productFiscalId').value =
            '';
        }

        if($('productCode')){
          $('productCode').value =
            '';
        }

        /*
         * Existem rotinas que terminam de preencher o formulário
         * alguns milissegundos depois que o foco já foi para QTD.
         * Enquanto nenhum novo GTIN for digitado, garante que um
         * preenchimento atrasado não faça o código antigo reaparecer.
         */
        [
          0,
          30,
          80,
          160,
          320,
          650,
          1100
        ].forEach(
          function(atraso){
            window.setTimeout(
              function(){
                if(
                  geracaoLimpeza !==
                    productBarcodeClearGeneration ||
                  !productBarcodeClearedManually
                ){
                  return;
                }

                const campo =
                  $('productBarcode');

                if(campo){
                  campo.value =
                    '';
                }

                if($('productGtin')){
                  $('productGtin').value =
                    '';
                }

                if($('productFiscalId')){
                  $('productFiscalId').value =
                    '';
                }

                if($('productCode')){
                  $('productCode').value =
                    '';
                }
              },
              atraso
            );
          }
        );

        return true;
      }

      barcodeInput.addEventListener(
        'input',
        function(){
          if(
            cancelarBuscaProdutoFiscalPorBarcodeVazio()
          ){
            return;
          }

          /*
           * Começou a digitar/ler um NOVO GTIN:
           * libera definitivamente a trava do código anterior.
           */
          productBarcodeClearedManually =
            false;

          productBarcodeClearGeneration +=
            1;

          if(
            tentarProcessarLeituraBalancaPdv()
          ){
            return;
          }

          agendarBuscaProdutoFiscal(
            true
          );
        }
      );

      barcodeInput.addEventListener(
        'change',
        function(){
          if(
            cancelarBuscaProdutoFiscalPorBarcodeVazio()
          ){
            return;
          }

          if(
            tentarProcessarLeituraBalancaPdv()
          ){
            return;
          }

          agendarBuscaProdutoFiscal(
            true
          );
        }
      );

      barcodeInput.addEventListener(
        'blur',
        function(){
          if(
            cancelarBuscaProdutoFiscalPorBarcodeVazio()
          ){
            return;
          }

          if(
            tentarProcessarLeituraBalancaPdv()
          ){
            return;
          }

          agendarBuscaProdutoFiscal(
            true
          );
        }
      );
    }

    window.__scfPdvInfra.shellBridge.onMessage( (event) => {
      const data = event && event.data && typeof event.data === 'object'
        ? event.data
        : null;

      if(!data) return;
      if(data.requestId !== productFiscalLookupRequestId) return;

      if(data.type === 'SCF_PRODUTO_FISCAL_VENDA_RESULTADO'){
        const codigoBalancaConsultado =
          productScaleLookupCode;

        productFiscalLookupPending = false;

        if(codigoBalancaConsultado){
          productScaleLookupCode = '';

          if(
            data.found === true &&
            data.produto &&
            pdvCodigoInternoBalancaValido(
              data.produto.codigo ||
              codigoBalancaConsultado
            )
          ){
            cachePdvProductFiscal(
              data.produto
            );

            const incluirAoLocalizar =
              pendingProductEnterConfirmation ===
                true;

            aplicarLeituraBalancaPdv(
              data.produto
            );

            if(
              incluirAoLocalizar &&
              productIsComplete(
                currentProductData()
              )
            ){
              pendingProductEnterConfirmation =
                false;

              confirmCurrentProductFromEnter();
            }

            return;
          }

          productScaleRejectedCode =
            codigoBalancaConsultado;

          pendingProductEnterConfirmation =
            false;

          /*
           * O prefixo 0001..0999 não existe como código interno.
           * Se a leitura completa for um GTIN normal, retoma imediatamente
           * a busca tradicional sem mostrar erro intermediário.
           */
          agendarBuscaProdutoFiscal(
            true
          );

          return;
        }

        if(data.found === true && data.produto){
          cachePdvProductFiscal(
            data.produto
          );

          const incluirAoLocalizar =
            pendingProductEnterConfirmation ===
              true;

          if(applyProductFiscalMatch(data.produto)){
            /*
             * FLUXO DE SUPERMERCADO / LEITOR:
             * se o ENTER já chegou do scanner enquanto o backend ainda
             * localizava o produto, a própria resposta conclui a inclusão.
             * Sem ENTER, o produto continua apenas preparado para edição.
             */
            if(incluirAoLocalizar){
              pendingProductEnterConfirmation =
                false;

              confirmCurrentProductFromEnter();
            }else{
              focusProductQuantityForEdit(
                true
              );
            }
          }
        }else{
          pendingProductEnterConfirmation = false;
          clearProductFiscalMatch();
          const barcode = digitsOnly($('productBarcode').value || '');
          if([8, 12, 13, 14].includes(barcode.length)){
            toast(data.message || 'Produto não cadastrado ou inativo.');
          }
        }
        return;
      }

      if(data.type === 'SCF_PRODUTO_FISCAL_VENDA_ERRO'){
        const codigoBalancaConsultado =
          productScaleLookupCode;

        productFiscalLookupPending = false;

        if(codigoBalancaConsultado){
          productScaleLookupCode = '';
          productScaleRejectedCode =
            codigoBalancaConsultado;
          pendingProductEnterConfirmation =
            false;

          agendarBuscaProdutoFiscal(
            true
          );

          return;
        }

        pendingProductEnterConfirmation = false;
        clearProductFiscalMatch();
        toast(data.message || 'Não foi possível consultar o produto.');
      }
    });
  }

  function currentProductData(){
    const name = String($('productName').value || '').trim();
    const quantity = Number($('productQuantity').value || 0);
    const unitValue = parseMoney($('productUnitValue').value);
    const productCode = String($('productCode').value || '').trim();
    const codigoInternoBalanca =
      pdvCodigoInternoBalancaValido(
        productCode
      )
        ? digitsOnly(productCode).slice(0,4)
        : '';

    return {
      name,
      quantity,
      unit: String($('productUnit').value || '').trim().toUpperCase(),
      unitValue,
      total: quantity * unitValue,
      productFiscalId: String($('productFiscalId').value || '').trim(),
      productCode,
      gtin:
        codigoInternoBalanca
          ? ''
          : String($('productGtin').value || $('productBarcode').value || '').trim(),
      barcode:
        codigoInternoBalanca ||
        String($('productBarcode').value || '').trim(),
      scaleInternalCode:
        codigoInternoBalanca,
      scaleValue:
        codigoInternoBalanca
          ? unitValue
          : 0,
      imageUrl: currentProductImageUrl,
      ncm: String($('ncmCode').value || $('ncmSearch').value || '').trim(),
      cfop: String($('cfopCode').value || $('cfopSearch').value || '').trim()
    };
  }

  function addedProductsTotal(){
    return addedProducts.reduce((sum, item) => {
      if(item && item.cancelled === true) return sum;
      return sum + Number(item.total || 0);
    }, 0);
  }

  function activeAddedProducts(){
    return addedProducts.filter((item) => !(item && item.cancelled === true));
  }

  function productIsComplete(item){
    return Boolean(
      item.name &&
      item.productFiscalId &&
      item.unit &&
      item.quantity > 0 &&
      item.unitValue > 0
    );
  }

  function currentProductHasAnyValue(){
    const quantidade =
      Number(
        $('productQuantity').value ||
        0
      );

    return Boolean(
      String($('productName').value || '').trim() ||
      String($('productUnitValue').value || '').trim() ||
      String($('productBarcode').value || '').trim() ||
      (
        Number.isFinite(quantidade) &&
        quantidade > 0 &&
        quantidade !== 1
      )
    );
  }

  function crediarioMantemMenuPdvNormal(){
    const body = document.body;
    if(!body) return false;

    const crediarioNaTela =
      body.classList.contains('scf-crediario-open') ||
      body.classList.contains('scf-crediario-list-open') ||
      body.classList.contains('scf-crediario-detail-open');

    if(!crediarioNaTela) return false;

    /*
     * Enquanto o operador ainda está navegando/criando/pagando o CREDIÁRIO
     * dentro da página PDV, o menu global deve conservar exatamente o estado
     * visual do PDV normal. A classe fiscal-products-view-open é reutilizada
     * pelo layout do CREDIÁRIO e, sozinha, não significa que o botão central
     * do menu deva virar VOLTAR.
     *
     * A partir das etapas fiscais reais (formas de pagamento, processamento,
     * validação, resultado ou DANFE), deixamos as rotinas específicas desses
     * fluxos continuarem controlando o menu normalmente.
     */
    return !(
      body.classList.contains('scf-crediario-payment-methods-open') ||
      body.classList.contains('scf-nfce-processing') ||
      body.classList.contains('sale-validation-waiting-open') ||
      body.classList.contains('sale-completed-card-open') ||
      body.classList.contains('fiscal-receipt-open') ||
      body.classList.contains('scf-current-sale-receipt-open')
    );
  }

  function syncCentralSaleButtonState(){
    const crediarioPdvNormal =
      crediarioMantemMenuPdvNormal();

    const hasProducts =
      crediarioPdvNormal
        ? false
        : activeAddedProducts().length > 0;

    const productsViewOpen =
      crediarioPdvNormal
        ? false
        : document.body.classList.contains(
            'fiscal-products-view-open'
          );

    const crediarioDetailOpen =
      document.body.classList.contains(
        'scf-crediario-detail-open'
      );

    /*
     * PDV NORMAL — F11 | MOVIMENTAÇÃO:
     * enquanto a movimentação de caixa estiver aberta, o menu global deve
     * usar exatamente o mesmo bloqueio visual/funcional da venda com produto.
     * A abertura obrigatória do caixa fica fora desta regra.
     */
    const cashMovementOpen =
      document.body.classList.contains('scf-caixa-open') &&
      !document.body.classList.contains('scf-caixa-abertura-obrigatoria');

    const message = {
      type: 'SCF_CENTRAL_VENDA_ESTADO',
      hasProducts: hasProducts,
      productsViewOpen: productsViewOpen,
      crediarioPdvNormal: crediarioPdvNormal,
      crediarioDetailOpen: crediarioDetailOpen,
      cashMovementOpen: cashMovementOpen,
      total: addedProductsTotal()
    };

    const menuFrame = document.getElementById('__htmlStatusIframe');
    if(menuFrame && menuFrame.contentWindow){
      try{
        menuFrame.contentWindow.postMessage(message, '*');
      }catch(error){}
    }
  }

  /*
   * Permite que o iframe do menu peça uma nova sincronização
   * assim que terminar de carregar.
   */
  window.scfSincronizarBotaoCentralVenda = syncCentralSaleButtonState;

  function setMenuNewSaleIdleLock(locked){
    const menuFrame =
      document.getElementById(
        '__htmlStatusIframe'
      );

    if(
      !menuFrame ||
      !menuFrame.contentWindow
    ){
      return false;
    }

    try{
      menuFrame.contentWindow.postMessage(
        {
          type:
            locked
              ? 'SCF_MENU_FORCAR_PDV_IDLE'
              : 'SCF_MENU_LIBERAR_PDV_IDLE'
        },
        '*'
      );

      return true;
    }catch(error){
      return false;
    }
  }

  /*
   * O CREDIÁRIO troca classes diretamente no body sem passar por
   * setProductsView(). Observamos somente as classes que mudam o contexto do
   * menu para sincronizar imediatamente ao abrir/fechar F5, lista, detalhe,
   * pagamento ou DANFE.
   */
  (function observarContextoMenuCrediario(){
    const body = document.body;
    if(!body || typeof MutationObserver !== 'function') return;

    const classesObservadas = [
      'scf-crediario-open',
      'scf-crediario-list-open',
      'scf-crediario-detail-open',
      'scf-crediario-payment-methods-open',
      'scf-nfce-processing',
      'sale-validation-waiting-open',
      'sale-completed-card-open',
      'fiscal-receipt-open',
      'scf-current-sale-receipt-open',
      'fiscal-products-view-open',
      'scf-caixa-open',
      'scf-caixa-abertura-obrigatoria'
    ];

    function assinatura(){
      return classesObservadas
        .map(function(nome){
          return body.classList.contains(nome) ? '1' : '0';
        })
        .join('');
    }

    let assinaturaAnterior = assinatura();

    new MutationObserver(function(){
      const assinaturaAtual = assinatura();
      if(assinaturaAtual === assinaturaAnterior) return;
      assinaturaAnterior = assinaturaAtual;
      syncCentralSaleButtonState();
    }).observe(body,{
      attributes:true,
      attributeFilter:['class']
    });
  })();

  function updateProductControls(){
    const addButton = $('addProductButton');
    if(addButton){
      addButton.textContent = 'SCANNER';
      addButton.disabled = false;
      addButton.setAttribute('aria-disabled', 'false');
      addButton.setAttribute('aria-label', 'Abrir scanner de código de barras');
      addButton.title = '';
    }

    const clearButton = $('clearProductButton');
    if(clearButton){
      const locked = activeProductIndex >= 0;
      clearButton.disabled = locked;
      clearButton.setAttribute('aria-disabled', locked ? 'true' : 'false');
      clearButton.title = locked ? 'O produto já foi adicionado. Abra PRODUTOS para consultar a venda.' : '';
    }

    const productsButton = $('deleteProductButton');
    if(productsButton){
      productsButton.disabled = addedProducts.length === 0;
      productsButton.setAttribute('aria-disabled', addedProducts.length === 0 ? 'true' : 'false');
    }
  }

  function isEditableProductKeyboardTarget(target){
    if(!target || target === document.body || target === document.documentElement) return false;
    if(target.isContentEditable) return true;
    const tag = String(target.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  function getAddedProductWrap(index){
    const list = $('fiscalProductsList');
    if(!list || index < 0) return null;
    return list.querySelector('.fiscal-danfe-item-wrap[data-product-index="' + index + '"]:not(.is-preview)');
  }

  function updateKeyboardProductHighlight(){
    const list = $('fiscalProductsList');
    if(!list) return;
    list.querySelectorAll('.fiscal-danfe-item-wrap.is-keyboard-active').forEach((wrap) => {
      wrap.classList.remove('is-keyboard-active');
    });
    const activeWrap = getAddedProductWrap(keyboardProductIndex);
    if(activeWrap) activeWrap.classList.add('is-keyboard-active');
  }

  function scrollProductIndexIntoView(index, behavior){
    const wrap = getAddedProductWrap(index);
    if(!wrap) return;
    try{
      wrap.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: behavior || 'smooth'
      });
    }catch(error){
      wrap.scrollIntoView(false);
    }
  }

  function selectKeyboardProduct(index, options){
    if(!addedProducts.length){
      keyboardProductIndex = -1;
      keyboardProductCancelIndex = -1;
      updateKeyboardProductHighlight();
      return false;
    }

    const settings = options || {};
    const nextIndex = Math.max(0, Math.min(Number(index) || 0, addedProducts.length - 1));
    keyboardProductIndex = nextIndex;
    updateKeyboardProductHighlight();

    if(settings.scroll !== false){
      scrollProductIndexIntoView(nextIndex, settings.behavior || 'smooth');
    }
    return true;
  }

  function loadAddedProductForQuantityEdit(index){
    if(index < 0 || index >= addedProducts.length) return false;

    const item = addedProducts[index];
    if(!item || item.cancelled === true){
      toast('Este item não pode ser alterado.');
      keyboardProductEditSelectionReady = false;
      return false;
    }

    if(
      pdvCodigoInternoBalancaValido(
        item.scaleInternalCode ||
        item.productCode ||
        item.barcode
      )
    ){
      toast(
        'Item da balança: cancele e faça uma nova leitura para alterar o valor.'
      );

      keyboardProductEditSelectionReady =
        false;

      return false;
    }

    /* Cancela qualquer consulta anterior antes de restaurar o item. */
    pendingProductEnterConfirmation = false;
    productFiscalLookupPending = false;
    productFiscalLookupRequestId += 1;
    clearTimeout(productFiscalLookupTimer);
    resetKeyboardCancelButtons(-1);
    hideProductCancelCard();

    activeProductIndex = index;
    keyboardProductIndex = index;
    keyboardProductEditSelectionReady = false;
    productBarcodeClearedManually = false;
    productBarcodeClearGeneration += 1;

    $('productName').value = String(item.name || '').trim();
    $('productQuantity').value = String(Number(item.quantity || 1));
    $('productUnit').value = String(item.unit || '').trim().toUpperCase();
    $('productUnit').placeholder = 'UN / CX';
    $('productUnitValue').value = money(Number(item.unitValue || 0));
    $('productBarcode').value = String(item.barcode || item.gtin || '').trim();
    $('productFiscalId').value = String(item.productFiscalId || '').trim();
    $('productCode').value = String(item.productCode || '').trim();
    $('productGtin').value = String(item.gtin || item.barcode || '').trim();

    currentProductImageUrl = String(item.imageUrl || '').trim();

    if(item.ncm){
      const ncm = digitsOnly(item.ncm).slice(0, 8);
      $('ncmSearch').value = ncm;
      $('ncmCode').value = ncm;
      $('ncmSelected').textContent = '';
      productsDomain.setNcmOrigin('produto-fiscal');
    }

    if(item.cfop){
      const cfop = digitsOnly(item.cfop).slice(0, 4);
      $('cfopSearch').value = cfop;
      $('cfopCode').value = cfop;
    }

    updateDesktopProductPhotoFromCurrent();
    renderAddedProducts();
    updateProductControls();

    /*
     * O código volta a aparecer no campo e a QTD fica selecionada para
     * digitação imediata. O próximo ENTER confirma a atualização.
     */
    focusProductQuantityForEdit(false);
    toast('Item selecionado para alterar a quantidade.');
    return true;
  }

  function shouldOpenSelectedProductForEdit(targetId){
    return Boolean(
      keyboardProductEditSelectionReady === true &&
      activeProductIndex < 0 &&
      keyboardProductIndex >= 0 &&
      (targetId === 'productBarcode' || targetId === 'productQuantity') &&
      !currentProductHasAnyValue()
    );
  }

  function resetKeyboardCancelButtons(exceptIndex){
    const list = $('fiscalProductsList');
    if(!list){
      if(keyboardProductCancelIndex !== exceptIndex){
        keyboardProductCancelIndex = -1;
        hideProductCancelCard();
      }
      return;
    }
    list.querySelectorAll('.fiscal-danfe-status-button.is-cancel').forEach((button) => {
      const wrap = button.closest('.fiscal-danfe-item-wrap');
      const buttonIndex = wrap ? Number(wrap.dataset.productIndex) : -1;
      if(buttonIndex === exceptIndex) return;
      button.classList.remove('is-cancel');
      button.textContent = 'INCLUIDO';
      button.setAttribute('aria-label', 'Preparar cancelamento do item incluído');
    });
    if(keyboardProductCancelIndex !== exceptIndex){
      keyboardProductCancelIndex = -1;
      hideProductCancelCard();
      return;
    }
    syncProductCancelCard();
  }

  function armKeyboardProductCancel(index){
    const wrap = getAddedProductWrap(index);
    if(!wrap) return false;
    if(addedProducts[index] && addedProducts[index].cancelled === true){
      toast('Este item já está cancelado.');
      return false;
    }
    const button = wrap.querySelector('.fiscal-danfe-status-button');
    if(!button || button.classList.contains('is-cancelled')) return false;

    resetKeyboardCancelButtons(index);
    button.classList.add('is-cancel');
    button.textContent = 'CANCELAR';
    button.setAttribute('aria-label', 'Cancelar item ' + String(index + 1).padStart(3, '0'));
    keyboardProductCancelIndex = index;
    selectKeyboardProduct(index, { scroll: true, behavior: 'smooth' });
    showProductCancelCard(index, { focus:false, clear:true });
    return true;
  }

  function cancelCurrentSaleFromKeyboard(opcoes){
    const hadSaleData = addedProducts.length > 0 || currentProductHasAnyValue();

    /* Fecha qualquer etapa aberta no subcard da foto e zera pagamentos divididos. */
    if(typeof window.scfPrepararCpfNovaVenda === 'function'){
      try{ window.scfPrepararCpfNovaVenda(); }catch(error){}
    }else if(typeof window.scfCloseFinalizePhotoPanel === 'function'){
      try{ window.scfCloseFinalizePhotoPanel(); }catch(error){}
    }

    try{ hideProductCancelCard(); }catch(error){}

    const form = $('fiscalForm');
    if(form) form.reset();

    addedProducts.splice(0, addedProducts.length);
    activeProductIndex = -1;
    keyboardProductIndex = -1;
    keyboardProductCancelIndex = -1;
    keyboardProductEditSelectionReady = false;
    cancelCardOpenIndex = -1;
    scrollLastIncludedAfterRender = false;

    pendingProductEnterConfirmation = false;
    productFiscalLookupPending = false;
    currentProductImageUrl = '';
    productFiscalLookupRequestId += 1;
    clearTimeout(productFiscalLookupTimer);
    productsDomain.cancelNcmLookup();
    productsDomain.setNcmOrigin('');

    const ncmSearch = $('ncmSearch');
    const ncmCode = $('ncmCode');
    const ncmSelected = $('ncmSelected');
    if(ncmSearch) ncmSearch.value = '';
    if(ncmCode) ncmCode.value = '';
    if(ncmSelected) ncmSelected.textContent = '';

    try{ clearProductFiscalMatch(); }catch(error){}
    try{ closeResults('ncm'); }catch(error){}
    try{ setDefaultCfop(); }catch(error){}
    try{ resetDesktopProductScannerView(); }catch(error){}
    try{ resetFiscalScannerForNewSale(); }catch(error){}

    renderDesktopProductPhoto('', '');
    renderAddedProducts();
    updateProductControls();
    updateTotal();
    setProductsView(false);
    syncCentralSaleButtonState();

    const shell = $('fiscalFormShell');
    const card = $('fiscalForm');
    if(shell) shell.hidden = false;
    if(card) card.hidden = false;
    document.body.classList.remove('fiscal-products-view-open');

    try{
      window.__scfPdvInfra.storage.local.removeItem(window.__scfPdvContracts.storage.local.keys.fiscalDraft);
      window.__scfPdvInfra.storage.local.removeItem(window.__scfPdvContracts.storage.local.keys.lastFinalizedSale);
    }catch(error){}

    try{ gerarNovoNumeroVenda(); }catch(error){}

    /*
     * Nova venda após F3/CANCELAMENTO:
     * deixa o leitor pronto no CÓDIGO DE BARRAS, não em QTD.
     * QTD permanece no padrão 1, mas não recebe as setas do teclado.
     */
    const quantityInput = $('productQuantity');
    if(quantityInput){
      quantityInput.value = '1';
    }

    const barcodeInput = $('productBarcode');
    if(barcodeInput){
      try{ barcodeInput.focus({ preventScroll:true }); }catch(error){ barcodeInput.focus(); }
    }

    window.__scfPdvInfra.eventBus.dispatch(new CustomEvent('scf:nova-venda-pronta'));
    const crediarioSalvo =
      opcoes &&
      typeof opcoes === 'object' &&
      opcoes.crediarioSalvo ===
        true;

    toast(
      crediarioSalvo
        ? 'Crediário salvo. PDV disponível para a próxima venda.'
        : (
            hadSaleData
              ? 'Venda cancelada. Caixa disponível para a próxima venda.'
              : 'Caixa disponível para a próxima venda.'
          )
    );
  }

  /*
   * Ponte usada pelo resultado NÃO LIBERADA.
   * É a MESMA rotina do F3 | CANCELAR VENDA.
   */
  window.scfCancelCurrentSaleFromKeyboard =
    cancelCurrentSaleFromKeyboard;

  /*
   * Mantém o foco no campo operacional que já estava ativo durante
   * a navegação ↑ / ↓ entre os produtos adicionados.
   *
   * Isso é importante principalmente para CÓDIGO DE BARRAS:
   * o operador pode consultar as linhas e o leitor continua pronto
   * para a próxima leitura sem precisar clicar novamente no input.
   */
  function restoreProductOperationalFocus(targetId){
    if(
      targetId !== 'productBarcode' &&
      targetId !== 'productQuantity'
    ){
      return;
    }

    const field =
      $(targetId);

    if(!field){
      return;
    }

    window.requestAnimationFrame(
      function(){
        try{
          field.focus({
            preventScroll:true
          });
        }catch(error){
          try{
            field.focus();
          }catch(innerError){}
        }

        /*
         * No código de barras deixa o cursor no final.
         * Não seleciona o conteúdo inteiro para não interferir com
         * a sequência enviada pelo leitor.
         */
        if(targetId === 'productBarcode'){
          try{
            const pos =
              String(
                field.value || ''
              ).length;

            field.setSelectionRange(
              pos,
              pos
            );
          }catch(error){}
        }
      }
    );
  }

  function handleProductsKeyboardNavigation(event){
    if(!event) return;
    if(event.ctrlKey || event.metaKey || event.altKey) return;

    const key = String(event.key || '');
    const target = event.target;
    const targetId = String(target && target.id || '');
    const targetEditable = isEditableProductKeyboardTarget(target);

    /*
     * CANCELAR ITEM SEM SENHA:
     * enquanto o card de confirmação estiver aberto, ENTER confirma
     * imediatamente o cancelamento e F7 fecha sem cancelar.
     * Isso impede que o código de barras/QTD recebam teclas por trás do card.
     */
    if(productCancelCardIsOpen()){
      if(key === 'Enter'){
        event.preventDefault();
        event.stopPropagation();
        if(typeof event.stopImmediatePropagation === 'function'){
          event.stopImmediatePropagation();
        }
        const cancelado =
          confirmProductCancelFromCard();

        if(cancelado){
          confirmarPersistenciaCancelamentoCrediarioViaEnter();
        }

        return;
      }

      if(key === 'F7'){
        event.preventDefault();
        event.stopPropagation();
        if(typeof event.stopImmediatePropagation === 'function'){
          event.stopImmediatePropagation();
        }
        resetProductCancelButtonsState();
        hideProductCancelCard();
        restoreProductOperationalFocus('productBarcode');
        return;
      }

      /*
       * F2 EM MODO TOGGLE:
       * - primeiro F2 arma CANCELAR no item selecionado;
       * - segundo F2 desarma o cancelamento sem alterar o item.
       * Vale igualmente para a venda normal e para o detalhe operacional
       * do crediário, pois ambos usam este mesmo motor de produtos.
       */
      if(key === 'F2'){
        event.preventDefault();
        event.stopPropagation();
        if(typeof event.stopImmediatePropagation === 'function'){
          event.stopImmediatePropagation();
        }
        resetProductCancelButtonsState();
        hideProductCancelCard();
        restoreProductOperationalFocus('productBarcode');
        return;
      }

      /* Nenhum outro atalho operacional atua por trás da confirmação. */
      if(
        key === 'F1' ||
        key === 'F3' ||
        key === 'F5' ||
        key === 'ArrowUp' ||
        key === 'ArrowDown'
      ){
        event.preventDefault();
        event.stopPropagation();
        if(typeof event.stopImmediatePropagation === 'function'){
          event.stopImmediatePropagation();
        }
        return;
      }
    }

    /*
     * SETAS DO PDV:
     * ArrowUp / ArrowDown sempre navegam entre PRODUTOS ADICIONADOS quando
     * o foco está em QTD ou CÓDIGO DE BARRAS.
     *
     * Isso é intencional:
     * - no input number QTD, as setas NÃO alteram o valor numericamente;
     * - no CÓDIGO DE BARRAS, o foco permanece pronto para o leitor;
     * - a linha selecionada muda apenas pelo destaque visual da lista.
     *
     * F1/F2/F3 continuam aceitos nos dois campos operacionais.
     * Outros inputs editáveis continuam com comportamento normal.
     */
    const listNavigationFromSaleInput = (
      targetId === 'productQuantity' ||
      targetId === 'productBarcode'
    ) && (
      key === 'ArrowDown' ||
      key === 'ArrowUp'
    );

    const saleShortcutFromSaleInput = (
      targetId === 'productQuantity' || targetId === 'productBarcode'
    ) && (key === 'F1' || key === 'F3' || key === 'F5');

    const cancelShortcutFromSaleInput = (
      targetId === 'productQuantity' || targetId === 'productBarcode'
    ) && key === 'F2';

    const editSelectedProductFromSaleInput =
      key === 'Enter' &&
      shouldOpenSelectedProductForEdit(targetId);

    const allowOperationalKeyInEditable =
      listNavigationFromSaleInput ||
      saleShortcutFromSaleInput ||
      cancelShortcutFromSaleInput ||
      editSelectedProductFromSaleInput;

    if(targetEditable && !allowOperationalKeyInEditable) return;

    const shell = $('fiscalFormShell');
    if(!shell || shell.hidden) return;

    /*
     * F3 NA LISTA DO CREDIÁRIO (F5):
     * enquanto a lista CLIENTE | WHATSAPP | SITUAÇÃO estiver aberta,
     * F3 não cancela a venda e não fecha o modo crediário.
     * No detalhe do cliente, a rotina específica do crediário continua
     * responsável pelo F3 (cancelamento do crediário/estorno).
     */
    if(
      key === 'F3' &&
      document.body.classList.contains('scf-crediario-list-open') &&
      !document.body.classList.contains('scf-crediario-detail-open')
    ){
      event.preventDefault();
      event.stopPropagation();
      if(typeof event.stopImmediatePropagation === 'function'){
        event.stopImmediatePropagation();
      }
      return;
    }

    /* F3 cancela a venda inteira de qualquer ponto normal do PDV. */
    if(key === 'F3'){
      event.preventDefault();
      event.stopPropagation();
      cancelCurrentSaleFromKeyboard();

      /*
       * F3 também força a releitura do próximo número no ambiente atual.
       * ONLINE: a página Wix responde pelo contador do servidor.
       * OFFLINE: o shell responde pelo contador local do mesmo caixa.
       */
      window.setTimeout(function(){
        try{
          window.__scfPdvInfra.shellBridge.post({
            type: 'SCF_NFCE_NUMERACAO_SOLICITAR'
          }, '*');
        }catch(_){}
      }, 0);

      return;
    }

    const photoFrame = document.querySelector('#fiscalDesktopProductPhoto .fiscal-desktop-product-photo-frame');
    const finalizeOpen = Boolean(photoFrame && photoFrame.classList.contains('is-sale-finalize-open'));
    const clientIdentificationOpen = Boolean(photoFrame && photoFrame.classList.contains('is-client-identification-open'));
    const crediarioOpen = document.body.classList.contains('scf-crediario-open');
    const fiscalForegroundOpen = finalizeOpen || clientIdentificationOpen || crediarioOpen;

    /*
     * F5 CREDIÁRIO:
     * prepara a mesma venda usada pelo F1, mas sinaliza ao fluxo de
     * FINALIZAR que o card direito deverá abrir o formulário de crediário
     * em vez das quatro formas de pagamento.
     */
    /*
     * F11 | MOVIMENTAÇÃO:
     * enquanto o caixa estiver aberto pelo atalho de movimentação,
     * F5 | CREDIÁRIO fica indisponível. O bloqueio é funcional,
     * portanto nenhuma tela do crediário pode abrir por trás do caixa.
     */
    if(
      key === 'F5' &&
      document.body.classList.contains('scf-caixa-open') &&
      !document.body.classList.contains('scf-caixa-abertura-obrigatoria')
    ){
      event.preventDefault();
      event.stopPropagation();
      if(typeof event.stopImmediatePropagation === 'function'){
        event.stopImmediatePropagation();
      }
      return;
    }

    if(key === 'F5'){
      /*
       * F5 funciona como alternância quando a LISTA DO CREDIÁRIO
       * estiver aberta:
       *
       *   F5 sem produtos -> abre CLIENTE | WHATSAPP | SITUAÇÃO
       *   F5 novamente    -> fecha a lista e volta ao PDV normal
       *
       * Essa verificação precisa ocorrer ANTES de fiscalForegroundOpen,
       * pois a lista não é uma venda em pagamento.
       */
      if(
        document.body.classList.contains(
          'scf-crediario-list-open'
        )
      ){
        event.preventDefault();
        event.stopPropagation();

        if(
          typeof event.stopImmediatePropagation ===
            'function'
        ){
          event.stopImmediatePropagation();
        }

        if(
          typeof window.scfFecharListaCrediario ===
            'function'
        ){
          try{
            window.scfFecharListaCrediario();
          }catch(error){
            console.error(
              'Não foi possível fechar a lista do CREDIÁRIO:',
              error
            );
          }
        }else{
          document.body.classList.remove(
            'scf-crediario-list-open',
            'scf-crediario-detail-open',
            'scf-crediario-open'
          );
        }

        /*
         * Volta imediatamente ao desenho normal do PDV.
         * Como neste cenário não existem produtos ativos, a tabela
         * padrão volta vazia e pronta para uma nova leitura.
         */
        try{
          renderAddedProducts();
        }catch(error){}

        try{
          setProductsView(false);
        }catch(error){}

        try{
          updateProductControls();
        }catch(error){}

        try{
          updateTotal();
        }catch(error){}

        const barcode =
          $('productBarcode');

        if(barcode){
          try{
            barcode.focus({
              preventScroll:true
            });
          }catch(error){
            try{
              barcode.focus();
            }catch(ignore){}
          }
        }

        syncCentralSaleButtonState();

        return;
      }

      if(fiscalForegroundOpen) return;

      event.preventDefault();
      event.stopPropagation();

      if(
        typeof event.stopImmediatePropagation ===
          'function'
      ){
        event.stopImmediatePropagation();
      }

      if(target && typeof target.blur === 'function'){
        try{ target.blur(); }catch(error){}
      }

      /*
       * OFFLINE EMBUTIDO:
       * - sem produto: F5 continua abrindo a lista de crediários;
       * - com produto: NÃO desvia para a lista. Deixa o fluxo comum abaixo
       *   preparar a venda e abrir o card VENDAS NO CREDIÁRIO habilitado.
       *
       * Isso permite criar um novo crediário para um cliente cadastrado que
       * ainda não possui conta aberta na lista offline.
       */
      const embeddedOffline =
        document.documentElement &&
        document.documentElement.getAttribute('data-scf-embedded') === '1';

      const embeddedOfflineHasProduct =
        activeAddedProducts().length > 0 ||
        currentProductHasAnyValue();

      if(
        embeddedOffline &&
        !embeddedOfflineHasProduct
      ){
        if(
          typeof window.scfAbrirListaCrediario ===
            'function'
        ){
          window.scfAbrirListaCrediario();
        }else{
          toast(
            'A lista offline do crediário ainda está carregando.'
          );
        }

        return;
      }

      /*
       * NOVO CREDIÁRIO:
       * - F5 com produtos: abre o formulário para CRIAR conta a receber;
       * - F5 sem produtos: abre a LISTA dos crediários em aberto.
       */
      const produtosAtivosCrediario =
        activeAddedProducts();

      const existeProdutoParaCrediario =
        produtosAtivosCrediario.length >
          0 ||
        currentProductHasAnyValue();

      if(
        !existeProdutoParaCrediario
      ){
        if(
          typeof window.scfAbrirListaCrediario ===
            'function'
        ){
          window.scfAbrirListaCrediario();
        }else{
          toast(
            'A lista do crediário ainda está carregando.'
          );
        }

        return;
      }

      window.__scfCrediarioOpening =
        true;

      finalizeSale();

      /*
       * Se finalizeSale() não conseguiu avançar (produto incompleto etc.),
       * o evento scf:finalizar-venda não consumiu a flag.
       */
      if(
        window.__scfCrediarioOpening ===
          true
      ){
        window.__scfCrediarioOpening =
          false;
      }

      return;
    }

    /*
     * CREDIÁRIO ABERTO — PAGAMENTO EM DUAS ETAPAS:
     *
     * 1. O botão PAGAR apenas abre os produtos e o formulário
     *    VENDA NO CREDIÁRIO preenchido com o cliente.
     * 2. Somente F1 libera PIX / DÉBITO / CRÉDITO / DINHEIRO.
     *
     * Esta condição vem antes do bloqueio fiscalForegroundOpen porque
     * o formulário do crediário é propositalmente um card em primeiro plano.
     */
    if(
      key === 'F1' &&
      document.body.classList.contains(
        'scf-crediario-detail-open'
      ) &&
      window.__scfCrediarioPagamentoAguardandoF1 ===
        true
    ){
      event.preventDefault();
      event.stopPropagation();

      if(
        typeof event.stopImmediatePropagation ===
          'function'
      ){
        event.stopImmediatePropagation();
      }

      if(target && typeof target.blur === 'function'){
        try{ target.blur(); }catch(error){}
      }

      if(
        typeof window.scfFinalizarPagamentoCrediarioSelecionado ===
          'function'
      ){
        window.scfFinalizarPagamentoCrediarioSelecionado();
      }

      return;
    }

    /* F1 é exatamente a mesma chamada disparada pelo botão FINALIZAR. */
    if(key === 'F1'){
      if(fiscalForegroundOpen) return;
      event.preventDefault();
      event.stopPropagation();
      if(target && typeof target.blur === 'function'){
        try{ target.blur(); }catch(error){}
      }
      finalizeSale();
      return;
    }

    /*
     * CREDIÁRIO / DETALHE APÓS PAGAR:
     * embora o card do crediário esteja aberto à direita, a lista de produtos
     * continua sendo uma venda operacional editável. Nesse estado específico
     * liberamos o mesmo motor do PDV normal para:
     *   - ArrowUp / ArrowDown navegar entre os itens;
     *   - F2 armar o cancelamento do item selecionado;
     *   - ENTER editar/confirmar conforme o fluxo normal.
     *
     * Quando TOTAL/PARCIAL ou outro subcard de pagamento estiver aberto,
     * o bloqueio de primeiro plano continua valendo normalmente.
     */
    const crediarioDetalheOperacionalAberto =
      document.body.classList.contains(
        'scf-crediario-detail-open'
      ) &&
      window.__scfCrediarioPagamentoAguardandoF1 ===
        true &&
      !document.body.classList.contains(
        'scf-crediario-payment-choice-open'
      ) &&
      !document.body.classList.contains(
        'scf-crediario-partial-select-open'
      );

    /* Durante pagamento/subcard, não movimenta itens por trás da tela. */
    if(
      fiscalForegroundOpen &&
      !crediarioDetalheOperacionalAberto
    ) return;

    /*
     * ENTER após navegar com ↑ / ↓ abre exatamente a linha destacada para
     * edição. Este tratamento acontece na captura, antes do ENTER normal
     * de QTD/CÓDIGO, para não tentar incluir um produto vazio.
     */
    if(editSelectedProductFromSaleInput){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      loadAddedProductForQuantityEdit(keyboardProductIndex);
      return;
    }

    const list = $('fiscalProductsList');

    /*
     * Sem produtos adicionados não existe linha para navegar.
     * Mesmo assim, quando o foco estiver em QTD, bloqueia o comportamento
     * nativo do input number (step 0.001), evitando 0.999 / 1.001 etc.
     * No CÓDIGO DE BARRAS as setas também ficam neutras até existir lista.
     */
    if(!list || !addedProducts.length){
      if(listNavigationFromSaleInput){
        event.preventDefault();
        event.stopPropagation();
        if(typeof event.stopImmediatePropagation === 'function'){
          event.stopImmediatePropagation();
        }
      }
      return;
    }

    /*
     * As setas navegam sem retirar o foco de QTD/CÓDIGO DE BARRAS.
     * Assim o operador pode consultar itens e continuar pronto para digitar
     * a quantidade ou passar o próximo produto no scanner.
     *
     * F2 continua retirando o foco porque abre o fluxo de cancelamento.
     */
    if(cancelShortcutFromSaleInput){
      if(target && typeof target.blur === 'function'){
        try{ target.blur(); }catch(error){}
      }
    }

    // Tecla 1: seleciona diretamente o primeiro item da venda.
    if(key === '1'){
      event.preventDefault();
      event.stopPropagation();
      selectKeyboardProduct(0, { scroll: true, behavior: 'smooth' });
      keyboardProductEditSelectionReady = true;
      return;
    }

    if(key === 'ArrowDown'){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const focoOperacional =
        (
          targetId === 'productBarcode' ||
          targetId === 'productQuantity'
        )
          ? targetId
          : '';

      const next = keyboardProductIndex < 0
        ? 0
        : Math.min(keyboardProductIndex + 1, addedProducts.length - 1);

      resetKeyboardCancelButtons(-1);
      selectKeyboardProduct(next, { scroll: true, behavior: 'smooth' });
      keyboardProductEditSelectionReady = true;

      restoreProductOperationalFocus(
        focoOperacional
      );

      return;
    }

    if(key === 'ArrowUp'){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const focoOperacional =
        (
          targetId === 'productBarcode' ||
          targetId === 'productQuantity'
        )
          ? targetId
          : '';

      const previous = keyboardProductIndex < 0
        ? addedProducts.length - 1
        : Math.max(keyboardProductIndex - 1, 0);

      resetKeyboardCancelButtons(-1);
      selectKeyboardProduct(previous, { scroll: true, behavior: 'smooth' });
      keyboardProductEditSelectionReady = true;

      restoreProductOperationalFocus(
        focoOperacional
      );

      return;
    }

    if(key === 'F2'){
      event.preventDefault();
      event.stopPropagation();
      if(keyboardProductIndex < 0){
        keyboardProductIndex = addedProducts.length - 1;
        updateKeyboardProductHighlight();
      }
      armKeyboardProductCancel(keyboardProductIndex);
      return;
    }

    if(key === 'Enter' && keyboardProductIndex >= 0 && keyboardProductCancelIndex === keyboardProductIndex){
      event.preventDefault();
      event.stopPropagation();
      const cancelado =
        confirmProductCancelFromCard();

      if(cancelado){
        confirmarPersistenciaCancelamentoCrediarioViaEnter();
      }

      return;
    }
  }

  function renderAddedProducts(){
    const list = $('fiscalProductsList');
    if(!list) return;

    /*
     * PAGAMENTO PARCIAL DO CREDIÁRIO NÃO É CANCELAMENTO DE ITEM.
     *
     * O estado de cancelamento usa a classe is-product-cancel-open.
     * Quando ela fica armada, o módulo original do cabeçalho entende que
     * QTD / CÓDIGO DE BARRAS devem sair do topo.
     *
     * Aqui limpamos SOMENTE esse estado interno antes de desenhar os
     * booleanos. Não movemos elementos do DOM, não tocamos no host do F4
     * e não alteramos a pesquisa de produtos.
     */
    if(
      window.__scfCrediarioPagamentoParcialSelecaoAtiva ===
        true
    ){
      keyboardProductCancelIndex =
        -1;

      cancelCardOpenIndex =
        -1;

      keyboardProductEditSelectionReady =
        false;

      try{
        hideProductCancelCard({
          clear:false
        });
      }catch(error){}
    }

    list.textContent = '';

    /*
     * A busca F4 usa #productName como campo visual de pesquisa. Depois do
     * primeiro ENTER esse campo precisa voltar a ficar vazio/F4, sem perder
     * o produto que ainda está aguardando confirmação. Por isso a consulta
     * pode fornecer um PREVIEW externo, separado do valor visual do campo.
     */
    const consultaPreview =
      window.__scfPdvProdutoConsultaPreview &&
      typeof window.__scfPdvProdutoConsultaPreview === 'object'
        ? window.__scfPdvProdutoConsultaPreview
        : null;

    let currentPreview = currentProductData();

    if(consultaPreview){
      const quantidadeAtual = Number($('productQuantity').value || 0);
      const valorAtual = parseMoney($('productUnitValue').value);

      currentPreview = {
        ...consultaPreview,
        quantity: quantidadeAtual > 0
          ? quantidadeAtual
          : Number(consultaPreview.quantity || 0),
        unit: String($('productUnit').value || consultaPreview.unit || '').trim().toUpperCase(),
        unitValue: valorAtual > 0
          ? valorAtual
          : Number(consultaPreview.unitValue || 0),
        barcode: String($('productBarcode').value || consultaPreview.barcode || '').trim(),
        gtin: String($('productGtin').value || $('productBarcode').value || consultaPreview.gtin || '').trim()
      };

      currentPreview.total =
        Number(currentPreview.quantity || 0) *
        Number(currentPreview.unitValue || 0);
    }

    const hasPreview =
      activeProductIndex < 0 &&
      productIsComplete(currentPreview);

    const resetOtherCancelButtons = (exceptButton) => {
      list.querySelectorAll('.fiscal-danfe-status-button.is-cancel').forEach((button) => {
        if(button === exceptButton) return;
        button.classList.remove('is-cancel');
        button.textContent = 'INCLUIDO';
        button.setAttribute('aria-label', 'Preparar cancelamento do item incluído');
      });
      if(!exceptButton){
        keyboardProductCancelIndex = -1;
        hideProductCancelCard();
      }else{
        syncProductCancelCard();
      }
    };

    const appendProductRow = (item, index, options) => {
      const settings = options || {};
      const preview = settings.preview === true;
      const cancelled = !preview && item && item.cancelled === true;
      const productName = String(item.name || 'produto').trim() || 'produto';

      const itemWrap = document.createElement('div');
      itemWrap.className = 'fiscal-danfe-item-wrap' + (preview ? ' is-preview' : '') + (cancelled ? ' is-cancelled' : '');
      if(!preview){
        itemWrap.dataset.productIndex = String(index);
        if(index === keyboardProductIndex) itemWrap.classList.add('is-keyboard-active');
      }

      const row = document.createElement('div');
      row.className = 'fiscal-desktop-danfe-row' + (preview ? ' is-preview' : '');

      const itemCell = document.createElement('div');
      itemCell.className = 'fiscal-desktop-danfe-cell item';

      const selecaoParcialAtiva =
        !preview &&
        cancelled !== true &&
        window.__scfCrediarioPagamentoParcialSelecaoAtiva ===
          true;

      if(selecaoParcialAtiva){
        const booleano =
          document.createElement(
            'input'
          );

        booleano.type =
          'checkbox';

        booleano.className =
          'scf-crediario-item-pagamento-booleano';

        booleano.setAttribute(
          'aria-label',
          'Selecionar ' + productName + ' para pagamento parcial'
        );

        booleano.checked =
          typeof window.scfCrediarioItemPagamentoParcialSelecionado ===
            'function'
            ? window.scfCrediarioItemPagamentoParcialSelecionado(
                item,
                index
              )
            : false;

        booleano.addEventListener(
          'click',
          function(event){
            event.stopPropagation();
          }
        );

        booleano.addEventListener(
          'change',
          function(event){
            if(
              typeof window.scfCrediarioDefinirItemPagamentoParcial ===
                'function'
            ){
              window.scfCrediarioDefinirItemPagamentoParcial(
                item,
                index,
                event.target.checked === true
              );
            }
          }
        );

        itemCell.appendChild(
          booleano
        );
      }else{
        itemCell.textContent =
          String(index + 1).padStart(3, '0');
      }

      const descriptionCell = document.createElement('div');
      descriptionCell.className = 'fiscal-desktop-danfe-cell descricao';
      descriptionCell.textContent = productName;
      descriptionCell.title = productName;

      const quantityCell = document.createElement('div');
      quantityCell.className = 'fiscal-desktop-danfe-cell qtd';
      quantityCell.textContent = Number(item.quantity || 0).toLocaleString(
        'pt-BR',
        { maximumFractionDigits: 3 }
      );

      const unitCell = document.createElement('div');
      unitCell.className = 'fiscal-desktop-danfe-cell un';
      unitCell.textContent = String(item.unit || '').trim().toUpperCase();

      const unitValueCell = document.createElement('div');
      unitValueCell.className = 'fiscal-desktop-danfe-cell vl-unit';
      unitValueCell.textContent = money(item.unitValue);

      const statusCell = document.createElement('div');
      statusCell.className = 'fiscal-desktop-danfe-cell status';

      if(!preview){
        const statusButton = document.createElement('button');
        statusButton.type = 'button';
        statusButton.className = 'fiscal-danfe-status-button' + (cancelled ? ' is-cancelled' : '');
        statusButton.textContent = cancelled ? 'CANCELADO' : 'INCLUIDO';
        statusButton.setAttribute(
          'aria-label',
          cancelled
            ? 'Item ' + String(index + 1).padStart(3, '0') + ' cancelado'
            : 'Preparar cancelamento de ' + productName
        );

        if(
          cancelled ||
          selecaoParcialAtiva
        ){
          statusButton.disabled = true;
          statusButton.setAttribute('aria-disabled', 'true');
        }else{
          statusButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            selectKeyboardProduct(index, { scroll: false });

            if(statusButton.classList.contains('is-cancel')){
              showProductCancelCard(index, { focus:true, clear:false });
              return;
            }

            resetOtherCancelButtons(statusButton);
            resetKeyboardCancelButtons(index);
            statusButton.classList.add('is-cancel');
            statusButton.textContent = 'CANCELAR';
            statusButton.setAttribute('aria-label', 'Cancelar ' + productName);
            keyboardProductCancelIndex = index;
            showProductCancelCard(index, { focus:true, clear:true });
          });
        }

        statusCell.appendChild(statusButton);

        row.addEventListener('click', () => {
          if(
            window.__scfCrediarioPagamentoParcialSelecaoAtiva ===
              true
          ){
            const booleano =
              itemCell.querySelector(
                '.scf-crediario-item-pagamento-booleano'
              );

            if(booleano){
              booleano.checked =
                !booleano.checked;

              if(
                typeof window.scfCrediarioDefinirItemPagamentoParcial ===
                  'function'
              ){
                window.scfCrediarioDefinirItemPagamentoParcial(
                  item,
                  index,
                  booleano.checked === true
                );
              }
            }

            return;
          }

          selectKeyboardProduct(index, { scroll: false });
          keyboardProductEditSelectionReady = true;
        });
      }

      row.appendChild(itemCell);
      row.appendChild(quantityCell);
      row.appendChild(descriptionCell);
      row.appendChild(unitCell);
      row.appendChild(unitValueCell);
      row.appendChild(statusCell);

      itemWrap.appendChild(row);
      list.appendChild(itemWrap);
    };

    addedProducts.forEach((item, index) => {
      appendProductRow(item, index, { preview: false });
    });

    if(hasPreview){
      appendProductRow(currentPreview, addedProducts.length, { preview: true });
    }

    if(!addedProducts.length && !hasPreview){
      const empty = document.createElement('div');
      empty.className = 'fiscal-products-empty';
      empty.textContent = 'Nenhum produto adicionado.';
      list.appendChild(empty);
    }

    updateKeyboardProductHighlight();

    if(
      window.__scfCrediarioPagamentoParcialSelecaoAtiva ===
        true
    ){
      keyboardProductCancelIndex =
        -1;

      cancelCardOpenIndex =
        -1;

      try{
        hideProductCancelCard({
          clear:false
        });
      }catch(error){}
    }else{
      syncProductCancelCard();
    }

    if(scrollLastIncludedAfterRender && addedProducts.length){
      scrollLastIncludedAfterRender = false;
      const lastIndex = addedProducts.length - 1;
      keyboardProductIndex = lastIndex;
      updateKeyboardProductHighlight();
      requestAnimationFrame(() => {
        scrollProductIndexIntoView(lastIndex, 'smooth');
      });
    }

    const summary = $('fiscalProductsSummaryValue');
    if(summary){
      let totalResumo =
        addedProductsTotal();

      if(
        window.__scfCrediarioPagamentoParcialSelecaoAtiva ===
          true &&
        typeof window.scfCrediarioTotalPagamentoParcial ===
          'function'
      ){
        totalResumo =
          Number(
            window.scfCrediarioTotalPagamentoParcial()
          ) || 0;
      }

      summary.textContent =
        money(totalResumo);
    }
  }

  window.scfRenderizarProdutosPdv =
    renderAddedProducts;

  function setProductsView(open){
    const primary = $('fiscalPrimaryView');
    const products = $('fiscalProductsView');
    const button = $('deleteProductButton');
    const bottomActions = $('fiscalBottomActionsCard');
    if(!primary || !products) return;

    if(isDesktopThreePanel()){
      document.body.classList.remove('fiscal-products-view-open');
      renderAddedProducts();
      primary.hidden = false;
      products.hidden = false;
      if(bottomActions) bottomActions.hidden = false;
      if(button) button.setAttribute('aria-expanded', 'true');

      if(open && addedProducts.length){
        const lastIndex = addedProducts.length - 1;
        selectKeyboardProduct(lastIndex, { scroll: true, behavior: 'smooth' });
      }

      syncCentralSaleButtonState();
      return;
    }

    const productsOpen = Boolean(open);
    if(productsOpen) renderAddedProducts();

    document.body.classList.toggle('fiscal-products-view-open', productsOpen);

    if(productsOpen){
      primary.hidden = true;
      primary.style.setProperty('display', 'none', 'important');
      products.hidden = false;
      products.style.setProperty('display', 'flex', 'important');
    }else{
      primary.hidden = false;
      primary.style.removeProperty('display');
      products.hidden = true;
      products.style.removeProperty('display');
    }

    if(bottomActions) bottomActions.hidden = productsOpen;
    if(button) button.setAttribute('aria-expanded', productsOpen ? 'true' : 'false');

    const card = $('fiscalForm');
    if(card) card.scrollTo({ top: 0, behavior: 'auto' });

    syncCentralSaleButtonState();
  }

  function cancelProductAt(index){
    if(index < 0 || index >= addedProducts.length) return false;
    const item = addedProducts[index];
    if(!item || item.cancelled === true) return false;

    hideProductCancelCard();
    item.cancelled = true;
    item.cancelledAt = new Date().toISOString();
    activeProductIndex = -1;
    keyboardProductCancelIndex = -1;
    keyboardProductIndex = index;
    keyboardProductEditSelectionReady = false;

    renderAddedProducts();
    requestAnimationFrame(() => scrollProductIndexIntoView(index, 'smooth'));
    updateTotal();
    updateProductControls();
    syncCentralSaleButtonState();
    toast('Item cancelado.');
    return true;
  }

  function resetProductCancelButtonsState(){
    const buttons = document.querySelectorAll('#fiscalProductsList .fiscal-danfe-status-button.is-cancel');
    buttons.forEach((button) => {
      button.classList.remove('is-cancel');
      button.textContent = 'INCLUIDO';
      button.setAttribute('aria-label', 'Preparar cancelamento do item incluído');
    });
    keyboardProductCancelIndex = -1;
  }

  function productCancelCardIsOpen(){
    const frame = document.querySelector('#fiscalDesktopProductPhoto .fiscal-desktop-product-photo-frame');
    const card = $('fiscalProductCancelCard');

    return Boolean(
      frame &&
      card &&
      card.hidden !== true &&
      frame.classList.contains('is-product-cancel-open')
    );
  }

  function syncProductCancelConfirmButtonState(){
    const button = document.getElementById('scfCashMovementShortcut');
    const cancelOpen = productCancelCardIsOpen();
    const canConfirm = cancelOpen;

    if(!button){
      return canConfirm;
    }

    /*
     * CREDIÁRIO tem prioridade absoluta sobre o rótulo deste botão.
     * Não permitimos que a rotina antiga de CANCELAR ITEM restaure
     * F11 | MOVIMENTAÇÃO enquanto VENDA NO CREDIÁRIO estiver aberta.
     */
    if(
      document.body.classList.contains(
        'scf-crediario-open'
      )
    ){
      button.classList.remove(
        'scf-confirm-mode',
        'scf-close-mode',
        'scf-cash-back-mode',
        'scf-product-cancel-back-mode',
        'scf-product-cancel-confirm-mode'
      );

      button.classList.add(
        'scf-crediario-back-mode'
      );

      if(
        button.textContent !==
          'F7 | VOLTAR'
      ){
        button.textContent =
          'F7 | VOLTAR';
      }

      if(
        button.getAttribute(
          'aria-label'
        ) !==
          'F7 | Voltar do crediário'
      ){
        button.setAttribute(
          'aria-label',
          'F7 | Voltar do crediário'
        );
      }

      /*
       * No CREDIÁRIO o botão inferior continua reservado ao F7 | VOLTAR,
       * mas isso não pode impedir o ENTER de confirmar o cancelamento
       * já armado pelo F2. O retorno informa somente se existe um card
       * de cancelamento aberto; não altera o rótulo/ação visual do F7.
       */
      return canConfirm;
    }

    /*
     * PDV NORMAL COM VENDA EM ANDAMENTO:
     * F2 arma/desarma o cancelamento do item, porém NÃO reutiliza mais
     * o atalho inferior. Enquanto houver produto ativo, o botão permanece
     * visualmente como F11 | MOVIMENTAÇÃO e segue bloqueado/esmaecido.
     * A confirmação do cancelamento continua exclusivamente pelo ENTER.
     */
    const vendaNormalComProdutoAtivo =
      cancelOpen &&
      !document.body.classList.contains('scf-crediario-open') &&
      !document.body.classList.contains('scf-crediario-list-open') &&
      !document.body.classList.contains('scf-crediario-detail-open') &&
      addedProducts.some(
        (item) => item && item.cancelled !== true
      );

    if(vendaNormalComProdutoAtivo){
      button.classList.remove(
        'scf-product-cancel-back-mode',
        'scf-product-cancel-confirm-mode'
      );
      button.textContent = 'F11 | MOVIMENTAÇÃO';
      button.setAttribute(
        'aria-label',
        'F11 | Movimentação indisponível durante venda com produtos'
      );
      return canConfirm;
    }

    /* Nos demais fluxos, preserva o comportamento original do cancelamento. */
    button.classList.remove('scf-product-cancel-back-mode');
    button.classList.toggle('scf-product-cancel-confirm-mode', cancelOpen);

    if(cancelOpen){
      button.classList.remove('scf-confirm-mode', 'scf-close-mode');
      button.textContent = 'CANCELAR';
      button.setAttribute(
        'aria-label',
        'Confirmar cancelamento do item | ENTER'
      );
    }else if(
      !button.classList.contains('scf-confirm-mode') &&
      !button.classList.contains('scf-close-mode') &&
      !button.classList.contains('scf-cash-back-mode')
    ){
      button.textContent = 'F11 | MOVIMENTAÇÃO';
      button.setAttribute('aria-label', 'F11 | Movimentação do caixa');
    }

    return canConfirm;
  }

  function hideProductCancelCard(options){
    const frame = document.querySelector('#fiscalDesktopProductPhoto .fiscal-desktop-product-photo-frame');
    const card = $('fiscalProductCancelCard');

    if(frame) frame.classList.remove('is-product-cancel-open');
    if(card) card.hidden = true;
    cancelCardOpenIndex = -1;
    syncProductCancelConfirmButtonState();
  }

  function showProductCancelCard(index, options){
    if(typeof window.scfCloseFinalizePhotoPanel === 'function'){
      window.scfCloseFinalizePhotoPanel();
    }
    const settings = options || {};
    const frame = document.querySelector('#fiscalDesktopProductPhoto .fiscal-desktop-product-photo-frame');
    const card = $('fiscalProductCancelCard');
    const itemNumber = $('fiscalProductCancelItemNumber');
    const item = addedProducts[index];

    if(!frame || !card || !item || index < 0 || index >= addedProducts.length) return false;
    if(item.cancelled === true) return false;

    cancelCardOpenIndex = index;
    frame.classList.add('is-product-cancel-open');
    card.hidden = false;

    if(itemNumber){
      itemNumber.textContent = '"' + String(index + 1).padStart(3, '0') + '"';
    }

    syncProductCancelConfirmButtonState();

    /*
     * Sem campo de senha, o foco vai para o botão inferior CANCELAR.
     * ENTER confirma e F7 continua sendo a saída sem cancelamento.
     */
    if(settings.focus !== false){
      requestAnimationFrame(() => {
        const button = document.getElementById('scfCashMovementShortcut');
        if(!button) return;
        try{
          button.focus({ preventScroll:true });
        }catch(error){
          try{ button.focus(); }catch(innerError){}
        }
      });
    }
    return true;
  }

  function syncProductCancelCard(){
    if(
      keyboardProductCancelIndex >= 0 &&
      keyboardProductCancelIndex < addedProducts.length &&
      addedProducts[keyboardProductCancelIndex] &&
      addedProducts[keyboardProductCancelIndex].cancelled !== true
    ){
      showProductCancelCard(
        keyboardProductCancelIndex,
        { clear:false, focus:false }
      );
      return;
    }

    hideProductCancelCard({ clear:false });
  }

  function confirmProductCancelFromCard(){
    const canConfirm = syncProductCancelConfirmButtonState();

    if(cancelCardOpenIndex < 0 || cancelCardOpenIndex >= addedProducts.length){
      hideProductCancelCard();
      keyboardProductCancelIndex = -1;
      return false;
    }

    const item = addedProducts[cancelCardOpenIndex];
    if(!item || item.cancelled === true){
      hideProductCancelCard();
      keyboardProductCancelIndex = -1;
      return false;
    }

    if(!canConfirm){
      resetProductCancelButtonsState();
      hideProductCancelCard();
      return false;
    }

    const cancelIndex = cancelCardOpenIndex;
    keyboardProductCancelIndex = -1;
    hideProductCancelCard();

    const cancelado =
      cancelProductAt(cancelIndex);

    if(cancelado){
      restoreProductOperationalFocus('productBarcode');
    }

    return cancelado;
  }

  /*
   * CREDIÁRIO ABERTO — F2 + ENTER:
   *
   * confirmProductCancelFromCard() cancela o item no motor local do PDV.
   * No crediário aberto ainda existe uma segunda etapa: persistir a nova
   * composição através de SCF_CREDIARIO_ATUALIZAR_ITENS.
   *
   * Antes, o operador precisava clicar no botão CONFIRMAR depois do ENTER.
   * Esta rotina executa exatamente essa mesma confirmação automaticamente
   * quando o cancelamento veio do ENTER.
   */
  function confirmarPersistenciaCancelamentoCrediarioViaEnter(){
    const emCrediarioAberto =
      document.body.classList.contains(
        'scf-crediario-open'
      ) &&
      document.body.classList.contains(
        'scf-crediario-detail-open'
      ) &&
      window.__scfCrediarioPagamentoAguardandoF1 ===
        true;

    if(
      !emCrediarioAberto ||
      typeof window.scfFinalizarPagamentoCrediarioSelecionado !==
        'function'
    ){
      return false;
    }

    /*
     * Aguarda somente o próximo ciclo para renderAddedProducts/updateTotal
     * terminarem de refletir o item cancelado. A rotina chamada abaixo é a
     * MESMA usada pelo botão CONFIRMAR e envia a atualização ao backend.
     */
    window.setTimeout(
      function(){
        if(
          !document.body.classList.contains(
            'scf-crediario-open'
          ) ||
          !document.body.classList.contains(
            'scf-crediario-detail-open'
          ) ||
          window.__scfCrediarioPagamentoAguardandoF1 !==
            true
        ){
          return;
        }

        try{
          window.scfFinalizarPagamentoCrediarioSelecionado();
        }catch(error){
          console.error(
            'Não foi possível confirmar automaticamente o cancelamento do item do crediário:',
            error
          );
        }
      },
      0
    );

    return true;
  }

  function syncCurrentProductAutomatically(options){
    const item = currentProductData();
    renderAddedProducts();
    updateTotal();
    updateProductControls();
    return productIsComplete(item);
  }

  function confirmCurrentProductFromEnter(options){
    const settings =
      options &&
      typeof options === 'object'
        ? options
        : {};

    const confirmacaoViaF4 =
      settings.viaF4 === true;

    const barcode = digitsOnly($('productBarcode').value || '').slice(0, 14);
    const barcodeCompleto = [8, 12, 13, 14].includes(barcode.length);
    const itemAtual = currentProductData();
    const codigoInternoBalanca =
      pdvCodigoInternoBalancaValido(
        itemAtual.productCode
      );
    const leituraBalanca =
      codigoInternoBalanca
        ? leituraCodigoBalancaPdv()
        : null;
    const leituraBalancaCompleta =
      Boolean(
        leituraBalanca &&
        leituraBalanca.codigo ===
          digitsOnly(
            itemAtual.productCode
          ).slice(0,4) &&
        leituraBalanca.sufixo &&
        Number(
          leituraBalanca.sufixo
        ) > 0 &&
        itemAtual.unitValue > 0
      );

    if(
      !confirmacaoViaF4 &&
      !barcodeCompleto &&
      !leituraBalancaCompleta
    ){
      pendingProductEnterConfirmation = false;

      toast(
        codigoInternoBalanca
          ? 'Informe o valor da balança após o código interno.'
          : 'Digite ou leia um código de barras válido.'
      );

      return false;
    }

    if(productFiscalLookupPending){
      pendingProductEnterConfirmation = true;
      return false;
    }

    const item = currentProductData();
    if(!productIsComplete(item)){
      pendingProductEnterConfirmation = true;
      clearTimeout(productFiscalLookupTimer);
      solicitarProdutoFiscalDaVenda();
      return false;
    }

    pendingProductEnterConfirmation = false;

    const editingIndex = activeProductIndex;
    const updatingExisting =
      editingIndex >= 0 &&
      editingIndex < addedProducts.length &&
      addedProducts[editingIndex] &&
      addedProducts[editingIndex].cancelled !== true;

    if(updatingExisting){
      const previousItem = addedProducts[editingIndex];
      addedProducts[editingIndex] = {
        ...previousItem,
        ...item,
        cancelled: false
      };
      keyboardProductIndex = editingIndex;
      scrollLastIncludedAfterRender = false;
    }else{
      addedProducts.push({ ...item });
      keyboardProductIndex = addedProducts.length - 1;
      scrollLastIncludedAfterRender = true;
    }

    activeProductIndex = -1;
    keyboardProductCancelIndex = -1;
    keyboardProductEditSelectionReady = false;

    clearCurrentProduct({ focus: false, force: true });
    renderAddedProducts();
    updateTotal();
    updateProductControls();
    syncCentralSaleButtonState();

    /*
     * Depois de incluir ou atualizar:
     * - QTD volta para 1;
     * - CÓDIGO DE BARRAS fica vazio e com foco;
     * - o caixa já fica disponível para o próximo produto.
     */
    const barcodeInput = $('productBarcode');
    if(barcodeInput){
      try{
        barcodeInput.focus({ preventScroll: true });
      }catch(error){
        barcodeInput.focus();
      }
    }

    toast(updatingExisting ? 'Item atualizado.' : 'Item incluído.');
    return true;
  }

  /*
   * Hook exclusivo da consulta F4.
   * O F4 já validou/selecionou um produto cadastrado e preencheu os campos;
   * portanto não deve ser reinterpretado como leitura de balança só porque
   * seu código interno começa por 0001..0999.
   */
  window.__scfPdvConfirmarProdutoSelecionadoF4 =
    function(){
      return confirmCurrentProductFromEnter({
        viaF4:true
      });
    };

  function focusProductQuantityForEdit(definirQuantidadeUm){
    const quantityInput = $('productQuantity');
    if(!quantityInput) return false;

    /*
     * A QTD agora existe ANTES do código de barras.
     * Portanto nunca substituímos uma quantidade já informada pelo
     * operador. O valor 1 só é aplicado se o campo estiver vazio/zerado.
     */
    if(
      definirQuantidadeUm === true &&
      !(
        Number(
          quantityInput.value ||
          0
        ) > 0
      )
    ){
      quantityInput.value = '1';

      try{
        quantityInput.dispatchEvent(
          new Event(
            'input',
            {
              bubbles:true
            }
          )
        );
      }catch(error){}
    }

    window.requestAnimationFrame(function(){
      try{
        quantityInput.focus({ preventScroll: true });
      }catch(error){
        quantityInput.focus();
      }

      try{
        quantityInput.select();
      }catch(error){}
    });

    return true;
  }

  function focusAndSelectPdvTabField(element){
    if(!element) return false;

    try{
      element.focus({ preventScroll: true });
    }catch(error){
      element.focus();
    }

    try{
      element.select();
    }catch(error){}

    return true;
  }

  function handlePdvBarcodeQuantityTab(event){
    if(!event || event.key !== 'Tab') return;

    const barcodeInput = $('productBarcode');
    const quantityInput = $('productQuantity');
    const target = event.target;
    const targetId = target && target.id ? target.id : '';

    if(
      !barcodeInput ||
      !quantityInput
    ){
      return;
    }

    if(
      targetId !== 'productBarcode' &&
      targetId !== 'productQuantity'
    ){
      return;
    }

    /*
     * No PDV, TAB e SHIFT+TAB alternam somente
     * entre CÓDIGO DE BARRAS e QTD.
     */
    event.preventDefault();
    event.stopPropagation();

    if(targetId === 'productBarcode'){
      focusAndSelectPdvTabField(
        quantityInput
      );
      return;
    }

    focusAndSelectPdvTabField(
      barcodeInput
    );
  }

  function handleProductBarcodeEnter(event){
    if(!event || event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();

    /*
     * Código interno de balança:
     * reconhecer produto e calcular o valor durante a digitação é permitido,
     * mas adicionar o item à venda depende exclusivamente deste ENTER.
     */

    if(
      tentarProcessarLeituraBalancaPdv()
    ){
      pendingProductEnterConfirmation =
        true;

      if(productFiscalLookupPending){
        return;
      }

      const itemBalanca =
        currentProductData();

      if(
        pdvCodigoInternoBalancaValido(
          itemBalanca.productCode
        ) &&
        productIsComplete(
          itemBalanca
        )
      ){
        confirmCurrentProductFromEnter();
        return;
      }

      pendingProductEnterConfirmation =
        false;

      toast(
        'Informe o valor da balança após o código interno.'
      );

      return;
    }

    const barcode = digitsOnly($('productBarcode').value || '').slice(0, 14);
    if(![8, 12, 13, 14].includes(barcode.length)){
      pendingProductEnterConfirmation = false;
      toast('Digite ou leia um código de barras válido.');
      return;
    }

    /*
     * FLUXO DE CAIXA DE SUPERMERCADO:
     * o ENTER final enviado pelo leitor confirma a inclusão do item.
     * Se a consulta fiscal ainda estiver em andamento, guardamos essa
     * confirmação e incluímos automaticamente assim que a resposta chegar.
     */
    pendingProductEnterConfirmation = true;

    if(productFiscalLookupPending){
      return;
    }

    if(productIsComplete(currentProductData())){
      confirmCurrentProductFromEnter();
      return;
    }

    clearTimeout(productFiscalLookupTimer);
    solicitarProdutoFiscalDaVenda();
  }

  function handleProductQuantityEnter(event){
    if(!event || event.key !== 'Enter') return;

    /*
     * A consulta F4 já possui seu próprio segundo ENTER na QTD.
     * Quando houver PREVIEW do F4, deixa o evento seguir para o
     * controlador específico da pesquisa, sem duplicar a inclusão.
     */
    if(
      window.__scfPdvProdutoConsultaPreview &&
      typeof window.__scfPdvProdutoConsultaPreview === 'object'
    ){
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if(productFiscalLookupPending){
      toast('Aguarde a consulta do produto cadastrado.');
      return;
    }

    const item = currentProductData();

    if(!productIsComplete(item)){
      const barcode = digitsOnly($('productBarcode').value || '').slice(0, 14);

      if([8, 12, 13, 14].includes(barcode.length) && !item.productFiscalId){
        clearTimeout(productFiscalLookupTimer);
        solicitarProdutoFiscalDaVenda();
        return;
      }

      if(!(Number(item.quantity) > 0)){
        toast('Informe uma quantidade válida.');
        focusProductQuantityForEdit(
          false
        );
        return;
      }

      /*
       * A QTD pode ser preparada ANTES do produto.
       * ENTER na QTD sem código apenas leva o operador para o campo
       * de código de barras; não existe produto incompleto nesse momento.
       */
      if(
        !String($('productBarcode').value || '').trim() &&
        !String($('productName').value || '').trim()
      ){
        const barcodeInput =
          $('productBarcode');

        if(barcodeInput){
          try{
            barcodeInput.focus({
              preventScroll:true
            });
          }catch(error){
            barcodeInput.focus();
          }

          try{
            barcodeInput.select();
          }catch(error){}
        }

        return;
      }

      toast('Complete os dados do produto antes de incluir.');
      return;
    }

    confirmCurrentProductFromEnter();
  }

  function finalizeSale(){
    syncCurrentProductAutomatically({ notify: false });

    if(currentProductHasAnyValue()){
      toast(productFiscalLookupPending ? 'Aguarde a consulta do produto cadastrado.' : 'Pressione ENTER na QTD para incluir o item atual.');
      return;
    }
    const productsToFinalize = activeAddedProducts();
    if(!productsToFinalize.length){
      toast('Adicione pelo menos um produto ativo.');
      return;
    }

    const sale = serializeForm();

    /*
     * PASSO 11L — cria o identificador estável da venda ANTES
     * de abrir FINALIZAR VENDA.
     *
     * Até aqui nenhuma venda foi paga ou enviada ao backend.
     * O objetivo é apenas permitir que o pré-check técnico da
     * NFC-e seja associado à mesma venda antes do pagamento.
     *
     * O listener scf:venda-paga já preserva saleId existente,
     * portanto este mesmo identificador será usado depois da
     * confirmação do pagamento.
     */
    if(!sale.saleId){
      try{
        sale.saleId =
          crypto.randomUUID();
      }catch(error){
        sale.saleId =
          'VENDA-' +
          Date.now() +
          '-' +
          Math.random()
            .toString(16)
            .slice(2);
      }
    }

    sale.products = productsToFinalize.map((item) => ({ ...item }));
    sale.cancelledProducts = addedProducts
      .filter((item) => item && item.cancelled === true)
      .map((item) => ({ ...item }));
    sale.totalValue = addedProductsTotal();
    /*
     * Abrir CREDIÁRIO ainda não é finalizar uma venda.
     * Não cria fotografia de venda fiscal no histórico local neste ponto.
     */
    if(
      window.__scfCrediarioOpening !==
        true
    ){
      try{
        const key = window.__scfPdvContracts.storage.local.keys.fiscalSales;
        const history = JSON.parse(window.__scfPdvInfra.storage.local.getItem(key) || '[]');
        history.push(sale);
        window.__scfPdvInfra.storage.local.setItem(key, JSON.stringify(history));
        window.__scfPdvInfra.storage.local.setItem(window.__scfPdvContracts.storage.local.keys.lastFinalizedSale, JSON.stringify(sale));
      }catch(e){}
    }

    const eventoFinalizarVenda =
      new CustomEvent(
        'scf:finalizar-venda',
        {
          detail:
            sale
        }
      );

    if (
      typeof window.scfAbrirCpfFiscalCard ===
      'function'
    ) {
      window.scfAbrirCpfFiscalCard(
        eventoFinalizarVenda
      );
    } else {
      /*
       * Fallback para carregamentos muito lentos:
       * o listener será usado quando o script do card
       * já estiver inicializado.
       */
      window.__scfPdvInfra.eventBus.dispatch(
        eventoFinalizarVenda
      );
    }
    toast('Venda ' + String($('saleNumber').value || '').padStart(5, '0') + ' finalizada.');
  }

  function setDefaultCfop(){
    const cfopSearch = $('cfopSearch');
    const cfopCode = $('cfopCode');
    const cfopSelected = $('cfopSelected');
    if(cfopSearch) cfopSearch.value = '5102';
    if(cfopCode) cfopCode.value = '5102';
    if(cfopSelected) cfopSelected.textContent = '';
  }

  function serializeForm(){
    setDefaultCfop();
    acceptManualCode('ncm');
    const form = $('fiscalForm');
    const data = Object.fromEntries(new FormData(form).entries());
    data.cfopLabel = $('cfopSearch').value;
    data.ncmLabel = $('ncmSearch').value;
    data.products = addedProducts.map((item) => ({ ...item }));
    data.currentProduct = currentProductData();
    data.total = $('productTotal').textContent;
    data.savedAt = new Date().toISOString();
    return data;
  }

  function restoreDraft(){

    try{

      const raw = window.__scfPdvInfra.storage.local.getItem(window.__scfPdvContracts.storage.local.keys.fiscalDraft);

      if(!raw) return;

      const data = JSON.parse(raw);

      Object.keys(data).forEach((key) => {

        const el = document.querySelector('[name="' + key + '"]');

        if(el && typeof data[key] === 'string') el.value = data[key];

      });

      if(!continuityCurrentProductSafe(data.currentProduct)){
        ['productBarcode','productGtin','productCode'].forEach((id) => {
          if($(id)) $(id).value = '';
        });
      }

      if(data.ncmLabel) $('ncmSearch').value = data.ncmLabel;

      setDefaultCfop();

      acceptManualCode('ncm');

      if(data.ncmLabel) productsDomain.setNcmOrigin('draft');

      updateTotal();

    }catch(e){}

  }



  function continuityCurrentProductSafe(item){
    return Boolean(
      item &&
      (
        String(item.productFiscalId || '').trim() ||
        String(item.name || '').trim() ||
        Number(item.unitValue || 0) > 0
      )
    );
  }

  function exportContinuityDraft(){

    const current = currentProductData();

    const paymentStageKind =
      document.body &&
      document.body.classList.contains('sale-validation-waiting-open')
        ? 'VALIDATION'
        : document.body &&
          document.body.classList.contains('cpf-fiscal-card-open')
          ? 'CPF'
          : document.body &&
            document.body.classList.contains('finalize-support-card-open')
            ? 'FINALIZE'
            : '';

    let saleId = '';

    if(paymentStageKind){
      try{
        const lastSale = JSON.parse(
          window.__scfPdvInfra.storage.local.getItem(window.__scfPdvContracts.storage.local.keys.lastFinalizedSale) || '{}'
        );

        if(lastSale && typeof lastSale === 'object'){
          saleId = String(lastSale.saleId || '').trim();
        }
      }catch(error){}
    }

    return {

      version: 1,

      saleNumber: String($('saleNumber')?.value || '').trim(),

      saleId,

      products: addedProducts.map((item) => ({ ...item })),

      currentProduct: currentProductHasAnyValue() && continuityCurrentProductSafe(current) ? { ...current } : null,

      totalValue: addedProductsTotal(),

      activeProducts: activeAddedProducts().length,

      paymentStageOpen: Boolean(paymentStageKind),

      paymentStageKind,

      capturedAt: new Date().toISOString()

    };

  }



  function restoreContinuityDraft(draft, onPaymentStageReady){

    const data = draft && typeof draft === 'object' ? draft : {};

    const operatorName =
      String(
        data.operatorName ||
        ''
      ).trim();

    if(operatorName){
      if(
        typeof window.scfAtualizarNomeOperador ===
          'function'
      ){
        window.scfAtualizarNomeOperador(
          operatorName
        );
      }else{
        const operatorNode =
          document.getElementById(
            'scfPdvOperatorName'
          );

        if(operatorNode){
          operatorNode.textContent =
            operatorName;
        }
      }
    }

    const products = Array.isArray(data.products)

      ? data.products.slice(0, 500).filter((item) => item && typeof item === 'object').map((item) => ({ ...item }))

      : [];



    addedProducts.splice(0, addedProducts.length, ...products);

    activeProductIndex = -1;

    keyboardProductIndex = products.length ? products.length - 1 : -1;

    keyboardProductCancelIndex = -1;

    keyboardProductEditSelectionReady = false;

    pendingProductEnterConfirmation = false;

    productFiscalLookupPending = false;



    clearCurrentProduct({ focus:false, force:true });



    const current =
      continuityCurrentProductSafe(
        data.currentProduct
      )
        ? data.currentProduct
        : null;



    if(current){

      $('productName').value = String(current.name || '').trim();

      $('productQuantity').value = String(Number(current.quantity || 1));

      $('productUnit').value = String(current.unit || '').trim().toUpperCase();

      $('productUnitValue').value = Number(current.unitValue || 0) > 0 ? money(Number(current.unitValue || 0)) : '';

      $('productBarcode').value = String(current.barcode || current.gtin || '').trim();

      $('productFiscalId').value = String(current.productFiscalId || '').trim();

      $('productCode').value = String(current.productCode || '').trim();

      $('productGtin').value = String(current.gtin || current.barcode || '').trim();

      currentProductImageUrl = String(current.imageUrl || '').trim();

      if(current.ncm){

        $('ncmSearch').value = digitsOnly(current.ncm).slice(0, 8);

        $('ncmCode').value = digitsOnly(current.ncm).slice(0, 8);

      }

      if(current.cfop){

        $('cfopSearch').value = digitsOnly(current.cfop).slice(0, 4);

        $('cfopCode').value = digitsOnly(current.cfop).slice(0, 4);

      }

    }



    if(data.saleNumber && $('saleNumber')){

      $('saleNumber').value = String(data.saleNumber).slice(0, 20);

    }



    renderAddedProducts();

    updateProductControls();

    updateTotal();

    updateDesktopProductPhotoFromCurrent();

    setProductsView(false);

    if(products.length > 0){
      setMenuNewSaleIdleLock(false);
    }

    syncCentralSaleButtonState();



    const restorePaymentStage =
      data.paymentStageOpen === true;

    const paymentStageKind =
      String(
        data.paymentStageKind ||
        (
          restorePaymentStage
            ? 'FINALIZE'
            : ''
        )
      )
        .trim()
        .toUpperCase();

    if(
      restorePaymentStage &&
      paymentStageKind ===
        'VALIDATION'
    ){
      toast(
        'Venda preservada após queda durante a validação. Consulte o histórico antes de finalizar novamente.'
      );

      return exportContinuityDraft();
    }

    if(restorePaymentStage){
      window.setTimeout(
        function(){
          const sale =
            serializeForm();

          const recoveredSaleId =
            String(
              data.saleId ||
              ''
            ).trim();

          if(recoveredSaleId){
            sale.saleId =
              recoveredSaleId;
          }else if(!sale.saleId){
            try{
              sale.saleId =
                crypto.randomUUID();
            }catch(error){
              sale.saleId =
                'VENDA-' +
                Date.now() +
                '-' +
                Math.random()
                  .toString(16)
                  .slice(2);
            }
          }

          sale.products =
            activeAddedProducts()
              .map(
                function(item){
                  return {
                    ...item
                  };
                }
              );

          sale.cancelledProducts =
            addedProducts
              .filter(
                function(item){
                  return (
                    item &&
                    item.cancelled ===
                      true
                  );
                }
              )
              .map(
                function(item){
                  return {
                    ...item
                  };
                }
              );

          sale.totalValue =
            addedProductsTotal();

          try{
            window.__scfPdvInfra.storage.local.setItem(
              window.__scfPdvContracts.storage.local.keys.lastFinalizedSale,
              JSON.stringify(sale)
            );
          }catch(error){}

          const event =
            new CustomEvent(
              'scf:finalizar-venda',
              {
                detail:
                  sale
              }
            );

          if(
            typeof window.scfAbrirCpfFiscalCard ===
              'function'
          ){
            window.scfAbrirCpfFiscalCard(
              event
            );
          }else{
            window.__scfPdvInfra.eventBus.dispatch(
              event
            );
          }

          if(
            typeof onPaymentStageReady ===
              'function'
          ){
            onPaymentStageReady(
              paymentStageKind
            );
          }
        },
        0
      );
    }else{
      const barcodeInput =
        $('productBarcode');

      if(barcodeInput){
        try{
          barcodeInput.focus({
            preventScroll:true
          });
        }catch(error){
          barcodeInput.focus();
        }
      }
    }



    if(products.length || current){
      toast(
        restorePaymentStage
          ? 'Venda recuperada no modo offline. A finalização foi reaberta.'
          : 'Venda em andamento recuperada após a queda da conexão.'
      );
    }



    return exportContinuityDraft();

  }

  function hasActiveContinuitySale(){
    return Boolean(
      activeAddedProducts().length > 0 ||
      currentProductHasAnyValue() ||
      (
        document.body &&
        (
          document.body.classList.contains(
            'finalize-support-card-open'
          ) ||
          document.body.classList.contains(
            'cpf-fiscal-card-open'
          ) ||
          document.body.classList.contains(
            'sale-validation-waiting-open'
          )
        )
      )
    );
  }

  continuityDomain.registerSalePort(
    Object.freeze({
      exportDraft:
        exportContinuityDraft,
      restoreDraft:
        restoreContinuityDraft,
      hasActiveSale:
        hasActiveContinuitySale
    })
  );



  function gerarNovoNumeroVenda(){
    let numero;

    try{
      const valores =
        new Uint32Array(
          1
        );

      crypto.getRandomValues(
        valores
      );

      numero =
        valores[0] %
        100000;
    }catch(error){
      numero =
        Math.floor(
          Math.random() *
          100000
        );
    }

    const numeroFormatado =
      String(
        numero
      ).padStart(
        5,
        '0'
      );

    const numeroOculto =
      $('saleNumber');

    const tituloVenda =
      $('fiscalSaleTitle');

    if(numeroOculto){
      numeroOculto.value =
        numeroFormatado;
    }

    if(tituloVenda){
      const proximoNumeroFiscal =
        Number(
          window
            .scfProximoNumeroNfceProducao
        );

      tituloVenda.textContent =
        Number.isInteger(
          proximoNumeroFiscal
        ) &&
        proximoNumeroFiscal >
          0
          ? 'NFC-e ' +
            String(
              proximoNumeroFiscal
            ).padStart(
              5,
              '0'
            )
          : 'NFC-e 00000';
    }
  }

  function limparVendaConcluida(){
    const form =
      $('fiscalForm');

    if(form){
      form.reset();
    }

    addedProducts.splice(
      0,
      addedProducts.length
    );

    activeProductIndex =
      -1;

    pendingProductEnterConfirmation = false;
    currentProductImageUrl = '';
    updateDesktopProductPhotoFromCurrent();
    resetDesktopProductScannerView();

    productsDomain.cancelNcmLookup();
    productsDomain.setNcmOrigin('');

    const ncmSearch =
      $('ncmSearch');

    const ncmCode =
      $('ncmCode');

    const ncmSelected =
      $('ncmSelected');

    const productBarcode =
      $('productBarcode');

    if(ncmSearch){
      ncmSearch.value =
        '';
    }

    if(ncmCode){
      ncmCode.value =
        '';
    }

    if(ncmSelected){
      ncmSelected.textContent =
        '';
    }

    if(productBarcode){
      productBarcode.value =
        '';
    }

    clearProductFiscalMatch();
    productFiscalLookupRequestId += 1;
    clearTimeout(productFiscalLookupTimer);

    closeResults(
      'ncm'
    );

    setDefaultCfop();

    renderAddedProducts();

    updateProductControls();

    updateTotal();

    setProductsView(
      false
    );

    resetFiscalScannerForNewSale();

    try{
      window.__scfPdvInfra.storage.local.removeItem(
        window.__scfPdvContracts.storage.local.keys.fiscalDraft
      );

      /*
       * Remove apenas o ponteiro visual da última
       * venda. O histórico local e o CMS permanecem.
       */
      window.__scfPdvInfra.storage.local.removeItem(
        window.__scfPdvContracts.storage.local.keys.lastFinalizedSale
      );
    }catch(error){}

    gerarNovoNumeroVenda();

    showMainFiscalCard();

    /*
     * Nova venda após fechar o cupom:
     * devolve imediatamente o cursor ao CÓDIGO DE BARRAS.
     * A restauração adicional abaixo cobre qualquer remoção assíncrona
     * de inert/classes feita pelos módulos visuais do PDV.
     */
    if(productBarcode){
      try{
        productBarcode.focus({
          preventScroll:
            true
        });
      }catch(error){
        try{
          productBarcode.focus();
        }catch(innerError){}
      }
    }

    window.__scfPdvInfra.eventBus.dispatch(
      new CustomEvent(
        'scf:nova-venda-pronta'
      )
    );
  }

  window.__scfPdvInfra.eventBus.on('scf:limpar-venda-concluida',
    limparVendaConcluida
  );

  window.__scfPdvInfra.shellBridge.onMessage( function(event){
    const data = event && event.data && typeof event.data === 'object'
      ? event.data
      : null;

    if(!data) return;

    const menuFrame = document.getElementById('__htmlStatusIframe');
    if(menuFrame && menuFrame.contentWindow && event.source !== menuFrame.contentWindow){
      return;
    }

    if(data.type === 'SCF_FISCAL_PRODUTOS_VOLTAR_SOLICITAR'){
      setProductsView(false);
      return;
    }

    if(data.type === 'SCF_FISCAL_FINALIZAR_SOLICITAR'){
      finalizeSale();
    }
  });

  function updateTotal(){
    let totalAtual =
      addedProductsTotal();

    if(
      window.__scfCrediarioPagamentoParcialSelecaoAtiva ===
        true &&
      typeof window.scfCrediarioTotalPagamentoParcial ===
        'function'
    ){
      const totalSelecionado =
        Number(
          window.scfCrediarioTotalPagamentoParcial()
        );

      totalAtual =
        Number.isFinite(totalSelecionado)
          ? totalSelecionado
          : 0;
    }

    const totalText = money(totalAtual);
    $('productTotal').textContent = totalText;
    const headerTotal = $('fiscalHeaderTotal');
    if(headerTotal) headerTotal.textContent = totalText;

    if(
      typeof window.scfAtualizarBotaoPrincipalCrediario ===
        'function'
    ){
      window.scfAtualizarBotaoPrincipalCrediario();
    }
  }

  function scfProdutoCrediarioParaPdv(item,index){
    const quantity = Number(item?.quantity || 0);
    const unitValue = Number(item?.unitValue || 0);

    return {
      name: String(item?.description || item?.name || 'PRODUTO').trim(),
      quantity,
      unit: String(item?.unit || 'UN').trim().toUpperCase(),
      unitValue,
      total: Number(item?.totalValue || item?.total || (quantity * unitValue)),
      productFiscalId: String(item?.produtoId || item?.productFiscalId || '').trim(),
      productCode: String(item?.productCode || item?.codigoProduto || '').trim(),
      gtin: String(item?.productCode || item?.gtin || '').trim(),
      barcode: String(item?.productCode || item?.barcode || '').trim(),
      scaleInternalCode: '',
      scaleValue: 0,
      imageUrl: '',
      ncm: String(item?.ncm || '').trim(),
      cest: String(item?.cest || '').trim(),
      cfop: String(item?.cfop || '').trim(),
      taxCode: String(item?.taxCode || '').trim(),
      tributosReferenciaJson: item?.tributosReferenciaJson || '',
      crediarioItemId: String(item?.crediarioItemId || item?.id || '').trim(),
      itemNumber: Number(item?.itemNumber) || index + 1,
      cancelled: false
    };
  }

  window.scfCarregarCrediarioAbertoNoPdv = function(detalhe){
    const dados = detalhe && typeof detalhe === 'object' ? detalhe : {};
    const conta = dados.conta && typeof dados.conta === 'object' ? dados.conta : {};
    const itens = Array.isArray(dados.itens) ? dados.itens : [];
    const crediarioId = String(conta.crediarioId || conta.saleId || '').trim();

    if(!crediarioId || itens.length === 0){
      return {
        ok:false,
        message:'O crediário não possui itens para edição.'
      };
    }

    addedProducts.splice(
      0,
      addedProducts.length,
      ...itens.map(scfProdutoCrediarioParaPdv)
    );

    activeProductIndex = -1;
    keyboardProductIndex = -1;
    keyboardProductCancelIndex = -1;
    keyboardProductEditSelectionReady = false;

    window.__scfCrediarioEdicaoPdvAtiva = { crediarioId };

    clearCurrentProduct({
      focus:false,
      force:true
    });

    renderAddedProducts();
    updateTotal();
    updateProductControls();
    syncCentralSaleButtonState();

    return {
      ok:true,
      total:addedProductsTotal(),
      quantidade:activeAddedProducts().length
    };
  };

  window.scfObterEdicaoCrediarioPdv = function(){
    const estado =
      window.__scfCrediarioEdicaoPdvAtiva &&
      typeof window.__scfCrediarioEdicaoPdvAtiva === 'object'
        ? window.__scfCrediarioEdicaoPdvAtiva
        : null;

    if(!estado){
      return {
        ok:false,
        crediarioId:'',
        produtos:[],
        total:0,
        quantidadeAtiva:0
      };
    }

    return {
      ok:true,
      crediarioId:String(estado.crediarioId || '').trim(),
      produtos:addedProducts.map(function(item,index){
        return {
          name:String(item?.name || '').trim(),
          quantity:Number(item?.quantity || 0),
          unit:String(item?.unit || 'UN').trim().toUpperCase(),
          unitValue:Number(item?.unitValue || 0),
          total:Number(item?.total || 0),
          productFiscalId:String(item?.productFiscalId || '').trim(),
          productCode:String(item?.productCode || item?.barcode || '').trim(),
          gtin:String(item?.gtin || item?.productCode || '').trim(),
          barcode:String(item?.barcode || item?.productCode || '').trim(),
          ncm:String(item?.ncm || '').trim(),
          cest:String(item?.cest || '').trim(),
          cfop:String(item?.cfop || '').trim(),
          taxCode:String(item?.taxCode || '').trim(),
          tributosReferenciaJson:item?.tributosReferenciaJson || '',
          crediarioItemId:String(item?.crediarioItemId || '').trim(),
          itemNumber:Number(item?.itemNumber) || index + 1,
          cancelled:item?.cancelled === true
        };
      }),
      total:addedProductsTotal(),
      quantidadeAtiva:activeAddedProducts().length
    };
  };

  window.scfLimparEdicaoCrediarioPdv = function(){
    if(!window.__scfCrediarioEdicaoPdvAtiva){
      return false;
    }

    window.__scfCrediarioEdicaoPdvAtiva = null;

    addedProducts.splice(0, addedProducts.length);
    activeProductIndex = -1;
    keyboardProductIndex = -1;
    keyboardProductCancelIndex = -1;
    keyboardProductEditSelectionReady = false;

    clearCurrentProduct({
      focus:false,
      force:true
    });

    renderAddedProducts();
    updateTotal();
    updateProductControls();
    syncCentralSaleButtonState();

    return true;
  };

  function clearCurrentProduct(options){
    const settings = options || {};
    resetDesktopProductScannerView();
    if(activeProductIndex >= 0 && !settings.force){
      toast('Este produto já foi adicionado. Use EXCLUIR.');
      return false;
    }

    $('productName').value = '';
    /*
     * Fluxo de supermercado: a próxima leitura já nasce com QTD = 1.
     * Se o operador precisar de mais unidades, altera a QTD antes de
     * ler/selecionar o próximo produto.
     */
    $('productQuantity').value = '1';
    $('productUnit').value = '';
    $('productUnit').placeholder = 'UN / CX';
    $('productUnitValue').value = '';
    $('productBarcode').value = '';
    $('productFiscalId').value = '';
    $('productCode').value = '';
    $('productGtin').value = '';

    productBarcodeClearedManually =
      false;

    limparEstadoBalancaPdv();

    productBarcodeClearGeneration +=
      1;
    currentProductImageUrl = '';
    updateDesktopProductPhotoFromCurrent();
    productFiscalLookupPending = false;
    pendingProductEnterConfirmation = false;
    productFiscalLookupRequestId += 1;
    clearTimeout(productFiscalLookupTimer);
    renderAddedProducts();
    updateTotal();
    updateProductControls();
    if(settings.focus !== false) $('productQuantity').focus();
    return true;
  }

  function mountFiscalScanner(){
    const trigger = $('barcodeScanTrigger');
    const mount = $('fiscalScannerMount');
    if(trigger && mount && trigger.parentElement !== mount){
      mount.appendChild(trigger);
    }
  }

  function setFiscalScannerForSale(active){
    const classification = $('fiscalClassificationSection');
    const scannerSection = $('fiscalScannerSection');

    fiscalScannerActivatedForSale = Boolean(active);

    if(classification){
      classification.hidden = fiscalScannerActivatedForSale;
    }

    if(scannerSection){
      scannerSection.hidden = !fiscalScannerActivatedForSale;
    }

    const scannerButton = $('addProductButton');
    if(scannerButton){
      scannerButton.setAttribute(
        'aria-expanded',
        fiscalScannerActivatedForSale ? 'true' : 'false'
      );
    }

    updateProductControls();
  }

  function openFiscalScanner(){
    mountFiscalScanner();
    setFiscalScannerForSale(true);

    const openScanner = window.scfBarcodeScannerOpen;
    if(typeof openScanner === 'function'){
      openScanner();
      return;
    }

    const trigger = $('barcodeScanTrigger');
    if(trigger){
      trigger.click();
    }
  }



  function handleScannerProduct(){
    /* Fluxo exclusivo do desktop: libera os campos e abre o scanner. */
    if(activeProductIndex >= 0){
      activeProductIndex = -1;
      clearCurrentProduct({ focus: false, force: true });
      toast('Campos liberados para um novo produto.');
    }

    resetDesktopProductScannerView();
    openFiscalScanner();
  }

  function resetFiscalScannerForNewSale(){
    resetDesktopProductScannerView();

    const stopScanner = window.scfBarcodeScannerStop;
    if(typeof stopScanner === 'function'){
      stopScanner();
    }

    setFiscalScannerForSale(false);
  }

  function prepareNextProduct(){
    if(activeProductIndex < 0){
      if(!syncCurrentProductAutomatically({ notify: false })){
        toast(productFiscalLookupPending ? 'Aguarde a consulta do produto cadastrado.' : 'Selecione um produto cadastrado e complete quantidade e valor unitário.');
        return;
      }
    }

    activeProductIndex = -1;
    clearCurrentProduct({ focus: true, force: true });
    toast('Campos liberados para um novo produto.');
  }

  function handleDeleteProduct(){
    if(!addedProducts.length) return;
    setProductsView(true);
  }

  function toast(message){
    const el = $('fiscalToast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function init(){
    setupCombo('ncm');
    setupProductNcmLookup();
    setupProductFiscalLookup();
    restoreDraft();

    /*
     * QTD padrão do PDV: fica pronta antes de qualquer leitura.
     * Não sobrescreve uma quantidade válida restaurada de estado anterior.
     */
    if(
      !(
        Number(
          $('productQuantity').value ||
          0
        ) > 0
      )
    ){
      $('productQuantity').value =
        '1';
    }

    setDefaultCfop();
    mountFiscalScanner();
    setFiscalScannerForSale(false);

    ['productName', 'productQuantity', 'productUnitValue', 'productBarcode'].forEach((id) => {
      $(id).addEventListener('input', () => {
        if(id === 'productQuantity') pendingProductEnterConfirmation = false;
        if(activeProductIndex < 0) keyboardProductEditSelectionReady = false;
        syncCurrentProductAutomatically();
        updateDesktopProductPhotoFromCurrent();
      });
      $(id).addEventListener('change', () => {
        syncCurrentProductAutomatically({ notify: false });
        updateDesktopProductPhotoFromCurrent();
      });
    });

    $('productBarcode').addEventListener(
      'keydown',
      handleProductBarcodeEnter
    );

    $('productQuantity').addEventListener(
      'keydown',
      handleProductQuantityEnter
    );

    $('productBarcode').addEventListener(
      'keydown',
      handlePdvBarcodeQuantityTab
    );

    $('productQuantity').addEventListener(
      'keydown',
      handlePdvBarcodeQuantityTab
    );

    /* CANCELAR ITEM não exige senha; o botão inferior fica disponível imediatamente. */
    syncProductCancelConfirmButtonState();

    /*
     * CANCELAR PRODUTO usa o mesmo botão inferior que normalmente exibe
     * F11 | MOVIMENTAÇÃO. Sem senha, ele fica vermelho como CANCELAR
     * assim que o card abre. O capture impede que o clique siga para
     * o fluxo de MOVIMENTAÇÃO.
     */
    document.addEventListener(
      'click',
      function(event){
        const target =
          event.target && event.target.closest
            ? event.target.closest('#scfCashMovementShortcut')
            : null;

        if(!target || !productCancelCardIsOpen()) return;

        event.preventDefault();
        event.stopPropagation();
        if(typeof event.stopImmediatePropagation === 'function'){
          event.stopImmediatePropagation();
        }

        confirmProductCancelFromCard();
      },
      true
    );

    document.addEventListener('keydown', handleProductsKeyboardNavigation, true);

    $('productUnitValue').addEventListener('blur', (event) => {
      const n = parseMoney(event.target.value);
      event.target.value = n ? money(n) : '';
      syncCurrentProductAutomatically({ notify: false });
    });
    $('addProductButton').addEventListener('click', handleScannerProduct);
    $('clearProductButton').addEventListener('click', () => {
      if(clearCurrentProduct({ focus: false })){
        toast('Campos limpos. Scanner liberado para um novo produto.');
      }
    });

    $('deleteProductButton').addEventListener('click', handleDeleteProduct);

    /*
     * A consulta F4 fica em outro bloco isolado. Este evento permite que ela
     * mande o produto escolhido para a lista como PREVIEW, usando exatamente
     * o mesmo render já usado quando o produto vem pelo código de barras.
     */
    window.__scfPdvInfra.eventBus.on('scf:pdv-render-current-product-preview',
      () => {
        syncCurrentProductAutomatically({ notify: false });
      }
    );

    /*
     * F4 também pode abandonar um produto que foi apenas PREPARADO pela
     * consulta, mas ainda não confirmado pelo segundo ENTER. A limpeza usa
     * a mesma rotina canônica do PDV, sem criar um segundo fluxo de estado.
     */
    window.__scfPdvInfra.eventBus.on('scf:pdv-cancelar-produto-preparado-consulta',
      () => {
        clearCurrentProduct({
          focus:false,
          force:true
        });
      }
    );

    renderAddedProducts();
    updateProductControls();
    updateTotal();
    updateDesktopProductPhotoFromCurrent();
    setProductsView(false);

    // Evita envio acidental do formulário pelo Enter.
    $('fiscalForm').addEventListener('submit', (event) => {
      event.preventDefault();
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, {once:true});
  }else{
    init();
  }
})();
