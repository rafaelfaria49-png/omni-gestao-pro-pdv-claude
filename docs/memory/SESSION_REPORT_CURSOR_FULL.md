# Relatório técnico consolidado — sessão Cursor (OmniGestão Pro)

**Escopo:** consolidação da sessão documentada neste chat e nos handoffs associados (Operações HUB Fase 1, WhatsApp Meta webhook, Histórico de clientes, diagnósticos e infraestrutura Vercel).  
**Data de referência:** maio/2026.  
**Repositório:** `omni-gestao` / remoto `omni-gestao-pro`.

---

## 1. Visão geral da sessão

### Objetivo principal

Evoluir o **OmniGestão Pro** em três frentes encadeadas:

1. **Operações HUB (Fase 1 — somente leitura):** conectar listagem e detalhe de OS ao **Prisma real**, sem reescrever UI nem tocar estoque/financeiro.
2. **WhatsApp (Meta Cloud API):** corrigir **404**, **rewrites**, **handshake GET** e visibilidade de **query string** em produção na **Vercel**.
3. **Histórico de clientes:** após Fase 1, corrigir **vínculo cliente ↔ OS** e **valores** quando dados vêm de **FK + payload legado**; em seguida, expor **diagnóstico server-side** via API de debug.

### Módulos envolvidos

| Área | Componentes |
|------|-------------|
| Operações HUB V2 | `OperacoesHubIsolated`, `OSProvider` / `osStore`, `api/os`, páginas `HistoricoClientes`, `OSDetalhe`, `OrdensServico` |
| Backend OS | `app/actions/ordens.ts`, `app/actions/operacoes.ts`, `lib/operacoes/services/hydration-service.ts` |
| Multi-loja | `lib/loja-ativa.tsx`, `lib/store-defaults.ts` (`LEGACY_PRIMARY_STORE_ID`) |
| WhatsApp | `app/api/whatsapp/webhook/route.ts`, `app/api/webhooks/whatsapp/route.ts`, `lib/whatsapp-meta-handshake.ts`, `next.config.mjs` |
| Debug | `app/api/debug/operacoes-history/route.ts`, `app/api/debug/prod-health/route.ts` (contexto) |

### Problemas principais trabalhados

- Listagem OS “real” mas **Histórico** com **0 OS / R$ 0** por desalinhamento **`clienteId`** e orçamento só no payload/colunas Prisma.
- **Meta webhook:** path `/api/webhooks/whatsapp` com **404** apesar de rewrite; **GET** não respondendo com **challenge**; suspeita de **query** não vista pelo handler.
- **Deploy / Vercel:** comportamento diferente entre path canônico e rewrite; necessidade de **route handler físico** e de **diagnóstico forçado** no GET.

### Contexto arquitetural

- **Next.js 16** App Router, **React 19**, **Prisma 6** + **PostgreSQL** (Supabase).
- Hubs Lovable rodam em **MemoryRouter**; estado de Operações via **React Context** (`OSProvider`) alimentado por **Server Actions** e APIs locais (`@/api/os`).
- OS no banco: tabela **`ordens_servico`**, **`payload` JSONB** como fonte rica; colunas **`clienteId`**, **`storeId`**, **`valorTotal`**, **`valorBase`**, enum **`status`** colapsado.

---

## 2. Timeline cronológica

Ordem aproximada das grandes frentes (como tratadas na sessão):

| # | Tarefa | Motivação | Investigação | Alteração | Resultado |
|---|--------|-----------|--------------|-----------|-----------|
| 1 | **Operações Fase 1 — leitura** | Substituir percepção de “mock” por Prisma; alinhar **loja ativa** | `osStore` → `listOrdens`; `listOS` já usava Prisma; gap era **`initialStoreId`** e actions dedicadas | `app/actions/ordens.ts`; delegação `listOS` → `listOrdens`; `OperacoesHubIsolated` + `useLojaAtiva`; `OSDetalhe` + `fetchOrdem`; `OSProvider` com `initialStoreId` | Listagem/detalhe leem **mesma camada**; multi-loja alinhada ao dashboard |
| 2 | **WhatsApp 404 + rewrite** | Meta apontava `/api/webhooks/whatsapp`; 404 na Vercel | `next.config.mjs` rewrite; handler em `/api/whatsapp/webhook` | Rewrite + rota **espelhada** `app/api/webhooks/whatsapp/route.ts` | Path legado deixa de depender só do rewrite |
| 3 | **Handshake GET Meta** | URL com `hub.*` ainda retornava JSON de ajuda | `Request` vs `NextRequest`; `new URL(request.url)` vs **`nextUrl.searchParams`** | `GET` com `NextRequest`; `metaWebhookHandshakeGetResponse(request.nextUrl)`; `Cache-Control` no JSON genérico | Handshake alinhado à API Route do Next |
| 4 | **Diagnóstico GET (logs + JSON)** | Confirmar por que não entrava no `if (subscribe && challenge)` | Logs estruturados; resposta `meta_get_diagnostic` | Commit dedicado (ver §11) | Visibilidade em runtime |
| 5 | **Probe forçado no topo do GET** | Resposta ainda “antiga” / provar chegada da **query** na Vercel | Primeira linha do GET retorna só `rawUrl`, `nextUrl`, `entries` | `FORCE_META_GET_URL_PROBE` (default on até `WHATSAPP_META_GET_FORCE_PROBE=0`) | Isolamento: query chega ou não no worker |
| 6 | **Histórico clientes** | Clientes reais, **0 OS** | `HistoricoClientes` filtra só `o.clienteId === c.id`; hidratação ignorava FK quando payload era válido | `hydration-service`: `resolveClienteId`, `mergeOrcamentoFromPrismaRow`; `PrismaOSRow` + `mapRows` com `valorTotal`/`valorBase` | Vínculo e totais mais fiéis ao banco |
| 7 | **API debug `operacoes-history`** | Cravar causa: store, FK, payload nome/telefone | Prisma `groupBy`, contagens, `$queryRaw` ILIKE / telefone normalizado | `app/api/debug/operacoes-history/route.ts` | Diagnóstico reproduzível sem mudar UI |

---

## 3. Webhook WhatsApp Meta

### Problema inicial

- Configuração Meta apontando para caminhos sob **`/api/webhooks/...`**.
- Em **produção (Vercel)**, respostas **404** para **`/api/webhooks/whatsapp`** enquanto **`/api/whatsapp/webhook`** respondia **200** com JSON informativo.
- Objetivo: **URL estável** para verificação **GET** (`hub.mode`, `hub.verify_token`, `hub.challenge`) e **POST** assinado.

### Rotas envolvidas

| Rota | Papel |
|------|--------|
| **`/api/whatsapp/webhook`** | Handler **canônico** (GET handshake + POST Meta Cloud + legado Evolution com secret) |
| **`/api/webhooks/whatsapp`** | URL **legada / documentada**; inicialmente só **rewrite**; depois **re-export** do handler |
| **`/api/webhooks/stripe`** | Outro webhook (sem alteração de lógica nesta sessão) |

### 404 na Vercel e rewrite

- **`next.config.mjs`**: `rewrites()` mapeia `source: /api/webhooks/whatsapp` → `destination: /api/whatsapp/webhook`.
- **Observação empírica:** em `omni-gestao-pro.vercel.app`, o **rewrite não resolveu** o 404 no path fonte; o destino funcionava.
- **Decisão:** criar **arquivo físico** `app/api/webhooks/whatsapp/route.ts` que reexporta `GET`/`POST`/`OPTIONS` (e segmentos de config) do route canônico, para não depender do rewrite no edge.

### Route handlers e arquivos

- **`app/api/whatsapp/webhook/route.ts`**: implementação completa; `runtime = "nodejs"`, **`dynamic = "force-dynamic"`, `revalidate = 0`**.
- **`app/api/webhooks/whatsapp/route.ts`**: alias por re-export (build pode avisar que `dynamic`/`revalidate`/`runtime` não são reconhecidos no re-export — comportamento conhecido).

### Handshake Meta

- **`lib/whatsapp-meta-handshake.ts`**: valida `hub.mode === subscribe`, `hub.challenge`, compara `hub.verify_token` com env (`WHATSAPP_VERIFY_TOKEN` e aliases documentados no arquivo).
- Sucesso: **200**, corpo texto **`challenge`**, `Content-Type: text/plain`.

### `request.nextUrl` e query params

- Problema: uso de **`new URL(request.url)`** no GET às vezes **não refletia** a query como esperado no App Router.
- Solução: **`GET(request: NextRequest)`** e leitura com **`request.nextUrl.searchParams`** antes do handshake.
- JSON de fallback recebeu **`Cache-Control: no-store`** para reduzir risco de **cache** de GET sem variar por query.

### Forced probe (diagnóstico)

- **Objetivo:** provar se **`hub.*` chega** ao handler na Vercel.
- **Implementação:** no topo do GET, se **`FORCE_META_GET_URL_PROBE`** ativo (padrão **ligado** enquanto `WHATSAPP_META_GET_FORCE_PROBE` **não** for `0`/`false`), resposta **somente**:
  - `phase: "meta_get_forced_probe"`
  - `rawUrl`, `nextUrl`, `entries` (searchParams).
- **Efeito colateral:** **Meta não pode verificar** o webhook enquanto o probe estiver ativo — desligar via env após diagnóstico.
- Lógica completa do handshake ficou em **`whatsAppWebhookGetAfterProbe`**.

### Commits relacionados (ordem cronológica na `main`)

1. **`cd2e645`** — `fix(vercel): Meta WhatsApp webhook URL via rewrite`  
2. **`873bff8`** — Operações (ver §4); não é WhatsApp, mas entre rewrites e hub no mesmo período  
3. **`d235fd7`** — `fix(vercel): physical Meta webhook path alias (/api/webhooks/whatsapp)`  
4. **`8d705f6`** — `fix(whatsapp): Meta GET handshake via nextUrl.searchParams + no-store on debug JSON`  
5. **`e0ce259`** — `chore(whatsapp): temporary Meta GET handshake diagnostic logs and JSON`  
6. **`e79b9db`** — `chore(whatsapp): forced GET probe for Vercel query string (WHATSAPP_META_GET_FORCE_PROBE=0 to disable)`

### Status atual (ao fecho do relatório)

- **Probe forçado** tende a estar **ativo** por padrão até deploy com env **`WHATSAPP_META_GET_FORCE_PROBE=0`** ou remoção do código.
- **URLs recomendadas:**
  - Produção Meta (após desligar probe): **`https://<domínio>/api/whatsapp/webhook`** (menos dependência de rewrite).
  - Alternativa: **`/api/webhooks/whatsapp`** com handler físico.

### Variáveis de ambiente (relevantes)

| Env | Uso |
|-----|-----|
| `WHATSAPP_VERIFY_TOKEN` / aliases no handshake | Token do painel Meta |
| `WHATSAPP_APP_SECRET` / `META_APP_SECRET` | Validação `X-Hub-Signature-256` no POST |
| `ASSISTEC_WHATSAPP_WEBHOOK_SECRET` | Gate opcional legado (headers/query `token`) |
| `WHATSAPP_META_GET_FORCE_PROBE` | `0` ou `false` desliga probe forçado |
| `WHATSAPP_META_GET_FORCE_PROBE` | (nome exato no código; ver `route.ts`) |

### Hipóteses restantes

- **Cache** intermediário (CDN, proxy) servindo resposta antiga para path sem query — mitigado com `no-store`, probe mostra `entries` vazio ou cheio.
- **Deploy / projeto errado** no painel Vercel se resposta não refletir último commit.
- **Re-export** do route alias: avisos de build sobre `dynamic` — validar runtime real em produção.

### Conclusões técnicas

- **Rewrite Next** nem sempre equivale a “mesmo comportamento” que route file no edge da Vercel para este path.
- **NextRequest.nextUrl** é a fonte preferida para **query** em Route Handlers.
- **Diagnóstico temporário** no GET deve ser **removido ou desligado por env** após coleta de evidências.

---

## 4. Operações HUB / Prisma

### Migração gradual e Fase 1

- **Não** foi “trocar tudo por mock”: a API `listOrdens` já chamava `listOS` (Prisma); a Fase 1 **centralizou leitura** em **`app/actions/ordens.ts`** e **alinhou `storeId`** ao dashboard.

### `listOrdens` / `getOrdem`

- **`listOrdens(lojaId, filters?)`**: `withPrismaSafe`, `findMany` com `storeId`, filtros opcionais (`statusPrisma`, `q`), `take: 500`, **`hydrateOSRows`**.
- **`getOrdem(lojaId, osId)`**: `findFirst` por `id` + `storeId`.
- **`listOS`** em **`operacoes.ts`**: delega para **`listOrdensRead`** (evita duplicar mapeamento).

### `hydration-service`

- Entrada **`PrismaOSRow`** inclui **`valorTotal`** e **`valorBase`** (para enriquecer UI quando payload não traz orçamento).
- **`resolveClienteId`:** prioridade **`ordens_servico.clienteId`** → `payload.clienteId` → `payload.cliente.id`.
- **`mergeOrcamentoFromPrismaRow`:** se orçamento existente não tem linhas nem total, monta a partir de **`servicosCatalogo`** e/ou **`valorTotal`/`valorBase`**.

### Histórico de clientes

- **`HistoricoClientes.tsx`**: usa **`ordens`** e **`clientes`** do mesmo **`useOS()`**; filtro **`o.clienteId === c.id`** apenas.
- Por isso, qualquer OS com **`clienteId` vazio** no objeto hidratado **não aparece**, mesmo com nome no payload — corrigido na hidratação (§ acima).

### Payload legado e riscos

- Importações antigas podem ter **cliente só em `payload.cliente`** sem FK.
- **`asOperacoesPayload`** exige `id`, `codigo`, `storeId` no JSON — se válido, o ramo “parsed” antes **substituía** FK; agora há **fusão** explícita.

### `storeId`

- **`OperacoesHubIsolated`**: `lojaAtivaId ?? LEGACY_PRIMARY_STORE_ID`, **`key={storeId}`** + **`initialStoreId`** no `OSProvider`.
- Divergência entre **loja do header** e **`loja-1`** continua possível se contexto de loja não estiver disponível.

### Diagnóstico: rota debug

- **`GET /api/debug/operacoes-history`**
  - Contagens globais e por **`storeScoped`** (resolver igual às outras APIs de leitura).
  - Amostra de 5 OS recentes com snapshot de payload.
  - Foco **`focusNome`** (padrão *SILVANA APARECIDA PEREIRA*): clientes cadastrados, OS por `clienteId`, OS por **nome** no JSONB, OS por **telefone** normalizado.
  - **Produção:** exige **`?secret=`** alinhado a env (`ASSISTEC_DEBUG_OPERACOES_HISTORY_SECRET` ou `ASSISTEC_MASTER_PASSWORD`); **dev** liberado.

### Arquivos alterados (fase leitura + histórico)

- `app/actions/ordens.ts`
- `app/actions/operacoes.ts`
- `lib/operacoes/services/hydration-service.ts`
- `components/operacoes/lovable/api/os.ts`
- `components/operacoes/lovable/OperacoesHubIsolated.tsx`
- `components/operacoes/lovable/store/osStore.tsx`
- `components/operacoes/lovable/pages/OSDetalhe.tsx`
- `app/api/debug/operacoes-history/route.ts`

### Commits (Operações + debug)

- **`873bff8`** — `feat: connect operacoes hub read layer to prisma`
- **`24e9619`** — `fix: load real customer history from operacoes prisma`
- **`59756ee`** — `chore(debug): operacoes history prisma cross-check API`

---

## 5. Cadastros / Produção / Dynamic

### O que esta sessão cobriu explicitamente

- **Route Handlers críticos** (webhook, debug) usam **`export const dynamic = "force-dynamic"`** e **`revalidate = 0`** para evitar comportamento estático/cache agressivo no App Router.
- **Cliente cadastro:** no histórico do Git há **`df59677`** (`fix(clientes): dynamic render, loading states e error handling`) — trabalho **anterior** à linha de commits desta sessão, mas é o padrão esperado para páginas que leem dados ao vivo.

### O que não foi aprofundado neste chat

- Auditoria completa de **todas** as rotas de Cadastros HUB sob **cache** e **ISR**.
- **Recomendação:** revisar manualmente rotas `app/dashboard/cadastros*` e actions associadas se surgirem sintomas de dados “congelados” em produção.

---

## 6. Infraestrutura e Vercel

### Deploys

- Commits listados em §11 foram **empurrados para `main`**; Production deve acompanhar **SHA** esperado após promoção automática.

### Build

- **`next build --webpack`** executado com sucesso durante a sessão (PWA plugin).
- Avisos sobre **re-export** em `/api/webhooks/whatsapp` (campos `dynamic` / `runtime`).

### Middleware / proxy

- **Sem `middleware.ts`** na raiz do projeto (verificação na sessão): stripping de query **não** atribuível a middleware local.
- Causas externas (edge Vercel, CDN, URL chamada sem query) permanecem **hipóteses** até evidência do **probe**.

### Rewrites e `next.config.mjs`

- Rewrite **`/api/webhooks/whatsapp` → `/api/whatsapp/webhook`** mantido por compatibilidade; **rota física** adicionada como mitigação principal.

### Root Directory

- **`next.config.mjs` na raiz** do repositório; Vercel deve usar **Root Directory** apontando para essa raiz (validação manual no painel).

### Comportamento observado

- **GET canônico** funcionou; **path reescrito** falhou até **alias** em arquivo.
- **Handshake:** necessidade de **`NextRequest`** + **`nextUrl`**.

---

## 7. Estado atual do sistema

### Funcionando

- **Operações HUB:** listagem e detalhe OS via Prisma (Fase 1 leitura); **loja ativa** injetada no hub; **Histórico** melhor com fusão `clienteId` / orçamento quando dados permitem.
- **Webhook POST** Meta (handler existente) e fluxos auxiliares não removidos nesta sessão.
- **Debug prod parcial:** `prod-health`, `operacoes-history` (com auth em prod).

### Parcialmente funcionando

- **Meta GET verificação:** lógica correta em código, mas **probe forçado** pode **bloquear** handshake até desligar env ou remover código.
- **`/api/webhooks/whatsapp`:** deve funcionar com arquivo físico; rewrite ainda é **redundante**.

### Mock / híbrido

- Operações: **clientes, estoque local da API Lovable, vendas mock** no `refresh()` do `osStore` — apenas **OS** foi priorizado para Prisma leitura nesta fase.
- WhatsApp HUB UI pode ainda mostrar URLs de exemplo em alguns componentes (ex.: copy de webhook genérico) — **revisar** alinhamento com URL real.

### Pendente

- Remover **probe** e **JSON de diagnóstico** temporários do GET do webhook.
- **Migração de dados:** OS sem `clienteId` no banco continuam **invisíveis** no Histórico por `clienteId` até **backfill** ou regra de join por nome/telefone (decisão de produto).
- **Fase 2 Operações:** mutações, status completo, estoque/financeiro conforme escopo original do projeto.

---

## 8. Arquitetura atual identificada

| Camada | Tecnologia / padrão |
|--------|---------------------|
| App | Next.js 16 App Router, React 19, TypeScript strict |
| UI hubs | Lovable + MemoryRouter; tema via `applyGlobalTheme` / tokens semânticos |
| Estado hub OS | `OSProvider`, refresh paralelo (OS Prisma + mocks auxiliares) |
| Dados | Prisma 6, PostgreSQL Supabase; JSONB **`payload`** em OS |
| Multi-loja | `storeId` em modelos; header `x-assistec-loja-id`, cookie, `useLojaAtiva` |
| Backend | Server Actions (`app/actions/*`), serviços em `lib/operacoes/services/*` |
| WhatsApp | Route Handlers, assinatura Meta, logs/auditoria, env dedicados |
| IA | Módulos separados (fora do foco desta sessão) |

---

## 9. Dívidas técnicas e riscos

| Risco | Descrição |
|-------|-----------|
| **storeId** | OS e clientes em loja A, hub com fallback `loja-1` → listas vazias |
| **clienteId** | FK nula + só snapshot no payload → Histórico vazio até hidratação/migração |
| **Limite 500 OS** | `take: 500` — OS antigas fora do recorte não aparecem na lista (detalhe por id ainda possível) |
| **Probe GET** | Esquecimento de desligar env → Meta sempre falha verificação |
| **Re-export webhook** | Avisos de build; validar se runtime/node segue correto |
| **Híbrido Operações** | Inconsistência percebida entre “dados reais” OS e mocks de estoque/vendas |
| **Secrets em debug** | Rotas `/api/debug/*` devem permanecer protegidas em produção |

---

## 10. Próximos passos recomendados

### Prioridade imediata

1. **Desligar** `WHATSAPP_META_GET_FORCE_PROBE` em produção (ou remover probe) e **revalidar** handshake Meta com URL final.
2. Chamar **`/api/debug/operacoes-history`** com **`storeId`** real e analisar `scopedToActiveStore` vs `countByStoreId`.
3. Confirmar **Production SHA** no Vercel = último `main`.

### Curto prazo

1. Script ou migração **backfill** `ordens_servico.clienteId` a partir de `payload.cliente.id` quando seguro.
2. Remover **diagnóstico temporário** do GET (logs + ramos extras) após estabilizar Meta.
3. Documentar no painel interno a **URL canônica** do webhook.

### Médio prazo

1. **Fase 2** Operações: writes, timeline, estoque/financeiro conforme `docs/`.
2. Testes automatizados para **`hydrateOSRows`** (casos FK vazia, payload mínimo, `valorTotal` só coluna).
3. Revisar **re-export** webhook: duplicar metadados `dynamic` no alias ou aceitar default documentado.

### Refinamento premium

1. Histórico: opção de **busca** por nome/telefone nas OS (além de `clienteId`) com performance indexada.
2. Observabilidade: métricas de webhook (taxa 200, erros de assinatura) em dashboard interno.

---

## 11. Lista completa de commits citados na sessão

| Commit | Descrição | Impacto |
|--------|-----------|---------|
| `cd2e645` | Meta webhook URL via **rewrite** | Primeira tentativa de unificar path `/api/webhooks/whatsapp` |
| `873bff8` | **feat:** Operações hub **read layer** Prisma | `ordens.ts`, loja ativa, `OSDetalhe`, `listOS` delegando |
| `d235fd7` | **fix:** rota **física** `/api/webhooks/whatsapp` | 404 mitigado sem depender só do rewrite |
| `8d705f6` | **fix:** handshake GET via **`nextUrl.searchParams`** | Meta GET alinhado ao NextRequest |
| `24e9619` | **fix:** histórico cliente — hidratação **clienteId** + orçamento | Histórico reflete OS/valores quando dados existem |
| `e0ce259` | **chore:** logs + JSON `meta_get_diagnostic` | Diagnóstico quando handshake não dispara |
| `e79b9db` | **chore:** **forced probe** GET (query visibility) | Prova query na Vercel; bloqueia handshake se ativo |
| `59756ee` | **chore:** API **`/api/debug/operacoes-history`** | Cruzamento Prisma clientes × OS |

*Commits anteriores mencionados em handoff (ex.: `7a576bb` expose webhook) existem no histórico mas são **pré-âmbulo** à linha `cd2e645`–`d235fd7`.*

---

## 12. Conclusão geral

O **OmniGestão Pro** encontra-se em **transição estruturada** de hubs ricos (Lovable) para **persistência Prisma** por módulo: **Operações** avançou na **leitura** com **multi-loja** explícita; **WhatsApp** passou por **correção de roteamento edge** e **endurecimento do handshake**, com **ferramentas de diagnóstico** ainda a serem **desligadas**. A **maturidade** é **alta na base** (schema, actions, serviços) mas **heterogênea na UI** (mocks colaterais no mesmo provider).

**Gargalos:** dados **legados** (FK), **limite de listagem**, **probe** ativo, e **dependência** de configuração Vercel correta.

**Focos estratégicos:** fechar **Meta webhook** em produção, **consistência de `clienteId`**, evoluir **Fase 2** Operações sem regressão financeira/estoque.

---

## Metadados do relatório

- **Arquivo:** `docs/memory/SESSION_REPORT_CURSOR_FULL.md`
- **Tamanho:** ~**22,8 KB** (~**252** linhas Markdown; ~**2,8K** palavras).
- **Principais arquivos analisados/alterados na sessão:**  
  `app/actions/ordens.ts`, `app/actions/operacoes.ts`, `lib/operacoes/services/hydration-service.ts`, `components/operacoes/lovable/**/*` (hub, `OSDetalhe`, `api/os`), `app/api/whatsapp/webhook/route.ts`, `app/api/webhooks/whatsapp/route.ts`, `lib/whatsapp-meta-handshake.ts`, `next.config.mjs`, `app/api/debug/operacoes-history/route.ts`.

### Revisão manual recomendada

1. Painel **Vercel** (SHA Production, env `WHATSAPP_META_GET_FORCE_PROBE`, secrets Meta).  
2. **Meta** Developer Console (callback URL final).  
3. Executar **debug operacoes-history** com `storeId` real e validar SQL no Supabase se necessário.  
4. Decisão de **remover** código temporário do GET após diagnóstico.

---

*Fim do relatório.*
