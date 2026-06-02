---
title: Roadmap — HUB Estoque
hub: estoque
status: vivo
owner: produto + Sonnet (técnico)
last_update: 2026-06-02
sprint_atual: **SPRINT_BL07_FASE1 (Fundação) — 🔄 em andamento (02/06)**; autorização de área protegida concedida; código escrito (models + migração 0011 + services dormentes + backfill + bootstrap), vitest 14/14, `tsc`/`build` pendentes; sem commit (revisão)
---

# 📦 Roadmap — HUB Estoque

> Estrutura conforme [`docs/roadmaps/INDEX.md §2.2`](./INDEX.md). 15 seções obrigatórias.
> Fonte da verdade do estado real: [`docs/ai/CURRENT_STATUS.md`](../ai/CURRENT_STATUS.md).

---

## 1. Visão

> **Saldo real, auditável e atômico — o estoque é alterado apenas via ledger (`MovimentacaoEstoque`), nunca por edição direta de campo.**

Estoque alimenta PDV, OS e Marketplace via consumos auditados. Importação atualiza só cadastral (nome, preço, fornecedor) — **estoque muda só por ledger**.

---

## 2. Objetivos

1. **Ledger é a fonte da verdade** — saldo derivado, nunca escrito diretamente.
2. **Zero baixa silenciosa** — toda movimentação tem origem, usuário, documento, custoUnitario, valorTotal.
3. **Anti-negativo configurável** por loja (bloqueia ou alerta).
4. **Inventário cíclico** com auditoria de divergência.
5. **Multi-loja com transferência rastreada**.

---

## 3. Concorrentes analisados

| Concorrente | O que aprendemos |
|---|---|
| **Bling** | Multi-depósito + transferência — referência forte. |
| **TinyERP** | Inventário rotativo com app — adoção planejada. |
| **MercadoEnvios Full** | Curva ABC visual — inspiração para BI. |
| **NetSuite** | Cost layering (FIFO/Médio) — referência avançada. |
| **Linx** | Códigos de barras múltiplos por SKU — adotar. |

---

## 4. Diferenciais

- **Ledger profissional** com `usuario`, `documento`, `custoUnitario`, `valorTotal`, `origem` (Fase 2 adapter OS→Estoque concluída em 21/05/2026).
- **Importação não sobrescreve estoque** — atualiza só cadastral em produto existente; saldo só no create.
- **Saneamento SKU `gc-`** removido (232 produtos atualizados; conflitos preservados).
- **Item Avulso** (`__avulso__`) pula estoque via `isVirtualSaleLine` — vendas sem cadastro não corrompem ledger.
- **Idempotência** em consumo/restituição/delta da OS.

---

## 5. Gaps atuais

| Gap | Severidade | Origem |
|---|---|---|
| **Sem multi-depósito** real (modelo decidido em ADR-0007; falta implementar — Sprint Fase 0) | 🔴 P0 | gap de produto |
| **Sem transferência entre lojas/depósitos** | 🟡 P1 | gap de produto |
| **Inventário cíclico** inexistente | 🟡 P1 | gap de produto |
| **Curva ABC** ausente | 🟡 P1 | gap de BI |
| **Cost layering** (FIFO, Médio Móvel) — só custo médio implícito | 🟡 P1 | inspeção |
| **Códigos de barras múltiplos** por SKU não suportados | 🟢 P2 | gap de modelo |
| **Etiquetas/impressão** ZPL ainda manual | 🟢 P2 | gap de UX |
| **Conferência de entrada** (NF-e XML → estoque) inexistente | 🟡 P1 | gap de produto |
| **Adapter Marketplace → estoque** ausente (sync de saldo) | 🔴 P0 | dependência Bloco 13 |
| **Alerta de estoque mínimo** simples mas sem trigger automático de compra | 🟡 P1 | gap de produto |

---

## 6. Funcionalidades futuras

| # | Funcionalidade | Prioridade |
|---|---|---|
| 1 | **Multi-depósito** (modelagem `Deposito` + FK em `MovimentacaoEstoque`) | P0 |
| 2 | **Transferência rastreada** entre depósitos/lojas | P1 |
| 3 | **Adapter Marketplace ↔ Estoque** (sync de saldo em tempo real) | P0 |
| 4 | **Inventário cíclico** (lista de produtos a contar; ajuste auditado) | P1 |
| 5 | **Importação NF-e XML** → entrada de estoque com conferência | P1 |
| 6 | **Curva ABC** automática | P1 |
| 7 | **Cost layering** FIFO/Médio configurável por loja | P1 |
| 8 | **Códigos de barras múltiplos** por SKU (EAN, DUN, interno) | P2 |
| 9 | **Etiquetas ZPL** geradas e impressas em 1 clique | P2 |
| 10 | **Sugestão de compra** automática (ponto de pedido + lead time) | P2 |
| 11 | **Lote/validade** para perecíveis | P2 |
| 12 | **Foto + variações** (cor, tamanho) | P2 |

---

## 7. Backlog

| Item | Tamanho | Pré-req |
|---|---|---|
| Modelar `Deposito` + migração de saldos atuais | L | ✅ ADR-0007 (aceito) — Sprint Fase 0 a abrir |
| Adapter `marketplace-estoque.ts` (sync ML/Shopee) | L | Bloco 13 iniciado |
| Parser NF-e XML → entrada com conferência | M | — |
| Tela de inventário cíclico | M | Decisão de UX |
| Curva ABC (cron + view) | M | Vendas dos últimos N dias |
| FIFO opcional por loja (config) | L | Refator do cálculo de custo |
| Suporte a múltiplos códigos de barras | M | Migração de schema |
| Tela de transferência entre depósitos | M | Multi-depósito pronto |

---

## 8. Fases

### Fase 1 — Base estabilizada (~85% feita)
**Objetivo:** ledger profissional + importador defensivo + saneamento SKU.
**Saída:** ✅ adapter OS→Estoque Fase 2 · ✅ importador não sobrescreve · ✅ SKU gc- limpo · ✅ Item Avulso isolado.

### Fase 2 — Multi-depósito
**Objetivo:** modelar `Deposito`, migrar saldos, suportar transferência.
**Modelo decidido:** ✅ **ADR-0007** (2026-06-01) — `Deposito` + `EstoqueSaldo` materializado +
`depositoId` nullable no ledger + `Produto.stock` como cache agregado (aditivo, não-quebrante).
**Fase 0 (arquitetura) ✅ concluída (02/06/2026 · Gate #1A):** dossiê
[`BL07_FASE0_ARQUITETURA.md`](../architecture/estoque/BL07_FASE0_ARQUITETURA.md) (estado atual, gap
analysis, modelo, fluxos, riscos P0–P3) + proposta faseada
[`SPRINT_BL07_FASE1.md`](../sprints/proposals/SPRINT_BL07_FASE1.md).
**Fase 1 (fundação) 🔄 em andamento (02/06):** models `Deposito`+`ProdutoDeposito`, migração aditiva
`0011`, núcleo/service dormentes, backfill + bootstrap escritos; **zero mudança de comportamento**
(PDV/OS/import inalterados; `Produto.stock` intacto). Vitest 14/14; `tsc`/`build` pendentes (dev
server). Seleção de depósito, UI de transferência e reserva Marketplace ficam em fases posteriores (Fase 2/3).
**Saída:** lojas com N depósitos funcionando; transferências auditadas.

### Fase 3 — Conferência e entrada
**Objetivo:** NF-e XML vira entrada de estoque com conferência item a item.
**Saída:** > 80% das entradas via XML; divergências sinalizadas.

### Fase 4 — Inteligência
**Objetivo:** curva ABC, cost layering, sugestão de compra.
**Saída:** dashboards de giro; pedido de compra sugerido por reposição.

### Fase 5 — Físico + variações
**Objetivo:** etiquetas ZPL, múltiplos códigos, lote/validade, variações de produto.

---

## 9. Dependências

| Depende de | Para quê |
|---|---|
| **PDV** | Consome saldo (serial — ver matriz) |
| **OS** | Consome/restitui peças (serial — adapter compartilhado) |
| **Marketplace** | Sincronização bidirecional (serial — proibido em paralelo per matriz §4) |
| **Multi-loja** | Saldo por `storeId` + futuro `depositoId` |
| **BI** | Lê curva ABC, giro, ruptura |

---

## 10. Riscos

| Risco | Categoria | Mitigação |
|---|---|---|
| **Migração para multi-depósito** quebra ledger histórico | Técnico — P0 | Backfill atômico com janela; testes E2E |
| **Sync Marketplace** com latência alta gera oversell | Negócio — P0 | Reserva otimista + queue + retry |
| **FIFO retroativo** recalcula custos passados (afeta DRE) | Técnico — P1 | Aplicar só prospectivo + ADR |
| **NF-e XML mal formada** crash do parser | Técnico — P1 | Validador + quarentena |
| **Importador massivo** sobrescrever silenciosamente | Técnico — P0 | ✅ Travado: chave forte vs fraca, defesa multi-loja em 3 camadas |

> **Análise de risco consolidada da Fase 0 (P0–P3, multi-loja/fiscal/LGPD/concorrência/performance):**
> [`BL07_FASE0_ARQUITETURA.md` — Parte 5](../architecture/estoque/BL07_FASE0_ARQUITETURA.md#parte-5--riscos).
> Destaque: **CONC-02** (drift agravado pelo ledger best-effort da OS) e **MIG-01** (migração) são P0 da Fase 1.

---

## 11. Sprint atual

**`SPRINT_BL07_FASE1` — Fundação multi-depósito · 🔄 EM ANDAMENTO (02/06/2026).** Autorização de área
protegida **concedida**. Implementado (aditivo, zero mudança de comportamento): models
`Deposito`+`ProdutoDeposito`, migração `0011`, núcleo puro `lib/estoque/deposito-core.ts` + service
dormente, `scripts/backfill-deposito.mjs`, hook best-effort em store creation, 14 testes
(**vitest 14/14 ✅**). **Pendente:** `prisma generate` + `npx tsc --noEmit` + `npm run build` (dev
server em uso real trava o generate) e o cutover (`db:push` `0011` + `db:backfill-deposito --exec`).
Marcos: Adapter OS→Estoque Fase 2 (21/05); ADR-0007 Gate #1 (01/06); Fase 0 arquitetura Gate #1A (02/06).
Proposta/dossiê: [`SPRINT_BL07_FASE1.md`](../sprints/proposals/SPRINT_BL07_FASE1.md) ·
[`BL07_FASE0_ARQUITETURA.md`](../architecture/estoque/BL07_FASE0_ARQUITETURA.md).

---

## 12. Status atual

Estoque tem **ledger profissional** com auditoria de usuário/documento/custo, importador defensivo (não sobrescreve), saneamento de SKU concluído e Item Avulso isolado. Maior gap estrutural é a **ausência de multi-depósito** — toda loja opera como "depósito único", o que limita expansão e impossibilita o adapter Marketplace de operar com reserva real. O **modelo já foi decidido** (ADR-0007, 2026-06-01); falta a implementação (Sprint Fase 0, ainda não aberta). Curva ABC, cost layering e conferência via NF-e XML são gaps de inteligência críticos para SMBs que crescem.

---

## 13. Métricas de sucesso

| Métrica | Meta |
|---|---|
| Movimentações sem `usuario`/`documento` | **0/mês** |
| Drift entre soma do ledger e saldo do produto | **0 unidades** |
| Importações que alteraram saldo indevidamente | **0/mês** |
| Oversell (vendido > saldo) pós-Marketplace | **< 0.1%** |
| Taxa de entrada via XML (pós-Fase 3) | **> 80%** |
| Inventário cíclico cobrindo todo catálogo a cada N dias (config) | **100%** |

---

## 14. Blockers

| Blocker | Bloqueia |
|---|---|
| ~~ADR de multi-depósito~~ | ✅ Resolvido — **ADR-0007** aceito (2026-06-01) |
| ~~Fase 0 arquitetura multi-depósito~~ | ✅ Concluída — **Gate #1A** aprovado (2026-06-02) |
| Sprint Fase 1 (Fundação) — 🔄 **em andamento** (código escrito; `tsc`/`build` + cutover pendentes) | Fase 2 / adapter Marketplace |
| Marketplace HUB sem código | Adapter sync |
| Decisão FIFO vs Médio | Fase 4 |

---

## 15. Referências

- **ADRs relacionados:** **ADR-0007** (modelo de depósitos — aceito 2026-06-01) · ADR-0003 (scoping multi-loja) · ADR-0004 (SAFE-lite)
- **Fase 0 (arquitetura · Gate #1A 2026-06-02):** [`docs/architecture/estoque/BL07_FASE0_ARQUITETURA.md`](../architecture/estoque/BL07_FASE0_ARQUITETURA.md) (dossiê D1–D5) · [`docs/sprints/proposals/SPRINT_BL07_FASE1.md`](../sprints/proposals/SPRINT_BL07_FASE1.md) (proposta faseada) · [`README`](../architecture/estoque/README.md)
- **Sprints relacionadas:** entradas "Estoque", "adapter OS→Estoque", "Importador" em `CURRENT_STATUS.md`
- **Docs de módulo:** `docs/modules/` (verificar/criar `ESTOQUE.md`)
- **Memórias persistentes:** `project_sku_gc_saneamento`, `project_import_nao_sobrescreve_estoque`, `project_importador_produtos_lotes`, `project_importador_produtos_match_seguro`
- **Governança:** mudanças em `lib/estoque*` core afetam PDV+OS+Marketplace — exige sincronia.
