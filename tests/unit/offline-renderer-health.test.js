'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createOfflineRendererHealthState
} = require('../../desktop/windows/offline-renderer-health');

test('renderer health fica stale quando ultrapassa a validade', () => {
  let clock = 1000;
  const view = {};

  const state =
    createOfflineRendererHealthState({
      maxAgeMs: 20000,
      now() {
        return clock;
      }
    });

  state.markHealthy(
    view,
    {
      source: 'test'
    }
  );

  let snapshot =
    state.snapshot(
      view
    );

  assert.equal(
    snapshot.healthy,
    true
  );
  assert.equal(
    snapshot.fresh,
    true
  );
  assert.equal(
    snapshot.ageMs,
    0
  );

  clock +=
    19999;

  snapshot =
    state.snapshot(
      view
    );

  assert.equal(
    snapshot.fresh,
    true
  );

  clock +=
    2;

  snapshot =
    state.snapshot(
      view
    );

  assert.equal(
    snapshot.healthy,
    true
  );
  assert.equal(
    snapshot.fresh,
    false
  );
  assert.equal(
    snapshot.ageMs,
    20001
  );
});

test('renderer health não transfere saúde para outra view', () => {
  let clock = 5000;
  const firstView = {};
  const secondView = {};

  const state =
    createOfflineRendererHealthState({
      maxAgeMs: 20000,
      now() {
        return clock;
      }
    });

  state.markHealthy(
    firstView
  );

  assert.equal(
    state.isFreshHealthy(
      firstView
    ),
    true
  );

  assert.equal(
    state.isFreshHealthy(
      secondView
    ),
    false
  );

  state.markUnhealthy(
    secondView,
    'HEALTHCHECK_FAILED'
  );

  const snapshot =
    state.snapshot(
      secondView
    );

  assert.equal(
    snapshot.healthy,
    false
  );
  assert.equal(
    snapshot.fresh,
    false
  );
  assert.equal(
    snapshot.reason,
    'HEALTHCHECK_FAILED'
  );
});

test('renderer health clear elimina prontidão anterior', () => {
  let clock = 10000;
  const view = {};

  const state =
    createOfflineRendererHealthState({
      now() {
        return clock;
      }
    });

  state.markHealthy(
    view
  );

  state.clear(
    'VIEW_REPLACED'
  );

  const snapshot =
    state.snapshot(
      view
    );

  assert.equal(
    snapshot.healthy,
    false
  );
  assert.equal(
    snapshot.fresh,
    false
  );
  assert.equal(
    snapshot.checkedAt,
    null
  );
  assert.equal(
    snapshot.reason,
    'VIEW_REPLACED'
  );
});
