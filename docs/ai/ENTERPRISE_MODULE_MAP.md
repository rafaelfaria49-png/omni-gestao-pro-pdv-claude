# Relatório técnico — OmniGestão Pro (contexto para IA enterprise)

## Escopo e método

- **Objetivo:** mapa mental para **Claude Projects** / instruções persistentes: módulos, fluxos, dependências, riscos e ficheiros âncora.  
- **Método:** leitura de `app/dashboard/*`, `app/actions/*`, `app/api/*`, `components/*`, `lib/*`, `prisma/schema.prisma`, alinhamento com `docs/modules/reports/AUDITORIA_GERAL_OMNIGESTAO_PRO.md` e `docs/ai/CURRENT_STATUS.md`.  
- **Limite:** não executa runtime; estados “real/mock/híbrido” reflectem **arquitectura e caminhos de código** observáveis.

---

## 1. Estrutura real dos módulos (visão transversal)

| Módulo | Superfície principal no dashboard | Natureza |
|--------|-------------------------------------|----------|
| **PDV** | `/dashboard/vendas` (alias `/dashboard/pdv`) | App Next + Zustand + APIs `ops` |
| **Financeiro** | `/dashboard/financeiro-v2` (HUB Lovable) + `/dashboard/financeiro/*` + painéis `components/dashboard/financeiro/*` | Dupla superfície: HUB vs legado/APIs |
| **Operações** | `/dashboard/operacoes-v2` (HUB) + `/dashboard/os` (legado) | HUB isolado + OS legado |
| **Marketplace** | `/dashboard/marketplace` (+ `/dashboard/marketplaces`) | Lovable + APIs `/api/marketplace/*` + Prisma |
| **WhatsApp HUB** | `/dashboard/whatsapp` | `WhatsAppInbox` + APIs + Prisma + Meta |
| **Omni Agent HUB** | `/dashboard/omni-agent` | UI + `app/actions/omni-agent.ts` + Prisma |
| **Cadastros HUB** | `/dashboard/cadastros-v2` | Lovable isolado + `app/actions/cadastros.ts` |
| **Configurações V3** | `/dashboard/configuracoes` → `ConfiguracoesV3Page` | UI V3 + `ThemeContext` local + secções por domínio |
| **Auth “enterprise”** | NextAuth (`/login`, `app/api/auth/[...nextauth]`) + gate `AccessGate` | **Duas camadas:** JWT NextAuth + staff mock/PIN legado |

**Providers globais do dashboard operacional** (`components/dashboard/app-ops-providers.tsx`):  
`ConfigEmpresaProvider` → `LojaAtivaProvider` → `PerfilLojaProvider` → `StoreSettingsProvider` → `FinanceiroProvider` → `OperationsProvider` (chave por loja) → `CaixaProvider`.

**Layout dashboard** (`app/dashboard/layout.tsx`): com sessão NextAuth → `AppShell` directo; **sem** sessão → `AccessGate` envolve o mesmo shell.

---

## 2. Por módulo (ficha técnica para IA)

### 2.1 PDV

| Dimensão | Detalhe |
|----------|---------|
| **Status** | **Híbrido** — UX e estado principal em **Zustand** (`lib/operations-store.tsx`); persistência de venda via **`POST /api/ops/venda-persist`**; caixa/sessão com **localStorage** por loja; inventário/OS no store com hidratação persistida (chave `opsKeyForLoja` / legado `assistec-pro-ops-v1`). |
| **Rotas** | `/dashboard/vendas`, `/dashboard/pdv` (redirect), query `?modo=rapido`. |
| **Componentes-chave** | `components/dashboard/vendas/vendas-pdv.tsx`, `pdv-classic.tsx`, `pdv-supermercado.tsx`, `pdv-assistencia-enterprise.tsx`, `pdv-omni-classic-shell.tsx`, `caixa/caixa-status-bar.tsx`. |
| **Contexts / providers** | `OperationsProvider` + `CaixaProvider` + `StoreSettingsProvider` + `LojaAtivaProvider` (via `AppOpsProviders`). |
| **Services / libs** | `lib/pdv-product-search.ts`, `lib/pdv-catalog.ts`, `lib/pdv-scan-product.ts`, `lib/omnigestao-pdv-modo.ts`, `lib/pdv-classic-layout.ts`, `lib/pdv-operator-id.ts`. |
| **Server actions** | Não é o eixo principal do PDV; vendas enterprise: `app/actions/vendas-enterprise.ts` (`enrichVendaEnterprise`). Operações ligadas a OS: `app/actions/operacoes.ts`. |
| **Endpoints** | `POST /api/ops/venda-persist`; caixa: `/api/ops/caixa/*` (abrir, fechar, sessões, operação); devoluções: `/api/ops/devolucao`, `/api/ops/devolucoes`. |
| **Fluxo de dados** | Utilizador → componentes PDV → `finalizeSaleTransaction` (validação local, stock, pagamentos, `emitEvent`) → `fetch` assíncrono para **persistir venda** no servidor; evento `venda_finalizada` no `lib/events/event-bus.ts`. |
| **Integrações** | **Financeiro:** parcelas / contas a receber via regras do pagamento (ex. “a prazo” exige CPF) + API persist; **Estoque:** decremento local + servidor em fluxos paralelos conforme feature; **Automação:** `emitEvent` para handlers registados. |
| **Dependências** | `LojaAtiva` (`x-assistec-loja-id` / cookie loja), `StoreSettings` (layout PDV), `ConfigEmpresa` / perfil loja. |
| **Pontos críticos** | **Caixa multi-terminal** só localStorage — risco operacional; dupla verdade inventário local vs Prisma se não sincronizado; `finalizeSaleTransaction` falha silenciosamente no `fetch().catch(() => {})` após sucesso local. |
| **TODOs / evolução** | Sync server-first do caixa; NFC-e; relatórios de turno; eliminar divergência stock. |
| **Riscos** | P1: consistência caixa; P1: expectativa “tudo gravado” se API falhar após UI ok. |

**Prisma relacionado:** `Venda`, `ItemVenda`, `DevolucaoVenda`, `ItemDevolucaoVenda`, `SessaoCaixa`, `CaixaOperacao`, `Produto`, `Store`, `Cliente` (indirecto).

---

### 2.2 Financeiro

| Dimensão | Detalhe |
|----------|---------|
| **Status** | **Híbrido** — núcleo **real** em `lib/financeiro/services/*`, rotas `/api/ops/*` e `/api/financeiro/*`; **HUB V2** Lovable **plugado a dados reais** (FinanceiroRealContext.tsx, header de loja) na UI principal (`components/financeiro/lovable/`); existe **`FinanceiroRealContext.tsx`** para caminhos “reais” com header de loja. |
| **Rotas** | `/dashboard/financeiro-v2`; legado `/dashboard/financeiro`, `/dashboard/financeiro/contas-a-receber`, `/dashboard/financeiro/contas-a-pagar`; redirect/stubs conforme rota. |
| **Componentes-chave** | `FinanceiroHubIsolated.tsx`, `routes/financeiro.tsx` (massivo), painéis `components/dashboard/financeiro/contas-receber.tsx`, `contas-pagar.tsx`. |
| **Contexts** | `FinanceiroProvider` (`lib/financeiro-store.tsx` — localStorage `centro-financeiro` v3 por loja); contexto Lovable `FinanceiroRealContext` onde usado. |
| **Services** | `lib/financeiro/services/contas-receber-service.ts`, `contas-pagar-service.ts`, movimentos/saldo/ledger lógico; `lib/financeiro/contracts/*`, `lib/financeiro/adapters/*` (ex. OS → receber). |
| **Server actions** | Não há ficheiro `app/actions/financeiro.ts` dedicado na listagem rápida; fluxo forte é **API + serviços** chamados pelas rotas. |
| **Endpoints (amostra)** | `GET/POST` `/api/ops/contas-receber-list`, `contas-receber-persist`; idem pagar; `/api/financeiro/contas-receber/*` (liquidar, parcial, estornos); `/api/financeiro/contas-pagar/*`; relatórios, DRE, fluxo, carteiras, fechamentos, conciliação. |
| **Fluxo** | UI legado/HUB → `fetch` com `x-assistec-loja-id` → route handler → service Prisma → `payload` + histórico; HUB V2 pode ainda não consumir todos estes endpoints na mesma árvore. |
| **Integrações** | **Operações** (faturamento OS), **PDV** (persistência vendas / recebíveis), **Auditoria** (`logs_auditoria` / rotas auditoria). |
| **Dependências** | `storeId`; contratos `localKey`; não quebrar prefixos de adapter OS. |
| **Pontos críticos** | **P0:** utilizador alterna entre HUB mock e painéis reais; duplicidade localStorage vs servidor em partes do legado. |
| **TODOs** | Uma entrada de menu “Financeiro” com fonte única; plugar HUB V2 aos serviços; reduzir LS no pagar. |
| **Riscos** | Idempotência e `localKey`; relatórios até modelo ledger definitivo. |

**Prisma:** `ContaReceberTitulo`, `ContaPagarTitulo`, `MovimentacaoFinanceira`, `CarteiraFinanceira`, `FechamentoFinanceiro`, `ConciliacaoFinanceira`, `AuditoriaFinanceira`, `FinancialAccount`, `FinancialCategory`, `FinancialTransaction`, `LedgerSnapshot`, etc.

---

### 2.3 Operações (OS / HUB)

| Dimensão | Detalhe |
|----------|---------|
| **Status** | **Híbrido** — UI Lovable + **`OSProvider`** (`store/osStore.tsx`): `refresh()` combina **`@/api/os`** (camada que chama **Server Actions** `app/actions/operacoes.ts` e `ordens.ts`) com **`listProdutos` / `listEquipamentosModelos`** reais de cadastros; ainda há **APIs tipo** `@/api/clientes`, `estoque`, `vendas` no bundle Lovable (mistura mock/real por ficheiro). Comentário no `OperacoesHubIsolated`: *“Prisma leitura + mocks auxiliares”*. |
| **Rotas HUB** | `/dashboard/operacoes-v2` → `MemoryRouter`: `/operacoes`, `/operacoes/os`, `/operacoes/os/:id`, etc. |
| **Componentes** | `OperacoesHubIsolated.tsx`, `OperacoesLayout.tsx`, `ThemeSwitcher.tsx`, páginas em `components/operacoes/lovable/pages/*`. |
| **Contexts** | `OSProvider` / `OSContext`. |
| **Server actions** | `listOS`, `createOS`, `updateOSStatus`, `updateOSPayload`, `applyOperacaoHubAcao`, `validateOrcamentoEstoqueAction`, `gerarCobrancaOSAction`, `syncOperacaoItensComOrcamento`, acções de garantia/checklist/retirada, etc. (`app/actions/operacoes.ts`). |
| **Endpoints REST paralelos** | `/api/ops/ordens`, `/api/ordens-servico/*` (legado) — **duplicidade de canais** (P0). |
| **Fluxo** | UI → `components/operacoes/lovable/api/os.ts` → actions Prisma → payload/timeline → adapters (receber, estoque entrega) conforme documentação em `docs/modules/reports/*`. |
| **Integrações** | **Financeiro** (título receber), **Estoque** (consumo na entrega), **Cadastros** (produtos/modelos), **Automações** (eventos OS). |
| **Pontos críticos** | **P0:** duas experiências OS (HUB vs `/dashboard/os`); risco de divergência de regras. |
| **TODOs** | Narrativa única; reduzir dependência de APIs mock internas onde já há action real. |

**Prisma:** `OrdemServico`, `OrdemServicoItem`, `GarantiaOrdemServico`, `Cliente`, `Produto`, `LogsAuditoria`, …

---

### 2.4 Marketplace

| Dimensão | Detalhe |
|----------|---------|
| **Status** | **Híbrido / tendência real** — não é apenas placeholder: existem **`/api/marketplace/*`** (produtos, links, sync-logs, connections, anúncios) e modelos Prisma; UI Lovable (`MarketplaceLayout` + `ThemeProvider`) e componentes “real” (`MarketplaceCatalogReal.tsx`, `use-marketplace-connections.ts`) com **`useSession` + header loja**. |
| **Rotas** | `/dashboard/marketplace`, `/dashboard/marketplaces`. |
| **Contexts** | Theme local Lovable; dados via hooks + `next-auth/react`. |
| **Server actions** | Cadastros expõe `countMarketplaceListings`; não há `app/actions/marketplace.ts` na grep inicial — persistência via **API routes**. |
| **Endpoints** | `/api/marketplace/connections`, `produtos`, `sync-logs`, `anuncios`, `links`, etc. |
| **Fluxo** | UI → `fetch` + `x-assistec-loja-id` → API → Prisma (`MarketplaceConnection`, `MarketplaceListing`, …). |
| **Dependências** | **Store**, **Produto** (export), **Cadastros**; credenciais por conexão. |
| **Pontos críticos** | Integração externa (ML/Shopee) = variável por conexão; testes de carga e secrets. |
| **TODOs** | Documentação de módulo; matriz “por canal” para IA. |

**Prisma:** `MarketplaceConnection`, `MarketplaceSyncLog`, `MarketplaceProductLink`, `MarketplaceListing`.

---

### 2.5 WhatsApp HUB

| Dimensão | Detalhe |
|----------|---------|
| **Status** | **Híbrido** — `WhatsAppInbox.tsx` (não só Lovable) carrega conversas/mensagens via **`fetch`** às rotas `/api/whatsapp/*` (Prisma); envio **Meta Cloud API** (`/api/whatsapp/send`, `lib/whatsapp.ts`); webhook `app/api/webhooks/whatsapp`; **automações de evento** ainda com simulação em parte do stack (`/api/automation/handle-event`). |
| **Rotas** | `/dashboard/whatsapp`; `/dashboard/whatsapp-automation`; ligações a Omni Agent. |
| **Server actions** | `app/actions/whatsapp.ts` — `sendWhatsAppTextAction`, template, media (sessão NextAuth). |
| **Endpoints** | `GET/POST` `/api/whatsapp/conversations`, `messages`, `contacts`, `quick-replies`, `etiquetas`, …; `POST /api/webhooks/whatsapp`. |
| **Fluxo** | Inbox → API Prisma → render; send → action ou API → Meta → gravação outbound. |
| **Integrações** | **Prisma** (conversas, mensagens, automações, quick replies, etiquetas, `WhatsAppAiSetting`); **Meta**; **Omni Agent** (status Cloud). |
| **Dependências** | `storeId`; ENVs Meta (`CLAUDE.md`). |
| **Pontos críticos** | Webhook + secrets; custo API; métricas ainda parcialmente ilustrativas no HUB. |
| **TODOs** | Automações de sistema persistentes; observabilidade. |

**Prisma:** `WhatsAppContact`, `WhatsAppConversation`, `WhatsAppMessage`, `WhatsAppAutomation`, `WhatsAppQuickReply`, `WhatsAppEtiqueta`, `WhatsAppConversacaoEtiqueta`, `WhatsAppAiSetting`, `WhatsAppAutomationLog`, `WhatsAppPendingAction`.

---

### 2.6 Omni Agent HUB

| Dimensão | Detalhe |
|----------|---------|
| **Status** | **Híbrido** — **real:** `OmniAgentCommand` Prisma, `app/actions/omni-agent.ts` (submit, list, confirm, reject, stats, reports snapshot, WhatsApp status); **mock/demo:** várias abas ainda com copy de demonstração (ver `docs/ai/AGENT_HUB.md`). |
| **Rotas** | `/dashboard/omni-agent`; `/dashboard/ia-mestre` (ecossistema IA marketing/imagens — relacionado mas não idêntico). |
| **Componentes** | `components/omni-agent/*` (`OmniAgentHub.tsx`, `OmniAgentInboxReal.tsx`, …). |
| **Contexts** | Estado React local + gating enterprise (`requireEnterpriseWith` citado na doc). |
| **Services** | `lib/omni-agent/interpret.ts`, `executor.ts`, `types.ts`. |
| **Server actions** | `listOmniAgentCommands`, `submitOmniAgentCommand`, `confirmOmniAgentCommand`, `rejectOmniAgentCommand`, `getOmniAgentHubStats`, `getOmniAgentReportsSnapshot`, `getOmniAgentWhatsAppCloudStatus`. |
| **Endpoints** | Principalmente actions; leituras agregadas podem usar APIs internas conforme executor. |
| **Fluxo** | Comando → interpretação → registo → confirmação para escritas → executor (Prisma, OS, clientes, caixa, resumo financeiro). |
| **Integrações** | **Operações**, **Cadastros**, **Financeiro** (leituras), **WhatsApp** (status), **Auditoria**. |
| **Pontos críticos** | Permissões por intenção; não prometer “LLM autónomo” além do desenhado. |
| **TODOs** | LLM com tools limitadas; event bus persistente. |

**Prisma:** `OmniAgentCommand`.

---

### 2.7 Cadastros HUB

| Dimensão | Detalhe |
|----------|---------|
| **Status** | **Híbrido / maioritariamente real** — `CadastrosHubIsolated` + actions **`app/actions/cadastros.ts`** (dezenas de funções: stats, CRUD clientes/produtos/serviços/fornecedores/categorias/marcas/técnicos/equipamentos, auditoria). |
| **Rotas** | `/dashboard/cadastros-v2`, alias `/dashboard/cadastros`. |
| **Contexts** | Providers dentro do HUB Lovable + dados via actions (RSC boundary no client via dynamic import). |
| **Server actions** | Ver grep: `getCadastrosDashboardStats`, `listClientes`, `createCliente`, `upsertProduto`, … |
| **Endpoints** | Muitas features vão directo a actions; APIs `/api/clientes`, `/api/produtos` coexistem para outros módulos. |
| **Fluxo** | HUB → `storeId` → action → Prisma → DTOs para UI. |
| **Dependências** | **Operações** (produtos, clientes, modelos), **PDV**, **WhatsApp** (cliente), **Marketplace** (listings). |
| **Pontos críticos** | Cobertura total de ecrãs Lovable vs entidades; erros `withPrismaSafe` em produção. |
| **TODOs** | Fechar gaps por entidade; IA assistiva com custo controlado. |

**Prisma:** `Cliente`, `Produto`, `Servico`, `Tecnico`, `EquipamentoModelo`, `Fornecedor`, `CategoriaProduto`, `CategoriaCadastro`, `MarcaCadastro`, `ProductMedia`, `LogsAuditoria`, …

---

### 2.8 Configurações V3

| Dimensão | Detalhe |
|----------|---------|
| **Status** | **Híbrido** — UI **enterprise** modular (`ConfiguracoesV3Page` + secções: Geral, Lojas, Aparência, PDV, Vendas, Financeiro, IA, Integrações, Importação, **Usuários** com `useSession`, Segurança); **`ThemeContext` próprio** em `components/configuracoes-v3/contexts/ThemeContext.tsx` (doc no CSS: não misturar `data-studio-theme` global com tema só V3 em alguns casos). |
| **Rotas** | `/dashboard/configuracoes`; `/dashboard/configuracoes-v2` **redirecciona** para configuracoes. |
| **Componentes** | `features/settings/sections/*`, `PdvSection.tsx` (usa `ASSISTEC_LOJA_HEADER`), etc. |
| **Integrações** | APIs `stores`, `settings`, import, admin users, PDV params. |
| **Pontos críticos** | Múltiplos sistemas de tema (global `StudioThemeProvider` vs V3); risco de inconsistência visual. |
| **TODOs** | Unificar documentação de tema; uma única narrativa “config”. |

**Prisma:** `Store`, `StoreSettings`, `AppLojaSettings`, `AdminUser` / `AdminUserStore` (secção usuários).

---

### 2.9 Auth “enterprise” (NextAuth + legado staff)

| Dimensão | Detalhe |
|----------|---------|
| **Status** | **Híbrido** — **NextAuth v5** real (`auth.ts`, `auth.config.ts`, `app/api/auth/[...nextauth]/route.ts`, `proxy.ts`); modelo **`AdminUser`**; **legado:** `AccessGate` com role em **`localStorage`** `omni.mock.staff.role` e cookies **`assistec_staff_session`**, **`assistec_staff_role`** (`lib/staff-session.ts`); cookie **`assistec_admin_session`** ainda usado em rotas API legacy (`lib/require-admin.ts`, `proxy.ts`). |
| **Fluxo** | `proxy.ts` protege `/dashboard`; dentro do layout, **`useSession()`** decide se mostra `AccessGate` ou não. |
| **Pontos críticos** | **P0 auditoria:** staff mock inadequado para cliente pagante; dois modelos mentais (JWT vs PIN). |
| **TODOs** | RBAC server-first; desactivar mock em produção ou restringir a dev. |

**Prisma:** `AdminUser`, `AdminUserStore`.

---

## 3. Mapa transversal (padrões, dados, eventos)

### 3.1 Padrões Lovable

- Wrapper **`*Isolated.tsx`**, **`MemoryRouter`**, providers locais, **sem** importar CSS global do sub-app no root.  
- Pastas em `components/<domínio>/lovable/`; **tsconfig** pode excluir sub-árvores Lovable da compilação estrita.  
- Tema: sincronizar com **`data-studio-theme`** / classes no `html` (`applyGlobalTheme` nos hubs que o implementam).

### 3.2 Padrões “enterprise” (app principal)

- **Server Actions** em `app/actions/` para domínios cadastro/operações/omni-agent/whatsapp/auth.  
- **Serviços puros** em `lib/*/services/` consumidos por actions e `app/api/*`.  
- **Multi-loja:** header **`x-assistec-loja-id`** (`lib/assistec-headers.ts`); cookie **`assistec-active-store`** (`lib/store-defaults.ts`); **sem fallback `loja-1` server-side** (leitura → header→query→cookie→`null`→`400`; escrita → header→query→`null`→`400`, anti-CSRF; `storeIdFromAssistecRequestForRead/ForWrite` em `lib/store-id-from-request.ts` · S-001/S-002 + DT-14). `LEGACY_PRIMARY_STORE_ID="loja-1"` permanece só como **default client-side** (DT-13) e constante canônica em `lib/store-defaults.ts`.

### 3.3 Tokens e temas

- Variáveis em **`app/globals.css`**: `:root` (light), `.soft-ice`, `.midnight`, `.black-edition`.  
- **`StudioThemeProvider`** (`components/theme/ThemeProvider.tsx`): `localStorage` **`omni-studio-dual-theme`**, classes no `<html>`, `data-studio-theme`.  
- Regra para IA: **preferir** `bg-background`, `text-foreground`, `border-border`, etc.; excepções documentadas (ex.: POS Black em `pdv-omni-classic-shell.tsx`).

### 3.4 `localStorage` (amostra relevante para IA)

| Chave / padrão | Uso |
|----------------|-----|
| `omni-studio-dual-theme` | Tema global |
| `assistec-pro-loja-ativa-v1` | Loja activa (UI) |
| `assistec-pro-ops-v1-<lojaId>` | Estado operações/PDV por loja |
| `assistec-pro-ops-v1` | Legado |
| `assistec-pro-config-v2` | Config empresa |
| `centro-financeiro-v3::<storeId>` | Rascunhos / estado financeiro local |
| `omni-pdv-classic-layout` | Layout classic lovable vs services |
| `@omnigestao:pdv-layout` | classic vs supermercado |
| `omnigestao-pdv-modo` | normal vs rápido |
| `assistec-pdv-operator-id-v1` | Operador PDV |
| `assistec-audit-v1` | Auditoria local legada |
| `omni.mock.staff.role` | Mock staff (**risco**) |

### 3.5 Cookies

| Cookie | Papel |
|--------|--------|
| `assistec-active-store` | Espelho loja para APIs sem header |
| `assistec_staff_session`, `assistec_staff_role` | Staff legado |
| `assistec_admin_session` | Sessão admin legacy em APIs |
| Cookies **NextAuth** | Sessão JWT (nomes geridos pela lib) |

### 3.6 Modelos Prisma por área (resumo)

- **Core:** `Store`, `StoreSettings`, `AppLojaSettings`, `User`, `Usage`, `CreditPurchase`  
- **Cadastro/OS:** `Cliente`, `OrdemServico`, `OrdemServicoItem`, `Produto`, `Servico`, `Tecnico`, …  
- **Financeiro:** `ContaReceberTitulo`, `ContaPagarTitulo`, `MovimentacaoFinanceira`, `CarteiraFinanceira`, `FechamentoFinanceiro`, …  
- **Vendas/PDV:** `Venda`, `ItemVenda`, `DevolucaoVenda`, `SessaoCaixa`, `CaixaOperacao`  
- **WhatsApp:** família `WhatsApp*`  
- **Marketplace:** `Marketplace*` + `MarketplaceListing`  
- **IA:** `IaConversation`, `IaMessage`, `MarketingPost`, `MarketingIaPost`, `OmniAgentCommand`  
- **Auth admin:** `AdminUser`, `AdminUserStore`

### 3.7 Fluxo `storeId`

1. Utilizador escolhe loja → `LojaAtivaProvider` persiste `assistec-pro-loja-ativa-v1` + cookie.  
2. Cliente envia **`x-assistec-loja-id`** em `fetch` para APIs.  
3. Servidor resolve com `storeIdFromAssistecRequestForRead/Write`.  
4. Prisma: **todas** as queries devem filtrar `storeId`.

### 3.8 Fluxo auth

1. **Edge/middleware (`proxy.ts`):** exige autenticação para `/dashboard` (e cookie admin legado citado no ficheiro).  
2. **Sessão NextAuth:** `useSession` no layout → oculta `AccessGate`.  
3. **Sem sessão:** `AccessGate` + role mock + cookies staff.  
4. **APIs admin:** `require-admin` / `api-auth` com `assistec_admin_session`.

### 3.9 Automações / eventos

- **`lib/events/event-bus.ts`:** `SystemEvent` inclui `venda_finalizada`, `os_criada`, `os_status_alterado`, `os_finalizada`, `cliente_criado`, …  
- **`emitEvent`** chamado a partir de `operations-store` (pós-venda).  
- **`app/api/automation/handle-event/route.ts`:** processamento (simulação / motor — ver docs).  
- **WhatsApp:** automações Prisma + fluxo Cloud separado.

---

## 4. Identificação solicitada

| Critério | Módulos / notas |
|----------|-----------------|
| **Já “enterprise” (UI + contratos + servidor)** | Configurações V3 (superfície), núcleo **financeiro server-side**, **Cadastros** (actions), **WhatsApp** (API+Prisma+Meta), **Operações** (actions Prisma no pipeline OS), **Omni Agent** (comandos + inbox real). |
| **Ainda com mocks ou demo** | Painel `/dashboard` (KPIs), **Financeiro HUB V2** dados principais, partes **Omni Agent** / **Marketing IA**, **Master Console**, **AccessGate** staff. |
| **Persistência Prisma real** | Cadastros, OS (actions), financeiro (títulos/movimentos), vendas (`Venda`), WhatsApp, Marketplace connections/listings, OmniAgentCommand, Store/Settings, AdminUser. |
| **Local state / localStorage** | **PDV** (`operations-store`, caixa), **Financeiro** (centro-financeiro v3), **Config empresa**, **mock staff**, parte de **legacy financeiro** até server-first completo. |
| **Integração financeira** | Operações (adapter receber), PDV (`venda-persist`, contas a receber / parcelas), Omni Agent (`FINANCE_SUMMARY`), relatórios APIs. |
| **Integração PDV** | `finalizeSaleTransaction` + `/api/ops/venda-persist`; ligação a estoque/OS em cenários específicos; event bus. |
| **Integração WhatsApp** | HUB inbox, actions de envio, webhooks, cadastro de conversas, Omni Agent status. |

---

## 5. Recomendações finais (para Claude Projects)

### 5.1 Documentação que mais retorno dá à IA

1. **`docs/ai/MASTER_CONTEXT.md`** (se mantido actualizado) — mapa único.  
2. **`docs/ai/CURRENT_STATUS.md`** — estado temporal fino.  
3. **`docs/modules/reports/AUDITORIA_GERAL_OMNIGESTAO_PRO.md`** — P0/P1 e riscos.  
4. **`CLAUDE.md`** — comandos e ENV.  
5. **`docs/ai/AGENT_HUB.md`** — Omni Agent real vs mock.  
6. **`prisma/schema.prisma`** (extract ou sumário por domínio) — para não alucinar modelos.  
7. **`lib/store-id-from-request.ts`** + **`lib/assistec-headers.ts`** — contrato multi-loja.

### 5.2 Ficheiros que valem contexto permanente (curtos e estáveis)

- `lib/store-defaults.ts`, `lib/store-id-from-request.ts`  
- `components/dashboard/app-ops-providers.tsx`  
- `app/dashboard/layout.tsx`  
- `auth.config.ts` / `proxy.ts` (trechos de regra, não secrets)  
- `.claude/skills/omnigestao-master/SKILL.md`

### 5.3 Skills separadas (já existentes ou a reforçar)

- **`omnigestao-financeiro`** — contratos, `localKey`, APIs.  
- **`omnigestao-auditoria`** — compliance e relatórios.  
- **`omnigestao-master`** — regras globais.  
- **Candidatas novas:** **`omnigestao-operacoes-os`** (duplicidade HUB vs legado + actions), **`omnigestao-pdv-caixa`** (Zustand + venda-persist + caixa), **`omnigestao-whatsapp-meta`**.

### 5.4 Prioridades (consistência com auditoria)

| Prioridade | Itens |
|------------|--------|
| **P0** | Duplicidade **OS HUB vs legado**; **financeiro** fonte única (HUB V2 já real; consolidar com legado); **auth** staff mock em produção; **deploy/ENV/storeId** dados vazios; expectativas do **dashboard** inicial. |
| **P1** | **PDV/caixa** multi-terminal; **contas a pagar** reduzir LS; **WhatsApp** produção (secrets, filas); **Cadastros** smoke por loja; **Vendas HUB** matriz real/mock. |
| **P2** | **Master Console** Prisma; **Marketing IA** custos; **Omni Agent** LLM com limites; catalogação **OpenAPI** interna; **docs** placeholders (`THEMES.md`, etc.). |

---

**Nota de integridade:** este relatório documenta o estado analisado no repositório; para evitar deriva, convém rever após mudanças grandes em `app/actions`, `app/api` ou `prisma/schema.prisma`.
