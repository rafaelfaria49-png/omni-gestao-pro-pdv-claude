"use client"

import * as Switch from "@radix-ui/react-switch"
import { Store } from "lucide-react"

export function IdentitySwitch({
  checked,
  onCheckedChange,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <label className="inline-flex items-center gap-2.5 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-sm backdrop-blur-md transition hover:border-primary/40">
      <Store className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="hidden font-medium md:inline">Identidade da Loja</span>
      <span className="md:hidden font-medium">Loja</span>
      <Switch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative h-5 w-9 cursor-pointer rounded-full bg-muted transition data-[state=checked]:bg-gradient-primary"
      >
        <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-background shadow-elegant transition-transform duration-200 data-[state=checked]:translate-x-[18px]" />
      </Switch.Root>
    </label>
  )
}

