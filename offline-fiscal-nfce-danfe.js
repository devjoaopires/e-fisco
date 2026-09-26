'use strict';

const crypto = require('crypto');
const { DOMParser } = require('@xmldom/xmldom');
const { getNfceDocumentBySaleId } = require('./offline-db');
const { buildNfceXmlWithSupplement } = require('./offline-fiscal-nfce-qrcode');

const NFE_NS = 'http://www.portalfiscal.inf.br/nfe';
const DSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';
const MESSAGE_CONTINGENCY_LINE_1 = 'EMITIDA EM CONTINGÊNCIA';
const MESSAGE_CONTINGENCY_LINE_2 = 'Pendente de autorização';

const DANFE_PROFILE = 'DANFE-NFCe-6.0-contingencia-step33';
const MAX_FINAL_XML_BYTES = 4 * 1024 * 1024;

function requiredText(value, fieldName, maxLength = 4096) {
  const text = String(value == null ? '' : value).trim();
  if (!text || text.length > maxLength) throw new Error(`${fieldName} inválido.`);
  return text;
}

function optionalText(value, maxLength = 4096) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  if (text.length > maxLength) throw new Error('Texto opcional excede o limite seguro.');
  return text;
}

function children(node) {
  const result = [];
  const list = node && node.childNodes ? node.childNodes : [];
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index];
    if (item && item.nodeType === 1) result.push(item);
  }
  return result;
}

function child(node, localName, namespaceUri = NFE_NS, required = true) {
  const found = children(node).filter((item) => item.localName === localName && item.namespaceURI === namespaceUri);
  if (found.length > 1) throw new Error(`XML final contém mais de um ${localName} no mesmo nível.`);
  if (required && found.length !== 1) throw new Error(`XML final não contém ${localName} obrigatório.`);
  return found[0] || null;
}

function descendants(node, localName, namespaceUri = NFE_NS) {
  const result = [];
  const list = node && typeof node.getElementsByTagName === 'function' ? node.getElementsByTagName('*') : [];
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index];
    if (item.localName === localName && (namespaceUri == null || item.namespaceURI === namespaceUri)) result.push(item);
  }
  return result;
}

function textOf(node, localName, required = true) {
  const found = child(node, localName, NFE_NS, required);
  return found ? String(found.textContent || '').trim() : '';
}

function numberText(value, fieldName) {
  const text = requiredText(value, fieldName, 32);
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error(`${fieldName} não é numérico.`);
  const number = Number(text);
  if (!Number.isFinite(number)) throw new Error(`${fieldName} excede o limite numérico.`);
  return number;
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

function parseFinalNfce(document) {
  if (!document || typeof document !== 'object') throw new Error('Documento NFC-e inválido para DANFE.');
  const state = String(document.state || '');
  if (!['CONTINGENCIA_PENDENTE', 'SENDING', 'RECONCILE_BY_KEY'].includes(state)) {
    throw new Error(
      `DANFE de contingência exige documento fiscal ainda pendente de conclusão; recebido ${state}.`
    );
  }
  if (!Buffer.isBuffer(document.signedXml) || document.signedXml.length < 1) {
    throw new Error('Documento NFC-e não possui signedXml persistido.');
  }
  const storedHash = requiredText(document.signedXmlSha256, 'signedXmlSha256', 64).toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(storedHash) || sha256Hex(document.signedXml) !== storedHash) {
    throw new Error('Hash do signedXml não confere antes da geração do DANFE.');
  }
  if (!document.qrCodeText) throw new Error('Documento NFC-e não possui QR Code persistido.');

  const final = buildNfceXmlWithSupplement(document);
  const finalBuffer = Buffer.from(final.xml, 'utf8');
  try {
    if (finalBuffer.length < 1 || finalBuffer.length > MAX_FINAL_XML_BYTES) {
      throw new Error('XML final da NFC-e vazio ou acima do limite seguro.');
    }
    if (sha256Hex(finalBuffer) !== final.sha256) {
      throw new Error('Hash do XML final com infNFeSupl não confere.');
    }
  } finally {
    finalBuffer.fill(0);
  }

  const parseErrors = [];
  const doc = new DOMParser({
    onError: (level, message) => parseErrors.push(`${level}:${message}`)
  }).parseFromString(final.xml, 'application/xml');
  if (parseErrors.length || !doc || !doc.documentElement) {
    throw new Error(`XML final inválido para DANFE: ${parseErrors.join('; ')}`);
  }
  const root = doc.documentElement;
  if (root.localName !== 'NFe' || root.namespaceURI !== NFE_NS) {
    throw new Error('XML final não possui raiz NFe oficial.');
  }
  const rootChildren = children(root);
  const infIndex = rootChildren.findIndex((item) => item.localName === 'infNFe' && item.namespaceURI === NFE_NS);
  const suplIndex = rootChildren.findIndex((item) => item.localName === 'infNFeSupl' && item.namespaceURI === NFE_NS);
  const signatureIndex = rootChildren.findIndex((item) => item.localName === 'Signature' && item.namespaceURI === DSIG_NS);
  if (infIndex !== 0 || suplIndex !== 1 || signatureIndex !== 2 || rootChildren.length !== 3) {
    throw new Error('Ordem do XML final deve ser exatamente infNFe, infNFeSupl, Signature.');
  }

  const infNFe = rootChildren[infIndex];
  const supl = rootChildren[suplIndex];
  const id = requiredText(infNFe.getAttribute('Id'), 'infNFe.Id', 64);
  const accessKey = id.startsWith('NFe') ? id.slice(3) : '';
  if (!/^\d{44}$/.test(accessKey) || accessKey !== String(document.chaveAcesso)) {
    throw new Error('Chave de acesso do XML final diverge do documento persistido.');
  }

  const ide = child(infNFe, 'ide');
  const emit = child(infNFe, 'emit');
  const total = child(infNFe, 'total');
  const pag = child(infNFe, 'pag');
  const infAdic = child(infNFe, 'infAdic', NFE_NS, false);
  const dest = child(infNFe, 'dest', NFE_NS, false);

  if (textOf(ide, 'mod') !== '65') throw new Error('DANFE local aceita somente NFC-e modelo 65.');
  if (textOf(ide, 'tpEmis') !== '9') throw new Error('DANFE de contingência exige tpEmis=9.');
  if (textOf(ide, 'tpAmb') !== '1') throw new Error('Etapa 33 aceita somente PRODUÇÃO tpAmb=1.');
  const protocolNodes = descendants(root, 'protNFe');
  if (protocolNodes.length !== 0) throw new Error('DANFE pendente de autorização não pode conter protocolo.');

  const enderEmit = child(emit, 'enderEmit');
  const issuer = {
    cnpj: textOf(emit, 'CNPJ'),
    razaoSocial: textOf(emit, 'xNome'),
    nomeFantasia: textOf(emit, 'xFant', false),
    inscricaoEstadual: textOf(emit, 'IE'),
    logradouro: textOf(enderEmit, 'xLgr'),
    numero: textOf(enderEmit, 'nro'),
    complemento: textOf(enderEmit, 'xCpl', false),
    bairro: textOf(enderEmit, 'xBairro'),
    municipio: textOf(enderEmit, 'xMun'),
    uf: textOf(enderEmit, 'UF'),
    cep: textOf(enderEmit, 'CEP', false)
  };

  const detNodes = children(infNFe).filter((item) => item.localName === 'det' && item.namespaceURI === NFE_NS);
  if (!detNodes.length) throw new Error('XML final não possui itens para o DANFE.');
  const items = detNodes.map((det, index) => {
    const prod = child(det, 'prod');
    return {
      itemNumber: Number(det.getAttribute('nItem') || index + 1),
      productCode: textOf(prod, 'cProd'),
      description: textOf(prod, 'xProd'),
      quantity: numberText(textOf(prod, 'qCom'), `item ${index + 1}: qCom`),
      unit: textOf(prod, 'uCom'),
      unitValue: numberText(textOf(prod, 'vUnCom'), `item ${index + 1}: vUnCom`),
      totalValue: numberText(textOf(prod, 'vProd'), `item ${index + 1}: vProd`)
    };
  });

  const icmsTot = child(total, 'ICMSTot');
  const vNFText = textOf(icmsTot, 'vNF');
  const totalValue = numberText(vNFText, 'vNF');
  const taxIcms = numberText(textOf(icmsTot, 'vICMS'), 'vICMS');
  const taxPis = numberText(textOf(icmsTot, 'vPIS'), 'vPIS');
  const taxCofins = numberText(textOf(icmsTot, 'vCOFINS'), 'vCOFINS');

  const ibsCbsTot = child(total, 'IBSCBSTot', NFE_NS, false);
  const rtcTotals = ibsCbsTot ? {
    base: numberText(textOf(ibsCbsTot, 'vBCIBSCBS'), 'vBCIBSCBS'),
    ibs: numberText(textOf(child(ibsCbsTot, 'gIBS'), 'vIBS'), 'vIBS'),
    cbs: numberText(textOf(child(ibsCbsTot, 'gCBS'), 'vCBS'), 'vCBS')
  } : null;

  const paymentParts = children(pag)
    .filter((item) => item.localName === 'detPag' && item.namespaceURI === NFE_NS)
    .map((detPag) => {
      const code = textOf(detPag, 'tPag');
      const amount = numberText(textOf(detPag, 'vPag'), 'vPag');
      return {
        tPag: code,
        metodo: paymentLabel(code),
        valor: amount
      };
    });
  if (!paymentParts.length) throw new Error('XML final não possui pagamento para o DANFE.');

  let consumer = {
    identified: false,
    type: '',
    document: '',
    name: ''
  };
  if (dest) {
    const cpf = textOf(dest, 'CPF', false);
    const cnpj = textOf(dest, 'CNPJ', false);
    const foreign = textOf(dest, 'idEstrangeiro', false);
    const entries = [
      cpf ? { type: 'CPF', document: cpf } : null,
      cnpj ? { type: 'CNPJ', document: cnpj } : null,
      foreign ? { type: 'ID_ESTRANGEIRO', document: foreign } : null
    ].filter(Boolean);
    if (entries.length !== 1) throw new Error('Destinatário do XML final possui identificação ambígua.');
    consumer = {
      identified: true,
      type: entries[0].type,
      document: entries[0].document,
      name: textOf(dest, 'xNome', false)
    };
  }

  const qrCodeText = requiredText(textOf(supl, 'qrCode'), 'qrCode', 600);
  if (qrCodeText !== String(document.qrCodeText)) {
    throw new Error('QR Code do XML final diverge do valor persistido.');
  }
  const urlConsultaChave = requiredText(textOf(supl, 'urlChave'), 'urlChave', 85);

  const dhEmi = textOf(ide, 'dhEmi');
  const dhCont = textOf(ide, 'dhCont');
  const xJust = textOf(ide, 'xJust');
  const nNF = textOf(ide, 'nNF');
  const serie = textOf(ide, 'serie');
  const additionalInfo = infAdic ? textOf(infAdic, 'infCpl', false) : '';

  return {
    finalXmlSha256: final.sha256,
    signedXmlSha256: storedHash,
    accessKey,
    issuer,
    items,
    totalValue,
    taxes: {
      icms: taxIcms,
      pis: taxPis,
      cofins: taxCofins,
      total: taxIcms + taxPis + taxCofins
    },
    rtcTotals,
    paymentParts,
    consumer,
    qrCodeText,
    urlConsultaChave,
    dhEmi,
    dhCont,
    xJust,
    nNF,
    serie,
    additionalInfo
  };
}

function paymentLabel(codeValue) {
  const code = String(codeValue || '').trim();
  const labels = {
    '01': 'DINHEIRO',
    '02': 'CHEQUE',
    '03': 'CARTÃO DE CRÉDITO',
    '04': 'CARTÃO DE DÉBITO',
    '05': 'CRÉDITO LOJA',
    '10': 'VALE ALIMENTAÇÃO',
    '11': 'VALE REFEIÇÃO',
    '12': 'VALE PRESENTE',
    '13': 'VALE COMBUSTÍVEL',
    '15': 'BOLETO BANCÁRIO',
    '16': 'DEPÓSITO BANCÁRIO',
    '17': 'PIX',
    '18': 'TRANSFERÊNCIA BANCÁRIA',
    '19': 'PROGRAMA DE FIDELIDADE',
    '90': 'SEM PAGAMENTO',
    '99': 'OUTROS'
  };
  return labels[code] || `PAGAMENTO ${code}`;
}

function buildBaseReceipt(document, parsed) {
  const saleSnapshot = document.inputSnapshot && document.inputSnapshot.sale && typeof document.inputSnapshot.sale === 'object'
    ? document.inputSnapshot.sale
    : {};
  const paymentMethod = parsed.paymentParts.map((item) => item.metodo).join(' + ');

  const contingencyMessage = {
    linha1: MESSAGE_CONTINGENCY_LINE_1,
    linha2: MESSAGE_CONTINGENCY_LINE_2
  };
  return {
    success: true,
    autorizado: false,
    contingenciaOffline: true,
    pendenteTransmissao: true,
    tipoEmissao: 9,
    ambiente: 'PRODUCAO',
    fiscalStatus: 'CONTINGENCIA_PENDENTE',
    documentoFiscalEmitido: true,
    transmissaoFiscalExecutada: false,
    saleId: String(document.saleId),
    fiscalId: String(document.fiscalId),
    danfeProfile: DANFE_PROFILE,
    paperWidthMm: 80,
    sourceSignedXmlSha256: parsed.signedXmlSha256,
    finalXmlSha256: parsed.finalXmlSha256,
    emitente: { ...parsed.issuer },
    itens: parsed.items.map((item) => ({ ...item })),
    venda: {
      saleId: String(document.saleId),
      totalValue: parsed.totalValue,
      paymentMethod,
      saleDate: parsed.dhEmi,
      saleNumber: optionalText(saleSnapshot.saleNumber || '', 128),
      operatorId: optionalText(saleSnapshot.operatorId || '', 128)
    },
    pagamentoFiscal: {
      disponivel: true,
      pagamentos: parsed.paymentParts.map((item) => ({ ...item })),
      valorTroco: 0
    },
    tributosAproximados: { ...parsed.taxes },
    tributosRtc: parsed.rtcTotals ? { ...parsed.rtcTotals } : null,
    informacoesComplementares: parsed.additionalInfo,
    consumidor: { ...parsed.consumer },
    mensagemFiscalContingencia: { ...contingencyMessage },

    mensagensObrigatoriasDanfe: {
      abaixoCabecalho: [MESSAGE_CONTINGENCY_LINE_1, MESSAGE_CONTINGENCY_LINE_2],
      abaixoIdentificacaoNfce: [MESSAGE_CONTINGENCY_LINE_1, MESSAGE_CONTINGENCY_LINE_2],

    },
    contingencia: {
      tpEmis: 9,
      dhCont: parsed.dhCont,
      xJust: parsed.xJust,
      protocoloSuprimido: true
    },
    nfce: {
      numeroNfce: parsed.nNF,
      serie: parsed.serie,
      dataEmissao: parsed.dhEmi,
      dataAutorizacao: null,
      protocolo: null,
      chaveAcesso: parsed.accessKey,
      urlQrCode: parsed.qrCodeText,
      urlConsultaChave: parsed.urlConsultaChave,
      tipoEmissao: 9
    }
  };
}

function copyModel(base, via) {
  const establishment = via === 'ESTABELECIMENTO';
  const model = JSON.parse(JSON.stringify(base));
  model.via = establishment ? 'ESTABELECIMENTO' : 'CONSUMIDOR';
  model.rotuloVia = establishment ? 'VIA DO ESTABELECIMENTO' : 'VIA CONSUMIDOR';
  model.viaDoEstabelecimento = establishment;
  model.guardaAteAutorizacao = establishment;
  model.nfce.via = model.via;
  model.nfce.rotuloVia = model.rotuloVia;
  return model;
}

function buildDanfeContingencyModels(document) {
  const parsed = parseFinalNfce(document);
  const base = buildBaseReceipt(document, parsed);
  const consumer = copyModel(base, 'CONSUMIDOR');
  const establishment = copyModel(base, 'ESTABELECIMENTO');
  return {
    profile: DANFE_PROFILE,
    saleId: String(document.saleId),
    fiscalId: String(document.fiscalId),
    chaveAcesso: parsed.accessKey,
    signedXmlSha256: parsed.signedXmlSha256,
    finalXmlSha256: parsed.finalXmlSha256,
    consumer,
    establishment
  };
}

function generateDanfeContingencyForSale(options = {}) {
  const empresaId = requiredText(options.empresaId, 'empresaId', 128);
  const saleId = requiredText(options.saleId, 'saleId', 256);
  const document = getNfceDocumentBySaleId(empresaId, saleId);
  if (!document) throw new Error('Documento NFC-e não encontrado para gerar DANFE de contingência.');
  return buildDanfeContingencyModels(document);
}

module.exports = {
  DANFE_PROFILE,
  MESSAGE_CONTINGENCY_LINE_1,
  MESSAGE_CONTINGENCY_LINE_2,

  parseFinalNfce,
  buildDanfeContingencyModels,
  generateDanfeContingencyForSale
};
