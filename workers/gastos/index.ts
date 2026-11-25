/** Node24 + tsx já fixado no lock. Nenhum request Next, browser, .env ou envio Meta. */
import { PrismaClient } from "../../generated/prisma"
import { carregarConfigWorker, healthWorker, rodarWorker } from "../../lib/gastos/worker"
import { codigoRedigido } from "../../lib/gastos/messaging-types"

async function main() {
  const config = carregarConfigWorker(process.env)
  const db = new PrismaClient({ datasources: { db: { url: config.databaseUrl } }, log: [] })
  const parar = new AbortController()
  let deadline: ReturnType<typeof setTimeout> | undefined
  const shutdown = () => {
    if (parar.signal.aborted) return
    parar.abort()
    // Deadline do processo, sem marcar jobs como sucesso: lease/INICIADO ficam duráveis.
    deadline = setTimeout(() => { process.exitCode = 1; process.exit(1) }, config.shutdownMs)
    deadline.unref()
  }
  process.once("SIGTERM", shutdown); process.once("SIGINT", shutdown)
  try {
    await db.$connect()
    if (process.argv.includes("--health")) {
      const health = await healthWorker(db, config)
      process.stdout.write(JSON.stringify(health) + "\n")
      if (!health.ok) process.exitCode = 1
    } else await rodarWorker(db, config, { signal: parar.signal, once: process.argv.includes("--once"),
      observar: evento => process.stdout.write(JSON.stringify(evento) + "\n") })
  } finally {
    clearTimeout(deadline); process.removeListener("SIGTERM", shutdown); process.removeListener("SIGINT", shutdown)
    await db.$disconnect()
  }
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ evento: "FALHA_BOOTSTRAP", codigo: codigoRedigido(error) }) + "\n")
  process.exitCode = 1
})
