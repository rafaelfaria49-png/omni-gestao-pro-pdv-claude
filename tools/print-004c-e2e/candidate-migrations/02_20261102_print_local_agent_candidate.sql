-- OMNI-PRINT-004C — CANDIDATO LOCAL_AGENT. Aditivo sobre 20261030_print_core_synthetic_local.
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

CREATE OR REPLACE FUNCTION "public".p004_lifecycle() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $p004$
DECLARE e "public"."print_events"%ROWTYPE; a "public"."print_attempts"%ROWTYPE; j "public"."print_jobs"%ROWTYPE;
        d "public"."print_documents"%ROWTYPE; b "public"."print_bindings"%ROWTYPE;
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' THEN RAISE EXCEPTION 'p004 schema mismatch'; END IF;
 IF TG_TABLE_NAME = 'print_installations' THEN
  IF NEW.revocation_epoch < OLD.revocation_epoch OR
    (OLD.revoked_at IS NOT NULL AND (NEW.revoked_at IS DISTINCT FROM OLD.revoked_at OR NEW.revoked_by_id IS DISTINCT FROM OLD.revoked_by_id)) THEN
   RAISE EXCEPTION 'p004 installation revocation is monotonic';
  END IF;
 ELSIF TG_TABLE_NAME = 'print_bindings' THEN
  IF NOT (NEW.state = OLD.state OR
   (OLD.state = 'PENDING' AND NEW.state IN ('ACTIVE','REVOKED')) OR
   (OLD.state = 'ACTIVE' AND NEW.state = 'REVOKED')) THEN
   RAISE EXCEPTION 'p004 binding cannot reactivate';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND (NEW.revoked_at IS DISTINCT FROM OLD.revoked_at OR NEW.revoked_by_id IS DISTINCT FROM OLD.revoked_by_id) THEN
   RAISE EXCEPTION 'p004 binding revocation immutable';
  END IF;
 ELSIF TG_TABLE_NAME = 'print_delegations' THEN
  IF OLD.revoked_at IS NOT NULL AND (NEW.revoked_at IS DISTINCT FROM OLD.revoked_at OR NEW.revocation_reason IS DISTINCT FROM OLD.revocation_reason) THEN
   RAISE EXCEPTION 'p004 delegation cannot reactivate';
  END IF;
 ELSIF TG_TABLE_NAME = 'print_documents' THEN
  IF NEW.risk_revision < OLD.risk_revision OR
    (OLD.initial_intent_id IS NOT NULL AND NEW.initial_intent_id IS DISTINCT FROM OLD.initial_intent_id) OR
    (OLD.initial_state <> 'OPEN' AND (NEW.initial_state <> OLD.initial_state OR NEW.closed_by_intent_id IS DISTINCT FROM OLD.closed_by_intent_id)) OR
    (OLD.retired_at IS NOT NULL AND NEW.retired_at IS DISTINCT FROM OLD.retired_at) THEN
   RAISE EXCEPTION 'p004 document slot/risk/retirement cannot regress';
  END IF;
  IF OLD.initial_state = 'OPEN' AND NEW.initial_state <> 'OPEN' THEN
   SELECT * INTO j FROM "public"."print_jobs" WHERE intent_id = NEW.closed_by_intent_id AND document_id = NEW.id AND store_id = NEW.store_id;
   IF NOT FOUND OR (NEW.initial_state = 'INITIAL_REGISTERED' AND (j.kind <> 'INITIAL' OR j.intent_id IS DISTINCT FROM NEW.initial_intent_id))
     OR (NEW.initial_state = 'HISTORICAL_CLOSED' AND j.kind <> 'REPRINT') THEN
    RAISE EXCEPTION 'p004 slot closure requires real matching job';
   END IF;
  END IF;
 ELSIF TG_TABLE_NAME = 'print_jobs' THEN
  IF (NEW.snapshot_cipher IS DISTINCT FROM OLD.snapshot_cipher AND NEW.snapshot_cipher IS NOT NULL) OR
     (OLD.snapshot_cipher IS NULL AND NEW.snapshot_purged_at IS DISTINCT FROM OLD.snapshot_purged_at) OR
     (NEW.snapshot_cipher IS NOT NULL AND NEW.snapshot_key_ref IS DISTINCT FROM OLD.snapshot_key_ref) OR
     NEW.confirmed_risk_revision < OLD.confirmed_risk_revision THEN
   RAISE EXCEPTION 'p004 snapshot may only be purged; risk cannot regress';
  END IF;
 ELSIF TG_TABLE_NAME = 'print_requests' THEN
  IF (OLD.job_id IS NOT NULL AND (NEW.job_id IS DISTINCT FROM OLD.job_id OR NEW.consumed_at IS DISTINCT FROM OLD.consumed_at)) OR
     (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) OR
     (NEW.command IS DISTINCT FROM OLD.command AND NEW.command IS NOT NULL) OR
     (OLD.command IS NULL AND NEW.command_purged_at IS DISTINCT FROM OLD.command_purged_at) THEN
   RAISE EXCEPTION 'p004 receipt/grant cannot be reused or reconstructed';
  END IF;
  IF NEW.job_id IS NOT NULL THEN
   SELECT * INTO j FROM "public"."print_jobs" WHERE id = NEW.job_id AND document_id = NEW.document_id AND store_id = NEW.store_id;
   IF NOT FOUND OR j.intent_id <> NEW.intent_id THEN RAISE EXCEPTION 'p004 receipt intent mismatch'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME = 'print_copies' THEN
  IF (NEW.payload_cipher IS DISTINCT FROM OLD.payload_cipher AND NEW.payload_cipher IS NOT NULL) OR
    (OLD.payload_cipher IS NULL AND NEW.payload_purged_at IS DISTINCT FROM OLD.payload_purged_at) OR
    (NEW.payload_cipher IS NOT NULL AND NEW.payload_key_ref IS DISTINCT FROM OLD.payload_key_ref) OR
    NEW.lease_epoch < OLD.lease_epoch OR
    (OLD.retry_suppressed_by_job_id IS NOT NULL AND NEW.retry_suppressed_by_job_id IS DISTINCT FROM OLD.retry_suppressed_by_job_id) THEN
   RAISE EXCEPTION 'p004 copy content/fencing/suppression cannot regress';
  END IF;
  IF (NEW.lease_owner IS DISTINCT FROM OLD.lease_owner OR NEW.lease_until IS DISTINCT FROM OLD.lease_until) AND NEW.lease_epoch <= OLD.lease_epoch THEN
   RAISE EXCEPTION 'p004 lease change requires new epoch';
  END IF;
  IF NEW.state <> OLD.state AND NOT (
    (OLD.state = 'REGISTERED' AND NEW.state IN ('READY','CANCELLED','EXPIRED','PRE_SEND_FAILED')) OR
    (OLD.state = 'READY' AND NEW.state IN ('SENDING','CANCELLED','EXPIRED','PRE_SEND_FAILED')) OR
    (OLD.state = 'SENDING' AND NEW.state IN ('TRANSPORT_ACCEPTED','SPOOLER_ACCEPTED','PRE_SEND_FAILED','UNKNOWN','BROWSER_AVAILABLE')) OR
    (OLD.state = 'UNKNOWN' AND NEW.state IN ('TRANSPORT_ACCEPTED','SPOOLER_ACCEPTED','PRE_SEND_FAILED','BROWSER_AVAILABLE')) OR
    (OLD.state = 'TRANSPORT_ACCEPTED' AND NEW.state = 'SPOOLER_ACCEPTED') OR
    (OLD.state = 'PRE_SEND_FAILED' AND NEW.state IN ('READY','CANCELLED','EXPIRED'))) THEN
   RAISE EXCEPTION 'p004 illegal copy transition';
  END IF;
  IF NEW.state = 'READY' AND NEW.retry_suppressed_by_job_id IS NOT NULL THEN
   RAISE EXCEPTION 'p004 retry suppressed by additional intent';
  END IF;
  IF NEW.state = 'SENDING' AND OLD.state <> 'SENDING' THEN
   SELECT * INTO j FROM "public"."print_jobs" WHERE id = NEW.job_id;
   IF NEW.payload_cipher IS NULL OR NEW.payload_expires_at <= clock_timestamp() OR
     j.authorization_expires_at <= clock_timestamp() OR NEW.retry_suppressed_by_job_id IS NOT NULL THEN
    RAISE EXCEPTION 'p004 copy cannot start';
   END IF;
  END IF;
  IF OLD.state IN ('SENDING','UNKNOWN') AND NEW.state = 'PRE_SEND_FAILED' THEN
   SELECT * INTO a FROM "public"."print_attempts" WHERE copy_id = NEW.id ORDER BY number DESC LIMIT 1;
   IF NOT FOUND OR a.result <> 'PRE_SEND_FAILED' OR NOT EXISTS (
    SELECT 1 FROM "public"."print_events" WHERE attempt_id = a.id AND proof_kind IN ('SYNTHETIC_NO_EFFECT','AGENT_NO_EFFECT')) THEN
    RAISE EXCEPTION 'p004 no pre-effect proof';
   END IF;
  END IF;
 ELSIF TG_TABLE_NAME = 'print_attempts' THEN
  IF NEW.result <> OLD.result AND NOT (
    (OLD.result = 'STARTED' AND NEW.result IN ('PRE_SEND_FAILED','UNKNOWN','TRANSPORT_ACCEPTED','SPOOLER_ACCEPTED','BROWSER_AVAILABLE')) OR
    (OLD.result = 'UNKNOWN' AND NEW.result IN ('PRE_SEND_FAILED','TRANSPORT_ACCEPTED','SPOOLER_ACCEPTED','BROWSER_AVAILABLE')) OR
    (OLD.result = 'TRANSPORT_ACCEPTED' AND NEW.result = 'SPOOLER_ACCEPTED')) THEN
   RAISE EXCEPTION 'p004 illegal attempt transition';
  END IF;
  IF OLD.external_ref IS NOT NULL AND NEW.external_ref IS DISTINCT FROM OLD.external_ref THEN
   RAISE EXCEPTION 'p004 external reference immutable';
  END IF;
  IF NEW.result IN ('PRE_SEND_FAILED','TRANSPORT_ACCEPTED','SPOOLER_ACCEPTED','BROWSER_AVAILABLE') AND NOT EXISTS (
   SELECT 1 FROM "public"."print_events" WHERE attempt_id = NEW.id AND proof_kind = ANY (
    CASE NEW.result WHEN 'PRE_SEND_FAILED' THEN ARRAY['SYNTHETIC_NO_EFFECT','AGENT_NO_EFFECT']
     WHEN 'TRANSPORT_ACCEPTED' THEN ARRAY['SYNTHETIC_TRANSPORT_ACCEPTED']
     WHEN 'SPOOLER_ACCEPTED' THEN ARRAY['SYNTHETIC_SPOOLER_ACCEPTED','AGENT_SPOOLER_ACCEPTED']
     ELSE ARRAY['SYNTHETIC_BROWSER_AVAILABLE'] END)) THEN
   RAISE EXCEPTION 'p004 result requires correlated evidence';
  END IF;
 ELSIF TG_TABLE_NAME = 'print_events' THEN
  IF (NEW.details IS DISTINCT FROM OLD.details AND NEW.details IS NOT NULL) OR
    (OLD.details_purged_at IS NOT NULL AND NEW.details_purged_at IS DISTINCT FROM OLD.details_purged_at) THEN
   RAISE EXCEPTION 'p004 event is append-only except one-way detail purge';
  END IF;
 ELSIF TG_TABLE_NAME = 'print_destinations' THEN
  IF NEW.gate_epoch < OLD.gate_epoch OR
   ((NEW.held_attempt_id IS DISTINCT FROM OLD.held_attempt_id OR NEW.release_event_id IS DISTINCT FROM OLD.release_event_id) AND NEW.gate_epoch <= OLD.gate_epoch) THEN
   RAISE EXCEPTION 'p004 gate requires increasing epoch';
  END IF;
  IF OLD.held_attempt_id IS NOT NULL AND NEW.held_attempt_id IS DISTINCT FROM OLD.held_attempt_id THEN
   IF NEW.held_attempt_id IS NOT NULL OR NEW.release_event_id IS NULL OR NEW.release_event_id IS NOT DISTINCT FROM OLD.release_event_id THEN
    RAISE EXCEPTION 'p004 cannot replace active egress without release proof';
   END IF;
   SELECT * INTO e FROM "public"."print_events" WHERE id = NEW.release_event_id;
   IF NOT FOUND OR e.destination_id IS DISTINCT FROM OLD.id OR e.attempt_id IS DISTINCT FROM OLD.held_attempt_id OR
     e.store_id IS DISTINCT FROM OLD.held_store_id OR NOT (
      (OLD.serialization_mode = 'SYNTHETIC' AND e.proof_kind IN ('SYNTHETIC_NO_EFFECT','SYNTHETIC_EGRESS_CLOSED','SYNTHETIC_ATOMIC_QUEUE')) OR
      (OLD.serialization_mode = 'LOCAL_AGENT_SERIAL' AND e.proof_kind IN ('AGENT_NO_EFFECT','AGENT_EGRESS_CLOSED'))) THEN
    RAISE EXCEPTION 'p004 release proof missing or not from the destination serialization mode';
   END IF;
  END IF;
  IF NEW.held_attempt_id IS NOT NULL AND NEW.held_attempt_id IS DISTINCT FROM OLD.held_attempt_id THEN
   SELECT * INTO a FROM "public"."print_attempts" WHERE id = NEW.held_attempt_id AND store_id = NEW.held_store_id;
   IF NOT FOUND OR a.destination_id IS DISTINCT FROM NEW.id OR a.result <> 'STARTED' THEN
    RAISE EXCEPTION 'p004 destination holder mismatch';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $p004$;

CREATE OR REPLACE FUNCTION "public".p004_insert_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $p004$
DECLARE d "public"."print_documents"%ROWTYPE; j "public"."print_jobs"%ROWTYPE; b "public"."print_bindings"%ROWTYPE; c "public"."print_copies"%ROWTYPE;
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' THEN RAISE EXCEPTION 'p004 schema mismatch'; END IF;
 IF TG_TABLE_NAME = 'print_bindings' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.binding_id::text, 4004));
  IF EXISTS (SELECT 1 FROM "public"."print_bindings" WHERE binding_id = NEW.binding_id AND
    (store_id <> NEW.store_id OR terminal_id <> NEW.terminal_id OR family <> NEW.family)) OR
    NEW.version <> COALESCE((SELECT max(version) FROM "public"."print_bindings" WHERE binding_id = NEW.binding_id),0) + 1 THEN
   RAISE EXCEPTION 'p004 binding version/group mismatch';
  END IF;
 ELSIF TG_TABLE_NAME = 'print_destinations' THEN
  IF NEW.held_attempt_id IS NOT NULL OR NEW.held_store_id IS NOT NULL OR NEW.release_event_id IS NOT NULL OR NEW.blocked_at IS NOT NULL OR NEW.gate_epoch <> 0 THEN
   RAISE EXCEPTION 'p004 destination starts without fabricated egress';
  END IF;
 ELSIF TG_TABLE_NAME = 'print_documents' THEN
  IF NEW.initial_state <> 'OPEN' OR NEW.initial_intent_id IS NOT NULL OR NEW.closed_by_intent_id IS NOT NULL OR
    NEW.active_reprint_intent_id IS NOT NULL OR NEW.risk_revision <> 0 OR NEW.retired_at IS NOT NULL THEN
   RAISE EXCEPTION 'p004 document starts without fabricated history';
  END IF;
 ELSIF TG_TABLE_NAME = 'print_jobs' THEN
  SELECT * INTO d FROM "public"."print_documents" WHERE id = NEW.document_id AND store_id = NEW.store_id;
  IF NOT FOUND OR d.retired_at IS NOT NULL OR
    (d.document_kind = 'SALE' AND NEW.kind NOT IN ('INITIAL','REPRINT')) OR
    (d.document_kind = 'SYNTHETIC' AND NEW.kind <> 'TEST') OR
    (NEW.kind = 'INITIAL' AND (d.initial_state <> 'OPEN' OR d.initial_intent_id IS DISTINCT FROM NEW.intent_id)) THEN
   RAISE EXCEPTION 'p004 document/initial slot incompatible';
  END IF;
  IF NEW.snapshot_cipher IS NULL OR NEW.snapshot_key_ref IS NULL OR NEW.snapshot_purged_at IS NOT NULL THEN
   RAISE EXCEPTION 'p004 no fabricated expired job';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "public"."print_delegations" g JOIN "public"."admin_users" u ON u.id = g.principal_id
    WHERE g.id = NEW.delegation_id AND g.store_id = NEW.store_id AND g.principal_id = NEW.principal_id
    AND g.revoked_at IS NULL AND g.expires_at > clock_timestamp()
    AND u.active AND NOT u."mustChangePassword" AND u."sessionVersion" = g.session_version) THEN
   RAISE EXCEPTION 'p004 delegation inactive';
  END IF;
  IF NEW.delivery_mode = 'THERMAL_BOUND' THEN
   SELECT * INTO b FROM "public"."print_bindings" WHERE id = NEW.binding_version_id AND store_id = NEW.store_id AND terminal_id = NEW.terminal_id;
   IF NOT FOUND OR b.state <> 'ACTIVE' OR b.family <> d.family OR b.profile_id <> NEW.profile_id OR b.profile_version <> NEW.profile_version THEN
    RAISE EXCEPTION 'p004 binding/profile mismatch';
   END IF;
   IF NOT EXISTS (SELECT 1 FROM "public"."print_installations" i WHERE i.id = b.installation_id AND i.revoked_at IS NULL AND
     ((NEW.execution_mode = 'SYNTHETIC_ONLY' AND i.proof_mode = 'SYNTHETIC') OR (NEW.execution_mode = 'LOCAL_AGENT' AND i.proof_mode = 'LOCAL_AGENT'))) THEN
    RAISE EXCEPTION 'p004 execution mode/installation mismatch';
   END IF;
  ELSIF NEW.execution_mode = 'LOCAL_AGENT' THEN RAISE EXCEPTION 'p004 local agent requires bound thermal destination';
  ELSIF NEW.profile_id <> 'A4' THEN RAISE EXCEPTION 'p004 A4 logical profile required';
  END IF;
 ELSIF TG_TABLE_NAME = 'print_requests' THEN
  IF NEW.command IS NULL OR NEW.command_purged_at IS NOT NULL OR NEW.job_id IS NOT NULL OR NEW.consumed_at IS NOT NULL THEN
   RAISE EXCEPTION 'p004 request must be issued before consumption';
  END IF;
 ELSIF TG_TABLE_NAME = 'print_copies' THEN
  SELECT * INTO j FROM "public"."print_jobs" WHERE id = NEW.job_id;
  IF NEW.ordinal > j.copies OR NEW.state <> 'REGISTERED' OR NEW.payload_cipher IS NULL OR
    NEW.payload_purged_at IS NOT NULL OR NEW.payload_expires_at > j.content_expires_at OR
    NEW.lease_owner IS NOT NULL OR NEW.lease_until IS NOT NULL OR NEW.lease_epoch <> 0 THEN
   RAISE EXCEPTION 'p004 copy must be sealed once';
  END IF;
 ELSIF TG_TABLE_NAME = 'print_attempts' THEN
  SELECT * INTO c FROM "public"."print_copies" WHERE id = NEW.copy_id;
  SELECT * INTO j FROM "public"."print_jobs" WHERE id = NEW.job_id;
  IF NEW.result <> 'STARTED' OR NEW.lease_epoch <> c.lease_epoch OR
    c.state <> 'READY' OR c.lease_owner IS NULL OR c.lease_until <= clock_timestamp() OR c.retry_suppressed_by_job_id IS NOT NULL OR
    (j.delivery_mode = 'THERMAL_BOUND' AND NEW.destination_id IS DISTINCT FROM (SELECT destination_id FROM "public"."print_bindings" WHERE id = j.binding_version_id)) OR
    (j.delivery_mode = 'BROWSER_A4' AND NEW.destination_id IS NOT NULL) OR
    (j.delivery_mode = 'THERMAL_BOUND' AND NOT EXISTS (
     SELECT 1 FROM "public"."print_bindings" candidate_binding JOIN "public"."print_installations" i ON i.id = candidate_binding.installation_id
     JOIN "public"."print_destinations" q ON q.id = candidate_binding.destination_id WHERE candidate_binding.id = j.binding_version_id
     AND candidate_binding.state = 'ACTIVE' AND i.revoked_at IS NULL AND (
      (j.execution_mode = 'SYNTHETIC_ONLY' AND i.proof_mode = 'SYNTHETIC' AND q.serialization_mode = 'SYNTHETIC') OR
      (j.execution_mode = 'LOCAL_AGENT' AND i.proof_mode = 'LOCAL_AGENT' AND q.serialization_mode = 'LOCAL_AGENT_SERIAL'))
    )) THEN
   RAISE EXCEPTION 'p004 invalid attempt start';
  END IF;
 ELSIF TG_TABLE_NAME = 'print_events' AND NEW.proof_kind <> 'NONE' THEN
  IF NOT EXISTS (SELECT 1 FROM "public"."print_jobs" WHERE id = NEW.job_id AND (
      (execution_mode = 'SYNTHETIC_ONLY' AND NEW.proof_kind LIKE 'SYNTHETIC\_%') OR
      (execution_mode = 'LOCAL_AGENT' AND NEW.proof_kind LIKE 'AGENT\_%'))) OR
    NEW.destination_id IS DISTINCT FROM (SELECT destination_id FROM "public"."print_attempts" WHERE id = NEW.attempt_id) THEN
   RAISE EXCEPTION 'p004 proof must identify attempt/destination of the same execution mode';
  END IF;
 END IF;
 RETURN NEW;
END $p004$;

CREATE OR REPLACE FUNCTION "public".p004_commit_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $p004$
DECLARE job_key uuid; j "public"."print_jobs"%ROWTYPE; d "public"."print_documents"%ROWTYPE; c "public"."print_copies"%ROWTYPE; a "public"."print_attempts"%ROWTYPE; total_copies bigint; max_ordinal integer;
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' THEN RAISE EXCEPTION 'p004 schema mismatch'; END IF;
 IF TG_TABLE_NAME = 'print_jobs' THEN job_key := NEW.id; ELSE job_key := NEW.job_id; END IF;
 SELECT * INTO j FROM "public"."print_jobs" WHERE id = job_key;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT count(*),max(ordinal) INTO total_copies,max_ordinal FROM "public"."print_copies" WHERE job_id = job_key;
 IF total_copies <> j.copies OR max_ordinal <> j.copies THEN RAISE EXCEPTION 'p004 complete copy set required'; END IF;
 SELECT * INTO d FROM "public"."print_documents" WHERE id = j.document_id;
 IF j.kind = 'INITIAL' AND (d.initial_state <> 'INITIAL_REGISTERED' OR d.closed_by_intent_id IS DISTINCT FROM j.intent_id) THEN
  RAISE EXCEPTION 'p004 initial slot must close in same transaction';
 END IF;
 IF j.kind = 'REPRINT' AND d.initial_state = 'OPEN' THEN
  RAISE EXCEPTION 'p004 historical reprint must close initial slot';
 END IF;
 FOR c IN SELECT * FROM "public"."print_copies" WHERE job_id = j.id LOOP
  SELECT * INTO a FROM "public"."print_attempts" WHERE copy_id = c.id ORDER BY number DESC LIMIT 1;
  IF c.state IN ('SENDING','UNKNOWN','TRANSPORT_ACCEPTED','SPOOLER_ACCEPTED','BROWSER_AVAILABLE') THEN
   IF a.id IS NULL OR a.result <> (CASE c.state WHEN 'SENDING' THEN 'STARTED' ELSE c.state END) THEN
    RAISE EXCEPTION 'p004 copy requires matching durable attempt';
   END IF;
  END IF;
  IF a.id IS NOT NULL AND a.result IN ('STARTED','UNKNOWN','TRANSPORT_ACCEPTED','SPOOLER_ACCEPTED','BROWSER_AVAILABLE') THEN
   IF c.state <> (CASE a.result WHEN 'STARTED' THEN 'SENDING' ELSE a.result END) THEN
    RAISE EXCEPTION 'p004 attempt/copy evidence mismatch';
   END IF;
   IF a.destination_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "public"."print_destinations" WHERE id = a.destination_id AND held_attempt_id = a.id AND held_store_id = a.store_id
   ) AND NOT EXISTS (
    SELECT 1 FROM "public"."print_events" WHERE attempt_id = a.id AND destination_id = a.destination_id
     AND proof_kind IN ('SYNTHETIC_NO_EFFECT','SYNTHETIC_EGRESS_CLOSED','SYNTHETIC_ATOMIC_QUEUE','AGENT_NO_EFFECT','AGENT_EGRESS_CLOSED')
   ) THEN RAISE EXCEPTION 'p004 destination cannot forget potential egress';
   END IF;
  END IF;
 END LOOP;
 RETURN NULL;
END $p004$;
COMMIT;
