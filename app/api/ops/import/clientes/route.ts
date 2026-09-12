/** Model `Cliente` → tabela `public.cliente` (`@@map`). Delegate: `prisma.cliente`. */
import { NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { importClientesJson } from "@/lib/import-clientes-json"
import { requireAdmin } from "@/lib/require-admin"
import { requireCadastrosHubApi } from "@/lib/cadastros/hub-api-gate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function missingClientesTableResponse() {
  return NextResponse.json(
    {
      error:
        'Tabela "cliente" não existe no Postgres/Supabase. Verifique se a tabela foi criada e se o Prisma está apontando para o projeto certo.',
    },
    { status: 503 }
  )
}

function isMissingRelationError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021") return true
  const msg = e instanceof Error ? e.message : String(e)
  return /does not exist|não existe|relation.*does not exist/i.test(msg)
}

export async function GET(req: Request) {
  const gate = await requireCadastrosHubApi(req, "read", "shared")
  if (!gate.ok) return gate.response
  const storeId = gate.storeId

  try {
    const rows = await prisma.cliente.findMany({
      where: { storeId },
      orderBy: { updatedAt: "desc" },
    })
    const clientes = rows.map((r) => ({
      id: r.id,
      nome: r.name,
      cpf: "",
      telefone: r.phone ?? "",
      email: r.email ?? "",
      endereco: "",
      aparelhosRecorrentes: [] as string[],
      totalOS: 0,
      ultimaVisita: "",
    }))
    return NextResponse.json({ clientes })
  } catch (e) {
    if (isMissingRelationError(e)) return missingClientesTableResponse()
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[ops/import/clientes GET]", msg)
    const dev = process.env.NODE_ENV === "development"
    return NextResponse.json(
      { error: "Falha ao carregar clientes", ...(dev ? { detail: msg } : {}) },
      { status: 503 }
    )
  }
}

export async function PUT(req: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  return importClientesJson(req)
}

export async function POST(req: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  return importClientesJson(req)
}
