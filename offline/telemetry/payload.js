'use strict';

const crypto =
  require('crypto');

const OFFLINE_TELEMETRY_SCHEMA_VERSION =
  1;

const DEFAULT_MAX_PAYLOAD_BYTES =
  48 * 1024;

const DEFAULT_MAX_HISTORY_EVENTS =
  20;

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

function sha256Hex(
  value
) {
  return crypto
    .createHash(
      'sha256'
    )
    .update(
      String(
        value == null
          ? ''
          : value
      ),
      'utf8'
    )
    .digest(
      'hex'
    );
}

function hmacSha256Hex(
  key,
  value
) {
  return crypto
    .createHmac(
      'sha256',
      String(
        key == null
          ? ''
          : key
      )
    )
    .update(
      String(
        value == null
          ? ''
          : value
      ),
      'utf8'
    )
    .digest(
      'hex'
    );
}

function buildTelemetryRefs(
  identity = {}
) {
  const deviceId =
    asText(
      identity &&
      identity.deviceId,
      256
    );

  const empresaId =
    asText(
      identity &&
      identity.empresaId,
      256
    );

  const deviceRef =
    deviceId
      ? 'sha256:' +
        sha256Hex(
          'efisco-telemetry-v1:device:' +
          deviceId
        )
      : null;

  const companyRef =
    deviceId &&
    empresaId
      ? 'hmac-sha256:' +
        hmacSha256Hex(
          deviceId,
          'efisco-telemetry-v1:company:' +
          empresaId
        )
      : null;

  return Object.freeze({
    deviceRef,
    companyRef
  });
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
    code:
      asText(
        diagnostic.code,
        64
      ),
    category:
      asText(
        diagnostic.category,
        32
      ),
    severity:
      asText(
        diagnostic.severity,
        16
      )
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
    packaged:
      value.packaged ===
      true
  });
}

function sanitizeCheck(
  name,
  value
) {
  const check =
    value &&
    typeof value ===
      'object'
      ? value
      : {};

  const base = {
    ok:
      check.ok === true,
    reason:
      asText(
        check.reason,
        80
      ),
    code:
      check.diagnostic &&
      typeof check.diagnostic ===
        'object'
        ? asText(
            check.diagnostic.code,
            64
          )
        : null
  };

  if (
    name ===
      'credential'
  ) {
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
        )
    });
  }

  if (
    name ===
      'server'
  ) {
    return Object.freeze({
      ...base,
      listening:
        check.listening ===
        true
    });
  }

  if (
    name ===
      'renderer'
  ) {
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

function sanitizeChecks(
  report
) {
  const source =
    report &&
    report.selfTest &&
    report.selfTest.checks &&
    typeof report.selfTest
      .checks ===
        'object'
      ? report.selfTest.checks
      : {};

  const checks = {};

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
    checks[name] =
      sanitizeCheck(
        name,
        source[name]
      );
  }

  return Object.freeze(
    checks
  );
}

function sanitizeRendererProbe(
  report
) {
  const probe =
    report &&
    report.selfTest &&
    report.selfTest
      .rendererProbe &&
    typeof report.selfTest
      .rendererProbe ===
        'object'
      ? report.selfTest
          .rendererProbe
      : null;

  if (!probe) {
    return null;
  }

  return Object.freeze({
    attempted:
      probe.attempted ===
      true,
    ok:
      probe.ok === true
        ? true
        : probe.ok === false
          ? false
          : null,
    reason:
      asText(
        probe.reason,
        80
      ),
    shellReady:
      probe.shellReady ===
      true,
    preloadReady:
      probe.preloadReady ===
      true,
    pdvReady:
      probe.pdvReady ===
      true,
    pdvMarkerReady:
      probe.pdvMarkerReady ===
      true,
    pdvScriptReady:
      probe.pdvScriptReady ===
      true
  });
}

function sanitizeAutoRepair(
  report
) {
  const autoRepair =
    report &&
    report.autoRepair &&
    typeof report.autoRepair ===
      'object'
      ? report.autoRepair
      : null;

  if (!autoRepair) {
    return null;
  }

  const actions =
    Array.isArray(
      autoRepair.actions
    )
      ? autoRepair.actions
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
      autoRepair.unresolved
    )
      ? autoRepair.unresolved
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

  return Object.freeze({
    status:
      asText(
        autoRepair.status,
        100
      ),
    repaired:
      autoRepair.repaired ===
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
        uniqueCodes(
          autoRepair
            .remainingCodes
        )
      )
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
    !type ||
    ![
      'READINESS_CHANGE',
      'RENDERER_FAILURE',
      'SELF_TEST',
      'AUTO_REPAIR',
      'REPORT_GENERATED'
    ].includes(
      type
    )
  ) {
    return null;
  }

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

function buildCoreState(
  report
) {
  const summary =
    report &&
    report.summary &&
    typeof report.summary ===
      'object'
      ? report.summary
      : {};

  const selfTest =
    report &&
    report.selfTest &&
    typeof report.selfTest ===
      'object'
      ? report.selfTest
      : {};

  return Object.freeze({
    ready:
      summary.ready ===
      true,
    status:
      asText(
        summary.status,
        100
      ),
    codes:
      Object.freeze(
        uniqueCodes(
          summary.codes
        )
      ),
    primaryDiagnostic:
      sanitizeDiagnostic(
        summary.primaryDiagnostic
      ),
    checks:
      sanitizeChecks(
        report
      ),
    rendererProbe:
      sanitizeRendererProbe(
        report
      ),
    autoRepair:
      sanitizeAutoRepair(
        report
      ),
    selfTestDurationMs:
      Math.max(
        0,
        Number(
          selfTest.durationMs
        ) || 0
      )
  });
}

function buildOfflineTelemetryPayload({
  report,
  identity = {},
  now =
    () => Date.now(),
  randomUUID =
    () => crypto.randomUUID(),
  maxPayloadBytes =
    DEFAULT_MAX_PAYLOAD_BYTES,
  maxHistoryEvents =
    DEFAULT_MAX_HISTORY_EVENTS
} = {}) {
  if (
    !report ||
    typeof report !==
      'object'
  ) {
    throw new TypeError(
      'Relatório offline é obrigatório para telemetria.'
    );
  }

  const normalizedMaxBytes =
    Math.max(
      4096,
      Math.min(
        128 * 1024,
        Number(
          maxPayloadBytes
        ) ||
          DEFAULT_MAX_PAYLOAD_BYTES
      )
    );

  const parsedHistoryLimit =
    Number(
      maxHistoryEvents
    );

  const normalizedHistoryLimit =
    Math.max(
      0,
      Math.min(
        40,
        Number.isFinite(
          parsedHistoryLimit
        )
          ? parsedHistoryLimit
          : DEFAULT_MAX_HISTORY_EVENTS
      )
    );

  const refs =
    buildTelemetryRefs(
      identity
    );

  const runtime =
    sanitizeRuntime(
      report.runtime
    );

  const state =
    buildCoreState(
      report
    );

  const sourceHistory =
    Array.isArray(
      report.history
    )
      ? report.history
          .map(
            sanitizeHistoryEvent
          )
          .filter(Boolean)
      : [];

  const dedupeSource =
    Object.freeze({
      schemaVersion:
        OFFLINE_TELEMETRY_SCHEMA_VERSION,
      refs,
      appVersion:
        runtime.appVersion,
      state
    });

  const dedupeKey =
    'sha256:' +
    sha256Hex(
      JSON.stringify(
        dedupeSource
      )
    );

  const createdAt =
    new Date(
      now()
    ).toISOString();

  const eventId =
    asText(
      randomUUID(),
      80
    );

  if (!eventId) {
    throw new Error(
      'eventId de telemetria inválido.'
    );
  }

  let historyLimit =
    Math.min(
      normalizedHistoryLimit,
      sourceHistory.length
    );

  while (historyLimit >= 0) {
    const history =
      historyLimit > 0
        ? sourceHistory.slice(
            -historyLimit
          )
        : [];

    const unsignedPayload =
      Object.freeze({
        schemaVersion:
          OFFLINE_TELEMETRY_SCHEMA_VERSION,
        eventId,
        createdAt,
        source:
          'e-fisco-desktop-offline',
        refs,
        runtime,
        state,
        history:
          Object.freeze([
            ...history
          ]),
        dedupeKey
      });

    const payloadHash =
      'sha256:' +
      sha256Hex(
        JSON.stringify(
          unsignedPayload
        )
      );

    const payload =
      Object.freeze({
        ...unsignedPayload,
        integrity:
          Object.freeze({
            algorithm:
              'SHA-256',
            payloadHash
          })
      });

    const bytes =
      Buffer.byteLength(
        JSON.stringify(
          payload
        ),
        'utf8'
      );

    if (
      bytes <=
      normalizedMaxBytes
    ) {
      return Object.freeze({
        payload,
        sizeBytes:
          bytes,
        maxPayloadBytes:
          normalizedMaxBytes,
        historyIncluded:
          history.length,
        historyDropped:
          Math.max(
            0,
            sourceHistory.length -
            history.length
          )
      });
    }

    if (historyLimit === 0) {
      break;
    }

    historyLimit -= 1;
  }

  throw new Error(
    'Payload de telemetria excede o limite mesmo sem histórico.'
  );
}

module.exports = {
  OFFLINE_TELEMETRY_SCHEMA_VERSION,
  DEFAULT_MAX_PAYLOAD_BYTES,
  DEFAULT_MAX_HISTORY_EVENTS,
  buildTelemetryRefs,
  buildOfflineTelemetryPayload
};
