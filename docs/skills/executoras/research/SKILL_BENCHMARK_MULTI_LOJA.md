---
# IDENTITY
skill_id: SKILL_BENCHMARK_MULTI_LOJA
version: v1
status: draft
category: 1
size: S
hub: multi_loja

# CAPABILITIES
modes_allowed: [SAFE, OVERNIGHT, COWORK]
read_only: true
benchmark_required: false

# BOUNDARIES
allowed_paths:
  - "docs/audits/benchmarks/**"
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
duration_max: PT30M
commits_max: 1

# I/O CONTRACT
input:
  required: [sprint_topic]
  optional: [concorrentes_alvo, profundidade, ticket_id]
output:
  artifacts:
    - "docs/audits/benchmarks/BENCHMARK_<ticket_id>.md"

# GOVERNANCE
gates: []
audit_required: false
adr_required: never

# LIFECYCLE
owner: produto + Opus
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

# SKILL_BENCHMARK_MULTI_LOJA

> Skill de pesquisa **contextual por sprint** — extrai aprendizados de ERPs com multi-loja/multi-empresa robusta para alimentar uma proposta de sprint do HUB Multi-loja.
> **Foco arquitetural, operacional e de segurança. Visual é secundário.**

---

## 1. Propósito

Pesquisar 3–5 concorrentes (ERPs com módulo multi-empresa/multi-filial maduro), extrair **isolamento de tenant, permissões granulares, modelagem matriz/franquia, sync cross-store, catálogo compartilhado, estoque compartilhado, cliente cross-loja, governança, LGPD, auditoria, segurança**.

**O que ela NÃO faz:**
- Não escreve código.
- Não decide modelo `Organizacao` (isso é ADR — BL pendente).
- Não decide "cliente cross-loja" (isso é ADR — BL-04 pendente; cruza com CRM).
- Não cobre transferência de estoque em si (cruza — usar SKILL_BENCHMARK_ESTOQUE para a mecânica).

---

## 2. Quando usar

- Sprint com **eliminar fallback `loja-1` silencioso** (P0 — sprint piloto).
- Sprint com **lint customizado** para detectar query sem `where.storeId` (P0).
- Sprint com **modelar `Organizacao`** + FK em `Store` (P1).
- Sprint com **permissão granular** por loja (`UserStoreRole`).
- Sprint com **painel matriz** consolidado (P1).
- Sprint com **transferência rastreada** entre lojas (P1).
- Sprint com **webhook routing por `phone_number_id`** (P1 — cruza com WhatsApp).
- Sprint com **cliente cross-loja** (ADR + Fase 4 — cruza com CRM).
- Sprint com **SSO entre lojas** da mesma matriz.
- Sprint com **exportação LGPD** completa de uma loja.

## 3. Quando NÃO usar

- Fix em uma query isolada com `storeId` faltante → técnico pontual, sem benchmark.
- Refactor em `LojaAtivaProvider` → técnico, sem benchmark.
- Ajuste em cookie `assistec_active_store` → sem benchmark.

---

## 4. Input contract

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `sprint_topic` | string | sim | Tópico específico | `"Modelagem Organizacao + UserStoreRole + painel matriz consolidado"` |
| `concorrentes_alvo` | string[] | não | Sobrescreve default | `["SAP Business One", "Odoo Multi-company"]` |
| `profundidade` | enum | não | `surface` \| `deep` | `surface` |
| `ticket_id` | string | não | Vincula a ticket | `MLOJA-S-001` |

**Concorrentes default (atualizado 2026-05-27):**
- SAP Business One
- Linx (Microvix)
- Omie
- Tiny
- NetSuite
- Odoo Multi-company
- ERPNext

**Concorrentes especializados por tópico:**
- Tenant isolation + RLS Postgres: NetSuite, SAP B1
- Matriz/franquia: Linx Microvix (vertical varejo brasileiro), SAP B1
- Permissão granular por loja: SAP B1, Odoo, ERPNext
- Catálogo compartilhado vs replicado: Linx, Tiny, ERPNext
- Estoque compartilhado vs por loja: Bling (referência), Tiny, Linx
- Cliente cross-loja: SAP B1 (Business Partner global), Salesforce (referência CRM)
- LGPD por tenant: SAP B1, NetSuite
- Auditoria cross-loja: SAP B1, NetSuite
- Multi-company open-source: Odoo, ERPNext

**Validações:**
- `sprint_topic` não pode ser vazio nem genérico (`"melhorar multi-loja"` → rejeita).
- Máx 5 concorrentes.

---

## 5. Output contract

**Artefato:** `docs/audits/benchmarks/BENCHMARK_<ticket_id>.md` (mesma estrutura de `SKILL_BENCHMARK_PDV §5`).

**Seções OBRIGATÓRIAS deste HUB (sempre acrescentar ao artefato):**
- **Isolamento de tenant:** padrão arquitetural observado (RLS Postgres, schema por tenant, app-level filter); risco de vazamento.
- **Permissão granular:** matriz `Usuário × Loja × Role`; herança da matriz/organização; revogação.
- **Modelo de organização/matriz:** FK `Store → Org`; consolidação de relatórios; SSO.
- **Catálogo e estoque compartilhados:** quando concorrente compartilha vs separa; sync cross-store.
- **Cliente cross-loja:** observado vs por tenant; integridade quando cliente é deletado em uma loja.
- **LGPD por tenant:** export/delete escopado; retenção legal (NF) cross-loja.
- **Auditoria cross-loja:** log de acesso, log de mudança, log de transferência.
- **Risco de vazamento entre lojas:** falhas conhecidas do concorrente, mitigações.

---

## 6. Fases do pipeline usadas

Mesma matriz de `SKILL_BENCHMARK_PDV §6`.

---

## 7. Comportamento específico

- **Foco arquitetural e de segurança** — UX é secundária. Vazamento de dados é risco P0 (LGPD).
- **Multi-loja toca todos os HUBs** — toda recomendação deve considerar impacto cross-HUB e flag matriz §4 do INDEX (mudança em isolamento exige sprint dedicada).
- **`loja-1` fallback silencioso é P0** (DT-03 + R-02) — toda recomendação deve evitar reintroduzir esse padrão.
- **SAP B1** é referência de **enterprise robusto** — multi-company + multi-currency + multi-language; usar como teto, não meta SMB.
- **Linx Microvix** é referência de **vertical varejo brasileiro** com matriz/filial real — adoção mais próxima da realidade OmniGestão.
- **Odoo Multi-company / ERPNext** = referência open-source — útil para entender padrões sem black box.
- **Tiny / Omie** = referência SMB brasileiro mais próximo — multi-empresa simples.
- **NetSuite** = referência avançada de tenant isolation técnico.

---

## 8. Failure modes específicos

Mesma matriz de `SKILL_BENCHMARK_PDV §8`, com adições:

| Cenário | Ação |
|---|---|
| `sprint_topic` envolve relaxar isolamento (compartilhar dado sensível) | bloqueia recomendação; marca risco LGPD (R-02) |
| Concorrente usa "modo god" para admin (acesso cross-loja sem audit) | marca: "anti-padrão LGPD — não copiar" |
| Tópico cruza com CRM (cliente cross-loja) | sinaliza dependência: BL-04 (decisão pendente) |
| Tópico cruza com WhatsApp (router por phone_number_id) | sinaliza dependência: WhatsApp infra atual usa env fixo |
| Tópico envolve mudança em `prisma/schema.prisma` (FK Org→Store, UserStoreRole) | marca: exige flag `--with-protected-areas:prisma/schema.prisma` + janela + rollback testado |
| Concorrente é fechado (SAP, NetSuite) sem info técnica detalhada | foca em depoimentos de implementação + papers de arquitetura |

---

## 9. Exemplos de uso

### 9.1 SAFE
```yaml
ticket_id: MLOJA-S-001
skill: SKILL_BENCHMARK_MULTI_LOJA
modo: SAFE
input:
  sprint_topic: "Modelagem Organizacao + UserStoreRole + painel matriz"
  concorrentes_alvo: [SAP Business One, Linx Microvix, Odoo Multi-company, NetSuite]
  profundidade: surface
```

### 9.2 OVERNIGHT
```yaml
- ticket_id: MLOJA-S-002
  skill: SKILL_BENCHMARK_MULTI_LOJA
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    sprint_topic: "Lint customizado para detectar query sem where.storeId"
```

---

## 10. Referências

- [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md)
- [`docs/execution/SAFE_GUARDS.md`](../../../execution/SAFE_GUARDS.md)
- [`docs/roadmaps/ROADMAP_MULTI_LOJA.md`](../../../roadmaps/ROADMAP_MULTI_LOJA.md)
- Sprint piloto oficial: **SPRINT_01_MULTI_LOJA** (eliminar fallback `loja-1`).
- Dívida crítica: DT-03 (fallback silencioso `loja-1`).
- Riscos críticos: R-02 (vazamento entre lojas — LGPD).
- Blockers: BL-04 (cliente cross-loja), BL-08 (lint storeId), BL-12 (ADR multi-depósito).
- Matriz paralelismo: Multi-loja × qualquer HUB = ⚠️ cuidado ([`docs/roadmaps/INDEX.md §4`](../../../roadmaps/INDEX.md)).
- Concorrentes default: ver §4.

---

## 11. Notas

- **Multi-loja é a regra mais quebrada em ERPs SMB** — diferencial defensável do OmniGestão é ter desde o dia 1.
- **SAP B1 e NetSuite** são teto técnico — mostram o que é possível, não obrigatório.
- **Linx Microvix** é o concorrente mais relevante para realidade varejo brasileiro com matriz/franquia.
- **Odoo Multi-company / ERPNext** valem a leitura porque mostram **padrões abertos** (com código público).
- **`loja-1` fallback silencioso** (DT-03) é o blocker mais ativo — qualquer benchmark deve apoiar a sprint piloto na eliminação.
- **Cliente cross-loja** (BL-04) é decisão cross-HUB pendente — benchmark pode informar a decisão, mas decisão é ADR humana.
- **Cuidado especial:** Multi-loja toca **todos** os HUBs — benchmark não pode sugerir mudança em isolamento sem sprint dedicada (matriz §4 do INDEX).

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
