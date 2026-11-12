/** Utilitários sem dependência do motor de vendas (podem ser importados pelo serviço e pelo gancho). */
import { createHash } from "node:crypto"

export function maskDocumento(doc: string | null | undefined): string {
  const d = (doc ?? "").replace(/\D/g, "")
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
  if (d.length === 14) return `**.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-**`
  return d ? "•".repeat(Math.max(0, d.length - 2)) + d.slice(-2) : ""
}

export function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

