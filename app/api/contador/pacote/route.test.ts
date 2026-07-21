/**
 * Contador HUB · endpoint do Pacote do Contador (GOAL 008B) — testes de contrato do route.
 *
 * Mocka `requireContadorScope` e `gerarPacoteContador` (sem afrouxar o gate real): valida
 * validação de query, mapeamento de status (401/400/403/200/413/500), headers de segurança
 * e ausência de stack na resposta. Nenhuma escrita: só há caminho GET/leitura.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/contador/scope", () => ({ requireContadorScope: vi.fn() }))
vi.mock("@/lib/contador/pacote", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/contador/pacote")>()
  return { ...actual, gerarPacoteContador: vi.fn() }
})

import { GET } from "./route"
import { requireContadorScope } from "@/lib/contador/scope"
import { gerarPacoteContador, PacoteLimiteExcedidoError, PacoteTimeoutError } from "@/lib/contador/pacote"
import { competenciaAtual } from "@/lib/contador/competencia"

const scopeOk = { ok: true, storeId: "loja-1", userId: "u1", permissaoContador: true } as const

const pacoteFake = {
  nomeArquivo: "pacote-contador-loja-1-2026-06.zip",
  bytes: new Uint8Array([80, 75, 3, 4, 1, 2, 3, 4]),
  manifesto: {} as never,
  metricas: {
    bytesZip: 8,
    bytesDescompactados: 20,
    arquivos: 14,
    contagens: { vendas: 1 },
    fontesParciais: [] as string[],
    fontesIndisponiveis: [] as string[],
  },
}

function req(query = "", headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/contador/pacote${query}`, { method: "GET", headers })
}

beforeEach(() => {
  vi.mocked(requireContadorScope).mockReset()
  vi.mocked(gerarPacoteContador).mockReset()
  vi.mocked(requireContadorScope).mockResolvedValue(scopeOk as never)
  vi.mocked(gerarPacoteContador).mockResolvedValue(pacoteFake as never)
})

describe("GET /api/contador/pacote — validação de query", () => {
  it("storeId na query → 400 (não aceita seleção de loja por parâmetro)", async () => {
    const res = await GET(req("?storeId=loja-9"))
    expect(res.status).toBe(400)
    expect((await res.json()).mensagem).toContain("não aceita seleção de loja")
    expect(gerarPacoteContador).not.toHaveBeenCalled()
  })

  it("lojaId na query → 400", async () => {
    const res = await GET(req("?lojaId=loja-9"))
    expect(res.status).toBe(400)
  })

  it("c inválida → 400 (sem fallback silencioso)", async () => {
    const res = await GET(req("?c=2026-13"))
    expect(res.status).toBe(400)
    expect(gerarPacoteContador).not.toHaveBeenCalled()
  })

  it("c ausente → competência atual e 200", async () => {
    const res = await GET(req(""))
    expect(res.status).toBe(200)
    expect(vi.mocked(gerarPacoteContador).mock.calls[0][0].competencia).toMatchObject(competenciaAtual())
  })

  it("c válida → 200", async () => {
    const res = await GET(req("?c=2026-06"))
    expect(res.status).toBe(200)
  })
})

describe("GET /api/contador/pacote — escopo/ACL", () => {
  it("sem sessão → 401", async () => {
    vi.mocked(requireContadorScope).mockResolvedValue({ ok: false, motivo: "nao_autenticado" } as never)
    expect((await GET(req("?c=2026-06"))).status).toBe(401)
  })
  it("sem loja → 400", async () => {
    vi.mocked(requireContadorScope).mockResolvedValue({ ok: false, motivo: "loja_ausente" } as never)
    expect((await GET(req("?c=2026-06"))).status).toBe(400)
  })
  it("sem ACL → 403", async () => {
    vi.mocked(requireContadorScope).mockResolvedValue({ ok: false, motivo: "sem_acesso_loja" } as never)
    expect((await GET(req("?c=2026-06"))).status).toBe(403)
  })
  it("sem Financeiro → 403", async () => {
    vi.mocked(requireContadorScope).mockResolvedValue({ ok: false, motivo: "sem_permissao" } as never)
    expect((await GET(req("?c=2026-06"))).status).toBe(403)
  })
  it("header arbitrário de loja não troca o escopo (gate ignora headers)", async () => {
    const res = await GET(req("?c=2026-06", { "x-assistec-loja-id": "loja-999" }))
    expect(res.status).toBe(200)
    // O gate é chamado sem argumentos derivados do request/headers.
    expect(vi.mocked(requireContadorScope).mock.calls[0].length).toBe(0)
  })
})

describe("GET /api/contador/pacote — sucesso e headers", () => {
  it("200 application/zip com headers de segurança e filename saneado", async () => {
    const res = await GET(req("?c=2026-06"))
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/zip")
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="pacote-contador-loja-1-2026-06.zip"')
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
    expect(res.headers.get("Pragma")).toBe("no-cache")
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff")
  })

  it("pacote vazio/parcial ainda responde 200 (ZIP válido gerado pelo builder)", async () => {
    vi.mocked(gerarPacoteContador).mockResolvedValue({
      ...pacoteFake,
      metricas: { ...pacoteFake.metricas, contagens: {}, fontesParciais: ["devolucoes"] },
    } as never)
    expect((await GET(req("?c=2026-07"))).status).toBe(200)
  })
})

describe("GET /api/contador/pacote — erros", () => {
  it("limite excedido → 413 com mensagem segura", async () => {
    vi.mocked(gerarPacoteContador).mockRejectedValue(new PacoteLimiteExcedidoError("bytes_zip", "grande demais"))
    const res = await GET(req("?c=2026-06"))
    expect(res.status).toBe(413)
    const body = await res.json()
    expect(body.mensagem).toBeTruthy()
    expect(JSON.stringify(body)).not.toContain("bytes_zip") // detalhe interno não vaza
  })

  it("timeout lógico → 503 com mensagem segura (GOAL 008C)", async () => {
    vi.mocked(gerarPacoteContador).mockRejectedValue(new PacoteTimeoutError(30_000, "estourou o teto"))
    const res = await GET(req("?c=2026-06"))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.mensagem).toContain("tempo limite")
    expect(JSON.stringify(body)).not.toMatch(/30000|estourou/) // detalhe interno não vaza
  })

  it("erro inesperado → 500 sem stack na resposta", async () => {
    vi.mocked(gerarPacoteContador).mockRejectedValue(new Error("segredo interno com stack"))
    const res = await GET(req("?c=2026-06"))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toMatch(/stack|segredo interno/)
    expect(body.mensagem).toContain("Não foi possível gerar o pacote")
  })
})
