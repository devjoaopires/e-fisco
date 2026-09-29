(function(){
  'use strict';

  const superadminDomain =
    window.__scfPdvDomains &&
    window.__scfPdvDomains.superadmin;

  if(!superadminDomain){
    throw new Error(
      'PDV superadmin domain indisponivel.'
    );
  }

  function el(id){
    return window.__scfPdvInfra.dom.byId(id);
  }

  function obterLimparGlobal(){
    return superadminDomain.actions.clearCompanyForm;
  }

  function syncInterface(){
    const submitBridge = el('scfSuperAdminCompanySubmit');
    const primary = el('scfSuperAdminPrimaryActionBtn');
    const clearVisual = el('scfSuperAdminCompanyVisibleClear');

    if(primary && submitBridge){
      const texto =
        String(submitBridge.textContent || '')
          .trim() ||
        'CADASTRAR';

      primary.textContent = texto;
      primary.disabled = submitBridge.disabled === true;
      primary.setAttribute('aria-label', texto);
      primary.setAttribute('title', texto);
    }

    if(clearVisual){
      clearVisual.textContent = 'LIMPAR';

      const textoAtual = submitBridge
        ? String(submitBridge.textContent || '').trim().toUpperCase()
        : '';

      clearVisual.disabled =
        /CADASTRANDO|ATUALIZANDO|ENVIANDO|PROCESSANDO/.test(textoAtual) &&
        submitBridge &&
        submitBridge.disabled === true;
    }
  }

  function garantirUI(){
    const row = el('scfSuperAdminCompanyContactSubmitRow');
    const submitBridge = el('scfSuperAdminCompanySubmit');
    const decorBottom = el('scfPhotoDecorBottom');

    if(!row || !submitBridge || !decorBottom){
      return false;
    }

    let clearVisual = el('scfSuperAdminCompanyVisibleClear');

    if(!clearVisual){
      clearVisual = document.createElement('button');
      clearVisual.type = 'button';
      clearVisual.id = 'scfSuperAdminCompanyVisibleClear';
      clearVisual.className = 'scf-superadmin-company-stage-btn';
      clearVisual.textContent = 'LIMPAR';
    }

    const telefone = el('scfSuperAdminCompanyTelefone');

    if(clearVisual.parentNode !== row){
      if(submitBridge.parentNode === row){
        row.insertBefore(clearVisual, submitBridge);
      }else if(telefone && telefone.parentNode === row && telefone.nextSibling){
        row.insertBefore(clearVisual, telefone.nextSibling);
      }else{
        row.appendChild(clearVisual);
      }
    }

    if(clearVisual.dataset.scfPasso89Ready !== '1'){
      clearVisual.dataset.scfPasso89Ready = '1';
      clearVisual.addEventListener('click', function(event){
        event.preventDefault();
        event.stopPropagation();

        if(clearVisual.disabled){
          return;
        }

        const limpar = obterLimparGlobal();
        if(typeof limpar === 'function'){
          limpar();
          return;
        }

        const clearBridge = el('scfSuperAdminCompanyClear');
        if(clearBridge && typeof clearBridge.click === 'function'){
          clearBridge.click();
        }
      });
    }

    let primary = el('scfSuperAdminPrimaryActionBtn');

    if(!primary){
      primary = document.createElement('button');
      primary.type = 'button';
      primary.id = 'scfSuperAdminPrimaryActionBtn';
    }

    if(primary.parentNode !== decorBottom){
      decorBottom.appendChild(primary);
    }

    if(primary.dataset.scfPasso89Ready !== '1'){
      primary.dataset.scfPasso89Ready = '1';
      primary.addEventListener('click', function(event){
        event.preventDefault();
        event.stopPropagation();

        const bridge = el('scfSuperAdminCompanySubmit');
        if(!bridge || bridge.disabled){
          return;
        }

        bridge.click();
      });
    }

    if(submitBridge.dataset.scfPasso89ObserverReady !== '1'){
      submitBridge.dataset.scfPasso89ObserverReady = '1';

      new MutationObserver(syncInterface).observe(submitBridge, {
        attributes:true,
        attributeFilter:['disabled','class','style','aria-disabled'],
        childList:true,
        subtree:true,
        characterData:true
      });
    }

    syncInterface();
    return true;
  }

  function iniciarPasso89(){
    garantirUI();

    [0,80,220,500,900,1400].forEach(function(atraso){
      window.setTimeout(function(){
        garantirUI();
        syncInterface();
      }, atraso);
    });

    window.__scfPdvInfra.shellBridge.onMessage( function(){
      window.setTimeout(function(){
        garantirUI();
        syncInterface();
      }, 0);
    });

    document.addEventListener('click', function(){
      window.setTimeout(syncInterface, 0);
    }, true);

    document.addEventListener('input', function(){
      window.setTimeout(syncInterface, 0);
    }, true);

    document.addEventListener('change', function(){
      window.setTimeout(syncInterface, 0);
    }, true);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', iniciarPasso89, {
      once:true
    });
  }else{
    iniciarPasso89();
  }
})();
