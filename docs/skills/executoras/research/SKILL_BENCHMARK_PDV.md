---
# IDENTITY
skill_id: SKILL_BENCHMARK_PDV
version: v1
status: draft
category: 1
size: S
hub: pdv

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
roadmap: docs/roadmaps/ROADMAP_PDV.md
related_adrs: []
related_memories:
  - project_pdv_caixa_estabilizacao
  - project_pdv_multi_terminais_fase1
  - project_pdv_multi_terminais_fase2_lock
  - project_pdv_item_avulso_insert
  - project_pdv_black_edition
  - project_aprazo_enterprise
  - project_venda_espera
  - project_cancelamento_venda_fechamento
  - project_fechamento_caixa_erp_premium
template_version: v1
---

# SKILL_BENCHMARK_PDV

> Skill de pesquisa **contextual por sprint** — extrai aprendizados específicos de concorrentes de PDV para alimentar uma proposta de sprint do HUB PDV.

---

## 1. Propósito

Pesquisar 3–5 concorrentes de PDV (escolhidos pela relevância ao `sprint_topic`), extrair UX/fluxo/edge cases/arquitetura/riscos/diferenciais, e gerar `BENCHMARK_<ticket_id>.md` para alimentar `SKILL_PROPOSE_SPRINT` ou auditoria.

**O que ela NÃO faz:**
- Não escreve código.
- Não propõe sprint (isso é `SKILL_PROPOSE_SPRINT`).
- Não gera "benchmark genérico do PDV" sem `sprint_topic`.
- Não cobre mais de 5 concorrentes (cap rígido).
- Não dura mais de 30 min (cap rígido).

---

## 2. Quando usar

- Sprint nova com **feature** de PDV (ex: NFC-e em 1 clique, balança Toledo, modo offline).
- Sprint nova com **mudança arquitetural** (ex: persistência server-side do PDV Next).
- Sprint nova com **UX inédita** (ex: comanda/mesa).
- Sprint nova com **integração nova** (ex: leitor BT, gaveta).

## 3. Quando NÃO usar

- Bugfix puro → pular Fase 5 do pipeline.
- Pagar dívida técnica conhecida (DT-NN sem nova feature) → não exige benchmark.
- Mock removal → não exige benchmark.
- Refactor pequeno sem mudança comportamental → não exige benchmark.

---

## 4. Input contract

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `sprint_topic` | string | sim | Tópico específico da sprint que origina o benchmark | `"NFC-e em 1 clique pós-venda"` |
| `concorrentes_alvo` | string[] | não | Sobrescreve o default de concorrentes | `["Avantpro", "Bling"]` |
| `profundidade` | enum | não | `surface` (default) \| `deep` (gasta mais do orçamento de tempo) | `surface` |
| `ticket_id` | string | não | Vincula explicitamente a um ticket; se ausente, gera ad-hoc | `PDV-S-007` |

**Concorrentes default (de `ROADMAP_PDV.md §3`):**
- Avantpro
- Bling
- Mercado Turbo
- SAP Business One
- Lojinha do Brás (whitelabel pequeno)

**Validações:**
- `sprint_topic` não pode ser vazio nem genérico (`"PDV"`, `"vendas"` → rejeita).
- Máximo 5 concorrentes em `concorrentes_alvo`.

---

## 5. Output contract

**Artefato:** `docs/audits/benchmarks/BENCHMARK_<ticket_id>.md`

**Estrutura obrigatória:**

```markdown
---
ticket_id: <ticket_id>
skill: SKILL_BENCHMARK_PDV
sprint_topic: <topic>
concorrentes: [<lista>]
data: <ISO>
duracao: PT<M>M
fontes_consultadas: <N>
---

# Benchmark — <sprint_topic>

## 1. Por concorrente
### 1.1 Avantpro
- UX observada: ...
- Fluxo: ...
- Edge cases: ...
- Arquitetura inferida: ...
- Riscos observados: ...

### 1.2 Bling
(mesma estrutura)

## 2. Diferenciais possíveis para OmniGestão
- ...

## 3. Riscos identificados
- ...

## 4. Recomendações para a sprint
- ...

## 5. Fontes
- ...
```

**Mudanças em arquivos existentes:**
- `docs/status/EXECUTION_LOG.md` — entrada append-only (Fase 16).

---

## 6. Fases do pipeline usadas

| Fase | Aplica? | Observação |
|---|---|---|
| 1 INTAKE | sim | recebe `sprint_topic` + opcionais |
| 2 PRE-FLIGHT | simplificado | lê ROADMAP_PDV §3, memórias relacionadas, DIVIDA_TECNICA |
| 3 LOCK | sim | adquire lock leve no HUB pdv (mesmo read-only — evita 2 benchmarks paralelos para mesmo HUB) |
| 4 SCOPE | sim | rejeita `profundidade=deep` se overnight |
| 5 BENCHMARK | **N/A** (esta SKILL É o benchmark) |
| 6 PROPOSAL | **N/A** | |
| 7 GATE #1 | **N/A** | output é artefato, não exige aprovação |
| 8–13 | **N/A** | sem código |
| 14 DOC UPDATE | condicional | se descoberta relevante, sugere atualização em ROADMAP_PDV §5/§6 (não escreve direto — gera nota no artefato) |
| 15 ADR/MEMORY | condicional | se descoberta merece ADR, anota no artefato |
| 16 LOG | sim | entrada em EXECUTION_LOG.md |
| 17 LOCK RELEASE | sim | |

---

## 7. Comportamento específico

- **Cap rígido de 5 concorrentes** — engine trunca se input excede.
- **Cap rígido de 12 web fetches** — herdado de SAFE_GUARDS §9.
- **Cap rígido de 30 min** — engine aborta o benchmark e devolve o que tiver pronto.
- **Pesquisa orientada ao tópico** — não "benchmark geral do concorrente"; cada item filtrado pelo `sprint_topic`.
- **Concorrentes auto-resolvidos** se input não passa `concorrentes_alvo` — usa default de `ROADMAP_PDV.md §3`.
- **Diferencial vs concorrente OmniGestão** sempre tem que sair (§2 do artefato) — se não houver, registrar como gap próprio.

---

## 8. Failure modes específicos

| Cenário | Ação |
|---|---|
| `sprint_topic` vazio ou genérico | ABORT na Fase 1 |
| Cap de tempo excedido (30 min) | gera artefato parcial + marca `incomplete: true` |
| Concorrente sem informação pública relevante | registra `no_data` no item; segue para próximo |
| Web fetch falha (rate limit, 404) | retry 1x; depois pula |
| `concorrentes_alvo` com > 5 itens | ABORT na Fase 1 |

---

## 9. Exemplos de uso

### 9.1 SAFE (humano ao vivo)
```yaml
ticket_id: PDV-S-007
skill: SKILL_BENCHMARK_PDV
modo: SAFE
input:
  sprint_topic: "Emissão NFC-e em 1 clique pós-venda"
  concorrentes_alvo: [Avantpro, Bling, Linx, ContaAzul]
  profundidade: surface
```

### 9.2 OVERNIGHT (da fila)
```yaml
- ticket_id: PDV-S-008
  skill: SKILL_BENCHMARK_PDV
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    sprint_topic: "Balança eletrônica Toledo via WebSerial"
```

---

## 10. Referências

- **Pipeline:** [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md)
- **Limites:** [`docs/execution/SAFE_GUARDS.md`](../../../execution/SAFE_GUARDS.md)
- **Roadmap origem:** [`docs/roadmaps/ROADMAP_PDV.md`](../../../roadmaps/ROADMAP_PDV.md)
- **Concorrentes default:** ROADMAP_PDV §3.
- **Memórias:** ver front matter.

---

## 11. Notas

- PDV é HUB **mais maduro** do núcleo — muitos diferenciais já existem (À Prazo Enterprise, multi-terminais com lock, Item Avulso). Benchmark deve focar em **gaps reais** (NFC-e, balança, modo offline, comanda).
- Avantpro é referência forte de **velocidade de balcão** — UX de atalhos de teclado é foco recorrente.
- Mercado Turbo cobre **omnichannel** — útil quando sprint cruza PDV ↔ Marketplace.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
