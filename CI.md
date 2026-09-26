# CI — e-fisco Desktop 1.0.41

## 8.1/6 — inventário do fluxo de build/test atual

Este documento registra a baseline observada antes da criação da CI.

O inventário estruturado correspondente está em:

- `ci/current-flow.json`.

### Estado atual de CI

Não existe configuração de CI versionada no projeto.

Foram procurados, sem resultado:

- `.github/workflows`;
- Azure Pipelines;
- GitLab CI;
- AppVeyor;
- Jenkins;
- CircleCI.

Portanto o 8.1 não migra nem substitui pipeline existente: o 8.2 partirá de
zero.

### Instalação e lockfile

O projeto possui:

- `package-lock.json`;
- lockfile v3;
- 4 dependências de runtime;
- 2 dependências de desenvolvimento.

O `package.json` não possui atualmente:

- `engines`;
- `packageManager`.

Também não existem:

- `.npmrc`;
- `.gitignore`.

O checkout local usado nesta validação não possui `node_modules`.
A futura CI deverá instalar dependências de forma limpa a partir do lockfile.

Versões resolvidas no lockfile:

- Electron: **43.4.1**;
- electron-builder: **26.15.3**.

Runtime local usada para executar a suíte:

- Electron: **43.4.1**;
- Node embutido: **24.18.1**;
- ABI modules: **148**;
- plataforma: **win32/x64**.

### Scripts atuais

Scripts de validação disponíveis:

- `test`;
- `test:unit`;
- `test:integration`;
- `test:db`;
- `test:fiscal`;
- `test:architecture`;
- `phase1:selftest`;
- `phase2:db-selftest`.

O comando operacional `phase2:pair-device` não é teste de CI.

Os scripts de teste usam:

`set ELECTRON_RUN_AS_NODE=1&& ...`

Portanto a forma atual é específica do shell Windows/cmd.exe.

### Baseline real das suítes

Arquivos:

- unitários: **8**;
- integração: **14**.

Execução observada:

| Suíte | Testes | Passaram | Falharam |
| --- | ---: | ---: | ---: |
| unit | 88 | 88 | 0 |
| integration | 52 | 52 | 0 |
| db | 19 | 19 | 0 |
| fiscal | 28 | 28 | 0 |
| architecture | 9 | 9 | 0 |
| completa | 140 | 140 | 0 |

Os recortes DB, fiscal e arquitetura se sobrepõem às suítes unitária/de
integração e não devem ser somados ao total completo.

Self-tests:

- `phase1-selftest: OK`;
- `phase2-db-selftest: OK`.

### Build atual

O build usa:

- `electron-builder`;
- Windows;
- NSIS;
- x64;
- ASAR;
- compressão máxima.

Comando atual:

`electron-builder --win nsis --publish never`

Saída configurada:

- diretório: `dist`;
- instalador: `e-fisco-Setup-${version}.exe`.

Existe configuração de publicação genérica no `package.json`, mas o script
`dist` explicitamente usa `--publish never`.

### Insumos do pacote

`build.files` possui **20 entradas**.

Na validação do 8.1:

- entradas ausentes: **0**;
- `offline-fiscal-*.js`: **15** arquivos;
- `offline-ui/**`: **4** arquivos.

Arquivos desempacotados do ASAR:

- `print-driver-nfce.ps1`;
- `EFISCO-UPDATER.exe`.

Testes e artefatos de arquitetura não fazem parte do pacote.

### dist local

Existe um `dist` pré-existente contendo, entre outros:

- `e-fisco-Setup-1.0.41.exe`;
- blockmap;
- `latest.yml`;
- `win-unpacked/e-fisco.exe`.

Esse diretório **não foi produzido no Passo 8.1** e não é usado como evidência
de build reproduzível ou de CI.

Nenhum build foi executado neste micropasso.

### Lacunas objetivas para os próximos passos

O inventário identifica as seguintes lacunas:

- nenhuma CI versionada;
- versão de Node para instalação ainda não declarada no projeto;
- package manager ainda não declarado explicitamente;
- scripts de teste atualmente específicos de Windows;
- ausência de instalação limpa automatizada;
- ausência de jobs separados por suíte;
- ausência de build automatizado;
- ausência de validação/upload de artefatos;
- ausência de cache e política de falha/diagnóstico.

Esses pontos serão tratados incrementalmente nos passos 8.2–8.5.



## 8.2/6 — pipeline CI mínimo e reproduzível

Foi criado o primeiro workflow versionado do projeto:

- `.github/workflows/ci.yml`.

Também foi criado o contrato estruturado:

- `ci/pipeline-contract.json`.

### Plataforma e toolchain

O workflow usa:

- GitHub Actions;
- runner `windows-2025`;
- Node `24.18.1`;
- instalação por `npm ci`;
- permissões `contents: read`.

O runner Windows foi escolhido porque os scripts atuais usam sintaxe
`set VAR=...&&` do Windows e o produto é empacotado para Windows.

A versão do Node foi fixada na mesma versão observada no runtime Electron
validado localmente.

### Ações do workflow

O job único `verify` usa:

- `actions/checkout@v7.0.1`;
- `actions/setup-node@v7.0.0`.

O cache automático foi explicitamente desativado no 8.2:

- `package-manager-cache: false`.

Cache será tratado somente no 8.5.

### Fluxo mínimo

A ordem do job é:

1. checkout;
2. setup do Node 24.18.1;
3. `npm ci`;
4. impressão das versões de Node/npm/Electron;
5. `npm test`;
6. `npm run phase1:selftest`;
7. `npm run phase2:db-selftest`.

O workflow dispara em:

- `push`;
- `pull_request`;
- `workflow_dispatch`.

### Escopo preservado

O 8.2 ainda **não** contém:

- jobs separados por suíte;
- build;
- electron-builder;
- publish;
- upload de artefatos;
- cache de dependências.

Esses itens continuam reservados para 8.3–8.5.

### Guardrail permanente

Foi criado:

- `tests/unit/ci-workflow-contract.test.js`.

São 4 testes que garantem:

- workflow e contrato alinhados;
- runner/Node/actions fixados;
- `npm ci` executado antes dos testes;
- ordem da suíte completa e self-tests;
- ausência de build/publish/cache/upload prematuros;
- exatamente um job no contrato do 8.2.

Resultado:

- testes: **4**;
- aprovados: **4**;
- falhas: **0**;
- exit code: 0.

### Validação de instalação limpa

Foi tentada uma simulação usando Node 24.18.1 portátil e `npm ci`.

A execução excedeu o limite de tempo do conector durante download/instalação e
não foi considerada concluída.

Após o timeout:

- processos órfãos da tentativa foram identificados e encerrados;
- diretórios temporários `efisco-step82-ci-*` foram removidos;
- `node_modules` continua ausente no checkout;
- nenhum arquivo do projeto foi modificado pela tentativa.

Portanto o 8.2 não afirma que o workflow já foi executado no GitHub.

### Regressão local

Com a runtime Electron já validada:

- teste específico do workflow: **4/4**;
- suíte completa: **144/144**;
- falhas: **0**;
- `FULL_EXIT_CODE=0`;
- `node_modules` após limpeza: ausente;
- resíduos `.step82-*`: 0;
- resíduos `efisco-step82-*`: 0.



## 8.3/6 — jobs de testes unitários, integração, DB, fiscal e arquitetura

O job único `verify` do 8.2 foi substituído por **5 jobs especializados**:

- `unit`;
- `integration`;
- `db`;
- `fiscal`;
- `architecture`.

Todos mantêm a mesma base reproduzível:

- `windows-2025`;
- Node `24.18.1`;
- `actions/checkout@v7.0.1`;
- `actions/setup-node@v7.0.0`;
- `package-manager-cache: false`;
- instalação por `npm ci`.

### Jobs

#### unit

Executa:

- `npm run test:unit`.

Baseline observada:

- **94/94**.

#### integration

Executa:

- `npm run test:integration`;
- `npm run phase1:selftest`;
- `npm run phase2:db-selftest`.

Baseline observada:

- integração: **52/52**;
- `phase1-selftest: OK`;
- `phase2-db-selftest: OK`.

#### db

Executa:

- `npm run test:db`.

Baseline:

- **19/19**.

#### fiscal

Executa:

- `npm run test:fiscal`.

Baseline:

- **28/28**.

#### architecture

Executa:

- `npm run test:architecture`.

Baseline:

- **9/9**.

### Modelo de cobertura

`unit + integration` cobrem todos os testes da suíte completa.

Os jobs:

- DB;
- fiscal;
- arquitetura;

são recortes redundantes usados para diagnóstico mais rápido de falhas e não
devem ser somados ao total geral.

### Guardrail atualizado

`tests/unit/ci-workflow-contract.test.js` passou de 4 para **6 testes**.

Agora ele valida:

- exatamente os cinco jobs esperados;
- ausência do antigo job `verify`;
- toolchain idêntica nos cinco jobs;
- cinco instalações por `npm ci`;
- comandos dos jobs ligados a scripts reais do `package.json`;
- self-tests preservados no job `integration`;
- modelo de cobertura unit + integration;
- ausência de build/publish/upload/cache antes dos passos 8.4/8.5.

Resultado:

- **6/6**;
- falhas: 0.

### Regressão completa

Após a especialização dos jobs:

- suíte completa: **146/146**;
- falhas: 0;
- `FULL_EXIT_CODE=0`;
- `node_modules` continua ausente;
- resíduos `.step83-*`: 0;
- resíduos `efisco-step83-*`: 0.

O workflow ainda não foi executado remotamente no GitHub.

### Escopo preservado

O 8.3 ainda não adiciona:

- build NSIS;
- upload de artefatos;
- publish;
- cache;
- políticas de retenção/falha.

Esses itens permanecem para 8.4 e 8.5.

## 8.4/6 — build/empacotamento e validações de release

O workflow passou a possuir um **sexto job**, `build`.

Ele depende explicitamente dos cinco jobs de teste:

- `unit`;
- `integration`;
- `db`;
- `fiscal`;
- `architecture`.

Assim, o empacotamento só começa depois que todos os jobs de validação terminam
com sucesso.

### Job de build

O job `build` usa a mesma base dos demais:

- `windows-2025`;
- Node `24.18.1`;
- `actions/checkout@v7.0.1`;
- `actions/setup-node@v7.0.0`;
- `npm ci`;
- cache ainda desativado.

A sequência é:

1. checkout;
2. setup do Node;
3. instalação limpa por `npm ci`;
4. remoção de qualquer `dist` herdado do checkout;
5. `npm run dist`;
6. validação dos artefatos com `ci/validate-release.ps1`.

A limpeza de `dist` antes do build impede que artefatos antigos satisfaçam
acidentalmente as verificações de release.

### Build esperado

O contrato continua sendo:

- plataforma: Windows;
- target: NSIS;
- arquitetura: x64;
- ASAR: habilitado;
- saída: `dist`;
- artifact name: `e-fisco-Setup-${version}.exe`;
- comando: `electron-builder --win nsis --publish never`.

O build continua sem publicação automática.

### Validador de release

Foi criado:

- `ci/validate-release.ps1`.

O validador exige:

- versão do `package.json`;
- configuração NSIS x64;
- `--publish never` no script `dist`;
- instalador com nome/versionamento corretos;
- instalador com tamanho não trivial;
- blockmap;
- `latest.yml`;
- `latest.yml.version`;
- `latest.yml.path`;
- `latest.yml.files.url`;
- tamanho declarado igual ao tamanho real do instalador;
- SHA-512 Base64 do `latest.yml` igual ao SHA-512 real do instalador;
- `win-unpacked/e-fisco.exe`;
- `resources/app.asar`;
- `resources/app-update.yml`;
- todos os arquivos declarados em `asarUnpack`.

Os arquivos `asarUnpack` validados atualmente são:

- `print-driver-nfce.ps1`;
- `EFISCO-UPDATER.exe`.

### Validação local do contrato de release

O validador foi executado contra o `dist` local pré-existente.

Resultado:

- versão: `1.0.41`;
- instalador: `e-fisco-Setup-1.0.41.exe`;
- tamanho: **107134616 bytes**;
- arquivos `asarUnpack`: **2**;
- SHA-512: consistente com `latest.yml`;
- `RELEASE_VALIDATION=OK`;
- exit code: 0.

Essa validação comprova o comportamento do validador sobre um pacote existente
coerente. Ela **não é registrada como build fresco do 8.4**.

### Guardrails de CI/release

`tests/unit/ci-workflow-contract.test.js` agora possui **8 testes**.

Eles garantem:

- cinco jobs de teste + um job de build;
- toolchain idêntica nos seis jobs;
- `npm ci` nos seis jobs;
- build dependente dos cinco jobs de teste;
- ordem `clean dist -> npm run dist -> validate-release.ps1`;
- configuração NSIS x64;
- publish desabilitado;
- presença das validações de versão, tamanho e SHA-512;
- ausência de upload/cache/publish automático antes do 8.5.

Resultado:

- **8/8**;
- falhas: 0.

### Regressão completa

Após o 8.4:

- jobs declarados: **6**;
- suíte completa: **148/148**;
- falhas: 0;
- `FULL_EXIT_CODE=0`;
- `RELEASE_VALIDATION=OK`;
- `node_modules` continua ausente;
- resíduos `.step84-*`: 0;
- resíduos `efisco-step84-*`: 0.

O workflow ainda não foi executado remotamente no GitHub e nenhum build fresco
foi produzido localmente nesta sessão.

### Escopo preservado

O 8.4 ainda não adiciona:

- upload de artefatos;
- retenção;
- cache;
- publish;
- endurecimento de falhas.

Esses itens permanecem para o 8.5.



## 8.5/6 — falhas, artefatos, cache e endurecimento da CI

O workflow foi endurecido sem alterar lógica de produção.

### Concurrency

Foi adicionada uma política de concorrência por workflow + PR/ref:

- execuções novas da mesma referência cancelam execuções anteriores ainda em
  andamento;
- `cancel-in-progress: true`.

Isso evita consumir runner com pipeline já superseded por um push mais novo.

### Cache de dependências

Os seis jobs agora habilitam explicitamente cache npm pelo
`actions/setup-node`:

- tipo: `npm`;
- chave derivada de `package-lock.json`;
- `cache-dependency-path: package-lock.json`;
- `package-manager-cache: false` permanece para impedir detecção automática
  implícita;
- `node_modules` não é armazenado/reutilizado.

A instalação continua sendo limpa em todos os jobs:

`npm ci --no-audit --no-fund`.

Também foram definidos no workflow:

- `npm_config_audit=false`;
- `npm_config_fund=false`.

### Checkout endurecido

Nos seis jobs:

- `persist-credentials: false`.

O workflow continua com permissão global mínima:

- `contents: read`.

Nenhum secret é necessário e nenhuma permissão de escrita/OIDC foi adicionada.

### Timeouts

Cada job passou a possuir timeout explícito:

- unit: 10 min;
- integration: 15 min;
- DB: 10 min;
- fiscal: 15 min;
- architecture: 10 min;
- build: 35 min.

Assim uma execução travada não ocupa runner indefinidamente.

### Diagnóstico de falha

Cada um dos seis jobs recebeu um passo `Summarize failure` com
`if: failure()`.

Em caso de falha, o resumo do GitHub Actions registra:

- job;
- run id;
- commit.

### Upload do release validado

O job `build` agora faz upload **somente depois** de:

1. limpar `dist`;
2. construir o NSIS;
3. executar `ci/validate-release.ps1` com sucesso.

A ação utilizada é:

- `actions/upload-artifact@v7.0.1`.

O artefato contém somente:

- `dist/e-fisco-Setup-*.exe`;
- `dist/e-fisco-Setup-*.exe.blockmap`;
- `dist/latest.yml`.

Não é enviado `win-unpacked`.

Política:

- nome: `e-fisco-release-${{ github.sha }}`;
- arquivo ausente: erro;
- retenção: **14 dias**;
- compression level: 0, evitando recompressão inútil do instalador já
  comprimido.

O upload permanece separado de publish. O projeto continua com:

- `--publish never`;
- publish automático: **desabilitado**.

### Guardrails

`tests/unit/ci-workflow-contract.test.js` passou para **12 testes**.

Além dos contratos anteriores, agora protege:

- concurrency/cancelamento;
- cache npm explícito e baseado no lockfile;
- proibição de cache de `node_modules`;
- checkout sem credencial persistida;
- timeouts nos seis jobs;
- resumo de falha nos seis jobs;
- upload após validação;
- retenção de 14 dias;
- `if-no-files-found: error`;
- ausência de `win-unpacked` no upload;
- publish e permissões elevadas continuam ausentes.

Resultado:

- **12/12**;
- falhas: 0.

### Regressão completa

Resultado após o endurecimento:

- `STEP85_WORKFLOW_HARDENING=OK`;
- jobs: 6;
- jobs com cache: 6;
- jobs com timeout: 6;
- jobs com resumo de falha: 6;
- uploads de artefato: 1;
- `RELEASE_VALIDATION=OK`;
- suíte completa: **152/152**;
- falhas: 0;
- `FULL_EXIT_CODE=0`;
- `package-lock.json`: inalterado;
- `node_modules`: ausente;
- resíduos `.step85-*`: 0;
- resíduos `efisco-step85-*`: 0.

O workflow ainda não foi executado remotamente no GitHub e o build fresco de CI
continua não observado localmente nesta sessão.

## 8.6/6 — execução completa, limpeza e consolidação da Etapa 8

A Etapa 8 foi encerrada com uma execução local completa dos contratos, suítes,
self-tests e validações de release.

### Consolidação permanente

O `package.json` recebeu:

- `test:ci`.

Esse script executa diretamente:

- `tests/unit/ci-workflow-contract.test.js`.

Assim os contratos de CI passam a ter o mesmo tipo de entrada dedicada já
existente para DB, fiscal e arquitetura.

### Validação de sintaxe

Foram verificados:

- arquivos JavaScript de produção: **29/29**;
- `tests/unit/ci-workflow-contract.test.js`: sintaxe OK;
- `ci/validate-release.ps1`: parse PowerShell OK.

Nenhuma falha de sintaxe foi encontrada.

### Bateria CI

Guardrails finais:

- testes: **12**;
- aprovados: **12**;
- falhas: **0**;
- exit code: 0.

Eles cobrem:

- triggers e permissões;
- 5 jobs de teste + 1 build;
- Node/runner fixados;
- `npm ci`;
- cache npm por lockfile;
- checkout sem credencial persistida;
- coverage model;
- gate dos cinco jobs antes do build;
- build NSIS x64;
- validação forte de release;
- publish desabilitado;
- concurrency;
- timeouts;
- diagnóstico de falha;
- upload somente após validação;
- retenção limitada do artefato.

### Execução dos jobs

Resultados locais equivalentes aos jobs:

| Job | Resultado |
| --- | ---: |
| unit | **100/100** |
| integration | **52/52** |
| DB | **19/19** |
| fiscal | **28/28** |
| architecture | **9/9** |

Self-tests:

- `phase1-selftest: OK`;
- `phase2-db-selftest: OK`.

Todos terminaram com exit code 0.

### Validação de release

`ci/validate-release.ps1` foi executado novamente contra o `dist`
pré-existente validado durante a etapa.

Resultado:

- release: `1.0.41`;
- instalador: `e-fisco-Setup-1.0.41.exe`;
- tamanho: **107134616 bytes**;
- SHA-512 coerente com `latest.yml`;
- arquivos `asarUnpack`: 2;
- `RELEASE_VALIDATION=OK`;
- exit code: 0.

Essa execução confirma o contrato de release, mas continua não sendo classificada
como build fresco produzido nesta sessão.

### Suíte completa

Resultado final:

- testes: **152**;
- aprovados: **152**;
- falhas: **0**;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- `FULL_EXIT_CODE=0`.

### Estado final do workflow

- jobs: **6**;
- jobs com cache npm: **6**;
- jobs com timeout: **6**;
- jobs com resumo de falha: **6**;
- uploads de artefato: **1**;
- publish: **desabilitado**;
- permissões globais: `contents: read`;
- checkout persistindo credenciais: não;
- cache de `node_modules`: não;
- retenção do release: 14 dias.

O `package-lock.json` permaneceu inalterado.

### Limpeza

Não ficaram resíduos de nenhum micropasso da Etapa 8:

- `.step81-*` até `.step86-*`: **0**;
- `efisco-step81-*` até `efisco-step86-*`: **0**;
- `node_modules` no checkout: ausente.

Backups não vazios das edições seguras foram preservados.

### Limitação observacional

O workflow está versionado e protegido por testes locais, mas nesta sessão:

- `githubWorkflowExecuted=false`;
- `freshCiBuildExecuted=false`.

Ou seja, a configuração de CI foi concluída e validada localmente; uma execução
remota real do GitHub Actions ainda não foi observada aqui.

### Estado da Etapa 8

- [x] 8.1 — inventário do fluxo de build/test atual
- [x] 8.2 — pipeline CI mínimo e reproduzível
- [x] 8.3 — jobs de testes unitários, integração, DB, fiscal e arquitetura
- [x] 8.4 — build/empacotamento e validações de release
- [x] 8.5 — falhas, artefatos, cache e endurecimento da CI
- [x] 8.6 — execução completa, limpeza e consolidação da Etapa 8

**Etapa 8 — CI: CONCLUÍDA.**

**Plano geral — Etapas 1 a 8: CONCLUÍDO.**


---

## Estado atual — pipeline local privada

A configuração de GitHub Actions criada durante a Etapa 8 foi **desativada e
removida do projeto** após a decisão de manter o código-fonte do e-fisco somente
na máquina local.

As seções anteriores que descrevem GitHub Actions permanecem neste documento
apenas como **histórico da evolução da Etapa 8**. Elas não representam mais a
configuração ativa.

### Configuração ativa

A automação atual é:

- provider: `local-powershell`;
- entrada: `ci/local-ci.ps1`;
- contrato: `ci/pipeline-contract.json`;
- validador de release: `ci/validate-release.ps1`.

A pasta:

- `.github`

não existe mais no projeto.

### Execução

Para executar a pipeline completa localmente:

```powershell
.\ci\local-ci.ps1
```

Se o `npm` já estiver disponível no `PATH`, também existe o atalho no `package.json`:

```text
npm run ci:local
```

A execução padrão realiza:

1. resolve Node.js 24.18.1;
2. se Node/npm não estiverem disponíveis, baixa Node portátil do `nodejs.org`;
3. valida o ZIP do Node contra `SHASUMS256.txt`;
4. executa `npm ci --no-audit --no-fund`;
5. executa `test:ci`;
6. executa testes unitários;
7. executa integração;
8. executa DB;
9. executa fiscal;
10. executa arquitetura;
11. executa os dois self-tests;
12. executa a suíte completa;
13. limpa `dist`;
14. executa `npm run dist`;
15. executa `ci/validate-release.ps1`.

Opções:

- `-SkipBuild`: executa validações/testes sem recriar o instalador;
- `-KeepNodeModules`: preserva `node_modules` quando ele tiver sido criado
  pela própria pipeline.

Por padrão, se `node_modules` não existia antes da execução, ele é removido ao
final.

### Privacidade

A pipeline ativa:

- não contém `git push`;
- não contém GitHub Actions;
- não contém `upload-artifact`;
- não publica releases;
- não envia o instalador para GitHub;
- mantém o resultado do build em `dist`;
- mantém `--publish never` no electron-builder;
- não requer secrets.

A pipeline pode **baixar** ferramentas/dependências externas:

- Node.js e checksums de `nodejs.org`, se necessários;
- pacotes definidos pelo `package-lock.json` durante `npm ci`.

Não existe etapa intencional de upload do código-fonte ou dos artefatos.

### Backup da configuração removida

Antes de apagar `.github`, foi criada uma cópia de segurança fora do diretório
do projeto em:

`%LOCALAPPDATA%\e-fisco-ci\backups`

Esse backup externo não entra em um eventual `git add .` do projeto.

### Validação da migração

Após a migração:

- guardrails da pipeline local: **12/12**;
- suíte completa: **152/152**;
- falhas: **0**;
- JavaScript de produção: **29/29** com sintaxe válida;
- `RELEASE_VALIDATION=OK`;
- `.github`: ausente;
- `node_modules`: ausente;
- temporários da pipeline local: 0;
- `LOCAL_MIGRATION_VALIDATION=OK`.

Uma execução direta da pipeline tentou baixar o Node portátil, mas o download
ultrapassou o limite do conector usado nesta sessão. Os processos e temporários
foram removidos. Isso não foi registrado como execução completa da pipeline.

O estado ativo do projeto é, portanto, **CI local privada, sem workflow remoto**.




## Etapa 1.4/4 — revisão final da materialização da CI remota



A revisão final confirmou o modelo híbrido escolhido para a release 1.0.41:



- GitHub: código-fonte + CI;

- R2: atualização automática e distribuição;

- o workflow não publica no R2;

- o build continua usando `--publish never`;

- o provider `generic` do `package.json` continua apontando para o R2;

- a pipeline local `ci/local-ci.ps1` foi preservada.



Arquivos de CI/contrato alterados nesta etapa:



- `.github/workflows/ci.yml`;

- `ci/pipeline-contract.json`;

- `tests/unit/ci-workflow-contract.test.js`;

- este registro em `CI.md`.



Nenhum arquivo JavaScript de produção foi editado para materializar o workflow.



Validações finais:



- guardrails de CI: **12/12**, falhas: 0;

- validação do dist existente: `RELEASE_VALIDATION=OK`;

- `package-lock.json`: inalterado;

- sintaxe dos JavaScript de raiz: **31/31**;

- `node_modules`: ausente no checkout.



Uma execução direta da suíte completa sem `npm ci` foi tentada apenas como

diagnóstico e não é equivalente à CI: 4 testes não carregaram por ausência de

`node-forge` e `@xmldom/xmldom`. A CI remota resolve essa pré-condição por

`npm ci --no-audit --no-fund` antes dos testes.



Ainda não ocorreu nesta etapa:



- push para GitHub;

- execução remota do GitHub Actions;

- build fresco de CI;

- publicação de artefatos no R2.



Estado: **ETAPA 1 CONCLUÍDA LOCALMENTE**.

