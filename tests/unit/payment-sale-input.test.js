'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizePaymentParts,
  buildOfflineSaleAtomicInput,
  buildOfflineCrediarioAtomicInput
} = require('../../offline-sale-service');

function activeProduct(overrides = {}) {
  return {
    produtoId: 'prod-1',
    descricao: 'Produto do cache',
    codigo: 'P-001',
    gtin: '7890000000001',
    unidade: 'UN',
    ativo: true,
    payload: {
      ncm: '12345678',
      cfop: '5102',
      origem: '0',
      csosn: '102',
      cstPis: '49',
      cstCofins: '49'
    },
    ...overrides
  };
}

function openCashSession(overrides = {}) {
  return {
    sessionId: 'cash-1',
    operationId: 'cash-open:cash-1',
    payload: {
      fiscalEnvironment: 'HOMOLOGACAO',
      remoteSynced: false
    },
    ...overrides
  };
}

function saleOptions(overrides = {}) {
  return {
    empresaId: 'empresa-1',
    openCashSession: openCashSession(),
    getProductCacheById: () => activeProduct(),
    getCustomerCacheById: () => null,
    getCrediarioDetailCache: () => ({
      conta: { situacaoVersao: 7 },
      itens: []
    }),
    getCrediarioPendingDependencies: () => [],
    ...overrides
  };
}

test('normalizePaymentParts normaliza aliases de método e valores em centavos', () => {
  const parts = normalizePaymentParts({
    paymentParts: [
      { method: ' pix ', amount: 6 },
      { metodo: 'dinheiro', valor: '5.00' },
      { paymentMethod: 'debito', amount: 1.25 }
    ]
  }, 1225);

  assert.deepEqual(
    parts.map((part) => ({
      method: part.method,
      amount: part.amount,
      amountCentavos: part.amountCentavos
    })),
    [
      { method: 'PIX', amount: 6, amountCentavos: 600 },
      { method: 'DINHEIRO', amount: 5, amountCentavos: 500 },
      { method: 'DEBITO', amount: 1.25, amountCentavos: 125 }
    ]
  );
});

test('normalizePaymentParts usa paymentMethod como fallback quando não há divisão', () => {
  assert.deepEqual(
    normalizePaymentParts({ paymentMethod: ' credito ' }, 1234),
    [{
      method: 'CREDITO',
      amount: 12.34,
      amountCentavos: 1234
    }]
  );
});

test('normalizePaymentParts rejeita método ausente, valor zero e soma divergente', () => {
  assert.throws(
    () => normalizePaymentParts({
      paymentParts: [{ amount: 10 }]
    }, 1000),
    /Forma de pagamento ausente/
  );

  assert.throws(
    () => normalizePaymentParts({
      paymentParts: [{ method: 'PIX', amount: 0 }]
    }, 0),
    /deve ser maior que zero/
  );

  assert.throws(
    () => normalizePaymentParts({
      paymentParts: [{ method: 'PIX', amount: 9.99 }]
    }, 1000),
    /difere do total da venda/
  );
});

test('buildOfflineSaleAtomicInput monta venda dividida e movimentos financeiros determinísticos', () => {
  const input = buildOfflineSaleAtomicInput({
    saleId: 'sale-1',
    products: [{
      productFiscalId: 'prod-1',
      name: 'Produto vendido',
      quantidade: 2,
      unitValue: 5.50,
      total: 11
    }],
    totalValue: 11,
    paymentParts: [
      { method: 'pix', amount: 6 },
      { method: 'dinheiro', amount: 5 }
    ],
    paidAt: '2026-09-25T10:00:00.000Z',
    operadorId: 'op-1',
    operadorNome: 'Operador'
  }, saleOptions());

  assert.equal(input.empresaId, 'empresa-1');
  assert.equal(input.saleId, 'sale-1');
  assert.equal(input.operationId, 'sale-paid:sale-1');
  assert.equal(input.totalCentavos, 1100);
  assert.equal(input.items.length, 1);
  assert.equal(input.items[0].quantidade, '2');
  assert.equal(input.items[0].unitPriceCentavos, 550);
  assert.equal(input.items[0].totalCentavos, 1100);

  assert.deepEqual(input.paymentParts, [
    { method: 'PIX', amount: 6 },
    { method: 'DINHEIRO', amount: 5 }
  ]);
  assert.equal(input.paymentSplit, true);
  assert.equal(input.paymentPartsCount, 2);
  assert.equal(input.paymentMethodsCount, 2);
  assert.equal(input.paymentTotalValue, 11);

  assert.equal(input.financialMovements.length, 2);
  assert.deepEqual(
    input.financialMovements.map((movement) => movement.amountCentavos),
    [600, 500]
  );
  assert.equal(input.cashMovements.length, 1);
  assert.equal(input.cashMovements[0].amountCentavos, 500);
  assert.deepEqual(input.dependencies, ['cash-open:cash-1']);
});

test('buildOfflineSaleAtomicInput exige caixa aberto até para pagamento não-dinheiro em venda normal', () => {
  assert.throws(
    () => buildOfflineSaleAtomicInput({
      saleId: 'sale-sem-caixa',
      products: [{
        productFiscalId: 'prod-1',
        quantidade: 1,
        unitValue: 10
      }],
      totalValue: 10,
      paymentMethod: 'PIX'
    }, saleOptions({ openCashSession: null })),
    /Não existe caixa aberto/
  );
});

test('buildOfflineSaleAtomicInput rejeita total declarado divergente da soma dos itens', () => {
  assert.throws(
    () => buildOfflineSaleAtomicInput({
      saleId: 'sale-total-invalido',
      products: [{
        productFiscalId: 'prod-1',
        quantidade: 2,
        unitValue: 5
      }],
      totalValue: 9.99,
      paymentMethod: 'PIX'
    }, saleOptions()),
    /difere da soma dos itens/
  );
});

test('buildOfflineSaleAtomicInput valida cliente usando lookup injetado', () => {
  let lookupArgs = null;

  const input = buildOfflineSaleAtomicInput({
    saleId: 'sale-cliente',
    clienteId: 'cliente-1',
    products: [{
      productFiscalId: 'prod-1',
      quantidade: 1,
      unitValue: 10
    }],
    totalValue: 10,
    paymentMethod: 'PIX'
  }, saleOptions({
    getCustomerCacheById: (...args) => {
      lookupArgs = args;
      return { ativo: true };
    }
  }));

  assert.deepEqual(lookupArgs, ['empresa-1', 'cliente-1']);
  assert.equal(input.clienteId, 'cliente-1');

  assert.throws(
    () => buildOfflineSaleAtomicInput({
      saleId: 'sale-cliente-inativo',
      clienteId: 'cliente-2',
      products: [{
        productFiscalId: 'prod-1',
        quantidade: 1,
        unitValue: 10
      }],
      totalValue: 10,
      paymentMethod: 'PIX'
    }, saleOptions({
      getCustomerCacheById: () => ({ ativo: false })
    })),
    /cliente informado não está ativo/
  );
});

test('liquidação de crediário por PIX dispensa caixa e preserva dependências do crediário', () => {
  const input = buildOfflineSaleAtomicInput({
    saleId: 'sale-liquidacao',
    crediarioLiquidacao: true,
    crediarioId: 'cred-1',
    crediarioPagamentoParcial: true,
    products: [{
      productFiscalId: 'prod-1',
      crediarioItemId: 'cred-item-1',
      quantidade: 1,
      unitValue: 10
    }],
    totalValue: 10,
    paymentParts: [{ method: 'PIX', amount: 10 }],
    paidAt: '2026-09-25T10:00:00.000Z'
  }, saleOptions({
    openCashSession: null,
    getCrediarioDetailCache: ({ empresaId, crediarioId }) => {
      assert.equal(empresaId, 'empresa-1');
      assert.equal(crediarioId, 'cred-1');
      return {
        conta: { situacaoVersao: 7 },
        itens: [{ crediarioItemId: 'cred-item-1' }]
      };
    },
    getCrediarioPendingDependencies: (empresaId, crediarioId) => {
      assert.equal(empresaId, 'empresa-1');
      assert.equal(crediarioId, 'cred-1');
      return ['cred-open:cred-1'];
    }
  }));

  assert.equal(input.skipStockMovements, true);
  assert.equal(input.cashMovements.length, 0);
  assert.deepEqual(input.dependencies, ['cred-open:cred-1']);
  assert.deepEqual(input.crediarioSettlement, {
    crediarioId: 'cred-1',
    itemIds: ['cred-item-1'],
    baseSituacaoVersao: 7,
    pagamentoParcial: true
  });
});

test('buildOfflineCrediarioAtomicInput monta cliente, vencimento e item sem acessar SQLite', () => {
  const input = buildOfflineCrediarioAtomicInput({
    crediarioId: 'cred-open-1',
    clienteId: 'cliente-1',
    vencimento: '31/12/2026',
    products: [{
      productFiscalId: 'prod-1',
      quantidade: 1.5,
      unitValue: 10,
      total: 15
    }],
    totalValue: 15,
    savedAt: '2026-09-25T10:00:00.000Z'
  }, {
    empresaId: 'empresa-1',
    getCustomerCacheById: () => ({
      ativo: true,
      nome: 'Cliente Teste',
      telefone: '(94) 99999-0000',
      documento: '123.456.789-01',
      payload: {}
    }),
    getProductCacheById: () => activeProduct()
  });

  assert.equal(input.empresaId, 'empresa-1');
  assert.equal(input.crediarioId, 'cred-open-1');
  assert.equal(input.clienteId, 'cliente-1');
  assert.equal(input.clienteNome, 'Cliente Teste');
  assert.equal(input.cpf, '12345678901');
  assert.equal(input.whatsapp, '94999990000');
  assert.equal(input.vencimento, '2026-12-31');
  assert.equal(input.totalCentavos, 1500);
  assert.equal(input.items.length, 1);
  assert.equal(input.items[0].quantity, '1.5');
  assert.equal(input.items[0].unitValue, 10);
  assert.equal(input.items[0].totalValue, 15);
  assert.equal(input.payload.status, 'A_RECEBER');
  assert.equal(input.payload.offline, true);
});

test('buildOfflineCrediarioAtomicInput rejeita CPF com quantidade de dígitos inválida', () => {
  assert.throws(
    () => buildOfflineCrediarioAtomicInput({
      crediarioId: 'cred-cpf-invalido',
      clienteId: 'cliente-1',
      vencimento: '31/12/2026',
      products: [{
        productFiscalId: 'prod-1',
        quantidade: 1,
        unitValue: 10
      }]
    }, {
      empresaId: 'empresa-1',
      getCustomerCacheById: () => ({
        ativo: true,
        nome: 'Cliente',
        documento: '123'
      }),
      getProductCacheById: () => activeProduct()
    }),
    /precisa possuir CPF válido/
  );
});

test('buildOfflineCrediarioAtomicInput rejeita data de vencimento impossível', () => {
  assert.throws(
    () => buildOfflineCrediarioAtomicInput({
      crediarioId: 'cred-data-invalida',
      clienteId: 'cliente-1',
      vencimento: '31/02/2026',
      products: [{
        productFiscalId: 'prod-1',
        quantidade: 1,
        unitValue: 10
      }]
    }, {
      empresaId: 'empresa-1',
      getCustomerCacheById: () => ({
        ativo: true,
        nome: 'Cliente',
        documento: '12345678901'
      }),
      getProductCacheById: () => activeProduct()
    }),
    /Vencimento do crediário é inválida/
  );
});
