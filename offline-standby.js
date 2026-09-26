'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const zlib = require('zlib');

const MANIFEST_FORMAT_VERSION = 1;
const DEFAULT_MANIFEST_URL =
  'https://api.e-fisco.app/desktop/manifest';
const DEFAULT_TIMEOUT_MS = 4000;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_OFFLINE_PACKAGE_BYTES = 512 * 1024 * 1024;
const MAX_INTERNAL_MANIFEST_BYTES = 64 * 1024;
const MAX_ZIP_CENTRAL_DIRECTORY_BYTES = 8 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 10000;
const MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;
const MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024;
const MAX_ZIP_EXPANSION_RATIO = 500;
const EXPECTED_PACKAGE_TYPE = 'e-fisco-offline-standby';

function text(value) {
  return String(value ?? '').trim();
}

function compareVersions(a, b) {
  const normalize = (value) =>
    text(value)
      .split(/[.+-]/)
      .map((part) => {
        const match = part.match(/^\d+/);
        return match ? Number(match[0]) : 0;
      });

  const left = normalize(a);
  const right = normalize(b);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const l = left[index] || 0;
    const r = right[index] || 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }

  return 0;
}

function validateManifest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Manifesto desktop deve ser um objeto JSON.');
  }

  const manifest = {
    manifestVersion:
      Number.isInteger(input.manifestVersion)
        ? input.manifestVersion
        : MANIFEST_FORMAT_VERSION,
    uiVersion: text(input.uiVersion),
    offlineCoreVersion: text(input.offlineCoreVersion),
    schemaVersion: Number(input.schemaVersion),
    minimumElectronVersion: text(input.minimumElectronVersion),
    minimumOfflineCoreVersion: text(input.minimumOfflineCoreVersion),
    publishedAt: text(input.publishedAt)
  };

  if (manifest.manifestVersion !== MANIFEST_FORMAT_VERSION) {
    throw new Error(
      `Versão de formato do manifesto não suportada: ${manifest.manifestVersion}.`
    );
  }

  const requiredTextFields = [
    'uiVersion',
    'offlineCoreVersion',
    'minimumElectronVersion',
    'minimumOfflineCoreVersion'
  ];

  for (const field of requiredTextFields) {
    if (!manifest[field]) {
      throw new Error(`Campo obrigatório ausente no manifesto: ${field}.`);
    }
  }

  if (
    !Number.isInteger(manifest.schemaVersion) ||
    manifest.schemaVersion < 1
  ) {
    throw new Error('schemaVersion deve ser um inteiro positivo.');
  }

  if (input.offlinePackage != null) {
    if (
      typeof input.offlinePackage !== 'object' ||
      Array.isArray(input.offlinePackage)
    ) {
      throw new Error('offlinePackage deve ser um objeto.');
    }

    const url = text(input.offlinePackage.url);
    const sha256 = text(input.offlinePackage.sha256).toLowerCase();
    const signature = text(input.offlinePackage.signature);

    if (!url) {
      throw new Error('offlinePackage.url é obrigatório quando offlinePackage existe.');
    }

    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      throw new Error('offlinePackage.sha256 deve conter SHA-256 hexadecimal válido.');
    }

    manifest.offlinePackage = {
      url,
      sha256,
      signature,
      sizeBytes:
        Number.isSafeInteger(Number(input.offlinePackage.sizeBytes)) &&
        Number(input.offlinePackage.sizeBytes) >= 0
          ? Number(input.offlinePackage.sizeBytes)
          : null
    };
  }

  return manifest;
}



function validateStandbyPackageManifest(input, expected = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('standby-package.json deve ser um objeto JSON.');
  }

  const packageManifest = {
    packageType: text(input.packageType),
    packageVersion: text(input.packageVersion),
    uiVersion: text(input.uiVersion),
    offlineCoreVersion: text(input.offlineCoreVersion),
    schemaVersion: Number(input.schemaVersion),
    activationAllowed: input.activationAllowed,
    purpose: text(input.purpose)
  };

  if (packageManifest.packageType !== EXPECTED_PACKAGE_TYPE) {
    throw new Error(
      `packageType inválido: ${packageManifest.packageType || '(vazio)'}.`
    );
  }

  for (const field of ['packageVersion', 'uiVersion', 'offlineCoreVersion']) {
    if (!packageManifest[field]) {
      throw new Error(`Campo obrigatório ausente no standby-package.json: ${field}.`);
    }
  }

  if (
    !Number.isInteger(packageManifest.schemaVersion) ||
    packageManifest.schemaVersion < 1
  ) {
    throw new Error('schemaVersion interno deve ser um inteiro positivo.');
  }

  if (typeof packageManifest.activationAllowed !== 'boolean') {
    throw new Error('activationAllowed deve ser booleano no standby-package.json.');
  }

  const expectedUiVersion = text(expected.uiVersion);
  const expectedCoreVersion = text(expected.offlineCoreVersion);
  const expectedSchemaVersion = Number(expected.schemaVersion);

  if (
    expectedUiVersion &&
    packageManifest.uiVersion !== expectedUiVersion
  ) {
    throw new Error(
      `uiVersion interno divergente. Esperado ${expectedUiVersion}, recebido ${packageManifest.uiVersion}.`
    );
  }

  if (
    expectedCoreVersion &&
    packageManifest.offlineCoreVersion !== expectedCoreVersion
  ) {
    throw new Error(
      `offlineCoreVersion interno divergente. Esperado ${expectedCoreVersion}, recebido ${packageManifest.offlineCoreVersion}.`
    );
  }

  if (
    Number.isInteger(expectedSchemaVersion) &&
    expectedSchemaVersion > 0 &&
    packageManifest.schemaVersion !== expectedSchemaVersion
  ) {
    throw new Error(
      `schemaVersion interno divergente. Esperado ${expectedSchemaVersion}, recebido ${packageManifest.schemaVersion}.`
    );
  }

  return packageManifest;
}

function readExactly(fd, length, position) {
  const buffer = Buffer.alloc(length);
  let offset = 0;

  while (offset < length) {
    const bytesRead = fs.readSync(
      fd,
      buffer,
      offset,
      length - offset,
      position + offset
    );

    if (bytesRead <= 0) {
      throw new Error('ZIP truncado durante a leitura.');
    }

    offset += bytesRead;
  }

  return buffer;
}

function readZipEntry(file, entryName, maxUncompressedBytes = MAX_INTERNAL_MANIFEST_BYTES) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size < 22) {
    throw new Error('Pacote ZIP inválido ou vazio.');
  }

  const fd = fs.openSync(file, 'r');

  try {
    const tailLength = Math.min(stat.size, 22 + 65535);
    const tailOffset = stat.size - tailLength;
    const tail = readExactly(fd, tailLength, tailOffset);

    let eocdIndex = -1;
    for (let index = tail.length - 22; index >= 0; index -= 1) {
      if (tail.readUInt32LE(index) === 0x06054b50) {
        eocdIndex = index;
        break;
      }
    }

    if (eocdIndex < 0) {
      throw new Error('ZIP sem registro EOCD válido.');
    }

    const diskNumber = tail.readUInt16LE(eocdIndex + 4);
    const centralDisk = tail.readUInt16LE(eocdIndex + 6);
    const entriesOnDisk = tail.readUInt16LE(eocdIndex + 8);
    const totalEntries = tail.readUInt16LE(eocdIndex + 10);
    const centralSize = tail.readUInt32LE(eocdIndex + 12);
    const centralOffset = tail.readUInt32LE(eocdIndex + 16);

    if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) {
      throw new Error('ZIP multi-volume não é suportado.');
    }

    if (
      totalEntries === 0xffff ||
      centralSize === 0xffffffff ||
      centralOffset === 0xffffffff
    ) {
      throw new Error('ZIP64 não é suportado para o pacote de standby.');
    }

    if (centralSize > MAX_ZIP_CENTRAL_DIRECTORY_BYTES) {
      throw new Error('Diretório central do ZIP excede o limite permitido.');
    }

    if (
      centralOffset + centralSize > stat.size ||
      centralOffset < 0
    ) {
      throw new Error('Diretório central do ZIP aponta para uma faixa inválida.');
    }

    const central = readExactly(fd, centralSize, centralOffset);
    let cursor = 0;
    let match = null;

    for (let entryIndex = 0; entryIndex < totalEntries; entryIndex += 1) {
      if (cursor + 46 > central.length) {
        throw new Error('Diretório central do ZIP está truncado.');
      }

      if (central.readUInt32LE(cursor) !== 0x02014b50) {
        throw new Error('Entrada inválida no diretório central do ZIP.');
      }

      const flags = central.readUInt16LE(cursor + 8);
      const method = central.readUInt16LE(cursor + 10);
      const compressedSize = central.readUInt32LE(cursor + 20);
      const uncompressedSize = central.readUInt32LE(cursor + 24);
      const nameLength = central.readUInt16LE(cursor + 28);
      const extraLength = central.readUInt16LE(cursor + 30);
      const commentLength = central.readUInt16LE(cursor + 32);
      const localHeaderOffset = central.readUInt32LE(cursor + 42);
      const entryEnd = cursor + 46 + nameLength + extraLength + commentLength;

      if (entryEnd > central.length) {
        throw new Error('Nome/extra/comentário da entrada ZIP excede o diretório central.');
      }

      const name = central
        .subarray(cursor + 46, cursor + 46 + nameLength)
        .toString('utf8');

      if (name === entryName) {
        if (match) {
          throw new Error(`ZIP contém entrada duplicada: ${entryName}.`);
        }

        match = {
          flags,
          method,
          compressedSize,
          uncompressedSize,
          localHeaderOffset
        };
      }

      cursor = entryEnd;
    }

    if (!match) {
      throw new Error(`Arquivo obrigatório ausente no ZIP: ${entryName}.`);
    }

    if ((match.flags & 0x0001) !== 0) {
      throw new Error('standby-package.json não pode estar criptografado no ZIP.');
    }

    if (match.uncompressedSize > maxUncompressedBytes) {
      throw new Error('standby-package.json excede o limite de tamanho permitido.');
    }

    if (match.compressedSize > 256 * 1024) {
      throw new Error('standby-package.json comprimido excede o limite permitido.');
    }

    if (match.localHeaderOffset + 30 > stat.size) {
      throw new Error('Cabeçalho local do standby-package.json está fora do ZIP.');
    }

    const localHeader = readExactly(fd, 30, match.localHeaderOffset);
    if (localHeader.readUInt32LE(0) !== 0x04034b50) {
      throw new Error('Cabeçalho local inválido para standby-package.json.');
    }

    const localNameLength = localHeader.readUInt16LE(26);
    const localExtraLength = localHeader.readUInt16LE(28);
    const dataOffset =
      match.localHeaderOffset + 30 + localNameLength + localExtraLength;

    if (dataOffset + match.compressedSize > stat.size) {
      throw new Error('Dados do standby-package.json estão fora dos limites do ZIP.');
    }

    const compressed = readExactly(
      fd,
      match.compressedSize,
      dataOffset
    );

    let content;
    if (match.method === 0) {
      content = compressed;
    } else if (match.method === 8) {
      content = zlib.inflateRawSync(compressed, {
        maxOutputLength: maxUncompressedBytes
      });
    } else {
      throw new Error(
        `Método de compressão ZIP não suportado para standby-package.json: ${match.method}.`
      );
    }

    if (content.length !== match.uncompressedSize) {
      throw new Error('Tamanho descomprimido do standby-package.json é divergente.');
    }

    return content;
  } finally {
    fs.closeSync(fd);
  }
}

function readAndValidateStandbyPackage(file, expectedManifest) {
  let parsed;
  try {
    const raw = readZipEntry(file, 'standby-package.json');
    parsed = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`standby-package.json possui JSON inválido: ${error.message}`);
    }
    throw error;
  }

  return validateStandbyPackageManifest(parsed, expectedManifest || {});
}


function normalizeZipEntryName(rawName) {
  const original = String(rawName ?? '');

  if (!original || original.includes('\0')) {
    throw new Error('ZIP contém nome de entrada vazio ou inválido.');
  }

  const slashName = original.replace(/\\/g, '/');

  if (
    slashName.startsWith('/') ||
    slashName.startsWith('//') ||
    /^[A-Za-z]:/.test(slashName)
  ) {
    throw new Error(`ZIP contém caminho absoluto não permitido: ${original}.`);
  }

  const isDirectory = slashName.endsWith('/');
  const rawParts = slashName.split('/');
  if (isDirectory) rawParts.pop();

  if (rawParts.length === 0) {
    throw new Error(`ZIP contém caminho inválido: ${original}.`);
  }

  const parts = [];
  const reservedWindowsNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;

  for (const rawPart of rawParts) {
    const part = rawPart.normalize('NFC');

    if (!part || part === '.' || part === '..') {
      throw new Error(`ZIP contém travessia/caminho ambíguo não permitido: ${original}.`);
    }

    if (
      part.includes(':') ||
      /[. ]$/.test(part) ||
      reservedWindowsNames.test(part)
    ) {
      throw new Error(`ZIP contém componente de caminho não permitido: ${original}.`);
    }

    parts.push(part);
  }

  const normalized = parts.join('/');
  if (normalized.length > 1024) {
    throw new Error('ZIP contém caminho maior que o limite permitido.');
  }

  return {
    name: normalized + (isDirectory ? '/' : ''),
    relativePath: normalized,
    isDirectory
  };
}

function listZipEntries(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size < 22) {
    throw new Error('Pacote ZIP inválido ou vazio.');
  }

  const fd = fs.openSync(file, 'r');

  try {
    const tailLength = Math.min(stat.size, 22 + 65535);
    const tailOffset = stat.size - tailLength;
    const tail = readExactly(fd, tailLength, tailOffset);

    let eocdIndex = -1;
    for (let index = tail.length - 22; index >= 0; index -= 1) {
      if (tail.readUInt32LE(index) === 0x06054b50) {
        eocdIndex = index;
        break;
      }
    }

    if (eocdIndex < 0) {
      throw new Error('ZIP sem registro EOCD válido.');
    }

    const diskNumber = tail.readUInt16LE(eocdIndex + 4);
    const centralDisk = tail.readUInt16LE(eocdIndex + 6);
    const entriesOnDisk = tail.readUInt16LE(eocdIndex + 8);
    const totalEntries = tail.readUInt16LE(eocdIndex + 10);
    const centralSize = tail.readUInt32LE(eocdIndex + 12);
    const centralOffset = tail.readUInt32LE(eocdIndex + 16);

    if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) {
      throw new Error('ZIP multi-volume não é suportado.');
    }

    if (
      totalEntries === 0xffff ||
      centralSize === 0xffffffff ||
      centralOffset === 0xffffffff
    ) {
      throw new Error('ZIP64 não é suportado para o pacote de standby.');
    }

    if (totalEntries > MAX_ZIP_ENTRIES) {
      throw new Error('ZIP excede o limite de quantidade de arquivos.');
    }

    if (centralSize > MAX_ZIP_CENTRAL_DIRECTORY_BYTES) {
      throw new Error('Diretório central do ZIP excede o limite permitido.');
    }

    if (centralOffset + centralSize > stat.size) {
      throw new Error('Diretório central do ZIP aponta para uma faixa inválida.');
    }

    const central = readExactly(fd, centralSize, centralOffset);
    const entries = [];
    const seenNames = new Set();
    let totalUncompressed = 0;
    let cursor = 0;

    for (let entryIndex = 0; entryIndex < totalEntries; entryIndex += 1) {
      if (cursor + 46 > central.length) {
        throw new Error('Diretório central do ZIP está truncado.');
      }

      if (central.readUInt32LE(cursor) !== 0x02014b50) {
        throw new Error('Entrada inválida no diretório central do ZIP.');
      }

      const versionMadeBy = central.readUInt16LE(cursor + 4);
      const flags = central.readUInt16LE(cursor + 8);
      const method = central.readUInt16LE(cursor + 10);
      const compressedSize = central.readUInt32LE(cursor + 20);
      const uncompressedSize = central.readUInt32LE(cursor + 24);
      const nameLength = central.readUInt16LE(cursor + 28);
      const extraLength = central.readUInt16LE(cursor + 30);
      const commentLength = central.readUInt16LE(cursor + 32);
      const externalAttributes = central.readUInt32LE(cursor + 38);
      const localHeaderOffset = central.readUInt32LE(cursor + 42);
      const entryEnd = cursor + 46 + nameLength + extraLength + commentLength;

      if (entryEnd > central.length) {
        throw new Error('Entrada ZIP excede os limites do diretório central.');
      }

      const nameBytes = central.subarray(cursor + 46, cursor + 46 + nameLength);
      if ((flags & 0x0800) === 0 && Array.from(nameBytes).some((byte) => byte >= 0x80)) {
        throw new Error('ZIP contém nome não ASCII sem flag UTF-8; codificação ambígua recusada.');
      }

      const decodedName = nameBytes.toString('utf8');
      const normalized = normalizeZipEntryName(decodedName);
      const key = normalized.name.toLocaleLowerCase('en-US');

      if (seenNames.has(key)) {
        throw new Error(`ZIP contém caminho duplicado: ${normalized.name}.`);
      }
      seenNames.add(key);

      if ((flags & 0x0001) !== 0) {
        throw new Error(`ZIP contém entrada criptografada não permitida: ${normalized.name}.`);
      }

      if (![0, 8].includes(method)) {
        throw new Error(`Método de compressão não suportado (${method}) em ${normalized.name}.`);
      }

      if (uncompressedSize > MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES) {
        throw new Error(`Entrada ZIP excede o limite individual: ${normalized.name}.`);
      }

      totalUncompressed += uncompressedSize;
      if (totalUncompressed > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES) {
        throw new Error('Conteúdo descomprimido do ZIP excede o limite total permitido.');
      }

      if (
        compressedSize > 0 &&
        uncompressedSize / compressedSize > MAX_ZIP_EXPANSION_RATIO
      ) {
        throw new Error(`Taxa de expansão suspeita no ZIP: ${normalized.name}.`);
      }

      const hostSystem = versionMadeBy >>> 8;
      if (hostSystem === 3) {
        const unixMode = (externalAttributes >>> 16) & 0xffff;
        const fileType = unixMode & 0xf000;
        if (fileType === 0xa000) {
          throw new Error(`Link simbólico não permitido no ZIP: ${normalized.name}.`);
        }
        if (fileType && ![0x4000, 0x8000].includes(fileType)) {
          throw new Error(`Tipo especial de arquivo não permitido no ZIP: ${normalized.name}.`);
        }
      }

      entries.push({
        ...normalized,
        flags,
        method,
        compressedSize,
        uncompressedSize,
        localHeaderOffset
      });

      cursor = entryEnd;
    }

    const fileNames = new Set(
      entries
        .filter((entry) => !entry.isDirectory)
        .map((entry) => entry.relativePath.toLocaleLowerCase('en-US'))
    );

    for (const entry of entries) {
      const parts = entry.relativePath.split('/');
      for (let index = 1; index < parts.length; index += 1) {
        const parent = parts.slice(0, index).join('/').toLocaleLowerCase('en-US');
        if (fileNames.has(parent)) {
          throw new Error(`ZIP tenta criar conteúdo dentro de arquivo: ${entry.name}.`);
        }
      }
    }

    return { entries, totalUncompressed };
  } finally {
    fs.closeSync(fd);
  }
}

function extractStandbyPackageSafely(file, slotDir) {
  const { entries, totalUncompressed } = listZipEntries(file);
  const payloadDir = path.join(slotDir, 'payload');
  const stagingDir = path.join(
    slotDir,
    `.payload-preparing-${process.pid}-${Date.now()}`
  );

  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  const fd = fs.openSync(file, 'r');
  let extractedFiles = 0;

  try {
    for (const entry of entries) {
      const destination = path.join(
        stagingDir,
        ...entry.relativePath.split('/')
      );

      const resolvedRoot = path.resolve(stagingDir);
      const resolvedDestination = path.resolve(destination);
      if (
        resolvedDestination !== resolvedRoot &&
        !resolvedDestination.startsWith(`${resolvedRoot}${path.sep}`)
      ) {
        throw new Error(`Entrada ZIP escaparia do slot: ${entry.name}.`);
      }

      if (entry.isDirectory) {
        fs.mkdirSync(destination, { recursive: true });
        continue;
      }

      if (entry.localHeaderOffset + 30 > fs.fstatSync(fd).size) {
        throw new Error(`Cabeçalho local fora do ZIP: ${entry.name}.`);
      }

      const localHeader = readExactly(fd, 30, entry.localHeaderOffset);
      if (localHeader.readUInt32LE(0) !== 0x04034b50) {
        throw new Error(`Cabeçalho local inválido: ${entry.name}.`);
      }

      const localFlags = localHeader.readUInt16LE(6);
      const localMethod = localHeader.readUInt16LE(8);
      const localNameLength = localHeader.readUInt16LE(26);
      const localExtraLength = localHeader.readUInt16LE(28);

      if ((localFlags & 0x0001) !== 0 || localMethod !== entry.method) {
        throw new Error(`Cabeçalho local divergente: ${entry.name}.`);
      }

      const localNameBytes = readExactly(
        fd,
        localNameLength,
        entry.localHeaderOffset + 30
      );
      const localDecodedName = localNameBytes.toString('utf8');
      const localNormalized = normalizeZipEntryName(localDecodedName);
      if (localNormalized.name !== entry.name) {
        throw new Error(`Nome local divergente do diretório central: ${entry.name}.`);
      }

      const dataOffset =
        entry.localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = readExactly(fd, entry.compressedSize, dataOffset);

      let content;
      if (entry.method === 0) {
        content = compressed;
      } else {
        content = zlib.inflateRawSync(compressed, {
          maxOutputLength: Math.min(
            MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES,
            Math.max(entry.uncompressedSize, 1)
          )
        });
      }

      if (content.length !== entry.uncompressedSize) {
        throw new Error(`Tamanho descomprimido divergente: ${entry.name}.`);
      }

      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, content, { flag: 'wx' });
      extractedFiles += 1;
    }
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  } finally {
    fs.closeSync(fd);
  }

  const previousPayload = `${payloadDir}.previous-${process.pid}-${Date.now()}`;
  let movedPrevious = false;

  try {
    if (fs.existsSync(payloadDir)) {
      fs.renameSync(payloadDir, previousPayload);
      movedPrevious = true;
    }

    fs.renameSync(stagingDir, payloadDir);

    if (movedPrevious) {
      fs.rmSync(previousPayload, { recursive: true, force: true });
    }
  } catch (error) {
    try {
      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
      if (movedPrevious && !fs.existsSync(payloadDir) && fs.existsSync(previousPayload)) {
        fs.renameSync(previousPayload, payloadDir);
      }
    } catch (_) {}
    throw error;
  }

  return {
    payloadDir,
    extractedFiles,
    extractedBytes: totalUncompressed,
    extractedAt: new Date().toISOString()
  };
}

function standbyPaths(userDataDir) {
  const root = path.join(userDataDir, 'offline-standby');
  return {
    root,
    state: path.join(root, 'state.json'),
    lastValidManifest: path.join(root, 'last-valid-manifest.json'),
    slotsRoot: path.join(root, 'slots'),
    slotA: path.join(root, 'slots', 'A'),
    slotB: path.join(root, 'slots', 'B'),
    downloads: path.join(root, 'downloads'),
    quarantine: path.join(root, 'quarantine')
  };
}

function ensureStandbyStructure(userDataDir) {
  const paths = standbyPaths(userDataDir);
  for (const dir of [
    paths.root,
    paths.slotsRoot,
    paths.slotA,
    paths.slotB,
    paths.downloads,
    paths.quarantine
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(paths.state)) {
    writeJsonSafely(paths.state, {
      formatVersion: 1,
      activeSlot: null,
      previousSlot: null,
      slots: {
        A: null,
        B: null
      },
      lastManifestCheckAt: null,
      lastManifestStatus: 'NEVER_CHECKED'
    });
  }

  return paths;
}

function readJsonSafe(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function writeJsonSafely(file, value) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });

  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(
    temp,
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8'
  );

  try {
    fs.renameSync(temp, file);
  } catch (_) {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
      fs.renameSync(temp, file);
    } finally {
      if (fs.existsSync(temp)) {
        try { fs.unlinkSync(temp); } catch (_) {}
      }
    }
  }
}

function isAllowedManifestUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_) {
    return false;
  }

  if (parsed.protocol === 'https:') return true;

  return (
    parsed.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)
  );
}

function requestJson(rawUrl, options = {}, redirects = 0) {
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;

  if (!isAllowedManifestUrl(rawUrl)) {
    return Promise.reject(
      new Error('URL de manifesto não permitida; use HTTPS (HTTP só é aceito em localhost).')
    );
  }

  if (redirects > 3) {
    return Promise.reject(new Error('Manifesto excedeu o limite de redirecionamentos.'));
  }

  const parsed = new URL(rawUrl);
  const transport = parsed.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.get(
      parsed,
      {
        headers: {
          accept: 'application/json',
          'user-agent': text(options.userAgent) || 'e-fisco-desktop-manifest'
        }
      },
      (response) => {
        const status = Number(response.statusCode || 0);

        if ([301, 302, 307, 308].includes(status)) {
          const location = text(response.headers.location);
          response.resume();
          if (!location) {
            reject(new Error('Redirecionamento de manifesto sem Location.'));
            return;
          }
          const nextUrl = new URL(location, parsed).toString();
          requestJson(nextUrl, options, redirects + 1).then(resolve, reject);
          return;
        }

        if (status !== 200) {
          response.resume();
          reject(new Error(`Manifesto respondeu HTTP ${status || 'desconhecido'}.`));
          return;
        }

        const contentType = text(response.headers['content-type']).toLowerCase();
        if (contentType && !contentType.includes('json')) {
          response.resume();
          reject(new Error(`Content-Type inesperado do manifesto: ${contentType}.`));
          return;
        }

        const chunks = [];
        let bytes = 0;

        response.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > MAX_MANIFEST_BYTES) {
            response.destroy(new Error('Manifesto excedeu o limite de tamanho.'));
            return;
          }
          chunks.push(chunk);
        });

        response.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '');
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`Manifesto JSON inválido: ${error.message}`));
          }
        });
      }
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Timeout ao consultar manifesto após ${timeoutMs} ms.`));
    });

    request.on('error', reject);
  });
}


function inactiveSlotName(state) {
  return state && state.activeSlot === 'A' ? 'B' : 'A';
}

function downloadFileWithSha256(rawUrl, destination, options = {}, redirects = 0) {
  const timeoutMs = Number(options.timeoutMs) || 15000;
  const maxBytes = Number(options.maxBytes) || MAX_OFFLINE_PACKAGE_BYTES;

  if (!isAllowedManifestUrl(rawUrl)) {
    return Promise.reject(
      new Error('URL de pacote não permitida; use HTTPS (HTTP só é aceito em localhost).')
    );
  }

  if (redirects > 3) {
    return Promise.reject(new Error('Pacote excedeu o limite de redirecionamentos.'));
  }

  const parsed = new URL(rawUrl);
  const transport = parsed.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    let settled = false;
    let output = null;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      try { if (output) output.destroy(); } catch (_) {}
      try { if (fs.existsSync(destination)) fs.unlinkSync(destination); } catch (_) {}
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const request = transport.get(
      parsed,
      {
        headers: {
          accept: 'application/octet-stream, application/zip, */*',
          'user-agent': text(options.userAgent) || 'e-fisco-desktop-package'
        }
      },
      (response) => {
        const status = Number(response.statusCode || 0);

        if ([301, 302, 307, 308].includes(status)) {
          const location = text(response.headers.location);
          response.resume();
          if (!location) {
            fail(new Error('Redirecionamento de pacote sem Location.'));
            return;
          }

          const nextUrl = new URL(location, parsed).toString();
          downloadFileWithSha256(
            nextUrl,
            destination,
            options,
            redirects + 1
          ).then(resolve, reject);
          settled = true;
          return;
        }

        if (status !== 200) {
          response.resume();
          fail(new Error(`Pacote respondeu HTTP ${status || 'desconhecido'}.`));
          return;
        }

        const declaredLength = Number(response.headers['content-length'] || 0);
        if (declaredLength > maxBytes) {
          response.resume();
          fail(new Error('Pacote excedeu o limite máximo permitido.'));
          return;
        }

        fs.mkdirSync(path.dirname(destination), { recursive: true });
        output = fs.createWriteStream(destination, { flags: 'wx' });
        const hash = crypto.createHash('sha256');
        let bytes = 0;

        output.on('error', fail);
        response.on('error', fail);

        response.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > maxBytes) {
            response.destroy(new Error('Pacote excedeu o limite máximo permitido.'));
            return;
          }
          hash.update(chunk);
        });

        response.pipe(output);

        output.on('finish', () => {
          if (settled) return;
          settled = true;
          resolve({
            bytes,
            sha256: hash.digest('hex')
          });
        });
      }
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Timeout ao baixar pacote após ${timeoutMs} ms.`));
    });

    request.on('error', fail);
  });
}

async function prepareOfflinePackage(options) {
  const userDataDir = text(options && options.userDataDir);
  const manifest = options && options.manifest;
  const electronVersion = text(options && options.electronVersion);

  if (!userDataDir) {
    throw new Error('userDataDir é obrigatório para preparar o pacote offline.');
  }

  if (!electronVersion) {
    throw new Error('electronVersion é obrigatório para preparar o pacote offline.');
  }

  const validatedManifest = validateManifest(manifest);
  const packageInfo = validatedManifest.offlinePackage;

  if (!packageInfo) {
    return {
      ok: false,
      skipped: true,
      reason: 'NO_OFFLINE_PACKAGE'
    };
  }

  if (
    compareVersions(
      electronVersion,
      validatedManifest.minimumElectronVersion
    ) < 0
  ) {
    return {
      ok: false,
      skipped: true,
      reason: 'ELECTRON_INCOMPATIBLE'
    };
  }

  if (
    packageInfo.sizeBytes != null &&
    packageInfo.sizeBytes > MAX_OFFLINE_PACKAGE_BYTES
  ) {
    throw new Error('sizeBytes do pacote excede o limite permitido.');
  }

  const paths = ensureStandbyStructure(userDataDir);
  const state = readJsonSafe(paths.state) || {};
  const slotName = inactiveSlotName(state);
  const slotDir = slotName === 'A' ? paths.slotA : paths.slotB;
  const existing = state.slots && state.slots[slotName];
  const finalFile = path.join(slotDir, 'standby-package.zip');

  if (
    existing &&
    existing.sha256 === packageInfo.sha256 &&
    fs.existsSync(finalFile)
  ) {
    try {
      const internalManifest = readAndValidateStandbyPackage(
        finalFile,
        validatedManifest
      );

      const extraction =
        existing.extractionStatus === 'EXTRACTED' &&
        existing.extractedSha256 === packageInfo.sha256 &&
        fs.existsSync(path.join(slotDir, 'payload'))
          ? {
              payloadDir: path.join(slotDir, 'payload'),
              extractedFiles: existing.extractedFiles || null,
              extractedBytes: existing.extractedBytes || null,
              extractedAt: existing.extractedAt || null
            }
          : extractStandbyPackageSafely(finalFile, slotDir);

      const refreshedMetadata = {
        ...existing,
        packageType: internalManifest.packageType,
        packageVersion: internalManifest.packageVersion,
        activationAllowed: internalManifest.activationAllowed,
        purpose: internalManifest.purpose || null,
        extractionStatus: 'EXTRACTED',
        extractedSha256: packageInfo.sha256,
        contentDir: 'payload',
        extractedFiles: extraction.extractedFiles,
        extractedBytes: extraction.extractedBytes,
        extractedAt: extraction.extractedAt || existing.extractedAt || new Date().toISOString()
      };

      const latestState = readJsonSafe(paths.state) || {};
      updateStateAfterCheck(paths, {
        slots: {
          ...(latestState.slots || { A: null, B: null }),
          [slotName]: refreshedMetadata
        },
        lastPackageStatus: 'PREPARED',
        lastPackageError: null,
        lastPackageValidatedAt: new Date().toISOString(),
        lastPackageExtractedAt: refreshedMetadata.extractedAt,
        preparingSlot: null
      });

      return {
        ok: true,
        skipped: true,
        reason: 'ALREADY_PREPARED_VALIDATED',
        slot: slotName,
        path: finalFile,
        metadata: refreshedMetadata,
        internalManifest
      };
    } catch (_) {
      try { fs.unlinkSync(finalFile); } catch (_) {}
    }
  }

  const tempFile = path.join(
    paths.downloads,
    `standby-${Date.now()}-${process.pid}.part`
  );

  updateStateAfterCheck(paths, {
    lastPackageStatus: 'DOWNLOADING',
    lastPackageError: null,
    lastPackageAttemptAt: new Date().toISOString(),
    preparingSlot: slotName
  });

  try {
    const result = await downloadFileWithSha256(
      packageInfo.url,
      tempFile,
      {
        timeoutMs: options && options.timeoutMs,
        userAgent: options && options.userAgent,
        maxBytes: MAX_OFFLINE_PACKAGE_BYTES
      }
    );

    if (result.sha256 !== packageInfo.sha256) {
      throw new Error(
        `SHA-256 divergente. Esperado ${packageInfo.sha256}, recebido ${result.sha256}.`
      );
    }

    if (
      packageInfo.sizeBytes != null &&
      result.bytes !== packageInfo.sizeBytes
    ) {
      throw new Error(
        `Tamanho divergente. Esperado ${packageInfo.sizeBytes}, recebido ${result.bytes}.`
      );
    }

    const internalManifest = readAndValidateStandbyPackage(
      tempFile,
      validatedManifest
    );

    fs.mkdirSync(slotDir, { recursive: true });
    try {
      if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
      fs.renameSync(tempFile, finalFile);
    } catch (error) {
      try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (_) {}
      throw error;
    }

    const extraction = extractStandbyPackageSafely(finalFile, slotDir);

    const metadata = {
      status: 'PREPARED',
      preparedAt: new Date().toISOString(),
      uiVersion: validatedManifest.uiVersion,
      offlineCoreVersion: validatedManifest.offlineCoreVersion,
      schemaVersion: validatedManifest.schemaVersion,
      sha256: result.sha256,
      sizeBytes: result.bytes,
      signature: packageInfo.signature || null,
      packageFile: 'standby-package.zip',
      packageType: internalManifest.packageType,
      packageVersion: internalManifest.packageVersion,
      activationAllowed: internalManifest.activationAllowed,
      purpose: internalManifest.purpose || null,
      extractionStatus: 'EXTRACTED',
      extractedSha256: result.sha256,
      contentDir: 'payload',
      extractedFiles: extraction.extractedFiles,
      extractedBytes: extraction.extractedBytes,
      extractedAt: extraction.extractedAt
    };

    const latestState = readJsonSafe(paths.state) || {};
    const nextSlots = {
      ...(latestState.slots || { A: null, B: null }),
      [slotName]: metadata
    };

    updateStateAfterCheck(paths, {
      slots: nextSlots,
      lastPackageStatus: 'PREPARED',
      lastPackageError: null,
      lastPackagePreparedAt: metadata.preparedAt,
      lastPackageValidatedAt: new Date().toISOString(),
      lastPackageExtractedAt: metadata.extractedAt,
      preparingSlot: null
    });

    return {
      ok: true,
      skipped: false,
      slot: slotName,
      path: finalFile,
      metadata
    };
  } catch (error) {
    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (_) {}

    updateStateAfterCheck(paths, {
      lastPackageStatus: 'FAILED',
      lastPackageError: text(error && error.message).slice(0, 500),
      preparingSlot: null
    });

    throw error;
  }
}

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.alloc(1024 * 1024);

  try {
    while (true) {
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead <= 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }

  return hash.digest('hex');
}

function validatePreparedSlotForActivation(options) {
  const userDataDir = text(options && options.userDataDir);
  const requestedSlot = text(options && options.slotName).toUpperCase();

  if (!userDataDir) {
    throw new Error('userDataDir é obrigatório para validar ativação do slot.');
  }

  if (!['A', 'B'].includes(requestedSlot)) {
    throw new Error('slotName deve ser A ou B.');
  }

  const paths = ensureStandbyStructure(userDataDir);
  const state = readJsonSafe(paths.state) || {};
  const slot = state.slots && state.slots[requestedSlot];

  if (!slot || slot.status !== 'PREPARED') {
    throw new Error(`Slot ${requestedSlot} não está PREPARED.`);
  }

  if (slot.extractionStatus !== 'EXTRACTED') {
    throw new Error(`Slot ${requestedSlot} não foi extraído com segurança.`);
  }

  if (slot.activationAllowed !== true) {
    throw new Error(`Ativação do slot ${requestedSlot} não autorizada pelo pacote.`);
  }

  const slotDir = requestedSlot === 'A' ? paths.slotA : paths.slotB;
  const packageFile = path.join(slotDir, slot.packageFile || 'standby-package.zip');
  const payloadDir = path.join(slotDir, slot.contentDir || 'payload');

  if (!fs.existsSync(packageFile) || !fs.statSync(packageFile).isFile()) {
    throw new Error(`Pacote do slot ${requestedSlot} não foi encontrado.`);
  }

  if (!fs.existsSync(payloadDir) || !fs.statSync(payloadDir).isDirectory()) {
    throw new Error(`Payload extraído do slot ${requestedSlot} não foi encontrado.`);
  }

  const currentSha256 = sha256File(packageFile);
  if (!slot.sha256 || currentSha256 !== text(slot.sha256).toLowerCase()) {
    throw new Error(`SHA-256 do slot ${requestedSlot} divergiu após preparação.`);
  }

  const expected = {
    uiVersion: slot.uiVersion,
    offlineCoreVersion: slot.offlineCoreVersion,
    schemaVersion: slot.schemaVersion
  };
  const internalManifest = readAndValidateStandbyPackage(packageFile, expected);

  if (internalManifest.activationAllowed !== true) {
    throw new Error(`Manifesto interno do slot ${requestedSlot} não autoriza ativação.`);
  }

  return {
    ok: true,
    slotName: requestedSlot,
    slotDir,
    packageFile,
    payloadDir,
    sha256: currentSha256,
    metadata: slot,
    internalManifest
  };
}

function activatePreparedSlot(options) {
  const validation = validatePreparedSlotForActivation(options);
  const paths = ensureStandbyStructure(text(options && options.userDataDir));
  const state = readJsonSafe(paths.state) || {};
  const previousSlot = ['A', 'B'].includes(state.activeSlot)
    ? state.activeSlot
    : null;
  const activatedAt = new Date().toISOString();
  const nextSlots = {
    ...(state.slots || { A: null, B: null })
  };

  if (previousSlot && previousSlot !== validation.slotName && nextSlots[previousSlot]) {
    nextSlots[previousSlot] = {
      ...nextSlots[previousSlot],
      status: 'ROLLBACK_READY',
      deactivatedAt: activatedAt
    };
  }

  nextSlots[validation.slotName] = {
    ...nextSlots[validation.slotName],
    status: 'ACTIVE',
    activatedAt
  };

  const nextState = updateStateAfterCheck(paths, {
    previousSlot:
      previousSlot && previousSlot !== validation.slotName
        ? previousSlot
        : state.previousSlot || null,
    activeSlot: validation.slotName,
    slots: nextSlots,
    lastActivationAt: activatedAt,
    lastActivationSlot: validation.slotName,
    lastActivationError: null
  });

  return {
    ok: true,
    activeSlot: validation.slotName,
    previousSlot: nextState.previousSlot || null,
    payloadDir: validation.payloadDir,
    state: nextState
  };
}

function validateRollbackSlot(options) {
  const userDataDir = text(options && options.userDataDir);

  if (!userDataDir) {
    throw new Error('userDataDir é obrigatório para validar rollback.');
  }

  const paths = ensureStandbyStructure(userDataDir);
  const state = readJsonSafe(paths.state) || {};
  const activeSlot = ['A', 'B'].includes(state.activeSlot)
    ? state.activeSlot
    : null;
  const rollbackSlot = ['A', 'B'].includes(state.previousSlot)
    ? state.previousSlot
    : null;

  if (!activeSlot) {
    throw new Error('Não existe slot ativo para rollback.');
  }

  if (!rollbackSlot || rollbackSlot === activeSlot) {
    throw new Error('Não existe slot anterior válido para rollback.');
  }

  const slot = state.slots && state.slots[rollbackSlot];
  if (!slot || slot.status !== 'ROLLBACK_READY') {
    throw new Error(`Slot ${rollbackSlot} não está ROLLBACK_READY.`);
  }

  if (slot.extractionStatus !== 'EXTRACTED') {
    throw new Error(`Slot ${rollbackSlot} não possui payload extraído válido.`);
  }

  if (slot.activationAllowed !== true) {
    throw new Error(`Rollback para o slot ${rollbackSlot} não é autorizado pelo pacote.`);
  }

  const slotDir = rollbackSlot === 'A' ? paths.slotA : paths.slotB;
  const packageFile = path.join(slotDir, slot.packageFile || 'standby-package.zip');
  const payloadDir = path.join(slotDir, slot.contentDir || 'payload');

  if (!fs.existsSync(packageFile) || !fs.statSync(packageFile).isFile()) {
    throw new Error(`Pacote de rollback do slot ${rollbackSlot} não foi encontrado.`);
  }

  if (!fs.existsSync(payloadDir) || !fs.statSync(payloadDir).isDirectory()) {
    throw new Error(`Payload de rollback do slot ${rollbackSlot} não foi encontrado.`);
  }

  const currentSha256 = sha256File(packageFile);
  if (!slot.sha256 || currentSha256 !== text(slot.sha256).toLowerCase()) {
    throw new Error(`SHA-256 do slot de rollback ${rollbackSlot} divergiu.`);
  }

  const internalManifest = readAndValidateStandbyPackage(packageFile, {
    uiVersion: slot.uiVersion,
    offlineCoreVersion: slot.offlineCoreVersion,
    schemaVersion: slot.schemaVersion
  });

  if (internalManifest.activationAllowed !== true) {
    throw new Error(`Manifesto interno do slot ${rollbackSlot} não autoriza rollback.`);
  }

  return {
    ok: true,
    activeSlot,
    rollbackSlot,
    slotDir,
    packageFile,
    payloadDir,
    sha256: currentSha256,
    metadata: slot,
    internalManifest
  };
}

function rollbackToPreviousSlot(options) {
  const validation = validateRollbackSlot(options);
  const paths = ensureStandbyStructure(text(options && options.userDataDir));
  const state = readJsonSafe(paths.state) || {};
  const rolledBackAt = new Date().toISOString();
  const nextSlots = {
    ...(state.slots || { A: null, B: null })
  };

  if (nextSlots[validation.activeSlot]) {
    nextSlots[validation.activeSlot] = {
      ...nextSlots[validation.activeSlot],
      status: 'ROLLED_BACK',
      deactivatedAt: rolledBackAt,
      rolledBackAt
    };
  }

  nextSlots[validation.rollbackSlot] = {
    ...nextSlots[validation.rollbackSlot],
    status: 'ACTIVE',
    activatedAt: rolledBackAt,
    rollbackActivatedAt: rolledBackAt
  };

  const nextState = updateStateAfterCheck(paths, {
    activeSlot: validation.rollbackSlot,
    previousSlot: null,
    slots: nextSlots,
    lastRollbackAt: rolledBackAt,
    lastRollbackFrom: validation.activeSlot,
    lastRollbackTo: validation.rollbackSlot,
    lastRollbackError: null
  });

  return {
    ok: true,
    activeSlot: validation.rollbackSlot,
    rolledBackFrom: validation.activeSlot,
    payloadDir: validation.payloadDir,
    state: nextState
  };
}

function localOfflineCoreVersion(state) {
  if (!state || !state.activeSlot || !state.slots) return '';
  const slot = state.slots[state.activeSlot];
  return text(slot && slot.offlineCoreVersion);
}

function evaluateCompatibility(manifest, electronVersion, state) {
  const electronCompatible =
    compareVersions(electronVersion, manifest.minimumElectronVersion) >= 0;

  const installedCoreVersion = localOfflineCoreVersion(state);
  const offlineCoreCompatible =
    Boolean(installedCoreVersion) &&
    compareVersions(
      installedCoreVersion,
      manifest.minimumOfflineCoreVersion
    ) >= 0;

  return {
    electronVersion: text(electronVersion),
    minimumElectronVersion: manifest.minimumElectronVersion,
    electronCompatible,
    installedOfflineCoreVersion: installedCoreVersion || null,
    requiredOfflineCoreVersion: manifest.offlineCoreVersion,
    minimumOfflineCoreVersion: manifest.minimumOfflineCoreVersion,
    offlineCoreCompatible,
    standbyReady: electronCompatible && offlineCoreCompatible,
    schemaVersion: manifest.schemaVersion,
    uiVersion: manifest.uiVersion
  };
}

function updateStateAfterCheck(paths, patch) {
  const current = readJsonSafe(paths.state) || {
    formatVersion: 1,
    activeSlot: null,
    previousSlot: null,
    slots: { A: null, B: null }
  };

  const next = {
    ...current,
    ...patch
  };

  writeJsonSafely(paths.state, next);
  return next;
}

async function checkDesktopManifest(options) {
  const userDataDir = text(options && options.userDataDir);
  const electronVersion = text(options && options.electronVersion);
  const logger =
    options && typeof options.logger === 'function'
      ? options.logger
      : () => {};

  if (!userDataDir) {
    throw new Error('userDataDir é obrigatório para o standby offline.');
  }

  if (!electronVersion) {
    throw new Error('electronVersion é obrigatório para o standby offline.');
  }

  const paths = ensureStandbyStructure(userDataDir);
  const state = readJsonSafe(paths.state) || {};
  const manifestUrl =
    text(options && options.manifestUrl) ||
    text(process.env.EFISCO_DESKTOP_MANIFEST_URL) ||
    DEFAULT_MANIFEST_URL;

  const checkedAt = new Date().toISOString();

  try {
    const received = await requestJson(manifestUrl, {
      timeoutMs: options && options.timeoutMs,
      userAgent: options && options.userAgent
    });

    const manifest = validateManifest(received);
    writeJsonSafely(paths.lastValidManifest, manifest);

    const compatibility = evaluateCompatibility(
      manifest,
      electronVersion,
      state
    );

    updateStateAfterCheck(paths, {
      lastManifestCheckAt: checkedAt,
      lastManifestStatus: 'OK',
      lastManifestError: null,
      manifest: {
        uiVersion: manifest.uiVersion,
        offlineCoreVersion: manifest.offlineCoreVersion,
        schemaVersion: manifest.schemaVersion,
        minimumElectronVersion: manifest.minimumElectronVersion,
        minimumOfflineCoreVersion: manifest.minimumOfflineCoreVersion
      },
      compatibility
    });

    return {
      ok: true,
      source: 'REMOTE',
      manifestUrl,
      manifest,
      compatibility,
      paths
    };
  } catch (error) {
    logger('MANIFESTO OFFLINE INDISPONIVEL', error);

    const cachedRaw = readJsonSafe(paths.lastValidManifest);
    let cachedManifest = null;
    let compatibility = null;

    if (cachedRaw) {
      try {
        cachedManifest = validateManifest(cachedRaw);
        compatibility = evaluateCompatibility(
          cachedManifest,
          electronVersion,
          state
        );
      } catch (_) {
        cachedManifest = null;
        compatibility = null;
      }
    }

    updateStateAfterCheck(paths, {
      lastManifestCheckAt: checkedAt,
      lastManifestStatus: cachedManifest ? 'CACHED' : 'UNAVAILABLE',
      lastManifestError: text(error && error.message).slice(0, 500),
      compatibility
    });

    return {
      ok: Boolean(cachedManifest),
      source: cachedManifest ? 'CACHE' : 'NONE',
      manifestUrl,
      manifest: cachedManifest,
      compatibility,
      error: text(error && error.message),
      paths
    };
  }
}

module.exports = {
  MANIFEST_FORMAT_VERSION,
  DEFAULT_MANIFEST_URL,
  compareVersions,
  validateManifest,
  validateStandbyPackageManifest,
  readAndValidateStandbyPackage,
  listZipEntries,
  extractStandbyPackageSafely,
  standbyPaths,
  ensureStandbyStructure,
  readJsonSafe,
  writeJsonSafely,
  evaluateCompatibility,
  checkDesktopManifest,
  prepareOfflinePackage,
  validatePreparedSlotForActivation,
  activatePreparedSlot,
  validateRollbackSlot,
  rollbackToPreviousSlot
};
