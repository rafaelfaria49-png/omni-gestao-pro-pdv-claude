# Auditoria final — WhatsApp HUB + CRM

**Data:** 26/05/2026  
**Escopo:** somente leitura de código (sem alterações).  
**Commits recentes auditados:** `2602697` … `1ba2c6c` (vínculo telefone, LLM, polimentos, P0 agentic, encerramento fase).  
**Rota de produção:** `/dashboard/whatsapp` → `WhatsAppOperationalHub` → `WhatsAppInbox`.

---

## Resumo executivo

| Item | Resultado |
|------|-----------|
| Arquivos analisados (`.ts` / `.tsx` no escopo) | **89** |
| `npx tsc --noEmit` | **OK** (exit 0, 26/05/2026) |
| `npm run build` | **OK** (exit 0, Next.js 16.2.0 webpack) |
| **Veredito** | **Parcialmente pronto** — HUB operacional real para piloto; backend e hubs paralelos ainda com gaps |

O fluxo principal em `/dashboard/whatsapp` usa Prisma + Meta Cloud API + CRM real + LLM server-side com fallback local honesto. Permanecem riscos de **API sem auth**, fallback `loja-1` em leituras backend, automações simuladas no servidor, e **três superfícies de UI** com comportamentos distintos.

---

## 1. Inventário de arquivos analisados

| Pasta | Arquivos | Observação |
|-------|----------|------------|
| `app/dashboard/whatsapp` | 3 | `page.tsx`, `loading.tsx`, `error.tsx` |
| `components/whatsapp` (operacional) | 9 | Inbox, contexto, insights, automações, IA, hooks, agentic-ui |
| `components/whatsapp/lovable` | 54 | Kit Lovable + `WhatsAppHub.tsx` + `mockData.ts` + shadcn |
| `components/dashboard/whatsapp-automation` | 1 | `whatsapp-automation-hub.tsx` |
| `app/api/whatsapp` | 17 | Rotas REST do HUB |
| `lib/whatsapp` | 5 | Serviço, send, LLM, fallback local, deep link clientes |
| **Total escopo** | **89** | |

**Integração CRM (fora do escopo de pasta, usada pelo HUB):**

- `app/api/clientes/match-by-phone/route.ts`
- `app/api/clientes/[id]/route.ts`
- `app/dashboard/clientes/ClientesPageClient.tsx` (`?q=` na URL)

**Webhook (ingress real, referência):**

- `app/api/webhooks/whatsapp/route.ts`
- `app/api/whatsapp/webhook/route.ts` (legado)
- `lib/whatsapp-meta-cloud-webhook.ts`

---

## 2. O que já é runtime real

### 2.1 HUB operacional (`/dashboard/whatsapp`)

| Capacidade | Persistência | Evidência |
|------------|--------------|-----------|
| Listar conversas / mensagens | Prisma | `GET /api/whatsapp/conversations`, `GET /api/whatsapp/messages`; polling 5s |
| Enviar mensagem à Meta | Cloud API + Prisma | `POST /api/whatsapp/send` → `sendCloudApiTextAndRecord` |
| Receber mensagens | Webhook Meta → Prisma | `app/api/webhooks/whatsapp` → `processMetaWhatsAppWebhookPayload` |
| Modo humano / unread | Prisma | `PATCH /api/whatsapp/conversations/[id]` |
| Etiquetas / QR | Prisma | `/api/whatsapp/etiquetas`, `/api/whatsapp/conversations/[id]/etiquetas` |
| Respostas rápidas | Prisma | `/api/whatsapp/quick-replies` |
| Automações (CRUD + toggle) | Prisma | `/api/whatsapp/automations` |
| Config IA da loja | Prisma | `/api/whatsapp/ai-settings` |
| Análise IA conversa | LLM server-side | `POST .../ai-analysis` → `lib/whatsapp/ai-conversation-analysis.ts` |
| Sugestão resposta | LLM ou fallback local | Hook + `IaSuggestionCard` com rótulos distintos |
| Vínculo cliente | Prisma + validação telefone | `PATCH` com `clienteId`; `phonesAreCompatibleBr` no server |
| Desvincular cliente | Prisma | `PATCH` com `clienteId: null` + `AlertDialog` + toasts |
| Match por telefone (UI) | Prisma scoped | `GET /api/clientes/match-by-phone` |
| Snapshot CRM | Prisma | `GET /api/clientes/[id]` — OS, vendas, histórico |
| Deep link cadastro | Next.js route | `clientesDashboardHref()` → `/dashboard/clientes?q=` |
| Guard multi-loja (UI) | Fail-closed | `apiHeaders = null` sem `lojaAtivaId`; bloqueio de UI |

### 2.2 Webhook inbound

- Contato upsert, conversa aberta, mensagem inbound idempotente por `wamid`.
- Auto-vínculo retroativo via `matchClienteByPhone()` no webhook (mais permissivo que a API de match — ver P1).
- Audit log em `WhatsAppAutomationLog`.

### 2.3 O que **não** envia WhatsApp real (mas persiste ou simula)

| Fluxo | Comportamento |
|-------|---------------|
| `POST /api/whatsapp/messages` `mode: simulate_automation` | Keyword match + log; **sem** envio Meta |
| `handleEvent` → `sendWhatsAppMessage()` | Grava outbound no DB; log `automation_sent_simulated` |
| `WhatsAppAutomationHub` envio | `POST /api/whatsapp/messages` append local; toast explícito “sem envio à Meta” |
| `ensureHubSeed()` | Seed demo no primeiro GET de conversas por loja |

---

## 3. O que ainda é mock / localStorage / heurística

### 3.1 Heurística honesta (aceitável, rotulada)

| Componente | O quê |
|------------|-------|
| `agentic-ui.tsx` | `deriveInsights`, `detectIntent`, `buildAiSummary` — badges “Sinais IA” no inbox |
| `lib/whatsapp/ai-local-suggestion.ts` | Fallback regex quando LLM indisponível |
| `WhatsAppInsightsPanel` | Métricas sobre conversas reais + insights heurísticos |
| `WhatsAppContextPanel` | Bloco “Apoio local (heurística, não é LLM)” quando LLM falha |

### 3.2 Mock / placeholder / estado local

| Local | O quê | Risco |
|-------|-------|-------|
| `lovable/.../mockData.ts` | `mockContacts`, `mockAutomations`, `mockQuickReplies` exportados | **Não importados** pelo `WhatsAppHub` atual — dívida morta |
| `WhatsAppHub.tsx` (Lovable) | Dashboard stats hardcoded (`1.284`, `312`, etc.) | Enganoso se rota for exposta |
| `WhatsAppHub.tsx` | Funil `moveStage()` — só `useState` local | Sem API |
| `WhatsAppHub.tsx` | Send sem `conversationId` — bubble local otimista | Não persiste |
| `WhatsAppHub.tsx` | Config “Não conectado”, equipe fake, “Conectar (em breve)” | Placeholder |
| `WhatsAppHub.tsx` | OS modal Confirmar — só toast | Toast-only |
| `localStorage` | `omni-theme`, `omni-studio-dual-theme` no Lovable | Tema apenas; HUB operacional não usa |
| `use-whatsapp-ai-analysis.ts` | Cache in-memory Map 5 min | Não é mock; perde em cold start |

### 3.3 Copy ainda imprecisa (não crítica)

| Arquivo | Texto |
|---------|-------|
| `whatsapp-automation-hub.tsx:761` | “Mensagens simuladas serão enviadas a este número” — correto para automações de evento, mas pode confundir com chat |
| `whatsapp-automation-hub.tsx:473-474` | Header honesto: “Nenhuma mensagem é enviada à Meta nesta versão” |

**Corrigido nos commits recentes (não reabrir como P0):**

- `WhatsAppIaPanel` — copy atual descreve LLM real + fallback local (`WhatsAppIaPanel.tsx:96-99`, `182-184`).
- `WhatsAppHub` varinha IA — chama `POST /api/whatsapp/messages` `ai_suggestion` com toast LLM vs local (`WhatsAppHub.tsx:411-438`).
- Automation hub aba — renomeada para **“IA & sugestões”** com labels `Sugestão IA real` / `Sugestão local`.

---

## 4. Botões mortos ou ação só toast

### 4.1 HUB operacional (produção)

| Controle | Arquivo | Severidade | Comportamento |
|----------|---------|------------|---------------|
| **Orçamento** (ações rápidas) | `WhatsAppContextPanel.tsx:710-716` | **P2** | `disabled: true` + badge “Em breve” — **honesto**, não morto enganoso |
| **Editar** automação | `WhatsAppAutomationsPanel.tsx:183-186` | P2 | `disabled` + `title="Em breve"` |
| **MoreVertical** (header chat) | `WhatsAppInbox.tsx` | P2 | Sem `onClick` |
| Falha envio | `WhatsAppInbox.tsx:981-985` | **P1** | Restaura input; `console.error` — **sem toast** |

### 4.2 Lovable `WhatsAppHub` (legado, não montado em produção)

| Controle | Severidade |
|----------|------------|
| “Fazer upgrade de plano” | P2 — sem handler |
| Phone icon header | P2 — sem onClick |
| “Ver OS”, “Cobrar”, “Garantia” | P1 — toast-only |
| Anexar | P2 — “em breve” |
| Funil: “Novo fluxo”, “Adicionar passo”, “Duplicar”, “Salvar fluxo” | P1 — morto ou toast |
| IA tab switches / “Salvar treinamento” | P1 — UI-only, não persiste |
| “Conectar WhatsApp (em breve)” | P2 — disabled |

### 4.3 Automation hub

| Controle | Severidade |
|----------|------------|
| “Salvar mensagem localmente” | **Intencional** — documentado; não é bug |
| Envio chat | P2 — diverge do inbox produção (sem Meta) |

---

## 5. Duplicação: OperationalHub vs Lovable vs Automation Hub

```
/dashboard/whatsapp          → WhatsAppOperationalHub  [PRODUÇÃO — sidebar]
/dashboard/whatsapp-automation → WhatsAppAutomationHub   [Integrações config]
components/whatsapp/lovable  → WhatsAppHub               [ÓRFÃO — não em page.tsx]
```

| Feature | OperationalHub | Lovable | Automation Hub |
|---------|----------------|---------|----------------|
| Inbox + contexto CRM | ✅ completo | Parcial | Simplificado |
| Envio Meta real | ✅ | ✅ se `conversationId` | ❌ local only |
| Vínculo/desvínculo telefone | ✅ | ❌ | ❌ |
| Deep link clientes | ✅ | ❌ | ❌ |
| Análise LLM painel | ✅ | Via API draft | Parcial |
| Automações toggle | ✅ aba | ✅ tab | ✅ tab |
| Insights dashboard | ✅ | Stats mock | ❌ |
| Funil / fluxos | ❌ | Local state | ❌ |
| Fallback `loja-1` | ❌ strict | ✅ | ✅ |

**Risco P1:** operador que abrir `/dashboard/whatsapp-automation` (link em Integrações) vê UX diferente e **sem envio Meta**, apesar do título “WhatsApp HUB”.

**Recomendação:** unificar entrada ou redirecionar automation hub → operational hub.

---

## 6. Labels IA real vs sugestão local

| Superfície | Diferencia? | Detalhe |
|------------|-------------|---------|
| `IaSuggestionCard` | ✅ | “Sugestão IA real” / “Sugestão local” (`agentic-ui.tsx:328`) |
| `WhatsAppContextPanel` resumo | ✅ | Card LLM completo ou “Análise IA indisponível” + heurística |
| `WhatsAppIaPanel` | ✅ | Copy LLM + lista recursos (pós-commit) |
| Inbox badges `AiSignalBadge` | ⚠️ Parcial | Heurística; nome “Sinais IA” pode confundir leitura rápida |
| `WhatsAppInsightsPanel` | ⚠️ Parcial | “Sinais IA” sobre dados reais — não LLM |
| Automation hub sugestão | ✅ | `aiSuggestionSource` llm/local com texto explícito |
| Lovable varinha | ✅ | Toast LLM vs local (pós-commit) |

Prioridade sugestão no painel: LLM `sugestaoResposta` → fallback `suggestReply()` local (`WhatsAppContextPanel.tsx:194-202`).

---

## 7. Feedback / loading / erro (ações críticas)

| Ação | Loading | Erro | Sucesso |
|------|---------|------|---------|
| Carregar conversas | Skeleton | Empty / offline badge | — |
| Carregar mensagens | Skeleton chat | Mantém lista | — |
| **Enviar mensagem** | `sending` + disable | **Fraco** — sem toast | Bubble otimista |
| **Vincular cliente** | `linkingCliente` | toast.error | toast + mensagem painel |
| **Desvincular** | `unlinkingCliente` + AlertDialog | toast.error | toast |
| Análise LLM | `AiAnalyzingPulse` | “Análise IA indisponível” | Card LLM |
| Match telefone | Skeleton / “searching” | Estados `too_short`, `none`, `multiple` | CTA vincular |
| AI settings save | saving | mensagem estática | “Salvo ✓” |
| Toggle automação | otimistic | revert silencioso | — |
| Scan vínculo sugerido | background | — | badge + highlight |

**Destaque positivo:** desvincular usa `AlertDialog` (paridade UX); vincular tem loading + toasts completos.

---

## 8. Vínculo cliente por telefone

### 8.1 Fluxo UI (operacional)

1. `use-whatsapp-cliente-context.ts` → `GET /api/clientes/match-by-phone?phone=...`
2. Status: `unique` | `multiple` | `none` | `too_short` | `searching`
3. UI em `WhatsAppContextPanel`: auto-vínculo sugerido, picker múltiplos, CTAs cadastro/busca
4. `linkCliente()` → `PATCH /api/whatsapp/conversations/[id]` `{ clienteId }`
5. Filtro inbox “Vínculo sugerido” + scan até 30 conversas (`scanSuggestedLinkConversationIds`)

### 8.2 Server

| Caminho | Regra match | Strictness |
|---------|-------------|------------|
| `GET /api/clientes/match-by-phone` | `matchClientesByPhone()` + `phonesAreCompatibleBr` | **Alta** |
| `PATCH conversations/[id]` manual link | Valida compatibilidade telefone cliente × contato | **Alta** |
| Webhook auto-link | `matchClienteByPhone()` — `endsWith` sufixos 8–11 dígitos | **Baixa** (P1 colisão) |

### 8.3 Desvincular

- Botão “Desvincular cliente” quando `clienteId` + snapshot (`WhatsAppContextPanel.tsx:465-476`)
- Confirmação `AlertDialog` no inbox (`WhatsAppInbox.tsx:1236+`)
- `performUnlinkCliente()` → `PATCH { clienteId: null }` com toasts

**Veredito vínculo CRM:** ✅ **real e completo no HUB operacional**; webhook auto-link merece alinhar regra com API match.

---

## 9. Deep link `/dashboard/clientes?q=`

**Builder:** `lib/whatsapp/clientes-dashboard-link.ts`

```typescript
return `/dashboard/clientes?q=${encodeURIComponent(q)}`
```

- Query montada por `buildClientePhoneSearchTokens()` (prioriza sufixo 11 dígitos).
- Usado em “Cadastrar novo cliente” e “Buscar no cadastro” (`WhatsAppContextPanel.tsx:572-587`).
- “Ver cadastro” quando já vinculado (`432-438`).
- Consumidor: `ClientesPageClient.tsx:282` — `searchParams.get("q")` pré-preenche busca.

**Gap P2:** deep link leva à **busca**, não abre formulário de novo cliente pré-preenchido.

---

## 10. Fallback perigoso `loja-1`

| Camada | Comportamento | Risco |
|--------|---------------|-------|
| **`WhatsAppOperationalHub` + filhos** | `apiHeaders = null` sem loja → UI bloqueada | ✅ Seguro |
| **`storeIdFromAssistecRequestForRead`** | header → query → cookie → **`LEGACY_PRIMARY_STORE_ID`** | **P1** leituras API sem contexto caem em `loja-1` |
| **`storeIdFromAssistecRequestForWrite`** | exige header ou query; cookie rejeitado | ✅ Seguro para mutações |
| **`WhatsAppHub` Lovable** | `lojaAtivaId ?? LEGACY_PRIMARY_STORE_ID` | **P1** se rota exposta |
| **`WhatsAppAutomationHub`** | idem Lovable | **P1** |
| **Webhook default store** | `WHATSAPP_WEBHOOK_STORE_ID` ou `loja-1` (`whatsapp-service.ts:35`) | **P1** multi-loja |

**Conclusão:** fluxo operacional principal **não** usa `loja-1` silencioso na UI; backend de leitura e webhook **ainda sim**.

---

## 11. Backend — achados adicionais (API + lib)

### Auth

- `proxy.ts` trata `/api/*` como público — rotas WhatsApp **sem** NextAuth.
- Server Actions em `app/actions/whatsapp.ts` exigem sessão, mas HUB usa fetch direto às APIs.
- Apenas `POST /api/whatsapp/send-daily` verifica cookie de assinatura.

### P0 backend

1. **`POST /api/whatsapp/send` sem auth** — envia à Meta Cloud com só `x-assistec-loja-id` + `conversationId`.
2. **CRUD WhatsApp sem auth** — conversas, mensagens, automações, AI settings, contacts acessíveis sem sessão.
3. **Webhook HMAC opcional** — se `WHATSAPP_APP_SECRET` vazio, verificação de assinatura é ignorada.
4. **Automações system_event não enviam WhatsApp real** — operador pode assumir notificação ao cliente.

### P1 backend

1. **Seed demo em produção** — `ensureHubSeed()` no primeiro GET conversas.
2. **Keyword automations não disparam no inbound webhook** — só simulação manual.
3. **Auto-link webhook permissivo** — colisão de sufixo telefone.
4. **`GET .../conversations/[id]/etiquetas`** — sem filtro `storeId` na query.
5. **`POST /api/whatsapp/messages` mode append** — injeta mensagens sem Meta.
6. **Webhook single-store** — env `WHATSAPP_WEBHOOK_STORE_ID` único.

---

## 12. Achados por severidade

### P0 — Bloqueante ou quebra de confiança

| # | Achado | Onde |
|---|--------|------|
| 1 | API send Meta **sem autenticação** | `app/api/whatsapp/send/route.ts` |
| 2 | CRUD WhatsApp **sem autenticação** | Todas rotas `app/api/whatsapp/**` |
| 3 | Webhook **HMAC bypass** se secret ausente | `app/api/webhooks/whatsapp/route.ts` |
| 4 | Automações evento **simuladas** — não notificam cliente | `lib/whatsapp/whatsapp-service.ts`, `automation-engine` |

### P1 — Operação degradada / risco operacional

| # | Achado | Onde |
|---|--------|------|
| 1 | Falha envio inbox **sem toast** | `WhatsAppInbox.tsx:981-985` |
| 2 | **Três hubs** com comportamentos diferentes | Operational / Lovable / automation |
| 3 | Read API fallback **`loja-1`** | `lib/store-id-from-request.ts:30-31` |
| 4 | Automation hub **sem envio Meta** mas título “WhatsApp HUB” | `whatsapp-automation-hub.tsx` |
| 5 | Auto-link webhook **menos strict** que match API | `matchClienteByPhone` vs `matchClientesByPhone` |
| 6 | Seed demo no primeiro load | `ensureHubSeed()` |
| 7 | Badges “Sinais IA” podem parecer LLM | `agentic-ui`, insights |
| 8 | Lovable/automation **`loja-1`** fallback | `WhatsAppHub.tsx:217`, automation hub |

### P2 — Polimento / dívida técnica

| # | Achado |
|---|--------|
| 1 | Botão MoreVertical sem menu |
| 2 | Editar automação desabilitado (“Em breve”) |
| 3 | `confirm()` nativo em exclusão QR/etiqueta |
| 4 | Kit Lovable + `mockData.ts` morto (~54 arquivos) |
| 5 | Polling 5s (custo/latência) |
| 6 | Scan vínculo sugerido limitado a ~30 conversas |
| 7 | Deep link só busca — sem pré-preencher cadastro |
| 8 | Orçamento disabled (OK) — falta implementação futura |
| 9 | Dual webhook endpoints (`/api/webhooks/whatsapp` + `/api/whatsapp/webhook`) |
| 10 | Cache IA in-memory — não compartilhado entre instâncias |

---

## 13. Top 10 pendências

1. **Auth nas APIs WhatsApp** — alinhar com Server Actions / sessão NextAuth (fail-closed).
2. **Obrigar HMAC webhook** em produção — rejeitar POST se secret ausente ou assinatura inválida.
3. **Unificar navegação** — uma entrada `/dashboard/whatsapp`; redirecionar ou deprecar automation hub + Lovable.
4. **Toast/erro explícito** quando `POST /api/whatsapp/send` falhar no inbox.
5. **Alinhar auto-link webhook** com `matchClientesByPhone` + `phonesAreCompatibleBr`.
6. **Remover ou isolar seed demo** (`ensureHubSeed`) fora de produção.
7. **Automações inbound** — avaliar disparo keyword no webhook ou documentar claramente “simulação only”.
8. **Eliminar fallback `loja-1`** em reads API quando chamada vem do dashboard autenticado.
9. **Pré-preencher cadastro cliente** a partir do telefone WhatsApp (além de `?q=`).
10. **Deprecar código Lovable** morto ou mover para `_imports/` quarentena.

---

## 14. O que já está forte

- **Inbox operacional end-to-end:** conversas, mensagens, envio Meta, polling, modo humano, etiquetas, QR.
- **CRM lateral real:** snapshot cliente, OS, vendas, histórico quando vinculado.
- **Vínculo/desvínculo profissional:** match scoped, estados UX claros, AlertDialog, loading, toasts.
- **Deep link clientes:** `clientesDashboardHref()` integrado ao cadastro com `?q=`.
- **IA honesta:** LLM server-side com cache; fallback local **rotulado**; prioridade LLM > heurística.
- **Guard multi-loja na UI produção:** sem `loja-1` silencioso no OperationalHub.
- **Webhook Meta real:** persistência inbound, idempotência wamid, audit log.
- **Copy IA tab** (`WhatsAppIaPanel`) alinhada pós-commits recentes.
- **Build/tsc limpos** no estado atual do repositório.

---

## 15. Veredito final

| Dimensão | Avaliação |
|----------|-----------|
| HUB operacional `/dashboard/whatsapp` | **Pronto para piloto operacional** (Meta + LLM configurados) |
| CRM vínculo telefone + deep link | **Pronto** no fluxo principal |
| Labels IA vs heurística | **Bom** no operational; atenção em badges inbox |
| Backend segurança multi-loja | **Incompleto** — P0 auth + webhook |
| Produto único (uma UX) | **Não** — duplicação de hubs |
| Automações WhatsApp reais | **Parcial** — toggle real; disparo inbound simulado |

### Veredito consolidado: **PARCIALMENTE PRONTO**

- **Não “ainda mockado”** — o core inbox + CRM + send + webhook inbound é real.
- **Não “100% pronto produção enterprise”** — APIs expostas, automações simuladas, hubs duplicados e fallback `loja-1` no backend impedem fechamento total.

**Critério de uso recomendado:** operadores no `/dashboard/whatsapp` com loja ativa selecionada, credenciais Meta e chave LLM no servidor; **não** confiar no automation hub para envio ao cliente; tratar badges inbox como heurística.

---

## 16. Validações executadas (26/05/2026)

```text
npx tsc --noEmit  → exit 0
npm run build     → exit 0 (prisma generate + next build --webpack, 97 rotas)
```

---

## 17. Referências de commits auditados

```
1ba2c6c feat(agentic): fechar fase whatsapp hub e omni agent operacional
b01258d fix(whatsapp): corrigir p0 da auditoria final agentic hub
2f738bb feat(whatsapp): finalizar polimentos operacionais do hub
4201c64 feat(whatsapp): usar llm real para sugestao de resposta
eed0519 feat(whatsapp): adicionar analise ia real de conversas
7c25704 feat(whatsapp): adicionar matching profissional cliente por telefone
fc6bcf1 feat(whatsapp): destacar vinculo sugerido e permitir desvincular cliente
2602697 feat(whatsapp): adicionar auto-vinculo seguro por telefone
```

---

## 18. Remediação P0 (26/05/2026)

### P0 corrigidos ou mitigados

| # | Achado original | Remediação | Status |
|---|-----------------|------------|--------|
| 1 | `POST /api/whatsapp/send` sem auth | `guardWhatsAppApiWrite` — sessão NextAuth + loja explícita; 401/403 | ✅ Corrigido |
| 2 | CRUD WhatsApp sem auth / loja-1 em reads | Todas rotas `app/api/whatsapp/**` usam `lib/whatsapp/whatsapp-api-guard.ts` — sem fallback `loja-1` | ✅ Corrigido |
| 3 | Webhook HMAC opcional em produção | `lib/whatsapp/webhook-hmac-policy.ts` — `WHATSAPP_APP_SECRET` obrigatório em produção (503); dev permite bypass documentado; GET handshake intacto | ✅ Corrigido |
| 4 | Automações `system_event` parecem envio real | `lib/whatsapp/automation-delivery.ts`; logs `automation_internal_record`; API enriquece `deliveryMode`/`sendsMeta`; UI rotulada; `handle-event` retorna status honesto | ✅ Mitigado |

### Arquivos novos

- `lib/whatsapp/whatsapp-api-guard.ts`
- `lib/whatsapp/webhook-hmac-policy.ts`
- `lib/whatsapp/automation-delivery.ts`

### P1 restantes (pós-remediação)

1. Falha envio inbox sem toast (`WhatsAppInbox.tsx`)
2. Três hubs com UX divergente (Operational / Lovable / automation)
3. Fallback `loja-1` em **outras** APIs não-WhatsApp (`lib/store-id-from-request.ts`)
4. Automation hub sem envio Meta (by design — copy melhorada)
5. Auto-link webhook menos strict que match API
6. Seed demo `ensureHubSeed()` no primeiro load
7. Badges “Sinais IA” ambíguos
8. Lovable/automation hub UI ainda com fallback `loja-1` local

### Veredito pós-remediação

**Mais seguro para piloto:** APIs WhatsApp exigem login + loja ativa; webhook rejeita misconfig em produção; automações de evento rotuladas como registro interno. P1 de UX e dívida Lovable permanecem.

---

## 19. Remediação P1 UX/convergência (26/05/2026)

### P1 resolvidos ou mitigados

| # | Item | Remediação | Status |
|---|------|------------|--------|
| 1 | Send falha sem toast | `WhatsAppInbox.tsx` — `toast.error` com mensagens 401/403/rede; sem bubble otimista em falha | ✅ Corrigido |
| 2 | Três hubs divergentes | Integrações → HUB operacional; automation page banner legado; links e labels honestos; Lovable marcado protótipo | ✅ Mitigado |
| 3 | Seed demo em produção | `ensureHubSeed` — contato/conversa demo só fora de produção (`isProductionRuntime`) | ✅ Corrigido |
| 4 | Badges “Sinais IA” ambíguos | `WhatsAppInsightsPanel` → “Sinais heurísticos”; `AiSignalBadge` com `kind` e tooltip explícito | ✅ Corrigido |
| 5 | Lovable/automation `loja-1` | Empty state sem loja; removido `LEGACY_PRIMARY_STORE_ID` na UI | ✅ Corrigido |
| 6 | Automações internas vs Meta | Labels reforçados em painéis + copy automation hub (P0 parcial, reforço P1) | ✅ Reforçado |

### P2 restantes

1. Botão MoreVertical sem menu no inbox  
2. Editar automação desabilitado (“Em breve”)  
3. `confirm()` nativo em exclusão QR/etiqueta  
4. Kit Lovable morto (~54 arquivos) — ainda no repo, rotulado  
5. Polling 5s (custo/latência)  
6. Scan vínculo sugerido limitado (~30 conversas)  
7. Deep link só busca — sem pré-preencher cadastro  
8. Unificar código dos três hubs (redirect/copy feito; merge de código pendente)  
9. Auto-link webhook menos strict que match API  
10. Fallback `loja-1` em APIs não-WhatsApp (`lib/store-id-from-request.ts`)

---

*Auditoria estática; comportamento com credenciais Meta/OpenRouter em runtime de produção não foi exercitado nesta sessão.*
