import { describe, expect, it } from "vitest"
import { failureKind } from "./http"

describe("revisão D05 P3-5: falha interna registra só classe e código", () => {
  it("nunca inclui a mensagem crua (Failing row contains …)", () => {
    const pg = Object.assign(new Error('new row violates check constraint "x" Failing row contains (sale-123, 4111, secret-ish)'), { code: "23514" })
    expect(failureKind(pg)).toBe("Error:23514")
    const prisma = Object.assign(new Error("Unique constraint failed on the fields: (`saleId`)"), { name: "PrismaClientKnownRequestError", code: "P2002" })
    expect(failureKind(prisma)).toBe("PrismaClientKnownRequestError:P2002")
    expect(failureKind(Object.assign(new Error("x"), { code: "free text with spaces" }))).toBe("Error")
    expect(failureKind("boom")).toBe("string")
    expect(failureKind(null)).toBe("object")
  })
})
