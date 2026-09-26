'use strict';

const crypto = require('crypto');
const forge = require('node-forge');
const { DOMParser } = require('@xmldom/xmldom');
const { SignedXml } = require('xml-crypto');
const { loadFiscalA1Bundle } = require('./offline-fiscal-certificate-store');

const NFE_NAMESPACE = 'http://www.portalfiscal.inf.br/nfe';
const DSIG_NAMESPACE = 'http://www.w3.org/2000/09/xmldsig#';
const C14N_10 = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const ENVELOPED_SIGNATURE = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const RSA_SHA1 = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
const SHA1 = 'http://www.w3.org/2000/09/xmldsig#sha1';
const MAX_XML_BYTES = 2 * 1024 * 1024;
const MAX_PFX_BYTES = 5 * 1024 * 1024;

function requiredText(value, fieldName, maxLength = 8192) {
  const text = String(value == null ? '' : value).trim();
  if (!text || text.length > maxLength) throw new Error(`${fieldName} inválido.`);
  return text;
}

function parseXml(xml) {
  const source = String(xml == null ? '' : xml);
  const bytes = Buffer.byteLength(source, 'utf8');
  if (!source || bytes < 1 || bytes > MAX_XML_BYTES) {
    throw new Error('XML da NF-e vazio ou acima do limite seguro.');
  }
  let doc;
  try {
    doc = new DOMParser().parseFromString(source, 'application/xml');
  } catch (error) {
    throw new Error(`XML da NF-e inválido: ${String(error && error.message || error)}`);
  }
  if (!doc || !doc.documentElement) throw new Error('XML da NF-e sem elemento raiz.');
  const parserErrors = doc.getElementsByTagName('parsererror');
  if (parserErrors && parserErrors.length) throw new Error('XML da NF-e contém erro de parsing.');
  return { source, doc };
}

function directElementChildren(node) {
  const result = [];
  if (!node || !node.childNodes) return result;
  for (let index = 0; index < node.childNodes.length; index += 1) {
    const child = node.childNodes[index];
    if (child && child.nodeType === 1) result.push(child);
  }
  return result;
}

function findElements(node, localName, namespaceURI) {
  const result = [];
  const visit = (current) => {
    if (!current) return;
    if (
      current.nodeType === 1 &&
      current.localName === localName &&
      current.namespaceURI === namespaceURI
    ) result.push(current);
    if (!current.childNodes) return;
    for (let index = 0; index < current.childNodes.length; index += 1) {
      visit(current.childNodes[index]);
    }
  };
  visit(node);
  return result;
}

function inspectUnsignedNfe(xml) {
  const parsed = parseXml(xml);
  const root = parsed.doc.documentElement;
  if (root.localName !== 'NFe' || root.namespaceURI !== NFE_NAMESPACE) {
    throw new Error('XML deve possuir NFe como raiz no namespace oficial da NF-e.');
  }
  const children = directElementChildren(root);
  const infNodes = children.filter((node) => node.localName === 'infNFe' && node.namespaceURI === NFE_NAMESPACE);
  if (infNodes.length !== 1) throw new Error('XML deve possuir exatamente um infNFe filho direto de NFe.');
  const signatures = findElements(parsed.doc, 'Signature', DSIG_NAMESPACE);
  if (signatures.length !== 0) throw new Error('XML já contém Signature; re-assinatura foi recusada.');
  const id = String(infNodes[0].getAttribute('Id') || '').trim();
  if (!/^NFe[A-Za-z0-9]{44}$/.test(id)) {
    throw new Error('Id de infNFe deve usar o formato NFe + 44 caracteres alfanuméricos.');
  }
  return { ...parsed, root, infNFe: infNodes[0], id };
}

function bagList(p12, bagType) {
  const result = p12.getBags({ bagType });
  return result && Array.isArray(result[bagType]) ? result[bagType] : [];
}

function rsaKeysMatch(privateKey, publicKey) {
  return Boolean(
    privateKey && publicKey &&
    privateKey.n && privateKey.e && publicKey.n && publicKey.e &&
    privateKey.n.compareTo(publicKey.n) === 0 &&
    privateKey.e.compareTo(publicKey.e) === 0
  );
}

function extractPkcs12SigningMaterial(options = {}) {
  if (!Buffer.isBuffer(options.pfxBuffer) || options.pfxBuffer.length < 1 || options.pfxBuffer.length > MAX_PFX_BYTES) {
    throw new Error('PFX/P12 inválido ou acima do limite seguro.');
  }
  const passphrase = String(options.passphrase == null ? '' : options.passphrase);
  let p12;
  try {
    const binary = options.pfxBuffer.toString('binary');
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(binary));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, passphrase);
  } catch (_) {
    throw new Error('PFX/P12 inválido ou senha do certificado incorreta.');
  }

  const keyBags = [
    ...bagList(p12, forge.pki.oids.pkcs8ShroudedKeyBag),
    ...bagList(p12, forge.pki.oids.keyBag)
  ].filter((bag) => bag && bag.key);
  const certBags = bagList(p12, forge.pki.oids.certBag).filter((bag) => bag && bag.cert);
  if (!keyBags.length) throw new Error('PFX/P12 não contém chave privada.');
  if (!certBags.length) throw new Error('PFX/P12 não contém certificado X.509.');

  const matches = [];
  const seen = new Set();
  for (const keyBag of keyBags) {
    for (const certBag of certBags) {
      if (!rsaKeysMatch(keyBag.key, certBag.cert.publicKey)) continue;
      const derBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(certBag.cert)).getBytes();
      const der = Buffer.from(derBytes, 'binary');
      const fingerprint = crypto.createHash('sha256').update(der).digest('hex').toUpperCase();
      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        matches.push({ key: keyBag.key, cert: certBag.cert, der, fingerprint });
      } else {
        der.fill(0);
      }
    }
  }
  if (matches.length !== 1) {
    for (const match of matches) match.der.fill(0);
    throw new Error(matches.length === 0
      ? 'Nenhum certificado do PFX/P12 corresponde à chave privada RSA.'
      : 'PFX/P12 contém mais de um par certificado/chave privada utilizável.');
  }

  const selected = matches[0];
  const notBefore = selected.cert.validity && selected.cert.validity.notBefore;
  const notAfter = selected.cert.validity && selected.cert.validity.notAfter;
  const now = options.now instanceof Date ? options.now : new Date();
  if (!(notBefore instanceof Date) || !(notAfter instanceof Date) || now < notBefore || now >= notAfter) {
    selected.der.fill(0);
    throw new Error('Certificado A1 não está dentro do período de validade.');
  }

  let privateKeyPem;
  let certificatePem;
  try {
    privateKeyPem = Buffer.from(forge.pki.privateKeyToPem(selected.key), 'utf8');
    certificatePem = Buffer.from(forge.pki.certificateToPem(selected.cert), 'utf8');
    return {
      privateKeyPem,
      certificatePem,
      certificateBase64: selected.der.toString('base64'),
      fingerprintSha256: selected.fingerprint,
      validFrom: notBefore.toISOString(),
      validTo: notAfter.toISOString()
    };
  } finally {
    selected.der.fill(0);
  }
}

function assertSignedShape(signedXml, expectedId) {
  const { doc } = parseXml(signedXml);
  const root = doc.documentElement;
  if (root.localName !== 'NFe' || root.namespaceURI !== NFE_NAMESPACE) {
    throw new Error('XML assinado perdeu a raiz NFe esperada.');
  }
  const children = directElementChildren(root);
  const infIndex = children.findIndex((node) => node.localName === 'infNFe' && node.namespaceURI === NFE_NAMESPACE);
  const sigIndex = children.findIndex((node) => node.localName === 'Signature' && node.namespaceURI === DSIG_NAMESPACE);
  if (infIndex < 0 || sigIndex !== infIndex + 1) {
    throw new Error('Signature não foi inserida imediatamente após infNFe.');
  }
  const signatures = findElements(doc, 'Signature', DSIG_NAMESPACE);
  if (signatures.length !== 1) throw new Error('XML assinado deve possuir exatamente uma Signature.');
  const signature = signatures[0];
  const references = findElements(signature, 'Reference', DSIG_NAMESPACE);
  if (references.length !== 1 || String(references[0].getAttribute('URI') || '') !== `#${expectedId}`) {
    throw new Error('Reference XMLDSig não aponta para o infNFe esperado.');
  }
  const c14n = findElements(signature, 'CanonicalizationMethod', DSIG_NAMESPACE);
  const sigMethod = findElements(signature, 'SignatureMethod', DSIG_NAMESPACE);
  const digestMethod = findElements(signature, 'DigestMethod', DSIG_NAMESPACE);
  const transforms = findElements(signature, 'Transform', DSIG_NAMESPACE);
  const x509 = findElements(signature, 'X509Certificate', DSIG_NAMESPACE);
  if (c14n.length !== 1 || c14n[0].getAttribute('Algorithm') !== C14N_10) throw new Error('CanonicalizationMethod divergente do perfil NF-e.');
  if (sigMethod.length !== 1 || sigMethod[0].getAttribute('Algorithm') !== RSA_SHA1) throw new Error('SignatureMethod divergente do perfil NF-e.');
  if (digestMethod.length !== 1 || digestMethod[0].getAttribute('Algorithm') !== SHA1) throw new Error('DigestMethod divergente do perfil NF-e.');
  const transformAlgorithms = transforms.map((node) => String(node.getAttribute('Algorithm') || ''));
  if (transformAlgorithms.length !== 2 || transformAlgorithms[0] !== ENVELOPED_SIGNATURE || transformAlgorithms[1] !== C14N_10) {
    throw new Error('Transforms XMLDSig divergentes do perfil NF-e.');
  }
  if (x509.length !== 1 || !String(x509[0].textContent || '').replace(/\s+/g, '')) {
    throw new Error('X509Certificate final não foi incluído na assinatura.');
  }
  return { doc, signature };
}

function verifySignedNfeXml(options = {}) {
  const xml = requiredText(options.xml, 'xml', MAX_XML_BYTES);
  const publicCert = options.publicCert;
  if (!publicCert) throw new Error('publicCert é obrigatório para verificar XML assinado.');
  const { doc } = parseXml(xml);
  const signatures = findElements(doc, 'Signature', DSIG_NAMESPACE);
  if (signatures.length !== 1) return false;
  const verifier = new SignedXml({
    publicCert,
    getCertFromKeyInfo: () => null,
    implicitTransforms: []
  });
  verifier.loadSignature(signatures[0]);
  const valid = verifier.checkSignature(xml);
  if (!valid) return false;
  const signedReferences = verifier.getSignedReferences();
  return Array.isArray(signedReferences) && signedReferences.length === 1;
}

function signNfeXmlWithPkcs12(options = {}) {
  const inspected = inspectUnsignedNfe(options.xml);
  const material = extractPkcs12SigningMaterial({
    pfxBuffer: options.pfxBuffer,
    passphrase: options.passphrase,
    now: options.now
  });
  try {
    const signer = new SignedXml({
      idAttribute: 'Id',
      privateKey: material.privateKeyPem,
      publicCert: material.certificatePem,
      getKeyInfoContent: () => `<X509Data><X509Certificate>${material.certificateBase64}</X509Certificate></X509Data>`
    });
    signer.addReference({
      xpath: "/*[local-name(.)='NFe' and namespace-uri(.)='http://www.portalfiscal.inf.br/nfe']/*[local-name(.)='infNFe' and namespace-uri(.)='http://www.portalfiscal.inf.br/nfe']",
      transforms: [ENVELOPED_SIGNATURE, C14N_10],
      digestAlgorithm: SHA1
    });
    signer.canonicalizationAlgorithm = C14N_10;
    signer.signatureAlgorithm = RSA_SHA1;
    signer.computeSignature(inspected.source, {
      location: {
        reference: "/*[local-name(.)='NFe' and namespace-uri(.)='http://www.portalfiscal.inf.br/nfe']/*[local-name(.)='infNFe' and namespace-uri(.)='http://www.portalfiscal.inf.br/nfe']",
        action: 'after'
      }
    });
    const signedXml = signer.getSignedXml();
    assertSignedShape(signedXml, inspected.id);
    if (!verifySignedNfeXml({ xml: signedXml, publicCert: material.certificatePem })) {
      throw new Error('Autoverificação XMLDSig falhou após a assinatura.');
    }
    return {
      signedXml,
      infNFeId: inspected.id,
      accessKey: inspected.id.slice(3),
      certificateFingerprintSha256: material.fingerprintSha256,
      certificateValidFrom: material.validFrom,
      certificateValidTo: material.validTo,
      canonicalizationAlgorithm: C14N_10,
      signatureAlgorithm: RSA_SHA1,
      digestAlgorithm: SHA1
    };
  } finally {
    material.privateKeyPem.fill(0);
    material.certificatePem.fill(0);
  }
}

function signNfeXmlFromLocalA1(options = {}) {
  const empresaId = requiredText(options.empresaId, 'empresaId', 128);
  const deviceId = requiredText(options.deviceId, 'deviceId', 128);
  const loaded = loadFiscalA1Bundle({
    userDataDir: requiredText(options.userDataDir, 'userDataDir', 4096),
    safeStorage: options.safeStorage,
    empresaId,
    deviceId
  });
  if (!loaded) throw new Error('Certificado A1 local não está provisionado.');
  try {
    const result = signNfeXmlWithPkcs12({
      xml: options.xml,
      pfxBuffer: loaded.pfxBuffer,
      passphrase: loaded.passphrase,
      now: options.now
    });
    if (
      loaded.fingerprintSha256 &&
      result.certificateFingerprintSha256 !== String(loaded.fingerprintSha256).replace(/:/g, '').toUpperCase()
    ) {
      throw new Error('Fingerprint do PFX local diverge dos metadados provisionados.');
    }
    return result;
  } finally {
    loaded.pfxBuffer.fill(0);
  }
}

module.exports = {
  NFE_NAMESPACE,
  DSIG_NAMESPACE,
  C14N_10,
  ENVELOPED_SIGNATURE,
  RSA_SHA1,
  SHA1,
  extractPkcs12SigningMaterial,
  verifySignedNfeXml,
  signNfeXmlWithPkcs12,
  signNfeXmlFromLocalA1
};
