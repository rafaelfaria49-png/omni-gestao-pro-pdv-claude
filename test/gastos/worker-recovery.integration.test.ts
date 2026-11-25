import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { setImmediate as proximo } from "node:timers/promises"
import { PrismaClient } from "@/generated/prisma"
import { configurarCanal, persistirIngresso } from "@/lib/gastos/channels"
import { executarEnvio, prepararOutbox, reconciliarEnvio, registrarOrigemCanal, type DependenciasEnvio, type MensagemResultado } from "@/lib/gastos/outbox"
import { claimJob, concluirStaging, reprocessarJob } from "@/lib/gastos/queue"
import { carregarConfigWorker, healthWorker, processarClaim, rodarWorker } from "@/lib/gastos/worker"
import { bancoG006, conexao, dinheiroG006, encerrarG006, estacionarFilaDeTeste, fixtureG006, habilitadoG006, ingress, operator, owner,
  prepararFinanceiroG006, provaG006, worker, type FixtureG006 } from "./g006-fixtures"

const deps = (f: FixtureG006, enviar?: NonNullable<DependenciasEnvio["transporte"]>["enviar"]): DependenciasEnvio => ({
  verificarVinculo: f.verificar, env: { WHATSAPP_CANAL_TOKEN_G006_SYNTHETIC: "synthetic-only-token" }, transporte: { modo: "SIMULADO", enviar: enviar ?? (async () => ({ tipo: "ACEITO", externalMessageId: `simulado.${randomUUID()}` })) },
})
async function pronto(leaseMs = 30_000) {
  const f = await fixtureG006(), p = await prepararFinanceiroG006(f)
  await concluirStaging(worker, (await claimJob(worker, "staging-inicial"))!)
  const resultado = await p.aplicar()
  expect(await prepararOutbox(worker)).toBe(1)
  const claim = (await claimJob(worker, "dispatcher", leaseMs, true))!
  expect(claim.tipo).toBe("ENVIAR_RESULTADO")
  return { f, p, resultado, claim, dinheiro: await dinheiroG006(f) }
}

async function crashFilho(mode: "claim" | "send", f?: FixtureG006) {
  const dir = process.env.G006_EVIDENCE_DIR, root = process.cwd().replaceAll("\\", "/")
  if (!dir || !resolve(dir).replaceAll("\\", "/").endsWith("/G006-execution") || !root.endsWith("/omni-gestao-gastos-006")) throw Error("Harness G006 nao identificado")
  const script = resolve(dir, "crash-child.ts")
  writeFileSync(script, `import {PrismaClient} from ${JSON.stringify(root + "/generated/prisma/index.js")};
import {claimJob} from ${JSON.stringify(root + "/lib/gastos/queue.ts")};
import {executarEnvio} from ${JSON.stringify(root + "/lib/gastos/outbox.ts")};
const db=new PrismaClient({datasources:{db:{url:'postgresql://omni_gastos_worker@127.0.0.1:55516/gastos_g006_test?connection_limit=1'}},log:[]});
async function main(){const claim=await claimJob(db,'child-g006',30000,true);if(!claim)throw Error('no claim');
if(process.env.G006_CRASH_MODE==='claim'){process.send?.({fase:'CLAIM',jobId:claim.id,pid:process.pid,node:process.version});setInterval(()=>{},1000);return;}
const b=JSON.parse(process.env.G006_FIXTURE_BINDING!);
await executarEnvio(db,claim,{verificarVinculo:async()=>({userId:b.userId,bindingRef:b.bindingRef,versao:b.versao}),env:{WHATSAPP_CANAL_TOKEN_G006_SYNTHETIC:'synthetic-only'},transporte:{modo:'SIMULADO',enviar:async()=>{process.send?.({fase:'INICIADO',jobId:claim.id,pid:process.pid,node:process.version});return await new Promise(()=>{setInterval(()=>{},1000)});}}});}
main().catch(()=>process.exit(2));\n`)
  const child = spawn(process.execPath, ["--import", pathToFileURL(resolve(root, "node_modules/tsx/dist/loader.mjs")).href, script], {
    cwd: root, env: { ...process.env, G006_CRASH_MODE: mode, G006_FIXTURE_BINDING: JSON.stringify(f?.binding ?? {}) }, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"],
  })
  let output = ""
  child.stdout!.on("data", b => { output += b.toString() }); child.stderr!.on("data", b => { output += b.toString() })
  const exited = new Promise<number | null>(r => child.once("exit", r))
  try {
    const msg = await new Promise<{ fase: string; jobId: string; pid: number; node: string }>((resolveMsg, reject) => {
      const timer = setTimeout(() => reject(Error("Barreira IPC G006 nao atingida: " + output)), 10_000)
      child.once("message", msg => { clearTimeout(timer); resolveMsg(msg as { fase: string; jobId: string; pid: number; node: string }) })
      child.once("exit", () => { clearTimeout(timer); reject(Error("Filho G006 saiu antes da barreira: " + output)) })
    })
    expect(msg.pid).toBe(child.pid); expect(msg.node).toMatch(/^v24\./)
    child.kill("SIGKILL") // Somente o processo recém-criado por este teste.
    await exited
    provaG006("crash-processo-" + mode, { ...msg, killedOwnChild: true, dbReal: true, transporte: "SIMULADO", cloud: false })
    return msg
  } finally { if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exited } }
}

async function entryOnce() {
  const child = spawn(process.execPath, ["--import", pathToFileURL(resolve("node_modules/tsx/dist/loader.mjs")).href, "workers/gastos/index.ts", "--once"], {
    cwd: process.cwd(), env: { ...process.env, GASTOS_WORKER_ENV: "teste", GASTOS_WORKER_MODE: "STAGING", GASTOS_WORKER_DATABASE_URL: "postgresql://omni_gastos_worker@127.0.0.1:55516/gastos_g006_test?connection_limit=2" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  })
  let output = ""
  child.stdout.on("data", b => { output += b.toString() }); child.stderr.on("data", b => { output += b.toString() })
  const exit = await new Promise<number | null>(r => child.once("exit", r))
  expect({ exit, output }).toMatchObject({ exit: 0 })
  expect(output).toContain('"evento":"PARADA"')
  return { pid: child.pid, exit, output, cloud: false }
}

describe.runIf(habilitadoG006)("G006 worker recovery / outbox real e transporte SIMULADO", () => {
  beforeAll(bancoG006); beforeEach(estacionarFilaDeTeste); afterAll(encerrarG006)

  it("G: dispatcher não observa outbox durante COMMIT financeiro bloqueado por barreira", async () => {
    const f = await fixtureG006(), p = await prepararFinanceiroG006(f), locker = conexao("gastos_g006_owner")
    await concluirStaging(worker, (await claimJob(worker, "staging-commit"))!)
    let pronta!: () => void, soltar!: () => void
    const barreira = new Promise<void>(r => { pronta = r }), liberar = new Promise<void>(r => { soltar = r })
    await owner.$executeRawUnsafe("CREATE FUNCTION g006_qa_commit_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(6000616); RETURN NEW; END $$")
    await owner.$executeRawUnsafe("CREATE CONSTRAINT TRIGGER g006_qa_commit AFTER INSERT ON financeiro_operacoes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION g006_qa_commit_barrier()")
    const trava = locker.$transaction(async tx => { await tx.$queryRaw`SELECT pg_advisory_xact_lock(6000616)::text`; pronta(); await liberar })
    await barreira
    const aplicacao = p.aplicar()
    try {
      const limite = Date.now() + 4000
      let esperando = false
      while (Date.now() < limite) {
        const [r] = await owner.$queryRaw<Array<{ espera: boolean }>>`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=6000616 AND NOT granted) espera`
        if (r.espera) { esperando = true; break }
        await proximo()
      }
      expect(esperando).toBe(true)
      expect(await prepararOutbox(worker)).toBe(0)
      expect(await claimJob(worker, "antes-commit", 30_000, true)).toBeNull()
    } finally { soltar(); await trava; await aplicacao; await locker.$disconnect()
      await owner.$executeRawUnsafe("DROP TRIGGER g006_qa_commit ON financeiro_operacoes")
      await owner.$executeRawUnsafe("DROP FUNCTION g006_qa_commit_barrier()") }
    expect(await prepararOutbox(worker)).toBe(1)
  })

  it("A16/O/P: saída usa canal e resultado persistidos; replay dispatch nunca reaplica dinheiro", async () => {
    const x = await pronto(), mensagens: MensagemResultado[] = []
    await executarEnvio(worker, x.claim, deps(x.f, async mensagem => { mensagens.push(mensagem); return { tipo: "ACEITO", externalMessageId: "simulado.aceito" } }))
    expect(mensagens).toHaveLength(1)
    expect(mensagens[0]).toMatchObject({ canalId: x.f.canal.canalId, phoneNumberId: x.f.canal.phoneNumberId, destinatarioE164: x.f.remetenteE164,
      payload: { operacaoId: x.resultado.operacaoId, resultado: x.resultado } })
    expect(await prepararOutbox(worker)).toBe(0)
    expect(await dinheiroG006(x.f)).toBe(x.dinheiro)
    const row = await owner.gastoJob.findUniqueOrThrow({ where: { id: x.claim.id } })
    expect(row).toMatchObject({ estado: "CONCLUIDO", envioEstado: "ACEITO", externalMessageId: "simulado.aceito" })
    expect(row.envioEstado).not.toBe("ENTREGUE")
    expect(await x.p.aplicar()).toEqual(x.resultado)
    expect(await dinheiroG006(x.f)).toBe(x.dinheiro)
  })

  it.each([401, 403])("K: HTTP %i estaciona sem falso sucesso financeiro/envio", async status => {
    const x = await pronto()
    await executarEnvio(worker, x.claim, deps(x.f, async () => ({ tipo: "FALHA", falha: { tipo: "HTTP", status } })))
    expect(await owner.gastoJob.findUniqueOrThrow({ where: { id: x.claim.id } })).toMatchObject({ estado: "ESTACIONADO", falhaCodigo: "AUTH_401_403", envioEstado: "REJEITADO" })
    expect(await dinheiroG006(x.f)).toBe(x.dinheiro)
  })

  it.each([{ tipo: "TIMEOUT" as const }, { tipo: "HTTP" as const, status: 500 }, { tipo: "HTTP" as const, status: 503 }, { tipo: "HTTP" as const, status: 429 }])("K/N: %j mantém ENVIO_INCERTO sem retry cego", async falha => {
    const x = await pronto()
    await executarEnvio(worker, x.claim, deps(x.f, async () => ({ tipo: "FALHA", falha })))
    expect(await owner.gastoJob.findUniqueOrThrow({ where: { id: x.claim.id } })).toMatchObject({ estado: "ENVIO_INCERTO", envioEstado: "ENVIO_INCERTO" })
    await expect(reprocessarJob(operator, x.claim.id, "PROVEDOR_RESTAURADO")).rejects.toThrow("OPERADOR_NEGADO")
    expect(await claimJob(worker, "sem-reenvio", 30_000, true)).toBeNull()
    expect(await dinheiroG006(x.f)).toBe(x.dinheiro)
  })

  it("429 com rejeição comprovada permite retry do MESMO job, sem operação monetária nova", async () => {
    const x = await pronto()
    await executarEnvio(worker, x.claim, deps(x.f, async () => ({ tipo: "FALHA", falha: { tipo: "HTTP", status: 429, rejeicaoComprovada: true, retryAfterMs: 3000 } })))
    expect(await owner.gastoJob.findUniqueOrThrow({ where: { id: x.claim.id } })).toMatchObject({ estado: "RETENTAVEL", envioEstado: "REJEITADO" })
    expect(await claimJob(worker, "nao-antes-do-backoff", 30_000, true)).toBeNull()
    await owner.$executeRaw`UPDATE gastos_jobs SET "runAfter"=clock_timestamp()-interval '1 second' WHERE id=${x.claim.id}`
    const b = (await claimJob(worker, "retry-429", 30_000, true))!
    expect(b.id).toBe(x.claim.id); expect(b.tentativas).toBe(2)
    await executarEnvio(worker, b, deps(x.f))
    expect(await dinheiroG006(x.f)).toBe(x.dinheiro)
  })

  it("timeout efetivo do port, mesmo ignorando AbortSignal, termina em incerteza", async () => {
    const x = await pronto()
    await executarEnvio(worker, x.claim, { ...deps(x.f, async () => new Promise(() => {})), timeoutMs: 10 })
    expect(await owner.gastoJob.findUniqueOrThrow({ where: { id: x.claim.id } })).toMatchObject({ estado: "ENVIO_INCERTO" })
  })

  it("Q: usuário ou grant revogado antes da execução impede transporte", async () => {
    const x = await pronto(); let chamadas = 0
    await owner.perfilMembro.updateMany({ where: { perfilId: x.f.E1, adminUserId: x.f.U1 }, data: { revogadoEm: new Date() } })
    await executarEnvio(worker, x.claim, deps(x.f, async () => { chamadas++; return { tipo: "ACEITO", externalMessageId: "simulado.proibido" } }))
    expect(chamadas).toBe(0)
    expect(await owner.gastoJob.findUniqueOrThrow({ where: { id: x.claim.id } })).toMatchObject({ estado: "ESTACIONADO", falhaCodigo: "ACESSO_REVOGADO" })
    expect(await dinheiroG006(x.f)).toBe(x.dinheiro)
  })

  it("binding ausente/revogado ou versão antiga não é substituído por sessão/owner", async () => {
    const x = await pronto(); x.f.binding.revogado = true
    await executarEnvio(worker, x.claim, deps(x.f))
    expect(await owner.gastoJob.findUniqueOrThrow({ where: { id: x.claim.id } })).toMatchObject({ estado: "ESTACIONADO", falhaCodigo: "VINCULO_AUSENTE" })
    expect(await dinheiroG006(x.f)).toBe(x.dinheiro)
  })

  it.each(["USUARIO_INATIVO", "PAPEL_REVOGADO", "MEMBERSHIP_REMOVIDA", "PERFIL_INATIVO", "BINDING_VERSAO"])("Q: %s antes da execução bloqueia o job", async caso => {
    const x = await pronto()
    if (caso === "USUARIO_INATIVO") await owner.adminUser.update({ where: { id: x.f.U1 }, data: { active: false } })
    if (caso === "PAPEL_REVOGADO") await owner.adminUser.update({ where: { id: x.f.U1 }, data: { role: "TECNICO" } })
    if (caso === "MEMBERSHIP_REMOVIDA") await owner.adminUserStore.deleteMany({ where: { adminUserId: x.f.U1, storeId: x.f.L1 } })
    if (caso === "PERFIL_INATIVO") await owner.financeiroPerfil.update({ where: { id: x.f.E1 }, data: { ativo: false } })
    if (caso === "BINDING_VERSAO") x.f.binding.versao++
    let chamadas = 0
    await executarEnvio(worker, x.claim, deps(x.f, async () => { chamadas++; return { tipo: "ACEITO", externalMessageId: "simulado.proibido" } }))
    expect(chamadas).toBe(0)
    expect(await owner.gastoJob.findUniqueOrThrow({ where: { id: x.claim.id } })).toMatchObject({ estado: "ESTACIONADO", falhaCodigo: "ACESSO_REVOGADO" })
    expect(await dinheiroG006(x.f)).toBe(x.dinheiro)
  })

  it("origem fixa não pode ser trocada por replay de outra mensagem/grupo", async () => {
    const f = await fixtureG006(), p = await prepararFinanceiroG006(f)
    const outra = await persistirIngresso(ingress, f.envelope())
    await expect(registrarOrigemCanal(worker, { inboxId: outra.inboxId, perfilId: f.E1, storeId: f.L1, grupoChave: p.origem.grupoChave }, f.verificar)).rejects.toThrow("ORIGEM_INVALIDA")
    await expect(owner.gastoOrigemCanal.update({ where: { id: p.origem.id }, data: { inboxId: outra.inboxId } })).rejects.toThrow()
  })

  it("falha da fila após commit financeiro não perde resultado nem repete operação", async () => {
    const f = await fixtureG006(), p = await prepararFinanceiroG006(f)
    await concluirStaging(worker, (await claimJob(worker, "staging-db-fail"))!); await p.aplicar()
    const dinheiro = await dinheiroG006(f)
    await owner.$executeRawUnsafe("CREATE FUNCTION g006_qa_job_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA_QUEUE_FAIL'; END $$")
    await owner.$executeRawUnsafe("CREATE TRIGGER g006_qa_job_fail BEFORE INSERT ON gastos_jobs FOR EACH ROW EXECUTE FUNCTION g006_qa_job_fail()")
    try { await expect(prepararOutbox(worker)).rejects.toThrow() }
    finally { await owner.$executeRawUnsafe("DROP TRIGGER g006_qa_job_fail ON gastos_jobs"); await owner.$executeRawUnsafe("DROP FUNCTION g006_qa_job_fail()") }
    expect(await dinheiroG006(f)).toBe(dinheiro)
    expect(await prepararOutbox(worker)).toBe(1); expect(await prepararOutbox(worker)).toBe(0)
    expect(await dinheiroG006(f)).toBe(dinheiro)
  })

  it("resposta externa aceita e falha SQL ao salvar não vira sucesso nem reenvio", async () => {
    const x = await pronto(); let chamadas = 0
    await owner.$executeRawUnsafe("CREATE FUNCTION g006_qa_accepted_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.\"envioEstado\"='ACEITO' THEN RAISE EXCEPTION 'QA_AFTER_SEND_FAIL'; END IF; RETURN NEW; END $$")
    await owner.$executeRawUnsafe("CREATE TRIGGER g006_qa_accepted BEFORE UPDATE ON gastos_jobs FOR EACH ROW EXECUTE FUNCTION g006_qa_accepted_fail()")
    try { await executarEnvio(worker, x.claim, deps(x.f, async () => { chamadas++; return { tipo: "ACEITO", externalMessageId: "simulado.perdido" } })) }
    finally { await owner.$executeRawUnsafe("DROP TRIGGER g006_qa_accepted ON gastos_jobs"); await owner.$executeRawUnsafe("DROP FUNCTION g006_qa_accepted_fail()") }
    expect(chamadas).toBe(1)
    expect(await owner.gastoJob.findUniqueOrThrow({ where: { id: x.claim.id } })).toMatchObject({ estado: "ENVIO_INCERTO", envioEstado: "ENVIO_INCERTO" })
    expect(await claimJob(worker, "nao-reenviar", 30_000, true)).toBeNull()
    expect(await dinheiroG006(x.f)).toBe(x.dinheiro)
  })

  it("P: rotação/inativação não troca credencial nem canal de saída", async () => {
    const x = await pronto()
    await configurarCanal(operator, x.f.canal.canalId, x.f.canal.versao, false, "WHATSAPP_CANAL_TOKEN_OUTRO")
    await executarEnvio(worker, x.claim, deps(x.f))
    expect(await owner.gastoJob.findUniqueOrThrow({ where: { id: x.claim.id } })).toMatchObject({ estado: "ESTACIONADO", falhaCodigo: "CANAL_ALTERADO" })
  })

  it("R: pessoal global e empresa distintos; mesmo canal não concede perfil estrangeiro", async () => {
    const f = await fixtureG006(), e = await prepararFinanceiroG006(f), p = await prepararFinanceiroG006(f, f.P1)
    const entrada = await persistirIngresso(ingress, f.envelope())
    await expect(registrarOrigemCanal(worker, { inboxId: entrada.inboxId, perfilId: f.P2, storeId: null, grupoChave: randomUUID() }, f.verificar)).rejects.toThrow("ACESSO_REVOGADO")
    const er = await e.aplicar(), pr = await p.aplicar()
    expect(e.origem.storeId).toBe(f.L1); expect(p.origem.storeId).toBeNull()
    expect(await prepararOutbox(worker)).toBe(2)
    const jobs = await owner.gastoJob.findMany({ where: { origemId: { in: [e.origem.id, p.origem.id] } } })
    expect(jobs).toHaveLength(2)
    expect(new Set(jobs.map(j => j.outboxId)).size).toBe(2)
    expect(er.operacaoId).not.toBe(pr.operacaoId)
    expect(await owner.whatsAppConversation.count({ where: { storeId: { in: [f.L1, f.L2] } } })).toBe(0)
  })

  it("S: worker/monitor e auditoria não publicam payload, valor, telefone ou token", async () => {
    const f = await fixtureG006(), p = await prepararFinanceiroG006(f)
    await concluirStaging(worker, (await claimJob(worker, "staging-log"))!); await p.aplicar()
    const eventos: unknown[] = [], config = carregarConfigWorker({ GASTOS_WORKER_ENV: "teste", GASTOS_WORKER_MODE: "SIMULADO",
      GASTOS_WORKER_DATABASE_URL: "postgresql://omni_gastos_worker@127.0.0.1:55516/gastos_g006_test" }, "24.22.1")
    await rodarWorker(worker, config, { signal: new AbortController().signal, once: true, envio: deps(f, async () => { throw Error("Conteudo privado sintetico G006 synthetic-only-token +15550060001 4000") }), observar: e => eventos.push(e) })
    const json = JSON.stringify(eventos) + JSON.stringify(await operator.gastoJobEvento.findMany({ where: { job: { origemId: p.origem.id } } }))
    for (const privado of ["Conteudo privado", "synthetic-only-token", "+15550060001", "4000", f.U1, f.L1]) expect(json).not.toContain(privado)
    provaG006("monitor-redigido", { eventos, transporte: "SIMULADO", conteudoSensivelExposto: false })
  })

  it("M/N: reconciliação comprovada autoriza mesma identidade; entrega não é inferida do aceite", async () => {
    const x = await pronto()
    await executarEnvio(worker, x.claim, deps(x.f, async () => ({ tipo: "FALHA", falha: { tipo: "TIMEOUT" } })))
    const prova = { modo: "SIMULADO" as const, jobId: x.claim.id, canalId: x.f.canal.canalId, evidenciaRef: randomUUID(), estado: "NAO_ENVIADO" as const }
    await expect(reconciliarEnvio(worker, x.claim.id, async () => prova)).rejects.toThrow("OPERADOR_NEGADO")
    await expect(reconciliarEnvio(operator, x.claim.id, async () => ({ ...prova, jobId: randomUUID() }))).rejects.toThrow("OPERADOR_NEGADO")
    await expect(reconciliarEnvio(operator, x.claim.id, async () => ({ ...prova, canalId: randomUUID() }))).rejects.toThrow("RESULTADO_INVALIDO")
    await reconciliarEnvio(operator, x.claim.id, async () => prova)
    await reprocessarJob(operator, x.claim.id, "PROVEDOR_RESTAURADO")
    await executarEnvio(worker, (await claimJob(worker, "reconciliado", 30_000, true))!, deps(x.f, async () => ({ tipo: "ACEITO", externalMessageId: "simulado.status" })))
    await expect(reconciliarEnvio(operator, x.claim.id, async () => ({ ...prova, externalMessageId: "simulado.status" }))).rejects.toThrow("RESULTADO_INVALIDO")
    await reconciliarEnvio(operator, x.claim.id, async () => ({ ...prova, evidenciaRef: randomUUID(), estado: "ENTREGUE", externalMessageId: "simulado.status" }))
    expect(await owner.gastoJob.findUniqueOrThrow({ where: { id: x.claim.id } })).toMatchObject({ envioEstado: "ENTREGUE", estado: "CONCLUIDO" })
    expect(await dinheiroG006(x.f)).toBe(x.dinheiro)
  })

  it("F/T: mata processo próprio após claim; novo entrypoint retoma o MESMO job", async () => {
    const f = await fixtureG006(), entrada = await persistirIngresso(ingress, f.envelope()), crash = await crashFilho("claim")
    expect(crash.jobId).toBe(entrada.jobId)
    await owner.$executeRaw`UPDATE gastos_jobs SET "leaseUntil"=clock_timestamp()-interval '1 second' WHERE id=${crash.jobId}`
    const primeira = await entryOnce(), segunda = await entryOnce()
    expect(await owner.gastoJob.findUniqueOrThrow({ where: { id: entrada.jobId } })).toMatchObject({ estado: "CONCLUIDO", tentativas: 2 })
    expect(await owner.gastoJob.count({ where: { inboxId: entrada.inboxId } })).toBe(1)
    provaG006("entrypoint-reinicio-local", { primeira, segunda, jobId: entrada.jobId, cloud: false })
  }, 20000)

  it("H/N/O: queda após commit financeiro e INICIADO nunca reenfileira dinheiro/envio cego", async () => {
    const f = await fixtureG006(), p = await prepararFinanceiroG006(f)
    await concluirStaging(worker, (await claimJob(worker, "staging-crash-send"))!); const resultado = await p.aplicar()
    const dinheiro = await dinheiroG006(f)
    expect(await prepararOutbox(worker)).toBe(1)
    const crash = await crashFilho("send", f)
    expect(crash.fase).toBe("INICIADO")
    expect(await owner.gastoJob.findUniqueOrThrow({ where: { id: crash.jobId } })).toMatchObject({ envioEstado: "INICIADO" })
    await owner.$executeRaw`UPDATE gastos_jobs SET "leaseUntil"=clock_timestamp()-interval '1 second' WHERE id=${crash.jobId}`
    expect(await claimJob(worker, "recuperacao-envio", 30_000, true)).toBeNull()
    expect(await owner.gastoJob.findUniqueOrThrow({ where: { id: crash.jobId } })).toMatchObject({ estado: "ENVIO_INCERTO" })
    expect(await p.aplicar()).toEqual(resultado)
    expect(await prepararOutbox(worker)).toBe(0)
    expect(await dinheiroG006(f)).toBe(dinheiro)
  }, 20000)

  it("SQL direto do operador/worker não libera envio incerto nem regride aceite/entrega", async () => {
    const x = await pronto()
    await executarEnvio(worker, x.claim, deps(x.f, async () => ({ tipo: "FALHA", falha: { tipo: "TIMEOUT" } })))
    for (const db of [operator, worker]) {
      await expect(db.$executeRaw`UPDATE gastos_jobs SET estado='PRONTO',"envioEstado"='REJEITADO' WHERE id=${x.claim.id}`).rejects.toThrow()
      await expect(db.$executeRaw`UPDATE gastos_jobs SET estado='ESTACIONADO',"envioEstado"='REJEITADO' WHERE id=${x.claim.id}`).rejects.toThrow()
    }
    const prova = { modo: "SIMULADO" as const, jobId: x.claim.id, canalId: x.f.canal.canalId, evidenciaRef: randomUUID(), estado: "ACEITO" as const, externalMessageId: "simulado.sql-fenced" }
    await reconciliarEnvio(operator, x.claim.id, async () => prova)
    await expect(operator.$executeRaw`UPDATE gastos_jobs SET estado='PRONTO',"envioEstado"='REJEITADO' WHERE id=${x.claim.id}`).rejects.toThrow()
    await reconciliarEnvio(operator, x.claim.id, async () => ({ ...prova, estado: "ENTREGUE", evidenciaRef: randomUUID() }))
    await expect(operator.$executeRaw`UPDATE gastos_jobs SET "envioEstado"='ACEITO' WHERE id=${x.claim.id}`).rejects.toThrow()
    await expect(worker.$executeRaw`UPDATE gastos_jobs SET "externalMessageId"='outro-id' WHERE id=${x.claim.id}`).rejects.toThrow()
    expect(await dinheiroG006(x.f)).toBe(x.dinheiro)
  })

  it("origem registrada após a operação não autoriza dispatch, inclusive por INSERT direto", async () => {
    const f = await fixtureG006(), p = await prepararFinanceiroG006(f, f.E1, "ORIGEM_DEPOIS"), r = await p.aplicar()
    await concluirStaging(worker, (await claimJob(worker, "staging-tardio"))!)
    const op = await owner.financeiroOperacao.findUniqueOrThrow({ where: { id: r.operacaoId } })
    expect(p.origem.createdAt.getTime()).toBeGreaterThan(op.createdAt.getTime())
    expect(await prepararOutbox(worker)).toBe(0)
    const outbox = await owner.gastoOutbox.findFirstOrThrow({ where: { operacaoId: r.operacaoId } })
    await expect(worker.gastoJob.create({ data: { chave: `outbox:${outbox.id}`, tipo: "ENVIAR_RESULTADO", outboxId: outbox.id, origemId: p.origem.id } })).rejects.toThrow()
  })

  it("health informa modo real e recusa pulso expirado; bootstrap marca pulso morto PARADO", async () => {
    await owner.$executeRaw`UPDATE gastos_worker_pulsos SET estado='PARADO'`
    const id = randomUUID()
    await worker.gastoWorkerPulso.create({ data: { id, estado: "ATIVO", versao: "g006-1" } })
    expect(await healthWorker(worker, { modo: "SIMULADO" })).toMatchObject({ ok: true, modo: "SIMULADO" })
    await owner.$executeRaw`UPDATE gastos_worker_pulsos SET "ultimoPulso"=clock_timestamp()-interval '61 seconds' WHERE id=${id}`
    expect(await healthWorker(worker, { modo: "STAGING" })).toMatchObject({ ok: false, modo: "STAGING" })
    const config = carregarConfigWorker({ GASTOS_WORKER_ENV: "teste", GASTOS_WORKER_DATABASE_URL: "postgresql://omni_gastos_worker@127.0.0.1:55516/gastos_g006_test" }, "24.22.1")
    await rodarWorker(worker, config, { signal: new AbortController().signal, once: true })
    expect(await owner.gastoWorkerPulso.findUniqueOrThrow({ where: { id } })).toMatchObject({ estado: "PARADO" })
  })

  it("processarClaim renova lease durante transporte lento e conclui com o mesmo token", async () => {
    const x = await pronto(3000)
    const config = carregarConfigWorker({ GASTOS_WORKER_ENV: "teste", GASTOS_WORKER_MODE: "SIMULADO", GASTOS_WORKER_LEASE_MS: "3000",
      GASTOS_WORKER_SEND_TIMEOUT_MS: "2500", GASTOS_WORKER_DATABASE_URL: "postgresql://omni_gastos_worker@127.0.0.1:55516/gastos_g006_test" }, "24.22.1")
    let entrou!: () => void, liberar!: () => void
    const barreira = new Promise<void>(r => { entrou = r }), soltar = new Promise<void>(r => { liberar = r })
    const tarefa = processarClaim(worker, x.claim, config, deps(x.f, async () => { entrou(); await soltar; return { tipo: "ACEITO", externalMessageId: "simulado.pulso" } }))
    try {
      await barreira
      await expect.poll(async () => (await owner.gastoJob.findUniqueOrThrow({ where: { id: x.claim.id } })).leaseUntil!.getTime(), { timeout: 2200, interval: 30 }).toBeGreaterThan(x.claim.leaseUntil.getTime())
      expect((await owner.gastoJob.findUniqueOrThrow({ where: { id: x.claim.id } })).leaseToken).toBe(x.claim.leaseToken)
    } finally { liberar(); await tarefa }
    expect(await owner.gastoJob.findUniqueOrThrow({ where: { id: x.claim.id } })).toMatchObject({ estado: "CONCLUIDO", envioEstado: "ACEITO" })
  })

  it("loop com concorrência dois aguarda lotes e encerra cooperativamente por AbortSignal", async () => {
    const f = await fixtureG006(), entradas = []
    for (let n = 0; n < 3; n++) entradas.push(await persistirIngresso(ingress, f.envelope()))
    const config = carregarConfigWorker({ GASTOS_WORKER_ENV: "teste", GASTOS_WORKER_CONCURRENCY: "2", GASTOS_WORKER_POLL_MS: "100",
      GASTOS_WORKER_DATABASE_URL: "postgresql://omni_gastos_worker@127.0.0.1:55516/gastos_g006_test?connection_limit=3" }, "24.22.1")
    const db = new PrismaClient({ datasources: { db: { url: config.databaseUrl } }, log: [] })
    const parar = new AbortController(), eventos: string[] = []
    try {
      await rodarWorker(db, config, { signal: parar.signal, observar: e => { eventos.push(e.evento); if (eventos.filter(x => x === "PULSO").length === 2) parar.abort() } })
      expect(eventos).toEqual(["INICIO", "PULSO", "PULSO", "PARADA"])
      const jobs = await owner.gastoJob.findMany({ where: { id: { in: entradas.map(e => e.jobId) } } })
      expect(jobs).toHaveLength(3); expect(jobs.every(j => j.estado === "CONCLUIDO" && j.tentativas === 1)).toBe(true)
    } finally { parar.abort(); await db.$disconnect() }
  })
})
