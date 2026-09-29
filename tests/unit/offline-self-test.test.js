'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildOfflineSelfTestReport,
  createOfflineSelfTestRunner
} = require('../../offline/diagnostics/self-test');

function readyPrerequisites() {
  return {
    catalogVersion: 1,
    ready: true,
    checkedAt:
      '2026-09-28T20:00:00.000Z',
    empresaId:
      'empresa-1',
    operadorId:
      'op-1',
    issues: [],
    primaryIssue: null,
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
        empresaId:
          'empresa-1',
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
        activeCount: 2,
        usableCount: 1,
        operadorId:
          'op-1',
        credentialVerifier:
          'SEGREDO-QUE-NAO-PODE-SAIR',
        deviceToken:
          'TOKEN-QUE-NAO-PODE-SAIR',
        diagnostic: null
      },
      server: {
        ok: true,
        reason:
          'SERVER_READY',
        host:
          '127.0.0.1',
        port: 43123,
        origin:
          'http://127.0.0.1:43123',
        listening: true,
        diagnostic: null
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
    }
  };
}

test('auto-teste sanitiza relatório e não expõe segredos de credencial', () => {
  const report =
    buildOfflineSelfTestReport({
      prerequisites:
        readyPrerequisites(),
      rendererProbe: {
        attempted: true,
        ok: true,
        reason: 'HEALTHY',
        shellReady: true,
        preloadReady: true,
        pdvReady: true,
        pdvMarkerReady: true,
        pdvScriptReady: true,
        rawHtml:
          'NAO-DEVE-SAIR'
      },
      source:
        ' offline-ui ',
      startedAtMs:
        Date.parse(
          '2026-09-28T20:00:00.000Z'
        ),
      completedAtMs:
        Date.parse(
          '2026-09-28T20:00:00.125Z'
        )
    });

  assert.equal(
    report.status,
    'OFFLINE_SELF_TEST_READY'
  );
  assert.equal(
    report.ready,
    true
  );
  assert.equal(
    report.source,
    'offline-ui'
  );
  assert.equal(
    report.durationMs,
    125
  );
  assert.deepEqual(
    report.codes,
    []
  );
  assert.equal(
    report.rendererProbe.ok,
    true
  );
  assert.equal(
    report.checks.credential
      .activeCount,
    2
  );
  assert.equal(
    report.checks.credential
      .usableCount,
    1
  );

  const serialized =
    JSON.stringify(
      report
    );

  assert.equal(
    serialized.includes(
      'SEGREDO-QUE-NAO-PODE-SAIR'
    ),
    false
  );
  assert.equal(
    serialized.includes(
      'TOKEN-QUE-NAO-PODE-SAIR'
    ),
    false
  );
  assert.equal(
    serialized.includes(
      'NAO-DEVE-SAIR'
    ),
    false
  );
  assert.equal(
    serialized.includes(
      '"origin"'
    ),
    false
  );
});

test('auto-teste carrega códigos e diagnóstico primário quando não está pronto', () => {
  const prerequisites =
    readyPrerequisites();

  prerequisites.ready =
    false;
  prerequisites.issues = [
    {
      check: 'credential',
      reason:
        'CREDENTIAL_NOT_USABLE',
      code:
        'OFFLINE-AUTH-003',
      category:
        'AUTH',
      severity:
        'ERROR',
      message:
        'A credencial offline existe, mas não pôde ser validada para uso.'
    }
  ];
  prerequisites.primaryIssue =
    prerequisites.issues[0];
  prerequisites.checks
    .credential = {
      ok: false,
      reason:
        'CREDENTIAL_NOT_USABLE',
      activeCount: 1,
      usableCount: 0,
      operadorId: null,
      diagnostic:
        prerequisites.issues[0]
    };

  const report =
    buildOfflineSelfTestReport({
      prerequisites,
      rendererProbe: {
        attempted: true,
        ok: true,
        reason: 'HEALTHY'
      },
      startedAtMs: 1000,
      completedAtMs: 1050
    });

  assert.equal(
    report.status,
    'OFFLINE_SELF_TEST_NOT_READY'
  );
  assert.equal(
    report.ready,
    false
  );
  assert.deepEqual(
    report.codes,
    [
      'OFFLINE-AUTH-003'
    ]
  );
  assert.equal(
    report.primaryDiagnostic.code,
    'OFFLINE-AUTH-003'
  );
  assert.equal(
    report.checks.credential
      .diagnostic.code,
    'OFFLINE-AUTH-003'
  );
});

test('runner compartilha execução em voo e faz um único probe', async () => {
  let clock = 1000;
  let probeCalls = 0;
  let collectCalls = 0;
  let releaseProbe;

  const probeGate =
    new Promise(
      (resolve) => {
        releaseProbe =
          resolve;
      }
    );

  const runner =
    createOfflineSelfTestRunner({
      now() {
        return clock;
      },
      async probeRenderer() {
        probeCalls += 1;

        await probeGate;

        return {
          attempted: true,
          ok: true,
          reason: 'HEALTHY'
        };
      },
      collectPrerequisites() {
        collectCalls += 1;
        return readyPrerequisites();
      }
    });

  const first =
    runner.run({
      source: 'manual'
    });

  const second =
    runner.run({
      source: 'manual'
    });

  await Promise.resolve();

  assert.equal(
    runner.isRunning(),
    true
  );
  assert.equal(
    probeCalls,
    1
  );

  clock = 1100;
  releaseProbe();

  const [
    firstReport,
    secondReport
  ] = await Promise.all([
    first,
    second
  ]);

  assert.equal(
    probeCalls,
    1
  );
  assert.equal(
    collectCalls,
    1
  );
  assert.deepEqual(
    firstReport,
    secondReport
  );
  assert.equal(
    runner.isRunning(),
    false
  );
});

test('runner transforma erro do probe em resultado de diagnóstico sem vazar erro bruto', async () => {
  const logs = [];

  const runner =
    createOfflineSelfTestRunner({
      async probeRenderer() {
        throw new Error(
          'segredo interno do renderer'
        );
      },
      collectPrerequisites() {
        const prerequisites =
          readyPrerequisites();

        prerequisites.ready =
          false;

        return prerequisites;
      },
      log(...args) {
        logs.push(
          args
        );
      }
    });

  const report =
    await runner.run({
      source:
        'support-button'
    });

  assert.equal(
    report.ready,
    false
  );
  assert.equal(
    report.rendererProbe.attempted,
    true
  );
  assert.equal(
    report.rendererProbe.ok,
    false
  );
  assert.equal(
    report.rendererProbe.reason,
    'PROBE_ERROR'
  );

  assert.equal(
    JSON.stringify(
      report
    ).includes(
      'segredo interno do renderer'
    ),
    false
  );

  assert.equal(
    logs.some(
      (entry) =>
        entry[0] ===
        'OFFLINE SELF TEST COMPLETED'
    ),
    true
  );
});
