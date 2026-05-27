# Auditoria IA Mestre

> **Data:** 26 Mai 2026  
> **Modo:** somente leitura (nenhum código alterado)  
> **Validação:** `npx tsc --noEmit` — 0 erros · `npm run build` — OK (97 rotas app geradas, incluindo `/dashboard/ia-mestre/*` e `/api/ai/*`)

---

## 1. Escopo analisado

| Área | Caminhos |
|------|----------|
| Rotas UI | `app/dashboard/ia-mestre/` (chat, `projetos`, `gerador-imagens`, `treinar`, `configuracoes`, `layout`) |
| Componentes | `components/ia-mestre/**` (15 arquivos ativos) |
| APIs IA | `app/api/ai/orchestrate`, `app/api/ai/processar-texto-financeiro` |
| APIs adjacentes | `app/api/marketing/image`, `app/api/user/credits`, `app/api/user/credits/history`, `app/api/credits/*` |
| Serviços / lib | `services/ai-mestre-reply.ts`, `services/ai-orchestrator.ts`, `lib/ai-model-policy.ts`, `lib/aiOrchestrator.ts`, `lib/ai-models-list.ts`, `lib/ai/processar-texto-financeiro.ts`, `lib/credits.ts`, `lib/deductCredits.ts`, `lib/validateCredits.ts`, `src/lib/ai/credit-costs.ts` |
| Persistência | `prisma/schema.prisma` — modelos `IaConversation`, `IaMessage`, `Usage`, `User.credits`, `marketingMediaJob` |
| Permissões | `lib/auth/enterprise-permissions.ts`, `lib/auth/proxy-enterprise-dashboard.ts` |
| Config global | `components/configuracoes-v3/.../IaSection.tsx`, `IntegracoesSection.tsx` |
| Docs | `docs/ai/AUDITORIA_2026-05-24.md`, `docs/audits/AUDITORIA_SETTINGS_V3_RUNTIME.md`, `docs/memory/OMNIGESTAO_MASTER_MEMORY.md` |
| **Fora do escopo de código** | `app/api/ia-mestre/**` — **não existe** no repositório |
| **Artefato legado (não contado como produção)** | `components/pdv-github-original/**/ia-mestre*` — cópia histórica |

**Arquivos de produção lidos/analisados:** **42** (código + rotas) + **5** documentos de referência.

---

## 2. Resumo executivo

A **IA Mestre** entrega uma **UI premium e navegável** (chat, projetos, gerador, treino, configurações, templates, painel de documento), mas o produto está em estado **híbrido forte**: o **único fluxo com LLM real de ponta a ponta** é o **chat principal** via `POST /api/ai/orchestrate`, com contexto parcial de estoque Prisma e geração de imagem real em produção (proxy para `POST /api/marketing/image` / DALL·E). **Tudo o mais** — histórico de conversas, projetos, treinamento, créditos na sidebar, gerador dedicado, configurações de modelo — é em grande parte **mock, localStorage ou decorativo**.

**Veredito curto:** demonstração vendável como **piloto interno admin**; **não** como produto SaaS multi-loja com histórico, créditos auditáveis e paridade com ChatGPT/Claude Projects sem refatoração estrutural.

**Divergência crítica de documentação:** `docs/ai/AUDITORIA_2026-05-24.md` §3.11 afirma conversas com persistência real `IaConversation`/`IaMessage` — **no código da aplicação não há nenhum `prisma.iaConversation` / `iaMessage`** (grep zero matches fora do schema).

---

## 3. Estado atual da IA Mestre

| Superfície | Classificação | Nota |
|------------|---------------|------|
| **Conversas (chat)** | **Parcial / funcional** | LLM real + histórico só em memória React; seed fake; sem criar/listar conversa no DB |
| **Templates Mágicos** | **Real (UX)** | Prompts estáticos → preenchem o draft; sem backend |
| **Gerador de Imagens (sub-rota)** | **Mock** | SVG placeholder + `localStorage`; não chama API |
| **Gerador via chat** | **Parcial / real** | `detectIntent` → imagem real em prod (`marketing/image` ou DALL·E em dev) |
| **Meus Projetos** | **Mock / localStorage** | 12 cards seed; CRUD local; “Abrir” só banner no chat |
| **Treinar IA** | **Mock** | `localStorage`; simulação local; **não** injetado no `orchestrate` |
| **Configurações** | **Mock / localStorage** | Abas ricas; modelo/temperatura **não** ligados à API do chat |
| **Créditos (sidebar + config)** | **Decorativo / divergente** | Números fixos ou LS; API real só no hook do chat (`useUserCredits`) |
| **Editor de documentos (RightPanel)** | **Parcial** | Copiar/PDF/CSV client-side; conteúdo vindo da resposta longa do chat |
| **Integração ERP (estoque)** | **Parcial / real** | Até 120 produtos da loja no `orchestrate` |
| **Omni Agent** | **Separado** | Sem LLM; não compartilha inbox com IA Mestre |
| **Marketing IA** | **Hub separado** | APIs `marketing/*` compartilham imagem/créditos de mídia, não o “cérebro” do chat |

---

## 4. Mapa de arquivos e rotas

### 4.1 Rotas Next.js

| Rota | Arquivo | Função |
|------|---------|--------|
| `/dashboard/ia-mestre` | `app/dashboard/ia-mestre/page.tsx` | Chat + templates sheet + RightPanel |
| `/dashboard/ia-mestre/projetos` | `app/dashboard/ia-mestre/projetos/page.tsx` → `MeusProjetosView` | Grid de projetos |
| `/dashboard/ia-mestre/gerador-imagens` | `gerador-imagens/page.tsx` → `GeradorImagensView` | Formulário imagem mock |
| `/dashboard/ia-mestre/treinar` | `treinar/page.tsx` → `TreinarIaView` | Formulário treino mock |
| `/dashboard/ia-mestre/configuracoes` | `configuracoes/page.tsx` → `ConfiguracoesIaView` | Preferências mock |
| Layout | `layout.tsx` → `IaMestreClientLayout` | Sidebar + `ThemeProvider` local |

### 4.2 APIs

| Endpoint | Uso IA Mestre |
|----------|----------------|
| `POST /api/ai/orchestrate` | **Principal** — texto + imagem (intent) |
| `POST /api/ai/processar-texto-financeiro` | **Adjacente** — parser financeiro (não é chat Mestre) |
| `POST /api/marketing/image` | Imagem em **produção** chamada pelo orchestrate |
| `GET/POST /api/user/credits` | Saldo usuário (chat usa `useUserCredits`) |
| `GET /api/user/credits/history` | Histórico real `Usage` (Config V3 / IaSection) |
| `GET /api/credits/history` | Alternativa legada |
| **Inexistente** | `app/api/ia-mestre/**` |

### 4.3 Modelos Prisma (existem, uso na app)

| Modelo | Usado pela IA Mestre UI? |
|--------|---------------------------|
| `IaConversation` / `IaMessage` | **Não** (schema pronto, zero writers/readers) |
| `User.credits` + `Usage` | **Parcial** — leitura no chat; **sem** `deductCredits` no orchestrate |
| `StoreSettings.marketingMediaCredits` + `MarketingMediaJob` | **Sim** — rota `marketing/image` (imagem chat em prod) |
| `StoreSettings.printerConfig.aiMestreModel` | **Leitura** no orchestrate; **sem writer** na UI Mestre |

---

## 5. O que já é real e funcional

1. **Chat com LLM** — `POST /api/ai/orchestrate` monta system prompt, histórico (últimas 18 mensagens do cliente), chama OpenRouter ou OpenAI conforme modelo; fallback Gemini/OpenAI em `composeMestreUserMessage`.
2. **Contexto de estoque** — `prisma.produto.findMany({ where: { storeId }, take: 120 })` injetado no prompt via `composeMestreUserMessage`.
3. **Política de plano/modelo** — `pickMestreModel` trava modelos em plano não-ouro; lê `printerConfig.aiMestreModel` da loja.
4. **Geração de imagem pelo chat (prod)** — `detectIntent` → `fetch('/api/marketing/image')` com header de loja; persiste `marketingMediaJob`.
5. **Geração de imagem (dev)** — DALL·E direto no orchestrate quando `NODE_ENV === 'development'`.
6. **Classificador de intent (orquestrador)** — `services/ai-orchestrator.ts` heurístico (texto/imagem premium/vídeo/pesquisa) com bloqueio `premium_required`.
7. **Templates Mágicos** — biblioteca de prompts por domínio (vendas/estoque/financeiro).
8. **RightPanel** — export PDF (print), CSV, copiar texto gerado.
9. **Permissão de menu** — `enterprise-permissions.workspace.iaMestre` + proxy bloqueia rota.
10. **Tratamento de erro HTTP** — `interpretAiApiError` (402/429/403/5xx) no chat.
11. **Configurações V3 (IaSection)** — saldo e histórico via APIs reais (`/api/user/credits`, histórico).

---

## 6. O que é mock/parcial/decorativo

| Item | Evidência |
|------|-----------|
| Mensagens iniciais do chat | `INITIAL_MESSAGES` — Unsplash, “Rafael”, “+18% vendas” (`page.tsx` ~42–64) |
| Metadados da conversa | “Conversa #2487”, “RafaCell · Pro” (`page.tsx` ~395, `Sidebar.tsx` ~102) |
| Chats recentes sidebar | Array fixo `RECENT_CHATS`; lixo sem handler (`Sidebar.tsx` ~30–37, ~184–190) |
| Badge “12 projetos” | Hardcoded (`Sidebar.tsx` ~23) |
| Créditos sidebar | Default `2405/5000` + `ia-mestre-config-v1` LS (`Sidebar.tsx` ~45–46) |
| Gerador de Imagens (página) | `buildPlaceholderDataUrl`, toast “mock” (`GeradorImagensView.tsx`) |
| Projetos | `seedProjetos()` + LS `ia-mestre-projetos-v1` (`MeusProjetosView.tsx`) |
| Treinar | `simulateReply`, badge “Mock” (`TreinarIaView.tsx`) |
| Configurações | `DEFAULT_HISTORY`, compra simulada, export `ia-mestre-dados-mock.json` (`ConfiguracoesIaView.tsx`) |
| Botão “Nova conversa” | Sem `onClick` (`page.tsx` ~373–375) |
| Botões ChatInput | Paperclip, imagem, mic sem ação (`ChatInput.tsx` ~36–39) |
| Toast “Comprar créditos em breve” | `page.tsx` ~301–304 |
| Modelo em Config | `modelChoice` não enviado ao orchestrate |
| ThemeSwitcher | Arquivo existe mas **não** montado no layout; usa `components/theme/ThemeProvider`, não o da IA Mestre |

---

## 7. Bugs e riscos encontrados

### Tabela de achados (amostra representativa — lista completa nas seções 8–11)

| ID | Arquivo | Linha ~ | Problema | Impacto | Recomendação | Prioridade |
|----|---------|---------|----------|---------|--------------|------------|
| AIM-P0-001 | `app/dashboard/ia-mestre/page.tsx` | 42–64, 206 | Chat inicia com histórico **fictício** (vendas +18%, imagem Unsplash) | Usuário acredita em dados/gerações reais | Remover seed ou marcar “exemplo”; empty state honesto | **P0** |
| AIM-P0-002 | `prisma/schema.prisma` + codebase | 521–564 | `IaConversation`/`IaMessage` **sem API/UI** | Promessa de histórico persistido é falsa; doc desatualizada | CRUD conversas + persistir mensagens no send | **P0** |
| AIM-P0-003 | `app/api/ai/orchestrate/route.ts` | 244–417 | **Sem** `deductCredits` / `validateCredits` em texto ou imagem | Custo OpenRouter/OpenAI ilimitado; UI mente consumo | Debitar `Usage` + 402 antes da chamada LLM | **P0** |
| AIM-P0-004 | `app/dashboard/ia-mestre/page.tsx` | 274–278 | `fetch` orchestrate **sem** `x-assistec-loja-id` | `storeId` pode cair em cookie/`loja-1` — estoque/contexto errado | Enviar header da loja ativa em toda mutação | **P0** |
| AIM-P0-005 | `app/api/ai/orchestrate/route.ts` | 245–250 | Produção exige `requireAdmin` | GERENTE/OPERADOR com `iaMestre` no menu **não** usam chat em prod | `requireAuth` + permissão enterprise, não só ADMIN | **P0** |
| AIM-P0-006 | `components/ia-mestre/ModelSelect.tsx` + `page.tsx` | 49–53, 204 | Default `openai/gpt-5.5-pro` **fora** de `MODELS[]` | Selector pode renderizar só skeleton pulsante | Alinhar default a ID do mosaico (`openrouter/auto` ou item da lista) | **P0** |
| AIM-P1-001 | `components/ia-mestre/views/GeradorImagensView.tsx` | 124–169 | Sub-rota **100% mock** enquanto chat gera imagem real | Operador confunde telas; crédito LS falso | Unificar com `marketing/image` ou desabilitar com banner | **P1** |
| AIM-P1-002 | `components/ia-mestre/views/TreinarIaView.tsx` | 108–115 | Treino só `localStorage`; orchestrate ignora | “Brand voice” não reflete negócio treinado | Persistir em `StoreSettings` e injetar no system prompt | **P1** |
| AIM-P1-003 | `components/ia-mestre/views/MeusProjetosView.tsx` | 353–354 | “Abrir” não carrega mensagens do projeto | Projetos são pastas decorativas | `conversationId` + mensagens DB ou desabilitar | **P1** |
| AIM-P1-004 | `components/ia-mestre/views/ConfiguracoesIaView.tsx` | 313–360 | `modelChoice` / temperatura / tamanho **não** vão ao backend | Configuração enganosa | Salvar `aiMestreModel` + params no `PUT settings` | **P1** |
| AIM-P1-005 | `src/lib/ai/credit-costs.ts` vs `lib/credits.ts` | 1–12 vs 3–9 | Custo imagem **10** (UI) vs **20** (`getCost`) | Toasts e cobrança divergentes | Fonte única de custos | **P1** |
| AIM-P1-006 | `app/dashboard/ia-mestre/page.tsx` | 330–340 | Toast de créditos consumidos **sem** débito API | Falsa sensação de billing | Debitar antes ou remover toast | **P1** |
| AIM-P1-007 | `services/ai-orchestrator.ts` | 71–177 | Labels Veo/Perplexity/Lyria **não** executados | UI/marketing promete capacidades inexistentes | Implementar ou remover do roteador público | **P1** |
| AIM-P1-008 | `components/ia-mestre/IaMestreClientLayout.tsx` | 9 | `h-screen` no hub | Conflito com regra AppShell scroll único | `min-h-0 flex-1` sem `h-screen` | **P1** |
| AIM-P1-009 | `docs/ai/AUDITORIA_2026-05-24.md` | 292–300 | Afirma conversas/imagens “COMPLETAS” persistidas | Onboarding IA errado | Atualizar doc após correção | **P1** |
| AIM-P2-001 | `app/dashboard/ia-mestre/page.tsx` | 373–375 | “Nova conversa” sem handler | UX quebrada | Reset state + opcional nova `IaConversation` | **P2** |
| AIM-P2-002 | `components/ia-mestre/Sidebar.tsx` | 220–226 | “Upgrade” sem ação | Botão morto | Link `/dashboard/creditos` ou billing | **P2** |
| AIM-P2-003 | `components/ia-mestre/ChatInput.tsx` | 36–39 | Anexo / mic / imagem sem handler | Expectativa de multimodal | Implementar ou ocultar | **P2** |
| AIM-P2-004 | `components/ia-mestre/ThemeSwitcher.tsx` | 5 | Importa ThemeProvider **global**; não usado no layout | Temas Light/Soft Ice/Midnight/Black da IA Mestre incompletos | Montar switcher com `ia-mestre/ThemeProvider` | **P2** |
| AIM-P2-005 | `app/api/ai/orchestrate/route.ts` | 248–250 | Bypass admin em `development` | Risco se build “dev” em staging | Flag explícita `ALLOW_IA_MESTRE_DEV_BYPASS` | **P2** |
| AIM-P2-006 | — | — | Dois “centros IA” (Mestre vs Omni Agent vs Marketing) | Confusão de produto | Mapa de papéis no menu/docs | **P2** |

**Contagem de prioridades (achados catalogados):** **P0: 6** · **P1: 9** · **P2: 6** (total **21** IDs; achados adicionais menores absorvidos nas seções 8–9).

---

## 8. Botões/cards sem ação real

| Elemento | Local | Comportamento real |
|----------|-------|-------------------|
| Nova conversa | `page.tsx` header | Nenhum |
| Upgrade (créditos) | `Sidebar.tsx` | Nenhum |
| Excluir chat recente | `Sidebar.tsx` | Ícone sem `onClick` |
| Paperclip / Imagem / Mic | `ChatInput.tsx` | Nenhum |
| Comprar créditos (toast action) | `page.tsx` | Toast “em breve” |
| Salvar (resposta padrão treino) | `TreinarIaView.tsx` | Toast “Salvo (local)” apenas |
| Fixar imagem | `GeradorImagensView.tsx` | Toast mock |
| Desativar IA Mestre | `ConfiguracoesIaView.tsx` | Toast mock |
| Cards KPI sidebar créditos | `Sidebar.tsx` | LS / defaults, não `GET /api/user/credits` |

---

## 9. Integrações LLM/OpenRouter/OpenAI/Gemini

| Provedor | Onde | Estado |
|----------|------|--------|
| **OpenRouter** | `orchestrate` (`llmTextReply`), `composeMestreUserMessage` | **Real** se `OPENROUTER_API_KEY` |
| **OpenAI** | Chat (modelos sem `/`), fallback em `ai-mestre-reply`, DALL·E dev/prod | **Real** se `OPENAI_API_KEY` |
| **Gemini** | Fallback em `geminiFallbackCompleteMestre` | **Real** se `resolveLlmEnv()` → gemini |
| **Replicate/Flux** | `marketing/image` quando sem OpenAI | **Real** opcional |
| **Gemini no orchestrator label** | `classifyUserCommand` → `gemini_3_flash` | **Nome de produto**; execução passa pelo pipeline acima |
| **Perplexity / Veo / Lyria** | Só classificação em `ai-orchestrator.ts` | **Não implementados** na resposta |

**OpenRouter:** não há `lib/openrouter` dedicado; URLs e headers inline.

**Relação Marketing IA:** imagem compartilha `POST /api/marketing/image` e créditos `marketingMediaCredits` (loja), não o saldo `User.credits` do chat.

**Relação WhatsApp IA:** `lib/whatsapp/ai-conversation-analysis.ts` — pipeline separado; sem inbox unificado com IA Mestre.

**Relação Omni Agent:** determinístico, sem LLM; sem bridge para `orchestrate`.

**`processar-texto-financeiro`:** API útil ao financeiro; **não** integrada ao hub Mestre.

---

## 10. Créditos, custos e limites

| Mecanismo | Escopo | Usado pelo chat Mestre? |
|-----------|--------|-------------------------|
| `User.credits` + `deductCredits` | Usuário | **Não** no orchestrate (só marketing/video em outras rotas) |
| `marketingMediaCredits` | Loja | **Sim** para imagem via `marketing/image` (se sem OpenAI key) |
| `src/lib/ai/credit-costs.ts` | UI toast chat imagem | Exibe 10; **não debita** |
| `lib/credits.ts` `getCost` | validate/deduct | image=20; **não chamado** pelo Mestre |
| Sidebar / Config LS | Browser | Falso compartilhado entre abas |

**Limites:** sem rate limit diário no orchestrate; sem teto por loja/usuário na rota principal.

**Histórico auditável:** `Usage` existe e é exposto em `/api/user/credits/history`, mas **ações do Mestre não gravam** linhas novas hoje.

---

## 11. Segurança e multi-loja

| Tópico | Avaliação |
|--------|-----------|
| Chaves LLM | **Server-side** (`process.env`) — OK |
| Auth rota orchestrate (prod) | **ADMIN/SUPER_ADMIN** apenas — restritivo demais para RBAC enterprise |
| Auth `marketing/image` | `requireAdmin` — alinhado ao orchestrate em prod |
| `storeId` no chat | **Risco:** fetch sem header; leitura via cookie → possível `loja-1` (`storeIdFromAssistecRequestForRead`) |
| Persistência conversas | Sem vazamento cross-store porque **não persiste** |
| Upload avatar config | Base64 em LS — só cliente |
| Dev bypass | `NODE_ENV === 'development'` pula admin no orchestrate |

---

## 12. Comparação com IAs modernas do mercado

| Recurso (mercado) | IA Mestre hoje |
|-------------------|----------------|
| ChatGPT / Claude **Projects** + pastas | Projetos **mock** (LS) |
| **Memória** por empresa/cliente | Treino LS; não no LLM |
| **Upload** PDF/imagem no chat | Botões sem ação |
| **Análise de imagem** (vision) | Não |
| **Geração de imagem** | Real no chat (prod); página dedicada mock |
| **Pesquisa web** / Perplexity | Classificado, não executado |
| **Agentes / tools** (ERP actions) | Omni Agent separado (regex), não tools LLM |
| **Histórico** organizado | Lista fake; sem DB |
| **Templates** | Sim (Templates Mágicos) |
| **Controle de custos** | Parcial/inconsistente |
| **Permissões por papel** | Menu sim; API admin-only em prod |
| **Logs auditáveis** | `Usage` não alimentado pelo Mestre |
| **Vídeo** (futuro) | Classificador menciona Veo; sem rota |

---

## 13. O que falta para virar produto vendável

1. Persistência real de conversas/mensagens (`IaConversation` + APIs + UI lista).
2. Débito e limites de créditos unificados (texto/imagem) com histórico `Usage`.
3. Multi-loja explícita em todas as chamadas (`x-assistec-loja-id`).
4. RBAC: GERENTE/OPERADOR com quota, não só ADMIN na API.
5. Unificar gerador de imagens com `marketing/image` e galeria persistida.
6. Treino/brand voice em `StoreSettings` aplicado ao system prompt.
7. Projetos = conversas agrupadas com continuidade de histórico.
8. Remover/decular UI enganosa (seeds, números fixos, badges falsos).
9. Model picker alinhado a `AI_MODELS_MOSAIC` + persistência `aiMestreModel`.
10. Documentação e marketing alinhados ao que executa (sem Veo/Perplexity até existir).

---

## 14. Priorização P0/P1/P2

### P0 — Bloqueia confiança operacional ou multi-loja

- AIM-P0-001 a AIM-P0-006 (histórico fake, schema órfão, sem débito créditos, storeId, RBAC API, ModelSelect quebrado).

### P1 — Produto incompleto mas usável em piloto admin

- Gerador mock vs chat real, treino/projetos/config desconectados, custos divergentes, toast falso de crédito, orchestrator promete features inexistentes, `h-screen`, doc desatualizada.

### P2 — UX, polish, governança

- Botões mortos, temas, bypass dev, narrativa multi-hub IA.

---

## 15. Sequência recomendada de correção

1. **Honestidade imediata (baixo risco):** remover `INITIAL_MESSAGES` fake; banners “demo” nas abas mock; corrigir ModelSelect default.
2. **Multi-loja + auth:** header loja no `fetch`; relaxar `requireAdmin` → permissão `iaMestre` + sessão.
3. **Créditos:** `validateCredits`/`deductCredits` no orchestrate; uma tabela de custos; toasts só após débito.
4. **Persistência:** API CRUD `IaConversation`/`IaMessage`; “Nova conversa” + sidebar lista real.
5. **Projetos:** `projectId` / título em conversa; abrir projeto carrega thread.
6. **Treino:** salvar em `StoreSettings`; merge no system prompt quando `brandVoice` on.
7. **Gerador:** reutilizar `POST /api/marketing/image` + listagem GET jobs.
8. **Config:** sincronizar modelo com `printerConfig.aiMestreModel` (writer no save do chat/config).
9. **Docs:** corrigir `AUDITORIA_2026-05-24` e `CURRENT_STATUS` quando estado mudar.

---

## 16. Veredito final

A IA Mestre é um **front-end de alta qualidade** acoplado a um **núcleo estreito** (`/api/ai/orchestrate`) ainda em fase **piloto/admin**: chat textual e imagem podem funcionar de verdade com chaves e perfil admin, mas **não** entrega o pacote completo prometido pela UI (projetos, treino, histórico, créditos coerentes, gerador dedicado, modelos configuráveis).

**Classificação de maturidade:** **Alpha+ / piloto interno** — não **Beta SaaS** multi-tenant.

**Pronto para:** demonstração comercial com ressalvas escritas; uso interno por administradores com monitoramento de custo API.

**Não pronto para:** venda como “IA central do ERP” com memória, projetos e billing fechados.

---

*Relatório gerado em auditoria somente leitura. `docs/ai/CURRENT_STATUS.md` não foi alterado (mudança de estado do módulo deve ocorrer após implementação das correções).*
