# Auditoria Operacional Enterprise — OmniGestão Pro

**Tipo:** read-only — rastreamento ponta a ponta do uso diário em loja/assistência técnica  
**Data:** 21 de maio de 2026  
**Complementa:** [`ERP_AUDITORIA_COMPLETA.md`](./ERP_AUDITORIA_COMPLETA.md) (visão técnica/arquitetural)  
**Metodologia:** leitura de código, Server Actions, APIs, providers, localStorage, Prisma models — **nenhum arquivo de código alterado**

---

## Legenda de classificação por etapa

| Símbolo | Significado |
|---------|-------------|
| ✅ | **Real** — persiste/consulta Prisma ou API estável; operação confiável |
| ⚠️ | **Parcial** — funciona com gaps, dupla fonte ou best-effort |
| 🧪 | **Mock/localStorage** — demonstração ou estado local não autoritativo |
| ❌ | **Inexistente** — não há implementação no fluxo principal |
| 🔴 | **Risco crítico** — pode causar perda financeira, estoque errado ou vazamento entre lojas |

---

## Mapa operacional resumido (1 página)

```
                    ┌─────────────────────────────────────────────────────────┐
                    │              NextAuth (REAL) + AccessGate (MOCK staff)   │
                    └───────────────────────────┬─────────────────────────────┘
                                                │
         ┌──────────────────────────────────────┼──────────────────────────────────────┐
         │                                      │                                      │
    ┌────▼────┐   ┌──────────┐   ┌─────────────▼─────────────┐   ┌──────────┐   ┌──────────┐
    │  PDV    │   │  Caixa   │   │     Operações HUB V2       │   │Cadastros │   │WhatsApp  │
    │ PARTIAL │   │ PARTIAL  │   │         REAL               │   │  REAL    │   │  REAL    │
    └────┬────┘   └────┬─────┘   └─────────────┬─────────────┘   └────┬─────┘   └────┬─────┘
         │             │                         │                      │              │
         │    localStorage + Prisma              │                      │              │
         └─────────────┼─────────────────────────┼──────────────────────┼──────────────┘
                       │                         │                      │
              ┌────────▼────────┐       ┌────────▼────────┐    ┌────────▼────────┐
              │    Estoque      │       │   Financeiro    │    │  Omni Agent     │
              │  REAL (OS/adap) │       │    PARTIAL      │    │  REAL + MOCK UI │
              │  PARTIAL (PDV)  │       │  HUB V2 + LS    │    └─────────────────┘
              └─────────────────┘       └─────────────────┘
                       │                         │
              ┌────────▼─────────────────────────▼────────┐
              │           PostgreSQL (Supabase)            │
              │  Venda, OS, Produto, MovimentacaoEstoque,  │
              │  ContaReceber/Pagar, SessaoCaixa, WhatsApp │
              └────────────────────────────────────────────┘
```

---

# FLUXO 1 — Venda no PDV

## 1. Caminho atual do código

| Camada | Arquivos |
|--------|----------|
| Rotas | `/dashboard/vendas`, `/dashboard/vendas/venda-completa`, `/dashboard/pdv-next` (Black) |
| Router UI | `components/dashboard/vendas/vendas-pdv.tsx` |
| PDVs | `pdv-classic.tsx`, `pdv-assistencia-enterprise.tsx`, `pdv-supermercado.tsx`, `venda-completa-enterprise.tsx`, `pdv-next/PdvBlackEdition.tsx` |
| Orquestrador | `lib/operations-store.tsx` → `finalizeSaleTransaction` |
| Providers | `components/dashboard/app-ops-providers.tsx`, `caixa-provider.tsx` |
| Pagamento | `components/dashboard/vendas/payment-modal.tsx` |
| Persistência venda | `app/api/ops/venda-persist/route.ts`, `lib/ops-upsert-venda.ts` |
| Estoque sync | `app/api/ops/inventory/route.ts` (GET/PUT) |
| À prazo | `lib/pdv-append-conta-receber.ts` → `app/api/ops/contas-receber-persist` |
| Automação | `lib/events/event-bus.ts` → `POST /api/automation/handle-event` |
| Histórico | `components/dashboard/vendas/vendas-arquivo-geral.tsx`, `app/api/vendas/historico` |
| localStorage | `assistec-pro-ops-v1-{lojaId}`, `omnigestao:caixa:{storeId}`, rascunhos venda-completa |

**Models Prisma:** `Venda`, `ItemVenda`, `Produto`, `Cliente`, `SessaoCaixa`, `ContaReceberTitulo` (à prazo), `LedgerSnapshot`

## 2. Fluxo esperado (ERP SaaS premium)

Operador abre caixa server-side → seleciona cliente → adiciona itens com reserva de estoque → desconto auditado → pagamento multi-método → transação atômica: venda + baixa estoque (ledger) + movimento financeiro + sessão caixa + comprovante fiscal/NFC-e → eventos para WhatsApp/Omni → relatórios consistentes.

## 3. Fluxo atual encontrado

1. **Abrir caixa:** local imediato + `POST /api/ops/caixa/abrir` best-effort → `SessaoCaixa`. Se API falha, UI ainda mostra caixa aberto. ⚠️  
2. **Cliente:** `useClienteSearch` → API clientes. ✅ (exceto Black Edition)  
3. **Produto:** catálogo `GET /api/ops/inventory` → carrinho em memória (Assistência também em LS). ⚠️  
4. **Desconto:** `PaymentModal` (Classic/Super); Assistência desconto global nem sempre vai no payload auditado. ⚠️  
5. **Pagamento:** validação soma métodos = total. ✅  
6. **Finalizar:** `finalizeSaleTransaction` → local: estoque--, ledger diário, sale `syncPending`, evento → `venda-persist`. ✅ (Classic/Assist/Super/Venda Completa)  
7. **PDV Black:** `handlePaymentConfirm` só incrementa cupom LS e limpa carrinho — **não chama finalize**. 🧪 🔴  
8. **Estoque:** decremento local + PUT inventory assíncrono; **sem** `MovimentacaoEstoque origem:pdv`. ⚠️ 🔴 se persist falhar  
9. **Financeiro:** à prazo → CR; dinheiro/pix/cartão → **sem** `MovimentacaoFinanceira`. ⚠️  
10. **Comprovante:** térmico Classic/Venda Completa; toast em outros. ⚠️  
11. **Automações:** `venda_finalizada` via fetch handle-event. ✅ (não no Black)  
12. **Relatórios:** histórico vendas Prisma ✅; DRE não vê vendas à vista ❌

## 4. Quebras e riscos

| Risco | Severidade |
|-------|------------|
| PDV Black sem persistência | 🔴 |
| Venda local ok + `venda-persist` falhou = estoque baixado sem venda DB | 🔴 |
| Caixa local vs `SessaoCaixa` desincronizados | 🔴 |
| Crédito/vale cliente só em LS | 🔴 |
| Sem ledger estoque PDV | ⚠️ |
| Receita à vista invisível ao Financeiro HUB | 🔴 |

## 5. Gap analysis por etapa

| Etapa | Status |
|-------|--------|
| Abrir caixa | ⚠️ precisa consolidar |
| Selecionar cliente | ✅ pronto |
| Adicionar produto | ⚠️ precisa consolidar |
| Desconto | ⚠️ precisa consolidar |
| Pagamento | ✅ pronto |
| Finalizar venda (PDV principal) | ✅ pronto |
| Finalizar venda (Black) | 🧪 mock |
| Registrar caixa | ⚠️ precisa consolidar |
| Baixar estoque | ⚠️ precisa consolidar |
| Gerar financeiro (à vista) | ❌ não existe |
| Gerar financeiro (à prazo) | ✅ pronto |
| Comprovante | ⚠️ precisa consolidar |
| Automações | ⚠️ parcial (endpoint aberto) |
| Relatórios | ⚠️ parcial |

## 6–8. Prioridade / Complexidade / Recomendação

| | |
|---|---|
| **Prioridade** | **P0** (Black + atomicidade venda/estoque); **P1** (financeiro à vista, ledger PDV) |
| **Complexidade** | Alta |
| **Recomendação** | Despublicar ou wire Black em `finalizeSaleTransaction`; transação server-side venda+estoque+ledger; criar `MovimentacaoEstoque` PDV; materializar receita à vista no financeiro |

---

# FLUXO 2 — Fechamento de caixa

## 1. Caminho atual do código

| Item | Arquivo |
|------|---------|
| Abertura UI | `components/dashboard/caixa/abertura-caixa-modal.tsx` |
| Fechamento UI | `components/dashboard/caixa/fechamento-caixa-modal.tsx` |
| Barra status | `components/dashboard/caixa/caixa-status-bar.tsx` |
| Histórico | `app/dashboard/caixa/historico/page.tsx`, `caixa-historico-client.tsx` |
| APIs | `app/api/ops/caixa/abrir`, `fechar`, `operacao`, `sessoes`, `sessao-detalhe` |
| Estado local | `operations-store.tsx` (`caixa`, `dailyLedger`, `cashHistory` parcial) |
| Sangria/suprimento | Classic menu → `adicionarSaida`/`adicionarEntrada` + `POST caixa/operacao` |
| Ledger sync | `app/api/ops/sync-ledger` → `LedgerSnapshot` |

**Models Prisma:** `SessaoCaixa`, `CaixaOperacao`, `MovimentacaoFinanceira`, `LedgerSnapshot`

## 2. Fluxo esperado

Abertura com operador e saldo inicial no servidor → vendas incrementam sessão server-side → sangrias/suprimentos auditados → fechamento cego com conferência → divergência registrada → integração automática com financeiro e relatório Z.

## 3. Fluxo atual encontrado

| Etapa | Atual |
|-------|-------|
| Abertura | LS + API create sessão ⚠️ |
| Suprimento/sangria | API + LS + `MovimentacaoFinanceira` ✅ (Classic) |
| Vendas no turno | Acumulam em `dailyLedger` LS; **não** incrementam row `SessaoCaixa` por venda ⚠️ |
| Formas pagamento | Breakdown no LS; snapshot no payload ao fechar ⚠️ |
| Conferência cega | Operador informa contado vs saldo calculado local ⚠️ |
| Divergência | `appendAuditLog("quebra_caixa")` LS ⚠️ |
| Operador | Manual + label NextAuth nas rotas server ⚠️ |
| Histórico | Prisma sessões ✅; `cashHistory` Classic = state React ❌ |
| Fechamento | Payload client enviado ao fechar; se sem `sessaoId`, cria sessão **retroativa** 🔴 |
| Financeiro | Sangria/suprimento ✅; vendas à vista ❌ |

## 4–8. Síntese

| Gap | Classificação |
|-----|---------------|
| Dupla fonte caixa | ⚠️ / 🔴 |
| Sessão retroativa distorce auditoria | 🔴 |
| Histórico intraday misto LS/DB | ⚠️ |

**Prioridade:** P0–P1 | **Complexidade:** Alta | **Recomendação:** Caixa server-authoritative; cada venda atualiza sessão; proibir retroativo silencioso; relatório Z único

---

# FLUXO 3 — Ordem de Serviço

## 1. Caminho atual do código

| Camada | Arquivos |
|--------|----------|
| Rota | `/dashboard/operacoes-v2` → `OperacoesHubIsolated.tsx` |
| UI | `OperacoesHub.tsx`, `OSDetalhe.tsx`, `NovaOSModal.tsx`, `OrcamentoPanel.tsx`, `GerarCobrancaModal.tsx` |
| Store | `components/operacoes/lovable/store/osStore.tsx` |
| API shim | `components/operacoes/lovable/api/os.ts` |
| Server | `app/actions/operacoes.ts`, `app/actions/ordens.ts` |
| Estoque | `lib/operacoes/adapters/os-estoque.ts` |
| Financeiro | `lib/financeiro/adapters/os-faturamento.ts`, `lib/operacoes/services/financeiro-sync-service.ts` |
| Garantia | `lib/operacoes/services/garantia-operacional-service.ts` |
| Legado | `/dashboard/os`, `app/api/ordens-servico/*` |
| Automações | `handleEvent` só no **legado** API PATCH |

**Models Prisma:** `OrdemServico`, `OrdemServicoItem`, `GarantiaOrdemServico`, `MovimentacaoEstoque`, `ContaReceberTitulo`, `Cliente`, `Produto`

## 2. Fluxo esperado

OS única → cliente/equipamento → diagnóstico → orçamento → aprovação → execução → peças consomem estoque → cobrança → entrega → garantia → documentos → WhatsApp automático.

## 3. Fluxo atual (HUB V2 — caminho oficial)

| Etapa | Status |
|-------|--------|
| Abertura OS | ✅ `createOS` Prisma |
| Cliente | ✅ vincular/alterar |
| Aparelho/defeito | ✅ payload + colunas |
| Diagnóstico | ✅ status + timeline + Modo Bancada |
| Técnico | ✅ assign |
| Status/Kanban | ✅ `operacao-hub-flow.ts` |
| Orçamento | ✅ payload + sync itens |
| Aprovação/reprovação | ✅ hub actions |
| Peças | ✅ payload; reserva UI = compat 🧪 |
| Estoque entrega | ✅ adapter `origem:os` + custo |
| Custo | ✅ ledger + payload orçamento |
| Financeiro | ✅ CR via `os-faturamento` idempotente |
| Entrega | ✅ `entregue` + consume |
| Garantia | ✅ row + payload |
| Recibo/impressão | ✅ modal client-side |
| WhatsApp OSDetalhe | 🧪 toast "futuro" |
| Automações entrega | ❌ HUB não emite `os_finalizada` (só legado API) |

## 4. Quebras e riscos

- **Duas UIs OS** (HUB vs `/dashboard/os`) 🔴  
- **Automações só no legado** — operador no HUB não dispara WhatsApp/Omni na entrega ⚠️  
- Falha estoque = best-effort (OS entrega mesmo com `estoque_sync_erro`) ⚠️  
- `criarVendaDeOSAction` = caminho alternativo legado ⚠️  

## 5–8. Síntese

**Prioridade:** P0 unificar OS + automações | **Complexidade:** Alta | **Recomendação:** Redirect `/os` → HUB; emitir eventos no `updateOSStatus` entregue; desativar legado API ou proxy único

---

# FLUXO 4 — Financeiro operacional

## 1. Caminho atual do código

| Stack | Arquivos |
|-------|----------|
| HUB V2 (oficial) | `/dashboard/financeiro-v2`, `FinanceiroRealContext.tsx`, `routes/financeiro.tsx` |
| Services | `lib/financeiro/services/*` (receber, pagar, carteiras, movimentações, DRE, fluxo, fechamento, conciliação, auditoria) |
| APIs | `app/api/financeiro/*` (~30 rotas) |
| Adapters | `lib/financeiro/adapters/os-faturamento.ts` |
| Legado LS | `lib/financeiro-store.tsx`, `lib/contas-receber-storage.ts`, `components/dashboard/financeiro/*.tsx` |
| PDV à prazo | `lib/pdv-append-conta-receber.ts` |

## 2. Fluxo esperado

CR/CP centralizados → carteiras → baixa parcial/total → estorno auditado → parcelas → fluxo e DRE → fechamento período → conciliação → integração PDV/OS/compras.

## 3. Fluxo atual

| Capacidade | HUB V2 | Legado |
|------------|--------|--------|
| Contas a receber | ✅ API + Prisma | ⚠️ LS + persist híbrido |
| Contas a pagar | ✅ (import GC real) | 🧪 LS store |
| Carteiras | ✅ | 🧪 LS |
| Movimentações | ✅ | 🧪 LS |
| Baixa parcial/total | ✅ | parcial legado |
| Estorno | ✅ + auditoria | variável |
| Recorrência | ❌ | ❌ |
| Parcelas | ✅ OS + import | ✅ |
| Fluxo caixa / DRE | ✅ API | 🧪 painel LS |
| Relatórios export | ✅ API | ⚠️ |
| PDV à vista | ❌ | ❌ |
| OS → CR | ✅ adapter | ✅ |
| Compras → CP | ❌ | ❌ |
| Renegociar modal | 🧪 "em preparação" | — |

## 4–8. Síntese

**Prioridade:** P0 rota única + retirar LS; P1 renegociação, receita PDV  
**Complexidade:** Alta  
**Recomendação:** Depreciar painéis `components/dashboard/financeiro/*`; materializar vendas à vista; cron vencimentos CR

---

# FLUXO 5 — Estoque

## 1. Caminho atual do código

| Item | Arquivo |
|------|---------|
| CRUD produto | `app/actions/cadastros.ts`, `app/api/produtos/*` |
| Entrada/ajuste | `app/actions/estoque.ts` |
| Modal UI | `MovimentacaoEstoqueModal.tsx`, `CadastrosHub.tsx` ProdutosPanel |
| OS baixa | `lib/operacoes/adapters/os-estoque.ts` |
| PDV baixa | `operations-store.tsx` + `inventory PUT` |
| Legado OS | `lib/os-itens-stock.ts`, `/api/ordens-servico` |
| KPIs | `getEstoqueResumo`, alertas cadastros |
| Duplicatas | heurística cadastros + script `merge-produtos-duplicados.mjs` |

**Models:** `Produto`, `MovimentacaoEstoque`, `Fornecedor` (sem FK produto)

## 2–3. Fluxo atual por operação

| Operação | Status |
|----------|--------|
| Cadastro produto (SKU, barras, custo, preço, fornecedor texto) | ✅ |
| Entrada manual + custo médio | ✅ |
| Ajuste manual | ✅ |
| Saída manual dedicada | ❌ |
| Inventário cíclico | ❌ |
| Baixa venda PDV | ⚠️ stock only, sem ledger |
| Baixa OS HUB | ✅ ledger completo |
| Baixa OS legado | ⚠️ stock only |
| Devolução PDV | ⚠️ local |
| Multi-loja | ✅ storeId |
| Auditoria movimentos | ✅ `MovimentacaoEstoque` |
| NF-e entrada | 🧪 preview only |

## 4–8. Síntese

**Prioridade:** P1 ledger PDV + saída manual; P2 inventário  
**Complexidade:** Média  
**Recomendação:** Unificar baixa OS no HUB; `registrarSaidaEstoque`; PDV chamar ledger na persist

---

# FLUXO 6 — Clientes / CRM

## 1. Caminho atual do código

| Item | Arquivo |
|------|---------|
| Página enterprise | `app/dashboard/clientes/ClientesPageClient.tsx` |
| Cadastros HUB | `CadastrosHub.tsx` ClientesPanel |
| API/Actions | `app/api/clientes/*`, `cadastros.ts` |

## 2–3. Fluxo atual

| Capacidade | Status |
|------------|--------|
| Cadastro CRUD | ✅ |
| Histórico compras (15 vendas) | ✅ API profile |
| Histórico OS (15 OS) | ✅ |
| totalGasto agregado | ✅ OS + Vendas |
| Financeiro vinculado (CR por cliente) | ❌ |
| WhatsApp inbox link | ❌ (só wa.me) |
| Lembretes | ❌ |
| Timeline unificada | ⚠️ 3 eventos estáticos |
| Segmentação RFM | ❌ tags/filtros locais ⚠️ |
| Tags fiado/inadimplente | ✅ metadata |
| Omni Agent busca cliente | ✅ executor |

## 4–8. Síntese

**Prioridade:** P2 CRM; P3 campanhas  
**Complexidade:** Média–Alta  
**Recomendação:** Timeline Prisma cross-module; aba CR no perfil cliente; link conversa WhatsApp

---

# FLUXO 7 — Marketplace

## 1. Caminho atual do código

`app/dashboard/marketplace`, `lib/marketplace/services/*`, `app/api/marketplace/*`, `MarketplaceLayout.tsx`, `MarketplaceCatalogReal.tsx`

## 2–3. Fluxo atual

| Etapa | Status |
|-------|--------|
| Produto cadastro → catálogo marketplace | ✅ |
| Vínculo link DB | ✅ |
| Export/publicar | 🧪 SIM-* externalId, log `[mock]` |
| Sync estoque/preço | 🧪 atualiza link + log |
| OAuth/token real | 🧪 placeholder |
| KPIs layout | 🧪 mock |
| Logs sync | ✅ Prisma |

## 4–8. Síntese

**Prioridade:** P3 | **Complexidade:** Alta | **Recomendação:** Honrar UI "simulado"; OAuth ML quando produto exigir

---

# FLUXO 8 — WhatsApp e Automações

## 1. Caminho atual do código

| Item | Arquivo |
|------|---------|
| Inbox | `WhatsAppInbox.tsx`, `app/api/whatsapp/*` |
| Webhook Meta | `app/api/webhooks/whatsapp/route.ts`, `lib/whatsapp-meta-cloud-webhook.ts` |
| Envio Cloud | `lib/whatsapp/whatsapp-service.ts`, `app/api/whatsapp/send` |
| Engine | `lib/automation/automation-engine.ts` |
| Event bus | `lib/events/event-bus.ts` |
| Bridge PDV | `app/api/automation/handle-event/route.ts` |
| Omni tail | `lib/omni-agent/omni-automation-engine.ts` |
| Persistência | `WhatsAppAutomation`, `WhatsAppAutomationLog`, mensagens Prisma |

## 2–3. Fluxo atual

| Capacidade | Status |
|------------|--------|
| Receber mensagem Meta → DB | ✅ |
| Enviar manual Cloud API | ✅ |
| Automação system_event pós-PDV | ⚠️ log simulated send |
| Automação keyword inbound | ❌ não no webhook |
| Templates Meta | ⚠️ send route |
| Eventos OS (HUB) | ❌ |
| Eventos OS (legado API) | ✅ |
| Fila assíncrona | ❌ |
| Duplicata wamid | ✅ mitigado |
| handle-event sem auth | 🔴 |
| storeId webhook fixo env | 🔴 |

## 4–8. Síntese

**Prioridade:** P0 auth handle-event; P1 automações reais + inbound keywords  
**Complexidade:** Alta  
**Recomendação:** Vincular webhook a store por número; enviar Cloud no engine; emitir eventos OS no HUB

---

# FLUXO 9 — Omni Agent HUB

## 1. Caminho atual do código

`app/dashboard/omni-agent`, `app/actions/omni-agent.ts`, `components/omni-agent/*`, `lib/omni-agent/*`

## 2–3. Fluxo atual

| Capacidade | Status |
|------------|--------|
| Comandos persistidos | ✅ |
| Inbox real | ✅ |
| Interpretação + executor | ✅ parcial (intents limitados) |
| Confirmação ações sensíveis | ✅ |
| Automações → inbox PENDENTE | ✅ nunca auto-exec |
| Stats Prisma | ✅ |
| Relatório financeiro tab | ✅ se permissão |
| Memória cliente | 🧪 LS `omni-notes` |
| WhatsApp tab | 🧪 UI simulada |
| Settings/créditos IA | 🧪 LS |
| OS_OPEN via agent | ✅ |
| PRODUCT/CLIENT search | ✅ |

## 4–8. Síntese

**Prioridade:** P2 créditos Stripe sync; P2 memória DB  
**Complexidade:** Média–Alta  
**Recomendação:** Expandir intents; persistir notas; remover labels "mock" onde pipeline é real

---

# FLUXO 10 — Multi-loja e permissões

## 1. Caminho atual do código

`lib/loja-ativa.tsx`, `lib/store-id-from-request.ts`, `lib/assistec-headers.ts`, `enterprise-permissions.ts`, `guard-enterprise.ts`, `AccessGate.tsx`, `app/api/stores/*`, `app/api/admin/users/*`

## 2–3. Fluxo atual

| Mecanismo | Status |
|-----------|--------|
| Header `x-assistec-loja-id` writes | ✅ obrigatório |
| Header reads + cookie fallback | ⚠️ 🔴 reads permissivos |
| LS loja ativa | ⚠️ |
| Queries Prisma storeId | ✅ (quando respeitado) |
| NextAuth roles | ✅ matriz fixa |
| AccessGate PIN + mock LS role | 🧪 🔴 |
| canAccessStore permissivo | 🔴 |
| AdminUserStore | ✅ modelo existe |

## 4–8. Síntese

**Prioridade:** P0 | **Complexidade:** Alta | **Recomendação:** Produção = NextAuth only; reads exigem sessão; ACL DB fase 2

---

# FLUXO 11 — Relatórios e Dashboard

## 1. Caminho atual do código

`hooks/use-dashboard-elite.ts`, `app/api/dashboard/elite/route.ts`, `app/dashboard/page.tsx`, `RelatoriosHubGrid.tsx`, APIs `app/api/financeiro/relatorios/*`

## 2–3. Fluxo atual

| Superfície | Dados | Status |
|------------|-------|--------|
| KPIs painel | Prisma agregado | ✅ |
| Gráfico 7d | Vendas reais | ✅ |
| Estoque crítico | Produtos stock=0 | ✅ |
| CR hoje | Titulos vencimento | ✅ |
| AiInsights | Heurística sobre elite | ⚠️ |
| Demo notice | Honesto | ✅ |
| Relatórios hub DRE/fluxo/OS | em_breve | ❌ UI |
| Histórico vendas | ✅ | ✅ |
| Financeiro hub | ✅ | ✅ |
| Elite API auth | Sem check explícito sessão | 🔴 |
| Expedição page | MOCK_ORDERS | 🧪 |

## 4–8. Síntese

**Prioridade:** P1 plugar relatórios APIs; P2 auth elite  
**Complexidade:** Média  
**Recomendação:** Cards em_breve → rotas reais; proteger `/api/dashboard/elite`

---

# FLUXO 12 — Fiscal e compras

## 1. Caminho atual do código

`ImportacaoHub.tsx`, `app/api/product/ncm-suggest`, `fiscal-classify`, `voice-form`, `cadastros.ts` fornecedores, `estoque.ts` entrada, importador avançado

## 2–3. Fluxo atual

| Capacidade | Status |
|------------|--------|
| NF-e/NFC-e/NFS-e emissão | ❌ |
| Config fiscal SEFAZ | ❌ |
| Classificação NCM IA | ⚠️ suggest only |
| XML NF-e preview | 🧪 |
| XML → estoque/AP | ❌ |
| Fornecedor CRUD | ✅ |
| Pedido compra | ❌ |
| Entrada estoque manual (compra) | ✅ |
| CP originada compra | ❌ |
| Transportadora | ❌ |
| Import planilha financeiro/fornecedor | ✅ |

## 4–8. Síntese

**Prioridade:** P3 fiscal; P2 compras  
**Complexidade:** Muito alta (fiscal)  
**Recomendação:** XML persist fase B; emissão via parceiro fiscal API

---

# ENTREGÁVEIS FINAIS

## 1. Mapa operacional completo

Ver diagrama na seção inicial + matriz abaixo.

| Módulo operacional | Entrada principal | Persistência autoritativa | Integrações downstream |
|--------------------|-------------------|---------------------------|------------------------|
| PDV Venda | `/dashboard/vendas` | Prisma `Venda` + LS ops | Estoque PUT, CR à prazo, automações |
| Caixa | Modais + APIs caixa | `SessaoCaixa` + LS | Financeiro sangria/suprimento |
| OS | `/dashboard/operacoes-v2` | `OrdemServico` payload | Estoque ledger, CR, Garantia |
| Financeiro | `/dashboard/financeiro-v2` | CR/CP/Movimentações | OS, import, PDV à prazo |
| Estoque | Cadastros + OS + PDV | `Produto.stock` + `MovimentacaoEstoque` | OS ✅, PDV ⚠️ |
| Clientes | `/dashboard/clientes` | `Cliente` | Vendas, OS |
| WhatsApp | `/dashboard/whatsapp` | Conversas/mensagens | Automações parcial |
| Omni Agent | `/dashboard/omni-agent` | Commands/automations | Executor parcial |

---

## 2. Fluxos que funcionam ponta a ponta (com ressalvas documentadas)

1. **OS HUB V2:** abrir → orçamento → aprovar → entregar → estoque ledger + CR (best-effort estoque) ✅⚠️  
2. **Importação GestaoClick planilhas** → cadastros/financeiro ✅  
3. **Entrada/ajuste estoque manual** → ledger + KPIs ✅  
4. **Contas a receber/pagar HUB V2** → baixa/estorno Prisma ✅  
5. **WhatsApp inbox** receber/enviar manual Cloud ✅  
6. **Omni Agent** comando → inbox → executar intent suportado ✅  
7. **PDV Classic/Assistência** venda → DB + histórico ✅⚠️ (sem financeiro à vista, ledger estoque)  
8. **Cadastro cliente** → PDV/OS ✅  
9. **Dashboard elite KPIs** com loja selecionada ✅  

---

## 3. Fluxos quebrados ou incompletos

1. **PDV Black Edition** — pagamento não persiste 🔴  
2. **Venda PDV + falha network** — estoque local sem venda DB 🔴  
3. **Financeiro receita à vista PDV** — inexistente 🔴  
4. **Automações OS no HUB** — eventos não emitidos ❌  
5. **WhatsApp automations system_event** — não envia Cloud de fato ⚠️  
6. **Keyword automations inbound** — não ligado ao webhook ❌  
7. **Recorrência financeira** ❌  
8. **Compras NF-e → estoque/AP** ❌  
9. **CRM timeline/financeiro cliente** ❌  
10. **Marketplace sync real** 🧪  
11. **Fechamento caixa server-authoritative** ⚠️  
12. **Relatórios DRE/fluxo/OS no hub** ❌ UI  

---

## 4. Mocks/localStorage que afetam operação real

| Chave / superfície | Impacto operacional |
|--------------------|---------------------|
| `assistec-pro-ops-v1-{loja}` | Vendas, ledger, créditos cliente |
| `omnigestao:caixa:{storeId}` | Estado caixa intraday |
| `assistec-pro-financeiro-v2-{loja}` | Painéis financeiro legado |
| `assistec-pro-config-v2` | Empresa/assinatura UI |
| `omni.mock.staff.role` | Papel staff sem auth real 🔴 |
| PDV Black cupom/turno LS | Contadores cosméticos |
| `omni-settings` / créditos IA | Plano vs Stripe |
| Marketplace SIM-* IDs | Falsa sensação de publicação |
| `/meu-plano` PIX demo | Assinatura legada |

---

## 5. Duplicidades críticas

| Domínio | Oficial | Paralelo | Impacto |
|---------|---------|----------|---------|
| OS | operacoes-v2 + actions | `/dashboard/os` + REST | Regras/automações divergentes 🔴 |
| Financeiro | financeiro-v2 + APIs | LS stores + painéis legado | Drift saldos 🔴 |
| Estoque baixa OS | os-estoque adapter | os-itens-stock legado | Ledger inconsistente 🔴 |
| PDV | vendas finalize | pdv-github-original | Manutenção dupla |
| Webhook WhatsApp | webhooks/whatsapp | whatsapp/webhook | Confusão deploy |
| Cadastros | cadastros-v2 | cadastros, produtos | UX duplicada |

---

## 6. Riscos multi-loja / storeId

| ID | Risco | Severidade |
|----|-------|------------|
| M1 | Read APIs com fallback cookie/default store | 🔴 |
| M2 | Webhook WhatsApp `WHATSAPP_WEBHOOK_STORE_ID` único | 🔴 |
| M3 | `handle-event` aceita `storeId` no body sem auth | 🔴 |
| M4 | WhatsApp REST sem sessão | 🔴 |
| M5 | LS loja ativa vs cookie drift | ⚠️ |
| M6 | `canAccessStore` permissivo | ⚠️ |

---

## 7. Riscos financeiros

| ID | Risco |
|----|-------|
| F1 | Vendas à vista PDV não geram movimento financeiro |
| F2 | DRE/subreport subestima receita |
| F3 | Caixa local vs sessão server divergente |
| F4 | PDV à prazo híbrido LS + persist |
| F5 | Renegociação não implementada |
| F6 | Fechamento período vs edição OS billing — depende fechamento-service ✅ mas UX incompleta |

---

## 8. Riscos de estoque

| ID | Risco |
|----|-------|
| E1 | PDV reduz estoque local antes de persist — rollback ausente |
| E2 | Sem `MovimentacaoEstoque` PDV — auditoria cega |
| E3 | PUT inventory cego (sem delta/ledger) |
| E4 | Dupla baixa OS (HUB vs legado API) |
| E5 | Sem saída manual server action |
| E6 | Devolução PDV restock só local |

---

## 9. Riscos de permissão / auth

| ID | Risco |
|----|-------|
| A1 | AccessGate mock role em produção |
| A2 | APIs sensíveis sem NextAuth (WhatsApp, automation, elite GET) |
| A3 | Matriz permissões fixa — sem granularidade por loja/ação |
| A4 | PIN legado staff cookies coexistindo |

---

## 10. Top 20 prioridades para ERP SaaS Premium

| # | Prioridade | Item |
|---|------------|------|
| 1 | P0 | Eliminar ou integrar PDV Black (persistência real) |
| 2 | P0 | Transação atômica venda + estoque + financeiro |
| 3 | P0 | Unificar OS — uma UI, um backend, eventos automação |
| 4 | P0 | Remover AccessGate mock / exigir NextAuth produção |
| 5 | P0 | Autenticar `/api/automation/handle-event` + WhatsApp APIs |
| 6 | P0 | Caixa server-authoritative (fim LS operacional) |
| 7 | P1 | Ledger `MovimentacaoEstoque` para PDV |
| 8 | P1 | Materializar receita à vista no financeiro |
| 9 | P1 | Emitir `os_finalizada` no HUB entregue |
| 10 | P1 | Depreciar financeiro-store / painéis LS |
| 11 | P1 | Relatórios hub ← APIs DRE/fluxo/OS |
| 12 | P1 | Webhook WhatsApp multi-loja + automações Cloud reais |
| 13 | P1 | Proteger reads storeId (sem fallback permissivo) |
| 14 | P2 | Saída manual estoque + inventário cíclico |
| 15 | P2 | CRM timeline + CR por cliente |
| 16 | P2 | XML NF-e → entrada estoque + CP |
| 17 | P2 | Módulo compras (PC → recebimento → estoque) |
| 18 | P2 | Omni memória + créditos Stripe sync |
| 19 | P3 | Marketplace OAuth real |
| 20 | P3 | Emissão NF-e/NFC-e |

---

## 11. Roadmap sugerido (ordem de execução)

### Fase 1 — Estabilizar operação real (4–8 semanas)

- Atomicidade PDV venda/estoque/CR  
- Caixa 100% server (`SessaoCaixa` por venda)  
- Auth produção (NextAuth only; fechar handle-event)  
- Despublicar PDV Black ou wire completo  
- Unificar rota OS (redirect + eventos entrega)  
- Proteger APIs read storeId  

**Meta operacional:** loja consegue vender, fechar caixa e entregar OS com números confiáveis no banco.

### Fase 2 — Remover duplicidades / mock (8–12 semanas)

- Retirar financeiro LS e painéis legado  
- Ledger estoque PDV  
- Receita à vista no financeiro  
- Relatórios hub conectados  
- WhatsApp automations envio real + keywords inbound  
- CRM básico (timeline, CR cliente)  
- Import XML persist  

**Meta operacional:** um operador, uma tela, uma fonte de verdade por domínio.

### Fase 3 — Integrações premium (12–20 semanas)

- Marketplace OAuth + sync estoque  
- Omni Agent intents expandidos + memória DB  
- Compras (PC → recebimento)  
- Comissões PDV/OS  
- Conciliação OFX  
- Master Console / dashboard multi-loja consolidado  

**Meta operacional:** diferenciação vs ERP médio (GestãoClick tier intermediário).

### Fase 4 — Fiscal / enterprise (20+ semanas)

- NF-e/NFC-e via parceiro ou SEFAZ direto  
- SPED / manifesto  
- RBAC granular DB  
- SSO + 2FA  
- BI / builder relatórios  

**Meta operacional:** paridade fiscal varejo/assistência Brasil.

---

## Apêndice A — Tabela consolidada por fluxo (12 domínios)

| # | Fluxo | ✅ Real | ⚠️ Parcial | 🧪 Mock | ❌ Falta | 🔴 Crítico |
|---|-------|---------|------------|---------|----------|------------|
| 1 | PDV venda | 5 etapas | 6 | 1 (Black) | 1 | 4 riscos |
| 2 | Caixa | 2 | 7 | 1 | 0 | 2 |
| 3 | OS | 14 | 4 | 2 | 2 | 1 |
| 4 | Financeiro | 8 | 4 | 3 | 3 | 2 |
| 5 | Estoque | 6 | 4 | 1 | 3 | 2 |
| 6 | CRM | 5 | 2 | 0 | 5 | 0 |
| 7 | Marketplace | 3 | 0 | 4 | 2 | 0 |
| 8 | WhatsApp | 4 | 5 | 2 | 3 | 3 |
| 9 | Omni Agent | 7 | 3 | 4 | 2 | 0 |
| 10 | Multi-loja | 4 | 2 | 1 | 0 | 4 |
| 11 | Dashboard/Rel | 5 | 2 | 1 | 4 | 1 |
| 12 | Fiscal/compras | 3 | 2 | 1 | 6 | 0 |

---

## Apêndice B — Referências de código (índice rápido)

| Fluxo | Arquivo âncora |
|-------|----------------|
| PDV | `lib/operations-store.tsx` |
| Caixa | `app/api/ops/caixa/*` |
| OS | `app/actions/operacoes.ts` |
| Estoque OS | `lib/operacoes/adapters/os-estoque.ts` |
| Financeiro OS | `lib/financeiro/adapters/os-faturamento.ts` |
| Estoque manual | `app/actions/estoque.ts` |
| Financeiro HUB | `FinanceiroRealContext.tsx` |
| WhatsApp | `lib/whatsapp-meta-cloud-webhook.ts` |
| Automações | `lib/automation/automation-engine.ts` |
| Omni | `app/actions/omni-agent.ts` |
| Loja | `lib/loja-ativa.tsx` |
| Permissões | `lib/auth/enterprise-permissions.ts` |
| Dashboard | `app/api/dashboard/elite/route.ts` |
| Import/XML | `ImportacaoHub.tsx` |

---

## Apêndice C — Comparação operacional vs GestãoClick (expectativa loja tipo RafaCell)

| Rotina diária | GestãoClick (referência) | OmniGestão hoje |
|---------------|--------------------------|-----------------|
| Abrir loja/caixa | Server | LS + server ⚠️ |
| Vender balcão | Completo + fiscal | Real sem NFC-e ⚠️ |
| OS assistência | Completo | HUB forte ✅ |
| Peças OS baixam estoque | Sim | HUB sim ✅ |
| Contas a receber | Sim | HUB sim ✅ |
| Fluxo caixa/DRE | UI pronta | API sim, UI hub ❌ |
| WhatsApp atendimento | Integrado | Inbox real ✅ |
| Cobrança automática WA | Comum | Parcial ⚠️ |
| Compras + NF entrada | Sim | Manual/XML preview ❌ |
| Multi-loja | Sim | Modelo sim, UX parcial ⚠️ |

---

*Documento gerado por auditoria operacional read-only. Nenhum código foi modificado. Para visão arquitetural complementar, ver [`ERP_AUDITORIA_COMPLETA.md`](./ERP_AUDITORIA_COMPLETA.md) e [`docs/ai/CURRENT_STATUS.md`](../ai/CURRENT_STATUS.md).*
