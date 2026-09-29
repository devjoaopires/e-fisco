'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  OFFLINE_DIAGNOSTIC_CATALOG_VERSION,
  OFFLINE_PREREQUISITE_DIAGNOSTICS,
  OFFLINE_UI_FAILURE_DIAGNOSTICS,
  resolveOfflinePrerequisiteDiagnostic,
  resolveOfflineUiFailureDiagnostic,
  listOfflineDiagnosticCatalog
} = require('../../offline/diagnostics/codes');

test('catálogo offline mantém versão e códigos oficiais estáveis', () => {
  assert.equal(
    OFFLINE_DIAGNOSTIC_CATALOG_VERSION,
    1
  );

  const expected =
    new Map([
      [
        'DATABASE_UNAVAILABLE',
        'OFFLINE-DB-001'
      ],
      [
        'DATABASE_PROBE_FAILED',
        'OFFLINE-DB-002'
      ],
      [
        'EMPRESA_UNAVAILABLE',
        'OFFLINE-COMPANY-001'
      ],
      [
        'COMPANY_NOT_PREPARED',
        'OFFLINE-COMPANY-002'
      ],
      [
        'SAFE_STORAGE_UNAVAILABLE',
        'OFFLINE-AUTH-001'
      ],
      [
        'CREDENTIAL_NOT_PROVISIONED',
        'OFFLINE-AUTH-002'
      ],
      [
        'CREDENTIAL_NOT_USABLE',
        'OFFLINE-AUTH-003'
      ],
      [
        'SERVER_UNAVAILABLE',
        'OFFLINE-SERVER-001'
      ],
      [
        'SERVER_NOT_LISTENING',
        'OFFLINE-SERVER-002'
      ],
      [
        'SERVER_CONFIGURATION_INVALID',
        'OFFLINE-SERVER-003'
      ],
      [
        'RENDERER_UNAVAILABLE',
        'OFFLINE-UI-009'
      ],
      [
        'RENDERER_NOT_READY',
        'OFFLINE-UI-010'
      ],
      [
        'RENDERER_HEALTH_UNHEALTHY',
        'OFFLINE-UI-011'
      ],
      [
        'RENDERER_HEALTH_STALE',
        'OFFLINE-UI-012'
      ],
      [
        'RENDERER_RECOVERY_IN_PROGRESS',
        'OFFLINE-UI-013'
      ]
    ]);

  assert.deepEqual(
    new Map(
      Object.entries(
        OFFLINE_PREREQUISITE_DIAGNOSTICS
      ).map(
        ([reason, definition]) => [
          reason,
          definition.code
        ]
      )
    ),
    expected
  );
});

test('catálogo preserva códigos históricos OFFLINE-UI-001 a 008', () => {
  const expected =
    new Map([
      [
        'DID_FAIL_LOAD',
        'OFFLINE-UI-001'
      ],
      [
        'PRELOAD_ERROR',
        'OFFLINE-UI-002'
      ],
      [
        'RENDER_PROCESS_GONE',
        'OFFLINE-UI-003'
      ],
      [
        'UNRESPONSIVE',
        'OFFLINE-UI-004'
      ],
      [
        'DESTROYED',
        'OFFLINE-UI-005'
      ],
      [
        'HEALTHCHECK_FAILED',
        'OFFLINE-UI-006'
      ],
      [
        'RESPONSIVE_HEALTHCHECK_FAILED',
        'OFFLINE-UI-007'
      ],
      [
        'RESPONSIVE_RECHECK_ERROR',
        'OFFLINE-UI-008'
      ]
    ]);

  assert.deepEqual(
    new Map(
      Object.entries(
        OFFLINE_UI_FAILURE_DIAGNOSTICS
      ).map(
        ([reason, definition]) => [
          reason,
          definition.code
        ]
      )
    ),
    expected
  );
});

test('códigos oficiais não colidem entre diagnósticos distintos', () => {
  const catalog =
    listOfflineDiagnosticCatalog();

  const definitions = [
    ...Object.values(
      catalog.prerequisites
    ),
    ...Object.values(
      catalog.uiFailures
    ),
    catalog.fallbacks.prerequisite,
    catalog.fallbacks.ui
  ];

  const codes =
    definitions.map(
      (definition) =>
        definition.code
    );

  assert.equal(
    new Set(
      codes
    ).size,
    codes.length
  );
});

test('resolvers normalizam chave e mantêm fallback estável', () => {
  const db =
    resolveOfflinePrerequisiteDiagnostic(
      ' database_unavailable '
    );

  assert.equal(
    db.code,
    'OFFLINE-DB-001'
  );
  assert.equal(
    db.category,
    'DATABASE'
  );
  assert.equal(
    db.reason,
    'DATABASE_UNAVAILABLE'
  );

  const unknownPrerequisite =
    resolveOfflinePrerequisiteDiagnostic(
      'future_reason'
    );

  assert.equal(
    unknownPrerequisite.code,
    'OFFLINE-DIAG-099'
  );

  const unknownUi =
    resolveOfflineUiFailureDiagnostic(
      'future_ui_failure'
    );

  assert.equal(
    unknownUi.code,
    'OFFLINE-UI-099'
  );
});

test('resolver pode omitir fallback para estados de sucesso', () => {
  assert.equal(
    resolveOfflinePrerequisiteDiagnostic(
      'DATABASE_READY',
      {
        fallback: false
      }
    ),
    null
  );
});
