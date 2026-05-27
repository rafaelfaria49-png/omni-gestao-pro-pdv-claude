---
# IDENTITY
skill_id: SKILL_PROPOSE_SPRINT
version: v1
status: draft
category: 2
size: S
hub: cross

# CAPABILITIES
modes_allowed: [SAFE, OVERNIGHT, COWORK]
read_only: false
benchmark_required: false

# BOUNDARIES
allowed_paths:
  - "docs/sprints/proposals/**"
  - "docs/status/EXECUTION_LOG.md"   # append-only
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
  - "docs/sprints/SPRINT_*.md"         # sprints publicadas: imutáveis
  - "docs/roadmaps/**"
  - "docs/decisions/**"
  - "docs/audits/**"
  - "docs/ai/**"
  - "docs/memory/**"
  - "docs/governance/**"
  - "docs/skills/**"
  - "docs/execution/**"
  - "docs/blueprint/**"
  - "docs/architecture/**"
  - "docs/modules/**"
  - "docs/status/DIVIDA_TECNICA.md"
  - "docs/status/RISCOS.md"
  - "docs/status/BLOCKERS.md"
  - "docs/status/MOCKS_TRACKING.md"
  - "docs/status/LOCKS.md"
  - "docs/status/OVERNIGHT_QUEUE.md"
expected_diff_max: 300
files_max: 2
duration_max: PT45M
commits_max: 1

# I/O CONTRACT
input:
  required: [hub, origin_type, origin_id]
  optional: [sprint_topic, benchmark_ref, audit_ref, ticket_id]
output:
  artifacts:
    - "docs/sprints/proposals/SPRINT_PROPOSAL_<ID>.md"

# GOVERNANCE
gates: []   # gerar draft = sem gate; publicação (mover para docs/sprints/) = humano
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
roadmap: null   # cross-HUB; HUB-alvo vem do input
related_adrs: []
related_memories: []
template_version: v1
---

# SKILL_PROPOSE_SPRINT

> Skill **Proposal** que transforma análise (roadmap + status + benchmark + audit) em **proposta de sprint estruturada** seguindo `docs/sprints/TEMPLATE_SPRINT.md`.
> **Não publica** — gera draft em `docs/sprints/proposals/`. Publicação = humano move para `docs/sprints/` após aprovação no Gate #1 do Engine.

---

## 1. Propósito

Ler estado vivo do projeto (roadmap do HUB-alvo, dívidas, blockers, riscos, EXECUTION_LOG, overview, benchmark/audit referenciados) e gerar **`SPRINT_PROPOSAL_<ID>.md`** com escopo fechado, DoD, plano por checkpoint, allow-list de paths, riscos, ADR sugerido se aplicável.

**O que ela NÃO faz:**
- Não publica sprint (não escreve em `docs/sprints/SPRINT_*.md`).
- Não executa código.
- Não decide ordem entre sprints (engine + humano decidem).
- Não cria sprint gigante (1 sprint = 1 HUB, escopo S/M).
- Não mistura HUBs (cross-HUB exige N propostas separadas).

---

## 2. Quando usar

- **Após benchmark** que identificou diferencial implementável.
- **Após audit** que gerou finding P0/P1 acionável.
- **Para pagar dívida técnica** específica (DT-NN).
- **Para destravar blocker** específico (BL-NN).
- **Para mitigar risco** específico (R-NN).
- **Para implementar item de backlog** do roadmap §7.
- **Fase 6 do Engine** — pipeline aciona esta skill após scope assess.

---

## 3. Quando NÃO usar

- Sem `hub`, `origin_type` ou `origin_id` claros → rejeita.
- Para "planejar o próximo trimestre" → use roadmap diretamente.
- Para refletir mudança em escopo de sprint **aprovada** → use nova proposta + ADR de mudança de direção.
- Para refactor pequeno isolado → `SKILL_PROPOSE_REFACTOR`.
- Para decisão arquitetural → `SKILL_PROPOSE_ADR` primeiro.

---

## 4. Input contract

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `hub` | enum | sim | HUB-alvo da sprint | `multi_loja` |
| `origin_type` | enum | sim | `backlog_item` \| `dt` (dívida) \| `bl` (blocker) \| `r` (risco) \| `finding` (audit) \| `roadmap_phase` | `dt` |
| `origin_id` | string | sim | ID concreto da origem | `DT-03` |
| `sprint_topic` | string | não | Sobrescreve título sugerido | `"eliminar fallback loja-1 + lint customizado de storeId"` |
| `benchmark_ref` | path | não | Path para BENCHMARK_<ticket>.md a consumir | `docs/audits/benchmarks/BENCHMARK_MLOJA-S-001.md` |
| `audit_ref` | path | não | Path para AUDIT/AUDITORIA a consumir | `docs/audits/AUDITORIA_MULTI_LOJA_v1.md` |
| `ticket_id` | string | não | ID determinístico do ticket (gerado pelo engine) | `MLOJA-S-001` |

**Validações:**
- `hub` ∈ vocabulário oficial (`roadmaps/INDEX.md §5`).
- `origin_id` deve existir no arquivo correspondente:
  - `dt` → linha em `DIVIDA_TECNICA.md §2`
  - `bl` → linha em `BLOCKERS.md §2`
  - `r` → linha em `RISCOS.md §2`
  - `backlog_item` → entrada em `ROADMAP_<HUB>.md §7`
  - `finding` → finding F-NN em audit referenciada
- Se `benchmark_required` aplicável (feature/arq nova) e `benchmark_ref` ausente → rejeita.

---

## 5. Output contract

**Artefato:** `docs/sprints/proposals/SPRINT_PROPOSAL_<ID>.md` (ou `<ticket_id>` se fornecido).

**Estrutura obrigatória (herda `docs/sprints/TEMPLATE_SPRINT.md`):**

```markdown
---
title: SPRINT_PROPOSAL_<ID> · <título curto>
sprint_id: <NN sugerido — humano confirma>
hub: <hub>
status: proposta   # vira "planejada" quando humano aprovar (Fase 7)
origin:
  type: <origin_type>
  id: <origin_id>
benchmark_ref: <path ou null>
audit_ref: <path ou null>
proposta_por: SKILL_PROPOSE_SPRINT v1
proposta_em: <ISO>
---

# SPRINT_PROPOSAL_<ID>

## 1. Por que esta sprint existe (rastreabilidade)
   - Item do backlog: <link>
   - Dívida resolvida: <DT-NN>
   - Blocker destravado: <BL-NN>
   - Finding resolvido: <F-NN da audit>
## 2. Escopo fechado (dentro / fora)
## 3. Critério de pronto (DoD herdado de TEMPLATE_SPRINT §3)
## 4. Plano de execução (checkpoints S, máx 5)
## 5. Allow-list de paths (ESTRITA — engine valida)
## 6. Riscos identificados (cruzar com RISCOS.md)
## 7. ADR sugerido (se aplicável)
## 8. Rollback (snapshot + branch + condições)
## 9. Gates (GATE #1 e GATE #2)
## 10. Handoff (quem para quem, próximo passo)
## 11. Sequência incremental (se quebra em subsprints)
## 12. Referências (roadmap, benchmark, audit, memória, ADR)
```

---

## 6. Fases do pipeline usadas

| Fase | Aplica? | Observação |
|---|---|---|
| 1 INTAKE | sim | recebe `hub`, `origin_type`, `origin_id` |
| 2 PRE-FLIGHT | sim | lê: roadmap, status vivos, EXECUTION_LOG, overview, benchmark/audit refs |
| 3 LOCK | sim | lock leve no HUB-alvo (evita 2 propostas paralelas para mesmo HUB) |
| 4 SCOPE | sim | confirma tamanho ≤ M; XL → rejeita + propõe quebra |
| 5 BENCHMARK | **N/A** (consome existente via `benchmark_ref`) |
| 6 PROPOSAL | **é a fase desta skill** |
| 7 GATE #1 | aplicável **à proposta gerada**, não à skill (gerar é livre) |
| 8–13 | **N/A** (sem código) |
| 14 DOC UPDATE | **N/A** (proposta não é doc estratégica) |
| 15 ADR/MEMORY | condicional | se ADR sugerido, anota no §7 da proposta |
| 16 LOG | sim | entrada em EXECUTION_LOG.md |
| 17 LOCK RELEASE | sim | |

---

## 7. Comportamento específico

- **1 sprint = 1 HUB** — obrigatório. Cross-HUB exige N propostas separadas.
- **Tamanho:** confirma S (≤4h) ou M (≤8h). XL **REJEITA** + escreve plano de quebra em N sprints S/M.
- **Escopo fechado** explícito: §2 sempre tem "dentro" + "fora".
- **Allow-list estrita** — engine valida na Fase 10 da execução; proposta com allow-list larga é P0.
- **Consome OVERVIEW atualizado** — exige `last_update` recente do OVERVIEW (< 7 dias); senão warn forte.
- **Consome BENCHMARK/AUDIT** se referenciados — extrai recomendações dos artefatos.
- **Não opina** sobre prioridade entre sprints — propõe escopo da sprint solicitada; engine + humano decidem ordem.
- **ADR sugerido** quando proposta envolve decisão arquitetural — apenas sugere; humano dispara `SKILL_PROPOSE_ADR` separadamente.

---

## 8. Failure modes específicos

| Cenário | Ação |
|---|---|
| `origin_id` inexistente | ABORT na Fase 1 |
| `hub` fora do vocabulário oficial | ABORT |
| Tamanho estimado XL | REJEITA + escreve plano de quebra (não cria sprint XL) |
| Proposta tocaria múltiplos HUBs | REJEITA + sugere N propostas separadas |
| OVERVIEW desatualizado (> 7 dias sem refresh) | warn forte + marca `risk: stale_overview: true` no header |
| Allow-list inferida toca área protegida | warn + marca; humano decide flag |
| Sprint já existe para mesmo `origin_id` (em `docs/sprints/proposals/` ou `docs/sprints/`) | warn + dedupe link |

---

## 9. Exemplos de uso

### 9.1 SAFE — Proposta para piloto
```yaml
ticket_id: MLOJA-S-001
skill: SKILL_PROPOSE_SPRINT
modo: SAFE
input:
  hub: multi_loja
  origin_type: dt
  origin_id: DT-03
  sprint_topic: "eliminar fallback loja-1 + lint customizado de storeId"
  audit_ref: docs/audits/AUDITORIA_MULTI_LOJA_v1.md
```

### 9.2 OVERNIGHT — Proposta a partir de blocker
```yaml
- ticket_id: null
  skill: SKILL_PROPOSE_SPRINT
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    hub: estoque
    origin_type: bl
    origin_id: BL-12
    benchmark_ref: docs/audits/benchmarks/BENCHMARK_EST-S-001.md
```

---

## 10. Referências

- [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md)
- [`docs/sprints/TEMPLATE_SPRINT.md`](../../../sprints/TEMPLATE_SPRINT.md)
- [`docs/governance/SPRINT_PROTOCOL.md`](../../../governance/SPRINT_PROTOCOL.md)
- [`docs/roadmaps/INDEX.md`](../../../roadmaps/INDEX.md) — vocabulário de HUB + matriz paralelismo
- [`docs/ai/CURRENT_STATUS_OVERVIEW.md`](../../../ai/CURRENT_STATUS_OVERVIEW.md) — entrada principal de contexto operacional
- [`docs/skills/executoras/research/SKILL_DOC_REFRESH.md`](../research/SKILL_DOC_REFRESH.md) — ponte (DOC_REFRESH atualiza OVERVIEW)

---

## 11. Notas

- **Bridge oficial Research → Proposal:** consome OVERVIEW atualizado por DOC_REFRESH para gerar proposta consistente.
- **Skill mais usada do Bloco 34** — toda sprint nasce daqui no fluxo padrão do Engine.
- **Conservadora:** prefere REJEITAR proposta XL a gerar sprint frágil.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
