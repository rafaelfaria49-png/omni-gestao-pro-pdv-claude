-- OMNI-GESTOR-MONEY-CARD-LIMITS-PRIVATE-STORAGE-001: limites de cartão e histórico auditável (G004, aditivo).
-- Nenhuma migration anterior é alterada; coluna limiteCentavos é nullable (NULL = limite não informado).
BEGIN;
-- Mesmo protocolo das G001–G006: nunca esperar trava por mais de 500 ms; em lock_timeout a migration
-- desiste inteira e atômica (nunca a venda) e é reaplicada (prisma migrate resolve --rolled-back).
SET LOCAL lock_timeout = '500ms';

-- AlterTable: cartoes_instrumentos
ALTER TABLE "cartoes_instrumentos"
    ADD COLUMN "limiteCentavos" DECIMAL(20,0),
    ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "cartoes_instrumentos" ADD CONSTRAINT "g004_cartao_limite_check" CHECK (
    "limiteCentavos" IS NULL OR ("limiteCentavos" >= 0 AND "limiteCentavos" <= 9000000000000)
);

-- CreateTable: cartoes_limites_eventos (histórico/auditoria imutável privada, com RLS)
CREATE TABLE "cartoes_limites_eventos" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "storeId" TEXT,
    "cartaoId" TEXT NOT NULL,
    "autorAdminUserId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "limiteAnteriorCentavos" DECIMAL(20,0),
    "limiteNovoCentavos" DECIMAL(20,0),
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cartoes_limites_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cartoes_limites_eventos_cartaoId_createdAt_idx" ON "cartoes_limites_eventos"("cartaoId", "createdAt");

-- CreateIndex
CREATE INDEX "cartoes_limites_eventos_perfilId_createdAt_idx" ON "cartoes_limites_eventos"("perfilId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "cartoes_limites_eventos_id_perfilId_key" ON "cartoes_limites_eventos"("id", "perfilId");

-- AddForeignKey
ALTER TABLE "cartoes_limites_eventos" ADD CONSTRAINT "cartoes_limites_eventos_perfilId_fkey"
    FOREIGN KEY ("perfilId") REFERENCES "financeiro_perfis"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cartoes_limites_eventos" ADD CONSTRAINT "cartoes_limites_eventos_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cartoes_limites_eventos" ADD CONSTRAINT "cartoes_limites_eventos_cartaoId_perfilId_fkey"
    FOREIGN KEY ("cartaoId", "perfilId") REFERENCES "cartoes_instrumentos"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cartoes_limites_eventos" ADD CONSTRAINT "cartoes_limites_eventos_autorAdminUserId_fkey"
    FOREIGN KEY ("autorAdminUserId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- CHECK de integridade dos eventos de limite
ALTER TABLE "cartoes_limites_eventos" ADD CONSTRAINT "g004_cartao_limite_evento_check" CHECK (
    "acao" IN ('CADASTRO', 'ALTERACAO', 'REMOCAO')
    AND ("limiteAnteriorCentavos" IS NULL OR ("limiteAnteriorCentavos" >= 0 AND "limiteAnteriorCentavos" <= 9000000000000))
    AND ("limiteNovoCentavos" IS NULL OR ("limiteNovoCentavos" >= 0 AND "limiteNovoCentavos" <= 9000000000000))
    AND ("limiteAnteriorCentavos" IS DISTINCT FROM "limiteNovoCentavos")
    AND (
        ("acao" = 'CADASTRO' AND "limiteAnteriorCentavos" IS NULL AND "limiteNovoCentavos" IS NOT NULL)
        OR ("acao" = 'ALTERACAO' AND "limiteNovoCentavos" IS NOT NULL)
        OR ("acao" = 'REMOCAO' AND "limiteAnteriorCentavos" IS NOT NULL AND "limiteNovoCentavos" IS NULL)
    )
    AND ("motivo" IS NULL OR length("motivo") BETWEEN 1 AND 500)
);

-- Escopo/autoria (mesma função canônica do G004: valida perfilId, storeId, autorAdminUserId e cartaoId)
CREATE TRIGGER g004_escopo BEFORE INSERT OR UPDATE ON "cartoes_limites_eventos"
    FOR EACH ROW EXECUTE FUNCTION g004_validar_escopo();

-- Imutabilidade absoluta: histórico de limite nunca é editado nem apagado
CREATE TRIGGER g004_imutavel BEFORE UPDATE OR DELETE ON "cartoes_limites_eventos"
    FOR EACH ROW EXECUTE FUNCTION g004_imutabilidade();

-- RLS na mesma transação do ENABLE (contrato runtime restrito)
ALTER TABLE "cartoes_limites_eventos" ENABLE ROW LEVEL SECURITY;
CREATE POLICY gm_runtime_escopo ON "cartoes_limites_eventos" FOR ALL
    USING (NOT gm_papel_g006() AND ("storeId" IS NOT NULL OR ("perfilId" IS NOT NULL AND "perfilId" = gm_perfil_pessoal_contexto())))
    WITH CHECK (NOT gm_papel_g006() AND ("storeId" IS NOT NULL OR ("perfilId" IS NOT NULL AND "perfilId" = gm_perfil_pessoal_contexto())));
REVOKE ALL ON "cartoes_limites_eventos" FROM PUBLIC;

COMMIT;
