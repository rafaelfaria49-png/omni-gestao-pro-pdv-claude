import { createHash, randomBytes, randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it, vi } from "vitest"

const sessao = vi.hoisted(() => ({ userId: "", storeId: "" }))
const blobs = vi.hoisted(() => new Map<string, Buffer>())

vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: sessao.userId } }) }))
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: sessao.storeId }) }),
}))
vi.mock("@/lib/contador/documentos/storage-r2", () => ({
  storageR2: {
    criarUploadAssinado: async (storageRef: string) => ({
      storageRef, signedUrl: "https://example.invalid/upload", token: "", expiresInSec: 120,
      headersObrigatorios: { "If-None-Match": "*" },
    }),
    abrirConteudoPrivado: async (ref: string) => {
      const value = blobs.get(ref)
      if (!value) throw new Error("arquivo ausente")
      return value
    },
    removerObjeto: async (ref: string) => { blobs.delete(ref) },
    verificarExistencia: async (ref: string) => blobs.has(ref),
    criarDownloadAssinado: async () => ({ signedUrl: "https://example.invalid/download", expiresInSec: 300 }),
  },
}))

import { prisma } from "@/lib/prisma"
import {
  concederAcesso, criarEmpregador, listarEmpregadores, revogarAcesso, vincularUnidade,
} from "./admin"
import {
  atualizarDadosPessoais, completarVinculoRascunho, criarFuncionario, criarVersaoContrato, listarFuncionarios, obterFuncionario,
} from "./cadastro"
import {
  autorizarDownload, confirmarUpload, criarUploadIntent, listarDocumentos,
} from "./documentos/service"
import { verificarIntent } from "./documentos/intent"
import { protegerCpf } from "./domain"

const dbUrl = process.env.PESSOAS_HOMOLOGATION_DATABASE_URL
const executa = !!dbUrl
const sufix = randomUUID().slice(0, 8)
const storeA = "dpstore-a-" + sufix
const storeB = "dpstore-b-" + sufix
const storeC = "dpstore-c-" + sufix
let adminA = ""
let adminB = ""
let gerente = ""
let empA = ""
let empB = ""
let funcionarioA = ""
let funcionarioB = ""
let contratoA = ""
let versaoA = 0

function ator(userId: string, storeId: string) {
  sessao.userId = userId
  sessao.storeId = storeId
}
function id() { return randomUUID() }

describe.skipIf(!executa).sequential("Pessoas: integração real em PostgreSQL isolado", () => {
  beforeAll(async () => {
    const u = new URL(dbUrl!)
    if (process.env.DATABASE_URL !== dbUrl || process.env.DIRECT_URL !== dbUrl ||
        u.hostname !== "127.0.0.1" || u.port !== "55439" ||
        u.pathname !== "/omni_pessoas_001a_homolog" || u.username !== "omni_homolog") {
      throw new Error("DESTINO_NAO_ISOLADO")
    }
    process.env.PESSOAS_DP_ENABLED = "on"
    process.env.PESSOAS_CPF_ENC_KEY = randomBytes(32).toString("base64")
    process.env.PESSOAS_CPF_HMAC_KEY = randomBytes(32).toString("base64")
    process.env.PESSOAS_DOCUMENT_INTENT_KEY = randomBytes(32).toString("base64")
    process.env.PESSOAS_STORAGE_PROVIDER = "r2"
    await prisma.store.createMany({ data: [
      { id: storeA, name: "Sintética A" }, { id: storeB, name: "Sintética B" },
      { id: storeC, name: "Sintética C" },
    ] })
    const [a, b, g] = await Promise.all([
      prisma.adminUser.create({ data: { email: `dp-a-${sufix}@example.invalid`, password: "synthetic", role: "ADMIN", lojaId: storeA } }),
      prisma.adminUser.create({ data: { email: `dp-b-${sufix}@example.invalid`, password: "synthetic", role: "ADMIN", lojaId: storeB } }),
      prisma.adminUser.create({ data: { email: `dp-g-${sufix}@example.invalid`, password: "synthetic", role: "GERENTE", lojaId: storeA } }),
    ])
    adminA = a.id
    adminB = b.id
    gerente = g.id
  })

  it("recusa bootstrap de gerente e flag OFF sem consultar DP", async () => {
    ator(gerente, storeA)
    await expect(criarEmpregador({
      comandoId: id(), tipoInscricao: "CNPJ", inscricao: "ABC001",
      nome: "Tentativa", validFrom: "2020-01-01", motivo: "teste",
      estabelecimento: { tipoInscricao: "CNPJ", inscricao: "ABC001", nome: "Tentativa" },
    })).rejects.toMatchObject({ code: "BOOTSTRAP_NEGADO" })
    process.env.PESSOAS_DP_ENABLED = "off"
    await expect(listarFuncionarios("empregador-falso")).rejects.toMatchObject({ code: "PESSOAS_DESABILITADO" })
    process.env.PESSOAS_DP_ENABLED = "on"
  })

  it("cria dois empregadores/lojas com mesma inscrição sem agrupamento", async () => {
    ator(adminA, storeA)
    const a = await criarEmpregador({
      comandoId: id(), tipoInscricao: "CNPJ", inscricao: "ABC001", nome: "Empregador A",
      validFrom: "2020-01-01", motivo: "Implantação sintética A",
      estabelecimento: { tipoInscricao: "CNPJ", inscricao: "ABC001", nome: "Sede A" },
    })
    empA = a.id
    ator(adminB, storeB)
    const b = await criarEmpregador({
      comandoId: id(), tipoInscricao: "CNPJ", inscricao: "ABC001", nome: "Empregador B",
      validFrom: "2020-01-01", motivo: "Implantação sintética B",
      estabelecimento: { tipoInscricao: "CNPJ", inscricao: "ABC001", nome: "Sede B" },
    })
    empB = b.id
    expect(empA).not.toBe(empB)
    expect(await prisma.dpEmpregador.count({ where: { inscricao: "ABC001", id: { in: [empA, empB] } } })).toBe(2)
  })

  it("mapeia Store adicional somente após autoridade comprovada e confirmação explícita", async () => {
    ator(adminA, storeA)
    const entrada = {
      empregadorId: empA, comandoId: id(), storeId: storeC,
      estabelecimentoId: (await prisma.dpEstabelecimento.findFirstOrThrow({
        where: { empregadorId: empA }, select: { id: true },
      })).id,
      validFrom: "2020-01-01", motivo: "Mapeamento sintético", confirmarAcessoGestor: true as const,
    }
    await expect(vincularUnidade(entrada)).rejects.toMatchObject({ code: "ESCOPO_NEGADO" })
    expect(await prisma.dpUnidadeVinculo.count({ where: { empregadorId: empA, storeId: storeC } })).toBe(0)
    await prisma.adminUserStore.create({ data: { adminUserId: adminA, storeId: storeC } })
    await vincularUnidade({ ...entrada, comandoId: id() })
    ator(adminA, storeC)
    expect((await listarEmpregadores()).map((e) => e.id)).toContain(empA)
    expect((await listarEmpregadores()).map((e) => e.id)).not.toContain(empB)
    ator(adminA, storeA)
  })
  it("persiste cadastro e leitura após nova consulta, sem inventar admissão", async () => {
    ator(adminA, storeA)
    const comando = id()
    const entrada = {
      empregadorId: empA, comandoId: comando, motivo: "Cadastro histórico sintético",
      nome: "Ana Sintética", cpf: "52998224725", matricula: "MAT001",
      admissao: "2020-03-12", regime: "CLT", categoria: "101",
      cargo: "Atendente", cbo: "521110", salarioBase: "2500.00",
      unidadeSalario: "MENSAL", jornadaSemanal: "44.00", divisor: 220,
      contractValidFrom: "2020-03-12",
    }
    const criado = await criarFuncionario(entrada)
    funcionarioA = criado.id
    contratoA = criado.contrato!.id
    versaoA = criado.versaoAtual
    expect(criado.status).toBe("ATIVO")
    expect(criado.admissao).toBe("2020-03-12")
    expect(criado.pendencias).toEqual([])
    expect((await obterFuncionario(empA, funcionarioA)).nome).toBe("Ana Sintética")
    expect((await criarFuncionario(entrada)).id).toBe(funcionarioA)
    await expect(criarFuncionario({ ...entrada, nome: "Outro", comandoId: comando })).rejects.toMatchObject({ code: "IDEMPOTENCIA_CONFLITO" })
    expect(await prisma.dpAuditoria.count({ where: { empregadorId: empA, comandoId: comando } })).toBe(1)
  })

  it("preserva campos obrigatórios e não audita edição inválida de vínculo ativo", async () => {
    ator(adminA, storeA)
    const antes = await obterFuncionario(empA, funcionarioA)
    const comandoNome = id()
    await expect(atualizarDadosPessoais({
      empregadorId: empA, vinculoId: funcionarioA, comandoId: comandoNome,
      expectedPersonVersion: antes.pessoaVersaoAtual, nome: "", motivo: "Tentativa de remover nome",
    })).rejects.toMatchObject({ code: "CADASTRO_INCOMPLETO" })
    const comandoCpf = id()
    await expect(atualizarDadosPessoais({
      empregadorId: empA, vinculoId: funcionarioA, comandoId: comandoCpf,
      expectedPersonVersion: antes.pessoaVersaoAtual, cpf: "", motivo: "Tentativa de remover CPF",
    })).rejects.toMatchObject({ code: "CADASTRO_INCOMPLETO" })
    const depois = await obterFuncionario(empA, funcionarioA)
    expect(depois.pessoaVersaoAtual).toBe(antes.pessoaVersaoAtual)
    expect(depois.nome).toBe(antes.nome)
    expect(depois.cpf).toBe(antes.cpf)
    expect(await prisma.dpAuditoria.count({ where: { empregadorId: empA, comandoId: { in: [comandoNome, comandoCpf] } } })).toBe(0)
  })
  it("permite outro vínculo da mesma pessoa e completa rascunho sem data presumida", async () => {
    ator(adminA, storeA)
    const outro = await criarFuncionario({
      empregadorId: empA, comandoId: id(), motivo: "Segundo vínculo sintético",
      nome: "Ana Sintética", cpf: "52998224725", matricula: "MAT002",
      admissao: "2021-04-01", regime: "CLT", categoria: "101",
      cargo: "Atendente", cbo: "521110", salarioBase: "2600.00",
      unidadeSalario: "MENSAL", jornadaSemanal: "44.00", divisor: 220,
      contractValidFrom: "2021-04-01",
    })
    const primeiro = await obterFuncionario(empA, funcionarioA)
    expect(outro.pessoaId).toBe(primeiro.pessoaId)
    expect(await prisma.dpPessoa.count({ where: { empregadorId: empA, cpfHash: protegerCpf("52998224725", empA).cpfHash } })).toBe(1)

    const draft = await criarFuncionario({
      empregadorId: empA, comandoId: id(), motivo: "Importação incompleta",
      nome: "Rascunho Sintético", cpf: "11144477735",
    })
    expect(draft.status).toBe("RASCUNHO")
    expect(draft.admissao).toBeNull()
    expect(draft.pendencias).toContain("admissao")
    const parcial = await completarVinculoRascunho({
      empregadorId: empA, vinculoId: draft.id, comandoId: id(), expectedVersion: draft.versaoAtual,
      matricula: "MAT-DRAFT", admissao: "2018-02-03",
      regime: "CLT", categoria: "101", motivo: "Histórico confirmado",
    })
    expect(parcial.status).toBe("RASCUNHO")
    const completo = await criarVersaoContrato({
      empregadorId: empA, vinculoId: draft.id, comandoId: id(),
      expectedVersion: parcial.versaoAtual, supersedesId: parcial.contrato!.id,
      tipoMudanca: "ALTERACAO", validFrom: "2018-02-03",
      cargo: "Atendente", cbo: "521110", salarioBase: "1800.00",
      unidadeSalario: "MENSAL", jornadaSemanal: "44.00", divisor: 220,
      motivo: "Contrato histórico confirmado",
    })
    expect(completo.status).toBe("ATIVO")
    expect(completo.admissao).toBe("2018-02-03")
  })
  it("CPF é escopado; matrícula duplicada reverte pessoa e auditoria", async () => {
    ator(adminB, storeB)
    const b = await criarFuncionario({
      empregadorId: empB, comandoId: id(), motivo: "Cadastro sintético B",
      nome: "Ana B", cpf: "52998224725", matricula: "MAT001",
      admissao: "2019-01-01", regime: "CLT", categoria: "101",
      cargo: "Atendente", cbo: "521110", salarioBase: "1800.00",
      unidadeSalario: "MENSAL", jornadaSemanal: "44.00", divisor: 220,
      contractValidFrom: "2019-01-01",
    })
    funcionarioB = b.id
    expect(b.pessoaId).not.toBe((await obterFuncionario(empA, funcionarioA).catch(() => ({ pessoaId: "" }))).pessoaId)
    ator(adminA, storeA)
    const comando = id()
    await expect(criarFuncionario({
      empregadorId: empA, comandoId: comando, motivo: "Duplicidade sintética",
      nome: "Outra", cpf: "12345678909", matricula: "MAT001",
    })).rejects.toMatchObject({ code: "DUPLICIDADE" })
    const hash = protegerCpf("12345678909", empA).cpfHash
    expect(await prisma.dpPessoa.count({ where: { empregadorId: empA, cpfHash: hash } })).toBe(0)
    expect(await prisma.dpAuditoria.count({ where: { empregadorId: empA, comandoId: comando } })).toBe(0)
  })

  it("banco rejeita inserção direta fora do mapeamento e alteração de auditoria", async () => {
    ator(adminA, storeA)
    const primeiro = await prisma.dpVinculo.findUnique({ where: { id: funcionarioA }, select: { pessoaId: true } })
    expect(primeiro).not.toBeNull()
    await expect(prisma.dpVinculo.create({
      data: { empregadorId: empA, pessoaId: primeiro!.pessoaId, storeId: storeB },
    })).rejects.toThrow()
    const audit = await prisma.dpAuditoria.findFirst({ where: { empregadorId: empA, acao: "FUNCIONARIO_CRIAR" } })
    expect(audit).not.toBeNull()
    await expect(prisma.dpAuditoria.update({
      where: { id: audit!.id }, data: { justificativa: "alterado" },
    })).rejects.toThrow()
  })
  it("grants revogados, salário oculto e IDs de outro escopo", async () => {
    ator(adminA, storeA)
    const acesso = await concederAcesso({
      empregadorId: empA, comandoId: id(), adminUserId: gerente,
      storeId: storeA, capacidades: ["viewCadastro"], motivo: "Leitura cadastral sintética",
    })
    ator(gerente, storeA)
    const lista = await listarFuncionarios(empA)
    expect(lista[0].salarioBase).toBeNull()
    expect(lista[0].remuneracaoOculta).toBe(true)
    await expect(obterFuncionario(empB, funcionarioB)).rejects.toMatchObject({ code: "ESCOPO_NEGADO" })
    ator(adminA, storeA)
    await revogarAcesso({ empregadorId: empA, comandoId: id(), acessoId: acesso.id, motivo: "Revogação sintética" })
    ator(gerente, storeA)
    await expect(listarFuncionarios(empA)).rejects.toMatchObject({ code: "ESCOPO_NEGADO" })
  })

  it("contrato concorrente preserva uma versão vigente e auditoria atômica", async () => {
    ator(adminA, storeA)
    const base = {
      empregadorId: empA, vinculoId: funcionarioA, expectedVersion: versaoA,
      supersedesId: contratoA, tipoMudanca: "ALTERACAO" as const,
      validFrom: "2022-01-01", cargo: "Atendente", cbo: "521110",
      salarioBase: "3000.00", unidadeSalario: "MENSAL",
      jornadaSemanal: "44.00", divisor: 220, motivo: "Reajuste sintético",
    }
    const auditoriasAntes = await prisma.dpAuditoria.count({ where: { empregadorId: empA, acao: "CONTRATO_VERSIONAR" } })
    const resultados = await Promise.allSettled([
      criarVersaoContrato({ ...base, comandoId: id() }),
      criarVersaoContrato({ ...base, comandoId: id(), salarioBase: "3100.00" }),
    ])
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(resultados.filter((r) => r.status === "rejected")).toHaveLength(1)
    const contrato = await prisma.dpContratoVersao.findMany({ where: { vinculoId: funcionarioA, supersededAt: null } })
    expect(contrato).toHaveLength(1)
    expect(contrato[0].versao).toBe(2)
    expect(await prisma.dpAuditoria.count({ where: { empregadorId: empA, acao: "CONTRATO_VERSIONAR" } })).toBe(auditoriasAntes + 1)
  })

  it("documento privado verifica hash físico, proprietário e download", async () => {
    ator(adminA, storeA)
    const pdf = Buffer.from("%PDF-1.7\nconteudo sintetico")
    const hash = createHash("sha256").update(pdf).digest("hex")
    const upload = await criarUploadIntent({
      empregadorId: empA, vinculoId: funcionarioA, categoria: "holerite_externo",
      origem: "CONTADOR_EXTERNO", nomeArquivo: "externo.pdf", mime: "application/pdf",
      bytes: pdf.length, sha256: hash,
    })
    const intent = verificarIntent(upload.uploadIntent)
    blobs.set(intent.storageRef, pdf)
    const doc = await confirmarUpload(upload.uploadIntent)
    expect(doc.origem).toBe("CONTADOR_EXTERNO")
    expect((await listarDocumentos(empA, funcionarioA)).some((d) => d.id === doc.id)).toBe(true)
    expect((await autorizarDownload(empA, doc.id)).expiresInSec).toBeLessThanOrEqual(300)
    ator(adminB, storeB)
    await expect(autorizarDownload(empA, doc.id)).rejects.toMatchObject({ code: "ESCOPO_NEGADO" })
    ator(adminA, storeA)
    const ruim = await criarUploadIntent({
      empregadorId: empA, vinculoId: funcionarioA, categoria: "contrato",
      origem: "INTERNO", nomeArquivo: "contrato.pdf", mime: "application/pdf",
      bytes: pdf.length, sha256: hash,
    })
    const ri = verificarIntent(ruim.uploadIntent)
    blobs.set(ri.storageRef, Buffer.from("%PDF-1.7\nadulteradoxxxxxxxx"))
    await expect(confirmarUpload(ruim.uploadIntent)).rejects.toMatchObject({ code: "INTEGRIDADE_INVALIDA" })
    expect(blobs.has(ri.storageRef)).toBe(false)
    expect(await prisma.dpDocumento.findUnique({ where: { id: ri.documentoId } })).toBeNull()
  })
})
