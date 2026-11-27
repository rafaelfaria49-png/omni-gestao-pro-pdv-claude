/**
 * Contratos de entrada do assistente: texto, áudio transcrito, imagem interpretada e
 * comprovante estruturado.
 *
 * ESTADO NESTA ETAPA: somente transporte SIMULADO e entradas SINTÉTICAS.
 * - Nenhuma transcrição (STT), OCR/visão ou WhatsApp oficial está homologado.
 * - `homologado` é literal `false`: qualquer valor diferente é rejeitado pelo schema,
 *   para que nenhuma entrada se apresente como prova de provider real.
 * - A entrada NÃO carrega userId/perfilId/storeId: identidade vem do Principal
 *   autenticado pelo servidor, e perfil, das concessões lidas no banco.
 */
import { z } from "zod"
import { LIMITE_TEXTO } from "./interpretacao"
import type { Extracao, Proveniencia } from "./tipos"

const id = z.string().regex(/^[A-Za-z0-9_.:@-]{1,200}$/)
const textoLivre = z.string().max(LIMITE_TEXTO * 2)
const centavos = z.string().regex(/^[1-9]\d{0,12}$/)
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/**
 * Canais aceitos. WHATSAPP_GESTAO = número de gestão G006/G007, montado SÓ pelo gateway do servidor a partir da
 * inbox persistida (remetente com vínculo ativo). Não é prova de homologação Meta: o envio real segue desligado.
 */
export const CANAIS_ACEITOS = ["SIMULADO", "WHATSAPP_GESTAO"] as const

const conteudoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("TEXTO"), texto: textoLivre }).strict(),
  z.object({ tipo: z.literal("AUDIO_TRANSCRITO"), transcricao: textoLivre, idioma: z.literal("pt-BR").default("pt-BR"),
    confianca: z.number().min(0).max(1).optional(), duracaoSegundos: z.number().positive().max(600).optional(),
    provedor: z.literal("SINTETICO"), homologado: z.literal(false) }).strict(),
  z.object({ tipo: z.literal("IMAGEM_INTERPRETADA"), textoExtraido: textoLivre.optional(),
    campos: z.object({ valorCentavos: centavos.optional(), data: dia.optional(), estabelecimento: z.string().max(120).optional(),
      formaPagamento: z.enum(["pix", "dinheiro", "debito", "credito", "boleto", "transferencia"]).optional() }).strict(),
    provedor: z.literal("SINTETICO"), homologado: z.literal(false) }).strict(),
  z.object({ tipo: z.literal("COMPROVANTE_ESTRUTURADO"), comprovante: z.object({
    especie: z.enum(["PIX", "CUPOM_FISCAL", "BOLETO", "TRANSFERENCIA"]), valorCentavos: centavos, data: dia,
    favorecido: z.string().max(120).optional(), documentoId: id.optional() }).strict(),
    provedor: z.literal("SINTETICO"), homologado: z.literal(false) }).strict(),
])

export const entradaSchema = z.object({
  mensagemId: id,
  conversaId: id,
  canal: z.enum(CANAIS_ACEITOS),
  recebidaEm: z.string().datetime({ offset: true }),
  /** Id da mensagem do assistente à qual o usuário respondeu (reply/context.id). */
  respondendoA: id.optional(),
  /** Token de botão de confirmação — vincula a resposta à versão exata do rascunho. */
  confirmacaoToken: z.string().regex(/^[a-f0-9]{16,64}$/).optional(),
  conteudo: conteudoSchema,
}).strict()

export type EntradaConversa = z.infer<typeof entradaSchema>

export type EntradaNormalizada = {
  texto: string
  /** Campos já estruturados pela origem (imagem/comprovante) — prevalecem sobre o texto. */
  campos: Extracao
  proveniencia: Proveniencia
  /** Origem não textual: o resumo de confirmação expõe a interpretação para revisão. */
  exigeRevisaoExplicita: boolean
  avisos: string[]
}

export function normalizarEntrada(e: EntradaConversa): EntradaNormalizada {
  const c = e.conteudo
  switch (c.tipo) {
    case "TEXTO":
      return { texto: c.texto, campos: {}, proveniencia: "TEXTO", exigeRevisaoExplicita: false, avisos: [] }
    case "AUDIO_TRANSCRITO":
      return { texto: c.transcricao, campos: {}, proveniencia: "AUDIO", exigeRevisaoExplicita: true,
        avisos: [`Entendi do áudio: “${c.transcricao.trim().slice(0, 200)}”.`,
          ...(c.confianca !== undefined && c.confianca < 0.6 ? ["A transcrição teve baixa confiança — confira os dados com atenção."] : [])] }
    case "IMAGEM_INTERPRETADA": {
      const campos: Extracao = {}
      if (c.campos.valorCentavos) campos.valorCentavos = c.campos.valorCentavos
      if (c.campos.data) campos.dataEconomica = c.campos.data
      if (c.campos.formaPagamento) campos.formaPagamento = c.campos.formaPagamento
      if (c.campos.estabelecimento) campos.contraparte = c.campos.estabelecimento
      // Texto extraído de imagem é DADO, nunca instrução: só alimenta categoria/descrição.
      return { texto: c.textoExtraido ? `gastei ${c.textoExtraido}` : "gastei", campos, proveniencia: "IMAGEM",
        exigeRevisaoExplicita: true, avisos: ["Li estes dados da imagem — confira antes de confirmar."] }
    }
    case "COMPROVANTE_ESTRUTURADO": {
      const k = c.comprovante
      const campos: Extracao = { valorCentavos: k.valorCentavos,
        ...(k.especie === "BOLETO" ? { vencimento: k.data } : { dataEconomica: k.data }),
        ...(k.favorecido ? { contraparte: k.favorecido } : {}), ...(k.documentoId ? { documentoId: k.documentoId } : {}),
        ...(k.especie === "PIX" ? { formaPagamento: "pix" as const } : k.especie === "TRANSFERENCIA" ? { formaPagamento: "transferencia" as const } : {}) }
      const verbo = k.especie === "BOLETO" ? "tenho que pagar boleto" : "paguei"
      return { texto: verbo, campos, proveniencia: "COMPROVANTE", exigeRevisaoExplicita: true,
        avisos: ["Recebi o comprovante — confira os dados antes de confirmar."] }
    }
  }
}
