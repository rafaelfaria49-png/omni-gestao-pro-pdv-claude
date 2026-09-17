/**
 * Interpretação server-side de texto livre de Produto (CAD-R2-016).
 *
 * Orquestra: validação do texto → extração determinística (âncora de
 * evidência) → chamada ao LLM (OpenRouter primário, fallback OpenAI/Gemini
 * via infra existente) → validação determinística do payload do modelo
 * (saída do modelo é NÃO-CONFIÁVEL por definição) → sugestão tipada.
 *
 * Garantias (impostas por código + teste):
 * - Secrets somente no servidor (Authorization server-side; resposta nunca
 *   contém chave, URL, prompt ou resposta bruta);
 * - timeout por tentativa + degradação determinística honesta (backend
 *   "local-deterministico" + aviso) em vez de 500 opaco;
 * - erros sanitizados (códigos fechados; corpo/URL jamais em log ou resposta);
 * - schema fechado: chaves desconhecidas e campos proibidos (fiscais vindos
 *   do LLM, metadata, ids, scores) são REJEITADOS e listados em `rejeitados`;
 * - sensíveis do LLM só entram com âncora textual (ver textoAncoraCampo);
 * - NENHUMA chamada Prisma/Produto, NENHUMA mutação StockLedger, NENHUM write.
 */

import { llmJsonCompletion } from "@/lib/llm-json"
import { resolveLlmEnv } from "@/lib/resolve-llm-env"
import { normalizeProdutoIdentifier } from "@/lib/cadastros/produto-upsert-metadata"
import {
  LIMITES_TEXTO_LIVRE,
  type BackendTextoLivre,
  type NomeCampoTextoLivre,
  type SugestaoTextoLivre,
} from "./types"
import { extrairDeterministico, textoAncoraCampo } from "./extracao-deterministica"

const TIMEOUT_OPENROUTER_MS = 15000
const TIMEOUT_ETAPA_LLM_MS = 25000

/** Model exibido como proveniência no fallback (labels da infra existente). */
const MODELO_FALLBACK: Record<"gemini" | "openai", string> = {
  gemini: "gemini-2.0-flash",
  openai: "gpt-4o-mini",
}

/** Erros sanitizados que atravessam para a Server Action (sem detalhe interno). */
export const ERRO_TEXTO_VAZIO = "Descreva o produto antes de interpretar."
export const ERRO_TEXTO_LONGO =
  "Texto muito longo — resuma em até 2000 caracteres e tente de novo."
export const AVISO_IA_INDISPONIVEL =
  "IA indisponível no momento — sugestão gerada por extração local do texto. Revise com atenção."

function chaveOpenRouter(): string {
  const k = process.env.OPENROUTER_API_KEY
  return typeof k === "string" ? k.replace(/^[\s'"]+|[\s'"]+$/g, "").trim() : ""
}

function modeloOpenRouter(): string {
  return (process.env.OPENROUTER_NATURAL_TEXT_MODEL || "").trim() || "openrouter/auto"
}

function fetchComTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer))
}

const SYS_TEXTO_LIVRE = `Você interpreta a descrição de UM produto em português do Brasil para PRÉ-preencher um cadastro de loja (peças/acessórios de celular e informática).
Responda APENAS um objeto JSON válido, sem markdown, sem texto extra, com EXATAMENTE estas chaves (valor ou null):
{"nome","marca","categoria","descricao","preco","custo","estoque","fornecedor","sku","ean","garantia_dias"}
Regras rígidas:
- "nome": nome curto do produto mencionado (ex.: "Película 3D iPhone 15"). null se incompreensível.
- "marca"/"categoria"/"descricao": deduza livremente do contexto. Categoria curta (ex.: "Películas", "Carregadores", "Capinhas"). Descricao: frase comercial curta.
- "preco"/"custo"/"estoque"/"fornecedor"/"sku"/"ean"/"garantia_dias": preencha SOMENTE com valores declarados EXPLICITAMENTE no texto; senão null. NUNCA invente estes valores.
- "garantia_dias": converta para dias (mês=30, ano=365).
- NUNCA preencha dados fiscais (NCM/CEST não existem neste contrato).
- Números com ponto decimal (ex.: 39.9). "estoque"/"garantia_dias" inteiros.`

function extrairJsonSeguro(raw: string): Record<string, unknown> {
  const t = (raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
  const ini = t.indexOf("{")
  const fim = t.lastIndexOf("}")
  if (ini === -1 || fim === -1 || fim <= ini) throw new Error("LLM_BAD_JSON")
  const parsed: unknown = JSON.parse(t.slice(ini, fim + 1))
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("LLM_BAD_JSON")
  return parsed as Record<string, unknown>
}

async function completarViaOpenRouter(system: string, texto: string): Promise<string> {
  const key = chaveOpenRouter()
  if (!key) throw new Error("OPENROUTER_KEY_MISSING")
  const model = modeloOpenRouter()
  let res: Response
  try {
    res = await fetchComTimeout(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          "X-Title": "omni-gestao-cadastros",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 500,
          messages: [
            { role: "system", content: system },
            { role: "user", content: texto },
          ],
        }),
      },
      TIMEOUT_OPENROUTER_MS,
    )
  } catch (e) {
    // Abort/timeout/rede: código fechado, sem ecoar URL (a URL do Gemini
    // carrega a chave na query — nada de erro bruto atravessa).
    if (e instanceof Error && e.name === "AbortError") throw new Error("LLM_TIMEOUT")
    throw new Error("LLM_REDE")
  }
  const raw = await res.text().catch(() => "")
  if (!res.ok) throw new Error(`LLM_HTTP_${res.status}`)
  try {
    const data = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> }
    const content = String(data.choices?.[0]?.message?.content ?? "").trim()
    if (!content) throw new Error("LLM_EMPTY")
    return content
  } catch (e) {
    if (e instanceof Error && (e.message === "LLM_EMPTY" || e.message.startsWith("LLM_"))) throw e
    throw new Error("LLM_BAD_JSON")
  }
}

export type DepsInterpretacao = {
  /** Injeção para testes herméticos (sem rede). */
  chamarModelo?: (system: string, texto: string) => Promise<Record<string, unknown>>
  agora?: () => Date
  /** Origem da captura (CAD-R2-017). Default `text`. Nunca persiste transcript. */
  captureSource?: "text" | "voice"
}

type ResultadoLlm = { payload: Record<string, unknown>; backend: BackendTextoLivre; model: string | null }

async function chamarLlm(texto: string, deps?: DepsInterpretacao): Promise<ResultadoLlm | null> {
  if (deps?.chamarModelo) {
    try {
      const payload = await deps.chamarModelo(SYS_TEXTO_LIVRE, texto)
      return { payload, backend: "openrouter", model: modeloOpenRouter() }
    } catch (e) {
      const codigo = e instanceof Error ? e.message.slice(0, 32) : "LLM_UNAVAILABLE"
      console.error(`[natural-text] IA indisponível (${codigo}) — extração local`)
      return null
    }
  }
  const etapa = (async (): Promise<ResultadoLlm> => {
    try {
      const content = await completarViaOpenRouter(SYS_TEXTO_LIVRE, texto)
      return { payload: extrairJsonSeguro(content), backend: "openrouter", model: modeloOpenRouter() }
    } catch {
      // Fallback existente (Gemini → OpenAI conforme env). Erro sanitizado:
      // só o código atravessa; corpo/URL/chave jamais.
      const env = resolveLlmEnv()
      if (!env.ok) throw new Error("LLM_UNAVAILABLE")
      const payload = await llmJsonCompletion(SYS_TEXTO_LIVRE, texto)
      return { payload, backend: env.backend, model: MODELO_FALLBACK[env.backend] }
    }
  })()
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("LLM_TIMEOUT")), TIMEOUT_ETAPA_LLM_MS)
  })
  try {
    return await Promise.race([etapa, timeout])
  } catch (e) {
    // Degradação honesta: loga SÓ o código, nunca corpo/URL/segredo.
    const codigo = e instanceof Error ? e.message.slice(0, 32) : "LLM_UNAVAILABLE"
    console.error(`[natural-text] IA indisponível (${codigo}) — extração local`)
    return null
  }
}

/* ── Validação determinística do payload do modelo (não-confiável) ── */

/** Aliases PT/EN → chave canônica. Fora daqui = rejeitado. */
const ALIASES_MODELO: Record<string, NomeCampoTextoLivre> = {
  nome: "nome",
  name: "nome",
  titulo: "nome",
  marca: "marca",
  brand: "marca",
  categoria: "categoria",
  category: "categoria",
  descricao: "descricao",
  description: "descricao",
  caracteristicas: "descricao",
  preco: "preco",
  preco_venda: "preco",
  precovenda: "preco",
  price: "preco",
  valor_venda: "preco",
  custo: "custo",
  preco_custo: "custo",
  precocusto: "custo",
  cost: "custo",
  valor_custo: "custo",
  estoque: "estoque",
  quantidade_estoque: "estoque",
  quantidade: "estoque",
  stock: "estoque",
  fornecedor: "fornecedor",
  supplier: "fornecedor",
  sku: "sku",
  codigo: "sku",
  ean: "ean",
  barcode: "ean",
  codigoBarras: "ean",
  codigo_barras: "ean",
  gtin: "ean",
  garantia: "garantia",
  garantia_dias: "garantia",
  warranty: "garantia",
}

/** Chaves que o modelo NUNCA pode fornecer (fiscais, ids, metadata, scores). */
const CHAVES_PROIBIDAS_MODELO = new Set([
  "ncm",
  "cest",
  "cfop",
  "fiscal",
  "metadata",
  "metadados",
  "id",
  "storeid",
  "store_id",
  "produtoid",
  "active",
  "status",
  "imagem",
  "imagemurl",
  "imagem_url",
  "score",
  "confianca",
  "confidence",
  "confiabilidade",
  "prompt",
  "raw",
  "resposta",
  "pensamento",
])

function sanearTexto(valor: unknown, max: number): string | null {
  if (valor === null || valor === undefined) return null
  const t = String(valor)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  if (!t) return null
  return t.slice(0, max)
}

function sanearNumero(valor: unknown, max: number, inteiro: boolean): number | null {
  if (valor === null || valor === undefined || valor === "") return null
  let n: number
  if (typeof valor === "number") {
    n = valor
  } else if (typeof valor === "string") {
    const t = valor.trim().replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")
    if (!t) return null
    n = Number(t)
  } else {
    return null
  }
  if (!Number.isFinite(n) || n < 0 || n > max) return null
  return inteiro ? Math.trunc(n) : Math.round(n * 100) / 100
}

type PayloadSaneado = {
  valores: Partial<Record<NomeCampoTextoLivre, string | number>>
  rejeitados: string[]
}

function validarPayloadModelo(raw: Record<string, unknown>): PayloadSaneado {
  const valores: PayloadSaneado["valores"] = {}
  const rejeitados: string[] = []
  for (const [chave, bruto] of Object.entries(raw)) {
    const normalizada = chave.trim().toLowerCase()
    const canonica = ALIASES_MODELO[normalizada]
    if (!canonica) {
      rejeitados.push(chave)
      continue
    }
    if (CHAVES_PROIBIDAS_MODELO.has(normalizada)) {
      rejeitados.push(chave)
      continue
    }
    // NCM/CEST não existem em ALIASES (proibidos acima de qualquer forma).
    let saneado: string | number | null = null
    switch (canonica) {
      case "nome":
        saneado = sanearTexto(bruto, LIMITES_TEXTO_LIVRE.nomeMax)
        break
      case "marca":
        saneado = sanearTexto(bruto, LIMITES_TEXTO_LIVRE.marcaMax)
        break
      case "categoria":
        saneado = sanearTexto(bruto, LIMITES_TEXTO_LIVRE.categoriaMax)
        break
      case "descricao":
        saneado = sanearTexto(bruto, LIMITES_TEXTO_LIVRE.descricaoMax)
        break
      case "fornecedor":
        saneado = sanearTexto(bruto, LIMITES_TEXTO_LIVRE.fornecedorMax)
        break
      case "sku":
        saneado = normalizeProdutoIdentifier(typeof bruto === "string" ? bruto : String(bruto ?? ""))
        if (saneado && saneado.length > LIMITES_TEXTO_LIVRE.skuMax) saneado = null
        break
      case "ean":
        saneado = String(bruto ?? "").replace(/\D/g, "").slice(0, 14) || null
        break
      case "preco":
      case "custo":
        saneado = sanearNumero(bruto, LIMITES_TEXTO_LIVRE.precoMax, false)
        break
      case "estoque":
      case "garantia":
        saneado = sanearNumero(bruto, canonica === "estoque" ? LIMITES_TEXTO_LIVRE.estoqueMax : LIMITES_TEXTO_LIVRE.garantiaDiasMax, true)
        break
      case "ncm":
      case "cest":
        // Inalcançável via ALIASES (deny-list acima), mantido por exaustividade.
        rejeitados.push(chave)
        continue
    }
    if (saneado === null || saneado === "") {
      continue
    }
    // Primeira ocorrência vence; duplicata via alias vira rejeitada.
    if (canonica in valores) {
      rejeitados.push(chave)
      continue
    }
    valores[canonica] = saneado
  }
  return { valores, rejeitados }
}

/* ── Montagem da sugestão ── */

function contemVerbatim(texto: string, valor: string): boolean {
  const alvo = valor.trim().toLowerCase()
  if (alvo.length < 2) return false
  return texto.toLowerCase().includes(alvo)
}

/**
 * Interpreta o texto do operador e devolve a sugestão tipada temporária.
 * Server-side. Não grava banco, não toca Prisma/StockLedger.
 */
export async function interpretarTextoProduto(
  textoBruto: string,
  deps?: DepsInterpretacao,
): Promise<SugestaoTextoLivre> {
  const texto = (textoBruto ?? "").trim()
  if (!texto) throw new Error(ERRO_TEXTO_VAZIO)
  if (texto.length > LIMITES_TEXTO_LIVRE.textoMax) throw new Error(ERRO_TEXTO_LONGO)

  const det = extrairDeterministico(texto)
  const avisos: string[] = [...det.avisos]
  const rejeitados: string[] = []

  const llm = await chamarLlm(texto, deps)
  const degradadoLocal = llm === null
  if (degradadoLocal) avisos.push(AVISO_IA_INDISPONIVEL)
  const saneado = llm ? validarPayloadModelo(llm.payload) : { valores: {}, rejeitados: [] }
  rejeitados.push(...saneado.rejeitados)
  if (saneado.rejeitados.length > 0) {
    avisos.push(
      `IA sugeriu ${saneado.rejeitados.length} campo(s) fora do contrato — ignorados: ${saneado.rejeitados.slice(0, 5).join(", ")}.`,
    )
  }

  const camposExtraidos: NomeCampoTextoLivre[] = []
  const camposInferidos: NomeCampoTextoLivre[] = []
  const marcar = (campo: NomeCampoTextoLivre, estado: "extraido" | "inferido") => {
    if (estado === "extraido") camposExtraidos.push(campo)
    else camposInferidos.push(campo)
  }

  /* Seguros: LLM com origem por evidência; nome com fallback determinístico. */
  const montarTexto = (
    campo: NomeCampoTextoLivre,
    bruto: string | number | undefined,
  ): SugestaoTextoLivre["campos"]["nome"] => {
    if (typeof bruto !== "string" || !bruto.trim()) return { valor: null, estado: "ausente" }
    const valor = bruto.trim()
    if (contemVerbatim(texto, valor)) {
      marcar(campo, "extraido")
      return { valor, estado: "extraido" }
    }
    marcar(campo, "inferido")
    return { valor, estado: "inferido" }
  }

  const nomeLlm = saneado.valores.nome
  const nome =
    typeof nomeLlm === "string" && nomeLlm.trim()
      ? montarTexto("nome", nomeLlm)
      : (() => {
          // Fallback determinístico: as próprias palavras do operador, truncadas.
          const fallback = texto.replace(/\s+/g, " ").trim().slice(0, LIMITES_TEXTO_LIVRE.nomeMax)
          if (!fallback) return { valor: null, estado: "ausente" } as const
          marcar("nome", "inferido")
          avisos.push("Nome aproveitado do texto — revise antes de aplicar.")
          return { valor: fallback, estado: "inferido" } as const
        })()
  const marca = montarTexto("marca", saneado.valores.marca as string | undefined)
  const categoria = montarTexto("categoria", saneado.valores.categoria as string | undefined)
  const descricao = montarTexto("descricao", saneado.valores.descricao as string | undefined)

  /* Sensíveis: determinístico vence; LLM preenche lacuna SOMENTE com âncora. */
  const montarSensivelNumero = (
    campo: "preco" | "custo" | "estoque" | "garantia",
    detValor: { valor: number; evidencia: string; rotulado: boolean } | null,
    ambíguo: boolean,
    rotuloAviso: string,
  ): SugestaoTextoLivre["campos"]["preco"] => {
    if (detValor) {
      marcar(campo, "extraido")
      const llmValor = saneado.valores[campo]
      if (typeof llmValor === "number" && llmValor !== detValor.valor) {
        avisos.push(`IA divergiu em ${rotuloAviso} — mantido o valor declarado no texto.`)
      }
      if (!detValor.rotulado || ambíguo) return { valor: detValor.valor, estado: "ambiguo" }
      return { valor: detValor.valor, estado: "extraido" }
    }
    if (ambíguo) return { valor: null, estado: "ambiguo" }
    const llmValor = saneado.valores[campo]
    if (typeof llmValor === "number") {
      if (textoAncoraCampo(texto, campo, llmValor)) {
        marcar(campo, "extraido")
        return { valor: llmValor, estado: "extraido" }
      }
      avisos.push(`${rotuloAviso} sugerido pela IA sem evidência no texto — ignorado.`)
      rejeitados.push(campo)
      return { valor: null, estado: "ausente" }
    }
    return { valor: null, estado: "ausente" }
  }

  const montarSensivelTexto = (
    campo: "fornecedor" | "sku" | "ean",
    detValor: { valor: string; evidencia: string; rotulado: boolean } | null,
    ambíguo: boolean,
    rotuloAviso: string,
  ): SugestaoTextoLivre["campos"]["fornecedor"] => {
    if (detValor) {
      marcar(campo, "extraido")
      const llmValor = saneado.valores[campo]
      if (typeof llmValor === "string" && llmValor.trim() && llmValor.trim() !== detValor.valor) {
        avisos.push(`IA divergiu em ${rotuloAviso} — mantido o valor declarado no texto.`)
      }
      return { valor: detValor.valor, estado: "extraido" }
    }
    if (ambíguo) return { valor: null, estado: "ambiguo" }
    const llmValor = saneado.valores[campo]
    if (typeof llmValor === "string" && llmValor.trim()) {
      if (textoAncoraCampo(texto, campo, llmValor.trim())) {
        marcar(campo, "extraido")
        return { valor: llmValor.trim(), estado: "extraido" }
      }
      avisos.push(`${rotuloAviso} sugerido pela IA sem evidência no texto — ignorado.`)
      rejeitados.push(campo)
      return { valor: null, estado: "ausente" }
    }
    return { valor: null, estado: "ausente" }
  }

  const eAmbiguo = (c: "preco" | "custo" | "estoque" | "garantiaDias" | "sku" | "ean") =>
    det.ambiguos.includes(c)

  const preco = montarSensivelNumero("preco", det.preco, eAmbiguo("preco"), "Preço de venda")
  const custo = montarSensivelNumero("custo", det.custo, eAmbiguo("custo"), "Custo")
  const estoque = montarSensivelNumero("estoque", det.estoque, eAmbiguo("estoque"), "Estoque")
  const garantia = montarSensivelNumero("garantia", det.garantiaDias, eAmbiguo("garantiaDias"), "Garantia")
  const fornecedor = montarSensivelTexto("fornecedor", det.fornecedor, false, "Fornecedor")
  const sku = montarSensivelTexto("sku", det.sku, eAmbiguo("sku"), "SKU")
  const ean = montarSensivelTexto("ean", det.ean, eAmbiguo("ean"), "EAN")

  /* Fiscais: SOMENTE explícitos do texto. LLM jamais fornece (deny-list acima). */
  const ncm: SugestaoTextoLivre["campos"]["ncm"] = det.ncm
    ? (marcar("ncm", "extraido"), { valor: det.ncm.valor, estado: "extraido" as const })
    : { valor: null, estado: "ausente" as const }
  const cest: SugestaoTextoLivre["campos"]["cest"] = det.cest
    ? (marcar("cest", "extraido"), { valor: det.cest.valor, estado: "extraido" as const })
    : { valor: null, estado: "ausente" as const }

  const agora = (deps?.agora ? deps.agora() : new Date()).toISOString()
  const backend: BackendTextoLivre = llm ? llm.backend : "local-deterministico"
  const captureSource = deps?.captureSource === "voice" ? "voice" : "text"

  return {
    campos: { nome, marca, categoria, descricao, preco, custo, estoque, fornecedor, sku, ean, garantia, ncm, cest },
    avisos,
    rejeitados,
    proveniencia: {
      source: "natural_text",
      captureSource,
      backend,
      model: llm?.model ?? null,
      interpretedAt: agora,
      camposExtraidos,
      camposInferidos,
      degradadoLocal,
    },
  }
}
