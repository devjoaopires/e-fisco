'use strict';

const OFFLINE_LOGIN_RESET_MS = 600_000;
const ONLINE_OPERATOR_IDENTITY_REFRESH_MS = 2_000;
const ONLINE_OPERATOR_FAILOVER_CACHE_MAX_AGE_MS = 60_000;
const ONLINE_OPERATOR_IDENTITY_CLEAR_AFTER_MISSES = 5;

function createOperatorSessionController({
  resolveUniquePreparedEmpresaIdForProvisionedOperator,
  listActiveOfflineOperatorCredentials,
  captureOnlineOperatorIdentity,
  log = () => {},
  now = () => Date.now()
} = {}) {
  let offlineAuthenticatedOperator = null;
  let lastConfirmedOnlineOperatorIdentity = null;
  let lastOnlineOperatorIdentityRefreshAt = 0;
  let onlineOperatorIdentityRefreshMisses = 0;
  let offlineLoginFailures = 0;
  let offlineLoginBlockedUntil = 0;
  let offlineLoginLastFailureAt = 0;

  function resolveOfflineOperatorProfileForSession(profile) {
    if (!profile || typeof profile !== 'object') {
      return null;
    }

    let empresaId =
      String(
        profile.empresaId ||
        ''
      ).trim();

    const perfil =
      String(profile.perfil || '')
        .trim()
        .toUpperCase();

    const nomeOperador =
      String(
        profile.nomeOperador ||
        profile.operadorNome ||
        profile.operatorName ||
        ''
      ).trim();

    let operadorId =
      String(
        profile.operadorId ||
        profile.operatorId ||
        ''
      ).trim();

    if (
      !empresaId &&
      operadorId &&
      perfil &&
      typeof resolveUniquePreparedEmpresaIdForProvisionedOperator ===
        'function'
    ) {
      empresaId =
        resolveUniquePreparedEmpresaIdForProvisionedOperator(
          operadorId,
          perfil
        );
    }

    if (
      !empresaId ||
      !nomeOperador ||
      !['ADMINISTRADOR', 'SUPERVISOR', 'CAIXA'].includes(perfil)
    ) {
      return null;
    }

    if (
      !operadorId &&
      typeof listActiveOfflineOperatorCredentials ===
        'function'
    ) {
      const matching =
        listActiveOfflineOperatorCredentials(
          empresaId
        ).filter((candidate) => (
          candidate &&
          String(candidate.nome || '').trim() === nomeOperador &&
          String(candidate.perfil || '').trim().toUpperCase() === perfil
        ));

      if (matching.length !== 1) {
        return null;
      }

      operadorId =
        String(
          matching[0].operadorId ||
          ''
        ).trim();
    }

    if (!operadorId) {
      return null;
    }

    return {
      ...profile,
      empresaId,
      operadorId,
      operatorId:
        operadorId,
      nomeOperador,
      operadorNome:
        nomeOperador,
      operatorName:
        nomeOperador,
      perfil
    };
  }

  function normalizeOfflineAuthenticatedOperator(profile) {
    const resolved =
      resolveOfflineOperatorProfileForSession(
        profile
      );

    if (!resolved) {
      return null;
    }

    const perfil =
      String(resolved.perfil || '')
        .trim()
        .toUpperCase();

    return {
      empresaId:
        String(resolved.empresaId || '').trim(),
      operadorId:
        String(resolved.operadorId || '').trim(),
      operatorId:
        String(resolved.operadorId || '').trim(),
      nomeOperador:
        String(resolved.nomeOperador || '').trim(),
      operadorNome:
        String(resolved.nomeOperador || '').trim(),
      operatorName:
        String(resolved.nomeOperador || '').trim(),
      perfil,
      acessoTotal:
        perfil === 'ADMINISTRADOR' &&
        resolved.acessoTotal === true,
      offline:
        true
    };
  }

  function setOfflineAuthenticatedOperator(profile) {
    offlineAuthenticatedOperator =
      normalizeOfflineAuthenticatedOperator(
        profile
      );

    return offlineAuthenticatedOperator;
  }

  function getOfflineAuthenticatedOperator() {
    return offlineAuthenticatedOperator;
  }

  function clearOfflineAuthenticatedOperator() {
    offlineAuthenticatedOperator = null;
  }

  function rememberConfirmedOnlineOperatorIdentity(profile) {
    const normalized =
      normalizeOfflineAuthenticatedOperator(
        profile
      );

    if (!normalized) {
      return null;
    }

    lastConfirmedOnlineOperatorIdentity = {
      ...normalized,
      offline: false,
      confirmedAt: now()
    };

    onlineOperatorIdentityRefreshMisses = 0;

    return lastConfirmedOnlineOperatorIdentity;
  }

  function getLastConfirmedOnlineOperatorIdentity() {
    return lastConfirmedOnlineOperatorIdentity;
  }

  function recentConfirmedOnlineOperatorIdentity() {
    const cached =
      lastConfirmedOnlineOperatorIdentity &&
      typeof lastConfirmedOnlineOperatorIdentity === 'object'
        ? lastConfirmedOnlineOperatorIdentity
        : null;

    if (!cached) {
      return null;
    }

    const confirmedAt =
      Number(cached.confirmedAt || 0);

    if (
      !Number.isFinite(confirmedAt) ||
      confirmedAt <= 0 ||
      now() - confirmedAt >
        ONLINE_OPERATOR_FAILOVER_CACHE_MAX_AGE_MS
    ) {
      return null;
    }

    return normalizeOfflineAuthenticatedOperator(
      cached
    );
  }

  async function refreshConfirmedOnlineOperatorIdentityFromLivePage(
    options = {}
  ) {
    const currentTime = now();

    if (
      currentTime - lastOnlineOperatorIdentityRefreshAt <
        ONLINE_OPERATOR_IDENTITY_REFRESH_MS
    ) {
      return recentConfirmedOnlineOperatorIdentity();
    }

    lastOnlineOperatorIdentityRefreshAt =
      currentTime;

    const identity =
      typeof captureOnlineOperatorIdentity === 'function'
        ? await captureOnlineOperatorIdentity({
            timeoutMs: 700
          })
        : null;

    if (identity) {
      return rememberConfirmedOnlineOperatorIdentity(
        identity
      );
    }

    if (options.browserOnline === true) {
      onlineOperatorIdentityRefreshMisses += 1;

      if (
        onlineOperatorIdentityRefreshMisses >=
          ONLINE_OPERATOR_IDENTITY_CLEAR_AFTER_MISSES
      ) {
        if (lastConfirmedOnlineOperatorIdentity) {
          log('ONLINE OPERATOR SESSION CACHE CLEARED', {
            reason: 'ONLINE_IDENTITY_ABSENT'
          });
        }

        lastConfirmedOnlineOperatorIdentity = null;
        onlineOperatorIdentityRefreshMisses = 0;
      }
    }

    return null;
  }

  function withAuthenticatedOfflineOperator(payload = {}) {
    const session =
      normalizeOfflineAuthenticatedOperator(
        offlineAuthenticatedOperator
      );

    if (!session) {
      throw new Error(
        'Operador offline autenticado não está disponível para atribuir a operação.'
      );
    }

    const source =
      payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload)
        ? payload
        : {};

    return {
      ...source,
      empresaId:
        session.empresaId,
      operadorId:
        session.operadorId,
      operatorId:
        session.operadorId,
      operadorNome:
        session.nomeOperador,
      nomeOperador:
        session.nomeOperador,
      operatorName:
        session.nomeOperador,
      operadorPerfil:
        session.perfil,
      perfilOperador:
        session.perfil,
      acessoTotalOperador:
        session.acessoTotal === true
    };
  }

  function resetOfflineLoginBackoff() {
    offlineLoginFailures = 0;
    offlineLoginBlockedUntil = 0;
    offlineLoginLastFailureAt = 0;
  }

  function offlineLoginRetryAfterMs(
    currentTime = now()
  ) {
    if (
      offlineLoginLastFailureAt &&
      currentTime - offlineLoginLastFailureAt >=
        OFFLINE_LOGIN_RESET_MS
    ) {
      resetOfflineLoginBackoff();
    }

    return Math.max(
      0,
      offlineLoginBlockedUntil - currentTime
    );
  }

  function registerOfflineLoginFailure(
    currentTime = now()
  ) {
    if (
      offlineLoginLastFailureAt &&
      currentTime - offlineLoginLastFailureAt >=
        OFFLINE_LOGIN_RESET_MS
    ) {
      offlineLoginFailures = 0;
    }

    offlineLoginLastFailureAt =
      currentTime;
    offlineLoginFailures += 1;

    const delay =
      offlineLoginFailures < 3
        ? 0
        : Math.min(
            30000,
            2000 * (
              2 **
              Math.min(
                offlineLoginFailures - 3,
                4
              )
            )
          );

    offlineLoginBlockedUntil =
      currentTime + delay;

    return delay;
  }

  function getLoginBackoffState() {
    return {
      failures:
        offlineLoginFailures,
      blockedUntil:
        offlineLoginBlockedUntil,
      lastFailureAt:
        offlineLoginLastFailureAt
    };
  }

  return Object.freeze({
    resolveOfflineOperatorProfileForSession,
    normalizeOfflineAuthenticatedOperator,
    setOfflineAuthenticatedOperator,
    getOfflineAuthenticatedOperator,
    clearOfflineAuthenticatedOperator,
    rememberConfirmedOnlineOperatorIdentity,
    getLastConfirmedOnlineOperatorIdentity,
    recentConfirmedOnlineOperatorIdentity,
    refreshConfirmedOnlineOperatorIdentityFromLivePage,
    withAuthenticatedOfflineOperator,
    offlineLoginRetryAfterMs,
    registerOfflineLoginFailure,
    resetOfflineLoginBackoff,
    getLoginBackoffState
  });
}

module.exports = {
  OFFLINE_LOGIN_RESET_MS,
  ONLINE_OPERATOR_IDENTITY_REFRESH_MS,
  ONLINE_OPERATOR_FAILOVER_CACHE_MAX_AGE_MS,
  ONLINE_OPERATOR_IDENTITY_CLEAR_AFTER_MISSES,
  createOperatorSessionController
};
