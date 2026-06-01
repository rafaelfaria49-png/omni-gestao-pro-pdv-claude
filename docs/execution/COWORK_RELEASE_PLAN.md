---
title: CoWork Release Plan — fechar os últimos gaps do Bootstrap
status: vivo
owner: produto + arquitetura (Opus)
last_update: 2026-06-01
escopo: auditar os 4 gargalos restantes (COWORK frozen · SKILL_LOCK_HUB · approval de skills · BENCHMARK_PROTOCOL), produzir o mapa de desbloqueio e o veredito de liberação do CoWork
depende_de:
  - docs/execution/BOOTSTRAP_COWORK_MATURITY.md
  - docs/execution/EXECUTION_ENGINE.md
  - docs/execution/SKILL_TAXONOMY.md
  - docs/execution/SAFE_GUARDS.md
  - docs/status/LOCKS.md
  - docs/status/APPROVAL_BATCH_V1.md
  - docs/execution/RETRO_PILOTO_R1.md
  - docs/decisions/ADR-0004-safe-lite-modo-padrao.md
---

# 🚦 CoWork Release Plan

> **Pergunta:** o que **exatamente** falta para o Bootstrap CoWork ser **operacional**?
>
> **Veredito (resumo):** o gargalo **não é mais documentação**. A governança do Bootstrap está
> **~98%**. A distância até "CoWork rodando" se resolve em **dois trilhos**:
> - **Piloto supervisionado** — destravável **com 1 decisão humana** (liberar COWORK / ADR-0005).
>   **Não exige nenhum build novo** (lock manual MVP + skills já aprovadas bastam).
> - **Autônomo/escalável** — exige **3 construções** (`SKILL_LOCK_HUB`, Approval Batch V2,
>   `BENCHMARK_PROTOCOL`), nenhuma delas no caminho crítico do **primeiro** CoWork.

---

## FASE A — Auditoria dos 4 gargalos

| Gargalo | Obrigatório? | Opcional? | Adiável? | Impede o CoWork? |
|---|---|---|---|---|
| **COWORK congelado** (decisão) | ✅ **SIM** — único bloqueio duro | — | ❌ não | ✅ **SIM** — sem liberar o modo, nada roda em CoWork |
| **`SKILL_LOCK_HUB`** (build) | só p/ **escala** (2+ IAs simultâneas) | ✅ p/ piloto (lock manual MVP já provou na S-001) | ✅ até 2ª/3ª execução | ⚠️ **parcial** — só impede CoWork **simultâneo** (git-conflict em `LOCKS.md`, LOCKS §10) |
| **Approval Batch de skills** | só p/ o **tipo de tarefa** escolhido | ✅ p/ piloto de *debt-item* (triad já aprovada) | ✅ por demanda | ❌ não p/ debt/test/stabilization; ⚠️ sim p/ feature/mock |
| **`BENCHMARK_PROTOCOL`** (build) | só p/ **feature nova** | ✅ p/ debt/bugfix/mock/test/audit | ✅ até o 1º ticket de feature | ❌ não p/ o primeiro CoWork (escolher debt-item) |

**Respostas diretas:**
1. **Obrigatório:** apenas a **decisão humana de liberar COWORK** (formalizada em **ADR-0005**).
2. **Opcional (para o piloto):** `SKILL_LOCK_HUB` e a maioria das aprovações de skill.
3. **Adiável:** `BENCHMARK_PROTOCOL`, `OVERNIGHT_PROTOCOL`, `ROLLBACK_PROTOCOL`, skills Composite.
4. **O que realmente impede o CoWork:**
   - **Piloto supervisionado:** *nada técnico* — só o **go/no-go** do humano.
   - **Autônomo simultâneo:** `SKILL_LOCK_HUB` (o conflito git em `LOCKS.md` com 2+ IAs é o
     único bloqueio **técnico** real — tudo o mais é decisão ou conveniência).

---

## FASE B — Mapa de desbloqueio

### Trilho 1 — Piloto CoWork **supervisionado** (mínimo viável; destravável já)

| Passo | Ação | Pré-req | Quem |
|---|---|---|---|
| **1** | **Liberar COWORK supervisionado** via **ADR-0005** (draft por `SKILL_PROPOSE_ADR`; humano aceita) | R0/R1 concluídos ✅ | humano decide |
| **2** | Escolher **1º ticket**: HUB maduro · *debt-item* **SAFE-lite-light** · **não-protegido** · com testes. Recomendado: **Multi-Loja → BL-08** (lint CI de `storeId`) ou *test-hardening*. **NÃO** F-04 (protegido), **NÃO** feature (exige benchmark) | INTAKE_PROTOCOL | humano + IA |
| **3** | **Lock manual** em `LOCKS.md §5` (MVP basta p/ 1 IA supervisionada) | LOCKS MVP ✅ | IA (CoWork) |
| **4** | Rodar pelo fluxo: `INTAKE → manifest → Gate #1 → SAFE-lite inline → Gate #2 → DOC_REFRESH → commit (humano clica)` | skill aprovada (DEBT_ITEM/TESTING) ✅ | CoWork + humano |
| **5** | **Retro do 1º run** (mini-R2): rastreabilidade, tempo/lock, colisões? → decidir escalar | ENTRY no log | humano + Opus |
| → | **✅ "CoWork operacional (supervisionado)"** | | |

### Trilho 2 — CoWork **autônomo / escalável** (rumo a 100%)

| Passo | Ação | Desbloqueia |
|---|---|---|
| **6** | Construir **`SKILL_LOCK_HUB`** (Cat. 6) — mecaniza acquire/release/extend + matriz + heartbeat; resolve git-conflict de `LOCKS.md` | CoWork **simultâneo** (2+ IAs) |
| **7** | **Approval Batch V2** — promover skills `draft` conforme o HUB-alvo (FASE C) | execução autônoma de mock/feature/audit |
| **8** | **`BENCHMARK_PROTOCOL`** (Bloco 36) — só quando entrar o 1º ticket de **feature** | `SKILL_EXEC_FEATURE_S/M` rodando FASE 5 |
| **9** | *(opcional)* `OVERNIGHT_PROTOCOL` + `SKILL_OVERNIGHT_BATCH` + `SKILL_ROLLBACK` | noites desassistidas |
| → | **✅ "CoWork operacional (autônomo/escalável)"** | |

---

## FASE C — Tabela consolidada de skills

> Estado real (catálogo `executoras/README.md §2` + `APPROVAL_BATCH_V1`). "Bloqueia semi-auto?"
> = se a **ausência de aprovação** impede um CoWork de executar **aquele tipo** de tarefa.

| Skill | Cat | Estado | Pronta? | Bloqueia semi-auto? | Ação recomendada |
|---|---|---|---|---|---|
| `SKILL_AUDIT_MULTI_LOJA` | 1 | ✅ approved | sim | — | usar |
| `SKILL_DOC_REFRESH` | 1 | ✅ approved | sim | — | usar |
| `SKILL_PROPOSE_SPRINT` | 2 | ✅ approved | sim | — | usar |
| `SKILL_PROPOSE_ADR` | 2 | ✅ approved | sim | — | usar (gera ADR-0005) |
| `SKILL_EXEC_DEBT_ITEM` | 3 | ✅ approved | sim | — | **driver do piloto** |
| `SKILL_EXEC_STABILIZATION` | 3 | ✅ approved | sim | — | rede de segurança |
| `SKILL_EXEC_TESTING` | 3 | ✅ approved | sim | — | **driver do piloto** (BL-08) |
| `SKILL_HANDOFF_MVP` | 6 | ✅ approved | sim (MVP) | — | usar (Fase 16) |
| `SKILL_EXEC_FIX_MOCK` | 3 | 🔄 draft | quase | ⚠️ só p/ tarefa **mock** | revisar+aprovar no Batch V2 (p/ BI/DT-11) |
| `SKILL_EXEC_FEATURE_S` | 3 | 🔄 draft | quase | ⚠️ só p/ **feature nova** | aprovar **junto** com BENCHMARK_PROTOCOL |
| `SKILL_PROPOSE_REFACTOR` | 2 | 🔄 draft | sim | ❌ não | aprovar por demanda |
| `SKILL_BENCHMARK_<HUB>` ×11 | 1 | 🔄 draft | sim | ⚠️ só p/ feature | aprovar com BENCHMARK_PROTOCOL |
| `SKILL_AUDIT_<HUB>` ×10 (não-multi-loja) | 1 | 🔄 draft | sim | ❌ não (read-only) | aprovar por demanda do HUB |
| `SKILL_LOCK_HUB` | 6 | ⛔ não criada | não | ⚠️ só p/ **simultâneo** | **construir (FASE D)** p/ escala |
| `SKILL_HANDOFF` (completo) | 6 | ⛔ não criada | não | ❌ não (MVP cobre) | pós-piloto |
| `SKILL_ROLLBACK` | 6 | ⛔ não criada | não | ❌ não (git revert manual) | pós-piloto |
| `SKILL_FULL_SPRINT` / `SKILL_OVERNIGHT_BATCH` | 5 | ⛔ não criada | não | ❌ não (Composite = escala) | Bloco 40, adiável |

**Leitura:** as **8 aprovadas** já cobrem o loop **debt-item/test/stabilization/audit-multiloja**
ponta a ponta. Nenhuma skill `draft` bloqueia o **piloto** se o 1º ticket for *debt/test*. Só
**feature** e **mock** dependem de promoção (Batch V2).

---

## FASE D — Design de `SKILL_LOCK_HUB` (sem implementar)

> Sistema é **doc-dirigido** (sem daemon). A skill **mecaniza o procedimento** de `LOCKS.md §5/§6`,
> não um serviço de runtime. Front matter v1 congelado (ADR-0002) → quando criada, segue o template.

**Função:** wrapper governado (Cat. 6 Governance) para **adquirir / liberar / estender / detectar-stale**
lock de HUB, substituindo a edição manual de `LOCKS.md`.

**Responsabilidades:**
1. **acquire** — valida §3 (lock ativo no HUB?) + matriz `roadmaps/INDEX §4` (par serial obrigatório com lock ativo?) → escreve linha `active` ou ABORT.
2. **release** — move linha §3 → §4 (histórico), `status: released`, calcula `duracao`.
3. **extend / heartbeat** — atualiza `heartbeat_at` por checkpoint; estende TTL.
4. **detect-stale** — `now - started_at > ttl` → marca `expired` (force-release continua **só humano**).

**Integração SAFE-lite:** hoje SAFE-lite trata lock como **opcional** (`§11.3`, operador único).
Sob COWORK, a skill torna o lock **obrigatório** antes da escrita (E-fase) — sem mudar o pipeline.

**Integração Engine:** é a automação das **Fase 3 (LOCK ACQUIRE)** e **Fase 17 (LOCK RELEASE)**.
Não cria fase nova; honra a matriz e o TTL já definidos em `SAFE_GUARDS §7`.

**Riscos:**
- **R1 — git-conflict em `LOCKS.md`** (2 IAs editando simultâneo): é **o** risco que o MVP não cobre. Mitigação v1: 1 commit atômico por operação de lock + retry com rebase; mitigação forte: lockfile/branch dedicado por HUB.
- **R2 — heartbeat fantasma** (IA caiu mas lock ativo): detect-stale + janela TTL.
- **R3 — force-release indevido por IA:** **proibido** — só humano (herda `LOCKS §6.3`).

**Implementação mínima (v1):** uma Cat-6 skill que executa as 4 operações acima **sobre o `LOCKS.md` atual** (sem novo schema), com a checagem de matriz automatizada e o `heartbeat_at` disciplinado por checkpoint. **Adia** distributed-lock/queue/deadlock (Bloco 38). Custo: baixo; desbloqueia CoWork simultâneo.

---

## FASE E — `BENCHMARK_PROTOCOL`

1. **É realmente necessário?** **Não para o Bootstrap nem para o piloto.** Necessário só para
   **execução de feature nova** (Engine FASE 5 dispara em feature/arquitetura/UX/fluxo/integração/módulo novo).
2. **Pode ser adiado?** **Sim** — até o **1º ticket de feature**. As 11 `SKILL_BENCHMARK_<HUB>` já
   existem (draft); falta só o **wrapper de orquestração**. Até lá, benchmark pode ser ad-hoc/manual.
3. **Quais HUBs dependem?** Os que vão **entregar feature nova** — sobretudo **Marketplace**
   (greenfield), **Marketing IA**, **WhatsApp massa**, **CRM 360**. **Não** depende quem só paga
   dívida/estabiliza/testa (PDV/Multi-Loja/Financeiro no modo manutenção).
4. **Impacto se não existir?** **Baixo** para o 1º CoWork (debt-item). **Médio** ao escalar para
   entrega de features: `SKILL_EXEC_FEATURE_S/M` não auto-rodam a FASE 5 e ficam `requires_approval`.

**Conclusão:** **adiar** para o Bloco 36, acionado pelo primeiro ticket de feature.

---

## FASE F — Veredito final

### 1. O Bootstrap está em quanto?
- **Governança / design do Bootstrap: ~98%.** Este plano fecha as specs de A–F. Os **2% restantes**
  de governança pura são o `BENCHMARK_PROTOCOL` — **adiável**.
- **Operacional supervisionado: destravável JÁ** (não é mais "%"): basta **1 decisão** (ADR-0005).
  Lock manual MVP + 8 skills aprovadas bastam.
- **Operacional autônomo/escalável: ~70%.** Faltam **3 builds** (`SKILL_LOCK_HUB`, Batch V2,
  `BENCHMARK_PROTOCOL`) — nenhum no caminho crítico do **primeiro** CoWork.

> **Honestidade (herdada da cláusula do ADR-0004):** **não** declaro 100%. COWORK **nunca rodou**
> e `SKILL_LOCK_HUB` não existe. Afirmar 100% repetiria o erro de "validar no papel". O número
> honesto é **98% de design**, com a operação **a 1 decisão** do primeiro piloto.

### 2. O que falta para considerar o CoWork **liberado**
1. **ADR-0005** — ratifica a liberação do COWORK (supervisionado primeiro).
2. **1º ticket** escolhido (debt/test, HUB maduro, não-protegido).
3. *(escala)* `SKILL_LOCK_HUB` + Approval Batch V2 + `BENCHMARK_PROTOCOL`.

### 3. Primeiro HUB recomendado: **Multi-Loja** 🥇
| Candidato | Veredito | Porquê |
|---|---|---|
| **Multi-Loja** | ✅ **recomendado** | Recém-reconciliado; **melhor rede de testes** (245 passing + guard estático); contexto profundo (5+ memórias); 1º ticket não-protegido disponível (**BL-08** lint `storeId` / test-hardening). **Evitar F-04** no 1º run (toca `lib/whatsapp` protegido). |
| **PDV** | ⚠️ não p/ 1º | Maduro, mas a dívida aberta (DT-01) é **server-core protegido**; DT-06 é fiscal. |
| **Financeiro** | ⚠️ não p/ 1º | Maduro, mas **dinheiro** → sempre SAFE-lite **reforçado** (barra mais alta p/ estreia). |
| **Marketplace** | ❌ proibido | Greenfield + cadeia `BL-12→BL-07→BL-03`; o INTAKE já o roteia p/ `RED`. |
| **Outro** | — | Um item *cross* de tooling/teste (ex.: o próprio BL-08) é aceitável como "Multi-Loja". |

---

## Plano final de liberação (ordenado)

```
[ HOJE ]
  P1. Humano aprova este plano (Gate #1)
  P2. SKILL_PROPOSE_ADR → draft ADR-0005 "Liberar COWORK supervisionado"  → humano aceita
  P3. Escolher 1º ticket: Multi-Loja · BL-08 (lint storeId CI) — SAFE-lite light, não-protegido
[ 1º RUN (supervisionado) ]
  P4. Lock manual (LOCKS.md §5) → INTAKE → manifest → Gate #1
  P5. SAFE-lite inline (SKILL_EXEC_TESTING/DEBT_ITEM) → Gate #2 → DOC_REFRESH → commit (humano)
  P6. Mini-retro do run → ENTRY no log
        └─►  ✅ CoWork operacional (SUPERVISIONADO)
[ ESCALA (quando o piloto provar) ]
  P7. Construir SKILL_LOCK_HUB (FASE D) — desbloqueia simultâneo
  P8. Approval Batch V2 (FIX_MOCK, FEATURE_S, AUDIT/BENCHMARK do HUB-alvo)
  P9. BENCHMARK_PROTOCOL (no 1º ticket de feature)
        └─►  ✅ CoWork operacional (AUTÔNOMO / ESCALÁVEL)
```

**Próximo passo único recomendado:** autorizar **P2** (draft do ADR-0005). Tudo a jusante decorre dele.

---

## Referências
- Maturidade base: [`BOOTSTRAP_COWORK_MATURITY.md`](./BOOTSTRAP_COWORK_MATURITY.md)
- Pipeline + SAFE-lite: [`EXECUTION_ENGINE.md`](./EXECUTION_ENGINE.md) (§3/§11/§17) · Limites: [`SAFE_GUARDS.md`](./SAFE_GUARDS.md) (§7)
- Lock MVP: [`LOCKS.md`](../status/LOCKS.md) (§8 piloto · §9/§10 limites) · Skills: [`SKILL_TAXONOMY.md`](./SKILL_TAXONOMY.md) · [`executoras/README.md`](../skills/executoras/README.md) · [`APPROVAL_BATCH_V1.md`](../status/APPROVAL_BATCH_V1.md)
- Modos: [`INDEX.md §3`](./INDEX.md) · Retro: [`RETRO_PILOTO_R1.md`](./RETRO_PILOTO_R1.md) (§7) · Modo padrão: [`ADR-0004`](../decisions/ADR-0004-safe-lite-modo-padrao.md)
- 1º ticket candidato: [`BLOCKERS.md`](../status/BLOCKERS.md) (BL-08) · [`DIVIDA_TECNICA.md`](../status/DIVIDA_TECNICA.md)
