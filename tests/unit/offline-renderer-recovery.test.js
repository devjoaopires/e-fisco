'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createOfflineRendererRecoveryController
} = require('../../desktop/windows/offline-renderer-recovery');

test('renderer recovery tenta novamente e encerra ao recuperar', async () => {
  let clock = 0;
  const delays = [];
  const attempts = [];

  const controller =
    createOfflineRendererRecoveryController({
      retryDelaysMs: [
        10,
        20,
        30
      ],
      budgetWindowMs:
        1000,
      now() {
        return clock;
      },
      setTimeoutFn(
        resolve,
        delayMs
      ) {
        delays.push(
          delayMs
        );
        clock +=
          delayMs;
        resolve();
      },
      isRecoverable(
        type
      ) {
        return (
          type ===
          'RENDER_PROCESS_GONE'
        );
      },
      async recoverAttempt({
        attempt
      }) {
        attempts.push(
          attempt
        );

        return (
          attempt === 2
        );
      }
    });

  const result =
    await controller.start({
      type:
        'RENDER_PROCESS_GONE'
    });

  assert.equal(
    result.recovered,
    true
  );
  assert.equal(
    result.reason,
    'RECOVERED'
  );
  assert.equal(
    result.attempts,
    2
  );
  assert.deepEqual(
    attempts,
    [
      1,
      2
    ]
  );
  assert.deepEqual(
    delays,
    [
      10,
      20
    ]
  );
  assert.equal(
    result.budget.used,
    2
  );
  assert.equal(
    controller.isRunning(),
    false
  );
});

test('renderer recovery respeita orçamento e não entra em loop', async () => {
  let clock = 0;
  let attempts = 0;

  const controller =
    createOfflineRendererRecoveryController({
      retryDelaysMs: [
        0,
        0,
        0
      ],
      budgetWindowMs:
        120000,
      now() {
        return clock;
      },
      setTimeoutFn(
        resolve
      ) {
        resolve();
      },
      isRecoverable() {
        return true;
      },
      async recoverAttempt() {
        attempts += 1;
        return false;
      }
    });

  const first =
    await controller.start({
      type:
        'HEALTHCHECK_FAILED'
    });

  assert.equal(
    first.recovered,
    false
  );
  assert.equal(
    first.reason,
    'BUDGET_EXHAUSTED'
  );
  assert.equal(
    attempts,
    3
  );
  assert.equal(
    first.budget.used,
    3
  );

  const second =
    await controller.start({
      type:
        'HEALTHCHECK_FAILED'
    });

  assert.equal(
    second.started,
    false
  );
  assert.equal(
    second.reason,
    'BUDGET_EXHAUSTED'
  );
  assert.equal(
    attempts,
    3
  );

  clock +=
    120001;

  const third =
    await controller.start({
      type:
        'HEALTHCHECK_FAILED'
    });

  assert.equal(
    third.started,
    true
  );
  assert.equal(
    attempts,
    6
  );
});

test('renderer recovery ignora falha não recuperável', async () => {
  let attempts = 0;

  const controller =
    createOfflineRendererRecoveryController({
      retryDelaysMs: [
        0
      ],
      isRecoverable(
        type
      ) {
        return (
          type ===
          'DID_FAIL_LOAD'
        );
      },
      async recoverAttempt() {
        attempts += 1;
        return true;
      }
    });

  const result =
    await controller.start({
      type:
        'UNRESPONSIVE'
    });

  assert.equal(
    result.started,
    false
  );
  assert.equal(
    result.reason,
    'NOT_RECOVERABLE'
  );
  assert.equal(
    attempts,
    0
  );
});
