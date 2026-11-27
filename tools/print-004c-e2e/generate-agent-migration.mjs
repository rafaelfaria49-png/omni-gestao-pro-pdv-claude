/**
 * Deterministic generator for the 004C LOCAL_AGENT candidate migration.
 * Reads the 004B synthetic migration, extracts the three guard functions and
 * applies exact, counted replacements so reviewers can audit every delta.
 * Usage: node tools/print-004c-e2e/generate-agent-migration.mjs [--check]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import path from "node:path"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const base = readFileSync(path.join(root, "tools/print-004c-e2e/candidate-migrations/01_20261030_print_core_synthetic_local.sql"), "utf8").replace(/\r\n/g, "\n")
const out = path.join(root, "tools/print-004c-e2e/candidate-migrations/02_20261102_print_local_agent_candidate.sql")

function fn(name) {
  const start = base.indexOf(`CREATE FUNCTION "public".${name}()`)
  const end = base.indexOf("END $p004$;", start)
  if (start < 0 || end < 0) throw new Error("function not found: " + name)
  return base.slice(start, end + "END $p004$;".length).replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION")
}
function replace(text, from, to, times = 1) {
  const count = text.split(from).length - 1
  if (count !== times) throw new Error(`expected ${times} occurrence(s), got ${count}: ${from.slice(0, 90)}`)
  return text.split(from).join(to)
}

const SYN_RELEASE = "('SYNTHETIC_NO_EFFECT','SYNTHETIC_EGRESS_CLOSED','SYNTHETIC_ATOMIC_QUEUE')"
const ANY_RELEASE = "('SYNTHETIC_NO_EFFECT','SYNTHETIC_EGRESS_CLOSED','SYNTHETIC_ATOMIC_QUEUE','AGENT_NO_EFFECT','AGENT_EGRESS_CLOSED')"

let lifecycle = fn("p004_lifecycle")
lifecycle = replace(lifecycle,
  "SELECT 1 FROM \"public\".\"print_events\" WHERE attempt_id = a.id AND proof_kind = 'SYNTHETIC_NO_EFFECT') THEN",
  "SELECT 1 FROM \"public\".\"print_events\" WHERE attempt_id = a.id AND proof_kind IN ('SYNTHETIC_NO_EFFECT','AGENT_NO_EFFECT')) THEN")
lifecycle = replace(lifecycle,
  `   SELECT 1 FROM "public"."print_events" WHERE attempt_id = NEW.id AND proof_kind =
    CASE NEW.result WHEN 'PRE_SEND_FAILED' THEN 'SYNTHETIC_NO_EFFECT'
     WHEN 'TRANSPORT_ACCEPTED' THEN 'SYNTHETIC_TRANSPORT_ACCEPTED'
     WHEN 'SPOOLER_ACCEPTED' THEN 'SYNTHETIC_SPOOLER_ACCEPTED'
     ELSE 'SYNTHETIC_BROWSER_AVAILABLE' END) THEN`,
  `   SELECT 1 FROM "public"."print_events" WHERE attempt_id = NEW.id AND proof_kind = ANY (
    CASE NEW.result WHEN 'PRE_SEND_FAILED' THEN ARRAY['SYNTHETIC_NO_EFFECT','AGENT_NO_EFFECT']
     WHEN 'TRANSPORT_ACCEPTED' THEN ARRAY['SYNTHETIC_TRANSPORT_ACCEPTED']
     WHEN 'SPOOLER_ACCEPTED' THEN ARRAY['SYNTHETIC_SPOOLER_ACCEPTED','AGENT_SPOOLER_ACCEPTED']
     ELSE ARRAY['SYNTHETIC_BROWSER_AVAILABLE'] END)) THEN`)
lifecycle = replace(lifecycle, "RAISE EXCEPTION 'p004 result requires correlated synthetic evidence';",
  "RAISE EXCEPTION 'p004 result requires correlated evidence';")
lifecycle = replace(lifecycle,
  `     e.store_id IS DISTINCT FROM OLD.held_store_id OR OLD.serialization_mode <> 'SYNTHETIC' OR
     e.proof_kind NOT IN ${SYN_RELEASE} THEN`,
  `     e.store_id IS DISTINCT FROM OLD.held_store_id OR NOT (
      (OLD.serialization_mode = 'SYNTHETIC' AND e.proof_kind IN ${SYN_RELEASE}) OR
      (OLD.serialization_mode = 'LOCAL_AGENT_SERIAL' AND e.proof_kind IN ('AGENT_NO_EFFECT','AGENT_EGRESS_CLOSED'))) THEN`)
lifecycle = replace(lifecycle, "RAISE EXCEPTION 'p004 release proof missing; real adapter release not supported';",
  "RAISE EXCEPTION 'p004 release proof missing or not from the destination serialization mode';")

let insertGuard = fn("p004_insert_guard")
insertGuard = replace(insertGuard,
  `   IF NOT FOUND OR b.state <> 'ACTIVE' OR b.family <> d.family OR b.profile_id <> NEW.profile_id OR b.profile_version <> NEW.profile_version THEN
    RAISE EXCEPTION 'p004 binding/profile mismatch';
   END IF;
  ELSIF NEW.profile_id <> 'A4' THEN RAISE EXCEPTION 'p004 A4 logical profile required';`,
  `   IF NOT FOUND OR b.state <> 'ACTIVE' OR b.family <> d.family OR b.profile_id <> NEW.profile_id OR b.profile_version <> NEW.profile_version THEN
    RAISE EXCEPTION 'p004 binding/profile mismatch';
   END IF;
   IF NOT EXISTS (SELECT 1 FROM "public"."print_installations" i WHERE i.id = b.installation_id AND i.revoked_at IS NULL AND
     ((NEW.execution_mode = 'SYNTHETIC_ONLY' AND i.proof_mode = 'SYNTHETIC') OR (NEW.execution_mode = 'LOCAL_AGENT' AND i.proof_mode = 'LOCAL_AGENT'))) THEN
    RAISE EXCEPTION 'p004 execution mode/installation mismatch';
   END IF;
  ELSIF NEW.execution_mode = 'LOCAL_AGENT' THEN RAISE EXCEPTION 'p004 local agent requires bound thermal destination';
  ELSIF NEW.profile_id <> 'A4' THEN RAISE EXCEPTION 'p004 A4 logical profile required';`)
insertGuard = replace(insertGuard,
  "     AND candidate_binding.state = 'ACTIVE' AND i.revoked_at IS NULL AND i.proof_mode = 'SYNTHETIC' AND q.serialization_mode = 'SYNTHETIC'",
  `     AND candidate_binding.state = 'ACTIVE' AND i.revoked_at IS NULL AND (
      (j.execution_mode = 'SYNTHETIC_ONLY' AND i.proof_mode = 'SYNTHETIC' AND q.serialization_mode = 'SYNTHETIC') OR
      (j.execution_mode = 'LOCAL_AGENT' AND i.proof_mode = 'LOCAL_AGENT' AND q.serialization_mode = 'LOCAL_AGENT_SERIAL'))`)
insertGuard = replace(insertGuard,
  `  IF NOT EXISTS (SELECT 1 FROM "public"."print_jobs" WHERE id = NEW.job_id AND execution_mode = 'SYNTHETIC_ONLY') OR`,
  `  IF NOT EXISTS (SELECT 1 FROM "public"."print_jobs" WHERE id = NEW.job_id AND (
      (execution_mode = 'SYNTHETIC_ONLY' AND NEW.proof_kind LIKE 'SYNTHETIC\\_%') OR
      (execution_mode = 'LOCAL_AGENT' AND NEW.proof_kind LIKE 'AGENT\\_%'))) OR`)
insertGuard = replace(insertGuard, "RAISE EXCEPTION 'p004 proof must identify synthetic attempt/destination';",
  "RAISE EXCEPTION 'p004 proof must identify attempt/destination of the same execution mode';")

let commitGuard = fn("p004_commit_guard")
commitGuard = replace(commitGuard, `     AND proof_kind IN ${SYN_RELEASE}`, `     AND proof_kind IN ${ANY_RELEASE}`)

const sql = `-- OMNI-PRINT-004C — CANDIDATO LOCAL_AGENT. Aditivo sobre 20261030_print_core_synthetic_local.
-- NAO APLICAR EM PRODUCAO: D02 (schema) aprovado somente LOCAL_DISPOSABLE_ONLY; D04 (transporte) NOT_APPROVED.
-- Gerado por tools/print-004c-e2e/generate-agent-migration.mjs a partir das funcoes 004B (substituicoes contadas).
-- Arquivo de LABORATORIO (fora de prisma/migrations): nenhum build/merge o aplica automaticamente.
-- Mantem integralmente o comportamento SYNTHETIC_ONLY; acrescenta o modo LOCAL_AGENT com provas proprias.
BEGIN;
ALTER TABLE "public"."print_installations" DROP CONSTRAINT "print_installations_proof_ck";
ALTER TABLE "public"."print_installations" ADD CONSTRAINT "print_installations_proof_ck" CHECK (proof_mode IN ('SYNTHETIC','UNVERIFIED','LOCAL_AGENT'));
ALTER TABLE "public"."print_destinations" DROP CONSTRAINT "print_destinations_mode_ck";
ALTER TABLE "public"."print_destinations" ADD CONSTRAINT "print_destinations_mode_ck" CHECK (serialization_mode IN ('SYNTHETIC','UNVERIFIED','LOCAL_AGENT_SERIAL'));
ALTER TABLE "public"."print_jobs" DROP CONSTRAINT "print_jobs_synthetic_only_ck";
ALTER TABLE "public"."print_jobs" ADD CONSTRAINT "print_jobs_execution_mode_ck" CHECK (execution_mode IN ('SYNTHETIC_ONLY','LOCAL_AGENT'));
ALTER TABLE "public"."print_events" DROP CONSTRAINT "print_events_proof_ck";
ALTER TABLE "public"."print_events" ADD CONSTRAINT "print_events_proof_ck" CHECK ((proof_kind = 'NONE' AND evidence_hash IS NULL AND evidence_key IS NULL) OR (proof_kind IN ('SYNTHETIC_NO_EFFECT','SYNTHETIC_EGRESS_CLOSED','SYNTHETIC_ATOMIC_QUEUE','SYNTHETIC_TRANSPORT_ACCEPTED','SYNTHETIC_SPOOLER_ACCEPTED','SYNTHETIC_BROWSER_AVAILABLE') AND attempt_id IS NOT NULL AND evidence_hash IS NOT NULL AND evidence_key IS NOT NULL AND actor_kind = 'SYNTHETIC_EXECUTOR') OR (proof_kind IN ('AGENT_NO_EFFECT','AGENT_EGRESS_CLOSED','AGENT_SPOOLER_ACCEPTED') AND attempt_id IS NOT NULL AND evidence_hash IS NOT NULL AND evidence_key IS NOT NULL AND actor_kind = 'LOCAL_AGENT'));
ALTER TABLE "public"."print_events" DROP CONSTRAINT "print_events_actor_ck";
ALTER TABLE "public"."print_events" ADD CONSTRAINT "print_events_actor_ck" CHECK ((actor_kind = 'USER' AND actor_user_id IS NOT NULL) OR (actor_kind IN ('SYSTEM','SYNTHETIC_EXECUTOR','LOCAL_AGENT') AND actor_user_id IS NULL));

-- Pareamento/credencial do agente local. Uma instalacao pertence a uma unica loja.
-- Segredo nunca e armazenado: somente SHA-256 do token e do codigo de pareamento.
CREATE TABLE "public"."print_agent_links" (
  "installation_id" UUID NOT NULL,
  "store_id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "pairing_code_hash" CHAR(64),
  "pairing_expires_at" TIMESTAMPTZ(3),
  "credential_hash" CHAR(64),
  "paired_at" TIMESTAMPTZ(3),
  "agent_version" TEXT,
  "last_seen_at" TIMESTAMPTZ(3),
  "inventory" JSONB NOT NULL DEFAULT '[]',
  "inventory_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "print_agent_links_pkey" PRIMARY KEY ("installation_id"),
  CONSTRAINT "print_agent_links_u1" UNIQUE ("pairing_code_hash"),
  CONSTRAINT "print_agent_links_u2" UNIQUE ("credential_hash")
);
CREATE INDEX "print_agent_links_i1" ON "public"."print_agent_links" ("store_id");
ALTER TABLE "public"."print_agent_links" ADD CONSTRAINT "p004_fk_37" FOREIGN KEY ("installation_id") REFERENCES "public"."print_installations" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."print_agent_links" ADD CONSTRAINT "p004_fk_38" FOREIGN KEY ("store_id") REFERENCES "public"."stores" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."print_agent_links" ADD CONSTRAINT "p004_fk_39" FOREIGN KEY ("created_by_id") REFERENCES "public"."admin_users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."print_agent_links" ADD CONSTRAINT "print_agent_links_hash_hex" CHECK ((pairing_code_hash IS NULL OR pairing_code_hash::text ~ '^[0-9a-f]{64}$') AND (credential_hash IS NULL OR credential_hash::text ~ '^[0-9a-f]{64}$'));
ALTER TABLE "public"."print_agent_links" ADD CONSTRAINT "print_agent_links_pairing_ck" CHECK (((credential_hash IS NULL) = (paired_at IS NULL)) AND ((pairing_code_hash IS NULL) = (pairing_expires_at IS NULL)) AND (credential_hash IS NULL OR pairing_code_hash IS NULL));
ALTER TABLE "public"."print_agent_links" ADD CONSTRAINT "print_agent_links_inventory_ck" CHECK (jsonb_typeof(inventory) = 'array' AND length(label) BETWEEN 1 AND 80);

CREATE FUNCTION "public".p004_agent_link_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $p004$
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' THEN RAISE EXCEPTION 'p004 schema mismatch'; END IF;
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'p004 agent link deletion requires approved retention scope'; END IF;
 IF TG_OP = 'INSERT' THEN
  IF NEW.credential_hash IS NOT NULL OR NEW.paired_at IS NOT NULL OR NOT EXISTS (
    SELECT 1 FROM "public"."print_installations" WHERE id = NEW.installation_id AND proof_mode = 'LOCAL_AGENT' AND revoked_at IS NULL) THEN
   RAISE EXCEPTION 'p004 agent link starts unpaired on an active LOCAL_AGENT installation';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.installation_id <> OLD.installation_id OR NEW.store_id <> OLD.store_id OR NEW.created_by_id <> OLD.created_by_id OR NEW.created_at <> OLD.created_at THEN
  RAISE EXCEPTION 'p004 agent link identity immutable';
 END IF;
 IF OLD.credential_hash IS NOT NULL AND (NEW.credential_hash IS DISTINCT FROM OLD.credential_hash OR NEW.paired_at IS DISTINCT FROM OLD.paired_at OR NEW.pairing_code_hash IS NOT NULL) THEN
  RAISE EXCEPTION 'p004 paired credential cannot be replaced; revoke installation and pair again';
 END IF;
 RETURN NEW;
END $p004$;
CREATE TRIGGER "p004_agent_link" BEFORE INSERT OR UPDATE OR DELETE ON "public"."print_agent_links" FOR EACH ROW EXECUTE FUNCTION "public".p004_agent_link_guard();
REVOKE ALL ON "public"."print_agent_links" FROM PUBLIC;

${lifecycle}

${insertGuard}

${commitGuard}
COMMIT;
`
// Future production layout (still NOT approved): the two parent UNIQUE indexes are built CONCURRENTLY outside any
// transaction first (SHARE UPDATE EXCLUSIVE: sales/terminals keep accepting writes), then 004B runs without them.
const parentIndexes = [
  'CREATE UNIQUE INDEX "p004_vendas_id_store_uq" ON "public"."vendas" ("id", "storeId");\n',
  'CREATE UNIQUE INDEX "p004_term_id_store_uq" ON "public"."pdv_terminais" ("id", "storeId");\n',
]
let future01 = base
for (const line of parentIndexes) future01 = replace(future01, line, "")
future01 = replace(future01, "-- PROPOSTA 004A: somente documento. NAO EXECUTADO.\n",
  "-- PROPOSTA 004A (variante futura 004C): igual ao 01 sem os dois indices pais, criados antes por 00_parent_indexes_concurrently.sql.\n" +
  "-- LABORATORIO. NAO APLICAR EM PRODUCAO sem aprovacao D02/D04 e janela operacional.\n")
future01 = replace(future01, "BEGIN;\n", "BEGIN;\n" + `DO $p004$ BEGIN
 IF (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname IN ('p004_vendas_id_store_uq','p004_term_id_store_uq') AND i.indisvalid AND i.indisunique) <> 2 THEN
  RAISE EXCEPTION 'p004 parent indexes must exist and be VALID (run 00_parent_indexes_concurrently.sql first)';
 END IF;
END $p004$;
`)
const future00 = `-- OMNI-PRINT-004C — variante futura, passo 00. LABORATORIO; NAO APLICAR EM PRODUCAO sem aprovacao D02/D04.
-- Executar FORA de transacao (psql sem -1/--single-transaction). CREATE INDEX CONCURRENTLY usa SHARE UPDATE EXCLUSIVE:
-- INSERT/UPDATE/DELETE em vendas e pdv_terminais continuam durante a construcao. Sem IF NOT EXISTS: um indice
-- homonimo pre-existente deve ser investigado, nunca aceito silenciosamente.
SET lock_timeout = '5s';
SET statement_timeout = '0';
${parentIndexes.map(l => l.replace("CREATE UNIQUE INDEX", "CREATE UNIQUE INDEX CONCURRENTLY")).join("")}DO $p004$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
   WHERE c.relname IN ('p004_vendas_id_store_uq','p004_term_id_store_uq') AND NOT i.indisvalid) THEN
  RAISE EXCEPTION 'p004 parent index INVALID: DROP INDEX CONCURRENTLY and rebuild';
 END IF;
END $p004$;
`
const outputs = [[out, sql], [path.join(path.dirname(out), "future/00_parent_indexes_concurrently.sql"), future00],
  [path.join(path.dirname(out), "future/01_print_core_without_parent_indexes.sql"), future01]]
if (process.argv.includes("--check")) {
  for (const [file, text] of outputs) {
    const current = readFileSync(file, "utf8").replace(/\r\n/g, "\n")
    if (current !== text) { console.error("MIGRATION_DRIFT " + path.relative(root, file)); process.exit(1) }
    console.log("MIGRATION_MATCHES_GENERATOR " + path.relative(root, file) + " " + createHash("sha256").update(text).digest("hex"))
  }
} else {
  mkdirSync(path.join(path.dirname(out), "future"), { recursive: true })
  for (const [file, text] of outputs) {
    writeFileSync(file, text)
    console.log("written " + path.relative(root, file) + " sha256=" + createHash("sha256").update(text).digest("hex"))
  }
}
