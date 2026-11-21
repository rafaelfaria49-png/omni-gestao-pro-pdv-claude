-- TEMPLATE ONLY. Provisioning needs separate environment approval; never executed by the job or build.
-- DBA creates omni_print_retention NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS,
-- with a random credential in the protected secret store. Do not grant membership in the application owner.
-- CONNECT on the intended database is granted separately. No commercial tables or keys are needed.
BEGIN;
GRANT USAGE ON SCHEMA public TO omni_print_retention;
GRANT SELECT ON public.print_documents, public.print_jobs, public.print_copies,
  public.print_requests, public.print_attempts, public.print_events, public.print_destinations TO omni_print_retention;
-- PostgreSQL row locking requires UPDATE on one column. id is immutable under the existing D02 trigger.
GRANT UPDATE(id) ON public.print_documents TO omni_print_retention;
GRANT UPDATE(snapshot_cipher,snapshot_key_ref,snapshot_purged_at) ON public.print_jobs TO omni_print_retention;
GRANT UPDATE(payload_cipher,payload_key_ref,payload_purged_at) ON public.print_copies TO omni_print_retention;
GRANT UPDATE(command,command_purged_at) ON public.print_requests TO omni_print_retention;
GRANT UPDATE(details,details_purged_at), INSERT ON public.print_events TO omni_print_retention;
COMMIT;
