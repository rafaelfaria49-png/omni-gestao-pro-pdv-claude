/**
 * Cria o usuário Supervisor inicial (PIN do PDV) no banco de dados.
 *
 * Uso: npx tsx scripts/seed-supervisor-pin.ts
 *
 * Variáveis de ambiente (opcionais):
 *   SUPERVISOR_DEFAULT_PIN  — PIN padrão (4–12 dígitos). Default: "1234".
 *   SUPERVISOR_DEFAULT_NAME — Nome exibido. Default: "Supervisor Padrão".
 *
 * Comportamento idempotente:
 *  - Se já existir QUALQUER usuário com role ADMIN/admin, o seed NÃO faz nada.
 *  - Se NÃO existir, cria um User { role: "ADMIN", pin: <SUPERVISOR_DEFAULT_PIN> }.
 *  - Nunca sobrescreve um PIN existente — alterações posteriores são feitas
 *    via Master Console (UI) ou diretamente no banco.
 *
 * IMPORTANTE: Após rodar este seed, o usuário DEVE trocar o PIN padrão no
 * Master Console (`/dashboard/master-console`). O aviso é exibido na UI
 * enquanto o PIN ativo for o padrão.
 */

import { PrismaClient } from "../generated/prisma"
import * as dotenv from "dotenv"
import { resolve } from "path"

dotenv.config({ path: resolve(__dirname, "../.env") })

const db = new PrismaClient()

const PIN_REGEX = /^\d{4,12}$/

async function main() {
  const pin = (process.env.SUPERVISOR_DEFAULT_PIN ?? "1234").trim()
  const name = (process.env.SUPERVISOR_DEFAULT_NAME ?? "Supervisor Padrão").trim()

  if (!PIN_REGEX.test(pin)) {
    throw new Error(
      "SUPERVISOR_DEFAULT_PIN deve ter entre 4 e 12 dígitos numéricos.",
    )
  }

  const existing = await db.user.findFirst({
    where: { OR: [{ role: "ADMIN" }, { role: "admin" }] },
    select: { id: true, name: true, role: true },
  })

  if (existing) {
    console.log(
      `✓ Já existe um usuário supervisor (id=${existing.id}, role=${existing.role}). Nada a fazer.`,
    )
    return
  }

  // Verifica colisão de PIN (campo @unique no schema)
  const pinTaken = await db.user.findFirst({ where: { pin }, select: { id: true } })
  if (pinTaken) {
    throw new Error(
      `O PIN solicitado já está em uso por outro usuário (id=${pinTaken.id}). Defina SUPERVISOR_DEFAULT_PIN diferente.`,
    )
  }

  const created = await db.user.create({
    data: {
      name,
      pin,
      role: "ADMIN",
    },
    select: { id: true, name: true, role: true },
  })

  console.log(
    `✓ Supervisor criado: ${created.name} (id=${created.id}, role=${created.role}).`,
  )
  console.log(
    "⚠ Lembre-se: troque o PIN padrão no Master Console (/dashboard/master-console).",
  )
}

main()
  .catch((err) => {
    console.error("✗ Erro no seed do supervisor:", err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
