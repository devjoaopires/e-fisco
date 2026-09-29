'use strict';

function hasUsableMainWindow(mainWindow) {
  return Boolean(
    mainWindow &&
    typeof mainWindow.isDestroyed === 'function' &&
    !mainWindow.isDestroyed()
  );
}

function offlineOverlayBounds(mainWindow) {
  if (!hasUsableMainWindow(mainWindow)) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  const bounds = mainWindow.getContentBounds();
  const width = Math.max(1, Number(bounds.width || 1));
  const height = Math.max(1, Number(bounds.height || 1));

  return {
    x: 0,
    y: 0,
    width,
    height
  };
}

function offlineParkedBounds(mainWindow) {
  if (!hasUsableMainWindow(mainWindow)) {
    return { x: 0, y: 2, width: 1, height: 1 };
  }

  const bounds = mainWindow.getContentBounds();

  return {
    x: 0,
    y: Math.max(2, Number(bounds.height || 1) + 16),
    width: 1,
    height: 1
  };
}

function offlineStagingBounds(mainWindow) {
  if (!hasUsableMainWindow(mainWindow)) {
    return { x: 0, y: 2, width: 1, height: 1 };
  }

  const bounds = mainWindow.getContentBounds();
  const width = Math.max(1, Number(bounds.width || 1));
  const height = Math.max(1, Number(bounds.height || 1));

  return {
    x: 0,
    y: height + 16,
    width,
    height
  };
}

function resizeOfflineOverlay({
  mainWindow,
  offlineView,
  offlineViewReady,
  offlineUiMode
} = {}) {
  if (!offlineView || !offlineViewReady) {
    return;
  }

  try {
    const visible =
      offlineUiMode === 'OFFLINE' ||
      offlineUiMode === 'SWITCHING_OFFLINE';

    offlineView.setBounds(
      visible
        ? offlineOverlayBounds(mainWindow)
        : offlineParkedBounds(mainWindow)
    );
  } catch (_) {}
}

module.exports = {
  offlineOverlayBounds,
  offlineParkedBounds,
  offlineStagingBounds,
  resizeOfflineOverlay
};
