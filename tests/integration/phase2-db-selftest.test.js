'use strict';

const test = require('node:test');

const {
  runPhase2DbSelfTest
} = require('../../phase2-db-selftest');

test('self-test reconstruído da Fase 2: SQLite schema 13 e rollback atômico', async () => {
  await runPhase2DbSelfTest();
});
