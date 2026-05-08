# Backend — OmniGestão Pro

## Visão geral

O backend do OmniGestão Pro hoje é composto por:

- **Next.js App Router**
  - **Server Actions** para mutações/consultas (ex.: Operações HUB V2)
  - **API Routes** para integrações e automações (ex.: `/api/ops/*`, `/api/automation/*`)
- **Prisma** como ORM para persistência (Postgres) com payloads `JsonB` quando necessário
- **Padrão híbrido (compatibilidade)** em módulos onde o modelo ainda evolui:
  - “source of truth” operacional em `payload` (JsonB) com snapshots
  - modelos Prisma com enums/tabelas mais simples, mantendo compatibilidade

## Operações HUB V2 — Server Actions

Arquivo orquestrador:

- `app/actions/operacoes.ts`

Responsabilidades (alto nível):

- `listOS(storeId)`: lê Prisma, hidrata payload e preserva status granular
- `createOS(storeId, input)`: cria OS (Prisma) e grava payload completo
- `updateOSStatus(storeId, osId, status)`: atualiza status (Prisma enum colapsado) e payload granular
- `updateOSPayload(storeId, osId, patch)`: patch seguro do payload com validações

### Modularização segura (2026-05-07)

Para reduzir risco e evitar “arquivo monolítico”, parte da lógica foi extraída para serviços em:

- `lib/operacoes/services/`
  - `os-helpers.ts`: parsing/tempo (`asOperacoesPayload`, `nowIso`)
  - `hydration-service.ts`: hidratação do `listOS`
  - `payload-service.ts`: validação/merge do patch e normalização de status efetivo
  - `orcamento-policy-service.ts`: política segura para revisão de orçamento aprovado (histórico + marcadores de faturamento)
  - `timeline-service.ts`: criação e append de eventos sem recursão
  - `status-service.ts`: conversão para enum Prisma (`toPrismaStatus`)
  - `financeiro-sync-service.ts`: sync idempotente OS→Contas a Receber após patch

Relatório:

- `docs/modules/reports/OPERACOES_BACKEND_MODULARIZATION.md`

### Operações HUB V2 — estoque (consumo/restauração/delta)

- Adapter: `lib/operacoes/adapters/os-estoque.ts`
  - Consumo real ao virar `entregue` (idempotente via `payload.estoqueConsumido`)
  - Restauração automática ao sair de `entregue`/cancelar (idempotente via `payload.estoqueRestaurado`)
  - Delta transacional após revisão de orçamento aprovado (idempotente via `payload.estoqueUltimaRevisaoEm`)

Relatório:

- `docs/modules/reports/OPERACOES_HUB_V2_ESTOQUE_RESTORE_DELTA.md`

## Contratos financeiros (2026-05-08)

Camada base **sem UI** em `lib/financeiro/contracts/`:

- Status canônicos (receber / pagar / movimento) + normalização de aliases (`atrasado` → `vencido`, etc.).
- Origens (`os`, `pdv`, `manual`, …) e rótulos.
- **`localKey`**: preserva `os-faturamento:{storeId}:{osId}` para o adapter OS; define prefixos oficiais (`receber:*`, `pagar:*`, `venda:`, `movimento:`) para novos fluxos.
- Tipos/helpers de `payload` JSONB (`buildContaReceberPayload`, `mergeFinanceiroPayload`, `appendFinanceiroHistorico`).
- Valores/datas (`safeMoney`, `parseDateStringSafe`, …).

O adapter `lib/financeiro/adapters/os-faturamento.ts` passou a consumir esses helpers **sem alterar** a semântica de merge de revisões.

Relatório: `docs/modules/reports/FINANCEIRO_CONTRACTS_STATUS_BASE.md`.

## Carteiras, movimentos e ledger (fundação — 2026-05-08)

Tipos em `lib/financeiro/types/` e serviços **puros** em `lib/financeiro/services/` (carteira, movimento, saldo derivado, eventos de ledger). **Sem** novas tabelas Prisma nesta entrega; gap documentado.

- `buildMovimentoFromContaReceber`: prepara movimento **previsto** a partir de título a receber (sem persistir).
- `LedgerSnapshot` existente permanece para futuro **rollup** diário, não substitui linhas de movimento.

Relatório: `docs/modules/reports/FINANCEIRO_LEDGER_BASE.md`.

## Financeiro — Contas a Receber (service Prisma, 2026-05-07)

- **`lib/financeiro/services/contas-receber-service.ts`**: operações sobre `ContaReceberTitulo` com `storeId` obrigatório nas buscas, upsert por `(storeId, localKey)` alinhado ao adapter OS e às rotas PDV/legacy (`/api/ops/contas-receber-persist`, `/api/ops/sync-legacy-financeiro`), auditoria em `payload.historico`, sem exclusão física de títulos.
- Resumo agregado **`buildContaReceberSummary`** (aberto, vencido, pago, parcial, quantidade, por status) e helper leve **`buildContaReceberAuditTrail`** para relatórios/auditoria futuros.

Relatórios: `docs/modules/reports/FINANCEIRO_RECEBER_SERVICE_REAL.md` e `docs/modules/reports/FINANCEIRO_RECEBER_API_UNIFICATION.md`.

## Financeiro — Contas a Pagar (service Prisma, 2026-05-07)

- **`lib/financeiro/services/contas-pagar-service.ts`**: operações sobre `ContaPagarTitulo` com `storeId` obrigatório nas buscas, upsert por `(storeId, localKey)`, cancelamento/liquidação/parcial/estorno, auditoria em `payload.historico` e suporte a fornecedor (`fornecedorId` no Prisma + `fornecedorNome` no payload) e `numeroDocumento`.
- Resumo agregado **`buildContaPagarSummary`** e helper leve **`buildContaPagarAuditTrail`** para relatórios/auditoria futuros.

Relatórios: `docs/modules/reports/FINANCEIRO_PAGAR_REAL_CHECKIN.md` e `docs/modules/reports/FINANCEIRO_PAGAR_SERVICE_REAL.md`.

APIs (Ops):

- `GET /api/ops/contas-pagar-list` — listagem + `summary`/`audit` (fonte server-side).
- `POST /api/ops/contas-pagar-persist` — upsert idempotente por `localKey` (snapshot legado).

APIs (Financeiro / mutações):

- `POST /api/financeiro/contas-pagar/pagamento-parcial`
- `POST /api/financeiro/contas-pagar/liquidar`
- `POST /api/financeiro/contas-pagar/estornar`
- `POST /api/financeiro/contas-pagar/estornar-ultimo-pagamento`

Relatório: `docs/modules/reports/FINANCEIRO_PAGAR_BAIXAS_E_ESTORNOS.md`.

## Observações e riscos

- **Artefatos locais**: `tsconfig.tsbuildinfo` deve ficar fora do git (ignorado) por ser gerado.
- **Evolução futura**: à medida que o domínio de OS amadurecer, parte do payload `JsonB` pode migrar para tabelas dedicadas (sem quebrar o HUB).

