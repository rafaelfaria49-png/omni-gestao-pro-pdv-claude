---
# IDENTITY
skill_id: SKILL_AUDIT_CRM
version: v1
status: draft
category: 1
size: S
hub: crm

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
    - "docs/audits/AUDITORIA_CRM_v<NN>.md"
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
roadmap: docs/roadmaps/ROADMAP_CRM.md
related_adrs: []
related_memories:
  - project_cadastros_ux_e_venda_cliente
  - project_credito_cliente_persistente
  - project_importador_produtos_match_seguro
template_version: v1
---

# SKILL_AUDIT_CRM

> Skill de auditoria do **estado real** do HUB CRM. Foco em **duplicidade de cliente, timeline fragmentada, LGPD, integridade cliente→OS→Financeiro, consentimento, sincronização, histórico unificado, segmentação**.
> Herda `docs/governance/AUDIT_PROTOCOL.md` e `docs/audits/TEMPLATE_AUDITORIA.md`.

---

## 1. Propósito

Auditar CRM de forma técnica e quantitativa: lê código (`components/cadastros/lovable/**`, `lib/cadastros*`, `app/api/cadastros/**`, modelos `Cliente`, `ClienteCredito`, `UsoCreditoCliente`), governança, memórias e auditorias anteriores; gera `AUDITORIA_CRM_v<NN>.md`.

**Diferença vs SKILL_BENCHMARK_CRM:**
- BENCHMARK olha mercado (HubSpot, Kommo, Salesforce…).
- AUDIT olha estado real interno (drift `totalGasto`, FK quebrada, duplicidade, LGPD compliance).

**O que ela NÃO faz:**
- Não altera código, não mergeia clientes duplicados (recomenda; sprint executa).
- Não decide modelo "cliente cross-loja" (ADR pendente — BL-04).

---

## 2. Quando usar

### 2.1 Standalone
- A cada **trimestre** (saúde geral + LGPD compliance).
- Após **importação massiva** de clientes (validar defesa 3 camadas).
- Antes de **liberar exportação LGPD** ao público (auditoria preventiva).
- Antes de **decidir cliente cross-loja** (informa o ADR BL-04).

### 2.2 Sprint-scoped (Fase 12)
- Pós-impl de qualquer sprint do CRM.

---

## 3. Quando NÃO usar

- Para escolher CRM externo → benchmark.
- Para gerar segmentação de marketing → escopo Marketing IA.
- Sem `audit_type` → rejeita.

---

## 4. Input contract

Mesma matriz de `SKILL_AUDIT_PDV §4`.

| Campo | Tipo | Obrig | Exemplo |
|---|---|---|---|
| `audit_type` | enum | sim | `dados` (drift, duplicidade), `seguranca` (LGPD), `saude_geral`, `forense` |
| `scope_paths` | string[] | não | `["lib/cadastros*", "app/api/cadastros/**"]` |
| `ticket_id` | string | não | `CRM-S-001` |
| `sprint_topic` | string | não | `"tela 360°"` |
| `since_version` | string | não | `v1` |

---

## 5. Output contract

Mesma estrutura de `SKILL_AUDIT_PDV §5`. Output: `AUDITORIA_CRM_v<NN>.md` ou `AUDIT_<ticket_id>.md`.

**Seção obrigatória adicional (LGPD):**
- Mapeamento de dados pessoais: campos onde vivem (PF/PJ, endereço, telefone, e-mail, histórico).
- Path de exportação atual: existe? completo?
- Path de delete atual: respeita retenção legal (NF, OS faturada)?

---

## 6. Fases do pipeline usadas

Mesma matriz de `SKILL_AUDIT_PDV §6`.

---

## 7. Comportamento específico — foco CRM

A skill audita obrigatoriamente as **10 dimensões críticas**:

1. **Duplicidade de cliente** — clientes com mesmo CPF/CNPJ, telefone ou e-mail; defesa 3 camadas honrada?
2. **Timeline fragmentada** — vendas órfãs (`Venda.clienteId = null`); OSs com cliente "—" (Fix 13 quebrado?); histórico 360° real ou parcial.
3. **LGPD compliance** — campos com dado pessoal mapeados; consentimento registrado; export/delete operacional; retenção legal preservada (NF não pode ser deletada).
4. **Integridade cliente→OS→Financeiro** — `Cliente.totalGasto` = `sum(OS faturada) + sum(Venda)`? FK `Venda.clienteId` íntegra (memória `project_cadastros_ux_e_venda_cliente`)?
5. **Consentimento** — registro de opt-in marketing; data; canal; integração com WhatsApp opt-out (cruza com WhatsApp HUB).
6. **Sincronização** — crédito persistente atômico (memória `project_credito_cliente_persistente`); transação consistente entre devolução e uso.
7. **Histórico unificado** — vendas + OS + crédito + conversa WhatsApp visíveis em um lugar (gap atual: tela 360° parcial).
8. **Segmentação** — tags modeladas? filtros consultáveis? segmento dinâmico vs lista estática?
9. **Multi-loja em CRM** — todo `Cliente` tem `storeId`? `loja-1` aparece como fallback (DT-03)? cliente compartilhado entre lojas (decisão pendente BL-04)?
10. **Importador defensivo** — modo "criar" padrão; defesa multi-loja em 3 camadas íntegra (mesmo modelo de Estoque — memória `project_importador_produtos_match_seguro`).

**Auditorias prévias:** nenhuma dedicada ainda. §8 fica vazio na v1.

**Overlap explícito** registrado no artefato:
- **CRM ↔ WhatsApp** (timeline 360° + opt-out).
- **CRM ↔ Marketing IA** (segmentação dinâmica).
- **CRM ↔ Multi-loja** (cliente cross-loja — ADR pendente).

---

## 8. Failure modes específicos

| Cenário | Ação |
|---|---|
| Encontra clientes com mesmo CPF/CNPJ em mesma loja | finding P1 (duplicidade — pode subir P0 se afetar reconciliação financeira) |
| Encontra `Venda` com `clienteId = null` em volume significativo | finding P1 → upgrade P0 (afeta `totalGasto` = dinheiro) |
| Drift `Cliente.totalGasto ≠ sum(vendas + OSs)` | finding **P0** (regra de upgrade — dinheiro) |
| Encontra cliente com `storeId = "loja-1"` (fallback silencioso) | finding **P0** (multi-loja + LGPD = upgrade duplo) |
| Path de export LGPD ausente ou parcial | finding P1 (compliance — pode subir P0 conforme exposição) |
| Encontra delete de cliente que apagou NF associada | finding **P0** (integridade fiscal quebrada) |
| Importador rodando sem defesa 3 camadas | finding **P0** (regressão crítica — modelo replicado de Estoque) |

---

## 9. Exemplos de uso

### 9.1 SAFE — Auditoria de duplicidade
```yaml
ticket_id: null
skill: SKILL_AUDIT_CRM
modo: SAFE
input:
  audit_type: dados
  scope_paths: ["lib/cadastros*", "components/cadastros/lovable/**"]
```

### 9.2 OVERNIGHT — Auditoria LGPD
```yaml
- ticket_id: null
  skill: SKILL_AUDIT_CRM
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    audit_type: seguranca
    sprint_topic: "compliance LGPD pré-exportação ao público"
```

---

## 10. Referências

- [`docs/governance/AUDIT_PROTOCOL.md`](../../../governance/AUDIT_PROTOCOL.md)
- [`docs/audits/TEMPLATE_AUDITORIA.md`](../../../audits/TEMPLATE_AUDITORIA.md)
- [`docs/roadmaps/ROADMAP_CRM.md`](../../../roadmaps/ROADMAP_CRM.md)
- Blockers: BL-04 (cliente cross-loja).
- Riscos críticos: R-15 (LGPD delete vs NF), R-02 (vazamento multi-loja).
- Dívida relacionada: DT-03 (`loja-1` fallback) — aparece em qualquer query de cliente sem `storeId`.
- Auditorias prévias: **nenhuma dedicada ainda**.

---

## 11. Notas

- CRM tem **base sólida** (FK Venda→Cliente, crédito persistente, importador defensivo) — auditoria provavelmente confirma muitos pontos positivos.
- **LGPD** é dimensão obrigatória — antes de exportação pública, auditoria preventiva é mandatória.
- **Cliente cross-loja (BL-04)** é decisão pendente — auditoria informa, não decide.
- **Overlap forte com WhatsApp, Marketing IA e Multi-loja** — runtime deve evitar AUDIT paralelo nesses pares.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
