'use strict';

const http = require('http');
const https = require('https');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const { loadFiscalA1Bundle } = require('./offline-fiscal-certificate-store');
const { getSvrsTrustAnchors } = require('./offline-fiscal-trust-anchors');

const NFE_NS = 'http://www.portalfiscal.inf.br/nfe';
const SOAP12_NS = 'http://www.w3.org/2003/05/soap-envelope';
const AUTH_WSDL_NS = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4';
const CONSULT_WSDL_NS = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsulta4';
const AUTH_ACTION = `${AUTH_WSDL_NS}/nfeAutorizacaoLote`;
const CONSULT_ACTION = `${CONSULT_WSDL_NS}/nfeConsultaNF`;
const DEFAULT_AUTHORIZATION_URL = 'https://nfce.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx';
const DEFAULT_CONSULTATION_URL = 'https://nfce.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx';
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const AUTHORIZED_CSTATS = new Set(['100', '150']);
const TEMPORARY_CSTATS = new Set(['108', '109']);

function requiredText(value, fieldName, maxLength = 8192) {
  const out = String(value == null ? '' : value).trim();
  if (!out || out.length > maxLength) throw new Error(`${fieldName} inválido.`);
  return out;
}

function xmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isLoopback(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

function normalizeEndpoint(value, official, allowInsecureLocalhost) {
  const raw = value == null || value === '' ? official : String(value).trim();
  let parsed;
  try { parsed = new URL(raw); } catch (_) { throw new Error('Endpoint fiscal inválido.'); }
  if (raw === official) return parsed;
  if (allowInsecureLocalhost === true && parsed.protocol === 'http:' && isLoopback(parsed.hostname)) return parsed;
  throw new Error('Endpoint fiscal customizado recusado; somente SVRS produção ou localhost de teste são permitidos.');
}

function elementChildren(node) {
  const result = [];
  const nodes = node && node.childNodes ? node.childNodes : [];
  for (let i = 0; i < nodes.length; i += 1) {
    const item = nodes[i];
    if (item && item.nodeType === 1) result.push(item);
  }
  return result;
}

function child(node, localName, namespace = null) {
  const list = elementChildren(node).filter((item) =>
    item.localName === localName && (namespace == null || item.namespaceURI === namespace));
  if (list.length !== 1) throw new Error(`Resposta fiscal deve conter exatamente um ${localName}.`);
  return list[0];
}

function optionalChild(node, localName, namespace = null) {
  const list = elementChildren(node).filter((item) =>
    item.localName === localName && (namespace == null || item.namespaceURI === namespace));
  if (list.length > 1) throw new Error(`Resposta fiscal contém ${localName} duplicado.`);
  return list.length ? list[0] : null;
}

function childText(node, localName, namespace = null, maxLength = 4096) {
  return requiredText(child(node, localName, namespace).textContent, localName, maxLength);
}

function parseXml(xmlText, label) {
  const source = requiredText(xmlText, label, MAX_RESPONSE_BYTES);
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error(`${label} contém DTD/ENTITY não permitido.`);
  const errors = [];
  const doc = new DOMParser({ onError: (level, message) => errors.push(`${level}:${message}`) })
    .parseFromString(source, 'application/xml');
  if (errors.length || !doc || !doc.documentElement) {
    throw new Error(`${label} XML inválido: ${errors.join('; ')}`);
  }
  return doc;
}

function validateFinalNfe(xmlValue, chaveAcesso) {
  const xml = requiredText(xmlValue, 'xml', 4 * 1024 * 1024);
  const doc = parseXml(xml, 'XML NFC-e final');
  const root = doc.documentElement;
  if (root.localName !== 'NFe' || root.namespaceURI !== NFE_NS) {
    throw new Error('XML final deve possuir raiz NFe oficial.');
  }
  const inf = elementChildren(root).filter((item) => item.localName === 'infNFe' && item.namespaceURI === NFE_NS);
  if (inf.length !== 1 || inf[0].getAttribute('Id') !== `NFe${chaveAcesso}`) {
    throw new Error('XML final diverge da chave de acesso informada.');
  }
  return xml.replace(/^\s*<\?xml[^>]*\?>\s*/i, '');
}

function soapEnvelope(wsdlNamespace, messageXml) {
  return `<soap12:Envelope xmlns:soap12="${SOAP12_NS}"><soap12:Body><nfeDadosMsg xmlns="${wsdlNamespace}">${messageXml}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;
}

function authorizationMessage(xml, chaveAcesso) {
  const nfe = validateFinalNfe(xml, chaveAcesso);
  const idLote = String(chaveAcesso).slice(-15).replace(/^0+/, '') || '1';
  return `<enviNFe xmlns="${NFE_NS}" versao="4.00"><idLote>${idLote}</idLote><indSinc>1</indSinc>${nfe}</enviNFe>`;
}

function consultationMessage(chaveAcesso) {
  return `<consSitNFe xmlns="${NFE_NS}" versao="4.00"><tpAmb>1</tpAmb><xServ>CONSULTAR</xServ><chNFe>${xmlEscape(chaveAcesso)}</chNFe></consSitNFe>`;
}

function findDescendant(root, localName) {
  const all = root.getElementsByTagName('*');
  const result = [];
  for (let i = 0; i < all.length; i += 1) {
    if (all[i].localName === localName) result.push(all[i]);
  }
  if (result.length !== 1) throw new Error(`SOAP deve conter exatamente um ${localName}.`);
  return result[0];
}

function parseSoapPayload(body, expectedLocalName) {
  const doc = parseXml(body, 'Resposta SOAP');
  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i += 1) {
    if (all[i].localName === 'Fault') {
      throw new Error(`SVRS retornou SOAP Fault: ${String(all[i].textContent || '').trim().slice(0, 500)}`);
    }
  }
  const result = findDescendant(doc.documentElement, 'nfeResultMsg');
  const payloads = elementChildren(result).filter((item) => item.localName === expectedLocalName && item.namespaceURI === NFE_NS);
  if (payloads.length !== 1) throw new Error(`nfeResultMsg não contém ${expectedLocalName} único.`);
  return payloads[0];
}

function protocolResult(protNode, expectedKey, originalXml) {
  const inf = child(protNode, 'infProt', NFE_NS);
  const cStat = childText(inf, 'cStat', NFE_NS, 16);
  const xMotivo = childText(inf, 'xMotivo', NFE_NS, 1024);
  const chNFe = childText(inf, 'chNFe', NFE_NS, 44);
  if (chNFe !== expectedKey) {
    return { kind: 'CONFLICT', cStat, xMotivo: 'Protocolo retornado para chave divergente.' };
  }
  if (AUTHORIZED_CSTATS.has(cStat)) {
    const protocolo = childText(inf, 'nProt', NFE_NS, 64);
    const autorizadoEm = childText(inf, 'dhRecbto', NFE_NS, 64);
    const nfe = validateFinalNfe(originalXml, expectedKey);
    const protXml = new XMLSerializer().serializeToString(protNode);
    const processedXml = `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="${NFE_NS}" versao="4.00">${nfe}${protXml}</nfeProc>`;
    return { kind: 'AUTHORIZED', protocolo, cStat, xMotivo, autorizadoEm, processedXml };
  }
  if (cStat === '204') {
    return { kind: 'AMBIGUOUS', cStat, xMotivo, error: 'Duplicidade retornada; reconciliar pela chave antes de qualquer decisão.' };
  }
  if (cStat === '539') return { kind: 'CONFLICT', cStat, xMotivo };
  return { kind: 'REJECTED', cStat, xMotivo };
}

function parseAuthorizationResponse(body, expectedKey, originalXml) {
  const ret = parseSoapPayload(body, 'retEnviNFe');
  if (childText(ret, 'tpAmb', NFE_NS, 4) !== '1') {
    return { kind: 'CONFLICT', error: 'SVRS respondeu ambiente diferente de PRODUÇÃO.' };
  }
  const cStat = childText(ret, 'cStat', NFE_NS, 16);
  const xMotivo = childText(ret, 'xMotivo', NFE_NS, 1024);
  if (cStat === '104') {
    const prot = optionalChild(ret, 'protNFe', NFE_NS);
    if (!prot) return { kind: 'AMBIGUOUS', cStat, xMotivo, error: 'Lote processado sem protNFe.' };
    return protocolResult(prot, expectedKey, originalXml);
  }
  if (TEMPORARY_CSTATS.has(cStat)) return { kind: 'NOT_SENT', cStat, xMotivo, error: xMotivo };
  if (cStat === '103') {
    return { kind: 'AMBIGUOUS', cStat, xMotivo, error: 'Resposta síncrona retornou recibo; reconciliar pela chave.' };
  }
  if (cStat === '204') return { kind: 'AMBIGUOUS', cStat, xMotivo, error: 'Duplicidade; reconciliar pela chave.' };
  if (cStat === '539') return { kind: 'CONFLICT', cStat, xMotivo };
  return { kind: 'REJECTED', cStat, xMotivo };
}

function parseConsultationResponse(body, expectedKey, originalXml) {
  const ret = parseSoapPayload(body, 'retConsSitNFe');
  if (childText(ret, 'tpAmb', NFE_NS, 4) !== '1') {
    return { kind: 'CONFLICT', error: 'Consulta retornou ambiente diferente de PRODUÇÃO.' };
  }
  const cStat = childText(ret, 'cStat', NFE_NS, 16);
  const xMotivo = childText(ret, 'xMotivo', NFE_NS, 1024);
  if (AUTHORIZED_CSTATS.has(cStat)) {
    const prot = optionalChild(ret, 'protNFe', NFE_NS);
    if (!prot) return { kind: 'CONFLICT', cStat, xMotivo, error: 'Consulta autorizada sem protNFe.' };
    return protocolResult(prot, expectedKey, originalXml);
  }
  if (cStat === '217') {
    // Permite apenas reenvio idempotente do mesmo XML final; o worker fixa e confere seu SHA-256.
    return { kind: 'NOT_FOUND', cStat, xMotivo, safeToRetransmit: true, error: xMotivo };
  }
  if (TEMPORARY_CSTATS.has(cStat)) return { kind: 'RETRY', cStat, xMotivo, error: xMotivo };
  return { kind: 'CONFLICT', cStat, xMotivo, error: `Consulta por chave retornou estado não tratado automaticamente: ${cStat}.` };
}

function requestSoap(options) {
  const body = Buffer.from(options.body, 'utf8');
  const timeoutMs = Math.max(1000, Math.min(Number(options.timeoutMs || 30000), 120000));
  const useHttps = options.endpoint.protocol === 'https:';
  let certificate = null;
  if (useHttps) {
    certificate = loadFiscalA1Bundle({
      userDataDir: options.userDataDir,
      safeStorage: options.safeStorage,
      empresaId: options.empresaId,
      deviceId: options.deviceId
    });
    if (!certificate) {
      body.fill(0);
      throw new Error('A1 local não está provisionado para conexão mTLS com a SVRS.');
    }
  }
  const requestModule = useHttps ? https : http;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      body.fill(0);
      if (certificate && certificate.pfxBuffer) certificate.pfxBuffer.fill(0);
      fn(value);
    };
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': `application/soap+xml; charset=utf-8; action="${options.action}"`,
        'Content-Length': body.length,
        Accept: 'application/soap+xml, application/xml, text/xml'
      }
    };
    if (useHttps) {
      requestOptions.pfx = certificate.pfxBuffer;
      requestOptions.passphrase = certificate.passphrase;
      requestOptions.minVersion = 'TLSv1.2';
      requestOptions.rejectUnauthorized = true;
      requestOptions.ca = getSvrsTrustAnchors();
    }
    const req = requestModule.request(options.endpoint, requestOptions, (res) => {
      const chunks = [];
      let total = 0;
      res.on('data', (chunk) => {
        total += chunk.length;
        if (total > MAX_RESPONSE_BYTES) {
          req.destroy(new Error('Resposta SOAP excede o limite seguro.'));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      res.on('end', () => {
        if (settled) return;
        const response = Buffer.concat(chunks);
        for (const chunk of chunks) chunk.fill(0);
        const status = Number(res.statusCode || 0);
        const responseText = response.toString('utf8');
        response.fill(0);
        if (status < 200 || status >= 300) {
          finish(reject, new Error(`SVRS HTTP ${status || 'sem status'}.`));
          return;
        }
        finish(resolve, responseText);
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Timeout na comunicação SOAP com a SVRS.')));
    req.on('error', (error) => finish(reject, error));
    req.end(body);
  });
}

function validateCommon(input) {
  const ambiente = requiredText(input.ambiente, 'ambiente', 32).toUpperCase();
  if (ambiente !== 'PRODUCAO') throw new Error('Transporte SVRS desta etapa aceita somente PRODUÇÃO.');
  if (Number(input.modelo) !== 65) throw new Error('Transporte SVRS desta etapa aceita somente modelo 65.');
  const chaveAcesso = requiredText(input.chaveAcesso, 'chaveAcesso', 44);
  if (!/^\d{44}$/.test(chaveAcesso)) throw new Error('chaveAcesso inválida.');
  return chaveAcesso;
}

function createSvrsProductionTransport(options = {}) {
  const allowLocal = options.allowInsecureLocalhost === true;
  const authorizationEndpoint = normalizeEndpoint(options.authorizationUrl, DEFAULT_AUTHORIZATION_URL, allowLocal);
  const consultationEndpoint = normalizeEndpoint(options.consultationUrl, DEFAULT_CONSULTATION_URL, allowLocal);
  const base = {
    empresaId: requiredText(options.empresaId, 'empresaId', 128),
    deviceId: requiredText(options.deviceId, 'deviceId', 128),
    userDataDir: options.userDataDir,
    safeStorage: options.safeStorage,
    timeoutMs: options.timeoutMs
  };
  return {
    async transmit(input = {}) {
      const chave = validateCommon(input);
      const xml = requiredText(input.xml, 'xml', 4 * 1024 * 1024);
      const response = await requestSoap({
        ...base,
        endpoint: authorizationEndpoint,
        action: AUTH_ACTION,
        body: soapEnvelope(AUTH_WSDL_NS, authorizationMessage(xml, chave))
      });
      return parseAuthorizationResponse(response, chave, xml);
    },
    async reconcileByKey(input = {}) {
      const chave = validateCommon(input);
      const xml = requiredText(input.xml, 'xml', 4 * 1024 * 1024);
      validateFinalNfe(xml, chave);
      const response = await requestSoap({
        ...base,
        endpoint: consultationEndpoint,
        action: CONSULT_ACTION,
        body: soapEnvelope(CONSULT_WSDL_NS, consultationMessage(chave))
      });
      return parseConsultationResponse(response, chave, xml);
    }
  };
}

module.exports = {
  DEFAULT_AUTHORIZATION_URL,
  DEFAULT_CONSULTATION_URL,
  AUTH_ACTION,
  CONSULT_ACTION,
  authorizationMessage,
  consultationMessage,
  parseAuthorizationResponse,
  parseConsultationResponse,
  createSvrsProductionTransport
};
