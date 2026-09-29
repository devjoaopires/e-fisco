(function (global) {
  'use strict';

  var root =
    global.__scfPdvContracts ||
    (global.__scfPdvContracts = {});

  root.storage = Object.freeze({
    local: Object.freeze({
      keys: Object.freeze({
        learnedNcmCatalog: 'scfProductNcmCatalogV2',
        fiscalDraft: 'scfFiscalDraft',
        fiscalSales: 'scfFiscalSales',
        lastFinalizedSale: 'scfLastFinalizedSale',
        financeExitPaid: 'scf.financeiro.saida.situacao.pago.v1'
      }),
      prefixes: Object.freeze({
        companyByCnpj: 'scf_cnpjws_cnpj_',
        companyIeByCnpjUf: 'scf_cnpjws_ie_',
        financeSangriaHistory: 'scf.financeiro.saida.sangrias.historico.v1|',
        financeSangriaReversed: 'scf.financeiro.saida.sangrias.anuladas.v1|'
      })
    }),
    session: Object.freeze({
      keys: Object.freeze({
        stockAnnualSalesDashboardHtml:
          'scf_stock_copy_annual_sales_dashboard_html_v1'
      })
    }),
    separators: Object.freeze({
      financeTenant: '|',
      financeMovementIdentity: '|',
      companyIeParts: '_'
    }),
    defaults: Object.freeze({
      financeTenant: 'EMPRESA_ATUAL'
    }),
    ttlMs: Object.freeze({
      companyRegistryLookup: 7 * 24 * 60 * 60 * 1000
    }),
    jsonShapes: Object.freeze({
      learnedNcmCatalog:
        'object keyed by normalized product name; values preserve code/description/updatedAt',
      fiscalDraft:
        'object snapshot of current fiscal form/products/currentProduct/total/savedAt',
      fiscalSales:
        'array of sale snapshots',
      lastFinalizedSale:
        'single sale snapshot object',
      companyRegistryLookup:
        'object response fields plus __salvoEm epoch-ms',
      financeSangriaHistory:
        'array of movement snapshots, max 500',
      financeSangriaReversed:
        'array of movement ids, max 500',
      financeExitPaid:
        'object keyed by movement identity with boolean values',
      stockAnnualSalesDashboardHtml:
        'HTML string in sessionStorage'
    })
  });
})(window);
