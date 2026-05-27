---
# IDENTITY
skill_id: SKILL_BENCHMARK_FINANCEIRO
version: v1
status: draft
category: 1
size: S
hub: financeiro

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

# SKILL_BENCHMARK_FINANCEIRO

> Skill de pesquisa **contextual por sprint** — extrai aprendizados de concorrentes de Financeiro para alimentar uma proposta de sprint do HUB Financeiro.

---

## 1. Propósito

Pesquisar 3–5 concorrentes (gateways de cobrança + ERPs com módulo financeiro forte), extrair UX/fluxo/edge cases/arquitetura/riscos/diferenciais. Foco especial em **cobrança ativa**, **conciliação bancária** e **plano de contas**.

**O que ela NÃO faz:**
- Não escreve código.
- Não decide provedor de cobrança (isso é ADR — `SKILL_PROPOSE_ADR`).
- Não cobre fiscal (mesmo cruzando com Financeiro — usar SKILL_BENCHMARK_PDV ou OS para isso).

---

## 2. Quando usar

- Sprint com **cobrança ativa** (boleto/PIX) → P0 do roadmap.
- Sprint com **conciliação bancária** (OFX/CSV).
- Sprint com **DRE / Fluxo de caixa** real.
- Sprint com **régua de cobrança** (cruza com WhatsApp).
- Sprint com **plano de contas hierárquico configurável**.
- Sprint com **fechamento mensal travado**.

## 3. Quando NÃO usar

- Substituir mock de `/dashboard/financeiro-v2` por dados reais → não exige benchmark (backend já existe).
- Bugfix em `localKey` ou idempotência → técnico conhecido, sem benchmark.
- Importador de parcelas (já existe — sprint pagaria dívida, não cria feature) → não exige.

---

## 4. Input contract

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `sprint_topic` | string | sim | Tópico específico | `"Boleto/PIX em 1 clique via gateway de cobrança"` |
| `concorrentes_alvo` | string[] | não | Sobrescreve default | `["Asaas", "Iugu", "PagarMe"]` |
| `profundidade` | enum | não | `surface` \| `deep` | `surface` |
| `ticket_id` | string | não | Vincula a ticket | `FIN-S-001` |

**Concorrentes default (de `ROADMAP_FINANCEIRO.md §3`):**
- Conta Azul
- Omie
- Bling
- QuickBooks
- Asaas

**Concorrentes especializados (sugeridos por tópico):**
- Cobrança (boleto/PIX): Asaas, Iugu, PagarMe, Mercado Pago
- Conciliação OFX: Conta Azul, Granatum, Egestor
- Plano de contas: Omie, Sankhya
- DRE/Fluxo de caixa: QuickBooks, Nibo

**Validações:**
- `sprint_topic` não pode ser vazio nem genérico.
- Máx 5 concorrentes.

---

## 5. Output contract

**Artefato:** `docs/audits/benchmarks/BENCHMARK_<ticket_id>.md` (mesma estrutura de `SKILL_BENCHMARK_PDV §5`).

**Seções especiais deste HUB (acrescentar ao artefato quando aplicável):**
- **Modelo de cobrança:** custo por boleto/PIX, taxa de aprovação, latência webhook.
- **Idempotência observada:** como concorrente trata duplicidade.
- **Auditoria:** como concorrente registra histórico (vs nosso `payload.historico[]`).

---

## 6. Fases do pipeline usadas

Mesma matriz de `SKILL_BENCHMARK_PDV §6`.

---

## 7. Comportamento específico

- **Foco em arquitetura de adapter** — Financeiro tem `adapters/` maduros; benchmark deve avaliar como concorrente desacopla origem (OS, PDV, Marketplace) da reconciliação.
- **Tópico "cobrança"** sempre cobre 3 dimensões: UX para cliente final + UX para operador + integração técnica (webhook, idempotência, retry).
- **Tópico "conciliação bancária"** sempre cobre: parsers OFX/CSV, match automático vs manual, taxa de assertividade.
- **Não duplica** benchmark de fiscal — fiscal vive em PDV/OS, mesmo quando origina receivable aqui.

---

## 8. Failure modes específicos

Mesma matriz de `SKILL_BENCHMARK_PDV §8`, com adições:

| Cenário | Ação |
|---|---|
| Concorrente é gateway (não ERP) — informação UX limitada | foca em integração técnica (API, webhook, idempotência) |
| `sprint_topic` envolve mudança em `localKey` | registrar no artefato que exige ADR (contrato com banco) |
| Tópico cruza com WhatsApp (régua de cobrança) | sinalizar dependência no artefato |

---

## 9. Exemplos de uso

### 9.1 SAFE
```yaml
ticket_id: FIN-S-001
skill: SKILL_BENCHMARK_FINANCEIRO
modo: SAFE
input:
  sprint_topic: "Boleto e PIX em 1 clique a partir de ContaReceberTitulo"
  concorrentes_alvo: [Asaas, Iugu, PagarMe, ContaAzul, Bling]
  profundidade: surface
```

### 9.2 OVERNIGHT
```yaml
- ticket_id: FIN-S-002
  skill: SKILL_BENCHMARK_FINANCEIRO
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    sprint_topic: "Conciliação bancária OFX com match automático"
```

---

## 10. Referências

- [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md)
- [`docs/execution/SAFE_GUARDS.md`](../../../execution/SAFE_GUARDS.md)
- [`docs/roadmaps/ROADMAP_FINANCEIRO.md`](../../../roadmaps/ROADMAP_FINANCEIRO.md)
- Blocker pendente: BL-01 (decisão de provedor fiscal — não confundir com cobrança).
- Concorrentes default: ROADMAP_FINANCEIRO §3.

---

## 11. Notas

- Financeiro tem **backend sólido** (services + adapters + contracts) — benchmark raramente precisa cobrir "como funcionaria" arquiteturalmente; foco em **UX, integração e modelo de negócio** dos concorrentes.
- Asaas e Iugu são candidatos fortes para gateway — benchmark direto entre eles é decisão de produto frequente.
- Cuidado com viés "gateway brasileiro" — se sprint envolve B2B internacional (raro hoje), considerar Stripe/PayPal/etc.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
