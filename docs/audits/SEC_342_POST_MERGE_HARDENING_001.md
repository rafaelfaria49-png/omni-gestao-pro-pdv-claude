# OMNI-SECURITY-POST-342-HARDENING-001 — riscos da homologação da #342

- **Base:** `main` = `74e84f3` (merge da #342, em Production).
- **Escopo:** investigar e preparar correções; **sem** merge, deploy, migration, mudança de
  configuração produtiva, acesso a credencial ou dado real.
- **Ambiente de prova:** `next start` (build de produção) em `localhost:3006`, PostgreSQL 17
  descartável (porta 55462, `fsync=off`), 2 lojas sintéticas (`loja-1` "Loja Um QA" e `qa-b`
  "Padaria QA B", esta com cadastro básico incompleto) e 2 usuários sintéticos: admin de plataforma e
  dono STORE da `qa-b`, ambos com senha aleatória por execução e nunca registrada. Chromium (Playwright 1.52), com SW
  bloqueado ou ligado conforme o caso. "Antes" = build da árvore de `main`; "depois" = build com as
  4 correções. Evidências em `docs/ai-execution/_evidence/OMNI-SECURITY-POST-342-HARDENING-001/`.

| # | Item | Antes (main) | Depois | PR |
|---|---|---|---|---|
| 1 | Domínio legado | público, build de 25 dias, NextAuth 500, PIN legado | só investigado (nada alterado) | relatório |
| 2 | Logout | 4/5 logouts naturais **não** encerraram a sessão; resposta atrasada ressuscita o cookie (1/1) | 6 logouts naturais + 1 com resposta atrasada: todos encerrados | `logout-verificado` |
| 3 | Consulta da `loja-1` com outra loja ativa | 9 GETs por 3 cargas (admin); no teste do provider: 6 GETs + `POST sync-ledger` + `POST venda-persist` na `loja-1` | 0 | `isolamento-loja-legada` |
| 4 | Cache do SW após logout | `/api/stores` (lista de lojas da plataforma), inventário, ordens, crédito de cliente e HTML do painel ficam 24 h em disco; nada os apagava | caches de sessão apagados após logout confirmado; `/dashboard` offline cai no login; `localStorage` 11/11 chaves preservadas | `cache-logout` (empilhada) |
| 5 | Assistente de configuração | reabre a cada recarga e navegação completa | adiamento vale para a sessão da aba; "Retomar" disponível | `assistente-adiado` |

## 1. Domínio legado `omni-gestao-pi.vercel.app` (somente leitura; nada alterado)

| Verificação | Resultado | Fonte |
|---|---|---|
| Projeto | `omni-gestao` (`prj_IbJi32rh4TsQwWFYYVVjs133fw3H`), ligado ao mesmo repositório, branch de produção `main` | API Vercel `/v9/projects` |
| Domínio | `omni-gestao-pi.vercel.app` é o **único** domínio do projeto (verificado; sem domínio próprio) | `/v9/projects/omni-gestao/domains` |
| Build servido | último Production READY: `dpl_H9sR4GHi…`, commit `e9eb984` (#278, 2026-10-15), **259 commits atrás** de `main` | `/v6/deployments` |
| Builds novos | todo Production é cancelado pelo Ignored Build Step `VERCEL_ENV === 'production' ? 0 : 1` (intencional); Preview continua sendo gerado e aparece como check "Vercel – omni-gestao" nas PRs | projeto + checks da #342 |
| Proteção | `ssoProtection: all_except_custom_domains` → o alias `*.vercel.app` do projeto é **público** (200 sem login); URLs de deployment pedem SSO | API + `curl` |
| Autenticação | NextAuth quebrado: `/api/auth/session` e `/api/auth/providers` → 500 (sem `AUTH_SECRET` em production). `/dashboard` → 200 com o AccessGate de **PIN legado**; `ASSISTEC_MASTER_PASSWORD` existe no projeto | `curl` anônimo + nomes de env |
| APIs | `/api/stores`, `/api/clientes`, `/api/ops/inventory` → 401; `/api/ops/caixa/sessoes` com loja inexistente → 401 | `curl` anônimo |
| Banco | `DATABASE_URL`/`DIRECT_URL` de production atualizadas em **2026-05-08** (no `omni-gestao-pro`: 2026-07-27, após o cutover Neon). Valor **não lido** (vedado) → destino real **não confirmado** | metadados de env |
| Integrações | sem cron, sem deploy hook; `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` e `WHATSAPP_ACCESS_TOKEN` presentes (2026-05-09/10). Se algum webhook Stripe/Meta ainda aponta para este domínio, **só o painel Stripe/Meta mostra**: não acessado | nomes de env |
| Uso real | **não comprovável**: os logs de runtime da Vercel (CLI e API) não devolvem histórico para este deployment; não há analytics habilitado. A doc (`docs/ai/DEPLOY.md`, `CURRENT_STATUS.md` 04/08) fala em "tráfego residual de PWA/assets/páginas públicas, sem operação de negócio comprovada" | Vercel logs + docs |
| Referências no código | só fixture de teste (`app/api/fiscal/wsdl/ephemeral-execution/route.test.ts`, origem legada recusada) e evidências/docs | `git grep` em `main` |

**Risco:** build público de 25 dias, sem as correções de isolamento, cache e logout nem a #342, com a porta
de PIN legada aberta e banco de destino desconhecido (provavelmente anterior ao cutover). PWA instalado nessa origem
continua usando esse build.

**Proposta (decisão do proprietário — não executada):**
1. Antes de mexer: no painel Stripe (Developers → Webhooks) e Meta (WhatsApp → Configuration),
   confirmar que nenhum endpoint usa `omni-gestao-pi.vercel.app`.
2. Opção mínima e reversível: ligar Vercel Authentication também para o domínio de produção do
   projeto `omni-gestao` (Deployment Protection → "All Deployments"). Isso tira o acesso público sem
   apagar nada.
3. Opção definitiva: remover o domínio `omni-gestao-pi.vercel.app` do projeto (ou redirecioná-lo
   para `omni-gestao-pro.vercel.app`) e, se não houver dependência, rotacionar
   `ASSISTEC_MASTER_PASSWORD` e as credenciais de banco guardadas nesse projeto.

## 2. Logout: `authjs.session-token` sobrevivendo ao signout

**Causa.** Com sessão JWT, o `auth()` do `proxy.ts` e `GET /api/auth/session` **regravam o cookie de
sessão em toda resposta autenticada** (QA: página, API e sessão, as três com `Set-Cookie:
authjs.session-token`). Qualquer resposta que saiu do servidor antes do signout e chega depois dele
recria o cookie. Exemplos: o `SessionRevalidator` (30 s), o polling do catálogo, `/api/version` e as
cargas do painel. A tela mostra `/login`, mas a sessão continua válida. É o mesmo sintoma do 1º CI da #342 (run
42598345652, tentativa 1: `remaining: ["authjs.session-token"]`, `authenticated: true`).

**Reprodução (antes):**
- logout natural pela UI: **4 de 5 falharam**. Em `before/p6_natural_logout_runs.jsonl`, 3/3 terminaram
  autenticadas, uma delas de volta em `/dashboard`. O P4 da linha de base também falhou: o login do 2º
  usuário caiu no painel do 1º;
- com uma resposta de `/api/auth/session` segurada até depois do signout: cookie ressuscitado,
  `authenticated: true`, `/dashboard` → 200 (`before/p1_logout.json`).

**Impacto.** Em navegador ou caixa compartilhado, "Encerrar sessão" pode deixar a sessão do usuário
anterior ativa para quem vier depois, com todas as permissões dele.

**Correção (PR `claude/sec-342-logout-verificado`).** "Encerrar sessão" faz navegação completa (o que cancela
as consultas do painel) para `/login/sair`, uma página pública fora do painel. A página espera 800 ms,
chama `signOut({ redirect: false })` e confere `GET /api/auth/session` sem cache, com até 3 tentativas. Só segue para `/login`
quando o **servidor** confirma que não há sessão; senão mostra erro honesto e "Tentar novamente".
Configuração do NextAuth, proxy e schema **não mudam**.

**Depois:** 6 logouts naturais (`after/p6_natural_logout_runs.jsonl` 3/3, P4, P6 e P7) mais o caso com
resposta atrasada (3 respostas seguradas, `after/p1_logout.json`): cookie ausente,
`authenticated: false`, `/dashboard` → 307.

**Limite conhecido.** Uma outra aba do painel aberta com requisição em voo exatamente no instante do
signout ainda pode regravar o cookie. A verificação repetida cobre a janela das tentativas, e o
`next-auth` avisa as outras abas pelo `BroadcastChannel`. Fechar isso no servidor exige
revogação por sessão. Há duas saídas, ambas decisão do proprietário: `sessionVersion++` no signout,
que encerra **todas** as sessões do usuário, inclusive outros terminais com a mesma conta; ou
uma tabela de revogação, que é mudança de schema.

## 3. Consulta da `loja-1` com outra loja ativa

**Causa.** No primeiro render, antes de a loja ativa resolver, `useLojaAtiva().opsStorageKey` é a chave
legada `assistec-pro-ops-v1` e `opsLojaIdFromStorageKey` a converte em `LEGACY_PRIMARY_STORE_ID =
"loja-1"`. O `OperationsProvider` monta com ela e dispara inventário, ordens, caixa, vendas e crédito
da `loja-1`. Se a montagem durar, dispara também o `PUT /api/ops/ordens`, o `POST /api/ops/sync-ledger` e o reenvio da
fila (`POST /api/ops/venda-persist`). O comentário de `lib/loja-ativa.tsx` diz "nunca loja-1", e é o
`ops-loja-id.ts` que faz a conversão.

**Prova (antes).** Navegador, admin da plataforma com a Padaria QA B ativa: 9 GETs para `loja-1` em 3
cargas, com 200 para quem tem acesso (`before/p2_loja1.json`). O dono B, sem acesso à `loja-1`, recebeu
403 nas mesmas chamadas: o servidor isola, o cliente não. No teste do provider real, com uma venda
pendente na chave legada: 6 GETs, `POST sync-ledger` e `POST venda-persist` para a `loja-1`.

**Correção (PR `claude/sec-342-isolamento-loja-legada`).** Com a chave legada o provider não faz rede.
Não há carga do banco (`opsDbReady` fica falso), sync de catálogo, reconciliação de caixa nem livro diário.
Hidratação e persistência locais não mudam, e a fila fica intacta, inclusive para a migração
legada → `loja-1`.

**Depois:** 0 requisições à `loja-1` (`after/p2_loja1.json`, P4 e P6). O teste
`lib/operations-store-loja-resolvida.component.test.ts` reprova o código original e passa com a correção.
Suítes do provider (offline-sync, classic-offline-sequence, 4 de paridade): 105/105.

**Observação.** As chaves locais `omnigestao:caixa:loja-1` e `assistec-pro-ops-v1` continuam sendo
criadas pela montagem legada, só no `localStorage` e sem rede. Mudar isso mexe na migração legada e
ficou fora de escopo.

## 4. Cache do service worker e armazenamento local

| Armazenamento | O que guarda | Risco | Decisão |
|---|---|---|---|
| SW `apis` (NetworkFirst 24 h, chave = URL) | `/api/auth/session`, `/api/stores` (para a plataforma: todas as lojas), `/api/ops/inventory`, `/api/ops/ordens`, `/api/ops/credito-cliente`, `/api/user/credits`, `/api/stores/<id>/settings` | dado em disco após logout; offline, servido a quem abrir o navegador | **apagar no logout confirmado** |
| SW `pages`, `pages-rsc*`, `start-url`, `next-data` | HTML/RSC do painel renderizado para o usuário | idem | **apagar no logout confirmado** |
| SW precache e assets estáticos | JS/CSS/imagens do build | nenhum dado de usuário | manter (o app abre offline no login) |
| `localStorage` por loja (`assistec-pro-ops-v1-<loja>`, `omnigestao:caixa:<loja>`, financeiro) | fila de vendas offline, carrinho, caixa local, tentativas | apagar perde venda | **manter** (exigência). A troca de usuário já é barrada por `canAccessStore`; na mesma loja a fila é compartilhada por design |
| cookie `assistec-active-store` | última loja ativa | ao trocar de usuário, o próximo pode receber `/dashboard?storeAccess=denied` uma vez | registrado, fora de escopo |

**Por que não NetworkOnly para `/api/auth/session` e `/api/stores`:** o boot do PDV offline usa a
lista de lojas em cache para resolver a loja. Tirar o cache quebraria a recarga offline com sessão
ativa. O risco é o dado em repouso **depois** do logout, então a limpeza é feita lá.

**Correção (PR `claude/sec-342-cache-logout`, empilhada sobre o logout).** Após a confirmação do servidor,
`/login/sair` apaga só `apis`, `pages`, `pages-rsc`, `pages-rsc-prefetch`, `next-data`,
`static-data-assets`, `cross-origin` e `start-url`.

**Depois** (`after/p4_cache.json`, `after/p6_storage.json`): `apis` vazio após o logout; `/dashboard`
offline vai para `/login?callbackUrl=…` sem nada do admin; `localStorage` 11/11 chaves iguais antes e depois,
incluindo `assistec-pro-ops-v1-loja-1` e um marcador offline; o 2º usuário não vê a lista de lojas do 1º.
E2E offline real (`10-pdv-offline-sync`, SW **ligado**, build com as 4 correções): 1 passed.
Vendas offline ficaram só no terminal, sincronizaram uma vez cada e nenhuma rota NetworkOnly entrou no cache
(`after/sw-offline-e2e-isolation.json`).

**Limite da prova.** O probe que injetava uma venda pendente sintética no `localStorage` (P7) não
serviu: o parser da fila descarta o registro sintético nos **dois** builds, antes do logout. A
preservação da fila está provada pela igualdade das chaves do `localStorage` e pelo E2E offline real,
não por uma venda pendente atravessando o logout.

## 5. Assistente de configuração

**Causa.** Em `FirstAccessForStore`, `open` nascia `true` em memória (`useState(true)`), e "Voltar
depois"/fechar só alterava esse estado. Recarga, navegação completa ou troca de loja remontam a árvore,
e o assistente volta.

**Antes** (`before/p3_wizard.json`): fecha, some na navegação interna e **reabre** na recarga e na
navegação completa.

**Correção (PR `claude/sec-342-assistente-adiado`).** O adiamento vai para o `sessionStorage`, na chave do escopo
(usuário + `sessionVersion` + loja). "Retomar" e "Concluir" desfazem o adiamento. Nenhum dado de
cadastro é gravado no navegador.

**Depois** (`after/p3_wizard.json`): não reabre na recarga nem na navegação completa; aparece
"Retomar configuração inicial". Teste novo reprova o original e passa; outro usuário na mesma aba volta a ver.

## Validação

| Gate | Resultado |
|---|---|
| `npm run typecheck` (worktree integrada) | exit 0 |
| `eslint` nos arquivos alterados | exit 0 |
| `npm run build` (worktree integrada) | "Compiled successfully", `/login/sair` presente |
| Vitest novos + suítes do `OperationsProvider` (Node 22) | 105/105 |
| E2E offline com SW ligado (QA) | 1 passed |
| Probes antes/depois (QA) | tabela acima |
| CI das PRs | ver cada PR |

## Pendências e bloqueios

1. **Domínio legado:** decisão do proprietário (passos da seção 1); uso real e webhooks não verificáveis sem
   os painéis Stripe/Meta e sem histórico de logs.
2. **Revogação de sessão no servidor:** decisão do proprietário (`sessionVersion` global ou schema).
3. **Cookie `assistec-active-store`** sobrevive ao logout (UX do 2º usuário): fora de escopo.
4. **Chaves locais da montagem legada:** fora de escopo (migração legada).
