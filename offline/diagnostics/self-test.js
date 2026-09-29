'use strict';

function normalizeSource(
  value
) {
  return String(
    value || 'manual'
  )
    .trim()
    .slice(0, 64) ||
    'manual';
}

function sanitizeDiagnostic(
  diagnostic
) {
  if (
    !diagnostic ||
    typeof diagnostic !==
      'object'
  ) {
    return null;
  }

  return Object.freeze({
    reason:
      diagnostic.reason
        ? String(
            diagnostic.reason
          )
        : null,
    code:
      diagnostic.code
        ? String(
            diagnostic.code
          )
        : null,
    category:
      diagnostic.category
        ? String(
            diagnostic.category
          )
        : null,
    severity:
      diagnostic.severity
        ? String(
            diagnostic.severity
          )
        : null,
    message:
      diagnostic.message
        ? String(
            diagnostic.message
          )
        : null
  });
}

function sanitizeCheck(
  name,
  check = {}
) {
  const base = {
    ok:
      check.ok === true,
    reason:
      String(
        check.reason ||
        'UNKNOWN'
      ),
    diagnostic:
      sanitizeDiagnostic(
        check.diagnostic
      )
  };

  if (name === 'company') {
    return Object.freeze({
      ...base,
      empresaId:
        check.empresaId
          ? String(
              check.empresaId
            )
          : null
    });
  }

  if (name === 'credential') {
    return Object.freeze({
      ...base,
      activeCount:
        Math.max(
          0,
          Number(
            check.activeCount
          ) || 0
        ),
      usableCount:
        Math.max(
          0,
          Number(
            check.usableCount
          ) || 0
        ),
      operadorId:
        check.operadorId
          ? String(
              check.operadorId
            )
          : null
    });
  }

  if (name === 'server') {
    return Object.freeze({
      ...base,
      host:
        check.host
          ? String(
              check.host
            )
          : null,
      port:
        Number.isInteger(
          Number(
            check.port
          )
        )
          ? Number(
              check.port
            )
          : null,
      listening:
        check.listening ===
        true
    });
  }

  if (name === 'renderer') {
    return Object.freeze({
      ...base,
      readyFlag:
        check.readyFlag ===
        true,
      healthFresh:
        check.healthFresh ===
        true,
      healthHealthy:
        check.healthHealthy ===
        true,
      recoveryRunning:
        check.recoveryRunning ===
        true
    });
  }

  return Object.freeze(
    base
  );
}

function buildOfflineSelfTestReport({
  prerequisites,
  rendererProbe = null,
  source = 'manual',
  startedAtMs,
  completedAtMs
} = {}) {
  if (
    !prerequisites ||
    typeof prerequisites !==
      'object'
  ) {
    throw new TypeError(
      'Diagnóstico de pré-requisitos é obrigatório.'
    );
  }

  const started =
    Number.isFinite(
      Number(
        startedAtMs
      )
    )
      ? Number(
          startedAtMs
        )
      : Date.now();

  const completed =
    Number.isFinite(
      Number(
        completedAtMs
      )
    )
      ? Number(
          completedAtMs
        )
      : Date.now();

  const checks = {};

  for (const name of [
    'database',
    'company',
    'safeStorage',
    'credential',
    'server',
    'renderer'
  ]) {
    checks[name] =
      sanitizeCheck(
        name,
        prerequisites.checks &&
        prerequisites.checks[
          name
        ] ||
        {}
      );
  }

  const issues =
    Array.isArray(
      prerequisites.issues
    )
      ? prerequisites.issues
          .map(
            (issue) => {
              if (
                !issue ||
                typeof issue !==
                  'object'
              ) {
                return null;
              }

              return Object.freeze({
                check:
                  issue.check
                    ? String(
                        issue.check
                      )
                    : null,
                ...sanitizeDiagnostic(
                  issue
                )
              });
            }
          )
          .filter(Boolean)
      : [];

  const codes =
    [
      ...new Set(
        issues
          .map(
            (issue) =>
              issue.code
          )
          .filter(Boolean)
      )
    ];

  const probe =
    rendererProbe &&
    typeof rendererProbe ===
      'object'
      ? Object.freeze({
          attempted:
            rendererProbe.attempted ===
            true,
          ok:
            rendererProbe.ok === true
              ? true
              : rendererProbe.ok ===
                false
                ? false
                : null,
          reason:
            rendererProbe.reason
              ? String(
                  rendererProbe.reason
                )
              : null,
          shellReady:
            rendererProbe.shellReady ===
            true,
          preloadReady:
            rendererProbe.preloadReady ===
            true,
          pdvReady:
            rendererProbe.pdvReady ===
            true,
          pdvMarkerReady:
            rendererProbe.pdvMarkerReady ===
            true,
          pdvScriptReady:
            rendererProbe.pdvScriptReady ===
            true
        })
      : Object.freeze({
          attempted: false,
          ok: null,
          reason:
            'NOT_ATTEMPTED',
          shellReady: false,
          preloadReady: false,
          pdvReady: false,
          pdvMarkerReady: false,
          pdvScriptReady: false
        });

  return Object.freeze({
    schemaVersion: 1,
    catalogVersion:
      Number(
        prerequisites.catalogVersion
      ) || 1,
    source:
      normalizeSource(
        source
      ),
    status:
      prerequisites.ready ===
        true
        ? 'OFFLINE_SELF_TEST_READY'
        : 'OFFLINE_SELF_TEST_NOT_READY',
    ready:
      prerequisites.ready ===
      true,
    startedAt:
      new Date(
        started
      ).toISOString(),
    completedAt:
      new Date(
        completed
      ).toISOString(),
    durationMs:
      Math.max(
        0,
        completed -
        started
      ),
    empresaId:
      prerequisites.empresaId
        ? String(
            prerequisites.empresaId
          )
        : null,
    operadorId:
      prerequisites.operadorId
        ? String(
            prerequisites.operadorId
          )
        : null,
    codes:
      Object.freeze([
        ...codes
      ]),
    primaryDiagnostic:
      sanitizeDiagnostic(
        prerequisites.primaryIssue
      ),
    issues:
      Object.freeze([
        ...issues
      ]),
    rendererProbe:
      probe,
    checks:
      Object.freeze({
        database:
          checks.database,
        company:
          checks.company,
        safeStorage:
          checks.safeStorage,
        credential:
          checks.credential,
        server:
          checks.server,
        renderer:
          checks.renderer
      })
  });
}

function createOfflineSelfTestRunner({
  probeRenderer,
  collectPrerequisites,
  log = () => {},
  now = () => Date.now()
} = {}) {
  if (
    typeof collectPrerequisites !==
      'function'
  ) {
    throw new TypeError(
      'collectPrerequisites precisa ser função.'
    );
  }

  let inFlight = null;

  async function execute({
    source = 'manual'
  } = {}) {
    if (inFlight) {
      return inFlight;
    }

    const startedAtMs =
      now();

    const run =
      Promise.resolve()
        .then(
          async () => {
            let rendererProbe = {
              attempted: false,
              ok: null,
              reason:
                'NOT_ATTEMPTED'
            };

            if (
              typeof probeRenderer ===
              'function'
            ) {
              try {
                const result =
                  await probeRenderer();

                rendererProbe =
                  result &&
                  typeof result ===
                    'object'
                    ? result
                    : {
                        attempted:
                          true,
                        ok: false,
                        reason:
                          'INVALID_PROBE_RESULT'
                      };
              } catch (error) {
                rendererProbe = {
                  attempted: true,
                  ok: false,
                  reason:
                    'PROBE_ERROR',
                  error:
                    String(
                      error &&
                      error.message ||
                      error
                    )
                };
              }
            }

            const prerequisites =
              collectPrerequisites();

            const report =
              buildOfflineSelfTestReport({
                prerequisites,
                rendererProbe,
                source,
                startedAtMs,
                completedAtMs:
                  now()
              });

            log(
              'OFFLINE SELF TEST COMPLETED',
              {
                source:
                  report.source,
                status:
                  report.status,
                ready:
                  report.ready,
                codes:
                  report.codes,
                primaryCode:
                  report.primaryDiagnostic &&
                  report.primaryDiagnostic.code ||
                  null,
                durationMs:
                  report.durationMs
              }
            );

            return report;
          }
        );

    const trackedRun =
      run.finally(
        () => {
          if (
            inFlight ===
            trackedRun
          ) {
            inFlight = null;
          }
        }
      );

    inFlight =
      trackedRun;

    return trackedRun;
  }

  return Object.freeze({
    run:
      execute,
    isRunning() {
      return Boolean(
        inFlight
      );
    }
  });
}

module.exports = {
  buildOfflineSelfTestReport,
  createOfflineSelfTestRunner
};
