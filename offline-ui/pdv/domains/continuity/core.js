(function (global) {
  'use strict';

  var continuityDomain =
    global.__scfPdvDomains &&
    global.__scfPdvDomains.continuity;

  if(!continuityDomain) {
    throw new Error(
      'PDV continuity domain indisponivel.'
    );
  }

  global.__scfPdvExportContinuityDraft =
    function() {
      return continuityDomain
        .exportDraft();
    };

  global.__scfPdvRestoreContinuityDraft =
    function(draft) {
      return continuityDomain
        .restoreDraft(draft);
    };

  global.__scfPdvHasActiveContinuitySale =
    function() {
      return continuityDomain
        .hasActiveSale();
    };
})(window);
