# Módulo — Estoque

## Resumo executivo

O domínio de **Estoque** hoje existe em duas camadas:

- **Real (Prisma)**: `Produto.stock` por `storeId`, e consumo por OS via `OrdemServicoItem`.
- **Operações HUB V2 (ponte)**: OS persiste payload e, ao finalizar (`entregue`), pode consumir estoque real de forma idempotente (adapter).

## Integração com Operações HUB V2

- **Momento da baixa real**: somente quando a OS vira `entregue` (não na aprovação do orçamento).
- **Idempotência**: marca `payload.estoqueConsumido` + trilha em `payload.estoqueMovimentos[]`.
- **Movimento real**: decrementa `Produto.stock` em transação e cria `OrdemServicoItem`.
- **Restauração automática**: ao sair de `entregue` ou cancelar a OS, restaura estoque via `OrdemServicoItem` (idempotente).
- **Delta pós-revisão**: revisões de orçamento aprovado após consumo aplicam apenas a diferença (consumo/restauração parcial) com histórico no payload.

## Relatórios técnicos

- `docs/modules/reports/OPERACOES_HUB_V2_ESTOQUE_CHECKIN.md`
- `docs/modules/reports/OPERACOES_HUB_V2_OS_ESTOQUE_ADAPTER.md`
- `docs/modules/reports/OPERACOES_HUB_V2_PECAS_PRODUTO_REAL.md`
- `docs/modules/reports/OPERACOES_HUB_V2_ESTOQUE_RESTORE_DELTA.md`

