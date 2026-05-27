---
# IDENTITY
skill_id: SKILL_EXEC_STABILIZATION
version: v1
status: draft
category: 3
size: S
hub: cross

# CAPABILITIES
modes_allowed: [SAFE, OVERNIGHT, COWORK]
read_only: false
benchmark_required: false

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
  - "next.config.mjs"
  - "package.json"
  - "tsconfig.json"
expected_diff_max: 300
files_max: 8
duration_max: PT3H
commits_max: 8

# I/O CONTRACT
input:
  required: [ticket_id, proposal_ref, stabilization_topic]
  optional: [audit_ref, finding_ref, related_risks]
output:
  artifacts:
    - "docs/audits/AUDIT_<ticket_id>.md"
    - "docs/status/EXECUTION_LOG.md"
  side_effects:
    - "docs/status/RISCOS.md"                # se risco mitigado, move R-NN §2→§4

# GOVERNANCE
gates: [GATE_1_PROPOSAL, GATE_2_MERGE]
audit_required: true
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
related_memories:
  - project_pdv_caixa_estabilizacao
  - project_cancelamento_venda_fechamento
  - project_credito_cliente_persistente
template_version: v1
---

# SKILL_EXEC_STABILIZATION

> Skill de **estabilização** — corrige bug operacional, race condition pequena, loading state, retry, idempotência local, tratamento de erro, fallback, drift pequeno. **Sem mudar produto.**
> **Especialmente útil em PDV, Financeiro, Estoque, Multi-loja, WhatsApp.**

---

## 1. Propósito

Estabilizar fluxo existente que está intermitente, frágil, ou degradando, **sem alterar o que ele faz** (sem mudar produto). Foco em **robustez técnica**, não em feature nova.

**Casos típicos:**
- Bug operacional isolado (cancelamento de venda não atualizava fechamento — já corrigido como exemplo, memória `project_cancelamento_venda_fechamento`).
- Race condition pequena (concorrência local entre 2 chamadas).
- Loading state ausente que confunde operador.
- Retry insuficiente em chamada de rede instável.
- Idempotência local (evitar duplo-clique cria 2 registros).
- Tratamento de erro genérico → erro específico ao usuário.
- Melhoria de fallback (quando servidor cai, UI degrada controlado).
- Drift pequeno entre duas representações (UI mostra X, banco tem Y).

**O que ela NÃO faz:**
- Não cria feature nova → `SKILL_EXEC_FEATURE_S`.
- Não faz refactor grande → `SKILL_PROPOSE_REFACTOR` + sprint.
- Não toca schema/auth/core (denied list).
- Não muda comportamento de produto sem aprovação explícita.
- Não introduz novo provedor.

---

## 2. Quando usar

- Bug reportado em `BLOCKERS.md` ou em finding de audit (P1/P2).
- Risco P1/P2 de `RISCOS.md` que pode ser mitigado com fix pequeno.
- Drift detectado por `SKILL_AUDIT_<HUB>` (severidade P1/P2/P3 não-fiscal).
- Proposta aprovada em `docs/sprints/proposals/` com escopo de estabilização.
- Sem dependência arquitetural (se há, é ADR primeiro).

---

## 3. Quando NÃO usar

- Finding P0 → exige tratamento mais cuidadoso; pode ser `SKILL_EXEC_DEBT_ITEM` se há DT-NN, ou sprint humana ao vivo.
- Bug em área protegida → flag humana + SAFE.
- Bug exige mudança de schema → ADR primeiro.
- Bug exige novo provedor → ADR + decisão.
- "Estabilização" disfarçada que muda produto → ABORT + sugere `SKILL_EXEC_FEATURE_S`.

---

## 4. Input contract

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `ticket_id` | string | sim | ID do ticket | `PDV-S-019` |
| `proposal_ref` | path | sim | Path da proposta aprovada | `docs/sprints/proposals/SPRINT_PROPOSAL_PDV-S-019.md` |
| `stabilization_topic` | string | sim | Foco específico (≥ 30 chars) | `"loading state durante finalizarVenda em rede lenta"` |
| `audit_ref` | path | não | AUDIT que motivou | `docs/audits/AUDITORIA_PDV_v2.md` |
| `finding_ref` | string | não | F-NN dentro da audit | `F-12` |
| `related_risks` | string[] | não | R-NN mitigados | `[R-12]` |

**Validações:**
- `stabilization_topic` ≥ 30 chars (forçar especificidade — bug genérico não vale).
- `proposal_ref` aprovada.
- `proposal_ref §5` (allow-list) ⊆ allow-list base + dinâmicos.
- Se `finding_ref` → audit referenciada deve existir.

---

## 5. Output contract

**Side effects:**
- Código modificado conforme proposta (diff ≤ 300 linhas, ≤ 8 arquivos).
- `docs/status/RISCOS.md` (se `related_risks` mitigados): R-NN movido de §2 para §4.

**Artefatos:**
- `docs/audits/AUDIT_<ticket_id>.md` (gerado por `SKILL_AUDIT_<HUB>` na Fase 12).
- Entrada append em `docs/status/EXECUTION_LOG.md`.

**Comportamento esperado:**
- Fluxo estável onde antes era intermitente.
- Sem mudança visual aparente (estabilização ≠ feature).
- Testes regressão adicionados (`SKILL_EXEC_TESTING` complementa se necessário).

---

## 6. Fases do pipeline usadas

Todas as 17. Sem desvios.

**Observações específicas:**
- Fase 5 BENCHMARK: **pulada** (estabilização não exige).
- Fase 8 PRE-TESTS: obrigatória; aborta se sujo.
- Fase 12 AUDIT: usa `SKILL_AUDIT_<HUB>` correspondente; foca em **regressão** (não introduzir novo finding).
- Fase 13 GATE #2: humano valida que estabilização **não mudou produto**.

---

## 7. Comportamento específico

- **Estabilização ≠ feature** — produto não muda; só fica mais robusto.
- **Diff menor que feature** (300 vs 500) — estabilização pequena por natureza.
- **Allow-list dinâmica** resolvida do `proposal_ref §5`.
- **Testes de regressão** recomendados — `SKILL_EXEC_TESTING` pode ser sprint complementar.
- **`related_risks`** quando passado: skill move R-NN de §2 para §4 de `RISCOS.md` com nota da sprint que mitigou.
- **Sem refactor "de brinde"** — estabilização toca apenas o necessário para resolver o problema declarado.

---

## 8. Failure modes específicos

| Cenário | Ação |
|---|---|
| `stabilization_topic` < 30 chars ou genérico | ABORT |
| Implementação muda comportamento de produto (output diferente para mesmo input) | PAUSE + humano (não é estabilização) |
| Diff > 300 linhas | PAUSE + humano |
| Tocar área protegida | ABORT + ROLLBACK |
| AUDIT pega novo finding P0 (regressão) | ROLLBACK |
| `related_risks` aponta R-NN inexistente ou já mitigado | warn (não bloqueia) |
| Pre-tests vermelho antes de tocar | ABORT |

---

## 9. Exemplos de uso

### 9.1 SAFE — Loading state em finalizarVenda
```yaml
ticket_id: PDV-S-019
skill: SKILL_EXEC_STABILIZATION
modo: SAFE
input:
  ticket_id: PDV-S-019
  proposal_ref: docs/sprints/proposals/SPRINT_PROPOSAL_PDV-S-019.md
  stabilization_topic: "loading state em finalizarVenda quando rede está lenta"
  audit_ref: docs/audits/AUDITORIA_PDV_v2.md
  finding_ref: F-12
```

### 9.2 OVERNIGHT — Idempotência local (anti duplo-clique)
```yaml
- ticket_id: FIN-S-031
  skill: SKILL_EXEC_STABILIZATION
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    ticket_id: FIN-S-031
    proposal_ref: docs/sprints/proposals/SPRINT_PROPOSAL_FIN-S-031.md
    stabilization_topic: "idempotência local em criar ContaReceber via UI (duplo-clique gera duplicidade)"
    related_risks: []
```

---

## 10. Referências

- [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md)
- [`docs/execution/SAFE_GUARDS.md`](../../../execution/SAFE_GUARDS.md)
- [`docs/execution/HUMAN_GATES.md`](../../../execution/HUMAN_GATES.md)
- [`docs/status/RISCOS.md`](../../../status/RISCOS.md) — R-NN para mitigar
- [`docs/status/BLOCKERS.md`](../../../status/BLOCKERS.md) — bugs operacionais
- Memórias relacionadas: `project_pdv_caixa_estabilizacao`, `project_cancelamento_venda_fechamento`.

---

## 11. Notas

- **Princípio CLAUDE.md** "Bug fix doesn't need surrounding cleanup" operacionalizado.
- **Skill candidata para piloto** se Multi-loja envolver estabilização (não só pagamento de DT-03).
- **Sem benchmark** — estabilização é técnico interno; concorrente externo não orienta.
- **`adr_required: never`** — se estabilização revelar necessidade de ADR, é sinal de que **não era estabilização**; PAUSE.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
