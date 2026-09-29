(function(){
  'use strict';

  const ESTADOS = [
    'scf-crediario-open',
    'scf-crediario-list-open',
    'scf-crediario-detail-open',
    'scf-crediario-payment-edit-open',
    'scf-crediario-payment-methods-open'
  ];

  function crediarioAtivo(){
    const body = document.body;
    return Boolean(
      body &&
      body.classList.contains('scf-pdv-pagina-selecionada') &&
      ESTADOS.some(function(nome){ return body.classList.contains(nome); })
    );
  }

  function garantirLegenda(){
    if(!crediarioAtivo()) return;

    const view = document.getElementById('fiscalProductsView');
    if(!view) return;

    let legend = document.getElementById('scfPdvShortcutLegend');

    if(!legend){
      legend = document.createElement('div');
      legend.id = 'scfPdvShortcutLegend';
      legend.setAttribute('aria-hidden', 'true');
      legend.innerHTML = [
        '<span class="scf-pdv-shortcut-item"><strong>F0</strong> COMANDA</span>',
        '<span class="scf-pdv-shortcut-sep"></span>',
        '<span class="scf-pdv-shortcut-item"><strong>F1</strong> FINALIZAR</span>',
        '<span class="scf-pdv-shortcut-sep"></span>',
        '<span class="scf-pdv-shortcut-item"><strong>F2</strong> CANCELAR ITEM</span>',
        '<span class="scf-pdv-shortcut-sep"></span>',
        '<span class="scf-pdv-shortcut-item"><strong>F3</strong> CANCELAR VENDA</span>',
        '<span class="scf-pdv-shortcut-sep"></span>',
        '<span class="scf-pdv-shortcut-item"><strong>F4</strong> PESQUISAR</span>',
        '<span class="scf-pdv-shortcut-sep"></span>',
        '<span class="scf-pdv-shortcut-item"><strong>F5</strong> CREDIÁRIO</span>',
      '<span class="scf-pdv-shortcut-sep"></span>',
      '<span class="scf-pdv-shortcut-item scf-pdv-shortcut-venda-interna" data-scf-shortcut="F6"><strong>F6</strong> VENDA INTERNA</span>'
      ].join('');
    }

    if(legend.parentNode !== view){
      view.appendChild(legend);
    }
  }

  function agendar(){
    [0, 30, 100, 250].forEach(function(atraso){
      window.setTimeout(garantirLegenda, atraso);
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', agendar, { once:true });
  }else{
    agendar();
  }

  if(typeof MutationObserver === 'function'){
    const iniciarObserver = function(){
      if(!document.body) return;
      const observer = new MutationObserver(function(mutations){
        if(mutations.some(function(m){
          return m.type === 'attributes' && m.attributeName === 'class';
        })){
          agendar();
        }
      });
      observer.observe(document.body, { attributes:true, attributeFilter:['class'] });
    };

    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', iniciarObserver, { once:true });
    }else{
      iniciarObserver();
    }
  }
})();
