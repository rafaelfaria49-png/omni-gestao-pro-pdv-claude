-- G006 — privilégios mínimos de QA (somente clusters DESCARTÁVEIS da CI: scripts/ci/run-gestor-money-pg-suites.mjs).
-- Reconstruído do contrato do RUNBOOK G006 (§ "Papel SQL e confiança"). NÃO aplicar em banco externo: em um
-- alvo autorizado o DBA revisa e aplica com gate humano. Sem BYPASSRLS, sem ownership, sem membership,
-- sem DML financeiro/auth, sem DELETE/TRUNCATE, sem CREATE.
GRANT USAGE ON SCHEMA public TO omni_gastos_ingress, omni_gastos_worker, omni_gastos_operator;

-- ingress: lê canais/inbox, grava inbox; jobs STAGING via RLS; evento técnico do gatilho.
GRANT SELECT ON public.whatsapp_canais, public.whatsapp_gestao_inbox TO omni_gastos_ingress;
GRANT INSERT ON public.whatsapp_gestao_inbox TO omni_gastos_ingress;
GRANT SELECT, INSERT ON public.gastos_jobs TO omni_gastos_ingress;
GRANT INSERT ON public.gastos_job_eventos TO omni_gastos_ingress;

-- worker: canais/inbox (UPDATE de estado sob imutabilidade), origens, jobs, pulsos, eventos;
-- operações/outbox só por SELECT filtrado por RLS; os dois helpers estreitos.
GRANT SELECT ON public.whatsapp_canais TO omni_gastos_worker;
GRANT SELECT, UPDATE ON public.whatsapp_gestao_inbox TO omni_gastos_worker;
GRANT SELECT, INSERT ON public.gastos_origens_canal TO omni_gastos_worker;
GRANT SELECT, INSERT, UPDATE ON public.gastos_jobs, public.gastos_worker_pulsos TO omni_gastos_worker;
GRANT SELECT, INSERT ON public.gastos_job_eventos TO omni_gastos_worker;
GRANT SELECT ON public.financeiro_operacoes, public.gastos_outbox TO omni_gastos_worker;
GRANT EXECUTE ON FUNCTION public.g006_autorizar_escopo(text, text, text), public.g006_canal_vigente(text) TO omni_gastos_worker;

-- operator: canais; jobs com UPDATE de 9 colunas (sem lease); eventos; só identidade em inbox/origens.
GRANT SELECT, INSERT, UPDATE ON public.whatsapp_canais TO omni_gastos_operator;
GRANT SELECT ON public.gastos_jobs TO omni_gastos_operator;
GRANT UPDATE (estado, "envioEstado", "externalMessageId", "reconciliacaoRef",
  "falhaCodigo", "tentativasCiclo", "runAfter", "prazoEm", "updatedAt") ON public.gastos_jobs TO omni_gastos_operator;
GRANT SELECT, INSERT ON public.gastos_job_eventos TO omni_gastos_operator;
GRANT SELECT (id, "canalId") ON public.whatsapp_gestao_inbox TO omni_gastos_operator;
GRANT SELECT (id, "inboxId") ON public.gastos_origens_canal TO omni_gastos_operator;
