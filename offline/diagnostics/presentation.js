'use strict';

function normalizeDiagnosticText(
  value,
  maxLength = 320
) {
  const normalized =
    String(
      value == null
        ? ''
        : value
    )
      .replace(
        /\s+/g,
        ' '
      )
      .trim();

  if (!normalized) {
    return '';
  }

  return normalized
    .slice(
      0,
      Math.max(
        1,
        Number(
          maxLength
        ) || 320
      )
    );
}

function sanitizeTechnicalDetail(
  value
) {
  const text =
    normalizeDiagnosticText(
      value &&
      value.message
        ? value.message
        : value
    );

  if (!text) {
    return '';
  }

  if (
    /(authorization|bearer|device[_ -]?token|password|senha|verifier)/i
      .test(text)
  ) {
    return '';
  }

  return text
    .replace(
      /[A-Za-z]:\\Users\\[^\\\s]+/gi,
      '<perfil>'
    );
}

function shouldShowDiagnosticOverlay(
  uiMode,
  {
    force = false
  } = {}
) {
  if (force === true) {
    return true;
  }

  return [
    'OFFLINE',
    'SWITCHING_OFFLINE'
  ].includes(
    String(
      uiMode || ''
    )
      .trim()
      .toUpperCase()
  );
}

function buildBlockedFailoverDiagnostic({
  readiness,
  reason,
  error,
  bootstrapError,
  now = () => Date.now()
} = {}) {
  const primary =
    readiness &&
    readiness.primaryDiagnostic &&
    typeof readiness.primaryDiagnostic ===
      'object'
      ? readiness.primaryDiagnostic
      : null;

  const category =
    normalizeDiagnosticText(
      primary &&
      primary.category ||
      'DIAGNOSTIC',
      48
    )
      .toUpperCase() ||
    'DIAGNOSTIC';

  const code =
    normalizeDiagnosticText(
      primary &&
      primary.code ||
      'OFFLINE-DIAG-099',
      64
    ) ||
    'OFFLINE-DIAG-099';

  const message =
    normalizeDiagnosticText(
      primary &&
      primary.message ||
      'O modo offline não está pronto neste computador.',
      360
    );

  const technicalDetail =
    sanitizeTechnicalDetail(
      bootstrapError
    ) ||
    sanitizeTechnicalDetail(
      error
    );

  return Object.freeze({
    type:
      category,
    category,
    severity:
      normalizeDiagnosticText(
        primary &&
        primary.severity ||
        'ERROR',
        32
      )
        .toUpperCase() ||
      'ERROR',
    code,
    message,
    detail:
      technicalDetail,
    reason:
      normalizeDiagnosticText(
        reason ||
        'OFFLINE_FAILOVER_BLOCKED',
        96
      ),
    detectedAt:
      new Date(
        now()
      )
        .toISOString()
  });
}

module.exports = {
  sanitizeTechnicalDetail,
  shouldShowDiagnosticOverlay,
  buildBlockedFailoverDiagnostic
};
