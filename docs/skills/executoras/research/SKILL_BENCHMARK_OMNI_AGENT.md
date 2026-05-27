---
# IDENTITY
skill_id: SKILL_BENCHMARK_OMNI_AGENT
version: v1
status: draft
category: 1
size: S
hub: omni_agent

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
roadmap: docs/roadmaps/ROADMAP_OMNI_AGENT.md
related_adrs: []
related_memories: []
template_version: v1
---

# SKILL_BENCHMARK_OMNI_AGENT

> Skill de pesquisa **contextual por sprint** — extrai aprendizados de plataformas de **agentes IA executores** para alimentar uma proposta de sprint do HUB Omni Agent.
> **Foco arquitetural e de segurança. NÃO é benchmark de "chat IA genérico".**

---

## 1. Propósito

Pesquisar 3–5 concorrentes (agent frameworks + agentes verticais + IDE agents), extrair **governança de LLM, tool-use, approval flows, executor seguro, orchestration, observabilidade, rollback, memória operacional, multi-tool coordination, human-in-the-loop**.

**O que ela NÃO faz:**
- Não escreve código.
- Não decide arquitetura LLM governado (isso é ADR).
- Não cobre chat conversacional sem executor (irrelevante).
- Não vira "benchmark de chatbot bonito".
- Não cobre WhatsApp como canal (cruza — usar SKILL_BENCHMARK_WHATSAPP).
- Não cobre executores específicos por HUB (esses são propostos por SKILL_PROPOSE_SPRINT).

---

## 2. Quando usar

- Sprint com **expandir pool de executores reais** (P0).
- Sprint com **confirmação destrutiva padronizada** (P0).
- Sprint com **LLM governado** (system prompt fechado + tool-use estrito).
- Sprint com **painel de auditoria** de execuções.
- Sprint com **limite duro por loja** (orçamento + hard stop).
- Sprint com **multi-step** (planejamento + execução em N passos).
- Sprint com **memória de execução** (replay, contexto entre runs).
- Sprint com **integração CRM contextual** (consulta cliente no comando).
- Sprint com **agentes especializados por HUB** (Fase 5).

## 3. Quando NÃO usar

- Fix em `api-guard.ts` ou `credit-costs.ts` → técnico conhecido, sem benchmark.
- Substituição de regex determinística por LLM em fluxo isolado → exige discussão técnica, não benchmark.
- Discussão sobre prompt engineering sem mudar arquitetura → não exige benchmark.

---

## 4. Input contract

| Campo | Tipo | Obrig | Descrição | Exemplo |
|---|---|---|---|---|
| `sprint_topic` | string | sim | Tópico específico | `"Tool-use estrito com JSON schema + confirmação destrutiva"` |
| `concorrentes_alvo` | string[] | não | Sobrescreve default | `["LangGraph", "CrewAI"]` |
| `profundidade` | enum | não | `surface` \| `deep` | `surface` |
| `ticket_id` | string | não | Vincula a ticket | `OMNI-S-001` |

**Concorrentes default (atualizado 2026-05-27):**
- Harvey (legal vertical)
- Devin (software engineering)
- OpenHands (open-source agent)
- LangGraph (framework)
- CrewAI (multi-agent)
- OpenAI Operator (browser agent)
- Cursor Agent (IDE)
- Claude Code (IDE / shell)
- n8n AI Agent patterns

**Concorrentes especializados por tópico:**
- Governança LLM + tool-use: LangGraph, OpenAI Assistants API
- Approval flows / human-in-the-loop: Devin, OpenHands, Cursor Agent
- Multi-agent coordination: CrewAI, LangGraph
- Observabilidade de execução: LangSmith (referência infra), Claude Code (audit logs)
- Vertical executor com governança forte: Harvey (jurídico), Devin (eng)
- Memória operacional / replay: OpenAI Assistants API (threads), Claude Code (sessões)
- Browser/UI agents: OpenAI Operator (referência mas fora do escopo OmniGestão)

**Validações:**
- `sprint_topic` não pode ser vazio nem genérico (`"melhorar IA"` → rejeita).
- Máx 5 concorrentes.

---

## 5. Output contract

**Artefato:** `docs/audits/benchmarks/BENCHMARK_<ticket_id>.md` (mesma estrutura de `SKILL_BENCHMARK_PDV §5`).

**Seções OBRIGATÓRIAS deste HUB (sempre acrescentar ao artefato):**
- **Governança LLM observada:** tool-use estrito vs livre; JSON schema validation; rejection de alucinação.
- **Approval flows:** quando concorrente exige humano; padrão "yes/no" destrutivo; auditoria de aprovação.
- **Executor seguro:** sandbox, allow-list, deny-list, rate-limit, rollback.
- **Observabilidade:** log estruturado por execução, custo por execução, replay/forensic.
- **Memória operacional:** thread/sessão, contexto entre runs, limpeza vs persistência.
- **Risco de prompt injection:** mitigação observada (sanitização, lista branca, dual-control).

**Seções condicionais:**
- **Multi-agent / coordination:** se sprint envolve N agentes (raro no início do OmniGestão).
- **Multimodal:** se sprint envolve voz, imagem, vídeo.

---

## 6. Fases do pipeline usadas

Mesma matriz de `SKILL_BENCHMARK_PDV §6`.

---

## 7. Comportamento específico

- **Foco arquitetural e de segurança** — não é benchmark de "UX de chat".
- **Toda recomendação avalia risco de execução não-governada** — proibido sugerir "deixar IA decidir" em ação destrutiva.
- **Harvey e Devin** = referência de **governança vertical** (jurídico, eng); mesmo princípio aplicável a OmniGestão (vertical ERP).
- **OpenHands, LangGraph, CrewAI** = referência de **frameworks** — usar para entender padrões, não copiar implementação.
- **Cursor Agent / Claude Code** = referência mais próxima do que OmniGestão promete (executor governado em IDE/shell) — adaptar para domínio ERP.
- **OpenAI Operator** = referência de **risco extremo** (agent controla browser inteiro); usar para entender o que **não** fazer sem governança.
- **n8n AI Agent patterns** = referência de **orchestration por flow** — útil para multi-step.
- **Custo IA** sempre cobrir — toda recomendação que aumenta tokens/imagens deve sugerir limite (gap atual do roadmap §5).

---

## 8. Failure modes específicos

Mesma matriz de `SKILL_BENCHMARK_PDV §8`, com adições:

| Cenário | Ação |
|---|---|
| `sprint_topic` vira "melhorar chat IA" sem executor | bloqueia; remete para discussão de produto antes do benchmark |
| Concorrente é fechado (Harvey, Devin) com info pública limitada | foca em UX observada + post-mortems públicos + papers |
| Tópico envolve executor em área protegida (PDV core, schema) | marca: exige flag `--with-protected-areas` + humano ao vivo (SAFE) |
| Tópico cruza com WhatsApp (canal de comando) | sinaliza dependência: WhatsApp Fase 1 (infra ok) |
| Tópico cruza com qualquer HUB executor | matriz §4 do INDEX: **serial obrigatório** com aquele HUB |

---

## 9. Exemplos de uso

### 9.1 SAFE
```yaml
ticket_id: OMNI-S-001
skill: SKILL_BENCHMARK_OMNI_AGENT
modo: SAFE
input:
  sprint_topic: "Confirmação destrutiva padronizada + tool-use com JSON schema"
  concorrentes_alvo: [Devin, Cursor Agent, Claude Code, LangGraph]
  profundidade: surface
```

### 9.2 OVERNIGHT
```yaml
- ticket_id: OMNI-S-002
  skill: SKILL_BENCHMARK_OMNI_AGENT
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    sprint_topic: "Painel de auditoria por execução com custo e replay"
```

---

## 10. Referências

- [`docs/execution/EXECUTION_ENGINE.md`](../../../execution/EXECUTION_ENGINE.md)
- [`docs/execution/SAFE_GUARDS.md`](../../../execution/SAFE_GUARDS.md)
- [`docs/roadmaps/ROADMAP_OMNI_AGENT.md`](../../../roadmaps/ROADMAP_OMNI_AGENT.md)
- Auditorias dedicadas: `docs/audits/AUDITORIA_IA_MESTRE.md`, `docs/audits/AUDITORIA_FINAL_IA_MESTRE.md`.
- Blockers relacionados: BL-05 (modelo billing), R-13 (prompt injection).
- Código existente: `lib/ia-mestre/{api-guard,credit-costs,debit-turn-credits}.ts`, `components/ia-mestre/ia-mestre-honesty.ts`, `app/api/ai/orchestrate/route.ts`.
- Concorrentes default: ver §4.

---

## 11. Notas

- **Omni Agent é a camada mais sensível do ERP** — executor real toca dinheiro/estoque/cliente. Benchmark **prioriza governança** sobre velocidade de demo.
- **Cursor Agent / Claude Code** são referência viva — IA executa em IDE com aprovação humana. OmniGestão replica o padrão para domínio ERP.
- **Harvey e Devin** mostram que **vertical com governança forte vence horizontal flexível** — Omni Agent não tenta ser ChatGPT, é executor de ERP.
- **OpenHands e LangGraph** úteis para **patterns abertos** que podemos estudar diretamente.
- **OpenAI Operator** é o **anti-exemplo** — mostra o que acontece sem governança forte; útil para argumentar contra "deixa a IA fazer".
- **n8n AI Agent patterns** é uma boa fonte para entender **orchestration via flow** que muitos SMB já conhecem.
- **CrewAI** entra apenas se sprint envolve multi-agent (raro nesta fase do OmniGestão).

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
