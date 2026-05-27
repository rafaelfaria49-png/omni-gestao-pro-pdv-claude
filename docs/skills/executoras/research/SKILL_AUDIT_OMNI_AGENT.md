---
# IDENTITY
skill_id: SKILL_AUDIT_OMNI_AGENT
version: v1
status: draft
category: 1
size: S
hub: omni_agent

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
    - "docs/audits/AUDITORIA_OMNI_AGENT_v<NN>.md"
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
roadmap: docs/roadmaps/ROADMAP_OMNI_AGENT.md
related_adrs: []
related_memories: []
template_version: v1
---

# SKILL_AUDIT_OMNI_AGENT

> Skill de auditoria do **estado real** do HUB Omni Agent. **Runtime operacional governado — não chat.**
> Foco em **approval flow, destructive actions, tool-use, executor safety, hallucination risk, confirmação obrigatória, memory drift, automações perigosas, runtime orchestration, observabilidade, rollback, auditabilidade, cross-HUB actions, multi-tool coordination**.
> **Primeira AUDIT skill com baseline histórica real** (auditorias prévias `AUDITORIA_IA_MESTRE.md` e `AUDITORIA_FINAL_IA_MESTRE.md`).

---

## 1. Propósito

Auditar Omni Agent de forma técnica e arquitetural: lê código (`lib/ia-mestre/{api-guard,credit-costs,debit-turn-credits}.ts`, `components/ia-mestre/ia-mestre-honesty.ts`, `app/api/ai/orchestrate/route.ts`, `lib/handleAiApiError.ts`, futuro `lib/omni-agent/executores/**`), governança, memórias e **auditorias prévias dedicadas**; gera `AUDITORIA_OMNI_AGENT_v<NN>.md` com **§8 comparativo populado** desde a v1.

**Diferença vs SKILL_BENCHMARK_OMNI_AGENT:**
- BENCHMARK olha mercado (Devin, LangGraph, Cursor Agent, Claude Code…).
- AUDIT olha estado real interno (api-guard funcional? credit-costs íntegro? confirmação destrutiva padronizada? pool de executores reais; LLM governado).

**O que ela NÃO faz:**
- Não altera código de executor.
- Não dispara execução do Agent.
- Não tira flag de executor para área protegida.

---

## 2. Quando usar

### 2.1 Standalone
- A cada **expansão do pool de executores** (auditoria pós-cada novo executor).
- A cada **trimestre** (saúde geral + governança LLM).
- Antes de **liberar LLM governado** (auditoria preventiva).
- Após **incidente de custo descontrolado** (forense).
- Após **prompt injection detectada** (forense urgente).

### 2.2 Sprint-scoped (Fase 12)
- Pós-impl de qualquer sprint do Omni Agent — **obrigatória** (risco de regressão em executor real é alto).

---

## 3. Quando NÃO usar

- Para escolher LLM ou framework agent → benchmark + ADR.
- Para "ver se chat funciona" → fora de escopo; Omni Agent não é chat.
- Sem `audit_type` → rejeita.

---

## 4. Input contract

Mesma matriz de `SKILL_AUDIT_PDV §4`.

| Campo | Tipo | Obrig | Exemplo |
|---|---|---|---|
| `audit_type` | enum | sim | `seguranca` (prompt injection, tool-use), `dados` (drift log), `forense` (incidente), `saude_geral`, `ia` (auditoria IA dedicada do AUDIT_PROTOCOL §3) |
| `scope_paths` | string[] | não | `["lib/ia-mestre/**", "app/api/ai/**"]` |
| `ticket_id` | string | não | `OMNI-S-001` |
| `sprint_topic` | string | não | `"confirmação destrutiva padronizada"` |
| `since_version` | string | não | `v1` ou (na v2) `v1`, ou usar `AUDITORIA_IA_MESTRE` / `AUDITORIA_FINAL_IA_MESTRE` como baseline pré-v1 |

---

## 5. Output contract

Mesma estrutura de `SKILL_AUDIT_PDV §5`. Output: `AUDITORIA_OMNI_AGENT_v<NN>.md` ou `AUDIT_<ticket_id>.md`.

**Seção OBRIGATÓRIA adicional (governança runtime):**
- Pool atual de executores reais (lista, status, última execução).
- Tool-use enforcement (JSON schema obrigatório? rejeição de alucinação?).
- Padrão de confirmação destrutiva (existe? padronizado?).
- Custo médio por execução vs limite por loja (soft cap, hard cap — gap esperado).
- Log de execução: completude (prompt, tool chamada, resultado, custo, usuário, storeId).
- Memória operacional: TTL, vazamento entre sessões/usuários.
- Risco de prompt injection: mitigação observada.

**§8 (comparativo) — DESDE A V1:**
- Comparar com `docs/audits/AUDITORIA_IA_MESTRE.md`.
- Comparar com `docs/audits/AUDITORIA_FINAL_IA_MESTRE.md`.
- Mapear: F-NN dessas auditorias → resolvido / persiste / piorou / mudou de cenário.

---

## 6. Fases do pipeline usadas

Mesma matriz de `SKILL_AUDIT_PDV §6`.

---

## 7. Comportamento específico — foco Omni Agent

A skill audita obrigatoriamente as **14 dimensões críticas**:

1. **Approval flow** — ações destrutivas exigem confirmação? padrão "yes/no" implementado?
2. **Destructive actions** — lista de executores marcados como destrutivos; cobertura de proteção.
3. **Tool-use** — LLM chama executor via JSON schema validado? alucinação rejeitada?
4. **Executor safety** — sandbox, allow-list de paths por executor, rate-limit por execução.
5. **Hallucination risk** — fallback explícito quando LLM não tem certeza ("não sei" vs "vou tentar")?
6. **Confirmação obrigatória** — padrão único em todo executor destrutivo? (gap atual P0 esperado).
7. **Memory drift** — contexto entre execuções limpo corretamente? vazamento entre usuários/lojas?
8. **Automações perigosas** — loop infinito de LLM impossível? circuit breaker funcional?
9. **Runtime orchestration** — orchestrator pode rodar N executores em sequência sem race?
10. **Observabilidade** — log de execução completo? painel de auditoria existe? (gap atual).
11. **Rollback** — execução parcial pode ser revertida? checkpoint por step?
12. **Auditabilidade** — quem executou o quê, quando, com qual prompt, qual resultado, qual custo?
13. **Cross-HUB actions** — executor cruzando HUBs (ex: criar OS + dar baixa em conta) honra serialização?
14. **Multi-tool coordination** — quando LLM usa 2+ tools em sequência, ordem garantida + atomicidade considerada?

**Auditorias prévias usadas como baseline:**
- `AUDITORIA_IA_MESTRE.md` (existe no projeto)
- `AUDITORIA_FINAL_IA_MESTRE.md` (existe no projeto)

**§8 do template TEMPLATE_AUDITORIA será populado** já na v1 — primeira AUDIT skill a fazer comparativo real desde início.

---

## 8. Failure modes específicos

| Cenário | Ação |
|---|---|
| Executor destrutivo sem confirmação padronizada | finding **P0** (princípio fundador roadmap quebrado) |
| Tool-use sem JSON schema → LLM chama executor inexistente | finding **P0** (alucinação executando) |
| Custo médio > orçamento sem hard cap por loja | finding P1 → upgrade P0 (financeiro) |
| Log de execução incompleto (sem prompt OU sem custo OU sem usuário/storeId) | finding **P0** (rastreabilidade quebrada) |
| Vazamento de memória entre sessões/usuários | finding **P0** (segurança) |
| Executor cruza HUB sem honrar matriz §4 (serial obrigatório) | finding P1 → upgrade P0 (drift cross-HUB) |
| Findings prévios (`AUDITORIA_IA_MESTRE` / `AUDITORIA_FINAL_IA_MESTRE`) persistem sem resolução | flag de regressão (vermelho) |
| Sem painel de auditoria com replay/forensic | finding P1 (governança incompleta) |

---

## 9. Exemplos de uso

### 9.1 SAFE — Auditoria de tool-use + confirmação destrutiva
```yaml
ticket_id: null
skill: SKILL_AUDIT_OMNI_AGENT
modo: SAFE
input:
  audit_type: seguranca
  scope_paths: ["lib/ia-mestre/**", "lib/omni-agent/executores/**", "app/api/ai/**"]
  since_version: AUDITORIA_FINAL_IA_MESTRE
```

### 9.2 OVERNIGHT — Auditoria de custo + log
```yaml
- ticket_id: null
  skill: SKILL_AUDIT_OMNI_AGENT
  pre_approved_by: Rafael
  pre_approved_at: 2026-05-28T22:30:00-03:00
  input:
    audit_type: ia
    sprint_topic: "validar governança LLM antes de expandir executores"
```

---

## 10. Referências

- [`docs/governance/AUDIT_PROTOCOL.md`](../../../governance/AUDIT_PROTOCOL.md)
- [`docs/audits/TEMPLATE_AUDITORIA.md`](../../../audits/TEMPLATE_AUDITORIA.md)
- [`docs/roadmaps/ROADMAP_OMNI_AGENT.md`](../../../roadmaps/ROADMAP_OMNI_AGENT.md)
- **Auditorias prévias (baseline obrigatória):**
  - [`docs/audits/AUDITORIA_IA_MESTRE.md`](../../../audits/AUDITORIA_IA_MESTRE.md)
  - [`docs/audits/AUDITORIA_FINAL_IA_MESTRE.md`](../../../audits/AUDITORIA_FINAL_IA_MESTRE.md)
- Blockers: BL-05 (modelo billing / hard cap).
- Riscos críticos: R-13 (prompt injection), custo descontrolado.
- Código existente: `lib/ia-mestre/{api-guard,credit-costs,debit-turn-credits}.ts`, `components/ia-mestre/ia-mestre-honesty.ts`, `app/api/ai/orchestrate/route.ts`.

---

## 11. Notas

- **Omni Agent NÃO é chat** — auditoria reforça princípio fundador do roadmap: runtime operacional governado.
- **Pool de executores reais pequeno** (DT-10) é gap esperado — auditoria mapeia e prioriza expansão.
- **Confirmação destrutiva padronizada** é P0 — auditoria identifica gap.
- **Primeira AUDIT skill com §8 não-vazio** — exercício valioso de "comparativo histórico" do template.
- **Forense urgente** após prompt injection detectada é cenário previsto — usar `audit_type: forense` + `scope_paths` restrito ao caminho de entrada (webhook WhatsApp, painel chat).

## 12. Versionamento

- **v1** — 2026-05-27, primeira versão (draft).
