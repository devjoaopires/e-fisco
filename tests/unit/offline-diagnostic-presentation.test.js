'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  sanitizeTechnicalDetail,
  shouldShowDiagnosticOverlay,
  buildBlockedFailoverDiagnostic
} = require('../../offline/diagnostics/presentation');

const {
  buildOfflineDiagnosticHtml
} = require('../../desktop/windows/offline-diagnostic-view');

test(
  'diagnóstico forçado pode substituir tela branca mesmo com modo ONLINE',
  () => {
    assert.equal(
      shouldShowDiagnosticOverlay(
        'ONLINE'
      ),
      false
    );

    assert.equal(
      shouldShowDiagnosticOverlay(
        'ONLINE',
        {
          force: true
        }
      ),
      true
    );

    assert.equal(
      shouldShowDiagnosticOverlay(
        'OFFLINE'
      ),
      true
    );
  }
);

test(
  'falha de bootstrap SQLite aparece como detalhe do diagnóstico primário',
  () => {
    const diagnostic =
      buildBlockedFailoverDiagnostic({
        readiness: {
          primaryDiagnostic: {
            code:
              'OFFLINE-DB-001',
            category:
              'DATABASE',
            severity:
              'ERROR',
            message:
              'Banco de dados offline indisponível.'
          }
        },
        reason:
          'initial-load-failed',
        bootstrapError:
          new Error(
            'Histórico de migrations SQLite incompatível na V8: single-owner-nfce-number-reservations.'
          ),
        now() {
          return Date.parse(
            '2026-09-29T01:00:00.000Z'
          );
        }
      });

    assert.equal(
      diagnostic.code,
      'OFFLINE-DB-001'
    );

    assert.equal(
      diagnostic.type,
      'DATABASE'
    );

    assert.match(
      diagnostic.detail,
      /migration.*V8/i
    );

    assert.equal(
      diagnostic.detectedAt,
      '2026-09-29T01:00:00.000Z'
    );
  }
);

test(
  'detalhe técnico sensível é omitido',
  () => {
    assert.equal(
      sanitizeTechnicalDetail(
        'Bearer secret-token-value'
      ),
      ''
    );

    assert.equal(
      sanitizeTechnicalDetail(
        'password=123'
      ),
      ''
    );
  }
);

test(
  'HTML diagnóstico escapa detalhe técnico e não permite markup injetado',
  () => {
    const html =
      buildOfflineDiagnosticHtml({
        code:
          'OFFLINE-DB-001',
        type:
          'DATABASE',
        message:
          'Banco indisponível.',
        detail:
          '<script>alert(1)</script>',
        version:
          '1.0.44',
        detectedAt:
          '2026-09-29T01:00:00.000Z'
      });

    assert.match(
      html,
      /Detalhe técnico:/
    );

    assert.match(
      html,
      /&lt;script&gt;alert\(1\)&lt;\/script&gt;/
    );

    assert.equal(
      html.includes(
        '<script>alert(1)</script>'
      ),
      false
    );
  }
);

test(
  'main liga falha de failover ao diagnóstico forçado e guarda erro do bootstrap',
  () => {
    const main =
      fs.readFileSync(
        path.join(
          __dirname,
          '..',
          '..',
          'main.js'
        ),
        'utf8'
      );

    assert.match(
      main,
      /async function showBlockedOfflineDiagnostic/
    );

    assert.match(
      main,
      /buildBlockedFailoverDiagnostic\(/
    );

    assert.match(
      main,
      /force:\s*true/
    );

    assert.match(
      main,
      /lastOfflineBootstrapError/
    );

    assert.match(
      main,
      /await showBlockedOfflineDiagnostic\(/
    );
  }
);
