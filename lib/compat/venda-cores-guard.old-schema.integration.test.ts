/**
 * COMPAT-PROFISSIONAL-001 — guard de cor numa TRANSAÇÃO PostgreSQL real com o schema ANTERIOR
 * (sem `compat_cores_loja`): a venda não pode ter a transação abortada pelo guard.
 *
 * Gateado por `COMPAT_OLD_SCHEMA_TEST_DATABASE_URL` (banco descartável local `compat_old_*`,
 * baseline = schema da main, sem a migration 20261113120000).
 */
import { describe, expect, it } from "vitest"
import { PrismaClient } from "@/generated/prisma"
import { corPadraoDesativadaNaVenda } from "./venda-cores-guard"

const URL_OLD = process.env.COMPAT_OLD_SCHEMA_TEST_DATABASE_URL ?? ""
if (URL_OLD && !/^postgresql:\/\/[^@]+@127\.0\.0\.1:\d+\/compat_old_[a-z0-9_]+$/.test(URL_OLD)) {
  throw new Error("COMPAT_OLD_SCHEMA_TEST_DATABASE_URL precisa ser um banco descartável local (compat_old_*).")
}

describe.skipIf(!URL_OLD)("guard de cor sem a tabela — transação real", () => {
  it("retorna sem restrição e a transação continua utilizável", async () => {
    const db = new PrismaClient({ datasourceUrl: URL_OLD })
    try {
      const existe = (await db.$queryRaw`SELECT to_regclass('public.compat_cores_loja') IS NOT NULL AS ok`) as { ok: boolean }[]
      expect(existe[0].ok).toBe(false)
      const resultado = await db.$transaction(async (tx) => {
        const cor = await corPadraoDesativadaNaVenda(
          tx as unknown as Parameters<typeof corPadraoDesativadaNaVenda>[0],
          "loja-qualquer",
          { lines: [{ accessorySelection: { version: 1, colorKey: "fume" } }] },
          new Date(),
        )
        // Próxima consulta na MESMA transação: falharia com "current transaction is aborted".
        const lojas = await tx.store.count()
        return { cor, lojas }
      })
      expect(resultado.cor).toBeNull()
      expect(typeof resultado.lojas).toBe("number")
    } finally {
      await db.$disconnect()
    }
  })
})
