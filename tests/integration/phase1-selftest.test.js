'use strict';

const test = require('node:test');

const {
  runPhase1SelfTest
} = require('../../phase1-selftest');

test('self-test reconstruído da Fase 1: standby, ativação e rollback', async () => {
  await runPhase1SelfTest();
});
