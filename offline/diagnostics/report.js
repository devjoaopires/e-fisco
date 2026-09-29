'use strict';

function asText(
  value,
  maxLength = 160
) {
  const text =
    String(
      value == null
        ? ''
        : value
    )
      .trim();

  if (!text) {
    return null;
  }

  return text.slice(
    0,
    Math.max(
      1,
      Number(
        maxLength
      ) || 160
    )
  );
}

function uniqueCodes(
  values
) {
  if (
    !Array.isArray(
      values
    )
  ) {
    return [];
  }

  return [
    ...new Set(
      values
        .map(
          (value) =>
            asText(
              value,
              64
            )
        )
        .filter(Boolean)
    )
  ];
}

function sanitizeDiagnostic(
  value
) {
  if (
    !value ||
    typeof value !==
      'object'
  ) {
    return null;
  }

  return Object.freeze({
    code:
      asText(
        value.code,
        64
      ),
    category:
      asText(
        value.category,
        32
      ),
    severity:
      asText(
        value.severity,
        16
      ),
    message:
      asText(
        value.message,
        240
      )
  });
}

function sanitizeChecks(
  selfTest
) {
  const source =
    selfTest &&
    selfTest.checks &&
    typeof selfTest.checks ===
      'object'
      ? selfTest.checks
      : {};

  const result = {};

  for (
    const name of [
      'database',
      'company',
      'safeStorage',
      'credential',
      'server',
      'renderer'
    ]
  ) {
    const check =
      source[name] &&
      typeof source[name] ===
        'object'
        ? source[name]
        : {};

    const entry = {
      ok:
        check.ok === true,
      reason:
        asText(
          check.reason,
          80
        ),
      diagnostic:
        sanitizeDiagnostic(
          check.diagnostic
        )
    };

    if (
      name ===
        'credential'
    ) {
      entry.activeCount =
        Math.max(
          0,
          Number(
            check.activeCount
          ) || 0
        );
      entry.usableCount =
        Math.max(
          0,
          Number(
            check.usableCount
          ) || 0
        );
    }

    if (
      name ===
        'server'
    ) {
      entry.listening =
        check.listening ===
        true;
    }

    if (
      name ===
        'renderer'
    ) {
      entry.readyFlag =
        check.readyFlag ===
        true;
      entry.healthFresh =
        check.healthFresh ===
        true;
      entry.healthHealthy =
        check.healthHealthy ===
        true;
      entry.recoveryRunning =
        check.recoveryRunning ===
        true;
    }

    result[name] =
      Object.freeze(
        entry
      );
  }

  return Object.freeze(
    result
  );
}

function sanitizeSelfTest(
  selfTest
) {
  if (
    !selfTest ||
    typeof selfTest !==
      'object'
  ) {
    return null;
  }

  return Object.freeze({
    schemaVersion:
      Number(
        selfTest.schemaVersion
      ) || 1,
    catalogVersion:
      Number(
        selfTest.catalogVersion
      ) || 1,
    status:
      asText(
        selfTest.status,
        80
      ),
    ready:
      selfTest.ready === true,
    source:
      asText(
        selfTest.source,
        80
      ),
    startedAt:
      asText(
        selfTest.startedAt,
        64
      ),
    completedAt:
      asText(
        selfTest.completedAt,
        64
      ),
    durationMs:
      Math.max(
        0,
        Number(
          selfTest.durationMs
        ) || 0
      ),
    codes:
      Object.freeze(
        uniqueCodes(
          selfTest.codes
        )
      ),
    primaryDiagnostic:
      sanitizeDiagnostic(
        selfTest.primaryDiagnostic
      ),
    checks:
      sanitizeChecks(
        selfTest
      ),
    rendererProbe:
      selfTest.rendererProbe &&
      typeof selfTest
        .rendererProbe ===
          'object'
        ? Object.freeze({
            attempted:
              selfTest.rendererProbe
                .attempted ===
              true,
            ok:
              selfTest.rendererProbe
                .ok === true
                ? true
                : selfTest
                    .rendererProbe
                    .ok === false
                  ? false
                  : null,
            reason:
              asText(
                selfTest
                  .rendererProbe
                  .reason,
                80
              ),
            shellReady:
              selfTest.rendererProbe
                .shellReady ===
              true,
            preloadReady:
              selfTest.rendererProbe
                .preloadReady ===
              true,
            pdvReady:
              selfTest.rendererProbe
                .pdvReady ===
              true,
            pdvMarkerReady:
              selfTest.rendererProbe
                .pdvMarkerReady ===
              true,
            pdvScriptReady:
              selfTest.rendererProbe
                .pdvScriptReady ===
              true
          })
        : null
  });
}

function sanitizeAutoRepair(
  summary
) {
  if (
    !summary ||
    typeof summary !==
      'object'
  ) {
    return null;
  }

  const actions =
    Array.isArray(
      summary.actions
    )
      ? summary.actions
          .map(
            (action) => {
              if (
                !action ||
                typeof action !==
                  'object'
              ) {
                return null;
              }

              return Object.freeze({
                action:
                  asText(
                    action.action,
                    80
                  ),
                attempted:
                  action.attempted ===
                  true,
                success:
                  action.success ===
                  true,
                reason:
                  asText(
                    action.reason,
                    120
                  ),
                codes:
                  Object.freeze(
                    uniqueCodes(
                      action.codes
                    )
                  )
              });
            }
          )
          .filter(Boolean)
      : [];

  const unresolved =
    Array.isArray(
      summary.unresolved
    )
      ? summary.unresolved
          .map(
            (item) => {
              if (
                !item ||
                typeof item !==
                  'object'
              ) {
                return null;
              }

              return Object.freeze({
                code:
                  asText(
                    item.code,
                    64
                  ),
                classification:
                  asText(
                    item.classification,
                    80
                  )
              });
            }
          )
          .filter(Boolean)
      : [];

  const afterCodes =
    summary.after &&
    typeof summary.after ===
      'object'
      ? uniqueCodes(
          summary.after.codes
        )
      : [];

  return Object.freeze({
    schemaVersion:
      Number(
        summary.schemaVersion
      ) || 1,
    status:
      asText(
        summary.status,
        100
      ),
    repaired:
      summary.repaired ===
      true,
    actions:
      Object.freeze([
        ...actions
      ]),
    unresolved:
      Object.freeze([
        ...unresolved
      ]),
    remainingCodes:
      Object.freeze(
        afterCodes
      )
  });
}

function sanitizeReadiness(
  readiness
) {
  if (
    !readiness ||
    typeof readiness !==
      'object'
  ) {
    return null;
  }

  const checks =
    readiness.checks &&
    typeof readiness.checks ===
      'object'
      ? Object.freeze({
          database:
            readiness.checks
              .database === true,
          preparedCompany:
            readiness.checks
              .preparedCompany ===
            true,
          safeStorage:
            readiness.checks
              .safeStorage === true,
          credential:
            readiness.checks
              .credential === true,
          server:
            readiness.checks
              .server === true,
          renderer:
            readiness.checks
              .renderer === true
        })
      : null;

  return Object.freeze({
    status:
      asText(
        readiness.status,
        80
      ),
    checkedAt:
      asText(
        readiness.checkedAt,
        64
      ),
    source:
      asText(
        readiness.source,
        80
      ),
    diagnosticCodes:
      Object.freeze(
        uniqueCodes(
          readiness
            .diagnosticCodes
        )
      ),
    primaryDiagnostic:
      sanitizeDiagnostic(
        readiness
          .primaryDiagnostic
      ),
    checks
  });
}

function sanitizeRuntime(
  runtime
) {
  const value =
    runtime &&
    typeof runtime ===
      'object'
      ? runtime
      : {};

  return Object.freeze({
    appVersion:
      asText(
        value.appVersion,
        40
      ),
    platform:
      asText(
        value.platform,
        24
      ),
    arch:
      asText(
        value.arch,
        24
      ),
    osRelease:
      asText(
        value.osRelease,
        80
      ),
    electronVersion:
      asText(
        value.electronVersion,
        40
      ),
    chromeVersion:
      asText(
        value.chromeVersion,
        40
      ),
    nodeVersion:
      asText(
        value.nodeVersion,
        40
      ),
    packaged:
      value.packaged ===
      true
  });
}

function sanitizeHistoryEvent(
  event
) {
  if (
    !event ||
    typeof event !==
      'object'
  ) {
    return null;
  }

  const type =
    asText(
      event.type,
      48
    );

  if (!type) {
    return null;
  }

  const at =
    asText(
      event.at,
      64
    );

  const data =
    event.data &&
    typeof event.data ===
      'object'
      ? event.data
      : {};

  if (
    type ===
      'READINESS_CHANGE'
  ) {
    return Object.freeze({
      at,
      type,
      data:
        Object.freeze({
          status:
            asText(
              data.status,
              80
            ),
          source:
            asText(
              data.source,
              80
            ),
          codes:
            Object.freeze(
              uniqueCodes(
                data.codes
              )
            ),
          primaryCode:
            asText(
              data.primaryCode,
              64
            )
        })
    });
  }

  if (
    type ===
      'RENDERER_FAILURE'
  ) {
    return Object.freeze({
      at,
      type,
      data:
        Object.freeze({
          code:
            asText(
              data.code,
              64
            ),
          failureType:
            asText(
              data.failureType,
              80
            ),
          severity:
            asText(
              data.severity,
              24
            )
        })
    });
  }

  if (
    type ===
      'SELF_TEST'
  ) {
    return Object.freeze({
      at,
      type,
      data:
        Object.freeze({
          status:
            asText(
              data.status,
              100
            ),
          ready:
            data.ready ===
            true,
          codes:
            Object.freeze(
              uniqueCodes(
                data.codes
              )
            ),
          primaryCode:
            asText(
              data.primaryCode,
              64
            ),
          durationMs:
            Math.max(
              0,
              Number(
                data.durationMs
              ) || 0
            )
        })
    });
  }

  if (
    type ===
      'AUTO_REPAIR'
  ) {
    return Object.freeze({
      at,
      type,
      data:
        Object.freeze({
          status:
            asText(
              data.status,
              100
            ),
          repaired:
            data.repaired ===
            true,
          actions:
            Array.isArray(
              data.actions
            )
              ? Object.freeze(
                  data.actions
                    .map(
                      (item) =>
                        asText(
                          item,
                          80
                        )
                    )
                    .filter(Boolean)
                )
              : Object.freeze([]),
          remainingCodes:
            Object.freeze(
              uniqueCodes(
                data.remainingCodes
              )
            )
        })
    });
  }

  if (
    type ===
      'REPORT_GENERATED'
  ) {
    return Object.freeze({
      at,
      type,
      data:
        Object.freeze({
          ready:
            data.ready ===
            true,
          codes:
            Object.freeze(
              uniqueCodes(
                data.codes
              )
            )
        })
    });
  }

  return null;
}

function createOfflineDiagnosticReportService({
  fs,
  path,
  getUserDataDir,
  getRuntimeInfo,
  now =
    () => Date.now(),
  maxHistory = 40
} = {}) {
  if (
    !fs ||
    typeof fs.writeFileSync !==
      'function' ||
    !path ||
    typeof path.join !==
      'function' ||
    typeof getUserDataDir !==
      'function'
  ) {
    throw new TypeError(
      'Dependências de persistência do relatório são obrigatórias.'
    );
  }

  const historyLimit =
    Math.max(
      5,
      Math.min(
        100,
        Number(
          maxHistory
        ) || 40
      )
    );

  let history = [];

  function reportDirectory() {
    return path.join(
      getUserDataDir(),
      'offline-diagnostics'
    );
  }

  function reportPath() {
    return path.join(
      reportDirectory(),
      'offline-diagnostic-report.json'
    );
  }

  function loadHistory() {
    try {
      const file =
        reportPath();

      if (
        typeof fs.existsSync ===
          'function' &&
        !fs.existsSync(
          file
        )
      ) {
        return;
      }

      const parsed =
        JSON.parse(
          fs.readFileSync(
            file,
            'utf8'
          )
        );

      if (
        !parsed ||
        !Array.isArray(
          parsed.history
        )
      ) {
        return;
      }

      history =
        parsed.history
          .map(
            sanitizeHistoryEvent
          )
          .filter(Boolean)
          .slice(
            -historyLimit
          );
    } catch (_) {
      history = [];
    }
  }

  loadHistory();

  function record(
    type,
    data = {}
  ) {
    const event =
      sanitizeHistoryEvent({
        at:
          new Date(
            now()
          ).toISOString(),
        type,
        data
      });

    if (!event) {
      return null;
    }

    history.push(
      event
    );

    if (
      history.length >
      historyLimit
    ) {
      history =
        history.slice(
          -historyLimit
        );
    }

    return event;
  }

  function build({
    readiness = null,
    selfTest = null,
    autoRepair = null
  } = {}) {
    const sanitizedSelfTest =
      sanitizeSelfTest(
        selfTest
      );

    const sanitizedReadiness =
      sanitizeReadiness(
        readiness
      );

    const codes =
      sanitizedSelfTest
        ? sanitizedSelfTest.codes
        : sanitizedReadiness
          ? sanitizedReadiness
              .diagnosticCodes
          : [];

    const ready =
      sanitizedSelfTest
        ? sanitizedSelfTest.ready
        : Boolean(
            sanitizedReadiness &&
            sanitizedReadiness.status ===
              'OFFLINE_READY'
          );

    return Object.freeze({
      schemaVersion: 1,
      generatedAt:
        new Date(
          now()
        ).toISOString(),
      runtime:
        sanitizeRuntime(
          typeof getRuntimeInfo ===
            'function'
            ? getRuntimeInfo()
            : {}
        ),
      summary:
        Object.freeze({
          ready,
          status:
            sanitizedSelfTest
              ? sanitizedSelfTest.status
              : sanitizedReadiness &&
                sanitizedReadiness
                  .status ||
                'UNKNOWN',
          codes:
            Object.freeze([
              ...codes
            ]),
          primaryDiagnostic:
            sanitizedSelfTest
              ? sanitizedSelfTest
                  .primaryDiagnostic
              : sanitizedReadiness &&
                sanitizedReadiness
                  .primaryDiagnostic ||
                null
        }),
      readiness:
        sanitizedReadiness,
      selfTest:
        sanitizedSelfTest,
      autoRepair:
        sanitizeAutoRepair(
          autoRepair
        ),
      history:
        Object.freeze([
          ...history
        ])
    });
  }

  function persist(
    snapshot = {}
  ) {
    const directory =
      reportDirectory();

    fs.mkdirSync(
      directory,
      {
        recursive: true
      }
    );

    const report =
      build(
        snapshot
      );

    const file =
      reportPath();

    fs.writeFileSync(
      file,
      JSON.stringify(
        report,
        null,
        2
      ) + '\n',
      'utf8'
    );

    return Object.freeze({
      path:
        file,
      report
    });
  }

  return Object.freeze({
    record,
    build,
    persist,
    getReportPath:
      reportPath,
    getHistory() {
      return Object.freeze([
        ...history
      ]);
    }
  });
}

module.exports = {
  sanitizeDiagnostic,
  sanitizeSelfTest,
  sanitizeAutoRepair,
  sanitizeReadiness,
  sanitizeHistoryEvent,
  createOfflineDiagnosticReportService
};
