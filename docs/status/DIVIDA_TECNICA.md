---
title: Dívida Técnica — Tracking vivo
status: vivo
owner: produto + Sonnet
last_update: 2026-05-27
fonte_overview: docs/ai/CURRENT_STATUS_OVERVIEW.md §5
---

# 🧾 Dívida Técnica — Tracking vivo

> **O que é dívida técnica aqui:** atalho consciente assumido para entregar antes, com custo de manutenção a pagar depois.
> **O que NÃO é dívida técnica:** bug em produção (vai para `BLOCKERS.md`), risco (vai para `RISCOS.md`), mock UI (vai para `MOCKS_TRACKING.md`).

> **Atualização obrigatória:** ao abrir/encerrar sprint que cria ou paga dívida.

---

## 1. Convenção

### 1.1 Severidade
- **P0** — bloqueia release / risco financeiro/fiscal / vazamento → pagar < 7 dias
- **P1** — alto custo de manutenção → pagar < 30 dias
- **P2** — incomoda, não trava → próximo ciclo
- **P3** — melhoria → quando der

### 1.2 Estados
- 🆕 nova · ⏳ pendente · 🔄 em pagamento (sprint ativa) · ✅ paga · 🚫 aceita (decisão consciente, não paga)

### 1.3 Naming
`DT-<NN>` sequencial. Não reordenar (id é estável).

---

## 2. Dívidas ativas

| # | Título | HUB | Severidade | Estado | Aberta em | Sprint alvo | Notas |
|---|---|---|---|---|---|---|---|
| DT-01 | PDV Next (Black Edition) sem persistência server-side | PDV | P0 | ⏳ | 2026-05-19 | SPRINT_NN_PDV | localStorage only; risco de venda perdida |
| DT-02 | `/dashboard/financeiro-v2` ainda mock | Financeiro | P1 | ⏳ | 2026-04-xx | SPRINT_NN_FINANCEIRO | UI Lovable pronta, dados parciais |
| DT-03 | Fallback `storeId = "loja-1"` silencioso | Multi-loja | P0 | ⏳ | herdada | SPRINT_NN_MULTI_LOJA | Risco LGPD/legal |
| DT-04 | Rota legada `/dashboard/os` paralela à oficial | Operações/OS | P1 | ⏳ | 2026-04-xx | SPRINT_NN_OS | ADR-0001 diz que oficial é `/operacoes-v2` |
| DT-05 | PIN supervisor contra `User.pin` (não `AdminUser`) | PDV / Auth | P1 | ⏳ | 2026-05-xx | a planejar | Memória `project_vendas_hub_correcao_operacional` |
| DT-06 | Item Avulso sem CFOP/categoria padrão | PDV | P2 | ⏳ | 2026-05-23 | bloqueia Fase 2 fiscal PDV | — |
| DT-07 | Webhook WhatsApp por env fixo (não por `phone_number_id`) | WhatsApp / Multi-loja | P1 | ⏳ | 2026-05-09 | a planejar | Vira P0 quando 2ª loja ligar WhatsApp |
| DT-08 | Sem multi-depósito no Estoque | Estoque | P0 | ⏳ | herdada | SPRINT_NN_ESTOQUE | Bloqueia adapter Marketplace |
| DT-09 | budget-policy-service com regras hardcoded | OS | P1 | ⏳ | herdada | a planejar | Falta UI por loja |
| DT-10 | Pool de executores Omni Agent pequeno | Omni Agent | P1 | ⏳ | herdada | a planejar | Só `recebimentoFinanceiro` real |
| DT-11 | Painel inicial com mocks misturados | BI | P0 | ⏳ | herdada | SPRINT_NN_BI | Confunde decisão de negócio |
| DT-12 | Mocks no `lib/utils.ts` Lovable excluídos do tsc | Lovable | P3 | 🚫 | herdada | aceito | Decisão de isolamento documentada no CLAUDE.md |

---

## 3. Dívidas pagas (histórico — últimos 90 dias)

| # | Título | Paga em | Sprint que pagou |
|---|---|---|---|
| (em branco — começar a registrar ao pagar) | | | |

---

## 4. Dívidas aceitas (não pagar — decisão consciente)

| # | Título | Razão | ADR |
|---|---|---|---|
| DT-12 | Mocks Lovable excluídos do tsc | Isolamento intencional do hub; benefício > custo | — (decisão documentada no CLAUDE.md) |

---

## 5. Como abrir uma nova dívida

1. Identifique o atalho assumido **na própria sprint que cria** (não esquecer).
2. Adicione linha em §2 com próximo `DT-NN`.
3. Referencie no §7 do relatório de encerramento da sprint.
4. Atualize `CURRENT_STATUS_OVERVIEW.md §5` se for P0/P1.

---

## 6. Como pagar uma dívida

1. Sprint dedicada ou item dentro de sprint maior.
2. Mover da tabela §2 para §3 com data e sprint.
3. Atualizar roadmap do HUB (remover do "gaps").
4. Atualizar `CURRENT_STATUS_OVERVIEW.md §5`.

---

## 7. Fonte da verdade

- **Tracking de dívida:** este arquivo.
- **Overview:** `docs/ai/CURRENT_STATUS_OVERVIEW.md §5`.
- **Detalhe por HUB:** `docs/roadmaps/ROADMAP_<HUB>.md §5 (gaps)`.
