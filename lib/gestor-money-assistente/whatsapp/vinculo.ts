/**
 * G007 — vínculo seguro telefone↔usuário no canal de GESTÃO (assistente Gestor Money).
 *
 * Prova de dupla posse, sem confiar só no número do remetente:
 * 1. A CONTA: o código de 6 dígitos é gerado e exibido somente na sessão web autenticada do usuário
 *    (`iniciarPareamento`, chamado por Server Action com sessão), junto com o aceite do consentimento.
 * 2. O TELEFONE: o mesmo código precisa chegar, pelo WhatsApp, do número declarado, ao número de gestão
 *    (remetente autenticado pela Meta + HMAC do webhook + canal GESTAO vigente).
 * Depois do vínculo, cada mensagem ainda passa por: canal vigente, vínculo ATIVO na versão esperada,
 * usuário ativo e autorização G001 lida do banco a cada perfil/ato.
 *
 * Código só como hash (sha256 com sal por desafio), expira em 10 min, uso único (CONFIRMADO é terminal),
 * 5 tentativas por desafio, 5 desafios por usuário por hora. Revogação é definitiva; novo vínculo = novo
 * pareamento. Nenhum perfil/loja é criado aqui: o vínculo é só identidade; escopo vem das concessões G001.
 */
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto"
import type { Prisma, PrismaClient } from "@/generated/prisma"

export type GmDb = PrismaClient
type Tx = Prisma.TransactionClient

export const CONSENTIMENTO_VERSAO_ATUAL = "gm-whatsapp-consentimento-v1"
export const VALIDADE_DESAFIO_MS = 10 * 60_000
export const LIMITE_TENTATIVAS = 5
export const LIMITE_DESAFIOS_HORA = 5
const E164 = /^\+[1-9][0-9]{7,14}$/

export class VinculoError extends Error {
  constructor(readonly codigo: "TELEFONE_INVALIDO" | "CONSENTIMENTO_AUSENTE" | "LIMITE_DESAFIOS" | "USUARIO_INVALIDO" | "SEM_VINCULO") {
    super(codigo); this.name = "VinculoError"
  }
}

export function mascararTelefone(e164: string): string {
  return "+" + "*".repeat(Math.max(4, Math.min(11, e164.length - 5))) + e164.slice(-4)
}

function hashCodigo(salt: string, codigo: string) {
  return createHash("sha256").update(`${salt}:${codigo}`).digest("hex")
}

async function evento(tx: Tx, e: { tipo: string; adminUserId?: string | null; vinculoId?: string | null; desafioId?: string | null; telefone?: string | null }) {
  await tx.gmAssistEvento.create({ data: { id: randomUUID(), tipo: e.tipo, adminUserId: e.adminUserId ?? null, vinculoId: e.vinculoId ?? null,
    desafioId: e.desafioId ?? null, telefoneMascarado: e.telefone ? mascararTelefone(e.telefone) : null } })
}

/**
 * Inicia o pareamento para o usuário AUTENTICADO (userId vem da sessão, nunca do formulário).
 * Devolve o código em claro UMA vez, para exibir na tela; o banco guarda apenas o hash.
 */
export async function iniciarPareamento(db: GmDb, input: { userId: string; telefoneE164: string; consentimentoVersao: string }) {
  const telefone = String(input.telefoneE164 ?? "").trim()
  if (!E164.test(telefone)) throw new VinculoError("TELEFONE_INVALIDO")
  if (input.consentimentoVersao !== CONSENTIMENTO_VERSAO_ATUAL) throw new VinculoError("CONSENTIMENTO_AUSENTE")
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0")
  const salt = randomBytes(16).toString("hex")
  try {
    return await db.$transaction(async tx => {
      // Serializa o pareamento do mesmo usuário (contagem de limite + troca do desafio pendente).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"gm-assist-desafio:" + input.userId}))`
      const [agora] = await tx.$queryRaw<Array<{ agora: Date }>>`SELECT clock_timestamp() AS agora`
      const recentes = await tx.gmAssistDesafio.count({ where: { adminUserId: input.userId,
        criadoEm: { gt: new Date(agora.agora.getTime() - 3_600_000) } } })
      if (recentes >= LIMITE_DESAFIOS_HORA) throw new VinculoError("LIMITE_DESAFIOS")
      const pendentes = await tx.gmAssistDesafio.findMany({ where: { pendenteUsuario: input.userId }, select: { id: true } })
      for (const p of pendentes) {
        await tx.gmAssistDesafio.update({ where: { id: p.id }, data: { estado: "CANCELADO", pendenteUsuario: null, decididoEm: agora.agora } })
        await evento(tx, { tipo: "DESAFIO_SUBSTITUIDO", adminUserId: input.userId, desafioId: p.id })
      }
      const id = randomUUID()
      const expiraEm = new Date(agora.agora.getTime() + VALIDADE_DESAFIO_MS)
      await tx.gmAssistDesafio.create({ data: { id, adminUserId: input.userId, telefoneE164: telefone, codigoSalt: salt,
        codigoHash: hashCodigo(salt, codigo), pendenteUsuario: input.userId, consentimentoVersao: input.consentimentoVersao,
        limiteTentativas: LIMITE_TENTATIVAS, expiraEm, criadoEm: agora.agora } })
      await evento(tx, { tipo: "DESAFIO_CRIADO", adminUserId: input.userId, desafioId: id, telefone })
      return { desafioId: id, codigo, expiraEm, telefoneMascarado: mascararTelefone(telefone) }
    })
  } catch (e) {
    if (e instanceof VinculoError) throw e
    if (String((e as Error)?.message ?? "").includes("GM_ASSIST desafio invalido")) throw new VinculoError("USUARIO_INVALIDO")
    throw e
  }
}

export type ResultadoPareamento =
  | { tipo: "NAO_E_CODIGO" }
  | { tipo: "SEM_DESAFIO" }
  | { tipo: "EXPIRADO" }
  | { tipo: "CODIGO_INVALIDO"; restantes: number }
  | { tipo: "BLOQUEADO" }
  | { tipo: "TELEFONE_JA_VINCULADO" }
  | { tipo: "VINCULADO"; vinculoId: string; userId: string }

/** Só um texto que é exatamente um código (com ou sem a palavra "código") entra no pareamento. */
export function extrairCodigo(texto: string): string | null {
  const m = /^\s*(?:c[oó]digo\s*:?\s*)?(\d{3})[\s.-]?(\d{3})\s*$/i.exec(String(texto ?? ""))
  return m ? m[1] + m[2] : null
}

/**
 * Mensagem recebida no canal de GESTÃO de um remetente (autenticado pela Meta). Se o texto for um código,
 * confere contra os desafios PENDENTES daquele telefone. Tudo numa transação, sob lock do telefone.
 */
export async function confirmarPareamentoPorMensagem(db: GmDb, input: { remetenteE164: string; texto: string }): Promise<ResultadoPareamento> {
  const codigo = extrairCodigo(input.texto)
  if (!codigo) return { tipo: "NAO_E_CODIGO" }
  if (!E164.test(input.remetenteE164)) return { tipo: "SEM_DESAFIO" }
  const telefone = input.remetenteE164
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"gm-assist-telefone:" + telefone}))`
    const [{ agora }] = await tx.$queryRaw<Array<{ agora: Date }>>`SELECT clock_timestamp() AS agora`
    const pendentes = await tx.$queryRaw<Array<{ id: string; adminUserId: string; codigoSalt: string; codigoHash: string;
      tentativas: number; limiteTentativas: number; expiraEm: Date; consentimentoVersao: string }>>`
      SELECT id,"adminUserId","codigoSalt","codigoHash",tentativas,"limiteTentativas","expiraEm","consentimentoVersao"
      FROM gm_assist_desafios WHERE "telefoneE164"=${telefone} AND estado='PENDENTE' ORDER BY "criadoEm" FOR UPDATE`
    if (!pendentes.length) {
      await evento(tx, { tipo: "CODIGO_SEM_DESAFIO", telefone })
      return { tipo: "SEM_DESAFIO" as const }
    }
    const vigentes = []
    let expirou = false
    for (const d of pendentes) {
      if (d.expiraEm.getTime() <= agora.getTime()) {
        expirou = true
        await tx.gmAssistDesafio.update({ where: { id: d.id }, data: { estado: "EXPIRADO", pendenteUsuario: null, decididoEm: agora } })
        await evento(tx, { tipo: "DESAFIO_EXPIRADO", adminUserId: d.adminUserId, desafioId: d.id, telefone })
      } else vigentes.push(d)
    }
    if (!vigentes.length) return expirou ? { tipo: "EXPIRADO" as const } : { tipo: "SEM_DESAFIO" as const }
    const certo = vigentes.find(d => timingSafeEqual(Buffer.from(hashCodigo(d.codigoSalt, codigo), "hex"), Buffer.from(d.codigoHash, "hex")))
    if (!certo) {
      let menorRestante = Infinity
      for (const d of vigentes) {
        const tentativas = d.tentativas + 1
        const bloqueia = tentativas >= d.limiteTentativas
        await tx.gmAssistDesafio.update({ where: { id: d.id }, data: bloqueia
          ? { tentativas, estado: "BLOQUEADO", pendenteUsuario: null, decididoEm: agora } : { tentativas } })
        await evento(tx, { tipo: bloqueia ? "DESAFIO_BLOQUEADO" : "CODIGO_INVALIDO", adminUserId: d.adminUserId, desafioId: d.id, telefone })
        menorRestante = Math.min(menorRestante, d.limiteTentativas - tentativas)
      }
      return menorRestante <= 0 ? { tipo: "BLOQUEADO" as const } : { tipo: "CODIGO_INVALIDO" as const, restantes: menorRestante }
    }
    // Telefone já ativo para OUTRA conta: não reassocia em silêncio. O titular revoga lá primeiro.
    const ativoTelefone = await tx.gmAssistVinculo.findUnique({ where: { ativoTelefone: telefone } })
    if (ativoTelefone && ativoTelefone.adminUserId !== certo.adminUserId) {
      await tx.gmAssistDesafio.update({ where: { id: certo.id }, data: { estado: "CANCELADO", pendenteUsuario: null, decididoEm: agora } })
      await evento(tx, { tipo: "REASSOCIACAO_RECUSADA", adminUserId: certo.adminUserId, desafioId: certo.id, telefone })
      return { tipo: "TELEFONE_JA_VINCULADO" as const }
    }
    const usuario = await tx.adminUser.findUnique({ where: { id: certo.adminUserId }, select: { active: true, mustChangePassword: true } })
    if (!usuario?.active || usuario.mustChangePassword) {
      await tx.gmAssistDesafio.update({ where: { id: certo.id }, data: { estado: "CANCELADO", pendenteUsuario: null, decididoEm: agora } })
      await evento(tx, { tipo: "USUARIO_INVALIDO", adminUserId: certo.adminUserId, desafioId: certo.id, telefone })
      return { tipo: "SEM_DESAFIO" as const }
    }
    // Novo pareamento do mesmo usuário substitui o vínculo anterior (outro telefone ou o mesmo).
    const anteriores = await tx.gmAssistVinculo.findMany({ where: { OR: [{ ativoUsuario: certo.adminUserId }, { ativoTelefone: telefone }] } })
    for (const v of anteriores) {
      await tx.gmAssistVinculo.update({ where: { id: v.id }, data: { estado: "REVOGADO", versao: v.versao + 1, ativoTelefone: null,
        ativoUsuario: null, revogadoEm: agora, revogacaoMotivo: "NOVO_PAREAMENTO" } })
      await evento(tx, { tipo: "VINCULO_REVOGADO", adminUserId: v.adminUserId, vinculoId: v.id, telefone: v.telefoneE164 })
    }
    await tx.gmAssistDesafio.update({ where: { id: certo.id }, data: { estado: "CONFIRMADO", pendenteUsuario: null, decididoEm: agora } })
    const vinculoId = randomUUID()
    await tx.gmAssistVinculo.create({ data: { id: vinculoId, adminUserId: certo.adminUserId, telefoneE164: telefone, ativoTelefone: telefone,
      ativoUsuario: certo.adminUserId, desafioId: certo.id, consentimentoVersao: certo.consentimentoVersao, consentidoEm: agora } })
    // Os demais desafios do mesmo telefone (de outras contas) deixam de valer.
    for (const d of vigentes.filter(x => x.id !== certo.id)) {
      await tx.gmAssistDesafio.update({ where: { id: d.id }, data: { estado: "CANCELADO", pendenteUsuario: null, decididoEm: agora } })
    }
    await evento(tx, { tipo: "VINCULO_CRIADO", adminUserId: certo.adminUserId, vinculoId, desafioId: certo.id, telefone })
    return { tipo: "VINCULADO" as const, vinculoId, userId: certo.adminUserId }
  }, { isolationLevel: "ReadCommitted" })
}

/** Revogação pelo próprio usuário (sessão web) ou por segurança. Idempotente: sem vínculo ativo → SEM_VINCULO. */
export async function revogarVinculo(db: GmDb, input: { userId: string; motivo: "USUARIO" | "SEGURANCA" | "CONTA_INATIVA" }) {
  return db.$transaction(async tx => {
    const v = await tx.gmAssistVinculo.findUnique({ where: { ativoUsuario: input.userId } })
    if (!v) throw new VinculoError("SEM_VINCULO")
    const [{ agora }] = await tx.$queryRaw<Array<{ agora: Date }>>`SELECT clock_timestamp() AS agora`
    const n = await tx.gmAssistVinculo.updateMany({ where: { id: v.id, versao: v.versao, estado: "ATIVO" }, data: { estado: "REVOGADO",
      versao: v.versao + 1, ativoTelefone: null, ativoUsuario: null, revogadoEm: agora, revogacaoMotivo: input.motivo } })
    if (n.count !== 1) throw new VinculoError("SEM_VINCULO")
    await evento(tx, { tipo: "VINCULO_REVOGADO", adminUserId: input.userId, vinculoId: v.id, telefone: v.telefoneE164 })
    return { vinculoId: v.id }
  })
}

/** Desiste do pareamento pendente (o usuário mudou de telefone ou fechou a tela). Idempotente. */
export async function cancelarPareamento(db: GmDb, userId: string) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"gm-assist-desafio:" + userId}))`
    const d = await tx.gmAssistDesafio.findUnique({ where: { pendenteUsuario: userId }, select: { id: true } })
    if (!d) return { cancelado: false }
    const [{ agora }] = await tx.$queryRaw<Array<{ agora: Date }>>`SELECT clock_timestamp() AS agora`
    await tx.gmAssistDesafio.update({ where: { id: d.id }, data: { estado: "CANCELADO", pendenteUsuario: null, decididoEm: agora } })
    await evento(tx, { tipo: "DESAFIO_CANCELADO", adminUserId: userId, desafioId: d.id })
    return { cancelado: true }
  })
}

export type VinculoAtivo = { id: string; adminUserId: string; versao: number; telefoneE164: string }

/** Vínculo ATIVO do remetente com usuário ainda ativo. Ausente = remetente não vinculado. */
export async function vinculoAtivoPorTelefone(db: GmDb | Tx, telefoneE164: string): Promise<VinculoAtivo | null> {
  if (!E164.test(telefoneE164)) return null
  const v = await db.gmAssistVinculo.findUnique({ where: { ativoTelefone: telefoneE164 },
    select: { id: true, adminUserId: true, versao: true, telefoneE164: true, estado: true } })
  if (!v || v.estado !== "ATIVO") return null
  const u = await db.adminUser.findUnique({ where: { id: v.adminUserId }, select: { active: true, mustChangePassword: true } })
  if (!u?.active || u.mustChangePassword) return null
  return { id: v.id, adminUserId: v.adminUserId, versao: v.versao, telefoneE164: v.telefoneE164 }
}

/** Revalidação por id e versão: revogado, reemitido ou usuário inativo → null. */
export async function vinculoVigente(db: GmDb | Tx, vinculoId: string, versao: number): Promise<VinculoAtivo | null> {
  const v = await db.gmAssistVinculo.findUnique({ where: { id: vinculoId },
    select: { id: true, adminUserId: true, versao: true, telefoneE164: true, estado: true } })
  if (!v || v.estado !== "ATIVO" || v.versao !== versao) return null
  return vinculoAtivoPorTelefone(db, v.telefoneE164).then(a => (a?.id === v.id ? a : null))
}

export type EstadoVinculoTela = "SEM_VINCULO" | "PENDENTE" | "EXPIRADO" | "BLOQUEADO" | "VINCULADO"

/**
 * Situação para a tela (sessão web, contrato da #418): telefone mascarado, sem código nem hash.
 * Expiração pelo relógio do BANCO. VINCULADO prevalece; um pendente em andamento (novo pareamento) vem junto.
 * EXPIRADO/BLOQUEADO refletem o desafio mais recente decidido nos últimos 30 min, para a tela orientar "gerar novo código".
 */
export async function situacaoVinculo(db: GmDb, userId: string) {
  const [{ agora }] = await db.$queryRaw<Array<{ agora: Date }>>`SELECT clock_timestamp() AS agora`
  const [v, d, ultimo] = await Promise.all([
    db.gmAssistVinculo.findUnique({ where: { ativoUsuario: userId }, select: { telefoneE164: true, consentidoEm: true } }),
    db.gmAssistDesafio.findUnique({ where: { pendenteUsuario: userId }, select: { telefoneE164: true, expiraEm: true, tentativas: true, limiteTentativas: true } }),
    db.gmAssistDesafio.findFirst({ where: { adminUserId: userId, estado: { in: ["EXPIRADO", "BLOQUEADO"] },
      decididoEm: { gt: new Date(agora.getTime() - 30 * 60_000) } }, orderBy: { criadoEm: "desc" }, select: { estado: true } }),
  ])
  const pendenteVigente = d && d.expiraEm.getTime() > agora.getTime()
  const estado: EstadoVinculoTela = v ? "VINCULADO" : pendenteVigente ? "PENDENTE"
    : d ? "EXPIRADO" : ultimo?.estado === "BLOQUEADO" ? "BLOQUEADO" : ultimo?.estado === "EXPIRADO" ? "EXPIRADO" : "SEM_VINCULO"
  return {
    estado,
    vinculado: v ? { telefoneMascarado: mascararTelefone(v.telefoneE164), desde: v.consentidoEm.toISOString() } : null,
    pendente: pendenteVigente ? { telefoneMascarado: mascararTelefone(d.telefoneE164), expiraEm: d.expiraEm.toISOString(),
      tentativasRestantes: d.limiteTentativas - d.tentativas } : null,
    consentimentoVersao: CONSENTIMENTO_VERSAO_ATUAL,
  }
}
