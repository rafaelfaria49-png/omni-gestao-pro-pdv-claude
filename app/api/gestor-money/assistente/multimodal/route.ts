import {
  MEIOS_PAGAMENTO_GASTO,
  type AnaliseMultimodalResultado,
  type MeioPagamentoGasto,
  type PropostaMultimodalExtraida,
} from "@/lib/gestor-money/contracts"
import {
  requireGestorMoneyApiContext,
  respostaPrivadaJson,
} from "@/lib/gestor-money/server/auth-boundary"
import { diagnosticarStorageComprovantes } from "@/lib/gestor-money/server/documents-adapter"
import { duplicidadeG005 } from "@/lib/gestor-money-assistente/adaptador-servidor"
import { diaCivil } from "@/lib/gestor-money-assistente/datas"
import { interpretar } from "@/lib/gestor-money-assistente/interpretacao"
import {
  criarProviderTranscricaoOpenAI,
  processarAudioG009,
} from "@/lib/gestor-money-assistente/multimodal/audio-g009"
import {
  LIMITES_MIDIA,
  type MimeAudioAceito,
  type MimeDocumentoAceito,
} from "@/lib/gestor-money-assistente/multimodal/contratos"
import {
  criarProviderDocumentoOpenAI,
  processarDocumentoG010,
} from "@/lib/gestor-money-assistente/multimodal/documento-g010"
import { validarBufferMidia } from "@/lib/gestor-money-assistente/multimodal/midia-seguranca"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const MEIOS_VALIDOS = new Set<string>(MEIOS_PAGAMENTO_GASTO)

function mapearFormaPagamento(forma?: string | null): MeioPagamentoGasto | null {
  if (!forma) return null
  return MEIOS_VALIDOS.has(forma) ? (forma as MeioPagamentoGasto) : null
}

function statusHttpDoCodigo(codigo: string): number {
  if (codigo === "PROVEDOR_INDISPONIVEL" || codigo === "PROVEDOR_ERRO_TEMPORARIO") {
    return 503
  }
  if (codigo === "PROVEDOR_TIMEOUT" || codigo === "DOWNLOAD_TIMEOUT") {
    return 504
  }
  return 422
}

function rotuloTipoDocumento(tipo: string): string {
  const mapa: Record<string, string> = {
    COMPROVANTE_PIX: "Comprovante Pix",
    RECIBO: "Recibo",
    CUPOM_FISCAL: "Cupom fiscal",
    NOTA_FISCAL: "Nota fiscal",
    BOLETO: "Boleto",
    CONTA_A_PAGAR: "Conta a pagar",
    FATURA: "Fatura",
    COMPROVANTE_BANCARIO: "Comprovante bancário",
    EXTRATO: "Extrato",
    DOCUMENTO_COMERCIAL: "Documento comercial",
    NAO_FINANCEIRO: "Documento não financeiro",
  }
  return mapa[tipo] ?? "Documento"
}

/**
 * POST /api/gestor-money/assistente/multimodal
 *
 * Processa áudio (G009) ou imagem/PDF (G010) em memória temporária, valida magic bytes,
 * executa interpretação/extração estruturada + busca de duplicidade estritamente no
 * escopo autorizado `ctx` e descarta o buffer imediatamente em `finally`.
 *
 * REGRA INEGOCIÁVEL: ZERO escritas financeiras nesta rota.
 */
export async function POST(req: Request) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return respostaPrivadaJson(
      { ok: false, code: "invalid_multipart", error: "Envie os dados em formato multipart/form-data." },
      400
    )
  }

  const tipoRaw = form.get("tipo")
  const tipo = tipoRaw === "audio" || tipoRaw === "documento" ? tipoRaw : null
  if (!tipo) {
    return respostaPrivadaJson(
      { ok: false, code: "tipo_invalido", error: "Informe tipo='audio' ou tipo='documento'." },
      422
    )
  }

  const perfilTipo = form.get("perfilTipo")
  const perfilId = form.get("perfilId")
  const storeIdRaw = form.get("storeId")
  const storeId = typeof storeIdRaw === "string" && storeIdRaw.trim().length > 0 ? storeIdRaw.trim() : null

  const seletor =
    perfilTipo === "PESSOAL"
      ? storeId !== null
        ? { tipo: perfilTipo, perfilId, storeId }
        : { tipo: perfilTipo, perfilId }
      : { tipo: perfilTipo, perfilId, storeId }

  const authRes = await requireGestorMoneyApiContext(seletor, "edit")
  if (!authRes.ok) return authRes.response

  const fileEntry = form.get("file")
  if (!(fileEntry instanceof File)) {
    return respostaPrivadaJson(
      { ok: false, code: "arquivo_ausente", error: "Selecione um arquivo de áudio, imagem ou PDF para análise." },
      422
    )
  }

  const maxBytes =
    tipo === "audio" ? LIMITES_MIDIA.MAX_BYTES_AUDIO : LIMITES_MIDIA.MAX_BYTES_DOCUMENTO
  if (fileEntry.size <= 0) {
    return respostaPrivadaJson(
      { ok: false, code: "CONTEUDO_INVALIDO", error: "O arquivo enviado está vazio." },
      422
    )
  }
  if (fileEntry.size > maxBytes) {
    const limiteMb = Math.max(1, Math.round(maxBytes / (1024 * 1024)))
    return respostaPrivadaJson(
      { ok: false, code: "MIDIA_MUITO_GRANDE", error: `O arquivo excede o limite máximo de ${limiteMb} MB.` },
      422
    )
  }

  const legendaEntry = form.get("legenda")
  const legenda =
    typeof legendaEntry === "string" && legendaEntry.trim().length > 0
      ? legendaEntry.trim().slice(0, 500)
      : undefined

  const duracaoEntry = form.get("duracaoSegundos")
  let duracaoSegundos: number | undefined
  if (typeof duracaoEntry === "string" && duracaoEntry.trim().length > 0) {
    const parsedDur = Number(duracaoEntry)
    if (Number.isFinite(parsedDur) && parsedDur >= 0) {
      duracaoSegundos = parsedDur
    }
  }

  const rawBuffer = Buffer.from(await fileEntry.arrayBuffer())
  const validacao = validarBufferMidia({
    bytes: rawBuffer,
    tipoEsperado: tipo === "audio" ? "AUDIO" : "DOCUMENTO",
    duracaoSegundos,
  })

  if (!validacao.ok) {
    rawBuffer.fill(0)
    return respostaPrivadaJson(
      {
        ok: false,
        code: validacao.codigo,
        error: validacao.mensagemUsuario,
        transitorio: validacao.transitorio,
      },
      422
    )
  }

  const { midia } = validacao
  const storageDiag = diagnosticarStorageComprovantes(process.env)
  const hoje = diaCivil(new Date())

  try {
    if (tipo === "audio") {
      const provider = criarProviderTranscricaoOpenAI(process.env)
      const nomeArquivo = fileEntry.name?.trim() || `audio.${midia.extensao}`
      const resAudio = await processarAudioG009(
        {
          bytes: midia.bytes,
          mime: midia.mimeReal as MimeAudioAceito,
          nomeArquivo,
          sha256: midia.sha256,
          duracaoSegundos,
        },
        provider
      )

      if (!resAudio.ok) {
        return respostaPrivadaJson(
          {
            ok: false,
            code: resAudio.codigo,
            error: resAudio.mensagemUsuario,
            transitorio: resAudio.transitorio,
          },
          statusHttpDoCodigo(resAudio.codigo)
        )
      }

      const textoInterpretar = legenda
        ? `${resAudio.transcricaoSanitizada}. ${legenda}`
        : resAudio.transcricaoSanitizada
      const interp = interpretar(textoInterpretar, hoje)

      if (interp.sinaisSuspeitos.length > 0) {
        return respostaPrivadaJson(
          {
            ok: false,
            code: "INJECAO_DETECTADA",
            error:
              "O conteúdo transcrito contém instruções incompatíveis com o registro financeiro seguro e foi bloqueado. Nada foi registrado.",
            transitorio: false,
          },
          422
        )
      }

      const ext = interp.extracao
      const naturezaSugerida: "DESPESA" | "DIVIDA" =
        interp.intencao === "DIVIDA" ? "DIVIDA" : "DESPESA"

      const proposta: PropostaMultimodalExtraida = {
        naturezaSugerida,
        descricao: ext.descricao || ext.categoria || resAudio.resumoTranscricao.slice(0, 120),
        valorCentavos: ext.valorCentavos ?? null,
        ...(ext.valoresAmbiguos && ext.valoresAmbiguos.length > 1
          ? { valoresCandidatosCentavos: ext.valoresAmbiguos }
          : {}),
        data: ext.dataEconomica ?? hoje,
        vencimento: ext.vencimento ?? null,
        formaPagamento: mapearFormaPagamento(ext.formaPagamento),
        contraparte: ext.contraparte ?? null,
        contaSugeridaNome: ext.conta ?? null,
        categoriaSugeridaNome: ext.categoria ?? null,
        ...(resAudio.naturezaMercadoria || ext.naturezaMercadoria
          ? { naturezaMercadoria: true }
          : {}),
        ...(resAudio.quantidadeItens ?? ext.quantidadeItens
          ? { quantidadeItens: resAudio.quantidadeItens ?? ext.quantidadeItens }
          : {}),
      }

      const candidatosDuplicidade = await duplicidadeG005
        .buscarCandidatos(authRes.contexto, {
          sha256: midia.sha256,
          valorCentavos: proposta.valorCentavos ?? undefined,
          dataReferencia: proposta.data ?? proposta.vencimento ?? hoje,
          contraparte: proposta.contraparte ?? undefined,
          contaNome: proposta.contaSugeridaNome ?? undefined,
        })
        .catch(() => [])

      const avisosAdicionais: string[] = []
      if (resAudio.baixaConfianca) {
        avisosAdicionais.push(
          "A transcrição apresentou baixa confiança — revise atentamente valor, descrição e conta antes de confirmar."
        )
      }
      if (ext.valoresAmbiguos && ext.valoresAmbiguos.length > 1) {
        avisosAdicionais.push(
          "Foram identificados múltiplos valores no áudio. Escolha explicitamente o valor correto abaixo."
        )
      }
      if (ext.formaPagamento === "credito") {
        avisosAdicionais.push(
          "O áudio mencionou cartão de crédito; para compras no cartão utilize o módulo Cartões ou ajuste o meio de pagamento abaixo."
        )
      }
      if (ext.transferenciaEntreDominios) {
        avisosAdicionais.push(
          "Transferência entre domínios (Pessoal ↔ Empresa) detectada: nenhum lançamento automático foi feito entre perfis distintos."
        )
      }
      if (!storageDiag.runtimeLiberado) {
        avisosAdicionais.push(
          "O áudio foi processado apenas temporariamente em memória e descartado; armazenamento permanente (G003-STORAGE) indisponível neste ambiente."
        )
      }

      const resultado: AnaliseMultimodalResultado = {
        tipo: "audio",
        provedor: resAudio.provedor,
        homologado: resAudio.homologado,
        sha256: resAudio.sha256,
        mimeReal: midia.mimeReal,
        tamanhoBytes: midia.tamanhoBytes,
        transcricao: resAudio.transcricao,
        resumoTranscricao: resAudio.resumoTranscricao,
        baixaConfianca: resAudio.baixaConfianca,
        ...(resAudio.duracaoSegundos !== undefined ? { duracaoSegundos: resAudio.duracaoSegundos } : {}),
        avisoHonestidade:
          "Transcrição de áudio concluída apenas como proposta editável — nada foi registrado automaticamente no financeiro.",
        avisosAdicionais,
        proposta,
        candidatosDuplicidade,
        storagePermanenteDisponivel: storageDiag.runtimeLiberado,
        storagePermanenteMotivo: storageDiag.motivo,
      }

      return respostaPrivadaJson({ ok: true, resultado }, 200)
    }

    // ── Documento (Imagem / PDF) G010 ──
    const provider = criarProviderDocumentoOpenAI(process.env)
    const nomeArquivo = fileEntry.name?.trim() || `documento.${midia.extensao}`
    const resDoc = await processarDocumentoG010(
      {
        bytes: midia.bytes,
        mime: midia.mimeReal as MimeDocumentoAceito,
        nomeArquivo,
        sha256: midia.sha256,
        paginasPdf: midia.paginasPdf,
        legendaUsuario: legenda,
      },
      provider
    )

    if (!resDoc.ok) {
      return respostaPrivadaJson(
        {
          ok: false,
          code: resDoc.codigo,
          error: resDoc.mensagemUsuario,
          transitorio: resDoc.transitorio,
        },
        statusHttpDoCodigo(resDoc.codigo)
      )
    }

    const doc = resDoc.documento
    const naturezaSugerida: "DESPESA" | "DIVIDA" =
      doc.efeitoFinanceiro === "OBRIGACAO_NAO_PAGA" ? "DIVIDA" : "DESPESA"

    const contraparte = doc.fornecedor ?? doc.emitente ?? null
    const descricaoPadrao =
      doc.textoResumo?.slice(0, 120) ||
      doc.itens?.[0]?.descricao ||
      (contraparte
        ? `${rotuloTipoDocumento(doc.tipoDocumento)} · ${contraparte}`
        : rotuloTipoDocumento(doc.tipoDocumento))

    const proposta: PropostaMultimodalExtraida = {
      naturezaSugerida,
      descricao: descricaoPadrao,
      valorCentavos: doc.valorTotalCentavos ?? null,
      ...(doc.valoresCandidatosCentavos && doc.valoresCandidatosCentavos.length > 0
        ? { valoresCandidatosCentavos: doc.valoresCandidatosCentavos }
        : {}),
      data: doc.data ?? hoje,
      vencimento: doc.vencimento ?? null,
      formaPagamento: mapearFormaPagamento(doc.formaPagamento),
      contraparte,
      contaSugeridaNome: null,
      categoriaSugeridaNome: null,
      numeroDocumento: doc.numeroDocumento ?? null,
      identificadorTransacao: doc.identificadorTransacao ?? null,
      ...(doc.naturezaMercadoria ? { naturezaMercadoria: true } : {}),
    }

    const candidatosDuplicidade = await duplicidadeG005
      .buscarCandidatos(authRes.contexto, {
        sha256: midia.sha256,
        identificadorTransacao: doc.identificadorTransacao,
        numeroDocumento: doc.numeroDocumento,
        valorCentavos: doc.valorTotalCentavos,
        dataReferencia: doc.data ?? doc.vencimento ?? hoje,
        contraparte: contraparte ?? undefined,
      })
      .catch(() => [])

    const avisosAdicionais: string[] = []
    if (doc.legibilidade === "PARCIAL") {
      avisosAdicionais.push(
        "Legibilidade parcial detectada: confira todos os campos extraídos antes de confirmar."
      )
    }
    if (doc.valoresCandidatosCentavos && doc.valoresCandidatosCentavos.length > 1) {
      avisosAdicionais.push(
        "O documento apresentou mais de um valor plausível. Selecione manualmente o valor correto."
      )
    }
    if (doc.naturezaMercadoria) {
      avisosAdicionais.push(
        "Compra de mercadoria/peças identificada: este lançamento registra apenas o efeito financeiro e não altera estoque automaticamente."
      )
    }
    if (!storageDiag.runtimeLiberado) {
      avisosAdicionais.push(
        "Processamento temporário apenas: o arquivo foi descartado da memória após leitura; o arquivamento permanente privado (G003-STORAGE) está bloqueado neste ambiente."
      )
    }

    const resultado: AnaliseMultimodalResultado = {
      tipo: "documento",
      provedor: resDoc.provedor,
      homologado: resDoc.homologado,
      sha256: resDoc.sha256,
      mimeReal: resDoc.mime,
      tamanhoBytes: resDoc.tamanhoBytes,
      ...(resDoc.paginasPdf !== undefined ? { paginasPdf: resDoc.paginasPdf } : {}),
      tipoDocumento: doc.tipoDocumento,
      efeitoFinanceiro: doc.efeitoFinanceiro,
      legibilidade: doc.legibilidade,
      textoResumo: doc.textoResumo,
      ...(doc.itens ? { itens: doc.itens } : {}),
      avisoHonestidade: resDoc.avisoHonestidade,
      avisosAdicionais,
      proposta,
      candidatosDuplicidade,
      storagePermanenteDisponivel: storageDiag.runtimeLiberado,
      storagePermanenteMotivo: storageDiag.motivo,
    }

    return respostaPrivadaJson({ ok: true, resultado }, 200)
  } finally {
    midia.descartar()
  }
}
