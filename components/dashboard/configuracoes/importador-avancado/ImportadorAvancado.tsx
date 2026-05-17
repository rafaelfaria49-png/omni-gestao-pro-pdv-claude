"use client"

import { AlertCircle, Sparkles, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useImportadorAvancado } from "./hooks/use-importador-avancado"
import { LogAuditoria } from "./LogAuditoria"
import { PreviewCruzamento } from "./PreviewCruzamento"
import { UploadZone } from "./UploadZone"

/**
 * Importador Avançado — componente principal.
 *
 * Fluxo:
 *   idle → preview-loading → preview-ok → import-loading → import-ok
 *                                                  ↓
 *                                                erro (qualquer fase)
 *
 * Stateless do ponto de vista do pai: toda a engine vive no hook.
 * Renderiza UploadZone sempre; preview/log/erro aparecem conforme a fase.
 */

export function ImportadorAvancado() {
  const imp = useImportadorAvancado()
  const {
    estado,
    arquivos,
    totalArquivos,
    tamanhoTotalBytes,
    temLojaObrigatoria,
    adicionarArquivos,
    removerArquivo,
    limparArquivos,
    limparEstado,
    rodarPreview,
    rodarImport,
  } = imp

  const desabilitarUpload =
    estado.fase === "preview-loading" || estado.fase === "import-loading"

  const podePreVisualizar = totalArquivos > 0 && temLojaObrigatoria && !desabilitarUpload

  return (
    <div className="space-y-6">
      {/* Cabeçalho do bloco */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card">
          <Wand2 className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Importação cruzada de múltiplas planilhas</p>
          <p className="text-xs text-muted-foreground">
            Envie vários arquivos ao mesmo tempo, inclusive ZIPs de exportação (GestaoClick). O sistema detecta
            automaticamente o domínio de cada planilha, mostra um preview do cruzamento e importa em um único lote
            com auditoria por domínio.
          </p>
        </div>
      </div>

      {/* Zona de upload + lista de arquivos selecionados */}
      <UploadZone
        arquivos={arquivos}
        totalArquivos={totalArquivos}
        tamanhoTotalBytes={tamanhoTotalBytes}
        temLojaObrigatoria={temLojaObrigatoria}
        desabilitado={desabilitarUpload}
        onAdicionar={adicionarArquivos}
        onRemover={removerArquivo}
        onLimpar={() => {
          limparArquivos()
          // Se tinha um preview/log em tela, devolve ao estado idle.
          if (estado.fase !== "idle") limparEstado()
        }}
      />

      {/* Ações primárias */}
      {totalArquivos > 0 && estado.fase !== "import-ok" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {estado.fase === "preview-ok"
              ? "Cruzamento detectado. Revise abaixo antes de importar."
              : "Pré-visualize antes de importar — o cruzamento mostra o que será criado, atualizado ou ignorado."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                limparArquivos()
                limparEstado()
              }}
              disabled={desabilitarUpload}
            >
              Descartar tudo
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void rodarPreview()}
              disabled={!podePreVisualizar}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              {estado.fase === "preview-loading" ? "Analisando…" : "Pré-visualizar cruzamento"}
            </Button>
          </div>
        </div>
      )}

      {/* Erro (qualquer fase) */}
      {estado.fase === "erro" && (
        <ErroBox
          mensagem={estado.mensagem}
          detalhe={estado.detalhe}
          onFechar={() => limparEstado()}
        />
      )}

      {/* Skeleton de loading do preview (UX premium) */}
      {estado.fase === "preview-loading" && <SkeletonPreview />}

      {/* Preview do cruzamento */}
      {estado.fase === "preview-ok" && (
        <PreviewCruzamento preview={estado.preview} importando={false} onImportar={() => void rodarImport()} />
      )}

      {/* Progresso do import */}
      {estado.fase === "import-loading" && (
        <BarraProgresso progresso={estado.progresso} mensagem={estado.mensagem} />
      )}

      {/* Log de auditoria pós-import */}
      {estado.fase === "import-ok" && (
        <LogAuditoria
          result={estado.result}
          onReiniciar={() => {
            limparArquivos()
            limparEstado()
          }}
        />
      )}
    </div>
  )
}

// ---------- Auxiliares de UI ----------

function ErroBox({
  mensagem,
  detalhe,
  onFechar,
}: {
  mensagem: string
  detalhe?: string
  onFechar: () => void
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-destructive">{mensagem}</p>
        {detalhe ? <p className="mt-1 text-xs text-destructive/80">{detalhe}</p> : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onFechar}
        className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        Fechar
      </Button>
    </div>
  )
}

function BarraProgresso({ progresso, mensagem }: { progresso: number; mensagem: string }) {
  const pct = Math.max(0, Math.min(100, progresso))
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{mensagem}</span>
        <span className="tabular-nums text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full bg-primary transition-all duration-300")}
          style={{ width: `${pct}%` }}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          role="progressbar"
        />
      </div>
    </div>
  )
}

function SkeletonPreview() {
  return (
    <div className="space-y-3" aria-busy aria-live="polite">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-card" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl border border-border bg-card" />
        ))}
      </div>
    </div>
  )
}
