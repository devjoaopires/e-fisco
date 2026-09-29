'use strict';

const IPC_SENDER_SCOPE = Object.freeze({
  MAIN_WINDOW_TOP: 'MAIN_WINDOW_TOP',
  OFFLINE_VIEW_TOP: 'OFFLINE_VIEW_TOP'
});

const IPC_CHANNEL_AUTHORIZATION_POLICY = Object.freeze({
  'efisco:offline-operator-bridge-probe': Object.freeze({
    transport: 'send',
    senderScope: IPC_SENDER_SCOPE.MAIN_WINDOW_TOP,
    originScope: 'ONLINE_EXACT',
    capability: 'OFFLINE_CREDENTIAL_BRIDGE'
  }),
  'efisco:offline-operator-verifier-candidate': Object.freeze({
    transport: 'send',
    senderScope: IPC_SENDER_SCOPE.MAIN_WINDOW_TOP,
    originScope: 'ONLINE_EXACT',
    capability: 'OFFLINE_CREDENTIAL_BRIDGE'
  }),
  'efisco:offline-credential-provision': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.MAIN_WINDOW_TOP,
    originScope: 'ONLINE_EXACT',
    capability: 'OFFLINE_CREDENTIAL_PROVISION'
  }),
  'efisco:print-nfce-windows-driver': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.MAIN_WINDOW_TOP,
    originScope: 'ONLINE_EXACT',
    capability: 'PRINT'
  }),

  'efisco:offline-self-test': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_DIAGNOSTIC'
  }),
  'efisco:offline-diagnostic-report': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_DIAGNOSTIC'
  }),
  'efisco:offline-auto-repair': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_REPAIR'
  }),
  'efisco:offline-operator-login': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_LOGIN'
  }),
  'efisco:offline-product-find': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_READ'
  }),
  'efisco:offline-company-header': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_READ'
  }),
  'efisco:offline-products-list': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_READ'
  }),
  'efisco:offline-customers-list': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_READ'
  }),
  'efisco:offline-crediarios-list': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_READ'
  }),
  'efisco:offline-crediario-detail': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_READ'
  }),
  'efisco:offline-crediario-open': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_MUTATION'
  }),
  'efisco:offline-crediario-items-update': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_MUTATION'
  }),
  'efisco:offline-cash-consult': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_READ'
  }),
  'efisco:offline-finance-snapshot': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_READ'
  }),
  'efisco:offline-cash-open': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_MUTATION'
  }),
  'efisco:offline-cash-movement': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_MUTATION'
  }),
  'efisco:offline-cash-close': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_MUTATION'
  }),
  'efisco:nfce-number-peek': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'FISCAL_SENSITIVE'
  }),
  'efisco:offline-sale-paid': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'OFFLINE_MUTATION'
  }),
  'efisco:offline-nfce-contingency-danfe-preview': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'FISCAL_SENSITIVE'
  }),
  'efisco:superadmin-a1-mirror': Object.freeze({
    transport: 'invoke',
    senderScope: IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP,
    originScope: 'OFFLINE_RUNTIME_EXACT',
    capability: 'DEVICE_IDENTITY_SENSITIVE'
  })
});

function resolveAuthorizedIpcSender(event, context = {}) {
  const sender =
    event &&
    event.sender
      ? event.sender
      : null;

  const senderFrame =
    event &&
    event.senderFrame
      ? event.senderFrame
      : null;

  if (!sender || !senderFrame) {
    return null;
  }

  if (
    typeof senderFrame.isDestroyed === 'function' &&
    senderFrame.isDestroyed()
  ) {
    return null;
  }

  if (senderFrame.detached === true) {
    return null;
  }

  if (
    senderFrame.top !== senderFrame ||
    senderFrame.parent !== null
  ) {
    return null;
  }

  const eventProcessId =
    Number.isInteger(
      event && event.processId
    )
      ? event.processId
      : null;

  const eventFrameId =
    Number.isInteger(
      event && event.frameId
    )
      ? event.frameId
      : null;

  const frameProcessId =
    Number.isInteger(senderFrame.processId)
      ? senderFrame.processId
      : null;

  const frameRoutingId =
    Number.isInteger(senderFrame.routingId)
      ? senderFrame.routingId
      : null;

  if (
    eventProcessId == null ||
    eventFrameId == null ||
    frameProcessId == null ||
    frameRoutingId == null ||
    eventProcessId !== frameProcessId ||
    eventFrameId !== frameRoutingId
  ) {
    return null;
  }

  const frameUrl =
    typeof senderFrame.url === 'string'
      ? senderFrame.url.trim()
      : '';

  const frameOrigin =
    typeof senderFrame.origin === 'string'
      ? senderFrame.origin.trim()
      : '';

  const matchesExpectedTopFrame = (
    webContents,
    urlAllowed,
    expectedOrigin,
    surface
  ) => {
    if (
      !webContents ||
      typeof webContents.isDestroyed !== 'function' ||
      webContents.isDestroyed() ||
      !webContents.mainFrame
    ) {
      return null;
    }

    if (
      sender !== webContents ||
      sender.id !== webContents.id ||
      senderFrame !== webContents.mainFrame
    ) {
      return null;
    }

    const expectedOrigins =
      Array.isArray(expectedOrigin)
        ? expectedOrigin
        : [expectedOrigin];

    if (
      !frameUrl ||
      !frameOrigin ||
      !expectedOrigins.includes(frameOrigin) ||
      !urlAllowed(frameUrl)
    ) {
      return null;
    }

    return {
      surface,
      senderId: sender.id,
      frameUrl,
      frameOrigin
    };
  };

  const mainWindow =
    context.mainWindow || null;

  if (
    mainWindow &&
    typeof mainWindow.isDestroyed === 'function' &&
    !mainWindow.isDestroyed() &&
    mainWindow.webContents &&
    typeof context.isOnlineOriginAllowed === 'function'
  ) {
    const online =
      matchesExpectedTopFrame(
        mainWindow.webContents,
        context.isOnlineOriginAllowed,
        Array.isArray(context.onlineOrigins) &&
        context.onlineOrigins.length > 0
          ? context.onlineOrigins
          : String(context.onlineOrigin || ''),
        IPC_SENDER_SCOPE.MAIN_WINDOW_TOP
      );

    if (online) {
      return online;
    }
  }

  const offlineView =
    context.offlineView || null;

  if (
    offlineView &&
    offlineView.webContents &&
    typeof context.parseUrlSegura === 'function' &&
    typeof context.isOfflineOriginAllowed === 'function'
  ) {
    const rawOfflineOrigin =
      String(context.offlineOrigin || '').trim();

    const offlineOrigin =
      rawOfflineOrigin
        ? context.parseUrlSegura(rawOfflineOrigin)
        : null;

    if (offlineOrigin) {
      const offline =
        matchesExpectedTopFrame(
          offlineView.webContents,
          context.isOfflineOriginAllowed,
          offlineOrigin.origin,
          IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP
        );

      if (offline) {
        return offline;
      }
    }
  }

  return null;
}

function isMainWindowSender(event, context) {
  const sender =
    resolveAuthorizedIpcSender(
      event,
      context
    );

  return Boolean(
    sender &&
    sender.surface ===
      IPC_SENDER_SCOPE.MAIN_WINDOW_TOP
  );
}

function isAuthorizedAppSender(event, context) {
  return Boolean(
    resolveAuthorizedIpcSender(
      event,
      context
    )
  );
}

function isOfflineViewSender(event, context) {
  const sender =
    resolveAuthorizedIpcSender(
      event,
      context
    );

  return Boolean(
    sender &&
    sender.surface ===
      IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP
  );
}

function isIpcChannelAuthorized(
  event,
  channel,
  transport,
  context
) {
  const channelName =
    String(channel || '').trim();

  const expectedTransport =
    String(transport || '').trim();

  const policy =
    IPC_CHANNEL_AUTHORIZATION_POLICY[
      channelName
    ];

  if (
    !policy ||
    !expectedTransport ||
    policy.transport !== expectedTransport
  ) {
    return false;
  }

  const sender =
    resolveAuthorizedIpcSender(
      event,
      context
    );

  if (
    !sender ||
    sender.surface !== policy.senderScope
  ) {
    return false;
  }

  if (policy.originScope === 'ONLINE_EXACT') {
    const onlineOrigins =
      context &&
      Array.isArray(context.onlineOrigins) &&
      context.onlineOrigins.length > 0
        ? context.onlineOrigins
        : [
            String(
              context &&
              context.onlineOrigin ||
              ''
            )
          ];

    return Boolean(
      sender.surface ===
        IPC_SENDER_SCOPE.MAIN_WINDOW_TOP &&
      onlineOrigins.includes(sender.frameOrigin) &&
      context &&
      typeof context.isOnlineOriginAllowed === 'function' &&
      context.isOnlineOriginAllowed(sender.frameUrl)
    );
  }

  if (
    policy.originScope ===
      'OFFLINE_RUNTIME_EXACT'
  ) {
    const rawOfflineOrigin =
      String(
        context &&
        context.offlineOrigin ||
        ''
      ).trim();

    const offlineOrigin =
      rawOfflineOrigin &&
      context &&
      typeof context.parseUrlSegura === 'function'
        ? context.parseUrlSegura(
            rawOfflineOrigin
          )
        : null;

    return Boolean(
      offlineOrigin &&
      sender.surface ===
        IPC_SENDER_SCOPE.OFFLINE_VIEW_TOP &&
      sender.frameOrigin ===
        offlineOrigin.origin &&
      context &&
      typeof context.isOfflineOriginAllowed === 'function' &&
      context.isOfflineOriginAllowed(
        sender.frameUrl
      )
    );
  }

  return false;
}

module.exports = {
  IPC_SENDER_SCOPE,
  IPC_CHANNEL_AUTHORIZATION_POLICY,
  resolveAuthorizedIpcSender,
  isMainWindowSender,
  isAuthorizedAppSender,
  isOfflineViewSender,
  isIpcChannelAuthorized
};
