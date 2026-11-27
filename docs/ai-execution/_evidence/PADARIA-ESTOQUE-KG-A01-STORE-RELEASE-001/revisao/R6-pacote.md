# Revisão R6 independente — PADARIA-ESTOQUE-KG-A01-STORE-RELEASE-001 (PR #315)

Você é o revisor independente. Modo SOMENTE LEITURA. Não altere arquivos, não rode git que escreva, não acesse rede, não conecte em banco.
Worktree: a pasta atual (branch `claude/estoque-manual-kg-001`).

## O que revisar

1. Merge `e1b31ad` = `origin/main` `0cd3418` (PR #320, Caixa Seguro STORE) na branch. Confira que a resolução foi automática e que `lib/operations-store.tsx` e `components/pdv-next/PdvBlackEdition.tsx` preservam AMBOS os lados: `git diff e1b31ad^1 e1b31ad -- lib/operations-store.tsx components/pdv-next/PdvBlackEdition.tsx` e `git diff e1b31ad^2 e1b31ad -- <mesmos>`.
2. O commit de código depois do merge: `git diff e1b31ad HEAD` (ignore `docs/ai-execution/_evidence/**`).

## Objetivo do GOAL

A01 (plataforma, tela histórica `components/dashboard/estoque/gestao-produtos.tsx`) e STORE (Estoque do cliente / Cadastros HUB) registram entrada manual de estoque em KG com 3 casas pelo MESMO writer canônico (`registrarEntradaEstoque` → `applyStockMutationTx`), sem segundo writer, sem truncar, sem liberar Ajuste/inventário KG e sem liberar venda por peso.

Mudanças:
- `gestao-produtos.tsx`: produto declarado por peso (`vendaPorPeso`/`vendaPesoIndisponivel` de `/api/ops/inventory`) não abre o formulário histórico (que faz `Math.floor(estoqueAtual)` e envia `stock` como ajuste absoluto); navega para `/dashboard/cadastros-v2?aba=produtos&produto=<dbId>`. Saldo KG exibido com 3 casas. `handleSave` recusa por defesa.
- `CadastrosHub.tsx`: parâmetro `produto` abre a ficha (`ProductAIModal`) via nova action `obterProdutoFicha` (gate igual ao `listProdutosPaginado`, `storeId` + `id`), com guarda por ref para não abrir resposta antiga.
- `app/actions/cadastros.ts`: `mapRow` içado para `mapProdutoListagemRow` (comportamento idêntico) + `obterProdutoFicha`.
- `app/api/produtos/route.ts` e `[id]/route.ts`: `stock` só inteiro seguro (antes `Math.floor`/`parseInt` truncavam 2.5/"2.5"); 409 com mensagem de entrada pela ficha para ajuste REST de produto por peso.
- `MovimentacaoEstoqueModal.tsx`: UN recusa fração em Entrada e Ajuste (antes `Math.trunc`).
- Cópia: writer de produto e ficha deixam de dizer "não há estoque fracionado operacional".
- E2E `e2e/platform-pilot/estoque-manual-kg.spec.ts` reescrito (STORE 0→10,500→12,750; A01 pela lista histórica; UN histórico; REST; outra loja; PDV).

## Pontos para atacar (procure falhas reais)

- Algum caminho da A01 ainda alcança o PATCH histórico com `stock` para produto KG? (`handleOpenModal` é o único que define `editingProduct`? Atalhos de voz, duplicidade "abrir existente", importação.)
- `obterProdutoFicha`: vazamento entre lojas, bypass de gate, ou divergência do DTO da listagem.
- Efeito do deep link: corrida/loop (props `m`/`onOpenProductConsumed` mudam a cada render), StrictMode, troca de loja, ficha aberta duas vezes, link reaberto após recarregar.
- `parseStock` novo: quebra de cliente legítimo (strings com espaço, "10", números grandes, negativos — negativos devem seguir caindo em "não pode ser negativo").
- Regressão em produto UN (saldo, ajuste, cadastro) e no contrato REST existente.
- Precisão: algum lugar converte KG com `Math.floor/trunc/round/parseInt` ou soma em float no caminho de entrada/exibição tocado?
- Isolamento por `storeId` em tudo que foi tocado.
- Venda por peso continua bloqueada (nada no diff deve afrouxar `assertProductCommercialSaleSupported` ou o guard do PDV).

## Formato do veredito

Primeira linha: `VEREDITO: APPROVE` ou `VEREDITO: REQUEST_CHANGES`.
Depois, achados numerados com severidade P0/P1/P2/P3, arquivo:linha, cenário concreto de falha e correção sugerida. Sem achado = diga explicitamente "0 achados".
