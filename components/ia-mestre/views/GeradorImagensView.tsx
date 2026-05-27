"use client"

import { ImageIcon, MessageCircle, Sparkles } from "lucide-react"
import Link from "next/link"
import { IaMestreSubPageShell } from "@/components/ia-mestre/IaMestreSubPageShell"
import { IA_MESTRE_CREDITS_DEBIT_ACTIVE_NOTE } from "@/components/ia-mestre/ia-mestre-honesty"
import { Button } from "@/components/ui/button"

export function GeradorImagensView() {
  return (
    <IaMestreSubPageShell
      title="Gerador de Imagens"
      subtitle="Tela dedicada em preparação — geração real hoje pelo chat"
      badge={
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
          Em breve
        </span>
      }
    >
      <div className="mx-auto flex w-full max-w-lg flex-col items-center rounded-2xl border border-dashed border-border bg-muted/15 px-6 py-14 text-center">
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-border bg-muted/30">
          <ImageIcon className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="font-display text-lg font-semibold text-foreground">Em breve nesta tela</h2>
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          O formulário anterior era apenas demonstração (preview SVG no navegador). A geração real de imagens
          funciona hoje no <strong className="font-medium text-foreground">chat da IA Mestre</strong> quando você pede
          logo, banner, arte ou post — o servidor chama a API de imagem (Marketing).
        </p>
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">{IA_MESTRE_CREDITS_DEBIT_ACTIVE_NOTE}</p>
        <Button type="button" className="mt-6 h-10 gap-2 rounded-xl px-6" asChild>
          <Link href="/dashboard/ia-mestre">
            <MessageCircle className="h-4 w-4" />
            Ir para o chat
          </Link>
        </Button>
        <p className="mt-4 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          Ex.: &quot;Crie um banner quadrado para promoção de smartphones&quot;
        </p>
      </div>
    </IaMestreSubPageShell>
  )
}
