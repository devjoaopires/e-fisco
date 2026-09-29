'use strict';

const { DOMParser } = require('@xmldom/xmldom');

const {
  normalizePaymentMethodName,
  moneyFromCents,
  decimalMoneyToCents,
  quantity4,
  unitPriceFromCents,
  percentage4,
  assertPercent,
  rtcRequiredForIssuerDate,
  percentOfCents,
  formatPaDateTime,
  aammFromFiscalDate
} = require('./offline-fiscal-values');

const NFE_NS = 'http://www.portalfiscal.inf.br/nfe';

const SPEC_PROFILE = 'NFCe-4.00-PA-PROD-SN-RTC-transition-step46';
const PROCESS_VERSION = 'e-fisco-1.0.44';
const ALLOWED_CSOSN_NO_CREDIT = new Set(['102', '103', '300', '400']);
const ALLOWED_PIS_COFINS_NT = new Set(['04', '05', '06', '07', '08', '09']);
const PAYMENT_CODE_BY_METHOD = Object.freeze({
  DINHEIRO: '01',
  CREDITO: '03',
  DEBITO: '04',
  PIX: '17'
});
const PAYMENT_METHODS_WITH_CARD_GROUP = new Set(['03', '04', '17']);

function fail(message) {
  throw new Error(message);
}

function requiredObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} inválido.`);
  return value;
}

function requiredText(value, name, maxLength = 256) {
  const text = String(value == null ? '' : value).trim();
  if (!text || text.length > maxLength) fail(`${name} inválido.`);
  return text;
}

function optionalText(value, maxLength = 256) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return null;
  if (text.length > maxLength) fail('Texto opcional excede o limite seguro.');
  return text;
}

function digits(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}

function xmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cents(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) fail(`${name} deve estar em centavos inteiros não negativos.`);
  return number;
}

function localNameElements(parent, localName) {
  const result = [];
  const nodes = parent && parent.childNodes ? parent.childNodes : [];
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node && node.nodeType === 1 && node.localName === localName) result.push(node);
  }
  return result;
}

function parseAndAssertXml(xml, expectedItemCount) {
  const errors = [];
  const doc = new DOMParser({
    onError: (level, message) => errors.push(`${level}:${message}`)
  }).parseFromString(xml, 'application/xml');
  if (errors.length || !doc || !doc.documentElement) fail(`XML gerado não pôde ser analisado: ${errors.join('; ')}`);
  const root = doc.documentElement;
  if (root.localName !== 'NFe' || root.namespaceURI !== NFE_NS) fail('Raiz do XML gerado não é NFe no namespace oficial.');
  const inf = localNameElements(root, 'infNFe');
  if (inf.length !== 1 || inf[0].getAttribute('versao') !== '4.00') fail('XML gerado não contém um único infNFe versão 4.00.');
  const det = localNameElements(inf[0], 'det');
  if (det.length !== expectedItemCount) fail('Quantidade de itens no XML diverge do snapshot.');
  if (localNameElements(root, 'Signature').length !== 0) fail('Gerador não assinado produziu Signature indevidamente.');
  if (localNameElements(root, 'infNFeSupl').length !== 0) fail('Etapa 30 não deve produzir infNFeSupl/QR Code.');
  return doc;
}

function normalizeDocumentInput(value) {
  const document = requiredObject(value, 'nfceDocument');
  const state = requiredText(document.state, 'nfceDocument.state', 64).toUpperCase();
  if (state !== 'ALLOCATED') fail(`nfceDocument deve estar ALLOCATED para geração inicial; recebido ${state}.`);
  let snapshot = document.inputSnapshot;
  if (snapshot == null && typeof document.inputSnapshotJson === 'string') {
    try { snapshot = JSON.parse(document.inputSnapshotJson); } catch (_) { fail('inputSnapshotJson inválido.'); }
  }
  snapshot = requiredObject(snapshot, 'inputSnapshot');
  if (Number(snapshot.schemaVersion) !== 1) fail('Versão do snapshot fiscal não suportada.');
  return { document, snapshot };
}

function validateIdentity(document, snapshot) {
  const fiscal = requiredObject(snapshot.fiscalIdentity, 'fiscalIdentity');
  const issuer = requiredObject(snapshot.issuer, 'issuer');
  if (String(fiscal.ambiente).toUpperCase() !== 'PRODUCAO' || String(document.ambiente).toUpperCase() !== 'PRODUCAO') {
    fail('Etapa 30 aceita somente PRODUÇÃO.');
  }
  if (Number(fiscal.modelo) !== 65 || Number(document.modelo) !== 65) fail('Etapa 30 aceita somente NFC-e modelo 65.');
  if (Number(fiscal.tpEmis) !== 9 || Number(document.tpEmis) !== 9) fail('Etapa 30 aceita somente tpEmis=9.');
  if (String(issuer.uf).toUpperCase() !== 'PA') fail('Etapa 30 aceita somente emitente do PA.');
  if (String(issuer.crt) !== '1') fail('Etapa 30 está limitada ao CRT=1.');
  const key = requiredText(fiscal.chaveAcesso, 'chaveAcesso', 44);
  if (!/^\d{44}$/.test(key)) fail('Etapa 30 aceita somente chave de acesso numérica com 44 dígitos.');
  if (String(document.chaveAcesso) !== key) fail('Chave de acesso do documento diverge do snapshot.');
  if (String(document.cnf) !== String(fiscal.cnf) || String(document.cdv) !== String(fiscal.cdv)) fail('cNF/cDV do documento divergem do snapshot.');
  if (String(document.serie) !== String(fiscal.serie) || Number(document.numero) !== Number(fiscal.numero)) fail('Série/número do documento divergem do snapshot.');
  if (String(document.dhEmi) !== String(fiscal.dhEmi) || String(document.dhCont) !== String(fiscal.dhCont)) fail('Datas fiscais do documento divergem do snapshot.');
  if (String(document.xJust) !== String(fiscal.xJust)) fail('Justificativa de contingência diverge do snapshot.');

  const cnpj = digits(issuer.cnpj);
  if (!/^\d{14}$/.test(cnpj)) fail('CNPJ do emitente deve conter 14 dígitos nesta etapa.');
  if (key.slice(6, 20) !== cnpj) fail('CNPJ do snapshot diverge da chave de acesso.');
  if (key.slice(0, 2) !== '15') fail('cUF da chave não corresponde ao Pará.');
  if (key.slice(20, 22) !== '65') fail('Modelo embutido na chave não é 65.');
  if (Number(key.slice(22, 25)) !== Number(fiscal.serie)) fail('Série embutida na chave diverge do snapshot.');
  if (Number(key.slice(25, 34)) !== Number(fiscal.numero)) fail('Número embutido na chave diverge do snapshot.');
  if (key.slice(34, 35) !== '9') fail('tpEmis embutido na chave não é 9.');
  if (key.slice(35, 43) !== String(fiscal.cnf)) fail('cNF embutido na chave diverge do snapshot.');
  if (key.slice(43) !== String(fiscal.cdv)) fail('cDV embutido na chave diverge do snapshot.');

  const dhEmi = formatPaDateTime(fiscal.dhEmi, 'dhEmi');
  const dhCont = formatPaDateTime(fiscal.dhCont, 'dhCont');
  if (key.slice(2, 6) !== aammFromFiscalDate(dhEmi)) {
    fail('AAMM da chave diverge de dhEmi no fuso do Pará; emissão deve ser revisada manualmente.');
  }
  const xJust = requiredText(fiscal.xJust, 'xJust', 256);
  if (xJust.length < 15) fail('xJust deve ter ao menos 15 caracteres.');
  return { fiscal, issuer, key, cnpj, dhEmi, dhCont, xJust };
}

function normalizeIssuer(issuer, cnpj) {
  const cMun = digits(issuer.codigoMunicipio);
  if (!/^15\d{5}$/.test(cMun)) fail('Código IBGE do município do emitente deve ser do PA e ter 7 dígitos.');
  const ie = digits(issuer.inscricaoEstadual);
  if (!/^\d{2,14}$/.test(ie)) fail('Inscrição Estadual do emitente inválida nesta etapa.');
  const cep = issuer.cep == null || issuer.cep === '' ? null : digits(issuer.cep);
  if (cep && !/^\d{8}$/.test(cep)) fail('CEP do emitente inválido.');
  return {
    cnpj,
    ie,
    xNome: requiredText(issuer.razaoSocial, 'razaoSocial', 60),
    xFant: optionalText(issuer.nomeFantasia, 60),
    xLgr: requiredText(issuer.logradouro, 'logradouro', 60),
    nro: requiredText(issuer.numero, 'numero', 60),
    xCpl: optionalText(issuer.complemento, 60),
    xBairro: requiredText(issuer.bairro, 'bairro', 60),
    cMun,
    xMun: requiredText(issuer.municipio, 'municipio', 60),
    uf: 'PA',
    cep
  };
}

function normalizeCustomer(customerValue) {
  if (customerValue == null) return null;
  const customer = requiredObject(customerValue, 'customer');
  const payload =
    customer.payload &&
    typeof customer.payload === 'object' &&
    !Array.isArray(customer.payload)
      ? customer.payload
      : {};
  const document = digits(
    customer.documento ||
    payload.cpf ||
    payload.cnpj
  );
  const name = optionalText(
    customer.nome ||
    payload.nomeCompleto ||
    payload.razaoSocial,
    60
  );

  if (/^\d{11}$/.test(document)) {
    return { type: 'CPF', document, name };
  }
  if (/^\d{14}$/.test(document)) {
    return { type: 'CNPJ', document, name };
  }
  fail('Documento do destinatário identificado deve conter CPF ou CNPJ válido.');
}

function buildDestXml(customer) {
  if (!customer) return '';
  return [
    '<dest>',
    customer.type === 'CPF'
      ? `<CPF>${customer.document}</CPF>`
      : `<CNPJ>${customer.document}</CNPJ>`,
    customer.name ? `<xNome>${xmlEscape(customer.name)}</xNome>` : '',
    '<indIEDest>9</indIEDest>',
    '</dest>'
  ].join('');
}

function normalizeRtc(payload, index, baseCents, requireRtc) {
  if (!requireRtc) return null;
  const rtc = payload.rtc && typeof payload.rtc === 'object' && !Array.isArray(payload.rtc) ? payload.rtc : {};
  const cst = requiredText(rtc.cst || rtc.CST || payload.cstIbsCbs, `item ${index}: CST IBS/CBS`, 3);
  const cClassTrib = requiredText(rtc.cClassTrib || payload.cClassTrib, `item ${index}: cClassTrib`, 6);
  if (cst !== '000' || cClassTrib !== '000001') {
    fail(`item ${index}: Etapa 30 suporta somente RTC padrão CST 000 / cClassTrib 000001; classificação específica não será inferida.`);
  }
  const pIBSUF = assertPercent(rtc.pIBSUF != null ? rtc.pIBSUF : payload.pIBSUF, 0.1, `item ${index}: pIBSUF`);
  const pIBSMun = assertPercent(rtc.pIBSMun != null ? rtc.pIBSMun : payload.pIBSMun, 0, `item ${index}: pIBSMun`);
  const pCBS = assertPercent(rtc.pCBS != null ? rtc.pCBS : payload.pCBS, 0.9, `item ${index}: pCBS`);
  const vIBSUFCents = percentOfCents(baseCents, pIBSUF);
  const vIBSMunCents = percentOfCents(baseCents, pIBSMun);
  const vCBSCents = percentOfCents(baseCents, pCBS);
  return {
    cst,
    cClassTrib,
    pIBSUF,
    pIBSMun,
    pCBS,
    vIBSUFCents,
    vIBSMunCents,
    vIBSCents: vIBSUFCents + vIBSMunCents,
    vCBSCents
  };
}

function normalizeItem(itemValue, index, requireRtc) {
  const item = requiredObject(itemValue, `items[${index - 1}]`);
  const payload = requiredObject(item.payload || {}, `item ${index}: payload`);
  const totalCentavos = cents(item.totalCentavos, `item ${index}: totalCentavos`);
  if (totalCentavos <= 0) fail(`item ${index}: total deve ser maior que zero.`);
  const unitPriceCentavos = cents(item.unitPriceCentavos, `item ${index}: unitPriceCentavos`);
  if (unitPriceCentavos <= 0) fail(`item ${index}: preço unitário deve ser maior que zero.`);
  const quantity = quantity4(item.quantidade, `item ${index}: quantidade`);
  const ncm = digits(payload.ncm);
  if (!/^\d{8}$/.test(ncm)) fail(`item ${index}: NCM deve conter 8 dígitos.`);
  const cest = payload.cest == null || payload.cest === '' ? null : digits(payload.cest);
  if (cest && !/^\d{7}$/.test(cest)) fail(`item ${index}: CEST deve conter 7 dígitos.`);
  const cfop = digits(payload.cfop);
  if (!/^\d{4}$/.test(cfop)) fail(`item ${index}: CFOP deve conter 4 dígitos.`);
  const origem = digits(payload.origem);
  if (!/^[0-8]$/.test(origem)) fail(`item ${index}: origem ICMS inválida.`);
  const csosn = digits(payload.csosn);
  if (!ALLOWED_CSOSN_NO_CREDIT.has(csosn)) fail(`item ${index}: CSOSN ${csosn || '(vazio)'} fora do subconjunto seguro da Etapa 30.`);
  const cstPis = digits(payload.cstPis).padStart(2, '0');
  const cstCofins = digits(payload.cstCofins).padStart(2, '0');
  if (!ALLOWED_PIS_COFINS_NT.has(cstPis) && cstPis !== '99') fail(`item ${index}: CST PIS fora do subconjunto suportado.`);
  if (!ALLOWED_PIS_COFINS_NT.has(cstCofins) && cstCofins !== '99') fail(`item ${index}: CST COFINS fora do subconjunto suportado.`);
  const pPis = cstPis === '99' ? percentage4(payload.aliquotaPis, `item ${index}: aliquotaPis`) : null;
  const pCofins = cstCofins === '99' ? percentage4(payload.aliquotaCofins, `item ${index}: aliquotaCofins`) : null;
  const vPisCents = pPis == null ? 0 : percentOfCents(totalCentavos, pPis);
  const vCofinsCents = pCofins == null ? 0 : percentOfCents(totalCentavos, pCofins);
  const code = requiredText(payload.productCode || item.produtoId, `item ${index}: cProd`, 60);
  const unit = requiredText(payload.unit || 'UN', `item ${index}: unidade`, 6).toUpperCase();
  const gtinDigits = digits(payload.gtin || payload.barcode);
  const cEAN = /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(gtinDigits) ? gtinDigits : 'SEM GTIN';
  const rtc = normalizeRtc(payload, index, totalCentavos, requireRtc);
  return {
    index,
    code,
    cEAN,
    xProd: requiredText(payload.name || code, `item ${index}: xProd`, 120),
    ncm,
    cest,
    cfop,
    unit,
    quantity,
    unitPriceCentavos,
    totalCentavos,
    origem,
    csosn,
    cstPis,
    cstCofins,
    pPis,
    pCofins,
    vPisCents,
    vCofinsCents,
    rtc
  };
}

function normalizePayments(snapshot, saleTotalCents) {
  const payment = requiredObject(snapshot.payment, 'payment');
  const parts = Array.isArray(payment.paymentParts) ? payment.paymentParts : [];
  if (!parts.length || parts.length > 100) {
    fail('A NFC-e deve possuir entre 1 e 100 parcelas de pagamento.');
  }

  const normalized = parts.map((rawPart, index) => {
    const part = requiredObject(rawPart, `paymentParts[${index}]`);
    const method = normalizePaymentMethodName(
      requiredText(
        part.method ||
        part.metodo ||
        part.paymentMethod,
        `paymentParts[${index}].method`,
        32
      )
    );
    const tPag = PAYMENT_CODE_BY_METHOD[method];
    if (!tPag) {
      fail(`Forma de pagamento ${method || '(vazia)'} não é suportada para NFC-e offline.`);
    }
    const amountCents = decimalMoneyToCents(
      part.amount != null ? part.amount : part.valor,
      `paymentParts[${index}].amount`
    );
    if (amountCents <= 0) {
      fail(`paymentParts[${index}].amount deve ser maior que zero.`);
    }
    return {
      method,
      tPag,
      amountCents,
      requiresCardGroup: PAYMENT_METHODS_WITH_CARD_GROUP.has(tPag)
    };
  });

  const totalPaidCents = normalized.reduce(
    (sum, part) => sum + part.amountCents,
    0
  );
  if (!Number.isSafeInteger(totalPaidCents)) {
    fail('Total dos pagamentos excede o limite monetário seguro.');
  }
  if (totalPaidCents !== saleTotalCents) {
    fail('Valor total dos pagamentos difere do total comercial da venda.');
  }
  return normalized;
}

function buildPaymentXml(payments) {
  return [
    '<pag>',
    payments.map((payment) => [
      '<detPag>',
      `<tPag>${payment.tPag}</tPag>`,
      `<vPag>${moneyFromCents(payment.amountCents)}</vPag>`,
      payment.requiresCardGroup
        ? '<card><tpIntegra>2</tpIntegra></card>'
        : '',
      '</detPag>'
    ].join('')).join(''),
    '</pag>'
  ].join('');
}

function buildEmitXml(issuer) {
  return [
    '<emit>',
    `<CNPJ>${issuer.cnpj}</CNPJ>`,
    `<xNome>${xmlEscape(issuer.xNome)}</xNome>`,
    issuer.xFant ? `<xFant>${xmlEscape(issuer.xFant)}</xFant>` : '',
    '<enderEmit>',
    `<xLgr>${xmlEscape(issuer.xLgr)}</xLgr>`,
    `<nro>${xmlEscape(issuer.nro)}</nro>`,
    issuer.xCpl ? `<xCpl>${xmlEscape(issuer.xCpl)}</xCpl>` : '',
    `<xBairro>${xmlEscape(issuer.xBairro)}</xBairro>`,
    `<cMun>${issuer.cMun}</cMun>`,
    `<xMun>${xmlEscape(issuer.xMun)}</xMun>`,
    '<UF>PA</UF>',
    issuer.cep ? `<CEP>${issuer.cep}</CEP>` : '',
    '<cPais>1058</cPais><xPais>BRASIL</xPais>',
    '</enderEmit>',
    `<IE>${issuer.ie}</IE>`,
    '<CRT>1</CRT>',
    '</emit>'
  ].join('');
}

function buildPisXml(item) {
  if (item.cstPis === '99') {
    return `<PIS><PISOutr><CST>99</CST><vBC>${moneyFromCents(item.totalCentavos)}</vBC><pPIS>${item.pPis}</pPIS><vPIS>${moneyFromCents(item.vPisCents)}</vPIS></PISOutr></PIS>`;
  }
  return `<PIS><PISNT><CST>${item.cstPis}</CST></PISNT></PIS>`;
}

function buildCofinsXml(item) {
  if (item.cstCofins === '99') {
    return `<COFINS><COFINSOutr><CST>99</CST><vBC>${moneyFromCents(item.totalCentavos)}</vBC><pCOFINS>${item.pCofins}</pCOFINS><vCOFINS>${moneyFromCents(item.vCofinsCents)}</vCOFINS></COFINSOutr></COFINS>`;
  }
  return `<COFINS><COFINSNT><CST>${item.cstCofins}</CST></COFINSNT></COFINS>`;
}

function buildRtcXml(item) {
  const r = item.rtc;
  if (!r) return '';
  return [
    '<IBSCBS>',
    `<CST>${r.cst}</CST><cClassTrib>${r.cClassTrib}</cClassTrib>`,
    '<gIBSCBS>',
    `<vBC>${moneyFromCents(item.totalCentavos)}</vBC>`,
    '<gIBSUF>',
    `<pIBSUF>${r.pIBSUF}</pIBSUF><vIBSUF>${moneyFromCents(r.vIBSUFCents)}</vIBSUF>`,
    '</gIBSUF>',
    '<gIBSMun>',
    `<pIBSMun>${r.pIBSMun}</pIBSMun><vIBSMun>${moneyFromCents(r.vIBSMunCents)}</vIBSMun>`,
    '</gIBSMun>',
    `<vIBS>${moneyFromCents(r.vIBSCents)}</vIBS>`,
    '<gCBS>',
    `<pCBS>${r.pCBS}</pCBS><vCBS>${moneyFromCents(r.vCBSCents)}</vCBS>`,
    '</gCBS>',
    '</gIBSCBS>',
    '</IBSCBS>'
  ].join('');
}

function buildItemXml(item) {
  return [
    `<det nItem="${item.index}">`,
    '<prod>',
    `<cProd>${xmlEscape(item.code)}</cProd>`,
    `<cEAN>${item.cEAN}</cEAN>`,
    `<xProd>${xmlEscape(item.xProd)}</xProd>`,
    `<NCM>${item.ncm}</NCM>`,
    item.cest ? `<CEST>${item.cest}</CEST>` : '',
    `<CFOP>${item.cfop}</CFOP>`,
    `<uCom>${xmlEscape(item.unit)}</uCom>`,
    `<qCom>${item.quantity}</qCom>`,
    `<vUnCom>${unitPriceFromCents(item.unitPriceCentavos)}</vUnCom>`,
    `<vProd>${moneyFromCents(item.totalCentavos)}</vProd>`,
    `<cEANTrib>${item.cEAN}</cEANTrib>`,
    `<uTrib>${xmlEscape(item.unit)}</uTrib>`,
    `<qTrib>${item.quantity}</qTrib>`,
    `<vUnTrib>${unitPriceFromCents(item.unitPriceCentavos)}</vUnTrib>`,
    '<indTot>1</indTot>',
    '</prod>',
    '<imposto>',
    '<ICMS><ICMSSN102>',
    `<orig>${item.origem}</orig><CSOSN>${item.csosn}</CSOSN>`,
    '</ICMSSN102></ICMS>',
    buildPisXml(item),
    buildCofinsXml(item),
    buildRtcXml(item),
    '</imposto>',
    item.rtc ? `<vItem>${moneyFromCents(item.totalCentavos)}</vItem>` : '',
    '</det>'
  ].join('');
}

function buildTotals(items, saleTotalCents) {
  const totals = items.reduce((acc, item) => {
    acc.vPISCents += item.vPisCents;
    acc.vCOFINSCents += item.vCofinsCents;
    acc.vNFTotCents += item.totalCentavos;
    if (item.rtc) {
      acc.rtcIncluded = true;
      acc.vBCIBSCBSCents += item.totalCentavos;
      acc.vIBSUFCents += item.rtc.vIBSUFCents;
      acc.vIBSMunCents += item.rtc.vIBSMunCents;
      acc.vIBSCents += item.rtc.vIBSCents;
      acc.vCBSCents += item.rtc.vCBSCents;
    }
    return acc;
  }, {
    rtcIncluded: false,
    vBCIBSCBSCents: 0,
    vPISCents: 0,
    vCOFINSCents: 0,
    vIBSUFCents: 0,
    vIBSMunCents: 0,
    vIBSCents: 0,
    vCBSCents: 0,
    vNFTotCents: 0
  });
  if (totals.vNFTotCents !== saleTotalCents) fail('Soma dos itens diverge do total comercial da venda.');
  return totals;
}

function buildTotalXml(saleTotalCents, totals) {
  const zero = '0.00';
  const rtcTotals = totals.rtcIncluded ? [
    '<IBSCBSTot>',
    `<vBCIBSCBS>${moneyFromCents(totals.vBCIBSCBSCents)}</vBCIBSCBS>`,
    '<gIBS>',
    '<gIBSUF>',
    `<vDif>${zero}</vDif><vDevTrib>${zero}</vDevTrib><vIBSUF>${moneyFromCents(totals.vIBSUFCents)}</vIBSUF>`,
    '</gIBSUF>',
    '<gIBSMun>',
    `<vDif>${zero}</vDif><vDevTrib>${zero}</vDevTrib><vIBSMun>${moneyFromCents(totals.vIBSMunCents)}</vIBSMun>`,
    '</gIBSMun>',
    `<vIBS>${moneyFromCents(totals.vIBSCents)}</vIBS><vCredPres>${zero}</vCredPres><vCredPresCondSus>${zero}</vCredPresCondSus>`,
    '</gIBS>',
    '<gCBS>',
    `<vCredPres>${zero}</vCredPres><vCredPresCondSus>${zero}</vCredPresCondSus><vDif>${zero}</vDif><vDevTrib>${zero}</vDevTrib><vCBS>${moneyFromCents(totals.vCBSCents)}</vCBS>`,
    '</gCBS>',
    '</IBSCBSTot>',
    `<vNFTot>${moneyFromCents(totals.vNFTotCents)}</vNFTot>`
  ].join('') : '';
  return [
    '<total>',
    '<ICMSTot>',
    `<vBC>${zero}</vBC><vICMS>${zero}</vICMS><vICMSDeson>${zero}</vICMSDeson><vFCP>${zero}</vFCP>`,
    `<vBCST>${zero}</vBCST><vST>${zero}</vST><vFCPST>${zero}</vFCPST><vFCPSTRet>${zero}</vFCPSTRet>`,
    `<vProd>${moneyFromCents(saleTotalCents)}</vProd><vFrete>${zero}</vFrete><vSeg>${zero}</vSeg><vDesc>${zero}</vDesc>`,
    `<vII>${zero}</vII><vIPI>${zero}</vIPI><vIPIDevol>${zero}</vIPIDevol><vPIS>${moneyFromCents(totals.vPISCents)}</vPIS><vCOFINS>${moneyFromCents(totals.vCOFINSCents)}</vCOFINS><vOutro>${zero}</vOutro>`,
    `<vNF>${moneyFromCents(saleTotalCents)}</vNF>`,
    '</ICMSTot>',
    rtcTotals,
    '</total>'
  ].join('');
}

function generateUnsignedNfceXml(nfceDocumentValue) {
  const { document, snapshot } = normalizeDocumentInput(nfceDocumentValue);
  const { fiscal, issuer: issuerRaw, key, cnpj, dhEmi, dhCont, xJust } = validateIdentity(document, snapshot);
  const issuer = normalizeIssuer(issuerRaw, cnpj);
  const customer = normalizeCustomer(snapshot.customer);
  const requireRtc = rtcRequiredForIssuerDate(issuerRaw, dhEmi);
  const sale = requiredObject(snapshot.sale, 'sale');
  const saleTotalCents = cents(sale.totalCentavos, 'sale.totalCentavos');
  if (saleTotalCents <= 0) fail('Total da venda deve ser maior que zero.');
  const itemValues = Array.isArray(snapshot.items) ? snapshot.items : [];
  if (!itemValues.length || itemValues.length > 990) fail('Snapshot deve conter entre 1 e 990 itens.');
  const items = itemValues.map((item, index) => normalizeItem(item, index + 1, requireRtc));
  const sumItems = items.reduce((sum, item) => sum + item.totalCentavos, 0);
  if (sumItems !== saleTotalCents) fail('Soma dos itens diverge de sale.totalCentavos.');
  const payments = normalizePayments(snapshot, saleTotalCents);
  const totals = buildTotals(items, saleTotalCents);

  const serie = Number(fiscal.serie);
  const numero = Number(fiscal.numero);
  if (!Number.isSafeInteger(serie) || serie < 0 || serie > 889) fail('Série fiscal inválida.');
  if (!Number.isSafeInteger(numero) || numero < 1 || numero > 999999999) fail('Número fiscal inválido.');
  const cMunFG = issuer.cMun;

  const ide = [
    '<ide>',
    '<cUF>15</cUF>',
    `<cNF>${xmlEscape(fiscal.cnf)}</cNF>`,
    '<natOp>VENDA</natOp>',
    '<mod>65</mod>',
    `<serie>${serie}</serie>`,
    `<nNF>${numero}</nNF>`,
    `<dhEmi>${dhEmi}</dhEmi>`,
    '<tpNF>1</tpNF><idDest>1</idDest>',
    `<cMunFG>${cMunFG}</cMunFG>`,
    '<tpImp>4</tpImp><tpEmis>9</tpEmis>',
    `<cDV>${xmlEscape(fiscal.cdv)}</cDV>`,
    '<tpAmb>1</tpAmb><finNFe>1</finNFe><indFinal>1</indFinal><indPres>1</indPres>',
    '<procEmi>0</procEmi>',
    `<verProc>${PROCESS_VERSION}</verProc>`,
    `<dhCont>${dhCont}</dhCont>`,
    `<xJust>${xmlEscape(xJust)}</xJust>`,
    '</ide>'
  ].join('');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<NFe xmlns="${NFE_NS}">`,
    `<infNFe versao="4.00" Id="NFe${key}">`,
    ide,
    buildEmitXml(issuer),
    buildDestXml(customer),
    items.map(buildItemXml).join(''),
    buildTotalXml(saleTotalCents, totals),
    '<transp><modFrete>9</modFrete></transp>',
    buildPaymentXml(payments),
    '</infNFe>',
    '</NFe>'
  ].join('');

  parseAndAssertXml(xml, items.length);
  return {
    xml,
    accessKey: key,
    infNFeId: `NFe${key}`,
    itemCount: items.length,
    specProfile: SPEC_PROFILE,
    totals: {
      vNF: moneyFromCents(saleTotalCents),
      vNFTot: moneyFromCents(totals.vNFTotCents),
      vBCIBSCBS: moneyFromCents(totals.vBCIBSCBSCents),
      vPIS: moneyFromCents(totals.vPISCents),
      vCOFINS: moneyFromCents(totals.vCOFINSCents),
      vIBSUF: moneyFromCents(totals.vIBSUFCents),
      vIBSMun: moneyFromCents(totals.vIBSMunCents),
      vIBS: moneyFromCents(totals.vIBSCents),
      vCBS: moneyFromCents(totals.vCBSCents),
      rtcIncluded: totals.rtcIncluded === true
    }
  };
}

module.exports = {
  NFE_NS,

  SPEC_PROFILE,
  generateUnsignedNfceXml
};
