/**
 * Cria o usuário admin inicial no banco de dados.
 *
 * Uso: npx tsx scripts/seed-admin.ts
 *
 * Variáveis de ambiente necessárias:
 *   ADMIN_DEFAULT_PASSWORD — senha do admin (mínimo 6 caracteres)
 *   ADMIN_EMAIL            — email do admin (padrão: admin@rafacell.com.br)
 *
 * Pode ser rodado múltiplas vezes com segurança (upsert).
 */

import { PrismaClient } from "../generated/prisma"
import bcrypt from "bcryptjs"
import * as dotenv from "dotenv"
import { resolve } from "path"

dotenv.config({ path: resolve(__dirname, "../.env") })

const db = new PrismaClient()

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@rafacell.com.br"
  const password = process.env.ADMIN_DEFAULT_PASSWORD

  if (!password) {
    throw new Error("Defina ADMIN_DEFAULT_PASSWORD no .env antes de rodar o seed.")
  }
  if (password.length < 6) {
    throw new Error("ADMIN_DEFAULT_PASSWORD deve ter pelo menos 6 caracteres.")
  }

  const hash = await bcrypt.hash(password, 12)

  const user = await db.adminUser.upsert({
    where: { email },
    update: { password: hash, role: "SUPER_ADMIN" },
    create: {
      email,
      name: "Admin RAFACELL",
      password: hash,
      role: "SUPER_ADMIN",
      lojaId: "loja-1",
    },
  })

  console.log(`✓ Admin user pronto: ${user.email} (role: ${user.role})`)
}

main()
  .catch((err) => {
    console.error("✗ Erro no seed:", err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
