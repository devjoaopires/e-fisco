(function(){
  'use strict';

  window.__scfPdvInfra.eventBus.on('scf:venda-paga',
    function(event){
      const sale =
        event &&
        event.detail &&
        typeof event.detail === 'object'
          ? event.detail
          : null;

      if(!sale) return;

      /*
       * Normaliza apenas o par tipo/documento quando já houver
       * uma escolha fiscal explícita salva na venda.
       */
      const tipo =
        String(
          sale.tipoPessoaCliente || ''
        )
          .trim()
          .toUpperCase();

      if(tipo === 'JURIDICA'){
        sale.tipoPessoaCliente = 'JURIDICA';

        if(
          !String(
            sale.documentoClienteTipo || ''
          ).trim()
        ){
          sale.documentoClienteTipo = 'CNPJ';
        }
      }else if(tipo === 'FISICA'){
        sale.tipoPessoaCliente = 'FISICA';

        if(
          !String(
            sale.documentoClienteTipo || ''
          ).trim()
        ){
          sale.documentoClienteTipo = 'CPF';
        }
      }
    },
    true
  );
})();
