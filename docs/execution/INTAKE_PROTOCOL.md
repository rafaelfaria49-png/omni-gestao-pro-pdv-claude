---
title: Intake Protocol — roteamento determinístico de "Trabalhe no X"
status: vivo
owner: produto + arquitetura
last_update: 2026-06-01
versao: v1
depende_de:
  - docs/execution/EXECUTION_ENGINE.md      # FASE 1/2/4 + §11 SAFE-lite
  - docs/execution/HUMAN_GATES.md           # Gate #1 / Gate #2
  - docs/execution/SKILL_TAXONOMY.md        # seleção de skill
  - docs/execution/SAFE_GUARDS.md           # deny-list + limites mecânicos
  - docs/roadmaps/INDEX.md                  # vocabulário §5 + backlog §7 canônico
  - docs/decisions/ADR-0004-safe-lite-modo-padrao.md
escopo: dispatcher read-only pré-pipeline; não altera o Engine, o SAFE-lite ou os gates
---

# 🧭 Intake Protocol — roteamento de "Trabalhe no X"

> **Camada de entrada determinística** do Execution Engine. Recebe um comando livre
> (ex.: "Trabalhe no Marketplace") e produz um **Intake Manifest** read-only que vira o
> insumo do **Gate #1 já existente**.
>
> **É:** a `FASE 1 INTAKE` materializada para comando livre + a descoberta read-only da
> `FASE 2 PRE-FLIGHT` + a classificação da `FASE 4 SCOPE` + a escolha de modo do
> [`EXECUTION_ENGINE §11`](./EXECUTION_ENGINE.md) (ADR-0004).
>
> **NÃO é:** fase nova, gate novo, nem licença para executar. O roteador **escolhe a pista
> e para**. Quem executa é o fluxo escolhido (SAFE-lite inline ou Engine completo).

---

## 1. O que é (e o que NÃO é)

| É | NÃO é |
|---|---|
| Dispatcher **read-only** pré-pipeline | Uma 18ª fase |
| Materialização da `FASE 1` para comando livre | Um terceiro gate |
| Descoberta (roadmap + status) + classificação + escolha de modo | Executor de código |
| Emissor de um **Intake Manifest** (insumo do Gate #1) | Aprovador (quem aprova é humano — `HUMAN_GATES §8`) |
| Model-agnostic (contrato tipado estável) | Acoplado a um modelo específico |

**Princípio:** *roteia, não age.* Toda escrita acontece **depois** do Gate #1, dentro da pista
escolhida — nunca no intake.

---

## 2. Entradas aceitas

### 2.1 Forma livre (humano)
`"Trabalhe no Marketplace"` · `"Avance o PDV"` · `"Pague a DT-04"` · `"Resolva o BL-12"` ·
`"Audite o Financeiro"` · `"Suba cobertura de teste do multi-loja"`.

### 2.2 Forma estruturada (agente / fila futura)
```yaml
intake_request:
  raw: "Trabalhe no Marketplace"        # sempre preservado (rastreabilidade)
  hub: marketplace | null               # opcional; resolvido se ausente
  origin_type: roadmap_item | debt | blocker | risk | mock | audit_finding | free
  origin_id: DT-04 | BL-12 | R-07 | MOCK-03 | F-04 | null
  mode_hint: SAFE_LITE | ENGINE | null  # sugestão, não decisão
  size_hint: S | M | L | null
  flags: []                             # ex: ["--with-protected-areas:proxy.ts"]
  actor: { agent: opus|sonnet|cowork|future, human_present: true|false }
```

### 2.3 Normalização
- `raw → hub` pelo **vocabulário oficial** ([`roadmaps/INDEX §5`](../roadmaps/INDEX.md)).
- `raw → origin_id` pelos **IDs rastreáveis** dos status vivos (`DT-NN`, `BL-NN`, `R-NN`,
  `MOCK-NN`, `F-NN`).
- **Nunca adivinha:** se `raw` resolve para 0 ou >1 HUB/item, o manifest sai como
  `AMBIGUOUS` + **uma** pergunta de desambiguação. Sem chute.

---

## 3. Fluxo de descoberta

```
raw/struct ─▶ [N] Normalizar ─▶ [R] Roadmap ─▶ [S] Status ─▶ [C] Classificar
                                                                   │
                          ┌────────────────────────────────────────┤
                          ▼                                         ▼
                  [M] Escolher modo                        [K] Escolher skill/pista
                          │                                         │
                          └──────────────▶ [T] Mintar ticket ◀──────┘
                                                  │
                                                  ▼
                                       [O] Emitir Intake Manifest ─▶ ⛔ Gate #1
```

Cada passo é **uma leitura pura + uma derivação**. Nenhuma escrita em disco.

---

## 4. Localizar o roadmap (passo R)

- `hub` (slug) → **`docs/roadmaps/ROADMAP_<HUB>.md`** (mapa 1:1 em `roadmaps/INDEX §6`).
  Ex.: `marketplace → ROADMAP_MARKETPLACE.md`.
- Lê as seções que a `FASE 2 PRE-FLIGHT` exige: **§5 gaps · §6 funcionalidades futuras ·
  §7 backlog · §8 fases · §9 dependências · §14 blockers**.
- **Resolve o item de trabalho:**
  - Se `origin_id` veio → casa com a linha do roadmap/status.
  - Se veio livre → escolhe o **topo do §7 Backlog** (ou a próxima fase em §8) e o declara
    como **hipótese a confirmar no Gate #1** (`confidence` no manifest).

> **Canonização (ADR-0004 / decisão de governança 2026-06-01):** a fonte canônica de backlog
> de um HUB é **`ROADMAP_<HUB>.md §7`**. `docs/status/BACKLOG_<HUB>.md` é tratado como
> **alias histórico/opcional** — se não existir, o roteador **não falha**: usa §7.

---

## 5. Localizar o status (passo S)

Leitura paralela (espelha `FASE 2`):

| Fonte | Extrai |
|---|---|
| `docs/ai/CURRENT_STATUS_OVERVIEW.md §1` | maturidade do HUB + bloqueio crítico |
| `docs/status/BLOCKERS.md` | há `BL-NN` P0 aberto no HUB? (→ pode abortar) |
| `docs/status/DIVIDA_TECNICA.md` | `DT-NN` ativos do HUB |
| `docs/status/RISCOS.md` · `MOCKS_TRACKING.md` | riscos/mocks relacionados |
| `docs/decisions/INDEX.md` | ADRs do HUB; **ADR pendente que bloqueia?** |
| `docs/status/LOCKS.md` | lock ativo no HUB? (relevante em COWORK) |
| `memory/` | aprendizados persistentes do HUB |
| `GOVERNANCA §4` · `SAFE_GUARDS §3` | o item toca **área protegida**? |

### 5.1 Semáforo de prontidão (saída obrigatória)
| Estado | Significado | Exemplo |
|---|---|---|
| 🟢 **GREEN** | pode seguir | DT conhecido em HUB maduro |
| 🟡 **YELLOW** | segue com ressalva | dinheiro/multi-loja → SAFE-lite «reforçado» |
| 🔴 **RED** | aborta + diagnóstico | blocker P0 aberto, ADR ausente, greenfield |

---

## 6. Localizar as skills (passo K)

Resolução determinística ([`SKILL_TAXONOMY §1–§2`](./SKILL_TAXONOMY.md)), **filtrada por estado
aprovado** ([`APPROVAL_BATCH_V1`](../status/APPROVAL_BATCH_V1.md)):

| origin_type / intenção | Skill / pista | Categoria | Estado |
|---|---|---|---|
| `debt` (DT-NN) | `SKILL_EXEC_DEBT_ITEM` | 3 ExecS | ✅ approved |
| bug / estabilização | `SKILL_EXEC_STABILIZATION` | 3 | ✅ |
| testes | `SKILL_EXEC_TESTING` | 3 | ✅ |
| mock | `SKILL_EXEC_FIX_MOCK` | 3 | ⚠️ draft |
| feature S de backlog | `SKILL_EXEC_FEATURE_S` | 3 | ⚠️ draft (benchmark) |
| auditoria | `SKILL_AUDIT_<HUB>` | 1 Research | multi-loja ✅; resto draft |
| decisão arquitetural | `SKILL_PROPOSE_ADR` | 2 Proposal | ✅ |
| planejar sprint | `SKILL_PROPOSE_SPRINT` | 2 | ✅ |
| **greenfield / M+ / sem skill** | **nenhuma auto** → pista Engine + humano | — | — |

**Regras duras:**
- Só recomenda skill `approved` para execução autônoma.
- Skill `draft` → recomenda **com `requires_approval: true`** (humano promove antes).
- Skill inexistente para o tamanho (ex.: greenfield = L/XL) → **não inventa**: roteia para
  Proposal/ADR + flag humano. `SKILL_EXEC_MARKETPLACE` é **proibida** até a Fase 1 fechar
  (`SKILL_TAXONOMY §4`).

---

## 7. Escolher SAFE-lite ou Engine (passo M — árvore determinística)

Ordem de cima para baixo; **o primeiro match decide** ([`EXECUTION_ENGINE §11.1/§11.2`](./EXECUTION_ENGINE.md) + ADR-0004):

```
1. Toca área protegida (GOVERNANCA §4 / SAFE_GUARDS §3)?
      → ENGINE (+ flag --with-protected-areas, humano ao vivo)   [ou 🔴 se sem flag]
2. Greenfield (sem código em lib/<hub>*) OU tamanho > S?
      → ENGINE                                                   [Marketplace cai aqui]
3. Feature nova / arquitetura / fluxo novo / integração externa real?
      → ENGINE (+ FASE 5 BENCHMARK)
4. Risco dinheiro / fiscal / multi-loja (mas S e cirúrgico)?
      → SAFE-LITE «reforçado» (AUDIT focada mantida)             [perfil do DT-14]
5. Caso contrário (S + cirúrgico + sem área protegida)?
      → SAFE-LITE «light»                                        [perfil do DT-13/DT-15]
```

Os submodos `reforçado`/`light` nomeiam a prática real da operação; o manifest os declara
para o humano confirmar no Gate #1.

---

## 8. Abrir o ticket (passo T)

- **Formato** (`execution/INDEX §6.2`): `<HUB-SLUG>-<TAMANHO>-<NNN>` —
  ex.: `MARKETPLACE-L-001`, `MULTI_LOJA-S-016`.
- **`NNN`** = maior existente para aquele `HUB+TAMANHO` no `EXECUTION_LOG.md`, **+1**.
- **Read-only:** o roteador **minta (propõe)** o `ticket_id`; **não persiste**. O ticket só
  "nasce" no log **depois** do Gate #1 / execução (mantém `EXECUTION_LOG` append-only e nunca
  pré-escrito). Rejeitado no Gate #1 → o `NNN` simplesmente não é consumido.

---

## 9. Registrar a execução (passo O declara; escrita só pós-Gate)

O intake é **100% read-only** — **não grava ENTRY de intake** no `EXECUTION_LOG`
(decisão de governança: o log é exclusivo de execuções). O manifest apenas **pré-declara os
alvos de registro** para o humano saber onde os resultados cairão **antes** de aprovar:

| Quando | Onde | Quem escreve |
|---|---|---|
| Pós-Gate #2 | `EXECUTION_LOG.md` — ENTRY append-only (schema `SAFE_GUARDS §10`) | fluxo executor (FASE 16) |
| Pós-Gate #2 | DOC_REFRESH `§11.5` (CURRENT_STATUS_OVERVIEW · DIVIDA/MOCKS/RISCOS/BLOCKERS · ROADMAP §5/§7/§11) | executor (FASE 14) / `SKILL_DOC_REFRESH` |
| Condicional | ADR (`decisions/`) · memória (`memory/`) | FASE 15 |

---

## 10. Onde ocorre o Gate #1

O **Intake Manifest é o insumo do Gate #1** — o roteador **não cria gate** (`HUMAN_GATES §1`).

- **Pista SAFE-lite:** manifest → **Gate #1 inline** (humano aprova roteamento + plano **antes
  de escrever**) → executa E1–E6 → **Gate #2 inline** antes de commit.
- **Pista Engine:** manifest → humano dá "go" → `SKILL_PROPOSE_SPRINT` gera
  `SPRINT_<ticket>.md` → **Gate #1 formal (FASE 7)**, formato `approved_by/approved_at`
  (`HUMAN_GATES §5.1`).

O manifest entra como **preâmbulo** da proposta (Engine) ou é exibido **inline** logo antes do
Gate #1 (SAFE-lite). **Quem aprova e como não muda.**

---

## 11. Onde ocorre o Gate #2

Inalterado (`HUMAN_GATES §3`):
- **SAFE-lite:** Gate #2 inline **antes de commit/push**.
- **Engine:** Gate #2 na **FASE 13** (diff + AUDIT + testes verdes), `merge_approved_by/at`.
- Decisão fundadora #4 intacta: **humano sempre clica o merge.** O roteador apenas
  **pré-anuncia** no manifest qual Gate #2 se aplica e o que o humano verá.

---

## 12. Formato de saída — o Intake Manifest

Bloco único, determinístico, legível por humano e máquina:

```yaml
intake_manifest:
  raw: "Trabalhe no Marketplace"
  resolved:
    hub: marketplace
    item: { type: roadmap_phase, ref: "ROADMAP_MARKETPLACE §8 Fase 1", confidence: 0.9 }
  reading_set:                       # rastreabilidade do que foi lido
    - ROADMAP_MARKETPLACE.md §5,§7,§8,§9,§14
    - CURRENT_STATUS_OVERVIEW §1
    - BLOCKERS.md / DIVIDA_TECNICA.md / decisions/INDEX.md
  state: RED                         # GREEN | YELLOW | RED
  state_reason: "Greenfield: sem lib/marketplace*; ADR de adapter inexistente; Estoque multi-depósito pendente"
  size: L
  protected_area: false
  mode: ENGINE                       # SAFE_LITE(light|reforçado) | ENGINE
  benchmark_required: true
  recommended_skill: SKILL_PROPOSE_ADR   # nenhuma EXEC: greenfield
  requires_approval: false
  ticket_id_proposed: MARKETPLACE-L-001
  lane: ENGINE
  gates_plan: { gate_1: "FASE 7 (proposta/ADR)", gate_2: "FASE 13 (merge)" }
  registration_targets: [EXECUTION_LOG, ROADMAP_MARKETPLACE §11, decisions/INDEX]
  blockers: ["ADR adapter ausente", "Estoque multi-depósito (Estoque Fase 2)"]
  cowork: { lock_required: true, serial_conflict_with: ["estoque"], lock_state: free }
  next_action_human: "Greenfield bloqueado. Próximo passo correto: SKILL_PROPOSE_ADR (draft, não publica). Aprova abrir o ADR?"
  confidence: 0.9
```

**Variantes:**
- `READY` (🟢/🟡) — roteado, aguardando Gate #1.
- `BLOCKED` (🔴) — diagnóstico + caminho desbloqueador (ex.: Marketplace acima).
- `AMBIGUOUS` — `resolved` vazio/múltiplo + **uma** pergunta de desambiguação.

---

## 13. Compatibilidade com a máquina de execução

### 13.1 `EXECUTION_ENGINE`
- O protocolo é **upstream da FASE 1**: pré-computa as partes read-only da FASE 2
  (descoberta), FASE 4 (scope) e a escolha de modo do §11.
- **Não adiciona, remove ou reordena** nenhuma das 17 fases. Pipeline v1 preservado (`§9`).
- A saída pluga na FASE 6/7 (Engine) ou no fluxo inline (SAFE-lite).

### 13.2 SAFE-lite
- O protocolo **seleciona** SAFE-lite (light/reforçado) via árvore §7 — não cria modo novo;
  reusa `§11.1/§11.2/§11.4/§11.5`.
- A própria escrita deste doc foi uma execução **SAFE-lite «light»** (dogfooding).

### 13.3 `HUMAN_GATES`
- **Nenhum gate novo.** O manifest termina no **Gate #1 existente** (`§2`).
- Intake read-only ⇒ não exige gate próprio. Triggers, formatos (`§5`), papéis (`§8`) e
  "humano sempre clica merge" (founding #4) ficam **idênticos**. O protocolo só **enriquece o
  que o humano vê** no Gate #1.

---

## 14. Compatibilidade com agentes

### 14.1 CoWork
**CoWork-aware, CoWork-inert.** O roteador já lê `LOCKS.md` + a **matriz de paralelismo**
(`roadmaps/INDEX §4`) e popula `cowork.{lock_required, serial_conflict_with, lock_state}`. Como
COWORK está **congelado** (`execution/INDEX §3`), hoje ele apenas **reporta** o lock; não
serializa. Quando COWORK for liberado (+ `SKILL_LOCK_HUB`), o mesmo campo passa a **bloquear**
pares "serial obrigatório" sem mudar o protocolo.

### 14.2 Opus
Roteamento é por **natureza do item**, não por modelo. Para `actor.agent = opus`, o roteador
prefere a **pista Engine** em itens M+/arquitetura/ADR (papel de arquiteto) e entrega o manifest
+ `reading_set` como contexto. Em itens S/cirúrgicos, Opus roda a mesma pista SAFE-lite. O
`actor` ajusta defaults/verbosidade — **nunca relaxa gate ou guard**.

### 14.3 Futuros agentes
- **Contrato tipado estável, reasoner trocável.** A superfície estável é
  `intake_request → intake_manifest` (§2.2 e §12). Qualquer agente que leia arquivos + emita o
  manifest roda o protocolo.
- **Capability-gating, não identity-gating:** quem aprova é **humano** (`HUMAN_GATES §8`); o
  agente é intercambiável. Agente novo herda safe-guards (`SAFE_GUARDS`), deny-list (`§3`) e
  gates automaticamente — sem caminho de bypass por ser "novo".

---

## 15. Anti-padrões

| ❌ | ✅ |
|---|---|
| Adivinhar o HUB de um comando ambíguo | Emitir `AMBIGUOUS` + 1 pergunta |
| Auto-executar greenfield (Marketplace) | `RED` + diagnóstico + `SKILL_PROPOSE_ADR` |
| Recomendar skill `draft` como se fosse executável | `requires_approval: true` |
| Inventar skill que não existe | Rotear para Proposal/ADR + humano |
| Gravar ENTRY de intake no `EXECUTION_LOG` | Intake é read-only; ENTRY só de execução |
| Criar um "Gate #0" | Terminar no Gate #1 existente |
| Pular a leitura de blockers/área protegida | Semáforo §5 obrigatório antes de rotear |

---

## 16. Versionamento e fonte da verdade

- **v1** (2026-06-01) — primeira versão. Mudança no schema do manifest (§12) ou no
  `intake_request` (§2.2) = bump para **v2** (v1 preservado), espelhando a disciplina do
  front matter de skills (ADR-0002).
- **Fonte da verdade:**
  - **Roteamento + manifest:** este arquivo.
  - **Pipeline:** [`EXECUTION_ENGINE.md`](./EXECUTION_ENGINE.md).
  - **Modo (SAFE-lite vs Engine):** [`ADR-0004`](../decisions/ADR-0004-safe-lite-modo-padrao.md) + `EXECUTION_ENGINE §11`.
  - **Gates:** [`HUMAN_GATES.md`](./HUMAN_GATES.md).
  - **Limites mecânicos:** [`SAFE_GUARDS.md`](./SAFE_GUARDS.md).
  - **Seleção de skill:** [`SKILL_TAXONOMY.md`](./SKILL_TAXONOMY.md).
  - **Vocabulário de HUB + backlog canônico (§7):** [`roadmaps/INDEX.md`](../roadmaps/INDEX.md).
