# Skills Index — OmniGestão Pro

Ponto de entrada das **regras de governança** do projeto.
Qualquer IA (Claude Code / Cursor / Antigravity / Claude Chat / ChatGPT / Gemini)
deve ler este índice **antes de iniciar uma tarefa**.

## Ordem de leitura recomendada

1. Este índice (`docs/skills/INDEX.md`).
2. **Governança — Regras inegociáveis (versão de bolso)**: [`docs/governance/GOVERNANCA.md`](../governance/GOVERNANCA.md) — leitura obrigatória < 2 min antes de tocar qualquer arquivo.
3. **Blueprint da Governança**: [`docs/governance/BLUEPRINT_GOVERNANCA.md`](../governance/BLUEPRINT_GOVERNANCA.md) — mapa do "Sistema Operacional de Desenvolvimento" do projeto.
4. Estado atual do projeto: [`docs/ai/CURRENT_STATUS.md`](../ai/CURRENT_STATUS.md).
5. As regras detalhadas abaixo.

## Regras de governança (`docs/skills/rules/`)

| Regra | Quando aplicar |
|-------|----------------|
| [`CORE_RULES.md`](./rules/CORE_RULES.md) | **Sempre.** Regras inegociáveis: pensar antes de codar, escopo fechado, mudanças cirúrgicas, áreas protegidas, tokens visuais. |
| [`DELIVERY_CHECKLIST.md`](./rules/DELIVERY_CHECKLIST.md) | Ao **encerrar** qualquer tarefa: validação, git status, docs, relatório final. |
| [`AI_WORKFLOW.md`](./rules/AI_WORKFLOW.md) | **Pointer histórico.** A fonte da verdade do workflow multi-IA passou a ser [`docs/governance/WORKFLOW_MULTI_IA.md`](../governance/WORKFLOW_MULTI_IA.md). |
| [`FRONTEND_IMPORT_RULES.md`](./rules/FRONTEND_IMPORT_RULES.md) | Ao **importar UI externa** (Lovable / Cloud Design / Gemini / Antigravity). |

## Resumo

- `CORE_RULES.md` — como trabalhar (princípios gerais).
- `DELIVERY_CHECKLIST.md` — como encerrar (checklist de entrega).
- `AI_WORKFLOW.md` — quem faz o quê (papéis e modelos). **Fonte oficial agora: [`docs/governance/WORKFLOW_MULTI_IA.md`](../governance/WORKFLOW_MULTI_IA.md).**
- `FRONTEND_IMPORT_RULES.md` — como integrar protótipos de UI.

A camada de governança é **somente documentação** — não altera código de aplicação.
O `CLAUDE.md` na raiz aponta para este índice automaticamente em cada sessão.

## Sistema Operacional de Desenvolvimento (governança viva)

Em construção incremental. Pasta-raiz: [`docs/governance/`](../governance/).

| Documento | Estado | Papel |
|-----------|--------|-------|
| [`BLUEPRINT_GOVERNANCA.md`](../governance/BLUEPRINT_GOVERNANCA.md) | ✅ Bloco 0 | Mapa-mestre do sistema de governança |
| [`GOVERNANCA.md`](../governance/GOVERNANCA.md) | ✅ Bloco 1 | Regras inegociáveis enxutas, orientadas a ação |
| [`WORKFLOW_MULTI_IA.md`](../governance/WORKFLOW_MULTI_IA.md) | ✅ Bloco 2 | Qual IA para qual tarefa (Opus/Sonnet/Antigravity/Composer/ChatGPT) |
| [`SESSION_HANDOFF.md`](../governance/SESSION_HANDOFF.md) | ✅ Bloco 3 | Como abrir/fechar sessão sem perder contexto |
| [`SPRINT_PROTOCOL.md`](../governance/SPRINT_PROTOCOL.md) | ✅ Bloco 4 | Como rodar uma sprint do início ao fim |
| [`AUDIT_PROTOCOL.md`](../governance/AUDIT_PROTOCOL.md) | ✅ Bloco 5 | Como rodar uma auditoria profunda |
| [`decisions/INDEX.md`](../decisions/INDEX.md) + [`decisions/TEMPLATE_ADR.md`](../decisions/TEMPLATE_ADR.md) | ✅ Bloco 6 | ADRs — template e índice oficial |
| [`PROMPTS_OFICIAIS.md`](../governance/PROMPTS_OFICIAIS.md) | ✅ Bloco 7 | Prompts reutilizáveis (13 prompts paste-and-go) |
| [`roadmaps/INDEX.md`](../roadmaps/INDEX.md) | ✅ Bloco 8 | Índice dos roadmaps por HUB + ordem ideal + matriz de paralelismo + estrutura obrigatória |
| [`roadmaps/ROADMAP_PDV.md`](../roadmaps/ROADMAP_PDV.md) | ✅ Bloco 9 | Roadmap do HUB PDV — visão, fases, gaps, backlog, métricas, blockers |
| [`roadmaps/ROADMAP_OPERACOES_OS.md`](../roadmaps/ROADMAP_OPERACOES_OS.md) | ✅ Bloco 10 | Roadmap do HUB Operações/OS — adapters, hydration, decommission legado, NFS-e, garantia |
| [`roadmaps/ROADMAP_FINANCEIRO.md`](../roadmaps/ROADMAP_FINANCEIRO.md) | ✅ Bloco 11 | Roadmap do HUB Financeiro — adapters, idempotência `localKey`, boleto/PIX, conciliação |
| [`roadmaps/ROADMAP_ESTOQUE.md`](../roadmaps/ROADMAP_ESTOQUE.md) | ✅ Bloco 12 | Roadmap do HUB Estoque — ledger profissional, multi-depósito, curva ABC, NF-e XML |
| [`roadmaps/ROADMAP_MARKETPLACE.md`](../roadmaps/ROADMAP_MARKETPLACE.md) | ✅ Bloco 13 | Roadmap do HUB Marketplace (greenfield) — adapter unificado, ML primeiro, conciliação repasses |
| [`roadmaps/ROADMAP_CRM.md`](../roadmaps/ROADMAP_CRM.md) | ✅ Bloco 14 | Roadmap do HUB CRM — cliente único, tela 360°, segmentação, LGPD |
| [`roadmaps/ROADMAP_WHATSAPP.md`](../roadmaps/ROADMAP_WHATSAPP.md) | ✅ Bloco 15 | Roadmap do HUB WhatsApp — webhook, HMAC, opt-out, marketing massa, inbox |
| [`roadmaps/ROADMAP_MARKETING_IA.md`](../roadmaps/ROADMAP_MARKETING_IA.md) | ✅ Bloco 16 | Roadmap do HUB Marketing IA — orquestrador, atribuição, criativos IA, ROI |
| [`roadmaps/ROADMAP_OMNI_AGENT.md`](../roadmaps/ROADMAP_OMNI_AGENT.md) | ✅ Bloco 17 | Roadmap do HUB Omni Agent — executores reais, LLM governado, confirmação destrutiva |
| [`roadmaps/ROADMAP_BI.md`](../roadmaps/ROADMAP_BI.md) | ✅ Bloco 18 | Roadmap do HUB BI — painel real, materialized views, cohorts, alertas |
| [`roadmaps/ROADMAP_MULTI_LOJA.md`](../roadmaps/ROADMAP_MULTI_LOJA.md) | ✅ Bloco 19 | Roadmap do HUB Multi-loja — isolamento, lint customizado, organização, transferências |
| [`sprints/TEMPLATE_SPRINT.md`](../sprints/TEMPLATE_SPRINT.md) | ✅ Bloco 20 | Template oficial de sprint (escopo fechado, DoD, diário, retro, imutabilidade) |
| [`audits/TEMPLATE_AUDITORIA.md`](../audits/TEMPLATE_AUDITORIA.md) | ✅ Bloco 21 | Template oficial de auditoria (P0/P1/P2/P3, findings, comparativo, imutabilidade) |
| [`ai/CURRENT_STATUS_OVERVIEW.md`](../ai/CURRENT_STATUS_OVERVIEW.md) | ✅ Bloco 22 | Overview enxuto do CURRENT_STATUS — mapa de maturidade por HUB em < 2 min |
| [`status/DIVIDA_TECNICA.md`](../status/DIVIDA_TECNICA.md) | ✅ Bloco 23a | Tracking vivo de dívida técnica (DT-NN, P0–P3, estado) |
| [`status/MOCKS_TRACKING.md`](../status/MOCKS_TRACKING.md) | ✅ Bloco 23b | Tracking vivo de mocks (MOCK-NN, tipo, risco) |
| [`status/RISCOS.md`](../status/RISCOS.md) | ✅ Bloco 23c | Tracking vivo de riscos (R-NN, probabilidade × impacto) |
| [`status/BLOCKERS.md`](../status/BLOCKERS.md) | ✅ Bloco 23d | Tracking vivo de blockers (BL-NN, mapa de dependência) |
| [`blueprint/MASTER_PLAN.md`](../blueprint/MASTER_PLAN.md) | ✅ Bloco 24 | Master Plan — visão única, 11 HUBs, 4 ondas, princípios |
| [`blueprint/PRODUCT_VISION.md`](../blueprint/PRODUCT_VISION.md) | ✅ Bloco 25 | Product Vision — personas, mercado, concorrência, diferenciais defensáveis |
| [`blueprint/MONETIZATION.md`](../blueprint/MONETIZATION.md) | ✅ Bloco 26 | Monetização — planos Bronze/Prata/Ouro/Diamante, créditos IA, gates, Stripe |
| [`architecture/INDEX.md`](../architecture/INDEX.md) | ✅ Bloco 27 | Arquitetura — índice oficial, camadas, padrões, áreas protegidas, como adicionar HUB |
| [`memory/OMNIGESTAO_MASTER_MEMORY.md`](../memory/OMNIGESTAO_MASTER_MEMORY.md) | ✅ Bloco 28 | Memória viva atualizada com pointer ao Sistema Operacional de Desenvolvimento |

---

## 🎉 Sistema Operacional de Desenvolvimento — 100% PERSISTIDO

Blocos 0 a 28 entregues e indexados. Toda IA/humano que abrir o projeto tem agora um caminho único e versionado: este índice → governança → estado real → roadmap por HUB → execução (sprints) → auditoria → decisões (ADRs).

---

## 🤖 Execution Engine — Skills Executoras Governadas (Onda I em entrega)

Camada de **execução semi-autônoma governada** sobreposta ao Sistema Operacional. Permite Claude Code, Cowork, Opus, Sonnet e Composer rodarem tarefas pequenas dentro de pipeline obrigatório (17 fases), com gates humanos e safe-guards mecânicos.

| Documento | Estado | Papel |
|-----------|--------|-------|
| [`execution/INDEX.md`](../execution/INDEX.md) | ✅ Bloco 29 | Entrada da camada, 4 modos (SAFE/COWORK/OVERNIGHT/AUDIT), 7 decisões fundadoras |
| [`execution/EXECUTION_ENGINE.md`](../execution/EXECUTION_ENGINE.md) | ✅ Bloco 29 | Pipeline oficial de 17 fases (INTAKE → NEXT INTAKE) |
| [`execution/SAFE_GUARDS.md`](../execution/SAFE_GUARDS.md) | ✅ Bloco 30 | Allow/deny-list, limites de tamanho, comandos proibidos, snapshot+rollback |
| [`execution/HUMAN_GATES.md`](../execution/HUMAN_GATES.md) | ✅ Bloco 30 | Gate #1 (proposta) + Gate #2 (merge), formato de aprovação, SLA |
| [`execution/SKILL_TAXONOMY.md`](../execution/SKILL_TAXONOMY.md) | ✅ Bloco 31 | 6 categorias de skill, matriz de elegibilidade por modo, skills proibidas |
| [`skills/executoras/TEMPLATE_SKILL.md`](./executoras/TEMPLATE_SKILL.md) | ✅ Bloco 32 | Template oficial — **front matter v1 CONGELADO** (mudança exige ADR) |
| [`skills/executoras/README.md`](./executoras/README.md) | ✅ Bloco 32 | Catálogo das skills por categoria + estado + como criar/modificar |
| [`status/EXECUTION_LOG.md`](../status/EXECUTION_LOG.md) | ✅ Bloco 32 | Log append-only de execuções — **schema v1 CONGELADO** |
| [`skills/executoras/research/SKILL_BENCHMARK_PDV.md`](./executoras/research/SKILL_BENCHMARK_PDV.md) | 🔄 Bloco 33 lote 1 | Benchmark contextual de PDV (Avantpro, Bling, Mercado Turbo, SAP, Lojinha do Brás) |
| [`skills/executoras/research/SKILL_BENCHMARK_OPERACOES_OS.md`](./executoras/research/SKILL_BENCHMARK_OPERACOES_OS.md) | 🔄 Bloco 33 lote 1 | Benchmark contextual de OS (OmniSys, Servicaa, Bling, Tiny, MaxiManager) |
| [`skills/executoras/research/SKILL_BENCHMARK_FINANCEIRO.md`](./executoras/research/SKILL_BENCHMARK_FINANCEIRO.md) | 🔄 Bloco 33 lote 1 | Benchmark contextual de Financeiro (ContaAzul, Omie, Bling, QuickBooks, Asaas) |
| [`skills/executoras/research/SKILL_BENCHMARK_ESTOQUE.md`](./executoras/research/SKILL_BENCHMARK_ESTOQUE.md) | 🔄 Bloco 33 lote 1 | Benchmark contextual de Estoque (Bling, Tiny, MercadoEnvios Full, NetSuite, Linx) |
| [`skills/executoras/research/SKILL_BENCHMARK_CRM.md`](./executoras/research/SKILL_BENCHMARK_CRM.md) | 🔄 Bloco 33 lote 2 | Benchmark contextual de CRM (HubSpot, RD Station CRM, Kommo, Salesforce, Pipedrive) |
| [`skills/executoras/research/SKILL_BENCHMARK_WHATSAPP.md`](./executoras/research/SKILL_BENCHMARK_WHATSAPP.md) | 🔄 Bloco 33 lote 2 | Benchmark contextual de WhatsApp (Zenvia, Kommo, Manychat, GoBots, Intercom + Meta docs) |
| [`skills/executoras/research/SKILL_BENCHMARK_MARKETPLACE.md`](./executoras/research/SKILL_BENCHMARK_MARKETPLACE.md) | 🔄 Bloco 33 lote 2 | Benchmark contextual de Marketplace — foco arquitetural (Mercado Turbo, Avantpro, Bling, Tiny, ANYMARKET, Ideris, Olist) |
| [`skills/executoras/research/SKILL_BENCHMARK_MARKETING_IA.md`](./executoras/research/SKILL_BENCHMARK_MARKETING_IA.md) | 🔄 Bloco 33 lote 2 | Benchmark contextual de Marketing IA (Jasper, Copy.ai, Canva Magic, CapCut Commerce, Mailchimp AI, Meta Ads Library) |
| [`skills/executoras/research/SKILL_BENCHMARK_OMNI_AGENT.md`](./executoras/research/SKILL_BENCHMARK_OMNI_AGENT.md) | 🔄 Bloco 33 lote 3 | Benchmark contextual de Omni Agent — foco governança/tool-use (Harvey, Devin, OpenHands, LangGraph, CrewAI, OpenAI Operator, Cursor Agent, Claude Code, n8n) |
| [`skills/executoras/research/SKILL_BENCHMARK_BI.md`](./executoras/research/SKILL_BENCHMARK_BI.md) | 🔄 Bloco 33 lote 3 | Benchmark contextual de BI — read-only (Power BI, Metabase, Superset, Looker, Mixpanel, Grafana, Tableau) |
| [`skills/executoras/research/SKILL_BENCHMARK_MULTI_LOJA.md`](./executoras/research/SKILL_BENCHMARK_MULTI_LOJA.md) | 🔄 Bloco 33 lote 3 | Benchmark contextual de Multi-loja — foco arquitetural/segurança (SAP B1, Linx, Omie, Tiny, NetSuite, Odoo Multi-company, ERPNext) |

---

## 🎉 Bloco 33 — Marco BENCHMARK

**11 SKILL_BENCHMARK_<HUB>** persistidas em `executoras/research/` (todas `draft v1`). Cobertura completa dos 11 HUBs do OmniGestão Pro.

## 🔄 Bloco 33 — AUDIT em construção

| Skill AUDIT | Estado | Lote |
|---|---|---|
| [`SKILL_AUDIT_PDV`](./executoras/research/SKILL_AUDIT_PDV.md) | 🔄 draft v1 | A (núcleo transacional) |
| [`SKILL_AUDIT_OPERACOES_OS`](./executoras/research/SKILL_AUDIT_OPERACOES_OS.md) | 🔄 draft v1 | A |
| [`SKILL_AUDIT_FINANCEIRO`](./executoras/research/SKILL_AUDIT_FINANCEIRO.md) | 🔄 draft v1 | A |
| [`SKILL_AUDIT_ESTOQUE`](./executoras/research/SKILL_AUDIT_ESTOQUE.md) | 🔄 draft v1 | A |
| [`SKILL_AUDIT_CRM`](./executoras/research/SKILL_AUDIT_CRM.md) | 🔄 draft v1 | B |
| [`SKILL_AUDIT_WHATSAPP`](./executoras/research/SKILL_AUDIT_WHATSAPP.md) | 🔄 draft v1 | B |
| [`SKILL_AUDIT_MARKETPLACE`](./executoras/research/SKILL_AUDIT_MARKETPLACE.md) | 🔄 draft v1 | B |
| [`SKILL_AUDIT_MARKETING_IA`](./executoras/research/SKILL_AUDIT_MARKETING_IA.md) | 🔄 draft v1 | B |
| [`SKILL_AUDIT_OMNI_AGENT`](./executoras/research/SKILL_AUDIT_OMNI_AGENT.md) | 🔄 draft v1 | C |
| [`SKILL_AUDIT_BI`](./executoras/research/SKILL_AUDIT_BI.md) | 🔄 draft v1 | C |
| [`SKILL_AUDIT_MULTI_LOJA`](./executoras/research/SKILL_AUDIT_MULTI_LOJA.md) | 🔄 draft v1 | C — **peça-chave do piloto** |
| [`SKILL_DOC_REFRESH`](./executoras/research/SKILL_DOC_REFRESH.md) | 🔄 draft v1 | encerra Bloco 33 — **primeira Research com write controlado** |

---

## 🎉 Bloco 33 — COMPLETO

**23 skills da camada Research** persistidas em `executoras/research/` (todas `draft v1`):
- **11 SKILL_BENCHMARK_<HUB>** — cobertura externa (mercado/concorrentes).
- **11 SKILL_AUDIT_<HUB>** — cobertura interna (estado real, evidência, P0–P3).
- **1 SKILL_DOC_REFRESH** — ponte de maintenance entre Research e Proposal.

## 🔄 Bloco 34 — Proposal Layer COMPLETA

| Skill Proposal | Estado | Output | Sensibilidade |
|---|---|---|---|
| [`SKILL_PROPOSE_SPRINT`](./executoras/proposal/SKILL_PROPOSE_SPRINT.md) | 🔄 draft v1 | `docs/sprints/proposals/SPRINT_PROPOSAL_<ID>.md` | Média (mais usada do fluxo padrão) |
| [`SKILL_PROPOSE_ADR`](./executoras/proposal/SKILL_PROPOSE_ADR.md) | 🔄 draft v1 | `docs/decisions/drafts/ADR_PROPOSAL_<ID>.md` | **Alta** (verifica duplicidade, blast radius, aprovação humana forte) |
| [`SKILL_PROPOSE_REFACTOR`](./executoras/proposal/SKILL_PROPOSE_REFACTOR.md) | 🔄 draft v1 | `docs/audits/proposals/REFACTOR_PROPOSAL_<ID>.md` | Baixa (refactor ≤ 200 linhas, 1 HUB) |

**Total skills runtime:** 26 (23 Research + 3 Proposal). Caminho aberto para **Bloco 35 — Execution Layer S**.

## 🔄 Bloco 35 — Execution Layer S COMPLETA

| Skill Execution | Estado | Diff max | Modos | Benchmark |
|---|---|---|---|---|
| [`SKILL_EXEC_FIX_MOCK`](./executoras/execution/SKILL_EXEC_FIX_MOCK.md) | 🔄 draft v1 | 200 linhas | SAFE+OVERNIGHT+COWORK | Não |
| [`SKILL_EXEC_DEBT_ITEM`](./executoras/execution/SKILL_EXEC_DEBT_ITEM.md) | 🔄 draft v1 | **500 linhas** | SAFE+OVERNIGHT+COWORK | Não — **piloto SPRINT_01_MULTI_LOJA** |
| [`SKILL_EXEC_FEATURE_S`](./executoras/execution/SKILL_EXEC_FEATURE_S.md) | 🔄 draft v1 | 500 linhas | SAFE+COWORK (**não OVERNIGHT**) | **Sim** (condicional) |
| [`SKILL_EXEC_STABILIZATION`](./executoras/execution/SKILL_EXEC_STABILIZATION.md) | 🔄 draft v1 | 300 linhas | SAFE+OVERNIGHT+COWORK | Não |
| [`SKILL_EXEC_TESTING`](./executoras/execution/SKILL_EXEC_TESTING.md) | 🔄 draft v1 | 400 linhas | SAFE+OVERNIGHT+COWORK | Não |

**Total skills runtime:** **31** (23 Research + 3 Proposal + 5 Execution S). **Camada Execution S completa.** Caminho aberto para piloto Multi-loja.

## 🔄 Pré-piloto — MVPs operacionais

| Item | Estado | Local | Função |
|---|---|---|---|
| [`docs/status/LOCKS.md`](../status/LOCKS.md) | ✅ MVP-v1 | `status/` | Serialização manual assistida (1 lock/HUB; sem heartbeat automático) |
| [`SKILL_HANDOFF_MVP`](./executoras/runtime/SKILL_HANDOFF_MVP.md) | 🔄 draft MVP-v1 | `executoras/runtime/` | Handoff curto + estruturado (Fase 16 do Engine); bridge para piloto |

**Total skills runtime após MVPs:** **32** (31 + SKILL_HANDOFF_MVP). Sistema pronto para approval batch + piloto Multi-loja.
