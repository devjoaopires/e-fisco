'use strict';

const crypto = require('crypto');
const {
  getNfceDocumentBySaleId,
  persistSignedNfceContingency
} = require('./offline-db');
const {
  generateUnsignedNfceXml
} = require('./offline-fiscal-nfce-xml');
const {
  signNfeXmlFromLocalA1
} = require('./offline-fiscal-xml-signer');

function requiredText(value, fieldName, maxLength = 4096) {
  const text = String(value == null ? '' : value).trim();
  if (!text || text.length > maxLength) {
    throw new Error(`${fieldName} inválido.`);
  }
  return text;
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

function validatePersistedSignedDocument(document) {
  const hasXml = Buffer.isBuffer(document && document.signedXml);
  const hasHash = Boolean(document && document.signedXmlSha256);
  if (!hasXml && !hasHash) return null;
  if (!hasXml || !hasHash) {
    throw new Error('Documento NFC-e possui persistência parcial do XML assinado; revisão manual necessária.');
  }
  const storedHash = String(document.signedXmlSha256).trim().toUpperCase();
  const recomputed = sha256Hex(document.signedXml);
  if (!/^[0-9A-F]{64}$/.test(storedHash) || storedHash !== recomputed) {
    throw new Error('Hash do XML assinado persistido não confere; revisão manual necessária.');
  }
  if (String(document.state) !== 'CONTINGENCIA_PENDENTE') {
    throw new Error(`Documento com XML assinado está em estado incompatível: ${String(document.state)}.`);
  }
  return {
    applied: false,
    duplicate: true,
    fiscalId: document.fiscalId,
    saleId: document.saleId,
    state: 'CONTINGENCIA_PENDENTE',
    chaveAcesso: document.chaveAcesso,
    signedXmlSha256: storedHash
  };
}

function finalizeNfceContingencySigning(options = {}) {
  const empresaId = requiredText(options.empresaId, 'empresaId', 128);
  const saleId = requiredText(options.saleId, 'saleId', 256);
  const document = getNfceDocumentBySaleId(empresaId, saleId);
  if (!document) {
    throw new Error('Documento NFC-e ALLOCATED não foi encontrado para a venda.');
  }

  const persisted = validatePersistedSignedDocument(document);
  if (persisted) return persisted;

  if (String(document.state) !== 'ALLOCATED') {
    throw new Error(`Documento NFC-e não está ALLOCATED; recebido ${String(document.state)}.`);
  }
  if (document.qrCodeText != null) {
    throw new Error('Documento ALLOCATED já possui QR Code inesperado; revisão manual necessária.');
  }

  const deviceId = requiredText(options.deviceId, 'deviceId', 128);
  const userDataDir = requiredText(options.userDataDir, 'userDataDir', 4096);
  if (!options.safeStorage) {
    throw new Error('safeStorage é obrigatório para assinar a NFC-e com o A1 local.');
  }

  const generated = generateUnsignedNfceXml(document);
  if (generated.accessKey !== document.chaveAcesso) {
    throw new Error('Gerador XML retornou chave diferente do documento fiscal alocado.');
  }

  const signed = signNfeXmlFromLocalA1({
    xml: generated.xml,
    userDataDir,
    safeStorage: options.safeStorage,
    empresaId,
    deviceId,
    now: options.now
  });

  if (signed.accessKey !== document.chaveAcesso || signed.infNFeId !== `NFe${document.chaveAcesso}`) {
    throw new Error('Assinatura XML retornou identidade fiscal diferente da NFC-e alocada.');
  }

  const signedBuffer = Buffer.from(signed.signedXml, 'utf8');
  let signedXmlSha256;
  try {
    signedXmlSha256 = sha256Hex(signedBuffer);
  } finally {
    signedBuffer.fill(0);
  }

  const stored = persistSignedNfceContingency({
    empresaId,
    saleId,
    signedXml: signed.signedXml
  });

  if (stored.signedXmlSha256 !== signedXmlSha256) {
    throw new Error('Hash persistido do XML assinado diverge do hash calculado antes da gravação.');
  }
  if (stored.chaveAcesso !== document.chaveAcesso) {
    throw new Error('Persistência do XML assinado retornou chave fiscal divergente.');
  }

  return {
    applied: stored.applied === true,
    duplicate: stored.duplicate === true,
    fiscalId: stored.fiscalId,
    saleId,
    state: stored.state,
    chaveAcesso: stored.chaveAcesso,
    signedXmlSha256: stored.signedXmlSha256,
    certificateFingerprintSha256: signed.certificateFingerprintSha256,
    certificateValidFrom: signed.certificateValidFrom,
    certificateValidTo: signed.certificateValidTo,
    specProfile: generated.specProfile
  };
}

module.exports = {
  validatePersistedSignedDocument,
  finalizeNfceContingencySigning
};
