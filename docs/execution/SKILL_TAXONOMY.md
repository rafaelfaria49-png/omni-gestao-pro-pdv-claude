---
title: Skill Taxonomy — categorias, capacidades e proibições
status: vivo
owner: produto + arquitetura
last_update: 2026-05-27
bloco: 31
---

# 🧩 Skill Taxonomy

> **Toda skill pertence a uma das 6 categorias.** Categoria define: o que pode ler, o que pode escrever, quais modos permitem rodar, e se exige aprovação humana.
> Complementa: [`EXECUTION_ENGINE.md`](./EXECUTION_ENGINE.md), [`SAFE_GUARDS.md`](./SAFE_GUARDS.md), [`HUMAN_GATES.md`](./HUMAN_GATES.md).

---

## 1. As 6 categorias

| Categoria | Função | Read/Write | Aprovação humana | Overnight-elegível |
|---|---|---|---|---|
| **1. Research** | Pesquisar, benchmark, auditar (leitura) | Read-only (gera artifacts em `docs/audits/` ou `docs/sprints/proposals/`) | Não para gerar; humano lê depois | ✅ sim |
| **2. Proposal** | Gerar drafts (sprint, ADR, plano de refactor) | Write apenas em `docs/sprints/proposals/`, `docs/decisions/drafts/`, `docs/audits/proposals/` | Não para gerar; obrigatória para publicar | ✅ sim (apenas gerar drafts) |
| **3. Execution S** | Executar tarefa pequena (≤ 4h, ≤ 500 linhas) | Write em allow-list declarada | **Sim** — Gate #1 + Gate #2 | ⚠️ apenas itens da fila aprovada |
| **4. Execution M** | Executar tarefa média (≤ 8h) | Write em allow-list ampliada | **Sim** — gates + gate adicional para diff > 200 linhas | ❌ não (precisa humano ao vivo) |
| **5. Composite** | Orquestrar outras skills | Delega Write às orquestradas | **Sim** — aprova o plano antes de orquestrar | ⚠️ apenas `SKILL_OVERNIGHT_BATCH` |
| **6. Governance** | Operação do próprio engine (lock, handoff, rollback, log) | Write apenas em `docs/status/`, `docs/governance/SESSION_HANDOFF.md` | Não (operação de sistema) | ✅ sim |

---

## 2. Detalhe por categoria

### 2.1 Categoria 1 — Research (read-only)

**Skills exemplo:**
- `SKILL_BENCHMARK_<HUB>` — 11 variantes leves, uma por HUB
- `SKILL_AUDIT_<HUB>` — usa `TEMPLATE_AUDITORIA.md`
- `SKILL_DOC_REFRESH` — atualiza `CURRENT_STATUS_OVERVIEW.md` após eventos

**Capacidades:**
- Read em qualquer path (incluindo áreas protegidas — só lê)
- Write apenas em `docs/audits/`, `docs/sprints/proposals/`, `docs/status/EXECUTION_LOG.md`
- WebSearch / WebFetch dentro dos caps do benchmark

**Não pode:**
- Modificar código
- Modificar schema
- Modificar configuração
- Sugerir merge

**Quando usar:**
- Antes de qualquer sprint nova com feature/arquitetura inédita.
- Em manutenção: auditoria trimestral de saúde do HUB.

**Quando NÃO usar:**
- Quando o item já tem benchmark recente (cache).
- Para "explorar o código" sem ticket vinculado.

---

### 2.2 Categoria 2 — Proposal (gera draft)

**Skills exemplo:**
- `SKILL_PROPOSE_SPRINT` — lê roadmap + status, gera `SPRINT_<ticket_id>.md` em `proposals/`
- `SKILL_PROPOSE_ADR` — lê contexto, gera `ADR-<NNNN>-<slug>.md` em `decisions/drafts/`
- `SKILL_PROPOSE_REFACTOR` — gera plano de refactor pequeno (≤ 200 linhas)

**Capacidades:**
- Read em qualquer path
- Write apenas em:
  - `docs/sprints/proposals/`
  - `docs/decisions/drafts/`
  - `docs/audits/proposals/`

**Não pode:**
- Publicar diretamente (publicação = humano move arquivo para pasta oficial)
- Modificar código
- Modificar ADRs já aceitos

**Quando usar:**
- Saída de benchmark gera proposta.
- Auditoria detecta finding → proposta de sprint para resolver.
- Decisão arquitetural óbvia → draft de ADR.

**Quando NÃO usar:**
- Para "planejar o futuro" sem ticket vinculado.
- Quando ADR já existe sobre o tema (atualizar > propor novo).

---

### 2.3 Categoria 3 — Execution S (tarefa pequena)

**Skills exemplo:**
- `SKILL_EXEC_FIX_MOCK` — substitui 1 mock específico por dado real
- `SKILL_EXEC_DEBT_ITEM` — paga 1 dívida técnica específica (`DT-NN`)
- `SKILL_EXEC_FEATURE_S` — implementa item de backlog tamanho S
- `SKILL_EXEC_STABILIZATION` — corrige bug pontual após pre-flight
- `SKILL_EXEC_TESTING` — adiciona/atualiza testes (sem alterar lógica)

**Capacidades:**
- Read livre
- Write em allow-list declarada (estrita)
- Roda comandos `tsc`, `build`, `test`, `git commit` (não destrutivos)

**Não pode:**
- Mexer fora da allow-list
- Mexer em deny-list global (schema, auth, proxy, etc.)
- Exceder 500 linhas de diff (PAUSE + humano)
- Criar ADR (isso é Proposal)
- Pular benchmark se aplicável

**Quando usar:**
- Item pequeno do backlog do roadmap.
- Pagar dívida técnica conhecida.
- Bug isolado com causa raiz identificada.

**Quando NÃO usar:**
- Quando ainda não há ADR para decisão envolvida (rodar Proposal antes).
- Quando escopo cresce em > S (escalar para M ou quebrar).

---

### 2.4 Categoria 4 — Execution M (tarefa média)

**Skills exemplo:**
- `SKILL_EXEC_FEATURE_M` — feature de tamanho médio (4–8h)
- `SKILL_EXEC_REFACTOR_SMALL` — refactor pequeno em 1 módulo

**Capacidades:**
- Read livre
- Write em allow-list ampliada (até 3 módulos relacionados)
- Roda comandos não-destrutivos

**Não pode:**
- Rodar em overnight (decisão fundadora #1)
- Tocar > 1 HUB
- Tocar áreas protegidas sem flag

**Quando usar:**
- Feature de roadmap com complexidade média.
- Refactor focado em melhorar 1 área específica.

**Quando NÃO usar:**
- Cross-HUB (vira XL ou exige skills múltiplas serializadas).
- Sem benchmark se é feature nova.

---

### 2.5 Categoria 5 — Composite (orquestra outras)

**Skills exemplo:**
- `SKILL_FULL_SPRINT` — orquestra Engine inteiro (17 fases) para 1 ticket
- `SKILL_OVERNIGHT_BATCH` — orquestra N skills da fila overnight em sequência segura

**Capacidades:**
- Aciona outras skills conforme o pipeline
- Aplica gates entre skills
- Persiste handoffs entre fases

**Não pode:**
- Pular fases do pipeline
- Conceder permissões que skill individual não teria
- Acumular permissões (composite ≠ super-skill)
- Rodar em modo COWORK simultâneo no mesmo HUB

**Quando usar:**
- `SKILL_FULL_SPRINT`: forma padrão de rodar 1 sprint do início ao fim.
- `SKILL_OVERNIGHT_BATCH`: noite com fila aprovada.

**Quando NÃO usar:**
- Para "fazer várias coisas rápido". Composite herda os gates de cada skill.

---

### 2.6 Categoria 6 — Governance (operação do engine)

**Skills exemplo:**
- `SKILL_HANDOFF` — gera `SESSION_HANDOFF.md` atualizado
- `SKILL_LOCK_HUB` — adquire/libera/estende lock
- `SKILL_ROLLBACK` — reversão controlada
- `SKILL_QUEUE_REVIEW` — humano revisa fila overnight

**Capacidades:**
- Write em `docs/status/` (LOCKS, EXECUTION_LOG, OVERNIGHT_QUEUE)
- Write em `docs/governance/SESSION_HANDOFF.md`
- Operações git de rollback (com snapshot prévio)

**Não pode:**
- Modificar código de produção
- Modificar docs fora de `status/` e `governance/`
- Force-release lock (só humano)

**Quando usar:**
- Sempre — toda execução termina com `SKILL_HANDOFF`.

---

## 3. Allow-list por skill (exemplos canônicos)

> Cada skill, ao ser definida (Bloco 32+), declara seu front matter. Exemplos:

### 3.1 SKILL_EXEC_FIX_MOCK
```yaml
category: 3
size: S
allowed_paths:
  - "components/dashboard/**"
  - "components/**/lovable/**"
  - "lib/**"  # apenas para leitura/import; engine valida que Write fica em components
denied_paths:
  - "prisma/schema.prisma"
  - "auth.ts"
  - "lib/**/services/**"  # services não são "mock"
expected_diff_max: 200
modes_allowed: [SAFE, OVERNIGHT, COWORK]
benchmark_required: false  # mock removal não exige benchmark
```

### 3.2 SKILL_EXEC_DEBT_ITEM
```yaml
category: 3
size: S
input:
  required: [debt_id]  # DT-NN
allowed_paths: dynamic  # resolve da própria entrada DT-NN
denied_paths: [global_deny_list]
expected_diff_max: 500
modes_allowed: [SAFE, OVERNIGHT]
benchmark_required: false
```

### 3.3 SKILL_EXEC_FEATURE_S
```yaml
category: 3
size: S
input:
  required: [hub, backlog_item_id]
allowed_paths: dynamic  # resolve do roadmap §7 backlog
denied_paths: [global_deny_list]
expected_diff_max: 500
modes_allowed: [SAFE, COWORK]  # não em overnight: feature nova exige benchmark
benchmark_required: true
```

### 3.4 SKILL_BENCHMARK_FINANCEIRO
```yaml
category: 1
size: S
allowed_paths:
  - "docs/audits/benchmarks/**"
read_only: true
modes_allowed: [SAFE, OVERNIGHT, COWORK]
benchmark_targets_default: [Asaas, Iugu, ContaAzul, Omie, Bling]
web_fetches_max: 12
duration_max: PT30M
```

---

## 4. Skills proibidas (qualquer modo, sem humano ao vivo)

| Skill ID | Por que proibida |
|---|---|
| `SKILL_EXEC_SCHEMA` | Mudança em `prisma/schema.prisma` = contrato com banco prod |
| `SKILL_EXEC_AUTH` | `auth.ts`, `auth.config.ts`, `proxy.ts` = porta de entrada |
| `SKILL_EXEC_PDV_CORE` | `lib/pdv*` core (área protegida) |
| `SKILL_EXEC_FINANCEIRO_CORE` | `lib/financeiro/*` services (área protegida) |
| `SKILL_EXEC_OS_CORE` | `lib/operacoes/*` services (área protegida) |
| `SKILL_EXEC_WHATSAPP_CORE` | `lib/whatsapp/*` core (área protegida) |
| `SKILL_EXEC_OMNI_AGENT_EXECUTORS` | `lib/omni-agent/executores/**` |
| `SKILL_EXEC_MARKETPLACE` | Greenfield total; exige humano até Fase 1 fechar |
| `SKILL_EXEC_ENV` | `.env*` — segredos |
| `SKILL_EXEC_DEPENDENCIES` | `package.json` (deps) = decisão de produto + ADR |
| `SKILL_EXEC_NEXT_CONFIG` | `next.config.mjs` = build/security |
| `SKILL_EXEC_TSCONFIG_PATHS` | `tsconfig.json` paths = quebra implícita global |

Estas existem apenas como **wrappers de execução manual** ao vivo com flag `--with-protected-areas:<path>`. Não rodam sozinhas, não rodam em overnight, não rodam em cowork.

---

## 5. Matriz de elegibilidade por modo

| Categoria | SAFE | OVERNIGHT | COWORK | AUDIT |
|---|---|---|---|---|
| 1 Research | ✅ | ✅ | ✅ | ✅ |
| 2 Proposal | ✅ | ✅ (gera draft, não publica) | ✅ | ❌ |
| 3 Execution S | ✅ | ⚠️ (da fila) | ✅ (1 lock por HUB) | ❌ |
| 4 Execution M | ✅ | ❌ | ✅ (1 lock) | ❌ |
| 5 Composite — FULL_SPRINT | ✅ | ❌ | ⚠️ (1 lock) | ❌ |
| 5 Composite — OVERNIGHT_BATCH | ❌ | ✅ | ❌ | ❌ |
| 6 Governance | ✅ | ✅ | ✅ | ✅ |

---

## 6. Como adicionar uma skill nova

1. Identificar **categoria** (1–6).
2. Identificar **HUB** (pode ser cross para skills Research/Governance).
3. Criar arquivo `docs/skills/executoras/<categoria>/SKILL_<NOME>.md` usando `TEMPLATE_SKILL.md` (Bloco 32).
4. Declarar no front matter: `category`, `size`, `allowed_paths`, `denied_paths`, `modes_allowed`, `benchmark_required`, `expected_diff_max`.
5. Documentar: quando usar, quando NÃO usar, entrada, saída, gates específicos (se houver).
6. Adicionar ao índice `docs/skills/executoras/README.md` (Bloco 32).
7. **Não usar** até humano aprovar a definição (ADR leve ou aprovação no PR).

---

## 7. Versionamento de skills

- Skill aceita não muda (imutável após adoção).
- Mudança = nova versão (`SKILL_EXEC_FIX_MOCK.md` → `SKILL_EXEC_FIX_MOCK_v2.md`).
- Antiga preservada para reproduzir execuções históricas.
- `EXECUTION_LOG.md` registra qual versão da skill rodou cada ticket.

---

## 8. Anti-padrões

| ❌ Anti-padrão | ✅ Correto |
|---|---|
| "Skill genérica que faz qualquer coisa em PDV" | Skill específica por tipo de tarefa (`EXEC_FIX_MOCK`, `EXEC_DEBT_ITEM`) |
| Allow-list larga `lib/**` | Allow-list estrita `lib/financeiro/services/cobranca.ts` |
| Skill que decide criar ADR sozinha | Skill Proposal gera draft; humano publica |
| Skill que mergeia sozinha | Humano sempre clica merge (decisão fundadora #4) |
| Skill cross-HUB | Quebrar em N skills serializadas, 1 por HUB |
| Composite que pula gates | Composite herda gates; não acumula permissões |
| Research que sugere implementação | Research só descreve estado/cenário; Proposal sugere |
| Skill rodando 24/7 sem ticket | Toda skill nasce de um ticket (Fase 1 INTAKE) |

---

## 9. Skills planejadas para Bloco 33–35 (Onda II)

### Research (Bloco 33)
- `SKILL_BENCHMARK_PDV`
- `SKILL_BENCHMARK_OPERACOES_OS`
- `SKILL_BENCHMARK_FINANCEIRO`
- `SKILL_BENCHMARK_ESTOQUE`
- `SKILL_BENCHMARK_MARKETPLACE`
- `SKILL_BENCHMARK_CRM`
- `SKILL_BENCHMARK_WHATSAPP`
- `SKILL_BENCHMARK_MARKETING_IA`
- `SKILL_BENCHMARK_OMNI_AGENT`
- `SKILL_BENCHMARK_BI`
- `SKILL_BENCHMARK_MULTI_LOJA`
- `SKILL_AUDIT_<HUB>` (mesma quebra — 11 variantes)
- `SKILL_DOC_REFRESH`

### Proposal (Bloco 34)
- `SKILL_PROPOSE_SPRINT`
- `SKILL_PROPOSE_ADR`
- `SKILL_PROPOSE_REFACTOR`

### Execution S (Bloco 35)
- `SKILL_EXEC_FIX_MOCK`
- `SKILL_EXEC_DEBT_ITEM`
- `SKILL_EXEC_FEATURE_S`
- `SKILL_EXEC_STABILIZATION`
- `SKILL_EXEC_TESTING`

---

## 10. Fonte da verdade

- **Taxonomia oficial:** este arquivo.
- **Skills concretas:** `docs/skills/executoras/` (a partir do Bloco 32).
- **Pipeline:** [`EXECUTION_ENGINE.md`](./EXECUTION_ENGINE.md).
- **Limites mecânicos:** [`SAFE_GUARDS.md`](./SAFE_GUARDS.md).
- **Gates humanos:** [`HUMAN_GATES.md`](./HUMAN_GATES.md).
- **Áreas protegidas:** [`docs/governance/GOVERNANCA.md`](../governance/GOVERNANCA.md).
