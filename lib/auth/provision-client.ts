import "server-only"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { BASIC_MODULE_ACCESS, MODULES } from "./access-policy"
import { generateTemporaryPassword } from "./password-policy"

export const provisionClientSchema = z.object({
  storeName: z.string().trim().min(1).max(200), name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(254),
  branch: z.enum(["padaria", "assistencia", "acessorios", "moda", "variedades", "agropecuaria", "supermercado", "comercio"]),
  modules: z.array(z.enum(MODULES)).default(BASIC_MODULE_ACCESS.modules),
}).strict()

export async function provisionClient(input: z.infer<typeof provisionClientSchema>) {
  const temporaryPassword = generateTemporaryPassword()
  const hash = await bcrypt.hash(temporaryPassword, 12)
  const storeId = `cliente-${crypto.randomUUID()}`
  const result = await prisma.$transaction(async (tx) => {
    const store = await tx.store.create({ data: {
      id: storeId, name: input.storeName,
      profile: input.branch === "assistencia" ? "ASSISTENCIA" : input.branch === "supermercado" ? "SUPERMERCADO" : "VARIEDADES",
      moduleAccess: { version: 1, modules: [...new Set(input.modules)] },
      settings: { create: { printerConfig: { pdvMainLayout: "classic", capabilities: { version: 1, business: { primaryBranch: input.branch } } } } },
    }, select: { id: true, name: true } })
    const user = await tx.adminUser.create({ data: {
      name: input.name, email: input.email.toLowerCase(), password: hash, role: "ADMIN", accessScope: "STORE",
      lojaId: store.id, mustChangePassword: true, adminUserStores: { create: { storeId: store.id } },
    }, select: { id: true, email: true, role: true, accessScope: true, mustChangePassword: true } })
    return { store, user }
  })
  return { ...result, temporaryPassword }
}
