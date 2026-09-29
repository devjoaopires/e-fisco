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

function loadCustomerDomain(
  initial = {}
) {
  const windowRef = {
    ...initial
  };

  const context =
    vm.createContext({
      window: windowRef
    });

  vm.runInContext(
    read(
      'offline-ui/pdv/domains/customer/domain.js'
    ),
    context,
    {
      filename:
        'offline-ui/pdv/domains/customer/domain.js'
    }
  );

  return {
    windowRef,
    domain:
      windowRef.__scfPdvDomains.customer
  };
}

test('P07 customer CRUD permanece estavel apos P18', () => {
  const pdv =
    read('offline-ui/pdv.html');

  const sources = [
    '/pdv/domains/customer/domain.js',
    '/pdv/domains/customer/create-update.js',
    '/pdv/domains/customer/list.js',
    '/pdv/domains/customer/edit.js',
    '/pdv/domains/customer/delete.js'
  ];

  for (const source of sources) {
    assert.equal(
      pdv.split(source).length - 1,
      1,
      source
    );
  }

  const positions =
    sources.map(
      (source) =>
        pdv.indexOf(source)
    );

  assert.ok(
    positions.every(
      (value) => value >= 0
    )
  );

  for (
    let index = 1;
    index < positions.length;
    index += 1
  ) {
    assert.ok(
      positions[index] >
        positions[index - 1]
    );
  }

  for (const id of [
    'scf-cadastro-cliente-envio-backend-final-script',
    'scf-clientes-listagem-cms-final-script',
    'scf-clientes-clique-edicao-formulario-final-script',
    'scf-cliente-excluir-atualizar-vermelho-final-script'
  ]) {
    assert.doesNotMatch(
      pdv,
      new RegExp(
        '<script id="' +
        id +
        '">\\s*\\n'
      )
    );
  }

  assert.match(
    pdv,
    /\/pdv\/domains\/suppliers\/domain\.js/
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/history\/domain\.js/
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

test('P07 customer domain mantem editing legacy necessario e remove cache global sem consumidor', () => {
  const {
    windowRef,
    domain
  } = loadCustomerDomain({
    __scfClienteEdicaoId:
      'legacy-edit'
  });

  assert.equal(
    domain.getEditingId(),
    'legacy-edit'
  );
  assert.deepEqual(
    Array.from(
      domain.getCustomers()
    ),
    []
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      windowRef,
      '__scfClientesCadastroCache'
    ),
    false
  );

  windowRef.__scfClienteEdicaoId =
    'customer-2';

  assert.equal(
    domain.editingId,
    'customer-2'
  );

  domain.editingId =
    'customer-3';

  assert.equal(
    windowRef.__scfClienteEdicaoId,
    'customer-3'
  );

  const nextCustomers = [
    {
      clienteId: 'c1',
      nome: 'A'
    },
    {
      _id: 'c2',
      nome: 'B'
    }
  ];

  domain.customers =
    nextCustomers;

  assert.equal(
    domain.customers,
    nextCustomers
  );
  assert.equal(
    domain.findCustomerById('c2').nome,
    'B'
  );

  domain.removeCustomerById('c1');

  assert.deepEqual(
    Array.from(
      domain.customers,
      (item) => item.nome
    ),
    ['B']
  );

  const snapshot =
    domain.snapshot();

  assert.deepEqual(
    {
      editingId:
        snapshot.editingId,
      customerCount:
        snapshot.customerCount
    },
    {
      editingId: 'customer-3',
      customerCount: 1
    }
  );
});

test('P07 controllers consomem owner customer diretamente e preservam protocolos observados', () => {
  const files = [
    'offline-ui/pdv/domains/customer/create-update.js',
    'offline-ui/pdv/domains/customer/list.js',
    'offline-ui/pdv/domains/customer/edit.js',
    'offline-ui/pdv/domains/customer/delete.js'
  ];

  const sources =
    files.map(read);

  const combined =
    sources.join('\n');

  for (const source of sources) {
    assert.match(
      source,
      /customerDomain/
    );
    assert.doesNotMatch(
      source,
      /window\.__scfClienteEdicaoId/
    );
    assert.doesNotMatch(
      source,
      /window\.__scfClientesCadastroCache/
    );
    assert.doesNotMatch(
      source,
      /\blocalStorage\b|\bsessionStorage\b/
    );
    assert.doesNotMatch(
      source,
      /(?<![.\w])fetch\s*\(/
    );
  }

  assert.doesNotMatch(
    read(
      'offline-ui/pdv/domains/customer/list.js'
    ),
    /\bclientesCms\b/
  );

  for (const protocol of [
    'SCF_CLIENTE_CADASTRAR',
    'SCF_CLIENTE_CADASTRADO',
    'SCF_CLIENTE_CADASTRO_ERRO',
    'SCF_CLIENTES_LISTAR',
    'SCF_CLIENTES_LISTA_RESULTADO',
    'SCF_CLIENTES_LISTA_ERRO',
    'SCF_CLIENTE_EXCLUIR',
    'SCF_CLIENTE_EXCLUIDO',
    'SCF_CLIENTE_EXCLUSAO_ERRO'
  ]) {
    assert.equal(
      combined.includes(protocol),
      true,
      protocol
    );
  }

  assert.equal(
    combined.includes(
      'scf:cadastrar-opcao'
    ),
    true
  );

  assert.equal(
    combined.includes(
      'scf-supplier-registration-open'
    ),
    true
  );
});

test('P07 carrega owner antes de qualquer uso legado remanescente no monolito', () => {
  const pdv =
    read('offline-ui/pdv.html');

  const ownerPosition =
    pdv.indexOf(
      '/pdv/domains/customer/domain.js'
    );

  assert.ok(
    ownerPosition >= 0
  );

  for (const legacyName of [
    '__scfClienteEdicaoId'
  ]) {
    const legacyPosition =
      pdv.indexOf(
        legacyName
      );

    assert.ok(
      legacyPosition < 0 ||
      ownerPosition < legacyPosition,
      legacyName
    );
  }

  const domain =
    read(
      'offline-ui/pdv/domains/customer/domain.js'
    );

  assert.match(
    domain,
    /Object\.defineProperty\(\s*global,\s*'__scfClienteEdicaoId'/
  );
  assert.doesNotMatch(
    domain,
    /__scfClientesCadastroCache/
  );
});
