# P02 — ordem futura de deploy, migration e rollback

GOAL: `OMNI-VESTUARIO-P02-PERSISTENCIA-GRADES-CATALOGO-001`. **Nada deste documento foi executado em
Production.** Cada passo abaixo exige autorização humana própria; a aprovação da PR não autoriza nenhum deles.

## O que vai para o banco

Migration `20261115120000_vestuario_p02_grades_catalogo` (aditiva):

| Objeto | Efeito em dados existentes |
|---|---|
| 5 tabelas `vestuario_*` (grades, tamanhos, cores, produto com grade, variantes) | Nenhum — tabelas novas e vazias. |
| `CREATE UNIQUE INDEX estoque_produtos_id_storeId_key` | Nenhum dado muda. `id` já é PK, então não há duplicata possível. Toma lock `SHARE` (bloqueia escrita, não leitura) enquanto constrói o índice — duração ~ a de reconstruir a PK de `estoque_produtos`. |
| Trigger `vestuario_produtos_colisao_trg` em `estoque_produtos` | Só age em INSERT/UPDATE que informa/altera `sku`, `barcode` ou `storeId`: 1 advisory lock transacional por loja + 1 lookup indexado em `vestuario_variantes` (vazia até alguém cadastrar grade). Recusa código já usado por variação da mesma loja. |
| Triggers de identidade/exclusão/colisão nas tabelas novas | Só nas tabelas novas. |
| CHECKs | Só nas tabelas novas. |

Sem DROP, TRUNCATE, ALTER de coluna, rename ou backfill. Produtos legados continuam simples; nenhum saldo,
ledger, venda ou `gradePlanejada` é tocado. Ensaio: `docs/ai-execution/_evidence/OMNI-VESTUARIO-P02-PERSISTENCIA-GRADES-CATALOGO-001/ENSAIO_MIGRATION.txt`.

## Ordem futura (somente com autorização específica a cada passo)

1. **Revalidar a base**: main atual, `_prisma_migrations` de Production (checksums) e o guard de migrations
   (`scripts/migration-authority-guard.mjs`). Em Production o build só roda `migrate deploy` com
   `MIGRATION_AUTHORITY_ENABLED=true` no projeto canônico; em preview/development é sempre SKIP.
2. **Medir antes** (read-only): `SELECT count(*), pg_size_pretty(pg_relation_size('estoque_produtos_pkey')) FROM estoque_produtos;`
   para estimar o tempo do índice. Escolher janela de baixo movimento de cadastro (PDV não cria produto no caminho comum;
   o lock só bloqueia escrita em `estoque_produtos`).
3. **Aplicar a migration ANTES do código** que lê as tabelas. O código desta PR é seguro sem a migration apenas com
   `VESTUARIO_CATALOG_ENABLED` ausente (padrão): a aba não aparece e nenhuma query toca `vestuario_*`.
   Exceção a conhecer: o writer de produto passa a traduzir qualquer unique violado sem produto conflitante como
   `DUPLICATE` (antes `PERSISTENCE`); não depende da migration.
4. **Conferir pós-migration** (read-only): 5 tabelas, 6 CHECKs validados, 5 triggers `vestuario_%`, drift zero
   (`prisma migrate diff --from-url … --to-schema-datamodel prisma/schema.prisma --exit-code`), 0 linhas em `vestuario_*`.
5. **Deploy do código** com todas as flags de vestuário ausentes. Production permanece desligada: além da allowlist,
   `vestuarioFeatureFlags` recusa o catálogo quando `VERCEL_ENV=production` nesta fase.
6. **Ativação comercial**: fora da P02. Exige mudança de código revisada (remover o bloqueio de Production) e
   autorização própria; estoque e venda continuam bloqueados até P04/P06/P07.

## Rollback operacional

| Situação | Ação segura |
|---|---|
| Problema na UI/servidor, sem dados de vestuário | Recuar o código; tabelas podem ficar (inertes). |
| Precisa remover o schema e **não há** dados `vestuario_*` | `docs/vestuario/rollback_20261115120000_vestuario_p02_grades_catalogo.sql` em transação (`psql -1 -v ON_ERROR_STOP=1`). Recusa sozinho se houver qualquer grade/cor/produto com grade/variante. Remove triggers, tabelas, funções, o índice novo e a linha em `_prisma_migrations`. Não toca produtos/saldos. |
| Já existem dados de vestuário | **Não** derrubar tabelas. Desligar `VESTUARIO_CATALOG_ENABLED` (catálogo some, dados preservados). Produtos pais com grade continuam bloqueados para venda/estoque pelo guard P01 (`metadata.vestuario`). |
| Trigger em `estoque_produtos` causando problema operacional | Com autorização: `DROP TRIGGER vestuario_produtos_colisao_trg ON estoque_produtos;` (reversível recriando-o pela seção "fora do Prisma" da migration). Perde-se só a prevenção de colisão no sentido produto→variação. |

Ensaiado em PostgreSQL 17 descartável: recusa com dados, reversão completa sem dados, reaplicação posterior.

## O que não fazer

- `prisma db push` ou `migrate reset` em qualquer banco real.
- Remover o guard P01 (`metadata.vestuario`) de produtos já criados com grade.
- Converter `gradePlanejada`, nome, atributos ou SKU de produto legado em variação.
- Inventar código interno/GTIN para "completar" variação (geração/etiqueta é P03).
