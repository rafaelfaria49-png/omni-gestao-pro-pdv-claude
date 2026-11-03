# Migrations candidatas Omni Print 004B/004C — LABORATÓRIO

**Não são migrations do Prisma.** Ficam fora de `prisma/migrations` para que nenhum `prisma migrate deploy`, build
da Vercel ou merge as aplique. Autorização recebida: somente organização segura destes arquivos. **Não é aprovação
do schema definitivo** (D02 segue `LOCAL_DISPOSABLE_ONLY`; D04 `NOT_APPROVED`).

## Ordem e arquivos

| Ordem | Arquivo | Origem | Conteúdo |
|---|---|---|---|
| 01 | `01_20261030_print_core_synthetic_local.sql` | checkpoint 004B (`a261014`, movido sem alteração de bytes) | 10 tabelas `print_*`, CHECKs, triggers, 2 índices UNIQUE pais (`vendas`, `pdv_terminais`) **sem CONCURRENTLY** |
| 02 | `02_20261102_print_local_agent_candidate.sql` | gerado por `../generate-agent-migration.mjs` | modo `LOCAL_AGENT`, provas `AGENT_*`, tabela `print_agent_links`, funções 004B substituídas por trocas contadas |
| futura 00 | `future/00_parent_indexes_concurrently.sql` | gerado | índices pais com `CREATE UNIQUE INDEX CONCURRENTLY`, fora de transação, `lock_timeout`, verificação de índice válido |
| futura 01 | `future/01_print_core_without_parent_indexes.sql` | gerado | 01 sem os dois índices pais; aborta se eles não existirem VÁLIDOS |

Hashes (SHA-256, LF) são conferidos por `node tools/print-004c-e2e/generate-agent-migration.mjs --check` e registrados
em `docs/print-004c-e2e/evidence/HASHES.json`.

## Índice UNIQUE sobre `vendas`

`01` cria `p004_vendas_id_store_uq` com `CREATE UNIQUE INDEX` comum dentro de transação: lock `SHARE`, que bloqueia
INSERT/UPDATE/DELETE em `vendas` durante a construção e, se houver uma venda em andamento, faz as vendas seguintes
enfileirarem atrás dele. Provado em PostgreSQL descartável (`index-strategy.pg.test.ts`): com uma venda aberta, o índice
comum faz uma nova venda estourar `lock_timeout`; com `CONCURRENTLY`, novas vendas gravam normalmente enquanto o índice
espera, e ele termina `indisvalid = true`.

**Estratégia futura (quando D02/D04 forem aprovados):** recortar uma migration nova a partir de `future/` e executar
`00` fora de transação (psql sem `-1`), em janela de baixo movimento, conferindo `pg_index.indisvalid`; se ficar
INVALID, `DROP INDEX CONCURRENTLY` e repetir. Depois aplicar `01` (futura) e `02` em transação. Não usar `IF NOT EXISTS`
para mascarar índice homônimo pré-existente. As FKs novas apontam para tabelas filhas vazias (validação instantânea).

## Aplicação em laboratório

```
PRINT_LAB_DIR=<fora do repo> node tools/print-004c-e2e/pg-lab.mjs init|start
node tools/print-004c-e2e/pg-lab.mjs reset print_lab_x                       # baseline main + 01 + 02
PRINT_LAB_LAYOUT=future node tools/print-004c-e2e/pg-lab.mjs reset print_lab_y # baseline + 00 + 01-futura + 02
```

Em ambas as composições `prisma migrate diff --from-url <lab> --to-schema-datamodel prisma/schema.prisma` resulta
vazio (paridade).

## Observações

- `prisma/schema.prisma` continua declarando os modelos `Print*` (relações e `@@unique([id, storeId])` nos pais).
  Isso não cria nada em produção por si; o código só acessa essas tabelas por SQL cru e atrás do gate desligado.
  Um `prisma db push` manual criaria as tabelas — não usar fora de laboratório.
- Scripts históricos de evidência do 004B (`tools/print-core-004b/*.mjs`) referenciam o caminho antigo; os bytes do
  arquivo 01 são idênticos aos do checkpoint e não foram reexecutados aqui.
