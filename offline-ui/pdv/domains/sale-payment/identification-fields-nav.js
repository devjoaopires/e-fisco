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

  function campos(){
    return [
      document.getElementById(
        'cpfFiscalInput'
      ),
      document.getElementById(
        'whatsappFiscalInput'
      )
    ].filter(Boolean);
  }

  function focarCampo(campo){
    if(!campo) return;

    try{
      campo.focus({
        preventScroll:true
      });
    }catch(error){
      try{
        campo.focus();
      }catch(innerError){}
    }

    /*
     * Se já houver conteúdo digitado, deixa-o selecionado para
     * facilitar substituição rápida pelo operador.
     */
    if(
      String(
        campo.value || ''
      ).trim()
    ){
      try{
        campo.select();
      }catch(error){}
    }
  }

  /*
   * WINDOW + capture resolve ↑ / ↓ antes do comportamento nativo
   * do input e antes de qualquer navegação global do PDV.
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
        key !== 'ArrowUp' &&
        key !== 'ArrowDown'
      ){
        return;
      }

      const lista =
        campos();

      if(
        lista.length !== 2
      ){
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const atual =
        lista.indexOf(
          document.activeElement
        );

      if(
        atual === 0
      ){
        focarCampo(
          lista[1]
        );
        return;
      }

      if(
        atual === 1
      ){
        focarCampo(
          lista[0]
        );
        return;
      }

      /*
       * Se o foco ainda estiver em PF/PJ ou fora dos inputs:
       * ↓ começa no documento; ↑ começa no WhatsApp.
       */
      focarCampo(
        key === 'ArrowDown'
          ? lista[0]
          : lista[1]
      );
    },
    true
  );
})();
