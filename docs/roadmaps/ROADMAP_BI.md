---
title: Roadmap — HUB BI / Dashboards / Analytics
hub: bi
status: vivo
owner: produto + Sonnet (técnico)
last_update: 2026-05-27
sprint_atual: nenhuma (a iniciar)
---

# 📊 Roadmap — HUB BI

> Estrutura conforme [`docs/roadmaps/INDEX.md §2.2`](./INDEX.md). 15 seções obrigatórias.
> Fonte da verdade do estado real: [`docs/ai/CURRENT_STATUS.md`](../ai/CURRENT_STATUS.md).

---

## 1. Visão

> **Camada transversal de leitura agregada — KPIs por loja, comparativos multi-loja, alertas operacionais e cohorts de cliente — sem nunca bloquear evolução de outros HUBs.**

BI é **leitura, nunca escrita** — não bloqueia nada. Alimenta o painel inicial, dashboards executivos, alertas operacionais (ruptura, vencimento, atraso) e cohorts (recompra, churn).

---

## 2. Objetivos

1. **Leitura agregada barata** — queries com materialized views ou cache, não SELECT em produção 24/7.
2. **Cross-HUB** — KPI cruza PDV, OS, Financeiro, Estoque, Marketing.
3. **Multi-loja comparativo** — loja A vs B vs C lado a lado.
4. **Alertas operacionais** — ruptura, atraso, queda de venda, churn.
5. **Drill-down** — KPI → tabela detalhada → registro.

---

## 3. Concorrentes analisados

| Concorrente | O que aprendemos |
|---|---|
| **Metabase / Superset** | UI de dashboard self-service — referência. |
| **PowerBI** | Drill-down rico — referência avançada. |
| **Looker** | Modelagem semântica (LookML) — útil para padronização. |
| **Bling Painel** | Simples, focado em SMB — baseline. |
| **Mixpanel** | Cohorts e funis — referência para CRM analytics. |

---

## 4. Diferenciais (planejados)

- **Painel inicial pronto** — KPI cards com dados reais (não mock).
- **Comparativo multi-loja** nativo — não precisa ferramenta externa.
- **Alertas push** (badge no header, notificação PWA, WhatsApp).
- **Cohorts integrados ao CRM** — segmento → segmento + métrica de retenção.
- **Sem ETL externo** — leitura direta no Postgres com views materializadas.
- **Performance** — query > 200ms vira material view.

---

## 5. Gaps atuais

| Gap | Severidade |
|---|---|
| **Painel inicial ainda parcial** — mocks misturados com dados reais | 🔴 P0 |
| **Sem materialized views** — toda agregação roda em SELECT live | 🟡 P1 |
| **Cohorts inexistentes** | 🟡 P1 |
| **Sem alertas operacionais** automáticos | 🟡 P1 |
| **Multi-loja comparativo** inexistente | 🟡 P1 |
| **Drill-down** ausente | 🟡 P1 |
| **Export PDF/Excel** ainda manual | 🟢 P2 |
| **Sem time-series real** (vendas por hora/dia/semana com filtros) | 🟡 P1 |
| **Forecast** (próximos 30/60/90 dias) inexistente | 🟢 P2 |

---

## 6. Funcionalidades futuras

| # | Funcionalidade | Prioridade |
|---|---|---|
| 1 | **Painel inicial real** (substituir mocks) | P0 |
| 2 | **Materialized views** para KPIs caros | P1 |
| 3 | **Comparativo multi-loja** | P1 |
| 4 | **Alertas operacionais** (ruptura, atraso, queda) | P1 |
| 5 | **Drill-down** (KPI → tabela → registro) | P1 |
| 6 | **Cohorts** (recompra, retenção) | P1 |
| 7 | **Time-series** com filtros | P1 |
| 8 | **DRE visual** (com Financeiro Fase 5) | P1 |
| 9 | **Curva ABC** (com Estoque Fase 4) | P1 |
| 10 | **Performance por canal** (com Marketplace) | P1 |
| 11 | **Export PDF/Excel** padronizado | P2 |
| 12 | **Forecast IA** | P2 |

---

## 7. Backlog

| Item | Tamanho | Pré-req |
|---|---|---|
| Auditar mocks no painel inicial + mapear queries reais | M | Acesso ao painel |
| Modelar materialized views (vendas/dia, ticket médio, ruptura) | M | Decisão de refresh interval |
| Tela comparativo multi-loja (vendas + ticket + margem) | M | Multi-loja base |
| Engine de alertas (regra + canal + dedup) | L | WhatsApp Fase 2 |
| Cohorts CRM (recompra 30/60/90) | M | CRM Fase 2 |
| Time-series componente reutilizável (Recharts/Chart.js) | S | — |
| Drill-down padrão (modal/rota) | M | — |

---

## 8. Fases

### Fase 1 — Painel real
**Objetivo:** painel inicial sem mocks.
**Saída:** todos os cards do painel inicial puxam dados reais.

### Fase 2 — Multi-loja + comparativo
**Objetivo:** loja A vs B vs C lado a lado + drill-down.

### Fase 3 — Alertas + cohorts
**Objetivo:** ruptura/atraso/churn detectados; cohort CRM em produção.

### Fase 4 — Avançado
**Objetivo:** DRE visual, curva ABC, performance marketplace, export.

### Fase 5 — Inteligência
**Objetivo:** forecast IA, sugestões automáticas, anomaly detection.

---

## 9. Dependências

| Depende de | Para quê |
|---|---|
| **PDV** | Vendas (KPI principal) |
| **OS** | Ticket de serviço, SLA |
| **Financeiro** | DRE, fluxo, recebimentos |
| **Estoque** | Ruptura, giro, curva ABC |
| **CRM** | Cohorts, churn, LTV |
| **WhatsApp** | Tempo de resposta, atendimentos |
| **Marketplace** | Performance por canal |
| **Marketing IA** | ROI por campanha |
| **Multi-loja** | Toda agregação por `storeId` ou cross-loja |

**Não bloqueia ninguém** — BI é leitura. Pode evoluir em paralelo a qualquer HUB (matriz §4 do INDEX).

---

## 10. Riscos

| Risco | Categoria | Mitigação |
|---|---|---|
| **Query pesada em produção** trava banco | Técnico — P0 | Materialized views + refresh agendado |
| **Vazamento entre lojas** (KPI cross-loja sem filtro) | Negócio — P0 | Lib helper `withStoreScope()` obrigatória |
| **Alerta disparando em loop** estraga relacionamento | Operacional — P1 | Dedup + cooldown por regra |
| **Mock vs real** confunde decisão de negócio | Negócio — P0 | Banner "DADOS DEMO" em qualquer mock remanescente |
| **Inconsistência** entre painel e fonte | Técnico — P1 | Reconciliação noturna + alerta de drift |

---

## 11. Sprint atual

**Nenhuma.** Próxima sugerida: **SPRINT_NN_BI — Painel inicial 100% real** (Fase 1).

---

## 12. Status atual

BI ainda **não existe como HUB próprio** — está espalhado: painel inicial misturado com mocks, financeiro-v2 mock, sem materialized views. É **o HUB que mais valor agrega depois que os outros estão prontos** — KPIs cruzados só fazem sentido com dados reais nos HUBs origem. Recomendação: priorizar Fase 1 (limpar mocks do painel) em paralelo à evolução dos outros HUBs (BI não bloqueia ninguém).

---

## 13. Métricas de sucesso

| Métrica | Meta |
|---|---|
| Mocks no painel inicial | **0** (pós-Fase 1) |
| Latência mediana de KPI | **< 300 ms** |
| Drift entre KPI agregado e contagem real | **< 0.1%** |
| Alertas falsos positivos | **< 5%** |
| Tempo médio do operador para chegar ao registro (drill-down) | **< 10s** |

---

## 14. Blockers

| Blocker | Bloqueia |
|---|---|
| Mocks no painel inicial sem mapeamento | Fase 1 |
| WhatsApp Fase 2 (canal de alerta) | Alertas via WhatsApp |
| Marketplace HUB | Performance por canal |

---

## 15. Referências

- **ADRs relacionados:** ADR materialized views + refresh strategy (a criar)
- **Sprints relacionadas:** — (nenhuma dedicada ainda)
- **Docs de módulo:** — (a criar `docs/modules/BI.md`)
- **Memórias persistentes:** — (nenhuma)
- **Governança:** BI é leitura — pode evoluir em paralelo; cuidado com queries pesadas em produção.
