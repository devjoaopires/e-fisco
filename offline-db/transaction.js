'use strict';

function beginImmediateTransaction(db) {
  db.exec('BEGIN IMMEDIATE;');

  let active = true;

  return {
    commit() {
      if (!active) return false;

      db.exec('COMMIT;');
      active = false;
      return true;
    },

    rollback() {
      if (!active) return false;

      try {
        db.exec('ROLLBACK;');
        active = false;
        return true;
      } catch (_) {
        active = false;
        return false;
      }
    },

    get active() {
      return active;
    }
  };
}

module.exports = {
  beginImmediateTransaction
};
