(function (global) {
  'use strict';

  var domains =
    global.__scfPdvDomains ||
    (global.__scfPdvDomains = {});

  var infra = global.__scfPdvInfra;
  var contracts = global.__scfPdvContracts;
  var shared = global.__scfPdvShared;

  if (
    !infra ||
    !infra.browserNetwork ||
    !infra.storage ||
    !infra.dom ||
    !contracts ||
    !contracts.storage ||
    !shared ||
    !shared.helpers
  ) {
    throw new Error(
      'PDV products domain: contracts/infra/shared indisponiveis.'
    );
  }

  var browserNetwork = infra.browserNetwork;
  var storage = infra.storage;
  var dom = infra.dom;
  var helpers = shared.helpers;

  var productFiscalCache = {
    byBarcode: new Map(),
    byCode: new Map(),
    byName: new Map(),
    byId: new Map(),
    updatedAt: 0
  };

  var domainState = {
    preparedPreview: null,
    ncm: {
      requestVersion: 0,
      timer: null,
      origin: '',
      officialRowsPromise: null
    }
  };

  function normalize(value){
    return String(value == null ? '' : value)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function digitsOnly(value){
    return helpers.digits(value);
  }

  function formatCode(type, value){
    var digits = digitsOnly(value);
    if(type === 'ncm') return digits.slice(0, 8);
    return String(value || '').trim();
  }

  function pdvCodigoInternoBalancaValido(valor){
    const codigo =
      digitsOnly(
        valor == null
          ? ''
          : valor
      );

    /*
     * Código interno de balança aceito EXATAMENTE como digitado:
     * 0001 até 0999.
     *
     * Não completa zeros, não converte 001 em 0001 e não altera
     * o identificador informado pelo operador.
     */
    return (
      /^0\d{3}$/.test(codigo) &&
      codigo !== '0000'
    );
  }


  function ensurePdvProductFiscalCache(){
    return productFiscalCache;
  }

  function normalizePdvCachedProduct(produto,fallback){
    const fonte =
      produto &&
      typeof produto === 'object'
        ? produto
        : {};

    const apoio =
      fallback &&
      typeof fallback === 'object'
        ? fallback
        : {};

    const gtinDigitos =
      digitsOnly(
        fonte.gtin ??
        fonte.codigoBarras ??
        fonte.barcode ??
        apoio.gtin ??
        apoio.codigoBarras ??
        apoio.barcode ??
        apoio.codigo ??
        ''
      ).slice(0,14);

    const gtin =
      [8,12,13,14].includes(
        gtinDigitos.length
      )
        ? gtinDigitos
        : '';

    const normalizado = {
      ...fonte,

      id:
        String(
          fonte.produtoId ??
          fonte.id ??
          fonte._id ??
          apoio.produtoId ??
          apoio.id ??
          apoio._id ??
          ''
        ).trim(),

      codigo:
        String(
          fonte.codigo ??
          fonte.codigoProduto ??
          fonte.sku ??
          apoio.codigo ??
          apoio.codigoProduto ??
          apoio.sku ??
          ''
        ).trim(),

      gtin,

      unidade:
        String(
          fonte.unidade ??
          fonte.unit ??
          fonte.un ??
          apoio.unidade ??
          apoio.unit ??
          apoio.un ??
          ''
        ).trim().toUpperCase(),

      valorUnitario:
        Number(
          fonte.valorUnitario ??
          fonte.precoVenda ??
          fonte.price ??
          fonte.valorVenda ??
          apoio.valorUnitario ??
          apoio.precoVenda ??
          apoio.price ??
          apoio.valorVenda ??
          0
        ) || 0,

      nome:
        String(
          fonte.nome ??
          fonte.name ??
          fonte.descricao ??
          fonte.description ??
          apoio.nome ??
          apoio.name ??
          apoio.descricao ??
          apoio.description ??
          ''
        ).trim(),

      ncm:
        String(
          fonte.ncm ??
          apoio.ncm ??
          ''
        ).trim(),

      cfop:
        String(
          fonte.cfop ??
          apoio.cfop ??
          ''
        ).trim()
    };

    return normalizado;
  }

  function pdvCachedProductIsComplete(produto){
    if(
      !produto ||
      typeof produto !== 'object'
    ){
      return false;
    }

    const gtin =
      digitsOnly(
        produto.gtin ??
        produto.codigoBarras ??
        produto.barcode ??
        ''
      ).slice(0,14);

    const codigo =
      digitsOnly(
        produto.codigo ??
        produto.codigoProduto ??
        produto.sku ??
        ''
      ).slice(0,14);

    const identificadorValido =
      [8,12,13,14].includes(
        gtin.length
      ) ||
      pdvCodigoInternoBalancaValido(
        codigo
      );

    if(
      produto.fiscalPendente === true ||
      produto.ativo === false ||
      produto.inativo === true ||
      (
        Object.prototype.hasOwnProperty.call(
          produto,
          'aptoVenda'
        ) &&
        produto.aptoVenda === false
      )
    ){
      return false;
    }

    return Boolean(
      String(
        produto.id ||
        ''
      ).trim() &&
      String(
        produto.nome ||
        ''
      ).trim() &&
      String(
        produto.unidade ||
        ''
      ).trim() &&
      Number(
        produto.valorUnitario ||
        0
      ) > 0 &&
      identificadorValido
    );
  }

  function cachePdvProductFiscal(produto,fallback){
    const normalizado =
      normalizePdvCachedProduct(
        produto,
        fallback
      );

    if(
      !pdvCachedProductIsComplete(
        normalizado
      )
    ){
      return null;
    }

    const cache =
      ensurePdvProductFiscalCache();

    const gtin =
      digitsOnly(
        normalizado.gtin
      ).slice(0,14);

    if(gtin){
      cache.byBarcode.set(
        gtin,
        normalizado
      );
    }

    const codigo =
      digitsOnly(
        normalizado.codigo ||
        ''
      ).slice(0,14);

    if(
      codigo &&
      pdvCodigoInternoBalancaValido(
        codigo
      )
    ){
      cache.byCode.set(
        codigo,
        normalizado
      );
    }

    const nomeChave =
      normalize(
        normalizado.nome
      );

    if(nomeChave){
      cache.byName.set(
        nomeChave,
        normalizado
      );
    }

    const id =
      String(
        normalizado.id ||
        ''
      ).trim();

    if(id){
      cache.byId.set(
        id,
        normalizado
      );
    }

    cache.updatedAt =
      Date.now();

    return normalizado;
  }

  function findPdvCachedProduct(criterio){
    const settings =
      criterio &&
      typeof criterio === 'object'
        ? criterio
        : {};

    if(
      settings.produto &&
      typeof settings.produto === 'object'
    ){
      cachePdvProductFiscal(
        settings.produto,
        settings.fallback
      );
    }

    const cache =
      ensurePdvProductFiscalCache();

    const codigo =
      digitsOnly(
        settings.codigo ||
        settings.code ||
        ''
      ).slice(0,14);

    if(
      pdvCodigoInternoBalancaValido(
        codigo
      )
    ){
      if(
        cache.byCode.has(
          codigo
        )
      ){
        return cache.byCode.get(
          codigo
        );
      }

      return null;
    }

    const barcode =
      digitsOnly(
        settings.barcode ||
        ''
      ).slice(0,14);

    if(
      pdvCodigoInternoBalancaValido(
        barcode
      )
    ){
      if(
        cache.byCode.has(
          barcode
        )
      ){
        return cache.byCode.get(
          barcode
        );
      }

      return null;
    }

    if(
      [8,12,13,14].includes(
        barcode.length
      )
    ){
      if(
        cache.byBarcode.has(
          barcode
        )
      ){
        return cache.byBarcode.get(
          barcode
        );
      }

      /*
       * Com GTIN válido, nunca usa o nome como plano B: isso evita que
       * uma descrição antiga faça um código novo apontar para outro item.
       */
      return null;
    }

    const descricao =
      normalize(
        settings.descricao ||
        ''
      );

    if(
      descricao &&
      cache.byName.has(
        descricao
      )
    ){
      return cache.byName.get(
        descricao
      );
    }

    return null;
  }



  const LEARNED_NCM_STORAGE_KEY =
    global.__scfPdvContracts.storage.local.keys.learnedNcmCatalog;
  const OFFICIAL_NCM_URL =
    'https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json?perfil=PUBLICO';

  async function loadOfficialNcmRows(extractRows){
    if(domainState.ncm.officialRowsPromise){
      return domainState.ncm.officialRowsPromise;
    }

    if(typeof extractRows !== 'function'){
      throw new Error(
        'PDV products domain: parser NCM indisponivel.'
      );
    }

    domainState.ncm.officialRowsPromise =
      browserNetwork.fetchJson(
        OFFICIAL_NCM_URL,
        {
          method: 'GET',
          mode: 'cors',
          cache: 'no-store',
          headers: {
            'Accept': 'application/json'
          }
        },
        30000
      )
      .then(function(payload){
        return extractRows(payload, 'ncm')
          .filter(function(row){
            return formatCode(
              'ncm',
              row.code
            ).length === 8;
          });
      })
      .catch(function(error){
        domainState.ncm.officialRowsPromise = null;
        throw error;
      });

    return domainState.ncm.officialRowsPromise;
  }

  async function searchOfficialNcm(query, extractRows){
    var rows =
      await loadOfficialNcmRows(
        extractRows
      );
    var normalizedQuery =
      normalize(query);
    var queryTokens =
      normalizedQuery
        .split(' ')
        .filter(function(token){
          return token.length >= 2;
        });
    var digits =
      digitsOnly(query);
    var scored = [];

    rows.forEach(function(row, index){
      var text =
        row.search ||
        normalize(
          row.code +
          ' ' +
          row.description
        );
      var score = 0;

      if(
        digits &&
        row.code.startsWith(digits)
      ){
        score +=
          1000 +
          digits.length * 10;
      }

      if(
        normalizedQuery &&
        text.includes(
          normalizedQuery
        )
      ){
        score += 500;
      }

      queryTokens.forEach(
        function(token){
          if(text.includes(token)){
            score +=
              token.length >= 5
                ? 18
                : 8;
          }
        }
      );

      if(score > 0){
        scored.push({
          row: row,
          score: score,
          index: index
        });
      }
    });

    scored.sort(function(a, b){
      return (
        b.score - a.score ||
        a.index - b.index
      );
    });

    return {
      rows: scored
        .slice(0, 60)
        .map(function(item){
          return item.row;
        }),
      total: scored.length
    };
  }


  const BUSINESS_NCM_CATALOG = [
    {
      code: '22021000',
      description: 'Águas com adição de açúcar ou aromatizadas, incluindo refrigerantes.',
      aliases: [
        'refrigerante', 'coca cola', 'coca-cola', 'coca', 'pepsi', 'fanta',
        'sprite', 'guarana antarctica', 'guarana refrigerante', 'soda limonada'
      ],
      excludes: ['guarana em po', 'guarana po', 'semente de guarana']
    },
    {
      code: '22011000',
      description: 'Águas minerais e águas gaseificadas, sem adição de açúcar ou aromatizantes.',
      aliases: ['agua', 'agua mineral', 'agua sem gas', 'agua com gas', 'garrafa de agua mineral', 'galao de agua mineral'],
      excludes: [
        'agua sanitaria', 'agua oxigenada', 'agua destilada', 'agua de coco',
        'acucar', 'aromatizada', 'aromatizante', 'saborizada', 'refrigerante', 'agua tonica'
      ]
    },
    {
      code: '22029900',
      description: 'Outras bebidas não alcoólicas.',
      aliases: ['energetico', 'bebida energetica', 'red bull', 'monster energy', 'isotonico', 'bebida esportiva']
    },
    {
      code: '22030000',
      description: 'Cervejas de malte.',
      aliases: ['cerveja', 'brahma', 'skol', 'antarctica cerveja', 'itaipava', 'heineken cerveja', 'budweiser cerveja']
    },
    {
      code: '22085000',
      description: 'Gim e genebra.',
      aliases: ['gin', 'gim', 'genebra', 'gin seco', 'dry gin'],
      excludes: ['ginger ale', 'ginger', 'gengibre']
    },
    {
      code: '22084000',
      description: 'Cachaça e outras aguardentes de cana.',
      aliases: ['cachaca', 'cachaca de cana', 'pinga', 'aguardente de cana']
    },
    {
      code: '10063011',
      description: 'Arroz parboilizado, polido ou brunido.',
      aliases: ['arroz parboilizado', 'arroz parboilizado polido']
    },
    {
      code: '10062010',
      description: 'Arroz integral parboilizado.',
      aliases: ['arroz integral parboilizado', 'arroz parboilizado integral']
    },
    {
      code: '10062020',
      description: 'Arroz integral não parboilizado.',
      aliases: ['arroz integral', 'arroz castanho']
    },
    {
      code: '10063021',
      description: 'Arroz polido não parboilizado.',
      aliases: [
        'arroz', 'arroz branco', 'arroz polido', 'arroz tipo 1',
        'arroz agulhinha', 'arroz longo fino', 'arroz comum'
      ],
      excludes: ['parboilizado', 'integral', 'arboreo', 'cateto', 'carnaroli', 'basmati', 'jasmim', 'arroz preto', 'arroz vermelho']
    },
    {
      code: '07133319',
      description: 'Feijão preto seco, em grãos.',
      aliases: ['feijao preto', 'feijao preto tipo 1']
    },
    {
      code: '07133329',
      description: 'Feijão branco seco, em grãos.',
      aliases: ['feijao branco']
    },
    {
      code: '07133399',
      description: 'Feijão carioca ou carioquinha seco, em grãos.',
      aliases: [
        'feijao', 'feijao carioca', 'feijao carioquinha',
        'feijao rajado', 'feijao comum'
      ],
      excludes: ['preto', 'branco', 'fradinho', 'caupi', 'verde', 'azuki']
    },
    {
      code: '09012100',
      description: 'Café torrado, não descafeinado.',
      aliases: ['cafe torrado', 'cafe moido', 'cafe em po', 'cafe torrado e moido'],
      excludes: ['cafe soluvel', 'cafe instantaneo']
    },
    {
      code: '21011110',
      description: 'Café solúvel, mesmo descafeinado.',
      aliases: ['cafe soluvel', 'cafe instantaneo']
    },
    {
      code: '17019900',
      description: 'Outros açúcares de cana ou de beterraba e sacarose quimicamente pura.',
      aliases: ['acucar', 'acucar refinado', 'acucar cristal', 'acucar branco', 'acucar de cana']
    },
    {
      code: '25010020',
      description: 'Sal de mesa.',
      aliases: ['sal de cozinha', 'sal refinado', 'sal de mesa']
    },
    {
      code: '11010010',
      description: 'Farinha de trigo.',
      aliases: ['farinha de trigo']
    },
    {
      code: '19021900',
      description: 'Outras massas alimentícias não cozidas, não recheadas nem preparadas de outro modo.',
      aliases: ['macarrao sem ovos', 'massa sem ovos', 'espaguete sem ovos']
    },
    {
      code: '15171000',
      description: 'Margarina, exceto a margarina líquida.',
      aliases: ['margarina']
    },
    {
      code: '15079011',
      description: 'Óleo de soja refinado, em recipientes com capacidade inferior ou igual a 5 litros.',
      aliases: ['oleo de soja', 'oleo soja 900ml', 'oleo soja 1l']
    },
    {
      code: '48181000',
      description: 'Papel higiênico.',
      aliases: ['papel higienico']
    },
    {
      code: '48182000',
      description: 'Lenços, toalhas de mão e artigos semelhantes, de papel.',
      aliases: ['papel toalha', 'toalha de papel']
    },
    {
      code: '33061000',
      description: 'Dentifrícios.',
      aliases: ['pasta de dente', 'creme dental', 'dentifricio']
    },
    {
      code: '33051000',
      description: 'Xampus para os cabelos.',
      aliases: ['shampoo', 'xampu']
    },
    {
      code: '34025000',
      description: 'Preparações para lavagem ou limpeza, acondicionadas para venda a retalho.',
      aliases: ['detergente liquido', 'detergente de louca', 'sabao em po', 'lava roupas em po']
    },
    {
      code: '28289011',
      description: 'Hipoclorito de sódio.',
      aliases: ['agua sanitaria', 'alvejante com cloro', 'hipoclorito de sodio']
    },
    {
      code: '34011190',
      description: 'Outros sabões e produtos de toucador, em barras ou pedaços moldados.',
      aliases: ['sabonete em barra', 'sabonete']
    },
    {
      code: '36050000',
      description: 'Fósforos, exceto os artigos de pirotecnia.',
      aliases: ['fosforo', 'caixa de fosforo']
    },
    {
      code: '17041000',
      description: 'Gomas de mascar, mesmo revestidas de açúcar.',
      aliases: ['chiclete', 'goma de mascar']
    },
    {
      code: '21032010',
      description: 'Ketchup e outros molhos de tomate, em embalagens imediatas de conteúdo inferior ou igual a 1 kg.',
      aliases: ['ketchup', 'catchup']
    },
    {
      code: '21039011',
      description: 'Maionese, em embalagens imediatas de conteúdo inferior ou igual a 1 kg.',
      aliases: ['maionese']
    },
    {
      code: '16041310',
      description: 'Sardinhas inteiras ou em pedaços, em conserva.',
      aliases: ['sardinha em lata', 'sardinha enlatada', 'sardinha em conserva']
    },
    {
      code: '16041410',
      description: 'Atuns inteiros ou em pedaços, em conserva.',
      aliases: ['atum em lata', 'atum enlatado', 'atum em conserva']
    },
    {
      code: '39241000',
      description: 'Serviços de mesa e outros utensílios de uso doméstico, de plástico.',
      aliases: ['copo descartavel plastico', 'prato descartavel plastico', 'talher descartavel plastico']
    },
    {
      code: '62046200',
      description: 'Calças de algodão, de uso feminino.',
      aliases: ['calca jeans feminina', 'jeans feminina', 'calca jeans mulher', 'calca jeans menina']
    },
    {
      code: '62034200',
      description: 'Calças de algodão, de uso masculino.',
      aliases: ['calca jeans masculina', 'jeans masculina', 'calca jeans homem', 'calca jeans menino', 'calca jeans']
    },
    {
      code: '73239300',
      description: 'Artigos de uso doméstico, de aço inoxidável.',
      aliases: ['caneca de aco inox', 'caneca inox', 'caneca de aco inoxidavel']
    }
  ];

  function productCatalogKey(value){
    return normalize(value)
      .replace(/\b\d+(?:\s*[a-z]+)?\b/g, ' ')
      .replace(/\b(ml|l|litro|litros|kg|g|gramas|un|unidade|unidades|lata|garrafa|pet|caixa|pacote|fardo)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function readLearnedProductNcms(){
    try{
      const parsed = JSON.parse(storage.local.getItem(LEARNED_NCM_STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    }catch(error){
      return {};
    }
  }

  function saveLearnedProductNcm(productName, code){
    const normalizedCode = formatCode('ncm', code);
    const exactKey = normalize(productName);
    const broadKey = productCatalogKey(productName);
    if(normalizedCode.length !== 8 || exactKey.length < 3) return;

    try{
      const catalog = readLearnedProductNcms();
      const entry = { code: normalizedCode, updatedAt: Date.now() };
      catalog[exactKey] = entry;
      if(broadKey.length >= 3) catalog[broadKey] = entry;

      const sorted = Object.entries(catalog)
        .sort((a, b) => Number(b[1] && b[1].updatedAt || 0) - Number(a[1] && a[1].updatedAt || 0))
        .slice(0, 500);
      storage.local.setItem(LEARNED_NCM_STORAGE_KEY, JSON.stringify(Object.fromEntries(sorted)));
    }catch(error){}
  }

  function findLearnedProductNcm(productName){
    const catalog = readLearnedProductNcms();
    const exactKey = normalize(productName);
    const broadKey = productCatalogKey(productName);
    const entry = catalog[exactKey] || catalog[broadKey];
    const code = formatCode('ncm', entry && entry.code);
    if(code.length !== 8) return null;
    return { code, description: 'Classificação memorizada para este produto.', search: code };
  }

  function findLocalProductNcm(productName){
    const learned = findLearnedProductNcm(productName);
    if(learned) return learned;

    const text = normalize(productName);
    if(!text) return null;

    let best = null;
    BUSINESS_NCM_CATALOG.forEach((item, itemIndex) => {
      const excluded = (item.excludes || []).some((term) => text.includes(normalize(term)));
      if(excluded) return;

      (item.aliases || []).forEach((alias, aliasIndex) => {
        const normalizedAlias = normalize(alias);
        if(!normalizedAlias) return;
        const aliasTokens = normalizedAlias.split(' ').filter(Boolean);
        const allTokensPresent = aliasTokens.every((token) => text.includes(token));
        let score = 0;
        if(text === normalizedAlias) score = 2000 + normalizedAlias.length;
        else if(text.includes(normalizedAlias)) score = 1500 + normalizedAlias.length;
        else if(allTokensPresent) score = 900 + normalizedAlias.length;

        if(score && (!best || score > best.score)){
          best = { item, score, itemIndex, aliasIndex };
        }
      });
    });

    if(!best) return null;
    return {
      code: best.item.code,
      description: best.item.description,
      search: normalize(best.item.code + ' ' + best.item.description)
    };
  }

  function buildProductNcmQueries(productName){
    const raw = String(productName || '').trim();
    const normalized = normalize(raw);
    const queries = [raw, productCatalogKey(raw)];

    // Converte nomes comerciais em termos usados na nomenclatura oficial.
    if(normalized.includes('refrigerante') || normalized.includes('coca') || normalized.includes('pepsi') || normalized.includes('fanta') || normalized.includes('sprite')){
      queries.push('águas adicionadas de açúcar ou aromatizadas');
    }
    if(normalized.includes('energetico') || normalized.includes('isotonico')){
      queries.push('outras bebidas não alcoólicas');
    }
    if(normalized.includes('cerveja')) queries.push('cervejas de malte');
    if(normalized.includes('arroz')){
      if(normalized.includes('parboilizado')) queries.push('arroz parboilizado polido');
      else if(normalized.includes('integral')) queries.push('arroz descascado não parboilizado');
      else queries.push('arroz polido não parboilizado');
    }
    if(normalized.includes('feijao')){
      if(normalized.includes('preto')) queries.push('feijão preto seco');
      else if(normalized.includes('branco')) queries.push('feijão branco seco');
      else queries.push('feijão comum seco');
    }
    if(normalized.includes('acucar')) queries.push('outros açúcares de cana sacarose');
    if(normalized.includes('detergente') || normalized.includes('sabao em po')){
      queries.push('preparações para lavagem acondicionadas para venda a retalho');
    }
    if(normalized.includes('papel higienico')) queries.push('papel higiênico');
    if(normalized.includes('pasta de dente') || normalized.includes('creme dental')) queries.push('dentifrícios');

    // Converte alguns nomes comerciais em termos usados na nomenclatura oficial.
    if(normalized.includes('inox') || normalized.includes('aco inox')){
      queries.push('aço inoxidável');
    }
    if(normalized.includes('caneca')){
      queries.push('serviços de mesa artigos de cozinha uso doméstico');
    }
    if(normalized.includes('caneca') && (normalized.includes('inox') || normalized.includes('aco inox'))){
      queries.push('artigos de uso doméstico de aço inoxidável');
    }
    if((normalized.includes('calca') || normalized.includes('calcas')) && (normalized.includes('jeans') || normalized.includes('denim'))){
      if(normalized.includes('feminina') || normalized.includes('feminino') || normalized.includes('mulher') || normalized.includes('menina')){
        queries.push('calças de algodão de uso feminino');
      }else{
        queries.push('calças de algodão de uso masculino');
      }
    }

    const seen = new Set();
    return queries.filter((item) => {
      const key = normalize(item);
      if(!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function chooseBestEightDigitNcm(rows, productName){
    const candidates = (rows || []).filter((row) => formatCode('ncm', row.code).length === 8);
    if(!candidates.length) return null;

    const productTokens = normalize(productName)
      .split(' ')
      .filter((token) => token.length >= 3 && !['para','com','sem','produto'].includes(token));

    const scored = candidates.map((row, index) => {
      const description = normalize(row.description);
      let score = 0;
      productTokens.forEach((token) => {
        if(description.includes(token)) score += 4;
      });
      if(description.includes('aco inoxidavel') && normalize(productName).includes('inox')) score += 12;
      if(description.includes('uso domestico') && normalize(productName).includes('caneca')) score += 8;
      if(description.includes('artigos de cozinha') && normalize(productName).includes('caneca')) score += 8;
      return { row, score, index };
    });

    scored.sort((a, b) => b.score - a.score || a.index - b.index);

    // Evita preencher automaticamente quando o nome é genérico demais.
    // Produtos já conhecidos pelo catálogo local não passam por esta etapa.
    if(!scored.length || scored[0].score < 8) return null;
    return scored[0].row;
  }


  async function searchProductNcm(
    query,
    searchRemote
  ){
    var raw =
      String(query || '').trim();

    if(normalize(raw).length < 3){
      return null;
    }

    if(typeof searchRemote !== 'function'){
      throw new Error(
        'PDV products domain: searchRemote indisponivel.'
      );
    }

    var version =
      ++domainState.ncm.requestVersion;

    var localMatch =
      findLocalProductNcm(raw);

    if(localMatch){
      if(
        version !==
        domainState.ncm.requestVersion
      ){
        return null;
      }

      return localMatch;
    }

    var queries =
      buildProductNcmQueries(raw);

    for(var index = 0; index < queries.length; index += 1){
      try{
        var result =
          await searchRemote(
            'ncm',
            queries[index]
          );

        if(
          version !==
          domainState.ncm.requestVersion
        ){
          return null;
        }

        var bestRow =
          chooseBestEightDigitNcm(
            result && result.rows,
            raw
          );

        if(bestRow){
          return bestRow;
        }
      }catch(error){}
    }

    return null;
  }

  function setNcmOrigin(value){
    domainState.ncm.origin =
      String(value || '');
    return domainState.ncm.origin;
  }

  function getNcmOrigin(){
    return domainState.ncm.origin;
  }

  function cancelNcmLookup(){
    domainState.ncm.requestVersion += 1;

    if(domainState.ncm.timer !== null){
      global.clearTimeout(
        domainState.ncm.timer
      );
      domainState.ncm.timer = null;
    }
  }

  function resetNcmLookup(){
    cancelNcmLookup();
    setNcmOrigin('');
  }

  function bindProductNcmLookup(options){
    var settings =
      options &&
      typeof options === 'object'
        ? options
        : {};

    var input =
      dom.byId('productName');

    if(!input){
      return false;
    }

    if(
      typeof settings.searchRemote !== 'function' ||
      typeof settings.applyProductNcm !== 'function' ||
      typeof settings.closeResults !== 'function'
    ){
      throw new Error(
        'PDV products domain: callbacks NCM incompletos.'
      );
    }

    input.addEventListener(
      'input',
      function(){
        cancelNcmLookup();

        var query =
          input.value.trim();

        var ncmSearch =
          dom.byId('ncmSearch');
        var ncmCode =
          dom.byId('ncmCode');
        var ncmSelected =
          dom.byId('ncmSelected');

        if(!query){
          if(ncmSearch){
            ncmSearch.value = '';
          }
          if(ncmCode){
            ncmCode.value = '';
          }
          if(ncmSelected){
            ncmSelected.textContent = '';
          }

          setNcmOrigin('');
          settings.closeResults('ncm');
          return;
        }

        if(
          getNcmOrigin() ===
          'product-auto'
        ){
          if(ncmSearch){
            ncmSearch.value = '';
          }
          if(ncmCode){
            ncmCode.value = '';
          }
          setNcmOrigin('');
        }

        if(normalize(query).length < 3){
          return;
        }

        domainState.ncm.timer =
          global.setTimeout(
            function(){
              domainState.ncm.timer = null;

              searchProductNcm(
                query,
                settings.searchRemote
              )
              .then(function(row){
                if(!row){
                  return;
                }

                if(
                  normalize(input.value) !==
                  normalize(query)
                ){
                  return;
                }

                settings.applyProductNcm(
                  row,
                  true
                );
              })
              .catch(function(){});
            },
            700
          );
      }
    );

    return true;
  }

  function getPreparedPreview(){
    return domainState.preparedPreview;
  }

  function setPreparedPreview(value){
    domainState.preparedPreview =
      value == null
        ? null
        : value;
    return domainState.preparedPreview;
  }

  Object.defineProperty(
    global,
    '__scfPdvProdutoConsultaPreview',
    {
      configurable: true,
      enumerable: true,
      get: getPreparedPreview,
      set: setPreparedPreview
    }
  );

  var api = {
    isInternalScaleCode:
      pdvCodigoInternoBalancaValido,
    cacheFiscalProduct:
      cachePdvProductFiscal,
    findCachedFiscalProduct:
      findPdvCachedProduct,
    searchOfficialNcm:
      searchOfficialNcm,
    saveLearnedProductNcm:
      saveLearnedProductNcm,
    findLocalProductNcm:
      findLocalProductNcm,
    searchProductNcm:
      searchProductNcm,
    bindProductNcmLookup:
      bindProductNcmLookup,
    cancelNcmLookup:
      cancelNcmLookup,
    resetNcmLookup:
      resetNcmLookup,
    setNcmOrigin:
      setNcmOrigin,
    getNcmOrigin:
      getNcmOrigin,
    getPreparedPreview:
      getPreparedPreview,
    setPreparedPreview:
      setPreparedPreview,
    snapshot: function(){
      return Object.freeze({
        ncmOrigin:
          domainState.ncm.origin,
        ncmRequestVersion:
          domainState.ncm.requestVersion,
        hasPendingNcmTimer:
          domainState.ncm.timer !== null,
        hasOfficialNcmRows:
          domainState.ncm.officialRowsPromise !== null,
        preparedPreview:
          domainState.preparedPreview,
        cacheUpdatedAt:
          productFiscalCache.updatedAt
      });
    }
  };

  Object.defineProperty(
    api,
    'preparedPreview',
    {
      enumerable: true,
      get: getPreparedPreview,
      set: setPreparedPreview
    }
  );

  domains.products =
    Object.freeze(api);
})(window);
