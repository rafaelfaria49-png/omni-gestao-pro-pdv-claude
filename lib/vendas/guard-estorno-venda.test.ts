/**
 * GOAL 007A · BLOCKER-1 — step-up de supervisor EXIGIDO NO SERVIDOR.
 *
 * Cobre sem token, token inválido, token expirado, token válido, o vínculo com
 * utilizador/loja e — desde o 007B — o vínculo por AÇÃO e por VENDA. O token é produzido pelo emissor REAL
 * (`createPinAuthorizationToken`) — nada de fixture forjada à mão, para que uma mudança
 * no formato quebre este teste em vez de passar silenciosamente.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  ADMIN_AUTHORIZATION_COOKIE,
  PIN_AUTHORIZATION_MAX_AGE_SECONDS,
  createPinAuthorizationToken,
} from "@/lib/auth/pin-authorization"
import { ESTORNO_STEP_UP_ACTION } from "@/lib/vendas/estorno-step-up-contract"
// `vi.mock` abaixo é içado pelo vitest acima deste import, então o guard já carrega
// com `next/headers` e `@/lib/prisma` substituídos.
import { requireEstornoStepUp } from "./guard-estorno-venda"

const SECRET = "segredo-de-teste-nao-usado-em-producao"
const cookieJar = new Map<string, string>()

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (cookieJar.has(n) ? { value: cookieJar.get(n) } : undefined) }),
}))

const findFirst = vi.fn()
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findFirst: (...a: unknown[]) => findFirst(...a) } } }))

const USER = "operador-1"
const STORE = "loja-1"
const SUPER = "supervisor-9"
const VENDA_A = "VDA-L01-2026-000A"
const VENDA_B = "VDA-L01-2026-000B"

async function armarToken(
  over: {
    userId?: string
    storeId?: string
    nowMs?: number
    /** `null` emite token GENÉRICO (sem escopo), como o fluxo legado. */
    action?: string | null
    resource?: string | null
  } = {},
) {
  const tk = await createPinAuthorizationToken(
    {
      userId: over.userId ?? USER,
      storeId: over.storeId ?? STORE,
      supervisorId: SUPER,
      ...(over.action === null ? {} : { action: over.action ?? ESTORNO_STEP_UP_ACTION }),
      ...(over.resource === null ? {} : { resource: over.resource ?? VENDA_A }),
    },
    SECRET,
    over.nowMs ?? Date.now(),
  )
  cookieJar.set(ADMIN_AUTHORIZATION_COOKIE, tk)
  return tk
}

beforeEach(() => {
  cookieJar.clear()
  findFirst.mockReset()
  findFirst.mockResolvedValue({ name: "Carla Souza" })
  process.env.AUTH_SECRET = SECRET
})

describe("§6A — sem autorização de step-up", () => {
  it("DENY com 403 e código estável, mesmo com sessão e permissão válidas", async () => {
    const r = await requireEstornoStepUp(USER, STORE, VENDA_A)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.status).toBe(403)
    expect(r.ok === false && r.code).toBe("step_up_required")
  })

  it("não consulta supervisor quando nem há token", async () => {
    await requireEstornoStepUp(USER, STORE, VENDA_A)
    expect(findFirst).not.toHaveBeenCalled()
  })
})

describe("§6B — token inválido / adulterado", () => {
  it("DENY para lixo", async () => {
    cookieJar.set(ADMIN_AUTHORIZATION_COOKIE, "nao-e-um-token")
    expect((await requireEstornoStepUp(USER, STORE, VENDA_A)).ok).toBe(false)
  })

  it("DENY quando o payload é alterado mantendo a assinatura (forja no browser)", async () => {
    const tk = await armarToken()
    const [body, sig] = tk.split(".")
    const alterado = JSON.parse(Buffer.from(body!, "base64url").toString())
    alterado.supervisorId = "invasor"
    const forjado = `${Buffer.from(JSON.stringify(alterado)).toString("base64url")}.${sig}`
    cookieJar.set(ADMIN_AUTHORIZATION_COOKIE, forjado)
    expect((await requireEstornoStepUp(USER, STORE, VENDA_A)).ok).toBe(false)
  })

  it("DENY quando o servidor não tem segredo configurado (fail-closed)", async () => {
    await armarToken()
    delete process.env.AUTH_SECRET
    delete process.env.NEXTAUTH_SECRET
    delete process.env.PIN_AUTHORIZATION_SECRET
    expect((await requireEstornoStepUp(USER, STORE, VENDA_A)).ok).toBe(false)
  })
})

describe("§6C — token expirado", () => {
  it("DENY para autorização emitida além da validade", async () => {
    await armarToken({ nowMs: Date.now() - (PIN_AUTHORIZATION_MAX_AGE_SECONDS + 60) * 1000 })
    const r = await requireEstornoStepUp(USER, STORE, VENDA_A)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.code).toBe("step_up_required")
  })

  it("ALLOW enquanto ainda está dentro da validade", async () => {
    await armarToken({ nowMs: Date.now() - 60_000 })
    expect((await requireEstornoStepUp(USER, STORE, VENDA_A)).ok).toBe(true)
  })
})

describe("§6D — token válido", () => {
  it("ALLOW e devolve o supervisor vindo do TOKEN (não do corpo da requisição)", async () => {
    await armarToken()
    const r = await requireEstornoStepUp(USER, STORE, VENDA_A)
    expect(r).toEqual({ ok: true, supervisorId: SUPER, supervisorNome: "Carla Souza" })
  })

  it("supervisor removido/desativado: autoriza mesmo assim, com nome null em vez de inventado", async () => {
    await armarToken()
    findFirst.mockResolvedValue(null)
    const r = await requireEstornoStepUp(USER, STORE, VENDA_A)
    expect(r.ok).toBe(true)
    expect(r.ok === true && r.supervisorNome).toBeNull()
  })

  it("falha ao resolver o nome não derruba a autorização", async () => {
    await armarToken()
    findFirst.mockRejectedValue(new Error("db fora"))
    const r = await requireEstornoStepUp(USER, STORE, VENDA_A)
    expect(r.ok).toBe(true)
    expect(r.ok === true && r.supervisorNome).toBeNull()
  })
})

describe("§4 — o vínculo do token é conferido", () => {
  it("autorização de OUTRO utilizador não vale (reuso de cookie)", async () => {
    await armarToken({ userId: "outro-operador" })
    expect((await requireEstornoStepUp(USER, STORE, VENDA_A)).ok).toBe(false)
  })

  it("autorização de OUTRA loja não vale (multi-loja)", async () => {
    await armarToken({ storeId: "loja-2" })
    expect((await requireEstornoStepUp(USER, STORE, VENDA_A)).ok).toBe(false)
  })

  it("o mesmo token vale para o par (utilizador, loja) para o qual foi emitido", async () => {
    await armarToken({ userId: "op-7", storeId: "loja-9" })
    expect((await requireEstornoStepUp("op-7", "loja-9", VENDA_A)).ok).toBe(true)
  })
})

describe("a recusa não vira oráculo", () => {
  it("toda negativa devolve a MESMA mensagem e código — não conta qual propriedade falhou", async () => {
    const casos: Array<() => Promise<unknown>> = [
      async () => cookieJar.clear(),
      async () => cookieJar.set(ADMIN_AUTHORIZATION_COOKIE, "lixo"),
      async () => armarToken({ userId: "outro" }),
      async () => armarToken({ storeId: "outra" }),
      async () => armarToken({ nowMs: Date.now() - 3_600_000 }),
    ]
    const vistos = new Set<string>()
    for (const preparar of casos) {
      cookieJar.clear()
      await preparar()
      const r = await requireEstornoStepUp(USER, STORE, VENDA_A)
      expect(r.ok).toBe(false)
      if (!r.ok) vistos.add(`${r.status}|${r.code}|${r.error}`)
    }
    expect(vistos.size).toBe(1)
  })
})

// ─── GOAL 007B — vínculo por AÇÃO e por VENDA ──────────────────────────────────

describe("007B · AUTH A → SALE A permitido; AUTH A → SALE B negado", () => {
  it("autorização emitida para a Venda A AUTORIZA a Venda A", async () => {
    await armarToken({ resource: VENDA_A })
    const r = await requireEstornoStepUp(USER, STORE, VENDA_A)
    expect(r.ok).toBe(true)
    expect(r.ok === true && r.supervisorId).toBe(SUPER)
  })

  it("a MESMA autorização NÃO autoriza a Venda B", async () => {
    await armarToken({ resource: VENDA_A })
    const r = await requireEstornoStepUp(USER, STORE, VENDA_B)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.code).toBe("step_up_required")
  })

  it("o reuso é recusado mesmo com o token ainda bem dentro da validade", async () => {
    await armarToken({ resource: VENDA_A, nowMs: Date.now() - 30_000 })
    expect((await requireEstornoStepUp(USER, STORE, VENDA_A)).ok).toBe(true)
    expect((await requireEstornoStepUp(USER, STORE, VENDA_B)).ok).toBe(false)
  })

  it("autorização GENÉRICA (sem escopo) não autoriza estorno nenhum", async () => {
    await armarToken({ action: null, resource: null })
    expect((await requireEstornoStepUp(USER, STORE, VENDA_A)).ok).toBe(false)
  })

  it("autorização para OUTRA ação não autoriza estorno", async () => {
    await armarToken({ action: "liberar_desconto", resource: VENDA_A })
    expect((await requireEstornoStepUp(USER, STORE, VENDA_A)).ok).toBe(false)
  })

  it("token com ação certa mas SEM alvo não autoriza", async () => {
    await armarToken({ resource: null })
    expect((await requireEstornoStepUp(USER, STORE, VENDA_A)).ok).toBe(false)
  })

  it("pedidoId vazio nunca autoriza, mesmo com token válido", async () => {
    await armarToken({ resource: VENDA_A })
    expect((await requireEstornoStepUp(USER, STORE, "   ")).ok).toBe(false)
  })

  it("trocar o alvo no payload quebra a assinatura", async () => {
    const tk = await armarToken({ resource: VENDA_A })
    const [body, sig] = tk.split(".")
    const p = JSON.parse(Buffer.from(body!, "base64url").toString())
    p.resource = VENDA_B
    cookieJar.set(ADMIN_AUTHORIZATION_COOKIE, `${Buffer.from(JSON.stringify(p)).toString("base64url")}.${sig}`)
    expect((await requireEstornoStepUp(USER, STORE, VENDA_B)).ok).toBe(false)
  })
})
