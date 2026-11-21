"use server"

/**
 * OMNI-VESTUARIO-P02 — Server Actions do catálogo de grade (Cadastros HUB).
 * Autoridade: sessão + loja autorizada (`requireCadastrosActionAccess`, perfil hub) + módulo `catalog`
 * + flag privada da loja (`vestuarioFeatureFlags`). O `storeId` recebido só seleciona a loja; é provado
 * contra a sessão antes de qualquer leitura/escrita. Falhas são DEVOLVIDAS (Server Action em produção
 * mascara erros lançados). Nada aqui vende, movimenta estoque ou gera código de barras.
 */
import { prisma } from "@/lib/prisma"
import { requireModuleAction } from "@/lib/auth/module-access"
import { requireCadastrosActionAccess } from "@/lib/cadastros/cadastros-action-access"
import { cadastrosAuditPrincipalFromSession } from "@/lib/cadastros/cadastros-audit-principal"
import { vestuarioFeatureFlags } from "@/lib/vestuario/feature-flags.server"
import * as svc from "@/lib/vestuario/catalog-service"
import type { CatalogContext, CatalogFailure, CatalogResult } from "@/lib/vestuario/catalog-service"

type Gate = { ok: true; ctx: CatalogContext } | CatalogFailure

const DISABLED: CatalogFailure = {
  ok: false, code: "UNTRUSTED", message: "Cadastro de grades não está habilitado para esta loja.",
}

async function gate(storeId: unknown): Promise<Gate> {
  const sid = typeof storeId === "string" ? storeId.trim() : ""
  if (!sid) return { ok: false, code: "UNTRUSTED", message: "Selecione a loja." }
  // Flag primeiro (só ambiente, sem I/O): catálogo desligado não consulta sessão, assinatura nem banco.
  // Não vaza nada: a resposta "desligado" é a mesma que um chamador sem sessão receberia.
  if (!vestuarioFeatureFlags(sid).enabled.catalog) return DISABLED
  try {
    await requireModuleAction(sid, "catalog")
    const access = await requireCadastrosActionAccess(sid, "hub")
    if (!vestuarioFeatureFlags(access.storeId).enabled.catalog) return DISABLED
    return { ok: true, ctx: { storeId: access.storeId, principal: cadastrosAuditPrincipalFromSession(access.session) } }
  } catch (e) {
    return { ok: false, code: "UNTRUSTED", message: e instanceof Error ? e.message : "Sem permissão para esta unidade." }
  }
}

async function guarded<T>(storeId: unknown, fn: (ctx: CatalogContext) => Promise<CatalogResult<T>>): Promise<CatalogResult<T>> {
  const g = await gate(storeId)
  if (!g.ok) return g
  try {
    return await fn(g.ctx)
  } catch (e) {
    console.error("[vestuario-catalogo]", e instanceof Error ? e.message.slice(0, 300) : "erro")
    return { ok: false, code: "CONFLICT", message: "Não foi possível salvar agora. Nada foi alterado; tente de novo." }
  }
}

/** Só diz se a tela deve existir para a loja (sem dados, sem query ao banco). */
export async function getVestuarioCatalogoStatus(storeId: string): Promise<{ enabled: boolean }> {
  const g = await gate(storeId)
  return { enabled: g.ok }
}

export async function listVestuarioCatalogo(storeId: string) {
  return guarded(storeId, async (ctx) => ({ ok: true as const, value: await svc.listCatalogo(prisma, ctx.storeId) }))
}
export async function listVestuarioProdutosGrade(storeId: string, opts: { cursor?: string | null; q?: string } = {}) {
  return guarded(storeId, async (ctx) => ({ ok: true as const, value: await svc.listProdutosGrade(prisma, ctx.storeId, { cursor: opts?.cursor ?? null, q: opts?.q ?? "" }) }))
}
export async function getVestuarioProdutoGrade(storeId: string, produtoId: string) {
  return guarded(storeId, async (ctx) => {
    const p = typeof produtoId === "string" && produtoId ? await svc.getProdutoGrade(prisma, ctx.storeId, produtoId) : null
    return p ? { ok: true as const, value: p } : { ok: false as const, code: "NOT_FOUND" as const, message: "Produto com grade não encontrado nesta loja." }
  })
}

export async function createVestuarioGrade(storeId: string, input: unknown) { return guarded(storeId, (ctx) => svc.createGrade(prisma, ctx, input)) }
export async function updateVestuarioGrade(storeId: string, input: unknown) { return guarded(storeId, (ctx) => svc.updateGrade(prisma, ctx, input)) }
export async function addVestuarioTamanho(storeId: string, input: unknown) { return guarded(storeId, (ctx) => svc.addTamanho(prisma, ctx, input)) }
export async function updateVestuarioTamanho(storeId: string, input: unknown) { return guarded(storeId, (ctx) => svc.updateTamanho(prisma, ctx, input)) }
export async function reorderVestuarioTamanhos(storeId: string, input: unknown) { return guarded(storeId, (ctx) => svc.reorderTamanhos(prisma, ctx, input)) }
export async function createVestuarioCor(storeId: string, input: unknown) { return guarded(storeId, (ctx) => svc.createCor(prisma, ctx, input)) }
export async function updateVestuarioCor(storeId: string, input: unknown) { return guarded(storeId, (ctx) => svc.updateCor(prisma, ctx, input)) }
export async function reorderVestuarioCores(storeId: string, input: unknown) { return guarded(storeId, (ctx) => svc.reorderCores(prisma, ctx, input)) }
export async function createVestuarioProdutoGrade(storeId: string, input: unknown) { return guarded(storeId, (ctx) => svc.createProdutoGrade(prisma, ctx, input)) }
export async function updateVestuarioProdutoGradeBase(storeId: string, input: unknown) { return guarded(storeId, (ctx) => svc.updateProdutoGradeBase(prisma, ctx, input)) }
export async function addVestuarioVariantes(storeId: string, input: unknown) { return guarded(storeId, (ctx) => svc.addVariantes(prisma, ctx, input)) }
export async function updateVestuarioVariante(storeId: string, input: unknown) { return guarded(storeId, (ctx) => svc.updateVariante(prisma, ctx, input)) }
