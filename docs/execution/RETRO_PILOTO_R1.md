---
title: Retro do Piloto — R1
status: vivo (fase R1)
owner: Rafael (dono) + Opus (R1)
last_update: 2026-05-30
fase: R1 — Retro do Piloto
escopo: piloto do Execution Engine (ADR-0002 · APPROVAL_BATCH_V1 · AUDIT pré-piloto · S-001 · S-002) + R0
referencia_baseline: docs/audits/AUDITORIA_R0_RECONCILIACAO_GOVERNANCA.md
referencia_runbook: docs/execution/PILOT_RUNBOOK_MULTI_LOJA.md
referencia_log: docs/status/EXECUTION_LOG.md (ENTRY 001–010)
---

# 🔁 Retro do Piloto (R1)

> Retrospectiva honesta do primeiro ciclo real do Execution Engine. Não reescreve história
> (ENTRY do log e ADRs são imutáveis) — extrai lições e as converte em decisões de processo.
> Toda afirmação aponta para evidência rastreável (ENTRY NNN, commit, ou baseline R0).

---

## 1. O que foi o piloto

O "piloto" cobre três frentes encadeadas, todas registradas no `EXECUTION_LOG.md`:

| Data | Frente | Evidência |
|---|---|---|
| 2026-05-27 | Proposal Layer inaugurada (ADR-0002) + APPROVAL_BATCH_V1 (8 skills draft→approved) | ENTRY 001–003 |
| 2026-05-28 | AUDIT pré-piloto multi-loja (16 findings) + baseline de testes + RUNBOOK + PROPOSE_SPRINT | ENTRY 004–008 |
| 2026-05-29 | **S-001** executada pelo ritual completo (F-01/02/05/06/07/14) · commit `2e6e7d5` | ENTRY 009 |
| 2026-05-30 | **S-002** hotfix fora do ritual (F-03 + F-02-anchor) · commit `c615e7c` | ENTRY 010 |
| 2026-05-30 | **R0** — reconciliação da verdade (16 docs) | baseline R0 |

Em paralelo, a **operação real** seguiu em ritmo de produção enquanto a governança
"congelou" (ver baseline R0). Esse descasamento é o pano de fundo de toda lição abaixo.

---

## 2. O que funcionou ✅

| # | Acerto | Evidência |
|---|---|---|
| W1 | **O ritual de 17 fases é viável para sprint de risco.** S-001 (multi-loja, dinheiro) rodou CP1–CP4, dois gates, ADR-0003, testes 90\|14 → 189\|4. | ENTRY 009 |
| W2 | **Preview-antes-de-escrever pega drift antes do disco.** No R0, capturou financeiro-v2 "mock" desatualizado, resíduo de DT-03 e o typo de cookie. | baseline R0 (L1/L5) |
| W3 | **"Humano clica, IA propõe" se sustentou.** Zero merge/commit silencioso em todo o piloto — inclusive S-002 foi commit do próprio Rafael. | ENTRY 009/010 · Decisão fundadora #4 |
| W4 | **Disciplina de evidência.** Nenhum item mudou de status sem `file:line`+commit (financeiro-v2 só foi declarado real com 16 fetches comprovados; multi-loja **não** foi declarada 100% livre de loja-1). | baseline R0 · DT-02/DT-13 |
| W5 | **Testes "expected-failing" como red-flags vivos.** O contrato do bug ficou codificado e virou verde quando o fix entrou. | ENTRY 005/009 |
| W6 | **Reconciliação baseada em evidência funcionou.** O R0 encontrou e corrigiu drifts relevantes (Multi-Loja e Financeiro V2) **sem reescrever histórico** e **sem promover status sem prova**. | baseline R0 (L1–L5 · R0.6) |

---

## 3. O que falhou / doeu 🔴

| # | Falha | Evidência | Vira |
|---|---|---|---|
| F1 | **Doc-drift foi o maior risco real.** `financeiro-v2` documentado como "mock" por semanas após virar real; `CURRENT_STATUS` congelou enquanto produção andava. | baseline R0 · DT-02 | D3 (DOC_REFRESH) |
| F2 | **Ritual pesado não cabe no dia a dia.** Só **uma** sprint (S-001) rodou o pipeline completo; o resto da operação foi leve. COWORK/OVERNIGHT **nunca** rodaram. | ENTRY 009 vs operação real | D2 + D4 |
| F3 | **Hotfix fora do ritual.** S-002 sem proposta, sem ENTRY contemporânea, sem AUDIT, direto em `main`. | ENTRY 010 | D5 (DP-01) |
| F4 | **DOC_REFRESH não cobria contexto vivo.** No R0, depois de declarar o L5 "limpo", o R0.6 ainda achou drift em MASTER_CONTEXT, ENTERPRISE_MODULE_MAP e memória. Erro de método assumido. | baseline R0 (R0.6) | D3 (checklist ampliado) |
| F5 | **Tempo/lock não rastreados.** ENTRY 009 reconstruído; ENTRY 010 com `duration: null`; horas de lock = "—". | ENTRY 009/010 · LOCKS §4 | observação §7 |

---

## 4. Lições → ações (cada uma vira entregável do R1)

| Lição | Evidência | Ação | Entregável |
|---|---|---|---|
| **L-a** Ritual pesado para risco; fluxo leve para o dia a dia | W1 + F2 | Formalizar SAFE-lite **e** preservar o Engine | D2 + D4 |
| **L-b** Trabalho documental/governança é perfil de execução legítimo | R0 inteiro (docs-only com gates) | SAFE-lite §11.1 inclui **explicitamente "ajustes documentais/governança"** | D2 |
| **L-c** Doc-drift é o maior risco operacional | F1 + F4 | DOC_REFRESH como checklist obrigatório **cobrindo contexto vivo** | D3 |
| **L-d** Engine de 17 fases ficou subutilizado, mas provou-se válido | F2 + W1 | Reposicionar como **modo pesado reservado** (não deletar) | D4 (ADR-0004) |
| **L-e** Hotfix fora do ritual precisa de registro e de um ritual que o acolha | F3 | Registrar **DP-01**; SAFE-lite passa a acolher esse perfil | D5 + D2 |

---

## 5. Dívida de processo

### DP-01 — Execução fora do ritual (S-002)
- **O quê:** SPRINT_MULTI_LOJA-S-002 (F-03 cookie do proxy + F-02-anchor exportar) executada como **hotfix cirúrgico fora do pipeline de 17 fases** — sem PROPOSE_SPRINT, sem ENTRY contemporânea, sem SKILL_AUDIT pós, sem lock, commitada direto em `main`.
- **Evidência:** `EXECUTION_LOG.md` ENTRY 010 (commit `c615e7c`; tsc limpo · 217 passed \| 3 expected fail · build OK).
- **Impacto:** **baixo** — escopo fechado, áreas vetadas intocadas, testes verdes. O custo foi de **rastreabilidade** (início/duração reais desconhecidos), não de regressão.
- **Paga por:**
  1. **R0** — reconciliou os documentos que a S-002 deveria ter atualizado (ADR-0003, status vivos).
  2. **R1** — o **SAFE-lite** formaliza exatamente esse perfil de execução leve, tornando-o um **ritual legítimo** (deixa de ser "fora do ritual").
- **Status:** ✅ **paga.** Registrada **aqui** (não em `DIVIDA_TECNICA.md`, cujo escopo é dívida de código). Um **novo ENTRY append-only** no `EXECUTION_LOG` apontará para esta seção (R1-L4) — a ENTRY 010 **não** será editada (regra append-only).

---

## 6. Métricas honestas do piloto

- **Findings multi-loja:** 16 auditados (ENTRY 004) → S-001 fechou 6 (F-01/02/05/06/07/14) → S-002 fechou 2 (F-03 + F-02-anchor). **Abertos:** F-04, F-08, F-09, F-10, F-11+.
- **Testes:** 90 \| 14 (baseline) → 189 \| 4 (pós S-001) → 217 \| 3 (pós S-002).
- **R0:** 16 docs reconciliados · 0 itens promovidos sem evidência · **3 pendências reais mantidas explícitas** (DT-13 client-side · F-04 webhook · DRE/Fluxo = maturidade de UI).
- **Gates:** 100% das execuções que tocaram código tiveram aprovação humana registrada.

---

## 7. Observações fora de escopo (sinalizadas, NÃO acionadas no R1)

> Disciplina herdada do R0: "reconciliar, não repriorizar". Itens abaixo são **flags**, não tarefas deste lote.

- **Runbook não arquivado.** `PILOT_RUNBOOK_MULTI_LOJA §13` manda arquivá-lo pós-piloto; segue `status: vivo`. → candidato a DOC_REFRESH futuro.
- **ENTRY 009 com chaves YAML duplicadas** (append desorganizado). Não corrijo (append-only + fora de escopo).
- **COWORK / OVERNIGHT / Composite Skills / Blocos 36+** seguem **congelados** (estratégia "Servir a operação real").

---

## 8. Referências

- Baseline: `docs/audits/AUDITORIA_R0_RECONCILIACAO_GOVERNANCA.md`
- Runbook do piloto: `docs/execution/PILOT_RUNBOOK_MULTI_LOJA.md`
- Log append-only: `docs/status/EXECUTION_LOG.md` (ENTRY 001–010)
- Pipeline: `docs/execution/EXECUTION_ENGINE.md` (SAFE-lite entra na §11 — R1-L2)
- Decisão de reposicionamento: `docs/decisions/ADR-0004-*` (R1-L3)
- ADR multi-loja: `docs/decisions/ADR-0003-eliminar-fallback-legacy-primary-store-id.md`
