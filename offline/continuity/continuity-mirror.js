'use strict';

const DEFAULT_CONTINUITY_MIRROR_MS = 500;

function normalizeContinuityText(value) {
  return String(
    value == null
      ? ''
      : value
  )
    .trim()
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .replace(
      /\s+/g,
      ' '
    )
    .toLowerCase();
}

function createContinuityMirrorController({
  intervalMs =
    DEFAULT_CONTINUITY_MIRROR_MS,
  getMainWindow,
  findPdvContinuityFrame,
  getOfflineUiMode,
  getPendingUpdateVersion,
  getPendingVerifierCandidate,
  persistPendingCredential,
  refreshConfirmedOnlineIdentity,
  getAuthenticatedOperator,
  getFailoverOnlineOperatorIdentity,
  getLastConfirmedOnlineOperatorIdentity,
  listOfflineProductsForSale,
  requestNavigatorOfflineFailover,
  log = () => {},
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  setTimeoutFn = setTimeout
} = {}) {
  let timer = null;
  let busy = false;
  let draftState = null;

  function getDraft() {
    return draftState;
  }

  function setDraft(value) {
    draftState =
      value &&
      typeof value ===
        'object'
        ? value
        : null;

    return draftState;
  }

  function clearDraft() {
    draftState = null;
  }

  function enrichDraftWithOfflineReferences(
    inputDraft
  ) {
    const draft =
      inputDraft &&
      typeof inputDraft ===
        'object'
        ? {
            ...inputDraft
          }
        : null;

    if (!draft) {
      return null;
    }

    let catalog = [];

    try {
      const authenticatedOperator =
        getAuthenticatedOperator();
      const failoverIdentity =
        getFailoverOnlineOperatorIdentity();
      const confirmedOnlineOperator =
        getLastConfirmedOnlineOperatorIdentity();

      const empresaId =
        String(
          authenticatedOperator &&
          authenticatedOperator.empresaId ||
          failoverIdentity &&
          failoverIdentity.empresaId ||
          confirmedOnlineOperator &&
          confirmedOnlineOperator.empresaId ||
          ''
        ).trim();

      catalog =
        empresaId
          ? listOfflineProductsForSale({
              empresaId
            })
          : [];
    } catch (_) {
      catalog = [];
    }

    const resolveProduct =
      (item) => {
        const source =
          item &&
          typeof item ===
            'object'
            ? item
            : {};

        if (
          String(
            source.productFiscalId ||
            ''
          ).trim()
        ) {
          return {
            ...source
          };
        }

        const codeCandidates =
          [
            source.productCode,
            source.codigo,
            source.gtin,
            source.barcode
          ]
            .map(
              (value) =>
                String(
                  value == null
                    ? ''
                    : value
                ).trim()
            )
            .filter(Boolean);

        let matches = [];

        if (
          codeCandidates.length
        ) {
          matches =
            catalog.filter(
              (product) => {
                const keys =
                  [
                    product.produtoId,
                    product.id,
                    product.codigo,
                    product.gtin,
                    product.codigoBarras
                  ]
                    .map(
                      (value) =>
                        String(
                          value == null
                            ? ''
                            : value
                        ).trim()
                    )
                    .filter(Boolean);

                return codeCandidates
                  .some(
                    (candidate) =>
                      keys.includes(
                        candidate
                      )
                  );
              }
            );
        }

        if (
          matches.length !== 1
        ) {
          const name =
            normalizeContinuityText(
              source.name ||
              source.nome ||
              source.descricao
            );

          const unitValue =
            Number(
              source.unitValue ||
              source.valorUnitario ||
              0
            );

          matches =
            catalog.filter(
              (product) => {
                if (
                  !name ||
                  normalizeContinuityText(
                    product.nome ||
                    product.descricao
                  ) !== name
                ) {
                  return false;
                }

                const catalogValue =
                  Number(
                    product.valorUnitario ||
                    product.precoVenda ||
                    0
                  );

                return (
                  unitValue > 0
                    ? Math.abs(
                        catalogValue -
                        unitValue
                      ) < 0.005
                    : true
                );
              }
            );
        }

        if (
          matches.length !== 1
        ) {
          return {
            ...source
          };
        }

        const product =
          matches[0];

        return {
          ...source,
          productFiscalId:
            String(
              product.produtoId ||
              product.id ||
              ''
            ).trim(),
          productCode:
            String(
              product.codigo ||
              ''
            ).trim(),
          gtin:
            String(
              product.gtin ||
              product.codigoBarras ||
              ''
            ).trim(),
          barcode:
            String(
              product.gtin ||
              product.codigoBarras ||
              product.codigo ||
              ''
            ).trim(),
          ncm:
            String(
              product.ncm ||
              source.ncm ||
              ''
            ).trim(),
          cfop:
            String(
              product.cfop ||
              source.cfop ||
              ''
            ).trim(),
          unit:
            String(
              source.unit ||
              product.unidade ||
              'UN'
            )
              .trim()
              .toUpperCase(),
          unitValue:
            Number(
              source.unitValue ||
              product.valorUnitario ||
              0
            ),
          total:
            Number(
              source.total ||
              0
            ) > 0
              ? Number(
                  source.total
                )
              : Number(
                  source.quantity ||
                  0
                ) *
                Number(
                  source.unitValue ||
                  product.valorUnitario ||
                  0
                )
        };
      };

    draft.products =
      Array.isArray(
        draft.products
      )
        ? draft.products
            .slice(0, 500)
            .map(
              resolveProduct
            )
        : [];

    if (
      draft.currentProduct &&
      typeof draft.currentProduct ===
        'object'
    ) {
      draft.currentProduct =
        resolveProduct(
          draft.currentProduct
        );
    }

    return draft;
  }

  async function captureOnlineDraft(
    options = {}
  ) {
    const mainWindow =
      getMainWindow();

    if (
      !mainWindow ||
      mainWindow.isDestroyed()
    ) {
      return null;
    }

    const frame =
      await findPdvContinuityFrame(
        mainWindow.webContents,
        Number.isFinite(
          Number(
            options.timeoutMs
          )
        )
          ? Math.max(
              0,
              Number(
                options.timeoutMs
              )
            )
          : 1500
      );

    if (!frame) {
      if (
        options.silent !==
        true
      ) {
        log(
          'OFFLINE CONTINUITY ONLINE FRAME NOT FOUND'
        );
      }

      return null;
    }

    try {
      const encoded =
        await frame
          .executeJavaScript(
            `
      (() => {
        const scfContinuityMoney = (value) => {
          let raw = String(value == null ? '' : value)
            .replace(/R[$]/gi, '')
            .replace(/[^0-9,.-]/g, '');
          if (!raw) return 0;
          if (raw.includes(',')) {
            raw = raw.split('.').join('').replace(',', '.');
          }
          const result = Number(raw);
          return Number.isFinite(result) ? result : 0;
        };

        const capturePaymentContinuity = () => {
          const panel =
            document.getElementById('fiscalFinalizeSalePhotoPanel');
          if (!panel) return null;

          const buttons = Array.from(
            panel.querySelectorAll('.finalize-payment-method-btn')
          );
          const selectedButton =
            panel.querySelector(
              '.finalize-payment-method-btn.is-selected, .finalize-payment-method-btn.scf-payment-keyboard-focus'
            );
          const methodStage =
            document.getElementById('fiscalFinalizeMethodStage');
          const cashStage =
            document.getElementById('fiscalFinalizeCashStage');
          const methodTitle =
            document.getElementById('fiscalFinalizeMethodTitle');

          const titleMethod = String(
            methodTitle && methodTitle.textContent || ''
          )
            .replace('PAGAMENTO EM ', '')
            .trim()
            .toUpperCase();

          const selectedMethod = String(
            selectedButton &&
            selectedButton.getAttribute('data-payment-method') ||
            titleMethod ||
            ''
          ).trim().toUpperCase();

          const paymentParts = buttons
            .map((button) => {
              const method = String(
                button.getAttribute('data-payment-method') || ''
              ).trim().toUpperCase();
              const amountNode =
                button.querySelector('.finalize-payment-method-value');
              const amount = scfContinuityMoney(
                amountNode && amountNode.textContent || ''
              );
              return { method, amount };
            })
            .filter((part) => part.method && part.amount >= 0.005);

          return {
            selectedMethod,
            editingMethod:
              methodStage && methodStage.hidden === false
                ? (titleMethod || selectedMethod)
                : '',
            flowMode:
              methodStage && methodStage.hidden === false
                ? 'METHOD'
                : cashStage && cashStage.hidden === false
                  ? 'CASH'
                  : 'OVERVIEW',
            methodAmount: scfContinuityMoney(
              document.getElementById('fiscalFinalizeMethodAmount')?.value
            ),
            cashReceived: scfContinuityMoney(
              document.getElementById('fiscalFinalizeCashReceived')?.value
            ),
            paymentParts
          };
        };

        if (typeof window.__scfPdvExportContinuityDraft === 'function') {
          const nativeDraft =
            window.__scfPdvExportContinuityDraft() || null;

          if (nativeDraft && typeof nativeDraft === 'object') {
            nativeDraft.paymentContinuity =
              capturePaymentContinuity();
            nativeDraft.browserOnline =
              navigator.onLine !== false;
            nativeDraft.operatorName = String(
              document.getElementById('scfPdvOperatorName')?.textContent ||
              window.nomeOperador ||
              window.scfNomeOperador ||
              ''
            ).trim();
          }

          return JSON.stringify({
            mode: 'native',
            draft: nativeDraft
          });
        }

        const text = (value) => String(value == null ? '' : value).trim();
        const numberPtBr = (value) => {
          let raw = text(value).replace(/R\\$/gi, '').replace(/\\s/g, '').replace(/[^0-9,.-]/g, '');
          if (!raw) return 0;
          if (raw.includes(',')) raw = raw.replace(/\\./g, '').replace(',', '.');
          const result = Number(raw);
          return Number.isFinite(result) ? result : 0;
        };
        const valueOf = (id) => {
          const element = document.getElementById(id);
          return element ? text('value' in element ? element.value : element.textContent) : '';
        };

        const list = document.getElementById('fiscalProductsList');
        if (!list) return JSON.stringify({ mode: 'dom', draft: null });

        const products = Array.from(
          list.querySelectorAll(':scope > .fiscal-danfe-item-wrap:not(.is-preview)')
        ).map((wrap, index) => {
          const name = text(wrap.querySelector('.fiscal-desktop-danfe-cell.descricao')?.textContent);
          const quantity = numberPtBr(wrap.querySelector('.fiscal-desktop-danfe-cell.qtd')?.textContent);
          const unit = text(wrap.querySelector('.fiscal-desktop-danfe-cell.un')?.textContent).toUpperCase();
          const unitValue = numberPtBr(wrap.querySelector('.fiscal-desktop-danfe-cell.vl-unit')?.textContent);
          return {
            name,
            quantity,
            unit,
            unitValue,
            total: quantity * unitValue,
            itemNumber: index + 1,
            cancelled: wrap.classList.contains('is-cancelled')
          };
        }).filter((item) => item.name && item.quantity > 0);

        const currentName = valueOf('productName');
        const currentQuantity = numberPtBr(valueOf('productQuantity'));
        const currentUnitValue = numberPtBr(valueOf('productUnitValue'));
        const currentProduct = currentName || valueOf('productBarcode') || valueOf('productCode')
          ? {
              name: currentName,
              quantity: currentQuantity > 0 ? currentQuantity : 1,
              unit: valueOf('productUnit').toUpperCase(),
              unitValue: currentUnitValue,
              total: (currentQuantity > 0 ? currentQuantity : 1) * currentUnitValue,
              productFiscalId: valueOf('productFiscalId'),
              productCode: valueOf('productCode'),
              gtin: valueOf('productGtin'),
              barcode: valueOf('productBarcode'),
              ncm: valueOf('ncmCode') || valueOf('ncmSearch'),
              cfop: valueOf('cfopCode') || valueOf('cfopSearch')
            }
          : null;

        const active = products.filter((item) => item.cancelled !== true);
        const totalValue = active.reduce((sum, item) => sum + Number(item.total || 0), 0);
        const paymentStageKind =
          document.body && document.body.classList.contains('sale-validation-waiting-open')
            ? 'VALIDATION'
            : document.body && document.body.classList.contains('cpf-fiscal-card-open')
              ? 'CPF'
              : document.body && document.body.classList.contains('finalize-support-card-open')
                ? 'FINALIZE'
                : '';
        const paymentStageOpen = Boolean(paymentStageKind);
        let saleId = '';
        if (paymentStageOpen) {
          try {
            const lastSale = JSON.parse(
              localStorage.getItem('scfLastFinalizedSale') || '{}'
            );
            if (lastSale && typeof lastSale === 'object') {
              saleId = text(lastSale.saleId);
            }
          } catch (_) {}
        }

        return JSON.stringify({
          mode: 'dom',
          draft: {
            version: 1,
            saleNumber: valueOf('saleNumber'),
            saleId,
            products,
            currentProduct,
            totalValue,
            activeProducts: active.length,
            paymentStageOpen,
            paymentStageKind,
            paymentContinuity:
              capturePaymentContinuity(),
            browserOnline:
              navigator.onLine !== false,
            operatorName: text(
              document.getElementById('scfPdvOperatorName')?.textContent ||
              window.nomeOperador ||
              window.scfNomeOperador ||
              ''
            ),
            capturedAt: new Date().toISOString()
          }
        });
      })()
    `,
            true
          );

      if (!encoded) {
        return null;
      }

      const envelope =
        JSON.parse(
          encoded
        );

      const draft =
        envelope &&
        envelope.draft &&
        typeof envelope.draft ===
          'object'
          ? envelope.draft
          : null;

      const enriched =
        enrichDraftWithOfflineReferences(
          draft
        );

      if (
        options.silent !==
          true &&
        envelope &&
        envelope.mode ===
          'dom'
      ) {
        log(
          'OFFLINE CONTINUITY DOM FALLBACK ACTIVE',
          {
            products:
              enriched &&
              Array.isArray(
                enriched.products
              )
                ? enriched
                    .products
                    .length
                : 0
          }
        );
      }

      return enriched;
    } catch (error) {
      if (
        options.silent !==
        true
      ) {
        log(
          'OFFLINE CONTINUITY SNAPSHOT FAILED',
          error
        );
      }

      return null;
    }
  }

  async function mirrorOnlineDraft() {
    if (
      busy ||
      getOfflineUiMode() !==
        'ONLINE' ||
      !getMainWindow() ||
      getMainWindow()
        .isDestroyed() ||
      getPendingUpdateVersion()
    ) {
      return false;
    }

    busy = true;

    try {
      if (
        getPendingVerifierCandidate()
      ) {
        void persistPendingCredential()
          .catch(
            (error) => {
              log(
                'OFFLINE OPERATOR CREDENTIAL CACHE RETRY FAILED',
                {
                  erro:
                    String(
                      error &&
                      error.message ||
                      error
                    )
                }
              );
            }
          );
      }

      const snapshot =
        await captureOnlineDraft({
          silent: true,
          timeoutMs: 120
        });

      if (
        !snapshot ||
        typeof snapshot !==
          'object'
      ) {
        return false;
      }

      setDraft(
        snapshot
      );

      if (
        snapshot.browserOnline !==
        false
      ) {
        try {
          await refreshConfirmedOnlineIdentity({
            browserOnline: true
          });
        } catch (error) {
          log(
            'ONLINE OPERATOR SESSION CACHE REFRESH DEFERRED',
            {
              erro:
                String(
                  error &&
                  error.message ||
                  error
                )
            }
          );
        }
      }

      if (
        snapshot.browserOnline ===
        false
      ) {
        requestNavigatorOfflineFailover();
      }

      return true;
    } finally {
      busy = false;
    }
  }

  function start() {
    if (timer) {
      return;
    }

    timer =
      setIntervalFn(
        () => {
          void mirrorOnlineDraft()
            .catch(() => {});
        },
        intervalMs
      );

    if (
      timer &&
      typeof timer.unref ===
        'function'
    ) {
      timer.unref();
    }

    setTimeoutFn(
      () => {
        void mirrorOnlineDraft()
          .catch(() => {});
      },
      100
    );
  }

  function stop() {
    if (!timer) {
      return;
    }

    clearIntervalFn(
      timer
    );

    timer = null;
  }

  return Object.freeze({
    captureOnlineDraft,
    enrichDraftWithOfflineReferences,
    mirrorOnlineDraft,
    start,
    stop,
    getDraft,
    setDraft,
    clearDraft
  });
}

module.exports = {
  DEFAULT_CONTINUITY_MIRROR_MS,
  normalizeContinuityText,
  createContinuityMirrorController
};
