import { auth } from "@/auth"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { ASSISTEC_ACTIVE_STORE_COOKIE } from "@/lib/store-defaults"
import { exigirModulo, hojeCivil, PessoasError } from "./domain"

export const CAPACIDADES = [
  "viewCadastro", "editCadastro", "viewRemuneracao", "editContrato", "viewDocumento", "manageAccess",
] as const
export type Capacidade = (typeof CAPACIDADES)[number]

export type AtorPessoas = Readonly<{ userId: string; storeId: string; role: string }>
export type EscopoPessoas = AtorPessoas & Readonly<{
  empregadorId: string
  capacidades: readonly string[]
}>

export async function exigirAtor(): Promise<AtorPessoas> {
  exigirModulo()
  const sessao = await auth()
  const userId = sessao?.user?.id
  if (!userId) throw new PessoasError("NAO_AUTENTICADO", 401)
  const storeId = (await cookies()).get(ASSISTEC_ACTIVE_STORE_COOKIE)?.value?.trim()
  if (!storeId || !/^[A-Za-z0-9_-]{1,100}$/.test(storeId)) throw new PessoasError("LOJA_AUSENTE", 403)
  const [usuario, membership, loja] = await Promise.all([
    prisma.adminUser.findUnique({ where: { id: userId }, select: { active: true, role: true, lojaId: true } }),
    prisma.adminUserStore.findUnique({ where: { adminUserId_storeId: { adminUserId: userId, storeId } }, select: { id: true } }),
    prisma.store.findUnique({ where: { id: storeId }, select: { id: true } }),
  ])
  if (!usuario?.active || !loja || (usuario.lojaId !== storeId && !membership)) {
    throw new PessoasError("ESCOPO_NEGADO", 403)
  }
  return Object.freeze({ userId, storeId, role: String(usuario.role) })
}

export async function exigirBootstrap(): Promise<AtorPessoas> {
  const ator = await exigirAtor()
  if (ator.role !== "ADMIN" && ator.role !== "SUPER_ADMIN") {
    throw new PessoasError("BOOTSTRAP_NEGADO", 403)
  }
  return ator
}

export async function exigirEscopo(empregadorId: string, capacidade: Capacidade): Promise<EscopoPessoas> {
  exigirModulo()
  if (typeof empregadorId !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(empregadorId)) throw new PessoasError("ESCOPO_NEGADO", 403)
  const ator = await exigirAtor()
  const hoje = hojeCivil()
  const [unidade, acesso, empregador] = await Promise.all([
    prisma.dpUnidadeVinculo.findFirst({
      where: { empregadorId, storeId: ator.storeId, validFrom: { lte: hoje }, OR: [{ validTo: null }, { validTo: { gt: hoje } }] },
      select: { id: true },
    }),
    prisma.dpAcesso.findFirst({
      where: { empregadorId, storeId: ator.storeId, adminUserId: ator.userId, revogadoEm: null },
      select: { capacidades: true },
    }),
    prisma.dpEmpregador.findUnique({ where: { id: empregadorId }, select: { status: true } }),
  ])
  if (!unidade || !acesso || empregador?.status !== "ATIVO" || !acesso.capacidades.includes(capacidade)) {
    throw new PessoasError("ESCOPO_NEGADO", 403)
  }
  return Object.freeze({ ...ator, empregadorId, capacidades: acesso.capacidades })
}

export async function listarEscopos(capacidade: Capacidade): Promise<EscopoPessoas[]> {
  const ator = await exigirAtor()
  const hoje = hojeCivil()
  const acessos = await prisma.dpAcesso.findMany({
    where: {
      storeId: ator.storeId,
      adminUserId: ator.userId,
      revogadoEm: null,
      capacidades: { has: capacidade },
      empregador: { status: "ATIVO" },
    },
    select: { empregadorId: true, capacidades: true },
  })
  const unidades = await prisma.dpUnidadeVinculo.findMany({
    where: {
      storeId: ator.storeId,
      empregadorId: { in: acessos.map((a) => a.empregadorId) },
      validFrom: { lte: hoje },
      OR: [{ validTo: null }, { validTo: { gt: hoje } }],
    },
    select: { empregadorId: true },
  })
  const autorizados = new Set(unidades.map((u) => u.empregadorId))
  return acessos.filter((a) => autorizados.has(a.empregadorId)).map((a) =>
    Object.freeze({ ...ator, empregadorId: a.empregadorId, capacidades: a.capacidades }),
  )
}
