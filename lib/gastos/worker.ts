import { randomUUID } from "node:crypto"
import { setTimeout as esperar } from "node:timers/promises"
import { z } from "zod"
import { localFixtureDatasource, nonproductionDatasource } from "../db/datasource-policy.mjs"
import { exigirPapelSql } from "./channels"
import { codigoRedigido, MensageriaError, type MensageriaClient } from "./messaging-types"
import { claimJob, concluirStaging, falharJob, renovarLease, type Claim } from "./queue"
import { executarEnvio, prepararOutbox, type DependenciasEnvio } from "./outbox"

const numero = (padrao: number, minimo: number, maximo: number) => z.coerce.number().int().min(minimo).max(maximo).default(padrao)
const configSchema = z.object({ ambiente: z.enum(["teste", "homologacao"]), databaseUrl: z.string().url(),
  bancoHomologacao: z.string().regex(/^gastos_g006_hml_[a-z0-9_]{1,48}$/).optional(),
  modo: z.enum(["STAGING", "SIMULADO"]).default("STAGING"), concorrencia: numero(1, 1, 8), leaseMs: numero(30_000, 3000, 300_000),
  pollMs: numero(1000, 100, 30_000), envioTimeoutMs: numero(10_000, 1, 60_000), shutdownMs: numero(20_000, 1000, 60_000),
})
export type ConfigWorker = z.infer<typeof configSchema>

/**
 * Datasource Guard (#404) do worker: `teste` só em loopback descartável (recusa nomes de produção);
 * `homologacao` só em alvo hospedado ATESTADO como Preview na política — nunca Production. Um banco de
 * homologação do worker só passa depois de atestado em `lib/db/datasource-policy.mjs`.
 */
export function autorizarDatasourceWorker(ambiente: ConfigWorker["ambiente"], url: string): void {
  if (ambiente === "teste") localFixtureDatasource(url)
  else nonproductionDatasource({ VERCEL: "1", VERCEL_ENV: "preview", DATABASE_URL: url, DIRECT_URL: url })
}

/** Não carrega .env, não altera Node global e não permite produção neste GOAL. */
export function carregarConfigWorker(env: Record<string, string | undefined>, nodeVersion = process.versions.node,
  autorizarDatasource: typeof autorizarDatasourceWorker = autorizarDatasourceWorker): ConfigWorker {
  if (nodeVersion.split(".")[0] !== "24") throw new MensageriaError("CONFIG_INVALIDA")
  const parsed = configSchema.safeParse({ ambiente: env.GASTOS_WORKER_ENV, databaseUrl: env.GASTOS_WORKER_DATABASE_URL,
    modo: env.GASTOS_WORKER_MODE, concorrencia: env.GASTOS_WORKER_CONCURRENCY, leaseMs: env.GASTOS_WORKER_LEASE_MS,
    pollMs: env.GASTOS_WORKER_POLL_MS, envioTimeoutMs: env.GASTOS_WORKER_SEND_TIMEOUT_MS, shutdownMs: env.GASTOS_WORKER_SHUTDOWN_MS,
    bancoHomologacao: env.GASTOS_WORKER_APPROVED_DATABASE })
  if (!parsed.success) throw new MensageriaError("CONFIG_INVALIDA")
  const c = parsed.data, url = new URL(c.databaseUrl), local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  let usuario: string
  try { usuario = decodeURIComponent(url.username) } catch { throw new MensageriaError("CONFIG_INVALIDA") }
  if (c.ambiente === "homologacao") {
    const permitidos = new Set(["sslmode", "sslaccept", "connection_limit", "pool_timeout", "schema"])
    for (const [chave, valor] of url.searchParams) {
      if (!permitidos.has(chave) || url.searchParams.getAll(chave).length !== 1
        || (chave === "sslaccept" && valor !== "strict") || (chave === "schema" && valor !== "public")
        || (["connection_limit", "pool_timeout"].includes(chave) && (!/^[1-9][0-9]?$/.test(valor) || Number(valor) > 60))) {
        throw new MensageriaError("CONFIG_INVALIDA")
      }
    }
  }
  if (!["postgresql:", "postgres:"].includes(url.protocol) || usuario !== "omni_gastos_worker"
    || (c.ambiente === "teste" ? !local || url.pathname !== "/gastos_g006_test"
      : local || !c.bancoHomologacao || url.pathname !== "/" + c.bancoHomologacao || url.searchParams.get("sslmode") !== "require")
    || (c.modo === "SIMULADO" && c.ambiente !== "teste") || c.envioTimeoutMs >= c.leaseMs || c.shutdownMs < c.envioTimeoutMs) {
    throw new MensageriaError("CONFIG_INVALIDA")
  }
  // Por último: as regras acima valem por si; o guard da #404 é a barreira final de identidade do banco.
  try { autorizarDatasource(c.ambiente, c.databaseUrl) } catch { throw new MensageriaError("CONFIG_INVALIDA") }
  return c
}

export async function validarPapelWorker(db: MensageriaClient) {
  await exigirPapelSql(db, "omni_gastos_worker")
  const [r] = await db.$queryRaw<Array<{ indevido: boolean; owner: boolean; rls: boolean; criado: boolean }>>`SELECT
    (EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m','f')
      AND ((has_any_column_privilege(current_user,c.oid,'INSERT') AND c.relname NOT IN ('gastos_origens_canal','gastos_jobs','gastos_job_eventos','gastos_worker_pulsos'))
        OR (has_any_column_privilege(current_user,c.oid,'UPDATE') AND c.relname NOT IN ('whatsapp_gestao_inbox','gastos_jobs','gastos_worker_pulsos'))
        OR has_table_privilege(current_user,c.oid,'DELETE,TRUNCATE')))
      OR EXISTS(SELECT 1 FROM pg_roles p WHERE p.rolname<>current_user AND pg_has_role(current_user,p.oid,'MEMBER'))
      OR has_schema_privilege(current_user,'public','CREATE') OR has_database_privilege(current_user,current_database(),'CREATE')
      -- EXECUTE indevido = função SECURITY DEFINER fora da allowlist OU qualquer GRANT EXPLÍCITO ao worker.
      -- Funções de invocador executáveis só pelo padrão PUBLIC (ex.: p03_*/vestuario_* de outros módulos) não
      -- dão ao worker nada além dos próprios privilégios. Allowlist: helpers G006 + auxiliares de RLS do Gestor
      -- Money avaliados pelas policies (gm_*) + validador G004 somente leitura.
      OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
        AND p.prorettype<>'trigger'::regtype AND has_function_privilege(current_user,p.oid,'EXECUTE')
        AND p.oid NOT IN ('public.g006_autorizar_escopo(text,text,text)'::regprocedure,'public.g006_canal_vigente(text)'::regprocedure,
          'public.gm_papel_g006()'::regprocedure,'public.gm_perfil_pessoal_contexto()'::regprocedure,'public.gm_contexto_owner()'::regprocedure)
        AND NOT (p.oid='public.g004_compensacao_individual_valida(jsonb)'::regprocedure AND NOT p.prosecdef AND p.provolatile='s')
        AND (p.prosecdef OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND a.privilege_type='EXECUTE')))
      OR EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m','f')
      AND has_any_column_privilege(current_user,c.oid,'SELECT') AND c.relname NOT IN ('whatsapp_canais','whatsapp_gestao_inbox',
        'gastos_origens_canal','gastos_jobs','gastos_job_eventos','gastos_worker_pulsos','financeiro_operacoes','gastos_outbox'))) AS indevido,
    EXISTS(SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE r.rolname=current_user AND c.relnamespace='public'::regnamespace) AS owner,
    (SELECT count(*)=6 AND bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('whatsapp_canais'::regclass,'whatsapp_gestao_inbox'::regclass,
      'gastos_origens_canal'::regclass,'gastos_jobs'::regclass,'gastos_job_eventos'::regclass,'gastos_worker_pulsos'::regclass)) AS rls,
    (SELECT rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname=current_user) AS criado`
  if (!r || r.indevido || r.owner || !r.rls || r.criado) throw new MensageriaError("CONFIG_INVALIDA")
}

export async function metricasWorker(db: MensageriaClient) {
  const rows = await db.$queryRaw<Array<{ estado: string; quantidade: number }>>`SELECT estado,count(*)::int AS quantidade FROM gastos_jobs GROUP BY estado`
  const [r] = await db.$queryRaw<Array<{ canaisPendentes: number; pulsosExpirados: number }>>`SELECT
    (SELECT count(DISTINCT i."canalId")::int FROM gastos_jobs j JOIN gastos_origens_canal o ON o.id=j."origemId"
      JOIN whatsapp_gestao_inbox i ON i.id=o."inboxId" WHERE j.tipo='ENVIAR_RESULTADO' AND j.estado<>'CONCLUIDO') AS "canaisPendentes",
    (SELECT count(*)::int FROM gastos_worker_pulsos WHERE "ultimoPulso"<=clock_timestamp()-interval '60 seconds') AS "pulsosExpirados"`
  return { ...Object.fromEntries(rows.map(r => [r.estado, r.quantidade])), CANAIS_COM_SAIDA_PENDENTE: r.canaisPendentes, PULSOS_EXPIRADOS: r.pulsosExpirados }
}

export async function healthWorker(db: MensageriaClient, config: Pick<ConfigWorker, "modo">) {
  await validarPapelWorker(db)
  const [r] = await db.$queryRaw<Array<{ ativo: boolean }>>`SELECT EXISTS(SELECT 1 FROM gastos_worker_pulsos
    WHERE estado='ATIVO' AND "ultimoPulso">clock_timestamp()-interval '60 seconds') AS ativo`
  return { ok: r.ativo, versao: "g006-1", modo: config.modo, metricas: await metricasWorker(db) }
}

export async function processarClaim(db: MensageriaClient, claim: Claim, config: ConfigWorker, envio?: DependenciasEnvio, signal?: AbortSignal) {
  const pararPulso = new AbortController(), trabalho = new AbortController()
  const abortar = () => trabalho.abort()
  signal?.addEventListener("abort", abortar, { once: true })
  if (signal?.aborted) trabalho.abort()
  let erroLease: unknown
  const pulso = (async () => {
    while (!pararPulso.signal.aborted) {
      try { await esperar(Math.floor(config.leaseMs / 3), undefined, { signal: pararPulso.signal }) } catch { return }
      try { await renovarLease(db, claim, config.leaseMs) } catch (error) { erroLease = error; trabalho.abort(); return }
    }
  })()
  try {
    if (claim.tipo === "STAGING") await concluirStaging(db, claim)
    else if (claim.tipo === "ENVIAR_RESULTADO" && config.modo === "SIMULADO" && envio?.transporte?.modo === "SIMULADO") {
      await executarEnvio(db, claim, { ...envio, timeoutMs: config.envioTimeoutMs }, trabalho.signal)
    } else await falharJob(db, claim, { acao: "DLQ", codigo: "POISON_JOB", esperaMs: 0 })
    if (erroLease) throw erroLease
  } catch (error) {
    if (error instanceof MensageriaError && error.codigo === "POISON_JOB") {
      await falharJob(db, claim, { acao: "DLQ", codigo: "POISON_JOB", esperaMs: 0 })
    } else throw error
  } finally {
    pararPulso.abort(); await pulso; signal?.removeEventListener("abort", abortar)
  }
}

export type EventoWorker = { evento: "INICIO" | "PULSO" | "FALHA" | "PARADA"; codigo?: string; versao: "g006-1"; metricas?: Record<string, number> }

export async function rodarWorker(db: MensageriaClient, config: ConfigWorker, options: {
  signal: AbortSignal; once?: boolean; envio?: DependenciasEnvio; observar?: (evento: EventoWorker) => void;
}) {
  await validarPapelWorker(db)
  if (config.modo === "SIMULADO" && !options.envio?.transporte) throw new MensageriaError("CONFIG_INVALIDA")
  const owner = randomUUID(), observar = options.observar ?? (() => {})
  // Pulsos não são claims. Expira metadados mortos sem apagar histórico.
  await db.$executeRaw`UPDATE gastos_worker_pulsos SET estado='PARADO' WHERE estado='ATIVO' AND "ultimoPulso"<=clock_timestamp()-interval '60 seconds'`
  await db.gastoWorkerPulso.create({ data: { id: owner, versao: "g006-1", estado: "ATIVO" } })
  observar({ evento: "INICIO", versao: "g006-1" })
  const pararPulso = new AbortController()
  const pulso = (async () => {
    while (!pararPulso.signal.aborted) {
      try { await esperar(5000, undefined, { signal: pararPulso.signal }) } catch { return }
      try { await db.$executeRaw`UPDATE gastos_worker_pulsos SET estado='ATIVO',"ultimoPulso"=clock_timestamp() WHERE id=${owner}` }
      catch (error) { observar({ evento: "FALHA", versao: "g006-1", codigo: codigoRedigido(error) }) }
    }
  })()
  try {
    do {
      try {
        await db.$executeRaw`UPDATE gastos_worker_pulsos SET "ultimoPulso"=clock_timestamp() WHERE id=${owner}`
        if (config.modo === "SIMULADO") await prepararOutbox(db)
        const resultados = await Promise.allSettled(Array.from({ length: config.concorrencia }, async () => {
          if (options.signal.aborted) return
          const claim = await claimJob(db, owner, config.leaseMs, config.modo === "SIMULADO")
          if (claim) await processarClaim(db, claim, config, options.envio, options.signal)
        }))
        const falhou = resultados.find(r => r.status === "rejected")
        if (falhou?.status === "rejected") throw falhou.reason
        observar({ evento: "PULSO", versao: "g006-1", metricas: await metricasWorker(db) })
      } catch (error) {
        observar({ evento: "FALHA", versao: "g006-1", codigo: codigoRedigido(error) })
        if (options.once) throw new MensageriaError(codigoRedigido(error))
      }
      if (options.once || options.signal.aborted) break
      try { await esperar(config.pollMs, undefined, { signal: options.signal }) } catch { break }
    } while (!options.signal.aborted)
  } finally {
    pararPulso.abort(); await pulso
    await db.$executeRaw`UPDATE gastos_worker_pulsos SET estado='PARADO',"ultimoPulso"=clock_timestamp() WHERE id=${owner}`
    observar({ evento: "PARADA", versao: "g006-1" })
  }
}
