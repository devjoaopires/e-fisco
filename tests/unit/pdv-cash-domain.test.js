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

function loadCashDomain(initial = {}) {
  const windowRef = {
    ...initial
  };

  const context =
    vm.createContext({
      window: windowRef
    });

  vm.runInContext(
    read(
      'offline-ui/pdv/domains/cash/domain.js'
    ),
    context,
    {
      filename:
        'offline-ui/pdv/domains/cash/domain.js'
    }
  );

  return {
    windowRef,
    domain:
      windowRef.__scfPdvDomains.cash
  };
}

test('P12 cash permanece estavel apos P18 printing', () => {
  const pdv =
    read('offline-ui/pdv.html');

  const files = [
    'domain.js',
    'core.js',
    'receipt.js',
    'closing-term-back.js',
    'back-label.js',
    'return-to-pdv.js',
    'receipt-close-on-leave.js'
  ];

  for (const file of files) {
    const source =
      '/pdv/domains/cash/' +
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
          'offline-ui/pdv/domains/cash',
          file
        )
      ),
      true,
      file
    );
  }

  assert.ok(
    pdv.indexOf(
      '/pdv/domains/cash/domain.js'
    ) <
      pdv.indexOf(
        '/pdv/domains/cash/core.js'
      )
  );

  assert.match(
    pdv,
    /__cashMovementMenuBloqueado/
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

test('P12 cash domain preserva adapters consumidos e remove flag global sem consumidor', () => {
  const legacyCash = {
    id: 'cash-legacy',
    status: 'ABERTO'
  };

  let legacyClosed = 0;

  const {
    windowRef,
    domain
  } = loadCashDomain({
    __scfGetCaixaAtual:
      () => legacyCash,
    scfFecharComprovanteCaixa:
      () => {
        legacyClosed += 1;
      }
  });

  assert.equal(
    domain.currentCash,
    legacyCash
  );
  assert.equal(
    windowRef.__scfGetCaixaAtual(),
    legacyCash
  );
  assert.equal(
    domain.returnCoordinatorReady,
    false
  );
  domain.returnCoordinatorReady =
    true;
  assert.equal(
    domain.returnCoordinatorReady,
    true
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      windowRef,
      '__scfRetornoPdvCaixaFechadoXReady'
    ),
    false
  );

  windowRef.scfFecharComprovanteCaixa();
  assert.equal(
    legacyClosed,
    1
  );

  const nextCash = {
    id: 'cash-next',
    status: 'ABERTO'
  };

  domain.currentCash = nextCash;

  assert.equal(
    windowRef.__scfGetCaixaAtual(),
    nextCash
  );

  let closed = 0;
  domain.setReceiptCloser(
    () => {
      closed += 1;
    }
  );
  domain.closeReceipt();

  assert.equal(
    closed,
    1
  );
  assert.equal(
    typeof windowRef.scfFecharComprovanteCaixa,
    'function'
  );
});

test('P12 core usa cash owner e suppliers owner preservando contratos de caixa', () => {
  const source =
    read(
      'offline-ui/pdv/domains/cash/core.js'
    );

  for (const token of [
    'cashDomain.currentCash',
    'cashDomain.getReceiptCloser',
    'cashDomain.closeReceipt',
    'suppliersDomain.suppliers'
  ]) {
    assert.equal(
      source.includes(token),
      true,
      token
    );
  }

  for (const protocol of [
    'SCF_CAIXA_ABRIR',
    'SCF_CAIXA_ABERTO',
    'SCF_CAIXA_ABERTURA_ERRO',
    'SCF_CAIXA_CONSULTAR',
    'SCF_CAIXA_CONSULTA_RESULTADO',
    'SCF_CAIXA_CONSULTA_ERRO',
    'SCF_CAIXA_MOVIMENTO_REGISTRAR',
    'SCF_CAIXA_MOVIMENTO_REGISTRADO',
    'SCF_CAIXA_MOVIMENTO_ERRO',
    'SCF_CAIXA_FECHAR',
    'SCF_CAIXA_FECHADO',
    'SCF_CAIXA_FECHAMENTO_ERRO',
    'SCF_CAIXA_TELA_ABRIR'
  ]) {
    assert.equal(
      source.includes(protocol),
      true,
      protocol
    );
  }

  for (const eventName of [
    'scf:financeiro-retorno-pdv',
    'scf:financeiro-saida-cadastrar',
    'scf:financeiro-saida-status'
  ]) {
    assert.equal(
      source.includes(eventName),
      true,
      eventName
    );
  }

  assert.doesNotMatch(
    source,
    /window\.__scfGetCaixaAtual|window\.__scfFornecedoresCadastroCache|window\.scfFecharComprovanteCaixa/
  );
  assert.doesNotMatch(
    source,
    /\blocalStorage\b|\bsessionStorage\b/
  );
  assert.doesNotMatch(
    source,
    /(?<![.\w])fetch\s*\(/
  );
});

test('P12 receipt usa finance owner e registra closer no cash owner preservando impressao e recibos', () => {
  const source =
    read(
      'offline-ui/pdv/domains/cash/receipt.js'
    );

  assert.match(
    source,
    /cashDomain\.setReceiptCloser/
  );
  assert.match(
    source,
    /financeDomain\.localMovements/
  );

  for (const protocol of [
    'SCF_CAIXA_MOVIMENTO_REGISTRADO',
    'SCF_CAIXA_MOVIMENTO_ERRO',
    'SCF_CAIXA_FECHADO',
    'SCF_CAIXA_FECHAMENTO_ERRO',
    'SCF_EFISCO_IMPRIMIR_NFCE_LOCAL',
    'SCF_EFISCO_IMPRIMIR_NFCE_LOCAL_RESULT'
  ]) {
    assert.equal(
      source.includes(protocol),
      true,
      protocol
    );
  }

  assert.doesNotMatch(
    source,
    /window\.__scfFinanceMovimentosLocais|window\.scfFecharComprovanteCaixa/
  );
  assert.doesNotMatch(
    source,
    /\blocalStorage\b|\bsessionStorage\b/
  );
  assert.doesNotMatch(
    source,
    /(?<![.\w])fetch\s*\(/
  );
});

test('P12 integra finance ao cash owner e permanece estavel apos P13', () => {
  const pdv =
    read('offline-ui/pdv.html');

  const financeEntry =
    read(
      'offline-ui/pdv/domains/finance/entry-calendar-form.js'
    );

  const returnToPdv =
    read(
      'offline-ui/pdv/domains/cash/return-to-pdv.js'
    );

  const closeOnLeave =
    read(
      'offline-ui/pdv/domains/cash/receipt-close-on-leave.js'
    );

  assert.match(
    financeEntry,
    /cashDomain\.currentCash/
  );
  assert.doesNotMatch(
    financeEntry,
    /window\.__scfGetCaixaAtual/
  );

  assert.match(
    returnToPdv,
    /cashDomain\.returnCoordinatorReady/
  );
  assert.match(
    returnToPdv,
    /scf:financeiro-retorno-pdv/
  );

  assert.match(
    closeOnLeave,
    /scf-cash-receipt-open/
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
