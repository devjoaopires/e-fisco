(function(){
  'use strict';

  const IDS_BLOQUEADOS = [
    'localizacaoBtn',
    'bloqueioBtn',
    'cadastrarBtn',
    'admin'
  ];

  const SELETOR_BLOQUEADOS =
    '#localizacaoBtn,#bloqueioBtn,#cadastrarBtn,#admin';

  const sessionState =
    window.__scfPdvState.session;

  const normalizarPerfil =
    window.__scfPdvShared
      .helpers.normalizeProfile;

  function botao(id){
    return document.getElementById(id);
  }

  function definirBloqueioBotoes(bloqueado){
    IDS_BLOQUEADOS.forEach(function(id){
      const elemento = botao(id);
      if(!elemento) return;

      elemento.classList.toggle(
        'scf-perfil-bloqueado',
        bloqueado
      );

      if(bloqueado){
        elemento.disabled = true;
        elemento.setAttribute('disabled','');
        elemento.setAttribute('aria-disabled','true');
        elemento.setAttribute('tabindex','-1');
        return;
      }

      elemento.disabled = false;
      elemento.removeAttribute('disabled');
      elemento.setAttribute('aria-disabled','false');
      elemento.removeAttribute('tabindex');
    });
  }

  function obterMenuIframe(){
    return document.getElementById(
      '__htmlStatusIframe'
    );
  }

  function garantirCssMenuFilho(doc){
    if(
      !doc ||
      doc.getElementById(
        'scf-perfis-acesso-menu-filho-style'
      )
    ){
      return;
    }

    const style =
      doc.createElement('style');

    style.id =
      'scf-perfis-acesso-menu-filho-style';

    style.textContent = `
      html.scf-acesso-pdv-restrito #localizacaoBtn,
      html.scf-acesso-pdv-restrito #bloqueioBtn,
      html.scf-acesso-pdv-restrito #cadastrarBtn,
      html.scf-acesso-pdv-restrito #admin,
      html.scf-perfil-acesso-pendente #localizacaoBtn,
      html.scf-perfil-acesso-pendente #bloqueioBtn,
      html.scf-perfil-acesso-pendente #cadastrarBtn,
      html.scf-perfil-acesso-pendente #admin{
        pointer-events:none !important;
        cursor:not-allowed !important;
        opacity:.38 !important;
        filter:grayscale(1) !important;
        -webkit-filter:grayscale(1) !important;
      }

      html.scf-acesso-pdv-restrito #statusButton,
      html.scf-perfil-acesso-pendente #statusButton{
        pointer-events:auto !important;
        opacity:1 !important;
        filter:none !important;
        -webkit-filter:none !important;
        cursor:pointer !important;
      }
    `;

    (doc.head || doc.documentElement)
      .appendChild(style);
  }

  function instalarGuardaMenuFilho(doc, win){
    if(
      !doc ||
      !win ||
      doc.documentElement?.dataset
        ?.scfPerfilGuardaInstalada === '1'
    ){
      return;
    }

    if(doc.documentElement?.dataset){
      doc.documentElement.dataset
        .scfPerfilGuardaInstalada = '1';
    }

    doc.addEventListener(
      'click',
      function(event){
        if(
          win.__scfAcessoSomentePdv !==
            true
        ){
          return;
        }

        const alvo =
          event.target &&
          event.target.closest
            ? event.target.closest(
                SELETOR_BLOQUEADOS
              )
            : null;

        if(!alvo) return;

        event.preventDefault();
        event.stopPropagation();

        if(
          typeof event.stopImmediatePropagation ===
            'function'
        ){
          event.stopImmediatePropagation();
        }

        try{
          if(
            typeof win.handleMenuAction ===
              'function'
          ){
            win.handleMenuAction(
              'FISCALHOME'
            );
          }
        }catch(error){}
      },
      true
    );
  }

  function aplicarEstadoNoMenuFilho(
    perfilRecebido,
    restritoRecebido
  ){
    const iframe =
      obterMenuIframe();

    if(!iframe){
      return false;
    }

    if(
      iframe.dataset
        .scfPerfilLoadVinculado !== '1'
    ){
      iframe.dataset
        .scfPerfilLoadVinculado = '1';

      iframe.addEventListener(
        'load',
        function(){
          aplicarEstadoNoMenuFilho(
            sessionState.getProfile(),
            sessionState.getAccessOnlyPdv()
          );
        }
      );
    }

    let doc;
    let win;

    try{
      doc =
        iframe.contentDocument ||
        iframe.contentWindow?.document;

      win =
        iframe.contentWindow;
    }catch(error){
      return false;
    }

    if(!doc || !win){
      return false;
    }

    garantirCssMenuFilho(doc);
    instalarGuardaMenuFilho(doc, win);

    const perfil =
      normalizarPerfil(
        perfilRecebido
      ) || 'PENDENTE';

    const restrito =
      restritoRecebido === true;

    win.__scfPerfilSessao =
      perfil;

    win.__scfAcessoSomentePdv =
      restrito;

    const html =
      doc.documentElement;

    if(html){
      html.classList.toggle(
        'scf-acesso-pdv-restrito',
        restrito &&
        perfil !== 'PENDENTE'
      );

      html.classList.toggle(
        'scf-perfil-acesso-pendente',
        restrito &&
        perfil === 'PENDENTE'
      );
    }

    IDS_BLOQUEADOS.forEach(function(id){
      const elemento =
        doc.getElementById(id);

      if(!elemento) return;

      elemento.classList.toggle(
        'scf-perfil-bloqueado',
        restrito
      );

      if(restrito){
        elemento.disabled = true;
        elemento.setAttribute(
          'disabled',
          ''
        );
        elemento.setAttribute(
          'aria-disabled',
          'true'
        );
        elemento.setAttribute(
          'tabindex',
          '-1'
        );
      }else{
        elemento.disabled = false;
        elemento.removeAttribute(
          'disabled'
        );
        elemento.setAttribute(
          'aria-disabled',
          'false'
        );
        elemento.removeAttribute(
          'tabindex'
        );
      }
    });

    if(restrito){
      try{
        if(
          typeof win.handleMenuAction ===
            'function'
        ){
          win.handleMenuAction(
            'FISCALHOME'
          );
        }else{
          win.postMessage(
            {
              type:
                'SCF_MENU_SELECIONAR_CENTRAL'
            },
            '*'
          );
        }
      }catch(error){}
    }

    return true;
  }

  function sincronizarMenuFilho(){
    aplicarEstadoNoMenuFilho(
      sessionState.getProfile(),
      sessionState.getAccessOnlyPdv()
    );
  }

  function forcarPdv(){
    /*
     * O menu inferior real vive dentro de #__htmlStatusIframe.
     * Primeiro força o próprio menu-filho a selecionar PDV.
     */
    sincronizarMenuFilho();

    try{
      if(
        typeof window.handleMenuAction ===
          'function'
      ){
        window.handleMenuAction(
          'FISCALHOME'
        );
        return;
      }
    }catch(error){}

    try{
      window.__scfPdvInfra.shellBridge.post(
        {
          type:
            'SCF_FISCAL_HOME_ABRIR'
        },
        '*'
      );
    }catch(error){}
  }

  function aplicarPerfil(
    perfilRecebido,
    acessoTotalRecebido
  ){
    const perfil =
      normalizarPerfil(
        perfilRecebido
      );

    const acessoTotal =
      acessoTotalRecebido ===
        true ||
      perfil ===
        'ADMINISTRADOR';

    if(
      acessoTotal &&
      perfil === 'ADMINISTRADOR'
    ){
      sessionState.setProfile(
        'ADMINISTRADOR'
      );
      sessionState.setAccessOnlyPdv(
        false
      );

      document.body.classList.remove(
        'scf-perfil-acesso-pendente',
        'scf-acesso-pdv-restrito'
      );

      definirBloqueioBotoes(
        false
      );

      sincronizarMenuFilho();
      return;
    }

    if(
      perfil === 'SUPERVISOR' ||
      perfil === 'CAIXA'
    ){
      sessionState.setProfile(
        perfil
      );
      sessionState.setAccessOnlyPdv(
        true
      );

      document.body.classList.remove(
        'scf-perfil-acesso-pendente'
      );
      document.body.classList.add(
        'scf-acesso-pdv-restrito'
      );

      definirBloqueioBotoes(
        true
      );

      sincronizarMenuFilho();
      forcarPdv();
      return;
    }

    /* Perfil ausente/inválido: falha fechada e mantém somente o PDV. */
    sessionState.setProfile(
      perfil || 'PENDENTE'
    );
    sessionState.setAccessOnlyPdv(
      true
    );

    document.body.classList.add(
      'scf-perfil-acesso-pendente'
    );

    definirBloqueioBotoes(
      true
    );

    sincronizarMenuFilho();
    forcarPdv();
  }

  /*
   * Antes da confirmação do backend, o menu administrativo começa
   * bloqueado. Assim não existe janela de clique durante o carregamento.
   */
  document.body.classList.add(
    'scf-perfil-acesso-pendente'
  );
  definirBloqueioBotoes(true);

  /*
   * O menu inferior é um srcdoc em iframe separado. Portanto o estado
   * de perfil do iframe principal precisa ser copiado explicitamente
   * para a janela do menu. O bug anterior estava exatamente aqui.
   */
  window.setTimeout(
    sincronizarMenuFilho,
    0
  );

  window.setTimeout(
    sincronizarMenuFilho,
    300
  );

  window.__scfPdvInfra.shellBridge.onMessage(
    function(event){
      const dados =
        event &&
        event.data &&
        typeof event.data ===
          'object'
          ? event.data
          : null;

      if(
        !dados ||
        dados.type !==
          'SCF_OPERADOR_LOGADO_RESULTADO'
      ){
        return;
      }

      aplicarPerfil(
        dados.perfil,
        dados.acessoTotal
      );
    }
  );

  /*
   * Guarda adicional no iframe principal. O menu real possui outra
   * guarda instalada diretamente em seu contentDocument acima.
   */
  document.addEventListener(
    'click',
    function(event){
      if(
        sessionState.getAccessOnlyPdv() !==
          true
      ){
        return;
      }

      const alvo =
        event.target &&
        event.target.closest
          ? event.target.closest(
              SELETOR_BLOQUEADOS
            )
          : null;

      if(!alvo) return;

      event.preventDefault();
      event.stopPropagation();

      if(
        typeof event.stopImmediatePropagation ===
          'function'
      ){
        event.stopImmediatePropagation();
      }

      forcarPdv();
    },
    true
  );
})();
