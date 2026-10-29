import { describe, expect, it } from "vitest"
import {
  CAIXA_SEGURO_ACTION,
  createStoreAdminReauthToken,
  isStoreAdminSession,
  isStoreExperienceSession,
  STORE_ADMIN_REAUTH_MAX_AGE_SECONDS,
  verifyStoreAdminReauthToken,
} from "./store-admin-reauth"
import { createPinAuthorizationToken } from "./pin-authorization"

const SECRET = "segredo-sintetico-de-teste-store-admin"
const T0 = Date.UTC(2026, 9, 28, 12, 0, 0)
const base = { userId: "adm-a", storeId: "loja-a", action: CAIXA_SEGURO_ACTION as string, resource: "sessao-1", sessionVersion: 3 }

describe("token de reautenticação da ADMIN STORE", () => {
  it("vale só para o mesmo usuário, loja, ação, sessão de caixa e sessionVersion", async () => {
    const token = await createStoreAdminReauthToken(base, SECRET, T0)
    expect((await verifyStoreAdminReauthToken(token, SECRET, base, T0)).ok).toBe(true)
    const casos: [Partial<typeof base>, string][] = [
      [{ userId: "adm-b" }, "user_mismatch"],
      [{ storeId: "loja-b" }, "store_mismatch"],
      [{ action: "estornar_venda" }, "action_mismatch"],
      [{ resource: "sessao-2" }, "resource_mismatch"],
      [{ sessionVersion: 4 }, "session_version_mismatch"],
    ]
    for (const [diff, reason] of casos) {
      expect(await verifyStoreAdminReauthToken(token, SECRET, { ...base, ...diff }, T0)).toEqual({ ok: false, reason })
    }
  })

  it("expira no servidor e recusa segredo, assinatura e formato inválidos", async () => {
    const token = await createStoreAdminReauthToken(base, SECRET, T0)
    const fim = T0 + STORE_ADMIN_REAUTH_MAX_AGE_SECONDS * 1000
    expect((await verifyStoreAdminReauthToken(token, SECRET, base, fim - 1000)).ok).toBe(true)
    expect(await verifyStoreAdminReauthToken(token, SECRET, base, fim)).toEqual({ ok: false, reason: "expired" })
    expect(await verifyStoreAdminReauthToken(token, "outro-segredo", base, T0)).toEqual({ ok: false, reason: "invalid_signature" })
    expect(await verifyStoreAdminReauthToken(token, null, base, T0)).toEqual({ ok: false, reason: "missing_server_secret" })
    expect(await verifyStoreAdminReauthToken(undefined, SECRET, base, T0)).toEqual({ ok: false, reason: "missing_cookie" })
    expect(await verifyStoreAdminReauthToken("a.b.c", SECRET, base, T0)).toEqual({ ok: false, reason: "malformed_token" })
    const [body, sig] = token.split(".")
    const adulterado = Buffer.from(Buffer.from(body!, "base64url").toString().replace("loja-a", "loja-b")).toString("base64url")
    expect(await verifyStoreAdminReauthToken(`${adulterado}.${sig}`, SECRET, { ...base, storeId: "loja-b" }, T0))
      .toEqual({ ok: false, reason: "invalid_signature" })
  })

  it("token do PIN global de supervisor nunca vale como aprovação da ADMIN STORE", async () => {
    const pinToken = await createPinAuthorizationToken(
      { userId: base.userId, storeId: base.storeId, supervisorId: "sup-1", action: CAIXA_SEGURO_ACTION, resource: base.resource },
      SECRET,
      T0,
    )
    expect(await verifyStoreAdminReauthToken(pinToken, SECRET, base, T0)).toEqual({ ok: false, reason: "invalid_signature" })
  })
})

describe("quem é experiência STORE e quem aprova", () => {
  const s = (user: Record<string, unknown>) => ({ user })
  it("só ADMIN com accessScope STORE aprova; funcionário STORE não", () => {
    expect(isStoreAdminSession(s({ role: "ADMIN", accessScope: "STORE", platformAuthority: false }))).toBe(true)
    for (const role of ["CAIXA", "OPERADOR", "GERENTE", "VENDEDOR"]) {
      const sessao = s({ role, accessScope: "STORE", platformAuthority: false })
      expect(isStoreExperienceSession(sessao)).toBe(true)
      expect(isStoreAdminSession(sessao)).toBe(false)
    }
  })
  it("contas internas legadas e plataforma ficam fora (seguem com o PIN)", () => {
    expect(isStoreExperienceSession(s({ role: "ADMIN", accessScope: null, platformAuthority: true }))).toBe(false)
    expect(isStoreExperienceSession(s({ role: "CAIXA", accessScope: null, platformAuthority: false }))).toBe(false)
    expect(isStoreExperienceSession(s({ role: "SUPER_ADMIN", accessScope: "PLATFORM", platformAuthority: true }))).toBe(false)
    expect(isStoreExperienceSession(null)).toBe(false)
  })
})
