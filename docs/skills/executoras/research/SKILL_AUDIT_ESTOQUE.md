---
# IDENTITY
skill_id: SKILL_AUDIT_ESTOQUE
version: v1
status: draft
category: 1
size: S
hub: estoque

# CAPABILITIES
modes_allowed: [SAFE, OVERNIGHT, COWORK, AUDIT]
read_only: true
benchmark_required: false

# BOUNDARIES
allowed_paths:
  - "docs/audits/**"
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
expected_diff_max: 0
files_max: 1
duration_max: PT1H
commits_max: 1

# I/O CONTRACT
input:
  required: [audit_type]
  optional: [scope_paths, ticket_id, sprint_topic, since_version]
output:
  artifacts:
    - "docs/audits/AUDITORIA_ESTOQUE_v<NN>.md"
    - "docs/audits/AUDIT_<ticket_id>.md"

# GOVERNANCE
gates: []
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
roadmap: docs/roadmaps/ROADMAP_ESTOQUE.md
related_adrs: []
related_memories:
  - project_sku_gc_saneamento
  - project_import_nao_sobrescreve_estoque
  - project_importador_produtos_lotes
  - project_importador_produtos_match_seguro
template_version: v1
---

# SKILL_AUDIT_ESTOQUE

> Skill de auditoria do **estado real** do HUB Estoque. Foco em **ledger, movimentação, custo, multi-depósito, oversell, saldo negativo, NF-e XML, divergências, sync marketplace, integridade**.

---

## 1. Propósito

Auditar Estoque de forma técnica e quantitativa: lê código (`lib/importador-produtos/**`, `lib/operacoes/adapters/os-estoque*`, `components/dashboard/configuracoes/importador-*/**`, `lib/estoque*`), governança, memórias e auditorias anteriores; gera `AUDITORIA_ESTOQUE_v<NN>.md`.

**Diferença vs SKILL_BENCHMARK_ESTOQUE:**
- BENCHMARK olha mercado (Bling, Tiny, ANYMARKET).
- AUDIT olha estado real interno (ledger consistência, drift, importador defensivo, multi-depósito ausente).

**O que ela NÃO faz:**
- Não altera código, não decide modelo `Deposito` (ADR pendente BL-12), não regride importador.

---

## 2. Quando usar

### 2.1 Standalone
- A cada **encerramento de fase do Estoque** (Fase 1 → Fase 2 multi-depósito).
- A cada **trimestre** (saúde geral + integridade ledger).
- Antes de **integrar Marketplace** (auditoria preventiva — adapter sync depende de Estoque íntegro).
- Após **importação massiva** (validar defesa 3 camadas).

### 2.2 Sprint-scoped (Fase 12)
- Pós-impl de qualquer sprint do Estoque.

---

## 3. Quando NÃO usar

- Para decidir modelo `Deposito` → benchmark + ADR.
- Para checar UX do importador → escopo diferente; foco aqui é integridade.
- Sem `audit_type` → rejeita.

---

## 4. Input contract

Mesma matriz de `SKILL_AUDIT_PDV §4`.

| Campo | Tipo | Obrig | Exemplo |
|---|---|---|---|
| `audit_type` | enum | sim | `dados` (ledger), `saude_geral`, `forense` (pós-incidente importador), `fiscal` (CFOP/NCM) |
| `scope_paths` | string[] | não | `["lib/importador-produtos/**"]` |
| `ticket_id` | string | não | `EST-S-001` |
| `sprint_topic` | string | não | `"modelagem multi-depósito"` |
| `since_version` | string | não | `v1` |

---

## 5. Output contract

Mesma estrutura de `SKILL_AUDIT_PDV §5`. Output: `AUDITORIA_ESTOQUE_v<NN>.md` ou `AUDIT_<ticket_id>.md`.

---

## 6. Fases do pipeline usadas

Mesma matriz de `SKILL_AUDIT_PDV §6`.

---

## 7. Comportamento específico — foco Estoque

A skill audita obrigatoriamente as **10 dimensões críticas**:

1. **Ledger** — toda mudança de saldo veio de `MovimentacaoEstoque`? Existe edição direta de saldo no código?
2. **Movimentação** — todas com `usuario`, `documento`, `custoUnitario`, `valorTotal`, `origem`? sem `null` em campos críticos?
3. **Custo** — `custoUnitario` coerente com importações; cost layering atual (média) sem distorção.
4. **Multi-depósito** — modelo `Deposito` existe? gap esperado P0 (BL-12).
5. **Oversell** — anti-negativo configurado por loja? alerta/bloqueio respeitado?
6. **Saldo negativo** — query: produtos com `saldo < 0` em produção (excluído Item Avulso `__avulso__`).
7. **NF-e XML entrada** — parser existe? quarentena para XML malformado?
8. **Divergência** — drift entre `sum(MovimentacaoEstoque) ≠ Produto.saldo`?
9. **Sync marketplace** — adapter `marketplace-estoque.ts` existe? gap esperado (greenfield).
10. **Integridade do importador** — defesa 3 camadas (`match.ts`, chave forte/fraca, defesa multi-loja, modo "criar") íntegra; sem regressão para "modo update massivo".

**Auditorias prévias:** nenhuma dedicada ainda.

---

## 8. Failure modes específicos

| Cenário | Ação |
|---|---|
| `MovimentacaoEstoque` com `usuario: null` ou `documento: null` (excluído sistema) | finding P1 (auditoria comprometida) |
| Produto com `saldo < 0` que não seja `__avulso__` | finding P0 (oversell ou drift) |
| Drift `sum(MovimentacaoEstoque) ≠ Produto.saldo` para qualquer produto | finding **P0** (ledger quebrado) |
| Encontra escrita direta em `Produto.saldo` em código (sem passar por ledger) | finding **P0** (princípio quebrado) |
| Importador rodando em "modo update massivo" (defesa 3 camadas violada) | finding **P0** (regressão crítica — memória `project_importador_produtos_match_seguro`) |
| Ausência total de modelo multi-depósito | finding P1 esperado (gap conhecido BL-12) |
| Sync marketplace sem reserva otimista (quando existir) | finding P1 (risco oversell R-05) |

---

## 9. Exemplos de uso

### 9.1 SAFE — Auditoria de ledger
```yaml
ticket_id: null
skill: SKILL_AUDIT_ESTOQUE
modo: SAFE
input:
  audit_type: dados
  scope_paths: ["lib/operacoes/adapters/os-estoque*", "lib/estoque*"]
```

### 9.2 OVERNIGHT — Auditoria do importador
```yaml
- ticket_id: null
  skill: SKILL_AUDIT_ESTOQUE
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    audit_type: saude_geral
    scope_paths: ["lib/importador-produtos/**"]
```

### 9.3 Forense — pós-incidente
```yaml
ticket_id: null
skill: SKILL_AUDIT_ESTOQUE
modo: SAFE
input:
  audit_type: forense
  sprint_topic: "investigar drift de saldo após importação 2026-05-XX"
```

---

## 10. Referências

- [`docs/governance/AUDIT_PROTOCOL.md`](../../../governance/AUDIT_PROTOCOL.md)
- [`docs/audits/TEMPLATE_AUDITORIA.md`](../../../audits/TEMPLATE_AUDITORIA.md)
- [`docs/roadmaps/ROADMAP_ESTOQUE.md`](../../../roadmaps/ROADMAP_ESTOQUE.md)
- Dívida relacionada: DT-08 (sem multi-depósito).
- Blockers: BL-07 (multi-depósito Fase 2), BL-12 (ADR `Deposito`).
- Riscos: R-05 (oversell Marketplace), drift ledger.
- Auditorias prévias: **nenhuma dedicada ainda**.

---

## 11. Notas

- Estoque tem **ledger profissional** (Fase 2 adapter OS→Estoque 21/05/2026) — auditoria deve confirmar e proteger esse padrão.
- **Importador defensivo** com chave forte/fraca, defesa multi-loja em 3 camadas, modo "criar" padrão (memória `project_importador_produtos_match_seguro`) — **regressão é P0**.
- **Multi-depósito ausente** é gap conhecido (DT-08) — finding esperado P1; sprint dedicada destrava Marketplace.
- Auditoria forense pós-importação massiva é cenário recorrente — vale ter pronta.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
