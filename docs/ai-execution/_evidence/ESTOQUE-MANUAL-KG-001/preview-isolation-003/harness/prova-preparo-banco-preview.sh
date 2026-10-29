#!/usr/bin/env bash
# Prova local (PG 17 descartável, 127.0.0.1:55447) do preparo de um banco de Preview vazio:
# Nome do papel dono alinhado em 2026-10-27 ao confirmado na P2.0 (`omnigestao_preview_owner`); a prova original rodou com um nome provisório, sem efeito no resultado.
# schema da main por diff-from-empty + resolve de todas as migrations, depois o branch KG por migrate deploy.
set -u
S="$(cd "$(dirname "$0")" && pwd)"
cd "$S"
PGBIN="/c/Program Files/PostgreSQL/17/bin"
PRISMA="/c/Projetos/omni-gestao/node_modules/.bin/prisma"
PORT=55447
H="-h 127.0.0.1 -p $PORT"
psqlq() { "$PGBIN/psql" $H -X -q -v ON_ERROR_STOP=1 "$@"; }
step() { echo; echo "## $*"; }

rm -rf pgdata; "$PGBIN/initdb" -D pgdata -U pgadmin --auth=trust -E UTF8 >init.log 2>&1 || { echo initdb falhou; exit 1; }
"$PGBIN/pg_ctl" -D pgdata -l pg.log -o "-p $PORT -c listen_addresses=127.0.0.1" -w start </dev/null >/dev/null 2>&1 || { echo start falhou; exit 1; }
trap '"$PGBIN/pg_ctl" -D "$S/pgdata" -m fast stop </dev/null >/dev/null 2>&1' EXIT

step "papéis próprios do Preview (owner = papel padrão do projeto novo; runtime só DML, criado por SQL)"
psqlq -U pgadmin -d postgres -c "CREATE ROLE omnigestao_preview_owner LOGIN" -c "CREATE ROLE preview_runtime LOGIN" -c "CREATE DATABASE omnigestao_preview OWNER omnigestao_preview_owner" && echo ok

URL_MAIN="postgresql://omnigestao_preview_owner@127.0.0.1:$PORT/omnigestao_preview"
case "$URL_MAIN" in *127.0.0.1:$PORT/*) ;; *) echo "trava: destino não-local"; exit 1;; esac
export DATABASE_URL="$URL_MAIN" DIRECT_URL="$URL_MAIN"

step "schema da main (origin/main) por diff-from-empty"
"$PRISMA" migrate diff --from-empty --to-schema-datamodel main/prisma/schema.prisma --script > base.sql 2>diff.err || { cat diff.err; exit 1; }
wc -l < base.sql
psqlq -U omnigestao_preview_owner -d omnigestao_preview -1 -f base.sql && echo "base aplicada"

step "resolve --applied de todas as migrations da main"
n=0; for m in $(ls main/prisma/migrations | grep -v migration_lock); do
  "$PRISMA" migrate resolve --applied "$m" --schema main/prisma/schema.prisma >/dev/null 2>res.err || { echo "resolve $m falhou"; cat res.err; exit 1; }
  n=$((n+1)); done; echo "resolvidas=$n"
"$PRISMA" migrate status --schema main/prisma/schema.prisma 2>&1 | grep -E 'up to date|not yet been applied|migrations found|failed'
"$PRISMA" migrate deploy --schema main/prisma/schema.prisma 2>&1 | grep -E 'No pending|applied|Error'
"$PRISMA" migrate diff --from-schema-datasource main/prisma/schema.prisma --to-schema-datamodel main/prisma/schema.prisma --exit-code >/dev/null 2>&1; echo "drift main (0=vazio): $?"

step "grants do runtime (DML, sem DDL)"
psqlq -U omnigestao_preview_owner -d omnigestao_preview -c "GRANT USAGE ON SCHEMA public TO preview_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO preview_runtime; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO preview_runtime; ALTER DEFAULT PRIVILEGES FOR ROLE omnigestao_preview_owner IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO preview_runtime; ALTER DEFAULT PRIVILEGES FOR ROLE omnigestao_preview_owner IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO preview_runtime;" && echo ok
psqlq -U pgadmin -d omnigestao_preview -At -c "select 'tabelas='||count(*)||' sem_dml_runtime='||count(*) filter (where not (has_table_privilege('preview_runtime',c.oid,'SELECT') and has_table_privilege('preview_runtime',c.oid,'INSERT') and has_table_privilege('preview_runtime',c.oid,'UPDATE') and has_table_privilege('preview_runtime',c.oid,'DELETE')))||' rls='||count(*) filter (where c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')"
psqlq -U pgadmin -d omnigestao_preview -At -c "select 'runtime_create_public='||has_schema_privilege('preview_runtime','public','CREATE')||' runtime_super='||rolsuper||' runtime_bypassrls='||rolbypassrls from pg_roles where rolname='preview_runtime'"
psqlq -U preview_runtime -d omnigestao_preview -c "create table x(i int)" 2>&1 | grep -o 'permission denied[^"]*' | head -1

step "colunas KG na base da main (esperado: integer)"
psqlq -U pgadmin -d omnigestao_preview -At -c "select table_name||'.'||column_name||':'||data_type from information_schema.columns where (table_name,column_name) in (('estoque_produtos','stock'),('produto_depositos','quantidade'),('movimentacoes_estoque','quantidade'),('movimentacoes_estoque','estoqueAntes'),('movimentacoes_estoque','estoqueDepois')) order by 1"

step "branch filho p/ a PR #315 (simulado por TEMPLATE) + migrate deploy com o prisma da PR"
psqlq -U pgadmin -d postgres -c "CREATE DATABASE omnigestao_preview_kg TEMPLATE omnigestao_preview OWNER omnigestao_preview_owner;" && echo ok
URL_KG="postgresql://omnigestao_preview_owner@127.0.0.1:$PORT/omnigestao_preview_kg"
export DATABASE_URL="$URL_KG" DIRECT_URL="$URL_KG"
"$PRISMA" migrate status --schema kg/prisma/schema.prisma 2>&1 | grep -E 'up to date|not yet been applied|^[0-9]{8,}'
"$PRISMA" migrate deploy --schema kg/prisma/schema.prisma 2>&1 | grep -E 'No pending|applied|Error|20261025'
"$PRISMA" migrate status --schema kg/prisma/schema.prisma 2>&1 | grep -E 'up to date|not yet been applied'
"$PRISMA" migrate diff --from-schema-datasource kg/prisma/schema.prisma --to-schema-datamodel kg/prisma/schema.prisma --exit-code >/dev/null 2>&1; echo "drift kg (0=vazio): $?"
psqlq -U pgadmin -d omnigestao_preview_kg -At -c "select table_name||'.'||column_name||':'||data_type from information_schema.columns where (table_name,column_name) in (('estoque_produtos','stock'),('produto_depositos','quantidade'),('movimentacoes_estoque','quantidade'),('movimentacoes_estoque','estoqueAntes'),('movimentacoes_estoque','estoqueDepois')) order by 1"
psqlq -U pgadmin -d omnigestao_preview_kg -At -c "select 'checksum='||left(checksum,8)||'…'||right(checksum,7) from _prisma_migrations where migration_name='20261025120000_estoque_quantidade_fracionada'"
psqlq -U pgadmin -d omnigestao_preview_kg -At -c "select 'kg sem_dml_runtime='||count(*) filter (where not has_table_privilege('preview_runtime',c.oid,'UPDATE')) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'"
echo; echo "FIM"
