---
# IDENTITY
skill_id: SKILL_EXEC_TESTING
version: v1
status: approved
category: 3
size: S
hub: cross

# CAPABILITIES
modes_allowed: [SAFE, OVERNIGHT, COWORK]
read_only: false
benchmark_required: false

# BOUNDARIES
allowed_paths: dynamic                       # tipicamente *.test.ts, __tests__/**, e2e/**
allowed_paths_base:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "**/__tests__/**"
  - "tests/**"
  - "e2e/**"
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
  - "lib/operacoes/services/**/core*"
  - "lib/whatsapp/**/core*"
  - "lib/omni-agent/executores/**"
  - "next.config.mjs"
  - "package.json"
  - "tsconfig.json"
expected_diff_max: 400
files_max: 10
duration_max: PT3H
commits_max: 8

# I/O CONTRACT
input:
  required: [ticket_id, proposal_ref, test_type, scope_paths]
  optional: [audit_ref, expected_coverage_delta]
output:
  artifacts:
    - "docs/audits/AUDIT_<ticket_id>.md"
    - "docs/status/EXECUTION_LOG.md"
  side_effects:
    - "novos *.test.ts ou *.spec.ts em paths relacionados aos scope_paths"

# GOVERNANCE
gates: [GATE_1_PROPOSAL, GATE_2_MERGE]
audit_required: true
adr_required: never

# LIFECYCLE
owner: produto + Sonnet
approved_by: Rafael
approved_at: 2026-05-27T01:30:00-03:00
deprecated_by: null
deprecated_at: null
last_review: 2026-05-27

# REFERENCES
roadmap: null
related_adrs: []
related_memories: []
template_version: v1
---

# SKILL_EXEC_TESTING

> Skill de **criar ou melhorar testes** sem alterar comportamento de produção. Cobre **unit, integration, Playwright (E2E), smoke, regressão, fixtures, testes de adapter, testes de multi-loja**.

---

## 1. Propósito

Adicionar ou expandir testes para código existente (`scope_paths`), aumentando confiança em regressão e cobrindo cenários críticos (especialmente isolamento multi-loja). **Nunca altera comportamento do código sob teste.**

**Tipos de teste cobertos (`test_type`):**
- `unit` — Vitest, função pura ou módulo isolado.
- `integration` — múltiplos módulos, banco em memória ou real (test container).
- `e2e` — Playwright, fluxo completo navegador.
- `smoke` — verifica que features críticas ainda funcionam.
- `regression` — cobre bug específico já corrigido.
- `fixtures` — dados de teste reutilizáveis.
- `adapter` — testa adapter cross-HUB (OS→Estoque, OS→Financeiro, futuro Marketplace→Estoque).
- `multi_loja` — verifica isolamento `storeId` cross-tenant.

**O que ela NÃO faz:**
- Não altera código sob teste (read-only no código de produção).
- Não cria mock enganoso (princípio "real ou nada").
- Não refatora código junto com teste — refactor é outra skill.
- Não cria teste para skill destrutiva sem aprovação extra.
- Não toca áreas protegidas (denied list).

---

## 2. Quando usar

- Pós-`SKILL_EXEC_DEBT_ITEM` ou `SKILL_EXEC_STABILIZATION` — adicionar testes de regressão.
- Audit identifica gap de cobertura (`SKILL_AUDIT_<HUB>` finding P2/P3 sobre testes).
- Sprint dedicada a "subir cobertura E2E dos 4 fluxos do PDV" (exemplo).
- Sprint de testes de multi-loja antes do piloto (recomendação forte).
- Adicionar fixture comum reutilizável.
- Adicionar smoke test antes de release.

---

## 3. Quando NÃO usar

- Para "ajustar" código junto com teste — princípio: teste e código são commits separados.
- Para criar mock que esconde realidade ("mock para fazer teste passar").
- Para testar área protegida sem flag (proibido).
- Para testar skill destrutiva sem aprovação humana extra (deve ser SAFE + humano ao vivo).

---

## 4. Input contract

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `ticket_id` | string | sim | ID do ticket | `MULTI_LOJA-S-002` |
| `proposal_ref` | path | sim | Path da proposta aprovada | `docs/sprints/proposals/SPRINT_PROPOSAL_MULTI_LOJA-S-002.md` |
| `test_type` | enum | sim | Tipo de teste | `multi_loja` |
| `scope_paths` | string[] | sim | Paths do código sob teste (read-only) | `["lib/operacoes/adapters/os-estoque.ts"]` |
| `audit_ref` | path | não | AUDIT que motivou | `docs/audits/AUDITORIA_MULTI_LOJA_v1.md` |
| `expected_coverage_delta` | string | não | Meta de cobertura | `"+15% em lib/operacoes/adapters/"` |

**Validações:**
- `test_type` ∈ enum.
- `scope_paths` (código sob teste) **não toca área protegida** (skill só LÊ esses paths, mas mesmo leitura de schema não vale para gerar teste).
- `proposal_ref` aprovada.
- Engine confirma que escrita acontece apenas em paths de teste (allow-list base).

---

## 5. Output contract

**Side effects:**
- Novos `*.test.ts` / `*.spec.ts` em paths relacionados aos `scope_paths`.
- Fixtures em `tests/` ou `__tests__/` se aplicável.
- E2E em `e2e/` se aplicável.

**Artefatos:**
- `docs/audits/AUDIT_<ticket_id>.md` (gerado por `SKILL_AUDIT_<HUB>` na Fase 12) — foco: cobertura aumentou? testes passam?
- Entrada append em `docs/status/EXECUTION_LOG.md`.

**Garantia obrigatória:**
- Todos os testes adicionados passam.
- Testes existentes continuam passando.
- Coverage mensurada (se `expected_coverage_delta` definido).

---

## 6. Fases do pipeline usadas

Todas as 17. Sem desvios.

**Observações específicas:**
- Fase 8 PRE-TESTS: roda `vitest` para garantir cobertura atual; se vermelho, ABORT (sujo).
- Fase 10 IMPLEMENT: cria testes; commit por arquivo de teste.
- Fase 11 POST-TESTS: roda `vitest` novamente; deve passar tudo + novos testes.
- Fase 12 AUDIT: foco em cobertura + qualidade dos testes (`assert` significativo, não trivial).

---

## 7. Comportamento específico

- **Read-only sobre código de produção** — `scope_paths` é leitura.
- **Write apenas em arquivos de teste** — allow-list base estrita.
- **Testes de multi-loja são prioritários** quando aplicável — devem verificar que loja A não vê dado de loja B.
- **Sem mock enganoso** — se teste precisa de fixture, criar real (test container, in-memory db); evitar `vi.mock()` de fluxo crítico.
- **Cobertura mensurável** — quando `expected_coverage_delta` definido, AUDIT verifica.
- **Sem refactor de código de produção** — se descobre bug durante teste, gera ticket de stabilization separado.

---

## 8. Failure modes específicos

| Cenário | Ação |
|---|---|
| Tentativa de modificar código de produção em `scope_paths` | ABORT + ROLLBACK |
| Teste novo cria mock enganoso (oculta realidade) | PAUSE + humano |
| Teste novo falha (não passa) | ABORT (teste mal escrito) |
| Cobertura cai vs antes | PAUSE + humano (teste pode ter removido outro) |
| Diff > 400 linhas | PAUSE + humano |
| AUDIT pega P0 (teste introduziu regressão indireta) | ROLLBACK |
| `test_type: multi_loja` sem `scope_paths` cobrindo lógica multi-loja | warn (escopo questionável) |

---

## 9. Exemplos de uso

### 9.1 SAFE — Testes multi-loja para piloto
```yaml
ticket_id: MULTI_LOJA-S-002
skill: SKILL_EXEC_TESTING
modo: SAFE
input:
  ticket_id: MULTI_LOJA-S-002
  proposal_ref: docs/sprints/proposals/SPRINT_PROPOSAL_MULTI_LOJA-S-002.md
  test_type: multi_loja
  scope_paths:
    - "lib/operacoes/adapters/os-estoque.ts"
    - "lib/financeiro/adapters/os-contas-receber.ts"
  audit_ref: docs/audits/AUDITORIA_MULTI_LOJA_v1.md
  expected_coverage_delta: "+20% em adapters"
```

### 9.2 OVERNIGHT — Smoke test pré-release
```yaml
- ticket_id: SMOKE-S-001
  skill: SKILL_EXEC_TESTING
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    ticket_id: SMOKE-S-001
    proposal_ref: docs/sprints/proposals/SPRINT_PROPOSAL_SMOKE-S-001.md
    test_type: smoke
    scope_paths: ["app/dashboard/**"]
```

---

## 10. Referências

- [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md)
- [`docs/execution/SAFE_GUARDS.md`](../../../execution/SAFE_GUARDS.md) — pre-tests e post-tests obrigatórios
- [`docs/governance/GOVERNANCA.md`](../../../governance/GOVERNANCA.md) — princípio "real ou nada" (sem mock enganoso)
- Documentação Vitest do projeto: `package.json` scripts `npm run test`.
- Recomendação roadmaps: ROADMAP_PDV §7 (E2E dos 4 fluxos), ROADMAP_MULTI_LOJA §7 (testes E2E de isolamento).

---

## 11. Notas

- **Skill complementar essencial** — toda execução pequena pode ter sprint de teste vinculada.
- **Multi-loja test_type é prioritário** — antes do piloto, recomendo sprint dedicada de testes E2E de isolamento.
- **Sem mock enganoso** é regra absoluta — princípio do projeto.
- **Cobertura cai = sinal vermelho** — auditoria detecta e PAUSE.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
