"use client"

import * as React from "react"
import {
  Download,
  FileText,
  Loader2,
  Lock,
  Paperclip,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  ComprovanteUploadDraft,
  ConsultaFinanceiraSnapshot,
  DocumentoComprovante,
  OperacaoFeedback,
} from "@/lib/gestor-money/contracts"
import type { GestorMoneyGateway } from "@/lib/gestor-money/gateway"
import { formatarDataBR, formatarTamanhoArquivo } from "@/lib/gestor-money/money"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EmptyStateCard, ReceiptAttachmentInput, StatusPill } from "./shared"

export function ReceiptsView({
  snapshot,
  gateway,
  onMutationSuccess,
}: {
  snapshot: ConsultaFinanceiraSnapshot
  gateway: GestorMoneyGateway
  onMutationSuccess: (feedback: OperacaoFeedback) => Promise<void> | void
}) {
  const [draft, setDraft] = React.useState<ComprovanteUploadDraft | undefined>(undefined)
  const [alvoSelecao, setAlvoSelecao] = React.useState<string>("nenhum")
  const [uploading, setUploading] = React.useState(false)
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [downloadStatus, setDownloadStatus] = React.useState<string | null>(null)

  const diag = snapshot.storageDiagnostico
  const storageBloqueadoReal = gateway.mode === "real" && !(diag?.runtimeLiberado ?? false)

  const seletor =
    snapshot.perfil.tipo === "PESSOAL"
      ? ({ tipo: "PESSOAL", perfilId: snapshot.perfil.perfilId } as const)
      : ({ tipo: "EMPRESA", perfilId: snapshot.perfil.perfilId, storeId: snapshot.perfil.storeId } as const)

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft?.conteudoBase64) {
      setError("Selecione um arquivo válido (PDF, PNG, JPG ou TXT até 10 MB) para enviar.")
      return
    }
    setError(null)
    setDownloadStatus(null)
    setUploading(true)
    try {
      let alvo: { tipo: "PAGAR" | "RECEBER" | "CONTA" | "MOVIMENTACAO"; id: string } | undefined
      if (alvoSelecao !== "nenhum") {
        const [tipo, ...rest] = alvoSelecao.split(":")
        const id = rest.join(":")
        if (id && (tipo === "CONTA" || tipo === "PAGAR" || tipo === "MOVIMENTACAO")) {
          alvo = { tipo, id }
        }
      }
      const doc = await gateway.enviarComprovante(seletor, {
        nomeArquivo: draft.nomeArquivo,
        conteudoBase64: draft.conteudoBase64,
        ...(alvo ? { alvo } : {}),
      })
      setDraft(undefined)
      setAlvoSelecao("nenhum")
      await onMutationSuccess({
        ok: true,
        operacaoId: doc.id,
        contratoG004: "G003_DOCUMENTO_REGISTRAR",
        mensagem: `Comprovante "${doc.nomeArquivo}" armazenado com integridade SHA-256 verificada (G003).`,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o comprovante.")
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = async (doc: DocumentoComprovante) => {
    setError(null)
    setDownloadStatus(null)
    setDownloadingId(doc.id)
    try {
      const res = await gateway.obterDownloadComprovante(seletor, doc.id)
      setDownloadStatus(
        `Link temporário autenticado emitido para "${res.documento.nomeArquivo}" (expira em ${res.expiresInSec}s · Cache-Control privado).`
      )
      if (typeof window !== "undefined" && res.signedUrl) {
        const anchor = document.createElement("a")
        anchor.href = res.signedUrl
        anchor.download = res.documento.nomeArquivo
        anchor.rel = "noopener noreferrer"
        anchor.target = "_blank"
        anchor.click()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download bloqueado ou indisponível.")
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="space-y-6" data-testid="gestor-money-comprovantes">
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">Comprovantes privados</h2>
        <p className="text-xs text-muted-foreground">
          Contrato canônico G003 + Gate G003-STORAGE · Namespace isolado por perfil, verificação SHA-256 e download assinado &le; 60s
        </p>
      </div>

      {/* Honest G003-STORAGE Availability Card */}
      <div
        data-testid="storage-g003-status-card"
        className={cn(
          "rounded-2xl border bg-card p-5 shadow-sm",
          gateway.mode === "real" && !storageBloqueadoReal
            ? "border-emerald-500/35"
            : "border-amber-500/35"
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                gateway.mode === "real" && !storageBloqueadoReal
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              )}
            >
              {gateway.mode === "real" && !storageBloqueadoReal ? (
                <ShieldCheck className="h-5 w-5" />
              ) : (
                <ShieldAlert className="h-5 w-5" />
              )}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-sm font-semibold text-foreground">
                  Status do Storage Privado · Gate G003-STORAGE
                </h3>
                <span
                  data-testid="storage-g003-status-badge"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold",
                    gateway.mode === "synthetic"
                      ? "border-amber-500/30 bg-amber-500/12 text-amber-700 dark:text-amber-300"
                      : storageBloqueadoReal
                        ? "border-rose-500/30 bg-rose-500/12 text-rose-700 dark:text-rose-300"
                        : "border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                  )}
                >
                  {storageBloqueadoReal && <Lock className="h-3 w-3" />}
                  {gateway.mode === "synthetic"
                    ? "SANDBOX EM MEMÓRIA"
                    : storageBloqueadoReal
                      ? `BLOQUEADO · ${diag?.bloqueioCodigo ?? "privacidade_bucket_nao_comprovada"}`
                      : "R2 PRIVADO VERIFICADO"}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {diag?.motivo ??
                  "Upload e download permanecem bloqueados (fail-closed) até comprovação real da privacidade do bucket R2."}
              </p>
              {diag && (
                <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-muted-foreground">
                  <span>
                    Flag G003-STORAGE: <strong>{diag.flagHabilitada ? "Ativa" : "Desligada"}</strong>
                  </span>
                  <span>
                    Provider R2: <strong>{diag.providerDeclaradoValido ? "Declarado" : "Ausente"}</strong>
                  </span>
                  <span>
                    Privacidade real comprovada:{" "}
                    <strong>{diag.privacidadeComprovadaNoRuntime ? "Sim" : "Não"}</strong>
                  </span>
                </div>
              )}
              {storageBloqueadoReal && diag && diag.variaveisFaltando.length > 0 && (
                <p className="pt-1 font-mono text-[10px] text-muted-foreground">
                  Variáveis pendentes (somente nomes): {diag.variaveisFaltando.join(", ")}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Authenticated Upload Box */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm" data-testid="receipts-upload-card">
        <div className="mb-3 flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" />
          <h3 className="font-display text-sm font-semibold text-foreground">
            Enviar comprovante autenticado (G003)
          </h3>
        </div>
        <form onSubmit={handleUpload} className="space-y-3.5">
          <ReceiptAttachmentInput
            value={draft}
            onChange={setDraft}
            disabled={uploading || storageBloqueadoReal}
            storageDiagnostico={diag}
            mode={gateway.mode}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Vincular a registro do perfil (opcional)</Label>
              <Select
                value={alvoSelecao}
                onValueChange={setAlvoSelecao}
                disabled={uploading || storageBloqueadoReal}
              >
                <SelectTrigger className="rounded-xl text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Sem vínculo imediato (disponível no cofre)</SelectItem>
                  {snapshot.contas
                    .filter((c) => c.ativo)
                    .map((c) => (
                      <SelectItem key={`CONTA:${c.id}`} value={`CONTA:${c.id}`}>
                        Conta · {c.nome}
                      </SelectItem>
                    ))}
                  {snapshot.pagar.slice(0, 10).map((t) => (
                    <SelectItem key={`PAGAR:${t.id}`} value={`PAGAR:${t.id}`}>
                      A Pagar · {t.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end justify-end">
              <Button
                type="submit"
                size="sm"
                className="w-full rounded-xl text-xs sm:w-auto"
                disabled={uploading || storageBloqueadoReal || !draft?.conteudoBase64}
                data-testid="btn-upload-comprovante"
              >
                {uploading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : storageBloqueadoReal ? (
                  <Lock className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                )}
                {storageBloqueadoReal ? "Upload bloqueado (G003-STORAGE)" : "Enviar comprovante"}
              </Button>
            </div>
          </div>
        </form>
      </div>

      {downloadStatus && (
        <div
          role="status"
          data-testid="receipt-download-status"
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-700 dark:text-emerald-300"
        >
          {downloadStatus}
        </div>
      )}

      {error && (
        <div
          role="alert"
          data-testid="receipt-error-alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {/* Private Receipts List */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm" data-testid="receipts-list">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-semibold text-foreground">
              Documentos do perfil ({snapshot.documentos.length})
            </h3>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Isolamento estrito {snapshot.perfil.tipo} · RLS ativo
          </span>
        </div>

        {snapshot.documentos.length === 0 ? (
          <EmptyStateCard
            icon={<FileText className="h-5 w-5" />}
            title="Nenhum comprovante registrado"
            description={
              storageBloqueadoReal
                ? "O envio de novos comprovantes permanece bloqueado até a comprovação real de privacidade do Cloudflare R2 (G003-STORAGE)."
                : "Envie um comprovante acima ou anexe durante um lançamento para mantê-lo protegido neste perfil."
            }
          />
        ) : (
          <div className="space-y-2.5">
            {snapshot.documentos.map((doc) => {
              const emQuarentena = doc.estado === "QUARENTENA"
              const bloqueado = emQuarentena || storageBloqueadoReal
              return (
                <div
                  key={doc.id}
                  data-testid={`receipt-row-${doc.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/20 px-4 py-3 text-xs"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold text-foreground">{doc.nomeArquivo}</p>
                      <StatusPill status={doc.estado} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {doc.mime} · {formatarTamanhoArquivo(doc.bytes)} · Enviado em{" "}
                      {formatarDataBR(doc.criadoEm)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl text-xs"
                    disabled={bloqueado || downloadingId === doc.id}
                    data-testid={`download-receipt-${doc.id}`}
                    onClick={() => void handleDownload(doc)}
                  >
                    {downloadingId === doc.id ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : bloqueado ? (
                      <Lock className="mr-1.5 h-3.5 w-3.5" />
                    ) : (
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {emQuarentena
                      ? "Em quarentena"
                      : storageBloqueadoReal
                        ? "Download bloqueado"
                        : "Baixar (60s)"}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
