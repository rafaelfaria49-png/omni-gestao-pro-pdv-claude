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
- **PDV**: `/api/ops/inventory` projeta `vendaPesoIndisponivel` e os 7 `addToCart` (Clássico,
  Supermercado, Venda Completa ×2, Controle de Consumo, Assistência, Black) recusam **antes**
  de olhar o estoque: "Venda por peso ainda não liberada … o estoque não precisa de ajuste".
  Antes: com saldo 0 dizia "sem saldo no estoque" (mandando repor por um caminho também
  bloqueado); com saldo, deixava lançar 1 unidade e só recusava no pagamento.

## Provas

| Prova | Onde | Resultado |
| --- | --- | --- |
| Migration em PG 17 descartável com schema da `main` e dados legados `Int` | `_evidence/ESTOQUE-MANUAL-KG-001/` (`seed-legado-int.sql`, `migration-apply.log`, `columns-after.txt`) | 13 valores idênticos antes/depois (inclusive `2147483647`); `prisma migrate diff` banco × schema: sem diferença |
| Boundary no PG real (`lib/estoque/stock-ledger-kg.pg.test.ts`, só roda com `ESTOQUE_KG_PG_URL` local) | `db-after-proof.txt` | 2,500 + 0,750 = 3,250 em produto/depósito/livro; 20 entradas paralelas sob `FOR UPDATE` somam exato; chave idempotente em paralelo aplica 1×; 4 casas e outra loja recusadas; UN intacto |
| E2E STORE (`e2e/platform-pilot/estoque-manual-kg.spec.ts`) | local contra `next dev` + PG descartável: `local-e2e-*.png/json`; oficial: job `authenticated` da PR | ficha 0,000 → 2,500 → 3,250; banco 3.25/3.25/[2.5, 0.75]; histórico `+0,750 / +2,500`; ficha reaberta após reload = 3,250; PDV recusa com orientação de peso, 0 vendas |
| Unitários | `stock-quantity`, `stock-ledger-service` (KG), actions, inventário, contrato, modal, ficha, guard do PDV | verdes; suíte completa sem regressão contra a `main` (534 falhas pré-existentes nas duas árvores) |

## Plano de rollout (exige nova autorização)

**Ordem obrigatória: migration antes do código.** Código novo sobre colunas `integer`
gravaria 2,5 como 2 e 0,75 como 1 (cast de atribuição `float8 → int4` arredonda; conferido
no PG 17 local) — violação silenciosa.
`MIGRATION_AUTHORITY_ENABLED` segue `false`; a Vercel não aplica migration.

1. **Pré-checagem read-only no Neon** (`SET TRANSACTION READ ONLY`): contagem das 3 tabelas;
   nenhuma view/regra dependente das 5 colunas
   (`pg_depend` × `pg_rewrite` sobre `attnum` das colunas); nenhuma transação longa aberta.
2. **Ponto de recuperação**: branch/snapshot Neon imediatamente antes.
3. **Aplicar a migration** em janela com a loja fechada, com `SET lock_timeout = '5s'` e
   `statement_timeout` curto. `ALTER COLUMN TYPE` reescreve as 3 tabelas sob
   `ACCESS EXCLUSIVE`: leituras e escritas de estoque esperam até o fim (66 ms no banco
   local mínimo; em produção, proporcional ao tamanho — medir na pré-checagem). Com
   `lock_timeout` a migration falha em vez de enfileirar atrás de transação longa.
4. **Verificar**: tipos `double precision`; `count`, `sum(stock)`, `sum(quantidade)` iguais aos
   da pré-checagem; `count(*) WHERE stock <> trunc(stock)` = 0.
5. **Merge + deploy** (projeto Production real `omni-gestao-pro`), smoke read-only.

**Compatibilidade da aplicação anterior com o banco migrado** (provado localmente com o cliente
Prisma da `main`, `old-client-after-migration.txt`): lê inteiros exatamente; leitura de um saldo
fracionado vem **truncada** (3,96 → 3), sem erro. Seguro na janela migration → deploy porque
nenhum valor fracionado existe antes do código novo, e a aplicação anterior não grava produto
por peso (guards de entrada, ajuste, venda, OS e importação). Depois do deploy, **URLs de
deployments antigos** continuam acessíveis e mostrariam saldo KG truncado (só leitura).

**Rollback**
- *App*: reverter o deploy é seguro para UN. Produtos KG passariam a exibir saldo truncado
  (sem gravação possível). Preferir correção para frente.
- *Banco*: voltar para `integer` só se `count(*) WHERE <col> <> trunc(<col>)` = 0 nas 5
  colunas (`ALTER … TYPE integer USING <col>::integer`). Com qualquer valor fracionado o
  rollback de banco destruiria gramas: **proibido**; manter `double precision`.

## Pendências conhecidas (fora deste escopo)

- Ajuste e contagem de inventário em KG (exige contagem/snapshot decimais).
- Venda por peso: quantidade decimal em `ItemVenda`/devolução, preço `round(kg × R$/kg, 2)`,
  pagamento, baixa e fiscal (`G5`/`G6` do relatório de prontidão).
- Balança física: levantamento e captura real (`G4`).
- `getEstoqueResumo.totalUnidades` soma UN e kg no mesmo número (indicador pré-existente).
- Sugestão de busca do PDV mostra `Estoque: 3.25` (ponto, sem unidade) — o item é recusado
  ao adicionar.
- Helpers dormentes sem caller (`agregarQuantidade`, `setEstoqueDeposito`) ainda truncam;
  `backfillLojaDepositoPrincipal` passou a copiar o saldo exato.
