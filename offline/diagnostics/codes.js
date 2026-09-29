'use strict';

const OFFLINE_DIAGNOSTIC_CATALOG_VERSION =
  1;

function diagnosticDefinition({
  code,
  category,
  severity,
  message
}) {
  return Object.freeze({
    code,
    category,
    severity,
    message
  });
}

const OFFLINE_PREREQUISITE_DIAGNOSTICS =
  Object.freeze({
    DATABASE_UNAVAILABLE:
      diagnosticDefinition({
        code: 'OFFLINE-DB-001',
        category: 'DATABASE',
        severity: 'ERROR',
        message:
          'Banco de dados offline indisponível.'
      }),
    DATABASE_PROBE_FAILED:
      diagnosticDefinition({
        code: 'OFFLINE-DB-002',
        category: 'DATABASE',
        severity: 'ERROR',
        message:
          'Banco offline abriu, mas não respondeu ao teste de integridade operacional.'
      }),
    EMPRESA_UNAVAILABLE:
      diagnosticDefinition({
        code:
          'OFFLINE-COMPANY-001',
        category: 'COMPANY',
        severity: 'ERROR',
        message:
          'Empresa ativa não pôde ser identificada para operação offline.'
      }),
    COMPANY_NOT_PREPARED:
      diagnosticDefinition({
        code:
          'OFFLINE-COMPANY-002',
        category: 'COMPANY',
        severity: 'ERROR',
        message:
          'Empresa ainda não foi preparada para operação offline neste computador.'
      }),
    SAFE_STORAGE_UNAVAILABLE:
      diagnosticDefinition({
        code: 'OFFLINE-AUTH-001',
        category: 'AUTH',
        severity: 'ERROR',
        message:
          'Proteção criptográfica local do sistema operacional está indisponível.'
      }),
    CREDENTIAL_NOT_PROVISIONED:
      diagnosticDefinition({
        code: 'OFFLINE-AUTH-002',
        category: 'AUTH',
        severity: 'ERROR',
        message:
          'Nenhuma credencial offline ativa foi provisionada para a empresa.'
      }),
    CREDENTIAL_NOT_USABLE:
      diagnosticDefinition({
        code: 'OFFLINE-AUTH-003',
        category: 'AUTH',
        severity: 'ERROR',
        message:
          'A credencial offline existe, mas não pôde ser validada para uso.'
      }),
    SERVER_UNAVAILABLE:
      diagnosticDefinition({
        code:
          'OFFLINE-SERVER-001',
        category: 'SERVER',
        severity: 'ERROR',
        message:
          'Servidor local da interface offline não está disponível.'
      }),
    SERVER_NOT_LISTENING:
      diagnosticDefinition({
        code:
          'OFFLINE-SERVER-002',
        category: 'SERVER',
        severity: 'ERROR',
        message:
          'Servidor local offline existe, mas deixou de escutar na porta configurada.'
      }),
    SERVER_CONFIGURATION_INVALID:
      diagnosticDefinition({
        code:
          'OFFLINE-SERVER-003',
        category: 'SERVER',
        severity: 'ERROR',
        message:
          'Configuração do servidor local offline é inválida.'
      }),
    RENDERER_UNAVAILABLE:
      diagnosticDefinition({
        code: 'OFFLINE-UI-009',
        category: 'UI',
        severity: 'ERROR',
        message:
          'Renderer offline não está disponível.'
      }),
    RENDERER_NOT_READY:
      diagnosticDefinition({
        code: 'OFFLINE-UI-010',
        category: 'UI',
        severity: 'ERROR',
        message:
          'Renderer offline existe, mas ainda não está pronto para uso.'
      }),
    RENDERER_HEALTH_UNHEALTHY:
      diagnosticDefinition({
        code: 'OFFLINE-UI-011',
        category: 'UI',
        severity: 'ERROR',
        message:
          'Health-check atual do renderer offline indica falha.'
      }),
    RENDERER_HEALTH_STALE:
      diagnosticDefinition({
        code: 'OFFLINE-UI-012',
        category: 'UI',
        severity: 'WARNING',
        message:
          'Último health-check saudável do renderer offline está desatualizado.'
      }),
    RENDERER_RECOVERY_IN_PROGRESS:
      diagnosticDefinition({
        code: 'OFFLINE-UI-013',
        category: 'UI',
        severity: 'WARNING',
        message:
          'Renderer offline está em processo de recuperação automática.'
      })
  });

const OFFLINE_UI_FAILURE_DIAGNOSTICS =
  Object.freeze({
    DID_FAIL_LOAD:
      diagnosticDefinition({
        code: 'OFFLINE-UI-001',
        category: 'UI',
        severity: 'ERROR',
        message:
          'Falha ao carregar a interface offline.'
      }),
    PRELOAD_ERROR:
      diagnosticDefinition({
        code: 'OFFLINE-UI-002',
        category: 'UI',
        severity: 'ERROR',
        message:
          'Falha ao carregar o preload seguro da interface offline.'
      }),
    RENDER_PROCESS_GONE:
      diagnosticDefinition({
        code: 'OFFLINE-UI-003',
        category: 'UI',
        severity: 'ERROR',
        message:
          'Processo do renderer offline foi encerrado inesperadamente.'
      }),
    UNRESPONSIVE:
      diagnosticDefinition({
        code: 'OFFLINE-UI-004',
        category: 'UI',
        severity: 'WARNING',
        message:
          'Renderer offline parou de responder.'
      }),
    DESTROYED:
      diagnosticDefinition({
        code: 'OFFLINE-UI-005',
        category: 'UI',
        severity: 'ERROR',
        message:
          'Renderer offline foi destruído inesperadamente.'
      }),
    HEALTHCHECK_FAILED:
      diagnosticDefinition({
        code: 'OFFLINE-UI-006',
        category: 'UI',
        severity: 'ERROR',
        message:
          'Renderer offline não passou no health-check obrigatório.'
      }),
    RESPONSIVE_HEALTHCHECK_FAILED:
      diagnosticDefinition({
        code: 'OFFLINE-UI-007',
        category: 'UI',
        severity: 'ERROR',
        message:
          'Renderer voltou a responder, mas continuou inválido no health-check.'
      }),
    RESPONSIVE_RECHECK_ERROR:
      diagnosticDefinition({
        code: 'OFFLINE-UI-008',
        category: 'UI',
        severity: 'ERROR',
        message:
          'Falha ao revalidar o renderer offline após ele voltar a responder.'
      })
  });

const UNKNOWN_PREREQUISITE_DIAGNOSTIC =
  diagnosticDefinition({
    code: 'OFFLINE-DIAG-099',
    category: 'DIAGNOSTIC',
    severity: 'ERROR',
    message:
      'Falha offline não classificada no catálogo de pré-requisitos.'
  });

const UNKNOWN_UI_DIAGNOSTIC =
  diagnosticDefinition({
    code: 'OFFLINE-UI-099',
    category: 'UI',
    severity: 'ERROR',
    message:
      'Falha não classificada do renderer offline.'
  });

function withReason(
  reason,
  definition
) {
  return Object.freeze({
    reason:
      String(
        reason || 'UNKNOWN'
      ),
    ...definition
  });
}

function resolveOfflinePrerequisiteDiagnostic(
  reason,
  {
    fallback = true
  } = {}
) {
  const normalized =
    String(
      reason || ''
    )
      .trim()
      .toUpperCase();

  const definition =
    OFFLINE_PREREQUISITE_DIAGNOSTICS[
      normalized
    ];

  if (definition) {
    return withReason(
      normalized,
      definition
    );
  }

  if (!fallback) {
    return null;
  }

  return withReason(
    normalized || 'UNKNOWN',
    UNKNOWN_PREREQUISITE_DIAGNOSTIC
  );
}

function resolveOfflineUiFailureDiagnostic(
  type
) {
  const normalized =
    String(
      type || ''
    )
      .trim()
      .toUpperCase();

  const definition =
    OFFLINE_UI_FAILURE_DIAGNOSTICS[
      normalized
    ] ||
    UNKNOWN_UI_DIAGNOSTIC;

  return withReason(
    normalized || 'UNKNOWN',
    definition
  );
}

function listOfflineDiagnosticCatalog() {
  return Object.freeze({
    version:
      OFFLINE_DIAGNOSTIC_CATALOG_VERSION,
    prerequisites:
      OFFLINE_PREREQUISITE_DIAGNOSTICS,
    uiFailures:
      OFFLINE_UI_FAILURE_DIAGNOSTICS,
    fallbacks:
      Object.freeze({
        prerequisite:
          UNKNOWN_PREREQUISITE_DIAGNOSTIC,
        ui:
          UNKNOWN_UI_DIAGNOSTIC
      })
  });
}

module.exports = {
  OFFLINE_DIAGNOSTIC_CATALOG_VERSION,
  OFFLINE_PREREQUISITE_DIAGNOSTICS,
  OFFLINE_UI_FAILURE_DIAGNOSTICS,
  resolveOfflinePrerequisiteDiagnostic,
  resolveOfflineUiFailureDiagnostic,
  listOfflineDiagnosticCatalog
};
