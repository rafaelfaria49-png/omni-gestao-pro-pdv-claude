---
title: Execution Engine — Pipeline oficial
status: vivo
owner: produto + arquitetura
last_update: 2026-05-27
versao: v1
bloco: 29
---

# ⚙️ Execution Engine — Pipeline oficial de 17 fases

> **Toda execução de skill obedece este pipeline.** Pular fase = violação de governança.
> **Aprovado em 2026-05-27** com 7 decisões fundadoras (ver [`INDEX.md §4`](./INDEX.md)).

---

## 1. Visão geral

O Execution Engine recebe um **ticket** (item de backlog, blocker, dívida, finding de auditoria, ou comando humano), corre 17 fases sequenciais, e termina com:
- Código mergeado (ou PR draft para revisão humana).
- Sprint encerrada e imutável.
- Documentação atualizada (CURRENT_STATUS, roadmap, status vivos).
- Handoff persistido.
- Próximo ticket elegível (em modo composite/overnight).

Cada fase tem **input, output, critério de aprovação, modo de falha**.

---

## 2. As 17 fases

### FASE 1 — INTAKE
- **Trigger:** humano aciona skill OU IA no modo OVERNIGHT_BATCH puxa próximo da fila.
- **Input:** `{hub, item_origem, modo}` onde `item_origem` é referência a backlog/blocker/dívida/finding/comando livre.
- **Output:** `ticket_id` no formato `<HUB-SLUG>-<TAMANHO>-<NNN>`.
- **Passa se:** input válido e modo permitido.
- **Falha:** ABORT silencioso, mensagem ao humano.

### FASE 2 — PRE-FLIGHT (read-only, ~3 min)
- **Lê:**
  - `docs/roadmaps/ROADMAP_<HUB>.md` (§5 gaps, §6 funcionalidades futuras, §7 backlog, §9 dependências, §14 blockers)
  - `docs/ai/CURRENT_STATUS_OVERVIEW.md`
  - `docs/status/{DIVIDA_TECNICA,RISCOS,BLOCKERS}.md`
  - ADRs do HUB
  - Memórias relacionadas em `memory/`
  - Áreas protegidas em `docs/governance/GOVERNANCA.md`
- **Verifica:**
  - Item existe no roadmap?
  - HUB está em "verde" (sem blocker P0 aberto)?
  - Toca área protegida? (se sim, exige flag humana ao vivo — não passa em overnight)
  - Existe ADR pendente que bloqueia? (ex: BL-12 Marketplace bloqueia adapter)
- **Output:** `PRE_FLIGHT_<ticket_id>.md` com checklist + verde/amarelo/vermelho.
- **Falha:** ABORT com motivo claro persistido no log.

### FASE 3 — LOCK ACQUIRE
- **Tenta:** adquirir lock em `docs/status/LOCKS.md` para o HUB.
- **Lock contém:** `{ticket_id, ia, started_at, ttl=4h, heartbeat_at}`.
- **Honra:** matriz de paralelismo do `roadmaps/INDEX.md §4` — se HUB X já tem lock e tem dependência "serial obrigatório" com este, ABORT.
- **Falha:** ABORT — outra IA está aí ou serialização não permite.

### FASE 4 — SCOPE ASSESS
- **Confirma tamanho** estimado (S/M/L/XL).
- **Regra:**
  - S (≤ 4h) → prossegue
  - M (≤ 8h) → prossegue
  - L (> 8h) → exige flag humana explícita
  - XL → REJEITA + propõe quebra em N skills S/M
- **Em overnight:** apenas S passa.

### FASE 5 — BENCHMARK (condicional)
- **Dispara se:** feature nova OU mudança arquitetural OU UX nova OU fluxo novo OU integração nova OU módulo novo.
- **Pula se:** bugfix puro OU debt-item conhecido OU mock removal OU estabilização pequena.
- **Como:** aciona `SKILL_BENCHMARK_<HUB>` conforme [`BENCHMARK_PROTOCOL.md`](./BENCHMARK_PROTOCOL.md) (Bloco 36 — a criar).
- **Cap rígido:** 5 concorrentes, 30 min, 12 fontes web.
- **Output:** `docs/audits/benchmarks/BENCHMARK_<ticket_id>.md`.

### FASE 6 — PROPOSTA
- **Gera:** `docs/sprints/proposals/SPRINT_<ticket_id>.md` usando `docs/sprints/TEMPLATE_SPRINT.md`.
- **Contém:**
  - Escopo dentro/fora
  - Definition of Done
  - Plano por checkpoint (1 checkpoint = 1 etapa)
  - **Allow-list de paths** (declarada explicitamente)
  - Riscos identificados
  - ADR sugerido se aplicável
  - Estimativa de tempo
- **Tamanho:** se proposta excedeu o estimado em §4, retorna a §4.

### FASE 7 — ⛔ HUMAN GATE #1 (aprovação da proposta)
- **Humano vê:** proposta + benchmark (se houve).
- **Pode:** aprovar, modificar (gera v2), rejeitar (ABORT + libera lock).
- **Sem aprovação:** PAUSE indefinido (lock mantém heartbeat).
- **Em overnight:** aprovação prévia da fila em `OVERNIGHT_QUEUE.md` substitui este gate **apenas para skills S elegíveis**.

### FASE 8 — PRE-IMPL TESTS
- **Roda em série:**
  ```
  npx tsc --noEmit
  npm run build   (se proposta mexe em config/rotas/Server Actions/Prisma)
  npm run test    (se proposta mexe em código testado)
  ```
- **Critério:** tudo verde **antes** de tocar qualquer arquivo.
- **Falha:** ABORT — projeto já estava sujo, não é da sprint.

### FASE 9 — GIT SNAPSHOT
- **Cria branch:** `skill/<ticket_id>`.
- **Registra:** hash do `HEAD` anterior em `EXECUTION_LOG.md` para rollback determinístico.

### FASE 10 — IMPLEMENT
- **Regra cirúrgica:** mudanças só em paths declarados na allow-list (§6 da proposta).
- **Commit por checkpoint:** 1 commit por etapa do plano.
- **Limites:**
  - Diff total ≤ 500 linhas. Excedeu → PAUSE + humano.
  - Touch em path fora da allow-list → ABORT + ROLLBACK.
  - Comando destrutivo (`rm -rf`, `git reset --hard`, `--no-verify`, drop table) → ABORT.

### FASE 11 — POST-IMPL TESTS
- **Roda:** `tsc`, `build`, `vitest` (novos + antigos).
- **Se vermelho:** 1 tentativa de fix. Falha 2ª vez → ROLLBACK automático.

### FASE 12 — AUDIT pós-implementação
- **Aciona:** `SKILL_AUDIT_<HUB>` com escopo restrito à sprint (não auditoria global).
- **Gera:** `docs/audits/AUDIT_<ticket_id>.md` com findings P0–P3.
- **Regras:**
  - P0 encontrado → ROLLBACK + escalonar para humano.
  - P1 envolvendo dinheiro/fiscal/multi-loja → upgrade automático para P0 (regra do `AUDIT_PROTOCOL.md §3`).
  - P1/P2/P3 sem upgrade → vai para `DIVIDA_TECNICA.md` se aceito, ou bloqueia merge.

### FASE 13 — ⛔ HUMAN GATE #2 (aprovação para merge)
- **Humano vê:** diff completo, AUDIT, BENCHMARK (se houve), testes verdes.
- **Pode:** aprovar merge, pedir ajuste (volta a §10), rejeitar (ROLLBACK).
- **NUNCA automático.** Decisão fundadora #4: humano sempre clica merge.
- **Em overnight:** gera PR draft, **para aí** — espera humano de dia.

### FASE 14 — DOC UPDATE
- **Atualiza:**
  - `CURRENT_STATUS_OVERVIEW.md` §1 (maturidade do HUB se mudou), §5 (dívida resolvida), §6 (entrada nova).
  - `ROADMAP_<HUB>.md` §5 (gap removido), §7 (item de backlog feito), §11 (sprint encerrada → próxima sugerida).
  - `DIVIDA_TECNICA.md` (DT-NN movido para §3 se pagou).
  - `MOCKS_TRACKING.md` (MOCK-NN movido para §3 se removeu).
  - `RISCOS.md` (R-NN mitigado se aplicável).
  - `BLOCKERS.md` (BL-NN destravado se aplicável).

### FASE 15 — ADR / MEMORY (condicionais)
- **ADR:** se houve decisão arquitetural na sprint, persiste `ADR-<NNNN>-<slug>.md` conforme `decisions/TEMPLATE_ADR.md` e atualiza `decisions/INDEX.md §3`.
- **Memory:** se houve aprendizado reutilizável, persiste `memory/<slug>.md` e atualiza `MEMORY.md` no diretório do usuário (não no repo).

### FASE 16 — HANDOFF + LOG
- **Aciona `SKILL_HANDOFF`:**
  - Atualiza `docs/governance/SESSION_HANDOFF.md` com ticket, resultado, próximo passo sugerido.
- **Aciona log:**
  - `docs/status/EXECUTION_LOG.md` ganha entrada append-only `{ticket_id, ia, started_at, ended_at, fases_completas, resultado}`.

### FASE 17 — LOCK RELEASE + NEXT INTAKE
- **Libera lock** do HUB em `LOCKS.md`.
- **Sprint** marcada como `encerrada` (imutável conforme `SPRINT_PROTOCOL.md §10`).
- **Se modo composite (`SKILL_FULL_SPRINT`):** FIM.
- **Se modo `SKILL_OVERNIGHT_BATCH` ativo:** busca próximo ticket da `OVERNIGHT_QUEUE.md` e volta à FASE 1. Para se: orçamento esgotado, erro, fim da fila.

---

## 3. Diagrama compacto do fluxo

```
INTAKE → PRE-FLIGHT → LOCK → SCOPE → [BENCHMARK?] → PROPOSAL
                                                       ↓
                                                  ⛔ GATE #1 (humano)
                                                       ↓
                                  PRE-TESTS → SNAPSHOT → IMPLEMENT
                                                                ↓
                                                          POST-TESTS
                                                                ↓
                                                            AUDIT
                                                                ↓
                                                       ⛔ GATE #2 (humano)
                                                                ↓
                                       DOC UPDATE → ADR/MEMORY → HANDOFF
                                                                      ↓
                                                          LOCK RELEASE + NEXT
```

---

## 4. Tabela de modos de falha por fase

| Fase | Falha típica | Ação |
|---|---|---|
| 1 INTAKE | input inválido | ABORT |
| 2 PRE-FLIGHT | área protegida sem flag | ABORT |
| 2 PRE-FLIGHT | blocker P0 aberto no HUB | ABORT |
| 3 LOCK | lock ocupado | ABORT |
| 4 SCOPE | tamanho XL | REJEITA + propõe quebra |
| 5 BENCHMARK | cap excedido | trunca + segue |
| 6 PROPOSAL | escopo estourou estimativa | volta para §4 |
| 7 GATE #1 | humano rejeita | ABORT + libera lock |
| 8 PRE-TESTS | algo vermelho antes | ABORT |
| 9 SNAPSHOT | branch já existe | usa próximo nome único |
| 10 IMPLEMENT | touch fora allow-list | ROLLBACK |
| 10 IMPLEMENT | diff > 500 linhas | PAUSE + humano |
| 11 POST-TESTS | vermelho 2 vezes | ROLLBACK |
| 12 AUDIT | P0 encontrado | ROLLBACK + escala |
| 13 GATE #2 | humano rejeita | ROLLBACK |
| 14 DOC | falha ao escrever doc | PAUSE (não ROLLBACK — código está ok) |
| 15 ADR/MEMORY | falha persistir | PAUSE |
| 16 HANDOFF | falha gerar | PAUSE |
| 17 LOCK RELEASE | falha técnica | force-release manual |

---

## 5. Onde cada fase persiste artefatos

| Fase | Artefato | Pasta |
|---|---|---|
| 1 | `ticket_id` | só em log |
| 2 | PRE_FLIGHT_<ticket>.md | `docs/sprints/proposals/` |
| 3 | lock | `docs/status/LOCKS.md` |
| 5 | BENCHMARK_<ticket>.md | `docs/audits/benchmarks/` |
| 6 | SPRINT_<ticket>.md (proposta) | `docs/sprints/proposals/` |
| 7 | aprovação humana | inline no SPRINT_<ticket>.md (campo `approved_by`, `approved_at`) |
| 9 | branch `skill/<ticket_id>` | git |
| 10 | commits | git |
| 12 | AUDIT_<ticket>.md | `docs/audits/` |
| 13 | aprovação humana | inline no SPRINT_<ticket>.md (campo `merge_approved_by`) |
| 14 | docs atualizados | conforme fase |
| 15 | ADR / memory | `docs/decisions/` ou `memory/` |
| 16 | HANDOFF + log | `docs/governance/SESSION_HANDOFF.md` + `docs/status/EXECUTION_LOG.md` |
| 17 | sprint encerrada | `docs/sprints/SPRINT_<ticket>.md` (movido de proposals/ para raiz) |

---

## 6. Quem pode pular fases?

**Ninguém.** Mas algumas fases são condicionais:

| Fase | Condição para pular |
|---|---|
| 5 BENCHMARK | Bugfix puro OU debt-item conhecido OU mock removal OU estabilização pequena (decisão fundadora #6) |
| 12 AUDIT em escopo amplo | Skill é categoria **research** ou **proposal** (não tocou código) |
| 14 DOC UPDATE em alguns campos | Se nada do que ele atualizaria mudou |
| 15 ADR | Não houve decisão arquitetural |
| 15 MEMORY | Não houve aprendizado reutilizável |

**Nunca puláveis:** 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 13, 16, 17.

---

## 7. Relação com sprint protocol

- `SPRINT_PROTOCOL.md` (Bloco 4) define **o que é uma sprint** e seu ciclo de vida (definição → planning → execução → encerramento → retro).
- Este pipeline **automatiza** parte desse ciclo:
  - Engine **cria** o SPRINT_<ticket>.md na Fase 6 (era manual).
  - Engine **executa** Fases 10–11 (era manual).
  - Engine **audita** na Fase 12 (era opcional).
  - Engine **encerra** e atualiza docs nas Fases 14–17 (era manual).
- A imutabilidade pós-encerramento (`SPRINT_PROTOCOL §10`) continua valendo.

---

## 8. Estado das fases em cada modo

| Fase | SAFE | OVERNIGHT | COWORK | AUDIT |
|---|---|---|---|---|
| 1 INTAKE | manual | da fila | manual ou da fila | manual |
| 2 PRE-FLIGHT | obrig | obrig | obrig | obrig |
| 3 LOCK | obrig | obrig | obrig (chave da serialização) | leitura-only |
| 4 SCOPE | aceita S/M/L | apenas S | aceita S/M | n/a |
| 5 BENCHMARK | condicional | apenas se feature nova | condicional | n/a |
| 6 PROPOSAL | obrig | obrig (gerada pela skill) | obrig | n/a |
| 7 GATE #1 | humano ao vivo | coberto por aprovação prévia da fila | humano ao vivo | n/a |
| 8 PRE-TESTS | obrig | obrig | obrig | n/a |
| 9 SNAPSHOT | obrig | obrig | obrig | n/a |
| 10 IMPLEMENT | obrig | obrig (sem áreas protegidas) | obrig | n/a |
| 11 POST-TESTS | obrig | obrig | obrig | n/a |
| 12 AUDIT | obrig | obrig | obrig | é a fase |
| 13 GATE #2 | humano ao vivo | **para aí** — PR draft | humano ao vivo | n/a |
| 14 DOC UPDATE | obrig pós-merge | depois que humano mergeia de dia | obrig pós-merge | só doc da auditoria |
| 15 ADR/MEMORY | condicional | condicional (sem ADR novo em overnight) | condicional | só memory se houver |
| 16 HANDOFF + LOG | obrig | obrig | obrig | obrig |
| 17 LOCK RELEASE | obrig | obrig | obrig | n/a |

---

## 9. Versionamento do pipeline

- Esta é a **v1** (aprovada 2026-05-27).
- Mudança no pipeline → ADR + nova versão (v2).
- Pipeline antigo preservado (não editado retroativamente).

---

## 10. Fonte da verdade

- **Pipeline oficial:** este arquivo.
- **Decisões fundadoras:** [`INDEX.md §4`](./INDEX.md).
- **Limites:** [`SAFE_GUARDS.md`](./SAFE_GUARDS.md).
- **Gates obrigatórios:** [`HUMAN_GATES.md`](./HUMAN_GATES.md).
- **Quem pode rodar o quê:** [`SKILL_TAXONOMY.md`](./SKILL_TAXONOMY.md).
