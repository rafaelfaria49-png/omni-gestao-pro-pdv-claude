/** G001: somente fixtures sintéticas no cluster local descartável explicitamente nomeado. */
import { modulosSinteticos } from "@/test/gastos/sessao-modulos"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { requireFinanceiroPerfilAccess, revalidateFinanceiroContexto } from "@/lib/gastos/access"
import { guardWhatsAppApiRead, guardWhatsAppApiWrite } from "@/lib/whatsapp/whatsapp-api-guard"
import { GET as contactsGet, POST as contactsPost } from "@/app/api/whatsapp/contacts/route"
import { ASSISTEC_ACTIVE_STORE_COOKIE } from "@/lib/store-defaults"

const config = vi.hoisted(() => {
  const raw = process.env.GASTOS_TEST_DATABASE_URL
  if (raw) {
    const url = new URL(raw)
    if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.port !== "55493"
      || url.pathname !== "/gastos_g001_test" || url.username !== "gastos_g001"
      || (url.search !== "" && url.search !== "?schema=public")) {
      throw new Error("G001 recusa banco fora do cluster descartável identificado.")
    }
  }
  return { url: raw ?? "postgresql://gastos_g001@127.0.0.1:55493/gastos_g001_test" }
})
vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@/generated/prisma")
  return { prisma: new PrismaClient({ datasources: { db: { url: config.url } } }) }
})

const prefix = "g001-fixture-"
const U1 = prefix + "u1", U2 = prefix + "u2", U3 = prefix + "u3", U4 = prefix + "u4"
const L1 = prefix + "L1", L2 = prefix + "L2", L3 = prefix + "L3"
const E1 = prefix + "E1", E2 = prefix + "E2", P1 = prefix + "P1", P2 = prefix + "P2"
const empresa = (perfilId = E1, storeId = L1) => ({ tipo: "EMPRESA", perfilId, storeId })
const pessoal = (perfilId = P1) => ({ tipo: "PESSOAL", perfilId })
const login = (id = U1, stores = [L1, L2], role = "ADMIN", access: "all" | "restricted" = "restricted") => {
  vi.mocked(auth).mockResolvedValue({ user: {
    id, role, storeAccess: access, allowedStoreIds: stores, storeModules: modulosSinteticos(stores), lojaId: L1,
  } } as never)
}
const req = (storeId = L1, source: "header" | "query" | "cookie" = "header") => new Request(
  `http://localhost/api/whatsapp/contacts${source === "query" ? `?storeId=${storeId}` : ""}`,
  { headers: source === "header" ? { "x-assistec-loja-id": storeId }
      : source === "cookie" ? { cookie: `${ASSISTEC_ACTIVE_STORE_COOKIE}=${storeId}` } : {} },
)

describe.skipIf(!process.env.GASTOS_TEST_DATABASE_URL)("G001 PostgreSQL real", () => {
  beforeAll(async () => {
    const [identity] = await prisma.$queryRaw<Array<{ database: string; user: string; port: number; version: string }>>`
      SELECT current_database() AS database, current_user AS user, inet_server_port() AS port, version()`
    expect(identity).toMatchObject({ database: "gastos_g001_test", user: "gastos_g001", port: 55493 })
    expect(identity.version).toContain("PostgreSQL 17.")
    console.info("G001_DATABASE_IDENTITY", JSON.stringify(identity))
    expect(await prisma.store.count()).toBe(0)
    expect(await prisma.adminUser.count()).toBe(0)
    await prisma.store.createMany({ data: [L1, L2, L3].map((id) => ({ id, name: "Fixture G001" })) })
    await prisma.adminUser.createMany({ data: [U1, U2, U3, U4].map((id, i) => ({
      id, email: `${id}@example.invalid`, password: "synthetic-not-a-login", lojaId: L1,
      role: i < 2 ? "ADMIN" : i === 2 ? "GERENTE" : "VENDEDOR",
    })) })
    await prisma.adminUserStore.createMany({ data: [
      { adminUserId: U1, storeId: L1 }, { adminUserId: U1, storeId: L2 },
      ...[U2, U3, U4].map((adminUserId) => ({ adminUserId, storeId: L1 })),
    ] })
    await prisma.financeiroPerfil.createMany({ data: [
      { id: E1, tipo: "EMPRESA", storeId: L1 }, { id: E2, tipo: "EMPRESA", storeId: L2 },
      { id: P1, tipo: "PESSOAL", ownerAdminUserId: U1 }, { id: P2, tipo: "PESSOAL", ownerAdminUserId: U2 },
    ] })
    await prisma.perfilMembro.createMany({ data: [
      ...[U1, U2, U3, U4].map((adminUserId) => ({ perfilId: E1, storeId: L1, adminUserId })),
      { perfilId: E2, storeId: L2, adminUserId: U1 },
    ] })
  }, 30_000)

  beforeEach(() => login())

  afterAll(async () => {
    // Limpeza estrita das fixtures; sem reset, truncate ou acesso a outro banco.
    await prisma.whatsAppContact.deleteMany({ where: { storeId: { in: [L1, L2, L3] } } })
    await prisma.perfilMembro.deleteMany({ where: { adminUserId: { startsWith: prefix } } })
    await prisma.financeiroPerfil.deleteMany({ where: { OR: [
      { storeId: { in: [L1, L2, L3] } }, { ownerAdminUserId: { startsWith: prefix } },
    ] } })
    await prisma.adminUser.deleteMany({ where: { id: { startsWith: prefix } } })
    await prisma.store.deleteMany({ where: { id: { in: [L1, L2, L3] } } })
    await prisma.$disconnect()
  })

  it("isola pessoal de dois ADMIN na mesma loja, sem bypass SUPER_ADMIN", async () => {
    expect((await requireFinanceiroPerfilAccess(pessoal())).ok).toBe(true)
    login(U2, [L1])
    const privateError = await requireFinanceiroPerfilAccess(pessoal())
    expect(privateError).toMatchObject({ ok: false, status: 403 })
    expect(privateError).toEqual(await requireFinanceiroPerfilAccess(pessoal("id-inexistente")))
    expect((await requireFinanceiroPerfilAccess(pessoal(P2))).ok).toBe(true)
    await prisma.adminUser.update({ where: { id: U2 }, data: { role: "SUPER_ADMIN" } })
    try { expect((await requireFinanceiroPerfilAccess(pessoal())).ok).toBe(false) }
    finally { await prisma.adminUser.update({ where: { id: U2 }, data: { role: "ADMIN" } }) }
  })

  it("mesmo pessoal permanece após trocar e perder todas as empresas", async () => {
    const original = await requireFinanceiroPerfilAccess(pessoal())
    for (const stores of [[L1], [L2], []]) {
      login(U1, stores)
      expect(await requireFinanceiroPerfilAccess(pessoal())).toEqual(original)
    }
    await prisma.adminUserStore.deleteMany({ where: { adminUserId: U1 } })
    try {
      expect(await requireFinanceiroPerfilAccess(pessoal())).toEqual(original)
      login(U1)
      expect((await requireFinanceiroPerfilAccess(empresa())).ok).toBe(false)
      login(U2, [L1])
      expect((await requireFinanceiroPerfilAccess(pessoal())).ok).toBe(false)
      expect(await prisma.financeiroPerfil.findUnique({ where: { id: P1 } })).toMatchObject({ ownerAdminUserId: U1, storeId: null })
    } finally {
      await prisma.adminUserStore.createMany({ data: [L1, L2].map((storeId) => ({ adminUserId: U1, storeId })) })
      await prisma.perfilMembro.createMany({ data: [
        { adminUserId: U1, storeId: L1, perfilId: E1 }, { adminUserId: U1, storeId: L2, perfilId: E2 },
      ] })
    }
  })

  it("autoriza duas empresas distintas e nega IDs/loja cruzados e ADMIN sem membro", async () => {
    expect((await requireFinanceiroPerfilAccess(empresa())).ok).toBe(true)
    expect((await requireFinanceiroPerfilAccess(empresa(E2, L2), "edit")).ok).toBe(true)
    expect((await requireFinanceiroPerfilAccess(empresa(E1, L2))).ok).toBe(false)
    expect((await requireFinanceiroPerfilAccess(empresa(P1, L1))).ok).toBe(false)
    login(U2, [L1, L2], "ADMIN", "all")
    expect((await requireFinanceiroPerfilAccess(empresa(E2, L2))).ok).toBe(false)
  })

  it("nega ausência de sessão, usuário inexistente/inativo e papel atual sem Financeiro", async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    expect(await requireFinanceiroPerfilAccess(pessoal())).toMatchObject({ ok: false, status: 401 })
    login("usuario-inexistente")
    expect((await requireFinanceiroPerfilAccess(pessoal())).ok).toBe(false)
    login(U4, [L1], "ADMIN") // JWT antigo não eleva o VENDEDOR atual.
    expect((await requireFinanceiroPerfilAccess(empresa())).ok).toBe(false)
    await prisma.adminUser.update({ where: { id: U1 }, data: { active: false } })
    try {
      login()
      expect((await requireFinanceiroPerfilAccess(pessoal())).ok).toBe(false)
      expect((await requireFinanceiroPerfilAccess(empresa())).ok).toBe(false)
      expect((await guardWhatsAppApiRead(req())).ok).toBe(false)
    } finally { await prisma.adminUser.update({ where: { id: U1 }, data: { active: true } }) }
  })

  it("revalida revogação financeira e não aceita JSON/contexto de outra sessão", async () => {
    const result = await requireFinanceiroPerfilAccess(empresa())
    if (!result.ok) throw new Error("Esperado contexto")
    expect((await revalidateFinanceiroContexto(JSON.parse(JSON.stringify(result.contexto)))).ok).toBe(false)
    login(U2, [L1])
    expect((await revalidateFinanceiroContexto(result.contexto)).ok).toBe(false)
    login()
    await prisma.perfilMembro.update({ where: { perfilId_adminUserId: { perfilId: E1, adminUserId: U1 } }, data: { revogadoEm: new Date() } })
    try { expect((await revalidateFinanceiroContexto(result.contexto)).ok).toBe(false) }
    finally { await prisma.perfilMembro.update({ where: { perfilId_adminUserId: { perfilId: E1, adminUserId: U1 } }, data: { revogadoEm: null } }) }
  })

  it("revoga vínculo atual com JWT antigo; recriar loja não restaura membro financeiro", async () => {
    login(U3, [L1], "GERENTE", "all")
    const result = await requireFinanceiroPerfilAccess(empresa())
    if (!result.ok) throw new Error("Esperado contexto")
    await prisma.adminUserStore.delete({ where: { adminUserId_storeId: { adminUserId: U3, storeId: L1 } } })
    try {
      expect((await revalidateFinanceiroContexto(result.contexto)).ok).toBe(false)
      expect((await guardWhatsAppApiRead(req())).ok).toBe(false)
      expect((await guardWhatsAppApiWrite(req())).ok).toBe(false)
    } finally {
      await prisma.adminUserStore.create({ data: { adminUserId: U3, storeId: L1 } })
      expect((await requireFinanceiroPerfilAccess(empresa())).ok).toBe(false)
      await prisma.perfilMembro.create({ data: { perfilId: E1, adminUserId: U3, storeId: L1 } })
    }
  })

  it("nega perfil inativo e seletores pessoais com loja/dono forjados", async () => {
    for (const input of [{ ...pessoal(), storeId: L1 }, { ...pessoal(), ownerAdminUserId: U1 }, { ...empresa(), userId: U1 }]) {
      expect((await requireFinanceiroPerfilAccess(input)).ok).toBe(false)
    }
    await prisma.financeiroPerfil.update({ where: { id: P1 }, data: { ativo: false } })
    try { expect((await requireFinanceiroPerfilAccess(pessoal())).ok).toBe(false) }
    finally { await prisma.financeiroPerfil.update({ where: { id: P1 }, data: { ativo: true } }) }
  })

  it.each([
    { tipo: "PESSOAL" as const }, { tipo: "EMPRESA" as const },
    { tipo: "PESSOAL" as const, storeId: L3 },
    { tipo: "EMPRESA" as const, ownerAdminUserId: U3 },
    { tipo: "PESSOAL" as const, storeId: L3, ownerAdminUserId: U3 },
    { tipo: "EMPRESA" as const, storeId: L3, ownerAdminUserId: U3 },
  ])("CHECK PostgreSQL recusa composição inválida: %j", async (data) => {
    const invalid = data as { tipo: string; storeId?: string; ownerAdminUserId?: string }
    // SQLSTATE nativo: o Prisma 6.19 não mapeia este CHECK como P2004.
    await expect(prisma.$executeRaw`
      INSERT INTO financeiro_perfis (id, tipo, "storeId", "ownerAdminUserId", "updatedAt")
      VALUES (${prefix + "invalid"}, ${invalid.tipo}::"FinanceiroPerfilTipo",
              ${invalid.storeId ?? null}, ${invalid.ownerAdminUserId ?? null}, CURRENT_TIMESTAMP)`
    ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } })
  })

  it("FKs compostas proíbem membro pessoal, loja cruzada e usuário sem vínculo", async () => {
    for (const data of [
      { perfilId: P1, storeId: L1, adminUserId: U1 },
      { perfilId: E2, storeId: L1, adminUserId: U2 },
      { perfilId: E2, storeId: L2, adminUserId: U2 },
    ]) await expect(prisma.perfilMembro.create({ data })).rejects.toMatchObject({ code: "P2003" })
    await expect(prisma.financeiroPerfil.create({ data: { tipo: "PESSOAL", ownerAdminUserId: "ausente" } })).rejects.toMatchObject({ code: "P2003" })
    await expect(prisma.financeiroPerfil.create({ data: { tipo: "EMPRESA", storeId: "ausente" } })).rejects.toMatchObject({ code: "P2003" })
  })

  it("UNIQUE impede concorrência criando segundo pessoal/empresa e membro duplicado", async () => {
    for (const data of [
      { tipo: "PESSOAL" as const, ownerAdminUserId: U3 }, { tipo: "EMPRESA" as const, storeId: L3 },
    ]) {
      const results = await Promise.allSettled([
        prisma.financeiroPerfil.create({ data }), prisma.financeiroPerfil.create({ data }),
      ])
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
      const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult
      expect(rejected.reason).toMatchObject({ code: "P2002" })
    }
    await expect(prisma.perfilMembro.create({ data: { perfilId: E1, storeId: L1, adminUserId: U1 } })).rejects.toMatchObject({ code: "P2002" })
  })

  it("trigger PostgreSQL impede transferência de dono/loja/tipo", async () => {
    for (const query of [
      prisma.$executeRaw`UPDATE financeiro_perfis SET "ownerAdminUserId" = ${U4} WHERE id = ${P1}`,
      prisma.$executeRaw`UPDATE financeiro_perfis SET "storeId" = ${L3} WHERE id = ${E1}`,
      prisma.$executeRaw`UPDATE financeiro_perfis SET tipo = 'EMPRESA', "storeId" = ${L3}, "ownerAdminUserId" = NULL WHERE id = ${P1}`,
    ]) await expect(query).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } })
    expect(await prisma.financeiroPerfil.findUnique({ where: { id: P1 } })).toMatchObject({ ownerAdminUserId: U1, storeId: null })
  })

  it("RLS não concede leitura a papel público mesmo com SELECT concedido", async () => {
    await prisma.$executeRawUnsafe('CREATE ROLE gastos_g001_anon NOLOGIN')
    try {
      await prisma.$executeRawUnsafe('GRANT SELECT ON financeiro_perfis, financeiro_perfil_membros TO gastos_g001_anon')
      const counts = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE gastos_g001_anon')
        return tx.$queryRaw<Array<{ actor: string; perfis: number; membros: number }>>`
          SELECT current_user AS actor, (SELECT count(*)::int FROM financeiro_perfis) AS perfis,
                 (SELECT count(*)::int FROM financeiro_perfil_membros) AS membros`
      })
      expect(counts).toEqual([{ actor: "gastos_g001_anon", perfis: 0, membros: 0 }])
    } finally {
      await prisma.$executeRawUnsafe('REVOKE SELECT ON financeiro_perfis, financeiro_perfil_membros FROM gastos_g001_anon')
      await prisma.$executeRawUnsafe('DROP ROLE gastos_g001_anon')
    }
  })

  it.each(["header", "query", "cookie"] as const)("WhatsApp/rota real nega loja forjada por %s", async (source) => {
    login(U3, [L1], "GERENTE")
    expect((await guardWhatsAppApiRead(req(L2, source))).ok).toBe(false)
    expect((await contactsGet(req(L2, source))).status).toBe(403)
  })

  it("regressão WhatsApp autorizado usa guard, rota, serviço e PostgreSQL reais sem envio", async () => {
    login(U3, [L1], "GERENTE")
    const response = await contactsPost(new Request("http://localhost/api/whatsapp/contacts", {
      method: "POST", headers: { "x-assistec-loja-id": L1, "content-type": "application/json" },
      body: JSON.stringify({ phoneDigits: "5511999990001", displayName: "Fixture G001" }),
    }))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.contact).toMatchObject({ storeId: L1, displayName: "Fixture G001" })
    const read = await contactsGet(req())
    expect(read.status).toBe(200)
    expect((await read.json()).contacts).toEqual(expect.arrayContaining([expect.objectContaining({ id: payload.contact.id })]))
    expect(await prisma.whatsAppContact.count({ where: { storeId: L2 } })).toBe(0)
  })

  it.each(["ADMIN", "SUPER_ADMIN"] as const)("WhatsApp global %s sem vínculo usa loja real, sem conceder perfil financeiro", async (role) => {
    await prisma.adminUser.update({ where: { id: U2 }, data: { role } })
    await prisma.adminUserStore.deleteMany({ where: { adminUserId: U2 } })
    try {
      login(U2, [], role, "all")
      expect(await prisma.adminUserStore.count({ where: { adminUserId: U2 } })).toBe(0)
      expect(await guardWhatsAppApiRead(req(L1))).toEqual({ ok: true, storeId: L1, userId: U2 })
      expect(await guardWhatsAppApiWrite(req(L2))).toEqual({ ok: true, storeId: L2, userId: U2 })
      expect((await contactsGet(req(L2))).status).toBe(200)
      for (const guard of [guardWhatsAppApiRead, guardWhatsAppApiWrite]) {
        const result = await guard(req("g001-loja-inexistente"))
        if (result.ok) throw new Error("Loja inexistente autorizada")
        expect(result.response.status).toBe(403)
      }
      expect((await requireFinanceiroPerfilAccess(empresa())).ok).toBe(false)
      expect((await requireFinanceiroPerfilAccess(pessoal(P1))).ok).toBe(false)
      expect((await requireFinanceiroPerfilAccess(pessoal(P2))).ok).toBe(true)
      login(U2, [L1], role, "restricted")
      expect((await guardWhatsAppApiRead(req(L2))).ok).toBe(false)
    } finally {
      await prisma.adminUser.update({ where: { id: U2 }, data: { role: "ADMIN" } })
      await prisma.adminUserStore.create({ data: { adminUserId: U2, storeId: L1 } })
      await prisma.perfilMembro.create({ data: { perfilId: E1, adminUserId: U2, storeId: L1 } })
    }
  })

  it("execução das fixtures não cria títulos, movimentos, vendas, OS ou mensagens", async () => {
    expect(await prisma.contaPagarTitulo.count()).toBe(0)
    expect(await prisma.contaReceberTitulo.count()).toBe(0)
    expect(await prisma.movimentacaoFinanceira.count()).toBe(0)
    expect(await prisma.carteiraFinanceira.count()).toBe(0)
    expect(await prisma.venda.count()).toBe(0)
    expect(await prisma.ordemServico.count()).toBe(0)
    expect(await prisma.whatsAppMessage.count()).toBe(0)
  })
})
