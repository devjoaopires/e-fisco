'use strict';

const QUANTITY_SCALE = 1_000_000;

function moneyCentsFromDecimal(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${fieldName} deve ser um valor monetário válido.`);
  }
  const cents = Math.round((number + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`${fieldName} excede o limite monetário seguro.`);
  }
  return cents;
}

function quantitySnapshot(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${fieldName} deve ser maior que zero.`);
  }

  const micros = Math.round(number * QUANTITY_SCALE);
  if (!Number.isSafeInteger(micros) || micros <= 0) {
    throw new Error(`${fieldName} excede o limite seguro.`);
  }

  const whole = Math.floor(micros / QUANTITY_SCALE);
  const fraction = String(micros % QUANTITY_SCALE)
    .padStart(6, '0')
    .replace(/0+$/, '');

  return {
    micros,
    text: fraction ? `${whole}.${fraction}` : String(whole)
  };
}

function roundedLineTotalCentavos(quantityMicros, unitPriceCentavos) {
  const numerator =
    BigInt(quantityMicros) *
    BigInt(unitPriceCentavos);
  const scale = BigInt(QUANTITY_SCALE);
  const rounded =
    (numerator + (scale / 2n)) /
    scale;

  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Total do item excede o limite monetário seguro.');
  }

  return Number(rounded);
}

module.exports = {
  QUANTITY_SCALE,
  moneyCentsFromDecimal,
  quantitySnapshot,
  roundedLineTotalCentavos
};
