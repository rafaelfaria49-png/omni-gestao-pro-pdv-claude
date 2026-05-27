---
title: Blueprint da Governança e Memória — OmniGestão Pro
status: bloco-0 (mapa) — ✅ TODOS OS 28 BLOCOS ENTREGUES (2026-05-27)
owner: produto/arquitetura
last_update: 2026-05-27
versao: v1
---

# 📐 Blueprint da Governança — OmniGestão Pro

> Bloco 0 do **Sistema Operacional de Desenvolvimento do OmniGestão Pro**.
> Define o que vai existir, onde, e em que ordem entregamos.
> Cada bloco seguinte preenche um arquivo deste mapa.

> **🎉 Status final (2026-05-27):** todos os Blocos 0–28 foram entregues e persistidos. O Sistema Operacional está 100% operacional. Tracker completo em [`docs/skills/INDEX.md §Sistema Operacional de Desenvolvimento`](../skills/INDEX.md).

## 1. Princípios da estrutura

1. **Uma fonte por tópico.** Roadmap mora em `roadmaps/`, regra mora em `skills/rules/` ou `governance/`, estado vivo mora em `status/`. Nunca duplicar.
2. **Um arquivo por HUB.** Não misturar HUBs. Roadmap, backlog, sprint, auditoria — sempre modular.
3. **Tudo é Markdown versionado no repo.** Sem Notion paralelo, sem planilha. O repositório é a fonte da verdade.
4. **Índices baratos, conteúdo caro.** Cada pasta tem um `INDEX.md` curto. Conteúdo profundo só nos arquivos finais.
5. **Templates obrigatórios.** Sprint, auditoria e ADR seguem template — qualquer IA produz no mesmo formato.
6. **Memória persistente fora do chat.** Decisões, incidentes e lições viram arquivo. Chat é descartável.

---

## 2. Estrutura existente (preservar)

Estas pastas **já existem** e continuam sendo a fonte da verdade dos seus respectivos tópicos:

| Pasta / arquivo | Papel atual | Como o blueprint usa |
|---|---|---|
| `docs/skills/INDEX.md` | Ponto de entrada oficial das regras para IAs | Vira "ponto de entrada raiz" — passa a apontar para `governance/` também |
| `docs/skills/rules/CORE_RULES.md` | Regras inegociáveis | Mantido; `governance/GOVERNANCA.md` será uma versão enxuta orientada a ação |
| `docs/skills/rules/DELIVERY_CHECKLIST.md` | Checklist de encerramento | Mantido |
| `docs/skills/rules/AI_WORKFLOW.md` | Papéis das IAs | Substituído na prática por `governance/WORKFLOW_MULTI_IA.md` (mais completo) — `AI_WORKFLOW.md` vira pointer |
| `docs/skills/rules/FRONTEND_IMPORT_RULES.md` | Importar UI externa | Mantido |
| `docs/decisions/` | ADRs (já tem `OS_ROUTE_OFICIAL.md`) | É a **única** casa oficial de ADRs — `governance/` aponta para cá |
| `docs/audits/` | Auditorias (vários `AUDITORIA_*.md`) | Recebe novo `INDEX.md` + `TEMPLATE_AUDITORIA.md` |
| `docs/architecture/` | Arquitetura (`ARCHITECTURE.md`, `BACKEND.md`, `MODULARIZACAO.md`, `SIDEBAR_PAGE_ROUTES.md`) | Recebe `INDEX.md` + arquivos de domínio (`EVENT_BUS.md`, `ADAPTERS.md`, `INTEGRATIONS.md`) conforme necessidade |
| `docs/memory/OMNIGESTAO_MASTER_MEMORY.md` | Memória consolidada | Mantida; recebe pastas filhas `incidents/` (post-mortems) — ADRs ficam em `docs/decisions/` |
| `docs/ai/CURRENT_STATUS.md` | Estado vivo do projeto | Vira **overview enxuto** com pointers para `status/BACKLOG_*.md` por HUB |
| `docs/changelog/CHANGELOG.md` | Changelog | Mantido |
| `docs/roadmap/ROADMAP.md`, `PRIORIDADES.md` | Roadmap geral atual | Serão **consolidados** dentro de `roadmaps/INDEX.md` e dos `ROADMAP_<HUB>.md`. Mantidos como legacy até a migração terminar |
| `docs/START_HERE.md`, `docs/PROJECT_MASTER.md`, `docs/WORKFLOW.md` | Documentos raiz herdados | Auditar e consolidar em fase posterior; por ora mantidos |

---

## 3. Estrutura nova (a criar)

Novas pastas e arquivos a serem criados ao longo dos próximos blocos:

```
docs/
├── governance/                       [NOVO] Como o projeto funciona
│   ├── BLUEPRINT_GOVERNANCA.md       (este arquivo — bloco 0)
│   ├── GOVERNANCA.md                 (bloco 1) Regras inegociáveis enxutas, orientadas a ação
│   ├── WORKFLOW_MULTI_IA.md          (bloco 2) Qual IA para qual tarefa
│   ├── SESSION_HANDOFF.md            (bloco 3) Como abrir/fechar sessão sem perder contexto
│   ├── SPRINT_PROTOCOL.md            (bloco 4) Como rodar uma sprint do início ao fim
│   ├── AUDIT_PROTOCOL.md             (bloco 5) Como rodar uma auditoria profunda
│   └── PROMPTS_OFICIAIS.md           (bloco 7) Prompts reutilizáveis (kickoff, handoff, sprint, auditoria)
│
├── blueprint/                        [NOVO] Visão de produto (muda devagar)
│   ├── MASTER_PLAN.md                (bloco 24) Blueprint oficial do produto
│   ├── PRODUCT_VISION.md             (bloco 25) Tese, posicionamento, moat
│   └── MONETIZATION.md               (bloco 26) Tiers, créditos Omni, add-ons
│
├── roadmaps/                         [NOVO] Roadmap modular — 1 arquivo por HUB
│   ├── INDEX.md                      (bloco 8) Mapa de dependências entre HUBs + ordem ideal
│   ├── ROADMAP_PDV.md                (bloco 9)
│   ├── ROADMAP_OPERACOES_OS.md       (bloco 10)
│   ├── ROADMAP_FINANCEIRO.md         (bloco 11)
│   ├── ROADMAP_ESTOQUE.md            (bloco 12)
│   ├── ROADMAP_MARKETPLACE.md        (bloco 13)
│   ├── ROADMAP_CRM.md                (bloco 14)
│   ├── ROADMAP_WHATSAPP.md           (bloco 15)
│   ├── ROADMAP_MARKETING_IA.md       (bloco 16)
│   ├── ROADMAP_OMNI_AGENT.md         (bloco 17)
│   ├── ROADMAP_BI.md                 (bloco 18)
│   └── ROADMAP_MULTI_LOJA.md         (bloco 19)
│
├── status/                           [NOVO] Estado vivo (atualizado a cada sprint)
│   ├── BACKLOG_PDV.md                Backlog específico por HUB (1 por HUB)
│   ├── BACKLOG_OPERACOES_OS.md
│   ├── BACKLOG_FINANCEIRO.md
│   ├── BACKLOG_ESTOQUE.md
│   ├── BACKLOG_MARKETPLACE.md
│   ├── BACKLOG_CRM.md
│   ├── BACKLOG_WHATSAPP.md
│   ├── BACKLOG_MARKETING_IA.md
│   ├── BACKLOG_OMNI_AGENT.md
│   ├── BACKLOG_BI.md
│   ├── BACKLOG_MULTI_LOJA.md
│   ├── DIVIDA_TECNICA.md             (bloco 23) Hacks, TODOs, refatores com prazo
│   ├── MOCKS_TRACKING.md             (bloco 23) Onde ainda há mock visível ao usuário
│   ├── RISCOS.md                     (bloco 23) Riscos ativos + mitigação
│   └── BLOCKERS.md                   (bloco 23) Bloqueios atuais + responsável
│
├── sprints/                          [NOVO] Histórico imutável de sprints
│   ├── INDEX.md                      Lista cronológica com HUB/data/status
│   ├── TEMPLATE_SPRINT.md            (bloco 20) Template oficial
│   └── SPRINT_NN_<HUB>.md            Uma por sprint (entregas + lições)
│
├── audits/                           (existente) — receber novos arquivos
│   ├── INDEX.md                      (novo) Índice de auditorias
│   └── TEMPLATE_AUDITORIA.md         (bloco 21) Template oficial
│
├── architecture/                     (existente) — receber complementos
│   └── INDEX.md                      (novo) Índice + pointers
│
└── memory/                           (existente) — receber pasta filha
    └── incidents/                    [NOVO] 1 post-mortem por incidente
                                      (ADRs continuam em docs/decisions/)
```

---

## 4. Ordem oficial de entrega

| # | Bloco | Caminho-alvo | Tipo | Depende de |
|---|---|---|---|---|
| 0 | Blueprint da Governança | `docs/governance/BLUEPRINT_GOVERNANCA.md` | Mapa | — |
| 1 | Governança enxuta | `docs/governance/GOVERNANCA.md` | Regra | 0 |
| 2 | Workflow multi-IA | `docs/governance/WORKFLOW_MULTI_IA.md` | Regra | 0 |
| 3 | Session handoff | `docs/governance/SESSION_HANDOFF.md` | Fluxo | 1, 2 |
| 4 | Sprint protocol | `docs/governance/SPRINT_PROTOCOL.md` | Fluxo | 3 |
| 5 | Audit protocol | `docs/governance/AUDIT_PROTOCOL.md` | Fluxo | 3 |
| 6 | ADR template + apontamento p/ `docs/decisions/` | `docs/decisions/TEMPLATE_ADR.md` | Template | 1 |
| 7 | Prompts oficiais | `docs/governance/PROMPTS_OFICIAIS.md` | Prompts | 1–5 |
| 8 | Roadmaps INDEX (dependências entre HUBs) | `docs/roadmaps/INDEX.md` | Mapa | — |
| 9 | Roadmap PDV | `docs/roadmaps/ROADMAP_PDV.md` | HUB | 8 |
| 10 | Roadmap Operações/OS | `docs/roadmaps/ROADMAP_OPERACOES_OS.md` | HUB | 8 |
| 11 | Roadmap Financeiro | `docs/roadmaps/ROADMAP_FINANCEIRO.md` | HUB | 8 |
| 12 | Roadmap Estoque | `docs/roadmaps/ROADMAP_ESTOQUE.md` | HUB | 8 |
| 13 | Roadmap Marketplace | `docs/roadmaps/ROADMAP_MARKETPLACE.md` | HUB | 8, 12 |
| 14 | Roadmap CRM | `docs/roadmaps/ROADMAP_CRM.md` | HUB | 8 |
| 15 | Roadmap WhatsApp | `docs/roadmaps/ROADMAP_WHATSAPP.md` | HUB | 8, 14 |
| 16 | Roadmap Marketing IA | `docs/roadmaps/ROADMAP_MARKETING_IA.md` | HUB | 8 |
| 17 | Roadmap Omni Agent | `docs/roadmaps/ROADMAP_OMNI_AGENT.md` | HUB | 8 (e demais) |
| 18 | Roadmap BI | `docs/roadmaps/ROADMAP_BI.md` | HUB | 8 |
| 19 | Roadmap Multi-loja | `docs/roadmaps/ROADMAP_MULTI_LOJA.md` | HUB | 8 |
| 20 | Template sprint | `docs/sprints/TEMPLATE_SPRINT.md` | Template | 4 |
| 21 | Template auditoria | `docs/audits/TEMPLATE_AUDITORIA.md` | Template | 5 |
| 22 | CURRENT_STATUS reformatado | `docs/ai/CURRENT_STATUS.md` | Vivo | 9–19 |
| 23 | Dívida técnica / mocks / riscos / blockers | `docs/status/{DIVIDA_TECNICA,MOCKS_TRACKING,RISCOS,BLOCKERS}.md` | Vivo | 22 |
| 24 | MASTER_PLAN consolidado | `docs/blueprint/MASTER_PLAN.md` | Blueprint | 8–19 |
| 25 | Product Vision | `docs/blueprint/PRODUCT_VISION.md` | Blueprint | 24 |
| 26 | Monetization | `docs/blueprint/MONETIZATION.md` | Blueprint | 24 |
| 27 | Architecture INDEX + complementos | `docs/architecture/INDEX.md` (+ outros) | Arquitetura | 24 |
| 28 | Master Memory consolidação + pointers | `docs/memory/OMNIGESTAO_MASTER_MEMORY.md` (atualizar) | Memória | tudo |

---

## 5. Regras de continuidade entre blocos

- Cada bloco entregue é **um arquivo único pronto para colar** no caminho indicado — e, neste fluxo persistente, **é salvo automaticamente** no repositório.
- Nenhum bloco depende do chat anterior — só dos **arquivos já salvos**.
- Cada bloco termina com `STATUS` apontando o próximo, dependências e arquivos criados/alterados.
- Se quiser pular a ordem (ex: ir direto para `ROADMAP_MARKETPLACE.md`), basta pedir — eu sinalizo as dependências faltantes antes de entregar.

---

## 6. Fonte da verdade por tópico

| Tópico | Fonte da verdade | Tipo |
|---|---|---|
| Como qualquer IA deve trabalhar | `docs/skills/INDEX.md` (entrada) + `docs/governance/GOVERNANCA.md` (regras) | Estável |
| Qual IA para qual tarefa | `docs/governance/WORKFLOW_MULTI_IA.md` | Estável |
| Como abrir/fechar sessão | `docs/governance/SESSION_HANDOFF.md` | Estável |
| Como rodar sprint | `docs/governance/SPRINT_PROTOCOL.md` + `docs/sprints/TEMPLATE_SPRINT.md` | Estável |
| Como rodar auditoria | `docs/governance/AUDIT_PROTOCOL.md` + `docs/audits/TEMPLATE_AUDITORIA.md` | Estável |
| Estado atual do projeto (overview) | `docs/ai/CURRENT_STATUS.md` | Vivo |
| Backlog detalhado por HUB | `docs/status/BACKLOG_<HUB>.md` | Vivo |
| Roadmap detalhado por HUB | `docs/roadmaps/ROADMAP_<HUB>.md` | Estável (revisado por trimestre) |
| Decisões arquiteturais | `docs/decisions/*.md` (1 ADR por arquivo) | Imutável (cada ADR) |
| Post-mortems / incidentes | `docs/memory/incidents/*.md` | Imutável |
| Dívida técnica / mocks / riscos / blockers | `docs/status/{DIVIDA_TECNICA,MOCKS_TRACKING,RISCOS,BLOCKERS}.md` | Vivo |
| Memória consolidada do projeto | `docs/memory/OMNIGESTAO_MASTER_MEMORY.md` | Vivo |
| Histórico imutável de sprints | `docs/sprints/SPRINT_*.md` | Imutável |
| Blueprint do produto | `docs/blueprint/MASTER_PLAN.md` | Estável (revisado por trimestre) |
| Visão e moat | `docs/blueprint/PRODUCT_VISION.md` | Estável |
| Monetização | `docs/blueprint/MONETIZATION.md` | Estável |
| Arquitetura técnica | `docs/architecture/*.md` | Estável |

---

## 7. O que cada IA deve ler primeiro (entrada universal)

Qualquer sessão de qualquer IA começa lendo nesta ordem:

1. `CLAUDE.md` (raiz) — pointer geral.
2. `docs/skills/INDEX.md` — índice de regras.
3. `docs/governance/GOVERNANCA.md` — regras inegociáveis enxutas (quando existir; até lá, `docs/skills/rules/CORE_RULES.md`).
4. `docs/ai/CURRENT_STATUS.md` — estado atual.
5. `docs/governance/SESSION_HANDOFF.md` — como entrar/sair (quando existir).
6. **Se a tarefa for em um HUB específico:** `docs/roadmaps/ROADMAP_<HUB>.md` + `docs/status/BACKLOG_<HUB>.md`.

---

## STATUS

- **Documento entregue:** Bloco 0 — Blueprint da Governança.
- **Arquivos criados:** `docs/governance/BLUEPRINT_GOVERNANCA.md` (este).
- **Arquivos alterados:** nenhum nesta entrega (próximo bloco atualiza `docs/skills/INDEX.md`).
- **Índices atualizados:** nenhum ainda (será feito no Bloco 1).
- **Fonte da verdade deste assunto:** este arquivo.
- **Próximo bloco sugerido:** Bloco 1 — `docs/governance/GOVERNANCA.md` (regras inegociáveis enxutas, sucessor orientado a ação do `CORE_RULES.md`).
- **Dependências do próximo bloco:** nenhuma.
