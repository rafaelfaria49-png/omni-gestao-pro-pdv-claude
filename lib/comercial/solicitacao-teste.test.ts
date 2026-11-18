import { describe, expect, it } from "vitest"
import {
  LIMITE_GLOBAL_POR_10_MIN, LIMITE_POR_ORIGEM_POR_HORA, atualizarStatusSolicitacao, gerarProtocolo, hashOrigem,
  registrarSolicitacaoTeste, type SolicitacaoDb,
} from "./solicitacao-teste"
import { resolverGestaoLojasConfig, PLANOS_GESTAO_LOJAS } from "./gestao-lojas-oferta"

type Row = Record<string, unknown> & { id: string; protocolo: string; emailAberto: string | null; ipHash: string; createdAt: Date; status: string; historico: unknown }

/** Banco em memória que reproduz os dois UNIQUE da migration (protocolo, emailAberto). */
function fakeDb(opts: { falhar?: boolean } = {}) {
  const rows: Row[] = []
  let seq = 0
  const p2002 = (campo: string) => Object.assign(new Error("Unique"), { code: "P2002", meta: { target: [campo] } })
  const db: SolicitacaoDb = {
    solicitacaoTesteComercial: {
      async count({ where }) {
        if (opts.falhar) throw new Error("db down")
        return rows.filter((r) => r.createdAt >= where.createdAt.gte && (!where.ipHash || r.ipHash === where.ipHash)).length
      },
      async create({ data }) {
        if (rows.some((r) => r.protocolo === data.protocolo)) throw p2002("protocolo")
        if (data.emailAberto && rows.some((r) => r.emailAberto === data.emailAberto)) throw p2002("emailAberto")
        const row = { ...data, id: `id-${++seq}`, createdAt: data.consentimentoEm as Date } as Row
        rows.push(row)
        return { protocolo: row.protocolo }
      },
      async findUnique({ where }) {
        const r = "id" in where ? rows.find((x) => x.id === where.id) : rows.find((x) => x.emailAberto === where.emailAberto)
        return r ? { id: r.id, protocolo: r.protocolo, status: r.status, historico: r.historico } : null
      },
      async update({ where, data }) {
        const r = rows.find((x) => x.id === where.id)!
        Object.assign(r, data)
        return r
      },
    },
  }
  return { db, rows }
}

const valido = { nome: "Ana Souza", nomeLoja: "Variedades Exemplo", email: "Ana@Exemplo.com.br", whatsapp: "(11) 91234-5678", ramo: "variedades", consentimento: true }
const agora = new Date("2026-11-18T12:00:00Z")

describe("registrarSolicitacaoTeste", () => {
  it("grava a solicitação e só então devolve o protocolo", async () => {
    const { db, rows } = fakeDb()
    const r = await registrarSolicitacaoTeste(db, valido, { ipHash: "ip-a", agora })
    expect(r).toMatchObject({ ok: true, repetida: false })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ email: "ana@exemplo.com.br", emailAberto: "ana@exemplo.com.br", whatsapp: "11912345678", status: "recebida", consentimentoVersao: expect.any(String) })
    expect(rows[0].consentimentoEm).toEqual(agora)
    expect(r.ok && r.protocolo).toBe(rows[0].protocolo)
    expect(rows[0].historico).toEqual([{ em: agora.toISOString(), evento: "recebida", por: "visitante" }])
  })

  it("repetir com o mesmo email (qualquer caixa) devolve o MESMO protocolo e não duplica", async () => {
    const { db, rows } = fakeDb()
    const a = await registrarSolicitacaoTeste(db, valido, { ipHash: "ip-a", agora })
    const b = await registrarSolicitacaoTeste(db, { ...valido, email: "ANA@exemplo.com.br", nome: "Outro" }, { ipHash: "ip-b", agora })
    expect(rows).toHaveLength(1)
    expect(b).toEqual({ ok: true, protocolo: a.ok ? a.protocolo : "", repetida: true })
  })

  it("dois envios simultâneos do mesmo email resultam em uma única linha", async () => {
    const { db, rows } = fakeDb()
    const [a, b] = await Promise.all([registrarSolicitacaoTeste(db, valido, { ipHash: "x", agora }), registrarSolicitacaoTeste(db, valido, { ipHash: "x", agora })])
    expect(rows).toHaveLength(1)
    expect(a.ok && b.ok && a.protocolo === b.protocolo).toBe(true)
  })

  it("depois de encerrada, o mesmo email pode pedir de novo (novo protocolo)", async () => {
    const { db, rows } = fakeDb()
    const a = await registrarSolicitacaoTeste(db, valido, { ipHash: "x", agora })
    await atualizarStatusSolicitacao(db, { id: rows[0].id, status: "descartada", por: "plataforma@x" })
    expect(rows[0].emailAberto).toBeNull()
    const b = await registrarSolicitacaoTeste(db, valido, { ipHash: "x", agora })
    expect(rows).toHaveLength(2)
    expect(b.ok && a.ok && b.protocolo !== a.protocolo && !b.repetida).toBe(true)
  })

  it("colisão de protocolo gera outro", async () => {
    const { db, rows } = fakeDb()
    const seq = ["GL-AAAA-AAAA", "GL-AAAA-AAAA", "GL-BBBB-BBBB"]
    await registrarSolicitacaoTeste(db, valido, { ipHash: "x", agora, gerar: () => seq.shift()! })
    const r = await registrarSolicitacaoTeste(db, { ...valido, email: "b@exemplo.com" }, { ipHash: "x", agora, gerar: () => seq.shift()! })
    expect(r).toMatchObject({ ok: true, protocolo: "GL-BBBB-BBBB" })
    expect(rows).toHaveLength(2)
  })

  it("recusa campos inválidos sem gravar nada, com mensagem por campo", async () => {
    const { db, rows } = fakeDb()
    const r = await registrarSolicitacaoTeste(db, { nome: "", nomeLoja: "L", email: "x", whatsapp: "123", ramo: "fiscal", consentimento: "on" }, { ipHash: "x", agora })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.codigo).toBe("INVALIDO")
    if (r.ok === false && r.codigo === "INVALIDO") expect(Object.keys(r.campos).sort()).toEqual(["consentimento", "email", "nome", "nomeLoja", "ramo", "whatsapp"])
    // Toda mensagem chega em português ao visitante (nada de "Invalid literal value…").
    if (r.ok === false && r.codigo === "INVALIDO") {
      expect(r.campos).toEqual({ nome: "Informe seu nome.", nomeLoja: "Informe o nome da loja.", email: "Informe um email válido.", whatsapp: "Informe o WhatsApp com DDD.", ramo: "Escolha o tipo de loja.", consentimento: "É preciso concordar com o uso dos dados para o contato." })
    }
    expect(rows).toHaveLength(0)
  })

  it("campo-isca preenchido (robô) não grava", async () => {
    const { db, rows } = fakeDb()
    const r = await registrarSolicitacaoTeste(db, { ...valido, site: "http://spam" }, { ipHash: "x", agora })
    expect(r).toMatchObject({ ok: false, codigo: "INVALIDO" })
    expect(rows).toHaveLength(0)
  })

  it("campos desconhecidos são recusados (sem gravar status/protocolo vindos do visitante)", async () => {
    const { db, rows } = fakeDb()
    const r = await registrarSolicitacaoTeste(db, { ...valido, status: "provisionada" }, { ipHash: "x", agora })
    expect(r.ok).toBe(false)
    expect(rows).toHaveLength(0)
  })

  it("plano desconhecido é ignorado; plano válido é guardado", async () => {
    const { db, rows } = fakeDb()
    await registrarSolicitacaoTeste(db, { ...valido, planoInteresse: "DIAMANTE" }, { ipHash: "x", agora })
    await registrarSolicitacaoTeste(db, { ...valido, email: "b@x.com", planoInteresse: "comercio" }, { ipHash: "x", agora })
    expect(rows.map((r) => r.planoInteresse)).toEqual([null, "comercio"])
  })

  it(`limita a ${LIMITE_POR_ORIGEM_POR_HORA} pedidos por origem por hora`, async () => {
    const { db, rows } = fakeDb()
    for (let i = 0; i < LIMITE_POR_ORIGEM_POR_HORA; i++) await registrarSolicitacaoTeste(db, { ...valido, email: `p${i}@x.com` }, { ipHash: "mesmo-ip", agora })
    const r = await registrarSolicitacaoTeste(db, { ...valido, email: "extra@x.com" }, { ipHash: "mesmo-ip", agora })
    expect(r).toMatchObject({ ok: false, codigo: "LIMITE" })
    expect(rows).toHaveLength(LIMITE_POR_ORIGEM_POR_HORA)
    const outraOrigem = await registrarSolicitacaoTeste(db, { ...valido, email: "outro@x.com" }, { ipHash: "outro-ip", agora })
    expect(outraOrigem.ok).toBe(true)
    const depois = await registrarSolicitacaoTeste(db, { ...valido, email: "tarde@x.com" }, { ipHash: "mesmo-ip", agora: new Date(agora.getTime() + 61 * 60_000) })
    expect(depois.ok).toBe(true)
  })

  it("limite global contra enxurrada", async () => {
    const { db } = fakeDb()
    for (let i = 0; i < LIMITE_GLOBAL_POR_10_MIN; i++) await registrarSolicitacaoTeste(db, { ...valido, email: `g${i}@x.com` }, { ipHash: `ip-${i}`, agora })
    const r = await registrarSolicitacaoTeste(db, { ...valido, email: "z@x.com" }, { ipHash: "novo", agora })
    expect(r).toMatchObject({ ok: false, codigo: "LIMITE" })
  })

  it("banco indisponível: diz que nada foi salvo (nunca 'recebido')", async () => {
    const { db } = fakeDb({ falhar: true })
    const r = await registrarSolicitacaoTeste(db, valido, { ipHash: "x", agora })
    expect(r).toMatchObject({ ok: false, codigo: "INDISPONIVEL" })
    expect(r.ok === false && "mensagem" in r && r.mensagem).toMatch(/Nada foi salvo/)
  })
})

describe("atualizarStatusSolicitacao", () => {
  it("anexa histórico e não reabre solicitação encerrada", async () => {
    const { db, rows } = fakeDb()
    await registrarSolicitacaoTeste(db, valido, { ipHash: "x", agora })
    expect(await atualizarStatusSolicitacao(db, { id: rows[0].id, status: "em_contato", por: "p@x", agora })).toEqual({ ok: true })
    expect(rows[0].emailAberto).toBe("ana@exemplo.com.br")
    expect(await atualizarStatusSolicitacao(db, { id: rows[0].id, status: "provisionada", por: "p@x", agora })).toEqual({ ok: true })
    expect(rows[0].emailAberto).toBeNull()
    expect((rows[0].historico as unknown[]).map((h) => (h as { evento: string }).evento)).toEqual(["recebida", "em_contato", "provisionada"])
    expect(await atualizarStatusSolicitacao(db, { id: rows[0].id, status: "recebida", por: "p@x" })).toEqual({ ok: false, erro: "Solicitação já encerrada." })
    expect(await atualizarStatusSolicitacao(db, { id: "nao-existe", status: "em_contato", por: "p@x" })).toEqual({ ok: false, erro: "Solicitação não encontrada." })
  })
})

describe("utilitários", () => {
  it("protocolo legível e sem caracteres ambíguos", () => {
    for (let i = 0; i < 50; i++) expect(gerarProtocolo()).toMatch(/^GL-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
  })
  it("hash da origem não contém o IP e depende do segredo", () => {
    const h = hashOrigem("203.0.113.9", "s1")
    expect(h).not.toContain("203.0.113.9")
    expect(h).toHaveLength(64)
    expect(hashOrigem("203.0.113.9", "s2")).not.toBe(h)
  })
})

describe("resolverGestaoLojasConfig (falha fechado)", () => {
  it("sem variáveis: sem preço, sem download, sem contato direto", () => {
    expect(resolverGestaoLojasConfig({})).toEqual({ exibirPrecosPropostos: false, downloadWindowsUrl: null, contatoWhatsapp: null, contatoEmail: null })
  })
  it("preço só com o valor exato 1", () => {
    for (const v of ["true", "yes", "0", " 1"]) expect(resolverGestaoLojasConfig({ GESTAO_LOJAS_EXIBIR_PRECOS_PROPOSTOS: v }).exibirPrecosPropostos).toBe(false)
    expect(resolverGestaoLojasConfig({ GESTAO_LOJAS_EXIBIR_PRECOS_PROPOSTOS: "1" }).exibirPrecosPropostos).toBe(true)
  })
  it("download só com https válido", () => {
    expect(resolverGestaoLojasConfig({ GESTAO_LOJAS_WINDOWS_DOWNLOAD_URL: "http://x/a.exe" }).downloadWindowsUrl).toBeNull()
    expect(resolverGestaoLojasConfig({ GESTAO_LOJAS_WINDOWS_DOWNLOAD_URL: "javascript:alert(1)" }).downloadWindowsUrl).toBeNull()
    expect(resolverGestaoLojasConfig({ GESTAO_LOJAS_WINDOWS_DOWNLOAD_URL: "https://dl.example.com/Setup.exe" }).downloadWindowsUrl).toBe("https://dl.example.com/Setup.exe")
  })
  it("contatos malformados ficam ocultos", () => {
    expect(resolverGestaoLojasConfig({ GESTAO_LOJAS_CONTATO_WHATSAPP: "(00) 00000-0000", GESTAO_LOJAS_CONTATO_EMAIL: "suporte@" })).toMatchObject({ contatoWhatsapp: null, contatoEmail: null })
    expect(resolverGestaoLojasConfig({ GESTAO_LOJAS_CONTATO_WHATSAPP: "+55 11 91234-5678" }).contatoWhatsapp).toBe("5511912345678")
  })
  it("planos propostos: valores da decisão do proprietário, em centavos", () => {
    expect(PLANOS_GESTAO_LOJAS.map((p) => [p.id, p.precoMensalCentavos, p.operadoresPropostos])).toEqual([["essencial", 3990, 1], ["comercio", 6990, 2], ["comercio-plus", 9990, 3]])
  })
})
