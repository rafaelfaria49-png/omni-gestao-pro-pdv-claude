/** PostgreSQL descartável G005. Só identidade HTTP/NextAuth é fixture; dinheiro/Prisma são reais. */
import { vi } from "vitest"
import { randomUUID } from "node:crypto"
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Session } from "next-auth"
import { prisma } from "@/lib/prisma"
import { requireFinanceiroPerfilAccess } from "@/lib/gastos/access"
import { prepararRevisaoGasto } from "@/lib/gastos/operacoes"
import { aplicarOperacaoGasto } from "@/lib/gastos/apply"

const sessionState = vi.hoisted(() => ({ current: null as Session | null, store: null as string | null }))
vi.mock("@/auth", () => ({ auth: async () => sessionState.current }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => name === "assistec-active-store" && sessionState.store ? { value: sessionState.store } : undefined }) }))
vi.mock("@/lib/prisma", async () => {
  const url = "postgresql://gastos_g005@127.0.0.1:55506/gastos_g005_test"
  if (process.env.DATABASE_URL !== url || process.env.GASTOS_G005_TEST_DATABASE_URL !== url) throw new Error("G005 recusa destino não identificado")
  const { PrismaClient } = await import("@/generated/prisma")
  const client = new PrismaClient({ datasources: { db: { url } }, log: [] })
  return { prisma: client, prismaEnsureConnected: () => client.$connect() }
})

export const G005_URL = "postgresql://gastos_g005@127.0.0.1:55506/gastos_g005_test"
export const dataGasto = "2026-10-22", dataPagamento = "2026-10-22T15:00:00.000Z"
export async function bancoG005() {
  const [r] = await prisma.$queryRaw<Array<{ db: string; user: string; host: string; port: number; rolsuper: boolean; rolbypassrls: boolean; data: string }>>`
    SELECT current_database() db,current_user AS user,host(inet_server_addr()) host,inet_server_port() port,rolsuper,rolbypassrls,
      current_setting('data_directory') data FROM pg_roles WHERE rolname=current_user`
  if (r.db !== "gastos_g005_test" || r.user !== "gastos_g005" || r.port !== 55506 || r.host !== "127.0.0.1"
    || r.rolsuper || r.rolbypassrls || !r.data.replaceAll("\\", "/").includes("G005-execution/pgdata")) throw new Error("Cluster G005 divergente")
  return r
}
export async function fixtureG005() {
  await bancoG005()
  const id = `g005-${randomUUID()}`, L1 = `${id}-L1`, L2 = `${id}-L2`, U1 = `${id}-U1`, U2 = `${id}-U2`
  const E1 = `${id}-E1`, E2 = `${id}-E2`, P1 = `${id}-P1`, P2 = `${id}-P2`, perfis = [E1, E2, P1, P2]
  await prisma.store.createMany({ data: [L1, L2].map(id => ({ id, name: "Loja sintética G005" })) })
  await prisma.adminUser.createMany({ data: [U1, U2].map(id => ({ id, email: `${id}@example.invalid`, password: "synthetic-only", role: "ADMIN", lojaId: L1 })) })
  await prisma.adminUserStore.createMany({ data: [{ adminUserId: U1, storeId: L1 }, { adminUserId: U1, storeId: L2 }, { adminUserId: U2, storeId: L1 }] })
  await prisma.financeiroPerfil.createMany({ data: [{ id: E1, tipo: "EMPRESA", storeId: L1 }, { id: E2, tipo: "EMPRESA", storeId: L2 },
    { id: P1, tipo: "PESSOAL", ownerAdminUserId: U1 }, { id: P2, tipo: "PESSOAL", ownerAdminUserId: U2 }] })
  await prisma.perfilMembro.createMany({ data: [{ perfilId: E1, storeId: L1, adminUserId: U1 }, { perfilId: E1, storeId: L1, adminUserId: U2 }, { perfilId: E2, storeId: L2, adminUserId: U1 }] })
  for (const perfilId of perfis) await prisma.carteiraFinanceira.create({ data: { id: `${perfilId}-C`, perfilId,
    storeId: perfilId === E1 ? L1 : perfilId === E2 ? L2 : null, nome: "Conta sintética", tipo: "banco",
    saldoInicial: 1000, saldoAtual: 1000, saldoInicialCentavos: "100000", saldoAtualCentavos: "100000", precisaoStatus: "CENTAVOS" } })
  const login = (userId = U1, allowedStoreIds = [L1, L2]) => {
    sessionState.store = allowedStoreIds[0] ?? null
    sessionState.current = { expires: "2099-01-01", user: { id: userId, role: "ADMIN", name: "Synthetic G005",
      storeAccess: "restricted", allowedStoreIds, lojaId: allowedStoreIds[0] } }
  }
  const contexto = async (perfilId = E1) => {
    const storeId = perfilId === E1 ? L1 : perfilId === E2 ? L2 : null
    const r = await requireFinanceiroPerfilAccess(storeId ? { tipo: "EMPRESA", perfilId, storeId } : { tipo: "PESSOAL", perfilId }, "edit")
    if (!r.ok) throw new Error("Contexto G005 negado")
    return r.contexto
  }
  login()
  return { id, L1, L2, U1, U2, E1, E2, P1, P2, perfis, login, contexto, conta: (perfilId = E1) => `${perfilId}-C` }
}
export type FixtureG005 = Awaited<ReturnType<typeof fixtureG005>>
export const pagoG005 = (f: FixtureG005, patch: Record<string, unknown> = {}) => ({ tipo: "GASTO_PAGO", descricao: "Gasto sintético",
  dataGasto, valorCentavos: "4000", carteiraId: f.conta(), formaPagamento: "pix", dataPagamento, ...patch })
export async function aplicarG005(f: FixtureG005, proposta: unknown, chave: string = randomUUID(), perfilId = f.E1) {
  const ctx = await f.contexto(perfilId), r = await prepararRevisaoGasto(ctx, { grupoChave: `grupo-${chave}`, proposta })
  const command = { revisaoId: r.id, versaoEsperada: r.versao, chave }
  return { ctx, revisao: r, command, resultado: await aplicarOperacaoGasto(ctx, command) }
}
export async function estadoG005(f: FixtureG005) {
  const where = { perfilId: { in: f.perfis } }, orderBy = { id: "asc" as const }
  const rows = await Promise.all([prisma.financeiroPerfil.findMany({ where: { id: { in: f.perfis } }, orderBy }),
    prisma.gastoRevisao.findMany({ where, orderBy }), prisma.financeiroOperacao.findMany({ where, orderBy }),
    prisma.gasto.findMany({ where, orderBy }), prisma.contaPagarTitulo.findMany({ where, orderBy }),
    prisma.pagamentoFinanceiro.findMany({ where, orderBy }), prisma.alocacaoPagamento.findMany({ where, orderBy }),
    prisma.movimentacaoFinanceira.findMany({ where, orderBy }), prisma.carteiraFinanceira.findMany({ where, orderBy }),
    prisma.financeiroOperacaoEvento.findMany({ where, orderBy }), prisma.gastoOutbox.findMany({ where, orderBy }),
    prisma.documentoVinculo.findMany({ where, orderBy })])
  return JSON.stringify(rows)
}
export const requestG005 = (body: unknown, storeId: string, path = "/api/financeiro/pagar/operacoes", method = "POST") => new Request(`http://localhost${path}`, {
  method, headers: { "content-type": "application/json", "x-assistec-loja-id": storeId }, body: JSON.stringify(body),
})

export function provaG005(nome: string, valor: unknown) {
  const destino = process.env.G005_EVIDENCE_DIR
  if (!destino) return
  if (!/^[a-z0-9-]+$/.test(nome) || !resolve(destino).replaceAll("\\", "/").endsWith("/G005-execution")) throw new Error("Destino de prova inválido")
  writeFileSync(resolve(destino, nome + ".json"), JSON.stringify(valor, null, 2))
}
