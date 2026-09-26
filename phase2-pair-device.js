'use strict';

const path = require('path');
const { app, safeStorage } = require('electron');
const {
  initializeOfflineDatabase,
  closeOfflineDatabase,
  getOfflineDatabase
} = require('./offline-db');
const {
  getOrCreateSyncDeviceId,
  storeSyncDeviceToken,
  hasStoredSyncDeviceToken
} = require('./offline-device-auth');
const { requestDevicePairing } = require('./offline-device-pairing');

async function main() {
  // Garante o mesmo userData usado pelo app principal.
  app.setPath('userData', path.join(app.getPath('appData'), 'e-fisco-desktop'));
  await app.whenReady();

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Criptografia segura do Windows indisponível; pareamento cancelado.');
  }

  initializeOfflineDatabase({ userDataDir: app.getPath('userData') });
  const deviceId = getOrCreateSyncDeviceId({ db: getOfflineDatabase() });

  if (hasStoredSyncDeviceToken({ userDataDir: app.getPath('userData') })) {
    throw new Error('Este device já possui um bearer armazenado. Pareamento cancelado para evitar sobrescrita acidental.');
  }

  console.log(`Device: ${deviceId}`);
  const pairingCode = String(process.argv[2] || '').trim();
  if (pairingCode.length < 16 || pairingCode.length > 128) {
    throw new Error('Código temporário ausente ou inválido. Use: npm run phase2:pair-device -- CODIGO_TEMPORARIO');
  }

  const paired = await requestDevicePairing({ deviceId, pairingCode });
  storeSyncDeviceToken({
    safeStorage,
    userDataDir: app.getPath('userData'),
    deviceToken: paired.deviceToken
  });

  // O bearer nunca é impresso.
  console.log(JSON.stringify({
    status: paired.status,
    deviceId: paired.deviceId,
    empresaId: paired.empresaId,
    expiresAt: paired.expiresAt,
    tokenConfigured: true
  }, null, 2));
}

main()
  .then(() => {
    try { closeOfflineDatabase(); } catch (_) {}
    app.quit();
  })
  .catch((error) => {
    try { closeOfflineDatabase(); } catch (_) {}
    console.error(`PAIRING ERROR: ${error && error.message ? error.message : error}`);
    app.exit(1);
  });
