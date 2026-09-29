(function (global) {
  'use strict';

  var domains =
    global.__scfPdvDomains ||
    (global.__scfPdvDomains = {});

  var state = {
    editingId: '',
    suppliers: []
  };

  function normalizeEditingId(value) {
    return String(
      value == null
        ? ''
        : value
    ).trim();
  }

  function normalizeSuppliers(value) {
    return Array.isArray(value)
      ? value
      : [];
  }

  function supplierId(supplier) {
    return String(
      supplier &&
      (
        supplier.fornecedorId ||
        supplier._id
      ) ||
      ''
    );
  }

  function getEditingId() {
    return state.editingId;
  }

  function setEditingId(value) {
    state.editingId =
      normalizeEditingId(value);
    return state.editingId;
  }

  function getSuppliers() {
    return state.suppliers;
  }

  function setSuppliers(value) {
    state.suppliers =
      normalizeSuppliers(value);
    return state.suppliers;
  }

  function findSupplierById(value) {
    var id =
      normalizeEditingId(value);

    if(!id) {
      return null;
    }

    return (
      state.suppliers.find(
        function(supplier) {
          return (
            supplierId(supplier) === id
          );
        }
      ) ||
      null
    );
  }

  function removeSupplierById(value) {
    var id =
      normalizeEditingId(value);

    if(!id) {
      return state.suppliers;
    }

    state.suppliers =
      state.suppliers.filter(
        function(supplier) {
          return (
            supplierId(supplier) !== id
          );
        }
      );

    return state.suppliers;
  }

  var previousEditingId =
    global.__scfFornecedorEdicaoId;


  if(previousEditingId != null) {
    setEditingId(previousEditingId);
  }


  Object.defineProperty(
    global,
    '__scfFornecedorEdicaoId',
    {
      configurable: true,
      enumerable: true,
      get: getEditingId,
      set: setEditingId
    }
  );


  var api = {
    getEditingId: getEditingId,
    setEditingId: setEditingId,
    getSuppliers: getSuppliers,
    setSuppliers: setSuppliers,
    findSupplierById: findSupplierById,
    removeSupplierById:
      removeSupplierById,
    snapshot: function() {
      return Object.freeze({
        editingId:
          state.editingId,
        supplierCount:
          state.suppliers.length
      });
    }
  };

  Object.defineProperty(
    api,
    'editingId',
    {
      enumerable: true,
      get: getEditingId,
      set: setEditingId
    }
  );

  Object.defineProperty(
    api,
    'suppliers',
    {
      enumerable: true,
      get: getSuppliers,
      set: setSuppliers
    }
  );

  domains.suppliers =
    Object.freeze(api);
})(window);
