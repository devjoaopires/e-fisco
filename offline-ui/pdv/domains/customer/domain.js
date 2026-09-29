(function (global) {
  'use strict';

  var domains =
    global.__scfPdvDomains ||
    (global.__scfPdvDomains = {});

  var state = {
    editingId: '',
    customers: []
  };

  function normalizeEditingId(value) {
    return String(
      value == null
        ? ''
        : value
    ).trim();
  }

  function normalizeCustomers(value) {
    return Array.isArray(value)
      ? value
      : [];
  }

  function customerId(customer) {
    return String(
      customer &&
      (
        customer.clienteId ||
        customer._id
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

  function getCustomers() {
    return state.customers;
  }

  function setCustomers(value) {
    state.customers =
      normalizeCustomers(value);
    return state.customers;
  }

  function findCustomerById(value) {
    var id =
      normalizeEditingId(value);

    if(!id) {
      return null;
    }

    return (
      state.customers.find(
        function(customer) {
          return (
            customerId(customer) === id
          );
        }
      ) ||
      null
    );
  }

  function removeCustomerById(value) {
    var id =
      normalizeEditingId(value);

    if(!id) {
      return state.customers;
    }

    state.customers =
      state.customers.filter(
        function(customer) {
          return (
            customerId(customer) !== id
          );
        }
      );

    return state.customers;
  }

  var previousEditingId =
    global.__scfClienteEdicaoId;


  if(previousEditingId != null) {
    setEditingId(previousEditingId);
  }


  Object.defineProperty(
    global,
    '__scfClienteEdicaoId',
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
    getCustomers: getCustomers,
    setCustomers: setCustomers,
    findCustomerById: findCustomerById,
    removeCustomerById:
      removeCustomerById,
    snapshot: function() {
      return Object.freeze({
        editingId:
          state.editingId,
        customerCount:
          state.customers.length
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
    'customers',
    {
      enumerable: true,
      get: getCustomers,
      set: setCustomers
    }
  );

  domains.customer =
    Object.freeze(api);
})(window);
