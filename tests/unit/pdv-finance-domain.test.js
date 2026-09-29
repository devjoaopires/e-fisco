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

function loadFinanceDomain(initial = {}) {
  const windowRef = {
    ...initial
  };

  const context =
    vm.createContext({
      window: windowRef
    });

  vm.runInContext(
    read(
      'offline-ui/pdv/domains/finance/domain.js'
    ),
    context,
    {
      filename:
        'offline-ui/pdv/domains/finance/domain.js'
    }
  );

  return {
    windowRef,
    domain:
      windowRef.__scfPdvDomains.finance
  };
}

test('P11 finance permanece estavel apos P18 printing', () => {
  const pdv =
    read('offline-ui/pdv.html');

  const files = [
    'domain.js',
    'core.js',
    'decor-grid.js',
    'summary.js',
    'exit-calendar.js',
    'exit-form.js',
    'payable-status-reload.js',
    'entry-calendar-form.js',
    'entry-cash-sync.js',
    'entry-label.js',
    'receivable-status.js',
    'calendar-toggle.js',
    'entry-month-calendar.js'
  ];

  for (const file of files) {
    const source =
      '/pdv/domains/finance/' +
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
          'offline-ui/pdv/domains/finance',
          file
        )
      ),
      true,
      file
    );
  }

  assert.ok(
    pdv.indexOf(
      '/pdv/domains/finance/domain.js'
    ) <
      pdv.indexOf(
        '/pdv/domains/finance/core.js'
      )
  );

  assert.match(
    pdv,
    /<script id="scf-financeiro-menu-ativo-preto-script-final">/
  );
  assert.match(
    pdv,
    /\/pdv\/domains\/cash\/receipt\.js/
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

test('P11 finance domain mantem estado somente no owner apos limpeza dos adapters globais', () => {
  const {
    windowRef,
    domain
  } = loadFinanceDomain();

  assert.deepEqual(
    Array.from(
      domain.localMovements
    ),
    []
  );
  assert.equal(
    domain.exitSelectedDateFilter,
    ''
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        domain.receivablePending
      )
    ),
    {}
  );
  assert.equal(
    domain.accountStatusReload,
    false
  );

  const nextMovements = [
    {
      id: 'next-1',
      tipo: 'SUPRIMENTO'
    }
  ];

  domain.localMovements =
    nextMovements;
  domain.exitSelectedDateFilter =
    '02/09/2026';
  domain.receivablePending = {
    req1: {
      anterior: false
    }
  };
  domain.accountStatusReload =
    true;

  assert.equal(
    domain.localMovements,
    nextMovements
  );
  assert.equal(
    domain.exitSelectedDateFilter,
    '02/09/2026'
  );
  assert.equal(
    domain.accountStatusReload,
    true
  );

  domain.setCashMovementDateProvider(
    () => [
      '02/09/2026'
    ]
  );

  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        domain.getCashMovementDates()
      )
    ),
    [
      '02/09/2026'
    ]
  );

  let filteredDate = '';
  domain.setCashMovementDateFilter(
    (value) => {
      filteredDate = value;
    }
  );

  domain.filterCashMovementsByDate(
    '03/09/2026'
  );

  assert.equal(
    filteredDate,
    '03/09/2026'
  );

  for (const name of [
    '__scfFinanceCaixaConsulta',
    '__scfFinanceMovimentosLocais',
    '__scfFinanceExitSelectedDateFilter',
    '__scfContaReceberPendencias',
    '__scfFinanceContaDigitalSituacaoReload',
    '__scfFinanceDatasMovimentacaoCaixa',
    '__scfFinanceFiltrarMovimentacaoCaixaPorData'
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
});

test('P11 core consome owner finance e preserva protocolos, eventos, storage e adapters publicos', () => {
  const source =
    read(
      'offline-ui/pdv/domains/finance/core.js'
    );

  for (const token of [
    'financeDomain.setCashMovementDateFilter',
    'financeDomain.setCashMovementDateProvider',
    'financeDomain.cashSnapshot',
    'financeDomain.localMovements',
    'financeDomain.receivablePending'
  ]) {
    assert.equal(
      source.includes(token),
      true,
      token
    );
  }

  for (const protocol of [
    'SCF_FINANCEIRO_SALDO_DADOS_SOLICITAR',
    'SCF_FINANCEIRO_SALDO_DADOS_RESULTADO',
    'SCF_FINANCEIRO_SALDO_DADOS_ERRO',
    'SCF_FINANCEIRO_EXTRATO_MES_SOLICITAR',
    'SCF_FINANCEIRO_EXTRATO_MES_RESULTADO',
    'SCF_FINANCEIRO_CONTA_PAGAR_SITUACAO_ATUALIZAR',
    'SCF_FINANCEIRO_CONTA_RECEBER_SITUACAO_ATUALIZAR'
  ]) {
    assert.equal(
      source.includes(protocol),
      true,
      protocol
    );
  }

  for (const eventName of [
    'scf:financeiro-retorno-pdv',
    'scf:financeiro-saida-anulada-local',
    'scf:financeiro-saida-data-filtro-alterado',
    'scf:financeiro-saida-selecionar',
    'scf:financeiro-saldo-recarregar'
  ]) {
    assert.equal(
      source.includes(eventName),
      true,
      eventName
    );
  }

  for (const adapter of [
    'window.scfAbrirFinanceiro',
    'window.scfFecharFinanceiro'
  ]) {
    assert.equal(
      source.includes(adapter),
      true,
      adapter
    );
  }

  for (const storageContract of [
    'storage.local.keys.financeExitPaid',
    'storage.local.prefixes.financeSangriaHistory',
    'storage.local.prefixes.financeSangriaReversed',
    'storage.defaults.financeTenant'
  ]) {
    assert.equal(
      source.includes(storageContract),
      true,
      storageContract
    );
  }

  assert.doesNotMatch(
    source,
    /window\.__scfFinanceCaixaConsulta|window\.__scfFinanceMovimentosLocais|window\.__scfFinanceExitSelectedDateFilter|window\.__scfContaReceberPendencias/
  );
  assert.doesNotMatch(
    source,
    /(?:window\.)?localStorage\./
  );
  assert.doesNotMatch(
    source,
    /(?<![.\w])fetch\s*\(/
  );
});

test('P11 saida/entrada consomem owners finance e suppliers sem duplicar caches compartilhados', () => {
  const exitForm =
    read(
      'offline-ui/pdv/domains/finance/exit-form.js'
    );

  const exitCalendar =
    read(
      'offline-ui/pdv/domains/finance/exit-calendar.js'
    );

  const entryForm =
    read(
      'offline-ui/pdv/domains/finance/entry-calendar-form.js'
    );

  const receivable =
    read(
      'offline-ui/pdv/domains/finance/receivable-status.js'
    );

  assert.match(
    exitForm,
    /financeDomain\.localMovements/
  );
  assert.match(
    exitForm,
    /suppliersDomain\.suppliers/
  );
  assert.doesNotMatch(
    exitForm,
    /window\.__scfFinanceMovimentosLocais|window\.__scfFornecedoresCadastroCache/
  );

  assert.match(
    exitCalendar,
    /financeDomain\.exitSelectedDateFilter/
  );

  assert.match(
    entryForm,
    /financeDomain\.cashSnapshot/
  );
  assert.match(
    entryForm,
    /cashDomain\.currentCash/
  );
  assert.doesNotMatch(
    entryForm,
    /window\.__scfGetCaixaAtual/
  );

  assert.match(
    receivable,
    /financeDomain\.receivablePending/
  );
  assert.doesNotMatch(
    receivable,
    /window\.__scfContaReceberPendencias/
  );
});

test('P11 preserva bridge de calendario financeiro consumindo P12 cash owner', () => {
  const pdv =
    read('offline-ui/pdv.html');

  const entryMonth =
    read(
      'offline-ui/pdv/domains/finance/entry-month-calendar.js'
    );

  assert.match(
    entryMonth,
    /financeDomain\.getCashMovementDates/
  );
  assert.match(
    entryMonth,
    /financeDomain\.filterCashMovementsByDate/
  );

  const cashRuntime =
    [
      read(
        'offline-ui/pdv/domains/cash/core.js'
      ),
      read(
        'offline-ui/pdv/domains/cash/receipt.js'
      )
    ].join('\n');

  assert.equal(
    cashRuntime.includes(
      'SCF_CAIXA_MOVIMENTO_REGISTRADO'
    ),
    true
  );
  assert.equal(
    pdv.includes(
      'SCF_STOCK_KEYBOARD_FROM_MENU'
    ),
    true
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
