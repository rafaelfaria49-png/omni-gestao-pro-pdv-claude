-- Gestor Money · assistente conversacional — G007 (vínculo telefone↔usuário) + G008 (conversa persistente).
-- ADITIVA: cria somente tabelas gm_assist_*; nenhuma tabela G001–G006, financeira, de auth ou do WhatsApp
-- comercial é alterada. Aplicar DEPOIS da G006 (20261126140000) e da transferência (20261127100000).
-- Por que não reutilizar o staging G006: whatsapp_gestao_inbox e gastos_origens_canal são imutáveis por
-- gatilho, a inbox só admite estado RECEBIDO/AGUARDANDO_VINCULO e gastos_jobs só STAGING/ENVIAR_RESULTADO.
-- Não há onde guardar rascunho versionado, confirmação, cache idempotente de resposta nem respostas que não
-- sejam resultado financeiro. A fila (gastos_jobs) e a outbox de resultado (gastos_outbox) G006 SÃO reutilizadas.
BEGIN;
SET LOCAL lock_timeout = '500ms';
-- CreateTable
CREATE TABLE "gm_assist_desafios" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "telefoneE164" TEXT NOT NULL,
    "codigoSalt" TEXT NOT NULL,
    "codigoHash" CHAR(64) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "limiteTentativas" INTEGER NOT NULL DEFAULT 5,
    "pendenteUsuario" TEXT,
    "consentimentoVersao" TEXT NOT NULL,
    "expiraEm" TIMESTAMPTZ(3) NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "decididoEm" TIMESTAMPTZ(3),

    CONSTRAINT "gm_assist_desafios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gm_assist_vinculos" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "telefoneE164" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ATIVO',
    "versao" INTEGER NOT NULL DEFAULT 1,
    "ativoTelefone" TEXT,
    "ativoUsuario" TEXT,
    "desafioId" TEXT NOT NULL,
    "consentimentoVersao" TEXT NOT NULL,
    "consentidoEm" TIMESTAMPTZ(3) NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "revogadoEm" TIMESTAMPTZ(3),
    "revogacaoMotivo" TEXT,

    CONSTRAINT "gm_assist_vinculos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gm_assist_eventos" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "adminUserId" TEXT,
    "vinculoId" TEXT,
    "desafioId" TEXT,
    "telefoneMascarado" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "gm_assist_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gm_assist_conversas" (
    "chave" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "vinculoId" TEXT NOT NULL,
    "versaoEstado" INTEGER NOT NULL,
    "estado" JSONB NOT NULL,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "gm_assist_conversas_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "gm_assist_mensagens" (
    "id" TEXT NOT NULL,
    "conversaChave" TEXT NOT NULL,
    "mensagemId" TEXT NOT NULL,
    "resposta" JSONB NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "gm_assist_mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gm_assist_respostas" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "canalId" TEXT NOT NULL,
    "destinatarioE164" TEXT NOT NULL,
    "vinculoId" TEXT,
    "respostaId" TEXT,
    "ordem" INTEGER NOT NULL,
    "texto" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMPTZ(3),
    "externalMessageId" TEXT,
    "falhaCodigo" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "gm_assist_respostas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gm_assist_desafios_pendenteUsuario_key" ON "gm_assist_desafios"("pendenteUsuario");

-- CreateIndex
CREATE INDEX "gm_assist_desafios_telefoneE164_estado_idx" ON "gm_assist_desafios"("telefoneE164", "estado");

-- CreateIndex
CREATE INDEX "gm_assist_desafios_adminUserId_criadoEm_idx" ON "gm_assist_desafios"("adminUserId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "gm_assist_vinculos_ativoTelefone_key" ON "gm_assist_vinculos"("ativoTelefone");

-- CreateIndex
CREATE UNIQUE INDEX "gm_assist_vinculos_ativoUsuario_key" ON "gm_assist_vinculos"("ativoUsuario");

-- CreateIndex
CREATE UNIQUE INDEX "gm_assist_vinculos_desafioId_key" ON "gm_assist_vinculos"("desafioId");

-- CreateIndex
CREATE INDEX "gm_assist_vinculos_adminUserId_idx" ON "gm_assist_vinculos"("adminUserId");

-- CreateIndex
CREATE INDEX "gm_assist_eventos_adminUserId_criadoEm_idx" ON "gm_assist_eventos"("adminUserId", "criadoEm");

-- CreateIndex
CREATE INDEX "gm_assist_eventos_tipo_criadoEm_idx" ON "gm_assist_eventos"("tipo", "criadoEm");

-- CreateIndex
CREATE INDEX "gm_assist_conversas_vinculoId_idx" ON "gm_assist_conversas"("vinculoId");

-- CreateIndex
CREATE UNIQUE INDEX "gm_assist_mensagens_conversaChave_mensagemId_key" ON "gm_assist_mensagens"("conversaChave", "mensagemId");

-- CreateIndex
CREATE UNIQUE INDEX "gm_assist_respostas_chave_key" ON "gm_assist_respostas"("chave");

-- CreateIndex
CREATE UNIQUE INDEX "gm_assist_respostas_externalMessageId_key" ON "gm_assist_respostas"("externalMessageId");

-- CreateIndex
CREATE INDEX "gm_assist_respostas_estado_runAfter_idx" ON "gm_assist_respostas"("estado", "runAfter");

-- CreateIndex
CREATE INDEX "gm_assist_respostas_respostaId_idx" ON "gm_assist_respostas"("respostaId");

-- AddForeignKey
ALTER TABLE "gm_assist_vinculos" ADD CONSTRAINT "gm_assist_vinculos_desafioId_fkey" FOREIGN KEY ("desafioId") REFERENCES "gm_assist_desafios"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gm_assist_conversas" ADD CONSTRAINT "gm_assist_conversas_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "gm_assist_vinculos"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gm_assist_mensagens" ADD CONSTRAINT "gm_assist_mensagens_conversaChave_fkey" FOREIGN KEY ("conversaChave") REFERENCES "gm_assist_conversas"("chave") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ─── Invariantes ───────────────────────────────────────────────────────────
ALTER TABLE gm_assist_desafios ADD CONSTRAINT gm_assist_desafio_check CHECK (
  "telefoneE164" ~ '^\+[1-9][0-9]{7,14}$' AND "codigoHash" ~ '^[a-f0-9]{64}$' AND "codigoSalt" ~ '^[a-f0-9]{32}$'
  AND estado IN ('PENDENTE','CONFIRMADO','EXPIRADO','BLOQUEADO','CANCELADO')
  AND "limiteTentativas" BETWEEN 1 AND 10 AND tentativas BETWEEN 0 AND "limiteTentativas"
  AND ((estado='PENDENTE') = ("pendenteUsuario" IS NOT NULL)) AND ("pendenteUsuario" IS NULL OR "pendenteUsuario"="adminUserId")
  AND ((estado='PENDENTE') = ("decididoEm" IS NULL))
  AND "expiraEm" > "criadoEm" AND "expiraEm" <= "criadoEm" + interval '15 minutes'
  AND length("consentimentoVersao") BETWEEN 1 AND 64);
ALTER TABLE gm_assist_vinculos ADD CONSTRAINT gm_assist_vinculo_check CHECK (
  "telefoneE164" ~ '^\+[1-9][0-9]{7,14}$' AND versao > 0 AND estado IN ('ATIVO','REVOGADO')
  AND length("consentimentoVersao") BETWEEN 1 AND 64
  AND ((estado='ATIVO' AND "ativoTelefone"="telefoneE164" AND "ativoUsuario"="adminUserId" AND "revogadoEm" IS NULL AND "revogacaoMotivo" IS NULL)
    OR (estado='REVOGADO' AND "ativoTelefone" IS NULL AND "ativoUsuario" IS NULL AND "revogadoEm" IS NOT NULL
      AND "revogacaoMotivo" IN ('USUARIO','SEGURANCA','NOVO_PAREAMENTO','CONTA_INATIVA'))));
ALTER TABLE gm_assist_eventos ADD CONSTRAINT gm_assist_evento_check CHECK (
  tipo ~ '^[A-Z_]{1,64}$' AND ("telefoneMascarado" IS NULL OR "telefoneMascarado" ~ '^\+\*{4,11}[0-9]{4}$'));
ALTER TABLE gm_assist_conversas ADD CONSTRAINT gm_assist_conversa_check CHECK (
  "versaoEstado" >= 0 AND chave = "adminUserId" || '::' || "vinculoId"
  AND jsonb_typeof(estado)='object' AND octet_length(estado::text) <= 65536);
ALTER TABLE gm_assist_mensagens ADD CONSTRAINT gm_assist_mensagem_check CHECK (
  length("mensagemId") BETWEEN 1 AND 260 AND jsonb_typeof(resposta)='object' AND octet_length(resposta::text) <= 32768);
ALTER TABLE gm_assist_respostas ADD CONSTRAINT gm_assist_resposta_check CHECK (
  "destinatarioE164" ~ '^\+[1-9][0-9]{7,14}$' AND ordem BETWEEN 0 AND 20 AND tentativas >= 0
  AND estado IN ('PENDENTE','ENVIANDO','ENVIADA','FALHA','INCERTA')
  AND ((estado='ENVIANDO') = ("leaseToken" IS NOT NULL AND "leaseUntil" IS NOT NULL))
  AND (estado<>'ENVIADA' OR "externalMessageId" IS NOT NULL)
  AND (texto IS NOT NULL OR estado IN ('ENVIADA','FALHA'))
  AND (texto IS NULL OR length(texto) BETWEEN 1 AND 4096)
  AND ("falhaCodigo" IS NULL OR "falhaCodigo" ~ '^[A-Z0-9_]{1,64}$'));

-- ─── Imutabilidade, transições e identidade ────────────────────────────────
CREATE FUNCTION gm_assist_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE d record; v record;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'GM_ASSIST historico preservado' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME IN ('gm_assist_eventos','gm_assist_mensagens') THEN
    IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'GM_ASSIST registro imutavel' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME='gm_assist_desafios' THEN
    IF TG_OP='INSERT' THEN
      IF NEW.estado<>'PENDENTE' OR NEW.tentativas<>0 OR NOT EXISTS(SELECT 1 FROM public.admin_users u
        WHERE u.id=NEW."adminUserId" AND u.active AND NOT u."mustChangePassword") THEN
        RAISE EXCEPTION 'GM_ASSIST desafio invalido' USING ERRCODE='23514';
      END IF;
    ELSE
      IF to_jsonb(OLD)-ARRAY['estado','tentativas','pendenteUsuario','decididoEm'] IS DISTINCT FROM
         to_jsonb(NEW)-ARRAY['estado','tentativas','pendenteUsuario','decididoEm']
        OR NEW.tentativas<OLD.tentativas OR (OLD.estado<>'PENDENTE' AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW)) THEN
        RAISE EXCEPTION 'GM_ASSIST desafio imutavel' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME='gm_assist_vinculos' THEN
    IF TG_OP='INSERT' THEN
      SELECT * INTO d FROM public.gm_assist_desafios WHERE id=NEW."desafioId" FOR SHARE;
      IF NOT FOUND OR d.estado<>'CONFIRMADO' OR d."adminUserId"<>NEW."adminUserId" OR d."telefoneE164"<>NEW."telefoneE164"
        OR d."consentimentoVersao"<>NEW."consentimentoVersao" OR NEW.estado<>'ATIVO' OR NEW.versao<>1
        OR NOT EXISTS(SELECT 1 FROM public.admin_users u WHERE u.id=NEW."adminUserId" AND u.active) THEN
        RAISE EXCEPTION 'GM_ASSIST vinculo sem desafio confirmado' USING ERRCODE='23514';
      END IF;
    ELSIF to_jsonb(OLD)-ARRAY['estado','versao','ativoTelefone','ativoUsuario','revogadoEm','revogacaoMotivo'] IS DISTINCT FROM
          to_jsonb(NEW)-ARRAY['estado','versao','ativoTelefone','ativoUsuario','revogadoEm','revogacaoMotivo']
      OR NOT (OLD.estado='ATIVO' AND NEW.estado='REVOGADO' AND NEW.versao=OLD.versao+1) THEN
      RAISE EXCEPTION 'GM_ASSIST vinculo so pode ser revogado' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='gm_assist_conversas' THEN
    SELECT * INTO v FROM public.gm_assist_vinculos WHERE id=NEW."vinculoId" FOR SHARE;
    -- Revogação congela a conversa: nenhum rascunho avança depois dela.
    IF NOT FOUND OR v.estado<>'ATIVO' OR v."adminUserId"<>NEW."adminUserId" THEN
      RAISE EXCEPTION 'GM_ASSIST conversa sem vinculo ativo' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' AND (OLD.chave<>NEW.chave OR OLD."vinculoId"<>NEW."vinculoId" OR OLD."adminUserId"<>NEW."adminUserId"
      OR NEW."versaoEstado"<>OLD."versaoEstado"+1) THEN
      RAISE EXCEPTION 'GM_ASSIST conversa fora de ordem' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='gm_assist_respostas' THEN
    IF TG_OP='INSERT' THEN
      IF NEW.estado<>'PENDENTE' OR NEW.tentativas<>0 OR NEW."externalMessageId" IS NOT NULL THEN
        RAISE EXCEPTION 'GM_ASSIST resposta deve iniciar pendente' USING ERRCODE='23514';
      END IF;
    ELSE
      IF to_jsonb(OLD)-ARRAY['estado','tentativas','runAfter','leaseToken','leaseUntil','externalMessageId','falhaCodigo','texto','atualizadoEm']
         IS DISTINCT FROM to_jsonb(NEW)-ARRAY['estado','tentativas','runAfter','leaseToken','leaseUntil','externalMessageId','falhaCodigo','texto','atualizadoEm']
        OR NEW.tentativas<OLD.tentativas
        OR (NEW.texto IS DISTINCT FROM OLD.texto AND NEW.texto IS NOT NULL)
        OR (OLD."externalMessageId" IS NOT NULL AND NEW."externalMessageId" IS DISTINCT FROM OLD."externalMessageId") THEN
        RAISE EXCEPTION 'GM_ASSIST resposta imutavel' USING ERRCODE='23514';
      END IF;
      IF OLD.estado<>NEW.estado AND NOT (
        (OLD.estado='PENDENTE' AND NEW.estado IN ('ENVIANDO','FALHA'))
        OR (OLD.estado='ENVIANDO' AND NEW.estado IN ('ENVIADA','PENDENTE','FALHA','INCERTA'))
        OR (OLD.estado='INCERTA' AND NEW.estado IN ('ENVIADA','FALHA'))) THEN
        RAISE EXCEPTION 'GM_ASSIST transicao de resposta negada' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION gm_assist_guard() FROM PUBLIC;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['gm_assist_desafios','gm_assist_vinculos','gm_assist_eventos','gm_assist_conversas','gm_assist_mensagens','gm_assist_respostas'] LOOP
    EXECUTE format('CREATE TRIGGER gm_assist_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.gm_assist_guard()',t);
    -- Só o runtime da aplicação (DML concedido no gate de implantação). Os papéis G006 NÃO recebem acesso:
    -- validarPapelWorker recusa worker com SELECT fora da sua allowlist.
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
  END LOOP;
END $$;

COMMIT;
