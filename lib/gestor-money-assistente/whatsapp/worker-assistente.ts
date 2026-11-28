/**
 * Bootstrap G007/G008 no entrypoint OFICIAL do worker G006 (`workers/gastos/index.ts`). Opt-in explícito:
 * `GASTOS_WORKER_ASSISTENTE=ligado`. Sem ele, o worker G006 segue idêntico.
 *
 * Exigências (falha fechada com CONFIG_INVALIDA, sem detalhe de segredo):
 * - processo iniciado com `--conditions=react-server` (os serviços G001–G005 importam `server-only`);
 * - modo `SIMULADO` e ambiente `teste` (envio real desligado nesta entrega);
 * - SEGUNDA conexão `GASTOS_WORKER_APP_DATABASE_URL` (runtime da aplicação, para G001–G005 e `gm_assist_*`),
 *   distinta da conexão do papel `omni_gastos_worker`, aprovada pelo MESMO Datasource Guard (#404) do worker e com
 *   papel restrito: não superusuário, sem BYPASSRLS, sem CREATEROLE/CREATEDB, não é papel G006, e com DML nas tabelas do
 *   assistente, e não dono de tabela alguma (dono ignora RLS). `DATABASE_URL` do processo, se existir, tem de ser a mesma URL (é a que `@/lib/prisma` usa).
 */
import type { PrismaClient } from "@/generated/prisma"
import { MensageriaError } from "@/lib/gastos/messaging-types"
import { autorizarDatasourceWorker, type ConfigWorker } from "@/lib/gastos/worker"

export function condicaoReactServer(execArgv: readonly string[] = process.execArgv, nodeOptions = process.env.NODE_OPTIONS ?? "") {
  const args = [...execArgv, ...nodeOptions.split(/\s+/)]
  return args.some((a, i) => a === "--conditions=react-server" || a === "-C=react-server"
    || ((a === "--conditions" || a === "-C") && args[i + 1] === "react-server"))
}

export type EventoAssistenteWorker = { evento: "ASSISTENTE_PRONTO" | "ENVIO_SIMULADO" | "ASSISTENTE_FALHA"; codigo?: string; ref?: string; versao: "g008-1" }

export async function prepararAssistenteWorker(db: PrismaClient, config: ConfigWorker, env: Record<string, string | undefined>,
  observar: (e: EventoAssistenteWorker) => void = () => {}) {
  const invalida = () => new MensageriaError("CONFIG_INVALIDA")
  if (!condicaoReactServer()) throw invalida()
  if (config.modo !== "SIMULADO" || config.ambiente !== "teste") throw invalida()
  const appUrl = env.GASTOS_WORKER_APP_DATABASE_URL?.trim()
  if (!appUrl || appUrl === config.databaseUrl) throw invalida()
  try { autorizarDatasourceWorker(config.ambiente, appUrl) } catch { throw invalida() }
  if ((env.DATABASE_URL && env.DATABASE_URL !== appUrl) || (env.DIRECT_URL && env.DIRECT_URL !== appUrl)) throw invalida()
  process.env.DATABASE_URL = appUrl
  process.env.DIRECT_URL = appUrl
  // Importação tardia: só depois do guard; módulos server-only sob a condição react-server.
  const { prisma } = await import("@/lib/prisma")
  const [papel] = await prisma.$queryRaw<Array<{ papel: string; sup: boolean; byp: boolean; cria: boolean; dml: boolean; dono: boolean }>>`
    SELECT current_user AS papel, r.rolsuper AS sup, r.rolbypassrls AS byp, (r.rolcreaterole OR r.rolcreatedb) AS cria,
      (has_table_privilege(current_user,'public.gm_assist_conversas','INSERT,UPDATE,SELECT')
        AND has_table_privilege(current_user,'public.gm_assist_respostas','INSERT,UPDATE,SELECT')) AS dml,
      EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relowner=r.oid) AS dono
    FROM pg_roles r WHERE r.rolname=current_user`
  // Dono de tabela ignora RLS: o runtime do assistente nunca pode ser dono do schema.
  if (!papel || papel.sup || papel.byp || papel.cria || papel.dono || !papel.dml || papel.papel.startsWith("omni_gastos_")) throw invalida()
  const { cicloGestao, processadorStagingGestao, verificadorVinculoG006 } = await import("./gateway")
  const { transporteResultadoG006, transporteSimulado } = await import("./transporte")
  const transporte = transporteSimulado()
  const envioOriginal = transporte.enviar.bind(transporte)
  transporte.enviar = async m => {
    const r = await envioOriginal(m)
    // Sem conteúdo, sem telefone: só a identidade técnica simulada.
    if (r.tipo === "ACEITO") observar({ evento: "ENVIO_SIMULADO", ref: r.externalMessageId, versao: "g008-1" })
    return r
  }
  observar({ evento: "ASSISTENTE_PRONTO", versao: "g008-1" })
  return {
    staging: processadorStagingGestao({ env }),
    aposCiclo: cicloGestao(db, transporte, env, { env }),
    envio: { verificarVinculo: verificadorVinculoG006(), transporte: transporteResultadoG006(transporte), env },
    encerrar: () => prisma.$disconnect(),
  }
}
