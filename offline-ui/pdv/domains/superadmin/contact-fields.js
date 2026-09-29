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

  function formatarTelefoneEmpresa(valor){
    const numeros =
      String(valor || '')
        .replace(/\D/g,'')
        .slice(0,11);

    if(!numeros){
      return '';
    }

    if(numeros.length <= 2){
      return '(' + numeros;
    }

    if(numeros.length <= 7){
      return '(' + numeros.slice(0,2) + ') ' + numeros.slice(2);
    }

    if(numeros.length <= 10){
      return '(' + numeros.slice(0,2) + ') ' +
        numeros.slice(2,6) + '-' + numeros.slice(6);
    }

    return '(' + numeros.slice(0,2) + ') ' +
      numeros.slice(2,7) + '-' + numeros.slice(7);
  }

  function garantirCamposContato(){
    const painel =
      document.getElementById(
        'scfSuperAdminCompanyDataPanel'
      );

    const cidadeUf =
      document.querySelector(
        '#scfSuperAdminCompanyDataPanel .scf-superadmin-company-city-uf-row'
      );

    const submit =
      document.getElementById(
        'scfSuperAdminCompanySubmit'
      );

    if(!painel || !cidadeUf || !submit){
      return false;
    }

    let email =
      document.getElementById(
        'scfSuperAdminCompanyEmail'
      );

    if(!email){
      email =
        document.createElement(
          'input'
        );

      email.id =
        'scfSuperAdminCompanyEmail';

      email.className =
        'scf-superadmin-company-field';

      email.type =
        'email';

      email.maxLength =
        160;

      email.placeholder =
        'E-MAIL';

      email.setAttribute(
        'aria-label',
        'E-mail da empresa'
      );

      email.setAttribute(
        'autocomplete',
        'email'
      );

      cidadeUf.insertAdjacentElement(
        'afterend',
        email
      );
    }

    if(email.dataset.scfPasso79ManualReady !== '1'){
      email.dataset.scfPasso79ManualReady =
        '1';

      email.addEventListener(
        'input',
        function(){
          if(document.activeElement === email){
            email.dataset.scfSintegrapiAuto =
              '0';
          }
        }
      );
    }

    let linha =
      document.getElementById(
        'scfSuperAdminCompanyContactSubmitRow'
      );

    if(!linha){
      linha =
        document.createElement(
          'div'
        );

      linha.id =
        'scfSuperAdminCompanyContactSubmitRow';

      email.insertAdjacentElement(
        'afterend',
        linha
      );
    }

    let telefone =
      document.getElementById(
        'scfSuperAdminCompanyTelefone'
      );

    if(!telefone){
      telefone =
        document.createElement(
          'input'
        );

      telefone.id =
        'scfSuperAdminCompanyTelefone';

      telefone.className =
        'scf-superadmin-company-field';

      telefone.type =
        'text';

      telefone.inputMode =
        'numeric';

      telefone.maxLength =
        15;

      telefone.placeholder =
        '(00) 00000-0000';

      telefone.setAttribute(
        'aria-label',
        'Telefone da empresa'
      );

      telefone.setAttribute(
        'autocomplete',
        'tel'
      );

      linha.appendChild(
        telefone
      );
    }

    if(telefone.dataset.scfPasso76MaskReady !== '1'){
      telefone.dataset.scfPasso76MaskReady =
        '1';

      telefone.addEventListener(
        'input',
        function(){
          telefone.value =
            formatarTelefoneEmpresa(
              telefone.value
            );

          if(document.activeElement === telefone){
            telefone.dataset.scfSintegrapiAuto =
              '0';
          }
        }
      );
    }

    if(submit.parentNode !== linha){
      linha.appendChild(
        submit
      );
    }

    return true;
  }

  function iniciarPasso76(){
    garantirCamposContato();

    [0,80,220,500,900].forEach(
      function(atraso){
        window.setTimeout(
          garantirCamposContato,
          atraso
        );
      }
    );
  }

  if(document.readyState === 'loading'){
    document.addEventListener(
      'DOMContentLoaded',
      iniciarPasso76,
      { once:true }
    );
  }else{
    iniciarPasso76();
  }
})();
