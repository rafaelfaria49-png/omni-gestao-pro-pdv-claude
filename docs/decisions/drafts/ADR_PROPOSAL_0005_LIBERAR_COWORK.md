---
title: ADR_PROPOSAL_0005 · Liberação controlada do modo COWORK (Fase 1 supervisionada)
status: proposta
data: 2026-06-01
autor: Opus (Claude Code)
revisores: [Rafael]
hub: governanca
tags: [runtime, cowork, execution-engine, governance, autonomy, lock]
superado_por: null
substitui: null
proposta_em: 2026-06-01T00:00:00-03:00
proposta_por: Opus (Claude Code) — draft manual a pedido do humano
promovido_em: null
promovido_para: docs/decisions/ADR-0005-liberar-cowork-controlado.md
aprovado_por: null
related_findings: []
related_blockers: [BL-08]
ticket_id: ADR-PROP-0005
needs_strong_human_approval: true
---

> 🟡 **DRAFT — aguardando decisão humana.** Este é o **draft** do ADR-0005, gerado em modo
> docs-only. **Não vigente.** Se aceito, o humano: (1) muda `status: proposta → aceita`;
> (2) renomeia/move para [`docs/decisions/ADR-0005-liberar-cowork-controlado.md`];
> (3) adiciona linha no `decisions/INDEX.md §3`; (4) faz o DOC_REFRESH de `execution/INDEX §3`
> (modo COWORK → liberado Fase 1). **Nenhuma dessas etapas foi feita** (escopo deste lote = só o draft).
> Ver checklist de promoção no fim (§14).

---

# ADR-0005 · Liberação controlada do modo COWORK (Fase 1 supervisionada)

> **Status:** proposta (draft)
> **Decisão em uma frase:** liberar o modo **COWORK** em uma **Fase 1 controlada e supervisionada**
> — **um** executor CoWork por vez, **serial**, com **lock manual obrigatório**, **somente skills já
> aprovadas**, **zero área protegida**, preservando integralmente Gate #1, Gate #2 e DOC_REFRESH —
> mantendo **congelados** o paralelismo real (2+ IAs simultâneas), o OVERNIGHT e a execução de
> feature/greenfield.

---

## 1. Contexto

O Bootstrap CoWork está em **~98%** de design (ver [`COWORK_RELEASE_PLAN.md`](../../execution/COWORK_RELEASE_PLAN.md)
e [`BOOTSTRAP_COWORK_MATURITY.md`](../../execution/BOOTSTRAP_COWORK_MATURITY.md)). R0 e R1 estão
concluídos. O **único gargalo obrigatório** restante é **a decisão humana de liberar o modo COWORK**
— hoje congelado desde a fundação do Engine ([`execution/INDEX §3`](../../execution/INDEX.md);
[`RETRO_PILOTO_R1 §7`](../../execution/RETRO_PILOTO_R1.md)).

**Estado atual relevante:**
- `CURRENT_STATUS_OVERVIEW` (2026-06-01): roteamento de intake maduro; multi-loja reconciliado (DT-13/14/15/16); apenas modo SAFE liberado.
- `LOCKS.md` (MVP-v1): lock **manual documental** — já **carregou a sprint piloto S-001** sem incidente.
- `APPROVAL_BATCH_V1`: **8 skills aprovadas** cobrem o loop debt-item/test/stabilization/audit-multiloja ponta a ponta.

### 1.1 Por que liberar COWORK (o caso a favor)
- **O gargalo virou decisão, não engenharia.** Tudo o que era doc-fixável foi fechado; o pipeline, os gates, os safe-guards, o roteador de intake e o lock MVP existem e foram exercitados.
- **A operação real já roda leve (SAFE-lite).** Liberar COWORK supervisionado apenas dá **identidade e ritual legítimos** ao agente que executa o pipeline — formaliza o que a prática pede.
- **Sem validação de campo, o Bootstrap nunca sai de 98%.** Um piloto supervisionado é a única forma honesta de provar o loop end-to-end e destravar o caminho para escala.
- **Risco contível.** Em Fase 1 supervisionada + serial + lock + skills aprovadas + zero área protegida, o *blast radius* é mínimo e cada merge ainda passa por humano (decisão fundadora #4).

### 1.2 Por que NÃO liberar (o caso contra — honesto)
- **COWORK nunca rodou end-to-end.** Liberar um modo não-exercitado carrega incerteza operacional real (mesma cláusula de honestidade do ADR-0004).
- **`SKILL_LOCK_HUB` não existe.** Paralelismo real (2+ IAs) sofre risco de **git-conflict em `LOCKS.md`** (`LOCKS §10`) — sem mecanização, simultaneidade é frágil.
- **Tentação de escopo.** "CoWork liberado" pode ser lido como licença para feature/overnight/autonomia desassistida — exatamente o que **não** se quer agora.
- **Custo de supervisão.** Um piloto supervisionado consome tempo humano (gates ao vivo), sem ganho de throughput imediato.

> A decisão abaixo é desenhada para **capturar 1.1 sem incorrer em 1.2** — daí a forma "Fase 1 controlada".

---

## 2. Decisão

**Liberar o modo COWORK em uma Fase 1 controlada e supervisionada.** O executor de identidade
`cowork` passa a poder rodar o pipeline governado (SAFE-lite inline ou Engine), **um HUB por vez,
serial, com humano presente**, sob as regras operacionais do §5.

### 2.1 COWORK Fase 1 — o que **PODE** fazer
- Rodar o fluxo completo `INTAKE_PROTOCOL → Intake Manifest → Gate #1 → SAFE-lite inline → Gate #2 → DOC_REFRESH → commit (humano clica)`.
- Executar **skills aprovadas** (§5.1) sobre **debt-item / estabilização / testes / auditoria / proposta / doc-refresh**.
- Operar em **1 HUB por vez** (serial), com **lock manual** registrado em `LOCKS.md`.
- Atuar em **HUB maduro, item não-protegido, tamanho S/cirúrgico**.

### 2.2 COWORK Fase 1 — o que **NÃO** pode fazer
- ❌ Rodar **2+ execuções simultâneas** (paralelismo real) — congelado até `SKILL_LOCK_HUB` (Fase 2).
- ❌ Rodar **desassistido / OVERNIGHT** — humano presente é condição.
- ❌ Tocar **qualquer área protegida** (deny-list `SAFE_GUARDS §3` + `GOVERNANCA §4`); flag `--with-protected-areas` **proibida** em COWORK (espelha a regra de OVERNIGHT).
- ❌ Executar **feature nova / greenfield / mudança arquitetural** (exige benchmark + skills draft).
- ❌ **Mergear/commitar sem Gate #2** humano (decisão fundadora #4 intacta).
- ❌ Promover skills, criar ADR aceito, ou alterar schema de log/skill (ADR-0002 intacto).

### 2.3 Escopo fechado (o que esta decisão NÃO inclui)
- **NÃO** libera OVERNIGHT, Composite (`FULL_SPRINT`/`OVERNIGHT_BATCH`), nem paralelismo simultâneo.
- **NÃO** altera o pipeline de 17 fases, o SAFE-lite, os gates ou as deny-lists (seguem v1).
- **NÃO** promove nenhuma skill draft (isso é Approval Batch V2, decisão separada).
- **NÃO** constrói `SKILL_LOCK_HUB` nem `BENCHMARK_PROTOCOL` (builds de Fase 2).

---

## 3. Alternativas consideradas

| Alternativa | Prós | Contras | Por que (não) escolhida |
|---|---|---|---|
| **A) Manter COWORK congelado** | risco zero | Bootstrap travado em 98% para sempre; sem validação de campo | ❌ não resolve o gargalo; contraria o objetivo |
| **B) Liberar COWORK pleno (paralelo + autônomo)** | throughput máximo | depende de `SKILL_LOCK_HUB` inexistente; git-conflict em `LOCKS.md`; blast radius alto; modo nunca exercitado | ❌ inseguro — pula a validação |
| **C) Liberar COWORK Fase 1 controlada/supervisionada** (escolhida) | valida o loop com risco mínimo; sem build novo; reversível | ganho de throughput adiado; custo de supervisão | ✅ captura o benefício sem incorrer no risco de B |

---

## 4. Consequências

### 4.1 Positivas (benefícios)
- Destrava a **validação de campo** do Bootstrap (sai de "98% no papel").
- **Ritual legítimo** para o agente CoWork (fecha a lacuna que gerou a DP-01 no passado).
- Gera evidência real (ENTRY no log, retro) para decidir a **Fase 2** (paralelismo/escala).
- **Custo de build = zero** (usa lock MVP + skills já aprovadas).

### 4.2 Negativas / Custos
- Consome **tempo humano** de supervisão (gates ao vivo).
- Throughput **não** aumenta na Fase 1 (serial + supervisionado).
- Introduz um modo a manter/auditar.

### 4.3 Riscos introduzidos
→ Ver **Matriz de Riscos (§6)**. Resumo: o risco técnico real (git-conflict de lock) é **evitado por construção** (serial, 1 execução por vez); os demais são cobertos por gates + deny-list + kill-switch (§8).

### 4.4 O que muda imediatamente (na promoção)
- Arquivos a atualizar (pelo humano, **fora deste draft**): `decisions/INDEX.md §3` (+linha ADR-0005), `execution/INDEX.md §3` (COWORK → "Fase 1 liberada (supervisionada)"), opcional `CURRENT_STATUS_OVERVIEW §6`.
- Outras decisões afetadas: nenhuma revogada; complementa ADR-0004 (SAFE-lite) e a decisão fundadora #4.

### 4.5 O que muda no longo prazo
- Abre o caminho para **Fase 2** (paralelismo) condicionada a `SKILL_LOCK_HUB` + Approval Batch V2.
- Cria base empírica para eventual OVERNIGHT (Fase 3), ainda longe.

---

## 5. Regras operacionais da Fase 1

### 5.1 Skills — permitidas / bloqueadas / áreas proibidas

**✅ Permitidas em COWORK Fase 1 (as 8 aprovadas):**
`SKILL_EXEC_DEBT_ITEM` · `SKILL_EXEC_STABILIZATION` · `SKILL_EXEC_TESTING` ·
`SKILL_AUDIT_MULTI_LOJA` · `SKILL_DOC_REFRESH` · `SKILL_PROPOSE_SPRINT` · `SKILL_PROPOSE_ADR` ·
`SKILL_HANDOFF_MVP`.

**⛔ Bloqueadas na Fase 1 (até Approval Batch V2 / builds):**
- Draft de execução: `SKILL_EXEC_FIX_MOCK`, `SKILL_EXEC_FEATURE_S` (feature exige benchmark).
- Demais `SKILL_AUDIT_<HUB>` / `SKILL_BENCHMARK_<HUB>` draft, `SKILL_PROPOSE_REFACTOR` (por demanda).
- Não-criadas: `SKILL_LOCK_HUB`, `SKILL_HANDOFF` completo, `SKILL_ROLLBACK`, Composite.

**🚫 Áreas permanentemente proibidas (deny-list inalterada — `SAFE_GUARDS §3` + `GOVERNANCA §4`):**
`prisma/schema.prisma`, `prisma/migrations/**`, `auth.ts`, `auth.config.ts`, `proxy.ts`,
`lib/pdv*/core/**`, `lib/financeiro/services/**core*`, `lib/operacoes/services/**core*`,
`lib/whatsapp/**core*`, `lib/omni-agent/executores/**`, `.env*`, `next.config.mjs`,
`package.json` (deps), `tsconfig.json` (paths). **Sem exceção em COWORK** (flag protegida proibida).

### 5.2 Gates, lock e DOC_REFRESH — obrigatoriedade

| Controle | Obrigatório na Fase 1? | Por quê |
|---|---|---|
| **Lock manual** (`LOCKS.md §5`) | ✅ **SIM** | 1 lock/HUB; garante serialização e rastreabilidade sem `SKILL_LOCK_HUB` |
| **Gate #1** (aprovar roteamento/proposta antes de escrever) | ✅ **SIM** | inviolável (`HUMAN_GATES`); COWORK não relaxa |
| **Gate #2** (aprovar antes de merge/commit) | ✅ **SIM** | decisão fundadora #4 — humano sempre clica o merge |
| **DOC_REFRESH** (fechamento) | ✅ **SIM** | `EXECUTION_ENGINE §11.5`; combate doc-drift (lição do R0) |
| **ENTRY append-only** no `EXECUTION_LOG` | ✅ **SIM** | rastreabilidade da execução (Fase 16) |
| **Humano presente** | ✅ **SIM** | Fase 1 é supervisionada por definição |

---

## 6. Matriz de Riscos (Entregável B)

| # | Risco | Prob. | Impacto | Sev. | Mitigação | Gatilho de suspensão (§8) |
|---|---|---|---|---|---|---|
| RC-01 | git-conflict em `LOCKS.md` (2+ IAs) | Baixa | Alto | 🟡 | **Serial por construção** — 1 execução por vez na Fase 1 | 2+ colisões de lock |
| RC-02 | Skill toca fora da allow-list / área protegida | Baixa | Alto | 🟡 | deny-list mecânica (`SAFE_GUARDS §2/§3`) + ABORT/ROLLBACK | qualquer toque em área protegida |
| RC-03 | Merge sem Gate #2 | Muito baixa | Crítico | 🟡 | humano clica merge (founding #4); engine não mergeia | qualquer merge sem aprovação |
| RC-04 | Diff > 500 linhas / escopo estoura | Média | Médio | 🟡 | guard de 500 linhas → PAUSE + humano | estouro recorrente |
| RC-05 | Mock enganoso / dado fabricado | Baixa | Alto | 🟡 | princípio "real ou nada" (CLAUDE.md) + AUDIT | qualquer ocorrência |
| RC-06 | Regressão de teste publicada | Baixa | Alto | 🟡 | pre/post-tests obrigatórios (`tsc`/`build`/`vitest`) | regressão chega ao merge |
| RC-07 | Doc-drift pós-execução | Média | Médio | 🟢 | DOC_REFRESH obrigatório (§11.5) | drift reincidente |
| RC-08 | Escopo lido como "autonomia plena" | Média | Alto | 🟡 | §2.2/§2.3 explícitos; supervisão | execução desassistida detectada |
| RC-09 | Lock fantasma (IA cai, lock ativo) | Baixa | Baixo | 🟢 | TTL + humano marca `expired` (`LOCKS §6.2`) | locks expirados acumulando |

> **Severidade** = prob × impacto após mitigação. Nenhum risco **vermelho** residual na Fase 1
> controlada — o único de impacto crítico (RC-03) tem probabilidade muito baixa por design.

---

## 7. Critérios de sucesso (Entregável C)

Fase 1 é **bem-sucedida** quando, em **1 a 3 execuções supervisionadas**, todas verdadeiras:

1. **Loop completo** ≥ 1 vez: `INTAKE → Gate #1 → SAFE-lite → Gate #2 → DOC_REFRESH → commit` sem pular etapa.
2. **Zero** toque em área protegida; **zero** merge sem Gate #2.
3. **Testes verdes** (`tsc` + `vitest` + `build` quando aplicável) antes e depois.
4. **Rastreabilidade completa:** lock registrado em `LOCKS.md`, ENTRY append-only no log, DOC_REFRESH aplicado.
5. **Sem regressão** no HUB-alvo (auditoria pós-execução limpa: 0 P0/P1).
6. **Janela de observação:** as 3 primeiras execuções + 7 dias.

Atingidos os 6 → **habilita discutir a Fase 2** (paralelismo) via novo ADR.

---

## 8. Critérios de suspensão (kill-switch)

**Suspender COWORK imediatamente** (voltar a SAFE/congelado) se **qualquer** ocorrer:
- Toque em **área protegida** (RC-02) ou **merge sem Gate #2** (RC-03).
- **Mock enganoso / dado fabricado** (RC-05) ou **regressão publicada** (RC-06).
- **2+ colisões de lock** / git-conflict em `LOCKS.md` (RC-01).
- **Execução desassistida** não autorizada (RC-08).
- **Gut call** do humano ("não está pronto") — sempre vale (`HUMAN_GATES §3.4`).

**Procedimento:** humano declara suspensão → re-freeze do modo (reverter `execution/INDEX §3`) →
retro curta no `EXECUTION_LOG` (ENTRY) → correção antes de qualquer nova tentativa.

---

## 9. Critérios e plano de rollback (Entregável D)

COWORK é um **modo documental** + execuções governadas — o rollback é **barato e determinístico**:

| Camada | Como reverter | Custo |
|---|---|---|
| **Decisão (modo)** | Novo ADR (ou status `depreciada`) re-congelando; reverter nota de `execution/INDEX §3` | baixo (docs) |
| **Execução em curso** | `SKILL_ROLLBACK` futura **ou** `git revert`/`reset --hard <snapshot>` da branch da skill (`SAFE_GUARDS §8`) | baixo (supervisionado; nada mergeia sem Gate #2) |
| **Lock** | humano marca `released`/`abandoned` em `LOCKS.md §6` | trivial |
| **Docs do DOC_REFRESH** | reverter no mesmo commit/PR (não mergeado sem Gate #2) | baixo |

> **Por que é seguro:** em Fase 1 supervisionada, **nada chega a `main` sem Gate #2 humano**;
> logo "rollback" raramente significa desfazer código mergeado — quase sempre é descartar uma
> branch/working-tree antes do merge. O custo real é só re-congelar o modo (1 edição de doc).

---

## 10. Primeiro piloto recomendado

**HUB: Multi-Loja.** Primeiro ticket: **BL-08** (lint de `storeId` em CI) **ou** um item de
*test-hardening* — ambos SAFE-lite **light**, **não-protegidos**, aditivos.

**Justificativa:**
- **Melhor rede de segurança do projeto** — 245 testes passing + guard estático anti-`LEGACY_PRIMARY_STORE_ID` (DT-13/15/16); regressão é detectada na hora.
- **Contexto profundo e recente** (multi-loja acabou de ser reconciliado; 5+ memórias).
- **1º ticket não-protegido e de baixo blast radius:** BL-08 é tooling/CI (detectar query sem `where.storeId`), **não muda comportamento de produto**, usa skill aprovada (`SKILL_EXEC_TESTING`).
- **Evitar explicitamente F-04/DT-07** (webhook WhatsApp) no 1º run — toca `lib/whatsapp` (protegido) + env.
- **Por que não os outros:** PDV (dívida aberta DT-01 é server-core **protegido**); Financeiro (dinheiro → sempre SAFE-lite **reforçado**, barra mais alta para estreia); **Marketplace proibido** (greenfield → INTAKE roteia para `RED`).

---

## 11. Plano de implementação

> **Decisão é só decisão.** A execução do piloto vai para sprint própria, sob nova autorização.

- **Pré-requisitos:** este ADR **aceito** + 1º ticket escolhido (BL-08) + lock manual ativado.
- **Sprint sugerida:** `SPRINT_NN_MULTI_LOJA` (item BL-08), modo COWORK Fase 1.
- **Owner humano:** Rafael (gates #1 e #2).
- **Critério de pronto da implementação:** os 6 critérios de sucesso (§7).
- **Não-objetivo:** construir `SKILL_LOCK_HUB`/`BENCHMARK_PROTOCOL` (Fase 2, ADR futuro).

---

## 12. Recomendação final (Entregável E)

✅ **APROVAR COM RESTRIÇÕES.**

Liberar COWORK **apenas na Fase 1 controlada** definida no §2/§5: **um** executor por vez,
**serial**, **supervisionado**, **lock manual obrigatório**, **somente as 8 skills aprovadas**,
**zero área protegida**, **Gate #1 + Gate #2 + DOC_REFRESH inegociáveis**, com **kill-switch** (§8)
e **rollback** (§9) definidos. **Não** aprovar paralelismo, OVERNIGHT, feature/greenfield ou
relaxamento de deny-list — esses dependem de builds (`SKILL_LOCK_HUB`, Batch V2,
`BENCHMARK_PROTOCOL`) e de um **ADR de Fase 2** posterior, condicionado aos critérios de sucesso (§7).

> **Não** recomendo "aprovar pleno" (Alternativa B): o modo nunca rodou e `SKILL_LOCK_HUB` não
> existe. **Não** recomendo "não aprovar" (A): manteria o Bootstrap travado em 98% sem validação.

---

## 13. Referências

- Plano: [`COWORK_RELEASE_PLAN.md`](../../execution/COWORK_RELEASE_PLAN.md) · Maturidade: [`BOOTSTRAP_COWORK_MATURITY.md`](../../execution/BOOTSTRAP_COWORK_MATURITY.md)
- Pipeline/SAFE-lite: [`EXECUTION_ENGINE.md`](../../execution/EXECUTION_ENGINE.md) (§3/§11/§17) · Gates: [`HUMAN_GATES.md`](../../execution/HUMAN_GATES.md) · Limites: [`SAFE_GUARDS.md`](../../execution/SAFE_GUARDS.md) (§2/§3/§7/§8)
- Lock: [`LOCKS.md`](../../status/LOCKS.md) · Skills: [`SKILL_TAXONOMY.md`](../../execution/SKILL_TAXONOMY.md) · [`APPROVAL_BATCH_V1.md`](../../status/APPROVAL_BATCH_V1.md)
- ADRs relacionados: [`ADR-0004`](../ADR-0004-safe-lite-modo-padrao.md) (SAFE-lite) · [`ADR-0002`](../ADR-0002-skill-front-matter-v1.md) (front matter congelado) · [`ADR-0003`](../ADR-0003-eliminar-fallback-legacy-primary-store-id.md) (multi-loja)
- Retro: [`RETRO_PILOTO_R1.md`](../../execution/RETRO_PILOTO_R1.md) (§7 congelamento) · 1º ticket: [`BLOCKERS.md`](../../status/BLOCKERS.md) (BL-08)

---

## 14. Checklist de promoção (draft → aceito) — executar **só** após aprovação humana

- [ ] `status: proposta → aceita` + `aprovado_por: Rafael` + `promovido_em`.
- [ ] Renomear/mover para `docs/decisions/ADR-0005-liberar-cowork-controlado.md`.
- [ ] Adicionar linha em `decisions/INDEX.md §3` (e §6 Governança).
- [ ] DOC_REFRESH: `execution/INDEX §3` (COWORK → "Fase 1 liberada — supervisionada") + `CURRENT_STATUS_OVERVIEW §6`.
- [ ] ENTRY append-only no `EXECUTION_LOG` registrando a aceitação (como ENTRY 001/ADR-0002).
- [ ] **Nada acima foi feito neste lote** (escopo = só o draft).

---

## 15. Notas / discussão

- A forma "Fase 1 controlada" é deliberada: **captura o benefício (validação) sem o risco (paralelismo sem lock skill)**. É a mesma filosofia do ADR-0004 (reposicionar sem invalidar).
- "COWORK" aqui ≠ "vários robôs à noite". Significa: **um agente CoWork executando o pipeline governado, supervisionado, serial** — a menor unidade que ainda prova o loop.
- Honestidade (herdada do ADR-0004): este ADR **libera para validar**, não declara o modo "provado". A prova vem dos critérios de sucesso (§7).
