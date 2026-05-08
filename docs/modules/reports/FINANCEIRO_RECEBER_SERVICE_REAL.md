# Financeiro real — service de Contas a Receber (Prisma)

## Objetivo

Centralizar leitura e mutações **server-side** de `ContaReceberTitulo` em `lib/financeiro/services/contas-receber-service.ts`, alinhado aos **contratos** em `lib/financeiro/contracts/` (status, origem, `localKey`, payload, `valores`), **sem** alterar Prisma, **sem** migration e **sem** acoplar ao Financeiro HUB V2 (UI mock).

## API implementada

| Função | Descrição |
|--------|-----------|
| `listContasReceberByStore(storeId)` | Lista títulos da loja, `updatedAt` desc. |
| `getContaReceberById(storeId, id)` | Busca por `id` com filtro obrigatório de `storeId`. |
| `getContaReceberByLocalKey(storeId, localKey)` | Busca por chave composta (uso interno/API auxiliar). |
| `upsertContaReceber(input)` | Create/update idempotente por `(storeId, localKey)`; merge de payload + entrada opcional de histórico. |
| `cancelContaReceber(...)` | Status → `cancelado`; histórico `cancelamento`; não apaga linha. |
| `liquidarContaReceber(...)` | Quitação total do saldo em aberto; evento `liquidacao`; status → `pago`. |
| `registrarPagamentoParcial(...)` | Evento `pagamento`; status → `parcial` ou `pago` conforme saldo. |
| `estornarContaReceber(...)` | `titulo_completo` → `estornado` + `estorno_titulo`; `ultimo_pagamento` → `estorno_pagamento` e recalcula `pendente` / `parcial` / `pago`. |
| `buildContaReceberSummary(titulos)` | KPIs agregados (ver abaixo). |
| `sumPagamentosFromHistoricoPayload(payload)` | Soma líquida (`pagamento` + `liquidacao` − `estorno_pagamento`) para saldo e resumos. |

## Regras de negócio

- **Loja**: toda operação que localiza título exige `storeId` consistente (list/get/update).
- **Idempotência de negócio**: `upsertContaReceber` usa `@@unique([storeId, localKey])` como âncora; é a mesma linha que o adapter OS e a rota PDV usam para não duplicar título.
- **Sem delete**: nenhuma função remove registro do banco; cancelamento só altera status e payload.
- **Status canônicos**: leitura/escrita passa por `normalizeReceberStatus` onde aplicável; valores gravados seguem `RECEBER_STATUS`.
- **Histórico**: mutações relevantes acrescentam entradas via `appendFinanceiroHistorico` → array `payload.historico` (não substituir o array inteiro via `payloadPatch` bruto).

### Transições de status (resumo)

- Cancelar: → `cancelado` (bloqueado se já `pago`; `estornado` não cancela por este fluxo).
- Liquidar: → `pago` após registrar `liquidacao` pelo valor em aberto.
- Parcial: → `parcial` ou `pago` conforme soma dos pagamentos vs `valor` do título.
- Estorno título: → `estornado`.
- Estorno último pagamento: recalcula status a partir do saldo pago após `estorno_pagamento`.

## Idempotência

- **Upsert**: repetir o mesmo `localKey` na mesma loja atualiza o mesmo registro.
- **Operações de estado**: repetir cancelamento em título já `cancelado` devolve o registro atual (`ok: true`); liquidar já `pago` idempotente; estornar título já `estornado` idempotente.

## `buildContaReceberSummary`

Retorna:

- `totalAberto`: soma de saldos em aberto para títulos `pendente`, `parcial` ou `vencido` (saldo = `valor` − pagamentos líquidos do histórico; títulos `pago`/`cancelado`/`estornado` não entram no aberto).
- `totalVencido`: parcela do aberto cuja data de vencimento está atrasada (`isOverdueDateString`) ou status canônico é `vencido`.
- `totalPago`: soma dos `valor` dos títulos com status `pago`.
- `totalParcial`: soma dos valores já pagos (via histórico) dos títulos em `parcial`.
- `quantidade`: cardinalidade da lista recebida.
- `porStatus`: contagem por status canônico.

## Compatibilidade

- **Adapter OS** (`lib/financeiro/adapters/os-faturamento.ts`): não foi alterado; continua fazendo upsert próprio com a mesma `localKey` e payload rico. O novo service pode ser usado por APIs/actions futuras com o mesmo contrato de chave.
- **PDV à prazo**: rota `POST /api/ops/contas-receber-persist` permanece como está; o service espelha a mesma ideia de upsert por `(storeId, localKey)` quando integrado.
- **Payload legado**: `mergeFinanceiroPayload` e tolerância a `historico` ausente ou vazio; status não canônicos no campo `status` são normalizados quando possível.

## Próximos passos sugeridos

1. Encapsular a rota `contas-receber-persist` e futuras server actions para chamar `upsertContaReceber` (reduz duplicação de Prisma na borda HTTP).
2. Expor listagem/resumo para o painel legado ou para uma camada API dedicada, sem tocar no `financeiro.tsx` mock.
3. Alinhar com `buildMovimentoFromContaReceber` quando houver persistência de movimentos.
4. Testes unitários para `sumPagamentosFromHistoricoPayload`, `saldoAberto` implícito e `estornarContaReceber` (`ultimo_pagamento` com múltiplos eventos).
