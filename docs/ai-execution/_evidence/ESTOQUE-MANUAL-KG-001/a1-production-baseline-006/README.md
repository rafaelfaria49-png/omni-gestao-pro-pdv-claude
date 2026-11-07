# A1 — baseline read-only de produção (2026-10-28 12:16Z)

**Autorização do dono:** "AUTORIZAÇÃO — A1 | BASELINE READ-ONLY DE PRODUÇÃO". Alvo exclusivo: Neon `dry-mouse-36002471`,
branch `br-muddy-meadow-ac7ah2wl`, database `omnigestao_prod`.

Só SELECT em catálogo, funções de leitura e agregados. Nenhuma escrita, DDL, GRANT/REVOKE, sessão encerrada, env, papel,
senha, deploy, commit, push ou merge. A2–A4 e J0–J13 não foram iniciados. O conector Neon do ChatGPT não foi usado.

```
A1=PASS
PRODUCTION_IDENTITY_VERIFIED=YES
TRANSACTION_READ_ONLY=YES
STOCK_COLUMNS_INTEGER=5/5
KG_MIGRATION_ABSENT=YES
DRIFT_0019=CONFIRMED
TABLE_SIZES_AND_LOCK_BASELINE=estoque_produtos 14.109 linhas/4,8 MB · produto_depositos 13.725/4,8 MB · movimentacoes_estoque 2.548/1,3 MB; sem view/regra/gatilho dependente; 0 locks atuais nas 3
LEGACY_CONNECT_PERMISSIONS=datacl NULL (PUBLIC com CONNECT); dono neondb_owner (neon_superuser, pg_write_all_data); omni_* inexistentes
ACTIVE_LEGACY_SESSIONS=2 neondb_owner via pgbouncer em omnigestao_prod, idle, sem transação aberta
OPEN_CASH_SESSIONS_BY_STORE=loja-2 (RAFA BRINQUEDOS E VARIEDADES) 1 desde 2026-10-27 12:05Z, em operação · loja-5 (TESTE 123) 1 desde 2026-05-28 · demais 0
OFFLINE_QUEUES_VERIFIED=NO — depende de validação externa
STORE_CHECKLISTS=PENDING
PRODUCTION_DATA_WRITES=0
SCHEMA_CHANGES=0
MERGE=NOT_EXECUTED
ROLLOUT_READINESS=NO-GO
```

## Como foi lido

| Arquivo | Conteúdo |
| --- | --- |
| `harness/a1-baseline.cjs` | lê `NEON_PROD_DIRECT_URL` de `C:\Projetos\secrets\neon-production.env`; valida endpoint (direto, não pooler) e database **sem conectar**; senha só por `PGPASSWORD`; saída redigida |
| `harness/a1-baseline.sql` | `BEGIN … REPEATABLE READ READ ONLY`; identidade conferida no servidor com `\if` antes de qualquer diagnóstico (diverge → `ROLLBACK` + `\q`); termina em `ROLLBACK` |
| `00-prova-local-prisma-readonly.txt` | PG 17 descartável com `log_statement=all`: o `prisma migrate diff --from-url` (6.19.3) honra `options=-c default_transaction_read_only=on` e só emite `SELECT`/`WITH`; `CREATE TABLE` pela mesma URL é recusado ("transação de leitura-apenas") |
| `01-saida-sql.txt` | saída integral das consultas (sem texto de consulta de terceiros, sem dado pessoal) |
| `02-saida-migrate-diff.txt` | `migrate diff` produção × schema da #315 (`fb88ab4`, schema = `2731097`) e × schema da `main` (`34b70a1`) |

Sessão psql: `PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000 -c
idle_in_transaction_session_timeout=60000`, `application_name=kg-a1-readonly`. Prisma: mesma opção read-only pela URL,
`statement_timeout=15000`, `application_name=kg-a1-readonly-diff`, sem shadow database. Varredura das saídas contra
cada valor do arquivo de segredos: **0 vazamentos**.

Identidade lida no servidor: `project=dry-mouse-36002471 branch=br-muddy-meadow-ac7ah2wl endpoint=ep-summer-tooth-acltc6wi
db=omnigestao_prod user=neondb_owner transaction_read_only=on default_transaction_read_only=on`, PG 17.11.

## Resultados × premissas do runbook

| Premissa (runbook) | Lido | Situação |
| --- | --- | --- |
| 5 colunas `integer` | as 5 `integer` | confere |
| Histórico = repo sem a KG | 23 finalizadas, 0 revertidas/incompletas; nomes = `prisma/migrations` da PR menos `20261025120000_estoque_quantidade_fracionada` | confere |
| Drift só da 0019 (§6.1) | constraint `storeId_idempotencyKey` `UNIQUE ("storeId","idempotencyKey")`. Diff × `main`: **só** a renomeação do índice. Diff × #315: 5 colunas (`type changed`; em `stock` e `produto_depositos.quantidade` também `default changed` Int(0) → Float(0), efeito do mesmo ALTER) + a renomeação | **confirmado**; nenhum drift novo |
| Nenhuma view/regra dependente | 0 dependentes, 0 gatilhos de usuário | confere |
| Lock curto | 3 tabelas somam ~10,9 MB (banco 41 MB); 0 locks de outras sessões nas 3 no momento; ensaio 002 (clone de 2026-10-26) aplicou em ~1 s | estimativa: segundos sob `ACCESS EXCLUSIVE` |
| `datacl` NULL, PUBLIC com CONNECT (remediação §1 item 3) | `NULL`; dono `neondb_owner`; schema `public` de `pg_database_owner` | confere |
| `neondb_owner` ∈ `neon_superuser` ⊃ `pg_write_all_data` | sim; `CREATEROLE`, `BYPASSRLS` | confere |
| `omni_*` ainda não criados (A3 pendente) | 0 | confere |
| Papéis com login e CONNECT hoje | `neondb_owner`, `neon_service`, `omnigestao_candidate_audit_ro`, `cloud_admin` (super). `token_roles` é NOLOGIN (fora do filtro do `04`/`06`, que olham `rolcanlogin AND NOT rolsuper`) | esperado; o `04` revoga PUBLIC |
| Escritores ativos | 2 conexões `neondb_owner`/`pgbouncer` em `omnigestao_prod`, idle; demais são internas do Neon (`compute_ctl`, `sql_exporter`, `vm-monitor`, autovacuum, TimescaleDB launcher, **pg_cron scheduler**) | ver risco 3 |
| Caixas `ABERTA` = 0 no J0 | **2 abertas** | J0 hoje reprovaria — ver risco 1 e 2 |

Contagens e somas (linha de base, não critério da janela — o J8 compara por linha sob lock):

| Tabela | Linhas | Soma | Outros |
| --- | ---: | --- | --- |
| `estoque_produtos.stock` | 14.109 | 69.229 | min −22, max 999 |
| `produto_depositos.quantidade` | 13.725 | 69.989 | — |
| `movimentacoes_estoque` | 2.548 | quantidade −1.891; estoqueDepois 431.573 | 2 updates, 0 deletes desde o reset de estatísticas |

Atividade (sem conteúdo de venda): `loja-2` com 2 vendas e 2 movimentações nas últimas 24 h (última movimentação
12:11:56Z), 1 terminal com lock e heartbeat de 12:16:27Z — **a loja estava operando durante a leitura**. `loja-1`: última
venda e movimentação em 2026-10-24 22:18Z. Locks de terminal parados em `loja-11` (2026-05-30) e `loja-teste-caixa`
(2026-08-04). Não existe fila de vendas no servidor; a fila do PDV vive no navegador.

## Riscos e observações

1. **Caixa aberto e loja em operação (`loja-2`).** Normal fora da janela, mas confirma que o J0 depende de fechamento real
   e do checklist da loja; nada aqui substitui a conferência dos terminais.
2. **Sessão de caixa órfã em `loja-5` (TESTE 123) desde 2026-05-28.** O J0 exige `ABERTA` = 0. Fechá-la é escrita (pela
   aplicação, com autorização própria) ou o J0 precisa registrar exceção explícita para loja de teste sem terminal ativo.
3. **pg_cron ativo no compute.** O launcher roda no database `postgres`; a tabela `cron.job` fica fora do alvo autorizado e
   não foi lida. Se houver job gravando em `omnigestao_prod` como `neondb_owner`, o corte o derruba (tem de rodar com
   login); com outro papel, seria um escritor a mais. Leitura de `cron.job` pede autorização própria.
4. **Somas de `stock` (69.229) e depósitos (69.989) diferem em 760.** Pré-existente; não é critério da migration (que
   preserva cada valor por linha). A invariante por produto não foi lida (fora do A1).
5. O compute tinha ~17 min de vida na leitura (autosuspend); as 2 conexões do pooler nasceram com ele. Números de sessão
   são um retrato: o J6/J7 conferem de novo.
6. O read-only da conexão do Prisma foi provado localmente (mesma versão, mesma opção); no servidor de produção, a
   confirmação `transaction_read_only=on` foi lida na sessão psql.

## O que o A1 comprova e o que não

- **Comprovado:** identidade do alvo; 5 colunas `integer`; KG ausente e histórico íntegro; drift = só a 0019; tabelas
  pequenas sem dependentes; topologia de papéis/CONNECT igual à da remediação e do ensaio 002; ninguém mais com transação
  aberta nas 3 tabelas no momento.
- **Depende de checklist humano:** filas offline nos navegadores, pagamentos em andamento, terminais em URL antiga
  (`ESTOQUE_MANUAL_KG_CHECKLIST_LOJAS.md`); fechamento do caixa da `loja-2`.
- **Depende da janela:** caixas `ABERTA` = 0 no J0, sessões e locks no J6/J7, tempo real do lock no J8.
- **Depende de próxima autorização:** A2 (credenciais offline), A3 (`01`/`02`), A4 (login do runtime), decisão sobre a
  sessão órfã da `loja-5`, leitura de `cron.job`, A6 (`07`), A7 (conector), A8 (congelamento).
