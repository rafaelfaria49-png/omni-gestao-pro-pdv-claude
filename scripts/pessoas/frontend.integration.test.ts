import { randomBytes, randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it, vi } from "vitest"
const actor = vi.hoisted(() => ({ userId: "", storeId: "" }))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: actor.userId } }) }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: actor.storeId }) }) }))
import { prisma } from "@/lib/prisma"
import * as actions from "@/app/actions/pessoas"
import { lerDisponibilidade } from "@/lib/pessoas/readers/disponibilidade"
import { GET } from "@/app/api/pessoas/disponibilidade/route"
function data<T>(result: { ok: true; data: T } | { ok: false; code: string }): T {
  if (!result.ok) throw new Error(result.code)
  return result.data
}
describe.sequential("Frontend: actions reais em PostgreSQL descartável", () => {
  const suffix = randomUUID().slice(0, 16)
  let employer = "", vinculo = "", user = ""
  beforeAll(async () => {
    const url = process.env.PESSOAS_HOMOLOGATION_DATABASE_URL
    if (!url || url !== process.env.DATABASE_URL || !url.includes("@127.0.0.1:55439/omni_pessoas_001a_homolog")) throw new Error("BANCO_NAO_ISOLADO")
    process.env.PESSOAS_DP_ENABLED = "on"
    for (const key of ["PESSOAS_CPF_ENC_KEY", "PESSOAS_CPF_HMAC_KEY", "PESSOAS_DOCUMENT_INTENT_KEY"]) process.env[key] = randomBytes(32).toString("base64")
    actor.storeId = "frontend-" + suffix
    await prisma.store.create({ data: { id: actor.storeId, name: "Frontend sintético" } })
    user = (await prisma.adminUser.create({ data: { email: suffix + "@example.invalid", password: "unused-synthetic", role: "ADMIN", lojaId: actor.storeId } })).id
    actor.userId = user
  })
  it("disponibilidade permite bootstrap sem grant e endpoint é no-store", async () => {
    expect(await lerDisponibilidade()).toEqual({ disponivel: true, podeConfigurarEmpregador: true, escopos: [] })
    const response = await GET()
    expect(response.headers.get("cache-control")).toContain("no-store")
    employer = data(await actions.setupEmpregador({ comandoId: randomUUID(), nome: "Empregador frontend", inscricao: suffix, tipoInscricao: "CNPJ", validFrom: "2020-01-01", motivo: "fixture",
      estabelecimento: { nome: "Sede frontend", inscricao: suffix, tipoInscricao: "CNPJ" } })).id
    expect((await lerDisponibilidade()).escopos[0].empregadorId).toBe(employer)
  })
  it("rascunho persiste, replay é único e payload diferente conflita", async () => {
    const input = { comandoId: randomUUID(), empregadorId: employer, nome: "Pessoa sintética", motivo: "rascunho" }
    const first = data(await actions.criarFuncionario(input))
    vinculo = first.id
    expect(first.status).toBe("RASCUNHO")
    expect(data(await actions.criarFuncionario(input)).id).toBe(vinculo)
    expect(await actions.criarFuncionario({ ...input, nome: "Outro nome" })).toMatchObject({ ok: false, code: "IDEMPOTENCIA_CONFLITO" })
    expect(data(await actions.obterFuncionario(employer, vinculo)).pendencias.length).toBeGreaterThan(0)
  })
  it("versiona, preserva histórico e rejeita conflito sem sobrescrever", async () => {
    const f = data(await actions.obterFuncionario(employer, vinculo))
    const input = { empregadorId: employer, vinculoId: vinculo, comandoId: randomUUID(), expectedVersion: f.versaoAtual, supersedesId: f.contrato!.id,
      tipoMudanca: "ALTERACAO" as const, validFrom: "2020-01-01", cargo: "Analista", cbo: "123456", salarioBase: "9876.54", unidadeSalario: "MENSAL", jornadaSemanal: "40.00", divisor: 200, motivo: "Salário sintético 9876.54" }
    data(await actions.criarVersaoContrato(input))
    expect(await actions.criarVersaoContrato({ ...input, comandoId: randomUUID() })).toMatchObject({ ok: false, code: "VERSION_CONFLICT" })
    expect(data(await actions.listarHistorico(employer, vinculo)).contratos).toHaveLength(2)
    await prisma.dpAcesso.updateMany({ where: { empregadorId: employer, adminUserId: user }, data: { capacidades: ["viewCadastro"] } })
    const dto = data(await actions.listarHistorico(employer, vinculo))
    expect(JSON.stringify(dto)).not.toContain("9876.54")
    expect(dto.contratos[1].motivo).toBeNull()
    expect(data(await actions.obterFuncionario(employer, vinculo)).contrato!.remuneracaoOculta).toBe(true)
  })
  it("Store alheia e revogação fecham o acesso", async () => {
    actor.storeId = "alheia-" + suffix
    expect(await actions.obterFuncionario(employer, vinculo)).toMatchObject({ ok: false, code: "ESCOPO_NEGADO" })
    actor.storeId = "frontend-" + suffix
    await prisma.dpAcesso.updateMany({ where: { empregadorId: employer, adminUserId: user }, data: { revogadoEm: new Date() } })
    expect(await actions.obterFuncionario(employer, vinculo)).toMatchObject({ ok: false, code: "ESCOPO_NEGADO" })
  })
})
