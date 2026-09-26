'use strict';



const crypto = require('crypto');

const {

  DEFAULT_SYNC_FISCAL_CERTIFICATE_PROVISION_URL,

  postAuthenticatedDeviceJson

} = require('./offline-sync-http-transport');

const { storeFiscalA1Bundle } = require('./offline-fiscal-certificate-store');



const PROVISION_FORMAT_VERSION = 1;

const PROVISION_ALGORITHM = 'aes-256-gcm+rsa-oaep-sha256';

const PROVISION_MAGIC = Buffer.from('EFAP1', 'ascii');

const MAX_PFX_BYTES = 5 * 1024 * 1024;

const MAX_PROVISION_RESPONSE_BYTES = 8 * 1024 * 1024;



function requiredText(value, fieldName, maxLength = 8192) {

  const text = String(value == null ? '' : value).trim();

  if (!text || text.length > maxLength) throw new Error(`${fieldName} inválido.`);

  return text;

}



function decodeBase64(value, fieldName, maxBytes) {

  const text = requiredText(value, fieldName, Math.ceil(maxBytes / 3) * 4 + 16);

  if (text.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) {

    throw new Error(`${fieldName} não está em Base64 canônico.`);

  }

  const buffer = Buffer.from(text, 'base64');

  if (buffer.length < 1 || buffer.length > maxBytes || buffer.toString('base64') !== text) {

    buffer.fill(0);

    throw new Error(`${fieldName} inválido.`);

  }

  return buffer;

}



function decodeProvisionPlain(plain) {

  if (!Buffer.isBuffer(plain) || plain.length < PROVISION_MAGIC.length || !plain.subarray(0, PROVISION_MAGIC.length).equals(PROVISION_MAGIC)) {

    throw new Error('Envelope A1 descriptografado inválido.');

  }

  let offset = PROVISION_MAGIC.length;

  const fields = [];

  try {

    for (let index = 0; index < 5; index += 1) {

      if (offset + 4 > plain.length) throw new Error('Envelope A1 truncado.');

      const length = plain.readUInt32BE(offset);

      offset += 4;

      if (length > MAX_PFX_BYTES + 8192 || offset + length > plain.length) {

        throw new Error('Campo inválido no envelope A1.');

      }

      fields.push(Buffer.from(plain.subarray(offset, offset + length)));

      offset += length;

    }

    if (offset !== plain.length) throw new Error('Envelope A1 contém bytes inesperados.');

    if (fields[4].length < 1 || fields[4].length > MAX_PFX_BYTES) throw new Error('PFX/P12 inválido no envelope A1.');

    return {

      empresaId: fields[0].toString('utf8'),

      deviceId: fields[1].toString('utf8'),

      certificateId: fields[2].toString('utf8'),

      passphrase: fields[3].toString('utf8'),

      pfxBuffer: Buffer.from(fields[4])

    };

  } finally {

    for (const field of fields) field.fill(0);

  }

}



async function provisionFiscalA1FromServer(options = {}) {

  const deviceId = requiredText(options.deviceId, 'deviceId', 128);

  const deviceToken = requiredText(options.deviceToken, 'deviceToken', 512);

  const empresaId = requiredText(options.empresaId, 'empresaId', 128);

  const endpoint = options.endpoint || DEFAULT_SYNC_FISCAL_CERTIFICATE_PROVISION_URL;



  const keyPair = crypto.generateKeyPairSync('rsa', {

    modulusLength: 2048,

    publicExponent: 0x10001

  });

  const publicKeyPem = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();



  const response = await postAuthenticatedDeviceJson({

    endpoint,

    deviceId,

    deviceToken,

    payload: { publicKeyPem },

    timeoutMs: options.timeoutMs || 30_000,

    maxResponseBytes: MAX_PROVISION_RESPONSE_BYTES,

    allowInsecureLocalhost: options.allowInsecureLocalhost === true

  });



  if (String(response.status || '').trim().toUpperCase() !== 'OK') {

    throw new Error('Servidor retornou status inválido no provisionamento A1.');

  }

  if (response.available !== true) return { available: false, stored: false };



  const certificate = response.certificate && typeof response.certificate === 'object' ? response.certificate : null;

  const envelope = response.envelope && typeof response.envelope === 'object' ? response.envelope : null;

  if (!certificate || !envelope) throw new Error('Servidor não retornou envelope A1 válido.');



  const certificateId = requiredText(certificate.certificateId, 'certificateId', 128);

  if (

    Number(envelope.formatVersion) !== PROVISION_FORMAT_VERSION ||

    String(envelope.algorithm || '') !== PROVISION_ALGORITHM ||

    String(envelope.keyWrap || '') !== 'RSA-OAEP-SHA256' ||

    String(envelope.certificateId || '') !== certificateId

  ) {

    throw new Error('Formato do envelope A1 não suportado.');

  }



  const wrappedKey = decodeBase64(envelope.wrappedKey, 'wrappedKey', 1024);

  const iv = decodeBase64(envelope.iv, 'iv', 64);

  const authTag = decodeBase64(envelope.authTag, 'authTag', 64);

  const cipherText = decodeBase64(envelope.cipherText, 'cipherText', MAX_PFX_BYTES + 16384);

  const aad = Buffer.from(`e-fisco:a1-provision:v1:${empresaId}:${deviceId}:${certificateId}`, 'utf8');

  let dataKey = null;

  let plain = null;

  let decoded = null;



  try {

    if (iv.length !== 12 || authTag.length !== 16) throw new Error('Parâmetros criptográficos do envelope A1 inválidos.');

    dataKey = crypto.privateDecrypt({

      key: keyPair.privateKey,

      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,

      oaepHash: 'sha256'

    }, wrappedKey);

    if (dataKey.length !== 32) throw new Error('Chave de sessão do envelope A1 inválida.');



    const decipher = crypto.createDecipheriv('aes-256-gcm', dataKey, iv);

    decipher.setAAD(aad);

    decipher.setAuthTag(authTag);

    plain = Buffer.concat([decipher.update(cipherText), decipher.final()]);

    decoded = decodeProvisionPlain(plain);



    if (decoded.empresaId !== empresaId || decoded.deviceId !== deviceId || decoded.certificateId !== certificateId) {

      throw new Error('Envelope A1 não pertence à identidade autenticada local.');

    }



    const stored = storeFiscalA1Bundle({

      userDataDir: options.userDataDir,

      safeStorage: options.safeStorage,

      empresaId,

      deviceId,

      certificateId,

      pfxBuffer: decoded.pfxBuffer,

      passphrase: decoded.passphrase,

      fingerprintSha256: certificate.fingerprintSha256,

      validFrom: certificate.validFrom,

      validTo: certificate.validTo

    });



    return {

      available: true,

      stored: stored && stored.stored === true,

      certificateId,

      fingerprintSha256: certificate.fingerprintSha256 == null ? null : String(certificate.fingerprintSha256),

      validFrom: certificate.validFrom == null ? null : String(certificate.validFrom),

      validTo: certificate.validTo == null ? null : String(certificate.validTo)

    };

  } finally {

    wrappedKey.fill(0);

    iv.fill(0);

    authTag.fill(0);

    cipherText.fill(0);

    aad.fill(0);

    if (dataKey) dataKey.fill(0);

    if (plain) plain.fill(0);

    if (decoded && Buffer.isBuffer(decoded.pfxBuffer)) decoded.pfxBuffer.fill(0);

  }

}



module.exports = {

  MAX_PROVISION_RESPONSE_BYTES,

  provisionFiscalA1FromServer

};

