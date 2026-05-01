"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

// TODO: substituir este conteúdo pelo código exportado do Lovable
export function LandingHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/70 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="font-display text-sm font-semibold tracking-tight text-foreground">
          OmniGestão Pro
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="text-xs font-medium text-muted-foreground hover:text-foreground">
            Entrar
          </Link>
          <Button size="sm" className="h-9 rounded-xl">
            Começar teste grátis
          </Button>
        </div>
      </div>
    </header>
  )
}

