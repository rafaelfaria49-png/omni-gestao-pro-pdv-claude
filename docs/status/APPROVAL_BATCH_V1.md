---
title: APPROVAL_BATCH_V1 — Aprovação formal das skills críticas do piloto
status: encerrado
data: 2026-05-27
aprovado_por: Rafael
ticket_id: APPROVAL-BATCH-V1
batch_started_at: 2026-05-27T01:30:00-03:00
batch_ended_at: 2026-05-27T02:15:00-03:00
skills_aprovadas: 8
adr_referencia: ADR-0002
---

# 🛡️ APPROVAL_BATCH_V1 — Skills críticas do piloto

> **Decisão:** aprovação formal das **8 skills críticas** para a sprint piloto **SPRINT_01_MULTI_LOJA**.
> **Schema base:** Skill Front Matter v1 (congelado por [ADR-0002](../decisions/ADR-0002-skill-front-matter-v1.md)).
> **Escopo do batch:** consolidar `status: draft → approved`, registrar ownership humano e readiness operacional do runtime — **sem executar código, sem alterar runtime, sem rodar piloto**.
> **Não é dry-run; não é execução real; não é orchestration dinâmica.**

---

## 1. Resultado consolidado

| Skill | Categoria | HUB | Status anterior | Status atual | Approved by | Approved at |
|---|---|---|---|---|---|---|
| `SKILL_AUDIT_MULTI_LOJA` | 1 (Research) | multi_loja | draft | ✅ approved | Rafael | 2026-05-27T01:30:00-03:00 |
| `SKILL_DOC_REFRESH` | 1 (Research) | cross | draft | ✅ approved | Rafael | 2026-05-27T01:30:00-03:00 |
| `SKILL_PROPOSE_SPRINT` | 2 (Proposal) | cross | draft | ✅ approved | Rafael | 2026-05-27T01:30:00-03:00 |
| `SKILL_PROPOSE_ADR` | 2 (Proposal) | cross | draft | ✅ approved | Rafael | 2026-05-27T01:30:00-03:00 |
| `SKILL_EXEC_DEBT_ITEM` | 3 (Execution S) | cross | draft | ✅ approved | Rafael | 2026-05-27T01:30:00-03:00 |
| `SKILL_EXEC_STABILIZATION` | 3 (Execution S) | cross | draft | ✅ approved | Rafael | 2026-05-27T01:30:00-03:00 |
| `SKILL_EXEC_TESTING` | 3 (Execution S) | cross | draft | ✅ approved | Rafael | 2026-05-27T01:30:00-03:00 |
| `SKILL_HANDOFF_MVP` | 6 (Governance MVP) | cross | draft | ✅ approved | Rafael | 2026-05-27T01:30:00-03:00 |

**Total:** 8 skills aprovadas / 32 skills existentes. Restante (24) permanece `draft` — aprovação por demanda em batches posteriores.

---

## 2. Critérios validados por skill

> Cada skill foi validada quanto a: front matter v1 (29 campos), `allowed_paths`, `denied_paths`, gates, rollback semantics, output esperado, governance compliance, runtime safety, pilot safety, overlap risk, serialization risk.

### 2.1 SKILL_AUDIT_MULTI_LOJA — Research (peça-chave do piloto)

- **Rationale:** auditoria sistêmica de `storeId` / tenant isolation / LGPD em todos os HUBs. Estabelece **baseline pré-piloto**. Sem ela, piloto roda sem mapa do risco.
- **Restrictions:**
  - `read_only: true` — proibido alterar código.
  - `allowed_paths: ["docs/audits/**"]` — único output permitido.
  - `denied_paths` cobre `prisma/`, `auth.*`, `proxy.ts`, `.env*`, `lib/**`, `app/**`, `components/**`, `src/**`, `next.config.mjs`, `package.json`, `tsconfig.json`.
  - `duration_max: PT2H` — exceção justificada (varre todos os HUBs).
  - `gates: []` — não merge code; apenas publica audit doc.
- **Multi-loja deep validation:**
  - ✅ **Tenant safety:** read-only, não pode quebrar isolamento.
  - ✅ **storeId:** detecta queries sem `where.storeId`, fallback `loja-1` silencioso.
  - ✅ **Rollback:** N/A (read-only).
  - ✅ **Drift:** detecta drift entre HUBs.
  - ✅ **Lock behavior:** não pega lock de HUB (read-only).
  - ✅ **Cross-HUB blast radius:** zero (não escreve).
  - ✅ **LGPD exposure:** finding-driven; objetivo principal da skill.
- **Pilot readiness:** ✅ **GO** — primeira skill a rodar pré-piloto (estabelece baseline).

### 2.2 SKILL_DOC_REFRESH — Research com write controlado

- **Rationale:** único caminho oficial para atualizar `CURRENT_STATUS_OVERVIEW.md` + ENTRY no `EXECUTION_LOG.md`. Sem ela, drift documental garantido entre execuções.
- **Restrictions:**
  - `allowed_paths` restrito a **2 arquivos** específicos.
  - `denied_paths` cobre **todo** o resto de `docs/**` (roadmaps, ADRs, status vivos, sprints, audits, memória, governance, skills, blueprint, architecture, modules) + `prisma/`, `auth.*`, `proxy.ts`, `.env*`, `lib/**`, `app/**`, `components/**`, `src/**`.
  - `gates: [GATE_2_MERGE]` — única Research com gate humano (porque escreve em doc estratégica).
  - `expected_diff_max: 150` linhas — overview enxuto por princípio.
- **Pilot readiness:** ✅ **GO** — usado a cada encerramento de sprint/audit/blocker durante o piloto.

### 2.3 SKILL_PROPOSE_SPRINT — Proposal Layer

- **Rationale:** transforma roadmap/dívida/blocker/risco/audit em proposta estruturada (`SPRINT_PROPOSAL_<ID>.md`). Skill que gera o input do Gate #1 do Engine.
- **Restrictions:**
  - `allowed_paths: ["docs/sprints/proposals/**", "docs/status/EXECUTION_LOG.md"]`.
  - `denied_paths` veda `docs/sprints/SPRINT_*.md` (publicação imutável), `docs/decisions/**`, todos os outros `docs/**`, áreas de código.
  - **Não publica sprint** — humano move draft de `proposals/` para `docs/sprints/` no gate.
- **Pilot readiness:** ✅ **GO** — gerará a proposta oficial de `SPRINT_01_MULTI_LOJA`.

### 2.4 SKILL_PROPOSE_ADR — Proposal Layer (já provada)

- **Rationale:** primeiro caso real foi `ADR_PROPOSAL_0002` (este batch é decorrência). Skill mais sensível do Bloco 34 — proíbe contradição silenciosa de ADR aceito.
- **Restrictions:**
  - `allowed_paths: ["docs/decisions/drafts/**", "docs/status/EXECUTION_LOG.md"]`.
  - `denied_paths` veda `docs/decisions/ADR-*.md` (imutáveis), `docs/decisions/INDEX.md`, `OS_ROUTE_OFICIAL.md`, todos os outros `docs/**`, áreas de código.
  - **Não publica ADR** — humano renomeia draft para `ADR-NNNN-slug.md` e move para `docs/decisions/`.
- **Pilot readiness:** ✅ **GO** — validada em campo (ADR-0002 promovido com sucesso).

### 2.5 SKILL_EXEC_DEBT_ITEM — Execution S (piloto-driver)

- **Rationale:** skill candidata oficial para pagar **DT-03 (fallback `loja-1`)** no piloto. Mais cirúrgica que `FIX_MOCK`, mais leve que `FEATURE_S`.
- **Restrictions:**
  - `allowed_paths: dynamic` — resolvida da proposta aprovada (workaround documentado em [ADR-0002 §4](../decisions/ADR-0002-skill-front-matter-v1.md) e item #16 do [`SKILL_SCHEMA_V2_BACKLOG.md`](../skills/executoras/SKILL_SCHEMA_V2_BACKLOG.md)).
  - `allowed_paths_base` inclui `DIVIDA_TECNICA.md`, `BLOCKERS.md`, `EXECUTION_LOG.md` (sempre-permitidos).
  - `denied_paths` cobre `prisma/schema.prisma`, `prisma/migrations/**`, `auth.*`, `proxy.ts`, `.env*`, cores PDV/Financeiro/Operações/WhatsApp, `lib/omni-agent/executores/**`, `next.config.mjs`, `package.json`, `tsconfig.json`.
  - `expected_diff_max: 500`, `files_max: 10`, `duration_max: PT4H`, `commits_max: 10`.
  - `gates: [GATE_1_PROPOSAL, GATE_2_MERGE]`, `audit_required: true`.
- **Multi-loja deep validation:**
  - ✅ **Tenant safety:** `storeId` é o foco central; allow-list dinâmica garante escopo cirúrgico.
  - ✅ **storeId:** memórias relacionadas (importador match seguro, multi-terminais fase 1/2) carregam padrões corretos.
  - ✅ **Rollback:** auto via `git revert` da branch da skill — sem efeito colateral em `migrations`, `schema`, ou auth.
  - ✅ **Drift:** atualiza `DIVIDA_TECNICA.md` (move §2 → §3) — fonte da verdade da dívida.
  - ✅ **Lock behavior:** depende de `SKILL_LOCK_HUB` (Bloco 41) — para o piloto, lock manual via `LOCKS.md` é suficiente; ver §4 deste doc.
  - ✅ **Cross-HUB blast radius:** controlado por `allowed_paths` resolvida; humano valida no Gate #1.
  - ✅ **LGPD exposure:** baixo — DTs ativos no piloto não tocam dados pessoais.
- **Pilot readiness:** ✅ **GO com supervisão SAFE** (humano ao vivo no Gate #1 e #2 do primeiro uso).

### 2.6 SKILL_EXEC_STABILIZATION — Execution S (rede de segurança)

- **Rationale:** rede de segurança para fixes operacionais (race, idempotência, retry, drift pequeno) sem mudar produto. Histórico forte (memórias `pdv_caixa_estabilizacao`, `cancelamento_venda_fechamento`, `credito_cliente_persistente`).
- **Restrictions:**
  - `allowed_paths: dynamic`.
  - `denied_paths` cobre cores, schema, auth, `lib/financeiro/contracts/**` (contratos financeiros são intocáveis), `lib/omni-agent/executores/**`.
  - `expected_diff_max: 300`, `files_max: 8`, `duration_max: PT3H`.
  - **Não muda produto** — guard explícito; se "estabilização" disfarça mudança de comportamento, ABORT e sugere `EXEC_FEATURE_S`.
- **Multi-loja deep validation:**
  - ✅ **Tenant safety:** estabilização não pode introduzir queries cross-tenant; AUDIT pós-impl valida.
  - ✅ **storeId:** scope sempre passado em `proposal_ref` (humano confere no Gate #1).
  - ✅ **Rollback:** mesma rede do `EXEC_DEBT_ITEM`.
  - ✅ **Drift:** se mitigou risco, move `RISCOS.md` R-NN de §2 para §4.
  - ✅ **Lock behavior:** lock manual via `LOCKS.md` no piloto.
  - ✅ **Cross-HUB blast radius:** monitorado pela matriz de serialização (`SKILL_TAXONOMY §6`).
  - ✅ **LGPD exposure:** baixo — fixes operacionais raramente tocam PII.
- **Pilot readiness:** ✅ **GO com supervisão SAFE**.

### 2.7 SKILL_EXEC_TESTING — Execution S (test-only)

- **Rationale:** cria/expande testes sem alterar produto. Especialmente útil para **testes de multi-loja** (isolamento `storeId` em integração / E2E).
- **Restrictions:**
  - `allowed_paths: dynamic` — tipicamente `**/*.test.ts`, `**/*.spec.ts`, `**/__tests__/**`, `tests/**`, `e2e/**`.
  - `denied_paths` cobre schema, auth, cores, `package.json`, `tsconfig.json`.
  - **Não cria mock enganoso** — princípio "real ou nada" (CLAUDE.md).
  - **Não altera código sob teste** — teste e código são commits separados (= skills separadas).
- **Pilot readiness:** ✅ **GO** — recomendado **antes** do primeiro uso real de `EXEC_DEBT_ITEM` para subir cobertura de regressão multi-loja.

### 2.8 SKILL_HANDOFF_MVP — Governance (bridge)

- **Rationale:** MVP do `SKILL_HANDOFF` (Bloco 41). Padroniza encerramento de execução com handoff curto/rastreável. Bridge mínimo para o piloto.
- **Restrictions:**
  - `allowed_paths: ["docs/governance/SESSION_HANDOFF.md", "docs/status/EXECUTION_LOG.md"]`.
  - `denied_paths` cobre **todo** o restante de `docs/**` + áreas de código + `LOCKS.md` (lock é responsabilidade de `SKILL_LOCK_HUB` futura).
  - `expected_diff_max: 80`, `files_max: 2`, `duration_max: PT10M`.
  - `gates: []` — operação de governança não exige gate.
- **Pilot readiness:** ✅ **GO** — usado em **toda** Fase 16 do Engine durante o piloto.

---

## 3. Riscos restantes (não bloqueantes — administráveis)

| # | Risco | Severidade | Mitigação |
|---|---|---|---|
| R-AB-01 | `allowed_paths: dynamic` em 3 skills (DEBT_ITEM, STABILIZATION, TESTING) é convenção, não campo formal | P2 | Humano valida `proposal_ref §5` no Gate #1; v2 formaliza (backlog #16) |
| R-AB-02 | Lock cross-HUB ainda manual (sem `SKILL_LOCK_HUB`) | P1 | `docs/status/LOCKS.md` editado por humano; matriz serialização do `SKILL_TAXONOMY §6` é o guia |
| R-AB-03 | `SKILL_HANDOFF_MVP` é bridge, não substitui versão completa Bloco 41 | P3 | Versão completa virá pós-piloto; MVP cobre o caminho feliz |
| R-AB-04 | 24 skills permanecem `draft` (BENCHMARK_*, AUDIT_*\<não-multi-loja\>, EXEC_FIX_MOCK, EXEC_FEATURE_S, PROPOSE_REFACTOR) | P2 | Aprovação por demanda; piloto não depende delas |
| R-AB-05 | Approval batch não testa runtime — apenas valida governance | P2 | Próximo passo (autorização separada) será dry-run controlado |

---

## 4. Gaps restantes (a tratar antes do dry-run)

1. **`SKILL_LOCK_HUB` ausente** (Bloco 41) — para o piloto, lock manual em `LOCKS.md` é aceitável; humano marca lock no início da sprint e libera no encerramento.
2. **Engine validator** não rejeita silenciosamente PRs que mudam `TEMPLATE_SKILL.md` sem ADR — proteção ainda **convencional**, não mecânica. Risco baixo (1 humano controla).
3. **Test coverage de multi-loja** ainda insuficiente — recomendação forte: rodar `SKILL_EXEC_TESTING` (test_type: multi_loja) antes do primeiro `SKILL_EXEC_DEBT_ITEM` em produção.
4. **`EXECUTION_LOG.md` schema** assume ENTRY 1:1 com skill execution — `ENTRY 002` (aceitação ADR) e `ENTRY 003` (este batch) são entries de governança que reusam o schema. v2 pode introduzir `entry_type: skill_exec|governance`.
5. **`SKILL_PROPOSE_REFACTOR` não aprovada** — não é peça-chave do piloto, mas pode aparecer durante o sprint se audit identificar refactor pequeno. Aceitável continuar `draft`; promove se necessário (batch posterior).

---

## 5. Readiness — dry-run

| Critério | Estado |
|---|---|
| 8 skills com `status: approved` | ✅ |
| Front matter v1 estável (ADR-0002 aceito) | ✅ |
| EXECUTION_LOG schema v1 estável | ✅ |
| Allow-lists validadas | ✅ |
| Denied-lists cobrem áreas protegidas | ✅ |
| Gates 1 e 2 documentados | ✅ |
| Rollback semantics claras | ✅ |
| Multi-loja triad (AUDIT/DEBT/STABILIZATION) validado em profundidade | ✅ |
| `SKILL_LOCK_HUB` mecanizado | ❌ (lock manual aceitável) |
| Cobertura de testes multi-loja | ❌ (rodar TESTING antes) |
| Runtime validator rejeita PRs em `TEMPLATE_SKILL.md` sem ADR | ⚠️ (convencional) |

**Conclusão dry-run:** ✅ **READY com 2 ressalvas** (lock manual + cobertura testes). Dry-run pode prosseguir após autorização explícita do humano.

---

## 6. Readiness — SPRINT_01_MULTI_LOJA (piloto)

| Critério | Estado |
|---|---|
| Skills críticas aprovadas | ✅ (8/8) |
| `SKILL_AUDIT_MULTI_LOJA` aprovada (pré-piloto baseline) | ✅ |
| `SKILL_PROPOSE_SPRINT` aprovada (gera proposta oficial) | ✅ |
| `SKILL_EXEC_DEBT_ITEM` aprovada (executa DT-03) | ✅ |
| `SKILL_EXEC_STABILIZATION` aprovada (rede de segurança) | ✅ |
| `SKILL_EXEC_TESTING` aprovada (cobertura multi-loja) | ✅ |
| `SKILL_HANDOFF_MVP` aprovada (Fase 16) | ✅ |
| Proposta `SPRINT_01_MULTI_LOJA` materializada | ❌ (próxima skill a rodar) |
| AUDIT pré-piloto rodada | ❌ (próxima skill a rodar) |
| Test pass multi-loja baseline | ❌ |
| Dry-run validado | ❌ |
| Lock manual ativado | ❌ |

**Conclusão piloto:** ⚠️ **NÃO READY ainda** — pré-requisitos (AUDIT pré-piloto + dry-run + TESTING baseline) ainda não rodados. Approval batch consolida **governance**; **operações reais exigem autorização separada**.

---

## 7. Recomendações antes da primeira execução real

> Ordem sugerida; **cada item exige autorização humana explícita**. Approval batch **não inicia** nenhum destes.

1. **Rodar `SKILL_AUDIT_MULTI_LOJA`** (modo AUDIT, ticket pré-piloto) — estabelece baseline; gera findings P0/P1/P2/P3.
2. **Rodar `SKILL_EXEC_TESTING`** (test_type: multi_loja) — sobe cobertura E2E de isolamento `storeId` em PDV/Financeiro/Estoque.
3. **Rodar `SKILL_PROPOSE_SPRINT`** com `hub: multi_loja`, `origin_type: debt`, `origin_id: DT-03` — gera draft `SPRINT_PROPOSAL_MULTI_LOJA-01.md`.
4. **Gate #1 humano** — aceita ou ajusta proposta; humano move para `docs/sprints/SPRINT_MULTI_LOJA-S-001.md`.
5. **Dry-run** (modo SAFE) do `SKILL_EXEC_DEBT_ITEM` contra DT-03 — humano supervisiona, sem merge.
6. **Validação pós-dry-run** — sem regressão em PDV/Caixa/Financeiro; AUDIT confirma `storeId` resolvido.
7. **Execução real** — sob autorização explícita, com lock manual ativado em `LOCKS.md`.

---

## 8. Referências

- [`ADR-0002`](../decisions/ADR-0002-skill-front-matter-v1.md) — congelamento Skill Front Matter v1.
- [`SKILL_SCHEMA_V2_BACKLOG.md`](../skills/executoras/SKILL_SCHEMA_V2_BACKLOG.md) — pressão acumulada para v2.
- [`EXECUTION_LOG.md`](./EXECUTION_LOG.md) — ENTRY 003 (este batch).
- [`SKILL_TAXONOMY.md §6`](../execution/SKILL_TAXONOMY.md) — matriz de serialização cross-HUB (essencial para o piloto).
- [`README.md executoras §2`](../skills/executoras/README.md) — catálogo (estado atualizado com este batch).
- [`EXECUTION_ENGINE.md`](../execution/EXECUTION_ENGINE.md) — pipeline 17 fases.
- [`SAFE_GUARDS.md`](../execution/SAFE_GUARDS.md) — limites operacionais.
- [`HUMAN_GATES.md`](../execution/HUMAN_GATES.md) — gates 1 e 2.
- Memórias relacionadas: `project_pdv_multi_terminais_fase1`, `project_pdv_multi_terminais_fase2_lock`, `project_importador_produtos_match_seguro`, `project_pdv_caixa_estabilizacao`.
