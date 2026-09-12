import type { TermosGarantia } from "@/lib/config-empresa"
import type { FormaPagamentoConfig } from "@/lib/pdv-formas-pagamento"
import type { PdvImpressaoConfig } from "@/lib/pdv-impressao-config"
import type { StoreCapabilitiesV1 } from "@/lib/capabilities-persistence-v1"

export type { StoreCapabilitiesV1, KnownCapabilityKeyV1 } from "@/lib/capabilities-persistence-v1"

export type CertificadoA1Status = "Inativo" | "Pendente" | "Ativo" | "Expirado"

export type CertificadoA1Meta = {
  status: CertificadoA1Status
  fileName?: string
  updatedAt?: string
}

/** Quando o PDV é o modelo "classic" (não supermercado): UI Lovable (atalhos F1–F9) ou tela completa legada (`services`/Assistência). */
export type PdvClassicLayoutKind = "lovable" | "services"

/** Layout principal da loja no PDV. */
export type PdvMainLayoutKind = "classic" | "supermercado" | "next"

export type StorePdvAtalhoRapido = {
  id: string
  nome: string
  preco: number
  inventoryId?: string
  categoria?: string
  ativo?: boolean
  favorito?: boolean
  cor?: string
  posicao?: number
  /** Ausente em atalhos legados; leitores inferem sem exigir migração manual. */
  kind?: "produto" | "servico"
  serviceId?: string
  serviceCategory?: string
}

export type StorePdvParams = {
  atalhosRapidos: StorePdvAtalhoRapido[]
  ocultarCategoriasNoPdv: boolean
  categoriasOcultasNoPdv: string[]
  garantiaPadraoDias: number
  validadeOrcamentoDias: number
  incluirImpostoEstimadoNoPdv: boolean
  aliquotaImpostoEstimadoPdv: number
  moduloControleConsumo: boolean
  /** Preferência por unidade (persistida em `printerConfig.pdvParams`). */
  pdvClassicLayout?: PdvClassicLayoutKind
  /** Formas de pagamento ativas e regras por unidade (PDV runtime). */
  formasPagamento?: FormaPagamentoConfig[]
}

/**
 * Payload persistido por unidade dentro de `StoreSettings.printerConfig` (JSON).
 * Mantém compatibilidade com o schema atual sem migração de colunas.
 */
export type StoreSettingsBlob = {
  pdvParams?: Partial<StorePdvParams>
  termosGarantia?: Partial<TermosGarantia>
  certificadoA1?: Partial<CertificadoA1Meta>
  /** Preferência de modelo da IA Mestre (apenas plano ouro). */
  aiMestreModel?: string
  impressao?: Partial<PdvImpressaoConfig>
  appearance?: unknown
  /** Capabilities V1 persistidas em StoreSettings.printerConfig.capabilities. */
  capabilities?: StoreCapabilitiesV1
  /** Layout principal persistido na loja (espelho server-first). */
  pdvMainLayout?: PdvMainLayoutKind
  /** Card de fluxo selecionado na UI V3. */
  v3PdvSectionCard?: string
  /** Modo inicial da loja no PDV Clássico (normal | rapido). */
  v3PdvClassicModoInicial?: "normal" | "rapido"
}

export type StoreSettingsApi = {
  contactEmail?: string | null
  contactWhatsapp?: string | null
  contactWhatsappDono?: string | null
  receiptFooter?: string | null
  printerConfig?: unknown
  cardFees?: unknown
}

export type StoreSettingsPutPayload = Partial<StoreSettingsApi> & {
  /**
   * Quando `backfill: true`, o servidor aplica a regra "write only if absent":
   * revalida o estado no momento da escrita e só grava campos que estiverem
   * AUSENTES no servidor, impedindo que um stale device sobrescreva um valor já migrado.
   */
  backfill?: boolean
}
