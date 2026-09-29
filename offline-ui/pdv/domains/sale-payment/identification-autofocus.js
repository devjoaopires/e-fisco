(function(){
  'use strict';

  function identificacaoAberta(){
    return (
      document.body.classList.contains(
        'cpf-fiscal-card-open'
      ) ||
      Boolean(
        document.querySelector(
          '#fiscalDesktopProductPhoto > .fiscal-desktop-product-photo-frame.is-client-identification-open'
        )
      )
    );
  }

  function focarDocumento(){
    if(!identificacaoAberta()) return;

    const input =
      document.getElementById(
        'cpfFiscalInput'
      );

    if(!input) return;

    window.requestAnimationFrame(
      function(){
        try{
          input.focus({
            preventScroll:true
          });
        }catch(error){
          try{
            input.focus();
          }catch(innerError){}
        }

        try{
          const pos =
            String(
              input.value || ''
            ).length;

          input.setSelectionRange(
            pos,
            pos
          );
        }catch(error){}
      }
    );
  }

  document.addEventListener(
    'change',
    function(event){
      const target =
        event &&
        event.target;

      if(
        !target ||
        (
          target.id !== 'tipoPessoaFisica' &&
          target.id !== 'tipoPessoaJuridica'
        )
      ){
        return;
      }

      focarDocumento();
    },
    true
  );
})();
