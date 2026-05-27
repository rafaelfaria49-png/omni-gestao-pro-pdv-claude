---
# IDENTITY
skill_id: SKILL_PROPOSE_ADR
version: v1
status: draft
category: 2
size: S
hub: cross

# CAPABILITIES
modes_allowed: [SAFE, OVERNIGHT, COWORK]
read_only: false
benchmark_required: false

# BOUNDARIES
allowed_paths:
  - "docs/decisions/drafts/**"
  - "docs/status/EXECUTION_LOG.md"   # append-only
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
  - "docs/decisions/ADR-*.md"           # ADRs aceitos: imutáveis
  - "docs/decisions/OS_ROUTE_OFICIAL.md" # ADR-0001 legado: imutável
  - "docs/decisions/INDEX.md"            # índice: humano
  - "docs/roadmaps/**"
  - "docs/sprints/**"
  - "docs/audits/**"
  - "docs/ai/**"
  - "docs/memory/**"
  - "docs/governance/**"
  - "docs/skills/**"
  - "docs/execution/**"
  - "docs/blueprint/**"
  - "docs/architecture/**"
  - "docs/modules/**"
  - "docs/status/DIVIDA_TECNICA.md"
  - "docs/status/RISCOS.md"
  - "docs/status/BLOCKERS.md"
  - "docs/status/MOCKS_TRACKING.md"
  - "docs/status/LOCKS.md"
  - "docs/status/OVERNIGHT_QUEUE.md"
expected_diff_max: 350
files_max: 2
duration_max: PT45M
commits_max: 1

# I/O CONTRACT
input:
  required: [decision_topic, hub]
  optional: [alternatives_considered, related_findings, related_blockers, ticket_id]
output:
  artifacts:
    - "docs/decisions/drafts/ADR_PROPOSAL_<ID>.md"

# GOVERNANCE
gates: []   # gerar draft = sem gate; aceitar ADR (renomear para ADR-NNNN-slug.md em docs/decisions/) = humano
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
roadmap: null
related_adrs: []
related_memories: []
template_version: v1
---

# SKILL_PROPOSE_ADR

> Skill **Proposal** mais sensível do Bloco 34. Transforma decisão recorrente / pressure point / overlap / arquitetura / limitação em **draft de ADR** seguindo `docs/decisions/TEMPLATE_ADR.md`.
> **Não substitui ADR aceito. Não contradiz silenciosamente. Não decide sozinha.**

---

## 1. Propósito

Gerar **`ADR_PROPOSAL_<ID>.md`** em `docs/decisions/drafts/` contendo: contexto + decisão sugerida + alternativas + tradeoffs + consequências + riscos + impacto + blast radius + necessidade de aprovação humana.

**O que ela NÃO faz:**
- Não publica ADR (não escreve em `docs/decisions/ADR-*.md`).
- Não substitui ADR aceito (jamais).
- Não contradiz ADR existente sem **declarar explicitamente** que contradiz + sugerir status `superada` para o antigo (decisão humana).
- Não altera `INDEX.md` dos ADRs.
- Não decide — propõe.

---

## 2. Quando usar

- **Decisão recorrente** aparece em N propostas de sprint (escolher provedor fiscal, BSP, framework de IA).
- **Pressure point arquitetural** identificado em N auditorias (multi-depósito, cliente cross-loja, organização matriz).
- **Overlap entre HUBs** que exige convenção formal (matriz de paralelismo, modelo de adapter unificado).
- **Limitação do engine** que precisa de versão v2 do schema (front matter, output, etc.).
- **Mudança de direção** que substitui ADR aceito (gera proposta para o novo + sugestão de `superada` para o antigo).

---

## 3. Quando NÃO usar

- Sem `decision_topic` claro → rejeita.
- Para "registrar o que vai ser feito" — isso é sprint, não ADR.
- Para microajuste local que cabe num comentário.
- Para escolha técnica óbvia sem trade-off real.
- Quando ADR aceito já cobre o tema **adequadamente** — usar como referência, não criar novo.

---

## 4. Input contract

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `decision_topic` | string | sim | Tópico arquitetural a decidir (frase clara) | `"escolha de provedor fiscal (NFC-e + NFS-e)"` |
| `hub` | enum \| `cross` | sim | HUB-alvo ou `cross` | `cross` |
| `alternatives_considered` | string[] | não | Alternativas iniciais propostas pelo humano | `["TecnoSpeed", "Focus NFe", "próprio"]` |
| `related_findings` | string[] | não | Findings de audits que motivaram | `["AUDITORIA_PDV_v1 F-03", "AUDITORIA_OS_v1 F-02"]` |
| `related_blockers` | string[] | não | Blockers relacionados | `["BL-01"]` |
| `ticket_id` | string | não | ID determinístico do ticket | `ADR-PROP-001` |

**Validações:**
- `decision_topic` ≥ 20 chars (forçar especificidade).
- `hub` ∈ vocabulário oficial + `cross`.
- **Verificação obrigatória de duplicidade:** skill consulta `docs/decisions/INDEX.md` e procura ADR existente cobrindo `decision_topic` — se encontra, ABORT com referência ao ADR existente.

---

## 5. Output contract

**Artefato:** `docs/decisions/drafts/ADR_PROPOSAL_<ID>.md`

**Estrutura obrigatória (herda `docs/decisions/TEMPLATE_ADR.md`):**

```markdown
---
title: ADR_PROPOSAL_<ID> · <título curto>
status: proposta   # vira "aceita" só quando humano renomear para ADR-NNNN-slug.md e mover para docs/decisions/
data: <ISO>
autor: SKILL_PROPOSE_ADR v1
revisores: []
hub: <hub>
tags: []
superado_por: null
substitui: <ADR-NNNN se aplicável>
proposta_em: <ISO>
related_findings: [<lista>]
related_blockers: [<lista>]
---

# ADR_PROPOSAL_<ID> · <título>

> **Status:** proposta
> **Decisão em uma frase:** <…>

## 1. Contexto (o que motivou)
## 2. Decisão (sugestão da skill — humano valida)
   - Detalhamento operacional.
   - O que esta decisão NÃO inclui (escopo fechado).
## 3. Alternativas consideradas (tabela com prós/contras/por que não)
## 4. Consequências
   - 4.1 Positivas
   - 4.2 Negativas / custos
   - 4.3 Riscos introduzidos + mitigação
   - 4.4 O que muda imediatamente (arquivos, docs, ADRs afetados)
   - 4.5 O que muda no longo prazo
## 5. Plano de implementação (sprint sugerida — humano confirma)
## 6. Validação (métricas + janela de observação)
## 7. Referências (ADRs relacionados, auditorias, sprints, blueprint)
## 8. Notas / discussão
## 9. Blast radius (visão da skill — humano valida)
   - HUBs afetados.
   - Áreas protegidas tocadas.
   - Dependências cross-HUB.
   - Estimativa de "tudo o que muda".
## 10. Necessidade de aprovação humana forte
   - Sempre `true` para ADRs propostos pela skill.
   - Razão: ADR é decisão arquitetural — IA propõe, humano decide.
## 11. Verificação de duplicidade
   - ADRs consultados: <lista de IDs olhados>.
   - Conflito detectado com: <ADR-NNNN ou null>.
   - Substituição sugerida: <ADR-NNNN com status `superada` ou null>.
```

---

## 6. Fases do pipeline usadas

| Fase | Aplica? | Observação |
|---|---|---|
| 1 INTAKE | sim | recebe `decision_topic`, `hub` |
| 2 PRE-FLIGHT | sim | **lê todos os ADRs em `docs/decisions/`** para verificar duplicidade |
| 3 LOCK | sim | lock em `cross` (ADR cross-HUB) ou no HUB específico |
| 4 SCOPE | sim | confirma proposta cabe em 1 ADR (não fragmentar) |
| 5 BENCHMARK | **N/A** (consume existente se referenciado) |
| 6 PROPOSAL | **é a fase desta skill** |
| 7 GATE #1 | aplicável **ao ADR proposto**, não à skill |
| 8–13 | **N/A** (sem código) |
| 14 DOC UPDATE | **N/A** (ADR draft é proposta) |
| 15 ADR/MEMORY | **N/A** (é a própria proposta de ADR) |
| 16 LOG | sim | entrada em EXECUTION_LOG.md |
| 17 LOCK RELEASE | sim | |

---

## 7. Comportamento específico

- **Verificação de duplicidade obrigatória** — sempre consulta `docs/decisions/INDEX.md` e os ADRs antes de propor. Conflito detectado → ABORT com referência, **nunca** propor silenciosamente.
- **Contradição explícita** — se proposta contradiz ADR aceito, §11 do output marca claramente + sugere status `superada` para o antigo (humano decide).
- **Aprovação humana sempre forte** — §10 do output reforça (campo `needs_strong_human_approval: true`).
- **Blast radius obrigatório** (§9) — quantifica impacto cross-HUB; humano usa para decidir urgência.
- **Não opina sobre alternativas** quando há empate — apresenta prós/contras em §3 e deixa decisão ao humano.
- **Múltiplas decisões** = **múltiplos ADRs** — proposta com 2+ decisões distintas é REJEITADA + sugestão de N ADRs separados.

---

## 8. Failure modes específicos

| Cenário | Ação |
|---|---|
| `decision_topic` < 20 chars ou genérico | ABORT na Fase 1 |
| ADR aceito já cobre o tema | ABORT + retorna referência ao ADR existente |
| Proposta contém 2+ decisões distintas | REJEITA + propõe N ADRs separados |
| Proposta contradiz ADR aceito sem declarar | bloqueia + força §11 com declaração explícita |
| `hub` fora do vocabulário | ABORT |
| `INDEX.md` dos ADRs inacessível ou corrompido | ABORT + alerta humano (não propõe sem verificação) |

---

## 9. Exemplos de uso

### 9.1 SAFE — Proposta de provedor fiscal
```yaml
ticket_id: ADR-PROP-001
skill: SKILL_PROPOSE_ADR
modo: SAFE
input:
  decision_topic: "escolha de provedor fiscal único cobrindo NFC-e e NFS-e"
  hub: cross
  alternatives_considered: [TecnoSpeed, Focus NFe, próprio]
  related_findings: ["AUDITORIA_PDV_v1 F-03", "AUDITORIA_OPERACOES_OS_v1 F-02"]
  related_blockers: [BL-01]
```

### 9.2 OVERNIGHT — Proposta de modelo multi-depósito
```yaml
- ticket_id: ADR-PROP-002
  skill: SKILL_PROPOSE_ADR
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    decision_topic: "modelagem multi-depósito — Deposito tabela vs payload JSONB"
    hub: estoque
    alternatives_considered: ["tabela Deposito + FK em Produto", "payload.depositos JSONB", "Loja como pseudo-depósito"]
    related_blockers: [BL-12]
```

---

## 10. Referências

- [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md)
- [`docs/decisions/TEMPLATE_ADR.md`](../../../decisions/TEMPLATE_ADR.md)
- [`docs/decisions/INDEX.md`](../../../decisions/INDEX.md) — verificação de duplicidade obrigatória
- [`docs/decisions/OS_ROUTE_OFICIAL.md`](../../../decisions/OS_ROUTE_OFICIAL.md) — ADR-0001 legado (referência)
- [`docs/skills/executoras/proposal/SKILL_PROPOSE_SPRINT.md`](./SKILL_PROPOSE_SPRINT.md) — irmã da Proposal Layer

---

## 11. Notas

- **Skill mais sensível do Bloco 34** — ADR é decisão arquitetural; IA propõe, humano decide sempre.
- **Verificação de duplicidade é P0 absoluto** — propor ADR sobre tema já decidido viola governança.
- **Skill conservadora ao extremo** — em dúvida, ABORT > propor.
- **ADR-0002 (congelamento front matter v1) provavelmente será o primeiro caso de uso real** desta skill — fechamento natural do Bloco 32.

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
