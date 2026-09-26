'use strict';

const https = require('https');
const { URL } = require('url');

const DEFAULT_PAIR_ENDPOINT = 'https://api.e-fisco.app/sync/device/pair';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 128 * 1024;

function requiredText(value, fieldName) {
  const text = String(value == null ? '' : value).trim();
  if (!text) throw new Error(`${fieldName} é obrigatório.`);
  return text;
}

function normalizeDeviceId(value) {
  const text = requiredText(value, 'deviceId');
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(text)) {
    throw new Error('deviceId inválido.');
  }
  return text;
}

function normalizePairingCode(value) {
  const text = requiredText(value, 'pairingCode');
  if (text.length < 16 || text.length > 128) {
    throw new Error('Código de pareamento inválido.');
  }
  return text;
}

function validateEndpoint(endpoint) {
  const url = new URL(requiredText(endpoint, 'endpoint'));
  if (url.protocol !== 'https:') {
    throw new Error('Endpoint de pareamento deve usar HTTPS.');
  }
  return url;
}

function requestDevicePairing(input = {}) {
  const endpoint = validateEndpoint(input.endpoint || DEFAULT_PAIR_ENDPOINT);
  const deviceId = normalizeDeviceId(input.deviceId);
  const pairingCode = normalizePairingCode(input.pairingCode);
  const timeoutMs = Number.isFinite(Number(input.timeoutMs)) && Number(input.timeoutMs) > 0
    ? Math.min(Math.floor(Number(input.timeoutMs)), 60_000)
    : DEFAULT_TIMEOUT_MS;

  const payload = Buffer.from(JSON.stringify({ deviceId, pairingCode }), 'utf8');

  return new Promise((resolve, reject) => {
    const req = https.request(endpoint, {
      method: 'POST',
      timeout: timeoutMs,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        accept: 'application/json',
        'content-length': String(payload.length),
        'user-agent': 'e-fisco-desktop-pairing/1'
      }
    }, (res) => {
      const chunks = [];
      let total = 0;

      res.on('data', (chunk) => {
        total += chunk.length;
        if (total > MAX_RESPONSE_BYTES) {
          req.destroy(new Error('Resposta de pareamento excedeu o limite seguro.'));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        const statusCode = Number(res.statusCode || 0);
        const text = Buffer.concat(chunks).toString('utf8').trim();
        let body = {};
        try {
          body = text ? JSON.parse(text) : {};
        } catch (_) {
          reject(new Error(`Servidor de pareamento retornou JSON inválido (HTTP ${statusCode}).`));
          return;
        }

        if (statusCode !== 200 || String(body.status || '').toUpperCase() !== 'PAIRED') {
          reject(new Error(String(body.erro || body.error || `Pareamento recusado (HTTP ${statusCode}).`)));
          return;
        }

        const returnedDeviceId = normalizeDeviceId(body.deviceId);
        if (returnedDeviceId !== deviceId) {
          reject(new Error('Servidor retornou deviceId diferente do device local.'));
          return;
        }

        const deviceToken = String(body.deviceToken || '').trim();
        if (deviceToken.length < 32 || deviceToken.length > 512) {
          reject(new Error('Servidor não retornou bearer de device válido.'));
          return;
        }

        resolve({
          status: 'PAIRED',
          deviceId: returnedDeviceId,
          empresaId: String(body.empresaId || '').trim() || null,
          deviceToken,
          expiresAt: body.expiresAt || null
        });
      });
    });

    req.on('timeout', () => req.destroy(new Error(`Timeout de pareamento após ${timeoutMs}ms.`)));
    req.on('error', reject);
    req.end(payload);
  });
}

module.exports = {
  DEFAULT_PAIR_ENDPOINT,
  requestDevicePairing,
  normalizePairingCode
};
