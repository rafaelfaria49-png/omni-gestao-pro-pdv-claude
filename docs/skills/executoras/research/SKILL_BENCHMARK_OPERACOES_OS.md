---
# IDENTITY
skill_id: SKILL_BENCHMARK_OPERACOES_OS
version: v1
status: draft
category: 1
size: S
hub: operacoes_os

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
roadmap: docs/roadmaps/ROADMAP_OPERACOES_OS.md
related_adrs:
  - ADR-0001  # OS_ROUTE_OFICIAL (legado)
related_memories:
  - project_cadastros_ux_e_venda_cliente
  - project_credito_cliente_persistente
template_version: v1
---

# SKILL_BENCHMARK_OPERACOES_OS

> Skill de pesquisa **contextual por sprint** — extrai aprendizados específicos de concorrentes de Ordens de Serviço para alimentar uma proposta de sprint do HUB OS.

---

## 1. Propósito

Pesquisar 3–5 concorrentes de OS (vertical assistência técnica + ERPs com módulo de serviço), extrair UX/fluxo/edge cases/arquitetura/riscos/diferenciais, e gerar `BENCHMARK_<ticket_id>.md`.

**O que ela NÃO faz:**
- Não escreve código.
- Não propõe sprint.
- Não cobre PDV ou Financeiro (mesmo que cruzem com OS — outra skill).
- Não dura > 30 min.

---

## 2. Quando usar

- Sprint nova com **feature de OS** (ex: garantia rastreada, catálogo de defeitos, SLA por tipo).
- Sprint nova com **fiscal** (NFS-e em 1 clique).
- Sprint nova com **comunicação** (WhatsApp automático por status — cruza com WhatsApp HUB).
- Sprint nova com **app técnico mobile** (Fase 5 do roadmap).

## 3. Quando NÃO usar

- Decommission da rota legada `/dashboard/os` → tarefa técnica conhecida, não precisa benchmark.
- Bugfix em adapter OS→Estoque ou OS→CR → não precisa benchmark.
- Melhoria em timeline UI sem mudança de conceito → não precisa benchmark.

---

## 4. Input contract

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `sprint_topic` | string | sim | Tópico específico | `"NFS-e em 1 clique no faturamento"` |
| `concorrentes_alvo` | string[] | não | Sobrescreve default | `["OmniSys", "Servicaa"]` |
| `profundidade` | enum | não | `surface` \| `deep` | `surface` |
| `ticket_id` | string | não | Vincula a ticket | `OS-S-003` |

**Concorrentes default (de `ROADMAP_OPERACOES_OS.md §3`):**
- OmniSys / TecnoSpeed Assistec
- Servicaa
- Bling
- TinyERP
- MaxiManager (vertical assistência)

**Validações:**
- `sprint_topic` não pode ser vazio nem genérico.
- Máx 5 concorrentes.

---

## 5. Output contract

**Artefato:** `docs/audits/benchmarks/BENCHMARK_<ticket_id>.md` (mesma estrutura de `SKILL_BENCHMARK_PDV §5`).

**Seção especial deste HUB (acrescentar ao artefato):**
- **Vertical de assistência técnica:** observar UX específica (defeitos, garantia, catálogo de equipamentos).
- **Rastreabilidade:** comparar como concorrente trata timeline imutável vs editável.

---

## 6. Fases do pipeline usadas

Mesma matriz de `SKILL_BENCHMARK_PDV §6` (1, 2 simplif, 3, 4, 14 cond, 15 cond, 16, 17).

---

## 7. Comportamento específico

- **Concorrentes verticais (MaxiManager, OmniSys)** valem mais que ERPs genéricos quando `sprint_topic` é específico de assistência.
- **Cruza com WhatsApp e CRM** com frequência — registrar no artefato para sinalizar dependência ao gerar proposta.
- **ADR-0001 (legado)** existe — qualquer benchmark sobre rota oficial deve referenciá-lo, não propor alternativa sem ADR-0002+ explícito.

---

## 8. Failure modes específicos

Mesma matriz de `SKILL_BENCHMARK_PDV §8`, com adições:

| Cenário | Ação |
|---|---|
| `sprint_topic` envolve mudança em rota oficial (`/dashboard/operacoes-v2`) | registrar no artefato que exige novo ADR antes da sprint |
| Concorrente vertical (assistência) inacessível publicamente | substitui por concorrente generalista (Bling/Tiny) e marca limitação |

---

## 9. Exemplos de uso

### 9.1 SAFE
```yaml
ticket_id: OS-S-003
skill: SKILL_BENCHMARK_OPERACOES_OS
modo: SAFE
input:
  sprint_topic: "Garantia rastreada por peça e serviço"
  concorrentes_alvo: [OmniSys, MaxiManager, Bling]
  profundidade: surface
```

### 9.2 OVERNIGHT
```yaml
- ticket_id: OS-S-004
  skill: SKILL_BENCHMARK_OPERACOES_OS
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    sprint_topic: "Catálogo de defeitos por equipamento"
```

---

## 10. Referências

- [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md)
- [`docs/execution/SAFE_GUARDS.md`](../../../execution/SAFE_GUARDS.md)
- [`docs/roadmaps/ROADMAP_OPERACOES_OS.md`](../../../roadmaps/ROADMAP_OPERACOES_OS.md)
- [`docs/decisions/OS_ROUTE_OFICIAL.md`](../../../decisions/OS_ROUTE_OFICIAL.md) — ADR-0001 legado
- Concorrentes default: ROADMAP_OPERACOES_OS §3.

---

## 11. Notas

- OS é HUB **mais maduro em backend** (adapters Fase 2, hydration FK, timeline imutável). Benchmark deve focar em **gaps de produto** (NFS-e, WhatsApp automático, garantia, catálogo defeitos).
- Provedor fiscal compartilhado com PDV é decisão pendente (BL-01) — qualquer benchmark de fiscal deve sinalizar.
- Concorrentes verticais (OmniSys, MaxiManager) entregam mais por R$ no nicho que ERPs genéricos.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
