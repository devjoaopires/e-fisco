'use strict';

function nowIso() {
  return new Date().toISOString();
}

function requiredText(value, fieldName) {
  const text = String(value == null ? '' : value).trim();
  if (!text) {
    throw new Error(`${fieldName} é obrigatório para o cache offline.`);
  }
  return text;
}

function optionalText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function booleanInt(value, defaultValue = true) {
  if (value == null) return defaultValue ? 1 : 0;
  return value === false || value === 0 || value === '0' ? 0 : 1;
}

function jsonText(value) {
  return JSON.stringify(value == null ? {} : value);
}

function parseJsonText(value) {
  if (value == null || value === '') return null;
  try { return JSON.parse(String(value)); } catch (_) { return null; }
}

function upsertOfflineOperatorCredential(db, input = {}) {
  const empresaId = requiredText(input.empresaId, 'empresaId');
  const operadorId = requiredText(input.operadorId, 'operadorId');
  const nome = requiredText(input.nome, 'nome');
  const perfil = requiredText(input.perfil, 'perfil')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z]/gi, '')
    .toUpperCase();

  if (!['ADMINISTRADOR', 'SUPERVISOR', 'CAIXA'].includes(perfil)) {
    throw new Error('perfil do operador offline é inválido.');
  }

  const credentialKdf = requiredText(
    input.credentialKdf,
    'credentialKdf'
  );
  const credentialSalt = requiredText(
    input.credentialSalt,
    'credentialSalt'
  );
  const credentialVerifier = requiredText(
    input.credentialVerifier,
    'credentialVerifier'
  );

  const credentialParams =
    input.credentialParams &&
    typeof input.credentialParams === 'object' &&
    !Array.isArray(input.credentialParams)
      ? input.credentialParams
      : {};

  const credentialRevision =
    optionalText(input.credentialRevision);
  const sourceUpdatedAt =
    optionalText(input.sourceUpdatedAt);
  const cachedAt = nowIso();

  db.prepare(`
    INSERT INTO offline_operator_credentials (
      empresa_id,
      operador_id,
      nome,
      perfil,
      acesso_total,
      ativo,
      credential_kdf,
      credential_salt,
      credential_verifier,
      credential_params_json,
      credential_revision,
      source_updated_at,
      cached_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(empresa_id, operador_id) DO UPDATE SET
      nome = excluded.nome,
      perfil = excluded.perfil,
      acesso_total = excluded.acesso_total,
      ativo = excluded.ativo,
      credential_kdf = excluded.credential_kdf,
      credential_salt = excluded.credential_salt,
      credential_verifier = excluded.credential_verifier,
      credential_params_json = excluded.credential_params_json,
      credential_revision = excluded.credential_revision,
      source_updated_at = excluded.source_updated_at,
      cached_at = excluded.cached_at
  `).run(
    empresaId,
    operadorId,
    nome,
    perfil,
    booleanInt(input.acessoTotal, false),
    booleanInt(input.ativo, true),
    credentialKdf,
    credentialSalt,
    credentialVerifier,
    jsonText(credentialParams),
    credentialRevision,
    sourceUpdatedAt,
    cachedAt
  );

  return {
    empresaId,
    operadorId,
    nome,
    perfil,
    acessoTotal: booleanInt(input.acessoTotal, false) === 1,
    ativo: booleanInt(input.ativo, true) === 1,
    credentialKdf,
    credentialRevision,
    sourceUpdatedAt,
    cachedAt
  };
}

function deactivateOfflineOperatorCredentialsExcept(
  db,
  input = {}
) {

  const empresaId =
    requiredText(
      input.empresaId,
      'empresaId'
    );

  const operadorIds =
    Array.isArray(
      input.operadorIds
    )
      ? [
          ...new Set(
            input.operadorIds
              .map(
                (value) =>
                  String(
                    value || ''
                  ).trim()
              )
              .filter(Boolean)
          )
        ]
      : [];

  if (operadorIds.length < 1) {
    const result =
      db.prepare(
        'UPDATE offline_operator_credentials ' +
        'SET ativo = 0 ' +
        'WHERE empresa_id = ? ' +
        'AND ativo = 1'
      ).run(
        empresaId
      );

    return Number(
      result.changes || 0
    );
  }

  const placeholders =
    operadorIds
      .map(() => '?')
      .join(',');

  const result =
    db.prepare(
      'UPDATE offline_operator_credentials ' +
      'SET ativo = 0 ' +
      'WHERE empresa_id = ? ' +
      'AND ativo = 1 ' +
      'AND operador_id NOT IN (' +
      placeholders +
      ')'
    ).run(
      empresaId,
      ...operadorIds
    );

  return Number(
    result.changes || 0
  );
}

function deactivateOfflineOperatorCredentialsOutsideCompanies(
  db,
  empresaIdsValue = []
) {

  const empresaIds =
    Array.isArray(
      empresaIdsValue
    )
      ? [
          ...new Set(
            empresaIdsValue
              .map(
                (value) =>
                  String(
                    value || ''
                  ).trim()
              )
              .filter(Boolean)
          )
        ]
      : [];

  if (empresaIds.length < 1) {
    const result =
      db.prepare(
        'UPDATE offline_operator_credentials ' +
        'SET ativo = 0 ' +
        'WHERE ativo = 1'
      ).run();

    return Number(
      result.changes || 0
    );
  }

  const placeholders =
    empresaIds
      .map(() => '?')
      .join(',');

  const result =
    db.prepare(
      'UPDATE offline_operator_credentials ' +
      'SET ativo = 0 ' +
      'WHERE ativo = 1 ' +
      'AND empresa_id NOT IN (' +
      placeholders +
      ')'
    ).run(
      ...empresaIds
    );

  return Number(
    result.changes || 0
  );
}

function mapProvisionedCredentialRow(row) {
  if (!row) return null;

  return {
    empresaId:
      String(row.empresa_id),
    operadorId:
      String(row.operador_id),
    nome:
      String(row.nome),
    perfil:
      String(row.perfil),
    acessoTotal:
      Number(row.acesso_total) === 1,
    ativo:
      Number(row.ativo) === 1,
    lookupScheme:
      String(row.lookup_scheme),
    lookupVerifier:
      String(row.lookup_verifier),
    sourceUpdatedAt:
      row.source_updated_at == null
        ? null
        : String(row.source_updated_at),
    cachedAt:
      String(row.cached_at)
  };
}

function upsertProvisionedOfflineCredential(db, input = {}) {
  const empresaId =
    requiredText(
      input.empresaId,
      'empresaId'
    );
  const operadorId =
    requiredText(
      input.operadorId,
      'operadorId'
    );
  const nome =
    requiredText(
      input.nome,
      'nome'
    );
  const perfil =
    requiredText(
      input.perfil,
      'perfil'
    )
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z]/gi, '')
      .toUpperCase();

  if (
    ![
      'ADMINISTRADOR',
      'SUPERVISOR',
      'CAIXA'
    ].includes(perfil)
  ) {
    throw new Error(
      'perfil provisionado offline é inválido.'
    );
  }

  const lookupScheme =
    requiredText(
      input.lookupScheme,
      'lookupScheme'
    );
  const lookupVerifier =
    requiredText(
      input.lookupVerifier,
      'lookupVerifier'
    );
  const sourceUpdatedAt =
    optionalText(
      input.sourceUpdatedAt
    );
  const cachedAt =
    nowIso();

  db.prepare(`
    INSERT INTO offline_provisioned_credentials (
      empresa_id,
      operador_id,
      nome,
      perfil,
      acesso_total,
      ativo,
      lookup_scheme,
      lookup_verifier,
      source_updated_at,
      cached_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (
      empresa_id,
      operador_id
    ) DO UPDATE SET
      nome = excluded.nome,
      perfil = excluded.perfil,
      acesso_total =
        excluded.acesso_total,
      ativo = excluded.ativo,
      lookup_scheme =
        excluded.lookup_scheme,
      lookup_verifier =
        excluded.lookup_verifier,
      source_updated_at =
        excluded.source_updated_at,
      cached_at =
        excluded.cached_at
  `).run(
    empresaId,
    operadorId,
    nome,
    perfil,
    booleanInt(
      input.acessoTotal,
      false
    ),
    booleanInt(
      input.ativo,
      true
    ),
    lookupScheme,
    lookupVerifier,
    sourceUpdatedAt,
    cachedAt
  );

  return {
    empresaId,
    operadorId,
    nome,
    perfil,
    acessoTotal:
      booleanInt(
        input.acessoTotal,
        false
      ) === 1,
    ativo:
      booleanInt(
        input.ativo,
        true
      ) === 1,
    lookupScheme,
    sourceUpdatedAt,
    cachedAt
  };
}

function listActiveProvisionedOfflineCredentials(
  db,
  empresaIdValue = null
) {

  const empresaId =
    empresaIdValue == null
      ? null
      : requiredText(
          empresaIdValue,
          'empresaId'
        );

  const rows =
    empresaId
      ? db.prepare(`
          SELECT
            empresa_id,
            operador_id,
            nome,
            perfil,
            acesso_total,
            ativo,
            lookup_scheme,
            lookup_verifier,
            source_updated_at,
            cached_at
          FROM offline_provisioned_credentials
          WHERE empresa_id = ?
            AND ativo = 1
          ORDER BY
            nome COLLATE NOCASE,
            operador_id
        `).all(empresaId)
      : db.prepare(`
          SELECT
            empresa_id,
            operador_id,
            nome,
            perfil,
            acesso_total,
            ativo,
            lookup_scheme,
            lookup_verifier,
            source_updated_at,
            cached_at
          FROM offline_provisioned_credentials
          WHERE ativo = 1
          ORDER BY
            empresa_id,
            nome COLLATE NOCASE,
            operador_id
        `).all();

  return rows.map(
    mapProvisionedCredentialRow
  );
}

function deactivateProvisionedOfflineCredentialsExcept(
  db,
  input = {}
) {
  const empresaId =
    requiredText(
      input.empresaId,
      'empresaId'
    );
  const operadorIds =
    Array.isArray(
      input.operadorIds
    )
      ? [
          ...new Set(
            input.operadorIds
              .map(
                (value) =>
                  String(
                    value || ''
                  ).trim()
              )
              .filter(Boolean)
          )
        ]
      : [];

  if (operadorIds.length < 1) {
    const result =
      db.prepare(`
        UPDATE offline_provisioned_credentials
           SET ativo = 0
         WHERE empresa_id = ?
           AND ativo = 1
      `).run(
        empresaId
      );

    return Number(
      result.changes || 0
    );
  }

  const placeholders =
    operadorIds
      .map(() => '?')
      .join(',');

  const result =
    db.prepare(`
      UPDATE offline_provisioned_credentials
         SET ativo = 0
       WHERE empresa_id = ?
         AND ativo = 1
         AND operador_id NOT IN (
           ${placeholders}
         )
    `).run(
      empresaId,
      ...operadorIds
    );

  return Number(
    result.changes || 0
  );
}

function deactivateProvisionedOfflineCredentialsOutsideCompanies(
  db,
  empresaIdsValue = []
) {
  const empresaIds =
    Array.isArray(
      empresaIdsValue
    )
      ? [
          ...new Set(
            empresaIdsValue
              .map(
                (value) =>
                  String(
                    value || ''
                  ).trim()
              )
              .filter(Boolean)
          )
        ]
      : [];

  if (empresaIds.length < 1) {
    const result =
      db.prepare(`
        UPDATE offline_provisioned_credentials
           SET ativo = 0
         WHERE ativo = 1
      `).run();

    return Number(
      result.changes || 0
    );
  }

  const placeholders =
    empresaIds
      .map(() => '?')
      .join(',');

  const result =
    db.prepare(`
      UPDATE offline_provisioned_credentials
         SET ativo = 0
       WHERE ativo = 1
         AND empresa_id NOT IN (
           ${placeholders}
         )
    `).run(
      ...empresaIds
    );

  return Number(
    result.changes || 0
  );
}

function listActiveOfflineOperatorCredentials(db, empresaIdValue) {
  const empresaId = requiredText(
    empresaIdValue,
    'empresaId'
  );

  const rows = db.prepare(`
    SELECT
      empresa_id,
      operador_id,
      nome,
      perfil,
      acesso_total,
      ativo,
      credential_kdf,
      credential_salt,
      credential_verifier,
      credential_params_json,
      credential_revision,
      source_updated_at,
      cached_at
    FROM offline_operator_credentials
    WHERE empresa_id = ?
      AND ativo = 1
    ORDER BY operador_id
  `).all(empresaId);

  return rows.map((row) => ({
    empresaId:
      String(row.empresa_id),
    operadorId:
      String(row.operador_id),
    nome:
      String(row.nome),
    perfil:
      String(row.perfil),
    acessoTotal:
      Number(row.acesso_total) === 1,
    ativo:
      Number(row.ativo) === 1,
    credentialKdf:
      String(row.credential_kdf),
    credentialSalt:
      String(row.credential_salt),
    credentialVerifier:
      String(row.credential_verifier),
    credentialParams:
      parseJsonText(
        row.credential_params_json
      ) || {},
    credentialRevision:
      row.credential_revision == null
        ? null
        : String(row.credential_revision),
    sourceUpdatedAt:
      row.source_updated_at == null
        ? null
        : String(row.source_updated_at),
    cachedAt:
      String(row.cached_at)
  }));
}

module.exports = {
  upsertOfflineOperatorCredential,
  listActiveOfflineOperatorCredentials,
  deactivateOfflineOperatorCredentialsExcept,
  deactivateOfflineOperatorCredentialsOutsideCompanies,
  upsertProvisionedOfflineCredential,
  listActiveProvisionedOfflineCredentials,
  deactivateProvisionedOfflineCredentialsExcept,
  deactivateProvisionedOfflineCredentialsOutsideCompanies
};
