# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**OmniGestão Pro** is a premium ERP/SaaS platform for small and medium enterprises (SMBs) with omnichannel support. Core modules: Orders of Service (OS/Operações), Finance (Financeiro), PDV, Inventory (Estoque), WhatsApp HUB, Marketing IA, and Marketplace.

## Commands

```bash
npm run dev          # Start dev server on 0.0.0.0:3000
npm run dev:clean    # Kill port 3000 then start dev
npm run build        # prisma generate + Next.js build (webpack)
npm run lint         # ESLint
npm run test         # Vitest

# Database
npm run db:push      # Push schema changes (dev, no migration history)
npm run db:migrate   # Interactive Prisma migration (production-safe)
npm run db:smoke     # Verify DB connection
```

Type-check without building: `npx tsc --noEmit`

## Architecture

### Tech Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript 5** (strict)
- **Prisma 6** + **PostgreSQL** via Supabase (port 6543 pooler for app, port 5432 direct for migrations)
- **Tailwind 4** + **shadcn/ui** (New York style, zinc base)
- **Zustand** for global state · **React Hook Form** + **Zod** for forms
- **Vitest** for tests · **Vercel** for deployment (PWA via `@ducanh2912/next-pwa`)

### Routing

All authenticated routes live under `/dashboard`. Key routes:
- `/dashboard/operacoes-v2` — Operações HUB (Lovable, MemoryRouter)
- `/dashboard/financeiro-v2` — Finance HUB (Lovable, mock data)
- `/dashboard/whatsapp` — WhatsApp HUB (Lovable)
- `/dashboard/cadastros-v2` — Catalog management (Lovable)
- `/dashboard/ia-mestre` — Master AI interface

### Lovable Hub Pattern

Several UI modules ("HUBs") are built with [Lovable](https://lovable.dev) and run as **isolated sub-applications** inside Next.js:

1. Each hub has a `*Isolated.tsx` wrapper that mounts a **React Router `<MemoryRouter>`** to avoid conflicts with Next.js routing.
2. Hubs have their own local providers (e.g. `OSProvider`, `FinanceiroProvider`) scoped to the hub.
3. Hubs sync theme with the global system via `applyGlobalTheme()` (reads `data-studio-theme` on `document.documentElement`).
4. Hubs use mock/local data for UI; real persistence goes through **Next.js Server Actions** or API routes.
5. Lovable's internal UI components (`components/*/lovable/components/ui`, hooks, `lib/utils.ts`) are **excluded from TypeScript compilation** in `tsconfig.json` to avoid type pollution.

### Backend Layer

**Server Actions** (`app/actions/`) are preferred over API routes for hub mutations (less network overhead from within the same Next.js process).

**Services** in `lib/operacoes/services/` and `lib/financeiro/services/` handle the core business logic — they are pure functions called by Server Actions and API routes:

| Directory | Purpose |
|-----------|---------|
| `lib/operacoes/services/` | OS helpers, hydration, payload patching, status, timeline, budget policy, financeiro sync |
| `lib/operacoes/adapters/` | OS→Estoque (consume/restore inventory), OS→Contas Receber |
| `lib/financeiro/services/` | Contas Receber, Contas Pagar, carteira, saldo, movimento, ledger |
| `lib/financeiro/adapters/` | OS faturamento → receivable materialization |
| `lib/financeiro/contracts/` | Status enums, origin constants, `localKey` definitions |

API routes under `app/api/ops/` expose the financeiro services as REST endpoints (used by legacy panels).

### Data Model Patterns

- **`payload` (JSONB)** stores rich operational state inside Prisma tables. Prisma enum fields (like `status`) are "collapsed" views — the source of truth is inside `payload`.
- **`localKey`** (unique string per `storeId`) ensures idempotent financial operations. Pattern: `os-faturamento:{storeId}:{osId}`, `receber:{storeId}:{localKey}`, etc.
- **Audit trail via `payload.historico[]`** — financial records are never deleted, only status-changed with history appended.
- **Multi-store**: every query must be scoped by `storeId`. Store ID comes from the `x-assistec-loja-id` header or from store context.

### Path Aliases (tsconfig.json)

Many aliases point into the Lovable sub-app at `components/operacoes/lovable/`:

```
@/store/osStore        → components/operacoes/lovable/store/osStore
@/types/{os,estoque…}  → components/operacoes/lovable/types/
@/api/{os,clientes…}   → components/operacoes/lovable/api/
@/data/{…Seed}         → components/operacoes/lovable/data/
@/components/operacoes → components/operacoes/lovable/components
@/*                    → project root
```

### Layout & Theme Rules

- `AppShell` (`components/painel-inicial/AppShell.tsx`) is the **single scroll owner** — never add `h-screen`/`overflow-auto` to hub wrappers.
- `min-w-0` is **mandatory** on every flex/grid item to prevent overflow.
- Use only semantic Tailwind tokens: `bg-background`, `text-foreground`, `border-border`, `text-primary`, etc. **No hardcoded colors.**
- Hubs that need full width cancel AppShell padding with `-mx-*` negative margins.

### Environment Variables

```
DATABASE_URL   # Supabase pooler (port 6543) — app connections
DIRECT_URL     # Supabase direct (port 5432) — migrations only
OPENROUTER_API_KEY
OPENAI_API_KEY / OPENAI_BASE / OPENAI_MODEL
NEXT_PUBLIC_APP_URL
ASSISTEC_MASTER_PASSWORD
```

## Key Files

| File | Role |
|------|------|
| `app/dashboard/layout.tsx` | Dashboard shell: AccessGate + FirstAccessWizard + AppShell |
| `components/painel-inicial/AppShell.tsx` | Master layout (header, sidebar, scroll controller) |
| `app/actions/operacoes.ts` | OS Server Actions orchestrator |
| `lib/prisma.ts` | Prisma singleton with safe error handling |
| `prisma/schema.prisma` | Full DB schema (multi-store, OS, financeiro, WhatsApp, AI) |
| `next.config.mjs` | PWA, security headers, rewrites/redirects |
| `tsconfig.json` | Path aliases — check here before creating new import paths |

## Documentation

Detailed technical docs live in `docs/`:
- `docs/START_HERE.md` — project entry point
- `docs/ai/CURRENT_STATUS.md` — latest state of each module (real vs mock)
- `docs/architecture/BACKEND.md` — backend services breakdown
- `docs/modules/FINANCEIRO.md` / `docs/modules/OPERACOES.md` — module-level detail
- `docs/modules/reports/` — 15+ targeted technical reports on specific features
