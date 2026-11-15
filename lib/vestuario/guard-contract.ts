/** P01: núcleo puro e pequeno para os boundaries atuais. Sem I/O ou inferência do legado. */
export type VestuarioGuardCode =
  | "CONTRATO_VARIACAO_INVALIDO"
  | "VARIANTE_OBRIGATORIA"
  | "VESTUARIO_NAO_OPERACIONAL"

export type VestuarioGuardIssue = Readonly<{ code: VestuarioGuardCode; message: string }>

export const CATALOG_DECLARATION_CONTRACT = "omni.vestuario.catalog" as const
export const SALE_LINE_CONTRACT = "omni.vestuario.sale-line" as const

export type CatalogDeclarationV1 =
  | Readonly<{ contract: typeof CATALOG_DECLARATION_CONTRACT; version: 1; mode: "SIMPLES" }>
  | Readonly<{ contract: typeof CATALOG_DECLARATION_CONTRACT; version: 1; mode: "COM_GRADE"; gradeId: string }>

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export function hasVestuarioDeclaration(metadata: unknown): boolean {
  return isRecord(metadata) && isRecord(metadata.vestuario) && metadata.vestuario.contract === CATALOG_DECLARATION_CONTRACT
}

/** Namespace novo e explícito. gradePlanejada, atributos e accessorySelection não o substituem. */
export function isCatalogDeclarationV1(value: unknown): value is CatalogDeclarationV1 {
  if (!isRecord(value) || value.contract !== CATALOG_DECLARATION_CONTRACT || value.version !== 1) return false
  if (value.mode === "SIMPLES") return Object.keys(value).every((k) => k === "contract" || k === "version" || k === "mode")
  return value.mode === "COM_GRADE" && typeof value.gradeId === "string" &&
    value.gradeId.length > 0 && value.gradeId.length <= 128 && value.gradeId === value.gradeId.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value.gradeId) &&
    Object.keys(value).every((k) => k === "contract" || k === "version" || k === "mode" || k === "gradeId")
}

export function productVariantIssue(metadata: unknown, varianteId?: unknown): VestuarioGuardIssue | null {
  if (!hasVestuarioDeclaration(metadata)) return null
  const declaration = (metadata as Record<string, unknown>).vestuario
  if (!isCatalogDeclarationV1(declaration)) {
    return { code: "CONTRATO_VARIACAO_INVALIDO", message: "Declaração de variações inválida. Preserve o cadastro e revise a identificação do produto." }
  }
  if (declaration.mode === "SIMPLES") return null
  if (typeof varianteId !== "string" || !varianteId.trim()) {
    return { code: "VARIANTE_OBRIGATORIA", message: "Produto com grade exige uma variação identificada. Nenhum saldo foi movimentado." }
  }
  return { code: "VESTUARIO_NAO_OPERACIONAL", message: "Venda e estoque por cor e tamanho ainda não estão disponíveis. Nenhum saldo foi movimentado." }
}

/** Recusa o contrato novo nos writers legados, inclusive no replay; não aceita variante como simples. */
export function unsupportedVariantLineIssue(line: unknown): VestuarioGuardIssue | null {
  if (!isRecord(line)) return null
  const declared = isRecord(line.vestuario) && line.vestuario.contract === SALE_LINE_CONTRACT
  if (declared || Object.hasOwn(line, "varianteId")) {
    return { code: "VESTUARIO_NAO_OPERACIONAL", message: "Este fluxo ainda não aceita identidade de variação de estoque. Nenhuma operação foi registrada." }
  }
  return null
}
