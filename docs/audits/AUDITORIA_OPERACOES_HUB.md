# Auditoria Completa — Operações HUB

**Data:** 26/05/2026  
**Tipo:** Somente leitura — nenhum código alterado nesta sprint  
**Escopo:** `app/dashboard/operacoes*`, `components/operacoes/**`, `app/api/ordens-servico/**`, `app/actions/operacoes.ts`, `app/actions/ordens.ts`, `lib/operacoes/**`, integrações estoque ↔ OS, timeline/status, dashboard operacional, métricas, relatórios, cards, modais, impressão, busca/filtros, multi-loja  
**Referências:** [`OPERACOES_HUB_V2_CHECKIN.md`](../modules/reports/OPERACOES_HUB_V2_CHECKIN.md) · [`CURRENT_STATUS.md`](../ai/CURRENT_STATUS.md)

---

## 1. Visão geral

O **Operações HUB V2** (`/dashboard/operacoes-v2`) é o caminho oficial do produto. O núcleo operacional da OS — criar, editar payload, transicionar status, orçamento, cobrança, checklist técnico, retirada, garantia operacional e timeline — **persiste em PostgreSQL via Prisma** através de Server Actions (`app/actions/operacoes.ts`, `app/actions/ordens.ts`).

Porém, o HUB Lovable ainda carrega **camadas auxiliares mock**, **botões mortos**, **KPIs enganosos** e **duplicação com rotas legadas** (`/dashboard/os`, `/dashboard/orcamentos`). Há também **dois stacks de escrita** (legacy REST vs HUB V2) com **semântica de estoque divergente**.

### Veredito final

| Pergunta | Resposta |
|----------|----------|
| **Pronto operacionalmente?** | **Não** — núcleo OS sim; satélites e legado impedem confiança total |
| **Parcialmente pronto?** | **Sim** — fluxo principal OS no HUB V2 é runtime real |
| **Ainda mockado?** | **Parcialmente** — notificações, atendimento rápido, serviços (write), portal cliente, IA heurística, técnicos “online” |

**Classificação:** **Parcialmente pronto para produção operacional.** O operador pode abrir, editar, orçar, cobrar e entregar OS com persistência real; não deve confiar em notificações, atendimento rápido, portal do cliente, KPI “técnicos online” ou gravação de serviços dentro do HUB.

---

## 2. Arquitetura atual

### 2.1 Entrada Next.js

| Rota | Arquivo | Comportamento |
|------|---------|---------------|
| `/dashboard/operacoes-v2` | `app/dashboard/operacoes-v2/page.tsx` | HUB oficial — `dynamic(OperacoesHubIsolated, { ssr: false })` |
| `/dashboard/operacoes` | `app/dashboard/operacoes/page.tsx` | Redirect → `operacoes-v2` |
| `/dashboard/operacoes-v2/loading.tsx` | Skeleton | Honesto (chunk/route load) |
| `/dashboard/operacoes-v2/error.tsx` | Error boundary | Retry disponível |
| `/dashboard/os` | `app/dashboard/os/page.tsx` | **Legacy** — REST `/api/ordens-servico` |
| `/dashboard/orcamentos` | `app/dashboard/orcamentos/page.tsx` | **Legacy** — `useOperationsStore` (localStorage) |

### 2.2 Sub-app Lovable (MemoryRouter)

Wrapper: `components/operacoes/lovable/OperacoesHubIsolated.tsx`

- `MemoryRouter` isola rotas internas do App Router
- `OSProvider` (`store/osStore.tsx`) centraliza estado e chama `api/*`
- `storeId` = `lojaAtivaId ?? LEGACY_PRIMARY_STORE_ID` (`loja-1`)
- Remount do provider ao trocar unidade (`key={storeId}`)

**Rotas internas:**

| Path | Página | Arquivo |
|------|--------|---------|
| `/operacoes` | Hub landing | `pages/OperacoesHub.tsx` |
| `/operacoes/dashboard` | Dashboard operacional | `pages/DashboardOperacional.tsx` |
| `/operacoes/os` | Kanban | `pages/OrdensServico.tsx` |
| `/operacoes/os/:id` | Detalhe OS | `pages/OSDetalhe.tsx` |
| `/operacoes/tecnicos` | Técnicos | `pages/Tecnicos.tsx` |
| `/operacoes/historico` | Histórico clientes | `pages/HistoricoClientes.tsx` |
| `/operacoes/garantias` | Garantias | `pages/Garantias.tsx` |
| `/operacoes/servicos` | Catálogo serviços | `pages/Servicos.tsx` |
| `/operacoes/notificacoes` | Notificações | `pages/Notificacoes.tsx` |

`pages/Index.tsx` existe mas **não está wired** no router.

### 2.3 Dois stacks de backend

```
┌─────────────────────────────────────────────────────────────────┐
│                    Operações HUB V2 (oficial)                      │
│  UI → osStore → api/os.ts → Server Actions → Prisma             │
│  Estoque: consume on delivery (lib/operacoes/adapters/os-estoque) │
│  Payload JSONB = source of truth (status, timeline, orçamento)   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Legacy REST (/api/ordens-servico)               │
│  /dashboard/os → fetch REST → Prisma                              │
│  Estoque: debit on POST/PATCH (lib/os-itens-stock.ts)             │
│  Sem auth guard enterprise                                        │
└─────────────────────────────────────────────────────────────────┘
```

### 2.4 Modelo de dados OS

```
ordens_servico (Prisma)
├── status (enum colapsado: Aberto | EmAnalise | Pronto | Entregue)
├── payload (JSONB) ← source of truth HUB
│   ├── status / operacaoStatus (9 estados granulares)
│   ├── timeline[] (append-only)
│   ├── orcamento, faturamento, garantia, checklist, anexos[]
│   └── estoqueConsumido*, flags operacionais
├── valorTotal, clienteId, equipamento, defeito
└── ordemServicoItem[] (espelho draft do orçamento)
```

Serviços em `lib/operacoes/services/`:
- `hydration-service.ts` — Prisma → shape HUB
- `status-service.ts` — HUB status → enum Prisma
- `timeline-service.ts` — append em payload
- `operacao-hub-flow.ts` — guards de transição
- `orcamento-policy-service.ts` — política de revisão pós-aprovação
- `financeiro-sync-service.ts` — Conta a Receber via `os-faturamento`
- `os-prisma-itens-sync.ts` — itens draft
- `garantia-operacional-service.ts` — `garantiaOrdemServico`
- `adapters/os-estoque.ts` — consume/restore/delta estoque

---

## 3. Runtime real vs mock

### 3.1 Matriz por camada

| Camada | Runtime | Detalhe |
|--------|---------|---------|
| **Server Actions** (`operacoes.ts`, `ordens.ts`) | ✅ **100% real** | Prisma read/write; zero mocks |
| **`lib/operacoes/**`** | ✅ **100% real** | Services/adapters de produção |
| **`api/os.ts`** | ⚠️ **Misto** | Delega a Server Actions; `CURRENT_STORE_ID = "loja-1"` até `listOrdens`; `online: true` hardcoded |
| **`api/clientes.ts`, `lojas.ts`, `vendas.ts`** | ✅ **Real** | Cadastros + vendas hub |
| **`api/estoque.ts`** | ⚠️ **Misto** | Catálogo real (`listProdutos`); `reservarPeca`/`baixarPeca` retornam objetos sintéticos |
| **`api/servicos.ts`** | ⚠️ **Read real / write fake** | `upsertServico` é noop |
| **`api/atendimentos.ts`** | ❌ **Mock** | Array in-memory `cache[]` — perdido no refresh |
| **`api/_db.ts` + `data/*Seed.ts`** | ❌ **Morto** | Nenhum importador ativo no tree principal |
| **localStorage** | ⚠️ **Tema only** | `OperacoesLayout.tsx` — `omni-studio-dual-theme` |
| **IndexedDB** | ⚠️ **Anexos blobs** | Metadata Prisma; arquivo binário só no browser |
| **Legacy `/dashboard/orcamentos`** | ❌ **localStorage** | `lib/operations-store` |

### 3.2 KPIs e cards — real vs enganoso

| KPI / Card | Tela | Fonte | Veredito |
|------------|------|-------|----------|
| OS abertas, atrasadas, aguardando, prontas | Hub + Dashboard | `ordens` Prisma | ✅ Real |
| SLA, ticket médio, tempo médio, taxa aprovação | Dashboard operacional | Agregação client-side sobre `ordens` | ✅ Real (dados reais) |
| Garantias ativas / retrabalho | Hub, Garantias | `payload.garantia` | ✅ Real |
| Técnicos online `X/Y` | Hub, Técnicos | `online: true` fixo em `api/os.ts:257` | ❌ **Enganoso** |
| Atendimento rápido (count) | Hub | `atendimentos.length` in-memory | ❌ **Session-only** |
| Serviços ativos | Hub | `servicosCatalogo` Prisma read | ✅ Real |
| Clientes únicos | Hub | `Set(ordens.clienteId)` | ✅ Real |
| Notificações (switches) | Notificações | `useState` local | ❌ **Mock** (disclaimer na UI) |

### 3.3 Fluxo OS completo

| Etapa | UI | Backend | Persiste? |
|-------|-----|---------|-----------|
| **Abrir OS** | `NovaOSModal` | `createOS` → Prisma | ✅ |
| **Editar checklist entrada** | `OSDetalhe` | `updateChecklist` | ✅ |
| **Status (Kanban / barra)** | `OSKanban`, `OperacaoOsAcaoBar` | `moveStatus` / `applyOperacaoHubAcao` | ✅ (erros UI frágeis — ver P1) |
| **Orçamento / peças** | `OrcamentoPanel` | `updateOSPayload` + `syncOperacaoItensComOrcamento` | ✅ |
| **Técnico** | `OSDetalhe` popover | `assignTecnico` | ✅ |
| **Checklist técnico** | `ChecklistTecnicoPanel` | `salvarChecklistTecnicoOperacaoAction` | ✅ |
| **Cobrança / pagamento** | `GerarCobrancaModal` | `gerarCobrancaOSAction` → Conta a Receber | ✅ |
| **Retirada** | `RetiradaPanel` | `confirmarRetiradaOperacaoAction` | ✅ |
| **Entrega + estoque** | `entregar_cliente` | `validateOrcamentoEstoque` + `consumeEstoqueFromOS` | ✅ |
| **Garantia** | `GarantiaOperacionalCard` | Prisma `garantiaOrdemServico` | ✅ |
| **Anexos** | `AnexosPanel` | Metadata Prisma + blob IndexedDB | ⚠️ Híbrido |
| **Timeline / histórico** | `Timeline` | `payload.timeline[]` | ✅ |
| **Impressão** | `ImpressaoModal` | `registrarDocumentoImpressoAction` + `window.print()` | ⚠️ Audit real; output client-only |
| **WhatsApp orçamento** | `OrcamentoPanel`, `OSDetalhe` | Toast “integração futura” | ❌ |
| **Portal cliente aprovar/recusar** | `PortalClienteModal` | Toast only | ❌ |

---

## 4. Top problemas

### P0 — Críticos (segurança / perda de dados / inconsistência operacional)

| # | Problema | Evidência | Risco |
|---|----------|-----------|-------|
| P0-1 | **API legacy `/api/ordens-servico` sem auth enterprise** | `app/api/ordens-servico/route.ts`, `[id]/route.ts` — sem `apiGuardOperacoesHubOrLegacy` | Mutations expostas a quem conhece URL + storeId |
| P0-2 | **`requireOperacaoAuth` bypass sem sessão NextAuth** | `app/actions/operacoes.ts:127-128` — `if (!session?.user?.id) return` | Permissões enterprise não aplicadas em fluxo PIN-only/legacy staff |
| P0-3 | **Dupla semântica de estoque** | Legacy: debit on save (`lib/os-itens-stock.ts`); HUB: debit on delivery (`lib/operacoes/adapters/os-estoque.ts`) | Mesma OS tocada por dois caminhos → estoque inconsistente |
| P0-4 | **Fallback silencioso `loja-1`** | `OperacoesHubIsolated.tsx:32`, `lib/store-defaults.ts`, `api/os.ts:45`, GET routes via `storeIdFromAssistecRequestForRead` | OS de loja errada se unidade ativa ausente |
| P0-5 | **`CURRENT_STORE_ID` default `"loja-1"` antes de `listOrdens`** | `api/os.ts:45-50`, `api/estoque.ts:8` — mutations usam module-level var | Race: mutation antes do refresh pode gravar na loja errada |

### P1 — Significativos (UX enganosa / fluxos quebrados / drift)

| # | Problema | Evidência | Risco |
|---|----------|-----------|-------|
| P1-1 | **Serviços “Salvar” sem persistência** | `api/servicos.ts:20-23` noop; `pages/Servicos.tsx:33-34` toast sucesso | Operador acredita que salvou catálogo |
| P1-2 | **Atendimento rápido in-memory** | `api/atendimentos.ts` cache module-level | Perda total no refresh; KPI hub enganoso |
| P1-3 | **Página Notificações 100% mock** | `pages/Notificacoes.tsx` — React state only | Operador configura alertas que não existem |
| P1-4 | **Portal cliente / WhatsApp / filtros = toast-only** | `PortalClienteModal.tsx`, `OrcamentoPanel.tsx:552`, `OrdensServico.tsx:20`, `OSDetalhe.tsx:402` | Fluxos aparentam integração real |
| P1-5 | **Técnicos “online” hardcoded** | `api/os.ts:257` — `online: true` para todos | KPI operacional falso |
| P1-6 | **`moveStatus` fire-and-forget no store** | `osStore.tsx:175-176` — `void osApi.moveStatus(...).then(replaceOS)` | Kanban toast sucesso mesmo se server falhar; sem `.catch` |
| P1-7 | **Anexos: blob só IndexedDB** | `services/anexos/storage.ts` | Troca de browser/dispositivo = perda de arquivos; metadata órfã |
| P1-8 | **Rotas legadas ainda acessíveis** | `/dashboard/os`, `/dashboard/orcamentos` | Dois UIs, estoque divergente, orçamentos localStorage |
| P1-9 | **Recusa garantia = toast sem audit** | `RetornoGarantiaModal.tsx:43-46` | Sem timeline/OS update |
| P1-10 | **Modo bancada: câmera/peça “em breve”** | `ModoBancadaModal.tsx:76-77` | Botões visíveis sem função |

### P2 — Menores (dívida técnica / polish)

| # | Problema | Evidência |
|---|----------|-----------|
| P2-1 | Dead code `_db.ts` + 7 arquivos seed | `api/_db.ts`, `data/*Seed.ts` |
| P2-2 | Header search e sino sem handler | `OperacoesLayout.tsx:128-135` |
| P2-3 | `IASugestaoModal` — heurística keyword, não IA | `IASugestaoModal.tsx` (disclaimer ok) |
| P2-4 | Inconsistência `loja-1` vs `loja_matriz` | `lojasSeed.ts:8` vs `store-defaults.ts` |
| P2-5 | Cores não-token (`text-slate-*`) | `OSDetalhe.tsx`, `HubCard.tsx`, `Timeline.tsx` |
| P2-6 | Import upsert sem re-verify storeId | `app/api/ops/ordens/import/route.ts` |
| P2-7 | Debug endpoint cross-store | `app/api/debug/operacoes-history/route.ts` |
| P2-8 | `setStoreId` exposto mas nunca chamado | `osStore.tsx:41,156` |
| P2-9 | `createOS` two-step create (janela payload vazio) | `operacoes.ts:190-214` |
| P2-10 | Erros estoque/timeline não rollback status | `updateOSStatus` — loga na timeline, não reverte |

**Totais:** **5 P0** · **10 P1** · **10 P2**

---

## 5. Tabela de áreas auditadas

| Área | Arquivos-chave | Runtime | Auth | Multi-loja | Nota |
|------|----------------|---------|------|------------|------|
| Entrada Next.js | `app/dashboard/operacoes-v2/page.tsx` | Real | NextAuth proxy | `useLojaAtiva` | OK |
| Router HUB | `OperacoesHubIsolated.tsx` | Real | Herda dashboard | `key={storeId}` | Fallback `loja-1` |
| Store | `store/osStore.tsx` | Misto | — | Via `initialStoreId` | Comentário “API simulada” desatualizado |
| API OS | `api/os.ts` | Real | Server Actions | `CURRENT_STORE_ID` | Ver P0-5 |
| Server Actions | `app/actions/operacoes.ts` | Real | Bypass PIN | Scoped queries | Ver P0-2 |
| Read layer | `app/actions/ordens.ts` | Real | — | `normalizeLojaId` | Safe empty on invalid |
| Legacy REST | `app/api/ordens-servico/**` | Real | **Nenhum** | Read fallback | Ver P0-1, P0-3 |
| Ops REST | `app/api/ops/ordens*` | Real | Guarded | Write required | Migration/import |
| Estoque HUB | `lib/operacoes/adapters/os-estoque.ts` | Real | — | Scoped | On delivery |
| Estoque legacy | `lib/os-itens-stock.ts` | Real | — | Scoped | On save |
| Financeiro OS | `financeiro-sync-service.ts` | Real | Fechamento lock | `localKey` idempotent | OK |
| Timeline | `timeline-service.ts` | Real | — | findFirst scoped | Append-only payload |
| Dashboard KPIs | `DashboardOperacional.tsx` | Real data | — | From loaded ordens | Label “tempo real” ok |
| Kanban | `OSKanban.tsx` | Real | — | Client filter | Drag error handling frágil |
| Orçamento | `OrcamentoPanel.tsx` | Real | — | — | WhatsApp fake |
| Impressão | `ImpressaoModal.tsx` | Partial | — | — | Print client; audit real |
| Notificações | `Notificacoes.tsx` | Mock | — | — | Disclaimer presente |
| Serviços HUB | `pages/Servicos.tsx` | Read real / write fake | — | — | Ver P1-1 |
| Atendimento | `AtendimentoRapidoModal.tsx` | Mock | — | — | Ver P1-2 |
| Anexos | `AnexosPanel.tsx` | Hybrid | — | — | IndexedDB risk |
| Legacy OS panel | `app/dashboard/os/page.tsx` | Real REST | Weak | Header | Banner “use HUB” |
| Legacy orçamentos | `app/dashboard/orcamentos` | localStorage | — | — | Fora do HUB |

---

## 6. Lista de telas / componentes

### Páginas (10 wired + 1 órfã)

1. `OperacoesHub.tsx` — landing cards  
2. `DashboardOperacional.tsx` — KPIs operacionais  
3. `OrdensServico.tsx` — lista + kanban  
4. `OSDetalhe.tsx` — detalhe completo  
5. `Tecnicos.tsx` — fila técnica  
6. `HistoricoClientes.tsx` — histórico por cliente  
7. `Garantias.tsx` — garantias ativas  
8. `Servicos.tsx` — catálogo (write fake)  
9. `Notificacoes.tsx` — mock  
10. `NotFound.tsx` — 404 interno  
11. `Index.tsx` — **não wired**

### Modais / painéis principais

| Componente | Persiste? |
|------------|-----------|
| `NovaOSModal` | ✅ |
| `GerarCobrancaModal` | ✅ |
| `OrcamentoPanel` | ✅ (WhatsApp ❌) |
| `OperacaoOsAcaoBar` | ✅ |
| `ChecklistTecnicoPanel` | ✅ |
| `RetiradaPanel` | ✅ |
| `ObservacoesPanel` | ✅ |
| `GarantiaOperacionalCard` | ✅ |
| `AnexosPanel` | ⚠️ híbrido |
| `ImpressaoModal` / `EtiquetaModal` | ⚠️ audit + print client |
| `AtendimentoRapidoModal` | ❌ |
| `PortalClienteModal` | ❌ |
| `IASugestaoModal` | ❌ (read-only heurística) |
| `ModoBancadaModal` | ⚠️ parcial |
| `RetornoGarantiaModal` | ⚠️ aceitar ✅ / recusar ❌ |

---

## 7. Ações reais (persistem no servidor)

Todas via `app/actions/operacoes.ts` + `app/actions/ordens.ts` + `app/actions/cadastros.ts`:

| Ação UI | Server Action / Service | Persistência |
|---------|-------------------------|--------------|
| Criar OS | `createOS` | `ordens_servico` |
| Listar / get OS | `listOrdens`, `getOrdem` | Read Prisma + hydrate |
| Mover status / hub acao | `updateOSStatus`, `applyOperacaoHubAcao` | payload + enum + estoque/garantia side effects |
| Editar payload / orçamento | `updateOSPayload` | payload JSONB + financeiro sync |
| Sync itens orçamento | `syncOperacaoItensComOrcamento` | `ordemServicoItem` |
| Validar estoque orçamento | `validateOrcamentoEstoqueAction` | Read-only |
| Gerar cobrança | `gerarCobrancaOSAction` | payload + `ContaReceberTitulo` |
| Checklist técnico | `salvarChecklistTecnicoOperacaoAction` | payload |
| Retirada | `confirmarRetiradaOperacaoAction` | payload + timeline |
| Garantia operacional | `salvarPreferenciaGarantiaOperacionalAction`, `criarGarantiaOperacionalManualAction` | payload + `garantiaOrdemServico` |
| Documento impresso | `registrarDocumentoImpressoAction` | timeline |
| Anexo metadata | `updateOSPayload` (via store) | payload.anexos[] |
| Assign técnico / cliente / obs | `updateOSPayload` / timeline | payload |
| Aprovar/reprovar orçamento | `applyOperacaoHubAcao` | payload + policy |
| Vendas hub | `listVendasHub`, `criarVendaDeOSAction` | `venda` |
| Clientes / produtos / técnicos / lojas / serviços (read) | `app/actions/cadastros` | Read Prisma |

---

## 8. Ações fake / não persistem

| Ação UI | Comportamento | Arquivo |
|---------|---------------|---------|
| Filtros kanban (botão) | Toast “em breve” | `OrdensServico.tsx:20` |
| Busca header | Input sem handler | `OperacoesLayout.tsx:128` |
| Sino notificações | Botão sem onClick | `OperacoesLayout.tsx:133` |
| WhatsApp orçamento/OS | Toast futuro | `OrcamentoPanel`, `OSDetalhe` |
| Portal aprovar/recusar | Toast only | `PortalClienteModal.tsx` |
| Atendimento rápido | In-memory cache | `api/atendimentos.ts` |
| Salvar serviço no HUB | Noop + toast sucesso | `api/servicos.ts`, `Servicos.tsx` |
| Notificações switches | Local state | `Notificacoes.tsx` |
| Modo bancada foto/peça | Toast em breve | `ModoBancadaModal.tsx` |
| Recusa retorno garantia | Toast only | `RetornoGarantiaModal.tsx` |
| IA sugestão | Keyword rules | `IASugestaoModal.tsx` |
| Reservar/baixar peça (API shim) | Objeto sintético | `api/estoque.ts:42-75` |
| Legacy orçamentos | localStorage | `lib/operations-store` |

---

## 9. Riscos operacionais

| Risco | Severidade | Descrição |
|-------|------------|-----------|
| OS gravada na loja errada | **Alta** | `CURRENT_STORE_ID` default + fallback `loja-1` |
| Estoque duplicado ou faltante | **Alta** | Legacy debit on save vs HUB on delivery |
| Operador usa legacy sem saber | **Média** | `/dashboard/os` ainda funcional com REST |
| Anexo perdido | **Média** | Blob IndexedDB não replica entre devices |
| Permissão bypass | **Alta** | Server Actions sem check se sem NextAuth session |
| API legacy exposta | **Alta** | POST/PATCH/DELETE sem auth guard |
| Kanban move falha silenciosa | **Média** | Fire-and-forget no store |
| Status/timeline diverge de estoque | **Média** | Erro estoque logado mas status não revertido |
| Orçamento legacy localStorage | **Média** | Dados não sincronizados com Prisma |
| Import cross-store edge case | **Baixa** | Upsert com id client-supplied |

---

## 10. Duplicação Lovable vs legacy

| Funcionalidade | HUB V2 | Legacy |
|----------------|--------|--------|
| Listar OS | Server Actions | GET `/api/ordens-servico` |
| Criar/editar OS | Server Actions | POST/PATCH REST |
| Orçamento | Payload Prisma | `/dashboard/orcamentos` localStorage |
| Impressão | `ImpressaoModal` + audit | `lib/print-os-via-cliente` |
| Estoque | On delivery | On save |
| Auth | Server Actions (bypass PIN) | REST sem guard |

**Artefato duplicado:** `components/pdv-github-original/components/operacoes/lovable/` — cópia arquivada, gated, sem import ativo.

---

## 11. Hardcodes visuais

| Padrão | Ocorrências | Veredito |
|--------|-------------|----------|
| `bg-white` / `bg-black` / `text-gray-*` | **0** em componentes de negócio | ✅ Limpo |
| `bg-black/80` | shadcn overlays (`dialog`, `sheet`, etc.) | Aceitável (padrão UI lib) |
| `text-slate-*`, `bg-slate-*` | `OSDetalhe`, `HubCard`, `Timeline`, `types/os.ts` | ⚠️ Fora dos tokens semânticos |
| `background: white; color: black` | `ImpressaoModal.tsx` print CSS | Aceitável para `@media print` |
| Cores domínio (emerald/amber/rose) | badges, timeline | ✅ Documentado |

---

## 12. Loading / error states

| Estado | Honesto? | Nota |
|--------|----------|------|
| `OSProvider.loading` + skeleton kanban | ✅ | Fetch Prisma real |
| OSDetalhe loading / not found | ✅ | |
| Next dynamic import fallback | ✅ | Chunk load, não dados |
| Validação estoque pré-entrega | ✅ | `validateOrcamentoEstoque` real |
| Kanban drag toast | ⚠️ | Pode mostrar sucesso antes de confirmar server |
| Serviços “salvo” | ❌ | Toast enganoso |
| Notificações | ✅ | Disclaimer “mockadas” |
| Portal cliente | ❌ | Parece produção, é preview |

---

## 13. Validações de build

| Comando | Resultado | Data |
|---------|-----------|------|
| `npx tsc --noEmit` | ✅ **0 erros** | 26/05/2026 |
| `npm run build` | ✅ **OK** — 98 rotas geradas; `/dashboard/operacoes-v2` estática | 26/05/2026 |

---

## 14. Recomendações incrementais

### Sprint imediata (P0)

1. Adicionar `apiGuardOperacoesHubOrLegacy` em `app/api/ordens-servico/**`.
2. Tornar `requireOperacaoAuth` **fail-closed** ou exigir gate legacy explícito quando sem NextAuth.
3. Remover fallback `LEGACY_PRIMARY_STORE_ID` no HUB quando `lojaAtivaId` null — banner bloqueante (padrão Config V3).
4. Passar `storeId` explicitamente em **toda** chamada `api/os.ts` — eliminar `CURRENT_STORE_ID` module-level.
5. Documentar/desativar legacy REST para escrita ou alinhar estoque com HUB V2.

### Sprint curta (P1)

6. Marcar Serviços/Atendimento/Notificações/Portal com `Em breve` ou redirecionar para Cadastros real.
7. Corrigir `moveStatus` para `async` com error toast no kanban.
8. Persistir atendimento rápido ou remover card do hub.
9. Implementar `upsertServico` via `app/actions/cadastros` ou desabilitar botão salvar.
10. Migrar anexos blob para storage server-side (Supabase Storage ou similar).
11. Redirect `/dashboard/os` e `/dashboard/orcamentos` → HUB V2 com banner de deprecação.

### Sprint média (P2)

12. Remover `_db.ts` e seeds mortos para `_imports/` ou deletar.
13. Wire header search ou remover placeholder.
14. Substituir `online: true` por status real ou remover KPI.
15. Consolidar cores `slate` → tokens semânticos.
16. Adicionar `storeId` em todos `update`/`delete` Prisma (defense-in-depth).

---

## 15. O que já está forte

- **Fluxo OS principal no HUB V2** — criar → diagnosticar → orçar → aprovar → executar → cobrar → entregar com Prisma real.
- **Timeline/histórico** append-only em `payload.timeline[]` — auditável.
- **Integração financeira** — `gerarCobrancaOSAction` → Conta a Receber idempotente via `localKey`.
- **Estoque HUB** — consume on delivery com validação prévia e restore on cancel.
- **Garantia operacional** — Prisma + payload sincronizados.
- **Multi-loja no provider** — remount `key={storeId}` ao trocar unidade.
- **Hydration service** — converte Prisma → shape HUB de forma consistente.
- **Loading states** — skeletons honestos na maioria das telas core.
- **Build/tsc** — projeto compila sem erros.
- **Direção de produto clara** — `/dashboard/operacoes-v2` é o caminho oficial; legacy tem banner.

---

## 16. O que ainda precisa virar runtime real

| Item | Estado atual | Target |
|------|--------------|--------|
| Notificações | Mock local | Prisma + push/email ou remover |
| Atendimento rápido | In-memory | Prisma ou remover card |
| Serviços write no HUB | Noop | Cadastros Server Action |
| Portal cliente | Toast preview | Link público + actions reais |
| WhatsApp orçamento | Toast | Integração WhatsApp HUB existente |
| Técnicos online | Hardcoded | Presença real ou remover KPI |
| Anexos blobs | IndexedDB | Object storage server |
| Header search | Dead | Busca server-side ou remover |
| Legacy `/dashboard/os` | REST paralelo | Deprecar |
| Legacy orçamentos | localStorage | Unificar no HUB |
| Auth PIN-only | Bypass permissions | Fail-closed |
| API legacy REST | Sem guard | Auth + deprecate writes |

---

## 17. Resumo executivo

| Métrica | Valor |
|---------|-------|
| **Arquivos auditados** | **~152** (123 `components/operacoes` + 11 `lib/operacoes` + 6 `app/dashboard/operacoes*` + 2 `app/actions` + 2 `app/api/ordens-servico` + 2 `app/api/ops/ordens*` + 6 ancillary: legacy os/orcamentos, `lib/os-itens-stock`, `lib/store-id-from-request`, debug route) |
| **P0** | **5** |
| **P1** | **10** |
| **P2** | **10** |
| **Server Actions reais** | **17 exports** em `operacoes.ts` + **2** em `ordens.ts` |
| **Ações fake identificadas** | **12** superfícies UI |
| **tsc** | ✅ 0 erros |
| **build** | ✅ OK |

### Top 10 pendências

1. Auth na API legacy `/api/ordens-servico` (P0-1)
2. `requireOperacaoAuth` fail-closed sem NextAuth (P0-2)
3. Unificar semântica estoque legacy vs HUB (P0-3)
4. Eliminar fallback silencioso `loja-1` (P0-4)
5. Remover `CURRENT_STORE_ID` module-level (P0-5)
6. Serviços save fake — corrigir ou desabilitar (P1-1)
7. Atendimento rápido in-memory (P1-2)
8. Notificações mock inteira (P1-3)
9. Anexos IndexedDB — risco perda (P1-7)
10. Deprecar rotas legacy `/dashboard/os` e `/dashboard/orcamentos` (P1-8)

---

*Auditoria read-only — nenhum arquivo de código alterado · nenhum commit criado.*

---

## 18. Remediação P0 (26/05/2026)

Sprint incremental de segurança — **sem** alteração de `schema.prisma`, `proxy.ts`, PDV, Financeiro, WhatsApp, Marketplace ou Config V3.

### Antes → Depois

| P0 | Antes | Depois |
|----|-------|--------|
| **P0-1** API legacy sem auth | GET/POST/PATCH/DELETE públicos | GET exige unidade explícita + `apiGuardOperacoesHubOrLegacy`; POST/PATCH/DELETE retornam **410** após auth |
| **P0-2** Auth bypass | `requireOperacaoAuth` retornava silenciosamente sem sessão | Fail-closed: sem login → erro; sem `storeId` → erro; sem permissão → erro |
| **P0-3** Dupla semântica estoque | Legacy debitava no save; HUB no delivery — ambos ativos | Escrita legacy **desativada** (API 410 + rotas UI redirecionadas) |
| **P0-4** Fallback `loja-1` | HUB montava com `loja-1` se sem unidade; API GET caía em primary store | HUB exibe `UnidadeAtivaRequiredBanner`; API legacy GET exige header/query |
| **P0-5** `CURRENT_STORE_ID` | Module-level `"loja-1"` em `api/os.ts` / `api/estoque.ts` | `storeId` obrigatório por parâmetro em toda mutação |

### Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `lib/operacoes/assert-active-store.ts` | **NOVO** — `assertActiveStoreId` / `resolveActiveStoreId` |
| `lib/operacoes/legacy-api-guard.ts` | **NOVO** — storeId strict + payload 410 |
| `app/actions/operacoes.ts` | `requireOperacaoAuth` fail-closed |
| `app/api/ordens-servico/route.ts` | Auth + GET strict; POST → 410 |
| `app/api/ordens-servico/[id]/route.ts` | PATCH/DELETE → 410 após auth |
| `components/operacoes/lovable/api/os.ts` | Removido `CURRENT_STORE_ID`; `storeId` em todas as funções |
| `components/operacoes/lovable/api/estoque.ts` | Removido `CURRENT_STORE_ID`; `storeId` obrigatório |
| `components/operacoes/lovable/store/osStore.tsx` | Passa `storeId` a todas as chamadas; `initialStoreId` obrigatório |
| `components/operacoes/lovable/OperacoesHubIsolated.tsx` | Banner se sem unidade; sem fallback `loja-1` |
| `components/operacoes/lovable/components/operacoes/GarantiaOperacionalCard.tsx` | Passa `storeId` |
| `components/operacoes/lovable/components/operacoes/RetiradaPanel.tsx` | Passa `storeId` |
| `components/operacoes/lovable/components/operacoes/ChecklistTecnicoPanel.tsx` | Passa `storeId` |
| `components/operacoes/lovable/components/operacoes/OperacaoOsAcaoBar.tsx` | Passa `storeId` em validação estoque |
| `app/dashboard/os/page.tsx` | Redirect → `/dashboard/operacoes-v2` |
| `app/dashboard/orcamentos/page.tsx` | Redirect → `/dashboard/operacoes-v2` |

### Protegido

- Todas as Server Actions de `app/actions/operacoes.ts` exigem sessão NextAuth + unidade + permissão enterprise.
- API `/api/ordens-servico` não aceita mais escrita (410 honesto).
- API GET legacy exige `x-assistec-loja-id` ou query — **sem** fallback `loja-1`.
- HUB não monta `OSProvider` sem unidade ativa selecionada.

### Redirecionado / desativado

- `/dashboard/os` → `/dashboard/operacoes-v2`
- `/dashboard/orcamentos` → `/dashboard/operacoes-v2`
- POST/PATCH/DELETE `/api/ordens-servico` → HTTP 410 + mensagem de deprecação

### P0 resolvidos vs pendentes

| ID | Status |
|----|--------|
| P0-1 | ✅ Resolvido |
| P0-2 | ✅ Resolvido |
| P0-3 | ⚠️ **Mitigado** — escrita legacy bloqueada; leitura GET legacy ainda existe (deprecated) |
| P0-4 | ✅ Resolvido no escopo Operações HUB + API legacy OS |
| P0-5 | ✅ Resolvido |

**Bloqueado / fora de escopo desta sprint (não alterado de propósito):**

- `lib/store-id-from-request.ts` — fallback global `LEGACY_PRIMARY_STORE_ID` permanece para **outros módulos** (não tocar infra core).
- `app/actions/ordens.ts` — leitura sem auth própria (consumida pelo HUB após gate do provider); endurecer em sprint futura se necessário.
- `/api/ops/ordens` — stack paralelo com guards próprios; não alterado.

### Validação pós-remediação

| Comando | Resultado |
|---------|-----------|
| `npx tsc --noEmit` | ✅ 0 erros |
| `npm run build` | ✅ OK (98 rotas) |

### Pendências P1 (próxima sprint)

1. Serviços save fake no HUB (`api/servicos.ts` noop)
2. Atendimento rápido in-memory
3. Notificações mock
4. Anexos IndexedDB → storage server
5. `moveStatus` fire-and-forget — error toast no kanban
6. Deprecar GET `/api/ordens-servico` completamente
7. Remover dead code `_db.ts` + seeds

*Remediação P0 — nenhum commit · nenhum push.*
