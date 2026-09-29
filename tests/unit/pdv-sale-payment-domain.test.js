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

function loadSalePaymentDomain(initial = {}) {
  const windowRef = {
    ...initial
  };

  const context =
    vm.createContext({
      window: windowRef
    });

  vm.runInContext(
    read(
      'offline-ui/pdv/domains/sale-payment/domain.js'
    ),
    context,
    {
      filename:
        'offline-ui/pdv/domains/sale-payment/domain.js'
    }
  );

  return {
    windowRef,
    domain:
      windowRef.__scfPdvDomains.salePayment
  };
}

test('P14 sale/payment permanece estavel apos P18 printing', () => {
  const pdv =
    read('offline-ui/pdv.html');

  const files = [
    'domain.js',
    'sale-core.js',
    'payment-core.js',
    'finalize-standby.js',
    'finalize-menu.js',
    'finalize-back.js',
    'identification-back.js',
    'identification-person-nav.js',
    'identification-fields-nav.js',
    'identification-autofocus.js',
    'identification-optional.js',
    'auto-payment.js',
    'normal-sale-f11-lock.js',
    'internal-sale-toggle.js'
  ];

  for (const file of files) {
    const source =
      '/pdv/domains/sale-payment/' +
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
          'offline-ui/pdv/domains/sale-payment',
          file
        )
      ),
      true,
      file
    );
  }

  assert.ok(
    pdv.indexOf(
      '/pdv/domains/sale-payment/domain.js'
    ) <
      pdv.indexOf(
        '/pdv/domains/sale-payment/sale-core.js'
      )
  );

  assert.ok(
    pdv.indexOf(
      '/pdv/domains/sale-payment/sale-core.js'
    ) <
      pdv.indexOf(
        '/pdv/domains/sale-payment/payment-core.js'
      )
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/continuity\/domain\.js/
  );
  assert.match(
    pdv,
    /\/pdv\/domains\/continuity\/core\.js/
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

test('P14 sale/payment domain mantem venda/receipt/janela somente no owner apos cleanup', () => {
  const {
    windowRef,
    domain
  } = loadSalePaymentDomain();

  assert.equal(
    domain.internalSaleActive,
    false
  );
  assert.equal(
    domain.currentReceiptPendingSaleId,
    ''
  );
  assert.equal(
    domain.validationMinimumUntil,
    0
  );

  domain.internalSaleActive =
    true;
  domain.currentReceiptPendingSaleId =
    'sale-next';
  domain.validationMinimumUntil =
    9999;

  assert.equal(
    domain.internalSaleActive,
    true
  );
  assert.equal(
    domain.currentReceiptPendingSaleId,
    'sale-next'
  );
  assert.equal(
    domain.validationMinimumUntil,
    9999
  );

  for (const name of [
    '__scfPdvVendaInternaAtiva',
    '__scfCurrentSaleReceiptPendingSaleId',
    'scfValidationMinimumUntil'
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
    domain.claimGuard(
      'internal-sale-toggle'
    ),
    true
  );
  assert.equal(
    domain.claimGuard(
      'internal-sale-toggle'
    ),
    false
  );
});

test('P14 sale core preserva venda normal e integra com o owner continuity P15', () => {
  const source =
    read(
      'offline-ui/pdv/domains/sale-payment/sale-core.js'
    );

  for (const protocol of [
    'SCF_CENTRAL_VENDA_ESTADO',
    'SCF_FISCAL_FINALIZAR_SOLICITAR',
    'SCF_FISCAL_PRODUTOS_VOLTAR_SOLICITAR',
    'SCF_NFCE_NUMERACAO_SOLICITAR',
    'SCF_PRODUTO_FISCAL_VENDA_BUSCAR',
    'SCF_PRODUTO_FISCAL_VENDA_RESULTADO',
    'SCF_PRODUTO_FISCAL_VENDA_ERRO'
  ]) {
    assert.equal(
      source.includes(protocol),
      true,
      protocol
    );
  }

  for (const eventName of [
    'scf:finalizar-venda',
    'scf:limpar-venda-concluida',
    'scf:nova-venda-pronta',
    'scf:pdv-cancelar-produto-preparado-consulta',
    'scf:pdv-render-current-product-preview'
  ]) {
    assert.equal(
      source.includes(eventName),
      true,
      eventName
    );
  }

  assert.match(
    source,
    /continuityDomain\.registerSalePort/
  );
  assert.doesNotMatch(
    source,
    /window\.__scfPdvExportContinuityDraft\s*=|window\.__scfPdvRestoreContinuityDraft\s*=|window\.__scfPdvHasActiveContinuitySale\s*=/
  );

  assert.equal(
    fs.existsSync(
      path.join(
        ROOT,
        'offline-ui/pdv/domains/continuity'
      )
    ),
    true
  );

  assert.doesNotMatch(
    source,
    /(?<![.\w])fetch\s*\(/
  );
  assert.doesNotMatch(
    source,
    /(?:window\.)?localStorage\.|(?:window\.)?sessionStorage\./
  );
});

test('P14 payment core usa owner e preserva protocolos, eventos e storage do pagamento', () => {
  const source =
    read(
      'offline-ui/pdv/domains/sale-payment/payment-core.js'
    );

  for (const token of [
    'salePaymentDomain.internalSaleActive',
    'salePaymentDomain.currentReceiptPendingSaleId',
    'salePaymentDomain.validationMinimumUntil'
  ]) {
    assert.equal(
      source.includes(token),
      true,
      token
    );
  }

  for (const protocol of [
    'SCF_VENDA_OFFLINE_REGISTRADA',
    'SCF_VENDA_INTERNA_REGISTRADA',
    'SCF_VENDA_PJ_REGISTRADA',
    'SCF_VENDA_ERRO',
    'SCF_NFCE_PRECHECK_PRE_PAGAMENTO',
    'SCF_NFCE_PRECHECK_OK',
    'SCF_NFCE_PRECHECK_ERRO',
    'SCF_NFCE_SOLICITAR_EMISSAO'
  ]) {
    assert.equal(
      source.includes(protocol),
      true,
      protocol
    );
  }

  for (const eventName of [
    'scf:finalizar-venda',
    'scf:venda-paga',
    'scf:nova-venda-pronta',
    'scf:limpar-venda-concluida',
    'scf:crediario-venda-pronta'
  ]) {
    assert.equal(
      source.includes(eventName),
      true,
      eventName
    );
  }

  assert.match(
    source,
    /continuityDomain\.registerPaymentPort/
  );
  assert.match(
    source,
    /function restoreContinuityPaymentState/
  );

  for (const storageContract of [
    'storage.local.keys.fiscalSales',
    'storage.local.keys.lastFinalizedSale'
  ]) {
    assert.equal(
      source.includes(storageContract),
      true,
      storageContract
    );
  }

  assert.doesNotMatch(
    source,
    /window\.__scfPdvVendaInternaAtiva|window\.__scfCurrentSaleReceiptPendingSaleId|window\.scfValidationMinimumUntil/
  );
  assert.doesNotMatch(
    source,
    /(?<![.\w])fetch\s*\(/
  );
  assert.doesNotMatch(
    source,
    /(?:window\.)?localStorage\.|(?:window\.)?sessionStorage\./
  );
});

test('P14 auxiliares preservam pagamento/venda interna apos externalizacao fiscal P16', () => {
  const pdv =
    read('offline-ui/pdv.html');

  const toggle =
    read(
      'offline-ui/pdv/domains/sale-payment/internal-sale-toggle.js'
    );

  const autoPayment =
    read(
      'offline-ui/pdv/domains/sale-payment/auto-payment.js'
    );

  const finalizeBack =
    read(
      'offline-ui/pdv/domains/sale-payment/finalize-back.js'
    );

  assert.match(
    toggle,
    /salePaymentDomain\.claimGuard/
  );
  assert.match(
    toggle,
    /salePaymentDomain\.internalSaleActive/
  );
  assert.match(
    toggle,
    /scf:pdv-venda-interna-toggle/
  );

  assert.match(
    autoPayment,
    /scfAddFinalizePaymentStage/
  );
  assert.match(
    autoPayment,
    /scfRollbackFinalizeAutoPaymentStage/
  );

  assert.match(
    finalizeBack,
    /scfFinalizePaymentComplete/
  );
  assert.match(
    finalizeBack,
    /scfReturnFinalizePaymentOverview/
  );

  for (const fiscalAsset of [
    '/pdv/domains/fiscal/receipt.js',
    '/pdv/domains/fiscal/completed-footer.js',
    '/pdv/domains/fiscal/processing-footer.js'
  ]) {
    assert.equal(
      pdv.includes(fiscalAsset),
      true,
      fiscalAsset
    );
  }

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
