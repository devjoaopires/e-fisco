'use strict';

const OFFLINE_OPERATOR_CREDENTIAL_CANDIDATE_TTL_MS =
  120_000;

function decodeCanonicalBase64(
  value,
  expectedLength = null
) {
  const text =
    String(value || '').trim();

  if (!text) {
    return null;
  }

  try {
    const buffer =
      Buffer.from(text, 'base64');

    if (
      buffer.length < 1 ||
      buffer.toString('base64') !== text
    ) {
      try {
        buffer.fill(0);
      } catch (_) {}

      return null;
    }

    if (
      expectedLength != null &&
      buffer.length !== Number(expectedLength)
    ) {
      try {
        buffer.fill(0);
      } catch (_) {}

      return null;
    }

    return buffer;
  } catch (_) {
    return null;
  }
}

function createOperatorVerifierController({
  safeStorage,
  crypto,
  log = () => {},
  listPreparedOfflineCompanies,
  listActiveOfflineOperatorCredentials,
  getLegacyEmpresaId = () => '',
  now = () => Date.now()
} = {}) {
  let pendingOfflineOperatorVerifier = null;

  function validateOfflineOperatorPasswordLocal(
    input = {}
  ) {
    const senha =
      String(
        input.senha == null
          ? ''
          : input.senha
      ).trim();

    if (!/^\d{1,6}$/.test(senha)) {
      return {
        success: false,
        reason: 'INVALID_CREDENTIAL'
      };
    }

    const empresaId =
      String(
        input.empresaId ||
        getLegacyEmpresaId() ||
        ''
      ).trim();

    if (!empresaId) {
      return {
        success: false,
        reason: 'OFFLINE_EMPRESA_NOT_READY'
      };
    }

    if (
      !safeStorage ||
      !safeStorage.isEncryptionAvailable()
    ) {
      return {
        success: false,
        reason: 'SAFE_STORAGE_UNAVAILABLE'
      };
    }

    const candidates =
      typeof listActiveOfflineOperatorCredentials ===
        'function'
        ? listActiveOfflineOperatorCredentials(
            empresaId
          )
        : [];

    let matched = null;
    let matches = 0;

    for (const candidate of candidates) {
      if (
        !candidate ||
        candidate.ativo !== true
      ) {
        continue;
      }

      const credentialKdf =
        String(
          candidate.credentialKdf ||
          ''
        ).toUpperCase();

      const isScrypt =
        credentialKdf ===
          'SCRYPT_V1_SAFE_STORAGE';

      const isPbkdf2 =
        credentialKdf ===
          'PBKDF2_SHA256_V1_SAFE_STORAGE';

      if (!isScrypt && !isPbkdf2) {
        continue;
      }

      const params =
        candidate.credentialParams &&
        typeof candidate.credentialParams ===
          'object' &&
        !Array.isArray(
          candidate.credentialParams
        )
          ? candidate.credentialParams
          : {};

      if (
        String(params.wrapper || '') !==
          'safeStorage' ||
        Number(params.keyLength) !== 32
      ) {
        continue;
      }

      if (
        isScrypt &&
        (
          Number(params.N) !== 32768 ||
          Number(params.r) !== 8 ||
          Number(params.p) !== 1
        )
      ) {
        continue;
      }

      if (
        isPbkdf2 &&
        (
          Number(params.iterations) !==
            310000 ||
          String(
            params.hash || ''
          ).toUpperCase() !==
            'SHA-256'
        )
      ) {
        continue;
      }

      let saltBuffer = null;
      let encryptedVerifierBuffer = null;
      let expectedVerifierBuffer = null;
      let calculatedVerifierBuffer = null;

      try {
        saltBuffer =
          decodeCanonicalBase64(
            candidate.credentialSalt,
            16
          );

        encryptedVerifierBuffer =
          decodeCanonicalBase64(
            candidate.credentialVerifier
          );

        if (
          !saltBuffer ||
          !encryptedVerifierBuffer
        ) {
          continue;
        }

        const decryptedVerifierText =
          safeStorage.decryptString(
            encryptedVerifierBuffer
          );

        expectedVerifierBuffer =
          decodeCanonicalBase64(
            decryptedVerifierText,
            32
          );

        if (!expectedVerifierBuffer) {
          continue;
        }

        calculatedVerifierBuffer =
          isScrypt
            ? crypto.scryptSync(
                senha,
                saltBuffer,
                32,
                {
                  N: 32768,
                  r: 8,
                  p: 1,
                  maxmem:
                    64 * 1024 * 1024
                }
              )
            : crypto.pbkdf2Sync(
                senha,
                saltBuffer,
                310000,
                32,
                'sha256'
              );

        if (
          crypto.timingSafeEqual(
            calculatedVerifierBuffer,
            expectedVerifierBuffer
          )
        ) {
          matches += 1;
          matched = {
            success: true,
            empresaId:
              candidate.empresaId,
            operadorId:
              candidate.operadorId,
            nomeOperador:
              candidate.nome,
            operadorNome:
              candidate.nome,
            perfil:
              candidate.perfil,
            acessoTotal:
              candidate.perfil ===
                'ADMINISTRADOR' &&
              candidate.acessoTotal ===
                true,
            offline: true
          };
        }
      } catch (_) {
        // Credencial local inválida/corrompida: ignora e mantém falha fechada.
      } finally {
        for (
          const buffer of
          [
            saltBuffer,
            encryptedVerifierBuffer,
            expectedVerifierBuffer,
            calculatedVerifierBuffer
          ]
        ) {
          if (buffer) {
            try {
              buffer.fill(0);
            } catch (_) {}
          }
        }
      }
    }

    if (
      matches !== 1 ||
      !matched
    ) {
      return {
        success: false,
        reason:
          matches > 1
            ? 'AMBIGUOUS_CREDENTIAL'
            : 'ACCESS_DENIED'
      };
    }

    return matched;
  }

  function validateOfflineOperatorPasswordAcrossPreparedCompanies(
    input = {}
  ) {
    const senha =
      String(
        input.senha == null
          ? ''
          : input.senha
      ).trim();

    if (!/^\d{1,6}$/.test(senha)) {
      return {
        success: false,
        reason: 'INVALID_CREDENTIAL'
      };
    }

    const preparedCompanies =
      typeof listPreparedOfflineCompanies ===
        'function'
        ? listPreparedOfflineCompanies()
        : [];

    const empresaIds = [];
    const seen = new Set();

    for (const company of preparedCompanies) {
      const empresaId =
        String(
          company &&
          company.empresaId ||
          ''
        ).trim();

      if (
        !empresaId ||
        seen.has(empresaId)
      ) {
        continue;
      }

      seen.add(empresaId);
      empresaIds.push(empresaId);
    }

    if (empresaIds.length < 1) {
      const legacyEmpresaId =
        String(
          getLegacyEmpresaId() ||
          ''
        ).trim();

      if (legacyEmpresaId) {
        empresaIds.push(
          legacyEmpresaId
        );
      }
    }

    if (empresaIds.length < 1) {
      return {
        success: false,
        reason:
          'OFFLINE_EMPRESA_NOT_READY'
      };
    }

    let matched = null;
    let matches = 0;
    let ambiguous = false;

    for (const empresaId of empresaIds) {
      const result =
        validateOfflineOperatorPasswordLocal({
          senha,
          empresaId
        });

      if (
        result &&
        result.success === true
      ) {
        matches += 1;
        matched = result;
        continue;
      }

      if (
        result &&
        result.reason ===
          'AMBIGUOUS_CREDENTIAL'
      ) {
        ambiguous = true;
      }
    }

    if (
      ambiguous ||
      matches !== 1 ||
      !matched
    ) {
      return {
        success: false,
        reason:
          (
            ambiguous ||
            matches > 1
          )
            ? 'AMBIGUOUS_CREDENTIAL'
            : 'ACCESS_DENIED'
      };
    }

    return matched;
  }

  function clearPendingOfflineOperatorVerifierCandidate(
    candidate
  ) {
    const target =
      candidate &&
      typeof candidate === 'object'
        ? candidate
        : null;

    if (
      target &&
      Buffer.isBuffer(
        target.serverVerifierBuffer
      )
    ) {
      try {
        target.serverVerifierBuffer.fill(0);
      } catch (_) {}
    }

    if (
      target &&
      pendingOfflineOperatorVerifier ===
        target
    ) {
      pendingOfflineOperatorVerifier = null;
    }

    return true;
  }

  function storePendingOfflineOperatorVerifierCandidate(
    payload = {}
  ) {
    if (
      !payload ||
      typeof payload !== 'object'
    ) {
      return false;
    }

    const kdf =
      String(
        payload.kdf || ''
      )
        .trim()
        .toUpperCase();

    const isScrypt =
      kdf === 'SCRYPT_V1';

    const isPbkdf2 =
      kdf === 'PBKDF2_SHA256_V1';

    if (!isScrypt && !isPbkdf2) {
      return false;
    }

    const params =
      payload.params &&
      typeof payload.params === 'object' &&
      !Array.isArray(payload.params)
        ? payload.params
        : {};

    if (
      Number(params.keyLength) !== 32
    ) {
      return false;
    }

    if (
      isScrypt &&
      (
        Number(params.N) !== 32768 ||
        Number(params.r) !== 8 ||
        Number(params.p) !== 1
      )
    ) {
      return false;
    }

    if (
      isPbkdf2 &&
      (
        Number(params.iterations) !== 310000 ||
        String(
          params.hash || ''
        ).toUpperCase() !== 'SHA-256'
      )
    ) {
      return false;
    }

    const saltText =
      String(payload.salt || '')
        .trim();

    const verifierText =
      String(payload.verifier || '')
        .trim();

    if (
      !saltText ||
      !verifierText
    ) {
      return false;
    }

    let saltBuffer = null;
    let verifierBuffer = null;

    try {
      saltBuffer =
        Buffer.from(
          saltText,
          'base64'
        );

      verifierBuffer =
        Buffer.from(
          verifierText,
          'base64'
        );

      if (
        saltBuffer.length !== 16 ||
        verifierBuffer.length !== 32 ||
        saltBuffer.toString('base64') !==
          saltText ||
        verifierBuffer.toString('base64') !==
          verifierText
      ) {
        return false;
      }

      if (
        !safeStorage ||
        !safeStorage.isEncryptionAvailable()
      ) {
        log(
          'OFFLINE OPERATOR VERIFIER SKIPPED',
          {
            reason:
              'SAFE_STORAGE_UNAVAILABLE'
          }
        );

        return false;
      }

      const encryptedVerifier =
        safeStorage
          .encryptString(
            verifierBuffer.toString(
              'base64'
            )
          )
          .toString('base64');

      const storedKdf =
        isScrypt
          ? 'SCRYPT_V1_SAFE_STORAGE'
          : 'PBKDF2_SHA256_V1_SAFE_STORAGE';

      const storedParams =
        isScrypt
          ? {
              N: 32768,
              r: 8,
              p: 1,
              keyLength: 32,
              wrapper: 'safeStorage'
            }
          : {
              iterations: 310000,
              hash: 'SHA-256',
              keyLength: 32,
              wrapper: 'safeStorage'
            };

      if (pendingOfflineOperatorVerifier) {
        clearPendingOfflineOperatorVerifierCandidate(
          pendingOfflineOperatorVerifier
        );
      }

      pendingOfflineOperatorVerifier = {
        kdf:
          storedKdf,
        salt:
          saltText,
        verifier:
          encryptedVerifier,
        params:
          storedParams,
        credentialRevision:
          crypto.randomUUID(),
        serverVerifierBuffer:
          isPbkdf2
            ? Buffer.from(
                verifierBuffer
              )
            : null,
        capturedAt:
          now()
      };

      log(
        'OFFLINE OPERATOR VERIFIER CANDIDATE READY',
        {
          kdf:
            storedKdf,
          encrypted:
            true
        }
      );

      return true;
    } catch (error) {
      log(
        'OFFLINE OPERATOR VERIFIER CANDIDATE FAILED',
        {
          erro:
            String(
              error &&
              error.message ||
              error
            )
        }
      );

      return false;
    } finally {
      if (saltBuffer) {
        try {
          saltBuffer.fill(0);
        } catch (_) {}
      }

      if (verifierBuffer) {
        try {
          verifierBuffer.fill(0);
        } catch (_) {}
      }
    }
  }

  function getPendingOfflineOperatorVerifierCandidate() {
    return pendingOfflineOperatorVerifier;
  }

  function isCurrentPendingOfflineOperatorVerifierCandidate(
    candidate
  ) {
    return (
      candidate != null &&
      pendingOfflineOperatorVerifier ===
        candidate
    );
  }

  function isPendingOfflineOperatorVerifierCandidateExpired(
    candidate
  ) {
    return Boolean(
      candidate &&
      now() -
        Number(
          candidate.capturedAt || 0
        ) >
        OFFLINE_OPERATOR_CREDENTIAL_CANDIDATE_TTL_MS
    );
  }

  return Object.freeze({
    validateOfflineOperatorPasswordLocal,
    validateOfflineOperatorPasswordAcrossPreparedCompanies,
    clearPendingOfflineOperatorVerifierCandidate,
    storePendingOfflineOperatorVerifierCandidate,
    getPendingOfflineOperatorVerifierCandidate,
    isCurrentPendingOfflineOperatorVerifierCandidate,
    isPendingOfflineOperatorVerifierCandidateExpired
  });
}

module.exports = {
  OFFLINE_OPERATOR_CREDENTIAL_CANDIDATE_TTL_MS,
  decodeCanonicalBase64,
  createOperatorVerifierController
};
