'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  initializeOfflineDatabase,
  closeOfflineDatabase,
  upsertOfflineOperatorCredential,
  listActiveOfflineOperatorCredentials,
  deactivateOfflineOperatorCredentialsExcept,
  deactivateOfflineOperatorCredentialsOutsideCompanies,
  upsertProvisionedOfflineCredential,
  listActiveProvisionedOfflineCredentials,
  deactivateProvisionedOfflineCredentialsExcept,
  deactivateProvisionedOfflineCredentialsOutsideCompanies,
  upsertPreparedOfflineCompany,
  getPreparedOfflineCompany,
  listPreparedOfflineCompanies
} = require('../../offline-db');

const {
  getOrCreateSyncDeviceId,
  getSyncEmpresaId,
  storeSyncEmpresaId
} = require('../../offline-device-auth');

const {
  withTempDir
} = require('../helpers/temp-dir');

test('local_config encapsula identidade do device/empresa e persiste após reopen', async () => {
  await withTempDir(async (userDataDir) => {
    const firstUuid =
      '12345678-1234-1234-1234-123456789abc';

    try {
      initializeOfflineDatabase({ userDataDir });

      const firstDeviceId =
        getOrCreateSyncDeviceId({
          db: require('../../offline-db').getOfflineDatabase(),
          randomUUID: () => firstUuid,
          updatedAt: '2026-09-27T15:00:00.000Z'
        });

      assert.equal(
        firstDeviceId,
        'desktop-' + firstUuid
      );

      assert.equal(
        getOrCreateSyncDeviceId({
          db: require('../../offline-db').getOfflineDatabase(),
          randomUUID: () => (
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
          )
        }),
        firstDeviceId
      );

      assert.equal(
        storeSyncEmpresaId({
          db: require('../../offline-db').getOfflineDatabase(),
          empresaId: ' empresa-d04 ',
          updatedAt: '2026-09-27T15:01:00.000Z'
        }),
        'empresa-d04'
      );

      assert.equal(
        getSyncEmpresaId({
          db: require('../../offline-db').getOfflineDatabase()
        }),
        'empresa-d04'
      );
    } finally {
      closeOfflineDatabase();
    }

    try {
      initializeOfflineDatabase({ userDataDir });

      assert.equal(
        getOrCreateSyncDeviceId({
          db: require('../../offline-db').getOfflineDatabase(),
          randomUUID: () => (
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
          )
        }),
        'desktop-' + firstUuid
      );

      assert.equal(
        getSyncEmpresaId({
          db: require('../../offline-db').getOfflineDatabase()
        }),
        'empresa-d04'
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-d04-identity-');
});

test('repositories de credenciais preservam operações da fachada', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });

      upsertOfflineOperatorCredential({
        empresaId: 'empresa-d04',
        operadorId: 'op-1',
        nome: 'Operador Um',
        perfil: 'caixa',
        acessoTotal: false,
        ativo: true,
        credentialKdf: 'scrypt-v1',
        credentialSalt: 'salt',
        credentialVerifier: 'verifier',
        credentialParams: { N: 16384 },
        credentialRevision: 'rev-1',
        sourceUpdatedAt: '2026-09-27T15:02:00.000Z'
      });

      const offline =
        listActiveOfflineOperatorCredentials(
          'empresa-d04'
        );

      assert.equal(offline.length, 1);
      assert.equal(offline[0].operadorId, 'op-1');
      assert.equal(offline[0].perfil, 'CAIXA');
      assert.deepEqual(
        offline[0].credentialParams,
        { N: 16384 }
      );

      assert.equal(
        deactivateOfflineOperatorCredentialsExcept({
          empresaId: 'empresa-d04',
          operadorIds: ['op-1']
        }),
        0
      );
      assert.equal(
        deactivateOfflineOperatorCredentialsOutsideCompanies([]),
        1
      );

      upsertProvisionedOfflineCredential({
        empresaId: 'empresa-d04',
        operadorId: 'op-2',
        nome: 'Operador Dois',
        perfil: 'supervisor',
        acessoTotal: true,
        ativo: true,
        lookupScheme: 'lookup-v1',
        lookupVerifier: 'lookup-verifier',
        sourceUpdatedAt: '2026-09-27T15:03:00.000Z'
      });

      const provisioned =
        listActiveProvisionedOfflineCredentials(
          'empresa-d04'
        );

      assert.equal(provisioned.length, 1);
      assert.equal(provisioned[0].operadorId, 'op-2');
      assert.equal(provisioned[0].perfil, 'SUPERVISOR');
      assert.equal(provisioned[0].acessoTotal, true);

      assert.equal(
        deactivateProvisionedOfflineCredentialsExcept({
          empresaId: 'empresa-d04',
          operadorIds: ['op-2']
        }),
        0
      );
      assert.equal(
        deactivateProvisionedOfflineCredentialsOutsideCompanies([]),
        1
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-d04-credentials-');
});

test('repository de empresas preparadas preserva preparedAt e atualiza lastPreparedAt', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });

      const first =
        upsertPreparedOfflineCompany({
          empresaId: 'empresa-d04',
          razaoSocial: 'Empresa D04',
          cnpj: '12345678000195',
          ambiente: 'producao',
          preparedAt: '2026-09-27T15:04:00.000Z'
        });

      assert.equal(
        first.preparedAt,
        '2026-09-27T15:04:00.000Z'
      );
      assert.equal(
        first.lastPreparedAt,
        '2026-09-27T15:04:00.000Z'
      );

      const second =
        upsertPreparedOfflineCompany({
          empresaId: 'empresa-d04',
          razaoSocial: 'Empresa D04 Atualizada',
          cnpj: '12345678000195',
          ambiente: 'producao',
          preparedAt: '2026-09-27T15:05:00.000Z'
        });

      assert.equal(
        second.preparedAt,
        '2026-09-27T15:04:00.000Z'
      );
      assert.equal(
        second.lastPreparedAt,
        '2026-09-27T15:05:00.000Z'
      );
      assert.equal(
        getPreparedOfflineCompany('empresa-d04')
          .razaoSocial,
        'Empresa D04 Atualizada'
      );
      assert.equal(
        listPreparedOfflineCompanies().length,
        1
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-d04-prepared-');
});
