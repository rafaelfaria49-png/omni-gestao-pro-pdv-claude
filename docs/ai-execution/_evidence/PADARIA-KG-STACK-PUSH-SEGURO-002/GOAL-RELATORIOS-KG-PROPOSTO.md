# GOAL proposto (não iniciado) — RELATORIOS-QUANTIDADE-KG-001

Frente: Relatórios. Origem: achado P2-1 da revisão da pilha KG (PADARIA-KG-STACK-CONTINUIDADE-RECONCILIACAO-001),
reconfirmado na main `464190a`. **Bloqueador da ativação comercial do KG (antes do F1).** Não corrigido
na pilha KG por escopo.

## Problema

Com a pilha KG, uma linha vendida por peso grava `venda_itens.quantidade = NULL` e o peso em
`quantidadeKg` (Decimal, 3 casas). A devolução F8 por peso faz o mesmo em `itens_devolucao_venda`.
Os relatórios leem só `quantidade`:

| Arquivo | Leitura | Efeito com KG |
| --- | --- | --- |
| `lib/relatorios/products.ts:12,17,18,24` | `_sum.quantidade`, `jsonb_build_object('quantidade', i.quantidade)` | quantidade 0/NULL e preço médio 0; devolução KG some |
| `lib/relatorios/produtos-vendidos.ts` | consome o `quantidade` acima; descarta devolução com `qtd <= 0` | devolução KG descartada |
| `lib/relatorios/geral.ts:48,61,125,133,341` | `sum(quantidade)` por tipo, vendas e devoluções | "Qtd. vendida" e "Qtd. devolvida" sem os KG |
| `lib/relatorios/origins.ts:22,41` | `i.quantidade::float8` | quantidade NULL na origem do item |

Não há efeito em dinheiro: `lineTotal` e `valorTotal` continuam certos. O que fica errado são as
quantidades e o preço médio.

## Critérios

1. Somar UN e KG em colunas separadas (não somar 1 UN com 0,250 kg). Por exemplo, "Qtd. (UN)" e "Peso (kg)", com 3 casas.
2. Devolução KG abate do peso vendido e nunca é descartada por `quantidade` NULL.
3. Vendas sem KG: os números da #382 continuam idênticos. Os testes `geral.pg`, `enterprise.pg` e
   `produtos-vendidos` continuam verdes sem alteração de expectativa.
4. PG descartável com venda UN, venda KG, venda mista e devolução F8 KG. Isolamento entre lojas.
5. Sem schema nova, sem migration e sem tocar a pilha KG. Depende da #315 → #337 na main ou de uma base com as colunas KG.

## Fora do escopo

Ativar o KG, mudar a F8 ou mudar o PDV.
