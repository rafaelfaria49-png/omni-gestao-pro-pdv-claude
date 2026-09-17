/**
 * Interpretação de texto livre de Produto (CAD-R2-016) — contrato tipado.
 *
 * Fluxo canônico: texto do operador → interpretação server-side → sugestão
 * tipada e validada → preview editável no formulário → revisão humana →
 * ProductWriteService → StockLedger (quando aplicável).
 *
 * A IA NUNCA salva Produto diretamente. A sugestão é TEMPORÁRIA (em memória,
 * nunca persistida em tabela/model — sem CadastroDraft neste GOAL).
 *
 * Estados de incerteza (sem score numérico inventado):
 * - "extraido": valor declarado explicitamente no texto do operador;
 * - "inferido": dedução da IA sobre campos cadastrais seguros;
 * - "ausente": sem evidência no texto e sem inferência permitida;
 * - "ambiguo": há evidência, mas a atribuição exige confirmação do operador.
 *
 * Política de campos (imposta por código + teste, nunca por convenção):
 * - A IA pode inferir: nome, marca, categoria, descricao.
 * - Sensíveis (preco, custo, estoque, fornecedor, sku, ean, garantia) SÓ entram
 *   quando declarados explicitamente no texto. Nunca inventados.
 * - Fiscais (ncm, cest): nunca inventados; entram SOMENTE quando declarados
 *   explicitamente no texto (keyword + dígitos exatos). LLM nunca fornece.
 *
 * Coerência com CAD-R2-015 (sem forçar abstração inadequada): os mesmos
 * princípios — sugestão → revisão → write boundary, sem write direto, sem
 * payload bruto persistido, sem segredo fora do servidor, proveniência segura —
 * mas SEM registrar providers de texto na governança de barcode-lookup (outra
 * capability, outro contrato).
 */

/** Estado de um campo da sugestão. União fechada — nunca score numérico. */
export type OrigemCampoTextoLivre = "extraido" | "inferido" | "ausente" | "ambiguo"

/** Campos endereçáveis da sugestão. Contrato fechado — a IA não cria chaves. */
export type NomeCampoTextoLivre =
  | "nome"
  | "marca"
  | "categoria"
  | "descricao"
  | "preco"
  | "custo"
  | "estoque"
  | "fornecedor"
  | "sku"
  | "ean"
  | "garantia"
  | "ncm"
  | "cest"

/** Campos sensíveis: só com declaração explícita do operador. Nunca inventar. */
export const CAMPOS_SENSIVEIS_TEXTO_LIVRE: ReadonlyArray<NomeCampoTextoLivre> = [
  "preco",
  "custo",
  "estoque",
  "fornecedor",
  "sku",
  "ean",
  "garantia",
]

/** Campos que a IA pode inferir livremente (cadastrais seguros). */
export const CAMPOS_INFERIVEIS_TEXTO_LIVRE: ReadonlyArray<NomeCampoTextoLivre> = [
  "nome",
  "marca",
  "categoria",
  "descricao",
]

/** Fiscais: nunca inventados; só explícitos do texto (nunca do LLM). */
export const CAMPOS_FISCAIS_TEXTO_LIVRE: ReadonlyArray<NomeCampoTextoLivre> = ["ncm", "cest"]

/** Um campo da sugestão: valor saneado + estado. `valor: null` = sem proposta. */
export type CampoTextoLivre<T> = {
  valor: T | null
  estado: OrigemCampoTextoLivre
}

/** Backend que produziu a interpretação (proveniência segura, sem segredos). */
export type BackendTextoLivre = "openrouter" | "openai" | "gemini" | "local-deterministico"

/**
 * Como o texto chegou ao interpretador 016.
 * `text` = digitado; `voice` = transcrição temporária (CAD-R2-017).
 * Não persiste áudio nem transcript — só a origem da captura.
 */
export type CaptureSourceTextoLivre = "text" | "voice"

/**
 * Proveniência segura da sugestão. Contém APENAS: fonte, origem da captura,
 * backend/model (nomes, nunca chaves), instante e listas de campos. NUNCA
 * texto do operador, prompt bruto, resposta bruta do modelo ou áudio.
 *
 * Cadeia: captureSource → transcript (efêmero na UI) → source=natural_text.
 */
export type ProvenienciaTextoLivre = {
  source: "natural_text"
  /** Default canônico: texto digitado. Voz só quando a captura foi por microfone. */
  captureSource: CaptureSourceTextoLivre
  backend: BackendTextoLivre
  /** Nome do modelo (ex.: "openrouter/auto"). null no modo local. Sem segredos. */
  model: string | null
  interpretedAt: string
  camposExtraidos: NomeCampoTextoLivre[]
  camposInferidos: NomeCampoTextoLivre[]
  /** true quando nenhum LLM respondeu e só a extração local foi usada. */
  degradadoLocal: boolean
}

/**
 * Sugestão estruturada temporária. Não grava banco; "aplicar" significa
 * preencher o formulário local. Salvar continua via upsertProduto →
 * ProductWriteService → StockLedger.
 */
export type SugestaoTextoLivre = {
  campos: {
    nome: CampoTextoLivre<string>
    marca: CampoTextoLivre<string>
    categoria: CampoTextoLivre<string>
    descricao: CampoTextoLivre<string>
    preco: CampoTextoLivre<number>
    custo: CampoTextoLivre<number>
    /** Estoque inicial (criação). Em edição o formulário é somente leitura. */
    estoque: CampoTextoLivre<number>
    fornecedor: CampoTextoLivre<string>
    sku: CampoTextoLivre<string>
    ean: CampoTextoLivre<string>
    /** Garantia em dias. */
    garantia: CampoTextoLivre<number>
    ncm: CampoTextoLivre<string>
    cest: CampoTextoLivre<string>
  }
  /** Avisos/ambiguidades em linguagem operacional (união aberta de frases
   * determinísticas geradas pelo servidor — nunca texto livre do modelo). */
  avisos: string[]
  /** Chaves do payload do modelo descartadas (desconhecidas ou proibidas). */
  rejeitados: string[]
  proveniencia: ProvenienciaTextoLivre
}

/** Limites do contrato (saneamento determinístico). */
export const LIMITES_TEXTO_LIVRE = {
  textoMin: 1,
  textoMax: 2000,
  nomeMax: 120,
  marcaMax: 60,
  categoriaMax: 60,
  descricaoMax: 500,
  fornecedorMax: 120,
  skuMax: 40,
  precoMax: 9999999.99,
  estoqueMax: 999999,
  garantiaDiasMax: 3650,
} as const
