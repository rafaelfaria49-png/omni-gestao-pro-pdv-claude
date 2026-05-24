# Importação não sobrescreve estoque de produto existente

> Auditoria + fix dos importadores de produtos — 2026-05-24.

## Regra

**Importação comum NÃO sobrescreve `Produto.stock` de produto já existente.**

- Produto **existente**: importação atualiza apenas dados **cadastrais** (nome,
  categoria, preço, custo, marca, barcode). O **estoque atual é preservado** —
  uma planilha antiga não reverte saldo já vendido.
- Produto **novo**: pode iniciar com o **estoque inicial** da planilha.
- Estoque só muda por **entrada / ajuste / inventário auditado**, via
  `app/actions/estoque.ts`, que grava `MovimentacaoEstoque` (ledger) **e** atualiza
  `Produto.stock` na mesma transação.

## Importadores auditados

| Caminho | Escreve `stock` em existente? | Ação |
|---|---|---|
| `lib/importador-avancado/persistidor.ts` (`/api/import/advanced`) | **Escrevia** (sheet>0) | **Corrigido** — update sem `stock`; create mantém |
| `app/api/ops/inventory/import/route.ts` (importador UI) | **Escrevia** (incondicional) | **Corrigido** — update só cadastral; create mantém |
| `lib/smart-sheet-import.ts` | Não (só parser, sem DB) | OK |
| `app/actions/cadastros.ts` (`salvarProduto`) | Só quando o form envia `estoque` (edição manual) | OK — não é importador |

## Fora de escopo (mantidos como estão, por design)

- **`app/api/ops/inventory` (PUT)** — sync de estoque do PDV/Operações
  (`lib/operations-store.tsx`). É **PDV** → não alterado.
- **`app/api/stores/import-catalog`** — clonagem de catálogo entre lojas. Modo
  `merge` (default) **não** escreve estoque; modo `overwrite` é **explícito/opt-in**
  e copia o estoque da loja de origem de propósito (não é importação de planilha).
- **`app/actions/estoque.ts`** — caminho **auditado** (ledger). É justamente o modo
  separado/auditado em que o estoque pode mudar.
- **`components/pdv-github-original/*`** — sub-app PDV isolado → não alterado.

## Critério atendido

- Importar planilha antiga **não** volta estoque vendido (existente preservado). ✅
- Produto novo ainda entra com estoque inicial. ✅
- `barcode` / `sku` / dedupe (matching gc-/imp-/EAN) inalterados. ✅
