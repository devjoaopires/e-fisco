'use strict';

const {
  WebContentsView
} = require('electron');

function offlineDiagnosticViewOptions() {
  return {
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false
    }
  };
}

function createOfflineDiagnosticView({
  userAgent,
  WebContentsViewImpl = WebContentsView
} = {}) {
  const view =
    new WebContentsViewImpl(
      offlineDiagnosticViewOptions()
    );

  view.setBackgroundColor(
    '#111827'
  );

  if (
    userAgent &&
    view.webContents &&
    typeof view.webContents
      .setUserAgent === 'function'
  ) {
    view.webContents.setUserAgent(
      userAgent
    );
  }

  return view;
}

function escapeHtml(value) {
  return String(
    value == null
      ? ''
      : value
  )
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildOfflineDiagnosticHtml(
  diagnostic = {}
) {
  const code =
    escapeHtml(
      diagnostic.code ||
      'OFFLINE-UI-099'
    );

  const title =
    escapeHtml(
      diagnostic.title ||
      'Modo offline indisponível'
    );

  const message =
    escapeHtml(
      diagnostic.message ||
      'A interface offline não pôde ser carregada com segurança.'
    );

  const type =
    escapeHtml(
      diagnostic.type ||
      'UNKNOWN'
    );

  const version =
    escapeHtml(
      diagnostic.version ||
      ''
    );

  const detectedAt =
    escapeHtml(
      diagnostic.detectedAt ||
      ''
    );

  const detail =
    escapeHtml(
      diagnostic.detail ||
      ''
    );

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"
  >
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      background: #111827;
      color: #f9fafb;
    }
    body {
      display: grid;
      place-items: center;
      padding: 24px;
    }
    main {
      width: min(720px, 100%);
      background: #1f2937;
      border: 1px solid #374151;
      border-radius: 18px;
      padding: 32px;
      box-shadow: 0 18px 48px rgba(0,0,0,.35);
    }
    .eyebrow {
      margin: 0 0 10px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: #fbbf24;
    }
    h1 {
      margin: 0 0 14px;
      font-size: 28px;
      line-height: 1.15;
    }
    p {
      margin: 0;
      color: #d1d5db;
      font-size: 16px;
      line-height: 1.55;
    }
    .code {
      margin: 24px 0 0;
      padding: 14px 16px;
      border-radius: 12px;
      background: #0f172a;
      border: 1px solid #334155;
      font-family: Consolas, "Courier New", monospace;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: .03em;
    }
    dl {
      margin: 22px 0 0;
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 8px 14px;
      font-size: 13px;
      color: #9ca3af;
    }
    dt { font-weight: 700; }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .detail {
      margin-top: 18px;
      padding: 14px 16px;
      border-radius: 12px;
      background: #0b1220;
      border: 1px solid #334155;
      color: #cbd5e1;
      font-family: Consolas, "Courier New", monospace;
      font-size: 13px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    .hint {
      margin-top: 24px;
      padding-top: 18px;
      border-top: 1px solid #374151;
      font-size: 14px;
      color: #cbd5e1;
    }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">Diagnóstico local</p>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="code">${code}</div>
    ${detail
      ? `<div class="detail"><strong>Detalhe técnico:</strong> ${detail}</div>`
      : ''}
    <dl>
      <dt>Falha</dt>
      <dd>${type}</dd>
      <dt>Versão</dt>
      <dd>${version || 'não informada'}</dd>
      <dt>Detectado em</dt>
      <dd>${detectedAt || 'não informado'}</dd>
    </dl>
    <p class="hint">
      O e-fisco registrou os detalhes técnicos localmente. Informe o código acima ao suporte.
    </p>
  </main>
</body>
</html>`;
}

async function loadOfflineDiagnosticView({
  diagnosticView,
  diagnostic,
  userAgent
} = {}) {
  if (
    !diagnosticView ||
    !diagnosticView.webContents ||
    diagnosticView.webContents.isDestroyed()
  ) {
    throw new Error(
      'View de diagnóstico indisponível.'
    );
  }

  const html =
    buildOfflineDiagnosticHtml(
      diagnostic
    );

  const dataUrl =
    'data:text/html;charset=utf-8,' +
    encodeURIComponent(
      html
    );

  await diagnosticView
    .webContents
    .loadURL(
      dataUrl,
      {
        userAgent
      }
    );

  return diagnosticView;
}

function attachOfflineDiagnosticView({
  mainWindow,
  diagnosticView
} = {}) {
  mainWindow.contentView.addChildView(
    diagnosticView
  );

  return diagnosticView;
}

function closeOfflineDiagnosticView(
  diagnosticView
) {
  if (
    diagnosticView &&
    diagnosticView.webContents &&
    !diagnosticView.webContents.isDestroyed()
  ) {
    try {
      diagnosticView.webContents.close();
    } catch (_) {}
  }
}

module.exports = {
  offlineDiagnosticViewOptions,
  createOfflineDiagnosticView,
  buildOfflineDiagnosticHtml,
  loadOfflineDiagnosticView,
  attachOfflineDiagnosticView,
  closeOfflineDiagnosticView
};
