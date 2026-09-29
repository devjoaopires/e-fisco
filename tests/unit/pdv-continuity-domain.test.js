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

function loadContinuityDomain() {
  const windowRef = {};
  const context =
    vm.createContext({
      window: windowRef
    });

  vm.runInContext(
    read(
      'offline-ui/pdv/domains/continuity/domain.js'
    ),
    context,
    {
      filename:
        'offline-ui/pdv/domains/continuity/domain.js'
    }
  );

  return {
    context,
    windowRef,
    domain:
      windowRef.__scfPdvDomains.continuity
  };
}

test('P15 continuity permanece estavel apos P18 printing', () => {
  const pdv =
    read('offline-ui/pdv.html');

  for (const file of [
    'domain.js',
    'core.js'
  ]) {
    const source =
      '/pdv/domains/continuity/' +
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
          'offline-ui/pdv/domains/continuity',
          file
        )
      ),
      true,
      file
    );
  }

  assert.ok(
    pdv.indexOf(
      '/pdv/domains/continuity/domain.js'
    ) <
      pdv.indexOf(
        '/pdv/domains/sale-payment/sale-core.js'
      )
  );

  assert.ok(
    pdv.indexOf(
      '/pdv/domains/sale-payment/payment-core.js'
    ) <
      pdv.indexOf(
        '/pdv/domains/continuity/core.js'
      )
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

test('P15 continuity domain e owner do contrato renderer e orquestra sale/payment por ports', () => {
  const {
    domain
  } = loadContinuityDomain();

  const calls = {
    export: 0,
    restore: [],
    payment: [],
    active: 0
  };

  domain.registerSalePort({
    exportDraft() {
      calls.export += 1;
      return {
        version: 1,
        products: []
      };
    },
    restoreDraft(draft, onPaymentStageReady) {
      calls.restore.push(draft);
      onPaymentStageReady('FINALIZE');
      return {
        restored: true
      };
    },
    hasActiveSale() {
      calls.active += 1;
      return true;
    }
  });

  domain.registerPaymentPort({
    restoreState(state, kind) {
      calls.payment.push({
        state,
        kind
      });
      return true;
    }
  });

  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        domain.exportDraft()
      )
    ),
    {
      version: 1,
      products: []
    }
  );

  const draft = {
    paymentContinuity: {
      selectedMethod: 'PIX',
      paymentParts: [
        {
          method: 'PIX',
          amount: 10
        }
      ]
    }
  };

  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        domain.restoreDraft(draft)
      )
    ),
    {
      restored: true
    }
  );

  assert.equal(
    calls.restore.length,
    1
  );
  assert.equal(
    calls.payment.length,
    1
  );
  assert.equal(
    calls.payment[0].kind,
    'FINALIZE'
  );
  assert.equal(
    calls.payment[0].state.selectedMethod,
    'PIX'
  );

  assert.equal(
    domain.hasActiveSale(),
    true
  );
  assert.equal(
    domain.snapshot().salePortReady,
    true
  );
  assert.equal(
    domain.snapshot().paymentPortReady,
    true
  );
});

test('P15 core mantem globals de continuidade somente como delegates do owner', () => {
  const {
    context,
    windowRef,
    domain
  } = loadContinuityDomain();

  let restored = null;

  domain.registerSalePort({
    exportDraft() {
      return {
        version: 1,
        saleNumber: '42'
      };
    },
    restoreDraft(draft) {
      restored = draft;
      return {
        ok: true
      };
    },
    hasActiveSale() {
      return true;
    }
  });

  vm.runInContext(
    read(
      'offline-ui/pdv/domains/continuity/core.js'
    ),
    context,
    {
      filename:
        'offline-ui/pdv/domains/continuity/core.js'
    }
  );

  assert.equal(
    typeof windowRef.__scfPdvExportContinuityDraft,
    'function'
  );
  assert.equal(
    typeof windowRef.__scfPdvRestoreContinuityDraft,
    'function'
  );
  assert.equal(
    typeof windowRef.__scfPdvHasActiveContinuitySale,
    'function'
  );

  assert.equal(
    windowRef.__scfPdvExportContinuityDraft()
      .saleNumber,
    '42'
  );

  const payload = {
    version: 1,
    products: []
  };

  windowRef.__scfPdvRestoreContinuityDraft(
    payload
  );

  assert.equal(
    restored,
    payload
  );
  assert.equal(
    windowRef.__scfPdvHasActiveContinuitySale(),
    true
  );

  const core =
    read(
      'offline-ui/pdv/domains/continuity/core.js'
    );

  assert.match(
    core,
    /continuityDomain\s*\.\s*exportDraft/
  );
  assert.match(
    core,
    /continuityDomain\s*\.\s*restoreDraft/
  );
  assert.match(
    core,
    /continuityDomain\s*\.\s*hasActiveSale/
  );
});

test('P15 sale/payment registra ports corretos e payment restore fica no owner lexical adequado', () => {
  const sale =
    read(
      'offline-ui/pdv/domains/sale-payment/sale-core.js'
    );
  const payment =
    read(
      'offline-ui/pdv/domains/sale-payment/payment-core.js'
    );

  assert.match(
    sale,
    /continuityDomain\.registerSalePort/
  );
  assert.match(
    sale,
    /function restoreContinuityDraft\(draft, onPaymentStageReady\)/
  );
  assert.match(
    sale,
    /onPaymentStageReady\(/
  );
  assert.doesNotMatch(
    sale,
    /window\.__scfPdvExportContinuityDraft\s*=|window\.__scfPdvRestoreContinuityDraft\s*=|window\.__scfPdvHasActiveContinuitySale\s*=/
  );

  assert.match(
    payment,
    /continuityDomain\.registerPaymentPort/
  );
  assert.match(
    payment,
    /function restoreContinuityPaymentState/
  );

  for (const field of [
    'paymentParts',
    'selectedPaymentMethod',
    'editingMethod',
    'flowMode',
    'methodAmount',
    'cashReceived'
  ]) {
    assert.equal(
      payment.includes(field),
      true,
      field
    );
  }

  assert.match(
    payment,
    /methodAmountInput\.value/
  );
  assert.match(
    payment,
    /cashReceivedInput\.value/
  );
  assert.match(
    payment,
    /flowMode === 'METHOD'/
  );
  assert.match(
    payment,
    /flowMode === 'CASH'/
  );
});

test('P15 preserva contratos main-process de mirror/recovery e nao cria fetch/storage paralelo', () => {
  const domain =
    read(
      'offline-ui/pdv/domains/continuity/domain.js'
    );
  const core =
    read(
      'offline-ui/pdv/domains/continuity/core.js'
    );
  const mirror =
    read(
      'offline/continuity/continuity-mirror.js'
    );
  const recovery =
    read(
      'offline/continuity/continuity-recovery.js'
    );

  assert.match(
    mirror,
    /__scfPdvExportContinuityDraft/
  );
  assert.match(
    recovery,
    /__scfPdvRestoreContinuityDraft/
  );
  assert.match(
    recovery,
    /__scfPdvHasActiveContinuitySale/
  );

  for (const source of [
    domain,
    core
  ]) {
    assert.doesNotMatch(
      source,
      /(?<![.\w])fetch\s*\(/
    );
    assert.doesNotMatch(
      source,
      /\blocalStorage\b|\bsessionStorage\b/
    );
  }

  assert.equal(
    fs.existsSync(
      path.join(
        ROOT,
        'offline-ui/pdv/domains/fiscal'
      )
    ),
    true
  );
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
