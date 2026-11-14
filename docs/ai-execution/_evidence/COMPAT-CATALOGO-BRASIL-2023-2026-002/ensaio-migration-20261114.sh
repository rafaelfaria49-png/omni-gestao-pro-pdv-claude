#!/usr/bin/env bash
# Ensaio da migration 20261114 em PostgreSQL descartável (127.0.0.1:55441). Nada remoto.
set -uo pipefail
WT="$1"; OUT="$2"
BIN="/c/Program Files/PostgreSQL/17/bin"
DB=compat_mig_r4
URL="postgresql://pgadmin@127.0.0.1:55441/$DB"
TMP="$(dirname "$0")/tmp"
MIG=20261114120000_compat_catalogo_marcas_lancamento
PSQL=("$BIN/psql.exe" -h 127.0.0.1 -p 55441 -U pgadmin -v ON_ERROR_STOP=1 -X -q -t -A)
log() { echo "$*" | tee -a "$OUT"; }
: > "$OUT"
case "$URL" in postgresql://pgadmin@127.0.0.1:55441/*) ;; *) echo "URL recusada"; exit 2;; esac

"$BIN/dropdb.exe" -h 127.0.0.1 -p 55441 -U pgadmin --if-exists "$DB"
"$BIN/createdb.exe" -h 127.0.0.1 -p 55441 -U pgadmin "$DB"

# 1) baseline = schema da main (já contém 20261113), como no CI; histórico até 20261113 marcado como aplicado
rm -rf "$TMP"; mkdir -p "$TMP/prisma/migrations"
cd "$WT"
git show origin/main:prisma/schema.prisma > "$TMP/prisma/schema.prisma"
npx prisma migrate diff --from-empty --to-schema-datamodel "$TMP/prisma/schema.prisma" --script > "$TMP/baseline.sql" 2>"$TMP/baseline.err" || { log "FALHA baseline"; cat "$TMP/baseline.err"; exit 1; }
"${PSQL[@]}" -d "$DB" -f "$TMP/baseline.sql" >/dev/null || { log "FALHA aplicando baseline"; exit 1; }
# CHECKs/índices de expressão da 20261113 (fora do schema.prisma) — mesmos da migration
"${PSQL[@]}" -d "$DB" -f "$WT/prisma/migrations/20261113120000_compat_profissional/migration.sql" >/dev/null 2>"$TMP/m13.err" || true
"${PSQL[@]}" -d "$DB" -c "CREATE TABLE IF NOT EXISTS _prisma_migrations (id varchar(36) PRIMARY KEY, checksum varchar(64) NOT NULL, finished_at timestamptz, migration_name varchar(255) NOT NULL, logs text, rolled_back_at timestamptz, started_at timestamptz NOT NULL DEFAULT now(), applied_steps_count integer NOT NULL DEFAULT 0)"
N=0
for d in $(git ls-tree --name-only origin/main prisma/migrations/ | grep -v migration_lock); do
  n=$(basename "$d"); sum=$(git show "origin/main:$d/migration.sql" | sha256sum | cut -c1-64)
  "${PSQL[@]}" -d "$DB" -c "INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count) VALUES (md5(random()::text), '$sum', now(), '$n', 1)"; N=$((N+1))
done
cp "$WT/prisma/schema.prisma" "$TMP/prisma/schema.prisma"
log "1. baseline do schema da main + $N migrations da main registradas como aplicadas (última: $(git ls-tree --name-only origin/main prisma/migrations/ | grep -v lock | tail -1 | xargs basename))"

# 2) dados pré-existentes
"${PSQL[@]}" -d "$DB" <<'SQL'
INSERT INTO stores (id, name, cnpj, phone, "updatedAt") VALUES ('mig-a','Loja A','00.000.000/0000-00','0', now()),('mig-b','Loja B','00.000.000/0000-00','0', now());
INSERT INTO catalogo_aparelhos_loja_modelos (id, "storeId", "modelKey", brand, "brandKey", name, "nameKey", "updatedAt")
  SELECT 'm'||g, CASE WHEN g%2=0 THEN 'mig-a' ELSE 'mig-b' END, 'manual_mig_'||g, 'Marca '||g, 'MARCA '||g, 'Modelo '||g, 'MODELO '||g, now()
  FROM generate_series(1,500) g;
INSERT INTO compat_preferencias_loja ("storeId", "posicoesHabilitadas", "updatedAt") VALUES ('mig-a', true, now()), ('mig-b', false, now());
SQL
[ $? -eq 0 ] || { log "FALHA na semeadura"; exit 1; }
snap() { "${PSQL[@]}" -d "$DB" -c "SELECT md5(string_agg(t::text, '|' ORDER BY t.id)) FROM (SELECT id,\"storeId\",\"modelKey\",brand,name,active,version FROM catalogo_aparelhos_loja_modelos) t;" ; "${PSQL[@]}" -d "$DB" -c "SELECT md5(string_agg(t::text, '|' ORDER BY t.\"storeId\")) FROM (SELECT \"storeId\",\"posicoesHabilitadas\",\"modoModeloPadrao\",\"modoCorPadrao\",version FROM compat_preferencias_loja) t;"; }
ANTES="$(snap | tr '\n' ' ')"
[ "$("${PSQL[@]}" -d "$DB" -c "SELECT count(*) FROM catalogo_aparelhos_loja_modelos")" = "500" ] || { log "FALHA: semeadura não gravou 500 modelos"; exit 1; }
log "2. dados semeados: 500 modelos manuais em 2 lojas + 2 preferências · checksum $ANTES"

# 3) aplica a 20261114 pelo prisma (cadeia completa)
rm -rf "$TMP/prisma/migrations"; cp -r "$WT/prisma/migrations" "$TMP/prisma/migrations"
DATABASE_URL="$URL" DIRECT_URL="$URL" npx prisma migrate deploy --schema "$TMP/prisma/schema.prisma" > "$TMP/deploy2.log" 2>&1 || { log "FALHA deploy 20261114"; tail -20 "$TMP/deploy2.log"; exit 1; }
log "3. aplicada: $(grep -o "$MIG" "$TMP/deploy2.log" | head -1)"
DEPOIS="$(snap | tr '\n' ' ')"
[ "$ANTES" = "$DEPOIS" ] && log "   preservação: checksum das colunas existentes IGUAL" || log "   preservação: DIVERGIU ($DEPOIS)"
log "   defaults: lancamento=$("${PSQL[@]}" -d "$DB" -c "SELECT string_agg(DISTINCT lancamento, ',') || ' em ' || count(*) FROM catalogo_aparelhos_loja_modelos") · marcasConfig=$("${PSQL[@]}" -d "$DB" -c "SELECT string_agg(DISTINCT \"marcasConfig\"::text, ',') || ' em ' || count(*) FROM compat_preferencias_loja")"
log "   CHECKs validados: $("${PSQL[@]}" -d "$DB" -c "SELECT string_agg(conname || '=' || convalidated, ', ' ORDER BY conname) FROM pg_constraint WHERE conname IN ('catalogo_aparelhos_loja_modelos_lancamento_check','compat_preferencias_loja_marcas_check')")"
for sql in "UPDATE catalogo_aparelhos_loja_modelos SET lancamento='talvez' WHERE id='m1'" "UPDATE compat_preferencias_loja SET \"marcasConfig\"='[1]' WHERE \"storeId\"='mig-a'"; do
  if "${PSQL[@]}" -d "$DB" -c "$sql" >/dev/null 2>&1; then log "   CHECK NÃO recusou: $sql"; else log "   CHECK recusou: ${sql:0:60}…"; fi
done

# 4) idempotência: reexecutar o SQL da migration à mão
if "${PSQL[@]}" -d "$DB" -f "$WT/prisma/migrations/$MIG/migration.sql" >/dev/null 2>"$TMP/reexec.err"; then
  log "4. reexecução manual do SQL: OK (sem erro); constraints: $("${PSQL[@]}" -d "$DB" -c "SELECT count(*) FROM pg_constraint WHERE conname IN ('catalogo_aparelhos_loja_modelos_lancamento_check','compat_preferencias_loja_marcas_check')")"
else log "4. reexecução manual FALHOU: $(cat "$TMP/reexec.err")"; fi
DATABASE_URL="$URL" DIRECT_URL="$URL" npx prisma migrate deploy --schema "$TMP/prisma/schema.prisma" > "$TMP/deploy3.log" 2>&1
log "   migrate deploy de novo: $(grep -E 'No pending migrations|Applying' "$TMP/deploy3.log" | head -1)"

# 5) drift: schema do banco × schema.prisma (expression/CHECK ficam fora do diff do Prisma)
DATABASE_URL="$URL" DIRECT_URL="$URL" npx prisma migrate diff --from-url "$URL" --to-schema-datamodel "$TMP/prisma/schema.prisma" --exit-code > "$TMP/diff.log" 2>&1
log "5. drift banco × schema.prisma: exit $? ($(head -1 "$TMP/diff.log"))"

# 6) dados novos usando as colunas + rollback
"${PSQL[@]}" -d "$DB" -c "UPDATE catalogo_aparelhos_loja_modelos SET lancamento='aguardando_lancamento' WHERE id IN ('m2','m4'); UPDATE compat_preferencias_loja SET \"marcasConfig\"='{\"GOOGLE\": true}' WHERE \"storeId\"='mig-a';"
cd "$TMP"
"${PSQL[@]}" -d "$DB" -c "\copy (SELECT id, \"storeId\", \"modelKey\", lancamento FROM catalogo_aparelhos_loja_modelos WHERE lancamento <> 'lancado') TO rb_lancamento.csv CSV HEADER"
"${PSQL[@]}" -d "$DB" -c "\copy (SELECT \"storeId\", \"marcasConfig\"::text FROM compat_preferencias_loja WHERE \"marcasConfig\" <> '{}'::jsonb) TO rb_marcas.csv CSV HEADER"
NOVAS="$("${PSQL[@]}" -d "$DB" -c "SELECT md5(string_agg(x, '|' ORDER BY x)) FROM (SELECT id||'='||lancamento x FROM catalogo_aparelhos_loja_modelos UNION ALL SELECT \"storeId\"||'='||\"marcasConfig\"::text FROM compat_preferencias_loja) t")"
cd "$WT"
log "6. backup (passo 0 do plano): $(($(wc -l < "$TMP/rb_lancamento.csv")-1)) modelo(s) aguardando + $(($(wc -l < "$TMP/rb_marcas.csv")-1)) loja(s) com marcas · checksum colunas novas $NOVAS"
"${PSQL[@]}" -d "$DB" -f "$WT/docs/catalogo/rollout/rollback_${MIG}.sql" >/dev/null
log "   rollback: colunas restantes=$("${PSQL[@]}" -d "$DB" -c "SELECT count(*) FROM information_schema.columns WHERE (table_name,column_name) IN (('catalogo_aparelhos_loja_modelos','lancamento'),('compat_preferencias_loja','marcasConfig'))") · registro em _prisma_migrations=$("${PSQL[@]}" -d "$DB" -c "SELECT count(*) FROM _prisma_migrations WHERE migration_name='$MIG'")"
POSRB="$(snap | tr '\n' ' ')"
[ "$ANTES" = "$POSRB" ] && log "   dados das colunas existentes após rollback: IGUAIS" || log "   após rollback: DIVERGIU"
"${PSQL[@]}" -d "$DB" -f "$WT/docs/catalogo/rollout/rollback_${MIG}.sql" >/dev/null 2>&1 && log "   rollback reexecutado: OK (idempotente)" || log "   rollback reexecutado: FALHOU"

# 7) reaplicar após rollback
DATABASE_URL="$URL" DIRECT_URL="$URL" npx prisma migrate deploy --schema "$TMP/prisma/schema.prisma" > "$TMP/deploy4.log" 2>&1 && log "7. reaplicada após rollback: OK" || { log "7. reaplicar FALHOU"; tail -5 "$TMP/deploy4.log"; }
FINAL="$(snap | tr '\n' ' ')"
[ "$ANTES" = "$FINAL" ] && log "   dados existentes após reaplicar: IGUAIS" || log "   após reaplicar: DIVERGIU"
cd "$TMP"
"${PSQL[@]}" -d "$DB" <<'SQL'
CREATE TEMP TABLE rb_l (id text, "storeId" text, "modelKey" text, lancamento text);
\copy rb_l FROM 'rb_lancamento.csv' CSV HEADER
UPDATE catalogo_aparelhos_loja_modelos m SET lancamento = r.lancamento FROM rb_l r WHERE m.id = r.id;
CREATE TEMP TABLE rb_m ("storeId" text, marcas text);
\copy rb_m FROM 'rb_marcas.csv' CSV HEADER
UPDATE compat_preferencias_loja p SET "marcasConfig" = r.marcas::jsonb FROM rb_m r WHERE p."storeId" = r."storeId";
SQL
RESTAURADO="$("${PSQL[@]}" -d "$DB" -c "SELECT md5(string_agg(x, '|' ORDER BY x)) FROM (SELECT id||'='||lancamento x FROM catalogo_aparelhos_loja_modelos UNION ALL SELECT \"storeId\"||'='||\"marcasConfig\"::text FROM compat_preferencias_loja) t")"
cd "$WT"
[ "$NOVAS" = "$RESTAURADO" ] && log "   restauração do backup (passo 2 do plano): colunas novas IGUAIS ao pré-rollback" || log "   restauração: DIVERGIU ($RESTAURADO)"
DATABASE_URL="$URL" DIRECT_URL="$URL" npx prisma migrate diff --from-url "$URL" --to-schema-datamodel "$TMP/prisma/schema.prisma" --exit-code > "$TMP/diff2.log" 2>&1
log "   drift final: exit $?"
"$BIN/dropdb.exe" -h 127.0.0.1 -p 55441 -U pgadmin "$DB" && log "banco descartável $DB removido"
