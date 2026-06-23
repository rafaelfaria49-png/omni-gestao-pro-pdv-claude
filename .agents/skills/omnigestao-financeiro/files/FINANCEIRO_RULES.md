# Módulo — Financeiro (HUB V2)

## Resumo executivo

O **Financeiro HUB V2** (`/dashboard/financeiro-v2`) está integrado como módulo **Lovable isolado** (`FinanceiroHubIsolated` → `routes/financeiro.tsx`). A UI é premium e cobre visão geral, receber, pagar, fluxo, carteiras, relatórios e configurações.

**Estado dos dados no arquivo do hub (`financeiro.tsx`):** hoje todo o conteúdo funcional visível ali é alimentado por **constantes MOCK** e **estado React local** — **sem** `FinanceiroProvider`, **sem** `localStorage` e **sem** chamadas Prisma/API neste módulo.

**Estado “financeiro real” no produto** existe **fora** desse arquivo: Prisma (`ContaReceberTitulo`, `ContaPagarTitulo`, vendas), adapter **OS → Contas a Receber**, persistência **PDV à prazo** via `/api/ops/contas-receber-persist` (agora centralizada no service de receber), e o painel legado `components/dashboard/financeiro/contas-receber.tsx` (mescla **localStorage prioritário** + servidor).

Check-in **real vs mock**: `docs/modules/reports/FINANCEIRO_V2_REAL_CHECKIN.md`.

## Contratos oficiais (base)

Camada **`lib/financeiro/contracts/`** — status, origem, `localKey`, payload JSONB e helpers monetários. Documentação: `docs/modules/reports/FINANCEIRO_CONTRACTS_STATUS_BASE.md`. O adapter OS → `ContaReceberTitulo` já referencia esses contratos mantendo a chave `os-faturamento:…`.

## Carteiras e movimentos (fundação)

Tipos **`lib/financeiro/types/`** (carteira, movimento, ledger) e serviços **`lib/financeiro/services/`** — saldo **derivado**, fluxo por período, previstos a partir de títulos, eventos de ledger e **`buildMovimentoFromContaReceber`** (sem DB). Gap Prisma (sem tabelas `Carteira` / `Movimento`) em `docs/modules/reports/FINANCEIRO_LEDGER_BASE.md`.

## Contas a receber — service real (Prisma)

**`lib/financeiro/services/contas-receber-service.ts`** concentra leitura e mutações server-side de **`ContaReceberTitulo`**: listagem por loja, upsert idempotente por **`localKey`**, cancelamento, liquidação total, pagamento parcial, estorno e **`buildContaReceberSummary`**. Usa contratos de status, payload (`mergeFinanceiroPayload`, `appendFinanceiroHistorico`) e **`safeMoney` / `isOverdueDateString`**. Não substitui automaticamente o Financeiro HUB V2 (mock) nem a rota PDV até ser integrado nas bordas HTTP/actions.

Relatório: `docs/modules/reports/FINANCEIRO_RECEBER_SERVICE_REAL.md`.

### Contas a receber — unificação de API

As rotas de escrita server-side para títulos de receber (`/api/ops/contas-receber-persist` e `/api/ops/sync-legacy-financeiro`) passaram a usar `upsertContaReceber` com `replacePayload: true`, mantendo o mesmo contrato de request/response e o mesmo snapshot de `payload` legado (`ContaReceberRow`) — apenas o núcleo Prisma saiu da borda HTTP para o service único.

Relatório: `docs/modules/reports/FINANCEIRO_RECEBER_API_UNIFICATION.md`.

## Contas a pagar — service real (Prisma)

Foi criado o núcleo server-side de Contas a Pagar em **`lib/financeiro/services/contas-pagar-service.ts`**, com upsert idempotente por **`localKey`** e mutações (cancelar, liquidar, parcial, estorno) registrando histórico em `payload.historico`, além de `buildContaPagarSummary` / `buildContaPagarAuditTrail`. **Ainda não está ligado** ao painel legado nem ao HUB V2 (Lovable); a UI atual de pagar segue em `FinanceiroProvider` + `localStorage`.

Relatórios:

- `docs/modules/reports/FINANCEIRO_PAGAR_REAL_CHECKIN.md`
- `docs/modules/reports/FINANCEIRO_PAGAR_SERVICE_REAL.md`
- `docs/modules/reports/FINANCEIRO_PAGAR_API_PERSIST_LIST.md`
- `docs/modules/reports/FINANCEIRO_PAGAR_BAIXAS_E_ESTORNOS.md`
- `docs/modules/reports/FINANCEIRO_PAGAR_PAINEL_HIBRIDO.md`

## Duas superfícies de produto

### A) Hub V2 Lovable (`financeiro.tsx`)

- Demonstração / UX completa com dados mock inline e modais.
- Configurações → “Integrações PDV/OS”: **apenas UI** (switches ilustrativos).

### B) Painel legado (`components/dashboard/financeiro/*` + `lib/financeiro-store.tsx`)

- **Carteiras**, **movimentações**, **contas a pagar**, **fluxo de caixa**: persistidos em **localStorage** por loja (`assistec-pro-financeiro-v2-{lojaId}`).
- **Contas a receber** (`contas-receber.tsx`): fluxo rico com prioridade de dados locais e espelho servidor quando aplicável.

As rotas `app/dashboard/financeiro/page.tsx` e `app/dashboard/financeiro/contas-a-receber/page.tsx` estão, neste repositório, como **placeholders** (“em construção”) — o componente pesado de receber existe no codebase mas não é montado por essas páginas stub.

## Integração OS (servidor)

O **Operações HUB V2** materializa **`ContaReceberTitulo`** real (Prisma) via adapter idempotente `lib/financeiro/adapters/os-faturamento.ts`, acionado por `lib/operacoes/services/financeiro-sync-service.ts` após mudanças no payload da OS (`faturamento*`). Eventos aparecem na **timeline** da OS.

Isso **não altera** automaticamente o Financeiro V2 mock até haver uma camada de dados compartilhada.

## Política de revisão pós-aprovação (OS)

Alterações em orçamento aprovado preservam histórico no payload da OS e propagam revisão para o **`payload` do título** (`revisoes[]` quando aplicável), mantendo a mesma `localKey` — sem duplicar conta.

## Próximo passo (futuro)

- Definir **fonte de verdade única** por domínio (títulos vs caixa vs relatório).
- Substituir mocks do hub V2 por **services/adapters** que leem/escrevem Prisma (ou APIs internas).
- Implementar writes consistentes para **`ContaPagarTitulo`** (hoje schema existe; uso TS na app não foi localizado no check-in).
- Decidir papel de **`LedgerSnapshot`** (motor de snapshot diário vs abandonar em favor de outro ledger).

## Relatórios técnicos

Ver `docs/modules/reports/` — em especial:

- `FINANCEIRO_V2_REAL_CHECKIN.md` — estado real vs mock (este ciclo).
- `FINANCEIRO_LEDGER_BASE.md` — carteiras/movimentos/ledger (fundação, sem migration).
- `FINANCEIRO_RECEBER_SERVICE_REAL.md` — service Prisma de contas a receber (núcleo server-side).
- `FINANCEIRO_PAGAR_SERVICE_REAL.md` — service Prisma de contas a pagar (núcleo server-side).
- Demais `FINANCEIRO_V2_*` — profundidade por área de UI mock/polimento.
