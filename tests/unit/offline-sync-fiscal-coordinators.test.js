'use strict';

const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createProductCacheCoordinator
} = require('../../offline/sync/product-cache');

const {
  createReferenceCacheCoordinator
} = require('../../offline/sync/reference-cache');

const {
  createOutboxCoordinator
} = require('../../offline/sync/outbox-coordinator');

const {
  createFiscalRuntimeCoordinator
} = require('../../offline/fiscal/fiscal-runtime-coordinator');

const {
  createFiscalCounterBridge
} = require('../../offline/fiscal/fiscal-counter-bridge');

test('product cache preserva pull paginado, contador fiscal e corte por cursor sem progresso', async () => {
  const pulls = [];
  const reconciles = [];
  const stores = [];
  let current = 1000;

  const coordinator =
    createProductCacheCoordinator({
      async pullSyncReferences(input) {
        pulls.push(input);
        return {
          products: [
            {
              id: 'P-1'
            }
          ],
          fiscalProfile: {
            serieNfce: '1',
            proximoNumeroNfce: 10
          },
          done: {
            products: true
          },
          cursors: {
            products: 'CUR-1'
          }
        };
      },
      upsertReferenceBatch(input) {
        stores.push(input);
        return {
          products: 1
        };
      },
      buildFiscalCounterSyncPayload() {
        return {
          ambiente: 'PRODUCAO',
          modelo: 65,
          serie: '1',
          proximoNumero: 9
        };
      },
      reconcileFiscalCounterFromReference(
        empresaId,
        deviceId,
        profile
      ) {
        reconciles.push({
          empresaId,
          deviceId,
          profile
        });
      },
      now() {
        return current;
      }
    });

  const result =
    await coordinator.sync({
      deviceId: 'DEV-1',
      deviceToken: 'TOKEN-1',
      empresaId: 'EMP-1'
    });

  assert.deepEqual(
    result,
    {
      empresaId: 'EMP-1',
      pages: 1,
      products: 1
    }
  );
  assert.equal(
    pulls[0].limit,
    250
  );
  assert.equal(
    pulls[0].completed.customers,
    true
  );
  assert.equal(
    stores[0].empresaId,
    'EMP-1'
  );
  assert.equal(
    reconciles.length,
    1
  );
  assert.equal(
    coordinator.getLastSyncedAt(),
    1000
  );

  current += 100;
  assert.deepEqual(
    await coordinator.syncCoalesced({
      deviceId: 'DEV-1',
      deviceToken: 'TOKEN-1',
      empresaId: 'EMP-1'
    }),
    {
      skipped: true,
      reason:
        'RECENT_PRODUCT_MIRROR'
    }
  );
});

test('reference cache completo preserva snapshot de crediário e atualiza freshness de produtos', async () => {
  const logs = [];
  const finalized = [];
  const marked = [];

  const coordinator =
    createReferenceCacheCoordinator({
      crypto,
      async pullSyncReferences() {
        return {
          products: [{ id: 'P1' }],
          customers: [{ id: 'C1' }],
          suppliers: [{ id: 'S1' }],
          crediarios: [{ id: 'CR1' }],
          fiscalProfile: {
            serieNfce: '1',
            proximoNumeroNfce: 12
          },
          done: {
            products: true,
            customers: true,
            suppliers: true,
            crediarios: true
          },
          cursors: {
            products: 'P',
            customers: 'C',
            suppliers: 'S',
            crediarios: 'CR'
          }
        };
      },
      upsertReferenceBatch(input) {
        assert.match(
          input.crediariosSnapshotToken,
          /^cred-/
        );
        return {
          products: 1,
          customers: 1,
          suppliers: 1,
          crediarios: 1
        };
      },
      finalizeCrediariosSnapshot(input) {
        finalized.push(input);
        return 2;
      },
      buildFiscalCounterSyncPayload() {
        return {
          proximoNumero: 11
        };
      },
      reconcileFiscalCounterFromReference() {},
      markProductSyncedAt(value) {
        marked.push(value);
      },
      log(...args) {
        logs.push(args);
      },
      now() {
        return 5000;
      }
    });

  const result =
    await coordinator.syncAll({
      deviceId: 'DEV',
      deviceToken: 'TOKEN',
      empresaId: 'EMP'
    });

  assert.equal(result.pages, 1);
  assert.equal(result.products, 1);
  assert.equal(result.customers, 1);
  assert.equal(result.suppliers, 1);
  assert.equal(result.crediarios, 1);
  assert.equal(
    result.crediariosRemovidos,
    2
  );
  assert.equal(
    finalized.length,
    1
  );
  assert.deepEqual(marked, [5000]);
  assert.equal(
    logs[0][0],
    'OFFLINE FISCAL COUNTER PULL REQUEST'
  );
  assert.equal(
    logs[1][0],
    'OFFLINE FISCAL COUNTER PULL RESPONSE'
  );
});

test('reference cache F5 preserva somente customers/crediarios e coalescing de cinco segundos', async () => {
  let current = 10_000;
  const stored = [];

  const coordinator =
    createReferenceCacheCoordinator({
      crypto,
      async pullSyncReferences(input) {
        assert.equal(
          input.completed.products,
          true
        );
        assert.equal(
          input.completed.suppliers,
          true
        );

        return {
          customers: [{ id: 'C1' }],
          crediarios: [{ id: 'CR1' }],
          fiscalProfile: null,
          done: {
            customers: true,
            crediarios: true
          },
          cursors: {
            customers: 'C1',
            crediarios: 'CR1'
          }
        };
      },
      upsertReferenceBatch(input) {
        stored.push(input);
        return {
          customers: 1,
          crediarios: 1
        };
      },
      finalizeCrediariosSnapshot() {
        return 0;
      },
      buildFiscalCounterSyncPayload() {
        return null;
      },
      reconcileFiscalCounterFromReference() {},
      now() {
        return current;
      }
    });

  const first =
    await coordinator.syncF5Coalesced({
      deviceId: 'DEV',
      deviceToken: 'TOKEN',
      empresaId: 'EMP'
    });

  assert.equal(first.pages, 1);
  assert.deepEqual(
    stored[0].products,
    []
  );
  assert.deepEqual(
    stored[0].suppliers,
    []
  );

  current += 1000;

  assert.deepEqual(
    await coordinator.syncF5Coalesced({
      deviceId: 'DEV',
      deviceToken: 'TOKEN',
      empresaId: 'EMP'
    }),
    {
      skipped: true,
      reason:
        'RECENT_F5_MIRROR'
    }
  );
});

test('outbox coordinator mantém contagem ativa e enfileira NFCE_AUTHORIZED com dependência da venda', () => {
  const enqueued = [];

  const coordinator =
    createOutboxCoordinator({
      resolveSyncIdentity() {
        return {
          empresaId: 'EMP',
          deviceId: 'DEV',
          deviceToken: 'TOKEN'
        };
      },
      getAuthorizationState() {
        return 'VALID';
      },
      getOutboxStatusSummary() {
        return {
          PENDING: 2,
          RETRY: 3,
          SENDING: 1,
          CONFIRMED: 9
        };
      },
      listAuthorizedNfcePendingSync() {
        return [
          {
            saleId: 'SALE-1',
            fiscalId: 'FISCAL-1',
            ambiente: 'PRODUCAO',
            modelo: 65,
            serie: '1',
            numero: 44,
            chaveAcesso: 'CHAVE',
            tipoEmissao: 9,
            dataHoraEmissao: '2026-09-26T12:00:00-03:00',
            protocolo: 'PROTO',
            cStat: '100',
            xMotivo: '',
            autorizadoEm: '2026-09-26T12:01:00-03:00',
            processedXml:
              Buffer.from('<nfeProc/>'),
            saleSyncOperationId:
              'sale-sync-1'
          }
        ];
      },
      enqueueOutboxOperation(input) {
        enqueued.push(input);
        return {
          applied: true
        };
      },
      createHttpSyncTransport() {
        return async () => ({
          status: 'CONFIRMED'
        });
      },
      async processOutboxOnce() {
        return {
          considered: 0
        };
      }
    });

  assert.equal(
    coordinator.activeCount(
      coordinator.statusSummary()
    ),
    6
  );

  assert.deepEqual(
    coordinator
      .enqueueAuthorizedNfceResultSync(),
    {
      considered: 1,
      enqueued: 1
    }
  );

  assert.equal(
    enqueued[0].operationId,
    'nfce-auth:FISCAL-1'
  );
  assert.equal(
    enqueued[0].type,
    'NFCE_AUTHORIZED'
  );
  assert.deepEqual(
    enqueued[0].dependencies,
    ['sale-sync-1']
  );
  assert.equal(
    enqueued[0]
      .payload
      .nfeProcXml,
    '<nfeProc/>'
  );
});

test('outbox coordinator não sincroniza quando device auth está INVALID', async () => {
  let transportCreated = 0;
  let processed = 0;

  const coordinator =
    createOutboxCoordinator({
      resolveSyncIdentity() {
        return {
          empresaId: 'EMP',
          deviceId: 'DEV',
          deviceToken: 'TOKEN'
        };
      },
      getAuthorizationState() {
        return 'INVALID';
      },
      getOutboxStatusSummary() {
        return {
          PENDING: 4
        };
      },
      listAuthorizedNfcePendingSync() {
        return [];
      },
      enqueueOutboxOperation() {
        return {
          applied: false
        };
      },
      createHttpSyncTransport() {
        transportCreated += 1;
        return async () => ({});
      },
      async processOutboxOnce() {
        processed += 1;
        return {
          considered: 0
        };
      }
    });

  assert.deepEqual(
    await coordinator.syncPending(),
    {
      PENDING: 4
    }
  );

  assert.equal(
    transportCreated,
    0
  );
  assert.equal(processed, 0);
});

test('outbox coordinator converte authFailure do transporte em erro de device auth', async () => {
  let captured = null;

  const coordinator =
    createOutboxCoordinator({
      resolveSyncIdentity() {
        return {
          empresaId: 'EMP',
          deviceId: 'DEV',
          deviceToken: 'TOKEN'
        };
      },
      getAuthorizationState() {
        return 'VALID';
      },
      getOutboxStatusSummary() {
        return {};
      },
      listAuthorizedNfcePendingSync() {
        return [];
      },
      enqueueOutboxOperation() {
        return {
          applied: false
        };
      },
      createHttpSyncTransport() {
        return async () => ({
          authFailure: true,
          error:
            'credencial recusada',
          httpStatus: 403
        });
      },
      async processOutboxOnce({
        transport
      }) {
        try {
          await transport({
            operationId: 'OP-1'
          });
        } catch (error) {
          captured = error;
          throw error;
        }

        return {
          considered: 0
        };
      }
    });

  await assert.rejects(
    coordinator.syncPending(),
    /credencial recusada/
  );

  assert.equal(
    captured.code,
    'SYNC_DEVICE_AUTH_FAILED'
  );
  assert.equal(
    captured.httpStatus,
    403
  );
});

test('fiscal runtime preserva payload e reconciliação do contador NFC-e', () => {
  const reconciles = [];

  const coordinator =
    createFiscalRuntimeCoordinator({
      getFiscalProfileCache() {
        return {
          ambiente:
            'PRODUCAO',
          serieNfce: '3'
        };
      },
      peekNextNfceNumber(input) {
        assert.equal(
          input.modelo,
          65
        );
        return {
          proximoNumero: 77
        };
      },
      reconcileLocalNfceCounter(
        input
      ) {
        reconciles.push(input);
        return {
          reconciled: true
        };
      },
      resolveSyncIdentity() {
        return null;
      },
      async runFiscalReconnectCycle() {},
      getUserDataDir() {
        return 'C:\\data';
      },
      safeStorage: {}
    });

  assert.deepEqual(
    coordinator
      .buildCounterSyncPayload(
        'EMP',
        'DEV'
      ),
    {
      ambiente:
        'PRODUCAO',
      modelo: 65,
      serie: '3',
      proximoNumero: 77
    }
  );

  assert.deepEqual(
    coordinator
      .reconcileCounterFromReference(
        'EMP',
        'DEV',
        {
          serieNfce: '3',
          proximoNumeroNfce: 80
        }
      ),
    {
      reconciled: true
    }
  );

  assert.deepEqual(
    reconciles[0],
    {
      empresaId: 'EMP',
      deviceId: 'DEV',
      ambiente: 'PRODUCAO',
      modelo: 65,
      serie: '3',
      proximoNumero: 80
    }
  );
});

test('fiscal runtime mantém owner único do lease e parâmetros do reconnect fiscal', async () => {
  const calls = [];
  const safeStorage = {};

  const coordinator =
    createFiscalRuntimeCoordinator({
      enabled: true,
      resolveSyncIdentity() {
        return {
          empresaId: 'EMP',
          deviceId: 'DEV'
        };
      },
      getFiscalProfileCache() {
        return null;
      },
      peekNextNfceNumber() {},
      reconcileLocalNfceCounter() {},
      async runFiscalReconnectCycle(
        input
      ) {
        calls.push(input);
        return {
          enabled: true,
          recoveredStale: 0,
          summary: {
            considered: 0
          }
        };
      },
      getUserDataDir() {
        return 'C:\\data';
      },
      safeStorage
    });

  assert.deepEqual(
    await coordinator
      .maintainLeaseInventory(),
    {
      action: 'SKIP',
      reason:
        'SINGLE_DESKTOP_NUMBER_OWNER'
    }
  );

  await coordinator
    .maintainTransmission();

  assert.deepEqual(
    calls[0],
    {
      enabled: true,
      empresaId: 'EMP',
      deviceId: 'DEV',
      userDataDir: 'C:\\data',
      safeStorage,
      timeoutMs: 30000,
      staleAfterMs: 300000,
      retryDelayMs: 60000,
      reconcileDelayMs: 30000,
      limit: 20
    }
  );
});

test('fiscal runtime safety lock loga uma única vez quando transmissão real está desabilitada', async () => {
  const logs = [];

  const coordinator =
    createFiscalRuntimeCoordinator({
      enabled: false,
      resolveSyncIdentity() {
        return null;
      },
      getFiscalProfileCache() {
        return null;
      },
      peekNextNfceNumber() {},
      reconcileLocalNfceCounter() {},
      async runFiscalReconnectCycle() {
        throw new Error(
          'não deve executar'
        );
      },
      getUserDataDir() {
        return 'C:\\data';
      },
      safeStorage: {},
      log(...args) {
        logs.push(args);
      }
    });

  await coordinator
    .maintainTransmission();
  await coordinator
    .maintainTransmission();

  assert.equal(
    logs.filter(
      entry =>
        entry[0] ===
          'OFFLINE FISCAL SVRS TRANSMISSION LOCKED'
    ).length,
    1
  );
});

function fiscalFrameHarness({
  action = 'NEXT',
  numero = 0,
  origin =
    'https://plataforma.e-fisco.app'
} = {}) {
  const scripts = [];

  const frame = {
    origin,
    isDestroyed() {
      return false;
    },
    async executeJavaScript(
      source
    ) {
      scripts.push(source);

      if (
        source.includes(
          '__scfElectronPendingNfceCounterRequests'
        )
      ) {
        return {
          requestId: 'REQ-1',
          action,
          saleId: 'SALE-1',
          numero,
          status: '',
          origin
        };
      }

      return true;
    }
  };

  return {
    frame,
    scripts
  };
}

test('fiscal counter bridge NEXT exige frame PDV confiável e responde no evento congelado', async () => {
  const {
    frame,
    scripts
  } =
    fiscalFrameHarness();

  const logs = [];

  const bridge =
    createFiscalCounterBridge({
      responseEventName:
        '__EFISCO_NFCE_COUNTER_RESPONSE_V1__',
      getMainWindow() {
        return {
          isDestroyed() {
            return false;
          },
          webContents: {
            isDestroyed() {
              return false;
            }
          }
        };
      },
      async findTrustedPdvFrame() {
        return frame;
      },
      getOfflineDatabase() {
        return {
          db: true
        };
      },
      getSyncEmpresaId() {
        return 'EMP';
      },
      getSyncIdentity() {
        return {
          deviceId: 'DEV'
        };
      },
      getOrCreateSyncDeviceId() {
        return 'FALLBACK';
      },
      getFiscalProfileCache() {
        return {
          serieNfce: '1'
        };
      },
      peekNextNfceNumber(input) {
        assert.equal(
          input.empresaId,
          'EMP'
        );
        return {
          proximoNumero: 91
        };
      },
      consumeNextNfceNumber() {
        throw new Error(
          'não deve consumir'
        );
      },
      log(...args) {
        logs.push(args);
      }
    });

  const result =
    await bridge.process(
      frame,
      'REQ-1'
    );

  assert.equal(
    result.numero,
    91
  );

  assert.equal(
    scripts[1].includes(
      '__EFISCO_NFCE_COUNTER_RESPONSE_V1__'
    ),
    true
  );

  assert.equal(
    logs[0][0],
    'NFCE COUNTER FRAME OK'
  );
});

test('fiscal counter bridge bloqueia frame não confiável antes de tocar contador', async () => {
  const {
    frame
  } =
    fiscalFrameHarness();

  let peekCalls = 0;

  const bridge =
    createFiscalCounterBridge({
      responseEventName:
        '__EFISCO_NFCE_COUNTER_RESPONSE_V1__',
      getMainWindow() {
        return {
          isDestroyed() {
            return false;
          },
          webContents: {
            isDestroyed() {
              return false;
            }
          }
        };
      },
      async findTrustedPdvFrame() {
        return {
          other: true
        };
      },
      getOfflineDatabase() {
        return {};
      },
      getSyncEmpresaId() {
        return 'EMP';
      },
      getSyncIdentity() {
        return {
          deviceId: 'DEV'
        };
      },
      getOrCreateSyncDeviceId() {
        return 'FALLBACK';
      },
      getFiscalProfileCache() {
        return {
          serieNfce: '1'
        };
      },
      peekNextNfceNumber() {
        peekCalls += 1;
        return {
          proximoNumero: 1
        };
      },
      consumeNextNfceNumber() {},
      log() {}
    });

  await assert.rejects(
    bridge.process(
      frame,
      'REQ-1'
    ),
    /não pertence ao PDV online confiável/
  );

  assert.equal(
    peekCalls,
    0
  );
});

test('fiscal counter bridge CONSUME preserva número pedido e responderErro usa o mesmo evento', async () => {
  const {
    frame,
    scripts
  } =
    fiscalFrameHarness({
      action: 'CONSUME',
      numero: 55
    });

  const consumed = [];

  const bridge =
    createFiscalCounterBridge({
      responseEventName:
        '__EFISCO_NFCE_COUNTER_RESPONSE_V1__',
      getMainWindow() {
        return {
          isDestroyed() {
            return false;
          },
          webContents: {
            isDestroyed() {
              return false;
            }
          }
        };
      },
      async findTrustedPdvFrame() {
        return frame;
      },
      getOfflineDatabase() {
        return {};
      },
      getSyncEmpresaId() {
        return 'EMP';
      },
      getSyncIdentity() {
        return null;
      },
      getOrCreateSyncDeviceId() {
        return 'DEV-FALLBACK';
      },
      getFiscalProfileCache() {
        return {
          serieNfce: '2'
        };
      },
      peekNextNfceNumber() {
        return {
          proximoNumero: 1
        };
      },
      consumeNextNfceNumber(
        input
      ) {
        consumed.push(input);
        return {
          numero:
            input.numero,
          consumed: true
        };
      },
      log() {}
    });

  const result =
    await bridge.process(
      frame,
      'REQ-1'
    );

  assert.equal(
    result.numero,
    55
  );
  assert.equal(
    consumed[0].deviceId,
    'DEV-FALLBACK'
  );
  assert.equal(
    consumed[0].numero,
    55
  );

  await bridge.respondError(
    frame,
    'REQ-ERR',
    new Error('falha fiscal')
  );

  assert.equal(
    scripts.at(-1).includes(
      '__EFISCO_NFCE_COUNTER_RESPONSE_V1__'
    ),
    true
  );
  assert.equal(
    scripts.at(-1).includes(
      'falha fiscal'
    ),
    true
  );
});
