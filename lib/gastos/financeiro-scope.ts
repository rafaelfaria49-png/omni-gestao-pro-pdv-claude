import "server-only"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma"
import { getEnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import type { FinanceiroContextoAutorizado } from "./types"

export type FinanceiroDb = Prisma.TransactionClient
export const LIMITE_CENTAVOS = BigInt("9000000000000")
export const FINANCEIRO_CONTA_LOCK_PREFIX = "financeiro:carteira-saldo"
export class FinanceiroScopeError extends Error {
  constructor(public readonly status = 403, message = "Dados financeiros inválidos ou sem acesso.") {
    super(message)
    this.name = "FinanceiroScopeError"
  }
}

/** Refina somente resultado empresarial já filtrado/autorizado; NULL ou outra loja recusam. */
export function registroFinanceiroDaEmpresa<T extends { storeId: string | null }>(row: T, storeId: string): T & { storeId: string } {
  if (!storeId.trim() || row.storeId !== storeId) throw new FinanceiroScopeError()
  return { ...row, storeId: row.storeId }
}

/** Inteiros em centavos; string evita perda de precisão/BigInt no JSON. */
export function validarCentavos(input: unknown, permitirNegativo = false): bigint {
  const raw = typeof input === "number" && Number.isSafeInteger(input) ? String(input) : input
  if (typeof raw !== "string" || !/^-?\d{1,16}$/.test(raw)) throw new FinanceiroScopeError(422)
  const value = BigInt(raw)
  if ((!permitirNegativo && value < BigInt(0)) || value > LIMITE_CENTAVOS || value < -LIMITE_CENTAVOS) {
    throw new FinanceiroScopeError(422)
  }
  return value
}

/** Não arredonda nem apaga o Float legado anômalo. Centavos só se forem representáveis. */
export function precisaoLegada(valor: number) {
  if (!Number.isFinite(valor)) throw new FinanceiroScopeError(422)
  const scaled = valor * 100
  const inteiro = Math.round(scaled)
  const tolerancia = Math.max(0.0000000001, Math.abs(valor) * Number.EPSILON * 2)
  if (Number.isSafeInteger(inteiro) && Math.abs(valor - inteiro / 100) <= tolerancia
    && Math.abs(inteiro) <= Number(LIMITE_CENTAVOS)) {
    return { valorCentavos: String(inteiro), valorOriginalLegado: null, precisaoStatus: "CENTAVOS" }
  }
  return { valorCentavos: null, valorOriginalLegado: valor, precisaoStatus: "ANOMALIA_LEGADO" }
}

/** Ponte interna dos writers operacionais, após a autorização de seu entrypoint.
 * Não é Action/rota nem concede membership. Sempre usar na transação da gravação.
 */
export async function resolverPerfilEmpresa(db: FinanceiroDb, storeId: string): Promise<string> {
  if (typeof storeId !== "string" || !storeId.trim()) throw new FinanceiroScopeError(422)
  // INSERT sem sobrescrita: uma criação concorrente aguarda o commit e é relida.
  let perfil = await db.financeiroPerfil.findUnique({ where: { storeId } })
  if (!perfil) {
    await db.financeiroPerfil.createMany({ data: [{ tipo: "EMPRESA", storeId }], skipDuplicates: true })
    perfil = await db.financeiroPerfil.findUnique({ where: { storeId } })
  }
  if (!perfil) throw new FinanceiroScopeError()
  if (!perfil.ativo || perfil.tipo !== "EMPRESA" || perfil.storeId !== storeId) throw new FinanceiroScopeError()
  return perfil.id
}

export function emTransacaoFinanceira<T>(db: FinanceiroDb | undefined, fn: (tx: FinanceiroDb) => Promise<T>) {
  return db && db !== prisma ? fn(db) : prisma.$transaction(fn, { maxWait: 5_000, timeout: 20_000 })
}

/** Até quatro transações independentes, sem ampliar locks entre títulos.
 * Chaves repetidas conservam a ordem do snapshot. Em falha, interrompe novos
 * trabalhos e aguarda os já iniciados antes de responder; não deixa gravações
 * em segundo plano nem converte a requisição inteira numa transação longa.
 */
export async function persistirSnapshotFinanceiro<T>(
  itens: Array<{ chave: string; item: T }>, persistir: (item: T) => Promise<unknown>,
): Promise<number> {
  const porChave = new Map<string, T[]>()
  for (const { chave, item } of itens) {
    const grupo = porChave.get(chave) ?? []
    grupo.push(item)
    porChave.set(chave, grupo)
  }
  const grupos = [...porChave.values()]
  let proximo = 0, aplicados = 0, falhou = false
  let erro: unknown
  const executar = async () => {
    while (!falhou) {
      const grupo = grupos[proximo++]
      if (!grupo) return
      for (const item of grupo) {
        if (falhou) return
        try { await persistir(item); aplicados++ }
        catch (e) {
          if (!falhou) { falhou = true; erro = e }
          return
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, grupos.length) }, executar))
  if (falhou) throw erro
  return aplicados
}

export type SnapshotVinculoAviso = {
  campo: "carteiraId" | "fornecedorId"
  motivo: "indisponivel" | "preservado_historico"
}

/** Referência opcional de snapshot não é seleção de conta para um pagamento.
 * Rejeita a associação inválida, preservando os demais dados e o vínculo canônico.
 * IDs indisponíveis, estrangeiros e inativos geram a mesma resposta, sem revelar existência.
 */
export async function referenciaSnapshotEmpresa(
  db: FinanceiroDb, storeId: string, campo: SnapshotVinculoAviso["campo"], sugestao: unknown,
  atual: string | null, preservar: boolean, onWarning?: (aviso: SnapshotVinculoAviso) => void,
) {
  const id = typeof sugestao === "string" ? sugestao.trim() : ""
  if (!id || id === atual) return atual
  const avisar = (motivo: SnapshotVinculoAviso["motivo"]) => {
    const aviso = { campo, motivo }
    if (onWarning) onWarning(aviso)
    else console.warn("[financeiro/snapshot] referência opcional ignorada", aviso)
  }
  if (preservar) { avisar("preservado_historico"); return atual }
  const disponivel = campo === "carteiraId"
    ? await db.carteiraFinanceira.findFirst({ where: { id, storeId, ativo: true }, select: { id: true } })
    : await db.fornecedor.findFirst({ where: { id, storeId, active: true }, select: { id: true } })
  if (disponivel) return id
  avisar("indisponivel")
  return atual
}

export function manterReferenciaSnapshot(
  payload: Record<string, unknown>, campo: SnapshotVinculoAviso["campo"], id: string | null,
  base: Record<string, unknown>, preservar: boolean,
) {
  if (id) payload[campo] = id
  else if (preservar && base[campo] !== undefined) payload[campo] = base[campo]
  else delete payload[campo]
}

/** Adoção empresarial inequívoca, apenas na transação de uma gravação autorizada. */
export async function dadosFinanceirosEmpresa(
  db: FinanceiroDb, storeId: string, valor?: number,
  refs: { carteiraId?: string | null; carteiraHistoricaId?: string | null; pagarTituloId?: string; receberTituloId?: string } = {},
) {
  const titulos: Array<{ kind: "pagar" | "receber"; id: string; perfilId: string | null; carteiraId: string | null }> = []
  for (const kind of ["pagar", "receber"] as const) {
    const id = kind === "pagar" ? refs.pagarTituloId : refs.receberTituloId
    if (!id) continue
    // Mesma ordem dos snapshots: título antes das carteiras. A FK do movimento
    // também pede lock no título; carteira antes dele fecha um ciclo de deadlock.
    if (kind === "pagar") await db.$queryRaw`SELECT id FROM contas_pagar_titulos WHERE id = ${id} AND "storeId" = ${storeId} FOR NO KEY UPDATE`
    else await db.$queryRaw`SELECT id FROM contas_receber_titulos WHERE id = ${id} AND "storeId" = ${storeId} FOR NO KEY UPDATE`
    const where = { id, storeId, ativo: true }
    const row = kind === "pagar" ? await db.contaPagarTitulo.findFirst({ where }) : await db.contaReceberTitulo.findFirst({ where })
    if (!row) throw new FinanceiroScopeError()
    titulos.push({ kind, id: row.id, perfilId: row.perfilId, carteiraId: row.carteiraId })
  }
  // A unicidade da criação do perfil também retém lock até o commit.
  // Mesma ordem de snapshots/lote: todos os títulos -> perfil -> carteiras.
  const perfilId = await resolverPerfilEmpresa(db, storeId)
  for (const row of titulos) {
    if (row.perfilId && row.perfilId !== perfilId) throw new FinanceiroScopeError()
  }
  // A conta própria do título também precisa ser adotada antes da FK composta.
  // Pode diferir da conta de pagamento; validar ambas em ordem estável não transfere saldo.
  const carteiras = [...new Set([refs.carteiraId, refs.carteiraHistoricaId, ...titulos.map(row => row.carteiraId)]
    .filter((id): id is string => typeof id === "string" && id.length > 0))].sort()
  for (const carteiraId of carteiras) {
    const lock = `${FINANCEIRO_CONTA_LOCK_PREFIX}:${storeId}:${carteiraId}`
    await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))::text AS lock`
    // Ativo é obrigatório para uma conta escolhida para NOVO lançamento. A mera
    // referência histórica não perde validade quando a conta é desativada.
    const conta = await db.carteiraFinanceira.findFirst({ where: { id: carteiraId, storeId,
      ...(carteiraId === refs.carteiraId ? { ativo: true } : {}),
    } })
    if (!conta || (conta.perfilId && conta.perfilId !== perfilId)) throw new FinanceiroScopeError()
    if (!conta.perfilId) await db.carteiraFinanceira.update({ where: { id: conta.id }, data: { perfilId } })
  }
  for (const row of titulos) {
    if (!row.perfilId) {
      if (row.kind === "pagar") await db.contaPagarTitulo.update({ where: { id: row.id }, data: { perfilId } })
      else await db.contaReceberTitulo.update({ where: { id: row.id }, data: { perfilId } })
    }
  }
  return { perfilId, ...(valor === undefined ? {} : precisaoLegada(valor)) }
}

/** Identidades novas não reinterpretam localKey/referenciaId empresariais existentes. */
export function identidadeFinanceira(contexto: FinanceiroContextoAutorizado, chave: string) {
  if (!chave.trim() || chave.length > 191) throw new FinanceiroScopeError(422)
  return `gastos:${contexto.tipo.toLowerCase()}:${contexto.perfilId}:${encodeURIComponent(chave)}`
}

/** Snapshot é dado não confiável, nunca autoridade sobre ownership/contexto. */
export function limparOwnershipSnapshot(input: Record<string, unknown> | undefined, historico?: Record<string, unknown>) {
  const result = { ...input }
  for (const key of ["perfilId", "ownerAdminUserId", "storeId", "userId", "contexto", "contextoAutorizado", "tipoPerfil"]) {
    if (historico && Object.prototype.hasOwnProperty.call(historico, key)) result[key] = historico[key]
    else delete result[key]
  }
  return result
}

export async function comContextoFinanceiro<T>(
  input: unknown,
  fn: (tx: FinanceiroDb, contexto: FinanceiroContextoAutorizado) => Promise<T>,
): Promise<T> {
  // Writers operacionais não carregam NextAuth; o caminho novo exige o módulo G001.
  const { revalidateFinanceiroContexto } = await import("./access")
  const access = await revalidateFinanceiroContexto(input, "edit")
  if (!access.ok) throw new FinanceiroScopeError(access.status)
  const contexto = access.contexto
  return emTransacaoFinanceira(undefined, async (tx) => {
    // Travas compartilhadas mantêm ativo/papel e grants desta gravação até o commit.
    await tx.$queryRaw`SELECT "id" FROM "admin_users" WHERE "id" = ${contexto.userId} FOR SHARE`
    const user = await tx.adminUser.findUnique({ where: { id: contexto.userId }, select: { active: true, role: true } })
    if (!user?.active || !getEnterprisePermissions(user.role).financeiro.edit) throw new FinanceiroScopeError()
    await tx.$queryRaw`SELECT "id" FROM "financeiro_perfis" WHERE "id" = ${contexto.perfilId} FOR SHARE`
    const perfil = await tx.financeiroPerfil.findFirst({ where: {
      id: contexto.perfilId, ativo: true,
      ...(contexto.tipo === "PESSOAL"
        ? { tipo: "PESSOAL", ownerAdminUserId: contexto.userId, storeId: null }
        : { tipo: "EMPRESA", storeId: contexto.storeId }),
    } })
    if (!perfil) throw new FinanceiroScopeError()
    if (contexto.tipo === "EMPRESA") {
      const grants = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT m."id" FROM "financeiro_perfil_membros" m
        JOIN "admin_user_stores" s ON s."adminUserId" = m."adminUserId" AND s."storeId" = m."storeId"
        WHERE m."perfilId" = ${contexto.perfilId} AND m."storeId" = ${contexto.storeId}
          AND m."adminUserId" = ${contexto.userId} AND m."revogadoEm" IS NULL
        FOR SHARE OF m, s`
      if (!grants.length) throw new FinanceiroScopeError()
    }
    return fn(tx, contexto)
  })
}

export function storeDoContexto(ctx: FinanceiroContextoAutorizado) {
  return ctx.tipo === "EMPRESA" ? ctx.storeId : null
}

export async function validarVinculosFinanceiros(
  db: FinanceiroDb,
  ctx: FinanceiroContextoAutorizado,
  refs: { carteiraId?: string | null; categoriaId?: string | null; pagarTituloId?: string | null; receberTituloId?: string | null },
  natureza: "DESPESA" | "RECEITA",
) {
  const storeId = storeDoContexto(ctx)
  if (refs.pagarTituloId && refs.receberTituloId) throw new FinanceiroScopeError(422)
  if (refs.carteiraId) {
    const conta = await db.carteiraFinanceira.findFirst({ where: { id: refs.carteiraId, ativo: true, storeId,
      ...(ctx.tipo === "PESSOAL" ? { perfilId: ctx.perfilId } : { OR: [{ perfilId: ctx.perfilId }, { perfilId: null }] }),
    } })
    if (!conta) throw new FinanceiroScopeError()
    if (!conta.perfilId) await db.carteiraFinanceira.update({ where: { id: conta.id }, data: { perfilId: ctx.perfilId } })
  }
  if (refs.categoriaId && !await db.categoriaGasto.findFirst({ where: {
    id: refs.categoriaId, perfilId: ctx.perfilId, storeId, ativo: true, natureza,
  } })) throw new FinanceiroScopeError()
  for (const kind of ["pagar", "receber"] as const) {
    const id = kind === "pagar" ? refs.pagarTituloId : refs.receberTituloId
    if (!id) continue
    if ((kind === "pagar") !== (natureza === "DESPESA")) throw new FinanceiroScopeError(422)
    const where = { id, ativo: true, storeId, perfilId: ctx.perfilId,
      status: { notIn: ["cancelado", "estornado"] } }
    const row = kind === "pagar" ? await db.contaPagarTitulo.findFirst({ where }) : await db.contaReceberTitulo.findFirst({ where })
    if (!row) throw new FinanceiroScopeError()
  }
}

const id = z.string().trim().min(1).max(191)
const money = z.union([z.string(), z.number()])
const tituloSchema = z.object({
  natureza: z.enum(["PAGAR", "RECEBER"]), chave: id, descricao: z.string().trim().min(1).max(500),
  valorCentavos: money, vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  carteiraId: id.optional(), categoriaId: id.optional(), fornecedorId: id.optional(),
}).strict()

/** Fundação interna; não aplica pagamento, não altera caixa/estoque, não é exposta. */
export async function gravarTituloFinanceiro(contexto: unknown, input: unknown) {
  const parsed = tituloSchema.safeParse(input)
  if (!parsed.success) throw new FinanceiroScopeError(422)
  const p = parsed.data
  const cents = validarCentavos(p.valorCentavos)
  if (cents <= BigInt(0)) throw new FinanceiroScopeError(422)
  const vencimentoEm = new Date(`${p.vencimento}T00:00:00.000Z`)
  if (!Number.isFinite(vencimentoEm.getTime()) || vencimentoEm.toISOString().slice(0, 10) !== p.vencimento) {
    throw new FinanceiroScopeError(422)
  }
  return comContextoFinanceiro(contexto, async (tx, ctx) => {
    await validarVinculosFinanceiros(tx, ctx, p, p.natureza === "PAGAR" ? "DESPESA" : "RECEITA")
    if (p.fornecedorId) {
      if (ctx.tipo !== "EMPRESA" || p.natureza !== "PAGAR"
        || !await tx.fornecedor.findFirst({ where: { id: p.fornecedorId, storeId: ctx.storeId, active: true } })) {
        throw new FinanceiroScopeError()
      }
    }
    const identity = identidadeFinanceira(ctx, p.chave)
    const data = { perfilId: ctx.perfilId, storeId: storeDoContexto(ctx),
      localKey: ctx.tipo === "EMPRESA" ? identity : null,
      identidadePessoal: ctx.tipo === "PESSOAL" ? identity : null,
      descricao: p.descricao, valor: Number(cents) / 100, valorCentavos: cents.toString(),
      precisaoStatus: "CENTAVOS", vencimento: p.vencimento, vencimentoEm,
      carteiraId: p.carteiraId ?? null, categoriaId: p.categoriaId ?? null,
    }
    const where = ctx.tipo === "PESSOAL"
      ? { perfilId_identidadePessoal: { perfilId: ctx.perfilId, identidadePessoal: identity } }
      : { storeId_localKey: { storeId: ctx.storeId, localKey: identity } }
    if (p.natureza === "PAGAR") {
      await tx.contaPagarTitulo.createMany({ data: [{ ...data, fornecedorId: p.fornecedorId ?? null }], skipDuplicates: true })
      const row = await tx.contaPagarTitulo.findUnique({ where })
      if (!row?.ativo || row.valorCentavos?.toString() !== cents.toString() || row.carteiraId !== data.carteiraId
        || row.categoriaId !== data.categoriaId || row.fornecedorId !== (p.fornecedorId ?? null)
        || row.descricao !== p.descricao || row.vencimento !== p.vencimento) throw new FinanceiroScopeError(409)
      return row
    }
    await tx.contaReceberTitulo.createMany({ data: [data], skipDuplicates: true })
    const row = await tx.contaReceberTitulo.findUnique({ where })
    if (!row?.ativo || row.valorCentavos?.toString() !== cents.toString() || row.carteiraId !== data.carteiraId
      || row.categoriaId !== data.categoriaId || row.descricao !== p.descricao || row.vencimento !== p.vencimento) {
      throw new FinanceiroScopeError(409)
    }
    return row
  })
}

const movimentoSchema = z.object({
  tipo: z.enum(["entrada", "saida"]), descricao: z.string().trim().min(1).max(500),
  valorCentavos: money, carteiraId: id, categoriaId: id.optional(), pagarTituloId: id.optional(), receberTituloId: id.optional(),
  formaPagamento: z.enum(["dinheiro", "pix", "debito", "credito", "transferencia", "boleto"]),
  ocorridoEm: z.string().datetime().optional(),
}).strict()

/** Gravação canônica interna; aplicação financeira completa/idempotência é G004. */
export async function criarMovimentoFinanceiro(contexto: unknown, input: unknown) {
  const parsed = movimentoSchema.safeParse(input)
  if (!parsed.success) throw new FinanceiroScopeError(422)
  const p = parsed.data
  const cents = validarCentavos(p.valorCentavos)
  if (cents <= BigInt(0)) throw new FinanceiroScopeError(422)
  return comContextoFinanceiro(contexto, async (tx, ctx) => {
    await validarVinculosFinanceiros(tx, ctx, p, p.tipo === "saida" ? "DESPESA" : "RECEITA")
    return tx.movimentacaoFinanceira.create({ data: {
      ...p, ocorridoEm: p.ocorridoEm ? new Date(p.ocorridoEm) : new Date(),
      valorCentavos: cents.toString(), valor: Number(cents) / 100, precisaoStatus: "CENTAVOS",
      perfilId: ctx.perfilId, storeId: storeDoContexto(ctx), origem: "gastos",
      referenciaId: p.pagarTituloId ?? p.receberTituloId ?? null,
    } })
  })
}
