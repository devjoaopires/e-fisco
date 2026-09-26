'use strict';

const MAGIC = Buffer.from('EFISCO_TEST_SAFE_STORAGE_V1\0', 'utf8');

function createFakeSafeStorage(options = {}) {
  const available = options.available !== false;

  return Object.freeze({
    isEncryptionAvailable() {
      return available;
    },

    encryptString(value) {
      if (!available) {
        throw new Error('SafeStorage fake indisponível.');
      }
      const text = String(value == null ? '' : value);
      return Buffer.concat([MAGIC, Buffer.from(text, 'utf8')]);
    },

    decryptString(value) {
      if (!available) {
        throw new Error('SafeStorage fake indisponível.');
      }
      const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
      if (
        buffer.length < MAGIC.length ||
        !buffer.subarray(0, MAGIC.length).equals(MAGIC)
      ) {
        throw new Error('Payload inválido para SafeStorage fake.');
      }
      return buffer.subarray(MAGIC.length).toString('utf8');
    }
  });
}

module.exports = {
  createFakeSafeStorage
};
