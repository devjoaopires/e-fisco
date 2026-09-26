'use strict';

const crypto = require('crypto');
const { DOMParser } = require('@xmldom/xmldom');
const {
  getNfceDocumentBySaleId,
  persistNfceQrCode
} = require('./offline-db');
const {
  loadFiscalA1Bundle
} = require('./offline-fiscal-certificate-store');
const {
  extractPkcs12SigningMaterial,
  verifySignedNfeXml
} = require('./offline-fiscal-xml-signer');
const {
  QR_VERSION,
  buildQrUrl,
  qrPayloadParts
} = require('./offline-fiscal-values');

const NFE_NS = 'http://www.portalfiscal.inf.br/nfe';
const DSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';
const MAX_QR_LENGTH = 600;
const MIN_QR_LENGTH = 100;

function requiredText(value, fieldName, maxLength = 4096) {
  const text = String(value == null ? '' : value).trim();
  if (!text || text.length > maxLength) throw new Error(`${fieldName} inválido.`);
  return text;
}

function xmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function elementChildren(node) {
  const result = [];
  const nodes = node && node.childNodes ? node.childNodes : [];
  for (let index = 0; index < nodes.length; index += 1) {
    const child = nodes[index];
    if (child && child.nodeType === 1) result.push(child);
  }
  return result;
}

function descendantsByLocalName(node, localName, namespaceUri = null) {
  const all = node && typeof node.getElementsByTagName === 'function'
    ? node.getElementsByTagName('*')
    : [];
  const result = [];
  for (let index = 0; index < all.length; index += 1) {
    const item = all[index];
    if (item.localName !== localName) continue;
    if (namespaceUri != null && item.namespaceURI !== namespaceUri) continue;
    result.push(item);
  }
  return result;
}

function singleDescendant(node, localName, namespaceUri = NFE_NS) {
  const items = descendantsByLocalName(node, localName, namespaceUri);
  if (items.length !== 1) throw new Error(`XML assinado deve conter exatamente um ${localName}.`);
  return items[0];
}

function textOfSingle(node, localName, namespaceUri = NFE_NS) {
  return requiredText(singleDescendant(node, localName, namespaceUri).textContent, localName, 4096);
}

function parseSignedNfceDocument(document) {
  if (!document || typeof document !== 'object') throw new Error('Documento NFC-e inválido.');
  const state = String(document.state || '');
  if (!['CONTINGENCIA_PENDENTE', 'SENDING', 'RECONCILE_BY_KEY'].includes(state)) {
    throw new Error(
      `Documento NFC-e não está em estado seguro para reconstruir o mesmo XML; recebido ${state}.`
    );
  }
  if (!Buffer.isBuffer(document.signedXml) || !document.signedXml.length) {
    throw new Error('Documento NFC-e não possui signedXml persistido.');
  }
  const expectedHash = requiredText(document.signedXmlSha256, 'signedXmlSha256', 64).toUpperCase();
  const recomputedHash = crypto.createHash('sha256').update(document.signedXml).digest('hex').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(expectedHash) || recomputedHash !== expectedHash) {
    throw new Error('Hash do XML assinado persistido não confere; revisão manual necessária.');
  }
  const xml = document.signedXml.toString('utf8');
  const parserErrors = [];
  const doc = new DOMParser({
    onError: (level, message) => parserErrors.push(`${level}:${message}`)
  }).parseFromString(xml, 'application/xml');
  if (parserErrors.length || !doc || !doc.documentElement) {
    throw new Error(`XML assinado persistido é inválido: ${parserErrors.join('; ')}`);
  }
  const root = doc.documentElement;
  if (root.localName !== 'NFe' || root.namespaceURI !== NFE_NS) {
    throw new Error('XML assinado persistido não possui raiz NFe oficial.');
  }
  const infNFe = elementChildren(root).filter((item) => item.localName === 'infNFe' && item.namespaceURI === NFE_NS);
  const signatures = elementChildren(root).filter((item) => item.localName === 'Signature' && item.namespaceURI === DSIG_NS);
  const supl = elementChildren(root).filter((item) => item.localName === 'infNFeSupl' && item.namespaceURI === NFE_NS);
  if (infNFe.length !== 1 || signatures.length !== 1) {
    throw new Error('XML assinado deve conter exatamente um infNFe e uma Signature na raiz.');
  }
  if (supl.length !== 0) {
    throw new Error('signedXml imutável já contém infNFeSupl inesperado.');
  }
  const id = requiredText(infNFe[0].getAttribute('Id'), 'infNFe.Id', 64);
  const accessKey = id.startsWith('NFe') ? id.slice(3) : '';
  if (!/^\d{44}$/.test(accessKey) || accessKey !== String(document.chaveAcesso)) {
    throw new Error('Chave de acesso do XML assinado diverge do documento persistido.');
  }
  const tpAmb = textOfSingle(infNFe[0], 'tpAmb');
  const tpEmis = textOfSingle(infNFe[0], 'tpEmis');
  const dhEmi = textOfSingle(infNFe[0], 'dhEmi');
  const vNF = textOfSingle(infNFe[0], 'vNF');
  if (tpAmb !== '1') throw new Error('Etapa 32 aceita somente tpAmb=1 PRODUÇÃO.');
  if (tpEmis !== '9') throw new Error('QR Code offline v3 exige tpEmis=9 nesta etapa.');
  if (!/^\d{4}-\d{2}-(\d{2})T/.test(dhEmi)) throw new Error('dhEmi do XML assinado é inválido para o QR Code.');
  const day = dhEmi.slice(8, 10);
  if (!/^\d{1,12}\.\d{2}$/.test(vNF) || vNF.length > 15) {
    throw new Error('vNF do XML assinado é inválido para QR Code v3.');
  }

  const destNodes = elementChildren(infNFe[0]).filter((item) => item.localName === 'dest' && item.namespaceURI === NFE_NS);
  if (destNodes.length > 1) throw new Error('XML assinado possui mais de um destinatário.');
  let recipientType = '';
  let recipientId = '';
  if (destNodes.length === 1) {
    const dest = destNodes[0];
    const cnpj = elementChildren(dest).find((item) => item.localName === 'CNPJ' && item.namespaceURI === NFE_NS);
    const cpf = elementChildren(dest).find((item) => item.localName === 'CPF' && item.namespaceURI === NFE_NS);
    const foreign = elementChildren(dest).find((item) => item.localName === 'idEstrangeiro' && item.namespaceURI === NFE_NS);
    const found = [cnpj, cpf, foreign].filter(Boolean);
    if (found.length !== 1) throw new Error('Destinatário do XML não possui identificação única suportada pelo QR Code v3.');
    if (cnpj) {
      recipientType = '1';
      recipientId = requiredText(cnpj.textContent, 'CNPJ destinatário', 14).replace(/\D/g, '');
      if (!/^\d{14}$/.test(recipientId)) throw new Error('CNPJ destinatário inválido para QR Code v3.');
    } else if (cpf) {
      recipientType = '2';
      recipientId = requiredText(cpf.textContent, 'CPF destinatário', 11).replace(/\D/g, '');
      if (!/^\d{11}$/.test(recipientId)) throw new Error('CPF destinatário inválido para QR Code v3.');
    } else {
      recipientType = '3';
      requiredText(foreign.textContent, 'idEstrangeiro', 14);
      recipientId = '';
    }
  }

  const x509Nodes = descendantsByLocalName(signatures[0], 'X509Certificate', DSIG_NS);
  if (x509Nodes.length !== 1) throw new Error('XMLDSig deve conter exatamente um X509Certificate.');
  const certificateBase64 = String(x509Nodes[0].textContent || '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(certificateBase64)) {
    throw new Error('X509Certificate do XML assinado não está em Base64 válido.');
  }
  const certificateDer = Buffer.from(certificateBase64, 'base64');
  if (!certificateDer.length) throw new Error('X509Certificate do XML assinado está vazio.');
  const certificateFingerprintSha256 = crypto.createHash('sha256').update(certificateDer).digest('hex').toUpperCase();
  const publicCertPem = `-----BEGIN CERTIFICATE-----\n${certificateBase64.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
  certificateDer.fill(0);
  if (!verifySignedNfeXml({ xml, publicCert: publicCertPem })) {
    throw new Error('XMLDSig persistida não é válida antes da geração do QR Code.');
  }

  const issuer = document.inputSnapshot && document.inputSnapshot.issuer;
  if (!issuer || typeof issuer !== 'object') throw new Error('Snapshot fiscal não contém emitente.');
  const urlQrCode = normalizeUrl(requiredText(issuer.urlQrCode, 'issuer.urlQrCode', 512), 'urlQrCode');
  const urlConsultaChave = normalizeUrl(requiredText(issuer.urlConsultaChave, 'issuer.urlConsultaChave', 85), 'urlConsultaChave');
  if (urlConsultaChave.length < 21 || urlConsultaChave.length > 85) {
    throw new Error('urlConsultaChave deve conter entre 21 e 85 caracteres.');
  }

  return {
    xml,
    doc,
    root,
    infNFe: infNFe[0],
    signature: signatures[0],
    accessKey,
    tpAmb,
    day,
    vNF,
    recipientType,
    recipientId,
    certificateFingerprintSha256,
    publicCertPem,
    urlQrCode,
    urlConsultaChave
  };
}

function normalizeUrl(value, fieldName) {
  let parsed;
  try { parsed = new URL(value); } catch (_) { throw new Error(`${fieldName} inválida.`); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${fieldName} deve usar HTTP ou HTTPS.`);
  if (parsed.username || parsed.password || parsed.hash) throw new Error(`${fieldName} contém componentes não permitidos.`);
  return value;
}

function validateQrTextAgainstSignedXml(qrCodeTextValue, parsed) {
  const qrCodeText = requiredText(qrCodeTextValue, 'qrCodeText', MAX_QR_LENGTH);
  if (qrCodeText.length < MIN_QR_LENGTH || qrCodeText.length > MAX_QR_LENGTH) {
    throw new Error('QR Code v3 fora do tamanho permitido pelo leiaute.');
  }
  try { new URL(qrCodeText); } catch (_) { throw new Error('QR Code persistido não é uma URL válida.'); }
  const queryIndex = qrCodeText.indexOf('?');
  if (queryIndex < 0) throw new Error('QR Code persistido não contém query string.');
  const query = qrCodeText.slice(queryIndex + 1).split('#', 1)[0];
  const pEntries = query.split('&').filter((entry) => entry.startsWith('p='));
  if (pEntries.length !== 1 || pEntries[0].length <= 2) {
    throw new Error('QR Code persistido deve conter exatamente um parâmetro p.');
  }
  const p = pEntries[0].slice(2);
  const parts = p.split('|');
  if (parts.length !== 8) throw new Error('QR Code v3 offline deve conter exatamente 8 parâmetros.');
  const expected = qrPayloadParts(parsed);
  for (let index = 0; index < 7; index += 1) {
    if (parts[index] !== expected[index]) {
      throw new Error(`Parâmetro ${index + 1} do QR Code diverge do XML assinado.`);
    }
  }
  const signatureBase64 = parts[7];
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signatureBase64)) throw new Error('Assinatura Base64 do QR Code é inválida.');
  const signature = Buffer.from(signatureBase64, 'base64');
  const source = Buffer.from(expected.join('|'), 'utf8');
  try {
    const valid = crypto.verify('RSA-SHA1', source, parsed.publicCertPem, signature);
    if (!valid) throw new Error('Assinatura RSA-SHA1 do QR Code não confere com o certificado da XMLDSig.');
  } finally {
    signature.fill(0);
    source.fill(0);
  }
  return { qrCodeText, signatureBase64 };
}

function generateQrCodeV3FromLocalA1(options = {}) {
  const parsed = options.parsed || parseSignedNfceDocument(options.document);
  const empresaId = requiredText(options.empresaId, 'empresaId', 128);
  const deviceId = requiredText(options.deviceId, 'deviceId', 128);
  const userDataDir = requiredText(options.userDataDir, 'userDataDir', 4096);
  if (!options.safeStorage) throw new Error('safeStorage é obrigatório para assinar o QR Code.');

  const loaded = loadFiscalA1Bundle({
    userDataDir,
    safeStorage: options.safeStorage,
    empresaId,
    deviceId
  });
  if (!loaded) throw new Error('Certificado A1 local não está provisionado para gerar QR Code.');
  let material = null;
  try {
    material = extractPkcs12SigningMaterial({
      pfxBuffer: loaded.pfxBuffer,
      passphrase: loaded.passphrase,
      now: options.now
    });
    if (material.fingerprintSha256 !== parsed.certificateFingerprintSha256) {
      throw new Error('A1 local diverge do certificado que assinou o XML persistido; QR Code não será gerado.');
    }
    const firstSeven = qrPayloadParts(parsed).join('|');
    const source = Buffer.from(firstSeven, 'utf8');
    let signature = null;
    try {
      signature = crypto.sign('RSA-SHA1', source, material.privateKeyPem);
      const qrCodeText = buildQrUrl(parsed.urlQrCode, `${firstSeven}|${signature.toString('base64')}`);
      validateQrTextAgainstSignedXml(qrCodeText, parsed);
      return {
        qrCodeText,
        version: 3,
        certificateFingerprintSha256: material.fingerprintSha256
      };
    } finally {
      source.fill(0);
      if (signature) signature.fill(0);
    }
  } finally {
    loaded.pfxBuffer.fill(0);
    if (material) {
      material.privateKeyPem.fill(0);
      material.certificatePem.fill(0);
    }
  }
}

function buildInfNFeSuplXml(parsed, qrCodeTextValue) {
  const validated = validateQrTextAgainstSignedXml(qrCodeTextValue, parsed);
  if (validated.qrCodeText.includes(']]>')) throw new Error('QR Code contém sequência inválida para CDATA.');
  return `<infNFeSupl><qrCode><![CDATA[${validated.qrCodeText}]]></qrCode><urlChave>${xmlEscape(parsed.urlConsultaChave)}</urlChave></infNFeSupl>`;
}

function buildNfceXmlWithSupplement(document) {
  const parsed = parseSignedNfceDocument(document);
  const qrCodeText = requiredText(document.qrCodeText, 'qrCodeText', MAX_QR_LENGTH);
  const supplement = buildInfNFeSuplXml(parsed, qrCodeText);
  const signatureMatch = /<(?:[A-Za-z_][\w.-]*:)?Signature\b[^>]*xmlns(?:\:[A-Za-z_][\w.-]*)?=["']http:\/\/www\.w3\.org\/2000\/09\/xmldsig#["'][^>]*>/.exec(parsed.xml);
  const fallbackMatch = /<(?:[A-Za-z_][\w.-]*:)?Signature\b/.exec(parsed.xml);
  const match = signatureMatch || fallbackMatch;
  if (!match || match.index < 1) throw new Error('Não foi possível localizar Signature para inserir infNFeSupl.');
  const finalXml = `${parsed.xml.slice(0, match.index)}${supplement}${parsed.xml.slice(match.index)}`;
  const errors = [];
  const finalDoc = new DOMParser({ onError: (level, message) => errors.push(`${level}:${message}`) })
    .parseFromString(finalXml, 'application/xml');
  if (errors.length || !finalDoc || !finalDoc.documentElement) throw new Error('XML final com infNFeSupl é inválido.');
  const children = elementChildren(finalDoc.documentElement);
  const infIndex = children.findIndex((item) => item.localName === 'infNFe' && item.namespaceURI === NFE_NS);
  const suplIndex = children.findIndex((item) => item.localName === 'infNFeSupl' && item.namespaceURI === NFE_NS);
  const sigIndex = children.findIndex((item) => item.localName === 'Signature' && item.namespaceURI === DSIG_NS);
  if (infIndex < 0 || suplIndex !== infIndex + 1 || sigIndex !== suplIndex + 1) {
    throw new Error('Ordem XML final deve ser infNFe, infNFeSupl, Signature.');
  }
  if (!verifySignedNfeXml({ xml: finalXml, publicCert: parsed.publicCertPem })) {
    throw new Error('XMLDSig deixou de ser válida após inclusão de infNFeSupl.');
  }
  return {
    xml: finalXml,
    sha256: crypto.createHash('sha256').update(Buffer.from(finalXml, 'utf8')).digest('hex').toUpperCase(),
    qrCodeText,
    urlChave: parsed.urlConsultaChave
  };
}

function finalizeNfceContingencyQrCode(options = {}) {
  const empresaId = requiredText(options.empresaId, 'empresaId', 128);
  const saleId = requiredText(options.saleId, 'saleId', 256);
  const document = getNfceDocumentBySaleId(empresaId, saleId);
  if (!document) throw new Error('Documento NFC-e não encontrado para gerar QR Code.');
  const parsed = parseSignedNfceDocument(document);

  if (document.qrCodeText != null) {
    validateQrTextAgainstSignedXml(document.qrCodeText, parsed);
    const final = buildNfceXmlWithSupplement(document);
    return {
      applied: false,
      duplicate: true,
      fiscalId: document.fiscalId,
      saleId,
      state: document.state,
      chaveAcesso: document.chaveAcesso,
      qrCodeText: document.qrCodeText,
      finalXml: final.xml,
      finalXmlSha256: final.sha256
    };
  }

  const generated = generateQrCodeV3FromLocalA1({
    parsed,
    document,
    empresaId,
    deviceId: options.deviceId,
    userDataDir: options.userDataDir,
    safeStorage: options.safeStorage,
    now: options.now
  });
  const stored = persistNfceQrCode({
    empresaId,
    saleId,
    qrCodeText: generated.qrCodeText
  });
  const refreshed = getNfceDocumentBySaleId(empresaId, saleId);
  const final = buildNfceXmlWithSupplement(refreshed);
  return {
    applied: stored.applied === true,
    duplicate: stored.duplicate === true,
    fiscalId: stored.fiscalId,
    saleId,
    state: stored.state,
    chaveAcesso: stored.chaveAcesso,
    qrCodeText: stored.qrCodeText,
    finalXml: final.xml,
    finalXmlSha256: final.sha256,
    certificateFingerprintSha256: generated.certificateFingerprintSha256
  };
}

module.exports = {
  QR_VERSION,
  parseSignedNfceDocument,
  validateQrTextAgainstSignedXml,
  generateQrCodeV3FromLocalA1,
  buildInfNFeSuplXml,
  buildNfceXmlWithSupplement,
  finalizeNfceContingencyQrCode
};
