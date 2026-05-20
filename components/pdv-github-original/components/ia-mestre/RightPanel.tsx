"use client"

import { motion } from "framer-motion"
import { Copy, Download, FileText, Sparkles } from "lucide-react"

export function RightPanel() {
  return (
    <aside className="flex h-full w-[350px] flex-none flex-col border-l border-border bg-panel/80 backdrop-blur-xl">
      <header className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
          </span>
          <div className="leading-tight">
            <h2 className="text-sm font-semibold">Editor de Documentos</h2>
            <p className="text-[10px] text-muted-foreground">Saída em tempo real</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface/60 px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground"
            type="button"
          >
            <Copy className="h-3 w-3" />
            <span className="hidden xl:inline">Copiar</span>
          </button>
          <button
            className="inline-flex items-center gap-1 rounded-lg bg-gradient-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-elegant transition hover:opacity-90"
            type="button"
          >
            <Download className="h-3 w-3" />
            <span className="hidden xl:inline">Exportar</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <div className="absolute inset-0 -z-10 rounded-full bg-gradient-primary opacity-20 blur-3xl" />
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-border bg-card shadow-elegant">
            <FileText className="h-10 w-10 text-muted-foreground" strokeWidth={1.4} />
          </div>
        </motion.div>
        <h3 className="mt-6 font-display text-base font-bold">Nenhum documento aberto</h3>
        <p className="mt-2 max-w-[240px] text-xs leading-relaxed text-muted-foreground">
          Quando a IA gerar um relatório, contrato ou roteiro, ele vai aparecer aqui pronto pra editar e exportar.
        </p>
        <button className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/60 px-3.5 py-2 text-xs font-medium text-foreground transition hover:border-primary/40 hover:shadow-elegant" type="button">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Gerar com a IA Mestre
        </button>
      </div>

      <div className="border-t border-border/60 px-5 py-3 text-[10px] text-muted-foreground">
        Dica: peça <span className="font-semibold text-foreground">"escreva um contrato"</span> no chat.
      </div>
    </aside>
  )
}

