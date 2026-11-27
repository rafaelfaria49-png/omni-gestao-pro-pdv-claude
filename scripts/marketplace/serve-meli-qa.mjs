#!/usr/bin/env node
import { spawn } from "node:child_process"
import { once } from "node:events"
import { readFile } from "node:fs/promises"
import { isIP } from "node:net"
import { createMarketplaceQaIngress, waitForQaNext } from "./qa-ingress.mjs"
import { attestMarketplaceQaDatasource } from "./qa-datasource.mjs"

async function serve() {
  const source = process.env
  const origin = source.MELI_QA_ORIGIN
  const listenHost = source.MELI_QA_LISTEN_HOST ?? "127.0.0.1"
  const appPort = Number(source.MELI_QA_APP_PORT ?? 3120)
  const parsed = new URL(origin)
  if (source.VERCEL_ENV !== "preview" || source.VERCEL === "1" || source.NODE_DEBUG || source.NODE_OPTIONS ||
      !source.AUTH_SECRET || !isIP(listenHost) ||
      parsed.protocol !== "https:" || parsed.origin !== origin || Number(parsed.port || 443) === appPort) {
    throw new Error("Configuração de QA inválida.")
  }
  if (source.MELI_OAUTH_ENABLED === "1" &&
      source.MELI_OAUTH_REDIRECT_URI !== origin + "/api/marketplace/mercado-livre/callback") {
    throw new Error("Redirect URI fora da origem de QA.")
  }
  // O processo usa exatamente o par de conexões atestado, sem procurar um fallback de Production.
  const env = {
    ...source, NODE_ENV: "production", VERCEL: "0", VERCEL_ENV: "preview",
    MIGRATION_AUTHORITY_ENABLED: "false", AUTH_URL: origin, NEXTAUTH_URL: origin, AUTH_TRUST_HOST: "true",
    AUTH_SESSION_REVOCATION: "on", NEXT_TELEMETRY_DISABLED: "1", OTEL_SDK_DISABLED: "true", OTEL_TRACES_EXPORTER: "none",
    MELI_OAUTH_ENABLED: source.MELI_OAUTH_ENABLED === "1" ? "1" : "0",
  }
  for (const name of ["NEXTAUTH_SECRET", "AUTH_SECRET_1", "AUTH_SECRET_2", "AUTH_SECRET_3"]) env[name] = ""
  await attestMarketplaceQaDatasource(env)
  const [key, cert] = await Promise.all([readFile(source.MELI_QA_TLS_KEY_FILE), readFile(source.MELI_QA_TLS_CERT_FILE)])
  const ingress = createMarketplaceQaIngress({
    origin, upstreamPort: appPort, tls: { key, cert },
    record: (event) => console.log(JSON.stringify(event)),
  })
  // Saída arbitrária de Next.js, instrumentação e erros do provedor não passam para o supervisor do host.
  const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(appPort)], {
    env,
    stdio: ["ignore", "pipe", "ignore"],
  })
  const ready = waitForQaNext(app)
  app.stdout.resume()
  const done = new Promise((resolve) => app.once("exit", (...result) => resolve(result)))
  const stop = () => { app.kill(); ingress.close() }
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
  try {
    await ready
    ingress.listen(Number(parsed.port || 443), listenHost)
    await once(ingress, "listening")
    console.log("MARKETPLACE_QA_HTTPS_LISTENING")
    const [status, signal] = await done
    if (status !== 0 && !signal) throw new Error("Runtime de QA indisponível.")
  } finally {
    stop()
    process.off("SIGINT", stop)
    process.off("SIGTERM", stop)
  }
}

serve().catch(() => {
  console.error("MARKETPLACE_QA_START_BLOCKED")
  process.exitCode = 1
})
