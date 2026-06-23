---
name: omnigestao-operacoes
description: >-
  Guides OmniGestão Pro Operações: OS, orçamento, estoque por OS, garantia, anexos, checklist,
  retirada, and Operações HUB V2. Use when editing app/actions/operacoes.ts, lib/operacoes,
  or the Lovable operacoes hub.
---

# OmniGestão Operações

Nome: **OmniGestão Operações**

Use para OS, orçamento, estoque por OS, garantia, anexos, checklist, retirada e HUB Operações.

Leia primeiro `files/CORE_RULES.md`, depois `files/OPERACOES_RULES.md` e `files/OS_STATUS.md` se precisar de estado real vs mock.

Reforçar risco de duplicidade OS legado vs HUB V2.

## Mapa de `files/`

| Arquivo | Uso |
|---------|-----|
| `CORE_RULES.md` | Global — primeiro |
| `OPERACOES_RULES.md` | Módulo (`docs/modules/OPERACOES.md`) |
| `OS_STATUS.md` | Check-in técnico HUB (`OPERACOES_HUB_V2_CHECKIN`) |
| `PRISMA_RULES.md` | Payload OS, multi-store |
| `TYPESCRIPT_RULES.md` | Strict / aliases |
