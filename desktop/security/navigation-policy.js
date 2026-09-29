'use strict';

function parseUrlSegura(rawUrl) {
  const value = String(rawUrl == null ? '' : rawUrl).trim();

  if (!value) {
    return null;
  }

  try {
    return new URL(value);
  } catch (_) {
    return null;
  }
}

function createNavigationPolicyContext({
  onlineUrl,
  additionalOnlineOrigins = [],
  internalUpdateNavigationUrl = 'efisco-update://start',
  getOfflineOrigin
} = {}) {
  const parsedOnline = parseUrlSegura(onlineUrl);
  const onlineOrigin = parsedOnline ? parsedOnline.origin : '';

  const onlineOrigins =
    [
      onlineOrigin,
      ...(
        Array.isArray(additionalOnlineOrigins)
          ? additionalOnlineOrigins
          : []
      )
        .map((value) => parseUrlSegura(value))
        .filter((parsed) =>
          parsed &&
          parsed.protocol === 'https:' &&
          !parsed.username &&
          !parsed.password
        )
        .map((parsed) => parsed.origin)
    ]
      .filter(Boolean)
      .filter((value, index, values) =>
        values.indexOf(value) === index
      );
  const internalCommand =
    String(
      internalUpdateNavigationUrl == null
        ? ''
        : internalUpdateNavigationUrl
    ).trim();

  return Object.freeze({
    onlineOrigin,
    onlineOrigins: Object.freeze([
      ...onlineOrigins
    ]),
    internalUpdateNavigationUrl: internalCommand,
    getOfflineOrigin:
      typeof getOfflineOrigin === 'function'
        ? getOfflineOrigin
        : () => '',
    mainWindowPolicy: Object.freeze({
      onlineOrigin,
      onlineOrigins: Object.freeze([
        ...onlineOrigins
      ]),
      internalUpdateCommand: internalCommand,
      allowOnlineSameOrigin: true,
      allowOfflineOrigin: false,
      allowRendererDataNavigation: false,
      allowFileNavigation: false,
      allowUnknownSchemes: false
    }),
    rendererWindowOpenPolicy: Object.freeze({
      defaultAction: 'deny',
      allowMainWindowPopups: false,
      allowOfflineViewPopups: false,
      allowExternalOpen: false,
      allowInternalCommandPopup: false
    }),
    offlineViewNavigationPolicy: Object.freeze({
      allowExactRuntimeOrigin: true,
      allowOnlineOrigin: false,
      allowInternalCommand: false,
      allowDataNavigation: false,
      allowFileNavigation: false,
      allowUnknownSchemes: false
    })
  });
}

function isOnlineOriginAllowed(rawUrl, context) {
  const parsed = parseUrlSegura(rawUrl);

  const allowedOrigins =
    context &&
    Array.isArray(context.onlineOrigins) &&
    context.onlineOrigins.length > 0
      ? context.onlineOrigins
      : [
          context &&
          context.onlineOrigin
            ? context.onlineOrigin
            : ''
        ];

  return Boolean(
    parsed &&
    parsed.protocol === 'https:' &&
    !parsed.username &&
    !parsed.password &&
    allowedOrigins.includes(parsed.origin)
  );
}

function resolveOfflineOrigin(context) {
  const rawOrigin =
    context &&
    typeof context.getOfflineOrigin === 'function'
      ? context.getOfflineOrigin()
      : '';

  return parseUrlSegura(rawOrigin);
}

function isOfflineOriginAllowed(rawUrl, context) {
  const parsed = parseUrlSegura(rawUrl);
  const offlineOrigin = resolveOfflineOrigin(context);

  return Boolean(
    parsed &&
    offlineOrigin &&
    parsed.protocol === 'http:' &&
    parsed.hostname === '127.0.0.1' &&
    !parsed.username &&
    !parsed.password &&
    parsed.origin === offlineOrigin.origin
  );
}

function isInternalNavigationAllowed(rawUrl, context) {
  return (
    String(rawUrl == null ? '' : rawUrl).trim() ===
    context.internalUpdateNavigationUrl
  );
}

function classifyOfflineViewNavigation(rawUrl, context) {
  const value =
    String(rawUrl == null ? '' : rawUrl).trim();

  if (isOfflineOriginAllowed(value, context)) {
    return {
      decision: 'ALLOW',
      reason: 'OFFLINE_TRUSTED_RUNTIME_ORIGIN',
      url: value
    };
  }

  if (isInternalNavigationAllowed(value, context)) {
    return {
      decision: 'BLOCK',
      reason: 'INTERNAL_COMMAND_MAIN_WINDOW_ONLY',
      url: value
    };
  }

  if (isOnlineOriginAllowed(value, context)) {
    return {
      decision: 'BLOCK',
      reason: 'ONLINE_MAIN_WINDOW_ONLY',
      url: value
    };
  }

  const parsed = parseUrlSegura(value);

  if (!parsed) {
    return {
      decision: 'BLOCK',
      reason: 'INVALID_URL',
      url: value
    };
  }

  if (parsed.protocol === 'data:') {
    return {
      decision: 'BLOCK',
      reason: 'DATA_NAVIGATION_DENIED',
      url: parsed.href
    };
  }

  if (parsed.protocol === 'file:') {
    return {
      decision: 'BLOCK',
      reason: 'FILE_NAVIGATION_DENIED',
      url: parsed.href
    };
  }

  return {
    decision: 'BLOCK',
    reason: 'UNTRUSTED_OFFLINE_NAVIGATION_TARGET',
    url: parsed.href
  };
}

function classifyRendererWindowOpen({
  source,
  url
} = {}, context) {
  const normalizedSource =
    source === 'offlineView'
      ? 'offlineView'
      : (
          source === 'mainWindow'
            ? 'mainWindow'
            : 'unknown'
        );

  const value =
    String(url == null ? '' : url).trim();

  if (!value) {
    return {
      action: 'deny',
      reason: 'EMPTY_WINDOW_TARGET',
      source: normalizedSource,
      url: ''
    };
  }

  if (isInternalNavigationAllowed(value, context)) {
    return {
      action: 'deny',
      reason: 'INTERNAL_COMMAND_POPUP_DENIED',
      source: normalizedSource,
      url: value
    };
  }

  if (isOnlineOriginAllowed(value, context)) {
    return {
      action: 'deny',
      reason: 'ONLINE_POPUP_DENIED',
      source: normalizedSource,
      url: value
    };
  }

  if (isOfflineOriginAllowed(value, context)) {
    return {
      action: 'deny',
      reason: 'OFFLINE_POPUP_DENIED',
      source: normalizedSource,
      url: value
    };
  }

  const parsed = parseUrlSegura(value);

  if (!parsed) {
    return {
      action: 'deny',
      reason: 'INVALID_WINDOW_TARGET',
      source: normalizedSource,
      url: value
    };
  }

  return {
    action: 'deny',
    reason: 'UNTRUSTED_WINDOW_TARGET',
    source: normalizedSource,
    url: parsed.href
  };
}

function classifyMainWindowNavigation(rawUrl, context) {
  const value = String(rawUrl == null ? '' : rawUrl).trim();

  if (isInternalNavigationAllowed(value, context)) {
    return {
      decision: 'INTERCEPT',
      reason: 'INTERNAL_UPDATE_COMMAND',
      url: value
    };
  }

  if (isOnlineOriginAllowed(value, context)) {
    return {
      decision: 'ALLOW',
      reason: 'ONLINE_TRUSTED_ORIGIN',
      url: value
    };
  }

  const parsed = parseUrlSegura(value);

  if (!parsed) {
    return {
      decision: 'BLOCK',
      reason: 'INVALID_URL',
      url: value
    };
  }

  if (isOfflineOriginAllowed(value, context)) {
    return {
      decision: 'BLOCK',
      reason: 'OFFLINE_VIEW_ONLY',
      url: parsed.href
    };
  }

  if (parsed.protocol === 'data:') {
    return {
      decision: 'BLOCK',
      reason: 'MAIN_PROCESS_DATA_ONLY',
      url: parsed.href
    };
  }

  if (parsed.protocol === 'file:') {
    return {
      decision: 'BLOCK',
      reason: 'FILE_NAVIGATION_DENIED',
      url: parsed.href
    };
  }

  return {
    decision: 'BLOCK',
    reason: 'UNTRUSTED_NAVIGATION_TARGET',
    url: parsed.href
  };
}

function resolveNavigationEventUrl(event, legacyUrl) {
  const eventUrl =
    event &&
    typeof event.url === 'string'
      ? event.url
      : '';

  return String(eventUrl || legacyUrl || '').trim();
}

function resolveNavigationEventIsMainFrame(
  event,
  legacyIsMainFrame
) {
  if (
    event &&
    typeof event.isMainFrame === 'boolean'
  ) {
    return event.isMainFrame;
  }

  if (typeof legacyIsMainFrame === 'boolean') {
    return legacyIsMainFrame;
  }

  return true;
}

function sanitizeNavigationUrlForLog(rawUrl, context) {
  const parsed = parseUrlSegura(rawUrl);

  if (!parsed) {
    return '<invalid-url>';
  }

  const protocol =
    String(parsed.protocol || '').toLowerCase();

  if (protocol === 'data:') {
    return 'data:<redacted>';
  }

  if (protocol === 'javascript:') {
    return 'javascript:<redacted>';
  }

  if (protocol === 'file:') {
    return 'file:<redacted>';
  }

  if (
    protocol === 'http:' ||
    protocol === 'https:'
  ) {
    const pathMarker =
      parsed.pathname &&
      parsed.pathname !== '/'
        ? '/<path-redacted>'
        : '/';

    return (
      protocol +
      '//' +
      parsed.host +
      pathMarker
    );
  }

  if (protocol === 'efisco-update:') {
    return context.internalUpdateNavigationUrl;
  }

  return (
    protocol ||
    '<unknown-scheme>'
  );
}

module.exports = {
  parseUrlSegura,
  createNavigationPolicyContext,
  isOnlineOriginAllowed,
  isOfflineOriginAllowed,
  isInternalNavigationAllowed,
  classifyOfflineViewNavigation,
  classifyRendererWindowOpen,
  classifyMainWindowNavigation,
  resolveNavigationEventUrl,
  resolveNavigationEventIsMainFrame,
  sanitizeNavigationUrlForLog
};
