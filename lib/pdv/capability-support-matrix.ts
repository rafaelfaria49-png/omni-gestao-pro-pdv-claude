/**
 * Matriz de suporte code-owned (N4).
 *
 * Derivada do código vivo das 4 superfícies oficiais.
 * Não inventa suporte futuro: películas, OS lookup compartilhado e
 * quick-services fora da Assistência permanecem unsupported.
 */

import { KNOWN_CAPABILITY_KEYS_V1 } from "@/lib/capabilities-persistence-v1"
import type { CapabilityKey, CapabilitySupportRow } from "@/lib/pdv/capability-types"
import type { OfficialPdvSurfaceId, PdvSurfaceId } from "@/lib/pdv/surface-ids"

const CLASSIC: OfficialPdvSurfaceId = "classic"
const ASSISTENCIA: OfficialPdvSurfaceId = "assistencia"
const SUPERMERCADO: OfficialPdvSurfaceId = "supermercado"
const VENDA_COMPLETA: OfficialPdvSurfaceId = "venda-completa"

const SWITCHER_SURFACES = [CLASSIC, ASSISTENCIA, SUPERMERCADO] as const
const ALL_OFFICIAL = [CLASSIC, ASSISTENCIA, SUPERMERCADO, VENDA_COMPLETA] as const

/**
 * Next experimental não recebe suporte inventado. Onde o código Next/Black
 * não implementa o recurso, a superfície fica fora de `supportedBy`.
 */
export const PDV_CAPABILITY_SUPPORT_MATRIX: readonly CapabilitySupportRow[] = [
  {
    key: "pdv.tables",
    supportedBy: SWITCHER_SURFACES,
    defaultEnabled: true,
    integration:
      "vendas-page-client.tsx (botão Mesas) + mesas-page-client.tsx + pdvParams.moduloControleConsumo",
    notes:
      "Fluxo de mesas é rota própria. O switcher Classic/Assistência/Supermercado compartilha o botão. Venda Completa não expõe mesas.",
  },
  {
    key: "sales.paymentMethods",
    supportedBy: ALL_OFFICIAL,
    defaultEnabled: true,
    integration: "PaymentModal + pdvParams.formasPagamento (lib/pdv-formas-pagamento.ts)",
    notes: "Capability controla disponibilidade; não substitui o modelo de formas de pagamento.",
  },
  {
    key: "pdv.filmLookup",
    supportedBy: [],
    defaultEnabled: false,
    integration: "api/catalogo/peliculas/search (backend read-only; sem modal nas superfícies PDV)",
    notes: "Feature futura (roadmap 029). Unsupported em todas as superfícies.",
  },
  {
    key: "pdv.accessoryModelColor",
    supportedBy: ALL_OFFICIAL,
    defaultEnabled: true,
    integration: "SelecionarAcessorioDialog + accessorySelection nas 4 bordas oficiais",
    notes: "Next/Black não implementa accessorySelection.",
  },
  {
    key: "pdv.quickServices",
    supportedBy: [ASSISTENCIA],
    defaultEnabled: true,
    integration: "pdv-assistencia-enterprise.tsx (catálogo Serviços rápidos)",
    notes: "Exclusivo da Assistência. Expansão para outras superfícies é FUTURE.",
  },
  {
    key: "pdv.osLookup",
    supportedBy: [],
    defaultEnabled: false,
    integration: "Classic hidrata linkedOsId via comanda; não há lookup de OS no PDV",
    notes: "Roadmap 031: lookup compartilhado é feature futura. Unsupported.",
  },
  {
    key: "pdv.discounts",
    supportedBy: ALL_OFFICIAL,
    defaultEnabled: true,
    integration: "discountReais/discountPercent no carrinho e PaymentModal",
    notes: "Default reproduz desconto já operacional nas 4 bordas.",
  },
  {
    key: "pdv.customerStoreCredit",
    supportedBy: ALL_OFFICIAL,
    defaultEnabled: true,
    integration: "PaymentModal.customerStoreCredit / getSaldoCreditoCliente",
    notes: "Default ligado; não cria ledger novo.",
  },
  {
    key: "pdv.heldSales",
    supportedBy: ALL_OFFICIAL,
    defaultEnabled: true,
    integration: "lib/pdv-hold.ts + VendaEsperaModal / F7",
    notes: "Holds scoped loja+terminal. Next/Black também persiste holds (shell).",
  },
  {
    key: "pdv.multiplePayments",
    supportedBy: ALL_OFFICIAL,
    defaultEnabled: true,
    integration: "F12 / forma multiplo em pdv-formas-pagamento",
    notes: "Default ligado onde o atalho/forma já existe.",
  },
  {
    key: "pdv.customerSearch",
    supportedBy: ALL_OFFICIAL,
    defaultEnabled: true,
    integration: "useClienteSearch / PdvClientePicker",
    notes: "Default ligado nas 4 bordas oficiais.",
  },
]

const MATRIX_BY_KEY = new Map<CapabilityKey, CapabilitySupportRow>(
  PDV_CAPABILITY_SUPPORT_MATRIX.map((row) => [row.key, row]),
)

export function getCapabilitySupportRow(key: string): CapabilitySupportRow | undefined {
  return MATRIX_BY_KEY.get(key as CapabilityKey)
}

export function isCapabilitySupportedOnSurface(key: string, surfaceId: PdvSurfaceId): boolean {
  const row = getCapabilitySupportRow(key)
  if (!row) return false
  return row.supportedBy.includes(surfaceId)
}

export function canonicalDefaultEnabled(key: string, surfaceId: PdvSurfaceId): boolean {
  const row = getCapabilitySupportRow(key)
  if (!row) return false
  if (!row.supportedBy.includes(surfaceId)) return false
  return row.defaultEnabled
}

export function assertMatrixCoversV1Allowlist(): void {
  const matrixKeys = new Set(PDV_CAPABILITY_SUPPORT_MATRIX.map((r) => r.key))
  for (const key of KNOWN_CAPABILITY_KEYS_V1) {
    if (!matrixKeys.has(key)) {
      throw new Error(`Support matrix N4 não cobre a key V1 "${key}".`)
    }
  }
}
