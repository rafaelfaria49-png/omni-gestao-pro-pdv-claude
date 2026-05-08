# Operações HUB V2 — Adapter OS → Estoque real (Prisma)

**Objetivo:** consumir estoque **real** (Prisma `Produto.stock`) a partir da OS do Operações HUB V2, sem estoque paralelo, com idempotência e trilha no payload.

**Regras-chave:**
- **não** baixar na aprovação do orçamento
- baixar **somente** quando a OS vira `entregue`
- sem migration / sem alterar schema Prisma
- sem mexer em PDV/Financeiro

---

## 1) Fonte real do estoque (base reaproveitada)

- `Produto.stock` é a fonte de verdade.
- `OrdemServicoItem` registra o consumo real por OS (produtoId, quantidade, precoUnitario).

O adapter não cria novos modelos.

---

## 2) Adapter criado

- **Arquivo**: `lib/operacoes/adapters/os-estoque.ts`
- Funções:
  - `buildEstoqueMovimentosFromOS`
  - `consumeEstoqueFromOS`
  - `restoreEstoqueFromOS` (pronto para uso futuro; não plugado automaticamente em cancelamento)
  - `getEstoqueLocalKey`
  - `isOSEstoqueConsumivel`
  - `hasEstoqueAlreadyConsumed`

---

## 3) Idempotência (payload)

Marcadores no payload da OS:

- `payload.estoqueConsumido: true`
- `payload.estoqueConsumidoEm`
- `payload.estoqueMovimentos[]`

Se `payload.estoqueConsumido === true`:
- o adapter retorna `already_consumed`
- não baixa novamente

---

## 4) Fonte das peças (prioridade)

O adapter tenta consumir itens pela ordem:

1. `payload.pecas`
2. `payload.orcamento.pecas`

**Regra importante:** se a peça não puder ser mapeada para um `Produto` real, ela é **ignorada** (não quebra a OS).

### Como faz o mapping (sem migration)

- tentativa por `produtoId` = `peca.id` (caso já seja um `Produto.id`)
- fallback por `sku` (`peca.sku`) dentro do mesmo `storeId`

Se não houver match:
- registra como ignorada no resultado do consumo
- não executa baixa para aquele item

---

## 5) Como evita estoque negativo

O consumo roda em **transação**:

- valida estoque de **todos** os itens antes de aplicar (evita baixa parcial)
- se algum item tiver estoque insuficiente, a transação falha e o fluxo de status **não é quebrado** (ver integração).

---

## 6) Integração (momento da baixa)

- **Arquivo**: `app/actions/operacoes.ts`
- **Ponto**: `updateOSStatus`

Quando status operacional vira `entregue`:
- chama `consumeEstoqueFromOS({ storeId, osId, osPayload })`
- se der erro:
  - não quebra a mudança para `entregue`
  - adiciona evento de timeline `estoque_sync_erro`

Em caso de sucesso:
- o próprio adapter registra no payload e timeline:
  - `estoque_consumido`
  - `estoque_item_consumido`

---

## 7) Trilha no payload (movimentos)

Cada item consumido gera um movimento em `payload.estoqueMovimentos[]`:

- `id`
- `produtoId`
- `nome`
- `quantidade`
- `estoqueAnterior`
- `estoqueDepois`
- `origem: "operacoes-hub-v2"`
- `ordemServicoId`
- `createdAt`

---

## 8) Eventos e UI (timeline)

Eventos adicionados:

- `estoque_consumido`
- `estoque_item_consumido`
- `estoque_sync_erro`
- `estoque_restaurado`

Render:
- `components/operacoes/lovable/components/operacoes/Timeline.tsx` atualizado com ícones/cores.

---

## 9) Riscos remanescentes / próximos passos

- **Peças mock**: enquanto `payload.pecas` não usar `Produto.id` real, parte do consumo pode ser ignorada.
- **Reserva**: não implementada por regra (futuro).
- **Estorno automático**: `restoreEstoqueFromOS` existe, mas não está plugado em cancelamento/rollback ainda.
- **Delta em revisões**: se no futuro peças forem alteradas pós-consumo, será necessário consumo/estorno por delta.

