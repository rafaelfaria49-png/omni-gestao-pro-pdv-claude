"use client"

import { useCallback, useRef, useState } from "react"
import { FileSpreadsheet, UploadCloud, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const ACCEPT = ".xlsx,.xls,.xlsm,.ods,.csv,.tsv"
const ACCEPT_HUMAN = "XLS, XLSX, ODS, CSV ou TSV"

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

export type UploadProdutosProps = {
  arquivo: File | null
  temLojaObrigatoria: boolean
  desabilitado?: boolean
  onSelecionar: (f: File | null) => void
}

export function UploadProdutos({
  arquivo,
  temLojaObrigatoria,
  desabilitado = false,
  onSelecionar,
}: UploadProdutosProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const bloqueado = !temLojaObrigatoria || desabilitado

  const handleSelect = useCallback(() => {
    if (bloqueado) return
    inputRef.current?.click()
  }, [bloqueado])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
      if (bloqueado) return
      e.preventDefault()
      e.stopPropagation()
      setIsDragActive(false)
      const dropped = e.dataTransfer?.files
      if (dropped && dropped.length > 0) {
        onSelecionar(dropped[0] ?? null)
      }
    },
    [bloqueado, onSelecionar],
  )

  return (
    <div className="space-y-3">
      {!temLojaObrigatoria && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          Selecione a <strong className="font-medium">unidade (loja) ativa</strong> no cabeçalho do sistema antes de
          enviar a planilha. A importação grava no banco apenas com loja explícita.
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={ACCEPT}
        disabled={bloqueado}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          if (f) onSelecionar(f)
          e.currentTarget.value = ""
        }}
      />

      <button
        type="button"
        disabled={bloqueado}
        onClick={handleSelect}
        onDragEnter={(e) => {
          if (bloqueado) return
          e.preventDefault()
          e.stopPropagation()
          setIsDragActive(true)
        }}
        onDragOver={(e) => {
          if (bloqueado) return
          e.preventDefault()
          e.stopPropagation()
          setIsDragActive(true)
        }}
        onDragLeave={(e) => {
          if (bloqueado) return
          e.preventDefault()
          e.stopPropagation()
          setIsDragActive(false)
        }}
        onDrop={handleDrop}
        className={cn(
          "w-full rounded-xl border border-dashed px-4 py-6 text-left transition-colors",
          "bg-background/40 hover:bg-background/60",
          isDragActive ? "border-primary bg-primary/5" : "border-border",
          bloqueado ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        )}
        aria-label="Área de upload — arraste a planilha ou clique para selecionar"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary">
            <UploadCloud className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {isDragActive
                ? "Solte o arquivo aqui"
                : "Arraste a planilha ou clique para selecionar"}
            </p>
            <p className="text-xs text-muted-foreground">
              Aceita {ACCEPT_HUMAN}. Um arquivo por vez — pensado para planilhas grandes
              (relatórios legados, milhares de itens).
            </p>
          </div>
        </div>
      </button>

      {arquivo && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary/50">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground" title={arquivo.name}>
              {arquivo.name}
            </p>
            <p className="text-xs text-muted-foreground">{formatBytes(arquivo.size)}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => onSelecionar(null)}
            disabled={desabilitado}
            aria-label={`Remover ${arquivo.name}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
