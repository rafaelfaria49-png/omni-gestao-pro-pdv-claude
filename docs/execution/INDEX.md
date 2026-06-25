---
title: Execução — Índice oficial do Execution Engine
status: vivo
owner: produto + arquitetura
last_update: 2026-05-30
versao: v1
---

# ⚙️ Execução — Índice oficial

> **Camada de execução semi-autônoma governada** do OmniGestão Pro.
> Sobreposta à camada de governança (`governance/`) e roadmaps (`roadmaps/`) — não substitui, **executa**.

> **Antes de qualquer skill rodar:** leitura obrigatória de [`docs/governance/GOVERNANCA.md`](../governance/GOVERNANCA.md) e [`docs/ai/CURRENT_STATUS_OVERVIEW.md`](../ai/CURRENT_STATUS_OVERVIEW.md).

---

## 1. O que é (e o que NÃO é)

**É:** sistema profissional para que IAs (Claude Code, Cowork, Opus, Sonnet, Composer) executem tarefas pequenas, governadas, auditáveis, com humano nos gates certos.

**NÃO é:** licença para IA refatorar tudo sozinha, criar features fora do roadmap, ou agir sem auditoria.

**Filosofia:** *execução semi-autônoma governada — pequena, incremental, serializada, rastreável.*

**Porta de entrada (comando livre).** Um pedido em linguagem natural — *"Trabalhe no X"*,
*"Avance o Y"*, *"Pague a DT-NN"* — entra pelo **[`INTAKE_PROTOCOL.md`](./INTAKE_PROTOCOL.md)**:
roteador **read-only** que descobre roadmap · status · skill · modo · backlog · **critérios de
pronto (DoD)**, emite o **Intake Manifest** e **para no Gate #1**. Ele **roteia e para** — quem
escreve é a pista escolhida (SAFE-lite inline ou Engine de 17 fases). Ver §2.

---

## 2. Documentos desta camada

| Bloco | Documento | Papel |
|---|---|---|
| 29 | [`EXECUTION_ENGINE.md`](./EXECUTION_ENGINE.md) | Pipeline oficial de 17 fases |
| 30 | [`SAFE_GUARDS.md`](./SAFE_GUARDS.md) + [`HUMAN_GATES.md`](./HUMAN_GATES.md) | Limites de segurança + gates obrigatórios |
| 31 | [`SKILL_TAXONOMY.md`](./SKILL_TAXONOMY.md) | 6 categorias + allow/deny-list + skills proibidas |
| pós-R1 | [`INTAKE_PROTOCOL.md`](./INTAKE_PROTOCOL.md) | Roteamento read-only de "Trabalhe no X" → Intake Manifest → Gate #1 (materializa a FASE 1; não altera pipeline/modos/gates) |
| pós-R1 | [`BOOTSTRAP_COWORK_MATURITY.md`](./BOOTSTRAP_COWORK_MATURITY.md) · [`COWORK_RELEASE_PLAN.md`](./COWORK_RELEASE_PLAN.md) | Maturidade do bootstrap (roteamento ~98%) + plano de liberação do CoWork (auditoria de gargalos · mapa de desbloqueio · design `SKILL_LOCK_HUB` · veredito) |
| 36 | `BENCHMARK_PROTOCOL.md` (a criar) | Pipeline de benchmark por sprint |
| 37 | `OVERNIGHT_PROTOCOL.md` (a criar) | Modo overnight |
| 38 | `COWORK_PROTOCOL.md` (a criar) | Modo multi-IA simultâneo |
| 39 | `ROLLBACK_PROTOCOL.md` (a criar) | Como desfazer |
| v2-b1 | [`EXECUTION_RULES.md`](./EXECUTION_RULES.md) | Regras de execução contínua de múltiplos GOALs — auto approval, gates, overnight, commit/push |
| v2-b2 | [`GOAL_TEMPLATE.md`](./GOAL_TEMPLATE.md) | Template oficial para qualquer GOAL individual — 20 campos + 3 exemplos (docs/impl/overnight) |

---

## 3. Os 4 modos operacionais

| Modo | Quem aciona | Característica chave | Permitido em |
|---|---|---|---|
| **SAFE** | Humano ao vivo | Pode tudo, gates humanos ativos | Qualquer HUB |
| **COWORK** | Múltiplas IAs simultâneas | 1 lock por HUB; matriz de paralelismo do `roadmaps/INDEX.md §4` honrada | HUBs sem dependência cruzada |
| **OVERNIGHT** | Cron / agendamento | Apenas skills S; sem áreas protegidas; sem ADR novo; fila pré-aprovada | HUBs em "verde" (sem blocker P0 aberto) |
| **AUDIT** | Humano ou agendamento | Read-only puro | Qualquer HUB |

> **Estado atual (2026-06-01):** apenas **SAFE** liberado. R0 (reconciliação) e R1 (retro do piloto) **concluídos** — a condição "congelado até R0/R1" foi satisfeita. A **liberação do COWORK** (supervisionado primeiro) está **pendente de decisão humana** → ver [`COWORK_RELEASE_PLAN.md`](./COWORK_RELEASE_PLAN.md) (formaliza em **ADR-0005**). **OVERNIGHT** segue não liberado (adiável). Piloto (Bloco 43) executado (SPRINT_MULTI_LOJA-S-001/S-002).

---

## 4. Decisões fundadoras (aprovadas 2026-05-27)

| # | Decisão | Valor |
|---|---|---|
| 1 | Tamanho máximo em overnight | **S apenas (≤4h)** |
| 2 | Aprovação da fila overnight | **Por noite** |
| 3 | Notificação overnight | **WhatsApp + log persistido no repo** |
| 4 | Merge automático após Human Gate #2 | **Não** — humano sempre clica merge |
| 5 | Skills visuais (Antigravity+Gemini) | **Fora do engine inicialmente** |
| 6 | `SKILL_FULL_SPRINT` sem benchmark | **Sim**, apenas para: bugfix puro, debt-item conhecido, mock removal, estabilização pequena |
| 7 | Sprint piloto oficial | **SPRINT_01_MULTI_LOJA** (eliminar fallback `loja-1`) |

> Mudança destas decisões → ADR obrigatório.

---

## 5. Ordem de implementação (Blocos 29–45)

| Onda | Blocos | Status |
|---|---|---|
| **I — Fundação engine** | 29, 30, 31 | ✅ concluída |
| **II — Template + skills críticas** | 32, 33, 34, 35 | ✅ concluída (32 skills; 8 aprovadas em APPROVAL_BATCH_V1) |
| **III — Modos avançados** | 36, 37, 38, 39 | ⏸️ congelada (estratégia "servir a operação real"; reavaliar pós-R0/R1) |
| **IV — Composição + governança operacional** | 40, 41, 42 | ⏸️ congelada |
| **V — Validação no campo** | 43 (piloto), 44 (retro), 45 (liberar overnight) | 🔄 43 ✅ (piloto Multi-Loja) · 44 (retro) = R1, pendente · 45 pendente |

---

## 6. Convenções

### 6.1 Naming de skills
```
SKILL_<CATEGORIA>_<NOME>.md
Exemplos:
  SKILL_BENCHMARK_FINANCEIRO.md
  SKILL_EXEC_FIX_MOCK.md
  SKILL_PROPOSE_SPRINT.md
```

### 6.2 Naming de tickets de execução
```
<HUB-SLUG>-<TAMANHO>-<NNN>
Exemplos:
  MULTI_LOJA-S-001
  FIN-M-014
  PDV-S-007
```

### 6.3 Imutabilidade
- Skill aceita não muda (mudar = nova versão).
- Sprint encerrada não muda.
- Execução logada não muda (`EXECUTION_LOG.md` é append-only).
- Snapshot de git é referência de rollback até sprint fechar.

---

## 7. Relação com outras camadas

| Camada | Como interage com Execution |
|---|---|
| `governance/` | Define regras. Engine **honra** mecanicamente. |
| `roadmaps/` | Define o que fazer. Engine **busca** itens elegíveis aqui. |
| `status/` | Estado vivo. Engine **lê** (blockers, riscos, dívida) e **atualiza** (dívida paga, mock removido). |
| `decisions/` | Decisões. Engine **respeita** ADRs e **propõe** novos via `SKILL_PROPOSE_ADR`. |
| `sprints/` | Histórico. Engine **gera** sprints novas a partir de propostas aprovadas. |
| `audits/` | Auditorias. Engine **roda** `SKILL_AUDIT_<HUB>` pós-implementação. |
| `memory/` | Memória. Engine **lê** memórias relacionadas no pre-flight e **persiste** novas em handoff. |

---

## 8. Fonte da verdade

- **Pipeline:** [`EXECUTION_ENGINE.md`](./EXECUTION_ENGINE.md)
- **Limites:** [`SAFE_GUARDS.md`](./SAFE_GUARDS.md) + [`HUMAN_GATES.md`](./HUMAN_GATES.md)
- **Taxonomia das skills:** [`SKILL_TAXONOMY.md`](./SKILL_TAXONOMY.md)
- **Skills concretas:** [`docs/skills/executoras/`](../skills/executoras/) (a partir do Bloco 32)
- **Status vivo de execução:** `docs/status/{LOCKS,EXECUTION_LOG,OVERNIGHT_QUEUE}.md` (a criar nos Blocos 37–38, 42)
