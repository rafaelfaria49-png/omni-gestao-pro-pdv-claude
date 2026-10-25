# Estoque manual em KG — ESTOQUE-MANUAL-KG-001

Branch `claude/estoque-manual-kg-001`, base `origin/main` `913864f` (merge da PR #313).
Migration autorizada pelo dono em 25/10/2026 **somente** para PostgreSQL descartável.
Aplicar no Neon de produção, fazer merge ou deploy exige **nova autorização específica**.

## Situação por frente

| Frente | Estado nesta branch |
| --- | --- |
| `ESTOQUE_MANUAL_KG` | **Implementado e provado em ambiente isolado.** Entrada manual pela ficha, até 3 casas, conta STORE. Não publicado. |
| `VENDA_POR_PESO` | **Continua bloqueada.** Servidor recusa (`PRODUTO_POR_PESO_NAO_OPERACIONAL`). O PDV agora recusa já ao adicionar, com orientação correta. |
| `BALANÇA_FÍSICA_HOMOLOGADA` | **Não homologada.** Nenhum equipamento conectado; núcleo `lib/pesagem` intocado. |

## O que mudou

- **Banco**: `estoque_produtos.stock`, `produto_depositos.quantidade` e
  `movimentacoes_estoque.quantidade/estoqueAntes/estoqueDepois` passam de `integer` para
  `double precision` (migration `20261025120000_estoque_quantidade_fracionada`). É um
  alargamento sem perda: todo `int4` cabe exatamente em `float8`. Sem UPDATE nem backfill.
  As 5 colunas bastam: contagem de inventário, itens de venda/devolução/OS seguem `Int` e
  continuam fechados para peso (abaixo).
- **Aritmética sem ponto flutuante** (`lib/estoque/stock-quantity.ts`): o boundary canônico
  converte saldo, depósitos, livro e comando para unidades mínimas inteiras (UN/G = 1,
  KG = milésimo), roda a lógica existente de invariante/drift/idempotência sobre inteiros e
  só grava `milésimos / 1000`. Ler de volta é exato (`String(x)` do double = decimal mais
  curto). Valor com mais casas do que a unidade admite é **recusado**, nunca arredondado.
  Nenhuma tolerância.
- **Unidade do saldo** vem da declaração comercial canônica (`productCommercialFromMetadata`);
  legado `vendaPorPeso` = KG. Saldos antigos não são reinterpretados: `4` continua `4` (kg).
- **Contrato** (`product-commercial-contract.ts`): `estoqueFracionadoOperacional` = KG;
  `productStockMovementAvailability` devolve `{ disponivel: true, unidade: "KG", ajusteDisponivel: false }`.
  Novo guard `assertProductStockEntrySupported` (KG entra; G e declaração inválida não).
  `assertProductCommercialSaleSupported` **inalterado**: venda por peso segue bloqueada.
- **Server Action** `registrarEntradaEstoque`: aceita KG com 3 casas; UN fracionado agora é
  recusado em vez de truncado (`2,5 un` virava `2`).
- **UI**: ficha e listagem mostram `3,250 kg`; modal aceita só vírgula decimal (`2.500` é
  ambíguo em pt-BR e é recusado) e soma a prévia em milésimos.
- **Ajuste em KG continua indisponível**: o inventário grava contagem e snapshot `Int`
  (`Math.trunc`), então liberar Ajuste/contagem em KG truncaria 3,250 em 3. A contagem de
  inventário recusa produto por peso com mensagem própria.
- **PDV**: `/api/ops/inventory` e `/api/ops/inventory/lookup` (bipe remoto) projetam
  `vendaPesoIndisponivel` pela mesma função (`inventoryWeightSaleProjection`); todos os mapeadores
  de catálogo repassam a marca (`pdvWeightSaleFlag`); os 7 `addToCart` (Clássico,
  Supermercado, Venda Completa ×2, Controle de Consumo, Assistência, Black) recusam **antes**
  de olhar o estoque: "Venda por peso ainda não liberada … o estoque não precisa de ajuste".
  Antes: com saldo 0 dizia "sem saldo no estoque" (mandando repor por um caminho também
  bloqueado); com saldo, deixava lançar 1 unidade e só recusava no pagamento.
  `usePdvWeightBlockedCartGuard` mantém o invariante em 6 superfícies: comanda importada, venda
  em espera, carrinho persistido ou rascunho com produto bloqueado perdem a linha, com aviso,
  antes do pagamento.
- **Limite**: comando, delta e saldos resultantes precisam caber em `MAX_STOCK_UNITS`
  (15 dígitos) antes de gravar — um saldo acima disso seria aceito e travaria o produto depois.
- **Divergência em KG**: diagnóstico e erro de entrada não citam a aba Ajuste (inexistente em KG).
- **Backfill de depósitos** (`scripts/backfill-deposito.mjs` + `backfill-deposito-core.mjs`): copia
  o saldo exato e confere a invariante por produto em milésimos exatos; saldo com mais de 3 casas
  vira divergência explícita, nunca arredondamento.

## Provas

| Prova | Onde | Resultado |
| --- | --- | --- |
| Migration em PG 17 descartável com schema da `main` e dados legados `Int` | `_evidence/ESTOQUE-MANUAL-KG-001/` (`seed-legado-int.sql`, `migration-apply.log`, `columns-after.txt`) | 13 valores idênticos antes/depois (inclusive `2147483647`); `prisma migrate diff` banco × schema: sem diferença |
| Boundary no PG real (`lib/estoque/stock-ledger-kg.pg.test.ts`, só roda com `ESTOQUE_KG_PG_URL` local) | `db-after-proof.txt` | 2,500 + 0,750 = 3,250 em produto/depósito/livro; 20 entradas paralelas sob `FOR UPDATE` somam exato; chave idempotente em paralelo aplica 1×; 4 casas e outra loja recusadas; UN intacto |
| E2E STORE (`e2e/platform-pilot/estoque-manual-kg.spec.ts`) | local contra `next dev` + PG descartável: `local-e2e-*.png/json`; oficial: job `authenticated` da PR | ficha 0,000 → 2,500 → 3,250; banco 3.25/3.25/[2.5, 0.75]; histórico `+0,750 / +2,500`; ficha reaberta após reload = 3,250; PDV recusa com orientação de peso, 0 vendas |
| Backfill (script real 2× no PG descartável; o da `main` no mesmo banco) | `backfill-pg-real.txt`, `backfill-main-vs-branch.txt` | depósito truncado 3 → 3,96 re-sincronizado, invariante por produto verde, repetição idempotente; o script da `main` com cliente `Int` zerou os depósitos com valores denormais |
| Superfícies reais do PDV (`lib/pdv/weight-sale-guard-surfaces.component.test.ts`) | harness N5-C | Clássico (comanda), Supermercado (bipe), Assistência (carrinho persistido), Venda Completa (rascunho): nada chega ao pagamento, sem orientação de estoque; mutações do repasse da marca e do hook derrubam o teste |
| Unitários | `stock-quantity`, `stock-ledger-service` (KG), actions, inventário, contrato, modal, ficha, guard do PDV | verdes; suíte completa sem regressão contra a `main` (534 falhas pré-existentes nas duas árvores) |

## Rollout (exige nova autorização) — ver [ESTOQUE_MANUAL_KG_RUNBOOK.md](ESTOQUE_MANUAL_KG_RUNBOOK.md)

Provado em PG descartável: **cliente antigo (`Int`) gravando em coluna `double` corrompe em
silêncio** (13 → `6e-323`, −1 → `NaN`), enquanto **cliente novo (`Float`) gravando em coluna
`integer` falha com erro `22P03` sem gravar nada**. Ordem segura: trava `STOCK_WRITES_FROZEN=true`
(o boundary lança; a venda responde 5xx e fica na fila do PDV) → deploy do código novo → **remover**
deployments antigos e previews que alcançam produção → drenar → migration → verificar com a trava
ligada → desligar a trava. Rollback para a versão anterior é proibido depois da migration (só para
build com schema `Float`). Detalhes, locks e recuperação no runbook.

## Pendências conhecidas (fora deste escopo)

- Ajuste e contagem de inventário em KG (exige contagem/snapshot decimais).
- Venda por peso: quantidade decimal em `ItemVenda`/devolução, preço `round(kg × R$/kg, 2)`,
  pagamento, baixa e fiscal (`G5`/`G6` do relatório de prontidão).
- Balança física: levantamento e captura real (`G4`).
- `getEstoqueResumo.totalUnidades` soma UN e kg no mesmo número (indicador pré-existente).
- Sugestão de busca do PDV mostra `Estoque: 3.25` (ponto, sem unidade) — o item é recusado
  ao adicionar.
- Helpers dormentes sem caller (`agregarQuantidade`, `setEstoqueDeposito`) ainda truncam;
  `backfillLojaDepositoPrincipal` e o script `scripts/backfill-deposito.mjs`
  (`db:backfill-deposito`) passaram a copiar o saldo exato e a somar a invariante em milésimos
  — antes truncariam 3,250 em 3 nos dois lados e reportariam "invariante verde".
