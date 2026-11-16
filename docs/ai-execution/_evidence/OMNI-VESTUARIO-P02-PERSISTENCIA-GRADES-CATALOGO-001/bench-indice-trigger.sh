#!/usr/bin/env bash
# Impacto da migration P02 em "estoque_produtos" — PostgreSQL DESCARTÁVEL, dados sintéticos.
# Mede: (1) duração do CREATE UNIQUE INDEX (id, storeId) com N produtos; (2) custo do trigger em INSERT/UPDATE
# legados (com e sem variações na loja); (3) que o índice não bloqueia leituras.
# Uso: bench-indice-trigger.sh <worktree> <saida.txt> <porta> [N produtos] [lojas]
set -uo pipefail
WT="$1"; OUT="$2"; PORT="$3"; N="${4:-300000}"; LOJAS="${5:-50}"
BIN="/c/Program Files/PostgreSQL/17/bin"; DB=vest_p02_bench
PSQL=("$BIN/psql.exe" -h 127.0.0.1 -p "$PORT" -U pgadmin -v ON_ERROR_STOP=1 -X -q -t -A)
log() { echo "$*" | tee -a "$OUT"; }
: > "$OUT"
DDIR="$("${PSQL[@]}" -d postgres -c "SELECT current_setting('data_directory')")"
case "$DDIR" in *scratchpad*) ;; *) echo "Servidor não é descartável"; exit 2;; esac
TMP="$(mktemp -d)"; cd "$WT"
"$BIN/dropdb.exe" -h 127.0.0.1 -p "$PORT" -U pgadmin --if-exists "$DB"; "$BIN/createdb.exe" -h 127.0.0.1 -p "$PORT" -U pgadmin "$DB"
git show origin/main:prisma/schema.prisma > "$TMP/main.prisma"
npx prisma migrate diff --from-empty --to-schema-datamodel "$TMP/main.prisma" --script > "$TMP/base.sql" 2>/dev/null
"${PSQL[@]}" -1 -d "$DB" -f "$TMP/base.sql" >/dev/null 2>&1 || { log "FALHA baseline"; exit 1; }
"${PSQL[@]}" -d "$DB" -c "SHOW fsync" | sed 's/^/fsync=/' | tee -a "$OUT"
"${PSQL[@]}" -d "$DB" >/dev/null <<SQL
INSERT INTO stores (id,name,cnpj,phone,"updatedAt") SELECT 'b'||g,'Loja '||g,'0','0',now() FROM generate_series(1,$LOJAS) g;
INSERT INTO estoque_produtos (id,"storeId",sku,barcode,name,stock,price,"updatedAt")
  SELECT 'p'||g, 'b'||(1+g%$LOJAS), 'SKU-'||g, CASE WHEN g%2=0 THEN '789'||lpad(g::text,10,'0') END, 'Produto '||g, g%9, 10, now()
  FROM generate_series(1,$N) g;
ANALYZE estoque_produtos;
SQL
log "produtos sintéticos: $("${PSQL[@]}" -d "$DB" -c "SELECT count(*) || ' · tabela ' || pg_size_pretty(pg_relation_size('estoque_produtos')) || ' · pkey ' || pg_size_pretty(pg_relation_size('estoque_produtos_pkey'))")"

legacy_insert() { # $1 rótulo, $2 loja — 2.000 INSERTs individuais com SKU num bloco (o lock da loja é reentrante na transação)
  local t0 t1; t0=$(date +%s%N)
  "${PSQL[@]}" -d "$DB" -c "DO \$\$ BEGIN FOR i IN 1..2000 LOOP INSERT INTO estoque_produtos (id,\"storeId\",sku,name,\"updatedAt\") VALUES ('$1-'||i,'$2','$1-'||i,'x',now()); END LOOP; END \$\$;" >/dev/null
  t1=$(date +%s%N); echo $(( (t1-t0)/1000000 ))
}
A=$(legacy_insert antes b1); log "2.000 inserts legados com SKU ANTES da migration: ${A} ms"

# Migration (trecho do índice cronometrado à parte para isolar o custo).
t0=$(date +%s%N); "${PSQL[@]}" -d "$DB" -c 'CREATE UNIQUE INDEX "estoque_produtos_id_storeId_key" ON "estoque_produtos"("id","storeId")' >/dev/null; t1=$(date +%s%N)
log "CREATE UNIQUE INDEX (id, storeId) com $N produtos: $(( (t1-t0)/1000000 )) ms · índice $("${PSQL[@]}" -d "$DB" -c "SELECT pg_size_pretty(pg_relation_size('\"estoque_produtos_id_storeId_key\"'))")"
"${PSQL[@]}" -d "$DB" -c 'DROP INDEX "estoque_produtos_id_storeId_key"' >/dev/null
# Leituras durante o build do índice (lock SHARE não bloqueia SELECT).
"${PSQL[@]}" -d "$DB" -c 'BEGIN; CREATE UNIQUE INDEX "estoque_produtos_id_storeId_key" ON "estoque_produtos"("id","storeId"); SELECT pg_sleep(3); COMMIT;' >/dev/null &
sleep 1; t0=$(date +%s%N); C=$("${PSQL[@]}" -d "$DB" -c "SELECT count(*) FROM estoque_produtos WHERE \"storeId\"='b7'"); t1=$(date +%s%N)
log "SELECT concorrente durante o índice (lock SHARE): respondeu em $(( (t1-t0)/1000000 )) ms ($C linhas)"
"${PSQL[@]}" -d "$DB" -c "SET lock_timeout='500ms'; UPDATE estoque_produtos SET price=11 WHERE id='p7'" >/dev/null 2>&1 && W="NÃO bloqueou" || W="bloqueou (esperado: escrita espera o índice)"
log "UPDATE concorrente durante o índice: $W"
wait
"${PSQL[@]}" -d "$DB" -c 'DROP INDEX "estoque_produtos_id_storeId_key"' >/dev/null
sed -n '/^-- CreateTable/,$p' "$WT/prisma/migrations/20261115120000_vestuario_p02_grades_catalogo/migration.sql" > "$TMP/mig.sql"
t0=$(date +%s%N); "${PSQL[@]}" -1 -d "$DB" -f "$TMP/mig.sql" >/dev/null || { log "FALHA migration"; exit 1; }; t1=$(date +%s%N)
log "migration P02 completa (transação única) com $N produtos: $(( (t1-t0)/1000000 )) ms"

B=$(legacy_insert depois b2); log "2.000 inserts legados com SKU DEPOIS (loja sem variações): ${B} ms"
"${PSQL[@]}" -d "$DB" >/dev/null <<'SQL'
INSERT INTO vestuario_grades (id,"storeId",nome,"nomeKey","updatedAt") VALUES ('g','b3','Adulto','ADULTO',now());
INSERT INTO vestuario_grade_tamanhos (id,"storeId","gradeId",rotulo,"rotuloKey","updatedAt") SELECT 't'||g,'b3','g','T'||g,'T'||g,now() FROM generate_series(1,20) g;
INSERT INTO vestuario_cores (id,"storeId",nome,"nomeKey","updatedAt") SELECT 'c'||g,'b3','Cor '||g,'COR '||g,now() FROM generate_series(1,25) g;
INSERT INTO estoque_produtos (id,"storeId",name,"updatedAt") VALUES ('pai','b3','Pai',now());
INSERT INTO vestuario_produtos_grade (id,"storeId","produtoId","gradeId","updatedAt") VALUES ('pg','b3','pai','g',now());
SQL
t0=$(date +%s%N)
"${PSQL[@]}" -d "$DB" -c "INSERT INTO vestuario_variantes (id,\"storeId\",\"produtoId\",\"gradeId\",\"corId\",\"tamanhoId\",sku,\"updatedAt\") SELECT 'v'||c||'-'||t,'b3','pai','g','c'||c,'t'||t,'VAR-'||c||'-'||t,now() FROM generate_series(1,25) c, generate_series(1,20) t" >/dev/null
t1=$(date +%s%N); log "500 variações com SKU numa loja com $(( N/LOJAS )) produtos (trigger varre a loja): $(( (t1-t0)/1000000 )) ms"
C=$(legacy_insert comvar b3); log "2.000 inserts legados com SKU DEPOIS (loja COM 500 variações): ${C} ms"
U0=$(date +%s%N); "${PSQL[@]}" -d "$DB" -c "UPDATE estoque_produtos SET price=price+1 WHERE \"storeId\"='b3'" >/dev/null; U1=$(date +%s%N)
log "UPDATE de preço em $(( N/LOJAS )) produtos da loja (sem mexer em sku/barcode; trigger não age): $(( (U1-U0)/1000000 )) ms"
"$BIN/dropdb.exe" -h 127.0.0.1 -p "$PORT" -U pgadmin "$DB"; rm -rf "$TMP"
log "OK"
