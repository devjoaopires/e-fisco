'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function compareVersions(a, b) {
  const pa = String(a || '').split('.').map((parte) => {
    const numero = parseInt(parte, 10);
    return Number.isFinite(numero) ? numero : 0;
  });

  const pb = String(b || '').split('.').map((parte) => {
    const numero = parseInt(parte, 10);
    return Number.isFinite(numero) ? numero : 0;
  });

  const tamanho = Math.max(pa.length, pb.length);

  for (let i = 0; i < tamanho; i += 1) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;

    if (va > vb) return 1;
    if (va < vb) return -1;
  }

  return 0;
}

function updatingPage() {
  const html = `
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Atualizando e-fisco</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Arial, sans-serif;
    background: #f4f6f8;
    color: #18202a;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .card {
    width: 460px;
    background: #fff;
    border-radius: 16px;
    padding: 38px;
    text-align: center;
    box-shadow: 0 12px 40px rgba(0,0,0,.12);
  }
  h1 {
    margin: 0 0 16px;
    font-size: 26px;
  }
  p {
    font-size: 16px;
    line-height: 1.5;
  }
</style>
</head>
<body>
  <div class="card">
    <h1>Atualizando e-fisco</h1>
    <p>Baixando e instalando a nova versão.</p>
    <p><strong>Não desligue o computador.</strong></p>
  </div>
</body>
</html>`;

  return `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`;
}

function mandatoryUpdatePage(versao) {
  const html = `
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Atualização do e-fisco</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Arial, sans-serif;
    background: #f4f6f8;
    color: #18202a;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .card {
    width: 460px;
    background: #fff;
    border-radius: 16px;
    padding: 38px;
    text-align: center;
    box-shadow: 0 12px 40px rgba(0,0,0,.12);
  }
  h1 {
    margin: 0 0 16px;
    font-size: 26px;
  }
  p {
    margin: 8px 0;
    font-size: 16px;
    line-height: 1.5;
  }
  .versao {
    margin: 22px 0;
    font-weight: 700;
    font-size: 18px;
  }
  a {
    display: block;
    width: 100%;
    padding: 16px;
    border-radius: 10px;
    background: #1677ff;
    color: #fff;
    text-decoration: none;
    font-weight: 700;
    font-size: 17px;
  }
</style>
</head>
<body>
  <div class="card">
    <h1>Atualização disponível</h1>
    <p>Uma nova versão do e-fisco precisa ser instalada para continuar.</p>
    <div class="versao">Nova versão: ${versao}</div>
    <a href="efisco-update://start">ATUALIZAR</a>
  </div>
</body>
</html>`;

  return `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`;
}

function createUpdateController({
  app,
  autoUpdater,
  log = () => {},
  getMainWindow = () => null,
  updateHelperSourcePath,
  fsImpl = fs,
  pathImpl = path,
  spawnImpl = spawn,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  now = () => Date.now()
} = {}) {
  if (!app || typeof app.getVersion !== 'function') {
    throw new Error('Update controller requires app.');
  }

  if (
    !autoUpdater ||
    typeof autoUpdater.checkForUpdates !== 'function' ||
    typeof autoUpdater.downloadUpdate !== 'function' ||
    typeof autoUpdater.quitAndInstall !== 'function'
  ) {
    throw new Error('Update controller requires autoUpdater.');
  }

  const helperSourcePath =
    String(updateHelperSourcePath || '').trim();

  let pendingVersion = null;
  let updateInProgress = false;

  function updateStatePaths() {
    const dir = pathImpl.join(
      app.getPath('userData'),
      'update-state'
    );

    return {
      dir,
      lockPath: pathImpl.join(
        dir,
        'update.lock'
      ),
      readyPath: pathImpl.join(
        dir,
        'ready.flag'
      )
    };
  }

  function clearExternalUpdateState() {
    const {
      lockPath,
      readyPath
    } = updateStatePaths();

    for (const arquivo of [
      lockPath,
      readyPath
    ]) {
      try {
        if (fsImpl.existsSync(arquivo)) {
          fsImpl.unlinkSync(arquivo);
        }
      } catch (_) {}
    }
  }

  function readExternalUpdateState() {
    const {
      lockPath
    } = updateStatePaths();

    if (!fsImpl.existsSync(lockPath)) {
      return null;
    }

    try {
      const conteudoLock =
        fsImpl.readFileSync(
          lockPath,
          'utf8'
        ).replace(/^\uFEFF/, '');

      const estado =
        JSON.parse(
          conteudoLock
        );

      const iniciado =
        Date.parse(
          String(
            estado.startedAtUtc || ''
          )
        );

      if (
        Number.isFinite(iniciado) &&
        now() - iniciado >
          30 * 60 * 1000
      ) {
        log(
          'LOCK DE UPDATE EXPIRADO'
        );

        clearExternalUpdateState();

        return null;
      }

      return estado;
    } catch (erro) {
      log(
        'LOCK DE UPDATE INVALIDO',
        erro
      );

      clearExternalUpdateState();

      return null;
    }
  }

  function shouldBlockStartupForUpdate() {
    const estado =
      readExternalUpdateState();

    if (!estado) {
      return false;
    }

    const targetVersion =
      String(
        estado.targetVersion || ''
      ).trim();

    if (!targetVersion) {
      clearExternalUpdateState();
      return false;
    }

    if (
      targetVersion ===
      app.getVersion()
    ) {
      return false;
    }

    log(
      'INICIO BLOQUEADO DURANTE UPDATE',
      {
        versaoAtual:
          app.getVersion(),

        versaoEsperada:
          targetVersion
      }
    );

    return true;
  }

  function signalNewVersionReadyIfNeeded() {
    const estado =
      readExternalUpdateState();

    if (!estado) {
      return;
    }

    const targetVersion =
      String(
        estado.targetVersion || ''
      ).trim();

    if (
      !targetVersion ||
      targetVersion !==
        app.getVersion()
    ) {
      return;
    }

    const {
      dir,
      readyPath
    } = updateStatePaths();

    try {
      fsImpl.mkdirSync(
        dir,
        {
          recursive: true
        }
      );

      fsImpl.writeFileSync(
        readyPath,
        JSON.stringify(
          {
            version:
              app.getVersion(),

            readyAtUtc:
              new Date()
                .toISOString()
          }
        ),
        'utf8'
      );

      log(
        'NOVA VERSAO SINALIZOU READY',
        {
          version:
            app.getVersion()
        }
      );
    } catch (erro) {
      log(
        'ERRO AO SINALIZAR READY',
        erro
      );
    }
  }

  function waitForFile(
    arquivo,
    timeoutMs = 10000
  ) {
    return new Promise(
      (resolve, reject) => {
        const inicio =
          now();

        const timer =
          setIntervalFn(
            () => {
              if (
                fsImpl.existsSync(
                  arquivo
                )
              ) {
                clearIntervalFn(
                  timer
                );

                resolve();

                return;
              }

              if (
                now() - inicio >=
                  timeoutMs
              ) {
                clearIntervalFn(
                  timer
                );

                reject(
                  new Error(
                    'O helper externo de atualização não iniciou dentro do tempo esperado.'
                  )
                );
              }
            },
            100
          );
      }
    );
  }

  async function startExternalUpdateHelper() {
    const targetVersion =
      String(
        pendingVersion || ''
      ).trim();

    if (!targetVersion) {
      throw new Error(
        'Versão de atualização pendente não disponível.'
      );
    }

    const origem =
      helperSourcePath;

    if (!origem || !fsImpl.existsSync(origem)) {
      throw new Error(
        `Helper externo não encontrado: ${origem}`
      );
    }

    const {
      dir,
      lockPath,
      readyPath
    } = updateStatePaths();

    fsImpl.mkdirSync(
      dir,
      {
        recursive: true
      }
    );

    clearExternalUpdateState();

    const pastaTemp =
      pathImpl.join(
        app.getPath('temp'),
        'e-fisco-update-helper'
      );

    fsImpl.mkdirSync(
      pastaTemp,
      {
        recursive: true
      }
    );

    const helperTemp =
      pathImpl.join(
        pastaTemp,
        'EFISCO-UPDATER.exe'
      );

    fsImpl.copyFileSync(
      origem,
      helperTemp
    );

    const child =
      spawnImpl(
        helperTemp,
        [
          '--lock',
          lockPath,
          '--ready',
          readyPath,
          '--version',
          targetVersion,
          '--timeout',
          '600'
        ],
        {
          windowsHide: false,
          detached: true,
          stdio: 'ignore'
        }
      );

    child.unref();

    await waitForFile(
      lockPath,
      10000
    );

    log(
      'HELPER EXTERNO DE UPDATE INICIADO',
      {
        pid:
          child.pid,

        targetVersion
      }
    );
  }

  async function startMandatoryUpdate() {
    if (updateInProgress) {
      return;
    }

    updateInProgress = true;

    try {
      const mainWindow = getMainWindow();

      if (
        mainWindow &&
        typeof mainWindow.isDestroyed === 'function' &&
        !mainWindow.isDestroyed()
      ) {
        await mainWindow.loadURL(
          updatingPage()
        );
      }

      await autoUpdater.downloadUpdate();

      await startExternalUpdateHelper();

      autoUpdater.quitAndInstall(true, true);
    } catch (erro) {
      updateInProgress = false;
      log('ERRO AUTOUPDATE', erro);
      throw erro;
    }
  }

  async function checkMandatoryUpdate() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    const resultado =
      await autoUpdater.checkForUpdates();

    if (
      resultado &&
      resultado.updateInfo &&
      resultado.updateInfo.version &&
      compareVersions(
        resultado.updateInfo.version,
        app.getVersion()
      ) > 0
    ) {
      return resultado.updateInfo.version;
    }

    return null;
  }

  function getPendingVersion() {
    return pendingVersion;
  }

  function setPendingVersion(version) {
    pendingVersion =
      version == null
        ? null
        : version;

    return pendingVersion;
  }

  return Object.freeze({
    paginaAtualizando: updatingPage,
    paginaAtualizacaoObrigatoria: mandatoryUpdatePage,
    iniciarAtualizacaoObrigatoria: startMandatoryUpdate,
    verificarAtualizacaoObrigatoria: checkMandatoryUpdate,
    deveBloquearInicioPorAtualizacao: shouldBlockStartupForUpdate,
    sinalizarNovaVersaoProntaSeNecessario:
      signalNewVersionReadyIfNeeded,
    getVersaoAtualizacaoPendente: getPendingVersion,
    setVersaoAtualizacaoPendente: setPendingVersion
  });
}

module.exports = {
  compareVersions,
  updatingPage,
  mandatoryUpdatePage,
  createUpdateController
};
