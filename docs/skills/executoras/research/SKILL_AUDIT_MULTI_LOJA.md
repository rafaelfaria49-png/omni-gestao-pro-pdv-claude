---
# IDENTITY
skill_id: SKILL_AUDIT_MULTI_LOJA
version: v1
status: draft
category: 1
size: S
hub: multi_loja

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
duration_max: PT2H
commits_max: 1

# I/O CONTRACT
input:
  required: [audit_type]
  optional: [scope_paths, ticket_id, sprint_topic, since_version]
output:
  artifacts:
    - "docs/audits/AUDITORIA_MULTI_LOJA_v<NN>.md"
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
roadmap: docs/roadmaps/ROADMAP_MULTI_LOJA.md
related_adrs: []
related_memories:
  - project_importador_produtos_match_seguro
  - project_pdv_multi_terminais_fase1
  - project_pdv_multi_terminais_fase2_lock
template_version: v1
---

# SKILL_AUDIT_MULTI_LOJA

> Skill de auditoria do **estado real** do HUB Multi-loja. **Peça-chave do piloto SPRINT_01_MULTI_LOJA.** Extremamente conservadora, arquitetural, orientada a segurança.
> Foco em **tenant isolation, storeId, ACL, queries sem `where.storeId`, vazamento cross-tenant, fallback `loja-1`, LGPD, permissionamento, sync cross-store, catálogo compartilhado, financeiro multi-store, CRM multi-store, WhatsApp multi-store, auditabilidade, rastreabilidade**.
> **`duration_max: PT2H`** (exceção justificada — varre todos os HUBs procurando `storeId` faltante).

---

## 1. Propósito

Auditar Multi-loja de forma sistêmica: lê código de **todos os HUBs** (`lib/**`, `app/api/**`, `prisma/migrations/**`), governança, memórias e auditorias anteriores; gera `AUDITORIA_MULTI_LOJA_v<NN>.md` com findings P0–P3 focados em **isolamento de tenant** e **risco LGPD/vazamento**.

**Diferença vs SKILL_BENCHMARK_MULTI_LOJA:**
- BENCHMARK olha mercado (SAP B1, Linx, NetSuite, Odoo…).
- AUDIT olha estado real interno (`storeId` everywhere? `loja-1` silencioso? `Organizacao` modelada? permissão granular?).

**O que ela NÃO faz:**
- Não altera código.
- Não decide modelo `Organizacao` (ADR pendente).
- Não decide cliente cross-loja (BL-04).
- Não substitui sprint piloto — informa-a.

---

## 2. Quando usar

### 2.1 Standalone
- **Pré-piloto:** baseline antes de SPRINT_01_MULTI_LOJA (estabelece estado inicial).
- A cada **trimestre** (saúde geral + segurança sistêmica).
- Antes de **nova loja em produção** (auditoria preventiva).
- Após **incidente de vazamento** detectado (forense urgente).
- Antes de **mudar regra de isolamento** (auditoria informa mudança).

### 2.2 Sprint-scoped (Fase 12)
- **Obrigatória para a sprint piloto** SPRINT_01_MULTI_LOJA.
- Pós-impl de qualquer sprint que mexa em isolamento (matriz §4 = serial obrigatório).

---

## 3. Quando NÃO usar

- Para decidir modelo de organização → benchmark + ADR.
- Para auditar feature específica de um HUB isolado → use AUDIT_<HUB> próprio.
- Sem `audit_type` → rejeita.

---

## 4. Input contract

Mesma matriz de `SKILL_AUDIT_PDV §4`.

| Campo | Tipo | Obrig | Exemplo |
|---|---|---|---|
| `audit_type` | enum | sim | `seguranca` (LGPD + isolamento — padrão), `dados` (drift `storeId`), `forense` (incidente), `saude_geral` |
| `scope_paths` | string[] | não | Default = sweep global (`lib/**`, `app/api/**`); restringir com cautela |
| `ticket_id` | string | não | `MLOJA-S-001` |
| `sprint_topic` | string | não | `"eliminar fallback loja-1"` |
| `since_version` | string | não | `v1` |

---

## 5. Output contract

Mesma estrutura de `SKILL_AUDIT_PDV §5`. Output: `AUDITORIA_MULTI_LOJA_v<NN>.md` ou `AUDIT_<ticket_id>.md`.

**Seção OBRIGATÓRIA adicional (isolamento sistêmico):**
- Lista de **queries Prisma sem `where.storeId`** detectadas (path:linha).
- Lista de **ocorrências de `"loja-1"`** em código (path:linha) — fallback silencioso.
- Lista de **jobs/crons** sem `storeId` claro.
- Lista de **webhooks** com roteamento estático (não por `phone_number_id` / `storeId`).
- Lista de **endpoints** sem validação de `storeId` no header `x-assistec-loja-id`.
- Cross-HUB: mapear cada HUB e indicar se respeita isolamento.
- Mapeamento LGPD cross-loja: dados pessoais com `storeId` errado.

---

## 6. Fases do pipeline usadas

Mesma matriz de `SKILL_AUDIT_PDV §6`, exceto:
- **Fase 4 SCOPE**: aceita escopo global (default) — não rejeita por amplitude (skill foi feita para isso).
- **Fase 12 AUDIT pós-impl**: quando rodada em sprint-scoped, foca apenas no diff (não sweep global).

---

## 7. Comportamento específico — foco Multi-loja (extremamente conservadora)

A skill audita obrigatoriamente as **15 dimensões críticas**:

1. **Tenant isolation** — padrão arquitetural: `storeId` em todo registro escrito? RLS Postgres não usado (decisão atual)?
2. **`storeId` everywhere** — sweep global por queries Prisma sem `where.storeId` em código de leitura sensível.
3. **ACL** — roles (`SUPER_ADMIN | ADMIN | GERENTE | OPERADOR`) implementadas em todas as rotas sensíveis?
4. **Queries sem `where.storeId`** — sweep com pattern matching; lista completa no artefato.
5. **Vazamento cross-tenant** — query de dados de loja A retornando dados de loja B (queryable no banco).
6. **Fallback `loja-1`** — todas as ocorrências em código (`DT-03` — P0 conhecido).
7. **LGPD** — dados pessoais com `storeId` correto; sem cross-loja silencioso.
8. **Permissionamento** — usuário com acesso a loja A não pode atingir loja B sem autorização explícita.
9. **Sync cross-store** — transferências (estoque, OS, cliente) auditadas com origem e destino?
10. **Catálogo compartilhado** — produto compartilhado entre lojas (decisão atual) ou por loja? consistente?
11. **Financeiro multi-store** — adapters (PDV→Financeiro, OS→Financeiro) propagam `storeId` corretamente?
12. **CRM multi-store** — cliente com `storeId` correto; cross-loja é decisão pendente (BL-04).
13. **WhatsApp multi-store** — `WHATSAPP_WEBHOOK_STORE_ID` fixo vs router por `phone_number_id` (DT-07).
14. **Auditabilidade** — log de acesso cross-loja (quem da matriz acessou qual loja, quando)?
15. **Rastreabilidade** — `MovimentacaoEstoque`, `Movimento`, `payload.historico[]` sempre com `storeId`?

**Auditorias prévias:** nenhuma dedicada ainda.

**Multi-loja é PEÇA-CHAVE DO PILOTO** — primeira execução real desta skill é na Fase 12 de SPRINT_01_MULTI_LOJA. Output será **evidência primária** do sucesso do piloto.

---

## 8. Failure modes específicos

| Cenário | Ação |
|---|---|
| Encontra query Prisma sem `where.storeId` em código de leitura sensível | finding **P0** (vazamento potencial) |
| Encontra `"loja-1"` como fallback silencioso em código (DT-03) | finding **P0** absoluto (regra de upgrade duplo — multi-loja + LGPD) |
| Encontra registro no banco com `storeId` errado ou ausente | finding **P0** (vazamento materializado) |
| Encontra job/cron rodando sem `storeId` claro | finding P1 → upgrade P0 (multi-loja) |
| Encontra webhook com roteamento estático em ambiente que tem > 1 loja | finding **P0** (DT-07) |
| Encontra endpoint sem validação de header `x-assistec-loja-id` | finding **P0** |
| Encontra usuário com role mal definido (acesso > permitido) | finding **P0** (ACL quebrada) |
| Transferência cross-store sem auditoria | finding P1 (rastreabilidade quebrada) |
| `payload.historico[]` em registro sem `storeId` | finding P1 (auditoria quebrada) |
| Cap PT2H estourado em sweep global | gera artefato parcial + `incomplete: true` + warn forte (cobertura insuficiente) |

---

## 9. Exemplos de uso

### 9.1 SAFE — Auditoria baseline pré-piloto
```yaml
ticket_id: null
skill: SKILL_AUDIT_MULTI_LOJA
modo: SAFE
input:
  audit_type: seguranca
  scope_paths: null  # sweep global
  sprint_topic: "baseline pré-SPRINT_01_MULTI_LOJA"
```

### 9.2 Fase 12 do piloto
```yaml
ticket_id: MLOJA-S-001
skill: SKILL_AUDIT_MULTI_LOJA
modo: SAFE
input:
  audit_type: seguranca
  ticket_id: MLOJA-S-001
  sprint_topic: "eliminar fallback loja-1 + lint customizado de storeId"
  scope_paths: ["lib/**", "app/**"]  # escopo da sprint
```

### 9.3 OVERNIGHT — Auditoria preventiva pré-nova loja
```yaml
- ticket_id: null
  skill: SKILL_AUDIT_MULTI_LOJA
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    audit_type: seguranca
    sprint_topic: "validar isolamento antes de ativar loja-piloto N+1"
```

---

## 10. Referências

- [`docs/governance/AUDIT_PROTOCOL.md`](../../../governance/AUDIT_PROTOCOL.md)
- [`docs/audits/TEMPLATE_AUDITORIA.md`](../../../audits/TEMPLATE_AUDITORIA.md)
- [`docs/roadmaps/ROADMAP_MULTI_LOJA.md`](../../../roadmaps/ROADMAP_MULTI_LOJA.md)
- **Sprint piloto oficial:** **SPRINT_01_MULTI_LOJA** (decisão fundadora #7).
- Dívida crítica: **DT-03 (fallback `loja-1` silencioso — P0)**, DT-07 (webhook env fixo).
- Riscos críticos: **R-02 (vazamento entre lojas — categoria/impacto crítico LGPD)**.
- Blockers: BL-04 (cliente cross-loja), BL-08 (lint storeId), BL-12 (ADR multi-depósito).
- Matriz paralelismo: Multi-loja × qualquer HUB = ⚠️ cuidado ([`docs/roadmaps/INDEX.md §4`](../../../roadmaps/INDEX.md)).
- Auditorias prévias: **nenhuma dedicada ainda**.

---

## 11. Notas

- **Multi-loja é a regra mais quebrada em ERPs SMB** — diferencial defensável do OmniGestão é tê-lo desde o dia 1.
- **`SKILL_AUDIT_MULTI_LOJA` é a skill mais crítica do runtime AUDIT** — usada na sprint piloto, vai expor primeiros findings reais do projeto.
- **PT2H em vez de PT1H** justificado: sweep global de queries em N HUBs é intensivo.
- **Conservadora ao extremo** — preferir 100 findings P3 a perder 1 finding P0.
- **§8 começa vazio (v1)** — mas v2 (pós-piloto) terá comparativo rico: o que SPRINT_01 resolveu, o que persistiu.
- **Esta skill DEVE estar `approved` (não `draft`)** antes do piloto rodar — validação humana formal.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
