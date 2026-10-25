import { createHash, randomBytes, randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it, vi } from "vitest"
const actor = vi.hoisted(() => ({ userId: "", storeId: "" }))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: actor.userId } }) }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: actor.storeId }) }) }))
// Só o transporte de bytes é controlado; serviços, guards e PostgreSQL são reais.
const blobs = vi.hoisted(() => new Map<string, Buffer>())
const documentStorage = vi.hoisted(() => ({
  criarUploadAssinado: vi.fn(async (storageRef: string) => ({
    storageRef, signedUrl: "https://example.invalid/upload", token: "", expiresInSec: 120,
    headersObrigatorios: { "If-None-Match": "*" },
  })),
  abrirConteudoPrivado: vi.fn(async (ref: string) => {
    const bytes = blobs.get(ref)
    if (!bytes) throw new Error("OBJETO_SINTETICO_AUSENTE")
    return bytes
  }),
  removerObjeto: vi.fn(async (ref: string) => { blobs.delete(ref) }),
  verificarExistencia: vi.fn(async (ref: string) => blobs.has(ref)),
  criarDownloadAssinado: vi.fn(async (_ref: string, _nome: string, expiresInSec: number) => ({
    signedUrl: "https://example.invalid/download", expiresInSec,
  })),
}))
vi.mock("@/lib/contador/documentos/storage-r2", () => ({ storageR2: documentStorage }))
import { autorizarDownload, confirmarUpload, criarUploadIntent, listarDocumentos } from "@/lib/pessoas/documentos/service"
import { emitirIntent, verificarIntent } from "@/lib/pessoas/documentos/intent"
import { prisma } from "@/lib/prisma"
import * as actions from "@/app/actions/pessoas"
import NovoPage from "@/app/dashboard/pessoas/funcionarios/novo/page"
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
    expect(await lerDisponibilidade()).toEqual({ storeId: actor.storeId, disponivel: true, podeConfigurarEmpregador: true, escopos: [] })
    const response = await GET()
    expect(response.headers.get("cache-control")).toContain("no-store")
    employer = data(await actions.setupEmpregador({ comandoId: randomUUID(), nome: "Empregador frontend", inscricao: suffix, tipoInscricao: "CNPJ", validFrom: "2020-01-01", motivo: "fixture",
      estabelecimento: { nome: "Sede frontend", inscricao: suffix, tipoInscricao: "CNPJ" } })).id
    expect((await lerDisponibilidade()).escopos[0].empregadorId).toBe(employer)
  })
  it("wrapper impede criação na Store efetiva B quando o formulário espera A, mesmo com empregador e grants em ambas", async () => {
    const storeA = actor.storeId, storeB = storeA + "-b"
    await prisma.store.create({ data: { id: storeB, name: "Segunda Store frontend sintética" } })
    await prisma.adminUserStore.create({ data: { adminUserId: user, storeId: storeB } })
    const estabelecimentoId = data(await actions.obterEmpregador(employer)).estabelecimentos[0].id
    data(await actions.vincularUnidade({ empregadorId: employer, comandoId: randomUUID(), storeId: storeB, estabelecimentoId,
      validFrom: "2020-01-01", motivo: "fixture multi-store", confirmarAcessoGestor: true }))
    const guarded = NovoPage().props.actions.criarFuncionario as (storeId: string, input: Parameters<typeof actions.criarFuncionario>[0]) => ReturnType<typeof actions.criarFuncionario>
    const input = { empregadorId: employer, comandoId: randomUUID(), nome: "Pessoa multi-store sintética", motivo: "fixture" }
    try {
      actor.storeId = storeB
      const availability = await lerDisponibilidade()
      expect(availability.storeId).toBe(storeB)
      expect(availability.escopos.find(scope => scope.empregadorId === employer)?.capacidades).toContain("editCadastro")
      const before = await prisma.dpVinculo.count({ where: { empregadorId: employer, storeId: { in: [storeA, storeB] } } })
      expect(await guarded(storeA, input)).toEqual({ ok: false, code: "LOJA_DIVERGENTE" })
      expect(await prisma.dpVinculo.count({ where: { empregadorId: employer, storeId: { in: [storeA, storeB] } } })).toBe(before)
      const accepted = data(await guarded(storeB, input))
      expect(await prisma.dpVinculo.findFirst({ where: { id: accepted.id, empregadorId: employer, storeId: storeB } })).not.toBeNull()
    } finally { actor.storeId = storeA }
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


describe.sequential("P2-01: documentos com IDs de Store de 1 a 100 caracteres", () => {
  const stores = ["loja-1", "loja-2", "qa-pessoas-documentos-" + randomUUID(), "s", "s".repeat(100)]
  const invalidStores = ["", "s".repeat(101), "loja/1", "loja\\1", "loja.1", "loja 1", "loja-\n1"]
  const invalidEntityIds = ["", "curto-1", "s".repeat(101), "entidade/123", "entidade\\123", "entidade..123"]
  const links = new Map<string, string>()
  const documents = new Map<string, { documentoId: string; uploadIntent: string; storageRef: string }>()
  const pdf = Buffer.from("%PDF-1.7\nDocumento sintetico de regressao P2-01")
  let employer = ""
  function input(storeId = actor.storeId) {
    return { empregadorId: employer, vinculoId: links.get(storeId)!, categoria: "identificacao", origem: "INTERNO" as const,
      nomeArquivo: "fixture.pdf", mime: "application/pdf", bytes: pdf.length, sha256: createHash("sha256").update(pdf).digest("hex") }
  }
  beforeAll(async () => {
    const db = process.env.PESSOAS_HOMOLOGATION_DATABASE_URL
    if (!db || db !== process.env.DATABASE_URL || db !== process.env.DIRECT_URL) throw new Error("BANCO_NAO_ISOLADO")
    const url = new URL(db)
    if (url.hostname !== "127.0.0.1" || url.port !== "55439" || url.pathname !== "/omni_pessoas_001a_homolog" || url.username !== "omni_homolog") throw new Error("BANCO_NAO_ISOLADO")
    process.env.PESSOAS_DP_ENABLED = "on"
    process.env.PESSOAS_STORAGE_PROVIDER = "r2"
    for (const key of ["PESSOAS_CPF_ENC_KEY", "PESSOAS_CPF_HMAC_KEY", "PESSOAS_DOCUMENT_INTENT_KEY"]) process.env[key] = randomBytes(32).toString("base64")
    await prisma.store.createMany({ data: stores.map(id => ({ id, name: "Store sintetica documental" })) })
    actor.storeId = stores[0]
    actor.userId = (await prisma.adminUser.create({ data: { email: randomUUID() + "@example.invalid", password: "unused-synthetic", role: "ADMIN", lojaId: actor.storeId } })).id
    employer = data(await actions.setupEmpregador({ comandoId: randomUUID(), nome: "Empregador documental sintetico", inscricao: randomUUID().replaceAll("-", ""), tipoInscricao: "CNPJ", validFrom: "2020-01-01", motivo: "fixture P2-01",
      estabelecimento: { nome: "Sede sintetica", inscricao: randomUUID().replaceAll("-", ""), tipoInscricao: "CNPJ" } })).id
    const estabelecimentoId = data(await actions.obterEmpregador(employer)).estabelecimentos[0].id
    for (const storeId of stores.slice(1)) {
      await prisma.adminUserStore.create({ data: { adminUserId: actor.userId, storeId } })
      data(await actions.vincularUnidade({ empregadorId: employer, comandoId: randomUUID(), storeId, estabelecimentoId,
        validFrom: "2020-01-01", motivo: "fixture multi-store P2-01", confirmarAcessoGestor: true }))
    }
    for (const storeId of stores) {
      actor.storeId = storeId
      links.set(storeId, data(await actions.criarFuncionario({ empregadorId: employer, comandoId: randomUUID(), nome: "Pessoa documental sintetica", motivo: "fixture P2-01" })).id)
    }
  })
  it.each(stores)("intent, complete, list e download preservam o namespace em %s", async storeId => {
    actor.storeId = storeId
    const upload = await criarUploadIntent(input())
    const intent = verificarIntent(upload.uploadIntent)
    const ref = "pessoas/" + employer + "/" + storeId + "/" + upload.documentoId
    expect(intent).toMatchObject({ empregadorId: employer, storeId, vinculoId: links.get(storeId), documentoId: upload.documentoId, storageRef: ref })
    expect(upload.headersObrigatorios).toEqual({ "If-None-Match": "*" })
    expect(documentStorage.criarUploadAssinado).toHaveBeenLastCalledWith(ref)
    blobs.set(ref, pdf)
    const doc = await confirmarUpload(upload.uploadIntent)
    expect(doc.id).toBe(upload.documentoId)
    expect(doc).not.toHaveProperty("storageRef")
    expect((await confirmarUpload(upload.uploadIntent)).id).toBe(doc.id)
    expect(await prisma.dpDocumento.count({ where: { id: doc.id, empregadorId: employer, storeId, storageRef: ref } })).toBe(1)
    expect((await listarDocumentos(employer, links.get(storeId)!)).map(item => item.id)).toEqual([doc.id])
    expect((await autorizarDownload(employer, doc.id)).expiresInSec).toBe(300)
    expect(documentStorage.criarDownloadAssinado).toHaveBeenLastCalledWith(ref, "documento.pdf", 300)
    documents.set(storeId, { documentoId: doc.id, uploadIntent: upload.uploadIntent, storageRef: ref })
  })
  it("nega cruzamento loja-1/loja-2 mesmo com membership e grants validos nas duas", async () => {
    for (const [source, target] of [[stores[0], stores[1]], [stores[1], stores[0]]]) {
      actor.storeId = target
      const doc = documents.get(source)!
      const uploads = documentStorage.criarUploadAssinado.mock.calls.length
      const reads = documentStorage.abrirConteudoPrivado.mock.calls.length
      const downloads = documentStorage.criarDownloadAssinado.mock.calls.length
      await expect(criarUploadIntent(input(source))).rejects.toMatchObject({ code: "NAO_ENCONTRADO", status: 404 })
      await expect(confirmarUpload(doc.uploadIntent)).rejects.toMatchObject({ code: "INTENT_INVALIDO", status: 403 })
      await expect(listarDocumentos(employer, links.get(source)!)).rejects.toMatchObject({ code: "NAO_ENCONTRADO", status: 404 })
      await expect(autorizarDownload(employer, doc.documentoId)).rejects.toMatchObject({ code: "NAO_ENCONTRADO", status: 404 })
      expect(documentStorage.criarUploadAssinado.mock.calls).toHaveLength(uploads)
      expect(documentStorage.abrirConteudoPrivado.mock.calls).toHaveLength(reads)
      expect(documentStorage.criarDownloadAssinado.mock.calls).toHaveLength(downloads)
    }
  })
  it.each(invalidStores)("nega Store invalida %j antes de acessar storage", async storeId => {
    actor.storeId = storeId
    const doc = documents.get(stores[0])!
    const calls = documentStorage.criarUploadAssinado.mock.calls.length
    await expect(criarUploadIntent(input(stores[0]))).rejects.toMatchObject({ code: "LOJA_AUSENTE", status: 403 })
    await expect(confirmarUpload(doc.uploadIntent)).rejects.toMatchObject({ code: "LOJA_AUSENTE", status: 403 })
    await expect(autorizarDownload(employer, doc.documentoId)).rejects.toMatchObject({ code: "LOJA_AUSENTE", status: 403 })
    expect(documentStorage.criarUploadAssinado.mock.calls).toHaveLength(calls)
  })
  it.each(invalidEntityIds)("preserva recusas de empregador/documento invalido %j", async id => {
    actor.storeId = stores[0]
    const doc = documents.get(stores[0])!
    const intent = verificarIntent(doc.uploadIntent)
    await expect(criarUploadIntent({ ...input(), empregadorId: id })).rejects.toMatchObject({ code: "ESCOPO_NEGADO", status: 403 })
    await expect(autorizarDownload(id, doc.documentoId)).rejects.toMatchObject({ code: "ESCOPO_NEGADO", status: 403 })
    const token = emitirIntent({ ...intent, documentoId: id, storageRef: "pessoas/" + employer + "/" + stores[0] + "/" + id })
    await expect(confirmarUpload(token)).rejects.toMatchObject({ code: "INTENT_INVALIDO", status: 403 })
  })
  it("recusa namespace e empregador adulterados sem gravar outro documento", async () => {
    actor.storeId = stores[0]
    const intent = verificarIntent(documents.get(stores[0])!.uploadIntent)
    const before = await prisma.dpDocumento.count({ where: { empregadorId: employer, storeId: actor.storeId } })
    await expect(confirmarUpload(emitirIntent({ ...intent, storageRef: "pessoas/" + employer + "/" + stores[1] + "/" + intent.documentoId }))).rejects.toMatchObject({ code: "INTENT_INVALIDO", status: 403 })
    await expect(confirmarUpload(emitirIntent({ ...intent, empregadorId: randomUUID() }))).rejects.toMatchObject({ code: "ESCOPO_NEGADO", status: 403 })
    expect(await prisma.dpDocumento.count({ where: { empregadorId: employer, storeId: actor.storeId } })).toBe(before)
  })
})
