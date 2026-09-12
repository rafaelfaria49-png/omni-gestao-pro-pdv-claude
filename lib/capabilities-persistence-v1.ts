/**
 * Contrato de persistência de Capabilities V1 para PDV-SETTINGS-SERVER-FIRST-N3.
 *
 * Persistido dentro de `StoreSettings.printerConfig.capabilities` (JSONB) sem migrations.
 *
 * REGRAS INEGOCIÁVEIS DO N3:
 * - version: estritamente 1 (número).
 * - allowlist fechada: apenas capabilities já documentadas no roadmap canônico
 *   e sustentadas por superfícies reais existentes.
 * - Bloqueio explícito: `pdv.scale`, `pdv.scale.*`, `sale.fractionalQty` NÃO permitidos.
 * - Rejeição estrita (sem sanitização silenciosa): `available`, `entitled`, `plan`, `license`
 *   são de autoridade do servidor e sua presença em qualquer nível do payload resulta em HTTP 400.
 */

export const KNOWN_CAPABILITY_KEYS_V1 = [
  "pdv.tables",
  "sales.paymentMethods",
  "pdv.filmLookup",
  "pdv.accessoryModelColor",
  "pdv.quickServices",
  "pdv.osLookup",
  "pdv.discounts",
  "pdv.customerStoreCredit",
  "pdv.heldSales",
  "pdv.multiplePayments",
  "pdv.customerSearch",
] as const

export type KnownCapabilityKeyV1 = (typeof KNOWN_CAPABILITY_KEYS_V1)[number]

export const BLOCKED_CAPABILITY_KEYS_V1 = [
  "pdv.scale",
  "pdv.scale.weight",
  "sale.fractionalQty",
] as const

export const RESERVED_SERVER_AUTHORITY_KEYS = [
  "available",
  "entitled",
  "plan",
  "license",
] as const

export type CapabilityOverrideValue =
  | boolean
  | {
      enabled?: boolean
      [key: string]: unknown
    }

export type StoreCapabilitiesV1 = {
  version: 1
  overrides?: Partial<Record<KnownCapabilityKeyV1, CapabilityOverrideValue>>
}

export type CapabilitiesValidationResult =
  | { ok: true; data: StoreCapabilitiesV1 }
  | { ok: false; error: string }

function isObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v)
}

/**
 * Procura recursivamente por chaves de autoridade reservadas em qualquer profundidade.
 */
function findReservedAuthorityKey(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findReservedAuthorityKey(item)
      if (found) return found
    }
    return null
  }

  const rec = obj as Record<string, unknown>
  for (const key of Object.keys(rec)) {
    const lower = key.toLowerCase().trim()
    for (const reserved of RESERVED_SERVER_AUTHORITY_KEYS) {
      if (lower === reserved.toLowerCase()) {
        return key
      }
    }
    const nested = findReservedAuthorityKey(rec[key])
    if (nested) return nested
  }
  return null
}

/**
 * Valida rigorosamente o payload de capabilities recebido no PUT de StoreSettings.
 */
export function validateCapabilitiesPayload(payload: unknown): CapabilitiesValidationResult {
  if (!isObject(payload)) {
    return { ok: false, error: "O campo capabilities deve ser um objeto JSON não nulo." }
  }

  if (payload.version !== 1) {
    return {
      ok: false,
      error: `Versão de capabilities incompatível. Esperado version: 1, recebido: ${JSON.stringify(
        payload.version,
      )}.`,
    }
  }

  // Checagem de campos reservados de autoridade do servidor em todo o objeto
  const authorityKeyFound = findReservedAuthorityKey(payload)
  if (authorityKeyFound) {
    return {
      ok: false,
      error: `Campo reservado de autoridade do servidor não permitido no payload do cliente: "${authorityKeyFound}".`,
    }
  }

  // Validar chaves diretas no objeto raiz de capabilities (além de 'version' e 'overrides')
  const allowedRootKeys = new Set(["version", "overrides"])
  for (const rootKey of Object.keys(payload)) {
    if (!allowedRootKeys.has(rootKey)) {
      return {
        ok: false,
        error: `Chave não permitida na raiz de capabilities: "${rootKey}". Use a estrutura { version: 1, overrides: { ... } }.`,
      }
    }
  }

  const overrides = payload.overrides
  if (overrides !== undefined) {
    if (!isObject(overrides)) {
      return { ok: false, error: "O campo 'overrides' de capabilities deve ser um objeto chave-valor." }
    }

    const knownSet = new Set<string>(KNOWN_CAPABILITY_KEYS_V1)
    const blockedSet = new Set<string>(BLOCKED_CAPABILITY_KEYS_V1)

    for (const [key, val] of Object.entries(overrides)) {
      if (blockedSet.has(key) || key.startsWith("pdv.scale")) {
        return {
          ok: false,
          error: `A capability "${key}" está explicitamente bloqueada e não pode ser persistida no N3.`,
        }
      }

      if (!knownSet.has(key)) {
        return {
          ok: false,
          error: `Capability desconhecida: "${key}". Chaves permitidas no N3: ${KNOWN_CAPABILITY_KEYS_V1.join(", ")}.`,
        }
      }

      // Validar formato do override
      if (typeof val !== "boolean" && !isObject(val)) {
        return {
          ok: false,
          error: `Formato de override inválido para "${key}". Deve ser boolean ou objeto { enabled?: boolean, ... }.`,
        }
      }

      if (isObject(val)) {
        const overrideAuthKey = findReservedAuthorityKey(val)
        if (overrideAuthKey) {
          return {
            ok: false,
            error: `Campo reservado de autoridade do servidor não permitido dentro do override de "${key}": "${overrideAuthKey}".`,
          }
        }
      }
    }
  }

  return {
    ok: true,
    data: {
      version: 1,
      overrides: overrides as Partial<Record<KnownCapabilityKeyV1, CapabilityOverrideValue>> | undefined,
    },
  }
}
