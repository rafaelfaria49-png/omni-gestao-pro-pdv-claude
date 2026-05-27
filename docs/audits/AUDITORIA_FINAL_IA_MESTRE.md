# Auditoria final — IA Mestre

> **Data:** 26 Mai 2026  
> **Modo:** somente leitura (nenhum código alterado nesta sessão)  
> **Referência:** `docs/audits/AUDITORIA_IA_MESTRE.md` (baseline pré-correções)  
> **Validação:** `npx tsc --noEmit` — **0 erros** · `npm run build` — **OK** (rotas `/api/ia-mestre/*`, `/api/ai/orchestrate`, `/dashboard/ia-mestre/*` presentes no manifest)

---

## 1. Escopo revalidado

| Área | Caminhos |
|------|----------|
| UI | `app/dashboard/ia-mestre/**`, `components/ia-mestre/**` |
| APIs chat | `app/api/ai/orchestrate/route.ts` |
| APIs conversas | `app/api/ia-mestre/conversations/route.ts`, `[id]/route.ts` |
| Créditos | `app/api/user/credits/**`, `app/api/credits/**`, `lib/credits/**`, `lib/ia-mestre/debit-turn-credits.ts`, `lib/ia-mestre/credit-costs.ts` |
| Guard / persistência | `lib/ia-mestre/api-guard.ts`, `lib/ia-mestre/persist-turn.ts`, `lib/ia-mestre/client-fetch.ts` |
| Auth créditos | `src/lib/auth/getUserId.ts` → `lib/credits/resolve-user-id.ts` |
| Permissões | `lib/auth/enterprise-permissions.ts`, `lib/auth/proxy-enterprise-dashboard.ts` |
| Imagem (adjacente) | `app/api/marketing/image/route.ts` (chamada pelo orchestrate em produção) |

---

## 2. Resumo executivo

As correções das fases recentes **fecharam os P0 originais do chat principal**: histórico fake removido, conversas/mensagens persistidas em `IaConversation`/`IaMessage`, débito real em `User.credits` com idempotência por `clientMessageId`, header de loja obrigatório, RBAC alinhado a `workspace.iaMestre`, `ModelSelect` coerente, e `userId` de créditos atrelado a `session.user.id` em produção.

O produto permanece **híbrido**: sub-rotas Projetos / Treinar / Configurações continuam **localStorage** com copy honesta; gerador dedicado está **“Em breve”**; imagem real no chat depende de `POST /api/marketing/image`, que **ainda exige `requireAdmin`** — desalinhado do RBAC do orchestrate para **GERENTE**.

**Veredito:** piloto interno / early adopters (**ADMIN + GERENTE** com login, loja ativa e créditos) no **chat texto + histórico por loja** — **sim**. SaaS “completo” (imagem para todos os perfis com `iaMestre`, projetos, treino no LLM, privacidade por usuário) — **não** sem itens P1 e migrations futuras.

---

## 3. Revalidação dos P0 da auditoria anterior

| ID original | Tema | Status pós-correções | Evidência |
|-------------|------|----------------------|-----------|
| AIM-P0-001 | Histórico fake no chat | **Resolvido** | `page.tsx` sem `INITIAL_MESSAGES`; empty state honesto |
| AIM-P0-002 | Persistência ausente | **Resolvido** | `prepareIaMestreTurn` / `saveIaMestreAssistantTurn`; APIs `GET /api/ia-mestre/conversations*` |
| AIM-P0-003 | Créditos não debitados | **Resolvido** | `validateIaMestreTurnCredits` + `debitIaMestreTurnAfterSuccess`; `Usage` + meta `creditsDebited` |
| AIM-P0-004 | storeId / multi-loja | **Resolvido** | `iaMestreStoreHeaders` + `guardIaMestreApi*`; `resolveActiveStoreId` sem `loja-1` na escrita |
| AIM-P0-005 | RBAC admin-only | **Resolvido** | `api-guard.ts` → `requireEnterpriseWith(..., p.workspace.iaMestre)` |
| AIM-P0-006 | ModelSelect quebrado | **Resolvido** | `DEFAULT_IA_MESTRE_MODEL = "openrouter/auto"` em `ModelSelect.tsx` |
| — | Gerador mock enganoso | **Mitigado (P1)** | `GeradorImagensView` — banner “Em breve”; chat gera imagem real |
| — | Projetos/treino LS enganoso | **Mitigado (P1)** | Badges “Local”; avisos em `MeusProjetosView` / `TreinarIaView` |
| — | Créditos divergentes 10/20 | **Resolvido (IA Mestre)** | Fonte única `lib/ia-mestre/credit-costs.ts`; `lib/credits.ts` permanece para vídeo/voz marketing |
| — | userId mock-admin | **Resolvido (prod)** | `lib/credits/resolve-user-id.ts` — prod só `session.user.id`; dev fallback |

### P0 residual (novo / não fechado)

| ID | Problema | Impacto | Prioridade |
|----|----------|---------|------------|
| AIM-P0-R01 | `POST /api/marketing/image` usa `requireAdmin` enquanto orchestrate libera **GERENTE** com `iaMestre` | Imagem pelo chat **falha em produção** para GERENTE (texto OK) | **P0 residual** *para paridade imagem* / **P1 bloqueante** se piloto incluir arte |
| AIM-P0-R02 | Conversas escopadas só por **`storeId`** (sem `userId` no schema) | Usuários da mesma loja veem/listam as mesmas threads | **P1** (privacidade) — exige migration futura, não P0 de honestidade |

**Conclusão P0:** não há P0 bloqueante para **fechar a fase de honestidade + persistência + créditos + RBAC + userId** no **chat texto**. Há **P0 residual** apenas se o critério de “pronto” incluir **imagem em produção para GERENTE**.

---

## 4. Fluxo real verificado (código)

### 4.1 Nova conversa → enviar → persistir

| Passo | Implementação | OK? |
|-------|---------------|-----|
| Nova conversa | `startNewConversation()` limpa estado; primeira mensagem cria `IaConversation` em `prepareIaMestreTurn` | Sim |
| `clientMessageId` | Obrigatório no orchestrate; UUID no cliente | Sim |
| Mensagem user | `iaMessage` role `user`, `meta.clientMessageId` | Sim |
| Mensagem assistant | `saveIaMestreAssistantTurn`, `meta.replyToClientMessageId` | Sim |
| Histórico LLM | `loadHistoryForLlm` do DB (últimas 18), não só array cliente | Sim |

### 4.2 Abrir / continuar conversa

| Passo | Implementação | OK? |
|-------|---------------|-----|
| Lista sidebar | `GET /api/ia-mestre/conversations` + `IaMestreChatContext` | Sim |
| Abrir thread | `GET /api/ia-mestre/conversations/[id]` + `loadConversation` | Sim |
| Cross-tenant | Queries com `where: { storeId }`; conversa inexistente na loja → 404 | Sim |
| Cross-user (mesma loja) | **Não** filtra por usuário — todas as conversas da loja visíveis | Risco P1 |

### 4.3 Créditos

| Passo | Implementação | OK? |
|-------|---------------|-----|
| Custo UI | `resolveIaMestreCreditCost` (texto 1 + surcharge premium; imagem 10) | Sim |
| Validação pré-LLM | `validateIaMestreTurnCredits` antes da chamada (exceto cache hit com resposta pronta) | Sim |
| Débito pós-sucesso | Após LLM OK ou imagem OK; falha LLM → 502 **sem** assistant nem débito | Sim |
| Idempotência | `meta.creditsDebited` + `debitClientMessageId`; retry mesmo `clientMessageId` → `duplicate: true` | Sim |
| 402 | `insufficient_credits` + mensagem; UI `interpretAiApiError` | Sim |
| Saldo UI | `useUserCredits` → `/api/user/credits` + `notifyCreditBalanceUpdated` após débito | Sim |
| userId prod | `resolveCreditsUserId()` → `session.user.id` | Sim |

### 4.4 Auth / loja / permissão

| Passo | Implementação | OK? |
|-------|---------------|-----|
| Sem login (prod) | `auth_required` no guard e no orchestrate (créditos) | Sim |
| Sem loja | `store_required` no guard; cliente bloqueia envio sem `lojaAtivaId` | Sim |
| Sem `iaMestre` | `forbidden_ia_mestre` (proxy UI + APIs) | Sim |
| GERENTE com permissão | `enterprise-permissions` — gerente herda `workspace.iaMestre: true` | Sim |
| OPERADOR/vendedor | `iaMestre: false` — bloqueado | Sim |
| Dev bypass | `NODE_ENV === "development"` pula enterprise no guard; créditos podem usar `mock-admin` | Documentado P2 |

### 4.5 Imagem pelo chat (produção)

| Passo | Implementação | OK? |
|-------|---------------|-----|
| Intent | `detectIntent` → branch imagem | Sim |
| Geração | `fetch('/api/marketing/image')` com header loja | Sim |
| Auth imagem | **`requireAdmin`** na rota marketing | **Falha para GERENTE** |
| Débito User.credits | 10 créditos após URL válida | Sim (se imagem gerar) |
| Débito loja Replicate | `marketingMediaCredits` se sem OpenAI key | Possível **dupla cobrança** P1 |

---

## 5. Bugs novos / riscos identificados

| ID | Tipo | Descrição | Prioridade |
|----|------|-----------|------------|
| AIM-N01 | Integração | Imagem prod: orchestrate (GERENTE) × marketing/image (ADMIN) | **P1** (bloqueante imagem GERENTE) |
| AIM-N02 | Privacidade | Threads por loja, não por usuário | **P1** (migration) |
| AIM-N03 | Billing | Imagem: `User.credits` + `marketingMediaCredits` (Replicate) | **P1** |
| AIM-N04 | Persistência | Falha LLM após `prepare`: mensagem user fica sem assistant (502) | **P2** |
| AIM-N05 | Idempotência | Novo `clientMessageId` em retry manual → segunda mensagem user no DB | **P2** |
| AIM-N06 | UX | `ChatInput`: paperclip / imagem / mic sem handler | **P2** |
| AIM-N07 | Layout | `IaMestreClientLayout` `h-screen` vs regra AppShell | **P2** |
| AIM-N08 | UI legada | `components/dashboard/ia-mestre/ia-sidebar.tsx` ainda referencia 2405 créditos (se montado) | **P2** |
| AIM-N09 | Config sub-rota | `ConfiguracoesIaView` — histórico/compra mock em LS (rotulado) | **P1** honestidade |
| AIM-N10 | Créditos legados | Saldo em `mock-admin` / cookie antigo não migra para `AdminUser.id` | **P1** |
| AIM-N11 | Dev | Bypass de permissão no guard em development | **P2** |
| AIM-N12 | Race | Duas requisições paralelas mesmo `clientMessageId` (janela antes do assistant) | **P2** baixa |

Não foi encontrada **dupla cobrança** no mesmo turno com o mesmo `clientMessageId` (transação + meta).

---

## 6. Comparativo produto vendável

| Capacidade | Piloto hoje | P1 | P2 / migration |
|------------|-------------|-----|----------------|
| Chat LLM + estoque loja | ✅ | — | — |
| Histórico persistido por loja | ✅ | Privacidade por usuário | `userId` em `IaConversation` |
| Créditos auditáveis (Usage) | ✅ | Compra real / Stripe | — |
| RBAC GERENTE texto | ✅ | Alinhar `marketing/image` | — |
| Imagem chat GERENTE prod | ❌ | AIM-N01 | — |
| Projetos / pastas | LS mock | Persistir ou esconder | — |
| Treino → prompt | LS mock | `StoreSettings` | — |
| Gerador dedicado | Em breve | Unificar com chat | — |
| Config modelo global | LS mock | `PUT settings` aiMestreModel | — |
| Multimodal (upload/vision) | Botões mortos | — | P2 |

---

## 7. Matriz de achados (consolidada)

**P0 original (10 itens auditados):** 8 **resolvidos**, 2 **mitigados** (sub-rotas com label honesto).

**P0 bloqueante restante para escopo “fase atual” (honestidade + persistência + créditos + RBAC + userId):** **nenhum**.

**P0/P1 bloqueante se escopo incluir imagem GERENTE em produção:** **AIM-P0-R01 / AIM-N01**.

**P1 restantes (9):** imagem×RBAC marketing, privacidade threads, dupla cobrança mídia, config/projetos/treino LS, créditos legados não migrados, docs desatualizadas (`AUDITORIA_2026-05-24`), orchestrator labels Veo/Perplexity não executados, `h-screen` layout.

**P2 restantes (6+):** botões ChatInput, nova conversa já OK, dev bypass, retry duplicate user msg, tema IA Mestre não montado, botão Upgrade sidebar (link créditos existe indiretamente).

---

## 8. Validações técnicas

| Comando | Resultado |
|---------|-----------|
| `npx tsc --noEmit` | **0 erros** |
| `npm run build` | **Sucesso** nesta sessão (~169s, exit 0). Rotas IA Mestre e créditos listadas no manifest. |

*(Em execuções anteriores no mesmo ambiente Windows houve **EPERM** no Prisma e lock “Another next build process is already running” — classificar como lock de ambiente, não defeito da app.)*

---

## 9. Veredito final

| Pergunta | Resposta |
|----------|----------|
| **Ainda há P0?** | **Não** para fechar a fase pedida (chat honesto, DB, créditos, RBAC, userId real). **Sim (residual)** se “pronto” = imagem em prod para **GERENTE** sem ser ADMIN. |
| **Fase atual pode ser fechada?** | **Sim** — critérios de honestidade operacional, persistência de conversas, débito unificado, RBAC `iaMestre`, e `session.user.id` em produção estão implementados e coerentes no código. |
| **Piloto vendável?** | **Piloto limitado:** lojas com ADMIN/GERENTE, chat + histórico por unidade, billing por usuário logado. Comunicar limites: imagem GERENTE, threads compartilhadas na loja, sub-módulos locais. |
| **Próximo marco** | (1) Alinhar auth de `marketing/image` ao guard IA Mestre; (2) migration `userId` em conversas; (3) unificar ou documentar créditos de mídia vs `User.credits`. |

---

## 10. Referência rápida — arquivos críticos pós-correções

| Função | Arquivo |
|--------|---------|
| Orquestração + créditos | `app/api/ai/orchestrate/route.ts` |
| Guard loja + RBAC | `lib/ia-mestre/api-guard.ts` |
| Persistência turno | `lib/ia-mestre/persist-turn.ts` |
| Débito idempotente | `lib/ia-mestre/debit-turn-credits.ts` |
| Tabela de custos | `lib/ia-mestre/credit-costs.ts` |
| userId créditos | `lib/credits/resolve-user-id.ts` |
| Lista/abre conversa | `app/api/ia-mestre/conversations/*` |
| UI chat | `app/dashboard/ia-mestre/page.tsx` |

---

*Documento gerado em modo auditoria somente leitura. Nenhum arquivo de produção foi modificado nesta tarefa.*
