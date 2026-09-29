'use strict';

const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  offlineAuthFailure,
  createAuthorizationController
} = require('../../offline/auth-session/authorization');

const {
  createOperatorSessionController
} = require('../../offline/auth-session/operator-session');

const {
  createOperatorVerifierController
} = require('../../offline/auth-session/operator-verifier');

const {
  createOperatorProvisioningController
} = require('../../offline/auth-session/operator-provisioning');

function fakeSafeStorage() {
  return {
    isEncryptionAvailable() {
      return true;
    },
    encryptString(value) {
      return Buffer.from(
        String(value),
        'utf8'
      );
    },
    decryptString(buffer) {
      return Buffer.from(buffer)
        .toString('utf8');
    }
  };
}

function pbkdf2Credential(
  senha = '1234',
  empresaId = 'EMP-1',
  operadorId = 'OP-1'
) {
  const salt =
    Buffer.from(
      '00112233445566778899aabbccddeeff',
      'hex'
    );

  const verifier =
    crypto.pbkdf2Sync(
      senha,
      salt,
      310000,
      32,
      'sha256'
    );

  const verifierText =
    verifier.toString('base64');

  return {
    empresaId,
    operadorId,
    nome: 'OPERADOR TESTE',
    perfil: 'CAIXA',
    acessoTotal: false,
    ativo: true,
    credentialKdf:
      'PBKDF2_SHA256_V1_SAFE_STORAGE',
    credentialSalt:
      salt.toString('base64'),
    credentialVerifier:
      Buffer.from(
        verifierText,
        'utf8'
      ).toString('base64'),
    credentialParams: {
      iterations: 310000,
      hash: 'SHA-256',
      keyLength: 32,
      wrapper: 'safeStorage'
    },
    plain: {
      kdf: 'PBKDF2_SHA256_V1',
      salt:
        salt.toString('base64'),
      verifier:
        verifierText,
      params: {
        iterations: 310000,
        hash: 'SHA-256',
        keyLength: 32
      }
    }
  };
}

test('authorization preserva classificação de falha e estado fail-closed', () => {
  assert.equal(
    offlineAuthFailure({
      code: 'SYNC_DEVICE_AUTH_FAILED'
    }),
    true
  );
  assert.equal(
    offlineAuthFailure({
      httpStatus: 401
    }),
    true
  );
  assert.equal(
    offlineAuthFailure({
      httpStatus: 403
    }),
    true
  );
  assert.equal(
    offlineAuthFailure({
      httpStatus: 500
    }),
    false
  );

  const logs = [];
  const controller =
    createAuthorizationController({
      log(...args) {
        logs.push(args);
      }
    });

  assert.equal(
    controller.getState(),
    'UNAVAILABLE'
  );

  assert.throws(
    () =>
      controller.assertMutationAuthorized({
        syncIdentity: null,
        uiMode: 'ONLINE',
        authenticatedOperator: null
      }),
    /identidade autenticada suficiente/
  );

  controller.setState('VALID');

  assert.equal(
    controller.assertMutationAuthorized({
      syncIdentity: {
        deviceId: 'D1',
        deviceToken: 'T1',
        empresaId: 'E1'
      },
      uiMode: 'ONLINE',
      authenticatedOperator: null
    }),
    true
  );

  controller.markInvalid({
    code: 'SYNC_DEVICE_AUTH_FAILED',
    httpStatus: 403
  });

  assert.equal(
    controller.getState(),
    'INVALID'
  );
  assert.equal(
    logs.at(-1)[0],
    'OFFLINE SYNC AUTH INVALID'
  );
});

test('operator-session normaliza identidade e mantém owner único da sessão offline', () => {
  const controller =
    createOperatorSessionController({
      resolveUniquePreparedEmpresaIdForProvisionedOperator() {
        return 'EMP-1';
      },
      listActiveOfflineOperatorCredentials() {
        return [];
      }
    });

  const session =
    controller.setOfflineAuthenticatedOperator({
      operadorId: 'OP-1',
      operatorName: 'João',
      perfil: 'caixa'
    });

  assert.deepEqual(
    session,
    {
      empresaId: 'EMP-1',
      operadorId: 'OP-1',
      operatorId: 'OP-1',
      nomeOperador: 'João',
      operadorNome: 'João',
      operatorName: 'João',
      perfil: 'CAIXA',
      acessoTotal: false,
      offline: true
    }
  );

  assert.equal(
    controller.getOfflineAuthenticatedOperator(),
    session
  );

  assert.deepEqual(
    controller.withAuthenticatedOfflineOperator({
      valor: 10,
      empresaId: 'IGNORAR'
    }),
    {
      valor: 10,
      empresaId: 'EMP-1',
      operadorId: 'OP-1',
      operatorId: 'OP-1',
      operadorNome: 'João',
      nomeOperador: 'João',
      operatorName: 'João',
      operadorPerfil: 'CAIXA',
      perfilOperador: 'CAIXA',
      acessoTotalOperador: false
    }
  );

  controller.clearOfflineAuthenticatedOperator();

  assert.equal(
    controller.getOfflineAuthenticatedOperator(),
    null
  );
});

test('operator-session preserva backoff e reset de dez minutos', () => {
  let current = 1_000;

  const controller =
    createOperatorSessionController({
      now() {
        return current;
      }
    });

  assert.equal(
    controller.registerOfflineLoginFailure(),
    0
  );
  current += 10;
  assert.equal(
    controller.registerOfflineLoginFailure(),
    0
  );
  current += 10;
  assert.equal(
    controller.registerOfflineLoginFailure(),
    2000
  );

  assert.equal(
    controller.getLoginBackoffState().failures,
    3
  );

  current += 100;
  assert.ok(
    controller.offlineLoginRetryAfterMs() >
      0
  );

  current += 600_000;

  assert.equal(
    controller.offlineLoginRetryAfterMs(),
    0
  );
  assert.equal(
    controller.getLoginBackoffState().failures,
    0
  );
});

test('operator-verifier valida PBKDF2 local e exige match único entre empresas preparadas', () => {
  const credential =
    pbkdf2Credential();

  const controller =
    createOperatorVerifierController({
      safeStorage:
        fakeSafeStorage(),
      crypto,
      listPreparedOfflineCompanies() {
        return [
          { empresaId: 'EMP-1' }
        ];
      },
      listActiveOfflineOperatorCredentials(
        empresaId
      ) {
        return empresaId === 'EMP-1'
          ? [credential]
          : [];
      }
    });

  const valid =
    controller
      .validateOfflineOperatorPasswordAcrossPreparedCompanies({
        senha: '1234'
      });

  assert.equal(
    valid.success,
    true
  );
  assert.equal(
    valid.empresaId,
    'EMP-1'
  );
  assert.equal(
    valid.operadorId,
    'OP-1'
  );

  assert.deepEqual(
    controller
      .validateOfflineOperatorPasswordAcrossPreparedCompanies({
        senha: '9999'
      }),
    {
      success: false,
      reason: 'ACCESS_DENIED'
    }
  );
});

test('operator-verifier mantém um único candidato e zera verifier antigo ao substituir', () => {
  let now = 10_000;
  const logs = [];
  const first =
    pbkdf2Credential('1234');

  const controller =
    createOperatorVerifierController({
      safeStorage:
        fakeSafeStorage(),
      crypto,
      log(...args) {
        logs.push(args);
      },
      now() {
        return now;
      }
    });

  assert.equal(
    controller
      .storePendingOfflineOperatorVerifierCandidate(
        first.plain
      ),
    true
  );

  const old =
    controller
      .getPendingOfflineOperatorVerifierCandidate();

  const oldServerBuffer =
    old.serverVerifierBuffer;

  now += 1;

  assert.equal(
    controller
      .storePendingOfflineOperatorVerifierCandidate(
        pbkdf2Credential('5678')
          .plain
      ),
    true
  );

  assert.equal(
    oldServerBuffer.every(
      byte => byte === 0
    ),
    true
  );

  assert.notEqual(
    controller
      .getPendingOfflineOperatorVerifierCandidate(),
    old
  );

  assert.equal(
    logs.some(
      entry =>
        entry[0] ===
          'OFFLINE OPERATOR VERIFIER CANDIDATE READY'
    ),
    true
  );
});

test('operator-provisioning preserva bootstrap e provisionamento explícito protegidos por safeStorage', () => {
  const stored = [];
  const safeStorage =
    fakeSafeStorage();

  const controller =
    createOperatorProvisioningController({
      safeStorage,
      crypto,
      upsertOfflineOperatorCredential(
        input
      ) {
        stored.push(input);
        return {
          ...input
        };
      },
      verifierController: {},
      captureOnlineOperatorIdentity:
        async () => null,
      rememberConfirmedOnlineOperatorIdentity() {},
      postAuthenticatedDeviceJson:
        async () => null
    });

  const credential =
    pbkdf2Credential();

  const fromBootstrap =
    controller
      .storeProvisionedOfflineCredentialFromBootstrap(
        'EMP-1',
        {
          operadorId: 'OP-1',
          nome: 'OPERADOR TESTE',
          perfil: 'CAIXA',
          ativo: true,
          acessoTotal: false,
          offlineCredential: {
            ...credential.plain,
            revision: 'REV-1',
            updatedAt:
              '2026-09-26T00:00:00.000Z'
          }
        }
      );

  assert.equal(
    fromBootstrap.credentialKdf,
    'PBKDF2_SHA256_V1_SAFE_STORAGE'
  );
  assert.equal(
    fromBootstrap.credentialRevision,
    'REV-1'
  );

  const explicit =
    controller
      .persistExplicitOfflineCredentialProvision({
        empresaId: 'EMP-1',
        perfil: 'ADMINISTRADOR',
        acessoTotal: true,
        credential: {
          ...credential.plain,
          revision: 'REV-2'
        }
      });

  assert.equal(
    explicit.operadorId,
    'ADMINISTRADOR:EMP-1'
  );
  assert.equal(
    explicit.acessoTotal,
    true
  );
  assert.equal(stored.length, 2);
});

test('pending credential é persistida uma vez, publicada quando há device auth e descartada ao concluir', async () => {
  const credential =
    pbkdf2Credential();
  const safeStorage =
    fakeSafeStorage();

  const verifierController =
    createOperatorVerifierController({
      safeStorage,
      crypto
    });

  verifierController
    .storePendingOfflineOperatorVerifierCandidate(
      credential.plain
    );

  const remembered = [];
  const posts = [];
  const stored = [];

  const controller =
    createOperatorProvisioningController({
      safeStorage,
      crypto,
      upsertOfflineOperatorCredential(
        input
      ) {
        const result = {
          ...input,
          nome:
            input.nome
        };
        stored.push(result);
        return result;
      },
      listActiveOfflineOperatorCredentials(
        empresaId
      ) {
        return stored.filter(
          (item) =>
            item &&
            item.ativo === true &&
            item.empresaId ===
              empresaId
        );
      },
      verifierController,
      async captureOnlineOperatorIdentity() {
        return {
          empresaId: 'EMP-1',
          operadorId: 'OP-1',
          operatorName:
            'OPERADOR TESTE',
          perfil: 'CAIXA',
          acessoTotal: false
        };
      },
      rememberConfirmedOnlineOperatorIdentity(
        profile
      ) {
        remembered.push(profile);
      },
      getSyncIdentity() {
        return {
          deviceId: 'DEV-1',
          deviceToken: 'TOKEN-1',
          empresaId: 'EMP-1'
        };
      },
      async postAuthenticatedDeviceJson(
        input
      ) {
        posts.push(input);
        return {
          status: 'OK',
          stored: true
        };
      }
    });

  const result =
    await controller
      .persistPendingOfflineOperatorCredentialAfterOnlineLogin();

  assert.equal(result.cached, true);
  assert.equal(
    result.centralPublished,
    true
  );
  assert.equal(stored.length, 1);
  assert.equal(remembered.length, 1);
  assert.equal(posts.length, 1);
  assert.equal(
    posts[0].endpoint,
    'https://api.e-fisco.app/sync/device/offline-credential/provision'
  );
  assert.equal(
    verifierController
      .getPendingOfflineOperatorVerifierCandidate(),
    null
  );
});
