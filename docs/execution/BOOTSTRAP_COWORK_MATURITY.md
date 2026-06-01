---
title: Bootstrap CoWork — Maturidade do roteamento pós-INTAKE
status: vivo
owner: produto + arquitetura (Opus)
last_update: 2026-06-01
escopo: avaliar se um CoWork consegue operar semi-autônomo dentro da governança a partir de um comando livre ("Trabalhe no X") até o Gate #1 — e fechar os gaps doc-fixáveis
depende_de:
  - docs/execution/INTAKE_PROTOCOL.md
  - docs/execution/EXECUTION_ENGINE.md
  - docs/execution/HUMAN_GATES.md
  - docs/execution/SKILL_TAXONOMY.md
  - docs/execution/SAFE_GUARDS.md
  - docs/decisions/ADR-0004-safe-lite-modo-padrao.md
  - docs/execution/RETRO_PILOTO_R1.md
---

# 🧭 Bootstrap CoWork — Maturidade do roteamento pós-INTAKE

> **Pergunta:** dado o comando livre *"Trabalhe no Marketplace"*, o sistema descobre sozinho
> roadmap · status · skills · benchmark · SAFE-lite/Engine · backlog · critérios de pronto · e
> para no Gate #1?
>
> **Veredito honesto:** o **roteamento** (descobrir + classificar + parar) está **maduro** — o
> `INTAKE_PROTOCOL` já o especifica e a simulação abaixo o comprova. A **execução autônoma do
> CoWork** (o loop completo rodando *de fato* com múltiplas IAs) **não** está liberada — e isso
> é **decisão humana + build**, não um buraco de documentação.

---

## 1. Distinção que organiza tudo

Há **duas maturidades diferentes**, sistematicamente confundidas:

| Capacidade | O que é | Estado |
|---|---|---|
| **(A) Roteamento de intake** | "Trabalhe no X" → descobre tudo → emite manifest → **para no Gate #1** | 🟢 **maduro** (~95% após este lote) |
| **(B) Execução semi-autônoma CoWork** | múltiplas IAs executando blocos em paralelo, com lock, pós-Gate #1 | 🟠 **~60%** — congelado por decisão + builds pendentes |

O objetivo "diga 'Trabalhe no X' e o sistema sabe o que fazer **até o Gate #1**" é **(A)** — e
está praticamente pronto. O sonho maior "CoWork executa blocos quase sozinho" é **(B)** — e
depende de gates que **só o humano abre**.

---

## 2. Mapa do fluxo completo

```
   HUMANO: "Trabalhe no Marketplace"   (comando livre)
        │
        ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  PORTA DE ENTRADA  → INTAKE_PROTOCOL  (read-only, NÃO escreve) │
  │  [N] normaliza → [R] roadmap → [S] status → [C] classifica    │
  │  [M] modo (SAFE-lite/Engine) → [K] skill → [T] ticket → [O]    │
  └─────────────────────────────────────────────────────────────┘
        │  emite
        ▼
   📄 INTAKE MANIFEST  (roadmap · status 🟢🟡🔴 · size · modo · skill ·
                        backlog · DoD provisório · blockers · ticket)
        │
        ▼
   ⛔ GATE #1  (humano: aprova / ajusta / rejeita o roteamento)  ◀── intake TERMINA aqui
        │ "go"
        ├───────────────► PISTA SAFE-lite (inline): E1..E6 → ⛔ GATE #2 → DOC_REFRESH → commit
        │
        └───────────────► PISTA ENGINE (17 fases): PROPOSE_SPRINT → ⛔ GATE #1 formal →
                          BENCHMARK? → IMPLEMENT → AUDIT → ⛔ GATE #2 → DOC_REFRESH
```

**Onde o bootstrap começa:** a "porta de entrada" agora está **explicitamente cabeada** em
`docs/skills/INDEX.md` (índice de governança que o `CLAUDE.md` já manda ler) e em
`docs/execution/INDEX.md §1`. Antes, o `INTAKE_PROTOCOL` existia mas **não era apontado como a
primeira ação** para um comando livre — era preciso saber dele.

---

## 3. Scorecard de maturidade

> Cada dimensão do alvo ("o sistema descobre sozinho ___"), pontuada por evidência.

| # | O sistema descobre sozinho… | Onde está | Estado |
|---|---|---|---|
| 1 | **roadmap** correto | INTAKE §4 (`hub → ROADMAP_<HUB>.md`, mapa 1:1 em roadmaps/INDEX §6) | 🟢 |
| 2 | **status** atual (🟢🟡🔴) | INTAKE §5 (lê OVERVIEW + BLOCKERS + DIVIDA + RISCOS + ADRs) | 🟢 |
| 3 | **skills** necessárias | INTAKE §6 (tabela determinística, filtrada por `approved`) | 🟢 |
| 4 | **benchmark** necessário | INTAKE §7 árvore + manifest `benchmark_required` | 🟡 protocolo de benchmark ainda não escrito |
| 5 | **SAFE-lite ou Engine** | INTAKE §7 (árvore de 5 níveis, ADR-0004) | 🟢 |
| 6 | **backlog** | INTAKE §4 (`ROADMAP §7` canônico — reconciliação Tier A) | 🟢 |
| 7 | **critérios de pronto (DoD)** | INTAKE §4/§12 `definition_of_done` provisório | 🟢 **fechado neste lote** |
| 8 | **ponto de parada (Gate #1)** | INTAKE §10 (manifest = insumo do Gate #1 existente) | 🟢 |
| 9 | **porta de entrada** (saber que isso tudo começa no intake) | skills/INDEX + execution/INDEX §1 | 🟢 **fechado neste lote** |

**Roteamento de intake (A): ~95%.** O 5% residual é o benchmark (downstream) e o fato de o
roteador ser **doc-dirigido** (um agente lê e segue), não um *runtime* — o que é **deliberado**
(`SKILL_INTAKE_ROUTER` diferida; capability-gating, não identity-gating).

**Execução CoWork (B): ~60%.** Detalhado em §4-B.

---

## 4. Lacunas restantes — 3 baldes

### Balde A — doc-fixáveis (FECHADAS neste lote ✅)
| Gap | Fix aplicado |
|---|---|
| **DoD não viajava no manifest** (o alvo pede "critérios de pronto") | INTAKE §4/§12: campo `definition_of_done` provisório, derivado de `ROADMAP §8 Saída` + `§7`; versionamento §16 ajustado (aditivo = v1) |
| **Porta de entrada não cabeada** (intake existia mas não era a 1ª ação anunciada) | wire em `skills/INDEX` ("Comando livre de trabalho") + `execution/INDEX §1` ("Porta de entrada") |

### Balde B — decisões humanas + builds (NÃO doc-fixáveis — exigem aprovação/engenharia)
| Gap | Natureza | Bloqueia |
|---|---|---|
| **COWORK congelado** | decisão humana (Bloco 45 / pós-R1) | (B) inteiro — RETRO_PILOTO_R1 §7 mantém COWORK/OVERNIGHT congelados *após* o R1 |
| **`SKILL_LOCK_HUB` não construída** | build (Bloco 41) | serialização real entre IAs — hoje lock é manual em `LOCKS.md` |
| **24/32 skills em `draft`** | aprovação por batch | execução autônoma de feature/audit na maioria dos HUBs (só 8 `approved`) |
| **`BENCHMARK_PROTOCOL.md` ausente** | build (Bloco 36, congelado) | qualquer execução que o manifest marque `benchmark_required: true` |

### Balde C — greenfield (comportamento CORRETO, não é gap)
O Marketplace **não pode começar** por estar bloqueado por `BL-12 → BL-07 → BL-03` (ADR depósito
→ Estoque multi-depósito → ADR adapter). Um bootstrap **funcionando** detecta isso e **recusa**
auto-iniciar, devolvendo `RED` + caminho. Isso **é o sistema acertando**, não falhando.

---

## 5. Simulação completa — "Trabalhe no Marketplace"

Rodando o `INTAKE_PROTOCOL` à mão contra os arquivos reais (2026-06-01):

```yaml
intake_manifest:
  raw: "Trabalhe no Marketplace"
  resolved:
    hub: marketplace                       # [N] vocab roadmaps/INDEX §5 → resolve limpo
    item: { type: roadmap_phase, ref: "ROADMAP_MARKETPLACE §8 Fase 1 + §7 (item 1: ADR adapter)", confidence: 0.9 }
  reading_set:
    - ROADMAP_MARKETPLACE.md §5,§7,§8,§9,§14
    - CURRENT_STATUS_OVERVIEW §1   (Marketplace = 🔴 não iniciado / greenfield)
    - BLOCKERS.md (BL-03, BL-07, BL-12)  ·  decisions/INDEX (sem ADR Marketplace)
  state: RED                               # [S] greenfield + 3 blockers P0
  state_reason: "Greenfield: sem lib/marketplace*; ADR adapter (BL-03) ausente; depende de Estoque multi-depósito (BL-07←BL-12)"
  size: L                                  # [C] modelagem = L no §7
  definition_of_done:                      # ← NOVO (provisório)
    source: "ROADMAP_MARKETPLACE §8 Fase 1 (Saída) + §7 backlog item 1"
    provisional: true
    criteria: ["ADR do adapter unificado aprovada", "OAuth ML conectando + tela 'canais conectados' funcional"]
  protected_area: false                    # lib/marketplace* ainda não existe
  mode: ENGINE                             # [M] árvore §7 nível 2 (greenfield/>S)
  benchmark_required: true
  recommended_skill: SKILL_PROPOSE_ADR     # [K] greenfield → nenhuma EXEC; SKILL_EXEC_MARKETPLACE proibida
  requires_approval: false                 # PROPOSE_ADR está approved
  ticket_id_proposed: MARKETPLACE-L-001    # [T] mintado, não persistido
  lane: ENGINE
  gates_plan: { gate_1: "FASE 7 (ADR/proposta)", gate_2: "FASE 13 (merge)" }
  blockers: ["BL-03 ADR adapter", "BL-07 Estoque multi-depósito", "BL-12 ADR Depósito"]
  cowork: { lock_required: true, serial_conflict_with: ["estoque"], lock_state: free }   # COWORK congelado → só reporta
  next_action_human: "Greenfield bloqueado por BL-12→BL-07→BL-03. Caminho correto: abrir o ADR de Depósito (BL-12) e o ADR do adapter (BL-03) via SKILL_PROPOSE_ADR (draft, não publica). Aprova abrir o ADR?"
  confidence: 0.9
```

**Resultado:** `BLOCKED`. O sistema **descobriu tudo o que foi pedido** (roadmap, status, skill,
benchmark, modo, backlog, DoD) e **parou no lugar certo** com o caminho de desbloqueio. ✅ A
simulação valida o alvo da tarefa **sem escrever uma linha de código de produto**.

---

## 6. Precisamos de mais alguma peça? (decisão pedida)

| Candidato | Veredito | Porquê |
|---|---|---|
| **`SKILL_INTAKE_ROUTER`** | ❌ **ainda não** | Não há *runtime* que precise de um callable. O contrato `intake_request → intake_manifest` é estável e **model-agnostic**: qualquer agente que lê arquivos + emite o manifest roda o protocolo (capability-gating). Cria-se **quando** houver fila/orquestrador automático. |
| **Outro protocolo** | ❌ não para o bootstrap | O único referenciado-e-ausente é o `BENCHMARK_PROTOCOL.md` — mas é dependência **downstream de execução** (Bloco 36, congelado), não do intake. O intake apenas marca `benchmark_required` e roteia ao Engine. |
| **Outro documento** | ⚠️ **só wiring** | Não um doc novo de processo — apenas **cabear a porta de entrada** nos índices (feito neste lote). Recomenda-se ainda **1 linha no `CLAUDE.md`** (ver §8) — fora do escopo auto-aplicável. |
| **Este relatório** | ✅ criado | Base de decisão para abrir os gates do Balde B. |

---

## 7. O que falta para 100%

**Para (A) Roteamento — quase lá:**
1. `BENCHMARK_PROTOCOL.md` (Bloco 36) — para fechar a dimensão #4 ponta-a-ponta.
2. (opcional) 1 linha no `CLAUDE.md` apontando comando livre → INTAKE (hoje a cadeia já funciona
   via `CLAUDE.md → skills/INDEX → INTAKE`).

**Para (B) Execução CoWork — depende de humano:**
3. **Decisão de liberar COWORK** (hoje congelado pós-R1) — é o portão-mestre.
4. **`SKILL_LOCK_HUB`** mecanizada (lock + heartbeat server-side) — Bloco 41.
5. **Promover skills `draft → approved`** por batch, conforme o HUB que vai operar.
6. (greenfield) Pagar `BL-12 → BL-07 → BL-03` antes que **qualquer** rota inicie o Marketplace.

> Nenhum item de (B) é "documentação que faltou" — são **escolhas e engenharia**. O bootstrap de
> roteamento não os destranca sozinho **por design** (Gate humano + decisão fundadora #4).

---

## 8. Recomendação do próximo passo

**Curto (sem desbloquear nada novo):** ratificar este lote (porta de entrada + DoD no manifest) e
acrescentar a 1 linha no `CLAUDE.md` — o roteamento de intake fica **operacional de ponta a
ponta** para qualquer IA que abrir o projeto.

**Médio (próximo portão real):** decidir **se/quando liberar COWORK**. Se sim, o caminho mínimo é
`SKILL_LOCK_HUB` (Bloco 41) + um batch de aprovação de skills do 1º HUB-alvo. **Não** começar pelo
Marketplace (greenfield + cadeia de blockers) — começar por um HUB maduro com dívida conhecida
(ex.: PDV/Multi-loja), onde a pista SAFE-lite já é provada.

**Não recomendado agora:** criar `SKILL_INTAKE_ROUTER` ou novos protocolos — seria
overengineering antes de existir o runtime que os consuma.

> **Detalhamento operacional (2026-06-01):** o mapa de desbloqueio passo-a-passo, o design do
> `SKILL_LOCK_HUB`, a tabela consolidada de aprovação de skills e o veredito de liberação estão
> em [`COWORK_RELEASE_PLAN.md`](./COWORK_RELEASE_PLAN.md). Resumo: governança do bootstrap **~98%**;
> CoWork **supervisionado** destravável com **1 decisão** (ADR-0005), sem build novo; **autônomo**
> exige 3 builds (`SKILL_LOCK_HUB` · Approval Batch V2 · `BENCHMARK_PROTOCOL`).

---

## 9. Referências

- Roteador: [`INTAKE_PROTOCOL.md`](./INTAKE_PROTOCOL.md) (§4 DoD · §7 árvore de modo · §12 manifest · §16 versionamento)
- Pipeline + SAFE-lite: [`EXECUTION_ENGINE.md`](./EXECUTION_ENGINE.md) (§2 · §11)
- Gates: [`HUMAN_GATES.md`](./HUMAN_GATES.md) · Limites: [`SAFE_GUARDS.md`](./SAFE_GUARDS.md)
- Skills: [`SKILL_TAXONOMY.md`](./SKILL_TAXONOMY.md) · catálogo [`executoras/README.md`](../skills/executoras/README.md) · aprovação [`APPROVAL_BATCH_V1.md`](../status/APPROVAL_BATCH_V1.md)
- Modo padrão: [`ADR-0004`](../decisions/ADR-0004-safe-lite-modo-padrao.md) · Retro: [`RETRO_PILOTO_R1.md`](./RETRO_PILOTO_R1.md) (§7 congelamento COWORK)
- Caso greenfield: [`ROADMAP_MARKETPLACE.md`](../roadmaps/ROADMAP_MARKETPLACE.md) · [`BLOCKERS.md`](../status/BLOCKERS.md) (BL-03/07/12)
