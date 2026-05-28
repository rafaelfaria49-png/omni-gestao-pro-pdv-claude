---
# IDENTITY
skill_id: SKILL_DOC_REFRESH
version: v1
status: approved
category: 1
size: S
hub: cross

# CAPABILITIES
modes_allowed: [SAFE, OVERNIGHT, COWORK]
read_only: false
benchmark_required: false

# BOUNDARIES
allowed_paths:
  - "docs/ai/CURRENT_STATUS_OVERVIEW.md"
  - "docs/status/EXECUTION_LOG.md"  # append-only
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
  - "docs/roadmaps/**"           # roadmaps continuam humanos no v1
  - "docs/decisions/**"          # ADRs continuam humanos
  - "docs/status/DIVIDA_TECNICA.md"
  - "docs/status/RISCOS.md"
  - "docs/status/BLOCKERS.md"
  - "docs/status/MOCKS_TRACKING.md"
  - "docs/status/LOCKS.md"
  - "docs/status/OVERNIGHT_QUEUE.md"
  - "docs/ai/CURRENT_STATUS.md"  # histórico completo: imutável
  - "docs/sprints/**"            # sprints encerradas: imutáveis
  - "docs/audits/**"             # auditorias publicadas: imutáveis
  - "docs/memory/**"             # memória de continuidade: humana
  - "docs/governance/**"         # governança: humana
  - "docs/skills/**"             # skills: humanas
  - "docs/execution/**"          # execução: humana
  - "docs/blueprint/**"          # blueprint: humano
  - "docs/architecture/**"       # arquitetura: humana
  - "docs/modules/**"            # módulos: humanos
expected_diff_max: 150
files_max: 2
duration_max: PT20M
commits_max: 1

# I/O CONTRACT
input:
  required: [reason]
  optional: [scope_sections, dry_run, ticket_id]
output:
  artifacts:
    - "docs/ai/CURRENT_STATUS_OVERVIEW.md"   # atualizado (não criado)
    - "docs/status/EXECUTION_LOG.md"         # 1 entrada append-only

# GOVERNANCE
gates: [GATE_2_MERGE]   # única Research que exige gate (porque ESCREVE em doc estratégica)
audit_required: false
adr_required: never

# LIFECYCLE
owner: produto + Sonnet
approved_by: Rafael
approved_at: 2026-05-27T01:30:00-03:00
deprecated_by: null
deprecated_at: null
last_review: 2026-05-27

# REFERENCES
roadmap: null   # skill cross-HUB, sem roadmap origem
related_adrs: []
related_memories: []
template_version: v1
---

# SKILL_DOC_REFRESH

> **Ponte entre Research (BENCHMARK + AUDIT) e Proposal Layer.**
> **Primeira Research skill com write controlado** — escreve **apenas** em `CURRENT_STATUS_OVERVIEW.md` e append em `EXECUTION_LOG.md`.
> **Maintenance-aware:** mantém overview enxuto, sincronizado, utilizável. Reduz drift documental.

---

## 1. Propósito

Atualizar o **overview operacional** do projeto (`docs/ai/CURRENT_STATUS_OVERVIEW.md`) com base em **leitura ampla** de todas as fontes vivas: roadmaps, status vivos, ADRs, sprints encerradas, auditorias publicadas, benchmark outputs, EXECUTION_LOG.

**O que ela NÃO faz:**
- Não reescreve história (`CURRENT_STATUS.md` imutável).
- Não altera ROADMAPs (`docs/roadmaps/**` humano).
- Não altera ADRs (humanos).
- Não altera status vivos (DIVIDA_TECNICA, RISCOS, BLOCKERS, MOCKS_TRACKING — humanos).
- Não interpreta além do necessário — consolida fatos, não opina.
- Não roda automática (cron, watcher) — apenas sob demanda.
- Não excede 150 linhas de diff (overview é enxuto por princípio).

---

## 2. Quando usar

### 2.1 Eventos típicos que disparam DOC_REFRESH

- Sprint encerrada (ticket virou `encerrada`).
- Blocker destravado (BL-NN movido para §3 de `BLOCKERS.md`).
- Dívida paga (DT-NN movido para §3 de `DIVIDA_TECNICA.md`).
- Risco materializado ou mitigado.
- Auditoria publicada com findings P0/P1 relevantes.
- ADR aceito (decisão estratégica).
- Mock removido (MOCK-NN movido para §3).
- Fase de roadmap encerrada.

### 2.2 Eventos que NÃO devem disparar

- Cada commit de código.
- Cada execução de skill (overview não é log).
- Mudanças cosméticas.
- Decisões pendentes (não vão para overview até virarem ADR/sprint).

---

## 3. Quando NÃO usar

- Sem `reason` definido → rejeita.
- Quando ainda não há mudança real de estado desde a última execução.
- Para "limpar" o overview retroativamente → estado vivo, não rewrite histórico.
- Para registrar decisão arquitetural → use ADR, não overview.
- Para mover dívida/risco/blocker entre §2/§3 → humano faz, skill só **reflete** o estado atual desses arquivos.

---

## 4. Input contract

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `reason` | string | sim | Por que está rodando agora — vira nota no commit | `"Sprint SPRINT_01_MULTI_LOJA encerrada — DT-03 pago"` |
| `scope_sections` | string[] | não | Seções específicas a atualizar | `["§1", "§5", "§6"]` (default: todas) |
| `dry_run` | bool | não | Gera diff sem persistir | `false` |
| `ticket_id` | string | não | Vincula a ticket (Fase 16 do Engine) | `MLOJA-S-001` |

**Validações:**
- `reason` não pode ser vazio (< 10 chars rejeita).
- `scope_sections` ⊆ seções existentes em `CURRENT_STATUS_OVERVIEW.md`.
- `dry_run: true` gera diff para humano revisar **antes** de aplicar.

---

## 5. Output contract

### 5.1 Mudanças em `docs/ai/CURRENT_STATUS_OVERVIEW.md`

Seções **que a skill pode atualizar:**
- **§1** Mapa de maturidade por HUB (mover 🟠→🟡 ou 🟡→🟢 quando estado mudar).
- **§2** Frentes ativas (sprints em curso — adicionar/remover linhas).
- **§3** Próximas sprints sugeridas (top 5 prioridade — reordenar conforme blockers).
- **§5** Dívidas técnicas críticas (refletir estado atual de `DIVIDA_TECNICA.md` — não decide o que é P0, só reflete).
- **§6** Última atualização significativa (append entrada cronológica).
- `last_update` no front matter.

Seções **que a skill NÃO altera:**
- §4 Áreas protegidas (humano).
- §7 Como atualizar (meta-instrução, fixa).
- §8 Referências cruzadas (humano).

### 5.2 Mudanças em `docs/status/EXECUTION_LOG.md`

**Append único** de entrada padrão (schema v1 do Bloco 32):

```yaml
- ticket_id: <ticket_id ou null>
  skill_id: SKILL_DOC_REFRESH
  skill_version: v1
  ia: sonnet
  modo: SAFE
  started_at: <ISO>
  ended_at: <ISO>
  duration: PT<M>M
  fases_completas: [1,2,3,4,9,10,11,13,16,17]
  resultado: encerrada
  diff:
    added: <N>
    removed: <N>
    files_modified: 1
  notes: "<reason>"
```

---

## 6. Fases do pipeline usadas

| Fase | Aplica? | Observação |
|---|---|---|
| 1 INTAKE | sim | recebe `reason` |
| 2 PRE-FLIGHT | sim | lê fontes (longa lista — ver §7) |
| 3 LOCK | sim | adquire lock em `cross` (especial) ou pula se runtime ainda não tem |
| 4 SCOPE | sim | confirma `dry_run` |
| 5 BENCHMARK | **N/A** |
| 6 PROPOSAL | **N/A** |
| 7 GATE #1 | **N/A** |
| 8 PRE-TESTS | **N/A** (sem código) |
| 9 SNAPSHOT | sim | git snapshot mesmo para doc — permite rollback |
| 10 IMPLEMENT | sim | escrita controlada em 1–2 arquivos |
| 11 POST-TESTS | **N/A** (sem código) |
| 12 AUDIT | **N/A** (não exige auditoria) |
| 13 GATE #2 | **sim** — humano valida o diff antes de aceitar (única Research com gate) |
| 14 DOC UPDATE | **N/A** (esta skill É o doc update) |
| 15 ADR/MEMORY | **N/A** |
| 16 LOG | sim | append em EXECUTION_LOG |
| 17 LOCK RELEASE | sim | |

**Diferença chave vs outras Research:** **GATE #2 ativo** — humano sempre revê o diff antes do merge. Sem gate, risco de drift documental autoritativo.

---

## 7. Fontes que a skill lê (pre-flight)

| Fonte | Para quê |
|---|---|
| `docs/ai/CURRENT_STATUS_OVERVIEW.md` | estado atual a atualizar |
| `docs/ai/CURRENT_STATUS.md` | histórico (referência) |
| `docs/roadmaps/INDEX.md` + cada `ROADMAP_<HUB>.md` | maturidade dos HUBs, sprint atual, blockers |
| `docs/status/DIVIDA_TECNICA.md` | dívidas P0/P1 ativas |
| `docs/status/RISCOS.md` | top riscos ativos |
| `docs/status/BLOCKERS.md` | top blockers ativos |
| `docs/status/MOCKS_TRACKING.md` | mocks ativos risco 🔴 |
| `docs/status/EXECUTION_LOG.md` | últimas execuções |
| `docs/decisions/INDEX.md` | ADRs novos aceitos |
| `docs/sprints/SPRINT_*.md` (encerradas) | sprints encerradas desde última execução |
| `docs/audits/AUDITORIA_*.md` + `AUDIT_*.md` | auditorias publicadas |
| `docs/audits/benchmarks/BENCHMARK_*.md` | benchmarks recentes (consulta, não copia) |
| `docs/governance/SESSION_HANDOFF.md` | handoffs recentes |

**Cap de leitura:** 30 arquivos por execução. Excedeu → marca `truncated: true` no log.

---

## 8. Comportamento específico

- **Append-only sempre que possível** — §6 do overview é append; §5 é refletido (rewrite limitado às linhas mudadas); §1, §2, §3 são edição focada.
- **Sem opinião editorial** — skill consolida fatos das fontes; "dívida X virou P0" só se aparecer em `DIVIDA_TECNICA.md` com severidade `P0`.
- **Sem reordenar §3** sem justificativa — top 5 prioridade muda apenas se blocker novo ou dívida nova de severidade superior aparecer.
- **`dry_run: true`** é o **modo recomendado por padrão** no overnight — gera diff em arquivo temporário; humano aprova de manhã.
- **Diff > 150 linhas** = PAUSE — provavelmente overview ficou desatualizado por muito tempo; humano deve revisar manualmente.
- **GATE #2 obrigatório** mesmo em overnight (única Research que para no Gate #2 — outras Research nem têm gate).

---

## 9. Failure modes específicos

| Cenário | Ação |
|---|---|
| `reason` vazio ou < 10 chars | ABORT na Fase 1 |
| `scope_sections` contém seção inexistente | ABORT na Fase 1 |
| Tentativa de escrever fora de `docs/ai/CURRENT_STATUS_OVERVIEW.md` ou `EXECUTION_LOG.md` | ABORT + ROLLBACK (allow-list violada) |
| Diff > 150 linhas | PAUSE + humano (overview cresceu demais — virar dividi) |
| Cap leitura (30 arquivos) excedido | trunca + marca `truncated: true` |
| Nenhuma mudança real detectada vs overview atual | encerrada com `diff_added: 0`, `diff_removed: 0`, nota "no-op" |
| Conflito de merge no overview (humano editou em paralelo) | ABORT + handoff para humano resolver |

---

## 10. Exemplos de uso

### 10.1 SAFE — Pós-sprint encerrada
```yaml
ticket_id: MLOJA-S-001
skill: SKILL_DOC_REFRESH
modo: SAFE
input:
  reason: "Sprint SPRINT_01_MULTI_LOJA encerrada — DT-03 (fallback loja-1) pago"
  scope_sections: ["§1", "§5", "§6"]
  dry_run: false
```

### 10.2 OVERNIGHT — Consolidação noturna (dry-run obrigatório)
```yaml
- ticket_id: null
  skill: SKILL_DOC_REFRESH
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    reason: "Consolidação noturna pós-3 sprints encerradas"
    dry_run: true   # OVERNIGHT sempre dry-run; humano aprova de manhã
```

### 10.3 Pós-ADR aceito
```yaml
ticket_id: null
skill: SKILL_DOC_REFRESH
modo: SAFE
input:
  reason: "ADR-0002 aceito — congelamento do skill front matter v1"
  scope_sections: ["§6"]   # apenas última atualização significativa
```

---

## 11. Referências

- [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md) — pipeline
- [`docs/execution/SAFE_GUARDS.md`](../../../execution/SAFE_GUARDS.md) — limites
- [`docs/execution/HUMAN_GATES.md`](../../../execution/HUMAN_GATES.md) — gate #2 obrigatório
- [`docs/ai/CURRENT_STATUS_OVERVIEW.md`](../../../ai/CURRENT_STATUS_OVERVIEW.md) — alvo de escrita
- [`docs/status/EXECUTION_LOG.md`](../../../status/EXECUTION_LOG.md) — alvo de append
- [`docs/ai/CURRENT_STATUS.md`](../../../ai/CURRENT_STATUS.md) — histórico (read-only)
- Schema do EXECUTION_LOG v1: `EXECUTION_LOG.md §1`.

---

## 12. Notas

- **Primeira Research skill com write controlado** — design extra-conservador: 1 allow-list mínima, GATE #2 ativo, dry-run incentivado.
- **Limite v1:** apenas `OVERVIEW`. ROADMAPs, ADRs, status vivos continuam humanos — não confundir consolidação com decisão.
- **Skill semi-persistente operacional** — `last_update` de OVERVIEW serve de relógio do sistema; outras skills/humanos consultam para saber "quão fresco é o overview".
- **Maintenance-aware** — preserva história, edita estado, nunca apaga contexto.
- **Bridge para Proposal Layer (Bloco 34)** — `SKILL_PROPOSE_SPRINT` lerá `OVERVIEW` atualizado por esta skill para gerar proposta consistente.
- **Próximas evoluções (v2):**
  - Permitir update incremental em `ROADMAP_<HUB>.md §11` (sprint atual).
  - Permitir append em `EXECUTION_LOG.md DIGEST_<YYYY-MM>.md`.
  - Modo `watch` opcional (cron noturno automático).
  - Detecção de "nada mudou desde última execução" como skip-fast (sem rodar pipeline inteiro).

## 13. Versionamento

- **v1** — 2026-05-27, primeira versão (draft). **Última skill da camada Research. Encerra o Bloco 33.**
