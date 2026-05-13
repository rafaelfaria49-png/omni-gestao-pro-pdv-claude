"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ShieldOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { cn } from "@/lib/utils"

type EnterpriseAccessDeniedProps = {
  title?: string
  description?: string
  className?: string
}

/**
 * Estado premium “sem permissão” — reutilizável em páginas ou secções.
 * Não redireciona sozinho; oferece voltar + painel inicial.
 */
export function EnterpriseAccessDenied({
  title = "Você não possui permissão",
  description = "Seu perfil não inclui acesso a este recurso. Se precisar de acesso, fale com o administrador da unidade.",
  className,
}: EnterpriseAccessDeniedProps) {
  const router = useRouter()

  return (
    <Empty className={cn("min-h-[320px] border-border bg-card/40", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShieldOff className="text-muted-foreground" aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row flex-wrap justify-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => router.back()}>
          Voltar
        </Button>
        <Button type="button" size="sm" asChild>
          <Link href="/dashboard">Painel inicial</Link>
        </Button>
      </EmptyContent>
    </Empty>
  )
}
