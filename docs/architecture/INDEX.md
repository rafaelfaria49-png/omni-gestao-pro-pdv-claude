---
title: Arquitetura — Índice oficial
status: vivo
owner: produto + Sonnet (técnico)
last_update: 2026-05-27
---

# 🏗️ Arquitetura — Índice oficial

> **Ponto de entrada técnico** do OmniGestão Pro. Quem precisa entender "como o código está organizado, quais padrões usamos e onde encontrar o quê" — começa aqui.
> **Visão de produto:** [`docs/blueprint/MASTER_PLAN.md`](../blueprint/MASTER_PLAN.md). **Estado real:** [`docs/ai/CURRENT_STATUS_OVERVIEW.md`](../ai/CURRENT_STATUS_OVERVIEW.md).

---

## 1. Stack técnica (snapshot)

> Detalhes versionados em `CLAUDE.md §Architecture · Tech Stack`.

- **Next.js 16** (App Router) · **React 19** · **TypeScript 5** strict
- **Prisma 6** + **PostgreSQL** via Supabase (port 6543 pooler / 5432 direct)
- **Tailwind 4** + **shadcn/ui** (New York, zinc)
- **Zustand** state · **React Hook Form** + **Zod** forms
- **Vitest** testes · **Vercel** deploy (PWA via `@ducanh2912/next-pwa`)
- **NextAuth v5** (Credentials + bcrypt + JWT)
- **Meta Cloud API** WhatsApp · **Stripe** billing · **OpenRouter/OpenAI** IA

---

## 2. Documentos de arquitetura

| Documento | Escopo | Status |
|---|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Visão geral (placeholder) | 🟠 a expandir |
| [`BACKEND.md`](./BACKEND.md) | Server Actions, services, adapters, contracts | ✅ vivo (6 KB) |
| [`MODULARIZACAO.md`](./MODULARIZACAO.md) | Estratégia de modularização (placeholder) | 🟠 a expandir |
| [`SIDEBAR_PAGE_ROUTES.md`](./SIDEBAR_PAGE_ROUTES.md) | Mapa de rotas e sidebar | ✅ vivo |
| [`FISCAL_SCHEMA_DESIGN.md`](./FISCAL_SCHEMA_DESIGN.md) | Entidades fiscais (NFC-e/SAT/NF-e) + ER + campos | ✅ vivo |
| [`NFCE_ARCHITECTURE.md`](./NFCE_ARCHITECTURE.md) | Pipeline de emissão NFC-e ponta a ponta | ✅ vivo |
| [`FISCAL_EVENTS.md`](./FISCAL_EVENTS.md) | Eventos fiscais, fila, retry, dead-letter | ✅ vivo |
| [`FISCAL_SECURITY.md`](./FISCAL_SECURITY.md) | Segredos fiscais (A1/CSC), cofre, rotação, auditoria | ✅ vivo |
| [`FISCAL_DRY_RUN.md`](./FISCAL_DRY_RUN.md) | Emissão a seco (validação sem transmissão) | ✅ vivo |

---

## 3. Padrões arquiteturais

### 3.1 Camadas

```
┌──────────────────────────────────────────────────────────┐
│  UI                                                       │
│  • app/dashboard/* (App Router pages)                     │
│  • components/* (componentes próprios)                    │
│  • components/*/lovable/* (HUBs Lovable isolados)         │
├──────────────────────────────────────────────────────────┤
│  Orquestração                                             │
│  • app/actions/* (Server Actions — preferido)             │
│  • app/api/* (API routes — webhooks, REST legado)         │
├──────────────────────────────────────────────────────────┤
│  Domínio (puro)                                           │
│  • lib/<hub>/services/* (regras de negócio)               │
│  • lib/<hub>/adapters/* (cross-hub)                       │
│  • lib/<hub>/contracts/* (enums, constants, localKeys)    │
├──────────────────────────────────────────────────────────┤
│  Dados                                                    │
│  • prisma/schema.prisma                                   │
│  • lib/prisma.ts (singleton)                              │
└──────────────────────────────────────────────────────────┘
```

### 3.2 Padrões obrigatórios

- **Adapter pattern** entre HUBs (OS↔Estoque, OS↔Financeiro, futuro Marketplace↔Estoque)
- **`payload` JSONB** como fonte rica de estado; enums Prisma como view colapsada
- **`localKey`** para idempotência (`origem:storeId:id`)
- **`payload.historico[]`** para auditoria imutável
- **`storeId`** em toda query (multi-loja)
- **Server Actions** > API routes para mutações internas
- **Lovable hubs** isolados com `MemoryRouter` + providers locais + sync de tema

---

## 4. Estrutura de pastas (mapa rápido)

```
app/
  (auth)/login/                  # NextAuth pages
  actions/                       # Server Actions (mutações)
  api/                           # API routes (webhooks, REST legado)
    webhooks/stripe/
    webhooks/whatsapp/
    ai/orchestrate/
    ops/
  dashboard/                     # rotas autenticadas (App Router)
    pdv*/                        # PDVs (Clássico, Supermercado, Assistência, Next)
    operacoes-v2/                # OS HUB (Lovable)
    financeiro-v2/               # Financeiro HUB (Lovable)
    cadastros-v2/                # CRM HUB (Lovable)
    whatsapp/                    # WhatsApp HUB (Lovable)
    ia-mestre/                   # Omni Agent UI

components/
  painel-inicial/AppShell.tsx    # Layout master (scroll owner único)
  dashboard/*                    # Componentes por HUB
  operacoes/lovable/             # OS HUB Lovable (excluído do tsc)
  cadastros/lovable/             # CRM HUB Lovable
  ia-mestre/                     # Omni Agent UI

lib/
  prisma.ts                      # Singleton Prisma
  pdv*                           # PDV core (área protegida)
  operacoes/
    services/                    # OS business logic
    adapters/                    # OS↔Estoque, OS↔CR
  financeiro/
    services/                    # CR, CP, carteira, saldo, movimento, ledger
    adapters/                    # OS faturamento → CR
    contracts/                   # status, origin, localKey
  estoque*                       # Estoque core (área protegida)
  whatsapp/                      # WhatsApp core (área protegida)
  ia-mestre/                     # Omni Agent (api-guard, credit-costs)
  credits/                       # Sistema de créditos IA
  importador-produtos/           # Importador defensivo com match seguro
  marketing/                     # (a criar)
  marketplace/                   # (a criar)
  bi/                            # (a criar)

src/lib/
  ai/credit-costs.ts             # Custo por crédito IA
  auth/getUserId.ts              # Helper auth
  credits/action-labels.ts       # Labels de ação para audit

prisma/
  schema.prisma                  # Schema único (área protegida)
  migrations/                    # Histórico de migrações

docs/
  governance/                    # Sistema Operacional de Desenvolvimento
  roadmaps/                      # Roadmaps por HUB
  decisions/                     # ADRs
  sprints/                       # Sprint template + sprints históricas
  audits/                        # Auditorias por HUB
  status/                        # Status vivos (dívida, mocks, riscos, blockers)
  blueprint/                     # Master plan, vision, monetization
  architecture/                  # Este índice + backend + rotas
  ai/                            # CURRENT_STATUS + overview
  memory/                        # Memória viva consolidada
  modules/                       # Detalhe por módulo
  skills/                        # Regras (CORE, DELIVERY, FRONTEND_IMPORT)
```

---

## 5. Convenções críticas

### 5.1 Path aliases (`tsconfig.json`)

Muitos aliases apontam para o hub Lovable de Operações. **Cuidado:** importar `@/types/os` puxa do Lovable, não da raiz.

| Alias | Aponta para |
|---|---|
| `@/store/osStore` | `components/operacoes/lovable/store/osStore` |
| `@/types/{os,estoque,…}` | `components/operacoes/lovable/types/` |
| `@/api/{os,clientes,…}` | `components/operacoes/lovable/api/` |
| `@/data/{…Seed}` | `components/operacoes/lovable/data/` |
| `@/components/operacoes` | `components/operacoes/lovable/components` |
| `@/*` | raiz do projeto |

### 5.2 Layout e tema

- **`AppShell`** é o **único scroll owner** — nunca adicionar `h-screen` ou `overflow-auto` em wrappers de hub.
- **`min-w-0`** é **obrigatório** em todo flex/grid item (previne overflow).
- **Apenas tokens semânticos** Tailwind: `bg-background`, `text-foreground`, `border-border`, `text-primary`. **Sem cor hardcoded.**
- Hubs full-width cancelam padding do AppShell com `-mx-*` negativos.

### 5.3 Autenticação (NextAuth v5)

```
NextAuth (outer gate)  →  proxy.ts protege /dashboard/*
   ↓
AccessGate / PIN (inner gate, legado, só se não houver sessão NextAuth)
   ↓
/dashboard/* (autenticado)
```

Roles: `SUPER_ADMIN | ADMIN | GERENTE | OPERADOR`
Seed inicial: `npm run db:seed-admin` (admin@rafacell.com.br)

### 5.4 Variáveis de ambiente críticas

Lista canônica em `CLAUDE.md`. Categorias:
- **Banco** (`DATABASE_URL`, `DIRECT_URL`)
- **IA** (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`)
- **NextAuth** (`AUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_DEFAULT_PASSWORD`)
- **Stripe** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, todos os `STRIPE_PRICE_*`)
- **WhatsApp Meta** (`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_STORE_ID`)

---

## 6. Áreas protegidas (lembrete)

> Detalhe em [`docs/governance/GOVERNANCA.md`](../governance/GOVERNANCA.md).

Estes paths exigem **autorização explícita do humano** para qualquer alteração:

- `auth.ts`, `auth.config.ts`, `proxy.ts`
- `prisma/schema.prisma`
- `lib/pdv*` core
- `lib/financeiro/*` services
- `lib/operacoes/*` services
- `lib/whatsapp/*` core
- `lib/omni-agent/*` executores

---

## 7. Como decidir entre Server Action e API Route

| Caso | Use |
|---|---|
| Mutação interna a partir de página do dashboard | **Server Action** |
| Mutação a partir de hub Lovable (cliente React puro) | **API Route** |
| Webhook externo (Meta, Stripe) | **API Route** (`app/api/webhooks/*`) |
| Endpoint REST consumido por painel legado | **API Route** (`app/api/ops/*`) |
| Job/cron interno | **Server Action** com handler dedicado |

---

## 8. Como adicionar um novo HUB (fluxo padrão)

1. Criar `docs/roadmaps/ROADMAP_<HUB>.md` (15 seções conforme INDEX §2.2).
2. Criar pasta `lib/<hub>/services/` + `lib/<hub>/adapters/` + `lib/<hub>/contracts/`.
3. Definir contratos (enums, localKey patterns) em `contracts/`.
4. Implementar services puros (sem efeito colateral além de retorno).
5. Conectar via Server Action em `app/actions/<hub>.ts`.
6. Adicionar UI em `components/dashboard/<hub>*/` ou hub Lovable em `components/<hub>/lovable/`.
7. Documentar adapter (se cruza com outro HUB) em `BACKEND.md`.
8. Atualizar `CURRENT_STATUS_OVERVIEW.md §1`.
9. Adicionar entrada em `docs/skills/INDEX.md`.

---

## 9. Como adicionar uma integração externa

1. Criar ADR (`docs/decisions/ADR-<NNNN>-<slug>.md`) com alternativas + custo + risco.
2. Variáveis de ambiente documentadas em `CLAUDE.md`.
3. Adapter em `lib/<integracao>/` com interface unificada (se há > 1 provedor possível).
4. Webhook (se aplicável) em `app/api/webhooks/<integracao>/route.ts` com assinatura verificada.
5. Idempotência por `event.id` ou `localKey`.
6. Testes E2E mínimos do fluxo crítico.
7. Atualizar arquitetura (este índice) se introduz padrão novo.

---

## 10. Próximos blocos arquiteturais

> O que falta ser documentado de forma completa:

- [ ] **DATA_MODEL.md** — mapa completo do schema com explicação de `payload` JSONB
- [ ] **EVENT_BUS.md** — design do event bus interno (planejado para cross-hub events)
- [ ] **FRONTEND.md** — convenções de UI, tokens, AppShell, Lovable hubs
- [ ] **DEPLOY.md** — pipeline Vercel, env vars, runtime (Edge vs Node)
- [ ] **TESTING.md** — estratégia de testes (Vitest, E2E, ambientes)
- [ ] **OBSERVABILITY.md** — logs, métricas, alertas
- [ ] **SECURITY.md** — auth, rate-limit, sanitização, LGPD

---

## 11. Fonte da verdade

- **Índice arquitetural:** este arquivo.
- **Backend detalhado:** [`BACKEND.md`](./BACKEND.md).
- **Padrões de código:** [`CLAUDE.md`](../../CLAUDE.md) raiz.
- **Áreas protegidas:** [`docs/governance/GOVERNANCA.md`](../governance/GOVERNANCA.md).
- **Decisões:** [`docs/decisions/INDEX.md`](../decisions/INDEX.md).
