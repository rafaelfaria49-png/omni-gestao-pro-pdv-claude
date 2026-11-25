-- G006 aditivo: nenhum fato financeiro G001-G005 alterado.
BEGIN;
-- CreateTable
CREATE TABLE "whatsapp_canais" (
    "canalId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "telefoneE164" TEXT NOT NULL,
    "papel" TEXT NOT NULL,
    "storeId" TEXT,
    "credencialRef" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "whatsapp_canais_pkey" PRIMARY KEY ("canalId")
);

-- CreateTable
CREATE TABLE "whatsapp_gestao_inbox" (
    "id" TEXT NOT NULL,
    "provedor" TEXT NOT NULL,
    "canalId" TEXT NOT NULL,
    "canalVersao" INTEGER NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "externalMessageId" TEXT NOT NULL,
    "remetenteE164" TEXT NOT NULL,
    "correlacaoId" TEXT NOT NULL,
    "respondidoA" TEXT,
    "mediaId" TEXT,
    "ocorridoEm" TIMESTAMPTZ(3) NOT NULL,
    "recebidoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "proveniencia" TEXT NOT NULL,
    "conteudo" JSONB NOT NULL,
    "conteudoHash" CHAR(64) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'RECEBIDO',

    CONSTRAINT "whatsapp_gestao_inbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos_origens_canal" (
    "id" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "storeId" TEXT,
    "autorAdminUserId" TEXT NOT NULL,
    "grupoChave" TEXT NOT NULL,
    "bindingRef" TEXT NOT NULL,
    "bindingVersao" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "gastos_origens_canal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos_jobs" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "inboxId" TEXT,
    "outboxId" TEXT,
    "origemId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PRONTO',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "tentativasCiclo" INTEGER NOT NULL DEFAULT 0,
    "limiteTentativas" INTEGER NOT NULL DEFAULT 5,
    "runAfter" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "prazoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT (clock_timestamp() + '24 hours'::interval),
    "leaseOwner" TEXT,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMPTZ(3),
    "envioEstado" TEXT NOT NULL DEFAULT 'NAO_INICIADO',
    "externalMessageId" TEXT,
    "resultado" JSONB,
    "falhaCodigo" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "gastos_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos_job_eventos" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "atorSql" TEXT NOT NULL DEFAULT CURRENT_USER,
    "tentativa" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "gastos_job_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos_worker_pulsos" (
    "id" TEXT NOT NULL,
    "versao" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "ultimoPulso" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "iniciadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "gastos_worker_pulsos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_canais_phoneNumberId_key" ON "whatsapp_canais"("phoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_canais_telefoneE164_key" ON "whatsapp_canais"("telefoneE164");

-- CreateIndex
CREATE INDEX "whatsapp_gestao_inbox_canalId_recebidoEm_idx" ON "whatsapp_gestao_inbox"("canalId", "recebidoEm");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_gestao_inbox_provedor_phoneNumberId_externalMessag_key" ON "whatsapp_gestao_inbox"("provedor", "phoneNumberId", "externalMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "gastos_origens_canal_perfilId_grupoChave_key" ON "gastos_origens_canal"("perfilId", "grupoChave");

-- CreateIndex
CREATE UNIQUE INDEX "gastos_jobs_chave_key" ON "gastos_jobs"("chave");

-- CreateIndex
CREATE UNIQUE INDEX "gastos_jobs_inboxId_key" ON "gastos_jobs"("inboxId");

-- CreateIndex
CREATE UNIQUE INDEX "gastos_jobs_outboxId_key" ON "gastos_jobs"("outboxId");

-- CreateIndex
CREATE INDEX "gastos_jobs_estado_runAfter_createdAt_id_idx" ON "gastos_jobs"("estado", "runAfter", "createdAt", "id");

-- CreateIndex
CREATE INDEX "gastos_jobs_estado_leaseUntil_idx" ON "gastos_jobs"("estado", "leaseUntil");

-- CreateIndex
CREATE INDEX "gastos_job_eventos_jobId_createdAt_idx" ON "gastos_job_eventos"("jobId", "createdAt");

-- AddForeignKey
ALTER TABLE "whatsapp_canais" ADD CONSTRAINT "whatsapp_canais_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_gestao_inbox" ADD CONSTRAINT "whatsapp_gestao_inbox_canalId_fkey" FOREIGN KEY ("canalId") REFERENCES "whatsapp_canais"("canalId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gastos_origens_canal" ADD CONSTRAINT "gastos_origens_canal_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "whatsapp_gestao_inbox"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gastos_origens_canal" ADD CONSTRAINT "gastos_origens_canal_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "financeiro_perfis"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gastos_origens_canal" ADD CONSTRAINT "gastos_origens_canal_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gastos_origens_canal" ADD CONSTRAINT "gastos_origens_canal_autorAdminUserId_fkey" FOREIGN KEY ("autorAdminUserId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gastos_jobs" ADD CONSTRAINT "gastos_jobs_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "whatsapp_gestao_inbox"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gastos_jobs" ADD CONSTRAINT "gastos_jobs_outboxId_fkey" FOREIGN KEY ("outboxId") REFERENCES "gastos_outbox"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gastos_jobs" ADD CONSTRAINT "gastos_jobs_origemId_fkey" FOREIGN KEY ("origemId") REFERENCES "gastos_origens_canal"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gastos_job_eventos" ADD CONSTRAINT "gastos_job_eventos_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "gastos_jobs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE gastos_jobs ADD COLUMN "reconciliacaoRef" text;
ALTER TABLE gastos_job_eventos ADD COLUMN "evidenciaRef" text;

ALTER TABLE whatsapp_canais ADD CONSTRAINT g006_canal_check CHECK (
  "phoneNumberId" ~ '^[0-9]{1,64}$' AND "wabaId" ~ '^[0-9]{1,64}$' AND "appId" ~ '^[0-9]{1,64}$'
  AND "telefoneE164" ~ '^\+[1-9][0-9]{7,14}$' AND "credencialRef" ~ '^WHATSAPP_CANAL_TOKEN_[A-Z0-9_]{1,100}$'
  AND versao > 0 AND ((papel='GESTAO' AND "storeId" IS NULL) OR (papel='ATENDIMENTO' AND "storeId" IS NOT NULL)));
ALTER TABLE whatsapp_gestao_inbox ADD CONSTRAINT g006_inbox_check CHECK (
  provedor='META' AND length("externalMessageId") BETWEEN 1 AND 260 AND "canalVersao">0
  AND "remetenteE164" ~ '^\+[1-9][0-9]{7,14}$' AND "conteudoHash" ~ '^[a-f0-9]{64}$'
  AND length("correlacaoId") BETWEEN 1 AND 260 AND proveniencia='INGRESSO_TECNICO_G006'
  AND jsonb_typeof(conteudo)='object' AND octet_length(conteudo::text)<=65536
  AND estado IN ('RECEBIDO','AGUARDANDO_VINCULO'));
ALTER TABLE gastos_origens_canal ADD CONSTRAINT g006_origem_check CHECK (
  length("grupoChave") BETWEEN 1 AND 260 AND length("bindingRef") BETWEEN 1 AND 260 AND "bindingVersao">0);
ALTER TABLE gastos_jobs ADD CONSTRAINT g006_job_check CHECK (
  ((tipo='STAGING' AND "inboxId" IS NOT NULL AND "outboxId" IS NULL AND "origemId" IS NULL AND chave='inbox:'||"inboxId")
    OR (tipo='ENVIAR_RESULTADO' AND "inboxId" IS NULL AND "outboxId" IS NOT NULL AND "origemId" IS NOT NULL AND chave='outbox:'||"outboxId"))
  AND estado IN ('PRONTO','PROCESSANDO','RETENTAVEL','CONCLUIDO','ESTACIONADO','ENVIO_INCERTO')
  AND "envioEstado" IN ('NAO_INICIADO','INICIADO','REJEITADO','ACEITO','ENTREGUE','ENVIO_INCERTO')
  AND tentativas>=0 AND "tentativasCiclo">=0 AND "tentativasCiclo"<=tentativas AND "limiteTentativas" BETWEEN 1 AND 20
  AND ((estado='PROCESSANDO' AND "leaseOwner" IS NOT NULL AND "leaseToken" IS NOT NULL AND "leaseUntil" IS NOT NULL)
    OR (estado<>'PROCESSANDO' AND "leaseOwner" IS NULL AND "leaseToken" IS NULL AND "leaseUntil" IS NULL))
  AND (tipo='ENVIAR_RESULTADO' OR ("envioEstado"='NAO_INICIADO' AND "externalMessageId" IS NULL))
  AND ("envioEstado" NOT IN ('ACEITO','ENTREGUE') OR (estado='CONCLUIDO' AND "externalMessageId" IS NOT NULL))
  AND ((estado='ENVIO_INCERTO')=("envioEstado"='ENVIO_INCERTO'))
  AND ("envioEstado"<>'INICIADO' OR estado='PROCESSANDO')
  AND (resultado IS NULL OR (jsonb_typeof(resultado)='object' AND resultado-ARRAY['codigo','operacaoId','outboxId','prova']='{}'::jsonb)));
ALTER TABLE gastos_job_eventos ADD CONSTRAINT g006_evento_check CHECK (
  tipo IN ('PRONTO','PROCESSANDO','RETENTAVEL','CONCLUIDO','ESTACIONADO','ENVIO_INCERTO')
  AND codigo ~ '^[A-Z0-9_]{1,64}$' AND tentativa>=0);
ALTER TABLE gastos_worker_pulsos ADD CONSTRAINT g006_pulso_check CHECK (
  estado IN ('ATIVO','PARADO') AND length(id) BETWEEN 1 AND 191 AND versao='g006-1');

-- Serializa os dois registros do mesmo número, inclusive em conexões diferentes.
-- A tabela legada continua a autoridade de ATENDIMENTO enquanto não houver cutover G007.
CREATE FUNCTION g006_canal_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE digitos text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('g006-canal:'||NEW."phoneNumberId"));
  IF TG_TABLE_NAME='whatsapp_canais' THEN
    digitos:=substring(NEW."telefoneE164" FROM 2);
    PERFORM pg_advisory_xact_lock(hashtext('g006-e164:'||digitos));
    IF EXISTS(SELECT 1 FROM public.whatsapp_phone_numbers l WHERE (l."phoneNumberId"=NEW."phoneNumberId"
      OR regexp_replace(l."displayPhone",'[^0-9]','','g')=digitos)
      AND (NEW.papel<>'ATENDIMENTO' OR NEW."phoneNumberId"<>l."phoneNumberId" OR NEW."storeId" IS DISTINCT FROM l."storeId"
      OR (l."wabaId"<>'' AND NEW."wabaId"<>l."wabaId"))) THEN
      RAISE EXCEPTION 'G006 canal conflitante' USING ERRCODE='23514';
    END IF;
    IF TG_OP='INSERT' AND (NEW.ativo OR NEW.versao<>1) THEN
      RAISE EXCEPTION 'G006 registro inicia inativo' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' AND (to_jsonb(OLD)-ARRAY['ativo','versao','credencialRef']
      IS DISTINCT FROM to_jsonb(NEW)-ARRAY['ativo','versao','credencialRef'] OR NEW.versao<>OLD.versao+1) THEN
      RAISE EXCEPTION 'G006 identidade de canal imutavel' USING ERRCODE='23514';
    END IF;
  ELSE
    digitos:=regexp_replace(NEW."displayPhone",'[^0-9]','','g');
    IF digitos<>'' THEN PERFORM pg_advisory_xact_lock(hashtext('g006-e164:'||digitos)); END IF;
    IF EXISTS(SELECT 1 FROM public.whatsapp_canais c WHERE (c."phoneNumberId"=NEW."phoneNumberId" OR c."telefoneE164"='+'||digitos)
      AND (c.papel<>'ATENDIMENTO' OR c."phoneNumberId"<>NEW."phoneNumberId" OR c."storeId" IS DISTINCT FROM NEW."storeId"
      OR (NEW."wabaId"<>'' AND c."wabaId"<>NEW."wabaId"))) THEN
      RAISE EXCEPTION 'G006 canal conflitante' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
-- SECURITY DEFINER estritamente para ler os dois mapas privados no guard de colisão.
-- Sem SQL dinâmico, sem parâmetros de relação e sem devolver dados de linhas.
ALTER FUNCTION g006_canal_guard() SECURITY DEFINER;
REVOKE ALL ON FUNCTION g006_canal_guard() FROM PUBLIC;
CREATE TRIGGER g006_canal BEFORE INSERT OR UPDATE ON whatsapp_canais FOR EACH ROW EXECUTE FUNCTION g006_canal_guard();
CREATE TRIGGER g006_canal BEFORE INSERT OR UPDATE ON whatsapp_phone_numbers FOR EACH ROW EXECUTE FUNCTION g006_canal_guard();

CREATE FUNCTION g006_identidade_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE c record; p record; i record;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'G006 historico preservado' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='gastos_origens_canal' THEN
    IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'G006 origem imutavel' USING ERRCODE='23514'; END IF;
    SELECT * INTO i FROM public.whatsapp_gestao_inbox WHERE id=NEW."inboxId";
    SELECT * INTO p FROM public.financeiro_perfis WHERE id=NEW."perfilId";
    IF i.id IS NULL OR p.id IS NULL OR NOT p.ativo OR p."storeId" IS DISTINCT FROM NEW."storeId"
      OR (p.tipo='PESSOAL' AND p."ownerAdminUserId" IS DISTINCT FROM NEW."autorAdminUserId") THEN
      RAISE EXCEPTION 'G006 origem invalida' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='whatsapp_gestao_inbox' THEN
    IF TG_OP='UPDATE' THEN
      IF to_jsonb(OLD)-'estado' IS DISTINCT FROM to_jsonb(NEW)-'estado' THEN
        RAISE EXCEPTION 'G006 ingresso imutavel' USING ERRCODE='23514';
      END IF;
    ELSE
      SELECT * INTO c FROM public.whatsapp_canais WHERE "canalId"=NEW."canalId" FOR SHARE;
      IF NOT FOUND OR NOT c.ativo OR c.papel<>'GESTAO' OR c.versao<>NEW."canalVersao" OR c."phoneNumberId"<>NEW."phoneNumberId" THEN
        RAISE EXCEPTION 'G006 ingresso sem canal' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME='gastos_jobs' THEN
    IF TG_OP='UPDATE' THEN
      IF to_jsonb(OLD)-ARRAY['estado','tentativas','tentativasCiclo','runAfter','prazoEm','leaseOwner','leaseToken','leaseUntil','envioEstado','externalMessageId','reconciliacaoRef','resultado','falhaCodigo','updatedAt']
        IS DISTINCT FROM to_jsonb(NEW)-ARRAY['estado','tentativas','tentativasCiclo','runAfter','prazoEm','leaseOwner','leaseToken','leaseUntil','envioEstado','externalMessageId','reconciliacaoRef','resultado','falhaCodigo','updatedAt']
        OR NEW.tentativas<OLD.tentativas THEN RAISE EXCEPTION 'G006 job imutavel' USING ERRCODE='23514'; END IF;
      IF OLD."externalMessageId" IS NOT NULL AND OLD."externalMessageId" IS DISTINCT FROM NEW."externalMessageId" THEN
        RAISE EXCEPTION 'G006 identidade externa imutavel' USING ERRCODE='23514';
      END IF;
      IF (NEW."tentativasCiclo"<OLD."tentativasCiclo" OR NEW."prazoEm">OLD."prazoEm")
        AND NOT (OLD.estado='ESTACIONADO' AND NEW.estado='PRONTO' AND session_user='omni_gastos_operator') THEN
        RAISE EXCEPTION 'G006 orcamento exige reprocessamento autorizado' USING ERRCODE='23514';
      END IF;
      IF OLD.estado<>NEW.estado AND NOT (
        (OLD.estado IN ('PRONTO','RETENTAVEL') AND NEW.estado IN ('PROCESSANDO','ESTACIONADO'))
        OR (OLD.estado='PROCESSANDO' AND NEW.estado IN ('CONCLUIDO','RETENTAVEL','ESTACIONADO','ENVIO_INCERTO'))
        OR (OLD.estado='ESTACIONADO' AND NEW.estado='PRONTO' AND session_user='omni_gastos_operator'
          AND OLD."envioEstado" IN ('NAO_INICIADO','REJEITADO') AND NEW."envioEstado"=OLD."envioEstado")
        OR (OLD.estado='ENVIO_INCERTO' AND session_user='omni_gastos_operator'
          AND NULLIF(NEW."reconciliacaoRef",'') IS NOT NULL AND NEW."reconciliacaoRef" IS DISTINCT FROM OLD."reconciliacaoRef"
          AND ((NEW.estado='ESTACIONADO' AND NEW."envioEstado"='REJEITADO')
            OR (NEW.estado='CONCLUIDO' AND NEW."envioEstado" IN ('ACEITO','ENTREGUE'))))
      ) THEN RAISE EXCEPTION 'G006 transicao de job negada' USING ERRCODE='23514'; END IF;
      IF OLD."envioEstado"<>NEW."envioEstado" AND NOT (
        (OLD."envioEstado" IN ('NAO_INICIADO','REJEITADO') AND NEW."envioEstado"='INICIADO' AND NEW.estado='PROCESSANDO')
        OR (OLD."envioEstado"='INICIADO' AND NEW."envioEstado" IN ('REJEITADO','ACEITO','ENVIO_INCERTO'))
        OR (OLD."envioEstado"='ENVIO_INCERTO' AND NEW."envioEstado" IN ('REJEITADO','ACEITO','ENTREGUE')
          AND session_user='omni_gastos_operator' AND NULLIF(NEW."reconciliacaoRef",'') IS NOT NULL
          AND NEW."reconciliacaoRef" IS DISTINCT FROM OLD."reconciliacaoRef")
        OR (OLD."envioEstado"='ACEITO' AND NEW."envioEstado"='ENTREGUE' AND session_user='omni_gastos_operator'
          AND NULLIF(NEW."reconciliacaoRef",'') IS NOT NULL AND NEW."reconciliacaoRef" IS DISTINCT FROM OLD."reconciliacaoRef")
      ) THEN RAISE EXCEPTION 'G006 regressao de envio negada' USING ERRCODE='23514'; END IF;
    ELSIF NEW.estado<>'PRONTO' OR NEW."envioEstado"<>'NAO_INICIADO' OR NEW.tentativas<>0 THEN
      RAISE EXCEPTION 'G006 job deve iniciar pronto' USING ERRCODE='23514';
    ELSIF NEW.tipo='ENVIAR_RESULTADO' AND NOT EXISTS (
      SELECT 1 FROM public.gastos_outbox o JOIN public.financeiro_operacoes op ON op.id=o."operacaoId"
      JOIN public.gastos_origens_canal r ON r.id=NEW."origemId" AND r."perfilId"=op."perfilId"
        AND r."storeId" IS NOT DISTINCT FROM op."storeId" AND r."grupoChave"=op."grupoChave" AND r."autorAdminUserId"=op."autorAdminUserId"
        AND r."createdAt"<=op."createdAt" AT TIME ZONE 'UTC'
      WHERE o.id=NEW."outboxId" AND op.estado='APLICADA' AND op.resultado=o.payload AND op."concluidaEm" IS NOT NULL) THEN
      RAISE EXCEPTION 'G006 resultado sem commit financeiro' USING ERRCODE='23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'G006 auditoria imutavel' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION g006_identidade_guard() FROM PUBLIC;
ALTER FUNCTION g006_identidade_guard() SECURITY DEFINER;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['whatsapp_gestao_inbox','gastos_origens_canal','gastos_jobs'] LOOP
    EXECUTE format('CREATE TRIGGER g006_identidade BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.g006_identidade_guard()',t);
  END LOOP;
END $$;
CREATE TRIGGER g006_evento_imutavel BEFORE UPDATE OR DELETE ON gastos_job_eventos FOR EACH ROW EXECUTE FUNCTION g006_identidade_guard();

CREATE FUNCTION g006_auditar_job() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='INSERT' OR OLD.estado IS DISTINCT FROM NEW.estado OR OLD."envioEstado" IS DISTINCT FROM NEW."envioEstado"
    OR OLD.tentativas IS DISTINCT FROM NEW.tentativas OR OLD."falhaCodigo" IS DISTINCT FROM NEW."falhaCodigo"
    OR OLD."runAfter" IS DISTINCT FROM NEW."runAfter" OR OLD."prazoEm" IS DISTINCT FROM NEW."prazoEm"
    OR OLD."tentativasCiclo" IS DISTINCT FROM NEW."tentativasCiclo" THEN
    INSERT INTO public.gastos_job_eventos(id,"jobId",tipo,codigo,"atorSql",tentativa)
    VALUES(gen_random_uuid()::text,NEW.id,NEW.estado,COALESCE(NEW."falhaCodigo",NEW."envioEstado"),current_user,NEW.tentativas);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION g006_auditar_job() FROM PUBLIC;
CREATE TRIGGER g006_auditoria AFTER INSERT OR UPDATE ON gastos_jobs FOR EACH ROW EXECUTE FUNCTION g006_auditar_job();

-- Helpers estreitos para locks de leitura: o worker não ganha UPDATE em auth/finanças.
-- Proprietário de migration separado; search_path fixo; sem SQL dinâmico.
CREATE FUNCTION g006_autorizar_escopo(u_id text,p_id text,s_id text) RETURNS TABLE(autorizado boolean,papel text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u record; p record; m record;
BEGIN
  SELECT active,role INTO u FROM public.admin_users WHERE id=u_id FOR SHARE;
  SELECT tipo,ativo,"storeId","ownerAdminUserId" INTO p FROM public.financeiro_perfis WHERE id=p_id FOR SHARE;
  IF u.active IS DISTINCT FROM true OR p.ativo IS DISTINCT FROM true OR p."storeId" IS DISTINCT FROM s_id THEN
    RETURN QUERY SELECT false,NULL::text; RETURN;
  END IF;
  IF p.tipo='PESSOAL' THEN
    IF p."ownerAdminUserId" IS DISTINCT FROM u_id OR s_id IS NOT NULL THEN RETURN QUERY SELECT false,NULL::text; RETURN; END IF;
  ELSE
    SELECT mm.id INTO m FROM public.financeiro_perfil_membros mm
      JOIN public.admin_user_stores ss ON ss."adminUserId"=mm."adminUserId" AND ss."storeId"=mm."storeId"
      WHERE mm."perfilId"=p_id AND mm."storeId"=s_id AND mm."adminUserId"=u_id AND mm."revogadoEm" IS NULL FOR SHARE OF mm,ss;
    IF NOT FOUND THEN RETURN QUERY SELECT false,NULL::text; RETURN; END IF;
  END IF;
  RETURN QUERY SELECT true,u.role::text;
END $$;
REVOKE ALL ON FUNCTION g006_autorizar_escopo(text,text,text) FROM PUBLIC;
CREATE FUNCTION g006_canal_vigente(i_id text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i record; c record;
BEGIN
  SELECT * INTO i FROM public.whatsapp_gestao_inbox WHERE id=i_id;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO c FROM public.whatsapp_canais WHERE "canalId"=i."canalId" FOR SHARE;
  RETURN FOUND AND c.ativo AND c.papel='GESTAO' AND c.versao=i."canalVersao" AND c."phoneNumberId"=i."phoneNumberId";
END $$;
REVOKE ALL ON FUNCTION g006_canal_vigente(text) FROM PUBLIC;

-- Roles LOGIN e GRANTs são gate de implantação separado, descrito no runbook.
-- Nenhum role é criado nem credencial presumida por esta migration.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['whatsapp_canais','whatsapp_gestao_inbox','gastos_origens_canal','gastos_jobs','gastos_job_eventos','gastos_worker_pulsos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
  END LOOP;
END $$;
CREATE POLICY g006_canal_read ON whatsapp_canais FOR SELECT USING (current_user IN ('omni_gastos_ingress','omni_gastos_worker','omni_gastos_operator'));
CREATE POLICY g006_canal_operator ON whatsapp_canais FOR ALL USING (current_user='omni_gastos_operator') WITH CHECK (current_user='omni_gastos_operator');
CREATE POLICY g006_inbox_read ON whatsapp_gestao_inbox FOR SELECT USING (current_user IN ('omni_gastos_ingress','omni_gastos_worker'));
CREATE POLICY g006_inbox_operator_metadata ON whatsapp_gestao_inbox FOR SELECT USING (current_user='omni_gastos_operator');
CREATE POLICY g006_inbox_insert ON whatsapp_gestao_inbox FOR INSERT WITH CHECK (current_user='omni_gastos_ingress');
CREATE POLICY g006_inbox_update ON whatsapp_gestao_inbox FOR UPDATE USING (current_user='omni_gastos_worker') WITH CHECK (current_user='omni_gastos_worker');
CREATE POLICY g006_origem_read ON gastos_origens_canal FOR SELECT USING (current_user='omni_gastos_worker');
CREATE POLICY g006_origem_operator_metadata ON gastos_origens_canal FOR SELECT USING (current_user='omni_gastos_operator');
CREATE POLICY g006_origem_insert ON gastos_origens_canal FOR INSERT WITH CHECK (current_user='omni_gastos_worker');
CREATE POLICY g006_job_read ON gastos_jobs FOR SELECT USING (current_user IN ('omni_gastos_worker','omni_gastos_operator') OR (current_user='omni_gastos_ingress' AND tipo='STAGING'));
CREATE POLICY g006_job_insert ON gastos_jobs FOR INSERT WITH CHECK (current_user='omni_gastos_worker' OR (current_user='omni_gastos_ingress' AND tipo='STAGING'));
CREATE POLICY g006_job_update ON gastos_jobs FOR UPDATE USING (current_user IN ('omni_gastos_worker','omni_gastos_operator')) WITH CHECK (current_user IN ('omni_gastos_worker','omni_gastos_operator'));
CREATE POLICY g006_evento_read ON gastos_job_eventos FOR SELECT USING (current_user IN ('omni_gastos_worker','omni_gastos_operator'));
CREATE POLICY g006_evento_insert ON gastos_job_eventos FOR INSERT WITH CHECK (current_user IN ('omni_gastos_ingress','omni_gastos_worker','omni_gastos_operator') AND "atorSql"=current_user);
CREATE POLICY g006_pulso ON gastos_worker_pulsos FOR ALL USING (current_user='omni_gastos_worker') WITH CHECK (current_user='omni_gastos_worker');

-- Metadados de autorização e resultados: SELECT técnico, sem escrita financeira.
CREATE POLICY g006_worker_operacao ON financeiro_operacoes FOR SELECT USING (current_user='omni_gastos_worker' AND EXISTS(
  SELECT 1 FROM gastos_origens_canal r WHERE r."perfilId"=financeiro_operacoes."perfilId" AND r."grupoChave"=financeiro_operacoes."grupoChave"
    AND r."autorAdminUserId"=financeiro_operacoes."autorAdminUserId"));
CREATE POLICY g006_worker_outbox ON gastos_outbox FOR SELECT USING (current_user='omni_gastos_worker' AND EXISTS(
  SELECT 1 FROM financeiro_operacoes op WHERE op.id=gastos_outbox."operacaoId"));

COMMIT;
