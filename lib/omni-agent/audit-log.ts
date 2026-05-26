/**
 * Metadados de auditoria Omni Agent — `storeId` sempre no JSON (sem coluna Prisma nesta fase).
 */
export function omniAgentAuditMetadata(
  storeId: string,
  extra?: Record<string, unknown>,
): string {
  const sid = storeId.trim()
  if (!sid) {
    throw new Error("storeId obrigatório para auditoria Omni Agent.")
  }
  return JSON.stringify({
    storeId: sid,
    tenantId: sid,
    module: "omni_agent",
    ...extra,
  })
}
