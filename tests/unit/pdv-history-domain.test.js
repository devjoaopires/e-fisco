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

function loadHistoryDomain(initial = {}) {
  const windowRef = {
    ...initial
  };

  const context =
    vm.createContext({
      window: windowRef
    });

  vm.runInContext(
    read(
      'offline-ui/pdv/domains/history/domain.js'
    ),
    context,
    {
      filename:
        'offline-ui/pdv/domains/history/domain.js'
    }
  );

  return {
    windowRef,
    domain:
      windowRef.__scfPdvDomains.history
  };
}

test('P09 history permanece estavel apos P18 printing', () => {
  const pdv =
    read('offline-ui/pdv.html');

  const files = [
    'domain.js',
    'core.js',
    'title.js',
    'compact-card.js',
    'compact-card-fix.js',
    'inline-receipt.js',
    'aligned-card.js',
    'table-layout.js',
    'second-copy-click.js',
    'receipt-close-menu.js',
    'calendar.js',
    'embedded-view.js',
    'calendar-photo.js',
    'second-copy-state.js',
    'close-restore-dock.js',
    'close-document-reset.js',
    'monthly-dashboard.js',
    'filters.js',
    'annual-dashboard.js',
    'reset-month-on-exit.js'
  ];

  for (const file of files) {
    const source =
      '/pdv/domains/history/' +
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
          'offline-ui/pdv/domains/history',
          file
        )
      ),
      true,
      file
    );
  }

  assert.ok(
    pdv.indexOf(
      '/pdv/domains/history/domain.js'
    ) <
      pdv.indexOf(
        '/pdv/domains/history/core.js'
      )
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/inventory\/domain\.js/
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/finance\/domain\.js/
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/cash\/domain\.js/
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/crediario\/domain\.js/
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/sale-payment\/domain\.js/
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/continuity\/domain\.js/
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/fiscal\/domain\.js/
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/superadmin\/domain\.js/
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/printing\/domain\.js/
  );
});

test('P09 history domain e owner canonico do estado compartilhado de comprovante inline', () => {
  const previousFrame = {
    id: 'frame-legacy'
  };

  const {
    windowRef,
    domain
  } = loadHistoryDomain({
    __scfHistoryInlineReceiptFrame:
      previousFrame,
    __scfHistoryInlineReceiptPendingSaleId:
      'sale-legacy'
  });

  assert.equal(
    domain.getReceiptFrame(),
    previousFrame
  );
  assert.equal(
    domain.getPendingSaleId(),
    'sale-legacy'
  );

  windowRef
    .__scfHistoryInlineReceiptPendingSaleId =
      'sale-2';

  assert.equal(
    domain.receipt.pendingSaleId,
    'sale-2'
  );

  domain.setPendingSaleId(
    'sale-3'
  );

  assert.equal(
    windowRef
      .__scfHistoryInlineReceiptPendingSaleId,
    'sale-3'
  );

  const nextFrame = {
    id: 'frame-next'
  };

  domain.receipt.frame =
    nextFrame;

  assert.equal(
    windowRef
      .__scfHistoryInlineReceiptFrame,
    nextFrame
  );

  domain.clearReceiptState();

  assert.deepEqual(
    {
      hasReceiptFrame:
        domain.snapshot().hasReceiptFrame,
      pendingSaleId:
        domain.snapshot().pendingSaleId
    },
    {
      hasReceiptFrame: false,
      pendingSaleId: ''
    }
  );
});

test('P09 inline receipt usa o owner history e nao mantem pending/frame paralelo', () => {
  const source =
    read(
      'offline-ui/pdv/domains/history/inline-receipt.js'
    );

  assert.match(
    source,
    /historyDomain\.receipt\.pendingSaleId/
  );
  assert.match(
    source,
    /historyDomain\.receipt\.frame/
  );

  assert.doesNotMatch(
    source,
    /\blet\s+pendingSaleId\b/
  );
  assert.doesNotMatch(
    source,
    /\blet\s+receiptFrame\b/
  );
  assert.doesNotMatch(
    source,
    /window\.__scfHistoryInlineReceiptPendingSaleId/
  );
  assert.doesNotMatch(
    source,
    /window\.__scfHistoryInlineReceiptFrame/
  );

  for (const protocol of [
    'SCF_NFCE_SOLICITAR_COMPROVANTE',
    'SCF_NFCE_COMPROVANTE_AUTORIZADO',
    'SCF_NFCE_COMPROVANTE_ERRO'
  ]) {
    assert.equal(
      source.includes(protocol),
      true,
      protocol
    );
  }

  assert.equal(
    source.includes(
      'scf:cupom-historico-fechado'
    ),
    true
  );
});

test('P09 core preserva mensagens e eventos do historico sem fetch/storage paralelos', () => {
  const source =
    read(
      'offline-ui/pdv/domains/history/core.js'
    );

  for (const protocol of [
    'SCF_HISTORICO_VENDAS_ABRIR',
    'SCF_HISTORICO_VENDAS_SOLICITAR',
    'SCF_HISTORICO_VENDAS_RESULTADO',
    'SCF_HISTORICO_VENDAS_ERRO',
    'SCF_HISTORICO_VENDAS_FECHAR',
    'SCF_NFCE_SOLICITAR_COMPROVANTE',
    'SCF_EXPORTAR_XML_ENVIAR_EMAIL',
    'SCF_EXPORTAR_XML_RESULTADO',
    'SCF_EXPORTAR_XML_ERRO'
  ]) {
    assert.equal(
      source.includes(protocol),
      true,
      protocol
    );
  }

  for (const eventName of [
    'scf:historico-vendas-renderizado',
    'scf:historico-vendas-atualizar',
    'scf:historico-vendas-fechado',
    'scf:historico-vendas-ano-dados',
    'scf:comprovante-historico-solicitado'
  ]) {
    assert.equal(
      source.includes(eventName),
      true,
      eventName
    );
  }

  assert.doesNotMatch(
    source,
    /\blocalStorage\b|\bsessionStorage\b/
  );
  assert.doesNotMatch(
    source,
    /(?<![.\w])fetch\s*\(/
  );
});

test('P09 presentation/calendar/dashboard/filter permanecem no dominio e preservam eventos internos', () => {
  const files = [
    'calendar.js',
    'calendar-photo.js',
    'monthly-dashboard.js',
    'annual-dashboard.js',
    'filters.js',
    'reset-month-on-exit.js'
  ];

  const combined =
    files
      .map(
        (file) =>
          read(
            'offline-ui/pdv/domains/history/' +
            file
          )
      )
      .join('\n');

  for (const eventName of [
    'scf:cupom-historico-fechado',
    'scf:historico-vendas-renderizado',
    'scf:historico-vendas-atualizar',
    'scf:historico-vendas-ano-dados',
    'scf:historico-vendas-fechado'
  ]) {
    assert.equal(
      combined.includes(eventName),
      true,
      eventName
    );
  }

  for (const source of files.map(
    (file) =>
      read(
        'offline-ui/pdv/domains/history/' +
        file
      )
  )) {
    assert.doesNotMatch(
      source,
      /\blocalStorage\b|\bsessionStorage\b/
    );
    assert.doesNotMatch(
      source,
      /(?<![.\w])fetch\s*\(/
    );
  }
});
