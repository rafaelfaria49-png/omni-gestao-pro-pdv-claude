# Runbook — rollout da migration de estoque fracionado (KG)

**Nada deste runbook foi executado em produção.** Cada etapa exige autorização humana
específica. `MIGRATION_AUTHORITY_ENABLED=false` permanece: a Vercel não aplica migrations.

| Item | Valor |
| --- | --- |
| Migration | `prisma/migrations/20261025120000_estoque_quantidade_fracionada/migration.sql` |
| sha256 (LF, 1041 bytes) | `f07242c4604660008b645004d3dfafde4da1656e728f803d9009f2f02a06a47e` |
| Efeito | `estoque_produtos.stock`, `produto_depositos.quantidade`, `movimentacoes_estoque.quantidade/estoqueAntes/estoqueDepois`: `integer` → `double precision`. Sem UPDATE/backfill. |
| Lock | `ALTER COLUMN TYPE` reescreve as 3 tabelas sob `ACCESS EXCLUSIVE` |
| Trava de escrita | `STOCK_WRITES_FROZEN=true` (env): o boundary lança antes de travar a linha; venda responde 5xx e fica na fila do PDV com reenvio automático. **Só existe no código desta PR** — não protege deployment, preview ou script antigo |
| Isolamento dos escritores antigos | **Estratégia B** (`ESTOQUE_MANUAL_KG_ROLLOUT_REMEDIACAO.md`): Production passa a usar o papel `omni_runtime_v2`; na janela o papel antigo (`neondb_owner`) perde `CONNECT` em `omnigestao_prod` e tem as sessões encerradas. Scripts em `rollout/`. Status atual: **NO-GO** (falta ensaio num branch Neon e autorizações) |

## Por que a ordem importa (provado em PG 17 descartável)

| Cliente Prisma × colunas | Leitura | Escrita |
| --- | --- | --- |
| **novo (`Float`) × `integer`** (código antes da migration) | correta | **falha fechada**: erro `22P03 incorrect binary data format`, nada gravado |
| **antigo (`Int`) × `double precision`** (migration antes do código, deployment antigo, preview de outra branch, script da `main`) | inteiros corretos; fração **truncada** (3,96 → 3) | **corrupção silenciosa**: 13 vira `6e-323`, −1 vira `NaN` (`docs/ai-execution/_evidence/ESTOQUE-MANUAL-KG-001/old-client-WRITE-after-migration.txt`); o backfill da `main` zerou todos os depósitos assim (`backfill-main-vs-branch.txt`) |

Logo: **depois da migration, nenhum código anterior a esta PR pode alcançar o banco**. Controle de
acesso (Deployment Protection) não basta: usuário autenticado em URL antiga, aba aberta com
fila de vendas, preview de outra branch ou script local continuariam gravando.

Hoje Production, Preview/candidate e o admin de migração usam o **mesmo papel `neondb_owner`, com a
mesma senha** (só o database muda), e esse papel herda `pg_write_all_data` via `neon_superuser`. Por isso
nem excluir deployments nem trocar a senha nem tirar posse/GRANT de tabela resolvem; o que corta é
`CONNECT` no database + encerrar as sessões, conferido no catálogo (provado em PG 17 com a mesma
topologia: `docs/ai-execution/_evidence/ESTOQUE-MANUAL-KG-001/rollout-remediation/`).

## Pré-requisitos (antes da janela)

1. PR revisada com CI verde; autorização humana para cada passo abaixo (lista em
   `ESTOQUE_MANUAL_KG_ROLLOUT_REMEDIACAO.md` §7).
2. Banco canônico confirmado (fingerprint do Neon de produção, não o `candidate`).
3. **Escritores antigos** (inventário em `…/rollout-remediation/50-vercel-inventario.md`): hoje 14
   deployments de Production do `omni-gestao-pro` alcançam `omnigestao_prod`; 52 previews e as máquinas
   com `.env` de candidate têm a mesma credencial. Não são removidos: perdem acesso no corte (passo 5).
4. **Pré-janela da estratégia B** cumprida, cada item conferido pela saída do script:
   - Preview em banco/papel próprios (fora do cluster de produção);
   - `rollout/01-papeis.sql` e `rollout/02-grants-runtime.sql` aplicados (`KG_PAPEIS_OK`, `KG_RUNTIME_GRANTS_OK`);
   - a credencial de `omni_runtime_v2` **ainda não** está em env nenhuma da Vercel: ela só entra junto com o
     deploy da PR (passo 3 da janela) — um build `Int` com ela sobreviveria ao corte (revisão R1, P1);
   - **ensaio completo num branch Neon** (01→05, suspender/retomar o compute, `06` de novo, cliente antigo
     pela URL do pooler recusado).
5. Checklist das duas lojas devolvido (`ESTOQUE_MANUAL_KG_CHECKLIST_LOJAS.md`). `SALE_SERVER_NUMBERING_ENABLED`
   e o projeto canônico ficam como estão durante toda a janela.
6. Pré-checagem read-only (`BEGIN; SET TRANSACTION READ ONLY; … ROLLBACK;`) — dimensiona o lock e
   acha dependências (a verificação de valores é feita dentro da transação do passo 7):
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
3. **Deploy do código desta PR** (merge → Production), **na mesma sequência** em que `DATABASE_URL`/`DIRECT_URL`
   de Production passam a `omni_runtime_v2`. Conferir que todo deployment criado depois da troca da env é do
   commit da PR (ou posterior); qualquer outro é removido antes do passo 5. Confirmar no log `MIGRATION_SKIPPED` e
   `PROXY_PRISMA_ARTIFACT_VERIFIED`, e que o deployment novo responde com a trava: uma entrada
   manual de teste retorna "manutenção programada" sem gravar. No domínio canônico, vendas de abas
   abertas passam a receber 5xx e **permanecem na fila local** (reenvio automático).
4. **Esvaziar as filas das origens antigas antes de removê-las.** A fila de vendas pendentes vive
   no navegador, por origem: uma aba aberta numa URL de deployment (não no domínio canônico) só
   reenvia para aquela URL. Enquanto o banco ainda é `integer`, o código antigo grava corretamente,
   então: identificar caixas em URL de deployment, deixar sincronizar até **Pendências = 0** ou
   registrar as pendências (pedido, itens, pagamentos, `clientSaleId`) para lançamento posterior
   com a mesma identidade. Só então seguir.
5. **Cortar o papel antigo no banco** (estratégia B), nesta ordem, lendo a saída de cada script —
   exit code não basta (REVOKE de quem não é dono sai com WARNING e exit 0):
   - `rollout/03-corte-posse.sql` (papel antigo, `-1`) → `KG_CORTE_POSSE_OK`. Espera vendas em voo, que
     ainda gravam no regime `integer`; `lock_timeout` estourado não altera nada, repetir;
   - `rollout/04-corte-conexao.sql` (`omni_migrator`, `-1`) → `KG_CORTE_CONEXAO_OK`;
   - `rollout/05-encerrar-sessoes.sql` (papel antigo, database `neondb`) → `KG_SESSOES_ANTIGAS_ZERO`;
     **logo depois do 04**: entre os dois, um cold start pelo pooler ainda entra, porque reaproveita
     uma conexão de servidor já aberta (ensaio Neon 002);
   - `rollout/06-verificacao.sql` → papel antigo `connect=false`, nenhuma sessão dele, CONNECT só para
     `omni_runtime_v2` e `omni_migrator`.
   Deployments, previews e scripts antigos continuam existindo, mas recebem
   `FATAL: permission denied for database`. A retenção da Vercel (30 dias) os remove depois.
   Até o passo 7, `rollout/99-desfazer-corte.sql` reabre tudo.
6. **Conferir de novo após 5 min** (maior `maxDuration` explícito do app = 180 s): `06-verificacao.sql`
   igual ao anterior e nenhuma transação aberta tocando as 3 tabelas. O tempo não substitui a conferência:
   ```sql
   SELECT pid, usename, application_name, state, now() - xact_start AS idade, left(query, 80)
     FROM pg_stat_activity WHERE datname = current_database() AND xact_start IS NOT NULL;
   ```
7. **Aplicar a migration verificada** com a credencial do `omni_migrator`, pela conexão direta (5432):
   `psql -v ON_ERROR_STOP=1 -1 -f docs/padaria/pesagem/estoque-kg-migration-apply.sql`.
   O script trava as 3 tabelas, tira um **retrato por linha** (md5 de `id:valores`), roda o DDL
   exato da migration e compara o retrato depois; qualquer diferença levanta
   `KG_MIGRATION_RETRATO_DIVERGENTE` e desfaz tudo. Como o retrato e o DDL acontecem sob o mesmo
   lock, criação de produto, exclusão ou reenvio não se intercalam — a referência não depende de
   números colhidos antes da janela. Provado em PG 17 descartável: caminho feliz, reaplicação
   idempotente e prova negativa (`migration-apply-verificada.txt`, `migration-apply-prova-negativa.txt`).
   Depois, registrar em `_prisma_migrations` conforme a estratégia de baseline vigente
   (`prisma migrate resolve --applied 20261025120000_estoque_quantidade_fracionada`).
   Falha por `lock_timeout` não altera nada; repetir após nova drenagem.
   Opcional, só se aprovado em revisão própria: `rollout/07-guard-check-opcional.sql` (CHECK "finito em
   milésimos" que faz um cliente Int que ainda alcance o banco falhar em vez de corromper).
8. **Conferir com a trava ainda ligada**: `count(*) WHERE stock <> trunc(stock)` = 0 nas 5 colunas;
   `prisma migrate diff --from-url … --to-schema-datamodel prisma/schema.prisma` sem diferença.
9. **Trava desligada**: remover `STOCK_WRITES_FROZEN` e redeployar (env só vale em deploy novo).
   As filas locais do PDV reenviam sozinhas; acompanhar até zerar as pendências.
10. **Smoke** com conta STORE da padaria de homologação (produto KG sintético, nunca o real
   "PAO FRANCES"): Entrada 0,001 kg, histórico, ficha reaberta; PDV recusa venda por peso.
11. Reabrir a operação.
12. Depois: `omni_migrator` com `NOLOGIN` fora de janelas; trocar a senha do `neondb_owner` quando Preview
    e máquinas locais já não dependerem dele (fecha o caminho humano de reabrir o corte — o papel antigo
    tem `ADMIN OPTION` sobre os papéis que criou).

## Recuperação e rollback

| Situação | Ação |
| --- | --- |
| Corte (passo 5) falhou ou o app novo não acessa o banco, migration ainda não aplicada | `rollout/99-desfazer-corte.sql` (recusa se a migration já tiver sido aplicada); conferir com `06`. App novo sem algum privilégio: GRANT pelo `omni_migrator`, nunca voltar Production para `neondb_owner` |
| Migration falhou (lock/timeout) | Transação desfeita, nada alterado. Trava segue ligada; repetir 6–7. Se precisar reabrir antes: desligar a trava **sem** migrar — o código novo falha fechado (`22P03`) em escritas de estoque, que ficam na fila. **Nunca** voltar o deployment anterior. |
| Migration aplicada, problema no código novo | Corrigir para frente, ou rollback para build com schema `Float` (reverter commits de comportamento mantendo schema e migration). Nunca para o deployment anterior. |
| Desfazer a migration | Só se **nenhuma** das 5 colunas tiver fração (`count(*) WHERE <col> <> trunc(<col>)` = 0) **e** o app voltar junto para `Int` na mesma janela, com trava e exclusão de escritores repetidas: `ALTER … TYPE integer USING <col>::integer`. Com qualquer fração: proibido (perde gramas); a única volta é o snapshot do passo 1, descartando movimentações posteriores. |
| Corrupção detectada (`6e-323`, `NaN`, denormais) | Ligar a trava; achar o escritor antigo pelo `06-verificacao.sql` (quem tem CONNECT, quais sessões e `application_name`) e cortá-lo (04+05); restaurar as linhas afetadas pelo snapshot/livro encadeado (`movimentacoes_estoque`); rodar `db:backfill-deposito --exec` **desta** versão, que confere a invariante por produto em milésimos; desligar a trava. |

## Fora deste rollout

Venda por peso (continua bloqueada), Ajuste/contagem de inventário em KG e balança física
seguem fechados. Ver `ESTOQUE_MANUAL_KG.md`.
