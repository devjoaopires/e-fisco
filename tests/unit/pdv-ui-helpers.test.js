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
    path.join(ROOT, relativePath),
    'utf8'
  );
}

function runFiles(
  windowRef,
  files
) {
  const context =
    vm.createContext({
      window: windowRef
    });

  for (const file of files) {
    vm.runInContext(
      read(file),
      context,
      {
        filename: file
      }
    );
  }

  return windowRef;
}

test('P05 shared values/helpers preserva CNPJ, ambiente fiscal e normalização de perfil', () => {
  const windowRef =
    runFiles(
      {},
      [
        'offline-ui/pdv/shared/values/ui-values.js',
        'offline-ui/pdv/shared/helpers/text-format.js'
      ]
    );

  const shared =
    windowRef.__scfPdvShared;

  assert.ok(shared);
  assert.equal(
    shared.helpers.text(
      '  TESTE  '
    ),
    'TESTE'
  );
  assert.equal(
    shared.helpers.digits(
      '12.345-6'
    ),
    '123456'
  );
  assert.equal(
    shared.helpers.formatCnpj(
      '12345678000195'
    ),
    '12.345.678/0001-95'
  );
  assert.equal(
    shared.helpers.formatCnpj(
      '123'
    ),
    '123'
  );
  assert.equal(
    shared.helpers
      .formatFiscalEnvironment(
        'produção'
      ),
    'PRODUÇÃO'
  );
  assert.equal(
    shared.helpers
      .formatFiscalEnvironment(
        'HML'
      ),
    'HOMOLOGAÇÃO'
  );
  assert.equal(
    shared.helpers
      .formatFiscalEnvironment(
        'desconhecido'
      ),
    ''
  );
  assert.equal(
    shared.helpers
      .normalizeProfile(
        '  supervisor  '
      ),
    'SUPERVISOR'
  );

  assert.equal(
    shared.values.connectivity
      .probeTimeoutMs,
    5000
  );
  assert.equal(
    shared.values.connectivity
      .pollIntervalMs,
    30000
  );
  assert.equal(
    shared.values.connectivity
      .probeBaseUrl,
    'https://www.gstatic.com/generate_204?scf_online='
  );
});

test('P05 company-header usa helpers compartilhados e preserva protocolo SCF', () => {
  const nodes = {
    scfCompanyHeaderRazaoSocial: {
      textContent: ''
    },
    scfCompanyHeaderCnpj: {
      textContent: ''
    }
  };

  let messageListener = null;
  const posted = [];

  const windowRef = {};

  runFiles(
    windowRef,
    [
      'offline-ui/pdv/shared/values/ui-values.js',
      'offline-ui/pdv/shared/helpers/text-format.js'
    ]
  );

  windowRef.__scfPdvInfra = {
    dom: {
      byId(id) {
        return nodes[id] || null;
      }
    },
    shellBridge: {
      post(message, origin) {
        posted.push({
          message,
          origin
        });
      },
      onMessage(listener) {
        messageListener =
          listener;
      }
    }
  };

  windowRef.addEventListener =
    function (
      name,
      listener
    ) {
      if (name === 'load') {
        listener();
      }
    };

  const context =
    vm.createContext({
      window: windowRef,
      document: {
        readyState: 'complete'
      }
    });

  vm.runInContext(
    read(
      'offline-ui/pdv/ui/components/company-header.js'
    ),
    context
  );

  assert.deepEqual(
    JSON.parse(
      JSON.stringify(posted)
    ),
    [
      {
        message: {
          type:
            'SCF_EMPRESA_CABECALHO_SOLICITAR'
        },
        origin: '*'
      }
    ]
  );

  assert.equal(
    typeof messageListener,
    'function'
  );

  messageListener({
    data: {
      type:
        'SCF_EMPRESA_CABECALHO_RESULTADO',
      empresa: {
        razaoSocial:
          'Empresa P05',
        cnpj:
          '12345678000195',
        ambiente:
          'HOMOLOGACAO'
      }
    }
  });

  assert.equal(
    nodes
      .scfCompanyHeaderRazaoSocial
      .textContent,
    'Empresa P05'
  );
  assert.equal(
    nodes
      .scfCompanyHeaderCnpj
      .textContent,
    'CNPJ: 12.345.678/0001-95 - HOMOLOGAÇÃO'
  );
});

test('P05 componentes novos usam state/infra/shared e não reintroduzem globals como fonte canônica', () => {
  const connectivity =
    read(
      'offline-ui/pdv/ui/components/connectivity-indicator.js'
    );
  const access =
    read(
      'offline-ui/pdv/ui/navigation/access-guard.js'
    );
  const company =
    read(
      'offline-ui/pdv/ui/components/company-header.js'
    );

  assert.match(
    connectivity,
    /__scfPdvState\.runtime/
  );
  assert.match(
    connectivity,
    /__scfPdvShared[\s\S]*values\.connectivity/
  );
  assert.doesNotMatch(
    connectivity,
    /window\.__scfSistemaOnlineAtual\s*=/
  );
  assert.doesNotMatch(
    connectivity,
    /window\.__scfStatusConexaoInternetReady\s*=/
  );

  assert.match(
    access,
    /__scfPdvState\.session/
  );
  assert.match(
    access,
    /helpers\.normalizeProfile/
  );
  assert.doesNotMatch(
    access,
    /window\.__scfPerfilSessao/
  );
  assert.doesNotMatch(
    access,
    /window\.__scfAcessoSomentePdv/
  );

  assert.match(
    company,
    /helpers\.formatCnpj/
  );
  assert.match(
    company,
    /helpers\.formatFiscalEnvironment/
  );
});

test('P05 externaliza UI/CSS no mesmo ponto físico e remove blocos inline migrados', () => {
  const pdv =
    read('offline-ui/pdv.html');

  for (const source of [
    '/pdv/ui/components/company-header.js',
    '/pdv/ui/components/connectivity-indicator.js',
    '/pdv/ui/navigation/access-guard.js'
  ]) {
    assert.equal(
      pdv.includes(
        '<script src="' +
          source +
          '"></script>'
      ),
      true,
      source
    );
  }

  for (const href of [
    '/pdv/styles/base/layout-settle.css',
    '/pdv/styles/components/header-status.css',
    '/pdv/styles/components/access-menu.css'
  ]) {
    assert.equal(
      pdv.includes(
        '<link rel="stylesheet" href="' +
          href +
          '"/>'
      ),
      true,
      href
    );
  }

  for (const removedId of [
    'scf-layout-settle-style',
    'scf-identificacao-empresa-topo-final',
    'scf-status-conexao-topo-final',
    'scf-identificacao-empresa-topo-script-final',
    'scf-status-conexao-internet-final',
    'scf-perfis-acesso-menu-style',
    'scf-perfis-acesso-menu-script'
  ]) {
    assert.equal(
      pdv.includes(removedId),
      false,
      removedId
    );
  }

  assert.match(
    read(
      'offline-ui/pdv/styles/base/layout-settle.css'
    ),
    /html\.scf-layout-settling/
  );
  assert.match(
    read(
      'offline-ui/pdv/styles/components/header-status.css'
    ),
    /#scfCompanyHeaderInfo/
  );
  assert.match(
    read(
      'offline-ui/pdv/styles/components/header-status.css'
    ),
    /#scfSystemConnectivity/
  );
  assert.match(
    read(
      'offline-ui/pdv/styles/components/access-menu.css'
    ),
    /scf-acesso-pdv-restrito/
  );
});

test('P05 assets permanecem estaveis com P06-P18 materializados', () => {
  for (const relativePath of [
    'offline-ui/pdv/shared/values/ui-values.js',
    'offline-ui/pdv/shared/helpers/text-format.js',
    'offline-ui/pdv/ui/components/company-header.js',
    'offline-ui/pdv/ui/components/connectivity-indicator.js',
    'offline-ui/pdv/ui/navigation/access-guard.js',
    'offline-ui/pdv/styles/base/layout-settle.css',
    'offline-ui/pdv/styles/components/header-status.css',
    'offline-ui/pdv/styles/components/access-menu.css'
  ]) {
    assert.equal(
      fs.existsSync(
        path.join(
          ROOT,
          relativePath
        )
      ),
      true,
      relativePath
    );
  }

  const domainsRoot =
    path.join(
      ROOT,
      'offline-ui/pdv/domains'
    );

  assert.equal(
    fs.existsSync(domainsRoot),
    true
  );

  assert.deepEqual(
    fs.readdirSync(
      domainsRoot,
      {
        withFileTypes: true
      }
    )
      .filter((entry) =>
        entry.isDirectory()
      )
      .map((entry) => entry.name)
      .sort(),
    ['cash', 'continuity', 'crediario', 'customer', 'finance', 'fiscal', 'history', 'inventory', 'printing', 'products', 'sale-payment', 'superadmin', 'suppliers']
  );

  assert.equal(
    fs.existsSync(
      path.join(
        ROOT,
        'offline-ui/pdv/styles/domains'
      )
    ),
    false
  );

  const pdv =
    read('offline-ui/pdv.html');

  assert.doesNotMatch(
    pdv,
    /<script[^>]+\btype\s*=\s*["']module["']/i
  );
});
