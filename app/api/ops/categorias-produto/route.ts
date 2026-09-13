import { NextResponse } from "next/server"
import { withPrismaSafe } from "@/lib/prisma"
import { requireCadastrosHubApi } from "@/lib/cadastros/hub-api-gate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const gate = await requireCadastrosHubApi(req, "read", "shared")
  if (!gate.ok) return gate.response
  const lojaId = gate.storeId

  const rows = await withPrismaSafe(
    (db) =>
      db.categoriaProduto.findMany({
        where: { storeId: lojaId },
        orderBy: [{ nome: "asc" }],
        select: { slug: true, nome: true },
      }),
    []
  )

  return NextResponse.json({
    ok: true,
    items: rows,
  })
}
