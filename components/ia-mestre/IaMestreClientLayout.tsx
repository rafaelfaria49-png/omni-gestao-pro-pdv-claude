"use client"

import { ThemeProvider } from "@/components/ia-mestre/ThemeProvider"
import { Sidebar } from "@/components/ia-mestre/Sidebar"
import { IaMestreChatProvider } from "@/components/ia-mestre/IaMestreChatContext"

export function IaMestreClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <IaMestreChatProvider>
        <div className="relative flex h-full w-full overflow-hidden overflow-x-hidden bg-background text-foreground">
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute -top-32 left-1/3 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-gradient-primary opacity-[0.12] blur-3xl" />
            <div
              className="absolute -bottom-40 right-0 h-[420px] w-[420px] rounded-full opacity-20 blur-3xl"
              style={{ background: "var(--color-primary-glow)" }}
            />
          </div>
          <Sidebar />
          {children}
        </div>
      </IaMestreChatProvider>
    </ThemeProvider>
  )
}
