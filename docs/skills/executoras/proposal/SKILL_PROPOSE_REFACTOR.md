---
# IDENTITY
skill_id: SKILL_PROPOSE_REFACTOR
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
  - "docs/audits/proposals/**"
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
  - "docs/audits/AUDITORIA_*.md"        # auditorias publicadas: imutáveis
  - "docs/audits/AUDIT_*.md"            # auditorias sprint-scoped: imutáveis
  - "docs/audits/benchmarks/**"         # benchmark outputs: imutáveis
  - "docs/sprints/**"
  - "docs/decisions/**"
  - "docs/roadmaps/**"
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
expected_diff_max: 200
files_max: 2
duration_max: PT30M
commits_max: 1

# I/O CONTRACT
input:
  required: [scope_paths, refactor_motivation]
  optional: [hub, max_diff_lines, audit_ref, ticket_id]
output:
  artifacts:
    - "docs/audits/proposals/REFACTOR_PROPOSAL_<ID>.md"

# GOVERNANCE
gates: []   # gerar draft = sem gate; aceitar refactor (virar sprint via SKILL_PROPOSE_SPRINT) = humano
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
roadmap: null
related_adrs: []
related_memories: []
template_version: v1
---

# SKILL_PROPOSE_REFACTOR

> Skill **Proposal** que detecta **duplicidade, acoplamento, drift, repetição, gargalos pequenos** e propõe **refactor incremental e seguro** (≤ 200 linhas).
> **Sem mega refactor. Sem runtime rewrite. Sem mudança sistêmica.**

---

## 1. Propósito

Ler código em `scope_paths` declarado, identificar oportunidade de refactor pequeno, gerar **`REFACTOR_PROPOSAL_<ID>.md`** com diagnóstico + plano + escopo fechado + análise de risco.

**O que ela NÃO faz:**
- Não altera código (só propõe).
- Não propõe refactor > 200 linhas (REJEITA).
- Não propõe runtime rewrite ou refactor sistêmico (cross-HUB, cross-camada).
- Não propõe refactor em áreas protegidas (denied-list global).
- Não desafia decisão arquitetural (isso é ADR).
- Não decide se refactor vira sprint — humano decide via `SKILL_PROPOSE_SPRINT`.

---

## 2. Quando usar

- **Duplicidade** detectada em N arquivos (lógica copiada).
- **Acoplamento** suspeito entre módulos que deveriam ser independentes.
- **Drift** entre implementação atual e padrão estabelecido (ex: skill nova divergindo do TEMPLATE).
- **Repetição** simples (DRY) com baixo blast radius.
- **Gargalo pequeno** (função lenta isolada, query N+1 em rota específica).
- **Pós-AUDIT** que identificou finding técnico isolado de severidade P2/P3 (não-urgente).

---

## 3. Quando NÃO usar

- Sem `scope_paths` ou `refactor_motivation` claros → rejeita.
- Para **mega refactor** (Pareto: > 200 linhas, > 5 arquivos, cross-HUB) → REJEITA + sugere quebrar.
- Para **runtime rewrite** (substituir engine, framework, biblioteca) → ADR primeiro, não refactor.
- Para **renomear API pública** ou contrato cross-módulo → impacto grande, exige ADR.
- Para mudanças em **áreas protegidas** (auth, schema, core HUB) → proibido por allow-list.
- Para finding P0/P1 — esses viram sprint via `SKILL_PROPOSE_SPRINT`, não refactor.

---

## 4. Input contract

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `scope_paths` | string[] | sim | Paths concretos onde fazer refactor (allow-list do futuro EXEC) | `["lib/financeiro/services/saldo.ts"]` |
| `refactor_motivation` | string | sim | Por que refactor (≥ 30 chars, específico) | `"duplicação de cálculo de saldo entre saldo.ts e movimento.ts"` |
| `hub` | enum \| `cross` | não | HUB-alvo (default: inferir de scope_paths) | `financeiro` |
| `max_diff_lines` | int | não | Override do default 200 (cap absoluto: 300) | `150` |
| `audit_ref` | path | não | AUDIT que motivou | `docs/audits/AUDITORIA_FINANCEIRO_v1.md` |
| `ticket_id` | string | não | ID determinístico | `REFACTOR-001` |

**Validações:**
- `scope_paths` ≤ 5 arquivos.
- `scope_paths` toca **1 HUB** apenas (cross-HUB rejeita).
- `scope_paths` não toca denied-list global.
- `refactor_motivation` ≥ 30 chars.
- `max_diff_lines` ≤ 300 (hard cap).

---

## 5. Output contract

**Artefato:** `docs/audits/proposals/REFACTOR_PROPOSAL_<ID>.md`

**Estrutura obrigatória:**

```markdown
---
title: REFACTOR_PROPOSAL_<ID> · <título>
hub: <hub>
scope_paths: [<paths>]
motivacao: <refactor_motivation>
audit_ref: <path ou null>
proposta_por: SKILL_PROPOSE_REFACTOR v1
proposta_em: <ISO>
estimated_diff_lines: <N>
status: proposta
---

# REFACTOR_PROPOSAL_<ID>

## 1. Motivação (problema concreto observado)
   - Evidência: snippet, arquivo:linha, métrica.
## 2. Escopo fechado (dentro / fora)
   - Dentro: paths exatos.
   - Fora: tudo o mais (cross-HUB, schema, core, etc.).
## 3. Diagnóstico técnico
   - Tipo: duplicidade / acoplamento / drift / DRY / gargalo.
   - Magnitude estimada: linhas a tocar, arquivos.
   - Blast radius: outros módulos potencialmente afetados (apenas leitura).
## 4. Plano de refactor (passos incrementais, 1-3 commits)
   - Passo 1: <…>
   - Passo 2: <…>
   - Passo 3: <…>
## 5. Testes obrigatórios pós-refactor
   - Quais testes existentes precisam passar.
   - Quais testes novos sugeridos.
## 6. Riscos
   - Tipo do risco (regressão, performance, edge case).
   - Mitigação.
## 7. Rollback
   - Snapshot + branch + condições.
## 8. Quem aceita
   - Refactor vira sprint via `SKILL_PROPOSE_SPRINT` (humano dispara).
   - Esta proposta **não** é sprint — é insumo para sprint.
## 9. Métricas de sucesso pós-refactor
   - Antes / depois (linhas, complexidade, latência).
## 10. Referências
   - AUDIT que motivou (se houver).
   - Arquivos analisados.
   - Memórias relacionadas (se aplicável).
```

---

## 6. Fases do pipeline usadas

| Fase | Aplica? | Observação |
|---|---|---|
| 1 INTAKE | sim | recebe `scope_paths`, `refactor_motivation` |
| 2 PRE-FLIGHT | sim | lê código em `scope_paths` (read livre) + audit_ref se houver |
| 3 LOCK | sim | lock no HUB-alvo (evita 2 propostas paralelas tocando mesmos paths) |
| 4 SCOPE | sim | rejeita XL; rejeita cross-HUB; rejeita > 5 arquivos |
| 5 BENCHMARK | **N/A** |
| 6 PROPOSAL | **é a fase desta skill** |
| 7 GATE #1 | aplicável **à proposta**, não à skill |
| 8–13 | **N/A** (sem código) |
| 14 DOC UPDATE | **N/A** |
| 15 ADR/MEMORY | **N/A** (refactor pequeno não exige ADR) |
| 16 LOG | sim | entrada em EXECUTION_LOG.md |
| 17 LOCK RELEASE | sim | |

---

## 7. Comportamento específico

- **Refactor pequeno por princípio** — `max_diff_lines` default 200, hard cap 300; XL REJEITA sempre.
- **1 HUB apenas** — cross-HUB exige N propostas separadas ou vira ADR (refactor arquitetural).
- **Allow-list de paths** (`scope_paths` do input) vira allow-list do futuro `SKILL_EXEC_FEATURE_S`/`SKILL_EXEC_STABILIZATION` que implementar.
- **Não toca áreas protegidas** — denied-list global respeitada estritamente.
- **Plano em 1-3 commits** — refactor longo é mega refactor disfarçado.
- **Métricas obrigatórias** (§9) — antes/depois em linhas, complexidade, latência (quando aplicável).
- **Refactor vira sprint** apenas se humano disparar `SKILL_PROPOSE_SPRINT` consumindo esta proposta.

---

## 8. Failure modes específicos

| Cenário | Ação |
|---|---|
| `scope_paths` toca > 1 HUB | REJEITA + sugere N propostas separadas |
| `scope_paths` toca > 5 arquivos | REJEITA + sugere quebra |
| `scope_paths` toca denied-list global | ABORT |
| Estimativa de diff > 300 linhas | REJEITA + sugere `SKILL_PROPOSE_ADR` (mudança arquitetural) |
| `refactor_motivation` genérico (< 30 chars) | ABORT |
| Detecta que refactor exige mudança em contrato (API pública, schema) | REJEITA + sugere `SKILL_PROPOSE_ADR` |
| Detecta que finding origem é P0/P1 | REJEITA + sugere `SKILL_PROPOSE_SPRINT` (não é refactor — é correção crítica) |

---

## 9. Exemplos de uso

### 9.1 SAFE — Refactor de duplicidade
```yaml
ticket_id: REFACTOR-001
skill: SKILL_PROPOSE_REFACTOR
modo: SAFE
input:
  scope_paths: ["lib/financeiro/services/saldo.ts", "lib/financeiro/services/movimento.ts"]
  refactor_motivation: "Cálculo de saldo derivado duplicado entre saldo.ts e movimento.ts — extrair helper único"
  hub: financeiro
  max_diff_lines: 150
  audit_ref: docs/audits/AUDITORIA_FINANCEIRO_v1.md
```

### 9.2 OVERNIGHT — Refactor de DRY
```yaml
- ticket_id: REFACTOR-002
  skill: SKILL_PROPOSE_REFACTOR
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    scope_paths: ["components/dashboard/caixa/caixa-status-bar.tsx"]
    refactor_motivation: "Lógica de formatação de saldo repetida em 3 lugares do mesmo componente"
    hub: pdv
```

---

## 10. Referências

- [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md)
- [`docs/execution/SKILL_TAXONOMY.md`](../../../execution/SKILL_TAXONOMY.md) — anti-padrões (não duplicar lógica)
- [`docs/skills/executoras/proposal/SKILL_PROPOSE_SPRINT.md`](./SKILL_PROPOSE_SPRINT.md) — refactor vira sprint via essa
- [`docs/skills/executoras/proposal/SKILL_PROPOSE_ADR.md`](./SKILL_PROPOSE_ADR.md) — refactor grande vira ADR
- AUDITs como fonte típica de motivação.

---

## 11. Notas

- **Refactor pequeno** é princípio do projeto (CLAUDE.md "mudanças cirúrgicas") — esta skill operacionaliza.
- **Skill menos sensível do Bloco 34** — refactor pequeno tem baixo blast radius.
- **Cuidado especial:** REJEITAR > propor refactor de tamanho duvidoso. Engine perde nada com REJEITA; perde muito com refactor que estoura escopo.
- **Não substitui o gate humano** — refactor proposto é insumo; humano decide se vira sprint via `SKILL_PROPOSE_SPRINT`.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
