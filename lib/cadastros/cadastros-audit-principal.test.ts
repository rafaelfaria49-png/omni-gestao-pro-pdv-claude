import { describe, expect, it } from "vitest"
import type { Session } from "next-auth"
import {
  cadastrosAuditActorLabel,
  cadastrosAuditLogFields,
  cadastrosAuditPrincipalFromSession,
} from "@/lib/cadastros/cadastros-audit-principal"

function session(opts: {
  id?: string | null
  email?: string | null
  name?: string | null
  role?: string | null
}): Session {
  return {
    user: {
      id: opts.id === undefined ? "user-1" : (opts.id as string),
      email: opts.email === undefined ? "u@x.com" : (opts.email as string),
      name: opts.name === undefined ? "U" : (opts.name as string),
      role: opts.role === undefined ? "VENDEDOR" : (opts.role as string),
      storeAccess: "restricted",
      allowedStoreIds: ["loja-a"],
      lojaId: "loja-a",
    },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  } as unknown as Session
}

describe("cadastrosAuditPrincipalFromSession", () => {
  it("deriva userId/email/role/displayLabel da sessão", () => {
    const p = cadastrosAuditPrincipalFromSession(
      session({ id: "u-9", email: "rafael@loja.com", name: "Rafael", role: "ADMIN" }),
    )
    expect(p).toEqual({
      userId: "u-9",
      email: "rafael@loja.com",
      role: "ADMIN",
      displayLabel: "Rafael",
    })
  })

  it("sem nome usa e-mail; sem e-mail usa userId — nunca rótulo inventado", () => {
    expect(
      cadastrosAuditPrincipalFromSession(session({ name: "", email: "ops@loja.com" }))?.displayLabel,
    ).toBe("ops@loja.com")
    expect(
      cadastrosAuditPrincipalFromSession(session({ name: "  ", email: "  ", id: "id-only" }))
        ?.displayLabel,
    ).toBe("id-only")
  })

  it("sem user.id → null (não inventa Operador/Admin/System)", () => {
    expect(cadastrosAuditPrincipalFromSession(null)).toBeNull()
    expect(cadastrosAuditPrincipalFromSession(undefined)).toBeNull()
    expect(cadastrosAuditPrincipalFromSession(session({ id: "" }))).toBeNull()
    expect(cadastrosAuditPrincipalFromSession(session({ id: "   " }))).toBeNull()
    expect(cadastrosAuditActorLabel(null)).toBe("")
    expect(cadastrosAuditActorLabel(null)).not.toMatch(/Operador|Usuário|Admin|System|Desconhecido/i)
  })

  it("não tem parâmetro para body.userLabel / revisadoPor — caller não escolhe o ator", () => {
    expect(cadastrosAuditPrincipalFromSession.length).toBe(1)
    const p = cadastrosAuditPrincipalFromSession(session({ name: "Sessão" }))
    expect(p?.displayLabel).toBe("Sessão")
    expect(p?.displayLabel).not.toBe("Administrador")
  })
})

describe("cadastrosAuditLogFields — adapter LogsAuditoria", () => {
  it("userLabel oficial vem do principal; operatorNote fica separado", () => {
    const p = cadastrosAuditPrincipalFromSession(session({ name: "U", email: "u@x.com", id: "user-1" }))
    const fields = cadastrosAuditLogFields(p, { operatorNote: "Administrador" })
    expect(fields.userLabel).toBe("U")
    expect(fields.actorMeta.actor).toEqual({
      userId: "user-1",
      email: "u@x.com",
      role: "VENDEDOR",
    })
    expect(fields.actorMeta.operatorNote).toBe("Administrador")
    expect(fields.userLabel).not.toBe("Administrador")
  })

  it("sem principal humano: userLabel vazio e actor null — não inventa Importador/Operador", () => {
    const fields = cadastrosAuditLogFields(null)
    expect(fields.userLabel).toBe("")
    expect(fields.actorMeta.actor).toBeNull()
    expect(fields.userLabel).not.toMatch(/Operador|Importador|Admin|System/i)
  })

  it("merge de actorMeta é aditivo — storeId/batchId/total sobrevivem", () => {
    const existing = { storeId: "loja-a", batchId: "batch-123", total: 42 }
    const p = cadastrosAuditPrincipalFromSession(session({ id: "user-1" }))
    const fields = cadastrosAuditLogFields(p)
    const merged = { ...existing, ...fields.actorMeta }
    expect(merged.storeId).toBe("loja-a")
    expect(merged.batchId).toBe("batch-123")
    expect(merged.total).toBe(42)
    expect(merged.actor).toEqual({
      userId: "user-1",
      email: "u@x.com",
      role: "VENDEDOR",
    })
  })
})
