import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers";
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request";
import { resolveActiveStoreId } from "@/lib/operacoes/assert-active-store";

/** Leitura na API legada — exige unidade explícita (header ou query); sem fallback loja-1. */
export function storeIdFromOperacoesLegacyApiRead(req: Request): string | null {
  const h = req.headers.get(ASSISTEC_LOJA_HEADER)?.trim();
  const url = new URL(req.url);
  const q = url.searchParams.get("storeId")?.trim() || url.searchParams.get("lojaId")?.trim();
  return resolveActiveStoreId(h || q || null);
}

/** Escrita — reutiliza regra existente (header ou query). */
export function storeIdFromOperacoesLegacyApiWrite(req: Request): string | null {
  return resolveActiveStoreId(storeIdFromAssistecRequestForWrite(req));
}

export const LEGACY_ORDENS_SERVICO_WRITE_DISABLED = {
  error:
    "API legada desativada para escrita (semântica de estoque incompatível com o Operações HUB). Use /dashboard/operacoes-v2.",
  deprecated: true,
  redirect: "/dashboard/operacoes-v2",
} as const;
