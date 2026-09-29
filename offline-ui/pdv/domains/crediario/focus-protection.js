(function(){
  'use strict';

  const crediarioDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.crediario;

  if(!crediarioDomain){
    throw new Error(
      'PDV crediario domain indisponivel.'
    );
  }

  /*
   * Captura focusin no formulário do crediário e interrompe somente
   * rotinas de foco concorrentes que dependam da navegação normal do PDV.
   * Não bloqueia o comportamento nativo de SELECT/INPUT.
   */
  document.addEventListener(
    'focusin',
    function(event){
      if(
        !document.body.classList.contains(
          'scf-crediario-open'
        )
      ){
        return;
      }

      const alvo =
        event &&
        event.target
          ? event.target
          : null;

      if(
        !alvo ||
        !alvo.closest ||
        !alvo.closest(
          '#scfPdvCrediarioPanel'
        )
      ){
        return;
      }

      /*
       * A classe scf-crediario-open já faz pdvPodeFocarCodigoBarras()
       * retornar false; não há estado global adicional a manter.
       */
    },
    true
  );
})();
