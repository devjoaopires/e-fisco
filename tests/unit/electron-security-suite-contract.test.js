'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..', '..');
const PACKAGE = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, 'package.json'),
    'utf8'
  )
);

const SECURITY_FILES = Object.freeze([
  'tests/unit/electron-navigation-security.test.js',
  'tests/unit/electron-webcontents-security.test.js',
  'tests/unit/electron-ipc-security.test.js',
  'tests/unit/electron-security-bypass.test.js',
  'tests/unit/electron-functional-regression.test.js',
  'tests/unit/electron-static-security-audit.test.js'
]);

const EXPECTED_SECURITY_TESTS = Object.freeze({
  'tests/unit/electron-navigation-security.test.js': 9,
  'tests/unit/electron-webcontents-security.test.js': 9,
  'tests/unit/electron-ipc-security.test.js': 10,
  'tests/unit/electron-security-bypass.test.js': 9,
  'tests/unit/electron-functional-regression.test.js': 5,
  'tests/unit/electron-static-security-audit.test.js': 10
});

function source(relativePath) {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    'utf8'
  );
}

function declaredNodeTests(relativePath) {
  const content = source(relativePath);

  return (
    content.match(
      /\btest\s*\(\s*['"`]/g
    ) || []
  ).length;
}

test('suíte Electron de segurança mantém os seis módulos permanentes', () => {
  for (const relativePath of SECURITY_FILES) {
    const fullPath =
      path.join(ROOT, relativePath);

    assert.equal(
      fs.existsSync(fullPath),
      true,
      relativePath
    );

    assert.ok(
      fs.statSync(fullPath).isFile(),
      relativePath
    );
  }
});

test('test:electron-security executa todos os módulos de segurança', () => {
  const script =
    PACKAGE.scripts &&
    PACKAGE.scripts['test:electron-security'];

  assert.equal(typeof script, 'string');
  assert.match(
    script,
    /ELECTRON_RUN_AS_NODE=1/
  );
  assert.match(
    script,
    /electron\s+--test/
  );

  for (const relativePath of [
    ...SECURITY_FILES,
    'tests/unit/electron-security-suite-contract.test.js'
  ]) {
    assert.ok(
      script.includes(relativePath),
      relativePath
    );
  }
});

test('test:unit continua incluindo automaticamente toda regressão Electron', () => {
  const script =
    PACKAGE.scripts &&
    PACKAGE.scripts['test:unit'];

  assert.equal(typeof script, 'string');
  assert.ok(
    script.includes(
      'tests/unit/**/*.test.js'
    )
  );
});

test('módulos de segurança preservam o piso atual de 52 testes', () => {
  let total = 0;

  for (
    const [relativePath, expected] of
    Object.entries(EXPECTED_SECURITY_TESTS)
  ) {
    const count =
      declaredNodeTests(relativePath);

    assert.ok(
      count >= expected,
      `${relativePath}: esperado >= ${expected}, atual ${count}`
    );

    total += count;
  }

  assert.ok(
    total >= 52,
    `esperado >= 52 testes de segurança, atual ${total}`
  );
});

test('contrato consolidado mantém cobertura do hardening Electron', () => {
  const navigation =
    source(
      'tests/unit/electron-navigation-security.test.js'
    );
  const webcontents =
    source(
      'tests/unit/electron-webcontents-security.test.js'
    );
  const ipc =
    source(
      'tests/unit/electron-ipc-security.test.js'
    );
  const bypass =
    source(
      'tests/unit/electron-security-bypass.test.js'
    );
  const functional =
    source(
      'tests/unit/electron-functional-regression.test.js'
    );
  const staticAudit =
    source(
      'tests/unit/electron-static-security-audit.test.js'
    );

  for (const marker of [
    'isOnlineOriginAllowed',
    'isOfflineOriginAllowed',
    'will-navigate',
    'will-redirect',
    'sanitizeNavigationUrlForLog'
  ]) {
    assert.ok(
      navigation.includes(marker),
      marker
    );
  }

  for (const marker of [
    'setWindowOpenHandler',
    'classifyRendererWindowOpen',
    'classifyOfflineViewNavigation',
    'OFFLINE_VIEW_NAVIGATION_POLICY'
  ]) {
    assert.ok(
      webcontents.includes(marker),
      marker
    );
  }

  for (const marker of [
    'IPC_CHANNEL_AUTHORIZATION_POLICY',
    'resolveAuthorizedIpcSender',
    'isIpcChannelAuthorized',
    'processId',
    'frameId',
    'detached'
  ]) {
    assert.ok(
      ipc.includes(marker),
      marker
    );
  }

  for (const marker of [
    'destino externo falha em navegação, popup e IPC',
    'comando interno só intercepta navegação',
    'localhost e porta offline errada',
    'subframe same-origin',
    'mudança da porta runtime'
  ]) {
    assert.ok(
      bypass.includes(marker),
      marker
    );
  }

  for (const marker of [
    'impressão chega à fila',
    'login offline legítimo atravessa autorização',
    'cria sessão local',
    'fluxos legítimos de caixa, venda e crediário'
  ]) {
    assert.ok(
      functional.includes(marker),
      marker
    );
  }

  for (const marker of [
    'WebPreferences permanecem endurecidas',
    'marcadores privilegiados de console',
    'contador NFC-e exige identidade',
    'ponte TOP de impressão',
    'restringe A1 ao iframe offline local'
  ]) {
    assert.ok(
      staticAudit.includes(marker),
      marker
    );
  }
});

test('arquivos consolidados usam node:test e leem o código real do projeto', () => {
  for (const relativePath of SECURITY_FILES) {
    const content = source(relativePath);

    assert.match(
      content,
      /require\(['"]node:test['"]\)/
    );
    assert.match(
      content,
      /main\.js/
    );
  }
});
