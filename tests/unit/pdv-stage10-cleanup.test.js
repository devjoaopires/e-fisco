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

function productionRendererSurface() {
  const sources = [
    read('offline-ui/pdv.html')
  ];

  const pdvRoot =
    path.join(
      ROOT,
      'offline-ui',
      'pdv'
    );

  function walk(directory) {
    for (
      const entry
      of fs.readdirSync(
        directory,
        {
          withFileTypes: true
        }
      )
    ) {
      const fullPath =
        path.join(
          directory,
          entry.name
        );

      if(entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if(
        entry.isFile() &&
        entry.name.endsWith('.js') &&
        !entry.name.includes('.bak.')
      ) {
        sources.push(
          fs.readFileSync(
            fullPath,
            'utf8'
          )
        );
      }
    }
  }

  walk(pdvRoot);

  return sources.join('\n');
}

function loadSimpleDomain(relativePath) {
  const windowRef = {};
  const context =
    vm.createContext({
      window: windowRef,
      Promise,
      Set,
      Map
    });

  vm.runInContext(
    read(relativePath),
    context,
    {
      filename:
        relativePath
    }
  );

  return windowRef;
}

test('10.3 remove adapters/globals sem consumidor de producao', () => {
  const surface =
    productionRendererSurface();

  const removed = [
    '__scfPdvProdutoFiscalCache',
    '__scfPdvCacheProductFiscal',
    '__scfPdvFindCachedProductFiscal',
    '__scfClientesCadastroCache',
    '__scfFornecedoresCadastroCache',
    '__scfFinanceCaixaConsulta',
    '__scfFinanceMovimentosLocais',
    '__scfFinanceExitSelectedDateFilter',
    '__scfContaReceberPendencias',
    '__scfFinanceContaDigitalSituacaoReload',
    '__scfFinanceDatasMovimentacaoCaixa',
    '__scfFinanceFiltrarMovimentacaoCaixaPorData',
    '__scfRetornoPdvCaixaFechadoXReady',
    '__scfPdvVendaInternaAtiva',
    '__scfCurrentSaleReceiptPendingSaleId',
    'scfValidationMinimumUntil',
    '__scfNfceQrUrlAtual',
    'scfImprimirNfceAtualAutomaticamente',
    'scfImprimirNfceHistoricoAoReenviar',
    'scfImprimirNfceContingenciaAutomaticamente',
    'scfGerarImagemCupomBase64ParaImpressao',
    '__scfUltimaImagemCupomParaImpressao',
    '__scfElectronPrintRequestId',
    'scfNfceLocalPrintMode',
    'scfNfceLocalPrintPrinter',
    '__scfStatusConexaoInternetReady',
    '__scfPdvConsultaProdutoAtiva',
    '__scfPdvApp',
    '__scfSuperAdminA1AposCadastroSucesso',
    '__scfSuperAdminLimparFormularioEmpresa',
    '__scfSuperAdminSolicitarEmpresas',
    '__scfSuperAdminTituloPainelAtual',
    '__scfSuperAdminResetarModoAtualizacao',
    '__scfSuperAdminFecharEdicaoSemSalvar',
    '__scfSuperAdminSairDetalhesVisual',
    '__scfCrediarioMantemFoco',
    '__scfInternetMenuBloqueado',
    '__scfCashMovementMenuBloqueado'
  ];

  for (const name of removed) {
    assert.equal(
      surface.includes(name),
      false,
      name
    );
  }
});

test('10.3 preserva somente bridges legados que ainda possuem consumidor real', () => {
  const surface =
    productionRendererSurface();
  const main =
    read('main.js');
  const continuityMirror =
    read(
      'offline/continuity/continuity-mirror.js'
    );
  const continuityRecovery =
    read(
      'offline/continuity/continuity-recovery.js'
    );
  const frameBridge =
    read(
      'printing/frame-print-bridge.js'
    );

  for (const name of [
    '__scfPerfilSessao',
    '__scfAcessoSomentePdv',
    '__scfSistemaOnlineAtual',
    '__scfClienteEdicaoId',
    '__scfFornecedorEdicaoId',
    '__scfGetCaixaAtual',
    'scfFecharComprovanteCaixa',
    '__scfPdvExportContinuityDraft',
    '__scfPdvRestoreContinuityDraft',
    '__scfPdvHasActiveContinuitySale',
    '__scfElectronPendingPrintPayload'
  ]) {
    assert.equal(
      (
        surface +
        main +
        continuityMirror +
        continuityRecovery +
        frameBridge
      ).includes(name),
      true,
      name
    );
  }

  assert.match(
    frameBridge,
    /__scfElectronPendingPrintPayload/
  );
});

test('10.3 customer/suppliers mantem owner de colecao sem cache global', () => {
  const customerWindow =
    loadSimpleDomain(
      'offline-ui/pdv/domains/customer/domain.js'
    );
  const supplierWindow =
    loadSimpleDomain(
      'offline-ui/pdv/domains/suppliers/domain.js'
    );

  customerWindow
    .__scfPdvDomains.customer
    .setCustomers([
      {
        clienteId: 'C1'
      }
    ]);

  supplierWindow
    .__scfPdvDomains.suppliers
    .setSuppliers([
      {
        fornecedorId: 'F1'
      }
    ]);

  assert.equal(
    customerWindow
      .__scfPdvDomains.customer
      .findCustomerById('C1')
      .clienteId,
    'C1'
  );
  assert.equal(
    supplierWindow
      .__scfPdvDomains.suppliers
      .findSupplierById('F1')
      .fornecedorId,
    'F1'
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      customerWindow,
      '__scfClientesCadastroCache'
    ),
    false
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      supplierWindow,
      '__scfFornecedoresCadastroCache'
    ),
    false
  );
});

test('10.3 finance/sale/fiscal mantem estado somente pelos owners', () => {
  const financeWindow =
    loadSimpleDomain(
      'offline-ui/pdv/domains/finance/domain.js'
    );
  const saleWindow =
    loadSimpleDomain(
      'offline-ui/pdv/domains/sale-payment/domain.js'
    );
  const fiscalWindow =
    loadSimpleDomain(
      'offline-ui/pdv/domains/fiscal/domain.js'
    );

  const finance =
    financeWindow.__scfPdvDomains.finance;
  const sale =
    saleWindow.__scfPdvDomains.salePayment;
  const fiscal =
    fiscalWindow.__scfPdvDomains.fiscal;

  finance.localMovements = [
    {
      id: 'M1'
    }
  ];
  finance.exitSelectedDateFilter =
    '2026-09-28';
  sale.internalSaleActive =
    true;
  sale.currentReceiptPendingSaleId =
    'SALE-1';
  fiscal.qrUrl =
    'https://qr.example/1';

  assert.equal(
    finance.localMovements.length,
    1
  );
  assert.equal(
    finance.exitSelectedDateFilter,
    '2026-09-28'
  );
  assert.equal(
    sale.internalSaleActive,
    true
  );
  assert.equal(
    sale.currentReceiptPendingSaleId,
    'SALE-1'
  );
  assert.equal(
    fiscal.qrUrl,
    'https://qr.example/1'
  );

  for (const [windowRef, names] of [
    [
      financeWindow,
      [
        '__scfFinanceMovimentosLocais',
        '__scfContaReceberPendencias'
      ]
    ],
    [
      saleWindow,
      [
        '__scfPdvVendaInternaAtiva',
        '__scfCurrentSaleReceiptPendingSaleId',
        'scfValidationMinimumUntil'
      ]
    ],
    [
      fiscalWindow,
      [
        '__scfNfceQrUrlAtual'
      ]
    ]
  ]) {
    for (const name of names) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(
          windowRef,
          name
        ),
        false,
        name
      );
    }
  }
});

test('10.3 printing mantem somente pending payload como bridge cross-process', async () => {
  const windowRef =
    loadSimpleDomain(
      'offline-ui/pdv/domains/printing/domain.js'
    );
  const printing =
    windowRef.__scfPdvDomains.printing;

  let currentCalls = 0;

  printing.registerCurrentPrinter(
    () => {
      currentCalls += 1;
      return true;
    }
  );

  printing.registerImageGenerator(
    () =>
      'data:image/jpeg;base64,AAAA'
  );

  assert.equal(
    printing.printCurrent({
      saleId: 'SALE-1'
    }),
    true
  );
  assert.equal(
    currentCalls,
    1
  );
  assert.equal(
    await printing.generateReceiptImage(),
    'data:image/jpeg;base64,AAAA'
  );

  printing.lastImage = {
    saleId: 'SALE-1'
  };

  windowRef.__scfElectronPendingPrintPayload = {
    requestId: 'REQ-1'
  };

  assert.equal(
    printing.pendingPayload.requestId,
    'REQ-1'
  );
  assert.equal(
    printing.lastImage.saleId,
    'SALE-1'
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      windowRef,
      '__scfElectronPendingPrintPayload'
    ),
    true
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
});

test('10.3 bootstrap elimina agregado debug e compat instala apenas bindings consumidos', () => {
  const compat =
    read(
      'offline-ui/pdv/compat/legacy-globals.js'
    );
  const bootstrap =
    read(
      'offline-ui/pdv/bootstrap.js'
    );

  assert.doesNotMatch(
    bootstrap,
    /__scfPdvApp/
  );

  assert.doesNotMatch(
    compat,
    /__scfStatusConexaoInternetReady/
  );
  assert.doesNotMatch(
    compat,
    /__scfPdvConsultaProdutoAtiva/
  );

  for (const name of [
    '__scfPerfilSessao',
    '__scfAcessoSomentePdv',
    '__scfSistemaOnlineAtual'
  ]) {
    assert.equal(
      compat.includes(name),
      true,
      name
    );
  }
});
