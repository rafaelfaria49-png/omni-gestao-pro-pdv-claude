/** Invoke with: node node_modules/tsx/dist/cli.mjs tools/print-d03/run.ts ... (see RUNBOOK_D03.md). */
import { PrismaClient } from "../../generated/prisma"
import { prismaDatabase } from "../../lib/printing/direct/db"
import { retentionError, runPrintRetention } from "../../lib/printing/direct/retention"
import { retentionOptions } from "./options.mjs"

async function main() {
  let config: ReturnType<typeof retentionOptions>
  try { config = retentionOptions(process.argv.slice(2), process.env) }
  catch { console.log(JSON.stringify({ error: "RETENTION_OPTIONS_REFUSED" })); process.exitCode = 2; return }
  const prisma = new PrismaClient({ datasourceUrl: config.url, log: [] })
  try {
    const [target] = await prisma.$queryRawUnsafe<Array<{ db: string }>>("SELECT current_database() db")
    if (target.db !== decodeURIComponent(new URL(config.url).pathname.slice(1))) throw new Error("TARGET_MISMATCH")
    const result = await runPrintRetention(prismaDatabase(prisma as never), config.options)
    console.log(JSON.stringify(result))
    if (Object.keys(result.errors).length || result.oversizedDocuments) process.exitCode = 3
  } catch (error) { console.log(JSON.stringify({ error: retentionError(error) })); process.exitCode = 3 }
  finally { await prisma.$disconnect() }
}
void main()
