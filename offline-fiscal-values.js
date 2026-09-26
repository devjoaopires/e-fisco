'use strict';

const crypto = require('crypto');

const QR_VERSION = '3';
const INTENT_KEY_PREFIX = 'fiscal.numberLease.intent.v1:';
const FISCAL_NUMBER_INTENT_VERSION = 1;
const DEFAULT_REFILL_THRESHOLD = 15;
const DEFAULT_RESERVE_QUANTITY = 50;
const DEFAULT_RETRY_INTERVAL_MS = 60_000;

function fail(message) {
  throw new Error(message);
}

function requiredText(value, name, maxLength = 256) {
  const text = String(value == null ? '' : value).trim();
  if (!text || text.length > maxLength) fail(`${name} inválido.`);
  return text;
}

function requiredNonEmptyText(value, fieldName) {
  const result = String(value == null ? '' : value).trim();
  if (!result) throw new Error(`${fieldName} é obrigatório.`);
  return result;
}

function digits(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}

function normalizePaymentMethodName(value) {
  return String(value == null ? '' : value)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function cents(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    fail(`${name} deve estar em centavos inteiros não negativos.`);
  }
  return number;
}

function moneyFromCents(value) {
  const number = cents(value, 'valor monetário');
  return `${Math.floor(number / 100)}.${String(number % 100).padStart(2, '0')}`;
}

function decimalMoneyToCents(value, name) {
  const raw = String(value == null ? '' : value).trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    fail(`${name} deve possuir no máximo duas casas decimais.`);
  }
  const [whole, frac = ''] = raw.split('.');
  const result = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result < 0) {
    fail(`${name} excede o limite seguro.`);
  }
  return result;
}

function quantity4(value, name) {
  const raw = String(value == null ? '' : value).trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(raw)) fail(`${name} inválida.`);
  const [whole, frac = ''] = raw.split('.');
  const trimmed = frac.replace(/0+$/, '');
  if (trimmed.length > 4) {
    fail(`${name} possui mais de quatro casas significativas; não será arredondada silenciosamente.`);
  }
  const normalized = trimmed ? `${whole}.${trimmed}` : whole;
  if (!(Number(normalized) > 0)) fail(`${name} deve ser maior que zero.`);
  return normalized;
}

function unitPriceFromCents(value) {
  return moneyFromCents(value);
}

function percentage4(value, name) {
  const raw = String(value == null ? '' : value).trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,4})?$/.test(raw)) {
    fail(`${name} deve possuir de zero a quatro casas decimais.`);
  }
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    fail(`${name} inválido.`);
  }
  return number.toFixed(4);
}

function assertPercent(value, expected, name) {
  const formatted = percentage4(value, name);
  if (Number(formatted) !== expected) {
    fail(`${name} deve ser ${expected.toFixed(4)}% no perfil RTC suportado nesta etapa.`);
  }
  return formatted;
}

function rtcRequiredForIssuerDate(issuer, dhEmi) {
  const crt = digits(issuer && issuer.crt);
  const match = String(dhEmi == null ? '' : dhEmi).match(/^(\d{4})-/);
  if (!match) fail('dhEmi não contém ano fiscal válido para decidir IBS/CBS.');
  const year = Number(match[1]);
  return !(crt === '1' && year < 2027);
}

function percentOfCents(baseCents, formattedPercent) {
  const rateUnits = BigInt(String(formattedPercent).replace('.', ''));
  const numerator = BigInt(baseCents) * rateUnits;
  const denominator = 1_000_000n;
  const rounded = (numerator + denominator / 2n) / denominator;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail('Tributo calculado excede o limite seguro.');
  }
  return Number(rounded);
}

function formatPaDateTime(value, name) {
  const raw = requiredText(value, name, 64);
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    fail(`${name} deve conter fuso horário explícito.`);
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) fail(`${name} inválido.`);
  const shifted = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const mi = String(shifted.getUTCMinutes()).padStart(2, '0');
  const ss = String(shifted.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`;
}

function aammFromFiscalDate(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})/);
  if (!match) fail('Data fiscal não contém AAAA-MM.');
  return `${match[1].slice(-2)}${match[2]}`;
}

function buildQrUrl(base, payloadWithSignature) {
  if (base.includes(']]>')) {
    throw new Error('URL base do QR Code contém sequência inválida para CDATA.');
  }
  if (/[?&]p=[^&]+/.test(base)) {
    throw new Error('urlQrCode já contém parâmetro p preenchido.');
  }
  if (/[?&]p=$/.test(base)) return `${base}${payloadWithSignature}`;
  if (base.endsWith('?') || base.endsWith('&')) {
    return `${base}p=${payloadWithSignature}`;
  }
  return `${base}${base.includes('?') ? '&' : '?'}p=${payloadWithSignature}`;
}

function qrPayloadParts(parsed) {
  return [
    parsed.accessKey,
    QR_VERSION,
    parsed.tpAmb,
    parsed.day,
    parsed.vNF,
    parsed.recipientType,
    parsed.recipientId
  ];
}

function fiscalNumberNamespaceKey(input) {
  const source = [
    requiredNonEmptyText(input.empresaId, 'empresaId'),
    requiredNonEmptyText(input.deviceId, 'deviceId'),
    'PRODUCAO',
    '65',
    requiredNonEmptyText(input.serie, 'serie')
  ].join('|');
  const digest = crypto
    .createHash('sha256')
    .update(source, 'utf8')
    .digest('hex')
    .slice(0, 32);
  return `${INTENT_KEY_PREFIX}${digest}`;
}

function normalizeFiscalNumberPolicy(options = {}) {
  const threshold = options.refillThreshold == null
    ? DEFAULT_REFILL_THRESHOLD
    : Number(options.refillThreshold);
  const quantity = options.reserveQuantity == null
    ? DEFAULT_RESERVE_QUANTITY
    : Number(options.reserveQuantity);
  const retryIntervalMs = options.retryIntervalMs == null
    ? DEFAULT_RETRY_INTERVAL_MS
    : Number(options.retryIntervalMs);

  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 200) {
    throw new Error('reserveQuantity deve ser inteiro entre 1 e 200.');
  }
  if (!Number.isSafeInteger(threshold) || threshold < 0 || threshold >= quantity) {
    throw new Error('refillThreshold deve ser inteiro >= 0 e menor que reserveQuantity.');
  }
  if (
    !Number.isSafeInteger(retryIntervalMs) ||
    retryIntervalMs < 0 ||
    retryIntervalMs > 24 * 60 * 60 * 1000
  ) {
    throw new Error('retryIntervalMs inválido.');
  }
  return { threshold, quantity, retryIntervalMs };
}

function normalizeFiscalNumberIntent(value, key, quantity) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Intenção local de reserva fiscal inválida; revisão necessária.');
  }
  if (
    Number(value.version) !== FISCAL_NUMBER_INTENT_VERSION ||
    String(value.namespaceKey || '') !== key
  ) {
    throw new Error(
      'Intenção local de reserva fiscal pertence a outro namespace; revisão necessária.'
    );
  }
  const requestId = requiredNonEmptyText(value.requestId, 'intent.requestId');
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(requestId)) {
    throw new Error('requestId da intenção fiscal é inválido.');
  }
  const storedQuantity = Number(value.quantity);
  if (
    !Number.isSafeInteger(storedQuantity) ||
    storedQuantity < 1 ||
    storedQuantity > 200
  ) {
    throw new Error('quantity da intenção fiscal é inválida.');
  }
  if (storedQuantity !== quantity) {
    throw new Error(
      'Política de quantidade mudou enquanto existe uma intenção fiscal pendente.'
    );
  }
  return {
    version: FISCAL_NUMBER_INTENT_VERSION,
    namespaceKey: key,
    requestId,
    quantity: storedQuantity,
    createdAt: requiredNonEmptyText(value.createdAt, 'intent.createdAt'),
    attempts:
      Number.isSafeInteger(Number(value.attempts)) && Number(value.attempts) >= 0
        ? Number(value.attempts)
        : 0,
    lastAttemptAt: value.lastAttemptAt ? String(value.lastAttemptAt) : null
  };
}

module.exports = {
  QR_VERSION,
  INTENT_KEY_PREFIX,
  FISCAL_NUMBER_INTENT_VERSION,
  DEFAULT_REFILL_THRESHOLD,
  DEFAULT_RESERVE_QUANTITY,
  DEFAULT_RETRY_INTERVAL_MS,
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
  aammFromFiscalDate,
  buildQrUrl,
  qrPayloadParts,
  fiscalNumberNamespaceKey,
  normalizeFiscalNumberPolicy,
  normalizeFiscalNumberIntent
};
