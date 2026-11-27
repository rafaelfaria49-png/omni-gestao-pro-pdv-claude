import "server-only"
import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireEnterpriseSession } from "@/lib/auth/guard-enterprise"
import {
  canAccessStore,
  canUseModule,
  getEnterprisePermissions,
} from "@/lib/auth/enterprise-permissions"
import { requireFinanceiroPerfilAccess } from "@/lib/gastos/access"
import { gestorMoneyAtivo } from "@/lib/gastos/ativacao"
import { respostaFinanceiraPrivada } from "@/lib/gastos/read-scope"
import { declararDonoPessoalRls } from "@/lib/gastos/rls-contexto"
import type { FinanceiroAcao, FinanceiroContextoAutorizado } from "@/lib/gastos/types"
import type { PerfilResumo } from "@/lib/gestor-money/contracts"

const idSchema = z.string().trim().min(1).max(191)

/**
 * G001: Seletor de perfil estrito.
 * - PESSOAL jamais aceita storeId (sem loja fictícia).
 * - EMPRESA exige storeId real.
 */
export const seletorPerfilApiSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("PESSOAL"), perfilId: idSchema }).strict(),
  z.object({ tipo: z.literal("EMPRESA"), perfilId: idSchema, storeId: idSchema }).strict(),
])

export class GestorMoneyApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = "GestorMoneyApiError"
  }
}

export function respostaPrivadaJson(body: unknown, status = 200): NextResponse {
  return respostaFinanceiraPrivada(NextResponse.json(body, { status }))
}

export function exigirGestorMoneyHabilitado(): NextResponse | null {
  if (!gestorMoneyAtivo()) {
    return respostaPrivadaJson(
      {
        ok: false,
        code: "module_disabled",
        error: "Gestor Money desligado (GESTOR_MONEY_ENABLED !== 'true').",
      },
      404
    )
  }
  return null
}

/**
 * Emite contexto financeiro opaco exclusivamente no servidor via G001.
 * Nunca confia em ownerAdminUserId, userId ou contexto serializado do cliente.
 */
export async function requireGestorMoneyApiContext(
  seletorRaw: unknown,
  acao: FinanceiroAcao
): Promise<
  | { ok: true; contexto: FinanceiroContextoAutorizado }
  | { ok: false; response: NextResponse }
> {
  const disabled = exigirGestorMoneyHabilitado()
  if (disabled) return { ok: false, response: disabled }

  const parsed = seletorPerfilApiSchema.safeParse(seletorRaw)
  if (!parsed.success) {
    return {
      ok: false,
      response: respostaPrivadaJson(
        {
          ok: false,
          code: "seletor_perfil_invalido",
          error: "Seletor de perfil financeiro inválido (PESSOAL não aceita storeId; EMPRESA exige storeId).",
        },
        422
      ),
    }
  }

  const access = await requireFinanceiroPerfilAccess(parsed.data, acao)
  if (!access.ok) {
    return {
      ok: false,
      response: respostaPrivadaJson(
        {
          ok: false,
          code: access.status === 401 ? "nao_autenticado" : access.status === 403 ? "acesso_negado" : "erro_autorizacao",
          error: access.error,
        },
        access.status
      ),
    }
  }

  return { ok: true, contexto: access.contexto }
}

/**
 * Lista perfis financeiros efetivamente autorizados para a sessão atual no banco.
 * - PESSOAL: lido exclusivamente com RLS transacional (`declararDonoPessoalRls`), sem storeId.
 * - EMPRESA: exige vínculo `PerfilMembro` vigente + acesso à loja + módulo `finance`.
 */
export async function listarPerfisAutorizadosServidor(): Promise<
  | { ok: true; perfis: PerfilResumo[] }
  | { ok: false; response: NextResponse }
> {
  const disabled = exigirGestorMoneyHabilitado()
  if (disabled) return { ok: false, response: disabled }

  const base = await requireEnterpriseSession()
  if (!base.ok) {
    return {
      ok: false,
      response: respostaPrivadaJson(
        { ok: false, code: base.status === 401 ? "nao_autenticado" : "acesso_negado", error: base.error },
        base.status === 401 ? 401 : 403
      ),
    }
  }

  const userId = base.session.user.id
  const user = await prisma.adminUser.findUnique({
    where: { id: userId },
    select: { id: true, active: true, role: true, name: true },
  })
  if (!user?.active) {
    return {
      ok: false,
      response: respostaPrivadaJson({ ok: false, code: "acesso_negado", error: "Usuário inativo." }, 403),
    }
  }

  const perms = getEnterprisePermissions(user.role)
  if (!perms.financeiro.view) {
    return {
      ok: false,
      response: respostaPrivadaJson(
        { ok: false, code: "acesso_negado", error: "Sem permissão para acessar o módulo financeiro." },
        403
      ),
    }
  }

  // 1. Perfil PESSOAL: estritamente isolado via RLS transacional com dono = sessão atual
  const perfilPessoal = await prisma.$transaction(async (tx) => {
    await declararDonoPessoalRls(tx, userId)
    return tx.financeiroPerfil.findFirst({
      where: {
        tipo: "PESSOAL",
        ativo: true,
        ownerAdminUserId: userId,
        storeId: null,
      },
      select: { id: true, ownerAdminUserId: true, ativo: true },
    })
  })

  // 2. Perfis EMPRESA: exige grant financeiro ativo + acesso real à loja + módulo finance contratado
  const perfisEmpresaDb = await prisma.financeiroPerfil.findMany({
    where: {
      tipo: "EMPRESA",
      ativo: true,
      storeId: { not: null },
      membros: {
        some: {
          adminUserId: userId,
          revogadoEm: null,
        },
      },
    },
    select: {
      id: true,
      storeId: true,
      ativo: true,
      store: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  const perfis: PerfilResumo[] = []

  if (perfilPessoal && perfilPessoal.ownerAdminUserId === userId) {
    perfis.push({
      tipo: "PESSOAL",
      perfilId: perfilPessoal.id,
      ownerAdminUserId: userId,
      nomeExibicao: "Pessoal (Cofre Privado)",
      subtitulo: "Independente de loja · Sem storeId · G001",
      ativo: perfilPessoal.ativo,
    })
  }

  for (const emp of perfisEmpresaDb) {
    if (!emp.storeId) continue
    if (!canAccessStore(base.session, emp.storeId) || !canUseModule(base.session, "finance", emp.storeId)) {
      continue
    }
    const storeName = emp.store?.name?.trim() || emp.storeId
    perfis.push({
      tipo: "EMPRESA",
      perfilId: emp.id,
      storeId: emp.storeId,
      nomeExibicao: `Empresa · ${storeName}`,
      subtitulo: `Store ID: ${emp.storeId} · Escopo Empresarial G001`,
      ativo: emp.ativo,
    })
  }

  return { ok: true, perfis }
}
