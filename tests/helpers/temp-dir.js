'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const createdDirs = new Set();

function normalizePrefix(prefix) {
  const value = String(prefix == null ? 'e-fisco-test-' : prefix).trim();
  if (!value || !/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error('prefixo de diretório temporário inválido.');
  }
  return value.endsWith('-') ? value : value + '-';
}

function createTempDir(prefix = 'e-fisco-test-') {
  const base = path.resolve(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(base, normalizePrefix(prefix)));
  const resolved = path.resolve(dir);
  createdDirs.add(resolved);
  return resolved;
}

function removeTempDir(dir) {
  const resolved = path.resolve(String(dir || ''));
  if (!createdDirs.has(resolved)) {
    throw new Error('recusa de limpeza: diretório não foi criado por este helper.');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
  createdDirs.delete(resolved);
}

async function withTempDir(fn, prefix = 'e-fisco-test-') {
  if (typeof fn !== 'function') {
    throw new Error('withTempDir exige uma função.');
  }
  const dir = createTempDir(prefix);
  try {
    return await fn(dir);
  } finally {
    removeTempDir(dir);
  }
}

module.exports = {
  createTempDir,
  removeTempDir,
  withTempDir
};
