---
title: Audit Protocol — Como rodar uma auditoria profunda de HUB
status: bloco-5
owner: produto/arquitetura
last_update: 2026-05-27
versao: v1
depende_de:
  - docs/governance/GOVERNANCA.md
  - docs/governance/WORKFLOW_MULTI_IA.md
  - docs/governance/SESSION_HANDOFF.md
  - docs/governance/SPRINT_PROTOCOL.md
template:
  - docs/audits/TEMPLATE_AUDITORIA.md  (bloco 21 — a entregar)
arquivos_existentes_referencia:
  - docs/audits/AUDITORIA_FINAL_WHATSAPP_HUB.md
  - docs/audits/AUDITORIA_FINAL_OMNI_AGENT_HUB.md
  - docs/audits/AUDITORIA_CONFIG_V3_UX.md
---

# 🔍 Audit Protocol — OmniGestão Pro

> **Quem deve ler:** humano dono do projeto e toda IA que vá executar auditoria.
> **O que define:** como uma auditoria nasce, vive e morre — sem virar refactor, sprint disfarçada ou caça às bruxas.
> **Princípio central:** **auditoria não conserta — auditoria descreve. Quem conserta é a sprint de correção.**

---

## 1. O que é uma auditoria

Uma auditoria é um **diagnóstico estruturado e imutável** de um HUB ou área cross-cutting, em ponto único do tempo, produzindo:

1. Lista de findings (P0/P1/P2/P3) com path:linha, risco e sugestão de correção.
2. Snapshot do estado real vs estado declarado.
3. Mapa de mocks, dívida técnica e riscos descobertos.
4. Recomendação de próxima sprint (ou nenhuma, se HUB está saudável).

**Não é refactor. Não é fix. Não é design.** É **observação**.

---

## 2. Auditoria × Sprint (diferença essencial)

| | Auditoria | Sprint |
|---|---|---|
| Objetivo | Diagnosticar | Executar |
| Saída | Documento imutável (`AUDITORIA_*.md`) | Código + documento imutável (`SPRINT_*.md`) |
| Toca código? | **Não** (só lê) | Sim |
| Duração | 0.5–2 dias | 5–10 dias |
| IA primária | Opus (análise) + Sonnet (verificar código) | Sonnet/Composer/Antigravity |
| Resulta em | Backlog atualizado | Backlog reduzido + estado avançado |

**Fluxo típico:**
```
Auditoria → BACKLOG_<HUB>.md atualizado (P0/P1 promovidos) → Sprint de correção
```

---

## 3. Quando rodar uma auditoria (triggers)

| Trigger | Tipo | Prioridade |
|---|---|---|
| HUB nunca auditado | Saúde geral | Alta — fazer antes de Fase 2 do roadmap dele |
| Mudou para Fase nova no roadmap | Saúde geral pré-fase | Alta |
| Incidente sério em produção | Forense + saúde | **Crítica** (≤ 48h) |
| Múltiplos bugs no mesmo HUB | Saúde geral | Alta |
| Suspeita de mock enganoso | Mocks tracking | Alta |
| Antes de demo enterprise | UX + saúde | Média |
| Trimestral (cadência §15) | Saúde geral rotativa | Média |
| Pedido de auditoria externa (cliente/contábil) | Específica do escopo pedido | Sob demanda |

---

## 4. Tipos de auditoria

| Tipo | O que verifica | IA primária |
|---|---|---|
| **Saúde geral** | Tudo: dados reais vs mock, fluxo crítico, idempotência, multi-loja, áreas protegidas, gaps | Opus + Sonnet |
| **UX** | Hierarquia, acessibilidade, ergonomia, microcopy, consistência de tokens semânticos | Antigravity+Gemini + Opus consolida |
| **Segurança** | Auth, validação de input, vazamento de token, isolamento multi-loja, signature de webhook | Opus + Sonnet |
| **Performance** | N+1, queries pesadas, bundle, cold start, payload JSONB inchado | Sonnet + Opus |
| **Dados** | Integridade referencial, órfãos, `localKey` ausente, `storeId` ausente, payload corrompido | Sonnet |
| **Fiscal** | NF-e/NFC-e, cálculo de imposto, conciliação, plano de contas | Sonnet + contador externo |
| **IA / Agent** | Tool calling, prompts, idempotência, auditoria de comando, governança | Opus |
| **Forense (pós-incidente)** | Causa raiz, blast radius, decisões erradas, validação que falhou | Opus + Sonnet |

---

## 5. Princípios

1. **1 auditoria = 1 HUB ou 1 cross-cutting bem definido.** Sem auditoria "geral do sistema".
2. **Read-only durante a auditoria.** Nada de "corrigir já que vi". Findings vão para o documento; correção vira sprint.
3. **Toda finding tem evidência.** Path:linha, query SQL, screenshot, log. Sem "achei que".
4. **Toda finding tem severidade.** P0/P1/P2/P3 com critério claro (§10).
5. **Saída imutável.** `AUDITORIA_<HUB>.md` não é editado depois — re-auditoria gera novo arquivo com versão.
6. **Toda auditoria vira input de backlog.** P0/P1 vão para `BACKLOG_<HUB>.md` no mesmo encerramento.

---

## 6. Quem executa cada tipo

| Tipo | Owner | Suporte |
|---|---|---|
| Saúde geral | Opus | Sonnet (verifica código real, roda `grep`/`tsc`) |
| UX | Antigravity+Gemini | Opus consolida findings; humano valida |
| Segurança | Opus | Sonnet (verifica logs, signatures, env vars) |
| Performance | Sonnet | Opus revisa hipóteses |
| Dados | Sonnet | Opus se decisão arquitetural |
| Fiscal | Sonnet | Contador externo valida (humano) |
| IA / Agent | Opus | Sonnet |
| Forense | Opus + Sonnet em par | humano dono do projeto |

**Regra:** auditoria de área protegida (`GOVERNANCA.md §4`) sempre tem humano dono do projeto no loop.

---

## 7. Fases de uma auditoria

```
┌───────────┐   ┌─────────────┐   ┌───────────┐   ┌──────────┐   ┌───────────┐
│ 0. Kickoff│ → │ 1. Coleta   │ → │ 2. Análise│ → │ 3. Escrita│→ │ 4. Handoff│
│  (humano +│   │ (Sonnet     │   │ (Opus     │   │  (Opus)  │   │ (Opus →   │
│  Opus)    │   │  evidências │   │ classifica│   │          │   │  próxima  │
│           │   │  Antigravity│   │  prioriza)│   │          │   │  sprint)  │
│           │   │  se UX)     │   │           │   │          │   │           │
└───────────┘   └─────────────┘   └───────────┘   └──────────┘   └───────────┘
   0.5 h          2–8 h            1–4 h           2–4 h          0.5 h
```

---

## 8. Fase 0 — Kickoff

```text
[ ] 1. Escolher HUB ou escopo cross-cutting (1 só)
[ ] 2. Escolher tipo (§4) — pode ser "Saúde geral" como default
[ ] 3. Definir limite de tempo (timebox) — auditoria não é eterna
[ ] 4. Definir o que ESTÁ no escopo e o que NÃO está
[ ] 5. Listar arquivos/diretórios alvo
[ ] 6. Listar fontes de evidência permitidas (código, logs, DB read-only, UI)
[ ] 7. Confirmar autorização para queries em produção (se aplicável)
[ ] 8. Criar arquivo placeholder docs/audits/AUDITORIA_<HUB>_v<NN>.md
       — status: em andamento no front matter
```

---

## 9. Fase 1 — Coleta de evidências

Saída: **lista bruta de observações** com evidência.

### 9.1 Ferramentas permitidas

- `Glob` / `Grep` / `Read` (sempre).
- `git log` / `git blame` (sempre).
- `npx tsc --noEmit` (sempre).
- `npm run build` (se quiser detectar erro de build).
- Query SQL **read-only** em DB (só com autorização do humano).
- Antigravity+Gemini para auditoria visual (print + análise).
- Logs de produção (só com autorização).

### 9.2 Padrão de evidência

Toda observação tem ao menos um destes:

```text
- código: path/file.ts:42-67
- log:    "wa.webhook.signature_invalid" em 2026-05-20T14:32:01
- query:  SELECT count(*) FROM Venda WHERE storeId IS NULL → retorna 47
- visual: tela /dashboard/financeiro-v2/contas-receber → card "Próximas" sem skeleton
- git:    commit abc1234 introduziu o problema, sem teste
```

### 9.3 Cuidados

- **Não editar nada.** Se viu bug óbvio: anota, não conserta.
- **Não rodar comando destrutivo** em DB.
- **Não logar credencial** em finding.
- **Confirmar storeId** ao buscar dados (multi-loja).

---

## 10. Severidade — critério oficial

| Nível | Critério | Exemplos | SLA correção |
|---|---|---|---|
| **P0** | Quebra operação real / risco de produção / vazamento de dados / cálculo financeiro errado / mock enganoso visível ao cliente | Venda PDV não persiste · Token em log · storeId ausente em query · NFE com cálculo errado | Sprint imediata |
| **P1** | Funcional mas com risco de erro ou perda de dado em condição comum | Race condition rara · idempotência ausente em webhook · UI sem feedback de erro · mock visível em tela secundária | Próxima sprint |
| **P2** | Qualidade / UX / dívida técnica relevante | N+1 fora de hot path · falta skeleton · microcopy ruim · validação faltando em form não crítico | Próximas 2–3 sprints |
| **P3** | Cosmético / nice-to-have / oportunidade | Componente repetido · helper que poderia virar lib · refactor opcional | Backlog (sem SLA) |

**Regra de upgrade:** P1 que envolve dinheiro, fiscal ou multi-loja **vira P0**.

---

## 11. Formato de uma finding

Cada finding usa este formato no documento de auditoria:

```markdown
### F<NN> · [P0/P1/P2/P3] · <título curto>

**Onde:** `path/file.ts:42-67` (ou rota, ou tela, ou tabela DB)

**Evidência:**
<código relevante, query, log, screenshot, etc.>

**Sintoma observado:**
<o que acontece de errado>

**Risco:**
<o que pode piorar / qual dano possível>

**Sugestão de correção (não-vinculante):**
<como resolver, sem implementar>

**Esforço estimado:** <baixo / médio / alto>

**Depende de:** <outras findings ou decisões>
```

**Numeração:** `F01`, `F02`… sequencial dentro do documento.

---

## 12. Output — `docs/audits/AUDITORIA_<HUB>_v<NN>.md`

Estrutura mínima (TEMPLATE_AUDITORIA.md no Bloco 21):

```markdown
---
title: Auditoria <HUB> · <tipo> · v<NN>
status: concluida
hub: <hub>
tipo: saude_geral | ux | seguranca | performance | dados | fiscal | ia | forense
auditor_primario: <ia ou humano>
auditor_suporte: <ia ou humano>
data: YYYY-MM-DD
timebox: <h ou d>
escopo:
  inclui:
    - <…>
  exclui:
    - <…>
---

# Auditoria <HUB> · <tipo> · v<NN>

## Resumo executivo (≤ 10 linhas)
- HUB: <…>
- Saúde: 🟢 saudável / 🟡 risco médio / 🔴 risco alto
- Total findings: P0=<n> · P1=<n> · P2=<n> · P3=<n>
- Recomendação: <sprint imediata / próxima sprint / sem ação / etc.>

## Contexto e escopo
<…>

## Inventário do que foi olhado
- Arquivos: <count>
- Rotas: <count>
- Telas: <count>
- Tabelas DB: <count>
- Comandos rodados: <list>

## Findings

### F01 · [P0] · <…>
<…>

### F02 · [P1] · <…>
<…>

...

## Mocks descobertos
- <path:linha> — <descrição>
- ...

## Dívida técnica descoberta
- <…>

## Riscos descobertos
- <…>

## Recomendação de próxima sprint
- Itens P0 que devem virar Sprint NN: <…>
- Itens P1 para próxima sprint: <…>
- Itens P2/P3 para BACKLOG_<HUB>.md

## Não auditado (fora do escopo)
- <…>
```

**Imutabilidade:** após `status: concluida`, o arquivo **não é mais editado**. Nova auditoria do mesmo HUB → novo arquivo com `v<NN+1>`.

---

## 13. Fase 4 — Handoff e transição para sprint/backlog

Ao encerrar a auditoria:

```text
[ ] 1. Marcar status: concluida no front matter
[ ] 2. Promover P0 → docs/status/BACKLOG_<HUB>.md (topo, marcados [auditoria F<NN>])
[ ] 3. Promover P1 → BACKLOG_<HUB>.md (seção P1)
[ ] 4. Adicionar P2/P3 ao BACKLOG sem urgência
[ ] 5. Atualizar docs/status/MOCKS_TRACKING.md com mocks descobertos
[ ] 6. Atualizar docs/status/DIVIDA_TECNICA.md com itens novos
[ ] 7. Atualizar docs/status/RISCOS.md com riscos descobertos
[ ] 8. Atualizar docs/audits/INDEX.md (linha nova)
[ ] 9. Atualizar docs/ai/CURRENT_STATUS.md (bloco novo: "Auditoria <HUB> concluída")
[ ] 10. HANDOFF para definição da próxima sprint, se aplicável
[ ] 11. Commit: chore(audits): auditoria <HUB> v<NN> concluida
```

---

## 14. Anti-padrões

- **Auditoria que mexe em código.** Vira fix disfarçado, perde objetividade.
- **Finding sem evidência.** "Acho que tem bug" não conta.
- **Finding sem severidade.** Vira lista de desejo.
- **Auditoria sem timebox.** Vira projeto infinito.
- **Auditoria multi-HUB.** Vira inventário de problemas sem foco.
- **Auditoria sem promover P0 para backlog.** Documento morre na pasta.
- **`AUDITORIA_*.md` editado pós-encerramento.** Quebra histórico — versionar gera `v<NN+1>`.
- **Re-auditoria sem cadência.** HUB fica anos sem revisão e acumula entropia.
- **Auditoria de área protegida sem humano no loop.** Risco alto demais.

---

## 15. Cadência sugerida

| HUB / área | Cadência | Tipo padrão |
|---|---|---|
| Financeiro | Trimestral | Saúde geral + Dados |
| PDV | Trimestral | Saúde geral + Performance |
| Operações/OS | Trimestral | Saúde geral |
| Estoque | Semestral | Dados + Saúde geral |
| Marketplace | Após cada fase do roadmap | Saúde + Segurança |
| WhatsApp | Trimestral | Segurança (webhook signature) + Saúde |
| Omni Agent | Após cada release de tool nova | IA / Agent + Saúde |
| Marketing IA | Semestral | UX |
| CRM | Semestral | UX + Dados |
| BI | Anual | Performance |
| Multi-loja / Auditoria | Semestral | Segurança + Dados |

**Pós-incidente:** auditoria forense **sempre**, ≤ 48h.

---

## 16. Resumo executivo (cole isso para a IA auditora)

```text
RODAR UMA AUDITORIA NO OMNIGESTAO PRO:

0. Kickoff: 1 HUB, 1 tipo (§4), timebox, criar AUDITORIA_<HUB>_v<NN>.md placeholder.
1. Coleta: Glob/Grep/Read + tsc + (DB read-only se autorizado). NÃO editar nada.
2. Análise: classificar findings em P0/P1/P2/P3 (§10).
3. Escrita: documento no formato §12, com evidência por finding (§11).
4. Handoff: promover P0/P1 para BACKLOG_<HUB>, atualizar MOCKS/DIVIDA/RISCOS/INDEX/CURRENT_STATUS.

Regras: read-only, evidência obrigatória, severidade obrigatória, timebox,
documento imutável após concluida, re-auditoria gera v<NN+1>.
```
