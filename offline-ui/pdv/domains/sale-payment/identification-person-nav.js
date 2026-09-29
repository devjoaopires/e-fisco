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

  function radios(){
    return [
      document.getElementById(
        'tipoPessoaFisica'
      ),
      document.getElementById(
        'tipoPessoaJuridica'
      )
    ].filter(Boolean);
  }

  function selecionar(radio){
    if(
      !radio ||
      radio.checked
    ){
      return;
    }

    radio.checked = true;

    radio.dispatchEvent(
      new Event(
        'change',
        {
          bubbles:true
        }
      )
    );

    requestAnimationFrame(function(){
      const documento =
        document.getElementById(
          'cpfFiscalInput'
        );

      if(!documento) return;

      try{
        documento.focus({
          preventScroll:true
        });
      }catch(error){
        try{
          documento.focus();
        }catch(innerError){}
      }

      try{
        documento.setSelectionRange(
          documento.value.length,
          documento.value.length
        );
      }catch(error){}
    });
  }

  /*
   * WINDOW + capture garante que ← / → sejam resolvidas antes
   * dos inputs CPF/WhatsApp ou de qualquer navegação global.
   */
  window.addEventListener(
    'keydown',
    function(event){
      if(
        !event ||
        !identificacaoAberta()
      ){
        return;
      }

      const key =
        String(
          event.key || ''
        );

      if(
        key !== 'ArrowLeft' &&
        key !== 'ArrowRight'
      ){
        return;
      }

      const lista =
        radios();

      if(
        lista.length !== 2
      ){
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const atual =
        lista.findIndex(
          function(radio){
            return radio.checked;
          }
        );

      if(
        key === 'ArrowRight'
      ){
        selecionar(
          lista[
            atual === 1
              ? 0
              : 1
          ]
        );

        return;
      }

      selecionar(
        lista[
          atual === 0
            ? 1
            : 0
        ]
      );
    },
    true
  );
})();
