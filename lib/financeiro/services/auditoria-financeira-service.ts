/**
 * Auditoria Financeira — log append-only de operações no módulo financeiro.
 *
 * INVARIANTES:
 *  - Nunca lança exceção para o caller — falha silenciosa (não bloqueia fluxo principal)
 *  - Registros são imutáveis: nunca update/delete
 *  - `antes` e `depois` são JSON snapshots opcionais
 */

import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma"
import { deslocarDiaConsulta, inicioDiaConsulta } from "@/lib/gastos/query-calculo"

// ─── tipos públicos ───────────────────────────────────────────────────────────

export type EntidadeAuditoria =
  | "movimentacao"
  | "receber"
  | "pagar"
  | "carteira"
  | "dre"
  | "fechamento"
  | "conciliacao"
  | "os"

export type AcaoAuditoria =
  | "criar"
  | "editar"
  | "excluir"
  | "liquidar"
  | "estornar"
  | "fechar"
  | "reabrir"
  | "conciliar"
  | "transferir"
  | "cancelar"

export type RegistrarAuditoriaInput = {
  storeId: string
  entidade: EntidadeAuditoria
  entidadeId?: string
  acao: AcaoAuditoria
  antes?: unknown
  depois?: unknown
  usuarioId?: string
  usuarioNome?: string
  ip?: string
  userAgent?: string
}

export type AuditoriaPublica = {
  id: string
  storeId: string
  entidade: string
  entidadeId: string | null
  acao: string
  antes: unknown
  depois: unknown
  usuarioId: string | null
  usuarioNome: string | null
  ip: string | null
  createdAt: string
}

export type ListarAuditoriaFilters = {
  entidade?: EntidadeAuditoria
  entidadeId?: string
  acao?: AcaoAuditoria
  dataInicial?: string
  dataFinal?: string
  take?: number
  skip?: number
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Auditoria comum contém metadados técnicos; anexos, texto livre e payload privado ficam na origem.
 * O financeiro pessoal e seus documentos usam somente trilha privada no próprio domínio.
 */
function snapshotTecnico(value: unknown): Prisma.InputJsonObject | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (record.ownerAdminUserId || record.tipo === "PESSOAL" || record.tipoPerfil === "PESSOAL") return undefined
  const result: Prisma.InputJsonObject = Object.fromEntries(
    ["status", "tipo", "origem", "valor", "saldoInicial", "saldoAtual", "saldoSistema", "saldoInformado", "diferenca", "acao"]
      .flatMap(key => {
        const v = record[key]
        return typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)) ? [[key, v]] : []
      }),
  )
  return result
}

function toPublica(row: {
  id: string
  storeId: string
  entidade: string
  entidadeId: string | null
  acao: string
  antes: Prisma.JsonValue
  depois: Prisma.JsonValue
  usuarioId: string | null
  usuarioNome: string | null
  ip: string | null
  createdAt: Date
}): AuditoriaPublica {
  return {
    id: row.id,
    storeId: row.storeId,
    entidade: row.entidade,
    entidadeId: row.entidadeId,
    acao: row.acao,
    antes: snapshotTecnico(row.antes) ?? null,
    depois: snapshotTecnico(row.depois) ?? null,
    usuarioId: row.usuarioId,
    usuarioNome: row.usuarioNome,
    ip: row.ip,
    createdAt: row.createdAt.toISOString(),
  }
}

// ─── registrarAuditoriaFinanceira ─────────────────────────────────────────────
/**
 * Registra um evento de auditoria. Nunca lança — falha silenciosa.
 */
export async function registrarAuditoriaFinanceira(
  input: RegistrarAuditoriaInput,
): Promise<void> {
  try {
    await prisma.auditoriaFinanceira.create({
      data: {
        storeId: input.storeId,
        entidade: input.entidade,
        entidadeId: input.entidadeId ?? null,
        acao: input.acao,
        antes: snapshotTecnico(input.antes),
        depois: snapshotTecnico(input.depois),
        usuarioId: input.usuarioId ?? null,
        usuarioNome: input.usuarioNome ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    })
  } catch {
    console.warn("[auditoria] Falha técnica ao registrar evento financeiro.")
  }
}

// ─── listarAuditoriaFinanceira ────────────────────────────────────────────────

/** Aliases fixos do SQL interno; nunca recebem nomes/SQL do request. */
function empresaAuditada(alias: "e" | "c", storeId: string): Prisma.Sql {
  const tabela = Prisma.raw(`"${alias}"`)
  return Prisma.sql`COALESCE((${tabela}."storeId" = ${storeId} AND
    (${tabela}."perfilId" IS NULL OR EXISTS (
      SELECT 1 FROM financeiro_perfis fp WHERE fp.id=${tabela}."perfilId"
        AND fp.tipo='EMPRESA' AND fp."storeId"=${storeId}
    ))), FALSE)`
}

/** Auditoria é polimórfica e seu FK histórico não garante o scope da entidade.
 * O join fica no banco: nenhum ID ou valor estrangeiro é carregado para filtrar no JS.
 * Eventos de entidades já excluídas preservam metadados, sem referência/snapshot.
 */
async function consultarAuditoriaEmpresa(
  storeId: string, filters: ListarAuditoriaFilters, limite: number,
): Promise<{ items: AuditoriaPublica[]; total: number }> {
  if (!storeId.trim()) throw new Error("Loja obrigatória")
  const take = Math.min(filters.take ?? 50, limite), skip = filters.skip ?? 0
  if (!Number.isInteger(take) || take < 0 || !Number.isInteger(skip) || skip < 0) throw new Error("Paginação inválida")
  const fonte = Prisma.sql`
    SELECT TRUE AS existe, ${empresaAuditada("e", storeId)} AS empresa
      FROM contas_pagar_titulos e WHERE a.entidade='pagar' AND e.id=a."entidadeId"
    UNION ALL SELECT TRUE, ${empresaAuditada("e", storeId)}
      FROM contas_receber_titulos e WHERE a.entidade='receber' AND e.id=a."entidadeId"
    UNION ALL SELECT TRUE, ${empresaAuditada("e", storeId)}
      FROM movimentacoes_financeiras e WHERE a.entidade='movimentacao' AND e.id=a."entidadeId"
    UNION ALL SELECT TRUE, ${empresaAuditada("e", storeId)}
      FROM carteiras_financeiras e WHERE a.entidade='carteira' AND e.id=a."entidadeId"
    UNION ALL SELECT TRUE, (e."storeId"=${storeId} AND ${empresaAuditada("c", storeId)})
      FROM conciliacoes_financeiras e JOIN carteiras_financeiras c ON c.id=e."carteiraId"
      WHERE a.entidade='conciliacao' AND e.id=a."entidadeId"
    UNION ALL SELECT TRUE, e."storeId"=${storeId}
      FROM fechamentos_financeiros e WHERE a.entidade='fechamento' AND e.id=a."entidadeId"
    UNION ALL SELECT TRUE, e."storeId"=${storeId}
      FROM ordens_servico e WHERE a.entidade='os' AND e.id=a."entidadeId"`
  const from = Prisma.sql`FROM auditorias_financeiras a LEFT JOIN LATERAL (${fonte}) ref ON TRUE`
  const mostrarOrigem = Prisma.sql`ref.existe IS TRUE`
  const predicates: Prisma.Sql[] = [Prisma.sql`a."storeId"=${storeId}`, Prisma.sql`COALESCE(ref.empresa, TRUE)`,
    Prisma.sql`COALESCE(a.antes->>'ownerAdminUserId','')='' AND COALESCE(a.depois->>'ownerAdminUserId','')=''`,
    Prisma.sql`COALESCE(a.antes->>'tipo','')<>'PESSOAL' AND COALESCE(a.depois->>'tipo','')<>'PESSOAL'`,
    Prisma.sql`COALESCE(a.antes->>'tipoPerfil','')<>'PESSOAL' AND COALESCE(a.depois->>'tipoPerfil','')<>'PESSOAL'`,
    Prisma.sql`NOT EXISTS (SELECT 1 FROM financeiro_perfis pf
      WHERE pf.id IN (a.antes->>'perfilId', a.depois->>'perfilId')
        AND (pf.tipo<>'EMPRESA' OR pf."storeId" IS DISTINCT FROM ${storeId}))`,
  ]
  if (filters.entidade) predicates.push(Prisma.sql`a.entidade=${filters.entidade}`)
  if (filters.entidadeId) predicates.push(Prisma.sql`a."entidadeId"=${filters.entidadeId} AND ${mostrarOrigem}`)
  if (filters.acao) predicates.push(Prisma.sql`a.acao=${filters.acao}`)
  if (filters.dataInicial) {
    const inicio = /^\d{4}-\d{2}-\d{2}$/.test(filters.dataInicial)
      ? inicioDiaConsulta(filters.dataInicial)
      : new Date(filters.dataInicial)
    predicates.push(Prisma.sql`a."createdAt">=${inicio}`)
  }
  if (filters.dataFinal) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(filters.dataFinal)) {
      const fimExclusivo = inicioDiaConsulta(deslocarDiaConsulta(filters.dataFinal, 1))
      predicates.push(Prisma.sql`a."createdAt"<${fimExclusivo}`)
    } else {
      predicates.push(Prisma.sql`a."createdAt"<=${new Date(filters.dataFinal)}`)
    }
  }
  const where = Prisma.sql`WHERE ${Prisma.join(predicates, " AND ")}`
  const [rows, counts] = await Promise.all([
    prisma.$queryRaw<Array<Parameters<typeof toPublica>[0]>>(Prisma.sql`
      SELECT a.id, a."storeId", a.entidade, a.acao,
        CASE WHEN ${mostrarOrigem} THEN a."entidadeId" ELSE NULL END AS "entidadeId",
        CASE WHEN ${mostrarOrigem} THEN a.antes ELSE NULL END AS antes,
        CASE WHEN ${mostrarOrigem} THEN a.depois ELSE NULL END AS depois,
        a."usuarioId", a."usuarioNome", a.ip, a."createdAt"
      ${from} ${where} ORDER BY a."createdAt" DESC, a.id DESC LIMIT ${take} OFFSET ${skip}`),
    prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`SELECT count(*)::int AS total ${from} ${where}`),
  ])
  return { items: rows.map(toPublica), total: counts[0]?.total ?? 0 }
}

export async function listarAuditoriaFinanceira(
  storeId: string,
  filters: ListarAuditoriaFilters = {},
): Promise<{ items: AuditoriaPublica[]; total: number }> {
  return consultarAuditoriaEmpresa(storeId, filters, 200)
}

/** Mesmo predicado da lista/detalhe, com o teto de exportação já existente. */
export async function listarAuditoriaFinanceiraParaExportacao(storeId: string, dataInicial: string, dataFinal: string) {
  return (await consultarAuditoriaEmpresa(storeId, { dataInicial, dataFinal, take: 5000 }, 5000)).items
}

// ─── getAuditoriaPorEntidade ──────────────────────────────────────────────────

export async function getAuditoriaPorEntidade(
  storeId: string,
  entidade: EntidadeAuditoria,
  entidadeId: string,
): Promise<AuditoriaPublica[]> {
  return (await consultarAuditoriaEmpresa(storeId, { entidade, entidadeId, take: 100 }, 100)).items
}
