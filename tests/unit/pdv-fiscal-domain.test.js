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

function loadFiscalDomain(initial = {}) {
  const windowRef = {
    ...initial
  };

  const context =
    vm.createContext({
      window: windowRef
    });

  vm.runInContext(
    read(
      'offline-ui/pdv/domains/fiscal/domain.js'
    ),
    context,
    {
      filename:
        'offline-ui/pdv/domains/fiscal/domain.js'
    }
  );

  return {
    windowRef,
    domain:
      windowRef.__scfPdvDomains.fiscal
  };
}

test('P16 fiscal permanece estavel apos P18 printing', () => {
  const pdv =
    read('offline-ui/pdv.html');

  const files = [
    'domain.js',
    'receipt.js',
    'completed-footer.js',
    'processing-footer.js'
  ];

  for (const file of files) {
    const source =
      '/pdv/domains/fiscal/' +
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
          'offline-ui/pdv/domains/fiscal',
          file
        )
      ),
      true,
      file
    );
  }

  assert.ok(
    pdv.indexOf(
      '/pdv/domains/fiscal/domain.js'
    ) <
      pdv.indexOf(
        '/pdv/domains/fiscal/receipt.js'
      )
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/superadmin\/certificate-a1\.js/
  );
  assert.match(
    pdv,
    /\/pdv\/domains\/printing\/frame-controller\.js/
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/printing\/domain\.js/
  );
});

test('P16 fiscal domain e owner do estado do receipt sem QR global morto', () => {
  const {
    windowRef,
    domain
  } = loadFiscalDomain();

  assert.equal(
    domain.qrUrl,
    ''
  );

  domain.qrUrl =
    ' https://qr.example/new ';

  assert.equal(
    domain.qrUrl,
    'https://qr.example/new'
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      windowRef,
      '__scfNfceQrUrlAtual'
    ),
    false
  );

  domain.currentReceipt = {
    saleId: 'SALE-1'
  };
  domain.currentReceiptFromHistory =
    true;
  domain.historyReceiptSaleId =
    'SALE-1';
  domain.secondCopyPending =
    true;
  domain.completedCardWasVisible =
    true;

  domain.whatsappRequests.add(
    'SALE-1'
  );

  let closed = 0;

  domain.registerReceiptCloser(
    function() {
      closed += 1;
    }
  );

  assert.equal(
    domain.closeReceipt(),
    true
  );
  assert.equal(
    closed,
    1
  );

  const snapshot =
    domain.snapshot();

  assert.equal(
    snapshot.hasCurrentReceipt,
    true
  );
  assert.equal(
    snapshot.currentReceiptFromHistory,
    true
  );
  assert.equal(
    snapshot.secondCopyPending,
    true
  );
  assert.equal(
    snapshot.whatsappRequestCount,
    1
  );
  assert.equal(
    snapshot.receiptCloserReady,
    true
  );
});

test('P16 receipt consome owners fiscal/history/sale-payment e preserva protocolos/eventos', () => {
  const source =
    read(
      'offline-ui/pdv/domains/fiscal/receipt.js'
    );

  for (const token of [
    'fiscalDomain.currentReceipt',
    'fiscalDomain.currentReceiptFromHistory',
    'fiscalDomain.historyReceiptSaleId',
    'fiscalDomain.secondCopyPending',
    'fiscalDomain.whatsappRequests',
    'fiscalDomain.qrUrl',
    'historyDomain.getPendingSaleId()',
    'historyDomain.getReceiptFrame()',
    'salePaymentDomain.currentReceiptPendingSaleId',
    'fiscalDomain.registerReceiptCloser'
  ]) {
    assert.equal(
      source.includes(token),
      true,
      token
    );
  }

  for (const protocol of [
    'SCF_NFCE_COMPROVANTE_AUTORIZADO',
    'SCF_NFCE_COMPROVANTE_CONTINGENCIA',
    'SCF_NFCE_COMPROVANTE_CONTINGENCIA_ERRO',
    'SCF_WHATSAPP_ENVIAR_CUPOM',
    'SCF_WHATSAPP_CUPOM_RESULTADO',
    'SCF_WHATSAPP_CUPOM_ERRO'
  ]) {
    assert.equal(
      source.includes(protocol),
      true,
      protocol
    );
  }

  for (const eventName of [
    'scf:emitir-cupom-fiscal',
    'scf:nfce-historico-aberto',
    'scf:cupom-historico-fechado',
    'scf:limpar-venda-concluida'
  ]) {
    assert.equal(
      source.includes(eventName),
      true,
      eventName
    );
  }

  assert.doesNotMatch(
    source,
    /window\.__scfNfceQrUrlAtual|window\.__scfCurrentSaleReceiptPendingSaleId|window\.__scfHistoryInlineReceiptPendingSaleId|window\.__scfHistoryInlineReceiptFrame/
  );
  assert.doesNotMatch(
    source,
    /(?<![.\w])fetch\s*\(/
  );
  assert.doesNotMatch(
    source,
    /\blocalStorage\b|\bsessionStorage\b/
  );
});

test('P16 closer fica canonico no fiscal owner e rodapes preservam fluxo/temporizacao', () => {
  const receipt =
    read(
      'offline-ui/pdv/domains/fiscal/receipt.js'
    );
  const completed =
    read(
      'offline-ui/pdv/domains/fiscal/completed-footer.js'
    );
  const processing =
    read(
      'offline-ui/pdv/domains/fiscal/processing-footer.js'
    );

  assert.match(
    receipt,
    /fiscalDomain\.registerReceiptCloser/
  );
  assert.match(
    receipt,
    /window\.scfCloseCurrentFiscalReceipt\s*=\s*\r?\n\s*function/
  );
  assert.match(
    receipt,
    /return fiscalDomain\.closeReceipt\(\)/
  );

  assert.match(
    completed,
    /scfHandleCompletedReceiptAction/
  );
  assert.match(
    completed,
    /\[0, 80, 250, 700\]/
  );

  assert.match(
    processing,
    /fiscalDomain\.closeReceipt\(\)/
  );
  assert.doesNotMatch(
    processing,
    /window\.scfCloseCurrentFiscalReceipt/
  );
  assert.match(
    processing,
    /\[0, 50, 120, 300, 800\]/
  );
});

test('P16 integra superadmin P17 e consome owner printing P18', () => {
  const pdv =
    read('offline-ui/pdv.html');
  const receipt =
    read(
      'offline-ui/pdv/domains/fiscal/receipt.js'
    );

  assert.match(
    pdv,
    /\/pdv\/domains\/superadmin\/certificate-a1\.js/
  );

  for (const id of [
    'scf-nfce-impressao-automatica-80mm-script-final',
    'scf-nfce-electron-silent-print-bridge-final',
    'scf-nfce-escpos-direto-final'
  ]) {
    assert.equal(
      pdv.includes(id),
      false,
      id
    );
  }

  for (const ownerCall of [
    'printingDomain.registerImageGenerator',
    'printingDomain.lastImage',
    'printingDomain.printCurrent',
    'printingDomain.printHistory',
    'printingDomain.printContingency'
  ]) {
    assert.equal(
      receipt.includes(ownerCall),
      true,
      ownerCall
    );
  }

  assert.equal(
    fs.existsSync(
      path.join(
        ROOT,
        'offline-ui/pdv/domains/superadmin'
      )
    ),
    true
  );
  assert.equal(
    fs.existsSync(
      path.join(
        ROOT,
        'offline-ui/pdv/domains/printing'
      )
    ),
    true
  );
});
