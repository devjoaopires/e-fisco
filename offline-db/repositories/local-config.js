'use strict';

const LOCAL_CONFIG_CONTEXT_PROPERTY =
  '__efiscoLocalConfigRepository';

function requiredDatabase(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error(
      'SQLite offline válido é obrigatório para local_config.'
    );
  }
  return db;
}

function parseJsonText(value) {
  if (value == null || value === '') return null;
  try {
    return JSON.parse(String(value));
  } catch (_) {
    return null;
  }
}

function createLocalConfigRepository(db) {
  const database = requiredDatabase(db);

  return Object.freeze({
    readRaw(key) {
      const row = database.prepare(
        'SELECT value_json FROM local_config WHERE config_key = ?'
      ).get(String(key));

      return row
        ? String(row.value_json)
        : null;
    },

    read(key) {
      const raw = this.readRaw(key);

      return raw == null
        ? null
        : parseJsonText(raw);
    },

    write(
      key,
      value,
      updatedAt = new Date().toISOString()
    ) {
      database.prepare(`
        INSERT INTO local_config (
          config_key,
          value_json,
          updated_at
        ) VALUES (?, ?, ?)
        ON CONFLICT(config_key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_at = excluded.updated_at
      `).run(
        String(key),
        JSON.stringify(value),
        String(updatedAt)
      );
    },

    delete(key) {
      database.prepare(
        'DELETE FROM local_config WHERE config_key = ?'
      ).run(String(key));
    }
  });
}

function attachLocalConfigRepository(db) {
  const database = requiredDatabase(db);
  const current =
    database[LOCAL_CONFIG_CONTEXT_PROPERTY];

  if (current) return current;

  const repository =
    createLocalConfigRepository(database);

  Object.defineProperty(
    database,
    LOCAL_CONFIG_CONTEXT_PROPERTY,
    {
      value: repository,
      enumerable: false,
      configurable: false,
      writable: false
    }
  );

  return repository;
}

module.exports = {
  LOCAL_CONFIG_CONTEXT_PROPERTY,
  attachLocalConfigRepository,
  createLocalConfigRepository
};
