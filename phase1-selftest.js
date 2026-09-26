'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('node:assert/strict');

const {
  MANIFEST_FORMAT_VERSION,
  compareVersions,
  validateManifest,
  validateStandbyPackageManifest,
  readAndValidateStandbyPackage,
  extractStandbyPackageSafely,
  standbyPaths,
  ensureStandbyStructure,
  readJsonSafe,
  writeJsonSafely,
  evaluateCompatibility,
  validatePreparedSlotForActivation,
  activatePreparedSlot,
  validateRollbackSlot,
  rollbackToPreviousSlot
} = require('./offline-standby');

const {
  withTempDir
} = require('./tests/helpers/temp-dir');

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const body = Buffer.isBuffer(entry.body)
      ? entry.body
      : Buffer.from(String(entry.body), 'utf8');
    const checksum = crc32(body);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    centralParts.push(central, name);
    offset += local.length + name.length + body.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function packageManifest(version) {
  return {
    packageType: 'e-fisco-offline-standby',
    packageVersion: version,
    uiVersion: version,
    offlineCoreVersion: version,
    schemaVersion: 13,
    activationAllowed: true,
    purpose: 'phase1-selftest'
  };
}

function desktopManifest(version) {
  return validateManifest({
    manifestVersion: MANIFEST_FORMAT_VERSION,
    uiVersion: version,
    offlineCoreVersion: version,
    schemaVersion: 13,
    minimumElectronVersion: '43.0.0',
    minimumOfflineCoreVersion: '1.0.0',
    publishedAt: '2026-09-25T00:00:00.000Z'
  });
}

function buildSlotPackage(slotDir, version) {
  const internalManifest = packageManifest(version);
  const zip = createStoredZip([
    {
      name: 'standby-package.json',
      body: JSON.stringify(internalManifest, null, 2) + '\n'
    },
    {
      name: 'offline-shell.html',
      body: '<!doctype html><title>standby self-test</title>'
    }
  ]);

  fs.mkdirSync(slotDir, { recursive: true });
  const packageFile = path.join(slotDir, 'standby-package.zip');
  fs.writeFileSync(packageFile, zip);

  const validated = readAndValidateStandbyPackage(
    packageFile,
    desktopManifest(version)
  );

  assert.equal(validated.packageVersion, version);
  assert.equal(validated.activationAllowed, true);

  const extraction = extractStandbyPackageSafely(packageFile, slotDir);

  assert.equal(fs.existsSync(extraction.payloadDir), true);
  assert.equal(
    fs.existsSync(path.join(extraction.payloadDir, 'offline-shell.html')),
    true
  );

  return {
    status: 'PREPARED',
    preparedAt: new Date().toISOString(),
    uiVersion: version,
    offlineCoreVersion: version,
    schemaVersion: 13,
    sha256: sha256(zip),
    sizeBytes: zip.length,
    signature: null,
    packageFile: 'standby-package.zip',
    packageType: validated.packageType,
    packageVersion: validated.packageVersion,
    activationAllowed: validated.activationAllowed,
    purpose: validated.purpose,
    extractionStatus: 'EXTRACTED',
    extractedSha256: sha256(zip),
    contentDir: 'payload',
    extractedFiles: extraction.extractedFiles,
    extractedBytes: extraction.extractedBytes,
    extractedAt: extraction.extractedAt
  };
}

async function runPhase1SelfTest() {
  assert.equal(compareVersions('1.0.41', '1.0.40'), 1);
  assert.equal(compareVersions('1.0.41', '1.0.41'), 0);
  assert.equal(compareVersions('1.0.40', '1.0.41'), -1);

  assert.throws(
    () => validateManifest({
      uiVersion: '1.0.41',
      offlineCoreVersion: '1.0.41',
      schemaVersion: 0,
      minimumElectronVersion: '43.0.0',
      minimumOfflineCoreVersion: '1.0.0'
    }),
    /schemaVersion/
  );

  const internal = validateStandbyPackageManifest(
    packageManifest('1.0.41'),
    desktopManifest('1.0.41')
  );
  assert.equal(internal.activationAllowed, true);

  await withTempDir(async (userDataDir) => {
    const paths = ensureStandbyStructure(userDataDir);

    assert.equal(fs.existsSync(paths.slotA), true);
    assert.equal(fs.existsSync(paths.slotB), true);
    assert.equal(fs.existsSync(paths.downloads), true);
    assert.equal(fs.existsSync(paths.quarantine), true);

    const initial = readJsonSafe(paths.state);
    assert.equal(initial.activeSlot, null);
    assert.equal(initial.previousSlot, null);

    const slotA = buildSlotPackage(paths.slotA, '1.0.40');
    const slotB = buildSlotPackage(paths.slotB, '1.0.41');

    writeJsonSafely(paths.state, {
      ...initial,
      slots: {
        A: slotA,
        B: slotB
      }
    });

    const preparedA = validatePreparedSlotForActivation({
      userDataDir,
      slotName: 'A'
    });
    assert.equal(preparedA.ok, true);

    const activatedA = activatePreparedSlot({
      userDataDir,
      slotName: 'A'
    });
    assert.equal(activatedA.activeSlot, 'A');
    assert.equal(activatedA.previousSlot, null);

    const compatibilityA = evaluateCompatibility(
      desktopManifest('1.0.41'),
      '43.4.1',
      activatedA.state
    );
    assert.equal(compatibilityA.electronCompatible, true);
    assert.equal(compatibilityA.offlineCoreCompatible, true);
    assert.equal(compatibilityA.standbyReady, true);

    const activatedB = activatePreparedSlot({
      userDataDir,
      slotName: 'B'
    });
    assert.equal(activatedB.activeSlot, 'B');
    assert.equal(activatedB.previousSlot, 'A');
    assert.equal(activatedB.state.slots.A.status, 'ROLLBACK_READY');
    assert.equal(activatedB.state.slots.B.status, 'ACTIVE');

    const rollbackValidation = validateRollbackSlot({ userDataDir });
    assert.equal(rollbackValidation.activeSlot, 'B');
    assert.equal(rollbackValidation.rollbackSlot, 'A');

    const rolledBack = rollbackToPreviousSlot({ userDataDir });
    assert.equal(rolledBack.ok, true);
    assert.equal(rolledBack.activeSlot, 'A');
    assert.equal(rolledBack.rolledBackFrom, 'B');
    assert.equal(rolledBack.state.previousSlot, null);
    assert.equal(rolledBack.state.slots.A.status, 'ACTIVE');
    assert.equal(rolledBack.state.slots.B.status, 'ROLLED_BACK');

    const finalState = readJsonSafe(standbyPaths(userDataDir).state);
    assert.equal(finalState.activeSlot, 'A');
    assert.equal(finalState.previousSlot, null);
  }, 'efisco-phase1-selftest-');

  console.log('phase1-selftest: OK');
}

if (require.main === module) {
  runPhase1SelfTest().catch((error) => {
    console.error('phase1-selftest: FAILED');
    console.error(error && error.stack || error);
    process.exitCode = 1;
  });
}

module.exports = {
  runPhase1SelfTest
};
