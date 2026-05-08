# Changelog — OmniGestão Pro

## 2026-05-08

- Financeiro: **fundação carteiras / movimentos / ledger** — tipos `lib/financeiro/types/`, serviços puros `lib/financeiro/services/` (saldo derivado, previstos, eventos, `buildMovimentoFromContaReceber` sem persistência); gap Prisma documentado em `docs/modules/reports/FINANCEIRO_LEDGER_BASE.md`.
- Financeiro: camada de **contratos oficiais** (`lib/financeiro/contracts/`) — status, origens, local keys (`os-faturamento` preservado), payload JSONB helpers, valores/datas; adapter OS → receber passa a importar helpers sem mudar merge de revisões; doc `docs/modules/reports/FINANCEIRO_CONTRACTS_STATUS_BASE.md`.

## 2026-05-07

- Financeiro: **service Prisma Contas a Receber** (`lib/financeiro/services/contas-receber-service.ts`) — listagem, upsert idempotente por `(storeId, localKey)`, cancelar, liquidar, pagamento parcial, estorno (`titulo_completo` / `ultimo_pagamento`), resumos `buildContaReceberSummary` / `buildContaReceberAuditTrail`; histórico em `payload.historico` e contratos em `lib/financeiro/contracts/`; relatórios `FINANCEIRO_RECEBER_SERVICE_REAL.md` e `FINANCEIRO_RECEBER_API_UNIFICATION.md` (sem alteração de Prisma/UI V2).
- Financeiro: **service Prisma Contas a Pagar** (`lib/financeiro/services/contas-pagar-service.ts`) — list/get/upsert idempotente por `(storeId, localKey)`, cancelar, liquidar, pagamento parcial, estorno (`titulo_completo` / `ultimo_pagamento`), resumos `buildContaPagarSummary` / `buildContaPagarAuditTrail`; histórico em `payload.historico` e contratos em `lib/financeiro/contracts/`; relatórios `FINANCEIRO_PAGAR_REAL_CHECKIN.md` e `FINANCEIRO_PAGAR_SERVICE_REAL.md` (sem alteração de Prisma/UI V2).
- Financeiro: APIs Ops **Contas a Pagar** — `POST /api/ops/contas-pagar-persist` (upsert snapshot via service) e `GET /api/ops/contas-pagar-list` (rows + summary + audit + metadata), mantendo compatibilidade com payloads simples/legados; relatório `FINANCEIRO_PAGAR_API_PERSIST_LIST.md`.
- Financeiro: APIs oficiais (Financeiro) **Contas a Pagar — baixas/estornos server-side** — `POST /api/financeiro/contas-pagar/pagamento-parcial`, `liquidar`, `estornar` e `estornar-ultimo-pagamento` delegando para `contas-pagar-service` + `logsAuditoria` leve; relatório `FINANCEIRO_PAGAR_BAIXAS_E_ESTORNOS.md` (sem integração UI nesta entrega).
- Financeiro: painel legado **Contas a Pagar híbrido** — leitura server-side (`GET /api/ops/contas-pagar-list`) com fallback localStorage, persistência snapshot (`POST /api/ops/contas-pagar-persist`) e baixas/estornos server-first (`/api/financeiro/contas-pagar/*`), mantendo localStorage como espelho; relatório `FINANCEIRO_PAGAR_PAINEL_HIBRIDO.md`.
- Documentação: check-in **Financeiro V2 — real vs mock** (`docs/modules/reports/FINANCEIRO_V2_REAL_CHECKIN.md`), atualização de `docs/modules/FINANCEIRO.md` e tabela em `docs/ai/CURRENT_STATUS.md` para distinguir hub mock, painel legado e Prisma/adapters.
- Operações HUB V2: adicionada camada de **normalização segura de status** (sem migration), preservando granularidade no payload (`payload.operacaoStatus`) e mantendo compatibilidade com `StatusOrdemServico` do Prisma.
- Operações HUB V2: anexos agora usam persistência local **IndexedDB** + referência estável `local-idb://...` no payload (prepara migração futura para Storage real).
- Operações HUB V2: adapter idempotente **OS → Contas a Receber (Prisma)** materializa `ContaReceberTitulo` a partir de `faturamento*` no payload, com eventos na timeline e cancelamento seguro (sem deletar).
- Operações HUB V2: modularização segura do backend operacional (extração de helpers/serviços de payload, timeline, hidratação, status e sync financeiro) sem alteração de comportamento.
- Operações HUB V2: política segura para **revisão de orçamento aprovado** (histórico no payload + auditoria na timeline + marcação de revisão no título a receber, sem duplicidade).
- Operações HUB V2: adapter idempotente **OS → Estoque real (Prisma)** consome `Produto.stock` e cria `OrdemServicoItem` ao finalizar a OS (`entregue`), com trilha no payload e eventos na timeline.
- Operações HUB V2: padronização de peças/produtos com `produtoId` real no payload quando origem é o catálogo (Cadastros/Prisma), mantendo compatibilidade com mocks e fallback por SKU.
- Operações HUB V2: estoque — **restauração automática** ao sair de `entregue`/cancelar e **delta transacional** após revisão de orçamento aprovado (consumo/restauração parcial), com idempotência e histórico no payload.

