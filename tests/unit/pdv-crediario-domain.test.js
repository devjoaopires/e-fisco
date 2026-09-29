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

function loadCrediarioDomain(initial = {}) {
  const windowRef = {
    ...initial
  };

  const context =
    vm.createContext({
      window: windowRef
    });

  vm.runInContext(
    read(
      'offline-ui/pdv/domains/crediario/domain.js'
    ),
    context,
    {
      filename:
        'offline-ui/pdv/domains/crediario/domain.js'
    }
  );

  return {
    windowRef,
    domain:
      windowRef.__scfPdvDomains.crediario
  };
}

test('P13 crediario permanece estavel apos P18 printing', () => {
  const pdv =
    read('offline-ui/pdv.html');

  const files = [
    'domain.js',
    'offline-confirm-visibility.js',
    'core.js',
    'focus-protection.js',
    'back.js',
    'side-menu-lock.js',
    'shortcut-legend.js',
    'list-inputs-lock.js',
    'return-to-pdv.js',
    'detail-pdv-close.js',
    'list-top-back.js',
    'list-keyboard.js'
  ];

  for (const file of files) {
    const source =
      '/pdv/domains/crediario/' +
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
          'offline-ui/pdv/domains/crediario',
          file
        )
      ),
      true,
      file
    );
  }

  assert.ok(
    pdv.indexOf(
      '/pdv/domains/crediario/domain.js'
    ) <
      pdv.indexOf(
        '/pdv/domains/crediario/core.js'
      )
  );

  assert.match(
    pdv,
    /<script id="scf-pdv-tabela-unica-real-script">/
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

test('P13 crediario domain e owner canonico dos flags compartilhados com globals apenas como accessors', () => {
  const {
    windowRef,
    domain
  } = loadCrediarioDomain({
    __scfCrediarioPagamentoAguardandoF1:
      true,
    __scfCrediarioPagamentoFormasAberto:
      false,
    __scfCrediarioPagamentoParcialSelecaoAtiva:
      true,
    __scfCrediarioMenuLateralBloqueado:
      true
  });

  assert.equal(
    domain.paymentAwaitingF1,
    true
  );
  assert.equal(
    domain.paymentMethodsOpen,
    false
  );
  assert.equal(
    domain.paymentPartialSelectionActive,
    true
  );
  assert.equal(
    domain.sideMenuLocked,
    true
  );

  windowRef.__scfCrediarioPagamentoFormasAberto =
    true;

  assert.equal(
    domain.paymentMethodsOpen,
    true
  );

  domain.paymentAwaitingF1 =
    false;

  assert.equal(
    windowRef.__scfCrediarioPagamentoAguardandoF1,
    false
  );

  assert.equal(
    domain.claimGuard(
      'list-keyboard'
    ),
    true
  );
  assert.equal(
    domain.claimGuard(
      'list-keyboard'
    ),
    false
  );

  domain.resetPaymentState();

  assert.equal(
    domain.paymentAwaitingF1,
    false
  );
  assert.equal(
    domain.paymentMethodsOpen,
    false
  );
  assert.equal(
    domain.paymentPartialSelectionActive,
    false
  );
});

test('P13 core consome owners crediario/customer e preserva protocolos/eventos sem storage ou fetch paralelos', () => {
  const source =
    read(
      'offline-ui/pdv/domains/crediario/core.js'
    );

  for (const token of [
    'crediarioDomain.paymentAwaitingF1',
    'crediarioDomain.paymentMethodsOpen',
    'crediarioDomain.paymentPartialSelectionActive',
    'customerDomain.customers'
  ]) {
    assert.equal(
      source.includes(token),
      true,
      token
    );
  }

  for (const protocol of [
    'SCF_CLIENTES_LISTAR',
    'SCF_CLIENTES_LISTA_RESULTADO',
    'SCF_CREDIARIO_LISTAR',
    'SCF_CREDIARIO_LISTA_RESULTADO',
    'SCF_CREDIARIO_LISTA_ERRO',
    'SCF_CREDIARIO_ABRIR',
    'SCF_CREDIARIO_ABERTO',
    'SCF_CREDIARIO_ABERTURA_ERRO',
    'SCF_CREDIARIO_OBTER',
    'SCF_CREDIARIO_DETALHE_RESULTADO',
    'SCF_CREDIARIO_ATUALIZAR_ITENS',
    'SCF_CREDIARIO_ITENS_ATUALIZADOS',
    'SCF_CREDIARIO_CANCELAR',
    'SCF_CREDIARIO_CANCELADO'
  ]) {
    assert.equal(
      source.includes(protocol),
      true,
      protocol
    );
  }

  for (const eventName of [
    'scf:crediario-venda-pronta',
    'scf:crediario-parcial-selecao-alterada',
    'scf:nova-venda-pronta'
  ]) {
    assert.equal(
      source.includes(eventName),
      true,
      eventName
    );
  }

  assert.doesNotMatch(
    source,
    /window\.__scfClientesCadastroCache|window\.__scfCrediarioPagamentoAguardandoF1|window\.__scfCrediarioPagamentoFormasAberto|window\.__scfCrediarioPagamentoParcialSelecaoAtiva/
  );
  assert.doesNotMatch(
    source,
    /\blocalStorage\b|\bsessionStorage\b/
  );
  assert.doesNotMatch(
    source,
    /(?<![.\w])fetch\s*\(/
  );
});

test('P13 controllers auxiliares consomem owner e centralizam guards sem novos globals canonicos', () => {
  const back =
    read(
      'offline-ui/pdv/domains/crediario/back.js'
    );
  const sideMenu =
    read(
      'offline-ui/pdv/domains/crediario/side-menu-lock.js'
    );
  const returnToPdv =
    read(
      'offline-ui/pdv/domains/crediario/return-to-pdv.js'
    );
  const detailClose =
    read(
      'offline-ui/pdv/domains/crediario/detail-pdv-close.js'
    );
  const topBack =
    read(
      'offline-ui/pdv/domains/crediario/list-top-back.js'
    );
  const keyboard =
    read(
      'offline-ui/pdv/domains/crediario/list-keyboard.js'
    );

  assert.match(
    back,
    /crediarioDomain\.paymentAwaitingF1/
  );
  assert.match(
    back,
    /crediarioDomain\.paymentMethodsOpen/
  );
  assert.match(
    sideMenu,
    /crediarioDomain\.sideMenuLocked/
  );
  assert.match(
    detailClose,
    /crediarioDomain\.sideMenuLocked/
  );

  for (const source of [
    returnToPdv,
    detailClose,
    topBack,
    keyboard
  ]) {
    assert.match(
      source,
      /crediarioDomain\.claimGuard/
    );
  }

  const combined =
    [
      back,
      sideMenu,
      returnToPdv,
      detailClose,
      topBack,
      keyboard
    ].join('\n');

  assert.doesNotMatch(
    combined,
    /window\.__scfCrediarioPagamentoAguardandoF1|window\.__scfCrediarioPagamentoFormasAberto|window\.__scfCrediarioPagamentoParcialSelecaoAtiva|window\.__scfCrediarioMenuLateralBloqueado|window\.__scfF5(?:SairMenuRetornaPdvNormal|DetalheBotaoPdvFechaTudoNormal|ListaTopoCrediarioSeta|ListaClientesSetasEnterPagar)Ready/
  );
});

test('P13 preserva fronteira do menu filho apos P14 e deixa continuity para P15', () => {
  const pdv =
    read('offline-ui/pdv.html');

  assert.match(
    pdv,
    /var __crediarioPdvNormalAtivo = false;/
  );
  assert.match(
    pdv,
    /var __crediarioDetalheMenuBloqueado = false;/
  );

  assert.match(
    pdv,
    /\/pdv\/domains\/sale-payment\/finalize-back\.js/
  );
  assert.match(
    pdv,
    /\/pdv\/domains\/sale-payment\/auto-payment\.js/
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
