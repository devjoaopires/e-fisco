const {
  contextBridge,
  ipcRenderer
} = require('electron');

const VERSION = '1.0.41';

async function invokeChecked(channel, payload, fallbackMessage) {
  const response = await ipcRenderer.invoke(channel, payload);
  if (!response || response.ok !== true) {
    throw new Error(
      response && response.error
        ? String(response.error)
        : fallbackMessage
    );
  }
  return response.result;
}

contextBridge.exposeInMainWorld(
  'efiscoOfflineVerifierBridge',
  Object.freeze({
    probe: (stage = '') => {
      ipcRenderer.send(
        'efisco:offline-operator-bridge-probe',
        {
          stage:
            String(stage || '')
              .trim()
              .slice(0, 64)
        }
      );

      return true;
    },

    submit: (payload = {}) => {
      if (!payload || typeof payload !== 'object') {
        return false;
      }

      ipcRenderer.send(
        'efisco:offline-operator-verifier-candidate',
        {
          kdf:
            String(payload.kdf || ''),
          salt:
            String(payload.salt || ''),
          verifier:
            String(payload.verifier || ''),
          params:
            payload.params &&
            typeof payload.params === 'object'
              ? payload.params
              : {},
          capturedAt:
            Number(payload.capturedAt) || Date.now()
        }
      );

      return true;
    },

    provision:
      async (payload = {}) =>
        await invokeChecked(
          'efisco:offline-credential-provision',
          payload,
          'Provisionamento da credencial offline falhou.'
        )
  })
);

window.addEventListener('message', (event) => {
  const data = event && event.data;

  if (
    !data ||
    data.type !==
      'SCF_SUPERADMIN_CERTIFICADO_A1_ENVIAR'
  ) {
    return;
  }

  const currentOrigin =
    String(
      window.location &&
      window.location.origin ||
      ''
    ).trim();

  const pdvFrame =
    document &&
    typeof document.getElementById ===
      'function'
      ? document.getElementById(
          'scfOfflinePdv'
        )
      : null;

  if (
    !event.source ||
    event.source === window ||
    !currentOrigin ||
    currentOrigin === 'null' ||
    event.origin !== currentOrigin ||
    !pdvFrame ||
    !pdvFrame.contentWindow ||
    event.source !== pdvFrame.contentWindow
  ) {
    return;
  }

  ipcRenderer.invoke(
    'efisco:superadmin-a1-mirror',
    data
  ).catch(() => {});
});

contextBridge.exposeInMainWorld(
  'efiscoDesktop',
  Object.freeze({
    version: VERSION,

    printMode:
      'WINDOWS_DRIVER_NATIVE_TEXT_QR',

    offlineOperatorLogin:
      async (payload = {}) =>
        await invokeChecked(
          'efisco:offline-operator-login',
          payload,
          'Autenticação offline do operador falhou.'
        ),

    offlineCompanyHeader:
      async () =>
        await invokeChecked(
          'efisco:offline-company-header',
          {},
          'Consulta offline da empresa falhou.'
        ),

    offlineFindProduct:
      async (criterio) =>
        await invokeChecked(
          'efisco:offline-product-find',
          criterio,
          'Consulta offline de produto falhou.'
        ),

    offlineListProducts:
      async () =>
        await invokeChecked(
          'efisco:offline-products-list',
          {},
          'Listagem offline de produtos falhou.'
        ),

    offlineListCustomers:
      async (payload = {}) =>
        await invokeChecked(
          'efisco:offline-customers-list',
          payload,
          'Listagem offline de clientes falhou.'
        ),

    offlineListCrediarios:
      async (payload = {}) =>
        await invokeChecked(
          'efisco:offline-crediarios-list',
          payload,
          'Listagem offline de crediários falhou.'
        ),

    offlineGetCrediarioDetail:
      async (payload = {}) =>
        await invokeChecked(
          'efisco:offline-crediario-detail',
          payload,
          'Detalhe offline do crediário falhou.'
        ),

    offlineOpenCrediario:
      async (payload = {}) =>
        await invokeChecked(
          'efisco:offline-crediario-open',
          payload,
          'Abertura offline do crediário falhou.'
        ),

    offlineUpdateCrediarioItems:
      async (payload = {}) =>
        await invokeChecked(
          'efisco:offline-crediario-items-update',
          payload,
          'Atualização offline do crediário falhou.'
        ),

    offlineFinanceSnapshot:
      async (payload = {}) =>
        await invokeChecked(
          'efisco:offline-finance-snapshot',
          payload,
          'Consulta offline do Financeiro falhou.'
        ),

    offlineCashConsult:
      async (payload) =>
        await invokeChecked(
          'efisco:offline-cash-consult',
          payload,
          'Consulta offline de caixa falhou.'
        ),

    offlineCashOpen:
      async (payload) =>
        await invokeChecked(
          'efisco:offline-cash-open',
          payload,
          'Abertura offline de caixa falhou.'
        ),

    offlineCashMovement:
      async (payload) =>
        await invokeChecked(
          'efisco:offline-cash-movement',
          payload,
          'Movimento offline de caixa falhou.'
        ),

    offlineCashClose:
      async (payload) =>
        await invokeChecked(
          'efisco:offline-cash-close',
          payload,
          'Fechamento offline de caixa falhou.'
        ),

    nfceNumberPeek:
      async () =>
        await invokeChecked(
          'efisco:nfce-number-peek',
          {},
          'Consulta do contador único NFC-e falhou.'
        ),

    offlineRegisterPaidSale:
      async (sale) =>
        await invokeChecked(
          'efisco:offline-sale-paid',
          { sale },
          'Registro offline da venda falhou.'
        ),

    offlineNfceContingencyDanfePreview:
      async (saleId) =>
        await invokeChecked(
          'efisco:offline-nfce-contingency-danfe-preview',
          { saleId },
          'Carregamento do DANFE NFC-e em contingência falhou.'
        ),

    printNfce80:
      async (payload) => {
        return await ipcRenderer.invoke(
          'efisco:print-nfce-windows-driver',
          payload
        );
      }
  })
);
