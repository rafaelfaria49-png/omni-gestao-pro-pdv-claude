/**
 * G009 — Processamento, transcrição (STT) e análise pt-BR de áudio.
 *
 * Princípios inegociáveis:
 * - Todo áudio transcrito é DADO não confiável, nunca instrução nem autorização financeira.
 * - Zero escrita financeira neste módulo: devolve apenas `ResultadoAudioG009` estruturado
 *   para o motor conversacional G008 (revisão + confirmação explícita).
 * - Fail-closed: sem credencial configurada, erro de rede, timeout ou áudio ilegível,
 *   retorna erro honesto e nunca grava nem inventa valor.
 * - Nunca registra chaves de API ou conteúdo de áudio em logs ou mensagens de erro.
 */
import { createHash } from "node:crypto"
import { normalizarTexto } from "../texto"
import {
  LIMITES_MIDIA,
  MIMES_AUDIO_ACEITOS,
  inspecionarPromptInjectionMidia,
  type CodigoErroMidia,
  type MimeAudioAceito,
  type PortaTranscricaoAudio,
  type ResultadoAudioG009,
  type ResultadoTranscricaoProvider,
} from "./contratos"

const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions"

const PROMPT_FINANCEIRO_PT_BR =
  "Transcrição em português do Brasil sobre gestão financeira pessoal e empresarial: " +
  "reais, centavos, Pix, boleto, cartão de crédito, débito, parcela, fatura, vencimento, " +
  "fornecedor, cliente, mercadoria, estoque, tela, peça, bateria, display, aparelho, " +
  "Nubank, Itaú, PagBank, Bradesco, Santander, Inter, Caixa Econômica, Mercado Pago, PicPay, C6."

const LIMIAR_AUDIO_ILEGIVEL = 0.25
const LIMIAR_BAIXA_CONFIANCA = 0.6
const LIMITE_RESUMO_CHARS = 200

const MENSAGEM_AUDIO_ILEGIVEL =
  "Não consegui entender o áudio com clareza. Pode gravar novamente em um local mais silencioso ou enviar por texto? Nada foi registrado."

const MENSAGEM_INJECAO =
  "O áudio contém instruções incompatíveis com o registro financeiro seguro e foi bloqueado. Envie apenas os dados do lançamento desejado. Nada foi registrado."

function mensagemPadraoErroProvider(codigo: CodigoErroMidia): string {
  switch (codigo) {
    case "PROVEDOR_INDISPONIVEL":
      return "A transcrição de áudio não está disponível neste ambiente no momento. Envie a mensagem por texto para continuar. Nada foi registrado."
    case "PROVEDOR_TIMEOUT":
      return "A transcrição do áudio demorou mais do que o esperado. Tente enviar novamente ou mande por texto. Nada foi registrado."
    case "PROVEDOR_ERRO_TEMPORARIO":
      return "O serviço de transcrição de áudio está temporariamente indisponível. Tente novamente em instantes ou envie por texto. Nada foi registrado."
    default:
      return "Não foi possível transcrever este áudio. Tente gravar novamente ou envie por texto. Nada foi registrado."
  }
}

// ─── Provider real: OpenAI Whisper API (mesmo provedor de lib/transcribe-openai.ts) ──

export function criarProviderTranscricaoOpenAI(
  env?: Record<string, string | undefined>,
  deps?: { fetchFn?: typeof fetch; timeoutMs?: number }
): PortaTranscricaoAudio {
  const ambiente = env ?? process.env
  const apiKey = ambiente.OPENAI_API_KEY?.trim() ?? ""
  const configurado = Boolean(apiKey)
  const homologado = ambiente.GESTOR_MONEY_AUDIO_STT_HOMOLOGADO === "true" && configurado
  const fetchFn = deps?.fetchFn ?? fetch
  const timeoutMs =
    deps?.timeoutMs !== undefined && Number.isFinite(deps.timeoutMs) && deps.timeoutMs > 0
      ? deps.timeoutMs
      : LIMITES_MIDIA.TIMEOUT_PROVIDER_MS

  return {
    id: configurado ? "OPENAI_WHISPER" : "INDISPONIVEL",
    homologado,
    async transcrever(input): Promise<ResultadoTranscricaoProvider> {
      if (!configurado) {
        return {
          ok: false,
          codigo: "PROVEDOR_INDISPONIVEL",
          transitorio: false,
          mensagemUsuario: mensagemPadraoErroProvider("PROVEDOR_INDISPONIVEL"),
        }
      }

      if (input.signal?.aborted) {
        return {
          ok: false,
          codigo: "PROVEDOR_TIMEOUT",
          transitorio: true,
          mensagemUsuario: mensagemPadraoErroProvider("PROVEDOR_TIMEOUT"),
        }
      }

      const controller = new AbortController()
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeoutMs)

      const onExternalAbort = () => controller.abort()
      input.signal?.addEventListener("abort", onExternalAbort, { once: true })

      try {
        const form = new FormData()
        form.append(
          "file",
          new Blob([new Uint8Array(input.bytes)], { type: input.mime }),
          input.nomeArquivo
        )
        form.append("model", "whisper-1")
        form.append("language", "pt")
        form.append("prompt", PROMPT_FINANCEIRO_PT_BR)

        const res = await fetchFn(OPENAI_TRANSCRIPTIONS_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal: controller.signal,
        })

        if (res.status === 429 || res.status >= 500) {
          return {
            ok: false,
            codigo: "PROVEDOR_ERRO_TEMPORARIO",
            transitorio: true,
            mensagemUsuario: mensagemPadraoErroProvider("PROVEDOR_ERRO_TEMPORARIO"),
          }
        }

        if (!res.ok) {
          return {
            ok: false,
            codigo: "PROVEDOR_RESPOSTA_INVALIDA",
            transitorio: false,
            mensagemUsuario: mensagemPadraoErroProvider("PROVEDOR_RESPOSTA_INVALIDA"),
          }
        }

        let payload: { text?: unknown; duration?: unknown; confidence?: unknown }
        try {
          payload = (await res.json()) as {
            text?: unknown
            duration?: unknown
            confidence?: unknown
          }
        } catch {
          return {
            ok: false,
            codigo: "PROVEDOR_RESPOSTA_INVALIDA",
            transitorio: false,
            mensagemUsuario: mensagemPadraoErroProvider("PROVEDOR_RESPOSTA_INVALIDA"),
          }
        }

        if (typeof payload?.text !== "string") {
          return {
            ok: false,
            codigo: "PROVEDOR_RESPOSTA_INVALIDA",
            transitorio: false,
            mensagemUsuario: mensagemPadraoErroProvider("PROVEDOR_RESPOSTA_INVALIDA"),
          }
        }

        const duracaoSegundos =
          typeof payload.duration === "number" &&
          Number.isFinite(payload.duration) &&
          payload.duration > 0
            ? payload.duration
            : input.duracaoSegundos

        const confianca =
          typeof payload.confidence === "number" &&
          Number.isFinite(payload.confidence) &&
          payload.confidence >= 0 &&
          payload.confidence <= 1
            ? payload.confidence
            : undefined

        return {
          ok: true,
          transcricao: payload.text.trim().slice(0, LIMITES_MIDIA.MAX_TEXTO_TRANSCRICAO),
          idioma: "pt-BR",
          ...(confianca !== undefined ? { confianca } : {}),
          ...(duracaoSegundos !== undefined ? { duracaoSegundos } : {}),
          provedor: "OPENAI_WHISPER",
          homologado,
        }
      } catch (err) {
        const ehAbort =
          timedOut ||
          controller.signal.aborted ||
          (err instanceof Error && err.name === "AbortError")
        if (ehAbort) {
          return {
            ok: false,
            codigo: "PROVEDOR_TIMEOUT",
            transitorio: true,
            mensagemUsuario: mensagemPadraoErroProvider("PROVEDOR_TIMEOUT"),
          }
        }
        return {
          ok: false,
          codigo: "PROVEDOR_ERRO_TEMPORARIO",
          transitorio: true,
          mensagemUsuario: mensagemPadraoErroProvider("PROVEDOR_ERRO_TEMPORARIO"),
        }
      } finally {
        clearTimeout(timer)
        input.signal?.removeEventListener("abort", onExternalAbort)
      }
    },
  }
}

// ─── Provider simulado (exclusivo para testes — nunca homologado) ──────────

export type RespostaAudioSimulado =
  | string
  | {
      transcricao: string
      confianca?: number
      duracaoSegundos?: number
    }
  | {
      erro:
        | "PROVEDOR_INDISPONIVEL"
        | "PROVEDOR_TIMEOUT"
        | "PROVEDOR_ERRO_TEMPORARIO"
        | "PROVEDOR_RESPOSTA_INVALIDA"
      transitorio?: boolean
      mensagemUsuario?: string
    }

export function criarProviderTranscricaoSimulado(
  respostas: Record<string, RespostaAudioSimulado>
): PortaTranscricaoAudio {
  return {
    id: "SIMULADO",
    homologado: false,
    async transcrever(input): Promise<ResultadoTranscricaoProvider> {
      if (input.signal?.aborted) {
        return {
          ok: false,
          codigo: "PROVEDOR_TIMEOUT",
          transitorio: true,
          mensagemUsuario: mensagemPadraoErroProvider("PROVEDOR_TIMEOUT"),
        }
      }

      const sha256 = createHash("sha256").update(input.bytes).digest("hex")
      const entrada =
        respostas[input.nomeArquivo] ?? respostas[sha256] ?? respostas["*"]

      if (entrada === undefined) {
        return {
          ok: false,
          codigo: "PROVEDOR_RESPOSTA_INVALIDA",
          transitorio: false,
          mensagemUsuario:
            "Nenhuma transcrição simulada encontrada para este áudio. Nada foi registrado.",
        }
      }

      if (typeof entrada === "object" && "erro" in entrada) {
        const transitorio =
          entrada.transitorio ??
          (entrada.erro === "PROVEDOR_TIMEOUT" ||
            entrada.erro === "PROVEDOR_ERRO_TEMPORARIO")
        return {
          ok: false,
          codigo: entrada.erro,
          transitorio,
          mensagemUsuario:
            entrada.mensagemUsuario ?? mensagemPadraoErroProvider(entrada.erro),
        }
      }

      if (typeof entrada === "string") {
        return {
          ok: true,
          transcricao: entrada.trim().slice(0, LIMITES_MIDIA.MAX_TEXTO_TRANSCRICAO),
          idioma: "pt-BR",
          ...(input.duracaoSegundos !== undefined
            ? { duracaoSegundos: input.duracaoSegundos }
            : {}),
          provedor: "SIMULADO",
          homologado: false,
        }
      }

      const duracaoSegundos = entrada.duracaoSegundos ?? input.duracaoSegundos
      return {
        ok: true,
        transcricao: entrada.transcricao
          .trim()
          .slice(0, LIMITES_MIDIA.MAX_TEXTO_TRANSCRICAO),
        idioma: "pt-BR",
        ...(entrada.confianca !== undefined ? { confianca: entrada.confianca } : {}),
        ...(duracaoSegundos !== undefined ? { duracaoSegundos } : {}),
        provedor: "SIMULADO",
        homologado: false,
      }
    },
  }
}

// ─── Análise linguística pt-BR de áudio para o motor G008 ──────────────────

export type SinaisAudioPtBr = {
  textoNormalizadoParaMotor: string
  quantidadeItens?: number
  naturezaMercadoria: boolean
  transferenciaEntreDominios?: boolean
}

const CARDINAIS_QTD: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
}

const ITENS_MERCADORIA_SEM_ACENTO = [
  "tela",
  "telas",
  "peca",
  "pecas",
  "mercadoria",
  "mercadorias",
  "estoque",
  "bateria",
  "baterias",
  "display",
  "displays",
  "aparelho",
  "aparelhos",
  "celular",
  "celulares",
  "carregador",
  "carregadores",
  "pelicula",
  "peliculas",
  "capinha",
  "capinhas",
  "conector",
  "conectores",
  "placa",
  "placas",
  "modulo",
  "modulos",
  "componente",
  "componentes",
  "reposicao",
] as const

const SET_ITENS_MERCADORIA = new Set<string>(ITENS_MERCADORIA_SEM_ACENTO)

const PALAVRA_QTD_REGEX =
  "(?:\\d{1,3}|meia\\s+d[uú]zia|uma\\s+d[uú]zia|(?:vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa)(?:\\s+e\\s+(?:um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove))?|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem)"

const ITEM_MERCADORIA_REGEX =
  "(?:telas?|pe[çc]as?|mercadorias?|estoques?|baterias?|displays?|aparelhos?|celulares?|carregadores?|pel[íi]culas?|capinhas?|conectores?|placas?|m[óo]dulos?|componentes?)"

const REGEX_QTD_ITEM = new RegExp(
  `(?<![A-Za-zÀ-ÿ0-9])(${PALAVRA_QTD_REGEX})\\s+(${ITEM_MERCADORIA_REGEX})(?![A-Za-zÀ-ÿ0-9])`,
  "i"
)

const PALAVRA_VALOR_EXTENSO =
  "(?:zero|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|duzentas|trezentos|trezentas|quatrocentos|quatrocentas|quinhentos|quinhentas|seiscentos|seiscentas|setecentos|setecentas|oitocentos|oitocentas|novecentos|novecentas|mil)"

const REGEX_PRECO_APOS_POR_SEM_MOEDA = new RegExp(
  `(?<![A-Za-zÀ-ÿ0-9])(por|no\\s+valor\\s+de|total\\s+de|custou|saiu\\s+por)\\s+(?!r\\$)((?:\\d{1,3}(?:\\.\\d{3})*(?:,\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?|(?:${PALAVRA_VALOR_EXTENSO})(?:(?:\\s+e\\s+|\\s+)(?:${PALAVRA_VALOR_EXTENSO}))*))(?![A-Za-zÀ-ÿ0-9]|[.,]\\d)`,
  "i"
)

const REGEX_MARCADOR_MOEDA = /\b(reais|real|conto|contos|pila|pilas|mil|k)\b|r\$/i

function parseQuantidadePtBr(bruto: string): number | null {
  const norm = normalizarTexto(bruto)
  if (/^\d{1,3}$/.test(norm)) {
    const n = Number(norm)
    return n >= 1 && n <= 999 ? n : null
  }
  if (norm === "meia duzia") return 6
  if (norm === "uma duzia") return 12
  const partes = norm.split(/\s+/).filter((p) => p !== "e")
  if (!partes.length) return null
  let total = 0
  for (const p of partes) {
    const v = CARDINAIS_QTD[p]
    if (v === undefined) return null
    total += v
  }
  return total >= 1 && total <= 999 ? total : null
}

function detectarMercadoria(textoNorm: string): boolean {
  // Evita falso positivo em "conta de celular" / "plano de celular" / "fatura do celular"
  const semContaCelular = textoNorm.replace(
    /\b(?:conta|plano|recarga|fatura|credito)\s+(?:de|do|da)\s+celular\b/g,
    " "
  )
  const tokens = semContaCelular.split(/\s+/)
  return tokens.some((t) => SET_ITENS_MERCADORIA.has(t))
}

const REGEX_TRANSFERENCIA_VERBO =
  /\b(transferi\w*|transferencia|passei|passar|movi|mover|mandei|mandar|joguei|jogar|retirei|retirar|pro[\s-]?labore)\b/

const REGEX_MARCADOR_PESSOAL =
  /\b(pessoal|particular|minha conta pessoal|conta pessoal|pessoa fisica|pf|cpf|meu bolso|minha casa|pra casa|para casa|vida pessoal)\b/

const REGEX_MARCADOR_EMPRESA =
  /\b(empresa|empresarial|conta da empresa|conta juridica|pessoa juridica|pj|cnpj|firma|negocio|minha loja|nossa loja|da loja|pra loja|para a loja|caixa da loja|filial)\b/

const REGEX_CONTA_OU_BANCO =
  /\b(nubank|nu|roxinho|itau|bradesco|santander|banco do brasil|bb|caixa economica|cef|caixa|inter|c6|sicoob|sicredi|mercado pago|picpay|pagbank|pagseguro|poupanca|carteira|conta|maquininha)\b/

function detectarTransferenciaEntreDominios(textoNorm: string): boolean {
  if (!REGEX_TRANSFERENCIA_VERBO.test(textoNorm)) return false

  const temPessoalGlobal = REGEX_MARCADOR_PESSOAL.test(textoNorm)
  const temEmpresaGlobal = REGEX_MARCADOR_EMPRESA.test(textoNorm)

  // Ambos os domínios explícitos na mesma transferência (ex.: "da empresa para o pessoal")
  if (temPessoalGlobal && temEmpresaGlobal) return true

  // Pró-labore / retirada explícita para conta pessoal
  if (/\bpro[\s-]?labore\b/.test(textoNorm) && temPessoalGlobal) return true

  const split = textoNorm.split(/\b(?:para|pra|pro)\b/)
  if (split.length < 2) return false

  const parteOrigem = split[0]
  const parteDestino = split.slice(1).join(" para ")

  const origemPessoal = REGEX_MARCADOR_PESSOAL.test(parteOrigem)
  const origemEmpresa = REGEX_MARCADOR_EMPRESA.test(parteOrigem)
  const destinoPessoal = REGEX_MARCADOR_PESSOAL.test(parteDestino)
  const destinoEmpresa = REGEX_MARCADOR_EMPRESA.test(parteDestino)

  // Origem e destino com domínios opostos
  if ((origemPessoal && destinoEmpresa) || (origemEmpresa && destinoPessoal)) {
    return true
  }

  // Origem é uma conta (ex.: "do PagBank") e destino explicita "conta pessoal" sem origem marcada como pessoal
  const origemTemConta =
    /\b(?:do|da|de)\s+/.test(parteOrigem) && REGEX_CONTA_OU_BANCO.test(parteOrigem)
  const destinoTemConta = REGEX_CONTA_OU_BANCO.test(parteDestino)

  if (destinoPessoal && !origemPessoal && origemTemConta) return true
  if (origemPessoal && !destinoPessoal && destinoTemConta) return true
  if (destinoEmpresa && !origemEmpresa && origemTemConta) return true
  if (origemEmpresa && !destinoEmpresa && destinoTemConta) return true

  return false
}

/**
 * Analisa sinais linguísticos pt-BR da transcrição e prepara o texto para o motor G008:
 * - Mantém valores monetários, datas, fornecedores, meios de pagamento, parcelas, contas e cartões.
 * - Normaliza "<quantidade> <mercadoria>" (ex.: "duas telas" -> "2 telas", "uma peça" -> "1 peça")
 *   e impede colisão da quantidade como segundo valor monetário quando o preço omite "reais".
 * - Detecta natureza de mercadoria e transferência entre domínios (empresa <-> pessoal).
 */
export function analisarSinaisAudioPtBr(transcricao: string): SinaisAudioPtBr {
  const limpo = transcricao
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  // Remove hesitações puras no início da fala ("uh...", "hmm,") sem tocar palavras reais
  let textoParaMotor = limpo.replace(/^(?:(?:ah+|eh+|hm+|uh+|hum+)[,.\s…]+)+/i, "").trim()
  const norm = normalizarTexto(textoParaMotor)

  const naturezaMercadoria = detectarMercadoria(norm)
  const transferenciaEntreDominios = detectarTransferenciaEntreDominios(norm)

  let quantidadeItens: number | undefined

  const matchQtd = textoParaMotor.match(REGEX_QTD_ITEM)
  if (matchQtd && matchQtd.index !== undefined) {
    const antes = normalizarTexto(textoParaMotor.slice(0, matchQtd.index))
    const itemNorm = normalizarTexto(matchQtd[2])
    const ehContaCelular =
      (itemNorm === "celular" || itemNorm === "celulares") &&
      /\b(?:conta|plano|recarga|fatura|credito)\s+(?:de|do|da)$/.test(antes)

    if (!ehContaCelular) {
      const qtd = parseQuantidadePtBr(matchQtd[1])
      if (qtd !== null) {
        quantidadeItens = qtd
        // Mantém "<qtd> <item>" na descrição (ex.: "2 telas", "1 peça")
        textoParaMotor =
          textoParaMotor.slice(0, matchQtd.index) +
          `${qtd} ${matchQtd[2]}` +
          textoParaMotor.slice(matchQtd.index + matchQtd[0].length)

        // Se o preço após "por"/"no valor de" omitiu "reais"/"R$", qualifica com "reais"
        // para que o número da quantidade ("2" em "2 telas") não colida como 2º valor monetário.
        const matchPreco = textoParaMotor.match(REGEX_PRECO_APOS_POR_SEM_MOEDA)
        if (matchPreco && matchPreco.index !== undefined) {
          const fimMatch = matchPreco.index + matchPreco[0].length
          const sufixo = textoParaMotor.slice(fimMatch)
          const jaTemMoeda = /^\s*(?:reais|real|conto|contos|pila|pilas|mil|k)\b/i.test(sufixo)
          const ehParcela = /^\s*(?:x|vezes|parcelas|presta[çc][õo]es)\b/i.test(sufixo)
          const temMoedaGlobal = REGEX_MARCADOR_MOEDA.test(textoParaMotor)
          const temOuOutroValor = /^\s*(?:ou|e)\s+(?:\d|cem|cento|duzent|trezent|quatrocent|quinhent|mil)/i.test(
            sufixo
          )
          if (!jaTemMoeda && !ehParcela && !temMoedaGlobal && !temOuOutroValor) {
            textoParaMotor =
              textoParaMotor.slice(0, fimMatch) + " reais" + textoParaMotor.slice(fimMatch)
          }
        }
      }
    }
  }

  return {
    textoNormalizadoParaMotor: textoParaMotor,
    ...(quantidadeItens !== undefined ? { quantidadeItens } : {}),
    naturezaMercadoria,
    ...(transferenciaEntreDominios ? { transferenciaEntreDominios: true } : {}),
  }
}

// ─── Pipeline G009 completo (validação + STT + defesa + análise) ───────────

const TOKENS_RUIDO = new Set([
  "uh",
  "uhm",
  "hm",
  "hmm",
  "hmmm",
  "ah",
  "ahh",
  "eh",
  "ehh",
  "hum",
  "humm",
  "ha",
  "haa",
  "inaudivel",
  "ruido",
  "silencio",
  "barulho",
  "musica",
  "unintelligible",
  "noise",
  "silence",
  "music",
])

function ehTranscricaoIlegivel(transcricao: string, confianca?: number): boolean {
  if (confianca !== undefined && confianca < LIMIAR_AUDIO_ILEGIVEL) {
    return true
  }

  const semMarcadoresRuido = transcricao
    .replace(/\[[^\]]{1,40}\]/g, " ")
    .replace(/\((?:inaud[íi]vel|ru[íi]do|sil[êe]ncio|barulho|m[úu]sica|noise|silence|music|unintelligible)\)/gi, " ")
    .replace(/[….,!?;:\-–—"'`´~^*_]+/g, " ")
    .trim()

  const norm = normalizarTexto(semMarcadoresRuido)
  if (!norm) return true

  const apenasAlfanum = norm.replace(/[^a-z0-9]/g, "")
  if (apenasAlfanum.length < 3) return true

  const tokens = norm.split(/\s+/).filter(Boolean)
  if (tokens.length > 0 && tokens.every((t) => TOKENS_RUIDO.has(t))) {
    return true
  }

  return false
}

function resumirTranscricao(texto: string): string {
  const limpo = texto.replace(/\s+/g, " ").trim()
  if (limpo.length <= LIMITE_RESUMO_CHARS) return limpo
  return `${limpo.slice(0, LIMITE_RESUMO_CHARS - 1).trimEnd()}…`
}

export async function processarAudioG009(
  input: {
    bytes: Buffer
    mime: MimeAudioAceito
    nomeArquivo: string
    sha256: string
    duracaoSegundos?: number
    signal?: AbortSignal
  },
  provider: PortaTranscricaoAudio
): Promise<ResultadoAudioG009> {
  if (!input.bytes || input.bytes.length === 0) {
    return {
      ok: false,
      codigo: "CONTEUDO_INVALIDO",
      transitorio: false,
      mensagemUsuario:
        "O áudio recebido está vazio ou inválido. Grave novamente ou envie por texto. Nada foi registrado.",
    }
  }

  if (input.bytes.length > LIMITES_MIDIA.MAX_BYTES_AUDIO) {
    return {
      ok: false,
      codigo: "MIDIA_MUITO_GRANDE",
      transitorio: false,
      mensagemUsuario:
        "O áudio excede o tamanho máximo permitido (10 MB). Envie um áudio mais curto ou mande por texto. Nada foi registrado.",
    }
  }

  if (!(MIMES_AUDIO_ACEITOS as readonly string[]).includes(input.mime)) {
    return {
      ok: false,
      codigo: "MIME_NAO_SUPORTADO",
      transitorio: false,
      mensagemUsuario:
        "Formato de áudio não suportado. Envie em OGG, MP3, MP4, WAV, WEBM ou AMR, ou escreva por texto. Nada foi registrado.",
    }
  }

  if (input.duracaoSegundos !== undefined) {
    if (!Number.isFinite(input.duracaoSegundos) || input.duracaoSegundos < 0) {
      return {
        ok: false,
        codigo: "CONTEUDO_INVALIDO",
        transitorio: false,
        mensagemUsuario:
          "A duração informada para o áudio é inválida. Envie novamente ou escreva por texto. Nada foi registrado.",
      }
    }
    if (input.duracaoSegundos > LIMITES_MIDIA.MAX_DURACAO_AUDIO_SEG) {
      return {
        ok: false,
        codigo: "DURACAO_EXCEDIDA",
        transitorio: false,
        mensagemUsuario:
          "O áudio excede a duração máxima permitida (3 minutos). Envie um áudio mais curto ou escreva por texto. Nada foi registrado.",
      }
    }
  }

  const resultadoProvider = await provider.transcrever({
    bytes: input.bytes,
    mime: input.mime,
    nomeArquivo: input.nomeArquivo,
    duracaoSegundos: input.duracaoSegundos,
    signal: input.signal,
  })

  if (!resultadoProvider.ok) {
    return {
      ok: false,
      codigo: resultadoProvider.codigo,
      transitorio: resultadoProvider.transitorio,
      mensagemUsuario: resultadoProvider.mensagemUsuario,
    }
  }

  const duracaoFinal = resultadoProvider.duracaoSegundos ?? input.duracaoSegundos
  if (duracaoFinal !== undefined && duracaoFinal > LIMITES_MIDIA.MAX_DURACAO_AUDIO_SEG) {
    return {
      ok: false,
      codigo: "DURACAO_EXCEDIDA",
      transitorio: false,
      mensagemUsuario:
        "O áudio excede a duração máxima permitida (3 minutos). Envie um áudio mais curto ou escreva por texto. Nada foi registrado.",
    }
  }

  const transcricaoLimitada = resultadoProvider.transcricao
    .slice(0, LIMITES_MIDIA.MAX_TEXTO_TRANSCRICAO)
    .trim()

  if (ehTranscricaoIlegivel(transcricaoLimitada, resultadoProvider.confianca)) {
    return {
      ok: false,
      codigo: "AUDIO_ILEGIVEL",
      transitorio: false,
      mensagemUsuario: MENSAGEM_AUDIO_ILEGIVEL,
    }
  }

  const inspecao = inspecionarPromptInjectionMidia(transcricaoLimitada)
  if (inspecao.sinais.length > 0) {
    return {
      ok: false,
      codigo: "INJECAO_DETECTADA",
      transitorio: false,
      mensagemUsuario: MENSAGEM_INJECAO,
      sinaisInjecao: inspecao.sinais,
    }
  }

  const sinaisAudio = analisarSinaisAudioPtBr(inspecao.sanitizado)
  const baixaConfianca =
    resultadoProvider.confianca !== undefined &&
    resultadoProvider.confianca < LIMIAR_BAIXA_CONFIANCA

  return {
    ok: true,
    transcricao: inspecao.sanitizado,
    transcricaoSanitizada: sinaisAudio.textoNormalizadoParaMotor,
    resumoTranscricao: resumirTranscricao(inspecao.sanitizado),
    idioma: "pt-BR",
    ...(resultadoProvider.confianca !== undefined
      ? { confianca: resultadoProvider.confianca }
      : {}),
    ...(duracaoFinal !== undefined ? { duracaoSegundos: duracaoFinal } : {}),
    sha256: input.sha256,
    provedor: resultadoProvider.provedor,
    homologado: resultadoProvider.homologado,
    sinaisInjecao: [],
    baixaConfianca,
    ...(sinaisAudio.quantidadeItens !== undefined
      ? { quantidadeItens: sinaisAudio.quantidadeItens }
      : {}),
    ...(sinaisAudio.naturezaMercadoria ? { naturezaMercadoria: true } : {}),
  }
}
