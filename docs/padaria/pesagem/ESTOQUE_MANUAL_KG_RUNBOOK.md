# Runbook — rollout da migration de estoque fracionado (KG)

**Nada deste runbook foi executado em produção.** Cada etapa exige autorização humana
específica. `MIGRATION_AUTHORITY_ENABLED=false` permanece: a Vercel não aplica migrations.

| Item | Valor |
| --- | --- |
| Migration | `prisma/migrations/20261025120000_estoque_quantidade_fracionada/migration.sql` |
| sha256 (LF, 1041 bytes) | `f07242c4604660008b645004d3dfafde4da1656e728f803d9009f2f02a06a47e` |
| Efeito | `estoque_produtos.stock`, `produto_depositos.quantidade`, `movimentacoes_estoque.quantidade/estoqueAntes/estoqueDepois`: `integer` → `double precision`. Sem UPDATE/backfill. |
| Lock | `ALTER COLUMN TYPE` reescreve as 3 tabelas sob `ACCESS EXCLUSIVE` |

## Por que a ordem importa (provado em PG 17 descartável)

| Cliente Prisma × colunas | Leitura | Escrita |
| --- | --- | --- |
| **novo (`Float`) × `integer`** (código antes da migration) | correta | **falha fechada**: erro `22P03 incorrect binary data format`, nada gravado (`docs/ai-execution/_evidence/ESTOQUE-MANUAL-KG-001/`, teste `new_write`) |
| **antigo (`Int`) × `double precision`** (migration antes do código, ou deployment antigo depois) | inteiros corretos; fração **truncada** (3,96 → 3) | **corrupção silenciosa**: grava os bits do inteiro no double — 13 vira `6e-323`, −1 vira `NaN` (`old-client-WRITE-after-migration.txt`); o script de backfill da `main` zerou todos os depósitos assim (`backfill-main-vs-branch.txt`) |

Consequências:
1. **Nunca** deixar a aplicação antiga gravar depois da migration — nem a produção, nem
   URLs de deployments antigos, nem scripts da `main` (`db:backfill-deposito` antigo).
2. A ordem segura é **código novo primeiro, migration logo em seguida**, com escritas de
   estoque congeladas entre os dois passos. Se a migration atrasar, as gravações de estoque
   do código novo falham com erro (sem corromper) até ela terminar.
3. **Rollback de aplicação para a versão anterior é proibido depois da migration**: ela
   corromperia qualquer escrita de estoque, inclusive de produtos UN. Rollback só para um
   build que tenha o schema `Float` (ex.: reverter os commits de comportamento mantendo
   `prisma/schema.prisma` e a migration).

## Pré-requisitos (antes da janela)

- PR revisada com CI verde; autorização humana para: congelamento, deploy, migration.
- Confirmar o banco canônico (fingerprint do Neon de produção) — não o `candidate`.
- **Bloquear deployments antigos**: Vercel → Deployment Protection cobrindo URLs de
  deployments (não só previews), ou remoção dos deployments de produção anteriores a este.
  Sem isso, alguém em uma URL antiga corrompe saldo após a migration.
- Pré-checagem read-only (`BEGIN; SET TRANSACTION READ ONLY; … ROLLBACK;`):
  ```sql
  SELECT count(*), sum(stock)::text FROM estoque_produtos;
  SELECT count(*), sum(quantidade)::text FROM produto_depositos;
  SELECT count(*), sum(quantidade)::text, sum("estoqueDepois")::text FROM movimentacoes_estoque;
  -- dependências que bloqueariam ALTER TYPE (views/regras):
  SELECT DISTINCT c.relname, d.refobjsubid FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid
    JOIN pg_class c ON c.oid = r.ev_class
   WHERE d.refobjid IN ('estoque_produtos'::regclass, 'produto_depositos'::regclass, 'movimentacoes_estoque'::regclass);
  SELECT pid, now() - xact_start AS idade, state FROM pg_stat_activity WHERE xact_start IS NOT NULL ORDER BY 2 DESC LIMIT 5;
  SELECT pg_size_pretty(pg_total_relation_size('movimentacoes_estoque'));
  ```
  Guardar as somas para comparar depois.

## Janela (loja fechada)

1. **Congelar escritas de estoque**: loja(s) fechada(s), PDV/cadastros sem operação. Abas de
   PDV abertas reenviam vendas pendentes a cada 30 s: com o código novo antes da migration
   elas falham com erro e são reenviadas depois — não corrompem.
2. **Ponto de recuperação**: branch/snapshot Neon (PITR) imediatamente antes.
3. **Deploy do código novo** (merge da PR → Production `omni-gestao-pro`); confirmar no
   log `MIGRATION_SKIPPED` e `PROXY_PRISMA_ARTIFACT_VERIFIED`.
4. **Aplicar a migration** pela conexão direta (5432), conferindo o sha256 acima:
   ```sql
   SET lock_timeout = '5s';
   SET statement_timeout = '120s';
   BEGIN;
   -- conteúdo exato de migration.sql
   COMMIT;
   ```
   Registrar em `_prisma_migrations` conforme a estratégia de baseline vigente
   (`prisma migrate resolve --applied 20261025120000_estoque_quantidade_fracionada`).
   Com `lock_timeout`, falha em vez de enfileirar atrás de transação longa; repetir depois.
   Banco local mínimo: ~66 ms no total; produção cresce com `movimentacoes_estoque`.
5. **Verificar** (read-only): os 5 tipos são `double precision`; contagens e somas iguais
   às da pré-checagem; `SELECT count(*) FROM estoque_produtos WHERE stock <> trunc(stock)` = 0
   (ainda não há fração); `prisma migrate diff --from-url … --to-schema-datamodel prisma/schema.prisma`
   sem diferença.
6. **Smoke** com conta STORE da padaria de homologação (não a real "PAO FRANCES"): ficha de
   um produto KG sintético, Entrada 0,001 kg, histórico e ficha reaberta.
7. Reabrir a operação.

## Recuperação e rollback

| Situação | Ação |
| --- | --- |
| Migration falhou (lock/timeout) | Nada foi alterado (transação). Código novo segue falhando fechado em gravações de estoque; repetir o passo 4. Se precisar reabrir antes, **não** voltar o app antigo: manter loja fechada ou aplicar a migration. |
| Migration aplicada, problema no código novo | Corrigir para frente, ou rollback para build com schema `Float`. Nunca para o deployment anterior. |
| Precisa desfazer a migration | Só se **nenhuma** coluna tiver fração (`count(*) WHERE <col> <> trunc(<col>)` = 0 nas 5) **e** o app em produção voltar junto para `Int` na mesma janela: `ALTER … TYPE integer USING <col>::integer`. Com qualquer fração: proibido (perde gramas); restaurar do snapshot do passo 2 é a única volta e descarta movimentações posteriores. |
| Corrupção detectada (`6e-323`, `NaN`, valores denormais) | Congelar escritas; identificar a origem (URL antiga, script antigo); restaurar as linhas afetadas a partir do snapshot/livro (`movimentacoes_estoque` encadeado); depois rodar `db:backfill-deposito` **desta** versão (`--exec`), que confere a invariante por produto em milésimos. |

## Fora deste rollout

Venda por peso (continua bloqueada), Ajuste/contagem de inventário em KG e balança física
seguem fechados. Ver `ESTOQUE_MANUAL_KG.md`.
