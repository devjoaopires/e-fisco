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

function loadSuppliersDomain(
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
      'offline-ui/pdv/domains/suppliers/domain.js'
    ),
    context,
    {
      filename:
        'offline-ui/pdv/domains/suppliers/domain.js'
    }
  );

  return {
    windowRef,
    domain:
      windowRef.__scfPdvDomains.suppliers
  };
}

test('P08 suppliers/coordinator permanece estavel apos P18', () => {
  const pdv =
    read('offline-ui/pdv.html');

  const sources = [
    '/pdv/domains/suppliers/registration-ui.js',
    '/pdv/domains/suppliers/domain.js',
    '/pdv/domains/suppliers/crud.js',
    '/pdv/domains/suppliers/coordinator.js'
  ];

  for (const source of sources) {
    assert.equal(
      pdv.split(source).length - 1,
      1,
      source
    );
  }

  assert.ok(
    pdv.indexOf(
      '/pdv/domains/suppliers/registration-ui.js'
    ) <
      pdv.indexOf(
        '/pdv/domains/customer/domain.js'
      )
  );

  assert.ok(
    pdv.indexOf(
      '/pdv/domains/suppliers/domain.js'
    ) <
      pdv.indexOf(
        '/pdv/domains/suppliers/crud.js'
      )
  );

  assert.ok(
    pdv.indexOf(
      '/pdv/domains/suppliers/crud.js'
    ) <
      pdv.indexOf(
        '/pdv/domains/suppliers/coordinator.js'
      )
  );

  for (const id of [
    'scf-cadastro-cliente-card-principal-final-script',
    'scf-cadastro-fornecedor-crud-final-script',
    'scf-cadastro-cliente-fornecedor-coordenador-final'
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

test('P08 suppliers domain mantem editing legacy necessario e remove cache global sem consumidor', () => {
  const {
    windowRef,
    domain
  } = loadSuppliersDomain({
    __scfFornecedorEdicaoId:
      'legacy-edit'
  });

  assert.equal(
    domain.getEditingId(),
    'legacy-edit'
  );
  assert.deepEqual(
    Array.from(
      domain.getSuppliers()
    ),
    []
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      windowRef,
      '__scfFornecedoresCadastroCache'
    ),
    false
  );

  windowRef.__scfFornecedorEdicaoId =
    'supplier-2';

  assert.equal(
    domain.editingId,
    'supplier-2'
  );

  domain.editingId =
    'supplier-3';

  assert.equal(
    windowRef.__scfFornecedorEdicaoId,
    'supplier-3'
  );

  const nextSuppliers = [
    {
      fornecedorId: 's1',
      nome: 'A'
    },
    {
      _id: 's2',
      nome: 'B'
    }
  ];

  domain.suppliers =
    nextSuppliers;

  assert.equal(
    domain.suppliers,
    nextSuppliers
  );
  assert.equal(
    domain.findSupplierById('s2').nome,
    'B'
  );

  domain.removeSupplierById('s1');

  assert.deepEqual(
    Array.from(
      domain.suppliers,
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
      supplierCount:
        snapshot.supplierCount
    },
    {
      editingId: 'supplier-3',
      supplierCount: 1
    }
  );
});

test('P08 CRUD usa owners supplier/customer e preserva protocolos sem segundo cache privado', () => {
  const crud =
    read(
      'offline-ui/pdv/domains/suppliers/crud.js'
    );

  assert.match(
    crud,
    /supplierDomain/
  );
  assert.match(
    crud,
    /customerDomain/
  );

  for (const legacy of [
    'window.__scfFornecedorEdicaoId',
    'window.__scfFornecedoresCadastroCache',
    'window.__scfClienteEdicaoId'
  ]) {
    assert.equal(
      crud.includes(legacy),
      false,
      legacy
    );
  }

  assert.doesNotMatch(
    crud,
    /\blet\s+fornecedoresCms\b/
  );
  assert.doesNotMatch(
    crud,
    /\blet\s+fornecedorSelecionadoId\b/
  );
  assert.doesNotMatch(
    crud,
    /\blocalStorage\b|\bsessionStorage\b/
  );
  assert.doesNotMatch(
    crud,
    /(?<![.\w])fetch\s*\(/
  );

  for (const protocol of [
    'SCF_FORNECEDORES_LISTAR',
    'SCF_FORNECEDORES_LISTA_RESULTADO',
    'SCF_FORNECEDORES_LISTA_ERRO',
    'SCF_FORNECEDOR_CADASTRAR',
    'SCF_FORNECEDOR_CADASTRADO',
    'SCF_FORNECEDOR_CADASTRO_ERRO',
    'SCF_FORNECEDOR_EXCLUIR',
    'SCF_FORNECEDOR_EXCLUIDO',
    'SCF_FORNECEDOR_EXCLUSAO_ERRO'
  ]) {
    assert.equal(
      crud.includes(protocol),
      true,
      protocol
    );
  }

  assert.equal(
    crud.includes(
      'scf:cadastrar-opcao'
    ),
    true
  );

  for (const delay of [
    '0',
    '100',
    '500'
  ]) {
    assert.equal(
      crud.includes(delay),
      true,
      delay
    );
  }
});

test('P08 coordinator externaliza UI compartilhada e fecha transicoes cliente/fornecedor sem globals canonicos', () => {
  const registrationUi =
    read(
      'offline-ui/pdv/domains/suppliers/registration-ui.js'
    );

  const coordinator =
    read(
      'offline-ui/pdv/domains/suppliers/coordinator.js'
    );

  for (const source of [
    registrationUi,
    coordinator
  ]) {
    assert.doesNotMatch(
      source,
      /\blocalStorage\b|\bsessionStorage\b/
    );
    assert.doesNotMatch(
      source,
      /(?<![.\w])fetch\s*\(/
    );
  }

  for (const protocol of [
    'SCF_MENU_SELECIONAR_CADASTRAR',
    'SCF_MENU_SELECIONAR_CENTRAL',
    'SCF_FISCAL_HOME_ABRIR',
    'SCF_HISTORICO_VENDAS_ABRIR',
    'SCF_MENU_SELECIONAR_ESTOQUE'
  ]) {
    assert.equal(
      registrationUi.includes(protocol) ||
        coordinator.includes(protocol),
      true,
      protocol
    );
  }

  for (const eventName of [
    'scf:cadastrar-opcao',
    'scf:fechar-cadastro-colaborador'
  ]) {
    assert.equal(
      registrationUi.includes(eventName) ||
        coordinator.includes(eventName),
      true,
      eventName
    );
  }

  assert.match(
    coordinator,
    /supplierDomain/
  );
  assert.match(
    coordinator,
    /customerDomain/
  );
  assert.doesNotMatch(
    coordinator,
    /window\.__scfFornecedorEdicaoId/
  );
  assert.doesNotMatch(
    coordinator,
    /window\.__scfClienteEdicaoId/
  );

  assert.equal(
    registrationUi.includes(
      '[0, 80, 220]'
    ),
    true
  );
  assert.equal(
    coordinator.includes(
      '[0, 80, 220]'
    ),
    true
  );
});
