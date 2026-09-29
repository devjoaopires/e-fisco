'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  createOperatorProvisioningController
} = require('../../offline/auth-session/operator-provisioning');

const {
  createOperatorVerifierController
} = require('../../offline/auth-session/operator-verifier');

const {
  buildOfflineTelemetryPayload
} = require('../../offline/telemetry/payload');

const {
  createOfflineTelemetryQueue
} = require('../../offline/telemetry/queue');

const {
  createOfflineTelemetrySender
} = require('../../offline/telemetry/sender');

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

function buildBootstrapCredential({
  senha,
  empresaId,
  operadorId
}) {
  const salt =
    crypto.createHash('sha256')
      .update(
        'release-e2e:' +
        empresaId,
        'utf8'
      )
      .digest()
      .subarray(0, 16);

  const verifier =
    crypto.pbkdf2Sync(
      senha,
      salt,
      310000,
      32,
      'sha256'
    );

  return {
    operadorId,
    nome: 'OPERADOR RELEASE E2E',
    perfil: 'CAIXA',
    acessoTotal: false,
    ativo: true,
    offlineCredential: {
      kdf: 'PBKDF2_SHA256_V1',
      salt:
        salt.toString('base64'),
      verifier:
        verifier.toString('base64'),
      params: {
        iterations: 310000,
        hash: 'SHA-256',
        keyLength: 32
      },
      revision: 'RELEASE-E2E-REV-1',
      updatedAt:
        '2026-09-28T20:00:00.000Z'
    }
  };
}

function buildDiagnosticReport() {
  return {
    runtime: {
      appVersion: '1.0.44',
      platform: 'win32',
      arch: 'x64',
      osRelease: 'release-e2e',
      electronVersion: '43.4.1',
      chromeVersion: '142',
      packaged: true
    },
    summary: {
      ready: false,
      status:
        'OFFLINE_SELF_TEST_NOT_READY',
      codes: [
        'OFFLINE-SERVER-002'
      ],
      primaryDiagnostic: {
        code:
          'OFFLINE-SERVER-002',
        category: 'SERVER',
        severity: 'ERROR'
      }
    },
    selfTest: {
      durationMs: 12,
      checks: {
        database: {
          ok: true,
          reason:
            'DATABASE_READY',
          diagnostic: null
        },
        company: {
          ok: true,
          reason:
            'COMPANY_READY',
          diagnostic: null
        },
        safeStorage: {
          ok: true,
          reason:
            'SAFE_STORAGE_READY',
          diagnostic: null
        },
        credential: {
          ok: true,
          reason:
            'CREDENTIAL_READY',
          activeCount: 1,
          usableCount: 1,
          diagnostic: null
        },
        server: {
          ok: false,
          reason:
            'SERVER_NOT_LISTENING',
          listening: false,
          diagnostic: {
            code:
              'OFFLINE-SERVER-002'
          }
        },
        renderer: {
          ok: true,
          reason:
            'RENDERER_READY',
          readyFlag: true,
          healthFresh: true,
          healthHealthy: true,
          recoveryRunning: false,
          diagnostic: null
        }
      },
      rendererProbe: {
        attempted: true,
        ok: true,
        reason: 'HEALTHY',
        shellReady: true,
        preloadReady: true,
        pdvReady: true,
        pdvMarkerReady: true,
        pdvScriptReady: true
      }
    },
    autoRepair: null,
    history: []
  };
}

test(
  'release 1.0.44: provisionamento online, login offline, fila durável e recuperação',
  async () => {
    const pkg =
      require('../../package.json');

    assert.equal(
      pkg.version,
      '1.0.44'
    );

    const empresaId =
      'RELEASE-E2E-COMPANY';

    const operadorId =
      'RELEASE-E2E-OPERATOR';

    const senha =
      '4321';

    const stored = [];
    const safeStorage =
      fakeSafeStorage();

    const provisioning =
      createOperatorProvisioningController({
        safeStorage,
        crypto,
        upsertOfflineOperatorCredential(
          input
        ) {
          const normalized = {
            ...input
          };

          const index =
            stored.findIndex(
              (item) =>
                item.empresaId ===
                  normalized.empresaId &&
                item.operadorId ===
                  normalized.operadorId
            );

          if (index >= 0) {
            stored[index] =
              normalized;
          } else {
            stored.push(
              normalized
            );
          }

          return normalized;
        },
        listActiveOfflineOperatorCredentials(
          inputEmpresaId
        ) {
          return stored.filter(
            (item) =>
              item.empresaId ===
                inputEmpresaId &&
              item.ativo === true
          );
        },
        verifierController: {},
        captureOnlineOperatorIdentity:
          async () => null,
        rememberConfirmedOnlineOperatorIdentity() {},
        postAuthenticatedDeviceJson:
          async () => null
      });

    const provisioned =
      provisioning
        .storeProvisionedOfflineCredentialFromBootstrap(
          empresaId,
          buildBootstrapCredential({
            senha,
            empresaId,
            operadorId
          })
        );

    assert.ok(
      provisioned
    );

    assert.equal(
      stored.length,
      1
    );

    assert.equal(
      provisioned.credentialKdf,
      'PBKDF2_SHA256_V1_SAFE_STORAGE'
    );

    const verifier =
      createOperatorVerifierController({
        safeStorage,
        crypto,
        listPreparedOfflineCompanies() {
          return [
            {
              empresaId
            }
          ];
        },
        listActiveOfflineOperatorCredentials(
          inputEmpresaId
        ) {
          return stored.filter(
            (item) =>
              item.empresaId ===
                inputEmpresaId &&
              item.ativo === true
          );
        }
      });

    const offlineLogin =
      verifier
        .validateOfflineOperatorPasswordAcrossPreparedCompanies({
          senha
        });

    assert.equal(
      offlineLogin.success,
      true
    );

    assert.equal(
      offlineLogin.empresaId,
      empresaId
    );

    assert.equal(
      offlineLogin.operadorId,
      operadorId
    );

    assert.deepEqual(
      verifier
        .validateOfflineOperatorPasswordAcrossPreparedCompanies({
          senha: '9999'
        }),
      {
        success: false,
        reason: 'ACCESS_DENIED'
      }
    );

    const dir =
      fs.mkdtempSync(
        path.join(
          os.tmpdir(),
          'efisco-release-e2e-'
        )
      );

    let clock =
      Date.parse(
        '2026-09-28T21:00:00.000Z'
      );

    try {
      const telemetry =
        buildOfflineTelemetryPayload({
          report:
            buildDiagnosticReport(),
          identity: {
            deviceId:
              'RELEASE-E2E-DEVICE',
            empresaId
          },
          now() {
            return clock;
          }
        });

      assert.equal(
        telemetry.payload.runtime
          .appVersion,
        '1.0.44'
      );

      const queue =
        createOfflineTelemetryQueue({
          fs,
          path,
          getUserDataDir() {
            return dir;
          },
          now() {
            return clock;
          }
        });

      const enqueueResult =
        queue.enqueue(
          telemetry.payload
        );

      assert.equal(
        enqueueResult.ok,
        true
      );

      assert.equal(
        queue.getStats()
          .pendingCount,
        1
      );

      const offlineSender =
        createOfflineTelemetrySender({
          queue,
          now() {
            return clock;
          },
          random() {
            return 0.5;
          },
          async postAuthenticatedDeviceJson() {
            const error =
              new Error(
                'simulated offline network'
              );

            error.code =
              'ECONNREFUSED';

            throw error;
          }
        });

      const deferred =
        await offlineSender.flush({
          deviceId:
            'RELEASE-E2E-DEVICE',
          deviceToken:
            'RELEASE-E2E-TEST-TOKEN'
        });

      assert.equal(
        deferred.status,
        'PARTIAL_OR_DEFERRED'
      );

      assert.equal(
        queue.getStats()
          .pendingCount,
        1
      );

      const durableQueue =
        createOfflineTelemetryQueue({
          fs,
          path,
          getUserDataDir() {
            return dir;
          },
          now() {
            return clock;
          }
        });

      assert.equal(
        durableQueue.getStats()
          .pendingCount,
        1
      );

      clock +=
        20 * 1000;

      let deliveredEvents = [];

      const recoveredSender =
        createOfflineTelemetrySender({
          queue:
            durableQueue,
          now() {
            return clock;
          },
          async postAuthenticatedDeviceJson({
            payload
          }) {
            deliveredEvents =
              payload.events;

            return {
              status: 'OK',
              acceptedEventIds:
                payload.events.map(
                  (event) =>
                    event.eventId
                ),
              duplicateEventIds: []
            };
          }
        });

      const recovered =
        await recoveredSender.flush({
          deviceId:
            'RELEASE-E2E-DEVICE',
          deviceToken:
            'RELEASE-E2E-TEST-TOKEN'
        });

      assert.equal(
        recovered.status,
        'FLUSHED'
      );

      assert.equal(
        recovered.accepted,
        1
      );

      assert.equal(
        durableQueue.getStats()
          .pendingCount,
        0
      );

      assert.equal(
        deliveredEvents.length,
        1
      );

      assert.equal(
        deliveredEvents[0].state
          .codes.includes(
            'OFFLINE-SERVER-002'
          ),
        true
      );

      const queueText =
        fs.readFileSync(
          durableQueue
            .getStats()
            .path,
          'utf8'
        );

      assert.equal(
        queueText.includes(
          senha
        ),
        false
      );

      console.log(
        'RELEASE_E2E_DESKTOP=' +
        JSON.stringify({
          version:
            pkg.version,
          provisioned:
            true,
          offlineLogin:
            true,
          wrongPasswordRejected:
            true,
          queuedDuringOutage:
            true,
          survivedQueueReload:
            true,
          flushedAfterRecovery:
            true,
          remainingPending:
            durableQueue
              .getStats()
              .pendingCount
        })
      );
    } finally {
      fs.rmSync(
        dir,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);
