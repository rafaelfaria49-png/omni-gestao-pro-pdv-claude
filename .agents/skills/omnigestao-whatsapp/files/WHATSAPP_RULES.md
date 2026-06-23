# WhatsApp — Regras técnicas e de produto

**Fontes:** `docs/ai/CURRENT_STATUS.md` (seções WhatsApp), `lib/whatsapp.ts`, `lib/whatsapp/whatsapp-service.ts`, `app/api/webhooks/whatsapp`, `app/actions/whatsapp.ts`.

## HUB

- Rota UI: `/dashboard/whatsapp` (sub-app Lovable isolado; tema sincronizado com o global).
- Dados: conversas, automações e respostas rápidas via **Prisma** quando disponíveis; fallback controlado se banco vazio.

## Meta Cloud API

- Cliente HTTP: `lib/whatsapp.ts` — envio texto/template/mídia (Graph API, default v21.0).
- Envio gravado: `POST /api/whatsapp/send` e Server Actions em `app/actions/whatsapp.ts` (`sendWhatsAppTextAction`, etc.) com sessão NextAuth.

## Webhook inbound

- Rota: `POST /api/webhooks/whatsapp` (e rewrites em `next.config` se aplicável).
- **HMAC:** validar assinatura `X-Hub-Signature-256` com `WHATSAPP_APP_SECRET` (ou variável documentada no deploy).
- **Idempotência:** deduplicar por **`wamid`** (message id da Meta) antes de reprocessar; usar processamento assíncrono (`after()`) quando apropriado para não bloquear o ACK.
- Persistência: mensagens e conversas em modelos Prisma — não duplicar registros em retries da Meta.

## Automações

- Engine e triggers: ver `lib/automation/automation-engine.ts` e `lib/whatsapp/whatsapp-service.ts` (`ensureDefaultEventAutomations` deve preservar `targetPhone` configurado).
- Eventos de sistema: prioridade `actions.targetPhone` > payload conforme documentação em `docs/ai/BUGS_FIXED.md`.

## Segurança

- Tokens e secrets apenas **server-side** (`WHATSAPP_ACCESS_TOKEN`, etc.).
- Nunca logar corpo completo de webhook com PII em produção sem política de retenção.
