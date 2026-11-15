#!/usr/bin/env bash
# Ensaio da migration 20261115120000 em PostgreSQL DESCARTÁVEL local. Nada remoto, nenhum dado real.
# Uso: ensaio-migration.sh <worktree> <saida.txt> <porta>
set -uo pipefail
WT="$1"; OUT="$2"; PORT="$3"
BIN="/c/Program Files/PostgreSQL/17/bin"
DB=vest_p02_mig
URL="postgresql://pgadmin@127.0.0.1:$PORT/$DB"
MIG=20261115120000_vestuario_p02_grades_catalogo
TMP="$(mktemp -d)"
PSQL=("$BIN/psql.exe" -h 127.0.0.1 -p "$PORT" -U pgadmin -v ON_ERROR_STOP=1 -X -q -t -A)
log() { echo "$*" | tee -a "$OUT"; }
: > "$OUT"
case "$URL" in postgresql://pgadmin@127.0.0.1:*/vest_p02_*) ;; *) echo "URL recusada"; exit 2;; esac
# Prova de que o servidor é o descartável desta execução (data_directory no scratchpad), não um banco real.
DDIR="$("${PSQL[@]}" -d postgres -c "SELECT current_setting('data_directory')")"
case "$DDIR" in *scratchpad*) ;; *) echo "Servidor não é descartável: $DDIR"; exit 2;; esac
log "0. servidor: 127.0.0.1:$PORT · data_directory=…/${DDIR##*/scratchpad/} · $("${PSQL[@]}" -d postgres -c "SHOW server_version")"

expect_fail() { # $1 rótulo, $2 sql, $3 trecho esperado do erro
  local err; err="$("${PSQL[@]}" -d "$DB" -c "$2" 2>&1 >/dev/null)"
  if [ -n "$err" ] && echo "$err" | grep -q "$3"; then log "   RECUSOU ($1): $(echo "$err" | head -1 | cut -c1-140)"
  else log "   FALHA DO ENSAIO ($1): esperado erro '$3', obtido: ${err:-<sucesso>}"; FAILS=$((FAILS+1)); fi
}
FAILS=0
cd "$WT"
mkdir -p "$TMP/prisma"
baseline() { # banco com o schema da main e o histórico de migrations da main registrado como aplicado
  "$BIN/dropdb.exe" -h 127.0.0.1 -p "$PORT" -U pgadmin --if-exists "$DB"
  "$BIN/createdb.exe" -h 127.0.0.1 -p "$PORT" -U pgadmin "$DB"
  git show origin/main:prisma/schema.prisma > "$TMP/main.prisma"
  npx prisma migrate diff --from-empty --to-schema-datamodel "$TMP/main.prisma" --script > "$TMP/baseline.sql" 2>/dev/null || return 1
  "${PSQL[@]}" -1 -d "$DB" -f "$TMP/baseline.sql" >/dev/null || return 1
  "${PSQL[@]}" -d "$DB" -c "CREATE TABLE _prisma_migrations (id varchar(36) PRIMARY KEY, checksum varchar(64) NOT NULL, finished_at timestamptz, migration_name varchar(255) NOT NULL, logs text, rolled_back_at timestamptz, started_at timestamptz NOT NULL DEFAULT now(), applied_steps_count integer NOT NULL DEFAULT 0)" || return 1
  for d in $(git ls-tree --name-only origin/main prisma/migrations/ | grep -v migration_lock); do
    n=$(basename "$d"); sum=$(git show "origin/main:$d/migration.sql" | sha256sum | cut -c1-64)
    "${PSQL[@]}" -d "$DB" -c "INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count) VALUES (md5(random()::text), '$sum', now(), '$n', 1)" || return 1
  done
}
deploy() {
  rm -rf "$TMP/prisma/migrations"; cp -r "$WT/prisma/migrations" "$TMP/prisma/migrations"; cp "$WT/prisma/schema.prisma" "$TMP/prisma/schema.prisma"
  DATABASE_URL="$URL" DIRECT_URL="$URL" npx prisma migrate deploy --schema "$TMP/prisma/schema.prisma" > "$TMP/deploy.log" 2>&1
}

# 1) BANCO VAZIO: schema da main sem dados → aplica a P02
baseline || { log "FALHA baseline"; exit 1; }
deploy || { log "FALHA deploy em banco vazio"; tail -20 "$TMP/deploy.log"; exit 1; }
log "1. banco vazio (schema da main, $(git ls-tree --name-only origin/main prisma/migrations/ | grep -vc lock) migrations registradas): aplicada $(grep -o "$MIG" "$TMP/deploy.log" | head -1)"

# 2) BANCO COM DADOS LEGADOS: recria, semeia produtos simples/legados, aplica e compara
baseline || { log "FALHA baseline 2"; exit 1; }
"${PSQL[@]}" -d "$DB" >/dev/null <<'SQL'
INSERT INTO stores (id, name, cnpj, phone, "updatedAt") VALUES ('mig-a','Loja A','00.000.000/0000-00','0', now()),('mig-b','Loja B','00.000.000/0000-00','0', now());
INSERT INTO estoque_produtos (id, "storeId", sku, barcode, name, stock, price, metadata, "updatedAt")
  SELECT 'p'||g, CASE WHEN g%2=0 THEN 'mig-a' ELSE 'mig-b' END, 'LEG-'||g, CASE WHEN g%3=0 THEN '789'||lpad(g::text,10,'0') END,
         'Produto legado '||g, g%7, 10+g,
         CASE WHEN g%5=0 THEN '{"vestuario":"camiseta","gradePlanejada":true,"atributos":{"cor":"Azul","tamanho":"M"}}'::jsonb END, now()
  FROM generate_series(1,2000) g;
INSERT INTO estoque_produtos (id, "storeId", sku, name, "updatedAt") VALUES ('p-minus', 'mig-a', ' sku-minusculo ', 'Legado com SKU minúsculo', now());
SQL
snap() { "${PSQL[@]}" -d "$DB" -c "SELECT count(*) || ':' || md5(string_agg(t::text, '|' ORDER BY t.id)) FROM (SELECT id,\"storeId\",sku,barcode,name,stock,price,metadata FROM estoque_produtos) t"; }
ANTES="$(snap)"
deploy || { log "FALHA deploy com legado"; tail -20 "$TMP/deploy.log"; exit 1; }
DEPOIS="$(snap)"
log "2. banco com legado: 2001 produtos (400 com metadata livre/gradePlanejada) · antes $ANTES"
[ "$ANTES" = "$DEPOIS" ] && log "   preservação: produtos/saldos/metadata IGUAIS após a migration" || { log "   preservação: DIVERGIU ($DEPOIS)"; FAILS=$((FAILS+1)); }
log "   produtos com grade criados por backfill: $("${PSQL[@]}" -d "$DB" -c "SELECT count(*) FROM vestuario_produtos_grade") · variantes: $("${PSQL[@]}" -d "$DB" -c "SELECT count(*) FROM vestuario_variantes")"
log "   triggers: $("${PSQL[@]}" -d "$DB" -c "SELECT string_agg(tgname, ', ' ORDER BY tgname) FROM pg_trigger WHERE tgname LIKE 'vestuario_%'")"
log "   CHECKs validados: $("${PSQL[@]}" -d "$DB" -c "SELECT count(*) || ' de 6 (' || bool_and(convalidated) || ')' FROM pg_constraint WHERE conname LIKE 'vestuario_%_check'")"
log "   FKs compostas: $("${PSQL[@]}" -d "$DB" -c "SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid::regclass::text LIKE 'vestuario_%' AND array_length(conkey,1) > 1") (todas RESTRICT: $("${PSQL[@]}" -d "$DB" -c "SELECT bool_and(confdeltype='r' AND confupdtype='r') FROM pg_constraint WHERE contype='f' AND conrelid::regclass::text LIKE 'vestuario_%'"))"

# 3) REAPLICAÇÃO: deploy de novo é no-op; seção fora do Prisma reexecuta sem erro
deploy; log "3. migrate deploy de novo: $(grep -E 'No pending migrations|Applying' "$TMP/deploy.log" | head -1)"
sed -n '/^-- Integridade de domínio (fora do modelo Prisma)/,$p' "$WT/prisma/migrations/$MIG/migration.sql" > "$TMP/extra.sql"
if "${PSQL[@]}" -d "$DB" -f "$TMP/extra.sql" >/dev/null 2>"$TMP/re.err"; then log "   reexecução da seção fora do Prisma: OK; CHECKs=$("${PSQL[@]}" -d "$DB" -c "SELECT count(*) FROM pg_constraint WHERE conname LIKE 'vestuario_%_check'") triggers=$("${PSQL[@]}" -d "$DB" -c "SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'vestuario_%'")"
else log "   reexecução FALHOU: $(cat "$TMP/re.err")"; FAILS=$((FAILS+1)); fi

# 4) DRIFT banco × schema.prisma
DATABASE_URL="$URL" DIRECT_URL="$URL" npx prisma migrate diff --from-url "$URL" --to-schema-datamodel "$WT/prisma/schema.prisma" --exit-code > "$TMP/diff.log" 2>&1
RC=$?; log "4. drift banco × schema.prisma: exit $RC ($(grep -v '^npm' "$TMP/diff.log" | head -1))"; [ $RC -eq 0 ] || FAILS=$((FAILS+1))

# 5) CONSTRAINTS, FKs e isolamento direto no SQL (sem passar pelo writer)
"${PSQL[@]}" -d "$DB" >/dev/null <<'SQL'
INSERT INTO vestuario_grades (id,"storeId",nome,"nomeKey","updatedAt") VALUES ('ga','mig-a','Adulto','ADULTO',now()),('gb','mig-b','Adulto','ADULTO',now());
INSERT INTO vestuario_grade_tamanhos (id,"storeId","gradeId",rotulo,"rotuloKey",ordem,"updatedAt") VALUES ('ta-p','mig-a','ga','P','P',1,now()),('ta-m','mig-a','ga','M','M',2,now()),('tb-p','mig-b','gb','P','P',1,now());
INSERT INTO vestuario_cores (id,"storeId",nome,"nomeKey",hex,"updatedAt") VALUES ('ca','mig-a','Preto','PRETO','#000000',now()),('cb','mig-b','Preto','PRETO',NULL,now());
INSERT INTO estoque_produtos (id,"storeId",name,"updatedAt") VALUES ('pai-a','mig-a','Camiseta sintética',now()),('pai-b','mig-b','Camiseta sintética B',now());
INSERT INTO vestuario_produtos_grade (id,"storeId","produtoId","gradeId","updatedAt") VALUES ('pga','mig-a','pai-a','ga',now());
INSERT INTO vestuario_variantes (id,"storeId","produtoId","gradeId","corId","tamanhoId",sku,"updatedAt") VALUES ('va1','mig-a','pai-a','ga','ca','ta-p','CAM-PRETO-P',now());
SQL
log "5. constraints/FKs (dados sintéticos mig-a/mig-b):"
expect_fail "combinação duplicada" "INSERT INTO vestuario_variantes (id,\"storeId\",\"produtoId\",\"gradeId\",\"corId\",\"tamanhoId\",\"updatedAt\") VALUES ('vx','mig-a','pai-a','ga','ca','ta-p',now())" "storeId_produtoId_corId_tamanhoId"
expect_fail "SKU duplicado" "INSERT INTO vestuario_variantes (id,\"storeId\",\"produtoId\",\"gradeId\",\"corId\",\"tamanhoId\",sku,\"updatedAt\") VALUES ('vx','mig-a','pai-a','ga','ca','ta-m','CAM-PRETO-P',now())" "VESTUARIO_IDENTIFICADOR_DUPLICADO\|storeId_sku"
expect_fail "SKU colide com produto legado (minúsculo/espaço)" "INSERT INTO vestuario_variantes (id,\"storeId\",\"produtoId\",\"gradeId\",\"corId\",\"tamanhoId\",sku,\"updatedAt\") VALUES ('vx','mig-a','pai-a','ga','ca','ta-m','SKU-MINUSCULO',now())" "VESTUARIO_IDENTIFICADOR_DUPLICADO"
expect_fail "código interno = SKU de outra variante" "INSERT INTO vestuario_variantes (id,\"storeId\",\"produtoId\",\"gradeId\",\"corId\",\"tamanhoId\",\"barcodeInterno\",\"updatedAt\") VALUES ('vx','mig-a','pai-a','ga','ca','ta-m','CAM-PRETO-P',now())" "VESTUARIO_IDENTIFICADOR_DUPLICADO"
expect_fail "produto legado novo com SKU de variante" "INSERT INTO estoque_produtos (id,\"storeId\",sku,name,\"updatedAt\") VALUES ('px','mig-a',' cam-preto-p','Simples colidindo',now())" "VESTUARIO_IDENTIFICADOR_DUPLICADO"
expect_fail "produto legado editado para barcode de variante" "UPDATE estoque_produtos SET barcode='CAM-PRETO-P' WHERE id='p2'" "VESTUARIO_IDENTIFICADOR_DUPLICADO"
expect_fail "SKU não normalizado" "INSERT INTO vestuario_variantes (id,\"storeId\",\"produtoId\",\"gradeId\",\"corId\",\"tamanhoId\",sku,\"updatedAt\") VALUES ('vx','mig-a','pai-a','ga','ca','ta-m','cam preto m',now())" "identificadores_check"
expect_fail "cor de outra loja" "INSERT INTO vestuario_variantes (id,\"storeId\",\"produtoId\",\"gradeId\",\"corId\",\"tamanhoId\",\"updatedAt\") VALUES ('vx','mig-a','pai-a','ga','cb','ta-m',now())" "storeId_corId_fkey"
expect_fail "tamanho de outra loja/grade" "INSERT INTO vestuario_variantes (id,\"storeId\",\"produtoId\",\"gradeId\",\"corId\",\"tamanhoId\",\"updatedAt\") VALUES ('vx','mig-a','pai-a','ga','ca','tb-p',now())" "storeId_gradeId_tamanhoId_fkey"
expect_fail "grade que não é a do produto" "INSERT INTO vestuario_variantes (id,\"storeId\",\"produtoId\",\"gradeId\",\"corId\",\"tamanhoId\",\"updatedAt\") VALUES ('vx','mig-a','pai-a','gb','ca','tb-p',now())" "fkey"
expect_fail "produto de outra loja ligado à grade" "INSERT INTO vestuario_produtos_grade (id,\"storeId\",\"produtoId\",\"gradeId\",\"updatedAt\") VALUES ('pgx','mig-a','pai-b','ga',now())" "produtoId_storeId_fkey"
expect_fail "trocar cor da variante" "UPDATE vestuario_variantes SET \"corId\"='ca', \"tamanhoId\"='ta-m' WHERE id='va1'" "VESTUARIO_IDENTIDADE_IMUTAVEL"
expect_fail "trocar grade do produto" "UPDATE vestuario_produtos_grade SET \"gradeId\"='gb' WHERE id='pga'" "VESTUARIO_IDENTIDADE_IMUTAVEL"
expect_fail "excluir variante" "DELETE FROM vestuario_variantes WHERE id='va1'" "VESTUARIO_EXCLUSAO_PROIBIDA"
expect_fail "excluir cor usada" "DELETE FROM vestuario_cores WHERE id='ca'" "storeId_corId_fkey"
expect_fail "excluir tamanho usado" "DELETE FROM vestuario_grade_tamanhos WHERE id='ta-p'" "fkey"
expect_fail "renomear tamanho usado" "UPDATE vestuario_grade_tamanhos SET rotulo='PP', \"rotuloKey\"='PP' WHERE id='ta-p'" "VESTUARIO_TAMANHO_EM_USO"
expect_fail "excluir produto pai com grade" "DELETE FROM estoque_produtos WHERE id='pai-a'" "produtoId_storeId_fkey"
expect_fail "HEX inválido" "UPDATE vestuario_cores SET hex='#zzz' WHERE id='cb'" "nome_check"
expect_fail "preço negativo" "UPDATE vestuario_variantes SET \"precoCentavos\"=-1 WHERE id='va1'" "valores_check"
"${PSQL[@]}" -d "$DB" -c "UPDATE vestuario_grade_tamanhos SET rotulo='Médio', \"rotuloKey\"='MEDIO', ordem=9, ativo=false WHERE id='ta-m'" >/dev/null && log "   ACEITOU: renomear/reordenar/desativar tamanho NÃO usado" || { log "   FALHA: tamanho não usado deveria ser editável"; FAILS=$((FAILS+1)); }
"${PSQL[@]}" -d "$DB" -c "UPDATE vestuario_cores SET nome='Preto Ônix', \"nomeKey\"='PRETO ONIX', ativo=false WHERE id='ca'" >/dev/null && log "   ACEITOU: renomear/desativar cor usada (identidade da variante preservada)" || { log "   FALHA: cor usada deveria ser editável"; FAILS=$((FAILS+1)); }
"${PSQL[@]}" -d "$DB" -c "UPDATE estoque_produtos SET name='Legado renomeado', price=11 WHERE id='p2'" >/dev/null && log "   ACEITOU: edição legada sem mudar sku/barcode (trigger não interfere)" || { log "   FALHA: edição legada comum bloqueada"; FAILS=$((FAILS+1)); }
"${PSQL[@]}" -d "$DB" -c "INSERT INTO estoque_produtos (id,\"storeId\",sku,name,\"updatedAt\") VALUES ('py','mig-b','CAM-PRETO-P','Mesmo SKU em OUTRA loja',now())" >/dev/null && log "   ACEITOU: mesmo SKU em outra loja" || { log "   FALHA: outra loja bloqueada"; FAILS=$((FAILS+1)); }

# 6) ROLLBACK OPERACIONAL: recusa com dados; com tabelas vazias reverte; reaplicação posterior funciona
if "${PSQL[@]}" -1 -d "$DB" -f "$WT/docs/vestuario/rollback_20261115120000_vestuario_p02_grades_catalogo.sql" >/dev/null 2>"$TMP/rb.err"; then log "6. FALHA: rollback deveria recusar com dados"; FAILS=$((FAILS+1))
else log "6. rollback com dados: RECUSADO ($(grep -o 'ROLLBACK_RECUSADO[^.]*' "$TMP/rb.err" | head -1)); tabelas intactas: $("${PSQL[@]}" -d "$DB" -c "SELECT count(*) FROM vestuario_variantes") variante(s)"; fi
baseline >/dev/null 2>&1 && deploy && "${PSQL[@]}" -d "$DB" -c "INSERT INTO stores (id,name,cnpj,phone,\"updatedAt\") VALUES ('rb','RB','0','0',now()); INSERT INTO estoque_produtos (id,\"storeId\",sku,name,\"updatedAt\") VALUES ('rbp','rb','RB-1','Legado',now())" >/dev/null
R0="$(snap)"
if "${PSQL[@]}" -1 -d "$DB" -f "$WT/docs/vestuario/rollback_20261115120000_vestuario_p02_grades_catalogo.sql" >/dev/null 2>"$TMP/rb2.err"; then
  log "   rollback sem dados: OK · tabelas vestuario restantes=$("${PSQL[@]}" -d "$DB" -c "SELECT count(*) FROM pg_tables WHERE tablename LIKE 'vestuario_%'") · triggers=$("${PSQL[@]}" -d "$DB" -c "SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'vestuario_%'") · produtos preservados=$([ "$R0" = "$(snap)" ] && echo sim || echo NAO)"
  deploy && log "   reaplicação após rollback: $(grep -o "$MIG" "$TMP/deploy.log" | head -1) aplicada de novo"
else log "   FALHA rollback sem dados: $(cat "$TMP/rb2.err")"; FAILS=$((FAILS+1)); fi

log "RESULTADO: $([ $FAILS -eq 0 ] && echo PASS || echo "FAIL ($FAILS)")"
rm -rf "$TMP"
exit $FAILS
