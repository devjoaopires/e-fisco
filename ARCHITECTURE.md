# Arquitetura — e-fisco Desktop 1.0.41

Este documento registra a arquitetura observada diretamente no código da release
`release-1.0.41`. Ele é a linha de base dos micropassos 1.1/7 a 1.4/7.

> Escopo: inventário estrutural. Nenhum comportamento do aplicativo foi alterado
> para produzir este documento.

## Entradas principais

- `main.js`: processo principal Electron e orquestrador.
- `preload.js`: ponte entre renderer e processo principal.
- `phase2-pair-device.js`: utilitário Electron de pareamento por linha de comando.
- `offline-ui/`: interface usada no modo offline.

Código de terceiros em `offline-ui/vendor` não faz parte do inventário de módulos próprios.

---

# 1.1/7 — Módulos com API pública

Foram identificados **24 módulos próprios** com contratos publicados por
`module.exports`.

| Módulo | Domínio | Funções públicas |
| --- | --- | ---: |
| offline-cash-service.js | Caixa | 8 |
| offline-db.js | Persistência / SQLite | 83 |
| offline-device-auth.js | Identidade / autenticação | 14 |
| offline-device-pairing.js | Pareamento | 2 |
| offline-fiscal-certificate-provisioning.js | Fiscal / certificado A1 | 1 |
| offline-fiscal-certificate-store.js | Fiscal / armazenamento A1 | 5 |
| offline-fiscal-contingency-service.js | Fiscal / contingência | 2 |
| offline-fiscal-nfce-danfe.js | Fiscal / DANFE | 3 |
| offline-fiscal-nfce-qrcode.js | Fiscal / QR Code | 6 |
| offline-fiscal-nfce-xml.js | Fiscal / XML NFC-e | 1 |
| offline-fiscal-number-maintenance.js | Fiscal / numeração | 1 |
| offline-fiscal-number-service.js | Fiscal / reserva de numeração | 1 |
| offline-fiscal-outbox-worker.js | Fiscal / outbox | 2 |
| offline-fiscal-runtime.js | Fiscal / runtime | 1 |
| offline-fiscal-sale-pipeline.js | Fiscal / pipeline de venda | 5 |
| offline-fiscal-svrs-transport.js | Fiscal / transporte SVRS | 5 |
| offline-fiscal-trust-anchors.js | Fiscal / TLS | 1 |
| offline-fiscal-xml-signer.js | Fiscal / assinatura XML | 4 |
| offline-outbox-worker.js | Sincronização / outbox | 5 |
| offline-product-service.js | Produtos | 5 |
| offline-sale-service.js | Vendas | 8 |
| offline-standby.js | Standby / rollback | 17 |
| offline-sync-http-transport.js | Sincronização HTTP | 10 |
| offline-ui-server.js | UI offline | 2 |

**Total: 24 módulos e 192 funções públicas.**

`offline-db.js` concentra 83 funções públicas, cerca de 43% da superfície
funcional pública inventariada.

---

# 1.2/7 — Catálogo das APIs públicas

## Caixa — offline-cash-service.js

- decimalToCents
- centsToValue
- buildCashSummary
- mirrorRemoteCashState
- consultCashOffline
- openCashOffline
- registerCashMovementOffline
- closeCashOffline

## Persistência — offline-db.js

### Ciclo de vida
- initializeOfflineDatabase
- closeOfflineDatabase
- getOfflineDatabase

### Credenciais e empresas
- upsertOfflineOperatorCredential
- listActiveOfflineOperatorCredentials
- deactivateOfflineOperatorCredentialsExcept
- deactivateOfflineOperatorCredentialsOutsideCompanies
- upsertProvisionedOfflineCredential
- listActiveProvisionedOfflineCredentials
- deactivateProvisionedOfflineCredentialsExcept
- deactivateProvisionedOfflineCredentialsOutsideCompanies
- upsertPreparedOfflineCompany
- getPreparedOfflineCompany
- listPreparedOfflineCompanies

### Cache e crediário
- upsertProductCache
- upsertCustomerCache
- upsertSupplierCache
- upsertCrediarioCache
- finalizeCrediariosSnapshot
- listCrediariosCache
- getCrediarioCacheById
- getCrediarioDetailCache
- getCrediarioPendingDependencies
- openCrediarioOfflineAtomic
- updateCrediarioItemsOfflineAtomic
- upsertReferenceBatch
- getProductCacheById
- findProductCacheByCodeOrGtin
- searchProductsCache
- getCustomerCacheById
- searchCustomersCache
- getSupplierCacheById
- searchSuppliersCache

### Fiscal e numeração
- upsertFiscalProfileCache
- getFiscalProfileCache
- upsertFiscalNumberLease
- getFiscalNumberLeaseById
- getFiscalNumberLeaseByRequestId
- getActiveFiscalNumberLease
- getFiscalNumberLeaseInventory
- peekNextNfceNumber
- reconcileLocalNfceCounter
- consumeNextNfceNumber
- getNfceDocumentBySaleId
- getNfceDocumentByFiscalId
- ensureFiscalOutboxForPendingNfce
- getFiscalOutboxByFiscalId
- listFiscalOutboxReady
- claimFiscalOutboxOperation
- markFiscalOutboxRetry
- markFiscalOutboxAmbiguous
- markFiscalOutboxSafeRetransmit
- markFiscalOutboxAuthorized
- markFiscalOutboxRejected
- markFiscalOutboxManualReview
- markFiscalOutboxManualReviewReady
- recoverStaleFiscalOutbox
- persistSignedNfceContingency
- persistNfceQrCode

### Estoque, caixa, financeiro e vendas
- registerStockMovement
- getStockProjection
- listPendingStockDeltasByProduct
- listStockMovements
- openCashSession
- getCashSession
- getOpenCashSession
- closeCashSession
- registerCashMovement
- listCashMovements
- aggregateCashSessionActivity
- registerFinancialMovement
- listFinancialMovements
- registerOfflineSaleAtomic
- getSaleById

### Outbox geral
- getOutboxOperation
- enqueueOutboxOperation
- listOutboxReady
- claimOutboxOperation
- markOutboxRetry
- markOutboxConfirmed
- markOutboxConflict
- markOutboxManualReview
- recoverStaleOutbox

Constantes públicas relevantes:
- OFFLINE_DB_SCHEMA_VERSION
- STOCK_QUANTITY_SCALE

## Identidade — offline-device-auth.js

- getOrCreateSyncDeviceId
- getSyncEmpresaId
- storeSyncEmpresaId
- storeSyncDeviceToken
- storeSyncDeviceTokenForCompany
- loadSyncDeviceToken
- loadSyncDeviceTokenForCompany
- clearSyncDeviceToken
- clearSyncDeviceTokenForCompany
- hasStoredSyncDeviceToken
- hasStoredSyncDeviceTokenForCompany
- normalizeDeviceId
- normalizeEmpresaId
- normalizeDeviceToken

## Pareamento — offline-device-pairing.js

- requestDevicePairing
- normalizePairingCode

## Certificado A1

### offline-fiscal-certificate-provisioning.js
- provisionFiscalA1FromServer

### offline-fiscal-certificate-store.js
- storeFiscalA1Bundle
- loadFiscalA1Bundle
- inspectFiscalA1Bundle
- hasStoredFiscalA1Bundle
- clearFiscalA1Bundle

## Fiscal — contingência, XML, QR Code e DANFE

### offline-fiscal-contingency-service.js
- validatePersistedSignedDocument
- finalizeNfceContingencySigning

### offline-fiscal-nfce-danfe.js
- parseFinalNfce
- buildDanfeContingencyModels
- generateDanfeContingencyForSale

### offline-fiscal-nfce-qrcode.js
- parseSignedNfceDocument
- validateQrTextAgainstSignedXml
- generateQrCodeV3FromLocalA1
- buildInfNFeSuplXml
- buildNfceXmlWithSupplement
- finalizeNfceContingencyQrCode

### offline-fiscal-nfce-xml.js
- generateUnsignedNfceXml

### offline-fiscal-xml-signer.js
- extractPkcs12SigningMaterial
- verifySignedNfeXml
- signNfeXmlWithPkcs12
- signNfeXmlFromLocalA1

## Fiscal — numeração, pipeline e transmissão

### offline-fiscal-number-maintenance.js
- ensureFiscalNumberLeaseInventory

### offline-fiscal-number-service.js
- reserveFiscalNumberLeaseOffline

### offline-fiscal-outbox-worker.js
- processFiscalOutboxOnce
- recoverStaleFiscalOutbox

### offline-fiscal-runtime.js
- runFiscalReconnectCycle

### offline-fiscal-sale-pipeline.js
- validateCurrentSupportedSubset
- validateProfile
- validateA1Readiness
- prepareFiscalMode
- runOfflinePaidSaleFiscalPipeline

### offline-fiscal-svrs-transport.js
- authorizationMessage
- consultationMessage
- parseAuthorizationResponse
- parseConsultationResponse
- createSvrsProductionTransport

### offline-fiscal-trust-anchors.js
- getSvrsTrustAnchors

## Sincronização — offline-outbox-worker.js

- retryDelayForAttempt
- retryAtForOperation
- normalizeTransportResult
- processOutboxOnce
- recoverInterruptedOutbox

## Produtos — offline-product-service.js

- normalizeSearch
- mapProductForSale
- productAvailableQuantity
- listOfflineProductsForSale
- findOfflineProductForSale

## Vendas — offline-sale-service.js

- moneyCentsFromDecimal
- quantitySnapshot
- roundedLineTotalCentavos
- normalizePaymentParts
- buildOfflineSaleAtomicInput
- buildOfflineCrediarioAtomicInput
- listOfflineSalesForFinance
- registerPaidSaleOffline

## Standby — offline-standby.js

- compareVersions
- validateManifest
- validateStandbyPackageManifest
- readAndValidateStandbyPackage
- listZipEntries
- extractStandbyPackageSafely
- standbyPaths
- ensureStandbyStructure
- readJsonSafe
- writeJsonSafely
- evaluateCompatibility
- checkDesktopManifest
- prepareOfflinePackage
- validatePreparedSlotForActivation
- activatePreparedSlot
- validateRollbackSlot
- rollbackToPreviousSlot

## Sincronização HTTP — offline-sync-http-transport.js

- operationEnvelope
- normalizeServerResult
- pingSyncDevice
- bootstrapSyncMultiCompany
- referencePullPayload
- pullSyncReferences
- pullSyncCashState
- pullSyncCashSummary
- postAuthenticatedDeviceJson
- createHttpSyncTransport

## UI offline — offline-ui-server.js

- resolveOfflineUiFiles
- startOfflineUiServer

---

# 1.3/7 — Dependências entre módulos

Foram observadas **50 relações internas** do tipo `require('./...')` entre
entrypoints e módulos da aplicação.

## Orquestração principal

`main.js` depende diretamente de:

- offline-standby
- offline-db
- offline-device-auth
- offline-device-pairing
- offline-sync-http-transport
- offline-product-service
- offline-cash-service
- offline-sale-service
- offline-fiscal-certificate-provisioning
- offline-fiscal-nfce-danfe
- offline-fiscal-runtime
- offline-outbox-worker
- offline-ui-server

## Cadeias principais

```text
offline-product-service
├── offline-db
└── offline-device-auth

offline-cash-service
├── offline-db
└── offline-device-auth

offline-sale-service
├── offline-db
├── offline-device-auth
└── offline-fiscal-sale-pipeline
```

```text
offline-fiscal-sale-pipeline
├── offline-db
├── offline-fiscal-certificate-store
├── offline-fiscal-contingency-service
│   ├── offline-db
│   ├── offline-fiscal-nfce-xml
│   └── offline-fiscal-xml-signer
├── offline-fiscal-nfce-qrcode
│   ├── offline-db
│   ├── offline-fiscal-certificate-store
│   └── offline-fiscal-xml-signer
└── offline-fiscal-nfce-danfe
    ├── offline-db
    └── offline-fiscal-nfce-qrcode
```

```text
offline-fiscal-runtime
├── offline-fiscal-outbox-worker
│   ├── offline-db
│   └── offline-fiscal-nfce-qrcode
└── offline-fiscal-svrs-transport
    ├── offline-fiscal-certificate-store
    └── offline-fiscal-trust-anchors
```

Outras relações:

- offline-fiscal-certificate-provisioning
  - offline-sync-http-transport
  - offline-fiscal-certificate-store
- offline-fiscal-number-maintenance
  - offline-db
  - offline-fiscal-number-service
- offline-fiscal-number-service
  - offline-sync-http-transport
  - offline-db
- offline-fiscal-xml-signer
  - offline-fiscal-certificate-store
- offline-outbox-worker
  - offline-db
- phase2-pair-device.js
  - offline-db
  - offline-device-auth
  - offline-device-pairing

## Dependências externas

### Electron
- main.js
- preload.js
- phase2-pair-device.js

### Bibliotecas npm
- electron-updater
- @xmldom/xmldom
- node-forge
- xml-crypto

### APIs nativas do Node
- fs
- path
- crypto
- tls
- http
- https
- url
- zlib
- child_process
- node:sqlite

## Pontos de concentração

- `main.js`: principal hub de orquestração.
- `offline-db.js`: principal hub de persistência e domínio offline.
- `offline-fiscal-certificate-store.js`: dependência compartilhada por
  assinatura, QR Code, pipeline fiscal e transporte SVRS.

---

# 1.4/7 — Entradas externas e fronteiras

## Renderer / preload / IPC

O preload publica as bridges:

- `efiscoOfflineVerifierBridge`
- `efiscoDesktop`

Foram identificados **22 canais IPC** com prefixo `efisco:`.

### Eventos
- efisco:offline-operator-bridge-probe
- efisco:offline-operator-verifier-candidate

### Request/response
- efisco:offline-credential-provision
- efisco:offline-operator-login
- efisco:print-nfce-windows-driver
- efisco:offline-product-find
- efisco:offline-company-header
- efisco:offline-products-list
- efisco:offline-customers-list
- efisco:offline-crediarios-list
- efisco:offline-crediario-detail
- efisco:offline-crediario-open
- efisco:offline-crediario-items-update
- efisco:offline-cash-consult
- efisco:offline-finance-snapshot
- efisco:offline-cash-open
- efisco:offline-cash-movement
- efisco:offline-cash-close
- efisco:nfce-number-peek
- efisco:offline-sale-paid
- efisco:offline-nfce-contingency-danfe-preview
- efisco:superadmin-a1-mirror

### window.postMessage recebido pelo preload
- SCF_EFISCO_OFFLINE_VERIFIER_CANDIDATE
- SCF_SUPERADMIN_CERTIFICADO_A1_ENVIAR

## Rede

### Aplicação online
- https://jpiresoficial.wixstudio.com/e-fisco

### API e-fisco
- https://api.e-fisco.app/sync/device/pair
- https://api.e-fisco.app/sync/push
- https://api.e-fisco.app/sync/device/ping
- https://api.e-fisco.app/sync/reference/pull
- https://api.e-fisco.app/sync/device/bootstrap-multiempresa
- https://api.e-fisco.app/sync/cash/state
- https://api.e-fisco.app/sync/cash/summary
- https://api.e-fisco.app/sync/fiscal/certificate/source
- https://api.e-fisco.app/sync/fiscal/certificate/provision
- https://api.e-fisco.app/sync/device/offline-credential/provision
- https://api.e-fisco.app/desktop/manifest

### Fiscal / SVRS
- https://nfce.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx
- https://nfce.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx

O `electron-updater` também é uma fronteira de rede; o feed de publicação é
configurado em `package.json`.

## Persistência local

A aplicação usa `app.getPath('userData')` como raiz de dados persistentes.

Contratos observados:

- banco SQLite: `e-fisco-offline.db`
- chaves locais no SQLite:
  - `sync.deviceId`
  - `sync.empresaId`
- autenticação:
  - diretório `offline-auth`
  - arquivo `sync-device-token.bin`
  - reparo: `offline-auth/device-pairing-repair.json`
- standby:
  - `offline-standby/state.json`
  - `offline-standby/last-valid-manifest.json`
  - `offline-standby/slots/A`
  - `offline-standby/slots/B`
  - `offline-standby/downloads`
  - `offline-standby/quarantine`

O certificado A1 também é armazenado localmente pelo módulo
`offline-fiscal-certificate-store.js`, usando o fluxo de proteção fornecido
pelo `safeStorage` do Electron.

## Linha de comando

`phase2-pair-device.js` recebe o código de pareamento em `process.argv[2]`.

## UI local

`offline-ui-server.js` inicia um servidor HTTP em `127.0.0.1`, selecionando
uma porta disponível em runtime, e serve os arquivos da pasta `offline-ui`.

## Impressão / Windows

O canal `efisco:print-nfce-windows-driver` é uma fronteira com o sistema
operacional e com o driver/script de impressão `print-driver-nfce.ps1`.

---

# 1.5/7 — Efeitos colaterais e I/O observável

Este passo distingue cálculo local de operações que atravessam uma fronteira do
processo. Leitura de SQLite/arquivo é registrada como I/O mesmo quando não
muda estado; escrita, rede, processos, listeners e timers são efeitos
colaterais mutáveis.

## Legenda

- **SQLite R**: leitura do banco local.
- **SQLite W**: escrita, migration ou transação no banco local.
- **FS R/W**: leitura/escrita/remoção/rename de arquivos ou diretórios.
- **SafeStorage**: criptografia/decriptografia vinculada ao Electron/Windows.
- **Rede**: HTTP/HTTPS externo.
- **IPC/UI**: Electron IPC, BrowserWindow, WebContentsView ou renderer.
- **Processo/OS**: subprocesso, impressão, updater ou integração Windows.
- **Loopback**: listener HTTP local em 127.0.0.1.
- **Memória/Timer**: estado mutável em memória ou agendamento periódico.

## Matriz por módulo

| Módulo | I/O / efeito observado | Natureza |
| --- | --- | --- |
| offline-cash-service.js | SQLite R/W; enfileira operações no outbox | mutável |
| offline-db.js | FS W para diretório/banco; SQLite R/W; migrations e transações | mutável |
| offline-device-auth.js | SQLite R/W; FS R/W dos tokens; SafeStorage | mutável |
| offline-device-pairing.js | HTTPS para endpoint de pareamento | externo |
| offline-fiscal-certificate-provisioning.js | HTTPS de provisionamento; armazenamento A1 via certificate-store | mutável/externo |
| offline-fiscal-certificate-store.js | FS R/W do bundle A1; SafeStorage | mutável |
| offline-fiscal-contingency-service.js | SQLite R/W; leitura/uso do A1 via signer | mutável |
| offline-fiscal-nfce-danfe.js | SQLite R; geração local de modelo/XML | leitura |
| offline-fiscal-nfce-qrcode.js | SQLite R/W; leitura do A1; SafeStorage indireto | mutável |
| offline-fiscal-nfce-xml.js | transformação XML em memória | sem I/O externo observado |
| offline-fiscal-number-maintenance.js | SQLite R; chama reserva remota; estado `inFlight` em memória | mutável/externo |
| offline-fiscal-number-service.js | Rede via sync HTTP; SQLite R/W de lease | mutável/externo |
| offline-fiscal-outbox-worker.js | SQLite R/W; invoca transporte fiscal injetado | mutável/externo |
| offline-fiscal-runtime.js | recuperação/processamento do outbox; transporte SVRS | mutável/externo |
| offline-fiscal-sale-pipeline.js | SQLite R/W; leitura/inspeção A1; persiste documento/outbox | mutável |
| offline-fiscal-svrs-transport.js | Rede SOAP HTTP/HTTPS; leitura do certificado A1 e trust anchors | externo |
| offline-fiscal-trust-anchors.js | leitura das autoridades TLS do runtime/SO | leitura |
| offline-fiscal-xml-signer.js | leitura/decriptação do A1; operações criptográficas em memória | leitura |
| offline-outbox-worker.js | SQLite R/W; invoca transporte fornecido pelo chamador | mutável/externo |
| offline-product-service.js | SQLite R somente | leitura |
| offline-sale-service.js | SQLite R/W; aciona pipeline fiscal em venda paga | mutável |
| offline-standby.js | FS R/W/delete/rename; download HTTP/HTTPS; extração ZIP e hashes | mutável/externo |
| offline-sync-http-transport.js | HTTP/HTTPS para API e-fisco | externo |
| offline-ui-server.js | FS R; abre listener HTTP em 127.0.0.1 | recurso local |

## Entry points e efeitos fora dos 24 módulos públicos

### main.js

É o maior concentrador de efeitos colaterais do processo:

- cria `BrowserWindow` e `WebContentsView`;
- registra handlers `ipcMain.on` e `ipcMain.handle`;
- inicializa e encerra o SQLite;
- lê e grava arquivos em `userData` e `temp`;
- grava `impressao-driver.log`;
- cria/copia/remove arquivos temporários de impressão e atualização;
- usa `safeStorage`;
- faz requisições HTTPS;
- inicia ciclos periódicos com `setInterval` e `setTimeout`;
- usa `electron-updater` para checar, baixar e instalar atualização;
- inicia `EFISCO-UPDATER.exe` como processo destacado;
- inicia `powershell.exe` para o driver de impressão;
- controla failover online/offline e estado das views.

Consequência: testar `main.js` diretamente exige múltiplos doubles/mocks ou
testes de integração Electron. Ele não deve ser o primeiro alvo de testes
unitários.

### preload.js

Efeitos observados:

- publica APIs com `contextBridge.exposeInMainWorld`;
- envia e recebe IPC por `ipcRenderer`;
- recebe eventos `window.message`;
- transforma chamadas da UI em contratos IPC.

Não grava banco ou filesystem diretamente.

### phase2-pair-device.js

Efeitos observados:

- lê `process.argv[2]`;
- inicializa/consulta SQLite;
- usa `safeStorage`;
- chama o endpoint de pareamento;
- persiste identidade/token local.

## Efeitos críticos que precisam de cobertura posterior

### Persistência transacional

`offline-db.js` usa explicitamente `BEGIN IMMEDIATE`, `COMMIT` e
`ROLLBACK` em migrations e operações de domínio. Os testes devem verificar
não apenas o retorno, mas também o estado final e rollback em falhas.

### Credenciais e certificado

Tokens de dispositivo e bundle A1 atravessam filesystem + `safeStorage`.
Testes desses fluxos precisam usar diretório temporário e uma implementação
controlada de criptografia; não devem reutilizar credenciais reais.

### Sincronização e fiscal

Os workers de outbox alteram estado local antes/depois de chamar transportes.
Os testes devem controlar resultados como sucesso, retry, conflito,
ambiguidade e revisão manual sem acessar endpoints reais.

### Standby

`offline-standby.js` possui efeitos de alto impacto em filesystem:
download, criação de staging, extração, rename, exclusão, slots A/B e
rollback. Deve ser testado exclusivamente em árvore temporária isolada.

### Impressão e atualização

Impressão e atualização iniciam processos externos. A cobertura automatizada
deve substituir `spawn`/updater por doubles nos testes de unidade e reservar
execução real para testes de integração controlados.

---

# 1.6/7 — Classificação de testabilidade

A testabilidade foi classificada por fronteira real, não apenas por arquivo.
Um mesmo módulo pode ter funções de nível A e funções de nível C/D.

## Níveis

- **A — unitário direto**: determinístico, sem I/O externo; usa apenas argumentos
  e memória. Deve ser o primeiro grupo de testes.
- **B — unitário com doubles**: depende de transporte, relógio, builder ou outro
  colaborador que pode ser substituído/controlado.
- **C — integração local**: depende de SQLite, filesystem, certificado local ou
  servidor loopback. Deve usar banco/diretório temporário isolado.
- **D — integração de sistema**: depende de Electron real, Windows, processos,
  impressão, updater ou rede externa real. Não pertence à primeira camada de CI.

## Matriz por módulo

| Módulo | Nível predominante | Partes diretamente isoláveis | Partes que exigem integração/doubles |
| --- | --- | --- | --- |
| offline-cash-service.js | A/C | decimalToCents, centsToValue e transformações de resumo | abertura/movimento/fechamento usam SQLite/outbox |
| offline-db.js | C | pequenas normalizações internas não exportadas | API pública depende de SQLite real |
| offline-device-auth.js | A/C | normalizeDeviceId, normalizeEmpresaId, normalizeDeviceToken | identidade usa SQLite; tokens usam FS + SafeStorage |
| offline-device-pairing.js | A/B | normalizePairingCode | requestDevicePairing precisa transporte HTTP controlado |
| offline-fiscal-certificate-provisioning.js | B/C | validação/decodificação interna | rede + armazenamento A1 |
| offline-fiscal-certificate-store.js | C | validações internas | FS + SafeStorage |
| offline-fiscal-contingency-service.js | A/C | validatePersistedSignedDocument | finalização usa SQLite + assinatura A1 |
| offline-fiscal-nfce-danfe.js | A/C | parseFinalNfce, buildDanfeContingencyModels | generateDanfeContingencyForSale lê SQLite |
| offline-fiscal-nfce-qrcode.js | A/C | parseSignedNfceDocument, validateQrTextAgainstSignedXml, buildInfNFeSuplXml, buildNfceXmlWithSupplement | geração/finalização A1 usa certificado + SQLite |
| offline-fiscal-nfce-xml.js | A | generateUnsignedNfceXml | nenhuma fronteira externa observada |
| offline-fiscal-number-maintenance.js | B/C | regras de policy/intent internas | SQLite + reserva remota + estado inFlight |
| offline-fiscal-number-service.js | B/C | normalização fiscal interna | sync HTTP + SQLite de lease |
| offline-fiscal-outbox-worker.js | B/C | preparação/validação interna | SQLite + transporte fiscal injetado |
| offline-fiscal-runtime.js | B/C | cálculo temporal interno | worker + transporte SVRS |
| offline-fiscal-sale-pipeline.js | A/C | validateCurrentSupportedSubset, validateProfile e parte de prepareFiscalMode | A1 + SQLite + persistência fiscal |
| offline-fiscal-svrs-transport.js | A/B | authorizationMessage, consultationMessage, parseAuthorizationResponse, parseConsultationResponse | createSvrsProductionTransport usa rede/certificado |
| offline-fiscal-trust-anchors.js | C | validação da raiz embutida | consulta CAs do runtime/SO |
| offline-fiscal-xml-signer.js | A/C | extractPkcs12SigningMaterial, verifySignedNfeXml, signNfeXmlWithPkcs12 podem usar fixtures em memória | signNfeXmlFromLocalA1 lê bundle local |
| offline-outbox-worker.js | A/B/C | retryDelayForAttempt, retryAtForOperation, normalizeTransportResult | processOutboxOnce/recover usam SQLite e transporte |
| offline-product-service.js | A/C | normalizeSearch, mapProductForSale, productAvailableQuantity | list/find consultam SQLite |
| offline-sale-service.js | A/C | moneyCentsFromDecimal, quantitySnapshot, roundedLineTotalCentavos, normalizePaymentParts e builders com fixtures controladas | list/register usam SQLite e pipeline fiscal |
| offline-standby.js | A/B/C | compareVersions, validateManifest, validateStandbyPackageManifest, evaluateCompatibility | ZIP/FS/download/slots/rollback exigem árvore temporária e transporte controlado |
| offline-sync-http-transport.js | A/B | operationEnvelope, normalizeServerResult, referencePullPayload | ping/pull/post/create transport usam HTTP |
| offline-ui-server.js | A/C | resolveOfflineUiFiles | startOfflineUiServer usa FS + socket loopback |

## Entry points

### main.js — nível D

Não é um bom primeiro alvo unitário. Depende simultaneamente de:

- Electron;
- BrowserWindow/WebContentsView;
- IPC;
- SQLite;
- filesystem;
- safeStorage;
- HTTPS;
- timers;
- electron-updater;
- subprocessos e PowerShell.

Estratégia posterior: testar serviços abaixo dele primeiro e deixar para
`main.js` testes de contrato IPC e integração Electron.

### preload.js — nível B/D

A lógica é pequena, mas depende do runtime Electron. Pode receber testes com
doubles de `contextBridge` e `ipcRenderer`; a validação final deve ocorrer em
integração Electron.

### phase2-pair-device.js — nível D

É um entrypoint operacional: combina argumento de linha de comando, Electron,
SQLite, rede e SafeStorage. Deve ser coberto depois dos módulos que ele
orquestra.

## Primeira onda recomendada de testes unitários

Estas funções apresentam o melhor retorno inicial porque têm pouca ou nenhuma
dependência externa:

### Vendas e valores
- offline-sale-service.moneyCentsFromDecimal
- offline-sale-service.quantitySnapshot
- offline-sale-service.roundedLineTotalCentavos
- offline-sale-service.normalizePaymentParts
- offline-cash-service.decimalToCents
- offline-cash-service.centsToValue

### Produtos
- offline-product-service.normalizeSearch
- offline-product-service.mapProductForSale
- offline-product-service.productAvailableQuantity

### Outbox
- offline-outbox-worker.retryDelayForAttempt
- offline-outbox-worker.retryAtForOperation
- offline-outbox-worker.normalizeTransportResult

### Fiscal
- offline-fiscal-nfce-xml.generateUnsignedNfceXml
- offline-fiscal-sale-pipeline.validateCurrentSupportedSubset
- offline-fiscal-sale-pipeline.validateProfile
- offline-fiscal-contingency-service.validatePersistedSignedDocument
- offline-fiscal-nfce-danfe.parseFinalNfce
- offline-fiscal-nfce-danfe.buildDanfeContingencyModels
- offline-fiscal-nfce-qrcode.parseSignedNfceDocument
- offline-fiscal-nfce-qrcode.validateQrTextAgainstSignedXml
- offline-fiscal-svrs-transport.authorizationMessage
- offline-fiscal-svrs-transport.consultationMessage
- offline-fiscal-svrs-transport.parseAuthorizationResponse
- offline-fiscal-svrs-transport.parseConsultationResponse

### Sync, identidade e standby
- offline-device-auth.normalizeDeviceId
- offline-device-auth.normalizeEmpresaId
- offline-device-auth.normalizeDeviceToken
- offline-device-pairing.normalizePairingCode
- offline-sync-http-transport.operationEnvelope
- offline-sync-http-transport.normalizeServerResult
- offline-sync-http-transport.referencePullPayload
- offline-standby.compareVersions
- offline-standby.validateManifest
- offline-standby.validateStandbyPackageManifest
- offline-standby.evaluateCompatibility

## Segunda onda — integração local

Depois dos testes unitários, a próxima camada deve usar apenas recursos
temporários locais:

1. `offline-db.js` com um `userDataDir` temporário;
2. migrations 1 a 13 e reabertura do banco;
3. operações atômicas de venda, caixa, estoque, crediário e outbox;
4. `offline-device-auth.js` com SafeStorage fake;
5. `offline-fiscal-certificate-store.js` com diretório temporário;
6. pipeline fiscal com certificado fixture não produtivo;
7. `offline-standby.js` em diretório temporário;
8. `offline-ui-server.js` usando apenas 127.0.0.1.

## Terceira onda — contratos de transporte

A rede real não é necessária para a maior parte da cobertura. Devem ser
testados com transportes controlados:

- respostas HTTP 2xx, 4xx e 5xx;
- timeout;
- retry;
- resposta malformada;
- conflito;
- ambiguidade;
- autorização/rejeição fiscal;
- reconciliação por chave.

Somente após isso faz sentido um conjunto pequeno de testes contra ambientes
externos autorizados.

## Última onda — Electron/Windows

Reservar para:

- IPC renderer -> preload -> main;
- failover online/offline;
- impressão real;
- `EFISCO-UPDATER.exe`;
- `electron-updater`;
- lifecycle da janela;
- pareamento completo;
- instalação/build NSIS.

Esses testes são mais lentos e frágeis e não devem bloquear a criação da
primeira suíte unitária.

## Conclusão de testabilidade

A arquitetura **não exige refatoração ampla para começar a testar**. Já existem
muitos contratos exportados e funções determinísticas. O principal caminho é
começar no nível A, depois cobrir SQLite/filesystem no nível C e deixar
Electron/Windows/rede real para o nível D.

---

# 1.7/7 — Matriz final de contratos

Esta matriz consolida os micropassos 1.1 a 1.6. A granularidade aqui é por
módulo/entrypoint; a lista exata das funções públicas permanece no item 1.2.

## Prioridade de cobertura

- **P0** — primeira suíte: regras determinísticas e contratos com alto impacto.
- **P1** — integração local: SQLite, filesystem, SafeStorage fake e loopback.
- **P2** — transportes e orquestração com doubles/servidores controlados.
- **P3** — integração completa Electron/Windows/serviços externos.

## Matriz consolidada

| Contrato / módulo | Entrada principal | Saída / contrato observável | Dependências principais | Efeitos colaterais | Testabilidade | Prioridade |
| --- | --- | --- | --- | --- | --- | --- |
| offline-cash-service.js | empresa, sessão, valores e movimentos de caixa | resumo/estado de caixa, abertura, movimento ou fechamento | offline-db, offline-device-auth | SQLite R/W, outbox | A/C | P0/P1 |
| offline-db.js | objetos de domínio, IDs, datas, valores e diretório userData | registros/estado persistido, consultas, leases, vendas e outbox | node:sqlite, fs, path, crypto | SQLite R/W, migrations, transações, criação do DB | C | P1 |
| offline-device-auth.js | db, userDataDir, empresaId, deviceId, token, safeStorage | identidade e token normalizados/persistidos | SQLite, fs, crypto, SafeStorage | SQLite R/W, FS R/W, criptografia local | A/C | P0/P1 |
| offline-device-pairing.js | deviceId, pairingCode, endpoint/timeout opcionais | resposta de pareamento normalizada | https, URL | HTTPS | A/B | P0/P2 |
| offline-fiscal-certificate-provisioning.js | identidade do device, dados de provisionamento e SafeStorage | bundle A1 provisionado/armazenado | sync-http-transport, certificate-store, crypto | HTTPS, armazenamento seguro local | B/C | P1/P2 |
| offline-fiscal-certificate-store.js | userDataDir, PFX/bundle, senha/material protegido, SafeStorage | bundle A1 armazenado, carregado ou inspecionado | fs, path, crypto, SafeStorage | FS R/W, criptografia local | C | P1 |
| offline-fiscal-contingency-service.js | documento/venda, perfil fiscal e material A1 | XML assinado persistido / estado de contingência | offline-db, nfce-xml, xml-signer | SQLite R/W, uso de certificado | A/C | P0/P1 |
| offline-fiscal-nfce-danfe.js | documento NFC-e ou saleId | modelos de DANFE de contingência | offline-db, nfce-qrcode, xmldom, crypto | SQLite R em entrypoint por saleId | A/C | P0/P1 |
| offline-fiscal-nfce-qrcode.js | XML/documento assinado, URL QR, certificado | QR Code v3, infNFeSupl e XML final | offline-db, certificate-store, xml-signer, xmldom | SQLite R/W, leitura de A1 | A/C | P0/P1 |
| offline-fiscal-nfce-xml.js | snapshot/documento fiscal estruturado | XML NFC-e não assinado + metadados derivados | xmldom | sem I/O externo observado | A | P0 |
| offline-fiscal-number-maintenance.js | empresa, política de estoque de números, horário e contexto fiscal | inventário de lease mantido / intenção de reserva | offline-db, number-service | SQLite R/W indireto, rede indireta, estado inFlight | B/C | P1/P2 |
| offline-fiscal-number-service.js | empresa/device/perfil fiscal/requestId/quantidade | lease fiscal reservado ou reutilizado | sync-http-transport, offline-db | HTTPS indireto, SQLite R/W | B/C | P1/P2 |
| offline-fiscal-outbox-worker.js | empresa, relógio, transporte fiscal e lote disponível | resumo de processados/retry/autorizados/rejeitados | offline-db, nfce-qrcode | SQLite R/W, transporte fiscal | B/C | P1/P2 |
| offline-fiscal-runtime.js | empresa/device, enabled, relógio e opções de transporte | resumo de ciclo de reconexão fiscal | fiscal-outbox-worker, svrs-transport | SQLite indireto, rede SVRS | B/C | P2 |
| offline-fiscal-sale-pipeline.js | venda paga + perfil/lease/certificado/opções | resultado fiscal, documento, QR, DANFE readiness e outbox | offline-db, certificate-store, contingency, qrcode, danfe | SQLite R/W, leitura A1 | A/C | P0/P1 |
| offline-fiscal-svrs-transport.js | XML/chave de acesso, certificado, endpoint/timeout | resultado normalizado de autorização ou consulta | http/https, xmldom, certificate-store, trust-anchors | SOAP HTTP/HTTPS, leitura A1/TLS | A/B | P0/P2 |
| offline-fiscal-trust-anchors.js | runtime TLS | lista de CAs/âncoras de confiança para SVRS | tls, crypto | leitura do runtime/SO | C | P1 |
| offline-fiscal-xml-signer.js | XML, PFX/bundle, senha/material A1 | XML assinado/verificado + metadados de certificado | node-forge, xml-crypto, xmldom, certificate-store | criptografia; FS/SafeStorage apenas no fluxo local A1 | A/C | P0/P1 |
| offline-outbox-worker.js | empresa, relógio, transporte e operações prontas | estados confirmado/retry/conflito/revisão e resumo | offline-db | SQLite R/W, transporte injetado | A/B/C | P0/P1 |
| offline-product-service.js | empresa e critério/produto/cache de estoque | produto(s) mapeado(s), disponibilidade e busca | offline-db, offline-device-auth | SQLite R nas consultas | A/C | P0/P1 |
| offline-sale-service.js | venda, itens, pagamentos, cliente e opções | input atômico, recibo/financeiro e resultado de venda paga | offline-db, offline-device-auth, fiscal-sale-pipeline | SQLite R/W, pipeline fiscal | A/C | P0/P1 |
| offline-standby.js | manifesto, versão, userDataDir, pacote/slots e URLs | manifesto validado, pacote preparado, slot ativo/rollback | fs, path, http/https, crypto, zlib | download, FS R/W/delete/rename, extração ZIP | A/B/C | P0/P1/P2 |
| offline-sync-http-transport.js | operação/payload, deviceId/token, endpoint/timeout | resposta de sync normalizada | http/https, URL | HTTP/HTTPS | A/B | P0/P2 |
| offline-ui-server.js | rootDir/arquivos da UI | origin/servidor loopback e arquivos servidos | fs, http, path | FS R, listener 127.0.0.1 | A/C | P1 |

## Entry points e fronteiras de aplicação

| Entrypoint | Entrada | Saída / responsabilidade | Dependências / efeitos | Testabilidade | Prioridade |
| --- | --- | --- | --- | --- | --- |
| main.js | lifecycle Electron, IPC, rede, estado local e eventos da UI | janela principal, modo offline, IPC, atualização, impressão e orquestração | Electron, SQLite, FS, HTTPS, timers, updater, spawn/PowerShell | D | P3 |
| preload.js | chamadas do renderer e window.message | bridges efiscoDesktop/efiscoOfflineVerifierBridge e IPC | Electron contextBridge/ipcRenderer | B/D | P2/P3 |
| phase2-pair-device.js | process.argv[2] + lifecycle Electron | pareamento completo e persistência da identidade/token | Electron, SQLite, HTTPS, SafeStorage | D | P3 |

## Contratos P0 que devem formar a primeira suíte

A primeira suíte automatizada deve cobrir, no mínimo, estes grupos:

1. **Valores e vendas**
   - conversão monetária;
   - quantidade;
   - arredondamento de linha;
   - normalização de pagamentos;
   - montagem de inputs atômicos.

2. **Produtos**
   - normalização de busca;
   - mapeamento para venda;
   - cálculo de quantidade disponível.

3. **Outbox**
   - cálculo de atraso/retry;
   - normalização de resultado de transporte;
   - transições esperadas para respostas controladas.

4. **Fiscal**
   - validação do subconjunto suportado;
   - validação de perfil;
   - geração de XML NFC-e;
   - parse/validação de XML assinado;
   - geração/validação de QR;
   - montagem e parse das mensagens SVRS;
   - assinatura/verificação com fixture não produtiva.

5. **Identidade, sync e standby**
   - normalizadores de device/empresa/token/pairing;
   - envelope de sincronização;
   - normalização de resposta HTTP;
   - payload de reference pull;
   - comparação de versões;
   - validação de manifesto e compatibilidade.

## Contratos P1 que exigem ambiente temporário

A segunda camada deve provar:

- criação e reabertura de `e-fisco-offline.db`;
- migrations até `OFFLINE_DB_SCHEMA_VERSION = 13`;
- rollback de operações atômicas;
- estoque, caixa, crediário, venda e outbox persistidos;
- persistência segura de tokens com SafeStorage fake;
- armazenamento/carregamento do A1 em diretório temporário;
- geração fiscal persistida ponta a ponta sem rede real;
- standby/slots/rollback em árvore temporária;
- servidor offline apenas em `127.0.0.1`.

## Contratos P2 que devem usar doubles ou servidor controlado

Cobrir:

- pareamento;
- sync push/ping/pull/bootstrap/caixa/certificado;
- reserva de numeração fiscal;
- outbox geral;
- outbox fiscal;
- SOAP SVRS;
- timeouts, 4xx/5xx, retry, conflito, ambiguidade e payload inválido;
- preload com doubles de IPC.

Nenhum teste P2 deve depender da disponibilidade de produção para ser
determinístico em CI.

## Contratos P3 de sistema

Devem ser poucos e direcionados:

- inicialização Electron;
- renderer -> preload -> main;
- failover online/offline;
- impressão via PowerShell/driver Windows;
- atualização com electron-updater;
- execução do EFISCO-UPDATER.exe;
- pareamento completo no aplicativo;
- build/instalação NSIS.

## Critério de conclusão do inventário

O inventário arquitetural da Etapa 1 é considerado completo quando:

- módulos e APIs públicas estão enumerados;
- dependências estão mapeadas;
- fronteiras externas estão registradas;
- efeitos colaterais estão classificados;
- testabilidade está classificada;
- cada módulo tem entrada, saída, dependências, efeitos e prioridade de
  cobertura documentados.

Esses critérios agora estão atendidos para a release 1.0.41 observada.

---

# Estado da Etapa 1

- [x] 1.1 — módulos públicos inventariados
- [x] 1.2 — APIs públicas catalogadas
- [x] 1.3 — dependências entre módulos mapeadas
- [x] 1.4 — entradas externas identificadas
- [x] 1.5 — efeitos colaterais mapeados
- [x] 1.6 — testabilidade classificada
- [x] 1.7 — matriz final de contratos

**Etapa 1 — inventário de contratos públicos: CONCLUÍDA.**

Este documento descreve a release 1.0.41 observada e passa a ser a linha de
base arquitetural para a criação dos testes, documentação complementar e CI.





---

# Etapa 7 — arquitetura

## 7.1/6 — mapa arquitetural e responsabilidades dos módulos

A Etapa 7 parte da arquitetura **observada após as Etapas 4, 5 e 6**, e não
das contagens históricas do inventário 1.x.

Foi criado o mapa estruturado:

- `architecture/module-responsibilities.json`.

Esse arquivo é intencionalmente fora de `build.files`: ele documenta e
permite validar a arquitetura do código-fonte, mas não é necessário em runtime
nem deve entrar no instalador.

### Fotografia atual

O levantamento estático do código de produção encontrou:

- arquivos JavaScript de produção: **29**;
- módulos com `module.exports`: **26**;
- dependências internas `require('./...')`: **54**;
- camadas/responsabilidades catalogadas: **10**.

Os self-tests `phase1-selftest.js` e `phase2-db-selftest.js` não entram
nessa contagem de produção.

As contagens de 24 módulos registradas no inventário 1.x são históricas. Desde
então passaram a existir também:

- `offline-sale-values.js`;
- `offline-fiscal-values.js`.

### Camadas atuais

| Camada | Módulos | Responsabilidade proprietária |
| --- | ---: | --- |
| electron-entrypoints | 3 | lifecycle Electron, bridge renderer/IPC e utilitário de pareamento |
| application-services | 3 | casos de uso offline de produto, caixa e venda |
| domain-values | 2 | cálculos e normalizações determinísticas sem I/O |
| persistence | 1 | SQLite, migrations e transações locais |
| identity-sync | 4 | identidade, pareamento, transporte HTTP e outbox geral |
| fiscal-credentials | 3 | provisionamento, armazenamento protegido e uso do A1 |
| fiscal-document | 4 | XML NFC-e, assinatura local, QR, suplemento e DANFE |
| fiscal-numbering | 2 | reserva, inventário e manutenção de leases |
| fiscal-orchestration | 5 | pipeline fiscal, outbox, runtime, SOAP SVRS e trust |
| desktop-support | 2 | standby/rollback e servidor loopback da UI |

### Donos de responsabilidade

#### Processo e fronteira com o renderer

- `main.js` é o orquestrador do processo principal Electron.
- `preload.js` é a fronteira context-isolated do renderer com IPC.
- `phase2-pair-device.js` é um entrypoint operacional separado.

Esses entrypoints coordenam módulos abaixo deles; não são a fonte primária das
regras de domínio.

#### Persistência

`offline-db.js` é o proprietário do SQLite offline.

Responsabilidades que pertencem a essa fronteira:

- inicialização/fechamento;
- migrations;
- caches locais;
- transações atômicas;
- estoque;
- caixa e financeiro persistidos;
- vendas e crediário persistidos;
- leases/documentos fiscais persistidos;
- outbox geral e fiscal persistidas.

Os demais módulos acessam persistência por meio da API pública de
`offline-db.js`; nenhum outro módulo de produção abre `node:sqlite`
diretamente.

#### Serviços de aplicação

- `offline-product-service.js`: consulta/mapeamento de produto e estoque
  disponível para venda;
- `offline-cash-service.js`: casos de uso de caixa;
- `offline-sale-service.js`: montagem/registro de vendas e crediário, incluindo
  o ponto de entrada para venda fiscal.

Esses serviços coordenam regras de domínio e persistência, mas não são donos do
arquivo SQLite nem dos transportes de rede.

#### Valores determinísticos

- `offline-sale-values.js`;
- `offline-fiscal-values.js`.

São a camada destinada a normalização/cálculos determinísticos sem I/O. Essa
fronteira reduz a necessidade de importar módulos de persistência para regras
matemáticas e de formato.

#### Identidade e sincronização

- `offline-device-auth.js`: identidade e tokens locais;
- `offline-device-pairing.js`: pareamento;
- `offline-sync-http-transport.js`: rede da API e-fisco;
- `offline-outbox-worker.js`: máquina de processamento da outbox geral.

A responsabilidade de transporte fica separada da máquina de estados da
outbox.

#### Credenciais fiscais

- `offline-fiscal-certificate-provisioning.js`: obtenção/provisionamento;
- `offline-fiscal-certificate-store.js`: armazenamento protegido do A1;
- `offline-fiscal-xml-signer.js`: material PKCS#12 e XMLDSig.

O armazenamento A1 é a fronteira de filesystem/SafeStorage; o signer é a
fronteira criptográfica.

#### Documento fiscal

- `offline-fiscal-contingency-service.js`;
- `offline-fiscal-nfce-xml.js`;
- `offline-fiscal-nfce-qrcode.js`;
- `offline-fiscal-nfce-danfe.js`.

Essa camada transforma o snapshot fiscal persistido em artefatos da NFC-e e
DANFE. O transporte SVRS não pertence a essa camada.

#### Numeração fiscal

- `offline-fiscal-number-service.js`: reserva remota da faixa;
- `offline-fiscal-number-maintenance.js`: manutenção preventiva do inventário.

O contador persistido permanece em `offline-db.js`; esses serviços coordenam
obtenção e manutenção.

#### Orquestração fiscal e transporte

- `offline-fiscal-sale-pipeline.js`: pipeline local da venda fiscal;
- `offline-fiscal-outbox-worker.js`: máquina de estados da transmissão;
- `offline-fiscal-runtime.js`: ciclo de reconexão;
- `offline-fiscal-svrs-transport.js`: SOAP SVRS;
- `offline-fiscal-trust-anchors.js`: confiança TLS do transporte.

A separação observada é:

`pipeline local -> persistência/outbox -> runtime/worker -> transporte SVRS`.

#### Suporte desktop

- `offline-standby.js`: pacote offline, slots, ativação e rollback;
- `offline-ui-server.js`: arquivos estáticos da UI em loopback.

Essas responsabilidades não fazem parte do domínio de venda/fiscal.

### Snapshot de dependências

`architecture/module-responsibilities.json` contém
`directDependencies` com todas as 54 arestas locais observadas.

Neste micropasso essas arestas são apenas uma fotografia objetiva. A análise de
acoplamento, direção indesejada e ciclos pertence ao **7.2/6**.

### Validação automática do mapa

O mapa foi comparado diretamente com os arquivos atuais.

A validação confirmou:

- JSON válido;
- 29 arquivos de produção presentes no mapa;
- 29 atribuições de camada;
- nenhum módulo duplicado entre camadas;
- nenhum arquivo de produção ausente;
- 26 módulos exportados;
- 54 dependências reais;
- 54 dependências registradas;
- diferença entre grafo real e mapa: **0**.

Resultado:

`ARCH_MAP_VALIDATION=OK`.

## 7.2/6 — acoplamentos, dependências e ciclos

Foi criado:

- `architecture/dependency-analysis.json`.

A análise usa como entrada o mapa estruturado do 7.1 e mede somente o grafo
estático CommonJS local formado por `require('./...')`. Dependências
externas, IPC, callbacks injetados e carregamentos feitos pelo Electron são
fronteiras diferentes e não são tratados como arestas CommonJS neste passo.

### Resultado do grafo

Foram confirmados:

- nós: **29**;
- arestas internas: **54**;
- componentes fortemente conectados: **29**;
- componentes cíclicos: **0**;
- grafo acíclico: **sim**.

Portanto, o grafo local atual é um **DAG**. Não existe ciclo de `require`
entre os módulos JavaScript de produção mapeados.

O caminho de dependência mais longo encontrado possui 6 arestas:

`main.js -> offline-sale-service.js -> offline-fiscal-sale-pipeline.js -> offline-fiscal-nfce-danfe.js -> offline-fiscal-nfce-qrcode.js -> offline-fiscal-xml-signer.js -> offline-fiscal-certificate-store.js`.

### Hotspots de acoplamento direto

#### main.js

- fan-out: **13**;
- fan-in: **0**;
- dependências transitivas: **24**.

É o maior concentrador de saída do grafo. Isso é compatível com seu papel de
orquestrador Electron, mas significa que alterações no processo principal
atravessam muitas fronteiras.

#### offline-db.js

- fan-out: **0**;
- fan-in: **13**.

É o maior concentrador de entrada. Treze módulos dependem diretamente de sua
API pública, portanto mudanças de contrato em persistência possuem grande raio
de impacto.

#### offline-fiscal-nfce-qrcode.js

- fan-out: **4**;
- fan-in: **3**;
- acoplamento direto total: **7**.

É o principal módulo-ponte dentro do subgrafo documental fiscal: depende de
persistência, certificado, valores fiscais e signer, e ao mesmo tempo é usado
por DANFE, pipeline e fiscal outbox.

#### offline-fiscal-sale-pipeline.js

- fan-out: **5**;
- fan-in: **1**;
- dependências transitivas: **8**.

É o orquestrador fiscal local com maior número de colaboradores diretos.

#### offline-sale-service.js

- fan-out: **4**;
- fan-in: **1**;
- dependências transitivas: **11**.

A entrada no pipeline fiscal faz com que o serviço de venda alcance uma parcela
significativa do subgrafo fiscal, apesar de possuir somente quatro imports
diretos.

### Dependências compartilhadas

Os maiores fan-ins são:

- `offline-db.js`: **13** consumidores diretos;
- `offline-device-auth.js`: **5**;
- `offline-fiscal-certificate-store.js`: **5**;
- `offline-fiscal-nfce-qrcode.js`: **3**.

Esses números indicam concentração de dependência, não defeito automático.
Eles servem como referência para avaliar fronteiras e extrações nos passos
7.3/7.4.

### Relações entre camadas com mais arestas

As maiores concentrações entre camadas são:

- `electron-entrypoints -> identity-sync`: **6**;
- `fiscal-orchestration -> fiscal-document`: **4**;
- `application-services -> identity-sync`: **3**;
- `application-services -> persistence`: **3**;
- `electron-entrypoints -> application-services`: **3**;
- `fiscal-document -> fiscal-credentials`: **3**;
- `fiscal-document -> persistence`: **3**.

A direção dessas relações será avaliada como fronteira arquitetural no 7.3.
Neste passo elas são somente quantificadas.

### Alcance a partir dos entrypoints

Raízes consideradas:

- `main.js`;
- `preload.js`;
- `phase2-pair-device.js`.

Alcance transitivo:

- `main.js`: **24** módulos;
- `preload.js`: **0** dependências CommonJS locais;
- `phase2-pair-device.js`: **3** módulos.

A união das três raízes cobre **27 dos 29** arquivos de produção.

Dois módulos não são alcançados pelo grafo estático atual:

- `offline-fiscal-number-maintenance.js`;
- `offline-fiscal-number-service.js`.

Uma busca textual confirmou que:

- `ensureFiscalNumberLeaseInventory` só aparece no próprio módulo e nos
  testes;
- `reserveFiscalNumberLeaseOffline` aparece no módulo de manutenção, no
  próprio serviço e nos testes;
- nenhum entrypoint ou serviço de produção importa
  `offline-fiscal-number-maintenance.js`.

Esses arquivos continuam sendo empacotados por `offline-fiscal-*.js` e
possuem cobertura automatizada. A classificação correta neste momento é
**não alcançáveis pelo runtime estático atual**, e não “código morto”.

### Conclusões do 7.2

O grafo atual tem uma propriedade positiva importante: **não há ciclos locais
de dependência**.

Os pontos que merecem atenção nos próximos passos são concentração, não ciclos:

- `main.js` como hub de orquestração;
- `offline-db.js` como hub compartilhado de persistência;
- `offline-fiscal-nfce-qrcode.js` como ponte documental;
- `offline-fiscal-sale-pipeline.js` como orquestrador fiscal;
- `offline-sale-service.js` como ponte aplicação -> fiscal;
- a ilha estática formada pelos dois módulos de manutenção/reserva de
  numeração.

Nenhuma lógica de produção foi alterada neste micropasso.

### Validação

A análise estruturada foi recalculada e comparada ao mapa:

- `DEPENDENCY_ANALYSIS_JSON=OK`;
- `DEPENDENCY_GRAPH_NODES=29`;
- `DEPENDENCY_GRAPH_EDGES=54`;
- `DEPENDENCY_GRAPH_ACYCLIC=True`;
- `DEPENDENCY_UNREACHABLE=2`;
- `HOTSPOT_MAIN_FANOUT=13`;
- `HOTSPOT_DB_FANIN=13`;
- `HOTSPOT_QRCODE_TOTAL=7`;
- `DEPENDENCY_ANALYSIS_VALIDATION=OK`.

## 7.3/6 — fronteiras entre DB, serviços, fiscal, sync e UI

Foi criado:

- `architecture/boundary-contracts.json`.

O objetivo deste passo foi distinguir **propriedade de recurso** de
**acoplamento ao detalhe interno**. Em especial, `offline-db.js` continua
sendo o único módulo que abre `node:sqlite`, mas isso não significa que todo
acesso ao schema esteja encapsulado nele.

### Fronteira SQLite

Contrato confirmado:

- somente `offline-db.js` importa `node:sqlite`;
- somente ele inicializa/fecha o banco e executa migrations.

Resultado:

- importadores de `node:sqlite`: **1**;
- proprietário: `offline-db.js`.

Essa é uma fronteira forte de recurso.

### Dívida de fronteira — SQL bruto fora do kernel

A inspeção encontrou **20 chamadas `.prepare()` fora de
`offline-db.js`**, distribuídas em 5 módulos:

| Módulo | `.prepare()` | Tipo de acoplamento |
| --- | ---: | --- |
| `main.js` | 8 | entrypoint conhece schema diretamente |
| `offline-cash-service.js` | 5 | serviço de aplicação conhece schema |
| `offline-device-auth.js` | 2 | identidade acessa `local_config` diretamente |
| `offline-fiscal-number-maintenance.js` | 3 | numeração acessa `local_config` diretamente |
| `offline-sale-service.js` | 2 | read model financeiro conhece `sales` |

No `main.js`, os acessos diretos incluem:

- histórico de `cash_movements` no snapshot financeiro;
- agregação de status da `sync_outbox`;
- leitura de NFC-e autorizada e inserção de `NFCE_AUTHORIZED` na sync outbox;
- resolução de empresa do operador por
  `offline_provisioned_credentials` /
  `offline_prepared_companies`.

Portanto a formulação correta da fronteira é:

- `offline-db.js` é o proprietário do **lifecycle SQLite**;
- o **schema ainda vaza** por meio do handle retornado por
  `getOfflineDatabase()`.

Essa dívida será candidata principal de extração no 7.4.

### Serviços de aplicação

A direção desejada é:

`UI -> preload/main -> serviço de aplicação -> API de persistência`.

Estado observado:

- `offline-product-service.js` respeita essa fronteira e não possui SQL bruto;
- `offline-cash-service.js` e `offline-sale-service.js` ainda conhecem
  detalhes de tabela;
- os serviços não importam `node:sqlite` diretamente.

### Fronteira venda -> fiscal

A entrada da venda no fiscal ocorre por:

`offline-sale-service.js -> offline-fiscal-sale-pipeline.js`.

Foi confirmado que `offline-sale-service.js` não pula diretamente para:

- XML NFC-e;
- QR Code;
- transporte SVRS.

A UI também não chama módulos fiscais diretamente.

### Fronteira documento fiscal -> transporte

Os módulos documentais:

- `offline-fiscal-contingency-service.js`;
- `offline-fiscal-nfce-xml.js`;
- `offline-fiscal-nfce-qrcode.js`;
- `offline-fiscal-nfce-danfe.js`;
- `offline-fiscal-xml-signer.js`;

não importam:

- `offline-fiscal-svrs-transport.js`;
- `offline-sync-http-transport.js`.

A transmissão permanece na cadeia:

`fiscal outbox -> fiscal runtime -> SVRS transport`.

Essa fronteira está respeitada no grafo estático atual.

### Fronteira outbox geral -> transporte

`offline-outbox-worker.js` recebe o transporte pelo chamador e não importa
`offline-sync-http-transport.js` diretamente.

Isso mantém a máquina de estados testável sem rede real.

### Fronteira de rede

Módulos que importam `http` ou `https`: **6**.

Eles possuem responsabilidades distintas:

- `main.js`: probe `HEAD` de disponibilidade do Wix;
- `offline-device-pairing.js`: pareamento;
- `offline-fiscal-svrs-transport.js`: SOAP fiscal;
- `offline-standby.js`: download de manifesto/pacote;
- `offline-sync-http-transport.js`: API e-fisco/sync;
- `offline-ui-server.js`: servidor HTTP **loopback**, não rede externa.

Portanto o transporte de sync está centralizado, com exceções de rede de
propósito diferente explicitamente documentadas.

### Fronteira renderer -> runtime privilegiado

As duas configurações Electron observadas mantêm:

- `contextIsolation: true`;
- `nodeIntegration: false`;
- `sandbox: true`.

Nos arquivos da UI offline:

- chamadas `require(...)`: **0**;
- referências a `ipcRenderer`: **0**;
- referências a `efiscoDesktop`: **44**.

Assim, o renderer não acessa Node/IPC privilegiado diretamente; passa pelo
`contextBridge` do `preload.js`.

### Fronteira preload -> main

Foram extraídos os canais IPC usados pelo preload e os registrados no main,
incluindo os dois formatos:

- `ipcMain.handle/on`;
- `instalarOfflineHandler`.

Resultado:

- canais usados pelo preload: **22**;
- canais registrados no main: **22**;
- preload sem handler: **0**;
- handler sem exposição correspondente no conjunto analisado: **0**.

A fronteira IPC está consistente.

### Rede do renderer

O `pdv.html` possui **2 chamadas fetch** de navegador:

1. sonda de conectividade para
   `https://www.gstatic.com/generate_204`;
2. carregamento de nomenclatura/NCM por URL oficial configurada.

Essas chamadas não possuem privilégio Node/IPC e são tratadas como uma
fronteira de rede do navegador separada da bridge desktop.

### Candidatos objetivos para o 7.4

A análise estruturada registrou três candidatos, nesta ordem:

1. remover SQL bruto do `main.js`;
2. consolidar o read model financeiro hoje dividido entre
   `main.js` e `offline-sale-service.js`;
3. encapsular acesso a `local_config` usado por identidade e manutenção de
   numeração.

O 7.4 deve fazer **extração mínima**, não reescrita ampla.

### Validação

A matriz foi recalculada contra o código:

- `BOUNDARY_CONTRACTS_JSON=OK`;
- `SQLITE_IMPORTERS=1`;
- `RAW_SQL_OUTSIDE_DB_MODULES=5`;
- `RAW_SQL_OUTSIDE_DB_TOTAL=20`;
- `IPC_CHANNELS_MATCHED=22`;
- `UI_REQUIRE_COUNT=0`;
- `UI_IPCRENDERER_COUNT=0`;
- `UI_FETCH_CALLS=2`;
- `NETWORK_IMPORTERS=6`;
- `BOUNDARY_CONTRACTS_VALIDATION=OK`.

Nenhuma lógica de produção foi alterada neste micropasso.

## 7.4/6 — extração mínima de responsabilidades críticas

O foco escolhido foi o candidato de maior impacto do 7.3:

- remover SQL bruto do `main.js`.

A extração foi deliberadamente pequena. Nenhuma camada nova foi criada e o
grafo de `require('./...')` permaneceu com os mesmos 29 nós e 54 arestas.

### APIs adicionadas ao kernel de persistência

`offline-db.js` recebeu duas APIs públicas:

- `getOutboxStatusSummary(empresaId)`;
- `listAuthorizedNfcePendingSync({ empresaId, limit })`.

A primeira encapsula a agregação por status da `sync_outbox`.

A segunda encapsula o read model que combina:

- NFC-e autorizada;
- fiscal outbox confirmada;
- XML processado;
- protocolo/cStat;
- ausência de operação `nfce-auth:<fiscalId>`;
- operação `SALE_PAID` correspondente, quando existente.

### APIs já existentes reaproveitadas

O `main.js` passou a reutilizar:

- `listCashMovements` para o histórico do Financeiro;
- `listActiveProvisionedOfflineCredentials`;
- `listPreparedOfflineCompanies`;
- `enqueueOutboxOperation`.

Assim, o entrypoint continua orquestrando o fluxo, mas não executa SQL nem
conhece nomes de tabelas nesses quatro casos.

### Extrações realizadas

#### Financeiro

Antes:

- `main.js` consultava `cash_movements` diretamente.

Depois:

- usa `listCashMovements({ empresaId, limit: 5000 })`;
- inverte a lista para preservar a ordenação histórica descendente;
- continua montando o mesmo DTO de UI.

#### Resumo da outbox

Antes:

- `main.js` executava `GROUP BY status` diretamente em `sync_outbox`.

Depois:

- usa `getOutboxStatusSummary(empresaId)`.

#### NFC-e autorizada -> sync outbox

Antes:

- `main.js` conhecia `nfce_documents`, `fiscal_outbox` e `sync_outbox`;
- consultava dependência `SALE_PAID`;
- inseria `NFCE_AUTHORIZED` via SQL.

Depois:

- `listAuthorizedNfcePendingSync` fornece o read model persistente;
- `main.js` apenas monta o payload de integração;
- `enqueueOutboxOperation` faz a gravação idempotente.

#### Resolução de empresa do operador

Antes:

- dois pontos do `main.js` executavam JOIN direto entre
  `offline_provisioned_credentials` e `offline_prepared_companies`.

Depois:

- um helper local cruza as APIs públicas
  `listActiveProvisionedOfflineCredentials()` e
  `listPreparedOfflineCompanies()`;
- somente retorna empresa quando existe exatamente uma empresa preparada
  compatível com operador/perfil, preservando a semântica anterior.

### Resultado arquitetural

Métrica antes do 7.4:

- `main.js`: 8 chamadas `.prepare()`;
- SQL bruto fora de `offline-db.js`: 20 chamadas em 5 módulos.

Métrica depois do 7.4:

- `main.js`: **0** chamadas `.prepare()`;
- SQL bruto fora de `offline-db.js`: **12** chamadas em **4 módulos**.

Permanecem como dívida:

- `offline-cash-service.js`: 5;
- `offline-device-auth.js`: 2;
- `offline-fiscal-number-maintenance.js`: 3;
- `offline-sale-service.js`: 2.

A propriedade do SQLite continua exclusiva de `offline-db.js`.

### Teste de integração da extração

Foi criado:

- `tests/integration/architecture-boundary-extraction.test.js`.

Ele confirma:

1. `getOutboxStatusSummary` agrega por empresa e por status;
2. `listAuthorizedNfcePendingSync` entrega o read model esperado;
3. a dependência `SALE_PAID` é preservada;
4. após enfileirar `NFCE_AUTHORIZED`, o documento deixa de aparecer como
   pendente de sync.

Resultado específico:

- testes: 2;
- aprovados: 2;
- falhas: 0.

### Validação

- `ARCHITECTURE_74_VALIDATION=OK`;
- `MAIN_PREPARE_CALLS=0`;
- `RAW_SQL_OUTSIDE_DB_MODULES=4`;
- `RAW_SQL_OUTSIDE_DB_TOTAL=12`;
- `offline-db.js --check`: exit code 0;
- `main.js --check`: exit code 0;
- suíte completa: **133/133**;
- `FULL_EXIT_CODE=0`;
- resíduos `.step74-*`: 0;
- resíduos `efisco-step74-*`: 0.

## 7.5/6 — testes de arquitetura e contratos entre módulos

Foi criado:

- `tests/unit/architecture-contracts.test.js`.

Também foi adicionado ao `package.json`:

- `test:architecture`.

O alvo executa:

- `tests/unit/architecture-*.test.js`;
- `tests/integration/architecture-*.test.js`.

Como `tests/**` e `architecture/**` continuam fora de `build.files`, esses
artefatos não entram no instalador.

### Guardrails executáveis

Foram adicionados 7 testes estáticos permanentes.

#### 1. Inventário arquitetural

Confirma que:

- os 29 arquivos JavaScript de produção existem no mapa;
- cada módulo pertence exatamente a uma camada;
- nenhum módulo está ausente ou duplicado;
- a contagem de módulos exportados continua coerente com o código.

#### 2. Grafo de dependências

Recalcula os `require('./...')` do código e compara com
`module-responsibilities.json`.

Também executa detecção de ciclo por ordenação topológica.

Contrato:

- snapshot de arestas deve ser exato;
- o grafo CommonJS local deve continuar acíclico.

#### 3. Ownership do SQLite

Confirma que:

- somente `offline-db.js` importa `node:sqlite`;
- `main.js` possui zero `.prepare()`.

Isso transforma o resultado do 7.4 em regressão automatizada.

#### 4. Dívida SQL explícita

A lista real de `.prepare()` fora do kernel é comparada com
`boundary-contracts.json`.

Baseline atual permitido:

- `offline-cash-service.js`: 5;
- `offline-device-auth.js`: 2;
- `offline-fiscal-number-maintenance.js`: 3;
- `offline-sale-service.js`: 2.

Total máximo documentado no estado atual:

- 12 chamadas;
- 4 módulos.

Qualquer aumento ou novo módulo quebra o teste até que a arquitetura seja
deliberadamente revisada.

#### 5. Renderer, preload e IPC

Confirma:

- `contextIsolation=true`;
- `nodeIntegration=false`;
- `sandbox=true`;
- renderer sem `require(...)`;
- renderer sem `ipcRenderer`;
- conjunto de canais usado pelo preload exatamente igual ao conjunto
  registrado no main.

#### 6. Fronteiras venda/fiscal/transporte

Confirma:

- venda entra no fiscal por `offline-fiscal-sale-pipeline.js`;
- serviço de venda não importa SVRS/XML/QR diretamente;
- módulos documentais fiscais não importam transporte SVRS/sync;
- outbox geral não importa o transporte HTTP de sync diretamente.

#### 7. Versão dos artefatos

Confirma que:

- `module-responsibilities.json`;
- `dependency-analysis.json`;
- `boundary-contracts.json`;

continuam com a mesma release declarada no `package.json`.

### Bateria arquitetural consolidada

A bateria `test:architecture` contém:

- 7 guardrails estáticos do 7.5;
- 2 testes de integração da extração do 7.4.

Resultado:

- testes: **9**;
- aprovados: **9**;
- falhas: **0**;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

### Regressão completa

Após adicionar os guardrails:

- `architecture-contracts.test.js --check`: exit code 0;
- suíte completa: **140/140**;
- falhas: **0**;
- `FULL_EXIT_CODE=0`;
- resíduos `.step75-*`: 0;
- resíduos `efisco-step75-*`: 0.

Nenhuma lógica de produção foi alterada neste micropasso.

## 7.6/6 — execução completa, limpeza e consolidação da Etapa 7

### Artefatos consolidados

A Etapa 7 passa a ter três artefatos arquiteturais estruturados:

- `architecture/module-responsibilities.json`;
- `architecture/dependency-analysis.json`;
- `architecture/boundary-contracts.json`.

Eles registram, respectivamente:

- módulos, camadas e dependências diretas;
- métricas de acoplamento, alcance e ciclos;
- contratos de fronteira e dívidas explícitas.

Os três arquivos foram validados como JSON e permanecem alinhados à release
`1.0.41`.

### Bateria arquitetural permanente

O alvo:

- `test:architecture`

executa:

- 7 guardrails estáticos;
- 2 testes de integração da extração do 7.4.

Resultado final:

- testes: **9**;
- aprovados: **9**;
- falhas: **0**;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

### Estado arquitetural consolidado

Fotografia final da Etapa 7:

- arquivos JavaScript de produção: **29**;
- módulos exportados: **26**;
- dependências CommonJS locais: **54**;
- componentes cíclicos: **0**;
- grafo local: **acíclico**;
- importadores de `node:sqlite`: **1**;
- proprietário do SQLite: `offline-db.js`;
- `main.js .prepare()`: **0**;
- SQL bruto fora do kernel: **12 chamadas em 4 módulos**;
- canais IPC preload/main: **22/22**;
- renderer com `require`: **0**;
- renderer com `ipcRenderer`: **0**.

A dívida SQL restante está explicitamente protegida pelos testes:

- `offline-cash-service.js`: 5;
- `offline-device-auth.js`: 2;
- `offline-fiscal-number-maintenance.js`: 3;
- `offline-sale-service.js`: 2.

Qualquer crescimento silencioso dessa baseline quebra o guardrail arquitetural.

### Extração de produção consolidada

A única refatoração de produção da Etapa 7 foi deliberadamente mínima:

- SQL bruto removido do `main.js`;
- `offline-db.js` recebeu
  `getOutboxStatusSummary` e
  `listAuthorizedNfcePendingSync`;
- APIs de persistência já existentes foram reutilizadas para movimentos de
  caixa, credenciais preparadas e enqueue da sync outbox.

Resultado:

- `main.js .prepare()`: **8 -> 0**;
- SQL bruto fora de `offline-db.js`: **20 -> 12**;
- módulos com SQL bruto fora do kernel: **5 -> 4**.

O grafo de módulos permaneceu com 29 nós e 54 arestas.

### Validação de sintaxe

Todos os **29 arquivos JavaScript de produção** foram executados com
`--check`.

Resultado:

- arquivos verificados: **29**;
- falhas de sintaxe: **0**.

### Self-tests

Foram executados novamente:

- `phase1-selftest.js`: **OK**;
- `phase2-db-selftest.js`: **OK**.

Ambos terminaram com exit code 0.

### Suíte completa

Resultado final da Etapa 7:

- testes: **140**;
- aprovados: **140**;
- falhas: **0**;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- `FULL_EXIT_CODE=0`.

### Limpeza

Não ficaram resíduos temporários de nenhum micropasso da Etapa 7:

- `.step71-*` até `.step76-*`: **0**;
- `efisco-step71-*` até `efisco-step76-*`: **0**.

Backups não vazios produzidos pelas edições seguras foram preservados.

### Estado da Etapa 7

- [x] 7.1 — mapa arquitetural e responsabilidades dos módulos
- [x] 7.2 — acoplamentos, dependências e ciclos
- [x] 7.3 — fronteiras entre DB, serviços, fiscal, sync e UI
- [x] 7.4 — extração mínima de responsabilidades críticas
- [x] 7.5 — testes de arquitetura e contratos entre módulos
- [x] 7.6 — execução completa, limpeza e consolidação da Etapa 7

**Etapa 7 — arquitetura: CONCLUÍDA.**




## Etapa 1.1/5 — mapa de origens e navegação confiáveis



Levantamento concluído sobre o runtime Electron atual. Esta seção descreve fronteiras de navegação; endpoints de rede e origens de recursos não entram automaticamente na allowlist de documentos confiáveis.



| Classe | Valor observado | Uso legítimo | Política para os próximos passos |

| --- | --- | --- | --- |

| Documento online principal | `https://jpiresoficial.wixstudio.com/e-fisco` | UI online carregada pela `BrowserWindow` | Confiar somente em HTTPS e no origin `https://jpiresoficial.wixstudio.com`; a política de paths será aplicada na navegação. |

| Documento offline local | `http://127.0.0.1:<porta-dinâmica>` | `offline-shell.html` e `pdv.html` servidos por `offline-ui-server.js` | Confiar somente no origin exato retornado por `startOfflineUiServer()`, incluindo a porta dinâmica. |

| Página interna de atualização | `data:text/html;charset=UTF-8,...` | Telas geradas por `paginaAtualizacaoObrigatoria()` e `paginaAtualizando()` | Não liberar `data:` genericamente. Tratar apenas essas navegações internas iniciadas pelo processo principal. |

| Ação interna de atualização | `efisco-update://start` | Sinal exato do botão ATUALIZAR | Tratar como comando de navegação interno exato; não é uma origem de renderer confiável. |

| Recurso remoto da UI offline | `https://static.wixstatic.com` | Imagens referenciadas por `offline-ui/pdv.html` | Origem de recurso apenas; não autorizar como documento principal nem como origem IPC. |

| Backend de sincronização | `https://api.e-fisco.app` | Chamadas de backend a partir do processo privilegiado | Endpoint de rede apenas; não autorizar como documento principal nem como origem IPC. |



### Decisões do mapa



- `localhost` **não** é origem de UI offline de produção: o servidor local usa explicitamente `127.0.0.1` e `server.listen(0, '127.0.0.1')`. Referências a `localhost` em validações antigas não devem ampliar a confiança do renderer.

- A origem offline deve ser comparada pelo `origin` completo gerado em runtime, e não por prefixo de string.

- A origem online confiável é `https://jpiresoficial.wixstudio.com`; domínios Wix/CDN usados como recursos não recebem confiança de navegação ou IPC por associação.

- URLs `data:` e o esquema `efisco-update:` são fluxos internos especiais e não devem ser convertidos em allowlists genéricas.

- O mapa acima será a fonte de verdade para os validadores centralizados da Etapa 1.



### Passo 1.2/5 — parser seguro de URL



Concluído em `main.js` com a função `parseUrlSegura(rawUrl)`.



Contrato definido:

- normaliza entrada para string e remove espaços externos;

- rejeita valor vazio retornando `null`;

- usa `new URL(value)` sem base, portanto exige URL absoluta;

- captura erro de parsing e retorna `null` em vez de propagar exceção;

- retorna uma instância `URL` válida quando o parsing é aceito;

- ainda não altera nenhuma decisão de autorização/navegação; a adoção pelos validadores ocorrerá nos passos seguintes.



### Passo 1.3/5 — validadores específicos de confiança



Concluído em `main.js` com três validadores centralizados, ainda sem substituir os pontos antigos de uso:



- `isOnlineOriginAllowed(rawUrl)`: exige URL absoluta válida, protocolo `https:`, ausência de credenciais embutidas e `origin` exatamente igual a `https://jpiresoficial.wixstudio.com`.

- `isOfflineOriginAllowed(rawUrl)`: exige URL absoluta válida, protocolo `http:`, hostname exatamente `127.0.0.1`, ausência de credenciais e `origin` exatamente igual ao `offlineUiServer.origin` criado em runtime, incluindo a porta dinâmica.

- `isInternalNavigationAllowed(rawUrl)`: aceita somente o comando exato `efisco-update://start` após remoção de espaços externos.



Também foi criado `ORIGIN_E_FISCO` a partir de `URL_E_FISCO` usando `parseUrlSegura()`, evitando duplicar comparação textual de hostname.



Decisões de segurança preservadas:

- `localhost` não é aceito pelo validador offline de produção;

- subdomínios/sufixos semelhantes não passam por comparação de `origin`;

- usuário/senha embutidos na URL são recusados;

- `data:` não foi incluído em allowlist genérica;

- os `startsWith(...)` antigos e o `will-navigate` ainda não foram trocados neste passo; a integração ocorrerá no Passo 1.4/5.



### Passo 1.4/5 — adoção dos validadores centralizados



Concluído em `main.js` com substituição dos pontos ativos de comparação frágil:



- a detecção de UI offline usada pela ponte ONLINE do contador NFC-e deixou de usar `startsWith('http://127.0.0.1')` / `startsWith('http://localhost')` e passou a usar `isOfflineOriginAllowed(origem)`;

- o tratamento do comando de atualização em `will-navigate` deixou de comparar a string diretamente e passou a usar `isInternalNavigationAllowed(url)`;

- o filtro de `did-fail-load` deixou de usar `startsWith('http://127.0.0.1:')` e passou a usar `isOfflineOriginAllowed(validatedURL)`.



Verificação estática após a alteração:

- não restam em `main.js` validações de origem com `startsWith('http://127.0.0.1...')`;

- não restam em `main.js` validações de origem com `startsWith('http://localhost...')`;

- o comando `efisco-update://start` fica centralizado em `INTERNAL_UPDATE_NAVIGATION_URL` e `isInternalNavigationAllowed()`.



Este passo não adiciona ainda bloqueio geral de navegação nem `setWindowOpenHandler`; isso pertence às etapas de navegação seguintes. O Passo 1.5/5 ficará responsável pelos testes de casos válidos e adversariais da camada de validação.



### Passo 1.5/5 — validação final da camada de origem



Concluído com self-test real em Electron 43.4.1 / Node 24.18.1: **31/31 casos aprovados**. Foram cobertos casos válidos e adversariais para parser, origem online, origem offline e comando interno.



**Etapa 1 — centralização da validação de URL/origem: CONCLUÍDA.**



Estado ao final da Etapa 1:

- parsing centralizado em `parseUrlSegura()`;

- origem online validada por `origin` exato e HTTPS;

- origem offline validada pelo `offlineUiServer.origin` exato, incluindo porta dinâmica;

- `localhost` não recebe confiança de UI offline em produção;

- comando interno de atualização centralizado e exato;

- comparações frágeis por prefixo removidas dos pontos ativos identificados;

- testes adversariais da camada de validação aprovados.



### Passo 2.1/5 — política da BrowserWindow



A política de navegação da janela principal foi formalizada em `MAIN_WINDOW_NAVIGATION_POLICY` e `classifyMainWindowNavigation(rawUrl)`, ainda sem conectar a classificação ao evento `will-navigate`.



Decisões:

- `ALLOW`: qualquer URL HTTPS cujo `origin` seja exatamente `https://jpiresoficial.wixstudio.com`. Paths, query e hash no mesmo origin permanecem permitidos para preservar a navegação interna do Wix.

- `INTERCEPT`: somente `efisco-update://start`; esse destino representa um comando interno e não deve ser carregado como documento.

- `BLOCK / OFFLINE_VIEW_ONLY`: o origin local `http://127.0.0.1:<porta-runtime>` pertence exclusivamente à `WebContentsView` offline e não deve substituir o documento da `BrowserWindow`.

- `BLOCK / MAIN_PROCESS_DATA_ONLY`: URLs `data:` não são aceitas quando originadas pelo renderer. As telas de atualização em `data:text/html` continuam reservadas a chamadas `mainWindow.loadURL(...)` iniciadas pelo processo principal.

- `BLOCK`: `file:`, HTTP para a origem online, origens externas, esquemas desconhecidos, URLs inválidas, `javascript:` e `about:`.



A UI offline não foi adicionada à allowlist da janela principal porque o runtime atual a carrega separadamente em `offlineView.webContents`.



Self-test da política: **16 casos aprovados, 0 falhas**, executados com Electron 43.4.1 / Node 24.18.1 em modo Node, sem iniciar a interface do aplicativo.



O Passo 2.2/5 aplicará essa classificação ao `will-navigate`.



### Passo 2.2/5 — política aplicada ao will-navigate



O evento `mainWindow.webContents.on('will-navigate', ...)` passou a usar `classifyMainWindowNavigation(url)`.



Comportamento efetivo:

- `ALLOW`: retorna sem chamar `event.preventDefault()`, preservando navegação no mesmo origin online confiável;

- `INTERCEPT`: chama `event.preventDefault()` e mantém o fluxo existente de `iniciarAtualizacaoObrigatoria()` para `efisco-update://start`;

- `BLOCK`: chama `event.preventDefault()` e não executa navegação nem ação adicional.



Não foram adicionados logs de bloqueio neste passo; observabilidade detalhada permanece para o Passo 2.4/5.



Self-test do callback real registrado em `will-navigate`: **9 casos aprovados, 0 falhas**. Foram exercitados ALLOW, INTERCEPT e BLOCK, incluindo domínio externo, domínio semelhante, HTTP, `file:`, `javascript:` e URL inválida.



### Passo 2.3/5 — redirects e navegações indiretas



Foi adicionada proteção de redirect no `mainWindow.webContents` usando o evento cancelável `will-redirect`.



Regras aplicadas:

- redirects do main frame para o mesmo origin HTTPS confiável permanecem permitidos;

- redirects do main frame para origem externa, domínio semelhante, HTTP, `data:`, `file:` ou outro destino não confiável são cancelados com `event.preventDefault()`;

- `efisco-update://start` não é aceito como destino de redirect e não aciona o updater por redirect; o comando interno continua reservado ao fluxo explícito de navegação tratado em `will-navigate`;

- redirects de subframes não são bloqueados por esta política, preservando conteúdo embutido legítimo do Wix;

- `will-navigate` passou a resolver primeiro `event.url` (API moderna) e manter fallback para o argumento legado `url`;

- `will-redirect` também suporta tanto `event.url/event.isMainFrame` quanto os argumentos legados, mantendo compatibilidade com a versão atual do Electron.



Foram adicionadas as funções auxiliares `resolveNavigationEventUrl()` e `resolveNavigationEventIsMainFrame()` para normalizar os formatos moderno e legado dos eventos de navegação.



Self-test: **11 casos aprovados, 0 falhas**. O teste cobriu redirects main-frame permitidos/bloqueados, subframes preservados, API moderna, fallback legado e tentativa de redirect para o comando interno.



### Passo 2.4/5 — observabilidade segura de bloqueios



Foi adicionada observabilidade para navegações recusadas da `BrowserWindow`, sem registrar URLs brutas.



Implementação:

- `sanitizeNavigationUrlForLog(rawUrl)` sanitiza o destino antes do log;

- HTTP/HTTPS registram apenas protocolo, host/porta e um marcador de path, removendo credenciais, path real, query e hash;

- `data:`, `javascript:` e `file:` têm seu conteúdo/caminho totalmente redigido;

- URL inválida vira `<invalid-url>` sem reproduzir a entrada;

- `efisco-update://start` pode ser registrado integralmente por ser um comando interno fixo sem dados variáveis;

- `logBlockedMainWindowNavigation()` registra `eventType`, `decision`, `reason`, `mainFrame` e `target` sanitizado.



Os logs são emitidos apenas quando `will-navigate` ou `will-redirect` chamam `event.preventDefault()`. Navegações `ALLOW` e redirects de subframe preservados não geram esse log.



Self-test: **15 casos aprovados, 0 falhas**, incluindo testes explícitos contra vazamento de senha, token, query, hash, conteúdo `data:`, código `javascript:` e caminho local `file:`.



### Passo 2.5/5 — regressão final e fechamento da Etapa 2



Foi criado o teste permanente `tests/unit/electron-navigation-security.test.js`, integrado automaticamente ao padrão existente `tests/unit/**/*.test.js`.



Cobertura permanente adicionada:

- allowlist same-origin HTTPS da `BrowserWindow`;

- rejeição de HTTP, porta inesperada, credenciais embutidas, domínio semelhante, origem externa, `about:`, `javascript:`, `file:`, `data:` e URL inválida;

- exclusividade da origem offline para a `WebContentsView`;

- comportamento de `will-navigate` para ALLOW/BLOCK/INTERCEPT;

- comando exato `efisco-update://start` e rejeição de variações;

- precedência de `event.url` moderno sobre argumento legado;

- proteção de `will-redirect` no main frame e preservação de subframes;

- impossibilidade de redirect acionar o updater;

- sanitização de logs contra credenciais, paths, query, hash e payloads de esquemas sensíveis;

- regressão estática contra retorno de validações loopback por `startsWith(...)`.



Validação executada em Electron 43.4.1 / Node 24.18.1:

- teste permanente de navegação: **9/9 testes aprovados**;

- `main.js --check`: **aprovado**;

- suíte unitária completa: **109/109 testes aprovados, 0 falhas**.



Como o checkout atual não contém `node_modules`, a primeira execução integral encontrou a dependência `@xmldom/xmldom` ausente. A suíte foi repetida usando, via `NODE_PATH`, as dependências já empacotadas em `resources/app.asar/node_modules` da instalação local correspondente; nessa execução integral todos os 109 testes passaram.



**Etapa 2 — proteção da navegação da BrowserWindow: CONCLUÍDA.**



Estado final da Etapa 2:

- política explícita de navegação da janela principal;

- `will-navigate` com bloqueio deny-by-default;

- redirects main-frame protegidos por `will-redirect`;

- subframes preservados para compatibilidade com o Wix;

- bloqueios observáveis com logging sanitizado;

- regressão automatizada permanente na suíte unitária.



### Passo 3.1/5 — política de novas janelas



Foi definida em `main.js` uma política explícita para criação de novas janelas pelo renderer:



- `RENDERER_WINDOW_OPEN_POLICY.defaultAction = 'deny'`;

- popups da `mainWindow`: não permitidos;

- popups da `offlineView`: não permitidos;

- abertura externa via `shell.openExternal`: não habilitada;

- `efisco-update://start` não pode ser usado como alvo de popup.



O levantamento do projeto não encontrou uso legítimo de `window.open`, `target="_blank"`, `shell.openExternal`, `did-create-window`, `new-window`, `nativeWindowOpen` ou `allowpopups`. Por isso, a política adotada é deny-by-default sem exceções funcionais.



Foi adicionada a função pura `classifyRendererWindowOpen({ source, url })`, que sempre retorna `action: 'deny'` e diferencia os motivos para diagnóstico:

- `EMPTY_WINDOW_TARGET`;

- `INTERNAL_COMMAND_POPUP_DENIED`;

- `ONLINE_POPUP_DENIED`;

- `OFFLINE_POPUP_DENIED`;

- `INVALID_WINDOW_TARGET`;

- `UNTRUSTED_WINDOW_TARGET`.



A origem do pedido é normalizada para `mainWindow`, `offlineView` ou `unknown`. A função reutiliza os validadores estruturais já criados nas Etapas 1 e 2.



Self-test da política: **18 casos aprovados, 0 falhas**. `main.js --check`: **aprovado**.



Importante: neste Passo 3.1/5 o `setWindowOpenHandler` ainda não foi instalado. A aplicação efetiva dessa política na `BrowserWindow` será feita no Passo 3.2/5.



### Passo 3.2/5 — setWindowOpenHandler na BrowserWindow



A política deny-by-default definida no Passo 3.1/5 foi aplicada à janela principal com `mainWindow.webContents.setWindowOpenHandler(...)` imediatamente após a criação da `BrowserWindow` e antes de `maximize()` / carregamentos subsequentes.



Comportamento efetivo:

- qualquer pedido de nova janela originado da `mainWindow` retorna `{ action: 'deny' }`;

- a classificação usa `classifyRendererWindowOpen({ source: 'mainWindow', url })` para preservar motivo e contexto;

- não existe fallback para `shell.openExternal` nem exceção same-origin;

- `efisco-update://start` permanece proibido como popup;

- tentativas bloqueadas são registradas por `logBlockedRendererWindowOpen()` com destino sanitizado por `sanitizeNavigationUrlForLog()`.



Foi adicionado `logBlockedRendererWindowOpen({ source, windowOpen })`, que registra somente source, action, reason e target sanitizado. Query, hash, credenciais, conteúdo `data:`/`javascript:` e caminhos `file:` continuam redigidos.



Self-test do callback real do `setWindowOpenHandler`: **25 verificações aprovadas, 0 falhas**. Foram cobertos same-origin, origem externa, `data:`, comando interno, URL inválida, sanitização de segredos e ordem de instalação do handler antes de `maximize()` e do próximo `loadURL`.



Verificação sintática: `main.js --check` aprovado.



A `offlineView` ainda não recebe esse handler neste passo; sua navegação será protegida no Passo 3.3/5 e seus popups no Passo 3.4/5.



### Passo 3.3/5 — proteção de navegação da offlineView



Foi adicionada uma política específica para a `WebContentsView` offline em `OFFLINE_VIEW_NAVIGATION_POLICY` e `classifyOfflineViewNavigation(rawUrl)`.



Regra principal:

- somente URLs cujo `origin` seja exatamente o `offlineUiServer.origin` atual (`http://127.0.0.1:<porta-runtime>`) recebem `ALLOW`;

- `localhost`, outra porta, origem online do e-Fisco, `efisco-update://start`, `data:`, `file:`, URLs inválidas e demais destinos recebem `BLOCK`.



Foram instalados em `offlineView.webContents`, antes de `offlineView.webContents.loadURL(...)`:

- `will-navigate` para bloquear navegação do documento principal para fora do origin runtime confiável;

- `will-redirect` para cancelar redirects do main frame que saiam do origin offline permitido.



Subframes são preservados quando identificados como não-main-frame, mantendo compatibilidade com o iframe do PDV. A autorização IPC de frames será endurecida separadamente em etapa posterior.



Bloqueios são registrados por `logBlockedOfflineViewNavigation()`, usando o mesmo sanitizador de URL das proteções anteriores. Isso impede gravação de query, hash, paths sensíveis, payloads `data:` e caminhos `file:`.



Self-test dos handlers reais: **17 verificações aprovadas, 0 falhas**. Cobertura incluiu origin exato, paths/query/hash no mesmo origin, porta diferente, `localhost`, origem online, comando interno, `data:`, `file:`, origem externa, `event.url` moderno, redirects e preservação de subframes.



Verificações adicionais:

- `main.js --check`: aprovado;

- teste permanente de navegação da Etapa 2: **9/9 aprovado**, confirmando ausência de regressão na `BrowserWindow`.



### Passo 3.4/5 — setWindowOpenHandler na offlineView



A política deny-by-default de novas janelas foi aplicada também à `offlineView` com `offlineView.webContents.setWindowOpenHandler(...)` dentro de `ensureOfflineView()`, antes de `will-navigate`, `will-redirect` e do `offlineView.webContents.loadURL(...)`.



Comportamento efetivo:

- qualquer tentativa de popup originada da `offlineView` retorna `{ action: 'deny' }`;

- inclusive URLs no próprio `offlineUiServer.origin` são negadas como nova janela;

- origem online, origem externa, `localhost`, porta offline diferente, `data:`, URL inválida e `efisco-update://start` também são negados;

- não existe fallback para abertura externa;

- a classificação reutiliza `classifyRendererWindowOpen({ source: 'offlineView', url })`.



As tentativas são registradas por `logBlockedRendererWindowOpen()` com `source: 'offlineView'`. O destino passa por `sanitizeNavigationUrlForLog()`, mantendo query, hash, paths sensíveis e payloads potencialmente perigosos fora do log.



Self-test do callback real da `offlineView`: **37 verificações aprovadas, 0 falhas**. Foram cobertos same-origin offline, origem online, origem externa, `data:`, comando interno, URL inválida, porta incorreta, `localhost`, sanitização de segredos e ordem de instalação antes de `will-navigate` e `loadURL`.



Verificações adicionais:

- `main.js --check`: aprovado;

- existem exatamente dois usos ativos de `setWindowOpenHandler`: um na `offlineView` e um na `mainWindow`;

- teste permanente de navegação da Etapa 2: **9/9 aprovado**, sem regressão na proteção da `BrowserWindow`.



### Passo 3.5/5 — regressão final e fechamento da Etapa 3



Foi criado o teste permanente `tests/unit/electron-webcontents-security.test.js`, complementar ao teste de navegação da Etapa 2.



Cobertura permanente adicionada:

- política de popup deny-by-default nas duas superfícies (`mainWindow` e `offlineView`);

- `setWindowOpenHandler` efetivo da `mainWindow`;

- `setWindowOpenHandler` efetivo da `offlineView`;

- bloqueio de popup same-origin, externo, comando interno e esquemas não confiáveis;

- `offlineView` limitada ao `offlineUiServer.origin` exato no main frame;

- bloqueio de porta diferente, `localhost`, origem online, origem externa, `data:`, `file:`, comando interno e URL inválida;

- precedência de `event.url` moderno;

- `will-redirect` da `offlineView` com proteção do main frame e preservação de subframes;

- sanitização dos logs de navegação e popup;

- ordem de instalação dos handlers da `offlineView` antes do `loadURL`;

- regressão estática garantindo exatamente dois `setWindowOpenHandler` ativos, um por superfície.



Validação executada com Electron 43.4.1 / Node 24.18.1:

- teste permanente da Etapa 3: **9/9 testes aprovados**;

- `main.js --check`: **aprovado**;

- suíte unitária completa: **118/118 testes aprovados, 0 falhas**.



A suíte integral foi executada com `NODE_PATH` apontando para `resources/app.asar/node_modules` da instalação local, porque o checkout permanece sem `node_modules` próprio.



**Etapa 3 — proteção de novas janelas e da WebContentsView offline: CONCLUÍDA.**



Estado final da Etapa 3:

- popups da `mainWindow` bloqueados por padrão;

- popups da `offlineView` bloqueados por padrão;

- nenhuma abertura externa automática habilitada;

- navegação principal da `offlineView` confinada ao origin loopback runtime exato;

- redirects main-frame da `offlineView` confinados ao mesmo origin;

- subframes preservados para compatibilidade funcional;

- bloqueios registrados com URL sanitizada;

- regressão automatizada permanente para ambas as superfícies Electron.



### Passo 4.1/5 — mapa de canais IPC e níveis de confiança



Foi criado em `main.js` o contrato declarativo `IPC_CHANNEL_AUTHORIZATION_POLICY`, acompanhado de `IPC_SENDER_SCOPE`.



O inventário confirmou **22 canais IPC registrados no processo principal e os mesmos 22 expostos pelo preload**, sem canal órfão em nenhum dos lados.



A política adota dois escopos de remetente:

- `MAIN_WINDOW_TOP`: frame principal da `mainWindow`, com origin online exato;

- `OFFLINE_VIEW_TOP`: frame principal da `offlineView`, com origin runtime offline exato.



Não existe canal classificado para aceitar ambas as superfícies no desenho atual.



#### MAIN_WINDOW_TOP / ONLINE_EXACT — 4 canais

- `efisco:offline-operator-bridge-probe` — send — bridge de credencial offline;

- `efisco:offline-operator-verifier-candidate` — send — bridge de credencial offline;

- `efisco:offline-credential-provision` — invoke — provisionamento de credencial offline;

- `efisco:print-nfce-windows-driver` — invoke — impressão originada pela ponte top online.



A impressão IPC foi classificada como `MAIN_WINDOW_TOP` porque o fluxo online atual instala a ponte de impressão no topo da `mainWindow`. O PDV offline atual imprime pelo canal direto de frame/console em `instalarCanalDiretoDoFrame(offlineView.webContents)`, não por esse IPC.



#### OFFLINE_VIEW_TOP / OFFLINE_RUNTIME_EXACT — 18 canais

- `efisco:offline-operator-login` — login offline;

- `efisco:offline-product-find` — leitura offline;

- `efisco:offline-company-header` — leitura offline;

- `efisco:offline-products-list` — leitura offline;

- `efisco:offline-customers-list` — leitura offline;

- `efisco:offline-crediarios-list` — leitura offline;

- `efisco:offline-crediario-detail` — leitura offline;

- `efisco:offline-crediario-open` — mutação offline;

- `efisco:offline-crediario-items-update` — mutação offline;

- `efisco:offline-cash-consult` — leitura offline;

- `efisco:offline-finance-snapshot` — leitura offline;

- `efisco:offline-cash-open` — mutação offline;

- `efisco:offline-cash-movement` — mutação offline;

- `efisco:offline-cash-close` — mutação offline;

- `efisco:nfce-number-peek` — operação fiscal sensível;

- `efisco:offline-sale-paid` — mutação offline;

- `efisco:offline-nfce-contingency-danfe-preview` — operação fiscal sensível;

- `efisco:superadmin-a1-mirror` — operação sensível vinculada à identidade do dispositivo.



Cada entrada registra também o transporte (`send` ou `invoke`) e a capacidade funcional, para permitir testes de contrato posteriores.



#### Lacuna atual explicitamente mantida para os próximos passos

Neste Passo 4.1/5 a política **não foi ligada aos handlers**. O comportamento de autorização continua inalterado:

- `isAuthorizedAppSender(event)` ainda valida apenas o `event.sender.id` contra `mainWindow.webContents.id` ou `offlineView.webContents.id`;

- `isOfflineViewSender(event)` ainda valida apenas o ID da `offlineView`;

- ainda não há validação de `senderFrame`, URL/origin do frame ou política específica por canal.



O Passo 4.2/5 usará esta matriz para endurecer a identidade do remetente; o Passo 4.3/5 aplicará a autorização específica de cada canal.



Self-test da matriz: **83 verificações aprovadas, 0 falhas**. `main.js --check`: aprovado. Regressão Electron das Etapas 2 e 3: **18/18 testes aprovados**.



### Passo 4.2/5 — endurecimento da identidade do remetente IPC



A validação de remetente IPC deixou de confiar somente em `event.sender.id`.



Foi adicionado `resolveAuthorizedIpcSender(event)`, que exige simultaneamente:

- `event.sender` presente;

- `event.senderFrame` presente e não destruído;

- o próprio objeto `event.sender` ser o `WebContents` esperado da superfície;

- ID do sender coincidir com o `WebContents.id` esperado;

- `event.senderFrame` ser exatamente o `webContents.mainFrame` da superfície, rejeitando subframes mesmo quando same-origin;

- URL atual do frame estruturalmente válida para a superfície;

- `senderFrame.origin` coincidir exatamente com o origin esperado.



Para `mainWindow`, o resolvedor exige:

- superfície `MAIN_WINDOW_TOP`;

- URL aceita por `isOnlineOriginAllowed(...)`;

- `senderFrame.origin === ORIGIN_E_FISCO`.



Para `offlineView`, o resolvedor exige:

- superfície `OFFLINE_VIEW_TOP`;

- URL aceita por `isOfflineOriginAllowed(...)`;

- `senderFrame.origin` igual ao `offlineUiServer.origin` runtime exato.



A validação usa URL e origin ao mesmo tempo. Isso evita aceitar um frame como `about:blank` apenas porque ele herdou o origin do pai.



Também foram ajustados:

- `isAuthorizedAppSender(event)`: agora aceita somente uma das duas superfícies após passar por todas as verificações acima;

- `isOfflineViewSender(event)`: agora exige explicitamente a superfície `OFFLINE_VIEW_TOP` resolvida;

- novo `isMainWindowSender(event)`: prepara o Passo 4.3 para aplicar a matriz por canal.



O comportamento é fail-closed quando `senderFrame` estiver ausente, já tiver navegado/sido destruído, ou não puder ser associado ao main frame esperado.



Neste Passo 4.2/5 ainda não foi aplicada a política por canal de `IPC_CHANNEL_AUTHORIZATION_POLICY`. Assim, `isAuthorizedAppSender` continua conceitualmente aceitando uma `mainWindow` válida ou uma `offlineView` válida; a restrição específica por canal será feita no Passo 4.3/5.



Self-test do resolvedor: **19/19 casos aprovados, 0 falhas**. Casos adversariais incluíram subframe same-origin, `about:blank` com origin herdado, URL/origin divergentes, URL com credenciais, porta offline diferente, `localhost`, objeto sender diferente com ID copiado, frame ausente/destruído e superfície destruída.



Verificações adicionais:

- `main.js --check`: aprovado;

- suíte unitária completa: **118/118 testes aprovados, 0 falhas**.



### Passo 4.3/5 — autorização IPC específica por canal



A matriz `IPC_CHANNEL_AUTHORIZATION_POLICY` definida no Passo 4.1/5 foi ligada efetivamente aos 22 canais IPC.



Foi adicionada `isIpcChannelAuthorized(event, channel, transport)`, com comportamento fail-closed. A função exige:

- canal existente em `IPC_CHANNEL_AUTHORIZATION_POLICY`;

- transporte informado e idêntico ao declarado na política (`send` ou `invoke`);

- remetente aprovado por `resolveAuthorizedIpcSender(event)`;

- superfície resolvida idêntica ao `senderScope` do canal;

- origin compatível com o `originScope` do canal;

- para `ONLINE_EXACT`, `MAIN_WINDOW_TOP`, `ORIGIN_E_FISCO` e URL aceita por `isOnlineOriginAllowed(...)`;

- para `OFFLINE_RUNTIME_EXACT`, `OFFLINE_VIEW_TOP`, origin runtime exato e URL aceita por `isOfflineOriginAllowed(...)`.



Aplicação nos handlers:

- os 13 canais registrados diretamente com `ipcMain.on(...)` / `ipcMain.handle(...)` chamam `isIpcChannelAuthorized` com o nome literal do próprio canal e transporte esperado;

- os 9 canais registrados por `instalarOfflineHandler(...)` passam o `channel` recebido ao autorizador e exigem `invoke`;

- nenhum handler dentro de `instalarIpc()` depende mais de `isAuthorizedAppSender(event)` ou `isOfflineViewSender(event)`.



Consequência prática:

- os 4 canais `MAIN_WINDOW_TOP / ONLINE_EXACT` não podem mais ser chamados pela `offlineView`;

- os 18 canais `OFFLINE_VIEW_TOP / OFFLINE_RUNTIME_EXACT` não podem mais ser chamados pela `mainWindow`;

- transporte incorreto, canal ausente da matriz, frame/origin inválido ou superfície oposta falham antes da lógica de negócio.



O autorizador genérico e os helpers de superfície foram mantidos como primitivas internas/compatibilidade de arquitetura, mas não são mais usados pelos handlers IPC ativos de `instalarIpc()`.



Self-test da aplicação da matriz: **116 verificações aprovadas, 0 falhas**. O teste validou os 22 canais com superfície correta, superfície oposta e transporte incorreto, além da ligação estática dos 13 handlers diretos e do wrapper de 9 canais.



Verificações adicionais:

- exatamente **14 pontos de autorização específica** em `instalarIpc()` (13 handlers diretos + 1 wrapper compartilhado);

- nenhum uso de `isAuthorizedAppSender(event)` ou `isOfflineViewSender(event)` dentro de `instalarIpc()`;

- `main.js --check`: aprovado;

- suíte unitária completa: **118/118 testes aprovados, 0 falhas**.



### Passo 4.4/5 — proteção contra escapes de frame e navegação IPC



O resolvedor de remetente IPC foi endurecido além de URL/origin/superfície.



Novas exigências em `resolveAuthorizedIpcSender(event)`:

- `senderFrame.detached !== true`;

- o frame precisa ser top-level de forma consistente: `senderFrame.top === senderFrame` e `senderFrame.parent === null`;

- `event.processId` deve existir e coincidir com `senderFrame.processId`;

- `event.frameId` deve existir e coincidir com `senderFrame.routingId`.



Essas verificações complementam as travas já existentes de identidade do objeto `sender`, igualdade com `webContents.mainFrame`, URL aceita e origin exato.



A revalidação acontece em cada chamada IPC. Portanto, se o mesmo `WebContents` navegar programaticamente para outro documento/origin, o acesso IPC é revogado pela URL/origin atual do `senderFrame`, mesmo que a navegação não tenha passado pelos eventos de navegação usados nas Etapas 2 e 3.



Também foi validado explicitamente que:

- subframes same-origin não conseguem herdar IPC privilegiado;

- frames destruídos ou detached falham fechado;

- inconsistência de topologia `top/parent` falha fechado;

- divergência ou ausência de `processId/frameId` falha fechado;

- `about:blank` com origin herdado não recebe IPC;

- páginas internas `data:` de atualização não recebem as capacidades IPC online;

- navegação da `offlineView` para origin externo revoga IPC;

- troca da porta runtime do servidor offline revoga imediatamente o frame ligado à porta antiga;

- objeto `sender` ou `senderFrame` copiado com IDs iguais não substitui a identidade real dos objetos Electron.



Self-test de escapes: **26/26 verificações aprovadas, 0 falhas**.



Após o endurecimento foi repetida a matriz completa dos 22 canais: **66/66 combinações aprovadas** (superfície correta, superfície oposta e transporte incorreto).



Verificações adicionais:

- `main.js --check`: aprovado;

- suíte unitária completa permaneceu verde: **118/118 testes aprovados, 0 falhas**.



O Passo 4.5/5 adicionará estes cenários como regressão permanente na suíte do projeto e encerrará formalmente a Etapa 4.



### Passo 4.5/5 — regressão permanente e fechamento da Etapa 4



Foi criado o teste permanente `tests/unit/electron-ipc-security.test.js`, dedicado à autorização IPC e aos casos de escape de frame/origin.



Cobertura permanente adicionada:

- a política cobre exatamente os 22 canais registrados no `main.js` e expostos pelo `preload.js`;

- divisão estável de 4 canais `MAIN_WINDOW_TOP / ONLINE_EXACT` e 18 canais `OFFLINE_VIEW_TOP / OFFLINE_RUNTIME_EXACT`;

- todos os 22 canais aceitam somente a superfície e o transporte declarados;

- canal desconhecido e transporte ausente falham fechado;

- identidade do objeto `event.sender` e do `senderFrame` é exigida, não apenas IDs equivalentes;

- `event.processId`/`event.frameId` devem coincidir com `senderFrame.processId`/`senderFrame.routingId`;

- subframes same-origin não herdam IPC privilegiado;

- frames `detached`, destruídos ou com topologia `top/parent` inconsistente são rejeitados;

- navegação da `mainWindow` para origem externa, `about:blank` ou `data:` revoga IPC;

- saída da `offlineView` do origin runtime e mudança de porta do `offlineUiServer` revogam IPC;

- `instalarIpc()` permanece ligado exclusivamente a `isIpcChannelAuthorized(...)`, com 14 pontos de autorização específica (13 diretos + 1 wrapper).



Resultados finais da Etapa 4:

- novo teste permanente IPC: **10/10 testes aprovados**;

- `main.js --check`: **aprovado**;

- suíte unitária completa: **128/128 testes aprovados, 0 falhas**.



A suíte integral foi executada com `NODE_PATH` apontando para `resources/app.asar/node_modules` da instalação local, pois o checkout continua sem `node_modules` próprio.



**Etapa 4 — fortalecimento da autorização IPC: CONCLUÍDA.**



Estado final da Etapa 4:

- inventário explícito dos 22 canais;

- política de confiança por canal;

- validação de superfície, frame, URL, origin, processo, frame routing ID e transporte;

- isolamento entre `mainWindow` e `offlineView`;

- subframes e documentos transitórios sem capacidades IPC privilegiadas;

- revogação automática após navegação para documento/origin não confiável;

- regressão automatizada permanente para spoofing, cross-surface e mudança de contexto.



### Passo 5.1/5 — consolidação da suíte de segurança Electron



A regressão de segurança construída nas Etapas 1–4 foi consolidada em uma suíte explícita e autocontrolada.



Foi adicionado ao `package.json` o comando:

- `test:electron-security`, que executa em conjunto:

  - `tests/unit/electron-navigation-security.test.js`;

  - `tests/unit/electron-webcontents-security.test.js`;

  - `tests/unit/electron-ipc-security.test.js`;

  - `tests/unit/electron-security-suite-contract.test.js`.



Também foi criado `tests/unit/electron-security-suite-contract.test.js`, que funciona como contrato da própria suíte. Ele garante permanentemente:

- presença dos três módulos funcionais de segurança Electron;

- existência e composição correta de `test:electron-security`;

- inclusão automática da regressão de segurança por `test:unit` através de `tests/unit/**/*.test.js`;

- piso mínimo atual de **28 testes funcionais de segurança** nas três suítes principais (9 navegação + 9 WebContents/popups + 10 IPC);

- presença dos marcadores centrais das Etapas 1–4: origins, `will-navigate`, `will-redirect`, sanitização de logs, `setWindowOpenHandler`, políticas da `offlineView`, matriz IPC, resolvedor de sender, IDs de processo/frame e estado `detached`;

- uso de `node:test` e leitura do código real do projeto, evitando uma suíte desconectada da implementação.



A pipeline local já executa `test:unit`, portanto o novo contrato e todos os testes Electron consolidados continuam incluídos automaticamente no fluxo normal sem necessidade de duplicar a execução na pipeline.



Resultados:

- contrato consolidado isolado: **6/6 testes aprovados**;

- suíte Electron de segurança consolidada: **34/34 testes aprovados** (28 funcionais + 6 de contrato);

- `main.js --check`: aprovado;

- suíte unitária completa: **134/134 testes aprovados, 0 falhas**.



O checkout permanece sem `node_modules` próprio; as execuções locais de validação utilizaram Electron/Node da instalação existente e `NODE_PATH` para as dependências empacotadas quando necessário.



### Passo 5.2/5 — testes combinados de escape e bypass



Foi criado o teste permanente `tests/unit/electron-security-bypass.test.js`, dedicado a cadeias de ataque que atravessam mais de uma camada de segurança Electron.



O objetivo deste passo não foi testar navegação, popup e IPC isoladamente, mas validar defesa em profundidade quando uma barreira é contornada ou simulada como já atravessada.



Cenários permanentes adicionados:

- `mainWindow` confiável: navegação same-origin continua permitida, popup continua negado e somente IPC da superfície online é autorizado;

- destino externo na `mainWindow`: `will-navigate` bloqueia, popup é negado e, mesmo simulando um escape programático para o origin externo, o IPC é revogado;

- `event.url` malicioso prevalece sobre argumento legado seguro e não deixa autorização IPC residual;

- `efisco-update://start` é apenas interceptado no fluxo de navegação, não pode abrir popup e a página `data:` de atualização não recebe IPC online;

- `offlineView` confiável: navegação no origin runtime é permitida, popup é negado e apenas IPC offline é autorizado;

- escape externo da `offlineView`: navegação e popup são bloqueados e um escape programático simulado também perde IPC;

- `localhost` e porta loopback diferente são negados simultaneamente por navegação, popup e IPC;

- subframe same-origin pode manter redirect funcional conforme a política de compatibilidade, mas não ganha popup nem capacidades IPC privilegiadas;

- mudança da porta runtime do `offlineUiServer` invalida ao mesmo tempo navegação futura para a porta antiga e IPC do frame antigo.



Nenhum bypass combinado foi encontrado; portanto, não foi necessário alterar `main.js` neste passo.



O novo módulo foi incorporado a `test:electron-security` e ao contrato `electron-security-suite-contract.test.js`. O piso permanente da suíte funcional de segurança subiu de **28 para 37 testes**.



Resultados:

- `electron-security-bypass.test.js`: **9/9 testes aprovados**;

- contrato consolidado: **6/6 testes aprovados**;

- suíte Electron de segurança consolidada: **43/43 testes aprovados** (37 funcionais + 6 de contrato);

- `main.js --check`: aprovado;

- suíte unitária completa: **143/143 testes aprovados, 0 falhas**.



### Passo 5.3/5 — regressão funcional dos fluxos legítimos



Foi criada a regressão permanente `tests/unit/electron-functional-regression.test.js` para confirmar que o hardening das Etapas 1–4 não bloqueia fluxos legítimos do aplicativo.



Cobertura adicionada:

- fluxo online confiável continua reconhecido por origin exato;

- o handler real de `efisco:print-nfce-windows-driver` aceita um evento legítimo da `mainWindow` e encaminha o payload para `enfileirar(...)`;

- a mesma impressão é recusada quando originada pela `offlineView`, sem chamar a fila;

- o handler real de `efisco:offline-operator-login` aceita um evento legítimo da `offlineView` em modo OFFLINE, chama o validador de senha, aplica perfil, cria sessão local e atualiza o estado de autenticação do shell;

- a `mainWindow` online não consegue executar o login offline;

- o PDV offline mantém autorizados os canais legítimos de consulta/abertura/movimento/fechamento de caixa, venda paga e operações de crediário.



O novo teste foi incorporado ao comando `test:electron-security` e ao contrato da suíte. O piso permanente de testes funcionais de segurança subiu de **37 para 42 testes**.



Além da camada Electron, foram executados testes reais de domínio/persistência para confirmar o comportamento funcional após o hardening:

- `payment-sale-input.test.js`;

- `db-domain-persistence.test.js`;

- `db-atomic-rollback.test.js`;

- `fiscal-end-to-end-controlled.test.js`.



Esse recorte somou **18/18 testes aprovados**, cobrindo venda, caixa, crediário, persistência, idempotência, rollback atômico e pipeline fiscal controlado.



Validação ampliada do projeto:

- regressão funcional Electron: **5/5 testes aprovados**;

- contrato consolidado: **6/6 testes aprovados**;

- suíte Electron de segurança consolidada: **48/48 testes aprovados** (42 funcionais + 6 de contrato);

- `main.js --check`: aprovado;

- suíte unitária completa: **148/148 testes aprovados, 0 falhas**;

- suíte de integração completa: **52/52 testes aprovados, 0 falhas**.



Nenhuma regressão funcional causada pelo hardening foi encontrada e nenhuma alteração de produção em `main.js` foi necessária neste passo.



### Passo 5.4/5 — auditoria estática final e fechamento de confused deputies



A auditoria estática final revisou preferências Electron, navegação/popups, APIs de abertura externa, bypasses de TLS/web security, execução dinâmica e pontes `postMessage`/console que atravessam frames.



A varredura confirmou ausência, no código de produção, de regressões como:

- `window.open(...)` e `shell.openExternal(...)`;

- `nodeIntegration: true`;

- `contextIsolation: false`;

- `sandbox: false`;

- `webSecurity: false` e `allowRunningInsecureContent: true`;

- `setCertificateVerifyProc`, `--ignore-certificate-errors` e `--disable-web-security`;

- `eval(...)` e `new Function(...)`;

- validação de loopback por prefixo `startsWith('http://127.0.0.1...')` ou `startsWith('http://localhost...')`.



A revisão manual encontrou três caminhos de confused deputy que ainda mereciam endurecimento:



1. **Contador NFC-e por console-frame**

   - antes, a ponte ONLINE recusava apenas o origin offline exato;

   - agora `processarContadorFiscalDoFrame(...)` exige que o `WebFrameMain` seja exatamente o PDV online reconhecido por `findPdvContinuityFrame(...)`;

   - o origin lido dentro do documento deve ser não vazio, não opaco (`null`) e idêntico a `frame.origin`.



2. **Marcadores privilegiados em `console-message`**

   - os marcadores de contador, impressão, diagnóstico de contingência e resposta de numeração agora passam primeiro por `isTrustedPdvFrameForContents(...)`;

   - a função fixa a identidade no frame PDV reconhecido;

   - para a `offlineView`, exige adicionalmente URL no origin runtime offline exato;

   - marcador vindo de outro frame é descartado e registrado com URL sanitizada.



3. **Pontes TOP / preload baseadas em `postMessage`**

   - `instalarPonteTopDeImpressao()` descobre o frame PDV atual, fixa `TRUSTED_PDV_ORIGIN`, rejeita `event.origin` diferente e responde usando o origin exato em vez de `'*'`;

   - `installOfflineVerifierTopBridge()` usa o mesmo pinning de origin e falha fechado se o origin do PDV estiver indisponível ou opaco;

   - o relay redundante de `SCF_EFISCO_OFFLINE_VERIFIER_CANDIDATE` foi removido do `preload.js`; o fluxo permanece pela ponte TOP controlada;

   - o relay `SCF_SUPERADMIN_CERTIFICADO_A1_ENVIAR` do preload agora exige origin igual ao documento offline atual e `event.source === document.getElementById('scfOfflinePdv').contentWindow`.



O uso de `executeJavaScript` permanece intencional para integração com o PDV/Wix e com a UI offline; ele não foi tratado como vulnerabilidade por si só. A auditoria passou a proteger as fronteiras que autorizam quem pode acionar essas pontes.



Foi criado `tests/unit/electron-static-security-audit.test.js` com **10 testes permanentes**, cobrindo as regras acima e impedindo a reintrodução das configurações/APIs inseguras verificadas.



O módulo foi incluído em `test:electron-security` e em `electron-security-suite-contract.test.js`. O piso permanente da suíte funcional de segurança subiu de **42 para 52 testes**.



Validação:

- auditoria estática permanente: **10/10 testes aprovados**;

- self-test de execução das pontes TOP/preload: **11/11 verificações aprovadas**;

- suíte Electron consolidada: **58/58 testes aprovados** (52 funcionais + 6 de contrato);

- suíte unitária completa: **158/158 testes aprovados, 0 falhas**;

- suíte de integração completa: **52/52 testes aprovados, 0 falhas**;

- `main.js --check`: aprovado;

- `preload.js --check`: aprovado.



### Passo 5.5/5 — regressão final e encerramento do hardening Electron



O ciclo de hardening das Etapas 1–5 foi submetido a uma regressão final completa, sem novas alterações de produção neste passo.



Validações finais executadas:

- `main.js --check`: aprovado;

- `preload.js --check`: aprovado;

- suíte Electron dedicada: **58/58 testes aprovados**;

- suíte unitária completa: **158/158 testes aprovados**;

- suíte de integração completa: **52/52 testes aprovados**;

- execução combinada unit + integration: **210/210 testes aprovados, 0 falhas**.



Estado final das camadas de segurança Electron:

- origins online/offline validados estruturalmente e sem confiança por prefixo;

- navegação da `mainWindow` e da `offlineView` protegida por allowlist e fail-closed;

- popups bloqueados por `setWindowOpenHandler` em ambas as superfícies;

- IPC vinculado a canal, transporte, superfície, main frame, URL/origin, processId/frameId e identidade real dos objetos Electron;

- subframes, documentos `about:blank`/`data:`, frames detached/destruídos e mudanças de origin não herdam capacidades privilegiadas;

- pontes `postMessage` e `console-message` privilegiadas fixadas ao frame/origin PDV reconhecido;

- preload reduzido para o relay A1 estritamente necessário, preso ao iframe offline local exato;

- logging de bloqueios sanitiza URLs sensíveis;

- regressão estática permanente impede reintrodução de preferências Electron inseguras, bypass TLS/web-security, popup/abertura externa e padrões frágeis de origin.



Cobertura permanente consolidada:

- `electron-navigation-security.test.js` — navegação/origin;

- `electron-webcontents-security.test.js` — popups e WebContentsView;

- `electron-ipc-security.test.js` — matriz e identidade IPC;

- `electron-security-bypass.test.js` — cadeias combinadas de escape;

- `electron-functional-regression.test.js` — compatibilidade funcional pós-hardening;

- `electron-static-security-audit.test.js` — auditoria estrutural permanente;

- `electron-security-suite-contract.test.js` — contrato da própria suíte.



A suíte Electron consolidada contém **52 testes funcionais de segurança + 6 testes de contrato = 58 testes**.



**Etapa 5 — regressão, bypass, compatibilidade funcional e auditoria final: CONCLUÍDA.**



**Ciclo de hardening Electron das Etapas 1–5: CONCLUÍDO.**



Não há outra etapa obrigatória pendente neste plano de segurança. Trabalhos posteriores, como build de release, assinatura de código, validação do instalador e distribuição, pertencem a um ciclo de release/deployment separado.

