import { NextRequest, type NextResponse } from "next/server"
import { describe, expect, it, vi } from "vitest"
import { proxy } from "@/proxy"
import { MELI_CALLBACK_PATH } from "./config"

vi.mock("@/auth", () => ({ auth: (handler: unknown) => handler }))

const runProxy = proxy as unknown as (request: NextRequest) => Promise<NextResponse>
const origin = "https://omni.test"
const searchHeader = "x-middleware-request-x-omni-search"

describe("proxy do callback Mercado Livre", () => {
  it("mantém o código e o state fora dos cabeçalhos internos", async () => {
    const request = new NextRequest(origin + MELI_CALLBACK_PATH + "?code=qa-ingress-code&state=qa-ingress-state", {
      headers: { "x-omni-search": "qa-ingress-forged" },
    })
    const response = await runProxy(request)
    expect(response.headers.get("x-middleware-request-x-omni-pathname")).toBe(MELI_CALLBACK_PATH)
    expect(response.headers.get(searchHeader)).toBeNull()
    expect(request.nextUrl.searchParams.has("code")).toBe(true)
  })

  it("preserva o cabeçalho de navegação das demais rotas", async () => {
    const response = await runProxy(new NextRequest(origin + "/api/health?source=qa"))
    expect(response.headers.get(searchHeader)).toBe("?source=qa")
  })
})
