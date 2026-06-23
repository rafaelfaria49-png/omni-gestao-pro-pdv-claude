---
name: omnigestao-master
description: >-
  Guides OmniGestão Pro work across architecture, project status, roadmap, global rules,
  multi-store scoping, Prisma, TypeScript, and shared UI conventions. Use when the task is
  not confined to a single domain skill (PDV, Financeiro, Operações, WhatsApp, Omni Agent,
  Marketplace) or when onboarding, auditing, or cross-cutting refactors are required.
---

# OmniGestão Master

Nome: **OmniGestão Master**

Use quando a tarefa envolver arquitetura geral, status do projeto, roadmap, regras globais, multi-loja, Prisma, TypeScript ou UI.

Instruir o Codex a ler primeiro `files/CORE_RULES.md`, depois o arquivo específico necessário.

Reforçar: não carregar todos os arquivos se a tarefa for de domínio específico.

## Mapa de `files/`

| Arquivo | Conteúdo |
|---------|------------|
| `CORE_RULES.md` | Regras globais — **ler primeiro** |
| `ARCHITECTURE.md` | Backend / camadas (cópia de `docs/architecture/BACKEND.md`) |
| `CURRENT_STATUS.md` | Estado atual do produto |
| `ROADMAP.md` | Fases macro |
| `KNOWN_LIMITATIONS.md` | Limitações consolidadas |
| `PRISMA_RULES.md` | Dados, payload, multi-store |
| `TYPESCRIPT_RULES.md` | Strict, aliases, hubs |
| `UI_RULES.md` | Tokens e layout (AppShell) |

Se a tarefa for só de um módulo (ex.: PDV), **preferir a skill de domínio** correspondente em vez de puxar todos os anexos desta skill.
