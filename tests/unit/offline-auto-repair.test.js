'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyUnresolvedCodes,
  createOfflineAutoRepairRunner
} = require('../../offline/diagnostics/auto-repair');

function report({
  ready = false,
  codes = []
} = {}) {
  return {
    schemaVersion: 1,
    ready,
    status:
      ready
        ? 'OFFLINE_SELF_TEST_READY'
        : 'OFFLINE_SELF_TEST_NOT_READY',
    empresaId:
      'empresa-1',
    codes: [
      ...codes
    ],
    checks: {
      company: {
        empresaId:
          'empresa-1'
      }
    }
  };
}

test('auto-reparo não executa ação quando ambiente já está pronto', async () => {
  let repairCalls = 0;

  const runner =
    createOfflineAutoRepairRunner({
      async runSelfTest() {
        return report({
          ready: true
        });
      },
      async repairRenderer() {
        repairCalls += 1;
        return true;
      }
    });

  const result =
    await runner.run();

  assert.equal(
    result.status,
    'OFFLINE_AUTO_REPAIR_NOT_NEEDED'
  );
  assert.equal(
    result.repaired,
    false
  );
  assert.equal(
    repairCalls,
    0
  );
  assert.deepEqual(
    result.actions,
    []
  );
});

test('reinício do servidor cobre rebuild do renderer na mesma passagem', async () => {
  let selfTests = 0;
  let serverCalls = 0;
  let rendererCalls = 0;

  const runner =
    createOfflineAutoRepairRunner({
      async runSelfTest() {
        selfTests += 1;

        if (selfTests === 1) {
          return report({
            codes: [
              'OFFLINE-SERVER-002',
              'OFFLINE-UI-011'
            ]
          });
        }

        return report({
          ready: true
        });
      },
      async repairServer() {
        serverCalls += 1;
        return {
          success: true,
          reason:
            'SERVER_AND_RENDERER_RESTARTED'
        };
      },
      async repairRenderer() {
        rendererCalls += 1;
        return true;
      }
    });

  const result =
    await runner.run();

  assert.equal(
    result.status,
    'OFFLINE_AUTO_REPAIR_REPAIRED'
  );
  assert.equal(
    result.repaired,
    true
  );
  assert.equal(
    serverCalls,
    1
  );
  assert.equal(
    rendererCalls,
    0
  );
  assert.equal(
    result.actions.length,
    1
  );
  assert.equal(
    result.actions[0].action,
    'SERVER_RESTART'
  );
});

test('auto-reparo descobre nova causa na segunda passagem sem repetir ação', async () => {
  let selfTests = 0;
  let dbCalls = 0;
  let companyCalls = 0;

  const runner =
    createOfflineAutoRepairRunner({
      maxPasses: 2,
      async runSelfTest() {
        selfTests += 1;

        if (selfTests === 1) {
          return report({
            codes: [
              'OFFLINE-DB-001'
            ]
          });
        }

        if (selfTests === 2) {
          return report({
            codes: [
              'OFFLINE-COMPANY-002'
            ]
          });
        }

        return report({
          ready: true
        });
      },
      async repairDatabase() {
        dbCalls += 1;
        return {
          success: true,
          reason:
            'DATABASE_REINITIALIZED'
        };
      },
      async repairCompany() {
        companyCalls += 1;
        return {
          success: true,
          reason:
            'COMPANY_PREPARED_FROM_LOCAL_STATE'
        };
      }
    });

  const result =
    await runner.run();

  assert.equal(
    result.status,
    'OFFLINE_AUTO_REPAIR_REPAIRED'
  );
  assert.equal(
    dbCalls,
    1
  );
  assert.equal(
    companyCalls,
    1
  );
  assert.deepEqual(
    result.actions.map(
      (action) =>
        action.action
    ),
    [
      'DATABASE_REINITIALIZE',
      'COMPANY_PREPARE_LOCAL'
    ]
  );
});

test('credencial e safeStorage não recebem reparo destrutivo', async () => {
  const broken =
    report({
      codes: [
        'OFFLINE-AUTH-001',
        'OFFLINE-AUTH-003',
        'OFFLINE-DB-002'
      ]
    });

  const runner =
    createOfflineAutoRepairRunner({
      async runSelfTest() {
        return broken;
      }
    });

  const result =
    await runner.run();

  assert.equal(
    result.status,
    'OFFLINE_AUTO_REPAIR_NO_SAFE_ACTION'
  );
  assert.deepEqual(
    result.actions,
    []
  );
  assert.deepEqual(
    result.unresolved,
    [
      {
        code:
          'OFFLINE-AUTH-001',
        classification:
          'OS_SAFE_STORAGE_REQUIRED'
      },
      {
        code:
          'OFFLINE-AUTH-003',
        classification:
          'ONLINE_REPROVISION_REQUIRED'
      },
      {
        code:
          'OFFLINE-DB-002',
        classification:
          'DATABASE_REQUIRES_INTERVENTION'
      }
    ]
  );
});

test('falha de ação não vaza erro bruto e execução concorrente é coalescida', async () => {
  let selfTests = 0;
  let repairCalls = 0;
  let release;
  const gate =
    new Promise(
      (resolve) => {
        release = resolve;
      }
    );

  const runner =
    createOfflineAutoRepairRunner({
      async runSelfTest() {
        selfTests += 1;

        return report({
          codes: [
            'OFFLINE-UI-011'
          ]
        });
      },
      async repairRenderer() {
        repairCalls += 1;
        await gate;
        throw new Error(
          'segredo bruto do renderer'
        );
      }
    });

  const first =
    runner.run();

  const second =
    runner.run();

  await Promise.resolve();
  release();

  const [
    firstResult,
    secondResult
  ] =
    await Promise.all([
      first,
      second
    ]);

  assert.equal(
    repairCalls,
    1
  );
  assert.deepEqual(
    firstResult,
    secondResult
  );
  assert.equal(
    firstResult.status,
    'OFFLINE_AUTO_REPAIR_FAILED'
  );
  assert.equal(
    firstResult.actions[0]
      .reason,
    'ACTION_FAILED'
  );
  assert.equal(
    JSON.stringify(
      firstResult
    ).includes(
      'segredo bruto do renderer'
    ),
    false
  );
  assert.equal(
    selfTests,
    2
  );
});

test('classificação desconhecida falha para o lado seguro', () => {
  assert.deepEqual(
    classifyUnresolvedCodes(
      report({
        codes: [
          'OFFLINE-FUTURE-001'
        ]
      })
    ),
    [
      {
        code:
          'OFFLINE-FUTURE-001',
        classification:
          'NO_SAFE_REPAIR'
      }
    ]
  );
});
