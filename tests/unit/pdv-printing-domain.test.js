'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(
  __dirname,
  '..',
  '..'
);

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      ROOT,
      relativePath
    ),
    'utf8'
  );
}

function loadPrintingDomain() {
  const windowRef = {};
  const context =
    vm.createContext({
      window: windowRef,
      Promise
    });

  vm.runInContext(
    read(
      'offline-ui/pdv/domains/printing/domain.js'
    ),
    context,
    {
      filename:
        'offline-ui/pdv/domains/printing/domain.js'
    }
  );

  return {
    windowRef,
    domain:
      windowRef.__scfPdvDomains.printing
  };
}

test('P18 materializa printing como ultimo dominio da Etapa 9 e preserva scripts classicos', () => {
  const pdv =
    read('offline-ui/pdv.html');

  const files = [
    'domain.js',
    'history-receipt-view.js',
    'frame-controller.js'
  ];

  for (const file of files) {
    const source =
      '/pdv/domains/printing/' +
      file;

    assert.equal(
      pdv.split(source).length - 1,
      1,
      source
    );

    assert.equal(
      fs.existsSync(
        path.join(
          ROOT,
          'offline-ui/pdv/domains/printing',
          file
        )
      ),
      true,
      file
    );
  }

  assert.ok(
    pdv.indexOf(
      '/pdv/domains/printing/domain.js'
    ) <
      pdv.indexOf(
        '/pdv/domains/fiscal/receipt.js'
      )
  );

  assert.doesNotMatch(
    pdv,
    /<script[^>]+\btype\s*=\s*["']module["']/i
  );

  const domains =
    fs.readdirSync(
      path.join(
        ROOT,
        'offline-ui/pdv/domains'
      ),
      {
        withFileTypes: true
      }
    )
      .filter(
        (entry) =>
          entry.isDirectory()
      )
      .map(
        (entry) =>
          entry.name
      )
      .sort();

  assert.deepEqual(
    domains,
    [
      'cash',
      'continuity',
      'crediario',
      'customer',
      'finance',
      'fiscal',
      'history',
      'inventory',
      'printing',
      'products',
      'sale-payment',
      'superadmin',
      'suppliers'
    ]
  );
});

test('P18 printing domain e owner unico; somente pending payload permanece bridge cross-process', async () => {
  const {
    windowRef,
    domain
  } = loadPrintingDomain();

  const calls = [];

  domain.registerCurrentPrinter(
    (receipt) => {
      calls.push([
        'current',
        receipt.saleId
      ]);
      return true;
    }
  );

  domain.registerHistoryPrinter(
    () => {
      calls.push([
        'history'
      ]);
      return true;
    }
  );

  domain.registerContingencyPrinter(
    () => {
      calls.push([
        'contingency'
      ]);
      return true;
    }
  );

  domain.registerImageGenerator(
    () =>
      'data:image/jpeg;base64,AAAA'
  );

  assert.equal(
    domain.printCurrent({
      saleId: 'SALE-1'
    }),
    true
  );
  assert.equal(
    domain.printHistory(),
    true
  );
  assert.equal(
    domain.printContingency(),
    true
  );

  assert.equal(
    await domain.generateReceiptImage(),
    'data:image/jpeg;base64,AAAA'
  );

  domain.lastImage = {
    saleId: 'SALE-1'
  };
  windowRef.__scfElectronPendingPrintPayload = {
    requestId: 'REQ-1'
  };

  assert.equal(
    domain.lastImage.saleId,
    'SALE-1'
  );
  assert.equal(
    domain.pendingPayload.requestId,
    'REQ-1'
  );

  for (const name of [
    'scfImprimirNfceAtualAutomaticamente',
    'scfImprimirNfceHistoricoAoReenviar',
    'scfImprimirNfceContingenciaAutomaticamente',
    'scfGerarImagemCupomBase64ParaImpressao',
    '__scfUltimaImagemCupomParaImpressao',
    '__scfElectronPrintRequestId',
    'scfNfceLocalPrintMode',
    'scfNfceLocalPrintPrinter'
  ]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        windowRef,
        name
      ),
      false,
      name
    );
  }

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      windowRef,
      '__scfElectronPendingPrintPayload'
    ),
    true
  );

  assert.deepEqual(
    calls,
    [
      [
        'current',
        'SALE-1'
      ],
      [
        'history'
      ],
      [
        'contingency'
      ]
    ]
  );
});

test('P18 fiscal receipt registra captura e consome printing owner sem globals canonicos', () => {
  const source =
    read(
      'offline-ui/pdv/domains/fiscal/receipt.js'
    );

  for (const token of [
    'printingDomain.registerImageGenerator',
    'printingDomain.lastImage',
    'printingDomain.printCurrent',
    'printingDomain.printHistory',
    'printingDomain.printContingency'
  ]) {
    assert.equal(
      source.includes(token),
      true,
      token
    );
  }

  for (const legacy of [
    'window.__scfUltimaImagemCupomParaImpressao',
    'window.scfGerarImagemCupomBase64ParaImpressao',
    'window.scfImprimirNfceAtualAutomaticamente',
    'window.scfImprimirNfceHistoricoAoReenviar',
    'window.scfImprimirNfceContingenciaAutomaticamente'
  ]) {
    assert.equal(
      source.includes(legacy),
      false,
      legacy
    );
  }

  assert.doesNotMatch(
    source,
    /(?<![.\w])fetch\s*\(/
  );
  assert.doesNotMatch(
    source,
    /\blocalStorage\b|\bsessionStorage\b/
  );
});

test('P18 frame controller preserva V5/contingencia e remove writers/bridges supersedidos', () => {
  const source =
    read(
      'offline-ui/pdv/domains/printing/frame-controller.js'
    );

  for (const token of [
    '__EFISCO_NFCE_PRINT_FRAME_V5__',
    '__EFISCO_NFCE_CONTINGENCIA_PRINT_DIAG_V1__',
    'printingDomain.pendingPayload',
    'printingDomain.lastImage',
    'fiscalDomain.qrUrl',
    'generateReceiptImage',
    'printingDomain.registerCurrentPrinter',
    'printingDomain.registerHistoryPrinter',
    'printingDomain.registerContingencyPrinter'
  ]) {
    assert.equal(
      source.includes(token),
      true,
      token
    );
  }

  for (const obsolete of [
    '__EFISCO_NFCE_SILENT_PRINT_V2__',
    'SCF_EFISCO_IMPRIMIR_NFCE_LOCAL',
    'window.efiscoPrinter',
    'window.scfImprimirNfceAtualAutomaticamente =',
    'window.scfImprimirNfceHistoricoAoReenviar =',
    'window.scfImprimirNfceContingenciaAutomaticamente =',
    'window.__scfElectronPendingPrintPayload',
    'window.__scfUltimaImagemCupomParaImpressao'
  ]) {
    assert.equal(
      source.includes(obsolete),
      false,
      obsolete
    );
  }

  assert.match(
    source,
    /1400/
  );
  assert.match(
    source,
    /30000/
  );
  assert.match(
    source,
    /4500/
  );
});

test('P18 elimina patch layers mortos, preserva view de reprint e mantem M10 main-process intacto', () => {
  const pdv =
    read('offline-ui/pdv.html');
  const view =
    read(
      'offline-ui/pdv/domains/printing/history-receipt-view.js'
    );
  const main =
    read('main.js');
  const frameBridge =
    read(
      'printing/frame-print-bridge.js'
    );

  for (const oldId of [
    'scf-nfce-impressao-automatica-80mm-script-final',
    'scf-historico-nfce-reenviar-impressao-80mm-script-final',
    'scf-nfce-electron-silent-print-bridge-final',
    'scf-nfce-electron-direto-sem-window-print-final',
    'scf-nfce-escpos-direto-final',
    'scf-nfce-driver-windows-silencioso-final',
    'scf-nfce-driver-windows-ponte-pai-v2-final',
    'scf-nfce-driver-windows-ponte-top-v4-final'
  ]) {
    assert.equal(
      pdv.includes(oldId),
      false,
      oldId
    );
  }

  assert.match(
    pdv,
    /id="scf-nfce-console-frame-v5-final" src="\/pdv\/domains\/printing\/frame-controller\.js"/
  );
  assert.match(
    pdv,
    /id="scf-historico-nfce-cupom-exclusivo-sem-dashboard-script-final" src="\/pdv\/domains\/printing\/history-receipt-view\.js"/
  );

  assert.match(
    view,
    /scf:cupom-historico-fechado/
  );
  assert.match(
    view,
    /\[0,80,250,700\]/
  );

  assert.match(
    main,
    /__EFISCO_NFCE_PRINT_FRAME_V5__/
  );
  assert.match(
    frameBridge,
    /__scfElectronPendingPrintPayload/
  );
  assert.match(
    frameBridge,
    /janelaPayload\.__scfElectronPendingPrintPayload\s*=\s*null/
  );
});
