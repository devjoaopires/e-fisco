'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('infraestrutura unitária carrega node:test em CommonJS', () => {
  assert.equal(typeof test, 'function');
  assert.equal(typeof assert.equal, 'function');
  assert.equal(2 + 2, 4);
});
