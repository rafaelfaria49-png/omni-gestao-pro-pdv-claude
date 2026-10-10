import { randomBytes, randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { Prisma } from "@/generated/prisma"

const sessao = vi.hoisted(() => ({ userId: "", storeId: "" }))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: sessao.userId } }) }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: sessao.storeId }) }) }))

import { prisma } from "@/lib/prisma"
import { criarEmpregador } from "./admin"
import { criarFuncionario, criarVersaoContrato, type FuncionarioInput } from "./cadastro"
import { executarComando } from "./commands"
import { hashComando, PessoasError } from "./domain"
import type { AtorPessoas } from "./scope"

const dbUrl = process.env.PESSOAS_HOMOLOGATION_DATABASE_URL
let empregadorId = ""
const chave = () => randomUUID()
const ator: AtorPessoas = { userId: "", storeId: "dp-hardening-" + chave(), role: "ADMIN" }
type Callback = (tx: Prisma.TransactionClient) => Promise<string>
type Opcoes = { isolationLevel?: Prisma.TransactionIsolationLevel; maxWait?: number; timeout?: number }
type Transacao = (callback: Callback, opcoes?: Opcoes) => Promise<string>
const transacaoReal = prisma.$transaction.bind(prisma) as Transacao
const erroPrisma = (code: string) => Object.assign(new Error("FALHA_TRANSACIONAL_SINTETICA"), { code })

/** Injeta depois de mutação + auditoria, dentro de uma transação PostgreSQL real. */
function injetar(
  falha: (tentativa: number) => unknown,
  aposRollback?: (tentativa: number, callback: Callback, opcoes?: Opcoes) => Promise<void>,
) {
  let tentativas = 0
  return vi.spyOn(prisma, "$transaction").mockImplementation((async (callback: Callback, opcoes?: Opcoes) => {
    const tentativa = ++tentativas
    expect(opcoes).toEqual({ isolationLevel: "Serializable", maxWait: 10_000, timeout: 20_000 })
    let injetada = false
    try {
      return await transacaoReal(async (tx) => {
        const resultado = await callback(tx)
        const erro = falha(tentativa)
        if (erro) { injetada = true; throw erro }
        return resultado
      }, opcoes)
    } catch (erro) {
      if (injetada) await aposRollback?.(tentativa, callback, opcoes)
      throw erro
    }
  }) as typeof prisma.$transaction)
}

function barreiraDupla() {
  let chegadas = 0
  let liberar!: () => void
  const pronta = new Promise<void>((resolve) => { liberar = resolve })
  return async () => { if (++chegadas === 2) liberar(); await pronta }
}

function comando(
  comandoId: string,
  payload: unknown = { sintetico: true },
  antes?: (tx: Prisma.TransactionClient) => Promise<void>,
  acao = "HARDENING_PESSOA_CRIAR",
  empregadorEsperado = empregadorId,
) {
  return executarComando(ator, acao, comandoId, payload, async (tx) => {
    await antes?.(tx)
    const pessoa = await tx.dpPessoa.create({ data: { empregadorId } })
    return { empregadorId, entidade: "pessoa", entidadeId: pessoa.id }
  }, empregadorEsperado)
}
async function contagens() {
  const where = { empregadorId }
  return Promise.all([
    prisma.dpPessoa.count({ where }), prisma.dpVinculo.count({ where }),
    prisma.dpContratoVersao.count({ where }), prisma.dpAuditoria.count({ where }),
  ])
}
async function unico(comandoId: string, entidadeId: string) {
  const rows = await prisma.dpAuditoria.findMany({ where: { empregadorId, storeId: ator.storeId, comandoId } })
  expect(rows).toHaveLength(1)
  expect(rows[0].entidadeId).toBe(entidadeId)
  expect(await prisma.dpPessoa.count({ where: { empregadorId, id: entidadeId } })).toBe(1)
}
function entradaFuncionario(jornada: unknown = "44.00"): FuncionarioInput {
  return {
    empregadorId, comandoId: chave(), motivo: "MOTIVO_SINTETICO_HARDENING_982341",
    nome: "Pessoa sintética hardening", salarioBase: "982341.57",
    cargo: "Sintético", cbo: "521110", unidadeSalario: "MENSAL", divisor: 220,
    jornadaSemanal: jornada as string, contractValidFrom: "2020-01-01",
  }
}
function entradaContrato(f: Awaited<ReturnType<typeof criarFuncionario>>, jornada: unknown) {
  return {
    empregadorId, vinculoId: f.id, comandoId: chave(), expectedVersion: f.versaoAtual,
    supersedesId: f.contrato!.id, tipoMudanca: "ALTERACAO" as const,
    validFrom: "2021-01-01", cargo: "Sintético", cbo: "521110", salarioBase: "982341.57",
    unidadeSalario: "MENSAL", jornadaSemanal: jornada as string, divisor: 220,
    motivo: "MOTIVO_SINTETICO_HARDENING_982341",
  }
}

describe.skipIf(!dbUrl).sequential("Pessoas hardening: PostgreSQL real, retry e jornada", () => {
  beforeAll(async () => {
    const url = new URL(dbUrl!)
    if (process.env.DATABASE_URL !== dbUrl || process.env.DIRECT_URL !== dbUrl ||
        url.hostname !== "127.0.0.1" || url.port !== "55439" ||
        url.pathname !== "/omni_pessoas_001a_homolog" || url.username !== "omni_homolog") {
      throw new Error("DESTINO_NAO_ISOLADO")
    }
    process.env.PESSOAS_DP_ENABLED = "on"
    process.env.PESSOAS_CPF_ENC_KEY = randomBytes(32).toString("base64")
    process.env.PESSOAS_CPF_HMAC_KEY = randomBytes(32).toString("base64")
    await prisma.store.create({ data: { id: ator.storeId, name: "Hardening sintético" } })
    const admin = await prisma.adminUser.create({ data: {
      email: chave() + "@example.invalid", password: "synthetic", role: "ADMIN", lojaId: ator.storeId,
    } })
    Object.assign(ator, { userId: admin.id })
    Object.assign(sessao, { userId: ator.userId, storeId: ator.storeId })
    empregadorId = (await criarEmpregador({
      comandoId: chave(), tipoInscricao: "CNPJ", inscricao: "SYNTHETIC-HARDENING",
      nome: "Hardening sintético", validFrom: "2020-01-01", motivo: "Fixture sintética",
      estabelecimento: { tipoInscricao: "CNPJ", inscricao: "SYNTHETIC-HARDENING", nome: "Sede sintética" },
    })).id
  })
  afterEach(() => vi.restoreAllMocks())
  afterAll(async () => { await prisma.$disconnect() })

  it("duas operações independentes concorrentes completam duas mutações e duas auditorias", async () => {
    const antes = await contagens()
    const barreira = barreiraDupla()
    const chaves = [chave(), chave()]
    const tentativas = new Map<string, number>()
    const ids = await Promise.all(chaves.map((id) => comando(id, { id }, async (tx) => {
      const n = (tentativas.get(id) ?? 0) + 1
      tentativas.set(id, n)
      // Mesmo predicado de leitura força a corrida SSI, sem conflito de negócio.
      await tx.dpPessoa.count({ where: { empregadorId } })
      if (n === 1) await barreira()
    })))
    expect(new Set(ids).size).toBe(2)
    expect(await contagens()).toEqual([antes[0] + 2, antes[1], antes[2], antes[3] + 2])
    for (let i = 0; i < 2; i++) {
      expect(tentativas.get(chaves[i])).toBeLessThanOrEqual(3)
      await unico(chaves[i], ids[i])
    }
  })

  it("mesma chave concorrente e replay sequencial têm um único efeito", async () => {
    const id = chave()
    const antes = await contagens()
    const barreira = barreiraDupla()
    let chamadas = 0
    const executar = () => comando(id, { replay: true }, async (tx) => {
      await tx.dpPessoa.count({ where: { empregadorId } })
      if (++chamadas <= 2) await barreira()
    })
    const ids = await Promise.all([executar(), executar()])
    expect(ids[0]).toBe(ids[1])
    expect(await comando(id, { replay: true })).toBe(ids[0])
    expect(await contagens()).toEqual([antes[0] + 1, antes[1], antes[2], antes[3] + 1])
    await unico(id, ids[0])
    await expect(comando(id, { replay: false })).rejects.toMatchObject({ code: "IDEMPOTENCIA_CONFLITO", status: 409 })
  })

  it("P2034 transitório faz replay externo antes de repetir a transação inteira", async () => {
    const antes = await contagens()
    const ordem: string[] = []
    const logs: string[] = []
    for (const metodo of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, metodo).mockImplementation((...args: unknown[]) => { logs.push(args.map(String).join(" ")) })
    }
    const buscar = prisma.dpAuditoria.findUnique.bind(prisma.dpAuditoria)
    vi.spyOn(prisma.dpAuditoria, "findUnique").mockImplementation((...args) => {
      ordem.push("replay externo")
      return buscar(...args)
    })
    const tx = injetar((n) => { ordem.push("transação " + n); return n === 1 ? erroPrisma("P2034") : null })
    const id = chave()
    const payload = { salario: "982341.57", motivo: "MOTIVO_RETRY_SINTETICO_982341", cpf: "52998224725" }
    const resultado = await comando(id, payload)
    for (const sentinela of Object.values(payload)) expect(logs.join("\n")).not.toContain(sentinela)
    expect(tx).toHaveBeenCalledTimes(2)
    expect(ordem).toEqual(["replay externo", "transação 1", "replay externo", "transação 2"])
    expect(await contagens()).toEqual([antes[0] + 1, antes[1], antes[2], antes[3] + 1])
    await unico(id, resultado)
  })

  it("P2034 persistente: exatamente 3 tentativas, 409 e rollback inclusive da auditoria", async () => {
    const antes = await contagens()
    const tx = injetar(() => erroPrisma("P2034"))
    await expect(comando(chave())).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 })
    expect(tx).toHaveBeenCalledTimes(3)
    expect(await contagens()).toEqual(antes)
  })

  it.each([1, 3])("replay materializado após P2034 na tentativa %i retorna a entidade existente", async (ultima) => {
    const antes = await contagens()
    let materializado = ""
    const tx = injetar(() => erroPrisma("P2034"), async (n, callback, opcoes) => {
      // Outra transação só materializa o replay depois do rollback real.
      expect(await contagens()).toEqual(antes)
      if (n === ultima) materializado = await transacaoReal(callback, opcoes)
    })
    const id = chave()
    expect(await comando(id)).toBe(materializado)
    expect(tx).toHaveBeenCalledTimes(ultima)
    expect(await contagens()).toEqual([antes[0] + 1, antes[1], antes[2], antes[3] + 1])
    await unico(id, materializado)
  })

  it.each(["P2034", "P2002"])("%s com replay incompatível mantém IDEMPOTENCIA_CONFLITO sem retry", async (codigo) => {
    const id = chave()
    const antes = await contagens()
    const acao = "HARDENING_PESSOA_CRIAR"
    const tx = injetar(() => erroPrisma(codigo), async () => {
      await transacaoReal(async (t) => {
        const p = await t.dpPessoa.create({ data: { empregadorId } })
        await t.dpAuditoria.create({ data: {
          empregadorId, storeId: ator.storeId, atorId: ator.userId, comandoId: id,
          acao, entidade: "pessoa", entidadeId: p.id, payloadHash: hashComando({ acao, payload: { diferente: true } }),
        } })
        return p.id
      })
    })
    await expect(comando(id)).rejects.toMatchObject({ code: "IDEMPOTENCIA_CONFLITO", status: 409 })
    expect(tx).toHaveBeenCalledTimes(1)
    expect(await contagens()).toEqual([antes[0] + 1, antes[1], antes[2], antes[3] + 1])
  })

  it("P2002 com replay válido retorna uma entidade sem retry adicional", async () => {
    const antes = await contagens()
    let existente = ""
    const tx = injetar(() => erroPrisma("P2002"), async (_, callback, opcoes) => {
      existente = await transacaoReal(callback, opcoes)
    })
    const id = chave()
    expect(await comando(id)).toBe(existente)
    expect(tx).toHaveBeenCalledTimes(1)
    expect(await contagens()).toEqual([antes[0] + 1, antes[1], antes[2], antes[3] + 1])
    await unico(id, existente)
  })

  it("P2002 real sem replay mantém DUPLICIDADE, sem retry e sem efeito parcial", async () => {
    const existente = await prisma.dpPessoa.create({ data: { empregadorId } })
    const antes = await contagens()
    const tx = vi.spyOn(prisma, "$transaction")
    await expect(comando(chave(), {}, async (t) => {
      await t.dpPessoa.create({ data: { empregadorId } })
      await t.dpPessoa.create({ data: { id: existente.id, empregadorId } })
    })).rejects.toMatchObject({ code: "DUPLICIDADE", status: 409 })
    expect(tx).toHaveBeenCalledTimes(1)
    expect(await contagens()).toEqual(antes)
  })

  it.each(["P2028", "GENERICO", "PESSOAS"])("%s não ganha retry e reverte mutação + auditoria", async (codigo) => {
    const antes = await contagens()
    const erro = codigo === "PESSOAS" ? new PessoasError("VERSION_CONFLICT", 409)
      : codigo === "GENERICO" ? new Error("FALHA_SINTETICA") : erroPrisma(codigo)
    const tx = injetar(() => erro)
    await expect(comando(chave())).rejects.toBe(erro)
    expect(tx).toHaveBeenCalledTimes(1)
    expect(await contagens()).toEqual(antes)
  })

  it("replay confere ação e empregador além do payload", async () => {
    const id = chave()
    await comando(id)
    const tx = vi.spyOn(prisma, "$transaction")
    await expect(comando(id, { sintetico: true }, undefined, "OUTRA_ACAO")).rejects.toMatchObject({ code: "IDEMPOTENCIA_CONFLITO" })
    await expect(comando(id, { sintetico: true }, undefined, undefined, "outro-empregador")).rejects.toMatchObject({ code: "IDEMPOTENCIA_CONFLITO" })
    expect(tx).not.toHaveBeenCalled()
  })

  it.each(["0.00", "168.00"])("jornada limite %s é aceita nos dois serviços e preserva DTO canônico", async (jornada) => {
    const f = await criarFuncionario(entradaFuncionario(jornada))
    expect(f.contrato!.jornadaSemanal).toBe(jornada)
    const nova = await criarVersaoContrato(entradaContrato(f, jornada))
    expect(nova.contrato!.jornadaSemanal).toBe(jornada)
    expect(nova.contrato!.versao).toBe(2)
  })

  it("jornada ausente conserva cadastro em rascunho", async () => {
    const input = entradaFuncionario()
    delete input.jornadaSemanal
    const f = await criarFuncionario(input)
    expect(f.status).toBe("RASCUNHO")
    expect(f.contrato!.jornadaSemanal).toBeNull()
    expect(f.pendencias).toContain("jornadaSemanal")
  })

  const invalidas: [string, unknown][] = [
    ["negativa", "-0.01"], ["acima do teto", "168.01"], ["inteiro string", "168"],
    ["precisão extra", "44.001"], ["zero inicial", "044.00"], ["vírgula", "44,00"],
    ["espaços", " 44.00 "], ["quebra de linha final", "44.00\n"], ["number", 168], ["NaN", NaN], ["boolean", true],
    ["objeto", {}], ["array", ["44.00"]],
  ]
  for (const servico of ["criarFuncionario", "criarVersaoContrato"] as const) {
    it.each(invalidas)(`${servico}: jornada %s falha antes da transação, sem PII/constraint/auditoria`, async (_, jornada) => {
      const f = servico === "criarVersaoContrato" ? await criarFuncionario(entradaFuncionario()) : null
      const historico = f ? await prisma.dpContratoVersao.findMany({ where: { empregadorId, vinculoId: f.id } }) : null
      const antes = await contagens()
      const tx = vi.spyOn(prisma, "$transaction")
      const saida: string[] = []
      for (const metodo of ["log", "info", "warn", "error", "debug"] as const) {
        vi.spyOn(console, metodo).mockImplementation((...args: unknown[]) => { saida.push(args.map(String).join(" ")) })
      }
      const resultado = await (f ? criarVersaoContrato(entradaContrato(f, jornada))
        : criarFuncionario(entradaFuncionario(jornada))).catch((erro: unknown) => erro)
      expect(resultado).toBeInstanceOf(PessoasError)
      expect(resultado).toMatchObject({ code: "JORNADA_INVALIDA", status: 400 })
      expect(tx).not.toHaveBeenCalled()
      expect(await contagens()).toEqual(antes)
      if (f) expect(await prisma.dpContratoVersao.findMany({ where: { empregadorId, vinculoId: f.id } })).toEqual(historico)
      const logs = saida.join("\n")
      for (const sentinela of ["982341.57", "MOTIVO_SINTETICO_HARDENING_982341", "constraint", "PrismaClientKnownRequestError"]) {
        expect(logs).not.toContain(sentinela)
      }
    })
  }

  it.each([null, undefined, ""])("versão contratual exige jornada (%s)", async (jornada) => {
    const f = await criarFuncionario(entradaFuncionario())
    const tx = vi.spyOn(prisma, "$transaction")
    await expect(criarVersaoContrato(entradaContrato(f, jornada))).rejects.toMatchObject({ code: "JORNADA_INVALIDA", status: 400 })
    expect(tx).not.toHaveBeenCalled()
  })
})
