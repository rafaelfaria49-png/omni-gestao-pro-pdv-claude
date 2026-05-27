---
# IDENTITY
skill_id: SKILL_HANDOFF_MVP
version: v1
status: draft
category: 6
size: S
hub: cross

# CAPABILITIES
modes_allowed: [SAFE, OVERNIGHT, COWORK, AUDIT]
read_only: false
benchmark_required: false

# BOUNDARIES
allowed_paths:
  - "docs/governance/SESSION_HANDOFF.md"
  - "docs/status/EXECUTION_LOG.md"          # append-only
denied_paths:
  - "prisma/schema.prisma"
  - "prisma/migrations/**"
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
  - "docs/roadmaps/**"
  - "docs/decisions/**"
  - "docs/sprints/**"
  - "docs/audits/**"
  - "docs/ai/**"
  - "docs/memory/**"
  - "docs/skills/**"
  - "docs/execution/**"
  - "docs/blueprint/**"
  - "docs/architecture/**"
  - "docs/modules/**"
  - "docs/status/DIVIDA_TECNICA.md"
  - "docs/status/RISCOS.md"
  - "docs/status/BLOCKERS.md"
  - "docs/status/MOCKS_TRACKING.md"
  - "docs/status/LOCKS.md"                  # SKILL_HANDOFF não toca em locks; SKILL_LOCK_HUB faz
  - "docs/status/OVERNIGHT_QUEUE.md"
expected_diff_max: 80
files_max: 2
duration_max: PT10M
commits_max: 1

# I/O CONTRACT
input:
  required: [ticket_id, log_entry_ref]
  optional: [proposal_ref, audit_ref, sprint_ref, next_step_hint]
output:
  artifacts:
    - "docs/governance/SESSION_HANDOFF.md"   # entrada append-only no topo da seção "Histórico"
    - "docs/status/EXECUTION_LOG.md"         # append da entrada da própria HANDOFF

# GOVERNANCE
gates: []                                    # governance ops não exigem gate humano
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

# SKILL_HANDOFF_MVP

> **MVP do `SKILL_HANDOFF`** (Bloco 41). Padroniza encerramento de execução com handoff curto, operacional, rastreável.
> Atualizado em `docs/governance/SESSION_HANDOFF.md`. Referencia EXECUTION_LOG entry + lock + proposta + audit.
> **Bridge mínimo para o piloto.** Versão completa virá no Bloco 41 (`docs/skills/executoras/governance/SKILL_HANDOFF.md`).

---

## 1. Propósito

Gerar **handoff curto e estruturado** ao encerrar uma execução, garantindo continuidade rápida entre IAs/sessões. **Não substitui** CURRENT_STATUS, DOC_REFRESH, roadmap ou audit — apenas encerra a execução com referências cruzadas.

**O que ela NÃO faz:**
- Não escreve narrativa longa.
- Não explica arquitetura.
- Não repete roadmap.
- Não substitui CURRENT_STATUS (`SKILL_DOC_REFRESH` faz isso).
- Não atualiza status vivos (DIVIDA, RISCOS, BLOCKERS, MOCKS) — execution skills fazem isso direto.
- Não libera lock — `SKILL_LOCK_HUB` (Bloco 41) faz; aqui apenas **referencia** o status atual do lock.

---

## 2. Quando usar

- **Fase 16 do Engine** (HANDOFF + LOG) — chamada padrão ao final de qualquer execução.
- **Sessão humana encerrando** — humano pode rodar SKILL_HANDOFF_MVP manualmente para registrar onde parou.
- **Mudança de IA** — humano passa contexto entre Opus → Sonnet → Composer.
- **Pré-pausa longa** (encerramento de dia) — handoff registra estado para retomada.

## 3. Quando NÃO usar

- Para fazer "post-mortem" — usar Prompt #13 de `PROMPTS_OFICIAIS.md`.
- Para gerar relatório executivo — fora de escopo (handoff é operacional).
- Para resumir várias execuções — 1 handoff = 1 execução.

---

## 4. Input contract

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `ticket_id` | string | sim | ID do ticket sendo encerrado | `MULTI_LOJA-S-001` |
| `log_entry_ref` | string | sim | Referência ao ENTRY do EXECUTION_LOG (ex: `ENTRY 001`) | `ENTRY 002` |
| `proposal_ref` | path | não | Proposta consumida | `docs/sprints/proposals/SPRINT_PROPOSAL_MULTI_LOJA-S-001.md` |
| `audit_ref` | path | não | Auditoria pós-impl gerada | `docs/audits/AUDIT_MULTI_LOJA-S-001.md` |
| `sprint_ref` | path | não | Sprint publicada após encerrar | `docs/sprints/SPRINT_MULTI_LOJA-S-001.md` |
| `next_step_hint` | string | não | Sugestão para próximo passo | `"approval batch das 6 skills restantes"` |

**Validações:**
- `ticket_id` válido.
- `log_entry_ref` existe em `EXECUTION_LOG.md`.
- Paths opcionais existem se passados.

---

## 5. Output contract

### 5.1 Update em `docs/governance/SESSION_HANDOFF.md`

Append no início da seção "Histórico" (a mais recente fica no topo) — formato padronizado de 12 seções:

```markdown
---
### HANDOFF — <ticket_id> — <ISO>

**Skill geradora:** SKILL_HANDOFF_MVP v1
**Log entry:** <log_entry_ref>

## CONTEXTO
- Ticket: <ticket_id>
- HUB: <hub>
- Modo: <SAFE | OVERNIGHT | COWORK>
- IA: <opus | sonnet | composer | claude_code | cowork>

## O QUE FOI FEITO
- <bullet 1, conciso>
- <bullet 2>
- <…>

## O QUE NÃO FOI FEITO
- <fora do escopo desta execução>
- <ou: "tudo o que estava no escopo">

## RISCOS
- <risco identificado na execução, ou: "nenhum novo">

## BLOCKERS
- <BL-NN novo, ou: "nenhum">

## PRÓXIMO PASSO
- <ação concreta sugerida; ou next_step_hint>

## LOCK STATUS
- HUB: <hub>
- Estado anterior: active (ticket: <…>)
- Estado atual: released | still_active | abandoned
- Ver: docs/status/LOCKS.md

## TEST STATUS
- tsc: <verde | vermelho | n/a>
- build: <verde | vermelho | n/a>
- vitest: <verde | vermelho | n/a>

## ROLLBACK STATUS
- Snapshot: <commit hash anterior, ou n/a>
- Branch: <skill/<ticket_id>, ou n/a>
- Aplicado: <não | sim — razão>

## FILES ALTERADOS
- <path1>
- <path2>
- (ou: "nenhum — execução read-only/proposta")

## GATES UTILIZADOS
- Gate #1 (proposta): <approved_by + data | n/a>
- Gate #2 (merge): <approved_by + data | n/a | aguardando humano>

## EXECUTION_LOG ENTRY
- <log_entry_ref> em docs/status/EXECUTION_LOG.md
- Resultado: <encerrada | rejeitada | abortada | rollback | cancelada>
```

### 5.2 Append em `docs/status/EXECUTION_LOG.md`

Append de entrada da própria SKILL_HANDOFF_MVP execution (formato schema v1):

```yaml
# ─── ENTRY ────────────────────────────────────────────────────────
ticket_id: HANDOFF-<ticket_pai>
skill_id: SKILL_HANDOFF_MVP
skill_version: v1
ia: <ia>
modo: <modo>
started_at: <ISO>
ended_at: <ISO>
duration: PT<M>M
fases_completas: [1, 2, 10, 16, 17]
resultado: encerrada
diff:
  added: <N>
  removed: 0
  files_modified: 2
gates: {}
notes: "Handoff gerado para <ticket_pai>"
```

---

## 6. Fases do pipeline usadas

| Fase | Aplica? | Observação |
|---|---|---|
| 1 INTAKE | sim | recebe `ticket_id` + `log_entry_ref` |
| 2 PRE-FLIGHT | sim | lê EXECUTION_LOG, LOCKS, proposal/audit/sprint refs (se passados) |
| 3 LOCK | **N/A** (governance ops sem lock formal) |
| 4 SCOPE | sim | confirma diff ≤ 80 linhas (handoff curto) |
| 5–9 | **N/A** |
| 10 IMPLEMENT | sim | escreve em SESSION_HANDOFF.md + LOG |
| 11–13 | **N/A** |
| 14 DOC UPDATE | **N/A** (esta skill É a doc) |
| 15 ADR/MEMORY | **N/A** |
| 16 LOG | sim | append da própria entry |
| 17 LOCK RELEASE | **N/A** |

---

## 7. Comportamento específico

- **Handoff é CURTO** — 12 seções obrigatórias mas cada uma 1-3 bullets máx.
- **Sem narrativa** — frases curtas, fatos.
- **Sem repetir contexto óbvio** — quem ler já tem acesso ao EXECUTION_LOG, proposal, audit.
- **Append no topo** da seção "Histórico" em SESSION_HANDOFF.md (não no fim) — handoff mais recente é o mais visível.
- **Falha gracioso:** se algum campo opcional inválido, marca `notes: "ref inválida"` em vez de abortar.
- **Diff ≤ 80 linhas** — handoff que estoura é narrativa, não handoff.

---

## 8. Failure modes específicos

| Cenário | Ação |
|---|---|
| `log_entry_ref` não existe | ABORT (handoff sem rastreabilidade não vale) |
| Diff > 80 linhas | PAUSE + humano (handoff ficou narrativa) |
| `docs/governance/SESSION_HANDOFF.md` ausente | warn + cria header padrão se humano permitir; senão aborta |
| Tentativa de tocar fora da allow-list | ABORT |
| `ticket_id` referencia execução cancelada/rollback | gera handoff com `LOCK STATUS: abandoned` e `ROLLBACK STATUS: aplicado` |

---

## 9. Exemplos de uso

### 9.1 Pós-execução normal (Fase 16 do Engine)
```yaml
ticket_id: MULTI_LOJA-S-001
skill: SKILL_HANDOFF_MVP
modo: SAFE
input:
  ticket_id: MULTI_LOJA-S-001
  log_entry_ref: ENTRY 002
  proposal_ref: docs/sprints/proposals/SPRINT_PROPOSAL_MULTI_LOJA-S-001.md
  audit_ref: docs/audits/AUDIT_MULTI_LOJA-S-001.md
  sprint_ref: docs/sprints/SPRINT_MULTI_LOJA-S-001.md
  next_step_hint: "rodar SKILL_DOC_REFRESH para atualizar OVERVIEW"
```

### 9.2 Encerramento de sessão humana
```yaml
ticket_id: SESSION-2026-05-27
skill: SKILL_HANDOFF_MVP
modo: SAFE
input:
  ticket_id: SESSION-2026-05-27
  log_entry_ref: ENTRY 001
  next_step_hint: "humano revisa ADR-0002 amanhã"
```

---

## 10. Referências

- [`docs/governance/SESSION_HANDOFF.md`](../../../governance/SESSION_HANDOFF.md) — formato canônico de handoff (Bloco 3)
- [`docs/status/EXECUTION_LOG.md`](../../../status/EXECUTION_LOG.md) — schema v1 das entries
- [`docs/status/LOCKS.md`](../../../status/LOCKS.md) — referenciado mas não modificado por esta skill
- [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md) — Fase 16
- `SKILL_LOCK_HUB` (Bloco 41, ainda não criada) — quem libera lock; handoff apenas referencia status
- `SKILL_DOC_REFRESH` (Bloco 33) — quem atualiza OVERVIEW; handoff sugere chamar depois quando aplicável

---

## 11. Limitações do MVP

| Limitação | Impacto | Resolução planejada |
|---|---|---|
| Sem template auto-gerado da estrutura — humano lê padrão e replica | Risco de campos faltantes | Bloco 41 — `SKILL_HANDOFF` formal com schema YAML estrito |
| Sem deduplicação de handoffs (mesmo ticket pode gerar 2) | Vira ruído visual em SESSION_HANDOFF.md | Bloco 41 — check de existência prévia |
| Sem `replay` automatizado a partir do handoff | Continuidade depende de humano ler | Bloco 41 — `SKILL_REPLAY_FROM_HANDOFF` futura |
| Sem integração com OVERNIGHT_QUEUE (não move ticket de pending para done) | Humano coordena | Bloco 37 — overnight protocol completo |
| Não rastreia handoffs cross-IA (passagem Opus → Sonnet) | Apenas registra; humano coordena | Bloco 41 — campo `next_ia: <…>` no handoff |

---

## 12. Diferença SKILL_HANDOFF_MVP vs SKILL_HANDOFF (Bloco 41 futuro)

| Aspecto | MVP (este) | Bloco 41 (futuro) |
|---|---|---|
| **Localização** | `docs/skills/executoras/runtime/` | `docs/skills/executoras/governance/` |
| **Estrutura output** | 12 seções, formato livre | Schema YAML estrito + validação |
| **Replay** | Não | Sim (`SKILL_REPLAY_FROM_HANDOFF`) |
| **Dedup** | Não | Sim |
| **Integração LOCKS.md** | Apenas referencia | Pode acionar `SKILL_LOCK_HUB release` |
| **Cross-IA handoff** | Apenas anota | Coordena formalmente |
| **Cap diff** | 80 linhas | 120 linhas |
| **Status** | MVP — bridge para piloto | Versão final |

---

## 13. Notas

- **Bridge mínimo para o piloto Multi-loja** — sem isso, Fase 16 do Engine não tem ferramenta automatizada (humano teria que escrever handoff manualmente).
- **Categoria 6 Governance** — não exige gates humanos (operação de sistema).
- **Reutiliza `SESSION_HANDOFF.md`** (Bloco 3) — não cria novo arquivo; respeita governança existente.
- **Sem narrative** é princípio — handoff que vira "essay" perde valor.

## 14. Versionamento

- **MVP-v1** (2026-05-27) — esta versão. Bridge para piloto.
- **v1 formal** (Bloco 41, pós-piloto) — versão completa com replay/dedup.
