---
title: SPRINT_BL07_FASE1 · Estoque Multi-Depósito — plano faseado (Fase 1 = Fundação)
sprint_id: BL07-FASE1
hub: estoque
status: planejada
data_inicio: null
data_fim_prevista: null
data_fim_real: null
owner_humano: Rafael
owner_ia_principal: sonnet
roadmap: docs/roadmaps/ROADMAP_ESTOQUE.md
adrs_relacionados: [ADR-0007, ADR-0003, ADR-0004]
arquitetura: docs/architecture/estoque/BL07_FASE0_ARQUITETURA.md
---

# SPRINT_BL07_FASE1 · Estoque Multi-Depósito — plano faseado

> **Status:** planejada (proposta de Fase 0 — **aguarda Gate #1 / autorização de área protegida**).
> **Objetivo em 1 frase:** implementar a **fundação multi-depósito** (ADR-0007) de forma **aditiva e
> sem mudança de comportamento**, e mapear as fases seguintes (operação, reserva/marketplace,
> inteligência) com estimativa de esforço.
> **Roadmap origem:** [`ROADMAP_ESTOQUE.md`](../../roadmaps/ROADMAP_ESTOQUE.md) — Fase 2 (Multi-depósito).
> **Arquitetura:** [`BL07_FASE0_ARQUITETURA.md`](../../architecture/estoque/BL07_FASE0_ARQUITETURA.md).

> ⚠️ **Esta proposta NÃO autoriza implementação.** Tocar `prisma/schema.prisma` e os services de
> estoque core (PDV/OS/Marketplace) exige **autorização explícita** (CORE_RULES / GOVERNANCA §4 /
> ADR-0007 §5). A proposta existe para o Gate #1 decidir abrir (ou não) a execução.

---

## 1. Por que esta sprint existe

- **Blocker atacado:** **BL-07** (estoque multi-depósito) — *"maior alavanca do projeto"*
  (`BLOCKERS.md §5`). Destrava o adapter Marketplace (BL-03) e toda a Fase 1 do Marketplace.
- **Dívida paga:** **DT-08** (sem multi-depósito).
- **Fase do roadmap:** `ROADMAP_ESTOQUE` Fase 2 (Multi-depósito).
- **Decisão já tomada:** **ADR-0007** (aceito 01/06/2026) — modelo `Deposito` + `EstoqueSaldo`
  materializado + `depositoId` nullable + `Produto.stock` como cache agregado (alternativa C).
- **Pré-condição satisfeita:** WhatsApp multi-loja (F-04) fechou o último vetor `loja-1`; o terreno
  multi-loja está limpo para introduzir a dimensão depósito sem reabrir fallback.

## 2. Mapa das 4 fases (visão única)

| Fase | Nome | Objetivo | Esforço | Pré-requisito | Mapeia |
|---|---|---|:--:|---|---|
| **Fase 1** | **Fundação** | Modelo + migração aditiva + backfill, **zero mudança de comportamento** | **L–XL (~5–8 dias-dev)** | Gate #1 + autorização área protegida | ADR-0007 "Fase 0"; Roadmap Fase 2 (base) |
| **Fase 2** | **Operação** | Seleção de depósito (PDV/OS/entrada/ajuste) + transferência intra-loja + `depositoId` NOT NULL | **L (~4–6 dias)** | Fase 1 estável + smoke loja-piloto | Roadmap Fase 2 (conclusão) |
| **Fase 3** | **Reserva & Marketplace** | `reservado`/`comprometido`/`disponivel` + `ReservaEstoque` + adapter Marketplace anti-oversell + em trânsito | **XL (>8 dias)** | Fase 2 + BL-03 (ADR adapter Marketplace) | Destrava Marketplace Fase 1 |
| **Fase 4** | **Inteligência & Fiscal** | NF-e XML entrada + curva ABC por depósito + cost layering FIFO (opcional) + ponto de pedido | **XL (>8 dias)** | Fase 3 + ADRs (FIFO, provedor fiscal BL-01) | Roadmap Fases 3–4 |

> **Nomenclatura:** "Fase 1" desta proposta **é** a "Fase 0" do ADR-0007 (a fundação). O ADR usa
> "Fase 0" no sentido de *zero mudança de comportamento*; aqui é a **primeira sprint executável**.

---

## 3. FASE 1 — Fundação (detalhada — escopo de sprint)

### 3.1 Escopo fechado

#### Dentro (vai entregar)
- [ ] **Schema aditivo** (`prisma/schema.prisma` + migração `0011_deposito`): `Deposito`,
      `EstoqueSaldo`, `MovimentacaoEstoque.depositoId` **nullable**. Nada existente alterado/dropado.
- [ ] **Service `lib/estoque/deposito-service.ts`** (novo): garantir/seed do **Depósito Padrão** por
      loja; guards (exatamente 1 `isDefault`; default não-deletável; não-deletável com `saldo ≠ 0`).
- [ ] **Service `lib/estoque/saldo-service.ts`** (novo): funções puras que escrevem `EstoqueSaldo`
      **e** atualizam o cache `Produto.stock` **na mesma transação** (helper único reutilizado).
- [ ] **Refactor dos pontos de escrita** para passar pelo helper de saldo, sempre no **depósito
      default**: `app/actions/estoque.ts` (entrada/ajuste), `lib/ops-upsert-venda.ts` (PDV saída),
      `lib/operacoes/adapters/os-estoque.ts` (consumo/restauração/delta).
- [ ] **Anti-negativo por depósito**: estender o predicado atômico (`saldo >= qty` no WHERE) do PDV
      para o `EstoqueSaldo`. **Promover o ledger da OS a atômico** (remover o `try/catch` que engole
      erro — CONC-02).
- [ ] **Script de migração** `scripts/backfill-deposito.mjs`: seed default + backfill `EstoqueSaldo`
      + backfill `depositoId` no ledger + **gate de invariante** (`Σ saldo == Produto.stock` por loja;
      `count(Produto)==count(saldo default)`; 0 `depositoId` nulo).
- [ ] **Testes (Vitest)**: invariante de soma; idempotência mantida; anti-negativo por depósito;
      backfill (incl. produto sem movimento); **guard estático** (nenhuma escrita direta em
      `Produto.stock` fora do helper).
- [ ] **Validação**: `npx tsc --noEmit` + `npm run build` + Vitest verdes + **smoke em loja-piloto**.

#### Fora (explícito — NÃO faz parte da Fase 1)
- Seleção de depósito em qualquer UI (PDV/OS/entrada) → **Fase 2**.
- UI/serviço de **transferência** → Fase 2.
- `reservado`/`comprometido`/`disponivel` e `ReservaEstoque` → **Fase 3**.
- Adapter Marketplace / anti-oversell → **Fase 3**.
- `depositoId` **NOT NULL** (vira passo após confirmar 0 nulos em produção) → Fase 2.
- Transferência **entre lojas** (cross-tenant) → **fora de todo o BL-07**.
- NF-e XML, curva ABC, FIFO → **Fase 4**.

> **Regra:** trocar item dentro × fora exige swap explícito.

### 3.2 Critério de pronto (Definition of Done)
- [ ] `Σ EstoqueSaldo.saldo` por loja **== `Produto.stock`** para 100% dos produtos (**drift = 0**).
- [ ] **0** movimentações com `depositoId` nulo após backfill.
- [ ] Cada loja com **exatamente 1** `Deposito isDefault=true`.
- [ ] PDV/OS/importador com **comportamento idêntico** ao pré-migração (suíte de regressão verde).
- [ ] `npx tsc --noEmit` verde · `npm run build` verde · Vitest verde (novos + existentes).
- [ ] Migração aplicada em dev (`db:push`/`db:migrate`) + backfill com invariante 100% verde.
- [ ] `CURRENT_STATUS.md` + `ROADMAP_ESTOQUE` (§8/§11/§14) + `BLOCKERS` (BL-07) + `DIVIDA_TECNICA`
      (DT-08) atualizados.
- [ ] Memória persistida (`project_estoque_multi_deposito_fundacao` ou similar).
- [ ] Relatório de encerramento (§6 deste arquivo) preenchido.

### 3.3 Plano de execução (Fase 1)

| # | Tarefa | Owner | Estimativa | Notas |
|---|---|---|:--:|---|
| 1 | Schema `Deposito`+`EstoqueSaldo`+`depositoId` + migração `0011_deposito` | Sonnet | **M** | área protegida — exige autorização |
| 2 | `deposito-service.ts` (seed default + guards de invariante) | Sonnet | **M** | 1 `isDefault`/loja; não-deletável |
| 3 | `saldo-service.ts` (helper único saldo+cache na mesma tx) | Sonnet | **M** | base de todos os fluxos |
| 4 | Refactor entrada/ajuste (`app/actions/estoque.ts`) p/ helper | Sonnet | **M** | custo médio agora por depósito |
| 5 | Refactor PDV saída (`ops-upsert-venda.ts`) — anti-negativo por depósito | Sonnet | **M** | área crítica; preservar DT-B |
| 6 | Refactor OS adapter — saldo por depósito + **ledger atômico** | Sonnet | **L** | corrige best-effort (CONC-02); cobre delta/restore |
| 7 | Script `backfill-deposito.mjs` + gate de invariante | Sonnet | **M** | transacional; rollback se invariante falhar |
| 8 | Testes (invariante, idempotência, anti-negativo, backfill, guard estático) | Sonnet | **L** | rede de segurança obrigatória |
| 9 | Validação (`tsc`/`build`/`vitest`) + smoke loja-piloto + docs | Sonnet + Rafael | **M** | janela de observação 1 sprint |

> S = ½ dia · M = 1–2 dias · L = 3–5 dias · XL = > 5 dias. **Total estimado Fase 1: ~5–8 dias-dev (L–XL).**

### 3.4 Riscos da Fase 1
| Risco | Prob. | Impacto | Mitigação | Ref dossiê |
|---|---|---|---|---|
| Backfill corrompe ledger histórico | baixa | **alto** | DDL aditiva + backfill transacional + gate de invariante | MIG-01 |
| Drift saldo×cache (agravado pelo ledger best-effort da OS) | média | **alto** | saldo+cache na mesma tx + promover OS a atômico + reconciliação | CONC-02 |
| Race de 2 baixas no mesmo (produto, depósito) | média | alto | predicado `saldo>=qty` no WHERE (estende DT-B) | CONC-01 |
| Produto novo sem linha de saldo default | média | médio | `EstoqueSaldo` lazy no create/1º movimento | MIG-02 |
| Regressão de comportamento no PDV/OS | baixa | alto | DoD exige "comportamento idêntico" + suíte de regressão | — |

---

## 4. FASE 2 — Operação multi-depósito (outline)

- **Objetivo:** tornar o multi-depósito **operável** — selecionar depósito por contexto e mover saldo.
- **Entregáveis:**
  - Seleção de depósito em PDV (via `PdvTerminal`→depósito), OS (bancada), entrada e ajuste.
  - `TransferenciaEstoque` (header + par de lançamentos atômicos, `localKey`, status simples).
  - `depositoId` **NOT NULL** (após confirmar 0 nulos em produção).
  - Ajuste/inventário **por depósito**.
- **Pré-requisito:** Fase 1 estável + smoke OK.
- **Esforço:** **L (~4–6 dias)**. **Riscos-chave:** CONC-03 (double-submit transferência), MLOJA-02
  (transferência confundida com cross-loja), RT-06 (custo de transferência).

## 5. FASE 3 — Reserva & Marketplace (outline)

- **Objetivo:** estoque **virtual** (disponível = saldo − reservado − comprometido) + **anti-oversell**.
- **Entregáveis:**
  - `EstoqueSaldo.reservado`/`comprometido` (aditivo) + `disponivel` derivado.
  - `ReservaEstoque` (ledger de reservas, idempotente por `localKey`, com `expiraEm` + job de expiração).
  - **Adapter `lib/marketplace/adapters/marketplace-estoque.ts`**: reserva otimista no pedido externo;
    baixa no commit; publica `disponivel` do depósito do canal; fila + retry.
  - **Em trânsito** via `TransferenciaEstoque.status = em_transito` (recebimento credita destino).
- **Pré-requisito:** Fase 2 + **BL-03** (ADR de arquitetura do adapter Marketplace).
- **Esforço:** **XL (>8 dias)**. **Riscos-chave:** NEG-01/R-05 (oversell), CONC-04 (reserva concorrente).

## 6. FASE 4 — Inteligência & Fiscal (outline)

- **Objetivo:** inteligência de estoque + entrada fiscal.
- **Entregáveis:**
  - **NF-e XML → entrada** com conferência item-a-item (depósito de recebimento) + quarentena.
  - **Curva ABC** por depósito (cron + view).
  - **Cost layering FIFO** opcional por loja — **exige ADR próprio** (custo retroativo afeta DRE; só prospectivo).
  - **Ponto de pedido / sugestão de compra** (lead time + estoque mínimo).
- **Pré-requisito:** Fase 3 + **BL-01** (provedor fiscal, para o casamento fiscal) + ADR FIFO.
- **Esforço:** **XL (>8 dias)**. **Riscos-chave:** FISC-03/FISC-05 (XML/FIFO), PERF-04 (sync).

---

## 7. Riscos identificados (sprint — consolidado)

> Detalhe completo e classificação P0–P3 em
> [`BL07_FASE0_ARQUITETURA.md` Parte 5](../../architecture/estoque/BL07_FASE0_ARQUITETURA.md#parte-5--riscos).

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Migração quebra ledger (MIG-01) | baixa | alto | aditiva + transacional + gate de invariante |
| Drift saldo×cache / OS best-effort (CONC-02) | média | alto | mesma tx + OS atômica + reconciliação |
| Oversell pós-Marketplace (NEG-01/R-05) | média | alto | reserva otimista só na Fase 3; não antecipar adapter |
| Vazamento cross-tenant via depósito (MLOJA-01) | baixa | alto | `storeId` FK + `@@unique([storeId,nome])` + `where storeId` |
| Performance de leitura por depósito (PERF-01) | baixa | médio | materializado + cache agregado (leitura O(1) intacta) |

---

## 8. Dependências

| Depende de | Para quê |
|---|---|
| **Autorização de área protegida** (humano) | tocar `schema.prisma` + services core |
| **Gate #1** | aprovar abertura da Fase 1 |
| BL-03 (ADR adapter Marketplace) | **Fase 3** (não bloqueia Fase 1/2) |
| BL-01 (provedor fiscal) | **Fase 4** (entrada NF-e) |
| ADR FIFO (a criar) | **Fase 4** (cost layering) |

---

## 9. Diário da sprint (preencher durante)

### YYYY-MM-DD — <quem>
- <ação>

---

## 10. Relatório de encerramento (preencher no fim)

### 10.1 O que foi entregue
- <…>
### 10.2 O que ficou fora (e por quê)
- <…>
### 10.3 Aprendizados
- <…>
### 10.4 Decisões tomadas
- ADR-0007 implementado; novas decisões: <…>
### 10.5 Memórias persistidas
- `memory/<slug>.md`
### 10.6 Métricas
- Estimado vs real · drift pós-migração · cobertura de testes
### 10.7 Próximos passos
- Abrir Fase 2 (Operação multi-depósito).

---

## 11. Referências
- Arquitetura: [`docs/architecture/estoque/BL07_FASE0_ARQUITETURA.md`](../../architecture/estoque/BL07_FASE0_ARQUITETURA.md)
- ADR: [`ADR-0007`](../../decisions/ADR-0007-modelo-depositos.md) · [`ADR-0003`](../../decisions/ADR-0003-eliminar-fallback-legacy-primary-store-id.md) · [`ADR-0004`](../../decisions/ADR-0004-safe-lite-modo-padrao.md)
- Roadmap: [`ROADMAP_ESTOQUE.md`](../../roadmaps/ROADMAP_ESTOQUE.md)
- Blockers: BL-07, BL-03 · Dívida: DT-08, DT-06
- Template: [`docs/sprints/TEMPLATE_SPRINT.md`](../TEMPLATE_SPRINT.md)

---

## 12. Imutabilidade pós-encerramento
Após `status = encerrada`: conteúdo não é editado (exceto typo); mudança de direção → nova sprint
referenciando esta. Esta é uma **proposta** — vira sprint executável apenas após Gate #1.
