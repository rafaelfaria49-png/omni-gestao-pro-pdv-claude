-- PROPOSTA 004A (variante futura 004C): igual ao 01 sem os dois indices pais, criados antes por 00_parent_indexes_concurrently.sql.
-- LABORATORIO. NAO APLICAR EM PRODUCAO sem aprovacao D02/D04 e janela operacional.
-- IDs novos UUID gerados pelo servidor; sem extensao; objetos em public.
BEGIN;
DO $p004$ BEGIN
 IF (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname IN ('p004_vendas_id_store_uq','p004_term_id_store_uq') AND i.indisvalid AND i.indisunique) <> 2 THEN
  RAISE EXCEPTION 'p004 parent indexes must exist and be VALID (run 00_parent_indexes_concurrently.sql first)';
 END IF;
END $p004$;

CREATE TABLE "public"."print_installations" (
  "id" UUID NOT NULL,
  "identity_hash" CHAR(64) NOT NULL,
  "proof_mode" TEXT NOT NULL,
  "revocation_epoch" BIGINT NOT NULL DEFAULT 0,
  "revoked_at" TIMESTAMPTZ(3),
  "revoked_by_id" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "print_installations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "print_installations_u1" UNIQUE ("identity_hash")
);

CREATE TABLE "public"."print_destinations" (
  "id" UUID NOT NULL,
  "identity_hash" CHAR(64) NOT NULL,
  "serialization_mode" TEXT NOT NULL,
  "gate_epoch" BIGINT NOT NULL DEFAULT 0,
  "held_attempt_id" UUID,
  "held_store_id" TEXT,
  "blocked_at" TIMESTAMPTZ(3),
  "release_event_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "print_destinations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "print_destinations_u1" UNIQUE ("identity_hash")
);

CREATE TABLE "public"."print_bindings" (
  "id" UUID NOT NULL,
  "store_id" TEXT NOT NULL,
  "binding_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "terminal_id" TEXT NOT NULL,
  "installation_id" UUID NOT NULL,
  "destination_id" UUID NOT NULL,
  "transport_destination_ref" TEXT NOT NULL,
  "profile_id" TEXT NOT NULL,
  "profile_version" INTEGER NOT NULL,
  "profile_hash" CHAR(64) NOT NULL,
  "profile" JSONB NOT NULL,
  "state" TEXT NOT NULL,
  "family" TEXT NOT NULL,
  "configured_by_id" TEXT NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  "revoked_by_id" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "print_bindings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "print_bindings_u1" UNIQUE ("binding_id", "version"),
  CONSTRAINT "print_bindings_u2" UNIQUE ("id", "store_id"),
  CONSTRAINT "print_bindings_u3" UNIQUE ("id", "store_id", "terminal_id")
);
CREATE INDEX "print_bindings_i1" ON "public"."print_bindings" ("store_id", "terminal_id");
CREATE INDEX "print_bindings_i2" ON "public"."print_bindings" ("installation_id");
CREATE INDEX "print_bindings_i3" ON "public"."print_bindings" ("destination_id");

CREATE TABLE "public"."print_delegations" (
  "id" UUID NOT NULL,
  "store_id" TEXT NOT NULL,
  "principal_id" TEXT NOT NULL,
  "session_version" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  "revocation_reason" TEXT,
  CONSTRAINT "print_delegations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "print_delegations_u1" UNIQUE ("id", "store_id", "principal_id"),
  CONSTRAINT "print_delegations_u2" UNIQUE ("id", "store_id")
);
CREATE INDEX "print_delegations_i1" ON "public"."print_delegations" ("principal_id", "session_version");
CREATE INDEX "print_delegations_i2" ON "public"."print_delegations" ("store_id", "expires_at");

CREATE TABLE "public"."print_documents" (
  "id" UUID NOT NULL,
  "store_id" TEXT NOT NULL,
  "document_kind" TEXT NOT NULL,
  "sale_id" TEXT,
  "synthetic_key" UUID,
  "family" TEXT NOT NULL,
  "initial_state" TEXT NOT NULL DEFAULT 'OPEN',
  "initial_intent_id" UUID,
  "closed_by_intent_id" UUID,
  "active_reprint_intent_id" UUID,
  "active_reprint_until" TIMESTAMPTZ(3),
  "risk_revision" BIGINT NOT NULL DEFAULT 0,
  "retired_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "print_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "print_documents_u1" UNIQUE ("id", "store_id"),
  CONSTRAINT "print_documents_u2" UNIQUE ("store_id", "sale_id", "family"),
  CONSTRAINT "print_documents_u3" UNIQUE ("store_id", "synthetic_key")
);

CREATE TABLE "public"."print_jobs" (
  "id" UUID NOT NULL,
  "store_id" TEXT NOT NULL,
  "document_id" UUID NOT NULL,
  "intent_id" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "execution_mode" TEXT NOT NULL,
  "principal_id" TEXT NOT NULL,
  "delegation_id" UUID NOT NULL,
  "terminal_id" TEXT NOT NULL,
  "delivery_mode" TEXT NOT NULL,
  "binding_version_id" UUID,
  "browser_context_id" TEXT,
  "copies" INTEGER NOT NULL,
  "document_version" CHAR(64) NOT NULL,
  "canonical_version" INTEGER NOT NULL,
  "snapshot_hash" CHAR(64) NOT NULL,
  "snapshot_cipher" BYTEA,
  "snapshot_key_ref" TEXT,
  "snapshot_purged_at" TIMESTAMPTZ(3),
  "payload_manifest_hash" CHAR(64) NOT NULL,
  "renderer_version" TEXT NOT NULL,
  "profile_id" TEXT NOT NULL,
  "profile_version" INTEGER NOT NULL,
  "previous_job_id" UUID,
  "reason_code" TEXT,
  "confirmed_risk_revision" BIGINT NOT NULL DEFAULT 0,
  "confirmed_exposure_hash" CHAR(64) NOT NULL,
  "risk_confirmed_at" TIMESTAMPTZ(3),
  "authorization_expires_at" TIMESTAMPTZ(3) NOT NULL,
  "content_expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "print_jobs_u1" UNIQUE ("intent_id"),
  CONSTRAINT "print_jobs_u3" UNIQUE ("id", "document_id", "store_id")
);
CREATE INDEX "print_jobs_i1" ON "public"."print_jobs" ("store_id", "document_id", "created_at");
CREATE INDEX "print_jobs_i2" ON "public"."print_jobs" ("delegation_id");
CREATE INDEX "print_jobs_i3" ON "public"."print_jobs" ("store_id","created_at");
CREATE INDEX "print_jobs_i4" ON "public"."print_jobs" ("store_id","terminal_id","created_at");

CREATE TABLE "public"."print_requests" (
  "id" UUID NOT NULL,
  "store_id" TEXT NOT NULL,
  "document_id" UUID NOT NULL,
  "principal_id" TEXT NOT NULL,
  "delegation_id" UUID NOT NULL,
  "intent_id" UUID NOT NULL,
  "command" JSONB,
  "command_hash" CHAR(64) NOT NULL,
  "canonical_version" INTEGER NOT NULL,
  "risk_revision" BIGINT NOT NULL DEFAULT 0,
  "risk_set_hash" CHAR(64) NOT NULL,
  "risk_confirmed_at" TIMESTAMPTZ(3),
  "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  "job_id" UUID,
  "consumed_at" TIMESTAMPTZ(3),
  "command_purged_at" TIMESTAMPTZ(3),
  CONSTRAINT "print_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "print_requests_i1" ON "public"."print_requests" ("store_id", "intent_id");
CREATE INDEX "print_requests_i2" ON "public"."print_requests" ("expires_at");
CREATE INDEX "print_requests_i3" ON "public"."print_requests" ("principal_id","issued_at");

CREATE TABLE "public"."print_copies" (
  "id" UUID NOT NULL,
  "store_id" TEXT NOT NULL,
  "document_id" UUID NOT NULL,
  "job_id" UUID NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'REGISTERED',
  "payload_hash" CHAR(64) NOT NULL,
  "payload_size" INTEGER NOT NULL,
  "payload_cipher" BYTEA,
  "payload_key_ref" TEXT,
  "payload_expires_at" TIMESTAMPTZ(3) NOT NULL,
  "payload_purged_at" TIMESTAMPTZ(3),
  "send_key" UUID NOT NULL,
  "lease_owner" TEXT,
  "lease_until" TIMESTAMPTZ(3),
  "lease_epoch" BIGINT NOT NULL DEFAULT 0,
  "retry_suppressed_by_job_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "print_copies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "print_copies_u1" UNIQUE ("job_id", "ordinal"),
  CONSTRAINT "print_copies_u2" UNIQUE ("send_key"),
  CONSTRAINT "print_copies_u3" UNIQUE ("id", "job_id", "document_id", "store_id")
);
CREATE INDEX "print_copies_i1" ON "public"."print_copies" ("store_id", "document_id");
CREATE INDEX "print_copies_i2" ON "public"."print_copies" ("lease_until");

CREATE TABLE "public"."print_attempts" (
  "id" UUID NOT NULL,
  "store_id" TEXT NOT NULL,
  "document_id" UUID NOT NULL,
  "job_id" UUID NOT NULL,
  "copy_id" UUID NOT NULL,
  "number" INTEGER NOT NULL,
  "lease_epoch" BIGINT NOT NULL DEFAULT 0,
  "destination_id" UUID,
  "result" TEXT NOT NULL,
  "external_ref" TEXT,
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(3),
  CONSTRAINT "print_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "print_attempts_u1" UNIQUE ("copy_id", "number"),
  CONSTRAINT "print_attempts_u2" UNIQUE ("id", "store_id"),
  CONSTRAINT "print_attempts_u3" UNIQUE ("id", "copy_id", "job_id", "document_id", "store_id")
);
CREATE INDEX "print_attempts_i1" ON "public"."print_attempts" ("store_id", "copy_id", "started_at");
CREATE INDEX "print_attempts_i2" ON "public"."print_attempts" ("destination_id");

CREATE TABLE "public"."print_events" (
  "id" UUID NOT NULL,
  "store_id" TEXT NOT NULL,
  "scope_kind" TEXT NOT NULL,
  "document_id" UUID,
  "binding_version_id" UUID,
  "delegation_id" UUID,
  "job_id" UUID,
  "copy_id" UUID,
  "attempt_id" UUID,
  "destination_id" UUID,
  "event_type" TEXT NOT NULL,
  "proof_kind" TEXT NOT NULL,
  "evidence_hash" CHAR(64),
  "evidence_key" TEXT,
  "actor_kind" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "details" JSONB,
  "details_purged_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "print_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "print_events_u2" UNIQUE ("attempt_id", "evidence_key")
);
CREATE INDEX "print_events_i1" ON "public"."print_events" ("store_id", "document_id", "created_at");
CREATE INDEX "print_events_i2" ON "public"."print_events" ("attempt_id", "created_at");
CREATE INDEX "print_events_i3" ON "public"."print_events" ("binding_version_id");
CREATE INDEX "print_events_i4" ON "public"."print_events" ("delegation_id");

ALTER TABLE "public"."print_installations" ADD CONSTRAINT "p004_fk_01" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."admin_users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_destinations" ADD CONSTRAINT "p004_fk_02" FOREIGN KEY ("held_attempt_id", "held_store_id") REFERENCES "public"."print_attempts" ("id", "store_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_destinations" ADD CONSTRAINT "p004_fk_03" FOREIGN KEY ("release_event_id") REFERENCES "public"."print_events" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_bindings" ADD CONSTRAINT "p004_fk_04" FOREIGN KEY ("store_id") REFERENCES "public"."stores" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_bindings" ADD CONSTRAINT "p004_fk_05" FOREIGN KEY ("terminal_id", "store_id") REFERENCES "public"."pdv_terminais" ("id", "storeId") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_bindings" ADD CONSTRAINT "p004_fk_06" FOREIGN KEY ("installation_id") REFERENCES "public"."print_installations" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_bindings" ADD CONSTRAINT "p004_fk_07" FOREIGN KEY ("destination_id") REFERENCES "public"."print_destinations" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_bindings" ADD CONSTRAINT "p004_fk_08" FOREIGN KEY ("configured_by_id") REFERENCES "public"."admin_users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_bindings" ADD CONSTRAINT "p004_fk_09" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."admin_users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_delegations" ADD CONSTRAINT "p004_fk_10" FOREIGN KEY ("store_id") REFERENCES "public"."stores" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_delegations" ADD CONSTRAINT "p004_fk_11" FOREIGN KEY ("principal_id") REFERENCES "public"."admin_users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_documents" ADD CONSTRAINT "p004_fk_12" FOREIGN KEY ("store_id") REFERENCES "public"."stores" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_documents" ADD CONSTRAINT "p004_fk_13" FOREIGN KEY ("sale_id", "store_id") REFERENCES "public"."vendas" ("id", "storeId") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_jobs" ADD CONSTRAINT "p004_fk_14" FOREIGN KEY ("store_id") REFERENCES "public"."stores" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_jobs" ADD CONSTRAINT "p004_fk_15" FOREIGN KEY ("document_id", "store_id") REFERENCES "public"."print_documents" ("id", "store_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_jobs" ADD CONSTRAINT "p004_fk_16" FOREIGN KEY ("delegation_id", "store_id", "principal_id") REFERENCES "public"."print_delegations" ("id", "store_id", "principal_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_jobs" ADD CONSTRAINT "p004_fk_17" FOREIGN KEY ("terminal_id", "store_id") REFERENCES "public"."pdv_terminais" ("id", "storeId") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_jobs" ADD CONSTRAINT "p004_fk_18" FOREIGN KEY ("binding_version_id", "store_id", "terminal_id") REFERENCES "public"."print_bindings" ("id", "store_id", "terminal_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_jobs" ADD CONSTRAINT "p004_fk_19" FOREIGN KEY ("previous_job_id", "document_id", "store_id") REFERENCES "public"."print_jobs" ("id", "document_id", "store_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_requests" ADD CONSTRAINT "p004_fk_20" FOREIGN KEY ("store_id") REFERENCES "public"."stores" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_requests" ADD CONSTRAINT "p004_fk_21" FOREIGN KEY ("document_id", "store_id") REFERENCES "public"."print_documents" ("id", "store_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_requests" ADD CONSTRAINT "p004_fk_22" FOREIGN KEY ("delegation_id", "store_id", "principal_id") REFERENCES "public"."print_delegations" ("id", "store_id", "principal_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_requests" ADD CONSTRAINT "p004_fk_23" FOREIGN KEY ("job_id", "document_id", "store_id") REFERENCES "public"."print_jobs" ("id", "document_id", "store_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_copies" ADD CONSTRAINT "p004_fk_24" FOREIGN KEY ("job_id", "document_id", "store_id") REFERENCES "public"."print_jobs" ("id", "document_id", "store_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_copies" ADD CONSTRAINT "p004_fk_25" FOREIGN KEY ("retry_suppressed_by_job_id", "document_id", "store_id") REFERENCES "public"."print_jobs" ("id", "document_id", "store_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_attempts" ADD CONSTRAINT "p004_fk_26" FOREIGN KEY ("copy_id", "job_id", "document_id", "store_id") REFERENCES "public"."print_copies" ("id", "job_id", "document_id", "store_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_attempts" ADD CONSTRAINT "p004_fk_27" FOREIGN KEY ("destination_id") REFERENCES "public"."print_destinations" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_events" ADD CONSTRAINT "p004_fk_28" FOREIGN KEY ("store_id") REFERENCES "public"."stores" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_events" ADD CONSTRAINT "p004_fk_29" FOREIGN KEY ("document_id", "store_id") REFERENCES "public"."print_documents" ("id", "store_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_events" ADD CONSTRAINT "p004_fk_30" FOREIGN KEY ("binding_version_id", "store_id") REFERENCES "public"."print_bindings" ("id", "store_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_events" ADD CONSTRAINT "p004_fk_31" FOREIGN KEY ("delegation_id", "store_id") REFERENCES "public"."print_delegations" ("id", "store_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_events" ADD CONSTRAINT "p004_fk_32" FOREIGN KEY ("job_id", "document_id", "store_id") REFERENCES "public"."print_jobs" ("id", "document_id", "store_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_events" ADD CONSTRAINT "p004_fk_33" FOREIGN KEY ("copy_id", "job_id", "document_id", "store_id") REFERENCES "public"."print_copies" ("id", "job_id", "document_id", "store_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_events" ADD CONSTRAINT "p004_fk_34" FOREIGN KEY ("attempt_id", "copy_id", "job_id", "document_id", "store_id") REFERENCES "public"."print_attempts" ("id", "copy_id", "job_id", "document_id", "store_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_events" ADD CONSTRAINT "p004_fk_35" FOREIGN KEY ("destination_id") REFERENCES "public"."print_destinations" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."print_events" ADD CONSTRAINT "p004_fk_36" FOREIGN KEY ("actor_user_id") REFERENCES "public"."admin_users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."print_installations" ADD CONSTRAINT "print_installations_identity_hash_hex" CHECK (identity_hash IS NULL OR identity_hash::text ~ '^[0-9a-f]{64}$');
ALTER TABLE "public"."print_destinations" ADD CONSTRAINT "print_destinations_identity_hash_hex" CHECK (identity_hash IS NULL OR identity_hash::text ~ '^[0-9a-f]{64}$');
ALTER TABLE "public"."print_bindings" ADD CONSTRAINT "print_bindings_profile_hash_hex" CHECK (profile_hash IS NULL OR profile_hash::text ~ '^[0-9a-f]{64}$');
ALTER TABLE "public"."print_jobs" ADD CONSTRAINT "print_jobs_document_version_hex" CHECK (document_version IS NULL OR document_version::text ~ '^[0-9a-f]{64}$');
ALTER TABLE "public"."print_jobs" ADD CONSTRAINT "print_jobs_snapshot_hash_hex" CHECK (snapshot_hash IS NULL OR snapshot_hash::text ~ '^[0-9a-f]{64}$');
ALTER TABLE "public"."print_jobs" ADD CONSTRAINT "print_jobs_payload_manifest_hash_hex" CHECK (payload_manifest_hash IS NULL OR payload_manifest_hash::text ~ '^[0-9a-f]{64}$');
ALTER TABLE "public"."print_jobs" ADD CONSTRAINT "print_jobs_confirmed_exposure_hash_hex" CHECK (confirmed_exposure_hash IS NULL OR confirmed_exposure_hash::text ~ '^[0-9a-f]{64}$');
ALTER TABLE "public"."print_requests" ADD CONSTRAINT "print_requests_command_hash_hex" CHECK (command_hash IS NULL OR command_hash::text ~ '^[0-9a-f]{64}$');
ALTER TABLE "public"."print_requests" ADD CONSTRAINT "print_requests_risk_set_hash_hex" CHECK (risk_set_hash IS NULL OR risk_set_hash::text ~ '^[0-9a-f]{64}$');
ALTER TABLE "public"."print_copies" ADD CONSTRAINT "print_copies_payload_hash_hex" CHECK (payload_hash IS NULL OR payload_hash::text ~ '^[0-9a-f]{64}$');
ALTER TABLE "public"."print_events" ADD CONSTRAINT "print_events_evidence_hash_hex" CHECK (evidence_hash IS NULL OR evidence_hash::text ~ '^[0-9a-f]{64}$');
ALTER TABLE "public"."print_installations" ADD CONSTRAINT "print_installations_proof_ck" CHECK (proof_mode IN ('SYNTHETIC','UNVERIFIED'));
ALTER TABLE "public"."print_installations" ADD CONSTRAINT "print_installations_epoch_ck" CHECK (revocation_epoch >= 0);
ALTER TABLE "public"."print_installations" ADD CONSTRAINT "print_installations_revoked_ck" CHECK ((revoked_at IS NULL) = (revoked_by_id IS NULL));
ALTER TABLE "public"."print_destinations" ADD CONSTRAINT "print_destinations_mode_ck" CHECK (serialization_mode IN ('SYNTHETIC','UNVERIFIED'));
ALTER TABLE "public"."print_destinations" ADD CONSTRAINT "print_destinations_epoch_ck" CHECK (gate_epoch >= 0);
ALTER TABLE "public"."print_destinations" ADD CONSTRAINT "print_destinations_holder_ck" CHECK ((held_attempt_id IS NULL) = (held_store_id IS NULL));
ALTER TABLE "public"."print_destinations" ADD CONSTRAINT "print_destinations_blocked_ck" CHECK (held_attempt_id IS NULL OR blocked_at IS NOT NULL);
ALTER TABLE "public"."print_bindings" ADD CONSTRAINT "print_bindings_version_ck" CHECK (version > 0 AND profile_version > 0);
ALTER TABLE "public"."print_bindings" ADD CONSTRAINT "print_bindings_state_ck" CHECK (state IN ('PENDING','ACTIVE','REVOKED'));
ALTER TABLE "public"."print_bindings" ADD CONSTRAINT "print_bindings_family_ck" CHECK (family IN ('SALE_RECEIPT','SYNTHETIC_TEST'));
ALTER TABLE "public"."print_bindings" ADD CONSTRAINT "print_bindings_revocation_ck" CHECK ((state = 'REVOKED') = (revoked_at IS NOT NULL AND revoked_by_id IS NOT NULL) AND ((revoked_at IS NULL) = (revoked_by_id IS NULL)));
ALTER TABLE "public"."print_bindings" ADD CONSTRAINT "print_bindings_profile_ck" CHECK (jsonb_typeof(profile) = 'object');
ALTER TABLE "public"."print_delegations" ADD CONSTRAINT "print_delegations_version_ck" CHECK (session_version >= 0);
ALTER TABLE "public"."print_delegations" ADD CONSTRAINT "print_delegations_expiry_ck" CHECK (expires_at > created_at);
ALTER TABLE "public"."print_delegations" ADD CONSTRAINT "print_delegations_revocation_ck" CHECK ((revoked_at IS NULL) = (revocation_reason IS NULL));
ALTER TABLE "public"."print_documents" ADD CONSTRAINT "print_documents_refs_ck" CHECK ((document_kind = 'SALE' AND sale_id IS NOT NULL AND synthetic_key IS NULL AND family = 'SALE_RECEIPT') OR (document_kind = 'SYNTHETIC' AND sale_id IS NULL AND synthetic_key IS NOT NULL AND family = 'SYNTHETIC_TEST'));
ALTER TABLE "public"."print_documents" ADD CONSTRAINT "print_documents_initial_ck" CHECK (initial_state IN ('OPEN','INITIAL_REGISTERED','HISTORICAL_CLOSED') AND ((initial_state = 'OPEN' AND closed_by_intent_id IS NULL) OR (initial_state <> 'OPEN' AND closed_by_intent_id IS NOT NULL)));
ALTER TABLE "public"."print_documents" ADD CONSTRAINT "print_documents_synthetic_ck" CHECK (document_kind <> 'SYNTHETIC' OR (initial_state = 'OPEN' AND initial_intent_id IS NULL AND closed_by_intent_id IS NULL));
ALTER TABLE "public"."print_documents" ADD CONSTRAINT "print_documents_active_ck" CHECK ((active_reprint_intent_id IS NULL) = (active_reprint_until IS NULL));
ALTER TABLE "public"."print_documents" ADD CONSTRAINT "print_documents_risk_ck" CHECK (risk_revision >= 0);
ALTER TABLE "public"."print_jobs" ADD CONSTRAINT "print_jobs_kind_ck" CHECK (kind IN ('INITIAL','REPRINT','TEST'));
ALTER TABLE "public"."print_jobs" ADD CONSTRAINT "print_jobs_synthetic_only_ck" CHECK (execution_mode = 'SYNTHETIC_ONLY');
ALTER TABLE "public"."print_jobs" ADD CONSTRAINT "print_jobs_target_ck" CHECK ((delivery_mode = 'THERMAL_BOUND' AND binding_version_id IS NOT NULL AND browser_context_id IS NULL) OR (delivery_mode = 'BROWSER_A4' AND binding_version_id IS NULL AND browser_context_id IS NOT NULL AND copies = 1));
ALTER TABLE "public"."print_jobs" ADD CONSTRAINT "print_jobs_copies_ck" CHECK (copies > 0);
ALTER TABLE "public"."print_jobs" ADD CONSTRAINT "print_jobs_versions_ck" CHECK (canonical_version = 1 AND profile_version > 0 AND confirmed_risk_revision >= 0);
ALTER TABLE "public"."print_jobs" ADD CONSTRAINT "print_jobs_reason_ck" CHECK ((kind = 'REPRINT' AND reason_code IS NOT NULL AND reason_code IN ('CUSTOMER_REQUEST','ILLEGIBLE','LOST','UNCERTAIN_RESULT','EXPLICIT_FALLBACK','UPDATED_DOCUMENT')) OR (kind <> 'REPRINT' AND reason_code IS NULL AND previous_job_id IS NULL));
ALTER TABLE "public"."print_jobs" ADD CONSTRAINT "print_jobs_not_self_ck" CHECK (previous_job_id IS NULL OR previous_job_id <> id);
ALTER TABLE "public"."print_jobs" ADD CONSTRAINT "print_jobs_expiry_ck" CHECK (authorization_expires_at > created_at AND content_expires_at >= authorization_expires_at);
ALTER TABLE "public"."print_jobs" ADD CONSTRAINT "print_jobs_snapshot_ck" CHECK ((snapshot_cipher IS NOT NULL AND snapshot_key_ref IS NOT NULL AND snapshot_purged_at IS NULL) OR (snapshot_cipher IS NULL AND snapshot_key_ref IS NULL AND snapshot_purged_at IS NOT NULL));
ALTER TABLE "public"."print_requests" ADD CONSTRAINT "print_requests_canonical_ck" CHECK (canonical_version = 1 AND risk_revision >= 0);
ALTER TABLE "public"."print_requests" ADD CONSTRAINT "print_requests_expiry_ck" CHECK (expires_at > issued_at);
ALTER TABLE "public"."print_requests" ADD CONSTRAINT "print_requests_consumed_ck" CHECK ((job_id IS NULL) = (consumed_at IS NULL));
ALTER TABLE "public"."print_requests" ADD CONSTRAINT "print_requests_command_ck" CHECK ((command IS NOT NULL AND command_purged_at IS NULL AND jsonb_typeof(command) = 'object') OR (command IS NULL AND command_purged_at IS NOT NULL));
ALTER TABLE "public"."print_copies" ADD CONSTRAINT "print_copies_ordinal_ck" CHECK (ordinal > 0);
ALTER TABLE "public"."print_copies" ADD CONSTRAINT "print_copies_size_ck" CHECK (payload_size >= 0);
ALTER TABLE "public"."print_copies" ADD CONSTRAINT "print_copies_state_ck" CHECK (state IN ('REGISTERED','READY','SENDING','TRANSPORT_ACCEPTED','SPOOLER_ACCEPTED','PRE_SEND_FAILED','UNKNOWN','EXPIRED','CANCELLED','BROWSER_AVAILABLE'));
ALTER TABLE "public"."print_copies" ADD CONSTRAINT "print_copies_payload_ck" CHECK ((payload_cipher IS NOT NULL AND payload_key_ref IS NOT NULL AND payload_purged_at IS NULL) OR (payload_cipher IS NULL AND payload_key_ref IS NULL AND payload_purged_at IS NOT NULL));
ALTER TABLE "public"."print_copies" ADD CONSTRAINT "print_copies_expiry_ck" CHECK (payload_expires_at > created_at);
ALTER TABLE "public"."print_copies" ADD CONSTRAINT "print_copies_lease_ck" CHECK (lease_epoch >= 0 AND ((lease_owner IS NULL) = (lease_until IS NULL)));
ALTER TABLE "public"."print_copies" ADD CONSTRAINT "print_copies_substitute_ck" CHECK (retry_suppressed_by_job_id IS NULL OR retry_suppressed_by_job_id <> job_id);
ALTER TABLE "public"."print_attempts" ADD CONSTRAINT "print_attempts_number_ck" CHECK (number > 0 AND lease_epoch >= 0);
ALTER TABLE "public"."print_attempts" ADD CONSTRAINT "print_attempts_result_ck" CHECK (result IN ('STARTED','PRE_SEND_FAILED','UNKNOWN','TRANSPORT_ACCEPTED','SPOOLER_ACCEPTED','BROWSER_AVAILABLE'));
ALTER TABLE "public"."print_attempts" ADD CONSTRAINT "print_attempts_finish_ck" CHECK ((result = 'STARTED' AND finished_at IS NULL) OR result = 'UNKNOWN' OR (result NOT IN ('STARTED','UNKNOWN') AND finished_at IS NOT NULL));
ALTER TABLE "public"."print_events" ADD CONSTRAINT "print_events_scope_ck" CHECK ((scope_kind = 'DOCUMENT' AND document_id IS NOT NULL AND binding_version_id IS NULL AND delegation_id IS NULL) OR (scope_kind = 'BINDING' AND binding_version_id IS NOT NULL AND document_id IS NULL AND delegation_id IS NULL AND job_id IS NULL AND copy_id IS NULL AND attempt_id IS NULL AND destination_id IS NULL) OR (scope_kind = 'DELEGATION' AND delegation_id IS NOT NULL AND document_id IS NULL AND binding_version_id IS NULL AND job_id IS NULL AND copy_id IS NULL AND attempt_id IS NULL AND destination_id IS NULL));
ALTER TABLE "public"."print_events" ADD CONSTRAINT "print_events_chain_ck" CHECK ((job_id IS NULL OR document_id IS NOT NULL) AND (copy_id IS NULL OR job_id IS NOT NULL) AND (attempt_id IS NULL OR copy_id IS NOT NULL) AND (destination_id IS NULL OR attempt_id IS NOT NULL));
ALTER TABLE "public"."print_events" ADD CONSTRAINT "print_events_proof_ck" CHECK ((proof_kind = 'NONE' AND evidence_hash IS NULL AND evidence_key IS NULL) OR (proof_kind IN ('SYNTHETIC_NO_EFFECT','SYNTHETIC_EGRESS_CLOSED','SYNTHETIC_ATOMIC_QUEUE','SYNTHETIC_TRANSPORT_ACCEPTED','SYNTHETIC_SPOOLER_ACCEPTED','SYNTHETIC_BROWSER_AVAILABLE') AND attempt_id IS NOT NULL AND evidence_hash IS NOT NULL AND evidence_key IS NOT NULL AND actor_kind = 'SYNTHETIC_EXECUTOR'));
ALTER TABLE "public"."print_events" ADD CONSTRAINT "print_events_actor_ck" CHECK ((actor_kind = 'USER' AND actor_user_id IS NOT NULL) OR (actor_kind IN ('SYSTEM','SYNTHETIC_EXECUTOR') AND actor_user_id IS NULL));
ALTER TABLE "public"."print_events" ADD CONSTRAINT "print_events_type_ck" CHECK (event_type ~ '^[A-Z][A-Z0-9_]{0,79}$');
ALTER TABLE "public"."print_events" ADD CONSTRAINT "print_events_details_ck" CHECK ((details IS NULL OR jsonb_typeof(details) = 'object') AND (details_purged_at IS NULL OR details IS NULL));

CREATE UNIQUE INDEX "p004_binding_active_uq" ON "public"."print_bindings" ("store_id","terminal_id","family") WHERE state = 'ACTIVE';
CREATE UNIQUE INDEX "p004_job_initial_uq" ON "public"."print_jobs" ("document_id") WHERE kind = 'INITIAL';
CREATE UNIQUE INDEX "p004_job_test_uq" ON "public"."print_jobs" ("document_id") WHERE kind = 'TEST';
CREATE UNIQUE INDEX "p004_attempt_effect_uq" ON "public"."print_attempts" ("copy_id") WHERE result IN ('STARTED','UNKNOWN','TRANSPORT_ACCEPTED','SPOOLER_ACCEPTED','BROWSER_AVAILABLE');
CREATE INDEX "p004_copy_ready_idx" ON "public"."print_copies" ("store_id","created_at","id") WHERE state = 'READY' AND retry_suppressed_by_job_id IS NULL;

CREATE FUNCTION "public".p004_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $p004$
DECLARE allowed text[] := string_to_array(TG_ARGV[0], ',');
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' THEN RAISE EXCEPTION 'p004 schema mismatch'; END IF;
 IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
  RAISE EXCEPTION 'p004 immutable snapshot/identity: %', TG_TABLE_NAME;
 END IF;
 RETURN NEW;
END $p004$;

CREATE FUNCTION "public".p004_lifecycle() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $p004$
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
    SELECT 1 FROM "public"."print_events" WHERE attempt_id = a.id AND proof_kind = 'SYNTHETIC_NO_EFFECT') THEN
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
   SELECT 1 FROM "public"."print_events" WHERE attempt_id = NEW.id AND proof_kind =
    CASE NEW.result WHEN 'PRE_SEND_FAILED' THEN 'SYNTHETIC_NO_EFFECT'
     WHEN 'TRANSPORT_ACCEPTED' THEN 'SYNTHETIC_TRANSPORT_ACCEPTED'
     WHEN 'SPOOLER_ACCEPTED' THEN 'SYNTHETIC_SPOOLER_ACCEPTED'
     ELSE 'SYNTHETIC_BROWSER_AVAILABLE' END) THEN
   RAISE EXCEPTION 'p004 result requires correlated synthetic evidence';
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
     e.store_id IS DISTINCT FROM OLD.held_store_id OR OLD.serialization_mode <> 'SYNTHETIC' OR
     e.proof_kind NOT IN ('SYNTHETIC_NO_EFFECT','SYNTHETIC_EGRESS_CLOSED','SYNTHETIC_ATOMIC_QUEUE') THEN
    RAISE EXCEPTION 'p004 release proof missing; real adapter release not supported';
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

CREATE FUNCTION "public".p004_insert_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $p004$
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
     AND candidate_binding.state = 'ACTIVE' AND i.revoked_at IS NULL AND i.proof_mode = 'SYNTHETIC' AND q.serialization_mode = 'SYNTHETIC'
    )) THEN
   RAISE EXCEPTION 'p004 invalid attempt start';
  END IF;
 ELSIF TG_TABLE_NAME = 'print_events' AND NEW.proof_kind <> 'NONE' THEN
  IF NOT EXISTS (SELECT 1 FROM "public"."print_jobs" WHERE id = NEW.job_id AND execution_mode = 'SYNTHETIC_ONLY') OR
    NEW.destination_id IS DISTINCT FROM (SELECT destination_id FROM "public"."print_attempts" WHERE id = NEW.attempt_id) THEN
   RAISE EXCEPTION 'p004 proof must identify synthetic attempt/destination';
  END IF;
 END IF;
 RETURN NEW;
END $p004$;

CREATE FUNCTION "public".p004_commit_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $p004$
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
     AND proof_kind IN ('SYNTHETIC_NO_EFFECT','SYNTHETIC_EGRESS_CLOSED','SYNTHETIC_ATOMIC_QUEUE')
   ) THEN RAISE EXCEPTION 'p004 destination cannot forget potential egress';
   END IF;
  END IF;
 END LOOP;
 RETURN NULL;
END $p004$;

CREATE FUNCTION "public".p004_delete_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $p004$
BEGIN
 IF TG_TABLE_NAME = 'print_requests' THEN
  IF OLD.expires_at < clock_timestamp() THEN RETURN OLD; END IF;
 END IF;
 RAISE EXCEPTION 'p004 ledger deletion requires separate approved retirement/retention scope';
END $p004$;

CREATE TRIGGER "a_p004_immutable" BEFORE UPDATE ON "public"."print_installations" FOR EACH ROW EXECUTE FUNCTION "public".p004_immutable('revocation_epoch,revoked_at,revoked_by_id');
CREATE TRIGGER "b_p004_lifecycle" BEFORE UPDATE ON "public"."print_installations" FOR EACH ROW EXECUTE FUNCTION "public".p004_lifecycle();
CREATE TRIGGER "p004_delete" BEFORE DELETE ON "public"."print_installations" FOR EACH ROW EXECUTE FUNCTION "public".p004_delete_guard();
REVOKE ALL ON "public"."print_installations" FROM PUBLIC;

CREATE TRIGGER "a_p004_immutable" BEFORE UPDATE ON "public"."print_destinations" FOR EACH ROW EXECUTE FUNCTION "public".p004_immutable('gate_epoch,held_attempt_id,held_store_id,blocked_at,release_event_id');
CREATE TRIGGER "b_p004_lifecycle" BEFORE UPDATE ON "public"."print_destinations" FOR EACH ROW EXECUTE FUNCTION "public".p004_lifecycle();
CREATE TRIGGER "p004_delete" BEFORE DELETE ON "public"."print_destinations" FOR EACH ROW EXECUTE FUNCTION "public".p004_delete_guard();
REVOKE ALL ON "public"."print_destinations" FROM PUBLIC;

CREATE TRIGGER "a_p004_immutable" BEFORE UPDATE ON "public"."print_bindings" FOR EACH ROW EXECUTE FUNCTION "public".p004_immutable('state,revoked_at,revoked_by_id');
CREATE TRIGGER "b_p004_lifecycle" BEFORE UPDATE ON "public"."print_bindings" FOR EACH ROW EXECUTE FUNCTION "public".p004_lifecycle();
CREATE TRIGGER "p004_delete" BEFORE DELETE ON "public"."print_bindings" FOR EACH ROW EXECUTE FUNCTION "public".p004_delete_guard();
REVOKE ALL ON "public"."print_bindings" FROM PUBLIC;

CREATE TRIGGER "a_p004_immutable" BEFORE UPDATE ON "public"."print_delegations" FOR EACH ROW EXECUTE FUNCTION "public".p004_immutable('revoked_at,revocation_reason');
CREATE TRIGGER "b_p004_lifecycle" BEFORE UPDATE ON "public"."print_delegations" FOR EACH ROW EXECUTE FUNCTION "public".p004_lifecycle();
CREATE TRIGGER "p004_delete" BEFORE DELETE ON "public"."print_delegations" FOR EACH ROW EXECUTE FUNCTION "public".p004_delete_guard();
REVOKE ALL ON "public"."print_delegations" FROM PUBLIC;

CREATE TRIGGER "a_p004_immutable" BEFORE UPDATE ON "public"."print_documents" FOR EACH ROW EXECUTE FUNCTION "public".p004_immutable('initial_state,initial_intent_id,closed_by_intent_id,active_reprint_intent_id,active_reprint_until,risk_revision,retired_at');
CREATE TRIGGER "b_p004_lifecycle" BEFORE UPDATE ON "public"."print_documents" FOR EACH ROW EXECUTE FUNCTION "public".p004_lifecycle();
CREATE TRIGGER "p004_delete" BEFORE DELETE ON "public"."print_documents" FOR EACH ROW EXECUTE FUNCTION "public".p004_delete_guard();
REVOKE ALL ON "public"."print_documents" FROM PUBLIC;

CREATE TRIGGER "a_p004_immutable" BEFORE UPDATE ON "public"."print_jobs" FOR EACH ROW EXECUTE FUNCTION "public".p004_immutable('snapshot_cipher,snapshot_key_ref,snapshot_purged_at,confirmed_risk_revision,confirmed_exposure_hash,risk_confirmed_at');
CREATE TRIGGER "b_p004_lifecycle" BEFORE UPDATE ON "public"."print_jobs" FOR EACH ROW EXECUTE FUNCTION "public".p004_lifecycle();
CREATE TRIGGER "p004_delete" BEFORE DELETE ON "public"."print_jobs" FOR EACH ROW EXECUTE FUNCTION "public".p004_delete_guard();
CREATE TRIGGER "p004_insert" BEFORE INSERT ON "public"."print_jobs" FOR EACH ROW EXECUTE FUNCTION "public".p004_insert_guard();
REVOKE ALL ON "public"."print_jobs" FROM PUBLIC;

CREATE TRIGGER "a_p004_immutable" BEFORE UPDATE ON "public"."print_requests" FOR EACH ROW EXECUTE FUNCTION "public".p004_immutable('command,command_purged_at,revoked_at,job_id,consumed_at');
CREATE TRIGGER "b_p004_lifecycle" BEFORE UPDATE ON "public"."print_requests" FOR EACH ROW EXECUTE FUNCTION "public".p004_lifecycle();
CREATE TRIGGER "p004_delete" BEFORE DELETE ON "public"."print_requests" FOR EACH ROW EXECUTE FUNCTION "public".p004_delete_guard();
CREATE TRIGGER "p004_insert" BEFORE INSERT ON "public"."print_requests" FOR EACH ROW EXECUTE FUNCTION "public".p004_insert_guard();
REVOKE ALL ON "public"."print_requests" FROM PUBLIC;

CREATE TRIGGER "a_p004_immutable" BEFORE UPDATE ON "public"."print_copies" FOR EACH ROW EXECUTE FUNCTION "public".p004_immutable('state,payload_cipher,payload_key_ref,payload_purged_at,lease_owner,lease_until,lease_epoch,retry_suppressed_by_job_id');
CREATE TRIGGER "b_p004_lifecycle" BEFORE UPDATE ON "public"."print_copies" FOR EACH ROW EXECUTE FUNCTION "public".p004_lifecycle();
CREATE TRIGGER "p004_delete" BEFORE DELETE ON "public"."print_copies" FOR EACH ROW EXECUTE FUNCTION "public".p004_delete_guard();
CREATE TRIGGER "p004_insert" BEFORE INSERT ON "public"."print_copies" FOR EACH ROW EXECUTE FUNCTION "public".p004_insert_guard();
REVOKE ALL ON "public"."print_copies" FROM PUBLIC;

CREATE TRIGGER "a_p004_immutable" BEFORE UPDATE ON "public"."print_attempts" FOR EACH ROW EXECUTE FUNCTION "public".p004_immutable('result,external_ref,finished_at');
CREATE TRIGGER "b_p004_lifecycle" BEFORE UPDATE ON "public"."print_attempts" FOR EACH ROW EXECUTE FUNCTION "public".p004_lifecycle();
CREATE TRIGGER "p004_delete" BEFORE DELETE ON "public"."print_attempts" FOR EACH ROW EXECUTE FUNCTION "public".p004_delete_guard();
CREATE TRIGGER "p004_insert" BEFORE INSERT ON "public"."print_attempts" FOR EACH ROW EXECUTE FUNCTION "public".p004_insert_guard();
REVOKE ALL ON "public"."print_attempts" FROM PUBLIC;

CREATE TRIGGER "a_p004_immutable" BEFORE UPDATE ON "public"."print_events" FOR EACH ROW EXECUTE FUNCTION "public".p004_immutable('details,details_purged_at');
CREATE TRIGGER "b_p004_lifecycle" BEFORE UPDATE ON "public"."print_events" FOR EACH ROW EXECUTE FUNCTION "public".p004_lifecycle();
CREATE TRIGGER "p004_delete" BEFORE DELETE ON "public"."print_events" FOR EACH ROW EXECUTE FUNCTION "public".p004_delete_guard();
CREATE TRIGGER "p004_insert" BEFORE INSERT ON "public"."print_events" FOR EACH ROW EXECUTE FUNCTION "public".p004_insert_guard();
REVOKE ALL ON "public"."print_events" FROM PUBLIC;

CREATE FUNCTION "public".p004_bump_risk() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $p004$
DECLARE doc_key uuid;
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' THEN RAISE EXCEPTION 'p004 schema mismatch'; END IF;
 doc_key := NEW.document_id;
 UPDATE "public"."print_documents" SET risk_revision = risk_revision + 1 WHERE id = doc_key AND store_id = NEW.store_id;
 RETURN NULL;
END $p004$;
CREATE TRIGGER "p004_job_risk" AFTER INSERT ON "public"."print_jobs" FOR EACH ROW EXECUTE FUNCTION "public".p004_bump_risk();
CREATE TRIGGER "p004_copy_risk" AFTER UPDATE ON "public"."print_copies" FOR EACH ROW WHEN (OLD.state IS DISTINCT FROM NEW.state) EXECUTE FUNCTION "public".p004_bump_risk();
CREATE TRIGGER "p004_attempt_risk_insert" AFTER INSERT ON "public"."print_attempts" FOR EACH ROW EXECUTE FUNCTION "public".p004_bump_risk();
CREATE TRIGGER "p004_attempt_risk_update" AFTER UPDATE ON "public"."print_attempts" FOR EACH ROW WHEN (OLD.result IS DISTINCT FROM NEW.result) EXECUTE FUNCTION "public".p004_bump_risk();

CREATE TRIGGER "p004_insert_binding" BEFORE INSERT ON "public"."print_bindings" FOR EACH ROW EXECUTE FUNCTION "public".p004_insert_guard();
CREATE TRIGGER "p004_insert_destination" BEFORE INSERT ON "public"."print_destinations" FOR EACH ROW EXECUTE FUNCTION "public".p004_insert_guard();
CREATE TRIGGER "p004_insert_document" BEFORE INSERT ON "public"."print_documents" FOR EACH ROW EXECUTE FUNCTION "public".p004_insert_guard();
CREATE CONSTRAINT TRIGGER "p004_job_commit" AFTER INSERT OR UPDATE ON "public"."print_jobs" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "public".p004_commit_guard();
CREATE CONSTRAINT TRIGGER "p004_copy_commit" AFTER INSERT OR UPDATE ON "public"."print_copies" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "public".p004_commit_guard();
CREATE CONSTRAINT TRIGGER "p004_attempt_commit" AFTER INSERT OR UPDATE ON "public"."print_attempts" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "public".p004_commit_guard();
COMMIT;
