import { describe, expect, it } from "vitest"
import { mapClientWriteFailureToResponse } from "@/lib/cadastros/client-write-http"
import { CLIENT_WRITE_MESSAGES } from "@/lib/cadastros/client-write-contract"

describe("mapClientWriteFailureToResponse", () => {
  it("VALIDATION → 400", async () => {
    const res = mapClientWriteFailureToResponse({
      ok: false,
      code: "VALIDATION",
      message: 'Campo "nome" é obrigatório.',
      field: "nome",
    })
    expect(res.status).toBe(400)
  })

  it("NOT_FOUND → 404 sem oráculo", async () => {
    const res = mapClientWriteFailureToResponse({
      ok: false,
      code: "NOT_FOUND",
      message: CLIENT_WRITE_MESSAGES.notFound,
    })
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe(CLIENT_WRITE_MESSAGES.notFound)
  })

  it("identidade → 409 com outcome e candidateIds, sem PII", async () => {
    const res = mapClientWriteFailureToResponse({
      ok: false,
      code: "IDENTITY_REVIEW_REQUIRED",
      message: CLIENT_WRITE_MESSAGES.review,
      outcome: "POSSIBLE_CONTACT_MATCH",
      candidateIds: ["c1"],
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { candidateIds: string[]; outcome: string }
    expect(body.outcome).toBe("POSSIBLE_CONTACT_MATCH")
    expect(body.candidateIds).toEqual(["c1"])
    expect(JSON.stringify(body)).not.toMatch(/@|cpf|telefone/i)
  })

  it("UNTRUSTED_SCOPE → 401; PERSISTENCE → 503", () => {
    expect(
      mapClientWriteFailureToResponse({
        ok: false,
        code: "UNTRUSTED_SCOPE",
        message: CLIENT_WRITE_MESSAGES.untrusted,
      }).status,
    ).toBe(401)
    expect(
      mapClientWriteFailureToResponse({
        ok: false,
        code: "PERSISTENCE",
        message: CLIENT_WRITE_MESSAGES.persist,
      }).status,
    ).toBe(503)
  })
})
