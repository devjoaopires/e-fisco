'use strict';

function createOfflineRendererRecoveryController({
  retryDelaysMs = [
    500,
    1500,
    3000
  ],
  budgetWindowMs = 120000,
  now = () => Date.now(),
  setTimeoutFn = setTimeout,
  isRecoverable = () => true,
  recoverAttempt,
  log = () => {}
} = {}) {
  if (
    typeof recoverAttempt !==
      'function'
  ) {
    throw new TypeError(
      'recoverAttempt precisa ser função.'
    );
  }

  const delays =
    Array.isArray(retryDelaysMs)
      ? retryDelaysMs
          .map(
            (value) =>
              Math.max(
                0,
                Number(value) || 0
              )
          )
          .slice(
            0,
            10
          )
      : [];

  const maxAttempts =
    delays.length;

  const normalizedWindowMs =
    Math.max(
      1000,
      Number(budgetWindowMs) ||
        120000
    );

  let attemptHistory = [];
  let generation = 0;
  let inFlight = null;

  function pruneHistory() {
    const cutoff =
      now() -
      normalizedWindowMs;

    attemptHistory =
      attemptHistory.filter(
        (timestamp) =>
          timestamp >= cutoff
      );
  }

  function budgetState() {
    pruneHistory();

    return {
      used:
        attemptHistory.length,
      limit:
        maxAttempts,
      remaining:
        Math.max(
          0,
          maxAttempts -
          attemptHistory.length
        ),
      windowMs:
        normalizedWindowMs
    };
  }

  function cancel(
    reason = 'cancelled'
  ) {
    generation += 1;

    log(
      'OFFLINE RENDERER RECOVERY CANCELLED',
      {
        reason:
          String(
            reason || 'cancelled'
          )
      }
    );

    return true;
  }

  function start(
    diagnostic = {}
  ) {
    const type =
      String(
        diagnostic &&
        diagnostic.type ||
        'UNKNOWN'
      )
        .trim()
        .toUpperCase() ||
      'UNKNOWN';

    if (
      !isRecoverable(
        type,
        diagnostic
      )
    ) {
      return Promise.resolve({
        started: false,
        recovered: false,
        reason:
          'NOT_RECOVERABLE',
        type,
        budget:
          budgetState()
      });
    }

    if (inFlight) {
      return inFlight;
    }

    const initialBudget =
      budgetState();

    if (
      maxAttempts < 1 ||
      initialBudget.remaining < 1
    ) {
      log(
        'OFFLINE RENDERER RECOVERY EXHAUSTED',
        {
          type,
          budget:
            initialBudget
        }
      );

      return Promise.resolve({
        started: false,
        recovered: false,
        reason:
          'BUDGET_EXHAUSTED',
        type,
        budget:
          initialBudget
      });
    }

    const runGeneration =
      generation + 1;

    generation =
      runGeneration;

    const run =
      Promise.resolve()
        .then(
          async () => {
            let localAttempt = 0;
            let lastError = null;

        for (
          const delayMs of delays
        ) {
          if (
            generation !==
            runGeneration
          ) {
            return {
              started: true,
              recovered: false,
              reason:
                'CANCELLED',
              type,
              attempts:
                localAttempt,
              budget:
                budgetState()
            };
          }

          const budget =
            budgetState();

          if (
            budget.remaining < 1
          ) {
            break;
          }

          localAttempt += 1;

          log(
            'OFFLINE RENDERER RECOVERY SCHEDULED',
            {
              type,
              attempt:
                localAttempt,
              delayMs,
              budget
            }
          );

          if (delayMs > 0) {
            await new Promise(
              (resolve) =>
                setTimeoutFn(
                  resolve,
                  delayMs
                )
            );
          }

          if (
            generation !==
            runGeneration
          ) {
            return {
              started: true,
              recovered: false,
              reason:
                'CANCELLED',
              type,
              attempts:
                localAttempt - 1,
              budget:
                budgetState()
            };
          }

          pruneHistory();

          if (
            attemptHistory.length >=
            maxAttempts
          ) {
            break;
          }

          attemptHistory.push(
            now()
          );

          log(
            'OFFLINE RENDERER RECOVERY ATTEMPT',
            {
              type,
              attempt:
                localAttempt,
              budget:
                budgetState()
            }
          );

          try {
            const recovered =
              await recoverAttempt({
                type,
                diagnostic,
                attempt:
                  localAttempt,
                generation:
                  runGeneration
              });

            if (
              recovered === true
            ) {
              log(
                'OFFLINE RENDERER RECOVERY SUCCEEDED',
                {
                  type,
                  attempt:
                    localAttempt,
                  budget:
                    budgetState()
                }
              );

              return {
                started: true,
                recovered: true,
                reason:
                  'RECOVERED',
                type,
                attempts:
                  localAttempt,
                budget:
                  budgetState()
              };
            }
          } catch (error) {
            lastError =
              String(
                error &&
                error.message ||
                error
              );

            log(
              'OFFLINE RENDERER RECOVERY ATTEMPT FAILED',
              {
                type,
                attempt:
                  localAttempt,
                erro:
                  lastError,
                budget:
                  budgetState()
              }
            );
          }
        }

        const finalBudget =
          budgetState();

        log(
          'OFFLINE RENDERER RECOVERY EXHAUSTED',
          {
            type,
            attempts:
              localAttempt,
            lastError,
            budget:
              finalBudget
          }
        );

        return {
          started: true,
          recovered: false,
          reason:
            'BUDGET_EXHAUSTED',
          type,
          attempts:
            localAttempt,
          lastError,
          budget:
            finalBudget
        };
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

    return inFlight;
  }

  return Object.freeze({
    start,
    cancel,
    budgetState,
    isRunning() {
      return Boolean(
        inFlight
      );
    }
  });
}

module.exports = {
  createOfflineRendererRecoveryController
};
