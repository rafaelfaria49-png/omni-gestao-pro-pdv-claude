"use client"

import * as React from "react"
import {
  Briefcase,
  Car,
  Droplets,
  FileText,
  GraduationCap,
  HeartPulse,
  Home,
  Package,
  Paperclip,
  ShoppingCart,
  Sparkles,
  Store,
  Tag,
  TrendingUp,
  Upload,
  Users,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  X,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DOCUMENTO_MAX_BYTES,
  DOCUMENTO_MIME_PERMITIDOS,
  type ComprovanteUploadDraft,
  type StorageComprovantesDiagnostico,
} from "@/lib/gestor-money/contracts"
import { formatarTamanhoArquivo } from "@/lib/gestor-money/money"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  ShoppingCart,
  Utensils,
  Home,
  Zap,
  Droplets,
  Wifi,
  Car,
  HeartPulse,
  Sparkles,
  Package,
  GraduationCap,
  Wallet,
  TrendingUp,
  Briefcase,
  Users,
  FileText,
  Store,
  Wrench,
  Tag,
}

export function CategoryIcon({
  name,
  className = "h-4 w-4",
}: {
  name?: string | null
  className?: string
}) {
  const Icon = (name && ICON_MAP[name]) || Tag
  return <Icon className={className} />
}

export function StatusPill({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  const styles: Record<string, string> = {
    aberto: "bg-sky-500/12 text-sky-600 dark:text-sky-300 border-sky-500/25",
    aberta: "bg-sky-500/12 text-sky-600 dark:text-sky-300 border-sky-500/25",
    parcial: "bg-amber-500/12 text-amber-600 dark:text-amber-300 border-amber-500/25",
    fechada: "bg-violet-500/12 text-violet-600 dark:text-violet-300 border-violet-500/25",
    futura: "bg-muted text-muted-foreground border-border",
    pago: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 border-emerald-500/25",
    paga: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 border-emerald-500/25",
    quitada: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 border-emerald-500/25",
    vencido: "bg-rose-500/12 text-rose-600 dark:text-rose-300 border-rose-500/25",
    vencida: "bg-rose-500/12 text-rose-600 dark:text-rose-300 border-rose-500/25",
    cancelado: "bg-muted text-muted-foreground border-border",
    DISPONIVEL: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 border-emerald-500/25",
    RETIDO: "bg-sky-500/12 text-sky-600 dark:text-sky-300 border-sky-500/25",
    QUARENTENA: "bg-rose-500/12 text-rose-600 dark:text-rose-300 border-rose-500/25",
  }
  const labels: Record<string, string> = {
    aberto: "Em aberto",
    aberta: "Aberta",
    parcial: "Parcial",
    fechada: "Fechada",
    futura: "Futura",
    pago: "Pago",
    paga: "Paga",
    quitada: "Quitada",
    vencido: "Vencido",
    vencida: "Vencida",
    cancelado: "Cancelado",
    DISPONIVEL: "Disponível",
    RETIDO: "Retido",
    QUARENTENA: "Quarentena",
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-tight",
        styles[status] ?? "bg-muted text-muted-foreground border-border",
        className
      )}
    >
      {labels[status] ?? status}
    </span>
  )
}

export function EmptyStateCard({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  disabledAction,
}: {
  icon: React.ReactNode
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  disabledAction?: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>
      {actionLabel && onAction && (
        <Button
          type="button"
          size="sm"
          onClick={onAction}
          disabled={disabledAction}
          className="mt-5 rounded-xl"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-label="Carregando dados financeiros">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-3 h-8 w-40" />
            <Skeleton className="mt-3 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="mt-4 h-64 w-full rounded-xl" />
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-4 h-64 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}

function bytesParaBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

export function ReceiptAttachmentInput({
  value,
  onChange,
  disabled,
  storageDiagnostico,
  mode,
}: {
  value: ComprovanteUploadDraft | undefined
  onChange: (draft: ComprovanteUploadDraft | undefined) => void
  disabled?: boolean
  storageDiagnostico?: StorageComprovantesDiagnostico
  mode?: "real" | "synthetic"
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [error, setError] = React.useState<string | null>(null)
  const bloqueadoPorStorage = mode === "real" && !(storageDiagnostico?.runtimeLiberado ?? false)
  const inputDisabled = Boolean(disabled || bloqueadoPorStorage)

  const handleFile = async (file: File | null | undefined) => {
    setError(null)
    if (!file) return
    const mimePermitido = DOCUMENTO_MIME_PERMITIDOS.find((m) => m === file.type)
    if (!mimePermitido) {
      setError("Formato não suportado (G003). Envie PDF, PNG, JPG ou TXT.")
      return
    }
    if (file.size <= 0 || file.size > DOCUMENTO_MAX_BYTES) {
      setError("Arquivo excede o limite máximo de 10 MB.")
      return
    }
    try {
      const buf = await file.arrayBuffer()
      onChange({
        nomeArquivo: file.name.replace(/[/\\]/g, "_"),
        mime: mimePermitido,
        bytes: file.size,
        conteudoBase64: bytesParaBase64(new Uint8Array(buf)),
      })
    } catch {
      setError("Não foi possível ler os bytes do arquivo selecionado.")
    }
  }

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.txt"
        className="hidden"
        disabled={inputDisabled}
        onChange={(e) => {
          void handleFile(e.target.files?.[0])
          e.target.value = ""
        }}
      />
      {bloqueadoPorStorage ? (
        <div
          data-testid="receipt-storage-blocked-notice"
          className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-[11px] text-amber-800 dark:text-amber-300"
        >
          <p className="font-semibold">
            Anexo indisponível · Gate G003-STORAGE ({storageDiagnostico?.bloqueioCodigo ?? "privacidade_bucket_nao_comprovada"})
          </p>
          <p className="mt-0.5 opacity-90">
            {storageDiagnostico?.motivo ??
              "Storage privado R2 bloqueado (fail-closed) até comprovação real da privacidade do bucket."}
          </p>
        </div>
      ) : value ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Paperclip className="h-4 w-4 shrink-0 text-emerald-500" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">{value.nomeArquivo}</p>
              <p className="text-[11px] text-muted-foreground">
                {value.mime} · {formatarTamanhoArquivo(value.bytes)} · Regra G003 válida
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => onChange(undefined)}
            aria-label="Remover comprovante"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={inputDisabled}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/60 hover:text-foreground",
            inputDisabled && "cursor-not-allowed opacity-50"
          )}
        >
          <Upload className="h-4 w-4" />
          <span>Anexar comprovante (PDF, PNG, JPG ou TXT · máx. 10 MB)</span>
        </button>
      )}
      {error && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  )
}
