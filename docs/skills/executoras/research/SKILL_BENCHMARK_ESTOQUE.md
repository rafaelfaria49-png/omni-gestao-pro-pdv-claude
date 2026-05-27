---
# IDENTITY
skill_id: SKILL_BENCHMARK_ESTOQUE
version: v1
status: draft
category: 1
size: S
hub: estoque

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
roadmap: docs/roadmaps/ROADMAP_ESTOQUE.md
related_adrs: []
related_memories:
  - project_sku_gc_saneamento
  - project_import_nao_sobrescreve_estoque
  - project_importador_produtos_lotes
  - project_importador_produtos_match_seguro
template_version: v1
---

# SKILL_BENCHMARK_ESTOQUE

> Skill de pesquisa **contextual por sprint** — extrai aprendizados de concorrentes de Estoque para alimentar uma proposta de sprint do HUB Estoque.

---

## 1. Propósito

Pesquisar 3–5 concorrentes (ERPs com módulo de estoque + plataformas de marketplace com sync). Foco especial em **multi-depósito**, **transferência entre lojas**, **curva ABC**, **cost layering (FIFO/Médio)** e **entrada via NF-e XML**.

**O que ela NÃO faz:**
- Não escreve código.
- Não decide modelo `Deposito` (isso é ADR — `SKILL_PROPOSE_ADR`).
- Não cobre sync Marketplace ↔ Estoque (mesmo cruzando — usar SKILL_BENCHMARK_MARKETPLACE quando aplicável).

---

## 2. Quando usar

- Sprint com **multi-depósito** (P0 do roadmap — desbloqueia Marketplace).
- Sprint com **transferência entre lojas/depósitos**.
- Sprint com **inventário cíclico**.
- Sprint com **curva ABC** ou **cost layering**.
- Sprint com **entrada via NF-e XML** com conferência.
- Sprint com **etiquetas ZPL** ou **códigos de barras múltiplos**.

## 3. Quando NÃO usar

- Saneamento de SKU (já feito) → não exige.
- Fix em importador de produtos (defesa 3 camadas já existe) → bugfix sem benchmark.
- Item Avulso isolamento (já implementado) → sem benchmark.

---

## 4. Input contract

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `sprint_topic` | string | sim | Tópico específico | `"Multi-depósito com transferência rastreada"` |
| `concorrentes_alvo` | string[] | não | Sobrescreve default | `["Bling", "TinyERP"]` |
| `profundidade` | enum | não | `surface` \| `deep` | `surface` |
| `ticket_id` | string | não | Vincula a ticket | `EST-S-001` |

**Concorrentes default (de `ROADMAP_ESTOQUE.md §3`):**
- Bling
- TinyERP
- MercadoEnvios Full
- NetSuite (referência avançada)
- Linx (códigos múltiplos)

**Concorrentes especializados por tópico:**
- Multi-depósito + transferência: Bling, Tiny, Sankhya
- Cost layering FIFO/Médio: NetSuite, SAP
- Inventário cíclico: TinyERP (app), Linx
- NF-e XML entrada: Bling, GestaoClick, Egestor
- Curva ABC: MercadoEnvios Full, Olist
- Códigos barras múltiplos: Linx, Microvix

**Validações:**
- `sprint_topic` não pode ser vazio nem genérico.
- Máx 5 concorrentes.

---

## 5. Output contract

**Artefato:** `docs/audits/benchmarks/BENCHMARK_<ticket_id>.md` (mesma estrutura de `SKILL_BENCHMARK_PDV §5`).

**Seções especiais deste HUB (acrescentar ao artefato quando aplicável):**
- **Modelo de saldo:** ledger vs campo direto; transações atômicas; anti-negativo.
- **Reserva vs commit:** como concorrente trata reserva (carrinho/pedido pendente) vs saldo real.
- **Transferência:** o que entra no ledger origem e destino; como audita.
- **Impacto cross-HUB:** sinalizar dependência com PDV (consumo), OS (peças) e Marketplace (sync).

---

## 6. Fases do pipeline usadas

Mesma matriz de `SKILL_BENCHMARK_PDV §6`.

---

## 7. Comportamento específico

- **Foco em ledger + atomicidade** — Estoque OmniGestão já tem ledger profissional (auditoria usuário + custo + valor); benchmark deve avaliar se concorrente tem o mesmo nível ou só campo direto.
- **Multi-depósito** é o tópico mais frequente — sempre extrair: como é modelado (`Deposito` tabela vs campo)? UX de transferência? Auditoria?
- **Cost layering** quando aplicável — FIFO retroativo é trade-off complexo; benchmark deve identificar se concorrente aplica retroativo ou só prospectivo.
- **Importador** já tem defesa 3 camadas (memória `project_importador_produtos_match_seguro`); benchmark não deve sugerir "regredir" para "modo update massivo".

---

## 8. Failure modes específicos

Mesma matriz de `SKILL_BENCHMARK_PDV §8`, com adições:

| Cenário | Ação |
|---|---|
| Concorrente não publica info técnica sobre ledger | foca em UX observada + entrevistar review/depoimento |
| Tópico envolve mudança em ledger histórico (FIFO retroativo) | registrar no artefato: exige ADR + janela de migração |
| Tópico cruza com Marketplace (sync de saldo) | sinalizar dependência crítica (matriz §4 do roadmaps INDEX: serial obrigatório) |

---

## 9. Exemplos de uso

### 9.1 SAFE
```yaml
ticket_id: EST-S-001
skill: SKILL_BENCHMARK_ESTOQUE
modo: SAFE
input:
  sprint_topic: "Multi-depósito com transferência auditada entre lojas"
  concorrentes_alvo: [Bling, TinyERP, Sankhya, Linx]
  profundidade: surface
```

### 9.2 OVERNIGHT
```yaml
- ticket_id: EST-S-002
  skill: SKILL_BENCHMARK_ESTOQUE
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    sprint_topic: "Entrada de estoque via NF-e XML com conferência item a item"
```

---

## 10. Referências

- [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md)
- [`docs/execution/SAFE_GUARDS.md`](../../../execution/SAFE_GUARDS.md)
- [`docs/roadmaps/ROADMAP_ESTOQUE.md`](../../../roadmaps/ROADMAP_ESTOQUE.md)
- Blocker crítico: BL-12 (ADR multi-depósito) → bloqueia Marketplace.
- Matriz paralelismo: Estoque × Marketplace = **serial obrigatório** ([`docs/roadmaps/INDEX.md §4`](../../../roadmaps/INDEX.md)).
- Concorrentes default: ROADMAP_ESTOQUE §3.

---

## 11. Notas

- Estoque é HUB **maduro em backend** (ledger profissional, importador defensivo, saneamento SKU). Benchmark foca em **gaps estruturais** (multi-depósito ausente) e **inteligência** (curva ABC, cost layering).
- Bling e Tiny são os benchmarks mais úteis para SMB brasileiro — cobrem multi-depósito e transferência em planos acessíveis.
- NetSuite/SAP usados como **referência avançada** — não para copiar, para entender o teto.
- Cuidado especial: benchmark **não pode sugerir** atalhos que regrediriam o importador (modo update massivo) — princípio "real ou nada" do MASTER_PLAN.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
