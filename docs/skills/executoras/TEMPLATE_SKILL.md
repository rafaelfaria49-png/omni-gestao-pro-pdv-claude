---
# ════════════════════════════════════════════════════════════════
# SKILL FRONT MATTER — API INTERNA OFICIAL (v1)
# ════════════════════════════════════════════════════════════════
# Aprovado e CONGELADO em 2026-05-27 por ADR-0002.
# Ver: docs/decisions/ADR-0002-skill-front-matter-v1.md
# Mudança neste schema exige NOVO ADR + bump para v2 (template
# v1 preservado; engine deve ler ambas versões — sem migração
# forçada). Melhorias acumuladas: ver SKILL_SCHEMA_V2_BACKLOG.md.
# Toda skill DEVE preencher TODOS os campos abaixo.
# Campos vazios = `null`. Listas vazias = `[]`.
# ════════════════════════════════════════════════════════════════

# ─── IDENTITY ───────────────────────────────────────────────────
skill_id: SKILL_<CATEGORIA>_<NOME>          # ex: SKILL_EXEC_FIX_MOCK
version: v1                                  # bump = nova versão imutável
status: draft                                # draft | approved | deprecated
category: 3                                  # 1=research 2=proposal 3=execS 4=execM 5=composite 6=governance
size: S                                      # S (≤4h) | M (≤8h) | L (>8h, exige flag)
hub: pdv                                     # pdv|operacoes_os|financeiro|estoque|marketplace|crm|whatsapp|marketing_ia|omni_agent|bi|multi_loja|cross

# ─── CAPABILITIES ───────────────────────────────────────────────
modes_allowed: [SAFE]                        # subset de [SAFE, OVERNIGHT, COWORK, AUDIT]
read_only: false                             # true = nunca escreve em código
benchmark_required: false                    # true = Fase 5 obrigatória (feature/arq nova)

# ─── BOUNDARIES ─────────────────────────────────────────────────
allowed_paths:                               # globs ESTRITOS — default deny
  - "<path-glob-1>"
  - "<path-glob-2>"
denied_paths:                                # globs negativos (vencem em conflito)
  - "prisma/schema.prisma"
  - "auth.ts"
  - "auth.config.ts"
  - "proxy.ts"
  - ".env*"
expected_diff_max: 500                       # linhas adicionadas + removidas
files_max: 15                                # arquivos modificados
duration_max: PT4H                           # ISO 8601 duration (PT4H = 4h)
commits_max: 20

# ─── I/O CONTRACT ───────────────────────────────────────────────
input:
  required: []                               # ex: [hub, backlog_item_id]
  optional: []                               # ex: [benchmark_targets]
output:
  artifacts: []                              # paths que esta skill produz
                                             # ex: ["docs/sprints/proposals/SPRINT_<ticket>.md"]

# ─── GOVERNANCE ─────────────────────────────────────────────────
gates: [GATE_1_PROPOSAL, GATE_2_MERGE]       # subset de [GATE_1_PROPOSAL, GATE_2_MERGE]
audit_required: true                         # true = Fase 12 obrigatória
adr_required: conditional                    # never | always | conditional

# ─── LIFECYCLE ──────────────────────────────────────────────────
owner: produto + Sonnet
approved_by: null                            # humano que aprovou (preenche ao status=approved)
approved_at: null                            # ISO 8601 datetime
deprecated_by: null
deprecated_at: null
last_review: 2026-05-27                      # data da última revisão da skill

# ─── REFERENCES ─────────────────────────────────────────────────
roadmap: docs/roadmaps/ROADMAP_<HUB>.md      # roadmap origem do escopo
related_adrs: []                             # ex: [ADR-0001, ADR-0042]
related_memories: []                         # ex: ["project_pdv_caixa_estabilizacao"]
template_version: v1                         # versão deste template
---

# SKILL_<NOME>

> Esta seção em diante é **conteúdo humano-legível**. Pode evoluir.
> O front matter acima é **API interna congelada** por [ADR-0002](../../decisions/ADR-0002-skill-front-matter-v1.md) — mudança exige novo ADR + bump para v2.

---

## 1. Propósito

<Uma frase: o que esta skill faz.>

**O que ela NÃO faz:**
- <…>
- <…>

---

## 2. Quando usar

- <Cenário 1>
- <Cenário 2>

## 3. Quando NÃO usar

- <Anti-cenário 1 — e qual skill usar no lugar>
- <Anti-cenário 2>

---

## 4. Input contract (detalhado)

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `hub` | enum | sim | HUB alvo | `financeiro` |
| `…` | … | … | … | … |

**Validações:**
- <…>

**Falhas comuns de input:**
- <…>

---

## 5. Output contract (detalhado)

**Artefatos persistidos:**

| Path | Quando | Conteúdo |
|---|---|---|
| `docs/sprints/proposals/SPRINT_<ticket>.md` | Fase 6 | Proposta da sprint |
| `docs/audits/AUDIT_<ticket>.md` | Fase 12 | Auditoria pós-impl |

**Mudanças em arquivos existentes:**
- `docs/status/EXECUTION_LOG.md` — entrada append-only (Fase 16).
- `docs/ai/CURRENT_STATUS_OVERVIEW.md` — §1, §5, §6 (Fase 14).
- `docs/roadmaps/ROADMAP_<HUB>.md` — §5, §7, §11 (Fase 14).

---

## 6. Fases do pipeline usadas

> Default: todas as 17 do `EXECUTION_ENGINE.md`. Documentar aqui apenas se há **desvio justificado**.

- **Pula Fase 5 (BENCHMARK):** sim/não — justificar
- **Pula Fase 15 (ADR/MEMORY):** sim/não — justificar
- Outras fases: padrão.

---

## 7. Comportamento específico

<Se esta skill faz algo não-óbvio que não está no pipeline padrão, documentar aqui. Não duplicar o pipeline — referenciar.>

Exemplos do que vai aqui:
- "Esta skill SEMPRE cria branch `skill/fix-mock/<MOCK-NN>` ao invés de `skill/<ticket_id>`."
- "Esta skill envia notificação extra ao humano quando AUDIT pega P2 fiscal."
- "Esta skill usa `npm run test:integration` em vez de `npm run test`."

---

## 8. Failure modes específicos

Em adição aos modos de falha padrão do `EXECUTION_ENGINE.md §4`:

| Cenário | Ação |
|---|---|
| <Cenário específico desta skill> | ABORT/PAUSE/ROLLBACK + motivo |

---

## 9. Exemplos de uso

### 9.1 Exemplo SAFE (humano ao vivo)

```yaml
# Intake
ticket_id: <HUB>-S-001
skill: SKILL_<NOME>
modo: SAFE
input:
  hub: <hub>
  item_id: <id>
```

### 9.2 Exemplo OVERNIGHT (se aplicável)

```yaml
# Entrada na fila OVERNIGHT_QUEUE.md
- ticket_id: <HUB>-S-002
  skill: SKILL_<NOME>
  pre_approved_by: <humano>
  pre_approved_at: <ISO>
  input: {…}
```

---

## 10. Referências

- **Pipeline:** [`docs/execution/EXECUTION_ENGINE.md`](../../execution/EXECUTION_ENGINE.md)
- **Limites:** [`docs/execution/SAFE_GUARDS.md`](../../execution/SAFE_GUARDS.md)
- **Gates:** [`docs/execution/HUMAN_GATES.md`](../../execution/HUMAN_GATES.md)
- **Categoria:** [`docs/execution/SKILL_TAXONOMY.md`](../../execution/SKILL_TAXONOMY.md)
- **Roadmap origem:** `docs/roadmaps/ROADMAP_<HUB>.md`
- **ADRs:** <list>
- **Memórias:** <list>

---

## 11. Notas / discussão

<Pontos relevantes do design desta skill. Trade-offs explícitos. Por que esta versão.>

---

## 12. Versionamento

- **v1** — primeira versão aprovada em <data>.
- (futuras versões aqui — antiga preservada como `SKILL_<NOME>_v1.md`)
