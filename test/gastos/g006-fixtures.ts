/** PostgreSQL G006 exclusivo. Auth de browser só nas fixtures que chamam G004 real.
 * O worker não recebe essa sessão. Binding/Meta são ports sintéticos explícitos.
 */
import { modulosSinteticos } from "@/test/gastos/sessao-modulos"
import { vi } from "vitest"
import { randomUUID } from "node:crypto"
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Session } from "next-auth"
import { PrismaClient } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { requireFinanceiroPerfilAccess } from "@/lib/gastos/access"
import { prepararRevisaoGasto } from "@/lib/gastos/operacoes"
import { aplicarOperacaoGasto } from "@/lib/gastos/apply"
import { configurarCanal, persistirIngresso, registrarCanal } from "@/lib/gastos/channels"
import { registrarOrigemCanal } from "@/lib/gastos/outbox"
import type { VerificadorVinculo } from "@/lib/gastos/messaging-types"

const sessionState = vi.hoisted(() => ({ current: null as Session | null }))
vi.mock("@/auth", () => ({ auth: async () => sessionState.current }))
vi.mock("@/lib/prisma", async () => {
  const url = "postgresql://gastos_g006_owner@127.0.0.1:55516/gastos_g006_test"
  if (process.env.DATABASE_URL !== url || process.env.GASTOS_G006_TEST_DATABASE_URL !== url) throw Error("Destino G006 nao identificado")
  const { PrismaClient } = await import("@/generated/prisma")
  const client = new PrismaClient({ datasources: { db: { url } }, log: [] })
  return { prisma: client, prismaEnsureConnected: () => client.$connect() }
})

export const G006_URL = "postgresql://gastos_g006_owner@127.0.0.1:55516/gastos_g006_test"
export const habilitadoG006 = !!process.env.GASTOS_G006_TEST_DATABASE_URL
export const owner = prisma
export const conexao = (role: string, database = "gastos_g006_test") => new PrismaClient({ datasources: { db: {
  url: `postgresql://${role}@127.0.0.1:55516/${database}?connection_limit=1` } }, log: [] })
export const worker = conexao("omni_gastos_worker"), ingress = conexao("omni_gastos_ingress"), operator = conexao("omni_gastos_operator")

export async function bancoG006() {
  if (process.env.GASTOS_G006_TEST_DATABASE_URL !== G006_URL || process.env.DATABASE_URL !== G006_URL) throw Error("G006 recusa banco externo")
  const [r] = await owner.$queryRaw<Array<{ db: string; user: string; host: string; port: number; data: string }>>`SELECT current_database() db,
    current_user AS user,host(inet_server_addr()) host,inet_server_port() port,current_setting('data_directory') data`
  if (r.db !== "gastos_g006_test" || r.user !== "gastos_g006_owner" || r.host !== "127.0.0.1" || r.port !== 55516
    || !r.data.replaceAll("\\", "/").endsWith("G006-execution/pgdata")) throw Error("Identidade fisica G006 divergente")
  return r
}

/** Retira apenas jobs sintéticos anteriores deste cluster para claim global determinístico.
 * Nenhum histórico apagado; fatos financeiros intocados.
 */
export async function estacionarFilaDeTeste() {
  await bancoG006()
  await owner.$executeRaw`UPDATE gastos_jobs SET estado=CASE WHEN "envioEstado"='INICIADO' THEN 'ENVIO_INCERTO' ELSE 'ESTACIONADO' END,
    "envioEstado"=CASE WHEN "envioEstado"='INICIADO' THEN 'ENVIO_INCERTO' ELSE "envioEstado" END,
    "falhaCodigo"='REVISAO_TECNICA',"leaseOwner"=NULL,"leaseToken"=NULL,"leaseUntil"=NULL
    WHERE estado IN ('PRONTO','RETENTAVEL','PROCESSANDO')`
}

export async function fixtureG006(papel: "GESTAO" | "ATENDIMENTO" = "GESTAO") {
  await bancoG006()
  const id = `g006-${randomUUID()}`, L1 = `${id}-L1`, L2 = `${id}-L2`, U1 = `${id}-U1`, U2 = `${id}-U2`
  const E1 = `${id}-E1`, E2 = `${id}-E2`, P1 = `${id}-P1`, P2 = `${id}-P2`
  await owner.store.createMany({ data: [L1, L2].map(id => ({ id, name: "Loja sintetica G006" })) })
  await owner.adminUser.createMany({ data: [U1, U2].map(id => ({ id, email: `${id}@example.invalid`, password: "synthetic-only", role: "ADMIN", lojaId: L1 })) })
  await owner.adminUserStore.createMany({ data: [{ adminUserId: U1, storeId: L1 }, { adminUserId: U1, storeId: L2 }, { adminUserId: U2, storeId: L1 }] })
  await owner.financeiroPerfil.createMany({ data: [{ id: E1, tipo: "EMPRESA", storeId: L1 }, { id: E2, tipo: "EMPRESA", storeId: L2 },
    { id: P1, tipo: "PESSOAL", ownerAdminUserId: U1 }, { id: P2, tipo: "PESSOAL", ownerAdminUserId: U2 }] })
  await owner.perfilMembro.createMany({ data: [{ perfilId: E1, storeId: L1, adminUserId: U1 }, { perfilId: E2, storeId: L2, adminUserId: U1 }] })
  for (const perfilId of [E1, E2, P1, P2]) await owner.carteiraFinanceira.create({ data: { id: `${perfilId}-C`, perfilId,
    storeId: perfilId === E1 ? L1 : perfilId === E2 ? L2 : null, nome: "Conta sintetica", tipo: "banco", saldoInicial: 1000,
    saldoAtual: 1000, saldoInicialCentavos: "100000", saldoAtualCentavos: "100000", precisaoStatus: "CENTAVOS" } })
  const n = (BigInt("0x" + randomUUID().replaceAll("-", "").slice(0, 12)) % BigInt("100000000000000")).toString()
  const canalBase = await registrarCanal(operator, { phoneNumberId: "900" + n, wabaId: "900006", appId: "910006",
    telefoneE164: "+1" + n.padStart(14, "0"), papel, storeId: papel === "GESTAO" ? null : L1, credencialRef: "WHATSAPP_CANAL_TOKEN_G006_SYNTHETIC" })
  const canal = await configurarCanal(operator, canalBase.canalId, 1, true)
  const binding = { userId: U1, bindingRef: `fixture-${randomUUID()}`, versao: 1, revogado: false }
  const remetenteE164 = "+15550060001"
  const verificar: VerificadorVinculo = async input => input.canalId === canal.canalId && input.phoneNumberId === canal.phoneNumberId
    && input.remetenteE164 === remetenteE164 && !binding.revogado ? { userId: binding.userId, bindingRef: binding.bindingRef, versao: binding.versao } : null
  const envelope = (patch: Record<string, unknown> = {}) => ({ provedor: "META", canalId: canal.canalId, phoneNumberId: canal.phoneNumberId,
    wabaId: canal.wabaId, appId: canal.appId, externalMessageId: `wamid.${randomUUID()}`, remetenteE164, correlacaoId: randomUUID(),
    ocorridoEm: "2026-10-25T15:00:00.000Z", conteudo: { tipo: "texto", texto: "Conteudo privado sintetico G006" }, ...patch })
  const login = (userId = U1) => { sessionState.current = { expires: "2099-01-01", user: { id: userId, role: "ADMIN", name: "Fixture G006",
    lojaId: L1, storeAccess: "restricted", allowedStoreIds: [L1, L2], storeModules: modulosSinteticos([L1, L2]) } } }
  const contexto = async (perfilId = E1) => {
    const r = await requireFinanceiroPerfilAccess(perfilId === E1 || perfilId === E2
      ? { tipo: "EMPRESA", perfilId, storeId: perfilId === E1 ? L1 : L2 } : { tipo: "PESSOAL", perfilId }, "edit")
    if (!r.ok) throw Error("Contexto sintetico G006 recusado")
    return r.contexto
  }
  login()
  return { id, L1, L2, U1, U2, E1, E2, P1, P2, canal, binding, verificar, remetenteE164, envelope, login, contexto }
}
export type FixtureG006 = Awaited<ReturnType<typeof fixtureG006>>

export async function prepararFinanceiroG006(f: FixtureG006, perfilId = f.E1, ordem: "ORIGEM_ANTES" | "ORIGEM_DEPOIS" = "ORIGEM_ANTES") {
  const ctx = await f.contexto(perfilId), grupoChave = `g006-grupo-${randomUUID()}`
  const revisao = await prepararRevisaoGasto(ctx, { grupoChave, proposta: { tipo: "GASTO_PAGO", descricao: "Fato sintetico real G004",
    dataGasto: "2026-10-25", valorCentavos: "4000", carteiraId: `${perfilId}-C`, formaPagamento: "pix", dataPagamento: "2026-10-25T15:00:00.000Z" } })
  const command = { revisaoId: revisao.id, versaoEsperada: revisao.versao, chave: randomUUID() }
  if (ordem === "ORIGEM_DEPOIS") await aplicarOperacaoGasto(ctx, command)
  const entrada = await persistirIngresso(ingress, f.envelope())
  const origem = await registrarOrigemCanal(worker, { inboxId: entrada.inboxId, perfilId, storeId: perfilId === f.E1 ? f.L1 : perfilId === f.E2 ? f.L2 : null, grupoChave }, f.verificar)
  return { ctx, revisao, entrada, origem, command, aplicar: () => aplicarOperacaoGasto(ctx, command) }
}

export async function dinheiroG006(f: FixtureG006) {
  const perfis = [f.E1, f.E2, f.P1, f.P2], where = { perfilId: { in: perfis } }, orderBy = { id: "asc" as const }
  return JSON.stringify(await Promise.all([owner.financeiroOperacao.findMany({ where, orderBy }), owner.gasto.findMany({ where, orderBy }),
    owner.pagamentoFinanceiro.findMany({ where, orderBy }), owner.movimentacaoFinanceira.findMany({ where, orderBy }),
    owner.carteiraFinanceira.findMany({ where, orderBy }), owner.contaPagarTitulo.findMany({ where, orderBy }), owner.gastoOutbox.findMany({ where, orderBy })]))
}
export async function encerrarG006() { await Promise.all([owner.$disconnect(), worker.$disconnect(), ingress.$disconnect(), operator.$disconnect()]) }
export function provaG006(nome: string, dados: unknown) {
  const dir = process.env.G006_EVIDENCE_DIR
  if (!dir) return
  if (!/^[a-z0-9-]+$/.test(nome) || !resolve(dir).replaceAll("\\", "/").endsWith("/G006-execution")) throw Error("Destino de evidencia invalido")
  writeFileSync(resolve(dir, nome + ".json"), JSON.stringify(dados, null, 2))
}
