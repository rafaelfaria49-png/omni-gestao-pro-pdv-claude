---
# IDENTITY
skill_id: SKILL_EXEC_FEATURE_S
version: v1
status: draft
category: 3
size: S
hub: cross

# CAPABILITIES
modes_allowed: [SAFE, COWORK]
read_only: false
benchmark_required: true

# BOUNDARIES
allowed_paths: dynamic                       # resolvida da proposta aprovada
allowed_paths_base:
  - "docs/status/EXECUTION_LOG.md"
denied_paths:
  - "prisma/schema.prisma"
  - "prisma/migrations/**"
  - "auth.ts"
  - "auth.config.ts"
  - "proxy.ts"
  - ".env*"
  - "lib/pdv*/core/**"
  - "lib/financeiro/services/**/core*"
  - "lib/financeiro/contracts/**"
  - "lib/operacoes/services/**/core*"
  - "lib/whatsapp/**/core*"
  - "lib/omni-agent/executores/**"
  - "lib/marketplace*"                       # greenfield protegido
  - "next.config.mjs"
  - "package.json"
  - "tsconfig.json"
expected_diff_max: 500
files_max: 10
duration_max: PT4H
commits_max: 10

# I/O CONTRACT
input:
  required: [ticket_id, proposal_ref, backlog_item_id]
  optional: [benchmark_ref]
output:
  artifacts:
    - "docs/audits/AUDIT_<ticket_id>.md"
    - "docs/status/EXECUTION_LOG.md"
  side_effects: []

# GOVERNANCE
gates: [GATE_1_PROPOSAL, GATE_2_MERGE]
audit_required: true
adr_required: conditional                    # se feature exige decisão arquitetural

# LIFECYCLE
owner: produto + Sonnet
approved_by: null
approved_at: null
deprecated_by: null
deprecated_at: null
last_review: 2026-05-27

# REFERENCES
roadmap: null
related_adrs: []
related_memories: []
template_version: v1
---

# SKILL_EXEC_FEATURE_S

> Skill de **implementação de feature pequena** (≤ 4h, ≤ 500 linhas, ≤ 10 arquivos) já aprovada em sprint.
> **Benchmark obrigatório** quando feature nova ou altera fluxo de usuário.
> **Não overnight** — feature nova exige humano ao vivo no Gate #2.

---

## 1. Propósito

Implementar item de backlog do `ROADMAP_<HUB>.md §7` ou feature derivada de benchmark/audit, com escopo cirúrgico definido pela proposta aprovada. Gera AUDIT pós-impl.

**Casos típicos:**
- UI pequena (componente novo, botão de ação, modal específico).
- Endpoint pequeno (CRUD básico para entidade que já existe no schema).
- Integração simples (consumir API já documentada, sem novo provedor).
- Toggle simples (config de feature flag).
- Ajuste UX com contrato backend existente.

**O que ela NÃO faz:**
- Não implementa feature M/L/XL → exige `SKILL_EXEC_FEATURE_M` (futuro) ou quebra.
- Não cria nova arquitetura → ADR primeiro.
- Não escolhe provedor fiscal/cobrança → ADR + decisão de produto.
- Não toca Marketplace greenfield (área protegida até Fase 1 fechar).
- Não cria executor Omni Agent (área protegida).

---

## 2. Quando usar

- Item de backlog em `ROADMAP_<HUB>.md §7` marcado como S.
- Proposta aprovada com escopo S confirmado no `proposal_ref §4` (scope assess).
- Benchmark gerado se feature nova/UX nova/integração nova (`benchmark_ref` preenchido).
- Allow-list da proposta ⊆ allow-list base + dinâmicos.
- Sem flag `--with-protected-areas` necessária.

---

## 3. Quando NÃO usar

- Feature tamanho M/L/XL → quebrar ou usar Execution M (futuro).
- Feature exige mudança em schema → área protegida + ADR.
- Feature exige novo provedor externo → ADR + decisão.
- Feature cross-HUB → N sprints separadas (1 sprint = 1 HUB).
- Sem benchmark quando feature é nova → ABORT (`benchmark_required: true`).

---

## 4. Input contract

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `ticket_id` | string | sim | ID do ticket | `CRM-S-014` |
| `proposal_ref` | path | sim | Path da proposta aprovada | `docs/sprints/proposals/SPRINT_PROPOSAL_CRM-S-014.md` |
| `backlog_item_id` | string | sim | Item do backlog no ROADMAP_<HUB> §7 | `"Tela 360° consolidada"` |
| `benchmark_ref` | path | conditional | Obrigatório se feature nova/UX nova/integração nova | `docs/audits/benchmarks/BENCHMARK_CRM-S-014.md` |

**Validações:**
- `proposal_ref` aprovada (Gate #1 ok).
- `proposal_ref §4` (scope assess) confirmou S.
- `proposal_ref §5` (allow-list) ⊆ allow-list base + dinâmicos.
- `backlog_item_id` corresponde a entrada do roadmap.
- `benchmark_ref` obrigatório quando `benchmark_required: true` da proposta.

---

## 5. Output contract

**Side effects:**
- Código modificado conforme proposta (diff ≤ 500 linhas, ≤ 10 arquivos).
- Documentação inline atualizada se necessário (sem novos `.md` fora da allow-list).

**Artefatos:**
- `docs/audits/AUDIT_<ticket_id>.md` (gerado por `SKILL_AUDIT_<HUB>` na Fase 12).
- Entrada append em `docs/status/EXECUTION_LOG.md`.

---

## 6. Fases do pipeline usadas

Todas as 17. Sem desvios.

**Observações específicas:**
- Fase 5 BENCHMARK: **condicional** — se proposta marcou `benchmark_required: true`, skill verifica `benchmark_ref` no input.
- Fase 12 AUDIT: aciona `SKILL_AUDIT_<HUB>` correspondente; finding P0 → ROLLBACK.
- Fase 13 GATE #2: humano valida — visualmente quando aplicável (UI).

---

## 7. Comportamento específico

- **Benchmark é dimensão respiratória** — feature nova sem benchmark é palpite; skill rejeita.
- **Allow-list dinâmica** resolvida do `proposal_ref §5` no PRE-FLIGHT.
- **Sem refactor "de brinde"** — só toca o necessário; melhoria adjacente vira outro ticket.
- **Sem mudança de comportamento de fluxo existente** sem aprovação explícita na proposta.
- **Cross-HUB rejeita** — feature que toca > 1 HUB exige N sprints.
- **`adr_required: conditional`** — se feature **revela** decisão arquitetural durante implementação, skill PAUSE + sugere `SKILL_PROPOSE_ADR`.
- **Não roda em overnight** — feature nova exige humano de dia para validar UX/comportamento no Gate #2.

---

## 8. Failure modes específicos

| Cenário | Ação |
|---|---|
| Feature requer benchmark (`benchmark_required: true`) mas `benchmark_ref` ausente | ABORT |
| Proposta tem tamanho M/L/XL | ABORT (skill é S apenas) |
| Tentativa de tocar área protegida | ABORT + ROLLBACK |
| Cross-HUB no diff | ABORT + ROLLBACK + sugere N sprints |
| Diff > 500 linhas | PAUSE + humano |
| Durante implementação descobre que precisa de ADR (mudança contratual) | PAUSE + sugere `SKILL_PROPOSE_ADR` |
| AUDIT pega P0 | ROLLBACK + escala |

---

## 9. Exemplos de uso

### 9.1 SAFE — Feature de UI pequena
```yaml
ticket_id: CRM-S-014
skill: SKILL_EXEC_FEATURE_S
modo: SAFE
input:
  ticket_id: CRM-S-014
  proposal_ref: docs/sprints/proposals/SPRINT_PROPOSAL_CRM-S-014.md
  backlog_item_id: "Tela 360° consolidada (consolidar vendas + OS + crédito + conversas)"
  benchmark_ref: docs/audits/benchmarks/BENCHMARK_CRM-S-014.md
```

### 9.2 COWORK — Endpoint pequeno em HUB diferente
```yaml
ticket_id: ESTOQUE-S-022
skill: SKILL_EXEC_FEATURE_S
modo: COWORK
input:
  ticket_id: ESTOQUE-S-022
  proposal_ref: docs/sprints/proposals/SPRINT_PROPOSAL_ESTOQUE-S-022.md
  backlog_item_id: "Endpoint para alerta de estoque mínimo (consulta read-only)"
  benchmark_ref: docs/audits/benchmarks/BENCHMARK_ESTOQUE-S-022.md
```

---

## 10. Referências

- [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md)
- [`docs/execution/SAFE_GUARDS.md`](../../../execution/SAFE_GUARDS.md)
- [`docs/execution/HUMAN_GATES.md`](../../../execution/HUMAN_GATES.md) — Gate #2 ao vivo obrigatório
- [`docs/execution/SKILL_TAXONOMY.md`](../../../execution/SKILL_TAXONOMY.md) — Cat. 3 Execution S
- Irmãs Proposal: `SKILL_PROPOSE_SPRINT`, `SKILL_PROPOSE_ADR`
- Irmãs Research: `SKILL_BENCHMARK_<HUB>` (gera `benchmark_ref`)

---

## 11. Notas

- **Modo OVERNIGHT NÃO permitido** — feature nova exige humano de dia para validar UX/comportamento.
- **`adr_required: conditional`** é o caso mais comum de mudança de rota durante execução — skill PAUSE para humano decidir.
- **Skill mais "natural" para evolução de roadmap** — quase todo item §7 dos ROADMAPs vira `SKILL_EXEC_FEATURE_S`.
- **Pós-piloto** será a skill mais usada se humano confiar no pipeline.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
