---
title: PILOT_RUNBOOK_MULTI_LOJA — Cabine operacional única do piloto SPRINT_01_MULTI_LOJA
status: vivo (ativo durante o piloto)
owner: Rafael (dono do projeto) + Opus (arquiteto) + Sonnet (executor)
data_criacao: 2026-05-28
versao: v1
ticket_piloto: MULTI_LOJA-S-001
modo: SAFE / CONTROLLED
referencia_audit: docs/audits/AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md
referencia_engine: docs/execution/EXECUTION_ENGINE.md
referencia_gates: docs/execution/HUMAN_GATES.md
referencia_safeguards: docs/execution/SAFE_GUARDS.md
referencia_governance: docs/governance/GOVERNANCA.md
referencia_locks: docs/status/LOCKS.md
---

# PILOT_RUNBOOK_MULTI_LOJA · Cabine operacional única

> **Propósito.** Cabine única de execução do **SPRINT_01_MULTI_LOJA**. Aqui o operador humano + a IA executora encontram, no mesmo lugar, a sequência oficial, os gates, os locks, os comandos de aprovação e o protocolo de rollback. Tudo o que **não está aqui** (governança macro, pipeline completo, taxonomia de skills, áreas protegidas) é **referenciado**, não duplicado.
>
> Este documento é **operacional**, não-aspiracional. Se ler aqui e seguir, o piloto roda. Se sentir que falta algo, leia o link — não improvise.

---

## 0. Princípio absoluto

> **Humano clica. IA propõe.** Decisão fundadora #4. Nada de merge silencioso, nada de "vai dar certo", nada de iniciar Fase 10 sem Gate #1 aprovado por texto. Toda aprovação é **registrada em texto** no formato do §10 deste runbook, e replicada no `EXECUTION_LOG.md`.

---

## 1. Escopo do piloto

### 1.1 DENTRO (5 findings — escopo S confirmado pela auditoria)

| Finding | Local | Tipo de mudança | Risco |
|---|---|---|---|
| **F-01** | `lib/store-id-from-request.ts:25-32` (`storeIdFromAssistecRequestForRead`) | Trocar fallback `LEGACY_PRIMARY_STORE_ID` por `null` (alinhar com `For_Write`) | Médio — raiz arquitetural. Rotas que dependiam do fallback precisam tratar `null`. Por isso vem **junto** com F-02. |
| **F-02** | ~30 rotas com `\|\| "loja-1"` (lista canônica no §4 da auditoria) | Remover hardcode; rota retorna 400 se `storeId` ausente | Médio — pode quebrar UIs Lovable que não enviam header em algum fetch. Mitigação: ver §1.4 (Opção POC se necessário). |
| **F-05** (PARCIAL) | 5 rotas-piloto: `app/api/dashboard/{resumo,elite}`, `app/api/clients`, `app/api/ops/inventory`, `app/api/ops/sync-legacy-vendas` | Envolver em `apiGuardEnterpriseOrOps` + `canAccessStore` | Baixo — guard helper já existe. |
| **F-06** | `app/actions/whatsapp.ts` (`sendWhatsAppTextAction`, `sendWhatsAppTemplateAction`, `sendWhatsAppMediaAction`) | Adicionar `canAccessStore(session, storeId)` após `auth()` | Baixo — 3 actions, ~30 linhas. |
| **F-07** | `app/api/whatsapp/send-daily/route.ts:40-67` | `canAccessStore` antes de prosseguir | Baixo — 1 rota, ~10 linhas. |
| **F-14** (acompanha F-07) | `lib/whatsapp-daily-server.ts:6,38` | `storeId` obrigatório no service | Baixo — assinatura TS. |

**Total estimado:** ~35 arquivos · ~250-400 linhas de diff (dentro do limite S de 500 linhas).

### 1.2 FORA do piloto (sprints sucessoras)

| Finding | Por quê está fora |
|---|---|
| **F-03** (proxy.ts cookie typo) | Toca **área protegida** `proxy.ts` — exige flag `--with-protected-areas:proxy.ts` e gate humano por linha. Fica para **SPRINT_02_MULTI_LOJA** (1 commit cirúrgico isolado). |
| **F-04** (Webhook WhatsApp por env) | Exige **model novo** (`WhatsAppPhoneNumberMap`) + alteração em `prisma/schema.prisma` (área protegida) + ADR. Sprint M dedicada. |
| **F-08** (sync-legacy-financeiro write) | Rota legada com risco de regressão em fluxo de import; deixar para sprint própria de descomissionamento legacy. |
| **F-10** (auditoria de dados em produção) | Pré-requisito para **2ª loja real**, não para o piloto. Cobertura no §3 deste runbook (queries SQL read-only). |
| **F-09 / F-11 / F-12 / F-13 / F-15 / F-16** | P1/P2/P3, sem dinheiro/PII direto. Documentadas; backlog. |

### 1.3 Razão do recorte

A auditoria §10 marca **READY com 3 ressalvas**: (1) escopo fatiado, (2) `EXEC_TESTING` antes de tudo (já feito — ENTRY 005), (3) proxy.ts em sprint própria com flag. Este recorte respeita todas.

### 1.4 Modo de execução (Opção A atômica vs Opção B POC)

A decisão entre **A1+F2 atômico** (todas as ~30 rotas em 1 commit) ou **POC fatiado** (5 rotas piloto + helper dual-mode) está documentada no relatório A3 do orquestrador. O runbook trabalha com a recomendação ali registrada. Se Opção B for escolhida, o checklist da Fase 10 abaixo se desdobra em **dois ciclos** (POC → revalidação humana → bulk), cada um com seu Gate #2.

---

## 2. Sequência oficial do piloto

> Mapeada **um-para-um** ao pipeline de 17 fases do [`EXECUTION_ENGINE.md`](./EXECUTION_ENGINE.md). Skills referenciadas em `docs/skills/executoras/`.

```
[FEITO]  AUDIT_MULTI_LOJA_PRE_PILOTO_v01  →  baseline (ENTRY 004)
[FEITO]  EXEC_TESTING  baseline multi-loja  →  +5 testes (ENTRY 005 — aguardando commit)
            ↓
[1]   PROPOSE_SPRINT  →  docs/sprints/proposals/SPRINT_MULTI_LOJA-S-001.md
            ↓
[2]   ⛔ GATE #1  →  APPROVE_GATE_1 (humano, formato §10.1)
            ↓
[3]   LOCK ACQUIRE  →  docs/status/LOCKS.md (HUB=multi_loja, TTL=PT4H)
            ↓
[4]   PRE-IMPL TESTS  →  tsc + build + vitest (tudo verde antes de qualquer write)
            ↓
[5]   GIT SNAPSHOT  →  branch skill/MULTI_LOJA-S-001
            ↓
[6]   EXEC_DEBT_ITEM  →  implementa F-01 + F-02 + F-05(5) + F-06 + F-07 + F-14
        (sprint piloto: humano confirma a cada checkpoint — HUMAN_GATES §7)
            ↓
[7]   POST-IMPL TESTS  →  tsc + build + vitest (incluindo expected-fail → pass)
            ↓
[8]   AUDIT_MULTI_LOJA  pós-impl (escopo restrito ao diff)
            ↓
[9]   ⛔ GATE #2  →  APPROVE_GATE_2 (humano clica merge — formato §10.2)
            ↓
[10]  DOC_REFRESH  →  CURRENT_STATUS_OVERVIEW + DIVIDA_TECNICA + ROADMAP_MULTI_LOJA
            ↓
[11]  HANDOFF + EXECUTION_LOG  →  ENTRY 006 (proposta) + 007 (exec) + 008 (audit pós)
            ↓
[12]  LOCK RELEASE
```

### 2.1 Skills utilizadas (todas em APPROVAL_BATCH_V1 = `approved`)

| Skill | Fase | Quem aciona |
|---|---|---|
| [`SKILL_PROPOSE_SPRINT`](../skills/executoras/proposal/SKILL_PROPOSE_SPRINT.md) | [1] | Opus |
| [`SKILL_EXEC_TESTING`](../skills/executoras/execution/SKILL_EXEC_TESTING.md) | (pré — FEITO em ENTRY 005) | Opus |
| [`SKILL_EXEC_DEBT_ITEM`](../skills/executoras/execution/SKILL_EXEC_DEBT_ITEM.md) | [6] | Sonnet |
| [`SKILL_AUDIT_MULTI_LOJA`](../skills/executoras/research/SKILL_AUDIT_MULTI_LOJA.md) | [8] | Opus |
| [`SKILL_DOC_REFRESH`](../skills/executoras/research/SKILL_DOC_REFRESH.md) | [10] | Sonnet |
| [`SKILL_HANDOFF_MVP`](../skills/executoras/runtime/SKILL_HANDOFF_MVP.md) | [11] | Composer ou Sonnet |

---

## 3. PRÉ-FLIGHT obrigatório

> **Antes de digitar APPROVE_GATE_1, todos os itens abaixo precisam estar marcados.** A IA roda a parte automatizada; o humano roda a parte humana e confirma em texto.

### 3.1 Checklist humano (manual)

- [ ] Li este runbook completo (§§ 1, 2, 4, 6, 10, 11).
- [ ] Li o §10 (readiness) e o §6 (recomendações) da [`AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md`](../audits/AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md).
- [ ] Tenho acesso ao banco Supabase para rodar as queries SQL do §3.4 (read-only).
- [ ] Vou estar **presente ao vivo** durante a execução (piloto exige Gate por checkpoint — `HUMAN_GATES.md §7`).
- [ ] Confirmei que **nenhum outro lock** está ativo em `multi_loja` no [`LOCKS.md §3`](../status/LOCKS.md).
- [ ] Confirmei que `branch = main` está limpa antes de iniciar (`git status` mostra só itens **não relacionados** ao piloto — ou stash/commit deles antes).
- [ ] Confirmei que **não vou tocar `proxy.ts`, `auth.ts`, `prisma/schema.prisma`** nesta sprint (F-03 e F-04 estão FORA — §1.2).

### 3.2 Checklist IA (executora)

- [ ] Rodei `npx tsc --noEmit` → exit 0.
- [ ] Rodei `npm run test` → todos os arquivos passam (expected-fail incluídos).
- [ ] Li `docs/audits/AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md` §4 (findings F-01, F-02, F-05, F-06, F-07, F-14).
- [ ] Li [`SAFE_GUARDS.md §3`](./SAFE_GUARDS.md) (deny-list global) e confirmei que **nenhuma** mudança planejada toca `proxy.ts`, `auth.ts`, `prisma/schema.prisma`, `lib/financeiro/services/**/core*`, `lib/pdv*/core/**`.
- [ ] Confirmei que `allowed_paths` da skill `SKILL_EXEC_DEBT_ITEM` cobre todos os arquivos planejados — caso contrário, **paro e peço ajuste da skill antes**.
- [ ] Estimei diff: < 500 linhas (limite S). Se exceder → **PAUSE e renegociar**.
- [ ] Tenho a allow-list explícita (lista de paths) no draft de proposta antes de pedir Gate #1.

### 3.3 Validações automáticas obrigatórias (cada uma é bloqueante)

```bash
# Antes do Gate #1 (na Fase 4 — PRE-IMPL TESTS)
npx tsc --noEmit                          # exit 0
npm run build                             # exit 0 (toca rotas API)
npm run test                              # 148 passed | 14 expected fail

# Depois da implementação (na Fase 7 — POST-IMPL TESTS)
npx tsc --noEmit                          # exit 0
npm run build                             # exit 0
npm run test                              # ≥148 passed | ≤14 expected fail
                                          # idealmente: alguns expected-fail viram pass
```

> **Critério de sucesso da Fase 7:** os 3 expected-failing em `store-id-from-request.test.ts` (F-01) **DEVEM** virar pass; idem 1 expected-failing em `multi-loja-no-hardcoded-fallback.test.ts` (F-02).

### 3.4 Saneamento do banco (read-only — §A4 do orquestrador)

> **Modo:** read-only no Supabase SQL editor, antes de aprovar Gate #1.
> **Não-bloqueante para o piloto single-store** (loja-1 é a loja real). **Bloqueante para 2ª loja em produção.**
> **Documentação completa das queries:** ver relatório A4 entregue pelo orquestrador. Resumo aqui:

Para cada tabela operacional (`Cliente`, `Produto`, `Venda`, `OrdemServico`, `ContaReceberTitulo`, `ContaPagarTitulo`, `MovimentacaoFinanceira`, `CaixaOperacao`, `SessaoCaixa`, `PdvTerminal`, `WhatsAppContact`, `WhatsAppConversation`):

1. **COUNT por storeId** (incluindo NULL/'' — esperado: tudo em `loja-1`, zero em NULL).
2. **Orphan check** (`storeId NOT IN (SELECT id FROM "Store")` — esperado: 0).

**Critérios:**
- **GREEN** → 0 orphans, 0 NULL → segue para Gate #1.
- **AMBER** → ≤ 5 orphans/tabela → segue mas registra em `notes` da SPRINT_PROPOSAL.
- **RED** → > 5 orphans em qualquer tabela operacional → **abrir issue**, **não-bloqueante** para piloto (loja-1 ainda é tenant único), mas bloqueia 2ª loja.

---

## 4. Áreas protegidas — o que NÃO tocar

> **Referência canônica:** [`docs/governance/GOVERNANCA.md §4`](../governance/GOVERNANCA.md) + [`SAFE_GUARDS.md §3`](./SAFE_GUARDS.md).
>
> **Repito aqui o que é load-bearing para este piloto.**

| Path | Por quê NÃO tocar | Quando tocar (fora do piloto) |
|---|---|---|
| `proxy.ts` | Área protegida; F-03 fica para SPRINT_02 com flag `--with-protected-areas:proxy.ts` | Sprint dedicada, 1 linha, teste isolado |
| `auth.ts` / `auth.config.ts` | Gate de entrada; sprint piloto não mexe | Nunca sem ADR |
| `prisma/schema.prisma` | Schema = contrato de banco; F-04 (router WhatsApp) exige; piloto NÃO toca | SPRINT_NN_MULTI_LOJA dedicada com migration revisada |
| `prisma/migrations/**` | Migrações imutáveis | Apenas nova migration; nunca edição |
| `next.config.mjs` | Build/security headers | Nunca no piloto |
| `package.json` (deps) | Decisão de produto | Nunca no piloto |
| `tsconfig.json` (paths/excludes) | Quebra implícita de tudo | Nunca no piloto |
| `lib/financeiro/services/**/core*` | Core financeiro | Nunca no piloto |
| `lib/pdv*/core/**` | PDV core | Nunca no piloto |
| `.env*` | Segredos | Nunca |

**Tentativa de write em qualquer um destes paths sem flag** = ABORT + ROLLBACK automático pelo engine (Fase 10).

---

## 5. Locks

> **Referência:** [`docs/status/LOCKS.md`](../status/LOCKS.md).

### 5.1 Aquisição (Fase 3 do engine)

Antes do Gate #1, a IA executora adiciona linha em `LOCKS.md §3`:

```
| multi_loja | MULTI_LOJA-S-001 | sonnet | 2026-MM-DDTHH:MM:00-03:00 | PT4H | manual | active | piloto SPRINT_01_MULTI_LOJA |
```

### 5.2 TTL e heartbeat

- TTL padrão: **PT4H** (4 horas).
- Heartbeat: **manual** (MVP). Se a sessão durar > 3h, IA edita `heartbeat_at` para `now()`.
- Se TTL expirar sem release: humano marca `expired` e arbitra (estender ou `abandoned`).

### 5.3 Serialização

`multi_loja × qualquer HUB` é **fortemente recomendado serial** (LOCKS.md §5.3). Durante o piloto, nenhuma outra skill executora deve rodar em outros HUBs **simultaneamente** sem permissão explícita.

### 5.4 Liberação (Fase 17)

- Após Gate #2 + DOC_REFRESH + HANDOFF concluídos.
- Linha movida de §3 para §4 com `ended_at`, `duracao`, `status: released`.

---

## 6. Rollback — protocolo

### 6.1 Quando rollback é automático

Pelo engine ([`EXECUTION_ENGINE.md §4`](./EXECUTION_ENGINE.md)):

| Gatilho | Fase | Ação |
|---|---|---|
| Touch fora da allow-list | 10 | ROLLBACK + ABORT |
| Diff > 500 linhas | 10 | PAUSE (humano decide rollback ou divide) |
| Comando destrutivo (`rm -rf`, `git reset --hard`, `--no-verify`) | 10 | ABORT (sem rollback — recusa antes) |
| `tsc`/`build`/`test` vermelho na Fase 11 (2ª tentativa) | 11 | ROLLBACK automático |
| Auditoria pós-impl encontra **P0** | 12 | ROLLBACK + escalada humana |

### 6.2 Quando rollback é humano-acionado

- Humano rejeita no Gate #2 → emite `ROLLBACK_AUTHORIZE` (§10.4).
- Humano detecta P0 que a auditoria não pegou após o merge → emite `ROLLBACK_AUTHORIZE` com `pos_merge: true`.

### 6.3 Procedimento exato de rollback (branch ainda local, pré-merge)

```bash
# Estado: branch skill/MULTI_LOJA-S-001 com N commits, nada mergeado
git checkout main
git branch -D skill/MULTI_LOJA-S-001                   # destrói a branch local
# (Se a branch foi pushed para remoto:)
git push origin --delete skill/MULTI_LOJA-S-001        # SÓ se humano autorizar via ROLLBACK_AUTHORIZE
```

> **Nunca** `git reset --hard` em `main`. **Nunca** `--no-verify`. **Nunca** `--force` sem autorização explícita do humano.

### 6.4 Procedimento exato de rollback (pós-merge — emergência)

```bash
# Estado: merge já em main; bug crítico detectado
git revert <merge_hash> -m 1            # cria commit de revert (preserva história)
git push origin main                     # após APPROVE do humano
```

Atualizar `EXECUTION_LOG.md` com nova entrada `rollback: true` + `notes: "post-merge revert by Rafael, motivo: <…>"`.

### 6.5 O que sempre acompanha um rollback

1. Nova entrada no `EXECUTION_LOG.md` (resultado: `rollback`).
2. Lock liberado em `LOCKS.md`.
3. Findings que motivaram o rollback registrados em `docs/audits/AUDIT_<ticket>.md`.
4. Sprint marcada `rejected` ou `rollback` (não `encerrada`).

---

## 7. Validações pós-merge (Fase 14 — depois de Gate #2)

> Estas rodam **após o humano clicar merge**. Se alguma falhar → emitir `ROLLBACK_AUTHORIZE` imediatamente.

```bash
git checkout main && git pull
npx tsc --noEmit                         # exit 0
npm run build                            # exit 0
npm run test                             # ≥ 148 passed
                                         # expected-fail de F-01 (3) e F-02 (1) DEVEM ter virado pass
```

**Smoke check manual (humano):**

- [ ] Abrir `/dashboard/dashboard` — UI carrega.
- [ ] Abrir `/dashboard/financeiro-v2` — não dá 400.
- [ ] Abrir `/dashboard/vendas-hub` — listagem de vendas OK.
- [ ] Abrir `/dashboard/cadastros-v2` → lista de clientes — header sendo enviado, sem 400.
- [ ] Disparar 1 OS de teste; gerar receivable; ver que persiste em `loja-1`.
- [ ] Rodar `curl -s http://localhost:3000/api/dashboard/resumo` **sem** header — esperado: **400** (era 200 com dados de `loja-1`).

---

## 8. O QUE NÃO FAZER (lista negativa explícita)

- ❌ **NÃO** iniciar Fase 10 sem `APPROVE_GATE_1` registrado em texto.
- ❌ **NÃO** mergear sem `APPROVE_GATE_2` registrado em texto.
- ❌ **NÃO** tocar `proxy.ts`, `auth.ts`, `prisma/schema.prisma` (vão para SPRINT_02).
- ❌ **NÃO** rodar `git --no-verify`, `git reset --hard`, `git push --force`.
- ❌ **NÃO** corrigir bugs "fora do escopo" porque "estava ali do lado" — abrir nova issue.
- ❌ **NÃO** adicionar dependência nova (`package.json`) no piloto.
- ❌ **NÃO** rodar este piloto em modo `OVERNIGHT` (CLAUDE.md + HUMAN_GATES §7: sprint piloto = SAFE com confirmação por checkpoint).
- ❌ **NÃO** expandir a allow-list mid-execution sem rejeitar a sprint e re-propor.
- ❌ **NÃO** atualizar `CURRENT_STATUS_OVERVIEW.md` antes do Gate #2 aprovado (status reflete realidade — DT-03 só fecha após merge).
- ❌ **NÃO** apagar arquivos de teste (mesmo os com `expected-fail`) — eles viram pass com o fix.
- ❌ **NÃO** ignorar AMBER do §3.4 (saneamento de banco) — registrar em notes da sprint mesmo que não bloqueie.

---

## 9. Fluxo completo (checklist linear executável)

> O operador segue de cima para baixo. Cada item é **bloqueante** para o próximo.

### 9.1 Pré-execução

- [ ] §3.1 (humano) e §3.2 (IA) completos.
- [ ] §3.3 (testes pré-impl) verde.
- [ ] §3.4 (saneamento banco) GREEN ou AMBER documentado.
- [ ] Decisão Opção A vs B definida (relatório A3).
- [ ] Locks vazio em `multi_loja`.

### 9.2 PROPOSE_SPRINT

- [ ] Opus emite `SPRINT_MULTI_LOJA-S-001.md` em `docs/sprints/proposals/`.
- [ ] Proposta contém: escopo, DoD, allow-list explícita, plano por checkpoint, riscos, ADR sugerido (se aplicável), estimativa.
- [ ] Humano lê inteiro.

### 9.3 ⛔ GATE #1

- [ ] Humano emite `APPROVE_GATE_1` no formato §10.1.
- [ ] IA registra em `EXECUTION_LOG.md` (ENTRY 006 ou próxima).

### 9.4 LOCK + SNAPSHOT

- [ ] Linha adicionada em `LOCKS.md §3`.
- [ ] `git checkout -b skill/MULTI_LOJA-S-001`.
- [ ] Hash `HEAD` registrado no log.

### 9.5 IMPLEMENT (Fase 10 — por checkpoint)

> Sprint piloto: humano confirma **a cada checkpoint** (HUMAN_GATES §7). Sugestão de checkpoints:

- [ ] **CP1.** F-01 (helper retorna `null`). Rodar `tsc` — esperado: rotas chamadoras "quebram" em tipo. **Confirmar com humano antes de seguir.**
- [ ] **CP2.** F-02 nas rotas (remover `\|\| "loja-1"`; tratar `null` retornando 400). Rodar `npm run test` — expected-fail F-02 vira pass.
- [ ] **CP3.** F-05 (5 rotas) + F-06 + F-07 + F-14 (guard `canAccessStore`). Rodar `tsc + test`.
- [ ] **CP4.** Suite completa verde; expected-fail de F-01 e F-02 viraram pass.

### 9.6 POST-IMPL TESTS

- [ ] §3.3 (testes pós-impl) verde.

### 9.7 AUDIT pós-impl

- [ ] Opus aciona `SKILL_AUDIT_MULTI_LOJA` com escopo restrito ao diff.
- [ ] Documento: `docs/audits/AUDIT_MULTI_LOJA-S-001.md`.
- [ ] **Sem P0.** Se P0 → ROLLBACK automático (§6.1).
- [ ] P1 dinheiro/multi-loja → upgrade automático para P0 → ROLLBACK.

### 9.8 ⛔ GATE #2

- [ ] Humano lê: diff + AUDIT + testes.
- [ ] Humano emite `APPROVE_GATE_2` no formato §10.2.
- [ ] **Humano clica merge no PR/CLI.** Decisão fundadora #4.
- [ ] Validações pós-merge (§7) executadas.

### 9.9 DOC_REFRESH

- [ ] `docs/ai/CURRENT_STATUS_OVERVIEW.md` §5: DT-03 → resolvido (ou parcial).
- [ ] `docs/roadmaps/ROADMAP_MULTI_LOJA.md` §11: sprint encerrada + próxima sugerida (SPRINT_02 — F-03).
- [ ] `docs/status/DIVIDA_TECNICA.md`: DT-03 movido para §3 (pago) se F-01+F-02 fecharam.
- [ ] `docs/status/BLOCKERS.md`: BL-04/BL-08 reavaliados.
- [ ] `docs/status/RISCOS.md`: R-02 reavaliado.

### 9.10 HANDOFF + EXECUTION_LOG

- [ ] `docs/governance/SESSION_HANDOFF.md` atualizado.
- [ ] `docs/status/EXECUTION_LOG.md`: ENTRY de execução final.
- [ ] Lock liberado (`LOCKS.md`).

### 9.11 Sprint encerrada

- [ ] `docs/sprints/proposals/SPRINT_MULTI_LOJA-S-001.md` movido para `docs/sprints/SPRINT_MULTI_LOJA-S-001.md` (imutável).

---

## 10. Padrão de aprovação humana (formato oficial — §A6 do orquestrador)

> **Todos os comandos abaixo são emitidos pelo humano em texto, em chat com a IA.**
> **A IA, ao recebê-los, DEVE:** (a) ecoar em texto a confirmação no formato indicado, (b) registrar a aprovação em `EXECUTION_LOG.md` como nova ENTRY, (c) proceder à próxima fase.
> **Se algum campo obrigatório faltar:** IA pede confirmação explícita; nunca prossegue por inferência.

### 10.1 `APPROVE_GATE_1` — aprovação da proposta

**Quando:** após `PROPOSE_SPRINT` gerou `SPRINT_MULTI_LOJA-S-001.md`.
**Efeito:** libera Fase 8+ (PRE-IMPL TESTS, SNAPSHOT, IMPLEMENT).

```
APPROVE_GATE_1
ticket_id: MULTI_LOJA-S-001
approved_by: Rafael
approved_at: 2026-05-28T14:30:00-03:00
approval_notes: "Escopo S confirmado. Allow-list revisada. F-03/F-04 fora — SPRINT_02. Seguir."
allow_protected_areas: false              # OBRIGATÓRIO — true só se for tocar proxy.ts (não é o caso)
opcao_execucao: A                         # A=atomico_F01+F02 | B=POC_5_rotas (relatório A3)
```

**Campos obrigatórios:** `ticket_id`, `approved_by`, `approved_at`, `allow_protected_areas`, `opcao_execucao`.
**Opcionais:** `approval_notes`.
**A IA ao receber:** ecoa "GATE #1 aprovado por Rafael às 14:30 — opção A. Iniciando Fase 8 (PRE-IMPL TESTS)." e cria ENTRY no log.

### 10.2 `APPROVE_GATE_2` — aprovação do merge

**Quando:** após POST-IMPL TESTS verde + AUDIT sem P0.
**Efeito:** humano clica merge; IA roda Fases 14–17.

```
APPROVE_GATE_2
ticket_id: MULTI_LOJA-S-001
merge_approved_by: Rafael
merge_approved_at: 2026-05-28T17:15:00-03:00
merge_clicked_at: 2026-05-28T17:17:00-03:00
merge_notes: "Auditoria limpa (P0=0, P1=0, P2=1, P3=0). 4 expected-fail viraram pass. Smoke OK. Merge feito."
post_merge_validation: pending            # pending | green | red
```

**Campos obrigatórios:** `ticket_id`, `merge_approved_by`, `merge_approved_at`, `merge_clicked_at`.
**Opcionais:** `merge_notes`, `post_merge_validation` (atualizado depois do §7).
**A IA ao receber:** ecoa "GATE #2 aprovado. Iniciando Fase 14 (DOC_REFRESH). Aguardando validações pós-merge do §7." e cria ENTRY no log.

### 10.3 `APPROVE_EXECUTION` — confirmação mid-execution (checkpoint)

**Quando:** sprint piloto exige confirmação humana **por checkpoint** (HUMAN_GATES §7). Após cada CP do §9.5, humano emite.
**Efeito:** IA prossegue ao próximo checkpoint.

```
APPROVE_EXECUTION
ticket_id: MULTI_LOJA-S-001
checkpoint: CP2                            # CP1 | CP2 | CP3 | CP4
approved_by: Rafael
approved_at: 2026-05-28T15:45:00-03:00
notes: "Diff CP2: 12 arquivos, 187 linhas. Testes verdes. Seguir CP3."
```

**Campos obrigatórios:** `ticket_id`, `checkpoint`, `approved_by`, `approved_at`.
**Opcionais:** `notes`.
**A IA ao receber:** ecoa "CP2 aprovado. Iniciando CP3." e registra (cumulativo) no log.

### 10.4 `ROLLBACK_AUTHORIZE` — autorização de rollback emergencial

**Quando:** humano detectou problema (mid-execution, pré-merge ou pós-merge).
**Efeito:** IA executa §6.3 (pré-merge) ou §6.4 (pós-merge), libera lock, registra entry de rollback.

```
ROLLBACK_AUTHORIZE
ticket_id: MULTI_LOJA-S-001
authorized_by: Rafael
authorized_at: 2026-05-28T16:20:00-03:00
reason: "Detectei 400 inesperado no Lovable Cadastros HUB — fetch sem header em /api/clientes/[id]. Reverter."
phase: pre_merge                            # pre_merge | post_merge | mid_execution
post_merge: false                           # true → §6.4 (revert commit + push após APPROVE adicional)
preserve_branch: false                      # true → mantém branch para análise
```

**Campos obrigatórios:** `ticket_id`, `authorized_by`, `authorized_at`, `reason`, `phase`, `post_merge`.
**Opcionais:** `preserve_branch`.
**A IA ao receber:** ecoa "Rollback autorizado por Rafael. Executando §6.3. Lock será liberado. Findings consolidados em AUDIT_MULTI_LOJA-S-001.md." e cria ENTRY com `resultado: rollback`.

### 10.5 Convenções gerais

- **Timestamps** sempre ISO 8601 com timezone `-03:00`.
- **Sem aprovação verbal/implícita.** "Pode seguir" não vale — precisa do formato.
- **Edição inline na proposta** (HUMAN_GATES §5) é alternativa equivalente: humano adiciona `approved_by`/`approved_at` no front matter da SPRINT_<ticket>.md em vez de digitar `APPROVE_GATE_1`. Ambas as formas geram o mesmo registro no log.
- **A IA NUNCA inventa um APPROVE.** Se humano digitou ambíguo, IA pergunta.

---

## 11. Checklists consolidados

### 11.1 Checklist humano antes de Gate #1

- [ ] §3.1 (humano) marcado.
- [ ] §3.4 (banco) executado e classificado (GREEN/AMBER/RED).
- [ ] Decisão Opção A vs B tomada.
- [ ] Disponibilidade para acompanhar a execução por ~2-4h.
- [ ] Pronto para emitir `APPROVE_GATE_1` (§10.1).

### 11.2 Checklist IA antes da Fase 10 (write)

- [ ] §3.2 (IA) marcado.
- [ ] §3.3 (testes pré-impl) verde.
- [ ] Allow-list explícita no front matter da SPRINT_<ticket>.md.
- [ ] Lock adquirido em `LOCKS.md`.
- [ ] Branch `skill/MULTI_LOJA-S-001` criada.
- [ ] `APPROVE_GATE_1` registrado no `EXECUTION_LOG.md`.

### 11.3 Checklist pré-merge (Gate #2)

- [ ] §3.3 (testes pós-impl) verde.
- [ ] `AUDIT_MULTI_LOJA-S-001.md` publicado, P0=0.
- [ ] Diff dentro de 500 linhas; sem touch em deny-list.
- [ ] Documentação local (proposta) reflete o estado real.
- [ ] Humano leu o diff completo, AUDIT, BENCHMARK (se houve).
- [ ] Pronto para emitir `APPROVE_GATE_2` (§10.2) + clicar merge.

### 11.4 Checklist rollback (caso necessário)

- [ ] `ROLLBACK_AUTHORIZE` emitido (§10.4).
- [ ] §6.3 (pré-merge) ou §6.4 (pós-merge) executado.
- [ ] Lock liberado (`LOCKS.md`).
- [ ] ENTRY de rollback criada no `EXECUTION_LOG.md` (`resultado: rollback`).
- [ ] Sprint marcada `rejected` ou `rollback` — **não** mover para `docs/sprints/`.
- [ ] Plano de retomada documentado (nova sprint? skill ajustada? fora do escopo?).

---

## 12. Referências (fonte canônica — não duplicadas aqui)

- **Pipeline:** [`docs/execution/EXECUTION_ENGINE.md`](./EXECUTION_ENGINE.md) (17 fases).
- **Gates:** [`docs/execution/HUMAN_GATES.md`](./HUMAN_GATES.md) (Gate #1, #2, regime piloto §7).
- **Safe-guards:** [`docs/execution/SAFE_GUARDS.md`](./SAFE_GUARDS.md) (allow-list, deny-list, limites).
- **Áreas protegidas:** [`docs/governance/GOVERNANCA.md`](../governance/GOVERNANCA.md).
- **Locks:** [`docs/status/LOCKS.md`](../status/LOCKS.md).
- **Auditoria baseline:** [`docs/audits/AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md`](../audits/AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md).
- **Log append-only:** [`docs/status/EXECUTION_LOG.md`](../status/EXECUTION_LOG.md).
- **Roadmap:** [`docs/roadmaps/ROADMAP_MULTI_LOJA.md`](../roadmaps/ROADMAP_MULTI_LOJA.md).
- **Status vivos:** [`docs/ai/CURRENT_STATUS_OVERVIEW.md`](../ai/CURRENT_STATUS_OVERVIEW.md), [`DIVIDA_TECNICA.md`](../status/DIVIDA_TECNICA.md), [`RISCOS.md`](../status/RISCOS.md), [`BLOCKERS.md`](../status/BLOCKERS.md).
- **Skills aprovadas:** [`docs/status/APPROVAL_BATCH_V1.md`](../status/APPROVAL_BATCH_V1.md).
- **Skill templates usadas:** [`SKILL_PROPOSE_SPRINT`](../skills/executoras/proposal/SKILL_PROPOSE_SPRINT.md), [`SKILL_EXEC_DEBT_ITEM`](../skills/executoras/execution/SKILL_EXEC_DEBT_ITEM.md), [`SKILL_AUDIT_MULTI_LOJA`](../skills/executoras/research/SKILL_AUDIT_MULTI_LOJA.md), [`SKILL_DOC_REFRESH`](../skills/executoras/research/SKILL_DOC_REFRESH.md), [`SKILL_HANDOFF_MVP`](../skills/executoras/runtime/SKILL_HANDOFF_MVP.md).

---

## 13. Encerramento do runbook

Após `Gate #2` aprovado + DOC_REFRESH + HANDOFF + LOCK RELEASE:

1. Mover este runbook para status `arquivado` (editar front matter `status: arquivado`).
2. Criar nova versão `PILOT_RUNBOOK_MULTI_LOJA_v02.md` para SPRINT_02 (F-03 cookie proxy).
3. Atualizar `INDEX.md` da pasta `docs/execution/` referenciando o arquivo arquivado.

> O runbook é **vivo** apenas durante a execução do piloto. Imutabilidade entra após encerramento.
