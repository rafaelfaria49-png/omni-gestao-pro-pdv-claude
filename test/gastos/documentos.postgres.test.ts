import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createHash } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { DocumentoStorageFixture, documentoStorageRef } from "@/lib/gastos/documentos-fixture"
import { autorizarDownloadDocumentoGasto, consultarDocumentoGasto, listarDocumentosGasto,
  registrarDocumentoGasto, revisarOrfaosDocumentosGasto, vincularDocumentoGasto } from "@/lib/gastos/documentos"
import { contexto, E1, E2, P1, P2, L1, U1, U2, ids, login, prepararG003, limparG003, estadoFinanceiroG003 } from "./g003-fixtures"

vi.mock("@/auth", async () => ({ auth: async () => (await import("./g003-fixtures")).sessaoAtual }))
const bytes = Buffer.from("SENTINELA_DOCUMENTO_PRIVADO - synthetic receipt 123.45")
const input = (conteudo = bytes) => ({ nomeArquivo: "comprovante.txt", conteudo, proveniencia: "FIXTURE" })
let clock = Date.now(), storage = new DocumentoStorageFixture(() => clock)

function sinal() {
  let resolver: () => void = () => { throw new Error("Sinal não iniciado") }
  const promise = new Promise<void>(resolve => { resolver = resolve })
  return { promise, resolver: () => resolver() }
}

async function resultado<T>(task: Promise<T>): Promise<PromiseSettledResult<T>> {
  try { return { status: "fulfilled", value: await task } }
  catch (reason) { return { status: "rejected", reason } }
}

async function aguardarLocksDocumentais(quantidade: number) {
  const limite = Date.now() + 10_000
  while (Date.now() < limite) {
    const [row] = await prisma.$queryRaw<Array<{ total: number }>>`
      SELECT count(*)::int AS total FROM pg_stat_activity
      WHERE datname=current_database() AND usename=current_user AND pid<>pg_backend_pid()
        AND state='active' AND wait_event_type='Lock' AND query ~ 'documentos_(gastos|vinculos)'`
    if (row.total >= quantidade) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`Não foram observadas ${quantidade} esperas reais por lock documental`)
}

describe.skipIf(!process.env.GASTOS_G003_TEST_DATABASE_URL)("G003 documentos / PostgreSQL real + storage fixture", () => {
  beforeEach(async () => { await prepararG003(); clock = Date.now(); storage = new DocumentoStorageFixture(() => clock) })
  afterEach(() => vi.restoreAllMocks())
  afterAll(async () => { await limparG003(); await prisma.$disconnect() })

  it("mesmos bytes/hash em P1/P2/E1 produzem identidades e paths independentes", async () => {
    const p1 = await contexto(P1), e1 = await contexto(E1)
    const d1 = await registrarDocumentoGasto(p1, input(), storage)
    expect(await registrarDocumentoGasto(p1, input(), storage)).toEqual(d1)
    const de = await registrarDocumentoGasto(e1, input(), storage)
    login(U2, [L1])
    const p2 = await contexto(P2), d2 = await registrarDocumentoGasto(p2, input(), storage)
    expect(new Set([d1.id, d2.id, de.id]).size).toBe(3)
    expect((await listarDocumentosGasto(p2)).map(row => row.id)).toEqual([d2.id])
    const rows = await prisma.documentoGasto.findMany({ where: { id: { in: [d1.id, d2.id, de.id] } } })
    expect(new Set(rows.map(row => row.sha256)).size).toBe(1)
    expect(new Set(rows.map(row => row.storageRef)).size).toBe(3)
    expect(rows.find(row => row.id === d1.id)).toMatchObject({ storeId: null, ownerAdminUserId: U1 })
  })

  it("U2 ADMIN compartilhado não encontra documento P1; erro coincide com ID inexistente", async () => {
    const d1 = await registrarDocumentoGasto(await contexto(P1), input(), storage)
    login(U2, [L1])
    const p2 = await contexto(P2)
    const error = (id: string) => consultarDocumentoGasto(p2, id).catch((e: unknown) => e)
    expect(await error(d1.id)).toMatchObject({ status: 404, message: "Registro financeiro indisponível." })
    expect(await error("inexistente")).toMatchObject({ status: 404, message: "Registro financeiro indisponível." })
    expect(await listarDocumentosGasto(p2)).toEqual([])
    const signing = vi.spyOn(storage, "criarDownloadAssinado")
    await expect(autorizarDownloadDocumentoGasto(p2, d1.id, storage)).rejects.toMatchObject({ status: 404 })
    expect(signing).not.toHaveBeenCalled()
  })

  it("seis registros concorrentes deduplicam no PostgreSQL e no storage somente dentro do perfil", async () => {
    const p1 = await contexto(P1), e1 = await contexto(E1)
    const enviar = vi.spyOn(storage, "enviarConteudoPrivado")
    const docs = await Promise.all(Array.from({ length: 6 }, () => registrarDocumentoGasto(p1, input(), storage)))
    for (const doc of docs) expect(doc).toEqual(docs[0])
    expect(enviar).toHaveBeenCalledTimes(1)
    const pessoais = await prisma.documentoGasto.findMany({ where: { perfilId: P1 } })
    expect(pessoais).toHaveLength(1)
    expect(await storage.obterMetadata(pessoais[0].storageRef)).toEqual({ bytes: bytes.length, mime: "text/plain" })
    const [pessoal, empresa] = await Promise.all([
      registrarDocumentoGasto(p1, input(), storage), registrarDocumentoGasto(e1, input(), storage),
    ])
    expect(pessoal.id).toBe(docs[0].id)
    expect(empresa.id).not.toBe(pessoal.id)
    expect(enviar).toHaveBeenCalledTimes(2)
    const rows = await prisma.documentoGasto.findMany({ where: { perfilId: { in: [P1, E1] } } })
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map(row => row.sha256)).size).toBe(1)
    expect(new Set(rows.map(row => row.storageRef)).size).toBe(2)
  }, 60_000)

  it("falha PostgreSQL após upload real faz rollback da linha e remove somente o objeto recém-enviado", async () => {
    // DDL exclusivo da fixture confirmada por prepararG003; não altera trigger canônico.
    await prisma.$executeRawUnsafe("DROP TRIGGER IF EXISTS g003_fixture_doc_falha_pos_upload_trg ON documentos_gastos")
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION g003_fixture_doc_falha_pos_upload()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW."nomeArquivo" = 'g003-falha-pos-upload.txt' THEN
          RAISE EXCEPTION 'G003_FIXTURE_FALHA_APOS_UPLOAD';
        END IF; RETURN NEW; END $$`)
    await prisma.$executeRawUnsafe(`CREATE TRIGGER g003_fixture_doc_falha_pos_upload_trg
      BEFORE INSERT ON documentos_gastos FOR EACH ROW EXECUTE FUNCTION g003_fixture_doc_falha_pos_upload()`)
    try {
      const enviar = vi.spyOn(storage, "enviarConteudoPrivado"), remover = vi.spyOn(storage, "removerObjeto")
      const errors = vi.spyOn(console, "error"), warnings = vi.spyOn(console, "warn")
      const ctx = await contexto(P1)
      await expect(registrarDocumentoGasto(ctx, { ...input(), nomeArquivo: "g003-falha-pos-upload.txt" }, storage))
        .rejects.toThrow("Não foi possível consultar")
      expect(enviar).toHaveBeenCalledTimes(1)
      const path = enviar.mock.calls[0][0]
      expect(remover).toHaveBeenCalledExactlyOnceWith(path)
      expect(await storage.obterMetadata(path)).toBeNull()
      expect(await prisma.documentoGasto.count({ where: { perfilId: P1 } })).toBe(0)
      const logs = JSON.stringify([errors.mock.calls, warnings.mock.calls])
      for (const segredo of [P1, U1, path, bytes.toString(), "g003-falha-pos-upload.txt"]) expect(logs).not.toContain(segredo)
    } finally {
      await prisma.$executeRawUnsafe("DROP TRIGGER IF EXISTS g003_fixture_doc_falha_pos_upload_trg ON documentos_gastos")
      await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS g003_fixture_doc_falha_pos_upload()")
    }
  }, 60_000)

  it.each(["vinculo", "retencao"] as const)("%s primeiro na fila: vínculo e quarentena disputam lock real sem estado impossível", async primeiro => {
    const ctx = await contexto(P1), doc = await registrarDocumentoGasto(ctx, input(), storage)
    const futuro = new Date(Date.now() + 2 * 86_400_000), travado = sinal(), liberar = sinal()
    const bloqueador = prisma.$transaction(async db => {
      await db.$queryRaw`SELECT "id" FROM documentos_gastos WHERE "id"=${doc.id} FOR UPDATE`
      travado.resolver()
      await liberar.promise
    }, { timeout: 30_000 })
    await Promise.race([travado.promise, bloqueador])
    let vinculo: Promise<PromiseSettledResult<Awaited<ReturnType<typeof vincularDocumentoGasto>>>> | undefined
    let retencao: Promise<PromiseSettledResult<Awaited<ReturnType<typeof revisarOrfaosDocumentosGasto>>>> | undefined
    const vincular = () => resultado(vincularDocumentoGasto(ctx, doc.id, { tipo: "PAGAR", id: ids(P1).pagar }))
    const revisar = () => resultado(revisarOrfaosDocumentosGasto(ctx, futuro))
    try {
      if (primeiro === "vinculo") vinculo = vincular()
      else retencao = revisar()
      await aguardarLocksDocumentais(1)
      if (primeiro === "vinculo") retencao = revisar()
      else vinculo = vincular()
      await aguardarLocksDocumentais(2)
    } finally {
      liberar.resolver()
      await bloqueador
      await Promise.all([vinculo, retencao])
    }
    if (!vinculo || !retencao) throw new Error("Operações concorrentes não iniciadas")
    const [v, r] = await Promise.all([vinculo, retencao])
    expect(r.status).toBe("fulfilled")
    if (r.status !== "fulfilled") throw r.reason
    const row = await prisma.documentoGasto.findUniqueOrThrow({ where: { id: doc.id }, include: { vinculos: true } })
    expect(row.estado === "QUARENTENA" && row.vinculos.length > 0).toBe(false)
    expect(row.estado).toBe(primeiro === "retencao" ? "QUARENTENA" : "DISPONIVEL")
    expect(row.vinculos).toHaveLength(primeiro === "retencao" ? 0 : 1)
    expect(v.status).toBe(primeiro === "retencao" ? "rejected" : "fulfilled")
    expect(r.value.quarentenados).toBe(primeiro === "retencao" ? 1 : 0)
    expect(await storage.obterMetadata(row.storageRef)).toMatchObject({ bytes: bytes.length })
  }, 60_000)

  it("documento empresarial de L2 não é acessível pelo contexto E1, mesmo do mesmo dono de sessão", async () => {
    const e1 = await contexto(E1), e2 = await contexto(E2)
    const doc = await registrarDocumentoGasto(e2, input(), storage)
    await expect(consultarDocumentoGasto(e1, doc.id)).rejects.toMatchObject({ status: 404 })
    await expect(autorizarDownloadDocumentoGasto(e1, doc.id, storage)).rejects.toMatchObject({ status: 404 })
  })

  it("empresa compartilha somente entre seus membros; compartilhar loja não compartilha pessoal", async () => {
    const docEmpresa = await registrarDocumentoGasto(await contexto(E1), input(), storage)
    const docPessoal = await registrarDocumentoGasto(await contexto(P1), input(), storage)
    login(U2, [L1])
    const e1 = await contexto(E1)
    expect((await consultarDocumentoGasto(e1, docEmpresa.id)).id).toBe(docEmpresa.id)
    await expect(consultarDocumentoGasto(e1, docPessoal.id)).rejects.toMatchObject({ status: 404 })
  })

  it("download autorizado usa capability opaca de 60s, com no-store e bytes íntegros", async () => {
    const ctx = await contexto(P1), doc = await registrarDocumentoGasto(ctx, input(), storage)
    const result = await autorizarDownloadDocumentoGasto(ctx, doc.id, storage)
    expect(result.expiresInSec).toBe(60)
    expect(result.headers["Cache-Control"]).toContain("private, no-store")
    expect(result.signedUrl).toMatch(/^fixture-private:\/\/download\/[\w-]{43}$/)
    expect(await storage.consumirDownload(result.signedUrl)).toEqual(bytes)
    const serialized = JSON.stringify(result)
    for (const hidden of ["storageRef", "sha256", "ownerAdminUserId", "perfilId", P1, U1]) expect(serialized).not.toContain(hidden)
    clock += 60_000
    await expect(storage.consumirDownload(result.signedUrl)).rejects.toMatchObject({ status: 404 })
    const row = await prisma.documentoGasto.findUniqueOrThrow({ where: { id: doc.id } })
    expect(row.storageRef).toBe(documentoStorageRef(P1, doc.id))
    expect(row.storageRef).not.toContain("fixture-private:")
  })

  it.each(["../outro", "..%2foutro", "perfil/arquivo", "C:\\arquivo", "https://externo.invalid/a"])("path/ID arbitrário %s é recusado antes do storage", async forged => {
    const signing = vi.spyOn(storage, "criarDownloadAssinado")
    await expect(autorizarDownloadDocumentoGasto(await contexto(P1), forged, storage)).rejects.toThrow()
    await expect(storage.abrirConteudoPrivado(forged)).rejects.toThrow()
    expect(signing).not.toHaveBeenCalled()
  })

  it("contexto clonado e storeId/owner enviados no registro não são autoridade", async () => {
    const ctx = await contexto(P1), write = vi.spyOn(storage, "enviarConteudoPrivado")
    await expect(registrarDocumentoGasto({ ...ctx }, input(), storage)).rejects.toThrow()
    await expect(registrarDocumentoGasto(ctx, { ...input(), storeId: L1, ownerAdminUserId: U2 }, storage)).rejects.toThrow()
    expect(write).not.toHaveBeenCalled()
  })

  it("MIME/bytes/hash são derivados dos bytes e não existem no DTO público", async () => {
    const doc = await registrarDocumentoGasto(await contexto(P1), input(), storage)
    expect(doc).toMatchObject({ mime: "text/plain", bytes: bytes.length })
    const row = await prisma.documentoGasto.findUniqueOrThrow({ where: { id: doc.id } })
    expect(row.sha256).toBe(createHash("sha256").update(bytes).digest("hex"))
    expect(row.proveniencia).toBe("FIXTURE")
    expect(row.historico).toMatchObject([{ acao: "REGISTRADO", atorId: U1 }])
    await expect(registrarDocumentoGasto(await contexto(P1), input(Buffer.from("<svg>bad</svg>")), storage)).rejects.toThrow()
  })

  it("vínculos de título, conta e movimento são canônicos e idempotentes no mesmo perfil", async () => {
    const ctx = await contexto(P1), doc = await registrarDocumentoGasto(ctx, input(), storage)
    const alvo = { tipo: "PAGAR", id: ids(P1).pagar }
    const first = await vincularDocumentoGasto(ctx, doc.id, alvo)
    expect(await vincularDocumentoGasto(ctx, doc.id, alvo)).toEqual(first)
    await vincularDocumentoGasto(ctx, doc.id, { tipo: "CONTA", id: ids(P1).conta })
    await vincularDocumentoGasto(ctx, doc.id, { tipo: "MOVIMENTACAO", id: ids(P1).movimento })
    expect(await prisma.documentoVinculo.count({ where: { documentoId: doc.id } })).toBe(3)
  })

  it.each([P2, E1, E2])("alvo estrangeiro %s é negado pelo serviço e pelo PostgreSQL direto", async perfil => {
    const ctx = await contexto(P1), doc = await registrarDocumentoGasto(ctx, input(), storage)
    await expect(vincularDocumentoGasto(ctx, doc.id, { tipo: "PAGAR", id: ids(perfil).pagar })).rejects.toThrow()
    await expect(prisma.documentoVinculo.create({ data: { documentoId: doc.id, perfilId: P1, storeId: null, pagarTituloId: ids(perfil).pagar } })).rejects.toThrow()
    expect(await prisma.documentoVinculo.count()).toBe(0)
  })

  it("conta inativa recusa vínculo novo sem apagar o vínculo histórico anterior", async () => {
    const ctx = await contexto(P1), doc = await registrarDocumentoGasto(ctx, input(), storage)
    await vincularDocumentoGasto(ctx, doc.id, { tipo: "CONTA", id: ids(P1).conta })
    await prisma.carteiraFinanceira.update({ where: { id: ids(P1).conta }, data: { ativo: false } })
    const outro = await registrarDocumentoGasto(ctx, input(Buffer.from("another receipt")), storage)
    await expect(vincularDocumentoGasto(ctx, outro.id, { tipo: "CONTA", id: ids(P1).conta })).rejects.toThrow()
    expect(await prisma.documentoVinculo.count({ where: { documentoId: doc.id } })).toBe(1)
  })

  it("título empresarial legado NULL pode receber vínculo sem ser adotado pela leitura/escrita documental", async () => {
    const ctx = await contexto(E1), doc = await registrarDocumentoGasto(ctx, input(), storage)
    await vincularDocumentoGasto(ctx, doc.id, { tipo: "PAGAR", id: "g003-legado-pagar" })
    expect((await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: "g003-legado-pagar" } })).perfilId).toBeNull()
  })

  it("FK/trigger impedem dono errado, path estrangeiro e vínculos órfãos ou ambíguos", async () => {
    const ctx = await contexto(P1), doc = await registrarDocumentoGasto(ctx, input(), storage)
    await expect(prisma.documentoGasto.update({ where: { id: doc.id }, data: { ownerAdminUserId: U2 } })).rejects.toThrow()
    await expect(prisma.documentoGasto.update({ where: { id: doc.id }, data: { storageRef: documentoStorageRef(P2, doc.id) } })).rejects.toThrow()
    await expect(prisma.documentoVinculo.create({ data: { documentoId: doc.id, perfilId: P1 } })).rejects.toThrow()
    await expect(prisma.documentoVinculo.create({ data: { documentoId: doc.id, perfilId: P1, pagarTituloId: ids(P1).pagar, carteiraId: ids(P1).conta } })).rejects.toThrow()
    await expect(prisma.documentoVinculo.create({ data: { documentoId: "inexistente", perfilId: P1, pagarTituloId: ids(P1).pagar } })).rejects.toThrow()
  })

  it("órfãos entram em quarentena/revisão sem exclusão, vínculo retém histórico e dinheiro", async () => {
    const ctx = await contexto(P1), orphan = await registrarDocumentoGasto(ctx, input(), storage)
    const linked = await registrarDocumentoGasto(ctx, input(Buffer.from("linked receipt")), storage)
    await vincularDocumentoGasto(ctx, linked.id, { tipo: "PAGAR", id: ids(P1).pagar })
    const titulosBefore = await prisma.contaPagarTitulo.findMany({ orderBy: { id: "asc" } })
    const futuro = new Date(Date.now() + 2 * 86_400_000)
    expect(await revisarOrfaosDocumentosGasto(ctx, futuro)).toEqual({ quarentenados: 1, excluidos: 0 })
    expect(await revisarOrfaosDocumentosGasto(ctx, futuro)).toEqual({ quarentenados: 0, excluidos: 0 })
    const row = await prisma.documentoGasto.findUniqueOrThrow({ where: { id: orphan.id } })
    expect(row.estado).toBe("QUARENTENA")
    expect(row.retencaoRevisarEm?.getTime()).toBe(futuro.getTime() + 30 * 86_400_000)
    expect(await storage.obterMetadata(row.storageRef)).toMatchObject({ bytes: bytes.length })
    expect((await consultarDocumentoGasto(ctx, linked.id)).estado).toBe("DISPONIVEL")
    await expect(autorizarDownloadDocumentoGasto(ctx, orphan.id, storage)).rejects.toMatchObject({ status: 404 })
    expect(await prisma.contaPagarTitulo.findMany({ orderBy: { id: "asc" } })).toEqual(titulosBefore)
  })

  it("download/consulta são read-only, não espelham conteúdo em auditoria, memória ou logs", async () => {
    const warn = vi.spyOn(console, "warn"), error = vi.spyOn(console, "error")
    const auditoriasAntes = await prisma.auditoriaFinanceira.count()
    const ctx = await contexto(P1), doc = await registrarDocumentoGasto(ctx, input(), storage)
    const before = await estadoFinanceiroG003()
    await consultarDocumentoGasto(ctx, doc.id)
    await autorizarDownloadDocumentoGasto(ctx, doc.id, storage)
    expect(await estadoFinanceiroG003()).toBe(before)
    expect(await prisma.auditoriaFinanceira.count()).toBe(auditoriasAntes)
    expect(await prisma.omniAgentMemory.count()).toBe(0)
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    vi.spyOn(storage, "abrirConteudoPrivado").mockRejectedValue(new Error("SENTINELA_DOCUMENTO_PRIVADO raw-path/token"))
    await expect(autorizarDownloadDocumentoGasto(ctx, doc.id, storage)).rejects.toMatchObject({ status: 404, message: "Registro financeiro indisponível." })
  })
})
