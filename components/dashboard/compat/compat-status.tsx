"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { LojaCompatStatus } from "@/lib/catalogo-aparelhos/loja-catalogo"

/** COMPAT-PROFISSIONAL-001 — rótulos e cores (tokens semânticos) dos status de compatibilidade. */
export const COMPAT_STATUS_UI: Record<string, { label: string; curto: string; className: string }> = {
  confirmado_fornecedor: {
    label: "Confirmada pelo fornecedor",
    curto: "Fornecedor",
    className: "border-success/40 bg-success/10 text-success",
  },
  confirmado_loja: {
    label: "Confirmada pela loja (teste físico)",
    curto: "Confirmada",
    className: "border-success/40 bg-success/10 text-success",
  },
  provavel_mercado: {
    label: "Provável — confirmar antes de vender",
    curto: "Provável",
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  precisa_testar: {
    label: "Pendente — precisa testar",
    curto: "Pendente",
    className: "border-border bg-muted text-muted-foreground",
  },
  nao_recomendado: {
    label: "Não recomendado",
    curto: "Não recomendado",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
}

/** Ordem de escolha no formulário (do mais conservador ao confirmado). */
export const STATUS_EDITAVEIS: LojaCompatStatus[] = ["precisa_testar", "provavel_mercado", "confirmado_loja", "nao_recomendado"]

export function CompatStatusBadge({ status, curto = false }: { status: string; curto?: boolean }) {
  const cfg = COMPAT_STATUS_UI[status] ?? COMPAT_STATUS_UI.precisa_testar
  return (
    <Badge variant="outline" className={cn("shrink-0 text-[10px]", cfg.className)}>
      {curto ? cfg.curto : cfg.label}
    </Badge>
  )
}
