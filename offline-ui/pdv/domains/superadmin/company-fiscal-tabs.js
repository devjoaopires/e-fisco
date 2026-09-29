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

  function painelFiscalAtivo(){
    const painel =
      document.getElementById(
        'scfSuperAdminCompanyFiscalPanel'
      );

    return Boolean(
      painel &&
      painel.classList.contains(
        'is-active'
      )
    );
  }

  function sincronizarOpcoes(){
    const empresa =
      document.getElementById(
        'scfSuperAdminCompanySectionData'
      );

    const fiscal =
      document.getElementById(
        'scfSuperAdminCompanySectionFiscal'
      );

    if(!empresa || !fiscal){
      return;
    }

    const fiscalAtivo =
      painelFiscalAtivo();

    empresa.checked =
      !fiscalAtivo;

    fiscal.checked =
      fiscalAtivo;

    empresa.setAttribute(
      'aria-checked',
      empresa.checked
        ? 'true'
        : 'false'
    );

    fiscal.setAttribute(
      'aria-checked',
      fiscal.checked
        ? 'true'
        : 'false'
    );
  }

  function alternarPara(painel){
    const ponte =
      document.getElementById(
        'scfSuperAdminCompanyFiscalButton'
      );

    if(!ponte){
      sincronizarOpcoes();
      return;
    }

    const fiscalAtivo =
      painelFiscalAtivo();

    const desejaFiscal =
      painel === 'FISCAIS';

    if(
      desejaFiscal !==
      fiscalAtivo
    ){
      ponte.click();
    }

    window.setTimeout(
      sincronizarOpcoes,
      0
    );
  }

  function garantirSeletor(){
    const seletor =
      document.getElementById(
        'scfSuperAdminCompanySectionType'
      );

    if(!seletor){
      return false;
    }

    if(
      seletor.dataset.scfPasso77Ready !==
      '1'
    ){
      seletor.dataset.scfPasso77Ready =
        '1';

      seletor.setAttribute(
        'role',
        'radiogroup'
      );

      seletor.setAttribute(
        'aria-label',
        'Seções do cadastro da empresa'
      );

      seletor.innerHTML =
        ''
        + '<label class="scf-superadmin-company-section-option">'
        +   '<input id="scfSuperAdminCompanySectionData" class="scf-superadmin-company-section-radio" type="radio" name="scfSuperAdminCompanySectionTypeRadio" value="EMPRESA" role="radio" aria-checked="true" checked>'
        +   '<span>DADOS EMPRESA</span>'
        + '</label>'
        + '<label class="scf-superadmin-company-section-option">'
        +   '<input id="scfSuperAdminCompanySectionFiscal" class="scf-superadmin-company-section-radio" type="radio" name="scfSuperAdminCompanySectionTypeRadio" value="FISCAIS" role="radio" aria-checked="false">'
        +   '<span>DADOS FISCAIS</span>'
        + '</label>';

      const empresa =
        document.getElementById(
          'scfSuperAdminCompanySectionData'
        );

      const fiscal =
        document.getElementById(
          'scfSuperAdminCompanySectionFiscal'
        );

      if(empresa){
        empresa.addEventListener(
          'change',
          function(){
            if(empresa.checked){
              alternarPara(
                'EMPRESA'
              );
            }
          }
        );
      }

      if(fiscal){
        fiscal.addEventListener(
          'change',
          function(){
            if(fiscal.checked){
              alternarPara(
                'FISCAIS'
              );
            }
          }
        );
      }
    }

    const painelFiscal =
      document.getElementById(
        'scfSuperAdminCompanyFiscalPanel'
      );

    if(
      painelFiscal &&
      painelFiscal.dataset.scfPasso77ObserverReady !==
      '1'
    ){
      painelFiscal.dataset.scfPasso77ObserverReady =
        '1';

      new MutationObserver(
        sincronizarOpcoes
      ).observe(
        painelFiscal,
        {
          attributes:true,
          attributeFilter:[
            'class'
          ]
        }
      );
    }

    sincronizarOpcoes();
    return true;
  }

  function iniciarPasso77(){
    garantirSeletor();

    [0,80,220,500,900].forEach(
      function(atraso){
        window.setTimeout(
          garantirSeletor,
          atraso
        );
      }
    );
  }

  if(
    document.readyState ===
    'loading'
  ){
    document.addEventListener(
      'DOMContentLoaded',
      iniciarPasso77,
      {
        once:true
      }
    );
  }else{
    iniciarPasso77();
  }
})();
