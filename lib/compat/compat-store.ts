/**
 * COMPAT-PROFISSIONAL-001 — acesso a dados do Compat POR LOJA (server-only).
 *
 * Toda leitura/escrita é escopada por `storeId` (já autorizado pela rota). Nenhuma função
 * aqui toca estoque, venda, financeiro ou fiscal: painéis/fileiras/localizações são endereço
 * físico; cores e preferências são configuração da loja.
 *
 * Rollout seguro (mesmo padrão de `loja-catalogo-store.ts`): sem a migration, LEITURAS
 * degradam para vazio/padrões e ESCRITAS devolvem `UNAVAILABLE` (503).
 * O `db` é injetável para testes.
 */

import type { PrismaClient } from "@/generated/prisma"
import { ACESSORIO_CORES_PADRAO, isAcessorioColorKey, type AcessorioColorKey } from "@/lib/acessorios/cores"
import { cleanCatalogText, isManualModelKey } from "@/lib/catalogo-aparelhos/loja-catalogo"
import { errorCode, isUnavailable } from "@/lib/catalogo-aparelhos/loja-catalogo-store"
import type { CatalogoIndex } from "@/lib/catalogo-aparelhos/types"
import { COR_LOJA_LIMITS, corLabelKey, corPadraoComMesmoNome, sanitizeCorLabel, type CorLoja } from "./cores-loja"
import {
  COMPAT_LIMITS,
  COMPAT_PREFERENCIAS_PADRAO,
  localNomeKey,
  mergePreferencias,
  reordenar,
  sanitizeLocalInput,
  sanitizePosicao,
  type CompatPreferencias,
  type LocalInputErrors,
} from "./organizacao"
import { classificarProdutoCapinha, type ProdutoCapinhaInfo } from "./capinhas"

export type CompatDb = Pick<
  PrismaClient,
  | "compatPainel"
  | "compatFileira"
  | "compatLocalizacao"
  | "compatCorLoja"
  | "compatPreferenciasLoja"
  | "catalogoAparelhoLojaModelo"
  | "produto"
  | "$transaction"
>

export type CompatFailure =
  | { ok: false; code: "INVALID"; status: 400; message: string; errors?: LocalInputErrors }
  | { ok: false; code: "NOT_FOUND"; status: 404; message: string }
  | { ok: false; code: "DUPLICATE"; status: 409; message: string }
  | { ok: false; code: "CONFLICT"; status: 409; message: string }
  | { ok: false; code: "IN_USE"; status: 409; message: string }
  | { ok: false; code: "LIMIT"; status: 409; message: string }
  | { ok: false; code: "UNAVAILABLE"; status: 503; message: string }

export type CompatResult<T> = { ok: true; value: T } | CompatFailure

const UNAVAILABLE: CompatFailure = {
  ok: false,
  code: "UNAVAILABLE",
  status: 503,
  message: "Configuração do Compat indisponível no momento. Tente novamente em instantes.",
}
const CONFLICT_VERSAO: CompatFailure = {
  ok: false,
  code: "CONFLICT",
  status: 409,
  message: "Este registro foi alterado por outra pessoa. Recarregue e tente de novo.",
}
const invalid = (message: string, errors?: LocalInputErrors): CompatFailure => ({
  ok: false,
  code: "INVALID",
  status: 400,
  message,
  ...(errors ? { errors } : {}),
})
const notFound = (message: string): CompatFailure => ({ ok: false, code: "NOT_FOUND", status: 404, message })

function body(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
}

function versionOf(b: Record<string, unknown>): number | null {
  return typeof b.version === "number" && Number.isInteger(b.version) ? b.version : null
}

/** Converte exceções conhecidas em falha tipada; desconhecidas sobem (500 na rota). */
function failureFrom(e: unknown, dupMessage: string): CompatFailure {
  if (errorCode(e) === "P2002") return { ok: false, code: "DUPLICATE", status: 409, message: dupMessage }
  if (errorCode(e) === "P2003") {
    return { ok: false, code: "IN_USE", status: 409, message: "Há registros vinculados. Desative em vez de excluir." }
  }
  if (isUnavailable(e)) return UNAVAILABLE
  throw e
}

const warned = new Set<string>()
function warnOnce(scope: string, e: unknown) {
  const key = `${scope}:${errorCode(e)}`
  if (warned.has(key)) return
  warned.add(key)
  console.warn(`[compat] ${scope}: leitura degradada`, errorCode(e) || String(e))
}

async function softRead<T>(scope: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (isUnavailable(e)) {
      warnOnce(scope, e)
      return fallback
    }
    throw e
  }
}

// ---------------------------------------------------------------------------
// Preferências
// ---------------------------------------------------------------------------

export async function getPreferencias(db: CompatDb, storeId: string): Promise<CompatPreferencias> {
  return softRead("getPreferencias", { ...COMPAT_PREFERENCIAS_PADRAO }, async () => {
    const row = await db.compatPreferenciasLoja.findUnique({ where: { storeId } })
    if (!row) return { ...COMPAT_PREFERENCIAS_PADRAO }
    return mergePreferencias({ ...COMPAT_PREFERENCIAS_PADRAO, version: row.version }, row)
  })
}

export async function setPreferencias(
  db: CompatDb,
  storeId: string,
  actorId: string,
  raw: unknown,
): Promise<CompatResult<CompatPreferencias>> {
  const b = body(raw)
  const version = versionOf(b)
  if (version === null) return invalid("Versão das preferências obrigatória.")
  try {
    const atual = await getPreferenciasStrict(db, storeId)
    if (atual.version !== version) return CONFLICT_VERSAO
    const next = mergePreferencias(atual, b)
    const data = {
      posicoesHabilitadas: next.posicoesHabilitadas,
      modoModeloPadrao: next.modoModeloPadrao,
      modoCorPadrao: next.modoCorPadrao,
      updatedBy: actorId,
    }
    if (version === 0) {
      await db.compatPreferenciasLoja.create({ data: { storeId, ...data } })
    } else {
      const res = await db.compatPreferenciasLoja.updateMany({
        where: { storeId, version },
        data: { ...data, version: { increment: 1 } },
      })
      if (res.count === 0) return CONFLICT_VERSAO
    }
    return { ok: true, value: await getPreferenciasStrict(db, storeId) }
  } catch (e) {
    if (errorCode(e) === "P2002") return CONFLICT_VERSAO
    return failureFrom(e, "Preferências já gravadas.")
  }
}

async function getPreferenciasStrict(db: CompatDb, storeId: string): Promise<CompatPreferencias> {
  const row = await db.compatPreferenciasLoja.findUnique({ where: { storeId } })
  if (!row) return { ...COMPAT_PREFERENCIAS_PADRAO }
  return mergePreferencias({ ...COMPAT_PREFERENCIAS_PADRAO, version: row.version }, row)
}

// ---------------------------------------------------------------------------
// Painéis e fileiras
// ---------------------------------------------------------------------------

export interface FileiraView {
  id: string
  painelId: string
  nome: string
  descricao: string
  ordem: number
  ativo: boolean
  version: number
  localizacoes: number
}

export interface PainelView {
  id: string
  nome: string
  descricao: string
  ordem: number
  ativo: boolean
  version: number
  localizacoes: number
  fileiras: FileiraView[]
}

export async function listOrganizacao(db: CompatDb, storeId: string): Promise<PainelView[]> {
  return softRead("listOrganizacao", [] as PainelView[], async () => {
    const [paineis, fileiras, contagemPainel, contagemFileira] = await Promise.all([
      db.compatPainel.findMany({ where: { storeId }, orderBy: [{ ordem: "asc" }, { createdAt: "asc" }], take: 500 }),
      db.compatFileira.findMany({ where: { storeId }, orderBy: [{ ordem: "asc" }, { createdAt: "asc" }], take: 5000 }),
      db.compatLocalizacao.groupBy({ by: ["painelId"], where: { storeId }, _count: { _all: true } }),
      db.compatLocalizacao.groupBy({ by: ["fileiraId"], where: { storeId }, _count: { _all: true } }),
    ])
    const porPainel = new Map(contagemPainel.map((c) => [c.painelId, c._count._all]))
    const porFileira = new Map(contagemFileira.map((c) => [c.fileiraId ?? "", c._count._all]))
    return paineis.map((p) => ({
      id: p.id,
      nome: p.nome,
      descricao: p.descricao,
      ordem: p.ordem,
      ativo: p.ativo,
      version: p.version,
      localizacoes: porPainel.get(p.id) ?? 0,
      fileiras: fileiras
        .filter((f) => f.painelId === p.id)
        .map((f) => ({
          id: f.id,
          painelId: f.painelId,
          nome: f.nome,
          descricao: f.descricao,
          ordem: f.ordem,
          ativo: f.ativo,
          version: f.version,
          localizacoes: porFileira.get(f.id) ?? 0,
        })),
    }))
  })
}

export async function createPainel(
  db: CompatDb,
  storeId: string,
  actorId: string,
  raw: unknown,
): Promise<CompatResult<{ id: string }>> {
  const parsed = sanitizeLocalInput(raw)
  if (!parsed.ok) return invalid("Dados do painel inválidos.", parsed.errors)
  const nome = parsed.value.nome as string
  try {
    const total = await db.compatPainel.count({ where: { storeId } })
    if (total >= COMPAT_LIMITS.paineisPorLoja) {
      return { ok: false, code: "LIMIT", status: 409, message: `Limite de ${COMPAT_LIMITS.paineisPorLoja} painéis por loja.` }
    }
    const created = await db.compatPainel.create({
      data: {
        storeId,
        nome,
        nomeKey: localNomeKey(nome),
        descricao: parsed.value.descricao ?? "",
        ordem: total,
        createdBy: actorId,
        updatedBy: actorId,
      },
      select: { id: true },
    })
    return { ok: true, value: created }
  } catch (e) {
    return failureFrom(e, "Já existe um painel com esse nome nesta loja.")
  }
}

export async function createFileira(
  db: CompatDb,
  storeId: string,
  actorId: string,
  raw: unknown,
): Promise<CompatResult<{ id: string }>> {
  const b = body(raw)
  const parsed = sanitizeLocalInput(b)
  if (!parsed.ok) return invalid("Dados da fileira inválidos.", parsed.errors)
  const painelId = typeof b.painelId === "string" ? b.painelId : ""
  try {
    const painel = await db.compatPainel.findFirst({ where: { id: painelId, storeId }, select: { id: true } })
    if (!painel) return notFound("Painel não encontrado nesta loja.")
    const total = await db.compatFileira.count({ where: { storeId, painelId } })
    if (total >= COMPAT_LIMITS.fileirasPorPainel) {
      return { ok: false, code: "LIMIT", status: 409, message: `Limite de ${COMPAT_LIMITS.fileirasPorPainel} fileiras por painel.` }
    }
    const nome = parsed.value.nome as string
    const created = await db.compatFileira.create({
      data: {
        storeId,
        painelId,
        nome,
        nomeKey: localNomeKey(nome),
        descricao: parsed.value.descricao ?? "",
        ordem: total,
        createdBy: actorId,
        updatedBy: actorId,
      },
      select: { id: true },
    })
    return { ok: true, value: created }
  } catch (e) {
    return failureFrom(e, "Já existe uma fileira com esse nome neste painel.")
  }
}

type LocalTipo = "painel" | "fileira"

/** Renomear / descrever / ativar-desativar (concorrência otimista por `version`). */
export async function updateLocal(
  db: CompatDb,
  tipo: LocalTipo,
  storeId: string,
  actorId: string,
  id: string,
  raw: unknown,
): Promise<CompatResult<{ id: string }>> {
  const b = body(raw)
  const version = versionOf(b)
  if (version === null) return invalid("Versão do registro obrigatória.")
  const parsed = sanitizeLocalInput(b, true)
  if (!parsed.ok) return invalid("Dados inválidos.", parsed.errors)
  const data: Record<string, unknown> = { updatedBy: actorId, version: { increment: 1 } }
  if (parsed.value.nome !== undefined) Object.assign(data, { nome: parsed.value.nome, nomeKey: localNomeKey(parsed.value.nome) })
  if (parsed.value.descricao !== undefined) data.descricao = parsed.value.descricao
  if (typeof b.ativo === "boolean") data.ativo = b.ativo
  try {
    const where = { id, storeId, version }
    const res =
      tipo === "painel"
        ? await db.compatPainel.updateMany({ where, data })
        : await db.compatFileira.updateMany({ where, data })
    if (res.count === 0) {
      const existe =
        tipo === "painel"
          ? await db.compatPainel.findFirst({ where: { id, storeId }, select: { id: true } })
          : await db.compatFileira.findFirst({ where: { id, storeId }, select: { id: true } })
      return existe ? CONFLICT_VERSAO : notFound("Local não encontrado nesta loja.")
    }
    return { ok: true, value: { id } }
  } catch (e) {
    return failureFrom(e, tipo === "painel" ? "Já existe um painel com esse nome." : "Já existe uma fileira com esse nome neste painel.")
  }
}

/** Excluir só quando NADA está vinculado (fileiras/localizações). Senão: desativar. */
export async function deleteLocal(
  db: CompatDb,
  tipo: LocalTipo,
  storeId: string,
  id: string,
): Promise<CompatResult<{ id: string }>> {
  try {
    if (tipo === "painel") {
      const painel = await db.compatPainel.findFirst({ where: { id, storeId }, select: { id: true } })
      if (!painel) return notFound("Painel não encontrado nesta loja.")
      const [fileiras, locais] = await Promise.all([
        db.compatFileira.count({ where: { storeId, painelId: id } }),
        db.compatLocalizacao.count({ where: { storeId, painelId: id } }),
      ])
      if (fileiras > 0 || locais > 0) {
        return {
          ok: false,
          code: "IN_USE",
          status: 409,
          message: "Este painel tem fileiras ou capinhas vinculadas. Desative-o em vez de excluir.",
        }
      }
      await db.compatPainel.deleteMany({ where: { id, storeId } })
    } else {
      const fileira = await db.compatFileira.findFirst({ where: { id, storeId }, select: { id: true } })
      if (!fileira) return notFound("Fileira não encontrada nesta loja.")
      const locais = await db.compatLocalizacao.count({ where: { storeId, fileiraId: id } })
      if (locais > 0) {
        return {
          ok: false,
          code: "IN_USE",
          status: 409,
          message: "Esta fileira tem capinhas vinculadas. Desative-a em vez de excluir.",
        }
      }
      await db.compatFileira.deleteMany({ where: { id, storeId } })
    }
    return { ok: true, value: { id } }
  } catch (e) {
    // FK RESTRICT do banco é a última barreira (corrida com um vínculo novo).
    return failureFrom(e, "Registro duplicado.")
  }
}

/** Sobe/desce uma casa (renumera 0..n-1 do escopo inteiro numa transação). */
export async function moverLocal(
  db: CompatDb,
  tipo: LocalTipo,
  storeId: string,
  id: string,
  direcao: unknown,
): Promise<CompatResult<{ id: string }>> {
  if (direcao !== "cima" && direcao !== "baixo") return invalid("Direção inválida.")
  try {
    if (tipo === "painel") {
      const itens = await db.compatPainel.findMany({ where: { storeId }, select: { id: true, ordem: true } })
      if (!itens.some((x) => x.id === id)) return notFound("Painel não encontrado nesta loja.")
      const nova = reordenar(itens, id, direcao)
      await db.$transaction(
        nova.map((n) => db.compatPainel.updateMany({ where: { id: n.id, storeId }, data: { ordem: n.ordem } })),
      )
    } else {
      const alvo = await db.compatFileira.findFirst({ where: { id, storeId }, select: { painelId: true } })
      if (!alvo) return notFound("Fileira não encontrada nesta loja.")
      const itens = await db.compatFileira.findMany({
        where: { storeId, painelId: alvo.painelId },
        select: { id: true, ordem: true },
      })
      const nova = reordenar(itens, id, direcao)
      await db.$transaction(
        nova.map((n) => db.compatFileira.updateMany({ where: { id: n.id, storeId }, data: { ordem: n.ordem } })),
      )
    }
    return { ok: true, value: { id } }
  } catch (e) {
    return failureFrom(e, "Conflito ao reordenar.")
  }
}

// ---------------------------------------------------------------------------
// Localizações
// ---------------------------------------------------------------------------

export interface LocalizacaoView {
  id: string
  modelKey: string
  produtoId: string | null
  painelId: string
  painelNome: string
  painelAtivo: boolean
  fileiraId: string | null
  fileiraNome: string | null
  fileiraAtiva: boolean
  posicao: string
  principal: boolean
  notes: string
}

export async function listLocalizacoes(
  db: CompatDb,
  storeId: string,
  filtro: { modelKeys?: readonly string[]; produtoIds?: readonly string[]; painelId?: string },
): Promise<LocalizacaoView[]> {
  const modelKeys = [...new Set((filtro.modelKeys ?? []).filter(Boolean))].slice(0, 200)
  const produtoIds = [...new Set((filtro.produtoIds ?? []).filter(Boolean))].slice(0, 500)
  const or = [
    ...(modelKeys.length ? [{ modelKey: { in: modelKeys } }] : []),
    ...(produtoIds.length ? [{ produtoId: { in: produtoIds } }] : []),
  ]
  if (!filtro.painelId && or.length === 0) return []
  return softRead("listLocalizacoes", [] as LocalizacaoView[], async () => {
    const rows = await db.compatLocalizacao.findMany({
      where: { storeId, ...(filtro.painelId ? { painelId: filtro.painelId } : {}), ...(or.length ? { OR: or } : {}) },
      include: {
        painel: { select: { nome: true, ativo: true, ordem: true } },
        fileira: { select: { nome: true, ativo: true, ordem: true } },
      },
      orderBy: [{ principal: "desc" }, { createdAt: "asc" }],
      take: 2000,
    })
    return rows.map((r) => ({
      id: r.id,
      modelKey: r.modelKey,
      produtoId: r.produtoId,
      painelId: r.painelId,
      painelNome: r.painel.nome,
      painelAtivo: r.painel.ativo,
      fileiraId: r.fileiraId,
      fileiraNome: r.fileira?.nome ?? null,
      fileiraAtiva: r.fileira?.ativo ?? true,
      posicao: r.posicao,
      principal: r.principal,
      notes: r.notes,
    }))
  })
}

/**
 * Vincula um modelo (e/ou produto específico) a um endereço físico. Idempotente: o mesmo
 * endereço para o mesmo alvo devolve o registro existente. `principal` desmarca as demais
 * localizações principais do mesmo alvo (numa transação).
 */
export async function addLocalizacao(
  db: CompatDb,
  globalIndex: CatalogoIndex,
  storeId: string,
  actorId: string,
  raw: unknown,
): Promise<CompatResult<{ id: string; existente: boolean }>> {
  const b = body(raw)
  const modelKey = typeof b.modelKey === "string" ? b.modelKey.trim().slice(0, 160) : ""
  const produtoId = typeof b.produtoId === "string" && b.produtoId.trim() ? b.produtoId.trim().slice(0, 64) : null
  const painelId = typeof b.painelId === "string" ? b.painelId : ""
  const fileiraId = typeof b.fileiraId === "string" && b.fileiraId ? b.fileiraId : null
  if (!modelKey && !produtoId) return invalid("Informe o modelo ou o produto.")
  if (!painelId) return invalid("Escolha o painel.")
  const notes = cleanCatalogText(b.notes, COMPAT_LIMITS.notes)
  const principal = b.principal === true
  try {
    const prefs = await getPreferenciasStrict(db, storeId)
    const posicao = sanitizePosicao(b.posicao, prefs.posicoesHabilitadas)

    const painel = await db.compatPainel.findFirst({ where: { id: painelId, storeId }, select: { ativo: true } })
    if (!painel) return notFound("Painel não encontrado nesta loja.")
    if (!painel.ativo) return invalid("Painel desativado. Reative-o antes de vincular capinhas.")
    if (fileiraId) {
      const fileira = await db.compatFileira.findFirst({
        where: { id: fileiraId, storeId, painelId },
        select: { ativo: true },
      })
      if (!fileira) return notFound("Fileira não encontrada neste painel.")
      if (!fileira.ativo) return invalid("Fileira desativada. Reative-a antes de vincular capinhas.")
    }
    if (modelKey) {
      const existe = isManualModelKey(modelKey)
        ? !!(await db.catalogoAparelhoLojaModelo.findFirst({ where: { storeId, modelKey }, select: { id: true } }))
        : globalIndex.modelByKey.has(modelKey)
      if (!existe) return notFound("Modelo não encontrado no catálogo desta loja.")
    }
    if (produtoId) {
      const produto = await db.produto.findFirst({ where: { id: produtoId, storeId }, select: { id: true } })
      if (!produto) return notFound("Produto não encontrado nesta loja.")
    }

    const alvo = { storeId, modelKey, produtoId }
    const igual = await db.compatLocalizacao.findFirst({
      where: { ...alvo, painelId, fileiraId, posicao },
      select: { id: true },
    })
    if (igual) {
      if (principal) await marcarPrincipal(db, storeId, igual.id, alvo)
      return { ok: true, value: { id: igual.id, existente: true } }
    }
    const total = await db.compatLocalizacao.count({ where: alvo })
    if (total >= COMPAT_LIMITS.localizacoesPorAlvo) {
      return {
        ok: false,
        code: "LIMIT",
        status: 409,
        message: `No máximo ${COMPAT_LIMITS.localizacoesPorAlvo} localizações por modelo/produto.`,
      }
    }
    // A primeira localização de um alvo já nasce principal.
    const nascePrincipal = principal || total === 0
    const created = await db.compatLocalizacao.create({
      data: { ...alvo, painelId, fileiraId, posicao, notes, principal: false, createdBy: actorId, updatedBy: actorId },
      select: { id: true },
    })
    if (nascePrincipal) await marcarPrincipal(db, storeId, created.id, alvo)
    return { ok: true, value: { id: created.id, existente: false } }
  } catch (e) {
    return failureFrom(e, "Localização duplicada.")
  }
}

async function marcarPrincipal(
  db: CompatDb,
  storeId: string,
  id: string,
  alvo: { modelKey: string; produtoId: string | null },
) {
  await db.$transaction([
    db.compatLocalizacao.updateMany({
      where: { storeId, modelKey: alvo.modelKey, produtoId: alvo.produtoId, principal: true, NOT: { id } },
      data: { principal: false },
    }),
    db.compatLocalizacao.updateMany({ where: { id, storeId }, data: { principal: true } }),
  ])
}

export async function setLocalizacaoPrincipal(
  db: CompatDb,
  storeId: string,
  id: string,
): Promise<CompatResult<{ id: string }>> {
  try {
    const row = await db.compatLocalizacao.findFirst({ where: { id, storeId }, select: { modelKey: true, produtoId: true } })
    if (!row) return notFound("Localização não encontrada nesta loja.")
    await marcarPrincipal(db, storeId, id, row)
    return { ok: true, value: { id } }
  } catch (e) {
    return failureFrom(e, "Conflito ao marcar principal.")
  }
}

/** Remove o VÍNCULO (endereço). Nunca toca produto, estoque ou o painel/fileira. */
export async function removeLocalizacao(
  db: CompatDb,
  storeId: string,
  id: string,
): Promise<CompatResult<{ id: string }>> {
  try {
    const res = await db.compatLocalizacao.deleteMany({ where: { id, storeId } })
    if (res.count === 0) return notFound("Localização não encontrada nesta loja.")
    return { ok: true, value: { id } }
  } catch (e) {
    return failureFrom(e, "Conflito ao remover.")
  }
}

// ---------------------------------------------------------------------------
// Cores
// ---------------------------------------------------------------------------

export async function listCoresLoja(db: CompatDb, storeId: string): Promise<CorLoja[]> {
  return softRead("listCoresLoja", [] as CorLoja[], async () => {
    const rows = await db.compatCorLoja.findMany({
      where: { storeId },
      orderBy: [{ ordem: "asc" }, { createdAt: "asc" }],
      take: COR_LOJA_LIMITS.coresPorLoja + ACESSORIO_CORES_PADRAO.length,
    })
    return rows.map((r) => ({
      id: r.id,
      baseKey: r.baseKey && isAcessorioColorKey(r.baseKey) ? r.baseKey : null,
      label: r.label,
      ativo: r.ativo,
      ordem: r.ordem,
      version: r.version,
    }))
  })
}

export async function createCorLoja(
  db: CompatDb,
  storeId: string,
  actorId: string,
  raw: unknown,
): Promise<CompatResult<{ id: string }>> {
  const parsed = sanitizeCorLabel(body(raw).label)
  if (!parsed.ok) return invalid(parsed.error)
  const padrao = corPadraoComMesmoNome(parsed.label)
  if (padrao) {
    return { ok: false, code: "DUPLICATE", status: 409, message: "Essa cor já existe na lista padrão. Use a cor padrão." }
  }
  try {
    const total = await db.compatCorLoja.count({ where: { storeId, baseKey: null } })
    if (total >= COR_LOJA_LIMITS.coresPorLoja) {
      return { ok: false, code: "LIMIT", status: 409, message: `Limite de ${COR_LOJA_LIMITS.coresPorLoja} cores por loja.` }
    }
    const created = await db.compatCorLoja.create({
      data: {
        storeId,
        label: parsed.label,
        labelKey: corLabelKey(parsed.label),
        ordem: total,
        createdBy: actorId,
        updatedBy: actorId,
      },
      select: { id: true },
    })
    return { ok: true, value: created }
  } catch (e) {
    return failureFrom(e, "Já existe uma cor com esse nome nesta loja.")
  }
}

/** Renomear (só cores próprias) e/ou ativar-desativar. Histórico de vendas não muda. */
export async function updateCorLoja(
  db: CompatDb,
  storeId: string,
  actorId: string,
  id: string,
  raw: unknown,
): Promise<CompatResult<{ id: string }>> {
  const b = body(raw)
  const version = versionOf(b)
  if (version === null) return invalid("Versão do registro obrigatória.")
  try {
    const atual = await db.compatCorLoja.findFirst({ where: { id, storeId } })
    if (!atual) return notFound("Cor não encontrada nesta loja.")
    const data: Record<string, unknown> = { updatedBy: actorId, version: { increment: 1 } }
    if ("label" in b) {
      if (atual.baseKey) return invalid("Cores da lista padrão não podem ser renomeadas; cadastre uma cor própria.")
      const parsed = sanitizeCorLabel(b.label)
      if (!parsed.ok) return invalid(parsed.error)
      if (corPadraoComMesmoNome(parsed.label)) {
        return { ok: false, code: "DUPLICATE", status: 409, message: "Essa cor já existe na lista padrão." }
      }
      Object.assign(data, { label: parsed.label, labelKey: corLabelKey(parsed.label) })
    }
    if (typeof b.ativo === "boolean") data.ativo = b.ativo
    const res = await db.compatCorLoja.updateMany({ where: { id, storeId, version }, data })
    if (res.count === 0) return CONFLICT_VERSAO
    return { ok: true, value: { id } }
  } catch (e) {
    return failureFrom(e, "Já existe uma cor com esse nome nesta loja.")
  }
}

/** Ativa/desativa uma cor da PALETA PADRÃO só nesta loja ("Outra" não é desativável). */
export async function setCorPadraoAtiva(
  db: CompatDb,
  storeId: string,
  actorId: string,
  baseKey: unknown,
  ativo: unknown,
): Promise<CompatResult<{ id: string }>> {
  if (!isAcessorioColorKey(baseKey)) return invalid("Cor padrão inválida.")
  if (baseKey === "outra") return invalid("A opção “Outra” não pode ser desativada.")
  if (typeof ativo !== "boolean") return invalid("Informe ativo: true/false.")
  const label = ACESSORIO_CORES_PADRAO.find((c) => c.key === baseKey)!.label
  try {
    const row = await db.compatCorLoja.upsert({
      where: { storeId_baseKey: { storeId, baseKey: baseKey as AcessorioColorKey } },
      create: { storeId, baseKey, label, labelKey: corLabelKey(label), ativo, createdBy: actorId, updatedBy: actorId },
      update: { ativo, updatedBy: actorId, version: { increment: 1 } },
      select: { id: true },
    })
    return { ok: true, value: row }
  } catch (e) {
    return failureFrom(e, "Conflito ao gravar a cor.")
  }
}

// ---------------------------------------------------------------------------
// Produtos de capinha da loja (somente leitura)
// ---------------------------------------------------------------------------

/** Produtos ATIVOS da loja classificados como capinha (geral ou detalhado). */
export async function listProdutosCapinha(
  db: Pick<PrismaClient, "produto">,
  storeId: string,
): Promise<ProdutoCapinhaInfo[]> {
  const rows = await db.produto.findMany({
    where: {
      storeId,
      active: true,
      OR: [
        { metadata: { path: ["acessorios", "tipo"], equals: "capinha" } },
        { metadata: { path: ["catalogoAparelhos", "compatibilityTypes"], array_contains: ["capinha"] } },
      ],
    },
    select: { id: true, name: true, sku: true, stock: true, active: true, metadata: true },
    orderBy: { name: "asc" },
    take: 3000,
  })
  return rows.map(classificarProdutoCapinha).filter((p): p is ProdutoCapinhaInfo => p !== null)
}
