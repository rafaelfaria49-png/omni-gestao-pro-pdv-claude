---
# IDENTITY
skill_id: SKILL_AUDIT_MARKETPLACE
version: v1
status: draft
category: 1
size: S
hub: marketplace

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
    - "docs/audits/AUDITORIA_MARKETPLACE_v<NN>.md"
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
roadmap: docs/roadmaps/ROADMAP_MARKETPLACE.md
related_adrs: []
related_memories: []
template_version: v1
---

# SKILL_AUDIT_MARKETPLACE

> Skill de auditoria do **estado real** do HUB Marketplace. **HUB é greenfield (zero código) — auditoria v1 mapeia gaps esperados (quase tudo P0/P1).**
> Foco em **sync, oversell, drift estoque, pedidos, publicação, OAuth, adapter consistency, retry, concorrência, catálogo, marketplace lag, divergência financeira, seller operations**.

---

## 1. Propósito

Auditar Marketplace de forma técnica: lê código (`lib/marketplace*` — esperado vazio), governança, ADRs, memórias e auditorias anteriores; gera `AUDITORIA_MARKETPLACE_v<NN>.md`.

**Diferença vs SKILL_BENCHMARK_MARKETPLACE:**
- BENCHMARK olha mercado (Mercado Turbo, ANYMARKET, Ideris…).
- AUDIT olha estado real interno (atualmente: gap total + dependências cross-HUB).

**O que ela NÃO faz:**
- Não altera código, não decide arquitetura (BL-03 ADR), não escolhe primeiro marketplace a integrar.

---

## 2. Quando usar

### 2.1 Standalone
- **Baseline v1:** quando arquitetura for definida (BL-03 ADR aprovado) — primeira auditoria mapeia o esqueleto.
- **A cada fase fechada** do roadmap Marketplace.
- Antes de **conectar produção** (loja-piloto vendendo em ML real).
- Após **incidente de oversell** (forense).

### 2.2 Sprint-scoped (Fase 12)
- Pós-impl de qualquer sprint de Marketplace.

---

## 3. Quando NÃO usar

- Para decidir qual marketplace primeiro → benchmark + ADR.
- Para mapear UX de seller → benchmark.
- Sem `audit_type` → rejeita.
- **Antes do BL-03 ADR aprovado** → auditoria v1 vai retornar majoritariamente "gap total"; use auditoria para confirmar baseline pré-implementação, não para diagnosticar problema.

---

## 4. Input contract

Mesma matriz de `SKILL_AUDIT_PDV §4`.

| Campo | Tipo | Obrig | Exemplo |
|---|---|---|---|
| `audit_type` | enum | sim | `saude_geral` (estado greenfield), `dados` (sync), `forense` (oversell), `seguranca` (OAuth) |
| `scope_paths` | string[] | não | `["lib/marketplace*"]` (esperado vazio na v1) |
| `ticket_id` | string | não | `MKT-S-001` |
| `sprint_topic` | string | não | `"arquitetura adapter unificado"` |
| `since_version` | string | não | `v1` |

---

## 5. Output contract

Mesma estrutura de `SKILL_AUDIT_PDV §5`. Output: `AUDITORIA_MARKETPLACE_v<NN>.md` ou `AUDIT_<ticket_id>.md`.

**Seção OBRIGATÓRIA adicional (greenfield baseline):**
- Estado atual: zero código vs Fase X em curso.
- Dependências críticas: BL-07 (multi-depósito Estoque), BL-12 (ADR `Deposito`).
- ADRs aplicáveis: BL-03 (arquitetura adapter) — status.
- Pré-requisitos para Fase 1: pré-condições para começar a implementar (ex: ADR aprovada, credenciais dev de cada marketplace, modelo `Deposito` pronto).

---

## 6. Fases do pipeline usadas

Mesma matriz de `SKILL_AUDIT_PDV §6`.

---

## 7. Comportamento específico — foco Marketplace

A skill audita obrigatoriamente as **13 dimensões críticas** (mesmo greenfield):

1. **Sync** — adapter `marketplace-estoque.ts` existe? bidirecional? latência observada?
2. **Oversell** — proteção (estoque virtual, reserva otimista)? testes?
3. **Drift estoque** — sync vs leitura ML/Shopee diverge?
4. **Pedidos** — importação para `Venda`/`OS` interna funcional? idempotente?
5. **Publicação** — anúncio criado/atualizado em ML/Shopee a partir de OmniGestão?
6. **OAuth** — fluxo Meta/ML/Shopee funcional? refresh token automático? expiração tratada?
7. **Adapter consistency** — interface única para N canais? canais novos plugáveis?
8. **Retry** — webhook falho → fila + dead-letter? backoff exponencial?
9. **Concorrência** — N webhooks simultâneos não criam race condition?
10. **Catálogo** — sync de produto/preço/descrição funcional?
11. **Marketplace lag** — latência entre venda no canal e desconto no estoque OmniGestão? alvo < 30s?
12. **Divergência financeira** — `marketplace-conciliacao.ts` registra repasses corretamente?
13. **Seller operations** — operador consegue: pausar anúncio, ajustar preço em massa, ver pedidos pendentes?

**Auditorias prévias:** nenhuma dedicada ainda.

**v1 esperada:** majoritariamente "gap esperado" — Marketplace é HUB greenfield. Auditoria documenta o esqueleto e referencia BL-03/BL-07/BL-12.

---

## 8. Failure modes específicos

| Cenário | Ação |
|---|---|
| Tentativa de auditar Marketplace antes do ADR BL-03 aprovado | warn + finding informativo (não bloqueia, mas marca "auditoria sem arquitetura definida") |
| Encontra produto vendido em ML sem desconto no `Produto.saldo` em < 30s | finding **P0** (oversell — R-05) |
| Encontra `MarketplacePedido` duplicado para mesmo pedido externo | finding P1 → upgrade P0 (dinheiro) |
| Token OAuth expirado sem refresh automático | finding **P0** (canal vai parar) |
| Repasse de marketplace conciliado errado vs valor real | finding **P0** (rombo financeiro — R-16) |
| Sync sem usar adapter unificado (cada marketplace com código diferente em pontos críticos) | finding P1 (debt arquitetural — vai escalar) |
| Encontra `lib/marketplace*` sem `storeId` em queries | finding **P0** (vazamento multi-loja — R-02) |

---

## 9. Exemplos de uso

### 9.1 SAFE — Auditoria baseline (greenfield)
```yaml
ticket_id: null
skill: SKILL_AUDIT_MARKETPLACE
modo: SAFE
input:
  audit_type: saude_geral
  scope_paths: ["lib/marketplace*"]  # esperado vazio na v1
```

### 9.2 OVERNIGHT — Auditoria pós-OAuth ML (futura)
```yaml
- ticket_id: null
  skill: SKILL_AUDIT_MARKETPLACE
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    audit_type: seguranca
    sprint_topic: "validar OAuth ML pós-integração loja-piloto"
```

---

## 10. Referências

- [`docs/governance/AUDIT_PROTOCOL.md`](../../../governance/AUDIT_PROTOCOL.md)
- [`docs/audits/TEMPLATE_AUDITORIA.md`](../../../audits/TEMPLATE_AUDITORIA.md)
- [`docs/roadmaps/ROADMAP_MARKETPLACE.md`](../../../roadmaps/ROADMAP_MARKETPLACE.md)
- Blockers críticos: BL-03 (ADR adapter), BL-07 (multi-depósito Estoque), BL-12 (`Deposito`).
- Riscos críticos: R-05 (oversell), R-07 (OAuth), R-16 (conciliação errada).
- Matriz paralelismo: Marketplace × Estoque = **serial obrigatório** ([`docs/roadmaps/INDEX.md §4`](../../../roadmaps/INDEX.md)).
- Auditorias prévias: **nenhuma dedicada ainda**.

---

## 11. Notas

- **Marketplace é greenfield** — v1 da auditoria vai ter findings de "gap esperado" majoritários; isso é normal e útil (estabelece baseline).
- **Dependências cross-HUB críticas:** Estoque (multi-depósito) + Financeiro (conciliação) + Multi-loja (isolamento por seller).
- **Auditoria fortemente arquitetural** — não busca "implementação errada", busca "implementação ausente vs roadmap".
- **Pós-Fase 1** (ML completo), v2 da auditoria já terá código real para inspecionar e drift para detectar.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
