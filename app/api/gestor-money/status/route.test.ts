import { afterEach, describe, expect, it } from "vitest"
import { GET } from "@/app/api/gestor-money/status/route"

describe("GET /api/gestor-money/status", () => {
  const prevEnv = {
    GESTOR_MONEY_ENABLED: process.env.GESTOR_MONEY_ENABLED,
    GESTOR_MONEY_STORAGE_G003_ENABLED: process.env.GESTOR_MONEY_STORAGE_G003_ENABLED,
    CONTADOR_STORAGE_PROVIDER: process.env.CONTADOR_STORAGE_PROVIDER,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: process.env.R2_BUCKET,
  }

  afterEach(() => {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it("retorna MODULE_DISABLED com Cache-Control privado e diagnóstico G003-STORAGE seguro quando desligado", async () => {
    delete process.env.GESTOR_MONEY_ENABLED
    delete process.env.GESTOR_MONEY_STORAGE_G003_ENABLED
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")

    const body = (await res.json()) as {
      ok: boolean
      foundationMerged: boolean
      moduleEnabled: boolean
      state: string
      contratos: Array<{ id: string; disponivelNoRuntime: boolean }>
      storageG003: {
        gate: string
        runtimeLiberado: boolean
        bloqueioCodigo: string | null
        variaveisFaltando: string[]
      }
    }
    expect(body.ok).toBe(true)
    expect(body.foundationMerged).toBe(true)
    expect(body.moduleEnabled).toBe(false)
    expect(body.state).toBe("MODULE_DISABLED")
    expect(body.contratos.map((c) => c.id)).toEqual([
      "G001",
      "G002",
      "G003",
      "G004",
      "G005",
      "G006",
      "G007",
    ])
    expect(body.contratos.every((c) => c.disponivelNoRuntime === false)).toBe(true)
    expect(body.storageG003.gate).toBe("G003-STORAGE")
    expect(body.storageG003.runtimeLiberado).toBe(false)
    expect(body.storageG003.bloqueioCodigo).toBe("flag_desligada")
  })

  it("retorna READY para G001–G005 mantendo G006/G007 desligados e G003-STORAGE fail-closed sem prova de privacidade R2", async () => {
    process.env.GESTOR_MONEY_ENABLED = "true"
    process.env.GESTOR_MONEY_STORAGE_G003_ENABLED = "true"
    process.env.CONTADOR_STORAGE_PROVIDER = "r2"
    process.env.R2_ACCOUNT_ID = "acc-test-id"
    process.env.R2_ACCESS_KEY_ID = "key-secret-value-never-leak"
    process.env.R2_SECRET_ACCESS_KEY = "super-secret-value-never-leak"
    process.env.R2_BUCKET = "bucket-privado-teste"

    const res = await GET()
    const text = await res.text()
    expect(text).not.toContain("key-secret-value-never-leak")
    expect(text).not.toContain("super-secret-value-never-leak")

    const body = JSON.parse(text) as {
      ok: boolean
      moduleEnabled: boolean
      state: string
      contratos: Array<{ id: string; disponivelNoRuntime: boolean; detalhe: string }>
      storageG003: {
        runtimeLiberado: boolean
        bloqueioCodigo: string | null
        privacidadeComprovadaNoRuntime: boolean
      }
    }
    expect(body.ok).toBe(true)
    expect(body.moduleEnabled).toBe(true)
    expect(body.state).toBe("READY")
    const byId = Object.fromEntries(body.contratos.map((c) => [c.id, c.disponivelNoRuntime]))
    expect(byId.G001).toBe(true)
    expect(byId.G002).toBe(true)
    expect(byId.G003).toBe(true)
    expect(byId.G004).toBe(true)
    expect(byId.G005).toBe(true)
    expect(byId.G006).toBe(false)
    expect(byId.G007).toBe(false)

    // Mesmo com flag e credenciais R2 preenchidas, sem prova positiva de privacidade o gate permanece fail-closed!
    expect(body.storageG003.runtimeLiberado).toBe(false)
    expect(body.storageG003.privacidadeComprovadaNoRuntime).toBe(false)
    expect(body.storageG003.bloqueioCodigo).toBe("privacidade_bucket_nao_comprovada")
  })
})
