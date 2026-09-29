'use strict';

const ACTIONS =
  Object.freeze([
    Object.freeze({
      id:
        'DATABASE_REINITIALIZE',
      codes:
        Object.freeze([
          'OFFLINE-DB-001'
        ])
    }),
    Object.freeze({
      id:
        'COMPANY_PREPARE_LOCAL',
      codes:
        Object.freeze([
          'OFFLINE-COMPANY-002'
        ])
    }),
    Object.freeze({
      id:
        'SERVER_RESTART',
      codes:
        Object.freeze([
          'OFFLINE-SERVER-001',
          'OFFLINE-SERVER-002',
          'OFFLINE-SERVER-003'
        ]),
      covers:
        Object.freeze([
          'RENDERER_RECOVERY'
        ])
    }),
    Object.freeze({
      id:
        'RENDERER_RECOVERY',
      codes:
        Object.freeze([
          'OFFLINE-UI-001',
          'OFFLINE-UI-002',
          'OFFLINE-UI-003',
          'OFFLINE-UI-004',
          'OFFLINE-UI-005',
          'OFFLINE-UI-006',
          'OFFLINE-UI-007',
          'OFFLINE-UI-008',
          'OFFLINE-UI-009',
          'OFFLINE-UI-010',
          'OFFLINE-UI-011',
          'OFFLINE-UI-012',
          'OFFLINE-UI-013',
          'OFFLINE-UI-099'
        ])
    })
  ]);

const MANUAL_CLASSIFICATIONS =
  Object.freeze({
    'OFFLINE-DB-002':
      'DATABASE_REQUIRES_INTERVENTION',
    'OFFLINE-COMPANY-001':
      'COMPANY_IDENTITY_REQUIRED',
    'OFFLINE-AUTH-001':
      'OS_SAFE_STORAGE_REQUIRED',
    'OFFLINE-AUTH-002':
      'ONLINE_REPROVISION_REQUIRED',
    'OFFLINE-AUTH-003':
      'ONLINE_REPROVISION_REQUIRED',
    'OFFLINE-DIAG-099':
      'UNCLASSIFIED_DIAGNOSTIC'
  });

function normalizeCodes(
  report
) {
  if (
    !report ||
    !Array.isArray(
      report.codes
    )
  ) {
    return [];
  }

  return [
    ...new Set(
      report.codes
        .map(
          (code) =>
            String(
              code || ''
            )
              .trim()
              .toUpperCase()
        )
        .filter(Boolean)
    )
  ];
}

function intersects(
  left,
  right
) {
  const rightSet =
    new Set(
      right
    );

  return left.some(
    (value) =>
      rightSet.has(
        value
      )
  );
}

function classifyUnresolvedCodes(
  report
) {
  return Object.freeze(
    normalizeCodes(
      report
    )
      .map(
        (code) =>
          Object.freeze({
            code,
            classification:
              MANUAL_CLASSIFICATIONS[
                code
              ] ||
              (
                ACTIONS.some(
                  (action) =>
                    action.codes.includes(
                      code
                    )
                )
                  ? 'SAFE_REPAIR_EXHAUSTED'
                  : 'NO_SAFE_REPAIR'
              )
          })
      )
  );
}

function normalizeActionResult(
  actionId,
  raw,
  codes
) {
  if (
    raw &&
    typeof raw ===
      'object'
  ) {
    return Object.freeze({
      action:
        actionId,
      attempted: true,
      success:
        raw.success === true,
      reason:
        String(
          raw.reason ||
          (
            raw.success === true
              ? 'COMPLETED'
              : 'NOT_COMPLETED'
          )
        ),
      codes:
        Object.freeze([
          ...codes
        ])
    });
  }

  return Object.freeze({
    action:
      actionId,
    attempted: true,
    success:
      raw === true,
    reason:
      raw === true
        ? 'COMPLETED'
        : 'NOT_COMPLETED',
    codes:
      Object.freeze([
        ...codes
      ])
  });
}

function createOfflineAutoRepairRunner({
  runSelfTest,
  repairDatabase,
  repairCompany,
  repairServer,
  repairRenderer,
  maxPasses = 2,
  log = () => {}
} = {}) {
  if (
    typeof runSelfTest !==
      'function'
  ) {
    throw new TypeError(
      'runSelfTest precisa ser função.'
    );
  }

  const handlers =
    Object.freeze({
      DATABASE_REINITIALIZE:
        repairDatabase,
      COMPANY_PREPARE_LOCAL:
        repairCompany,
      SERVER_RESTART:
        repairServer,
      RENDERER_RECOVERY:
        repairRenderer
    });

  const normalizedMaxPasses =
    Math.max(
      1,
      Math.min(
        3,
        Number(
          maxPasses
        ) || 2
      )
    );

  let inFlight = null;

  async function runAction(
    definition,
    report
  ) {
    const handler =
      handlers[
        definition.id
      ];

    const matchedCodes =
      normalizeCodes(
        report
      ).filter(
        (code) =>
          definition.codes.includes(
            code
          )
      );

    if (
      matchedCodes.length < 1
    ) {
      return null;
    }

    if (
      typeof handler !==
        'function'
    ) {
      return Object.freeze({
        action:
          definition.id,
        attempted: false,
        success: false,
        reason:
          'HANDLER_UNAVAILABLE',
        codes:
          Object.freeze([
            ...matchedCodes
          ])
      });
    }

    try {
      const raw =
        await handler({
          report,
          codes:
            matchedCodes
        });

      return normalizeActionResult(
        definition.id,
        raw,
        matchedCodes
      );
    } catch (error) {
      log(
        'OFFLINE AUTO REPAIR ACTION FAILED',
        {
          action:
            definition.id,
          codes:
            matchedCodes,
          erro:
            String(
              error &&
              error.message ||
              error
            )
        }
      );

      return Object.freeze({
        action:
          definition.id,
        attempted: true,
        success: false,
        reason:
          'ACTION_FAILED',
        codes:
          Object.freeze([
            ...matchedCodes
          ])
      });
    }
  }

  async function execute({
    source =
      'offline-ui'
  } = {}) {
    if (inFlight) {
      return inFlight;
    }

    const run =
      Promise.resolve()
        .then(
          async () => {
            const before =
              await runSelfTest({
                source:
                  'auto-repair-before:' +
                  String(
                    source || 'offline-ui'
                  )
                    .trim()
                    .slice(
                      0,
                      32
                    )
              });

            if (
              before &&
              before.ready === true
            ) {
              return Object.freeze({
                schemaVersion: 1,
                status:
                  'OFFLINE_AUTO_REPAIR_NOT_NEEDED',
                repaired: false,
                before,
                after:
                  before,
                actions:
                  Object.freeze([]),
                unresolved:
                  Object.freeze([])
              });
            }

            const attempted =
              new Set();

            const covered =
              new Set();

            const actions = [];

            let current =
              before;

            for (
              let pass = 1;
              pass <=
                normalizedMaxPasses;
              pass += 1
            ) {
              const currentCodes =
                normalizeCodes(
                  current
                );

              let executedInPass =
                false;

              for (
                const definition of
                ACTIONS
              ) {
                if (
                  attempted.has(
                    definition.id
                  ) ||
                  covered.has(
                    definition.id
                  ) ||
                  !intersects(
                    currentCodes,
                    definition.codes
                  )
                ) {
                  continue;
                }

                attempted.add(
                  definition.id
                );

                const result =
                  await runAction(
                    definition,
                    current
                  );

                if (!result) {
                  continue;
                }

                actions.push(
                  result
                );

                if (
                  result.attempted ===
                    true
                ) {
                  executedInPass =
                    true;
                }

                if (
                  result.success ===
                    true &&
                  Array.isArray(
                    definition.covers
                  )
                ) {
                  for (
                    const coveredId of
                    definition.covers
                  ) {
                    covered.add(
                      coveredId
                    );
                  }
                }
              }

              if (!executedInPass) {
                break;
              }

              current =
                await runSelfTest({
                  source:
                    'auto-repair-pass-' +
                    pass
                });

              if (
                current &&
                current.ready ===
                  true
              ) {
                break;
              }
            }

            const unresolved =
              classifyUnresolvedCodes(
                current
              );

            const successfulActions =
              actions.filter(
                (action) =>
                  action.success ===
                  true
              );

            const status =
              current &&
              current.ready === true
                ? 'OFFLINE_AUTO_REPAIR_REPAIRED'
                : actions.length < 1
                  ? 'OFFLINE_AUTO_REPAIR_NO_SAFE_ACTION'
                  : successfulActions.length >
                    0
                    ? 'OFFLINE_AUTO_REPAIR_INCOMPLETE'
                    : 'OFFLINE_AUTO_REPAIR_FAILED';

            const summary =
              Object.freeze({
                schemaVersion: 1,
                status,
                repaired:
                  current &&
                  current.ready ===
                    true &&
                  before &&
                  before.ready !==
                    true,
                before,
                after:
                  current,
                actions:
                  Object.freeze([
                    ...actions
                  ]),
                unresolved
              });

            log(
              'OFFLINE AUTO REPAIR COMPLETED',
              {
                status:
                  summary.status,
                repaired:
                  summary.repaired,
                beforeCodes:
                  normalizeCodes(
                    before
                  ),
                afterCodes:
                  normalizeCodes(
                    current
                  ),
                actions:
                  summary.actions.map(
                    (action) => ({
                      action:
                        action.action,
                      success:
                        action.success,
                      reason:
                        action.reason
                    })
                  )
              }
            );

            return summary;
          }
        );

    const tracked =
      run.finally(
        () => {
          if (
            inFlight ===
            tracked
          ) {
            inFlight = null;
          }
        }
      );

    inFlight =
      tracked;

    return tracked;
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
  ACTIONS,
  MANUAL_CLASSIFICATIONS,
  classifyUnresolvedCodes,
  createOfflineAutoRepairRunner
};
