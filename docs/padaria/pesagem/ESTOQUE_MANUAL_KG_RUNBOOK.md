# Runbook — rollout da migration de estoque fracionado (KG)

**Nada deste runbook foi executado em produção.** Cada etapa exige autorização humana
específica. `MIGRATION_AUTHORITY_ENABLED=false` permanece: a Vercel não aplica migrations.

| Item | Valor |
| --- | --- |
| Migration | `prisma/migrations/20261025120000_estoque_quantidade_fracionada/migration.sql` |
| sha256 (LF, 1041 bytes) | `f07242c4604660008b645004d3dfafde4da1656e728f803d9009f2f02a06a47e` |
| Efeito | `estoque_produtos.stock`, `produto_depositos.quantidade`, `movimentacoes_estoque.quantidade/estoqueAntes/estoqueDepois`: `integer` → `double precision`. Sem UPDATE/backfill. |
| Lock | `ALTER COLUMN TYPE` reescreve as 3 tabelas sob `ACCESS EXCLUSIVE` |
| Trava de escrita | `STOCK_WRITES_FROZEN=true` (env): o boundary lança antes de travar a linha; venda responde 5xx e fica na fila do PDV com reenvio automático |

## Por que a ordem importa (provado em PG 17 descartável)

| Cliente Prisma × colunas | Leitura | Escrita |
| --- | --- | --- |
| **novo (`Float`) × `integer`** (código antes da migration) | correta | **falha fechada**: erro `22P03 incorrect binary data format`, nada gravado |
| **antigo (`Int`) × `double precision`** (migration antes do código, deployment antigo, preview de outra branch, script da `main`) | inteiros corretos; fração **truncada** (3,96 → 3) | **corrupção silenciosa**: 13 vira `6e-323`, −1 vira `NaN` (`docs/ai-execution/_evidence/ESTOQUE-MANUAL-KG-001/old-client-WRITE-after-migration.txt`); o backfill da `main` zerou todos os depósitos assim (`backfill-main-vs-branch.txt`) |

Logo: **depois da migration, nenhum código anterior a esta PR pode alcançar o banco**. Controle de
acesso (Deployment Protection) não basta: usuário autenticado em URL antiga, aba aberta com
fila de vendas, preview de outra branch ou script local continuariam gravando.

## Pré-requisitos (antes da janela)

1. PR revisada com CI verde; autorização humana para trava, deploy, exclusão de deployments e migration.
2. Banco canônico confirmado (fingerprint do Neon de produção, não o `candidate`).
3. **Inventário de escritores** que podem alcançar o banco de produção com código antigo:
   - deployments de produção anteriores dos dois projetos (`omni-gestao-pro`, `omni-gestao`);
   - **previews**: conferir o `DATABASE_URL` do ambiente Preview dos dois projetos. Se apontar para
     produção, todo preview de outra branch é escritor antigo — trocar o banco do Preview ou
     remover/desabilitar esses previews antes da migration;
   - worktrees/máquinas com `.env` de produção (scripts `db:*`, `node scripts/…` da `main`).
4. Pré-checagem read-only (`BEGIN; SET TRANSACTION READ ONLY; … ROLLBACK;`) — guardar os números:
   ```sql
   SELECT count(*), sum(stock)::text FROM estoque_produtos;
   SELECT count(*), sum(quantidade)::text FROM produto_depositos;
   SELECT count(*), sum(quantidade)::text, sum("estoqueDepois")::text FROM movimentacoes_estoque;
   SELECT DISTINCT c.relname FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid JOIN pg_class c ON c.oid = r.ev_class
    WHERE d.refobjid IN ('estoque_produtos'::regclass, 'produto_depositos'::regclass, 'movimentacoes_estoque'::regclass);
   SELECT pg_size_pretty(pg_total_relation_size('movimentacoes_estoque'));
   ```

## Janela (loja fechada)

1. **Ponto de recuperação**: branch/snapshot Neon (PITR).
2. **Trava ligada**: `STOCK_WRITES_FROZEN=true` no ambiente Production dos dois projetos.
3. **Deploy do código desta PR** (merge → Production). Confirmar no log `MIGRATION_SKIPPED` e
   `PROXY_PRISMA_ARTIFACT_VERIFIED`, e que o deployment novo responde com a trava: uma entrada
   manual de teste retorna "manutenção programada" sem gravar. Vendas de abas abertas passam a
   receber 5xx e **permanecem na fila local** (reenvio automático).
4. **Excluir escritores antigos de verdade**: remover (`vercel remove <url> --yes`) todos os
   deployments anteriores dos dois projetos e os previews que alcançam produção; conferir com
   `vercel ls` que só resta o deployment novo e que as URLs antigas respondem 404. Encerrar
   scripts locais com `.env` de produção.
5. **Drenar**: aguardar ≥ 5 min (maior `maxDuration` explícito do app = 180 s) e confirmar no banco
   que não há transação aberta tocando as 3 tabelas:
   ```sql
   SELECT pid, application_name, state, now() - xact_start AS idade, left(query, 80)
     FROM pg_stat_activity WHERE datname = current_database() AND xact_start IS NOT NULL;
   ```
6. **Aplicar a migration** pela conexão direta (5432), conferindo o sha256 acima:
   ```sql
   SET lock_timeout = '5s';
   SET statement_timeout = '120s';
   BEGIN;
   -- conteúdo exato de migration.sql
   COMMIT;
   ```
   Registrar em `_prisma_migrations` conforme a estratégia de baseline vigente
   (`prisma migrate resolve --applied 20261025120000_estoque_quantidade_fracionada`).
   Falha por `lock_timeout` não altera nada; repetir após nova drenagem.
7. **Verificar com a trava ainda ligada** (nada grava estoque): tipos `double precision`; contagens
   e somas **iguais** às da pré-checagem; `count(*) WHERE stock <> trunc(stock)` = 0;
   `prisma migrate diff --from-url … --to-schema-datamodel prisma/schema.prisma` sem diferença.
8. **Trava desligada**: remover `STOCK_WRITES_FROZEN` e redeployar (env só vale em deploy novo).
   As filas locais do PDV reenviam sozinhas; acompanhar até zerar as pendências.
9. **Smoke** com conta STORE da padaria de homologação (produto KG sintético, nunca o real
   "PAO FRANCES"): Entrada 0,001 kg, histórico, ficha reaberta; PDV recusa venda por peso.
10. Reabrir a operação.

## Recuperação e rollback

| Situação | Ação |
| --- | --- |
| Migration falhou (lock/timeout) | Transação desfeita, nada alterado. Trava segue ligada; repetir 5–6. Se precisar reabrir antes: desligar a trava **sem** migrar — o código novo falha fechado (`22P03`) em escritas de estoque, que ficam na fila. **Nunca** voltar o deployment anterior. |
| Migration aplicada, problema no código novo | Corrigir para frente, ou rollback para build com schema `Float` (reverter commits de comportamento mantendo schema e migration). Nunca para o deployment anterior. |
| Desfazer a migration | Só se **nenhuma** das 5 colunas tiver fração (`count(*) WHERE <col> <> trunc(<col>)` = 0) **e** o app voltar junto para `Int` na mesma janela, com trava e exclusão de escritores repetidas: `ALTER … TYPE integer USING <col>::integer`. Com qualquer fração: proibido (perde gramas); a única volta é o snapshot do passo 1, descartando movimentações posteriores. |
| Corrupção detectada (`6e-323`, `NaN`, denormais) | Ligar a trava; achar o escritor antigo (URL, preview, script) e removê-lo; restaurar as linhas afetadas pelo snapshot/livro encadeado (`movimentacoes_estoque`); rodar `db:backfill-deposito --exec` **desta** versão, que confere a invariante por produto em milésimos; desligar a trava. |

## Fora deste rollout

Venda por peso (continua bloqueada), Ajuste/contagem de inventário em KG e balança física
seguem fechados. Ver `ESTOQUE_MANUAL_KG.md`.
