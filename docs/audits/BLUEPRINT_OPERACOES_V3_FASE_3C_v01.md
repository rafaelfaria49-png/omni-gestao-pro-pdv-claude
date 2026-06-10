---
title: Blueprint Operações V3 — Fase 3C (WhatsApp, Notificações e Portal do Cliente)
hub: operacoes (V3)
tipo: blueprint / planejamento read-only (sem alteração de código)
status: v01
data: 2026-06-06
owner_humano: Rafael
owner_ia: Opus (Claude Code)
roadmaps: docs/roadmaps/ROADMAP_OPERACOES_OS.md · docs/roadmaps/ROADMAP_WHATSAPP.md
escopo: Operações V3 (`lib/operacoes-v3/**`, `components/operacoes-v3/**`) × WhatsApp HUB × Portal do Cliente
modo: READ ONLY — nenhum código/schema/banco/commit/push
---

# 📡 Blueprint Operações V3 — Fase 3C

> **Read-only.** Nenhuma linha de código, schema, migração, banco, commit ou push.
> Evidência: leitura direta de `lib/whatsapp/**`, `lib/automation/automation-engine.ts`,
> `lib/events/event-bus.ts`, `lib/omni-agent/**`, `lib/operacoes-v3/**`, `app/portal/**`,
> `components/portal/cliente-portal.tsx`, `components/operacoes-v3/**`, `prisma/schema.prisma`
> (modelos WhatsApp/OmniAgent), `ROADMAP_WHATSAPP.md`, `CURRENT_STATUS.md` e memórias do projeto.
>
> **Entregáveis:** (1) Blueprint Fase 3C · (2) GAP Analysis · (3) Plano por fases · (4) Próximo GOAL.

---

## 0. Resumo executivo

A Fase 3C fecha o **último elo do ciclo da OS na V3**: o **cliente** e a **comunicação automática**.
As fases 1A→3B entregaram abertura, orçamento, workspace, impressão, recebimento, entrega, garantia,
retorno e produção — **tudo dentro do `payload` (JSONB), sem efeitos externos**. O que ainda **não existe
de forma real e ligada à V3**: aviso automático ao cliente por etapa, e um portal onde o cliente
acompanhe/aprove/pague a própria OS.

**Três descobertas que definem a Fase 3C:**

1. **A V3 é muda.** `aplicarTransicaoStatusV3` (o único write-path de status da V3) grava status +
   timeline e **não emite nenhum evento de sistema**. Logo, **nenhuma automação dispara** quando uma OS
   da V3 muda de status. O barramento de eventos (`lib/events/event-bus.ts`) é **client-side, em memória**,
   e hoje só `venda_finalizada` (PDV) e `os_finalizada` (finalização da V2) chegam a ele.

2. **As automações de sistema não falam com o cliente.** Mesmo quando um evento dispara, o
   `automation-engine` roda em modo **`internal_record_only`** (`lib/whatsapp/automation-delivery.ts`):
   grava uma mensagem **no histórico interno** da loja para auditoria, mas **NÃO entrega via Meta Cloud
   API**. Ou seja: a infraestrutura de "notificação por status" existe como **simulação/registro**, não
   como envio real. Além disso, as automações padrão usam **nomes de status da V2** (`EmAnalise`, `Pronto`)
   — incompatíveis com a máquina de 10 status da V3.

3. **O Portal é um protótipo localStorage.** A rota pública `app/portal` (`ClientePortal`) lê do
   `useOperationsStore` (localStorage do navegador da loja), faz "login" por CPF, e "paga" via `toast`
   (mock). **Não é multi-loja, não persiste no banco, não conhece a V3.** A V3 tem apenas um
   `PlaceholderScreenV3` para "Portal do cliente" e "Notificações".

**Conclusão:** a Fase 3C **não é "ligar um fio"** — é construir (a) uma **espinha de eventos server-side**
da V3, (b) um **motor de notificação real** (com opt-out e envio Meta governado), e (c) um **portal
real, multi-loja e seguro**. Cada um desses toca **áreas protegidas** (schema, `lib/whatsapp/*`, rota
pública/auth) e exige **autorização explícita** + provavelmente **1 ADR**.

---

## 1. Inventário — o que já existe

### 1.1 WhatsApp HUB / Cloud API (infra core — real)

| Componente | Arquivo | Estado |
|---|---|---|
| Webhook canônico (GET handshake + POST Meta + Evolution) | `app/api/whatsapp/webhook/route.ts` (rewrite) | ✅ real |
| HMAC X-Hub-Signature-256 | `lib/whatsapp/webhook-hmac-policy.ts` | ✅ real |
| Roteamento multi-loja por `phone_number_id`→`storeId` | `WhatsAppPhoneNumber` + `store-credentials.ts` (ADR-0006) | ✅ real |
| Envio texto/mídia/template + persistência | `lib/whatsapp/send-message.ts` → `whatsapp-service.ts` | ✅ real (Cloud API) |
| Envio manual | `POST /api/whatsapp/send` (`x-assistec-loja-id`) | ✅ real |
| Conversas/contatos/mensagens/etiquetas/quick-replies | models `WhatsAppContact/Conversation/Message/Etiqueta/QuickReply` | ✅ schema real |
| Inbox (UI) | `components/whatsapp/lovable/.../WhatsAppHub.tsx` | 🟡 Lovable c/ mock parcial |
| Sugestão/análise IA (local) | `lib/whatsapp/ai-local-suggestion.ts`, `ai-conversation-analysis.ts` | 🟡 simulação |

**Modelos de dados disponíveis (schema):** `WhatsAppContact` (telefone normalizado, `@@unique(storeId,
phoneDigits)`), `WhatsAppConversation` (com `clienteId` opcional — match por telefone), `WhatsAppMessage`
(`direction`, `body`, `messageType`, `externalMessageId`/wamid), `WhatsAppAutomation` (`triggerType`,
`conditions` JSONB, `actions` JSONB), `WhatsAppAutomationLog`, `WhatsAppPhoneNumber`, `WhatsAppAiSetting`.

### 1.2 Automações & eventos

**Barramento de eventos** (`lib/events/event-bus.ts`): pub/sub **client-side, em memória** (não há
fila/outbox). `SystemEvent` declarados: `venda_criada`, `venda_finalizada`, `os_criada`,
`os_status_alterado`, `os_finalizada`, `cliente_criado`, `conta_receber_vencida`.

**Quem REALMENTE emite hoje:**

| Evento | Emissor | Caminho |
|---|---|---|
| `venda_finalizada` | `lib/operations-store.tsx` (browser) | client → `POST /api/automation/handle-event` |
| `os_finalizada` | `app/actions/operacoes.ts` (V2) via `emitOsFinalizadaOmniEvent` | server-side direto |
| `os_criada`, `os_status_alterado`, `cliente_criado`, `conta_receber_vencida` | **ninguém (declarados, sem emissor universal)** | — |
| **qualquer evento da V3** | **ninguém — `aplicarTransicaoStatusV3` não emite** | — |

**Motor de automação** (`lib/automation/automation-engine.ts` → `handleEvent`): para automações
`system_event`, resolve template `{{chave}}`, escolhe destinatário (`targetPhone` do HUB tem prioridade)
e chama `sendWhatsAppMessage(...)` — **mas a entrega é `internal_record_only`**
(`lib/whatsapp/automation-delivery.ts`): grava no histórico, **não envia Meta**. Para `keyword`
(inbound), é `simulation_only`. Em seguida chama `handleOmniAgentSystemEvents`.

**Automações padrão de evento** (`ensureDefaultEventAutomations`, idempotente por loja):
- `venda_finalizada` → "Venda realizada no valor de {{total}}…"
- `os_status_alterado` + `status: "EmAnalise"` → "Sua ordem de serviço está em análise…"
- `os_status_alterado` + `status: "Pronto"` → "Seu aparelho está pronto para retirada."
- `os_finalizada` → "Sua OS foi finalizada. Segue valor para pagamento."

> ⚠️ Esses gatilhos usam **status da V2** (`EmAnalise`/`Pronto`). A V3 usa `aberta/recebida/diagnostico/
> orcamento/aprovada/em_execucao/pronta/entregue/cancelada` — **não casam**.

### 1.3 Omni Agent

`lib/omni-agent/omni-automation-engine.ts`: em cada evento de sistema, cria um `OmniAgentCommand` em
**PENDENTE** no Inbox (sem auto-execução) + `OmniAgentAutomationRun` + log. Default automations
(desativadas): `venda_finalizada`, `os_entregue`, `conta_receber_vencida`. É **triagem assistida**, não
notificação ao cliente.

### 1.4 Timeline, retornos, garantias, entrega (V3 — já construídos)

- **Timeline operacional** rica no `payload.timeline[]` (8 etapas + eventos auditáveis) — `workspace-model.ts`.
- **Entrega** (`entregaV3` + `registrarEntregaV3`), **Termo de Entrega** imprimível — Fase 3A.
- **Garantia derivada da entrega** (`lerGarantiaV3` → ativa/vencendo≤15d/vencida/prevista) — Fase 3A.
- **Retornos** (`retornosV3[]`, `abrirRetornoV3`/`finalizarRetornoV3`, vínculo à OS original) — Fase 3A.
- **Pós-venda KPIs** no Dashboard (garantias, retornos, taxa de retorno).

> Todos esses geram **timeline interna** e **nada externo** — nenhum aviso ao cliente, nenhum job de
> "garantia vencendo". A "garantia vencida" é **derivada na leitura**, sem cron de expiração.

### 1.5 Portal do cliente (auditoria)

| Item | Local | Estado real |
|---|---|---|
| Rota pública `/portal` | `app/portal/page.tsx` + `layout.tsx` → `components/portal/cliente-portal.tsx` | 🔴 **protótipo localStorage** |
| "Login" | CPF (11 dígitos) contra `useOperationsStore` (mesmo navegador) | 🔴 sem auth/token, sem multi-loja |
| Consulta OS / orçamento | filtra `ordens`/`orcamentos` do store local por CPF | 🔴 mock (V2/localStorage) |
| Pagamento | `pagarOs`/`pagarOrcamento` → muda status no store + `toast` | 🔴 mock (sem PIX/cartão real) |
| Planos de assinatura | array fixo `PLANOS_ASSINATURA` + `toast` | 🔴 mock |
| Modal "Portal do cliente" (V2) | `components/operacoes/lovable/.../PortalClienteModal.tsx` | 🟡 **preview interno** (aprovar/recusar via `toast`) |
| Portal V3 | `components/operacoes-v3/pages/PortalClienteV3.tsx` | ⚪ **placeholder** |
| Notificações V3 | `components/operacoes-v3/pages/NotificacoesV3.tsx` | ⚪ **placeholder** |

**Copy já definida (produto) para os placeholders V3** (`data/screen-copy.ts`):
- **Portal:** linha do tempo pública (sem dados internos), aprovação de orçamento pelo cliente, anexos
  liberados (fotos antes/depois), aviso de pronto para retirada.
- **Notificações:** disparos por mudança de status, templates de WhatsApp por evento, lembrete de
  orçamento parado, aviso de garantia vencendo.

> A V3 **já tem as 4 funcionalidades desenhadas em copy** — falta o motor. O "ângulo de produto" está
> fechado; o trabalho é de engenharia + governança.

---

## 2. Mapa de integração — eventos candidatos × V3

Para cada evento pedido no GOAL, o que existe e o que falta para virar **notificação real** e/ou
**atualização do portal**:

| Evento candidato | Origem na V3 (hoje) | Emite evento? | Notifica cliente? | Lacuna |
|---|---|---|---|---|
| **OS criada** | `criarOSEnterpriseV3` (nova-os-actions) | ❌ | ❌ | emitir `os_criada` server-side + telefone |
| **Orçamento criado/enviado** | `enviarOrcamentoV3` (orcamento-actions) | ❌ | ❌ | evento `orcamento_enviado` (novo) |
| **Orçamento aprovado** | `aprovarOrcamentoV3` | ❌ | ❌ | evento + (no portal) **aprovação pelo cliente** |
| **Aguardando peça** | status `aguardando_peca` (máquina V3) | ❌ | ❌ | evento por status + template |
| **Pronta** | `aplicarTransicaoStatusV3(... "pronta")` | ❌ | ❌ | **o aviso de maior valor** ("pode retirar") |
| **Entregue** | `registrarEntregaV3` | ❌ | ❌ | evento `os_entregue` + pesquisa de satisfação |
| **Garantia criada** | `salvarGarantiaOSV3` / entrega | ❌ | ❌ | termo + início de contagem (da entrega) |
| **Garantia vencendo (≤15d)** | `lerGarantiaV3` (derivado na leitura) | ❌ | ❌ | **precisa cron/job** (não há emissor temporal) |
| **Retorno aberto** | `abrirRetornoV3` | ❌ | ❌ | evento + alerta interno (Omni) + cliente |

**Três bloqueios estruturais comuns a todos:**

1. **Sem emissão de evento na V3.** É preciso um ponto único server-side (ex.: um helper
   `emitirEventoOperacaoV3`) chamado nas actions da V3 (`status-actions`, `entrega-actions`,
   `orcamento-actions`, `retorno-actions`, `nova-os-actions`). Hoje o barramento é client-side; a V3 é
   server-action. Recomenda-se chamar `handleEvent(...)` **direto server-side** (como a V2 já faz em
   `emitOsFinalizadaOmniEvent`) — sem passar pelo event-bus do browser.

2. **Entrega real bloqueada por design.** `whatsAppAutomationDeliveryMeta` retorna `sendsMeta: false`
   para `system_event`. Para notificar de verdade, é preciso um **modo de entrega novo**
   (`meta_template_send`) **com opt-out e janela 24h respeitados** — fora da janela, só **template HSM
   aprovado** pode ser enviado. Isso toca `lib/whatsapp/*` (**área protegida**).

3. **Telefone do cliente.** O resolvedor lê `payload.data.phoneDigits`. A OS guarda `cliente.telefone`;
   é preciso normalizar (DDI+DDD) e passar no payload do evento. Match com `WhatsAppContact`/`Cliente`
   já existe por telefone.

---

## 3. GAP Analysis vs concorrentes

> Vertical assistência técnica + ERPs com módulo de serviço. ✅ tem · 🟡 parcial/mock · ❌ não tem.
> Avaliação dos concorrentes é **contextual** (capacidades públicas consolidadas), não teste lado a lado.

| Capacidade | Gestão Click | Smart System | Omie Assist. | Assistec (TecnoSpeed) | ServicAA | MaxiManager | **Omni V3 hoje** |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Aviso automático por status (WhatsApp) | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | 🟡 **registro interno, não envia** |
| Template/mensagem por etapa configurável | ✅ | ✅ | 🟡 | ✅ | 🟡 | ✅ | 🟡 (existe motor, V2-only, sem UI V3) |
| Portal/link público de acompanhamento | ✅ | ✅ | 🟡 | ✅ | 🟡 | ✅ | 🔴 protótipo localStorage |
| Aprovação de orçamento pelo cliente (online) | ✅ | ✅ | 🟡 | ✅ | 🟡 | 🟡 | 🔴 mock (toast) |
| Consulta de OS pelo cliente (status/fotos) | ✅ | ✅ | 🟡 | ✅ | 🟡 | ✅ | 🔴 mock |
| Pagamento online da OS (PIX/cartão) | 🟡 | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | 🔴 mock |
| Aviso de garantia vencendo / pós-venda | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ❌ (derivado, sem job) |
| Opt-out / consentimento (LGPD) | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | 🟡 | ❌ **sem modelo** |
| Pesquisa de satisfação (NPS pós-entrega) | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ❌ |
| Histórico da conversa no cliente (360°) | 🟡 | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | 🟡 (`clienteId` existe; timeline 360° não) |
| Timeline imutável/auditável da OS | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ✅ **diferencial** (`payload.timeline[]`) |
| Multi-loja no roteamento de mensagens | 🟡 | 🟡 | ✅ | ✅ | 🟡 | 🟡 | ✅ **diferencial** (ADR-0006) |

**Leitura:**
- **Onde o Omni perde:** o **básico do nicho** — todo concorrente de assistência **avisa o cliente
  automaticamente** e **tem um link de acompanhamento**. O Omni tem **a tubulação** (WhatsApp Cloud real,
  multi-loja, motor de automação, timeline), mas **a torneira está fechada** (`sendsMeta:false` +
  Portal mock). É o gap competitivo mais visível para o lojista.
- **Onde o Omni ganha (e deve preservar):** **timeline auditável**, **roteamento multi-loja seguro**,
  **Omni Agent** como camada de triagem. A Fase 3C deve **ligar a torneira sem perder a auditoria**.
- **Onde todos são fracos (oportunidade):** **garantia vencendo proativa**, **NPS pós-entrega** e
  **opt-out/LGPD first-class**. Bom espaço para diferencial de baixo custo.

---

## 4. Blueprint da Fase 3C

Princípio (igual às fases 1A→3B): **isolamento por URL** (`/dashboard/operacoes-v3`), efeitos
**reaproveitando serviços existentes**, **sem refazer** WhatsApp core nem V2. Onde tocar área protegida,
**parar e pedir autorização + ADR**. Divisão em **5 blocos** com dependência crescente.

### Bloco 3C.0 — Espinha de eventos da V3 (fundação, não-visível)
**Objetivo:** a V3 passa a **anunciar** o que acontece, server-side, sem efeito colateral visível.
- Helper `emitirEventoOperacaoV3(storeId, osId, evento, data)` que chama `handleEvent(...)` direto
  (padrão `emitOsFinalizadaOmniEvent`), incluindo `phoneDigits` normalizado do cliente da OS.
- Pontos de emissão (cirúrgicos, 1 linha cada): `nova-os-actions` (`os_criada`), `status-actions`
  (`os_status_alterado` com status **V3**), `orcamento-actions` (`orcamento_enviado`/`orcamento_aprovado`),
  `entrega-actions` (`os_entregue`), `retorno-actions` (`retorno_aberto`).
- **Sem envio externo** ainda — só registro interno + Omni inbox. Permite **observar** no WhatsApp HUB
  (logs) que os eventos chegam, antes de ligar o Meta.
- **Decisão necessária:** estender o union `SystemEvent` (orçamento/retorno são novos) — mudança em
  `lib/events` e `lib/automation`. Avaliar se entra como **dado** (campo `conditions.event`) sem alterar
  o union, para reduzir blast radius.

### Bloco 3C.1 — Notificações reais (envio Meta governado) ⚠️ área protegida
**Objetivo:** o cliente **recebe de fato** a mensagem certa na etapa certa.
- Novo modo de entrega `meta_template_send` em `lib/whatsapp/automation-delivery.ts` (hoje só
  `internal_record_only`/`simulation_only`).
- Regra de janela: dentro de 24h (sessão aberta) → texto livre; fora → **template HSM aprovado**
  (`sendCloudApiTemplateAndRecord` já existe).
- **Opt-out obrigatório antes de qualquer envio** (ver 3C.2). Sem opt-out persistente, **não ligar**.
- Reescrever as automações default para **status V3** (`pronta`, `aguardando_peca`, `entregue`,
  `orcamento` …) — substituindo os gatilhos V2 (`EmAnalise`/`Pronto`).
- **Tela Notificações V3** (deixa de ser placeholder): lista de regras por evento, editor de template
  com variáveis (`{{cliente}}`, `{{numeroOS}}`, `{{total}}`, `{{garantiaDias}}`…), toggle por loja,
  histórico de disparos (lê `WhatsAppAutomationLog`).
- **Autorização explícita + ADR** ("Notificação real ao cliente por evento de OS") — toca `lib/whatsapp/*`
  e tem risco de **banimento Meta**.

### Bloco 3C.2 — Opt-out / consentimento (LGPD) ⚠️ schema
**Objetivo:** nenhum envio sem consentimento; opt-out respeitado automaticamente.
- **Modelo `WhatsAppOptOut`** (ou flag em `WhatsAppContact`): `storeId + phoneDigits`, escopo
  (transacional × marketing), origem, timestamp. **Mudança de schema → autorização explícita.**
- Checagem central no envio (transacional pode ter regra diferente de marketing — decisão de produto).
- Palavra-chave inbound de opt-out ("SAIR"/"PARAR") → grava opt-out (reusa keyword automations).
- **Compartilhado com o ROADMAP_WHATSAPP (item P0 "Opt-out persistente")** — alinhar para não duplicar.

### Bloco 3C.3 — Garantia vencendo & pós-venda proativo ⚠️ precisa job
**Objetivo:** transformar a "garantia derivada na leitura" em **aviso proativo**.
- Não há emissor temporal hoje. Opções: **cron Vercel** (rota `app/api/cron/garantias-vencendo`) ou
  job no painel. Varre OS entregues com garantia ativa, `dias_restantes ≤ N` → evento
  `garantia_vencendo` → notificação (3C.1) + alerta interno (Omni).
- **NPS/pesquisa de satisfação** alguns dias após `os_entregue` (mesma mecânica de agendamento).
- **Lembrete de orçamento parado** (enviado há X dias sem aprovação) — copy já prevista.
- **Decisão:** infra de agendamento (cron) é **nova** — avaliar reuso de `app/api/marketing/schedule`.

### Bloco 3C.4 — Portal do cliente real (multi-loja, seguro) ⚠️ área protegida (rota pública/auth)
**Objetivo:** link público por OS onde o cliente acompanha, aprova orçamento e (futuro) paga.
- **Substituir o protótipo localStorage** por leitura real server-side, **scoped por `storeId`**.
- **Acesso por token/magic-link** por OS (não CPF global do navegador da loja). Provável **modelo novo**
  (`PortalAccessToken`) ou token assinado — **schema/auth → autorização explícita + ADR**.
- Conteúdo (já desenhado em copy): timeline **pública** (filtra dados internos — reusar a disciplina
  "cliente × interno" já provada na impressão V3), status, orçamento com **aprovar/recusar reais**
  (reusa `aprovarOrcamentoV3`/`recusarOrcamentoV3`), anexos **marcados como públicos** (a V3 já tem o
  conceito `publico` em anexos do V2), aviso de pronto, garantia.
- **Pagamento online (PIX/cartão):** maior bloco; depende de provedor (cruza com Stripe/PIX já no projeto)
  — **deixar para 3C.5/Fase 4**, não embutir no MVP do portal.
- Reaproveita componentes: o `PortalClienteModal` (V2) é um bom **molde de UI**; o `print-model` V3 é o
  **molde da regra de visibilidade** (o que o cliente pode ver).

### Bloco 3C.5 — Omni Agent + histórico 360° (amarração)
**Objetivo:** o que precisa de gente vira **tarefa**; o que aconteceu vira **histórico do cliente**.
- Eventos da V3 (retorno aberto, orçamento parado, garantia vencendo) → `OmniAgentCommand` PENDENTE
  (mecânica já existe; só configurar triggers).
- **Conversa/notificação → timeline 360° do cliente** (`WhatsAppConversation.clienteId` já liga) —
  cruza com **CRM Fase 2**; pode ficar como gancho.

---

## 5. Backlog (item · tamanho · prioridade · dependência · risco)

> S = ½ dia · M = 1–2 d · L = 3–5 d · XL = > 5 d. P0 = base/sem isso nada anda.

| # | Item | Tam | Prio | Depende de | Toca protegido? | Risco |
|---|---|:--:|:--:|---|:--:|---|
| 1 | Helper `emitirEventoOperacaoV3` + emissão em 5 actions | M | **P0** | — | não (só `lib/operacoes-v3`) | baixo |
| 2 | Normalizar telefone do cliente da OS no payload do evento | S | **P0** | 1 | não | baixo |
| 3 | Estender gatilhos para status **V3** (regras default) | M | **P0** | 1 | `lib/automation` (limítrofe) | médio (não quebrar V2) |
| 4 | Modelo/flag **opt-out** + checagem central | M | **P0** | — | **schema + `lib/whatsapp`** | alto (LGPD/ban) |
| 5 | Modo de entrega `meta_template_send` (janela 24h + HSM) | L | **P1** | 3,4 | **`lib/whatsapp`** | **alto (ban Meta)** |
| 6 | Tela **Notificações V3** real (regras + templates + logs) | L | **P1** | 3 | não | médio |
| 7 | Templates Meta cadastrados/aprovados | L | **P1** | conta Meta | externo | bloqueio externo |
| 8 | Cron **garantia vencendo** + NPS + orçamento parado | L | **P2** | 1,5 | infra cron nova | médio |
| 9 | **Portal real** (leitura server-side multi-loja + token) | XL | **P1** | — | **rota pública/auth + schema** | alto |
| 10 | Portal: **aprovar/recusar orçamento** real | M | **P1** | 9 | não (reusa actions) | médio |
| 11 | Portal: anexos públicos (fotos antes/depois) | M | **P2** | 9 + upload real | storage | médio |
| 12 | Portal: **pagamento online** PIX/cartão | XL | **P3** | 9 + provedor | financeiro/Stripe | alto |
| 13 | Omni Agent triggers (retorno/garantia/orçamento parado) | S | **P2** | 1 | não | baixo |
| 14 | Conversa/notificação → timeline 360° (CRM) | M | **P3** | CRM Fase 2 | não | baixo |
| 15 | Testes (modelo de evento, opt-out, visibilidade portal) | M | **P0→** | por bloco | não | baixo |

---

## 6. Dependências e ordem recomendada

```
3C.0 (eventos V3)  ──►  3C.1 (envio real) ──► 3C.3 (cron pós-venda)
       │                      ▲
       │                      │ (bloqueia 3C.1)
       └──► 3C.2 (opt-out) ───┘
3C.4 (portal real) ──► 3C.5 (pagamento/360°)   [trilha paralela, independe de 3C.1]
```

**Ordem sugerida (menor risco → maior valor):**

1. **3C.0 — Espinha de eventos da V3** (P0, sem área protegida, sem envio externo). Entrega visível:
   eventos da V3 aparecem nos **logs do WhatsApp HUB**. **Destrava tudo** e é seguro.
2. **3C.2 — Opt-out** (P0). **Pré-requisito legal/operacional** de qualquer envio. Toca schema →
   **autorização + ADR** antes.
3. **3C.1 — Notificações reais** + **Tela Notificações V3** (P1). Só depois de 1+2. **Autorização + ADR**
   (risco de banimento Meta). Começar com **1 loja-piloto** e **1 evento** (`pronta` = maior valor).
4. **3C.4 — Portal real (leitura + aprovação)** (P1). **Trilha paralela** — não depende do envio Meta;
   pode andar junto com 3C.0/3C.2. Toca rota pública/auth/schema → **autorização + ADR**.
5. **3C.3 — Garantia vencendo / NPS / orçamento parado** (P2). Depois do envio real estável.
6. **3C.5 — Pagamento online + 360°** (P3). Maior bloco, depende de provedor e do CRM.

---

## 7. Riscos de execução

| Risco | Categoria | Mitigação |
|---|---|---|
| **Banimento da conta Meta** por envio sem opt-out/spam | Negócio — P0 | Opt-out **antes** de ligar o envio (3C.2 precede 3C.1); piloto 1 loja; só template aprovado fora da janela 24h |
| **Tocar `lib/whatsapp/*` (protegido)** sem autorização | Governança — P0 | `meta_template_send` e opt-out exigem **autorização explícita + ADR** (CORE_RULES §5) |
| **Mudança de schema** (opt-out, token de portal) | Governança — P0 | `prisma/schema.prisma` é protegido → autorização explícita; migração **aditiva** + `db:push` controlado |
| **Rota pública `/portal` sem auth forte** vaza dados entre lojas | Segurança — P0 | Token/magic-link por OS, scope `storeId` server-side, **nunca** confiar em CPF do localStorage |
| **Status V2 × V3 divergentes** quebram automações existentes | Técnico — P1 | Não remover gatilhos V2; **adicionar** trilha V3 (a V2 segue em produção) |
| **Evento client-side não chega** (event-bus em memória) | Técnico — P1 | V3 chama `handleEvent` **server-side direto** (não usa o event-bus do browser) |
| **Vazamento de dado interno no portal** (custo/lucro/obs interna) | Negócio — P0 | Reusar disciplina "cliente × interno" já testada no `print-model` V3 |
| **Notificação duplicada** (V2 emite `os_finalizada` e V3 também) | Técnico — P1 | Idempotência por `osId + evento` + flag no payload (ex.: `notificadoEm`) |
| **Sem fila/outbox** → perda em pico/falha | Técnico — P2 | Começar síncrono best-effort + log; outbox real é follow-up (cruza ROADMAP_WHATSAPP) |

---

## 8. Critérios de pronto (DoD por bloco)

- **3C.0:** disparar uma transição na V3 gera linha em `WhatsAppAutomationLog` + comando Omni PENDENTE;
  `tsc` ✅, testes do modelo de evento ✅, **nenhum** envio Meta, V2 intacta.
- **3C.1:** loja-piloto recebe **de fato** "aparelho pronto" no WhatsApp ao marcar `pronta`; opt-out
  bloqueia envio; fora da janela usa template; log audita entrega real (`sendsMeta:true`).
- **3C.2:** opt-out persiste, é respeitado em 100% dos envios (teste), palavra-chave inbound grava opt-out.
- **3C.4:** cliente abre link da própria OS (token), vê status/timeline pública **sem dado interno**,
  aprova/recusa orçamento de verdade; outra loja **não** acessa via token trocado (teste de isolamento).
- **3C.3:** OS com garantia a ≤N dias gera evento/aviso 1× (idempotente); NPS dispara X dias após entrega.

---

## 9. Próximo GOAL recomendado

> **GOAL: Operações V3 — Fase 3C.0 (Espinha de Eventos da V3) + preparação do Opt-out**
> **Modo:** SAFE-lite (escopo `lib/operacoes-v3/**`); **Opus**.
>
> 1. Criar `emitirEventoOperacaoV3` (server-side, chama `handleEvent`) e emitir eventos cirúrgicos em
>    `nova-os-actions`, `status-actions`, `orcamento-actions`, `entrega-actions`, `retorno-actions`,
>    com `phoneDigits` normalizado do cliente. **Sem envio externo** (segue `internal_record_only`).
> 2. Mapear status V3 → gatilhos (sem remover os V2). Tela Notificações V3 **read-only** mostrando os
>    logs reais (`WhatsAppAutomationLog`) — prova de que os eventos chegam.
> 3. **Preparar (não executar)** o ADR de opt-out + o ADR "Notificação real ao cliente" e listar as
>    mudanças de schema necessárias — **levar ao Gate #1 antes** de qualquer toque em `lib/whatsapp/*`
>    ou `prisma/schema.prisma`.
>
> **Critério de pronto:** eventos da V3 visíveis no HUB/logs; `tsc` ✅; testes do modelo de evento ✅;
> **nada** enviado via Meta; V2/WhatsApp core/schema **intactos**. Os blocos 3C.1/3C.2/3C.4 abrem
> **somente após** autorização explícita + ADR aprovado.

**Por que 3C.0 primeiro:** é o **único bloco sem área protegida e sem envio externo** — entrega valor
observável (a V3 deixa de ser muda), destrava todos os demais, e **não consome a decisão de risco**
(envio Meta / opt-out / portal público), que fica para Gates dedicados.

---

## 10. Referências

- **Código:** `lib/events/event-bus.ts` · `lib/automation/automation-engine.ts` ·
  `app/api/automation/handle-event/route.ts` · `lib/whatsapp/automation-delivery.ts` ·
  `lib/whatsapp/whatsapp-service.ts` · `lib/whatsapp/send-message.ts` ·
  `lib/omni-agent/{omni-automation-engine,domain-events}.ts` · `lib/operacoes-v3/status-actions.ts` ·
  `app/portal/page.tsx` · `components/portal/cliente-portal.tsx` ·
  `components/operacoes/lovable/.../PortalClienteModal.tsx` ·
  `components/operacoes-v3/pages/{PortalClienteV3,NotificacoesV3}.tsx` ·
  `components/operacoes-v3/data/{navigation,screen-copy}.ts` · `prisma/schema.prisma` (models WhatsApp/OmniAgent).
- **Docs:** `ROADMAP_WHATSAPP.md` (P0 opt-out + marketing massa) · `ROADMAP_OPERACOES_OS.md` ·
  `CURRENT_STATUS.md` (Operações V3 Fases 1A→3B) · `CORE_RULES.md` §5 (áreas protegidas).
- **Governança:** `lib/whatsapp/*` e `prisma/schema.prisma` são **áreas protegidas** (ADR-0006 multi-loja);
  blocos 3C.1/3C.2/3C.4 exigem **autorização explícita + ADR** antes de qualquer escrita.

---

*Blueprint read-only. Nenhum código, schema, migração, banco, commit ou push. As prioridades são
recomendação técnica — a abertura de cada bloco (em especial 3C.1/3C.2/3C.4, que tocam áreas protegidas)
exige decisão humana e ADR.*
