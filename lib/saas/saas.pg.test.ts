// OMNI-SAAS-001A — integração em PostgreSQL REAL e descartável.
// Sem ambiente = BLOQUEIO_EXPLICITO_PG (nunca skip). Prepare com scripts/saas/prepare-pg.mjs
// (baseline + dados legados + migration real + drift zero).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PrismaClient } from "@/generated/prisma"
import { criarAdaptadorRegistro, criarAdaptadorTeste } from "@/lib/saas/email/registro"
import type { AdaptadorEmail } from "@/lib/saas/email/tipos"
import { calcularEntitlementsSombra, type EntitlementDb } from "@/lib/saas/entitlement-sombra"
import {
  concluirTentativa,
  encerrarResultadosDesconhecidos,
  enfileirarNotificacao,
  processarOutbox,
  reivindicarLote,
} from "@/lib/saas/outbox"
import { registrarAuditoriaPlataforma } from "@/lib/saas/platform-audit"
import { condicoesContratadas, PLANO_VENDAS_E_ESTOQUE } from "@/lib/saas/planos"

function exigirBancoLocal(): string {
  const url = (process.env.SAAS_TEST_DATABASE_URL ?? "").trim()
  if (!url) throw new Error("BLOQUEIO_EXPLICITO_PG: defina SAAS_TEST_DATABASE_URL (PostgreSQL descartável preparado).")
  if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname)) throw new Error("BLOQUEIO_EXPLICITO_PG: somente loopback.")
  for (const k of ["DATABASE_URL", "DIRECT_URL"]) {
    if ((process.env[k] ?? "").trim() !== url) throw new Error(`BLOQUEIO_EXPLICITO_PG: ${k} deve ser igual a SAAS_TEST_DATABASE_URL.`)
  }
  return url
}

const url = exigirBancoLocal()
const consultas: string[] = []
const db = new PrismaClient({ datasourceUrl: url, log: [{ emit: "event", level: "query" }] })
db.$on("query", (e) => consultas.push(e.query))
// Segundo cliente = segundo pool de conexões: concorrência real entre "instâncias".
const db2 = new PrismaClient({ datasourceUrl: url })
const LEGADAS = ["loja-1", "loja-2", "cliente-00000000-0000-4000-8000-000000000001"]
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const silencioso = criarAdaptadorRegistro(() => {})

beforeAll(async () => {
  // Pré-condição do preparador: legado semeado, nenhuma organização.
  expect(await db.store.count({ where: { id: { in: LEGADAS } } })).toBe(3)
  expect(await db.organization.count()).toBe(0)
})
afterAll(async () => {
  await db.$disconnect()
  await db2.$disconnect()
})
beforeEach(async () => {
  await db.notificationOutbox.deleteMany({})
})

async function criarOrganizacao(id: string, sub: Record<string, unknown>) {
  await db.organization.create({ data: { id, nome: `Org ${id}`, contatoEmail: `${id}@teste.invalid`, contatoWhatsapp: "5511999990000", origem: "assistido" } })
  await db.subscription.create({ data: { organizationId: id, status: "active", ...condicoesContratadas(PLANO_VENDAS_E_ESTOQUE), ...sub } })
  await db.store.create({ data: { id: `${id}-loja`, name: `Loja ${id}`, organizationId: id } })
}

describe("lojas legadas e isolamento (entitlement sombra com banco real)", () => {
  it("todas as lojas existentes (organizationId NULL) resolvem legado com UMA consulta e claim vazio", async () => {
    const todas = (await db.store.findMany({ where: { organizationId: null }, select: { id: true } })).map((s) => s.id)
    expect(todas).toEqual(expect.arrayContaining(LEGADAS))
    consultas.length = 0
    const claims = await calcularEntitlementsSombra(db as unknown as EntitlementDb, todas)
    expect(consultas).toHaveLength(1)
    expect(claims).toEqual({})
  })

  it("organizações distintas não se contaminam; custo constante (3 consultas) com N lojas", async () => {
    await criarOrganizacao("org-iso-a", { status: "trialing", trialStartedAt: new Date("2020-01-01T00:00:00Z"), trialEndsAt: new Date("2020-01-08T00:00:00Z") })
    await criarOrganizacao("org-iso-b", { status: "active" })
    consultas.length = 0
    const claims = await calcularEntitlementsSombra(db as unknown as EntitlementDb, ["org-iso-a-loja", "org-iso-b-loja", "loja-1"], { log: () => {} })
    expect(consultas.length).toBeLessThanOrEqual(3)
    expect(claims).toEqual({
      "org-iso-a-loja": { modo: "limitado", motivo: "teste_vencido", limitedSince: "2020-01-08T00:00:00.000Z" },
      "org-iso-b-loja": { modo: "pleno", motivo: "ok" },
    })
    // Nenhum dado das lojas legadas foi alterado pela leitura.
    expect(await db.store.count({ where: { id: { in: LEGADAS }, organizationId: null } })).toBe(3)
  })

  it("trocar o administrador não perde a assinatura (ela é da organização)", async () => {
    await criarOrganizacao("org-adm", { status: "active" })
    await db.adminUser.createMany({ data: [
      { id: "adm-antigo", email: "antigo@teste.invalid", password: "x", role: "ADMIN", lojaId: "org-adm-loja" },
      { id: "adm-novo", email: "novo@teste.invalid", password: "x", role: "ADMIN", lojaId: "org-adm-loja" },
    ] })
    await db.organizationMember.create({ data: { organizationId: "org-adm", adminUserId: "adm-antigo", papel: "OWNER" } })
    const antes = await db.subscription.findUniqueOrThrow({ where: { organizationId: "org-adm" } })
    await db.$transaction([
      db.organizationMember.create({ data: { organizationId: "org-adm", adminUserId: "adm-novo", papel: "OWNER" } }),
      db.adminUser.delete({ where: { id: "adm-antigo" } }),
    ])
    const depois = await db.subscription.findUniqueOrThrow({ where: { organizationId: "org-adm" } })
    expect(depois).toEqual(antes)
    expect(await db.organizationMember.findMany({ where: { organizationId: "org-adm" }, select: { adminUserId: true, papel: true } })).toEqual([{ adminUserId: "adm-novo", papel: "OWNER" }])
    expect((await calcularEntitlementsSombra(db as unknown as EntitlementDb, ["org-adm-loja"]))?.["org-adm-loja"]).toEqual({ modo: "pleno", motivo: "ok" })
  })

  it("integridade: status inválido, suspensão sem motivo e organização duplicada na assinatura são recusados", async () => {
    await db.organization.create({ data: { id: "org-chk", nome: "Chk", contatoEmail: "c@teste.invalid", contatoWhatsapp: "1", origem: "assistido" } })
    const base = { organizationId: "org-chk", ...condicoesContratadas(PLANO_VENDAS_E_ESTOQUE) }
    await expect(db.subscription.create({ data: { ...base, status: "ativo" } })).rejects.toThrow()
    await expect(db.subscription.create({ data: { ...base, status: "suspended", suspendedAt: new Date() } })).rejects.toThrow()
    await expect(db.subscription.create({ data: { ...base, status: "trialing" } })).rejects.toThrow()
    await expect(db.subscription.create({ data: { ...base, status: "active", suspendedMode: "bloqueado" } })).rejects.toThrow()
    await db.subscription.create({ data: { ...base, status: "active" } })
    await expect(db.subscription.create({ data: { ...base, status: "active" } })).rejects.toThrow()
    await expect(db.organization.create({ data: { id: "org-x", nome: " ", contatoEmail: "x", contatoWhatsapp: "1", origem: "assistido" } })).rejects.toThrow()
    await expect(db.organization.create({ data: { id: "org-y", nome: "Y", contatoEmail: "x", contatoWhatsapp: "1", origem: "pirata" } })).rejects.toThrow()
  })
})

describe("registros só-inserção", () => {
  it("SubscriptionHistory não aceita UPDATE nem DELETE", async () => {
    await criarOrganizacao("org-hist", { status: "active" })
    const sub = await db.subscription.findUniqueOrThrow({ where: { organizationId: "org-hist" } })
    const h = await db.subscriptionHistory.create({ data: { subscriptionId: sub.id, de: null, para: "active", motivo: "teste", ator: "sistema", versao: 0 } })
    await expect(db.subscriptionHistory.update({ where: { id: h.id }, data: { motivo: "adulterado" } })).rejects.toThrow(/SAAS_REGISTRO_IMUTAVEL/)
    await expect(db.subscriptionHistory.delete({ where: { id: h.id } })).rejects.toThrow(/SAAS_REGISTRO_IMUTAVEL/)
    await expect(db.$executeRawUnsafe(`TRUNCATE subscription_history`)).rejects.toThrow(/SAAS_REGISTRO_IMUTAVEL/)
    expect(await db.subscriptionHistory.count({ where: { id: h.id, motivo: "teste" } })).toBe(1)
  })
  it("PlatformAuditLog grava com operador e motivo; não aceita UPDATE/DELETE", async () => {
    const { id } = await registrarAuditoriaPlataforma(db, { atorId: "plat-1", acao: "teste.estender", motivo: "Pedido do cliente por email", organizationId: "org-hist", antes: { trialEndsAt: "a", tokenHash: "x" }, depois: { trialEndsAt: "b" } })
    const linha = await db.platformAuditLog.findUniqueOrThrow({ where: { id } })
    expect(linha).toMatchObject({ atorId: "plat-1", acao: "teste.estender", antes: { trialEndsAt: "a" }, depois: { trialEndsAt: "b" } })
    await expect(db.platformAuditLog.update({ where: { id }, data: { motivo: "apagar rastro" } })).rejects.toThrow(/SAAS_REGISTRO_IMUTAVEL/)
    await expect(db.platformAuditLog.deleteMany({})).rejects.toThrow(/SAAS_REGISTRO_IMUTAVEL/)
    await expect(db.platformAuditLog.create({ data: { atorId: "p", acao: "x", motivo: "no" } })).rejects.toThrow()
  })
})

describe("outbox — deduplicação", () => {
  it("20 enfileiramentos simultâneos da mesma chave (2 pools) → 1 linha, 1 criada", async () => {
    const n = { dedupeKey: "dup:1", canal: "email" as const, modelo: "saas.teste_infra", destino: "qa@teste.invalid" }
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => enfileirarNotificacao(i % 2 ? db : db2, n)))
    expect(rs.filter((r) => r.criada)).toHaveLength(1)
    expect(new Set(rs.map((r) => r.id)).size).toBe(1)
    expect(await db.notificationOutbox.count({ where: { dedupeKey: "dup:1" } })).toBe(1)
  })
  it("reenfileirar não altera a linha existente", async () => {
    const n = { dedupeKey: "dup:2", canal: "email" as const, modelo: "saas.teste_infra", destino: "a@teste.invalid" }
    await enfileirarNotificacao(db, n)
    await enfileirarNotificacao(db, { ...n, destino: "outro@teste.invalid" })
    expect((await db.notificationOutbox.findUniqueOrThrow({ where: { dedupeKey: "dup:2" } })).destino).toBe("a@teste.invalid")
  })
})

describe("outbox — concorrência", () => {
  async function enfileirarN(n: number, prefixo: string) {
    for (let i = 0; i < n; i++) await enfileirarNotificacao(db, { dedupeKey: `${prefixo}:${i}`, canal: "email", modelo: "saas.teste_infra", destino: `qa${i}@teste.invalid` })
  }

  it("dois workers reivindicando ao mesmo tempo nunca recebem a mesma linha (30 rodadas)", async () => {
    await enfileirarN(60, "conc")
    const vistos = new Map<string, string>()
    for (let rodada = 0; rodada < 30; rodada++) {
      const [a, b] = await Promise.all([
        reivindicarLote(db, { workerId: "A", limite: 3 }),
        reivindicarLote(db2, { workerId: "B", limite: 3 }),
      ])
      for (const [w, itens] of [["A", a], ["B", b]] as const) {
        for (const it of itens) {
          expect(vistos.has(it.id), `linha ${it.id} entregue a dois workers`).toBe(false)
          vistos.set(it.id, w)
        }
      }
      if (a.length + b.length === 0) break
    }
    expect(vistos.size).toBe(60)
    expect(await db.notificationOutbox.count({ where: { status: "enviando", tentativas: 1 } })).toBe(60)
  })

  it("dois ciclos completos em paralelo: cada notificação enviada exatamente uma vez", async () => {
    await enfileirarN(40, "par")
    const contagem = new Map<string, number>()
    const lento: AdaptadorEmail = {
      nome: "lento",
      async enviar(m) {
        contagem.set(m.idempotencyKey, (contagem.get(m.idempotencyKey) ?? 0) + 1)
        await sleep(5)
        return { ok: true, provedor: "teste", mensagemId: m.idempotencyKey, enviadoDeVerdade: true }
      },
    }
    const [r1, r2] = await Promise.all([
      processarOutbox(db, lento, { workerId: "W1", lote: 4, limiteTotal: 100 }),
      processarOutbox(db2, lento, { workerId: "W2", lote: 4, limiteTotal: 100 }),
    ])
    expect(r1.enviadas + r2.enviadas).toBe(40)
    expect(r1.enviadas).toBeGreaterThan(0)
    expect(r2.enviadas).toBeGreaterThan(0)
    expect([...contagem.values()].every((n) => n === 1)).toBe(true)
    expect(contagem.size).toBe(40)
    expect(await db.notificationOutbox.count({ where: { status: "enviado", enviadoEm: { not: null } } })).toBe(40)
  })
})

describe("outbox — retry, falha permanente, recuperação", () => {
  const nova = (k: string) => enfileirarNotificacao(db, { dedupeKey: k, canal: "email", modelo: "saas.teste_infra", destino: "qa@teste.invalid" })
  const liberarAgora = (id: string) => db.$executeRaw`UPDATE notification_outbox SET "proximaTentativaEm" = now() WHERE id = ${id}`

  it("falha transitória reagenda com espera crescente e, na 5ª, vira falhou", async () => {
    const { id } = await nova("retry:1")
    const t = criarAdaptadorTeste(Array.from({ length: 5 }, () => ({ ok: false as const, tipo: "transitorio" as const, codigo: "http_503" })))
    const esperas: number[] = []
    for (let i = 1; i <= 5; i++) {
      const r = await processarOutbox(db, t.adaptador, { workerId: `R${i}` })
      const linha = await db.notificationOutbox.findUniqueOrThrow({ where: { id } })
      expect(linha.tentativas).toBe(i)
      if (i < 5) {
        expect(r.reagendadas).toBe(1)
        expect(linha.status).toBe("pendente")
        esperas.push(Math.round((linha.proximaTentativaEm.getTime() - linha.ultimaTentativaEm!.getTime()) / 1000))
        // Antes da hora não é reivindicada.
        expect((await processarOutbox(db, t.adaptador, { workerId: "cedo" })).reivindicadas).toBe(0)
        await liberarAgora(id)
      } else {
        expect(r.falhas).toBe(1)
        expect(linha).toMatchObject({ status: "falhou", ultimoErro: "http_503", ultimoErroTipo: "transitorio", lockedBy: null })
      }
    }
    expect(esperas).toEqual([60, 120, 240, 480])
    // Mesma chave de idempotência em todas as tentativas.
    expect(new Set(t.enviados.map((m) => m.idempotencyKey))).toEqual(new Set([`outbox:${id}`]))
    const hist = (await db.notificationOutbox.findUniqueOrThrow({ where: { id } })).historico as Array<{ evento: string }>
    expect(hist.map((e) => e.evento)).toEqual(["reagendado", "reagendado", "reagendado", "reagendado", "falhou"])
  })

  it("falha permanente vai direto para falhou", async () => {
    const { id } = await nova("perm:1")
    const t = criarAdaptadorTeste([{ ok: false, tipo: "permanente", codigo: "http_422" }])
    expect((await processarOutbox(db, t.adaptador)).falhas).toBe(1)
    expect(await db.notificationOutbox.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "falhou", tentativas: 1, ultimoErroTipo: "permanente" })
  })

  it("modo registro: status registrado, nunca enviado", async () => {
    const { id } = await nova("reg:1")
    expect((await processarOutbox(db, silencioso)).registradas).toBe(1)
    expect(await db.notificationOutbox.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "registrado", provedor: "registro", enviadoEm: null })
  })

  it("worker interrompido: lease vence, outro recupera; o primeiro não sobrescreve (fencing)", async () => {
    const { id } = await nova("lease:1")
    const [itemA] = await reivindicarLote(db, { workerId: "morto", limite: 1, leaseMs: 50 })
    expect(itemA.id).toBe(id)
    expect(await reivindicarLote(db2, { workerId: "vivo", limite: 1 })).toHaveLength(0)
    await sleep(120)
    const [itemB] = await reivindicarLote(db2, { workerId: "vivo", limite: 1 })
    expect(itemB).toMatchObject({ id, tentativas: 2 })
    expect(await concluirTentativa(db2, itemB, "vivo", { ok: true, provedor: "teste", mensagemId: "m1", enviadoDeVerdade: true })).toBe("enviado")
    expect(await concluirTentativa(db, itemA, "morto", { ok: false, tipo: "permanente", codigo: "x" })).toBe("lease_perdido")
    const linha = await db.notificationOutbox.findUniqueOrThrow({ where: { id } })
    expect(linha).toMatchObject({ status: "enviado", provedorMensagemId: "m1" })
    expect((linha.historico as Array<{ evento: string }>).map((e) => e.evento)).toEqual(["lease_expirado", "enviado"])
  })

  it("resultado desconhecido fora da janela de idempotência não é reenviado: vira falhou", async () => {
    const { id } = await nova("unk:1")
    await reivindicarLote(db, { workerId: "x", limite: 1, leaseMs: 10 })
    await db.$executeRaw`UPDATE notification_outbox SET "primeiraTentativaEm" = now() - interval '24 hours', "lockedUntil" = now() - interval '1 minute' WHERE id = ${id}`
    expect(await reivindicarLote(db, { workerId: "y", limite: 10 })).toHaveLength(0)
    expect(await encerrarResultadosDesconhecidos(db)).toBe(1)
    expect(await db.notificationOutbox.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "falhou", ultimoErroTipo: "desconhecido", ultimoErro: "resultado_desconhecido", lockedBy: null })
  })

  it("lote e total são limitados", async () => {
    for (let i = 0; i < 12; i++) await nova(`lim:${i}`)
    const r = await processarOutbox(db, silencioso, { lote: 5, limiteTotal: 7 })
    expect(r.reivindicadas).toBe(7)
    expect(await db.notificationOutbox.count({ where: { status: "pendente" } })).toBe(5)
  })

  it("prazo esgotado: itens reivindicados e não tentados voltam a pendente sem gastar tentativa", async () => {
    for (let i = 0; i < 3; i++) await nova(`prazo:${i}`)
    let t = 0
    // Relógio de passos: prazo = 3; o laço reivindica (t=2) e o 1º item já encontra o prazo esgotado (t=3).
    const r = await processarOutbox(db, silencioso, { prazoMs: 2, relogioMs: () => (t += 1) })
    expect(r.interrompidoPorPrazo).toBe(true)
    expect(r.reivindicadas).toBe(3)
    expect(r.devolvidosSemTentativa).toBe(3)
    const pendentes = await db.notificationOutbox.findMany({ where: { status: "pendente" } })
    expect(pendentes).toHaveLength(r.devolvidosSemTentativa)
    for (const p of pendentes) expect(p).toMatchObject({ tentativas: 0, primeiraTentativaEm: null, lockedBy: null })
  })

  it("resultado desconhecido reagendado fora da janela de idempotência NÃO é reenviado (vira falhou)", async () => {
    const { id } = await nova("unk:2")
    const t = criarAdaptadorTeste([{ ok: false, tipo: "desconhecido", codigo: "sem_resposta" }])
    expect((await processarOutbox(db, t.adaptador, { workerId: "u1" })).reagendadas).toBe(1)
    expect(await db.notificationOutbox.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "pendente", ultimoErroTipo: "desconhecido" })
    // Simula o cron do dia seguinte: hora de tentar de novo, mas a 1ª tentativa foi há 24 h.
    await db.$executeRaw`UPDATE notification_outbox SET "proximaTentativaEm" = now(), "primeiraTentativaEm" = now() - interval '24 hours' WHERE id = ${id}`
    const r = await processarOutbox(db, t.adaptador, { workerId: "u2" })
    expect(r.reivindicadas).toBe(0)
    expect(r.resultadosDesconhecidosEncerrados).toBe(1)
    expect(t.enviados).toHaveLength(1)
    expect(await db.notificationOutbox.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "falhou", ultimoErro: "resultado_desconhecido" })
  })

  it("resultado desconhecido reagendado DENTRO da janela repete com a mesma chave", async () => {
    const { id } = await nova("unk:3")
    const t = criarAdaptadorTeste([{ ok: false, tipo: "desconhecido", codigo: "sem_resposta" }])
    await processarOutbox(db, t.adaptador, { workerId: "d1" })
    await liberarAgora(id)
    expect((await processarOutbox(db, t.adaptador, { workerId: "d2" })).registradas).toBe(1)
    expect(t.enviados.map((m) => m.idempotencyKey)).toEqual([`outbox:${id}`, `outbox:${id}`])
    expect((await db.notificationOutbox.findUniqueOrThrow({ where: { id } })).tentativas).toBe(2)
  })

  it("dados sensíveis são recusados antes de gravar", async () => {
    await expect(enfileirarNotificacao(db, { dedupeKey: "s:1", canal: "email", modelo: "saas.teste_infra", destino: "a@teste.invalid", dados: { token: "t" } })).rejects.toThrow("OUTBOX_DADOS_SENSIVEIS")
    expect(await db.notificationOutbox.count({ where: { dedupeKey: "s:1" } })).toBe(0)
  })
})
