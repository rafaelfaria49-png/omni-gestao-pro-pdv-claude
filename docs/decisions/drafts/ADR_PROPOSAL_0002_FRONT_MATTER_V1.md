---
title: ADR_PROPOSAL_0002 · Congelamento oficial do Skill Front Matter v1 até pós-piloto
status: proposta
data: 2026-05-27
autor: SKILL_PROPOSE_ADR v1
revisores: []
hub: cross
tags: [runtime, skill-engine, schema, governance, api-interna]
superado_por: null
substitui: null
proposta_em: 2026-05-27T00:00:00-03:00
proposta_por: SKILL_PROPOSE_ADR v1
related_findings: []
related_blockers: []
ticket_id: ADR-PROP-0002
needs_strong_human_approval: true
---

# ADR_PROPOSAL_0002 · Congelamento oficial do Skill Front Matter v1 até pós-piloto

> **Status:** proposta
> **Decisão em uma frase:** congelar o schema do skill front matter v1 como API interna oficial e proibir mutação até a sprint piloto SPRINT_01_MULTI_LOJA encerrar com sucesso — evolução posterior apenas via nova versão (v2) com migration explícita.

---

## 1. Contexto

O **Skill Front Matter v1** foi definido no Bloco 32 (`docs/skills/executoras/TEMPLATE_SKILL.md`) e adotado em **31 skills** já persistidas no projeto:

- **23 skills da camada Research** (Bloco 33): 11 `SKILL_BENCHMARK_<HUB>` + 11 `SKILL_AUDIT_<HUB>` + `SKILL_DOC_REFRESH`.
- **3 skills da camada Proposal** (Bloco 34): `SKILL_PROPOSE_SPRINT`, `SKILL_PROPOSE_ADR`, `SKILL_PROPOSE_REFACTOR`.
- **5 skills da camada Execution S** (Bloco 35): `SKILL_EXEC_FIX_MOCK`, `SKILL_EXEC_DEBT_ITEM`, `SKILL_EXEC_FEATURE_S`, `SKILL_EXEC_STABILIZATION`, `SKILL_EXEC_TESTING`.

O schema tem **29 campos** organizados em 7 grupos: IDENTITY (6), CAPABILITIES (3), BOUNDARIES (6), I/O CONTRACT (2 objetos), GOVERNANCE (3), LIFECYCLE (5), REFERENCES (4). Inclui `template_version: v1` para versionamento explícito.

**Pressão por evolução já documentada (durante Blocos 33–35):**

| Necessidade detectada | Onde foi anotada |
|---|---|
| `read_paths` vs `write_paths` separados (Cat. 1 Research lê tudo, escreve restrito) | SKILL_TAXONOMY §2.1 + relatório Bloco 33 Lote A |
| Findings parseáveis (severidade no front matter) | Relatório Bloco 33 Lote A |
| `mandatory_sources: []` (ex: Meta docs sempre incluso em SKILL_BENCHMARK_WHATSAPP) | Relatório Bloco 33 Lote 2 |
| `mandatory_sections: []` (seções obrigatórias por skill) | Relatório Bloco 33 Lote 2 |
| `cross_hubs_warnings: []` (alertas de cruzamento alto) | Relatório Bloco 33 Lote 2 |
| `duration_max_override` (Marketplace deep / Multi-loja sweep) | Relatórios Blocos 33 Lotes 2 e C |
| `benchmark_targets_default: []` (parseável vs hoje na prosa) | Relatório Bloco 33 Lote 1 |
| Schema único para `BENCHMARK_OUTPUT` (evita 11 skills duplicando) | Relatório Bloco 33 Lote 1 |
| Inheritance/presets (Research = padrão; Execution = padrão) | Relatórios Blocos 33 + 35 |
| `requires_event: []` (DOC_REFRESH dispara apenas em eventos) | Relatório SKILL_DOC_REFRESH §12 |
| `dry_run_default_in: [OVERNIGHT]` | Relatório SKILL_DOC_REFRESH §12 |
| `proposal_priority` (priority queue entre propostas) | Relatório Bloco 34 |
| `proposal_lock` (anti-conflito em `decision_topic: cross`) | Relatório Bloco 34 |
| `id_strategy: ticket_id\|autoincrement\|uuid` | Relatório Bloco 34 |
| `output_schema_version: v1` | Relatórios Blocos 33 e 34 |
| `allowed_paths: dynamic` (DEBT_ITEM / FEATURE_S / STABILIZATION resolvem do `proposal_ref §5`) — atualmente desvio justificado | Bloco 35 |

**Restrições atuais:**
- Sprint piloto **SPRINT_01_MULTI_LOJA** (decisão fundadora #7, aprovada 2026-05-27) será o **primeiro teste de campo real** do Execution Engine completo.
- Cada uma das 31 skills referencia `template_version: v1` no front matter para reproduzir execuções históricas.
- `EXECUTION_LOG.md` (schema v1, congelado no Bloco 32) registra `skill_version` por execução para replay e forensic.
- **`docs/decisions/INDEX.md`** consultado em pre-flight: **nenhum ADR existente cobre o tema** (apenas ADR-0001 legado sobre rota OS). Duplicidade ausente, proposta segue.

**Por que precisamos decidir agora:**
- Sem decisão formal, o schema está "congelado por convenção" mas não por contrato — risco de drift silencioso.
- A pressão por evolução é real e legítima (16+ melhorias documentadas). Sem governança, alguém pode "ajustar v1 incrementalmente" e quebrar compatibilidade.
- O piloto Multi-loja é a **primeira oportunidade de validar v1 no campo**. Mudar o schema antes do piloto invalida tudo o que foi construído.
- **Decisão deve preceder approval batch** das skills (mudar `status: draft → approved`) — humano não pode aprovar skill com schema instável.

---

## 2. Decisão (sugestão da skill — humano valida)

**Congelar o Skill Front Matter v1 como API interna oficial até a sprint piloto SPRINT_01_MULTI_LOJA encerrar com sucesso.** Após o piloto, abrir janela de revisão para decidir v2 baseado em evidência real do campo.

**Detalhamento operacional:**

- Schema v1 (29 campos) é **imutável** até pós-piloto.
- Qualquer mudança em **qualquer campo** do front matter exige **novo ADR** + **bump para v2**.
- v2 (quando aceito) cria **nova versão do template** (`TEMPLATE_SKILL_v2.md`); v1 preservado para reprodutibilidade.
- Skills antigas continuam declarando `template_version: v1`; skills novas declaram `template_version: v2`.
- Engine deve aprender a **ler ambas as versões** (não migração forçada).
- 16+ melhorias documentadas durante Blocos 33–35 ficam **anotadas para v2** em backlog formal: `docs/execution/SKILL_SCHEMA_V2_BACKLOG.md` (a criar pós-aceitação deste ADR).
- Workaround em v1: campos como `allowed_paths: dynamic`, `mandatory_sources` (na prosa) e overrides como `duration_max: PT2H` (Multi-loja AUDIT) continuam **convenção documentada, não campo formal** — aceitos como desvio justificado pelo template v1.

**O que esta decisão NÃO inclui (escopo fechado):**
- Não inicia v2 (sequer especifica). v2 vira sprint pós-piloto.
- Não migra skills existentes (v1 permanece v1).
- Não bloqueia evolução do **EXECUTION_LOG schema** (independente; tem seu próprio v1 congelado no Bloco 32).
- Não bloqueia evolução de **output schemas** (BENCHMARK_OUTPUT, ADR_PROPOSAL_OUTPUT etc.) — esses são outros congelamentos potenciais, ADRs separados se necessário.
- Não decide quando v2 começa — apenas que evolução requer ADR + nova versão.

---

## 3. Alternativas consideradas

| Alternativa | Prós | Contras | Por que (não) escolhida |
|---|---|---|---|
| **A) v1 congelado até pós-piloto (escolhida)** | Estabilidade do piloto · Reprodutibilidade de execuções · Validação no campo antes de evoluir · 31 skills mantêm garantias · Decisão clara e auditável · Compatível com `template_version` já existente | Pressão acumulada de 16+ melhorias adiada · Workarounds (`allowed_paths: dynamic`) permanecem na prosa · Atraso em ganhos óbvios (parseabilidade de findings, mandatory_sections) | **Escolhida.** Custo de quebrar v1 antes do piloto > benefício de melhorias incrementais. Validação no campo é insubstituível. |
| **B) v1 mutável incrementalmente (com warnings)** | Permite ganhos rápidos (campos novos em v1) · Não exige novo template · Pressão de melhorias é satisfeita já | **Drift de schema garantido** — skills antigas com schema diferente das novas · Risco de **split-brain do parser** (engine precisa decidir versão por skill) · Replay quebrado (skill v1.1 não reproduz como v1.0) · Compatibilidade frágil · 31 skills exigiriam reaudit a cada mudança · Decisão "mais perigosa" possível segundo princípios CLAUDE.md ("nunca mocks enganosos, nunca mudança silenciosa") | **Rejeitada.** Quebra reprodutibilidade. Princípio: "schema versionado, nunca mutação silenciosa". |
| **C) Schema dinâmico por tipo de skill (inheritance/presets)** | Cada categoria (Research, Proposal, Execution) tem schema próprio mais expressivo · Reduz campos repetidos · Resolve pressão de "Research lê tudo, escreve restrito" elegantemente | **Mudança estrutural massiva** antes do piloto · Exige refazer 31 skills · Engine precisa entender herança/presets · Templates múltiplos confundem onboarding humano · ADR sozinho não basta — exige sprint M/L de implementação · Tempo até piloto explode | **Rejeitada.** Custo > benefício no curto prazo. Pode virar **proposta v2** após piloto, como evolução natural. |

---

## 4. Consequências

### 4.1 Positivas

- **Piloto roda em schema estável** — primeira execução real do Engine não tem risco de "schema mudou no meio".
- **Reprodutibilidade total** — `EXECUTION_LOG.md` referencia `skill_version` que mapeia a `template_version: v1`; execuções históricas reproduzíveis.
- **Approval batch fica seguro** — humano pode aprovar 31 skills sabendo que `status: approved` não vai virar inválido em uma semana.
- **Governança forte respeitada** — princípio CLAUDE.md "schema versionado" honrado mecanicamente.
- **Pressão de melhorias canalizada** para `SKILL_SCHEMA_V2_BACKLOG.md` — não perdida, organizada.
- **Compatibilidade futura** garantida — engine v2 sabe ler skills v1 sem migração forçada.
- **Decisão simétrica com EXECUTION_LOG schema v1** (também congelado no Bloco 32) — mesma filosofia.

### 4.2 Negativas / custos

- **16+ melhorias adiadas** até pós-piloto — workarounds permanecem (`allowed_paths: dynamic` na prosa, `mandatory_sources` no §4 de cada skill WhatsApp etc.).
- **`duration_max: PT2H` em SKILL_AUDIT_MULTI_LOJA** continua exceção sem campo formal — documentada no front matter individual da skill, não no template.
- **Pressão pode acumular** — se piloto demorar para encerrar, backlog v2 cresce.
- **Decisões úteis bloqueadas** — ex: `proposal_lock` em SKILL_PROPOSE_ADR seria útil já, mas exigiria mudança de schema.
- **Skills futuras (Cat. 4 Execution M, Cat. 5 Composite, Cat. 6 Governance)** ainda não escritas têm que **respeitar v1** mesmo se v1 for inadequado para elas.

### 4.3 Riscos introduzidos

| Risco | Mitigação |
|---|---|
| Backlog v2 vira "graveyard" de boas ideias que nunca chegam | Criar `SKILL_SCHEMA_V2_BACKLOG.md` formal já + revisão obrigatória no encerramento do piloto |
| Skills Cat. 4/5/6 (futuras) sofrem mais com v1 limitado | Aceito; criar skills inicialmente com workarounds documentados; v2 pode vir antes do que se imagina se Cat. 4 + Composite forçarem |
| Pressão de "só uma alteração rápida" durante piloto | Engine deve **rejeitar** PRs que mudem `TEMPLATE_SKILL.md` sem ADR aprovado — proteção mecânica |
| Replay falha se alguém edita silenciosamente v1 | `git log` em `TEMPLATE_SKILL.md` deve ser estável; `EXECUTION_LOG.md` é fonte de verdade do que rodou |
| v2 chegar com escopo gigante (Big Bang) | Decisão de "quando v2 começa" exige ADR-0003 dedicado; v2 deve ser incremental, não Big Bang |

### 4.4 O que muda imediatamente

**Arquivos afetados (criados ao aceitar):**
- `docs/decisions/ADR-0002-skill-front-matter-v1-freeze.md` — humano renomeia este draft + move para `docs/decisions/`.
- `docs/decisions/INDEX.md §3` — entrada nova `ADR-0002 · Congelamento do Skill Front Matter v1`.
- `docs/execution/SKILL_SCHEMA_V2_BACKLOG.md` — backlog formal das 16+ melhorias.

**Docs a atualizar:**
- `docs/execution/SKILL_TAXONOMY.md §7` (Versionamento de skills) — adicionar referência a ADR-0002.
- `docs/skills/executoras/TEMPLATE_SKILL.md` — adicionar nota "**v1 CONGELADO** por ADR-0002 (link)".
- `docs/skills/executoras/README.md §5` (Como modificar skill aprovada) — reforçar "Front matter (API congelada): exige ADR + nova versão".

**Outras decisões afetadas:**
- ADR-0003 (futuro) — provavelmente decidirá "quando começar v2" + escopo inicial v2.
- ADR sobre EXECUTION_LOG v2 (futuro) — independente, mas mesma filosofia.

### 4.5 O que muda no longo prazo

- Padrão de **API interna versionada** estabelecido para todos os schemas internos do runtime (template, log, output schemas).
- **Cultura de "schema é contrato"** — qualquer mudança exige ADR. Vira norma do projeto.
- **v2 será revisão informada por dados reais** — não palpite; backlog v2 tem origem em uso real durante Blocos 33-35.
- **Skill Cat. 4 / Cat. 5 / Cat. 6** podem motivar v2 antes do esperado se v1 se mostrar inadequado para elas.

---

## 5. Plano de implementação

**Esta decisão é só decisão — sem implementação de código.**

- **Sprint sugerida:** nenhuma (decisão é meta-governança).
- **Owner humano:** Rafael (dono do projeto).
- **Pré-requisitos:** nenhum.
- **Critério de pronto da decisão:**
  1. Humano aprova este draft (Gate humano de ADR — `decisions/INDEX.md §2`).
  2. Renomeia para `ADR-0002-skill-front-matter-v1-freeze.md` e move para `docs/decisions/`.
  3. Adiciona linha em `docs/decisions/INDEX.md §3`.
  4. Cria `docs/execution/SKILL_SCHEMA_V2_BACKLOG.md` com as 16+ melhorias.
  5. Atualiza `TEMPLATE_SKILL.md` com nota de congelamento.
- **Ações que NÃO ocorrem:** sem mudança de código de produção; sem migration de skill.

---

## 6. Validação / como saberemos que deu certo

- **Métrica 1:** 0 mudanças em `TEMPLATE_SKILL.md` durante a sprint piloto.
- **Métrica 2:** 0 skills com `template_version` diferente de `v1` até pós-piloto.
- **Métrica 3:** `SKILL_SCHEMA_V2_BACKLOG.md` cresce de forma organizada — backlog reflete pressão real (não graveyard).
- **Métrica 4:** Approval batch das 31 skills sem rejeições por "schema instável" (`status: draft → approved` flui).
- **Janela de observação:** até encerramento do piloto SPRINT_01_MULTI_LOJA + 1 retro (Bloco 44).
- **Sucesso final:** decisão de v2 (ADR-0003) é tomada **após o piloto**, baseada em dados reais.

---

## 7. Referências

- **ADRs relacionados:**
  - [`ADR-0001 (legado) — OS_ROUTE_OFICIAL`](../OS_ROUTE_OFICIAL.md) (precedente de governança imutável).
  - **ADR-0003** (futuro) — decisão de quando/como começar v2.
- **Auditorias relacionadas:** nenhuma específica ainda (auditoria do piloto será o primeiro insumo de evidência real).
- **Sprints relacionadas:** **SPRINT_01_MULTI_LOJA** (sprint piloto — terá validação do schema em uso).
- **Issues / discussões externas:** Blocos 33–35 (relatórios contém pressão por melhorias documentada).
- **Documentação de produto/blueprint:**
  - [`docs/skills/executoras/TEMPLATE_SKILL.md`](../../skills/executoras/TEMPLATE_SKILL.md) (o esquema em si).
  - [`docs/execution/SKILL_TAXONOMY.md §7`](../../execution/SKILL_TAXONOMY.md) (versionamento).
  - [`docs/governance/GOVERNANCA.md`](../../governance/GOVERNANCA.md) (princípio "schema versionado").
  - [`docs/blueprint/MASTER_PLAN.md §8`](../../blueprint/MASTER_PLAN.md) (princípios de engenharia: "Mudança em contrato → ADR obrigatório").

---

## 8. Notas / discussão

- **Argumento mais forte para Alternativa A (congelamento):** "schema versionado é princípio CLAUDE.md; mudar v1 silenciosamente é decisão técnica errada por dois motivos: (1) quebra reprodutibilidade do `EXECUTION_LOG`; (2) instabiliza o piloto que é a primeira validação real do Engine."
- **Argumento mais forte para Alternativa B (mutável):** "Os 16+ campos faltantes têm valor real; alguns (`allowed_paths: dynamic`, `mandatory_sources`) já viraram convenção tácita; formalizar agora reduziria ambiguidade." → Contra-argumento aceito: convenção tácita é gerenciável; quebra de reprodutibilidade não.
- **Argumento mais forte para Alternativa C (schema por tipo):** "Inheritance resolveria elegantemente Research vs Execution; reduziria duplicação." → Contra-argumento aceito: certo conceitualmente, mas escopo é M/L, não cabe pré-piloto; vira candidato natural para v2 após piloto.
- **`template_version: v1` no front matter de cada skill** foi decisão proativa (Bloco 32) — agora paga: permite ler v1 e v2 coexistindo no futuro sem migração forçada.
- **Decisão é simétrica** ao congelamento do `EXECUTION_LOG.md` schema v1 (também no Bloco 32) — mesma filosofia, mesma autoridade.
- **Backlog v2 começa com 16+ itens documentados** — não é "graveyard vazio"; pressão é real e mensurável.

---

## 9. Blast radius (visão da skill — humano valida)

> Quanto este ADR afeta o resto do projeto se aceito.

### HUBs afetados
- **Nenhum HUB de produto direto.** Decisão é meta-governança (runtime).
- **Indiretamente:** todos os HUBs futuros que tiverem skills criadas (Cat. 4/5/6) devem seguir v1.

### Áreas protegidas tocadas
- **Nenhuma área protegida** (auth, schema, proxy, lib/core).

### Dependências cross-HUB
- **Nenhuma dependência cross-HUB de código.**
- Dependência **organizacional**: skills futuras devem respeitar congelamento até pós-piloto.

### Estimativa de "tudo o que muda"

| Categoria | Itens afetados |
|---|---|
| Arquivos criados | 2 (ADR-0002 + SKILL_SCHEMA_V2_BACKLOG.md) |
| Arquivos editados | 3 (INDEX.md decisions + TEMPLATE_SKILL.md + README.md executoras) |
| Skills modificadas | **0** (skills permanecem v1) |
| Código modificado | **0** |
| Linhas de diff total estimadas | ~80 |
| Janela necessária | nenhuma (decisão imediata) |
| Reversibilidade | **alta** (apenas docs; reversível por novo ADR) |

**Conclusão:** blast radius **baixo**. Decisão de governança pura. Custo de aceitar é mínimo; custo de NÃO aceitar é instabilidade no piloto.

---

## 10. Necessidade de aprovação humana forte

**`needs_strong_human_approval: true`** — sempre, por ser ADR.

**Razão:**
- ADR é decisão arquitetural imutável após aceite.
- Define **API interna oficial** do runtime de skills.
- Afeta 31 skills já persistidas e todas as futuras.
- Bloqueia certas evoluções até pós-piloto — decisão estratégica que cabe ao humano.

**Quem aprova:** Rafael (dono do projeto).

**Como aprovar (procedimento padrão de ADR):**
1. Ler este draft completo.
2. Confirmar (ou ajustar) recomendação (Alternativa A).
3. Renomear arquivo para `ADR-0002-skill-front-matter-v1-freeze.md`.
4. Mover para `docs/decisions/`.
5. Mudar `status: proposta → aceita` no front matter.
6. Adicionar `data_aceite: <ISO>` e `aprovado_por: Rafael`.
7. Adicionar linha em `docs/decisions/INDEX.md §3`:
   ```
   | 0002 | Congelamento do Skill Front Matter v1 | runtime/governance | ✅ Aceita | 2026-MM-DD | [`ADR-0002-skill-front-matter-v1-freeze.md`](./ADR-0002-skill-front-matter-v1-freeze.md) |
   ```
8. Criar `docs/execution/SKILL_SCHEMA_V2_BACKLOG.md` (template proposto no §11 abaixo).
9. Adicionar nota de congelamento em `TEMPLATE_SKILL.md`.

---

## 11. Verificação de duplicidade

- **ADRs consultados:** todos os ADRs em `docs/decisions/` (1 total).
  - `ADR-0001 (legado) — OS_ROUTE_OFICIAL` (rota oficial de OS — tema completamente diferente).
- **Conflito detectado com:** `null` (nenhum ADR existente cobre "skill front matter" ou "schema de runtime").
- **Substituição sugerida:** `null` (este ADR não substitui ADR existente).
- **Notas:** projeto tem apenas 1 ADR formal pré-existente (legado). ADR-0002 é o **primeiro ADR formal pós-convenção** estabelecida no Bloco 6. Ele inaugura a prática real de ADRs do runtime.

---

## 12. Sugestão de conteúdo para `SKILL_SCHEMA_V2_BACKLOG.md`

> Será criado pelo humano após aceitar este ADR. Sugestão de estrutura inicial:

```markdown
---
title: SKILL_SCHEMA_V2 — Backlog formal
status: backlog (aguardando pós-piloto)
owner: produto + arquitetura
last_update: <data ADR-0002>
referente: ADR-0002 (congelamento v1)
---

# Backlog de evolução do Skill Front Matter (v2)

> v1 congelado por [ADR-0002](../decisions/ADR-0002-skill-front-matter-v1-freeze.md).
> Após sprint piloto + retro, ADR-0003 decidirá quando e como começar v2.

## 1. Campos candidatos a v2

| # | Campo | Justificativa | Origem |
|---|---|---|---|
| 1 | `read_paths_extra: []` | Cat. 1 Research lê tudo, escreve restrito | Bloco 33 Lote A |
| 2 | `mandatory_sources: []` | WhatsApp sempre inclui Meta docs | Bloco 33 Lote 2 |
| 3 | `mandatory_sections: []` | Compliance section sempre em WhatsApp | Bloco 33 Lote 2 |
| 4 | `cross_hubs_warnings: []` | Pares com overlap alto | Bloco 33 Lote 2 |
| 5 | `duration_max_override` por modo | Marketplace deep / Multi-loja sweep | Bloco 33 Lotes 2 e C |
| 6 | `benchmark_targets_default: []` parseável | Hoje na prosa do §4 | Bloco 33 Lote 1 |
| 7 | `findings_schema_version: v1` | AUDIT pareceável | Bloco 33 Lote A |
| 8 | `audit_types_supported: []` enum | AUDITs declaram | Bloco 33 Lote A |
| 9 | `read_only_db_access: bool` | AUDIT roda queries diretas | Bloco 33 Lote A |
| 10 | `requires_event: []` | DOC_REFRESH | SKILL_DOC_REFRESH §12 |
| 11 | `dry_run_default_in: [OVERNIGHT]` | DOC_REFRESH | SKILL_DOC_REFRESH §12 |
| 12 | `proposal_priority: P0-P3` | Priority queue | Bloco 34 |
| 13 | `proposal_lock` (cross) | Anti-conflito ADR | Bloco 34 |
| 14 | `id_strategy: ticket_id\|autoinc\|uuid` | Numeração | Bloco 34 |
| 15 | `output_schema_version: v1` | Versionar outputs | Bloco 34 |
| 16 | `allowed_paths` resolução dinâmica formalizada | DEBT_ITEM/FEATURE_S/STABILIZATION | Bloco 35 |
| 17 | Inheritance/presets por categoria | Reduz duplicação | Alternativa C deste ADR |

## 2. Princípios de v2

- Compatibilidade reversa: engine v2 deve ler skills v1.
- Migration explícita: skill antiga continua antiga; nova nasce v2.
- ADR-0003 decide escopo inicial e cronograma.
```

---

## 13. Recommendation final

> Recomendação consolidada da skill `SKILL_PROPOSE_ADR v1`:

**Aceitar Alternativa A — congelar v1 até pós-piloto.**

**Motivação consolidada:**
1. **Estabilidade do piloto é prioridade absoluta** — primeira execução real do Engine não tolera schema mudando.
2. **Reprodutibilidade do EXECUTION_LOG** depende de `template_version: v1` estável.
3. **16+ melhorias documentadas** têm canal de captura formal (`SKILL_SCHEMA_V2_BACKLOG.md`) — não perdidas.
4. **Princípio "schema versionado"** do CLAUDE.md honrado mecanicamente.
5. **Compatibilidade reversa** (engine v2 lê v1) preservada pela coexistência via `template_version`.
6. **Custo de aceitar é mínimo** (blast radius baixo, reversível, sem código tocado).
7. **Custo de não aceitar é alto** (instabilidade no piloto + drift de schema garantido).

**Esta proposta é insumo — humano decide.**

---

## Apêndice — Metadata da geração

| Campo | Valor |
|---|---|
| Skill geradora | `SKILL_PROPOSE_ADR v1` |
| Ticket | `ADR-PROP-0002` |
| Duração estimada da pesquisa | ~25 min (PT25M) |
| Fontes lidas | 12 (skills/, execution/, governance/, blueprint/, status/, decisions/, ai/) |
| Decisão arquitetural sugerida | Alternativa A (congelar v1 até pós-piloto) |
| Aprovação humana forte | **Obrigatória** |
| Verificação de duplicidade | ✅ Sem conflito (apenas ADR-0001 legado existe) |
| Próximo passo | Humano valida → renomeia → move para `docs/decisions/` → atualiza INDEX.md |
