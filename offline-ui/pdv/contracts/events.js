(function (global) {
  'use strict';

  var root =
    global.__scfPdvContracts ||
    (global.__scfPdvContracts = {});

  var names = Object.freeze([
    "scf:cadastrar-opcao",
    "scf:comprovante-historico-solicitado",
    "scf:crediario-parcial-selecao-alterada",
    "scf:crediario-venda-pronta",
    "scf:cupom-historico-fechado",
    "scf:emitir-cupom-fiscal",
    "scf:estoque-produto-cadastrar",
    "scf:estoque-produtos-atualizados",
    "scf:estoque-xml-selecionado",
    "scf:fechar-cadastro-colaborador",
    "scf:finalizar-venda",
    "scf:financeiro-retorno-pdv",
    "scf:financeiro-saida-anulada-local",
    "scf:financeiro-saida-cadastrar",
    "scf:financeiro-saida-data-filtro-alterado",
    "scf:financeiro-saida-selecionar",
    "scf:financeiro-saida-status",
    "scf:financeiro-saldo-recarregar",
    "scf:historico-vendas-ano-dados",
    "scf:historico-vendas-atualizar",
    "scf:historico-vendas-fechado",
    "scf:historico-vendas-renderizado",
    "scf:limpar-venda-concluida",
    "scf:mde-abrir",
    "scf:nfce-historico-aberto",
    "scf:nova-venda-pronta",
    "scf:operador-logado",
    "scf:pdv-cancelar-produto-preparado-consulta",
    "scf:pdv-render-current-product-preview",
    "scf:pdv-unified-table-sync",
    "scf:pdv-venda-interna-toggle",
    "scf:superadmin-garantir-cadastro-cliente",
    "scf:venda-paga"
  ]);

  root.events = Object.freeze({
    names: names,
    has: function (name) {
      return names.indexOf(String(name || '')) !== -1;
    }
  });
})(window);
