'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..', '..');
const MAIN = fs.readFileSync(
  path.join(ROOT, 'main.js'),
  'utf8'
);
const PRELOAD = fs.readFileSync(
  path.join(ROOT, 'preload.js'),
  'utf8'
);

function blockBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(
    start,
    -1,
    'Marcador inicial ausente: ' + startMarker
  );

  const end = source.indexOf(endMarker, start);
  assert.notEqual(
    end,
    -1,
    'Marcador final ausente: ' + endMarker
  );

  return source.slice(start, end);
}

function productionSources() {
  const allowedExtensions =
    new Set(['.js', '.cjs', '.mjs', '.html']);

  const ignoredDirectories =
    new Set([
      '.git',
      'node_modules',
      'dist',
      'build',
      'tests'
    ]);

  const files = [];

  function walk(dir) {
    for (
      const entry of
      fs.readdirSync(
        dir,
        { withFileTypes: true }
      )
    ) {
      if (
        entry.isDirectory() &&
        ignoredDirectories.has(entry.name)
      ) {
        continue;
      }

      const fullPath =
        path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (
        !entry.isFile() ||
        entry.name.includes('.bak.') ||
        !allowedExtensions.has(
          path.extname(entry.name).toLowerCase()
        )
      ) {
        continue;
      }

      files.push({
        relative:
          path.relative(ROOT, fullPath),
        content:
          fs.readFileSync(fullPath, 'utf8')
      });
    }
  }

  walk(ROOT);

  return files;
}

function combinedProductionSource() {
  return productionSources()
    .map(
      item =>
        '/* ' +
        item.relative +
        ' */\n' +
        item.content
    )
    .join('\n');
}

test('WebPreferences permanecem endurecidas sem flags regressivas', () => {
  for (const forbidden of [
    /nodeIntegration\s*:\s*true/,
    /contextIsolation\s*:\s*false/,
    /sandbox\s*:\s*false/,
    /webSecurity\s*:\s*false/,
    /allowRunningInsecureContent\s*:\s*true/,
    /experimentalFeatures\s*:\s*true/,
    /enableRemoteModule\s*:\s*true/
  ]) {
    assert.doesNotMatch(MAIN, forbidden);
  }

  assert.ok(
    (
      MAIN.match(
        /contextIsolation\s*:\s*true/g
      ) || []
    ).length >= 2
  );

  assert.ok(
    (
      MAIN.match(
        /nodeIntegration\s*:\s*false/g
      ) || []
    ).length >= 2
  );

  assert.ok(
    (
      MAIN.match(
        /sandbox\s*:\s*true/g
      ) || []
    ).length >= 2
  );
});

test('produção não reintroduz abertura externa ou popup fora da política', () => {
  const source =
    combinedProductionSource();

  for (const forbidden of [
    /\bwindow\.open\s*\(/,
    /\bshell\.openExternal\b/,
    /\bnativeWindowOpen\b/i,
    /\ballowpopups\b/i
  ]) {
    assert.doesNotMatch(
      source,
      forbidden
    );
  }
});

test('produção não desativa TLS ou web security', () => {
  const source =
    combinedProductionSource();

  for (const forbidden of [
    /setCertificateVerifyProc/,
    /ignore-certificate-errors/i,
    /disable-web-security/i,
    /webSecurity\s*:\s*false/,
    /allowRunningInsecureContent\s*:\s*true/
  ]) {
    assert.doesNotMatch(
      source,
      forbidden
    );
  }
});

test('produção não reintroduz eval ou Function dinâmica', () => {
  const source =
    combinedProductionSource();

  assert.doesNotMatch(
    source,
    /\beval\s*\(/
  );

  assert.doesNotMatch(
    source,
    /\bnew\s+Function\s*\(/
  );
});

test('navegação e popup continuam protegidos nas duas superfícies', () => {
  assert.equal(
    (
      MAIN.match(
        /\.setWindowOpenHandler\s*\(/g
      ) || []
    ).length,
    2
  );

  assert.match(
    MAIN,
    /mainWindow\.webContents\.on\(\s*['"]will-navigate['"]/
  );
  assert.match(
    MAIN,
    /mainWindow\.webContents\.on\(\s*['"]will-redirect['"]/
  );
  assert.match(
    MAIN,
    /offlineView\.webContents\.on\(\s*['"]will-navigate['"]/
  );
  assert.match(
    MAIN,
    /offlineView\.webContents\.on\(\s*['"]will-redirect['"]/
  );
});

test('marcadores privilegiados de console exigem o frame PDV reconhecido', () => {
  assert.match(
    MAIN,
    /async function isTrustedPdvFrameForContents\s*\(/
  );

  assert.match(
    MAIN,
    /privilegedFrameMarker[\s\S]{0,900}await isTrustedPdvFrameForContents\(/
  );

  assert.match(
    MAIN,
    /FRAME BRIDGE DENIED/
  );
});

test('contador NFC-e exige identidade do PDV online e origin coerente', () => {
  const block =
    blockBetween(
      MAIN,
      'async function processarContadorFiscalDoFrame',
      'async function responderErroContadorFiscalDoFrame'
    );

  assert.match(
    block,
    /trustedOnlinePdvFrame !== frame/
  );

  assert.match(
    block,
    /origem !== frameOrigin/
  );

  assert.match(
    block,
    /origem === ['"]null['"]/
  );
});

test('ponte TOP de impressão fixa o origin do PDV e não responde com wildcard', () => {
  const block =
    blockBetween(
      MAIN,
      'async function instalarPonteTopDeImpressao()',
      'async function limparTudoDaSessao()'
    );

  assert.match(
    block,
    /TRUSTED_PDV_ORIGIN/
  );

  assert.match(
    block,
    /event\.origin !==[\s\S]{0,80}TRUSTED_PDV_ORIGIN/
  );

  assert.match(
    block,
    /event\.source\.postMessage\([\s\S]{0,500}TRUSTED_PDV_ORIGIN/
  );

  assert.doesNotMatch(
    block,
    /SCF_EFISCO_IMPRIMIR_NFCE_LOCAL_RESULT[\s\S]{0,500}['"]\*['"]/
  );
});

test('ponte TOP do verificador aceita somente o origin PDV pinado', () => {
  const block =
    blockBetween(
      MAIN,
      'async function installOfflineVerifierTopBridge()',
      'async function findPdvContinuityFrame'
    );

  assert.match(
    block,
    /TRUSTED_PDV_ORIGIN/
  );

  assert.match(
    block,
    /event\.origin !==[\s\S]{0,80}TRUSTED_PDV_ORIGIN/
  );

  assert.match(
    block,
    /PDV_TRUST_ORIGIN_UNAVAILABLE/
  );
});

test('preload não retransmite verificador e restringe A1 ao iframe offline local', () => {
  assert.equal(
    (
      PRELOAD.match(
        /window\.addEventListener\(\s*['"]message['"]/g
      ) || []
    ).length,
    1
  );

  assert.doesNotMatch(
    PRELOAD,
    /SCF_EFISCO_OFFLINE_VERIFIER_CANDIDATE/
  );

  assert.match(
    PRELOAD,
    /SCF_SUPERADMIN_CERTIFICADO_A1_ENVIAR/
  );

  assert.match(
    PRELOAD,
    /event\.origin !== currentOrigin/
  );

  assert.match(
    PRELOAD,
    /getElementById\([\s\S]{0,80}scfOfflinePdv/
  );

  assert.match(
    PRELOAD,
    /event\.source !== pdvFrame\.contentWindow/
  );

  assert.doesNotMatch(
    MAIN,
    /startsWith\(\s*['"]http:\/\/127\.0\.0\.1/
  );

  assert.doesNotMatch(
    MAIN,
    /startsWith\(\s*['"]http:\/\/localhost/
  );
});
