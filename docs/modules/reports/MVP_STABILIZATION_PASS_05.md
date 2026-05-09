# MVP — Estabilização passo 05 (smoke UI: rotas e links do dashboard)

**Data:** 2026-05-08  
**Escopo:** varredura leve de navegação principal (sidebar AppShell, topbar, mobile nav legado), aliases de rota esperados pelo checklist, placeholders honestos — **sem** feature nova, migration, Prisma, auth real, billing, WhatsApp Cloud API ou refator pesado.

---

## 1. Navegação mapeada

| Origem | Observação |
|--------|------------|
| `components/painel-inicial/Sidebar.tsx` | Menu desktop ativo no `AppShell`; rotas conferidas contra `app/dashboard/**/page.tsx`. |
| `components/painel-inicial/Topbar.tsx` | Dropdown **Novo** tinha itens sem `href`; corrigido para rotas reais. |
| `components/dashboard/mobile-nav.tsx` | Barra inferior + sheet; **não** referenciada pelo layout atual do `/dashboard` (possível legado / reuso futuro); mesmo assim, **Estoque** ganhou `href` / `externalPath` para não depender só de `onNavigate`. |
| `components/dashboard/sidebar.tsx` | Legado SPA na home (`/?page=...`); fora do escopo deste passo além da menção em riscos. |

---

## 2. Rotas verificadas (checklist + correlatas)

| Rota | Status |
|------|--------|
| `/dashboard` | OK (`app/dashboard/page.tsx`) |
| `/dashboard/cadastros` | **Redirect** → `/dashboard/cadastros-v2` |
| `/dashboard/clientes` | OK |
| `/dashboard/produtos` | **Redirect** → `/dashboard/estoque` |
| `/dashboard/vendas` | OK (PDV / caixa) |
| `/dashboard/pdv` | **Redirect** → `/dashboard/vendas` |
| `/dashboard/financeiro` | **Placeholder** honesto + link para HUB ou contas a receber conforme flag |
| `/dashboard/financeiro-v2` | OK |
| `/dashboard/operacoes-v2` | OK |
| `/dashboard/os` | OK |
| `/dashboard/marketing` | OK |
| `/dashboard/whatsapp` | OK |
| `/dashboard/dev-health` | OK (gate passo 04) |
| `/dashboard/configuracoes` | OK |

Outras rotas usadas pelo sidebar e conferidas: `ia-mestre`, `omni-agent`, `marketing-ia`, `cadastros-v2`, `/vendas-hub`, `marketplace`, `clientes`, `estoque`, `relatorios`, `vendas-arquivo-geral`, `master-console`, `unidades`, `creditos`.

---

## 3. Alterações feitas

### 3.1 Redirects (aliases)

| Arquivo | Comportamento |
|---------|----------------|
| `app/dashboard/cadastros/page.tsx` | `redirect("/dashboard/cadastros-v2")` |
| `app/dashboard/produtos/page.tsx` | `redirect("/dashboard/estoque")` |
| `app/dashboard/pdv/page.tsx` | `redirect("/dashboard/vendas")` |

### 3.2 Placeholder reutilizável

| Arquivo | Função |
|---------|--------|
| `components/painel-inicial/ModuleEmDesenvolvimento.tsx` | Título, texto honesto, links opcionais, voltar ao painel. |

### 3.3 Páginas “em construção” enriquecidas

| Rota | Antes | Depois |
|------|-------|--------|
| `/dashboard/relatorios` | Uma linha de texto | `ModuleEmDesenvolvimento` + link para histórico de vendas |
| `/dashboard/financeiro` | Stub com Suspense/Skeleton genérico | Placeholder direto com link para Financeiro HUB (ou contas a receber se V2 desligado) |

### 3.4 Topbar — dropdown Novo

Destinos: **Nova Venda** → `/dashboard/vendas`; **Nova OS** → `/dashboard/operacoes-v2`; **Novo Cliente** → `/dashboard/clientes`; **Novo Produto** → `/dashboard/estoque` (via `DropdownMenuItem asChild` + `Link`).

### 3.5 Mobile nav (legado)

- Barra rápida: **Estoque** com `href: "/dashboard/estoque"`.
- Sheet: grupo **Estoque** com `externalPath` no pai; subs **Produtos** e **Serviços** com `externalPath` para `/dashboard/estoque` e `/dashboard/cadastros-v2` respectivamente.

---

## 4. Validação de build (2026-05-08, ambiente local)

| Comando | Resultado |
|---------|-----------|
| `npm run lint` | **OK** (exit 0) — 42 *warnings* pré-existentes no repo, **0 erros**. |
| `npx tsc --noEmit` | **OK** (exit 0). |
| `npx next build --webpack` | **OK** (exit 0) — Next.js 16.2.0 (webpack); build concluído em ~2 min. |

---

## 5. Riscos remanescentes

- **`MobileNav`** pode continuar sem uso no `/dashboard` atual; itens que dependem só de `onNavigate` em contexto sem handler seguem frágeis se o componente for reativado na home legada.
- **Atalhos de teclado** (`N V`, `N O`, etc.) no dropdown continuam só visuais — não há listeners globais ligados a esses atalhos.
- **Planejamento de Compras** (submenu mobile) permanece sem `externalPath` — rota dedicada não mapeada neste passo.
- **Sidebar legado** (`components/dashboard/sidebar.tsx`) e documentação `SIDEBAR_PAGE_ROUTES.md` descrevem outro modelo de navegação; manter alinhamento com AppShell ao evoluir menus.

---

## 6. Referências

- Passos anteriores: `MVP_STABILIZATION_PASS_01.md` … `MVP_STABILIZATION_PASS_04.md`
- Arquitetura sidebar legado: `docs/architecture/SIDEBAR_PAGE_ROUTES.md`
