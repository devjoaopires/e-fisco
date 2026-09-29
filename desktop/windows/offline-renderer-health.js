'use strict';

function createOfflineRendererHealthState({
  maxAgeMs = 20000,
  now = () => Date.now()
} = {}) {
  const normalizedMaxAgeMs =
    Math.max(
      1000,
      Number(maxAgeMs) ||
        20000
    );

  let state = {
    healthy: false,
    checkedAtMs: null,
    reason: 'NOT_CHECKED',
    viewRef: null,
    details: null
  };

  function markHealthy(
    viewRef,
    details = null
  ) {
    state = {
      healthy: true,
      checkedAtMs:
        now(),
      reason: 'HEALTHY',
      viewRef,
      details
    };

    return snapshot(
      viewRef
    );
  }

  function markUnhealthy(
    viewRef,
    reason = 'UNHEALTHY',
    details = null
  ) {
    state = {
      healthy: false,
      checkedAtMs:
        now(),
      reason:
        String(
          reason || 'UNHEALTHY'
        ),
      viewRef,
      details
    };

    return snapshot(
      viewRef
    );
  }

  function clear(
    reason = 'NOT_CHECKED'
  ) {
    state = {
      healthy: false,
      checkedAtMs: null,
      reason:
        String(
          reason || 'NOT_CHECKED'
        ),
      viewRef: null,
      details: null
    };

    return snapshot();
  }

  function snapshot(
    currentViewRef = null
  ) {
    const timestamp =
      now();

    const ageMs =
      Number.isFinite(
        Number(
          state.checkedAtMs
        )
      )
        ? Math.max(
            0,
            timestamp -
            Number(
              state.checkedAtMs
            )
          )
        : null;

    const sameView =
      currentViewRef
        ? state.viewRef ===
          currentViewRef
        : Boolean(
            state.viewRef
          );

    const fresh =
      Boolean(
        state.healthy &&
        sameView &&
        ageMs != null &&
        ageMs <=
          normalizedMaxAgeMs
      );

    return Object.freeze({
      healthy:
        state.healthy === true,
      fresh,
      checkedAt:
        state.checkedAtMs == null
          ? null
          : new Date(
              state.checkedAtMs
            ).toISOString(),
      ageMs,
      maxAgeMs:
        normalizedMaxAgeMs,
      reason:
        String(
          state.reason ||
          'UNKNOWN'
        ),
      sameView,
      details:
        state.details &&
        typeof state.details ===
          'object'
          ? Object.freeze({
              ...state.details
            })
          : state.details
    });
  }

  return Object.freeze({
    markHealthy,
    markUnhealthy,
    clear,
    snapshot,
    isFreshHealthy(
      viewRef
    ) {
      return (
        snapshot(
          viewRef
        ).fresh === true
      );
    }
  });
}

module.exports = {
  createOfflineRendererHealthState
};
