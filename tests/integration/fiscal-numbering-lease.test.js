'use strict';

const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  initializeOfflineDatabase,
  closeOfflineDatabase,
  upsertFiscalProfileCache,
  upsertFiscalNumberLease,
  getFiscalNumberLeaseById,
  getFiscalNumberLeaseInventory,
  getActiveFiscalNumberLease,
  peekNextNfceNumber,
  consumeNextNfceNumber,
  reconcileLocalNfceCounter
} = require('../../offline-db');

const {
  ensureFiscalNumberLeaseInventory
} = require('../../offline-fiscal-number-maintenance');

const {
  reserveFiscalNumberLeaseOffline
} = require('../../offline-fiscal-number-service');

const {
  withTempDir
} = require('../helpers/temp-dir');

async function withFreshDatabase(callback, prefix = 'efisco-step62-') {
  return withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });
      return await callback(userDataDir);
    } finally {
      try {
        closeOfflineDatabase();
      } catch (_) {}
    }
  }, prefix);
}

function lease(overrides = {}) {
  return {
    empresaId: 'empresa-step62',
    leaseId: 'lease-step62-a',
    requestId: 'request-step62-a',
    deviceId: 'device-step62',
    ambiente: 'PRODUCAO',
    modelo: 65,
    serie: '1',
    numeroInicial: 10,
    numeroFinal: 19,
    proximoNumero: 10,
    status: 'ACTIVE',
    reservadoEm: '2026-09-25T10:00:00.000Z',
    expiraEm: '2027-09-25T10:00:00.000Z',
    payload: {
      source: 'step62'
    },
    ...overrides
  };
}

function seedProfile(empresaId, serie = '1') {
  upsertFiscalProfileCache({
    empresaId,
    cnpj: empresaId === 'empresa-step62-b'
      ? '98765432000110'
      : '12345678000195',
    inscricaoEstadual: '123456789',
    razaoSocial: `Empresa ${empresaId}`,
    nomeFantasia: empresaId,
    cep: '68525000',
    logradouro: 'Rua Teste',
    numero: '100',
    bairro: 'Centro',
    municipio: 'Marabá',
    codigoMunicipio: '1504208',
    uf: 'PA',
    serieNfce: serie,
    ambiente: 'PRODUCAO',
    crt: '1',
    urlQrCode: 'https://sefaz.example/qrcode',
    urlConsultaChave: 'https://sefaz.example/consulta',
    revision: `profile-${empresaId}`,
    payload: {
      source: 'step62'
    }
  });
}

test('lease é idempotente por requestId e rejeita divergência ou sobreposição', async () => {
  await withFreshDatabase(() => {
    const first = upsertFiscalNumberLease(lease());
    const duplicate = upsertFiscalNumberLease(lease());

    assert.deepEqual(duplicate, first);

    assert.throws(
      () => upsertFiscalNumberLease(lease({
        leaseId: 'lease-step62-divergent',
        numeroInicial: 30,
        numeroFinal: 39,
        proximoNumero: 30
      })),
      /requestId|diverge|revisão manual/i
    );

    assert.throws(
      () => upsertFiscalNumberLease(lease({
        leaseId: 'lease-step62-overlap',
        requestId: 'request-step62-overlap',
        numeroInicial: 15,
        numeroFinal: 25,
        proximoNumero: 15
      })),
      /sobrepõe/
    );

    const adjacent = upsertFiscalNumberLease(lease({
      leaseId: 'lease-step62-adjacent',
      requestId: 'request-step62-adjacent',
      numeroInicial: 20,
      numeroFinal: 29,
      proximoNumero: 20
    }));

    assert.equal(adjacent.numeroInicial, 20);
    assert.equal(adjacent.numeroFinal, 29);
  });
});

test('inventário separa faixas ativas, expiradas e exauridas', async () => {
  await withFreshDatabase(() => {
    upsertFiscalNumberLease(lease({
      leaseId: 'lease-active',
      requestId: 'request-active',
      numeroInicial: 10,
      numeroFinal: 14,
      proximoNumero: 12,
      expiraEm: '2027-01-01T00:00:00.000Z'
    }));

    upsertFiscalNumberLease(lease({
      leaseId: 'lease-expired',
      requestId: 'request-expired',
      numeroInicial: 20,
      numeroFinal: 24,
      proximoNumero: 20,
      expiraEm: '2026-01-01T00:00:00.000Z'
    }));

    upsertFiscalNumberLease(lease({
      leaseId: 'lease-exhausted',
      requestId: 'request-exhausted',
      numeroInicial: 30,
      numeroFinal: 34,
      proximoNumero: 35,
      status: 'EXHAUSTED',
      expiraEm: null
    }));

    const inventory = getFiscalNumberLeaseInventory({
      empresaId: 'empresa-step62',
      deviceId: 'device-step62',
      ambiente: 'PRODUCAO',
      modelo: 65,
      serie: '1',
      now: '2026-09-25T12:00:00.000Z'
    });

    assert.deepEqual(inventory, {
      activeLeases: 1,
      remainingNumbers: 3,
      expiredLeases: 1,
      exhaustedLeases: 1,
      totalLeases: 3
    });

    const active = getActiveFiscalNumberLease({
      empresaId: 'empresa-step62',
      deviceId: 'device-step62',
      ambiente: 'PRODUCAO',
      modelo: 65,
      serie: '1',
      now: '2026-09-25T12:00:00.000Z'
    });

    assert.equal(active.leaseId, 'lease-active');
    assert.equal(active.proximoNumero, 12);
  });
});

test('contador consome sequência, trata repetição como idempotente e marca exaustão', async () => {
  await withFreshDatabase(() => {
    upsertFiscalNumberLease(lease({
      numeroInicial: 10,
      numeroFinal: 11,
      proximoNumero: 10,
      expiraEm: null
    }));

    const next = peekNextNfceNumber({
      empresaId: 'empresa-step62',
      deviceId: 'device-step62',
      ambiente: 'PRODUCAO',
      modelo: 65,
      serie: '1'
    });

    assert.equal(next.proximoNumero, 10);

    const first = consumeNextNfceNumber({
      empresaId: 'empresa-step62',
      deviceId: 'device-step62',
      ambiente: 'PRODUCAO',
      modelo: 65,
      serie: '1',
      numero: 10
    });

    assert.deepEqual(first, {
      duplicate: false,
      ownerMode: 'SINGLE_CASHIER',
      numero: 10,
      proximoNumero: 11
    });

    const duplicate = consumeNextNfceNumber({
      empresaId: 'empresa-step62',
      deviceId: 'device-step62',
      ambiente: 'PRODUCAO',
      modelo: 65,
      serie: '1',
      numero: 10
    });

    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.proximoNumero, 11);

    assert.throws(
      () => consumeNextNfceNumber({
        empresaId: 'empresa-step62',
        deviceId: 'device-step62',
        ambiente: 'PRODUCAO',
        modelo: 65,
        serie: '1',
        numero: 12
      }),
      /Sequência fiscal divergente/
    );

    const last = consumeNextNfceNumber({
      empresaId: 'empresa-step62',
      deviceId: 'device-step62',
      ambiente: 'PRODUCAO',
      modelo: 65,
      serie: '1',
      numero: 11
    });

    assert.equal(last.duplicate, false);
    assert.equal(last.proximoNumero, 12);

    const stored = getFiscalNumberLeaseById(
      'empresa-step62',
      'lease-step62-a'
    );

    assert.equal(stored.status, 'EXHAUSTED');
    assert.equal(stored.proximoNumero, 12);

    assert.throws(
      () => peekNextNfceNumber({
        empresaId: 'empresa-step62',
        deviceId: 'device-step62',
        ambiente: 'PRODUCAO',
        modelo: 65,
        serie: '1'
      }),
      /não está disponível/
    );
  });
});

test('CONSUME usa a faixa ativa mesmo quando existe lease histórico exaurido', async () => {
  await withFreshDatabase(() => {
    upsertFiscalNumberLease(lease({
      leaseId: 'lease-old',
      requestId: 'request-old',
      numeroInicial: 1,
      numeroFinal: 2,
      proximoNumero: 3,
      status: 'EXHAUSTED',
      reservadoEm: '2026-01-01T00:00:00.000Z',
      expiraEm: null
    }));

    upsertFiscalNumberLease(lease({
      leaseId: 'lease-current',
      requestId: 'request-current',
      numeroInicial: 10,
      numeroFinal: 12,
      proximoNumero: 10,
      status: 'ACTIVE',
      reservadoEm: '2026-09-01T00:00:00.000Z',
      expiraEm: null
    }));

    assert.equal(
      peekNextNfceNumber({
        empresaId: 'empresa-step62',
        deviceId: 'device-step62',
        ambiente: 'PRODUCAO',
        modelo: 65,
        serie: '1'
      }).proximoNumero,
      10
    );

    const consumed = consumeNextNfceNumber({
      empresaId: 'empresa-step62',
      deviceId: 'device-step62',
      ambiente: 'PRODUCAO',
      modelo: 65,
      serie: '1',
      numero: 10
    });

    assert.equal(consumed.duplicate, false);
    assert.equal(consumed.proximoNumero, 11);

    assert.equal(
      getFiscalNumberLeaseById(
        'empresa-step62',
        'lease-old'
      ).proximoNumero,
      3
    );

    assert.equal(
      getFiscalNumberLeaseById(
        'empresa-step62',
        'lease-current'
      ).proximoNumero,
      11
    );
  });
});

test('reconciliação inicializa contador ausente e nunca regride o próximo número local', async () => {
  await withFreshDatabase(() => {
    const initialized = reconcileLocalNfceCounter({
      empresaId: 'empresa-step62',
      deviceId: 'device-step62',
      ambiente: 'PRODUCAO',
      modelo: 65,
      serie: '1',
      proximoNumero: 100
    });

    assert.equal(initialized.initialized, true);
    assert.equal(initialized.proximoNumero, 100);

    const advanced = reconcileLocalNfceCounter({
      empresaId: 'empresa-step62',
      deviceId: 'device-step62',
      ambiente: 'PRODUCAO',
      modelo: 65,
      serie: '1',
      proximoNumero: 105
    });

    assert.equal(advanced.previousNext, 100);
    assert.equal(advanced.proximoNumero, 105);
    assert.equal(advanced.advanced, true);

    const noRegression = reconcileLocalNfceCounter({
      empresaId: 'empresa-step62',
      deviceId: 'device-step62',
      ambiente: 'PRODUCAO',
      modelo: 65,
      serie: '1',
      proximoNumero: 103
    });

    assert.equal(noRegression.previousNext, 105);
    assert.equal(noRegression.proximoNumero, 105);
    assert.equal(noRegression.advanced, false);
  });
});

test('reconciliação ignora lease histórico exaurido e converge a faixa ativa', async () => {
  await withFreshDatabase(() => {
    upsertFiscalNumberLease(lease({
      leaseId: 'lease-old-reconcile',
      requestId: 'request-old-reconcile',
      numeroInicial: 1,
      numeroFinal: 2,
      proximoNumero: 3,
      status: 'EXHAUSTED',
      reservadoEm: '2026-01-01T00:00:00.000Z',
      expiraEm: null
    }));

    upsertFiscalNumberLease(lease({
      leaseId: 'lease-current-reconcile',
      requestId: 'request-current-reconcile',
      numeroInicial: 10,
      numeroFinal: 20,
      proximoNumero: 10,
      status: 'ACTIVE',
      reservadoEm: '2026-09-01T00:00:00.000Z',
      expiraEm: null
    }));

    const reconciled = reconcileLocalNfceCounter({
      empresaId: 'empresa-step62',
      deviceId: 'device-step62',
      ambiente: 'PRODUCAO',
      modelo: 65,
      serie: '1',
      proximoNumero: 12
    });

    assert.equal(reconciled.previousNext, 10);
    assert.equal(reconciled.proximoNumero, 12);
    assert.equal(reconciled.advanced, true);

    assert.equal(
      getFiscalNumberLeaseById(
        'empresa-step62',
        'lease-old-reconcile'
      ).proximoNumero,
      3
    );

    assert.equal(
      getFiscalNumberLeaseById(
        'empresa-step62',
        'lease-current-reconcile'
      ).proximoNumero,
      12
    );
  });
});

test('manutenção automática isola chamadas concorrentes por empresa/dispositivo', async () => {
  await withFreshDatabase(async () => {
    seedProfile('empresa-step62-a', '1');
    seedProfile('empresa-step62-b', '2');

    const calls = [];
    const releases = new Map();

    function reserveFn(input) {
      calls.push({
        empresaId: input.empresaId,
        deviceId: input.deviceId,
        requestId: input.requestId,
        quantidade: input.quantidade
      });

      return new Promise((resolve) => {
        releases.set(input.empresaId, () => {
          const base = input.empresaId === 'empresa-step62-a'
            ? 100
            : 200;

          upsertFiscalNumberLease({
            empresaId: input.empresaId,
            leaseId: `lease-${input.empresaId}`,
            requestId: input.requestId,
            deviceId: input.deviceId,
            ambiente: 'PRODUCAO',
            modelo: 65,
            serie: input.fiscalProfile.serieNfce,
            numeroInicial: base,
            numeroFinal: base + input.quantidade - 1,
            proximoNumero: base,
            status: 'ACTIVE',
            reservadoEm: '2026-09-25T12:00:00.000Z',
            expiraEm: null,
            payload: {
              source: 'step62-concurrency'
            }
          });

          resolve({
            duplicate: false,
            localReuse: false,
            lease: {
              leaseId: `lease-${input.empresaId}`
            }
          });
        });
      });
    }

    const first = ensureFiscalNumberLeaseInventory({
      empresaId: 'empresa-step62-a',
      deviceId: 'device-a',
      deviceToken: 'token-a',
      now: '2026-09-25T12:00:00.000Z',
      refillThreshold: 15,
      reserveQuantity: 20,
      retryIntervalMs: 0,
      randomUUID: () => 'uuid-a',
      reserveFn
    });

    const second = ensureFiscalNumberLeaseInventory({
      empresaId: 'empresa-step62-b',
      deviceId: 'device-b',
      deviceToken: 'token-b',
      now: '2026-09-25T12:00:00.000Z',
      refillThreshold: 15,
      reserveQuantity: 20,
      retryIntervalMs: 0,
      randomUUID: () => 'uuid-b',
      reserveFn
    });

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(calls.length, 2);
    assert.deepEqual(
      new Set(calls.map((call) => call.empresaId)),
      new Set(['empresa-step62-a', 'empresa-step62-b'])
    );

    releases.get('empresa-step62-a')();
    releases.get('empresa-step62-b')();

    const [firstResult, secondResult] = await Promise.all([
      first,
      second
    ]);

    assert.equal(firstResult.action, 'RESERVED');
    assert.equal(secondResult.action, 'RESERVED');

    assert.equal(
      getFiscalNumberLeaseInventory({
        empresaId: 'empresa-step62-a',
        deviceId: 'device-a',
        ambiente: 'PRODUCAO',
        modelo: 65,
        serie: '1',
        now: '2026-09-25T12:01:00.000Z'
      }).remainingNumbers,
      20
    );

    assert.equal(
      getFiscalNumberLeaseInventory({
        empresaId: 'empresa-step62-b',
        deviceId: 'device-b',
        ambiente: 'PRODUCAO',
        modelo: 65,
        serie: '2',
        now: '2026-09-25T12:01:00.000Z'
      }).remainingNumbers,
      20
    );
  }, 'efisco-step62-concurrency-');
});


test('reserva remota persiste expiraEm e a validade controla o lease ativo', async () => {
  await withFreshDatabase(async () => {
    seedProfile('empresa-step62', '1');

    let receivedBody = null;
    let receivedDeviceId = null;
    let receivedAuthorization = null;

    const server = http.createServer((req, res) => {
      const chunks = [];

      req.on('data', (chunk) => {
        chunks.push(chunk);
      });

      req.on('end', () => {
        receivedBody = JSON.parse(
          Buffer.concat(chunks).toString('utf8')
        );
        receivedDeviceId = req.headers['x-efisco-device-id'];
        receivedAuthorization = req.headers.authorization;

        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({
          status: 'CONFIRMED',
          ack: {
            duplicate: false,
            lease: {
              leaseId: 'lease-remote-expiry',
              ambiente: 'PRODUCAO',
              modelo: 65,
              serie: '1',
              numeroInicial: 300,
              numeroFinal: 302,
              quantidade: 3,
              status: 'ACTIVE',
              reservadoEm: '2026-09-25T12:00:00.000Z',
              expiraEm: '2026-09-25T13:00:00.000Z'
            }
          }
        }));
      });
    });

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    try {
      const address = server.address();
      const endpoint =
        `http://127.0.0.1:${address.port}/fiscal/reserve`;

      const reserved = await reserveFiscalNumberLeaseOffline({
        empresaId: 'empresa-step62',
        deviceId: 'device-step62',
        deviceToken: 'token-step62',
        requestId: 'request-remote-expiry',
        quantidade: 3,
        endpoint,
        timeoutMs: 5000,
        allowInsecureLocalhost: true
      });

      assert.equal(reserved.duplicate, false);
      assert.equal(reserved.localReuse, false);
      assert.equal(reserved.lease.leaseId, 'lease-remote-expiry');
      assert.equal(
        reserved.lease.expiraEm,
        '2026-09-25T13:00:00.000Z'
      );

      assert.deepEqual(receivedBody, {
        requestId: 'request-remote-expiry',
        ambiente: 'PRODUCAO',
        modelo: 65,
        serie: '1',
        quantidade: 3
      });
      assert.equal(receivedDeviceId, 'device-step62');
      assert.equal(receivedAuthorization, 'Bearer token-step62');

      assert.equal(
        getActiveFiscalNumberLease({
          empresaId: 'empresa-step62',
          deviceId: 'device-step62',
          ambiente: 'PRODUCAO',
          modelo: 65,
          serie: '1',
          now: '2026-09-25T12:59:59.999Z'
        }).leaseId,
        'lease-remote-expiry'
      );

      assert.equal(
        getActiveFiscalNumberLease({
          empresaId: 'empresa-step62',
          deviceId: 'device-step62',
          ambiente: 'PRODUCAO',
          modelo: 65,
          serie: '1',
          now: '2026-09-25T13:00:00.000Z'
        }),
        null
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }, 'efisco-step62-remote-expiry-');
});
