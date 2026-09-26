'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..', '..');

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function count(text, pattern) {
  return (text.match(pattern) || []).length;
}

test('pipeline ativa Ã© hÃ­brida: PowerShell local + GitHub Actions remoto', () => {
  const packageJson = readJson('package.json');
  const contract = readJson('ci/pipeline-contract.json');

  assert.equal(contract.release, packageJson.version);
  assert.equal(contract.schemaVersion, 3);
  assert.equal(contract.provider, 'hybrid-local-powershell-github-actions');
  assert.equal(contract.entrypoints.local, 'ci/local-ci.ps1');
  assert.equal(contract.entrypoints.remote, '.github/workflows/ci.yml');
  assert.equal(contract.remoteCi, true);
  assert.equal(contract.githubWorkflowPresent, true);
  assert.equal(exists('ci/local-ci.ps1'), true);
  assert.equal(exists('.github/workflows/ci.yml'), true);
});

test('pipeline local permanece privada e sem upload remoto', () => {
  const contract = readJson('ci/pipeline-contract.json');
  const pipeline = readText('ci/local-ci.ps1').toLowerCase();

  assert.equal(contract.localPipeline.enabled, true);
  assert.equal(contract.localPipeline.remoteUpload, false);
  assert.equal(contract.localPipeline.artifactUpload, false);
  assert.equal(contract.localPipeline.publish, false);

  for (const forbidden of [
    'actions/upload-artifact',
    'git push',
    'gh api',
    'gh release',
    'npm publish'
  ]) {
    assert.equal(
      pipeline.includes(forbidden),
      false,
      'OperaÃ§Ã£o remota proibida na pipeline local: ' + forbidden
    );
  }
});

test('Node local Ã© fixado e bootstrap portÃ¡til verifica SHA-256 oficial', () => {
  const contract = readJson('ci/pipeline-contract.json');
  const pipeline = readText('ci/local-ci.ps1');

  assert.equal(contract.toolchain.platform, 'windows');
  assert.equal(contract.toolchain.shell, 'powershell');
  assert.equal(contract.toolchain.node, '24.18.1');
  assert.equal(
    contract.toolchain.nodeBootstrap.source,
    'https://nodejs.org/dist/'
  );
  assert.equal(
    contract.toolchain.nodeBootstrap.architecture,
    'win-x64'
  );
  assert.match(pipeline, /NodeVersion = '24\.18\.1'/);
  assert.match(pipeline, /SHASUMS256\.txt/);
  assert.match(pipeline, /Get-FileHash[^\r\n]+SHA256/);
  assert.match(pipeline, /NODE_ARCHIVE_SHA256=OK/);
});

test('instalaÃ§Ã£o local usa npm ci e protege package-lock.json', () => {
  const contract = readJson('ci/pipeline-contract.json');
  const pipeline = readText('ci/local-ci.ps1');

  assert.equal(
    contract.toolchain.dependencyInstall,
    'npm ci --no-audit --no-fund'
  );
  assert.equal(
    contract.failurePolicy.packageLockMustRemainUnchanged,
    true
  );

  const installIndex = pipeline.indexOf("@('ci','--no-audit','--no-fund')");
  const firstTestIndex = pipeline.indexOf("@('run','test:ci')");

  assert.ok(installIndex >= 0);
  assert.ok(firstTestIndex > installIndex);
  assert.match(
    pipeline,
    /package-lock\.json foi alterado durante a pipeline local/
  );
  assert.match(pipeline, /PACKAGE_LOCK_UNCHANGED=True/);
});

test('estÃ¡gios do contrato apontam para scripts reais do package.json', () => {
  const packageJson = readJson('package.json');
  const contract = readJson('ci/pipeline-contract.json');

  const expected = [
    ['ci-contract', 'npm run test:ci'],
    ['unit', 'npm run test:unit'],
    ['integration', 'npm run test:integration'],
    ['db', 'npm run test:db'],
    ['fiscal', 'npm run test:fiscal'],
    ['architecture', 'npm run test:architecture'],
    ['phase1-selftest', 'npm run phase1:selftest'],
    ['phase2-db-selftest', 'npm run phase2:db-selftest'],
    ['full-suite', 'npm test'],
    ['build', 'npm run dist'],
    ['release-validation', 'ci/validate-release.ps1 -DistPath dist']
  ];

  assert.deepEqual(
    contract.stages.map((stage) => [stage.name, stage.command]),
    expected
  );

  for (const script of [
    'test:ci',
    'test:unit',
    'test:integration',
    'test:db',
    'test:fiscal',
    'test:architecture',
    'phase1:selftest',
    'phase2:db-selftest',
    'dist'
  ]) {
    assert.equal(Object.hasOwn(packageJson.scripts, script), true);
  }
});

test('pipeline local continua executando validaÃ§Ãµes antes do build', () => {
  const pipeline = readText('ci/local-ci.ps1');

  const markers = [
    "@('run','test:ci')",
    "@('run','test:unit')",
    "@('run','test:integration')",
    "@('run','test:db')",
    "@('run','test:fiscal')",
    "@('run','test:architecture')",
    "@('run','phase1:selftest')",
    "@('run','phase2:db-selftest')",
    "@('test')",
    "@('run','dist')"
  ];

  let previous = -1;
  for (const marker of markers) {
    const index = pipeline.indexOf(marker);
    assert.ok(index > previous, 'Ordem invÃ¡lida: ' + marker);
    previous = index;
  }
});

test('release permanece NSIS x64, ASAR e sem publish automÃ¡tico', () => {
  const packageJson = readJson('package.json');
  const contract = readJson('ci/pipeline-contract.json');
  const validator = readText('ci/validate-release.ps1');

  assert.equal(packageJson.build.asar, true);
  assert.equal(packageJson.build.directories.output, 'dist');
  assert.equal(packageJson.build.win.target[0].target, 'nsis');
  assert.deepEqual(packageJson.build.win.target[0].arch, ['x64']);
  assert.equal(
    packageJson.build.win.artifactName,
    'e-fisco-Setup-${version}.${ext}'
  );
  assert.equal(contract.releaseBuild.target, 'windows-nsis-x64');
  assert.equal(contract.releaseBuild.publish, false);
  assert.match(packageJson.scripts.dist, /--publish\s+never/);

  for (const marker of [
    'latest.yml version divergente',
    'latest.yml path divergente',
    'latest.yml files.url divergente',
    'latest.yml size divergente',
    'latest.yml sha512 divergente do instalador',
    'app.asar.unpacked'
  ]) {
    assert.equal(validator.includes(marker), true);
  }
});

test('GitHub Actions usa triggers, permissÃµes e toolchain fixados', () => {
  const contract = readJson('ci/pipeline-contract.json');
  const workflow = readText('.github/workflows/ci.yml');

  assert.deepEqual(
    contract.githubActions.triggers,
    ['push', 'pull_request', 'workflow_dispatch']
  );
  assert.match(workflow, /\n  push:\s*\r?\n/);
  assert.match(workflow, /\n  pull_request:\s*\r?\n/);
  assert.match(workflow, /\n  workflow_dispatch:\s*\r?\n/);
  assert.match(workflow, /permissions:\s*\r?\n\s+contents: read/);
  assert.equal(count(workflow, /runs-on: windows-2025/g), 6);
  assert.equal(count(workflow, /node-version: "24\.18\.1"/g), 6);
  assert.equal(count(workflow, /actions\/checkout@v7\.0\.1/g), 6);
  assert.equal(count(workflow, /actions\/setup-node@v7\.0\.0/g), 6);
  assert.equal(count(workflow, /npm ci --no-audit --no-fund/g), 6);
});

test('workflow possui cinco jobs de teste e build bloqueado por todos eles', () => {
  const contract = readJson('ci/pipeline-contract.json');
  const workflow = readText('.github/workflows/ci.yml');

  assert.deepEqual(
    contract.githubActions.jobs,
    ['unit', 'integration', 'db', 'fiscal', 'architecture', 'build']
  );
  assert.deepEqual(
    contract.githubActions.buildNeeds,
    ['unit', 'integration', 'db', 'fiscal', 'architecture']
  );

  for (const job of ['unit', 'integration', 'db', 'fiscal', 'architecture', 'build']) {
    assert.match(workflow, new RegExp('\\n  ' + job + ':\\r?\\n'));
  }

  const buildIndex = workflow.indexOf('\n  build:');
  for (const needed of ['unit', 'integration', 'db', 'fiscal', 'architecture']) {
    assert.ok(workflow.indexOf('      - ' + needed, buildIndex) > buildIndex);
  }

  assert.match(workflow, /npm run test:integration/);
  assert.match(workflow, /npm run phase1:selftest/);
  assert.match(workflow, /npm run phase2:db-selftest/);
});

test('build remoto limpa dist, constrÃ³i, valida e sÃ³ entÃ£o faz upload', () => {
  const contract = readJson('ci/pipeline-contract.json');
  const workflow = readText('.github/workflows/ci.yml');

  const buildStart = workflow.indexOf('\n  build:');
  const build = workflow.slice(buildStart);
  const cleanIndex = build.indexOf('name: Clean dist');
  const distIndex = build.indexOf('npm run dist');
  const validateIndex = build.indexOf('validate-release.ps1');
  const uploadIndex = build.indexOf('actions/upload-artifact@v7.0.1');

  assert.ok(cleanIndex >= 0);
  assert.ok(distIndex > cleanIndex);
  assert.ok(validateIndex > distIndex);
  assert.ok(uploadIndex > validateIndex);

  assert.equal(contract.githubActions.artifactUpload.enabled, true);
  assert.equal(contract.githubActions.artifactUpload.afterReleaseValidation, true);
  assert.equal(contract.githubActions.artifactUpload.retentionDays, 14);
  assert.match(build, /dist\/e-fisco-Setup-\*\.exe/);
  assert.match(build, /dist\/e-fisco-Setup-\*\.exe\.blockmap/);
  assert.match(build, /dist\/latest\.yml/);
  assert.doesNotMatch(build, /win-unpacked/);
});

test('workflow remoto mantÃ©m hardening de credenciais, cache, timeout e concorrÃªncia', () => {
  const workflow = readText('.github/workflows/ci.yml');

  assert.match(workflow, /cancel-in-progress: true/);
  assert.equal(count(workflow, /persist-credentials: false/g), 6);
  assert.equal(count(workflow, /cache: npm/g), 6);
  assert.equal(count(workflow, /cache-dependency-path: package-lock\.json/g), 6);
  assert.equal(count(workflow, /package-manager-cache: false/g), 6);
  assert.equal(count(workflow, /timeout-minutes:/g), 6);
  assert.equal(count(workflow, /name: Summarize failure/g), 6);
  assert.doesNotMatch(workflow, /node_modules/);
});

test('GitHub gera artefato de CI e R2 continua sendo o canal de distribuiÃ§Ã£o', () => {
  const packageJson = readJson('package.json');
  const contract = readJson('ci/pipeline-contract.json');
  const workflow = readText('.github/workflows/ci.yml').toLowerCase();

  assert.equal(packageJson.build.publish[0].provider, 'generic');
  assert.match(packageJson.build.publish[0].url, /\.r2\.dev\/?$/);
  assert.equal(contract.privacy.publish, false);
  assert.equal(contract.githubActions.artifactUpload.enabled, true);
  assert.equal(contract.releaseBuild.remoteArtifactUpload, true);
  assert.match(packageJson.scripts.dist, /--publish\s+never/);

  for (const forbidden of [
    'r2.dev',
    'cloudflare',
    'aws s3',
    'wrangler r2',
    'npm publish',
    'gh release'
  ]) {
    assert.equal(
      workflow.includes(forbidden),
      false,
      'Workflow nÃ£o deve publicar distribuiÃ§Ã£o automaticamente: ' + forbidden
    );
  }
});

