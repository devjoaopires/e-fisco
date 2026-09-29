'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  initializeOfflineDatabase,
  closeOfflineDatabase,
  upsertProductCache,
  getProductCacheById,
  findProductCacheByCodeOrGtin,
  searchProductsCache,
  upsertCustomerCache,
  getCustomerCacheById,
  searchCustomersCache,
  upsertSupplierCache,
  getSupplierCacheById,
  searchSuppliersCache,
  upsertReferenceBatch
} = require('../../offline-db');

const {
  withTempDir
} = require('../helpers/temp-dir');

test('repository de produtos preserva upsert, lookup exato e busca', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });

      const inserted = upsertProductCache({
        empresaId: 'empresa-d05',
        produtoId: 'produto-1',
        codigo: 'COD-001',
        gtin: '7890000000011',
        descricao: 'Produto Referência',
        unidade: 'UN',
        precoCentavos: 1299,
        ativo: true,
        revision: 'rev-product-1',
        sourceUpdatedAt: '2026-09-27T16:00:00.000Z',
        payload: { ncm: '12345678' }
      });

      assert.equal(
        String(inserted.produto_id),
        'produto-1'
      );

      const byId =
        getProductCacheById(
          'empresa-d05',
          'produto-1'
        );

      assert.equal(byId.codigo, 'COD-001');
      assert.equal(byId.precoCentavos, 1299);
      assert.deepEqual(
        byId.payload,
        { ncm: '12345678' }
      );

      assert.equal(
        findProductCacheByCodeOrGtin(
          'empresa-d05',
          '7890000000011'
        ).produtoId,
        'produto-1'
      );

      const matches = searchProductsCache({
        empresaId: 'empresa-d05',
        term: 'referência'
      });

      assert.equal(matches.length, 1);
      assert.equal(matches[0].produtoId, 'produto-1');
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-d05-products-');
});

test('repositories de clientes e fornecedores preservam filtros e mapping', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });

      upsertCustomerCache({
        empresaId: 'empresa-d05',
        clienteId: 'cliente-1',
        nome: 'Cliente Referência',
        documento: '11122233344',
        telefone: '91999990000',
        email: 'cliente@example.invalid',
        ativo: true,
        revision: 'rev-customer-1',
        payload: { origem: 'd05' }
      });

      upsertSupplierCache({
        empresaId: 'empresa-d05',
        fornecedorId: 'fornecedor-1',
        nome: 'Fornecedor Referência',
        documento: '12345678000195',
        telefone: '91988880000',
        email: 'fornecedor@example.invalid',
        ativo: true,
        revision: 'rev-supplier-1',
        payload: { origem: 'd05' }
      });

      const customer =
        getCustomerCacheById(
          'empresa-d05',
          'cliente-1'
        );
      const supplier =
        getSupplierCacheById(
          'empresa-d05',
          'fornecedor-1'
        );

      assert.equal(customer.nome, 'Cliente Referência');
      assert.equal(customer.documento, '11122233344');
      assert.deepEqual(
        customer.payload,
        { origem: 'd05' }
      );

      assert.equal(
        supplier.nome,
        'Fornecedor Referência'
      );
      assert.equal(
        supplier.documento,
        '12345678000195'
      );
      assert.deepEqual(
        supplier.payload,
        { origem: 'd05' }
      );

      assert.equal(
        searchCustomersCache({
          empresaId: 'empresa-d05',
          term: '111222'
        }).length,
        1
      );
      assert.equal(
        searchSuppliersCache({
          empresaId: 'empresa-d05',
          term: 'Fornecedor'
        }).length,
        1
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-d05-parties-');
});

test('upsertReferenceBatch continua orquestrando repositories no mesmo contrato', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });

      const result = upsertReferenceBatch({
        empresaId: 'empresa-d05',
        products: [{
          produtoId: 'produto-batch',
          codigo: 'BATCH-1',
          descricao: 'Produto Batch',
          ativo: true
        }],
        customers: [{
          clienteId: 'cliente-batch',
          nome: 'Cliente Batch',
          ativo: true
        }],
        suppliers: [{
          fornecedorId: 'fornecedor-batch',
          nome: 'Fornecedor Batch',
          ativo: true
        }]
      });

      assert.deepEqual(result, {
        empresaId: 'empresa-d05',
        products: 1,
        customers: 1,
        suppliers: 1,
        crediarios: 0,
        fiscalProfile: false
      });

      assert.equal(
        getProductCacheById(
          'empresa-d05',
          'produto-batch'
        ).descricao,
        'Produto Batch'
      );
      assert.equal(
        getCustomerCacheById(
          'empresa-d05',
          'cliente-batch'
        ).nome,
        'Cliente Batch'
      );
      assert.equal(
        getSupplierCacheById(
          'empresa-d05',
          'fornecedor-batch'
        ).nome,
        'Fornecedor Batch'
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-d05-batch-');
});

test('upsertReferenceBatch mantém rollback atômico através dos repositories D05', async () => {
  await withTempDir(async (userDataDir) => {
    try {
      initializeOfflineDatabase({ userDataDir });

      assert.throws(
        () => upsertReferenceBatch({
          empresaId: 'empresa-d05',
          products: [{
            produtoId: 'produto-rollback',
            descricao: 'Produto Rollback',
            ativo: true
          }],
          suppliers: [{
            fornecedorId: 'fornecedor-invalido',
            nome: ''
          }]
        }),
        /nome é obrigatório/
      );

      assert.equal(
        getProductCacheById(
          'empresa-d05',
          'produto-rollback'
        ),
        null
      );
    } finally {
      closeOfflineDatabase();
    }
  }, 'efisco-d05-rollback-');
});
