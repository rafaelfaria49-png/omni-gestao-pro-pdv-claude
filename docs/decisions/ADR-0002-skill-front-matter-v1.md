---
title: ADR-0002 · Congelamento oficial do Skill Front Matter v1 até pós-piloto
status: aceita
data: 2026-05-27
data_aceite: 2026-05-27
autor: SKILL_PROPOSE_ADR v1 (draft) + Rafael (aprovação)
aprovado_por: Rafael
revisores: [Rafael]
hub: cross
tags: [runtime, skill-engine, schema, governance, api-interna]
superado_por: null
substitui: null
draft_origem: docs/decisions/drafts/ADR_PROPOSAL_0002_FRONT_MATTER_V1.md
---

# ADR-0002 · Congelamento oficial do Skill Front Matter v1 até pós-piloto

> **Status:** aceita (2026-05-27)
> **Decisão em uma frase:** o schema do Skill Front Matter v1 é congelado como API interna oficial — mudanças exigem novo ADR + nova versão de template (`v2`); skills atuais permanecem `template_version: v1` até pós-piloto SPRINT_01_MULTI_LOJA.

---

## 1. Contexto

O **Skill Front Matter v1** foi definido no Bloco 32 (`docs/skills/executoras/TEMPLATE_SKILL.md`) e adotado em **32 skills** persistidas:

- 23 da camada Research (Bloco 33).
- 3 da camada Proposal (Bloco 34).
- 5 da camada Execution S (Bloco 35).
- 1 MVP de governance (`SKILL_HANDOFF_MVP`).

Schema tem **29 campos** organizados em 7 grupos (IDENTITY · CAPABILITIES · BOUNDARIES · I/O CONTRACT · GOVERNANCE · LIFECYCLE · REFERENCES) e inclui `template_version: v1` para versionamento explícito.

**Pressão por evolução** foi documentada durante Blocos 33–35: 16+ campos candidatos a v2 (ver `SKILL_SCHEMA_V2_BACKLOG.md`). Ao mesmo tempo, a sprint piloto **SPRINT_01_MULTI_LOJA** é o primeiro teste real do Execution Engine — exige estabilidade do schema.

**Restrições:**
- 32 skills referenciam `template_version: v1`; mudança silenciosa quebra reprodutibilidade.
- `EXECUTION_LOG.md` (schema v1, Bloco 32) referencia `skill_version` por entry — replay e forensic dependem de schema estável.
- Sem decisão formal, congelamento existia "por convenção" — sem contrato, risco de drift.

---

## 2. Decisão

**Congelar o Skill Front Matter v1 como API interna oficial até a sprint piloto SPRINT_01_MULTI_LOJA encerrar com sucesso.**

**Detalhamento operacional:**

- Schema v1 (29 campos) é **imutável** até pós-piloto.
- Mudança em qualquer campo do front matter exige **novo ADR** + **bump para v2**.
- v2 (quando aceito via ADR-0003 ou similar) cria nova versão de template (`TEMPLATE_SKILL_v2.md`); v1 preservado para reprodutibilidade.
- Skills antigas continuam `template_version: v1`; skills novas declaram a versão vigente.
- Engine deve aprender a ler **ambas as versões** (sem migração forçada).
- 16+ melhorias documentadas ficam em backlog formal: `docs/skills/executoras/SKILL_SCHEMA_V2_BACKLOG.md`.
- Workarounds em v1 (`allowed_paths: dynamic`, `mandatory_sources` na prosa, `duration_max: PT2H` para AUDIT_MULTI_LOJA) continuam **convenção documentada**, não campos formais — aceitos como desvio justificado.

**O que esta decisão NÃO inclui:**
- Não inicia v2 (sequer especifica).
- Não migra skills existentes.
- Não bloqueia evolução de outros schemas (EXECUTION_LOG, output schemas) — esses são ADRs separados se necessário.
- Não decide quando v2 começa — apenas que evolução requer ADR + nova versão.

---

## 3. Alternativas consideradas

| Alternativa | Prós | Contras | Por que não escolhida |
|---|---|---|---|
| A) v1 congelado até pós-piloto (escolhida) | Estabilidade do piloto · Reprodutibilidade do log · 32 skills mantêm garantias · Decisão auditável | Pressão de melhorias adiada · Workarounds permanecem em prosa | — |
| B) v1 mutável incrementalmente (com warnings) | Permite ganhos rápidos | **Drift garantido**, split-brain do parser, replay quebrado, frágil para 32 skills | Quebra reprodutibilidade — princípio CLAUDE.md "schema versionado" |
| C) Schema dinâmico por tipo de skill (inheritance/presets) | Reduz duplicação, elegante | Mudança massiva pré-piloto, exige refazer 32 skills, escopo M/L | Custo > benefício no curto prazo — candidato natural para v2 pós-piloto |

---

## 4. Consequências

### 4.1 Positivas
- Piloto roda em schema estável.
- Reprodutibilidade total via `template_version` + `EXECUTION_LOG`.
- Approval batch fica seguro (skill `approved` não vira inválida).
- Princípio "schema versionado" honrado mecanicamente.
- Pressão de melhorias canalizada para backlog organizado.
- Compatibilidade futura garantida (engine v2 lê v1).
- Simétrico ao congelamento do `EXECUTION_LOG.md` schema v1 (Bloco 32).

### 4.2 Negativas / custos
- 16+ melhorias adiadas até pós-piloto.
- Workarounds (allow-list dinâmica, mandatory_sources em prosa) permanecem.
- Skills Cat. 4/5/6 futuras devem respeitar v1 mesmo se inadequado.

### 4.3 Riscos introduzidos
- Backlog v2 vira "graveyard" — mitigação: `SKILL_SCHEMA_V2_BACKLOG.md` criado já + revisão obrigatória no encerramento do piloto.
- Skills Cat. 4/5/6 sofrem mais com limitação — aceito; v2 pode vir antes do esperado se forçarem.
- Pressão de "só uma alteração rápida" durante piloto — engine deve rejeitar PRs em `TEMPLATE_SKILL.md` sem ADR aprovado.
- Replay falha se alguém edita silenciosamente v1 — git log em `TEMPLATE_SKILL.md` deve ser estável.
- v2 chegar com escopo gigante (Big Bang) — ADR-0003 deve garantir v2 incremental.

### 4.4 O que muda imediatamente
- Arquivos criados: este ADR + `SKILL_SCHEMA_V2_BACKLOG.md`.
- Arquivos atualizados: `docs/decisions/INDEX.md §3` (linha ADR-0002) · `TEMPLATE_SKILL.md` (nota de congelamento) · `executoras/README.md §5` (reforço sobre modificação) · `EXECUTION_LOG.md` (ENTRY 002 — aceitação).
- ADRs afetados: nenhum (não substitui ADR-0001 legado).
- Código de produção tocado: **nenhum**.

### 4.5 O que muda no longo prazo
- Padrão de **API interna versionada** estabelecido para todos schemas internos do runtime.
- Cultura de "schema é contrato" estabelecida.
- v2 será revisão informada por dados reais do piloto.

---

## 5. Plano de implementação

**Esta decisão é só decisão.**

- Sprint sugerida: nenhuma (governança).
- Owner humano: Rafael.
- Pré-requisitos: nenhum.
- Critério de pronto: ✅ atendido nesta aceitação (ADR criado, INDEX atualizado, backlog v2 criado, TEMPLATE com nota de congelamento, EXECUTION_LOG registrado).

---

## 6. Validação / como saberemos que deu certo

- **Métrica 1:** 0 mudanças em `TEMPLATE_SKILL.md` durante a sprint piloto.
- **Métrica 2:** 0 skills com `template_version` diferente de `v1` até pós-piloto.
- **Métrica 3:** `SKILL_SCHEMA_V2_BACKLOG.md` cresce de forma organizada (não graveyard).
- **Métrica 4:** Approval batch das 32 skills sem rejeições por "schema instável".
- **Janela de observação:** até encerramento do piloto + 1 retro.
- **Sucesso final:** decisão de v2 (ADR-0003) tomada após o piloto, com base em dados reais.

---

## 7. Referências

- ADRs relacionados:
  - `ADR-0001 (legado)` — `OS_ROUTE_OFICIAL.md` (precedente de governança imutável).
  - ADR-0003 (futuro) — decisão de quando/como começar v2.
- Draft origem: [`docs/decisions/drafts/ADR_PROPOSAL_0002_FRONT_MATTER_V1.md`](./drafts/ADR_PROPOSAL_0002_FRONT_MATTER_V1.md) — gerado por `SKILL_PROPOSE_ADR v1` (primeiro caso real da Proposal Layer).
- Backlog v2: [`docs/skills/executoras/SKILL_SCHEMA_V2_BACKLOG.md`](../skills/executoras/SKILL_SCHEMA_V2_BACKLOG.md).
- Schema em si: [`docs/skills/executoras/TEMPLATE_SKILL.md`](../skills/executoras/TEMPLATE_SKILL.md).
- Taxonomia/versionamento: [`docs/execution/SKILL_TAXONOMY.md §7`](../execution/SKILL_TAXONOMY.md).
- Princípios: [`docs/governance/GOVERNANCA.md`](../governance/GOVERNANCA.md), [`docs/blueprint/MASTER_PLAN.md §8`](../blueprint/MASTER_PLAN.md).
- Sprint piloto: SPRINT_01_MULTI_LOJA (a executar).

---

## 8. Notas / discussão

- **Argumento decisivo para Alternativa A:** quebrar reprodutibilidade do `EXECUTION_LOG` viola princípio fundador "schema versionado, nunca mutação silenciosa". O custo de adiar 16+ melhorias é mensurável e administrável; o custo de schema instável no piloto é incalculável.
- **Decisão simétrica** ao congelamento do `EXECUTION_LOG.md` schema v1 (Bloco 32) — mesma filosofia, mesma autoridade.
- **`template_version: v1`** no front matter de cada skill (decisão proativa do Bloco 32) é o que torna esta política viável sem migração forçada.
- **Primeira aceitação real de ADR** desde o ADR-0001 legado. Inaugura a prática formal de ADRs do runtime (template, naming, INDEX, draft → aceito).
- **Verificação de duplicidade no draft:** confirmada — nenhum ADR cobria o tema; sem conflito.
- **Conteúdo detalhado (blast radius, sugestões adicionais, fluxo de aprovação)** vive no draft origem para histórico operacional da Proposal Layer.
