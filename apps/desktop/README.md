# OmniGestão Pro para Windows (Electron)

Cliente desktop do OmniGestão Pro. Abre o sistema web da nuvem numa janela própria do Windows.
**Não é um ERP novo**: não embute Next.js, Prisma, banco, segredos ou regras de negócio.

```
Electron (Windows) ──HTTPS──> OmniGestão Pro na nuvem (Vercel) ──> PostgreSQL existente
```

- Uma origem HTTPS fixada **no empacotamento** (`build-config.json` dentro do asar). Não há tela,
  argumento ou variável de ambiente que troque o servidor em tempo de execução.
- Canais: `production` (só `https://omni-gestao-pro.vercel.app`), `qa` (só preview
  `https://omni-gestao-*-rafaelfaria49-4373s-projects.vercel.app`, nunca a origem de Produção;
  título, tela de status e selo âmbar na barra de tarefas mostram "QA"; tela cheia negada),
  `development` (só loopback; nunca vira instalador). O domínio legado `omni-gestao-pi` é recusado.
- Perfis separados: Produção em `%AppData%\OmniGestão Pro`, QA em `%AppData%\OmniGestão Pro QA`.

## Comandos

```bash
npm ci                              # dependências do desktop (separadas do Next.js)
node node_modules/electron/install.js   # baixa o binário do Electron (checksum verificado)
npm run typecheck
npm test                            # unitários (Vitest)
npm run test:e2e                    # Electron real contra servidor-fixture local
npm run build
node scripts/write-build-config.mjs --channel qa --origin https://<preview>.vercel.app
npx electron-forge make             # out/make/squirrel.windows/x64/OmniGestaoPro-QA-Setup.exe
node tests/packaged/smoke.mjs "<OmniGestaoPro.exe>"   # smoke do EXE real (só QA)
```

Ícones: `npm run icons` regenera `assets/icon.ico`/`icon.png` a partir de
`public/omni-gestao-pro-icon.svg` (o SVG público tem o "ã" corrompido; a cópia corrige).

## Segurança

| Item | Como |
|------|------|
| Página remota | `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, `webSecurity:true`, **sem preload e sem IPC** |
| Navegação | `will-navigate`/`will-redirect` decididos por `URL.origin` (nunca `startsWith`); `javascript:`, `file:`, `data:` e demais protocolos negados |
| Externos | https vai ao navegador do sistema; WhatsApp/Stripe direto, outros hosts com confirmação |
| Janelas | `window.open("")` (impressão via `document.write`) e documentos da mesma origem abrem em janela isolada com as mesmas guardas; o resto é negado |
| Permissões | câmera/microfone com consentimento por execução; Serial/USB/HID, geolocalização etc. negados |
| Tela local | servida por `omni-app://` só na sessão dela; IPC aceito só desse frame (3 ações fixas) |
| TLS | nenhum handler de certificado: erro de certificado bloqueia e é explicado |
| Fuses | RunAsNode OFF · NODE_OPTIONS OFF · `--inspect` OFF · cookies criptografados · asar com verificação de integridade · só carrega do asar · file:// sem privilégios extras |
| Depuração | Produção sai com código 1 se receber `--remote-debugging-port/pipe` ou `--inspect`. Pacotes de QA aceitam porta de depuração e `OMNI_DESKTOP_TEST_USER_DATA` (smoke/E2E) — não usar QA com dados reais |
| CSP | a do próprio site vale para a página remota; a tela local tem CSP estrita (`default-src 'none'`) |

## Logout e privacidade entre usuários

Ao chegar em `/login` vindo de outra tela (logout ou sessão expirada) o desktop:

1. remove o cookie `authjs.session-token` e **arma uma guarda**: se uma resposta atrasada regravar
   o cookie (corrida conhecida, #342/#345), ele é removido de novo; a guarda desarma no primeiro
   POST da tela de login (o próximo usuário entrando), então o cookie do novo usuário não é tocado;
2. fecha janelas de documento abertas pelo usuário anterior e zera câmera/microfone liberados;
3. apaga do Cache Storage os caches com dados (`apis`, `pages`, `pages-rsc*`, `next-data`…),
   mantendo só o precache estático do PWA; limpa o cache HTTP.

**Não** limpa localStorage/IndexedDB: lá ficam vendas do PDV pendentes de sincronização. Depois de
uma troca de usuário, o catálogo offline do PDV precisa de uma abertura online para ser recarregado.
A revogação definitiva no servidor continua dependendo da correção web (PR #345).

## Teclado

Sem menu nativo: nenhum acelerador do Electron intercepta F1–F12, Ctrl+L, Ctrl+R, Ctrl+W.
Atalhos do desktop usam só o acorde Ctrl+Shift+Alt: **V** (Sobre/versão), **R** (recarregar),
**I** (DevTools, fora de Produção).

## Impressão e Omni Print

Usa a impressão do próprio sistema (popup + diálogo do Windows). Não há ponte de impressão por
IPC, spooler próprio nem impressão silenciosa. O Omni Print (agente Windows) continua sendo o
caminho de impressão direta quando homologado e ativado: o desktop conversa só com o backend,
como o navegador.

## Offline (V1)

O desktop não cria fila própria nem reenvia operações. Sem rede: mostra a tela "Sem conexão",
sonda o servidor (HEAD) com espera crescente de 5 s a 60 s e só então **navega** de novo.
Vendas pendentes em localStorage/IndexedDB são preservadas; os caches de dados do SW são apagados
na troca de usuário (ver acima).
Funcionamento totalmente offline não é prometido nesta versão.

## Atualizações

- Sistema web: atualiza sozinho a cada deploy, como no navegador.
- Executável: novo instalador. A V1 só **avisa** (manifesto opcional na mesma origem, canal
  próprio, sha256, assinatura obrigatória em Produção). Não baixa, não instala e nunca reinicia
  sozinho. O "Sobre" mostra o SHA-256 publicado para o operador conferir o instalador baixado
  (o desktop não baixa o arquivo, então não o verifica sozinho). Sem manifesto configurado, a
  verificação fica desligada e o "Sobre" diz isso.

## Instalador

Squirrel.Windows, por usuário (`%LocalAppData%\OmniGestaoPro` ou `OmniGestaoProQA`), sem admin,
atalhos na Área de Trabalho e no Menu Iniciar, desinstalável em "Aplicativos instalados".
Desinstalar não apaga o perfil em `%AppData%` (pode conter vendas pendentes).
**Sem certificado de assinatura**: o pacote é de QA, não distribuir publicamente.
Para assinar: `OMNI_DESKTOP_CERT_FILE` + `OMNI_DESKTOP_CERT_PASSWORD` no build.
