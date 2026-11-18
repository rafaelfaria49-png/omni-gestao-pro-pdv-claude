/**
 * Solicitação de teste/demonstração da página `/gestao-lojas`.
 *
 * Regras de honestidade (OMNI-SAAS-VENDAS-SIMPLES-LANDING-COMERCIAL-001):
 * - registrar a solicitação NÃO cria conta, loja nem período de teste — a liberação é
 *   assistida pela plataforma (`/dashboard/plataforma`, provisionamento existente);
 * - a resposta só diz "recebida" depois que a linha existe no banco;
 * - repetir o envio com o mesmo email (solicitação aberta) devolve o MESMO protocolo,
 *   garantido pelo UNIQUE em `emailAberto` — sem duplicar e sem corrida;
 * - limite por origem (HMAC do IP) e limite global contra enxurrada, ambos no banco
 *   (funcionam entre instâncias serverless, ao contrário de contador em memória).
 */
import { createHmac, randomBytes } from "node:crypto"
import { z } from "zod"
import { RAMOS_SOLICITACAO, isPlanoGestaoLojas } from "./gestao-lojas-oferta"

export const CONSENTIMENTO_VERSAO = "gestao-lojas-2026-11-18"
export const LIMITE_POR_ORIGEM_POR_HORA = 5
export const LIMITE_GLOBAL_POR_10_MIN = 60

export const STATUS_SOLICITACAO = ["recebida", "em_contato", "provisionada", "descartada"] as const
export type StatusSolicitacao = (typeof STATUS_SOLICITACAO)[number]
const STATUS_ENCERRADOS: ReadonlySet<StatusSolicitacao> = new Set(["provisionada", "descartada"])

const ramos = Object.keys(RAMOS_SOLICITACAO) as [keyof typeof RAMOS_SOLICITACAO, ...(keyof typeof RAMOS_SOLICITACAO)[]]

export const solicitacaoTesteSchema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome.").max(120),
  nomeLoja: z.string().trim().min(2, "Informe o nome da loja.").max(160),
  email: z.string().trim().max(254).email("Informe um email válido."),
  whatsapp: z.string().trim().max(30).transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 10 && v.length <= 13, "Informe o WhatsApp com DDD."),
  ramo: z.enum(ramos, { message: "Escolha o tipo de loja." }),
  planoInteresse: z.string().optional().transform((v) => (isPlanoGestaoLojas(v) ? v : undefined)),
  mensagem: z.string().trim().max(1000).optional().transform((v) => v || undefined),
  // `z.literal(true, { message })` ignora a mensagem nesta versão do zod: refine garante o texto em português.
  consentimento: z.unknown().refine((v) => v === true, "É preciso concordar com o uso dos dados para o contato."),
  /** Campo-isca invisível. Pessoa real deixa vazio. */
  site: z.string().max(0).optional(),
}).strict()

export type SolicitacaoTesteInput = z.input<typeof solicitacaoTesteSchema>

export type ResultadoSolicitacao =
  | { ok: true; protocolo: string; repetida: boolean }
  | { ok: false; codigo: "INVALIDO"; campos: Record<string, string> }
  | { ok: false; codigo: "LIMITE"; mensagem: string }
  | { ok: false; codigo: "INDISPONIVEL"; mensagem: string }

type Linha = { id: string; protocolo: string; status: string; historico: unknown }

/** Subconjunto do Prisma Client usado aqui — permite testar sem banco. */
export type SolicitacaoDb = {
  solicitacaoTesteComercial: {
    count(args: { where: { createdAt: { gte: Date }; ipHash?: string } }): Promise<number>
    create(args: { data: Record<string, unknown>; select: { protocolo: true } }): Promise<{ protocolo: string }>
    findUnique(args: { where: { emailAberto: string } | { id: string }; select: Record<string, true> }): Promise<Linha | null>
    /** Gravação condicional ao status lido: duas mudanças simultâneas não se sobrescrevem. */
    updateMany(args: { where: { id: string; status: string }; data: Record<string, unknown> }): Promise<{ count: number }>
  }
}

export function hashOrigem(ip: string, segredo: string): string {
  return createHmac("sha256", segredo).update("gestao-lojas|" + ip).digest("hex")
}

const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
export function gerarProtocolo(bytes: Buffer = randomBytes(8)): string {
  let s = ""
  for (const b of bytes) s += ALFABETO[b % ALFABETO.length]
  return `GL-${s.slice(0, 4)}-${s.slice(4, 8)}`
}

function codigoPrisma(e: unknown): { code?: string; target?: unknown } {
  if (!e || typeof e !== "object") return {}
  const err = e as { code?: unknown; meta?: { target?: unknown } }
  return { code: typeof err.code === "string" ? err.code : undefined, target: err.meta?.target }
}

function alvoInclui(target: unknown, campo: string): boolean {
  if (Array.isArray(target)) return target.some((t) => String(t).includes(campo))
  return typeof target === "string" && target.includes(campo)
}

export async function registrarSolicitacaoTeste(
  db: SolicitacaoDb,
  bruto: unknown,
  ctx: { ipHash: string; agora?: Date; gerar?: () => string },
): Promise<ResultadoSolicitacao> {
  const parsed = solicitacaoTesteSchema.safeParse(bruto)
  if (!parsed.success) {
    const campos: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? "form")
      if (!campos[k]) campos[k] = k === "site" ? "Não foi possível enviar." : issue.message
    }
    return { ok: false, codigo: "INVALIDO", campos }
  }
  const d = parsed.data
  const agora = ctx.agora ?? new Date()
  const gerar = ctx.gerar ?? (() => gerarProtocolo())
  const emailNormalizado = d.email.toLowerCase()
  const tabela = db.solicitacaoTesteComercial

  try {
    const [porOrigem, global] = await Promise.all([
      tabela.count({ where: { ipHash: ctx.ipHash, createdAt: { gte: new Date(agora.getTime() - 60 * 60_000) } } }),
      tabela.count({ where: { createdAt: { gte: new Date(agora.getTime() - 10 * 60_000) } } }),
    ])
    if (porOrigem >= LIMITE_POR_ORIGEM_POR_HORA) {
      return { ok: false, codigo: "LIMITE", mensagem: "Recebemos várias solicitações desta conexão na última hora. Tente de novo mais tarde." }
    }
    if (global >= LIMITE_GLOBAL_POR_10_MIN) {
      return { ok: false, codigo: "LIMITE", mensagem: "Estamos recebendo muitas solicitações agora. Tente de novo em alguns minutos." }
    }

    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        const criada = await tabela.create({
          data: {
            protocolo: gerar(), nome: d.nome, nomeLoja: d.nomeLoja, email: emailNormalizado, emailAberto: emailNormalizado,
            whatsapp: d.whatsapp, ramo: d.ramo, planoInteresse: d.planoInteresse ?? null, mensagem: d.mensagem ?? null,
            consentimentoEm: agora, consentimentoVersao: CONSENTIMENTO_VERSAO, origem: "gestao-lojas", status: "recebida",
            ipHash: ctx.ipHash, historico: [{ em: agora.toISOString(), evento: "recebida", por: "visitante" }],
          },
          select: { protocolo: true },
        })
        return { ok: true, protocolo: criada.protocolo, repetida: false }
      } catch (e) {
        const { code, target } = codigoPrisma(e)
        if (code !== "P2002") throw e
        if (alvoInclui(target, "emailAberto")) {
          const aberta = await tabela.findUnique({ where: { emailAberto: emailNormalizado }, select: { id: true, protocolo: true, status: true, historico: true } })
          if (aberta) return { ok: true, protocolo: aberta.protocolo, repetida: true }
          continue // encerrada entre o create e a leitura: tenta criar de novo
        }
        if (alvoInclui(target, "protocolo")) continue
        throw e
      }
    }
    throw new Error("SOLICITACAO_SEM_PROTOCOLO_LIVRE")
  } catch {
    return { ok: false, codigo: "INDISPONIVEL", mensagem: "Não conseguimos registrar sua solicitação agora. Nada foi salvo. Tente de novo em instantes." }
  }
}

export async function atualizarStatusSolicitacao(
  db: SolicitacaoDb,
  args: { id: string; status: StatusSolicitacao; por: string; agora?: Date },
): Promise<{ ok: true } | { ok: false; erro: string }> {
  // Compare-and-set: só grava se o status ainda for o que foi lido. Sem isso, "descartada"
  // e "em_contato" simultâneos deixavam um pedido aberto com emailAberto=NULL.
  const tabela = db.solicitacaoTesteComercial
  const atual = await tabela.findUnique({ where: { id: args.id }, select: { id: true, protocolo: true, status: true, historico: true } })
  if (!atual) return { ok: false, erro: "Solicitação não encontrada." }
  if (STATUS_ENCERRADOS.has(atual.status as StatusSolicitacao)) return { ok: false, erro: "Solicitação já encerrada." }
  const historico = Array.isArray(atual.historico) ? atual.historico : []
  const gravado = await tabela.updateMany({
    where: { id: args.id, status: atual.status },
    data: {
      status: args.status,
      ...(STATUS_ENCERRADOS.has(args.status) ? { emailAberto: null } : {}),
      historico: [...historico, { em: (args.agora ?? new Date()).toISOString(), evento: args.status, por: args.por }],
    },
  })
  if (gravado.count !== 1) return { ok: false, erro: "A solicitação mudou enquanto você atualizava. Recarregue a lista." }
  return { ok: true }
}
