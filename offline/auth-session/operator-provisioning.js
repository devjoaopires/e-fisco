'use strict';

const {
  decodeCanonicalBase64
} = require('./operator-verifier');

function createOperatorProvisioningController({
  safeStorage,
  crypto,
  log = () => {},
  upsertOfflineOperatorCredential,
  listActiveOfflineOperatorCredentials,
  verifierController,
  captureOnlineOperatorIdentity,
  rememberConfirmedOnlineOperatorIdentity,
  getSyncIdentity = () => null,
  postAuthenticatedDeviceJson,
  onOfflineCredentialVerified = () => {},
  now = () => Date.now()
} = {}) {
  let credentialPersistInFlight = null;

  function verifyStoredOfflineCredential(
    stored = {},
    options = {}
  ) {
    const empresaId =
      String(
        stored.empresaId || ''
      ).trim();

    const operadorId =
      String(
        stored.operadorId || ''
      ).trim();

    if (!empresaId || !operadorId) {
      throw new Error(
        'Credencial offline gravada sem identidade completa.'
      );
    }

    if (
      typeof listActiveOfflineOperatorCredentials !==
        'function'
    ) {
      throw new Error(
        'Leitura de credenciais offline indisponível.'
      );
    }

    if (
      !safeStorage ||
      !safeStorage.isEncryptionAvailable()
    ) {
      throw new Error(
        'safeStorage indisponível na validação pós-gravação.'
      );
    }

    const candidates =
      listActiveOfflineOperatorCredentials(
        empresaId
      );

    const credential =
      Array.isArray(candidates)
        ? candidates.find(
            (candidate) =>
              candidate &&
              candidate.ativo === true &&
              String(
                candidate.empresaId || ''
              ).trim() === empresaId &&
              String(
                candidate.operadorId || ''
              ).trim() === operadorId
          )
        : null;

    if (!credential) {
      throw new Error(
        'Credencial offline não foi encontrada após a gravação.'
      );
    }

    const credentialKdf =
      String(
        credential.credentialKdf || ''
      )
        .trim()
        .toUpperCase();

    const isScrypt =
      credentialKdf ===
        'SCRYPT_V1_SAFE_STORAGE';

    const isPbkdf2 =
      credentialKdf ===
        'PBKDF2_SHA256_V1_SAFE_STORAGE';

    const params =
      credential.credentialParams &&
      typeof credential.credentialParams ===
        'object' &&
      !Array.isArray(
        credential.credentialParams
      )
        ? credential.credentialParams
        : {};

    if (
      (!isScrypt && !isPbkdf2) ||
      String(params.wrapper || '') !==
        'safeStorage' ||
      Number(params.keyLength) !== 32
    ) {
      throw new Error(
        'Credencial offline gravada com parâmetros inválidos.'
      );
    }

    if (
      isScrypt &&
      (
        Number(params.N) !== 32768 ||
        Number(params.r) !== 8 ||
        Number(params.p) !== 1
      )
    ) {
      throw new Error(
        'Credencial offline SCRYPT inválida após a gravação.'
      );
    }

    if (
      isPbkdf2 &&
      (
        Number(params.iterations) !==
          310000 ||
        String(
          params.hash || ''
        )
          .trim()
          .toUpperCase() !==
            'SHA-256'
      )
    ) {
      throw new Error(
        'Credencial offline PBKDF2 inválida após a gravação.'
      );
    }

    if (
      stored.credentialRevision &&
      credential.credentialRevision &&
      String(
        stored.credentialRevision
      ) !==
        String(
          credential.credentialRevision
        )
    ) {
      throw new Error(
        'Revisão da credencial offline divergiu após a gravação.'
      );
    }

    let saltBuffer = null;
    let encryptedVerifierBuffer = null;
    let verifierBuffer = null;

    try {
      saltBuffer =
        decodeCanonicalBase64(
          credential.credentialSalt,
          16
        );

      encryptedVerifierBuffer =
        decodeCanonicalBase64(
          credential.credentialVerifier
        );

      if (
        !saltBuffer ||
        !encryptedVerifierBuffer
      ) {
        throw new Error(
          'Credencial offline gravada em formato inválido.'
        );
      }

      const decryptedVerifierText =
        safeStorage.decryptString(
          encryptedVerifierBuffer
        );

      verifierBuffer =
        decodeCanonicalBase64(
          decryptedVerifierText,
          32
        );

      if (!verifierBuffer) {
        throw new Error(
          'Verifier offline não pôde ser validado após a gravação.'
        );
      }

      if (options.silent !== true) {
        log(
          'OFFLINE OPERATOR CREDENTIAL VERIFIED AFTER STORE',
          {
            empresaId,
            operadorId,
            perfil:
              String(
                credential.perfil || ''
              )
                .trim()
                .toUpperCase()
          }
        );
      }

      return true;
    } finally {
      for (
        const buffer of
        [
          saltBuffer,
          encryptedVerifierBuffer,
          verifierBuffer
        ]
      ) {
        if (buffer) {
          try {
            buffer.fill(0);
          } catch (_) {}
        }
      }
    }
  }

  function storeProvisionedOfflineCredentialFromBootstrap(
    empresaIdValue,
    credentialValue
  ) {
    const empresaId =
      String(
        empresaIdValue || ''
      ).trim();

    const credential =
      credentialValue &&
      typeof credentialValue === 'object' &&
      !Array.isArray(credentialValue)
        ? credentialValue
        : null;

    if (
      !empresaId ||
      !credential
    ) {
      return null;
    }

    const offlineCredential =
      credential.offlineCredential &&
      typeof credential.offlineCredential ===
        'object' &&
      !Array.isArray(
        credential.offlineCredential
      )
        ? credential.offlineCredential
        : null;

    if (!offlineCredential) {
      return null;
    }

    const kdf =
      String(
        offlineCredential.kdf || ''
      )
        .trim()
        .toUpperCase();

    const saltText =
      String(
        offlineCredential.salt || ''
      ).trim();

    const verifierText =
      String(
        offlineCredential.verifier || ''
      ).trim();

    const params =
      offlineCredential.params &&
      typeof offlineCredential.params ===
        'object' &&
      !Array.isArray(
        offlineCredential.params
      )
        ? offlineCredential.params
        : {};

    if (
      kdf !== 'PBKDF2_SHA256_V1' ||
      Number(params.iterations) !== 310000 ||
      String(
        params.hash || ''
      )
        .trim()
        .toUpperCase() !== 'SHA-256' ||
      Number(params.keyLength) !== 32
    ) {
      return null;
    }

    let saltBuffer = null;
    let verifierBuffer = null;
    let encryptedVerifier = null;

    try {
      saltBuffer =
        decodeCanonicalBase64(
          saltText,
          16
        );

      verifierBuffer =
        decodeCanonicalBase64(
          verifierText,
          32
        );

      if (
        !saltBuffer ||
        !verifierBuffer
      ) {
        return null;
      }

      if (
        !safeStorage ||
        !safeStorage.isEncryptionAvailable()
      ) {
        throw new Error(
          'safeStorage indisponível para credencial provisionada.'
        );
      }

      encryptedVerifier =
        safeStorage.encryptString(
          verifierText
        );

      if (
        !Buffer.isBuffer(
          encryptedVerifier
        ) ||
        encryptedVerifier.length < 1
      ) {
        throw new Error(
          'safeStorage não protegeu a credencial provisionada.'
        );
      }

      return upsertOfflineOperatorCredential({
        empresaId,
        operadorId:
          String(
            credential.operadorId || ''
          ).trim(),
        nome:
          String(
            credential.nome || ''
          ).trim(),
        perfil:
          String(
            credential.perfil || ''
          ).trim(),
        acessoTotal:
          credential.acessoTotal === true,
        ativo:
          credential.ativo !== false,
        credentialKdf:
          'PBKDF2_SHA256_V1_SAFE_STORAGE',
        credentialSalt:
          saltText,
        credentialVerifier:
          encryptedVerifier.toString(
            'base64'
          ),
        credentialParams: {
          iterations: 310000,
          hash: 'SHA-256',
          keyLength: 32,
          wrapper: 'safeStorage'
        },
        credentialRevision:
          String(
            offlineCredential.revision || ''
          ).trim() ||
          crypto.randomUUID(),
        sourceUpdatedAt:
          offlineCredential.updatedAt ||
          credential.sourceUpdatedAt ||
          null
      });
    } finally {
      for (
        const buffer of
        [
          saltBuffer,
          verifierBuffer,
          encryptedVerifier
        ]
      ) {
        if (buffer) {
          try {
            buffer.fill(0);
          } catch (_) {}
        }
      }
    }
  }

  function persistExplicitOfflineCredentialProvision(
    payload = {}
  ) {
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      throw new Error(
        'Payload de credencial offline inválido.'
      );
    }

    const empresaId =
      String(
        payload.empresaId || ''
      ).trim();

    const perfil =
      String(
        payload.perfil || ''
      )
        .trim()
        .toUpperCase();

    const nome =
      String(
        payload.nomeOperador ||
        payload.nome ||
        (
          perfil === 'ADMINISTRADOR'
            ? 'ADMINISTRADOR'
            : ''
        )
      ).trim();

    let operadorId =
      String(
        payload.operadorId || ''
      ).trim();

    if (
      perfil === 'ADMINISTRADOR' &&
      !operadorId &&
      empresaId
    ) {
      operadorId =
        'ADMINISTRADOR:' +
        empresaId;
    }

    if (
      !empresaId ||
      !operadorId ||
      !nome ||
      ![
        'ADMINISTRADOR',
        'SUPERVISOR',
        'CAIXA'
      ].includes(perfil)
    ) {
      throw new Error(
        'Identidade da credencial offline está incompleta.'
      );
    }

    const credential =
      payload.credential &&
      typeof payload.credential ===
        'object' &&
      !Array.isArray(
        payload.credential
      )
        ? payload.credential
        : {};

    const kdf =
      String(
        credential.kdf || ''
      )
        .trim()
        .toUpperCase();

    const params =
      credential.params &&
      typeof credential.params ===
        'object' &&
      !Array.isArray(
        credential.params
      )
        ? credential.params
        : {};

    if (
      kdf !==
        'PBKDF2_SHA256_V1' ||
      Number(
        params.iterations
      ) !== 310000 ||
      String(
        params.hash || ''
      )
        .trim()
        .toUpperCase() !==
        'SHA-256' ||
      Number(
        params.keyLength
      ) !== 32
    ) {
      throw new Error(
        'Parâmetros da credencial offline são inválidos.'
      );
    }

    const saltText =
      String(
        credential.salt || ''
      ).trim();

    const verifierText =
      String(
        credential.verifier || ''
      ).trim();

    let saltBuffer = null;
    let verifierBuffer = null;
    let encryptedVerifier = null;

    try {
      saltBuffer =
        decodeCanonicalBase64(
          saltText,
          16
        );

      verifierBuffer =
        decodeCanonicalBase64(
          verifierText,
          32
        );

      if (
        !saltBuffer ||
        !verifierBuffer
      ) {
        throw new Error(
          'Formato da credencial offline é inválido.'
        );
      }

      if (
        !safeStorage ||
        !safeStorage.isEncryptionAvailable()
      ) {
        throw new Error(
          'safeStorage indisponível.'
        );
      }

      encryptedVerifier =
        safeStorage.encryptString(
          verifierText
        );

      if (
        !Buffer.isBuffer(
          encryptedVerifier
        ) ||
        encryptedVerifier.length < 1
      ) {
        throw new Error(
          'safeStorage não protegeu a credencial.'
        );
      }

      const stored =
        upsertOfflineOperatorCredential({
          empresaId,
          operadorId,
          nome,
          perfil,
          acessoTotal:
            perfil ===
              'ADMINISTRADOR' &&
            payload.acessoTotal !==
              false,
          ativo: true,
          credentialKdf:
            'PBKDF2_SHA256_V1_SAFE_STORAGE',
          credentialSalt:
            saltText,
          credentialVerifier:
            encryptedVerifier
              .toString(
                'base64'
              ),
          credentialParams: {
            iterations: 310000,
            hash: 'SHA-256',
            keyLength: 32,
            wrapper:
              'safeStorage'
          },
          credentialRevision:
            String(
              credential.revision ||
              credential.credentialRevision ||
              crypto.randomUUID()
            ).trim(),
          sourceUpdatedAt:
            new Date(now())
              .toISOString()
        });

      log(
        'OFFLINE CREDENTIAL EXPLICITLY PROVISIONED',
        {
          empresaId:
            stored.empresaId,
          operadorId:
            stored.operadorId,
          perfil:
            stored.perfil
        }
      );

      return stored;
    } finally {
      for (
        const buffer of
        [
          saltBuffer,
          verifierBuffer,
          encryptedVerifier
        ]
      ) {
        if (buffer) {
          try {
            buffer.fill(0);
          } catch (_) {}
        }
      }
    }
  }

  async function persistPendingOfflineOperatorCredentialAfterOnlineLogin() {
    const candidate =
      verifierController &&
      verifierController
        .getPendingOfflineOperatorVerifierCandidate();

    if (!candidate) {
      return {
        skipped: true,
        reason:
          'NO_PENDING_VERIFIER'
      };
    }

    if (credentialPersistInFlight) {
      return credentialPersistInFlight;
    }

    credentialPersistInFlight =
      (async () => {
        if (
          verifierController
            .isPendingOfflineOperatorVerifierCandidateExpired(
              candidate
            )
        ) {
          verifierController
            .clearPendingOfflineOperatorVerifierCandidate(
              candidate
            );

          return {
            skipped: true,
            reason:
              'PENDING_VERIFIER_EXPIRED'
          };
        }

        let identity = null;
        const identityRetryDelaysMs =
          [0, 750, 1500];

        for (
          let attempt = 0;
          attempt < identityRetryDelaysMs.length;
          attempt += 1
        ) {
          if (
            verifierController
              .isPendingOfflineOperatorVerifierCandidateExpired(
                candidate
              )
          ) {
            verifierController
              .clearPendingOfflineOperatorVerifierCandidate(
                candidate
              );

            return {
              skipped: true,
              reason:
                'PENDING_VERIFIER_EXPIRED'
            };
          }

          if (
            !verifierController
              .isCurrentPendingOfflineOperatorVerifierCandidate(
                candidate
              )
          ) {
            verifierController
              .clearPendingOfflineOperatorVerifierCandidate(
                candidate
              );

            return {
              skipped: true,
              reason:
                'NEWER_LOGIN_ATTEMPT_EXISTS'
            };
          }

          const retryDelayMs =
            identityRetryDelaysMs[attempt];

          if (retryDelayMs > 0) {
            log(
              'OFFLINE OPERATOR IDENTITY CAPTURE RETRY',
              {
                attempt:
                  attempt + 1,
                delayMs:
                  retryDelayMs
              }
            );

            await new Promise(
              (resolve) =>
                setTimeout(
                  resolve,
                  retryDelayMs
                )
            );
          }

          identity =
            await captureOnlineOperatorIdentity({
              timeoutMs: 5000
            });

          if (identity) {
            break;
          }
        }

        if (!identity) {
          return {
            skipped: true,
            reason:
              'ONLINE_OPERATOR_IDENTITY_NOT_READY',
            attempts:
              identityRetryDelaysMs.length
          };
        }

        if (
          !verifierController
            .isCurrentPendingOfflineOperatorVerifierCandidate(
              candidate
            )
        ) {
          verifierController
            .clearPendingOfflineOperatorVerifierCandidate(
              candidate
            );

          return {
            skipped: true,
            reason:
              'NEWER_LOGIN_ATTEMPT_EXISTS'
          };
        }

        const empresaId =
          String(
            identity.empresaId || ''
          ).trim();

        if (!empresaId) {
          return {
            skipped: true,
            reason:
              'ONLINE_EMPRESA_NOT_READY'
          };
        }

        const stored =
          upsertOfflineOperatorCredential({
            empresaId,
            operadorId:
              identity.operadorId,
            nome:
              identity.operatorName,
            perfil:
              identity.perfil,
            acessoTotal:
              identity.acessoTotal === true,
            ativo: true,
            credentialKdf:
              candidate.kdf,
            credentialSalt:
              candidate.salt,
            credentialVerifier:
              candidate.verifier,
            credentialParams:
              candidate.params,
            credentialRevision:
              candidate.credentialRevision,
            sourceUpdatedAt:
              new Date(now())
                .toISOString()
          });

        verifyStoredOfflineCredential(
          stored
        );

        try {
          onOfflineCredentialVerified(
            stored
          );
        } catch (error) {
          log(
            'OFFLINE READINESS REFRESH AFTER CREDENTIAL FAILED',
            {
              erro:
                String(
                  error &&
                  error.message ||
                  error
                )
            }
          );
        }

        rememberConfirmedOnlineOperatorIdentity({
          empresaId:
            stored.empresaId,
          operadorId:
            stored.operadorId,
          operatorId:
            stored.operadorId,
          nomeOperador:
            stored.nome,
          operadorNome:
            stored.nome,
          operatorName:
            stored.nome,
          perfil:
            stored.perfil,
          acessoTotal:
            stored.acessoTotal === true
        });

        log(
          'OFFLINE OPERATOR CREDENTIAL CACHED',
          {
            empresaId:
              stored.empresaId,
            operadorId:
              stored.operadorId,
            perfil:
              stored.perfil,
            acessoTotal:
              stored.acessoTotal === true
          }
        );

        let centralPublished = false;

        try {
          const syncIdentity =
            getSyncIdentity &&
            getSyncIdentity();

          const deviceId =
            String(
              syncIdentity &&
              syncIdentity.deviceId ||
              ''
            ).trim();

          const deviceToken =
            String(
              syncIdentity &&
              syncIdentity.deviceToken ||
              ''
            ).trim();

          if (
            Buffer.isBuffer(
              candidate.serverVerifierBuffer
            ) &&
            candidate.serverVerifierBuffer.length ===
              32 &&
            deviceId &&
            deviceToken
          ) {
            const ack =
              await postAuthenticatedDeviceJson({
                endpoint:
                  'https://api.e-fisco.app/sync/device/offline-credential/provision',
                deviceId,
                deviceToken,
                timeoutMs:
                  15_000,
                payload: {
                  empresaId:
                    stored.empresaId,
                  operadorId:
                    stored.operadorId,
                  nomeOperador:
                    stored.nome,
                  perfil:
                    stored.perfil,
                  credential: {
                    kdf:
                      'PBKDF2_SHA256_V1',
                    salt:
                      candidate.salt,
                    verifier:
                      candidate
                        .serverVerifierBuffer
                        .toString(
                          'base64'
                        ),
                    params: {
                      iterations:
                        310000,
                      hash:
                        'SHA-256',
                      keyLength:
                        32
                    },
                    revision:
                      candidate
                        .credentialRevision
                  }
                }
              });

            centralPublished =
              Boolean(
                ack &&
                String(
                  ack.status || ''
                )
                  .trim()
                  .toUpperCase() ===
                    'OK' &&
                ack.stored === true
              );
          }
        } catch (error) {
          log(
            'OFFLINE OPERATOR CREDENTIAL CENTRAL DEFERRED',
            {
              empresaId:
                stored.empresaId,
              operadorId:
                stored.operadorId,
              erro:
                String(
                  error &&
                  error.message ||
                  error
                )
            }
          );
        } finally {
          verifierController
            .clearPendingOfflineOperatorVerifierCandidate(
              candidate
            );
        }

        if (centralPublished) {
          log(
            'OFFLINE OPERATOR CREDENTIAL CENTRALIZED',
            {
              empresaId:
                stored.empresaId,
              operadorId:
                stored.operadorId,
              perfil:
                stored.perfil
            }
          );
        }

        return {
          cached: true,
          verified: true,
          centralPublished,
          operadorId:
            stored.operadorId,
          perfil:
            stored.perfil
        };
      })()
        .finally(() => {
          credentialPersistInFlight =
            null;
        });

    return credentialPersistInFlight;
  }

  return Object.freeze({
    storeProvisionedOfflineCredentialFromBootstrap,
    persistExplicitOfflineCredentialProvision,
    persistPendingOfflineOperatorCredentialAfterOnlineLogin,
    verifyStoredOfflineCredential
  });
}

module.exports = {
  createOperatorProvisioningController
};
