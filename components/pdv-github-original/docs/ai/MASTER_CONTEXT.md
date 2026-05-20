# OmniGestão Pro — Contexto Mestre

> Documento de referência para IAs (Cursor, ChatGPT, Claude) e desenvolvedores.
> Atualizar sempre que a arquitetura ou módulos mudarem.

---

## 1. Visão Geral

**OmniGestão Pro** é um ERP/SaaS omnichannel modular com IA integrada, voltado para pequenas e médias empresas de assistência técnica, varejo e serviços.

---

## 2. Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 14 (App Router) |
| Linguagem | TypeScript (strict) |
| ORM | Prisma + Supabase (PostgreSQL) |
| Estilização | Tailwind CSS + shadcn/ui |
| Estado global | Zustand (`useOperationsStore`) |
| Autenticação | Sessão própria (`assistec_admin_session`) |
| Deploy | Vercel (auto via GitHub `master`) |

---

## 3. Arquitetura de Desenvolvimento

```
Cursor  →  backend, lógica de negócio, APIs, banco de dados
Lovable →  casca visual premium (scaffolding de UI)
```

- Hubs visuais do Lovable são importados em `components/<modulo>/lovable/`
- Integração com o sistema real via wrappers isolados (`*Isolated.tsx`)
- O AppShell (`components/painel-inicial/AppShell.tsx`) envolve toda a aplicação

---

## 4. Módulos Ativos

| Módulo | Rota | Status |
|--------|------|--------|
| Painel Inicial | `/dashboard` | ✅ Ativo |
| IA Mestre | `/dashboard/ia-mestre` | ✅ Ativo |
| Marketing IA | `/dashboard/marketing-ia` | ✅ Ativo |
| WhatsApp HUB | `/dashboard/whatsapp` | ✅ Integrado (visual Lovable) |
| Operações HUB | `/dashboard/operacoes-v2` | ✅ Integrado (visual Lovable, dados mock) |
| Ordens de Serviço (legado) | `/dashboard/os` | ✅ Ativo (Prisma real) |
| Orçamentos | `/dashboard/orcamentos` | ✅ Ativo |
| Vendas | `/dashboard/vendas` | ✅ Ativo |
| Clientes | `/dashboard/clientes` | ✅ Ativo |
| Estoque | `/dashboard/estoque` | ✅ Ativo |
| Financeiro HUB | `/dashboard/financeiro` | 🔄 Em andamento |
| Marketplace HUB | `/dashboard/marketplace` | 🔜 Planejado |
| Relatórios | `/dashboard/relatorios` | ✅ Ativo |
| Histórico de Vendas | `/dashboard/vendas-arquivo-geral` | ✅ Ativo |
| Configurações | `/dashboard/configuracoes` | ✅ Ativo |

---

## 5. Sistema de Temas

**Armazenamento:** `localStorage` → chave `omni-studio-dual-theme`

**Atributo HTML:** `data-studio-theme` em `document.documentElement`

| Tema | Classe CSS | Identidade Visual |
|------|-----------|-------------------|
| Light | `light` | Vermelho/branco, fundo claro |
| Soft Ice | `soft-ice` | Azul gelo premium, fundo suave |
| Midnight | `midnight` | Azul enterprise, fundo escuro |
| Black Edition | `black-edition` | Preto premium + verde terminal |

**Regra:** hubs Lovable devem sincronizar seu `data-hub-theme` interno com o tema global via `applyGlobalTheme()`.

---

## 6. Padrões de Código

### CSS / Tailwind
- Usar tokens semânticos: `bg-background`, `text-foreground`, `border-border`, `text-primary`, etc.
- **Nunca** usar `bg-white`, `bg-black`, `text-black`, `text-white`, cores hardcoded (`#xxxxxx`, `text-green-*`)
- `min-w-0` **obrigatório** em itens flex/grid para evitar overflow implícito
- Hubs não devem usar `h-screen`, `min-h-screen` com overflow, `overflow-auto` no wrapper principal
- O AppShell controla o único scroll vertical da página

### Layout de Hubs Lovable
```tsx
// page.tsx — cancelar apenas padding lateral do AppShell
<div className="-mx-4 min-w-0 sm:-mx-6 lg:-mx-8">
  <HubIsolated />
</div>

// HubIsolated.tsx
<div className="w-full min-w-0">
  <Provider>
    <MemoryRouter>...</MemoryRouter>
  </Provider>
</div>

// HubLayout.tsx (root)
<div className="w-full min-w-0 bg-background text-foreground">
  <header className="z-30 border-b ...">...</header>
  <main className="w-full min-w-0 px-4 py-6 ...">...</main>
</div>
```

### APIs
- Rotas em `app/api/**/*.ts` (Next.js App Router)
- Autenticação via `requireAdmin()` ou `canManageStoreSettings()`
- Multi-loja via header `x-assistec-loja-id`

---

## 7. Integrações Ativas

### WhatsApp + Automações
- Engine: `lib/automation/automation-engine.ts`
- Eventos: `venda_finalizada`, `os_criada`, `os_status_alterado`, `os_finalizada`
- Regra de roteamento: `targetPhone` de `actions` tem prioridade para `system_event`; payload `phoneDigits` tem prioridade para conversas inbound

### OS + Marketing IA
- Criação de OS dispara evento `os_criada` → automações podem reagir
- Marketing IA usa dados de vendas/OS para sugestões

### Automação de Eventos
- Event Bus: `lib/events/event-bus.ts`
- Servidor: `app/api/automation/handle-event/route.ts`

---

## 8. Convenções de Nomenclatura

| Tipo | Padrão |
|------|--------|
| Hubs Lovable | `components/<modulo>/lovable/` |
| Wrapper isolado | `*Isolated.tsx` |
| Store Zustand principal | `lib/operations-store.tsx` |
| Store mock Lovable | `store/osStore.tsx` (dentro do lovable) |
| Página Next.js | `app/dashboard/<modulo>/page.tsx` |
