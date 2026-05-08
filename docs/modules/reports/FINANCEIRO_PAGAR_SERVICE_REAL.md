# Financeiro real — service de Contas a Pagar (Prisma)

## Objetivo

Criar um núcleo **server-side** oficial para Contas a Pagar em `lib/financeiro/services/contas-pagar-service.ts`, análogo ao service de Contas a Receber, **sem** alterar Prisma schema/migrations e **sem** conectar UI (painel legado e Financeiro V2 Lovable permanecem inalterados).

## Arquivo criado

- `lib/financeiro/services/contas-pagar-service.ts`

## API implementada

### Leitura

- `listContasPagarByStore(storeId)`
- `getContaPagarById(storeId, id)`
- `getContaPagarByLocalKey(storeId, localKey)`
- `buildContaPagarSummary(titulos)`
- `buildContaPagarAuditTrail(titulos)`

### Escrita (nunca deleta)

- `upsertContaPagar(input)` — idempotente por `(storeId, localKey)`
- `cancelContaPagar(...)` — status → `cancelado` + histórico
- `liquidarContaPagar(...)` — registra `liquidacao` do saldo em aberto + status → `pago`
- `registrarPagamentoParcialContaPagar(...)` — registra `pagamento`, status → `parcial` ou `pago`
- `estornarContaPagar(...)` — `titulo_completo` ou `ultimo_pagamento`

## Regras (resumo)

- **Sempre respeitar `storeId`** em list/get/mutações.
- **Idempotência**:
  - Operações de upsert são ancoradas em `@@unique([storeId, localKey])`.
  - `localKey` é obrigatório nos fluxos oficiais; para compatibilidade, pode ser inferido de `payloadPatch.localKey` ou `payloadPatch.id`.
- **Nunca deletar título**: cancelamento/estorno são transições de status.
- **Status canônicos**:
  - Normalização via `normalizePagarStatus`.
  - Escritas usam `PAGAR_STATUS` (`pendente`, `parcial`, `pago`, `vencido`, `cancelado`, `estornado`).
- **Histórico**:
  - Toda mutação relevante acrescenta entrada em `payload.historico` via `appendFinanceiroHistorico`.
- **Fornecedor / documento**:
  - `fornecedorId` (campo do Prisma) é aceito e preservado.
  - `fornecedorNome` e `numeroDocumento` são preservados no `payload` quando fornecidos.
  - `numeroDocumento` também é mantido no campo escalar `ContaPagarTitulo.numeroDocumento`.

## Summary (KPIs)

`buildContaPagarSummary` retorna:

- `totalAberto`: soma do **restante** de títulos `pendente` / `parcial` / `vencido`
- `totalVencido`: parte do aberto cujo vencimento está atrasado (`isOverdueDateString`) ou status canônico é `vencido`
- `totalPago`: soma do `valor` dos títulos `pago`
- `totalParcial`: soma do **pago** (derivado do histórico) dos títulos `parcial`
- `quantidade`: número de títulos
- `porStatus`: contagem por status canônico

## Compatibilidade

- **Payload simples/legado**: tolera `payload` ausente e `historico` ausente (cálculos se adaptam).
- **Status legado**: aliases como `atrasado` são normalizados para `vencido`.
- **`localKey` opcional** no schema: o service exige `localKey` para upsert idempotente, mas tenta inferir de `payloadPatch` para compatibilidade com integrações antigas.
- **Fornecedor**: aceita tanto `fornecedorId` real quanto `fornecedorNome` textual no payload.

## Próximos passos sugeridos

1. Criar endpoints de leitura/persistência (`/api/ops/contas-pagar-list`, `/api/ops/contas-pagar-persist`) usando este service, mantendo compatibilidade com `financeiro-store` (localStorage).
2. Criar rotas de baixa/estorno server-side para pagar (espelhando receber).
3. Integrar gradualmente KPIs do painel legado com `summary` do servidor (sem mexer no layout).
4. Só depois discutir fluxo de caixa/ledger persistente para conciliação (fora do escopo atual).

