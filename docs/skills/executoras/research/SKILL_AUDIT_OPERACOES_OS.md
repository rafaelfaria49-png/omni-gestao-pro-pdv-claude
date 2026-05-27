---
# IDENTITY
skill_id: SKILL_AUDIT_OPERACOES_OS
version: v1
status: draft
category: 1
size: S
hub: operacoes_os

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
    - "docs/audits/AUDITORIA_OPERACOES_OS_v<NN>.md"
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
roadmap: docs/roadmaps/ROADMAP_OPERACOES_OS.md
related_adrs:
  - ADR-0001  # OS_ROUTE_OFICIAL (legado)
related_memories:
  - project_cadastros_ux_e_venda_cliente
  - project_credito_cliente_persistente
template_version: v1
---

# SKILL_AUDIT_OPERACOES_OS

> Skill de auditoria do **estado real** do HUB Operações/OS. Foco em **timeline imutável, idempotência, adapters cross-HUB, dualidade de rotas, payload drift, SLA, garantia**.

---

## 1. Propósito

Auditar OS de forma técnica, baseada em evidência: lê código (`lib/operacoes/services/**`, `lib/operacoes/adapters/**`, `app/actions/operacoes.ts`, `components/operacoes/lovable/**`), governança, ADRs, memórias e auditorias anteriores; gera `AUDITORIA_OPERACOES_OS_v<NN>.md`.

**Diferença vs SKILL_BENCHMARK_OPERACOES_OS:**
- BENCHMARK olha mercado (OmniSys, Servicaa, MaxiManager).
- AUDIT olha estado real interno (adapters, hydration, timeline, rota dupla).

**O que ela NÃO faz:**
- Não altera código, não migra schema, não decommissiona rota legada (auditoria recomenda, sprint executa).
- Não substitui ADR-0001 (legado); audita conformidade com ele.

---

## 2. Quando usar

### 2.1 Standalone
- A cada **encerramento de fase de OS** (Fase 1 → Fase 2 fiscal).
- A cada **trimestre** (saúde geral).
- Após **mudança em adapter** OS→Estoque ou OS→Financeiro.
- Antes de **decommission da rota legada** `/dashboard/os`.

### 2.2 Sprint-scoped (Fase 12)
- Pós-impl de qualquer sprint de OS.

---

## 3. Quando NÃO usar

- Para mapear features novas → benchmark, não auditoria.
- Sem `audit_type` → rejeita.

---

## 4. Input contract

Mesma matriz de `SKILL_AUDIT_PDV §4`.

| Campo | Tipo | Obrig | Exemplo |
|---|---|---|---|
| `audit_type` | enum | sim | `dados` (típico para adapters), `saude_geral`, `forense` |
| `scope_paths` | string[] | não | `["lib/operacoes/adapters/**"]` |
| `ticket_id` | string | não | `OS-S-003` |
| `sprint_topic` | string | não | `"decommission rota legada"` |
| `since_version` | string | não | `v1` |

---

## 5. Output contract

Mesma estrutura de `SKILL_AUDIT_PDV §5`. Output: `AUDITORIA_OPERACOES_OS_v<NN>.md` ou `AUDIT_<ticket_id>.md`.

---

## 6. Fases do pipeline usadas

Mesma matriz de `SKILL_AUDIT_PDV §6`.

---

## 7. Comportamento específico — foco OS

A skill audita obrigatoriamente as **9 dimensões críticas de OS**:

1. **Timeline imutável** — `payload.historico[]` é apendado (nunca editado)? sem entradas órfãs ou sem `usuario`?
2. **Idempotência** — `localKey` (`os-faturamento:{storeId}:{osId}`) único e respeitado em re-faturamento?
3. **Adapter OS→Estoque** — consume/restore/delta com `usuario`, `documento`, `custoUnitario`, `valorTotal` (Fase 2 21/05/2026)?
4. **Adapter OS→Financeiro** — `ContaReceberTitulo` materializado uma única vez por OS?
5. **Rotas duplicadas** — `/dashboard/os` (legado) vs `/dashboard/operacoes-v2` (oficial — ADR-0001): % de tráfego em cada, divergência de dados?
6. **Payload drift** — campos no `payload` JSONB sem espelho em enum Prisma; órfãos; nomes inconsistentes entre versões.
7. **Hydration** — `hydration-service` propaga corretamente cliente real via FK quando payload tem `"—"` (Fix 13)?
8. **SLA** — campos `slaInicio`/`slaPrazo` existem? alerta de atraso ativo?
9. **Garantia** — modelo existe? FK vs JSONB? prazo respeitado?

**Auditorias prévias do OS:** nenhuma dedicada ainda.

**ADR-0001 conformidade:** auditoria sempre confirma que rota oficial está documentada e que rota legada está sinalizada para decommission.

---

## 8. Failure modes específicos

Mesma matriz de `SKILL_AUDIT_PDV §8`, com adições:

| Cenário | Ação |
|---|---|
| Encontra OS com `status: faturada` sem entrada correspondente em `ContaReceber.localKey` | finding P0 (drift adapter, dinheiro) |
| Encontra `MovimentacaoEstoque(origem: os)` sem `usuario`/`documento` | finding P1 (auditoria comprometida) |
| Encontra entrada em rota legada `/dashboard/os` com dados divergentes da oficial | finding P0 (drift entre rotas) |
| Encontra `payload.historico = []` em OS com mudança de status | finding P1 (rastreabilidade quebrada) |

---

## 9. Exemplos de uso

### 9.1 SAFE — Auditoria de dados (adapters)
```yaml
ticket_id: null
skill: SKILL_AUDIT_OPERACOES_OS
modo: SAFE
input:
  audit_type: dados
  scope_paths: ["lib/operacoes/adapters/**", "lib/operacoes/services/**"]
```

### 9.2 OVERNIGHT — Auditoria de rota dupla
```yaml
- ticket_id: null
  skill: SKILL_AUDIT_OPERACOES_OS
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    audit_type: saude_geral
    scope_paths: ["app/dashboard/os/**", "app/dashboard/operacoes-v2/**"]
```

---

## 10. Referências

- [`docs/governance/AUDIT_PROTOCOL.md`](../../../governance/AUDIT_PROTOCOL.md)
- [`docs/audits/TEMPLATE_AUDITORIA.md`](../../../audits/TEMPLATE_AUDITORIA.md)
- [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md)
- [`docs/roadmaps/ROADMAP_OPERACOES_OS.md`](../../../roadmaps/ROADMAP_OPERACOES_OS.md)
- [`docs/decisions/OS_ROUTE_OFICIAL.md`](../../../decisions/OS_ROUTE_OFICIAL.md) — ADR-0001 (legado)
- Dívida relacionada: DT-04 (rota legada `/dashboard/os`), DT-09 (budget-policy hardcoded).
- Riscos: drift entre rotas, drift adapter OS↔Receber.
- Auditorias prévias: **nenhuma dedicada ainda**.

---

## 11. Notas

- OS é HUB **mais maduro em backend** — auditoria provavelmente confirma muitos pontos positivos (adapters Fase 2, hydration FK, timeline imutável, idempotência via localKey).
- **Drift entre rotas legada e oficial** é finding esperado de alta severidade.
- **Próximas auditorias (v2+)** vão poder usar §8 (comparativo) para acompanhar evolução, especialmente decommission da rota legada.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
