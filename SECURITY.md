# Security Policy

## Dados que não devem entrar no repositório

Não faça commit de:

- certificados A1, arquivos PFX/P12, PEM ou chaves privadas;
- senhas, tokens, API keys ou credenciais de dispositivos;
- bancos SQLite ou dados reais de clientes, empresas ou operadores;
- arquivos `.env` com configuração privada;
- builds em `dist/` ou dados do perfil local do aplicativo.

O `.gitignore` contém guardrails para essas categorias, mas a revisão antes do commit continua obrigatória.

## Relato de vulnerabilidades

Evite publicar detalhes exploráveis, credenciais ou dados pessoais em uma issue pública.

Quando disponível, prefira o canal privado de **Security Advisories** do GitHub. Caso ele não esteja habilitado, use um canal privado indicado pelo proprietário do repositório antes de divulgar detalhes técnicos sensíveis.

## Escopo

Achados relacionados a autenticação, IPC Electron, navegação, atualização, armazenamento de certificado fiscal, sincronização e emissão NFC-e devem ser tratados como potencialmente sensíveis até triagem.
