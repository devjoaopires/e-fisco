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

  function posicionarFormularioAbaixoDoRecorte(){
    const frame =
      document.querySelector(
        '#fiscalDesktopProductPhoto .fiscal-desktop-product-photo-frame'
      );

    const recorte =
      document.getElementById(
        'scfPhotoDecorTop'
      );

    const form =
      document.getElementById(
        'scfSuperAdminCompanyForm'
      );

    if(!frame || !recorte || !form){
      return;
    }

    const frameRect =
      frame.getBoundingClientRect();

    const recorteRect =
      recorte.getBoundingClientRect();

    /* Fim real do recorte + exatamente 15px. */
    const topo =
      Math.max(
        0,
        recorteRect.bottom -
        frameRect.top
      ) + 15;

    form.style.setProperty(
      'top',
      Math.round(topo) + 'px',
      'important'
    );

    form.style.setProperty(
      'transform',
      'translateX(-50%)',
      'important'
    );
  }

  function sincronizarSeletor(){
    const fiscal =
      document.getElementById(
        'scfSuperAdminCompanySectionFiscal'
      );

    if(!fiscal){
      return;
    }

    fiscal.checked =
      painelFiscalAtivo();

    fiscal.setAttribute(
      'aria-checked',
      fiscal.checked
        ? 'true'
        : 'false'
    );
  }

  function removerBotaoLimpar(){
    const limpar =
      document.getElementById(
        'scfSuperAdminCompanyClear'
      );

    if(limpar && limpar.parentNode){
      limpar.parentNode.removeChild(
        limpar
      );
    }
  }

  function garantirSeletor(){
    const form =
      document.getElementById(
        'scfSuperAdminCompanyForm'
      );

    const titulo =
      document.getElementById(
        'scfSuperAdminCompanyTitle'
      );

    if(!form || !titulo){
      return false;
    }

    removerBotaoLimpar();

    let seletor =
      document.getElementById(
        'scfSuperAdminCompanySectionType'
      );

    if(!seletor){
      seletor =
        document.createElement(
          'div'
        );

      seletor.id =
        'scfSuperAdminCompanySectionType';

      seletor.setAttribute(
        'role',
        'group'
      );

      seletor.setAttribute(
        'aria-label',
        'Seções do cadastro da empresa'
      );

      seletor.innerHTML =
        ''
        + '<label class="scf-superadmin-company-section-option">'
        +   '<input id="scfSuperAdminCompanySectionFiscal" class="scf-superadmin-company-section-radio" type="checkbox" role="radio" aria-checked="false">'
        +   '<span>DADOS FISCAIS</span>'
        + '</label>'
        + '<label class="scf-superadmin-company-section-option">'
        +   '<input id="scfSuperAdminCompanySectionCertificate" class="scf-superadmin-company-section-radio" type="checkbox" role="radio" aria-checked="false" aria-disabled="true" disabled>'
        +   '<span>CERTIFICADO</span>'
        + '</label>';

      titulo.insertAdjacentElement(
        'afterend',
        seletor
      );
    }

    const fiscal =
      document.getElementById(
        'scfSuperAdminCompanySectionFiscal'
      );

    const painelFiscal =
      document.getElementById(
        'scfSuperAdminCompanyFiscalPanel'
      );

    const botaoAntigo =
      document.getElementById(
        'scfSuperAdminCompanyFiscalButton'
      );

    if(botaoAntigo){
      botaoAntigo.setAttribute(
        'aria-hidden',
        'true'
      );
      botaoAntigo.tabIndex = -1;
    }

    if(
      fiscal &&
      fiscal.dataset.scfPasso75Ready !== '1'
    ){
      fiscal.dataset.scfPasso75Ready =
        '1';

      fiscal.addEventListener(
        'change',
        function(){
          const ponte =
            document.getElementById(
              'scfSuperAdminCompanyFiscalButton'
            );

          if(!ponte){
            sincronizarSeletor();
            return;
          }

          const ativoAntes =
            painelFiscalAtivo();

          if(
            fiscal.checked !==
            ativoAntes
          ){
            ponte.click();
          }

          window.setTimeout(
            function(){
              sincronizarSeletor();
              posicionarFormularioAbaixoDoRecorte();
            },
            0
          );
        }
      );
    }

    if(
      painelFiscal &&
      painelFiscal.dataset.scfPasso75ObserverReady !== '1'
    ){
      painelFiscal.dataset.scfPasso75ObserverReady =
        '1';

      new MutationObserver(
        function(){
          sincronizarSeletor();
          posicionarFormularioAbaixoDoRecorte();
        }
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

    sincronizarSeletor();
    posicionarFormularioAbaixoDoRecorte();
    return true;
  }

  function iniciarPasso75(){
    garantirSeletor();

    [0,80,220,500,900].forEach(
      function(atraso){
        window.setTimeout(
          garantirSeletor,
          atraso
        );
      }
    );

    window.addEventListener(
      'resize',
      posicionarFormularioAbaixoDoRecorte
    );
  }

  if(
    document.readyState ===
    'loading'
  ){
    document.addEventListener(
      'DOMContentLoaded',
      iniciarPasso75,
      {
        once:true
      }
    );
  }else{
    iniciarPasso75();
  }
})();
