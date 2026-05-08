# Operações HUB V2 — Estoque: restauração automática e delta de revisão

## Objetivo

Fechar o ciclo operacional do estoque vinculado à OS (Operações HUB V2) **sem migration** e **sem alterar schema Prisma**:

- consumo real na entrega (`entregue`)
- restauração automática ao reabrir/cancelar
- delta transacional quando orçamento aprovado for revisado após consumo
- trilha completa no payload + timeline
- idempotência e segurança contra duplicidade/estoque negativo

## Estado atual (base)

O adapter `lib/operacoes/adapters/os-estoque.ts` já:

- consome estoque real (`Produto.stock`) ao finalizar OS (`entregue`)
- cria `OrdemServicoItem` real
- é idempotente via `payload.estoqueConsumido === true`
- ignora peças que não resolvem para Produto real (com fallback por SKU)

## Restauração automática

### Quando roda

Integrado em `app/actions/operacoes.ts` (`updateOSStatus`):

- quando a OS **sai de `entregue`** (qualquer transição para outro status)
- quando a OS é marcada como **`cancelada`**

### Regras de idempotência

`restoreEstoqueFromOS` só restaura se:

- `payload.estoqueConsumido === true`
- `payload.estoqueRestaurado !== true`

### Fonte da restauração

Restaura a partir de `OrdemServicoItem` (real):

- incrementa `Produto.stock` conforme itens
- apaga os `OrdemServicoItem` da OS

### Eventos de timeline

Em restauração automática é registrado:

- `estoque_restaurado_automaticamente`

Falhas são registradas sem quebrar o fluxo:

- `estoque_sync_erro`

## Delta pós-revisão de orçamento (pós-consumo)

### Problema

Se o orçamento aprovado for revisado **depois** que o estoque já foi consumido (OS entregue), precisamos ajustar apenas a diferença:

- consumir adicional se aumentou quantidade
- restaurar parcial se diminuiu quantidade

Sem “desfazer tudo e refazer”.

### Helpers

No adapter `lib/operacoes/adapters/os-estoque.ts`:

- `computeEstoqueDelta(...)`: calcula diferenças por `produtoId`
- `applyEstoqueDelta(...)`: aplica delta em transação

### Gatilho (integração)

Em `app/actions/operacoes.ts` (`updateOSPayload`):

- quando existir `next.orcamentoRevisaoAtual.revisadoEm` (política de orçamento aprovado)
- e a OS já tiver consumo real (guardas dentro do adapter)

### Idempotência do delta

Campos novos no payload:

- `payload.estoqueUltimaRevisaoEm`: marca a última revisão para a qual delta foi aplicado
- `payload.estoqueDeltaHistorico[]`: trilha dos ajustes aplicados

O delta só é aplicado se:

- `estoqueConsumido === true`
- `estoqueRestaurado !== true`
- `estoqueUltimaRevisaoEm !== revisaoKey`

### Segurança

- **Sem estoque negativo**: antes de consumir adicional, valida `Produto.stock >= diferenca`
- **Sem duplicidade**: delta é aplicado uma vez por `revisaoKey`
- **Sem consumir mocks**: o “desired” vem de `buildEstoqueMovimentosFromOS`, que resolve somente itens com Produto real (via `produtoId`/`id` legado/`sku`)

### Eventos de timeline

Sucesso:

- `estoque_delta_aplicado`

Erro (sem quebrar o fluxo de update do payload):

- `estoque_delta_erro`

## Fluxo operacional completo (resumo)

1. OS vira `entregue` → consome estoque real e cria `OrdemServicoItem` (`estoque_consumido`).
2. OS sai de `entregue` ou é `cancelada` → restaura automaticamente estoque e remove `OrdemServicoItem` (`estoque_restaurado_automaticamente`).
3. Orçamento aprovado revisado após consumo → aplica delta (consumo/restauração parcial) e registra histórico (`estoque_delta_aplicado`).

## Riscos remanescentes

- Se houver múltiplas revisões concorrentes próximas, a idempotência depende de `revisaoKey` estável (hoje: `orcamentoRevisaoAtual.revisadoEm`).
- Ajustes parciais dependem da consistência de `buildEstoqueMovimentosFromOS` em resolver Produto real (principalmente por `produtoId`; fallback por SKU ajuda mas não garante match).

