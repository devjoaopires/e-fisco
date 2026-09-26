'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  decimalToCents,
  centsToValue
} = require('../../offline-cash-service');

const {
  moneyCentsFromDecimal,
  quantitySnapshot,
  roundedLineTotalCentavos
} = require('../../offline-sale-values');

test('decimalToCents converte valores monetários e corrige casos clássicos de ponto flutuante', () => {
  assert.equal(decimalToCents(0, 'valor'), 0);
  assert.equal(decimalToCents(1, 'valor'), 100);
  assert.equal(decimalToCents('12.34', 'valor'), 1234);
  assert.equal(decimalToCents(1.005, 'valor'), 101);
  assert.equal(decimalToCents(2.675, 'valor'), 268);
});

test('decimalToCents rejeita negativos por padrão, não finitos e estouro seguro', () => {
  assert.throws(() => decimalToCents(-0.01, 'valor'), /valor inválido/);
  assert.throws(() => decimalToCents(NaN, 'valor'), /valor inválido/);
  assert.throws(() => decimalToCents(Infinity, 'valor'), /valor inválido/);
  assert.throws(
    () => decimalToCents(Number.MAX_SAFE_INTEGER, 'valor'),
    /valor excede o limite seguro/
  );
});

test('decimalToCents mantém arredondamento simétrico quando negativos são permitidos', () => {
  assert.equal(decimalToCents(-12.34, 'ajuste', true), -1234);
  assert.equal(decimalToCents(-1.005, 'ajuste', true), -101);
  assert.equal(decimalToCents(1.005, 'ajuste', true), 101);
});

test('centsToValue converte centavos positivos, negativos e zero', () => {
  assert.equal(centsToValue(0), 0);
  assert.equal(centsToValue(1), 0.01);
  assert.equal(centsToValue(1234), 12.34);
  assert.equal(centsToValue(-1234), -12.34);
});

test('moneyCentsFromDecimal converte dinheiro com arredondamento para centavos', () => {
  assert.equal(moneyCentsFromDecimal(0, 'total'), 0);
  assert.equal(moneyCentsFromDecimal('19.90', 'total'), 1990);
  assert.equal(moneyCentsFromDecimal(1.005, 'total'), 101);
  assert.equal(moneyCentsFromDecimal(2.675, 'total'), 268);
});

test('moneyCentsFromDecimal rejeita negativos, não finitos e estouro monetário', () => {
  assert.throws(
    () => moneyCentsFromDecimal(-0.01, 'total'),
    /total deve ser um valor monetário válido/
  );
  assert.throws(
    () => moneyCentsFromDecimal(NaN, 'total'),
    /total deve ser um valor monetário válido/
  );
  assert.throws(
    () => moneyCentsFromDecimal(Infinity, 'total'),
    /total deve ser um valor monetário válido/
  );
  assert.throws(
    () => moneyCentsFromDecimal(Number.MAX_SAFE_INTEGER, 'total'),
    /total excede o limite monetário seguro/
  );
});

test('quantitySnapshot normaliza quantidades em microunidades e texto canônico', () => {
  assert.deepEqual(quantitySnapshot(1, 'quantidade'), {
    micros: 1000000,
    text: '1'
  });
  assert.deepEqual(quantitySnapshot(1.25, 'quantidade'), {
    micros: 1250000,
    text: '1.25'
  });
  assert.deepEqual(quantitySnapshot(0.000001, 'quantidade'), {
    micros: 1,
    text: '0.000001'
  });
});

test('quantitySnapshot arredonda deterministicamente para seis casas decimais', () => {
  assert.deepEqual(quantitySnapshot(1.2345674, 'quantidade'), {
    micros: 1234567,
    text: '1.234567'
  });
  assert.deepEqual(quantitySnapshot(1.2345675, 'quantidade'), {
    micros: 1234568,
    text: '1.234568'
  });
});

test('quantitySnapshot rejeita zero, negativos, não finitos, submicrounidade e estouro', () => {
  assert.throws(
    () => quantitySnapshot(0, 'quantidade'),
    /quantidade deve ser maior que zero/
  );
  assert.throws(
    () => quantitySnapshot(-1, 'quantidade'),
    /quantidade deve ser maior que zero/
  );
  assert.throws(
    () => quantitySnapshot(NaN, 'quantidade'),
    /quantidade deve ser maior que zero/
  );
  assert.throws(
    () => quantitySnapshot(0.0000004, 'quantidade'),
    /quantidade excede o limite seguro/
  );
  assert.throws(
    () => quantitySnapshot(Number.MAX_SAFE_INTEGER, 'quantidade'),
    /quantidade excede o limite seguro/
  );
});

test('roundedLineTotalCentavos arredonda metade de centavo para cima usando inteiros', () => {
  assert.equal(roundedLineTotalCentavos(1000000, 123), 123);
  assert.equal(roundedLineTotalCentavos(500000, 1), 1);
  assert.equal(roundedLineTotalCentavos(1500000, 1), 2);
  assert.equal(roundedLineTotalCentavos(333333, 3), 1);
});

test('roundedLineTotalCentavos rejeita total acima de Number.MAX_SAFE_INTEGER', () => {
  assert.throws(
    () => roundedLineTotalCentavos(2000000, Number.MAX_SAFE_INTEGER),
    /Total do item excede o limite monetário seguro/
  );
});

test('quantidade e preço usam a mesma regra monetária no total da linha', () => {
  const quantity = quantitySnapshot(1.5, 'quantidade');
  const unitPriceCentavos = moneyCentsFromDecimal(1.01, 'valor unitário');

  assert.equal(quantity.micros, 1500000);
  assert.equal(unitPriceCentavos, 101);
  assert.equal(
    roundedLineTotalCentavos(quantity.micros, unitPriceCentavos),
    152
  );
});
