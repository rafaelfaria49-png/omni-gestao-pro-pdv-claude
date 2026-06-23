# OmniGestão Pro — Limitações conhecidas (macro)

**Origem:** síntese de `docs/roadmap/ROADMAP.md`, `docs/ai/CURRENT_STATUS.md`, `docs/modules/FINANCEIRO.md`, `docs/modules/OPERACOES.md` e auditoria em `docs/modules/reports/AUDITORIA_GERAL_OMNIGESTAO_PRO.md`.

## Produto / dados

- **Financeiro HUB V2 (Lovable):** grande parte da UI ainda pode estar em **mock / demo** enquanto serviços Prisma reais vivem em `lib/financeiro/services/` e painéis legados.
- **Operações HUB V2:** OS + payload + timeline **reais** via Server Actions; partes do hub (ex.: certos fluxos de estoque no UI) podem ainda usar **dados locais** — ver relatórios `OPERACOES_HUB_V2_*.md`.
- **Duplicidade de superfície de OS:** fluxo **HUB V2** (`/dashboard/operacoes-v2`) vs **OS legada** (`/dashboard/os`) e APIs paralelas — risco de duas “verdades” percebidas pelo usuário.
- **Marketplace:** módulo majoritariamente **placeholder / roadmap** (`docs/modules/MARKETPLACE.md`).
- **Caixa PDV:** persistência majoritariamente **client-side** por loja (localStorage) — limitação multi-terminal documentada na auditoria.

## Integrações

- **NFC-e / fiscal:** não tratado como pipeline completo de produção; UI pode mencionar preparação — ver `docs/ai/MASTER_CONTEXT.md` §7.7.

## Documentação

- Alguns `docs/modules/*.md` (ex.: `VENDAS.md`, `WHATSAPP_AI.md`) ainda são **placeholders** — preferir `CURRENT_STATUS` + relatórios em `docs/modules/reports/`.
