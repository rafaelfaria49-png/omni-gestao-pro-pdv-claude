---
title: Execution Log — registro append-only de execuções de skill
status: vivo (append-only)
owner: Execution Engine (automático) + revisão humana mensal
last_update: 2026-05-27
schema_version: v1
---

# 📜 Execution Log

> **Append-only.** Entradas existentes nunca são editadas. Correção = nova entrada.
> **Schema v1 congelado em 2026-05-27.** Mudança exige ADR.
> Engine grava aqui na **Fase 16** do pipeline ([`EXECUTION_ENGINE.md §2`](../execution/EXECUTION_ENGINE.md)).

---

## 1. Schema de uma entrada (v1)

Cada execução de skill produz **um bloco YAML** abaixo do separador `---`:

```yaml
# ─── ENTRY ────────────────────────────────────────────────────────
ticket_id: <HUB-SLUG>-<TAMANHO>-<NNN>     # ex: MULTI_LOJA-S-001
skill_id: SKILL_<NOME>                     # ex: SKILL_EXEC_DEBT_ITEM
skill_version: v1
ia: sonnet                                  # opus|sonnet|composer|claude_code|cowork
modo: SAFE                                  # SAFE|OVERNIGHT|COWORK|AUDIT
started_at: 2026-05-28T09:14:00-03:00      # ISO 8601 com timezone
ended_at: 2026-05-28T11:42:00-03:00        # null se em andamento
duration: PT2H28M                           # ISO 8601 duration
fases_completas: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17]
fase_falha: null                            # null ou número da fase
resultado: encerrada                        # encerrada|rejeitada|abortada|rollback|cancelada|blocked|expired
pr: null                                    # número do PR (overnight) ou null (SAFE merge direto)
branch: skill/MULTI_LOJA-S-001              # branch git criada
commit_anterior: <hash>                     # HEAD antes da skill começar
commit_final: <hash>                        # HEAD final (ou null se rollback)
rollback: false
diff:
  added: 247
  removed: 18
  files_modified: 6
gates:
  gate_1:
    approved_by: Rafael
    approved_at: 2026-05-28T09:48:00-03:00
    pending: PT34M
    notes: "Allow-list ok. Riscos cobertos."
  gate_2:
    approved_by: Rafael
    approved_at: 2026-05-28T11:55:00-03:00
    pending: PT12M
    notes: "Auditoria limpa. Merge clicado."
audit_findings: {P0: 0, P1: 0, P2: 1, P3: 0}
benchmark: null                             # ou path para BENCHMARK_<ticket>.md
sprint: docs/sprints/SPRINT_MULTI_LOJA-S-001.md
proposta: docs/sprints/proposals/SPRINT_MULTI_LOJA-S-001.md
auditoria: docs/audits/AUDIT_MULTI_LOJA-S-001.md
adr_criada: null                            # ou ADR-NNNN
memoria_criada: null                        # ou memory/<slug>
docs_atualizados:
  - docs/ai/CURRENT_STATUS_OVERVIEW.md
  - docs/roadmaps/ROADMAP_MULTI_LOJA.md
  - docs/status/DIVIDA_TECNICA.md
flags: []                                   # ex: [--with-protected-areas:auth.ts]
notes: ""
```

---

## 2. Campos obrigatórios vs opcionais

| Campo | Obrig | Pode ser null |
|---|---|---|
| `ticket_id`, `skill_id`, `skill_version`, `ia`, `modo` | sim | não |
| `started_at` | sim | não |
| `ended_at` | sim | sim (se em andamento) |
| `duration` | sim | sim (se em andamento) |
| `fases_completas` | sim | `[]` se abortou no INTAKE |
| `fase_falha` | sim | sim (se resultado=encerrada) |
| `resultado` | sim | não |
| `pr`, `branch`, `commit_anterior`, `commit_final` | sim | sim conforme contexto |
| `rollback` | sim | não |
| `diff` | sim | objeto vazio se não houve mudança de código |
| `gates` | sim | objeto vazio se categoria não exige gate |
| `audit_findings` | sim | `{P0:0,P1:0,P2:0,P3:0}` se Fase 12 não rodou |
| `benchmark`, `sprint`, `proposta`, `auditoria` | sim | sim conforme aplicável |
| `adr_criada`, `memoria_criada` | sim | sim (conditional) |
| `docs_atualizados` | sim | `[]` se nada atualizado |
| `flags` | sim | `[]` |
| `notes` | sim | `""` |

---

## 3. Resultados possíveis

| Resultado | Significado |
|---|---|
| `encerrada` | Pipeline completou 17 fases com sucesso |
| `rejeitada` | Humano rejeitou em Gate #1 ou #2 |
| `abortada` | Pre-flight falhou (área protegida sem flag, blocker P0, lock ocupado, etc.) |
| `rollback` | Falha pós-impl com reversão automática |
| `cancelada` | Humano cancelou explicitamente |
| `blocked` | Skill tentou violar safe-guard (touch fora allow-list, comando proibido, diff > 500 etc.) |
| `expired` | Overnight PR draft sem revisão > 48h |

---

## 4. Convenções

- **Append-only:** entradas antigas nunca editadas. Erro em entrada → nova entrada com `notes: "correção de <ticket_id>: <o quê>"`.
- **Timestamps com timezone** (ISO 8601). Brasil = `-03:00`.
- **Durations em ISO 8601** (`PT2H28M`).
- **Paths relativos à raiz** do repo.
- **Separador entre entradas:** linha `---` (3 traços), seguida de `# ─── ENTRY ───…`.
- **Ordem:** cronológica (mais antigo no topo, mais recente embaixo).

---

## 5. Análise periódica (mensal)

A cada mês, humano (ou skill futura `SKILL_LOG_ANALYSIS`) gera um resumo:
- Total de execuções.
- Taxa de sucesso por skill.
- Tempo médio em Gate #1 e Gate #2.
- Skills com mais `blocked` (revisão de design).
- Skills com mais `rollback` (instabilidade).
- HUBs com mais atividade.

Resumo persistido em `docs/status/EXECUTION_LOG_DIGEST_<YYYY-MM>.md` (futuro).

---

## 6. Privacidade e auditoria

- **Quem pode ler:** qualquer um com acesso ao repo (é auditoria operacional).
- **Quem pode escrever:** apenas o Execution Engine (skills Cat. 6 Governance).
- **Sem dados pessoais de cliente final** neste log (apenas IDs internos, tickets, hashes).
- **Vínculo com auditoria externa:** se um incidente for materializado, este log é evidência primária.

---

## 7. Versionamento do schema

- **v1** (2026-05-27) — esta versão.
- Mudança em qualquer campo do schema → ADR + bump para v2.
- Entradas v1 preservadas; engine sabe ler ambas.

---

## 8. Entradas

> **Primeira entrada criada:** primeiro caso real da Proposal Layer (ADR-PROP-0002).
> Próxima esperada: sprint piloto `SPRINT_01_MULTI_LOJA` (após ADR-0002 aceito + approval batch).

---

```yaml
# ─── ENTRY 001 ────────────────────────────────────────────────────
ticket_id: ADR-PROP-0002
skill_id: SKILL_PROPOSE_ADR
skill_version: v1
ia: opus
modo: SAFE
started_at: 2026-05-27T00:00:00-03:00
ended_at: 2026-05-27T00:25:00-03:00
duration: PT25M
fases_completas: [1, 2, 3, 4, 6, 16, 17]
fase_falha: null
resultado: encerrada
pr: null
branch: skill/ADR-PROP-0002
commit_anterior: null   # docs-only; sem snapshot git formal nesta execução de definição
commit_final: null
rollback: false
diff:
  added: ~440
  removed: 0
  files_modified: 2
gates:
  gate_1:
    approved_by: null   # gate é aplicado AO ADR proposto pelo humano, não à skill geradora
    approved_at: null
    pending: null
    notes: "Gate humano aguardando: humano deve aceitar/modificar/rejeitar o draft ADR_PROPOSAL_0002 e renomear para ADR-0002-skill-front-matter-v1-freeze.md ao aceitar."
  gate_2:
    approved_by: null
    approved_at: null
    pending: null
    notes: "N/A para SKILL_PROPOSE_ADR (gera draft, não mergeia código)."
audit_findings: {P0: 0, P1: 0, P2: 0, P3: 0}   # Fase 12 não aplicável a Proposal
benchmark: null
sprint: null
proposta: docs/decisions/drafts/ADR_PROPOSAL_0002_FRONT_MATTER_V1.md
auditoria: null
adr_criada: null   # ADR-0002 ainda em draft; vira oficial quando humano aceitar
memoria_criada: null
docs_atualizados:
  - docs/status/EXECUTION_LOG.md
flags: []
notes: "Primeiro caso real da Proposal Layer (Bloco 34). Verificação de duplicidade ok (apenas ADR-0001 legado existe). Recomendação: aceitar Alternativa A (congelar v1 até pós-piloto). Aguardando aprovação humana antes de criar SKILL_SCHEMA_V2_BACKLOG.md."
```
