---
# IDENTITY
skill_id: SKILL_BENCHMARK_BI
version: v1
status: draft
category: 1
size: S
hub: bi

# CAPABILITIES
modes_allowed: [SAFE, OVERNIGHT, COWORK]
read_only: true
benchmark_required: false

# BOUNDARIES
allowed_paths:
  - "docs/audits/benchmarks/**"
denied_paths:
  - "prisma/schema.prisma"
  - "auth.ts"
  - "auth.config.ts"
  - "proxy.ts"
  - ".env*"
  - "lib/**"
  - "app/**"
  - "components/**"
  - "src/**"
  - "next.config.mjs"
  - "package.json"
  - "tsconfig.json"
expected_diff_max: 0
files_max: 1
duration_max: PT30M
commits_max: 1

# I/O CONTRACT
input:
  required: [sprint_topic]
  optional: [concorrentes_alvo, profundidade, ticket_id]
output:
  artifacts:
    - "docs/audits/benchmarks/BENCHMARK_<ticket_id>.md"

# GOVERNANCE
gates: []
audit_required: false
adr_required: never

# LIFECYCLE
owner: produto + Opus
approved_by: null
approved_at: null
deprecated_by: null
deprecated_at: null
last_review: 2026-05-27

# REFERENCES
roadmap: docs/roadmaps/ROADMAP_BI.md
related_adrs: []
related_memories: []
template_version: v1
---

# SKILL_BENCHMARK_BI

> Skill de pesquisa **contextual por sprint** — extrai aprendizados de plataformas de BI/dashboards para alimentar uma proposta de sprint do HUB BI.
> **BI é read-only — nunca executor, nunca altera sistema.**

---

## 1. Propósito

Pesquisar 3–5 concorrentes (plataformas de BI + dashboards operacionais), extrair **dashboards operacionais, drill-down, métricas por HUB, multi-loja comparativo, filtros, observabilidade, KPIs acionáveis, visão executiva, UX analítica**.

**O que ela NÃO faz:**
- Não escreve código.
- Não sugere mudar BI para "executor" (proibido por roadmap §1).
- Não cobre alertas operacionais via WhatsApp (canal = WhatsApp; alerta como conceito BI sim).
- Não cobre Marketing IA atribuição (cruza — usar SKILL_BENCHMARK_MARKETING_IA).

---

## 2. Quando usar

- Sprint com **painel inicial 100% real** (P0 — substituir mocks).
- Sprint com **materialized views** para KPIs caros.
- Sprint com **comparativo multi-loja** (loja A vs B vs C).
- Sprint com **alertas operacionais** (ruptura, atraso, queda).
- Sprint com **drill-down** (KPI → tabela → registro).
- Sprint com **cohorts** (recompra, retenção).
- Sprint com **time-series** + filtros avançados.
- Sprint com **DRE visual** (cruza com Financeiro Fase 5).
- Sprint com **curva ABC** (cruza com Estoque Fase 4).
- Sprint com **performance por canal** (cruza com Marketplace).

## 3. Quando NÃO usar

- Sprint com **export PDF/Excel** isolado → técnico, sem benchmark.
- Sprint que pretende fazer BI **escrever** algo no sistema → proibido (princípio do roadmap §1).
- Sprint que pretende plugar BI **em um dado que ainda é mock** no HUB origem → fix do mock vem antes (DT-11).

---

## 4. Input contract

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `sprint_topic` | string | sim | Tópico específico | `"Painel inicial 100% real + drill-down em vendas/dia"` |
| `concorrentes_alvo` | string[] | não | Sobrescreve default | `["Metabase", "Power BI"]` |
| `profundidade` | enum | não | `surface` \| `deep` | `surface` |
| `ticket_id` | string | não | Vincula a ticket | `BI-S-001` |

**Concorrentes default (atualizado 2026-05-27):**
- Power BI
- Metabase
- Superset
- Looker
- Mixpanel
- Grafana
- Tableau

**Concorrentes especializados por tópico:**
- Dashboards operacionais + drill-down: Metabase, Power BI, Tableau
- Materialized views + performance: Looker (LookML), Metabase (X-Rays)
- Multi-loja comparativo: Power BI (RLS — Row-Level Security), Tableau
- Cohorts e funis: Mixpanel, Amplitude (referência adicional)
- Alertas operacionais: Grafana (referência infra), Metabase Alerts
- KPIs acionáveis SMB: Metabase, Klipfolio
- Visão executiva: Power BI, Tableau

**Validações:**
- `sprint_topic` não pode ser vazio nem genérico.
- Máx 5 concorrentes.

---

## 5. Output contract

**Artefato:** `docs/audits/benchmarks/BENCHMARK_<ticket_id>.md` (mesma estrutura de `SKILL_BENCHMARK_PDV §5`).

**Seções especiais deste HUB (acrescentar ao artefato quando aplicável):**
- **Modelo de leitura:** SELECT live vs materialized view vs cache; refresh interval; latência típica.
- **Multi-loja:** Row-Level Security observado, comparativo lado a lado, agregação por organização/matriz.
- **Drill-down:** UX padrão (modal, rota, expansão); até que profundidade.
- **Alertas:** regras, dedup, cooldown, canal de saída (e-mail, push, integração).
- **Custo de plataforma:** modelo de cobrança do concorrente (vs nosso modelo Postgres direto).

---

## 6. Fases do pipeline usadas

Mesma matriz de `SKILL_BENCHMARK_PDV §6`.

---

## 7. Comportamento específico

- **BI é leitura, nunca escrita** — qualquer recomendação que viole isso é rejeitada no artefato.
- **Não bloqueia ninguém** (matriz §4 do roadmaps INDEX) — benchmark BI pode rodar em paralelo a sprint de qualquer HUB.
- **Foco em SMB** — Power BI/Tableau são referência de teto, não meta direta; Metabase/Superset são referência operável.
- **Materialized views** é tema recorrente — query > 200ms deve virar materializada (gap atual do roadmap).
- **Risco de "fonte da verdade dupla"** — cuidado: se BI calcula KPI de jeito diferente do HUB origem, drift quebra confiança. Toda recomendação deve garantir mesma lógica.
- **Mock vs real** — banner "DADOS DEMO" se KPI ainda não é real (princípio do roadmap §10).
- **Cohorts/funis** = Mixpanel é referência; muitas vezes excessivo para SMB inicial.

---

## 8. Failure modes específicos

Mesma matriz de `SKILL_BENCHMARK_PDV §8`, com adições:

| Cenário | Ação |
|---|---|
| `sprint_topic` sugere BI executar ação (escrever em outro HUB) | bloqueia; remete para Omni Agent ou Server Action |
| Concorrente é caro/enterprise (Looker, Tableau) | marca: "referência de teto, não meta SMB" |
| Tópico depende de dado que ainda é mock no HUB origem | bloqueia; remete para `SKILL_EXEC_FIX_MOCK` no HUB origem antes |
| Tópico cruza com Marketplace (performance por canal) | sinaliza dependência: Marketplace Fase 1+ pronto |
| Tópico envolve agregação cross-loja | sinaliza dependência: lib `withStoreScope()` ou equivalente (Multi-loja) |

---

## 9. Exemplos de uso

### 9.1 SAFE
```yaml
ticket_id: BI-S-001
skill: SKILL_BENCHMARK_BI
modo: SAFE
input:
  sprint_topic: "Painel inicial 100% real com drill-down"
  concorrentes_alvo: [Metabase, Power BI, Tableau]
  profundidade: surface
```

### 9.2 OVERNIGHT
```yaml
- ticket_id: BI-S-002
  skill: SKILL_BENCHMARK_BI
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    sprint_topic: "Materialized views para KPIs caros + refresh agendado"
```

---

## 10. Referências

- [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md)
- [`docs/execution/SAFE_GUARDS.md`](../../../execution/SAFE_GUARDS.md)
- [`docs/roadmaps/ROADMAP_BI.md`](../../../roadmaps/ROADMAP_BI.md)
- Dívida relacionada: DT-11 (mocks no painel inicial).
- Risco crítico: query pesada em produção (gap roadmap §10).
- Matriz paralelismo: BI não bloqueia ninguém ([`docs/roadmaps/INDEX.md §4`](../../../roadmaps/INDEX.md)).
- Concorrentes default: ver §4.

---

## 11. Notas

- BI é o **HUB que mais valor agrega depois que os outros estão prontos** — não faz sentido benchmarkar BI cross-Marketplace antes de Marketplace Fase 1.
- **Metabase** é provavelmente a melhor referência inicial para SMB (open-source, X-Rays, alertas embarcados).
- **Power BI** brilha em **multi-loja comparativo** (RLS); referência forte quando sprint cruza multi-loja.
- **Grafana** é referência de **infra/alerta** — não é "BI de negócio" tradicional, mas alimenta o engine de alertas operacionais.
- **Tableau/Looker** são teto enterprise; usados pontualmente.
- **Mixpanel** entra quando sprint é especificamente cohorts/funis — fora disso, não.
- **Cuidado especial:** benchmark **não pode sugerir** que BI vire executor — quebraria princípio fundador do HUB (read-only).

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
