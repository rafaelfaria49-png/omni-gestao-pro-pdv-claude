/**
 * PostgreSQL DESCARTÁVEL do assistente (G007/G008). Nenhuma sessão de navegador: `@/auth` devolve null
 * em TODOS os testes — o chat só funciona pelo principal de vínculo. Meta é transporte SIMULADO.
 * Identidade física exigida: 127.0.0.1:55530, banco gastos_g006_test (exigido pelo config do worker G006 em ambiente teste), dono gm_g007_owner, PGDATA …/G007-execution/pgdata.
 */
import { vi } from "vitest"
import { createHash, createHmac, randomUUID } from "node:crypto"
import { PrismaClient } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { configurarCanal, registrarCanal } from "@/lib/gastos/channels"
import { rodarWorker, type ConfigWorker } from "@/lib/gastos/worker"
import { cicloGestao, processadorStagingGestao, verificadorVinculoG006, type DependenciasGateway } from "@/lib/gestor-money-assistente/whatsapp/gateway"
import { transporteResultadoG006, transporteSimulado } from "@/lib/gestor-money-assistente/whatsapp/transporte"
import { processarWebhookGestao } from "@/lib/gestor-money-assistente/whatsapp/webhook"
import { CONSENTIMENTO_VERSAO_ATUAL, iniciarPareamento } from "@/lib/gestor-money-assistente/whatsapp/vinculo"

vi.mock("@/auth", () => ({ auth: async () => null }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }))
vi.mock("@/lib/prisma", async () => {
  const url = "postgresql://gm_g007_owner@127.0.0.1:55530/gastos_g006_test"
  if (process.env.DATABASE_URL !== url || process.env.GASTOS_G007_TEST_DATABASE_URL !== url) throw Error("G007 recusa destino nao identificado")
  const { PrismaClient } = await import("@/generated/prisma")
  const client = new PrismaClient({ datasources: { db: { url } }, log: [] })
  return { prisma: client, prismaEnsureConnected: () => client.$connect() }
})

export const G007_URL = "postgresql://gm_g007_owner@127.0.0.1:55530/gastos_g006_test"
export const habilitadoG007 = process.env.GASTOS_G007_TEST_DATABASE_URL === G007_URL
export const owner = prisma
const conexao = (role: string) => new PrismaClient({ datasources: { db: { url: `postgresql://${role}@127.0.0.1:55530/gastos_g006_test?connection_limit=4` } }, log: [] })
export const worker = conexao("omni_gastos_worker"), ingress = conexao("omni_gastos_ingress"), operator = conexao("omni_gastos_operator")
export const SEGREDO = "segredo-sintetico-app-gestao"
export const ENV = { GESTOR_MONEY_ENABLED: "true", GESTOR_MONEY_WHATSAPP_GESTAO: "ligado", GESTOR_MONEY_WHATSAPP_APP_SECRET: SEGREDO,
  WHATSAPP_CANAL_TOKEN_G007_SYNTHETIC: "synthetic-only-token" }
export const CONFIG: ConfigWorker = { ambiente: "teste", databaseUrl: "postgresql://omni_gastos_worker@127.0.0.1:55530/gastos_g006_test",
  modo: "SIMULADO", concorrencia: 2, leaseMs: 30_000, pollMs: 100, envioTimeoutMs: 5000, shutdownMs: 10_000 }

export async function bancoG007() {
  if (!habilitadoG007 || process.env.DATABASE_URL !== G007_URL) throw Error("G007 recusa banco externo")
  const [r] = await owner.$queryRaw<Array<{ db: string; user: string; host: string; port: number; data: string; sup: boolean; byp: boolean }>>`
    SELECT current_database() db,current_user AS user,host(inet_server_addr()) host,inet_server_port() port,current_setting('data_directory') data,
      rolsuper sup,rolbypassrls byp FROM pg_roles WHERE rolname=current_user`
  if (r.db !== "gastos_g006_test" || r.user !== "gm_g007_owner" || r.host !== "127.0.0.1" || r.port !== 55530 || r.sup || r.byp
    || !r.data.replaceAll("\\", "/").endsWith("G007-execution/pgdata")) throw Error("Identidade fisica G007 divergente")
}

const MODULOS = { version: 1, modules: ["home", "pdv", "sales", "cash", "catalog", "stock", "reports", "settings", "finance"] }
const SEM_FINANCE = { version: 1, modules: ["home", "pdv", "sales"] }
const tel = () => "+5511" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0")

/** Cenário: U1 (pessoal + 2 empresas), U2 (pessoal), canal GESTAO ativo, telefones distintos. */
export async function cenarioG007() {
  await bancoG007()
  const id = `g007-${randomUUID().slice(0, 8)}`
  const L1 = `${id}-L1`, L2 = `${id}-L2`, L3 = `${id}-L3`, U1 = `${id}-U1`, U2 = `${id}-U2`
  const P1 = `${id}-P1`, P2 = `${id}-P2`, E1 = `${id}-E1`, E2 = `${id}-E2`, E3 = `${id}-E3`
  await owner.store.createMany({ data: [{ id: L1, name: "Loja Centro", moduleAccess: MODULOS }, { id: L2, name: "Loja Norte", moduleAccess: MODULOS },
    { id: L3, name: "Loja Sem Financeiro", moduleAccess: SEM_FINANCE }] })
  await owner.adminUser.createMany({ data: [U1, U2].map(u => ({ id: u, email: `${u}@example.invalid`, password: "synthetic-only", role: "ADMIN", lojaId: L1 })) })
  await owner.adminUserStore.createMany({ data: [{ adminUserId: U1, storeId: L1 }, { adminUserId: U1, storeId: L2 }, { adminUserId: U1, storeId: L3 },
    { adminUserId: U2, storeId: L1 }] })
  await owner.financeiroPerfil.createMany({ data: [{ id: P1, tipo: "PESSOAL", ownerAdminUserId: U1 }, { id: P2, tipo: "PESSOAL", ownerAdminUserId: U2 },
    { id: E1, tipo: "EMPRESA", storeId: L1 }, { id: E2, tipo: "EMPRESA", storeId: L2 }, { id: E3, tipo: "EMPRESA", storeId: L3 }] })
  await owner.perfilMembro.createMany({ data: [{ perfilId: E1, storeId: L1, adminUserId: U1 }, { perfilId: E2, storeId: L2, adminUserId: U1 },
    { perfilId: E3, storeId: L3, adminUserId: U1 }] })
  const contas: Array<[string, string, string, string | null, string, string]> = [
    [`${P1}-NU`, P1, "Nubank", null, "banco", "200000"], [`${P1}-CA`, P1, "Carteira", null, "dinheiro", "20000"],
    [`${P2}-IN`, P2, "Inter", null, "banco", "90000"], [`${E1}-IT`, E1, "Itaú PJ", L1, "banco", "500000"],
    [`${E2}-BR`, E2, "Bradesco PJ", L2, "banco", "300000"], [`${E3}-SI`, E3, "Sicoob PJ", L3, "banco", "100000"]]
  for (const [cid, perfilId, nome, storeId, tipo, saldo] of contas) await owner.carteiraFinanceira.create({ data: { id: cid, perfilId, storeId, nome, tipo,
    saldoInicial: Number(saldo) / 100, saldoAtual: Number(saldo) / 100, saldoInicialCentavos: saldo, saldoAtualCentavos: saldo, precisaoStatus: "CENTAVOS" } })
  const n = (BigInt("0x" + randomUUID().replaceAll("-", "").slice(0, 12)) % BigInt("100000000000000")).toString()
  const base = await registrarCanal(operator, { phoneNumberId: "700" + n, wabaId: "700007", appId: "710007", telefoneE164: "+1" + n.padStart(14, "0"),
    papel: "GESTAO", storeId: null, credencialRef: "WHATSAPP_CANAL_TOKEN_G007_SYNTHETIC" })
  const canal = await configurarCanal(operator, base.canalId, 1, true)
  const T1 = tel(), T2 = tel(), T3 = tel()
  const sim = transporteSimulado()
  return { id, L1, L2, L3, U1, U2, P1, P2, E1, E2, E3, canal, T1, T2, T3, sim }
}
export type CenarioG007 = Awaited<ReturnType<typeof cenarioG007>>

export type ExtraMensagemMeta = {
  wamid?: string
  contexto?: string
  tipo?: string
  audio?: { id: string; mime_type?: string; voice?: boolean }
  image?: { id: string; mime_type?: string; caption?: string }
  document?: { id: string; mime_type?: string; filename?: string; caption?: string }
}

/** Corpo Meta assinado com o App Secret de gestão, como a Meta envia. */
export function corpoMeta(c: CenarioG007, de: string, texto: string, extra: ExtraMensagemMeta = {}) {
  const wamid = extra.wamid ?? `wamid.${randomUUID()}`
  const tipo = extra.tipo ?? (extra.audio ? "audio" : extra.image ? "image" : extra.document ? "document" : "text")
  const mensagem: Record<string, unknown> = { id: wamid, from: de.slice(1), timestamp: String(Math.floor(Date.now() / 1000)), type: tipo }
  if (tipo === "text") mensagem.text = { body: texto }
  if (tipo === "audio" && extra.audio) mensagem.audio = extra.audio
  if (tipo === "image" && extra.image) mensagem.image = extra.image
  if (tipo === "document" && extra.document) mensagem.document = extra.document
  if (extra.contexto) mensagem.context = { id: extra.contexto }
  const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: c.canal.wabaId, changes: [{ field: "messages",
    value: { messaging_product: "whatsapp", metadata: { phone_number_id: c.canal.phoneNumberId }, messages: [mensagem] } }] }] })
  return { raw, assinatura: "sha256=" + createHmac("sha256", SEGREDO).update(raw, "utf8").digest("hex"), wamid }
}

export async function receber(c: CenarioG007, de: string, texto: string, extra: ExtraMensagemMeta = {}) {
  const corpo = corpoMeta(c, de, texto, extra)
  const r = await processarWebhookGestao({ rawBody: corpo.raw, assinatura: corpo.assinatura, env: ENV, ingress })
  if (r.status !== 200) throw Error(`webhook ${r.status}`)
  return corpo.wamid
}

/** Ciclos do worker OFICIAL G006 (`rodarWorker`) com o gancho G008, até esvaziar fila e respostas. */
export async function drenar(c: CenarioG007, d: DependenciasGateway = {}, ciclos = 8) {
  const ac = new AbortController()
  for (let i = 0; i < ciclos; i++) {
    await rodarWorker(worker, CONFIG, { signal: ac.signal, once: true, staging: processadorStagingGestao(d),
      aposCiclo: cicloGestao(worker, c.sim, ENV, d),
      envio: { verificarVinculo: verificadorVinculoG006(), transporte: transporteResultadoG006(c.sim), env: ENV } })
    const [p] = await owner.$queryRaw<Array<{ n: number }>>`SELECT (SELECT count(*) FROM gastos_jobs WHERE estado IN ('PRONTO','RETENTAVEL')
      AND "runAfter"<=clock_timestamp())::int + (SELECT count(*) FROM gm_assist_respostas WHERE estado='PENDENTE' AND "runAfter"<=clock_timestamp())::int
      + (SELECT count(*) FROM gastos_outbox o WHERE NOT EXISTS(SELECT 1 FROM gastos_jobs j WHERE j."outboxId"=o.id)
        AND EXISTS(SELECT 1 FROM financeiro_operacoes op JOIN gastos_origens_canal r ON r."grupoChave"=op."grupoChave" AND r."perfilId"=op."perfilId"
          WHERE op.id=o."operacaoId"))::int AS n`
    if (p.n === 0) return
  }
}

/** Textos entregues (simulados) a um telefone desde a última leitura. */
export function leitor(c: CenarioG007) {
  const vistos = new Map<string, number>()
  return (para: string) => {
    const todos = c.sim.enviados.filter(e => e.para === para)
    const desde = vistos.get(para) ?? 0
    vistos.set(para, todos.length)
    return todos.slice(desde)
  }
}

export async function parear(c: CenarioG007, userId: string, telefone: string) {
  const d = await iniciarPareamento(owner, { userId, telefoneE164: telefone, consentimentoVersao: CONSENTIMENTO_VERSAO_ATUAL })
  await receber(c, telefone, d.codigo)
  await drenar(c)
  return d
}

export async function dinheiro(perfis: string[]) {
  const where = { perfilId: { in: perfis } }
  const [ops, gastos, titulos, pagamentos, movimentos] = await Promise.all([owner.financeiroOperacao.findMany({ where }), owner.gasto.findMany({ where }),
    owner.contaPagarTitulo.findMany({ where }), owner.pagamentoFinanceiro.findMany({ where }), owner.movimentacaoFinanceira.findMany({ where })])
  return { ops, gastos, titulos, pagamentos, movimentos }
}

export const hashCodigo = (salt: string, codigo: string) => createHash("sha256").update(`${salt}:${codigo}`).digest("hex")
export async function encerrarG007() { await Promise.all([owner.$disconnect(), worker.$disconnect(), ingress.$disconnect(), operator.$disconnect()]) }
