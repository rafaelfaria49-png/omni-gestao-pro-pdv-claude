import { requireModuleApi } from "@/lib/auth/module-access"
export { GET } from "../../../clientes/importar/route"
import { importClientesJson } from "@/lib/import-clientes-json"
export async function POST(req: Request) {
  const moduleDenied = await requireModuleApi(req, "platform")
  if (moduleDenied) return moduleDenied
 return importClientesJson(req) }
export async function PUT(req: Request) {
  const moduleDenied = await requireModuleApi(req, "platform")
  if (moduleDenied) return moduleDenied
 return importClientesJson(req) }

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
