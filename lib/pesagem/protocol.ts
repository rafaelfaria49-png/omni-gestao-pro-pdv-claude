import { parseMass, type Mass } from "./mass"

export type WeightBasis = "net" | "gross" | "unknown"
export type ParsedWeight =
  | { kind: "measurement"; mass: Mass; basis: WeightBasis; stable?: boolean }
  | { kind: "invalid" | "unknown_unit" | "device_error" | "overload"; detail: string }

export interface WeightProtocol {
  readonly id: string
  readonly simulated: boolean
  parse(line: string): ParsedWeight
}

function measurement(value: string, unit: string, basis: WeightBasis, stable?: boolean): ParsedWeight {
  const result = parseMass(value, unit)
  if (!result.ok) return {
    kind: result.code === "unknown_unit" ? "unknown_unit" : "invalid",
    detail: result.code,
  }
  return { kind: "measurement", mass: result.mass, basis, stable }
}

/** Subconjunto explícito dos exemplos de hardware-bridge.ts; sem alegação de marca. */
export function explicitUnitAsciiProtocol(basis: WeightBasis = "unknown"): WeightProtocol {
  return Object.freeze({
    id: "explicit-unit-ascii-v1",
    simulated: false,
    parse(line: string): ParsedWeight {
      if (!/^[\x20-\x7e\t]*$/.test(line)) return { kind: "invalid", detail: "expected_ascii_line" }
      const match = /^([+-]?\d+(?:[.,]\d+)?)\s*([a-zA-Z]*)$/.exec(line.trim())
      if (!match) return { kind: "invalid", detail: "expected_explicit_mass" }
      return measurement(match[1], match[2].toLowerCase(), basis)
    },
  })
}

/** Protocolo inventado exclusivamente para a bancada; não é protocolo de equipamento. */
export const simulatedWeightProtocol: WeightProtocol = Object.freeze({
  id: "simulated-v1",
  simulated: true,
  parse(line: string): ParsedWeight {
    const fields = line.split("|")
    if (fields[0] !== "SIM") return { kind: "invalid", detail: "simulation_prefix_required" }
    if (fields.length === 2 && fields[1] === "OL") return { kind: "overload", detail: "simulated_overload" }
    if (fields.length === 3 && fields[1] === "ERR" && /^[A-Z0-9_-]{1,32}$/.test(fields[2])) {
      return { kind: "device_error", detail: fields[2] }
    }
    const basis = { NET: "net", GROSS: "gross", UNKNOWN: "unknown" } as const
    if (fields.length !== 5 || !["ST", "US", "NA"].includes(fields[1]) ||
        !Object.hasOwn(basis, fields[2])) return { kind: "invalid", detail: "invalid_simulation_frame" }
    return measurement(fields[3], fields[4], basis[fields[2] as keyof typeof basis],
      fields[1] === "NA" ? undefined : fields[1] === "ST")
  },
})
