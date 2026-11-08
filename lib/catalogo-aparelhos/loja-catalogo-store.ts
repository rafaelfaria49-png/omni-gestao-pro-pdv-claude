/**
 * CADASTROS-ACESSORIOS-COMPATIBILIDADE-MANUAL-001 — acesso a dados do catálogo POR LOJA.
 *
 * SERVER-ONLY. Toda leitura/escrita é escopada por `storeId` (já autorizado pela rota):
 * uma loja nunca lê nem altera registros de outra. A fonte da verdade é o PostgreSQL
 * (tabelas `catalogo_aparelhos_loja_modelos` / `catalogo_aparelhos_loja_compat`).
 *
 * Rollout seguro: se a migration ainda não foi aplicada (tabela ausente), as LEITURAS
 * degradam para "sem registros da loja" (o catálogo global continua funcionando) e as
 * ESCRITAS devolvem `UNAVAILABLE` — nunca derrubam a busca do PDV.
 *
 * O `db` é injetável para os testes de integração contra PostgreSQL descartável.
 */

import { randomUUID } from "node:crypto"
import type { PrismaClient } from "@/generated/prisma"
import {
  MANUAL_MODEL_KEY_PREFIX,
  aliasesFromJson,
  catalogKey,
  cleanCatalogText,
  findGlobalDuplicate,
  isManualModelKey,
  lojaModeloCanonicalName,
  normalizeLojaCompatStatus,
  orderedPair,
  sanitizeLojaModeloInput,
  type LojaCompatAcao,
  type LojaCompatCategoria,
  type LojaCompatOverride,
  type LojaModelo,
  type LojaModeloInputErrors,
} from "./loja-catalogo"
import type { CatalogoIndex } from "./types"

type Db = Pick<PrismaClient, "catalogoAparelhoLojaModelo" | "catalogoAparelhoLojaCompat">

export type LojaCatalogoFailure =
  | { ok: false; code: "INVALID"; status: 400; message: string; errors?: LojaModeloInputErrors }
  | { ok: false; code: "NOT_FOUND"; status: 404; message: string }
  | {
      ok: false
      code: "DUPLICATE"
      status: 409
      message: string
      existing: { modelKey: string; brand: string; canonicalName: string; source: "global" | "loja"; active: boolean }
    }
  | { ok: false; code: "CONFLICT"; status: 409; message: string }
  | { ok: false; code: "LIMIT"; status: 409; message: string }
  | { ok: false; code: "UNAVAILABLE"; status: 503; message: string }

export type LojaCatalogoResult<T> = { ok: true; value: T } | LojaCatalogoFailure

const MAX_MODELOS_POR_LOJA = 2000
const MAX_OVERRIDES_POR_CONSULTA = 2000

function errorCode(e: unknown): string {
  // PrismaClientInitializationError expõe o código em `errorCode` (P1001/P1002), não em `code`.
  const err = e as { code?: string; errorCode?: string }
  return err?.code ?? err?.errorCode ?? ""
}

/** Tabela/coluna ausente (migration não aplicada) ou banco indisponível. */
function isUnavailable(e: unknown): boolean {
  const code = errorCode(e)
  return (
    code === "P2021" || code === "P2022" || code === "P1001" || code === "P1002" || code === "P2024" ||
    (e as { name?: string })?.name === "PrismaClientInitializationError"
  )
}

const UNAVAILABLE: LojaCatalogoFailure = {
  ok: false,
  code: "UNAVAILABLE",
  status: 503,
  message: "Catálogo da loja indisponível no momento. Tente novamente em instantes.",
}

const warnedScopes = new Set<string>()
function warnOnce(scope: string, e: unknown) {
  const key = `${scope}:${errorCode(e)}`
  if (warnedScopes.has(key)) return
  warnedScopes.add(key)
  console.warn(`[catalogo-loja] ${scope}: leitura degradada (somente catálogo global)`, errorCode(e) || String(e))
}

type ModeloRow = {
  id: string
  storeId: string
  modelKey: string
  brand: string
  name: string
  aliases: unknown
  notes: string
  active: boolean
  version: number
  createdAt: Date
  updatedAt: Date
}

function toModelo(r: ModeloRow): LojaModelo {
  return {
    id: r.id,
    storeId: r.storeId,
    modelKey: r.modelKey,
    brand: r.brand,
    name: r.name,
    aliases: aliasesFromJson(r.aliases),
    notes: r.notes,
    active: r.active,
    version: r.version,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Leituras (fail-soft)
// ---------------------------------------------------------------------------

/** Modelos manuais da loja. `includeInactive` só para a tela de gestão. */
export async function listLojaModelos(
  db: Db,
  storeId: string,
  opts: { includeInactive?: boolean } = {},
): Promise<LojaModelo[]> {
  try {
    const rows = await db.catalogoAparelhoLojaModelo.findMany({
      where: { storeId, ...(opts.includeInactive ? {} : { active: true }) },
      orderBy: [{ active: "desc" }, { brand: "asc" }, { name: "asc" }],
      take: MAX_MODELOS_POR_LOJA,
    })
    return rows.map(toModelo)
  } catch (e) {
    if (isUnavailable(e)) {
      warnOnce("listLojaModelos", e)
      return []
    }
    throw e
  }
}

/** Resolve chaves manuais SOMENTE da loja informada (inclui desativados, para histórico). */
export async function getLojaModelosByKeys(db: Db, storeId: string, keys: readonly string[]): Promise<LojaModelo[]> {
  const manual = [...new Set(keys.filter(isManualModelKey))].slice(0, 500)
  if (manual.length === 0) return []
  try {
    const rows = await db.catalogoAparelhoLojaModelo.findMany({ where: { storeId, modelKey: { in: manual } } })
    return rows.map(toModelo)
  } catch (e) {
    if (isUnavailable(e)) {
      warnOnce("getLojaModelosByKeys", e)
      return []
    }
    throw e
  }
}

/** Decisões de compatibilidade da loja envolvendo os modelos informados. */
export async function listLojaCompatOverrides(
  db: Db,
  storeId: string,
  categoria: LojaCompatCategoria,
  modelKeys: readonly string[],
): Promise<LojaCompatOverride[]> {
  const keys = [...new Set(modelKeys.map((k) => k.trim()).filter(Boolean))].slice(0, 200)
  if (keys.length === 0) return []
  try {
    const rows = await db.catalogoAparelhoLojaCompat.findMany({
      where: { storeId, categoria, OR: [{ modelKeyA: { in: keys } }, { modelKeyB: { in: keys } }] },
      take: MAX_OVERRIDES_POR_CONSULTA,
    })
    return rows.map((r) => ({
      categoria: r.categoria as LojaCompatCategoria,
      modelKeyA: r.modelKeyA,
      modelKeyB: r.modelKeyB,
      acao: r.acao as LojaCompatAcao,
      status: normalizeLojaCompatStatus(r.status),
      notes: r.notes,
    }))
  } catch (e) {
    if (isUnavailable(e)) {
      warnOnce("listLojaCompatOverrides", e)
      return []
    }
    throw e
  }
}

// ---------------------------------------------------------------------------
// Escritas — modelos manuais
// ---------------------------------------------------------------------------

async function findLojaDuplicate(db: Db, storeId: string, brandKey: string, nameKey: string, exceptId?: string) {
  return db.catalogoAparelhoLojaModelo.findFirst({
    where: { storeId, brandKey, nameKey, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
  })
}

function duplicateFromLoja(row: ModeloRow): LojaCatalogoFailure {
  const m = toModelo(row)
  return {
    ok: false,
    code: "DUPLICATE",
    status: 409,
    message: m.active
      ? "Este modelo já está cadastrado nesta loja para a mesma marca."
      : "Este modelo já existe nesta loja (desativado). Reative-o em vez de cadastrar de novo.",
    existing: { modelKey: m.modelKey, brand: m.brand, canonicalName: lojaModeloCanonicalName(m), source: "loja", active: m.active },
  }
}

function checkGlobal(globalIndex: CatalogoIndex, input: { brand: string; name: string }): LojaCatalogoFailure | null {
  const g = findGlobalDuplicate(globalIndex, input)
  if (!g) return null
  return {
    ok: false,
    code: "DUPLICATE",
    status: 409,
    message: "Este modelo já existe no catálogo para a mesma marca. Use o modelo existente.",
    existing: { modelKey: g.modelKey, brand: g.brand, canonicalName: g.canonicalName, source: "global", active: true },
  }
}

export async function createLojaModelo(
  db: Db,
  globalIndex: CatalogoIndex,
  storeId: string,
  actorId: string,
  raw: unknown,
): Promise<LojaCatalogoResult<LojaModelo>> {
  const parsed = sanitizeLojaModeloInput(raw)
  if (!parsed.ok) return { ok: false, code: "INVALID", status: 400, message: "Dados do modelo inválidos.", errors: parsed.errors }
  const { brand, name, aliases, notes } = parsed.value
  const globalDup = checkGlobal(globalIndex, { brand, name })
  if (globalDup) return globalDup
  const brandKey = catalogKey(brand)
  const nameKey = catalogKey(name)
  try {
    const dup = await findLojaDuplicate(db, storeId, brandKey, nameKey)
    if (dup) return duplicateFromLoja(dup)
    // A busca lê no máximo MAX_MODELOS_POR_LOJA modelos: acima disso o novo sumiria em silêncio.
    if ((await db.catalogoAparelhoLojaModelo.count({ where: { storeId } })) >= MAX_MODELOS_POR_LOJA) {
      return { ok: false, code: "LIMIT", status: 409, message: `Limite de ${MAX_MODELOS_POR_LOJA} modelos cadastrados por loja atingido.` }
    }
    const created = await db.catalogoAparelhoLojaModelo.create({
      data: {
        storeId,
        modelKey: `${MANUAL_MODEL_KEY_PREFIX}${randomUUID().replace(/-/g, "")}`,
        brand,
        name,
        brandKey,
        nameKey,
        aliases,
        notes,
        createdBy: actorId,
        updatedBy: actorId,
      },
    })
    return { ok: true, value: toModelo(created) }
  } catch (e) {
    if (errorCode(e) === "P2002") {
      // Corrida: outra requisição criou o mesmo marca+modelo entre o lookup e o insert.
      const dup = await findLojaDuplicate(db, storeId, brandKey, nameKey).catch(() => null)
      if (dup) return duplicateFromLoja(dup)
      return { ok: false, code: "CONFLICT", status: 409, message: "Modelo cadastrado ao mesmo tempo por outra pessoa. Pesquise novamente." }
    }
    if (isUnavailable(e)) return UNAVAILABLE
    throw e
  }
}

/**
 * Edita nome/marca/apelidos/observação e/ou ativa-desativa. Exige `version` (concorrência
 * otimista): se outra edição salvou antes, devolve CONFLICT sem sobrescrever. A `modelKey`
 * nunca muda — vínculos de produtos e vendas continuam válidos.
 */
export async function updateLojaModelo(
  db: Db,
  globalIndex: CatalogoIndex,
  storeId: string,
  actorId: string,
  id: string,
  raw: unknown,
): Promise<LojaCatalogoResult<LojaModelo>> {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const version = typeof body.version === "number" && Number.isInteger(body.version) ? body.version : null
  if (version === null) return { ok: false, code: "INVALID", status: 400, message: "Versão do registro obrigatória." }
  try {
    const current = await db.catalogoAparelhoLojaModelo.findFirst({ where: { id, storeId } })
    if (!current) return { ok: false, code: "NOT_FOUND", status: 404, message: "Modelo não encontrado nesta loja." }

    const onlyActive = Object.keys(body).every((k) => k === "version" || k === "active")
    const data: Record<string, unknown> = { updatedBy: actorId, version: { increment: 1 } }
    if (typeof body.active === "boolean") data.active = body.active
    // Reativar não pode reintroduzir duplicata de um modelo que entrou depois no catálogo global.
    if (body.active === true && !current.active) {
      const globalDup = checkGlobal(globalIndex, { brand: String(body.brand ?? current.brand), name: String(body.name ?? current.name) })
      if (globalDup) return globalDup
    }

    if (!onlyActive) {
      const parsed = sanitizeLojaModeloInput({
        brand: "brand" in body ? body.brand : current.brand,
        name: "name" in body ? body.name : current.name,
        aliases: "aliases" in body ? body.aliases : aliasesFromJson(current.aliases),
        notes: "notes" in body ? body.notes : current.notes,
      })
      if (!parsed.ok) return { ok: false, code: "INVALID", status: 400, message: "Dados do modelo inválidos.", errors: parsed.errors }
      const v = parsed.value
      const brandKey = catalogKey(v.brand)
      const nameKey = catalogKey(v.name)
      if (brandKey !== current.brandKey || nameKey !== current.nameKey) {
        const globalDup = checkGlobal(globalIndex, v)
        if (globalDup) return globalDup
        const dup = await findLojaDuplicate(db, storeId, brandKey, nameKey, id)
        if (dup) return duplicateFromLoja(dup)
      }
      Object.assign(data, { brand: v.brand, name: v.name, brandKey, nameKey, aliases: v.aliases, notes: v.notes })
    }

    const res = await db.catalogoAparelhoLojaModelo.updateMany({ where: { id, storeId, version }, data })
    if (res.count === 0) {
      return { ok: false, code: "CONFLICT", status: 409, message: "Este modelo foi alterado por outra pessoa. Recarregue e tente de novo." }
    }
    const updated = await db.catalogoAparelhoLojaModelo.findFirst({ where: { id, storeId } })
    if (!updated) return { ok: false, code: "NOT_FOUND", status: 404, message: "Modelo não encontrado nesta loja." }
    return { ok: true, value: toModelo(updated) }
  } catch (e) {
    if (errorCode(e) === "P2002") {
      return { ok: false, code: "CONFLICT", status: 409, message: "Já existe um modelo com essa marca e nome nesta loja." }
    }
    if (isUnavailable(e)) return UNAVAILABLE
    throw e
  }
}

// ---------------------------------------------------------------------------
// Escritas — decisões de compatibilidade (pares)
// ---------------------------------------------------------------------------

export type LojaCompatDecisao = LojaCompatAcao | "restaurar"

/**
 * Grava (idempotente) a decisão da loja sobre o par: `adicionar`/`suprimir` fazem upsert do
 * par ordenado; `restaurar` remove a decisão (volta ao comportamento do catálogo global).
 * Os dois modelos precisam existir no catálogo global OU ser modelos manuais DESTA loja.
 */
export async function setLojaCompatDecisao(
  db: Db,
  globalIndex: CatalogoIndex,
  storeId: string,
  actorId: string,
  raw: unknown,
): Promise<LojaCatalogoResult<{ decisao: LojaCompatDecisao; modelKeyA: string; modelKeyB: string }>> {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const categoria = body.categoria === undefined ? "pelicula_tela" : body.categoria
  if (categoria !== "pelicula_tela") {
    return { ok: false, code: "INVALID", status: 400, message: "Categoria não suportada para relação entre modelos." }
  }
  const decisao = body.decisao
  if (decisao !== "adicionar" && decisao !== "suprimir" && decisao !== "restaurar") {
    return { ok: false, code: "INVALID", status: 400, message: "Decisão inválida." }
  }
  const pair = orderedPair(String(body.modelKey ?? ""), String(body.otherModelKey ?? ""))
  if (!pair || pair.modelKeyA.length > 160 || pair.modelKeyB.length > 160) {
    return { ok: false, code: "INVALID", status: 400, message: "Informe dois modelos diferentes." }
  }
  const status = normalizeLojaCompatStatus(body.status)
  const notes = cleanCatalogText(body.notes, 300)

  try {
    const keys = [pair.modelKeyA, pair.modelKeyB]
    const manuais = await getLojaModelosByKeysStrict(db, storeId, keys, decisao === "restaurar")
    for (const k of keys) {
      const exists = isManualModelKey(k) ? manuais.has(k) : globalIndex.modelByKey.has(k)
      if (!exists) return { ok: false, code: "NOT_FOUND", status: 404, message: "Modelo não encontrado no catálogo desta loja." }
    }
    const where = {
      storeId_categoria_modelKeyA_modelKeyB: { storeId, categoria, modelKeyA: pair.modelKeyA, modelKeyB: pair.modelKeyB },
    }
    if (decisao === "restaurar") {
      await db.catalogoAparelhoLojaCompat.deleteMany({ where: { storeId, categoria, ...pair } })
    } else {
      const upsert = () => db.catalogoAparelhoLojaCompat.upsert({
        where,
        create: { storeId, categoria, ...pair, acao: decisao, status, notes, createdBy: actorId, updatedBy: actorId },
        // Repetir a decisão sem status/observação não apaga o que já foi informado.
        update: {
          acao: decisao,
          ...(body.status !== undefined ? { status } : {}),
          ...(body.notes !== undefined ? { notes } : {}),
          updatedBy: actorId,
        },
      })
      try {
        await upsert()
      } catch (e) {
        // Upsert concorrente do mesmo par: o INSERT perdeu a corrida; a 2ª tentativa vira UPDATE.
        if (errorCode(e) !== "P2002") throw e
        await upsert()
      }
    }
    return { ok: true, value: { decisao, ...pair } }
  } catch (e) {
    if (errorCode(e) === "P2002") {
      // Upsert concorrente do mesmo par: a outra gravação venceu; repetir é seguro.
      return { ok: false, code: "CONFLICT", status: 409, message: "Decisão gravada ao mesmo tempo por outra pessoa. Recarregue." }
    }
    if (isUnavailable(e)) return UNAVAILABLE
    throw e
  }
}

/** Como `getLojaModelosByKeys`, mas propaga indisponibilidade (usado em escrita). */
async function getLojaModelosByKeysStrict(
  db: Db,
  storeId: string,
  keys: readonly string[],
  includeInactive: boolean,
): Promise<Set<string>> {
  const manual = keys.filter(isManualModelKey)
  if (manual.length === 0) return new Set()
  const rows = await db.catalogoAparelhoLojaModelo.findMany({
    where: { storeId, modelKey: { in: manual }, ...(includeInactive ? {} : { active: true }) },
    select: { modelKey: true },
  })
  return new Set(rows.map((r) => r.modelKey))
}
