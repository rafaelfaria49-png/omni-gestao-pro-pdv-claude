---
# IDENTITY
skill_id: SKILL_BENCHMARK_MARKETPLACE
version: v1
status: draft
category: 1
size: S
hub: marketplace

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
roadmap: docs/roadmaps/ROADMAP_MARKETPLACE.md
related_adrs: []
related_memories: []
template_version: v1
---

# SKILL_BENCHMARK_MARKETPLACE

> Skill de pesquisa **contextual por sprint** — extrai aprendizados de plataformas de integração Marketplace para alimentar uma proposta de sprint do HUB Marketplace. **Foco arquitetural** porque o HUB é greenfield.

---

## 1. Propósito

Pesquisar 3–5 concorrentes (hubs de integração Marketplace + ERPs com módulo marketplace forte), extrair **arquitetura de adapter**, **sync de saldo**, **importação de pedidos**, **conciliação de repasses**, **repricer**, **seller intelligence**, **DRE por canal**, **edição em massa**. UX e fluxo são secundários — prioridade é entender **como construir o adapter unificado**.

**O que ela NÃO faz:**
- Não escreve código.
- Não escolhe primeiro marketplace a integrar (decisão de produto).
- Não cobre sync de estoque interno (mesmo cruzando — usar SKILL_BENCHMARK_ESTOQUE).

---

## 2. Quando usar

- Sprint com **arquitetura do adapter** (Fase 1 — fundação).
- Sprint com **OAuth + cadastro de canais** (ML, Shopee, Amazon, Magalu).
- Sprint com **sync de saldo bidirecional**.
- Sprint com **importação de pedidos** → Venda/OS interna.
- Sprint com **conciliação de repasses** (taxas, fretes, comissões).
- Sprint com **repricer** automático.
- Sprint com **anúncio com IA** (cruza com Marketing IA).
- Sprint com **DRE por canal** (cruza com BI).
- Sprint com **edição em massa** de anúncios.

## 3. Quando NÃO usar

- Não há fluxo interno do OmniGestão para benchmarkar ainda → toda sprint inicial provavelmente exige benchmark.
- Decisão "qual marketplace primeiro" → não é benchmark, é decisão de produto + ADR.

---

## 4. Input contract

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `sprint_topic` | string | sim | Tópico específico | `"Arquitetura de adapter unificado para ML/Shopee/Amazon"` |
| `concorrentes_alvo` | string[] | não | Sobrescreve default | `["ANYMARKET", "Ideris"]` |
| `profundidade` | enum | não | `surface` \| `deep` | `surface` |
| `ticket_id` | string | não | Vincula a ticket | `MKT-S-001` |

**Concorrentes default (atualizado 2026-05-27):**
- Mercado Turbo
- Avantpro
- Bling
- Tiny
- ANYMARKET
- Ideris
- Olist

> Nota: lista atualizada vs `ROADMAP_MARKETPLACE §3` original (Mercado Turbo, Bling, Tiny, Ideris, Olist) — adicionados Avantpro e ANYMARKET. Roadmap será sincronizado em sprint futura.

**Concorrentes especializados por tópico:**
- Arquitetura de adapter unificado: ANYMARKET, Ideris
- Repricer + análise concorrência: Mercado Turbo (top tier)
- Sync saldo bidirecional: ANYMARKET, Bling, Tiny
- Importação pedidos + ETL: Olist, Bling
- Conciliação repasses: Ideris (referência), Olist
- Fulfillment (ML Full, Shopee Logística): Olist, ML Full direto
- Edição em massa de anúncios: Mercado Turbo, ANYMARKET
- Seller intelligence: Mercado Turbo

**Validações:**
- `sprint_topic` não pode ser vazio nem genérico.
- Máx 5 concorrentes.

---

## 5. Output contract

**Artefato:** `docs/audits/benchmarks/BENCHMARK_<ticket_id>.md` (mesma estrutura de `SKILL_BENCHMARK_PDV §5`).

**Seções OBRIGATÓRIAS deste HUB (sempre acrescentar ao artefato):**
- **Arquitetura inferida do adapter:** contrato unificado vs implementação por canal; queue/webhook/polling; retry/backoff.
- **Modelo de sync de saldo:** real-time vs near-real-time; reserva otimista; latência típica observada.
- **Conciliação de repasses:** estrutura dos dados (taxa, frete, comissão, parcelamento), dry-run, revisão humana.
- **Margem de operação:** custo por pedido importado, custo por sync, modelo de cobrança do concorrente.
- **Risco de oversell:** como concorrente trata (estoque virtual, reserva, throttling).
- **Dependência multi-depósito:** se concorrente assume multi-depósito como pré-requisito.

---

## 6. Fases do pipeline usadas

Mesma matriz de `SKILL_BENCHMARK_PDV §6`.

---

## 7. Comportamento específico

- **Greenfield total** — não há código próprio para comparar; benchmark precisa **propor estrutura** (sem implementar).
- **Foco arquitetural > UX** — UX é importante mas secundária; prioridade é entender como construir adapter desacoplado.
- **Sempre cobre risco de oversell** (R-05) — toda sprint envolvendo sync de saldo deve avaliar mitigação.
- **Dependência crítica de Estoque multi-depósito** (BL-07/BL-12) — toda recomendação deve sinalizar se assume multi-depósito pronto.
- **Mercado Livre primeiro** é decisão estratégica do roadmap — benchmarks devem priorizar features que existem em ML.
- **Bling e Tiny** = referências de breadth (cobertura ampla); ANYMARKET e Ideris = profundidade técnica.
- **Mercado Turbo** = top tier de repricer e análise concorrência; usar para sprints específicas.

---

## 8. Failure modes específicos

Mesma matriz de `SKILL_BENCHMARK_PDV §8`, com adições:

| Cenário | Ação |
|---|---|
| `sprint_topic` envolve sync sem multi-depósito pronto | bloqueia recomendação de implementação imediata; marca dependência BL-07 |
| Concorrente não publica detalhes técnicos de adapter | foca em reviews/issues GitHub/depoimentos de sellers |
| API do marketplace mencionada mudou recentemente | marca data da fonte; recomenda verificação direta no provider |
| Tópico cruza com Estoque (sync de saldo) | obrigatório: marca **serial obrigatório** (matriz §4 do roadmaps INDEX) |
| Tópico cruza com Financeiro (conciliação) | sinaliza dependência: adapter `marketplace-conciliacao.ts` (não existe ainda) |
| Tópico cruza com Marketing IA (anúncio IA) | sinaliza dependência: Marketing IA Fase 2 |

---

## 9. Exemplos de uso

### 9.1 SAFE
```yaml
ticket_id: MKT-S-001
skill: SKILL_BENCHMARK_MARKETPLACE
modo: SAFE
input:
  sprint_topic: "Arquitetura de adapter unificado ML/Shopee com sync de saldo"
  concorrentes_alvo: [ANYMARKET, Ideris, Bling, Tiny]
  profundidade: deep
```

### 9.2 OVERNIGHT
```yaml
- ticket_id: MKT-S-002
  skill: SKILL_BENCHMARK_MARKETPLACE
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    sprint_topic: "Conciliação de repasses do Mercado Livre"
```

---

## 10. Referências

- [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md)
- [`docs/execution/SAFE_GUARDS.md`](../../../execution/SAFE_GUARDS.md)
- [`docs/roadmaps/ROADMAP_MARKETPLACE.md`](../../../roadmaps/ROADMAP_MARKETPLACE.md)
- Blockers críticos: BL-03 (ADR adapter), BL-07 (Estoque multi-depósito), BL-12 (modelo `Deposito`).
- Riscos críticos: R-05 (oversell), R-07 (token OAuth), R-16 (conciliação errada).
- Matriz de paralelismo: Marketplace × Estoque = **serial obrigatório** ([`docs/roadmaps/INDEX.md §4`](../../../roadmaps/INDEX.md)).
- Concorrentes default: ver §4.

---

## 11. Notas

- **Marketplace é greenfield** — Sprint cap inicial: 1 marketplace por vez (decisão registrada no roadmap).
- **ANYMARKET e Ideris** são os concorrentes mais relevantes para entender arquitetura técnica de adapter unificado.
- **Mercado Turbo** brilha em repricer e seller intelligence; útil em sprints específicas pós-Fase 2.
- **Olist** tem fulfillment integrado — referência para Fase 5.
- **Avantpro** entra como concorrente cross-HUB (PDV + Marketplace) — útil quando sprint envolve omnichannel real.
- **Cuidado:** benchmark não pode sugerir começar pelo "tudo de uma vez" — Fase 1 do roadmap é ML completo antes de Fase 3 (multi-canal).

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
