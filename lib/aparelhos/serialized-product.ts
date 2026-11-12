/** Metadado do Produto que marca o modelo comercial como serializado (venda exige unidade/IMEI). Sem dependências. */
export function isSerializedDeviceProduct(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false
  const sd = (metadata as Record<string, unknown>).serializedDevice
  return !!sd && typeof sd === "object" && (sd as Record<string, unknown>).version === 1
}

/** A linha da venda traz o vínculo da unidade física. */
export function lineHasDeviceSale(line: unknown): boolean {
  if (!line || typeof line !== "object") return false
  const ds = (line as Record<string, unknown>).deviceSale
  return ds !== undefined && ds !== null
}
