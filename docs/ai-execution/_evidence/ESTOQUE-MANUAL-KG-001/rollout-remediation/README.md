# ESTOQUE-MANUAL-KG-001 — evidências da remediação do rollout (2026-10-25)

Análise e recomendação: `docs/padaria/pesagem/ESTOQUE_MANUAL_KG_ROLLOUT_REMEDIACAO.md`.
Nada aqui tocou produção, Preview, Vercel (além de leitura) ou credenciais reais.

## Ambiente isolado

- PostgreSQL 17.10 local, cluster criado por `initdb` no diretório temporário da sessão, porta 55447,
  autenticação SCRAM, senhas aleatórias em arquivos fora do repositório (nunca impressas).
- Topologia copiada do cluster Neon real (`40-…`): `neondb_owner_sim` dono de tudo, `LOGIN CREATEROLE
  CREATEDB BYPASSRLS`, membro com herança de `neon_superuser_sim`, que tem `pg_read_all_data`,
  `pg_write_all_data`, `pg_signal_backend`, `pg_monitor`; databases `omnigestao_prod` e
  `omnigestao_prod_candidate` no mesmo cluster; schema `public` de `pg_database_owner`.
- Schema: `prisma migrate diff --from-empty` do schema da `main` (`a288ea2`, colunas `integer`).
- Clientes: Prisma 6.19.3 gerado do schema da `main` (Int, "antigo") e da PR `cdb1d19` (Float, "novo").

## Arquivos

| Arquivo | O que prova |
| --- | --- |
| `10-isolamento-credenciais-topologia-neon.txt` | Estratégia B inteira com escritores antigos de pool aberto: senha trocada não corta sessão; papéis novos; runtime novo convive; troca de posse **não** corta (pg_write_all_data); venda em voo termina antes do corte; REVOKE CONNECT + terminate cortam reconexão, cold start e psql; recuperação antes da migration; migration pelo `omni_migrator`; depois dela, Float grava 3,96 e Int não alcança o banco; 0 linhas corrompidas. |
| `10b-isolamento-credenciais-pg-puro.txt` | Mesma prova numa versão anterior do harness, **sem** `neon_superuser` (PostgreSQL puro): ali a troca de posse já corta a escrita da sessão aberta. Contraste que mostra por que no Neon só CONNECT resolve. |
| `11-arquivos-do-runbook.txt` | Os arquivos versionados `docs/padaria/pesagem/rollout/01…07, 99` executados na ordem do runbook: recusa sem senha, `KG_PAPEIS_OK`, `KG_RUNTIME_GRANTS_OK`, `KG_CORTE_POSSE_OK`, `KG_CORTE_CONEXAO_OK`, `KG_SESSOES_ANTIGAS_ZERO`, desfazer antes da migration e recusa depois dela, barreira CHECK recusando script da `main` mesmo com credencial de admin. |
| `12-cortes-parciais.txt` | Contraprovas: REVOKE por não-dono = WARNING + exit 0 sem efeito; só terminate = Prisma reconecta e grava; só REVOKE CONNECT = sessão aberta segue gravando. |
| `20-barreira-check.txt` | Cliente Int sobre double sem e com o CHECK de milésimos (absoluto, negativo, zero, depósito, livro, transação de venda, increment/decrement) e cliente Float passando. |
| `21-prisma-migrate-diff-com-check.txt` | `prisma migrate diff` do banco com os CHECKs contra o schema da PR: sem diferença. |
| `30-fila-pdv.txt` + `kg-rollout-queue.proof.integration.test.ts.txt` | Handlers reais de `/api/ops/venda-persist` (v1 e v2) e classificador real da fila, contra PG descartável com o schema da PR. |
| `40-neon-papeis-readonly.txt` | Catálogo do cluster Neon real, lido com o papel read-only do candidate, em `BEGIN READ ONLY`: papéis, pertencimentos, ACL dos databases, sessões. Host e senha redigidos. |
| `41-neon-candidate-rls-objetos-readonly.txt` | Candidate: RLS, policies, sequences, views, funções, enums, dono do schema. |
| `42-credenciais-locais-topologia.txt` | Arquivos de credencial desta máquina comparados por papel/database/igualdade de senha (só booleanos). |
| `50-vercel-inventario.md` | Inventário e classificação dos 133 deployments (leitura da API da Vercel). |
| `harness/` | Scripts usados (`.txt` para não entrarem em build, lint, typecheck nem vitest). |

## Reproduzir

```
initdb -D <tmp>/pgdata -U pgadmin --auth-host=scram-sha-256 --pwfile=<tmp>/superpw.txt
pg_ctl -D <tmp>/pgdata -o "-p 55447 -c listen_addresses=127.0.0.1" -l <tmp>/pg.log start
# copiar harness/*.txt para <tmp> sem o .txt; gerar old/ e new/ com `prisma generate`
# (schemas da main e da PR com output ./client) e old-ddl.sql com `prisma migrate diff --from-empty`
node 00-setup.cjs && node 10-credential-isolation.cjs
node 00-setup.cjs && node 11-runbook-sql.cjs
node 00-setup.cjs && node 12-cortes-parciais.cjs
node 20-check-barrier.cjs
```

Fila: criar o database `kg_queue`, `prisma db push` com o schema da PR, copiar o `.ts.txt` para
`lib/vendas/kg-rollout-queue.proof.integration.test.ts` e rodar com `KG_PROOF_DATABASE_URL` (o teste
recusa qualquer URL que não seja `127.0.0.1:55447/kg_queue`).

## Armadilhas encontradas na própria prova

- `ALTER TABLE … OWNER` exige que o novo dono tenha CREATE no schema; no Neon o `public` é de
  `pg_database_owner`, então o `ALTER DATABASE … OWNER` tem de vir primeiro.
- `spawnSync` do psql congela o event loop do Node: a transação em voo nunca termina e o corte estoura o
  `lock_timeout` — artefato do harness, não do banco (usar `spawn`).
- `pg_stat_activity` é um retrato fixo dentro da transação: sem `pg_stat_clear_snapshot()` a 2ª rodada de
  encerramento vê PIDs já mortos e a contagem final fica velha (corrigido em `05-encerrar-sessoes.sql`).
- Em `String.replace` do JavaScript, `$$` no texto de substituição vira `$` — quebrou um bloco `DO $$`.
