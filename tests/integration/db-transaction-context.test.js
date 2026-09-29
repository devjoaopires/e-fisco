'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

const {
  beginImmediateTransaction
} = require('../../offline-db/transaction');

function withMemoryDatabase(callback) {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE sample (
        id INTEGER PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
    `);
    return callback(db);
  } finally {
    db.close();
  }
}

test('transaction context faz COMMIT de uma escrita BEGIN IMMEDIATE', () => {
  withMemoryDatabase((db) => {
    const transaction = beginImmediateTransaction(db);

    assert.equal(transaction.active, true);

    db.prepare(
      'INSERT INTO sample (id, value) VALUES (?, ?)'
    ).run(1, 'persisted');

    assert.equal(transaction.commit(), true);
    assert.equal(transaction.active, false);

    const row = db.prepare(
      'SELECT value FROM sample WHERE id = 1'
    ).get();

    assert.equal(String(row.value), 'persisted');
  });
});

test('transaction context faz ROLLBACK sem deixar escrita parcial', () => {
  withMemoryDatabase((db) => {
    const transaction = beginImmediateTransaction(db);

    db.prepare(
      'INSERT INTO sample (id, value) VALUES (?, ?)'
    ).run(1, 'rollback');

    assert.equal(transaction.rollback(), true);
    assert.equal(transaction.active, false);

    const row = db.prepare(
      'SELECT value FROM sample WHERE id = 1'
    ).get();

    assert.equal(row, undefined);
  });
});

test('transaction context finalizado não executa COMMIT/ROLLBACK duplicado', () => {
  withMemoryDatabase((db) => {
    const transaction = beginImmediateTransaction(db);

    assert.equal(transaction.commit(), true);
    assert.equal(transaction.commit(), false);
    assert.equal(transaction.rollback(), false);
    assert.equal(transaction.active, false);
  });
});
