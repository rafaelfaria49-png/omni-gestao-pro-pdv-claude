export { GET } from "../../../clientes/importar/route"
import { importClientesJson } from "@/lib/import-clientes-json"
export async function POST(req: Request) { return importClientesJson(req) }
export async function PUT(req: Request) { return importClientesJson(req) }

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0
