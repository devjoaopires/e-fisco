(function(){
  'use strict';

  function pruneStockRightPanel(){
    if(!document.body.classList.contains('scf-stock-page-open') || !document.body.classList.contains('scf-stock-neutral-mode')) return;

    var root = document.getElementById('scfStockDashV5Root');
    if(root){
      Array.from(root.children).forEach(function(node){
        if(node.id !== 'scfStockDashV4Hero' && node.id !== 'scfStockDashV4Donut'){
          node.remove();
        }
      });
    }

    [
      'scfStockDashV4MiniGrid',
      'scfStockDashV4Priority',
      'scfStockDashV3StatusGrid',
      'scfStockDashV3Priority',
      'scfStockDashV3Capital',
      'scfStockDashV3Trend'
    ].forEach(function(id){
      var el = document.getElementById(id);
      if(el) el.remove();
    });
  }

  var raf = 0;
  function schedule(){
    if(raf) return;
    raf = requestAnimationFrame(function(){
      raf = 0;
      pruneStockRightPanel();
    });
  }

  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('DOMContentLoaded', schedule);
  window.addEventListener('load', schedule);
  schedule();
})();
