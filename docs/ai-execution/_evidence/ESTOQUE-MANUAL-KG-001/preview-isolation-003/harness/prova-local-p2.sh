#!/usr/bin/env bash
# Prova local do p2-preparo-preview.cjs em dois PG 17 descartáveis (127.0.0.1:55451 = "main", :55452 = "pr315-kg",
# cópia física do primeiro como um branch Neon). As GUCs neon.* são simuladas por ALTER DATABASE SET.
# Uso: prova-local-p2.sh <pasta-de-trabalho-fora-do-repo>
set -u
H="$(cd "$(dirname "$0")" && pwd)"
W="$1"; mkdir -p "$W"; cd "$W"
PGBIN="/c/Program Files/PostgreSQL/17/bin"
PJ=nameless-frost-19035275; MB=br-lively-feather-b6esh64a; KB=br-local-kg-test
OWNER=omnigestao_preview_owner
step() { echo; echo "## $*"; }
stopall() { for d in pgA pgB; do [ -d "$d" ] && "$PGBIN/pg_ctl" -D "$d" -m fast stop </dev/null >/dev/null 2>&1; done; }
trap stopall EXIT
rm -rf pgA pgB sec work; mkdir -p sec work
SUPW=$(node -e "process.stdout.write(require('crypto').randomBytes(18).toString('hex'))")
OWPW=$(node -e "process.stdout.write(require('crypto').randomBytes(18).toString('hex'))")
printf '%s' "$SUPW" > sec/supw
"$PGBIN/initdb" -D pgA -U pgadmin --pwfile=sec/supw --auth=scram-sha-256 -E UTF8 >init.log 2>&1 || { echo initdb falhou; exit 1; }
"$PGBIN/pg_ctl" -D pgA -l pgA.log -o "-p 55451 -c listen_addresses=127.0.0.1" -w start </dev/null >/dev/null 2>&1 || { echo start A falhou; exit 1; }
sq() { PGPASSWORD="$SUPW" "$PGBIN/psql" -h 127.0.0.1 -p "$1" -U pgadmin -X -q -A -t -v ON_ERROR_STOP=1 -d "$2" -c "$3"; }

step "simula o projeto novo: dono padrão, neon_superuser, database e GUCs neon.*"
sq 55451 postgres "CREATE ROLE neon_superuser NOLOGIN CREATEROLE CREATEDB" \
 && sq 55451 postgres "CREATE ROLE $OWNER LOGIN CREATEROLE CREATEDB PASSWORD '$OWPW' IN ROLE neon_superuser" \
 && sq 55451 postgres "CREATE DATABASE omnigestao_preview OWNER $OWNER" \
 && sq 55451 postgres "ALTER DATABASE omnigestao_preview SET neon.project_id='$PJ'" \
 && sq 55451 postgres "ALTER DATABASE omnigestao_preview SET neon.branch_id='$MB'" \
 && sq 55451 postgres "ALTER DATABASE omnigestao_preview SET neon.endpoint_id='ep-local-55451'" && echo ok
printf 'PREVIEW_MAIN_OWNER_URL=postgresql://%s:%s@127.0.0.1:55451/omnigestao_preview\n' "$OWNER" "$OWPW" > sec/secrets.env

export P2_LOCAL_TEST=1 P2_SECRETS_FILE="$(cygpath -w "$W/sec/secrets.env")" P2_GENERATED_FILE="$(cygpath -w "$W/sec/gen.env")" P2_WORKDIR="$(cygpath -w "$W/work")"
J="$(cygpath -w "$H/p2-preparo-preview.cjs")"

step "negativo: arquivo de segredos dentro do repo"
P2_GENERATED_FILE="$(cygpath -w "$H/gen.env")" node "$J" check 2>&1 | tail -1
step "negativo: URL apontando para o endpoint de produção (modo real, sem conectar)"
printf 'PREVIEW_MAIN_OWNER_URL=postgresql://x:y@ep-summer-tooth-acltc6wi.sa-east-1.aws.neon.tech/omnigestao_preview\n' > sec/prod.env
P2_LOCAL_TEST=0 P2_SECRETS_FILE="$(cygpath -w "$W/sec/prod.env")" node "$J" check 2>&1 | tail -1
step "negativo: URL pooler (modo real, sem conectar)"
printf 'PREVIEW_MAIN_OWNER_URL=postgresql://x:y@ep-purple-morning-b6ajdsfk-pooler.sa-east-1.aws.neon.tech/omnigestao_preview\n' > sec/pool.env
P2_LOCAL_TEST=0 P2_SECRETS_FILE="$(cygpath -w "$W/sec/pool.env")" node "$J" check 2>&1 | tail -1
step "negativo: main com endpoint diferente do confirmado na P2.0 (modo real, sem conectar)"
printf 'PREVIEW_MAIN_OWNER_URL=postgresql://omnigestao_preview_owner:y@ep-other-endpoint-a1b2c3d4.sa-east-1.aws.neon.tech/omnigestao_preview\n' > sec/ep.env
P2_LOCAL_TEST=0 P2_SECRETS_FILE="$(cygpath -w "$W/sec/ep.env")" node "$J" check 2>&1 | tail -1
step "negativo: usuário diferente do dono confirmado (modo real, sem conectar)"
printf 'PREVIEW_MAIN_OWNER_URL=postgresql://neondb_owner:y@ep-purple-morning-b6ajdsfk.sa-east-1.aws.neon.tech/omnigestao_preview\n' > sec/user.env
P2_LOCAL_TEST=0 P2_SECRETS_FILE="$(cygpath -w "$W/sec/user.env")" node "$J" check 2>&1 | tail -1

step "check (só leitura)"
node "$J" check
step "main"
node "$J" main || exit 1
step "main de novo (deve recusar: banco não vazio)"
node "$J" main 2>&1 | tail -1

step "simula o branch pr315-kg: cópia física do main (papéis e senhas vêm junto), endpoint e branch_id próprios"
"$PGBIN/pg_ctl" -D pgA -m fast stop </dev/null >/dev/null 2>&1; cp -r pgA pgB
"$PGBIN/pg_ctl" -D pgA -l pgA.log -o "-p 55451 -c listen_addresses=127.0.0.1" -w start </dev/null >/dev/null 2>&1
"$PGBIN/pg_ctl" -D pgB -l pgB.log -o "-p 55452 -c listen_addresses=127.0.0.1" -w start </dev/null >/dev/null 2>&1 || { echo start B falhou; exit 1; }
sq 55452 postgres "ALTER DATABASE omnigestao_preview SET neon.branch_id='$KB'" && sq 55452 postgres "ALTER DATABASE omnigestao_preview SET neon.endpoint_id='ep-local-55452'" && echo ok

step "negativo: trava (URL do main apontando para o filho → branch_id não confere)"
printf 'PREVIEW_MAIN_OWNER_URL=postgresql://%s:%s@127.0.0.1:55452/omnigestao_preview\n' "$OWNER" "$OWPW" > sec/wrong.env
P2_SECRETS_FILE="$(cygpath -w "$W/sec/wrong.env")" node "$J" check 2>&1 | tail -1

printf 'PREVIEW_KG_OWNER_URL=postgresql://%s:%s@127.0.0.1:55452/omnigestao_preview\nPREVIEW_KG_BRANCH_ID=%s\n' "$OWNER" "$OWPW" "$KB" >> sec/secrets.env
step "kg"
node "$J" kg || exit 1
step "kg de novo (deve recusar: nada pendente)"
node "$J" kg 2>&1 | tail -1

step "arquivo gerado: só nomes das chaves"
sed 's/=.*//' sec/gen.env
echo; echo FIM
