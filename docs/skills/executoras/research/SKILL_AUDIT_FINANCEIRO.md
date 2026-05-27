---
# IDENTITY
skill_id: SKILL_AUDIT_FINANCEIRO
version: v1
status: draft
category: 1
size: S
hub: financeiro

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
    - "docs/audits/AUDITORIA_FINANCEIRO_v<NN>.md"
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
roadmap: docs/roadmaps/ROADMAP_FINANCEIRO.md
related_adrs: []
related_memories:
  - project_importador_contas_receber_parcelas
  - project_credito_cliente_persistente
  - project_aprazo_enterprise
  - project_cancelamento_venda_fechamento
  - project_fechamento_caixa_erp_premium
template_version: v1
---

# SKILL_AUDIT_FINANCEIRO

> Skill de auditoria do **estado real** do HUB Financeiro. Foco em **reconciliação, drift, duplicidade, ledger, adapters, contas a receber/pagar, saldo, DRE, cobrança, consistência multi-loja**.
> **Severidade upgrade automático ativo** (P1 envolvendo dinheiro → P0 — regra do AUDIT_PROTOCOL §3).

---

## 1. Propósito

Auditar Financeiro de forma técnica e quantitativa: lê código (`lib/financeiro/services/**`, `lib/financeiro/adapters/**`, `lib/financeiro/contracts/**`, `app/api/credits/**`, `lib/credits/**`), governança, memórias e auditorias anteriores; gera `AUDITORIA_FINANCEIRO_v<NN>.md` com findings P0–P3.

**Diferença vs SKILL_BENCHMARK_FINANCEIRO:**
- BENCHMARK olha mercado (Asaas, Iugu, Conta Azul...).
- AUDIT olha estado real interno (idempotência, drift, mocks vs real, multi-loja).

**O que ela NÃO faz:**
- Não altera código, não decide provedor de cobrança (ADR pendente BL-01), não substitui `financeiro-v2` mock (Sprint via Execution skill).

---

## 2. Quando usar

### 2.1 Standalone
- A cada **encerramento de fase do Financeiro**.
- A cada **trimestre** (saúde geral + reconciliação).
- Após **mudança em adapter** ou em contracts (`localKey`).
- Antes de **plugar boleto/PIX real** (auditoria preventiva).

### 2.2 Sprint-scoped (Fase 12)
- Pós-impl de qualquer sprint do Financeiro.

---

## 3. Quando NÃO usar

- Para escolher gateway → benchmark + ADR.
- Para checar UI do `financeiro-v2` (camada visual) → não é foco; foco aqui é backend.
- Sem `audit_type` → rejeita.

---

## 4. Input contract

Mesma matriz de `SKILL_AUDIT_PDV §4`.

| Campo | Tipo | Obrig | Exemplo |
|---|---|---|---|
| `audit_type` | enum | sim | `dados` (drift), `fiscal` (CFOP/conformidade), `forense` (pós-incidente), `saude_geral` |
| `scope_paths` | string[] | não | `["lib/financeiro/adapters/**"]` |
| `ticket_id` | string | não | `FIN-S-001` |
| `sprint_topic` | string | não | `"substituir mock financeiro-v2"` |
| `since_version` | string | não | `v1` |

---

## 5. Output contract

Mesma estrutura de `SKILL_AUDIT_PDV §5`. Output: `AUDITORIA_FINANCEIRO_v<NN>.md` ou `AUDIT_<ticket_id>.md`.

---

## 6. Fases do pipeline usadas

Mesma matriz de `SKILL_AUDIT_PDV §6`.

---

## 7. Comportamento específico — foco Financeiro

A skill audita obrigatoriamente as **10 dimensões críticas**:

1. **Reconciliação** — toda OS faturada tem `ContaReceber.localKey` único? toda venda PDV materializou corretamente?
2. **Drift financeiro** — soma de `Movimento` = saldo de `Carteira` em qualquer ponto?
3. **Duplicidade** — registros com `localKey` duplicado (queryable via banco)?
4. **Ledger** — `payload.historico[]` apendado em toda mudança de status; sem entries deletadas.
5. **Adapter financeiro** — origens (PDV, OS, futuro Marketplace) gravando com `origin` correto e `localKey` válido?
6. **Contas a Receber / a Pagar** — distribuição por status; títulos sem `clienteId`/`fornecedorId`; vencidos não escalados.
7. **Saldo** — múltiplas contas bancárias modeladas? saldos por conta consistentes? (gap atual: modelo não existe)
8. **DRE / Fluxo de caixa** — view existe? está usando dado real (não mock de `financeiro-v2`)?
9. **Cobrança futura** — pré-checagem antes de Fase 2 (boleto/PIX): código estrutural pronto para adapter de cobrança?
10. **Consistência multi-loja** — todo registro financeiro tem `storeId` correto? fallback `loja-1` aparece em `lib/financeiro/**`?

**Auditorias prévias:** nenhuma dedicada ainda.

**Regra de upgrade ativa:** P1 envolvendo dinheiro/multi-loja vira **P0 automático** (AUDIT_PROTOCOL §3).

---

## 8. Failure modes específicos

| Cenário | Ação |
|---|---|
| Encontra `ContaReceber` com `localKey` duplicado | finding **P0** (duplicidade de receivable, dinheiro) |
| Encontra `Movimento` sem `storeId` ou com `storeId="loja-1"` | finding **P0** (multi-loja + dinheiro = upgrade duplo) |
| Drift `sum(Movimento) ≠ Carteira.saldo` | finding **P0** |
| Encontra `ContaReceberTitulo` órfão (sem OS / sem venda origem) | finding P1 → upgrade P0 (dinheiro) |
| Mock no `financeiro-v2` exposto a usuário sem banner "DADOS DEMO" | finding **P0** (decisão de negócio errada possível) |
| `payload.historico[]` vazio em registro com mudança de status | finding P1 (auditoria comprometida) |

---

## 9. Exemplos de uso

### 9.1 SAFE — Auditoria de reconciliação
```yaml
ticket_id: null
skill: SKILL_AUDIT_FINANCEIRO
modo: SAFE
input:
  audit_type: dados
  scope_paths: ["lib/financeiro/adapters/**", "lib/financeiro/services/**"]
```

### 9.2 OVERNIGHT — Auditoria de drift saldo×movimento
```yaml
- ticket_id: null
  skill: SKILL_AUDIT_FINANCEIRO
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    audit_type: dados
    scope_paths: ["lib/financeiro/services/saldo*", "lib/financeiro/services/movimento*"]
```

---

## 10. Referências

- [`docs/governance/AUDIT_PROTOCOL.md`](../../../governance/AUDIT_PROTOCOL.md)
- [`docs/audits/TEMPLATE_AUDITORIA.md`](../../../audits/TEMPLATE_AUDITORIA.md)
- [`docs/roadmaps/ROADMAP_FINANCEIRO.md`](../../../roadmaps/ROADMAP_FINANCEIRO.md)
- Dívida relacionada: DT-02 (`financeiro-v2` mock).
- Mocks: MOCK-01 (`financeiro-v2` várias views Lovable, risco 🔴).
- Risco: drift movimento×saldo (sob alta concorrência).
- Blockers: BL-01 (provedor fiscal — separado de cobrança), BL-13 (financeiro-v2 mock).
- Auditorias prévias: **nenhuma dedicada ainda**.

---

## 11. Notas

- Financeiro tem **backend sólido** — auditoria provavelmente confirma idempotência via `localKey`, adapters funcionais, importador parcelado.
- **UI `financeiro-v2` mock vs backend real** é o achado mais provável de alta severidade visual; finding sobre risco de decisão errada com mock.
- **Multi-loja em Financeiro** é especialmente sensível — `loja-1` em qualquer query é incidente.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
