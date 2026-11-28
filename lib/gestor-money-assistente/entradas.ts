/**
 * Contratos de entrada do assistente: texto, áudio transcrito (G009), imagem interpretada,
 * comprovante estruturado e documento extraído (G010).
 *
 * Princípios de segurança:
 * - Provedores sintéticos/simulados (`SINTETICO`, `SIMULADO`) SEMPRE exigem `homologado: false`.
 * - A entrada NÃO carrega userId/perfilId/storeId: identidade vem do Principal autenticado
 *   pelo servidor, e perfil, das concessões lidas no banco (G001).
 * - Todo conteúdo derivado de mídia (áudio, imagem, PDF, legenda) é dado não confiável,
 *   nunca instrução de sistema nem gatilho direto de gravação financeira.
 */
import { z } from "zod"
import { LIMITE_TEXTO } from "./interpretacao"
import { analisarSinaisAudioPtBr } from "./multimodal/audio-g009"
import {
  efeitoFinanceiroDoDocumento,
  TIPOS_DOCUMENTO_FINANCEIRO,
  type EfeitoFinanceiroDocumento,
} from "./multimodal/contratos"
import type { Extracao, Proveniencia } from "./tipos"

const id = z.string().regex(/^[A-Za-z0-9_.:@-]{1,200}$/)
const textoLivre = z.string().max(LIMITE_TEXTO * 2)
const centavos = z.string().regex(/^[1-9]\d{0,12}$/)
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/)
const formaPg = z.enum(["pix", "dinheiro", "debito", "credito", "boleto", "transferencia"])

/**
 * Canais aceitos. WHATSAPP_GESTAO = número de gestão G006/G007, montado SÓ pelo gateway do servidor a partir da
 * inbox persistida (remetente com vínculo ativo).
 */
export const CANAIS_ACEITOS = ["SIMULADO", "WHATSAPP_GESTAO", "WEB_MULTIMODAL"] as const

const itemDocSchema = z
  .object({
    descricao: z.string().min(1).max(200),
    quantidade: z.number().positive().max(100_000).optional(),
    valorCentavos: centavos.optional(),
  })
  .strict()

const documentoExtraidoSchema = z
  .object({
    legibilidade: z.enum(["LEGIVEL", "PARCIAL", "ILEGIVEL", "CORTADA"]),
    tipoDocumento: z.enum(TIPOS_DOCUMENTO_FINANCEIRO),
    efeitoFinanceiro: z.enum([
      "COMPRA_A_CONFIRMAR_PAGAMENTO",
      "OBRIGACAO_NAO_PAGA",
      "COMPROVANTE_PAGAMENTO_DECLARADO",
      "RECEBIMENTO_DECLARADO",
      "EXTRATO_INFORMATIVO",
      "SEM_EFEITO_FINANCEIRO",
    ]),
    emitente: z.string().max(160).optional(),
    destinatario: z.string().max(160).optional(),
    fornecedor: z.string().max(160).optional(),
    data: dia.optional(),
    vencimento: dia.optional(),
    valorTotalCentavos: centavos.optional(),
    valoresCandidatosCentavos: z.array(centavos).max(10).optional(),
    descontoCentavos: centavos.optional(),
    jurosCentavos: centavos.optional(),
    multaCentavos: centavos.optional(),
    formaPagamento: formaPg.optional(),
    identificadorTransacao: z.string().max(160).optional(),
    numeroDocumento: z.string().max(120).optional(),
    itens: z.array(itemDocSchema).max(30).optional(),
    referenciasFinanceiras: z.array(z.string().max(120)).max(15).optional(),
    textoResumo: z.string().max(1000).optional(),
    naturezaMercadoria: z.boolean().optional(),
    sinaisInjecao: z.array(z.string().max(80)).max(20).optional(),
  })
  .strict()

const referenciaIntegracaoSchema = z
  .object({
    categoriaFluxo: z.enum(["COMPRA_MERCADORIA", "DOCUMENTO_COMERCIAL", "COMPROVANTE_FINANCEIRO"]),
    documentoHash: sha256Hex,
    numeroDocumento: z.string().max(120).optional(),
    identificadorTransacao: z.string().max(160).optional(),
    fornecedor: z.string().max(160).optional(),
    itens: z.array(itemDocSchema).max(30).optional(),
  })
  .strict()

const conteudoSchema = z
  .discriminatedUnion("tipo", [
    z.object({ tipo: z.literal("TEXTO"), texto: textoLivre }).strict(),
    z
      .object({
        tipo: z.literal("AUDIO_TRANSCRITO"),
        transcricao: textoLivre,
        idioma: z.literal("pt-BR").default("pt-BR"),
        confianca: z.number().min(0).max(1).optional(),
        duracaoSegundos: z.number().positive().max(600).optional(),
        sha256: sha256Hex.optional(),
        provedor: z.enum(["SINTETICO", "SIMULADO", "OPENAI_WHISPER"]),
        homologado: z.boolean(),
      })
      .strict(),
    z
      .object({
        tipo: z.literal("IMAGEM_INTERPRETADA"),
        textoExtraido: textoLivre.optional(),
        campos: z
          .object({
            valorCentavos: centavos.optional(),
            data: dia.optional(),
            estabelecimento: z.string().max(120).optional(),
            formaPagamento: formaPg.optional(),
          })
          .strict(),
        provedor: z.enum(["SINTETICO", "SIMULADO", "OPENAI_VISION"]),
        homologado: z.boolean(),
      })
      .strict(),
    z
      .object({
        tipo: z.literal("COMPROVANTE_ESTRUTURADO"),
        comprovante: z
          .object({
            especie: z.enum(["PIX", "CUPOM_FISCAL", "BOLETO", "TRANSFERENCIA"]),
            valorCentavos: centavos,
            data: dia,
            favorecido: z.string().max(120).optional(),
            documentoId: id.optional(),
            sha256: sha256Hex.optional(),
            identificadorTransacao: z.string().max(160).optional(),
            numeroDocumento: z.string().max(120).optional(),
          })
          .strict(),
        provedor: z.enum(["SINTETICO", "SIMULADO", "OPENAI_VISION"]),
        homologado: z.boolean(),
      })
      .strict(),
    z
      .object({
        tipo: z.literal("DOCUMENTO_EXTRAIDO"),
        documento: documentoExtraidoSchema,
        sha256: sha256Hex,
        legenda: textoLivre.optional(),
        avisoHonestidade: z.string().max(400).optional(),
        referenciaIntegracaoFutura: referenciaIntegracaoSchema.optional(),
        provedor: z.enum(["SIMULADO", "OPENAI_VISION"]),
        homologado: z.boolean(),
      })
      .strict(),
  ])
  .superRefine((c, ctx) => {
    // Regra inegociável de honestidade: provedores SINTETICO/SIMULADO jamais podem se declarar homologados.
    if (c.tipo !== "TEXTO" && (c.provedor === "SINTETICO" || c.provedor === "SIMULADO") && c.homologado) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provedor sintético/simulado não pode declarar homologação.",
      })
    }
  })

export const entradaSchema = z
  .object({
    mensagemId: id,
    conversaId: id,
    canal: z.enum(CANAIS_ACEITOS),
    recebidaEm: z.string().datetime({ offset: true }),
    /** Id da mensagem do assistente à qual o usuário respondeu (reply/context.id). */
    respondendoA: id.optional(),
    /** Token de botão de confirmação — vincula a resposta à versão exata do rascunho. */
    confirmacaoToken: z.string().regex(/^[a-f0-9]{16,64}$/).optional(),
    conteudo: conteudoSchema,
  })
  .strict()

export type EntradaConversa = z.infer<typeof entradaSchema>

export type EntradaNormalizada = {
  texto: string
  /** Campos já estruturados pela origem (imagem/comprovante/documento) — prevalecem sobre o texto. */
  campos: Extracao
  proveniencia: Proveniencia
  /** Origem não textual: o resumo de confirmação expõe a interpretação para revisão. */
  exigeRevisaoExplicita: boolean
  avisos: string[]
  /** Para documentos G010 sem efeito financeiro ou que exigem confirmar se já foi pago. */
  efeitoDocumento?: EfeitoFinanceiroDocumento
  aguardandoConfirmacaoPagamento?: boolean
}

export function normalizarEntrada(e: EntradaConversa): EntradaNormalizada {
  const c = e.conteudo
  switch (c.tipo) {
    case "TEXTO":
      return { texto: c.texto, campos: {}, proveniencia: "TEXTO", exigeRevisaoExplicita: false, avisos: [] }
    case "AUDIO_TRANSCRITO": {
      const sinais = analisarSinaisAudioPtBr(c.transcricao)
      const campos: Extracao = {}
      if (sinais.quantidadeItens !== undefined) campos.quantidadeItens = sinais.quantidadeItens
      if (sinais.naturezaMercadoria) campos.naturezaMercadoria = true
      if (sinais.transferenciaEntreDominios) campos.transferenciaEntreDominios = true
      if (c.sha256) campos.documentoHash = c.sha256
      return {
        texto: sinais.textoNormalizadoParaMotor,
        campos,
        proveniencia: "AUDIO",
        exigeRevisaoExplicita: true,
        avisos: [
          `Entendi do áudio: “${c.transcricao.trim().slice(0, 200)}”.`,
          ...(c.confianca !== undefined && c.confianca < 0.6
            ? ["A transcrição teve baixa confiança — confira os dados com atenção."]
            : []),
        ],
      }
    }
    case "IMAGEM_INTERPRETADA": {
      const campos: Extracao = {}
      if (c.campos.valorCentavos) campos.valorCentavos = c.campos.valorCentavos
      if (c.campos.data) campos.dataEconomica = c.campos.data
      if (c.campos.formaPagamento) campos.formaPagamento = c.campos.formaPagamento
      if (c.campos.estabelecimento) campos.contraparte = c.campos.estabelecimento
      // Texto extraído de imagem é DADO, nunca instrução: só alimenta categoria/descrição.
      return {
        texto: c.textoExtraido ? `gastei ${c.textoExtraido}` : "gastei",
        campos,
        proveniencia: "IMAGEM",
        exigeRevisaoExplicita: true,
        avisos: ["Li estes dados da imagem — confira antes de confirmar."],
      }
    }
    case "COMPROVANTE_ESTRUTURADO": {
      const k = c.comprovante
      const campos: Extracao = {
        valorCentavos: k.valorCentavos,
        ...(k.especie === "BOLETO" ? { vencimento: k.data } : { dataEconomica: k.data }),
        ...(k.favorecido ? { contraparte: k.favorecido } : {}),
        ...(k.documentoId ? { documentoId: k.documentoId } : {}),
        ...(k.sha256 ? { documentoHash: k.sha256 } : {}),
        ...(k.identificadorTransacao ? { identificadorTransacao: k.identificadorTransacao } : {}),
        ...(k.numeroDocumento ? { numeroDocumento: k.numeroDocumento } : {}),
        ...(k.especie === "PIX"
          ? { formaPagamento: "pix" as const }
          : k.especie === "TRANSFERENCIA"
            ? { formaPagamento: "transferencia" as const }
            : {}),
      }
      const verbo = k.especie === "BOLETO" ? "tenho que pagar boleto" : "paguei"
      return {
        texto: verbo,
        campos,
        proveniencia: "COMPROVANTE",
        exigeRevisaoExplicita: true,
        avisos: ["Recebi o comprovante — confira os dados antes de confirmar."],
      }
    }
    case "DOCUMENTO_EXTRAIDO": {
      const doc = c.documento
      const efeito = efeitoFinanceiroDoDocumento(doc.tipoDocumento)
      const campos: Extracao = {
        documentoHash: c.sha256,
        tipoDocumento: doc.tipoDocumento,
        efeitoFinanceiro: efeito,
        ...(doc.valorTotalCentavos ? { valorCentavos: doc.valorTotalCentavos } : {}),
        ...(!doc.valorTotalCentavos && doc.valoresCandidatosCentavos?.length
          ? { valoresAmbiguos: doc.valoresCandidatosCentavos }
          : {}),
        ...(doc.data ? { dataEconomica: doc.data } : {}),
        ...(doc.vencimento ? { vencimento: doc.vencimento } : {}),
        ...(doc.formaPagamento ? { formaPagamento: doc.formaPagamento } : {}),
        ...(doc.fornecedor || doc.emitente ? { contraparte: doc.fornecedor ?? doc.emitente } : {}),
        ...(doc.identificadorTransacao ? { identificadorTransacao: doc.identificadorTransacao } : {}),
        ...(doc.numeroDocumento ? { numeroDocumento: doc.numeroDocumento } : {}),
        ...(doc.itens?.length ? { itensDocumento: doc.itens } : {}),
        ...(doc.naturezaMercadoria ? { naturezaMercadoria: true } : {}),
        ...(c.referenciaIntegracaoFutura ? { referenciaIntegracaoFutura: c.referenciaIntegracaoFutura } : {}),
      }
      if (doc.itens?.length && !campos.descricao) {
        const resumoItens = doc.itens
          .slice(0, 3)
          .map((i) => (i.quantidade && i.quantidade > 1 ? `${i.quantidade}x ${i.descricao}` : i.descricao))
          .join(", ")
        if (resumoItens) campos.descricao = resumoItens.slice(0, 200)
      }

      const avisos = [
        c.avisoHonestidade ??
          (efeito === "OBRIGACAO_NAO_PAGA"
            ? "Identifiquei um documento de obrigação ainda não paga — confira antes de registrar."
            : efeito === "COMPRA_A_CONFIRMAR_PAGAMENTO"
              ? "Identifiquei um documento de compra — ele sozinho não comprova pagamento."
              : "Li estes dados do documento — confira antes de confirmar."),
      ]

      // Legenda do usuário complementa o contexto sem virar instrução irrestrita
      const legenda = c.legenda?.trim() ?? ""
      const legendaIndicaPago = /\b(paguei|pago|paga|pix|debito|dinheiro|transferencia)\b/i.test(legenda)

      if (efeito === "EXTRATO_INFORMATIVO" || efeito === "SEM_EFEITO_FINANCEIRO") {
        return {
          texto: legenda,
          campos,
          proveniencia: "IMAGEM",
          exigeRevisaoExplicita: true,
          avisos,
          efeitoDocumento: efeito,
        }
      }

      if (efeito === "OBRIGACAO_NAO_PAGA") {
        const textoBase = legenda ? `tenho que pagar ${legenda}` : "tenho que pagar boleto"
        return {
          texto: textoBase,
          campos,
          proveniencia: "COMPROVANTE",
          exigeRevisaoExplicita: true,
          avisos,
          efeitoDocumento: efeito,
        }
      }

      if (efeito === "COMPRA_A_CONFIRMAR_PAGAMENTO") {
        const textoBase = legenda
          ? `comprei ${legenda}`
          : doc.textoResumo
            ? `comprei ${doc.textoResumo}`
            : "comprei"
        return {
          texto: textoBase,
          campos,
          proveniencia: "IMAGEM",
          exigeRevisaoExplicita: true,
          avisos,
          efeitoDocumento: efeito,
          aguardandoConfirmacaoPagamento: !legendaIndicaPago && !doc.formaPagamento,
        }
      }

      // COMPROVANTE_PAGAMENTO_DECLARADO ou RECEBIMENTO_DECLARADO
      const verbo = efeito === "RECEBIMENTO_DECLARADO" ? "recebi" : "paguei"
      const textoBase = legenda ? `${verbo} ${legenda}` : doc.textoResumo ? `${verbo} ${doc.textoResumo}` : verbo
      return {
        texto: textoBase,
        campos,
        proveniencia: "COMPROVANTE",
        exigeRevisaoExplicita: true,
        avisos,
        efeitoDocumento: efeito,
      }
    }
  }
}
