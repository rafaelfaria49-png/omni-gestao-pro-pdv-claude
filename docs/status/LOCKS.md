---
title: LOCKS — Serialização manual assistida (MVP)
status: vivo
owner: produto + IA executora (lock acquire/release manual)
last_update: 2026-05-27
versao: MVP-v1
referente: docs/execution/EXECUTION_ENGINE.md §3 (Fase LOCK ACQUIRE), §17 (Fase LOCK RELEASE)
---

# 🔒 LOCKS — Serialização manual assistida (MVP)

> **Mecanismo mínimo de serialização para execução governada do runtime.**
> **MVP intencionalmente simples:** sem daemon, sem heartbeat automático, sem lock manager, sem queue, sem deadlock resolution. Apenas **governança documental + procedimento humano-assistido**.
> Evolução futura (lock manager, leases, distributed locks) → backlog runtime / ADR pós-piloto.

---

## 1. Princípios

| # | Princípio | Por quê |
|---|---|---|
| 1 | **1 lock ativo por HUB** | Evita execução paralela conflitante no mesmo HUB |
| 2 | **Multi-loja é sempre serial** | Mudanças em isolamento afetam todos os HUBs — toda mudança em multi-loja exige lock dedicado |
| 3 | **Execution Skills não rodam sem lock** | Cat. 3 e 4 (FIX_MOCK, DEBT_ITEM, FEATURE_S, STABILIZATION, TESTING) **exigem** lock ativo no HUB-alvo |
| 4 | **Proposal/Audit podem rodar sem lock formal** | Cat. 1 (Research) e Cat. 2 (Proposal) não modificam código; lock simbólico OK |
| 5 | **Humano pode remover lock manualmente** | Emergência ou IA travada; humano edita este arquivo diretamente |
| 6 | **LOCK não substitui approval gate** | Lock garante exclusividade; aprovação humana garante decisão. São camadas independentes |
| 7 | **Lock é documental** | Reside neste arquivo; engine real lê e respeita; sem runtime service |

---

## 2. Schema de uma entrada (MVP)

Cada lock vive como linha na tabela §3 com os campos:

| Campo | Tipo | Obrig | Descrição |
|---|---|---|---|
| `HUB` | enum | sim | Vocabulário oficial (`roadmaps/INDEX.md §5`): `pdv`, `operacoes_os`, `financeiro`, `estoque`, `marketplace`, `crm`, `whatsapp`, `marketing_ia`, `omni_agent`, `bi`, `multi_loja`, `cross` |
| `ticket_id` | string | sim | ID do ticket que está usando o lock (ex: `MULTI_LOJA-S-001`) |
| `IA` | enum | sim | Quem segura o lock: `opus`, `sonnet`, `composer`, `claude_code`, `cowork`, `humano` |
| `started_at` | ISO 8601 | sim | Quando o lock foi adquirido (com timezone -03:00) |
| `ttl` | ISO 8601 duration | sim | Tempo máximo de vida (padrão MVP: `PT4H`) |
| `heartbeat_at` | ISO 8601 \| `manual` | sim | Última checagem; MVP usa `manual` (sem heartbeat automático) |
| `status` | enum | sim | `active` \| `released` \| `expired` \| `abandoned` |
| `notes` | string | não | Contexto opcional |

### 2.1 Status possíveis

| Status | Significado | O que fazer |
|---|---|---|
| `active` | Lock vivo, IA está trabalhando | Outras IAs **devem esperar** ou rodar em HUB diferente |
| `released` | Skill encerrou; lock disponível | Histórico para auditoria; pode ser limpo na revisão mensal |
| `expired` | TTL passou sem release; IA pode ter travado | Humano valida e marca como `abandoned` ou reativa |
| `abandoned` | Humano confirmou que IA não vai voltar | Lock pode ser sobrescrito por nova execução |

---

## 3. Locks ativos

> **Esta tabela é a fonte da verdade do "quem está mexendo em quê agora".**
> Quando um lock vira `released` ou `abandoned`, mover a linha para §4 (histórico).

| HUB | ticket_id | IA | started_at | ttl | heartbeat_at | status | notes |
|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | nenhum lock ativo no momento |

---

## 4. Histórico de locks (últimos 90 dias)

> Movido aqui quando `status` muda para `released` ou `abandoned`. Append-only para auditoria.

| HUB | ticket_id | IA | started_at | ended_at | duracao | status final | notes |
|---|---|---|---|---|---|---|---|
| multi_loja | MULTI_LOJA-S-001 | sonnet | 2026-05-29 | 2026-05-30 | — | released | Piloto SPRINT_01_MULTI_LOJA (F-01/F-02/F-05/F-06/F-07/F-14). Datas por git: execução CP1–CP4 em 2026-05-29 (6436d9b→22ae2e6), fechamento/Gate #2 em 2026-05-30 (7d304db). Horas e duração NÃO rastreadas (lock não foi registrado em §3 à época; ENTRY 009 auto-reportou ~PT7H45M). Registro retroativo no R0-L0. |

---

## 5. Procedimento manual de aquisição

### 5.1 Quem aciona
- IA ao iniciar Fase 3 (LOCK ACQUIRE) do `EXECUTION_ENGINE.md`.
- Humano pode iniciar lock manualmente quando vai trabalhar diretamente em código.

### 5.2 Passos
1. **Verificar §3** — existe linha `active` para o HUB-alvo?
   - **Sim:** ABORT — outro lock está ativo. Esperar `release`/`expire` ou trabalhar em outro HUB.
   - **Sim mas `status: expired`:** ver §6.
   - **Não:** prosseguir.
2. **Verificar matriz §4 do `docs/roadmaps/INDEX.md`** — meu HUB-alvo tem **par "serial obrigatório"** com algum HUB com lock ativo?
   - **Sim:** ABORT — serialização exige esperar.
   - **Não:** prosseguir.
3. **Adicionar linha em §3** com os campos preenchidos:
   ```
   | <hub> | <ticket_id> | <ia> | <ISO> | PT4H | manual | active | <notes> |
   ```
4. **Confirmar lock** ao engine (ou marcar mentalmente para humano) e iniciar Fase 4.

### 5.3 Pares serial obrigatório (resumo da matriz §4 do INDEX)
- `marketplace` × `estoque` — sempre serial.
- `omni_agent` × qualquer HUB executor — sempre serial.
- `multi_loja` × qualquer HUB — fortemente recomendado serial (transversal).

---

## 6. Procedimento manual de liberação

### 6.1 Caso normal (skill encerrou OK)
1. Editar a linha em §3.
2. Mudar `status: active → released`.
3. Adicionar `ended_at` no `notes` (ou no `heartbeat_at` se preferir).
4. **Mover a linha para §4** com colunas adaptadas (`ended_at`, `duracao`).
5. Substituir por linha placeholder em §3 (ou deixar HUB sem lock se for o único).

### 6.2 Lock expirado
- Se `now() - started_at > ttl` e `status: active`:
  1. Humano (ou IA com permissão de governança) marca como `expired`.
  2. Verifica se IA original está viva (sessão ainda aberta?).
     - **Viva:** estender TTL adicionando 4h ao `started_at` ou abrir novo lock; deixar antigo `released`.
     - **Não viva:** marcar `abandoned` + mover para §4.

### 6.3 Force-release (emergência)
- **Apenas humano** pode forçar release de lock que não é dele.
- Procedimento:
  1. Editar linha em §3.
  2. Mudar `status: abandoned`.
  3. Adicionar `notes: "force-release by <humano> at <ISO> — razão: <…>"`.
  4. Mover para §4.
- **Nunca:** IA força-release de lock de outra IA. Sempre humano.

---

## 7. Skills relacionadas (existentes)

| Skill | Como interage |
|---|---|
| `SKILL_LOCK_HUB` (Bloco 41, planejada) | Wrapper formal para adquirir/liberar/estender. **Ainda não criada.** No MVP, lock é manual ou via instrução da IA executora. |
| Todas Cat. 3/4 (Execution) | **Exigem** lock ativo no HUB-alvo antes da Fase 8 |
| Todas Cat. 1 (Research) | Lock **opcional** (read-only não conflita) — mas para BENCHMARK/AUDIT do mesmo HUB, lock simbólico evita 2 paralelos consumindo orçamento de Web/PT |
| Todas Cat. 2 (Proposal) | Lock **leve** (proposta não conflita com execução de outra skill, mas evita 2 propostas paralelas para mesmo origin_id) |
| `SKILL_HANDOFF_MVP` (Bloco 41 MVP) | Referencia lock liberado no campo `LOCK STATUS` do handoff |
| `SKILL_DOC_REFRESH` | Lock leve em `cross` durante atualização do OVERVIEW |

---

## 8. Como funciona durante a sprint piloto

**SPRINT_01_MULTI_LOJA** (ticket: `MULTI_LOJA-S-001`, IA: `sonnet`):

```
Fase 3 LOCK ACQUIRE:
  Verifica §3 → nenhum lock ativo em multi_loja → prossegue
  Adiciona linha:
    | multi_loja | MULTI_LOJA-S-001 | sonnet | 2026-MM-DDTHH:MM:00-03:00 | PT4H | manual | active | piloto |

Fases 4-16: skill executa pipeline; humano valida gates #1 e #2.

Fase 17 LOCK RELEASE:
  Edita linha → status: released
  Move para §4 do histórico
  HUB multi_loja fica livre
```

---

## 9. Limitações conhecidas do MVP

| Limitação | Impacto | Mitigação MVP | Resolução planejada |
|---|---|---|---|
| Sem heartbeat automático | Lock fica `active` mesmo se IA cair | Humano marca `expired` após TTL | Bloco 38 (COWORK_PROTOCOL) — `SKILL_LOCK_HUB` com heartbeat |
| Sem distributed locks | 2 sessões simultâneas podem editar este arquivo em conflito git | Convenção: 1 humano coordena enquanto cowork não existe | Bloco 38 — lockfile pattern |
| Sem queue | IA bloqueada precisa esperar manualmente | Humano avisa quando libera | Bloco 38 — priority queue |
| Sem deadlock resolution | 2 IAs esperando lock cruzado podem travar | Convenção: humano sempre arbitra | Bloco 41 — `SKILL_LOCK_HUB` com timeout |
| Sem auditoria de tentativas bloqueadas | Não sabemos quantas vezes lock foi negado | EXECUTION_LOG.md registra `resultado: blocked` | Bloco 42 — telemetria |
| Manual de edição em arquivo .md | Risco de erro humano (typo, linha errada) | Convenção de revisão pareada para pré-piloto | Bloco 41 — `SKILL_LOCK_HUB` automatiza |

---

## 10. Quando este MVP é insuficiente

- **Quando 2+ IAs trabalharem cowork simultâneo** — MVP serializa por arquivo, mas conflito git em LOCKS.md vira problema.
- **Quando overnight rodar com > 1 task na noite** — sem heartbeat, tasks longas correm risco de lock expirar no meio.
- **Quando humano sair do projeto por > 4h** — sem alguém para marcar `expired`/`abandoned`, locks acumulam.

**Sinal de upgrade necessário:** > 5 locks `expired` por semana, ou 1 incidente de cowork collision.

---

## 11. Fonte da verdade

- **Locks ativos:** §3 deste arquivo.
- **Histórico:** §4 deste arquivo.
- **Procedimentos:** §5 (acquire), §6 (release).
- **Matriz de paralelismo (serial obrigatório):** [`docs/roadmaps/INDEX.md §4`](../roadmaps/INDEX.md).
- **Pipeline (Fases 3 e 17):** [`docs/execution/EXECUTION_ENGINE.md`](../execution/EXECUTION_ENGINE.md).
- **Skill que automatiza no futuro:** `SKILL_LOCK_HUB` (Bloco 41 — ainda não criada).

---

## 12. Versionamento

- **MVP-v1** (2026-05-27) — esta versão. Manual, documental.
- **MVP-v2 esperado pós-piloto** — adiciona campos de heartbeat real (após sprint piloto validar).
- **v2 completo (Bloco 38)** — lockfile pattern, retry, automação real.
- Mudança de schema → ADR.
