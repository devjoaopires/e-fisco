'use strict';

const {
  BrowserWindow
} = require('electron');

function mainWindowOptions({
  iconPath,
  preloadPath
} = {}) {
  return {
    width: 1280,
    height: 800,
    show: false,

    icon:
      iconPath,

    frame: true,
    skipTaskbar: false,
    closable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: false,
    autoHideMenuBar: true,

    webPreferences: {
      preload:
        preloadPath,

      contextIsolation:
        true,

      nodeIntegration:
        false,

      sandbox:
        true,

      devTools:
        false
    }
  };
}

function createMainWindow({
  iconPath,
  preloadPath,
  BrowserWindowImpl = BrowserWindow
} = {}) {
  return new BrowserWindowImpl(
    mainWindowOptions({
      iconPath,
      preloadPath
    })
  );
}

function bindMainWindowLifecycle({
  mainWindow,
  onResize,
  onMaximize,
  onUnmaximize,
  onFocus,
  onBlur,
  onClosed
} = {}) {
  mainWindow.on('resize', onResize);
  mainWindow.on('maximize', onMaximize);
  mainWindow.on('unmaximize', onUnmaximize);
  mainWindow.on('focus', onFocus);
  mainWindow.on('blur', onBlur);
  mainWindow.on('closed', onClosed);
}

function bindMainWindowReadyToShow(
  mainWindow
) {
  mainWindow.once(
    'ready-to-show',
    () => {
      mainWindow.show();
      mainWindow.maximize();
    }
  );
}

module.exports = {
  mainWindowOptions,
  createMainWindow,
  bindMainWindowLifecycle,
  bindMainWindowReadyToShow
};
