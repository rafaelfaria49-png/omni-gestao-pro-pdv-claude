import "server-only"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma"
import { requireEnterpriseSession } from "@/lib/auth/guard-enterprise"
import { canAccessStore, getEnterprisePermissions } from "@/lib/auth/enterprise-permissions"

/**
 * Provisionamento e concessão/revogação de acesso ao perfil financeiro EMPRESA (PerfilMembro).
 *
 * Autoridade: sessão real (nunca ids do cliente como prova) + estado atual do banco — ADMIN/SUPER_ADMIN ativo,
 * sem troca de senha pendente, com a loja na sessão e vínculo AdminUserStore atual. Conceder/revogar exige ainda
 * ser membro ativo do perfil. Destinatário: ativo, vinculado à loja e com permissão financeira de leitura.
 * Toda mudança grava evento imutável em `financeiro_perfil_membros_eventos`, na MESMA transação, sob trava da loja.
 * PESSOAL não tem membros (o dono é o único acesso) e não passa por aqui.
 */
export class AcessoPerfilError extends Error {
  constructor(readonly code: string, readonly status = 403) {
    super("Não foi possível alterar o acesso ao perfil financeiro.")
    this.name = "AcessoPerfilError"
  }
}

const id = z.string().trim().min(1).max(191)
const motivo = z.string().trim().min(1).max(500).optional()
const provisionarSchema = z.object({ storeId: id, motivo }).strict()
const alterarSchema = z.object({ storeId: id, adminUserId: id, motivo }).strict()
type Tx = Prisma.TransactionClient

async function autoridade(storeId: string) {
  const base = await requireEnterpriseSession()
  if (!base.ok) throw new AcessoPerfilError(base.status === 401 ? "nao_autenticado" : "acesso_negado", base.status === 401 ? 401 : 403)
  if (!canAccessStore(base.session, storeId)) throw new AcessoPerfilError("acesso_negado")
  return base.session.user.id
}

/** Revalida o autor DENTRO da transação (estado atual, não o JWT). */
async function exigirAdministrador(tx: Tx, userId: string, storeId: string) {
  const user = await tx.adminUser.findUnique({ where: { id: userId }, select: { active: true, role: true, mustChangePassword: true } })
  if (!user?.active || user.mustChangePassword || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) throw new AcessoPerfilError("acesso_negado")
  const vinculo = await tx.adminUserStore.findUnique({ where: { adminUserId_storeId: { adminUserId: userId, storeId } }, select: { id: true } })
  if (!vinculo) throw new AcessoPerfilError("vinculo_loja_ausente")
}

async function travarLoja(tx: Tx, storeId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`gm-perfil-membros:${storeId}`}))::text AS lock`
}

async function perfilDaLoja(tx: Tx, storeId: string) {
  const perfil = await tx.financeiroPerfil.findUnique({ where: { storeId }, select: { id: true, ativo: true, tipo: true } })
  if (!perfil || perfil.tipo !== "EMPRESA") throw new AcessoPerfilError("perfil_inexistente", 404)
  if (!perfil.ativo) throw new AcessoPerfilError("perfil_inativo", 409)
  return perfil
}

async function exigirMembroAtivo(tx: Tx, perfilId: string, userId: string) {
  const m = await tx.perfilMembro.findUnique({ where: { perfilId_adminUserId: { perfilId, adminUserId: userId } }, select: { revogadoEm: true } })
  if (!m || m.revogadoEm) throw new AcessoPerfilError("acesso_negado")
}

/** Concede ou reativa; devolve a ação gravada (ou null quando já estava ativo — idempotente). */
async function garantirMembro(tx: Tx, perfilId: string, storeId: string, alvo: string, autor: string, mot?: string) {
  const atual = await tx.perfilMembro.findUnique({ where: { perfilId_adminUserId: { perfilId, adminUserId: alvo } } })
  if (atual && !atual.revogadoEm) return null
  if (atual) await tx.perfilMembro.update({ where: { id: atual.id }, data: { revogadoEm: null } })
  else await tx.perfilMembro.create({ data: { perfilId, storeId, adminUserId: alvo } })
  const acao = atual ? "REATIVADO" : "CONCEDIDO"
  await tx.perfilMembroEvento.create({ data: { perfilId, storeId, adminUserId: alvo, autorAdminUserId: autor, acao, motivo: mot } })
  return acao
}

/** Cria (se ausente) o perfil EMPRESA da loja e torna o administrador autor o primeiro membro. Idempotente. */
export async function provisionarPerfilEmpresa(input: unknown) {
  const parsed = provisionarSchema.safeParse(input)
  if (!parsed.success) throw new AcessoPerfilError("dados_invalidos", 422)
  const { storeId, motivo: mot } = parsed.data
  const autor = await autoridade(storeId)
  return prisma.$transaction(async (tx) => {
    await travarLoja(tx, storeId)
    await exigirAdministrador(tx, autor, storeId)
    if (!await tx.store.findUnique({ where: { id: storeId }, select: { id: true } })) throw new AcessoPerfilError("loja_inexistente", 404)
    let perfil = await tx.financeiroPerfil.findUnique({ where: { storeId }, select: { id: true, ativo: true, tipo: true } })
    let provisionado = false
    if (!perfil) {
      perfil = await tx.financeiroPerfil.create({ data: { tipo: "EMPRESA", storeId }, select: { id: true, ativo: true, tipo: true } })
      await tx.perfilMembroEvento.create({ data: { perfilId: perfil.id, storeId, adminUserId: autor, autorAdminUserId: autor, acao: "PROVISIONADO", motivo: mot } })
      provisionado = true
    } else if (!perfil.ativo || perfil.tipo !== "EMPRESA") throw new AcessoPerfilError("perfil_inativo", 409)
    else if (await tx.perfilMembro.count({ where: { perfilId: perfil.id, revogadoEm: null } }) > 0) {
      // Já há membros: o acesso passa a ser concedido por quem já é membro (não por qualquer ADMIN da loja).
      await exigirMembroAtivo(tx, perfil.id, autor)
    }
    const acao = await garantirMembro(tx, perfil.id, storeId, autor, autor, mot)
    return { perfilId: perfil.id, provisionado, acao }
  })
}

export async function concederAcessoPerfil(input: unknown) {
  const parsed = alterarSchema.safeParse(input)
  if (!parsed.success) throw new AcessoPerfilError("dados_invalidos", 422)
  const { storeId, adminUserId, motivo: mot } = parsed.data
  const autor = await autoridade(storeId)
  return prisma.$transaction(async (tx) => {
    await travarLoja(tx, storeId)
    await exigirAdministrador(tx, autor, storeId)
    const perfil = await perfilDaLoja(tx, storeId)
    await exigirMembroAtivo(tx, perfil.id, autor)
    const alvo = await tx.adminUser.findUnique({ where: { id: adminUserId }, select: { active: true, role: true } })
    if (!alvo?.active || !getEnterprisePermissions(alvo.role).financeiro.view) throw new AcessoPerfilError("destinatario_sem_permissao", 422)
    const vinculo = await tx.adminUserStore.findUnique({ where: { adminUserId_storeId: { adminUserId, storeId } }, select: { id: true } })
    if (!vinculo) throw new AcessoPerfilError("destinatario_sem_vinculo_loja", 422)
    const acao = await garantirMembro(tx, perfil.id, storeId, adminUserId, autor, mot)
    return { perfilId: perfil.id, adminUserId, acao }
  })
}

export async function revogarAcessoPerfil(input: unknown) {
  const parsed = alterarSchema.safeParse(input)
  if (!parsed.success) throw new AcessoPerfilError("dados_invalidos", 422)
  const { storeId, adminUserId, motivo: mot } = parsed.data
  const autor = await autoridade(storeId)
  return prisma.$transaction(async (tx) => {
    await travarLoja(tx, storeId)
    await exigirAdministrador(tx, autor, storeId)
    const perfil = await perfilDaLoja(tx, storeId)
    await exigirMembroAtivo(tx, perfil.id, autor)
    const atual = await tx.perfilMembro.findUnique({ where: { perfilId_adminUserId: { perfilId: perfil.id, adminUserId } } })
    if (!atual || atual.revogadoEm) return { perfilId: perfil.id, adminUserId, acao: null } // idempotente
    if (await tx.perfilMembro.count({ where: { perfilId: perfil.id, revogadoEm: null } }) <= 1) {
      throw new AcessoPerfilError("ultimo_membro", 409) // perfil sem nenhum membro ficaria inacessível
    }
    await tx.perfilMembro.update({ where: { id: atual.id }, data: { revogadoEm: new Date() } })
    await tx.perfilMembroEvento.create({ data: { perfilId: perfil.id, storeId, adminUserId, autorAdminUserId: autor, acao: "REVOGADO", motivo: mot } })
    return { perfilId: perfil.id, adminUserId, acao: "REVOGADO" as const }
  })
}

/** Membros e trilha de auditoria do perfil da loja — somente para membro ADMIN ativo. */
export async function listarAcessosPerfil(input: unknown) {
  const parsed = provisionarSchema.pick({ storeId: true }).strict().safeParse(input)
  if (!parsed.success) throw new AcessoPerfilError("dados_invalidos", 422)
  const { storeId } = parsed.data
  const autor = await autoridade(storeId)
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`
    await exigirAdministrador(tx, autor, storeId)
    const perfil = await perfilDaLoja(tx, storeId)
    await exigirMembroAtivo(tx, perfil.id, autor)
    const [membros, eventos] = await Promise.all([
      tx.perfilMembro.findMany({ where: { perfilId: perfil.id }, select: { adminUserId: true, revogadoEm: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
      tx.perfilMembroEvento.findMany({ where: { perfilId: perfil.id }, select: { adminUserId: true, autorAdminUserId: true, acao: true, motivo: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    ])
    return { perfilId: perfil.id, membros, eventos }
  }, { isolationLevel: "RepeatableRead" })
}
