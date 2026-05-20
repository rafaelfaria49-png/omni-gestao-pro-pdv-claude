"use client"

import { useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { CreditsHistory } from "@/components/credits/CreditsHistory"
import { CreditPurchasesHistory } from "@/components/credits/CreditPurchasesHistory"
import { notifyCreditBalanceUpdated } from "@/lib/creditsEvents"

type CreditPack = {
  id: "credits_500" | "credits_1000" | "credits_2000"
  title: string
  credits: number
  price: string
  highlight?: boolean
}

const PACKS: CreditPack[] = [
  { id: "credits_500", title: "500 créditos", credits: 500, price: "R$ 29,90" },
  { id: "credits_1000", title: "1000 créditos", credits: 1000, price: "R$ 49,90", highlight: true },
  { id: "credits_2000", title: "2000 créditos", credits: 2000, price: "R$ 89,90" },
]

export default function CreditosPage() {
  const { toast } = useToast()
  const [buying, setBuying] = useState<null | CreditPack["id"]>(null)

  const handleBuy = async (packageId: CreditPack["id"]) => {
    if (buying) return
    setBuying(packageId)
    try {
      const res = await fetch("/api/credits/purchase", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean
        creditsAdded?: number
        newBalance?: number
        error?: string
        message?: string
      }
      if (res.status === 403) {
        toast({
          title: "Pagamento em breve",
          description: "Compra de créditos ainda não está disponível em produção.",
        })
        return
      }
      if (!res.ok || !data?.success) throw new Error(String(data.error || `HTTP ${res.status}`))
      toast({
        title: "Créditos adicionados",
        description: `+${Number(data.creditsAdded ?? 0).toLocaleString("pt-BR")} créditos. Saldo: ${Number(
          data.newBalance ?? 0
        ).toLocaleString("pt-BR")}.`,
      })
      notifyCreditBalanceUpdated()
    } catch (e) {
      toast({
        title: "Falha na compra",
        description: e instanceof Error ? e.message : "Erro inesperado",
        variant: "destructive",
      })
    } finally {
      setBuying(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Comprar Créditos</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Adicione créditos extras para usar imagem, voz, vídeo e avatar sem interromper seu fluxo.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PACKS.map((p) => (
          <div
            key={p.id}
            className={cn(
              "relative overflow-hidden rounded-2xl border border-border bg-background/70 p-5 shadow-card backdrop-blur",
              p.highlight ? "ring-1 ring-primary/30" : ""
            )}
          >
            {p.highlight ? (
              <div className="absolute right-4 top-4 inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                Mais escolhido
              </div>
            ) : null}

            <div className="text-sm font-medium text-muted-foreground">{p.title}</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight">{p.credits.toLocaleString("pt-BR")}</div>
            <div className="mt-1 text-sm text-muted-foreground">créditos</div>

            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Valor</div>
                <div className="text-lg font-semibold">{p.price}</div>
              </div>
            </div>

            <div className="mt-5">
              <Button
                onClick={() => void handleBuy(p.id)}
                disabled={buying !== null}
                className={cn(
                  "w-full rounded-xl",
                  p.highlight ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""
                )}
                variant={p.highlight ? "default" : "outline"}
              >
                {buying === p.id ? "Processando..." : "Comprar créditos"}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <CreditPurchasesHistory />
      <CreditsHistory />
    </div>
  )
}

