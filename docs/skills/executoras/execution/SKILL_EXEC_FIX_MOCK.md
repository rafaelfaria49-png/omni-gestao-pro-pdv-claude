---
# IDENTITY
skill_id: SKILL_EXEC_FIX_MOCK
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
allowed_paths:
  - "components/**"
  - "app/dashboard/**"
  - "docs/status/MOCKS_TRACKING.md"
  - "docs/status/EXECUTION_LOG.md"
denied_paths:
  - "prisma/schema.prisma"
  - "prisma/migrations/**"
  - "auth.ts"
  - "auth.config.ts"
  - "proxy.ts"
  - ".env*"
  - "lib/**/services/**"
  - "lib/**/contracts/**"
  - "lib/**/core/**"
  - "lib/pdv*"
  - "lib/financeiro/**"
  - "lib/operacoes/**"
  - "lib/whatsapp/**"
  - "lib/omni-agent/**"
  - "next.config.mjs"
  - "package.json"
  - "tsconfig.json"
expected_diff_max: 200
files_max: 5
duration_max: PT2H
commits_max: 5

# I/O CONTRACT
input:
  required: [ticket_id, proposal_ref, mock_id]
  optional: []
output:
  artifacts:
    - "docs/audits/AUDIT_<ticket_id>.md"     # gerado por SKILL_AUDIT_<HUB> na Fase 12
    - "docs/status/EXECUTION_LOG.md"          # append
  side_effects:
    - "docs/status/MOCKS_TRACKING.md"         # MOCK-NN movido de §2 para §3

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
related_memories: []
template_version: v1
---

# SKILL_EXEC_FIX_MOCK

> **Primeira camada que altera código** — execução pequena e segura para **remover/corrigir mock enganoso**.
> Conservadora ao extremo: 1 mock por execução, ≤ 200 linhas diff, áreas protegidas inacessíveis.

---

## 1. Propósito

Substituir mock enganoso (MOCK-NN de `MOCKS_TRACKING.md`) por dado real ou empty state honesto, atualizar `MOCKS_TRACKING.md` movendo MOCK-NN para §3 (removido), e gerar AUDIT pós-impl.

**Casos típicos:**
- Componente com dados fake (cards do painel).
- KPI mock sem banner "DADOS DEMO".
- Dashboard parcialmente mock.
- Empty state honesto onde antes mostrava lorem.
- Troca de mock por API real já existente.

**O que ela NÃO faz:**
- Não cria backend novo (apenas pluga em backend já existente).
- Não altera schema.
- Não toca services core.
- Não faz refactor grande (refactor pequeno = `SKILL_PROPOSE_REFACTOR`).
- Não toca Marketplace greenfield (HUB inteiro é greenfield, não "mock").
- Não toca áreas protegidas.

---

## 2. Quando usar

- MOCK-NN existe em `MOCKS_TRACKING.md §2` (ativo).
- Mock vive em `components/**` ou `app/dashboard/**`.
- Backend real já existe (skill apenas pluga).
- Proposal aprovada em `docs/sprints/proposals/` (Gate #1 ok).

---

## 3. Quando NÃO usar

- Mock vive em `lib/**/services/**` → não é mock, é decisão técnica.
- Backend real **não existe** → criar backend primeiro (sprint maior, outra skill).
- Mock está aceito por design (MOCK-NN em §4 de `MOCKS_TRACKING.md` com 🚫) → não tocar.
- Sem proposal aprovada → bloqueado pelo Gate #1.

---

## 4. Input contract

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `ticket_id` | string | sim | ID do ticket | `BI-S-007` |
| `proposal_ref` | path | sim | Path da proposta aprovada (Gate #1 ok) | `docs/sprints/proposals/SPRINT_PROPOSAL_BI-S-007.md` |
| `mock_id` | string | sim | MOCK-NN a remover | `MOCK-03` |

**Validações:**
- `proposal_ref` existe, `status: planejada`, `approved_by` preenchido.
- `mock_id` existe em `MOCKS_TRACKING.md §2` com `risco: 🔴` ou `🟡` (não 🚫 aceito).
- `proposal_ref §5` (allow-list) ⊆ allow-list desta skill.

---

## 5. Output contract

**Side effects:**
- Arquivos em `components/**` ou `app/dashboard/**` modificados (diff ≤ 200 linhas).
- `docs/status/MOCKS_TRACKING.md`: linha MOCK-NN movida de §2 para §3 (histórico).

**Artefatos:**
- `docs/audits/AUDIT_<ticket_id>.md` (gerado por `SKILL_AUDIT_<HUB>` na Fase 12).
- Entrada append em `docs/status/EXECUTION_LOG.md`.

**Comportamento esperado em UI:**
- Mock substituído por dado real OU empty state honesto com mensagem clara ("Nenhum dado ainda").
- Banner "DADOS DEMO" removido se aplicável.

---

## 6. Fases do pipeline usadas

Todas as 17 fases do `EXECUTION_ENGINE.md`. Sem desvios.

**Observações específicas:**
- Fase 5 BENCHMARK: **pulada** (mock removal não exige benchmark).
- Fase 8 PRE-TESTS: obrigatória; aborta se sujo.
- Fase 10 IMPLEMENT: commit por arquivo modificado (até 5 commits).
- Fase 12 AUDIT: aciona `SKILL_AUDIT_<HUB>` (do HUB do mock) com `scope_paths` = arquivos modificados.

---

## 7. Comportamento específico

- **1 MOCK por execução** — múltiplos mocks = N tickets separados.
- **Atualização de `MOCKS_TRACKING.md`** apenas move linha entre §2 e §3 (mantém ID, descrição, datas). Não reescreve §1 (convenção) ou §4 (anti-padrões).
- **Empty state > falso real** — se backend real ainda parcial, preferir empty state honesto a renderizar parcialmente.
- **Banner "DADOS DEMO"** removido na mesma execução (sem deixar resíduo confuso).
- **Sem refactor "de brinde"** — só toca o necessário para remover o mock; melhoria adjacente vira outro ticket.

---

## 8. Failure modes específicos

| Cenário | Ação |
|---|---|
| `mock_id` não existe em §2 de `MOCKS_TRACKING.md` | ABORT |
| `mock_id` está em §4 (aceito por design 🚫) | ABORT |
| `proposal_ref §5` toca path fora da allow-list desta skill | ABORT (proposta mal escrita) |
| Backend real não existe (skill detecta no PRE-FLIGHT) | ABORT + sugere sprint maior |
| Diff estoura 200 linhas | PAUSE + humano (mock mais profundo do que pensava) |
| Tocar `lib/**/services/**` ou área protegida | ABORT + ROLLBACK |
| AUDIT pós-impl pega P0 | ROLLBACK + escala humano |

---

## 9. Exemplos de uso

### 9.1 SAFE — Remover MOCK-03 (painel inicial)
```yaml
ticket_id: BI-S-007
skill: SKILL_EXEC_FIX_MOCK
modo: SAFE
input:
  ticket_id: BI-S-007
  proposal_ref: docs/sprints/proposals/SPRINT_PROPOSAL_BI-S-007.md
  mock_id: MOCK-03
```

### 9.2 OVERNIGHT (fila aprovada)
```yaml
- ticket_id: WHATSAPP-S-012
  skill: SKILL_EXEC_FIX_MOCK
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    ticket_id: WHATSAPP-S-012
    proposal_ref: docs/sprints/proposals/SPRINT_PROPOSAL_WHATSAPP-S-012.md
    mock_id: MOCK-02
```

---

## 10. Referências

- [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md)
- [`docs/execution/SAFE_GUARDS.md`](../../../execution/SAFE_GUARDS.md)
- [`docs/execution/HUMAN_GATES.md`](../../../execution/HUMAN_GATES.md)
- [`docs/status/MOCKS_TRACKING.md`](../../../status/MOCKS_TRACKING.md) — fonte de MOCK-NN
- [`docs/governance/GOVERNANCA.md`](../../../governance/GOVERNANCA.md) — princípio "nunca criar mocks enganosos"
- Irmãs Proposal: [`SKILL_PROPOSE_SPRINT`](../proposal/SKILL_PROPOSE_SPRINT.md)
- Audit pós-impl: `SKILL_AUDIT_<HUB>` do HUB do mock.

---

## 11. Notas

- **Princípio "real ou nada"** (CLAUDE.md, MASTER_PLAN §7) operacionalizado.
- **Empty state honesto** é resultado válido — não é falha.
- **Skill mais frequente esperada do Execution Layer S** — projeto tem 8 mocks ativos (`MOCKS_TRACKING.md §2`).
- **Sem fix de mock em massa** — 1 ticket por mock; auditoria por mock; rollback granular.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
