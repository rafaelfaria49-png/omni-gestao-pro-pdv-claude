---
# IDENTITY
skill_id: SKILL_AUDIT_BI
version: v1
status: draft
category: 1
size: S
hub: bi

# CAPABILITIES
modes_allowed: [SAFE, OVERNIGHT, COWORK, AUDIT]
read_only: true
benchmark_required: false

# BOUNDARIES
allowed_paths:
  - "docs/audits/**"
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
duration_max: PT1H
commits_max: 1

# I/O CONTRACT
input:
  required: [audit_type]
  optional: [scope_paths, ticket_id, sprint_topic, since_version]
output:
  artifacts:
    - "docs/audits/AUDITORIA_BI_v<NN>.md"
    - "docs/audits/AUDIT_<ticket_id>.md"

# GOVERNANCE
gates: []
audit_required: false
adr_required: never

# LIFECYCLE
owner: produto + Sonnet
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

# SKILL_AUDIT_BI

> Skill de auditoria do **estado real** do HUB BI. **Read-only, observacional, sem mutation, sem execução.**
> Foco em **KPI drift, origem dos dados, dashboards fake, mocks, divergência visual vs fonte, multi-loja, filtros, performance, agregações, consistência, atualização, integridade analítica**.
> Auditoria mais **leve e objetiva** que outros HUBs.

---

## 1. Propósito

Auditar BI de forma técnica e objetiva: lê código (`components/dashboard/painel-inicial/**`, dashboards do `financeiro-v2`, `operacoes-v2`, qualquer view BI existente, futuros `lib/bi*`), governança, memórias e auditorias anteriores; gera `AUDITORIA_BI_v<NN>.md`.

**Diferença vs SKILL_BENCHMARK_BI:**
- BENCHMARK olha mercado (Metabase, Power BI, Tableau…).
- AUDIT olha estado real interno (mocks vs real no painel inicial, drift entre KPI agregado e fonte, materialized views).

**O que ela NÃO faz:**
- Não altera código, não cria materialized view, não decide refresh strategy (ADR futuro).
- Não toca camada de origem (mocks no HUB origem viram fix por SKILL_EXEC_FIX_MOCK lá, não aqui).
- Não vira executor (BI é read-only por princípio).

---

## 2. Quando usar

### 2.1 Standalone
- A cada **trimestre** (saúde geral + drift KPI vs fonte).
- Após **substituição de mocks** (DT-11) — confirmar que painel agora é real.
- Antes de **liberar painel matriz** (auditoria preventiva).
- Após **incidente de decisão errada baseada em dado** (forense — KPI estava errado).

### 2.2 Sprint-scoped (Fase 12)
- Pós-impl de qualquer sprint do BI.

---

## 3. Quando NÃO usar

- Para mapear features novas (DRE, cohorts) → benchmark.
- Para auditar dado de origem (vendas, financeiro) → use AUDIT do HUB origem.
- Sem `audit_type` → rejeita.

---

## 4. Input contract

Mesma matriz de `SKILL_AUDIT_PDV §4`.

| Campo | Tipo | Obrig | Exemplo |
|---|---|---|---|
| `audit_type` | enum | sim | `dados` (drift, mocks), `performance` (query lenta), `saude_geral` |
| `scope_paths` | string[] | não | `["components/dashboard/painel-inicial/**", "app/dashboard/financeiro-v2/**"]` |
| `ticket_id` | string | não | `BI-S-001` |
| `sprint_topic` | string | não | `"painel inicial 100% real"` |
| `since_version` | string | não | `v1` |

---

## 5. Output contract

Mesma estrutura de `SKILL_AUDIT_PDV §5`. Output: `AUDITORIA_BI_v<NN>.md` ou `AUDIT_<ticket_id>.md`.

**Seção OBRIGATÓRIA adicional (integridade analítica):**
- Inventário de KPIs visíveis no painel inicial + status (real / mock / parcial).
- Cross-reference com `MOCKS_TRACKING.md` (MOCK-NN ativos).
- Drift entre KPI agregado e contagem real da fonte (queries de verificação).
- Latência típica por KPI (alvo < 300ms — gap esperado).
- Multi-loja: KPI cross-loja respeita `storeId`? sem vazamento?

---

## 6. Fases do pipeline usadas

Mesma matriz de `SKILL_AUDIT_PDV §6`.

---

## 7. Comportamento específico — foco BI

A skill audita obrigatoriamente as **10 dimensões críticas**:

1. **KPI drift** — KPI exibido = soma real da fonte? amostragem em N KPIs aleatórios.
2. **Origem dos dados** — cada card/dashboard rastreável a query no banco? sem "campo mágico"?
3. **Dashboards fake** — quais ainda exibem mock? cross-ref `MOCKS_TRACKING.md`.
4. **Mocks** — banner "DADOS DEMO" presente onde aplicável? (princípio do roadmap §10).
5. **Divergência visual vs fonte** — gráfico mostra X mas tabela detalhada mostra Y?
6. **Multi-loja** — KPI cross-loja usa `withStoreScope()` ou helper equivalente? `loja-1` aparece como filtro?
7. **Filtros** — filtros (período, loja, categoria) funcionam? combinam corretamente?
8. **Performance** — KPIs com query > 300ms? candidatos a materialized view?
9. **Agregações** — `sum`, `count`, `avg` consistentes com fonte? edge cases (nulo, soft-deleted) tratados?
10. **Atualização** — dado de "hoje" mostra "hoje"? cache TTL respeitado? refresh manual disponível?

**Auditorias prévias:** nenhuma dedicada ainda.

---

## 8. Failure modes específicos

| Cenário | Ação |
|---|---|
| KPI mostra valor diferente da soma real da fonte (> 0.1% drift) | finding **P0** (decisão errada possível) |
| Mock sem banner "DADOS DEMO" em rota produtiva | finding **P0** (princípio do roadmap §10) |
| KPI cross-loja sem `storeId` filter (vazamento) | finding **P0** (multi-loja) |
| Query > 1s em painel principal | finding P1 (performance) |
| Filtro de período não respeita timezone (Brasília -03:00) | finding P1 (drift sutil) |
| Dado "hoje" mostra dado de 24h atrás (cache não respeitado) | finding P1 (atualização) |
| BI tentando escrever em algum HUB (executor disfarçado) | finding **P0** (princípio fundador BI quebrado) |

---

## 9. Exemplos de uso

### 9.1 SAFE — Auditoria de drift KPI
```yaml
ticket_id: null
skill: SKILL_AUDIT_BI
modo: SAFE
input:
  audit_type: dados
  scope_paths: ["components/dashboard/painel-inicial/**"]
```

### 9.2 OVERNIGHT — Auditoria de performance
```yaml
- ticket_id: null
  skill: SKILL_AUDIT_BI
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    audit_type: performance
    sprint_topic: "mapear KPIs candidatos a materialized view"
```

---

## 10. Referências

- [`docs/governance/AUDIT_PROTOCOL.md`](../../../governance/AUDIT_PROTOCOL.md)
- [`docs/audits/TEMPLATE_AUDITORIA.md`](../../../audits/TEMPLATE_AUDITORIA.md)
- [`docs/roadmaps/ROADMAP_BI.md`](../../../roadmaps/ROADMAP_BI.md)
- Dívida relacionada: DT-11 (mocks no painel inicial).
- Mocks: MOCK-03 (painel inicial — alguns KPI cards, risco 🔴).
- Auditorias prévias: **nenhuma dedicada ainda**.

---

## 11. Notas

- BI é HUB **mais leve para auditar** — read-only puro, sem efeito colateral, sem urgência fiscal/financeira direta (mas KPI errado leva a decisão errada — P0 quando aplicável).
- **Cross-reference com MOCKS_TRACKING** é a parte mais útil da v1 — confirma o que `DT-11` declara.
- **BI não bloqueia ninguém** (matriz §4 INDEX) — auditoria também não bloqueia outras.
- **Auditoria mais simples** = primeira candidata real para overnight automatizado pós-piloto.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
