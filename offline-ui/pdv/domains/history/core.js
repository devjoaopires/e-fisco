(function(){
  const overlay =
    document.getElementById(
      'scfSalesHistoryOverlay'
    );

  const closeButton =
    document.getElementById(
      'scfSalesHistoryClose'
    );

  const historyHeader =
    overlay && overlay.querySelector(
      '.scf-sales-history-header'
    );

  const backButton =
    document.getElementById(
      'scfSalesHistoryBack'
    );

  const list =
    document.getElementById(
      'scfSalesHistoryList'
    );

  const summary =
    document.getElementById(
      'scfSalesHistorySummary'
    );

  const moreButton =
    document.getElementById(
      'scfSalesHistoryMore'
    );

  if(
    !overlay ||
    !closeButton ||
    !historyHeader ||
    !backButton ||
    !list ||
    !summary ||
    !moreButton
  ) return;

  /*
   * Card copiado do padrão visual de VENDA FINALIZADA.
   * Nesta etapa ele coleta o WhatsApp e entrega ao Wix
   * o ano, os meses e os saleIds que deverão compor o ZIP.
   */
  const accountingExportOverlay =
    document.createElement(
      'div'
    );

  accountingExportOverlay.id =
    'scfAccountingExportOverlay';

  accountingExportOverlay.className =
    'block-confirm-overlay finalize-flow-overlay scf-accounting-export-overlay';

  accountingExportOverlay.setAttribute(
    'aria-hidden',
    'true'
  );

  accountingExportOverlay.style.display =
    'none';

  accountingExportOverlay.innerHTML = [
    '<div aria-labelledby="scfAccountingExportTitle" aria-modal="true" class="block-confirm-card" role="dialog">',
    '<button aria-label="Fechar" class="scf-accounting-export-close" id="scfAccountingExportClose" type="button">&times;</button>',
    '<div class="bc-title" id="scfAccountingExportTitle">EXPORTAR PARA CONTABILIDADE</div>',
    '<div class="finalize-cpf-wrap scf-accounting-export-field">',
    '<label class="finalize-identification-label scf-accounting-export-label" for="scfAccountingExportWhatsapp">E-MAIL DA CONTABILIDADE</label>',
    '<input autocomplete="email" class="finalize-whatsapp-input scf-accounting-export-input" id="scfAccountingExportWhatsapp" inputmode="email" maxlength="120" placeholder="email@dominio.com" type="email" aria-label="E-mail da contabilidade">',
    '</div>',
    '<div class="bc-actions scf-accounting-export-actions">',
    '<button class="bp-btn success" id="scfAccountingExportSend" type="button">ENVIAR</button>',
    '<button class="bp-btn primary" id="scfAccountingExportCancel" type="button">CANCELAR</button>',
    '</div>',
    '<div class="scf-accounting-export-status" id="scfAccountingExportStatus" aria-live="polite"></div>',
    '<button class="scf-accounting-export-exit" id="scfAccountingExportExit" type="button">SAIR</button>',
    '</div>'
  ].join('');

  document.body.appendChild(
    accountingExportOverlay
  );

  const accountingExportWhatsapp =
    accountingExportOverlay.querySelector(
      '#scfAccountingExportWhatsapp'
    );

  const accountingExportSend =
    accountingExportOverlay.querySelector(
      '#scfAccountingExportSend'
    );

  const accountingExportCancel =
    accountingExportOverlay.querySelector(
      '#scfAccountingExportCancel'
    );

  const accountingExportStatus =
    accountingExportOverlay.querySelector(
      '#scfAccountingExportStatus'
    );

  const accountingExportClose =
    accountingExportOverlay.querySelector(
      '#scfAccountingExportClose'
    );

  const accountingExportExit =
    accountingExportOverlay.querySelector(
      '#scfAccountingExportExit'
    );

  let accountingExportPending =
    null;

  let accountingExportBusy =
    false;

  const MONTHS = [
    'JANEIRO',
    'FEVEREIRO',
    'MARÇO',
    'ABRIL',
    'MAIO',
    'JUNHO',
    'JULHO',
    'AGOSTO',
    'SETEMBRO',
    'OUTUBRO',
    'NOVEMBRO',
    'DEZEMBRO'
  ];

  const FOLDER_ICON =
    'data:image/png;base64,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';

  let offset = 0;
  let total = 0;
  let hasMore = false;
  let loading = false;
  let vendas = [];

  /*
   * Cache visual do Histórico:
   * - a lista já validada permanece disponível enquanto uma nova leitura é feita;
   * - a atualização usa um buffer separado e só substitui `vendas` quando TODAS
   *   as páginas retornarem;
   * - nenhuma regra fiscal, filtro ou resultado persistido é alterado.
   */
  let historicoCompletoPronto = false;
  let atualizacaoSilenciosa = false;
  let atualizacaoPendente = false;
  let vendasAtualizacao = [];
  let totalAtualizacao = 0;
  let offsetAtualizacao = 0;

  let selectedMonth = null;
  let selectedYear =
    new Date().getFullYear();

  function text(value){
    return String(
      value ?? ''
    ).trim();
  }

  function money(value){
    const number =
      Number(
        value
      );

    return (
      Number.isFinite(
        number
      )
        ? number
        : 0
    ).toLocaleString(
      'pt-BR',
      {
        style:
          'currency',

        currency:
          'BRL'
      }
    );
  }

  function parsedDate(value){
    const date =
      value
        ? new Date(
            value
          )
        : null;

    return (
      date &&
      !Number.isNaN(
        date.getTime()
      )
    )
      ? date
      : null;
  }

  function dateTime(value){
    const date =
      parsedDate(
        value
      );

    if(!date){
      return 'DATA NÃO INFORMADA';
    }

    return [
      date.toLocaleDateString(
        'pt-BR'
      ),

      date.toLocaleTimeString(
        'pt-BR',
        {
          hour:
            '2-digit',

          minute:
            '2-digit'
        }
      )
    ].join(
      ' '
    );
  }

  function statusInfo(venda){
    const fiscalStatus =
      text(
        venda.fiscalStatus
      ).toUpperCase();

    if(
      venda.autorizada ===
        true ||
      fiscalStatus ===
        'AUTORIZADA'
    ){
      return {
        label:
          'NFC-e AUTORIZADA',

        className:
          'is-authorized'
      };
    }

    if(
      fiscalStatus.includes(
        'REJEIT'
      )
    ){
      return {
        label:
          'NFC-e REJEITADA',

        className:
          'is-rejected'
      };
    }

    if(
      fiscalStatus.includes(
        'ERRO'
      ) ||
      fiscalStatus.includes(
        'REVISAO'
      ) ||
      fiscalStatus.includes(
        'REVISÃO'
      )
    ){
      return {
        label:
          fiscalStatus ||
          'ERRO FISCAL',

        className:
          'is-error'
      };
    }

    if(
      fiscalStatus ===
        'PRECHECK_APROVADO'
    ){
      return {
        label:
          'PRONTA PARA EMISSÃO',

        className:
          'is-pending'
      };
    }

    return {
      label:
        fiscalStatus ||
        'PENDENTE',

      className:
        'is-pending'
    };
  }

  function createElement(
    tag,
    className,
    value
  ){
    const element =
      document.createElement(
        tag
      );

    if(className){
      element.className =
        className;
    }

    if(
      value !==
        undefined
    ){
      element.textContent =
        text(
          value
        );
    }

    return element;
  }

  function saleKey(
    venda,
    index
  ){
    const saleId =
      text(
        venda &&
        venda.saleId
      );

    if(saleId){
      return `ID:${saleId}`;
    }

    return [
      'FALLBACK',
      text(
        venda &&
        venda.saleNumber
      ),
      text(
        venda &&
        venda.saleDate
      ),
      text(
        venda &&
        venda.numeroNfce
      ),
      text(
        venda &&
        venda.totalValue
      ),
      index
    ].join(
      '|'
    );
  }

  function removeDuplicates(
    items
  ){
    const seen =
      new Set();

    return items.filter(
      (
        venda,
        index
      ) => {
        const key =
          saleKey(
            venda,
            index
          );

        if(
          seen.has(
            key
          )
        ){
          return false;
        }

        seen.add(
          key
        );

        return true;
      }
    );
  }

  function availableYears(){
    const years =
      Array.from(
        new Set(
          vendas
            .map(
              (venda) => {
                const date =
                  parsedDate(
                    venda.saleDate
                  );

                return date
                  ? date.getFullYear()
                  : null;
              }
            )
            .filter(
              Number.isInteger
            )
        )
      )
        .sort(
          (
            first,
            second
          ) =>
            second -
            first
        );

    if(
      years.length ===
        0
    ){
      years.push(
        new Date()
          .getFullYear()
      );
    }

    return years;
  }

  function normalizeSelectedYear(){
    const years =
      availableYears();

    if(
      !years.includes(
        selectedYear
      )
    ){
      selectedYear =
        years[0];
    }

    return years;
  }

  function salesFromYear(
    year
  ){
    return vendas.filter(
      (venda) => {
        const date =
          parsedDate(
            venda.saleDate
          );

        return (
          date &&
          date.getFullYear() ===
            year
        );
      }
    );
  }

  function salesFromMonth(
    year,
    month
  ){
    return vendas
      .filter(
        (venda) => {
          const date =
            parsedDate(
              venda.saleDate
            );

          return (
            date &&
            date.getFullYear() ===
              year &&
            date.getMonth() ===
              month
          );
        }
      )
      .sort(
        (
          first,
          second
        ) => {
          const firstDate =
            parsedDate(
              first.saleDate
            );

          const secondDate =
            parsedDate(
              second.saleDate
            );

          return (
            secondDate
              ? secondDate.getTime()
              : 0
          ) -
          (
            firstDate
              ? firstDate.getTime()
              : 0
          );
        }
      );
  }

  function pluralSales(
    quantity
  ){
    return quantity ===
      1
      ? '1 VENDA'
      : `${quantity} VENDAS`;
  }

  function createYearSelector(
    years
  ){
    const bar =
      createElement(
        'div',
        'scf-sales-history-year-bar'
      );

    const label =
      createElement(
        'label',
        'scf-sales-history-year-label',
        ''
      );

    label.htmlFor =
      'scfSalesHistoryYearSelect';

    const select =
      createElement(
        'select',
        'scf-sales-history-year-select'
      );

    select.id =
      'scfSalesHistoryYearSelect';

    select.setAttribute(
      'aria-label',
      'Ano do histórico'
    );

    /*
     * O ano permanece apenas visível nesta etapa.
     * O bloqueio evita que o seletor nativo do iPhone seja aberto.
     */
    select.disabled =
      true;

    select.tabIndex =
      -1;

    select.setAttribute(
      'aria-disabled',
      'true'
    );

    years.forEach(
      (year) => {
        const option =
          createElement(
            'option',
            '',
            String(
              year
            )
          );

        option.value =
          String(
            year
          );

        option.selected =
          year ===
            selectedYear;

        select.append(
          option
        );
      }
    );

    label.append(
      select
    );

    const actions =
      createElement(
        'div',
        'scf-sales-history-export-actions'
      );

    const mdeButton =
      createElement(
        'button',
        'scf-sales-history-export scf-sales-history-mde-open'
      );

    mdeButton.type =
      'button';

    /*
     * MD-e aparece somente dentro de uma pasta mensal aberta.
     * Na tela inicial da página FISCAL ele permanece oculto.
     */
    mdeButton.hidden =
      selectedMonth ===
        null;

    mdeButton.dataset.year =
      String(
        selectedYear
      );

    const mdeIcon =
      createElement(
        'img',
        'scf-sales-history-export-icon'
      );

    mdeIcon.alt = '';
    mdeIcon.setAttribute(
      'aria-hidden',
      'true'
    );
    mdeIcon.src =
      'data:image/png;base64,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';

    const mdeText =
      createElement(
        'span',
        'scf-sales-history-export-text',
        'MD-e'
      );

    mdeButton.append(
      mdeIcon,
      mdeText
    );

    mdeButton.setAttribute(
      'aria-label',
      `Abrir módulo MD-e para ${selectedYear}`
    );

    mdeButton.addEventListener(
      'click',
      function(){
        window.__scfPdvInfra.eventBus.dispatch(
          new CustomEvent(
            'scf:mde-abrir',
            {
              detail: {
                year:
                  selectedYear
              }
            }
          )
        );

        window.__scfPdvInfra.shellBridge.post({
          type:
            'SCF_MDE_ABRIR',

          year:
            selectedYear
        }, '*');
      }
    );

    const exportButton =
      createElement(
        'button',
        'scf-sales-history-export scf-sales-history-export-start'
      );

    exportButton.type =
      'button';

    /*
     * EXPORTAR XML existe somente dentro de uma pasta mensal aberta.
     * Na tela anual das 12 pastas ele permanece totalmente oculto.
     */
    exportButton.hidden =
      selectedMonth ===
        null;

    exportButton.dataset.year =
      String(
        selectedYear
      );

    const exportIcon =
      createElement(
        'img',
        'scf-sales-history-export-icon'
      );

    exportIcon.alt = '';
    exportIcon.setAttribute(
      'aria-hidden',
      'true'
    );
    exportIcon.src =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAYAAAD0eNT6AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAN1wAADdcBQiibeAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAB1ISURBVHic7d151K1nWR7w6z4JCUNCmaUYIQyKylBDRU2UKYoWIQwKMilYqFVoqbXq0gpVlgWlrZpKWSpYsFBdgEssIINxgAYEFYzIGCrDiihRBEQgZjLk6R/7O8k5O2f4vu/svZ/9vs/vt9a3yEpO9r4WSc5z7ft+33dXay0AwFgO9A4AAGyeAgAAA1IAAGBACgAADEgBAIABKQAAMCAFAAAGpAAAwIAUAAAYkAIAAANSAABgQAoAAAxIAQCAASkAADAgBQAABqQAAMCAFAAAGJACAAADUgAAYEAKAAAMSAEAgAEpAAAwIAUAAAakAADAgBQAABiQAgAAA1IAAGBACgAADEgBAIABKQAAMCAFAAAGdHLvAAAcX1V9VZLHJPnaJDdPclqS05OclOSiJG/f+XlHa+2KXjmZjmqt9c4AwBFU1RlJnpbFwf+lu/zbrkzy80l+urX22XVlY/oUAIAtVFVPSvL8JP9kny/xqSTPTvLC1to1q8rFfCgAAFukqm6b5IVJHrWil3x/kse11t63otdjJhQAgC1RVWcm+cMkt1/xS1+e5BmttZes+HWZMAUAYAtU1WlZXMR3rzW+zcuSPL219g9rfA8mwm2AAJ1VVSX531nv4Z8kT0ryzqq655rfhwlQAAD6e2aSR27ovb4iyR9X1VM29H5sKSsAgI6q6vQkf5XFvf2bZiUwMBMAgL7+Vfoc/omVwNBMAAA6qaqTknw4yZmdo7hLYEAmAAD9PDT9D/8kuWmSF1fVS6vqZr3DsBkKAEA/9+kdYImVwEAUAIB+dvt8/01yl8AgFACAfu7WO8BRWAkMwEWAAJ1U1aeT3Kp3juO4OMl3+C6B+TEBAOhn2w//xEpgtkwAADqpqqn9BuzBQTOiAAB0MsECkFgJzIYVAAB7YSUwEyYAAJ1MdAJwKCuBCVMAADqZQQFIrAQmywoAgBNhJTBRJgAAncxkAnAoK4EJUQAAOplhAUisBCbDCgCAVbISmAgTAIBOZjoBOJSVwBZTAAA6GaAAJFYCW8sKAIB1shLYUiYAAJ0MMgE4lJXAFlEAADoZsAAkVgJbwwoAgE2yEtgSa58AVNXNkpyb5K5J7nCEn9PXGoCt1lqr3hmgl0EnAIeyEuhoLQWgqm6b5Lwkj0zy4CQ3XvmbMAsKACNTAJJYCXSzsgJQVackeWqSJyQ5J9YL7IICwMgUgOtcnuQZrbWX9A4ykhMuAFVVSR6f5DlJ7ryKUIxDAWBkCsANWAls0AkVgKr65iTPS3LWyhIxFAWAkSkAR2QlsCH7GtNX1RlV9btJLojDH4DVcZfAhux5AlBVZyf5zSS3X0sihmICwMhMAI7LSmCN9jQBqKonJ3lzHP4ArN+Tkryzqu7ZO8gc7aoAVNVJVfUzSf5XklPXmggArmclsCbHXQFU1UlJXpXkERtJxFCsABiZFcCeWQms0G4mAP8lDn8A+rMSWKFjFoCdnf8PbigLAByPlcCKHHUFsHO1/5tj588aWQEwMiuAE2YlcAKOWACq6owk74yr/VkzBYCRKQAr4cFB+3S0FcCvxOEPwPazEtinGxSAncf7flOHLACwHzdN8uKqeunOV9CzC4etAHa+2OeieLwvG2IFwMisANbCSmCXlicAj4/DH4DpshLYpesmAFV1SpIPxlf6skEmAIzMBGDt3CVwDIdOAJ4ahz8A8+HBQcdwaAF4QrcUALAeVgJHUa21VNVtk/xN9vjtgHCirAAYmRXAxlkJHOLggf/wOPwBmDcrgUMcPPQf2TUFAGyGlcCOSnKzJJ9KcuPOWRiQFQAjswLobuiVwIEk58bhD8B4hl4JHEhy194hAKCTYVcCB5LcoXcIAOhoyO8SUAAAYGGolYACAADXG2YloAAAwOGGWAlUks8lOb13EMbkNkBG5jbASZjt1wtXEv8C0o0CMJ6dbx69fZLTsvjwsZufo/3aUzYcnzFdnuQZrbWX9A6ySgoAXSkA81VVt0vy5UnuvvNz8I/vnOSkjtFgv2b14CAFgK4UgGnb+TR/txx+wB/841t0jAbrMpuVgAJAVwrAdFTVnZM8MMk94tM8Y5vFSkABoCsFYHtV1R2SPCiLx4Wfm+TMroFg+0x6JaAA0JUCsD2q6tZZfMI/eOB/eddAMA2TXQkoAHSlAPRTVacnuX+uP/D/WRa/JwB7M8mVgAJAVwrA5lTVjZN8fa4/8L86ycldQ8G8TGoloADQlQKwXlVVSR6Q5LuSPDrJzfsmgtmbzEpAAaArBWA9quruWXyxyXcmuWPnODCaSawEFAC6UgBWp6puk+RxWRz89+0cB9jylYACQFcKwImpqlOTPCyLQ/8hSW7UNxGwZGtXAgoAXSkA+1NV52Rx6H9Hklt2jgMc21auBBQAulIAdq+qzkzy5Cwu6Ltr1zDAfmzVSkABoCsF4Piq6iuT/FgW+32P3YVp25qVwIHeAYAjq6qzquo3krwvyRPj8Ic5+Iokf1xVT+kdxASArkwAbqiqzk7yrCTf2jsLsFZdVwIKAF0pANerqgdlcfCf2zsLsDHdVgJWANBZVT2kqt6W5E1x+MNouq0ETADoatQJwM4jeh+V5JlJ7tM5DrAdNroSUADoarQCUFUnJXlsFlf136NzHGD7bGwlYAUAG1JV52XxH/evxeEPHNnGVgImAHQ1wgRg5wE+z09yXt8kwMSsdSWgANDVnAtAVZ2S5Iez2PPfpHMcYJrWthJQAOhqrgWgqh6c5AVJvqx3FmDy1vJdAgoAXc2tAFTVFyf5uSy+pAdglVa6ElAA6GouBaCqTk7y/UmeneS0vmmAGVvZSsBdAHCCqup+Sd6V5Gfi8AfWa2V3CSgAsE9VdbuqemmStyS5Z+88wDBumuTFVfXSqrrZfl/ECoCuprgCqKoDSb4vyXOT3KJzHGBs+14JKAB0NbUCUFVfkuQVSc7pnQVgx77uErACgF2qqodmset3+APbZF8rgeEnAFP7BMrm7Vzh/1NJfiiL/2YAttWuVwIKgALAMVTVHbMY+Z/dOwvALu1qJWAFAEdRVQ/LYuTv8AemZFcrARMAEwCWVNWNkvx0kv8QI39g2t6b5Ftaa3+9/BcUAAWAQ+yM/F+Z5Ot6ZwFYkY8k+abW2iWH/kkrANhRVedlMfJ3+ANzctckb62qux36JxUAhldVN6qqn03y2iS36p0HYA3OSPJrOw8yS6IAMLiqulOSt2ax7weYs6/J4kvLkrgGwDUAA6uq+yd5dZJb9s4CsCGXJ7lHa+0SEwCGVFWPTHJBHP7AWG6a5N8mJgAmAAOqqu9J8otJTuqdBaCDS5N8iQkAQ6mq/5TkRXH4A+O6Q5JvPLl3CtiEnStfn5/k3/TOArAFzlMAmL2qOiXJryZ5TO8sAFviLgoAs1ZVp2dxpf+5vbMAbJE7ugjQRYCzVVVflOSNSc7qnQVgy3zWBIBZqqq7JPmdLB6BCcASdwEwO1V1VpK3x+EPcDQfUwCYlap6UJL/m+SLOkcB2GYKAPOx83S/Nya5ee8sAFvuoy4CdBHgLOx88n9jklN7ZwGYgG9WABSAyauqr0pyYXzyB9gNjwJm+qrqzjH2B9iLl7fWrjUBMAGYrKq6XZK3Jblb7ywAE+HrgJm2qjotyRvi8AfYi2e11i5JfB2wCcAEVdWNkrw+yYN7ZwGYkHckObu1dm3iQUBMTFVVkpfG4Q+wF3+V5IkHD/9EAWB6zk/y+N4hACbkI0nu11r78KF/UgFgMqrqR5J8f+8cABPy3iwO/0uW/4ICwCRU1XcneV7vHAAT8rIsdv5/faS/6CJAFwFuvap6aJJXJ/HtlQDHd3mSZ7TWXnKsX6QAKABbrarOTvJ7SW7aOwvABFyc5Dtaa+873i+0AmBrVdUZSV4bhz/AbrwsyX13c/gnRqpsqao6OcnLk9ymdxaALberkf8yBYBt9Zwk39A7BMCW2/XIf5lrAFwDsHWq6iFZPOnPPxuAo3tZkqe31v5hP3+zAqAAbJWdvf+fJbl17ywAW2pfI/9lVgBsjZ29/yvi8Ac4mn2P/Je5C4Bt8pwkX987BMCW2tNV/sdjBWAFsBWq6luTvC72/gDLVjLyX6YAKADd2fsDHNXKRv7LrADoyt4f4KhWOvJf5iJAentu7P0BDrWWkf8yKwArgG7s/QFuYG0j/2UKgALQRVV9SZJ3xegf4KATerDPXlkBsHFVdSD2/gAHbWTkv0wBoIfvS3JO7xAAW2BjI/9lVgBWABtVVbdL8v+S3KJ3FoDONjryX2YCwKb9tzj8gbF1GfkvMwEwAdiYqrpfkrf0zgHQUbeR/zIPAmIjdh748wu9cwB0tNYH++yVFQCb8v1J7tk7BEAHWzHyX2YFYAWwdlX1xUk+mOS03lkANmxrRv7LrADYhJ+Lwx8Yz1aN/JeZAJgArFVVPTjJ7/TOAbBBWznyX6YAKABrU1WnJHlvki/rnQVgQ7Z25L/MCoB1+uE4/IFxbPXIf5kJgAnAWlTVmUk+kOQmfZMArN0kRv7L3AbIujw/Dn9g/iYz8l9mBcDKVdV5Sc7rnQNgzSY18l9mBWAFsFJVdVIWjfhLe2cBWJNJjvyXWQGwao+Nwx+Yr8mO/JeZAJgArExVVRa3/d2jdxaANej69b2rZgLAKj0qDn9gfmYx8l9mAmACsDJVdVGS+/TOQRfXJPmbJB9f+rk0yeeTXJnkip2fK5f+94okV7bWvrD52H1V1dC//07EbEb+y0wAWImqekgc/nN3WRYrnvcmeV+Sj+X6g/4TrbVrO2aDdZjVyH+ZAsCqPKt3AFbmC0k+lOQ9uf7Af0+SS1prPrEyglmO/JcpAJywqnpQknN652Df/j7JHyS5MMlbkryntXZl30jQzWxH/ssUAFbBp/9p+VSSt2Zx4F+YxYFvfA8zH/kvUwA4IVV1dpJze+fgmK5O8rtJ3pDFgf8Bo3w4zBAj/2UKACfKp//tdEWS307yG0le11r7XOc8sK2GGfkvcxug2wD3rarOSvKnvXNwncuSvD7Jq5K8YZQx5pS5DbC7oUb+y0wAOBHP7B2AXJXkN5O8MskFLt6DXRly5L/MBMAEYF+q6iuzuBfc/399XJzkl5O8tLX2d73DsD8mAF0MO/JfZgLAfv1YHP6bdmUWO/0Xtdbe2jsMTNDQI/9lJgAmAHtWVWcm+XCSk/omGcbFSV6U5GU+7c+LCcDGGPkfgQkA+/HkOPw34YIkP91au7B3EJgwI/+jMAEwAdizqvpwkrv2zjFTLclrkjy3tfYnvcOwXiYAa2fkfwwmAOxJVZ0Th/86XJvk15P8VGvtvb3DwMQZ+e+CAsBePal3gJm5JsmvZjHq//PeYWAGjPx3yQrACmDXqurUJH+d5Ja9s8zAtUleksWo/5LOWejECmDljPz3wASAvXhYHP6r8OYkP9Bae3fvIDATRv77oACwF8b/J+YjSX64tfZ/egeBGTHy3ycrACuAXamq2yS5NMmNemeZoM8leU6Sn2+tXd07DNvDCuCEGfmfABMAdutxcfjv1bVJXpzkWa21v+0dBmbEyH8FFAB2y/h/b96R5F/b88PKGfmvyIHeAdh+VXX3JPftnWMirkryo0nOcfjDyr0syX0d/qthAsBu+PS/O+9I8i9bax/oHQRmxsh/DVwE6CLAY6qqSnJJkjt2jrLNrkryE0l+prX2hd5hmA4XAe6Kkf+amABwPA+Iw/9YfOqH9XGV/xq5BoDj+a7eAbbU1bl+1+/wh9W6PMlTW2tPdvivjxWAFcBRVdWNk3wiyc17Z9kyf5HkMa21d/YOwrRZARyRkf+GmABwLF8fh/+y307yzx3+sBau8t8gBYBjObd3gC1ybZJnJ3loa+3TnbPA3Bj5d+AiQI5FAVj4dJInttYu6B0EZsjIvxPXALgG4Iiq6vQkfxcl8R1Z7Ps/1jsI8+MaAFf592QFwNHcPw7/X0xyP4c/rJyR/xYY/Td4jm7k8f+1SX6gtfb83kFghoz8t4QCwNGMWgCuSvKdrbXf6B0EZsjIf4u4BsA1ADdQVbdO8sks/v0YyWeSPKK19tbeQRjDQNcAeJb/FjIB4EgemPEO/79M8i881Q9Wzsh/S7kIkCMZbfz/niRf5/CHlfNgny2mAHAkIxWAN2Vxpf+lvYPAjLjKfwJcA+AagMNU1R2SfLx3jg15VZIntNau7h2EMc30GgAj/4kwAWDZg3oH2JBXJ3m8wx9Wysh/QlwEyLIRxv+vS/LY1to/9g4CM+Eq/wlSAFg29wLwxiSP9skfVsbIf6KsALhOVd05yZm9c6zR7yb5ttbaVb2DwEwY+U+YCQCHemDvAGv0piwe8nNl7yAwA0b+M6AAcKh79A6wJhcmOa+1dkXvIDADRv4zYQXAob68d4A1+OMkD2utXd47CMyAkf+MmABwqLv3DrBif5Hk4a21y3oHgYkz8p8hDwLyIKAkSVWdksV/5Cf1zrIin0tyTmvt/b2DwNFU1aeT3Kp3juMw8p8pKwAOulvmc/hfk8VvWA5/tt2Hewc4DiP/GVMAOGhO4/9ntNYu6B0CdmFbC4Bn+Q/ANQAcNJcLAM9vrf1S7xCwSx/qHeAIjPwHYQLAQXOYAPxWkh/qHQL24F29Aywx8h+IAsBBUy8A78riy32u7R0E9uB1ST7WO0SM/IekAHDQlFcAn0nySL9xMTWttS8keUHnGBcn+Vq3+I1HASBVdbskt+id4wQ8pbW2DZ+iYD9+OUmv8mrkPzAFgGTan/7/R2vt1b1DwH611v4+yX/f8Nsa+aMAkGS6+/8/jYv+mIcfz+KrqjfByJ8kCgALUywAn0/y2Nba1b2DwInauXj18Uk+uOa3MvLnOgoAyTRXAN/bWtvWh6jAnrXWPpvkvCSfXMPLG/lzAwoAyfQmAP+ztfby3iFg1XZK7b2zuD1wVd4fI3+OwJcBDf5lQBP8EqD3ZzHCvKJ3EFinqnpqkvOTnL7Pl/hkkmcneVFr7ZpV5WI+FAAF4I5ZfG3uFFyT5Ktba+/uHQQ2oarulORpSR6d5K67/NuuyKI4PK+19vl1ZWP6FAAF4Cuz+FQ9Bc9rrf3H3iGgh6q6T5LHJPmaLKYCB38qyUVJ3pbk7Une2Vq7sldOpkMBUAC+Nskf9c6xCx9Oci+/sQGshosA2e9+cdO+1+EPsDoKAFMoAL/SWntT7xAAc6IAsO0F4G+T/GDvEABzowCw7QXg37XWPtM7BMDcKABscwF4fWvtlb1DAMyRAsC2FoB/SPL03iEA5koBYFsLwPmttY/1DgEwVwoA21gAPpnkv/YOATBnCgDbWAD+s0eYAqyXAsBpvQMs+WiSX+odAmDuFAC2bQLwzNbaP/YOATB3CgDbVAAuSuK2P4ANUADYpgLwI621ob+cCmBTFAC2pQBc0Fr7/d4hAEbh64B9HfBVSU7pHKMlOau19u7OOQCGYQLAZ3sHSPIqhz/AZikAvK/z+7ckz+6cAWA4CgDv7/z+v95a650BYDgKAD0P32uT/GTH9wcYlgJAzxXAK1trH+j4/gDDcheAuwBOS/KxJLfc8Ftfm+QerbUPbvh9AYgJwPBaa5cleU6Ht365wx+gHxOAwScASVJVpyS5OMldNvSWn09y79baJRt6PwCWmACQ1trVSX50g2/57x3+AH2ZAJgAXKeq3pbknDW/zW+11h6+5vcA4DgUAAXgOlV1+yQXJLn3mt7ib7MY/X9iTa8PwC5ZAXCd1trfJLl/kres4eUvTvINDn+A7aAAcJjW2meTfEuSV6/wZV+f5Otaax9a4WsCcAIUAG6gtXZlkkdn8ZS+vzuBl7p85zUe3lr73CqyAbAargFwDcAxVdVNkjwxyTOy+2sD/jLJC5L8cmvtM+vKBsD+KQAKwK5V1QOSPCHJmUnO2Pn5QpKPHPLzJ1lc6X9Np5gA7IICoAAAMKCTewcAGFVV+QBGNy4CBIABKQAAMCAFAAAGpAAAwIAUAAAYkAIAAANSAABgQAoAAAxIAQCAASkAADAgBQAABqQAAMCAFAAAGJACAAADUgAAYEAKAAAMSAEAgAEpAAAwIAUAAAakAADAgBQAABiQAgAAA1IAAGBACgAADEgBAIABKQAAMCAFAAAGpAAAwIAUAAAYkAIAAANSAABgQAoAAAxIAQCAASkAADAgBQAABqQAAMCAFAAAGJACAAADUgAAYEAKAAAMSAEAgAEpAAAwIAUAAAakAADAgBQAABiQAgAAA1IAAGBACgAADEgBAIABKQAAMCAFAAAGpAAAwIAUAAAYkAIAAANSAABgQAoAAAxIAQCAASkAADAgBQAABqQAAMCAFAAAGJACAAADUgAAYEAKAAAMSAEAgAEpAAAwIAUAAAakAADAgBQAABiQAgAAA1IAAGBACgAADEgBAIABKQAAMCAFAAAGpAAAwIAUAAAYkAIAAANSAABgQAoAAAxIAQCAASkAADAgBQAABqQAAMCAFAAAGJACAAADUgAAYEAKAAAMSAEAgAEpAAAwIAUAAAakAADAgBQAABiQAgAAA1IAAGBACgAADEgBAIABKQAAMCAFAAAGpAAAwIAUAAAYkAIAAANSAABgQAoAAAxIAQCAASkAADAgBQAABqQAAMCAFAAAGJACAAADUgAAYEAKAAAMSAEAgAEpAAAwIAUAAAakAADAgBQAABiQAgAAA1IAAGBACgAADEgBAIABKQAAMCAFAAAGpAAAwIAUAAAYkAIAAAM6uXeA3qqq9c4AAJtmAgAAA1IAAGBACgAADEgBAIABKQAAMCAFAAAGpAAAwIAUAAAYkAIAAANSAABgQAoAAAxIAQCAASkAADAgBQAABqQAAMCAFAAAGJACAAADUgAAYEAKAAAMSAEAgAEpAAAwIAUAAAakAADAgBQAABiQAgAAA1IAAGBACgAADEgBAIABKQAAMCAFAAAGpAAAwIAOJLmsdwgAhuPs6exAkkt7hwBgOM6ezhQAAHpw9nSmAADQg7OnMwUAgB6cPZ0pAAD04Ozp7ECSj/YOAcBwnD2dVZLTknwqyamdswAwhquT3Ka19vneQUZ2oLV2WZLf7x0EgGG82eHf38EnAb66awoARvKa3gFIqrWWqvqiLC7I8GhgANbtjNbax3uHGN2BJGmtfSLJH3XOAsD8XeTw3w6HfuJ/RbcUAIzCWbMlqrW2+IOqU5P8eZI7dk0EwFxdmuRLW2uX9w7CIROA1tpVSX68YxYA5u0nHP7b47oJQJJU1YEkf5bkXt0SATBHH0hy79baF3oHYeGwq/5ba9cm+dFOWQCYrx9x+G+XwyYA1/3JqjcneeDG0wAwRxe21h7YOwSHO1oBuFOSdya57cYTATAnn0xy39baX/QOwuGO+OCfnX9Q35bF85oBYD+uTvJtDv/tdNQn/7XW/iDJ0zaYBYB5edrOWcIWOuajf1trL0ly/oayADAf5++cIWypI14DcNgvqDopyauSPGIjiQCYutck+XZX/W+34375z84/wG9P8rPrjwPAxJ0fh/8kHHcCcNgvrnpykhcmOXVtiQCYoquz2Pkb+0/EngpAklTV2Ul+M8nt15IIgKn5ZBZX+7vgb0KOuwJY1lr7wyT3TfJ7q48DwMRcmMV9/g7/idlzAUiS1tpftdYenOQhSd6z2kgATMAHkpzXWnug+/ynaV8F4KDW2m8nOSvJdyf5y1UEAmCrXZrke7L4Yp/X9Q7D/u35GoCjvlDVjbN4cNDjslgR1EpeGIBtcFGSVyT5BV/pOw8rKwCHvWjVP03y8J2fb4y7BgCm5uokb87inv7XttY+3jkPK7aWAnDYG1SdluTcJHdJcocj/Jy+1gAAHM1lWYz0l38+muRNrbXPd8zGmq29AAAA2+eELgIEAKZJAQCAASkAADAgBQAABqQAAMCAFAAAGJACAAADUgAAYEAKAAAMSAEAgAEpAAAwIAUAAAakAADAgBQAABiQAgAAA1IAAGBACgAADEgBAIABKQAAMCAFAAAGpAAAwIAUAAAYkAIAAANSAABgQAoAAAxIAQCAASkAADAgBQAABqQAAMCAFAAAGJACAAAD+v+BWlxkI2R3+gAAAABJRU5ErkJggg==';

    const exportText =
      createElement(
        'span',
        'scf-sales-history-export-text',
        'EXPORTAR XML'
      );

    exportButton.append(
      exportIcon,
      exportText
    );

    exportButton.setAttribute(
      'aria-label',
      selectedMonth !== null
        ? `Exportar XML das NFC-e de ${MONTHS[selectedMonth]} de ${selectedYear}`
        : `Exportar XML do mês aberto em ${selectedYear}`
    );

    actions.append(
      exportButton,
      mdeButton
    );

    bar.append(
      actions,
      label
    );

    return bar;
  }

  function accountingEmailValue(
    value
  ){
    return String(
      value || ''
    )
      .trim()
      .toLowerCase();
  }

  function accountingEmailValid(
    value
  ){
    const email =
      accountingEmailValue(
        value
      );

    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i
      .test(email);
  }

  function isAuthorizedSale(
    venda
  ){
    return (
      venda &&
      (
        venda.autorizada ===
          true ||
        text(
          venda.fiscalStatus
        ).toUpperCase() ===
          'AUTORIZADA'
      ) &&
      Boolean(
        text(
          venda.saleId
        )
      )
    );
  }

  function selectedAuthorizedSales(
    months
  ){
    const allowedMonths =
      new Set(
        months
      );

    return vendas.filter(
      (venda) => {
        const date =
          parsedDate(
            venda.saleDate
          );

        return (
          date &&
          date.getFullYear() ===
            selectedYear &&
          allowedMonths.has(
            date.getMonth()
          ) &&
          isAuthorizedSale(
            venda
          )
        );
      }
    );
  }

  function setAccountingExportStatus(
    message,
    type
  ){
    accountingExportStatus.textContent =
      text(
        message
      );

    accountingExportStatus.className =
      [
        'scf-accounting-export-status',
        type ===
          'error'
          ? 'is-error'
          : type ===
              'success'
            ? 'is-success'
            : ''
      ]
        .filter(Boolean)
        .join(' ');
  }

  function closeAccountingExport(){
    accountingExportOverlay.classList.remove(
      'is-processing',
      'is-complete'
    );

    accountingExportClose.style.display =
      'none';

    accountingExportOverlay.style.display =
      'none';

    accountingExportOverlay.setAttribute(
      'aria-hidden',
      'true'
    );

    document.body.classList.remove(
      'scf-accounting-export-open'
    );

    accountingExportPending =
      null;

    accountingExportBusy =
      false;

    accountingExportSend.disabled =
      false;

    accountingExportSend.textContent =
      'ENVIAR';

    accountingExportWhatsapp.value =
      '';

    accountingExportWhatsapp.setCustomValidity(
      ''
    );

    setAccountingExportStatus(
      '',
      ''
    );
  }

  function openAccountingExport(
    months
  ){
    const authorizedSales =
      selectedAuthorizedSales(
        months
      );

    if(
      authorizedSales.length ===
        0
    ){
      summary.textContent =
        'NENHUMA NFC-e AUTORIZADA NESTE MÊS';

      return;
    }

    accountingExportPending = {
      year:
        selectedYear,

      months:
        months.slice(),

      monthNames:
        months.map(
          (month) =>
            MONTHS[month]
        ),

      saleIds:
        authorizedSales.map(
          (venda) =>
            text(
              venda.saleId
            )
        )
    };

    accountingExportWhatsapp.value =
      '';

    accountingExportWhatsapp.setCustomValidity(
      ''
    );

    accountingExportBusy =
      false;

    accountingExportSend.disabled =
      false;

    accountingExportSend.textContent =
      'ENVIAR';

    setAccountingExportStatus(
      '',
      ''
    );

    accountingExportOverlay.classList.remove(
      'is-processing',
      'is-complete'
    );

    accountingExportClose.style.display =
      'none';

    accountingExportOverlay.style.display =
      'flex';

    accountingExportOverlay.setAttribute(
      'aria-hidden',
      'false'
    );

    document.body.classList.add(
      'scf-accounting-export-open'
    );

    setTimeout(
      function(){
        accountingExportWhatsapp.focus();
      },
      60
    );
  }

  accountingExportWhatsapp.addEventListener(
    'input',
    function(){
      accountingExportWhatsapp.value =
        accountingEmailValue(
          accountingExportWhatsapp.value
        );

      accountingExportWhatsapp.setCustomValidity(
        ''
      );
    }
  );

  accountingExportClose.addEventListener(
    'click',
    closeAccountingExport
  );

  accountingExportCancel.addEventListener(
    'click',
    function(){
      if(
        accountingExportBusy
      ) return;

      /*
       * CANCELAR fecha somente o card de exportação e mantém
       * o operador dentro da pasta mensal já aberta.
       */
      closeAccountingExport();
    }
  );

  accountingExportExit.addEventListener(
    'click',
    function(){
      closeAccountingExport();
    }
  );

  accountingExportSend.addEventListener(
    'click',
    function(){
      if(
        accountingExportBusy ||
        !accountingExportPending
      ) return;

      const email =
        accountingEmailValue(
          accountingExportWhatsapp.value
        );

      if(
        !accountingEmailValid(
          email
        )
      ){
        accountingExportWhatsapp.setCustomValidity(
          'Informe um e-mail válido.'
        );

        accountingExportWhatsapp.reportValidity();

        return;
      }

      accountingExportWhatsapp.setCustomValidity(
        ''
      );

      accountingExportBusy =
        true;

      accountingExportSend.disabled =
        true;

      accountingExportSend.textContent =
        'PREPARANDO...';

      accountingExportCancel.disabled =
        true;

      accountingExportOverlay.classList.remove(
        'is-complete'
      );

      accountingExportOverlay.classList.add(
        'is-processing'
      );

      setAccountingExportStatus(
        'PREPARANDO ARQUIVO ZIP',
        ''
      );

      window.__scfPdvInfra.shellBridge.post({
        type:
          'SCF_EXPORTAR_XML_ENVIAR_EMAIL',

        year:
          accountingExportPending.year,

        months:
          accountingExportPending.months,

        monthNames:
          accountingExportPending.monthNames,

        saleIds:
          accountingExportPending.saleIds,

        email
      }, '*');
    }
  );

  function renderFolders(){
    const years =
      normalizeSelectedYear();

    const salesInYear =
      salesFromYear(
        selectedYear
      );

    backButton.hidden =
      true;

    summary.textContent =
      `ANO ${selectedYear} • ${pluralSales(
        salesInYear.length
      )}`;

    list.replaceChildren();

    const existingYearBar =
      historyHeader.querySelector(
        '.scf-sales-history-year-bar'
      );

    if(existingYearBar){
      existingYearBar.remove();
    }

    const yearBar =
      createYearSelector(
        years
      );

    if(
      window.matchMedia(
        '(min-width:1001px)'
      ).matches
    ){
      historyHeader.append(
        yearBar
      );
    }else{
      list.append(
        yearBar
      );
    }

    const grid =
      createElement(
        'div',
        'scf-sales-history-month-grid'
      );

    MONTHS.forEach(
      (
        monthName,
        monthIndex
      ) => {
        const monthSales =
          salesFromMonth(
            selectedYear,
            monthIndex
          );


        const now =
          new Date();

        const futureMonth =
          selectedYear >
            now.getFullYear() ||
          (
            selectedYear ===
              now.getFullYear() &&
            monthIndex >
              now.getMonth()
          );

        const folderUnavailable =
          futureMonth;

        const classes = [
          'scf-sales-history-month-folder',
          futureMonth
            ? 'is-future-month'
            : ''
        ]
          .filter(Boolean)
          .join(' ');

        const folder =
          createElement(
            'button',
            classes
          );

        folder.type =
          'button';

        folder.dataset.month =
          String(
            monthIndex
          );

        folder.disabled =
          folderUnavailable;

        folder.setAttribute(
          'aria-pressed',
          'false'
        );

        folder.setAttribute(
          'aria-label',
          futureMonth
            ? `${monthName.toLowerCase()} de ${selectedYear}, mês futuro`
            : `Abrir vendas de ${monthName.toLowerCase()} de ${selectedYear}`
        );


        const icon =
          document.createElement(
            'img'
          );

        icon.className =
          'scf-sales-history-folder-icon';

        icon.src =
          FOLDER_ICON;

        icon.alt =
          '';

        icon.setAttribute(
          'aria-hidden',
          'true'
        );

        const name =
          createElement(
            'span',
            'scf-sales-history-month-name',
            monthName
          );

        const count =
          createElement(
            'span',
            'scf-sales-history-month-count',
            pluralSales(
              monthSales.length
            )
          );

        folder.append(
          icon,
          name,
          count
        );

        grid.append(
          folder
        );
      }
    );

    list.append(
      grid
    );

    /*
     * Dashboard anual: reaproveita exatamente a mesma fotografia já carregada
     * pelo Histórico. Não dispara nova busca e não altera regra fiscal.
     */
    window.__scfPdvInfra.eventBus.dispatch(
      new CustomEvent(
        'scf:historico-vendas-ano-dados',
        {
          detail: {
            year:
              selectedYear,

            vendas:
              salesInYear.slice()
          }
        }
      )
    );

    moreButton.hidden =
      true;
  }

  function createSaleCard(
    venda
  ){
    const card =
      createElement(
        'article',
        'scf-sales-history-item'
      );

    /*
     * PASSO 2:
     * Uma venda PJ não possui botão de 2ª via da NFC-e.
     * Portanto o saleId não pode depender da existência do cupom.
     */
    card.dataset.saleId =
      text(
        venda.saleId
      );

    /* Dashboard mensal: preserva o rateio real dos pagamentos quando disponível. */
    try{
      card.dataset.paymentParts =
        JSON.stringify(
          Array.isArray(venda.paymentParts)
            ? venda.paymentParts
            : []
        );
    }catch(error){
      card.dataset.paymentParts = '[]';
    }

    card.dataset.fiscalStatus =
      text(
        venda.fiscalStatus
      );

    /*
     * Coluna TIPO do Histórico de Vendas [Mês].
     * CONTINGÊNCIA tem prioridade quando a NFC-e nasceu em contingência.
     * A identificação permanece mesmo após a regularização/autorização:
     * - estado fiscal contendo CONTINGENCIA/CONTINGÊNCIA;
     * - flag contingenciaOffline, quando vier no objeto;
     * - tipoEmissao = 9, quando disponível;
     * - ou tpEmis=9 gravado na posição fiscal da chave de acesso de 44 dígitos.
     * Depois disso, INTERNO identifica VENDA INTERNA e NORMAL cobre as demais.
     */
    const fiscalStatusHistorico =
      text(
        venda.fiscalStatus
      ).toUpperCase();

    const chaveAcessoHistorico =
      text(
        venda.accessKey
      ).replace(/\D/g, '');

    const tipoEmissaoHistorico =
      Number(
        venda.tipoEmissao ||
        (
          venda.nfce &&
          venda.nfce.tipoEmissao
        ) ||
        0
      );

    const vendaContingenciaHistorico =
      Boolean(
        venda.contingenciaOffline === true ||
        fiscalStatusHistorico.includes('CONTINGENCIA') ||
        fiscalStatusHistorico.includes('CONTINGÊNCIA') ||
        tipoEmissaoHistorico === 9 ||
        (
          chaveAcessoHistorico.length === 44 &&
          chaveAcessoHistorico.charAt(34) === '9'
        )
      );

    const vendaInternaHistorico =
      Boolean(
        venda.vendaInterna === true ||
        ['VENDA_INTERNA','INTERNA'].includes(
          text(venda.origemVenda).toUpperCase()
        ) ||
        ['VENDA_INTERNA','INTERNA'].includes(
          text(venda.tipoVenda).toUpperCase()
        ) ||
        text(venda.rota).toUpperCase() === 'INTERNA' ||
        fiscalStatusHistorico === 'VENDA_INTERNA'
      );

    const tipoVendaHistorico =
      vendaContingenciaHistorico
        ? 'CONTINGÊNCIA'
        : vendaInternaHistorico
          ? 'INTERNO'
          : 'NORMAL';

    card.dataset.scfTipoVenda =
      tipoVendaHistorico;

    /*
     * Cancelamento normal de NFC-e:
     * o backend informa se a janela legal de 30 minutos
     * ainda está disponível, com base na Autorização de Uso.
     */
    card.dataset.podeCancelarNfce =
      venda.podeCancelarNfce ===
        true
        ? 'true'
        : 'false';

    card.dataset.prazoCancelamentoNfceAte =
      text(
        venda.prazoCancelamentoNfceAte
      );

    card.dataset.clienteId =
      text(
        venda.clienteId
      );

    card.dataset.nfe55DevolucaoAutorizada =
      venda.nfe55DevolucaoAutorizada ===
        true
        ? 'true'
        : 'false';

    /*
     * Métrica DEVOLUÇÕES: quantidade de documentos/operações autorizados
     * (TOTAL + PARCIAL) vinculados a esta venda. A SITUAÇÃO continua usando
     * nfe55DevolucaoAutorizada, que representa a devolução TOTAL existente.
     */
    card.dataset.nfe55DevolucoesAutorizadasQuantidade =
      String(
        Math.max(
          0,
          Math.trunc(
            Number(
              venda.nfe55DevolucoesAutorizadasQuantidade
            ) ||
            0
          )
        )
      );

    card.dataset.nfe55DevolucaoEstoqueAlterado =
      venda.nfe55DevolucaoEstoqueAlterado ===
        true
        ? 'true'
        : 'false';

    card.dataset.nfe55DevolucaoReembolsoExecutado =
      venda.nfe55DevolucaoReembolsoExecutado ===
        true
        ? 'true'
        : 'false';

    /*
     * Situação persistente da DEVOLUÇÃO PARCIAL agregada no backend.
     * A devolução TOTAL continua usando os datasets históricos acima.
     */
    card.dataset.nfe55DevolucaoParcialAutorizada =
      venda.nfe55DevolucaoParcialAutorizada ===
        true
        ? 'true'
        : 'false';

    card.dataset.nfe55DevolucaoParcialEstado =
      text(
        venda.nfe55DevolucaoParcialEstado
      );

    card.dataset.nfe55DevolucaoParcialOperacoesAutorizadas =
      String(
        Math.max(
          0,
          Math.trunc(
            Number(
              venda.nfe55DevolucaoParcialOperacoesAutorizadas
            ) ||
            0
          )
        )
      );

    card.dataset.nfe55DevolucaoParcialOperacoesConcluidas =
      String(
        Math.max(
          0,
          Math.trunc(
            Number(
              venda.nfe55DevolucaoParcialOperacoesConcluidas
            ) ||
            0
          )
        )
      );

    card.dataset.nfe55Pendente =
      venda.nfe55Pendente === true ||
      text(
        venda.fiscalStatus
      ).toUpperCase() ===
        'AGUARDANDO_NFE55'
        ? 'true'
        : 'false';

    const top =
      createElement(
        'div',
        'scf-sales-history-topline'
      );

    const numeroNfce =
      Number(
        venda.numeroNfce
      );

    const number =
      createElement(
        'div',
        'scf-sales-history-number',
        'NFC-e ' +
        (
          Number.isInteger(
            numeroNfce
          ) &&
          numeroNfce >
            0
            ? String(
                numeroNfce
              ).padStart(
                5,
                '0'
              )
            : '00000'
        )
      );

    const totalValue =
      createElement(
        'div',
        'scf-sales-history-total',
        money(
          venda.totalValue
        )
      );

    top.append(
      number,
      totalValue
    );

    const metaLines = [
      dateTime(
        venda.saleDate
      ),

      [
        text(
          venda.paymentMethod
        ) ||
        'PAGAMENTO NÃO INFORMADO',

        text(
          venda.operatorId
        )
          ? `OPERADOR ${text(
              venda.operatorId
            )}`
          : ''
      ]
        .filter(Boolean)
        .join(
          ' | '
        ),

      venda.numeroNfce
        ? `NFC-e ${venda.numeroNfce} | SÉRIE ${String(
            venda.serie ||
            ''
          ).padStart(
            3,
            '0'
          )}`
        : ''
    ].filter(Boolean);

    const meta =
      createElement(
        'div',
        'scf-sales-history-meta',
        metaLines.join(
          '\n'
        )
      );

    meta.style.whiteSpace =
      'pre-line';

    const bottom =
      createElement(
        'div',
        'scf-sales-history-bottom'
      );

    const status =
      statusInfo(
        venda
      );

    const statusElement =
      createElement(
        'span',
        `scf-sales-history-status ${status.className}`,
        status.label
      );

    bottom.append(
      statusElement
    );

    if(
      venda.podeAbrirComprovante ===
        true
    ){
      const button =
        createElement(
          'button',
          'scf-sales-history-reprint',
          'REIMPRIMIR CUPOM'
        );

      button.type =
        'button';

      button.dataset.saleId =
        text(
          venda.saleId
        );

      bottom.append(
        button
      );
    }

    card.append(
      top,
      meta,
      bottom
    );

    return card;
  }

  function renderMonthSales(){
    const monthSales =
      salesFromMonth(
        selectedYear,
        selectedMonth
      );

    backButton.hidden =
      false;

    /*
     * Recria a barra de ações com o estado do mês já definido.
     * Dentro da pasta mensal ficam, nesta ordem: EXPORTAR XML | MD-e | ANO.
     */
    const existingHeaderYearBar =
      historyHeader.querySelector(
        '.scf-sales-history-year-bar'
      );

    if(existingHeaderYearBar){
      existingHeaderYearBar.remove();
    }

    list.replaceChildren();

    const years =
      normalizeSelectedYear();

    const monthYearBar =
      createYearSelector(
        years
      );

    if(
      window.matchMedia(
        '(min-width:1001px)'
      ).matches
    ){
      historyHeader.append(
        monthYearBar
      );
    }else{
      list.append(
        monthYearBar
      );
    }

    summary.textContent =
      `${MONTHS[selectedMonth]} DE ${selectedYear} • ${pluralSales(
        monthSales.length
      )}`;

    if(
      monthSales.length ===
        0
    ){
      list.append(
        createElement(
          'div',
          'scf-sales-history-message',
          'NENHUMA VENDA NESTE MÊS.'
        )
      );

      moreButton.hidden =
        true;

      return;
    }

    monthSales.forEach(
      (venda) => {
        list.append(
          createSaleCard(
            venda
          )
        );
      }
    );

    moreButton.hidden =
      true;
  }

  function render(){
    if(
      selectedMonth ===
        null
    ){
      renderFolders();

      return;
    }

    renderMonthSales();
  }

  function showLoadingMessage(
    message
  ){
    const existingYearBar =
      historyHeader.querySelector(
        '.scf-sales-history-year-bar'
      );

    if(existingYearBar){
      existingYearBar.remove();
    }

    summary.textContent =
      message;

    list.replaceChildren(
      createElement(
        'div',
        'scf-sales-history-message',
        message
      )
    );

    moreButton.hidden =
      true;
  }

  function requestPage(
    requestedOffset,
    reset,
    preservarSelecaoAtual,
    silencioso
  ){
    if(loading) return false;

    loading =
      true;

    if(reset){
      offset =
        0;

      hasMore =
        false;

      if(
        silencioso ===
          true
      ){
        /*
         * Mantém a versão atualmente exibida intacta.
         * A nova consulta só assume a tela depois de carregar TODAS as páginas.
         */
        atualizacaoSilenciosa =
          true;

        vendasAtualizacao =
          [];

        totalAtualizacao =
          0;

        offsetAtualizacao =
          0;
      }else{
        atualizacaoSilenciosa =
          false;

        vendasAtualizacao =
          [];

        totalAtualizacao =
          0;

        offsetAtualizacao =
          0;

        total =
          0;

        vendas =
          [];

        if(
          preservarSelecaoAtual !==
            true
        ){
          selectedMonth =
            null;

        }

        showLoadingMessage(
          preservarSelecaoAtual ===
            true
            ? 'ATUALIZANDO HISTÓRICO...'
            : 'CARREGANDO PASTAS...'
        );
      }
    }else if(
      atualizacaoSilenciosa !==
        true
    ){
      summary.textContent =
        total >
          0
          ? `CARREGANDO ${Math.min(
              vendas.length,
              total
            )} DE ${total} VENDAS...`
          : 'CARREGANDO VENDAS...';
    }

    window.__scfPdvInfra.shellBridge.post({
      type:
        'SCF_HISTORICO_VENDAS_SOLICITAR',

      offset:
        requestedOffset,

      limit:
        50
    }, '*');

    return true;
  }

  function openHistory(){
    overlay.classList.add(
      'show'
    );

    overlay.setAttribute(
      'aria-hidden',
      'false'
    );

    document.body.classList.add(
      'scf-sales-history-open'
    );

    if(
      historicoCompletoPronto ===
        true
    ){
      /*
       * Abre imediatamente com o último histórico COMPLETO já recebido.
       * Em seguida confere o backend sem apagar nem bloquear a tela atual.
       */
      normalizeSelectedYear();
      render();

      if(!loading){
        requestPage(
          0,
          true,
          true,
          true
        );
      }

      return;
    }

    if(
      loading &&
      atualizacaoSilenciosa
    ){
      /*
       * O pré-carregamento começou antes do clique, mas ainda não terminou.
       * Mantém o comportamento antigo somente neste primeiro acesso.
       */
      showLoadingMessage(
        'CARREGANDO PASTAS...'
      );

      return;
    }

    requestPage(
      0,
      true
    );
  }

  window.__scfPdvInfra.eventBus.on('scf:historico-vendas-atualizar',
    function(){
      /*
       * Mantém o contrato anterior: com o Histórico fechado, este evento não
       * dispara consulta nova. Aberto, reutiliza o cache visível e atualiza em
       * segundo plano sem apagar a tabela/pastas que já estavam carregadas.
       */
      if(
        overlay.getAttribute(
          'aria-hidden'
        ) !==
          'false'
      ){
        /*
         * Se o próprio sistema avisou que houve mudança enquanto o Histórico
         * estava fechado, invalida o cache visual para não mostrar dado antigo
         * no próximo acesso. A consulta só acontece quando o usuário abrir.
         */
        historicoCompletoPronto =
          false;

        return;
      }

      if(loading){
        atualizacaoPendente =
          true;

        return;
      }

      if(
        historicoCompletoPronto ===
          true
      ){
        requestPage(
          0,
          true,
          true,
          true
        );

        return;
      }

      requestPage(
        0,
        true,
        true
      );
    }
  );

  function selecionarPrimeiroBotaoMenu(){
    const menuIframe =
      document.getElementById(
        '__htmlStatusIframe'
      );

    if(
      menuIframe &&
      menuIframe.contentWindow
    ){
      menuIframe.contentWindow.postMessage({
        type:
          'SCF_MENU_SELECIONAR_CENTRAL'
      }, '*');
    }
  }

  function closeHistory(){
    closeAccountingExport();

    overlay.classList.remove(
      'show'
    );

    overlay.setAttribute(
      'aria-hidden',
      'true'
    );

    document.body.classList.remove(
      'scf-sales-history-open'
    );

    selectedMonth =
      null;


    backButton.hidden =
      true;

    selecionarPrimeiroBotaoMenu();

    window.__scfPdvInfra.eventBus.dispatch(
      new CustomEvent(
        'scf:historico-vendas-fechado'
      )
    );
  }

  backButton.addEventListener(
    'click',
    function(){
      if(
        accountingExportOverlay.getAttribute(
          'aria-hidden'
        ) ===
          'false'
      ){
        closeAccountingExport();
      }

      selectedMonth =
        null;

      render();
    }
  );

  overlay.addEventListener(
    'change',
    function(event){
      const select =
        event.target.closest(
          '.scf-sales-history-year-select'
        );

      if(!select) return;

      const year =
        Number(
          select.value
        );

      if(
        !Number.isInteger(
          year
        )
      ) return;

      selectedYear =
        year;

      selectedMonth =
        null;

      render();
    }
  );

  overlay.addEventListener(
    'click',
    function(event){
      const startExportButton =
        event.target.closest(
          '.scf-sales-history-export-start'
        );

      if(startExportButton){
        if(
          selectedMonth ===
            null
        ){
          return;
        }

        openAccountingExport(
          [selectedMonth]
        );

        return;
      }

      const folder =
        event.target.closest(
          '.scf-sales-history-month-folder'
        );

      if(folder){
        const month =
          Number(
            folder.dataset.month
          );

        if(
          !Number.isInteger(
            month
          ) ||
          month <
            0 ||
          month >
            11
        ) return;


        selectedMonth =
          month;

        render();

        return;
      }

      const button =
        event.target.closest(
          '.scf-sales-history-reprint'
        );

      if(!button) return;

      const saleId =
        text(
          button.dataset.saleId
        );

      if(!saleId) return;

      button.disabled =
        true;

      button.textContent =
        'CARREGANDO...';

      /*
       * O recibo usa este sinal para diferenciar a abertura
       * pelo Histórico da abertura automática após a autorização.
       */
      window.__scfPdvInfra.eventBus.dispatch(
        new CustomEvent(
          'scf:comprovante-historico-solicitado',
          {
            detail: {
              saleId
            }
          }
        )
      );

      closeHistory();

      window.__scfPdvInfra.shellBridge.post({
        type:
          'SCF_NFCE_SOLICITAR_COMPROVANTE',

        saleId
      }, '*');
    }
  );

  closeButton.addEventListener(
    'click',
    closeHistory
  );

  overlay.addEventListener(
    'click',
    function(event){
      if(
        event.target ===
          overlay
      ){
        closeHistory();
      }
    }
  );

  document.addEventListener(
    'keydown',
    function(event){
      if(
        event.key ===
          'Escape' &&
        overlay.getAttribute(
          'aria-hidden'
        ) ===
          'false'
      ){
        if(
          accountingExportOverlay.getAttribute(
            'aria-hidden'
          ) ===
            'false'
        ){
          if(
            accountingExportBusy !==
              true
          ){
            closeAccountingExport();
          }

          return;
        }

        if(
          selectedMonth !==
            null
        ){
          selectedMonth =
            null;

          render();
        }else{
          closeHistory();
        }
      }
    }
  );

  window.__scfPdvInfra.shellBridge.onMessage(
    function(event){
      const data =
        event &&
        event.data &&
        typeof event.data ===
          'object'
          ? event.data
          : null;

      if(!data) return;

      if(
        data.type ===
        'SCF_HISTORICO_VENDAS_ABRIR'
      ){
        openHistory();

        return;
      }

      if(
        data.type ===
        'SCF_FISCAL_HOME_ABRIR'
      ){
        try{
          closeHistory();
        }catch(error){}

        try{
          showMainFiscalCard();
        }catch(error){}

        return;
      }

      if(
        data.type ===
        'SCF_HISTORICO_VENDAS_FECHAR'
      ){
        closeHistory();

        return;
      }

      if(
        data.type ===
          'SCF_EXPORTAR_XML_RESULTADO'
      ){
        accountingExportBusy =
          false;

        accountingExportSend.disabled =
          false;

        accountingExportCancel.disabled =
          false;

        accountingExportSend.textContent =
          'ENVIAR';

        accountingExportOverlay.classList.remove(
          'is-processing'
        );

        accountingExportOverlay.classList.add(
          'is-complete'
        );

        accountingExportClose.style.display =
          'none';

        setAccountingExportStatus(
          'ARQUIVO XML ENVIADO',
          'success'
        );

        return;
      }

      if(
        data.type ===
          'SCF_EXPORTAR_XML_ERRO'
      ){
        accountingExportBusy =
          false;

        accountingExportSend.disabled =
          false;

        accountingExportCancel.disabled =
          false;

        accountingExportSend.textContent =
          'ENVIAR';

        accountingExportOverlay.classList.remove(
          'is-processing',
          'is-complete'
        );

        setAccountingExportStatus(
          data.mensagem ||
          'NÃO FOI POSSÍVEL PREPARAR OU ENVIAR O ARQUIVO ZIP.',
          'error'
        );

        return;
      }

      if(
        data.type ===
        'SCF_HISTORICO_VENDAS_RESULTADO'
      ){
        loading =
          false;

        const incoming =
          Array.isArray(
            data.vendas
          )
            ? data.vendas
            : [];

        if(
          atualizacaoSilenciosa ===
            true
        ){
          if(
            Number(
              data.offset
            ) ===
              0
          ){
            vendasAtualizacao =
              incoming;
          }else{
            vendasAtualizacao =
              vendasAtualizacao.concat(
                incoming
              );
          }

          vendasAtualizacao =
            removeDuplicates(
              vendasAtualizacao
            );

          totalAtualizacao =
            Number(
              data.total
            ) ||
            vendasAtualizacao.length;

          offsetAtualizacao =
            Number(
              data.nextOffset
            );

          if(
            !Number.isInteger(
              offsetAtualizacao
            ) ||
            offsetAtualizacao <
              0
          ){
            offsetAtualizacao =
              vendasAtualizacao.length;
          }

          const aindaTemPaginas =
            data.hasMore ===
              true &&
            incoming.length >
              0;

          if(aindaTemPaginas){
            requestPage(
              offsetAtualizacao,
              false
            );

            return;
          }

          /*
           * Troca atômica: a tela/cache só recebe a consulta nova depois
           * que o histórico completo terminou de chegar.
           */
          vendas =
            vendasAtualizacao;

          total =
            totalAtualizacao;

          offset =
            offsetAtualizacao;

          hasMore =
            false;

          vendasAtualizacao =
            [];

          totalAtualizacao =
            0;

          offsetAtualizacao =
            0;

          atualizacaoSilenciosa =
            false;

          historicoCompletoPronto =
            true;

          normalizeSelectedYear();

          if(
            overlay.getAttribute(
              'aria-hidden'
            ) ===
              'false'
          ){
            render();

            window.__scfPdvInfra.eventBus.dispatch(
              new CustomEvent(
                'scf:historico-vendas-renderizado'
              )
            );
          }

          if(atualizacaoPendente){
            atualizacaoPendente =
              false;

            window.setTimeout(
              function(){
                requestPage(
                  0,
                  true,
                  true,
                  true
                );
              },
              0
            );
          }

          return;
        }

        if(
          Number(
            data.offset
          ) ===
            0
        ){
          vendas =
            incoming;
        }else{
          vendas =
            vendas.concat(
              incoming
            );
        }

        vendas =
          removeDuplicates(
            vendas
          );

        total =
          Number(
            data.total
          ) ||
          vendas.length;

        offset =
          Number(
            data.nextOffset
          );

        if(
          !Number.isInteger(
            offset
          ) ||
          offset <
            0
        ){
          offset =
            vendas.length;
        }

        hasMore =
          data.hasMore ===
            true;

        /*
         * As pastas precisam representar todo o histórico.
         * Por isso, as páginas restantes são carregadas
         * automaticamente antes de mostrar os meses.
         */
        if(
          hasMore &&
          incoming.length >
            0
        ){
          requestPage(
            offset,
            false
          );

          return;
        }

        hasMore =
          false;

        historicoCompletoPronto =
          true;

        normalizeSelectedYear();

        render();

        window.__scfPdvInfra.eventBus.dispatch(
          new CustomEvent(
            'scf:historico-vendas-renderizado'
          )
        );

        if(atualizacaoPendente){
          atualizacaoPendente =
            false;

          window.setTimeout(
            function(){
              requestPage(
                0,
                true,
                true,
                true
              );
            },
            0
          );
        }

        return;
      }

      if(
        data.type ===
        'SCF_HISTORICO_VENDAS_ERRO'
      ){
        loading =
          false;

        if(
          atualizacaoSilenciosa ===
            true
        ){
          /*
           * Falha na conferência em segundo plano nunca apaga o último
           * histórico completo que já estava disponível para o operador.
           */
          atualizacaoSilenciosa =
            false;

          vendasAtualizacao =
            [];

          totalAtualizacao =
            0;

          offsetAtualizacao =
            0;

          if(atualizacaoPendente){
            atualizacaoPendente =
              false;

            window.setTimeout(
              function(){
                requestPage(
                  0,
                  true,
                  true,
                  true
                );
              },
              250
            );
          }

          return;
        }

        summary.textContent =
          'ERRO AO CARREGAR';

        list.replaceChildren(
          createElement(
            'div',
            'scf-sales-history-message',
            data.mensagem ||
            'NÃO FOI POSSÍVEL CARREGAR O HISTÓRICO.'
          )
        );

        moreButton.hidden =
          true;
      }
    }
  );

})();
