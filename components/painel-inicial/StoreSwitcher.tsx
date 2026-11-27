"use client"

/**
 * Seletor de loja ativa para ADMIN/GERENTE de escopo STORE com 2+ lojas (OMNI-STORE-SAFE-SWITCHER-001).
 *
 * Só ALTERNA entre lojas já autorizadas pela sessão — nada de criar, editar, excluir ou Master Console.
 * A troca é a mesma de sempre (`setLojaAtivaId`): guarda de rascunho da V4, recusa de loja sem vínculo,
 * sondagem com rollback e refresh de sessão. Sem chamadas novas à API além de um `router.refresh()`
 * por troca, para o servidor reavaliar a página com a loja nova.
 */
import { useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Check, ChevronsUpDown, Store } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { opsKeyForLoja, useLojaAtiva } from "@/lib/loja-ativa"
import {
  canUseStoreSwitcher,
  countPendingSyncInOpsBlob,
  isStoreSwitchBlockedPath,
  switchableStores,
} from "@/lib/auth/store-switcher-policy"
import { cn } from "@/lib/utils"

const BLOCKED_HINT = "Saia do PDV para trocar de loja"

function storeLabel(loja: { id: string; nomeFantasia?: string } | null | undefined): string {
  return (loja?.nomeFantasia || "").trim() || loja?.id || "Loja"
}

function readPendingCount(storeId: string | null): number {
  if (!storeId || typeof window === "undefined") return 0
  try {
    return countPendingSyncInOpsBlob(window.localStorage.getItem(opsKeyForLoja(storeId)))
  } catch {
    return 0
  }
}

export function StoreSwitcher({
  fallback,
  variant = "sidebar",
  onSwitched,
}: {
  /** Conteúdo mostrado quando o usuário não pode trocar de loja (comportamento anterior). */
  fallback: React.ReactNode
  variant?: "sidebar" | "sheet"
  onSwitched?: () => void
}) {
  const { data: session } = useSession()
  const { lojas, lojaAtivaId, lojaAtivaRaw, setLojaAtivaId, storesLoaded } = useLojaAtiva()
  const pathname = usePathname()
  const router = useRouter()
  const [confirm, setConfirm] = useState<{ target: string; pending: number } | null>(null)

  const options = useMemo(() => switchableStores(session ?? null, lojas), [session, lojas])
  const enabled = storesLoaded && canUseStoreSwitcher(session ?? null, lojas)
  const blocked = isStoreSwitchBlockedPath(pathname)

  if (!enabled) return <>{fallback}</>

  const doSwitch = (target: string) => {
    // Só lojas da lista autorizada; `setLojaAtivaId` revalida com `canAccessStore`.
    if (!options.some((l) => l.id === target) || target === lojaAtivaId) return
    // O servidor só reavalia a página DEPOIS que a sondagem confirma a loja nova. Troca revertida
    // (unidade indisponível), barrada pela guarda da V4 ou superada não dispara refresh: a página
    // nunca chega a renderizar dados da loja que não ficou ativa.
    setLojaAtivaId(target, {
      onSettled: (ok) => {
        if (!ok) return
        router.refresh()
        onSwitched?.()
      },
    })
  }

  const request = (target: string) => {
    if (blocked) return
    const pending = readPendingCount(lojaAtivaId)
    if (pending > 0) setConfirm({ target, pending })
    else doSwitch(target)
  }

  const current = storeLabel(lojaAtivaRaw)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={blocked}
          title={blocked ? BLOCKED_HINT : "Trocar de loja"}
          aria-label={`Loja ativa: ${current}. ${blocked ? BLOCKED_HINT : "Trocar de loja"}`}
          className={cn(
            "group flex w-full min-w-0 items-center gap-1 rounded-md text-left transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70",
            variant === "sidebar"
              ? "-mx-1 mt-0.5 px-1 py-0.5 text-[10.5px] font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
              : "border border-border bg-panel px-2.5 py-2 text-[12.5px] text-foreground hover:bg-muted/60",
          )}
        >
          {variant === "sheet" ? <Store className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} /> : null}
          <span className="min-w-0 flex-1 truncate">{current}</span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-60" strokeWidth={2} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60 rounded-xl border-border/90 p-1.5 shadow-lg">
          <DropdownMenuLabel className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Trocar de loja
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {options.map((loja) => {
            const active = loja.id === lojaAtivaId
            return (
              <DropdownMenuItem
                key={loja.id}
                disabled={active}
                onSelect={() => request(loja.id)}
                className="min-w-0 cursor-pointer gap-2 text-[12.5px]"
              >
                <Check className={cn("h-3.5 w-3.5 shrink-0", active ? "opacity-100 text-primary" : "opacity-0")} />
                <span className="min-w-0 flex-1 truncate">{storeLabel(loja)}</span>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* No toque o `title` não aparece: o motivo do bloqueio fica escrito no menu do celular. */}
      {blocked && variant === "sheet" ? <p className="mt-1 text-[11px] text-muted-foreground">{BLOCKED_HINT}</p> : null}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Operações ainda não sincronizadas</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.pending === 1 ? "1 operação" : `${confirm?.pending ?? 0} operações`} de {current} (vendas,
              devoluções ou caixa) ainda não {confirm?.pending === 1 ? "foi enviada" : "foram enviadas"} ao servidor.
              {confirm?.pending === 1 ? " Ela continua guardada" : " Elas continuam guardadas"} neste aparelho e
              {confirm?.pending === 1 ? " é enviada" : " são enviadas"} quando você voltar para {current}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar em {current}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = confirm?.target
                setConfirm(null)
                if (target) doSwitch(target)
              }}
            >
              Trocar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
