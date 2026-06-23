---
name: omnigestao-whatsapp
description: >-
  Guides OmniGestão Pro WhatsApp HUB: Meta Cloud API, webhooks, inbound signature verification,
  conversations, labels, automations, and Prisma persistence. Use when editing lib/whatsapp,
  app/api/webhooks/whatsapp, or the WhatsApp Lovable hub.
---

# OmniGestão WhatsApp

Nome: **OmniGestão WhatsApp**

Use para WhatsApp HUB, Cloud API, webhook, mensagens, conversas, etiquetas e automações.

Leia primeiro `files/CORE_RULES.md`, depois `files/WHATSAPP_RULES.md` e `files/WHATSAPP_STATUS.md`.

Reforçar HMAC, idempotência por `wamid` e gravação Prisma.

## Mapa de `files/`

| Arquivo | Uso |
|---------|-----|
| `CORE_RULES.md` | Global — primeiro |
| `WHATSAPP_RULES.md` | HMAC, webhook, envio, automações |
| `WHATSAPP_STATUS.md` | Estado atual (trecho consolidado em `CURRENT_STATUS`) |
| `PRISMA_RULES.md` | Modelos e multi-store |
| `TYPESCRIPT_RULES.md` | Strict / aliases |
