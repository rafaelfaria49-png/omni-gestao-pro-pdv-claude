import { handleEvent } from "@/lib/automation/automation-engine"

/**
 * Emite `os_finalizada` → automações Omni (`os_entregue`).
 * Chamar apenas na transição para status entregue (evita duplicar na mesma OS).
 */
export async function emitOsFinalizadaOmniEvent(
  storeId: string,
  osId: string,
  data: { status: string; phoneDigits?: string; valorTotal?: number },
): Promise<void> {
  const sid = storeId.trim()
  const id = osId.trim()
  if (!sid || !id) return

  try {
    await handleEvent("os_finalizada", {
      storeId: sid,
      entityId: id,
      data: {
        status: data.status,
        phoneDigits: data.phoneDigits ?? "",
        ...(data.valorTotal != null && Number.isFinite(data.valorTotal)
          ? { valorTotal: data.valorTotal }
          : {}),
      },
    })
  } catch (e) {
    console.error("[omni-agent] emitOsFinalizadaOmniEvent", e)
  }
}
