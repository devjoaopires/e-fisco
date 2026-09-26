# Testes — e-fisco Desktop 1.0.41

Este documento registra a infraestrutura de testes da release 1.0.41.

## 2.1/6 — Runner escolhido

**Runner oficial:** `node:test`  
**Assertions:** `node:assert/strict`  
**Formato dos testes:** CommonJS (`require(...)`), igual ao código atual.

### Motivo da escolha

O projeto atual:

- usa CommonJS;
- já depende de Electron 43.4.1;
- não possui Jest, Vitest, Mocha, Playwright ou Cypress;
- contém muitas funções de domínio que podem ser testadas sem browser;
- não precisa de transpiler para executar os módulos atuais.

Usar o runner nativo evita adicionar uma dependência de teste apenas para
obter funcionalidades que o runtime já fornece.

### Runtime verificado

A máquina analisada não possui um executável `node` disponível no `PATH`.

Porém, o aplicativo instalado possui:

- Electron: **43.4.1**
- Node embutido: **24.18.1**

Foi verificado, com `ELECTRON_RUN_AS_NODE=1`, que esse runtime consegue
carregar:

- `node:test`
- `node:assert/strict`

Portanto, a infraestrutura será preparada para executar testes pelo Node
embutido no Electron. Após as dependências de desenvolvimento estarem
instaladas, o executável local do pacote `electron` poderá ser usado pelo
script npm.

### Política da infraestrutura

Os testes devem:

1. não acessar produção por padrão;
2. não usar banco, token ou certificado reais do usuário;
3. usar diretórios temporários para SQLite/filesystem;
4. usar doubles ou servidores locais controlados para HTTP;
5. usar fixtures não produtivas para material fiscal;
6. deixar Electron/Windows real para a camada de integração de sistema.

### Convenção prevista

Os próximos micropassos vão preparar:

- `tests/unit/`
- `tests/integration/`
- `tests/fixtures/`
- `tests/helpers/`

Os scripts npm serão adicionados no passo 2.3/6.

## 2.2/6 — Estrutura de diretórios

A estrutura física de testes foi criada na raiz da release:

```text
tests/
├── unit/
├── integration/
├── fixtures/
└── helpers/
```

Responsabilidades:

- `tests/unit/`: testes determinísticos e isolados de nível A/B.
- `tests/integration/`: SQLite, filesystem, loopback e integrações locais.
- `tests/fixtures/`: dados artificiais e material não produtivo usados pelos testes.
- `tests/helpers/`: utilitários compartilhados de ambiente, temporários e doubles.

Nenhum teste foi criado neste passo e nenhum script do `package.json` foi alterado.

## 2.3/6 — Scripts de teste no package.json

O `package.json` agora possui três comandos oficiais:

```json
"test": "set ELECTRON_RUN_AS_NODE=1&& electron --test \"tests/unit/**/*.test.js\" \"tests/integration/**/*.test.js\"",
"test:unit": "set ELECTRON_RUN_AS_NODE=1&& electron --test \"tests/unit/**/*.test.js\"",
"test:integration": "set ELECTRON_RUN_AS_NODE=1&& electron --test \"tests/integration/**/*.test.js\""
```

### Comportamento

- `npm test`: executa testes unitários e de integração.
- `npm run test:unit`: executa somente `tests/unit/**/*.test.js`.
- `npm run test:integration`: executa somente `tests/integration/**/*.test.js`.

`ELECTRON_RUN_AS_NODE=1` faz o executável do Electron funcionar como runtime
Node durante os testes. Em um ambiente com dependências instaladas, o npm
resolve `electron` pelo binário local em `node_modules/.bin`.

A sintaxe dos globs foi validada no runtime Electron 43.4.1 / Node 24.18.1
com dois testes temporários fora da árvore do projeto: um unitário e um de
integração, ambos aprovados.

Os scripts legados `phase1:selftest` e `phase2:db-selftest` foram mantidos
sem alteração neste passo, mesmo que os arquivos a que apontam não estejam
presentes nesta release.

## 2.4/6 — Helpers básicos

Foram criados três helpers reutilizáveis em `tests/helpers/`.

### temp-dir.js

Responsabilidades:

- criar diretórios temporários isolados;
- manter registro dos diretórios criados pelo próprio helper;
- recusar remoção de caminhos que não tenham sido criados por ele;
- garantir limpeza em `finally` com `withTempDir(...)`.

Exports:

- `createTempDir`
- `removeTempDir`
- `withTempDir`

### fake-safe-storage.js

Fornece uma implementação controlada da interface usada pelo Electron
`safeStorage`:

- `isEncryptionAvailable()`
- `encryptString(...)`
- `decryptString(...)`

Esse helper **não fornece criptografia real** e existe exclusivamente para
testes. Ele permite exercitar os fluxos de token/certificado sem usar o
SafeStorage ou credenciais reais do Windows.

Export:

- `createFakeSafeStorage`

### loopback-http-server.js

Cria um servidor HTTP efêmero para testes de transporte:

- escuta exclusivamente em `127.0.0.1`;
- usa porta dinâmica do sistema;
- limita o tamanho do corpo recebido;
- fornece `origin`, `url(...)` e `close()`;
- permite respostas controladas pelo teste sem acessar produção.

Exports:

- `LOOPBACK_HOST`
- `startLoopbackHttpServer`

### Validação realizada

Os helpers foram carregados e exercitados pelo runtime escolhido
Electron 43.4.1 / Node 24.18.1:

- criação e remoção segura de diretório temporário: OK;
- round-trip do SafeStorage fake: OK;
- abertura e fechamento de listener em 127.0.0.1: OK.

Nenhum caso de teste permanente foi criado neste passo; o smoke test oficial
da infraestrutura pertence ao passo 2.5/6.

## 2.5/6 — Smoke test da infraestrutura

Foram criados dois testes permanentes de infraestrutura.

### tests/unit/infrastructure-smoke.test.js

Valida:

- carregamento de `node:test`;
- carregamento de `node:assert/strict`;
- execução CommonJS pelo runner.

### tests/integration/infrastructure-smoke.test.js

Valida sem usar recursos reais do usuário:

- criação, escrita e limpeza de diretório temporário;
- round-trip pelo SafeStorage fake;
- abertura de servidor HTTP somente em `127.0.0.1`;
- requisição HTTP real contra o servidor loopback;
- encerramento limpo do listener.

### Resultado real

Execução unitária:

- testes: 1
- aprovados: 1
- falhas: 0

Execução de integração:

- testes: 1
- aprovados: 1
- falhas: 0

Execução combinada pelos mesmos globs configurados no `package.json`:

- testes: 2
- aprovados: 2
- falhas: 0
- cancelados: 0
- ignorados: 0

A execução foi feita com o runtime instalado do e-fisco em modo
`ELECTRON_RUN_AS_NODE=1`, usando Electron 43.4.1 / Node 24.18.1, porque a
árvore da release ainda não possui `node_modules` local.

O smoke test prova que o runner descobre os arquivos `*.test.js`, executa
testes unitários e de integração e que os helpers básicos funcionam.

## 2.6/6 — Validação limpa e documentação final

A infraestrutura criada nos passos 2.1 a 2.5 foi validada como conjunto.

### Validações estruturais

Foram confirmados:

- 3 helpers carregando corretamente em CommonJS;
- 3 scripts de teste presentes no `package.json`;
- `package.json` válido;
- nenhuma dependência nova adicionada;
- `package-lock.json` não precisou ser alterado;
- `tests/` não faz parte da lista `build.files` usada pelo pacote de produção;
- nenhum diretório temporário `efisco-smoke-*`, `efisco-helper-check-*` ou
  `e-fisco-test-*` permaneceu após as execuções;
- arquivos temporários usados na própria validação foram removidos.

### Execução final

A validação foi repetida usando `Start-Process -Wait -PassThru` para obter o
`ExitCode` real do executável Electron no Windows.

#### Unitários

- testes: 1
- aprovados: 1
- falhas: 0
- exit code: 0

#### Integração

- testes: 1
- aprovados: 1
- falhas: 0
- exit code: 0

#### Execução completa

- testes: 2
- aprovados: 2
- falhas: 0
- cancelados: 0
- ignorados: 0
- exit code: 0

### Como executar

Em um ambiente de desenvolvimento com Node/npm e as dependências instaladas:

```powershell
npm test
npm run test:unit
npm run test:integration
```

Os scripts usam o executável local do Electron como Node por meio de
`ELECTRON_RUN_AS_NODE=1`.

Na máquina usada para esta validação não há `node`/npm no `PATH` e a árvore
da release não possui `node_modules`. Por isso a validação equivalente foi
executada com o `e-fisco.exe` instalado, que contém exatamente Electron
43.4.1 / Node 24.18.1.

Em uma árvore de desenvolvimento preparada com `npm ci`, o npm resolve o
comando `electron` pela dependência local declarada no projeto.

### Convenção estabelecida

A partir desta etapa:

- testes unitários ficam em `tests/unit/**/*.test.js`;
- testes de integração ficam em `tests/integration/**/*.test.js`;
- fixtures não produtivas ficam em `tests/fixtures/`;
- helpers compartilhados ficam em `tests/helpers/`;
- testes não devem acessar produção por padrão;
- SQLite e filesystem devem usar temporários;
- credenciais/certificados reais do usuário não devem ser usados;
- rede deve ser substituída por loopback/doubles sempre que possível.

A infraestrutura está pronta para a próxima etapa: recuperação/substituição
dos self-tests ausentes e início da cobertura real dos contratos P0/P1.

## Estado da Etapa 2

- [x] 2.1 — runner definido e compatibilidade verificada
- [x] 2.2 — estrutura de diretórios criada
- [x] 2.3 — scripts de teste no package.json
- [x] 2.4 — helpers básicos criados e validados
- [x] 2.5 — smoke test criado e aprovado
- [x] 2.6 — validação limpa e documentação final

**Etapa 2 — infraestrutura de testes: CONCLUÍDA.**


# Etapa 3 — Recuperação/substituição dos self-tests

## 3.1/6 — Fontes históricas localizadas e estratégia de recuperação

A busca cobriu a release 1.0.41, Downloads, Documents e os backups históricos
do e-fisco disponíveis na máquina.

### Resultado sobre os arquivos originais

Os arquivos abaixo **não foram encontrados** em nenhuma árvore-fonte ou pacote
instalado disponível:

- `phase1-selftest.js`
- `phase2-db-selftest.js`

Foram encontradas apenas referências históricas aos dois scripts em
`package.json` da 1.0.34, além das referências que ainda existem no
`package.json` atual.

Também foram inspecionados **8 arquivos app.asar históricos** da 1.0.34.
Nenhum continha os self-tests; o único arquivo de fase semelhante na raiz era
`phase2-pair-device.js`.

Não foram encontrados testes antigos baseados em `assert` nas árvores-fonte
preservadas. Portanto, a estratégia correta é reconstruir os self-tests a
partir dos contratos reais, e não tentar restaurar um arquivo que não está
preservado.

### Fase 1 — standby/rollback

Fonte histórica principal:

`C:\Users\<USER>\Documents\e-fisco-backups\before-step41-homolog-install-20260917\app.asar\offline-standby.js`

Comparação com a 1.0.41:

- tamanho antigo: 50.716 bytes;
- tamanho atual: 50.716 bytes;
- SHA-256 antigo:
  `4368cbe07a8f6173f719bd8b94e813277b9af05630a9891b59a2f31510cdc500`;
- SHA-256 atual: o mesmo;
- exports públicos: o mesmo conjunto;
- `phase1Revision`: `slot-rollback-v1` tanto na 1.0.34 quanto na 1.0.41.

Conclusão: o módulo de standby preservado é **byte a byte idêntico** ao atual.
O passo 3.2 pode reconstruir o self-test da Fase 1 diretamente contra o módulo
1.0.41 com alta confiança de compatibilidade histórica.

### Fase 2 — banco

Fontes históricas principais:

- `before-step41-homolog-install-20260917\app.asar\offline-db.js`;
- `before-open-cash-reader-1.0.34\offline-db.js`.

Comparação:

- schema histórico: **6**;
- schema atual: **13**;
- tamanho do módulo histórico usado na comparação: 79.749 bytes;
- tamanho atual: 231.426 bytes;
- hashes diferentes;
- a API pública atual possui credenciais, crediário, perfil/numeração fiscal,
  documento NFC-e e outbox fiscal que não existiam no contrato antigo.

`phase2Revision` continua `device-pairing-client-argv-v2`, mas isso não
significa que o banco permaneceu igual.

Conclusão: o passo 3.3 deve **reconstruir** o self-test de banco para schema 13,
preservando cenários históricos relevantes (inicialização, migrations,
transações e rollback), mas sem copiar expectativas do schema 6.

### Manifesto de recuperação

Foi criado:

`tests/recovery-sources.json`

Esse arquivo registra de forma verificável:

- quais self-tests foram procurados;
- onde havia referências históricas;
- fontes históricas selecionadas;
- versões de schema;
- tamanhos e SHA-256;
- decisão de recuperação para standby e banco.



## 3.2/6 — Self-test da Fase 1 reconstruído

Foi criado na raiz da release:

`phase1-selftest.js`

O script foi reconstruído contra o contrato atual de
`offline-standby.js`, cuja implementação é byte a byte idêntica à cópia
histórica preservada da 1.0.34.

### Cobertura reconstruída

O self-test verifica:

- comparação de versões;
- rejeição de manifesto desktop inválido;
- validação do `standby-package.json`;
- leitura de ZIP local;
- extração segura do pacote standby;
- criação da estrutura `offline-standby/`;
- criação e leitura do `state.json`;
- preparação artificial dos slots A e B;
- validação e ativação do slot A;
- ativação do slot B com A migrando para `ROLLBACK_READY`;
- validação do slot de rollback;
- rollback real de B para A;
- estado final consistente após rollback.

O ZIP usado pelo teste é construído inteiramente em memória pelo próprio
script, sem download e sem dependência de pacote externo.

### Isolamento

Toda a execução ocorre dentro de diretório temporário criado pelo helper da
Etapa 2. Nenhum `userData` real do aplicativo é utilizado.

### Resultado real

Executado com Electron 43.4.1 / Node 24.18.1 em
`ELECTRON_RUN_AS_NODE=1`:

- resultado: `phase1-selftest: OK`;
- exit code: 0;
- diretórios temporários residuais: 0.

O script continua autônomo neste passo. A integração formal com a suíte
`node:test` será feita no passo 3.4/6.



## 3.3/6 — Self-test de banco da Fase 2 reconstruído

Foi criado na raiz da release:

`phase2-db-selftest.js`

O script foi reconstruído diretamente contra o contrato atual de
`offline-db.js` e contra o schema 13. Nenhuma expectativa do schema histórico
6 foi reutilizada sem validação.

### Cobertura reconstruída

O self-test verifica:

- `OFFLINE_DB_SCHEMA_VERSION = 13`;
- aplicação sequencial das migrations 1 até 13;
- criação do arquivo `offline-data/e-fisco-offline.db` em `userDataDir`
  temporário;
- `PRAGMA journal_mode = WAL`;
- `PRAGMA foreign_keys = ON`;
- `PRAGMA busy_timeout = 5000`;
- reaproveitamento da conexão já aberta;
- fechamento e reabertura do mesmo banco;
- persistência de sessão de caixa;
- persistência de movimento de caixa;
- idempotência de abertura de caixa;
- idempotência de movimento de caixa;
- criação/idempotência de operação de outbox;
- presença da operação em `listOutboxReady`;
- rollback atômico de `registerOfflineSaleAtomic` quando a alocação fiscal
  falha depois do início da transação;
- ausência da venda e do outbox após o rollback;
- persistência correta dos dados válidos após reabertura;
- `PRAGMA integrity_check = ok`.

### Prova de rollback

O teste inicia uma venda com item válido, mas informa um
`fiscalAllocation.leaseId` inexistente. A falha acontece já dentro da
transação de venda, após o início do fluxo de persistência.

Depois da exceção, o self-test confirma:

- `getSaleById(...)` retorna `null`;
- `getOutboxOperation(...)` retorna `null`;
- a tabela `sales` não contém a venda.

Isso comprova o `ROLLBACK` da operação atômica sem modificar dados reais.

### Isolamento

Todo o SQLite é criado sob um diretório temporário exclusivo do teste.
O banco real do e-fisco não é aberto, lido ou modificado.

### Resultado real

Executado com Electron 43.4.1 / Node 24.18.1 em
`ELECTRON_RUN_AS_NODE=1`:

- resultado: `phase2-db-selftest: OK`;
- exit code: 0;
- diretórios temporários residuais: 0.

O script permanece autônomo neste micropasso. A integração com a suíte
`node:test` continua reservada ao passo 3.4/6.



## 3.4/6 — Integração dos self-tests com node:test

Os dois self-tests reconstruídos foram convertidos em módulos reutilizáveis,
sem perder a execução direta pela linha de comando.

### Alterações nos scripts raiz

`phase1-selftest.js` agora exporta:

- `runPhase1SelfTest()`

`phase2-db-selftest.js` agora exporta:

- `runPhase2DbSelfTest()`

Ambos usam `require.main === module` para manter o comportamento autônomo
quando executados diretamente, mas não iniciam automaticamente quando
importados por outro teste.

### Wrappers node:test

Foram criados:

- `tests/integration/phase1-selftest.test.js`
- `tests/integration/phase2-db-selftest.test.js`

Esses wrappers chamam diretamente as funções reconstruídas. Assim, existe
uma única implementação dos cenários e a suíte oficial não duplica lógica.

Os globs já definidos no `package.json` incluem automaticamente esses
arquivos; não foi necessário criar um segundo sistema de scripts.

### Validação da integração

Execução de `tests/integration/**/*.test.js`:

- testes: 3;
- aprovados: 3;
- falhas: 0;
- exit code: 0.

Os três testes são:

1. smoke test dos helpers;
2. self-test reconstruído da Fase 1;
3. self-test reconstruído do SQLite/Fase 2.

Execução completa de unitários + integração:

- testes: 4;
- aprovados: 4;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- exit code: 0.

Após ambas as execuções, não existiam diretórios temporários residuais dos
self-tests.

A compatibilidade direta também foi revalidada após a modularização:

- `phase1-selftest.js`: OK, exit code 0;
- `phase2-db-selftest.js`: OK, exit code 0;
- temporários residuais após as execuções diretas: 0.



## 3.5/6 — Execução repetida e aprovação de estabilidade

A infraestrutura integrada foi executada em **3 ciclos consecutivos**.

Cada ciclo executou, nesta ordem:

1. `phase1-selftest.js` diretamente;
2. `phase2-db-selftest.js` diretamente;
3. suíte completa `node:test` com unitários + integração.

### Resultado por ciclo

Em todos os 3 ciclos:

- self-test da Fase 1: OK;
- self-test da Fase 2: OK;
- suíte completa: 4 testes;
- aprovados: 4;
- falhas: 0;
- exit codes diferentes de zero: 0;
- temporários residuais: 0.

No total foram executadas 9 invocações de validação:

- 3 execuções diretas da Fase 1;
- 3 execuções diretas da Fase 2;
- 3 execuções da suíte completa.

Nenhuma falha intermitente foi observada e nenhuma correção de código foi
necessária neste passo.

O resultado foi registrado também em `tests/recovery-sources.json` como
`stabilityValidation`.



## 3.6/6 — Limpeza dos scripts legados e documentação final

Os scripts históricos do `package.json` foram alinhados ao runtime de testes
definido na Etapa 2.

Antes:

```json
"phase1:selftest": "node phase1-selftest.js",
"phase2:db-selftest": "node phase2-db-selftest.js"
```

Depois:

```json
"phase1:selftest": "set ELECTRON_RUN_AS_NODE=1&& electron phase1-selftest.js",
"phase2:db-selftest": "set ELECTRON_RUN_AS_NODE=1&& electron phase2-db-selftest.js"
```

Isso remove a dependência de um executável `node` separado no `PATH` e faz
os comandos usarem o mesmo runtime Electron/Node adotado pela suíte oficial.

### Validação exata dos scripts do package.json

Foram executados os comandos exatamente como estão definidos no
`package.json`, usando um shim temporário de `electron` apontando para o
runtime instalado:

- `phase1:selftest`: exit code 0;
- `phase2:db-selftest`: exit code 0;
- `test:unit`: 1/1 aprovado, exit code 0;
- `test:integration`: 3/3 aprovados, exit code 0;
- `test`: 4/4 aprovados, exit code 0.

O shim temporário foi removido após a validação e não ficaram diretórios
temporários residuais.

### Empacotamento

O projeto já usa uma lista explícita em `build.files`. Essa lista inclui
somente os arquivos necessários para a aplicação e não inclui:

- `tests/**`;
- `TESTING.md`;
- `phase1-selftest.js`;
- `phase2-db-selftest.js`.

Portanto, a infraestrutura de desenvolvimento e os self-tests reconstruídos
não entram no aplicativo de produção/NSIS atual.

### Resultado da Etapa 3

A release 1.0.41 passou de dois scripts quebrados que apontavam para arquivos
ausentes para uma estrutura verificável em que:

- os dois self-tests existem;
- os dois funcionam de forma autônoma;
- os dois também fazem parte da suíte `node:test`;
- o self-test de standby cobre ativação e rollback;
- o self-test de banco cobre schema 13, migrations, persistência e rollback;
- os testes são isolados de dados reais;
- a suíte integrada passou repetidamente sem flakiness observada;
- os comandos do `package.json` estão coerentes com o runtime real.

## Estado da Etapa 3

- [x] 3.1 — fontes históricas localizadas e estratégia definida
- [x] 3.2 — self-test da Fase 1 reconstruído e aprovado
- [x] 3.3 — self-test de banco da Fase 2 reconstruído e aprovado
- [x] 3.4 — self-tests integrados ao node:test
- [x] 3.5 — execução repetida concluída sem falhas
- [x] 3.6 — scripts legados alinhados e documentação final

**Etapa 3 — recuperação/substituição dos self-tests: CONCLUÍDA.**


# Etapa 4 — Testes de funções puras

## 4.1/6 — Valores, dinheiro e quantidades

Foi criado:

`tests/unit/value-money-quantity.test.js`

O arquivo adiciona **12 testes unitários** para:

- `decimalToCents`;
- `centsToValue`;
- `moneyCentsFromDecimal`;
- `quantitySnapshot`;
- `roundedLineTotalCentavos`.

### Casos cobertos

A cobertura inclui:

- conversão de reais para centavos;
- valores recebidos como número e string numérica;
- casos clássicos de ponto flutuante como `1.005` e `2.675`;
- valores negativos permitidos para ajuste de caixa;
- rejeição de negativos quando não permitidos;
- rejeição de `NaN` e `Infinity`;
- proteção contra valores acima de `Number.MAX_SAFE_INTEGER`;
- quantidades representadas em microunidades;
- serialização canônica da quantidade em até seis casas decimais;
- arredondamento de quantidade na sexta casa;
- rejeição de quantidade zero, negativa e menor que uma microunidade após arredondamento;
- cálculo de total da linha com `BigInt`;
- arredondamento de meio centavo para cima;
- proteção contra total de item acima do inteiro seguro;
- consistência entre quantidade, preço unitário e total da linha.

### Isolamento das funções puras de venda

A primeira execução mostrou que importar `offline-sale-service.js` para testar
somente três cálculos puxava também o pipeline fiscal completo e,
consequentemente, dependências externas como `@xmldom/xmldom`.

Para manter o teste realmente unitário foi criado:

`offline-sale-values.js`

Esse módulo não depende de SQLite, Electron, rede, certificado ou pacotes
externos e concentra:

- `moneyCentsFromDecimal`;
- `quantitySnapshot`;
- `roundedLineTotalCentavos`.

`offline-sale-service.js` passou a importar e reexportar essas mesmas
funções, preservando sua API pública. A identidade dos três reexports foi
validada contra o módulo extraído.

Como `build.files` é explícito, `offline-sale-values.js` também foi
adicionado à lista do pacote de produção para evitar quebra no aplicativo
empacotado.

### Bug encontrado e corrigido

O novo teste revelou uma assimetria em `decimalToCents` quando
`allowNegative=true`:

- `1.005` resultava em `101` centavos;
- `-1.005` resultava em `-100` centavos.

A causa era o comportamento de `Math.round` para valores negativos.

A conversão agora arredonda primeiro a magnitude absoluta e reaplica o sinal.
Com isso:

- `1.005 -> 101`;
- `-1.005 -> -101`.

O comportamento para valores positivos e para negativos não permitidos foi
preservado.

### Resultado real

Suíte unitária após a correção:

- testes: 13;
- aprovados: 13;
- falhas: 0;
- exit code: 0.

Os 13 incluem o smoke test unitário da infraestrutura e os 12 novos testes.

Suíte completa após a alteração:

- testes: 16;
- aprovados: 16;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- exit code: 0.

A validação adicional confirmou que `offline-sale-service.js` continua
reexportando exatamente as três implementações de `offline-sale-values.js`.

Não ficaram arquivos temporários `.step41-*` após a execução.



## 4.2/6 — Produtos e normalização de busca

Foi criado:

`tests/unit/product-normalization.test.js`

O arquivo adiciona **12 testes unitários** para:

- `normalizeSearch`;
- `mapProductForSale`;
- `productAvailableQuantity`.

### Casos cobertos

`normalizeSearch`:

- remoção de acentos;
- normalização de espaços repetidos;
- conversão para minúsculas;
- entradas `null`, `undefined` e vazias;
- valores não-string convertidos de forma determinística;
- preservação de pontuação e dígitos relevantes para códigos e descrições.

`mapProductForSale`:

- produto ausente retorna `null`;
- trim de ID, descrição, código e GTIN;
- normalização de unidade para maiúsculas;
- conversão de `precoCentavos` para valor decimal;
- mapeamento de NCM, CFOP e imagem;
- payload ausente;
- preço ausente preservado como `null`;
- campo `ativo` aceito somente quando é boolean `true`.

`productAvailableQuantity`:

- estoque base inteiro e fracionário;
- precisão de seis casas decimais;
- deltas pendentes expressos em microunidades;
- deltas positivos e negativos;
- clamp em zero quando o delta levaria o estoque abaixo de zero;
- base negativa ou inválida tratada como zero;
- delta não finito ignorado;
- garantia de que o produto de entrada não é mutado.

### Arquitetura

Diferentemente do 4.1, não foi necessária extração adicional de módulo.
`offline-product-service.js` pôde ser importado diretamente no runtime de
teste atual sem carregar dependências externas ausentes.

Nenhuma mudança de comportamento em produção foi necessária neste passo,
porque todos os contratos testados passaram como implementados.

### Resultado real

Suíte unitária:

- testes: 25;
- aprovados: 25;
- falhas: 0;
- exit code: 0.

Os 25 incluem:

- 1 smoke test unitário da infraestrutura;
- 12 testes de valores/dinheiro/quantidades do 4.1;
- 12 testes de produtos/normalização do 4.2.

Suíte completa:

- testes: 28;
- aprovados: 28;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- exit code: 0.

Não ficaram arquivos temporários `.step42-*` após a execução.

## Etapa 4.3 — pagamentos e montagem de venda

Arquivo de teste criado:

- `tests/unit/payment-sale-input.test.js`

Contratos exercitados:

`normalizePaymentParts`:

- aliases `method`, `metodo` e `paymentMethod`;
- normalização da forma de pagamento para maiúsculas;
- conversão determinística dos valores para centavos;
- fallback para `sale.paymentMethod` quando não há divisão;
- rejeição de forma de pagamento ausente;
- rejeição de pagamento zero;
- rejeição quando a soma dos pagamentos difere do total da venda.

`buildOfflineSaleAtomicInput`:

- montagem de item com quantidade, preço unitário e total em centavos;
- venda com pagamento dividido entre PIX e DINHEIRO;
- criação de movimentos financeiros para cada parte;
- criação de movimento de caixa somente para DINHEIRO;
- dependência da operação de abertura de caixa;
- caixa obrigatório para venda normal, inclusive pagamento não-dinheiro;
- rejeição de total declarado divergente da soma dos itens;
- validação de cliente ativo;
- liquidação de crediário por PIX sem caixa físico;
- preservação das dependências e do estado de liquidação do crediário.

`buildOfflineCrediarioAtomicInput`:

- cliente e produto resolvidos por lookups em memória;
- normalização de CPF e WhatsApp para dígitos;
- conversão de vencimento DD/MM/AAAA para ISO;
- montagem de item fracionário;
- total do crediário em centavos;
- rejeição de CPF com quantidade de dígitos inválida;
- rejeição de data de vencimento impossível.

### Arquitetura/testabilidade

Para permitir testes unitários sem abrir SQLite nem carregar o pipeline fiscal
desnecessariamente, `offline-sale-service.js` recebeu duas mudanças pequenas:

- o pipeline fiscal passou a ser carregado de forma lazy apenas quando
  `runOfflinePaidSaleFiscalPipeline` é realmente usado;
- os builders aceitam lookups opcionais via `options` para produto, cliente
  e dados de crediário, mantendo como default exatamente as funções atuais de
  produção do `offline-db`.

A assinatura pública dos builders foi preservada e os defaults de produção
continuam os mesmos.

### Resultado real

Smoke de exportação:

- `normalizePaymentParts=function`;
- `buildOfflineSaleAtomicInput=function`;
- `buildOfflineCrediarioAtomicInput=function`;
- exit code: 0.

Suíte unitária:

- testes: 36;
- aprovados: 36;
- falhas: 0;
- exit code: 0.

Os 36 incluem:

- 1 smoke test unitário da infraestrutura;
- 12 testes de valores/dinheiro/quantidades do 4.1;
- 12 testes de produtos/normalização do 4.2;
- 11 testes de pagamentos/montagem de venda do 4.3.

Suíte completa:

- testes: 39;
- aprovados: 39;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Não ficaram arquivos temporários `.step43-*` após a execução.

## Etapa 4.4 — outbox e políticas de retry

Arquivo de teste criado:

- `tests/unit/outbox-retry-policy.test.js`

Contratos exercitados:

`retryDelayForAttempt`:

- sequência padrão de 5s, 15s, 60s, 5min e 15min;
- saturação na última faixa para tentativas posteriores;
- delays customizados com piso de 1 segundo;
- tentativas ausentes, zero, negativas e não numéricas;
- tentativa fracionária normalizada antes de indexar a tabela.

`retryAtForOperation`:

- cálculo determinístico de `nextAttemptAt`;
- uso do backoff da tentativa atual;
- respeito a `retryAfterMs` explícito;
- `retryAfterMs=0` permitindo retry imediato;
- fallback para backoff quando `retryAfterMs` é inválido;
- rejeição de data de referência inválida.

`normalizeTransportResult`:

- ausência de resultado tratada como confirmação vazia;
- normalização dos status de transporte;
- preservação de ACK, erro e `retryAfterMs`;
- rejeição de resultado primitivo;
- rejeição de status desconhecido.

`normalizeServerResult`:

- HTTP 2xx como `CONFIRMED`;
- HTTP 409 como `CONFLICT`;
- HTTP 401/403 como `MANUAL_REVIEW` com `authFailure=true`;
- HTTP 422 como `MANUAL_REVIEW`;
- HTTP 408/425/429 e 5xx como `RETRY`;
- conversão de `Retry-After` em segundos para milissegundos;
- respeito a status e `retryAfterMs` explícitos do servidor.

### Correção encontrada

`retryDelayForAttempt` indexava diretamente a tabela usando
`Number(attempts) - 1`. Para valores fracionários ou não numéricos isso
podia gerar índice como `0.5` ou `NaN` e retornar `undefined`.

O helper agora normaliza `attempts` para inteiro finito maior ou igual a 1
antes de calcular o índice. As tentativas inteiras normais vindas do SQLite
mantêm exatamente o mesmo comportamento.

### Resultado real

Suíte unitária:

- testes: 49;
- aprovados: 49;
- falhas: 0;
- exit code: 0.

Os 49 incluem:

- 36 testes existentes até o 4.3;
- 13 testes novos de outbox/retry do 4.4.

Suíte completa:

- testes: 52;
- aprovados: 52;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Não ficaram arquivos temporários `.step44-*` após a execução.

## Etapa 4.5 — fiscal, versões e transformações determinísticas

Novo módulo puro:

- `offline-fiscal-values.js`

Arquivo de teste criado:

- `tests/unit/fiscal-deterministic-values.test.js`

### Extração de lógica determinística

Foram extraídos para um módulo sem SQLite, DOM, certificado ou rede:

- normalização do nome da forma de pagamento;
- formatação e parsing monetário fiscal;
- quantidade fiscal com até quatro casas significativas;
- percentuais com quatro casas;
- cálculo de tributo em centavos usando `BigInt`;
- decisão de obrigatoriedade RTC por CRT/ano;
- conversão determinística de data/hora para `-03:00`;
- derivação AAMM da data fiscal;
- versão e montagem dos campos do QR Code v3;
- montagem determinística da URL do QR Code;
- namespace SHA-256 versionado da intenção de lease fiscal;
- política de reposição da numeração fiscal;
- validação/versionamento da intenção persistida.

Os módulos de produção passaram a consumir os mesmos helpers:

- `offline-fiscal-nfce-xml.js`;
- `offline-fiscal-nfce-qrcode.js`;
- `offline-fiscal-number-maintenance.js`.

O novo arquivo já é incluído no instalador pelo padrão existente
`offline-fiscal-*.js`, sem necessidade de ampliar manualmente `build.files`.

### Contratos exercitados

Transformações NFC-e/RTC:

- normalização de CRÉDITO/DÉBITO/PIX;
- centavos para decimal sem ponto flutuante;
- decimal com ponto ou vírgula para centavos;
- rejeição de arredondamento monetário silencioso;
- quantidade fiscal sem arredondamento silencioso;
- percentuais normalizados em quatro casas;
- transição RTC do CRT=1 em 2027;
- cálculo de tributo em centavos com arredondamento inteiro;
- conversão de instantes para o fuso `-03:00`;
- derivação AAMM usada na chave fiscal.

QR Code v3:

- constante de versão `3`;
- ordem determinística dos sete campos anteriores à assinatura;
- inclusão de `p` com e sem query preexistente;
- suporte a base terminando em `p=`;
- rejeição de parâmetro `p` já preenchido;
- rejeição de sequência inválida para CDATA.

Versionamento da numeração fiscal:

- namespace estável com prefixo `fiscal.numberLease.intent.v1:`;
- isolamento por empresa/device/série;
- defaults de threshold, quantidade e intervalo de retry;
- validação dos limites da política;
- versão de intenção igual a 1;
- validação do namespace;
- validação de `requestId`;
- detecção de mudança de quantidade enquanto há intenção pendente;
- normalização do contador de tentativas.

### Compatibilidade da extração

A lógica extraída foi mantida equivalente à implementação anterior.
Em particular:

- `buildQrUrl` preserva a mesma montagem usada pelo fluxo fiscal;
- a manutenção de numeração continua aceitando textos não vazios com a mesma
  semântica anterior;
- as constantes públicas de `offline-fiscal-number-maintenance.js`
  continuam exportadas com os mesmos valores.

### Resultado real

Verificação de sintaxe:

- `offline-fiscal-values.js`: exit code 0;
- `offline-fiscal-nfce-xml.js`: exit code 0;
- `offline-fiscal-nfce-qrcode.js`: exit code 0;
- `offline-fiscal-number-maintenance.js`: exit code 0.

Smoke dos módulos fiscais reais, usando as dependências do aplicativo instalado:

- módulo puro carregado;
- gerador XML carregado;
- finalizador do QR Code carregado;
- manutenção de lease fiscal carregada;
- constantes compartilhadas consistentes;
- exit code: 0.

Suíte unitária:

- testes: 65;
- aprovados: 65;
- falhas: 0;
- exit code: 0.

Os 65 incluem:

- 49 testes existentes até o 4.4;
- 16 testes novos de fiscal/versões/transformações do 4.5.

Suíte completa:

- testes: 68;
- aprovados: 68;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Não ficaram arquivos temporários `.step45-*` após a execução.

## Etapa 4.6 — execução completa e consolidação da cobertura P0

Arquivo de consolidação criado:

- `tests/unit/p0-core-contracts.test.js`

O arquivo adiciona **16 testes** para contratos P0 que ainda não estavam
cobertos explicitamente nos passos 4.1 a 4.5.

### Identidade e pareamento

Coberto:

- `normalizeDeviceId`;
- `normalizeEmpresaId`;
- `normalizeDeviceToken`;
- `normalizePairingCode`;
- limites mínimos/máximos;
- rejeição de caracteres/formas inválidas;
- trim determinístico das entradas.

### Sync

Coberto:

- `operationEnvelope`;
- `protocolVersion=1`;
- defaults de payload, dependências, tentativas e device;
- rejeição de campos obrigatórios ausentes;
- `referencePullPayload`;
- limite máximo de 250;
- normalização de cursores;
- flags `completed` estritamente booleanas;
- contador fiscal apenas para modelo 65, série válida e próximo número positivo;
- rejeição de cursor acima de 256 caracteres.

A normalização de respostas HTTP, classificação de retry/conflito/revisão e
`Retry-After` já havia sido coberta no 4.4.

### Standby e versões

Coberto:

- `compareVersions`;
- `validateManifest`;
- versão do formato do manifesto;
- schema positivo;
- SHA-256 do pacote;
- `validateStandbyPackageManifest`;
- tipo do pacote e compatibilidade de versões/schema;
- `evaluateCompatibility`;
- versão mínima do Electron;
- versão mínima do core offline;
- estado `standbyReady`.

O self-test reconstruído da Fase 1 continua cobrindo a camada de
ativação/rollback com filesystem temporário.

### Fiscal

Coberto na camada determinística/P0:

- `validateCurrentSupportedSubset`;
- meios de pagamento suportados;
- NCM e demais classificações mínimas;
- transição de obrigatoriedade RTC em 2027;
- `validateProfile`;
- produção/PA/CRT=1;
- CNPJ, série, município e URLs;
- transformações monetárias/fiscais do 4.5;
- QR Code v3: versão, campos e montagem da URL;
- versionamento da intenção de lease fiscal.

### Limite explícito desta etapa

A Etapa 4 é a camada de **funções puras e contratos determinísticos**.
Não é registrada aqui uma falsa cobertura para contratos que precisam de
fixture criptográfica, filesystem/SQLite ou servidor controlado.

Permanecem para as camadas P1/P2 já previstas na arquitetura:

- geração e parse completo de XML NFC-e com fixture fiscal;
- assinatura/verificação XMLDSig com PFX não produtivo;
- geração/validação criptográfica completa do QR Code;
- montagem/parse de respostas SOAP SVRS com servidor controlado;
- transições reais da outbox persistida em SQLite;
- persistência de token/SafeStorage;
- certificado A1 e pipeline fiscal persistido ponta a ponta.

Esses itens não são considerados falhas da Etapa 4; pertencem às etapas de
integração local/controlada segundo a matriz de testabilidade.

### Matriz P0 consolidada da Etapa 4

| Grupo | Estado ao final da Etapa 4 |
| --- | --- |
| valores, dinheiro, quantidades e arredondamento | coberto |
| produtos e normalização | coberto |
| pagamentos e montagem determinística de venda | coberto |
| outbox: backoff e normalização de resultado | coberto |
| fiscal: regras/transformações determinísticas | coberto |
| identidade e pairing: normalizadores | coberto |
| sync: envelope, pull e resposta HTTP determinística | coberto |
| standby: versões, manifestos e compatibilidade | coberto |
| SQLite/filesystem/SafeStorage/certificado/rede controlada | P1/P2 |

### Execução final real

Suíte unitária:

- testes: 81;
- aprovados: 81;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Suíte de integração:

- testes: 3;
- aprovados: 3;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Self-test legado da Fase 1:

- `phase1-selftest: OK`;
- exit code: 0.

Self-test legado da Fase 2:

- `phase2-db-selftest: OK`;
- exit code: 0.

Suíte completa:

- testes: 84;
- aprovados: 84;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

A execução final usou `Start-Process -Wait -PassThru` para capturar o
exit code real do Electron no Windows.

Como a árvore da release não possui `node_modules`, a validação local
apontou `NODE_PATH` somente no ambiente do processo de teste para as
dependências já instaladas no aplicativo. Nenhum caminho da instalação foi
gravado no projeto.

Não ficaram resíduos:

- `.step46-*`: 0;
- `e-fisco-test-*`: 0;
- `efisco-smoke-*`: 0;
- `efisco-helper-check-*`: 0.

## Estado da Etapa 4

- [x] 4.1 — valores, dinheiro e quantidades
- [x] 4.2 — produtos e normalização de busca
- [x] 4.3 — pagamentos e montagem de venda
- [x] 4.4 — outbox e políticas de retry
- [x] 4.5 — fiscal, versões e transformações determinísticas
- [x] 4.6 — execução completa e consolidação da cobertura P0

**Etapa 4 — testes de funções puras: CONCLUÍDA.**


# Etapa 5 — SQLite e migrations

## 5.1/6 — schema e migrations atuais

O schema SQLite atual foi consolidado como contrato explícito.

### Manifesto de migrations

`offline-db.js` agora exporta:

- `OFFLINE_DB_SCHEMA_VERSION = 13`;
- `OFFLINE_DB_MIGRATIONS`.

O manifesto é imutável e registra a sequência oficial:

1. `offline-foundation`;
2. `offline-reference-cache`;
3. `offline-stock-ledger`;
4. `offline-sales-outbox`;
5. `offline-cash-financial-ledgers`;
6. `offline-outbox-state-machine`;
7. `offline-nfce-fiscal-foundation`;
8. `single-owner-nfce-numbering-legacy`;
9. `offline-crediario-reference-cache`;
10. `single-cashier-next-number-no-reservations`;
11. `offline-operator-credentials-cache`;
12. `offline-prepared-companies-registry`;
13. `offline-multi-company-provisioned-credentials`.

Nenhuma migration foi reescrita e a ordem de execução de produção não foi
alterada neste passo.

### Teste permanente

Foi criado:

- `tests/integration/db-schema-migrations.test.js`.

O teste usa somente diretório temporário e valida:

- manifesto contíguo de V1 a V13;
- última migration igual à versão atual do schema;
- aplicação real dos mesmos 13 nomes em `schema_migrations`;
- `applied_at` válido para todas as migrations;
- `offline_meta` com uma única linha e `schema_version=13`;
- conjunto exato das 22 tabelas atuais;
- todas as 22 tabelas de aplicação com modo SQLite `STRICT`.

Tabelas esperadas no schema V13:

- `cash_movements`;
- `cash_sessions`;
- `crediarios_cache`;
- `customers_cache`;
- `financial_movements`;
- `fiscal_number_leases`;
- `fiscal_outbox`;
- `fiscal_profile_cache`;
- `local_config`;
- `nfce_documents`;
- `offline_meta`;
- `offline_operator_credentials`;
- `offline_prepared_companies`;
- `offline_provisioned_credentials`;
- `products_cache`;
- `sale_items`;
- `sales`;
- `schema_migrations`;
- `stock_movements`;
- `stock_projection`;
- `suppliers_cache`;
- `sync_outbox`.

### Limite deste micropasso

O teste inicializa um banco temporário apenas para verificar o **schema final
de primeira criação**.

Não entram ainda neste passo:

- reabertura do mesmo arquivo;
- persistência entre fechamentos;
- upgrade de schemas históricos;
- rollback de transações de domínio;
- cenários de corrupção/incompatibilidade.

Esses pontos pertencem aos micropassos seguintes da Etapa 5.

### Resultado real

Teste específico do 5.1:

- testes: 5;
- aprovados: 5;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Suíte completa após a alteração:

- testes: 89;
- aprovados: 89;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Não ficaram resíduos:

- `.step51-*`: 0;
- `efisco-step51-*`: 0.

## 5.2/6 — criação e reabertura do SQLite em temporário

Foi criado:

- `tests/integration/db-open-reopen.test.js`.

O teste usa apenas diretórios temporários e cobre o ciclo de vida do singleton
SQLite.

### Primeira criação

Validado:

- criação de `offline-data/e-fisco-offline.db`;
- retorno `reused=false`;
- caminho retornado apontando para o arquivo esperado;
- schema V13;
- WAL habilitado;
- foreign keys habilitadas;
- `busy_timeout=5000`;
- cadeia completa de migrations disponível após a abertura.

### Reuso enquanto aberto

Uma segunda chamada para o mesmo caminho:

- retorna `reused=true`;
- mantém a mesma instância de `DatabaseSync`;
- preserva o caminho do arquivo;
- não reaplica migrations;
- aceita caminhos semanticamente equivalentes, como o mesmo diretório com
  segmento `.`.

### Fechamento e reabertura

Após `closeOfflineDatabase()`:

- `getOfflineDatabase()` volta a rejeitar acesso sem inicialização;
- o mesmo arquivo pode ser reaberto;
- a reabertura retorna `reused=false`;
- `created_at` original é preservado;
- `last_open_at` é atualizado;
- timestamps `applied_at` das 13 migrations permanecem os mesmos;
- `PRAGMA integrity_check` retorna `ok`.

### Bug encontrado e corrigido

Antes deste passo, se o singleton SQLite já estivesse aberto, uma chamada como:

`initializeOfflineDatabase({ userDataDir: outroDiretorio })`

ignorava o novo diretório e devolvia silenciosamente o banco já aberto com
`reused=true`.

Isso podia mascarar troca incorreta de contexto de armazenamento.

Agora:

- o caminho solicitado é resolvido e comparado com o arquivo já aberto;
- no Windows a comparação é case-insensitive;
- reuso só é permitido para o mesmo caminho efetivo;
- outro `userDataDir` gera erro explícito;
- o segundo diretório não é criado durante a tentativa rejeitada;
- após `closeOfflineDatabase()`, o outro diretório pode ser aberto
  normalmente.

A correção não altera o caminho normal do aplicativo quando ele continua
usando o mesmo `userDataDir`.

### Resultado real

Teste específico do 5.2:

- testes: 4;
- aprovados: 4;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Suíte completa após a alteração:

- testes: 93;
- aprovados: 93;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Não ficaram resíduos:

- `.step52-*`: 0;
- `efisco-step52-*`: 0.

## 5.3/6 — rollback e atomicidade das transações

Foi criado:

- `tests/integration/db-atomic-rollback.test.js`.

O teste provoca falhas artificiais **no último write** das transações usando
triggers temporários SQLite com `RAISE(ABORT)`. Esses triggers existem apenas
no banco temporário de teste e não alteram o schema de produção.

### Abertura atômica de crediário

`openCrediarioOfflineAtomic` foi exercitado com falha forçada ao inserir
`CREDIARIO_OPEN` na outbox, depois de a transação já ter tentado gravar:

- `crediarios_cache`;
- `stock_movements`;
- `stock_projection`.

Após o erro foi confirmado:

- conta de crediário inexistente;
- nenhum movimento de estoque parcial;
- nenhuma projeção de estoque parcial;
- nenhuma operação de outbox parcial.

### Edição atômica de itens do crediário

`updateCrediarioItemsOfflineAtomic` foi exercitado sobre uma conta real
temporária, aumentando a quantidade de um item e forçando falha no
`CREDIARIO_ITEMS_UPDATE` final.

Antes e depois da falha foram comparados:

- valores monetários da conta;
- `situacao_versao`;
- `payload_json`;
- quantidade de movimentos de estoque;
- `stock_projection`.

Todos permaneceram exatamente no estado anterior e a nova operação de outbox
não foi criada.

### Venda offline atômica

`registerOfflineSaleAtomic` foi exercitado com:

- venda;
- item;
- movimento de estoque;
- projeção de estoque;
- movimento financeiro;
- outbox `SALE_PAID`.

A falha foi forçada somente no `INSERT` final da outbox. Após o rollback foi
confirmada a ausência de:

- `sales`;
- `sale_items`;
- `stock_movements`;
- `stock_projection`;
- `financial_movements`;
- `sync_outbox`.

O trigger foi então removido e **a mesma venda, com os mesmos IDs**, foi
registrada com sucesso. Isso prova também que o rollback não deixou resíduos
de unicidade nem a conexão presa em transação.

### Resultado da análise

Nenhum bug de atomicidade foi encontrado nos três fluxos compostos testados.
As implementações atuais de `BEGIN IMMEDIATE / COMMIT / ROLLBACK` preservaram
o estado anterior mesmo com falha no fim da transação.

Neste micropasso não foi necessário alterar a lógica de produção de
`offline-db.js`; a alteração permanente é a nova cobertura de integração.

### Resultado real

Teste específico do 5.3:

- testes: 3;
- aprovados: 3;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Suíte completa após a alteração:

- testes: 96;
- aprovados: 96;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Não ficaram resíduos:

- `.step53-*`: 0;
- `efisco-step53-*`: 0.

## 5.4/6 — persistência de estoque, caixa, venda, crediário e outbox

Foi criado:

- `tests/integration/db-domain-persistence.test.js`.

O teste monta um cenário real completo em SQLite temporário, fecha totalmente a
conexão, reabre o mesmo arquivo e compara os snapshots antes/depois.

### Estoque

Foram persistidos três fluxos independentes:

- entrada direta de 2,5 unidades;
- saída de 1,5 unidade gerada por venda;
- saída de 2 unidades gerada por abertura de crediário.

Após a reabertura foram preservados:

- `stock_movements`;
- `stock_projection`;
- quantidades em microunidades;
- payloads, tipos e IDs das operações.

Projeções validadas:

- produto de estoque direto: `2.5`;
- produto da venda: `-1.5`;
- produto do crediário: `-2`.

### Caixa e financeiro

Foram persistidos:

- sessão de caixa aberta;
- saldo inicial de 2500 centavos;
- suprimento de 700 centavos;
- movimento de caixa da venda de 600 centavos;
- movimento financeiro `VENDA_PAGA` de 600 centavos.

Após o restart:

- a mesma sessão continua `OPEN`;
- `getOpenCashSession` resolve a mesma sessão;
- os dois movimentos de caixa permanecem;
- o movimento financeiro permanece íntegro.

### Venda

Foi registrada uma venda real com:

- cliente;
- item fracionário de `1.5`;
- total de 600 centavos;
- pagamento em dinheiro;
- movimento de estoque;
- movimento de caixa;
- movimento financeiro;
- outbox `SALE_PAID`.

Após a reabertura, `getSaleById` retornou exatamente o mesmo snapshot
persistido, inclusive item, payload e valores.

### Crediário

Foi aberta uma conta com:

- cliente;
- item;
- total de 1000 centavos;
- vencimento;
- movimento/projeção de estoque;
- outbox `CREDIARIO_OPEN`.

Após o restart, `getCrediarioDetailCache` retornou a mesma conta e o mesmo
item.

### Outbox

Foram validados três registros:

- `SALE_PAID` em `PENDING`;
- `CREDIARIO_OPEN` em `PENDING`;
- operação genérica convertida para `RETRY`.

A operação `RETRY` foi persistida com:

- `attempts=1`;
- `lastError='falha temporária step54'`;
- `nextAttemptAt='2026-09-25T09:50:00.000Z'`.

Todos os campos permaneceram iguais após fechar e reabrir o banco.

### Idempotência após restart

Um segundo cenário fechou/reabriu o banco e reapresentou os mesmos IDs para:

- movimento de estoque;
- movimento de caixa;
- abertura de crediário;
- venda;
- outbox genérica.

Todos foram reconhecidos como duplicados, sem criar novos registros nem alterar
os saldos existentes.

Isso confirma que as chaves de idempotência são persistentes e não dependem do
estado em memória do processo.

### Integridade

Após a reabertura:

- o snapshot completo dos domínios foi idêntico ao snapshot anterior ao close;
- `PRAGMA integrity_check` retornou `ok`.

### Resultado da análise

Nenhum bug de persistência foi encontrado nos fluxos exercitados.
Neste micropasso não foi necessário alterar a lógica de produção de
`offline-db.js`; a alteração permanente é a cobertura de integração.

### Resultado real

Teste específico do 5.4:

- testes: 2;
- aprovados: 2;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Suíte completa após a alteração:

- testes: 98;
- aprovados: 98;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Não ficaram resíduos:

- `.step54-*`: 0;
- `efisco-step54-*`: 0.

## 5.5/6 — upgrades de schema e compatibilidade entre versões

Foi criado:

- `tests/integration/db-schema-upgrade-compatibility.test.js`.

O teste constrói bancos históricos somente em diretórios temporários e valida
upgrades reais para o schema atual V13.

### Upgrade V5 -> V13

A fixture V5 preserva dados existentes em:

- produtos;
- venda e item;
- estoque e projeção;
- caixa e movimento;
- financeiro;
- outbox.

A fixture remove as estruturas posteriores à V5 e também recria o contrato
antigo da `sync_outbox`, sem as quatro colunas adicionadas pela V6.

Após abrir com a versão atual foi confirmado:

- migrations V1..V5 não foram reaplicadas;
- os `applied_at` originais de V1..V5 foram preservados;
- V6..V13 foram aplicadas em sequência;
- `next_attempt_at`, `sending_started_at`, `confirmed_at` e
  `remote_ack_json` foram adicionadas;
- dados antigos de venda, caixa, estoque, financeiro e outbox permaneceram;
- tabelas fiscais, crediário e credenciais posteriores foram criadas.

### Upgrade V9 -> V13

Foi criada uma fixture V9 com estado histórico relevante para a migration V10:

- lease fiscal com `proximo_numero=2`;
- documento NFC-e real com número 7;
- tabela legada `fiscal_number_reservations`;
- intenção local legada
  `fiscal.numberLease.intent.v1:legacy-step55`.

Após o upgrade:

- a V10 reconciliou `proximo_numero` para 8;
- o documento fiscal número 7 foi preservado;
- a tabela legada de reservas foi removida;
- a intenção antiga foi removida de `local_config`;
- V11, V12 e V13 foram aplicadas normalmente.

### Upgrade V12 -> V13

A fixture V12 contém uma empresa já registrada em
`offline_prepared_companies`.

Após o upgrade:

- V1..V12 mantiveram seus timestamps originais;
- somente a V13 ficou pendente;
- o registro V12 permaneceu íntegro;
- `offline_provisioned_credentials` foi criada pela V13.

### Bug de compatibilidade encontrado e corrigido

Antes deste passo, `initializeOfflineDatabase` fazia:

1. configuração do SQLite;
2. execução de V1..V13;
3. `touchOpenMetadata`, que grava `schema_version=13`;
4. somente depois verificava a versão final.

Com isso, um arquivo criado por uma aplicação futura, por exemplo V14,
poderia ter seu `offline_meta.schema_version` sobrescrito para 13 antes da
checagem e acabar aceito como se fosse compatível.

Agora existe uma validação **antes de qualquer migration** que verifica:

- sequência contínua das migrations existentes;
- nomes das migrations contra `OFFLINE_DB_MIGRATIONS`;
- ausência de migration acima da V13;
- `offline_meta.schema_version` não maior que V13;
- consistência entre `offline_meta` e a última migration aplicada.

### Schema futuro

Uma fixture V14 foi criada com:

- `schema_migrations.version=14`;
- `offline_meta.schema_version=14`;
- tabela/marcador exclusivo da versão futura.

A versão atual recusou a abertura.

Depois da recusa foi confirmado diretamente no arquivo:

- `schema_version` continuou 14;
- migration V14 continuou intacta;
- marcador futuro continuou intacto;
- o singleton do aplicativo não ficou inicializado.

Ou seja, não existe mais downgrade silencioso de metadados.

### Histórico adulterado

Também foi alterado propositalmente o nome da migration V12.

A abertura foi recusada antes de executar novas migrations e o arquivo
permaneceu com o valor adulterado, confirmando comportamento fail-closed em vez
de tentar reparar silenciosamente um histórico incompatível.

### Resultado real

Teste específico do 5.5:

- testes: 5;
- aprovados: 5;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Suíte completa após a alteração:

- testes: 103;
- aprovados: 103;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Não ficaram resíduos:

- `.step55-*`: 0;
- `efisco-step55-*`: 0.

## 5.6/6 — execução completa, limpeza e consolidação da Etapa 5

### Alvo permanente da bateria SQLite

O `package.json` recebeu o script:

- `test:db` → `set ELECTRON_RUN_AS_NODE=1&& electron --test "tests/integration/db-*.test.js"`.

Esse alvo executa os cinco arquivos permanentes da Etapa 5:

- `db-schema-migrations.test.js`;
- `db-open-reopen.test.js`;
- `db-atomic-rollback.test.js`;
- `db-domain-persistence.test.js`;
- `db-schema-upgrade-compatibility.test.js`.

Resultado consolidado da bateria SQLite:

- testes: 19;
- aprovados: 19;
- falhas: 0;
- exit code: 0.

### Cobertura consolidada

A Etapa 5 passou a cobrir de forma permanente:

- schema V13, manifesto V1..V13, 22 tabelas e modo `STRICT`;
- criação, WAL, foreign keys, busy timeout, close e reopen;
- proteção contra troca silenciosa de `userDataDir`;
- rollback integral de crediário, edição de crediário e venda;
- persistência de estoque, caixa, financeiro, venda, crediário e outbox;
- persistência de idempotência após restart;
- upgrades reais V5→V13, V9→V13 e V12→V13;
- rejeição de schema futuro V14 sem downgrade silencioso;
- rejeição de histórico de migrations adulterado.

### Correções de produção realizadas na Etapa 5

Durante a Etapa 5, `offline-db.js` recebeu duas correções reais:

1. reuso do singleton apenas quando o caminho efetivo do SQLite é o mesmo;
2. validação do histórico/schema existente antes de qualquer migration ou `touchOpenMetadata`.

Também foi adicionado o manifesto público e imutável `OFFLINE_DB_MIGRATIONS`.

### Execução final

- `offline-db.js --check`: exit code 0;
- `phase2-db-selftest: OK`: exit code 0;
- bateria SQLite da Etapa 5: 19/19;
- suíte completa do projeto: 103/103;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- `FULL_EXIT_CODE=0`.

A execução usou o Electron instalado como runtime Node e `Start-Process -Wait -PassThru` para capturar exit codes reais. `NODE_PATH` foi definido somente no ambiente dos processos de teste; nenhum caminho da instalação foi gravado no projeto.

### Limpeza final

Não ficaram resíduos temporários da Etapa 5:

- `.step51-*` a `.step56-*`: 0;
- `efisco-step51-*` a `efisco-step56-*`: 0.

Backups com conteúdo útil produzidos pelas edições seguras foram preservados.

## Estado da Etapa 5

- [x] 5.1 — schema e migrations atuais
- [x] 5.2 — criação/reabertura do SQLite em temporário
- [x] 5.3 — rollback e atomicidade das transações
- [x] 5.4 — persistência de estoque, caixa, venda, crediário e outbox
- [x] 5.5 — upgrades de schema e compatibilidade entre versões
- [x] 5.6 — execução completa, limpeza e consolidação da Etapa 5

**Etapa 5 — SQLite e migrations: CONCLUÍDA.**


# Etapa 6 — fiscal e outbox

## 6.1/6 — pipeline fiscal e estados da NFC-e

Foi criado:

- `tests/integration/fiscal-pipeline-states.test.js`.

O teste monta documentos fiscais pela própria API de produção, usando:

- perfil fiscal em cache;
- lease fiscal ativo;
- venda offline com alocação NFC-e atômica;
- persistência do XML assinado;
- persistência do QR Code;
- criação e claim da fiscal outbox.

Não são usados certificado A1 real nem servidor SEFAZ neste micropasso.

### Máquina de estados validada

Fluxo local principal:

- `ALLOCATED`;
- `CONTINGENCIA_PENDENTE`;
- `SENDING`;
- `AUTHORIZED`;
- `REJECTED`;
- `MANUAL_REVIEW`.

### ALLOCATED -> CONTINGENCIA_PENDENTE

Foi confirmado que uma venda fiscal nasce com:

- documento NFC-e em `ALLOCATED`;
- XML assinado ausente;
- hash ausente;
- QR ausente;
- fiscal outbox ausente.

Também foi confirmado que:

- QR não pode ser persistido ainda em `ALLOCATED`;
- fiscal outbox não pode ser criada ainda em `ALLOCATED`;
- persistir o XML assinado muda o documento para
  `CONTINGENCIA_PENDENTE`;
- repetir exatamente o mesmo XML é idempotente;
- tentar substituir o XML assinado por outro conteúdo é recusado.

### QR e criação da fiscal outbox

Em `CONTINGENCIA_PENDENTE`:

- a outbox continua bloqueada enquanto o QR não existe;
- o QR pode ser persistido uma única vez;
- repetir exatamente o mesmo QR é idempotente;
- substituir por outro QR é recusado;
- após XML + hash + QR íntegros, a fiscal outbox é criada como
  `TRANSMIT/PENDING`;
- repetir a criação mantém o mesmo `operationId` e `createdAt`.

### CONTINGENCIA_PENDENTE -> SENDING -> RETRY

No claim fiscal:

- a outbox muda para `SENDING`;
- `attempts` é incrementado;
- o hash do XML final é fixado no payload;
- o documento muda para `SENDING`.

No retry de transmissão:

- a outbox muda para `RETRY`;
- o documento volta para `CONTINGENCIA_PENDENTE`;
- o erro e `nextAttemptAt` são preservados;
- claim anterior a `nextAttemptAt` retorna `claimed=false`;
- trocar o hash final já fixado é recusado;
- novo claim no instante permitido usa o mesmo hash e incrementa
  `attempts`.

### Estado terminal AUTHORIZED

Após claim:

- autorização muda o documento para `AUTHORIZED`;
- a fiscal outbox fica `CONFIRMED`;
- protocolo, cStat, xMotivo, data de autorização e XML processado são
  persistidos;
- uma segunda autorização é recusada porque a outbox já não está
  `SENDING`;
- a outbox fiscal não pode ser recriada para o documento autorizado.

### Estado terminal REJECTED

Após claim:

- rejeição muda o documento para `REJECTED`;
- a outbox fica `CONFIRMED`;
- cStat/xMotivo são persistidos;
- o ack remoto registra `kind=REJECTED`.

### MANUAL_REVIEW

Foram validados dois caminhos:

- trava preventiva ainda em `PENDING/RETRY`;
- revisão manual a partir de `SENDING`.

Após a trava preventiva:

- documento e outbox ficam em `MANUAL_REVIEW`;
- novo claim retorna `claimed=false`.

Após revisão a partir de `SENDING`:

- documento e outbox ficam em `MANUAL_REVIEW`;
- erro e ack remoto permanecem persistidos.

### Resultado da análise

Nenhum bug de produção foi encontrado na máquina principal de estados
exercitada neste micropasso.

A única correção durante a criação do teste foi ajustar a expectativa do
próprio teste para o contrato real de claim: uma operação já fora de
`PENDING/RETRY` retorna `claimed=false`, em vez de lançar exceção.

A alteração permanente deste passo é a nova cobertura de integração.

### Resultado real

Teste específico do 6.1:

- testes: 5;
- aprovados: 5;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Suíte completa após a alteração:

- testes: 108;
- aprovados: 108;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Não ficaram resíduos:

- `.step61-*`: 0;
- `efisco-step61-*`: 0.

## 6.2/6 — numeração fiscal, lease e contingência

Foi criado:

- `tests/integration/fiscal-numbering-lease.test.js`.

A bateria cobre **8 cenários** de numeração e lease fiscal usando somente
SQLite temporário e, em um cenário, servidor HTTP local controlado.

### Idempotência e sobreposição de leases

Validado:

- repetir o mesmo `requestId` com a mesma faixa devolve o lease existente;
- reutilizar o mesmo `requestId` com identidade/faixa divergente é recusado;
- faixas sobrepostas no mesmo namespace são recusadas;
- faixa imediatamente adjacente é aceita.

### Inventário e expiração

Foram combinados leases:

- ativo;
- ativo porém expirado pelo relógio de referência;
- `EXHAUSTED`.

O inventário separou corretamente:

- quantidade de leases ativos;
- números restantes;
- leases expirados;
- leases exauridos;
- total de leases.

`getActiveFiscalNumberLease` selecionou somente a faixa ativa e ainda válida.

### Sequência do contador

Foi validado:

- `peekNextNfceNumber`;
- consumo do número esperado;
- repetição do número já consumido como idempotente;
- recusa de salto na sequência;
- consumo do último número da faixa;
- transição automática do lease para `EXHAUSTED`;
- indisponibilidade de `NEXT` após a exaustão.

### Bug 1 — CONSUME selecionava lease histórico exaurido

Quando existiam:

- um lease antigo `EXHAUSTED`;
- um lease atual `ACTIVE`;

`peekNextNfceNumber` usava corretamente o ativo, mas
`consumeNextNfceNumber` consultava simplesmente a primeira faixa histórica.

Isso fazia o fluxo real `NEXT -> CONSUME` falhar com divergência de sequência.

Foi criada uma seleção comum que prefere:

- `ACTIVE`;
- com número disponível;
- não expirado;
- no mesmo empresa/device/ambiente/modelo/série.

O lease histórico permanece apenas como fallback de compatibilidade quando não
há faixa operacional selecionável.

### Bug 2 — reconciliação selecionava lease histórico exaurido

`reconcileLocalNfceCounter` tinha a mesma seleção pela faixa mais antiga.

Com um lease exaurido anterior e uma faixa ativa atual, um contador remoto
válido podia gerar:

`Próximo número fiscal excede o limite do contador local.`

Agora a reconciliação usa a mesma seleção do contador operacional e atualiza a
faixa ativa, preservando o lease histórico.

Também foi confirmado que a reconciliação:

- inicializa um contador quando não existe nenhum;
- avança para um número remoto maior;
- nunca regride quando o número remoto é menor que o local.

### Bug 3 — trava inFlight global misturava namespaces

`ensureFiscalNumberLeaseInventory` possuía uma única variável `inFlight`
global.

Duas chamadas concorrentes para empresas/dispositivos diferentes recebiam a
mesma Promise, de modo que apenas uma reserva era realmente executada.

A trava agora é armazenada por:

- `empresaId`;
- `deviceId`.

Chamadas concorrentes do mesmo contexto continuam deduplicadas, mas namespaces
diferentes podem reservar independentemente.

O teste executou simultaneamente duas empresas/dispositivos e confirmou duas
reservas distintas e dois inventários independentes.

### Bug 4 — expiração remota era descartada

`reserveFiscalNumberLeaseOffline` recebia `expiraEm` do servidor, mas não
repassava o campo para `upsertFiscalNumberLease`.

Na prática, um lease com validade remota podia virar localmente um lease sem
expiração.

Agora `expiraEm` é persistido.

Um servidor HTTP apenas local foi usado no teste para confirmar:

- payload da reserva;
- autenticação do device;
- persistência de `expiraEm`;
- lease selecionável um instante antes da expiração;
- lease indisponível exatamente a partir do instante de expiração.

Nenhum serviço externo ou SEFAZ foi acessado.

### Arquivos de produção alterados

- `offline-db.js`;
- `offline-fiscal-number-maintenance.js`;
- `offline-fiscal-number-service.js`.

### Resultado real

Teste específico do 6.2:

- testes: 8;
- aprovados: 8;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Validação de sintaxe:

- `offline-db.js`: exit code 0;
- `offline-fiscal-number-maintenance.js`: exit code 0;
- `offline-fiscal-number-service.js`: exit code 0.

Suíte completa após as correções:

- testes: 116;
- aprovados: 116;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Não ficaram resíduos:

- `.step62-*`: 0;
- `efisco-step62-*`: 0.

## 6.3/6 — XML, assinatura, QR Code e DANFE

Foi criado:

- `tests/integration/fiscal-xml-signature-qrcode-danfe.test.js`.

A bateria usa uma venda fiscal real em SQLite temporário e gera um PFX
autofirmado exclusivamente para teste. Nenhum certificado do usuário ou
credencial produtiva é acessado.

### XML NFC-e

Foi validado o XML gerado diretamente do snapshot fiscal persistido:

- raiz `NFe` e `infNFe` versão 4.00;
- chave de acesso idêntica à alocação fiscal;
- modelo 65;
- `tpEmis=9`;
- `tpAmb=1`;
- item, NCM, CFOP e CSOSN;
- destinatário CPF;
- pagamento PIX `tPag=17`;
- total `vNF=12.34`;
- justificativa de contingência;
- ausência de `Signature` e `infNFeSupl` antes das etapas correspondentes.

### XMLDSig

Um certificado X.509 e chave RSA de teste são gerados em memória e empacotados
em PFX/P12.

Com esse PFX foi confirmado:

- extração única do par chave/certificado;
- fingerprint SHA-256;
- assinatura do `infNFe`;
- referência XMLDSig para o `Id` correto;
- algoritmo de assinatura RSA-SHA1;
- digest SHA1;
- autoverificação criptográfica da assinatura.

Depois, `vNF` foi adulterado no XML já assinado e a verificação passou a
retornar `false`, provando que alteração do conteúdo assinado é detectada.

### QR Code v3

O mesmo PFX foi armazenado apenas no diretório temporário usando um
`safeStorage` falso e reversível exclusivo do teste.

Foi validado:

- o A1 usado no QR tem o mesmo fingerprint do certificado da XMLDSig;
- geração do QR Code v3;
- assinatura RSA-SHA1 do payload do QR;
- validação criptográfica do QR contra o certificado embutido no XML;
- persistência idempotente do QR;
- segunda finalização devolvendo o mesmo QR e o mesmo hash final.

Um byte da assinatura Base64 do QR foi alterado propositalmente e a validação
recusou o QR adulterado.

### XML final com infNFeSupl

Após o QR foi reconstruído o XML final com ordem exata:

1. `infNFe`;
2. `infNFeSupl`;
3. `Signature`.

Foi confirmado que adicionar `infNFeSupl` não invalida a XMLDSig, pois a
assinatura continua verificável sobre o `infNFe` original.

O SHA-256 do XML final também foi comparado entre a finalização e a
reconstrução determinística.

### DANFE de contingência

O DANFE foi derivado do XML final e comparado com
`generateDanfeContingencyForSale`.

Foram validados:

- via `CONSUMIDOR`;
- via `ESTABELECIMENTO`;
- mensagem `EMITIDA EM CONTINGÊNCIA`;
- mensagem `Pendente de autorização`;
- protocolo ausente enquanto pendente;
- `tpEmis=9`;
- chave de acesso;
- QR Code;
- consumidor identificado por CPF;
- item e valor total;
- pagamento PIX;
- marcação de guarda da via do estabelecimento até autorização.

### Resultado da análise

Nenhum bug de produção foi encontrado nos módulos de XML, assinatura, QR Code
ou DANFE neste micropasso.

A alteração permanente é a nova cobertura de integração criptográfica e
documental.

### Resultado real

Teste específico do 6.3:

- testes: 5;
- aprovados: 5;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Validação de sintaxe:

- `offline-fiscal-nfce-xml.js`: exit code 0;
- `offline-fiscal-xml-signer.js`: exit code 0;
- `offline-fiscal-nfce-qrcode.js`: exit code 0;
- `offline-fiscal-nfce-danfe.js`: exit code 0.

Suíte completa após a alteração:

- testes: 121;
- aprovados: 121;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Não ficaram resíduos:

- `.step63-*`: 0;
- `efisco-step63-*`: 0.

## 6.4/6 — outbox fiscal, retry, conflito e reconciliação

Foi criado:

- `tests/integration/fiscal-outbox-reconciliation.test.js`.

A bateria cobre **8 cenários** do worker fiscal e dos parsers do transporte
SVRS, usando somente SQLite temporário e transportes/respostas controladas.

### Retry de transmissão não enviada

Quando o transporte retorna `NOT_SENT`:

- a outbox volta para `RETRY`;
- a ação permanece `TRANSMIT`;
- o documento volta para `CONTINGENCIA_PENDENTE`;
- `nextAttemptAt` é respeitado;
- nenhuma tentativa é feita antes do horário permitido.

Na tentativa seguinte foi confirmado que:

- o mesmo SHA-256 do XML final continua fixado;
- `attempts` é incrementado;
- uma autorização fecha documento e outbox normalmente.

### Resultado ambíguo e reconciliação por chave

Quando a transmissão lança erro depois de poder ter enviado dados:

- a ação muda de `TRANSMIT` para `RECONCILE_BY_KEY`;
- a outbox fica `RETRY`;
- o documento fica `RECONCILE_BY_KEY`;
- nenhum reenvio automático ocorre antes da consulta por chave.

Foi testado o fluxo:

`TRANSMIT -> ambíguo -> RECONCILE_BY_KEY -> NOT_FOUND seguro -> TRANSMIT`

A consulta `NOT_FOUND` com `safeToRetransmit=true`:

- devolve a ação para `TRANSMIT`;
- devolve o documento para `CONTINGENCIA_PENDENTE`;
- mantém exatamente o mesmo hash do XML final.

A retransmissão seguinte foi autorizada com o mesmo XML fixado.

### Documento já autorizado encontrado pela chave

Outro cenário simulou:

`TRANSMIT -> AMBIGUOUS -> RECONCILE_BY_KEY -> AUTHORIZED`.

Foi confirmado:

- nenhuma segunda transmissão é feita;
- a consulta por chave fecha a outbox em `CONFIRMED`;
- o documento termina em `AUTHORIZED`;
- protocolo e ack remoto são persistidos.

### Conflito

Um retorno `CONFLICT` foi exercitado com cStat 539.

O worker:

- move a outbox para `CONFLICT`;
- remove qualquer próximo retry automático;
- preserva cStat e tipo do ack remoto;
- move o documento para `MANUAL_REVIEW`;
- exclui a operação das próximas varreduras automáticas.

### Limite de tentativas

Com `maxAttempts=2`:

- duas chamadas reais foram permitidas;
- ao atingir o limite, nenhuma terceira chamada ao transporte ocorreu;
- a outbox foi movida para `MANUAL_REVIEW`;
- o documento também foi movido para `MANUAL_REVIEW`.

### Recuperação de SENDING abandonado

Foi simulado um processo encerrado depois do claim de uma transmissão.

`recoverStaleFiscalOutbox` converteu:

- `SENDING/TRANSMIT`;
- para `RETRY/RECONCILE_BY_KEY`.

O documento também foi movido para `RECONCILE_BY_KEY`.

Isso confirma a regra de segurança: uma transmissão cujo resultado foi perdido
não é reenviada diretamente; primeiro é reconciliada pela chave.

### Classificação de respostas SVRS

Os parsers SOAP foram exercitados diretamente.

Na autorização:

- cStat 108 -> `NOT_SENT`;
- cStat 204 -> `AMBIGUOUS`.

Na consulta por chave:

- cStat 217 -> `NOT_FOUND` com `safeToRetransmit=true`;
- cStat 100 com protocolo válido -> `AUTHORIZED`.

O cenário autorizado também confirmou a reconstrução de `nfeProc` usando o
mesmo XML e a mesma chave consultada.

### Resultado da análise

Nenhum bug de produção foi encontrado no worker fiscal, transições da fiscal
outbox ou classificação SVRS exercitados neste micropasso.

A alteração permanente é a nova cobertura de integração para retry,
ambiguidade, reconciliação, conflito, limite de tentativas e recuperação de
operações abandonadas.

### Resultado real

Teste específico do 6.4:

- testes: 8;
- aprovados: 8;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Validação de sintaxe:

- `offline-fiscal-outbox-worker.js`: exit code 0;
- `offline-fiscal-svrs-transport.js`: exit code 0;
- `offline-db.js`: exit code 0.

Suíte completa após a alteração:

- testes: 129;
- aprovados: 129;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Não ficaram resíduos:

- `.step64-*`: 0;
- `efisco-step64-*`: 0.

## 6.5/6 — integração fiscal ponta a ponta em ambiente controlado

Foi criado:

- `tests/integration/fiscal-end-to-end-controlled.test.js`.

A bateria contém **2 fluxos ponta a ponta** usando:

- SQLite temporário;
- perfil fiscal real do contrato de produção;
- lease fiscal local;
- PFX autofirmado criado somente para teste;
- bundle A1 protegido em diretório temporário com `safeStorage` falso;
- geração XML NFC-e real;
- XMLDSig real;
- QR Code v3 real;
- DANFE de contingência;
- fiscal outbox real;
- runtime fiscal real;
- transporte SOAP real apontado apenas para `127.0.0.1`;
- parser de respostas SVRS real.

Nenhum certificado do usuário, endpoint externo ou SEFAZ real foi acessado.

### Fluxo 1 — autorização direta

Foi executado:

`venda -> alocação -> XML -> assinatura -> QR -> DANFE -> outbox -> SOAP -> AUTHORIZED`.

Antes da transmissão foi confirmado:

- pipeline fiscal habilitado;
- documento em `CONTINGENCIA_PENDENTE`;
- XML assinado com SHA-256;
- QR persistido;
- DANFE disponível;
- fiscal outbox em `PENDING/TRANSMIT`;
- contador do lease avançado de 650 para 651.

O servidor SOAP local recebeu a requisição real de autorização e confirmou no
corpo:

- `enviNFe`;
- chave de acesso correta;
- `infNFeSupl`;
- `qrCode`;
- `Signature`.

A resposta controlada retornou lote processado + protocolo autorizado.

Depois de `runFiscalReconnectCycle`:

- documento: `AUTHORIZED`;
- outbox: `CONFIRMED`;
- `attempts=1`;
- protocolo persistido;
- cStat 100 persistido;
- `processedXml` com `nfeProc`;
- ack remoto `AUTHORIZED`.

O banco foi então fechado e reaberto.

Após o restart permaneceram:

- venda;
- item;
- documento `AUTHORIZED`;
- protocolo;
- outbox `CONFIRMED`;
- número de tentativas.

### Fluxo 2 — ambiguidade e reconciliação

Foi executado:

`venda -> pipeline local -> TRANSMIT -> cStat 204 -> RECONCILE_BY_KEY -> consulta -> cStat 100 -> AUTHORIZED`.

Na primeira chamada SOAP:

- houve exatamente uma autorização;
- resposta cStat 204 foi tratada como ambígua;
- documento foi para `RECONCILE_BY_KEY`;
- outbox foi para `RETRY/RECONCILE_BY_KEY`;
- `attempts=1`.

No ciclo seguinte:

- nenhuma nova autorização foi enviada;
- foi feita exatamente uma consulta `consSitNFe`;
- a consulta continha a mesma chave;
- a resposta controlada cStat 100 trouxe o protocolo existente.

Ao final:

- documento: `AUTHORIZED`;
- outbox: `CONFIRMED`;
- ação final preservada como `RECONCILE_BY_KEY`;
- `attempts=2`;
- uma transmissão total;
- uma consulta total;
- zero retransmissões indevidas.

Um terceiro ciclo confirmou que a operação autorizada não volta para a fila.

### Resultado da análise

Nenhum bug de produção foi encontrado na integração entre pipeline local,
certificado, XML/QR, fiscal outbox, runtime e transporte SOAP neste
micropasso.

A alteração permanente é a nova cobertura ponta a ponta em ambiente
controlado.

### Resultado real

Teste específico do 6.5:

- testes: 2;
- aprovados: 2;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Validação de sintaxe:

- `offline-fiscal-sale-pipeline.js`: exit code 0;
- `offline-fiscal-runtime.js`: exit code 0;
- `offline-fiscal-svrs-transport.js`: exit code 0;
- `offline-fiscal-certificate-store.js`: exit code 0;
- `offline-fiscal-xml-signer.js`: exit code 0.

Suíte completa após a alteração:

- testes: 131;
- aprovados: 131;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

Não ficaram resíduos:

- `.step65-*`: 0;
- `efisco-step65-*`: 0.

## 6.6/6 — execução completa, limpeza e consolidação da Etapa 6

### Alvo permanente da bateria fiscal

O `package.json` recebeu:

- `test:fiscal`.

Comando:

`set ELECTRON_RUN_AS_NODE=1&& electron --test "tests/integration/fiscal-*.test.js"`

Esse alvo executa somente a bateria fiscal permanente da Etapa 6.
`build.files` continua sem incluir `tests/**`, portanto a mudança não adiciona
testes ao instalador.

A bateria fiscal consolidada contém 5 arquivos:

- `fiscal-pipeline-states.test.js`;
- `fiscal-numbering-lease.test.js`;
- `fiscal-xml-signature-qrcode-danfe.test.js`;
- `fiscal-outbox-reconciliation.test.js`;
- `fiscal-end-to-end-controlled.test.js`.

Resultado consolidado:

- testes fiscais: 28;
- aprovados: 28;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

### Cobertura consolidada da Etapa 6

#### Pipeline e estados da NFC-e

Validado:

- `ALLOCATED`;
- `CONTINGENCIA_PENDENTE`;
- `SENDING`;
- `AUTHORIZED`;
- `REJECTED`;
- `MANUAL_REVIEW`;
- idempotência de XML, QR e criação da fiscal outbox;
- bloqueio de transições incompatíveis.

#### Numeração, lease e contingência

Validado:

- idempotência por `requestId`;
- rejeição de sobreposição;
- inventário ativo/expirado/exaurido;
- sequência e exaustão do contador;
- reconciliação sem regressão;
- seleção da faixa ativa quando existem leases históricos;
- isolamento concorrente por empresa/device;
- persistência de `expiraEm` recebido da reserva remota.

#### XML, assinatura, QR e DANFE

Validado com PFX autofirmado exclusivo de teste:

- geração NFC-e 4.00;
- XMLDSig;
- verificação da assinatura;
- detecção de adulteração;
- QR Code v3;
- validação criptográfica do QR;
- `infNFeSupl`;
- XML final;
- DANFE de contingência consumidor/estabelecimento.

#### Outbox fiscal e reconciliação

Validado:

- `NOT_SENT` e retry;
- `AMBIGUOUS`;
- `RECONCILE_BY_KEY`;
- `NOT_FOUND` seguro para retransmissão;
- autorização encontrada pela chave;
- conflito;
- limite de tentativas;
- recuperação de `SENDING` abandonado;
- classificação das respostas SOAP SVRS.

#### Ponta a ponta controlado

Foram executados dois fluxos completos:

1. venda -> pipeline local -> SOAP local -> autorização;
2. venda -> transmissão ambígua -> consulta por chave -> autorização.

Esses testes usam SQLite temporário, PFX de teste, `safeStorage` falso e
servidor SOAP em `127.0.0.1`.

Nenhum certificado real do usuário ou endpoint SEFAZ foi acessado.

### Correções de produção realizadas na Etapa 6

Durante a Etapa 6 foram corrigidos quatro problemas reais:

1. `consumeNextNfceNumber` podia selecionar lease histórico exaurido;
2. `reconcileLocalNfceCounter` podia selecionar a mesma faixa histórica;
3. a trava `inFlight` da manutenção de leases era global e misturava
   empresas/dispositivos concorrentes;
4. `expiraEm` retornado pela reserva remota não era persistido localmente.

As correções ficaram em:

- `offline-db.js`;
- `offline-fiscal-number-maintenance.js`;
- `offline-fiscal-number-service.js`.

Os demais micropassos da Etapa 6 ampliaram cobertura sem exigir mudança da
lógica de produção.

### Execução final

Validação de sintaxe:

- módulos `offline-fiscal-*.js` verificados: 15;
- todos com exit code 0;
- `offline-db.js`: exit code 0;
- `offline-sale-service.js`: exit code 0.

Self-tests:

- `phase1-selftest: OK`;
- `phase2-db-selftest: OK`;
- ambos com exit code 0.

Bateria específica da Etapa 6:

- testes: 28;
- aprovados: 28;
- falhas: 0;
- exit code: 0.

Suíte completa do projeto:

- testes: 131;
- aprovados: 131;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- `FULL_EXIT_CODE=0`.

### Limpeza final

Não ficaram resíduos temporários da Etapa 6:

- `.step61-*` a `.step66-*`: 0;
- `efisco-step61-*` a `efisco-step66-*`: 0.

Backups com conteúdo útil produzidos pelas edições seguras foram preservados.

## Estado da Etapa 6

- [x] 6.1 — pipeline fiscal e estados da NFC-e
- [x] 6.2 — numeração fiscal, lease e contingência
- [x] 6.3 — XML, assinatura, QR Code e DANFE
- [x] 6.4 — outbox fiscal, retry, conflito e reconciliação
- [x] 6.5 — integração fiscal ponta a ponta em ambiente controlado
- [x] 6.6 — execução completa, limpeza e consolidação da Etapa 6

**Etapa 6 — fiscal e outbox: CONCLUÍDA.**


# Etapa 7 — arquitetura

## 7.1/6 — mapa arquitetural e responsabilidades dos módulos

Foi criado:

- `architecture/module-responsibilities.json`.

O mapa representa a arquitetura JavaScript de produção observada após as
Etapas 4, 5 e 6.

### Inventário atual

Foram identificados:

- arquivos JavaScript de produção: 29;
- módulos com `module.exports`: 26;
- camadas arquiteturais: 10;
- dependências internas `require('./...')`: 54.

Os self-tests das Fases 1 e 2 foram excluídos da contagem de produção.

### Responsabilidades registradas

O mapa atribui cada módulo exatamente uma vez a uma das seguintes camadas:

- entrypoints Electron;
- serviços de aplicação;
- valores determinísticos;
- persistência;
- identidade/sync;
- credenciais fiscais;
- documento fiscal;
- numeração fiscal;
- orquestração/transporte fiscal;
- suporte desktop.

Também registra uma responsabilidade proprietária para cada um dos 29 módulos
e o snapshot completo das dependências diretas atuais.

### Atualização em relação ao inventário histórico

O inventário antigo registrava 24 módulos exportados.

O estado atual possui 26 porque passaram a existir:

- `offline-sale-values.js`;
- `offline-fiscal-values.js`.

O histórico anterior foi preservado; a fotografia atual da Etapa 7 passa a ser
a referência para análise arquitetural dos próximos micropassos.

### Validação do mapa

Uma validação automática comparou o JSON com os arquivos reais.

Confirmado:

- JSON válido;
- 29 arquivos de produção no mapa;
- 29 atribuições de camada;
- nenhum módulo duplicado;
- nenhum módulo ausente;
- 26 módulos exportados;
- 54 arestas no código;
- 54 arestas no mapa;
- diferença entre os dois grafos: 0.

Resultado:

- `ARCH_MAP_VALIDATION=OK`.

### Regressão

Suíte completa após a documentação/mapeamento:

- testes: 131;
- aprovados: 131;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- `FULL_EXIT_CODE=0`.

Não ficaram resíduos:

- `.step71-*`: 0;
- `efisco-step71-*`: 0.

Nenhuma lógica de produção foi alterada neste micropasso.

## 7.2/6 — acoplamentos, dependências e ciclos

Foi criado:

- `architecture/dependency-analysis.json`.

A análise foi calculada a partir de
`architecture/module-responsibilities.json` e do grafo local CommonJS atual.

### Grafo

Confirmado:

- nós: 29;
- arestas: 54;
- componentes fortemente conectados: 29;
- componentes cíclicos: 0;
- grafo acíclico: sim;
- caminho máximo: 6 arestas.

Não existe ciclo de `require('./...')` entre os módulos de produção.

### Hotspots

Maiores concentrações observadas:

- `main.js`: fan-out 13, alcance transitivo 24;
- `offline-db.js`: fan-in 13;
- `offline-fiscal-nfce-qrcode.js`: fan-in 3 + fan-out 4;
- `offline-fiscal-sale-pipeline.js`: fan-out 5;
- `offline-sale-service.js`: 11 dependências transitivas;
- `offline-device-auth.js`: fan-in 5;
- `offline-fiscal-certificate-store.js`: fan-in 5.

Esses valores foram registrados como concentração estrutural, não como falha
automática.

### Alcance de runtime estático

As raízes consideradas foram:

- `main.js`;
- `preload.js`;
- `phase2-pair-device.js`.

A união alcança 27 dos 29 arquivos de produção.

Não são alcançados por nenhuma dessas raízes no grafo CommonJS atual:

- `offline-fiscal-number-maintenance.js`;
- `offline-fiscal-number-service.js`.

Busca textual confirmou que o módulo de manutenção não é importado por
entrypoint/serviço de produção. Os dois arquivos continuam empacotados e
cobertos por teste; portanto foram registrados como **não alcançáveis pelo
runtime estático atual**, sem classificá-los como código morto.

### Validação

Resultado da validação estruturada:

- `DEPENDENCY_ANALYSIS_JSON=OK`;
- `DEPENDENCY_GRAPH_NODES=29`;
- `DEPENDENCY_GRAPH_EDGES=54`;
- `DEPENDENCY_GRAPH_ACYCLIC=True`;
- `DEPENDENCY_UNREACHABLE=2`;
- `HOTSPOT_MAIN_FANOUT=13`;
- `HOTSPOT_DB_FANIN=13`;
- `HOTSPOT_QRCODE_TOTAL=7`;
- `DEPENDENCY_ANALYSIS_VALIDATION=OK`.

Nenhuma lógica de produção foi alterada neste micropasso.

## 7.3/6 — fronteiras entre DB, serviços, fiscal, sync e UI

Foi criado:

- `architecture/boundary-contracts.json`.

### SQLite

Foi confirmado que somente `offline-db.js` importa `node:sqlite`.

Entretanto, o handle retornado por `getOfflineDatabase()` ainda permite que
outros módulos conheçam o schema diretamente.

Foram encontradas:

- chamadas `.prepare()` fora de `offline-db.js`: 20;
- módulos envolvidos: 5.

Distribuição:

- `main.js`: 8;
- `offline-cash-service.js`: 5;
- `offline-device-auth.js`: 2;
- `offline-fiscal-number-maintenance.js`: 3;
- `offline-sale-service.js`: 2.

Essa situação foi registrada como dívida arquitetural para o 7.4, não como
falha funcional.

### Serviços e fiscal

Foi confirmado:

- produto não executa SQL bruto;
- venda entra no fiscal por
  `offline-fiscal-sale-pipeline.js`;
- venda não importa XML/QR/SVRS diretamente;
- módulos documentais fiscais não importam transporte SVRS/sync;
- `offline-outbox-worker.js` recebe transporte pelo chamador.

### UI e IPC

Configuração Electron observada:

- `contextIsolation=true`;
- `nodeIntegration=false`;
- `sandbox=true`.

Nos arquivos da UI offline:

- `require(...)`: 0;
- `ipcRenderer`: 0;
- referências a `efiscoDesktop`: 44;
- chamadas `fetch`: 2.

Os dois `fetch` são:

- sonda de conectividade;
- carregamento de nomenclatura/NCM oficial.

A comparação IPC confirmou:

- canais usados pelo preload: 22;
- canais registrados no main: 22;
- preload sem handler: 0;
- handler sem exposição correspondente: 0.

### Rede

Foram identificados 6 módulos que importam `http` ou `https`, cada um com
fronteira explícita:

- probe Wix no `main.js`;
- pareamento;
- SVRS;
- standby;
- sync HTTP;
- servidor loopback da UI.

### Candidatos para 7.4

O mapa estruturado registra como próximos candidatos:

1. remover SQL bruto do `main.js`;
2. consolidar o read model financeiro;
3. encapsular `local_config`.

Nenhuma lógica de produção foi alterada neste micropasso.

### Validação

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

## 7.4/6 — extração mínima de responsabilidades críticas

A extração escolhida removeu o SQL bruto do `main.js`.

### Produção alterada

`offline-db.js` recebeu:

- `getOutboxStatusSummary`;
- `listAuthorizedNfcePendingSync`.

O `main.js` passou a usar APIs públicas para:

- histórico de movimentos de caixa;
- resumo da sync outbox;
- read model de NFC-e autorizada pendente de sync;
- enfileiramento `NFCE_AUTHORIZED`;
- resolução de empresa preparada por operador/perfil.

### Redução de acoplamento

Antes:

- `main.js .prepare()`: 8;
- SQL bruto fora do DB: 20 chamadas / 5 módulos.

Depois:

- `main.js .prepare()`: 0;
- SQL bruto fora do DB: 12 chamadas / 4 módulos.

Ainda permanecem:

- `offline-cash-service.js`: 5;
- `offline-device-auth.js`: 2;
- `offline-fiscal-number-maintenance.js`: 3;
- `offline-sale-service.js`: 2.

### Teste criado

- `tests/integration/architecture-boundary-extraction.test.js`.

Cobertura:

- resumo da outbox isolado por empresa;
- leitura de NFC-e autorizada pendente de sync;
- preservação da dependência `SALE_PAID`;
- exclusão do read model após criação de `NFCE_AUTHORIZED`.

Resultado específico:

- testes: 2;
- aprovados: 2;
- falhas: 0;
- exit code: 0.

### Regressão

- `ARCHITECTURE_74_VALIDATION=OK`;
- `offline-db.js --check`: 0;
- `main.js --check`: 0;
- suíte completa: 133;
- aprovados: 133;
- falhas: 0;
- `FULL_EXIT_CODE=0`;
- resíduos `.step74-*`: 0;
- resíduos `efisco-step74-*`: 0.

## 7.5/6 — testes de arquitetura e contratos entre módulos

Foi criado:

- `tests/unit/architecture-contracts.test.js`.

O `package.json` recebeu:

- `test:architecture`.

### Guardrails estáticos

O novo arquivo possui 7 testes que verificam automaticamente:

- inventário de 29 módulos e atribuição única de camada;
- snapshot completo dos `require('./...')`;
- ausência de ciclos no grafo CommonJS local;
- ownership exclusivo de `node:sqlite` por `offline-db.js`;
- zero `.prepare()` no `main.js`;
- baseline explícito da dívida SQL restante: 12 chamadas / 4 módulos;
- isolamento do renderer;
- igualdade entre canais IPC do preload e do main;
- separação venda -> pipeline fiscal -> transporte;
- alinhamento da versão dos três JSONs arquiteturais com o `package.json`.

### Bateria arquitetural

O alvo executa:

- `tests/unit/architecture-*.test.js`;
- `tests/integration/architecture-*.test.js`.

Resultado:

- testes: 9;
- aprovados: 9;
- falhas: 0;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- exit code: 0.

### Regressão

- `PACKAGE_JSON=OK`;
- `architecture-contracts.test.js --check`: 0;
- suíte completa: 140;
- aprovados: 140;
- falhas: 0;
- `FULL_EXIT_CODE=0`;
- resíduos `.step75-*`: 0;
- resíduos `efisco-step75-*`: 0.

Nenhuma lógica de produção foi alterada neste micropasso.

## 7.6/6 — execução completa, limpeza e consolidação da Etapa 7

### Execução consolidada

Foram validados:

- `package.json`;
- os três JSONs arquiteturais;
- bateria `test:architecture`;
- sintaxe dos 29 arquivos JavaScript de produção;
- self-test da Fase 1;
- self-test de banco da Fase 2;
- suíte completa.

### Resultado da bateria arquitetural

- testes: 9;
- aprovados: 9;
- falhas: 0;
- exit code: 0.

### Validação de sintaxe

- arquivos JavaScript de produção: 29;
- verificados com `--check`: 29;
- falhas: 0.

### Self-tests

- `phase1-selftest: OK`;
- `PHASE1_SELFTEST_EXIT_CODE=0`;
- `phase2-db-selftest: OK`;
- `PHASE2_DB_SELFTEST_EXIT_CODE=0`.

### Baseline arquitetural final

- `main.js .prepare()`: 0;
- SQL bruto fora do DB: 12 chamadas / 4 módulos;
- grafo CommonJS: 29 nós / 54 arestas / 0 ciclos;
- ownership de `node:sqlite`: somente `offline-db.js`;
- IPC preload/main: 22/22.

### Suíte completa

- testes: **140**;
- aprovados: **140**;
- falhas: **0**;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- `FULL_EXIT_CODE=0`.

### Limpeza

- resíduos `.step71-*` a `.step76-*`: 0;
- resíduos `efisco-step71-*` a `efisco-step76-*`: 0.

## Estado da Etapa 7

- [x] 7.1 — mapa arquitetural e responsabilidades dos módulos
- [x] 7.2 — acoplamentos, dependências e ciclos
- [x] 7.3 — fronteiras entre DB, serviços, fiscal, sync e UI
- [x] 7.4 — extração mínima de responsabilidades críticas
- [x] 7.5 — testes de arquitetura e contratos entre módulos
- [x] 7.6 — execução completa, limpeza e consolidação da Etapa 7

**Etapa 7 — arquitetura: CONCLUÍDA.**


# Etapa 8 — CI

## 8.1/6 — inventário do fluxo de build/test atual

Foi criado:

- `ci/current-flow.json`;
- `CI.md`.

### Baseline observada

CI versionada encontrada:

- nenhuma.

Lock/install:

- `package-lock.json`: presente;
- lockfile: v3;
- `engines`: ausente;
- `packageManager`: ausente;
- `node_modules` no checkout: ausente.

Toolchain resolvida:

- Electron 43.4.1;
- electron-builder 26.15.3.

Runtime local de validação:

- Electron 43.4.1;
- Node 24.18.1;
- win32/x64.

### Suítes atuais

- unit: 88/88;
- integration: 52/52;
- DB: 19/19;
- fiscal: 28/28;
- architecture: 9/9;
- completa: 140/140;
- phase1-selftest: OK;
- phase2-db-selftest: OK.

### Build atual

- target: Windows NSIS x64;
- `build.files`: 20 entradas;
- entradas ausentes: 0;
- `offline-fiscal-*.js`: 15 arquivos;
- `offline-ui/**`: 4 arquivos;
- publicação no script `dist`: desativada por `--publish never`.

Existe `dist` local pré-existente, mas nenhum build foi executado no 8.1 e
esse diretório não foi tratado como resultado de CI.

### Política do 8.1

Neste micropasso:

- workflow criado: não;
- build executado: não;
- publish executado: não;
- lógica de produção alterada: não.

## 8.2/6 — pipeline CI mínimo e reproduzível

Foram criados:

- `.github/workflows/ci.yml`;
- `ci/pipeline-contract.json`;
- `tests/unit/ci-workflow-contract.test.js`.

### Workflow mínimo

Configuração:

- provider: GitHub Actions;
- runner: `windows-2025`;
- Node: `24.18.1`;
- instalação: `npm ci`;
- jobs: 1 (`verify`);
- permissões: `contents: read`;
- cache: desativado neste passo;
- build/publish/upload: desativados neste passo.

Comandos executados pelo job:

- `npm test`;
- `npm run phase1:selftest`;
- `npm run phase2:db-selftest`.

### Guardrail

O teste permanente do workflow possui 4 casos.

Resultado:

- testes: 4;
- aprovados: 4;
- falhas: 0;
- exit code: 0.

### Simulação limpa

Uma tentativa com Node 24.18.1 portátil + `npm ci` excedeu o timeout do
conector durante download/instalação.

A tentativa foi limpa completamente:

- processos órfãos encerrados;
- temporários removidos;
- `node_modules` ausente após limpeza.

O workflow ainda não foi executado no GitHub e o projeto não registra essa
tentativa como sucesso de instalação limpa.

### Regressão

- `STEP82_WORKFLOW_CONTRACT=OK`;
- suíte completa: 144;
- aprovados: 144;
- falhas: 0;
- `FULL_EXIT_CODE=0`;
- `node_modules`: ausente;
- resíduos `.step82-*`: 0;
- resíduos `efisco-step82-*`: 0.

Nenhuma lógica de produção foi alterada.

## 8.3/6 — jobs de testes unitários, integração, DB, fiscal e arquitetura

O workflow passou de 1 para **5 jobs**:

- `unit`;
- `integration`;
- `db`;
- `fiscal`;
- `architecture`.

Todos usam:

- `windows-2025`;
- Node `24.18.1`;
- checkout/setup-node fixados;
- `npm ci`;
- cache desativado.

### Execução local equivalente dos jobs

- unit: **94/94**;
- integration: **52/52**;
- DB: **19/19**;
- fiscal: **28/28**;
- architecture: **9/9**;
- phase1-selftest: **OK**;
- phase2-db-selftest: **OK**.

`unit + integration` cobrem a suíte completa. DB, fiscal e architecture são
subsets diagnósticos.

### Guardrail

`ci-workflow-contract.test.js` agora contém 6 testes.

Resultado:

- **6/6**;
- falhas: 0.

Ele protege:

- conjunto exato dos cinco jobs;
- toolchain comum;
- instalação por `npm ci`;
- scripts existentes;
- self-tests no job integration;
- ausência de build/cache/publish/upload prematuros.

### Regressão

- `STEP83_WORKFLOW_STRUCTURE=OK`;
- jobs: 5;
- suíte completa: **146/146**;
- falhas: 0;
- `FULL_EXIT_CODE=0`;
- `node_modules`: ausente;
- resíduos `.step83-*`: 0;
- resíduos `efisco-step83-*`: 0.

Nenhuma lógica de produção foi alterada.

## 8.4/6 — build/empacotamento e validações de release

O workflow ganhou o job `build`.

### Gate de build

O build depende dos cinco jobs:

- `unit`;
- `integration`;
- `db`;
- `fiscal`;
- `architecture`.

O job:

- usa `windows-2025`;
- usa Node `24.18.1`;
- executa `npm ci`;
- limpa `dist`;
- executa `npm run dist`;
- executa `ci/validate-release.ps1 -DistPath dist`.

### Validação de release

Foi criado:

- `ci/validate-release.ps1`.

Ele valida:

- contrato NSIS x64;
- publish desabilitado;
- nome/versão do instalador;
- blockmap;
- `latest.yml`;
- tamanho do instalador;
- SHA-512 do instalador;
- executável unpacked;
- `app.asar`;
- `app-update.yml`;
- 2 arquivos de `asarUnpack`.

Execução contra o `dist` local pré-existente:

- `RELEASE_VALIDATION=OK`;
- instalador: `e-fisco-Setup-1.0.41.exe`;
- tamanho: 107134616 bytes;
- SHA-512 coerente;
- exit code: 0.

Essa execução valida o contrato, mas não é considerada build fresco.

### Guardrail

`ci-workflow-contract.test.js` passou para 8 testes.

Resultado:

- **8/8**;
- falhas: 0.

### Regressão

- `STEP84_WORKFLOW_STRUCTURE=OK`;
- jobs: 6;
- `RELEASE_VALIDATION=OK`;
- suíte completa: **148/148**;
- falhas: 0;
- `FULL_EXIT_CODE=0`;
- `node_modules`: ausente;
- resíduos `.step84-*`: 0;
- resíduos `efisco-step84-*`: 0.

O workflow ainda não foi executado remotamente no GitHub e nenhum build fresco
foi produzido localmente nesta sessão.

Nenhuma lógica de produção foi alterada.

## 8.5/6 — falhas, artefatos, cache e endurecimento da CI

O workflow recebeu endurecimento operacional e de segurança.

### Cache

Nos seis jobs:

- cache explícito `npm`;
- chave baseada em `package-lock.json`;
- `node_modules` não é cacheado;
- instalação: `npm ci --no-audit --no-fund`.

### Segurança e falhas

- `persist-credentials: false` nos seis checkouts;
- permissão global: `contents: read`;
- nenhum secret necessário;
- nenhum publish;
- concurrency com `cancel-in-progress=true`;
- timeout em todos os seis jobs;
- resumo de falha em todos os seis jobs.

Timeouts:

- unit 10 min;
- integration 15 min;
- DB 10 min;
- fiscal 15 min;
- architecture 10 min;
- build 35 min.

### Artefato de release

Depois de `validate-release.ps1` passar, o build usa
`actions/upload-artifact@v7.0.1`.

Conteúdo:

- instalador;
- blockmap;
- `latest.yml`.

Política:

- arquivo ausente = erro;
- retenção = 14 dias;
- compression level = 0;
- `win-unpacked` não é enviado.

Upload não implica publicação. `--publish never` permanece obrigatório.

### Guardrail

`ci-workflow-contract.test.js` agora possui **12 testes**.

Resultado:

- **12/12**;
- falhas: 0.

### Regressão

- `STEP85_WORKFLOW_HARDENING=OK`;
- jobs: 6;
- cache: 6/6;
- timeout: 6/6;
- resumo de falha: 6/6;
- upload: 1;
- `RELEASE_VALIDATION=OK`;
- suíte completa: **152/152**;
- falhas: 0;
- `FULL_EXIT_CODE=0`;
- package-lock inalterado;
- `node_modules`: ausente;
- resíduos `.step85-*`: 0;
- resíduos `efisco-step85-*`: 0.

O workflow ainda não foi executado remotamente no GitHub.

Nenhuma lógica de produção foi alterada.

## 8.6/6 — execução completa, limpeza e consolidação da Etapa 8

### Consolidação

Foi adicionado ao `package.json`:

- `test:ci`.

O comando executa os guardrails de CI/release em
`tests/unit/ci-workflow-contract.test.js`.

### Sintaxe

- JavaScript de produção: **29/29**;
- guardrail CI: OK;
- `validate-release.ps1`: parse OK.

### Execução dos recortes

- CI: **12/12**;
- unit: **100/100**;
- integration: **52/52**;
- DB: **19/19**;
- fiscal: **28/28**;
- architecture: **9/9**;
- phase1-selftest: **OK**;
- phase2-db-selftest: **OK**.

Todos os exit codes foram 0.

### Release

- `RELEASE_VALIDATION=OK`;
- versão: 1.0.41;
- instalador: `e-fisco-Setup-1.0.41.exe`;
- tamanho: 107134616 bytes;
- SHA-512 coerente;
- `asarUnpack`: 2 arquivos.

O `dist` validado continua sendo o artefato local pré-existente, não um build
fresco produzido nesta sessão.

### Suíte completa

- testes: **152**;
- aprovados: **152**;
- falhas: **0**;
- cancelados: 0;
- ignorados: 0;
- todo: 0;
- `FULL_EXIT_CODE=0`.

### Workflow final

- jobs: 6;
- cache npm: 6/6;
- timeout: 6/6;
- resumo de falha: 6/6;
- upload: 1;
- publish: desabilitado;
- `package-lock.json`: inalterado.

### Limpeza

- resíduos `.step81-*` a `.step86-*`: 0;
- resíduos `efisco-step81-*` a `efisco-step86-*`: 0;
- `node_modules`: ausente.

O workflow ainda não foi executado remotamente no GitHub e nenhum build fresco
de CI foi observado nesta sessão.

## Estado da Etapa 8

- [x] 8.1 — inventário do fluxo de build/test atual
- [x] 8.2 — pipeline CI mínimo e reproduzível
- [x] 8.3 — jobs de testes unitários, integração, DB, fiscal e arquitetura
- [x] 8.4 — build/empacotamento e validações de release
- [x] 8.5 — falhas, artefatos, cache e endurecimento da CI
- [x] 8.6 — execução completa, limpeza e consolidação da Etapa 8

**Etapa 8 — CI: CONCLUÍDA.**

**Plano geral — Etapas 1 a 8: CONCLUÍDO.**


---

## Estado atual de CI — local privada

Após a conclusão da Etapa 8, a automação foi migrada de GitHub Actions para uma
pipeline PowerShell executada somente localmente.

Arquivos ativos:

- `ci/local-ci.ps1`;
- `ci/pipeline-contract.json`;
- `ci/validate-release.ps1`;
- `tests/unit/ci-workflow-contract.test.js`.

A pasta `.github` foi removida do projeto.

Comando principal:

```powershell
.\ci\local-ci.ps1
```

A pipeline local executa instalação limpa, guardrails, unit, integration, DB,
fiscal, architecture, self-tests, suíte completa, build NSIS e validação do
release.

Não há etapa de upload, publish ou armazenamento remoto de artefato.

A pipeline pode baixar Node.js/dependências necessárias, mas não possui comando
para enviar código-fonte ou `dist` para GitHub.

Validação após a migração:

- pipeline local: parse PowerShell OK;
- guardrails: **12/12**;
- suíte completa: **152/152**;
- JavaScript de produção: **29/29**;
- release: `RELEASE_VALIDATION=OK`;
- `.github`: ausente;
- `node_modules`: ausente;
- temporários: 0.

A tentativa de executar o bootstrap completo pelo conector excedeu o tempo
durante o download do Node portátil; os resíduos foram limpos. A regressão local
equivalente usando a runtime Electron instalada passou integralmente.

As referências a GitHub Actions nas seções históricas anteriores documentam a
evolução da Etapa 8 e não representam mais o estado ativo.




## Etapa 1.5/5 — testes de validação de origem e URL



Executado em 2026-09-25 com a instalação local do e-Fisco em modo Node (`ELECTRON_RUN_AS_NODE=1`), usando Electron 43.4.1 / Node 24.18.1. O self-test foi temporário e removido automaticamente após a execução; os validadores foram extraídos do próprio `main.js` para evitar testar uma reimplementação paralela.



Resultado: **31 testes aprovados, 0 falhas**.



Cobertura validada:

- parser seguro aceita URL absoluta e remove espaços externos;

- parser rejeita vazio, URL relativa e texto inválido;

- origem online aceita `https://jpiresoficial.wixstudio.com` e normalização de caixa do hostname;

- origem online rejeita HTTP, porta inesperada, credenciais embutidas, domínio sufixado malicioso, domínio externo com URL legítima no query e `data:`;

- origem offline aceita somente o `origin` exato `http://127.0.0.1:<porta-runtime>`;

- origem offline rejeita porta diferente, `localhost`, hostname semelhante/malicioso, HTTPS, credenciais embutidas e estado sem servidor offline criado;

- navegação interna aceita somente `efisco-update://start` (com tolerância apenas a espaços externos) e rejeita sufixo, barra extra, query extra e `data:`;

- checagem estática confirma ausência de validação por `startsWith('http://127.0.0.1...')` e `startsWith('http://localhost...')` no `main.js`.



Limite deste teste: ele valida a camada de parsing/allowlist da Etapa 1; bloqueio efetivo de navegação, novas janelas e redirects pertence às etapas seguintes.





## Etapa 2.1/5 — self-test da política da BrowserWindow



Executado em 2026-09-25 com Electron 43.4.1 / Node 24.18.1 em `ELECTRON_RUN_AS_NODE=1`, extraindo `classifyMainWindowNavigation()` e suas dependências diretamente do `main.js`.



Resultado: **16 testes aprovados, 0 falhas**.



Foram verificados: origem online principal; outro path/query/hash no mesmo origin; interceptação exata de `efisco-update://start`; bloqueio do origin da `WebContentsView` offline; bloqueio de `data:`, `file:`, HTTP, origem externa, domínio semelhante, `javascript:`, `about:blank` e URL inválida.



A política ainda não está aplicada ao `will-navigate`; este teste valida somente a classificação definida no Passo 2.1/5.





## Etapa 2.2/5 — self-test do will-navigate



Executado em 2026-09-25 com Electron 43.4.1 / Node 24.18.1 em `ELECTRON_RUN_AS_NODE=1`. O teste extraiu do próprio `main.js` a política e o callback registrado em `will-navigate`, usando um evento simulado para contar chamadas a `preventDefault()` e um stub do updater para contar interceptações.



Resultado: **9 testes aprovados, 0 falhas**.



Validado:

- same-origin online: não chama `preventDefault()`;

- outro path/query/hash no mesmo origin: não chama `preventDefault()`;

- `efisco-update://start`: chama `preventDefault()` e aciona o updater exatamente uma vez;

- domínio externo, domínio semelhante, HTTP, `file:`, `javascript:` e URL inválida: chamam `preventDefault()` e não acionam o updater.





## Etapa 2.3/5 — self-test de redirects



Executado em 2026-09-25 com Electron 43.4.1 / Node 24.18.1 em `ELECTRON_RUN_AS_NODE=1`, extraindo do próprio `main.js` os handlers de `will-navigate` e `will-redirect`.



Resultado: **11 testes aprovados, 0 falhas**.



Cobertura:

- `will-navigate` prioriza `event.url` moderno e mantém fallback legado;

- redirect main-frame same-origin é permitido;

- redirect main-frame externo, domínio semelhante, HTTP e `data:` são bloqueados;

- redirect para `efisco-update://start` é bloqueado e não aciona o updater;

- redirect de subframe externo não é bloqueado;

- formato legado de `will-redirect` foi testado para main frame e subframe.





## Etapa 2.4/5 — self-test de logging seguro de navegação



Executado em 2026-09-25 com Electron 43.4.1 / Node 24.18.1 em `ELECTRON_RUN_AS_NODE=1`, usando as funções e handlers extraídos diretamente do `main.js`.



Resultado: **15 testes aprovados, 0 falhas**.



Validado:

- HTTPS remove credenciais, path real, query e hash do destino registrado;

- `data:`, `javascript:` e `file:` são redigidos;

- URL inválida não é reproduzida no log;

- navegação `ALLOW` não gera log;

- `BLOCK` em `will-navigate` gera exatamente um log com evento, decisão, motivo, main-frame e destino sanitizado;

- `INTERCEPT` do updater gera log sem alterar o acionamento do updater;

- redirect main-frame bloqueado gera log sanitizado;

- redirect de subframe preservado não gera log;

- strings secretas usadas pelo self-test não apareceram nos payloads de log.





## Etapa 2.5/5 — regressão final de navegação Electron



Foi adicionado `tests/unit/electron-navigation-security.test.js` como teste permanente da política de navegação da `BrowserWindow`.



Execuções em 2026-09-25, usando Electron 43.4.1 / Node 24.18.1 em `ELECTRON_RUN_AS_NODE=1`:



1. Teste específico `electron-navigation-security.test.js`: **9 testes, 9 aprovados, 0 falhas**.

2. Verificação sintática `main.js --check`: **aprovada**.

3. Primeira suíte unitária completa sem `node_modules`: os testes executáveis passaram, mas `p0-core-contracts.test.js` não iniciou por `MODULE_NOT_FOUND: @xmldom/xmldom`.

4. Suíte unitária completa repetida com `NODE_PATH` apontando para as dependências empacotadas da instalação local (`resources/app.asar/node_modules`): **109 testes, 109 aprovados, 0 falhas**.



A falha intermediária foi, portanto, de resolução de dependência no checkout sem `node_modules`, não uma regressão funcional. A execução integral com a mesma versão instalada do Electron e dependências do aplicativo ficou totalmente verde.



**Etapa 2 validada e encerrada.**





## Etapa 3.1/5 — self-test da política de novas janelas



Executado em 2026-09-25 com Electron 43.4.1 / Node 24.18.1 em `ELECTRON_RUN_AS_NODE=1`, extraindo `RENDERER_WINDOW_OPEN_POLICY` e `classifyRendererWindowOpen()` diretamente do `main.js`.



Resultado: **18 testes aprovados, 0 falhas**.



Cobertura:

- política global `defaultAction: deny`;

- popups da `mainWindow` desabilitados;

- popups da `offlineView` desabilitados;

- abertura externa desabilitada;

- comando interno não pode virar popup;

- same-origin online é negado como popup;

- same-origin offline é negado como popup;

- alvo vazio ou inválido é negado;

- origem externa, domínio semelhante, HTTP, `about:blank`, `javascript:`, `file:` e `data:` são negados;

- source desconhecida é normalizada para `unknown` e negada.



Verificação sintática adicional: `main.js --check` aprovado.



O teste deste passo valida apenas a política; o bloqueio efetivo via `setWindowOpenHandler` será testado após sua instalação no Passo 3.2/5.





## Etapa 3.2/5 — self-test do setWindowOpenHandler da mainWindow



Executado em 2026-09-25 com Electron 43.4.1 / Node 24.18.1 em `ELECTRON_RUN_AS_NODE=1`, extraindo o callback real registrado em `mainWindow.webContents.setWindowOpenHandler(...)` do `main.js`.



Resultado: **25 verificações aprovadas, 0 falhas**.



Validado:

- same-origin online retorna `deny`;

- origem externa retorna `deny`;

- `data:` retorna `deny`;

- `efisco-update://start` retorna `deny`;

- URL inválida retorna `deny`;

- cada tentativa gera exatamente um log com `source: mainWindow`, action e reason corretos;

- query, path sensível e payload `data:` não aparecem no log;

- entrada inválida não é reproduzida no log;

- o handler é instalado antes de `mainWindow.maximize()` e antes do próximo `mainWindow.loadURL(...)`.



Verificação sintática adicional: `main.js --check` aprovado.





## Etapa 3.3/5 — self-test de navegação da offlineView



Executado em 2026-09-25 com Electron 43.4.1 / Node 24.18.1 em `ELECTRON_RUN_AS_NODE=1`, extraindo do próprio `main.js` `classifyOfflineViewNavigation()` e os handlers registrados em `offlineView.webContents`.



Resultado do self-test específico: **17 verificações aprovadas, 0 falhas**.



Validado:

- `http://127.0.0.1:<porta-runtime>` é permitido;

- outro path/query/hash no mesmo origin é permitido;

- porta diferente e `localhost` são bloqueados;

- origem online do e-Fisco é bloqueada na `offlineView`;

- `efisco-update://start`, `data:`, `file:` e origem externa são bloqueados;

- logs de `data:`, `file:` e URL externa não vazam segredo/path/query;

- `event.url` moderno tem precedência sobre argumento legado;

- redirect main-frame same-origin é permitido;

- redirect main-frame externo ou para porta diferente é bloqueado;

- redirects e `will-navigate` identificados como subframe são preservados;

- os handlers são instalados antes do `offlineView.webContents.loadURL(...)`.



Regressão adicional:

- `main.js --check`: aprovado;

- `tests/unit/electron-navigation-security.test.js`: **9 testes, 9 aprovados, 0 falhas**.





## Etapa 3.4/5 — self-test do setWindowOpenHandler da offlineView



Executado em 2026-09-25 com Electron 43.4.1 / Node 24.18.1 em `ELECTRON_RUN_AS_NODE=1`, extraindo o callback real registrado em `offlineView.webContents.setWindowOpenHandler(...)` do `main.js`.



Resultado: **37 verificações aprovadas, 0 falhas**.



Validado:

- popup same-origin offline retorna `deny`;

- popup para a origem online retorna `deny`;

- origem externa retorna `deny`;

- `data:` retorna `deny` e o payload não aparece no log;

- `efisco-update://start` retorna `deny`;

- URL inválida retorna `deny` sem reproduzir a entrada no log;

- porta offline diferente e `localhost` retornam `deny`;

- cada tentativa gera exatamente um log com `source: offlineView`, action e reason esperados;

- path, query e strings secretas não vazam no log;

- o handler é instalado antes de `will-navigate` e antes do `offlineView.webContents.loadURL(...)`.



Regressão adicional:

- `main.js --check`: aprovado;

- `tests/unit/electron-navigation-security.test.js`: **9 testes, 9 aprovados, 0 falhas**.





## Etapa 3.5/5 — regressão final de WebContents e popups



Foi adicionado `tests/unit/electron-webcontents-security.test.js` como teste permanente da Etapa 3.



Execuções em 2026-09-25 usando Electron 43.4.1 / Node 24.18.1 em `ELECTRON_RUN_AS_NODE=1`:



1. `electron-webcontents-security.test.js`: **9 testes, 9 aprovados, 0 falhas**.

2. `main.js --check`: **aprovado**.

3. Suíte unitária completa, com `NODE_PATH` apontando para as dependências empacotadas da instalação local: **118 testes, 118 aprovados, 0 falhas**.



O teste permanente cobre os dois `setWindowOpenHandler`, confinamento de navegação da `offlineView`, redirects, subframes, origem runtime exata, porta dinâmica, `localhost`, origem online/externa, comandos internos, esquemas sensíveis e sanitização dos logs.



**Etapa 3 validada e encerrada.**





## Etapa 4.1/5 — self-test do mapa de autorização IPC



Executado em 2026-09-25 com Electron 43.4.1 / Node 24.18.1 em `ELECTRON_RUN_AS_NODE=1`.



O teste extraiu diretamente do código:

- todos os registros `ipcMain.on(...)` e `ipcMain.handle(...)`;

- todos os registros via `instalarOfflineHandler(...)`;

- todos os canais usados pelo `preload.js` via `ipcRenderer.send`, `ipcRenderer.invoke` e `invokeChecked`;

- `IPC_CHANNEL_AUTHORIZATION_POLICY` e `IPC_SENDER_SCOPE` do próprio `main.js`.



Resultado: **83 verificações aprovadas, 0 falhas**.



Validado:

- exatamente 22 canais registrados no main;

- exatamente 22 canais expostos pelo preload;

- exatamente 22 entradas na política;

- conjuntos de canais são idênticos entre main, preload e política;

- transporte `send`/`invoke` coincide para cada canal;

- todo canal possui scope conhecido;

- `MAIN_WINDOW_TOP` implica `ONLINE_EXACT`;

- `OFFLINE_VIEW_TOP` implica `OFFLINE_RUNTIME_EXACT`;

- 4 canais são exclusivos da `mainWindow`;

- 18 canais são exclusivos da `offlineView`;

- nenhum canal aceita ambas as superfícies;

- a política ainda possui apenas sua definição e não foi ligada aos handlers neste passo.



Regressão adicional:

- `main.js --check`: aprovado;

- `electron-navigation-security.test.js` + `electron-webcontents-security.test.js`: **18 testes, 18 aprovados, 0 falhas**.





## Etapa 4.2/5 — self-test da identidade do remetente IPC



Executado em 2026-09-25 com Electron 43.4.1 / Node 24.18.1 em `ELECTRON_RUN_AS_NODE=1`, usando as funções reais extraídas do `main.js`.



Resultado específico: **19 verificações aprovadas, 0 falhas**.



Cobertura:

- main frame online válido da `mainWindow` é reconhecido como `MAIN_WINDOW_TOP`;

- main frame runtime válido da `offlineView` é reconhecido como `OFFLINE_VIEW_TOP`;

- `isMainWindowSender` e `isOfflineViewSender` distinguem corretamente as superfícies;

- `isAuthorizedAppSender` aceita somente superfícies que passaram por frame + URL + origin;

- `senderFrame` ausente ou destruído é rejeitado;

- subframes same-origin da `mainWindow` e da `offlineView` são rejeitados;

- `about:blank` com origin herdado online é rejeitado pela checagem simultânea da URL;

- URL online correta com `frame.origin` divergente é rejeitada;

- origin alegado correto com URL externa é rejeitado;

- URL online com credenciais é rejeitada;

- porta offline diferente e `localhost` são rejeitados;

- objeto sender diferente com ID copiado é rejeitado;

- `mainWindow` destruída e `offlineView.webContents` destruído são rejeitados.



Regressão adicional:

- `main.js --check`: aprovado;

- suíte unitária completa: **118 testes, 118 aprovados, 0 falhas**.





## Etapa 4.3/5 — self-test de autorização IPC por canal



Executado em 2026-09-25 com Electron 43.4.1 / Node 24.18.1 em `ELECTRON_RUN_AS_NODE=1`.



Resultado específico: **116 verificações aprovadas, 0 falhas**.



Cobertura dinâmica para todos os 22 canais:

- superfície correta + transporte correto é autorizada;

- superfície oposta é rejeitada;

- transporte incorreto é rejeitado;

- canal desconhecido falha fechado;

- transporte vazio falha fechado;

- `senderFrame` ausente falha fechado.



Cobertura estática da ligação aos handlers:

- 13 canais registrados diretamente por `ipcMain.on/handle`;

- 9 canais registrados por `instalarOfflineHandler`;

- cada handler direto contém `isIpcChannelAuthorized(event, <próprio-canal>, <transporte>)`;

- o wrapper usa `isIpcChannelAuthorized(event, channel, 'invoke')`;

- `instalarIpc()` não usa mais `isAuthorizedAppSender(event)`;

- `instalarIpc()` não usa mais `isOfflineViewSender(event)`;

- existem 14 pontos de autorização específica: 13 diretos + 1 wrapper.



Regressão adicional:

- `main.js --check`: aprovado;

- suíte unitária completa: **118 testes, 118 aprovados, 0 falhas**.





## Etapa 4.4/5 — self-test de escapes IPC



Executado em 2026-09-25 com Electron 43.4.1 / Node 24.18.1 em `ELECTRON_RUN_AS_NODE=1`.



Resultado do self-test de escapes: **26 verificações aprovadas, 0 falhas**.



Cobertura:

- main frame online válido continua autorizado;

- main frame offline runtime válido continua autorizado;

- subframes same-origin online/offline são rejeitados;

- frame `detached` é rejeitado;

- frame destruído é rejeitado;

- topologia inconsistente em `top` ou `parent` é rejeitada;

- `processId` e `frameId` divergentes são rejeitados;

- ausência dos IDs no evento ou no `WebFrameMain` é rejeitada;

- navegação programática da `mainWindow` para origin externo revoga IPC;

- `about:blank` com origin herdado não mantém autorização;

- página `data:` de update não herda IPC online;

- restauração do documento online válido restaura a autorização esperada;

- navegação programática da `offlineView` para origin externo revoga IPC;

- mudança de porta do `offlineUiServer` revoga o frame preso à porta antiga;

- restauração da porta runtime válida restaura a autorização offline;

- sender com ID copiado é rejeitado;

- senderFrame copiado com IDs iguais é rejeitado;

- superfície cruzada, transporte errado e canal desconhecido continuam fail-closed.



Regressão complementar pós-endurecimento:

- matriz de 22 canais: **66/66 combinações aprovadas**;

- `main.js --check`: aprovado;

- suíte unitária completa: **118 testes, 118 aprovados, 0 falhas**.





## Etapa 4.5/5 — regressão final de autorização IPC



Foi adicionado `tests/unit/electron-ipc-security.test.js` como teste permanente da Etapa 4.



Execuções em 2026-09-25 usando Electron 43.4.1 / Node 24.18.1 em `ELECTRON_RUN_AS_NODE=1`:



1. `electron-ipc-security.test.js`: **10 testes, 10 aprovados, 0 falhas**.

2. `main.js --check`: **aprovado**.

3. Suíte unitária completa, com `NODE_PATH` apontando para as dependências empacotadas da instalação local: **128 testes, 128 aprovados, 0 falhas**.



O teste permanente cobre:

- paridade entre main, preload e a política dos 22 canais;

- divisão 4 online / 18 offline;

- superfície e transporte por canal;

- fail-closed para canal desconhecido;

- spoofing de sender e senderFrame;

- `processId` / `frameId` divergentes ou ausentes;

- subframes same-origin;

- frame detached, destruído e topologia inconsistente;

- revogação de IPC após navegação para origem externa, `about:blank` e `data:`;

- revogação offline após mudança de origin ou porta runtime;

- regressão estática dos 14 pontos de autorização específica em `instalarIpc()`.



**Etapa 4 validada e encerrada.**





## Etapa 5.1/5 — suíte de segurança Electron consolidada



Foi criado `tests/unit/electron-security-suite-contract.test.js` e adicionado `test:electron-security` ao `package.json`.



O comando consolidado referencia explicitamente os três módulos funcionais de segurança e o novo contrato da suíte.



Resultados em 2026-09-25:

- `electron-security-suite-contract.test.js`: **6 testes, 6 aprovados, 0 falhas**;

- conjunto consolidado (navigation + webcontents + IPC + contract): **34 testes, 34 aprovados, 0 falhas**;

- `main.js --check`: aprovado;

- suíte unitária completa: **134 testes, 134 aprovados, 0 falhas**.



O contrato permanente valida:

- existência dos três módulos de segurança;

- composição do script `test:electron-security`;

- inclusão automática via `test:unit`;

- piso mínimo de 28 testes funcionais de segurança;

- cobertura estrutural das proteções de origin/navegação, popup/WebContents e IPC/frame;

- uso de `node:test` sobre o código real do projeto.



**Passo 5.1/5 validado.**





## Etapa 5.2/5 — regressão combinada de bypass



Foi adicionado `tests/unit/electron-security-bypass.test.js` e incluído em `test:electron-security` e no contrato da suíte.



Resultado específico: **9 testes, 9 aprovados, 0 falhas**.



Cobertura combinada:

- navegação + popup + IPC da `mainWindow` confiável;

- destino externo bloqueado nas três camadas;

- precedência de `event.url` malicioso e revogação IPC;

- comando interno de update sem popup e sem IPC na página `data:`;

- navegação + popup + IPC da `offlineView` confiável;

- escape externo offline com revogação de IPC;

- `localhost` e porta incorreta negados por navegação, popup e IPC;

- subframe same-origin sem herdar popup/IPC privilegiado;

- mudança da porta runtime invalidando navegação e IPC antigos.



Nenhuma falha de composição foi encontrada e nenhuma mudança de produção em `main.js` foi necessária.



Regressão final do passo:

- contrato consolidado: **6/6**;

- suíte Electron consolidada: **43/43**;

- piso funcional de segurança: **37 testes**;

- `main.js --check`: aprovado;

- suíte unitária completa: **143 testes, 143 aprovados, 0 falhas**.



**Passo 5.2/5 validado.**





## Etapa 5.3/5 — regressão funcional pós-hardening



Foi adicionado `tests/unit/electron-functional-regression.test.js` e incluído em `test:electron-security` e no contrato consolidado.



Resultado específico: **5 testes, 5 aprovados, 0 falhas**.



Fluxos validados na camada Electron:

- online confiável + impressão chegando à fila real do handler;

- isolamento da impressão contra a `offlineView`;

- login offline autorizado chegando ao validador, aplicação de perfil e criação de sessão;

- isolamento do login offline contra a `mainWindow` online;

- autorização legítima do PDV para caixa, venda e crediário.



Validação de negócio complementar:

- `payment-sale-input.test.js`;

- `db-domain-persistence.test.js`;

- `db-atomic-rollback.test.js`;

- `fiscal-end-to-end-controlled.test.js`;

- resultado do recorte: **18/18 testes aprovados**.



Regressão ampliada:

- contrato da suíte: **6/6**;

- suíte Electron consolidada: **48/48**;

- piso funcional de segurança: **42 testes**;

- `main.js --check`: aprovado;

- suíte unitária completa: **148/148**;

- suíte de integração completa: **52/52**.



Nenhuma incompatibilidade funcional foi encontrada e `main.js` não precisou ser alterado no Passo 5.3/5.



**Passo 5.3/5 validado.**





## Etapa 5.4/5 — auditoria estática final



Foi adicionado `tests/unit/electron-static-security-audit.test.js`, integrado ao comando `test:electron-security` e ao contrato consolidado.



Resultado específico da auditoria permanente: **10 testes, 10 aprovados, 0 falhas**.



A auditoria impede regressões em:

- WebPreferences (`nodeIntegration`, `contextIsolation`, `sandbox`, `webSecurity` etc.);

- abertura externa/popups fora da política;

- bypass de certificado/TLS;

- `eval` e `new Function`;

- handlers de navegação/popup da `mainWindow` e `offlineView`;

- marcadores privilegiados de console sem frame PDV reconhecido;

- contador NFC-e sem frame/origin coerente;

- ponte TOP de impressão sem origin pinado ou resposta com wildcard;

- ponte TOP do verificador sem origin pinado;

- relay de verificador no preload;

- relay A1 que não venha do iframe `scfOfflinePdv` no mesmo origin runtime.



Correções de produção realizadas durante a auditoria:

- contador NFC-e passou a exigir o frame PDV online reconhecido e `pedido.origin === frame.origin`;

- todos os marcadores privilegiados do canal `console-message` passam por `isTrustedPdvFrameForContents(...)`;

- ponte TOP de impressão fixa `TRUSTED_PDV_ORIGIN`, valida `event.origin` e usa esse origin como `targetOrigin` da resposta;

- ponte TOP do verificador fixa e valida o origin do PDV;

- relay redundante de verificador foi removido do preload;

- relay de certificado A1 exige mesmo origin do shell offline e source igual a `scfOfflinePdv.contentWindow`.



Self-test dinâmico das pontes: **11/11 verificações aprovadas**:

- impressão rejeita origin incorreto;

- impressão aceita origin confiável;

- resposta de impressão usa targetOrigin confiável;

- verificador rejeita origin incorreto e aceita origin confiável;

- relay A1 rejeita origin incorreto;

- relay A1 rejeita source incorreto;

- relay A1 aceita somente o iframe offline exato.



Regressão final do passo:

- suíte Electron consolidada: **58/58**;

- piso funcional de segurança: **52 testes**;

- suíte unitária completa: **158/158**;

- suíte de integração completa: **52/52**;

- `main.js --check` e `preload.js --check`: aprovados.



**Passo 5.4/5 validado.**





## Etapa 5.5/5 — fechamento final



Regressão final executada após todas as correções das Etapas 1–5.



Resultados:

- `main.js --check`: aprovado;

- `preload.js --check`: aprovado;

- suíte Electron dedicada: **58 testes, 58 aprovados, 0 falhas**;

- suíte unitária completa: **158 testes, 158 aprovados, 0 falhas**;

- suíte de integração completa: **52 testes, 52 aprovados, 0 falhas**;

- suíte combinada unit + integration: **210 testes, 210 aprovados, 0 falhas**.



A execução combinada final confirma simultaneamente as regressões de arquitetura, segurança Electron, domínio offline, SQLite/migrations, venda, caixa, crediário, outbox, numeração fiscal, XML/NFC-e, XMLDSig, QR Code e pipeline fiscal controlado.



Nenhuma alteração adicional de produção foi necessária no Passo 5.5/5.



**Etapa 5 encerrada.**



**Hardening Electron planejado nas Etapas 1–5 encerrado e validado.**

