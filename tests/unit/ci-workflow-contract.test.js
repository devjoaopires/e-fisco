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



test('inventario de code signing cobre todos os binarios distribuídos e integra a validacao de release', () => {
  const policy = readJson('ci/code-signing-policy.json');
  const inventoryValidator = readText('ci/validate-code-signing-inventory.ps1');
  const releaseValidator = readText('ci/validate-release.ps1');

  assert.equal(policy.schemaVersion, 1);
  assert.deepEqual(
    policy.requiredSignedBinaries.map((item) => item.id),
    ['installer', 'application', 'updater-source', 'updater-packaged']
  );
  assert.equal(policy.thirdPartyBinaries.length, 9);
  assert.equal(policy.policy.rejectMissingRequiredBinary, true);
  assert.equal(policy.policy.rejectUnsignedRequiredBinary, true);
  assert.equal(policy.policy.rejectInvalidRequiredSignature, true);

  assert.match(inventoryValidator, /Binarios distribuidos sem classificacao/);
  assert.match(inventoryValidator, /Binarios declarados na policy ausentes do dist/);
  assert.match(inventoryValidator, /sameContentAs/);
  assert.match(inventoryValidator, /CODE_SIGNING_INVENTORY=OK/);
  assert.match(releaseValidator, /validate-code-signing-inventory\.ps1/);
});


test('modelo de code signing usa servico remoto com HSM e nao depende de PFX na CI', () => {
  const model = readJson('ci/code-signing-model.json');
  const policy = readJson('ci/code-signing-policy.json');

  assert.equal(model.schemaVersion, 1);
  assert.equal(model.status, 'selected');
  assert.equal(model.decision, 'managed-remote-signing-service-hsm-backed');
  assert.equal(model.privateKeyModel.exportable, false);
  assert.equal(model.privateKeyModel.storedInRepository, false);
  assert.equal(model.privateKeyModel.storedAsGitHubSecretPfx, false);
  assert.equal(model.ciIntegration.localPrivateKeyRequired, false);
  assert.equal(model.timestamping.required, true);
  assert.equal(model.timestamping.digest, 'SHA256');
  assert.equal(model.artifacts.policyFile, 'ci/code-signing-policy.json');
  assert.deepEqual(
    model.artifacts.requiredOwnBinaries,
    policy.requiredSignedBinaries.map((item) => item.id)
  );
  assert.equal(model.providerSelection.provider, 'SSL.com');
  assert.equal(model.providerSelection.service, 'eSigner for Code');
  assert.equal(model.providerSelection.certificateProfile, 'OV Code Signing');
  assert.equal(model.providerSelection.trustModel, 'public-trust');
  assert.equal(model.providerSelection.certificateStatus, 'selected-not-yet-issued');
  assert.equal(model.providerSelection.account, null);
  assert.equal(model.providerSelection.credentialId, null);
  assert.equal(model.providerSelection.selectionStep, '2.2/6');
  assert.equal(model.providerSelection.nextStep, '2.3/6');
});


test('validador de certificado exige EKU, identidade, cadeia confiavel e provider esperado', () => {
  const model = readJson('ci/code-signing-model.json');
  const validator = readText('ci/validate-code-signing-certificate.ps1');

  assert.equal(model.certificateValidation.status, 'pending-certificate-issuance');
  assert.equal(model.certificateValidation.requiredEkuOid, '1.3.6.1.5.5.7.3.3');
  assert.equal(model.certificateValidation.requireCurrentlyValid, true);
  assert.equal(model.certificateValidation.requireTrustedChain, true);
  assert.equal(model.certificateValidation.requirePrivateKeyBinding, true);
  assert.equal(model.certificateValidation.expectedProvider, 'SSL.com');
  assert.equal(model.certificateValidation.expectedOrganizationName, null);
  assert.equal(model.certificateValidation.validator, 'ci/validate-code-signing-certificate.ps1');

  assert.match(validator, /EnhancedKeyUsageList/);
  assert.match(validator, /HasPrivateKey/);
  assert.match(validator, /X509Chain/);
  assert.match(validator, /RevocationMode/);
  assert.match(validator, /subject organizationName/);
  assert.match(validator, /provider esperado/);
  assert.match(validator, /CODE_SIGNING_CERTIFICATE_VALIDATION=OK/);
});


test('fronteira de secrets de code signing protege HSM, environment e arquivos sensiveis', () => {
  const model = readJson('ci/code-signing-model.json');
  const secretsPolicy = readJson('ci/code-signing-secrets-policy.json');
  const validator = readText('ci/validate-code-signing-secret-boundary.ps1');
  const releaseValidator = readText('ci/validate-release.ps1');

  assert.equal(model.ciIntegration.authentication, 'github-environment-secrets-for-esigner-cka');
  assert.equal(model.ciIntegration.environment, 'code-signing-production');
  assert.equal(model.ciIntegration.localPrivateKeyRequired, false);
  assert.equal(model.ciIntegration.oidcForSelectedProviderFlow, false);

  assert.equal(secretsPolicy.privateKey.custody, 'SSL.com cloud HSM');
  assert.equal(secretsPolicy.privateKey.presentOnGitHubRunner, false);
  assert.equal(secretsPolicy.privateKey.pfxAllowed, false);
  assert.equal(secretsPolicy.githubActions.pullRequestsMayAccessSigningCredentials, false);
  assert.equal(secretsPolicy.githubActions.forksMayAccessSigningCredentials, false);
  assert.deepEqual(
    secretsPolicy.environmentSecrets.map((item) => item.name),
    ['SSL_COM_USERNAME', 'SSL_COM_PASSWORD', 'SSL_COM_TOTP_SECRET', 'SSL_COM_CREDENTIAL_ID']
  );
  assert.equal(secretsPolicy.runnerEphemeralMaterial.ckaMasterKey.uploadAsArtifact, false);
  assert.equal(secretsPolicy.runnerEphemeralMaterial.ckaMasterKey.cleanupRequired, true);

  assert.match(validator, /git -C .* ls-files/);
  assert.match(validator, /BEGIN PRIVATE KEY/);
  assert.match(validator, /CODE_SIGNING_SECRET_BOUNDARY=OK/);
  assert.match(releaseValidator, /validate-code-signing-secret-boundary\.ps1/);
});


test('assinatura Windows exige SHA256, RFC3161 e timestamp SSL.com', () => {
  const model = readJson('ci/code-signing-model.json');
  const signer = readText('ci/sign-windows-binary.ps1');
  const signingTest = readText('ci/test-code-signing.ps1');

  assert.equal(model.timestamping.required, true);
  assert.equal(model.timestamping.protocol, 'RFC3161');
  assert.equal(model.timestamping.digest, 'SHA256');
  assert.equal(model.timestamping.providerEndpoint, 'http://ts.ssl.com');
  assert.equal(model.timestamping.allowLegacyFallbackAutomatically, false);

  assert.equal(model.signingConfiguration.tool, 'Microsoft SignTool');
  assert.equal(model.signingConfiguration.fileDigest, 'SHA256');
  assert.equal(model.signingConfiguration.signingScript, 'ci/sign-windows-binary.ps1');
  assert.equal(model.signingConfiguration.testScript, 'ci/test-code-signing.ps1');

  assert.match(signer, /sign \/fd sha256 \/tr \$TimestampUrl \/td sha256 \/sha1/);
  assert.match(signer, /verify \/pa \/all/);
  assert.match(signer, /TimeStamperCertificate/);
  assert.match(signer, /CODE_SIGNING_SIGNATURE_VALIDATION=OK/);

  assert.match(signingTest, /Copy-Item/);
  assert.match(signingTest, /Get-FileHash/);
  assert.match(signingTest, /CODE_SIGNING_TEST_RESULT=SIGNED_AND_VERIFIED/);
  assert.match(signingTest, /CODE_SIGNING_TEST_CLEANUP=OK/);
});


test('preflight de code signing e manual, protegido por environment e nao imprime secrets', () => {
  const model = readJson('ci/code-signing-model.json');
  const secretsPolicy = readJson('ci/code-signing-secrets-policy.json');
  const workflow = readText('.github/workflows/code-signing-preflight.yml');
  const validator = readText('ci/validate-code-signing-ci-secrets.ps1');

  assert.equal(model.ciCredentialProvisioning.step, '2.6/6');
  assert.equal(model.ciCredentialProvisioning.environment, 'code-signing-production');
  assert.equal(model.ciCredentialProvisioning.repositoryContainsSecretValues, false);
  assert.equal(model.ciCredentialProvisioning.realCredentialsLoaded, false);
  assert.deepEqual(
    model.ciCredentialProvisioning.requiredSecrets,
    ['SSL_COM_USERNAME', 'SSL_COM_PASSWORD', 'SSL_COM_TOTP_SECRET']
  );

  const credentialPolicy = secretsPolicy.environmentSecrets.find(
    (item) => item.name === 'SSL_COM_CREDENTIAL_ID'
  );
  assert.equal(credentialPolicy.required, false);
  assert.equal(credentialPolicy.availableAfterCertificateIssuance, true);

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+push:/);
  assert.doesNotMatch(workflow, /\n\s+pull_request:/);
  assert.match(workflow, /environment: code-signing-production/);
  assert.match(workflow, /secrets\.SSL_COM_USERNAME/);
  assert.match(workflow, /secrets\.SSL_COM_PASSWORD/);
  assert.match(workflow, /secrets\.SSL_COM_TOTP_SECRET/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /echo\s+.*SSL_COM_PASSWORD/i);
  assert.doesNotMatch(workflow, /echo\s+.*SSL_COM_TOTP_SECRET/i);

  assert.match(validator, /CODE_SIGNING_CI_SECRETS_STATUS=READY/);
  assert.match(validator, /CODE_SIGNING_CI_SECRETS_STATUS=PENDING/);
  assert.doesNotMatch(validator, /Write-Output\s+.*\$value/);
});
