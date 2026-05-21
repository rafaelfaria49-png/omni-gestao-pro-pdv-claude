# Auditoria Técnica Completa — OmniGestão Pro

**Tipo:** análise read-only (sem alteração de código, schema, migrations ou commits)  
**Data:** 21 de maio de 2026  
**Objetivo:** mapa real do sistema atual para comparação posterior com ERPs de mercado (ex.: GestãoClick)  
**Metodologia:** inspeção de rotas `app/dashboard/*`, `app/api/*`, `app/actions/*`, `components/*`, `lib/*`, `prisma/schema.prisma`, `docs/ai/CURRENT_STATUS.md`, `docs/modules/reports/AUDITORIA_GERAL_OMNIGESTAO_PRO.md`

---

## Legenda de status

| Status | Significado |
|--------|-------------|
| **REAL** | Fluxo principal persiste/consulta Prisma ou API estável documentada |
| **MOCK** | Demonstração sem persistência de negócio confiável |
| **PARCIAL** | Mix real + localStorage, seed Lovable, placeholder ou superfície duplicada |
| **LEGADO** | Rota/código antigo mantido em paralelo à versão “oficial” |
| **EM TRANSIÇÃO** | Backend real com UI ou rota ainda convergindo |

---

## Stack e arquitetura (visão geral)

| Camada | Tecnologia | Observação |
|--------|------------|------------|
| Frontend | Next.js 16 App Router, React 19, Tailwind 4 | HUBs Lovable isolados com `MemoryRouter` |
| Backend | Server Actions + ~162 API routes | Preferência actions para mutações internas |
| ORM | Prisma 6 → PostgreSQL (Supabase pooler 6543 / direct 5432) | `payload` JSONB como fonte rica em OS/financeiro |
| Auth externa | NextAuth v5 (JWT, `AdminUser`) | Edge-safe em `auth.config.ts` + credentials em `auth.ts` |
| Auth interna legado | `AccessGate` + PIN + cookies staff | **MOCK** em localStorage para papel staff |
| Multi-loja | Header `x-assistec-loja-id`, cookie `assistec-active-store`, LS `assistec-pro-loja-ativa-v1` | Regra: todo query com `where: { storeId }` |
| Billing | Stripe (checkout, portal, webhooks) | `/dashboard/billing` = fonte principal; `/meu-plano` = legado |
| Deploy | Vercel + PWA | Risco documentado: cache/ENV em produção |

### Padrão “HUB Lovable”

Vários módulos montam sub-app React Router dentro do Next.js:

- `*Isolated.tsx` + providers locais
- Seeds em `components/*/lovable/data/*Seed.ts` (excluídos do tsc em partes)
- Tema sincronizado via `applyGlobalTheme()` / `data-studio-theme`

**Risco:** desenvolvedor pode editar seed/mock achando que é produção.

---

## Inventário Prisma (por domínio)

| Domínio | Modelos principais |
|---------|-------------------|
| Multi-loja / SaaS | `Store`, `StoreSettings`, `AppLojaSettings`, `AdminUser`, `AdminUserStore`, `User`, `Usage`, `CreditPurchase` |
| Cadastros | `Cliente`, `Produto`, `Servico`, `Fornecedor`, `CategoriaCadastro`, `MarcaCadastro`, `Tecnico`, `EquipamentoModelo`, `ProductMedia`, `CategoriaProduto` |
| Operações | `OrdemServico`, `OrdemServicoItem`, `GarantiaOrdemServico` |
| Estoque | `MovimentacaoEstoque`, `Produto.stock` |
| Vendas / PDV | `Venda`, `ItemVenda`, `DevolucaoVenda`, `ItemDevolucaoVenda`, `SessaoCaixa`, `CaixaOperacao` |
| Financeiro núcleo | `ContaReceberTitulo`, `ContaPagarTitulo`, `MovimentacaoFinanceira`, `CarteiraFinanceira`, `FechamentoFinanceiro`, `ConciliacaoFinanceira`, `AuditoriaFinanceira`, `LedgerSnapshot` |
| Financeiro paralelo | `FinancialAccount`, `FinancialCategory`, `FinancialTransaction`, `FinancialAttachment` |
| Marketplace | `MarketplaceConnection`, `MarketplaceSyncLog`, `MarketplaceProductLink`, `MarketplaceListing` |
| WhatsApp | `WhatsAppContact`, `WhatsAppConversation`, `WhatsAppMessage`, `WhatsAppAutomation`, `WhatsAppQuickReply`, `WhatsAppEtiqueta`, `WhatsAppConversacaoEtiqueta`, `WhatsAppAiSetting`, `WhatsAppAutomationLog`, `WhatsAppPendingAction` |
| Marketing / IA | `MarketingPost`, `MarketingIaPost`, `MarketingMediaJob`, `IaConversation`, `IaMessage` |
| Omni Agent | `OmniAgentCommand`, `OmniAgentAutomation`, `OmniAgentAutomationRun` |
| Auditoria | `LogsAuditoria` |

**Gap fiscal:** não existe modelo `NotaFiscal`, `NFe`, `CFOP` persistido como entidade fiscal completa.

---

## Server Actions (`app/actions/`)

| Arquivo | Escopo |
|---------|--------|
| `operacoes.ts` | Ciclo OS, estoque adapter, cobrança, checklist, garantia, vendas hub |
| `ordens.ts` | Listagem/hydration OS (canal alternativo) |
| `cadastros.ts` | CRUD cadastros, stats dashboard, auditoria importação |
| `estoque.ts` | Entrada, ajuste, resumo, listagem movimentações |
| `omni-agent.ts` | Comandos, stats, automações, executor, relatórios |
| `whatsapp.ts` | Envio Cloud API |
| `vendas-enterprise.ts` | Enriquecimento venda |
| `backfill-venda-cliente.ts` | Manutenção FK cliente (script operacional) |
| `auth.ts` | signIn/signOut/getCurrentUser |

**Nota:** não há `app/actions/financeiro.ts` — financeiro flui via API routes + `lib/financeiro/services/`.

---

## Mapa de APIs (agrupamento)

| Grupo | Rotas representativas |
|-------|----------------------|
| Ops / PDV | `app/api/ops/venda-persist`, `vendas-list`, `caixa/*`, `devolucao*`, `inventory*`, `ordens`, `contas-*-list\|persist` |
| Financeiro | `app/api/financeiro/receber`, `pagar`, `fluxo-caixa`, `dre`, `carteiras/*`, `fechamentos/*`, `conciliacao/*`, `relatorios/*` |
| Cadastros | `app/api/clientes`, `produtos`, `import/advanced`, `import/validate/*` |
| Dashboard | `app/api/dashboard/elite` |
| WhatsApp | `app/api/whatsapp/*`, `app/api/webhooks/whatsapp` |
| Marketplace | `app/api/marketplace/*` |
| Marketing / IA | `app/api/marketing/*`, `app/api/product/*`, `app/api/vision/product-scan` |
| Admin / Billing | `app/api/admin/users`, `billing/*`, `webhooks/stripe`, `subscription/*` |
| Stores | `app/api/stores/*`, `settings/perfil-loja` |

---

# Auditoria módulo a módulo

---

## 1. Dashboard (Painel Inicial)

### Estrutura

| Item | Caminho |
|------|---------|
| Rota principal | `/dashboard` → `app/dashboard/page.tsx` |
| Layout shell | `components/painel-inicial/AppShell.tsx`, `Sidebar.tsx`, `Topbar.tsx` |
| Componentes KPI | `KpiCard`, `RevenueChart`, `CategoryChart`, `CriticalStock`, `RecentActivityTable`, `AiInsights`, `QuickActions`, `DashboardDemoNotice`, `EmpresaSetupCard` |
| Hook | `hooks/use-dashboard-elite.ts` |
| API | `app/api/dashboard/elite/route.ts` |
| Providers | `LojaAtivaProvider` (via `AppOpsProviders`), tema global |

**Models Prisma:** `Venda`, `ItemVenda`, `OrdemServico`, `Produto`, `ContaReceberTitulo`, `Cliente`

### Status

**REAL** (KPIs principais) + **PARCIAL** (`AiInsights` ainda heurístico/demo em partes)

O painel consome API elite com agregações Prisma quando há `storeId`. `DashboardDemoNotice` declara honestamente o mix ao vivo vs demonstrativo.

### Integração

| Sistema | Status |
|---------|--------|
| Supabase/Prisma | ✅ Agregações reais |
| Estoque | ✅ `alertaEstoqueCount`, `CriticalStock` |
| Financeiro | ✅ `contasReceberHoje` |
| Operações | ✅ OS abertas, movimentos recentes |
| WhatsApp | ❌ Não no dashboard principal |
| Permissões | Sidebar filtra por `enterprise-permissions` |

### Fluxo operacional

1. Usuário autenticado entra em `/dashboard`.
2. `useLojaAtiva` resolve unidade ativa (LS + cookie + `/api/stores`).
3. `useDashboardElite` chama `GET /api/dashboard/elite` com header `x-assistec-loja-id`.
4. KPIs, gráfico 7d, estoque crítico e atividade recente renderizam com fallback “—” sem loja.
5. QuickActions navegam para vendas, OS, clientes, estoque.

### Problemas encontrados

- Documentação antiga (`AUDITORIA_GERAL`) ainda cita KPIs 100% mock — **desatualizada**.
- `AiInsights` pode sugerir ações sem backend de execução automática.
- Alguns componentes secundários (`CategoryChart`) podem exibir estado vazio sem distinguir “sem dados” vs “erro API”.

### Funcionalidades faltando (vs ERP premium)

- Dashboard executivo multi-loja consolidado
- Drill-down por KPI (clicar faturamento → relatório)
- Metas vs realizado
- Alertas configuráveis (SLA OS, inadimplência)
- Export PDF/email de resumo diário

### Classificação

| Prioridade | Complexidade | Risco |
|------------|--------------|-------|
| **P2** (polish + drill-down) | Média | Baixo |

---

## 2. PDV (Vendas / Caixa)

### Estrutura

| Item | Caminho |
|------|---------|
| Rotas | `/dashboard/vendas`, `/dashboard/pdv-next`, `/dashboard/vendas/venda-completa`, `/dashboard/caixa/historico`, `/dashboard/pdv` (redirect) |
| Quarentena | `/dashboard/pdv-github-original` (mini-app isolada, sem AppShell) |
| Componentes | `components/dashboard/vendas/*`, `components/pdv-next/PdvBlackEdition.tsx` |
| Store | `lib/operations-store.tsx` |
| Actions | `app/actions/vendas-enterprise.ts` |
| APIs | `app/api/ops/venda-persist`, `caixa/*`, `vendas/*`, `devolucao*` |

**Models Prisma:** `Venda`, `ItemVenda`, `Produto`, `Cliente`, `SessaoCaixa`, `CaixaOperacao`, `DevolucaoVenda`, `ContaReceberTitulo` (via integração)

### Status

**PARCIAL** — vendas enterprise **REAL**; caixa **híbrido** (API + localStorage); PDV Next pagamento **MOCK**

### Integração

| Sistema | Status |
|---------|--------|
| Estoque | Parcial (baixa na venda depende do fluxo) |
| Financeiro | ✅ `venda-persist` materializa receber |
| Clientes | ✅ Busca real |
| Produtos | ✅ Catálogo `/api/ops/inventory` |
| Permissões | Matriz `pdv.*` em `enterprise-permissions.ts` |

### Fluxo operacional

1. Operador abre `/dashboard/vendas` (classic/assistência/supermercado conforme config).
2. Catálogo e clientes vêm de APIs Prisma.
3. `finalizeSaleTransaction` em `operations-store` persiste via `POST /api/ops/venda-persist`.
4. Estado de caixa também em `localStorage` (`omnigestao:caixa:{storeId}`).
5. Histórico de sessões: `/dashboard/caixa/historico` via APIs `caixa/*`.
6. **PDV Black Edition** (`pdv-next`): UX completa, `PaymentModal` limpa carrinho **sem persistir** venda.

### Problemas encontrados

- **Dupla fonte caixa:** LS vs `SessaoCaixa` no servidor.
- **PDV Black:** pagamento fake — risco de demo confundida com produção.
- `finalizeSaleTransaction` best-effort: falha de rede pode deixar UI “vendido” sem DB (`console.warn`).
- Múltiplos layouts PDV (classic, assistência, supermercado, black) = manutenção alta.
- Quarentena `pdv-github-original/` duplica rotas — risco de editar arquivo errado.

### Funcionalidades faltando

- Fechamento caixa server-authoritative multi-terminal
- Sangria/reforço com auditoria obrigatória
- Comissão vendedor
- TEF / PIX integrado nativo
- NFC-e no cupom
- Modo offline resiliente

### Classificação

| Prioridade | Complexidade | Risco |
|------------|--------------|-------|
| **P1** (caixa server + Black persist) | Alta | **Alto** (dinheiro) |

---

## 3. Operações / OS

### Estrutura

| Item | Caminho |
|------|---------|
| Rota oficial HUB | `/dashboard/operacoes-v2` → `OperacoesHubIsolated.tsx` |
| Rota legado | `/dashboard/os` (~1700 linhas, Prisma direto) |
| Store HUB | `components/operacoes/lovable/store/osStore.tsx` |
| API HUB | `components/operacoes/lovable/api/os.ts` → Server Actions |
| Actions | `app/actions/operacoes.ts`, `app/actions/ordens.ts` |
| APIs paralelas | `app/api/ops/ordens`, `app/api/ordens-servico/*` |
| Adapters | `lib/operacoes/adapters/os-estoque.ts`, `os-faturamento` via financeiro |

**Models Prisma:** `OrdemServico`, `OrdemServicoItem`, `GarantiaOrdemServico`, `Cliente`, `Produto`, `MovimentacaoEstoque`, `ContaReceberTitulo`, `Venda`, `LogsAuditoria`

### Status

**REAL** (backend ciclo OS) + **PARCIAL** (UI: seeds auxiliares, notificações mock, equipamento Kanban incompleto) + **LEGADO** (`/dashboard/os`)

### Integração

| Sistema | Status |
|---------|--------|
| Estoque | ✅ Adapter Fase 2 (21/05) — ledger OS com operador, documento, custo |
| Financeiro | ✅ Faturamento → contas a receber idempotente (`localKey`) |
| PDV | ✅ `criarVendaDeOSAction` |
| WhatsApp | Parcial (notificações UI mock) |
| Cadastros | ✅ Produtos, técnicos, clientes |

### Fluxo operacional

1. OS criada no HUB V2 via actions → Prisma `OrdemServico` + `payload` JSONB.
2. Status normalizado; timeline em `payload.historico[]`.
3. Orçamento/aprovação segue política em services.
4. Entrega dispara consumo estoque via `consumeEstoqueFromOS`.
5. Faturamento materializa CR com `localKey` idempotente.
6. Anexos em IndexedDB (não Prisma).

### Problemas encontrados

- **P0:** duas UIs OS + dois canais API/Actions.
- Seeds Lovable (`*Seed.ts`, `_db.ts`) coexistem — confusão em dev.
- Anexos só local (IndexedDB) — perda ao trocar browser.
- Equipamento no card Kanban pendente (`CURRENT_STATUS`).
- Movimentos OS históricos pré-21/05 sem auditoria completa no ledger.

### Funcionalidades faltando

- OS única rota oficial + redirect legado
- Anexos cloud (Supabase Storage)
- SLA e fila por técnico
- Orçamento PDF assinatura digital
- Integração garantia RMA automática

### Classificação

| Prioridade | Complexidade | Risco |
|------------|--------------|-------|
| **P0** (unificar OS) | Alta | **Alto** |

---

## 4. Financeiro

### Estrutura

| Item | Caminho |
|------|---------|
| Rota HUB V2 | `/dashboard/financeiro-v2` → `FinanceiroHubIsolated.tsx` |
| Stub legado | `/dashboard/financeiro` → `ModuleEmDesenvolvimento` |
| Contexto real | `components/financeiro/lovable/context/FinanceiroRealContext.tsx` |
| UI rotas | `components/financeiro/lovable/routes/financeiro.tsx` |
| Services | `lib/financeiro/services/*`, `lib/financeiro/adapters/os-faturamento.ts` |
| Contratos | `lib/financeiro/contracts/local-key.ts` (**protegido**) |
| APIs | `app/api/financeiro/*` (~30 rotas) |
| Store legado LS | `lib/financeiro-store.tsx`, `lib/contas-receber-storage.ts`, `lib/centro-financeiro.ts` |

**Models Prisma:** `ContaReceberTitulo`, `ContaPagarTitulo`, `MovimentacaoFinanceira`, `CarteiraFinanceira`, `FechamentoFinanceiro`, `ConciliacaoFinanceira`, `AuditoriaFinanceira`, `Financial*`

### Status

**PARCIAL** — núcleo **REAL**; HUB V2 **REAL** em receber/pagar/visão (20/05); abas avançadas e renegociação incompletas; stores LS **LEGADO**

### Integração

| Sistema | Status |
|---------|--------|
| Operações | ✅ OS faturamento adapter |
| PDV | ✅ Vendas → receber |
| Importador | ✅ GestaoClick parcelas reais |
| Estoque | Indireto (custo médio) |
| Relatórios | APIs existem, UI parcial |

### Fluxo operacional

1. HUB monta `FinanceiroRealContext` com fetches a `/api/financeiro/receber|pagar` + header loja.
2. Baixa/estorno via rotas dedicadas (`contas-receber/liquidar`, etc.).
3. Importador avançado popula títulos com `localKey` idempotente.
4. DRE/fluxo/caixa existem no backend; UI HUB nem sempre expõe.
5. Painéis legados em `components/dashboard/financeiro/` ainda podem ler LS.

### Problemas encontrados

- **Tripla superfície:** HUB V2, APIs Prisma, localStorage legado.
- `RenegociarModal` — “em preparação”.
- Sidebar ainda lista `/dashboard/financeiro` stub para alguns perfis.
- KPIs específicos aba A Pagar não expostos na UI.
- Documentação Maio ainda mistura “HUB mock” com estado pós-20/05.

### Funcionalidades faltando

- Renegociação / protesto / cobrança terceirizada
- Conciliação bancária OFX automática
- DRE gerencial multi-loja
- Centro de custo / plano de contas configurável
- Fechamento contábil mensal bloqueante
- Integração boleto/PIX nativo

### Classificação

| Prioridade | Complexidade | Risco |
|------------|--------------|-------|
| **P0** (rota única + retirar LS) | Alta | **Alto** |

---

## 5. Marketplace

### Estrutura

| Item | Caminho |
|------|---------|
| Rotas | `/dashboard/marketplace`, `/dashboard/marketplaces` |
| UI | `components/marketplace/lovable/MarketplaceLayout.tsx`, `MarketplaceCatalogReal.tsx` |
| APIs | `app/api/marketplace/connections/*`, `produtos/*`, `anuncios`, `links/*`, `sync-logs` |
| Services | `lib/marketplace/services/*`, `simulate-flags.ts` |

**Models Prisma:** `MarketplaceConnection`, `MarketplaceSyncLog`, `MarketplaceProductLink`, `MarketplaceListing`, `Produto`

### Status

**PARCIAL** — Prisma + APIs **REAL**; sync/publicação **simulada** (`[mock]`, `SIM-*` externalId)

### Integração

| Sistema | Status |
|---------|--------|
| Cadastros/Produtos | ✅ Links e listings |
| Estoque | Simulado |
| Vendas | Não bidirecional real |
| Financeiro | Não |

### Fluxo operacional

1. Usuário conecta marketplace → registro Prisma com `TOKEN_PLACEHOLDER`.
2. Export/sync gera logs com flags mock.
3. UI exibe catálogo real de produtos locais + status de link.

### Problemas encontrados

- Expectativa comercial de ML/Shopee sem integração OAuth real.
- Tokens placeholder persistidos.
- Duas rotas (`marketplace` vs `marketplaces`).

### Funcionalidades faltando

- OAuth Mercado Livre / Shopee / Amazon
- Sync estoque bidirecional
- Pedidos marketplace → OS/venda automática
- Precificação dinâmica

### Classificação

| Prioridade | Complexidade | Risco |
|------------|--------------|-------|
| **P3** (produto) / **P2** (engenharia limpeza) | Alta | Médio |

---

## 6. Omni Agent HUB

### Estrutura

| Item | Caminho |
|------|---------|
| Rota | `/dashboard/omni-agent` |
| UI | `components/omni-agent/OmniAgentHub.tsx`, `OmniAgentInboxReal.tsx` |
| Actions | `app/actions/omni-agent.ts` |
| Lib | `lib/omni-agent/interpret.ts`, `executor.ts`, `omni-automation-engine.ts` |

**Models Prisma:** `OmniAgentCommand`, `OmniAgentAutomation`, `OmniAgentAutomationRun`, `LogsAuditoria`

### Status

**REAL** (backend comandos/automações) + **PARCIAL** (UI: sugestões mock, prefs LS, canais “Voz mock”)

Pós 21/05: gráficos `Math.random` removidos; stats reais Prisma.

### Integração

| Sistema | Status |
|---------|--------|
| Financeiro | ✅ Relatórios via executor |
| Operações | Parcial |
| WhatsApp | Label mock na UI |
| Permissões | `workspace.omniAgent` |

### Fluxo operacional

1. Comando entra inbox → interpretação determinística + LLM opcional.
2. Status: pending → awaitingConfirmation → executed/error.
3. Automações registradas em Prisma; runs auditáveis.
4. Preferências UI em LS (`omni-settings`, créditos IA locais).

### Problemas encontrados

- Créditos IA no SettingsTab ainda LS — não reflete plano Stripe.
- Cards de sugestão UI não executam backend.
- Breakdown “comandos por hora” exigiria extensão DTO stats.

### Funcionalidades faltando

- Execução voz/WhatsApp real end-to-end
- Aprovação em dois fatores para ações destrutivas
- Memória operacional unificada cliente
- Marketplace de automações

### Classificação

| Prioridade | Complexidade | Risco |
|------------|--------------|-------|
| **P2** | Alta | Médio |

---

## 7. WhatsApp / Automações

### Estrutura

| Item | Caminho |
|------|---------|
| Rotas | `/dashboard/whatsapp`, `/dashboard/whatsapp-automation` |
| UI produção | `components/whatsapp/WhatsAppInbox.tsx` |
| Lovable legado | `components/whatsapp/lovable/` |
| Actions | `app/actions/whatsapp.ts` |
| APIs | `app/api/whatsapp/send`, `conversations`, `messages`, `automations`, `webhooks/whatsapp` |
| Lib | `lib/whatsapp/whatsapp-service.ts` |

**Models Prisma:** família `WhatsApp*` (9 modelos)

### Status

**REAL** (inbox + Meta Cloud API) + **PARCIAL** (automações sistema, métricas HUB ilustrativas)

### Integração

| Sistema | Status |
|---------|--------|
| Clientes | Parcial (contato por telefone) |
| Omni Agent | UI referencia canal |
| Automação eventos | `app/api/automation/handle-event` |
| CRM | ❌ |

### Fluxo operacional

1. Webhook Meta valida assinatura → persiste mensagem inbound.
2. Inbox lista conversas Prisma por `storeId`.
3. Envio manual via `POST /api/whatsapp/send`.
4. Automações por palavra-chave + logs; eventos OS/venda limitados.

### Problemas encontrados

- Templates Meta exigem configuração Business Manager manual.
- Automações de evento de sistema não equivalentes a BSP enterprise.
- Quarentena `pdv-github-original` tem mock WhatsApp — não rota oficial.

### Funcionalidades faltando

- Chatbot IA com contexto OS/cliente
- Campanhas em massa com opt-in LGPD
- Atribuição fila atendente
- CSAT pós-atendimento

### Classificação

| Prioridade | Complexidade | Risco |
|------------|--------------|-------|
| **P1** | Alta | Médio (compliance Meta) |

---

## 8. Cadastros

### Estrutura

| Item | Caminho |
|------|---------|
| Rota oficial | `/dashboard/cadastros-v2` → `CadastrosHub.tsx` |
| Legado | `/dashboard/cadastros`, `/dashboard/produtos` |
| Importação | `ImportacaoHub.tsx`, `ImportadorAvancado` |
| Estoque UI | `MovimentacaoEstoqueModal.tsx` (dentro do HUB) |
| Actions | `app/actions/cadastros.ts` |
| APIs | `app/api/import/advanced`, `produtos/*` |

**Models Prisma:** cadastros + `MovimentacaoEstoque`, `LogsAuditoria`

### Status

**REAL** (núcleo Prisma) + **PARCIAL** (XML preview-only; botões Filtros/Exportar sem ação)

### Integração

| Sistema | Status |
|---------|--------|
| Estoque | ✅ Modal movimentação integrado |
| Importador GC | ✅ Planilhas reais + auditoria |
| Marketplace | Listings |
| Fiscal | Classificação API pontual |

### Fluxo operacional

1. Abas: dashboard stats, clientes, produtos, serviços, fornecedores, técnicos, equipamentos, categorias, importação, auditoria.
2. CRUD via Server Actions com `storeId`.
3. Importação planilha → `/api/import/advanced` + log `LogsAuditoria`.
4. XML NF-e → preview DOMParser, **não persiste**.

### Problemas encontrados

- `camposFiscaisFaltando` retorna 0 hardcoded no action.
- Toolbar Filtros/Exportar — fake buttons.
- Duplicidade rotas cadastros legado.

### Funcionalidades faltando

- NF-e entrada persistida
- Merge produtos duplicados (explicitamente fora de escopo operacional)
- Validação GTIN/EAN central
- Workflow aprovação cadastro

### Classificação

| Prioridade | Complexidade | Risco |
|------------|--------------|-------|
| **P1** (XML persist) | Média | Médio |

---

## 9. Clientes

### Estrutura

| Item | Caminho |
|------|---------|
| Rota | `/dashboard/clientes` → `ClientesPageClient.tsx` |
| Também | Aba Clientes no Cadastros HUB |
| APIs | `app/api/clientes`, `[id]`, `bulk-delete` |
| Actions | `listClientes`, `createCliente`, `updateCliente` em `cadastros.ts` |

**Models Prisma:** `Cliente`, `Venda`, `OrdemServico`

### Status

**REAL**

### Integração

| Sistema | Status |
|---------|--------|
| PDV/OS | ✅ FK e busca |
| WhatsApp | Por telefone |
| Financeiro | Títulos por nome/import |
| CRM | ❌ |

### Fluxo operacional

CRUD Prisma; `totalGasto` agrega OS + Vendas; backfill script para vendas legado sem FK.

### Problemas encontrados

- Duas UIs cadastro cliente (HUB vs página enterprise).
- Sem segmentação RFM, funil, campanhas.

### Funcionalidades faltando

- CRM 360° (timeline unificada)
- Score crédito
- Aniversariantes / campanhas
- Portal cliente self-service (existe `/portal` parcial)

### Classificação

| Prioridade | Complexidade | Risco |
|------------|--------------|-------|
| **P2** | Média | Baixo |

---

## 10. Estoque

### Estrutura

| Item | Caminho |
|------|---------|
| Rota dashboard | `/dashboard/estoque` → `gestao-produtos.tsx` |
| Também | Cadastros HUB > Produtos (KPIs + modal) |
| Actions | `app/actions/estoque.ts` |
| APIs | `app/api/ops/inventory`, `produtos/*` |
| Adapter OS | `lib/operacoes/adapters/os-estoque.ts` |

**Models Prisma:** `Produto`, `MovimentacaoEstoque`

### Status

**REAL** — estoque profissional com ledger, KPIs, delete seguro produto

### Integração

| Sistema | Status |
|---------|--------|
| OS | ✅ Saída/restauração idempotente |
| PDV | Parcial |
| Financeiro | Custo médio indireto |
| Fiscal | APIs suggest NCM |

### Fluxo operacional

1. Saldo em `Produto.stock`; histórico em `MovimentacaoEstoque`.
2. Entrada/ajuste manual via modal → actions.
3. OS entrega → adapter registra saída `origem:"os"`.
4. KPIs: valor custo, venda potencial, margem, SKUs sem saldo.
5. Limite “estoque baixo”: 1–5 un (`stock > 0 && < 6`).

### Problemas encontrados

- Duas telas estoque (dashboard vs cadastros).
- Histórico OS pré-21/05 sem campos auditoria completos.
- Custo zero em produtos importados legado.

### Funcionalidades faltando

- Inventário cíclico mobile
- Lote/validade/serial
- Transferência entre lojas
- Curva ABC automática

### Classificação

| Prioridade | Complexidade | Risco |
|------------|--------------|-------|
| **P2** | Média | Médio |

---

## 11. Relatórios

### Estrutura

| Item | Caminho |
|------|---------|
| Rota | `/dashboard/relatorios` → `RelatoriosHubGrid.tsx` |
| Real hoje | Link histórico vendas → `/dashboard/vendas-arquivo-geral` |
| APIs backend | `app/api/financeiro/relatorios/*`, `dre`, `fluxo-caixa` |
| Legado mock | `components/pdv-github-original/lib/relatorios-dados.ts` |

### Status

**PARCIAL** — backend financeiro **REAL**; hub UI mostly “em breve”

### Integração

Permissão `hubs.relatorios`; financeiro condicionado a `hubs.financeiro`.

### Problemas encontrados

- DRE/fluxo existem na API sem tela dedicada no hub.
- Expectativa GestãoClick-level reporting não atendida na UI.

### Funcionalidades faltando

- Builder relatórios
- Export Excel/PDF em lote
- Agendamento email
- BI embed (Metabase/Power BI)

### Classificação

| Prioridade | Complexidade | Risco |
|------------|--------------|-------|
| **P1** | Média | Médio |

---

## 12. Configurações

### Estrutura

| Item | Caminho |
|------|---------|
| Rota V3 | `/dashboard/configuracoes` → `ConfiguracoesV3Page.tsx` |
| Legado | `/dashboard/configuracoes-v2`, `app/dashboard/configuracoes/` |
| Seções | Geral, Lojas, Plano→billing, PDV, Vendas, Financeiro, IA, Integrações, Importação, Usuários, Segurança |
| Config LS | `lib/config-empresa.tsx` (`assistec-pro-config-v2`) |

### Status

**PARCIAL** — UI V3 madura; empresa/assinatura parcialmente LS; billing real em `/dashboard/billing`

### Integração

Multi-loja, PDV layout LS, importação, Stripe link.

### Problemas encontrados

- `config-empresa` LS vs `Store`/`StoreSettings` Prisma — drift.
- Múltiplas rotas config v2/v3.
- PDV Section em evolução separada (Antigravity).

### Classificação

| Prioridade | Complexidade | Risco |
|------------|--------------|-------|
| **P2** | Média | Médio |

---

## 13. Multi-loja

### Estrutura

| Item | Caminho |
|------|---------|
| Rota | `/dashboard/unidades` → `gestao-unidades-saas.tsx` |
| Lib | `lib/loja-ativa.tsx`, `lib/store-id-from-request.ts`, `lib/assistec-headers.ts` |
| APIs | `app/api/stores/*` |
| Onboarding | `first-access-wizard.tsx` |

**Models Prisma:** `Store`, `StoreSettings`, `AdminUserStore`

### Status

**REAL** (modelo + APIs) + **PARCIAL** (seleção cliente LS/cookie)

### Fluxo operacional

Store ids estáveis (`loja-1`…); header obrigatório; wizard first-access para CNPJ/nome; plano por unidade `subscriptionPlan`.

### Problemas encontrados

- LS `assistec-pro-loja-ativa-v1` pode divergir cookie.
- Master Console mock — não reflete rede real.
- Plano Prisma enum só BRONZE/PRATA/OURO (sem DIAMANTE no schema store).

### Classificação

| Prioridade | Complexidade | Risco |
|------------|--------------|-------|
| **P1** | Média | **Alto** (vazamento dados) |

---

## 14. Permissões / Usuários

### Estrutura

| Item | Caminho |
|------|---------|
| NextAuth | `auth.ts`, `auth.config.ts`, `proxy.ts`, `app/actions/auth.ts` |
| Staff mock | `components/auth/AccessGate.tsx` — `omni.mock.staff.role` |
| Enterprise | `lib/auth/enterprise-permissions.ts`, `guard-enterprise.ts` |
| Admin API | `app/api/admin/users/*` |
| UI usuários | Configurações V3 > UsuariosSection |

**Models Prisma:** `AdminUser`, `AdminUserStore`, `User`, `UserRole`

### Status

**PARCIAL** — NextAuth **REAL**; matriz enterprise **REAL** (fixa); staff gate **MOCK**

### Problemas encontrados

- **P0:** AccessGate + localStorage inseguro para B2B pago.
- Sem ACL granular no banco (matriz fixa por papel).
- Cookies legado `assistec_staff_*` coexistem.

### Funcionalidades faltando

- RBAC por loja/módulo/ação persistido
- SSO Google/Azure
- 2FA
- Log de acesso por usuário

### Classificação

| Prioridade | Complexidade | Risco |
|------------|--------------|-------|
| **P0** | Alta | **Alto** |

---

## 15. Integrações

### Estrutura

| Integração | Status | Caminhos |
|------------|--------|----------|
| Stripe Billing | REAL | `app/api/billing/*`, `webhooks/stripe`, `/dashboard/billing` |
| GestaoClick Import | REAL | `lib/importador-avancado/`, `/api/import/advanced` |
| Meta WhatsApp | REAL | webhooks + send |
| Marketplace | MOCK sync | `lib/marketplace/simulate-flags.ts` |
| OpenRouter/OpenAI | REAL | marketing, product fiscal, omni agent |
| Automação eventos | PARCIAL | `/api/automation/handle-event` |
| Supabase | Infra DB | `DATABASE_URL`, Storage não universal |

### Classificação

| Prioridade | Complexidade | Risco |
|------------|--------------|-------|
| **P1** (checklist deploy) | Média | **Alto** (secrets/webhooks) |

---

## 16. Fiscal

### Estrutura

| Item | Caminho |
|------|---------|
| Rotas dashboard | **Nenhuma** `/dashboard/fiscal` |
| APIs | `app/api/product/fiscal-classify`, `ncm-suggest`, `voice-form*` |
| UI | `ImportacaoHub` XML preview; `gestao-produtos` APIs fiscais |
| Planos | Marketing NF-e nos planos Prata+ |

### Status

**PARCIAL** — assistência IA + preview; **sem emissão NF-e/NFC-e**

### Funcionalidades faltando (vs GestãoClick)

- Emissão NF-e/NFC-e/NFS-e
- SPED
- Manifesto destinatário
- Carta correção
- Integração SEFAZ homologação/produção

### Classificação

| Prioridade | Complexidade | Risco |
|------------|--------------|-------|
| **P3** | **Alta** | **Alto** (compliance) |

---

## 17. Agenda / CRM

### Estrutura

| Item | Caminho |
|------|---------|
| CRM | **Não iniciado** — sem `/dashboard/crm` |
| Agenda | Parcial em `/dashboard/marketing-ia` (`MarketingIaPost`, calendário posts) |
| Portal | `app/portal`, `components/portal/cliente-portal.tsx` (assinaturas demo) |

### Status

**NÃO INICIADO** (CRM) / **PARCIAL** (agenda marketing)

### Classificação

| Prioridade | Complexidade | Risco |
|------------|--------------|-------|
| **P3** | Alta | Baixo |

---

## 18. Compras / Fornecedores

### Estrutura

| Item | Caminho |
|------|---------|
| Fornecedores | Cadastros HUB aba Fornecedores |
| Compras | **Sem** `/dashboard/compras` |
| Financeiro | `ContaPagarTitulo` categoria Compras (import GC) |
| XML | Preview NF-e (entrada não persiste) |

### Status

**PARCIAL** — CRUD fornecedor **REAL**; ciclo compras **NÃO FECHADO**

### Funcionalidades faltando

- Pedido de compra
- Cotação
- Recebimento mercadoria → estoque automático
- Contas a pagar originadas de PC
- Curva fornecedor

### Classificação

| Prioridade | Complexidade | Risco |
|------------|--------------|-------|
| **P2** | Alta | Médio |

---

# localStorage / sessionStorage — dependências legado

| Chave / padrão | Uso | Risco |
|----------------|-----|-------|
| `assistec-pro-loja-ativa-v1` | Loja ativa | Médio — drift cookie |
| `assistec-pro-ops-v1-{loja}` | Cache ops/vendas | Alto — drift DB |
| `omnigestao:caixa:{storeId}` | Estado caixa PDV | **Alto** |
| `assistec-pro-financeiro-v2-{loja}` | Financeiro legado | **Alto** |
| `assistec-pro-config-v2` | Empresa/assinatura UI | Médio |
| `omni.mock.staff.role` | Papel staff mock | **Crítico** |
| `omni-agent-*`, `omni-settings` | Prefs Omni Agent | Baixo |
| `@omnigestao:pdv-*` | Layout/turno/cupom PDV | Médio |
| `@omnigestao:first-access-wizard:*` | sessionStorage wizard | Baixo |
| Importador D360 keys | Analytics import legado | Médio |

---

# Rotas duplicadas (LEGADO vs oficial)

| Domínio | Oficial | Legado / paralelo |
|---------|---------|-------------------|
| Operações | `/dashboard/operacoes-v2` | `/dashboard/os`, `/api/ordens-servico` |
| Financeiro | `/dashboard/financeiro-v2` | `/dashboard/financeiro` stub, painéis LS |
| Cadastros | `/dashboard/cadastros-v2` | `/dashboard/cadastros`, `/dashboard/produtos` |
| Config | `/dashboard/configuracoes` V3 | `/dashboard/configuracoes-v2` |
| Assinatura | `/dashboard/billing` | `/meu-plano` |
| PDV | `/dashboard/vendas`, `/pdv-next` | `/pdv-github-original` |
| Marketplace | `/dashboard/marketplace` | `/dashboard/marketplaces` |

---

# 1. Matriz geral do sistema

| # | Módulo | Status | Maturidade est. | Integração cruzada | Pri. gap | Risco |
|---|--------|--------|---------------|-------------------|----------|-------|
| 1 | Dashboard | REAL/PARCIAL | 70% | Alta | P2 | Baixo |
| 2 | PDV | PARCIAL | 55% | Alta | P1 | **Alto** |
| 3 | Operações/OS | REAL/PARCIAL | 75% | Muito alta | P0 | **Alto** |
| 4 | Financeiro | PARCIAL | 65% | Muito alta | P0 | **Alto** |
| 5 | Marketplace | PARCIAL | 25% | Média | P3 | Médio |
| 6 | Omni Agent | REAL/PARCIAL | 60% | Alta | P2 | Médio |
| 7 | WhatsApp | REAL/PARCIAL | 70% | Média | P1 | Médio |
| 8 | Cadastros | REAL/PARCIAL | 80% | Alta | P1 | Médio |
| 9 | Clientes | REAL | 75% | Alta | P2 | Baixo |
| 10 | Estoque | REAL | 80% | Muito alta | P2 | Médio |
| 11 | Relatórios | PARCIAL | 30% | Média | P1 | Médio |
| 12 | Configurações | PARCIAL | 65% | Alta | P2 | Médio |
| 13 | Multi-loja | REAL/PARCIAL | 70% | Crítica | P1 | **Alto** |
| 14 | Permissões | PARCIAL | 45% | Crítica | P0 | **Alto** |
| 15 | Integrações | PARCIAL | 55% | Alta | P1 | **Alto** |
| 16 | Fiscal | PARCIAL | 15% | Média | P3 | **Alto** |
| 17 | Agenda/CRM | NÃO INICIADO | 10% | Baixa | P3 | Baixo |
| 18 | Compras | PARCIAL | 35% | Média | P2 | Médio |

---

# 2. Percentual estimado de maturidade do ERP

**Estimativa global: 58%** em direção a um **ERP SaaS Premium completo** (referência GestãoClick / Bling / Omie tier médio-alto).

| Dimensão | % est. | Comentário |
|----------|--------|------------|
| Cadastros + estoque | 78% | Núcleo sólido pós estoque profissional |
| Vendas + PDV | 55% | Persistência real, caixa híbrido |
| Operações / OS | 72% | Backend forte, UI duplicada |
| Financeiro | 62% | Serviços reais, UX tripla |
| Fiscal | 12% | Quase só assistência |
| CRM / Compras | 15% | Inexistente ou fragmentado |
| Relatórios / BI | 32% | API > UI |
| Multi-loja / perm | 55% | Modelo ok, auth staff frágil |
| Automação / IA | 58% | WhatsApp + Omni parciais |
| Marketplace | 22% | Simulado |

---

# 3. Módulos mais fortes

1. **Cadastros HUB** — Server Actions Prisma, stats, importador GC real, auditoria import
2. **Estoque profissional** — `MovimentacaoEstoque`, KPIs, integração OS Fase 2
3. **Operações backend** — ciclo OS, faturamento idempotente, adapters
4. **Financeiro services** — receber/pagar/ledger/carteiras APIs maduras
5. **WhatsApp inbox** — Meta Cloud API + Prisma
6. **Clientes** — CRUD real, integração vendas/OS
7. **Dashboard elite API** — agregações reais (evolução recente)

---

# 4. Módulos mais frágeis

1. **Fiscal / NF-e** — sem emissão
2. **CRM / Agenda comercial** — não iniciado
3. **Relatórios hub** — mostly placeholders
4. **Marketplace sync** — simulado
5. **Auth staff (AccessGate)** — mock localStorage
6. **PDV Black Edition** — pagamento não persiste
7. **Master Console** — dados hardcoded
8. **Compras** — sem módulo fechado

---

# 5. Maiores gargalos arquiteturais

1. **Duplicidade de superfície** — mesma entidade (OS, financeiro, cadastros) em 2–3 UIs
2. **localStorage como fonte operacional** — caixa, financeiro legado, ops cache
3. **Dois canais backend** — Server Actions vs REST paralelo (`/api/ordens-servico` vs `operacoes.ts`)
4. **JSONB + localKey** — poderoso mas exige disciplina (idempotência, debug)
5. **Quarentena `pdv-github-original/`** — espelho enorme, risco humano
6. **HUB Lovable isolado** — seeds/mock próximos ao código real
7. **Permissões fixas** — sem ACL DB para enterprise multi-filial
8. **Fiscal ausente** — bloqueia paridade GestãoClick em varejo/assistência

---

# 6. O que falta para nível “ERP SaaS Premium”

Comparativo funcional vs GestãoClick (referência mercado BR PME):

| Capacidade | OmniGestão hoje | Gap |
|------------|-----------------|-----|
| Financeiro integrado | Parcial real | Renegociação, conciliação OFX, DRE UI |
| Fechamento caixa | Híbrido | Server authoritative + sangria |
| Auditoria completa | Parcial | Trilha unificada cross-módulo |
| Comissão vendedor | ❌ | Regras + relatório |
| Multiempresa / multi-loja | Parcial | Consolidado + RBAC |
| Relatórios gerenciais | API only | Hub + export |
| OS integrada | ✅ backend | Unificar UI |
| Compras / PC | ❌ | Módulo completo |
| CRM | ❌ | Funil, campanhas |
| Agenda | Marketing only | Agenda serviços |
| Fiscal NF-e | ❌ | Emissão + SPED |
| Permissões avançadas | Matriz fixa | ACL persistida |
| Dashboard executivo | Parcial | Multi-loja consolidado |
| Automações | Parcial | Event bus maduro |
| E-commerce/marketplace | Mock sync | APIs reais ML/Shopee |

---

# 7. Roadmap recomendado

### Fase A — Consolidação P0 (4–8 semanas)

1. Definir rotas oficiais únicas (OS, financeiro, cadastros, billing) + redirects
2. Remover AccessGate mock / exigir NextAuth-only em produção
3. Caixa: migrar estado operacional para `SessaoCaixa` server-side
4. PDV Black: plugar `venda-persist` ou despublicar rota
5. Checklist deploy Vercel (ENV, webhooks, cache)

### Fase B — Operação comercial P1 (8–12 semanas)

6. Relatórios hub: plugar DRE, fluxo, vendas, OS nas APIs existentes
7. WhatsApp: automações OS/venda/pagamento via event bus
8. Importação XML NF-e: persistir entrada estoque + CP
9. Renegociação financeira + KPIs abas
10. Multi-loja: Master Console real + consolidado dashboard

### Fase C — Diferenciação P2 (12–20 semanas)

11. Omni Agent: créditos Stripe sync, menos LS
12. Compras: pedido → recebimento → estoque → pagar
13. CRM leve: timeline cliente unificada
14. Comissões PDV/OS
15. Inventário mobile / transferência lojas

### Fase D — Premium P3 (20+ semanas)

16. Fiscal NF-e/NFC-e integrado
17. Marketplace OAuth real
18. BI / builder relatórios
19. SSO + 2FA enterprise

---

# 8. Ordem ideal de consolidação

```
1. Auth/perm (P0)
2. Rotas únicas OS + Financeiro (P0)
3. Caixa server-side (P1)
4. Retirar financeiro/OS localStorage (P1)
5. Relatórios UI ← APIs (P1)
6. Cadastros/XML entrada (P1)
7. WhatsApp automações negócio (P1)
8. Compras + CRM (P2)
9. Fiscal (P3)
10. Marketplace real (P3)
```

---

# 9. Lista — ainda depende de mock / localStorage

| Área | Dependência |
|------|-------------|
| Staff auth | `AccessGate` + `omni.mock.staff.role` |
| Caixa PDV operacional | `omnigestao:caixa:*`, ops LS |
| Financeiro legado painéis | `financeiro-store`, `contas-receber-storage`, `centro-financeiro` |
| Config empresa/assinatura UI | `assistec-pro-config-v2`, `/meu-plano` PIX demo |
| PDV Black pagamento | Modal fake |
| Omni Agent prefs/créditos UI | `omni-settings`, sugestões UI |
| Master Console | KPIs hardcoded |
| Marketplace sync | simulate flags |
| Relatórios hub cards | status `em_breve` |
| Portal cliente assinaturas | preços demo |
| Marketing IA (parcial) | alguns helpers mock |
| Toolbar Cadastros | Filtros/Exportar noop |

---

# 10. Lista — pronto (ou quase) para produção

| Área | Evidência |
|------|-----------|
| NextAuth login admin | `auth.ts`, seed admin |
| Cadastros CRUD Prisma | `app/actions/cadastros.ts` |
| Importador GestaoClick planilhas | `/api/import/advanced` + auditoria |
| Estoque ledger + modal | `app/actions/estoque.ts` |
| OS ciclo + estoque adapter + faturamento | `operacoes.ts`, adapters |
| Financeiro receber/pagar APIs | import real GC, HUB V2 context |
| WhatsApp inbox + webhook Meta | Prisma + Cloud API |
| Clientes API + página | `/api/clientes` |
| Dashboard elite KPIs | `/api/dashboard/elite` |
| Billing Stripe | checkout + portal + webhooks |
| Multi-loja stores API | `/api/stores` |
| Omni Agent comandos/automações DB | Prisma + actions |
| Onboarding loja | wizard + stores API |

**Ressalva produção:** exige ENV completas, migrations alinhadas, remoção staff mock, e testes e2e smoke por loja.

---

## Comparação preparatória — GestãoClick (notas)

| Domínio GestãoClick | OmniGestão relativo |
|---------------------|---------------------|
| Cadastros completos | **Paridade ~80%** |
| Estoque + inventário | **~75%** (falta lote/PC) |
| Vendas + PDV | **~55%** (fiscal cupom, TEF) |
| Financeiro | **~60%** (conciliação, boletos) |
| NF-e | **~10%** |
| OS assistência | **~75%** backend, UI duplicada |
| CRM | **~5%** |
| Compras | **~30%** |
| Relatórios | **~35%** |
| Multi-loja | **~65%** |
| Integrações marketplace | **~20%** |

---

## Referências

- `docs/ai/CURRENT_STATUS.md` (estado vivo — preferir sobre docs Maio desatualizados)
- `docs/modules/reports/AUDITORIA_GERAL_OMNIGESTAO_PRO.md` (parcialmente desatualizado pós 20–21/05)
- `docs/ai/ENTERPRISE_MODULE_MAP.md`
- `docs/architecture/BACKEND.md`
- `CLAUDE.md` — governança e ENV
- `prisma/schema.prisma` — 60+ modelos

---

## Notas finais da auditoria

- **Nenhum arquivo de código foi alterado** — apenas este documento foi criado.
- Contagens de banco em tabelas antigas (ex.: `ContaReceberTitulo: 0`) podem estar **desatualizadas** pós-import GestaoClick (307+ títulos reportados em 20/05) — revalidar por ambiente antes de decisões comerciais.
- Próximo passo sugerido: gerar **matriz GestãoClick feature-by-feature** usando este documento como baseline OmniGestão.

---

*Documento gerado por auditoria read-only — OmniGestão Pro — 21/05/2026*
