---
title: Sprint Protocol — Como rodar uma sprint no OmniGestão Pro
status: bloco-4
owner: produto/arquitetura
last_update: 2026-05-27
versao: v1
depende_de:
  - docs/governance/GOVERNANCA.md
  - docs/governance/WORKFLOW_MULTI_IA.md
  - docs/governance/SESSION_HANDOFF.md
template:
  - docs/sprints/TEMPLATE_SPRINT.md  (bloco 20 — a entregar)
---

# 🏃 Sprint Protocol — OmniGestão Pro

> **Quem deve ler:** humano dono do projeto e toda IA que vá executar sprint.
> **O que define:** como uma sprint nasce, vive e morre no OmniGestão Pro.
> **Princípio central:** **uma sprint = um HUB = um arquivo imutável no final.**

---

## 1. O que é uma sprint aqui

Sprint é uma **janela curta e fechada** de trabalho num **único HUB**, com escopo definido **antes** e relatório imutável **depois**.

- **Não é** "tudo que fizermos esta semana".
- **Não é** lista de bugs aleatórios.
- **Não é** refactor "geral" sem alvo.
- **É** um pacote nomeado: *Sprint 09 — Financeiro · Conciliação Bancária MVP*.

---

## 2. Princípios

1. **1 sprint = 1 HUB.** Cross-cutting pequeno (microajuste em outro HUB) só com justificativa documentada.
2. **Escopo fechado antes do start.** Mid-sprint addition é exceção, não regra.
3. **Curta:** 5 a 10 dias úteis. Acima disso, quebrar em duas.
4. **Backlog → Sprint → Status.** Backlog é input (lista priorizada). Sprint é execução. Status é estado vivo.
5. **Encerramento gera arquivo imutável.** `docs/sprints/SPRINT_NN_<HUB>.md` nunca é editado depois — só referenciado.

---

## 3. Estrutura de uma sprint

```
┌────────────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────────┐   ┌────────────────┐
│  0. Definição  │ → │ 1. Planning  │ → │ 2. Execução │ → │ 3. Encerra-  │ → │ 4. Retrospec-  │
│   (humano +    │   │  (ChatGPT/   │   │ (Sonnet /   │   │    mento     │   │    tiva curta  │
│    ChatGPT/    │   │   Opus)      │   │  Antigravity│   │  (Sonnet)    │   │  (humano +     │
│    Opus)       │   │              │   │  / Composer)│   │              │   │   ChatGPT)     │
└────────────────┘   └──────────────┘   └─────────────┘   └──────────────┘   └────────────────┘
   1 dia              0.5–1 dia          5–8 dias           0.5 dia            0.5 dia
```

Cada fase tem checklist próprio (§§ 5–9).

---

## 4. Como escolher o escopo da sprint

### 4.1 Inputs

- `docs/roadmaps/ROADMAP_<HUB>.md §7` — backlog canônico (itens priorizados). `docs/status/BACKLOG_<HUB>.md` quando existir (alias histórico).
- `docs/ai/CURRENT_STATUS.md` — estado atual (P0/P1 abertos).
- `docs/roadmaps/ROADMAP_<HUB>.md` — fase atual do HUB.
- `docs/status/BLOCKERS.md` — bloqueios que precisam virar sprint.

### 4.2 Critérios para entrar na sprint

| Critério | Ok? |
|---|---|
| Cabe em 5–10 dias úteis | obrigatório |
| Pertence a 1 HUB | obrigatório (exceções documentadas) |
| Tem critério de pronto verificável | obrigatório |
| Não toca área protegida sem autorização prévia | obrigatório |
| Tem owner humano nominal | obrigatório |
| Resolve P0 / P1 OU avança fase do roadmap | desejável |

### 4.3 O que **não** entra

- "Refatorar o HUB inteiro."
- "Melhorar performance" (sem métrica).
- "Resolver o que aparecer."
- Mais de 2 HUBs misturados.
- Tarefa que depende de decisão arquitetural ainda não tomada (faltam ADR/blueprint).

---

## 5. Fase 0 — Definição (1 dia)

Saída: 1 frase + objetivo + critério de pronto.

```text
[ ] 1. Escolher HUB foco
[ ] 2. Escolher 1–5 itens do BACKLOG_<HUB>.md
[ ] 3. Escrever em 1 frase: "Sprint NN — <HUB> · <tema curto>"
[ ] 4. Definir critério de pronto verificável (cada item)
[ ] 5. Confirmar que não toca área protegida sem autorização
[ ] 6. Definir owner humano
[ ] 7. Aprovar com dono do projeto
```

---

## 6. Fase 1 — Planning (0.5–1 dia)

Saída: arquivo `docs/sprints/SPRINT_NN_<HUB>.md` em **estado "planejada"**.

```text
[ ] 1. Criar SPRINT_NN_<HUB>.md a partir do TEMPLATE_SPRINT.md
[ ] 2. Listar TODOS os itens da sprint com:
       - id (S<NN>.<seq>)
       - descrição
       - critério de pronto
       - IA recomendada (ver WORKFLOW_MULTI_IA §2)
       - esforço estimado (h ou d)
       - risco (baixo/médio/alto)
       - depende de (outros itens da sprint, se houver)
[ ] 3. Identificar arquivos críticos esperados (path-level)
[ ] 4. Identificar áreas a NÃO tocar
[ ] 5. Identificar locks (BLOCKERS.md)
[ ] 6. Definir start_date e end_date_alvo
[ ] 7. Confirmar dependências externas (autorização schema, credenciais, etc.)
[ ] 8. Commit: chore(sprints): planning sprint NN — <HUB> · <tema>
```

**Regra:** se a sprint tem item de risco alto, **Opus revisa o plano antes** do start (ADR se necessário).

---

## 7. Fase 2 — Execução (5–8 dias)

Saída: código rodando + atualizações de `CURRENT_STATUS` por item.

### 7.1 Regras durante a execução

- Cada item da sprint = ao menos 1 sessão completa (com `SESSION_HANDOFF` aplicado).
- **Um item por vez.** Não pular para outro item antes de fechar o atual.
- IA correta para a tarefa (`WORKFLOW_MULTI_IA §2`).
- Áreas protegidas (`GOVERNANCA.md §4`) tocadas só com autorização explícita registrada no item.
- Commits pequenos com mensagem claras (`feat(<hub>): ...`, `fix(<hub>): ...`).
- `CURRENT_STATUS.md` atualizado a cada item concluído (bloco novo no topo).

### 7.2 Mid-sprint addition (exceção)

Se algo novo precisar entrar na sprint:

```text
[ ] 1. Avaliar com humano: é realmente urgente?
[ ] 2. Se sim: tirar item de mesmo esforço da sprint
[ ] 3. Atualizar SPRINT_NN_<HUB>.md com o swap (justificativa explícita)
[ ] 4. Nunca: empilhar sem tirar nada (vira sprint estourada)
```

### 7.3 Daily / sync (opcional, recomendado se sessão é longa)

Curto, 5 linhas:

```text
Daily · YYYY-MM-DD · Sprint NN
✅ Feito ontem: <…>
🟡 Hoje: <…>
⛔ Blocker: <…> (ou "nenhum")
```

---

## 8. Fase 3 — Encerramento (0.5 dia)

Saída: sprint marcada como "concluída" + arquivo imutável + entries finais.

```text
[ ] 1. Para cada item: marcar status (✅ concluído / 🟡 parcial / ⏭️ movido p/ próxima)
[ ] 2. Validar todos os critérios de pronto (tsc, build, fluxo manual)
[ ] 3. Atualizar SPRINT_NN_<HUB>.md (preencher seções "Entregas", "Riscos restantes", "Lições")
[ ] 4. Marcar sprint como status: concluída no front matter
[ ] 5. Mover itens não concluídos para BACKLOG_<HUB>.md (com nota "carryover sprint NN")
[ ] 6. Atualizar BACKLOG_<HUB>.md (concluídos riscados, P0/P1 reavaliados)
[ ] 7. Atualizar CURRENT_STATUS.md (overview enxuto)
[ ] 8. Atualizar docs/sprints/INDEX.md (linha nova)
[ ] 9. ADR(s) e post-mortem(s) se aplicável
[ ] 10. HANDOFF para próxima sprint (formato SESSION_HANDOFF §5)
[ ] 11. Commit: chore(sprints): encerrar sprint NN — <HUB>
```

**Imutabilidade:** após encerrada, `SPRINT_NN_<HUB>.md` **não é mais editado**. Correções/contexto vão em arquivo novo.

---

## 9. Fase 4 — Retrospectiva curta (0.5 dia)

Saída: ≤ 5 linhas no final do `SPRINT_NN_<HUB>.md`.

```markdown
## Retrospectiva

- O que funcionou: <…>
- O que não funcionou: <…>
- O que ajustar no protocolo / IAs / escopo: <…>
- Lições para virar memória persistente (ADR / memory entry): <…>
```

Se a lição for relevante para o longo prazo → criar entrada em `docs/memory/OMNIGESTAO_MASTER_MEMORY.md` ou ADR em `docs/decisions/`.

---

## 10. Naming convention de sprints

```
SPRINT_<NN>_<HUB>.md

Exemplos:
  SPRINT_01_PDV.md
  SPRINT_02_OPERACOES_OS.md
  SPRINT_03_FINANCEIRO.md
  SPRINT_04_PDV.md           ← PDV de novo, sprint diferente
```

- `<NN>` é sequencial global do projeto (não reseta por HUB).
- `<HUB>` segue mesma nomenclatura de `roadmaps/ROADMAP_<HUB>.md`.

Atualizar `docs/sprints/INDEX.md` a cada criação:

```markdown
| # | Sprint | HUB | Start | End | Status | Owner |
|---|--------|-----|-------|-----|--------|-------|
| 09 | Conciliação Bancária MVP | Financeiro | 2026-06-01 | 2026-06-10 | 🏃 em curso | Rafael |
| 08 | Black Edition Persistência | PDV | 2026-05-28 | 2026-05-30 | ✅ concluída | Rafael |
```

---

## 11. Anti-padrões

- **Sprint sem owner humano.** Vira ninguém-toma-decisão.
- **Sprint sem critério de pronto.** Vira "achei que terminei".
- **Sprint multi-HUB.** Vira backlog disfarçado de sprint.
- **Item sem IA recomendada.** Vira "joga pra qualquer um".
- **Mid-sprint addition sem swap.** Vira sprint que estoura.
- **`SPRINT_NN.md` editado pós-encerramento.** Quebra imutabilidade — perde histórico.
- **Sprint que não atualiza `CURRENT_STATUS` por item.** Perde rastreabilidade.
- **Sprint que não move carryover para BACKLOG.** Perde itens em aberto.

---

## 12. Fluxo visual end-to-end

```
BACKLOG_<HUB>.md
       │
       │  pick top items
       ▼
  Definição (Fase 0)
       │
       │  approve + scope
       ▼
  Planning (Fase 1)              cria docs/sprints/SPRINT_NN_<HUB>.md
       │                          status: planejada
       │                          arquivo cresce mas ainda muta
       ▼
  Execução (Fase 2) ─────────┐
       │                     │   cada item:
       │                     │     - 1 sessão (SESSION_HANDOFF)
       │                     │     - IA correta (WORKFLOW_MULTI_IA)
       │                     │     - atualiza CURRENT_STATUS
       │                     └─→  commits incrementais
       ▼
  Encerramento (Fase 3)           SPRINT_NN imutável
       │                          INDEX atualizado
       │                          BACKLOG atualizado
       │                          CURRENT_STATUS atualizado
       ▼
  Retrospectiva (Fase 4)          memória persistente se aplicável
       │
       │  HANDOFF para próxima sprint
       ▼
   próxima Sprint
```

---

## 13. Resumo executivo (cole isso para a IA de planning)

```text
RODAR UMA SPRINT NO OMNIGESTAO PRO:

0. Definir: 1 HUB, 1–5 itens, critério de pronto, owner humano.
1. Planejar: criar docs/sprints/SPRINT_NN_<HUB>.md (template),
   listar itens com IA/esforço/risco, identificar locks.
2. Executar: 1 item por vez, IA correta, áreas protegidas só com autorização,
   atualizar CURRENT_STATUS a cada item.
3. Encerrar: validar critérios, marcar status, mover carryover para BACKLOG,
   atualizar INDEX, ADR/post-mortem se aplicável, HANDOFF.
4. Retro: 4 linhas no SPRINT_NN, lição vira memória persistente se relevante.

Regras: 1 HUB, escopo fechado, 5–10d, sem mid-sprint addition sem swap,
SPRINT_NN imutável após encerramento.
```
