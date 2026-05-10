# OmniGestão Pro — START HERE

Esta pasta `docs/` é a **memória técnica central** do OmniGestão Pro.

## O que é o OmniGestão Pro

SaaS/ERP omnichannel premium com módulos (Financeiro, Operações, PDV, Estoque, Marketplace, WhatsApp, IA) e suporte a multi-loja.

## Stack (alto nível)

- Next.js (App Router)
- TypeScript
- Prisma
- Tailwind + tokens por tema (`data-theme`)
- Módulos “HUB” isolados (ex.: Lovable) integrados gradualmente

## Regras principais desta memória

- Documentação deve apontar **real vs mock** e **caminhos de integração futura**
- Preferir links entre docs e caminhos de arquivos para rastreabilidade

## Onde encontrar cada tipo de documentação

- **Contexto e regras de IA**: `docs/ai/`
- **Arquitetura**: `docs/architecture/`
- **Módulos**: `docs/modules/`
- **Memória consolidada (onboarding longo)**: `docs/memory/`
- **Relatórios e auditorias**: `docs/modules/reports/`
- **Roadmap**: `docs/roadmap/`
- **Deploy / checklist produção**: `docs/deploy/PRODUCTION_CHECKLIST.md`
- **Temas e tokens**: `docs/themes/`
- **Ideias futuras**: `docs/future-ideas/`

## Ordem de leitura recomendada (para uma IA/Cursor nova)

1. **`docs/memory/OMNIGESTAO_MASTER_MEMORY.md`** — visão histórica e por módulo (memória viva)
2. `docs/PROJECT_MASTER.md`
3. `docs/ai/CURRENT_STATUS.md`
4. `docs/architecture/ARCHITECTURE.md`
5. `docs/architecture/MODULARIZACAO.md`
6. `docs/themes/THEMES.md`
7. `docs/roadmap/ROADMAP.md`
8. `docs/modules/FINANCEIRO.md`
9. `docs/ai/AGENT_HUB.md`

