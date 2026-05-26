# Auditoria Configurações V3 + Master Console

**Data:** 2026-05-26  
**Modo:** Auditoria profunda (somente leitura)  
**Escopo:** Configurações V3, Master Console, integrações e hooks consumidos  
**Excluído:** Cópia arquivada `components/pdv-github-original/**` (referenciada apenas como origem Lovable)

---

## Escopo analisado

### Rotas e entrypoints

| Caminho | Papel |
|---------|-------|
| `app/configuracoes-v3/page.tsx` | Redirect legado → `/dashboard/configuracoes` |
| `app/dashboard/configuracoes/page.tsx` | Rota real — monta `ConfiguracoesV3Page` |
| `app/dashboard/master-console/page.tsx` | Master Console |
| `app/fluxo-caixa/page.tsx` | Legado SPA — redirect `/?page=fluxo-caixa` (não App Router) |

### Configurações V3 (shell + features)

| Caminho | Arquivos |
|---------|----------|
| `components/configuracoes-v3/ConfiguracoesV3Page.tsx` | Shell principal, roteamento `?sec=` |
| `components/configuracoes-v3/features/settings/sections.ts` | Definição das 12 seções |
| `components/configuracoes-v3/features/settings/section-routing.ts` | Parser de `sec` na URL |
| `components/configuracoes-v3/features/settings/sections/*.tsx` | 12 seções funcionais |
| `components/configuracoes-v3/features/settings/components/*` | Sidebar, cards, checklist Go-Live |
| `components/configuracoes-v3/contexts/*` | Theme + navegação interna |
| `components/configuracoes-v3/pages/Index.tsx`, `NotFound.tsx` | Protótipo Lovable morto |

### Master Console

| Caminho | Arquivos |
|---------|----------|
| `components/master-console/*.tsx` | 8 componentes (KPI, lojas, equipe, PIN) |

### Backend e libs consumidas

| Caminho | Uso |
|---------|-----|
| `app/api/stores/route.ts`, `app/api/stores/[id]/route.ts` | CRUD lojas (MC + Geral) |
| `app/api/admin/supervisor-pin/route.ts` | PIN supervisor PDV |
| `app/api/admin/users/*` | Usuários (Config V3 — não MC) |
| `lib/require-admin.ts` | Gate fraco em mutações de loja |
| `lib/financeiro-store.tsx` | localStorage financeiro v2 |
| `lib/centro-financeiro.ts` | cardFees / metas |
| `lib/loja-ativa`, `lib/store-settings-provider`, `lib/config-empresa` | Multiloja + settings |
| `lib/auth/proxy-enterprise-dashboard.ts` | Permissões UI Master Console |
| `components/dashboard/configuracoes/backup-importador/*` | Importação universal |
| `components/dashboard/configuracoes/importador-avancado/*` | Importação avançada |

**Total de arquivos analisados (runtime):** **52** (12 seções + 8 MC + 7 APIs/libs críticas + shell/contextos + rotas)

---

## Resumo executivo

Configurações V3 é **majoritariamente funcional** nas áreas core: dados da empresa (`/api/stores`), settings por unidade, PDV layout, orçamentos/garantia/mesas, usuários NextAuth (`/api/admin/users`), créditos IA, importadores reais e integrações com copy honesta.

Os problemas mais graves concentram-se em:

1. **Master Console** — shell Lovable com UI de equipe/permissoes/KPIs **não persistida**; apenas listagem/exclusão parcial de lojas e **SupervisorPinCard** estão wired de verdade.
2. **Segurança de API** — `GET /api/stores` **sem autenticação**; `requireAdmin()` aceita **qualquer sessão NextAuth** (incluindo GERENTE/OPERADOR).
3. **Navegação quebrada** — link Financeiro → `/dashboard/fluxo-caixa` **não existe** no App Router.
4. **Settings órfãs** — imposto estimado no PDV salva em `printerConfig` mas **não é lido** pelo runtime de vendas; KPIs financeiros na V3 vêm de **localStorage**, não Prisma.
5. **UX enganosa** — botões “Salvar”, reset de senha e matriz de permissões no MC **parecem prontos** mas não chamam backend.

**Veredito por módulo:**

| Módulo | Estado |
|--------|--------|
| Geral, Lojas, PDV, IA, Importação, Usuários, Seguranca (info) | Produção parcial / real |
| Vendas | Real exceto formas pagamento + imposto PDV |
| Financeiro | Metas reais; resumo contas = localStorage; link quebrado |
| Integrações | Status real de settings + atalhos |
| Master Console | **~15% funcional** (lista lojas, delete, PIN supervisor) |
| Plano | Delega para `/dashboard/billing` (correto) |

---

## Achados P0 críticos

### P0-01 — Enumeração pública de lojas

| Campo | Valor |
|-------|-------|
| **Arquivo** | `app/api/stores/route.ts` |
| **Linha** | ~31–38 |
| **Descrição** | `GET` retorna todas as lojas via Prisma **sem** `requireAdmin()` ou sessão |
| **Impacto** | Qualquer cliente HTTP pode listar unidades, CNPJ e metadados |
| **Risco** | Exposição de dados multi-tenant; reconhecimento para ataques |
| **Recomendação** | Exigir sessão + role ADMIN/SUPER_ADMIN; opcionalmente filtrar por `allowedStoreIds` |

### P0-02 — `requireAdmin` aceita qualquer usuário logado

| Campo | Valor |
|-------|-------|
| **Arquivo** | `lib/require-admin.ts` |
| **Linha** | ~14–18 |
| **Descrição** | Se `session?.user` existe, retorna `{ ok: true }` sem checar `role` |
| **Impacto** | GERENTE/OPERADOR com login NextAuth podem chamar `DELETE/POST/PUT /api/stores` |
| **Risco** | Escalação de privilégio; exclusão acidental ou maliciosa de loja |
| **Recomendação** | Alinhar com `requireAdminNextAuth()` de `supervisor-pin` (SUPER_ADMIN \| ADMIN) |

### P0-03 — Link “Ver lançamentos” quebrado

| Campo | Valor |
|-------|-------|
| **Arquivo** | `components/configuracoes-v3/features/settings/sections/FinanceiroSection.tsx` |
| **Linha** | ~245 |
| **Descrição** | `<Link href="/dashboard/fluxo-caixa">` — rota **inexistente** em `app/dashboard/` |
| **Impacto** | 404 ou saída do shell dashboard; legado em `app/fluxo-caixa` redireciona para `/?page=fluxo-caixa` (SPA antiga) |
| **Risco** | Fluxo financeiro interrompido; perda de confiança |
| **Recomendação** | Apontar para `/dashboard/financeiro-v2`, contas a receber/pagar ou relatorios com badge se em roadmap |

### P0-04 — Exclusão de loja sem guarda de loja principal (server)

| Campo | Valor |
|-------|-------|
| **Arquivo** | `app/api/stores/[id]/route.ts` |
| **Linha** | ~33–38 |
| **Descrição** | `DELETE` apaga qualquer `id` sem bloquear `loja-1` / primary store |
| **Impacto** | Cascade Prisma pode apagar OS, estoque, financeiro da unidade |
| **Risco** | **Perda irreversível de dados em produção** |
| **Recomendação** | Bloquear primary server-side; exigir confirmação + resumo (padrão `gestao-unidades-saas`) |

### P0-05 — Delete no MC ignora erro da API

| Campo | Valor |
|-------|-------|
| **Arquivo** | `app/dashboard/master-console/page.tsx` |
| **Linha** | ~53–60 |
| **Descrição** | `handleDelete` não verifica `res.ok`; sempre chama `loadStores()` |
| **Impacto** | UI indica sucesso quando delete falhou (403, 500) |
| **Risco** | Admin acredita que loja foi removida |
| **Recomendação** | Checar response; toast de erro; não atualizar lista em falha |

### P0-06 — Reset de senha fake com senha hardcoded

| Campo | Valor |
|-------|-------|
| **Arquivo** | `components/master-console/TeamPanel.tsx` |
| **Linha** | ~154–167 |
| **Descrição** | “Confirmar” reset apenas faz `setResetDone(true)` e exibe **`omni123456`** — sem API |
| **Impacto** | Teatro de segurança; admin distribui senha que **não foi aplicada** |
| **Risco** | Falsa sensação de controle; possível vazamento de senha padrão |
| **Recomendação** | Integrar `PATCH /api/admin/users/[id]` ou remover ação |

### P0-07 — Botão “Salvar alterações” de permissões sem handler

| Campo | Valor |
|-------|-------|
| **Arquivo** | `components/master-console/EmployeeAccessSheet.tsx` |
| **Linha** | ~345–347 |
| **Descrição** | `<Button>Salvar alterações</Button>` sem `onClick` / submit |
| **Impacto** | Matriz de permissões e PIN editados são **descartados** ao fechar |
| **Risco** | Configuração de acesso aparentemente salva mas inexistente |
| **Recomendação** | Persistir via API real ou desabilitar botão com badge “Em breve” |

---

## Achados P1 importantes

### P1-01 — KPIs financeiros na V3 vêm de localStorage

| Campo | Valor |
|-------|-------|
| **Arquivo** | `FinanceiroSection.tsx` + `lib/financeiro-store.tsx` |
| **Linha** | ~40, 103–112 / ~23–25 |
| **Descrição** | `useFinanceiro()` lê chave `assistec-pro-financeiro-v2-${lojaId}` no browser |
| **Impacto** | Tiles “Entradas pendentes” / “A pagar” podem estar vazios, stale ou divergir do Prisma |
| **Risco** | Decisão operacional com dados locais não confiáveis |
| **Recomendação** | Label “Dados locais (carteira v2)” ou fetch `/api/financeiro/*` |

### P1-02 — Imposto estimado PDV salva mas não afeta runtime

| Campo | Valor |
|-------|-------|
| **Arquivo** | `VendasSection.tsx` (~289–314); ausência em `components/dashboard/vendas/` |
| **Linha** | ~155–184 (save), ~297–311 (UI) |
| **Descrição** | `incluirImpostoEstimadoNoPdv` / `aliquotaImpostoEstimadoPdv` persistem em `printerConfig`; **zero uso** no PDV |
| **Impacto** | Toggle “Incluir imposto estimado” não altera totais do carrinho |
| **Risco** | Setting órfã; expectativa fiscal errada |
| **Recomendação** | Wire no cálculo do PDV ou badge “Armazenado — PDV em integração” |

### P1-03 — Master Console: KPIs e equipe 100% placeholder

| Campo | Valor |
|-------|-------|
| **Arquivo** | `app/dashboard/master-console/page.tsx` |
| **Linha** | ~35–36, 110–111, 142 |
| **Descrição** | `manager: "—"`, `status: "Ativa"` fixos; Colaboradores/Faturamento `"—"`; `employees={[]}` `activity={[]}` |
| **Impacto** | Dashboard executivo vazio apesar de UI rica |
| **Risco** | Parece produto pronto; duplica Configurações → Usuários |
| **Recomendação** | Integrar `/api/admin/users` + métricas billing ou ocultar cards |

### P1-04 — Formulários de loja/colaborador sem persistência

| Campo | Valor |
|-------|-------|
| **Arquivo** | `StoreFormSheet.tsx` (~28–45), `EmployeeFormSheet.tsx` |
| **Linha** | ~44 (submit sem `onSubmit`) |
| **Descrição** | Botão “Salvar Alterações” é `type="submit"` mas form não persiste |
| **Impacto** | Criar/editar filial ou colaborador no MC **não grava nada** |
| **Risco** | Admin usa MC em vez de `/dashboard/unidades` (funcional) |
| **Recomendação** | Wire POST/PUT `/api/stores` e `/api/admin/users` ou desabilitar forms |

### P1-05 — Inativar colaborador só altera estado React

| Campo | Valor |
|-------|-------|
| **Arquivo** | `TeamPanel.tsx` |
| **Linha** | ~56–61 |
| **Descrição** | `confirmInactivate` mapeia array local; sem PATCH no backend |
| **Impacto** | Colaborador continua autenticando após “inativar” |
| **Risco** | Controle de acesso inexistente |
| **Recomendação** | `PATCH { active: false }` em AdminUser |

### P1-06 — “Pausar Filial” sem ação

| Campo | Valor |
|-------|-------|
| **Arquivo** | `StoreList.tsx` |
| **Linha** | ~181–184 |
| **Descrição** | `DropdownMenuItem` “Pausar Filial” sem `onClick` |
| **Impacto** | Controle morto no menu contextual |
| **Risco** | UX inconsistente |
| **Recomendação** | Implementar flag `paused` ou remover item |

### P1-07 — PIN gerado com `Math.random` (cliente, não persistido)

| Campo | Valor |
|-------|-------|
| **Arquivo** | `EmployeeAccessSheet.tsx` |
| **Linha** | ~157, 175–178 |
| **Descrição** | PIN default `"4827"`; `regeneratePin()` usa `Math.random()` — não salva |
| **Impacto** | Entropia fraca; PIN exibido não é o do servidor |
| **Risco** | Falsa segurança operacional |
| **Recomendação** | `crypto.getRandomValues`; persistir via API |

### P1-08 — Link Usuarios V3 → Master Console enganoso

| Campo | Valor |
|-------|-------|
| **Arquivo** | `UsuariosSection.tsx` |
| **Linha** | ~377–381 |
| **Descrição** | CTA “Master Console” ao lado de CRUD real de usuários; MC **não** gerencia `AdminUser` |
| **Impacto** | Usuário com gestão real clica no MC e encontra shell vazio |
| **Risco** | Fluxo duplicado e confuso |
| **Recomendação** | Remover link ou apontar para `/dashboard/unidades` |

### P1-09 — Sidebar legacy expõe Master Console sem gate de permissão

| Campo | Valor |
|-------|-------|
| **Arquivo** | `components/dashboard/sidebar.tsx` |
| **Linha** | ~65 |
| **Descrição** | Link MC sempre visível; `painel-inicial/Sidebar.tsx` usa `visible: p.admin.masterConsole` |
| **Impacto** | Não-admins veem link → redirect `?access=denied` |
| **Risco** | UX ruim; inconsistência entre sidebars |
| **Recomendação** | Aplicar mesmo predicate de `painel-inicial/Sidebar.tsx` |

### P1-10 — Status dots PDV “Ativo/Integrado” sem verificação

| Campo | Valor |
|-------|-------|
| **Arquivo** | `PdvSection.tsx` |
| **Linha** | ~817–818, 838 |
| **Descrição** | Bolinhas `bg-emerald-500` / `bg-amber-500` fixas em “PDV WhatsApp” e “OS → Venda” |
| **Impacto** | Sugere integração live sem checagem de webhook/settings |
| **Risco** | UX enganosa |
| **Recomendação** | Remover dots ou derivar de settings/env |

### P1-11 — Footer sidebar “Plano Pro” hardcoded

| Campo | Valor |
|-------|-------|
| **Arquivo** | `SettingsSidebar.tsx` |
| **Linha** | ~60–64 |
| **Descrição** | “Plano Pro / Até 5 lojas e IA ilimitada” fixo |
| **Impacto** | Mostra tier premium independente de `subscriptionPlan` real |
| **Risco** | Marketing falso dentro de configurações |
| **Recomendação** | Bind a dados de billing ou remover promo |

### P1-12 — GET loja individual sem auth

| Campo | Valor |
|-------|-------|
| **Arquivo** | `app/api/stores/[id]/route.ts` |
| **Linha** | ~22–30 |
| **Descrição** | `GET` por id público |
| **Impacto** | Vazamento de detalhes de unidade |
| **Risco** | Complemento de P0-01 |
| **Recomendação** | Auth + scoping |

### P1-13 — Supervisor PIN global (não por loja)

| Campo | Valor |
|-------|-------|
| **Arquivo** | `app/api/admin/supervisor-pin/route.ts` |
| **Linha** | ~60–64 |
| **Descrição** | `findFirst` ADMIN — primeiro user admin do DB |
| **Impacto** | Multi-loja compartilha um PIN de supervisor PDV |
| **Risco** | PIN de uma filial afeta todas |
| **Recomendação** | Documentar single-tenant ou scope por store |

---

## Melhorias P2

| ID | Arquivo | Linha | Descrição | Recomendação |
|----|---------|-------|-----------|--------------|
| P2-01 | `ConfiguracoesV3Page.tsx` | ~126 | `overflow-y-auto` interno + `min-h-screen` | Remover scroll nested; AppShell é dono |
| P2-02 | `ConfiguracoesV3Page.tsx` | ~50–90 | Estado `active` duplica URL `sec` | Derivar só de `searchParams` |
| P2-03 | Seções (Geral, Lojas, PDV, etc.) | wrapper exports | Re-mount de `ConfigEmpresaProvider` + `LojaAtivaProvider` por seção | Providers únicos no shell |
| P2-04 | `sections.ts` + `PlanoSection.tsx` | ~43–48 | Menu “Plano” vai para `/dashboard/billing`; `PlanoSection` só via `?sec=plano` | Unificar padrão |
| P2-05 | `pages/Index.tsx` | 1–82 | Protótipo Lovable não importado pelo Next | Remover ou `_imports/` |
| P2-06 | `pages/NotFound.tsx` | ~7–8 | `react-router-dom` + `console.error` | Remover |
| P2-07 | `GeralSection.tsx` | ~412–444 | Moeda/fuso disabled com copy honesta | OK; manter label “não salva” |
| P2-08 | `GeralSection.tsx` | ~104–157 | Loading sem skeleton explícito | Skeleton no card |
| P2-09 | `AparenciaSection.tsx` | ~91–94 | Botão preview “Em breve” disabled | OK se mantido; considerar remover |
| P2-10 | `FinanceiroSection.tsx` | ~74–76 | Falha API cardFees silenciosa | Toast warning |
| P2-11 | `FinanceiroSection.tsx` | ~217–225 | Link morto para “centro financeiro completo” | Link para financeiro-v2 |
| P2-12 | `ImportacaoSection.tsx` | ~32–52 | Modo import só localStorage | Documentar (OK para preferência UI) |
| P2-13 | `ImportacaoSection.tsx` | ~5–6 | Imports `@/components/ui` vs V3-local | Padronizar |
| P2-14 | `IntegracoesSection.tsx` | ~69 | WhatsApp → `/whatsapp-automation` vs HUB `/whatsapp` | Padronizar nomenclatura |
| P2-15 | `UsuariosSection.tsx` | ~308 | `confirm()` nativo para desativar | AlertDialog |
| P2-16 | `PdvSection.tsx` | ~481–690 | Cores hardcoded em preview (slate, zinc, hex) | Isolar preview ou tokens |
| P2-17 | `ThemeCard.tsx` | ~64 | `!text-white` | `text-primary-foreground` |
| P2-18 | `UsuariosSection.tsx` | ~358, 512 | `text-amber-500`, `text-emerald-600` | Tokens semânticos |
| P2-19 | `components/ui/accordion copy.tsx` | — | Arquivo duplicado morto | Apagar |
| P2-20 | `components/ui/sidebar.tsx` (V3) | ~536 | `Math.random()` em skeleton width | Valor fixo |
| P2-21 | `SupervisorPinCard.tsx` | ~168–218 | amber/emerald hardcoded | `text-warning`, `text-success` |
| P2-22 | `StoreList.tsx` | ~140 | Badge Principal amber hardcoded | `border-warning/40` |
| P2-23 | `TeamPanel.tsx` | ~79, 129 | `overflow-y-auto` em tabs | Evitar nested scroll |
| P2-24 | `StoreFormSheet.tsx` | ~11 | `store?: any` | Tipar `Store` |
| P2-25 | Forms MC | defaultValues | Form não reseta ao abrir edit | `form.reset()` on open |
| P2-26 | `supervisor-pin/route.ts` | — | PIN plaintext em `User.pin` | Hash (fora escopo UI) |
| P2-27 | `ConfiguracoesNavContext.tsx` | ~27–30 | `navigateToSection` no-op fora provider | Dev warning |

---

## Mocks/fakes encontrados

| Local | Tipo | Detalhe | Honesto? |
|-------|------|---------|----------|
| `FinanceiroSection` KPI tiles | localStorage | `useFinanceiro()` / `assistec-pro-financeiro-v2-*` | Parcial — falta label |
| `VendasSection` formas pagamento | UI estática | `FORMAS_PAGAMENTO_PADRAO` + switches disabled | **Sim** — badges “Em breve” |
| `SettingsSidebar` footer | Hardcoded | “Plano Pro” promo | **Não** |
| `Master Console` KPIs | Placeholder | `"—"` colaboradores/faturamento | **Não** — cards parecem métricas |
| `Master Console` TeamPanel | Array vazio | employees/activity sempre `[]` | Parcial — empty state OK |
| `TeamPanel` reset senha | Fake success | `omni123456` | **Não** |
| `EmployeeAccessSheet` | Local state | Permissões + PIN não persistem | **Não** |
| `PdvSection` status dots | Decorativo | Verde/âmbar fixos | **Não** |
| `pages/Index.tsx` | Protótipo Lovable | Não roteado | N/A (morto) |
| `pdv-github-original/.../master-console` | Mock completo | R$ 145k, 18 employees (não é rota live) | Arquivo morto |

---

## Botões sem ação real

| Arquivo | Linha | Controle | Comportamento real |
|---------|-------|----------|-------------------|
| `EmployeeAccessSheet.tsx` | ~345 | Salvar alterações | Nenhum handler |
| `StoreFormSheet.tsx` | ~44 | Salvar Alterações | Submit sem `onSubmit` |
| `EmployeeFormSheet.tsx` | ~44–70 | Submit form | Idem |
| `StoreList.tsx` | ~181 | Pausar Filial | Sem `onClick` |
| `TeamPanel.tsx` | ~166 | Confirmar reset senha | Só `setResetDone(true)` |
| `AparenciaSection.tsx` | ~91 | Preview (Eye) | `disabled` — honesto |
| `FinanceiroSection.tsx` | ~277 | Switch relatório email | `disabled` — honesto |
| `VendasSection.tsx` | ~249 | Switches formas pagamento | `disabled` — honesto |

**Toasts reais (OK):** Geral, PDV, Vendas (parcial), Financeiro (metas), Usuarios — todos ligados a fetch/API.

**Sem `console.log` em `features/`** — único `console.error` em `pages/NotFound.tsx` (morto).

---

## Configurações sem efeito real

| Setting | Onde salva | Onde deveria afetar | Estado |
|---------|------------|---------------------|--------|
| `incluirImpostoEstimadoNoPdv` | `printerConfig` via API | PDV totais | **Órfã** |
| `aliquotaImpostoEstimadoPdv` | idem | PDV totais | **Órfã** |
| Moeda / fuso (`GeralSection`) | Não salva | Formatação global | Disabled + copy OK |
| Formas pagamento V3 | Não persiste | PDV checkout | Explicitamente “Em breve” |
| Modo importação | localStorage `@omnigestao:importacao-modo` | Preferência UI only | OK documentado |
| PDV layout keys | localStorage + API | PDV runtime | **Real** (reload pode ser necessário) |
| Permissões MC | React state only | ACL runtime | **Fake** |
| PIN colaborador MC | React state | Auth PDV | **Fake** |

**Duplicidade de superfícies admin:**

- Usuários reais: `Configurações V3 → Usuarios` + `/api/admin/users`
- Lojas reais: `Lojas` (GestaoUnidadesSaas) + `/dashboard/unidades`
- MC: repete UI de lojas/equipe **sem** wiring completo

---

## Problemas visuais/tokens

| Severidade | Arquivo | Problema |
|------------|---------|----------|
| P1 | `PdvSection.tsx` | `bg-white`, `bg-black`, `#e2eafc`, `#1e293b`, `slate-*`, `zinc-*`, `emerald-*` em preview |
| P2 | `SupervisorPinCard.tsx` | `amber-500`, `emerald-500/700` |
| P2 | `StoreList.tsx` | `amber-500/40`, `text-amber-800` badge Principal |
| P2 | `UsuariosSection.tsx` | `text-amber-500`, `text-emerald-600` |
| P2 | `ThemeCard.tsx` | `!text-white` |
| P2 | `select.tsx` (V3 ui) | `dark:bg-black/60` em primitive — aceitável em ui kit |

**Layout:** `ConfiguracoesV3Page` e `TeamPanel` usam scroll interno — conflito potencial com `AppShell` como scroll owner.

**Positivo:** Maior parte das seções V3 usa tokens semânticos (`bg-card`, `text-muted-foreground`, `border-border`).

---

## Problemas de arquitetura

1. **Providers duplicados** — cada seção re-wraps `ConfigEmpresaProvider` / `LojaAtivaProvider` / `StoreSettingsProvider` → fetches redundantes e estado isolado.
2. **Estado URL vs local** — `active` + `searchParams` em Config V3.
3. **Financeiro dual-write** — `cardFees` API + `persistCentroFinanceiroV3ForStore` localStorage + `useFinanceiro` separado.
4. **Dois modelos de usuário** — `AdminUser` (NextAuth, Config Usuarios) vs `User` (PDV PIN, MC TeamPanel) sem ponte clara.
5. **Dois sidebars** — `painel-inicial/Sidebar` (perm-aware) vs `dashboard/sidebar` (legacy, MC sempre visível).
6. **Código morto Lovable** — `pages/Index.tsx`, `NotFound.tsx`, `accordion copy.tsx`.
7. **PlanoSection órfã** — registrada em `SECTION_COMPONENTS` mas menu externo para billing.

---

## Problemas de UX

| Área | Gap |
|------|-----|
| Geral | Loading sem skeleton |
| Financeiro | Link quebrado; falha API silenciosa; KPIs sem disclaimer |
| Vendas | Imposto parece funcional (tem Salvar) mas PDV ignora |
| Usuarios | Link MC confuso; `confirm()` nativo |
| MC Team | Forms parecem prontos; empty states bons mas enganam sobre capacidade |
| MC Delete | Sem feedback de erro |
| Seguranca | Honesta — documenta gaps (ponto positivo) |
| GoLiveChecklist | Honesta — disclaimers em Dashboard/KPIs/WhatsApp |

**Positivos UX:** Usuarios (loading/error/empty), MC page loading/retry, Seguranca informativa, Importacao switcher claro, Integracoes status labels.

---

## Master Console

### Mapa funcional

```
MasterConsolePage
├── GET /api/stores          → REAL (lista) — SEM AUTH no GET
├── DELETE /api/stores/:id   → REAL parcial — auth fraco, UX erro
├── KpiCard ×3               → 1 real (count lojas), 2 fake
├── StoreList                → REAL list + delete modal; edit/pause FAKE
├── StoreFormSheet           → FAKE (no submit)
├── TeamPanel                → FAKE shell (employees=[])
│   ├── EmployeeFormSheet    → FAKE
│   ├── EmployeeAccessSheet  → FAKE save
│   └── Reset/Inactivate     → FAKE local state
└── SupervisorPinCard        → REAL (GET/POST /api/admin/supervisor-pin, role check)
```

### Proteção de rota UI

- `lib/auth/proxy-enterprise-dashboard.ts` (~96–98): bloqueia MC se `!perms.admin.masterConsole`
- **APIs não herdam** esse gate — `proxy.ts` deixa `/api/*` público por rota

### Riscos operacionais admin

1. Exclusão de loja com cascade massivo
2. Enumeração de rede sem login
3. Duas UIs de gestão (MC vs Unidades vs Config Usuarios)
4. PIN supervisor plaintext no DB
5. Protótipo Lovable em `pdv-github-original` com dados fake pode confundir devs

### O que está production-ready no MC

| Feature | Status |
|---------|--------|
| Listar lojas | Parcial — dados reais, auth GET ausente |
| Excluir loja | Parcial — persiste, auth/UX fracos |
| Supervisor PIN | **Bom** — melhor peça do módulo |
| Criar/editar loja | Usar `/dashboard/unidades` |
| Equipe/permissões/KPIs/logs | **Não funcional** |

---

## Sequência recomendada de correção

### Fase 1 — Segurança e dados (bloqueante)

1. Auth em `GET /api/stores` e `GET /api/stores/[id]`
2. Restringir `requireAdmin` a SUPER_ADMIN \| ADMIN
3. Guard server-side contra delete de loja principal
4. Tratar erro no `handleDelete` do MC

### Fase 2 — Navegação e settings órfãs

5. Corrigir link Financeiro → rota real do financeiro-v2
6. Label ou API para KPIs financeiros na V3
7. Wire imposto PDV ou desabilitar com badge explícito
8. Remover/corrigir link Usuarios → MC

### Fase 3 — Master Console honesto ou completo

9. **Opção A (rápida):** Strip fake actions; MC = lojas + PIN + link para Unidades/Usuarios  
10. **Opção B (completa):** Wire TeamPanel a `/api/admin/users`; forms a POST/PUT stores  
11. Remover reset senha fake e Salvar permissões até existir API  
12. Gate MC na sidebar legacy

### Fase 4 — Polish

13. Providers únicos no Config V3 shell  
14. Tokens em PdvSection preview / SupervisorPinCard  
15. Footer Plano Pro dinâmico ou removido  
16. Limpar código morto (`pages/Index`, `NotFound`, accordion copy)

---

## Apêndice — Seções V3 (checklist rápido)

| Seção | Backend | Mocks | Nota |
|-------|---------|-------|------|
| Geral | `/api/stores`, settings | Moeda/fuso UI-only | GoLive checklist honesto |
| Lojas | GestaoUnidadesSaas | — | Real |
| Plano | Links billing | — | Menu externo |
| Aparência | ThemeContext | Preview em breve | Temas reais |
| PDV | API + localStorage | Status dots | Preview cores hardcoded |
| Vendas | API parcial | Formas pagamento; imposto órfão | Garantia/mesas reais |
| Financeiro | cardFees API | KPIs localStorage; link quebrado | Metas reais |
| IA | Credits API | Modelo read-only | Links OK |
| Integrações | Settings | Marketplace hub | Copy honesta |
| Importação | Importadores reais | Modo localStorage | Real |
| Usuarios | `/api/admin/users` | Link MC | CRUD sólido |
| Segurança | signOut | 2FA/senha em breve | Documentação honesta |

---

*Auditoria gerada em modo somente leitura — nenhum arquivo de código foi alterado.*
