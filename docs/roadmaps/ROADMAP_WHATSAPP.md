---
title: Roadmap — HUB WhatsApp
hub: whatsapp
status: vivo
owner: produto + Sonnet (técnico)
last_update: 2026-05-27
sprint_atual: nenhuma (próxima a planejar)
---

# 💬 Roadmap — HUB WhatsApp

> Estrutura conforme [`docs/roadmaps/INDEX.md §2.2`](./INDEX.md). 15 seções obrigatórias.
> Fonte da verdade do estado real: [`docs/ai/CURRENT_STATUS.md`](../ai/CURRENT_STATUS.md).

---

## 1. Visão

> **Canal único oficial de relacionamento — Meta Cloud API + Evolution (fallback), com webhook assinado HMAC, mensagens roteadas por `storeId`, e Omni Agent operando em cima.**

WhatsApp é o **principal canal de atendimento de SMB brasileiro**. O HUB precisa ser **mensageria-grade**: ordering preservada, exactly-once delivery, retry inteligente, anti-bloqueio (qualidade da conta Meta).

---

## 2. Objetivos

1. **Recebimento real** via Meta Cloud API com HMAC válido + roteamento por `storeId`.
2. **Envio real** com templates aprovados Meta + mensagens livres dentro de janela 24h.
3. **Omni Agent integrado** — comandos em texto livre acionam executores.
4. **Marketing em massa** com opt-out respeitado e qualidade da conta preservada.
5. **Histórico no CRM** — toda conversa entra na timeline 360° do cliente.

---

## 3. Concorrentes analisados

| Concorrente | O que aprendemos |
|---|---|
| **Wati / Take Blip** | Inbox multi-atendente — referência. |
| **Twilio** | Templates + qualidade — referência operacional Meta. |
| **Z-API / Evolution** | Fallback não-oficial — usado como complemento, não principal. |
| **Octadesk** | Roteamento por departamento — adoção planejada. |
| **GupShup** | Marketing em massa com BSP — referência de compliance. |

---

## 4. Diferenciais

- **Webhook canônico** em `app/api/whatsapp/webhook/route.ts` (GET handshake + POST Meta + Evolution).
- **HMAC verificado** com `WHATSAPP_APP_SECRET` (X-Hub-Signature-256).
- **Roteamento por `storeId`** via `WHATSAPP_WEBHOOK_STORE_ID` (default) + lookup por `phone_number_id`.
- **Envio manual** via `POST /api/whatsapp/send` (header `x-assistec-loja-id`).
- **Omni Agent** integrado com regex determinística (LLM governado pendente).
- **Aliases de variáveis de ambiente** aceitos (`META_WHATSAPP_VERIFY_TOKEN`, etc.) — onboarding tolerante.

---

## 5. Gaps atuais

| Gap | Severidade |
|---|---|
| **Inbox multi-atendente** ainda básico (Lovable mostra mock parcial) | 🟡 P1 |
| **Templates Meta** não cadastrados/aprovados em escala | 🟡 P1 |
| **Marketing em massa** sem orquestrador (envio agendado, batch, throttling) | 🔴 P0 |
| **Opt-out** sem registro persistente | 🔴 P0 |
| **Qualidade da conta** sem monitor/alerta | 🟡 P1 |
| **Histórico no CRM** parcial — conversas não aparecem na timeline 360° | 🟡 P1 |
| **Mídia** (imagens, áudio) ainda mock no inbox | 🟡 P1 |
| **Roteamento por departamento/agente** ausente | 🟡 P1 |
| **Botões interativos** (list, reply buttons) sem UI de criação | 🟢 P2 |
| **Fluxos pré-prontos** (boas-vindas, ausência, FAQ) inexistentes | 🟡 P1 |

---

## 6. Funcionalidades futuras

| # | Funcionalidade | Prioridade |
|---|---|---|
| 1 | **Opt-out persistente** + respeito automático | P0 |
| 2 | **Orquestrador de marketing em massa** (cron + throttling + retry) | P0 |
| 3 | **Templates Meta** cadastrados e versionados | P1 |
| 4 | **Inbox multi-atendente** real com roteamento | P1 |
| 5 | **Histórico no CRM** (conversa por cliente) | P1 |
| 6 | **Mídia** (imagem, áudio, doc) end-to-end | P1 |
| 7 | **Monitor de qualidade** da conta + alerta | P1 |
| 8 | **Botões interativos** + flows | P2 |
| 9 | **Fluxos pré-prontos** (boas-vindas, FAQ) | P2 |
| 10 | **Integração com Omni Agent** (executor por comando) | P1 |
| 11 | **Transferência de atendimento** entre operadores | P2 |
| 12 | **Relatórios** (tempo de resposta, SLA) | P2 |

---

## 7. Backlog

| Item | Tamanho | Pré-req |
|---|---|---|
| Modelar `OptOut` + checagem em todo envio | M | Decisão de granularidade (por número? por campanha?) |
| Orquestrador batch (queue + throttling Meta) | L | Definir BSP/limite diário |
| Cadastro/aprovação de templates (UI + sync Meta) | L | Conta Meta verificada |
| Inbox real com roteamento por agente | L | Decisão UX |
| Conversa → CRM timeline | M | CRM Fase 2 (tela 360°) |
| Upload de mídia → Meta (URL temporária) | M | Storage S3-compatible |
| Monitor de qualidade + alerta | S | Polling Meta Graph |
| Botões interativos no inbox | M | Templates prontos |

---

## 8. Fases

### Fase 1 — Infra estabilizada (~70% feita)
**Objetivo:** webhook recebendo + envio manual + HMAC válido.
**Saída:** ✅ webhook canônico · ✅ envio funcional · falta: opt-out persistente.

### Fase 2 — Marketing em massa
**Objetivo:** orquestrador + templates + opt-out + monitor qualidade.
**Saída:** loja-piloto rodando campanha de aniversariantes sem bloqueio Meta.

### Fase 3 — Inbox produtivo
**Objetivo:** inbox real, roteamento, histórico CRM, mídia.
**Saída:** atendente trabalha 100% pelo OmniGestão (não precisa do WhatsApp Web).

### Fase 4 — Automação
**Objetivo:** Omni Agent + fluxos pré-prontos + botões interativos.
**Saída:** > 30% das mensagens resolvidas sem operador.

### Fase 5 — Operacional pro
**Objetivo:** transferência, SLA, relatórios, multi-número por loja.

---

## 9. Dependências

| Depende de | Para quê |
|---|---|
| **CRM** | Cliente da conversa, timeline 360° |
| **Omni Agent** | Executor por comando (Fase 4) — serial obrigatório (ver matriz §4) |
| **Financeiro** | Régua de cobrança usa WhatsApp |
| **Marketing IA** | Campanhas disparadas via WhatsApp |
| **OS** | Notificação automática de status (OS Fase 3) |
| **Multi-loja** | Roteamento por `storeId` (já cumprido) |

---

## 10. Riscos

| Risco | Categoria | Mitigação |
|---|---|---|
| **Conta Meta banida** por má prática (spam, sem opt-out) | Negócio — P0 | Opt-out obrigatório + monitor qualidade + treinamento |
| **Webhook fora do ar** perde mensagens | Técnico — P0 | Meta reenvia 7 dias; fila + dead-letter |
| **HMAC inválido** aceita mensagens forjadas | Segurança — P0 | ✅ Já valida; testes de integração |
| **Throttling excedido** Meta bloqueia número | Técnico — P1 | Queue com limite por tier |
| **Roteamento errado** (`storeId` errado) vaza mensagem entre lojas | Negócio — P0 | Lookup defensivo + default seguro |
| **Token de acesso expira** | Técnico — P0 | Refresh ou rotação documentada |

---

## 11. Sprint atual

**Nenhuma.** Próxima sugerida: **SPRINT_NN_WHATSAPP — Opt-out persistente + monitor qualidade** (item P0 do backlog).

---

## 12. Status atual

WhatsApp tem **infra core funcional**: webhook canônico assinado, envio manual, roteamento por `storeId`, aliases de variáveis de ambiente para onboarding tolerante. Gaps críticos são **opt-out persistente** (risco legal e de banimento), **orquestrador de marketing em massa** (sem isso, qualquer envio acima de N msgs é manual), e **histórico no CRM** (conversas ainda não chegam à timeline 360°). Inbox Lovable mostra layout premium mas com mocks parciais — precisa virar real na Fase 3.

---

## 13. Métricas de sucesso

| Métrica | Meta |
|---|---|
| Mensagens recebidas processadas | **> 99.5%** |
| Latência webhook → DB | **< 500 ms** |
| Vazamento entre lojas (mensagem com `storeId` errado) | **0** |
| Envios sem checar opt-out | **0** (pós-Fase 2) |
| Score de qualidade Meta | **High** (sempre) |
| Mensagens resolvidas por Omni Agent (pós-Fase 4) | **> 30%** |

---

## 14. Blockers

| Blocker | Bloqueia |
|---|---|
| Aprovação Meta de templates | Marketing em massa |
| Decisão de BSP (Twilio? GupShup? direto?) | Throttling em volume |
| Storage S3-compatible | Mídia end-to-end |

---

## 15. Referências

- **ADRs relacionados:** ADR opt-out e BSP (a criar)
- **Sprints relacionadas:** entradas "WhatsApp" em `CURRENT_STATUS.md`
- **Docs de módulo:** `docs/modules/` (verificar/criar `WHATSAPP.md`)
- **Memórias persistentes:** — (nenhuma específica de WhatsApp ainda)
- **Governança:** `lib/whatsapp/*` core é área protegida; mudanças no webhook ou no envio exigem autorização explícita.
