# 📦 BL-07 · Estoque Multi-Depósito — Pacote Fase 0

> **Fase 0 = arquitetura e planejamento.** Nenhuma implementação, migração ou alteração de
> schema/APIs/produção. Entrada de execução continua gated (Gate #1 + autorização de área protegida).

## Documentos

| Doc | Conteúdo | Entregáveis |
|---|---|---|
| [`BL07_FASE0_ARQUITETURA.md`](./BL07_FASE0_ARQUITETURA.md) | Dossiê de arquitetura | **D1** estado atual · **D2** gap analysis · **D3** modelo multi-depósito · **D4** fluxos · **D5** riscos (P0–P3) |
| [`../../sprints/proposals/SPRINT_BL07_FASE1.md`](../../sprints/proposals/SPRINT_BL07_FASE1.md) | Plano de execução faseado | **D6** Fase 1 (Fundação) detalhada + Fases 2–4 com esforço |

## Decisão de base

- **[ADR-0007 · Modelo de Depósitos](../../decisions/ADR-0007-modelo-depositos.md)** — aceito no Gate #1
  (01/06/2026). Modelo: `Deposito` + `EstoqueSaldo` materializado + `depositoId` nullable +
  `Produto.stock` como cache agregado (alternativa C — aditiva, não-quebrante).

## Resumo em 5 pontos

1. **Hoje:** estoque single-depósito implícito (`Produto.stock` único + ledger `MovimentacaoEstoque`
   sem `depositoId`). Sem reserva/comprometido/disponível/em trânsito. Marketplace **não** sincroniza saldo.
2. **Gap-chave:** multi-depósito (P0, destrava BL-03/Marketplace), reserva anti-oversell, NF-e XML,
   curva ABC, cost layering — frente a Bling/Tiny (paridade SMB) e Linx/NetSuite (teto).
3. **Modelo-alvo:** fundação do ADR-0007 + extensão para `reservado`/`comprometido`/`disponivel`
   (`= saldo − reservado − comprometido`) e transferência com `em_transito` (fases posteriores).
4. **Riscos top:** migração (MIG-01), drift saldo×cache agravado pelo **ledger best-effort da OS**
   (CONC-02), anti-negativo por depósito (CONC-01), oversell Marketplace (NEG-01/R-05) — todos P0.
5. **Plano:** Fase 1 Fundação (L–XL, zero mudança de comportamento) → Fase 2 Operação → Fase 3
   Reserva & Marketplace → Fase 4 Inteligência & Fiscal.

## Próximo passo

**Gate #1:** decidir abrir a **Fase 1** (`SPRINT_BL07_FASE1`) e conceder autorização explícita para
tocar `prisma/schema.prisma` + services de estoque core. Só então a execução escreve código.
