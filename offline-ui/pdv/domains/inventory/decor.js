(function(){
  'use strict';

  const form = document.getElementById('fiscalForm');
  if(!form){
    return;
  }

  function ensure(id){
    let node = document.getElementById(id);
    if(!node){
      node = document.createElement('div');
      node.id = id;
      node.setAttribute('aria-hidden','true');
      node.setAttribute('role','presentation');
      form.appendChild(node);
    }else if(node.parentElement !== form){
      form.appendChild(node);
    }
  }

  ensure('scfStockDecorTop');
  ensure('scfStockDecorBottom');
})();
