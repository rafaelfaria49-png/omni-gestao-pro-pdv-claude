---
name: omnigestao-financeiro
description: >-
  Guides OmniGestão Pro financeiro: contas a pagar/receber, DRE, carteiras, fluxo de caixa,
  ledger, fechamento, conciliação, and PDV/OS integrations into receivables. Use when editing
  lib/financeiro, finance API routes, or finance hub boundaries.
---

# OmniGestão Financeiro

Nome: **OmniGestão Financeiro**

Use para contas a pagar/receber, DRE, carteira, fluxo de caixa, ledger, fechamento, conciliação e integrações PDV/OS → financeiro.

Leia primeiro `files/CORE_RULES.md`, depois `files/FINANCEIRO_RULES.md` ou `files/FINANCEIRO_STATUS.md` conforme necessário.

Reforçar idempotência por `localKey`.

## Mapa de `files/`

| Arquivo | Uso |
|---------|-----|
| `CORE_RULES.md` | Global — primeiro |
| `FINANCEIRO_RULES.md` | Módulo + contratos (cópia de `docs/modules/FINANCEIRO.md`) |
| `FINANCEIRO_STATUS.md` | Check-in real vs mock (`FINANCEIRO_V2_REAL_CHECKIN`) |
| `PRISMA_RULES.md` | Multi-store, payload |
| `TYPESCRIPT_RULES.md` | Strict / aliases |
