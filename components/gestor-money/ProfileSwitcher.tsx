"use client"

import * as React from "react"
import { Building2, ShieldCheck, UserRound } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PerfilResumo, TipoPerfilFinanceiro } from "@/lib/gestor-money/contracts"

export function ProfileSwitcher({
  perfis,
  ativo,
  onSelect,
  disabled,
  compact = false,
}: {
  perfis: PerfilResumo[]
  ativo: PerfilResumo | null
  onSelect: (tipo: TipoPerfilFinanceiro) => void
  disabled?: boolean
  compact?: boolean
}) {
  const temPessoal = perfis.some((p) => p.tipo === "PESSOAL")
  const temEmpresa = perfis.some((p) => p.tipo === "EMPRESA")

  return (
    <div className={cn("space-y-1.5", compact && "space-y-0")}>
      <div
        role="tablist"
        aria-label="Seletor seguro de perfil financeiro"
        className={cn(
          "grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/60 p-1",
          compact && "w-[196px] sm:w-[224px]"
        )}
      >
        <button
          type="button"
          role="tab"
          aria-selected={ativo?.tipo === "PESSOAL"}
          disabled={disabled || !temPessoal}
          data-testid="profile-switch-pessoal"
          onClick={() => onSelect("PESSOAL")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all",
            ativo?.tipo === "PESSOAL"
              ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-slate-950"
              : "text-muted-foreground hover:text-foreground",
            (disabled || !temPessoal) && "cursor-not-allowed opacity-50"
          )}
        >
          <UserRound className="h-3.5 w-3.5 shrink-0" />
          <span>Pessoal</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={ativo?.tipo === "EMPRESA"}
          disabled={disabled || !temEmpresa}
          data-testid="profile-switch-empresa"
          onClick={() => onSelect("EMPRESA")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all",
            ativo?.tipo === "EMPRESA"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
            (disabled || !temEmpresa) && "cursor-not-allowed opacity-50"
          )}
        >
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          <span>Empresa</span>
        </button>
      </div>
      {!compact && ativo && (
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px]",
            ativo.tipo === "PESSOAL"
              ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300"
              : "border-primary/25 bg-primary/8 text-primary"
          )}
        >
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-medium">
            {ativo.tipo === "PESSOAL"
              ? "Isolado · Sem loja (G001)"
              : `Loja vinculada · ${ativo.nomeExibicao.replace("Empresa · ", "")}`}
          </span>
        </div>
      )}
    </div>
  )
}
