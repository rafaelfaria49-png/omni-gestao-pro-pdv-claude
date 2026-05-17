"use client"

import { useCallback, useRef, useState } from "react"
import { FileArchive, FileSpreadsheet, FileText, UploadCloud, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Zona de upload do Importador Avançado.
 *
 * - drag & drop multi-arquivo
 * - clique para abrir o file picker
 * - aceita: .xlsx, .xls, .csv, .tsv, .ods, .zip (GestaoClick)
 * - mostra lista de arquivos com tamanho formatado e botão remover
 * - bloqueia se loja não estiver selecionada
 * - todos os estilos via tokens semânticos (compatível com 4 temas)
 */

const ACCEPT = ".xlsx,.xls,.csv,.tsv,.ods,.zip"

const ACCEPT_HUMAN_READABLE = "XLSX, XLS, CSV, TSV, ODS ou ZIP"

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

function iconeArquivo(nome: string) {
  const lower = nome.toLowerCase()
  if (lower.endsWith(".zip")) return <FileArchive className="h-4 w-4 text-primary" />
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) return <FileText className="h-4 w-4 text-primary" />
  return <FileSpreadsheet className="h-4 w-4 text-primary" />
}

export type UploadZoneProps = {
  arquivos: File[]
  totalArquivos: number
  tamanhoTotalBytes: number
  temLojaObrigatoria: boolean
  /** Verdadeiro durante preview-loading ou import-loading. */
  desabilitado?: boolean
  onAdicionar: (files: FileList | File[]) => void
  onRemover: (nome: string) => void
  onLimpar: () => void
}

export function UploadZone({
  arquivos,
  totalArquivos,
  tamanhoTotalBytes,
  temLojaObrigatoria,
  desabilitado = false,
  onAdicionar,
  onRemover,
  onLimpar,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)

  const bloqueado = !temLojaObrigatoria || desabilitado

  const handleSelect = useCallback(() => {
    if (bloqueado) return
    inputRef.current?.click()
  }, [bloqueado])

  const handleDragEnter = useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
      if (bloqueado) return
      e.preventDefault()
      e.stopPropagation()
      setIsDragActive(true)
    },
    [bloqueado],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
      if (bloqueado) return
      e.preventDefault()
      e.stopPropagation()
      setIsDragActive(true)
    },
    [bloqueado],
  )

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
      if (bloqueado) return
      e.preventDefault()
      e.stopPropagation()
      setIsDragActive(false)
    },
    [bloqueado],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
      if (bloqueado) return
      e.preventDefault()
      e.stopPropagation()
      setIsDragActive(false)
      const dropped = e.dataTransfer?.files
      if (dropped && dropped.length > 0) {
        onAdicionar(dropped)
      }
    },
    [bloqueado, onAdicionar],
  )

  return (
    <div className="space-y-3">
      {!temLojaObrigatoria && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          Selecione a <strong className="font-medium">unidade (loja) ativa</strong> no cabeçalho do sistema antes de
          enviar arquivos. A importação exige o vínculo com a loja para gravar no banco com segurança.
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={ACCEPT}
        multiple
        disabled={bloqueado}
        onChange={(e) => {
          const files = e.target.files
          if (files && files.length > 0) {
            onAdicionar(files)
          }
          e.currentTarget.value = ""
        }}
      />

      <button
        type="button"
        disabled={bloqueado}
        onClick={handleSelect}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "w-full rounded-xl border border-dashed px-4 py-6 text-left transition-colors",
          "bg-background/40 hover:bg-background/60",
          isDragActive ? "border-primary bg-primary/5" : "border-border",
          bloqueado ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        )}
        aria-label="Área de upload — arraste arquivos ou clique para selecionar"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary">
            <UploadCloud className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {isDragActive ? "Solte os arquivos aqui" : "Arraste arquivos ou clique para selecionar"}
            </p>
            <p className="text-xs text-muted-foreground">
              Aceita {ACCEPT_HUMAN_READABLE}. Pode enviar vários ao mesmo tempo — inclusive ZIP do GestaoClick.
            </p>
          </div>
        </div>
      </button>

      {totalArquivos > 0 && (
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {totalArquivos} arquivo{totalArquivos === 1 ? "" : "s"} selecionado
                {totalArquivos === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-muted-foreground">Total: {formatBytes(tamanhoTotalBytes)}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onLimpar}
              disabled={desabilitado}
              className="text-muted-foreground hover:text-foreground"
            >
              Limpar lista
            </Button>
          </div>
          <ul className="divide-y divide-border">
            {arquivos.map((file) => (
              <li key={`${file.name}-${file.size}`} className="flex items-center gap-3 px-3 py-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary/50">
                  {iconeArquivo(file.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemover(file.name)}
                  disabled={desabilitado}
                  aria-label={`Remover ${file.name}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
