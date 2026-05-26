# Auditoria final — WhatsApp HUB (Agentic AI)

**Data:** 26/05/2026  
**Escopo:** somente leitura de código (sem alterações).  
**Rota de produção principal:** `/dashboard/whatsapp` → `WhatsAppOperationalHub` → `WhatsAppInbox`.

---

## Resumo executivo

| Item | Resultado |
|------|-----------|
| Arquivos analisados (`.ts` / `.tsx`) | **89** |
| `npx tsc --noEmit` | OK |
| `npm run build` | OK |
| **Veredito** | **Pronto para uso real no HUB operacional**, com ressalvas em rotas paralelas e copy desatualizada |

O fluxo principal (`/dashboard/whatsapp`) usa APIs reais, CRM, match por telefone, análise LLM server-side e envio via `/api/whatsapp/send` (Cloud API quando configurada). Permanecem heurísticas **rotuladas** como apoio local, duplicação de UI legada (Lovable + automation hub) e alguns botões/copy que ainda sugerem IA simulada fora do inbox.

---

## 1. Inventário por escopo

| Pasta | Arquivos |
|-------|----------|
| `app/dashboard/whatsapp` | 3 |
| `components/whatsapp` | 63 |
| `components/dashboard/whatsapp-automation` | 1 |
| `app/api/whatsapp` | 17 |
| `lib/whatsapp` | 5 |
| **Total** | **89** |

---

## 2. Mock, heurística, placeholder e “em breve”

### 2.1 Produção (`/dashboard/whatsapp`) — real vs heurístico

| Área | Status | Detalhe |
|------|--------|---------|
| Inbox / conversas / mensagens | **Real** | `GET/POST/PATCH` APIs; polling 5s |
| Envio de mensagem | **Real** | `POST /api/whatsapp/send` → `sendCloudApiTextAndRecord` (Meta quando credenciais OK) |
| CRM painel lateral | **Real** | `GET /api/clientes/[id]`, `GET /api/clientes/match-by-phone` |
| Vínculo / desvincular cliente | **Real** | `PATCH /api/whatsapp/conversations/[id]` |
| Resumo IA + sugestão resposta | **LLM real** | `POST /api/whatsapp/conversations/[id]/ai-analysis` + cache 5 min |
| Fallback sugestão / resumo | **Heurístico honesto** | `lib/whatsapp/ai-local-suggestion.ts`, labels “Sugestão local”, “Apoio local (heurística, não é LLM)” |
| Insights / badges inbox | **Heurístico** | `deriveInsights`, `detectIntent` — apoio visual, não LLM |
| Automações (aba HUB) | **Real (toggle)** | Lista/toggle via API; disparo inbound Meta **não** auditado neste escopo |
| Simulação automação | **Parcial** | `POST /api/whatsapp/messages` `mode: simulate_automation` — keywords, sem envio |

### 2.2 Copy desatualizada / fallback enganoso (P0)

| Arquivo | Problema |
|---------|----------|
| `components/whatsapp/WhatsAppIaPanel.tsx` | Texto: *“sugestões no inbox usam heurísticas locais até integração completa”* — **incorreto** após integração LLM no painel |
| `components/whatsapp/WhatsAppIaPanel.tsx` | Lista “Sugestão IA — baseada na intenção detectada” sem distinguir LLM vs local |
| `components/dashboard/whatsapp-automation/whatsapp-automation-hub.tsx` | Aba **“IA (simulada)”**; toast ao salvar: *“sugestões simuladas”* — API já usa LLM em `ai_suggestion` |
| `components/whatsapp/lovable/.../WhatsAppHub.tsx` | Botão varinha: `aiSuggestions` **mock** aleatório + toast *“Sugestão da IA aplicada”* — **finge LLM** |
| `components/whatsapp/lovable/.../WhatsAppHub.tsx` | `toast.info("Anexar (em breve)")`, `Conectar WhatsApp (em breve)` |
| `components/whatsapp/lovable/.../mockData.ts` | `mockContacts`, `mockAutomations`, `mockQuickReplies` — **não importados** no `WhatsAppHub` atual (carga via API), mas arquivo permanece |

### 2.3 Heurística aceitável (não é mock)

- `agentic-ui.tsx`: `deriveInsights`, `buildAiSummary`, `suggestReply` — documentado como heurística / alinhado ao server fallback.
- `WhatsAppInsightsPanel`: métricas e alertas derivados de conversas reais + `deriveInsights` (rótulo “Sinais IA” = sinais heurísticos, não LLM).

---

## 3. Botões sem ação real ou ação morta

| UI | Botão / ação | Severidade | Observação |
|----|----------------|------------|------------|
| `WhatsAppContextPanel` | **Orçamento** (ações rápidas) | **P0** | Chama `onQuickAction("quote")`; inbox só implementa `"human"` — **sem efeito** |
| `WhatsAppAutomationsPanel` | **Editar** automação | P2 | `disabled` + `title="Em breve"` — honesto |
| `WhatsAppHub` (Lovable) | Anexar, Conectar WA, varinha IA mock | P0 | Só relevante se rota Lovable for usada |
| `WhatsAppInbox` | Excluir QR / etiqueta | P2 | `window.confirm` — funciona, UX inferior ao desvincular (já usa `AlertDialog`) |
| `WhatsAppInbox` | Falha no envio | **P1** | Restaura texto no input; **sem toast** ao usuário (`console.error` apenas) |

---

## 4. Duplicação: OperationalHub vs WhatsAppHub Lovable vs Automation Hub

| Rota / entrada | Componente | Uso atual |
|----------------|------------|-----------|
| **`/dashboard/whatsapp`** | `WhatsAppOperationalHub` → `WhatsAppInbox` | **Produção** (page.tsx) |
| `/dashboard/whatsapp-automation` | `whatsapp-automation-hub.tsx` | Hub legado: chat simplificado, simulação, IA tab “simulada” |
| Lovable (`components/whatsapp/lovable/...`) | `WhatsAppHub.tsx` | **Não** referenciado por `app/dashboard/whatsapp/page.tsx`; ainda existe em `lovable/routes` e cópia PDV-original |

**Riscos da duplicação (P1):**

- Duas UX de inbox com APIs parecidas mas comportamentos diferentes (Lovable: sugestão IA mock; Operational: LLM real).
- Três superfícies para automações/IA/config (abas HUB + automation hub + Lovable settings).
- Manutenção e copy divergem (ex.: “IA simulada” vs “Agentic AI”).

**Recomendação:** tratar Lovable como legado/arquivo morto na navegação principal ou redirecionar para OperationalHub.

---

## 5. Labels IA real vs sugestão local

| Superfície | Diferencia LLM vs local? |
|------------|-------------------------|
| `IaSuggestionCard` (`agentic-ui.tsx`) | **Sim** — “Sugestão IA real” / “Sugestão local” |
| `WhatsAppContextPanel` resumo | **Sim** — LLM completo ou “Análise IA indisponível” + apoio local |
| `whatsapp-automation-hub` sugestão | **Sim** (após melhoria) — label LLM/cache vs local |
| `WhatsAppIaPanel` | **Não** — copy ainda fala só em heurística |
| `WhatsAppInsightsPanel` “Sinais IA” | **Parcial** — heurística; hint “Insights detectados” |
| `WhatsAppHub` Lovable varinha | **Não** — apresenta como IA real |

---

## 6. Cores hardcoded (`bg-white`, `bg-black`, `text-gray-*`)

| Área | Resultado |
|------|-----------|
| `WhatsAppInbox`, `WhatsAppContextPanel`, `WhatsAppOperationalHub`, `agentic-ui` | **OK** — tokens `background`, `foreground`, `muted`, `primary`, `glass-card` |
| `components/whatsapp/lovable/components/ui/*` | Overlays `bg-black/80` (padrão shadcn/Radix) — **não** usados pelo HUB operacional principal |
| `WhatsAppHub.tsx` (Lovable) | `bg-background`, `bg-card`, `bg-primary` — sem `bg-white`/`text-gray` no hub em si |

**Conclusão:** HUB operacional alinhado ao tema; kit Lovable usa overlay escuro padrão de dialog.

---

## 7. Feedback / loading / erro (ações críticas)

| Ação | Loading | Erro | Sucesso |
|------|---------|------|---------|
| Carregar conversas | Skeleton | Empty / offline badge | — |
| Carregar mensagens | Skeleton chat | Mantém lista | — |
| Enviar mensagem | `sending` + disable | **Fraco** — sem toast | Otimistic bubble |
| Vincular cliente | `linkingCliente` | toast.error | toast + mensagem painel |
| Desvincular | `unlinkingCliente` + AlertDialog | toast.error | toast |
| Análise LLM painel | `AiAnalyzingPulse` / hook loading | “Análise IA indisponível” | Card LLM |
| Atualizar análise | Botão + spin | — | Cache label |
| AI settings (aba IA) | Skeleton / saving | Mensagem estática | “Salvo ✓” |
| Match telefone CRM | Skeleton | Estados por status | CTA vincular |
| Toggle automação | Otimistic revert | Revert silencioso | — |

---

## 8. Rotas e APIs usadas pela UI (mapa)

### APIs (`app/api/whatsapp`)

| Método | Rota | Uso UI principal |
|--------|------|------------------|
| GET | `/api/whatsapp/conversations` | Inbox, Insights bridge, OperationalHub, Lovable, automation hub |
| PATCH | `/api/whatsapp/conversations/[id]` | humanMode, unread, clienteId |
| POST | `/api/whatsapp/conversations/[id]/ai-analysis` | Painel contexto (hook) |
| GET/POST | `/api/whatsapp/conversations/[id]/etiquetas` | Etiquetas na conversa |
| DELETE | `.../etiquetas/[etiquetaId]` | Remover etiqueta |
| GET | `/api/whatsapp/messages` | Lista mensagens |
| POST | `/api/whatsapp/messages` | append, `ai_suggestion`, `simulate_automation` |
| POST | `/api/whatsapp/send` | **Envio real** (inbox + Lovable) |
| GET/PATCH | `/api/whatsapp/ai-settings` | Aba IA + automation hub |
| GET/POST/PATCH/DELETE | `/api/whatsapp/quick-replies` | Modais / Lovable / automation |
| GET/POST/PATCH/DELETE | `/api/whatsapp/etiquetas` | Modais inbox |
| GET/PATCH | `/api/whatsapp/automations` | Abas automações |
| GET | `/api/whatsapp/contacts` | Fallback Lovable se sem conversas |
| — | `/api/whatsapp/webhook` | Ingress Meta (não UI) |

### APIs CRM (fora de `app/api/whatsapp`, usadas pelo HUB)

| API | Uso |
|-----|-----|
| `GET /api/clientes/match-by-phone` | Auto-vínculo sugerido |
| `GET /api/clientes/[id]` | Snapshot CRM |
| `GET /api/clientes?q=` | Deep link `?q=telefone` no cadastro |

### LLM (server)

| Módulo | Backend |
|--------|---------|
| `lib/whatsapp/ai-conversation-analysis.ts` | OpenRouter → OpenAI/Gemini (`llmJsonCompletion`) |
| `lib/whatsapp/ai-local-suggestion.ts` | Fallback heurístico |

---

## 9. Achados por severidade

### P0 — Engano ou quebra de confiança

1. **Copy `WhatsAppIaPanel`** ainda afirma que inbox usa só heurística (LLM já ativo no painel).
2. **`WhatsAppHub` Lovable:** botão “IA” com array `aiSuggestions` mock + toast de sucesso — parece LLM real.
3. **Botão “Orçamento”** no painel lateral sem handler no inbox.
4. **Automation hub:** aba e toasts “IA simulada” enquanto `ai_suggestion` já chama LLM.

### P1 — Operação degradada ou duplicação perigosa

1. **Falha de envio** sem feedback visual (toast) no inbox.
2. **Três hubs** (Operational / automation / Lovable) com comportamentos diferentes.
3. **Automation hub** descrição de config IA desatualizada (“simuladas”).
4. **Insights “Sinais IA”** pode ser lido como LLM (são heurísticas sobre dados reais).

### P2 — Polimento / dívida técnica

1. Botão **Editar** automação na aba HUB desabilitado (“Em breve”).
2. `confirm()` nativo em exclusão QR/etiqueta.
3. Arquivo **`mockData.ts`** e kit Lovable (~50 UI files) ainda no repo.
4. Polling 5s (custo/latência).
5. Scan vínculo sugerido limitado (~30 conversas).
6. Simulação de automação só por palavra-chave (documentar na UI).

---

## 10. Top 10 pendências para WhatsApp 100%

1. Unificar navegação: **uma** entrada (`/dashboard/whatsapp`); deprecar ou redirecionar Lovable + alinhar automation hub.
2. Atualizar **copy** em `WhatsAppIaPanel` e automation hub (LLM real + fallback local).
3. Remover ou isolar **sugestão IA mock** do `WhatsAppHub` Lovable.
4. Implementar ou desabilitar botão **Orçamento** nas ações rápidas.
5. **Toast/erro** explícito quando `POST /api/whatsapp/send` falhar.
6. Trocar `confirm()` de QR/etiquetas por **AlertDialog** (paridade com desvincular).
7. **WebSocket** ou SSE em vez de polling 5s.
8. Batch / otimização do scan de vínculo sugerido na lista completa.
9. Pré-preencher **formulário** de novo cliente (hoje só busca com `?q=`).
10. Automações inbound Meta end-to-end (se produto exigir — fora do escopo atual).

---

## 11. Veredito final

### Pronto para uso real?

**Sim, para o HUB operacional em `/dashboard/whatsapp`**, desde que:

- Loja tenha **credenciais Meta** (envio) e **chave LLM** no servidor (análise/sugestão).
- Operadores usem o **inbox Agentic** (não o Lovable nem confiem na aba “IA simulada” do automation hub sem revisar copy).
- Fique claro que **badges/insights** no painel são heurísticos; **resumo e sugestão** no card IA são LLM quando disponível.

**Não está 100% fechado** como produto único: duplicação de hubs, copy legada, um botão morto (Orçamento) e risco de falsa IA no código Lovable ainda presente no repositório.

---

## 12. Validações executadas

```text
npx tsc --noEmit  → exit 0
npm run build     → exit 0 (compilação webpack OK)
```

---

*Auditoria estática; comportamento com credenciais Meta/OpenRouter em runtime não foi exercitada nesta sessão.*
