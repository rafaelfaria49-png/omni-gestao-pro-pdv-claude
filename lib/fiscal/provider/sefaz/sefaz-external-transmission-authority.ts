/**
 * Authority opaca de transmissão EXTERNA one-shot do piloto de homologação (GOAL 022).
 *
 * Fecha a lacuna identificada na primeira tentativa de transmissão: o transporte SOAP
 * só aceitava authority loopback de teste (`NODE_ENV=test`, fisicamente presa a
 * `127.0.0.1`), e `nodeSefazHttpsRuntimePorts` — o runtime produtivo de `node:https` —
 * não tinha nenhum caminho legítimo de liberação.
 *
 * Modelo (espelha o padrão WeakMap do loopback, `sefaz-runtime-ports.ts`):
 *  - o token é um objeto opaco; a associação authority→runtime vive em `WeakMap` privado
 *    deste módulo — copiar/forjar o objeto não reproduz a autoridade;
 *  - o consumo é ONE-SHOT em memória (`available=false` após o primeiro uso) e valida,
 *    no instante do consumo, o binding completo: serviço `NFeAutorizacao4` (literal de
 *    tipo), ambiente `HOMOLOGACAO` (literal de tipo), loja e janela temporal;
 *  - a fábrica PRODUTIVA binda exclusivamente `nodeSefazHttpsRuntimePorts`; não existe
 *    parâmetro de runtime injetável — o campo `runtime` de `SefazSoapTransportOptions`
 *    continua sendo apenas detector de conflito;
 *  - a fábrica de TESTE (runtime falso, para provas sem rede) exige `NODE_ENV=test`,
 *    exatamente como a authority loopback.
 *
 * A autorização de EXECUÇÃO (quem pode criar a authority) não vive aqui: nasce do consumo
 * persistente one-shot do gate do piloto (`pilot-emission-gate.ts`) — ledger em
 * `FiscalEmissaoJob`/`FiscalLog` ANTES de qualquer rede. Esta authority é a última
 * barreira ANTES do socket, não a primeira.
 *
 * A barreira de PRODUÇÃO permanece no transporte (`ambiente !== HOMOLOGACAO` é a
 * primeira checagem de `send`); aqui o ambiente é literal de tipo desde a criação.
 */
import { nodeSefazHttpsRuntimePorts, type SefazHttpsRuntimePorts } from "./sefaz-runtime-ports"

/** Único serviço autorizado pela authority externa do piloto (emissão normal). */
export const SEFAZ_EXTERNAL_PILOT_SERVICO = "NFeAutorizacao4" as const

/** Único ambiente autorizado pela authority externa do piloto. */
export const SEFAZ_EXTERNAL_PILOT_AMBIENTE = "HOMOLOGACAO" as const

/** Janela máxima da authority — mesmo teto do gate efêmero da contingência (15 min). */
export const SEFAZ_EXTERNAL_PILOT_MAX_WINDOW_MS = 15 * 60 * 1_000

const EXTERNAL_TRANSMISSION_AUTHORITY = Symbol("sefaz-external-transmission-authority")

/** Token opaco — incapaz de ser forjado fora deste módulo (binding em WeakMap privado). */
export type SefazExternalTransmissionAuthority = {
  readonly [EXTERNAL_TRANSMISSION_AUTHORITY]: true
}

export type SefazExternalTransmissionBinding = {
  readonly activationId: string
  readonly storeId: string
  readonly jobId: string
  /** Literal de tipo: a authority do piloto NÃO nasce para outro serviço. */
  readonly servico: typeof SEFAZ_EXTERNAL_PILOT_SERVICO
  /** Literal de tipo: a authority do piloto NÃO nasce para outro ambiente. */
  readonly ambiente: typeof SEFAZ_EXTERNAL_PILOT_AMBIENTE
  readonly notBeforeMs: number
  readonly expiresAtMs: number
}

type ExternalAuthorityBinding = {
  available: boolean
  readonly binding: SefazExternalTransmissionBinding
  readonly runtime: SefazHttpsRuntimePorts
}

const externalAuthorityBindings = new WeakMap<object, ExternalAuthorityBinding>()

const ACTIVATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/

function validBinding(binding: SefazExternalTransmissionBinding): boolean {
  if (!ACTIVATION_ID_PATTERN.test(String(binding.activationId ?? ""))) return false
  if (!String(binding.storeId ?? "").trim() || !String(binding.jobId ?? "").trim()) return false
  if (binding.servico !== SEFAZ_EXTERNAL_PILOT_SERVICO) return false
  if (binding.ambiente !== SEFAZ_EXTERNAL_PILOT_AMBIENTE) return false
  const notBefore = Number(binding.notBeforeMs)
  const expiresAt = Number(binding.expiresAtMs)
  if (!Number.isFinite(notBefore) || !Number.isFinite(expiresAt)) return false
  if (expiresAt <= notBefore) return false
  if (expiresAt - notBefore > SEFAZ_EXTERNAL_PILOT_MAX_WINDOW_MS) return false
  return true
}

/**
 * Fábrica PRODUTIVA: binda exclusivamente o runtime canônico de `node:https`
 * (`nodeSefazHttpsRuntimePorts`). Binding inválido (janela > 15 min, campos vazios,
 * serviço/ambiente fora do literal) lança — authority inválida jamais é criada
 * silenciosamente.
 */
export function createSefazExternalTransmissionAuthority(
  binding: SefazExternalTransmissionBinding,
): SefazExternalTransmissionAuthority {
  if (!validBinding(binding)) {
    throw new Error("Binding de authority externa inválido (serviço/ambiente/janela/escopo).")
  }
  const authority: SefazExternalTransmissionAuthority = Object.freeze({
    [EXTERNAL_TRANSMISSION_AUTHORITY]: true as const,
  })
  externalAuthorityBindings.set(authority, {
    available: true,
    binding: { ...binding },
    runtime: nodeSefazHttpsRuntimePorts,
  })
  return authority
}

/**
 * Fábrica de TESTE: mesmo binding, runtime INJETADO (fake/loopback) para provas sem rede.
 * Exige `NODE_ENV=test` — em produção lança, impedindo que runtime arbitrário seja
 * injetado por engano ou por deep import.
 */
export function createSefazExternalTransmissionTestAuthority(
  binding: SefazExternalTransmissionBinding,
  runtime: SefazHttpsRuntimePorts,
): SefazExternalTransmissionAuthority {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Authority externa de teste disponível somente em NODE_ENV=test.")
  }
  if (!runtime || typeof runtime.request !== "function" || typeof runtime.createSecureContext !== "function") {
    throw new Error("Runtime de teste inválido.")
  }
  if (!validBinding(binding)) {
    throw new Error("Binding de authority externa inválido (serviço/ambiente/janela/escopo).")
  }
  const authority: SefazExternalTransmissionAuthority = Object.freeze({
    [EXTERNAL_TRANSMISSION_AUTHORITY]: true as const,
  })
  externalAuthorityBindings.set(authority, {
    available: true,
    binding: { ...binding },
    runtime,
  })
  return authority
}

/** Existência nominal em runtime: cast/clone/objeto estrutural não atravessam o WeakMap. */
export function isSefazExternalTransmissionAuthority(
  authority: unknown,
): boolean {
  return (
    authority !== null &&
    typeof authority === "object" &&
    externalAuthorityBindings.has(authority)
  )
}

export type SefazExternalAuthorityConsumption = {
  readonly runtime: SefazHttpsRuntimePorts
  readonly binding: SefazExternalTransmissionBinding
}

/**
 * Consome no MÁXIMO uma vez e devolve o runtime somente quando o CONTEXTO da requisição
 * confere com o binding: serviço, ambiente, loja e janela temporal. Qualquer divergência
 * (ou segundo consumo, ou expiração entre criação e uso) devolve `null` — o transporte
 * trata como tentativa não autorizada e bloqueia ANTES de cofre/TLS/socket.
 */
export function consumeSefazExternalTransmissionAuthority(
  authority: SefazExternalTransmissionAuthority,
  context: {
    readonly servico: string
    readonly ambiente: string
    readonly storeId: string
    readonly now?: Date
  },
): SefazExternalAuthorityConsumption | null {
  const entry = externalAuthorityBindings.get(authority)
  if (!entry || !entry.available) return null
  const binding = entry.binding
  if (String(context.servico ?? "") !== binding.servico) return null
  if (String(context.ambiente ?? "") !== binding.ambiente) return null
  if (String(context.storeId ?? "").trim() !== binding.storeId) return null
  const now = context.now ?? new Date()
  const nowMs = now.getTime()
  if (!Number.isFinite(nowMs) || nowMs < binding.notBeforeMs || nowMs >= binding.expiresAtMs) {
    return null
  }
  entry.available = false
  return { runtime: entry.runtime, binding }
}

/** Revalidação nominal (janela + disponibilidade) sem consumir. */
export function sefazExternalTransmissionAuthorityStillActive(
  authority: SefazExternalTransmissionAuthority,
  now: Date = new Date(),
): boolean {
  const entry = externalAuthorityBindings.get(authority)
  if (!entry || !entry.available) return false
  const nowMs = now.getTime()
  return Number.isFinite(nowMs) && nowMs >= entry.binding.notBeforeMs && nowMs < entry.binding.expiresAtMs
}
