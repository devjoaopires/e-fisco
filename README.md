# e-fisco Desktop

Aplicação desktop em Electron para operação fiscal e comercial, com foco em continuidade offline, sincronização posterior e emissão NFC-e.

Esta release pública corresponde à versão **1.0.41** e é mantida como portfólio técnico do projeto.

## Destaques técnicos

- Electron 43 / Node 24.
- Aplicação Windows empacotada com electron-builder e NSIS x64.
- Persistência offline em SQLite.
- Fluxos de caixa, vendas, crediário, produtos e sincronização por outbox.
- Pipeline fiscal NFC-e com XML, assinatura, QR Code, DANFE, contingência e transporte SVRS.
- Isolamento entre a interface online e a interface offline.
- Guardrails de segurança para navegação, IPC e WebContents.
- Testes unitários e de integração com `node:test`.
- CI em GitHub Actions com jobs especializados e build condicionado aos testes.

## Arquitetura

A documentação detalhada está em:

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [TESTING.md](TESTING.md)
- [CI.md](CI.md)

Os módulos de domínio ficam principalmente na raiz do projeto como `offline-*.js`. A interface offline está em `offline-ui/`.

## Desenvolvimento

Requisitos principais:

- Windows;
- Node.js 24.18.1 para reproduzir a toolchain da CI;
- npm.

Instalação limpa:

```powershell
npm ci --no-audit --no-fund
```

Testes:

```powershell
npm test
```

Recortes disponíveis:

```powershell
npm run test:unit
npm run test:integration
npm run test:db
npm run test:fiscal
npm run test:architecture
npm run test:electron-security
npm run test:ci
```

Build local:

```powershell
npm run dist
```

O build gera um instalador NSIS x64 em `dist/` e usa `--publish never`.

## CI e distribuição

O projeto separa build/validação de distribuição:

- **GitHub:** código-fonte, testes, CI e artefatos temporários de build.
- **Cloudflare R2:** canal de distribuição usado pelo mecanismo de atualização automática.

O workflow não publica automaticamente no R2. Um build de CI precisa ser validado antes de qualquer promoção para o canal de atualização.

## Segurança e privacidade

O repositório não deve conter certificados A1 privados, tokens, credenciais, bancos locais ou dados reais de clientes/empresas.

Fixtures e documentos usados nos testes são artificiais. Consulte [SECURITY.md](SECURITY.md) para a política de divulgação de vulnerabilidades.

## Código de terceiros

Arquivos vendorizados em `offline-ui/vendor/` mantêm suas licenças originais. Consulte [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Licenciamento do código do e-fisco

A publicação deste repositório para fins de portfólio e revisão técnica **não concede automaticamente uma licença de uso, cópia, modificação ou redistribuição do código original do e-fisco**.

Os componentes de terceiros continuam sujeitos às respectivas licenças indicadas no repositório.
