/**
 * STORE-SETTINGS-ACCESS-CONTROL-004 — controle de acesso por loja em StoreSettings.
 *
 * Exercita os handlers GET/PUT de PRODUÇÃO (`./route`) sobre os guards canônicos
 * reais (`requireStoreAccess` / `requireEnterpriseWith` + matriz
 * `admin.configuracoes`). Só identidade (`@/auth`) e persistência/auditoria são
 * mockadas. Prova que:
 *  - GET sem sessão → 401 sem tocar o Prisma;
 *  - GET com acesso à loja → 200 com `{ settings }` (inclusive papel não-admin,
 *    que o PDV runtime usa para ler `pdvParams`);
 *  - GET cross-store → 403 sem tocar o Prisma;
 *  - PUT sem sessão → 401 sem write;
 *  - PUT cross-store → 403 sem write;
 *  - PUT com acesso à loja mas sem `admin.configuracoes` → 403 sem write;
 *  - PUT autorizado preserva update e criação (upsert com `storeId` da URL);
 *  - tentativa negada nunca chama findUnique/upsert;
 *  - auditoria (`recordConfigAuditChanges`) executa após escrita autorizada e
 *    sua falha não bloqueia o save.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<unknown> => null),
  findUnique: vi.fn(async (): Promise<unknown> => null),
  upsert: vi.fn(async (): Promise<unknown> => null),
  recordAudit: vi.fn(async (): Promise<number> => 1),
}))

vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    storeSettings: { findUnique: h.findUnique, upsert: h.upsert },
    $transaction: async (fn: (tx: {
      $queryRaw: (...args: unknown[]) => Promise<unknown>
      storeSettings: { findUnique: typeof h.findUnique; upsert: typeof h.upsert }
    }) => Promise<unknown>) =>
      fn({
        $queryRaw: async () => [{ lock: "" }],
        storeSettings: { findUnique: h.findUnique, upsert: h.upsert },
      }),
  },
}))
vi.mock("@/lib/config-audit/record", () => ({
  recordConfigAuditChanges: h.recordAudit,
}))

import { GET, PUT } from "./route"

function sessao(over: Record<string, unknown> = {}) {
  return {
    user: {
      id: "user-1",
      email: "u@omni.test",
      name: "U",
      role: "ADMIN",
      storeAccess: "all",
      ...over,
    },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  }
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

function putReq(body: unknown) {
  return new Request("http://localhost/api/stores/loja-a/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  h.auth.mockReset()
  h.auth.mockResolvedValue(null)
  h.findUnique.mockReset()
  h.findUnique.mockResolvedValue(null)
  h.upsert.mockReset()
  h.upsert.mockResolvedValue(null)
  h.recordAudit.mockReset()
  h.recordAudit.mockResolvedValue(1)
})

describe("GET /api/stores/[id]/settings — autorização", () => {
  it("sem autenticação → 401 sem ler StoreSettings", async () => {
    h.auth.mockResolvedValue(null)

    const res = await GET(new Request("http://localhost/api/stores/loja-a/settings"), ctx("loja-a"))
    const body = (await res.json()) as { settings: unknown; error?: string }

    expect(res.status).toBe(401)
    expect(body.settings).toBeNull()
    expect(typeof body.error).toBe("string")
    expect(h.findUnique).not.toHaveBeenCalled()
  })

  it("loja permitida → 200 mantém leitura normal", async () => {
    h.auth.mockResolvedValue(sessao({ role: "ADMIN" }))
    const row = { storeId: "loja-a", contactEmail: "a@x.com", printerConfig: { pdvParams: {} } }
    h.findUnique.mockResolvedValue(row)

    const res = await GET(new Request("http://localhost/api/stores/loja-a/settings"), ctx("loja-a"))
    const body = (await res.json()) as { settings: unknown }

    expect(res.status).toBe(200)
    expect(body.settings).toEqual(row)
    expect(h.findUnique).toHaveBeenCalledWith({ where: { storeId: "loja-a" } })
  })

  it("SUPER_ADMIN com acesso permitido → 200", async () => {
    h.auth.mockResolvedValue(sessao({ role: "SUPER_ADMIN" }))
    const row = { storeId: "loja-a", contactEmail: "a@x.com" }
    h.findUnique.mockResolvedValue(row)

    const res = await GET(new Request("http://localhost/api/stores/loja-a/settings"), ctx("loja-a"))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ settings: row })
  })

  it("PDV da própria loja sem papel admin continua lendo pdvParams → 200", async () => {
    h.auth.mockResolvedValue(
      sessao({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] }),
    )
    const row = { storeId: "loja-a", printerConfig: { pdvParams: { pdvClassicLayout: "lovable" } } }
    h.findUnique.mockResolvedValue(row)

    const res = await GET(new Request("http://localhost/api/stores/loja-a/settings"), ctx("loja-a"))
    const body = (await res.json()) as { settings: { printerConfig: { pdvParams: object } } }

    expect(res.status).toBe(200)
    expect(body.settings.printerConfig.pdvParams).toEqual({ pdvClassicLayout: "lovable" })
  })

  it("restrito à loja A tentando ler loja B → 403 sem ler StoreSettings", async () => {
    h.auth.mockResolvedValue(
      sessao({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] }),
    )

    const res = await GET(new Request("http://localhost/api/stores/loja-b/settings"), ctx("loja-b"))
    const body = (await res.json()) as { settings: unknown; error?: string }

    expect(res.status).toBe(403)
    expect(body.settings).toBeNull()
    expect(typeof body.error).toBe("string")
    expect(h.findUnique).not.toHaveBeenCalled()
  })
})

describe("PUT /api/stores/[id]/settings — autorização", () => {
  it("sem sessão → 401 sem write", async () => {
    h.auth.mockResolvedValue(null)

    const res = await PUT(putReq({ contactEmail: "novo@x.com" }), ctx("loja-a"))
    const body = (await res.json()) as { ok: boolean; error?: string }

    expect(res.status).toBe(401)
    expect(body.ok).toBe(false)
    expect(h.findUnique).not.toHaveBeenCalled()
    expect(h.upsert).not.toHaveBeenCalled()
    expect(h.recordAudit).not.toHaveBeenCalled()
  })

  it("cross-store negado → 403 sem write", async () => {
    h.auth.mockResolvedValue(
      sessao({ role: "ADMIN", storeAccess: "restricted", allowedStoreIds: ["loja-a"] }),
    )

    const res = await PUT(putReq({ contactEmail: "novo@x.com" }), ctx("loja-b"))
    const body = (await res.json()) as { ok: boolean; error?: string }

    expect(res.status).toBe(403)
    expect(body.ok).toBe(false)
    expect(h.findUnique).not.toHaveBeenCalled()
    expect(h.upsert).not.toHaveBeenCalled()
    expect(h.recordAudit).not.toHaveBeenCalled()
  })

  it("com acesso à loja mas sem admin.configuracoes → 403 sem write", async () => {
    h.auth.mockResolvedValue(
      sessao({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] }),
    )

    const res = await PUT(putReq({ contactEmail: "novo@x.com" }), ctx("loja-a"))
    const body = (await res.json()) as { ok: boolean; error?: string }

    expect(res.status).toBe(403)
    expect(body.ok).toBe(false)
    expect(h.findUnique).not.toHaveBeenCalled()
    expect(h.upsert).not.toHaveBeenCalled()
    expect(h.recordAudit).not.toHaveBeenCalled()
  })

  it("autorizado preserva update", async () => {
    h.auth.mockResolvedValue(sessao({ role: "ADMIN" }))
    const existing = { storeId: "loja-a", contactEmail: "antigo@x.com" }
    const updated = { storeId: "loja-a", contactEmail: "novo@x.com" }
    h.findUnique.mockResolvedValue(existing)
    h.upsert.mockResolvedValue(updated)

    const res = await PUT(putReq({ contactEmail: "novo@x.com" }), ctx("loja-a"))
    const body = (await res.json()) as { ok: boolean; settings: unknown }

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, settings: updated })
    expect(h.findUnique).toHaveBeenCalledWith({ where: { storeId: "loja-a" } })
    expect(h.upsert).toHaveBeenCalledTimes(1)
    const upsertCalls: unknown[][] = h.upsert.mock.calls as unknown[][]
    const upsertArg = (upsertCalls[0] as unknown[])[0] as {
      where: { storeId: string }
      update: { contactEmail: string }
    }
    expect(upsertArg.where).toEqual({ storeId: "loja-a" })
    expect(upsertArg.update.contactEmail).toBe("novo@x.com")
  })

  it("autorizado preserva criação de settings quando ausente", async () => {
    h.auth.mockResolvedValue(sessao({ role: "ADMIN" }))
    h.findUnique.mockResolvedValue(null)
    const created = { storeId: "loja-a", contactEmail: "novo@x.com" }
    h.upsert.mockResolvedValue(created)

    const res = await PUT(putReq({ contactEmail: "novo@x.com" }), ctx("loja-a"))
    const body = (await res.json()) as { ok: boolean; settings: unknown }

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, settings: created })
    const upsertCalls: unknown[][] = h.upsert.mock.calls as unknown[][]
    const upsertArg = (upsertCalls[0] as unknown[])[0] as {
      where: { storeId: string }
      create: { storeId: string; contactEmail: string }
    }
    expect(upsertArg.where).toEqual({ storeId: "loja-a" })
    expect(upsertArg.create.storeId).toBe("loja-a")
    expect(upsertArg.create.contactEmail).toBe("novo@x.com")
  })

  it("auditoria executa após escrita autorizada", async () => {
    h.auth.mockResolvedValue(sessao({ role: "ADMIN" }))
    h.findUnique.mockResolvedValue({ storeId: "loja-a", contactEmail: "antigo@x.com" })
    h.upsert.mockResolvedValue({ storeId: "loja-a", contactEmail: "novo@x.com" })

    const res = await PUT(putReq({ contactEmail: "novo@x.com" }), ctx("loja-a"))

    expect(res.status).toBe(200)
    expect(h.recordAudit).toHaveBeenCalledTimes(1)
    const [, params] = h.recordAudit.mock.calls[0] as unknown as [
      Request,
      { storeId: string; section: string; changes: Array<{ field: string }> },
    ]
    expect(params.storeId).toBe("loja-a")
    expect(params.changes.length).toBeGreaterThan(0)
    expect(params.changes.map((c) => c.field)).toContain("contactEmail")
  })

  it("falha de auditoria não bloqueia o save autorizado", async () => {
    h.auth.mockResolvedValue(sessao({ role: "ADMIN" }))
    h.findUnique.mockResolvedValue({ storeId: "loja-a", contactEmail: "antigo@x.com" })
    h.upsert.mockResolvedValue({ storeId: "loja-a", contactEmail: "novo@x.com" })
    h.recordAudit.mockRejectedValueOnce(new Error("audit down"))

    const res = await PUT(putReq({ contactEmail: "novo@x.com" }), ctx("loja-a"))
    const body = (await res.json()) as { ok: boolean }

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
  })
})

describe("PUT /api/stores/[id]/settings — Capabilities V1", () => {
  it("capabilities version=1 válido persiste com sucesso → 200", async () => {
    h.auth.mockResolvedValue(sessao({ role: "ADMIN" }))
    const existing = { storeId: "loja-a", printerConfig: {} }
    const updated = {
      storeId: "loja-a",
      printerConfig: {
        capabilities: { version: 1, overrides: { "pdv.tables": true } },
      },
    }
    h.findUnique.mockResolvedValue(existing)
    h.upsert.mockResolvedValue(updated)

    const res = await PUT(
      putReq({
        printerConfig: {
          capabilities: { version: 1, overrides: { "pdv.tables": true } },
        },
      }),
      ctx("loja-a"),
    )
    const body = (await res.json()) as { ok: boolean; settings: unknown }

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(h.upsert).toHaveBeenCalledTimes(1)
  })

  it("version diferente de 1 é rejeitado com 400", async () => {
    h.auth.mockResolvedValue(sessao({ role: "ADMIN" }))

    const res = await PUT(
      putReq({
        printerConfig: {
          capabilities: { version: 2, overrides: {} },
        },
      }),
      ctx("loja-a"),
    )
    const body = (await res.json()) as { ok: boolean; error: string }

    expect(res.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error).toContain("Versão de capabilities incompatível")
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it("capability desconhecida é rejeitada com 400", async () => {
    h.auth.mockResolvedValue(sessao({ role: "ADMIN" }))

    const res = await PUT(
      putReq({
        printerConfig: {
          capabilities: { version: 1, overrides: { "pdv.inventedFeature": true } },
        },
      }),
      ctx("loja-a"),
    )
    const body = (await res.json()) as { ok: boolean; error: string }

    expect(res.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error).toContain("Capability desconhecida")
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it("pdv.scale é explicitamente bloqueado e rejeitado com 400", async () => {
    h.auth.mockResolvedValue(sessao({ role: "ADMIN" }))

    const res = await PUT(
      putReq({
        printerConfig: {
          capabilities: { version: 1, overrides: { "pdv.scale": true } },
        },
      }),
      ctx("loja-a"),
    )
    const body = (await res.json()) as { ok: boolean; error: string }

    expect(res.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error).toContain("explicitamente bloqueada")
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it("sale.fractionalQty é explicitamente bloqueado e rejeitado com 400", async () => {
    h.auth.mockResolvedValue(sessao({ role: "ADMIN" }))

    const res = await PUT(
      putReq({
        printerConfig: {
          capabilities: { version: 1, overrides: { "sale.fractionalQty": true } },
        },
      }),
      ctx("loja-a"),
    )
    const body = (await res.json()) as { ok: boolean; error: string }

    expect(res.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error).toContain("explicitamente bloqueada")
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it("tentativa de escrever 'available' na raiz de capabilities é rejeitada com 400", async () => {
    h.auth.mockResolvedValue(sessao({ role: "ADMIN" }))

    const res = await PUT(
      putReq({
        printerConfig: {
          capabilities: { version: 1, available: true, overrides: {} },
        },
      }),
      ctx("loja-a"),
    )
    const body = (await res.json()) as { ok: boolean; error: string }

    expect(res.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error).toContain("autoridade do servidor")
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it("tentativa de escrever 'entitled' é rejeitada com 400", async () => {
    h.auth.mockResolvedValue(sessao({ role: "ADMIN" }))

    const res = await PUT(
      putReq({
        printerConfig: {
          capabilities: { version: 1, entitled: true, overrides: {} },
        },
      }),
      ctx("loja-a"),
    )
    const body = (await res.json()) as { ok: boolean; error: string }

    expect(res.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error).toContain("autoridade do servidor")
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it("tentativa de escrever 'plan' ou 'license' dentro de override é rejeitada com 400", async () => {
    h.auth.mockResolvedValue(sessao({ role: "ADMIN" }))

    const res = await PUT(
      putReq({
        printerConfig: {
          capabilities: {
            version: 1,
            overrides: {
              "pdv.tables": { enabled: true, plan: "enterprise" },
            },
          },
        },
      }),
      ctx("loja-a"),
    )
    const body = (await res.json()) as { ok: boolean; error: string }

    expect(res.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error).toContain("autoridade do servidor")
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it("merge não-destrutivo preserva campos irmãos e namespaces desconhecidos em printerConfig", async () => {
    h.auth.mockResolvedValue(sessao({ role: "ADMIN" }))
    const existing = {
      storeId: "loja-a",
      printerConfig: {
        impressao: { modelo: "generic-80mm", largura: 80 },
        pdvParams: { moduloControleConsumo: true },
        customNamespace: { chaveExistente: "valorPreservado" },
      },
    }
    h.findUnique.mockResolvedValue(existing)
    h.upsert.mockResolvedValue({ storeId: "loja-a" })

    const res = await PUT(
      putReq({
        printerConfig: {
          capabilities: { version: 1, overrides: { "pdv.tables": true } },
        },
      }),
      ctx("loja-a"),
    )

    expect(res.status).toBe(200)
    const upsertCalls = h.upsert.mock.calls as unknown[][]
    const upsertArg = (upsertCalls[0] as unknown[])[0] as {
      update: { printerConfig: Record<string, unknown> }
    }
    const merged = upsertArg.update.printerConfig

    // Preservou irmãos
    expect(merged.impressao).toEqual({ modelo: "generic-80mm", largura: 80 })
    expect(merged.pdvParams).toEqual({ moduloControleConsumo: true })
    expect(merged.customNamespace).toEqual({ chaveExistente: "valorPreservado" })
    // Adicionou capabilities
    expect(merged.capabilities).toEqual({ version: 1, overrides: { "pdv.tables": true } })
  })
})

describe("PUT /api/stores/[id]/settings — Backfill e Proteção contra Stale Device", () => {
  it("backfill grava valor quando o servidor está ausente", async () => {
    h.auth.mockResolvedValue(sessao({ role: "ADMIN" }))
    h.findUnique.mockResolvedValue({ storeId: "loja-a", printerConfig: {} })
    h.upsert.mockResolvedValue({ storeId: "loja-a" })

    const res = await PUT(
      putReq({
        printerConfig: { pdvMainLayout: "supermercado" },
        backfill: true,
      }),
      ctx("loja-a"),
    )

    expect(res.status).toBe(200)
    const upsertCalls = h.upsert.mock.calls as unknown[][]
    const upsertArg = (upsertCalls[0] as unknown[])[0] as {
      update: { printerConfig: Record<string, unknown> }
    }
    expect(upsertArg.update.printerConfig.pdvMainLayout).toBe("supermercado")
  })

  it("concorrência: Device B stale NÃO sobrescreve valor já gravado por Device A no backfill", async () => {
    h.auth.mockResolvedValue(sessao({ role: "ADMIN" }))
    // Simulação do cenário obrigatório:
    // Device A já gravou "supermercado" no servidor.
    // Device B (que tinha lido servidor vazio antes e possui legacy="classic") tenta gravar "classic" depois com backfill: true.
    const serverAlreadyHasA = {
      storeId: "loja-a",
      printerConfig: {
        pdvMainLayout: "supermercado",
      },
    }
    h.findUnique.mockResolvedValue(serverAlreadyHasA)
    h.upsert.mockResolvedValue(serverAlreadyHasA)

    const resB = await PUT(
      putReq({
        printerConfig: { pdvMainLayout: "classic" },
        backfill: true,
      }),
      ctx("loja-a"),
    )

    expect(resB.status).toBe(200)
    const upsertCalls = h.upsert.mock.calls as unknown[][]
    const upsertArg = (upsertCalls[0] as unknown[])[0] as {
      update: { printerConfig: Record<string, unknown> }
    }
    // Servidor continua "supermercado", rejeitando a sobrescrita stale de B!
    expect(upsertArg.update.printerConfig.pdvMainLayout).toBe("supermercado")
  })
})
