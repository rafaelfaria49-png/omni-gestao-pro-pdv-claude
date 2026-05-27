---
title: Roadmap — HUB Omni Agent
hub: omni_agent
status: vivo
owner: produto + Sonnet (técnico)
last_update: 2026-05-27
sprint_atual: nenhuma (próxima a planejar)
---

# 🤖 Roadmap — HUB Omni Agent

> Estrutura conforme [`docs/roadmaps/INDEX.md §2.2`](./INDEX.md). 15 seções obrigatórias.
> Fonte da verdade do estado real: [`docs/ai/CURRENT_STATUS.md`](../ai/CURRENT_STATUS.md).

---

## 1. Visão

> **Operador IA conversacional que executa ações reais no ERP — abrir OS, registrar venda, dar baixa em conta, gerar relatório — via comandos em texto livre (WhatsApp, painel ou voz), com auditoria por execução e governança de custo.**

Omni Agent é a **camada transversal de execução por linguagem natural**. Não substitui o operador — multiplica. Cada execução é rastreada: quem pediu, qual prompt, qual executor rodou, qual resultado.

---

## 2. Objetivos

1. **Executores reais determinísticos** — comando vira ação no ERP, não chat genérico.
2. **Auditoria por execução** — log de prompt + executor escolhido + parâmetros + resultado.
3. **Governança de custo** — limite por loja, alerta antes do estouro, log de tokens/créditos.
4. **Fallback explícito** — Agent não tem certeza → não age, devolve ao humano.
5. **Multi-canal** — WhatsApp (Fase 1), painel web (Fase 2), voz (Fase 4).

---

## 3. Concorrentes analisados

| Concorrente | O que aprendemos |
|---|---|
| **Open Interpreter** | LLM com tool-use direto — referência de arquitetura. |
| **LangChain Agents** | Framework de agentes — adotado parcialmente para tool-use. |
| **OpenAI Assistants API** | Threads + tools — referência para histórico de conversação. |
| **HuggingChat / Le Chat** | UI conversacional simples — referência UX. |
| **Notion AI** | Comandos contextuais embarcados — inspiração para painel. |

---

## 4. Diferenciais

- **Executores reais** (não simulação) — ex.: executor `recebimentoFinanceiro` (real, recente commit `bc2c4cb`).
- **Regex determinística** para identificar intent antes de chamar LLM — barato e previsível.
- **Custo por crédito** modelado (`lib/ia-mestre/credit-costs.ts`, `lib/ia-mestre/debit-turn-credits.ts`).
- **API guard** (`lib/ia-mestre/api-guard.ts`) protege endpoints contra abuso.
- **Auditoria forte** (`docs/audits/AUDITORIA_IA_MESTRE.md`, `AUDITORIA_FINAL_IA_MESTRE.md`).
- **Honesty layer** (`components/ia-mestre/ia-mestre-honesty.ts`) — agent declara o que não pode fazer.

---

## 5. Gaps atuais

| Gap | Severidade |
|---|---|
| **Pool de executores reais ainda pequeno** (recebimento financeiro ✅, outros pendentes) | 🔴 P0 |
| **LLM ainda não governado** — regex resolve intent básica, LLM livre quando cai no fallback | 🟡 P1 |
| **Sem confirmação de ação destrutiva** padronizada (ex: cancelar venda) | 🔴 P0 |
| **Log de execução** parcial — falta painel de auditoria | 🟡 P1 |
| **Sem limite duro por loja** — só soft via credit-costs | 🟡 P1 |
| **Sem painel web** próprio (só via WhatsApp e IA Mestre tela) | 🟡 P1 |
| **Voz inexistente** | 🟢 P2 |
| **Multi-step (planejamento)** ausente — só single-step | 🟡 P1 |
| **Resposta sem fontes/justificativa** quando consulta dados | 🟢 P2 |

---

## 6. Funcionalidades futuras

| # | Funcionalidade | Prioridade |
|---|---|---|
| 1 | **Expandir pool de executores** (registrar venda, abrir OS, baixar conta, lançar entrada estoque) | P0 |
| 2 | **Confirmação obrigatória** em ações destrutivas | P0 |
| 3 | **LLM governado** (system prompt fechado + tool-use estrito) | P1 |
| 4 | **Painel de auditoria** (logs por loja, custo por execução) | P1 |
| 5 | **Limite duro por loja** (orçamento mensal, hard stop) | P1 |
| 6 | **Painel web próprio** (chat fixo no `/dashboard/ia-mestre`) | P1 |
| 7 | **Multi-step** (planejamento + execução em N passos) | P1 |
| 8 | **Citação de fontes** (ao responder, mostra qual query rodou) | P2 |
| 9 | **Voz** (input via mic, output via TTS) | P3 |
| 10 | **Aprendizado por feedback** (👍/👎 ajusta prompt) | P2 |
| 11 | **Templates de comando** rápidos (favoritos do usuário) | P2 |
| 12 | **Integração CRM** (consulta cliente, histórico, segmento) | P1 |

---

## 7. Backlog

| Item | Tamanho | Pré-req |
|---|---|---|
| Executor `registrarVenda` (PDV via Agent) | M | Validação fluxo PDV |
| Executor `abrirOS` (OS via Agent) | M | Validação fluxo OS |
| Executor `lancarEntradaEstoque` | M | Estoque Fase 3 (NF-e XML) |
| Padronizar confirmação destrutiva (yes/no template) | S | Decisão UX |
| LLM governado (system prompt + JSON schema obrigatório) | M | ADR de arquitetura |
| Painel de auditoria (rota `/dashboard/ia-mestre/audit`) | M | Log estruturado pronto |
| Limite duro mensal por loja (config + hard stop) | M | Modelo de billing definido |
| Multi-step (planner) | L | LLM governado funcionando |

---

## 8. Fases

### Fase 1 — Executores reais (em curso, ~40% feita)
**Objetivo:** 5+ executores reais cobrindo PDV, OS, Financeiro, Estoque.
**Saída:** receber/registrar/abrir/lançar via comando WhatsApp em loja-piloto.

### Fase 2 — Governança LLM + auditoria
**Objetivo:** LLM com tool-use estrito + painel de auditoria + limite duro.
**Saída:** 0 execução sem log; orçamento por loja respeitado.

### Fase 3 — Multi-step + UX painel
**Objetivo:** planejamento N passos; painel web próprio.
**Saída:** "fechar caixa do dia e enviar relatório por WhatsApp" funciona em 1 comando.

### Fase 4 — Multimodal
**Objetivo:** voz, citação de fontes, feedback.

### Fase 5 — Especialização
**Objetivo:** agentes especializados por HUB (Agent Vendas, Agent Financeiro).

---

## 9. Dependências

| Depende de | Para quê |
|---|---|
| **Qualquer HUB executor** | Serial obrigatório (matriz §4 do INDEX) — mudar executor enquanto Omni Agent muda regra = caos |
| **WhatsApp** | Canal principal de input (Fase 1) |
| **CRM** | Consultas contextuais sobre cliente |
| **Financeiro** | Logging de custo de execução |
| **Multi-loja** | Toda execução escopada por `storeId` |

---

## 10. Riscos

| Risco | Categoria | Mitigação |
|---|---|---|
| **Ação destrutiva sem confirmação** apaga venda real | Negócio — P0 | Padrão "yes/no" obrigatório antes de executar |
| **LLM alucina executor inexistente** | Técnico — P0 | Tool-use com JSON schema validado |
| **Custo descontrolado** (loop infinito de LLM) | Negócio — P0 | Limite duro de tokens por execução |
| **Vazamento entre lojas** (executor roda em `storeId` errado) | Negócio — P0 | Resolver `storeId` no início, validar em cada executor |
| **Prompt injection** via WhatsApp | Segurança — P1 | Sanitização + lista branca de comandos |
| **Mudança em executor** quebra Agent | Técnico — P0 | Contrato versionado; ADR ao mudar |

---

## 11. Sprint atual

**Nenhuma.** Último marco: executor `recebimentoFinanceiro` (commit `bc2c4cb`).

Próxima sugerida: **SPRINT_NN_OMNI_AGENT — Confirmação destrutiva padronizada + executor `registrarVenda`**.

---

## 12. Status atual

Omni Agent tem **infra inicial sólida**: api-guard, credit-costs, debit-turn-credits, honesty layer, regex determinística pré-LLM, e o primeiro executor real (`recebimentoFinanceiro`). Duas auditorias dedicadas (`AUDITORIA_IA_MESTRE`, `AUDITORIA_FINAL_IA_MESTRE`) registradas. Gap principal é o **pool pequeno de executores reais** — sem mais executores, o Agent fica preso ao papel de chat. Confirmação destrutiva padronizada é P0 antes de expandir.

---

## 13. Métricas de sucesso

| Métrica | Meta |
|---|---|
| Execuções com log completo (prompt + executor + resultado) | **100%** |
| Ações destrutivas sem confirmação | **0** |
| Custo médio por execução vs orçamento | **< 80%** |
| Vazamento entre lojas | **0** |
| Cobertura de testes dos executores | **> 80%** |
| Taxa de sucesso de comandos (intent reconhecido + executor ok) | **> 90%** |

---

## 14. Blockers

| Blocker | Bloqueia |
|---|---|
| ADR de arquitetura LLM governado | Fase 2 |
| Modelo de billing/limite por loja | Limite duro |
| Padrão de confirmação destrutiva | Expansão de executores |

---

## 15. Referências

- **ADRs relacionados:** ADR arquitetura LLM governado + tool-use (a criar)
- **Auditorias relacionadas:**
  - `docs/audits/AUDITORIA_IA_MESTRE.md`
  - `docs/audits/AUDITORIA_FINAL_IA_MESTRE.md`
- **Sprints relacionadas:** commit `bc2c4cb` (executor recebimento financeiro)
- **Código atual relevante:**
  - `lib/ia-mestre/api-guard.ts`
  - `lib/ia-mestre/credit-costs.ts`
  - `lib/ia-mestre/debit-turn-credits.ts`
  - `components/ia-mestre/ia-mestre-honesty.ts`
  - `app/api/ai/orchestrate/route.ts`
  - `lib/handleAiApiError.ts`
- **Memórias persistentes:** — (criar uma sobre o executor de recebimento financeiro)
- **Governança:** `lib/omni-agent/*` executores entram nas áreas protegidas — qualquer mudança em executor exige autorização explícita.
