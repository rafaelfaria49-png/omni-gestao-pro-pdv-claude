---
# IDENTITY
skill_id: SKILL_EXEC_DEBT_ITEM
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
  - "docs/status/DIVIDA_TECNICA.md"          # move DT-NN de §2 para §3
  - "docs/status/BLOCKERS.md"                # se debt destrava blocker, move BL-NN
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
expected_diff_max: 500
files_max: 10
duration_max: PT4H
commits_max: 10

# I/O CONTRACT
input:
  required: [ticket_id, proposal_ref, debt_id]
  optional: [unblocks]
output:
  artifacts:
    - "docs/audits/AUDIT_<ticket_id>.md"
    - "docs/status/EXECUTION_LOG.md"
  side_effects:
    - "docs/status/DIVIDA_TECNICA.md"        # DT-NN movido §2→§3
    - "docs/status/BLOCKERS.md"              # se aplicável, BL-NN destravado

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
  - project_importador_produtos_match_seguro
  - project_pdv_multi_terminais_fase1
  - project_pdv_multi_terminais_fase2_lock
template_version: v1
---

# SKILL_EXEC_DEBT_ITEM

> **Skill candidata oficial para o piloto SPRINT_01_MULTI_LOJA.**
> Executa **uma dívida técnica específica** (DT-NN de `DIVIDA_TECNICA.md`) já registrada e proposta. Especialmente forte em `storeId`, multi-loja, rollback, evidência, audit pós-impl.

---

## 1. Propósito

Pagar dívida técnica DT-NN com escopo cirúrgico definido pela proposta aprovada: implementar a mudança, atualizar `DIVIDA_TECNICA.md` movendo DT-NN para §3 (paga), destravar BLOCKERS relacionados se aplicável, gerar AUDIT pós-impl.

**Casos típicos:**
- Eliminar fallback `loja-1` silencioso (DT-03 — piloto).
- Eliminar query sem `where.storeId` em rota específica.
- Decommission de rota legada pequena.
- Corrigir PIN supervisor (DT-05).
- Plugar campo CFOP em Item Avulso (DT-06).

**O que ela NÃO faz:**
- Não executa dívida grande (DT marcado como L/XL → não vem como Execution S; vai para Execution M futuro).
- Não muda arquitetura (isso é ADR, não debt).
- Não toca schema (área protegida — denied list).
- Não toca auth (área protegida).
- Não muda fiscal (provedor é decisão de produto + ADR).
- Não cria novo executor Omni Agent (área protegida).

---

## 2. Quando usar

- DT-NN existe em `DIVIDA_TECNICA.md §2` (ativo).
- DT-NN tem `severidade: P0` ou `P1` (não P3 sem urgência).
- Proposta aprovada em `docs/sprints/proposals/` (Gate #1 ok).
- Allow-list da proposta ⊆ allow-list desta skill + paths dinâmicos resolvidos.
- Sem flag `--with-protected-areas` necessária (se necessária, exige `SAFE` + humano ao vivo).

---

## 3. Quando NÃO usar

- DT marcado como L/XL → exige Execution M ou quebra em N debts S.
- DT exige mudança em schema/auth/core → área protegida; sprint dedicada + flag humana ao vivo.
- DT já está em §3 (paga) ou em §4 (aceito) → ABORT.
- Sem proposta aprovada → bloqueado Gate #1.

---

## 4. Input contract

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `ticket_id` | string | sim | ID do ticket | `MULTI_LOJA-S-001` |
| `proposal_ref` | path | sim | Path da proposta aprovada | `docs/sprints/proposals/SPRINT_PROPOSAL_MULTI_LOJA-S-001.md` |
| `debt_id` | string | sim | DT-NN a pagar | `DT-03` |
| `unblocks` | string[] | não | BL-NN que esta debt destrava | `[BL-08]` |

**Validações:**
- `debt_id` existe em `DIVIDA_TECNICA.md §2` com severidade P0 ou P1.
- `proposal_ref` aprovada (`approved_by` + `approved_at` preenchidos).
- `proposal_ref §5` (allow-list) ⊆ allow-list base + dinâmicos.
- `unblocks` (se passado): cada BL-NN existe em `BLOCKERS.md §2`.

---

## 5. Output contract

**Side effects:**
- Código modificado conforme proposta (diff ≤ 500 linhas, ≤ 10 arquivos).
- `docs/status/DIVIDA_TECNICA.md`: DT-NN movido de §2 para §3 com data e sprint que pagou.
- `docs/status/BLOCKERS.md` (se `unblocks` aplicável): cada BL-NN movido de §2 para §3 com data.

**Artefatos:**
- `docs/audits/AUDIT_<ticket_id>.md` (gerado por `SKILL_AUDIT_<HUB>` na Fase 12).
- Entrada append em `docs/status/EXECUTION_LOG.md`.

---

## 6. Fases do pipeline usadas

Todas as 17. Sem desvios.

**Observações específicas:**
- Fase 2 PRE-FLIGHT: lê DT-NN; resolve `allowed_paths` dinâmicos do `proposal_ref §5`.
- Fase 5 BENCHMARK: **pulada** (debt conhecida, sem feature nova).
- Fase 12 AUDIT: **especialmente importante**; usa `SKILL_AUDIT_<HUB>` correspondente. Se debt envolve multi-loja, `SKILL_AUDIT_MULTI_LOJA` no escopo da sprint.
- Fase 13 GATE #2: humano valida com **especial atenção** a evidência (testes verdes + AUDIT sem P0).

---

## 7. Comportamento específico — foco multi-loja

A skill é **especialmente forte em multi-loja** (piloto natural):

- **`storeId` everywhere** — implementação deve garantir todo write em scope tem `storeId` correto.
- **`loja-1` proibido** — se debt for DT-03, skill **falha** se introduzir nova ocorrência de `loja-1` em qualquer lugar.
- **Rollback granular** — cada commit é checkpoint; rollback restaura branch para snapshot da Fase 9.
- **Evidência obrigatória no AUDIT** — antes/depois de:
  - Queries detectadas sem `storeId` (deve ser 0 após).
  - Ocorrências de `loja-1` (deve ser 0 após).
  - Testes E2E de isolamento (devem passar).
- **Audit pós-impl** com regra de upgrade ativa (P1 multi-loja → P0).

---

## 8. Failure modes específicos

| Cenário | Ação |
|---|---|
| `debt_id` não existe em §2 | ABORT |
| `debt_id` em §3 (já paga) ou §4 (aceito) | ABORT |
| Proposta toca área protegida sem flag | ABORT (proposta mal escrita) |
| Diff > 500 linhas | PAUSE + humano |
| Implementação introduz nova ocorrência de `loja-1` ou query sem `storeId` | ABORT + ROLLBACK (regressão crítica) |
| AUDIT pega P0 (multi-loja/dinheiro/fiscal — upgrade automático) | ROLLBACK + escala humano |
| `unblocks` aponta BL inexistente ou já destravado | warn (não bloqueia) |
| Pre-tests vermelho antes de tocar (sujo) | ABORT |

---

## 9. Exemplos de uso

### 9.1 SAFE — Piloto SPRINT_01_MULTI_LOJA
```yaml
ticket_id: MULTI_LOJA-S-001
skill: SKILL_EXEC_DEBT_ITEM
modo: SAFE
input:
  ticket_id: MULTI_LOJA-S-001
  proposal_ref: docs/sprints/proposals/SPRINT_PROPOSAL_MULTI_LOJA-S-001.md
  debt_id: DT-03
  unblocks: [BL-08]
```

### 9.2 OVERNIGHT (fila aprovada — apenas debts pequenos)
```yaml
- ticket_id: PDV-S-008
  skill: SKILL_EXEC_DEBT_ITEM
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    ticket_id: PDV-S-008
    proposal_ref: docs/sprints/proposals/SPRINT_PROPOSAL_PDV-S-008.md
    debt_id: DT-06
```

---

## 10. Referências

- [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md)
- [`docs/execution/SAFE_GUARDS.md`](../../../execution/SAFE_GUARDS.md) — diff ≤ 500, áreas protegidas
- [`docs/execution/HUMAN_GATES.md`](../../../execution/HUMAN_GATES.md) — Gates #1 e #2 obrigatórios
- [`docs/status/DIVIDA_TECNICA.md`](../../../status/DIVIDA_TECNICA.md) — fonte de DT-NN
- [`docs/status/BLOCKERS.md`](../../../status/BLOCKERS.md) — BL-NN para destravar
- [`docs/roadmaps/ROADMAP_MULTI_LOJA.md`](../../../roadmaps/ROADMAP_MULTI_LOJA.md) — piloto SPRINT_01_MULTI_LOJA
- Audit pós-impl: `SKILL_AUDIT_MULTI_LOJA` (peça-chave do piloto).
- ADR-0001 (legado): mudanças em rotas oficiais respeitam.

---

## 11. Notas

- **Skill do piloto oficial** — SPRINT_01_MULTI_LOJA usa esta skill para eliminar DT-03.
- **Mais conservadora que SKILL_EXEC_FIX_MOCK** — debt pode tocar lib/, services não-core, mas com allow-list resolvida da proposta.
- **`allowed_paths: dynamic`** é desvio justificado do front matter — paths resolvidos no PRE-FLIGHT do `proposal_ref §5`. Engine valida estritamente após resolução.
- **AUDIT pós-impl não é opcional** — debt pago sem evidência não é debt pago.
- **Memórias relacionadas:** padrão de "defesa multi-loja em 3 camadas" do importador é modelo replicável para debt de isolamento.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
