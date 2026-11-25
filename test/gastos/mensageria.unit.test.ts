import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { credenciaisDoCanal } from "@/lib/gastos/channels"
import { codigoRedigido, MensageriaError } from "@/lib/gastos/messaging-types"
import { decidirFalha, type FalhaTransporte } from "@/lib/gastos/retry"
import { carregarConfigWorker } from "@/lib/gastos/worker"

const env = { GASTOS_WORKER_ENV: "teste", GASTOS_WORKER_DATABASE_URL: "postgresql://omni_gastos_worker@127.0.0.1:55516/gastos_g006_test" }
describe("G006 políticas técnicas", () => {
  it.each([
    [{ tipo: "HTTP", status: 429, rejeicaoComprovada: true }, "RETRY", "REJEICAO_429"],
    [{ tipo: "HTTP", status: 429 }, "INCERTO", "EXTERNO_AMBIGUO"],
    [{ tipo: "HTTP", status: 401 }, "DLQ", "AUTH_401_403"],
    [{ tipo: "HTTP", status: 403 }, "DLQ", "AUTH_401_403"],
    [{ tipo: "HTTP", status: 400 }, "DLQ", "PAYLOAD_PERMANENTE"],
    [{ tipo: "HTTP", status: 422 }, "DLQ", "PAYLOAD_PERMANENTE"],
    [{ tipo: "HTTP", status: 500 }, "INCERTO", "HTTP_5XX"],
    [{ tipo: "HTTP", status: 503 }, "INCERTO", "HTTP_5XX"],
    [{ tipo: "TIMEOUT" }, "INCERTO", "TIMEOUT"],
    [{ tipo: "DESCONHECIDA" }, "INCERTO", "EXTERNO_AMBIGUO"],
    [{ tipo: "TEMPORARIA_LOCAL" }, "INCERTO", "EXTERNO_AMBIGUO"],
    [{ tipo: "CONFIG" }, "DLQ", "CONFIG_INVALIDA"],
    [{ tipo: "PAYLOAD" }, "DLQ", "PAYLOAD_PERMANENTE"],
    [{ tipo: "POISON" }, "DLQ", "POISON_JOB"],
  ] as Array<[FalhaTransporte, string, string]>)("falha após tentativa %j → %s/%s", (falha, acao, codigo) => {
    expect(decidirFalha(falha, 1, true, 0)).toMatchObject({ acao, codigo })
  })

  it("backoff limitado, jitter determinístico e Retry-After sem orçamento infinito", () => {
    expect(decidirFalha({ tipo: "TEMPORARIA_LOCAL" }, 1, false, 0).esperaMs).toBe(500)
    expect(decidirFalha({ tipo: "TEMPORARIA_LOCAL" }, 2, false, 1).esperaMs).toBe(2000)
    expect(decidirFalha({ tipo: "TEMPORARIA_LOCAL" }, 50, false, 1).esperaMs).toBe(300000)
    expect(decidirFalha({ tipo: "HTTP", status: 429, rejeicaoComprovada: true, retryAfterMs: 9000 }, 1, true, 0).esperaMs).toBe(9000)
    expect(decidirFalha({ tipo: "HTTP", status: 429, rejeicaoComprovada: true, retryAfterMs: Infinity }, 1, true, 0).esperaMs).toBe(500)
  })

  it("credencial vem exclusivamente da referência do canal exato", () => {
    const canal = { phoneNumberId: "900006", credencialRef: "WHATSAPP_CANAL_TOKEN_EXATO" }
    expect(credenciaisDoCanal(canal, { WHATSAPP_CANAL_TOKEN_EXATO: "synthetic", WHATSAPP_ACCESS_TOKEN: "errado" })).toEqual({ phoneNumberId: "900006", accessToken: "synthetic" })
    expect(() => credenciaisDoCanal(canal, { WHATSAPP_ACCESS_TOKEN: "errado" })).toThrow("CONFIG_INVALIDA")
  })

  it.each(["DATABASE_URL", "GASTOS_WORKER_DATABASE_URL", "NEXTAUTH_SECRET"])("referência %s nunca resolve segredo de outra finalidade", credencialRef => {
    expect(() => credenciaisDoCanal({ phoneNumberId: "900006", credencialRef }, { [credencialRef]: "synthetic-private" })).toThrow("CONFIG_INVALIDA")
  })

  it.each([
    { GASTOS_WORKER_CONCURRENCY: "0" }, { GASTOS_WORKER_CONCURRENCY: "9" }, { GASTOS_WORKER_LEASE_MS: "NaN" },
    { GASTOS_WORKER_MODE: "META_REAL" }, { GASTOS_WORKER_ENV: "production" }, { GASTOS_WORKER_DATABASE_URL: "postgresql://omni_gastos_worker@127.0.0.1:55516/omnigestao_prod" },
    { GASTOS_WORKER_DATABASE_URL: "postgresql://root@127.0.0.1:55516/gastos_g006_test" },
    { GASTOS_WORKER_SEND_TIMEOUT_MS: "30000" }, { GASTOS_WORKER_SHUTDOWN_MS: "1000" },
    { GASTOS_WORKER_DATABASE_URL: "postgresql://%ZZ@127.0.0.1:55516/gastos_g006_test" },
  ])("configuração inválida falha antes de bootstrap %j", patch => {
    expect(() => carregarConfigWorker({ ...env, ...patch }, "24.22.1")).toThrow("CONFIG_INVALIDA")
  })

  it("Node24 explícito, cloud sem local/produção/SSL omitido", () => {
    expect(carregarConfigWorker(env, "24.22.1")).toMatchObject({ concorrencia: 1, modo: "STAGING" })
    expect(() => carregarConfigWorker(env, "26.12.1")).toThrow("CONFIG_INVALIDA")
    const cloud = { GASTOS_WORKER_ENV: "homologacao", GASTOS_WORKER_APPROVED_DATABASE: "gastos_g006_hml_synthetic", GASTOS_WORKER_DATABASE_URL: "postgresql://omni_gastos_worker@synthetic.example.invalid/gastos_g006_hml_synthetic?sslmode=require" }
    expect(carregarConfigWorker(cloud, "24.22.1").ambiente).toBe("homologacao")
    expect(() => carregarConfigWorker({ ...cloud, GASTOS_WORKER_MODE: "SIMULADO" }, "24.22.1")).toThrow("CONFIG_INVALIDA")
    expect(() => carregarConfigWorker({ ...cloud, GASTOS_WORKER_DATABASE_URL: cloud.GASTOS_WORKER_DATABASE_URL.replace("?sslmode=require", "") }, "24.22.1")).toThrow("CONFIG_INVALIDA")
    expect(() => carregarConfigWorker({ ...cloud, GASTOS_WORKER_APPROVED_DATABASE: undefined }, "24.22.1")).toThrow("CONFIG_INVALIDA")
    expect(() => carregarConfigWorker({ ...cloud, GASTOS_WORKER_APPROVED_DATABASE: "gastos_g006_hml_outro" }, "24.22.1")).toThrow("CONFIG_INVALIDA")
  })

  it.each(["sslaccept=accept_invalid_certs", "host=outro.example.invalid", "schema=private", "sslmode=disable", "options=unsafe"])("homologação recusa override de conexão %s", parametro => {
    expect(() => carregarConfigWorker({ GASTOS_WORKER_ENV: "homologacao", GASTOS_WORKER_APPROVED_DATABASE: "gastos_g006_hml_synthetic",
      GASTOS_WORKER_DATABASE_URL: "postgresql://omni_gastos_worker@synthetic.example.invalid/gastos_g006_hml_synthetic?sslmode=require&" + parametro }, "24.22.1")).toThrow("CONFIG_INVALIDA")
  })

  it("redação descarta corpo de erro de provider/SQL, telefone e token", () => {
    const segredo = "synthetic-token-private-15550060001-4000"
    expect(codigoRedigido(new Error(segredo))).toBe("DB_INDISPONIVEL")
    expect(codigoRedigido(new MensageriaError("TIMEOUT"))).toBe("TIMEOUT")
    expect(JSON.stringify({ evento: "FALHA", codigo: codigoRedigido(new Error(segredo)) })).not.toContain(segredo)
  })

  it("grafo do worker não chama mutação financeira, browser ou transporte Meta", () => {
    for (const nome of ["queue.ts", "outbox.ts", "worker.ts"]) {
      const texto = readFileSync(resolve(process.cwd(), "lib/gastos", nome), "utf8")
      expect(texto).not.toMatch(/from ["'].*(?:apply|operacoes|next\/headers|auth\.ts)["']/)
      expect(texto).not.toMatch(/\b(?:fetch|sendTextMessage|aplicarOperacaoGasto)\s*\(/)
    }
    const entry = readFileSync(resolve(process.cwd(), "workers/gastos/index.ts"), "utf8")
    expect(entry).not.toMatch(/dotenv|next\/|whatsapp\.com|graph\.facebook/)
  })
})
