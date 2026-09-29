(function(){
  'use strict';

  const financeDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.finance;

  if(!financeDomain){
    throw new Error(
      'PDV finance domain indisponivel.'
    );
  }

  function atualizar(){
    if(
      !document.body.classList.contains('scf-financeiro-entrada-open') ||
      !document.body.classList.contains('scf-financeiro-entrada-mes-open')
    ){
      return;
    }

    /*
     * O formulário principal já possui MutationObserver próprio.
     * Alterar um atributo neutro nele força uma nova sincronização sem
     * recriar campos nem perder conteúdo digitado.
     */
    const form =
      document.getElementById(
        'scfFinanceEntryNewForm'
      );

    if(form){
      form.dataset.scfCashStateTick =
        String(Date.now());
    }
  }

  const observer =
    new MutationObserver(
      function(mutations){
        if(
          mutations.some(
            function(mutation){
              return (
                mutation.type === 'attributes' &&
                mutation.attributeName === 'class'
              );
            }
          )
        ){
          window.requestAnimationFrame(
            atualizar
          );
        }
      }
    );

  observer.observe(
    document.body,
    {
      attributes:true,
      attributeFilter:['class']
    }
  );
})();
