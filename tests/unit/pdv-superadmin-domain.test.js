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

function loadSuperadminDomain(initial = {}) {
  let listener = null;

  const windowRef = {
    ...initial,
    __scfPdvInfra: {
      shellBridge: {
        onMessage(fn) {
          listener = fn;
        }
      }
    }
  };

  const context =
    vm.createContext({
      window: windowRef
    });

  vm.runInContext(
    read(
      'offline-ui/pdv/domains/superadmin/domain.js'
    ),
    context,
    {
      filename:
        'offline-ui/pdv/domains/superadmin/domain.js'
    }
  );

  return {
    windowRef,
    domain:
      windowRef.__scfPdvDomains.superadmin,
    dispatch(data) {
      assert.equal(
        typeof listener,
        'function'
      );

      listener({
        data
      });
    }
  };
}

test('P17 superadmin/company/A1 permanece estavel apos P18 printing', () => {
  const pdv =
    read('offline-ui/pdv.html');

  const files = [
    'domain.js',
    'customer-shell.js',
    'company-form.js',
    'fiscal-certificate-selector.js',
    'contact-fields.js',
    'company-fiscal-tabs.js',
    'certificate-a1.js',
    'companies-panel.js',
    'company-edit.js',
    'primary-action.js',
    'form-state.js',
    'company-details.js',
    'details-cleanup.js',
    'residual-arrow-cleanup.js'
  ];

  for (const file of files) {
    const source =
      '/pdv/domains/superadmin/' +
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
          'offline-ui/pdv/domains/superadmin',
          file
        )
      ),
      true,
      file
    );
  }

  assert.ok(
    pdv.indexOf(
      '/pdv/domains/superadmin/domain.js'
    ) <
      pdv.indexOf(
        '/pdv/domains/superadmin/customer-shell.js'
      )
  );

  assert.match(
    pdv,
    /<script id="scf-superadmin-menu-labels-final-script">/
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/printing\/domain\.js/
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/printing\/frame-controller\.js/
  );
});

test('P17 superadmin domain e owner unico do modo e registry apos cleanup dos globals', () => {
  const {
    windowRef,
    domain,
    dispatch
  } = loadSuperadminDomain();

  assert.equal(
    domain.active,
    false
  );

  dispatch({
    type:
      'SCF_SUPERADMIN_READY'
  });

  assert.equal(
    domain.active,
    true
  );

  dispatch({
    type:
      'SCF_WIX_READY'
  });

  assert.equal(
    domain.active,
    false
  );

  const clear = () => 'clear';

  domain.actions.clearCompanyForm =
    clear;

  assert.equal(
    domain.actions.clearCompanyForm,
    clear
  );

  const request = () => 'request';

  domain.actions.requestCompanies =
    request;

  assert.equal(
    domain.actions.requestCompanies,
    request
  );

  for (const name of [
    '__scfSuperAdminA1AposCadastroSucesso',
    '__scfSuperAdminLimparFormularioEmpresa',
    '__scfSuperAdminSolicitarEmpresas',
    '__scfSuperAdminTituloPainelAtual',
    '__scfSuperAdminResetarModoAtualizacao',
    '__scfSuperAdminFecharEdicaoSemSalvar',
    '__scfSuperAdminSairDetalhesVisual'
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

  const snapshot =
    domain.snapshot();

  assert.equal(
    snapshot.registeredActions.clearCompanyForm,
    true
  );
  assert.equal(
    snapshot.registeredActions.requestCompanies,
    true
  );
});

test('P17 company form e certificado A1 usam owner e preservam protocolos', () => {
  const form =
    read(
      'offline-ui/pdv/domains/superadmin/company-form.js'
    );
  const a1 =
    read(
      'offline-ui/pdv/domains/superadmin/certificate-a1.js'
    );

  assert.match(
    form,
    /superadminDomain\.active/
  );
  assert.match(
    form,
    /superadminDomain\.actions\.afterCompanySuccess/
  );
  assert.match(
    form,
    /superadminDomain\.actions\.clearCompanyForm/
  );

  for (const protocol of [
    'SCF_SUPERADMIN_EMPRESA_CNPJ_CONSULTAR',
    'SCF_SUPERADMIN_EMPRESA_CNPJ_RESULTADO',
    'SCF_SUPERADMIN_EMPRESA_CNPJ_ERRO',
    'SCF_SUPERADMIN_EMPRESA_CADASTRAR',
    'SCF_SUPERADMIN_EMPRESA_CADASTRO_RESULTADO',
    'SCF_SUPERADMIN_EMPRESA_CADASTRO_ERRO'
  ]) {
    assert.equal(
      form.includes(protocol),
      true,
      protocol
    );
  }

  for (const protocol of [
    'SCF_SUPERADMIN_CERTIFICADO_A1_ENVIAR',
    'SCF_SUPERADMIN_CERTIFICADO_A1_RESULTADO',
    'SCF_SUPERADMIN_CERTIFICADO_A1_ERRO'
  ]) {
    assert.equal(
      a1.includes(protocol),
      true,
      protocol
    );
  }

  assert.match(
    a1,
    /superadminDomain\.actions\.afterCompanySuccess/
  );
  assert.match(
    a1,
    /superadminDomain\.actions\.clearCompanyForm/
  );

  for (const source of [
    form,
    a1
  ]) {
    assert.doesNotMatch(
      source,
      /window\.__scfSuperAdmin/
    );
    assert.doesNotMatch(
      source,
      /(?<![.\w])fetch\s*\(/
    );
    assert.doesNotMatch(
      source,
      /\blocalStorage\b|\bsessionStorage\b/
    );
  }
});

test('P17 painel/edicao/form-state/detalhes compartilham actions do owner sem globals canonicos', () => {
  const sources = [
    read(
      'offline-ui/pdv/domains/superadmin/companies-panel.js'
    ),
    read(
      'offline-ui/pdv/domains/superadmin/company-edit.js'
    ),
    read(
      'offline-ui/pdv/domains/superadmin/primary-action.js'
    ),
    read(
      'offline-ui/pdv/domains/superadmin/form-state.js'
    ),
    read(
      'offline-ui/pdv/domains/superadmin/company-details.js'
    )
  ];

  const joined =
    sources.join('\n');

  for (const action of [
    'requestCompanies',
    'currentPanelTitle',
    'resetUpdateMode',
    'closeEditWithoutSaving',
    'leaveDetailsView',
    'clearCompanyForm',
    'afterCompanySuccess'
  ]) {
    assert.equal(
      joined.includes(
        'superadminDomain.actions.' +
          action
      ),
      true,
      action
    );
  }

  for (const protocol of [
    'SCF_SUPERADMIN_EMPRESAS_LISTAR',
    'SCF_SUPERADMIN_EMPRESAS_RESULTADO',
    'SCF_SUPERADMIN_EMPRESAS_ERRO',
    'SCF_SUPERADMIN_EMPRESA_ATUALIZAR',
    'SCF_SUPERADMIN_EMPRESA_ATUALIZACAO_RESULTADO',
    'SCF_SUPERADMIN_EMPRESA_ATUALIZACAO_ERRO',
    'SCF_SUPERADMIN_READY',
    'SCF_WIX_READY'
  ]) {
    assert.equal(
      joined.includes(protocol),
      true,
      protocol
    );
  }

  assert.doesNotMatch(
    joined,
    /window\.__scfSuperAdmin/
  );
});

test('P17 preserva menu/eventos apos consolidacao de printing P18', () => {
  const pdv =
    read('offline-ui/pdv.html');
  const shell =
    read(
      'offline-ui/pdv/domains/superadmin/customer-shell.js'
    );

  assert.match(
    pdv,
    /SCF_SUPERADMIN_MENU_MODO/
  );
  assert.match(
    shell,
    /SCF_SUPERADMIN_READY/
  );
  assert.match(
    shell,
    /SCF_WIX_READY/
  );
  assert.match(
    shell,
    /scf:cadastrar-opcao/
  );
  assert.match(
    shell,
    /scf:superadmin-garantir-cadastro-cliente/
  );
  assert.match(
    shell,
    /\[0, 80, 220, 500, 900\]/
  );

  assert.match(
    pdv,
    /id="scf-nfce-console-frame-v5-final" src="\/pdv\/domains\/printing\/frame-controller\.js"/
  );

  for (const removedId of [
    'scf-nfce-impressao-automatica-80mm-script-final',
    'scf-nfce-electron-silent-print-bridge-final',
    'scf-nfce-escpos-direto-final'
  ]) {
    assert.equal(
      pdv.includes(removedId),
      false,
      removedId
    );
  }

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
