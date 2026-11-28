/**
 * Entrypoint OFICIAL do worker G006 (`workers/gastos/index.ts`) com o assistente G007/G008, em PROCESSO REAL:
 * Node 24 + `--conditions=react-server` + preload `server-only` + tsx, contra PostgreSQL descartável.
 * Duas conexões: papel `omni_gastos_worker` (fila) e runtime restrito `gm_g007_runtime` (não dono, sem BYPASSRLS).
 * Transporte SIMULADO dentro do processo filho; nada sai da máquina.
 */
// Fixture primeiro: registra os mocks (@/auth nulo, @/lib/prisma descartável) antes de qualquer serviço.
import { bancoG007, cenarioG007, dinheiro, encerrarG007, habilitadoG007, owner, receber, worker } from "./assistente-fixtures"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { spawn } from "node:child_process"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { claimJob } from "@/lib/gastos/queue"
import { CONSENTIMENTO_VERSAO_ATUAL, iniciarPareamento, revogarVinculo } from "@/lib/gestor-money-assistente/whatsapp/vinculo"

const suite = habilitadoG007 ? describe : describe.skip
const NODE = process.env.GM_NODE24 || process.execPath
const RAIZ = process.cwd()
const BASE = "postgresql://%s@127.0.0.1:55530/gastos_g006_test"
const url = (papel: string) => BASE.replace("%s", papel)

type Execucao = { codigo: number | null; eventos: Array<Record<string, unknown>>; saida: string }

function entrypoint(env: Record<string, string>, opcoes: { reactServer?: boolean } = {}): Promise<Execucao> {
  const args = [...(opcoes.reactServer === false ? [] : ["--conditions=react-server"]),
    "--import", pathToFileURL(resolve(RAIZ, "workers/gastos/react-server-preload.mjs")).href,
    "--import", pathToFileURL(resolve(RAIZ, "node_modules/tsx/dist/loader.mjs")).href, "workers/gastos/index.ts", "--once"]
  return new Promise((ok, falha) => {
    // Ambiente mínimo e explícito: nenhum .env, nenhuma credencial herdada.
    const filho = spawn(NODE, args, { cwd: RAIZ, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: {
      PATH: process.env.PATH ?? "", SYSTEMROOT: process.env.SYSTEMROOT ?? "", GESTOR_MONEY_ENABLED: "true",
      GASTOS_WORKER_ENV: "teste", GASTOS_WORKER_MODE: "SIMULADO", GASTOS_WORKER_DATABASE_URL: url("omni_gastos_worker"),
      GASTOS_WORKER_ASSISTENTE: "ligado", GASTOS_WORKER_APP_DATABASE_URL: url("gm_g007_runtime"),
      GASTOS_WORKER_CONCURRENCY: "2", WHATSAPP_CANAL_TOKEN_G007_SYNTHETIC: "synthetic-only-token", ...env } as unknown as NodeJS.ProcessEnv })
    let saida = ""
    filho.stdout!.on("data", (b: Buffer) => { saida += b.toString() }); filho.stderr!.on("data", (b: Buffer) => { saida += b.toString() })
    const timer = setTimeout(() => { filho.kill("SIGKILL"); falha(Error("entrypoint sem resposta: " + saida.slice(-500))) }, 120_000)
    filho.once("exit", (codigo: number | null) => {
      clearTimeout(timer)
      const eventos = saida.split(/\r?\n/).filter(l => l.startsWith("{")).map(l => { try { return JSON.parse(l) } catch { return {} } })
      ok({ codigo, eventos, saida })
    })
  })
}

/** Ciclos do entrypoint real até a fila e as respostas esvaziarem. */
async function drenarReal(max = 8, env: Record<string, string> = {}) {
  const todos: Execucao[] = []
  for (let i = 0; i < max; i++) {
    const r = await entrypoint(env)
    todos.push(r)
    expect(r.eventos.some(e => e.evento === "FALHA_BOOTSTRAP"), r.saida.slice(-400)).toBe(false)
    const [p] = await owner.$queryRaw<Array<{ n: number }>>`SELECT (SELECT count(*) FROM gastos_jobs WHERE estado IN ('PRONTO','RETENTAVEL')
      OR (estado='PROCESSANDO' AND "leaseUntil"<=clock_timestamp()))::int
      + (SELECT count(*) FROM gm_assist_respostas WHERE estado='PENDENTE' AND "runAfter"<=clock_timestamp())::int
      + (SELECT count(*) FROM gastos_outbox o WHERE NOT EXISTS(SELECT 1 FROM gastos_jobs j WHERE j."outboxId"=o.id)
        AND EXISTS(SELECT 1 FROM financeiro_operacoes op JOIN gastos_origens_canal r ON r."grupoChave"=op."grupoChave" AND r."perfilId"=op."perfilId"
          WHERE op.id=o."operacaoId"))::int AS n`
    if (p.n === 0) break
  }
  return todos
}

const codigos = async (userId: string) => (await owner.gmAssistMensagem.findMany({ where: { conversa: { adminUserId: userId } }, orderBy: { criadoEm: "asc" } }))
  .map(m => (m.resposta as { codigo?: string }).codigo)

suite("entrypoint real do worker G006 + assistente G007/G008", () => {
  beforeAll(async () => {
    await bancoG007()
    const [r] = await owner.$queryRaw<Array<{ sup: boolean; byp: boolean; dono: boolean }>>`SELECT rolsuper sup, rolbypassrls byp,
      EXISTS(SELECT 1 FROM pg_class c WHERE c.relowner=r.oid) dono FROM pg_roles r WHERE rolname='gm_g007_runtime'`
    expect(r).toEqual({ sup: false, byp: false, dono: false }) // segunda conexão: papel restrito de verdade
  })
  afterAll(async () => { await encerrarG007() })

  it("falha fechada: sem react-server, runtime dono do schema, mesma URL do worker ou modo STAGING", async () => {
    for (const [env, opcoes] of [[{}, { reactServer: false }], [{ GASTOS_WORKER_APP_DATABASE_URL: url("gm_g007_owner") }, {}],
      [{ GASTOS_WORKER_APP_DATABASE_URL: url("omni_gastos_worker") }, {}], [{ GASTOS_WORKER_MODE: "STAGING" }, {}],
      [{ GASTOS_WORKER_APP_DATABASE_URL: "postgresql://gm_g007_runtime@db.example.com:5432/gastos_g006_test" }, {}]] as const) {
      const r = await entrypoint(env as Record<string, string>, opcoes)
      expect(r.eventos).toContainEqual({ evento: "FALHA_BOOTSTRAP", codigo: "CONFIG_INVALIDA" })
      expect(r.saida).not.toMatch(/gm_g007_runtime@|password|token/i) // erro redigido
    }
  })

  it("conversa completa pelo processo real: pareamento, despesa, confirmação, resultado pós-COMMIT e PROCESSADO_G008", async () => {
    const c = await cenarioG007()
    const d = await iniciarPareamento(owner, { userId: c.U1, telefoneE164: c.T1, consentimentoVersao: CONSENTIMENTO_VERSAO_ATUAL })
    await receber(c, c.T1, d.codigo)
    const execs = await drenarReal()
    expect(execs[0].eventos.map(e => e.evento)).toEqual(expect.arrayContaining(["ASSISTENTE_PRONTO", "INICIO", "PARADA"]))
    expect(await owner.gmAssistVinculo.count({ where: { ativoUsuario: c.U1 } })).toBe(1)
    await receber(c, c.T1, "gastei 77 no mercado no pix pelo nubank pessoal"); await drenarReal()
    await receber(c, c.T1, "sim")
    const finais = await drenarReal()
    const m = await dinheiro([c.P1])
    expect(m.ops).toHaveLength(1)
    expect(String(m.gastos[0].valorCentavos)).toBe("7700")
    expect(await codigos(c.U1)).toEqual(["aguardando_confirmacao", "registrado"])
    const job = await owner.gastoJob.findFirstOrThrow({ where: { tipo: "ENVIAR_RESULTADO", outbox: { operacaoId: m.ops[0].id } } })
    expect(job).toMatchObject({ estado: "CONCLUIDO", envioEstado: "ACEITO" })
    expect(job.externalMessageId).toMatch(/^wamid\.SIMULADO\./)
    expect(finais.flatMap(e => e.eventos).some(e => e.evento === "ENVIO_SIMULADO")).toBe(true)
    const inbox = await owner.whatsAppGestaoInbox.findMany({ where: { remetenteE164: c.T1 } })
    expect(inbox.every(i => i.estado === "PROCESSADO_G008")).toBe(true) // nada mais marcado como AGUARDANDO_VINCULO
    const respostas = await owner.gmAssistResposta.findMany({ where: { destinatarioE164: c.T1 } })
    expect(respostas.length).toBeGreaterThan(0)
    expect(respostas.every(r => r.estado === "ENVIADA" && r.texto === null)).toBe(true) // minimização após entrega
  })

  it("reinício: worker anterior morre com a lease; o processo real recupera sem duplicar", async () => {
    const c = await cenarioG007()
    const d = await iniciarPareamento(owner, { userId: c.U1, telefoneE164: c.T1, consentimentoVersao: CONSENTIMENTO_VERSAO_ATUAL })
    await receber(c, c.T1, d.codigo); await drenarReal()
    await receber(c, c.T1, "gastei 12 no mercado no pix pelo nubank pessoal"); await drenarReal()
    await receber(c, c.T1, "sim")
    const morta = (await claimJob(worker, "worker-que-caiu", 3000))! // pega o job e "morre" sem renovar a lease
    expect(morta.tipo).toBe("STAGING")
    await new Promise(r => setTimeout(r, 3500))
    await drenarReal()
    expect((await dinheiro([c.P1])).ops).toHaveLength(1)
    expect((await owner.gastoJobEvento.findMany({ where: { jobId: morta.id } })).some(e => e.codigo === "LEASE_RECUPERADA")).toBe(true)
    await drenarReal() // novo ciclo não regrava
    expect((await dinheiro([c.P1])).ops).toHaveLength(1)
  })

  it("duplicidade (mesma wamid + dois “sim” em paralelo) e revogação imediata no processo real", async () => {
    const c = await cenarioG007()
    const d = await iniciarPareamento(owner, { userId: c.U1, telefoneE164: c.T1, consentimentoVersao: CONSENTIMENTO_VERSAO_ATUAL })
    await receber(c, c.T1, d.codigo); await drenarReal()
    const w = await receber(c, c.T1, "gastei 31 no mercado no pix pelo nubank pessoal")
    await receber(c, c.T1, "gastei 31 no mercado no pix pelo nubank pessoal", { wamid: w })
    await drenarReal()
    await receber(c, c.T1, "sim"); await receber(c, c.T1, "confirmo")
    await drenarReal()
    expect((await dinheiro([c.P1])).ops).toHaveLength(1)
    await receber(c, c.T1, "gastei 9 no mercado no pix pelo nubank pessoal"); await drenarReal()
    await revogarVinculo(owner, { userId: c.U1, motivo: "SEGURANCA" })
    await receber(c, c.T1, "sim"); await drenarReal()
    expect((await dinheiro([c.P1])).ops).toHaveLength(1) // nada depois da revogação
  })

  it("sem o opt-in do assistente o entrypoint é o G006 original (inbox fica AGUARDANDO_VINCULO)", async () => {
    const c = await cenarioG007()
    await receber(c, c.T3, "oi")
    const r = await entrypoint({ GASTOS_WORKER_ASSISTENTE: "", GASTOS_WORKER_APP_DATABASE_URL: "", GASTOS_WORKER_MODE: "STAGING" })
    expect(r.eventos.some(e => e.evento === "ASSISTENTE_PRONTO")).toBe(false)
    const inbox = await owner.whatsAppGestaoInbox.findFirstOrThrow({ where: { remetenteE164: c.T3 } })
    expect(inbox.estado).toBe("AGUARDANDO_VINCULO")
    expect(await owner.gmAssistResposta.count({ where: { destinatarioE164: c.T3 } })).toBe(0)
  })
})
