/**
 * Proveniência segura de sugestões externas (CAD-R2-015).
 *
 * Toda sugestão externa carrega, para auditoria:
 * - provider que respondeu;
 * - GTIN consultado;
 * - instante da consulta;
 * - campos sugeridos e campos efetivamente aplicados pelo operador;
 * - tentativas sanitizadas (só provedor/status/instante/tipo).
 *
 * Garantias:
 * - Payload bruto do provider NUNCA é persistido: `sugestoes` passa por
 *   filtrarSugestao (só campos do contrato normalizado que o provider pode
 *   sugerir).
 * - Trace sanitizado: cada tentativa carrega só {provedor,status,em,tipo?}.
 * - Nenhum segredo: guarda opcional via segredosConhecidos (server-side).
 * - Ao salvar produto, grava-se APENAS esta proveniência + os campos que o
 *   operador revisou/aplicou. O write continua sendo upsertProduto.
 */

import { filtrarSugestao, obterProvedor } from "./registry"
import { CAMPOS_PROIBIDOS_EXTERNOS } from "./types"
import { contemSegredo } from "./secrets"

/** Status auditável persistido (união fechada — nunca texto livre do provider). */
export type StatusLookupAuditavel = "encontrado" | "nao_encontrado" | "erro"

/** Status vindos da cadeia de lookup. */
export type StatusCadeiaBarcode =
  | "encontrado"
  | "nao_encontrado"
  | "limite_excedido"
  | "erro_config"
  | "erro"

/** Tentativa sanitizada — únicas chaves permitidas no trace. */
export type TentativaSanitizada = {
  provedor: string
  status: string
  em: string
  tipo?: string
}

/** Tipos de erro seguros (união fechada — nunca token/header/URL/body). */
const TIPOS_ERRO_SEGUROS = new Set(["timeout", "rede", "auth", "parse", "config"])

/** Status de tentativa conhecidos (união fechada). */
const STATUS_TENTATIVA_CONHECIDOS = new Set([
  "encontrado",
  "nao_encontrado",
  "limite_excedido",
  "erro",
])

/** Mapeia status da cadeia para o status auditável persistido. */
export function statusLookupAuditavel(status: StatusCadeiaBarcode): StatusLookupAuditavel {
  if (status === "encontrado" || status === "nao_encontrado") return status
  return "erro"
}

/** Sanitiza uma lista de tentativas: só chaves permitidas, tipos fechados. */
export function sanitizarTentativas(
  tentativas: Array<{ provedor: string; status: string; em: string; tipo?: unknown }>,
): TentativaSanitizada[] {
  return tentativas.map((t) => {
    const base: TentativaSanitizada = {
      provedor: String(t.provedor),
      status: STATUS_TENTATIVA_CONHECIDOS.has(t.status) ? t.status : "erro",
      em: String(t.em),
    }
    if (base.status === "erro" && typeof t.tipo === "string" && TIPOS_ERRO_SEGUROS.has(t.tipo)) {
      base.tipo = t.tipo
    }
    return base
  })
}

export type EntradaProvenienciaBarcode = {
  gtin: string
  formato: string
  consultadoEm: string
  status: StatusCadeiaBarcode
  provedor?: string
  sugestoes?: Record<string, unknown>
  tentativas: Array<{ provedor: string; status: string; em: string; tipo?: unknown }>
  aplicacao: { aplicadoEm: string; camposAplicados: string[] } | null
  /** Valores de segredo (server-side) para guarda — nunca persistidos. */
  segredosConhecidos?: string[]
}

/** Formato canônico de metadata.barcodeLookup (compatível com a UI atual). */
export type ProvenienciaBarcodeLookup = {
  ultimoResultado: {
    gtin: string
    formato: string
    consultadoEm: string
    status: StatusCadeiaBarcode
    tentativas: TentativaSanitizada[]
    provedor?: string
    sugestoes?: Record<string, string>
  }
  gtin: string
  formato: string
  consultadoEm: string
  statusLookup: StatusLookupAuditavel
  tentativas: TentativaSanitizada[]
  provedor?: string
  sugestoes?: Record<string, string>
  aplicadoPeloOperador: boolean
  aplicadoEm?: string
  camposAplicados: string[]
  aplicado: Record<string, "aceito">
}

/**
 * Constrói a proveniência segura de um lookup externo. Substitui a montagem
 * ad-hoc na UI sem mudar o formato persistido.
 */
export function construirProvenienciaBarcode(
  entrada: EntradaProvenienciaBarcode,
): ProvenienciaBarcodeLookup {
  const tentativas = sanitizarTentativas(entrada.tentativas)
  const encontrado = entrada.status === "encontrado" && typeof entrada.provedor === "string"
  const sugestoesFiltradas =
    encontrado && entrada.sugestoes
      ? (filtrarSugestao(entrada.provedor as string, entrada.sugestoes) as Record<string, string>)
      : undefined
  const temSugestoes = sugestoesFiltradas && Object.keys(sugestoesFiltradas).length > 0
  const camposAplicados = entrada.aplicacao?.camposAplicados ?? []

  const ultimoResultado: ProvenienciaBarcodeLookup["ultimoResultado"] = {
    gtin: entrada.gtin,
    formato: entrada.formato,
    consultadoEm: entrada.consultadoEm,
    status: entrada.status,
    tentativas,
    ...(encontrado ? { provedor: entrada.provedor as string } : {}),
    ...(encontrado && temSugestoes ? { sugestoes: sugestoesFiltradas as Record<string, string> } : {}),
  }

  const saida: ProvenienciaBarcodeLookup = {
    ultimoResultado,
    gtin: entrada.gtin,
    formato: entrada.formato,
    consultadoEm: entrada.consultadoEm,
    statusLookup: statusLookupAuditavel(entrada.status),
    tentativas,
    ...(encontrado ? { provedor: entrada.provedor as string } : {}),
    ...(encontrado && temSugestoes ? { sugestoes: sugestoesFiltradas as Record<string, string> } : {}),
    aplicadoPeloOperador: entrada.aplicacao !== null,
    ...(entrada.aplicacao ? { aplicadoEm: entrada.aplicacao.aplicadoEm } : {}),
    camposAplicados,
    aplicado: Object.fromEntries(camposAplicados.map((campo) => [campo, "aceito"])) as Record<
      string,
      "aceito"
    >,
  }

  if (entrada.segredosConhecidos && entrada.segredosConhecidos.length > 0) {
    if (contemSegredo(saida, entrada.segredosConhecidos)) {
      throw new Error("[provider-governance] segredo detectado em proveniência (superfície proibida: metadata)")
    }
  }
  return saida
}

/** Marcadores de payload bruto que jamais podem aparecer na proveniência. */
const MARCADORES_PAYLOAD_BRUTO = ["items", "payload_bruto", "payloadbruto", "\"raw\"", "results", "products"]

/**
 * Valida uma proveniência já construída/persistida. Retorna a lista de
 * violações (vazia = válida). Não lança — adequada para testes e auditoria.
 */
export function validarProvenienciaSegura(
  prov: unknown,
  opts?: { segredos?: string[] },
): { ok: true } | { ok: false; erros: string[] } {
  const erros: string[] = []
  if (!prov || typeof prov !== "object" || Array.isArray(prov)) {
    return { ok: false, erros: ["proveniencia ausente ou com formato inválido"] }
  }
  const p = prov as Record<string, unknown>

  for (const campo of ["gtin", "formato", "consultadoEm"] as const) {
    if (typeof p[campo] !== "string" || (p[campo] as string).length === 0) {
      erros.push(`campo obrigatório ausente: ${campo}`)
    }
  }
  if (p.statusLookup !== "encontrado" && p.statusLookup !== "nao_encontrado" && p.statusLookup !== "erro") {
    erros.push("statusLookup fora da união fechada")
  }
  if (!Array.isArray(p.tentativas)) {
    erros.push("tentativas ausentes")
  } else {
    for (const t of p.tentativas) {
      if (!t || typeof t !== "object" || Array.isArray(t)) {
        erros.push("tentativa com formato inválido")
        continue
      }
      const chaves = Object.keys(t as Record<string, unknown>).sort()
      const permitidas = ["em", "provedor", "status", "tipo"]
      if (chaves.some((c) => !permitidas.includes(c))) {
        erros.push(`tentativa com chave não permitida: ${chaves.join(",")}`)
      }
      const tt = t as Record<string, unknown>
      if (typeof tt.provedor !== "string" || typeof tt.status !== "string" || typeof tt.em !== "string") {
        erros.push("tentativa sem provedor/status/em em string")
      }
      if (tt.tipo !== undefined && (typeof tt.tipo !== "string" || !TIPOS_ERRO_SEGUROS.has(tt.tipo))) {
        erros.push("tentativa com tipo fora da união fechada")
      }
    }
  }

  // Provedor conhecido quando presente; sugestões restritas ao allow-list.
  if (p.provedor !== undefined) {
    if (typeof p.provedor !== "string") {
      erros.push("provedor com formato inválido")
    } else {
      const obtido = obterProvedor(p.provedor)
      if (!obtido.conhecido) {
        erros.push(`provedor desconhecido na proveniência: ${p.provedor}`)
      } else if (p.sugestoes !== undefined) {
        if (!p.sugestoes || typeof p.sugestoes !== "object" || Array.isArray(p.sugestoes)) {
          erros.push("sugestoes com formato inválido")
        } else {
          const permitidos = obtido.registro.camposSugeriveis as ReadonlyArray<string>
          for (const chave of Object.keys(p.sugestoes as Record<string, unknown>)) {
            if (!permitidos.includes(chave)) {
              erros.push(`sugestao com campo não permitido para ${p.provedor}: ${chave}`)
            }
          }
        }
      }
    }
  } else if (p.sugestoes !== undefined) {
    erros.push("sugestoes sem provedor")
  }

  // Deny-list global: proibidos jamais aparecem em sugestões/aplicados.
  const sugestoes = (p.sugestoes as Record<string, unknown> | undefined) ?? {}
  const aplicados = Array.isArray(p.camposAplicados) ? (p.camposAplicados as unknown[]) : []
  for (const proibido of CAMPOS_PROIBIDOS_EXTERNOS) {
    if (proibido in sugestoes) erros.push(`campo proibido em sugestoes: ${proibido}`)
    if (aplicados.includes(proibido)) erros.push(`campo proibido em camposAplicados: ${proibido}`)
  }
  if (!Array.isArray(p.camposAplicados)) {
    erros.push("camposAplicados ausentes")
  }
  if (typeof p.aplicadoPeloOperador !== "boolean") {
    erros.push("aplicadoPeloOperador ausente")
  }
  if (!p.ultimoResultado || typeof p.ultimoResultado !== "object") {
    erros.push("ultimoResultado ausente")
  }

  // Payload bruto nunca persistido.
  let serializado = ""
  try {
    serializado = JSON.stringify(prov)?.toLowerCase() ?? ""
  } catch {
    erros.push("proveniencia não serializável")
  }
  for (const marcador of MARCADORES_PAYLOAD_BRUTO) {
    if (serializado.includes(`"${marcador}"`)) {
      erros.push(`marcador de payload bruto na proveniência: ${marcador}`)
    }
  }

  if (opts?.segredos && opts.segredos.length > 0 && contemSegredo(prov, opts.segredos)) {
    erros.push("segredo detectado na proveniência")
  }

  return erros.length === 0 ? { ok: true } : { ok: false, erros }
}
